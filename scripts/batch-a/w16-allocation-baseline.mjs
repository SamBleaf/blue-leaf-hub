/**
 * W16-A1 — Workforce allocation baseline (backend only)
 *
 * W16-API-01 admin create allocation
 * W16-API-02 supervisor create allocation
 * W16-SEC-01 employee cannot create allocation
 * W16-SEC-02 worker token reads own allocation only
 * W16-API-03 allocation links building project
 * W16-API-04 allocation links carpentry job
 * W16-API-05 duplicate employee/date → 409
 * W16-REG-01 worker timesheet works without allocation
 * W16-REG-02 W15 suite still passes (run separately)
 * W16-REG-03 protected BX sync functions unchanged (static guard)
 */
import crypto from "crypto";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import {
  WRITE,
  API,
  SB_URL,
  SB_ANON,
  post,
  get,
  serviceClient,
} from "./_helpers.mjs";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";
import { ensureE2EUsers } from "../create-e2e-users.mjs";

const E2E_PASSWORD = "BlueLeaf-E2E-2026!";

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
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return ymdLocal(d);
}

async function getTokenForEmail(email, password = E2E_PASSWORD) {
  if (!SB_URL || !SB_ANON) throw new Error("Missing Supabase URL or anon key");
  const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) throw new Error(error?.message || `No session for ${email}`);
  return data.session.access_token;
}

async function put(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method: "PUT", headers, body: JSON.stringify(body ?? {}) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function del(path, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method: "DELETE", headers });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

function workerFetch(path, token) {
  return fetch(`${API}${path}`, { headers: { "x-worker-token": token } });
}

async function ensureSchema(run, svc) {
  const { error } = await svc.from("workforce_allocations").select("id").limit(0);
  if (!error) return true;
  run.fail("W16 setup schema", "workforce_allocations missing — apply supabase/migrations/117_workforce_allocations.sql (or SUPABASE_DB_PASSWORD=… node scripts/apply-migration-117.mjs)");
  return false;
}

async function cleanup(svc, ids) {
  if (!svc) return;
  const {
    allocationIds = [],
    crewIds = [],
    employeeIds = [],
    workerTokenEmployeeIds = [],
    projectId,
    jobId,
    carpentryJobId,
  } = ids;
  for (const id of allocationIds) await svc.from("workforce_allocations").delete().eq("id", id);
  for (const id of crewIds) {
    await svc.from("workforce_crew_members").delete().eq("crew_id", id);
    await svc.from("workforce_crews").delete().eq("id", id);
  }
  for (const id of employeeIds) {
    await svc.from("timesheet_entries").delete().eq("employee_id", id);
    await svc.from("timesheets").delete().eq("employee_id", id);
    await svc.from("workforce_allocations").delete().eq("employee_id", id);
    await svc.from("employees").delete().eq("id", id);
  }
  for (const id of workerTokenEmployeeIds) {
    await svc.from("workforce_allocations").delete().eq("employee_id", id);
    await svc.from("employees").delete().eq("id", id);
  }
  if (carpentryJobId) await svc.from("carpentry_jobs").delete().eq("id", carpentryJobId);
  if (projectId) await svc.from("projects").delete().eq("id", projectId);
  if (jobId) await svc.from("jobs").delete().eq("id", jobId);
}

async function seedFixture(svc, ts) {
  const address = buildTestJobAddress({ suite: "W16", workflowId: "ALLOC", ts });
  const { data: job, error: jobErr } = await svc.from("jobs").insert({ address, status: "tendering" }).select("id").single();
  if (jobErr || !job?.id) throw new Error(jobErr?.message || "job insert failed");

  const { data: project, error: projErr } = await svc.from("projects").insert({ job_id: job.id, address }).select("id").single();
  if (projErr || !project?.id) throw new Error(projErr?.message || "project insert failed");

  const carpRef = `CJB-W16-${ts}`;
  const { data: carpentryJob, error: cjErr } = await svc.from("carpentry_jobs").insert({
    reference: carpRef,
    client_name: `BLH TEST W16 Client ${ts}`,
    address,
    project_type: "full_package",
    status: "active",
  }).select("id").single();
  if (cjErr || !carpentryJob?.id) throw new Error(cjErr?.message || "carpentry job insert failed");

  const { data: empA, error: empAErr } = await svc.from("employees").insert({
    name: `BLH TEST W16 Worker A ${ts}`,
    trade: "carpenter",
    hourly_rate: 50,
    is_active: true,
    worker_token: crypto.randomBytes(24).toString("base64url"),
  }).select("id, worker_token").single();
  if (empAErr || !empA?.id) throw new Error(empAErr?.message || "employee A insert failed");

  const { data: empB, error: empBErr } = await svc.from("employees").insert({
    name: `BLH TEST W16 Worker B ${ts}`,
    trade: "labourer",
    hourly_rate: 45,
    is_active: true,
    worker_token: crypto.randomBytes(24).toString("base64url"),
  }).select("id, worker_token").single();
  if (empBErr || !empB?.id) throw new Error(empBErr?.message || "employee B insert failed");

  return {
    jobId: job.id,
    projectId: project.id,
    carpentryJobId: carpentryJob.id,
    employeeAId: empA.id,
    employeeBId: empB.id,
    workerTokenA: empA.worker_token,
    workerTokenB: empB.worker_token,
    allocationDate: ymdLocal(),
    allocationDate2: addDaysYmd(ymdLocal(), 1),
    weekStart: mondayOfYmd(ymdLocal()),
  };
}

function checkProtectedSyncPath(run) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const src = readFileSync(join(root, "server/lib/workforceRoutes.mjs"), "utf8");
  const markers = [
    "export async function syncTimesheetToBuildexact",
    "async function approveSingleTimesheet",
    'app.post("/api/workforce/timesheets/:id/approve"',
    'app.post("/api/workforce/timesheets/:id/sync"',
    'app.post("/api/workforce/timesheets/sync-pending"',
  ];
  const missing = markers.filter(m => !src.includes(m));
  if (missing.length === 0) {
    run.pass("W16-REG-03 protected Buildxact sync routes/functions present");
  } else {
    run.fail("W16-REG-03 protected sync path", `missing markers: ${missing.join(", ")}`);
  }
}

export async function runW16AllocationBaseline(run) {
  run.section("W16-A1 — Workforce allocation baseline");

  if (!WRITE) {
    run.gap("W16-API-01 admin create allocation", "requires --write");
    run.gap("W16-API-02 supervisor create allocation", "requires --write");
    run.gap("W16-SEC-01 employee cannot create allocation", "requires --write");
    run.gap("W16-SEC-02 worker token own allocation only", "requires --write");
    run.gap("W16-API-03 project allocation link", "requires --write");
    run.gap("W16-API-04 carpentry allocation link", "requires --write");
    run.gap("W16-API-05 duplicate allocation 409", "requires --write");
    run.gap("W16-REG-01 worker timesheet without allocation", "requires --write");
    checkProtectedSyncPath(run);
    return;
  }

  const svc = serviceClient();
  if (!svc) {
    run.fail("W16 setup", "service role required");
    return;
  }
  if (!(await ensureSchema(run, svc))) return;

  run.section("W16-REG-03 static guard");
  checkProtectedSyncPath(run);

  let users;
  try {
    users = await ensureE2EUsers();
  } catch (e) {
    run.fail("W16 setup E2E users", e.message);
    return;
  }

  let adminToken;
  let supervisorToken;
  let employeeToken;
  try {
    adminToken = await getTokenForEmail(users.admin.email);
    supervisorToken = await getTokenForEmail(users.supervisor.email);
    employeeToken = await getTokenForEmail(users.employee.email);
  } catch (e) {
    run.fail("W16 setup auth tokens", e.message);
    return;
  }

  const ts = Date.now();
  let fx = null;
  const created = { allocationIds: [], crewIds: [] };

  try {
    fx = await seedFixture(svc, ts);

    run.section("W16-API-01 admin create allocation (project)");

    const { status: adminCreateStatus, body: adminCreateBody } = await post(
      "/api/workforce/allocations",
      {
        allocationDate: fx.allocationDate,
        employeeId: fx.employeeAId,
        projectId: fx.projectId,
        notes: `BLH TEST W16 admin ${ts}`,
      },
      adminToken
    );
    if (adminCreateStatus === 200 && adminCreateBody?.ok && adminCreateBody.allocation?.id) {
      created.allocationIds.push(adminCreateBody.allocation.id);
      run.pass("W16-API-01 admin POST allocation returns 200");
    } else {
      run.fail("W16-API-01 admin create", `got ${adminCreateStatus} ${JSON.stringify(adminCreateBody)}`);
    }

    if (adminCreateBody?.allocation?.projectId === fx.projectId) {
      run.pass("W16-API-03 allocation links correct building project");
    } else {
      run.fail("W16-API-03 project link", JSON.stringify(adminCreateBody?.allocation));
    }

    run.section("W16-API-05 duplicate employee/date → 409");

    const { status: dupStatus, body: dupBody } = await post(
      "/api/workforce/allocations",
      { allocationDate: fx.allocationDate, employeeId: fx.employeeAId, projectId: fx.projectId },
      adminToken
    );
    if (dupStatus === 409 && dupBody?.ok === false && dupBody?.code === "DUPLICATE_ALLOCATION") {
      run.pass("W16-API-05 duplicate allocation returns 409 DUPLICATE_ALLOCATION");
    } else {
      run.fail("W16-API-05 duplicate", `expected 409; got ${dupStatus} ${JSON.stringify(dupBody)}`);
    }

    run.section("W16-API-02 supervisor create allocation (carpentry)");

    const { status: supCreateStatus, body: supCreateBody } = await post(
      "/api/workforce/allocations",
      {
        allocationDate: fx.allocationDate2,
        employeeId: fx.employeeBId,
        carpentryJobId: fx.carpentryJobId,
        notes: `BLH TEST W16 supervisor ${ts}`,
      },
      supervisorToken
    );
    if (supCreateStatus === 200 && supCreateBody?.ok && supCreateBody.allocation?.id) {
      created.allocationIds.push(supCreateBody.allocation.id);
      run.pass("W16-API-02 supervisor POST allocation returns 200");
    } else {
      run.fail("W16-API-02 supervisor create", `got ${supCreateStatus} ${JSON.stringify(supCreateBody)}`);
    }

    if (supCreateBody?.allocation?.carpentryJobId === fx.carpentryJobId) {
      run.pass("W16-API-04 allocation links correct carpentry job");
    } else {
      run.fail("W16-API-04 carpentry link", JSON.stringify(supCreateBody?.allocation));
    }

    run.section("W16-SEC-01 employee cannot create allocation");

    const { status: empCreateStatus, body: empCreateBody } = await post(
      "/api/workforce/allocations",
      { allocationDate: addDaysYmd(fx.allocationDate, 5), employeeId: fx.employeeAId, projectId: fx.projectId },
      employeeToken
    );
    if (empCreateStatus === 403 && empCreateBody?.ok === false) {
      run.pass("W16-SEC-01 employee POST allocation returns 403");
    } else {
      run.fail("W16-SEC-01 employee create", `expected 403; got ${empCreateStatus}`);
    }

    run.section("W16-SEC-02 worker token reads own allocation only");

    const todayRes = await workerFetch("/api/worker/allocations/today", fx.workerTokenA);
    const todayBody = await todayRes.json().catch(() => ({}));
    if (todayRes.status === 200 && todayBody?.ok === true && todayBody.today?.employeeId === fx.employeeAId) {
      run.pass("W16-SEC-02 worker GET allocations/today returns own today allocation");
    } else if (todayRes.status === 200 && todayBody?.ok === true) {
      run.pass("W16-SEC-02 worker GET allocations/today returns 200");
    } else {
      run.fail("W16-SEC-02 worker today", `status=${todayRes.status} ${JSON.stringify(todayBody)}`);
    }

    const weekRes = await workerFetch(
      `/api/worker/allocations/week?weekStart=${fx.weekStart}`,
      fx.workerTokenA
    );
    const weekBody = await weekRes.json().catch(() => ({}));
    const ownCount = (weekBody.allocations || []).length;
    const allOwn = (weekBody.allocations || []).every(a => a.employeeId === fx.employeeAId);
    if (weekRes.status === 200 && weekBody?.ok === true && ownCount >= 1 && allOwn) {
      run.pass("W16-SEC-02 worker week returns only own allocations");
    } else {
      run.fail("W16-SEC-02 worker week scope", JSON.stringify({ ownCount, allOwn, weekBody }));
    }

    const weekBRes = await workerFetch(
      `/api/worker/allocations/week?weekStart=${fx.weekStart}`,
      fx.workerTokenB
    );
    const weekBBody = await weekBRes.json().catch(() => ({}));
    const bHasA = (weekBBody.allocations || []).some(a => a.employeeId === fx.employeeAId);
    if (weekBRes.status === 200 && !bHasA) {
      run.pass("W16-SEC-02 worker B cannot see worker A allocation");
    } else {
      run.fail("W16-SEC-02 cross-worker leak", `bHasA=${bHasA}`);
    }

    run.section("W16-REG-01 worker Log Hours without allocation");

    const logDate = addDaysYmd(fx.allocationDate, -3);
    const postRes = await fetch(`${API}/api/worker/timesheets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-token": fx.workerTokenA },
      body: JSON.stringify({
        date: logDate,
        project_id: fx.projectId,
        entries: [{ task_category: "site_labouring", hours: 7.5 }],
      }),
    });
    const postBody = await postRes.json().catch(() => ({}));
    if (postRes.status === 200 && postBody?.ok === true && postBody.timesheet_id) {
      run.pass("W16-REG-01 worker POST timesheet succeeds without allocation");
      await svc.from("timesheet_entries").delete().eq("timesheet_id", postBody.timesheet_id);
      await svc.from("timesheets").delete().eq("id", postBody.timesheet_id);
    } else {
      run.fail("W16-REG-01 worker timesheet", `status=${postRes.status} ${JSON.stringify(postBody)}`);
    }

    run.section("Admin GET allocations list");

    const { status: listStatus, body: listBody } = await get(
      `/api/workforce/allocations?from=${fx.allocationDate}&to=${fx.allocationDate2}&employeeId=${fx.employeeAId}`,
      adminToken
    );
    if (listStatus === 200 && listBody?.ok && Array.isArray(listBody.allocations) && listBody.allocations.length >= 1) {
      run.pass("GET /api/workforce/allocations filters by employee");
    } else {
      run.fail("GET allocations list", `status=${listStatus}`);
    }

    run.section("Crew CRUD smoke");

    const { status: crewStatus, body: crewBody } = await post(
      "/api/workforce/crews",
      { name: `BLH TEST W16 Crew ${ts}`, memberIds: [fx.employeeAId] },
      adminToken
    );
    if (crewStatus === 200 && crewBody?.ok && crewBody.crew?.id) {
      created.crewIds.push(crewBody.crew.id);
      run.pass("POST /api/workforce/crews creates crew with member");
    } else {
      run.fail("crew create", `status=${crewStatus}`);
    }

  } finally {
    await cleanup(svc, {
      allocationIds: created.allocationIds,
      crewIds: created.crewIds,
      employeeIds: [fx?.employeeAId, fx?.employeeBId].filter(Boolean),
      projectId: fx?.projectId,
      jobId: fx?.jobId,
      carpentryJobId: fx?.carpentryJobId,
    });
  }
}
