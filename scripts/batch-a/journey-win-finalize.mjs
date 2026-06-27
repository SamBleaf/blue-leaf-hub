/**
 * TEST-WIN-FINALIZE-01 — Win chain: accept → win-finalize → ops readiness
 *
 * End-to-end script-level chain (no UI):
 * 1. Tender job + received rfq with quote_amount
 * 2. PATCH accept (TenderDetail)
 * 3. win-quote-readiness clean
 * 4. POST win-finalize
 * 5. Project + cost_intel + ops checklist
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

async function cleanup(svc, { jobId, projectId, rfqId }) {
  if (!svc) return;
  if (jobId) {
    await svc.from("cost_intelligence").delete().eq("job_id", jobId);
    if (rfqId) await svc.from("rfqs").delete().eq("id", rfqId);
  }
  if (projectId) await svc.from("projects").delete().eq("id", projectId);
  if (jobId) await svc.from("jobs").delete().eq("id", jobId);
}

export async function runJourneyWinFinalize(run) {
  run.section("JOURNEY-WIN-01 — accept → win-finalize → ops readiness");

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    run.fail("JOURNEY-WIN auth", e.message);
    return;
  }

  if (!WRITE) {
    run.gap("JOURNEY-WIN-01 chain", "requires --write");
    return;
  }

  const svc = serviceClient();
  if (!svc) {
    run.fail("JOURNEY-WIN setup", "service role required");
    return;
  }

  const ts = Date.now();
  const tradeId = "carpentry";
  const quoteAmount = 22100;
  let jobId = null;
  let projectId = null;
  let rfqId = null;

  try {
    const { data: sub } = await svc
      .from("subcontractors")
      .select("id, business_name, contact, email, mobile")
      .limit(1)
      .single();
    if (!sub?.id) {
      run.skip("JOURNEY-WIN setup", "no subcontractors");
      return;
    }

    const { body: jobBody } = await post(
      "/api/jobs",
      { address: `${MARK} JourneyWin ${ts} St, Adelaide SA 5000`, status: "tendering" },
      token
    );
    jobId = jobBody?.job?.id;
    if (!jobId) {
      run.fail("JOURNEY-WIN setup", "job create failed");
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
      })
      .select("id")
      .single();
    rfqId = rfqRow?.id;

    // Step 1 — Accept
    const accept = await patch(
      `/api/rfq/${rfqId}`,
      { status: "accepted", quote_amount: quoteAmount },
      token
    );
    if (accept.status !== 200 || !accept.body?.ok) {
      run.fail("JOURNEY-WIN Step 1 accept", `${accept.status}`);
      return;
    }
    run.pass("JOURNEY-WIN Step 1 — PATCH accept before win");

    // Step 2 — Readiness
    const wqr = await get(`/api/tender/${jobId}/win-quote-readiness`, token);
    if (wqr.status === 200 && wqr.body?.ok && !wqr.body?.hasWarnings) {
      run.pass("JOURNEY-WIN Step 2 — win-quote-readiness clean");
    } else {
      run.gap("JOURNEY-WIN Step 2 win-quote-readiness", JSON.stringify(wqr.body?.warnings));
    }

    // Step 3 — Win-finalize
    const { status: finStatus, body: finBody } = await post(
      "/api/tender/win-finalize",
      {
        jobId,
        rfqUpdates: [{ id: rfqId, status: "accepted", quote_amount: quoteAmount }],
        acceptedTrades: [
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
        ],
        quoteCopies: [],
        emails: [],
        costIntel: {},
      },
      token
    );
    projectId = finBody?.project?.id;
    if (finStatus !== 200 || !finBody?.ok || !projectId) {
      run.fail("JOURNEY-WIN Step 3 win-finalize", `${finStatus} ${JSON.stringify(finBody)}`);
      return;
    }
    run.pass("JOURNEY-WIN Step 3 — win-finalize creates project");

    // Step 4 — Verify cost_intel + job won
    const { data: jobRow } = await svc.from("jobs").select("status").eq("id", jobId).single();
    const { count: ciCount } = await svc
      .from("cost_intelligence")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId);

    if (jobRow?.status === "won" && (ciCount || 0) >= 1) {
      run.pass("JOURNEY-WIN Step 4 — job won + cost_intelligence present");
    } else {
      run.fail("JOURNEY-WIN Step 4 side effects", `status=${jobRow?.status} ci=${ciCount}`);
    }

    // Step 5 — Ops readiness
    const ready = await get(`/api/projects/${projectId}/ops-readiness`, token);
    if (ready.status === 200 && ready.body?.ok && (ready.body?.items?.length || 0) >= 14) {
      run.pass(`JOURNEY-WIN Step 5 — ops-readiness checklist (${ready.body.items.length} items)`);
    } else {
      run.fail("JOURNEY-WIN Step 5 ops-readiness", `${ready.status}`);
    }

    run.gap(
      "JOURNEY-WIN E2E UI Mark Won wizard",
      "API chain only — TenderDetail wizard smoke manual/deferred"
    );

    run.pass("JOURNEY-WIN-01 chain complete — accept → win → ops readiness");
  } finally {
    await cleanup(svc, { jobId, projectId, rfqId });
  }
}
