// =============================================================================
// taskAssignments — pure helpers for the multi-assign cutover (task_assignments, mig 153).
// Kept pure + unit-testable so the dual-read/write behaviour is provable BOTH pre- and
// post-migration (scripts/tests/task-assignments.test.mjs). The routes compose these.
// =============================================================================

// The translated visibility predicate: a worker sees a task iff it's SHARED (no assignees)
// OR they are one of its assignees. Replaces the old `assigned_to IS NULL OR = me`.
export function visibleToWorker(assignees = [], workerId) {
  if (!assignees || assignees.length === 0) return true;
  return assignees.some((a) => (a?.id ?? a) === workerId);
}

// The legacy assigned_to mirror = the FIRST current assignee (or null when none). Used so the
// two embed aliases (`assigned:` / `employees!assigned_to`) always resolve to a valid current
// assignee — after an unassign the mirror re-points to the new first, never left stale.
export function firstAssigneeId(assignees = []) {
  const first = (assignees || [])[0];
  return first ? (first?.id ?? first) : null;
}

// Group task_assignments rows (joined to employees for the name) → Map(taskId → [{id,name}]),
// preserving the ordering of the input (query orders by `position` — row 0 = the assigned_to mirror).
export function assigneesByTask(rows = []) {
  const m = new Map();
  for (const r of rows) {
    const taskId = r.task_id ?? r.taskId;
    const worker = {
      id: r.worker_id ?? r.workerId,
      name: r.name ?? r.worker_name ?? r.employees?.name ?? null,
    };
    if (!worker.id) continue;
    if (!m.has(taskId)) m.set(taskId, []);
    m.get(taskId).push(worker);
  }
  return m;
}

// Overlay assignees onto task rows for the API response. When task_assignments is present the
// join map wins; pre-migration (map empty AND !hasJoin) it falls back to the single embedded
// assignee. Sets `assignees:[{id,name}]` AND keeps back-compat `assigned`/`employees` = first.
export function overlayAssignees(tasks = [], byTask = new Map(), { hasJoin = true } = {}) {
  return (tasks || []).map((t) => {
    let assignees = byTask.get(t.id);
    if (!assignees) {
      // No join rows for this task. Post-migration → genuinely unassigned ([]). Pre-migration
      // (hasJoin false) → derive from the single legacy assignee (either embed alias).
      if (!hasJoin) {
        const single = t.assigned?.id
          ? { id: t.assigned.id, name: t.assigned.name || null }
          : (t.assigned_to ? { id: t.assigned_to, name: t.employees?.name || null } : null);
        assignees = single ? [single] : [];
      } else {
        assignees = [];
      }
    }
    const first = assignees[0] || null;
    return { ...t, assignees, assigned: first, employees: first };
  });
}

// ── Impure DB helpers (used by the routes) ──────────────────────────────────
const _missingJoin = (e) => /task_assignments.*does not exist|relation .*task_assignments.* does not exist|could not find the table|schema cache/i.test(String(e?.message || e || ""));

// Dual-READ: overlay assignees onto task rows (already carrying the legacy embed) from
// task_assignments when present, else the single assigned_to. Fail-soft pre-mig-153.
export async function attachAssigneesFromDb(sb, tasks) {
  const list = tasks || [];
  if (!list.length) return list;
  const ids = list.map((t) => t.id).filter(Boolean);
  try {
    const { data, error } = await sb.from("task_assignments")
      .select("task_id, worker_id, position, assigned_at").in("task_id", ids)
      .order("position", { ascending: true }).order("assigned_at", { ascending: true });
    if (error) throw error;
    const workerIds = [...new Set((data || []).map((r) => r.worker_id))];
    const { data: emps } = workerIds.length ? await sb.from("employees").select("id, name").in("id", workerIds) : { data: [] };
    const nameById = new Map((emps || []).map((e) => [e.id, e.name]));
    const byTask = assigneesByTask((data || []).map((r) => ({ task_id: r.task_id, worker_id: r.worker_id, name: nameById.get(r.worker_id) || null })));
    return overlayAssignees(list, byTask, { hasJoin: true });
  } catch (e) {
    if (_missingJoin(e)) return overlayAssignees(list, new Map(), { hasJoin: false });   // pre-mig fallback
    throw e;
  }
}

// Assignees for ONE task (for guards). Returns [{id,name?}]; pre-mig falls back to assigned_to.
export async function assigneesForTask(sb, taskId) {
  try {
    const { data, error } = await sb.from("task_assignments").select("worker_id, position, assigned_at").eq("task_id", taskId)
      .order("position", { ascending: true }).order("assigned_at", { ascending: true });
    if (error) throw error;
    return (data || []).map((r) => ({ id: r.worker_id }));
  } catch (e) {
    if (_missingJoin(e)) {
      const { data } = await sb.from("site_tasks").select("assigned_to").eq("id", taskId).maybeSingle();
      return data?.assigned_to ? [{ id: data.assigned_to }] : [];
    }
    throw e;
  }
}

// Dual-WRITE: SET a task's assignees to workerIds (order = the passed order). Re-mirrors the
// FIRST assignee onto site_tasks.assigned_to (back-compat + rollback). Fail-soft pre-mig-153
// (mirrors the first requested id only). Returns the mirror id.
export async function setAssignees(sb, taskId, workerIds, assignedBy) {
  const ids = [...new Set((workerIds || []).filter(Boolean))];
  let mirror = ids[0] || null;
  try {
    await sb.from("task_assignments").delete().eq("task_id", taskId);
    if (ids.length) {
      // Stamp `position` from the array index so reads return insertion order and row 0 stays the mirror.
      const { error } = await sb.from("task_assignments").insert(ids.map((w, i) => ({ task_id: taskId, worker_id: w, position: i, assigned_by: assignedBy || null })));
      if (error) throw error;
    }
  } catch (e) {
    if (!_missingJoin(e)) throw e;   // pre-mig: no join table — just set the mirror below
  }
  await sb.from("site_tasks").update({ assigned_to: mirror }).eq("id", taskId);
  return mirror;
}

