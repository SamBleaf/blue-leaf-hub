// =============================================================================
// tenderRoutes — endpoints for the new quote-submission model (mig 154).
// Build step 5 = the read model API (before the new Detail UI). Correction/verify/award
// endpoints (steps 6–8) are added here as those phases land.
// =============================================================================
import { ok, err } from "./apiResponse.mjs";
import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth } from "./requireAuth.mjs";
import { getJobSubmissionView } from "./tenderReadModel.mjs";

const isMissingSubmissions = (e) =>
  /rfq_quote_submissions.*does not exist|could not find the table|schema cache|relation .* does not exist/i
    .test(String(e?.message || e || ""));

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
