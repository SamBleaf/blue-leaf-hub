// carpentryScope.mjs — the plain-language JOB-SCOPE questions for the carpentry WHS pack (Questionnaire
// spec §4). Answering these derives which control modules apply — including the demolition/asbestos/
// excavation modules (H-08/09/10/H-13) that a project-type stage pre-tick can't reach — AND records the
// negatives ("H-10 not applicable, post-2004") as a compliance artefact. Pure; mirror of
// src/lib/carpentryScope.js (parity-tested). Distinct from the Operations engine's whsQuestionnaire.mjs.

export const JOB_STAGES = [
  ["first_fix", "First fix / framing"],
  ["cladding", "Cladding"],
  ["second_fix", "Second fix"],
  ["roofing", "Roof framing"],
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
  { key: "j_plant", type: "yesno", q: "Powered mobile plant on site (crane, telehandler, EWP) — including plant brought by others?" },
  { key: "j_services", type: "yesno", q: "Overhead powerlines, live wiring or buried services in the work path?" },
];

// Modules a Yes answer pulls in that the project-type stage pre-tick may not (esp. the demolition set).
// j_plant/j_services (Sam's 2-review pass) reach the two HRCW modules — powered mobile plant + energised
// services — that no stage covers; they are gate-only, like asbestos/road/excavation.
export const J_MODULE_MAP = {
  j3Openings: ["H-06"],
  j4Loadbearing: ["H-08", "H-09"],
  j5Pre2004: ["H-10"],
  j6Silica: ["T-01", "H-14"],
  j7Road: ["H-12"],
  j8Excavation: ["H-13"],
  j_plant: ["H-07"],
  j_services: ["H-11"],
};

// Every code any J-question can derive — used so these modules are LOADABLE/selectable in the builder.
export const J_MAP_CODES = [...new Set(Object.values(J_MODULE_MAP).flat())];

// ── Stage → module map (Sam's 2-review pass, 2026-08-03) — drives the §1→§2 selection. ───────────
// Authoritative source: docs/whs/registers/10_StageModule_Matrix.csv (edit there; this re-syncs).
// A stage lists the modules it pulls in; MODULE_GATE then narrows a module to fire only when its gate
// (a §1 yes/no, or a §2 site fact) is satisfied. Pure data — the live §1→§2 wiring is deferred until
// the matrix is locked. DRAFT until the WHS reviewer signs the mapping.
export const STAGE_MODULES = {
  first_fix: ["H-01", "H-02", "H-06", "T-02", "T-03", "T-04", "T-05", "T-06", "T-07", "T-08", "T-09", "T-11", "T-12"],
  cladding: ["H-05", "H-14", "T-01", "T-04", "T-05", "T-06", "T-07", "T-08", "T-09", "T-11", "T-13"],
  second_fix: ["T-01", "T-02", "T-04", "T-05", "T-06", "T-07", "T-08", "T-09", "T-11", "T-12"],
  roofing: ["H-03", "H-04", "H-06", "H-14", "T-01", "T-03", "T-04", "T-05", "T-06", "T-07", "T-08", "T-09", "T-11", "T-13"],
  demo_propping: ["H-08", "H-09", "H-14", "T-01", "T-04", "T-05", "T-06", "T-07", "T-08", "T-09", "T-11", "T-12"],
};
export const ALWAYS_MODULES = ["T-10", "T-14"]; // every carpentry job, regardless of stage

// A module that only applies when its gate is satisfied wherever it is selected. J-gates read the §1
// answers; sf-gates read §2 site facts. H-07/H-10/H-11/H-12/H-13 are NOT stage-tied — they come purely
// from J_MODULE_MAP (gate-only, like asbestos), so they need no MODULE_GATE entry.
export const MODULE_GATE = {
  "H-01": "j2Heights", "H-02": "j2Heights", "H-03": "j2Heights", "H-04": "j2Heights", "H-05": "j2Heights",
  "H-06": "j3Openings", "H-08": "j4Loadbearing", "H-09": "j4Loadbearing",
  "H-14": "j6Silica", "T-01": "j6Silica", "T-13": "sf01Scaffold",
};

// Gate predicates: (jScope, siteFacts) → bool. J-gates are a plain "yes"; sf01Scaffold fires whenever
// a scaffold is present on site (any tag state other than absent). Keys must match MODULE_GATE values.
export const GATE_PREDICATES = {
  j2Heights: (j) => j.j2Heights === "yes",
  j3Openings: (j) => j.j3Openings === "yes",
  j4Loadbearing: (j) => j.j4Loadbearing === "yes",
  j6Silica: (j) => j.j6Silica === "yes",
  sf01Scaffold: (_j, sf = {}) => !!sf.sf01Scaffold && !["no", "none", ""].includes(sf.sf01Scaffold),
};

// The full §1 → module derivation: stage modules (each narrowed by its gate) ∪ always ∪ J-yes/no extras
// ∪ the overhead-services site-fact auto-trigger. This is what §2 reflects. siteFacts is optional (§2,
// deferred) — pass it once the site-facts layer is wired so sf-gated modules resolve.
export function deriveModulesFromScope(jScope = {}, siteFacts = {}) {
  const codes = new Set(ALWAYS_MODULES);
  const gateOk = (code) => {
    const g = MODULE_GATE[code];
    if (!g) return true;
    const pred = GATE_PREDICATES[g];
    return pred ? pred(jScope, siteFacts) : true;
  };
  for (const stage of jScope.j1Stages || []) {
    for (const code of STAGE_MODULES[stage] || []) if (gateOk(code)) codes.add(code);
  }
  for (const [k, cs] of Object.entries(J_MODULE_MAP)) if (jScope[k] === "yes") cs.forEach((c) => codes.add(c));
  // H-11 (energised services) also auto-fires when the site fact records overhead services present.
  if (siteFacts.sf12Overhead && siteFacts.sf12Overhead !== "none") codes.add("H-11");
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
