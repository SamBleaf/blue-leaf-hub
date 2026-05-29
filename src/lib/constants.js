/**
 * constants.js — Blue Leaf Hub status enums and shared constants.
 *
 * NEVER hardcode status strings in JSX or route handlers.
 * Always import from here. See CLAUDE.md § Standards.
 */

// ─── Sales / CRM ─────────────────────────────────────────────────────────────

export const LEAD_STAGES = {
  ENQUIRY:       "enquiry",
  QUALIFY:       "qualify",
  DISCOVERY:     "discovery",
  WINNING_OFFER: "winning_offer",
  FEE_PROPOSAL:  "fee_proposal",
  ACCEPTED:      "accepted",
  TENDER:        "tender",
  WON:           "won",
  NURTURE:       "nurture",
  LOST:          "lost",
};

/** Ordered APB pipeline stages (excludes nurture/lost — off-pipeline) */
export const LEAD_STAGE_ORDER = [
  LEAD_STAGES.ENQUIRY,
  LEAD_STAGES.QUALIFY,
  LEAD_STAGES.DISCOVERY,
  LEAD_STAGES.WINNING_OFFER,
  LEAD_STAGES.FEE_PROPOSAL,
  LEAD_STAGES.ACCEPTED,
  LEAD_STAGES.TENDER,
  LEAD_STAGES.WON,
];

export const LEAD_STAGE_LABELS = {
  enquiry:       "Enquiry",
  qualify:       "Qualifying",
  discovery:     "Discovery",
  winning_offer: "Winning Offer",
  fee_proposal:  "Fee Proposal",
  accepted:      "Accepted",
  tender:        "Tender",
  won:           "Won",
  nurture:       "Nurture",
  lost:          "Lost",
};

export const CRM_CONTACT_TYPES = {
  PROSPECT:    "prospect",
  REFERRER:    "referrer",
  PAST_CLIENT: "past_client",
  ARCHITECT:   "architect",
  DESIGNER:    "designer",
  DEVELOPER:   "developer",
  AGENT:       "agent",
  SUPPLIER:    "supplier",
  OTHER:       "other",
};

export const CRM_WARMTH = {
  COLD:        "cold",
  WARM:        "warm",
  HOT:         "hot",
  NURTURE:     "nurture",
  PAST_CLIENT: "past_client",
  LOST:        "lost",
};

export const CRM_INTERACTION_TYPES = {
  CALL:          "call",
  EMAIL:         "email",
  SMS:           "sms",
  DM:            "dm",
  MEETING:       "meeting",
  SITE_VISIT:    "site_visit",
  NOTE:          "note",
  FOLLOW_UP:     "follow_up",
  CONTENT_SENT:  "content_sent",
};

// ─── Finance / Documents ──────────────────────────────────────────────────────

export const DOC_STATUSES = {
  PENDING:     "pending",
  APPROVED:    "approved",
  REJECTED:    "rejected",
  HELD:        "held",
  FILED:       "filed",
  XERO_SYNCED: "xero_synced",
};

export const CLAIM_STATUSES = {
  DRAFT:           "draft",
  ISSUED:          "issued",
  OVERDUE:         "overdue",
  PARTIALLY_PAID:  "partially_paid",
  PAID:            "paid",
  DISPUTED:        "disputed",
  VOID:            "void",
};

export const VARIATION_STATUSES = {
  DRAFT:           "draft",
  SENT_TO_CLIENT:  "sent_to_client",
  SIGNED:          "signed",
  REJECTED:        "rejected",
  VOID:            "void",
  INVOICED:        "invoiced",
};

export const CLAIM_STAGES = {
  DEPOSIT:              "deposit",
  SLAB:                 "slab",
  FRAME:                "frame",
  LOCK_UP:              "lock_up",
  FIXING:               "fixing",
  PRACTICAL_COMPLETION: "practical_completion",
  CUSTOM:               "custom",
};

// ─── Workforce ────────────────────────────────────────────────────────────────

export const TIMESHEET_STATUSES = {
  DRAFT:     "draft",
  SUBMITTED: "submitted",
  APPROVED:  "approved",
  REJECTED:  "rejected",
};

export const EMPLOYMENT_TYPES = {
  FULL_TIME: "full_time",
  PART_TIME: "part_time",
  CASUAL:    "casual",
};

export const TRADE_TYPES = {
  CARPENTER:    "carpenter",
  LABOURER:     "labourer",
  LEADING_HAND: "leading_hand",
  SUPERVISOR:   "supervisor",
  OTHER:        "other",
};

// ─── Schedule ─────────────────────────────────────────────────────────────────

export const TASK_STATUSES = {
  PLANNED:     "planned",
  IN_PROGRESS: "in_progress",
  COMPLETE:    "complete",
  OVERDUE:     "overdue",
  ON_HOLD:     "on_hold",
};

export const TASK_TYPES = {
  BUILD:      "build",
  MILESTONE:  "milestone",
  APPROVAL:   "approval",
  INSPECTION: "inspection",
  PROCUREMENT:"procurement",
};

export const DEPENDENCY_TYPES = {
  FS: "FS",  // Finish-to-Start (default)
  SS: "SS",  // Start-to-Start
  FF: "FF",  // Finish-to-Finish
  SF: "SF",  // Start-to-Finish
};

// ─── Projects ─────────────────────────────────────────────────────────────────

export const PROJECT_STATUSES = {
  ACTIVE:               "active",
  PRACTICAL_COMPLETION: "practical_completion",
  DEFECTS:              "defects",
  COMPLETE:             "complete",
  ON_HOLD:              "on_hold",
  CANCELLED:            "cancelled",
};

// ─── Portal ───────────────────────────────────────────────────────────────────

export const PORTAL_MESSAGE_SENDERS = {
  CLIENT:  "client",
  BUILDER: "builder",
};

export const DECISION_STATUSES = {
  PENDING:        "pending",
  APPROVED:       "approved",
  DECLINED:       "declined",
  INFO_REQUESTED: "info_requested",
};

export const DECISION_URGENCY = {
  NORMAL: "normal",
  URGENT: "urgent",
};

// ─── Lead sources ─────────────────────────────────────────────────────────────

export const LEAD_SOURCES = {
  INSTAGRAM:     "instagram",
  FACEBOOK:      "facebook",
  GOOGLE:        "google",
  REFERRAL:      "referral",
  WEBSITE:       "website",
  SIGNAGE:       "signage",
  EVENT:         "event",
  WORD_OF_MOUTH: "word_of_mouth",
  PAST_CLIENT:   "past_client",
  OTHER:         "other",
};

// ─── Finance ─────────────────────────────────────────────────────────────────

/** Australian GST rate. Never hardcode 0.1 or 10% in calculations. */
export const GST_RATE = 0.10;

/** Convenience: compute GST-inclusive amount */
export const incGst = (exGst) => Number(exGst) * (1 + GST_RATE);

/** Convenience: compute GST amount only */
export const gstAmount = (exGst) => Number(exGst) * GST_RATE;

/** Convenience: strip GST from inc-GST amount */
export const exGst = (incGstAmount) => Number(incGstAmount) / (1 + GST_RATE);
