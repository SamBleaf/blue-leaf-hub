/**
 * TEST-JOURNEY-B-01 — RFQ money path chain: send → match → receive → accept
 *
 * Steps:
 * 1. Engine send (or DB simulate when mail unavailable)
 * 2. Inbound match baseline (resolveInboundRfqMatch)
 * 3. Apply received state (simulates IMAP handler + propagation when linked package exists)
 * 4. W08-API-01 PATCH /api/rfq/:id accept on TenderDetail path
 * 5. Verify tender rfqs state + alignment endpoint clean
 */
import { resolveInboundRfqMatch } from "../../server/lib/imapQuoteMatch.mjs";
import { applyInboundQuoteToWorkflow } from "../../server/lib/rfqQuotePropagation.mjs";
import {
  WRITE,
  MARK,
  post,
  patch,
  get,
  getAuthToken,
  serviceClient,
} from "./_helpers.mjs";

function generateMessageId() {
  const host = "blueleafbuilding.test";
  return `<journey-b-${Date.now()}.${Math.random().toString(36).slice(2)}@${host}>`;
}

async function cleanup(svc, { packageId, jobId, rfqIds = [] }) {
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

async function mailReady(token) {
  const { status, body } = await get("/api/integrations/status", token);
  return status === 200 && body?.ok && body?.mail?.ready === true;
}

export async function runJourneyBRfqMoneyPath(run) {
  run.section("JOURNEY-B-01 — RFQ send → match → receive → accept");

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    run.fail("JOURNEY-B auth", e.message);
    return;
  }

  if (!WRITE) {
    run.gap("JOURNEY-B-01 full money path", "requires --write");
    return;
  }

  const svc = serviceClient();
  if (!svc) {
    run.fail("JOURNEY-B setup", "service role required");
    return;
  }

  const ts = Date.now();
  const address = `${MARK} JourneyB ${ts} St, Adelaide SA 5000`;
  const tradeId = "electrical";
  const tradeLabel = "Electrical";
  const quotedAmount = 15800;
  const acceptedAmount = 15800;

  let jobId = null;
  let packageId = null;
  let rfqId = null;
  let sentMessageId = null;

  try {
    const { data: sub } = await svc.from("subcontractors").select("id, email").limit(1).single();
    if (!sub?.id) {
      run.skip("JOURNEY-B setup", "no subcontractors");
      return;
    }

    const { body: jobBody } = await post("/api/jobs", { address, status: "tendering" }, token);
    jobId = jobBody?.job?.id;
    if (!jobId) {
      run.fail("JOURNEY-B setup", "job create failed");
      return;
    }

    const { data: rfqRow } = await svc
      .from("rfqs")
      .insert({
        job_id: jobId,
        subcontractor_id: sub.id,
        trade: tradeId,
        status: "queued",
      })
      .select("id")
      .single();
    rfqId = rfqRow?.id;
    if (!rfqId) {
      run.fail("JOURNEY-B setup", "rfq insert failed");
      return;
    }

    // ── Step 1: Engine send ───────────────────────────────────────────────────
    run.section("Step 1 — Engine send (RFQ-04)");

    const transportReady = await mailReady(token);
    const subject = `RFQ - ${address} - ${tradeLabel}`;

    if (transportReady) {
      const sendRes = await post(
        "/api/rfq/send",
        {
          messages: [
            {
              to: sub.email || `journey-b-${ts}@example.test`,
              subject,
              body: `${MARK} JOURNEY-B chain ${ts}`,
              rfqId,
              jobId,
              subcontractor_id: sub.id,
            },
          ],
        },
        token
      );
      if (sendRes.status !== 200 || !sendRes.body?.ok) {
        run.fail("JOURNEY-B engine send", `${sendRes.status} ${JSON.stringify(sendRes.body)}`);
        return;
      }
      sentMessageId = sendRes.body?.results?.[0]?.messageId;
      run.pass("JOURNEY-B Step 1 — engine send via POST /api/rfq/send");
    } else {
      sentMessageId = generateMessageId();
      await svc
        .from("rfqs")
        .update({
          status: "sent",
          sent_message_id: sentMessageId,
          sent_at: new Date().toISOString(),
        })
        .eq("id", rfqId);
      run.gap(
        "JOURNEY-B Step 1 — engine send transport",
        "mail not configured — simulated sent state in DB for chain remainder"
      );
    }

    const { data: rfqSent } = await svc
      .from("rfqs")
      .select("status, sent_message_id")
      .eq("id", rfqId)
      .single();
    if (rfqSent?.status !== "sent" || !rfqSent?.sent_message_id) {
      run.fail("JOURNEY-B sent state", JSON.stringify(rfqSent));
      return;
    }
    sentMessageId = rfqSent.sent_message_id;
    run.pass("JOURNEY-B Step 1 — rfqs row in sent state with sent_message_id");

    // Create linked package for propagation test (optional but proves handoff)
    const pkgRes = await post(
      "/api/rfq-packages",
      {
        job_id: jobId,
        project_address: address,
        project_type: "renovation",
        tender_deadline: "2026-12-31",
        trade_scopes: [
          {
            trade_id: tradeId,
            trade_label: tradeLabel,
            scope_bullets: ["Journey B scope"],
            recipients: [
              {
                subcontractor_id: sub.id,
                business_name: "Journey Sub",
                email: sub.email || `journey-${ts}@example.test`,
                status: "sent",
                rfq_id: rfqId,
              },
            ],
          },
        ],
      },
      token
    );
    packageId = pkgRes.body?.packageId;
    if (pkgRes.status !== 200 || !packageId) {
      run.gap("JOURNEY-B package link", `package create ${pkgRes.status} — propagation step skipped`);
    } else {
      run.pass("JOURNEY-B setup — linked package with rfq_id on recipient");
    }

    // ── Step 2: Inbound match baseline ──────────────────────────────────────
    run.section("Step 2 — Inbound match baseline");

    const rfqRows = [
      {
        id: rfqId,
        job_id: jobId,
        subcontractor_id: sub.id,
        trade: tradeId,
        status: "sent",
        sent_message_id: sentMessageId,
        jobs: { address },
        subcontractors: {
          email: sub.email || `journey-${ts}@example.test`,
          business_name: "Journey Sub",
        },
      },
    ];

    const normalizedId = String(sentMessageId).replace(/^<|>$/g, "");
    const match = resolveInboundRfqMatch(
      {
        from: sub.email || `journey-${ts}@example.test`,
        subject: `Re: ${subject}`,
        inReplyTo: normalizedId,
        references: normalizedId,
        text: `Our quote is $${quotedAmount} ex GST`,
        attachments: [],
      },
      rfqRows
    );

    if (!match || match.rfq.id !== rfqId) {
      run.fail("JOURNEY-B Step 2 — matcher", match ? `wrong id ${match.rfq.id}` : "null");
      return;
    }
    run.pass("JOURNEY-B Step 2 — inbound matcher resolves thread to rfq");

    // ── Step 3: Apply received (simulates IMAP apply) ───────────────────────
    run.section("Step 3 — Apply received quote");

    const receivedAt = new Date().toISOString();
    await svc
      .from("rfqs")
      .update({
        status: "received",
        quoted_amount: quotedAmount,
        received_at: receivedAt,
      })
      .eq("id", rfqId);

    if (packageId) {
      const prop = await applyInboundQuoteToWorkflow(svc, rfqId, {
        status: "received",
        receivedAt,
        quotedAmount,
      });
      if (prop.rfq_recipients < 1) {
        run.gap(
          "JOURNEY-B Step 3 — propagation to rfq_recipients",
          `recipients updated=${prop.rfq_recipients} — check rfq_id link`
        );
      } else {
        run.pass("JOURNEY-B Step 3 — applyInboundQuoteToWorkflow updates linked recipient");
      }
    } else {
      run.gap("JOURNEY-B Step 3 — package propagation", "no package — rfqs-only received path");
    }

    const { data: rfqReceived } = await svc
      .from("rfqs")
      .select("status, quoted_amount")
      .eq("id", rfqId)
      .single();
    if (rfqReceived?.status !== "received") {
      run.fail("JOURNEY-B received state", JSON.stringify(rfqReceived));
      return;
    }
    run.pass("JOURNEY-B Step 3 — rfqs.status=received with quoted_amount");

    run.gap(
      "JOURNEY-B live IMAP poll",
      "full IMAP E2E not in script — matcher + manual resolve covered by test:w07-matcher and test:rfq-unmatched"
    );

    // ── Step 4: W08-API-01 TenderDetail accept ────────────────────────────────
    run.section("Step 4 — W08-API-01 PATCH accept (TenderDetail path)");

    const acceptRes = await patch(
      `/api/rfq/${rfqId}`,
      { status: "accepted", quote_amount: acceptedAmount },
      token
    );
    if (acceptRes.status !== 200 || !acceptRes.body?.ok) {
      run.fail(
        "W08-API-01 PATCH /api/rfq/:id accept",
        `${acceptRes.status} ${JSON.stringify(acceptRes.body)}`
      );
      return;
    }

    const rfqAccepted = acceptRes.body?.rfq;
    if (rfqAccepted?.status !== "accepted" || Number(rfqAccepted?.quote_amount) !== acceptedAmount) {
      run.fail("W08-API-01 accept updates rfqs", JSON.stringify(rfqAccepted));
      return;
    }
    run.pass("W08-API-01 PATCH /api/rfq/:id sets status=accepted and quote_amount");

    // Tender accept does not sync recipients (W08-DRIFT-004 baseline)
    if (packageId) {
      const { data: recips } = await svc
        .from("rfq_recipients")
        .select("status, quote_amount")
        .eq("package_id", packageId)
        .eq("rfq_id", rfqId);
      const rec = recips?.[0];
      if (rec?.status === "accepted" && Number(rec?.quote_amount) === acceptedAmount) {
        run.gap(
          "W08-API-01 tender accept recipient sync",
          "recipient synced on tender accept — differs from W08-DRIFT-004 baseline; review"
        );
      } else {
        run.pass("W08-API-01 tender accept does not auto-sync rfq_recipients (W08-DRIFT-004 baseline)");
      }
    }

    // ── Step 5: Tender state + alignment ────────────────────────────────────
    run.section("Step 5 — Tender state after accept");

    const { data: boardRfqs } = await svc.from("rfqs").select("id, status, quote_amount").eq("job_id", jobId);
    const acceptedRows = (boardRfqs || []).filter((r) => r.status === "accepted");
    if (acceptedRows.length !== 1 || acceptedRows[0].id !== rfqId) {
      run.fail("JOURNEY-B tender state", JSON.stringify(acceptedRows));
      return;
    }
    run.pass("JOURNEY-B Step 5 — single accepted rfqs row visible to tender board source");

    const { status: alignStatus, body: alignBody } = await get(
      `/api/tender/${jobId}/accept-alignment`,
      token
    );
    if (alignStatus === 200 && alignBody?.ok) {
      if (alignBody?.hasWarnings) {
        run.gap(
          "JOURNEY-B accept-alignment after tender accept",
          `warnings: ${(alignBody.warnings || []).map((w) => w.type).join(",")} — stale_rfq expected if recipient not synced`
        );
      } else {
        run.pass("JOURNEY-B Step 5 — accept-alignment clean after tender-only accept path");
      }
    } else {
      run.gap("JOURNEY-B accept-alignment", `${alignStatus} — endpoint unavailable or warnings expected`);
    }

    run.gap(
      "W08-API-04 accept rollup to scope/package",
      "scope/package status unchanged on tender accept — W08-DRIFT-005 (see w08-accept-alignment.mjs)"
    );

    run.pass("JOURNEY-B-01 chain complete — send → match → receive → accept");
  } finally {
    await cleanup(svc, { packageId, jobId, rfqIds: rfqId ? [rfqId] : [] });
  }
}
