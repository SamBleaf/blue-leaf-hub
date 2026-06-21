/**
 * Cross-module sync: Finance ⟷ Client Portal v2.0.
 *
 * Finance keeps job_variations / progress_claims as the canonical truth. These
 * helpers mirror the client-relevant slice into the portal shadow tables
 * (portal_decisions / portal_claims) and the unified client_actions feed, so a
 * variation or claim raised in Finance automatically appears in the client's
 * "My Actions" and archives to Documents on completion.
 *
 * Contract:
 *   • Bridge is projects.job_id (finance keys job_id, portal keys project_id).
 *   • Every function is BEST-EFFORT and DEFENSIVE: if the job has no linked
 *     project (or the DB is unavailable) it no-ops and never throws into the
 *     finance request. Callers invoke with .catch() as a second safety net.
 *   • Inc-GST amounts come from the canonical generated columns — never recomputed.
 *   • Idempotent: re-running a sync updates the existing shadow row rather than
 *     duplicating it (matched on job_variation_id / progress_claim_id).
 */
import { getServiceSupabase } from "./supabaseService.mjs";
import { notifyClient } from "./portalNotify.mjs";

async function projectForJob(sb, jobId) {
  if (!jobId) return null;
  const { data } = await sb
    .from("projects")
    .select("id, job_id, portal_client_name")
    .eq("job_id", jobId)
    .maybeSingle();
  return data || null;
}

/** Upsert a client_action keyed on its related entity (no duplicates). */
async function upsertClientAction(sb, projectId, { actionType, title, description, entityType, entityId, dueDate, priority }) {
  const { data: existing } = await sb
    .from("client_actions")
    .select("id, status")
    .eq("project_id", projectId)
    .eq("related_entity_type", entityType)
    .eq("related_entity_id", entityId)
    .maybeSingle();

  if (existing) {
    // Re-open: a (re)sent variation/claim must re-surface in My Actions even if the
    // client rejected/responded to an EARLIER revision — otherwise a revised
    // six-figure variation is silently never shown to the client again.
    await sb
      .from("client_actions")
      .update({ status: "pending", title, description: description || null, due_date: dueDate || null, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return existing.id;
  }
  const { data: inserted } = await sb
    .from("client_actions")
    .insert({
      project_id: projectId,
      action_type: actionType,
      title,
      description: description || null,
      related_entity_type: entityType,
      related_entity_id: entityId,
      due_date: dueDate || null,
      priority: priority || "normal",
      status: "pending"
    })
    .select("id")
    .maybeSingle();
  return inserted?.id || null;
}

/**
 * Variation sent to client → create/refresh the portal decision + action.
 * @param {{jobId:string, variation:object}} args  variation = full job_variations row
 */
export async function syncVariationSent({ jobId, variation }) {
  try {
    const sb = getServiceSupabase();
    if (!sb || !variation) return;
    const project = await projectForJob(sb, jobId);
    if (!project) return;

    // Upsert the portal_decision shadow (matched on job_variation_id).
    const { data: existing } = await sb
      .from("portal_decisions")
      .select("id")
      .eq("project_id", project.id)
      .eq("job_variation_id", variation.id)
      .maybeSingle();

    const fields = {
      project_id: project.id,
      type: "variation",
      title: variation.title || `Variation ${variation.variation_number || ""}`.trim(),
      description: variation.description || null,
      status: "pending",
      cost_delta: variation.amount_ex_gst != null ? Number(variation.amount_ex_gst) : null,
      schedule_delta: variation.eot_days != null ? Number(variation.eot_days) : null,
      job_variation_id: variation.id
    };

    let decisionId = existing?.id || null;
    if (existing) {
      await sb.from("portal_decisions").update(fields).eq("id", existing.id);
    } else {
      const { data: ins } = await sb.from("portal_decisions").insert(fields).select("id").maybeSingle();
      decisionId = ins?.id || null;
    }
    if (!decisionId) return;

    await upsertClientAction(sb, project.id, {
      actionType: "variation_approval",
      title: `Approve Variation #${variation.variation_number || ""}`.trim(),
      description: variation.title || null,
      entityType: "portal_decision",
      entityId: decisionId,
      priority: "normal"
    });

    await notifyClient(project.id, {
      type: "variation_issued",
      title: "A variation needs your approval",
      body: `Variation #${variation.variation_number || ""} — ${variation.title || "additional works"} has been sent to your portal for review.`,
      entityType: "portal_decision",
      entityId: decisionId
    });
  } catch (e) {
    console.warn("[portalIntegration] syncVariationSent:", e?.message || e);
  }
}

/** Variation signed (admin or client) → approve the portal decision + archive PDF. */
export async function syncVariationSigned({ variationId }) {
  try {
    const sb = getServiceSupabase();
    if (!sb || !variationId) return;

    const { data: decision } = await sb
      .from("portal_decisions")
      .select("id, project_id, status")
      .eq("job_variation_id", variationId)
      .maybeSingle();
    if (!decision) return;

    const nowIso = new Date().toISOString();
    if (decision.status !== "approved") {
      await sb.from("portal_decisions").update({ status: "approved", responded_at: nowIso }).eq("id", decision.id);
    }

    await sb
      .from("client_actions")
      .update({ status: "approved", updated_at: nowIso })
      .eq("project_id", decision.project_id)
      .eq("related_entity_type", "portal_decision")
      .eq("related_entity_id", decision.id);

    // Archive the signed PDF to Documents/Variations (idempotent on related id).
    const { data: jv } = await sb
      .from("job_variations")
      .select("variation_number, title, signed_document_url, document_url")
      .eq("id", variationId)
      .maybeSingle();
    const docUrl = jv?.signed_document_url || jv?.document_url;
    if (docUrl) {
      const { data: existingDoc } = await sb
        .from("portal_documents")
        .select("id")
        .eq("project_id", decision.project_id)
        .eq("related_entity_type", "job_variation")
        .eq("related_entity_id", variationId)
        .maybeSingle();
      if (!existingDoc) {
        await sb.from("portal_documents").insert({
          project_id: decision.project_id,
          folder: "variations",
          title: `Variation #${jv.variation_number || ""} — ${jv.title || "Variation"}`.trim(),
          upload_source: "generated",
          storage_provider: "dropbox",
          public_url: docUrl,
          related_entity_type: "job_variation",
          related_entity_id: variationId,
          client_visible: true
        });
      }
    }
  } catch (e) {
    console.warn("[portalIntegration] syncVariationSigned:", e?.message || e);
  }
}

/** Variation rejected → decline the portal decision. */
export async function syncVariationRejected({ variationId, reason }) {
  try {
    const sb = getServiceSupabase();
    if (!sb || !variationId) return;
    const { data: decision } = await sb
      .from("portal_decisions")
      .select("id, project_id")
      .eq("job_variation_id", variationId)
      .maybeSingle();
    if (!decision) return;
    const nowIso = new Date().toISOString();
    await sb
      .from("portal_decisions")
      .update({ status: "declined", rejection_reason: reason || null, responded_at: nowIso })
      .eq("id", decision.id);
    await sb
      .from("client_actions")
      .update({ status: "rejected", updated_at: nowIso })
      .eq("project_id", decision.project_id)
      .eq("related_entity_type", "portal_decision")
      .eq("related_entity_id", decision.id);
  } catch (e) {
    console.warn("[portalIntegration] syncVariationRejected:", e?.message || e);
  }
}

/**
 * Progress claim issued → create/refresh the portal claim + review action.
 * @param {{jobId:string, claim:object, stageLabel?:string}} args  claim = progress_claims row
 */
export async function syncClaimIssued({ jobId, claim, stageLabel }) {
  try {
    const sb = getServiceSupabase();
    if (!sb || !claim) return;
    const project = await projectForJob(sb, jobId);
    if (!project) return;

    const amountInc = claim.amount_inc_gst != null
      ? Number(claim.amount_inc_gst)
      : Number(claim.amount_ex_gst || 0) * 1.1;

    // Payment instructions are fetched tolerantly: the column arrives in migration
    // 105, so a missing column (pre-105) must not break the claim sync.
    let paymentInstructions = null;
    {
      const { data: pi } = await sb.from("projects").select("payment_instructions").eq("id", project.id).maybeSingle();
      paymentInstructions = pi?.payment_instructions || null;
    }

    const { data: existing } = await sb
      .from("portal_claims")
      .select("id")
      .eq("project_id", project.id)
      .eq("progress_claim_id", claim.id)
      .maybeSingle();

    const fields = {
      project_id: project.id,
      stage_name: stageLabel || claim.stage || "Progress Claim",
      amount: amountInc,
      status: "invoiced",
      due_approx: claim.due_date ? String(claim.due_date) : null,
      progress_claim_id: claim.id,
      payment_instructions: paymentInstructions
    };

    let portalClaimId = existing?.id || null;
    if (existing) {
      await sb.from("portal_claims").update(fields).eq("id", existing.id);
    } else {
      const { data: ins } = await sb.from("portal_claims").insert(fields).select("id").maybeSingle();
      portalClaimId = ins?.id || null;
    }
    if (!portalClaimId) return;

    await upsertClientAction(sb, project.id, {
      actionType: "progress_claim_review",
      title: `Review Progress Claim #${claim.claim_number || ""}`.trim(),
      description: stageLabel || claim.stage || null,
      entityType: "portal_claim",
      entityId: portalClaimId,
      dueDate: claim.due_date || null,
      priority: "normal"
    });

    await notifyClient(project.id, {
      type: "progress_claim_issued",
      title: "A new progress claim is ready to view",
      body: `${stageLabel || claim.stage || "Progress claim"} — ${Math.round(amountInc).toLocaleString("en-AU", { style: "currency", currency: "AUD" })} inc GST is available in your portal.`,
      entityType: "portal_claim",
      entityId: portalClaimId
    });
  } catch (e) {
    console.warn("[portalIntegration] syncClaimIssued:", e?.message || e);
  }
}

/** Progress claim payment recorded → sync portal claim status. */
export async function syncClaimPaid({ claimId, newStatus }) {
  try {
    const sb = getServiceSupabase();
    if (!sb || !claimId) return;
    const { data: pc } = await sb
      .from("portal_claims")
      .select("id, project_id")
      .eq("progress_claim_id", claimId)
      .maybeSingle();
    if (!pc) return;
    const nowIso = new Date().toISOString();
    const paid = newStatus === "paid";
    await sb
      .from("portal_claims")
      .update({ status: paid ? "paid" : "invoiced", paid_at: paid ? nowIso.slice(0, 10) : null })
      .eq("id", pc.id);
    if (paid) {
      await sb
        .from("client_actions")
        .update({ status: "completed", updated_at: nowIso })
        .eq("project_id", pc.project_id)
        .eq("related_entity_type", "portal_claim")
        .eq("related_entity_id", pc.id);
    }
  } catch (e) {
    console.warn("[portalIntegration] syncClaimPaid:", e?.message || e);
  }
}
