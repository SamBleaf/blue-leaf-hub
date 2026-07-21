// Multi-assign cutover — unit tests. Run: node scripts/tests/task-assignments.test.mjs
// Proves the dual-read/write behaviour is identical with task_assignments PRESENT and ABSENT.
import { visibleToWorker, firstAssigneeId, assigneesByTask, overlayAssignees } from "../../server/lib/taskAssignments.mjs";

let pass = 0, fail = 0;
function eq(a, e, name) { const A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) pass++; else { fail++; console.error(`  ✗ ${name}\n      expected ${E}\n      got      ${A}`); } }
function ok(c, name) { if (c) pass++; else { fail++; console.error(`  ✗ ${name}`); } }

// ── assigneesByTask grouping ──
const grouped = assigneesByTask([
  { task_id: "T", worker_id: "A", name: "Anna" },
  { task_id: "T", worker_id: "B", name: "Ben" },
  { task_id: "U", worker_id: "A", name: "Anna" },
]);
eq(grouped.get("T").map((x) => x.id), ["A", "B"], "grouping preserves order");
eq(grouped.get("U").length, 1, "second task grouped separately");

// ── TEST A — legacy assigned_to mirror stays valid on unassign ──
// Task T assignees [A,B,C], mirror = A. Remove A → [B,C].
eq(firstAssigneeId([{ id: "B", name: "Ben" }, { id: "C", name: "Cara" }]), "B", "A: mirror re-points to the new first (B), not stale on A");
eq(firstAssigneeId([]), null, "A: removing the last assignee → mirror null");
const afterRemoveA = overlayAssignees(
  [{ id: "T", assigned: { id: "A", name: "Anna" }, assigned_to: "A" }],
  new Map([["T", [{ id: "B", name: "Ben" }, { id: "C", name: "Cara" }]]]),
  { hasJoin: true },
)[0];
eq(afterRemoveA.assignees.map((a) => a.id), ["B", "C"], "A: GET returns assignees [B,C]");
eq([afterRemoveA.assigned.id, afterRemoveA.employees.id], ["B", "B"], "A: BOTH embed aliases resolve to B");
const afterRemoveLast = overlayAssignees([{ id: "T", assigned_to: "C" }], new Map([["T", []]]), { hasJoin: true })[0];
ok(afterRemoveLast.assigned === null && afterRemoveLast.employees === null, "A: last removed → assigned/employees null (renders Unassigned)");
ok(visibleToWorker(afterRemoveLast.assignees, "anyone"), "A: no assignees → reappears under the shared predicate");

// ── TEST B — no leak of tasks assigned to others (run PRESENT and ABSENT) ──
function buildList(hasJoin) {
  // T1 shared, T2 [M], T3 [X], T4 [M,X]. Pre-mig the legacy embed can only carry one assignee.
  const tasks = [
    { id: "T1" },
    { id: "T2", assigned: { id: "M", name: "Mia" }, assigned_to: "M" },
    { id: "T3", assigned: { id: "X", name: "Xi" }, assigned_to: "X" },
    { id: "T4", assigned: { id: "M", name: "Mia" }, assigned_to: "M" },
  ];
  const byTask = hasJoin
    ? new Map([
        ["T2", [{ id: "M", name: "Mia" }]],
        ["T3", [{ id: "X", name: "Xi" }]],
        ["T4", [{ id: "M", name: "Mia" }, { id: "X", name: "Xi" }]],
      ])
    : new Map();
  return overlayAssignees(tasks, byTask, { hasJoin });
}
for (const hasJoin of [true, false]) {
  const list = buildList(hasJoin);
  const visible = list.filter((t) => visibleToWorker(t.assignees, "M")).map((t) => t.id);
  eq(visible, ["T1", "T2", "T4"], `B: M sees shared+own+co-assigned, NOT T3 (${hasJoin ? "post" : "pre"}-mig)`);
  ok(!visible.includes("T3"), `B: T3 (assigned to X only) hidden from M (${hasJoin ? "post" : "pre"}-mig)`);
}

console.log(`task-assignments: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
