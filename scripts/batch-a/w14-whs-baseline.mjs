/**
 * P0-C5 — WHS profile + induction baseline + SEC gap closure
 *
 * Proves:
 * - W14-API-01 profile save creates/updates whs_site_profiles
 * - W14-API-02 generate management plan after profile
 * - W14-API-03 public induction submit links to correct project only
 * - W14-SEC-01 invalid UUID → 404, no unrelated project leak
 * - W14-SEC-02 admin/supervisor can manage WHS profile
 * - W14-SEC-03 employee cannot PUT profile or generate docs
 * - W14-API-05 win does not auto-create WHS profile
 */
import { createClient } from "@supabase/supabase-js";
import {
  WRITE,
  API,
  SB_URL,
  SB_ANON,
  post,
  get,
  getAuthToken,
  serviceClient,
} from "./_helpers.mjs";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";
import { ensureE2EUsers } from "../create-e2e-users.mjs";

const E2E_PASSWORD = "BlueLeaf-E2E-2026!";

const MIN_SIGNATURE =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==";

const SAMPLE_ANSWERS = {
  m0_project_type: "new_home",
  m5_work_at_heights: "yes",
  m2_first_aid_location: "BLH TEST site shed",
  assembly_point: "Front carpark",
  site_fenced: "yes",
};

const INDUCTION_PAYLOAD = {
  personName: "BLH TEST Visitor",
  company: "BLH TEST Co",
  trade: "Working at Heights",
  mobile: "0400000000",
  emergencyContactName: "Emergency Contact",
  emergencyContactPhone: "0400000001",
  siteRulesAcknowledged: true,
  swmsAcknowledged: true,
  signatureDataUrl: MIN_SIGNATURE,
};

async function put(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function getTokenForEmail(email, password = E2E_PASSWORD) {
  if (!SB_URL || !SB_ANON) throw new Error("Missing Supabase URL or anon key");
  const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    throw new Error(error?.message || `No session for ${email}`);
  }
  return data.session.access_token;
}

async function cleanup(svc, { jobId, projectId, rfqId }) {
  if (!svc) return;
  if (projectId) {
    await svc.from("site_inductions").delete().eq("project_id", projectId);
    await svc.from("whs_documents").delete().eq("project_id", projectId);
    await svc.from("whs_site_profiles").delete().eq("project_id", projectId);
    await svc.from("project_swms").delete().eq("project_id", projectId);
    await svc.from("projects").delete().eq("id", projectId);
  }
  if (rfqId) await svc.from("rfqs").delete().eq("id", rfqId);
  if (jobId) await svc.from("jobs").delete().eq("id", jobId);
}

async function createProjectFixture(adminToken, ts) {
  const address = buildTestJobAddress({ suite: "W14", workflowId: "WHS", ts });
  const { status, body } = await post("/api/jobs", { address, status: "active" }, adminToken);
  const jobId = body?.job?.id;
  if (status !== 200 || !jobId) throw new Error(`job create failed: ${status}`);

  const svc = serviceClient();
  const { data: project, error } = await svc
    .from("projects")
    .insert({ job_id: jobId, address, status: "active" })
    .select("id")
    .single();
  if (error || !project?.id) throw new Error(error?.message || "project insert failed");

  return { jobId, projectId: project.id, address };
}

async function winFinalizeMinimal(adminToken, svc, jobId) {
  const { data: sub } = await svc.from("subcontractors").select("id, business_name, contact, email, mobile").limit(1).single();
  if (!sub?.id) throw new Error("no subcontractors row");

  const { data: rfqRow } = await svc
    .from("rfqs")
    .insert({ job_id: jobId, subcontractor_id: sub.id, trade: "plumbing", status: "accepted", quote_amount: 9000 })
    .select("id")
    .single();
  const rfqId = rfqRow?.id;
  if (!rfqId) throw new Error("rfq insert failed");

  const { status, body } = await post(
    "/api/tender/win-finalize",
    {
      jobId,
      rfqUpdates: [{ id: rfqId, status: "accepted", quote_amount: 9000 }],
      acceptedTrades: [{
        trade: "plumbing",
        subcontractor: sub.business_name,
        contact: sub.contact,
        email: sub.email,
        phone: sub.mobile,
        quote_amount: 9000,
        subcontractor_id: sub.id,
        rfq_id: rfqId,
      }],
      quoteCopies: [],
      emails: [],
      costIntel: {},
    },
    adminToken
  );
  if (status !== 200 || !body?.ok) throw new Error(`win-finalize failed: ${status}`);
  return { rfqId, projectId: body?.project?.id || null };
}

export async function runW14WhsBaseline(run) {
  run.section("P0-C5 — WHS profile + induction baseline (W14)");

  if (!WRITE) {
    run.gap("W14-API-01 profile save", "requires --write");
    run.gap("W14-API-02 generate management plan", "requires --write");
    run.gap("W14-API-03 induction project linkage", "requires --write");
    run.gap("W14-SEC-01 invalid UUID no leak", "requires --write");
    run.gap("W14-SEC-02 admin/supervisor profile write", "requires --write");
    run.gap("W14-SEC-03 employee profile write blocked", "requires --write");
    run.gap("W14-API-05 win does not auto-create profile", "requires --write");
    return;
  }

  const svc = serviceClient();
  if (!svc) {
    run.fail("W14 setup", "service role required");
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
    run.fail("W14 setup auth", e.message);
    return;
  }

  const ts = Date.now();
  let jobId = null;
  let projectId = null;
  let jobIdB = null;
  let projectIdB = null;
  let secretAddress = null;
  let winJobId = null;
  let winProjectId = null;
  let winRfqId = null;

  try {
    const fixture = await createProjectFixture(adminToken, ts);
    jobId = fixture.jobId;
    projectId = fixture.projectId;
    secretAddress = fixture.address;

    const fixtureB = await createProjectFixture(adminToken, `${ts}-b`);
    jobIdB = fixtureB.jobId;
    projectIdB = fixtureB.projectId;

    run.section("W14-SEC-01 invalid / non-existent project UUID");

    const bogusId = "00000000-0000-0000-0000-000000000099";
    const { status: badInfoStatus, body: badInfoBody } = await get(`/api/induction/${bogusId}/info`, null);
    const leakedAddress = JSON.stringify(badInfoBody).includes(secretAddress);

    if (badInfoStatus === 404 && badInfoBody?.ok === false) {
      run.pass("W14-SEC-01 GET info for non-existent UUID returns 404");
    } else {
      run.fail("W14-SEC-01 bad info status", `status=${badInfoStatus} body=${JSON.stringify(badInfoBody)}`);
    }

    if (!leakedAddress) {
      run.pass("W14-SEC-01 404 response does not leak unrelated project address");
    } else {
      run.fail("W14-SEC-01 address leak", "unrelated project address found in 404 body");
    }

    const { status: badSubmitStatus } = await post(
      `/api/induction/${bogusId}/submit`,
      { ...INDUCTION_PAYLOAD, personName: "BLH TEST Bogus" },
      null
    );
    const { count: bogusInductCount } = await svc
      .from("site_inductions")
      .select("id", { count: "exact", head: true })
      .eq("person_name", "BLH TEST Bogus");

    if (badSubmitStatus === 404 && bogusInductCount === 0) {
      run.pass("W14-SEC-01 POST submit to non-existent UUID returns 404, no row");
    } else {
      run.fail("W14-SEC-01 bad submit", `status=${badSubmitStatus} rows=${bogusInductCount}`);
    }

    run.section("W14-API-01 / W14-SEC-02 profile save");

    const { status: saveStatus, body: saveBody } = await put(
      `/api/whs/projects/${projectId}/profile`,
      { answers: SAMPLE_ANSWERS, status: "complete" },
      adminToken
    );

    const { data: profileRow } = await svc
      .from("whs_site_profiles")
      .select("id, version, status")
      .eq("project_id", projectId)
      .maybeSingle();

    if (saveStatus === 200 && saveBody?.ok === true && profileRow?.id && profileRow.version === 1) {
      run.pass("W14-API-01 admin PUT profile creates whs_site_profiles row");
    } else {
      run.fail("W14-API-01 profile create", `status=${saveStatus} row=${JSON.stringify(profileRow)}`);
    }

    const { status: supSaveStatus, body: supSaveBody } = await put(
      `/api/whs/projects/${projectId}/profile`,
      { answers: { ...SAMPLE_ANSWERS, m5_roof_work: "yes" } },
      supervisorToken
    );
    const { data: profileRow2 } = await svc
      .from("whs_site_profiles")
      .select("version")
      .eq("project_id", projectId)
      .single();

    if (supSaveStatus === 200 && supSaveBody?.ok && profileRow2?.version === 2) {
      run.pass("W14-SEC-02 supervisor PUT profile returns 200");
    } else {
      run.fail("W14-SEC-02 supervisor profile", `status=${supSaveStatus} version=${profileRow2?.version}`);
    }

    run.section("W14-SEC-03 employee cannot alter WHS profile");

    const { status: empPutStatus, body: empPutBody } = await put(
      `/api/whs/projects/${projectId}/profile`,
      { answers: { ...SAMPLE_ANSWERS, m5_demolition: "yes" } },
      employeeToken
    );

    const { data: afterEmpProfile } = await svc
      .from("whs_site_profiles")
      .select("version")
      .eq("project_id", projectId)
      .single();

    if (empPutStatus === 403 && empPutBody?.ok === false) {
      run.pass("W14-SEC-03 employee PUT profile returns 403");
    } else {
      run.fail("W14-SEC-03 employee PUT profile", `expected 403; got ${empPutStatus}`);
    }

    if (afterEmpProfile?.version === 2) {
      run.pass("W14-SEC-03 employee PUT did not mutate whs_site_profiles");
    } else {
      run.fail("W14-SEC-03 employee mutation", `version=${afterEmpProfile?.version}`);
    }

    const { status: empGenStatus, body: empGenBody } = await post(
      `/api/whs/projects/${projectId}/generate/project_whs_management_plan`,
      {},
      employeeToken
    );
    if (empGenStatus === 403 && empGenBody?.ok === false) {
      run.pass("W14-SEC-03 employee POST generate returns 403");
    } else {
      run.fail("W14-SEC-03 employee generate", `expected 403; got ${empGenStatus}`);
    }

    run.section("W14-API-02 generate Project WHS Management Plan");

    const { status: genStatus, body: genBody } = await post(
      `/api/whs/projects/${projectId}/generate/project_whs_management_plan`,
      {},
      adminToken
    );
    const { count: docCount } = await svc
      .from("whs_documents")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("template_key", "project_whs_management_plan");

    if (genStatus === 200 && genBody?.ok === true && docCount >= 1) {
      run.pass("W14-API-02 admin generate creates whs_documents snapshot");
    } else {
      run.fail("W14-API-02 generate plan", `status=${genStatus} docs=${docCount}`);
    }

    run.section("W14-API-03 public induction project linkage");

    const { status: infoStatus, body: infoBody } = await get(`/api/induction/${projectId}/info`, null);
    if (infoStatus === 200 && infoBody?.ok === true && infoBody?.address === secretAddress) {
      run.pass("W14-SEC-01 valid UUID GET info returns only that project address");
    } else {
      run.fail("W14-API-03 induction info address", `status=${infoStatus} address=${infoBody?.address}`);
    }

    const { status: submitStatus, body: submitBody } = await post(
      `/api/induction/${projectId}/submit`,
      INDUCTION_PAYLOAD,
      null
    );

    const { count: inductCountA } = await svc
      .from("site_inductions")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("person_name", "BLH TEST Visitor");

    const { count: inductCountB } = await svc
      .from("site_inductions")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectIdB)
      .eq("person_name", "BLH TEST Visitor");

    if (submitStatus === 200 && submitBody?.ok === true && inductCountA === 1 && inductCountB === 0) {
      run.pass("W14-API-03 submit creates row on supplied projectId only");
    } else {
      run.fail("W14-API-03 linkage", `status=${submitStatus} A=${inductCountA} B=${inductCountB}`);
    }

    const crossPayload = { ...INDUCTION_PAYLOAD, personName: "BLH TEST Cross Project" };
    const { status: crossStatus } = await post(`/api/induction/${projectIdB}/submit`, crossPayload, null);

    const { count: crossOnB } = await svc
      .from("site_inductions")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectIdB)
      .eq("person_name", "BLH TEST Cross Project");

    const { count: crossOnA } = await svc
      .from("site_inductions")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("person_name", "BLH TEST Cross Project");

    if (crossStatus === 200 && crossOnB === 1 && crossOnA === 0) {
      run.pass("W14-API-03 second project submit isolated to project B");
    } else {
      run.fail("W14-API-03 cross isolation", `B=${crossOnB} A=${crossOnA}`);
    }

    run.section("W14-API-05 win does not auto-create WHS profile");

    const winFixture = await createProjectFixture(adminToken, `${ts}-win`);
    winJobId = winFixture.jobId;
    const { count: beforeWinProfiles } = await svc
      .from("whs_site_profiles")
      .select("id", { count: "exact", head: true })
      .eq("project_id", winFixture.projectId);

    const winResult = await winFinalizeMinimal(adminToken, svc, winJobId);
    winRfqId = winResult.rfqId;
    winProjectId = winResult.projectId || winFixture.projectId;

    const { count: afterWinProfiles } = await svc
      .from("whs_site_profiles")
      .select("id", { count: "exact", head: true })
      .eq("project_id", winProjectId);

    if (beforeWinProfiles === 0 && afterWinProfiles === 0) {
      run.pass("W14-API-05 win-finalize did not create whs_site_profiles");
    } else {
      run.fail("W14-API-05 auto profile on win", `before=${beforeWinProfiles} after=${afterWinProfiles}`);
    }

    const { status: postWinSave } = await put(
      `/api/whs/projects/${winProjectId}/profile`,
      { answers: SAMPLE_ANSWERS },
      adminToken
    );
    const { count: postWinProfile } = await svc
      .from("whs_site_profiles")
      .select("id", { count: "exact", head: true })
      .eq("project_id", winProjectId);

    if (postWinSave === 200 && postWinProfile === 1) {
      run.pass("W14-API-05 manual profile save still works after win");
    } else {
      run.fail("W14-API-05 manual after win", `status=${postWinSave} profiles=${postWinProfile}`);
    }
  } catch (e) {
    run.fail("W14 unexpected", e.message);
  } finally {
    if (jobIdB) await cleanup(svc, { jobId: jobIdB, projectId: projectIdB });
    if (jobId) await cleanup(svc, { jobId, projectId });
    if (winJobId) await cleanup(svc, { jobId: winJobId, projectId: winProjectId, rfqId: winRfqId });
  }
}
