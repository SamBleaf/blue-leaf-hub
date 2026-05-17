import {
  getJobEstimateItems,
  getJobEstimates,
  updateEstimateItem,
  updateEstimateStatus,
  acceptEstimate
} from "./buildexactClient.mjs";
import {
  getBuildexactCategoryMapping,
  normaliseBuildexactEstimatePayload,
  parseCostMetrics,
  parseSchedItems
} from "./buildexactParser.mjs";

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[—–-]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordScore(a, b) {
  const aa = new Set(norm(a).split(" ").filter((w) => w.length > 2));
  const bb = new Set(norm(b).split(" ").filter((w) => w.length > 2));
  if (!aa.size || !bb.size) return 0;
  let hits = 0;
  for (const w of aa) if (bb.has(w)) hits += 1;
  return hits / Math.max(aa.size, bb.size);
}

function flattenItems(categories = []) {
  const rows = [];
  for (const cat of categories || []) {
    const mapping = getBuildexactCategoryMapping(cat.name);
    for (const item of cat.active_items || []) {
      rows.push({ category: cat, mapping, item });
    }
  }
  return rows;
}

function itemId(item) {
  return String(item?.id || item?.itemId || item?.estimateItemId || item?.code || "").trim();
}

function isSchedOrMetric(item) {
  const d = String(item?.description || "");
  return /\bSCHED\b/i.test(d) || /COST\s+METRIC/i.test(d);
}

export async function pullBuildexactEstimate(buildexactJobId, opts = {}) {
  let raw = null;
  let rawSource = "estimateitems";
  try {
    raw = await getJobEstimateItems(buildexactJobId);
  } catch (err) {
    console.warn("[buildexact] estimateitems failed, trying estimates:", err?.message || err);
    raw = await getJobEstimates(buildexactJobId);
    rawSource = "estimates";
  }
  const estimate = normaliseBuildexactEstimatePayload(raw, opts);
  const scheduleHints = parseSchedItems(estimate.categories);
  const costMetrics = parseCostMetrics(estimate.categories);
  return { raw, rawSource, estimate, scheduleHints, costMetrics };
}

export async function syncAcceptedQuoteToBuildexact({ buildexactJobId, trade, acceptedAmount }) {
  if (!buildexactJobId) return { skipped: true, reason: "missing_buildexact_job_id" };
  const amount = Number(acceptedAmount);
  if (!Number.isFinite(amount) || amount <= 0) return { skipped: true, reason: "missing_amount" };

  const { estimate } = await pullBuildexactEstimate(buildexactJobId);
  const rows = flattenItems(estimate.categories).filter(({ mapping }) => mapping?.hasQuoteLine);
  const tradeNorm = norm(trade);
  const categoryCandidates = rows.filter(({ mapping }) => {
    const key = norm(mapping?.tradeKey);
    return key && (key === tradeNorm || key.includes(tradeNorm) || tradeNorm.includes(key));
  });

  if (!categoryCandidates.length) {
    if (tradeNorm.includes("insulation")) {
      console.warn("[buildexact] insulation accepted but no separate insulation quote line found.");
    }
    return { skipped: true, reason: "no_matching_category" };
  }

  const quoteCandidates = categoryCandidates
    .filter(({ item }) => !isSchedOrMetric(item))
    .map((row) => {
      const desc = String(row.item.description || "");
      const score = Math.max(
        /\b(quote|subcontract|subcontractor|supply|install)\b/i.test(desc) ? 0.35 : 0,
        wordScore(trade, `${row.category.name} ${desc}`)
      );
      return { ...row, score };
    })
    .sort((a, b) => b.score - a.score);

  const target = quoteCandidates[0];
  const id = itemId(target?.item);
  if (!target || !id) {
    if (tradeNorm.includes("insulation")) {
      console.warn("[buildexact] insulation accepted but matching quote line has no updateable item id.");
    }
    return { skipped: true, reason: "no_quote_item" };
  }

  await updateEstimateItem(buildexactJobId, id, {
    unit_cost: amount,
    total: amount
  });
  return { ok: true, itemId: id, amount, category: target.category.name };
}

export async function syncFeeProposalSentToBuildexact({ buildexactJobId, estimateId }) {
  if (!buildexactJobId || !estimateId) return { skipped: true };
  return updateEstimateStatus(buildexactJobId, estimateId, "sent");
}

export async function syncFeeProposalAcceptedToBuildexact({ buildexactJobId, estimateId }) {
  if (!buildexactJobId || !estimateId) return { skipped: true };
  return acceptEstimate(buildexactJobId, estimateId);
}
