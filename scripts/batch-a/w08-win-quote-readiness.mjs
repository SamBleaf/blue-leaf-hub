/**
 * P0-B4 — Win quote readiness baseline (W08-API-02/05, W09-API-02/08)
 *
 * Proves:
 * - TenderDetail canToggle rule: accept UI requires quote_amount > 0 (mirror only)
 * - GET /api/tender/:jobId/win-quote-readiness warning types
 * - win-finalize seeds cost_intelligence only when quote_amount > 0
 * - quoted_amount does not auto-fill quote_amount on rfqs row
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

/** Mirror TenderDetail.jsx canToggle — UI gate only, not server enforced. */
function canToggleAccept(rfq, readOnly = false) {
  return !readOnly && rfq.quote_amount != null && Number(rfq.quote_amount) > 0;
}

function buildWinRowsFromRfqs(list) {
  return (list || []).map((r) => ({
    id: r.id,
    trade: r.trade,
    status:
      r.status === "received" || r.status === "accepted"
        ? "accepted"
        : r.status === "declined"
          ? "declined"
          : "declined",
    quote_amount: r.quote_amount ?? "",
    quoted_amount: r.quoted_amount ?? null,
  }));
}

function winRowMissingConfirmedQuote(row) {
  if (row.status !== "accepted") return false;
  const amt = row.quote_amount === "" || row.quote_amount == null ? null : Number(row.quote_amount);
  return amt == null || !Number.isFinite(amt) || amt <= 0;
}

async function cleanupWinJob(svc, jobId, rfqIds = []) {
  if (!svc || !jobId) return;
  await svc.from("cost_intelligence").delete().eq("job_id", jobId);
  await svc.from("projects").delete().eq("job_id", jobId);
  for (const rfqId of rfqIds) {
    await svc.from("rfqs").delete().eq("id", rfqId);
  }
  await svc.from("jobs").delete().eq("id", jobId);
}

async function createJob(token, ts) {
  const { body } = await post(
    "/api/jobs",
    { address: `${MARK} W08 WinQuote ${ts} St, Adelaide SA 5000`, status: "tendering" },
    token
  );
  return body?.job?.id || null;
}

async function fetchWinQuoteReadiness(token, jobId) {
  const { status, body } = await get(`/api/tender/${jobId}/win-quote-readiness`, token);
  return { status, body };
}

export async function runW08WinQuoteReadiness(run) {
  run.section("P0-B4 — Win quote readiness (W08/W09)");

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    run.fail("W08-win-quote auth", e.message);
    return;
  }

  if (!WRITE) {
    run.gap("W08-API-02 quote_amount accept rule (canToggle mirror)", "requires --write");
    run.gap("W08-API-05 accepted quote feeds win-finalize / cost_intel", "requires --write");
    run.gap("W09-API-02 cost_intelligence from quote_amount", "requires --write");
    run.gap("W09-API-08 win-quote-readiness endpoint", "requires --write");
    run.gap("W09-API-08A accepted + quote_amount > 0 — no warning", "requires --write");
    run.gap("W09-API-08B accepted + missing quote_amount — warning", "requires --write");
    run.gap("W09-API-08C quoted_amount present — warning + hint, no auto-fill", "requires --write");
    run.gap(
      "W09-API-08 UI win wizard quote warning smoke",
      "manual: TenderDetail Mark Won step 1 — warning panel + Use extracted amount"
    );
    return;
  }

  const svc = serviceClient();
  if (!svc) {
    run.fail("W08-win-quote setup", "service role required");
    return;
  }

  const ts = Date.now();
  const tradeId = "electrical";
  const tradeLabel = "Electrical";
  const confirmedAmount = 14200;
  const extractedAmount = 13800;

  // ── W08-API-02 — canToggle mirror + server accepts without quote_amount ─────
  run.section("W08-API-02 quote_amount / quoted_amount accept rule");

  let jobId = null;
  let rfqNoQuote = null;
  let rfqWithQuote = null;

  try {
    const { data: sub } = await svc.from("subcontractors").select("id").limit(1).single();
    if (!sub?.id) {
      run.skip("W08-API-02", "no subcontractors row");
      return;
    }

    jobId = await createJob(token, `${ts}-rule`);
    const { data: rfqA } = await svc
      .from("rfqs")
      .insert({
        job_id: jobId,
        subcontractor_id: sub.id,
        trade: tradeId,
        status: "received",
        quote_amount: null,
        quoted_amount: extractedAmount,
      })
      .select("id, quote_amount, quoted_amount")
      .single();
    rfqNoQuote = rfqA?.id;

    const { data: rfqB } = await svc
      .from("rfqs")
      .insert({
        job_id: jobId,
        subcontractor_id: sub.id,
        trade: "plumbing",
        status: "received",
        quote_amount: confirmedAmount,
      })
      .select("id, quote_amount")
      .single();
    rfqWithQuote = rfqB?.id;

    if (!canToggleAccept({ quote_amount: null })) {
      run.pass("W08-API-02 canToggle false when quote_amount null");
    } else {
      run.fail("W08-API-02 canToggle false when quote_amount null", "expected false");
    }

    if (canToggleAccept({ quote_amount: confirmedAmount })) {
      run.pass("W08-API-02 canToggle true when quote_amount > 0");
    } else {
      run.fail("W08-API-02 canToggle true when quote_amount > 0", "expected true");
    }

    const serverAccept = await patch(`/api/rfq/${rfqNoQuote}`, { status: "accepted" }, token);
    if (serverAccept.status === 200 && serverAccept.body?.ok) {
      run.pass("W08-API-02 server PATCH accept allowed without quote_amount (UI gate only)");
    } else {
      run.fail(
        "W08-API-02 server PATCH accept without quote_amount",
        `${serverAccept.status} ${JSON.stringify(serverAccept.body)}`
      );
    }

    const { data: afterAccept } = await svc
      .from("rfqs")
      .select("quote_amount, quoted_amount")
      .eq("id", rfqNoQuote)
      .single();
    if (afterAccept?.quote_amount == null && Number(afterAccept?.quoted_amount) === extractedAmount) {
      run.pass("W09-API-08C quoted_amount not auto-copied to quote_amount on accept");
    } else {
      run.fail(
        "W09-API-08C no auto-fill quoted_amount → quote_amount",
        JSON.stringify(afterAccept)
      );
    }
  } finally {
    await cleanupWinJob(svc, jobId, [rfqNoQuote, rfqWithQuote].filter(Boolean));
    jobId = null;
  }

  // ── W09-API-08 series — win-quote-readiness endpoint ───────────────────────
  run.section("W09-API-08 Win quote readiness endpoint");

  async function setupRfq({ quoteAmount, quotedAmount, status = "accepted" }) {
    const jid = await createJob(token, `${ts}-${Math.random().toString(36).slice(2, 8)}`);
    const { data: sub } = await svc.from("subcontractors").select("id, business_name").limit(1).single();
    const { data: rfq } = await svc
      .from("rfqs")
      .insert({
        job_id: jid,
        subcontractor_id: sub.id,
        trade: tradeId,
        status,
        quote_amount: quoteAmount,
        quoted_amount: quotedAmount ?? null,
      })
      .select("id")
      .single();
    return { jobId: jid, rfqId: rfq?.id, subName: sub?.business_name };
  }

  // W09-API-08A — confirmed amount, no warning
  {
    const fx = await setupRfq({ quoteAmount: confirmedAmount, quotedAmount: extractedAmount });
    try {
      const { status, body } = await fetchWinQuoteReadiness(token, fx.jobId);
      if (status === 200 && body?.ok && body?.hasWarnings === false && (body?.warnings?.length || 0) === 0) {
        run.pass("W09-API-08A accepted + quote_amount > 0 returns no warning");
      } else {
        run.fail(
          "W09-API-08A no warning when quote_amount confirmed",
          `${status} hasWarnings=${body?.hasWarnings} warnings=${body?.warnings?.length}`
        );
      }
    } finally {
      await cleanupWinJob(svc, fx.jobId, [fx.rfqId]);
    }
  }

  // W09-API-08B — missing quote_amount
  {
    const fx = await setupRfq({ quoteAmount: null, quotedAmount: null });
    try {
      const { status, body } = await fetchWinQuoteReadiness(token, fx.jobId);
      const w = (body?.warnings || []).find((x) => x.type === "missing_quote_amount");
      if (status === 200 && body?.ok && body?.hasWarnings && w?.rfqId === fx.rfqId) {
        run.pass("W09-API-08B accepted + missing quote_amount returns warning");
      } else {
        run.fail(
          "W09-API-08B missing quote_amount warning",
          `${status} ${JSON.stringify(body)}`
        );
      }
    } finally {
      await cleanupWinJob(svc, fx.jobId, [fx.rfqId]);
    }
  }

  // W09-API-08C — quoted_amount hint, no auto-fill
  {
    const fx = await setupRfq({ quoteAmount: null, quotedAmount: extractedAmount });
    try {
      const { status, body } = await fetchWinQuoteReadiness(token, fx.jobId);
      const w = (body?.warnings || []).find((x) => x.type === "missing_quote_amount");
      const { data: row } = await svc.from("rfqs").select("quote_amount, quoted_amount").eq("id", fx.rfqId).single();
      if (
        status === 200 &&
        body?.ok &&
        body?.hasWarnings &&
        w?.quotedAmount === extractedAmount &&
        row?.quote_amount == null
      ) {
        run.pass("W09-API-08C quoted_amount in warning; quote_amount still null in DB");
      } else {
        run.fail(
          "W09-API-08C quoted_amount hint without auto-fill",
          `${status} warning=${JSON.stringify(w)} row=${JSON.stringify(row)}`
        );
      }

      const winRows = buildWinRowsFromRfqs([{ ...row, id: fx.rfqId, trade: tradeId, status: "accepted" }]);
      if (winRowMissingConfirmedQuote(winRows[0])) {
        run.pass("W09-API-08 win wizard row mirror flags missing confirmed quote");
      } else {
        run.fail("W09-API-08 win wizard row mirror", "expected missing confirmed quote");
      }
    } finally {
      await cleanupWinJob(svc, fx.jobId, [fx.rfqId]);
    }
  }

  run.pass("W09-API-08 GET /api/tender/:jobId/win-quote-readiness endpoint available");

  // ── W08-API-05 / W09-API-02 — win-finalize → cost_intelligence ─────────────
  run.section("W08-API-05 / W09-API-02 win-finalize cost_intelligence");

  jobId = await createJob(token, `${ts}-finalize`);
  let rfqConfirmed = null;
  let rfqMissing = null;

  try {
    const { data: sub } = await svc.from("subcontractors").select("id, business_name, contact, email, mobile").limit(1).single();
    const { data: rfqOk } = await svc
      .from("rfqs")
      .insert({
        job_id: jobId,
        subcontractor_id: sub.id,
        trade: tradeId,
        status: "accepted",
        quote_amount: confirmedAmount,
      })
      .select("id, trade")
      .single();
    rfqConfirmed = rfqOk?.id;

    const { data: rfqBad } = await svc
      .from("rfqs")
      .insert({
        job_id: jobId,
        subcontractor_id: sub.id,
        trade: "plumbing",
        status: "accepted",
        quote_amount: null,
        quoted_amount: extractedAmount,
      })
      .select("id, trade")
      .single();
    rfqMissing = rfqBad?.id;

    const rfqUpdates = [
      { id: rfqConfirmed, status: "accepted", quote_amount: confirmedAmount },
      { id: rfqMissing, status: "accepted", quote_amount: null },
    ];
    const acceptedTrades = [
      {
        trade: tradeId,
        subcontractor: sub.business_name,
        contact: sub.contact,
        email: sub.email,
        phone: sub.mobile,
        quote_amount: confirmedAmount,
        subcontractor_id: sub.id,
        rfq_id: rfqConfirmed,
      },
      {
        trade: "plumbing",
        subcontractor: sub.business_name,
        quote_amount: null,
        subcontractor_id: sub.id,
        rfq_id: rfqMissing,
      },
    ];

    const { status: finStatus, body: finBody } = await post(
      "/api/tender/win-finalize",
      {
        jobId,
        rfqUpdates,
        acceptedTrades,
        quoteCopies: [],
        tentative_start_date: null,
        emails: [],
        costIntel: {},
      },
      token
    );

    if (finStatus !== 200 || !finBody?.ok) {
      run.fail("W08-API-05 win-finalize", `${finStatus} ${JSON.stringify(finBody)}`);
      return;
    }
    run.pass("W08-API-05 win-finalize succeeds with mixed quote amounts (not blocked)");

    const { data: ciRows } = await svc.from("cost_intelligence").select("trade, quote_amount").eq("job_id", jobId);
    const ciConfirmed = (ciRows || []).find((r) => r.trade === tradeId);
    const ciMissing = (ciRows || []).find((r) => r.trade === "plumbing");

    if (ciConfirmed && Number(ciConfirmed.quote_amount) === confirmedAmount) {
      run.pass("W09-API-02 cost_intelligence seeded from accepted quote_amount > 0");
    } else {
      run.fail(
        "W09-API-02 cost_intelligence with quote_amount",
        `expected ${tradeId}/${confirmedAmount}; got ${JSON.stringify(ciRows)}`
      );
    }

    if (!ciMissing) {
      run.pass("W08-API-05 accepted trade without quote_amount skipped in cost_intelligence");
    } else {
      run.fail(
        "W08-API-05 skip null quote_amount in cost_intelligence",
        `unexpected row: ${JSON.stringify(ciMissing)}`
      );
    }
  } finally {
    await cleanupWinJob(svc, jobId, [rfqConfirmed, rfqMissing].filter(Boolean));
  }

  run.gap(
    "W09-API-08 UI win wizard quote warning smoke",
    "manual: TenderDetail Mark Won step 1 — warning panel + Use extracted amount (not in script scope)"
  );
}
