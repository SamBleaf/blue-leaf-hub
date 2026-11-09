/**
 * stageGates.js — THE single canonical definition of what each sales pipeline stage requires
 * to be entered. Imported by BOTH:
 *   • the server  (server/lib/salesRoutes.mjs)  — enforcement (hard gates) + advisory warnings
 *   • the client  (src/pages/LeadDetail.jsx)    — read-only display of the same requirements
 *
 * There is intentionally ONE copy. Before this module the gate rules lived in three places that
 * drifted — a client GATE_REQUIREMENTS list, a stale server STAGE_GATES "advisory mirror" that
 * silently under-reported what was enforced and omitted whole stages, and three bespoke server
 * hard-gate blocks. Keep ALL gate rules here (S-013 / ARCH-01 — one server-owned gate result).
 *
 * All checks operate on a RAW (snake_case) lead object — the shape the client holds and the
 * shape the server's `select("*")` returns. The `"field" in lead` guards keep a gate deploy-
 * ahead safe: if a column has not been migrated yet it is simply absent from the row, so the
 * gate PASSES rather than falsely blocking (never query a possibly-unmigrated column directly).
 *
 * Each requirement:
 *   field       - the lead column it reads (also the UI deep-link target)
 *   label       - the requirement, shown to staff
 *   hard        - true  → a FORWARD advance is blocked server-side until satisfied (422 GATE_BLOCKED)
 *                 false → advisory: surfaced to staff + logged as a bypass, never blocks
 *   check(lead) - predicate; true = satisfied
 *   hint        - plain-English how-to, shown under an unmet row / as the header "Next:" step
 *   blockPhrase - (hard only, optional) natural phrase used to compose the 422 message;
 *                 defaults to the lowercased label
 *
 * Hard requirements: Discovery (score + booked conversation), Concept/winning_offer (concept agreement
 * accepted), Won (building contract signed AND the signed PDF on file). Promoting any advisory requirement
 * to hard is a deliberate policy change — make it here and it takes effect in both the server block and
 * the UI at once.
 *
 * Two rules the server relies on (R05 P1):
 *   • Hard gates read STORED state only — pass the row as it is in the database, never the row merged with
 *     the request body, so one request can't satisfy its own gate. Advisory warnings may use the merged view.
 *   • A forward move checks every hard gate it crosses, not just the target (`forwardMoveBlock`), so a jump
 *     can't skip a gated stage. Backward moves and test leads stay ungated.
 *
 * `contract_evidence_present` is derived, not a column: the server attaches it to the lead
 * (server/lib/leadContractEvidence.mjs) before evaluating gates and in its GET/PATCH responses, so the
 * client and the server read the same thing.
 */

// Consultants → Tender exit: the full consultant document set must be in (every roster
// deliverable received/issued). An empty roster is not ready.
export function consultantDocsReady(roster) {
  const r = Array.isArray(roster) ? roster : [];
  return r.length > 0 && r.every((e) => (Array.isArray(e.deliverables) ? e.deliverables : []).every((d) => d.status === "received" || d.status === "issued"));
}

export const STAGE_GATES = {
  qualify: [],
  discovery: [
    { field: "qualify_score", label: "Qualifying score ≥ 5", hard: true, blockPhrase: "a qualifying score of at least 5",
      check: l => (l.qualify_score || 0) >= 5,
      hint: "Score the qualifying questions in the scorecard above" },
    // Hard once migration 174 is applied (column present); pre-migration it is absent → passes.
    { field: "discovery_meeting_booked_at", label: "Build conversation booked", hard: true, blockPhrase: "a booked build conversation",
      check: l => !("discovery_meeting_booked_at" in l) || !!l.discovery_meeting_booked_at,
      hint: "Send the qualify email; the client books via the link (or Check for booking)" },
  ],
  winning_offer: [
    // Hard once migration 179 is applied (column present); pre-migration it is absent → passes.
    { field: "concept_agreement_status", label: "Concept agreement accepted", hard: true, blockPhrase: "the concept agreement accepted",
      check: l => !("concept_agreement_status" in l) || l.concept_agreement_status === "accepted",
      hint: "Generate the concept agreement, then Mark accepted" },
    { field: "discovery_notes", label: "Discovery notes filled", hard: false,
      check: l => !!l.discovery_notes?.trim(), hint: "Capture the discovery notes below" },
    { field: "design_stage", label: "Design stage set", hard: false,
      check: l => !!l.design_stage, hint: "Set the Design stage (Concept readiness in the focus card)" },
    { field: "desired_start_date", label: "Desired start date set", hard: false,
      check: l => !!l.desired_start_date, hint: "Set the client's desired start date (Concept readiness)" },
  ],
  fee_proposal: [
    { field: "concept_design_status", label: "Concept design approved", hard: false,
      check: l => !("concept_design_status" in l) || l.concept_design_status === "approved",
      hint: "Unlock the concept design first — mark the concept fee paid in Xero, or use Override in the Concept card — then mark it Approved once the client signs off" },
    { field: "concept_pathway_explained", label: "PTSA / Plans pathway explained", hard: false,
      check: l => !("concept_pathway_explained" in l) || !!l.concept_pathway_explained,
      hint: "Tick 'PTSA / Plans pathway explained' after walking the client through it" },
    { field: "preconstruction_fee", label: "Pre-construction fee set", hard: false,
      check: l => l.preconstruction_fee != null, hint: "Enter the pre-construction fee in the Concept card" },
  ],
  consultants: [
    { field: "ptsa_status", label: "PTSA signed", hard: false,
      check: l => !("ptsa_status" in l) || l.ptsa_status === "signed",
      hint: "Send the PTSA, then Mark PTSA as signed (uploads the signed PDF)" },
  ],
  tender: [
    { field: "consultant_roster", label: "Consultant documents complete", hard: false,
      check: l => consultantDocsReady(l.consultant_roster), hint: "Advance each consultant's deliverables to received/issued" },
    { field: "fee_proposal_id", label: "Fixed-Price proposal generated", hard: false,
      check: l => !!l.fee_proposal_id, hint: "Generate the Fixed-Price proposal (button in the Consultants stage)" },
    { field: "provisional_ff_issued", label: "Provisional F&F schedule issued", hard: false,
      check: l => !("provisional_ff_issued" in l) || !!l.provisional_ff_issued, hint: "Issue the provisional F&F schedule to suppliers, then tick 'issued'" },
    { field: "site_address", label: "Site address set", hard: false,
      check: l => !!l.site_address?.trim(), hint: "Add the site address in Lead details" },
    { field: "job_id", label: "Job created from this lead", hard: false,
      check: l => !!l.job_id, hint: "Create the job from this lead (button below)" },
  ],
  // Tender exit → Won: a signed building contract WITH the signed PDF on file. Two rows on purpose, so a
  // legacy "signed" lead with no file shows exactly what is still missing.
  // Hard once migration 194 is applied (contract_status present); pre-migration it is absent → passes.
  won: [
    { field: "contract_status", label: "Building contract signed", hard: true, blockPhrase: "the building contract signed",
      check: l => !("contract_status" in l) || l.contract_status === "signed",
      hint: "Upload the client-signed PDF under Building contract in the Tender stage — that marks it signed" },
    { field: "contract_evidence_present", label: "Signed contract PDF on file", hard: true, blockPhrase: "the signed contract PDF on file",
      check: l => !("contract_status" in l) || l.contract_evidence_present === true,
      hint: "A \"signed\" status alone isn't proof. Upload the client-signed PDF under Building contract in the Tender stage" },
  ],
};

// APB pipeline order (off-pipeline nurture/lost excluded). Used to tell a FORWARD advance from a
// corrective BACKWARD move: hard gates apply only to forward moves on real (non-test) leads.
export const STAGE_ORDER = ["enquiry", "qualify", "discovery", "winning_offer", "fee_proposal", "consultants", "tender", "won"];

// The retired `accepted` stage sat straight after PTSA / Plans, so a legacy row counts as having got that far.
const LEGACY_STAGE_POSITION = { accepted: "fee_proposal" };

/**
 * Which Sales stages apply to a lead. Derived, never stored — `delivery_model` plays no part in it.
 * Architect Tender leads enter at Tender (Concept and PTSA are intentionally skipped, see mig 216).
 */
export function resolveEngagementPathway(lead) {
  return lead?.lead_type === "architect_tender" ? "architect_tender" : "design_build";
}

const STAGES_NOT_APPLICABLE = {
  design_build: [],
  architect_tender: ["discovery", "winning_offer", "fee_proposal"],
};

/**
 * The stages a move into `to` passes through, target included, in order. Empty for a move that is not
 * forward: backward, same stage, or out to nurture/lost. A lead coming back from nurture/lost starts at
 * the beginning of the pipeline, so it can't re-enter past a gate it never met.
 * Stages that don't apply to the lead's pathway are skipped, except the target itself.
 */
export function stagesCrossed(from, to, lead) {
  const toIdx = STAGE_ORDER.indexOf(to);
  if (toIdx < 0) return [];
  const fromIdx = STAGE_ORDER.indexOf(LEGACY_STAGE_POSITION[from] || from);
  if (toIdx <= fromIdx) return [];
  const notApplicable = new Set(STAGES_NOT_APPLICABLE[resolveEngagementPathway(lead)] || []);
  return STAGE_ORDER.slice(fromIdx + 1, toIdx + 1).filter((s) => s === to || !notApplicable.has(s));
}

/**
 * The single canonical gate evaluation for entering `targetStage` with `lead`'s current data.
 * Returns the unmet requirements split into hard (block a forward advance) and advisory (warn only).
 *   { ok, missing, hardMissing, advisoryMissing }   // each a list of requirement objects
 */
export function evaluateGate(targetStage, lead) {
  const reqs = STAGE_GATES[targetStage] || [];
  const l = lead || {};
  const missing = reqs.filter(r => !r.check(l));
  return {
    ok: missing.length === 0,
    missing,
    hardMissing: missing.filter(r => r.hard),
    advisoryMissing: missing.filter(r => !r.hard),
  };
}

const needsPhrase = (reqs) => reqs.map(r => r.blockPhrase || r.label.toLowerCase()).join(" and ");

/**
 * The staff-facing 422 message when entering `targetStage` is hard-blocked, or null when nothing hard is
 * missing. `stageLabel` is the human stage name (e.g. "Discovery", "Concept").
 */
export function hardBlockReason(targetStage, lead, stageLabel) {
  const { hardMissing } = evaluateGate(targetStage, lead);
  if (!hardMissing.length) return null;
  return `Can't advance to ${stageLabel || targetStage} yet — needs ${needsPhrase(hardMissing)}.`;
}

/**
 * The first stage on a forward move from `from` to `to` with an unmet hard requirement, or null if the move
 * is clear (or isn't a forward move at all). Pass STORED state, never the row merged with the request.
 */
export function forwardMoveBlock(from, to, lead) {
  for (const stage of stagesCrossed(from, to, lead)) {
    const { hardMissing } = evaluateGate(stage, lead || {});
    if (hardMissing.length) return { stage, hardMissing };
  }
  return null;
}

/** The staff-facing 422 message for a blocked forward move, or null. `labelOf(stage)` gives the human name. */
export function forwardBlockReason(from, to, lead, labelOf = (s) => s) {
  const block = forwardMoveBlock(from, to, lead);
  if (!block) return null;
  if (block.stage === to) return hardBlockReason(to, lead, labelOf(to));
  return `Can't move to ${labelOf(to)} yet — ${labelOf(block.stage)} still needs ${needsPhrase(block.hardMissing)}.`;
}

// Who may perform the high-consequence Sales writes: mark a contract or PTSA signed, accept a concept
// agreement, move a lead to Won. This is the upper limit, not today's access: the prefix gate in
// server/dev-api.mjs ("A4") and the SPA's RoleRoute open all of Sales and Tender to admins only, and they
// run first. If Sales is ever opened to supervisors, these checks still keep employees out.
export const SALES_CONTROLLED_ROLES = ["admin", "supervisor"];
export const canPerformControlledSalesWrite = (role) => SALES_CONTROLLED_ROLES.includes(role);
// Taking a contract back out of "signed" is stricter still: directors only.
export const canUnsignContract = (role) => role === "admin";
