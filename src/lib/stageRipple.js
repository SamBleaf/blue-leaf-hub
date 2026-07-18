// =============================================================================
// stageRipple.js — reuse the Operations scheduler's dependency-ripple engine
// (scheduleUtils.previewRipple) for carpentry stage blocks. Moving a stage on the
// calendar pushes its dependents forward (FS/SS/FF + lag), preserving each stage's
// duration. Pure — returns the set of rows to PATCH; the tab persists + reconciles.
// =============================================================================
import { previewRipple, daysBetween } from "./scheduleUtils.js";

const durationDays = (start, end) => Math.max(1, daysBetween(start, end || start) + 1);

// Convert a job's pipeline stages → previewRipple tasks (deps keyed by rowId), run the
// ripple for the moved stage, and return only the CHANGED rows:
//   [{ rowId, plannedStart, plannedEnd }]  (the moved stage + any pushed dependents)
// stages: the job's `stages` array from the pipeline endpoint (rowId, stage, label,
//         plannedStart, plannedEnd, dependsOn:[{stageKey,type,lagDays}]).
// newEnd is optional — pass it for an explicit resize/edit; omit for a plain move
// (duration is preserved automatically).
export function rippleStages(stages, movedRowId, newStart, newEnd = null) {
  const withRow = (stages || []).filter((s) => s.rowId && s.plannedStart);
  if (!withRow.some((s) => s.rowId === movedRowId)) return [];
  const keyToRow = new Map(withRow.map((s) => [s.stage, s.rowId]));
  const origByRow = new Map(withRow.map((s) => [s.rowId, { start: s.plannedStart, end: s.plannedEnd || s.plannedStart }]));

  const tasks = withRow.map((s) => {
    const moved = s.rowId === movedRowId;
    // For a MOVE (no newEnd) pass ORIGINAL dates so previewRipple derives + preserves the
    // real duration; only an explicit resize encodes new start+end (a changed duration).
    const resize = moved && newEnd;
    const start = resize ? newStart : s.plannedStart;
    const end = resize ? newEnd : (s.plannedEnd || s.plannedStart);
    return {
      id: s.rowId,
      name: s.label || s.stage,
      start_date: start,
      end_date: end,
      duration_days: durationDays(start, end),   // normalizeTask needs this explicitly
      task_dependencies: (s.dependsOn || [])
        .map((d) => ({ taskId: keyToRow.get(d.stageKey), type: d.type || "FS", lag: Number(d.lagDays) || 0 }))
        .filter((d) => d.taskId),
    };
  });

  const { updatedTasks } = previewRipple(tasks, movedRowId, newStart);
  return updatedTasks
    .filter((t) => {
      const o = origByRow.get(t.id);
      return o && (o.start !== t.start_date || o.end !== t.end_date);
    })
    .map((t) => ({ rowId: t.id, plannedStart: t.start_date, plannedEnd: t.end_date }));
}
