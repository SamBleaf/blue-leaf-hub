/**
 * JOB-SPINE-01 — W04-API-02 + W06-API-03
 * persistRfqs must create jobs via POST /api/jobs (server spine), not browser Supabase insert.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";
import { WRITE, post, getAuthToken, serviceClient } from "./_helpers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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

function extractPersistRfqsBody(src) {
  const start = src.indexOf("async function persistRfqs");
  if (start < 0) return null;
  const nextFn = src.slice(start + 1).search(/\n  async function |\n  const [a-zA-Z]+ = useCallback|\n  function [a-zA-Z]+/);
  if (nextFn < 0) return src.slice(start);
  return src.slice(start, start + 1 + nextFn);
}

export async function runJobSpineSourceCheck(run) {
  run.section("JOB-SPINE-01 — persistRfqs source contract (W06-API-03)");

  const src = readFileSync(join(ROOT, "src/pages/RfqEngine.jsx"), "utf8");
  const body = extractPersistRfqsBody(src);
  if (!body) {
    run.fail("W06-API-03 persistRfqs located", "async function persistRfqs not found");
    return;
  }

  if (body.includes('.from("jobs").insert') || body.includes(".from('jobs').insert")) {
    run.fail(
      "W06-API-03 persistRfqs no direct Supabase jobs.insert",
      'persistRfqs still contains sb.from("jobs").insert — must use POST /api/jobs'
    );
  } else {
    run.pass("W06-API-03 persistRfqs has no direct Supabase jobs.insert");
  }

  if (body.includes('apiPost("/api/jobs"') || body.includes("apiPost('/api/jobs'")) {
    run.pass("W06-API-03 persistRfqs uses apiPost /api/jobs for job create");
  } else {
    run.fail("W06-API-03 persistRfqs apiPost /api/jobs", "missing apiPost('/api/jobs') in persistRfqs");
  }
}

export async function runJobSpineApiDedup(run) {
  run.section("JOB-SPINE-01 — POST /api/jobs dedup spine (W04-API-02)");

  if (!WRITE) {
    run.skip("W04-API-02 address dedup via server spine", "requires --write");
    run.gap("W04-API-02 (read-only)", "POST /api/jobs deduplicates on address_normalised");
    run.skip("W04-API-02 Address pending no dedup", "requires --write");
    run.gap("W04-API-02 pending (read-only)", "Address pending placeholder never dedupes");
    return;
  }

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    run.fail("JOB-SPINE-01 auth", e.message);
    return;
  }

  const svc = serviceClient();
  const ts = Date.now();
  const baseAddr = buildTestJobAddress({ suite: "W04", workflowId: "SPINE", ts });
  const variantAddr = baseAddr.replace(/\bRd\b/, "Road");

  const first = await post("/api/jobs", { address: baseAddr, status: "tendering" }, token);
  const firstId = first.body?.job?.id;
  if (first.status !== 200 || !firstId) {
    run.fail("W04-API-02 setup first job", `${first.status} ${JSON.stringify(first.body)}`);
    return;
  }

  const second = await post("/api/jobs", { address: variantAddr, status: "tendering" }, token);
  const secondId = second.body?.job?.id;
  if (second.body?.deduplicated === true && secondId === firstId) {
    run.pass("W04-API-02 POST /api/jobs deduplicates address variants (Rd vs Road)");
  } else {
    run.fail(
      "W04-API-02 address dedup",
      `expected deduplicated same id; got dedup=${second.body?.deduplicated} ids ${firstId}/${secondId}`
    );
  }

  if (svc) {
    const { data: row } = await svc.from("jobs").select("address_normalised").eq("id", firstId).single();
    if (row?.address_normalised) {
      run.pass("W04-API-02 job row has address_normalised stamped");
    } else {
      run.fail("W04-API-02 address_normalised", "missing on created job");
    }
  }

  const pendingA = await post("/api/jobs", { address: "Address pending", status: "tendering" }, token);
  const pendingB = await post("/api/jobs", { address: "Address pending", status: "tendering" }, token);
  const pendingAId = pendingA.body?.job?.id;
  const pendingBId = pendingB.body?.job?.id;

  if (pendingAId && pendingBId && pendingAId !== pendingBId && !pendingB.body?.deduplicated) {
    run.pass("W04-API-02 Address pending jobs do not dedupe");
  } else {
    run.fail(
      "W04-API-02 Address pending no dedup",
      `ids ${pendingAId}/${pendingBId} dedup=${pendingB.body?.deduplicated}`
    );
  }

  if (svc) {
    await cleanupJob(svc, firstId);
    await cleanupJob(svc, pendingAId);
    await cleanupJob(svc, pendingBId);
  }
}

export async function runW04W06JobSpine(run) {
  await runJobSpineSourceCheck(run);
  await runJobSpineApiDedup(run);
}
