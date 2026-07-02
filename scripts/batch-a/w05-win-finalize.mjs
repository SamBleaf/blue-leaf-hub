/**
 * TEST-WIN-FINALIZE-01 — Win / lose finalize baseline (W05-API-01/02, W09-API-01/03, RFQ-16)
 *
 * Proves:
 * - POST /api/tender/win-finalize validation + side effects (rfqs, jobs, projects, cost_intelligence)
 * - POST /api/tender/lose-finalize side effects
 * - Idempotent project enrich on re-run (projects count stable)
 * - cost_intelligence duplicate behaviour on re-run (gap-document if inserts duplicate)
 * - Lead sync gap (W09-DRIFT-004)
 */
import {
  WRITE,
  MARK,
  post,
  patch,
  get,
  getAuthToken,
  serviceClient,
} from "./_helpers.mjs";

async function cleanupWinJob(svc, { jobId, projectId, leadId, rfqIds = [] }) {
  if (!svc) return;
  if (jobId) {
    await svc.from("cost_intelligence").delete().eq("job_id", jobId);
    await svc.from("procurement_items").delete().eq("job_id", jobId);
    for (const rfqId of rfqIds) {
      await svc.from("rfqs").delete().eq("id", rfqId);
    }
  }
  if (projectId) {
    await svc.from("purchase_orders").delete().eq("project_id", projectId);
    await svc.from("schedule_tasks").delete().eq("project_id", projectId);
    await svc.from("whs_site_profiles").delete().eq("project_id", projectId);
    await svc.from("projects").delete().eq("id", projectId);
  }
  if (jobId) await svc.from("jobs").delete().eq("id", jobId);
  if (leadId) await svc.from("leads").delete().eq("id", leadId);
}

async function createTenderJob(token, ts, extra = {}) {
  const { body } = await post(
    "/api/jobs",
    {
      address: `${MARK} W05 Win ${ts} St, Adelaide SA 5000`,
      status: "tendering",
      ...extra,
    },
    token
  );
  return body?.job?.id || null;
}

function buildWinPayload({ jobId, rfqId, sub, tradeId, quoteAmount, tentativeStart = null }) {
  const rfqUpdates = [{ id: rfqId, status: "accepted", quote_amount: quoteAmount }];
  const acceptedTrades = [
    {
      trade: tradeId,
      subcontractor: sub.business_name,
      contact: sub.contact,
      email: sub.email,
      phone: sub.mobile,
      quote_amount: quoteAmount,
      subcontractor_id: sub.id,
      rfq_id: rfqId,
    },
  ];
  return {
    jobId,
    rfqUpdates,
    acceptedTrades,
    quoteCopies: [],
    tentative_start_date: tentativeStart,
    emails: [],
    costIntel: { storeys: 2, notes: `${MARK} win-finalize test` },
  };
}

async function winFinalize(token, payload) {
  return post("/api/tender/win-finalize", payload, token);
}

async function loseFinalize(token, jobId, emails = []) {
  return post("/api/tender/lose-finalize", { jobId, emails }, token);
}

function itemStatus(body, id) {
  return (body?.items || []).find((i) => i.id === id)?.status;
}

export async function runW05WinFinalize(run) {
  run.section("W05-API-01 / W09-API-01 / RFQ-16 — win-finalize");

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    run.fail("W05-win auth", e.message);
    return;
  }

  if (!WRITE) {
    run.gap("W05-API-01 win-finalize side effects", "requires --write");
    run.gap("W05-API-02 lose-finalize", "requires --write");
    run.gap("W09-API-01 project creation/enrichment", "requires --write");
    run.gap("W09-API-03 jobs.status=won + won_at", "requires --write");
    run.gap("RFQ-16 win-finalize", "requires --write");
    run.gap("Win-finalize idempotent project re-run", "requires --write");
    run.gap("W09-API-04 lead sync gap", "requires --write");
    return;
  }

  const svc = serviceClient();
  if (!svc) {
    run.fail("W05-win setup", "service role required");
    return;
  }

  const ts = Date.now();
  const tradeId = "electrical";
  const quoteAmount = 16800;

  // ── Validation ──────────────────────────────────────────────────────────────
  {
    const bad = await winFinalize(token, { jobId: "", rfqUpdates: [] });
    if (bad.status === 400 && bad.body?.error) {
      run.pass("W05-API-01 win-finalize requires jobId and rfqUpdates[]");
    } else {
      run.fail("W05-API-01 validation", `${bad.status} ${JSON.stringify(bad.body)}`);
    }
  }

  let jobId = null;
  let projectId = null;
  let rfqId = null;
  let leadId = null;

  try {
    const { data: sub } = await svc
      .from("subcontractors")
      .select("id, business_name, contact, email, mobile")
      .limit(1)
      .single();
    if (!sub?.id) {
      run.skip("W05-win setup", "no subcontractors");
      return;
    }

    jobId = await createTenderJob(token, ts, {
      client_name: "Win Test Client",
      client_email: "win-test@example.test",
    });
    if (!jobId) {
      run.fail("W05-win setup", "job create failed");
      return;
    }

    const { data: rfqRow } = await svc
      .from("rfqs")
      .insert({
        job_id: jobId,
        subcontractor_id: sub.id,
        trade: tradeId,
        status: "received",
        quote_amount: quoteAmount,
        quoted_amount: quoteAmount - 500,
      })
      .select("id")
      .single();
    rfqId = rfqRow?.id;
    if (!rfqId) {
      run.fail("W05-win setup", "rfq insert failed");
      return;
    }

    // Lead linked — win should NOT sync stage (W09-DRIFT-004)
    const { body: leadBody } = await post(
      "/api/sales/leads",
      {
        first_name: "Win",
        last_name: "Finalize",
        stage: "tender",
        lead_source: "referral", // mig 127: lead_source_category required on create
        site_address: `${MARK} W05 Lead ${ts}, Adelaide SA 5000`,
      },
      token
    );
    leadId = leadBody?.lead?.id;
    if (leadId) {
      await svc.from("jobs").update({ lead_id: leadId }).eq("id", jobId);
      await svc.from("leads").update({ job_id: jobId }).eq("id", leadId);
    }

    // Pre-win: PATCH accept (TenderDetail path) then win-finalize
    run.section("Pre-win accept → win-finalize chain");

    const acceptRes = await patch(
      `/api/rfq/${rfqId}`,
      { status: "accepted", quote_amount: quoteAmount },
      token
    );
    if (acceptRes.status !== 200 || !acceptRes.body?.ok) {
      run.fail("Pre-win PATCH accept", `${acceptRes.status} ${JSON.stringify(acceptRes.body)}`);
      return;
    }
    run.pass("Pre-win accepted rfq available before win-finalize");

    const winQuote = await get(`/api/tender/${jobId}/win-quote-readiness`, token);
    if (winQuote.status === 200 && winQuote.body?.ok && !winQuote.body?.hasWarnings) {
      run.pass("Pre-win win-quote-readiness clean before finalize");
    } else {
      run.gap(
        "Pre-win win-quote-readiness",
        `hasWarnings=${winQuote.body?.hasWarnings} warnings=${JSON.stringify(winQuote.body?.warnings)}`
      );
    }

    const { status: finStatus, body: finBody } = await winFinalize(
      token,
      buildWinPayload({ jobId, rfqId, sub, tradeId, quoteAmount, tentativeStart: "2026-09-01" })
    );
    projectId = finBody?.project?.id;
    if (finStatus !== 200 || !finBody?.ok || !projectId) {
      run.fail("RFQ-16 / W05-API-01 win-finalize", `${finStatus} ${JSON.stringify(finBody)}`);
      return;
    }
    run.pass("RFQ-16 POST /api/tender/win-finalize returns ok + project");
    run.pass("W05-API-01 win-finalize succeeds with accepted trade payload");

    // ── W09-API-03 jobs won ───────────────────────────────────────────────────
    const { data: jobAfter } = await svc
      .from("jobs")
      .select("status, won_at")
      .eq("id", jobId)
      .single();
    if (jobAfter?.status !== "won" || !jobAfter?.won_at) {
      run.fail("W09-API-03 jobs.status=won", JSON.stringify(jobAfter));
    } else {
      run.pass("W09-API-03 win-finalize sets jobs.status=won and won_at");
    }

    // ── W09-API-01 project enrich ─────────────────────────────────────────────
    const { data: proj } = await svc
      .from("projects")
      .select("id, job_id, status, accepted_trades, portal_client_name, portal_client_email, tentative_start_date")
      .eq("id", projectId)
      .single();

    if (proj?.job_id !== jobId || proj?.status !== "active") {
      run.fail("W09-API-01 project row", JSON.stringify(proj));
    } else {
      run.pass("W09-API-01 win-finalize creates/enriches projects row (096 trigger + enrich)");
    }

    if (proj?.portal_client_name === "Win Test Client" && proj?.portal_client_email === "win-test@example.test") {
      run.pass("W09-API-01 portal client fields stamped from job at win");
    } else {
      run.gap(
        "W09-API-01 portal client stamp",
        `name=${proj?.portal_client_name} email=${proj?.portal_client_email}`
      );
    }

    const acceptedTrades = Array.isArray(proj?.accepted_trades) ? proj.accepted_trades : [];
    if (acceptedTrades.some((t) => String(t.trade) === tradeId && Number(t.quote_amount) === quoteAmount)) {
      run.pass("W09-API-01 accepted_trades jsonb stored on project");
    } else {
      run.fail("W09-API-01 accepted_trades", JSON.stringify(acceptedTrades));
    }

    // ── rfqs updated ──────────────────────────────────────────────────────────
    const { data: rfqAfter } = await svc
      .from("rfqs")
      .select("status, quote_amount")
      .eq("id", rfqId)
      .single();
    if (rfqAfter?.status !== "accepted" || Number(rfqAfter?.quote_amount) !== quoteAmount) {
      run.fail("W05-API-01 rfqs patch via win-finalize", JSON.stringify(rfqAfter));
    } else {
      run.pass("W05-API-01 win-finalize updates rfqs.status and quote_amount");
    }

    // ── cost_intelligence ─────────────────────────────────────────────────────
    const { data: ciRows } = await svc
      .from("cost_intelligence")
      .select("trade, quote_amount, source, notes")
      .eq("job_id", jobId);
    const ciTrade = (ciRows || []).find((r) => r.trade === tradeId);
    if (ciTrade && Number(ciTrade.quote_amount) === quoteAmount) {
      run.pass("W09-API-01 cost_intelligence seeded for accepted trade with quote_amount > 0");
    } else {
      run.fail("W09-API-01 cost_intelligence", JSON.stringify(ciRows));
    }

    // ── W09-DRIFT-004 lead sync gap ───────────────────────────────────────────
    if (leadId) {
      const { data: leadAfter } = await svc.from("leads").select("stage, won_at").eq("id", leadId).single();
      if (leadAfter?.stage === "tender" && !leadAfter?.won_at) {
        run.gap(
          "W09-API-04 lead sync on win",
          `lead stage still tender — win-finalize does not sync leads (W09-DRIFT-004 / W05-DRIFT-004)`
        );
      } else {
        run.gap("W09-API-04 lead sync", `unexpected lead state ${JSON.stringify(leadAfter)} — review drift doc`);
      }
    }

    // ── Ops readiness (procurement/schedule/WHS not auto-created) ─────────────
    run.section("Post-win ops readiness (checklist only)");

    const { status: readyStatus, body: readyBody } = await get(
      `/api/projects/${projectId}/ops-readiness`,
      token
    );
    if (readyStatus !== 200 || !readyBody?.ok) {
      run.fail("Post-win ops-readiness", `${readyStatus}`);
      return;
    }

    if (itemStatus(readyBody, "project_created") === "ok") {
      run.pass("Post-win ops-readiness — project_created ok");
    } else {
      run.fail("Post-win ops-readiness project_created", itemStatus(readyBody, "project_created"));
    }

    const opsMissing = ["procurement_generated", "schedule_exists", "whs_profile"].some(
      (id) => itemStatus(readyBody, id) !== "ok"
    );
    if (opsMissing) {
      run.gap(
        "Post-win procurement/schedule/WHS not auto-created",
        "win-finalize does not generate procurement/schedule/WHS — staff setup required (W09-DRIFT-007)"
      );
    } else {
      run.pass("Post-win ops items unexpectedly all ok — review if win-finalize scope expanded");
    }

    // ── Idempotent re-run ───────────────────────────────────────────────────
    run.section("Win-finalize idempotent re-run");

    const { count: projCountBefore } = await svc
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId);

    const { count: ciCountBefore } = await svc
      .from("cost_intelligence")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId);

    const rerun = await winFinalize(
      token,
      buildWinPayload({ jobId, rfqId, sub, tradeId, quoteAmount })
    );
    if (rerun.status !== 200 || !rerun.body?.ok) {
      run.fail("Win-finalize re-run", `${rerun.status} ${JSON.stringify(rerun.body)}`);
    } else {
      run.pass("Win-finalize re-run returns ok (idempotent project enrich)");
    }

    const { count: projCountAfter } = await svc
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId);

    if (projCountAfter === projCountBefore && projCountAfter === 1) {
      run.pass("Win-finalize re-run does not duplicate projects row");
    } else {
      run.fail("Win-finalize project idempotency", `${projCountBefore} → ${projCountAfter}`);
    }

    const { count: ciCountAfter } = await svc
      .from("cost_intelligence")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId);

    if (ciCountAfter > ciCountBefore) {
      run.fail(
        "DISC-WIN-01 win-finalize cost_intelligence idempotency",
        `${ciCountBefore} → ${ciCountAfter} — re-run duplicated cost_intelligence rows (must stay stable)`
      );
    } else {
      run.pass("DISC-WIN-01 win-finalize re-run did not duplicate cost_intelligence rows");
    }
  } finally {
    await cleanupWinJob(svc, { jobId, projectId, leadId, rfqIds: rfqId ? [rfqId] : [] });
  }

  // ── W05-API-02 lose-finalize ────────────────────────────────────────────────
  run.section("W05-API-02 — lose-finalize");

  let loseJobId = null;
  let loseRfqId = null;

  try {
    const { data: sub } = await svc.from("subcontractors").select("id").limit(1).single();
    if (!sub?.id) {
      run.skip("W05-lose setup", "no subcontractors");
      return;
    }

    loseJobId = await createTenderJob(token, `${ts}-lose`);
    const { data: rfqRow } = await svc
      .from("rfqs")
      .insert({
        job_id: loseJobId,
        subcontractor_id: sub.id,
        trade: "plumbing",
        status: "received",
        quote_amount: 9900,
      })
      .select("id")
      .single();
    loseRfqId = rfqRow?.id;

    const badLose = await loseFinalize(token, "");
    if (badLose.status === 400) {
      run.pass("W05-API-02 lose-finalize requires jobId");
    } else {
      run.fail("W05-API-02 lose validation", `${badLose.status}`);
    }

    const { status: loseStatus, body: loseBody } = await loseFinalize(token, loseJobId);
    if (loseStatus !== 200 || !loseBody?.ok) {
      run.fail("W05-API-02 lose-finalize", `${loseStatus} ${JSON.stringify(loseBody)}`);
      return;
    }
    run.pass("W05-API-02 POST /api/tender/lose-finalize returns ok");

    const { data: jobLost } = await svc
      .from("jobs")
      .select("status, lost_at")
      .eq("id", loseJobId)
      .single();
    if (jobLost?.status !== "lost" || !jobLost?.lost_at) {
      run.fail("W05-API-02 jobs.status=lost", JSON.stringify(jobLost));
    } else {
      run.pass("W05-API-02 lose-finalize sets jobs.status=lost and lost_at");
    }

    const { data: rfqsLost } = await svc.from("rfqs").select("status").eq("job_id", loseJobId);
    if ((rfqsLost || []).every((r) => r.status === "declined")) {
      run.pass("W05-API-02 lose-finalize declines all rfqs on job");
    } else {
      run.fail("W05-API-02 rfqs declined", JSON.stringify(rfqsLost));
    }

    run.gap(
      "W05-API-07 won/lost lead stage sync",
      "lose-finalize does not PATCH leads — W05-DRIFT-004; SAM-W05-004 deferred"
    );
  } finally {
    if (loseJobId) {
      await svc.from("rfqs").delete().eq("job_id", loseJobId);
      await svc.from("jobs").delete().eq("id", loseJobId);
    }
  }
}
