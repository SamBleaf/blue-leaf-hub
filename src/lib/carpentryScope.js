// carpentryScope.js — client mirror of server/lib/whs/carpentryScope.mjs (Questionnaire spec §4).
// Keep identical to the server so the builder's derived module set + G-6 completeness match.
// scripts/tests/carpentry-scope-parity.test.mjs asserts parity.

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

export const J_MODULE_MAP = {
  j3Openings: ["H-06"],
  j4Loadbearing: ["H-08", "H-09"],
  j5Pre2004: ["H-10"],
  j6Silica: ["T-01", "H-14"],
  j7Road: ["H-12"],
  j8Excavation: ["H-13"],
};

export const J_MAP_CODES = [...new Set(Object.values(J_MODULE_MAP).flat())];

export function deriveScopeModules(jScope = {}) {
  const out = [];
  for (const [k, codes] of Object.entries(J_MODULE_MAP)) if (jScope[k] === "yes") out.push(...codes);
  return [...new Set(out)];
}

export function jScopeMissing(jScope = {}) {
  const miss = [];
  if (!Array.isArray(jScope.j1Stages) || jScope.j1Stages.length === 0) miss.push("j1Stages");
  for (const q of J_QUESTIONS) if (q.type === "yesno" && jScope[q.key] !== "yes" && jScope[q.key] !== "no") miss.push(q.key);
  return miss;
}
export function jScopeComplete(jScope = {}) { return jScopeMissing(jScope).length === 0; }
