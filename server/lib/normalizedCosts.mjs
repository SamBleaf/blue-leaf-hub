/**
 * normalizedCosts.mjs — helpers for upserting normalized trade costs.
 * Called from: invoice approval, variation sign, job PC lock.
 */
import { getServiceSupabase } from "./supabaseService.mjs";

/**
 * Denominator type per trade category name.
 * 'floor_area' → rate_per_m2_floor computed from project_metrics.floor_area_m2
 * 'roof_area'  → rate_per_m2_trade_area from project_metrics.roof_area_m2
 * 'wall_area'  → rate_per_m2_trade_area from project_metrics.wall_area_m2
 */
const TRADE_DENOMINATOR = {
  "Roof Plumber":      "roof_area",
  "Internal Linings":  "wall_area",
  "Masonry":           "wall_area",
  "Tiler":             "wall_area",
  "Painting":          "wall_area",
  "Plastering & Rendering": "wall_area",
  "External Cladding": "wall_area",
};
// Everything else uses floor_area

/**
 * Fetch project_metrics for a job (null if not yet populated).
 */
async function getMetrics(db, jobId) {
  const { data } = await db.from("project_metrics").select("floor_area_m2, roof_area_m2, wall_area_m2").eq("job_id", jobId).maybeSingle();
  return data || null;
}

/**
 * Compute rates for a normalized_costs row.
 * Returns { rate_per_m2_floor, rate_per_m2_trade_area } — null if denominator unavailable.
 */
function computeRates(totalAmount, tradeCategoryName, metrics) {
  if (!metrics || !totalAmount) return {};
  const denominator = TRADE_DENOMINATOR[tradeCategoryName] || "floor_area";
  const floorArea = metrics.floor_area_m2;
  const tradeArea = denominator === "roof_area" ? metrics.roof_area_m2
    : denominator === "wall_area" ? metrics.wall_area_m2
    : null;

  return {
    rate_per_m2_floor: floorArea ? Math.round((totalAmount / floorArea) * 100) / 100 : null,
    rate_per_m2_trade_area: tradeArea ? Math.round((totalAmount / tradeArea) * 100) / 100 : null,
  };
}

/**
 * Upsert normalized_costs row. Additive for amount fields (never destructive overwrites).
 * @param {'actual'|'variation'|'quoted'|'budget'} field
 */
export async function upsertNormalizedCost(db, { jobId, tradeCategoryId, tradeCategoryName, field, amount }) {
  if (!db || !jobId || !tradeCategoryId || !amount) return;
  const now = new Date().toISOString();

  // Fetch existing row
  const { data: existing } = await db.from("normalized_costs")
    .select("*").eq("job_id", jobId).eq("trade_category_id", tradeCategoryId).maybeSingle();

  const metrics = await getMetrics(db, jobId);

  const patch = {
    job_id: jobId,
    trade_category_id: tradeCategoryId,
    updated_at: now,
    data_quality: "complete",
  };

  // Additive fields
  if (field === "actual") {
    // actual_amount accumulates: add delta (new total is passed)
    patch.actual_amount = amount;
  } else if (field === "variation") {
    const prev = existing?.variation_amount || 0;
    patch.variation_amount = prev + amount;
  } else if (field === "quoted") {
    patch.quoted_amount = amount;
  } else if (field === "budget") {
    patch.budget_amount = amount;
  }

  // Compute final_amount if we have actual + variation
  const finalActual = patch.actual_amount ?? existing?.actual_amount ?? 0;
  const finalVar = patch.variation_amount ?? existing?.variation_amount ?? 0;
  if (finalActual || finalVar) {
    patch.final_amount = finalActual + finalVar;
    const rates = computeRates(patch.final_amount, tradeCategoryName || "", metrics);
    Object.assign(patch, rates);

    // budget vs actual
    const budget = patch.budget_amount ?? existing?.budget_amount ?? null;
    if (budget && budget > 0 && patch.final_amount) {
      patch.budget_vs_actual_pct = Math.round(((patch.final_amount - budget) / budget) * 100 * 10) / 10;
    }
  }

  const { error } = await db.from("normalized_costs").upsert(patch, { onConflict: "job_id,trade_category_id" });
  if (error) console.warn("[normalized_costs] upsert error:", error.message);
}

/**
 * Lock all normalized_costs for a job as final (called on Practical Completion).
 */
export async function lockNormalizedCosts(db, jobId) {
  const now = new Date().toISOString();
  const { error } = await db.from("normalized_costs")
    .update({ is_final: true, data_quality: "final", updated_at: now })
    .eq("job_id", jobId);
  if (error) console.warn("[normalized_costs] lock error:", error.message);
}
