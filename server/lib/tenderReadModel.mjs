// =============================================================================
// tenderReadModel — the submission read model (mig 154). Built BEFORE the new Tender Detail UI
// (amendment R2-#8) so the UI renders against this structure, not the old one-quote rfq shape.
// Returns a job's trades → invitations (rfqs) → submissions (+ derived verification/benchmark
// flags) → attachments. Spec: docs/plans/TENDER_SCHEMA_AND_MIGRATION.md.
// =============================================================================

// Board-level per-job quote metrics (step 9a). ONE pair of queries across every job's rfqs +
// submissions so the Tender Board shows quote/verified counts + the committed (awarded) $ without
// an N+1. Mirrors getJobSubmissionView's current-version + verified derivation.
// Returns { [jobId]: { quoteCount, verifiedCount, awardedCount, acceptedTotalExGst } }.
export async function getBoardQuoteSummary(sb) {
  const { data: rfqs, error } = await sb.from("rfqs").select("id, job_id, accepted_submission_id");
  if (error) throw error;
  const rfqJob = new Map((rfqs || []).map((r) => [r.id, r.job_id]));
  const rfqIds = (rfqs || []).map((r) => r.id);

  const subs = rfqIds.length
    ? ((await sb.from("rfq_quote_submissions")
        .select("id, rfq_id, version, sub_scope_label, verification_status, status, confirmed_amount_ex_gst, extracted_amount_ex_gst")
        .in("rfq_id", rfqIds)).data || [])
    : [];
  const amountOf = (s) => (s?.confirmed_amount_ex_gst ?? s?.extracted_amount_ex_gst);
  const subById = new Map(subs.map((s) => [s.id, s]));

  const byRfq = new Map();
  for (const s of subs) { if (!byRfq.has(s.rfq_id)) byRfq.set(s.rfq_id, []); byRfq.get(s.rfq_id).push(s); }

  const out = {};
  const ensure = (jid) => (out[jid] ||= { quoteCount: 0, verifiedCount: 0, awardedCount: 0, acceptedTotalExGst: 0 });

  // per-rfq: has a quote? has a verified CURRENT (non-superseded) quote?
  for (const [rfqId, list] of byRfq) {
    const jid = rfqJob.get(rfqId); if (!jid) continue;
    const rec = ensure(jid);
    rec.quoteCount += 1;
    const maxByScope = new Map();
    for (const s of list) { const k = s.sub_scope_label || ""; maxByScope.set(k, Math.max(maxByScope.get(k) || 0, s.version)); }
    const verifiedCurrent = list.some((s) =>
      s.verification_status === "verified" && s.status !== "superseded" && s.version === maxByScope.get(s.sub_scope_label || ""));
    if (verifiedCurrent) rec.verifiedCount += 1;
  }
  // awarded totals come from the enforceable pointer, not submission.status
  for (const r of rfqs || []) {
    if (!r.accepted_submission_id) continue;
    const rec = ensure(r.job_id);
    rec.awardedCount += 1;
    const amt = amountOf(subById.get(r.accepted_submission_id));
    if (amt != null) rec.acceptedTotalExGst += Number(amt);
  }
  return out;
}

// A job's quotes, grouped by trade for side-by-side comparison.
export async function getJobSubmissionView(sb, jobId) {
  const { data: rfqs, error } = await sb.from("rfqs")
    .select("id, trade, trade_category_id, subcontractor_id, status, accepted_submission_id, deadline, sent_at, received_at, subcontractors(business_name, email, contact)")
    .eq("job_id", jobId).order("trade");
  if (error) throw error;

  const rfqIds = (rfqs || []).map((r) => r.id);
  const { data: subs } = rfqIds.length
    ? await sb.from("rfq_quote_submissions")
        .select("id, rfq_id, version, status, verification_status, sub_scope_label, extracted_amount_ex_gst, confirmed_amount_ex_gst, received_at, created_at, rfq_quote_attachments(id, filename, pdf_url, storage_path, is_primary, role)")
        .in("rfq_id", rfqIds).order("version", { ascending: true })
    : { data: [] };

  // group submissions by rfq + derive is_current (latest version per sub-scope) → benchmark eligibility
  const byRfq = new Map();
  for (const s of subs || []) { if (!byRfq.has(s.rfq_id)) byRfq.set(s.rfq_id, []); byRfq.get(s.rfq_id).push(s); }
  for (const list of byRfq.values()) {
    const maxByScope = new Map();
    for (const s of list) { const k = s.sub_scope_label || ""; maxByScope.set(k, Math.max(maxByScope.get(k) || 0, s.version)); }
    for (const s of list) {
      s._verified = s.verification_status === "verified";
      s._current = s.version === maxByScope.get(s.sub_scope_label || "");
      s._benchmarkEligible = s._verified && s._current && s.status !== "superseded";
    }
  }

  const trades = new Map();
  for (const r of rfqs || []) {
    const submissions = (byRfq.get(r.id) || []).map((s) => ({
      id: s.id, version: s.version, status: s.status, verificationStatus: s.verification_status,
      subScopeLabel: s.sub_scope_label,
      extractedAmountExGst: s.extracted_amount_ex_gst, confirmedAmountExGst: s.confirmed_amount_ex_gst,
      amountExGst: s.confirmed_amount_ex_gst ?? s.extracted_amount_ex_gst,   // display: confirmed wins
      isVerified: s._verified, isCurrent: s._current, isBenchmarkEligible: s._benchmarkEligible,
      isAccepted: r.accepted_submission_id === s.id, receivedAt: s.received_at,
      attachments: (s.rfq_quote_attachments || []).map((a) => ({ id: a.id, filename: a.filename, pdfUrl: a.pdf_url, storagePath: a.storage_path, isPrimary: a.is_primary, role: a.role })),
    }));
    const recipient = {
      rfqId: r.id, subcontractorId: r.subcontractor_id,
      businessName: r.subcontractors?.business_name || null, email: r.subcontractors?.email || null, contact: r.subcontractors?.contact || null,
      invitationStatus: r.status, deadline: r.deadline, sentAt: r.sent_at, receivedAt: r.received_at,
      hasQuote: submissions.length > 0, acceptedSubmissionId: r.accepted_submission_id,
      submissions,
    };
    const key = r.trade || "(untraded)";
    if (!trades.has(key)) trades.set(key, { trade: key, tradeCategoryId: r.trade_category_id || null, recipients: [] });
    trades.get(key).recipients.push(recipient);
  }

  // within each trade: quotes first, then by lowest current amount (cheapest comparable up top)
  const out = [...trades.values()].sort((a, b) => a.trade.localeCompare(b.trade));
  for (const t of out) {
    const amt = (rec) => { const cur = rec.submissions.find((s) => s.isCurrent && s.amountExGst != null); return cur ? Number(cur.amountExGst) : Infinity; };
    t.recipients.sort((a, b) => (b.hasQuote - a.hasQuote) || (amt(a) - amt(b)));
    t.recipientCount = t.recipients.length;
    t.quoteCount = t.recipients.filter((r) => r.hasQuote).length;
  }
  return out;
}
