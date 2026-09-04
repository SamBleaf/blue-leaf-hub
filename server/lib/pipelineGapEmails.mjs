// pipelineGapEmails.mjs — the sales-pipeline emails that didn't have a home yet: the PTSA covering
// email, the contract-signed welcome + Operations handoff (Won), the nurture check-in and the lost
// close-off, and the "tender started" client update. One admin-editable family (user_settings key
// crm_pipeline_email), preview-then-send, edited copy honoured, text-signature only. Mirrors
// tenderEmails.mjs exactly. Sending gated at the route by PIPELINE_EMAIL_ENABLED. These are NEW keys —
// they never touch the existing qualify/discovery/concept/tender/invoice families (Sam's own wording).
import { sendPlainMail } from "./notifyMail.mjs";
import { getUserSignature, formatSignatureFooter, DEFAULT_EMAIL_SIGNATURE } from "./emailSignature.mjs";

export const PIPELINE_EMAIL_TEMPLATE_KEY = "crm_pipeline_email";
export const PIPELINE_EMAIL_PLACEHOLDERS = ["{{client_salutation}}", "{{ptsa_fee}}", "{{user_signature}}"];

export const PIPELINE_EMAIL_DEFAULTS = {
  // PTSA / Plans — covering email when sending the PTSA agreement for signature.
  ptsa_covering: {
    subject: "The next step — your PTSA / Plans agreement",
    body: [
      "Hello {{client_salutation}},",
      "",
      "With the concept direction locked in, the next step is the PTSA / Plans stage — where we turn the approved concept into a proper set of working drawings, ready for the consultants and final pricing.",
      "",
      "I've prepared the PTSA / pre-construction agreement for you. It covers the working drawings, elevations, 3D views where they help, and the coordination we need to do before engineering, certification and the final proposal.",
      "",
      "The fee for this stage is {{ptsa_fee}}. Once it's signed we'll raise the pre-construction / design fee invoice and get the drawings underway.",
      "",
      "Have a read through, and tell me if anything needs clarifying before you sign.",
      "",
      "{{user_signature}}",
    ].join("\n"),
  },
  // Won — the contract-signed welcome. A major trust point; warm, not corporate.
  contract_signed: {
    subject: "Welcome aboard — your build is on",
    body: [
      "Hello {{client_salutation}},",
      "",
      "Thank you for signing the building contract — we're genuinely thrilled to be building your home with you.",
      "",
      "From here we move from planning into preparation. Behind the scenes we're lining everything up — the signed contract, the proposal, the drawings, specifications, selections and approvals — so that when we start on site, nothing's left to chance.",
      "",
      "Over the coming weeks you'll hear from us about the deposit, the approval and certification status, the final details and your start assumptions. We'll keep you in the loop the whole way through.",
      "",
      "Thanks again for trusting us with it — let's build something you'll be proud of.",
      "",
      "{{user_signature}}",
    ].join("\n"),
  },
  // Won / Ops Ready — the project has moved from Sales into the build team.
  ops_handoff: {
    subject: "Your project is moving into our build team",
    body: [
      "Hello {{client_salutation}},",
      "",
      "A quick update — we've now completed the handover from our sales side into our project delivery team.",
      "",
      "Everything from the sales stage — the contract, the proposal, the drawings, specifications and selections — has been moved across into the systems our build team runs day to day. The focus now shifts from paperwork to getting your project ready for site.",
      "",
      "We'll be in touch as we lock in the next steps toward your start. If anything comes up in the meantime, you know where to find me.",
      "",
      "{{user_signature}}",
    ].join("\n"),
  },
  // Nurture — timing isn't right yet; keep the relationship warm.
  nurture: {
    subject: "Keeping in touch about your project",
    body: [
      "Hello {{client_salutation}},",
      "",
      "Thanks again for talking to us about your project. It sounds like the timing might not be quite right just yet — and that's completely fine.",
      "",
      "I'll keep your details on hand and check back in down the track. In the meantime, if it helps, the things worth getting clear early are usually the budget, the site and the design direction — sorting those first tends to make everything after it a lot smoother.",
      "",
      "Whenever you're ready to pick it back up, just reply here and we'll carry on from where we left off.",
      "",
      "{{user_signature}}",
    ].join("\n"),
  },
  // Lost — a respectful close-off that leaves the door open.
  lost: {
    subject: "Closing off your enquiry for now",
    body: [
      "Hello {{client_salutation}},",
      "",
      "Just closing the loop on your enquiry.",
      "",
      "Based on where things are sitting, I'll take it off our active list for now — no problem at all. If the project comes back around and you think we might be the right fit, you're always welcome to get back in touch.",
      "",
      "All the best with it.",
      "",
      "{{user_signature}}",
    ].join("\n"),
  },
  // Tender — final pricing has started (optional client update).
  tender_started: {
    subject: "We've started pricing your build",
    body: [
      "Hello {{client_salutation}},",
      "",
      "Good news — your project has moved into final tendering. This is where we bring it all together: the drawings, the consultant information, the specifications, allowances and selections, and the trade and supplier pricing that sit behind an accurate fixed price.",
      "",
      "This stage takes a little time on purpose — we'd rather give you a number we stand behind than a rushed guess with gaps in it.",
      "",
      "Once it's all in and the proposal is ready, we'll book a time to walk you through it properly.",
      "",
      "{{user_signature}}",
    ].join("\n"),
  },
};

export const PIPELINE_EMAIL_KEYS = Object.keys(PIPELINE_EMAIL_DEFAULTS);

const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || "").trim());
const smtpFrom = () => (process.env.SMTP_FROM || "admin@blueleafbuilding.com.au").trim();
function firstName(lead) { return String(lead?.name || lead?.first_name || "").trim().split(/\s+/)[0] || "there"; }
function clientSalutation(lead) {
  const n = String(lead?.name || "").trim();
  if (n) return n.replace(/\s+&\s+/g, " and ").replace(/\s+/g, " ");
  return firstName(lead);
}
function ptsaFee(lead) {
  const v = lead?.design_package_fee ?? lead?.preconstruction_fee ?? null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "confirmed in the agreement";
  const inc = Math.round(n * 1.1);
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(inc) + " incl. GST";
}

export async function loadPipelineEmailTemplates(sb) {
  const out = Object.fromEntries(PIPELINE_EMAIL_KEYS.map((k) => [k, { ...PIPELINE_EMAIL_DEFAULTS[k] }]));
  if (!sb) return out;
  try {
    const { data } = await sb.from("user_settings").select("value").eq("key", PIPELINE_EMAIL_TEMPLATE_KEY).maybeSingle();
    if (data?.value) {
      const saved = JSON.parse(data.value);
      for (const k of PIPELINE_EMAIL_KEYS) {
        if (saved?.[k]?.subject) out[k].subject = String(saved[k].subject);
        if (saved?.[k]?.body) out[k].body = String(saved[k].body);
      }
    }
  } catch { /* malformed → defaults */ }
  return out;
}

function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
export function pipelineTextToHtml(text) {
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

export function buildPipelineEmail(lead, which, { template, signature = null } = {}) {
  const tpl = template || PIPELINE_EMAIL_DEFAULTS[which] || PIPELINE_EMAIL_DEFAULTS.contract_signed;
  const sig = { ...DEFAULT_EMAIL_SIGNATURE, ...(signature || {}) };
  const tokens = {
    "{{client_salutation}}": clientSalutation(lead),
    "{{ptsa_fee}}": ptsaFee(lead),
    "{{user_signature}}": formatSignatureFooter(sig),
  };
  const sub = (s) => Object.entries(tokens).reduce((acc, [k, v]) => acc.split(k).join(v), String(s || ""));
  const subject = sub(tpl.subject).trim();
  const textBody = sub(tpl.body);
  return {
    to: String(lead?.email || "").trim(), subject, text: textBody, html: pipelineTextToHtml(textBody),
    messageId: `<pipeline-${which}-${lead?.id || "x"}-${Date.now()}@blueleafbuilding.com.au>`,
  };
}

const LABELS = {
  ptsa_covering: "PTSA covering email sent",
  contract_signed: "Contract-signed welcome email sent",
  ops_handoff: "Operations-handoff update email sent",
  nurture: "Nurture check-in email sent",
  lost: "Lost close-off email sent",
  tender_started: "Tender-started update email sent",
};

/** Send a pipeline gap email, or a preview when dryRun. */
export async function sendPipelineEmail(sb, lead, { which = "contract_signed", userId = null, dryRun = false, override = null } = {}) {
  const w = PIPELINE_EMAIL_KEYS.includes(which) ? which : "contract_signed";
  const templates = await loadPipelineEmailTemplates(sb);
  const signature = await getUserSignature(sb, userId);
  let email = buildPipelineEmail(lead, w, { template: templates[w], signature });
  if (!isEmail(email.to)) return { ok: false, skipped: true, reason: "no valid email on lead" };
  if (dryRun) return { ok: true, dryRun: true, ...email };
  if (override?.subject && override?.text) {
    email = { ...email, subject: String(override.subject).trim(), text: String(override.text), html: pipelineTextToHtml(String(override.text)) };
  }
  try {
    const r = await sendPlainMail({ to: email.to, subject: email.subject, text: email.text, html: email.html, messageId: email.messageId });
    await logLeadCorrespondence(sb, { leadId: lead.id, direction: "outbound", subject: email.subject, body: email.text, from: smtpFrom(), to: email.to, messageId: email.messageId });
    try { await sb.from("lead_activities").insert({ lead_id: lead.id, activity_type: "email", summary: LABELS[w] || "Pipeline email sent" }); } catch { /* best-effort */ }
    return { ok: true, sent: true, transport: r?.transport, messageId: email.messageId };
  } catch (e) {
    return { ok: false, sent: false, error: e?.message || String(e) };
  }
}
