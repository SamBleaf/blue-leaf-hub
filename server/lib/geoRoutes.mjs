/**
 * geoRoutes.mjs — Tiered backfill endpoint for geocoding jobs + leads.
 *
 * Route:
 *   POST /api/geo/backfill
 *     body: { dryRun?: boolean (default true), scope?: "all"|"jobs"|"leads", limit?: number (default 100) }
 *
 * Tiered rule (matches on-save hooks in salesRoutes + jobsApiRoutes):
 *   - Jobs                          → full address precision
 *   - Leads at qualify or later     → full address precision
 *   - Leads at enquiry/nurture/lost → suburb precision
 *
 * SAFETY:
 *   - dryRun=true (default): zero writes, zero geocode API calls.
 *     Returns { dryRun:true, wouldGeocode:N, plan:[{ table, id, precision, query }] }.
 *   - dryRun=false: sequential loop, per-row geocodeToFacts, per-row try/catch.
 *     Returns { processed, failed, errors:[] }.
 *   - Rows with no usable address/suburb are skipped (never error).
 *   - Admin-only. apiResponse law.
 */

import { getServiceSupabase } from "./supabaseService.mjs";
import { ok, err } from "./apiResponse.mjs";
import { geocodeToFacts } from "./geocodeService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import { normaliseAddress } from "./addressNormalise.mjs";

// Stages at or beyond qualify — these justify a full address geocode on leads.
const QUALIFY_PLUS_STAGES = new Set([
  "qualify",
  "discovery",
  "winning_offer",
  "fee_proposal",
  "accepted",
  "tender",
  "won",
]);

/**
 * Pick geocode precision for a lead row.
 * @param {{ stage?: string }} lead
 * @returns {"address"|"suburb"}
 */
function leadPrecision(lead) {
  return QUALIFY_PLUS_STAGES.has(lead.stage) ? "address" : "suburb";
}

/**
 * Pick the best query string for a lead at a given precision.
 * Returns null if there is nothing usable to geocode.
 * @param {{ site_address?: string|null, suburb?: string|null }} lead
 * @param {"address"|"suburb"} precision
 * @returns {string|null}
 */
function leadQuery(lead, precision) {
  if (precision === "address") {
    const addr = String(lead.site_address || "").trim();
    if (addr) return addr;
    // Fall back to suburb if no address — still useful for map placement.
    const sub = String(lead.suburb || "").trim();
    return sub || null;
  }
  // suburb precision
  const sub = String(lead.suburb || "").trim();
  if (sub) return sub;
  // Fall back to site_address if no suburb.
  const addr = String(lead.site_address || "").trim();
  return addr || null;
}

export function registerGeoRoutes(app) {
  app.post("/api/geo/backfill", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "DB not configured");

    const body = req.body || {};
    const dryRun = body.dryRun !== false; // default true
    const scope  = ["all", "jobs", "leads"].includes(body.scope) ? body.scope : "all";
    const limit  = Math.min(Math.max(Number(body.limit) || 100, 1), 500);

    try {
      // ── 1. Collect candidate rows ──────────────────────────────────────────────

      const candidates = []; // [{ table, id, precision, query }]

      // Jobs — always full address precision
      if (scope === "all" || scope === "jobs") {
        const { data: jobs, error: jErr } = await sb
          .from("jobs")
          .select("id, address, address_suburb")
          .is("geo_geocoded_at", null)
          .limit(limit);
        if (jErr) return err(res, 500, "Failed to query jobs: " + jErr.message);
        for (const job of jobs || []) {
          const rawAddr = String(job.address || "").trim();
          if (!rawAddr) continue; // no address to geocode
          candidates.push({ table: "jobs", id: job.id, precision: "address", query: rawAddr });
        }
      }

      // Leads — tiered precision
      if (scope === "all" || scope === "leads") {
        // Apply the job limit minus what we already have (or the full limit if jobs-only was not fetched).
        const leadsLimit = scope === "all"
          ? Math.max(limit - candidates.length, 1)
          : limit;
        const { data: leads, error: lErr } = await sb
          .from("leads")
          .select("id, stage, site_address, suburb")
          .is("geo_geocoded_at", null)
          .limit(leadsLimit);
        if (lErr) return err(res, 500, "Failed to query leads: " + lErr.message);
        for (const lead of leads || []) {
          const precision = leadPrecision(lead);
          const query = leadQuery(lead, precision);
          if (!query) continue; // no usable location data
          candidates.push({ table: "leads", id: lead.id, precision, query });
        }
      }

      // ── 2. Dry-run: return plan, zero writes ───────────────────────────────────

      if (dryRun) {
        return ok(res, {
          dryRun: true,
          wouldGeocode: candidates.length,
          plan: candidates,
        });
      }

      // ── 3. Live run: sequential loop with per-row fail-soft ───────────────────

      let processed = 0;
      let failed = 0;
      const errors = [];

      for (const row of candidates) {
        try {
          const success = await geocodeToFacts(row.table, row.id, row.query, row.precision);
          if (success) {
            processed++;
          } else {
            failed++;
            errors.push({ table: row.table, id: row.id, reason: "geocodeToFacts returned false" });
          }
        } catch (rowErr) {
          failed++;
          errors.push({
            table: row.table,
            id: row.id,
            reason: rowErr?.message ?? String(rowErr),
          });
        }
      }

      return ok(res, { processed, failed, errors });

    } catch (e) {
      console.error("[geo/backfill]", e);
      return err(res, 500, "Backfill failed: " + (e?.message ?? String(e)));
    }
  });
}
