// =============================================================================
// Carpentry stage-schedule service — budget-driven auto-layout.
//
// Sam's design (2026-07-18): the schedule must be DRIVEN by the earned-value data,
// not generic build-days. So:
//   • Stages ARE the budget LABOUR subsections (carpentry_job_budgets, cost_type
//     'labour') — "First Fix Framing", "Cladding and Soffit Lining", "Second Fix"…
//   • Each stage's DURATION = its labour value ÷ the team day-rate, scaled to the
//     stage's crew — the SAME cost-model math as the Pipeline break-even. More
//     labour $ in a subsection → longer stage. This is the interconnectedness.
//   • Stages link to the workforce timesheet task_category (the 8-key streams).
// When a job has no budget/cost-model yet, fall back to the generic stage taxonomy.
//
// Pure — returns rows; the route persists to carpentry_job_stage_schedule (mig 144).
// =============================================================================
import { STAGES, stageOrder, stageLabel, resolveStage, TASKCAT_TO_STAGE } from "./carpentryStages.mjs";
import { addWorkingDays } from "./workingCalendar.mjs";

const BASELINE_CREW = 3;
const CREW_DEFAULTS = { first_fix_framing: 5, cladding: 4, second_fix: 2, outdoor_works: 2, formwork_slab_prep: 3, site_labouring: 2, site_cleanup: 2, default: 3 };

// Lead / gap working-days BEFORE a stage starts (procurement + external-trade waits:
// frame fabrication before framing; cladding delivery + roof/windows between framing and
// cladding). Placeholders — Phase 3 refines these from timesheet-observed gaps.
const LEAD_GAP_DAYS = { first_fix_framing: 10, cladding: 5, second_fix: 2, default: 1 };

// Generic per-stage build days (working days at BASELINE_CREW) — the FALLBACK only,
// used when a job has no labour budget / no synced cost model to derive durations from.
const STAGE_RULES = {
  mobilisation: 1, floor_system: 3, wall_framing: 10, roof_framing: 3, steel_coord: 2,
  windows_doors: 2, wrap_membrane: 2, battens_cavity: 3, cladding: 8, eaves_trims: 3,
  first_fix: 4, second_fix: 6, decks_external: 4, defects_returns: 2, variations: 2,
};
const DEFAULT_FULL_PACKAGE_STAGES = [
  "mobilisation", "floor_system", "wall_framing", "roof_framing", "windows_doors",
  "wrap_membrane", "battens_cavity", "cladding", "eaves_trims", "second_fix", "defects_returns",
];

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "stage";
const crewFor = (wfCat, crewSizes) => (crewSizes?.[wfCat] || CREW_DEFAULTS[wfCat] || CREW_DEFAULTS.default);

// Duration (working days) for a labour value at target margin, scaled to the stage's crew:
// labourSell ÷ teamChargeUpPerDay = whole-team-days; × headcount/crew = crew working-days.
export function costModelStageDays(labourSell, cm, crew) {
  if (!cm || !(cm.teamChargeUpPerDay > 0) || !(labourSell > 0)) return null;
  const headcount = cm.headcount || 1;
  const c = crew > 0 ? crew : headcount;
  return Math.max(1, Math.ceil((labourSell / cm.teamChargeUpPerDay) * (headcount / c)));
}

// Build the ordered stage list FROM the budget labour subsections, with cost-model durations.
// Returns null when there's nothing to build from (→ caller falls back to the taxonomy).
export function stagesFromBudget(budgetSubsections = [], cm, crewSizes = {}) {
  const labour = budgetSubsections.filter((b) => (b.cost_type ?? b.costType) === "labour" && Number(b.budget_ex_gst ?? b.budgetExGst) > 0);
  if (!labour.length || !cm) return null;
  const rows = labour.map((b, i) => {
    const wfCat = b.workforce_task_category ?? b.workforceTaskCategory ?? null;
    const labourSell = Number(b.budget_ex_gst ?? b.budgetExGst);
    const order = (wfCat && TASKCAT_TO_STAGE[wfCat]) ? stageOrder(TASKCAT_TO_STAGE[wfCat]) : 500 + i;
    return {
      stageKey: slug(b.category_name ?? b.categoryName ?? `subsection_${i}`),
      label: b.category_name ?? b.categoryName ?? "Labour",
      wfCat, labourSell,
      durationDays: costModelStageDays(labourSell, cm, crewFor(wfCat, crewSizes)) || 2,
      order,
    };
  }).sort((a, b) => a.order - b.order || b.labourSell - a.labourSell);
  return rows;
}

// Derive each stage's budget SUBSECTIONS — the leaf line items (carpentry_budget_line_items)
// grouped by canonical_key within the stage's labour budget category — with a cost-model
// duration per subsection. DISPLAY-ONLY (a Generated fact — never persisted): the same formula
// as the parent stage, so a bigger subsection sell → longer subsection. Because each rounds up
// (Math.ceil) independently, subsection days can sum to MORE than the parent — surface as indicative.
// Returns { [stageKey]: [{ label, canonicalKey, sell, days }] } sorted by sell desc.
export function subsectionsForStages(budgetSubsections = [], budgetLineItems = [], cm, crewSizes = {}) {
  // labour budget category id → { stageKey, wfCat } (matches stagesFromBudget's stageKey = slug(category_name))
  const byBudgetId = new Map();
  for (const b of budgetSubsections) {
    if ((b.cost_type ?? b.costType) !== "labour") continue;
    const id = b.id ?? b.budgetId;
    if (id == null) continue;
    byBudgetId.set(id, { stageKey: slug(b.category_name ?? b.categoryName ?? ""), wfCat: b.workforce_task_category ?? b.workforceTaskCategory ?? null });
  }
  const groups = {}; // stageKey -> Map(canonicalKey|__other__ -> { label, canonicalKey, sell, taskCat })
  for (const li of budgetLineItems) {
    const budgetId = li.carpentry_job_budget_id ?? li.carpentryJobBudgetId ?? null;
    const meta = budgetId != null ? byBudgetId.get(budgetId) : null;
    if (!meta || !meta.stageKey) continue;
    const canon = li.canonical_key ?? li.canonicalKey ?? null;
    const key = canon || "__other__";
    const label = li.description ?? canon ?? "Other";
    const sell = Number(li.sell_ex_gst ?? li.sellExGst) || 0;
    const taskCat = li.task_category ?? li.taskCategory ?? meta.wfCat;
    const m = (groups[meta.stageKey] ||= new Map());
    if (!m.has(key)) m.set(key, { label, canonicalKey: canon, sell: 0, taskCat });
    m.get(key).sell += sell;
  }
  const out = {};
  for (const [stageKey, m] of Object.entries(groups)) {
    out[stageKey] = [...m.values()]
      .map((s) => ({ label: s.label, canonicalKey: s.canonicalKey, sell: Math.round(s.sell * 100) / 100, days: costModelStageDays(s.sell, cm, crewFor(s.taskCat, crewSizes)) }))
      .sort((a, b) => (b.sell || 0) - (a.sell || 0));
  }
  return out;
}

// Taxonomy fallback (no budget / no cost model): generic durations from STAGE_RULES.
function stagesFromTaxonomy(budgetLineItems, crewSizes) {
  const set = new Set();
  for (const li of budgetLineItems) {
    const s = resolveStage({ canonicalKey: li.canonical_key ?? li.canonicalKey, taskCategory: li.task_category ?? li.taskCategory });
    if (s) set.add(s);
  }
  const stageKeys = (set.size ? [...set] : [...DEFAULT_FULL_PACKAGE_STAGES]).sort((a, b) => stageOrder(a) - stageOrder(b));
  return stageKeys.map((k) => {
    const meta = STAGES.find((s) => s.key === k);
    const wfCat = Object.keys(TASKCAT_TO_STAGE).find((c) => TASKCAT_TO_STAGE[c] === k) || null;
    const base = STAGE_RULES[k] || 2;
    const crew = crewFor(wfCat, crewSizes);
    return { stageKey: k, label: meta?.label || stageLabel(k), wfCat, labourSell: null,
      durationDays: Math.max(1, Math.ceil(base * (BASELINE_CREW / Math.max(1, crew)))), order: stageOrder(k) };
  });
}

export function resolveIncludedStages(budgetLineItems = []) {
  return stagesFromTaxonomy(budgetLineItems, {}).map((s) => s.stageKey);
}

// Seed / auto-layout a job's stage schedule.
// opts: { jobStartDate, budgetSubsections, budgetLineItems, cm, crewSizes, nonWork, existing }
export function seedStageSchedule({
  jobStartDate, budgetSubsections = [], budgetLineItems = [], cm = null, crewSizes = {}, nonWork = {}, existing = [],
} = {}) {
  const stages = stagesFromBudget(budgetSubsections, cm, crewSizes) || stagesFromTaxonomy(budgetLineItems, crewSizes);
  const existingByKey = new Map(existing.map((r) => [r.stage_key, r]));
  const start0 = jobStartDate || null;

  const rows = [];
  let cursor = start0;
  let prevKey = null;
  for (const st of stages) {
    const ex = existingByKey.get(st.stageKey);
    if (ex && ex.locked && ex.planned_start && ex.planned_end) {
      rows.push(carryExisting(ex, prevKey, st));
      cursor = advance(ex.planned_end, nonWork);
      prevKey = st.stageKey;
      continue;
    }
    // Lead/gap before this stage (procurement + external trades). The first stage starts at
    // commencement; leads apply only between stages, then the crew-scaled duration.
    const lead = prevKey ? (LEAD_GAP_DAYS[st.wfCat] ?? LEAD_GAP_DAYS.default) : 0;
    const plannedStart = cursor ? addWorkingDays(cursor, lead, nonWork) : start0;
    const plannedEnd = plannedStart ? addWorkingDays(plannedStart, st.durationDays - 1, nonWork) : null;
    rows.push({
      stage_key: st.stageKey, label: st.label,
      workforce_task_category: st.wfCat, labour_sell: st.labourSell,
      planned_start: plannedStart, planned_end: plannedEnd,
      depends_on: prevKey ? [{ stageKey: prevKey, type: "FS", lagDays: lead }] : [],
      status: ex?.status || "planned", locked: ex?.locked || false,
      sort_order: st.order,
    });
    cursor = plannedEnd ? advance(plannedEnd, nonWork) : cursor;
    prevKey = st.stageKey;
  }
  return rows;
}

function carryExisting(ex, prevKey, st) {
  return {
    stage_key: ex.stage_key, label: ex.label ?? st.label,
    workforce_task_category: ex.workforce_task_category ?? st.wfCat, labour_sell: ex.labour_sell ?? st.labourSell,
    planned_start: ex.planned_start, planned_end: ex.planned_end,
    depends_on: Array.isArray(ex.depends_on) ? ex.depends_on : (prevKey ? [{ stageKey: prevKey, type: "FS", lagDays: 0 }] : []),
    status: ex.status || "planned", locked: ex.locked || false,
    sort_order: ex.sort_order ?? st.order,
  };
}
function advance(ymd, nonWork) { return ymd ? addWorkingDays(ymd, 1, nonWork) : ymd; }

// Attach timesheet-observed actuals. `agg` may be fine-grain (stageAggregation, keyed by
// taxonomy stage) or coarse (keyed by workforce category); we match on stage_key OR wfCat.
export function mergeActuals(rows = [], agg = null) {
  const byStage = new Map((agg?.stages || []).map((s) => [s.stage, s]));
  return rows.map((r) => {
    const a = byStage.get(r.stage_key) || byStage.get(r.workforce_task_category);
    return { ...r, actual_start: a?.firstDate || r.actual_start || null, actual_end: a?.lastDate || r.actual_end || null };
  });
}

export { STAGE_RULES, DEFAULT_FULL_PACKAGE_STAGES, crewFor };
