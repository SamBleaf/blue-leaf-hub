// carpentryScope.mjs — the plain-language JOB-SCOPE questions for the carpentry WHS pack (Questionnaire
// spec §4). Answering these derives which control modules apply — including the demolition/asbestos/
// excavation modules (H-08/09/10/H-13) that a project-type stage pre-tick can't reach — AND records the
// negatives ("H-10 not applicable, post-2004") as a compliance artefact. Pure; mirror of
// src/lib/carpentryScope.js (parity-tested). Distinct from the Operations engine's whsQuestionnaire.mjs.

export const JOB_STAGES = [
  ["first_fix", "First fix / framing"],
  ["cladding", "Cladding"],
  ["second_fix", "Second fix"],
  ["roofing", "Roofing"],
  ["demo_propping", "Demolition / propping"],
];

export const J_QUESTIONS = [
  { key: "j1Stages", type: "stages", q: "Which stages are on this job?" },
  { key: "j2Heights", type: "yesno", q: "Any work more than 2 m above the level below?" },
  { key: "j3Openings", type: "yesno", q: "Openings, stair voids or penetrations in any working surface?" },
  { key: "j4Loadbearing", type: "yesno", q: "Removing or altering anything load-bearing?" },
  { key: "j5Pre2004", type: "yesno", q: "Structure built before 2004?" },
  { key: "j6Silica", type: "yesno", q: "Cutting or drilling fibre cement, AAC, masonry or tile on site?" },
  { key: "j7Road", type: "yesno", q: "Any work, plant or exclusion zone extending onto a road or footpath?" },
  { key: "j8Excavation", type: "yesno", q: "Excavation deeper than 1.5 m in the work area?" },
];

// Modules a Yes answer pulls in that the project-type stage pre-tick may not (esp. the demolition set).
export const J_MODULE_MAP = {
  j3Openings: ["H-06"],
  j4Loadbearing: ["H-08", "H-09"],
  j5Pre2004: ["H-10"],
  j6Silica: ["T-01", "H-14"],
  j7Road: ["H-12"],
  j8Excavation: ["H-13"],
};

// Every code any J-question can derive — used so these modules are LOADABLE/selectable in the builder.
export const J_MAP_CODES = [...new Set(Object.values(J_MODULE_MAP).flat())];

// ── Stage → module map (Sam's first pass, 2026-08-03) — drives the §1→§2 selection. ──────────────
// Each entry is [code] or [code, gateKey]: a gated entry only applies when that yes/no is "yes".
// DRAFT — the editable dependency matrix lives in docs/whs/registers/10_StageModule_Matrix.csv.
export const STAGE_MODULE_MAP = {
  first_fix: [["H-01"], ["H-02", "j2Heights"], ["H-03"], ["H-04"], ["H-06"], ["T-02"], ["T-03"], ["T-04"], ["T-05"], ["T-06"], ["T-07"], ["T-08"], ["T-09"], ["T-10"], ["T-11"], ["T-13"]],
  cladding: [["H-05"], ["H-14"], ["T-01"], ["T-04"], ["T-05"], ["T-06"], ["T-07"], ["T-08"], ["T-09"], ["T-10"], ["T-11"], ["T-12"]],
  second_fix: [["T-02"], ["T-05"], ["T-06"], ["T-07"], ["T-08"], ["T-09"]],
  roofing: [["T-13"]],
  demo_propping: [["H-08"], ["H-09"]], // TBD — awaiting Sam's dependency pass
};
export const ALWAYS_MODULES = ["T-14"]; // every carpentry job, regardless of stage

// The full §1 → module derivation: stage modules (gated) ∪ always ∪ J-yes/no extras. This is what §2 reflects.
export function deriveModulesFromScope(jScope = {}) {
  const codes = new Set(ALWAYS_MODULES);
  for (const stage of (jScope.j1Stages || [])) {
    for (const [code, gate] of (STAGE_MODULE_MAP[stage] || [])) {
      if (!gate || jScope[gate] === "yes") codes.add(code);
    }
  }
  for (const [k, cs] of Object.entries(J_MODULE_MAP)) if (jScope[k] === "yes") cs.forEach((c) => codes.add(c));
  return [...codes];
}

/** Codes a scope pulls in (deduped). Only fires on an explicit "yes". */
export function deriveScopeModules(jScope = {}) {
  const out = [];
  for (const [k, codes] of Object.entries(J_MODULE_MAP)) if (jScope[k] === "yes") out.push(...codes);
  return [...new Set(out)];
}

/** G-6: every scope question must be answered — a negative is an answer, a blank is not. */
export function jScopeMissing(jScope = {}) {
  const miss = [];
  if (!Array.isArray(jScope.j1Stages) || jScope.j1Stages.length === 0) miss.push("j1Stages");
  for (const q of J_QUESTIONS) if (q.type === "yesno" && jScope[q.key] !== "yes" && jScope[q.key] !== "no") miss.push(q.key);
  return miss;
}
export function jScopeComplete(jScope = {}) { return jScopeMissing(jScope).length === 0; }
