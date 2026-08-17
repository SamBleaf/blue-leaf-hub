// discoveryEmail.mjs — Sales OS Discovery stage. A clone of qualifyEmail.mjs: two client emails
// (intro + 7-day follow-up), admin-editable (user_settings key crm_discovery_email), seeded from
// Sam's real, well-received discovery email. Introduces the chosen designer and outlines the whole
// process + the concept / full-design fees (rendered INC-GST from ex-GST stored values).
//
// Tokens: {{client_salutation}}, {{designer_name}}, {{designer_company}}, {{concept_fee}},
// {{design_package_fee}}, {{meeting_attendees}}, {{user_signature}}. Literal merges only.

import { sendPlainMail } from "./notifyMail.mjs";
import { getUserSignature, formatSignatureFooter, DEFAULT_EMAIL_SIGNATURE } from "./emailSignature.mjs";
import { buildLeadBookingLink } from "./calcom.mjs";
import { incGst } from "./constants.mjs";
import { driveConfigured, uploadDocxToDrive, exportDriveFileAsPdf, deleteDriveFile } from "./googleDriveClient.mjs";

export const DISCOVERY_EMAIL_TEMPLATE_KEY = "crm_discovery_email";
export const DISCOVERY_EMAIL_PLACEHOLDERS = [
  "{{client_salutation}}", "{{designer_name}}", "{{designer_company}}",
  "{{concept_fee}}", "{{design_package_fee}}", "{{meeting_attendees}}",
  "{{designer_meeting_link}}", "{{user_signature}}",
];

export const DISCOVERY_EMAIL_DEFAULTS = {
  intro: {
    subject: "Your project with Blue Leaf — next steps and your designer, {{designer_name}}",
    body: [
      "Hello {{client_salutation}},",
      "",
      "It was lovely to meet you during our last meeting. We are genuinely excited for your project and look forward to turning your dreams into something we can all be proud of.",
      "",
      "From our last meeting we have reviewed our notes and have decided on the designer best suited to your project. We would like to introduce you to {{designer_name}} from {{designer_company}}. {{designer_name}} is our recommended designer for your project and, based on your brief along with our past experience working with them, we feel they will be a great fit to help bring your ideas to life.",
      "",
      "We are getting in touch to outline the next steps following your site meeting, so below we have outlined our process from here.",
      "",
      "**1. Concept Design Package — {{concept_fee}} inc GST**",
      "This stage includes a follow-up meeting with {{meeting_attendees}} to run through measurements, ideas, and any key design considerations. From there, {{designer_name}} will prepare two concept drawings for your project.",
      "We have found this small upfront fee helps ensure everyone is aligned before moving into more detailed design work. You will receive the concepts via email, and we will give you time to review them before meeting again to discuss any changes.",
      "",
      "**2. Full Design Package — {{design_package_fee}} inc GST**",
      "If you are happy with the concepts and wish to proceed, we can then move into the full design process. This includes a complete set of planning documents (floor plans, elevations, interiors and site plans, all yours to keep), the engineering documentation required for approval, management of the entire planning-approval process, and full coordination from Blue Leaf throughout — keeping the project aligned with your budget, your design preferences, and a smooth path toward construction.",
      "",
      "**3. Fixed Price Building Proposal**",
      "Once your plans are approved and all documentation is finalised, we will prepare a Fixed Price Building Proposal. If accepted, we can then move into a building contract — and from there, the next step is breaking ground and starting the build.",
      "",
      "We know this is a lot to take in, but we prefer to give you a clear picture of the process early on so there are no surprises later. We will be in touch in a few days to hear your thoughts, and if you're ready, you can grab a time that suits to meet {{designer_name}} and begin the concept design stage here: {{designer_meeting_link}}",
      "",
      "In the meantime, if you have any inspiration, mood boards, or design ideas, please feel free to send them through at any time — the more we understand your style, the better.",
      "",
      "{{user_signature}}",
    ].join("\n"),
  },
  followup: {
    subject: "Following up — your project with Blue Leaf",
    body: [
      "Hello {{client_salutation}},",
      "",
      "Just following up on the next steps we sent through last week for your project. Whenever you're ready, the best place to start is the concept design stage with {{designer_name}} — a short follow-up meeting to run through your ideas, then two concept drawings prepared for you.",
      "",
      "If you have any questions about the process or the fees, just let us know. And whenever you're ready to book that intro meeting with {{designer_name}}, you can pick a time that suits here: {{designer_meeting_link}}",
      "",
      "No pressure either way — we just want to make sure you have a clear next step whenever the timing feels right.",
      "",
      "{{user_signature}}",
    ].join("\n"),
  },
};

const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || "").trim());
const smtpFrom = () => (process.env.SMTP_FROM || "admin@blueleafbuilding.com.au").trim();

function firstName(lead) {
  return String(lead?.name || lead?.first_name || "").trim().split(/\s+/)[0] || "there";
}
// Address the client as entered — compound couples ("Jenna & Adam" → "Jenna and Adam") kept intact
// (mirrors salutationFromClientName); falls back to the first name.
function clientSalutation(lead) {
  const n = String(lead?.name || "").trim();
  if (n) return n.replace(/\s+&\s+/g, " and ").replace(/\s+/g, " ");
  return firstName(lead);
}
// Client-facing fee: stored EX-GST → rendered INC-GST, rounded to whole dollars (fees are round).
function feeIncGst(exGst) {
  if (exGst == null || exGst === "") return "[fee to be confirmed]";
  return "$" + Math.round(incGst(exGst)).toLocaleString("en-AU");
}

export async function loadDiscoveryEmailTemplates(sb) {
  const out = { intro: { ...DISCOVERY_EMAIL_DEFAULTS.intro }, followup: { ...DISCOVERY_EMAIL_DEFAULTS.followup } };
  if (!sb) return out;
  try {
    const { data } = await sb.from("user_settings").select("value").eq("key", DISCOVERY_EMAIL_TEMPLATE_KEY).maybeSingle();
    if (data?.value) {
      const saved = JSON.parse(data.value);
      for (const k of ["intro", "followup"]) {
        if (saved?.[k]?.subject) out[k].subject = String(saved[k].subject);
        if (saved?.[k]?.body) out[k].body = String(saved[k].body);
      }
    }
  } catch { /* malformed → defaults */ }
  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
function discoveryTextToHtml(text) {
  const linkify = (s) => s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#3a6ea8;">$1</a>');
  const bold = (s) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const paras = String(text)
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 12px;">${block.split("\n").map((line) => linkify(bold(escapeHtml(line)))).join("<br>")}</p>`)
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#17313d;font-size:15px;line-height:1.6;">${paras}</div>`;
}

/** designer = { first_name, last_name, company } | null. */
export function buildDiscoveryEmail(lead, which, { template, signature = null, designer = null } = {}) {
  const tpl = template || DISCOVERY_EMAIL_DEFAULTS[which] || DISCOVERY_EMAIL_DEFAULTS.intro;
  const sig = { ...DEFAULT_EMAIL_SIGNATURE, ...(signature || {}) };
  const designerName = designer ? `${designer.first_name || ""} ${designer.last_name || ""}`.trim() : "your designer";
  const designerCompany = designer?.company || designerName;
  const attendees = String(lead?.discovery_meeting_attendees || "").trim() || `${designerName} and the Blue Leaf team`;
  const tokens = {
    "{{client_salutation}}": clientSalutation(lead),
    "{{designer_name}}": designerName,
    "{{designer_company}}": designerCompany,
    "{{concept_fee}}": feeIncGst(lead?.concept_fee),
    "{{design_package_fee}}": feeIncGst(lead?.design_package_fee),
    "{{meeting_attendees}}": attendees,
    "{{designer_meeting_link}}": buildLeadBookingLink(lead || {}, "designer_meeting"),
    "{{user_signature}}": formatSignatureFooter(sig),
  };
  const sub = (s) => Object.entries(tokens).reduce((acc, [k, v]) => acc.split(k).join(v), String(s || ""));
  const subject = sub(tpl.subject).trim();
  const textBody = sub(tpl.body);
  return {
    to: String(lead?.email || "").trim(),
    subject,
    text: textBody,
    html: discoveryTextToHtml(textBody),
    messageId: `<discovery-${which}-${lead?.id || "x"}-${Date.now()}@blueleafbuilding.com.au>`,
  };
}

async function loadDesigner(sb, lead) {
  if (!lead?.selected_designer_contact_id) return null;
  try {
    const { data } = await sb.from("crm_contacts").select("first_name, last_name, company").eq("id", lead.selected_designer_contact_id).maybeSingle();
    return data || null;
  } catch { return null; }
}

// Optional attachment: the generated concept agreement. Clients should receive a PDF, not
// an editable DOCX — so when the stored doc is a DOCX and Google Drive is configured, convert
// it to PDF via Google Docs (upload → export → cleanup). Falls back to the DOCX if Drive is
// unavailable or the conversion fails, so the email still goes out.
async function loadConceptAgreementAttachment(sb, lead) {
  const path = String(lead?.concept_agreement_document_path || "").trim();
  if (!path) return null;
  try {
    const { data, error } = await sb.storage.from("lead-documents").download(path);
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    const isDocx = /\.docx$/i.test(path);
    const baseName = (path.split("/").pop() || "Concept-Agreement.docx").replace(/\.docx$/i, "");

    if (isDocx && driveConfigured()) {
      let fileId = null;
      try {
        ({ fileId } = await uploadDocxToDrive(`${baseName}.docx`, buf));
        const pdf = await exportDriveFileAsPdf(fileId);
        return { filename: `${baseName}.pdf`, content: pdf, mimeType: "application/pdf" };
      } catch {
        /* conversion failed — fall through to the DOCX below so the email still sends */
      } finally {
        if (fileId) { try { await deleteDriveFile(fileId); } catch { /* best-effort cleanup */ } }
      }
    }

    return {
      filename: path.split("/").pop() || (isDocx ? "Concept-Agreement.docx" : "Concept-Agreement.pdf"),
      content: buf,
      mimeType: isDocx ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf",
    };
  } catch { return null; }
}

async function logLeadCorrespondence(sb, { leadId, direction, subject, body, from, to, messageId }) {
  try {
    await sb.from("correspondence").insert({
      lead_id: leadId, direction, subject, body, email_from: from, email_to: to, message_id: messageId,
    });
  } catch { /* pre-migration or logging failure — non-blocking */ }
}

/** Send the discovery INTRODUCTION email (or a preview when dryRun). Requires a selected designer. */
export async function sendDiscoveryIntro(sb, lead, { userId = null, dryRun = false, attachAgreement = false, override = null } = {}) {
  const templates = await loadDiscoveryEmailTemplates(sb);
  const designer = await loadDesigner(sb, lead);
  if (!designer) return { ok: false, skipped: true, reason: "no designer selected for this lead" };
  const signature = await getUserSignature(sb, userId);
  let email = buildDiscoveryEmail(lead, "intro", { template: templates.intro, signature, designer });
  if (!isEmail(email.to)) return { ok: false, skipped: true, reason: "no valid email on lead" };
  if (dryRun) return { ok: true, dryRun: true, ...email };
  // Operator's EDITED copy from the preview (already token-filled).
  if (override?.subject && override?.text) {
    email = { ...email, subject: String(override.subject).trim(), text: String(override.text), html: discoveryTextToHtml(String(override.text)) };
  }
  const attachment = attachAgreement ? await loadConceptAgreementAttachment(sb, lead) : null;
  try {
    const r = await sendPlainMail({
      to: email.to, subject: email.subject, text: email.text, html: email.html,
      attachments: attachment ? [attachment] : [], messageId: email.messageId,
    });
    await sb.from("leads").update({ discovery_email_sent_at: new Date().toISOString() }).eq("id", lead.id);
    await logLeadCorrespondence(sb, { leadId: lead.id, direction: "outbound", subject: email.subject, body: email.text, from: smtpFrom(), to: email.to, messageId: email.messageId });
    try { await sb.from("lead_activities").insert({ lead_id: lead.id, activity_type: "email", summary: "Discovery process email sent to client" }); } catch { /* best-effort */ }
    return { ok: true, sent: true, transport: r?.transport, attached: !!attachment, messageId: email.messageId };
  } catch (e) {
    return { ok: false, sent: false, error: e?.message || String(e) };
  }
}

/** The 7-day discovery follow-up cadence (mirror runQualifyFollowups). Behind DISCOVERY_FOLLOWUP_ENABLED. */
export async function runDiscoveryFollowups(sb) {
  if (!sb) return { ok: false, error: "No DB client" };
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: leads, error } = await sb.from("leads")
    .select("id, name, first_name, email, selected_designer_contact_id, concept_fee, design_package_fee, discovery_meeting_attendees, discovery_email_sent_at")
    .eq("stage", "discovery")
    .not("discovery_email_sent_at", "is", null)
    .lte("discovery_email_sent_at", cutoff)
    .is("discovery_followup_sent_at", null)
    .not("concept_agreement_status", "eq", "accepted")
    .not("is_test", "is", true);
  if (error) {
    console.warn("[discovery-followup] skip:", error.message);
    return { ok: true, sent: 0, skipped: 0, note: "columns unavailable" };
  }
  const templates = await loadDiscoveryEmailTemplates(sb);
  const signature = await getUserSignature(sb, null);
  let sent = 0, skipped = 0;
  for (const lead of leads || []) {
    try {
      const { data: inbound } = await sb.from("correspondence")
        .select("id").eq("lead_id", lead.id).eq("direction", "inbound").gt("sent_at", lead.discovery_email_sent_at).limit(1);
      if (inbound && inbound.length) { skipped++; continue; }
    } catch { /* correspondence.lead_id may be absent — proceed */ }
    const designer = await loadDesigner(sb, lead);
    const email = buildDiscoveryEmail(lead, "followup", { template: templates.followup, signature, designer });
    if (!isEmail(email.to)) { skipped++; continue; }
    try {
      await sendPlainMail({ to: email.to, subject: email.subject, text: email.text, html: email.html, messageId: email.messageId });
      await sb.from("leads").update({ discovery_followup_sent_at: new Date().toISOString() }).eq("id", lead.id);
      await logLeadCorrespondence(sb, { leadId: lead.id, direction: "outbound", subject: email.subject, body: email.text, from: smtpFrom(), to: email.to, messageId: email.messageId });
      try { await sb.from("lead_activities").insert({ lead_id: lead.id, activity_type: "email", summary: "Discovery follow-up email sent (no response after 7 days)" }); } catch { /* best-effort */ }
      sent++;
    } catch (e) {
      console.warn("[discovery-followup] send failed for", lead.id, e?.message || e);
      skipped++;
    }
  }
  return { ok: true, sent, skipped };
}
