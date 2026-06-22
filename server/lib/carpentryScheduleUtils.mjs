// carpentryScheduleUtils.mjs — D2: auto-lay-out carpentry milestone target dates from a commencement
// date + a frame-delivery date, using per-phase build durations scaled by crew size, plus standard
// procurement lead-times. This works WITHOUT the company cost model (migration 090); when that's
// synced, the labour burn-rate (budget ÷ team-charge-up/day) can refine the build-phase durations.
//
// Crew sizes (people per phase) scale duration: a phase with a base of `minDays` at `baselineCrew`
// takes minDays × baselineCrew / crew calendar-build-days. First fix framing is labour-heavy (more
// crew → fewer days); second fix is light.

/** Company default crew sizes per labour stream (Settings default; per-job override via crew_size_overrides). */
export const CREW_DEFAULTS = {
  first_fix_framing: 5,   // 4–7
  cladding: 4,            // 3–5
  second_fix: 2,          // 1–3
  outdoor_works: 2,
  default: 3,
};
const BASELINE_CREW = 3; // the crew the base durations below assume

// Each milestone gets a build duration (working days at BASELINE_CREW) and/or a procurement lead-time
// (calendar days that don't scale with crew). Matched by a substring of the milestone name.
const PHASE_RULES = [
  { match: /material ordered/i,          buildDays: 0,  leadDays: 0,  crew: null },
  { match: /frame delivery/i,            buildDays: 0,  leadDays: 35, crew: null },          // anchor 2 normally overrides
  { match: /cladding delivery/i,         buildDays: 0,  leadDays: 21, crew: null },
  { match: /site measure|prestart|site ready/i, buildDays: 3, leadDays: 0, crew: "first_fix_framing" },
  { match: /frame start/i,               buildDays: 1,  leadDays: 0,  crew: "first_fix_framing" },
  { match: /frame complete/i,            buildDays: 10, leadDays: 0,  crew: "first_fix_framing" },
  { match: /truss/i,                     buildDays: 3,  leadDays: 0,  crew: "first_fix_framing" },
  { match: /lock-?up|wrap/i,             buildDays: 5,  leadDays: 0,  crew: "cladding" },
  { match: /cladding start/i,            buildDays: 1,  leadDays: 0,  crew: "cladding" },
  { match: /cladding complete/i,         buildDays: 8,  leadDays: 0,  crew: "cladding" },
  { match: /fit-?off start/i,            buildDays: 1,  leadDays: 0,  crew: "second_fix" },
  { match: /fit-?off complete/i,         buildDays: 6,  leadDays: 0,  crew: "second_fix" },
  { match: /second fix/i,                buildDays: 6,  leadDays: 0,  crew: "second_fix" },
  { match: /defect/i,                    buildDays: 2,  leadDays: 0,  crew: "second_fix" },
  { match: /final inspection/i,          buildDays: 1,  leadDays: 3,  crew: null },          // certifier wait
  { match: /practical completion|^complete$|handover/i, buildDays: 0, leadDays: 0, crew: null },
];

function ruleFor(name) {
  return PHASE_RULES.find((r) => r.match.test(String(name || ""))) || { buildDays: 2, leadDays: 0, crew: "default" };
}

/** Add whole days to a YYYY-MM-DD date (UTC-safe, returns YYYY-MM-DD). */
export function addDaysYmd(ymd, days) {
  const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

/**
 * Compute target dates for a job's milestones.
 * @param {object} opts
 * @param {string} opts.commencementDate  YYYY-MM-DD (anchor 1)
 * @param {string} [opts.frameDeliveryDate] YYYY-MM-DD (anchor 2 — pins the frame-delivery milestone)
 * @param {Array<{id,name,sort_order}>} opts.milestones  ordered milestones
 * @param {object} [opts.crewSizes]  per-stream crew sizes (merged over CREW_DEFAULTS)
 * @returns {Array<{id,name,targetDate}>}
 */
export function autoLayoutMilestones({ commencementDate, frameDeliveryDate, milestones = [], crewSizes = {} }) {
  if (!commencementDate) return [];
  const crew = { ...CREW_DEFAULTS, ...(crewSizes || {}) };
  const ordered = [...milestones].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const out = [];
  let cursor = commencementDate; // running "date reached so far"
  for (const m of ordered) {
    const rule = ruleFor(m.name);
    let target;
    if (frameDeliveryDate && /frame delivery/i.test(m.name)) {
      target = frameDeliveryDate; // anchor 2 wins
    } else {
      const crewSize = rule.crew ? (crew[rule.crew] || crew.default) : 0;
      const scaledBuild = rule.crew && rule.buildDays
        ? Math.ceil(rule.buildDays * (BASELINE_CREW / Math.max(1, crewSize)))
        : rule.buildDays;
      const advance = Math.max(rule.leadDays, scaledBuild); // procurement wait OR build time, whichever is longer
      target = addDaysYmd(cursor, advance);
    }
    if (target && (!cursor || target > cursor)) cursor = target; // never go backwards
    else if (target) cursor = cursor; // keep cursor if target is earlier (e.g. pinned frame delivery in the past)
    out.push({ id: m.id, name: m.name, targetDate: target });
  }
  return out;
}
