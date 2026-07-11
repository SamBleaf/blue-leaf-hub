/**
 * leadReminders.mjs — CRM Phase 1 Action Engine (Batch 1).
 *
 * The system REMINDS INTERNALLY and sends ONE safe acknowledgement. Nothing else is
 * sent to clients automatically — every follow-up / chase / nurture stays a
 * recommendation in the internal digest for Sam/Josh to send by hand.
 *
 *   1A  runLeadActionDigest()  — one morning email to Sam/Josh: leads due/overdue today.
 *   1B  sendEnquiryAck()       — one branded "we got your enquiry" email to the client.
 *   1C  reactivation sweep      — 3/6/12-month idle leads flagged into the digest (no client email).
 *
 * DRY-RUN: runLeadActionDigest({ dryRun:true }) writes nothing and sends nothing — it
 * returns the fully-rendered digest (recipients, subject, text, html) + the itemised
 * buckets (who, why, which group, the link) so a human can review before anything sends.
 *
 * No migration — reuses leads.action_type / action_due_at (leadActionQueue.mjs) and
 * leads.last_activity_at (mig 016). Reactivation is already a valid action_type.
 */

import { getServiceSupabase } from "./supabaseService.mjs";
import { sendPlainMail } from "./notifyMail.mjs";

// ── config ──────────────────────────────────────────────────────────────────
const APP_BASE_URL = (process.env.APP_BASE_URL || "https://blueleafhub.com.au").replace(/\/+$/, "");
const REACTIVATION_MONTHS = [3, 6, 12];     // idle tiers, longest-first matched below
const MAX_PER_BUCKET = 25;                  // keep the digest short enough to be useful

function digestRecipients() {
  // Defaults to both directors; LEAD_DIGEST_RECIPIENTS (comma-separated) overrides.
  const raw = String(process.env.LEAD_DIGEST_RECIPIENTS || "sam@blueleafbuilding.com.au,josh@blueleafbuilding.com.au");
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

// Stages that are off the active board — never chased or reactivated.
const TERMINAL_STAGES = ["won", "lost"];

// ── small helpers ─────────────────────────────────────────────────────────────
function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

function leadName(lead) {
  const n = String(lead.name || "").trim();
  if (n) return n;
  const combined = [lead.first_name, lead.last_name].map((s) => String(s || "").trim()).filter(Boolean).join(" ");
  return combined || "Unnamed lead";
}

function leadLink(lead) {
  return `${APP_BASE_URL}/sales/${lead.id}`;
}

function sourceLabel(lead) {
  return String(lead.lead_source || lead.lead_source_category || "—").replace(/_/g, " ");
}

function monthsIdle(lastActivityAt, now) {
  if (!lastActivityAt) return null;
  const then = new Date(lastActivityAt);
  if (Number.isNaN(then.getTime())) return null;
  return (now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

function reactivationTier(months) {
  // longest tier the lead has crossed (12 → 6 → 3)
  for (const m of [...REACTIVATION_MONTHS].sort((a, b) => b - a)) {
    if (months >= m) return m;
  }
  return null;
}

// Plain-English reason a lead is in the digest, from its action_type + stage.
function reasonFor(lead) {
  switch (lead.action_type) {
    case "response_due":
      return lead.stage === "enquiry"
        ? "New enquiry — first response due (speed-to-lead)"
        : "Response due";
    case "no_reply_follow_up": return "Follow-up — no reply yet";
    case "plans_requested":    return "Plans / documents requested — chase";
    case "plans_received":     return "Plans received — next step";
    case "proposal_follow_up": return "Proposal follow-up";
    case "nurture_check_in":   return "Nurture check-in";
    case "lost_review":        return "Lost — review reason";
    case "reactivation":       return lead._reactivationTier
      ? `Reactivation — ${lead._reactivationTier} months idle`
      : "Reactivation — long idle";
    default:                   return "Action due";
  }
}

// A speed-to-lead breach = a NEW enquiry whose first-response action is overdue.
function isSpeedToLeadBreach(lead, startOfToday) {
  return (
    lead.action_type === "response_due" &&
    lead.stage === "enquiry" &&
    lead.action_due_at &&
    new Date(lead.action_due_at) < startOfToday
  );
}

// ── the digest ────────────────────────────────────────────────────────────────
/**
 * Gather the four priority buckets. Pure read + compute — no writes.
 * Priority order (Sam): 1 speed-to-lead · 2 overdue · 3 due today · 4 reactivation.
 */
async function gatherDigest(sb, now) {
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const endOfToday   = new Date(now); endOfToday.setHours(23, 59, 59, 999);

  const cols = "id, name, first_name, last_name, email, phone, stage, lead_source, lead_source_category, assigned_to, next_action, action_type, action_due_at, last_activity_at";

  // Leads with a pending action due or overdue today (not won/lost).
  const { data: dueRows, error: dueErr } = await sb
    .from("leads")
    .select(cols)
    .not("stage", "in", `(${TERMINAL_STAGES.join(",")})`)
    .not("action_due_at", "is", null)
    .lte("action_due_at", endOfToday.toISOString())
    .order("action_due_at", { ascending: true });
  if (dueErr) throw dueErr;

  // 1C reactivation candidates: active/nurture leads with NO pending action (won't clobber a
  // real chase) that have been idle past the first tier. Longest-first tier is computed per lead.
  const idleCutoff = new Date(now); idleCutoff.setDate(idleCutoff.getDate() - Math.min(...REACTIVATION_MONTHS) * 30);
  const { data: idleRows, error: idleErr } = await sb
    .from("leads")
    .select(cols)
    .not("stage", "in", `(${TERMINAL_STAGES.join(",")})`)
    .is("action_due_at", null)
    .lt("last_activity_at", idleCutoff.toISOString())
    .order("last_activity_at", { ascending: true });
  if (idleErr) throw idleErr;

  const reactivationCandidates = [];
  for (const lead of idleRows || []) {
    const months = monthsIdle(lead.last_activity_at, now);
    const tier = months == null ? null : reactivationTier(months);
    if (!tier) continue;
    lead._reactivationTier = tier;
    lead._isReactivationCandidate = true; // needs the flag written in live mode
    lead.action_type = "reactivation";    // render the right reason/bucket before the DB write
    reactivationCandidates.push(lead);
  }

  // Bucket. Reactivation wins first (by action_type OR fresh candidate), then speed-to-lead,
  // then overdue, then due-today.
  const urgent = [], overdue = [], dueToday = [], reactivation = [];

  for (const lead of dueRows || []) {
    if (lead.action_type === "reactivation") { reactivation.push(lead); continue; }
    if (isSpeedToLeadBreach(lead, startOfToday)) { urgent.push(lead); continue; }
    const due = new Date(lead.action_due_at);
    if (due < startOfToday) overdue.push(lead);
    else dueToday.push(lead);
  }
  for (const lead of reactivationCandidates) reactivation.push(lead);

  return { urgent, overdue, dueToday, reactivation, reactivationCandidates };
}

function summaryLine(d) {
  return `${d.urgent.length} urgent · ${d.overdue.length} overdue · ${d.dueToday.length} due today · ${d.reactivation.length} reactivation`;
}

function renderText(d) {
  const lines = [];
  lines.push("Leads that need attention today");
  lines.push(summaryLine(d));
  lines.push("");
  const section = (emoji, title, items) => {
    if (!items.length) return;
    lines.push(`${emoji} ${title} (${items.length})`);
    for (const lead of items.slice(0, MAX_PER_BUCKET)) {
      lines.push(`  • ${leadName(lead)} — ${lead.stage} · ${sourceLabel(lead)}`);
      lines.push(`    ${reasonFor(lead)} · due ${fmtDate(lead.action_due_at || lead.last_activity_at)} · owner ${lead.assigned_to || "—"}`);
      lines.push(`    ${leadLink(lead)}`);
    }
    if (items.length > MAX_PER_BUCKET) lines.push(`  …and ${items.length - MAX_PER_BUCKET} more`);
    lines.push("");
  };
  section("[URGENT]", "Speed-to-lead breaches", d.urgent);
  section("[OVERDUE]", "Overdue actions", d.overdue);
  section("[DUE]", "Due today", d.dueToday);
  section("[REACTIVATE]", "Reactivation", d.reactivation);
  if (!d.urgent.length && !d.overdue.length && !d.dueToday.length && !d.reactivation.length) {
    lines.push("Nothing due today — all leads are up to date.");
  }
  lines.push("");
  lines.push("Blue Leaf Hub — internal reminder. Nothing here has been sent to any client.");
  return lines.join("\n");
}

function renderHtml(d) {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const section = (color, emoji, title, items) => {
    if (!items.length) return "";
    const rows = items.slice(0, MAX_PER_BUCKET).map((lead) => `
      <tr>
        <td style="padding:8px 0;border-top:1px solid #e4e9ec;">
          <a href="${esc(leadLink(lead))}" style="color:#006c9b;font-weight:600;text-decoration:none;">${esc(leadName(lead))}</a>
          <span style="color:#67808c;font-size:12px;"> — ${esc(lead.stage)} · ${esc(sourceLabel(lead))}</span><br>
          <span style="color:#17313d;font-size:13px;">${esc(reasonFor(lead))}</span>
          <span style="color:#67808c;font-size:12px;"> · due ${esc(fmtDate(lead.action_due_at || lead.last_activity_at))} · ${esc(lead.assigned_to || "—")}</span>
        </td>
      </tr>`).join("");
    const more = items.length > MAX_PER_BUCKET ? `<tr><td style="padding:6px 0;color:#67808c;font-size:12px;">…and ${items.length - MAX_PER_BUCKET} more</td></tr>` : "";
    return `
      <h3 style="margin:20px 0 4px;font-size:14px;color:${color};">${emoji} ${title} (${items.length})</h3>
      <table style="width:100%;border-collapse:collapse;">${rows}${more}</table>`;
  };
  const empty = !d.urgent.length && !d.overdue.length && !d.dueToday.length && !d.reactivation.length;
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#17313d;max-width:640px;">
    <h2 style="font-size:18px;margin:0 0 2px;">Leads that need attention today</h2>
    <p style="margin:0 0 6px;color:#67808c;font-size:13px;font-weight:600;">${esc(summaryLine(d))}</p>
    ${empty ? '<p style="color:#2E6B4F;">Nothing due today — all leads are up to date.</p>' : ""}
    ${section("#b45309", "⚡", "Speed-to-lead breaches", d.urgent)}
    ${section("#DC2626", "🔴", "Overdue actions", d.overdue)}
    ${section("#006c9b", "🟡", "Due today", d.dueToday)}
    ${section("#2E6B4F", "♻️", "Reactivation", d.reactivation)}
    <p style="margin-top:22px;color:#93a4ad;font-size:11px;">Blue Leaf Hub — internal reminder. Nothing here has been sent to any client.</p>
  </div>`;
}

/**
 * Build (and, unless dryRun, send + persist) the daily internal action digest.
 * @param {{ dryRun?: boolean, now?: Date }} opts
 * @returns rendered digest + itemised buckets (always), plus send/write result when live.
 */
export async function runLeadActionDigest({ dryRun = false, now = new Date() } = {}) {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, skipped: true, reason: "Supabase not configured." };

  const d = await gatherDigest(sb, now);
  const recipients = digestRecipients();
  const subject = `Leads today — ${summaryLine(d)}`;
  const text = renderText(d);
  const html = renderHtml(d);

  const total = d.urgent.length + d.overdue.length + d.dueToday.length + d.reactivation.length;

  // What a human reviews: who / why / which group / the link, per lead.
  const buckets = Object.fromEntries(
    ["urgent", "overdue", "dueToday", "reactivation"].map((k) => [
      k,
      d[k].map((lead) => ({
        id: lead.id, name: leadName(lead), stage: lead.stage, source: sourceLabel(lead),
        reason: reasonFor(lead), due: lead.action_due_at || lead.last_activity_at,
        owner: lead.assigned_to || null, link: leadLink(lead),
        group: k, fresh_reactivation: !!lead._isReactivationCandidate,
      })),
    ])
  );
  const preview = { summary: summaryLine(d), recipients, subject, buckets };

  if (dryRun) {
    return { ok: true, dryRun: true, total, ...preview, text, html };
  }

  // ── live ─────────────────────────────────────────────────────────────────
  // 1C: persist the reactivation flag on fresh candidates so they stay in the queue.
  let reactivated = 0;
  for (const lead of d.reactivationCandidates) {
    const { error } = await sb.from("leads")
      .update({ action_type: "reactivation", action_due_at: now.toISOString() })
      .eq("id", lead.id)
      .is("action_due_at", null); // guard: never clobber an action set since we read
    if (!error) reactivated++;
  }

  if (total === 0) {
    return { ok: true, sent: false, reason: "nothing due", reactivated, total };
  }
  if (!recipients.length) {
    return { ok: true, sent: false, reason: "no recipients configured", reactivated, total };
  }

  try {
    // Pass the recipients ARRAY (not a comma-joined string) — Resend rejects a multi-address
    // string; an array is the correct multi-recipient shape (nodemailer/SMTP also accept it).
    const r = await sendPlainMail({ to: recipients, subject, text, html });
    return { ok: true, sent: true, transport: r?.transport, recipients, reactivated, total };
  } catch (e) {
    return { ok: false, sent: false, error: e?.message || String(e), reactivated, total };
  }
}

// ── 1B — new-enquiry acknowledgement ──────────────────────────────────────────
// The one safe client-facing email. Admin-editable in Settings (stored in user_settings under
// crm_enquiry_ack); falls back to this approved default so it can never end up blank. {name} is
// the only placeholder (→ the lead's first name, or "there").
export const ENQUIRY_ACK_TEMPLATE_KEY = "crm_enquiry_ack";
export const ENQUIRY_ACK_DEFAULTS = {
  subject: "We've received your enquiry — Blue Leaf Building",
  body: [
    "Hi {name},",
    "",
    "Thanks, we've received your enquiry.",
    "",
    "Sam or Josh will review it and be in touch within one business day.",
    "",
    "Blue Leaf Building",
  ].join("\n"),
};

/** Read the admin-editable ack template from user_settings; null → use ENQUIRY_ACK_DEFAULTS. */
export async function loadEnquiryAckTemplate(sb) {
  if (!sb) return null;
  try {
    const { data } = await sb.from("user_settings").select("value").eq("key", ENQUIRY_ACK_TEMPLATE_KEY).maybeSingle();
    if (!data?.value) return null;
    const t = JSON.parse(data.value);
    if (t && typeof t === "object") return { subject: t.subject || "", body: t.body || "" };
  } catch { /* malformed → fall through to defaults */ }
  return null;
}

function ackTextToHtml(text) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const paras = String(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#17313d;font-size:15px;line-height:1.6;">${paras}</div>`;
}

/** Build the ack from the (optional) saved template, else the default. Substitutes {name}. */
export function buildEnquiryAck(lead, template = null) {
  const to = String(lead.email || "").trim();
  const first = String(lead.name || lead.first_name || "").trim().split(/\s+/)[0] || "there";
  const subject = String(template?.subject || "").trim() || ENQUIRY_ACK_DEFAULTS.subject;
  const bodyTpl = String(template?.body || "").trim() || ENQUIRY_ACK_DEFAULTS.body;
  const text = bodyTpl.replace(/\{name\}/g, first);
  return { to, subject, text, html: ackTextToHtml(text) };
}

/**
 * Send the enquiry acknowledgement (unless dryRun) and log it on the lead timeline.
 * Fail-soft: never throws to the caller (must not block the enquiry response).
 * Gated by ENQUIRY_AUTOACK_ENABLED at the call site — this just does the work.
 */
export async function sendEnquiryAck(sb, lead, { dryRun = false } = {}) {
  const template = await loadEnquiryAckTemplate(sb);
  const ack = buildEnquiryAck(lead, template);
  if (!ack.to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ack.to)) {
    return { ok: false, skipped: true, reason: "no valid email" };
  }
  if (dryRun) return { ok: true, dryRun: true, ...ack };
  try {
    const r = await sendPlainMail({ to: ack.to, subject: ack.subject, text: ack.text, html: ack.html });
    // Log on the lead timeline (best-effort).
    try {
      await sb.from("lead_activities").insert({
        lead_id: lead.id,
        activity_type: "note",
        summary: "Auto-acknowledgement email sent to client",
      });
    } catch { /* logging is best-effort */ }
    return { ok: true, sent: true, transport: r?.transport };
  } catch (e) {
    return { ok: false, sent: false, error: e?.message || String(e) };
  }
}
