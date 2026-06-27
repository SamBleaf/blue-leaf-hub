/**
 * Read-only win quote readiness check (P0-B4).
 * Warns when accepted rfqs lack staff-confirmed quote_amount — no writes.
 */

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function isStaffConfirmedQuoteAmount(v) {
  const n = numOrNull(v);
  return n != null && n > 0;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} jobId
 */
export async function computeWinQuoteReadiness(db, jobId) {
  const { data: rfqs, error } = await db
    .from("rfqs")
    .select("id, trade, status, quote_amount, quoted_amount, subcontractors ( business_name )")
    .eq("job_id", jobId);
  if (error) throw error;

  const warnings = [];

  for (const rfq of rfqs || []) {
    if (rfq.status !== "accepted") continue;
    if (isStaffConfirmedQuoteAmount(rfq.quote_amount)) continue;

    const quotedAmount = numOrNull(rfq.quoted_amount);
    warnings.push({
      type: "missing_quote_amount",
      severity: "high",
      rfqId: rfq.id,
      trade: String(rfq.trade || "").trim() || "Trade",
      businessName: String(rfq.subcontractors?.business_name || "").trim() || null,
      quoteAmount: numOrNull(rfq.quote_amount),
      quotedAmount,
      message:
        quotedAmount != null && quotedAmount > 0
          ? "Accepted trade has no staff-confirmed quote_amount."
          : "Accepted trade has no staff-confirmed quote_amount.",
    });
  }

  return {
    jobId,
    hasWarnings: warnings.length > 0,
    warnings,
  };
}
