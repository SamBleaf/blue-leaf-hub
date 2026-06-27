/**
 * W17-P4 — Planner UI minimum (baseline)
 *
 * W17-REQ-PLAN-01 Planner tab exists/loads (wired admin+supervisor; advisory note; GET week 200)
 * W17-REQ-PLAN-02 allocation can be created for employee/date
 * W17-REQ-PLAN-03 allocation can be edited (PUT) and deleted (DELETE)
 * W17-REQ-PLAN-04 duplicate employee/date allocation is blocked (409 DUPLICATE_ALLOCATION)
 * W17-REQ-PLAN-05 allocation does not create or alter timesheets
 * W17-REQ-PLAN-06 Planner is advisory-only — no timesheet/approve/sync/Buildxact paths (static)
 *
 * Backend-only: reuses the W16 allocation routes; no schema/route change in P4.
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

function readRootFile(rel) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  return readFileSync(join(root, rel), "utf8");
}
function ymdLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDaysYmd(ymdStr, n) {
  const d = new Date(`${ymdStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return ymdLocal(d);
}
function mondayOfYmd(ymdStr) {
  const d = new Date(`${ymdStr}T12:00:00`);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return ymdLocal(d);
}
async function getTokenForEmail(email, password = E2E_PASSWORD) {
  if (!SB_URL || !SB_ANON) throw new Error("Missing Supabase URL or anon key");
  const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) throw new Error(error?.message || `No session for ${email}`);
  return data.session.access_token;
}
async function del(path, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method: "DELETE", headers });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// ── Static checks (run in both modes) ────────────────────────────────────────
function checkStatic(run) {
  run.section("W17-P4 Planner — static wiring");
  const wf = readRootFile("src/pages/Workforce.jsx");
  const planner = readRootFile("src/pages/workforce/WorkforcePlannerTab.jsx");

  if (wf.includes("WorkforcePlannerTab") && wf.includes('"Planner"')
    && /canPlan\s*=\s*role === "admin" \|\| role === "supervisor"/.test(wf)
    && wf.includes("shownTab === \"Planner\" && canPlan")) {
    run.pass("W17-REQ-PLAN-01 Planner tab wired into Workforce (admin/supervisor only)");
  } else {
    run.fail("W17-REQ-PLAN-01 wiring", "Planner tab import / gate / render not found in Workforce.jsx");
  }

  if (planner.includes("Planner is advisory only. It does not create timesheets, approve hours, or sync anything to Buildexact.")) {
    run.pass("W17-REQ-PLAN-01 advisory-only note present (exact copy)");
  } else {
    run.fail("W17-REQ-PLAN-01 advisory note", "advisory-only copy missing/changed");
  }

  // employee-first grid (rows=employees, columns=days) + week nav
  if (planner.includes("employees.map") && planner.includes("days.map") && planner.includes("This week")) {
    run.pass("W17-REQ-PLAN-01 employee-first week grid with prev/this/next navigation");
  } else {
    run.fail("W17-REQ-PLAN-01 grid", "employee rows / day columns / week nav not all present");
  }

  // PLAN-06 advisory boundary: no timesheet/approve/sync/Buildxact calls; all calls stay in the
  // workforce/operations/carpentry domain (robust to new advisory routes like planner-jobs / days-off).
  const calls = [...planner.matchAll(/authFetch\(\s*[`"']([^`"']+)[`"']/g)].map(m => m[1]);
  const forbidden = /\/timesheets|buildexact|\/sync\b|\/approve\b|mass-approve/i;
  const badCall = calls.find(p => forbidden.test(p));
  const outOfDomain = calls.find(p => !/^\/api\/(workforce|operations|carpentry)\b/.test(p));
  if (calls.length > 0 && !badCall && !outOfDomain) {
    run.pass("W17-REQ-PLAN-06 Planner — no timesheet/approve/sync/Buildxact calls; stays in workforce domain");
  } else {
    run.fail("W17-REQ-PLAN-06 advisory boundary", `forbidden: ${badCall || "-"} / out-of-domain: ${outOfDomain || "-"}`);
  }

  // protected Buildxact sync routes still intact (Planner must not have disturbed them)
  const routes = readRootFile("server/lib/workforceRoutes.mjs");
  const markers = [
    "export async function syncTimesheetToBuildexact",
    "async function approveSingleTimesheet",
    'app.post("/api/workforce/timesheets/:id/approve"',
    'app.post("/api/workforce/timesheets/:id/sync"',
    'app.post("/api/workforce/timesheets/sync-pending"',
  ];
  const missing = markers.filter(m => !routes.includes(m));
  if (missing.length === 0) run.pass("W17-REQ-PLAN-06 protected Buildxact sync routes/functions intact");
  else run.fail("W17-REQ-PLAN-06 protected sync path", `missing markers: ${missing.join(", ")}`);
}

async function seedFixture(svc, ts) {
  const address = buildTestJobAddress({ suite: "W17", workflowId: "PLAN", ts });
  const { data: job, error: jobErr } = await svc.from("jobs").insert({ address, status: "tendering" }).select("id").single();
  if (jobErr || !job?.id) throw new Error(jobErr?.message || "job insert failed");
  const { data: project, error: projErr } = await svc.from("projects").insert({ job_id: job.id, address }).select("id").single();
  if (projErr || !project?.id) throw new Error(projErr?.message || "project insert failed");
  const { data: carp, error: cjErr } = await svc.from("carpentry_jobs").insert({
    reference: `CJB-W17PLAN-${ts}`,
    client_name: `BLH TEST W17 PLAN Client ${ts}`,
    address,
    project_type: "full_package",
    status: "active",
  }).select("id").single();
  if (cjErr || !carp?.id) throw new Error(cjErr?.message || "carpentry insert failed");
  const { data: emp, error: empErr } = await svc.from("employees").insert({
    name: `BLH TEST W17 PLAN Worker ${ts}`,
    trade: "carpenter",
    hourly_rate: 50,
    is_active: true,
    worker_token: crypto.randomBytes(24).toString("base64url"),
  }).select("id").single();
  if (empErr || !emp?.id) throw new Error(empErr?.message || "employee insert failed");
  return {
    jobId: job.id, projectId: project.id, carpentryJobId: carp.id, employeeId: emp.id,
    date: ymdLocal(), weekStart: mondayOfYmd(ymdLocal()),
  };
}

async function cleanup(svc, fx, allocationIds) {
  if (!svc) return;
  for (const id of allocationIds) await svc.from("workforce_allocations").delete().eq("id", id);
  if (fx?.employeeId) {
    await svc.from("workforce_allocations").delete().eq("employee_id", fx.employeeId);
    await svc.from("timesheet_entries").delete().eq("employee_id", fx.employeeId);
    await svc.from("timesheets").delete().eq("employee_id", fx.employeeId);
    await svc.from("employees").delete().eq("id", fx.employeeId);
  }
  if (fx?.carpentryJobId) await svc.from("carpentry_jobs").delete().eq("id", fx.carpentryJobId);
  if (fx?.projectId) await svc.from("projects").delete().eq("id", fx.projectId);
  if (fx?.jobId) await svc.from("jobs").delete().eq("id", fx.jobId);
}

export async function runW17PlannerBaseline(run) {
  checkStatic(run);

  if (!WRITE) {
    run.gap("W17-REQ-PLAN-02 create allocation", "requires --write");
    run.gap("W17-REQ-PLAN-03 edit/delete allocation", "requires --write");
    run.gap("W17-REQ-PLAN-04 duplicate employee/date 409", "requires --write");
    run.gap("W17-REQ-PLAN-05 no timesheet side effect", "requires --write");
    return;
  }

  const svc = serviceClient();
  if (!svc) { run.fail("W17-PLAN setup", "service role required"); return; }
  const { error: schemaErr } = await svc.from("workforce_allocations").select("id").limit(0);
  if (schemaErr) { run.fail("W17-PLAN schema", "workforce_allocations missing — apply migration 117"); return; }

  let users, adminToken;
  try {
    users = await ensureE2EUsers();
    adminToken = await getTokenForEmail(users.admin.email);
  } catch (e) { run.fail("W17-PLAN setup auth", e.message); return; }

  const ts = Date.now();
  let fx = null;
  const allocationIds = [];

  try {
    fx = await seedFixture(svc, ts);

    run.section("W17-REQ-PLAN-02 create allocation (project)");
    const c1 = await post("/api/workforce/allocations",
      { allocationDate: fx.date, employeeId: fx.employeeId, projectId: fx.projectId, notes: `BLH TEST W17 PLAN ${ts}` },
      adminToken);
    if (c1.status === 200 && c1.body?.ok && c1.body.allocation?.id && c1.body.allocation.projectId === fx.projectId) {
      allocationIds.push(c1.body.allocation.id);
      run.pass("W17-REQ-PLAN-02 POST allocation creates row for employee/date (project XOR)");
    } else {
      run.fail("W17-REQ-PLAN-02 create", `got ${c1.status} ${JSON.stringify(c1.body)}`);
    }
    const allocId = c1.body?.allocation?.id;

    run.section("W17-REQ-PLAN-01 Planner GET week loads allocation");
    const wk = await get(`/api/workforce/allocations?from=${fx.weekStart}&to=${addDaysYmd(fx.weekStart, 6)}`, adminToken);
    const seen = (wk.body?.allocations || []).some(a => a.id === allocId);
    if (wk.status === 200 && wk.body?.ok && seen) run.pass("W17-REQ-PLAN-01 GET allocations (week) returns the new allocation");
    else run.fail("W17-REQ-PLAN-01 week load", `status=${wk.status} seen=${seen}`);

    run.section("W17-REQ-PLAN-04 duplicate employee/date → 409 (hard block)");
    const dup = await post("/api/workforce/allocations",
      { allocationDate: fx.date, employeeId: fx.employeeId, carpentryJobId: fx.carpentryJobId },
      adminToken);
    if (dup.status === 409 && dup.body?.ok === false && dup.body?.code === "DUPLICATE_ALLOCATION") {
      run.pass("W17-REQ-PLAN-04 duplicate employee/date blocked (409 DUPLICATE_ALLOCATION)");
    } else {
      run.fail("W17-REQ-PLAN-04 duplicate", `expected 409; got ${dup.status} ${JSON.stringify(dup.body)}`);
    }

    run.section("W17-REQ-PLAN-05 allocation creates/alters NO timesheet");
    const { count: tsCount } = await svc.from("timesheets").select("id", { count: "exact", head: true })
      .eq("employee_id", fx.employeeId);
    if ((tsCount || 0) === 0) run.pass("W17-REQ-PLAN-05 no timesheet row created by allocation");
    else run.fail("W17-REQ-PLAN-05 timesheet side effect", `unexpected ${tsCount} timesheet(s) for the allocated employee`);

    run.section("W17-REQ-PLAN-03 edit (replace) then delete");
    // The UI edits a filled cell by replacing it: delete the old row, then re-create on the same
    // employee/date (covers switching project ↔ carpentry). Mirror that here.
    const delOld = await del(`/api/workforce/allocations/${allocId}`, adminToken);
    const recreate = await post("/api/workforce/allocations",
      { allocationDate: fx.date, employeeId: fx.employeeId, carpentryJobId: fx.carpentryJobId, notes: "BLH TEST W17 PLAN edited" },
      adminToken);
    const newId = recreate.body?.allocation?.id;
    if (delOld.status === 200 && delOld.body?.ok && recreate.status === 200 && recreate.body?.ok
      && recreate.body.allocation?.carpentryJobId === fx.carpentryJobId && !recreate.body.allocation?.projectId) {
      allocationIds.length = 0; if (newId) allocationIds.push(newId);
      run.pass("W17-REQ-PLAN-03 edit replaces allocation (project → carpentry, XOR preserved)");
    } else {
      run.fail("W17-REQ-PLAN-03 edit", `del=${delOld.status} recreate=${recreate.status} ${JSON.stringify(recreate.body)}`);
    }
    const removed = await del(`/api/workforce/allocations/${newId || allocId}`, adminToken);
    const after = await get(`/api/workforce/allocations?from=${fx.weekStart}&to=${addDaysYmd(fx.weekStart, 6)}`, adminToken);
    const gone = !(after.body?.allocations || []).some(a => a.id === (newId || allocId));
    if (removed.status === 200 && removed.body?.ok && gone) {
      run.pass("W17-REQ-PLAN-03 DELETE removes allocation");
      allocationIds.length = 0; // already deleted
    } else {
      run.fail("W17-REQ-PLAN-03 delete", `status=${removed.status} gone=${gone}`);
    }
  } finally {
    await cleanup(svc, fx, allocationIds);
  }
}
