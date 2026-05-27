/**
 * scheduleReminders.mjs
 * Trade Commitment Engine Phase 2:
 * - Lead time notification cron
 * - Milestone complete trigger
 * - Schedule change detection
 */

import {
  monthLabel,
  emailStageNoticeLabour,
  emailStageNoticeProcurement,
  emailScheduleChange,
} from "./tradeCommitment.mjs";
import { getBrandingEmailLogo } from "./brandingAssets.mjs";
import { sendPlainMail } from "./notifyMail.mjs";

// ── Helpers ─────────────────────────────────────────────────────────────────

function todayIso(simulateDate) {
  return simulateDate || new Date().toISOString().slice(0, 10);
}

function daysBetween(isoA, isoB) {
  const a = new Date(`${isoA}T00:00:00`);
  const b = new Date(`${isoB}T00:00:00`);
  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

function addDaysToIso(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Find the best-matching purchase_order for a schedule task.
 * Matches by subcontractor_id first, then by trade name (ILIKE not available in JS —
 * we do a case-insensitive compare after fetching).
 */
async function findPoForTask(sb, task, projectId) {
  // Try exact subcontractor match first
  if (task.assigned_subcontractor_id) {
    const { data: exact } = await sb
      .from("purchase_orders")
      .select("id, trade, subcontractor_id, stage_notified_at, subcontractors(id, contact, phone, email, business_name)")
      .eq("project_id", projectId)
      .eq("subcontractor_id", task.assigned_subcontractor_id)
      .is("stage_notified_at", null)
      .limit(1)
      .maybeSingle();
    if (exact) return exact;
  }

  // Fall back to trade name match (case-insensitive in JS)
  const taskTrade = (task.trade || task.assignee_trade || "").toLowerCase().trim();
  if (!taskTrade) return null;

  const { data: byTrade } = await sb
    .from("purchase_orders")
    .select("id, trade, subcontractor_id, stage_notified_at, subcontractors(id, contact, phone, email, business_name)")
    .eq("project_id", projectId)
    .is("stage_notified_at", null);

  return (byTrade || []).find(po => (po.trade || "").toLowerCase().trim() === taskTrade) || null;
}

async function findPoForTaskIncludingNotified(sb, task, projectId) {
  if (task.assigned_subcontractor_id) {
    const { data: exact } = await sb
      .from("purchase_orders")
      .select("id, trade, subcontractor_id, stage_notified_at, subcontractors(id, contact, phone, email, business_name)")
      .eq("project_id", projectId)
      .eq("subcontractor_id", task.assigned_subcontractor_id)
      .not("stage_notified_at", "is", null)
      .limit(1)
      .maybeSingle();
    if (exact) return exact;
  }

  const taskTrade = (task.trade || task.assignee_trade || "").toLowerCase().trim();
  if (!taskTrade) return null;

  const { data: byTrade } = await sb
    .from("purchase_orders")
    .select("id, trade, subcontractor_id, stage_notified_at, subcontractors(id, contact, phone, email, business_name)")
    .eq("project_id", projectId)
    .not("stage_notified_at", "is", null);

  return (byTrade || []).find(po => (po.trade || "").toLowerCase().trim() === taskTrade) || null;
}

async function sendStageEmail(sb, po, task, logo, isShortNotice) {
  const sub = po.subcontractors || {};
  const contactName = (sub.contact || "there").trim();
  const email = (sub.email || "").trim();
  if (!email) return { skipped: true, reason: "no email" };

  const startLabel = monthLabel(task.start_date);
  const isProcurement = task.task_type === "procurement" || task.procurement_item;

  let tmpl;
  if (isProcurement) {
    tmpl = emailStageNoticeProcurement({ contactName, jobAddress: task._jobAddress || "", trade: po.trade || task.trade || "works", startLabel, familiar: false, logo });
  } else {
    tmpl = emailStageNoticeLabour({ contactName, jobAddress: task._jobAddress || "", trade: po.trade || task.trade || "works", startLabel, familiar: false, logo });
  }

  let bodyText = tmpl.text;
  if (isShortNotice) {
    bodyText += "\n\nNote: this is shorter notice than usual — please let us know immediately if this creates any issues.";
  }

  await sendPlainMail({ to: email, subject: tmpl.subject, text: bodyText, html: tmpl.html });
  return { sent: true, subject: tmpl.subject };
}

// ── Phase A: Lead time cron ──────────────────────────────────────────────────

export async function runLeadTimeNotifications(sb, { simulateDate } = {}) {
  if (!sb) return { ok: false, error: "No DB client" };
  const today = todayIso(simulateDate);
  let notified = 0;
  let skipped = 0;
  const failures = [];

  // Fetch all active tasks with an assigned subcontractor
  const { data: tasks, error } = await sb
    .from("schedule_tasks")
    .select("id, project_id, trade, assignee_trade, task_type, start_date, lead_time_weeks, assigned_subcontractor_id, procurement_item")
    .not("start_date", "is", null)
    .not("assigned_subcontractor_id", "is", null)
    .not("status", "in", '("complete","cancelled","blocked")')
    .is("deleted_at", null);

  if (error) return { ok: false, error: error.message };

  // Fetch project addresses in bulk
  const projectIds = [...new Set((tasks || []).map(t => t.project_id))];
  const projectMap = {};
  if (projectIds.length) {
    const { data: projs } = await sb.from("projects").select("id, address").in("id", projectIds);
    for (const p of projs || []) projectMap[p.id] = p;
  }

  const logo = await getBrandingEmailLogo(sb).catch(() => "");

  for (const task of tasks || []) {
    if (!task.start_date) { skipped++; continue; }
    const lead = task.lead_time_weeks != null ? Number(task.lead_time_weeks) : 3;
    const notificationDate = addDaysToIso(task.start_date, -(lead * 7));
    if (notificationDate !== today) { skipped++; continue; }

    task._jobAddress = projectMap[task.project_id]?.address || "";

    try {
      const po = await findPoForTask(sb, task, task.project_id);
      if (!po) {
        console.warn(`[lead-time] No un-notified PO for task ${task.id} (${task.trade})`);
        skipped++;
        continue;
      }

      const result = await sendStageEmail(sb, po, task, logo, false);
      if (result.skipped) { skipped++; continue; }

      const nowIso = new Date().toISOString();
      await sb.from("purchase_orders").update({ stage_notified_at: nowIso, last_contact_at: nowIso }).eq("id", po.id);
      await sb.from("trade_communication_log").insert({
        purchase_order_id: po.id,
        project_id: task.project_id,
        subcontractor_id: po.subcontractor_id,
        event_type: "stage_complete_notice",
        email_subject: result.subject,
        tentative_start_label: monthLabel(task.start_date),
      });

      notified++;
    } catch (e) {
      console.error(`[lead-time] task ${task.id}:`, e.message);
      failures.push({ taskId: task.id, error: e.message });
    }
  }

  return { ok: true, notified, skipped, failures };
}

// ── Phase C: Milestone complete trigger ──────────────────────────────────────

export async function handleMilestoneComplete(taskId, projectId, sb) {
  if (!sb || !taskId || !projectId) return;

  const today = new Date().toISOString().slice(0, 10);

  // Fetch project address
  const { data: proj } = await sb.from("projects").select("address").eq("id", projectId).maybeSingle();
  const jobAddress = proj?.address || "";

  // Find dependent tasks using Supabase array-contains filter
  const { data: dependentTasks, error } = await sb
    .from("schedule_tasks")
    .select("id, project_id, trade, assignee_trade, task_type, start_date, lead_time_weeks, assigned_subcontractor_id, procurement_item, depends_on")
    .eq("project_id", projectId)
    .filter("depends_on", "cs", `{${taskId}}`)
    .not("status", "in", '("complete","cancelled")')
    .not("assigned_subcontractor_id", "is", null)
    .is("deleted_at", null);

  if (error) {
    console.error("[milestone-trigger] Dependent task query failed:", error.message);
    return;
  }

  if (!dependentTasks?.length) return;

  const logo = await getBrandingEmailLogo(sb).catch(() => "");

  for (const task of dependentTasks) {
    task._jobAddress = jobAddress;
    try {
      const po = await findPoForTask(sb, task, projectId);
      if (!po) {
        console.warn(`[milestone-trigger] No un-notified PO for dependent task ${task.id} (${task.trade})`);
        continue;
      }

      const noticeDays = task.start_date ? daysBetween(today, task.start_date) : 999;
      const isShortNotice = noticeDays < 28;

      const result = await sendStageEmail(sb, po, task, logo, isShortNotice);
      if (result.skipped) {
        console.warn(`[milestone-trigger] No email for PO ${po.id} — ${result.reason}`);
        continue;
      }

      const nowIso = new Date().toISOString();
      await sb.from("purchase_orders").update({ stage_notified_at: nowIso, last_contact_at: nowIso }).eq("id", po.id);
      await sb.from("trade_communication_log").insert({
        purchase_order_id: po.id,
        project_id: projectId,
        subcontractor_id: po.subcontractor_id,
        event_type: "stage_complete_notice",
        email_subject: result.subject,
        tentative_start_label: monthLabel(task.start_date),
        response_notes: isShortNotice ? "short_notice:true" : null,
      });

      console.log(`[milestone-trigger] Notified ${po.trade} sub for task ${task.id} — short_notice=${isShortNotice}`);
    } catch (e) {
      console.error(`[milestone-trigger] task ${task.id}:`, e.message);
    }
  }
}

// ── Phase D: Schedule change detection ──────────────────────────────────────

export async function handleScheduleChange(task, oldStartDate, sb) {
  if (!sb || !task || !oldStartDate) return;
  if (!task.start_date || task.start_date === oldStartDate) return;

  // Only fire if trade has already been notified (stage_notified_at IS NOT NULL)
  const po = await findPoForTaskIncludingNotified(sb, task, task.project_id);
  if (!po) return; // Not yet notified — silent change

  const { data: proj } = await sb.from("projects").select("address").eq("id", task.project_id).maybeSingle();
  const jobAddress = proj?.address || "";

  const sub = po.subcontractors || {};
  const contactName = (sub.contact || "there").trim();
  const email = (sub.email || "").trim();
  const phone = (sub.phone || "").trim();
  const businessName = sub.business_name || po.trade || "Trade";

  const today = new Date().toISOString().slice(0, 10);
  const dueDate = addDaysToIso(today, 1);

  const oldLabel = monthLabel(oldStartDate);
  const newLabel = monthLabel(task.start_date);

  // Create supervisor task
  await sb.from("supervisor_tasks").insert({
    project_id: task.project_id,
    purchase_order_id: po.id,
    subcontractor_id: po.subcontractor_id,
    task_type: "call_trade_schedule_change",
    title: `Call ${po.trade || task.trade} — dates shifted at ${jobAddress}`,
    description: `${businessName} was notified their works start ${oldLabel}. Schedule has moved to ${newLabel}. Please call to advise.\nContact: ${phone || "— no phone on file"}`,
    due_date: dueDate,
  });

  // Send Email 6 — schedule change
  if (email) {
    const logo = await getBrandingEmailLogo(sb).catch(() => "");
    const tmpl = emailScheduleChange({ contactName, jobAddress, trade: po.trade || task.trade || "works", oldLabel, newLabel, logo });
    try {
      await sendPlainMail({ to: email, subject: tmpl.subject, text: tmpl.text, html: tmpl.html });
      await sb.from("trade_communication_log").insert({
        purchase_order_id: po.id,
        project_id: task.project_id,
        subcontractor_id: po.subcontractor_id,
        event_type: "schedule_change_notice",
        email_subject: tmpl.subject,
        tentative_start_label: newLabel,
      });
      console.log(`[schedule-change] Notified ${businessName} re: date shift ${oldLabel} → ${newLabel}`);
    } catch (e) {
      console.error("[schedule-change] Email failed:", e.message);
    }
  }
}
