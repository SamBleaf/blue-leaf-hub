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
}
