/**
 * leadCorrespondence.js — what the one "Client correspondence" area offers at each stage, and how it describes
 * what has actually happened. Pure: it reads the rows from GET /api/sales/leads/:id/mailbox and the raw lead.
 *
 * What the Hub records is narrow, and the wording here stays inside it. An outbound correspondence row means our
 * mail server accepted the message. Nothing reports delivery, opens or bounces, and a failed send leaves no row,
 * so "sent" is the strongest thing this module may say and "delivered" is never claimed.
 *
 * Each sending family stamps `<family-which-...>` into the Message-ID (qualifyEmail, discoveryEmail, conceptEmails,
 * tenderEmails, pipelineGapEmails), so a row can be tied to its template even when staff edited the subject. A
 * meeting's booking email is stamped `<meeting-leadId-meetingType-...>` (calcomRoutes).
 */
import { MEETING_TYPE_LABELS, TENDER_SUBSTATUS_ORDER } from "./constants.js";
import { currentTenderStep } from "./leadNextAction.js";
import { resolveEngagementPathway } from "./stageGates.js";

// `flag` is the key in the mailbox response's `sending` object. `sentField` is the lead stamp, where the family has one.
const QUALIFY = { key: "qualify_intro", label: "Qualify email", endpoint: "qualify-email", flag: "qualify", idPrefix: "qualify-intro", sentField: "qualify_intro_sent_at", note: "Company profile attached on send", defaultsAt: "Settings → General → Qualify emails" };
const DISCOVERY = { key: "discovery_intro", label: "Discovery email", endpoint: "discovery-email", flag: "discovery", idPrefix: "discovery-intro", sentField: "discovery_email_sent_at", defaultsAt: "Settings → General → Discovery emails" };
const concept = (which, label, sentField) => ({ key: which, which, label, endpoint: "concept-email", flag: "concept", idPrefix: `concept-${which}`, sentField });
const tender = (which, label) => ({ key: which, which, label, endpoint: "tender-email", flag: "tender", idPrefix: `tender-${which}` });
const pipeline = (which, label) => ({ key: which, which, label, endpoint: "pipeline-email", flag: "pipeline", idPrefix: `pipeline-${which}` });
export const bookingTemplateKey = (meetingType) => `booking_${meetingType}`;
const booking = (meetingType) => ({ key: bookingTemplateKey(meetingType), meetingType, label: `${MEETING_TYPE_LABELS[meetingType]} booking link`, flag: "mailbox" });

export const STAGE_EMAIL_TEMPLATES = {
  qualify: [QUALIFY],
  discovery: [DISCOVERY, booking("designer_meeting")],
  winning_offer: [
    concept("brief_questions", "Brief questions (pre-meeting)", "concept_brief_questions_sent_at"),
    concept("interim", "Interim update", "concept_interim_sent_at"),
    booking("designer_meeting"),
    booking("winning_offer_presentation"),
  ],
  fee_proposal: [
    concept("accepted_concepts", "Accepted-concepts acknowledgement"),
    pipeline("ptsa_covering", "PTSA covering email"),
    booking("plan_presentation"),
  ],
  consultants: [booking("proposal_presentation")],
  tender: [
    pipeline("tender_started", "Tender started (client update)"),
    tender("proposal_followup", "Proposal follow-up (24h)"),
    tender("review_followup", "Client-review follow-up"),
    tender("contract_sent", "Contract sent"),
    tender("contract_followup", "Unsigned-contract follow-up"),
    booking("proposal_presentation"),
  ],
  won: [pipeline("contract_signed", "Contract signed: welcome"), pipeline("ops_handoff", "Moving into Operations")],
  nurture: [pipeline("nurture", "Nurture check-in")],
  lost: [pipeline("lost", "Lost close-off")],
};

// With plans already supplied there is no concept package to invite the client to, so the design-stage emails are left out.
const NO_DESIGN_EMAILS = new Set(["discovery", "winning_offer", "fee_proposal"]);
export const stageEmailTemplates = (stage, lead) => (resolveEngagementPathway(lead) === "plans_supplied" && NO_DESIGN_EMAILS.has(stage) ? [] : STAGE_EMAIL_TEMPLATES[stage] || []);

/** Where this template previews and sends, relative to the lead. */
export const templateSendPath = (template) => (template.meetingType ? `meetings/${template.meetingType}/invite-email` : `${template.endpoint}/send`);

/** A short explanation for the stages that deliberately have no client template. */
export function stageCorrespondenceNote(stage, lead) {
  if (resolveEngagementPathway(lead) === "plans_supplied" && NO_DESIGN_EMAILS.has(stage)) return "The design-stage emails are about the concept package, so they don't apply when the client's plans are already complete.";
  if (stage === "enquiry") return "The first contact is normally a call, so no email is needed yet.";
  if (stage === "consultants") return "Consultant messages go through each consultant's own thread above.";
  return null;
}

export function formatCorrespondenceDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

const byTime = (a, b) => new Date(a.sentAt || 0) - new Date(b.sentAt || 0);

/**
 * The one-line record shown when the area is closed: { line, detail }. Only states what the log holds. A failed
 * read says so rather than looking like an empty history.
 */
export function correspondenceStatus({ loading, loadFailed, columnMissing, messages = [] } = {}) {
  if (loading) return { line: "Loading…", detail: null };
  if (loadFailed) return { line: "Couldn't load the message history.", detail: "Refresh the page to try again." };
  if (columnMissing) return { line: "The message history activates once migration 175 is applied.", detail: null };
  if (!messages.length) return { line: "No emails recorded for this lead yet.", detail: null };
  const latest = [...messages].sort(byTime).at(-1);
  const when = formatCorrespondenceDate(latest.sentAt);
  const subject = latest.subject || "(no subject)";
  if (latest.direction === "inbound") {
    return { line: `Received ${when}: ${subject}`, detail: "The latest message is from the client." };
  }
  return { line: `Sent ${when}: ${subject}`, detail: "Accepted by our mail server. The Hub can't see whether it was delivered or read. No reply recorded since." };
}

/** When this template was last recorded as sent (ISO), or null. Prefers the correspondence row over the lead stamp. */
export function recordedSendAt(template, messages = [], lead = {}) {
  const prefix = template.meetingType ? `<meeting-${lead.id}-${template.meetingType}-` : `<${template.idPrefix}-`;
  const rows = messages.filter((m) => m.direction === "outbound" && m.messageId?.startsWith(prefix)).sort(byTime);
  return rows.at(-1)?.sentAt || (template.sentField && lead[template.sentField]) || null;
}

/** The email the page should offer first: the follow-up straight after a presentation, otherwise the first with no recorded send. */
export function defaultStageTemplate(templates, messages = [], lead = {}) {
  const followUp = currentTenderStep(lead) === "proposal_presented" ? templates.find((t) => t.key === "proposal_followup") : null;
  if (followUp && !recordedSendAt(followUp, messages, lead)) return followUp;
  return templates.find((t) => !recordedSendAt(t, messages, lead)) || templates[0] || null;
}

/** True only when the server said this family's sending is off. Unknown (a failed read) is not claimed either way. */
export const isSendingOff = (flag, sending) => sending?.[flag] === false;

/** Why this template can't be opened yet, or null. */
export function templateBlockedReason(template, lead = {}) {
  if (template.key === DISCOVERY.key && !lead.selected_designer_contact_id) return "Select a designer above before sending the discovery email.";
  return null;
}

/** Choices shown inside the review window and posted with the send. */
export function templateSendOptions(template, lead = {}) {
  if (template.key !== DISCOVERY.key) return [];
  const hasAgreement = !!lead.concept_agreement_document_path;
  return [{ key: "attachAgreement", label: `Attach the concept agreement PDF${hasAgreement ? "" : " (generate it first)"}`, disabled: !hasAgreement }];
}

/**
 * The lead change a sent Tender email records, or null. "Contract sent" records Sent, but never moves a contract
 * that is already signed backwards. The proposal follow-up moves the tender on to Client reviewing.
 */
export function patchAfterStageEmail(lead, templateKey, todayIso) {
  if (templateKey === "contract_sent") {
    if (lead.contract_status === "signed") return null;
    return { contract_status: "sent", contract_sent_date: lead.contract_sent_date || todayIso };
  }
  if (templateKey === "proposal_followup") {
    const reviewing = TENDER_SUBSTATUS_ORDER.indexOf("client_reviewing");
    return TENDER_SUBSTATUS_ORDER.indexOf(currentTenderStep(lead)) < reviewing ? { tender_substatus: "client_reviewing" } : null;
  }
  return null;
}
