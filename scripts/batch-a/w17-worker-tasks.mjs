/**
 * W17-P3 — Worker tasks / job / category + preview baseline
 *
 * Static checks (always): server-side task_audience filter on /api/worker/tasks, the read-only
 * console preview route, the complete-gate, the widened category whitelist, and the WorkerTasks
 * category dropdown.
 * Write checks (--write): seed an active carpentry job + a worker-audience task + a supervisor/QC
 * task + a normal worker (with worker_token) + a leading hand, then assert via the admin preview
 * route that a normal worker sees only worker tasks, a leading hand also sees QC, the category filter
 * narrows, the preview is admin-only, and (via the worker token) a normal worker is blocked from
 * completing a QC task but can complete a worker task. All artifacts BLH TEST marked; removed in finally.
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { WRITE, API, get, serviceClient } from "./_helpers.mjs";
import { ensureE2EUsers } from "../create-e2e-users.mjs";

const E2E_PASSWORD = "BlueLeaf-E2E-2026!";
const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_ANON = process.env.VITE_SUPABASE_ANON_KEY;

async function getTokenForEmail(email, password = E2E_PASSWORD) {
  if (!SB_URL || !SB_ANON) throw new Error("Missing Supabase URL or anon key");
  const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) throw new Error(error?.message || `No session for ${email}`);
  return data.session.access_token;
}
function root() { return join(dirname(fileURLToPath(import.meta.url)), "..", ".."); }
function readRootFile(relPath) { return readFileSync(join(root(), relPath), "utf8"); }
async function workerGet(path, token) {
  const r = await fetch(`${API}${path}`, { headers: { "x-worker-token": token } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function workerPost(path, body, token) {
  const r = await fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json", "x-worker-token": token }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ── Static checks ───────────────────────────────────────────────────────────
function checkBackendStatic(run) {
  run.section("W17-P3 static — server task_audience filter + preview route + gate");
  const src = readRootFile("server/lib/workforceRoutes.mjs");
  if (src.includes('q = q.eq("task_audience", "worker")')) run.pass("W17-REQ-TASK-04 worker-tasks filters task_audience server-side");
  else run.fail("W17-REQ-TASK-04 audience filter", "task_audience filter missing on /api/worker/tasks");
  if (src.includes('"/api/workforce/employees/:id/task-preview"') && src.includes('requireRole("admin", "supervisor")')) run.pass("W17-REQ-PREVIEW console-authed task-preview route present");
  else run.fail("W17-REQ-PREVIEW route", "admin/supervisor task-preview route missing");
  if (src.includes('tk?.task_audience === "supervisor"')) run.pass("W17-REQ-TASK-06 complete-gate (QC tasks → leading hand only)");
  else run.fail("W17-REQ-TASK-06 complete-gate", "supervisor-task completion gate missing");
  if (src.includes("first_fix_framing") && src.includes("SITE_TASK_CATEGORIES")) run.pass("W17-REQ-TASK-03 category whitelist widened to labour streams");
  else run.fail("W17-REQ-TASK-03 category whitelist", "SITE_TASK_CATEGORIES not widened");
  if (src.includes('jobType === "project"') && src.includes('jobType === "carpentry"')) run.pass("W17-REQ-TASK-01/02 building + carpentry job branches present");
  else run.fail("W17-REQ-TASK-01/02 job branches", "project/carpentry branch missing");
}
function checkFrontendStatic(run) {
  run.section("W17-P3 static — WorkerTasks category dropdown");
  const wt = readRootFile("src/pages/worker/WorkerTasks.jsx");
  if (wt.includes("CATEGORY_OPTIONS") && wt.includes("setCategory")) run.pass("W17-REQ-TASK-03 category dropdown in WorkerTasks");
  else run.fail("W17-REQ-TASK-03 dropdown", "CATEGORY_OPTIONS / setCategory missing");
  if (wt.includes("&category=")) run.pass("W17-REQ-TASK-03 category sent to /api/worker/tasks");
  else run.fail("W17-REQ-TASK-03 category param", "category query param not wired");
  const team = readRootFile("src/pages/WorkforceTeam.jsx");
  if (team.includes("Preview as worker") && team.includes("/task-preview")) run.pass("W17-REQ-PREVIEW-03 Team tab exposes the Preview as worker panel");
  else run.fail("W17-REQ-PREVIEW-03 panel", "WorkforceTeam preview panel / task-preview fetch missing");
  // Read-only: banner present + the panel never references a mutating worker action.
  const mutates = /\/tasks\/[^"'`]*\/complete|\/worker\/timesheets|uploadWorkerPhoto/.test(team);
  if (team.includes("cannot submit hours or complete tasks") && !mutates) run.pass("W17-REQ-PREVIEW-02 preview UI is read-only (banner; no complete/log-hours/upload action)");
  else run.fail("W17-REQ-PREVIEW-02 read-only", `banner missing or a mutating action present (mutates=${mutates})`);
}
function checkRegressionStatic(run) {
  run.section("W17-REG static guards");
  const src = readRootFile("server/lib/workforceRoutes.mjs");
  if (src.includes('app.get("/api/worker/tasks"') && src.includes('app.post("/api/worker/tasks/:id/complete"')) run.pass("W17-REG worker tasks + complete routes intact");
  else run.fail("W17-REG worker routes", "a worker task route marker is missing");
  if (src.includes("export async function syncTimesheetToBuildexact") && src.includes("async function approveSingleTimesheet")) run.pass("W17-REG-05 Buildxact sync/approve protected paths intact");
  else run.fail("W17-REG-05 protected paths", "a protected marker is missing");
  if (existsSync(join(root(), "scripts/batch-a/run-w15-timesheet-auth.mjs"))) run.pass("W17-REG-03 W15 suite present");
  else run.fail("W17-REG-03 W15 suite", "missing");
  if (existsSync(join(root(), "scripts/batch-a/run-w16-allocation-baseline.mjs"))) run.pass("W17-REG-04 W16 suite present");
  else run.fail("W17-REG-04 W16 suite", "missing");
}

// ── Write check ─────────────────────────────────────────────────────────────
async function checkWorkerTasksApi(run, adminToken, employeeToken, svc) {
  run.section("W17-REQ-TASK / PREVIEW (write)");
  const stamp = Date.now();
  const made = { carpId: null, taskIds: [], empW: null, empL: null };
  try {
    const { data: cj, error: ce } = await svc.from("carpentry_jobs").insert({
      reference: `BLH-TEST-W17P3-${stamp}`, client_name: "BLH TEST", address: `__BLH TEST W17 P3 ${stamp} ST, ADELAIDE SA 5000`, status: "active",
    }).select("id").single();
    if (ce || !cj?.id) { run.fail("seed carpentry job", ce?.message || "no id"); return; }
    made.carpId = cj.id;

    const mkTask = async (title, category, task_audience) => {
      const { data, error } = await svc.from("site_tasks").insert({ carpentry_job_id: cj.id, title, category, task_audience, status: "open", priority: "normal" }).select("id").single();
      if (error || !data?.id) throw new Error(`task insert: ${error?.message}`);
      made.taskIds.push(data.id); return data.id;
    };
    const tWorker = await mkTask(`BLH TEST worker task ${stamp}`, "first_fix_framing", "worker");
    const tQc = await mkTask(`BLH TEST QC task ${stamp}`, "inspection", "supervisor");

    const wTok = `blhtest-w17p3-w-${stamp}`;
    const { data: ew } = await svc.from("employees").insert({ name: `BLH TEST W17 P3 WORKER ${stamp}`, trade: "carpenter", employment_type: "full_time", is_active: true, is_leading_hand: false, worker_token: wTok }).select("id").single();
    const { data: el } = await svc.from("employees").insert({ name: `BLH TEST W17 P3 LEAD ${stamp}`, trade: "carpenter", employment_type: "full_time", is_active: true, is_leading_hand: true }).select("id").single();
    made.empW = ew?.id; made.empL = el?.id;
    if (!ew?.id || !el?.id) { run.fail("seed employees", "insert failed"); return; }

    const base = `/api/workforce/employees`;
    // W17-REQ-TASK-04 — normal worker preview: worker task present, QC task hidden
    const pw = await get(`${base}/${ew.id}/task-preview?jobId=${cj.id}&jobType=carpentry`, adminToken);
    const wIds = (pw.body.tasks || []).map(t => t.id);
    if (pw.status === 200 && wIds.includes(tWorker) && !wIds.includes(tQc)) run.pass("W17-REQ-TASK-02/04 normal worker sees worker task, NOT QC (carpentry view)");
    else run.fail("W17-REQ-TASK-04 audience", `status=${pw.status} ids=${JSON.stringify(wIds)}`);

    // W17-REQ-TASK-05 — leading hand sees both
    const pl = await get(`${base}/${el.id}/task-preview?jobId=${cj.id}&jobType=carpentry`, adminToken);
    const lIds = (pl.body.tasks || []).map(t => t.id);
    if (pl.status === 200 && lIds.includes(tWorker) && lIds.includes(tQc)) run.pass("W17-REQ-TASK-05 leading hand also sees QC (supervisor) tasks");
    else run.fail("W17-REQ-TASK-05 leading hand", `ids=${JSON.stringify(lIds)}`);

    // W17-REQ-TASK-03 — category filter (widened whitelist accepted; narrows result)
    const pc = await get(`${base}/${ew.id}/task-preview?jobId=${cj.id}&jobType=carpentry&category=first_fix_framing`, adminToken);
    const cIds = (pc.body.tasks || []).map(t => t.id);
    if (pc.status === 200 && cIds.includes(tWorker) && !cIds.includes(tQc)) run.pass("W17-REQ-TASK-03 category filter (labour stream) narrows tasks");
    else run.fail("W17-REQ-TASK-03 category", `status=${pc.status} ids=${JSON.stringify(cIds)}`);

    // W17-REQ-PREVIEW-01 — impersonation returns the chosen employee
    if (pw.body.employee?.id === ew.id && pw.body.preview === true) run.pass("W17-REQ-PREVIEW-01 preview impersonates the selected employee (read-only)");
    else run.fail("W17-REQ-PREVIEW-01 impersonation", `employee=${pw.body.employee?.id}`);

    // W17-REQ-PREVIEW-02 — console-authed: a non-admin employee token is rejected
    const denied = await get(`${base}/${ew.id}/task-preview?jobId=${cj.id}&jobType=carpentry`, employeeToken);
    if (denied.status === 403) run.pass("W17-REQ-PREVIEW-AUTHZ preview is admin/supervisor only (employee 403)");
    else run.fail("W17-REQ-PREVIEW-AUTHZ preview authz", `expected 403 got ${denied.status}`);

    // W17-REQ-PREVIEW-03 — preview (no job) lists the worker's visible jobs for the panel picker
    const pj = await get(`${base}/${ew.id}/task-preview`, adminToken);
    const pjIds = (pj.body.jobs || []).map(j => j.id);
    if (pj.status === 200 && pj.body.needsJobSelection && pjIds.includes(cj.id)) run.pass("W17-REQ-PREVIEW-JOBS preview lists the worker's visible jobs");
    else run.fail("W17-REQ-PREVIEW-JOBS preview jobs", `status=${pj.status} jobs=${JSON.stringify(pjIds)}`);

    // W17-REQ-TASK-06 — worker (token) blocked from completing a QC task; allowed on a worker task
    const cQc = await workerPost(`/api/worker/tasks/${tQc}/complete`, {}, wTok);
    if (cQc.status === 403) run.pass("W17-REQ-TASK-06 normal worker cannot complete a QC task (403)");
    else run.fail("W17-REQ-TASK-06 QC complete gate", `expected 403 got ${cQc.status}`);
    const cOk = await workerPost(`/api/worker/tasks/${tWorker}/complete`, {}, wTok);
    if (cOk.status === 200 && cOk.body.ok) run.pass("W17-REQ-TASK-06 normal worker can complete a worker task");
    else run.fail("W17-REQ-TASK-06 worker complete", `status=${cOk.status} ${cOk.body.error || ""}`);
  } finally {
    if (made.taskIds.length) await svc.from("site_tasks").delete().in("id", made.taskIds);
    if (made.carpId) await svc.from("site_tasks").delete().eq("carpentry_job_id", made.carpId);
    if (made.carpId) await svc.from("carpentry_jobs").delete().eq("id", made.carpId);
    if (made.empW) await svc.from("employees").delete().eq("id", made.empW);
    if (made.empL) await svc.from("employees").delete().eq("id", made.empL);
  }
}

export async function runW17WorkerTasks(run) {
  run.section("W17-P3 — Worker tasks/job/category + preview baseline");
  checkBackendStatic(run);
  checkFrontendStatic(run);
  checkRegressionStatic(run);

  if (!WRITE) {
    run.gap("W17-REQ-TASK / PREVIEW (write)", "requires --write");
    return;
  }
  const users = await ensureE2EUsers();
  const adminToken = await getTokenForEmail(users.admin.email);
  const employeeToken = await getTokenForEmail(users.employee.email);
  const svc = serviceClient();
  await checkWorkerTasksApi(run, adminToken, employeeToken, svc);
}
