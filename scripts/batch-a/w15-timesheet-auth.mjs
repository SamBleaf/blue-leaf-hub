/**
 * P0-C3 — Workforce timesheet approval role gate (W15-DRIFT-001, Option B)
 *
 * Proves:
 * - W15-SEC-01 employee cannot approve timesheets
 * - W15-SEC-02 supervisor cannot approve (admin-only API preserved)
 * - W15-SEC-03 admin can approve timesheets
 * - W15-SEC-04 supervisor can reject when API allows
 * - W15-API-01 duplicate approval is safe (status + BX id stable)
 * - W15-API-02 submitted → approved / submitted → rejected transitions
 * - W15-API-03 Buildxact WO path not duplicated (DB state; gap if BX unconfigured)
 * - W15-API-04 pending/list reads work for intended roles
 */
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

async function getTokenForEmail(email, password = E2E_PASSWORD) {
  if (!SB_URL || !SB_ANON) throw new Error("Missing Supabase URL or anon key");
  const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    throw new Error(error?.message || `No session for ${email}`);
  }
  return data.session.access_token;
}

async function cleanup(svc, { employeeId, timesheetIds = [], jobId, projectId }) {
  if (!svc) return;
  for (const id of timesheetIds) {
    await svc.from("timesheet_entries").delete().eq("timesheet_id", id);
    await svc.from("timesheets").delete().eq("id", id);
  }
  if (employeeId) await svc.from("employees").delete().eq("id", employeeId);
  if (projectId) await svc.from("projects").delete().eq("id", projectId);
  if (jobId) await svc.from("jobs").delete().eq("id", jobId);
}

async function seedEmployeeAndTimesheets(svc, ts) {
  const address = buildTestJobAddress({ suite: "W15", workflowId: "TS", ts });
  const { data: job, error: jobErr } = await svc
    .from("jobs")
    .insert({ address, status: "tendering" })
    .select("id")
    .single();
  if (jobErr || !job?.id) throw new Error(jobErr?.message || "job insert failed");

  const { data: project, error: projErr } = await svc
    .from("projects")
    .insert({ job_id: job.id, address })
    .select("id")
    .single();
  if (projErr || !project?.id) throw new Error(projErr?.message || "project insert failed");

  const { data: emp, error: empErr } = await svc
    .from("employees")
    .insert({
      name: `BLH TEST W15 Employee ${ts}`,
      trade: "carpenter",
      hourly_rate: 55,
      is_active: true,
    })
    .select("id")
    .single();
  if (empErr || !emp?.id) throw new Error(empErr?.message || "employee insert failed");

  async function insertSubmittedTimesheet(date) {
    const { data: sheet, error: tsErr } = await svc
      .from("timesheets")
      .insert({
        employee_id: emp.id,
        date,
        project_id: project.id,
        job_id: job.id,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (tsErr || !sheet?.id) throw new Error(tsErr?.message || "timesheet insert failed");

    const { error: entryErr } = await svc.from("timesheet_entries").insert({
      timesheet_id: sheet.id,
      employee_id: emp.id,
      task_category: "site_labouring",
      phase: "general",
      hours: 8,
      overtime_hours: 0,
    });
    if (entryErr) throw new Error(entryErr.message);

    return sheet.id;
  }

  const approveId = await insertSubmittedTimesheet("2026-06-01");
  const rejectId = await insertSubmittedTimesheet("2026-06-02");
  const massId = await insertSubmittedTimesheet("2026-06-03");

  return {
    jobId: job.id,
    projectId: project.id,
    employeeId: emp.id,
    approveTimesheetId: approveId,
    rejectTimesheetId: rejectId,
    massTimesheetId: massId,
  };
}

export async function runW15TimesheetAuth(run) {
  run.section("P0-C3 — Workforce timesheet approval (W15, Option B)");

  if (!WRITE) {
    run.gap("W15-SEC-01 employee cannot approve", "requires --write");
    run.gap("W15-SEC-02 supervisor cannot approve", "requires --write");
    run.gap("W15-SEC-03 admin can approve", "requires --write");
    run.gap("W15-SEC-04 supervisor can reject", "requires --write");
    run.gap("W15-API-01 duplicate approval safe", "requires --write");
    run.gap("W15-API-02 status transitions", "requires --write");
    run.gap("W15-API-03 Buildxact path not duplicated", "requires --write");
    run.gap("W15-API-04 read/list for intended roles", "requires --write");
    return;
  }

  const svc = serviceClient();
  if (!svc) {
    run.fail("W15 setup", "service role required");
    return;
  }

  let users;
  try {
    users = await ensureE2EUsers();
  } catch (e) {
    run.fail("W15 setup E2E users", e.message);
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
    run.fail("W15 setup auth tokens", e.message);
    return;
  }

  const ts = Date.now();
  let fixture = null;

  try {
    fixture = await seedEmployeeAndTimesheets(svc, ts);
    const { approveTimesheetId, rejectTimesheetId, massTimesheetId } = fixture;

    run.section("W15-API-04 read/list for intended roles");

    const { status: adminPendingStatus, body: adminPendingBody } = await get(
      "/api/workforce/timesheets/pending",
      adminToken
    );
    if (adminPendingStatus === 200 && adminPendingBody?.ok === true && Array.isArray(adminPendingBody.timesheets)) {
      run.pass("W15-API-04 admin GET /timesheets/pending returns 200");
    } else {
      run.fail("W15-API-04 admin pending", `expected 200 ok; got ${adminPendingStatus}`);
    }

    const { status: supPendingStatus, body: supPendingBody } = await get(
      "/api/workforce/timesheets/pending",
      supervisorToken
    );
    if (supPendingStatus === 200 && supPendingBody?.ok === true) {
      run.pass("W15-API-04 supervisor GET /timesheets/pending returns 200");
    } else {
      run.fail("W15-API-04 supervisor pending", `expected 200; got ${supPendingStatus}`);
    }

    const { status: empPendingStatus, body: empPendingBody } = await get(
      "/api/workforce/timesheets/pending",
      employeeToken
    );
    if (empPendingStatus === 200 && empPendingBody?.ok === true) {
      run.pass("W15-API-04 employee GET /timesheets/pending returns 200 (auth-only gate today)");
    } else {
      run.fail("W15-API-04 employee pending", `expected 200; got ${empPendingStatus}`);
    }

    run.section("W15-SEC-01 employee cannot approve");

    const { status: empApproveStatus, body: empApproveBody } = await post(
      `/api/workforce/timesheets/${approveTimesheetId}/approve`,
      {},
      employeeToken
    );
    if (empApproveStatus === 403 && empApproveBody?.ok === false) {
      run.pass("W15-SEC-01 employee POST approve returns 403");
    } else {
      run.fail("W15-SEC-01 employee approve", `expected 403; got ${empApproveStatus} ${JSON.stringify(empApproveBody)}`);
    }

    const { data: afterEmpApprove } = await svc
      .from("timesheets")
      .select("status")
      .eq("id", approveTimesheetId)
      .single();
    if (afterEmpApprove?.status === "submitted") {
      run.pass("W15-SEC-01 employee approve did not mutate timesheet status");
    } else {
      run.fail("W15-SEC-01 employee approve mutation", `status=${afterEmpApprove?.status}`);
    }

    const { status: empRejectStatus } = await post(
      `/api/workforce/timesheets/${rejectTimesheetId}/reject`,
      { notes: "employee blocked" },
      employeeToken
    );
    if (empRejectStatus === 403) {
      run.pass("W15-SEC-01 employee POST reject returns 403");
    } else {
      run.fail("W15-SEC-01 employee reject", `expected 403; got ${empRejectStatus}`);
    }

    run.section("W15-SEC-02 supervisor cannot approve (Option B)");

    const { status: supApproveStatus, body: supApproveBody } = await post(
      `/api/workforce/timesheets/${approveTimesheetId}/approve`,
      {},
      supervisorToken
    );
    if (supApproveStatus === 403 && supApproveBody?.ok === false) {
      run.pass("W15-SEC-02 supervisor POST approve returns 403");
    } else {
      run.fail("W15-SEC-02 supervisor approve", `expected 403; got ${supApproveStatus}`);
    }

    const { status: supMassStatus, body: supMassBody } = await post(
      "/api/workforce/timesheets/mass-approve",
      { timesheet_ids: [massTimesheetId] },
      supervisorToken
    );
    if (supMassStatus === 403 && supMassBody?.ok === false) {
      run.pass("W15-SEC-02 supervisor POST mass-approve returns 403");
    } else {
      run.fail("W15-SEC-02 supervisor mass-approve", `expected 403; got ${supMassStatus}`);
    }

    run.section("W15-SEC-04 supervisor can reject");

    const { status: supRejectStatus, body: supRejectBody } = await post(
      `/api/workforce/timesheets/${rejectTimesheetId}/reject`,
      { notes: `W15 reject ${ts}` },
      supervisorToken
    );
    if (supRejectStatus === 200 && supRejectBody?.ok === true) {
      run.pass("W15-SEC-04 supervisor POST reject returns 200");
    } else {
      run.fail("W15-SEC-04 supervisor reject", `expected 200; got ${supRejectStatus} ${JSON.stringify(supRejectBody)}`);
    }

    const { data: rejectedRow } = await svc
      .from("timesheets")
      .select("status, rejection_notes")
      .eq("id", rejectTimesheetId)
      .single();
    if (rejectedRow?.status === "rejected") {
      run.pass("W15-API-02 submitted → rejected transition");
    } else {
      run.fail("W15-API-02 reject transition", `status=${rejectedRow?.status}`);
    }

    run.section("W15-SEC-03 admin can approve");

    const { status: adminApproveStatus, body: adminApproveBody } = await post(
      `/api/workforce/timesheets/${approveTimesheetId}/approve`,
      {},
      adminToken
    );
    if (adminApproveStatus === 200 && adminApproveBody?.ok === true) {
      run.pass("W15-SEC-03 admin POST approve returns 200");
    } else {
      run.fail("W15-SEC-03 admin approve", `expected 200; got ${adminApproveStatus} ${JSON.stringify(adminApproveBody)}`);
    }

    const { data: approvedRow } = await svc
      .from("timesheets")
      .select("status, approved_by, approved_at, buildexact_work_order_id")
      .eq("id", approveTimesheetId)
      .single();
    if (approvedRow?.status === "approved" && approvedRow.approved_at) {
      run.pass("W15-API-02 submitted → approved transition");
    } else {
      run.fail("W15-API-02 approve transition", `status=${approvedRow?.status}`);
    }

    const { data: entries } = await svc
      .from("timesheet_entries")
      .select("cost_amount")
      .eq("timesheet_id", approveTimesheetId);
    const hasCost = (entries || []).every((e) => e.cost_amount != null && Number(e.cost_amount) > 0);
    if (hasCost) {
      run.pass("W15-SEC-03 approve stamped entry cost_amount");
    } else {
      run.fail("W15-SEC-03 cost_amount", `entries=${JSON.stringify(entries)}`);
    }

    run.section("W15-API-01 duplicate approval safe");

    const woIdBefore = approvedRow?.buildexact_work_order_id || null;
    await new Promise((r) => setTimeout(r, 500));

    const { status: dupStatus, body: dupBody } = await post(
      `/api/workforce/timesheets/${approveTimesheetId}/approve`,
      {},
      adminToken
    );
    if (dupStatus === 200 && dupBody?.ok === true) {
      run.pass("W15-API-01 second admin approve returns 200 (idempotent path)");
    } else {
      run.fail("W15-API-01 duplicate approve", `expected 200; got ${dupStatus}`);
    }

    const { data: afterDup } = await svc
      .from("timesheets")
      .select("status, buildexact_work_order_id, buildexact_sync_error")
      .eq("id", approveTimesheetId)
      .single();
    if (afterDup?.status === "approved") {
      run.pass("W15-API-01 duplicate approve keeps status approved");
    } else {
      run.fail("W15-API-01 duplicate status", `status=${afterDup?.status}`);
    }

    run.section("W15-API-03 Buildxact path not duplicated");

    const woIdAfter = afterDup?.buildexact_work_order_id || null;
    if (woIdBefore === woIdAfter) {
      run.pass("W15-API-03 buildexact_work_order_id unchanged after duplicate approve");
    } else {
      run.fail("W15-API-03 WO id drift", `before=${woIdBefore} after=${woIdAfter}`);
    }

    if (!woIdAfter && !afterDup?.buildexact_sync_error) {
      run.gap(
        "W15-API-03 external Buildxact WO create/complete",
        "Buildxact not configured or sync skipped — DB idempotency verified only"
      );
    } else if (woIdAfter) {
      run.pass("W15-API-03 Buildxact WO id present — duplicate approve did not create second id");
    }

    run.section("W15-SEC-03 admin mass-approve");

    const { status: massStatus, body: massBody } = await post(
      "/api/workforce/timesheets/mass-approve",
      { timesheet_ids: [massTimesheetId] },
      adminToken
    );
    if (massStatus === 200 && massBody?.ok === true) {
      run.pass("W15-SEC-03 admin POST mass-approve returns 200");
    } else {
      run.fail("W15-SEC-03 admin mass-approve", `expected 200; got ${massStatus}`);
    }

    const { data: massRow } = await svc
      .from("timesheets")
      .select("status")
      .eq("id", massTimesheetId)
      .single();
    if (massRow?.status === "approved") {
      run.pass("W15-SEC-03 mass-approve sets status approved");
    } else {
      run.fail("W15-SEC-03 mass-approve status", `status=${massRow?.status}`);
    }
  } catch (e) {
    run.fail("W15 unexpected", e.message);
  } finally {
    if (fixture) {
      await cleanup(svc, {
        employeeId: fixture.employeeId,
        timesheetIds: [fixture.approveTimesheetId, fixture.rejectTimesheetId, fixture.massTimesheetId],
        jobId: fixture.jobId,
        projectId: fixture.projectId,
      });
    }
  }
}
