/**
 * W04 — Estimate / Buildxact / Job Setup (Block 2: P0-A3, P0-A4)
 * W04-API-01, W04-API-05, W04-API-06
 */
import { WRITE, MARK, post, getAuthToken, serviceClient } from "./_helpers.mjs";

async function cleanupJob(svc, jobId) {
  if (!svc || !jobId) return;
  await svc.from("rfqs").delete().eq("job_id", jobId);
  const { data: pkgs } = await svc.from("rfq_packages").select("id").eq("job_id", jobId);
  for (const p of pkgs || []) {
    await svc.from("rfq_recipients").delete().eq("package_id", p.id);
    await svc.from("rfq_trade_scopes").delete().eq("package_id", p.id);
    await svc.from("rfq_packages").delete().eq("id", p.id);
  }
  await svc.from("jobs").delete().eq("id", jobId);
}

export async function runW04P0A3(run) {
  run.section("P0-A3 — Address pending RFQ/tender guard");

  if (!WRITE) {
    run.skip("W04-API-05 Address pending RFQ gate", "requires --write");
    run.gap("W04-API-05 (read-only)", "409 on POST /api/rfq-packages when job address is Address pending");
    return;
  }

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    run.fail("P0-A3 auth", e.message);
    return;
  }

  const svc = serviceClient();
  const ts = Date.now();

  const { body: pendingJob } = await post("/api/jobs", { address: "Address pending", status: "tendering" }, token);
  const pendingJobId = pendingJob?.job?.id;

  if (!pendingJobId) {
    run.fail("P0-A3 setup", "could not create Address pending job");
    return;
  }

  const pkg = await post(
    "/api/rfq-packages",
    { job_id: pendingJobId, project_address: `${MARK} Pending ${ts}`, trade_scopes: [] },
    token
  );

  if (pkg.status === 409 && pkg.body?.code === "JOB_ADDRESS_PENDING") {
    run.pass("W04-API-05 Address pending job blocked from RFQ package create (409)");
  } else {
    run.fail("W04-API-05 Address pending gate", `expected 409 JOB_ADDRESS_PENDING; got ${pkg.status} ${JSON.stringify(pkg.body)}`);
    if (pkg.body?.package?.id && svc) await svc.from("rfq_packages").delete().eq("id", pkg.body.package.id);
  }

  if (svc) await cleanupJob(svc, pendingJobId);
}

export async function runW04P0A4(run) {
  run.section("P0-A4 — RFQ extraction lead linkage");

  if (!WRITE) {
    run.skip("W04-API-06 extraction lead linkage", "requires --write");
    run.gap("W04-API-06 (read-only)", "POST /api/jobs with lead_id stamps jobs.lead_id + leads.job_id");
    return;
  }

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    run.fail("P0-A4 auth", e.message);
    return;
  }

  const svc = serviceClient();
  const ts = Date.now();

  const { body: leadBody } = await post(
    "/api/sales/leads",
    {
      first_name: "Extract",
      last_name: `Link${ts}`,
      email: `extract-${ts}@example.test`,
      site_address: `${ts} Extraction Ave, Adelaide SA 5000`,
      stage: "accepted",
    },
    token
  );
  const leadId = leadBody?.lead?.id;
  if (!leadId) {
    run.fail("P0-A4 setup", "could not create lead");
    return;
  }

  const convert = await post(`/api/sales/leads/${leadId}/convert-to-job`, {}, token);
  const convertJobId = convert.body?.job?.id;
  if (convert.status === 200 && convertJobId) {
    run.pass("W04-API-01 convert-to-job happy path");
  } else {
    run.fail("W04-API-01 convert-to-job", `${convert.status}`);
  }

  const extractionSim = await post(
    "/api/jobs",
    {
      address: `${MARK} Extraction Sim ${ts}`,
      lead_id: leadId,
      client_name: "Extract Link",
      status: "tendering",
    },
    token
  );
  const extJobId = extractionSim.body?.job?.id;

  if (extJobId && svc) {
    const { data: jobRow } = await svc.from("jobs").select("lead_id").eq("id", extJobId).single();
    const { data: leadRow } = await svc.from("leads").select("job_id").eq("id", leadId).single();
    if (jobRow?.lead_id === leadId) {
      run.pass("W04-API-06 POST /api/jobs stamps jobs.lead_id from lead context");
    } else {
      run.fail("W04-API-06 jobs.lead_id", `expected ${leadId}, got ${jobRow?.lead_id}`);
    }
    if (leadRow?.job_id === extJobId || leadRow?.job_id === convertJobId) {
      run.pass("W04-API-06 leads.job_id stamped (extraction or convert path)");
    } else {
      run.fail("W04-API-06 leads.job_id", `got ${leadRow?.job_id}`);
    }
    // W04-DRIFT-002 — POST /api/jobs now stamps identity facts with provenance.
    const { data: facts } = await svc
      .from("job_fact_history")
      .select("fact_key, source, reason")
      .eq("job_id", extJobId)
      .eq("reason", "job_create");
    if (facts?.some(f => f.fact_key === "client_name") && facts?.some(f => f.fact_key === "address")) {
      run.pass("W04-DRIFT-002 POST /api/jobs stamps identity facts (address + client_name) with provenance");
    } else {
      run.fail("W04-DRIFT-002 job-create provenance", `job_create facts: ${JSON.stringify(facts)}`);
    }
    await cleanupJob(svc, extJobId);
  }

  if (svc) {
    if (convertJobId) await cleanupJob(svc, convertJobId);
    await svc.from("leads").delete().eq("id", leadId);
  }
}

export async function runW04(run) {
  await runW04P0A3(run);
  await runW04P0A4(run);
}
