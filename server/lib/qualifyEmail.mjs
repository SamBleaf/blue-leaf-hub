// qualifyEmail.mjs — Sales OS Slice 1, workstream B: the Qualify email sequence.
//
// Two client-facing emails, both admin-editable (user_settings key crm_qualify_email) and both
// seeded from the approved defaults so they can never end up blank:
//   • intro    — sent when the salesperson triggers it; attaches the company-profile PDF.
//   • followup — auto-sent 7 days later by runQualifyFollowups() if the lead hasn't booked/replied.
//
// Copy is grounded in the website's real process language (Process.vue) + brand voice (CONTENT.txt):
// the meeting is a "build conversation", the consultant step is the "design pathway", and the
// journey is the real 7 stages. Only LITERAL merges (no client free-text is ever auto-inserted) —
// the heavy answer→snippet branching is a later Discovery-stage concern.
//
// Merge tokens ({{...}}): client_first_name, project_type, project_suburb, cal_booking_link,
// sender_phone, user_signature.

import { sendPlainMail } from "./notifyMail.mjs";
import { getUserSignature, formatSignatureFooter, DEFAULT_EMAIL_SIGNATURE } from "./emailSignature.mjs";
import { buildLeadBookingLink } from "./calcom.mjs";
import { getBrandingEmailLogo } from "./brandingAssets.mjs";
import { emailLogoBlockHtml } from "./signatureEmailHtml.mjs";

export const QUALIFY_EMAIL_TEMPLATE_KEY = "crm_qualify_email";
export const QUALIFY_EMAIL_PLACEHOLDERS = [
  "{{client_first_name}}", "{{project_type}}", "{{project_suburb}}",
  "{{cal_booking_link}}", "{{sender_phone}}", "{{user_signature}}",
];

export const QUALIFY_EMAIL_DEFAULTS = {
  intro: {
    subject: "Your {{project_type}} in {{project_suburb}} — the next step with Blue Leaf",
    body: [
      "Hi {{client_first_name}},",
      "",
      "Thanks for taking the time to talk through your {{project_type}} in {{project_suburb}}.",
      "",
      "The best next step is a build conversation — 30 minutes with Sam or Josh, video or phone. You tell us about your site and brief; we give you a straight answer on whether we're the right fit, including if we're not. No sales pitch, no obligation.",
      "",
      "It's worth knowing how a Blue Leaf build works, because most of what decides how a project turns out happens before construction starts:",
      "",
      "- Discovery & fit — we talk through your site, goals, budget range, timing and where you're up to, and whether Blue Leaf is the right fit.",
      "- Design pathway — if you need design support, we match your project with the right architect or designer for your style, budget and site, and stay involved to keep them on track. If you already have one, we work with them.",
      "- Pre-construction planning — builder input comes in early, so scope, buildability, selections and the risks specific to your site get worked through while decisions are still cheap to change.",
      "- Documentation & pricing — a clear, itemised proposal: what's included, what carries an allowance, what's excluded, and where the risks sit.",
      "- Contract & scheduling — once scope and price are agreed, we set the contract and a realistic schedule.",
      "- Construction — close supervision, plain-English updates, and variations agreed in writing before work proceeds.",
      "- Handover & aftercare — a thorough handover, clear records, and a builder who stays reachable afterwards.",
      "",
      "You can book your build conversation here:",
      "{{cal_booking_link}}",
      "",
      "I've attached our company profile so you can get a feel for how we work and the standard we build to.",
      "",
      "{{user_signature}}",
    ].join("\n"),
  },
  followup: {
    subject: "Following up — your {{project_type}} in {{project_suburb}}",
    body: [
      "Hi {{client_first_name}},",
      "",
      "Just following up on your {{project_type}} in {{project_suburb}}. I sent through how Blue Leaf works last week — the best place to start is still a build conversation: a short call to talk through where your project's up to, what you're after, and whether we're the right fit.",
      "",
      "You can book a time here:",
      "{{cal_booking_link}}",
      "",
      "If you'd rather talk it through first, call me on {{sender_phone}} and I'll walk you through the process. No pressure either way — I just want to make sure you've got a clear next step if you're still moving the project forward.",
      "",
      "{{user_signature}}",
    ].join("\n"),
  },
};

const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || "").trim());
const smtpFrom = () => (process.env.SMTP_FROM || "admin@blueleafbuilding.com.au").trim();

// project_type → a natural lowercased phrase for mid-sentence use. Handles both the Hub's slug
// values (new_build/extension/…) and the website's raw labels ("New Home"/"Renovation").
const PROJECT_TYPE_PHRASE = {
  new_build: "new build", extension: "extension", renovation: "renovation",
  knockdown_rebuild: "knockdown rebuild",
  "new home": "new home",
};
function projectTypePhrase(lead) {
  const raw = String(lead?.project_type || "").trim();
  if (!raw) return "project";
  return PROJECT_TYPE_PHRASE[raw.toLowerCase()] || raw.toLowerCase();
}
function firstName(lead) {
  return String(lead?.name || lead?.first_name || "").trim().split(/\s+/)[0] || "there";
}

/** Read the admin-editable templates from user_settings, each field falling back to the default. */
export async function loadQualifyEmailTemplates(sb) {
  const out = {
    intro: { ...QUALIFY_EMAIL_DEFAULTS.intro },
    followup: { ...QUALIFY_EMAIL_DEFAULTS.followup },
  };
  if (!sb) return out;
  try {
    const { data } = await sb.from("user_settings").select("value").eq("key", QUALIFY_EMAIL_TEMPLATE_KEY).maybeSingle();
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
// text → simple, safe HTML: paragraphs on blank lines, <br> within, **bold**, and linkified URLs.
function qualifyTextToHtml(text) {
  const linkify = (s) => s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#3a6ea8;">$1</a>');
  const bold = (s) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const paras = String(text)
    .split(/\n{2,}/)
    .map((block) => {
      const inner = block.split("\n").map((line) => linkify(bold(escapeHtml(line)))).join("<br>");
      return `<p style="margin:0 0 12px;">${inner}</p>`;
    })
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#17313d;font-size:15px;line-height:1.6;">${paras}</div>`;
}

/**
 * Assemble one qualify email. `which` = "intro" | "followup". ctx = { template:{subject,body},
 * signature (sig object|null), bookingLink }. Returns { to, subject, text, html, messageId }.
 */
export function buildQualifyEmail(lead, which, { template, signature = null, bookingLink } = {}) {
  const tpl = template || QUALIFY_EMAIL_DEFAULTS[which] || QUALIFY_EMAIL_DEFAULTS.intro;
  const sig = { ...DEFAULT_EMAIL_SIGNATURE, ...(signature || {}) };
  const link = bookingLink || buildLeadBookingLink(lead);
  const tokens = {
    "{{client_first_name}}": firstName(lead),
    "{{project_type}}": projectTypePhrase(lead),
    "{{project_suburb}}": String(lead?.suburb || "").trim() || "your area",
    "{{cal_booking_link}}": link,
    "{{sender_phone}}": sig.mobile || DEFAULT_EMAIL_SIGNATURE.mobile,
    "{{user_signature}}": formatSignatureFooter(sig),
  };
  const sub = (s) => Object.entries(tokens).reduce((acc, [k, v]) => acc.split(k).join(v), String(s || ""));
  const subject = sub(tpl.subject).trim();
  const text = sub(tpl.body);
  return {
    to: String(lead?.email || "").trim(),
    subject,
    text,
    html: qualifyTextToHtml(text),
    messageId: `<qualify-${which}-${lead?.id || "x"}-${Date.now()}@blueleafbuilding.com.au>`,
  };
}

/** Download the company-profile PDF for the intro attachment. null when not configured/found. */
export async function loadCompanyProfilePdf(sb) {
  const path = String(process.env.QUALIFY_COMPANY_PROFILE_PATH || "").trim();
  if (!path || !sb) return null;
  const bucket = String(process.env.QUALIFY_COMPANY_PROFILE_BUCKET || "templates").trim();
  try {
    const { data, error } = await sb.storage.from(bucket).download(path);
    if (error || !data) { console.warn("[qualify-email] company profile not found:", error?.message || "no data"); return null; }
    const buf = Buffer.from(await data.arrayBuffer());
    return { filename: path.split("/").pop() || "Blue-Leaf-Building-Company-Profile.pdf", content: buf, mimeType: "application/pdf" };
  } catch (e) {
    console.warn("[qualify-email] company profile download failed:", e?.message || e);
    return null;
  }
}

// Best-effort correspondence row for the lead mailbox + timeline. Fail-soft (pre-mig-175 the
// lead_id column doesn't exist → the insert errors and we just skip the log).
async function logLeadCorrespondence(sb, { leadId, direction, subject, body, from, to, messageId, inReplyTo }) {
  try {
    await sb.from("correspondence").insert({
      lead_id: leadId, direction, subject, body,
      email_from: from, email_to: to, message_id: messageId, in_reply_to: inReplyTo || null,
    });
  } catch { /* pre-migration or logging failure — non-blocking */ }
}

/**
 * Send the Qualify INTRODUCTION email (or return an assembled preview when dryRun).
 * Fail-soft on the mig-174 stamps + correspondence log; never throws to the caller beyond a send error.
 */
export async function sendQualifyIntro(sb, lead, { userId = null, dryRun = false, override = null } = {}) {
  const templates = await loadQualifyEmailTemplates(sb);
  const signature = await getUserSignature(sb, userId);
  const bookingLink = buildLeadBookingLink(lead);
  let email = buildQualifyEmail(lead, "intro", { template: templates.intro, signature, bookingLink });
  if (!isEmail(email.to)) return { ok: false, skipped: true, reason: "no valid email on lead" };
  if (dryRun) return { ok: true, dryRun: true, ...email, bookingLink };
  // Operator's EDITED copy from the preview (already token-filled).
  if (override?.subject && override?.text) {
    email = { ...email, subject: String(override.subject).trim(), text: String(override.text), html: qualifyTextToHtml(String(override.text)) };
  }
  // Company logo in the HTML signature (branding-bucket data-URL; "" if unavailable → no-op).
  const logo = await getBrandingEmailLogo(sb).catch(() => "");
  email.html = email.html + emailLogoBlockHtml(logo);

  const attachment = await loadCompanyProfilePdf(sb);
  try {
    const r = await sendPlainMail({
      to: email.to, subject: email.subject, text: email.text, html: email.html,
      attachments: attachment ? [attachment] : [], messageId: email.messageId,
    });
    const now = new Date().toISOString();
    // stamp (fail-soft: the .update just errors + is ignored if mig 174 isn't applied)
    await sb.from("leads").update({ qualify_intro_sent_at: now, qualify_email_sent_at: now }).eq("id", lead.id);
    await logLeadCorrespondence(sb, { leadId: lead.id, direction: "outbound", subject: email.subject, body: email.text, from: smtpFrom(), to: email.to, messageId: email.messageId });
    try { await sb.from("lead_activities").insert({ lead_id: lead.id, activity_type: "email", summary: "Qualify introduction email sent to client" }); } catch { /* best-effort */ }
    return { ok: true, sent: true, transport: r?.transport, attached: !!attachment, messageId: email.messageId };
  } catch (e) {
    return { ok: false, sent: false, error: e?.message || String(e) };
  }
}

/**
 * The 7-day follow-up cadence (mirrors tradeCommitment.runGhostCheck). Sends the follow-up to any
 * qualify-stage lead whose intro went out ≥7 days ago, that hasn't booked a build conversation and
 * hasn't been followed up yet — unless the client has replied since (an inbound correspondence row).
 * Gated at the call site by QUALIFY_FOLLOWUP_ENABLED.
 */
export async function runQualifyFollowups(sb) {
  if (!sb) return { ok: false, error: "No DB client" };
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: leads, error } = await sb.from("leads")
    .select("id, name, first_name, last_name, email, project_type, suburb, qualify_intro_sent_at")
    .eq("stage", "qualify")
    .not("qualify_intro_sent_at", "is", null)
    .lte("qualify_intro_sent_at", cutoff)
    .is("qualify_followup_sent_at", null)
    .is("discovery_meeting_booked_at", null)
    .not("is_test", "is", true); // never auto-email a test lead

  if (error) {
    // pre-mig-174 the columns don't exist (42703) → nothing to do; not an error worth alarming on.
    console.warn("[qualify-followup] skip:", error.message);
    return { ok: true, sent: 0, skipped: 0, note: "columns unavailable" };
  }

  const templates = await loadQualifyEmailTemplates(sb);
  const signature = await getUserSignature(sb, null); // company default in the cadence
  let sent = 0, skipped = 0;

  for (const lead of leads || []) {
    // Suppress if the client has replied since the intro (D2 logs inbound correspondence).
    try {
      const { data: inbound } = await sb.from("correspondence")
        .select("id").eq("lead_id", lead.id).eq("direction", "inbound").gt("sent_at", lead.qualify_intro_sent_at).limit(1);
      if (inbound && inbound.length) { skipped++; continue; }
    } catch { /* correspondence.lead_id may not exist yet — proceed without the suppressor */ }

    const bookingLink = buildLeadBookingLink(lead);
    const email = buildQualifyEmail(lead, "followup", { template: templates.followup, signature, bookingLink });
    if (!isEmail(email.to)) { skipped++; continue; }
    try {
      await sendPlainMail({ to: email.to, subject: email.subject, text: email.text, html: email.html, messageId: email.messageId });
      await sb.from("leads").update({ qualify_followup_sent_at: new Date().toISOString() }).eq("id", lead.id);
      await logLeadCorrespondence(sb, { leadId: lead.id, direction: "outbound", subject: email.subject, body: email.text, from: smtpFrom(), to: email.to, messageId: email.messageId });
      try { await sb.from("lead_activities").insert({ lead_id: lead.id, activity_type: "email", summary: "Qualify follow-up email sent (no response after 7 days)" }); } catch { /* best-effort */ }
      sent++;
    } catch (e) {
      console.warn("[qualify-followup] send failed for", lead.id, e?.message || e);
      skipped++;
    }
  }
  return { ok: true, sent, skipped };
}
