// tenderEmails.mjs — the Tender stage's named client emails, each a distinct action (never one
// generic "send"): proposal_followup (24h after presenting), review_followup (client reviewing),
// contract_sent (contract on its way), contract_followup (unsigned contract chase). Admin-editable
// (user_settings key crm_tender_email), preview-then-send, edited copy honoured. Text-signature only.
// Mirrors conceptEmails.mjs. Sending gated at the route by TENDER_EMAIL_ENABLED.
import { sendPlainMail } from "./notifyMail.mjs";
import { getUserSignature, formatSignatureFooter, DEFAULT_EMAIL_SIGNATURE } from "./emailSignature.mjs";

export const TENDER_EMAIL_TEMPLATE_KEY = "crm_tender_email";
export const TENDER_EMAIL_PLACEHOLDERS = ["{{client_salutation}}", "{{user_signature}}"];

export const TENDER_EMAIL_DEFAULTS = {
  proposal_followup: {
    subject: "Great to walk you through your proposal",
    body: [
      "Hello {{client_salutation}},",
      "",
      "Thank you for your time going through the fixed-price proposal with us. It was great to talk it all through and show you exactly what's included.",
      "",
      "Take your time with it — have a proper read, talk it over, and note down anything at all you'd like clarified. We'd rather answer every question now than leave you wondering about anything.",
      "",
      "When you're ready, I'm here to walk through any part of it again or make adjustments where we can. Just reply here or give me a call.",
      "",
      "{{user_signature}}",
    ].join("\n"),
  },
  review_followup: {
    subject: "Any questions on your proposal?",
    body: [
      "Hello {{client_salutation}},",
      "",
      "Just checking in on the proposal — I know there's a lot to take in, and I want to make sure you've got everything you need to feel confident about moving ahead.",
      "",
      "Is there anything you'd like me to clarify, adjust, or price differently? Sometimes it's a small change to an inclusion or an allowance that makes it all fall into place.",
      "",
      "More than happy to jump on a call whenever suits.",
      "",
      "{{user_signature}}",
    ].join("\n"),
  },
  contract_sent: {
    subject: "Your building contract is on its way",
    body: [
      "Hello {{client_salutation}},",
      "",
      "Fantastic news — thank you for choosing Blue Leaf to build your home. We're genuinely looking forward to it.",
      "",
      "I've sent through the building contract for you to review and sign. It reflects everything we agreed in the proposal — the fixed price, inclusions, specifications and timeline.",
      "",
      "Have a read through, and let me know if anything needs clarifying before you sign. Once it's signed and the deposit is arranged, we'll get your project moving.",
      "",
      "{{user_signature}}",
    ].join("\n"),
  },
  contract_followup: {
    subject: "Ready when you are — your building contract",
    body: [
      "Hello {{client_salutation}},",
      "",
      "Just following up on the building contract I sent through. No rush at all — I only want to make sure it reached you and that you've got everything you need to sign with confidence.",
      "",
      "If there's a question holding things up, let's sort it out — happy to talk through any clause or detail. Once it's signed we can lock in your start and get underway.",
      "",
      "{{user_signature}}",
    ].join("\n"),
  },
};

export const TENDER_EMAIL_KEYS = Object.keys(TENDER_EMAIL_DEFAULTS);

const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || "").trim());
const smtpFrom = () => (process.env.SMTP_FROM || "admin@blueleafbuilding.com.au").trim();
function firstName(lead) { return String(lead?.name || lead?.first_name || "").trim().split(/\s+/)[0] || "there"; }
function clientSalutation(lead) {
  const n = String(lead?.name || "").trim();
  if (n) return n.replace(/\s+&\s+/g, " and ").replace(/\s+/g, " ");
  return firstName(lead);
}

export async function loadTenderEmailTemplates(sb) {
  const out = Object.fromEntries(TENDER_EMAIL_KEYS.map((k) => [k, { ...TENDER_EMAIL_DEFAULTS[k] }]));
  if (!sb) return out;
  try {
    const { data } = await sb.from("user_settings").select("value").eq("key", TENDER_EMAIL_TEMPLATE_KEY).maybeSingle();
    if (data?.value) {
      const saved = JSON.parse(data.value);
      for (const k of TENDER_EMAIL_KEYS) {
        if (saved?.[k]?.subject) out[k].subject = String(saved[k].subject);
        if (saved?.[k]?.body) out[k].body = String(saved[k].body);
      }
    }
  } catch { /* malformed → defaults */ }
  return out;
}

function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
export function tenderTextToHtml(text) {
  const bold = (s) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const linkify = (s) => s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#3a6ea8;">$1</a>');
  const paras = String(text).split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 12px;">${block.split("\n").map((line) => linkify(bold(escapeHtml(line)))).join("<br>")}</p>`).join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#17313d;font-size:15px;line-height:1.6;">${paras}</div>`;
}

async function logLeadCorrespondence(sb, { leadId, direction, subject, body, from, to, messageId }) {
  try { await sb.from("correspondence").insert({ lead_id: leadId, direction, subject, body, email_from: from, email_to: to, message_id: messageId }); }
  catch { /* pre-migration / non-blocking */ }
}

export function buildTenderEmail(lead, which, { template, signature = null } = {}) {
  const tpl = template || TENDER_EMAIL_DEFAULTS[which] || TENDER_EMAIL_DEFAULTS.proposal_followup;
  const sig = { ...DEFAULT_EMAIL_SIGNATURE, ...(signature || {}) };
  const tokens = {
    "{{client_salutation}}": clientSalutation(lead),
    "{{user_signature}}": formatSignatureFooter(sig),
  };
  const sub = (s) => Object.entries(tokens).reduce((acc, [k, v]) => acc.split(k).join(v), String(s || ""));
  const subject = sub(tpl.subject).trim();
  const textBody = sub(tpl.body);
  return {
    to: String(lead?.email || "").trim(), subject, text: textBody, html: tenderTextToHtml(textBody),
    messageId: `<tender-${which}-${lead?.id || "x"}-${Date.now()}@blueleafbuilding.com.au>`,
  };
}

const LABELS = {
  proposal_followup: "Proposal follow-up (24h) email sent",
  review_followup: "Client-review follow-up email sent",
  contract_sent: "Contract-sent email sent",
  contract_followup: "Unsigned-contract follow-up email sent",
};

/** Send a Tender named email, or a preview when dryRun. */
export async function sendTenderEmail(sb, lead, { which = "proposal_followup", userId = null, dryRun = false, override = null } = {}) {
  const w = TENDER_EMAIL_KEYS.includes(which) ? which : "proposal_followup";
  const templates = await loadTenderEmailTemplates(sb);
  const signature = await getUserSignature(sb, userId);
  let email = buildTenderEmail(lead, w, { template: templates[w], signature });
  if (!isEmail(email.to)) return { ok: false, skipped: true, reason: "no valid email on lead" };
  if (dryRun) return { ok: true, dryRun: true, ...email };
  if (override?.subject && override?.text) {
    email = { ...email, subject: String(override.subject).trim(), text: String(override.text), html: tenderTextToHtml(String(override.text)) };
  }
  try {
    const r = await sendPlainMail({ to: email.to, subject: email.subject, text: email.text, html: email.html, messageId: email.messageId });
    await logLeadCorrespondence(sb, { leadId: lead.id, direction: "outbound", subject: email.subject, body: email.text, from: smtpFrom(), to: email.to, messageId: email.messageId });
    try { await sb.from("lead_activities").insert({ lead_id: lead.id, activity_type: "email", summary: LABELS[w] || "Tender email sent" }); } catch { /* best-effort */ }
    return { ok: true, sent: true, transport: r?.transport, messageId: email.messageId };
  } catch (e) {
    return { ok: false, sent: false, error: e?.message || String(e) };
  }
}
