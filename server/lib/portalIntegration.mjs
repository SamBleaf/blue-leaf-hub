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
    .select("id, job_id, portal_client_name, portal_v2_enabled")
    .eq("job_id", jobId)
    .maybeSingle();
  // Gate: never mirror Finance state into a portal that isn't v2-active. Every
  // sync fn already handles a null project by no-opping, so this one check
  // disables the whole Finance→Portal pipeline for non-v2 projects.
  if (!data || data.portal_v2_enabled !== true) return null;
  return data;
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

    // Confirm the approval to the client (type needs migration 110).
    await notifyClient(decision.project_id, {
      type: "variation_approved",
      title: "Variation approved",
      body: "A variation has been signed and added to your contract.",
      entityType: "portal_decision",
      entityId: decision.id,
    }).catch(() => {});

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

    // Archive the issued claim PDF to Documents/Progress Claims (idempotent on the
    // related id) so the client always has the invoice on file — mirrors how a
    // signed variation is archived in syncVariationSigned.
    if (claim.document_url) {
      const { data: existingDoc } = await sb
        .from("portal_documents")
        .select("id")
        .eq("project_id", project.id)
        .eq("related_entity_type", "progress_claim")
        .eq("related_entity_id", claim.id)
        .maybeSingle();
      if (!existingDoc) {
        await sb.from("portal_documents").insert({
          project_id: project.id,
          folder: "progress_claims",
          title: `Progress Claim #${claim.claim_number || ""}`.trim(),
          upload_source: "generated",
          storage_provider: "dropbox",
          public_url: claim.document_url,
          related_entity_type: "progress_claim",
          related_entity_id: claim.id,
          client_visible: true
        });
      }
    }
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
    const partial = newStatus === "partially_paid";
    // Carry the actual amount paid so far (migration 108 adds paid_to_date +
    // the 'partially_paid' status). A partial payment now shows as partially_paid
    // with a paid-to-date, instead of being misrepresented as plain 'invoiced'.
    const { data: pays } = await sb
      .from("progress_claim_payments")
      .select("payment_amount")
      .eq("progress_claim_id", claimId);
    const paidToDate = (pays || []).reduce((s, p) => s + Number(p.payment_amount || 0), 0);
    // Write status + paid_at FIRST, on their own — these columns always exist, so a
    // full/partial payment always records even if paid_to_date (migration 108) is absent.
    const { error: upErr } = await sb
      .from("portal_claims")
      .update({
        status: paid ? "paid" : partial ? "partially_paid" : "invoiced",
        paid_at: paid ? nowIso.slice(0, 10) : null
      })
      .eq("id", pc.id);
    if (upErr) console.warn("[portalIntegration] syncClaimPaid status (apply migration 108 for partial states):", upErr.message);
    // paid_to_date is 108-only — write it separately so its absence can never break
    // the status update above.
    await sb.from("portal_claims").update({ paid_to_date: paidToDate || null }).eq("id", pc.id)
      .then(() => {}, (e) => console.warn("[portalIntegration] paid_to_date skipped (apply migration 108):", e?.message || e));
    if (paid) {
      await sb
        .from("client_actions")
        .update({ status: "completed", updated_at: nowIso })
        .eq("project_id", pc.project_id)
        .eq("related_entity_type", "portal_claim")
        .eq("related_entity_id", pc.id);
      // Tell the client their payment was received (type needs migration 110).
      await notifyClient(pc.project_id, {
        type: "claim_paid",
        title: "Payment received — thank you",
        body: "We've received your payment. Thank you!",
        entityType: "portal_claim",
        entityId: pc.id,
      }).catch(() => {});
    }
  } catch (e) {
    console.warn("[portalIntegration] syncClaimPaid:", e?.message || e);
  }
}

/**
 * Variation VOIDED in Finance → withdraw it from the client so they can never
 * approve a cancelled variation. Sets portal_decisions.status='withdrawn'
 * (enabled by migration 108) and closes the open "Approve" action, removing the
 * live button from My Actions. The variation respond endpoint additionally guards
 * on status='pending', so a withdrawn decision can't be approved even if a stale
 * card lingered.
 */
export async function syncVariationVoided({ variationId }) {
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
    const { error } = await sb
      .from("portal_decisions")
      .update({ status: "withdrawn", responded_at: nowIso })
      .eq("id", decision.id);
    if (error) console.warn("[portalIntegration] syncVariationVoided status (apply migration 108):", error.message);
    await sb
      .from("client_actions")
      .update({ status: "completed", title: "Variation withdrawn", updated_at: nowIso })
      .eq("project_id", decision.project_id)
      .eq("related_entity_type", "portal_decision")
      .eq("related_entity_id", decision.id);
  } catch (e) {
    console.warn("[portalIntegration] syncVariationVoided:", e?.message || e);
  }
}

/**
 * Progress claim VOIDED in Finance → void it in the portal so the client can't
 * notify payment against a cancelled invoice. Sets portal_claims.status='void'
 * (migration 108) and closes the review/payment action, removing the live
 * "I've transferred payment" button from My Actions.
 */
export async function syncClaimVoided({ claimId }) {
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
    const { error } = await sb
      .from("portal_claims")
      .update({ status: "void" })
      .eq("id", pc.id);
    if (error) console.warn("[portalIntegration] syncClaimVoided status (apply migration 108):", error.message);
    await sb
      .from("client_actions")
      .update({ status: "completed", title: "Progress claim withdrawn", updated_at: nowIso })
      .eq("project_id", pc.project_id)
      .eq("related_entity_type", "portal_claim")
      .eq("related_entity_id", pc.id);
  } catch (e) {
    console.warn("[portalIntegration] syncClaimVoided:", e?.message || e);
  }
}

/**
 * Progress claim DISPUTED → mark it disputed in the portal and remove the live
 * 'I've transferred payment' button (a disputed claim shouldn't be paid). Needs
 * migration 110 (portal_claims 'disputed' + dispute_reason).
 */
export async function syncClaimDisputed({ claimId, reason }) {
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
    const { error } = await sb
      .from("portal_claims")
      .update({ status: "disputed", dispute_reason: reason || null })
      .eq("id", pc.id);
    if (error) console.warn("[portalIntegration] syncClaimDisputed status (apply migration 110):", error.message);
    await sb
      .from("client_actions")
      .update({ status: "completed", title: "Progress claim under review", updated_at: nowIso })
      .eq("project_id", pc.project_id)
      .eq("related_entity_type", "portal_claim")
      .eq("related_entity_id", pc.id);
  } catch (e) {
    console.warn("[portalIntegration] syncClaimDisputed:", e?.message || e);
  }
}

/**
 * Site diary saved → pre-fill a DRAFT weekly update for the builder to review and
 * publish to the Project Journey. Only the client-safe `work_completed` field is
 * carried; issues / instructions_given / visitors are INTERNAL and never
 * auto-exposed. The draft is unpublished (published=false), so nothing reaches the
 * client until the builder edits and publishes it — at which point the existing
 * publish flow notifies the client. This turns the daily diary into a starting
 * point for client updates instead of leaving the Journey empty.
 *
 * @param {{projectId:string, entry:object}} args  entry = site_diary row
 */
export async function syncDiaryToPortalUpdate({ projectId, entry }) {
  try {
    const sb = getServiceSupabase();
    if (!sb || !projectId || !entry) return;
    const body = String(entry.work_completed || "").trim();
    if (!body) return; // nothing client-relevant to draft

    const { data: proj } = await sb
      .from("projects")
      .select("id, portal_v2_enabled")
      .eq("id", projectId)
      .maybeSingle();
    if (!proj || proj.portal_v2_enabled !== true) return;

    const weekOf = entry.entry_date || new Date().toISOString().slice(0, 10);
    // order+limit(1), NOT maybeSingle — there's no UNIQUE(project_id, week_of), so a
    // second update in the same week would make maybeSingle throw PGRST116.
    const { data: existingRows } = await sb
      .from("portal_updates")
      .select("id, published")
      .eq("project_id", projectId)
      .eq("week_of", weekOf)
      .order("created_at", { ascending: false })
      .limit(1);
    const existing = (existingRows && existingRows[0]) || null;

    if (existing) {
      // Never clobber a published update or builder edits — only refresh a draft.
      if (existing.published) return;
      await sb.from("portal_updates").update({ body }).eq("id", existing.id);
      return;
    }

    await sb.from("portal_updates").insert({
      project_id: projectId,
      week_of: weekOf,
      headline: `Site update — ${weekOf}`,
      body,
      author_name: entry.supervisor || "Site team",
      published: false,
      status: "draft"
    });
  } catch (e) {
    console.warn("[portalIntegration] syncDiaryToPortalUpdate:", e?.message || e);
  }
}
