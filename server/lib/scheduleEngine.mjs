// scheduleEngine.mjs — SC-1. The ONE canonical build schedule, derived from the Buildxact estimate's
// SCHED line items, with Blue Leaf's configurable buffer scheme applied. This is the spine the fee
// proposal (SC-2), the Won→Ops seed (SC-3) and the client portal (SC-4) all consume — so the number
// the client sees, the Ops draft program, and the portal all come from one source.
//
// Duration source of truth = the estimator's SCHED lines (Sam's decision), NOT a costed model.
// The buffers ("under-promise, over-deliver") are an INTERNAL policy — invisible to the client; the
// client only ever sees the final, rounded programme. Time-based (weeks/months from site start),
// never calendar dates, because no start date exists until Won.
import { parseSchedItems } from "./buildexactParser.mjs";

// Client-facing stages (the readable grouping the client sees). Each maps buildexact phase keys →
// one stage. Mirrors SCHEDULE_PHASES in feeProposalTransform; SC-2 will unify to this one source.
export const SCHEDULE_STAGES = [
  { key: "site",        label: "Site establishment",       keys: ["site_prep", "pre_construction"] },
  { key: "footings",    label: "Earthworks & footings",    keys: ["foundations", "substructure", "site_slab"] },
  { key: "frame",       label: "Frame",                    keys: ["frame"] },
  { key: "lockup",      label: "Roof & lock-up",           keys: ["lock_up", "masonry", "masonary", "roof", "roofing", "cladding"] },
  { key: "roughin",     label: "Services rough-in",        keys: ["rough_in"] },
  { key: "linings",     label: "Linings & waterproofing",  keys: ["insulation", "wall_lining", "linings", "waterproofing"] },
  { key: "fitout",      label: "Fit-out & joinery",        keys: ["fix_out", "fitout", "cabinetry", "joinery", "tiling"] },
  { key: "finishes",    label: "Finishes & handover",      keys: ["painting", "external", "completion", "landscaping", "floor_coverings", "handover"] },
];
const stageIndexForPhase = (phase) => {
  const k = String(phase || "").toLowerCase();
  const i = SCHEDULE_STAGES.findIndex((s) => s.keys.includes(k));
  return i === -1 ? SCHEDULE_STAGES.length - 1 : i; // unmatched → finishes (last)
};

// Buffer scheme (Sam's decision): per-stage contingency, whole-programme contingency, + a flat
// calendar allowance (weather / public holidays / Christmas shutdown). Configurable in settings.
export const SCHEDULE_BUFFER_DEFAULTS = {
  per_stage_pct: 0.15,   // added to each stage's raw SCHED duration
  programme_pct: 0.10,   // added to the whole programme total
  calendar_weeks: 3,     // flat weeks added for weather / holidays / shutdown
};
export const SCHEDULE_BUFFER_SETTINGS_KEY = "crm_schedule_buffers";

export async function loadScheduleBuffers(sb) {
  const out = { ...SCHEDULE_BUFFER_DEFAULTS };
  if (!sb) return out;
  try {
    const { data } = await sb.from("user_settings").select("value").eq("key", SCHEDULE_BUFFER_SETTINGS_KEY).maybeSingle();
    if (data?.value) {
      const saved = JSON.parse(data.value);
      for (const k of Object.keys(SCHEDULE_BUFFER_DEFAULTS)) {
        if (saved?.[k] != null && Number.isFinite(Number(saved[k]))) out[k] = Number(saved[k]);
      }
    }
  } catch { /* malformed → defaults */ }
  return out;
}

const ceilWeeks = (days) => Math.max(1, Math.ceil(days / 7));
const titleCase = (s) => String(s || "").replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());

/**
 * Build the canonical schedule from estimate categories + buffer settings.
 * Returns null when there are no SCHED lines (caller shows a "no timeline yet" state).
 * @returns {{ stages, totalWeeks, totalMonths, baseWeeks, buffers, hasContingency, taskCount } | null}
 */
export function buildCanonicalSchedule(categories, buffers = SCHEDULE_BUFFER_DEFAULTS) {
  const b = { ...SCHEDULE_BUFFER_DEFAULTS, ...(buffers || {}) };
  const items = parseSchedItems(categories || []).filter((it) => Number(it.duration_days) > 0);
  if (!items.length) return null;

  // 1) bucket SCHED items into client stages
  const buckets = SCHEDULE_STAGES.map(() => []);
  for (const it of items) buckets[stageIndexForPhase(it.phase)].push(it);

  // 2) per-stage: raw SCHED days → + per-stage buffer → whole weeks; lay out sequentially (conservative)
  const perStageMul = 1 + Math.max(0, b.per_stage_pct);
  let weekCursor = 0;      // 0-based week offset
  let baseDays = 0;        // sum of buffered stage days (drives the bars)
  const stages = [];
  for (let i = 0; i < SCHEDULE_STAGES.length; i++) {
    const tasks = buckets[i];
    if (!tasks.length) continue;
    const rawDays = tasks.reduce((s, t) => s + Number(t.duration_days || 0), 0);
    const bufDays = rawDays * perStageMul;
    const weeks = ceilWeeks(bufDays);
    stages.push({
      key: SCHEDULE_STAGES[i].key,
      label: SCHEDULE_STAGES[i].label,
      weeks,
      startWeek: weekCursor + 1,
      endWeek: weekCursor + weeks,
      taskNames: tasks.map((t) => titleCase(t.task_name)),
    });
    weekCursor += weeks;
    baseDays += weeks * 7;
  }
  if (!stages.length) return null;

  // 3) whole-programme buffer + calendar allowance → the client-facing total
  const baseWeeks = Math.ceil(baseDays / 7);
  const withProgramme = baseDays * (1 + Math.max(0, b.programme_pct));
  const totalWeeks = Math.max(baseWeeks, Math.ceil(withProgramme / 7) + Math.max(0, Math.round(b.calendar_weeks)));
  const totalMonths = Math.max(1, Math.round((totalWeeks / 4.345) * 2) / 2); // nearest half-month

  return {
    stages,
    baseWeeks,
    totalWeeks,
    totalMonths,
    hasContingency: totalWeeks > baseWeeks,   // the programme buffer + calendar sit beyond the bars
    buffers: b,
    taskCount: items.length,
  };
}
