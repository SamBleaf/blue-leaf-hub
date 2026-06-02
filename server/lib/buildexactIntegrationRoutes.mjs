import { getJobById } from "./buildexactClient.mjs";
import { pullBuildexactEstimate, syncAcceptedQuoteToBuildexact, syncFeeProposalAcceptedToBuildexact } from "./buildexactDeepIntegration.mjs";
import { getServiceSupabase } from "./supabaseService.mjs";
import { upsertJobKnowledge } from "./jobResolver.mjs";
import { requireAuth } from "./requireAuth.mjs";

function pickBuildexactEstimateId(raw, estimate) {
  return String(
    raw?.id ||
      raw?.Id ||
      raw?.estimateId ||
      raw?.EstimateId ||
      raw?.estimate?.id ||
      raw?.estimate?.Id ||
      estimate?.quote_number ||
      ""
  ).trim();
}

async function persistPulledEstimate(sb, buildexactJobId, pulled, jobId = null) {
  const { raw, estimate, scheduleHints, costMetrics } = pulled;
  const buildexactEstimateId = pickBuildexactEstimateId(raw, estimate);
  const insert = {
    job_id: jobId || null,
    buildexact_job_id: buildexactJobId,
    buildexact_estimate_id: buildexactEstimateId || null,
    quote_number: estimate.quote_number || null,
    address: estimate.address || null,
    client_name: estimate.client_name || null,
    building_type: estimate.building_type || null,
    date_prepared: estimate.date_prepared || null,
    net_total: estimate.net_total,
    markup_amount: estimate.markup_amount,
    markup_percent: estimate.markup_percent,
    tax: estimate.tax,
    estimate_total: estimate.estimate_total,
    categories: estimate.categories,
    schedule_hints: scheduleHints,
    cost_metrics: costMetrics,
    source: "buildexact_api"
  };
  const { data, error } = await sb.from("buildexact_estimates").insert(insert).select("id").single();
  if (error) throw error;
  if (jobId && data?.id) {
    const catNames = (estimate.categories || []).map((c) => c.name).join(", ");
    await upsertJobKnowledge({
      job_id: jobId,
      address: estimate.address || null,
      kind: "estimate",
      content: `Buildexact API estimate for ${estimate.address || buildexactJobId}: categories ${catNames}. Estimate total $${estimate.estimate_total}.`,
      data: {
        quote_number: estimate.quote_number,
        estimate_total: estimate.estimate_total,
        schedule_hints: scheduleHints,
        cost_metrics: costMetrics
      },
      source_id: data.id
    }).catch((err) => console.warn("[buildexact/pull] job knowledge:", err?.message || err));
  }
  return { estimateRowId: data?.id || null, buildexactEstimateId };
}

export function registerBuildexactIntegrationRoutes(app) {
  app.get("/api/buildexact/job/:buildexactJobId/estimate", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const buildexactJobId = String(req.params.buildexactJobId || "").trim();
      if (!buildexactJobId) return res.status(400).json({ ok: false, error: "buildexactJobId required." });

      let jobMeta = {};
      try {
        jobMeta = await getJobById(buildexactJobId);
      } catch (err) {
        console.warn("[buildexact/pull] job metadata skipped:", err?.message || err);
      }
      const pulled = await pullBuildexactEstimate(buildexactJobId, {
        // JobDto (v3) fields are camelCase: worksLocationAddress / clientAddress / clientName.
        address: jobMeta?.worksLocationAddress || jobMeta?.clientAddress || jobMeta?.address || "",
        clientName: jobMeta?.clientName || ""
      });

      const { data: job } = await sb.from("jobs").select("id,address").eq("buildexact_job_id", buildexactJobId).maybeSingle();
      const { data: project } = await sb.from("projects").select("id,job_id").eq("buildexact_job_id", buildexactJobId).maybeSingle();
      const jobId = job?.id || project?.job_id || null;
      const persisted = await persistPulledEstimate(sb, buildexactJobId, pulled, jobId);
      // Previously wrote pulled.costMetrics to a projects.project_metrics jsonb column — which
      // collided by NAME with the canonical `project_metrics` TABLE (building facts) and was never
      // read by anything. Removed to kill the naming trap; costMetrics is still returned in the
      // response below and persisted via persistPulledEstimate. (See MASTER_DATA_DICTIONARY §18.2.)

      return res.json({
        ok: true,
        estimate: pulled.estimate,
        scheduleHints: pulled.scheduleHints,
        costMetrics: pulled.costMetrics,
        estimate_id: persisted.estimateRowId,
        buildexact_estimate_id: persisted.buildexactEstimateId,
        job_id: jobId
      });
    } catch (e) {
      console.error("[buildexact/job/estimate]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.patch("/api/rfq/:rfqId", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const rfqId = String(req.params.rfqId || "").trim();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const patch = {};
      if (body.status != null) patch.status = String(body.status);
      if (body.quote_amount !== undefined) patch.quote_amount = body.quote_amount === null || body.quote_amount === "" ? null : Number(body.quote_amount);
      if (body.manually_entered !== undefined) patch.manually_entered = Boolean(body.manually_entered);
      if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: "No supported fields." });
      const { data: updated, error } = await sb
        .from("rfqs")
        .update(patch)
        .eq("id", rfqId)
        .select("*, jobs(id, buildexact_job_id)")
        .single();
      if (error) throw error;
      if (patch.status === "accepted") {
        syncAcceptedQuoteToBuildexact({
          buildexactJobId: updated?.jobs?.buildexact_job_id,
          trade: updated?.trade,
          acceptedAmount: updated?.quote_amount ?? updated?.quoted_amount
        }).catch((err) => console.warn("[buildexact] accepted quote sync:", err?.message || err));
      }
      return res.json({ ok: true, rfq: updated });
    } catch (e) {
      console.error("[rfq patch]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/fee-proposal/:id/accept", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const id = String(req.params.id || "").trim();
      const now = new Date().toISOString();
      const { data: proposal, error: pe } = await sb
        .from("fee_proposals")
        .update({ status: "accepted", buildexact_status: "accepted", buildexact_synced_at: now, updated_at: now })
        .eq("id", id)
        .select("*")
        .single();
      if (pe) throw pe;
      let buildexactJobId = proposal.buildexact_job_id;
      if (!buildexactJobId && proposal.job_id) {
        const { data: jobRow } = await sb.from("jobs").select("buildexact_job_id").eq("id", proposal.job_id).maybeSingle();
        buildexactJobId = jobRow?.buildexact_job_id || "";
      }
      const buildexactEstimateId = proposal.buildexact_estimate_id;
      if (buildexactJobId && buildexactEstimateId) {
        syncFeeProposalAcceptedToBuildexact({ buildexactJobId, estimateId: buildexactEstimateId })
          .catch((err) => console.warn("[buildexact] fee proposal accept sync:", err?.message || err));
      }
      return res.json({ ok: true, proposal });
    } catch (e) {
      console.error("[fee-proposal/accept]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
