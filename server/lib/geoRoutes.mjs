/**
 * geoRoutes.mjs — Tiered backfill endpoint for geocoding jobs + leads.
 *
 * Route:
 *   POST /api/geo/backfill
 *     body: { dryRun?: boolean (default true), scope?: "all"|"jobs"|"leads"|"carpentry", limit?: number (default 100) }
 *
 * Tiered rule (matches on-save hooks in salesRoutes + jobsApiRoutes + carpentryRoutes):
 *   - Jobs                          → full address precision
 *   - Carpentry jobs                → full address precision (standalone island sites)
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
import { enrichSite } from "./siteEnrichmentService.mjs";
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
    const scope  = ["all", "jobs", "leads", "carpentry"].includes(body.scope) ? body.scope : "all";
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

      // Carpentry jobs — standalone island sites; always full address precision (like jobs).
      // No status filter: geocode every carpentry job missing coords (matches the jobs rule);
      // the Ops map filters to live statuses at read time.
      if (scope === "all" || scope === "carpentry") {
        const carpLimit = scope === "all"
          ? Math.max(limit - candidates.length, 1)
          : limit;
        const { data: carp, error: cErr } = await sb
          .from("carpentry_jobs")
          .select("id, address")
          .is("geo_geocoded_at", null)
          .limit(carpLimit);
        if (cErr) return err(res, 500, "Failed to query carpentry jobs: " + cErr.message);
        for (const c of carp || []) {
          const rawAddr = String(c.address || "").trim();
          if (!rawAddr) continue; // no address to geocode
          candidates.push({ table: "carpentry_jobs", id: c.id, precision: "address", query: rawAddr });
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

  /**
   * POST /api/geo/enrich-backfill  (admin-only)
   *
   * Runs site enrichment (G1-B) over rows that have coordinates but are missing
   * site_enriched_at. Targets qualify+ leads and all jobs (same tier rule as geocode
   * backfill).
   *
   * body: {
   *   dryRun?:  boolean (default true)  — zero writes on true; returns plan only
   *   scope?:   "all" | "jobs" | "leads"  (default "all")
   *   limit?:   number (default 100, max 500)
   * }
   *
   * Dry-run returns: { dryRun:true, wouldEnrich:N, plan:[{table,id}] }
   * Live run returns: { processed, failed, errors:[] }
   *
   * Sequential loop with per-row try/catch — one row failing never stops the rest.
   * Will NOT hit live external APIs in dry-run mode.
   */
  app.post("/api/geo/enrich-backfill", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "DB not configured");

    const body    = req.body || {};
    const dryRun  = body.dryRun !== false; // default true
    const scope   = ["all", "jobs", "leads"].includes(body.scope) ? body.scope : "all";
    const limit   = Math.min(Math.max(Number(body.limit) || 100, 1), 500);

    try {
      const candidates = []; // [{ table, id }]

      // Jobs — all jobs with coords but not yet enriched
      if (scope === "all" || scope === "jobs") {
        const { data: jobs, error: jErr } = await sb
          .from("jobs")
          .select("id")
          .not("geo_lat", "is", null)
          .is("site_enriched_at", null)
          .limit(limit);
        if (jErr) return err(res, 500, "Failed to query jobs: " + jErr.message);
        for (const job of jobs || []) {
          candidates.push({ table: "jobs", id: job.id });
        }
      }

      // Leads — qualify+ only (same tiering as geocode backfill)
      if (scope === "all" || scope === "leads") {
        const leadsLimit = scope === "all"
          ? Math.max(limit - candidates.length, 1)
          : limit;
        const { data: leads, error: lErr } = await sb
          .from("leads")
          .select("id, stage")
          .not("geo_lat", "is", null)
          .is("site_enriched_at", null)
          .in("stage", [...QUALIFY_PLUS_STAGES])
          .limit(leadsLimit);
        if (lErr) return err(res, 500, "Failed to query leads: " + lErr.message);
        for (const lead of leads || []) {
          candidates.push({ table: "leads", id: lead.id });
        }
      }

      // Dry-run: no writes, no external API calls
      if (dryRun) {
        return ok(res, {
          dryRun: true,
          wouldEnrich: candidates.length,
          plan: candidates,
        });
      }

      // Live run: sequential + per-row fail-soft
      let processed = 0;
      let failed    = 0;
      const errors  = [];

      for (const row of candidates) {
        try {
          const result = await enrichSite(row.table, row.id);
          if (result.ok) {
            processed++;
          } else {
            failed++;
            errors.push({ table: row.table, id: row.id, reason: result.reason });
          }
        } catch (rowErr) {
          failed++;
          errors.push({ table: row.table, id: row.id, reason: rowErr?.message ?? String(rowErr) });
        }
      }

      return ok(res, { processed, failed, errors });

    } catch (e) {
      console.error("[geo/enrich-backfill]", e);
      return err(res, 500, "Enrich backfill failed: " + (e?.message ?? String(e)));
    }
  });

  /**
   * POST /api/geo/enrich/:table/:id  (admin-only)
   *
   * Runs site enrichment for a single row. Thin wrapper around enrichSite().
   * Used by the "Enrich now" button on Lead Detail.
   *
   * Returns: { ok:true, enriched: true } on success, or { ok:false, error } on failure.
   */
  app.post("/api/geo/enrich/:table/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const { table, id } = req.params;
    if (!["leads", "jobs"].includes(table)) {
      return err(res, 400, "table must be 'leads' or 'jobs'");
    }
    try {
      const result = await enrichSite(table, id);
      if (!result.ok) {
        return err(res, 422, result.reason || "Enrichment failed");
      }
      return ok(res, { enriched: true });
    } catch (e) {
      console.error("[geo/enrich/:table/:id]", e);
      return err(res, 500, "Enrichment failed: " + (e?.message ?? String(e)));
    }
  });
}
