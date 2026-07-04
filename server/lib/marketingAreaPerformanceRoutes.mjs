// marketingAreaPerformanceRoutes.mjs — G3-B1: Area Performance (Sales Intelligence).
//
// GET /api/marketing/area-performance
//   ?from=YYYY-MM-DD   — leads.created_at lower bound (optional)
//   ?to=YYYY-MM-DD     — leads.created_at upper bound (optional)
//   ?source=...        — filter by lead_source_category (optional)
//   ?projectType=...   — filter by project_type (optional)
//
// Returns { ok:true, areas:[...], totals:{...} } — camelCase.
//
// Strategy (N+1-free, two queries max):
//   Q1: All matching leads (with filters applied), selecting every column we need
//       for the aggregation.
//   Q2: v_lead_attribution_roi rows for the matching lead IDs — get won_value +
//       lead_cost in one round-trip.
//   Then aggregate per suburb in JS.
//
// Why not the v_area_performance view?  PostgREST can filter a view's own columns,
// but v_area_performance is already aggregated — suburb-level, not lead-level — so
// filtering by leads.created_at or leads.project_type is impossible without raw SQL.
// The JS aggregation is straightforward and mirrors the view logic exactly.
//
// Cost honesty: lead_cost = COALESCE(lead_source_cost, 0) per the ROI view.
// We track whether any lead in the suburb had cost > 0 (cost_any_captured).
// cost_per_won is returned as null if no cost data exists for that suburb.
//
// Admin-gated explicitly per-route (there is NO blanket /api/marketing middleware).

import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import { ok, err, translateDbError } from "./apiResponse.mjs";
import { LEAD_SOURCE_CATEGORIES, LEAD_STAGES } from "../../src/lib/constants.js";

// Stages that count as "qualified" (past first enquiry touch, and on the active pipeline)
const QUALIFIED_STAGES = new Set([
  LEAD_STAGES.QUALIFY,
  LEAD_STAGES.DISCOVERY,
  LEAD_STAGES.WINNING_OFFER,
  LEAD_STAGES.FEE_PROPOSAL,
  LEAD_STAGES.ACCEPTED,
  LEAD_STAGES.TENDER,
  LEAD_STAGES.WON,
]);

// Fit values that count as poor fit
const POOR_FIT_VALUES = new Set(["poor", "price_shopper"]);

// Minimum sample size below which a suburb row is flagged low_sample
const LOW_SAMPLE_THRESHOLD = 5;

// Allowed source filter values
const VALID_SOURCES = new Set(Object.values(LEAD_SOURCE_CATEGORIES));

export function registerMarketingAreaPerformanceRoutes(app) {
  app.get("/api/marketing/area-performance", requireAuth, requireRole("admin"), async (req, res) => {
    const db = getServiceSupabase();
    if (!db) return err(res, 503, "Database not configured");

    const { from, to, source, projectType } = req.query;

    // ── Input validation ───────────────────────────────────────────────────
    if (source && !VALID_SOURCES.has(source)) {
      return err(res, 400, `Invalid source value. Valid options: ${[...VALID_SOURCES].join(", ")}.`);
    }

    try {
      // ── Q1: fetch matching leads ─────────────────────────────────────────
      let leadsQuery = db
        .from("leads")
        .select(
          "id, suburb, stage, lead_source_category, fit_quality, project_type, created_at, archived"
        )
        .eq("archived", false);

      if (from)        leadsQuery = leadsQuery.gte("created_at", from);
      if (to)          leadsQuery = leadsQuery.lte("created_at", `${to}T23:59:59.999Z`);
      if (source)      leadsQuery = leadsQuery.eq("lead_source_category", source);
      if (projectType) leadsQuery = leadsQuery.eq("project_type", projectType);

      const { data: leads, error: leadsErr } = await leadsQuery;
      if (leadsErr) return err(res, 500, translateDbError(leadsErr));

      if (!leads || leads.length === 0) {
        return ok(res, { areas: [], totals: buildTotals([]) });
      }

      // ── Q2: ROI data for those lead IDs ──────────────────────────────────
      // One batch query — no N+1.
      const leadIds = leads.map((l) => l.id);
      const { data: roiRows, error: roiErr } = await db
        .from("v_lead_attribution_roi")
        .select("lead_id, won_value, lead_cost")
        .in("lead_id", leadIds);

      // Soft-fail if the ROI view isn't applied yet (migration 130 not run)
      const roiAvailable = !roiErr;
      const roiMap = new Map();
      if (roiAvailable) {
        for (const r of roiRows || []) {
          roiMap.set(r.lead_id, {
            wonValue:  Number(r.won_value  || 0),
            leadCost:  Number(r.lead_cost  || 0),
          });
        }
      }

      // ── Aggregate per suburb in JS ────────────────────────────────────────
      const suburbMap = new Map();

      for (const lead of leads) {
        const suburb = (lead.suburb || "").trim() || "(no suburb)";
        if (!suburbMap.has(suburb)) {
          suburbMap.set(suburb, {
            suburb,
            enquiries:        0,
            qualified:        0,
            poorFit:          0,
            won:              0,
            wonValue:         0,
            totalCost:        0,
            costAnyCaptured:  false,
            sourceCounts:     new Map(), // lead_source_category → count
            fitCounts:        { strong: 0, possible: 0, nurture: 0, poor: 0, price_shopper: 0 },
          });
        }

        const row = suburbMap.get(suburb);
        const roi  = roiMap.get(lead.id) || { wonValue: 0, leadCost: 0 };

        row.enquiries += 1;

        if (QUALIFIED_STAGES.has(lead.stage)) row.qualified += 1;
        if (POOR_FIT_VALUES.has(lead.fit_quality)) row.poorFit += 1;

        if (lead.stage === LEAD_STAGES.WON) {
          row.won += 1;
          row.wonValue += roi.wonValue;
        }

        if (roi.leadCost > 0) {
          row.totalCost       += roi.leadCost;
          row.costAnyCaptured  = true;
        }

        if (lead.lead_source_category) {
          row.sourceCounts.set(
            lead.lead_source_category,
            (row.sourceCounts.get(lead.lead_source_category) || 0) + 1
          );
        }

        if (lead.fit_quality && Object.prototype.hasOwnProperty.call(row.fitCounts, lead.fit_quality)) {
          row.fitCounts[lead.fit_quality] += 1;
        }
      }

      // ── Build output rows ─────────────────────────────────────────────────
      const areas = [...suburbMap.values()]
        .map((row) => {
          // dominant source by count
          let topSource = null;
          let topSourceCount = 0;
          for (const [cat, count] of row.sourceCounts) {
            if (count > topSourceCount) { topSource = cat; topSourceCount = count; }
          }

          // quality ratio (guard div/0)
          const qualityRatio = row.enquiries > 0
            ? Math.round((row.qualified / row.enquiries) * 10000) / 10000
            : 0;

          // win rate (guard div/0) — null if no qualified leads
          const winRate = row.qualified > 0
            ? Math.round((row.won / row.qualified) * 10000) / 10000
            : null;

          // cost per won — null if no cost data or no won leads (honest: cannot distinguish
          // "truly zero cost" from "cost not captured" so we use cost_any_captured flag)
          const costPerWon = (row.costAnyCaptured && row.won > 0)
            ? Math.round((row.totalCost / row.won) * 100) / 100
            : null;

          return {
            suburb:          row.suburb,
            enquiries:       row.enquiries,
            qualified:       row.qualified,
            poorFit:         row.poorFit,
            won:             row.won,
            wonValue:        row.wonValue,
            qualityRatio,
            winRate,
            costPerWon,
            costAnyCaptured: row.costAnyCaptured,
            topSource,
            fitMix: {
              strong:       row.fitCounts.strong,
              possible:     row.fitCounts.possible,
              nurture:      row.fitCounts.nurture,
              poor:         row.fitCounts.poor,
              priceShoppers: row.fitCounts.price_shopper,
            },
            sampleSize: row.enquiries,
            lowSample:  row.enquiries < LOW_SAMPLE_THRESHOLD,
          };
        })
        // default sort: won_value desc, then enquiries desc
        .sort((a, b) => b.wonValue - a.wonValue || b.enquiries - a.enquiries);

      return ok(res, {
        areas,
        totals: buildTotals(areas),
        roiAvailable,
        filters: { from: from || null, to: to || null, source: source || null, projectType: projectType || null },
      });
    } catch (e) {
      return err(res, 500, translateDbError(e));
    }
  });
}

// ── Totals rollup across all areas ────────────────────────────────────────────
function buildTotals(areas) {
  const t = {
    enquiries:  0,
    qualified:  0,
    poorFit:    0,
    won:        0,
    wonValue:   0,
    totalCost:  0,
    costAnyCaptured: false,
  };
  for (const a of areas) {
    t.enquiries  += a.enquiries;
    t.qualified  += a.qualified;
    t.poorFit    += a.poorFit;
    t.won        += a.won;
    t.wonValue   += a.wonValue;
    if (a.costAnyCaptured) {
      t.totalCost      += (a.costPerWon != null ? a.costPerWon * a.won : 0);
      t.costAnyCaptured = true;
    }
  }
  return {
    ...t,
    qualityRatio: t.enquiries > 0 ? Math.round((t.qualified / t.enquiries) * 10000) / 10000 : 0,
    winRate:      t.qualified > 0 ? Math.round((t.won / t.qualified) * 10000) / 10000 : null,
    costPerWon:   (t.costAnyCaptured && t.won > 0)
      ? Math.round((t.totalCost / t.won) * 100) / 100
      : null,
    suburbCount:  areas.length,
  };
}
