/**
 * P0-C2 — Schedule write role gate (W12-DRIFT-002)
 *
 * Proves:
 * - W12-SEC-01 employee cannot create/update/delete schedule tasks or save analysis PDF via API
 * - W12-SEC-02 supervisor/admin can create/update/delete schedule tasks + save analysis PDF
 * - W12-API-01 authorised write path still works
 * - W12-API-02 schedule reads remain available to employee
 */
import { createClient } from "@supabase/supabase-js";
import {
  WRITE,
  API,
  SB_URL,
  SB_ANON,
  post,
  get,
  patch,
  serviceClient,
} from "./_helpers.mjs";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";
import { ensureE2EUsers } from "../create-e2e-users.mjs";

const E2E_PASSWORD = "BlueLeaf-E2E-2026!";

async function getTokenForEmail(email, password = E2E_PASSWORD) {
  if (!SB_URL || !SB_ANON) throw new Error("Missing Supabase URL or anon key");
  const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    throw new Error(error?.message || `No session for ${email}`);
  }
  return data.session.access_token;
}

async function del(path, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method: "DELETE", headers });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function cleanup(svc, { jobId, projectId, taskIds = [] }) {
  if (!svc) return;
  for (const taskId of taskIds) {
    await svc.from("schedule_tasks").delete().eq("id", taskId);
  }
  if (projectId) {
    await svc.from("schedule_tasks").delete().eq("project_id", projectId);
    await svc.from("projects").delete().eq("id", projectId);
  }
  if (jobId) await svc.from("jobs").delete().eq("id", jobId);
}

async function seedFixture(svc, adminToken, ts) {
  const address = buildTestJobAddress({ suite: "W12", workflowId: "SCHED", ts });
  const { body: jobBody } = await post("/api/jobs", { address, status: "tendering" }, adminToken);
  const jobId = jobBody?.job?.id;
  if (!jobId) throw new Error("job create via API failed");

  const { data: project, error: projErr } = await svc
    .from("projects")
    .insert({ job_id: jobId, address })
    .select("id")
    .single();
  if (projErr || !project?.id) throw new Error(projErr?.message || "project insert failed");

  const { data: task, error: taskErr } = await svc
    .from("schedule_tasks")
    .insert({
      project_id: project.id,
      name: `W12 fixture ${ts}`,
      trade: "general",
      phase: "general",
      start_date: "2026-07-01",
      end_date: "2026-07-01",
      duration_days: 1,
      status: "planned",
      percent_complete: 0,
    })
    .select("id, name")
    .single();
  if (taskErr || !task?.id) throw new Error(taskErr?.message || "task insert failed");

  return { jobId, projectId: project.id, taskId: task.id, taskName: task.name, address };
}

export async function runW12ScheduleAuth(run) {
  run.section("P0-C2 — Schedule write role gate (W12)");

  if (!WRITE) {
    run.gap("W12-SEC-01 employee write blocked", "requires --write");
    run.gap("W12-SEC-02 supervisor/admin write allowed", "requires --write");
    run.gap("W12-API-01 authorised schedule write", "requires --write");
    run.gap("W12-API-02 employee schedule read", "requires --write");
    return;
  }

  const svc = serviceClient();
  if (!svc) {
    run.fail("W12 setup", "service role required");
    return;
  }

  let users;
  try {
    users = await ensureE2EUsers();
  } catch (e) {
    run.fail("W12 setup E2E users", e.message);
    return;
  }

  let employeeToken;
  let supervisorToken;
  let adminToken;
  try {
    employeeToken = await getTokenForEmail(users.employee.email);
    supervisorToken = await getTokenForEmail(users.supervisor.email);
    adminToken = await getTokenForEmail(users.admin.email);
  } catch (e) {
    run.fail("W12 setup auth tokens", e.message);
    return;
  }

  const ts = Date.now();
  let jobId = null;
  let projectId = null;
  let taskId = null;
  let taskName = null;
  let supervisorCreatedTaskId = null;

  try {
    const fixture = await seedFixture(svc, adminToken, ts);
    jobId = fixture.jobId;
    projectId = fixture.projectId;
    taskId = fixture.taskId;
    taskName = fixture.taskName;

    run.section("W12-SEC-01 employee cannot write schedule");

    const { count: beforeCreate } = await svc
      .from("schedule_tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("deleted_at", null);

    const { status: empCreateStatus, body: empCreateBody } = await post(
      `/api/schedule/${projectId}/task`,
      { name: `Employee blocked create ${ts}`, trade: "general", phase: "general", start_date: "2026-07-02", duration_days: 1 },
      employeeToken
    );

    const { count: afterCreate } = await svc
      .from("schedule_tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("deleted_at", null);

    if (empCreateStatus === 403 && empCreateBody?.ok === false) {
      run.pass("W12-SEC-01 employee POST task returns 403");
    } else {
      run.fail("W12-SEC-01 employee POST task", `expected 403; got ${empCreateStatus} ${JSON.stringify(empCreateBody)}`);
    }

    if (afterCreate === beforeCreate) {
      run.pass("W12-SEC-01 employee POST task did not insert schedule_tasks row");
    } else {
      run.fail("W12-SEC-01 employee POST mutation", `count before=${beforeCreate} after=${afterCreate}`);
    }

    const patchName = `Employee blocked patch ${ts}`;
    const { status: empPatchStatus } = await patch(
      `/api/schedule/task/${taskId}`,
      { name: patchName, no_cascade: true },
      employeeToken
    );

    const { data: afterPatchRow } = await svc
      .from("schedule_tasks")
      .select("name")
      .eq("id", taskId)
      .single();

    if (empPatchStatus === 403) {
      run.pass("W12-SEC-01 employee PATCH task returns 403");
    } else {
      run.fail("W12-SEC-01 employee PATCH task", `expected 403; got ${empPatchStatus}`);
    }

    if (afterPatchRow?.name === taskName) {
      run.pass("W12-SEC-01 employee PATCH did not mutate schedule_tasks");
    } else {
      run.fail("W12-SEC-01 employee PATCH mutation", `name changed to ${afterPatchRow?.name}`);
    }

    const { status: empDeleteStatus } = await del(`/api/schedule/task/${taskId}`, employeeToken);
    const { data: afterDeleteRow } = await svc
      .from("schedule_tasks")
      .select("deleted_at")
      .eq("id", taskId)
      .single();

    if (empDeleteStatus === 403) {
      run.pass("W12-SEC-01 employee DELETE task returns 403");
    } else {
      run.fail("W12-SEC-01 employee DELETE task", `expected 403; got ${empDeleteStatus}`);
    }

    if (!afterDeleteRow?.deleted_at) {
      run.pass("W12-SEC-01 employee DELETE did not soft-delete schedule_tasks");
    } else {
      run.fail("W12-SEC-01 employee DELETE mutation", "task was soft-deleted");
    }

    const { status: empSavePdfStatus, body: empSavePdfBody } = await post(
      "/api/schedule/save-analysis-pdf",
      { projectId, analysisText: `Employee blocked analysis ${ts}` },
      employeeToken
    );
    if (empSavePdfStatus === 403 && empSavePdfBody?.ok === false) {
      run.pass("W12-SEC-01 employee save-analysis-pdf returns 403");
    } else {
      run.fail(
        "W12-SEC-01 employee save-analysis-pdf",
        `expected 403; got ${empSavePdfStatus} ${JSON.stringify(empSavePdfBody)}`
      );
    }

    run.section("W12-API-02 employee schedule read still works");

    const { status: empReadStatus, body: empReadBody } = await get(`/api/schedule/${projectId}`, employeeToken);
    if (empReadStatus === 200 && empReadBody?.ok && Array.isArray(empReadBody.tasks)) {
      run.pass("W12-API-02 employee GET schedule tasks returns 200");
    } else {
      run.fail("W12-API-02 employee read", `${empReadStatus} ${JSON.stringify(empReadBody)}`);
    }

    run.section("W12-SEC-02 supervisor/admin can write schedule");

    const { status: supCreateStatus, body: supCreateBody } = await post(
      `/api/schedule/${projectId}/task`,
      { name: `Supervisor create ${ts}`, trade: "general", phase: "general", start_date: "2026-07-03", duration_days: 2 },
      supervisorToken
    );
    supervisorCreatedTaskId = supCreateBody?.task?.id;

    if (supCreateStatus === 200 && supCreateBody?.ok && supervisorCreatedTaskId) {
      run.pass("W12-SEC-02 supervisor POST task returns 200");
    } else {
      run.fail("W12-SEC-02 supervisor POST task", `${supCreateStatus} ${JSON.stringify(supCreateBody)}`);
    }

    const supPatchName = `Supervisor patch ${ts}`;
    const { status: supPatchStatus } = await patch(
      `/api/schedule/task/${supervisorCreatedTaskId}`,
      { name: supPatchName, no_cascade: true },
      supervisorToken
    );
    const { data: supPatched } = await svc
      .from("schedule_tasks")
      .select("name")
      .eq("id", supervisorCreatedTaskId)
      .single();

    if (supPatchStatus === 200 && supPatched?.name === supPatchName) {
      run.pass("W12-SEC-02 supervisor PATCH task succeeds");
    } else {
      run.fail("W12-SEC-02 supervisor PATCH", `status=${supPatchStatus} name=${supPatched?.name}`);
    }

    const { status: admPatchStatus } = await patch(
      `/api/schedule/task/${taskId}`,
      { notes: `Admin note ${ts}`, no_cascade: true },
      adminToken
    );
    const { data: admPatched } = await svc
      .from("schedule_tasks")
      .select("notes")
      .eq("id", taskId)
      .single();

    if (admPatchStatus === 200 && admPatched?.notes === `Admin note ${ts}`) {
      run.pass("W12-SEC-02 admin PATCH task succeeds");
    } else {
      run.fail("W12-SEC-02 admin PATCH", `status=${admPatchStatus} notes=${admPatched?.notes}`);
    }

    const { status: supSavePdfStatus, body: supSavePdfBody } = await post(
      "/api/schedule/save-analysis-pdf",
      { projectId, analysisText: `Supervisor analysis ${ts}` },
      supervisorToken
    );
    if (supSavePdfStatus === 200 && supSavePdfBody?.ok === true) {
      run.pass("W12-SEC-02 supervisor save-analysis-pdf returns 200");
    } else {
      run.fail(
        "W12-SEC-02 supervisor save-analysis-pdf",
        `${supSavePdfStatus} ${JSON.stringify(supSavePdfBody)}`
      );
    }

    run.section("W12-API-01 authorised schedule write path");

    const { status: admDeleteStatus } = await del(`/api/schedule/task/${supervisorCreatedTaskId}`, adminToken);
    const { data: deletedRow } = await svc
      .from("schedule_tasks")
      .select("deleted_at")
      .eq("id", supervisorCreatedTaskId)
      .single();

    if (admDeleteStatus === 200 && deletedRow?.deleted_at) {
      run.pass("W12-API-01 admin DELETE task soft-deletes row");
    } else {
      run.fail("W12-API-01 admin DELETE", `status=${admDeleteStatus} deleted_at=${deletedRow?.deleted_at}`);
    }
  } finally {
    const taskIds = [taskId, supervisorCreatedTaskId].filter(Boolean);
    await cleanup(svc, { jobId, projectId, taskIds });
  }
}
