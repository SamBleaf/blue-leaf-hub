// Procurement Intelligence (BQ-10) — learning / self-improvement service (P3).
//
// Deterministic loops that make the module smarter as real data arrives:
//   * captureLeadObservation  — record actual vs expected lead time on delivery
//   * refreshSupplierPerformance — aggregate observations → supplier on-time rate,
//                                  avg lead variance, learned (median) lead time
//   * detectMissingItems       — items common on similar past jobs but absent here
//   * quoteVsAllowance         — supplier quote vs estimate allowance variance
//   * suggestBackupSuppliers   — alternative suppliers for an item's trade
//
// No LLM here (AI drafting lives in procurementAiService). Canonical Data Law:
// supplier performance is DERIVED (computed from the observation ledger), cached
// on suppliers.* for display, never hand-edited.
//
// Requires migration 092 (supplier perf columns, item lifecycle timestamps,
// supplier_lead_observations). Null-safe / try-catch at call sites pre-migration.

const dayMs = 86400000;
const daysBetween = (a, b) => (a && b ? Math.round((new Date(a) - new Date(b)) / dayMs) : null);
const median = (arr) => {
  const x = arr.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!x.length) return null;
  const m = Math.floor(x.length / 2);
  return x.length % 2 ? x[m] : Math.round((x[m - 1] + x[m]) / 2);
};
const normKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ── Capture one lead-time observation when an item is delivered ────────────────
// Idempotent (UNIQUE procurement_item_id). Returns the observation row or null.
export async function captureLeadObservation(sb, item) {
  if (!sb || !item) return null;
  if (!item.supplier_id || !item.ordered_at || !item.delivered_at) return null; // need both ends
  const actual = daysBetween(item.delivered_at, item.ordered_at);
  if (actual == null || actual < 0) return null;
  const expected = Number.isFinite(Number(item.lead_time_days)) ? Number(item.lead_time_days) : null;
  const variance = expected == null ? null : actual - expected;
  const onTime = item.expected_delivery_date
    ? new Date(item.delivered_at) <= new Date(item.expected_delivery_date)
    : null;
  const row = {
    supplier_id: item.supplier_id,
    trade_category_id: item.trade_category_id || null,
    procurement_item_id: item.id,
    job_id: item.job_id || null,
    item_name: item.item_name || null,
    expected_lead_days: expected,
    actual_lead_days: actual,
    lead_variance_days: variance,
    on_time: onTime,
    ordered_at: item.ordered_at,
    delivered_at: item.delivered_at,
  };
  // upsert on the unique procurement_item_id so re-delivery edits refresh, not duplicate
  const { data, error } = await sb
    .from("supplier_lead_observations")
    .upsert(row, { onConflict: "procurement_item_id" })
    .select("*")
    .single();
  if (error) { console.warn("[procurement-learning] captureLeadObservation:", error.message); return null; }
  return data;
}

// ── Aggregate observations → supplier performance (cached on suppliers.*) ──────
export async function refreshSupplierPerformance(sb, supplierId) {
  if (!sb || !supplierId) return null;
  const { data: obs, error } = await sb
    .from("supplier_lead_observations")
    .select("actual_lead_days, lead_variance_days, on_time")
    .eq("supplier_id", supplierId);
  if (error || !obs) return null;
  const completed = obs.length;
  const onTimeKnown = obs.filter((o) => o.on_time !== null);
  const onTimeRate = onTimeKnown.length
    ? Math.round((onTimeKnown.filter((o) => o.on_time).length / onTimeKnown.length) * 1000) / 10
    : null;
  const variances = obs.map((o) => Number(o.lead_variance_days)).filter((n) => Number.isFinite(n));
  const avgVariance = variances.length
    ? Math.round((variances.reduce((a, b) => a + b, 0) / variances.length) * 10) / 10
    : null;
  const learnedLead = median(obs.map((o) => Number(o.actual_lead_days)));
  const upd = {
    completed_orders: completed,
    on_time_rate: onTimeRate,
    avg_lead_variance_days: avgVariance,
    learned_lead_time_days: learnedLead,
    performance_updated_at: new Date().toISOString(),
  };
  await sb.from("suppliers").update(upd).eq("id", supplierId);
  return { supplierId, ...upd };
}

// Convenience: an item just became 'delivered' → capture + refresh that supplier.
export async function onItemDelivered(sb, itemId) {
  const { data: item } = await sb.from("procurement_items").select("*").eq("id", itemId).maybeSingle();
  if (!item) return null;
  const obs = await captureLeadObservation(sb, item);
  if (obs && item.supplier_id) await refreshSupplierPerformance(sb, item.supplier_id);
  return obs;
}

// ── Missing-item detection vs similar past jobs ───────────────────────────────
// Similar = same project_type with a procurement register. Returns items that
// appear on ≥ threshold of similar jobs but are absent from this job.
export async function detectMissingItems(sb, jobId, { threshold = 0.6 } = {}) {
  if (!sb || !jobId) return [];
  const { data: job } = await sb.from("jobs").select("id, project_type").eq("id", jobId).maybeSingle();
  if (!job) return [];
  const pt = String(job.project_type || "").trim();

  // peer jobs (same build type), excluding this one
  let peerQ = sb.from("jobs").select("id").neq("id", jobId);
  if (pt) peerQ = peerQ.eq("project_type", pt);
  const { data: peers } = await peerQ;
  const peerIds = (peers || []).map((j) => j.id);
  if (peerIds.length < 2) return []; // not enough signal

  const { data: peerItems } = await sb
    .from("procurement_items")
    .select("job_id, trade_category_id, item_name")
    .in("job_id", peerIds)
    .eq("required", true);
  if (!peerItems?.length) return [];

  // frequency = # of distinct peer jobs containing a (trade,item) key
  const jobsWithKey = new Map(); // key -> Set(job_id)
  const meta = new Map();        // key -> {tradeCategoryId, itemName}
  for (const it of peerItems) {
    const key = `${it.trade_category_id || "?"}|${normKey(it.item_name)}`;
    if (!normKey(it.item_name)) continue;
    if (!jobsWithKey.has(key)) { jobsWithKey.set(key, new Set()); meta.set(key, { tradeCategoryId: it.trade_category_id || null, itemName: it.item_name }); }
    jobsWithKey.get(key).add(it.job_id);
  }
  const peerJobCount = new Set(peerItems.map((i) => i.job_id)).size;

  // this job's keys
  const { data: mine } = await sb
    .from("procurement_items").select("trade_category_id, item_name").eq("job_id", jobId).eq("required", true);
  const myKeys = new Set((mine || []).map((i) => `${i.trade_category_id || "?"}|${normKey(i.item_name)}`));

  const missing = [];
  for (const [key, jobsSet] of jobsWithKey) {
    const freq = jobsSet.size / peerJobCount;
    if (freq >= threshold && !myKeys.has(key)) {
      missing.push({ ...meta.get(key), frequency: Math.round(freq * 100), jobCount: jobsSet.size, peerJobCount });
    }
  }
  return missing.sort((a, b) => b.frequency - a.frequency);
}

// ── Quote vs estimate-allowance variance (per item) ───────────────────────────
export function quoteVsAllowance(item, { overPct = 10 } = {}) {
  const allowance = Number(item?.cost_allowance);
  const quote = Number(item?.quoted_amount);
  if (!Number.isFinite(allowance) || allowance <= 0 || !Number.isFinite(quote)) return null;
  const variance = quote - allowance;
  const variancePct = Math.round((variance / allowance) * 1000) / 10;
  return {
    allowance, quote, variance: Math.round(variance * 100) / 100, variancePct,
    flag: variancePct > overPct ? "over" : variancePct < -overPct ? "under" : "ok",
  };
}

// ── Backup-supplier suggestion for an item's trade ────────────────────────────
export async function suggestBackupSuppliers(sb, item, { limit = 3 } = {}) {
  if (!sb || !item?.trade_category_id) return [];
  const { data } = await sb
    .from("suppliers")
    .select("id, name, is_preferred, on_time_rate, learned_lead_time_days, usual_lead_time_days")
    .eq("trade_category_id", item.trade_category_id)
    .eq("is_active", true);
  return (data || [])
    .filter((s) => s.id !== item.supplier_id)
    .sort((a, b) =>
      (b.is_preferred === true) - (a.is_preferred === true) ||
      (Number(b.on_time_rate) || 0) - (Number(a.on_time_rate) || 0))
    .slice(0, limit);
}
