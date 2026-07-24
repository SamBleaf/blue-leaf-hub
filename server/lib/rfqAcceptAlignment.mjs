/**
 * Read-only quote acceptance alignment check (P0-B2 Phase 2).
 * Compares accepted rfq_recipients vs accepted rfqs for a job — no writes.
 */

const ACCEPTED = "accepted";

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function amountsDiffer(a, b) {
  const left = numOrNull(a);
  const right = numOrNull(b);
  if (left == null && right == null) return false;
  if (left == null || right == null) return true;
  return Math.abs(left - right) > 0.009;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} jobId
 */
export async function computeAcceptAlignment(db, jobId) {
  const warnings = [];

  const { data: rfqs, error: rfqErr } = await db
    .from("rfqs")
    .select("id, trade, status, quote_amount")
    .eq("job_id", jobId);
  if (rfqErr) throw rfqErr;

  const rfqById = new Map((rfqs || []).map((r) => [r.id, r]));

  // Model B (rfq_packages/…) was retired in mig 155. Read fail-soft: a missing table just means
  // "no package data", so the alignment reflects the Model A rfqs alone rather than 500-ing.
  const { data: packages } = await db
    .from("rfq_packages")
    .select(`
      id,
      rfq_trade_scopes (
        id,
        trade_id,
        trade_label,
        rfq_recipients (
          id,
          rfq_id,
          business_name,
          status,
          quote_amount
        )
      )
    `)
    .eq("job_id", jobId);

  for (const pkg of packages || []) {
    for (const scope of pkg.rfq_trade_scopes || []) {
      const trade = scope.trade_label || scope.trade_id || "Trade";
      for (const rec of scope.rfq_recipients || []) {
        if (rec.status !== ACCEPTED) continue;

        const recipientName = String(rec.business_name || "").trim() || "Recipient";
        const quoteAmount = numOrNull(rec.quote_amount);

        if (!rec.rfq_id) {
          warnings.push({
            type: "package_only_accept",
            severity: "high",
            packageId: pkg.id,
            recipientId: rec.id,
            trade,
            recipientName,
            quoteAmount,
            message:
              "Accepted package recipient is not represented in the Tender win path.",
          });
          continue;
        }

        const rfq = rfqById.get(rec.rfq_id);
        if (!rfq || rfq.status !== ACCEPTED) {
          warnings.push({
            type: "stale_rfq",
            severity: "high",
            packageId: pkg.id,
            recipientId: rec.id,
            rfqId: rec.rfq_id,
            trade,
            recipientName,
            quoteAmount,
            rfqStatus: rfq?.status || null,
            message:
              "Package recipient is accepted but the linked RFQ is not accepted on the Tender path.",
          });
          continue;
        }

        if (amountsDiffer(rec.quote_amount, rfq.quote_amount)) {
          warnings.push({
            type: "amount_mismatch",
            severity: "medium",
            packageId: pkg.id,
            recipientId: rec.id,
            rfqId: rec.rfq_id,
            trade,
            recipientName,
            quoteAmount,
            rfqQuoteAmount: numOrNull(rfq.quote_amount),
            message:
              "Accepted package quote amount does not match the linked RFQ amount.",
          });
        }
      }
    }
  }

  const packageIds = (packages || []).map((p) => p.id);
  let recipientsForJob = [];
  if (packageIds.length) {
    const { data: recs, error: r2Err } = await db
      .from("rfq_recipients")
      .select("id, rfq_id, package_id, business_name, status, quote_amount")
      .in("package_id", packageIds)
      .not("rfq_id", "is", null);
    if (r2Err) throw r2Err;
    recipientsForJob = recs || [];
  }

  const recipsByRfqId = new Map();
  for (const rec of recipientsForJob) {
    if (!rec.rfq_id) continue;
    if (!recipsByRfqId.has(rec.rfq_id)) recipsByRfqId.set(rec.rfq_id, []);
    recipsByRfqId.get(rec.rfq_id).push(rec);
  }

  for (const rfq of rfqs || []) {
    if (rfq.status !== ACCEPTED) continue;
    const linked = recipsByRfqId.get(rfq.id) || [];
    if (linked.length === 0) continue;
    for (const rec of linked) {
      if (rec.status === ACCEPTED) continue;
      warnings.push({
        type: "stale_package",
        severity: "medium",
        packageId: rec.package_id,
        recipientId: rec.id,
        rfqId: rfq.id,
        trade: rfq.trade || "Trade",
        recipientName: String(rec.business_name || "").trim() || "Recipient",
        recipientStatus: rec.status,
        quoteAmount: numOrNull(rfq.quote_amount),
        message:
          "RFQ is accepted on Tender Detail but the linked package recipient is not accepted.",
      });
    }
  }

  return {
    jobId,
    hasWarnings: warnings.length > 0,
    warnings,
  };
}
