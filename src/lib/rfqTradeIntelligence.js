/**
 * Client helpers for RFQ trade intelligence (estimate baseline + merge).
 */

export function sourceBadgeLabel(source) {
  const s = String(source || "");
  if (s.includes("ai") && s.includes("estimate")) return "AI + Estimate";
  if (s.includes("ai")) return "AI";
  if (s.includes("estimate")) return "Estimate";
  if (s === "library") return "Library";
  return "Manual";
}

export function sourceBadgeClass(source) {
  const s = String(source || "");
  if (s.includes("ai") && s.includes("estimate")) return "bg-accent/15 text-accent border-accent/30";
  if (s.includes("estimate")) return "bg-primary/10 text-primary border-primary/30";
  if (s.includes("ai")) return "bg-amber-100 text-amber-900 border-amber-200";
  return "bg-page text-muted border-hairline";
}

/**
 * @param {{ extraction?: object, job_id?: string, buildexact_job_id?: string }} params
 */
export async function fetchMergedTradePlan(params = {}) {
  const res = await fetch("/api/rfq/trade-intelligence/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Trade merge failed");
  return json;
}

/** Default selection: all estimate-baseline trades + AI-detected trades. */
export function defaultSelectedTradeIds(mergedPlan = []) {
  const ids = new Set();
  for (const row of mergedPlan) {
    const src = String(row.source || "");
    if (src.includes("estimate") || src.includes("ai")) ids.add(row.trade_id);
  }
  return ids;
}

export function labelForTrade(tradeId, mergedPlan = [], fallbackMap = {}) {
  const row = mergedPlan.find((t) => t.trade_id === tradeId);
  return row?.trade_label || fallbackMap[tradeId] || tradeId;
}

export async function generateMissingPackageScopes(packageId) {
  const res = await fetch(`/api/rfq-packages/${packageId}/generate-missing-scopes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Generate missing scopes failed");
  return json;
}
