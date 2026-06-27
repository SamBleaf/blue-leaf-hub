/**
 * W17-P7 — leading-hand QC checklist
 *
 * W17-REQ-QC-01 apply-qc-template creates supervisor-audience inspection tasks
 * W17-REQ-QC-02 idempotent re-apply (created 0)
 * W17-REQ-QC-03 admin/supervisor only (employee 403)
 * W17-REQ-QC-04 applied tasks are task_audience=supervisor + category=inspection (QC-gated)
 * W17-REQ-QC-05 static wiring (Operations apply + worker QC badge) + protected sync intact
 *               (leading-hand visibility + completion gate are covered by w17-worker-tasks / P3)
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { WRITE, SB_URL, SB_ANON, post, serviceClient } from "./_helpers.mjs";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";
import { ensureE2EUsers } from "../create-e2e-users.mjs";

const E2E_PASSWORD = "BlueLeaf-E2E-2026!";
function readRootFile(rel) { return readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", rel), "utf8"); }
async function tokenFor(email, password = E2E_PASSWORD) {
  const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) throw new Error(error?.message || `No session ${email}`);
  return data.session.access_token;
}

function checkStatic(run) {
  run.section("W17-P7 — static wiring");
  const routes = readRootFile("server/lib/workforceRoutes.mjs");
  if (routes.includes('app.post("/api/projects/:id/site-tasks/apply-qc-template"') && routes.includes("QC_TEMPLATE"))
    run.pass("W17-REQ-QC-05 apply-qc-template route present");
  else run.fail("W17-REQ-QC-05 route", "apply-qc-template / QC_TEMPLATE missing");
  const ops = readRootFile("src/pages/OperationsProjectDetail.jsx");
  if (ops.includes("applyQcTemplate") && ops.includes("QC checklist") && ops.includes('task_audience === "supervisor"'))
    run.pass("W17-REQ-QC-05 Operations QC apply + incomplete-QC warning wired");
  else run.fail("W17-REQ-QC-05 Operations UI", "QC apply / warning wiring missing");
  const wt = readRootFile("src/pages/worker/WorkerTasks.jsx");
  if (wt.includes('task_audience === "supervisor"') && wt.includes(">QC<"))
    run.pass("W17-REQ-QC-05 worker view shows a QC badge on supervisor tasks");
  else run.fail("W17-REQ-QC-05 worker badge", "worker QC badge missing");
  const markers = ["export async function syncTimesheetToBuildexact", 'app.post("/api/workforce/timesheets/:id/approve"', 'app.post("/api/workforce/timesheets/:id/sync"'];
  if (markers.every(m => routes.includes(m))) run.pass("W17-REQ-QC-05 protected Buildxact sync routes intact");
  else run.fail("W17-REQ-QC-05 protected sync", "a protected marker is missing");
}

async function seed(svc, ts) {
  const address = buildTestJobAddress({ suite: "W17", workflowId: "QC", ts });
  const { data: job } = await svc.from("jobs").insert({ address, status: "tendering" }).select("id").single();
  const { data: project } = await svc.from("projects").insert({ job_id: job.id, address }).select("id").single();
  return { jobId: job.id, projectId: project.id };
}
async function cleanup(svc, fx) {
  if (!svc || !fx) return;
  await svc.from("site_tasks").delete().eq("project_id", fx.projectId);
  await svc.from("projects").delete().eq("id", fx.projectId);
  await svc.from("jobs").delete().eq("id", fx.jobId);
}

export async function runW17Qc(run) {
  checkStatic(run);
  if (!WRITE) {
    for (const id of ["01 apply", "02 idempotent", "03 authz", "04 audience"]) run.gap(`W17-REQ-QC-${id}`, "requires --write");
    return;
  }
  const svc = serviceClient(); if (!svc) { run.fail("W17-QC setup", "service role required"); return; }
  let adminToken, employeeToken;
  try { const u = await ensureE2EUsers(); adminToken = await tokenFor(u.admin.email); employeeToken = await tokenFor(u.employee.email); }
  catch (e) { run.fail("W17-QC auth", e.message); return; }

  const ts = Date.now(); let fx = null;
  try {
    fx = await seed(svc, ts);

    run.section("W17-REQ-QC-01 apply QC template");
    const a1 = await post(`/api/projects/${fx.projectId}/site-tasks/apply-qc-template`, {}, adminToken);
    if (a1.status === 200 && a1.body?.created >= 1) run.pass(`W17-REQ-QC-01 apply created ${a1.body.created} QC task(s)`);
    else run.fail("W17-REQ-QC-01 apply", `status=${a1.status} ${JSON.stringify(a1.body)}`);

    run.section("W17-REQ-QC-04 applied tasks are supervisor-audience inspection");
    const { data: qcRows } = await svc.from("site_tasks").select("task_audience, category").eq("project_id", fx.projectId);
    const allQc = (qcRows || []).length > 0 && (qcRows || []).every(t => t.task_audience === "supervisor" && t.category === "inspection");
    if (allQc) run.pass(`W17-REQ-QC-04 all ${qcRows.length} applied tasks are task_audience=supervisor, category=inspection (leading-hand only)`);
    else run.fail("W17-REQ-QC-04 audience", JSON.stringify(qcRows));

    run.section("W17-REQ-QC-02 idempotent re-apply");
    const a2 = await post(`/api/projects/${fx.projectId}/site-tasks/apply-qc-template`, {}, adminToken);
    if (a2.status === 200 && a2.body?.created === 0 && a2.body?.skipped >= 1) run.pass("W17-REQ-QC-02 re-apply creates nothing (idempotent by title)");
    else run.fail("W17-REQ-QC-02 idempotent", `created=${a2.body?.created} skipped=${a2.body?.skipped}`);

    run.section("W17-REQ-QC-03 admin/supervisor only");
    const denied = await post(`/api/projects/${fx.projectId}/site-tasks/apply-qc-template`, {}, employeeToken);
    if (denied.status === 403) run.pass("W17-REQ-QC-03 employee cannot apply the QC template (403)");
    else run.fail("W17-REQ-QC-03 authz", `expected 403; got ${denied.status}`);
  } finally {
    await cleanup(svc, fx);
  }
}
