import {
  buildexactConfigured,
  getEstimatesByJob,
  getEstimateItems,
  beList
} from "./buildexactClient.mjs";
import {
  normaliseBuildexactEstimatePayload,
  parseCostMetrics,
  parseSchedItems
} from "./buildexactParser.mjs";

export async function pullBuildexactEstimate(buildexactJobId, opts = {}) {
  if (!buildexactConfigured()) {
    throw new Error("Buildxact is not configured — set BUILDEXACT_USERNAME and BUILDEXACT_API_KEY.");
  }
  // The v3 API has no /jobs/{id}/estimateitems. Estimate line items live under
  // /estimates/{estimateId}/items, and an estimate is found by jobId. Resolve, then pull items.
  let estimates = [];
  try {
    estimates = await getEstimatesByJob(buildexactJobId);
  } catch (err) {
    throw new Error(`Buildxact estimate lookup failed for job ${buildexactJobId}: ${err?.message || err}`);
  }
  if (!estimates.length) {
    throw new Error(`No Buildxact estimate found for job ${buildexactJobId}.`);
  }
  // Prefer the accepted estimate; otherwise the most recently modified.
  const chosen =
    estimates.find((e) => e?.isAccepted) ||
    [...estimates].sort(
      (a, b) => new Date(b?.modifiedAt || b?.createdAt || 0) - new Date(a?.modifiedAt || a?.createdAt || 0)
    )[0];
  const estimateId = chosen?.estimateId || chosen?.id;
  if (!estimateId) {
    throw new Error(`Buildxact estimate for job ${buildexactJobId} has no estimateId.`);
  }

  const raw = await getEstimateItems(estimateId);
  // Categories come from the estimate's parent/child hierarchy (verified on live data): `isParent`
  // rows are category headers (their `description` is the category name) and leaf rows reference the
  // header via `parentId`. The DTO also has a `costCategory` field but it is empty on live accounts,
  // so derive the category from the parent header. Keep only leaf, non-deleted cost lines.
  const allItems = beList(raw);
  const byId = new Map();
  for (const it of allItems) byId.set(it.estimateItemId ?? it.id, it);
  // Buildxact estimates can nest deeper than category → line (e.g. category → sub-item →
  // component lines), so a leaf's immediate parent may be a sub-item, not the category.
  // Walk the parentId chain up to the TOP-LEVEL ancestor (the category header) so every
  // leaf rolls up to its real category instead of falling into a "Buildexact" catch-all.
  const topCategoryName = (it) => {
    let cur = it;
    let guard = 0;
    while (cur && cur.parentId != null && byId.has(cur.parentId) && guard++ < 20) {
      cur = byId.get(cur.parentId);
    }
    return String(cur?.description || "").trim();
  };
  const items = allItems
    .filter((it) => !it?.isParent && !it?.isDeleted)
    .map((it) => ({
      ...it,
      categoryName: topCategoryName(it) || it.costCategory || it.category || "Buildexact"
    }));

  const estimate = normaliseBuildexactEstimatePayload(items, {
    ...opts,
    quoteNumber: opts.quoteNumber || chosen?.number,
    address: opts.address || chosen?.worksLocationAddress || chosen?.clientAddress,
    clientName: opts.clientName || chosen?.clientName
  });
  const scheduleHints = parseSchedItems(estimate.categories);
  const costMetrics = parseCostMetrics(estimate.categories);
  return { raw, rawSource: "estimates/items", estimate, scheduleHints, costMetrics, estimateId };
}

// Buildxact's v3 public API is READ-ONLY for estimates — there is no endpoint to write an accepted
// quote amount onto an estimate line, change an estimate's status, or "accept" an estimate. The Hub
// records all of this locally; these remain as no-ops (kept for caller compatibility) rather than
// calling endpoints that don't exist. If Buildxact later exposes estimate writes, wire them here.
export async function syncAcceptedQuoteToBuildexact({ buildexactJobId } = {}) {
  if (!buildexactJobId) return { skipped: true, reason: "missing_buildexact_job_id" };
  return { skipped: true, reason: "unsupported_by_api: estimate items are read-only in Buildxact v3" };
}

export async function syncFeeProposalSentToBuildexact({ buildexactJobId, estimateId } = {}) {
  if (!buildexactJobId || !estimateId) return { skipped: true };
  return { skipped: true, reason: "unsupported_by_api: estimate status is read-only in Buildxact v3" };
}

export async function syncFeeProposalAcceptedToBuildexact({ buildexactJobId, estimateId } = {}) {
  if (!buildexactJobId || !estimateId) return { skipped: true };
  return { skipped: true, reason: "unsupported_by_api: estimate accept is not exposed in Buildxact v3" };
}
