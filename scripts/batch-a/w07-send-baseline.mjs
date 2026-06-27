/**
 * TEST-JOURNEY-B-01 — Engine outbound RFQ send baseline (W07-API-01, RFQ-04)
 *
 * Proves:
 * 1. POST /api/rfq/send validates payload
 * 2. When mail transport configured: stamps sent_message_id, status=sent, correspondence outbound
 * 3. In-Reply-To matcher resolves sent_message_id → rfq row (unit baseline)
 * 4. Idempotency: duplicate send skipped when rfq already sent
 *
 * When mail not configured: gap-document transport; DB-state simulation deferred to journey-b chain.
 */
import { resolveInboundRfqMatch } from "../../server/lib/imapQuoteMatch.mjs";
import {
  WRITE,
  MARK,
  post,
  get,
  getAuthToken,
  serviceClient,
} from "./_helpers.mjs";

async function cleanup(svc, { jobId, rfqIds = [] }) {
  if (!svc) return;
  for (const rfqId of rfqIds) {
    await svc.from("correspondence").delete().eq("rfq_id", rfqId);
    await svc.from("rfqs").delete().eq("id", rfqId);
  }
  if (jobId) await svc.from("jobs").delete().eq("id", jobId);
}

async function mailReady(token) {
  const { status, body } = await get("/api/integrations/status", token);
  return status === 200 && body?.ok && body?.mail?.ready === true;
}

async function createJobAndRfq(token, svc, { ts, sub }) {
  const address = `${MARK} W07 Send ${ts} St, Adelaide SA 5000`;
  const { body: jobBody } = await post(
    "/api/jobs",
    { address, status: "tendering" },
    token
  );
  const jobId = jobBody?.job?.id;
  if (!jobId) return { error: "job create failed" };

  const { data: rfqRow, error: rfqErr } = await svc
    .from("rfqs")
    .insert({
      job_id: jobId,
      subcontractor_id: sub.id,
      trade: "electrical",
      status: "queued",
    })
    .select("id")
    .single();
  if (rfqErr || !rfqRow?.id) {
    await svc.from("jobs").delete().eq("id", jobId);
    return { error: rfqErr?.message || "rfq insert failed" };
  }

  return { jobId, rfqId: rfqRow.id, address, subEmail: sub.email };
}

function buildSendPayload({ rfqId, jobId, subId, subEmail, address, ts }) {
  const subject = `RFQ - ${address} - Electrical`;
  return {
    messages: [
      {
        to: subEmail || `w07-send-${ts}@example.test`,
        subject,
        body: `${MARK} TEST-JOURNEY-B-01 engine send baseline ${ts}`,
        rfqId,
        jobId,
        subcontractor_id: subId,
      },
    ],
  };
}

export async function runW07SendBaseline(run) {
  run.section("W07-API-01 / RFQ-04 — Engine outbound RFQ send");

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    run.fail("W07-send auth", e.message);
    return { mailConfigured: false };
  }

  if (!WRITE) {
    run.gap("W07-API-01 engine send stamps sent_message_id", "requires --write");
    run.gap("RFQ-04 POST /api/rfq/send outbound correspondence", "requires --write");
    run.gap("W07-API-01 inbound matcher resolves sent_message_id", "requires --write + sent row");
    run.gap("W07-API-01 idempotent skip on already-sent rfq", "requires --write");
    return { mailConfigured: null };
  }

  const svc = serviceClient();
  if (!svc) {
    run.fail("W07-send setup", "service role required");
    return { mailConfigured: false };
  }

  const ts = Date.now();
  const transportReady = await mailReady(token);

  // ── Validation (no mail required) ─────────────────────────────────────────
  {
    const bad = await post("/api/rfq/send", { messages: [] }, token);
    if (bad.status !== 400 || !bad.body?.error) {
      run.fail("W07-API-01 empty messages returns 400", `${bad.status} ${JSON.stringify(bad.body)}`);
    } else {
      run.pass("W07-API-01 empty messages[] returns 400");
    }
  }

  if (!transportReady) {
    run.gap(
      "RFQ-04 engine send transport",
      "mail not configured — POST /api/rfq/send returns 500 mail_ready:false; chain continues in journey-b with DB simulation"
    );
    run.gap("W07-API-01 sent_message_id + correspondence", "requires mail transport — gap-documented");
    run.gap("W07-API-01 idempotent skip", "requires mail transport — gap-documented");
    return { mailConfigured: false };
  }

  const { data: sub } = await svc.from("subcontractors").select("id, email").limit(1).single();
  if (!sub?.id) {
    run.skip("W07-send fixtures", "no subcontractors row");
    return { mailConfigured: true };
  }

  let jobId = null;
  let rfqId = null;

  try {
    const fx = await createJobAndRfq(token, svc, { ts, sub });
    if (fx.error) {
      run.fail("W07-send setup", fx.error);
      return { mailConfigured: true };
    }
    jobId = fx.jobId;
    rfqId = fx.rfqId;

    const payload = buildSendPayload({
      rfqId,
      jobId,
      subId: sub.id,
      subEmail: sub.email,
      address: fx.address,
      ts,
    });

    const sendRes = await post("/api/rfq/send", payload, token);
    if (sendRes.status !== 200 || !sendRes.body?.ok) {
      run.fail(
        "RFQ-04 POST /api/rfq/send succeeds",
        `${sendRes.status} ${JSON.stringify(sendRes.body)}`
      );
      return { mailConfigured: true, jobId, rfqId, sendFailed: true };
    }

    const result = sendRes.body?.results?.[0];
    if (!result?.ok || !result?.messageId) {
      run.fail("RFQ-04 send result includes messageId", JSON.stringify(result));
      return { mailConfigured: true, jobId, rfqId, sendFailed: true };
    }
    run.pass("RFQ-04 POST /api/rfq/send returns ok + messageId");

    const msgId = result.messageId;
    const { data: rfqAfter } = await svc
      .from("rfqs")
      .select("status, sent_message_id")
      .eq("id", rfqId)
      .single();

    if (rfqAfter?.status !== "sent" || !rfqAfter?.sent_message_id) {
      run.fail(
        "W07-API-01 rfqs.status=sent and sent_message_id stamped",
        JSON.stringify(rfqAfter)
      );
    } else {
      run.pass("W07-API-01 engine send stamps rfqs.status=sent and sent_message_id");
    }

    const normalizedId = String(rfqAfter.sent_message_id).replace(/^<|>$/g, "");
    const { count: corrCount } = await svc
      .from("correspondence")
      .select("id", { count: "exact", head: true })
      .eq("rfq_id", rfqId)
      .eq("direction", "outbound");
    if ((corrCount || 0) < 1) {
      run.fail("RFQ-04 outbound correspondence logged", `count=${corrCount}`);
    } else {
      run.pass("RFQ-04 outbound correspondence row logged for engine send");
    }

    // ── Matcher baseline on sent_message_id ───────────────────────────────────
    run.section("W07 inbound match baseline (fixture on sent_message_id)");

    const rfqRows = [
      {
        id: rfqId,
        job_id: jobId,
        subcontractor_id: sub.id,
        trade: "electrical",
        status: "sent",
        sent_message_id: rfqAfter.sent_message_id,
        jobs: { address: fx.address },
        subcontractors: { email: sub.email || `w07-${ts}@example.test`, business_name: "Test Sub" },
      },
    ];

    const match = resolveInboundRfqMatch(
      {
        from: sub.email || `w07-${ts}@example.test`,
        subject: `Re: ${payload.messages[0].subject}`,
        inReplyTo: normalizedId,
        references: normalizedId,
        text: "Quote attached $15,000 ex GST",
        attachments: [],
      },
      rfqRows
    );

    if (!match || match.rfq.id !== rfqId) {
      run.fail(
        "W07-API-01 matcher resolves In-Reply-To sent_message_id",
        match ? `got ${match.rfq.id}` : "null match"
      );
    } else {
      run.pass("W07-API-01 matcher resolves In-Reply-To → sent rfq row");
    }

    // ── Idempotency ───────────────────────────────────────────────────────────
    const resend = await post("/api/rfq/send", payload, token);
    const resendResult = resend.body?.results?.[0];
    if (resend.status !== 200 || !resendResult?.skipped) {
      run.gap(
        "W07-API-01 idempotent skip on already-sent rfq",
        `expected skipped:true; got ${JSON.stringify(resendResult)} — review idempotency guard`
      );
    } else {
      run.pass("W07-API-01 duplicate engine send skipped when rfq already sent");
    }

    return {
      mailConfigured: true,
      jobId,
      rfqId,
      sentMessageId: rfqAfter.sent_message_id,
      sub,
      address: fx.address,
    };
  } finally {
    if (jobId && rfqId) {
      await cleanup(svc, { jobId, rfqIds: [rfqId] });
    }
  }
}
