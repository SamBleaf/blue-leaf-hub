// conceptEmails.mjs — Concept-stage client emails: brief-questions (pre brief meeting) + interim
// update (while concepts are being drawn). Admin-editable (user_settings key crm_concept_email),
// preview-then-send, edited copy honoured. Mirrors discoveryEmail.mjs. Text-signature only (no logo).
import { sendPlainMail } from "./notifyMail.mjs";
import { getUserSignature, formatSignatureFooter, DEFAULT_EMAIL_SIGNATURE } from "./emailSignature.mjs";
import { loadCompanyProfilePdfFromDropbox } from "./companyProfile.mjs";

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
  followup: {
    subject: "Still keen to get your concept underway?",
    body: [
      "Hello {{client_salutation}},",
      "",
      "Just following up on my note about getting your concept started with {{designer_name}}. I know life gets busy — no pressure at all, I only want to make sure nothing's slipped through.",
      "",
      "If you're ready to go, the next step is a quick brief meeting so we can capture what matters to you and get the first concept moving. If the timing isn't right just yet, let me know and I'll check back in down the track.",
      "",
      "Happy to answer anything in the meantime.",
      "",
      "{{user_signature}}",
    ].join("\n"),
  },
  // accepted_concepts — the concept→PTSA bridge: acknowledge the approved concepts and set up the
  // Pre-Tender Service Agreement + working-drawings stage. Sent from the PTSA / Plans stage.
  accepted_concepts: {
    subject: "Your concept is approved — here's what happens next",
    body: [
      "Hello {{client_salutation}},",
      "",
      "Fantastic — thank you for approving the concept. It's a big milestone, and we're really pleased with where the design has landed.",
      "",
      "From here we move into the Pre-Tender Service Agreement (PTSA) and the detailed working drawings. This is where the concept becomes a fully documented, buildable design — plans, elevations and the detail we need to price the build accurately and get you a fixed-price proposal.",
      "",
      "**Next steps:**",
      "• We'll send through the PTSA for you to review and sign.",
      "• Once signed, our designers develop the full working drawings from the approved concept.",
      "• We'll book a plan presentation to walk you through the detailed drawings before anything goes to engineering.",
      "",
      "If there were any changes we agreed at the presentation, they'll be carried into the working drawings — just reply here if anything else has come to mind since.",
      "",
      "{{user_signature}}",
    ].join("\n"),
  },
};

const CONCEPT_EMAIL_KEYS = ["brief_questions", "interim", "followup", "accepted_concepts"];
// The sent-at stamp column on `leads` for each concept email (mig 191). Used by the follow-up
// cadence + the design-lock chase. followup has no forward stamp of its own beyond the guard column.
const CONCEPT_SENT_STAMP = {
  brief_questions: "concept_brief_questions_sent_at",
  interim: "concept_interim_sent_at",
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
  const out = Object.fromEntries(CONCEPT_EMAIL_KEYS.map((k) => [k, { ...CONCEPT_EMAIL_DEFAULTS[k] }]));
  if (!sb) return out;
  try {
    const { data } = await sb.from("user_settings").select("value").eq("key", CONCEPT_EMAIL_TEMPLATE_KEY).maybeSingle();
    if (data?.value) {
      const saved = JSON.parse(data.value);
      for (const k of CONCEPT_EMAIL_KEYS) {
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
  // The company profile rides on the FIRST touch only (brief_questions) — mirrors the qualify intro.
  const attachment = which === "brief_questions"
    ? await loadCompanyProfilePdfFromDropbox(process.env.CONCEPT_EMAIL_COMPANY_PROFILE_PATH)
    : null;
  try {
    const r = await sendPlainMail({ to: email.to, subject: email.subject, text: email.text, html: email.html, attachments: attachment ? [attachment] : [], messageId: email.messageId });
    const stamp = CONCEPT_SENT_STAMP[which];
    if (stamp) { try { await sb.from("leads").update({ [stamp]: new Date().toISOString() }).eq("id", lead.id); } catch { /* pre-mig 191 — non-blocking */ } }
    await logLeadCorrespondence(sb, { leadId: lead.id, direction: "outbound", subject: email.subject, body: email.text, from: smtpFrom(), to: email.to, messageId: email.messageId });
    const label = which === "interim" ? "Concept interim update email sent" : which === "followup" ? "Concept follow-up email sent" : "Concept brief-questions email sent";
    try { await sb.from("lead_activities").insert({ lead_id: lead.id, activity_type: "email", summary: label }); } catch { /* best-effort */ }
    return { ok: true, sent: true, transport: r?.transport, attached: !!attachment, messageId: email.messageId };
  } catch (e) {
    return { ok: false, sent: false, error: e?.message || String(e) };
  }
}

/**
 * Concept follow-up cadence (mirror runDiscoveryFollowups). One client-facing chase to any
 * Concept-stage (winning_offer) lead whose brief-questions email went out ≥7 days ago, hasn't been
 * followed up, hasn't replied since, and whose design isn't approved yet. Gated at the call site by
 * CONCEPT_EMAIL_FOLLOWUP_ENABLED. Fail-soft on pre-mig-191 columns.
 */
export async function runConceptFollowups(sb) {
  if (!sb) return { ok: false, error: "No DB client" };
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: leads, error } = await sb.from("leads")
    .select("id, name, first_name, email, selected_designer_contact_id, concept_brief_questions_sent_at")
    .eq("stage", "winning_offer")
    .not("concept_brief_questions_sent_at", "is", null)
    .lte("concept_brief_questions_sent_at", cutoff)
    .is("concept_followup_sent_at", null)
    .not("concept_design_status", "eq", "approved")
    .not("is_test", "is", true);
  if (error) {
    console.warn("[concept-followup] skip:", error.message);
    return { ok: true, sent: 0, skipped: 0, note: "columns unavailable" };
  }
  const templates = await loadConceptEmailTemplates(sb);
  const signature = await getUserSignature(sb, null);
  let sent = 0, skipped = 0;
  for (const lead of leads || []) {
    try {
      const { data: inbound } = await sb.from("correspondence")
        .select("id").eq("lead_id", lead.id).eq("direction", "inbound").gt("sent_at", lead.concept_brief_questions_sent_at).limit(1);
      if (inbound && inbound.length) { skipped++; continue; }
    } catch { /* correspondence.lead_id may be absent — proceed */ }
    const designer = await loadDesigner(sb, lead);
    const email = buildConceptEmail(lead, "followup", { template: templates.followup, signature, designer });
    if (!isEmail(email.to)) { skipped++; continue; }
    try {
      await sendPlainMail({ to: email.to, subject: email.subject, text: email.text, html: email.html, messageId: email.messageId });
      await sb.from("leads").update({ concept_followup_sent_at: new Date().toISOString() }).eq("id", lead.id);
      await logLeadCorrespondence(sb, { leadId: lead.id, direction: "outbound", subject: email.subject, body: email.text, from: smtpFrom(), to: email.to, messageId: email.messageId });
      try { await sb.from("lead_activities").insert({ lead_id: lead.id, activity_type: "email", summary: "Concept follow-up email sent (no response after 7 days)" }); } catch { /* best-effort */ }
      sent++;
    } catch (e) {
      console.warn("[concept-followup] send failed for", lead.id, e?.message || e);
      skipped++;
    }
  }
  return { ok: true, sent, skipped };
}
