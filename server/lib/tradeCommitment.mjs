/**
 * tradeCommitment.mjs
 * Trade Commitment Engine — timing helpers, email templates, ghost detection.
 */

import { sendPlainMail } from "./notifyMail.mjs";
import { wrapPlainTextEmailHtml } from "./signatureEmailHtml.mjs";

// ── Timing helpers ──────────────────────────────────────────────────────────

export function quarterLabel(isoDate) {
  if (!isoDate) return "TBC";
  const d = new Date(`${isoDate}T00:00:00`);
  if (isNaN(d.getTime())) return "TBC";
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  if (m <= 3) return `Q1 ${y}`;
  if (m <= 6) return `Q2 ${y}`;
  if (m <= 9) return `Q3 ${y}`;
  return `Q4 ${y}`;
}

export function monthLabel(isoDate) {
  if (!isoDate) return "TBC";
  const d = new Date(`${isoDate}T00:00:00`);
  if (isNaN(d.getTime())) return "TBC";
  const day = d.getDate();
  const month = d.toLocaleString("en-AU", { month: "long" });
  const year = d.getFullYear();
  if (day <= 10) return `early ${month} ${year}`;
  if (day <= 20) return `mid ${month} ${year}`;
  return `late ${month} ${year}`;
}

// ── Sign-off helper ─────────────────────────────────────────────────────────

function signOff(familiar, style = "normal") {
  const sig = `Sam Morris\nBlue Leaf Building`;
  if (style === "short") return `Cheers,\nSam`;
  if (familiar) return `Cheers,\nSam`;
  return `Kind regards,\n${sig}`;
}

// ── Email template functions ────────────────────────────────────────────────
// Each returns { subject, text, html }

export function emailPoIssued({ contactName, jobAddress, trade, poNumber, quarterTiming, familiar, logo }) {
  const subject = `Purchase Order — ${jobAddress} — ${trade} — ${poNumber}`;
  const so = signOff(familiar);
  const text =
    `Hi ${contactName || "there"},\n\n` +
    `Great news — ${jobAddress} has been awarded and we're looking forward to getting underway.\n\n` +
    `Please find attached your Purchase Order for the ${trade} works.\n\n` +
    `Timing is still being confirmed but we're targeting a commencement of ${quarterTiming || "TBC"}.\n\n` +
    `We'll be in touch with a more accurate schedule once pre-construction is wrapped up.\n\n` +
    `Before works commence:\n` +
    `- Sign and return the PO\n` +
    `- Complete WH&S induction via HazardCo before site access\n` +
    `- Stamped drawings must be received before works begin\n\n` +
    `Any questions in the meantime, give us a call.\n\n` +
    `${so}`;
  const html = wrapPlainTextEmailHtml(text, { logoDataUrl: logo });
  return { subject, text, html };
}

export function emailCommencementNotice({ contactName, jobAddress, trade, commencementLabel, tradeLabel, familiar, logo }) {
  const subject = `Schedule update — ${jobAddress} — ${trade}`;
  const so = signOff(familiar, "short");
  const text =
    `Hi ${contactName || "there"},\n\n` +
    `Contracts are signed and we're targeting commencement ${commencementLabel || "TBC"}.\n\n` +
    `Your ${trade} works are pencilled in for ${tradeLabel || "TBC"} — we'll firm this up as the early ` +
    `stages progress and will be in touch to confirm once the preceding stage wraps up.\n\n` +
    `If anything has changed on your end that might affect that window, let us know.\n\n` +
    `${so}`;
  const html = wrapPlainTextEmailHtml(text, { logoDataUrl: logo });
  return { subject, text, html };
}

export function emailStageNoticeLabour({ contactName, jobAddress, trade, startLabel, familiar, logo }) {
  const subject = `Coming up — ${jobAddress} — ${trade} — ${startLabel || "TBC"}`;
  const so = signOff(familiar, "short");
  const text =
    `Hi ${contactName || "there"},\n\n` +
    `Framing is nearing sign-off and your ${trade} works are coming up on the schedule.\n\n` +
    `We have your scope pencilled in to commence ${startLabel || "TBC"}. We'll confirm the exact date ` +
    `once the frame inspection is done but wanted to get this on your radar.\n\n` +
    `If your availability has shifted or there are any concerns with that window, give us a ` +
    `shout as soon as you can.\n\n` +
    `We'll call to lock it in.\n\n` +
    `${so}`;
  const html = wrapPlainTextEmailHtml(text, { logoDataUrl: logo });
  return { subject, text, html };
}

export function emailStageNoticeProcurement({ contactName, jobAddress, trade, startLabel, familiar, logo }) {
  const subject = `Coming up — ${jobAddress} — ${trade} — ${startLabel || "TBC"}`;
  const so = signOff(familiar, "short");
  const text =
    `Hi ${contactName || "there"},\n\n` +
    `Framing is tracking well and your ${trade} works are coming up on the schedule.\n\n` +
    `We have your scope pencilled in for ${startLabel || "TBC"}. Given your lead times we wanted to ` +
    `touch base early — could you confirm:\n` +
    `1. Materials are in stock or will be available in time\n` +
    `2. You're comfortable with that window\n\n` +
    `If there are any lead time issues or anything we should know about, let us know now so ` +
    `we can stay ahead of it.\n\n` +
    `${so}`;
  const html = wrapPlainTextEmailHtml(text, { logoDataUrl: logo });
  return { subject, text, html };
}

const PRIOR_EVENT_LABELS = {
  po_issued: "PO",
  commencement_notice: "commencement notice",
  stage_complete_notice: "schedule notice",
  schedule_change_notice: "schedule update",
  follow_up_1: "follow-up",
  follow_up_2: "follow-up",
};

export function emailFollowUp({ contactName, jobAddress, priorEventType, logo }) {
  const subject = `Just checking in — ${jobAddress}`;
  // Always short sign-off for follow-ups
  const priorLabel = PRIOR_EVENT_LABELS[priorEventType] || "message";
  // Use street name only (first part before comma)
  const streetName = (jobAddress || "").split(",")[0].trim();
  const text =
    `Hi ${contactName || "there"},\n\n` +
    `Just making sure our last email landed — sent through a ${priorLabel} for ` +
    `${streetName} a few days ago.\n\n` +
    `No stress if you're across it — let us know if you've got any questions.\n\n` +
    `Cheers,\nSam`;
  const html = wrapPlainTextEmailHtml(text, { logoDataUrl: logo });
  return { subject, text, html };
}

export function emailScheduleChange({ contactName, jobAddress, trade, oldLabel, newLabel, logo }) {
  const subject = `Dates have shifted — ${jobAddress} — ${trade}`;
  const text =
    `Hi ${contactName || "there"},\n\n` +
    `Heads-up — the schedule has moved and your ${trade} works have shifted with it.\n\n` +
    `Previous: ${oldLabel || "TBC"}\n` +
    `Updated:  ${newLabel || "TBC"}\n\n` +
    `Sorry for the change — we're doing our best to keep things on track. If this causes a ` +
    `problem on your end, give us a call and we'll sort it out.\n\n` +
    `Thanks,\nSam`;
  const html = wrapPlainTextEmailHtml(text, { logoDataUrl: logo });
  return { subject, text, html };
}

export function emailCommencementConfirmed({ contactName, jobAddress, trade, confirmedDate, logo }) {
  // confirmedDate: ISO date string "2025-10-14"
  const streetName = (jobAddress || "").split(",")[0].trim();
  let formattedDate = confirmedDate || "TBC";
  if (confirmedDate) {
    const d = new Date(`${confirmedDate}T00:00:00`);
    if (!isNaN(d.getTime())) {
      formattedDate = d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    }
  }
  const shortDate = confirmedDate
    ? (() => {
        const d = new Date(`${confirmedDate}T00:00:00`);
        return isNaN(d.getTime()) ? confirmedDate : d.toLocaleDateString("en-AU", { day: "numeric", month: "long" });
      })()
    : "TBC";
  const subject = `Confirmed — ${jobAddress} — ${shortDate}`;
  const text =
    `Hi ${contactName || "there"},\n\n` +
    `Following on from our chat — just confirming ${trade} at ${streetName} is locked ` +
    `in for ${formattedDate}.\n\n` +
    `See you on site.\n\n` +
    `Cheers,\nSam`;
  const html = wrapPlainTextEmailHtml(text, { logoDataUrl: logo });
  return { subject, text, html };
}

export function emailAvailabilityConflict({ contactName, jobAddress, trade, logo }) {
  const subject = `No worries — ${jobAddress} — ${trade}`;
  const text =
    `Hi ${contactName || "there"},\n\n` +
    `Thanks for letting us know — appreciate you flagging it early rather than leaving us ` +
    `in the dark.\n\n` +
    `We'll look at the schedule and see what we can work with. A couple of questions:\n` +
    `- Is there a window that could work for you? Even a week or two later might be ` +
    `  manageable our end\n` +
    `- If it's a hard no, do you know anyone you'd recommend for the scope?\n\n` +
    `Give me a call when you get a chance and we'll work something out.\n\n` +
    `Cheers,\nSam`;
  const html = wrapPlainTextEmailHtml(text, { logoDataUrl: logo });
  return { subject, text, html };
}

// ── Ghost detection ─────────────────────────────────────────────────────────

export async function runGhostCheck(sb) {
  if (!sb) return { ok: false, error: "No DB client" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Query all issued POs awaiting response
  const { data: pos, error } = await sb
    .from("purchase_orders")
    .select(`
      id, project_id, subcontractor_id, trade, status,
      po_sent_at, last_contact_at, response_received_at,
      follow_up_1_sent_at, follow_up_2_sent_at,
      subcontractors ( id, contact, phone, email, business_name ),
      projects ( id, address )
    `)
    .not("po_sent_at", "is", null)
    .is("response_received_at", null)
    .eq("status", "issued");

  if (error) {
    console.error("[trade-ghost-check]", error.message);
    return { ok: false, error: error.message };
  }

  let followUp1Sent = 0;
  let supervisorTasksCreated = 0;

  for (const po of pos || []) {
    const lastContact = po.last_contact_at ? new Date(po.last_contact_at) : (po.po_sent_at ? new Date(po.po_sent_at) : null);
    if (!lastContact) continue;
    lastContact.setHours(0, 0, 0, 0);
    const daysSince = Math.floor((today - lastContact) / (24 * 60 * 60 * 1000));

    const sub = po.subcontractors || {};
    const project = po.projects || {};
    const contactName = (sub.contact || "there").trim();
    const jobAddress = (project.address || "").trim();
    const tradeLabel = po.trade || "works";
    const email = (sub.email || "").trim();
    const businessName = sub.business_name || tradeLabel;
    const phone = (sub.phone || "").trim();

    if (daysSince >= 5 && !po.follow_up_1_sent_at) {
      // Find prior event type from latest log entry
      const { data: logRows } = await sb
        .from("trade_communication_log")
        .select("event_type")
        .eq("purchase_order_id", po.id)
        .order("sent_at", { ascending: false })
        .limit(1);
      const priorEventType = logRows?.[0]?.event_type || "po_issued";

      const tmpl = emailFollowUp({ contactName, jobAddress, priorEventType, logo: "" });

      if (email) {
        try {
          await sendPlainMail({ to: email, subject: tmpl.subject, text: tmpl.text, html: tmpl.html });
        } catch (e) {
          console.warn("[trade-ghost-check] follow_up_1 email failed:", e.message);
        }
      }

      await sb.from("purchase_orders").update({
        follow_up_1_sent_at: new Date().toISOString(),
        last_contact_at: new Date().toISOString()
      }).eq("id", po.id);

      await sb.from("trade_communication_log").insert({
        purchase_order_id: po.id,
        project_id: po.project_id,
        subcontractor_id: po.subcontractor_id,
        event_type: "follow_up_1",
        email_subject: tmpl.subject,
      });

      followUp1Sent++;

    } else if (daysSince >= 10 && !po.follow_up_2_sent_at) {
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 2);

      await sb.from("supervisor_tasks").insert({
        project_id: po.project_id,
        purchase_order_id: po.id,
        subcontractor_id: po.subcontractor_id,
        task_type: "call_trade_no_response",
        title: `Call ${tradeLabel} — no response at ${jobAddress}`,
        description: `${businessName} has not responded. Please call ${phone || "— no phone on file"}.`,
        due_date: dueDate.toISOString().slice(0, 10),
      });

      await sb.from("purchase_orders").update({
        follow_up_2_sent_at: new Date().toISOString()
      }).eq("id", po.id);

      await sb.from("trade_communication_log").insert({
        purchase_order_id: po.id,
        project_id: po.project_id,
        subcontractor_id: po.subcontractor_id,
        event_type: "follow_up_2",
        email_subject: null,
      });

      supervisorTasksCreated++;
    }
  }

  return { ok: true, followUp1Sent, supervisorTasksCreated };
}
