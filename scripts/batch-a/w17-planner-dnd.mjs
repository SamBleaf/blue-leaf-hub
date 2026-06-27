/**
 * W17-P4b — Planner drag-drop + colour redesign
 *
 * W17-REQ-PLAN-DnD-01 legend/colour/drag wiring (@dnd-kit, legend, swatch, fill handle)  [static]
 * W17-REQ-PLAN-DnD-02 assign (drag legend → cell) = POST create
 * W17-REQ-PLAN-DnD-03 move (drag chip → empty cell) = PUT employee/date, job preserved
 * W17-REQ-PLAN-DnD-04 swap (drag chip → occupied) = delete both + recreate swapped (no partial)
 * W17-REQ-PLAN-DnD-05 fill across days then deduct
 * W17-REQ-PLAN-DnD-06 remove = DELETE
 * W17-REQ-PLAN-DnD-07 job-colour route (graceful before mig 118; persists after)             [write]
 * W17-REQ-PLAN-DnD-08 advisory-only: allocation/colour routes only — no timesheet/approve/sync/Buildxact  [static]
 * W17-REQ-PLAN-DnD-09 duplicate employee/date still hard-blocked (409)
 * W17-REQ-PLAN-DnD-10 colour routes admin/supervisor only (employee 403)
 */
import crypto from "crypto";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { WRITE, API, SB_URL, SB_ANON, post, get, serviceClient } from "./_helpers.mjs";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";
import { ensureE2EUsers } from "../create-e2e-users.mjs";

const E2E_PASSWORD = "BlueLeaf-E2E-2026!";

function readRootFile(rel) { return readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", rel), "utf8"); }
function ymdLocal(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function addDaysYmd(s, n) { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return ymdLocal(d); }
async function tokenFor(email, password = E2E_PASSWORD) {
  const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) throw new Error(error?.message || `No session for ${email}`);
  return data.session.access_token;
}
async function put(path, body, token) {
  const headers = { "Content-Type": "application/json" }; if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method: "PUT", headers, body: JSON.stringify(body ?? {}) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function del(path, token) {
  const headers = {}; if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method: "DELETE", headers });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const allocOnDay = (list, day) => (list || []).find(a => a.allocationDate === day);

function checkStatic(run) {
  run.section("W17-P4b — static wiring");
  const t = readRootFile("src/pages/workforce/WorkforcePlannerTab.jsx");
  const colors = readRootFile("src/lib/plannerColors.js");

  if (t.includes("@dnd-kit/core") && t.includes("DndContext") && t.includes("useDraggable") && t.includes("useDroppable"))
    run.pass("W17-REQ-PLAN-DnD-01 @dnd-kit wired (DndContext + draggable/droppable)");
  else run.fail("W17-REQ-PLAN-DnD-01 dnd-kit", "DndContext/useDraggable/useDroppable missing");

  if (t.includes("LegendChip") && t.includes("onPickColor") && colors.includes("PLANNER_PALETTE") && t.includes("startFill"))
    run.pass("W17-REQ-PLAN-DnD-01 legend + colour swatch + fill handle present");
  else run.fail("W17-REQ-PLAN-DnD-01 ui parts", "legend/colour/fill wiring missing");

  if (colors.includes("resolveJobColor") && colors.includes("autoColorKey") && /PLANNER_PALETTE\s*=\s*\[/.test(colors))
    run.pass("W17-REQ-PLAN-DnD-01 plannerColors helper (palette + auto + resolve)");
  else run.fail("W17-REQ-PLAN-DnD-01 colours helper", "plannerColors helper incomplete");

  if (t.includes("Add jobs") && t.includes("toggleBoard") && t.includes("boardJobs"))
    run.pass("W17-REQ-PLAN-DnD-11 board curation present (Add jobs + on_board filter)");
  else run.fail("W17-REQ-PLAN-DnD-11 board curation", "Add jobs / toggleBoard / boardJobs missing");

  if (t.includes("startFillDown") && t.includes("fillDownCommit") && t.includes("onFillDownStart"))
    run.pass("W17-REQ-PLAN-DnD-12 duplicate-downwards wiring present (vertical fill handle)");
  else run.fail("W17-REQ-PLAN-DnD-12 duplicate-down", "startFillDown / fillDownCommit / onFillDownStart missing");

  // DnD-08 advisory boundary: no timesheet/approve/sync/Buildxact calls; every call stays in the
  // workforce/operations/carpentry domain; advisory banner present.
  const calls = [...t.matchAll(/authFetch\(\s*[`"']([^`"']+)[`"']/g)].map(m => m[1]);
  const forbidden = /\/timesheets|buildexact|\/sync\b|\/approve\b|mass-approve/i;
  const bad = calls.find(p => forbidden.test(p));
  const outOfDomain = calls.find(p => !/^\/api\/(workforce|operations|carpentry)\b/.test(p));
  if (t.includes("Planner is advisory only") && calls.length > 0 && !bad && !outOfDomain)
    run.pass("W17-REQ-PLAN-DnD-08 advisory-only — no timesheet/approve/sync/Buildxact; stays in workforce domain");
  else run.fail("W17-REQ-PLAN-DnD-08 advisory boundary", `banner missing / forbidden: ${bad || "-"} / out-of-domain: ${outOfDomain || "-"}`);

  // protected sync routes intact
  const routes = readRootFile("server/lib/workforceRoutes.mjs");
  const markers = ["export async function syncTimesheetToBuildexact", "async function approveSingleTimesheet",
    'app.post("/api/workforce/timesheets/:id/approve"', 'app.post("/api/workforce/timesheets/:id/sync"', 'app.post("/api/workforce/timesheets/sync-pending"'];
  if (markers.every(m => routes.includes(m))) run.pass("W17-REQ-PLAN-DnD-08 protected Buildxact sync routes intact");
  else run.fail("W17-REQ-PLAN-DnD-08 protected sync", "a protected marker is missing");
}

async function seed(svc, ts) {
  const address = buildTestJobAddress({ suite: "W17", workflowId: "DND", ts });
  const { data: job } = await svc.from("jobs").insert({ address, status: "tendering" }).select("id").single();
  const { data: project } = await svc.from("projects").insert({ job_id: job.id, address }).select("id").single();
  const { data: carp } = await svc.from("carpentry_jobs").insert({ reference: `CJB-W17DND-${ts}`, client_name: `BLH TEST W17 DND ${ts}`, address, project_type: "full_package", status: "active" }).select("id").single();
  const { data: emp } = await svc.from("employees").insert({ name: `BLH TEST W17 DND Worker ${ts}`, trade: "carpenter", hourly_rate: 50, is_active: true, worker_token: crypto.randomBytes(18).toString("base64url") }).select("id").single();
  const { data: emp2 } = await svc.from("employees").insert({ name: `BLH TEST W17 DND Worker2 ${ts}`, trade: "labourer", hourly_rate: 45, is_active: true, worker_token: crypto.randomBytes(18).toString("base64url") }).select("id").single();
  return { jobId: job.id, projectId: project.id, carpentryJobId: carp.id, employeeId: emp.id, employee2Id: emp2.id, d0: ymdLocal(), };
}
async function cleanup(svc, fx) {
  if (!svc || !fx) return;
  await svc.from("workforce_allocations").delete().eq("employee_id", fx.employeeId);
  if (fx.employee2Id) { await svc.from("workforce_allocations").delete().eq("employee_id", fx.employee2Id); await svc.from("employees").delete().eq("id", fx.employee2Id); }
  if (fx.projectId) await svc.from("workforce_planner_jobs").delete().eq("project_id", fx.projectId).then(() => {}, () => {});
  if (fx.carpentryJobId) await svc.from("workforce_planner_jobs").delete().eq("carpentry_job_id", fx.carpentryJobId).then(() => {}, () => {});
  await svc.from("employees").delete().eq("id", fx.employeeId);
  await svc.from("carpentry_jobs").delete().eq("id", fx.carpentryJobId);
  await svc.from("projects").delete().eq("id", fx.projectId);
  await svc.from("jobs").delete().eq("id", fx.jobId);
}

export async function runW17PlannerDnD(run) {
  checkStatic(run);
  if (!WRITE) {
    for (const id of ["02 assign", "03 move", "04 swap", "05 fill/deduct", "06 remove", "07 planner-jobs colour", "09 duplicate 409", "10 authz", "11 board membership", "12 duplicate down"])
      run.gap(`W17-REQ-PLAN-DnD-${id}`, "requires --write");
    return;
  }
  const svc = serviceClient();
  if (!svc) { run.fail("W17-DND setup", "service role required"); return; }
  let adminToken, employeeToken;
  try { const u = await ensureE2EUsers(); adminToken = await tokenFor(u.admin.email); employeeToken = await tokenFor(u.employee.email); }
  catch (e) { run.fail("W17-DND auth", e.message); return; }

  const ts = Date.now();
  let fx = null;
  try {
    fx = await seed(svc, ts);
    const list = async () => (await get(`/api/workforce/allocations?from=${addDaysYmd(fx.d0, -1)}&to=${addDaysYmd(fx.d0, 7)}&employeeId=${fx.employeeId}`, adminToken)).body?.allocations || [];

    run.section("W17-REQ-PLAN-DnD-02 assign (POST)");
    const a0 = await post("/api/workforce/allocations", { allocationDate: fx.d0, employeeId: fx.employeeId, projectId: fx.projectId }, adminToken);
    if (a0.status === 200 && a0.body?.allocation?.projectId === fx.projectId) run.pass("W17-REQ-PLAN-DnD-02 drag legend→cell creates allocation");
    else run.fail("W17-REQ-PLAN-DnD-02 assign", `got ${a0.status} ${JSON.stringify(a0.body)}`);
    let id0 = a0.body?.allocation?.id;

    run.section("W17-REQ-PLAN-DnD-03 move (PUT to empty)");
    const moved = await put(`/api/workforce/allocations/${id0}`, { allocationDate: addDaysYmd(fx.d0, 2), employeeId: fx.employeeId }, adminToken);
    const afterMove = await list();
    if (moved.status === 200 && allocOnDay(afterMove, addDaysYmd(fx.d0, 2)) && !allocOnDay(afterMove, fx.d0)) run.pass("W17-REQ-PLAN-DnD-03 move shifts to the empty day, job preserved");
    else run.fail("W17-REQ-PLAN-DnD-03 move", `status=${moved.status}`);
    id0 = allocOnDay(afterMove, addDaysYmd(fx.d0, 2))?.id || id0;

    run.section("W17-REQ-PLAN-DnD-09 duplicate employee/date → 409");
    const dup = await post("/api/workforce/allocations", { allocationDate: addDaysYmd(fx.d0, 2), employeeId: fx.employeeId, carpentryJobId: fx.carpentryJobId }, adminToken);
    if (dup.status === 409 && dup.body?.code === "DUPLICATE_ALLOCATION") run.pass("W17-REQ-PLAN-DnD-09 duplicate employee/date blocked (409)");
    else run.fail("W17-REQ-PLAN-DnD-09 duplicate", `expected 409; got ${dup.status}`);

    run.section("W17-REQ-PLAN-DnD-04 swap (delete both + recreate swapped)");
    // second allocation (carpentry) on d0; then swap the two cells' jobs
    const b0 = await post("/api/workforce/allocations", { allocationDate: fx.d0, employeeId: fx.employeeId, carpentryJobId: fx.carpentryJobId }, adminToken);
    const A = allocOnDay(await list(), addDaysYmd(fx.d0, 2)); // project @ d0+2
    const B = b0.body?.allocation;                            // carpentry @ d0
    await del(`/api/workforce/allocations/${A.id}`, adminToken);
    await del(`/api/workforce/allocations/${B.id}`, adminToken);
    await post("/api/workforce/allocations", { allocationDate: B.allocationDate, employeeId: fx.employeeId, projectId: fx.projectId }, adminToken);   // A's job → B's cell
    await post("/api/workforce/allocations", { allocationDate: A.allocationDate, employeeId: fx.employeeId, carpentryJobId: fx.carpentryJobId }, adminToken); // B's job → A's cell
    const sw = await list();
    if (allocOnDay(sw, fx.d0)?.projectId === fx.projectId && allocOnDay(sw, addDaysYmd(fx.d0, 2))?.carpentryJobId === fx.carpentryJobId)
      run.pass("W17-REQ-PLAN-DnD-04 swap exchanges the two cells' jobs (both survive)");
    else run.fail("W17-REQ-PLAN-DnD-04 swap", JSON.stringify(sw.map(a => [a.allocationDate, a.projectId ? "P" : "C"])));
    // reset to a single project allocation on d0 for fill test
    for (const a of sw) await del(`/api/workforce/allocations/${a.id}`, adminToken);
    const seedFill = await post("/api/workforce/allocations", { allocationDate: fx.d0, employeeId: fx.employeeId, projectId: fx.projectId }, adminToken);

    run.section("W17-REQ-PLAN-DnD-05 fill across days then deduct");
    // fill d0..d0+3 (create the 3 empty days)
    for (let i = 1; i <= 3; i++) await post("/api/workforce/allocations", { allocationDate: addDaysYmd(fx.d0, i), employeeId: fx.employeeId, projectId: fx.projectId }, adminToken);
    const filled = await list();
    const filledCount = [0, 1, 2, 3].filter(i => allocOnDay(filled, addDaysYmd(fx.d0, i))).length;
    // deduct back to d0..d0+1 (delete d0+2, d0+3)
    for (let i = 2; i <= 3; i++) { const c = allocOnDay(filled, addDaysYmd(fx.d0, i)); if (c) await del(`/api/workforce/allocations/${c.id}`, adminToken); }
    const deducted = await list();
    const deductCount = [0, 1, 2, 3].filter(i => allocOnDay(deducted, addDaysYmd(fx.d0, i))).length;
    if (filledCount === 4 && deductCount === 2) run.pass("W17-REQ-PLAN-DnD-05 fill creates the week run; deduct removes the retracted days");
    else run.fail("W17-REQ-PLAN-DnD-05 fill/deduct", `filled=${filledCount} deducted=${deductCount}`);

    run.section("W17-REQ-PLAN-DnD-06 remove (DELETE)");
    const toRemove = allocOnDay(deducted, fx.d0);
    const rem = await del(`/api/workforce/allocations/${toRemove.id}`, adminToken);
    const gone = !allocOnDay(await list(), fx.d0);
    if (rem.status === 200 && gone) run.pass("W17-REQ-PLAN-DnD-06 remove deletes the shift");
    else run.fail("W17-REQ-PLAN-DnD-06 remove", `status=${rem.status} gone=${gone}`);

    run.section("W17-REQ-PLAN-DnD-12 duplicate downwards (same job, multiple workers, one day)");
    const dDay = addDaysYmd(fx.d0, 5);
    const dd1 = await post("/api/workforce/allocations", { allocationDate: dDay, employeeId: fx.employeeId, projectId: fx.projectId }, adminToken);
    const dd2 = await post("/api/workforce/allocations", { allocationDate: dDay, employeeId: fx.employee2Id, projectId: fx.projectId }, adminToken);
    if (dd1.status === 200 && dd2.status === 200 && dd1.body?.allocation?.projectId === fx.projectId && dd2.body?.allocation?.projectId === fx.projectId)
      run.pass("W17-REQ-PLAN-DnD-12 same job duplicates down to another worker on the same day (no false 409)");
    else run.fail("W17-REQ-PLAN-DnD-12 duplicate down", `dd1=${dd1.status} dd2=${dd2.status} ${JSON.stringify(dd2.body)}`);
    if (dd2.body?.allocation?.id) await del(`/api/workforce/allocations/${dd2.body.allocation.id}`, adminToken); // deduct worker2
    if (dd1.body?.allocation?.id) await del(`/api/workforce/allocations/${dd1.body.allocation.id}`, adminToken);

    run.section("W17-REQ-PLAN-DnD-07 planner-jobs settings (colour)");
    const gc = await get("/api/workforce/planner-jobs", adminToken);
    if (gc.status === 200 && Array.isArray(gc.body?.jobs)) run.pass("W17-REQ-PLAN-DnD-07 GET planner-jobs returns a list (graceful if table absent)");
    else run.fail("W17-REQ-PLAN-DnD-07 GET", `status=${gc.status}`);
    const pc = await put("/api/workforce/planner-jobs", { projectId: fx.projectId, color: "teal" }, adminToken);
    if (pc.status === 200 && pc.body?.job?.color === "teal") run.pass("W17-REQ-PLAN-DnD-07 PUT colour persists (migration 118 applied)");
    else if (pc.status === 503 && pc.body?.code === "MIGRATION_PENDING") run.gap("W17-REQ-PLAN-DnD-07 PUT colour", "migration 118 not applied yet — degrades gracefully (503)");
    else run.fail("W17-REQ-PLAN-DnD-07 PUT colour", `unexpected ${pc.status} ${JSON.stringify(pc.body)}`);
    const xor = await put("/api/workforce/planner-jobs", { projectId: fx.projectId, carpentryJobId: fx.carpentryJobId, color: "blue" }, adminToken);
    if (xor.status === 400) run.pass("W17-REQ-PLAN-DnD-07 PUT enforces project XOR carpentry");
    else run.fail("W17-REQ-PLAN-DnD-07 XOR", `expected 400; got ${xor.status}`);

    run.section("W17-REQ-PLAN-DnD-11 board membership (on_board)");
    const pb = await put("/api/workforce/planner-jobs", { carpentryJobId: fx.carpentryJobId, onBoard: true }, adminToken);
    if (pb.status === 200 && pb.body?.job?.onBoard === true) {
      const back = await get("/api/workforce/planner-jobs", adminToken);
      const row = (back.body?.jobs || []).find(j => j.carpentryJobId === fx.carpentryJobId);
      if (row?.onBoard === true) run.pass("W17-REQ-PLAN-DnD-11 PUT onBoard persists + GET reflects it");
      else run.fail("W17-REQ-PLAN-DnD-11 onBoard", `not reflected: ${JSON.stringify(row)}`);
    } else if (pb.status === 503 && pb.body?.code === "MIGRATION_PENDING") {
      run.gap("W17-REQ-PLAN-DnD-11 board membership", "migration 118 not applied yet — degrades gracefully (503)");
    } else run.fail("W17-REQ-PLAN-DnD-11 onBoard PUT", `unexpected ${pb.status} ${JSON.stringify(pb.body)}`);
    const noField = await put("/api/workforce/planner-jobs", { projectId: fx.projectId }, adminToken);
    if (noField.status === 400) run.pass("W17-REQ-PLAN-DnD-11 PUT requires color or onBoard");
    else run.fail("W17-REQ-PLAN-DnD-11 empty PUT", `expected 400; got ${noField.status}`);

    run.section("W17-REQ-PLAN-DnD-10 planner-jobs admin/supervisor only");
    const denied = await put("/api/workforce/planner-jobs", { projectId: fx.projectId, color: "blue" }, employeeToken);
    if (denied.status === 403) run.pass("W17-REQ-PLAN-DnD-10 employee cannot change planner-jobs (403)");
    else run.fail("W17-REQ-PLAN-DnD-10 authz", `expected 403; got ${denied.status}`);
  } finally {
    await cleanup(svc, fx);
  }
}
