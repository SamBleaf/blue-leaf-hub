// =============================================================================
// Carpentry stage-schedule service (Phase 1 — interactive calendar foundation)
// Pure: seed / auto-layout a job's per-stage planned dates + default dependencies,
// backfilling from any existing milestone dates, and merge timesheet actuals.
// Keyed to the 15-stage taxonomy in carpentryStages.mjs. The route persists the
// rows to `carpentry_job_stage_schedule` (migration 144). Drag + ripple is Phase 2
// (reuses scheduleUtils.previewRipple over the same depends_on shape).
// =============================================================================
import { STAGES, stageOrder, resolveStage } from "./carpentryStages.mjs";
import { addWorkingDays } from "./workingCalendar.mjs";

const BASELINE_CREW = 3;
const CREW_DEFAULTS = { first_fix_framing: 5, cladding: 4, second_fix: 2, outdoor_works: 2, default: 3 };

// Per-stage build duration (working days at BASELINE_CREW) + which crew stream scales it.
// Derived from carpentryScheduleUtils PHASE_RULES, expanded to the full stage taxonomy.
const STAGE_RULES = {
  mobilisation:    { buildDays: 1,  crew: "first_fix_framing" },
  floor_system:    { buildDays: 3,  crew: "first_fix_framing" },
  wall_framing:    { buildDays: 10, crew: "first_fix_framing" },
  roof_framing:    { buildDays: 3,  crew: "first_fix_framing" },
  steel_coord:     { buildDays: 2,  crew: "first_fix_framing" },
  windows_doors:   { buildDays: 2,  crew: "first_fix_framing" },
  wrap_membrane:   { buildDays: 2,  crew: "cladding" },
  battens_cavity:  { buildDays: 3,  crew: "cladding" },
  cladding:        { buildDays: 8,  crew: "cladding" },
  eaves_trims:     { buildDays: 3,  crew: "cladding" },
  first_fix:       { buildDays: 4,  crew: "second_fix" },
  second_fix:      { buildDays: 6,  crew: "second_fix" },
  decks_external:  { buildDays: 4,  crew: "outdoor_works" },
  defects_returns: { buildDays: 2,  crew: "second_fix" },
  variations:      { buildDays: 2,  crew: "default" },
};
const DEFAULT_RULE = { buildDays: 2, crew: "default" };

// Fallback stage set for a job with no budget line items yet (typical full package).
const DEFAULT_FULL_PACKAGE_STAGES = [
  "mobilisation", "floor_system", "wall_framing", "roof_framing", "windows_doors",
  "wrap_membrane", "battens_cavity", "cladding", "eaves_trims", "second_fix", "defects_returns",
];

// Existing milestone name → (stage_key, which end). Used to backfill planned dates from the
// milestone system we're retiring, so any dates a user already set carry across.
const MILESTONE_TO_STAGE = [
  { match: /site measure|prestart|site ready|frame start/i, stage: "wall_framing", end: "start" },
  { match: /frame complete/i,                               stage: "wall_framing", end: "end" },
  { match: /truss|roof/i,                                   stage: "roof_framing", end: "end" },
  { match: /window/i,                                       stage: "windows_doors", end: "end" },
  { match: /lock-?up|wrap/i,                                stage: "wrap_membrane", end: "end" },
  { match: /cladding start/i,                               stage: "cladding", end: "start" },
  { match: /cladding complete/i,                            stage: "cladding", end: "end" },
  { match: /fit-?off start|second fix start/i,              stage: "second_fix", end: "start" },
  { match: /fit-?off complete|second fix complete/i,        stage: "second_fix", end: "end" },
  { match: /defect/i,                                       stage: "defects_returns", end: "end" },
];

function crewFor(stream, crewSizes) {
  const merged = { ...CREW_DEFAULTS, ...(crewSizes || {}) };
  return merged[stream] || merged.default;
}
// Crew-scaled build duration in working days (more crew → fewer days), min 1.
function stageDurationDays(stageKey, crewSizes) {
  const rule = STAGE_RULES[stageKey] || DEFAULT_RULE;
  const crew = crewFor(rule.crew, crewSizes);
  return Math.max(1, Math.ceil(rule.buildDays * (BASELINE_CREW / Math.max(1, crew))));
}

// Which stages this job has: from its budget line items (canonical_key / task_category →
// stage), else the default full-package set. Ordered by stageOrder.
export function resolveIncludedStages(budgetLineItems = []) {
  const set = new Set();
  for (const li of budgetLineItems) {
    const s = resolveStage({ canonicalKey: li.canonical_key ?? li.canonicalKey, taskCategory: li.task_category ?? li.taskCategory });
    if (s) set.add(s);
  }
  const stages = set.size ? [...set] : [...DEFAULT_FULL_PACKAGE_STAGES];
  return stages.sort((a, b) => stageOrder(a) - stageOrder(b));
}

// Milestone backfill: { stage_key → { start?:ymd, end?:ymd } } from milestones with a target_date.
function milestoneDates(milestones = []) {
  const out = {};
  for (const m of milestones) {
    const date = m.target_date || m.targetDate;
    if (!date) continue;
    const hit = MILESTONE_TO_STAGE.find((r) => r.match.test(String(m.name || "")));
    if (!hit) continue;
    (out[hit.stage] ||= {})[hit.end] = date;
  }
  return out;
}

// Seed / auto-layout a job's stage schedule. Pure — returns the desired rows; the route
// upserts them (skipping locked rows). Existing planned dates + locks are preserved.
// opts: { jobStartDate, budgetLineItems, crewSizes, milestones, nonWork, existing }
export function seedStageSchedule({
  jobStartDate, budgetLineItems = [], crewSizes = {}, milestones = [], nonWork = {}, existing = [],
} = {}) {
  const stages = resolveIncludedStages(budgetLineItems);
  const mDates = milestoneDates(milestones);
  const existingByStage = new Map(existing.map((r) => [r.stage_key, r]));
  const start0 = jobStartDate || null;

  const rows = [];
  let cursor = start0;
  let prevStage = null;
  for (const stage of stages) {
    const ex = existingByStage.get(stage);
    // A locked or already-dated existing row is authoritative — keep it, advance the cursor past it.
    if (ex && ex.locked && ex.planned_start && ex.planned_end) {
      rows.push(carryExisting(ex, prevStage));
      cursor = advance(ex.planned_end, nonWork);
      prevStage = stage;
      continue;
    }
    const dur = stageDurationDays(stage, crewSizes);
    // Sequential base: this stage can't start before its dependencies finish (cursor).
    const seqStart = cursor || start0;
    const mStart = mDates[stage]?.start;
    const mEnd = mDates[stage]?.end;
    // A migrated milestone date may push a stage LATER (a real lead-time gap, e.g. frame
    // delivery) but never earlier than its dependencies — otherwise stages would overlap.
    let plannedStart = seqStart;
    if (mStart && (!seqStart || mStart > seqStart)) plannedStart = mStart;
    if (!plannedStart) plannedStart = ex?.planned_start || start0;
    let plannedEnd = (mEnd && plannedStart && mEnd >= plannedStart)
      ? mEnd
      : (plannedStart ? addWorkingDays(plannedStart, dur - 1, nonWork) : (ex?.planned_end || null));

    rows.push({
      stage_key: stage,
      planned_start: plannedStart,
      planned_end: plannedEnd,
      depends_on: prevStage ? [{ stageKey: prevStage, type: "FS", lagDays: 0 }] : [],
      status: ex?.status || "planned",
      locked: ex?.locked || false,
      sort_order: stageOrder(stage),
    });
    cursor = plannedEnd ? advance(plannedEnd, nonWork) : cursor;
    prevStage = stage;
  }
  return rows;
}

function carryExisting(ex, prevStage) {
  return {
    stage_key: ex.stage_key,
    planned_start: ex.planned_start,
    planned_end: ex.planned_end,
    depends_on: Array.isArray(ex.depends_on) ? ex.depends_on : (prevStage ? [{ stageKey: prevStage, type: "FS", lagDays: 0 }] : []),
    status: ex.status || "planned",
    locked: ex.locked || false,
    sort_order: ex.sort_order ?? stageOrder(ex.stage_key),
  };
}
// Next working day after a date (the day a following stage can start).
function advance(ymd, nonWork) { return ymd ? addWorkingDays(ymd, 1, nonWork) : ymd; }

// Attach timesheet-observed actuals (from stageAggregation output) to schedule rows.
export function mergeActuals(rows = [], agg = null) {
  const byStage = new Map((agg?.stages || []).map((s) => [s.stage, s]));
  return rows.map((r) => {
    const a = byStage.get(r.stage_key);
    return { ...r, actual_start: a?.firstDate || r.actual_start || null, actual_end: a?.lastDate || r.actual_end || null };
  });
}

export { STAGE_RULES, stageDurationDays, DEFAULT_FULL_PACKAGE_STAGES };
