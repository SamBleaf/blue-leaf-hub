/**
 * leadNextAction.js — the one answer to "what do I do next on this lead?", and the jump that lands on it.
 *
 * The header (desktop) and the sticky bar (mobile) only ever POINT at the next thing to do. They never do it:
 * the stage is moved from the single completion panel at the bottom of the workflow. Each result names a
 * `target`, matched by a `data-next-target` attribute on the exact control, so the pointer lands on that
 * control and not the top of a long card.
 *
 * `computeLeadNextAction` is pure and reads the raw (snake_case) lead, like stageGates.js.
 */
import { gateRows } from "./stageGates.js";
import { TENDER_SUBSTATUS_ORDER } from "./constants.js";

export const ADVANCE_TARGET = "stage-advance";
export const STAGE_EMAIL_TARGET = "stage-email";
export const WON_HANDOFF_TARGET = "won-handoff";
export const OPS_READY_TARGET = "ops-ready";
export const ENQUIRY_CALL_TARGET = "enquiry-call";
export const QUALIFY_CONFIRM_TARGET = "qualify-confirm";
export const RFQ_START_TARGET = "rfq-start";
export const PROPOSAL_PRESENTATION_TARGET = "proposal-presentation";

const SCORE_FIELDS = ["qualify_budget", "qualify_timeframe", "qualify_site", "qualify_decision_maker"];
// The website form can pre-fill budget and timeframe. It never asks these two, so only they show someone spoke to the client.
const ANSWERED_ON_THE_CALL = ["qualify_site", "qualify_decision_maker"];

// These controls live under Lead details, which is the Summary tab on a phone. Everything else is on Action.
const LEAD_DETAIL_TARGETS = new Set(["design_stage", "desired_start_date", "site_address"]);

// The short instruction for each gate row. A gate's `hint` is the longer how-to shown in the completion panel.
const GATE_ACTIONS = {
  qualify_score: (l) => {
    const unanswered = SCORE_FIELDS.find((f) => l[f] == null);
    return unanswered
      ? { label: "Finish the qualifying scorecard", target: unanswered }
      : { label: "Review the score: 5 or more is needed" };
  },
  discovery_meeting_booked_at: (l) => ({
    label: l.qualify_intro_sent_at ? "Check whether the client has booked" : "Book or log the build conversation",
  }),
  concept_agreement_status: (l) => ({
    label: l.concept_agreement_document_path ? "Mark the concept agreement accepted" : "Generate the concept agreement",
  }),
  discovery_notes: () => ({ label: "Add the discovery notes" }),
  design_stage: () => ({ label: "Set the design stage" }),
  desired_start_date: () => ({ label: "Set the desired start date" }),
  concept_design_status: () => ({ label: "Get the concept design approved" }),
  concept_pathway_explained: () => ({ label: "Explain the PTSA / Plans pathway" }),
  preconstruction_fee: () => ({ label: "Set the pre-construction fee" }),
  ptsa_status: () => ({ label: "Upload the signed PTSA" }),
  consultant_roster: () => ({ label: "Finish the consultant documents" }),
  fee_proposal_id: () => ({ label: "Generate the Fixed-Price proposal" }),
  provisional_ff_issued: () => ({ label: "Issue the provisional F&F schedule" }),
  site_address: () => ({ label: "Add the site address" }),
  job_id: () => ({ label: "Create the job from this lead" }),
  contract_status: () => ({ label: "Upload the signed contract" }),
  contract_evidence_present: () => ({ label: "Upload the signed contract PDF", target: "contract_status" }),
};

const action = ({ label, target }) => ({
  label, target, mobileTab: LEAD_DETAIL_TARGETS.has(target) ? "summary" : "action",
});

/** Where the tender is up to. "Contract signed" reads the building contract, never the step on its own. */
export function currentTenderStep(lead) {
  if (lead.contract_status === "signed") return "contract_signed";
  return lead.tender_substatus === "contract_signed" ? "contract_sent" : lead.tender_substatus || null;
}

// Until a client is reviewing a proposal, the contract gate isn't the next thing to do: the estimate, the
// presentation and the follow-up after it are.
function tenderWorkAction(lead) {
  const current = currentTenderStep(lead);
  if (lead.contract_status || TENDER_SUBSTATUS_ORDER.indexOf(current) >= TENDER_SUBSTATUS_ORDER.indexOf("client_reviewing")) return null;
  if (current === "proposal_presented") return action({ label: "Follow up on the proposal", target: STAGE_EMAIL_TARGET });
  if (current === "proposal_generated") return action({ label: "Present the proposal to the client", target: PROPOSAL_PRESENTATION_TARGET });
  if (!lead.site_address?.trim()) return action({ label: "Add the site address", target: "site_address" });
  return action({ label: "Build the estimate in the RFQ Engine", target: RFQ_START_TARGET });
}

function wonAction(lead) {
  if (!lead.job_id) {
    return lead.site_address?.trim()
      ? action({ label: "Create the job from this lead", target: WON_HANDOFF_TARGET })
      : action({ label: "Add the site address", target: "site_address" });
  }
  if (lead.won_substatus !== "ops_ready") return action({ label: "Finish the Ops Ready handoff", target: OPS_READY_TARGET });
  return action({ label: "Open the job dashboard", target: WON_HANDOFF_TARGET });
}

/**
 * The single next action for a lead, or null when there is nothing to point at (Nurture, Lost).
 *   next       the stage after this one, or null
 *   nextLabel  its staff-facing name
 * Returns { label, target, mobileTab }.
 */
export function computeLeadNextAction(lead, { next, nextLabel } = {}) {
  if (!lead) return null;
  if (lead.stage === "won") return wonAction(lead);
  if (!next) return null;

  if (lead.stage === "enquiry") {
    return ANSWERED_ON_THE_CALL.some((f) => lead[f] != null)
      ? action({ label: "Decide the outcome of the enquiry", target: ADVANCE_TARGET })
      : action({ label: "Run the enquiry call", target: ENQUIRY_CALL_TARGET });
  }
  if (lead.stage === "qualify" && lead.web_prescored && !lead.qualify_confirmed_at) {
    return action({ label: "Confirm the website score", target: QUALIFY_CONFIRM_TARGET });
  }
  if (lead.stage === "tender") {
    const work = tenderWorkAction(lead);
    if (work) return work;
  }

  const { required, recommended } = gateRows(next, lead);
  const unmet = [...required, ...recommended].find((r) => !r.met);
  if (!unmet) return action({ label: `Move to ${nextLabel}`, target: ADVANCE_TARGET });
  const specific = GATE_ACTIONS[unmet.field]?.(lead) || {};
  return action({ label: specific.label || unmet.label, target: specific.target || unmet.field });
}

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]";

/**
 * Scroll to the control tagged `data-next-target="<target>"`, open anything collapsed around it and flash a ring so
 * the click is visibly acknowledged. The desktop and mobile layouts are both mounted, so this picks the copy that
 * is actually on screen.
 *
 * Keyboard focus goes to the one control that fits: the target itself, a child marked `data-next-focus`, or an only
 * child. A group of choices takes focus on its wrapper, so a stray Enter can't answer a question or change a status.
 */
export function focusLeadControl(target, root = document) {
  const visible = (el) => el.getClientRects().length > 0;
  const candidates = [...root.querySelectorAll(`[data-next-target="${target}"]`)];
  for (const el of candidates) {
    for (let d = el.parentElement?.closest("details"); d; d = d.parentElement?.closest("details")) d.open = true;
  }
  const el = candidates.find(visible) || [...root.querySelectorAll("#lead-focus")].find(visible);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-primary", "ring-offset-2");
  setTimeout(() => { el.classList.remove("ring-2", "ring-primary", "ring-offset-2"); }, 1600);
  const inside = el.querySelectorAll(FOCUSABLE);
  const control = el.matches(FOCUSABLE) ? el : el.querySelector(`[data-next-focus]:is(${FOCUSABLE})`) || (inside.length === 1 ? inside[0] : null);
  if (!control) el.tabIndex = -1;
  (control || el).focus({ preventScroll: true });
  return true;
}

export const CHOOSE_STAGE_EMAIL = "lead:choose-stage-email";

/** Land on Client correspondence with one named email already chosen in its list. */
export function goToStageEmail(key) {
  document.dispatchEvent(new CustomEvent(CHOOSE_STAGE_EMAIL, { detail: key }));
  focusLeadControl(STAGE_EMAIL_TARGET);
}
