/**
 * W17-P1 — Workforce Team tab integration baseline
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { WRITE, get, post, serviceClient } from "./_helpers.mjs";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";
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

function readRootFile(relPath) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  return readFileSync(join(root, relPath), "utf8");
}

function checkStaticTeamTab(run) {
  run.section("W17-REQ-TEAM-01 / W17-REG-01–04 static tab checks");
  const workforce = readRootFile("src/pages/Workforce.jsx");
  const expected = ["Approvals", "Snapshot", "Mass Fill", "History", "Team"];
  const tabsMatch = workforce.match(/const TABS = \[([^\]]+)\]/);
  if (!tabsMatch) {
    run.fail("W17-REQ-TEAM-01 Team tab in Workforce.jsx", "TABS array not found");
    return;
  }
  const tabsStr = tabsMatch[1];
  for (const t of expected) {
    if (!tabsStr.includes(`"${t}"`)) {
      run.fail(`W17-REG tab ${t}`, `missing from TABS`);
      return;
    }
  }
  run.pass("W17-REQ-TEAM-01 Team appears in Workforce TABS");
  run.pass("W17-REG-01 Approvals tab preserved");
  run.pass("W17-REG-02 Snapshot tab preserved");
  run.pass("W17-REG-03 Mass Fill tab preserved");
  run.pass("W17-REG-04 History tab preserved");
  if (!workforce.includes("<WorkforceTeam embedded />")) {
    run.fail("W17-REQ-TEAM-01 Team tab render", "WorkforceTeam embedded not found");
  } else {
    run.pass("W17-REQ-TEAM-01 WorkforceTeam embedded in Team tab");
  }
}

function checkStaticRedirect(run) {
  run.section("W17-REQ-TEAM-02 /workforce/team route");
  const app = readRootFile("src/App.jsx");
  if (app.includes('Navigate to="/workforce?tab=Team"') && app.includes('path="/workforce/team"')) {
    run.pass("W17-REQ-TEAM-02 /workforce/team redirects to /workforce?tab=Team");
  } else {
    run.fail("W17-REQ-TEAM-02 /workforce/team redirect", "Navigate to /workforce?tab=Team not found");
  }
}

function checkProtectedSyncPath(run) {
  run.section("W17-REG-07 Buildxact sync static guard");
  const src = readRootFile("server/lib/workforceRoutes.mjs");
  const markers = [
    "export async function syncTimesheetToBuildexact",
    "async function approveSingleTimesheet",
    'app.post("/api/workforce/timesheets/:id/approve"',
    'app.post("/api/workforce/timesheets/:id/sync"',
    'app.post("/api/workforce/timesheets/sync-pending"',
  ];
  const missing = markers.filter(m => !src.includes(m));
  if (missing.length === 0) run.pass("W17-REG-07 protected Buildxact sync routes/functions present");
  else run.fail("W17-REG-07 protected sync path", `missing: ${missing.join(", ")}`);
}

function checkWorkerLinkRouteStatic(run) {
  run.section("W17-REQ-TEAM-04 worker-link route static");
  const src = readRootFile("server/lib/workforceRoutes.mjs");
  if (src.includes('app.post("/api/workforce/employees/:id/worker-link"') && src.includes('requireRole("admin")')) {
    run.pass("W17-REQ-TEAM-04 worker-link POST route present and admin-gated");
  } else {
    run.fail("W17-REQ-TEAM-04 worker-link route", "admin-only worker-link route marker missing");
  }
}

async function checkEmployeeListApi(run, adminToken) {
  run.section("W17-REQ-TEAM-03 employee list API");
  const { status, body } = await get("/api/workforce/employees", adminToken);
  if (status === 200 && body.ok && Array.isArray(body.employees)) {
    run.pass("W17-REQ-TEAM-03 GET /api/workforce/employees returns employees list");
  } else {
    run.fail("W17-REQ-TEAM-03 employee list", `status=${status} ok=${body.ok}`);
  }
}

async function checkWorkerLinkAuth(run, adminToken, employeeToken, testEmployeeId) {
  run.section("W17-REQ-TEAM-04 worker-link auth (write)");
  const emp403 = await post(`/api/workforce/employees/${testEmployeeId}/worker-link`, {}, employeeToken);
  if (emp403.status === 403) run.pass("W17-REQ-TEAM-04 employee cannot POST worker-link (403)");
  else run.fail("W17-REQ-TEAM-04 employee worker-link blocked", `expected 403 got ${emp403.status}`);

  const admin200 = await post(`/api/workforce/employees/${testEmployeeId}/worker-link`, {}, adminToken);
  if (admin200.status === 200 && admin200.body.ok && (admin200.body.path || admin200.body.token)) {
    run.pass("W17-REQ-TEAM-04 admin can POST worker-link");
  } else {
    run.fail("W17-REQ-TEAM-04 admin worker-link", `status=${admin200.status} ${admin200.body.error || ""}`);
  }
}

async function seedTestEmployee(svc, ts) {
  const { data: emp, error } = await svc.from("employees").insert({
    name: `BLH TEST W17 TEAM ${ts}`,
    trade: "carpenter",
    employment_type: "full_time",
    is_active: true,
  }).select("id").single();
  if (error || !emp?.id) throw new Error(error?.message || "employee insert failed");
  return emp.id;
}

export async function runW17TeamTabBaseline(run) {
  run.section("W17-P1 — Workforce Team tab baseline");
  checkStaticTeamTab(run);
  checkStaticRedirect(run);
  checkProtectedSyncPath(run);
  checkWorkerLinkRouteStatic(run);

  if (!WRITE) {
    run.gap("W17-REQ-TEAM-03 employee list API", "requires --write");
    run.gap("W17-REQ-TEAM-04 worker-link auth write checks", "requires --write");
    return;
  }

  const users = await ensureE2EUsers();
  const adminToken = await getTokenForEmail(users.admin.email);
  const employeeToken = await getTokenForEmail(users.employee.email);
  const svc = serviceClient();
  const ts = Date.now();
  let employeeId = null;
  try {
    employeeId = await seedTestEmployee(svc, ts);
    await checkEmployeeListApi(run, adminToken);
    await checkWorkerLinkAuth(run, adminToken, employeeToken, employeeId);
  } finally {
    if (employeeId) await svc.from("employees").delete().eq("id", employeeId);
  }
}
