/**
 * Sales pipeline — shared pure helpers + constants (no JSX).
 * Extracted from src/pages/SalesPipeline.jsx in the Pass 2 redesign so the page and
 * the new src/components/sales/* components share one source of truth. Behaviour and
 * values are unchanged from the original page.
 */

export const STAGES = [
  { id: "enquiry",       label: "Enquiry",       color: "bg-slate-100 text-slate-700",    dot: "bg-slate-400" },
  { id: "qualify",       label: "Qualify",       color: "bg-blue-50 text-blue-800",       dot: "bg-blue-500" },
  { id: "discovery",     label: "Discovery",     color: "bg-violet-50 text-violet-800",   dot: "bg-violet-500" },
  { id: "winning_offer", label: "Concept",       color: "bg-amber-50 text-amber-800",     dot: "bg-amber-500" },
  { id: "fee_proposal",  label: "PTSA / Plans",  color: "bg-orange-50 text-orange-800",   dot: "bg-orange-500" },
  { id: "consultants",   label: "Consultants",   color: "bg-indigo-50 text-indigo-800",   dot: "bg-indigo-500" },
  { id: "tender",        label: "Tender",        color: "bg-teal-50 text-teal-800",       dot: "bg-teal-500" },
  { id: "won",           label: "Won",           color: "bg-green-100 text-green-800",    dot: "bg-green-600" },
];

export const PROJECT_TYPES = [
  { value: "new_build",         label: "New Build" },
  { value: "extension",         label: "Extension" },
  { value: "renovation",        label: "Renovation" },
  { value: "knockdown_rebuild", label: "Knockdown Rebuild" },
];

export const LEAD_SOURCES = [
  { value: "referral",   label: "Referral" },
  { value: "website",    label: "Website" },
  { value: "social",     label: "Social Media" },
  { value: "exhibition", label: "Exhibition / Event" },
  { value: "buildexact", label: "Buildexact" },
  { value: "other",      label: "Other" },
];

// Stage → win probability, used only for the weighted-value KPI (display-only).
export const STAGE_PROBABILITY = {
  enquiry: 0.1, qualify: 0.2, discovery: 0.35, winning_offer: 0.5,
  fee_proposal: 0.6, consultants: 0.72, tender: 0.88, won: 1,
  accepted: 0.8, // retired stage — kept for any legacy row still in `accepted`
};

export function formatValue(v) {
  if (!v) return null;
  const n = Number(v);
  if (!n) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

export function daysInStage(lead) {
  const entered = new Date(lead.stage_entered_at || lead.created_at);
  return Math.floor((Date.now() - entered.getTime()) / 86_400_000);
}

export function daysSinceActivity(lead) {
  const t = new Date(lead.last_activity_at || lead.created_at);
  return Math.floor((Date.now() - t.getTime()) / 86_400_000);
}

// Original scoreColor thresholds preserved (7 / 5), mapped to StatusBadge variants.
export function scoreVariant(score) {
  if (score == null || score === 0) return "neutral";
  if (score >= 7) return "success";
  if (score >= 5) return "warning";
  return "danger";
}

export function projectTypeLabel(v) {
  return PROJECT_TYPES.find((p) => p.value === v)?.label || v || "—";
}

export function relativeTime(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function weightedValue(leads) {
  return leads.reduce((s, l) => s + (Number(l.estimated_value) || 0) * (STAGE_PROBABILITY[l.stage] ?? 0), 0);
}

// ── Pipeline filters (chip bar) ──────────────────────────────────────────────
function isOverdue(lead) {
  return daysSinceActivity(lead) >= 14;
}
function needsAction(lead) {
  if (!lead.next_action_date) return false;
  const d = new Date(lead.next_action_date);
  if (isNaN(d)) return false;
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return d <= end; // due today or earlier
}
function isHighValue(lead) {
  return (Number(lead.estimated_value) || 0) >= 1_000_000;
}
function isRecentlyUpdated(lead) {
  return daysSinceActivity(lead) <= 3;
}

export const PIPELINE_FILTERS = [
  { value: "all",     label: "All leads",         test: () => true },
  { value: "needs",   label: "Needs action",      test: needsAction },
  { value: "overdue", label: "Overdue",           test: isOverdue },
  { value: "high",    label: "High value",        test: isHighValue },
  { value: "recent",  label: "Recently updated",  test: isRecentlyUpdated },
  // CRM Control Spine (migration 127) — fit filters, same single-select chip bar.
  { value: "fit_strong",   label: "Strong fit",   test: (l) => l.fit_quality === "strong" },
  { value: "fit_possible", label: "Possible fit", test: (l) => l.fit_quality === "possible" },
  { value: "fit_poor",     label: "Poor fit",     test: (l) => l.fit_quality === "poor" || l.fit_quality === "price_shopper" },
  { value: "ready_consult", label: "Ready for consult", test: (l) => l.readiness === "ready_for_consult" },
];

export function matchesFilter(lead, filterId) {
  const f = PIPELINE_FILTERS.find((x) => x.value === filterId);
  return f ? f.test(lead) : true;
}

// ── Action Queue (Pass 2B) ───────────────────────────────────────────────────
// Stage index → later active stages rank higher in the working queue.
export const STAGE_ORDER = STAGES.reduce((m, s, i) => { m[s.id] = i; return m; }, {});

/** Due status for a lead's next action: { status, label, days } (days +future / -overdue). */
export function dueInfo(lead) {
  if (!lead.next_action_date) return { status: "none", label: "No action set", days: null };
  const d = new Date(lead.next_action_date);
  if (isNaN(d)) return { status: "none", label: "No action set", days: null };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(d); due.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / 86_400_000);
  if (days < 0) return { status: "overdue", label: `${Math.abs(days)}d overdue`, days };
  if (days === 0) return { status: "today", label: "Due today", days };
  if (days <= 7) return { status: "soon", label: `Due in ${days}d`, days };
  return { status: "later", label: `Due ${due.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`, days };
}

/**
 * Composite priority score for the Action Queue. Higher = more urgent. Blends:
 * overdue/due-today next action, high value, qualifying score, stale stage age,
 * no recent contact, and active-stage priority.
 */
export function actionPriorityScore(lead) {
  let score = 0;
  const di = dueInfo(lead);
  if (di.status === "overdue") score += 1000 + Math.min(Math.abs(di.days), 60) * 5;
  else if (di.status === "today") score += 800;
  else if (di.status === "soon") score += 500 - di.days * 10;

  score += Math.min((Number(lead.estimated_value) || 0) / 1_000_000, 3) * 120; // value, up to ~360
  score += (Number(lead.qualify_score) || 0) * 25;                              // score, up to 200
  score += Math.min(daysInStage(lead), 90) * 1.5;                              // stale stage, up to 135
  score += Math.min(daysSinceActivity(lead), 90) * 2;                          // no contact, up to 180
  score += (STAGE_ORDER[lead.stage] ?? 0) * 15;                                // active-stage priority

  // No next action set but otherwise notable → nudge so it still surfaces.
  if (di.status === "none" && (daysSinceActivity(lead) >= 14 || daysInStage(lead) >= 21)) score += 120;
  return Math.round(score);
}

export const ACTION_BUCKETS = [
  { id: "overdue",   label: "Overdue",        variant: "danger" },
  { id: "today",     label: "Due today",      variant: "warning" },
  { id: "week",      label: "Due this week",  variant: "info" },
  { id: "attention", label: "Needs attention", variant: "neutral" },
  { id: "watch",     label: "Watching",       variant: "neutral" },
];

/** Bucket a lead for the Action Queue grouping. */
export function actionBucket(lead) {
  const di = dueInfo(lead);
  if (di.status === "overdue") return "overdue";
  if (di.status === "today") return "today";
  if (di.status === "soon") return "week";
  const notable =
    daysSinceActivity(lead) >= 14 ||
    daysInStage(lead) >= 21 ||
    (Number(lead.estimated_value) || 0) >= 1_000_000 ||
    (Number(lead.qualify_score) || 0) >= 7;
  if (di.status === "none" && notable) return "attention";
  return "watch";
}

// ── CRM Control Spine (migration 127) — driven action-type queue ────────────
// Complements the urgency buckets above (when): this groups by WHAT kind of action is owed,
// via the explicit action_type field a human (or the stage-change rule default) sets.
export const LEAD_ACTION_TYPE_BUCKETS = [
  { id: "response_due",        label: "Response due",        variant: "danger" },
  { id: "no_reply_follow_up",  label: "No-reply follow-up",  variant: "warning" },
  { id: "plans_requested",     label: "Plans requested",     variant: "info" },
  { id: "plans_received",      label: "Plans received",      variant: "info" },
  { id: "proposal_follow_up",  label: "Proposal follow-up",  variant: "warning" },
  { id: "nurture_check_in",    label: "Nurture check-in",    variant: "neutral" },
  { id: "lost_review",         label: "Lost lead review",    variant: "neutral" },
  { id: "reactivation",        label: "Reactivation",        variant: "neutral" },
];

/** Is this lead currently snoozed (hidden from the action-type queue until snoozed_until)? */
export function isSnoozed(lead) {
  return !!lead.snoozed_until && new Date(lead.snoozed_until) > new Date();
}

/** Due status for action_due_at, same shape as dueInfo() but for the driven queue. */
export function actionDueInfo(lead) {
  if (!lead.action_due_at) return { status: "none", label: "No due date", days: null };
  const due = new Date(lead.action_due_at);
  if (isNaN(due)) return { status: "none", label: "No due date", days: null };
  const today = new Date();
  const days = Math.round((due - today) / 86_400_000);
  if (days < 0) return { status: "overdue", label: `${Math.abs(days)}d overdue`, days };
  if (days === 0) return { status: "today", label: "Due today", days };
  return { status: "soon", label: `Due ${due.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`, days };
}
