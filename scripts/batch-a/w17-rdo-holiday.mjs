/**
 * W17-P5 — RDO + public-holiday DISPLAY model (advisory / UI only)
 *
 * W17-REQ-RDO-01 public-holiday SA seed + persist (graceful before migration 119)
 * W17-REQ-RDO-02 input validation (400s)
 * W17-REQ-RDO-03 RDO recurring pattern persists + expands in non-working-days
 * W17-REQ-RDO-05 advisory: holiday/RDO creation makes NO timesheet
 * W17-REQ-RDO-06 admin/supervisor only (employee 403)
 * W17-REQ-RDO-07 non-working-days endpoint (graceful empty + range guard)
 * W17-REQ-RDO-08 static wiring + protected Buildxact sync intact
 */
import crypto from "crypto";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { WRITE, API, SB_URL, SB_ANON, post, get, serviceClient } from "./_helpers.mjs";
import { ensureE2EUsers } from "../create-e2e-users.mjs";

const E2E_PASSWORD = "BlueLeaf-E2E-2026!";
function readRootFile(rel) { return readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", rel), "utf8"); }
function ymd(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
async function tokenFor(email, password = E2E_PASSWORD) {
  const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) throw new Error(error?.message || `No session ${email}`);
  return data.session.access_token;
}

function checkStatic(run) {
  run.section("W17-P5 — static wiring");
  const t = readRootFile("src/pages/workforce/WorkforcePlannerTab.jsx");
  if (t.includes("nonWorkFor") && t.includes("Days off") && t.includes("seedSA") && t.includes("loadNonWorking"))
    run.pass("W17-REQ-RDO-08 Planner days-off wiring (nonWorkFor + Days off panel + seed)");
  else run.fail("W17-REQ-RDO-08 wiring", "RDO/holiday UI wiring missing");
  const routes = readRootFile("server/lib/workforceRoutes.mjs");
  if (routes.includes('app.get("/api/workforce/non-working-days"') && routes.includes('app.post("/api/workforce/public-holidays/seed-sa"') && routes.includes('app.post("/api/workforce/rdo-patterns"'))
    run.pass("W17-REQ-RDO-08 P5 routes present (non-working-days, seed-sa, rdo-patterns)");
  else run.fail("W17-REQ-RDO-08 routes", "P5 routes missing");
  const markers = ["export async function syncTimesheetToBuildexact", "async function approveSingleTimesheet", 'app.post("/api/workforce/timesheets/:id/approve"', 'app.post("/api/workforce/timesheets/:id/sync"', 'app.post("/api/workforce/timesheets/sync-pending"'];
  if (markers.every(m => routes.includes(m))) run.pass("W17-REQ-RDO-08 protected Buildxact sync routes intact");
  else run.fail("W17-REQ-RDO-08 protected sync", "a protected marker is missing");
}

async function seed(svc, ts) {
  const { data: emp } = await svc.from("employees").insert({ name: `BLH TEST W17 RDO Worker ${ts}`, trade: "carpenter", hourly_rate: 50, is_active: true, worker_token: crypto.randomBytes(18).toString("base64url") }).select("id").single();
  return { employeeId: emp.id };
}
async function cleanup(svc, fx) {
  if (!svc || !fx) return;
  await svc.from("workforce_employee_rdo_dates").delete().eq("employee_id", fx.employeeId).then(() => {}, () => {});
  await svc.from("workforce_rdo_patterns").delete().eq("employee_id", fx.employeeId).then(() => {}, () => {});
  await svc.from("timesheets").delete().eq("employee_id", fx.employeeId);
  await svc.from("employees").delete().eq("id", fx.employeeId);
}

export async function runW17RdoHoliday(run) {
  checkStatic(run);
  if (!WRITE) {
    for (const id of ["01 SA seed", "02 validation", "03 pattern expand", "05 advisory no-timesheet", "06 authz", "07 non-working graceful"])
      run.gap(`W17-REQ-RDO-${id}`, "requires --write");
    return;
  }
  const svc = serviceClient(); if (!svc) { run.fail("W17-RDO setup", "service role required"); return; }
  let adminToken, employeeToken;
  try { const u = await ensureE2EUsers(); adminToken = await tokenFor(u.admin.email); employeeToken = await tokenFor(u.employee.email); }
  catch (e) { run.fail("W17-RDO auth", e.message); return; }

  const ts = Date.now(); let fx = null;
  try {
    fx = await seed(svc, ts);
    const from = ymd(), to = ymd(new Date(Date.now() + 28 * 86400000));

    run.section("W17-REQ-RDO-07 non-working-days endpoint (graceful)");
    const nw = await get(`/api/workforce/non-working-days?from=${from}&to=${to}`, adminToken);
    if (nw.status === 200 && Array.isArray(nw.body?.holidays) && Array.isArray(nw.body?.rdo)) run.pass("W17-REQ-RDO-07 GET non-working-days returns {holidays, rdo} (graceful if tables absent)");
    else run.fail("W17-REQ-RDO-07 non-working-days", `status=${nw.status}`);
    const nwNoRange = await get("/api/workforce/non-working-days", adminToken);
    if (nwNoRange.status === 400) run.pass("W17-REQ-RDO-07 non-working-days requires from+to (400)");
    else run.fail("W17-REQ-RDO-07 range guard", `expected 400; got ${nwNoRange.status}`);

    run.section("W17-REQ-RDO-02 validation (400s)");
    const noDate = await post("/api/workforce/public-holidays", { name: "x" }, adminToken);
    const badWd = await post("/api/workforce/rdo-patterns", { employeeId: fx.employeeId, weekday: 9, anchorDate: from }, adminToken);
    if (noDate.status === 400 && badWd.status === 400) run.pass("W17-REQ-RDO-02 holiday needs date; pattern needs valid weekday (400)");
    else run.fail("W17-REQ-RDO-02 validation", `holiday=${noDate.status} pattern=${badWd.status}`);

    run.section("W17-REQ-RDO-06 admin/supervisor only");
    const denied = await post("/api/workforce/public-holidays", { date: from, name: "Test" }, employeeToken);
    if (denied.status === 403) run.pass("W17-REQ-RDO-06 employee cannot add a public holiday (403)");
    else run.fail("W17-REQ-RDO-06 authz", `expected 403; got ${denied.status}`);

    run.section("W17-REQ-RDO-01 SA seed (computus)");
    const seedRes = await post(`/api/workforce/public-holidays/seed-sa?year=${new Date().getFullYear()}`, {}, adminToken);
    if (seedRes.status === 200 && seedRes.body?.seeded > 0) run.pass(`W17-REQ-RDO-01 seed-sa inserted ${seedRes.body.seeded} SA holidays (migration 119 applied)`);
    else if (seedRes.status === 503 && seedRes.body?.code === "MIGRATION_PENDING") run.gap("W17-REQ-RDO-01 SA seed", "migration 119 not applied yet — degrades gracefully (503)");
    else run.fail("W17-REQ-RDO-01 seed", `unexpected ${seedRes.status} ${JSON.stringify(seedRes.body)}`);

    run.section("W17-REQ-RDO-03 recurring RDO pattern persists + expands");
    const pat = await post("/api/workforce/rdo-patterns", { employeeId: fx.employeeId, weekday: 5, intervalWeeks: 2, anchorDate: from }, adminToken);
    if (pat.status === 200 && pat.body?.pattern?.id) {
      const nw2 = await get(`/api/workforce/non-working-days?from=${from}&to=${to}`, adminToken);
      const mine = (nw2.body?.rdo || []).filter(r => r.employeeId === fx.employeeId && r.source === "pattern");
      if (mine.length >= 1 && mine.every(r => new Date(`${r.date}T12:00:00Z`).getUTCDay() === 5)) run.pass(`W17-REQ-RDO-03 pattern expands to ${mine.length} Friday RDO(s) in range`);
      else run.fail("W17-REQ-RDO-03 expand", `expanded=${JSON.stringify(mine)}`);
    } else if (pat.status === 503 && pat.body?.code === "MIGRATION_PENDING") run.gap("W17-REQ-RDO-03 pattern expand", "migration 119 not applied yet — degrades gracefully (503)");
    else run.fail("W17-REQ-RDO-03 pattern", `unexpected ${pat.status} ${JSON.stringify(pat.body)}`);

    run.section("W17-REQ-RDO-05 advisory — no timesheet side effect");
    const { count } = await svc.from("timesheets").select("id", { count: "exact", head: true }).eq("employee_id", fx.employeeId);
    if ((count || 0) === 0) run.pass("W17-REQ-RDO-05 RDO/holiday creation made no timesheet");
    else run.fail("W17-REQ-RDO-05 timesheet side effect", `unexpected ${count} timesheet(s)`);
  } finally {
    await cleanup(svc, fx);
  }
}
