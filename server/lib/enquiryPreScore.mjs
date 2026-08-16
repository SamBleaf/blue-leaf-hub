// enquiryPreScore.mjs — Sales OS Slice 1, workstream A: web enquiry → qualifying pre-score + routing.
//
// The public enquiry form (website Contact.vue) captures structured budget / timeframe / stage
// answers. This maps the two that are score components (budget, timeframe) into the INTEGER
// qualify_* columns — NEVER qualify_score, which is GENERATED ALWAYS AS the COALESCE-sum of the
// four components (migration 016; a null component safely counts as 0). It maps the form's
// project_stage → the existing 3-value design_stage vocab (concept / da_approved /
// construction_drawings — do NOT invent new values), and decides whether the lead has enough
// signal to SKIP the Enquiry stage and land straight in Qualify (pre-scored; the salesperson
// confirms + fills site-ownership/decision-maker, which the form never asks).
//
// Unmapped/blank values log once and default safe: no score, land at enquiry.
//
// EXACT option strings are lifted verbatim from resources/js/Pages/Contact.vue — note the
// en-dashes (U+2013) in the ranges; a literal-drift mismatch just yields null (safe), never a wrong score.

/** budget_range → qualify_budget (0..2 | null). Clear viable custom budget = 2. */
export function mapBudget(v) {
  switch ((v || "").trim()) {
    case "$500k–$750k":
    case "$750k–$1m":
    case "$1m–$1.5m":
    case "$1.5m+":
      return 2;
    case "Under $500k":   // clear but low for custom — confirm
      return 1;
    case "Not sure yet":
      return 1;
    default:
      return null;
  }
}

/** timeframe → qualify_timeframe (0..2 | null). <6mo ready = 2, 6–18 = 1, 18+ = 0. */
export function mapTimeframe(v) {
  switch ((v || "").trim()) {
    case "As soon as possible":
    case "3–6 months":
      return 2;
    case "6–12 months":
    case "Not sure yet":
      return 1;
    case "12+ months":
      return 0;
    default:
      return null;
  }
}

/** project_stage → existing design_stage vocab (concept | da_approved | construction_drawings | null). */
export function mapDesignStage(projectStage /*, designerStatus */) {
  switch ((projectStage || "").trim()) {
    case "Concept plans underway":
      return "concept";
    case "Detailed plans ready":
    case "Ready for pricing":
    case "Already have quotes":
      return "construction_drawings";
    case "Approvals underway":
      return "da_approved";
    default:
      // "Early idea" / "Need help choosing a designer" / blank → no design stage yet
      return null;
  }
}

// A definite (non-blank, non-"Not sure yet") budget OR timeframe = enough to skip Enquiry.
function isDefinite(v) {
  const s = (v || "").trim();
  return !!s && s !== "Not sure yet";
}

/**
 * Compute the pre-score + stage routing for a public enquiry body.
 * Returns fields to spread into the leads insert. web_prescored is true only when we actually
 * skip Enquiry (so the Qualify "confirm web score" banner shows for exactly those leads).
 */
export function preScoreEnquiry(body = {}) {
  const { budget_range, timeframe, project_stage } = body;

  const qualify_budget = mapBudget(budget_range);
  const qualify_timeframe = mapTimeframe(timeframe);
  const design_stage = mapDesignStage(project_stage);
  const enoughToSkip = isDefinite(budget_range) || isDefinite(timeframe);

  const unmapped = [];
  if (budget_range && qualify_budget === null) unmapped.push(`budget_range="${budget_range}"`);
  if (timeframe && qualify_timeframe === null) unmapped.push(`timeframe="${timeframe}"`);
  if (unmapped.length) {
    console.warn(`[enquiry-prescore] unmapped values (defaulting safe): ${unmapped.join(", ")}`);
  }

  return {
    qualify_budget,     // null counts as 0 in the generated qualify_score
    qualify_timeframe,
    design_stage,       // null if not derivable
    stage: enoughToSkip ? "qualify" : "enquiry",
    web_prescored: enoughToSkip,
  };
}
