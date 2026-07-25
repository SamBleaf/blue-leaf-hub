// =============================================================================
// tenderRoutes — endpoints for the new quote-submission model (mig 154).
// Build step 5 = the read model API (before the new Detail UI). Correction/verify/award
// endpoints (steps 6–8) are added here as those phases land.
// =============================================================================
import { ok, err, translateDbError } from "./apiResponse.mjs";
import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth } from "./requireAuth.mjs";
import { getJobSubmissionView, getBoardQuoteSummary, getQuoteBenchmarksByTrade } from "./tenderReadModel.mjs";

// Only treat as "migration not applied" when the error actually names OUR new tables — a greedy
// `relation .* does not exist` would swallow unrelated missing-table/schema-cache errors as 503s.
const isMissingSubmissions = (e) => {
  const m = String(e?.message || e || "");
  return /rfq_quote_submissions|rfq_quote_attachments/i.test(m)
    && /(does not exist|could not find the table|schema cache)/i.test(m);
};

export function registerTenderRoutes(app) {
  // Grouped-by-trade submission view for a job — the read model the new Tender Detail renders.
  app.get("/api/tender/jobs/:jobId/submissions", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      return ok(res, { trades: await getJobSubmissionView(sb, req.params.jobId) });
    } catch (e) {
      if (isMissingSubmissions(e)) return ok(res, { trades: [], migrationPending: true });
      console.error("[tender submissions view]", e?.message || e);
      return err(res, 500, "Could not load quotes.");
    }
  });

  // Step 9a: board consolidation — per-job quote/verified counts + committed (awarded) $.
  app.get("/api/tender/board-quote-summary", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      return ok(res, { summary: await getBoardQuoteSummary(sb) });
    } catch (e) {
      if (isMissingSubmissions(e)) return ok(res, { summary: {}, migrationPending: true });
      console.error("[tender board summary]", e?.message || e);
      return err(res, 500, "Could not load the quote summary.");
    }
  });

  // Phase 5: verified-quote market benchmarks per trade (feeds Cost Intelligence).
  app.get("/api/tender/quote-benchmarks", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      return ok(res, { benchmarks: await getQuoteBenchmarksByTrade(sb) });
    } catch (e) {
      if (isMissingSubmissions(e)) return ok(res, { benchmarks: [], migrationPending: true });
      console.error("[tender quote benchmarks]", e?.message || e);
      return err(res, 500, "Could not load quote benchmarks.");
    }
  });

  // ── Step 7: correction + verification controls ────────────────────────────
  // Verification is the Cost-Intelligence gate — only a VERIFIED, current, non-superseded
  // submission is benchmark-eligible (see tenderReadModel). These three axes stay independent:
  // invitation status (on rfqs) · commercial status (submission.status) · verification_status.
  app.patch("/api/tender/submissions/:id", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const body = req.body || {};
    const now = new Date().toISOString();
    const uid = req.caller?.id || null;
    const patch = {};

    if (body.verificationStatus !== undefined) {
      const vs = String(body.verificationStatus);
      if (!["unverified", "verified", "rejected"].includes(vs)) return err(res, 400, "Invalid verification status.");
      patch.verification_status = vs;
      patch.verified_at = vs === "unverified" ? null : now;
      patch.verified_by = vs === "unverified" ? null : uid;
    }
    if (body.confirmedAmountExGst !== undefined) {
      const n = body.confirmedAmountExGst;
      if (n !== null && (!Number.isFinite(Number(n)) || Number(n) < 0)) return err(res, 400, "Confirmed amount must be a positive number.");
      patch.confirmed_amount_ex_gst = n === null ? null : Number(n);
      patch.confirmed_by = n === null ? null : uid;
      patch.confirmed_at = n === null ? null : now;
    }
    if (body.status !== undefined) {
      const st = String(body.status);
      // 'accepted' is the award flow (step 8) — not a free-form status edit here.
      if (!["received", "declined", "superseded"].includes(st)) return err(res, 400, "Invalid submission status.");
      patch.status = st;
    }
    if (body.subScopeLabel !== undefined) {
      patch.sub_scope_label = body.subScopeLabel ? String(body.subScopeLabel).trim() : null;
    }
    if (!Object.keys(patch).length) return err(res, 400, "Nothing to update.");

    try {
      const { data, error } = await sb.from("rfq_quote_submissions").update(patch).eq("id", req.params.id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return err(res, 404, "Quote not found.");
      return ok(res, { id: data.id });
    } catch (e) {
      if (isMissingSubmissions(e)) return err(res, 503, "Quote submissions not available yet.");
      console.error("[tender submission patch]", e?.message || e);
      return err(res, 500, "Could not update the quote.");
    }
  });

  // ── Step 8: award flow — the enforceable accepted-submission pointer ────────
  // Correctness rests on ONE single-row UPDATE of rfqs.accepted_submission_id — the trigger
  // rfq_accepted_submission_same_rfq (mig 154) rejects a submission from another rfq, and the
  // read model derives isAccepted from that pointer (not from submission.status), so the
  // best-effort status-label writes below can never corrupt which quote is actually awarded.
  app.post("/api/tender/rfqs/:rfqId/award", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const { rfqId } = req.params;
    const submissionId = req.body?.submissionId;
    if (!submissionId) return err(res, 400, "A quote to award is required.");
    const now = new Date().toISOString();
    const uid = req.caller?.id || null;
    try {
      // App-level integrity (defence in depth alongside the mig-154 same-rfq trigger): the
      // submission MUST belong to this rfq. Also read its amount to mirror into the legacy column.
      const { data: sub } = await sb.from("rfq_quote_submissions")
        .select("confirmed_amount_ex_gst, extracted_amount_ex_gst")
        .eq("id", submissionId).eq("rfq_id", rfqId).maybeSingle();
      if (!sub) return err(res, 400, "That quote is not on this RFQ.");
      // Mirror the awarded submission's amount into legacy rfqs.quote_amount so downstream consumers
      // (PO issue, win-finalize) get the right price during cutover. ALWAYS overwrite — including to
      // null — so re-awarding a different (or amount-less) quote can't leave a prior award's phantom
      // price behind. A quote with no amount should be verified/priced before PO anyway.
      const mirrorAmt = sub.confirmed_amount_ex_gst ?? sub.extracted_amount_ex_gst ?? null;
      const patch = {
        accepted_submission_id: submissionId, accepted_at: now, accepted_by: uid, status: "accepted",
        quote_amount: mirrorAmt != null ? Number(mirrorAmt) : null,
      };
      const { data, error } = await sb.from("rfqs").update(patch).eq("id", rfqId).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return err(res, 404, "RFQ not found.");
      // Cosmetic commercial-status labels (the pointer is the truth).
      await sb.from("rfq_quote_submissions").update({ status: "accepted" }).eq("id", submissionId);
      await sb.from("rfq_quote_submissions").update({ status: "received" }).eq("rfq_id", rfqId).neq("id", submissionId).eq("status", "accepted");
      return ok(res, { id: rfqId, acceptedSubmissionId: submissionId });
    } catch (e) {
      if (/does not belong to rfq/i.test(String(e?.message || ""))) return err(res, 400, "That quote is not on this RFQ.");
      if (isMissingSubmissions(e)) return err(res, 503, "Quote submissions not available yet.");
      console.error("[tender award]", e?.message || e);
      return err(res, 500, "Could not award the quote.");
    }
  });

  app.post("/api/tender/rfqs/:rfqId/unaward", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const { rfqId } = req.params;
    try {
      const { data: rfq, error: e0 } = await sb.from("rfqs").select("id, accepted_submission_id").eq("id", rfqId).maybeSingle();
      if (e0) throw e0;
      if (!rfq) return err(res, 404, "RFQ not found.");
      // Also revert the award's price mirror (award set rfqs.quote_amount) so an un-awarded rfq
      // doesn't keep a phantom price that PO/alignment would read if it's re-accepted.
      const { error } = await sb.from("rfqs")
        .update({ accepted_submission_id: null, accepted_at: null, accepted_by: null, status: "received", quote_amount: null })
        .eq("id", rfqId);
      if (error) throw error;
      if (rfq.accepted_submission_id) {
        await sb.from("rfq_quote_submissions").update({ status: "received" }).eq("id", rfq.accepted_submission_id).eq("status", "accepted");
      }
      return ok(res, { id: rfqId });
    } catch (e) {
      if (isMissingSubmissions(e)) return err(res, 503, "Quote submissions not available yet.");
      console.error("[tender unaward]", e?.message || e);
      return err(res, 500, "Could not un-accept the quote.");
    }
  });

  // ── Phase 4: recipient correction controls ("rectify in the UI, not in code") ──
  // Re-home a recipient to a different trade or subcontractor. `sub_scope_label` on submissions
  // is corrected via PATCH /submissions/:id (that's the "split into scopes" fix).
  app.patch("/api/tender/rfqs/:rfqId", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const b = req.body || {};
    const patch = {};
    if (b.trade !== undefined) patch.trade = b.trade ? String(b.trade) : null;
    if (b.tradeCategoryId !== undefined) patch.trade_category_id = b.tradeCategoryId || null;
    if (b.subcontractorId !== undefined) patch.subcontractor_id = b.subcontractorId || null;
    if (!Object.keys(patch).length) return err(res, 400, "Nothing to update.");
    try {
      const { data, error } = await sb.from("rfqs").update(patch).eq("id", req.params.rfqId).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return err(res, 404, "Recipient not found.");
      return ok(res, { id: data.id });
    } catch (e) {
      console.error("[tender rfq patch]", e?.message || e);
      return err(res, 500, translateDbError(e) || "Could not update the recipient.");
    }
  });

  // Remove a recipient (e.g. a junk/test entry). Blocks if awarded (un-accept first). Submissions
  // cascade via the mig-154 FK; a plain-English error surfaces if another record still references it.
  app.delete("/api/tender/rfqs/:rfqId", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { data: rfq } = await sb.from("rfqs").select("id, accepted_submission_id").eq("id", req.params.rfqId).maybeSingle();
      if (!rfq) return err(res, 404, "Recipient not found.");
      if (rfq.accepted_submission_id) return err(res, 409, "Un-accept this quote before removing the recipient.");
      const { error } = await sb.from("rfqs").delete().eq("id", req.params.rfqId);
      if (error) throw error;
      return ok(res, { id: req.params.rfqId });
    } catch (e) {
      console.error("[tender rfq delete]", e?.message || e);
      return err(res, 500, translateDbError(e) || "Could not remove the recipient.");
    }
  });

  // Choose which attachment IS the quote (when an email carried several PDFs).
  app.patch("/api/tender/attachments/:id/primary", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { data: att, error: e0 } = await sb.from("rfq_quote_attachments").select("id, submission_id").eq("id", req.params.id).maybeSingle();
      if (e0) throw e0;
      if (!att) return err(res, 404, "File not found.");
      // No partial-unique on is_primary — clear siblings, then set this one (two writes).
      const { error: e1 } = await sb.from("rfq_quote_attachments").update({ is_primary: false }).eq("submission_id", att.submission_id);
      if (e1) throw e1;
      const { error: e2 } = await sb.from("rfq_quote_attachments").update({ is_primary: true }).eq("id", req.params.id);
      if (e2) throw e2;
      return ok(res, { id: att.id });
    } catch (e) {
      if (isMissingSubmissions(e)) return err(res, 503, "Quote submissions not available yet.");
      console.error("[tender attachment primary]", e?.message || e);
      return err(res, 500, "Could not set the primary file.");
    }
  });
}
