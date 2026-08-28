/**
 * constants.js — Blue Leaf Hub status enums and shared constants.
 *
 * NEVER hardcode status strings in JSX or route handlers.
 * Always import from here. See CLAUDE.md § Standards.
 */

// ─── Jobs ────────────────────────────────────────────────────────────────────

/** Valid values for jobs.status (CHECK constraint in migration 001). */
export const JOB_STATUSES = {
  TENDERING: "tendering",
  WON:       "won",
  LOST:      "lost",
  ARCHIVED:  "archived",
};

// ─── Sales / CRM ─────────────────────────────────────────────────────────────

export const LEAD_STAGES = {
  ENQUIRY:       "enquiry",
  QUALIFY:       "qualify",
  DISCOVERY:     "discovery",
  WINNING_OFFER: "winning_offer",   // visible label: "Concept" (key kept for compatibility)
  FEE_PROPOSAL:  "fee_proposal",    // visible label: "PTSA / Plans" (key kept for compatibility)
  CONSULTANTS:   "consultants",     // new stage: engineering/certification + F&F/finishes schedules
  ACCEPTED:      "accepted",        // RETIRED as a visible stage — kept only for back-compat / migration
  TENDER:        "tender",
  WON:           "won",
  NURTURE:       "nurture",
  LOST:          "lost",
};

/** Ordered pipeline stages shown on the board (excludes nurture/lost + the retired `accepted`). */
export const LEAD_STAGE_ORDER = [
  LEAD_STAGES.ENQUIRY,
  LEAD_STAGES.QUALIFY,
  LEAD_STAGES.DISCOVERY,
  LEAD_STAGES.WINNING_OFFER,   // Concept
  LEAD_STAGES.FEE_PROPOSAL,    // PTSA / Plans
  LEAD_STAGES.CONSULTANTS,
  LEAD_STAGES.TENDER,
  LEAD_STAGES.WON,
];

export const LEAD_STAGE_LABELS = {
  enquiry:       "Enquiry",
  qualify:       "Qualifying",
  discovery:     "Discovery",
  winning_offer: "Concept",
  fee_proposal:  "PTSA / Plans",
  consultants:   "Consultants",
  accepted:      "Accepted",   // retired stage — never shown on the board; label kept for legacy rows
  tender:        "Tender",
  won:           "Won",
  nurture:       "Nurture",
  lost:          "Lost",
};

/** Operator management fields shown as chips in the lead focus panel (migration 187). */
export const LEAD_TEMPERATURE = {
  hot: "Hot", warm: "Warm", cooling: "Cooling", ghosting: "Ghosting", nurture: "Nurture",
};
export const LEAD_STUCK_REASONS = {
  waiting_on_client:         "Waiting on client",
  waiting_on_designer:       "Waiting on designer",
  waiting_on_consultant:     "Waiting on consultant",
  waiting_on_pricing:        "Waiting on pricing",
  waiting_on_internal_review:"Waiting on internal review",
  waiting_on_signature:      "Waiting on signature",
  waiting_on_payment:        "Waiting on payment",
  waiting_on_approval:       "Waiting on approval",
  budget_mismatch:           "Budget mismatch",
  scope_unclear:             "Scope unclear",
  other:                     "Other",
};
/** Concept-stage design state machine (migration 188). */
export const CONCEPT_DESIGN_STATUS = {
  with_designer:  "With designer",
  sent_to_client: "Sent to client",
  approved:       "Approved",
};
export const CONCEPT_DESIGN_STEPS = ["with_designer", "sent_to_client", "approved"];

/** Consultants stage — the councils/certifier approval-risk chip (default unknown). */
export const APPROVAL_RISK = {
  unknown: "Unknown", low: "Low", medium: "Medium", high: "High",
};
export const APPROVAL_RISK_STEPS = ["unknown", "low", "medium", "high"];
export const APPROVAL_RISK_COLORS = {
  unknown: "bg-slate-100 text-slate-600",
  low:     "bg-green-100 text-green-700",
  medium:  "bg-amber-100 text-amber-800",
  high:    "bg-red-100 text-red-700",
};

/** Consultants stage — the disciplines coordinated on the roster (role, not CRM contact type). */
export const CONSULTANT_ROLES = {
  engineer:          "Structural engineer",
  private_certifier: "Private certifier",
  interior_designer: "Interior designer",
  lighting:          "Lighting",
  sanitary:          "Sanitary / tapware",
  energy:            "Energy / NatHERS",
  land_surveyor:     "Land surveyor",
  other:             "Other consultant",
};
export const CONSULTANT_ROLE_ORDER = [
  "engineer", "private_certifier", "interior_designer", "lighting", "sanitary", "energy", "land_surveyor", "other",
];

/** Tender stage — the sub-status strip (so Tender never becomes a dumping ground). */
export const TENDER_SUBSTATUS = {
  pack_prep:          "Tender pack being prepared",
  rfqs_issued:        "RFQs issued",
  awaiting_pricing:   "Awaiting supplier / trade pricing",
  estimate_review:    "Estimate review",
  proposal_generated: "Proposal generated",
  proposal_presented: "Proposal presented",
  client_reviewing:   "Client reviewing",
  contract_prep:      "Contract being prepared",
  contract_sent:      "Contract sent",
  contract_signed:    "Contract signed",
};
export const TENDER_SUBSTATUS_ORDER = [
  "pack_prep", "rfqs_issued", "awaiting_pricing", "estimate_review", "proposal_generated",
  "proposal_presented", "client_reviewing", "contract_prep", "contract_sent", "contract_signed",
];

/** The building contract lifecycle (captured in the Tender stage; consumed by the Won gate). */
export const CONTRACT_STATUS = { prepared: "Prepared", sent: "Sent", signed: "Signed" };
export const CONTRACT_STATUS_ORDER = ["prepared", "sent", "signed"];

/**
 * Blue Leaf Proposal Checklist — the client-facing QC gate on the Fixed-Price Proposal.
 * Blue-Leaf-branded (never "APB" on anything the client sees). A proposal under 80% complete
 * is flagged "not ready to present". Keyed items → boolean in leads.proposal_checklist.
 */
export const PROPOSAL_CHECKLIST_ITEMS = [
  { key: "scope",          label: "Scope of works complete" },
  { key: "inclusions",     label: "Inclusions list finalised" },
  { key: "specifications", label: "Specifications + allowances set" },
  { key: "ff_schedule",    label: "Specified F&F schedule attached" },
  { key: "fixed_price",    label: "Fixed price calculated with margin" },
  { key: "exclusions",     label: "Exclusions clearly stated" },
  { key: "payment_terms",  label: "Payment schedule set" },
  { key: "timeline",       label: "Build timeline / weeks stated" },
  { key: "testimonials",   label: "Testimonials + past work included" },
  { key: "terms",          label: "Terms + validity period set" },
];
export const PROPOSAL_READY_THRESHOLD = 0.8;

export const LEAD_RISK_FLAGS = {
  budget:                "Budget risk",
  scope_gap:             "Scope gap",
  design_creep:          "Design creep",
  client_indecision:     "Client indecision",
  approval:              "Approval risk",
  consultant_delay:      "Consultant delay",
  selection_uncertainty: "Selection uncertainty",
  pricing:               "Pricing risk",
  start_date:            "Start-date risk",
  communication:         "Communication risk",
};

/** leads.fit_quality — are they the right kind of client? (migration 127) */
export const LEAD_FIT_QUALITY = {
  STRONG:        "strong",
  POSSIBLE:      "possible",
  NURTURE:       "nurture",
  POOR:          "poor",
  PRICE_SHOPPER: "price_shopper",
};

export const LEAD_FIT_QUALITY_LABELS = {
  strong:        "Strong fit",
  possible:      "Possible fit",
  nurture:       "Nurture",
  poor:          "Poor fit",
  price_shopper: "Price shopper",
};

/** leads.readiness — are they ready to move? (migration 127) */
export const LEAD_READINESS = {
  EARLY_RESEARCH:    "early_research",
  NOT_READY_YET:     "not_ready_yet",
  READY_FOR_CONSULT: "ready_for_consult",
};

export const LEAD_READINESS_LABELS = {
  early_research:    "Early research",
  not_ready_yet:     "Not ready yet",
  ready_for_consult: "Ready for consult",
};

/** leads.action_type — the driven next-action queue (migration 127) */
export const LEAD_ACTION_TYPES = {
  RESPONSE_DUE:        "response_due",
  NO_REPLY_FOLLOW_UP:  "no_reply_follow_up",
  PLANS_REQUESTED:     "plans_requested",
  PLANS_RECEIVED:      "plans_received",
  PROPOSAL_FOLLOW_UP:  "proposal_follow_up",
  NURTURE_CHECK_IN:    "nurture_check_in",
  LOST_REVIEW:         "lost_review",
  REACTIVATION:        "reactivation",
};

export const LEAD_ACTION_TYPE_LABELS = {
  response_due:       "Response due",
  no_reply_follow_up: "No-reply follow-up",
  plans_requested:    "Plans requested",
  plans_received:     "Plans received",
  proposal_follow_up: "Proposal follow-up",
  nurture_check_in:   "Nurture check-in",
  lost_review:        "Lost lead review",
  reactivation:       "Reactivation",
};

/** Queue display order (matches the plan's 8 buckets) */
export const LEAD_ACTION_TYPE_ORDER = [
  LEAD_ACTION_TYPES.RESPONSE_DUE,
  LEAD_ACTION_TYPES.NO_REPLY_FOLLOW_UP,
  LEAD_ACTION_TYPES.PLANS_REQUESTED,
  LEAD_ACTION_TYPES.PLANS_RECEIVED,
  LEAD_ACTION_TYPES.PROPOSAL_FOLLOW_UP,
  LEAD_ACTION_TYPES.NURTURE_CHECK_IN,
  LEAD_ACTION_TYPES.LOST_REVIEW,
  LEAD_ACTION_TYPES.REACTIVATION,
];

/** leads.lead_source_category — mandatory on every create path (migration 127) */
export const LEAD_SOURCE_CATEGORIES = {
  WEBSITE:     "website",
  REFERRAL:    "referral",
  REPEAT:      "repeat",
  SOCIAL:      "social",
  SEARCH:      "search",
  ADVERTISING: "advertising",
  WALK_IN:     "walk_in",
  OTHER:       "other",
};

export const LEAD_SOURCE_CATEGORY_LABELS = {
  website:     "Website",
  referral:    "Referral",
  repeat:      "Repeat client",
  social:      "Social media",
  search:      "Search",
  advertising: "Advertising",
  walk_in:     "Walk-in",
  other:       "Other",
};

/* ── Sales OS Slice 1: Enquiry/Qualify dropdown vocab ──────────────────────────
   Controlled answers for the tight call-script. Stored as these slug values on the
   leads row (land_status / finance_status / documents_on_hand) or in lead_signals
   (priority / concern). Enforced app-side — migration 174 leaves the columns free of a
   CHECK on purpose. Labels are what the UI shows and the client-facing snippet maps key off. */

/** leads.land_status — do they have a site? Also drives qualify_site. (migration 174) */
export const LEAD_LAND_STATUS = {
  OWN_HOME:  "own_home",
  OWN_LAND:  "own_land",
  BUYING:    "buying",
  SEARCHING: "searching",
};
export const LEAD_LAND_STATUS_LABELS = {
  own_home:  "Own our home",
  own_land:  "Own the land",
  buying:    "Buying now",
  searching: "Still searching",
};

/** leads.finance_status — how the project is funded. (migration 174) */
export const LEAD_FINANCE_STATUS = {
  CASH:          "cash",
  NEEDS_FINANCE: "needs_finance",
  PREAPPROVED:   "preapproved",
  UNSURE:        "unsure",
};
export const LEAD_FINANCE_STATUS_LABELS = {
  cash:          "Cash",
  needs_finance: "Need finance",
  preapproved:   "Pre-approved",
  unsure:        "Unsure",
};

/** leads.documents_on_hand — furthest documentation milestone they hold. (migration 174) */
export const LEAD_DOCUMENTS_ON_HAND = {
  NONE:        "none",
  SKETCH:      "sketch",
  CONCEPT:     "concept",
  DETAILED:    "detailed",
  ENGINEERING: "engineering",
  APPROVALS:   "approvals",
};
export const LEAD_DOCUMENTS_ON_HAND_LABELS = {
  none:        "None",
  sketch:      "Sketch ideas",
  concept:     "Concept plans",
  detailed:    "Detailed plans",
  engineering: "Engineering",
  approvals:   "Approvals",
};

/** lead_signals kind='priority' — what matters most in choosing a builder. */
export const LEAD_PRIORITY = {
  LOWEST_PRICE:          "lowest_price",
  BUDGET_CERTAINTY:      "budget_certainty",
  QUALITY:               "quality",
  COMMUNICATION:         "communication",
  DESIGN_OUTCOME:        "design_outcome",
  LONG_TERM_PERFORMANCE: "long_term_performance",
};
export const LEAD_PRIORITY_LABELS = {
  lowest_price:          "Lowest price",
  budget_certainty:      "Budget certainty",
  quality:               "Quality",
  communication:         "Communication",
  design_outcome:        "Design outcome",
  long_term_performance: "Long-term performance",
};

/** lead_signals kind='fear' — the client's biggest worry about building. */
export const LEAD_CONCERN = {
  BUDGET_BLOWOUT: "budget_blowout",
  BUILDER_TRUST:  "builder_trust",
  DELAYS:         "delays",
  QUALITY:        "quality",
  DESIGN_OUTCOME: "design_outcome",
  LOCK_IN:        "lock_in",
};
export const LEAD_CONCERN_LABELS = {
  budget_blowout: "Budget blowout",
  builder_trust:  "Trusting the builder",
  delays:         "Delays",
  quality:        "Quality",
  design_outcome: "Design outcome",
  lock_in:        "Being locked in",
};

/** leads.concept_agreement_status — the Discovery concept-agreement lifecycle (migration 179) */
export const CONCEPT_AGREEMENT_STATUS = {
  DRAFT:     "draft",
  GENERATED: "generated",
  SENT:      "sent",
  ACCEPTED:  "accepted",
  DECLINED:  "declined",
};
export const CONCEPT_AGREEMENT_STATUS_LABELS = {
  draft:     "Draft",
  generated: "Generated",
  sent:      "Sent to client",
  accepted:  "Accepted",
  declined:  "Declined",
};

// Xero accounts-receivable invoices (see migration 182 / xeroInvoices.mjs).
// Hub-side status vocab — deliberately NOT a DB CHECK (deploy-ahead pattern).
export const XERO_INVOICE_STATUSES = {
  DRAFT:      "draft",       // row created, not yet in Xero
  AUTHORISED: "authorised",  // created in Xero as AUTHORISED (pay link + PDF live)
  SENT:       "sent",        // Hub emailed the official PDF to the client
  PART_PAID:  "part_paid",   // Xero AmountPaid > 0, AmountDue > 0
  PAID:       "paid",        // Xero PAID, AmountDue = 0
  VOID:       "void",        // voided in Xero
  ERROR:      "error",       // create/sync failed — see error_message
};
export const XERO_INVOICE_STATUS_LABELS = {
  draft:      "Draft",
  authorised: "Authorised",
  sent:       "Sent",
  part_paid:  "Part paid",
  paid:       "Paid",
  void:       "Void",
  error:      "Error",
};
export const XERO_INVOICE_TYPES = {
  CONCEPT_FEE:     "concept_fee",
  DESIGN_PACKAGE:  "design_package",
  PROGRESS_CLAIM:  "progress_claim",
  JOB_VARIATION:   "job_variation",
  DEPOSIT:         "deposit",
};

export const CRM_CONTACT_TYPES = {
  PROSPECT:          "prospect",
  REFERRER:          "referrer",
  PAST_CLIENT:       "past_client",
  ARCHITECT:         "architect",
  DESIGNER:          "designer",
  INTERIOR_DESIGNER: "interior_designer",
  ENGINEER:          "engineer",
  DEVELOPER:         "developer",
  AGENT:             "agent",
  SUPPLIER:          "supplier",
  OTHER:             "other",
};

/** Display labels for contact types — single source shared by the CRM list, drawer + forms. */
export const CRM_CONTACT_TYPE_LABELS = {
  prospect:          "Prospect",
  referrer:          "Referrer",
  past_client:       "Past Client",
  architect:         "Architect",
  designer:          "Designer",
  interior_designer: "Interior Designer",
  engineer:          "Engineer",
  developer:         "Developer",
  agent:             "Agent",
  supplier:          "Supplier",
  other:             "Other",
};

/**
 * Consultant / design-partner disciplines. These carry a company + default concept + full-design
 * fees (crm_contacts.company / default_concept_fee / default_design_fee). The contact form shows
 * the "Consultant details" block for these types and hides the prospect-only fields (budget range,
 * interest timeline). The company autofills into pipeline emails via the {{designer_company}} token.
 */
export const CRM_CONSULTANT_TYPES = ["architect", "designer", "interior_designer", "engineer"];

/**
 * Sales-pipeline meeting types. Each maps to a cal.com event type (server-side MEETING_REGISTRY in
 * calcom.mjs) and to lead_meetings.meeting_type. Deploy-ahead: no DB CHECK on the column.
 */
export const MEETING_TYPES = {
  BUILD_CONVERSATION:         "build_conversation",
  DISCOVERY_MEETING:          "discovery_meeting",
  DESIGNER_MEETING:           "designer_meeting",
  WINNING_OFFER_PRESENTATION: "winning_offer_presentation",
  PLAN_PRESENTATION:          "plan_presentation",
  PROPOSAL_PRESENTATION:      "proposal_presentation",
  CONTRACT_PRESENTATION:      "contract_presentation",
};

export const MEETING_TYPE_LABELS = {
  build_conversation:         "Build conversation",
  discovery_meeting:          "Discovery meeting",
  designer_meeting:           "Design meeting",
  winning_offer_presentation: "Concept presentation",
  plan_presentation:          "Plan presentation",
  proposal_presentation:      "Proposal presentation",
  contract_presentation:      "Contract signing",
};

export const MEETING_STATUSES = {
  SCHEDULED:   "scheduled",
  RESCHEDULED: "rescheduled",
  CANCELLED:   "cancelled",
  COMPLETED:   "completed",
  NO_SHOW:     "no_show",
};

/** CRM contact lifecycle status — replaces the old CRM_WARMTH enum */
export const CRM_STATUS = {
  NEW:          "new",
  ACTIVE:       "active",
  FUTURE:       "future",
  CLIENT:       "client",
  PAST_CLIENT:  "past_client",
  LOST:         "lost",
};

export const CRM_STATUS_LABELS = {
  new:          "New",
  active:       "Active",
  future:       "Future",
  client:       "Client",
  past_client:  "Past Client",
  lost:         "Lost",
};

export const CRM_NEXT_ACTION_TYPES = {
  CALL:    "call",
  EMAIL:   "email",
  MEETING: "meeting",
  DM:      "dm",
  NONE:    "none",
  WAITING: "waiting",
};

export const CRM_INTERACTION_TYPES = {
  CALL:           "call",
  EMAIL:          "email",
  SMS:            "sms",
  DM:             "dm",
  MEETING:        "meeting",
  SITE_VISIT:     "site_visit",
  NOTE:           "note",
  FOLLOW_UP:      "follow_up",
  CONTENT_SENT:   "content_sent",
  EMAIL_CAMPAIGN: "email_campaign",
};

export const CRM_CONSENT_SOURCES = {
  WEBSITE_FORM:    "website_form",
  IN_PERSON:       "in_person",
  PHONE:           "phone",
  REFERRAL:        "referral",
  PAST_CLIENT:     "past_client",
  EVENT:           "event",
  MANUALLY_ADDED:  "manually_added",
};

export const EMAIL_SEND_STATUSES = {
  DRAFT:     "draft",
  SCHEDULED: "scheduled",
  SENDING:   "sending",
  SENT:      "sent",
  FAILED:    "failed",
  CANCELLED: "cancelled",
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

export const DAY_OFF_REQUEST_STATUSES = {
  SUBMITTED: "submitted",
  APPROVED:  "approved",
  REJECTED:  "rejected",
};

export const DAY_OFF_REQUEST_STATUS_LABELS = {
  submitted: "Pending",
  approved:  "Approved",
  rejected:  "Rejected",
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

// ─── Marketing Intelligence ───────────────────────────────────────────────────

export const MARKETING_PLATFORMS = {
  INSTAGRAM: "instagram",
  FACEBOOK:  "facebook",
  LINKEDIN:  "linkedin",
};

export const ATTRIBUTION_SOURCES = {
  ORGANIC:   "organic",
  INSTAGRAM: "instagram",
  FACEBOOK:  "facebook",
  LINKEDIN:  "linkedin",
  REFERRAL:  "referral",
  DIRECT:    "direct",
  EMAIL:     "email",
  PAID:      "paid",
};

export const ATTRIBUTION_EVENTS = {
  PAGE_VIEW:        "page_view",
  CONTENT_VIEW:     "content_view",
  VIDEO_PLAY:       "video_play",
  ENQUIRY_START:    "enquiry_start",
  ENQUIRY_SUBMIT:   "enquiry_submit",
  CALL_CLICK:       "call_click",
  EMAIL_CLICK:      "email_click",
};

export const CONTENT_ITEM_STATUSES = {
  DRAFT:      "draft",
  IN_REVIEW:  "in_review",
  APPROVED:   "approved",
  PUBLISHED:  "published",
};

export const KEYWORD_PRIORITIES = {
  HIGH:   "high",
  MEDIUM: "medium",
  LOW:    "low",
  WATCH:  "watch",
};

export const KEYWORD_INTENTS = {
  COMMERCIAL:    "commercial",
  INFORMATIONAL: "informational",
  NAVIGATIONAL:  "navigational",
};

export const SEO_POTENTIALS = {
  HIGH:   "high",
  MEDIUM: "medium",
  LOW:    "low",
  NONE:   "none",
};

export const WEBSITE_PAGE_STATUSES = {
  PLANNED:      "planned",
  LIVE:         "live",
  NEEDS_UPDATE: "needs_update",
  ARCHIVED:     "archived",
};

export const QUESTION_STATUSES = {
  QUEUED:      "queued",
  IN_PROGRESS: "in_progress",
  PUBLISHED:   "published",
  DISMISSED:   "dismissed",
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

// ─── Carpentry Subsidiary ─────────────────────────────────────────────────────

export const CARPENTRY_JOB_STATUSES = {
  ACTIVE:    "active",
  ON_HOLD:   "on_hold",
  DEFECTS:   "defects",
  COMPLETE:  "complete",
  CANCELLED: "cancelled",
};

export const CARPENTRY_JOB_STATUS_LABELS = {
  active:    "Active",
  on_hold:   "On Hold",
  defects:   "Defects",
  complete:  "Complete",
  cancelled: "Cancelled",
};

export const CARPENTRY_PROJECT_TYPES = {
  FRAME:        "frame",
  FITOFF:       "fitoff",
  LOCKUP:       "lockup",
  FULL_PACKAGE: "full_package",
  OTHER:        "other",
};

// Permanent internal carpentry-job references (mig 125). BL-CHARGEUP holds site-level
// charge-up sub-jobs (mig 145) and gets its own detail layout; BL-INTERNAL keeps the
// standard tabs even though both are project_type='other'.
export const CHARGE_UP_REFERENCE = "BL-CHARGEUP";

export const CARPENTRY_PROJECT_TYPE_LABELS = {
  frame:        "Frame Only",
  fitoff:       "Fit-Off Only",
  lockup:       "Lock-Up / Cladding",
  full_package: "Full Package",
  other:        "Other",
};

export const CARPENTRY_COST_TYPES = {
  MATERIAL:    "material",
  SUBCONTRACT: "subcontract",
  OTHER:       "other",
};

export const CARPENTRY_COST_TYPE_LABELS = {
  material:    "Material",
  subcontract: "Subcontract",
  other:       "Other",
};

export const CARPENTRY_MILESTONE_STATUSES = {
  PENDING:  "pending",
  COMPLETE: "complete",
};

// ── Procurement Intelligence (BQ-10) — values match migration 085 CHECK constraints ──
export const PROCUREMENT_STATUS = {
  NOT_STARTED:             "not_started",
  SCOPE_REQUIRED:          "scope_required",
  QUOTE_REQUESTED:         "quote_requested",
  QUOTE_RECEIVED:          "quote_received",
  WAITING_ON_SELECTION:    "waiting_on_selection",
  WAITING_ON_CLARIFICATION:"waiting_on_clarification",
  READY_FOR_APPROVAL:      "ready_for_approval",
  APPROVED:                "approved",
  PO_DRAFTED:              "po_drafted",
  PO_SENT:                 "po_sent",
  ORDER_CONFIRMED:         "order_confirmed",
  DELIVERY_BOOKED:         "delivery_booked",
  DELIVERED:               "delivered",
  CLOSED:                  "closed",
  DELAYED:                 "delayed",
  CANCELLED:               "cancelled",
};

// Linear progress rank for risk math (delayed/cancelled are off-rail → -1).
export const PROCUREMENT_STATUS_RANK = {
  not_started: 0, scope_required: 1, quote_requested: 2, quote_received: 3,
  waiting_on_selection: 3, waiting_on_clarification: 3, ready_for_approval: 4,
  approved: 5, po_drafted: 6, po_sent: 7, order_confirmed: 8, delivery_booked: 9,
  delivered: 10, closed: 11, delayed: -1, cancelled: -1,
};

export const PROCUREMENT_STATUS_LABELS = {
  not_started: "Not started", scope_required: "Scope required",
  quote_requested: "Quote requested", quote_received: "Quote received",
  waiting_on_selection: "Waiting on selection", waiting_on_clarification: "Waiting on clarification",
  ready_for_approval: "Ready for approval", approved: "Approved",
  po_drafted: "PO drafted", po_sent: "PO sent", order_confirmed: "Order confirmed",
  delivery_booked: "Delivery booked", delivered: "Delivered", closed: "Closed",
  delayed: "Delayed", cancelled: "Cancelled",
};

export const PROCUREMENT_RISK = {
  ON_TRACK: "on_track",
  WATCH:    "watch",
  AT_RISK:  "at_risk",
  CRITICAL: "critical",
  BLOCKED:  "blocked",
};

export const PROCUREMENT_RISK_LABELS = {
  on_track: "On track", watch: "Watch", at_risk: "At risk",
  critical: "Critical", blocked: "Blocked",
};

export const SUPPLY_TYPE = {
  BUILDER_SUPPLIED: "builder_supplied",
  SUBBIE_SUPPLIED:  "subbie_supplied",
  CLIENT_SUPPLIED:  "client_supplied",
  PC_ITEM:          "pc_item",
};

export const SUPPLY_TYPE_LABELS = {
  builder_supplied: "Builder supplied",
  subbie_supplied:  "Subbie supplied",
  client_supplied:  "Client supplied",
  pc_item:          "PC item",
};

// supply types the builder actually orders (others are not orderable by us)
export const BUILDER_ORDERABLE_SUPPLY_TYPES = ["builder_supplied"];

export const PROCUREMENT_ITEM_SOURCE = {
  TEMPLATE:             "template",
  ESTIMATE:             "estimate",
  RFQ:                  "rfq",
  PROJECT_INTELLIGENCE: "project_intelligence",
  SCHEDULE:             "schedule",
  MANUAL:               "manual",
  TEMPLATE_ESTIMATE:    "template+estimate",
};

// Default order-by buffers (mirror migration 085 column defaults)
export const PROCUREMENT_APPROVAL_BUFFER_DAYS = 5;
export const PROCUREMENT_REVIEW_BUFFER_DAYS = 3;
