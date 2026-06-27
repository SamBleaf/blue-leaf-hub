/**
 * W06-API-07 — Package snapshot failure after send is surfaced and recoverable (P0-B1)
 *
 * Proves (API/script level):
 * 1. Sent RFQs exist before package finalize (simulates engine send complete)
 * 2. Package snapshot POST can fail without creating rfq_packages row
 * 3. rfqs + correspondence counts unchanged after failed finalize (no resend)
 * 4. Retry POST succeeds without duplicating rfqs/correspondence
 * 5. Successful package links rfq_id on rfq_recipients
 *
 * UI recovery (warning banner + Retry package creation) — smoke: RfqEngine step 4 after send.
 * Pre-fix engine behaviour: resetRfqSession + success banner even when POST fails (W06-DRIFT-006).
 */
import {
  WRITE,
  MARK,
  post,
  getAuthToken,
  serviceClient,
} from "./_helpers.mjs";

async function cleanupPackage(svc, packageId, jobId, rfqIds = []) {
  if (!svc) return;
  if (packageId) {
    await svc.from("rfq_recipients").delete().eq("package_id", packageId);
    await svc.from("rfq_trade_scopes").delete().eq("package_id", packageId);
    await svc.from("rfq_packages").delete().eq("id", packageId);
  }
  for (const rfqId of rfqIds) {
    await svc.from("correspondence").delete().eq("rfq_id", rfqId);
    await svc.from("rfqs").delete().eq("id", rfqId);
  }
  if (jobId) await svc.from("jobs").delete().eq("id", jobId);
}

function packagePayload({ jobId, address, deadline, tradeId, tradeLabel, rfqId, email, ts }) {
  return {
    job_id: jobId,
    project_address: address,
    project_type: "renovation",
    tender_deadline: deadline,
    architect_client: "Test Architect",
    trade_scopes: [
      {
        trade_id: tradeId,
        trade_label: tradeLabel,
        scope_bullets: ["Install fixtures", "Pressure test"],
        recipients: [
          {
            subcontractor_id: null,
            business_name: "Test Plumber",
            email: email || `plumber-${ts}@example.test`,
            status: "sent",
            sent_at: new Date().toISOString(),
            email_subject: "RFQ Test",
            email_body: "Please quote",
            rfq_id: rfqId || null,
          },
        ],
      },
    ],
  };
}

export async function runW06Finalize(run) {
  run.section("W06-API-07 Package finalize failure + retry (P0-B1)");

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    run.fail("W06-API-07 auth", e.message);
    return;
  }

  if (!WRITE) {
    run.gap(
      "W06-API-07 package snapshot failure + retry",
      "requires --write; simulates engine send (rfqs row) then failed/successful POST /api/rfq-packages"
    );
    run.gap(
      "W06-API-07 UI recovery smoke",
      "manual/E2E: RfqEngine shows warning + Retry package creation; no success banner on finalize fail"
    );
    return;
  }

  const svc = serviceClient();
  if (!svc) {
    run.fail("W06-API-07 setup", "service role required");
    return;
  }

  const ts = Date.now();
  const address = `${MARK} W06 Finalize ${ts}`;
  const tradeId = "plumbing";
  const tradeLabel = "Plumbing";
  const deadline = "2026-12-31";
  let jobId = null;
  let rfqId = null;
  let packageId = null;

  try {
    const { body: jobBody } = await post(
      "/api/jobs",
      { address: `${ts} W06 Finalize St, Adelaide SA 5000`, status: "tendering" },
      token
    );
    jobId = jobBody?.job?.id;
    if (!jobId) {
      run.fail("W06-API-07 setup", "could not create job");
      return;
    }

    const { data: sub } = await svc.from("subcontractors").select("id, email, business_name").limit(1).single();
    if (!sub?.id) {
      run.skip("W06-API-07 simulated send", "no subcontractors row");
      return;
    }

    // Simulate engine send: one rfqs row + correspondence (emails already sent)
    const { data: rfqRow, error: rfqErr } = await svc
      .from("rfqs")
      .insert({
        job_id: jobId,
        subcontractor_id: sub.id,
        trade: tradeId,
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (rfqErr || !rfqRow?.id) {
      run.fail("W06-API-07 setup", `rfqs insert: ${rfqErr?.message || "no id"}`);
      return;
    }
    rfqId = rfqRow.id;

    await svc.from("correspondence").insert({
      rfq_id: rfqId,
      job_id: jobId,
      subcontractor_id: sub.id,
      direction: "outbound",
      subject: "RFQ Test",
      body: "Please quote",
    });

    const countRfqs = async () => {
      const { count } = await svc
        .from("rfqs")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId);
      return count || 0;
    };
    const countCorr = async () => {
      const { count } = await svc
        .from("correspondence")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId);
      return count || 0;
    };
    const countPackages = async () => {
      const { count } = await svc
        .from("rfq_packages")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId);
      return count || 0;
    };

    const rfqsBefore = await countRfqs();
    const corrBefore = await countCorr();
    const pkgBefore = await countPackages();

    run.pass(`W06-API-07 simulated send — ${rfqsBefore} rfq(s), ${corrBefore} correspondence row(s)`);

    // Failure mode: missing job_id (same class of error as finalizeAllSentPackage POST failure)
    const failPayload = packagePayload({
      jobId: null,
      address,
      deadline,
      tradeId,
      tradeLabel,
      rfqId,
      ts,
    });
    delete failPayload.job_id;

    const { status: failStatus, body: failBody } = await post("/api/rfq-packages", failPayload, token);
    if (failStatus !== 400 || failBody?.ok !== false) {
      run.fail(
        "W06-API-07 finalize failure surfaces error",
        `expected 400 ok:false; got ${failStatus} ${JSON.stringify(failBody)}`
      );
      return;
    }
    run.pass("W06-API-07 finalize failure returns 400 (not silent success)");

    const pkgAfterFail = await countPackages();
    if (pkgAfterFail !== pkgBefore) {
      run.fail("W06-API-07 no package on failed finalize", `packages ${pkgBefore} → ${pkgAfterFail}`);
      return;
    }
    run.pass("W06-API-07 failed finalize did not create rfq_packages row");

    const rfqsAfterFail = await countRfqs();
    const corrAfterFail = await countCorr();
    if (rfqsAfterFail !== rfqsBefore) {
      run.fail("W06-API-07 rfqs unchanged after failed finalize", `${rfqsBefore} → ${rfqsAfterFail}`);
      return;
    }
    if (corrAfterFail !== corrBefore) {
      run.fail("W06-API-07 correspondence unchanged after failed finalize", `${corrBefore} → ${corrAfterFail}`);
      return;
    }
    run.pass("W06-API-07 retry path does not duplicate rfqs or correspondence (failed attempt)");

    // Recovery: retry package creation only (no /api/rfq/send)
    const okPayload = packagePayload({
      jobId,
      address,
      deadline,
      tradeId,
      tradeLabel,
      rfqId,
      email: sub.email || `plumber-${ts}@example.test`,
      ts,
    });
    const { status: okStatus, body: okBody } = await post("/api/rfq-packages", okPayload, token);
    packageId = okBody?.packageId;
    if (okStatus !== 200 || !okBody?.ok || !packageId) {
      run.fail("W06-API-07 retry package create", `${okStatus} ${JSON.stringify(okBody)}`);
      return;
    }
    run.pass("W06-API-07 retry package create succeeded");

    const rfqsAfterRetry = await countRfqs();
    const corrAfterRetry = await countCorr();
    if (rfqsAfterRetry !== rfqsBefore) {
      run.fail("W06-API-07 rfqs unchanged after successful retry", `${rfqsBefore} → ${rfqsAfterRetry}`);
      return;
    }
    if (corrAfterRetry !== corrBefore) {
      run.fail(
        "W06-API-07 correspondence unchanged after successful retry",
        `${corrBefore} → ${corrAfterRetry}`
      );
      return;
    }
    run.pass("W06-API-07 successful retry did not resend or duplicate rfqs/correspondence");

    const { data: recipients } = await svc
      .from("rfq_recipients")
      .select("rfq_id, email, status")
      .eq("package_id", packageId);
    const linked = (recipients || []).find((r) => r.rfq_id === rfqId);
    if (!linked) {
      run.fail(
        "W06-API-07 recipient links rfq_id",
        `expected rfq_id ${rfqId}; got ${JSON.stringify(recipients)}`
      );
      return;
    }
    run.pass("W06-API-07 package recipient preserves rfq_id from engine send");

    run.gap(
      "W06-API-07 UI recovery smoke",
      "RfqEngine: warning banner + Retry package creation; session kept until success (not in script scope)"
    );
  } finally {
    await cleanupPackage(svc, packageId, jobId, rfqId ? [rfqId] : []);
  }
}
