/**
 * Client Portal v2.0 — nightly sync job.
 *
 * Idempotent, best-effort, runs over every portal-enabled project:
 *   1. Mirrors schedule_tasks phases → portal_milestones (auto_synced rows),
 *      setting achieved_at, is_current and a plain-English confidence flag so the
 *      Home screen + Project Journey reflect the real schedule.
 *   2. Flags overdue selections (order_by_date/due_date passed, still awaiting the
 *      client) and the matching client_actions, so "My Actions" turns red on time.
 *
 * Only touches auto_synced milestones it owns — manually-authored milestones for
 * projects without a schedule are left for the admin to manage. Never throws into
 * the caller; returns a summary.
 */
import { getServiceSupabase } from "./supabaseService.mjs";
import { notifyClient } from "./portalNotify.mjs";
import {
  syncVariationSent, syncVariationSigned, syncVariationVoided,
  syncClaimIssued, syncClaimPaid, syncClaimVoided,
} from "./portalIntegration.mjs";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function phaseLabel(phase) {
  if (!phase) return "Stage";
  return String(phase)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function daysBetweenYmd(a, b) {
  if (!a || !b) return null;
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  return Math.round((db - da) / 86400000);
}

/** Mirror one project's schedule phases into portal_milestones. */
async function syncProjectMilestones(sb, projectId, today) {
  const { data: tasks } = await sb
    .from("schedule_tasks")
    .select("phase, status, percent_complete, start_date, end_date")
    .eq("project_id", projectId);
  const list = tasks || [];
  if (!list.length) return { phases: 0 };

  // Group by phase, ordered by earliest start_date.
  const byPhase = new Map();
  for (const t of list) {
    if (!t.phase) continue;
    if (!byPhase.has(t.phase)) byPhase.set(t.phase, []);
    byPhase.get(t.phase).push(t);
  }
  const phases = [...byPhase.keys()].sort((a, b) => {
    const aMin = Math.min(...byPhase.get(a).map((t) => (t.start_date ? Date.parse(t.start_date) : Infinity)));
    const bMin = Math.min(...byPhase.get(b).map((t) => (t.start_date ? Date.parse(t.start_date) : Infinity)));
    return aMin - bMin;
  });

  const isComplete = (t) => t.status === "complete" || Number(t.percent_complete) >= 100;
  let currentAssigned = false;

  // Clear is_current across ALL milestones first, so exactly one row ends up current.
  // An admin-authored milestone whose key matches no schedule phase would otherwise
  // keep a stale is_current=true and coexist with the synced one — making the Home
  // query return two rows (PGRST116 → 500).
  await sb
    .from("portal_milestones")
    .update({ is_current: false })
    .eq("project_id", projectId)
    .eq("is_current", true);

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const phaseTasks = byPhase.get(phase);
    const allComplete = phaseTasks.every(isComplete);
    const anyStarted = phaseTasks.some((t) => Number(t.percent_complete) > 0 || t.status === "in_progress" || isComplete(t));

    // First not-fully-complete phase that has started (or the first incomplete) = current.
    let isCurrent = false;
    if (!allComplete && !currentAssigned && (anyStarted || i === phases.findIndex((p) => !byPhase.get(p).every(isComplete)))) {
      isCurrent = true;
      currentAssigned = true;
    }

    // Confidence (+ plain-English note) for the current phase from overdue/soon tasks.
    // The note is what the Home "build health" card shows under a watch/delayed badge;
    // without it the client sees a colour with no reason.
    let confidence = "on_track";
    let confidenceNote = null;
    if (isCurrent) {
      const overdue = phaseTasks.some((t) => t.end_date && t.end_date < today && !isComplete(t));
      const soon = phaseTasks.some((t) => {
        if (!t.end_date || isComplete(t)) return false;
        const d = daysBetweenYmd(today, t.end_date);
        return d != null && d >= 0 && d <= 7;
      });
      if (overdue) {
        confidence = "delayed";
        confidenceNote = "A task in this stage is past its planned date — we're actively managing it and will keep you updated.";
      } else if (soon) {
        confidence = "watch";
        confidenceNote = "A task in this stage is due within the week — on track, we're just keeping a close eye on it.";
      }
    }

    const latestEnd = phaseTasks
      .map((t) => t.end_date)
      .filter(Boolean)
      .sort()
      .pop();

    const fields = {
      project_id: projectId,
      key: phase,
      label: phaseLabel(phase),
      schedule_phase: phase,
      auto_synced: true,
      sort_order: i,
      is_current: isCurrent,
      achieved_at: allComplete ? (latestEnd || today) : null,
      confidence: isCurrent ? confidence : null,
      confidence_note: isCurrent ? confidenceNote : null
    };

    // Upsert on (project_id, key) — that UNIQUE constraint exists (027).
    const { data: existing } = await sb
      .from("portal_milestones")
      .select("id, auto_synced, confidence")
      .eq("project_id", projectId)
      .eq("key", phase)
      .maybeSingle();

    if (existing) {
      // Don't clobber a manually-authored milestone's label/preview; only manage sync fields.
      const update = {
        schedule_phase: phase,
        auto_synced: true,
        sort_order: i,
        is_current: isCurrent,
        achieved_at: fields.achieved_at,
        confidence: fields.confidence,
        confidence_note: fields.confidence_note
      };
      if (existing.auto_synced) update.label = fields.label;
      await sb.from("portal_milestones").update(update).eq("id", existing.id);
      // schedule_change: tell the client when the current stage NEWLY slips to delayed.
      if (isCurrent && fields.confidence === "delayed" && existing.confidence !== "delayed") {
        await notifyClient(projectId, {
          type: "schedule_change",
          title: "A schedule update on your build",
          body: `${fields.label} has hit a delay — ${fields.confidence_note || "we're managing it and will keep you updated."}`,
          entityType: "portal_milestone",
          entityId: existing.id
        }).catch(() => {});
      }
    } else {
      await sb.from("portal_milestones").insert(fields);
    }
  }

  return { phases: phases.length };
}

/** Flag overdue selections + their client_actions for one project. */
async function syncProjectSelectionsOverdue(sb, projectId, today) {
  // A selection is overdue if its order_by_date (preferred) or due_date has passed
  // and the client still has not chosen.
  const { data: sels } = await sb
    .from("client_selections")
    .select("id, status, due_date, order_by_date")
    .eq("project_id", projectId)
    .in("status", ["not_started", "awaiting_client"]);

  let flagged = 0;
  for (const s of sels || []) {
    const deadline = s.order_by_date || s.due_date;
    if (deadline && deadline < today) {
      await sb
        .from("client_selections")
        .update({ status: "overdue", updated_at: new Date().toISOString() })
        .eq("id", s.id);
      await sb
        .from("client_actions")
        .update({ status: "overdue", updated_at: new Date().toISOString() })
        .eq("project_id", projectId)
        .eq("related_entity_type", "client_selection")
        .eq("related_entity_id", s.id)
        .eq("status", "pending");
      flagged++;
    }
  }
  return { flagged };
}

/**
 * Run the full nightly portal sync across all portal-enabled projects.
 * @returns {Promise<{projects:number, milestones:number, selectionsFlagged:number, skipped:boolean}>}
 */
/**
 * Reconcile Finance→Portal: re-fire any variation/claim hook that never landed.
 * Finance sync hooks are all best-effort (.catch(()=>{})), so a transient failure
 * leaves a sent variation / issued claim with NO portal shadow — permanently, with
 * no recovery path. This nightly sweep heals that by re-firing the missing ones.
 */
async function syncProjectFinanceReconcile(sb, projectId) {
  let refired = 0;
  const { data: project } = await sb.from("projects").select("job_id, portal_client_name, portal_client_email").eq("id", projectId).maybeSingle();
  if (!project?.job_id) return { refired };
  const jobId = project.job_id;

  // B9: backfill portal client identity from the job if the win trigger / convert
  // path left it NULL — otherwise notifyClient has no email and the client is stranded.
  if (!project.portal_client_email || !project.portal_client_name) {
    const { data: job } = await sb.from("jobs").select("client_name, client_email").eq("id", jobId).maybeSingle();
    const patch = {};
    if (!project.portal_client_name && String(job?.client_name || "").trim()) patch.portal_client_name = String(job.client_name).trim();
    if (!project.portal_client_email && String(job?.client_email || "").trim()) patch.portal_client_email = String(job.client_email).trim();
    if (Object.keys(patch).length) { await sb.from("projects").update(patch).eq("id", projectId); refired++; }
  }

  const { data: vars } = await sb
    .from("job_variations").select("*").eq("job_id", jobId).eq("status", "sent_to_client");
  for (const v of vars || []) {
    const { data: dec } = await sb.from("portal_decisions").select("id").eq("job_variation_id", v.id).maybeSingle();
    if (!dec) { await syncVariationSent({ jobId, variation: v }).catch(() => {}); refired++; }
  }

  const { data: claims } = await sb
    .from("progress_claims").select("*").eq("job_id", jobId).eq("status", "issued");
  for (const c of claims || []) {
    const { data: pc } = await sb.from("portal_claims").select("id").eq("progress_claim_id", c.id).maybeSingle();
    if (!pc) { await syncClaimIssued({ jobId, claim: c, stageLabel: c.stage }).catch(() => {}); refired++; }
  }

  // Status DRIFT (worst case): a voided variation/claim whose shadow never got
  // withdrawn (dropped void hook) still shows a live Approve / 'I've paid' button.
  // Re-derive the expected portal state from canonical and re-fire the void hook.
  const { data: voidedVars } = await sb
    .from("job_variations").select("id").eq("job_id", jobId).eq("status", "void");
  for (const v of voidedVars || []) {
    const { data: dec } = await sb.from("portal_decisions").select("id, status").eq("job_variation_id", v.id).maybeSingle();
    if (dec && dec.status !== "withdrawn") { await syncVariationVoided({ variationId: v.id }).catch(() => {}); refired++; }
  }
  const { data: voidedClaims } = await sb
    .from("progress_claims").select("id").eq("job_id", jobId).eq("status", "void");
  for (const c of voidedClaims || []) {
    const { data: pc } = await sb.from("portal_claims").select("id, status").eq("progress_claim_id", c.id).maybeSingle();
    if (pc && pc.status !== "void") { await syncClaimVoided({ claimId: c.id }).catch(() => {}); refired++; }
  }

  // Signed variation whose decision never reached 'approved' (dropped sign hook).
  const { data: signedVars } = await sb
    .from("job_variations").select("id").eq("job_id", jobId).eq("status", "signed");
  for (const v of signedVars || []) {
    const { data: dec } = await sb.from("portal_decisions").select("id, status").eq("job_variation_id", v.id).maybeSingle();
    if (dec && dec.status !== "approved") { await syncVariationSigned({ variationId: v.id }).catch(() => {}); refired++; }
  }

  // Paid/partly-paid claim whose portal shadow drifted (dropped pay hook).
  const { data: paidClaims } = await sb
    .from("progress_claims").select("id, status").eq("job_id", jobId).in("status", ["paid", "partially_paid"]);
  for (const c of paidClaims || []) {
    const { data: pc } = await sb.from("portal_claims").select("id, status").eq("progress_claim_id", c.id).maybeSingle();
    if (pc && pc.status !== c.status) { await syncClaimPaid({ claimId: c.id, newStatus: c.status }).catch(() => {}); refired++; }
  }
  return { refired };
}

export async function runPortalNightlySync() {
  const sb = getServiceSupabase();
  if (!sb) return { skipped: true, projects: 0, milestones: 0, selectionsFlagged: 0, reconciled: 0 };
  const today = todayYmd();

  const { data: projects } = await sb
    .from("projects")
    .select("id")
    .eq("portal_v2_enabled", true);

  let milestones = 0;
  let selectionsFlagged = 0;
  let reconciled = 0;
  for (const p of projects || []) {
    try {
      const m = await syncProjectMilestones(sb, p.id, today);
      milestones += m.phases || 0;
      const s = await syncProjectSelectionsOverdue(sb, p.id, today);
      selectionsFlagged += s.flagged || 0;
      const r = await syncProjectFinanceReconcile(sb, p.id);
      reconciled += r.refired || 0;
    } catch (e) {
      console.warn(`[portalSync] project ${p.id}:`, e?.message || e);
    }
  }
  return { skipped: false, projects: (projects || []).length, milestones, selectionsFlagged, reconciled };
}
