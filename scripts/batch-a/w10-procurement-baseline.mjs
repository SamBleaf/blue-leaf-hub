/**
 * P0-C4 — Procurement manual baseline generation (W10-API-01–06)
 *
 * Proves:
 * - W10-API-01 manual generate creates procurement_items from templates
 * - W10-API-02 retry is idempotent (no duplicate rows)
 * - W10-API-03 employee cannot generate baseline
 * - W10-API-04 admin/supervisor can generate baseline
 * - W10-API-05 weak/missing source data returns warnings (not silent success)
 * - W10-API-06 tender win does not auto-generate procurement baseline
 */
import { createClient } from "@supabase/supabase-js";
import {
  WRITE,
  SB_URL,
  SB_ANON,
  post,
  getAuthToken,
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

async function cleanup(svc, { jobId, projectId, rfqId, leadId }) {
  if (!svc) return;
  if (jobId) await svc.from("procurement_items").delete().eq("job_id", jobId);
  if (rfqId) await svc.from("rfqs").delete().eq("id", rfqId);
  if (projectId) {
    await svc.from("schedule_tasks").delete().eq("project_id", projectId);
    await svc.from("projects").delete().eq("id", projectId);
  }
  if (jobId) await svc.from("jobs").delete().eq("id", jobId);
  if (leadId) await svc.from("leads").delete().eq("id", leadId);
}

async function createTestJob(adminToken, ts, { withProject = false } = {}) {
  const address = buildTestJobAddress({ suite: "W10", workflowId: "PROC", ts });
  const { status, body } = await post("/api/jobs", { address, status: "tendering" }, adminToken);
  const jobId = body?.job?.id;
  if (status !== 200 || !jobId) throw new Error(`job create failed: ${status} ${JSON.stringify(body)}`);

  let projectId = null;
  if (withProject) {
    const svc = serviceClient();
    const { data: project, error } = await svc
      .from("projects")
      .insert({ job_id: jobId, address, status: "active" })
      .select("id")
      .single();
    if (error || !project?.id) throw new Error(error?.message || "project insert failed");
    projectId = project.id;
  }

  return { jobId, projectId, address };
}

async function countItems(svc, jobId) {
  const { count } = await svc
    .from("procurement_items")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("required", true);
  return count || 0;
}

async function countDuplicateKeys(svc, jobId) {
  const { data } = await svc
    .from("procurement_items")
    .select("source, source_ref")
    .eq("job_id", jobId)
    .eq("required", true)
    .not("source_ref", "is", null);
  const keys = (data || []).map((r) => `${r.source}|${r.source_ref}`);
  return keys.length - new Set(keys).size;
}

async function winFinalizeMinimal(adminToken, svc, { jobId, ts }) {
  const { data: sub } = await svc.from("subcontractors").select("id, business_name, contact, email, mobile").limit(1).single();
  if (!sub?.id) throw new Error("no subcontractors row for win-finalize fixture");

  const { data: rfqRow } = await svc
    .from("rfqs")
    .insert({ job_id: jobId, subcontractor_id: sub.id, trade: "plumbing", status: "accepted", quote_amount: 12000 })
    .select("id")
    .single();
  const rfqId = rfqRow?.id;
  if (!rfqId) throw new Error("rfq insert failed");

  const { status, body } = await post(
    "/api/tender/win-finalize",
    {
      jobId,
      rfqUpdates: [{ id: rfqId, status: "accepted", quote_amount: 12000 }],
      acceptedTrades: [{
        trade: "plumbing",
        subcontractor: sub.business_name,
        contact: sub.contact,
        email: sub.email,
        phone: sub.mobile,
        quote_amount: 12000,
        subcontractor_id: sub.id,
        rfq_id: rfqId,
      }],
      quoteCopies: [],
      tentative_start_date: null,
      emails: [],
      costIntel: {},
    },
    adminToken
  );
  if (status !== 200 || !body?.ok) throw new Error(`win-finalize failed: ${status} ${JSON.stringify(body)}`);
  return { rfqId, projectId: body?.project?.id || null };
}

export async function runW10ProcurementBaseline(run) {
  run.section("P0-C4 — Procurement manual baseline (W10)");

  if (!WRITE) {
    run.gap("W10-API-01 manual generate creates items", "requires --write");
    run.gap("W10-API-02 retry idempotent", "requires --write");
    run.gap("W10-API-03 employee blocked", "requires --write");
    run.gap("W10-API-04 admin/supervisor allowed", "requires --write");
    run.gap("W10-API-05 weak source warnings", "requires --write");
    run.gap("W10-API-06 win does not auto-generate", "requires --write");
    return;
  }

  const svc = serviceClient();
  if (!svc) {
    run.fail("W10 setup", "service role required");
    return;
  }

  let adminToken;
  let supervisorToken;
  let employeeToken;
  try {
    adminToken = await getAuthToken();
    const users = await ensureE2EUsers();
    supervisorToken = await getTokenForEmail(users.supervisor.email);
    employeeToken = await getTokenForEmail(users.employee.email);
  } catch (e) {
    run.fail("W10 setup auth", e.message);
    return;
  }

  const { count: templateCount } = await svc
    .from("procurement_templates")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  if (!templateCount) {
    run.gap("W10-API-01 template seed", "no active procurement_templates — apply migration 091");
    return;
  }

  const ts = Date.now();
  let jobId = null;
  let projectId = null;
  let winJobId = null;
  let winProjectId = null;
  let winRfqId = null;

  try {
    // ── W10-API-05 weak source (job only, no project) ───────────────────────
    run.section("W10-API-05 weak/missing source data warnings");

    const weak = await createTestJob(adminToken, `${ts}-weak`);
    jobId = weak.jobId;

    const { status: weakStatus, body: weakBody } = await post(
      `/api/procurement/jobs/${jobId}/generate`,
      {},
      adminToken
    );
    if (weakStatus === 200 && weakBody?.ok === true && weakBody?.summary) {
      run.pass("W10-API-05 generate returns summary object");
    } else {
      run.fail("W10-API-05 generate shape", `status=${weakStatus} body=${JSON.stringify(weakBody)}`);
    }

    const warnings = weakBody?.summary?.warnings || [];
    const hasSourceWarning = warnings.some((w) =>
      /project|Buildxact|schedule|estimate|template/i.test(String(w))
    );
    if (hasSourceWarning) {
      run.pass("W10-API-05 warnings surface missing/weak source data");
    } else {
      run.fail("W10-API-05 warnings", `expected source warnings; got ${JSON.stringify(warnings)}`);
    }

    // ── W10-API-03 employee blocked ─────────────────────────────────────────
    run.section("W10-API-03 employee cannot generate");

    const { status: empStatus, body: empBody } = await post(
      `/api/procurement/jobs/${jobId}/generate`,
      {},
      employeeToken
    );
    if (empStatus === 403 && empBody?.ok === false) {
      run.pass("W10-API-03 employee POST generate returns 403");
    } else {
      run.fail("W10-API-03 employee generate", `expected 403; got ${empStatus}`);
    }

    const beforeEmp = await countItems(svc, jobId);

    // ── W10-API-04 supervisor allowed ───────────────────────────────────────
    run.section("W10-API-04 admin/supervisor can generate");

    const { status: supStatus, body: supBody } = await post(
      `/api/procurement/jobs/${jobId}/generate`,
      {},
      supervisorToken
    );
    if (supStatus === 200 && supBody?.ok === true) {
      run.pass("W10-API-04 supervisor POST generate returns 200");
    } else {
      run.fail("W10-API-04 supervisor generate", `expected 200; got ${supStatus} ${JSON.stringify(supBody)}`);
    }

    const afterSup = await countItems(svc, jobId);
    if (afterSup === beforeEmp) {
      run.pass("W10-API-04 supervisor retry did not duplicate items");
    } else {
      run.fail("W10-API-04 supervisor side effect", `before=${beforeEmp} after=${afterSup}`);
    }

    // ── W10-API-01 first generate with project spine ────────────────────────
    run.section("W10-API-01 manual baseline creates procurement_items");

    await cleanup(svc, { jobId });
    jobId = null;

    const full = await createTestJob(adminToken, `${ts}-full`, { withProject: true });
    jobId = full.jobId;
    projectId = full.projectId;

    const { status: gen1Status, body: gen1Body } = await post(
      `/api/procurement/jobs/${jobId}/generate`,
      {},
      adminToken
    );
    const created1 = gen1Body?.summary?.created ?? gen1Body?.result?.created ?? 0;
    const total1 = gen1Body?.summary?.total ?? gen1Body?.result?.total ?? 0;
    const dbCount1 = await countItems(svc, jobId);

    if (gen1Status === 200 && gen1Body?.ok === true && created1 > 0 && total1 > 0 && dbCount1 > 0) {
      run.pass(`W10-API-01 generate created ${created1} items (total ${total1})`);
    } else {
      run.fail("W10-API-01 create items", `status=${gen1Status} created=${created1} db=${dbCount1}`);
    }

    const { status: projGenStatus, body: projGenBody } = await post(
      `/api/procurement/projects/${projectId}/generate`,
      {},
      adminToken
    );
    if (projGenStatus === 200 && projGenBody?.ok === true && projGenBody?.jobId === jobId) {
      run.pass("W10-API-01 projectId generate route resolves job spine");
    } else {
      run.fail("W10-API-01 project route", `status=${projGenStatus} ${JSON.stringify(projGenBody)}`);
    }

    // ── W10-API-02 idempotent retry ─────────────────────────────────────────
    run.section("W10-API-02 retry idempotent");

    const { status: gen2Status, body: gen2Body } = await post(
      `/api/procurement/jobs/${jobId}/generate`,
      {},
      adminToken
    );
    const created2 = gen2Body?.summary?.created ?? gen2Body?.result?.created ?? 0;
    const existing2 = gen2Body?.summary?.existing ?? 0;
    const dbCount2 = await countItems(svc, jobId);
    const dupKeys = await countDuplicateKeys(svc, jobId);

    if (gen2Status === 200 && created2 === 0 && dbCount2 === dbCount1) {
      run.pass("W10-API-02 second generate created 0 new items");
    } else {
      run.fail("W10-API-02 idempotent created", `created2=${created2} db1=${dbCount1} db2=${dbCount2}`);
    }

    if (existing2 >= dbCount1) {
      run.pass("W10-API-02 summary reports existing register count");
    } else {
      run.fail("W10-API-02 existing count", `existing=${existing2} db=${dbCount1}`);
    }

    if (dupKeys === 0) {
      run.pass("W10-API-02 no duplicate (job_id, source, source_ref) keys");
    } else {
      run.fail("W10-API-02 duplicate keys", `${dupKeys} duplicate source keys`);
    }

    // ── W10-API-06 win does not auto-generate ───────────────────────────────
    run.section("W10-API-06 tender win does not auto-generate baseline");

    const win = await createTestJob(adminToken, `${ts}-win`);
    winJobId = win.jobId;

    const beforeWin = await countItems(svc, winJobId);
    const winResult = await winFinalizeMinimal(adminToken, svc, { jobId: winJobId, ts });
    winRfqId = winResult.rfqId;
    winProjectId = winResult.projectId;
    const afterWin = await countItems(svc, winJobId);

    if (beforeWin === 0 && afterWin === 0) {
      run.pass("W10-API-06 win-finalize did not create procurement_items");
    } else {
      run.fail("W10-API-06 auto-generate on win", `before=${beforeWin} after=${afterWin}`);
    }

    const { status: postWinGen, body: postWinBody } = await post(
      `/api/procurement/jobs/${winJobId}/generate`,
      {},
      adminToken
    );
    const postWinCount = await countItems(svc, winJobId);
    if (postWinGen === 200 && postWinBody?.ok && postWinCount > 0) {
      run.pass("W10-API-06 manual generate still works after win");
    } else {
      run.fail("W10-API-06 manual after win", `status=${postWinGen} count=${postWinCount}`);
    }
  } catch (e) {
    run.fail("W10 unexpected", e.message);
  } finally {
    if (jobId) await cleanup(svc, { jobId, projectId });
    if (winJobId) await cleanup(svc, { jobId: winJobId, projectId: winProjectId, rfqId: winRfqId });
  }
}
