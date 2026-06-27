import { reconcilePackageTradeCoverage } from "./rfqTradeIntelligence.mjs";

/**
 * After an inbound quote is applied to rfqs, propagate status to linked package tables.
 * Mirrors the manual path in PATCH .../recipients/:id (rfqPackageRoutes.mjs).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} rfqId
 * @param {{
 *   status?: string,
 *   receivedAt?: string,
 *   quotedAmount?: number|null,
 *   quotePdfPath?: string|null
 * }} payload
 * @returns {Promise<{ rfqs: number, rfq_recipients: number, rfq_trade_scopes: number, rfq_packages: number }>}
 */
export async function applyInboundQuoteToWorkflow(sb, rfqId, payload = {}) {
  const rowsUpdated = { rfqs: 0, rfq_recipients: 0, rfq_trade_scopes: 0, rfq_packages: 0 };
  const status = payload.status || "received";
  const receivedAt = payload.receivedAt || new Date().toISOString();
  const amount =
    payload.quotedAmount != null && Number.isFinite(Number(payload.quotedAmount)) && Number(payload.quotedAmount) > 0
      ? Number(payload.quotedAmount)
      : null;

  const { data: recipients, error } = await sb
    .from("rfq_recipients")
    .select("id, trade_scope_id, package_id")
    .eq("rfq_id", rfqId);
  if (error) {
    console.warn("[rfq-propagation] recipient lookup:", error.message);
    return rowsUpdated;
  }
  if (!recipients?.length) return rowsUpdated;

  const recPatch = {
    status,
    updated_at: new Date().toISOString(),
    quote_received_at: receivedAt
  };
  if (amount != null) recPatch.quote_amount = amount;
  if (payload.quotePdfPath) recPatch.quote_pdf_path = payload.quotePdfPath;

  const scopeIds = new Set();
  const packageIds = new Set();

  for (const rec of recipients) {
    const { error: upErr } = await sb.from("rfq_recipients").update(recPatch).eq("id", rec.id);
    if (!upErr) rowsUpdated.rfq_recipients += 1;
    if (rec.trade_scope_id) scopeIds.add(rec.trade_scope_id);
    if (rec.package_id) packageIds.add(rec.package_id);
  }

  if (status === "received") {
    for (const scopeId of scopeIds) {
      const { error: scErr } = await sb
        .from("rfq_trade_scopes")
        .update({ status: "received", updated_at: new Date().toISOString() })
        .eq("id", scopeId);
      if (!scErr) rowsUpdated.rfq_trade_scopes += 1;
    }
  }

  for (const packageId of packageIds) {
    try {
      await reconcilePackageTradeCoverage(sb, packageId);
      rowsUpdated.rfq_packages += 1;
    } catch (e) {
      console.warn("[rfq-propagation] reconcilePackageTradeCoverage:", e?.message || e);
    }
  }

  return rowsUpdated;
}

/** Lookup first rfq_recipients row for trace enrichment. */
export async function findRecipientLinkForRfq(sb, rfqId) {
  const { data } = await sb
    .from("rfq_recipients")
    .select("id, package_id, trade_scope_id")
    .eq("rfq_id", rfqId)
    .limit(1)
    .maybeSingle();
  return data || null;
}
