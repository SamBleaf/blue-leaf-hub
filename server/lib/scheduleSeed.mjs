// scheduleSeed.mjs — SC-3 + CW-3. Turns the canonical estimate schedule into a DRAFT Operations
// program at Won (SC-3), and drops the SA mandatory building-notification stages onto it as pinned
// hold-points (CW-3). Both write schedule_tasks rows. At Won, Ops owns the schedule — this is a
// starting draft the team refines, dated from the operator-set target start (never fabricated).
const addDays = (isoDate, n) => {
  const x = new Date(String(isoDate) + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

// Canonical stage key → Ops phase slug (so the Gantt colours it via PHASE_COLOR_MAP).
const STAGE_PHASE_SLUG = {
  site: "site_prep", footings: "site_slab", frame: "frame", lockup: "lock_up",
  roughin: "rough_in", linings: "wall_lining", fitout: "fitout", finishes: "completion",
};

/**
 * SC-3 — draft Ops schedule_tasks rows from a canonical schedule (scheduleEngine) + a target start.
 * Sequential (matches the conservative estimate layout); Ops refines dates/overlaps after.
 */
export function buildDraftScheduleRows(projectId, startDate, schedule) {
  if (!projectId || !startDate || !schedule?.stages?.length) return [];
  return schedule.stages.map((s) => ({
    project_id: projectId,
    name: s.label,
    phase: STAGE_PHASE_SLUG[s.key] || "general",
    start_date: addDays(startDate, (s.startWeek - 1) * 7),
    end_date: addDays(startDate, s.endWeek * 7 - 1),
    duration_days: Math.max(1, s.weeks * 7),
    depends_on: [],
    status: "planned",
    task_type: "build",
    is_hold_point: false,
  }));
}

// CW-3 — SA mandatory building-notification stages (from the Building Consent / DNF). Curated
// statutory template (PlanSA has no API); each anchors to a construction stage as a hold-point.
export const BUILDING_NOTIFICATION_STAGES = [
  { key: "commencement", label: "Building notification — Commencement",         anchorPhase: "site_prep",   at: "start" },
  { key: "pre_slab",     label: "Building notification — Pre-slab / footings",  anchorPhase: "site_slab",   at: "start" },
  { key: "frame",        label: "Building notification — Frame complete",       anchorPhase: "frame",       at: "end" },
  { key: "wet_area",     label: "Building notification — Wet-area waterproofing", anchorPhase: "wall_lining", at: "end" },
  { key: "completion",   label: "Building notification — Final / completion",   anchorPhase: "completion",  at: "end" },
];

/**
 * CW-3 — hold-point rows for the mandatory building notifications, anchored to the project's existing
 * construction tasks. Zero-duration, pinned inspections. Late notification can jeopardise sign-off,
 * so each carries a description reminding the leading hand to notify before proceeding.
 */
export function buildNotificationRows(projectId, tasks) {
  if (!projectId || !Array.isArray(tasks) || !tasks.length) return [];
  const firstByPhase = {};
  for (const t of tasks) { if (!firstByPhase[t.phase]) firstByPhase[t.phase] = t; }
  const lastTask = tasks[tasks.length - 1];
  const rows = [];
  for (const n of BUILDING_NOTIFICATION_STAGES) {
    // Anchor to the matching stage; fall back to the last task for end-notifications, else the first.
    const anchor = firstByPhase[n.anchorPhase] || (n.at === "end" ? lastTask : tasks[0]);
    if (!anchor) continue;
    const date = (n.at === "end" ? anchor.end_date : anchor.start_date) || anchor.start_date || anchor.end_date;
    if (!date) continue;
    rows.push({
      project_id: projectId,
      name: n.label,
      phase: anchor.phase,
      start_date: date,
      end_date: date,
      duration_days: 0,
      depends_on: [],
      status: "planned",
      task_type: "inspection",
      is_hold_point: true,
      hold_point_description: "Mandatory building notification to the certifier/council — give notice before proceeding past this stage (late notice can jeopardise sign-off).",
    });
  }
  return rows;
}
