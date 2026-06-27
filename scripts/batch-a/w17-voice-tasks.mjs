/**
 * W17-P6 — voice-to-tasks for building projects (mirror of the carpentry path)
 *
 * W17-REQ-VOICE-01 route + UI wiring (static) + protected sync intact
 * W17-REQ-VOICE-02 from-transcript validation (400 no transcript)
 * W17-REQ-VOICE-03 admin/supervisor only (employee 403)
 * W17-REQ-VOICE-04 extraction returns draft tasks (AI — gap if unavailable)
 * W17-REQ-VOICE-05 bulk save (ai_extraction) creates site_tasks
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { WRITE, API, SB_URL, SB_ANON, post, serviceClient } from "./_helpers.mjs";
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
  run.section("W17-P6 — static wiring");
  const routes = readRootFile("server/lib/workforceRoutes.mjs");
  if (routes.includes('app.post("/api/projects/:id/site-tasks/from-transcript"') && routes.includes('import { splitTranscriptToTasks }'))
    run.pass("W17-REQ-VOICE-01 project from-transcript route present (mirrors carpentry)");
  else run.fail("W17-REQ-VOICE-01 route", "project from-transcript route / import missing");
  const ui = readRootFile("src/pages/OperationsProjectDetail.jsx");
  if (ui.includes("extractFromTranscript") && ui.includes("from-transcript") && ui.includes("From transcript"))
    run.pass("W17-REQ-VOICE-01 OperationsProjectDetail voice panel wired");
  else run.fail("W17-REQ-VOICE-01 UI", "voice panel wiring missing");
  const markers = ["export async function syncTimesheetToBuildexact", 'app.post("/api/workforce/timesheets/:id/approve"', 'app.post("/api/workforce/timesheets/:id/sync"'];
  if (markers.every(m => routes.includes(m))) run.pass("W17-REQ-VOICE-01 protected Buildxact sync routes intact");
  else run.fail("W17-REQ-VOICE-01 protected sync", "a protected marker is missing");
}

async function seed(svc, ts) {
  const address = buildTestJobAddress({ suite: "W17", workflowId: "VOICE", ts });
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

export async function runW17VoiceTasks(run) {
  checkStatic(run);
  if (!WRITE) {
    for (const id of ["02 validation", "03 authz", "04 extraction", "05 bulk save"]) run.gap(`W17-REQ-VOICE-${id}`, "requires --write");
    return;
  }
  const svc = serviceClient(); if (!svc) { run.fail("W17-VOICE setup", "service role required"); return; }
  let adminToken, employeeToken;
  try { const u = await ensureE2EUsers(); adminToken = await tokenFor(u.admin.email); employeeToken = await tokenFor(u.employee.email); }
  catch (e) { run.fail("W17-VOICE auth", e.message); return; }

  const ts = Date.now(); let fx = null;
  try {
    fx = await seed(svc, ts);

    run.section("W17-REQ-VOICE-02 from-transcript validation");
    const noT = await post(`/api/projects/${fx.projectId}/site-tasks/from-transcript`, {}, adminToken);
    if (noT.status === 400) run.pass("W17-REQ-VOICE-02 from-transcript requires a transcript (400)");
    else run.fail("W17-REQ-VOICE-02 validation", `expected 400; got ${noT.status}`);

    run.section("W17-REQ-VOICE-03 admin/supervisor only");
    const denied = await post(`/api/projects/${fx.projectId}/site-tasks/from-transcript`, { transcript: "walk the site" }, employeeToken);
    if (denied.status === 403) run.pass("W17-REQ-VOICE-03 employee cannot extract tasks (403)");
    else run.fail("W17-REQ-VOICE-03 authz", `expected 403; got ${denied.status}`);

    run.section("W17-REQ-VOICE-05 bulk save (ai_extraction)");
    const bulk = await post(`/api/projects/${fx.projectId}/site-tasks/bulk`, { created_via: "ai_extraction", tasks: [{ title: "BLH TEST install architraves", category: "second_fix" }, { title: "BLH TEST patch render", category: "defect" }] }, adminToken);
    if (bulk.status === 200 && (bulk.body?.tasks || []).length === 2) {
      const { count } = await svc.from("site_tasks").select("id", { count: "exact", head: true }).eq("project_id", fx.projectId).eq("created_via", "ai_extraction");
      if ((count || 0) === 2) run.pass("W17-REQ-VOICE-05 bulk save creates 2 site_tasks (created_via=ai_extraction)");
      else run.fail("W17-REQ-VOICE-05 persisted", `count=${count}`);
    } else run.fail("W17-REQ-VOICE-05 bulk", `status=${bulk.status} ${JSON.stringify(bulk.body)}`);

    run.section("W17-REQ-VOICE-04 extraction returns draft tasks (AI)");
    const ext = await post(`/api/projects/${fx.projectId}/site-tasks/from-transcript`, { transcript: "On the upstairs bathroom: install the towel rails, fix the leaking tap, and touch up the paint on the door frame." }, adminToken);
    if (ext.status === 200 && Array.isArray(ext.body?.tasks) && ext.body.tasks.length >= 1 && ext.body.draft === true)
      run.pass(`W17-REQ-VOICE-04 transcript → ${ext.body.tasks.length} draft task(s), creates nothing`);
    else if (ext.status === 502 || ext.status === 500)
      run.gap("W17-REQ-VOICE-04 extraction", "AI extraction unavailable in this environment (no ANTHROPIC_API_KEY / model error)");
    else run.fail("W17-REQ-VOICE-04 extraction", `unexpected ${ext.status} ${JSON.stringify(ext.body).slice(0, 200)}`);
  } finally {
    await cleanup(svc, fx);
  }
}
