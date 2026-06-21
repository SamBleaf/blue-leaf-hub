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

    // Confidence for the current phase from overdue/soon tasks.
    let confidence = "on_track";
    if (isCurrent) {
      const overdue = phaseTasks.some((t) => t.end_date && t.end_date < today && !isComplete(t));
      const soon = phaseTasks.some((t) => {
        if (!t.end_date || isComplete(t)) return false;
        const d = daysBetweenYmd(today, t.end_date);
        return d != null && d >= 0 && d <= 7;
      });
      if (overdue) confidence = "delayed";
      else if (soon) confidence = "watch";
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
      confidence: isCurrent ? confidence : null
    };

    // Upsert on (project_id, key) — that UNIQUE constraint exists (027).
    const { data: existing } = await sb
      .from("portal_milestones")
      .select("id, auto_synced")
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
        confidence: fields.confidence
      };
      if (existing.auto_synced) update.label = fields.label;
      await sb.from("portal_milestones").update(update).eq("id", existing.id);
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
export async function runPortalNightlySync() {
  const sb = getServiceSupabase();
  if (!sb) return { skipped: true, projects: 0, milestones: 0, selectionsFlagged: 0 };
  const today = todayYmd();

  const { data: projects } = await sb
    .from("projects")
    .select("id")
    .eq("portal_enabled", true);

  let milestones = 0;
  let selectionsFlagged = 0;
  for (const p of projects || []) {
    try {
      const m = await syncProjectMilestones(sb, p.id, today);
      milestones += m.phases || 0;
      const s = await syncProjectSelectionsOverdue(sb, p.id, today);
      selectionsFlagged += s.flagged || 0;
    } catch (e) {
      console.warn(`[portalSync] project ${p.id}:`, e?.message || e);
    }
  }
  return { skipped: false, projects: (projects || []).length, milestones, selectionsFlagged };
}
