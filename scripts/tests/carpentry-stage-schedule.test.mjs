// Carpentry stage-schedule service — unit tests. Run: node scripts/tests/carpentry-stage-schedule.test.mjs
// Budget-driven: stages ARE the labour subsections; durations come from the cost model.
import {
  seedStageSchedule, stagesFromBudget, costModelStageDays, mergeActuals, resolveIncludedStages, subsectionsForStages,
} from "../../server/lib/carpentryStageScheduleService.mjs";

let pass = 0, fail = 0;
function eq(a, e, name) { const A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) pass++; else { fail++; console.error(`  ✗ ${name}\n      expected ${E}\n      got      ${A}`); } }
function ok(c, name) { if (c) pass++; else { fail++; console.error(`  ✗ ${name}`); } }

const cm = { teamChargeUpPerDay: 3937, teamBreakEvenPerDay: 3281, headcount: 7, hoursPerDay: 8, marginPct: 0.2 };
const SUBS = [
  { category_name: "First Fix Framing", cost_type: "labour", budget_ex_gst: 38819, workforce_task_category: "first_fix_framing" },
  { category_name: "Cladding and Soffit Lining", cost_type: "labour", budget_ex_gst: 30712, workforce_task_category: "cladding" },
  { category_name: "Second Fix", cost_type: "labour", budget_ex_gst: 10626, workforce_task_category: "second_fix" },
  { category_name: "Window supply", cost_type: "material", budget_ex_gst: 5000, workforce_task_category: null }, // excluded (material)
];

// ── costModelStageDays — crew-scaled value-based duration (mig 148: editable per-category crew) ──
eq(costModelStageDays(38819, cm, 5), 14, "framing $38,819 @ crew 5 → 14 wd (ceil 38819/3937 × 7/5)");
eq(costModelStageDays(30712, cm, 4), 14, "cladding $30,712 @ crew 4 → 14");
eq(costModelStageDays(10626, cm, 2), 10, "second fix $10,626 @ crew 2 → 10");
eq(costModelStageDays(30712, cm, 7), 8, "same $ with the WHOLE team (crew 7) → 8 = the budget's Days @ margin");
ok(costModelStageDays(30712, cm, 4) > costModelStageDays(30712, cm, 7), "fewer workers → longer duration (editable per category)");
eq(costModelStageDays(38819, null, 5), null, "no cost model → null (falls back to taxonomy)");
ok(costModelStageDays(60000, cm, 5) > costModelStageDays(38819, cm, 5), "more labour $ → longer stage (interconnected)");

// ── stagesFromBudget — stages ARE the labour subsections, ordered, material excluded ──
const bs = stagesFromBudget(SUBS, cm, {});
eq(bs.map((s) => s.stageKey), ["first_fix_framing", "cladding_and_soffit_lining", "second_fix"], "labour subsections → stages, material dropped, ordered");
eq(bs.map((s) => s.label), ["First Fix Framing", "Cladding and Soffit Lining", "Second Fix"], "labels = the budget subsection names");
eq(bs[0].durationDays, 14, "framing duration from its labour value @ default crew (5)");
eq(bs[0].crew, 5, "default crew for first_fix_framing");
eq(bs[0].labourSell, 38819, "labour value carried for audit");
ok(stagesFromBudget(SUBS, null, {}) === null, "no cost model → null");
ok(stagesFromBudget([], cm, {}) === null, "no labour subsections → null");

// ── seed / auto-layout (budget-driven), 2026-08-03 is a Monday ──
const rows = seedStageSchedule({ jobStartDate: "2026-08-03", budgetSubsections: SUBS, cm });
eq(rows.map((r) => r.stage_key), ["first_fix_framing", "cladding_and_soffit_lining", "second_fix"], "seed: subsection stages");
eq(rows[0].planned_start, "2026-08-03", "first stage starts at commencement (no lead)");
eq(rows[0].planned_end, "2026-08-20", "framing ends after its 14 working days (crew 5)");
eq(rows[0].labour_sell, 38819, "labour value stored on the row");
eq(rows[0].crew_size, 5, "default crew stored on the row (mig 148)");
eq(rows[1].planned_start, "2026-08-28", "cladding starts after framing + its lead gap (roof/windows/delivery)");
eq(rows[1].depends_on, [{ stageKey: "first_fix_framing", type: "FS", lagDays: 5 }], "cladding FS-depends on framing with the lead as lag");
eq(rows[2].depends_on[0].stageKey, "cladding_and_soffit_lining", "second fix depends on cladding");
ok(rows[0].planned_end < rows[1].planned_start, "no overlap");

// ── fallback: no budget / no cost model → generic taxonomy stages ──
const fb = seedStageSchedule({
  jobStartDate: "2026-08-03", budgetSubsections: [], cm: null,
  budgetLineItems: [{ canonical_key: "wall_framing" }, { canonical_key: "cladding_installation" }],
});
eq(fb.map((r) => r.stage_key), ["wall_framing", "cladding"], "fallback: taxonomy stages from line items");
eq(fb[0].label, "Wall framing", "fallback label from the taxonomy");
eq(fb[0].planned_start, "2026-08-03", "fallback still lays out from commencement");
ok(fb[0].labour_sell === null, "fallback has no labour value");

// ── locked existing row preserved ──
const locked = seedStageSchedule({
  jobStartDate: "2026-08-03", budgetSubsections: SUBS, cm,
  existing: [{ stage_key: "first_fix_framing", planned_start: "2026-07-01", planned_end: "2026-07-20", locked: true, depends_on: [], status: "in_progress" }],
});
eq(locked.find((r) => r.stage_key === "first_fix_framing").planned_start, "2026-07-01", "locked stage keeps its dates");

// ── stored per-category crew_size persists through reseed + drives a longer duration (mig 148) ──
const crewed = seedStageSchedule({
  jobStartDate: "2026-08-03", budgetSubsections: SUBS, cm,
  existing: [{ stage_key: "first_fix_framing", crew_size: 2, planned_start: null, planned_end: null, locked: false, depends_on: [], status: "planned" }],
});
const ff = crewed.find((r) => r.stage_key === "first_fix_framing");
eq(ff.crew_size, 2, "stored crew_size (2) wins over the task default (5)");
ok(ff.planned_end > "2026-08-20", "crew 2 → longer than the default-crew (5) end of Aug 20");

// ── mergeActuals matches by stage_key OR workforce_task_category ──
const merged = mergeActuals(rows, { stages: [
  { stage: "first_fix_framing", firstDate: "2026-08-04", lastDate: "2026-08-19" },
  { stage: "cladding", firstDate: "2026-08-29", lastDate: "2026-09-05" },   // matches cladding row via wfCat
] });
eq(merged[0].actual_start, "2026-08-04", "actuals match by stage_key");
eq(merged[1].actual_start, "2026-08-29", "actuals match by workforce_task_category when key differs");

// ── resolveIncludedStages still works (taxonomy helper) ──
eq(resolveIncludedStages([{ canonical_key: "wall_framing" }, { canonical_key: "doors" }]), ["wall_framing", "second_fix"], "resolveIncludedStages taxonomy");

// ── subsectionsForStages — derived, per-subsection durations (B2) ──
const SUB_BUDGETS = [
  { id: "b1", category_name: "First Fix Framing", cost_type: "labour", budget_ex_gst: 38819, workforce_task_category: "first_fix_framing" },
  { id: "bm", category_name: "Window supply", cost_type: "material", budget_ex_gst: 5000, workforce_task_category: null },
];
const SUB_LINES = [
  { carpentry_job_budget_id: "b1", description: "Wall framing", canonical_key: "wall_framing", task_category: "first_fix_framing", sell_ex_gst: 20000 },
  { carpentry_job_budget_id: "b1", description: "Roof framing", canonical_key: "roof_framing", task_category: "first_fix_framing", sell_ex_gst: 12000 },
  { carpentry_job_budget_id: "b1", description: "Window install A", canonical_key: "windows_doors", task_category: "first_fix_framing", sell_ex_gst: 4000 },
  { carpentry_job_budget_id: "b1", description: "Window install B", canonical_key: "windows_doors", task_category: "first_fix_framing", sell_ex_gst: 2819 },
  { carpentry_job_budget_id: "b1", description: "Misc", canonical_key: null, task_category: "first_fix_framing", sell_ex_gst: 500 },
  { carpentry_job_budget_id: "bm", description: "Window unit", canonical_key: "window_supply", task_category: null, sell_ex_gst: 5000 }, // material category → excluded
];
const subMap = subsectionsForStages(SUB_BUDGETS, SUB_LINES, cm, { first_fix_framing: 5 });
eq(Object.keys(subMap), ["first_fix_framing"], "only the labour stage gets subsections (material excluded)");
eq(subMap.first_fix_framing.map((s) => [s.label, s.sell, s.days]),
  [["Wall framing", 20000, 8], ["Roof framing", 12000, 5], ["Window install A", 6819, 3], ["Misc", 500, 1]],
  "subsections grouped by canonical_key, summed, crew-scaled cost-model days, sorted by sell desc; unmapped → its own bucket");
ok(subMap.first_fix_framing[2].canonicalKey === "windows_doors", "windows_doors group merges both window line items");
ok(subMap.first_fix_framing[3].canonicalKey === null, "unmapped line item keeps null canonicalKey");
eq(subsectionsForStages(SUB_BUDGETS, SUB_LINES, null, {}).first_fix_framing[0].days, null, "no cost model → days null (never NaN)");

console.log(`carpentry-stage-schedule: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
