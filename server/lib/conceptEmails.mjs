// conceptEmails.mjs — Concept-stage client emails: brief-questions (pre brief meeting) + interim
// update (while concepts are being drawn). Admin-editable (user_settings key crm_concept_email),
// preview-then-send, edited copy honoured. Mirrors discoveryEmail.mjs. Text-signature only (no logo).
import { sendPlainMail } from "./notifyMail.mjs";
import { getUserSignature, formatSignatureFooter, DEFAULT_EMAIL_SIGNATURE } from "./emailSignature.mjs";

export const CONCEPT_EMAIL_TEMPLATE_KEY = "crm_concept_email";
export const CONCEPT_EMAIL_PLACEHOLDERS = [
  "{{client_salutation}}", "{{designer_name}}", "{{designer_company}}", "{{user_signature}}",
];

export const CONCEPT_EMAIL_DEFAULTS = {
  brief_questions: {
    subject: "Before we design your concept — a few things to start thinking about",
    body: [
      "Hello {{client_salutation}},",
      "",
      "We're looking forward to getting started on your concept with {{designer_name}}. Before our brief meeting, it helps enormously if you've had a chance to gather your thoughts — the clearer the brief, the better the first concept.",
      "",
      "A few things worth collating before we meet:",
      "",
      "**The way you want to live** — how you use the spaces day to day, what's working now and what isn't, the rooms that matter most.",
      "**Must-haves vs would-likes** — the non-negotiables, then the wish list if the budget allows.",
      "**Style + finishes** — any looks, materials or finishes you're drawn to. Photos, Pinterest boards, magazine tears — anything that shows us what you love is gold.",
      "**Practical needs** — storage, work-from-home, cars, pets, future-proofing.",
      "",
      "Don't worry about getting it perfect — that's what the meeting is for. Just bring what you have and we'll shape it together.",
      "",
      "{{user_signature}}",
    ].join("\n"),
  },
  interim: {
    subject: "Your concept is underway",
    body: [
      "Hello {{client_salutation}},",
      "",
      "Just a quick update — {{designer_name}} is now working on your concept drawings based on everything we covered. We'll have the first concepts back to you shortly to walk through together.",
      "",
      "In the meantime, if any more inspiration turns up — a finish you love, a layout idea, a material you'd like us to consider — send it through any time. The more we understand your style, the sharper the concept.",
      "",
      "We'll be in touch to book the concept presentation as soon as the drawings are ready.",
      "",
      "{{user_signature}}",
    ].join("\n"),
  },
};

const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || "").trim());
const smtpFrom = () => (process.env.SMTP_FROM || "admin@blueleafbuilding.com.au").trim();
function firstName(lead) { return String(lead?.name || lead?.first_name || "").trim().split(/\s+/)[0] || "there"; }
function clientSalutation(lead) {
  const n = String(lead?.name || "").trim();
  if (n) return n.replace(/\s+&\s+/g, " and ").replace(/\s+/g, " ");
  return firstName(lead);
}

export async function loadConceptEmailTemplates(sb) {
  const out = { brief_questions: { ...CONCEPT_EMAIL_DEFAULTS.brief_questions }, interim: { ...CONCEPT_EMAIL_DEFAULTS.interim } };
  if (!sb) return out;
  try {
    const { data } = await sb.from("user_settings").select("value").eq("key", CONCEPT_EMAIL_TEMPLATE_KEY).maybeSingle();
    if (data?.value) {
      const saved = JSON.parse(data.value);
      for (const k of ["brief_questions", "interim"]) {
        if (saved?.[k]?.subject) out[k].subject = String(saved[k].subject);
        if (saved?.[k]?.body) out[k].body = String(saved[k].body);
      }
    }
  } catch { /* malformed → defaults */ }
  return out;
}

function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
export function conceptTextToHtml(text) {
  const bold = (s) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const linkify = (s) => s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#3a6ea8;">$1</a>');
  const paras = String(text).split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 12px;">${block.split("\n").map((line) => linkify(bold(escapeHtml(line)))).join("<br>")}</p>`).join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#17313d;font-size:15px;line-height:1.6;">${paras}</div>`;
}

async function loadDesigner(sb, lead) {
  if (!lead?.selected_designer_contact_id) return null;
  try {
    const { data } = await sb.from("crm_contacts").select("first_name, last_name, company").eq("id", lead.selected_designer_contact_id).maybeSingle();
    return data || null;
  } catch { return null; }
}
async function logLeadCorrespondence(sb, { leadId, direction, subject, body, from, to, messageId }) {
  try { await sb.from("correspondence").insert({ lead_id: leadId, direction, subject, body, email_from: from, email_to: to, message_id: messageId }); }
  catch { /* pre-migration / non-blocking */ }
}

export function buildConceptEmail(lead, which, { template, signature = null, designer = null } = {}) {
  const tpl = template || CONCEPT_EMAIL_DEFAULTS[which] || CONCEPT_EMAIL_DEFAULTS.brief_questions;
  const sig = { ...DEFAULT_EMAIL_SIGNATURE, ...(signature || {}) };
  const designerName = designer ? `${designer.first_name || ""} ${designer.last_name || ""}`.trim() : "your designer";
  const tokens = {
    "{{client_salutation}}": clientSalutation(lead),
    "{{designer_name}}": designerName,
    "{{designer_company}}": designer?.company || designerName,
    "{{user_signature}}": formatSignatureFooter(sig),
  };
  const sub = (s) => Object.entries(tokens).reduce((acc, [k, v]) => acc.split(k).join(v), String(s || ""));
  const subject = sub(tpl.subject).trim();
  const textBody = sub(tpl.body);
  return {
    to: String(lead?.email || "").trim(), subject, text: textBody, html: conceptTextToHtml(textBody),
    messageId: `<concept-${which}-${lead?.id || "x"}-${Date.now()}@blueleafbuilding.com.au>`,
  };
}

/** Send a Concept email (brief_questions|interim), or a preview when dryRun. */
export async function sendConceptEmail(sb, lead, { which = "brief_questions", userId = null, dryRun = false, override = null } = {}) {
  const templates = await loadConceptEmailTemplates(sb);
  const designer = await loadDesigner(sb, lead);
  const signature = await getUserSignature(sb, userId);
  let email = buildConceptEmail(lead, which, { template: templates[which], signature, designer });
  if (!isEmail(email.to)) return { ok: false, skipped: true, reason: "no valid email on lead" };
  if (dryRun) return { ok: true, dryRun: true, ...email };
  if (override?.subject && override?.text) {
    email = { ...email, subject: String(override.subject).trim(), text: String(override.text), html: conceptTextToHtml(String(override.text)) };
  }
  try {
    const r = await sendPlainMail({ to: email.to, subject: email.subject, text: email.text, html: email.html, messageId: email.messageId });
    await logLeadCorrespondence(sb, { leadId: lead.id, direction: "outbound", subject: email.subject, body: email.text, from: smtpFrom(), to: email.to, messageId: email.messageId });
    const label = which === "interim" ? "Concept interim update email sent" : "Concept brief-questions email sent";
    try { await sb.from("lead_activities").insert({ lead_id: lead.id, activity_type: "email", summary: label }); } catch { /* best-effort */ }
    return { ok: true, sent: true, transport: r?.transport, messageId: email.messageId };
  } catch (e) {
    return { ok: false, sent: false, error: e?.message || String(e) };
  }
}
