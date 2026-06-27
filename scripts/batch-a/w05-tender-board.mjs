/**
 * W05 — Tender Board / Lifecycle
 * P0-A5 — rfqs-only progress baseline (W05-DRIFT-003)
 * W05-API-05 — job-delete + rfq_packages (P0-A6 skeleton; not executed until approved)
 */
import { WRITE, MARK, post, getAuthToken, serviceClient } from "./_helpers.mjs";

/** Exact nested select used by TenderBoard.jsx load() — rfqs only, no rfq_packages. */
export const TENDER_BOARD_JOB_SELECT =
  "id, address, status, created_at, won_at, lost_at, dropbox_shared_link, dropbox_link, rfqs ( id, status, sent_at, received_at, reminder_sent_at )";

/** Mirror of TenderBoard.jsx quotesRingPct — documents rfqs-only limitation (P0-A5). */
export function quotesRingPct(rfqs) {
  if (!rfqs?.length) return 0;
  const got = rfqs.filter((r) => ["received", "accepted"].includes(r.status)).length;
  return Math.round((got / rfqs.length) * 100);
}

export function boardQuoteProgress(jobRow) {
  return quotesRingPct(jobRow?.rfqs || []);
}

async function loadBoardJob(svc, jobId) {
  const { data, error } = await svc
    .from("jobs")
    .select(TENDER_BOARD_JOB_SELECT)
    .eq("id", jobId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function runW05P0A5(run) {
  run.section("P0-A5 — Tender Board rfqs-only progress baseline");

  const svc = serviceClient();
  if (!svc) {
    run.skip("P0-A5 fixture tests", "SUPABASE_SERVICE_ROLE_KEY required");
    return;
  }

  if (!TENDER_BOARD_JOB_SELECT.includes("rfqs") || TENDER_BOARD_JOB_SELECT.includes("rfq_packages")) {
    run.fail("P0-A5 board query shape", "Expected rfqs nested select without rfq_packages");
  } else {
    run.pass("P0-A5 board query selects nested rfqs only (no rfq_packages)");
  }

  const rfqsPct = boardQuoteProgress({ rfqs: [{ status: "sent" }, { status: "received" }] });
  if (rfqsPct === 50) run.pass("P0-A5 job with rfqs rows → 50% quote progress (logic mirror)");
  else run.fail("P0-A5 rfqs progress logic", `expected 50%, got ${rfqsPct}`);

  const packageOnlyPct = boardQuoteProgress({ rfqs: [] });
  if (packageOnlyPct === 0) {
    run.gap(
      "P0-A5 package-only job → 0% on board (logic mirror)",
      "empty rfqs → 0% even when rfq_packages exist elsewhere (W05-DRIFT-003)"
    );
  } else {
    run.fail("P0-A5 package-only logic", `expected 0%, got ${packageOnlyPct}`);
  }

  if (!WRITE) {
    run.skip("P0-A5 W05-API-08 rfqs fixture job", "requires --write");
    run.skip("P0-A5 W05-API-08 package-only fixture job", "requires --write");
    run.gap(
      "P0-A5 DB fixture confirmation",
      "run npm run test:batch-a:write to seed rfqs vs package-only jobs and confirm via board query"
    );
    return;
  }

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    run.fail("P0-A5 auth", e.message);
    return;
  }

  const ts = Date.now();
  const created = { rfqsJobId: null, pkgJobId: null, subId: null };

  try {
    const { data: sub } = await svc.from("subcontractors").select("id").limit(1).single();
    created.subId = sub?.id;

    const { body: jobA } = await post(
      "/api/jobs",
      { address: `${MARK} RFQs Progress ${ts}`, status: "tendering" },
      token
    );
    created.rfqsJobId = jobA?.job?.id;

    if (!created.rfqsJobId) {
      run.fail("P0-A5 rfqs job setup", JSON.stringify(jobA));
    } else if (created.subId) {
      await svc.from("rfqs").insert([
        {
          job_id: created.rfqsJobId,
          subcontractor_id: created.subId,
          trade: "electrical",
          status: "sent",
          sent_at: new Date().toISOString(),
        },
        {
          job_id: created.rfqsJobId,
          subcontractor_id: created.subId,
          trade: "plumbing",
          status: "received",
          sent_at: new Date().toISOString(),
          received_at: new Date().toISOString(),
        },
      ]);
      const rowA = await loadBoardJob(svc, created.rfqsJobId);
      const pctA = boardQuoteProgress(rowA);
      if (pctA === 50) run.pass("P0-A5 W05-API-08 job with rfqs → 50% via board query");
      else run.fail("P0-A5 rfqs job progress", `expected 50%, got ${pctA}`);
    } else {
      run.skip("P0-A5 rfqs job DB fixture", "no subcontractors row");
    }

    const { body: jobB } = await post(
      "/api/jobs",
      { address: `${MARK} Package Only ${ts}`, status: "tendering" },
      token
    );
    created.pkgJobId = jobB?.job?.id;

    if (!created.pkgJobId) {
      run.fail("P0-A5 package-only job setup", JSON.stringify(jobB));
    } else {
      const { data: pkg } = await svc
        .from("rfq_packages")
        .insert({ job_id: created.pkgJobId, project_address: `${MARK} Pkg ${ts}`, status: "active" })
        .select("id")
        .single();

      if (pkg?.id && created.subId) {
        const { data: scope } = await svc
          .from("rfq_trade_scopes")
          .insert({
            package_id: pkg.id,
            trade_id: "electrical",
            trade_label: "Electrical",
            status: "received",
          })
          .select("id")
          .single();

        await svc.from("rfq_recipients").insert({
          package_id: pkg.id,
          trade_scope_id: scope?.id,
          subcontractor_id: created.subId,
          business_name: "P0-A5 Sub",
          email: "p0a5@example.test",
          status: "received",
        });
      }

      const { count: rfqCount } = await svc
        .from("rfqs")
        .select("id", { count: "exact", head: true })
        .eq("job_id", created.pkgJobId);
      const { count: pkgCount } = await svc
        .from("rfq_packages")
        .select("id", { count: "exact", head: true })
        .eq("job_id", created.pkgJobId);

      const rowB = await loadBoardJob(svc, created.pkgJobId);
      const pctB = boardQuoteProgress(rowB);

      if ((rfqCount || 0) === 0 && (pkgCount || 0) > 0 && pctB === 0) {
        run.gap(
          "P0-A5 W05-API-08 package-only job → 0% on board (confirmed)",
          `rfq_packages=${pkgCount} rfqs=${rfqCount} boardPct=${pctB}% — invisible (W05-DRIFT-003)`
        );
      } else if (pctB === 0) {
        run.gap("P0-A5 package-only → 0% board progress", `rfqs=${rfqCount} packages=${pkgCount}`);
      } else {
        run.fail("P0-A5 package-only invisible", `expected 0%; got ${pctB}%`);
      }
    }
  } finally {
    for (const jobId of [created.rfqsJobId, created.pkgJobId].filter(Boolean)) {
      await svc.from("rfqs").delete().eq("job_id", jobId);
      const { data: pkgs } = await svc.from("rfq_packages").select("id").eq("job_id", jobId);
      for (const p of pkgs || []) {
        await svc.from("rfq_recipients").delete().eq("package_id", p.id);
        await svc.from("rfq_trade_scopes").delete().eq("package_id", p.id);
        await svc.from("rfq_packages").delete().eq("id", p.id);
      }
      await svc.from("jobs").delete().eq("id", jobId);
    }
  }
}


/** Cleanup helper shared by P0-A5/P0-A6 fixtures. */
async function cleanupJobWithPackages(svc, jobId) {
  if (!jobId || !svc) return;
  await svc.from("rfqs").delete().eq("job_id", jobId);
  const { data: pkgs } = await svc.from("rfq_packages").select("id").eq("job_id", jobId);
  for (const p of pkgs || []) {
    await svc.from("rfq_recipients").delete().eq("package_id", p.id);
    await svc.from("rfq_trade_scopes").delete().eq("package_id", p.id);
    await svc.from("rfq_packages").delete().eq("id", p.id);
  }
  await svc.from("jobs").delete().eq("id", jobId);
}

/**
 * P0-A6 — job-delete blocked when rfq_packages or rfqs exist (W05-DRIFT-008, SAM-W05-003).
 */
export async function runW05P0A6(run) {
  run.section("P0-A6 — job-delete with rfq_packages / rfqs rule");

  if (!WRITE) {
    run.skip("W05-API-05 job-delete blocked with rfq_packages", "requires --write");
    run.skip("W05-API-05 job-delete allowed without RFQ data", "requires --write");
    run.gap(
      "W05-API-05 job-delete rule (read-only)",
      "POST /api/tender/job-delete returns 409 when rfq_packages or rfqs linked — run with --write"
    );
    return;
  }

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    run.fail("P0-A6 auth", e.message);
    return;
  }

  const svc = serviceClient();
  if (!svc) {
    run.skip("P0-A6", "service role required");
    return;
  }

  const ts = Date.now();

  // ── Blocked: job + rfq_package ───────────────────────────────────────────
  const { body: pkgJobBody } = await post(
    "/api/jobs",
    { address: `${MARK} P0A6 Pkg Block ${ts}`, status: "tendering" },
    token
  );
  const pkgJobId = pkgJobBody?.job?.id;

  if (pkgJobId) {
    await svc
      .from("rfq_packages")
      .insert({ job_id: pkgJobId, project_address: `${MARK} pkg ${ts}`, status: "active" });

    const delPkg = await post("/api/tender/job-delete", { jobId: pkgJobId }, token);
    const { data: jobAfter } = await svc.from("jobs").select("id").eq("id", pkgJobId).maybeSingle();

    if (delPkg.status === 409 && delPkg.body?.ok === false && jobAfter?.id === pkgJobId) {
      run.pass("W05-API-05 job-delete blocked when rfq_packages linked (409)");
    } else {
      run.fail(
        "W05-API-05 job-delete with rfq_packages",
        `expected 409 + job preserved; got status=${delPkg.status} jobExists=${!!jobAfter?.id}`
      );
    }
    await cleanupJobWithPackages(svc, pkgJobId);
  }

  // ── Blocked: job + legacy rfqs ───────────────────────────────────────────
  const { data: sub } = await svc.from("subcontractors").select("id").limit(1).single();
  const { body: rfqJobBody } = await post(
    "/api/jobs",
    { address: `${MARK} P0A6 RFQ Block ${ts}`, status: "tendering" },
    token
  );
  const rfqJobId = rfqJobBody?.job?.id;

  if (rfqJobId && sub?.id) {
    await svc.from("rfqs").insert({
      job_id: rfqJobId,
      subcontractor_id: sub.id,
      trade: "electrical",
      status: "sent",
      sent_at: new Date().toISOString(),
    });

    const delRfq = await post("/api/tender/job-delete", { jobId: rfqJobId }, token);
    const { data: jobAfter } = await svc.from("jobs").select("id").eq("id", rfqJobId).maybeSingle();

    if (delRfq.status === 409 && jobAfter?.id === rfqJobId) {
      run.pass("W05-API-05 job-delete blocked when rfqs linked (409)");
    } else {
      run.fail("W05-API-05 job-delete with rfqs", `status=${delRfq.status} jobExists=${!!jobAfter?.id}`);
    }
    await cleanupJobWithPackages(svc, rfqJobId);
  } else if (!sub?.id) {
    run.skip("W05-API-05 rfqs block test", "no subcontractors row");
  }

  // ── Allowed: clean draft job (no packages, no rfqs) ──────────────────────
  const { body: cleanJobBody } = await post(
    "/api/jobs",
    { address: `${MARK} P0A6 Clean ${ts}`, status: "tendering" },
    token
  );
  const cleanJobId = cleanJobBody?.job?.id;

  if (cleanJobId) {
    const delClean = await post("/api/tender/job-delete", { jobId: cleanJobId }, token);
    const { data: jobAfter } = await svc.from("jobs").select("id").eq("id", cleanJobId).maybeSingle();

    if (delClean.status === 200 && delClean.body?.ok && !jobAfter) {
      run.pass("W05-API-05 job-delete succeeds for job without RFQ packages or quotes");
    } else {
      run.fail("W05-API-05 clean job delete", `status=${delClean.status} jobStillExists=${!!jobAfter}`);
      await cleanupJobWithPackages(svc, cleanJobId);
    }
  }
}

export async function runW05(run) {
  await runW05P0A6(run);
}
