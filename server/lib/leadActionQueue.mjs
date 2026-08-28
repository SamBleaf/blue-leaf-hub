/**
 * leadActionQueue.mjs — CRM Control Spine (Batch 1A, migration 127).
 * Rule-based (no AI) action_type + action_due_at defaults, derived on stage change.
 * A human-set action_type/action_due_at in the same request always wins — these rules
 * only fill the gap so a lead never silently drops out of the queue after a stage move.
 */

export const VALID_ACTION_TYPES = [
  "response_due", "no_reply_follow_up", "plans_requested", "plans_received",
  "proposal_follow_up", "nurture_check_in", "lost_review", "reactivation",
];

function addDays(from, days) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** { actionType, dueInDays } per pipeline stage, or null (no default — e.g. 'won'). */
const STAGE_DEFAULTS = {
  enquiry:       { actionType: "response_due",       dueInDays: 1 },
  qualify:       { actionType: "response_due",        dueInDays: 2 },
  discovery:     { actionType: "plans_requested",      dueInDays: 3 },
  winning_offer: { actionType: "proposal_follow_up",   dueInDays: 3 },
  fee_proposal:  { actionType: "proposal_follow_up",   dueInDays: 3 },
  consultants:   { actionType: "response_due",        dueInDays: 5 },
  accepted:      { actionType: "response_due",        dueInDays: 1 },
  tender:        { actionType: "response_due",        dueInDays: 2 },
  won:           null,
  nurture:       { actionType: "nurture_check_in",     dueInDays: 30 },
  lost:          { actionType: "lost_review",          dueInDays: 1 },
};

/** Returns { action_type, action_due_at } to apply for a stage, or null for stages with no default. */
export function deriveActionForStage(stage, now = new Date()) {
  const rule = STAGE_DEFAULTS[stage];
  if (!rule) return null;
  return { action_type: rule.actionType, action_due_at: addDays(now, rule.dueInDays) };
}

export function isValidActionType(v) {
  return VALID_ACTION_TYPES.includes(v);
}
