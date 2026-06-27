/**
 * P0-B2 Phase 1 — Quote acceptance alignment baseline (W08-API-03, W08-API-04, W09-API-05)
 *
 * Proves current behaviour (no product code changes):
 * 1. TenderDetail-style PATCH /api/rfq/:id updates rfqs only — not rfq_recipients
 * 2. PackageDetail PATCH recipient with linked rfq_id mirrors to rfqs (no duplicate rfqs)
 * 3. Package accept without rfq_id stays invisible to rfqs-only win source
 * 4. Accepted does not roll up to rfq_trade_scopes / rfq_packages status (W08-DRIFT-005)
 * 5. Win wizard source is rfqs only (buildWinRowsFromRfqs mirror)
 *
 * Phase 2: GET /api/tender/:jobId/accept-alignment + TenderDetail win wizard warning.
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

/** Mirror TenderDetail.jsx buildWinRowsFromRfqs — win wizard reads rfqs only. */
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
    received: r.status === "received" || r.status === "accepted",
  }));
}

async function cleanup(svc, { packageId, jobId, rfqIds = [] }) {
  if (!svc) return;
  if (packageId) {
    await svc.from("rfq_recipients").delete().eq("package_id", packageId);
    await svc.from("rfq_trade_scopes").delete().eq("package_id", packageId);
    await svc.from("rfq_packages").delete().eq("id", packageId);
  }
  for (const rfqId of rfqIds) {
    await svc.from("rfqs").delete().eq("id", rfqId);
  }
  if (jobId) await svc.from("jobs").delete().eq("id", jobId);
}

async function createJob(token, ts) {
  const { body } = await post(
    "/api/jobs",
    { address: `${MARK} W08 Accept ${ts} St, Adelaide SA 5000`, status: "tendering" },
    token
  );
  return body?.job?.id || null;
}

async function createPackage(token, { jobId, address, tradeId, tradeLabel, recipients, ts }) {
  const { status, body } = await post(
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
          scope_bullets: ["Baseline scope"],
          recipients,
        },
      ],
    },
    token
  );
  return { status, packageId: body?.packageId, body };
}

async function fetchAlignment(token, jobId) {
  const { status, body } = await get(`/api/tender/${jobId}/accept-alignment`, token);
  return { status, body };
}

function warningTypes(body) {
  return (body?.warnings || []).map((w) => w.type);
}

async function runAlignmentEndpointTests(run, token, svc, sub) {
  run.section("W09-API-05 Accept alignment endpoint (Phase 2)");

  const tradeId = "electrical";
  const tradeLabel = "Electrical";
  const ts = Date.now();

  async function setupLinkedPackage({ rfqStatus, rfqAmount, recStatus, recAmount, unlinkedAccepted = false }) {
    const jobId = await createJob(token, `${ts}-align-${Math.random().toString(36).slice(2, 8)}`);
    const { data: rfqRow } = await svc
      .from("rfqs")
      .insert({
        job_id: jobId,
        subcontractor_id: sub.id,
        trade: tradeId,
        status: rfqStatus,
        quote_amount: rfqAmount,
      })
      .select("id")
      .single();
    const recipients = [
      {
        subcontractor_id: sub.id,
        business_name: "Linked Sub",
        email: sub.email || `linked-${ts}@example.test`,
        status: recStatus,
        quote_amount: recAmount,
        rfq_id: rfqRow.id,
      },
    ];
    if (unlinkedAccepted) {
      recipients.push({
        business_name: "Email Only Sub",
        email: `only-${ts}@example.test`,
        status: "accepted",
        quote_amount: 5000,
      });
    }
    const pkg = await createPackage(token, {
      jobId,
      address: `${MARK} Align ${ts}`,
      tradeId,
      tradeLabel,
      ts,
      recipients,
    });
    const { data: recips } = await svc
      .from("rfq_recipients")
      .select("id, rfq_id")
      .eq("package_id", pkg.packageId);
    for (const rec of recips || []) {
      const src = recipients.find((r) =>
        rec.rfq_id ? r.rfq_id === rec.rfq_id : !r.rfq_id
      );
      if (!src) continue;
      await svc
        .from("rfq_recipients")
        .update({
          status: src.status,
          quote_amount: src.quote_amount ?? null,
        })
        .eq("id", rec.id);
    }
    return { jobId, packageId: pkg.packageId, rfqId: rfqRow.id };
  }

  // 05A — package_only_accept
  {
    const fx = await setupLinkedPackage({
      rfqStatus: "received",
      rfqAmount: 8000,
      recStatus: "received",
      recAmount: null,
      unlinkedAccepted: true,
    });
    try {
      const { status, body } = await fetchAlignment(token, fx.jobId);
      const types = warningTypes(body);
      if (status !== 200 || !body?.ok || !types.includes("package_only_accept")) {
        run.fail("W09-API-05A package_only_accept warning", `${status} types=${types.join(",")}`);
      } else {
        run.pass("W09-API-05A package_only_accept warning returned");
      }
    } finally {
      await cleanup(svc, { packageId: fx.packageId, jobId: fx.jobId, rfqIds: [fx.rfqId] });
    }
  }

  // 05B — stale_rfq
  {
    const fx = await setupLinkedPackage({
      rfqStatus: "received",
      rfqAmount: 9000,
      recStatus: "accepted",
      recAmount: 9000,
    });
    try {
      const { status, body } = await fetchAlignment(token, fx.jobId);
      const types = warningTypes(body);
      if (status !== 200 || !body?.ok || !types.includes("stale_rfq")) {
        run.fail("W09-API-05B stale_rfq warning", `${status} types=${types.join(",")}`);
      } else {
        run.pass("W09-API-05B stale_rfq warning returned");
      }
    } finally {
      await cleanup(svc, { packageId: fx.packageId, jobId: fx.jobId, rfqIds: [fx.rfqId] });
    }
  }

  // 05C — amount_mismatch
  {
    const fx = await setupLinkedPackage({
      rfqStatus: "accepted",
      rfqAmount: 10000,
      recStatus: "accepted",
      recAmount: 11000,
    });
    try {
      const { status, body } = await fetchAlignment(token, fx.jobId);
      const types = warningTypes(body);
      if (status !== 200 || !body?.ok || !types.includes("amount_mismatch")) {
        run.fail("W09-API-05C amount_mismatch warning", `${status} types=${types.join(",")}`);
      } else {
        run.pass("W09-API-05C amount_mismatch warning returned");
      }
    } finally {
      await cleanup(svc, { packageId: fx.packageId, jobId: fx.jobId, rfqIds: [fx.rfqId] });
    }
  }

  // 05D — stale_package
  {
    const fx = await setupLinkedPackage({
      rfqStatus: "accepted",
      rfqAmount: 10500,
      recStatus: "received",
      recAmount: 10500,
    });
    try {
      const { status, body } = await fetchAlignment(token, fx.jobId);
      const types = warningTypes(body);
      if (status !== 200 || !body?.ok || !types.includes("stale_package")) {
        run.fail("W09-API-05D stale_package warning", `${status} types=${types.join(",")}`);
      } else {
        run.pass("W09-API-05D stale_package warning returned");
      }
    } finally {
      await cleanup(svc, { packageId: fx.packageId, jobId: fx.jobId, rfqIds: [fx.rfqId] });
    }
  }

  // 05E — clean aligned accept
  {
    const fx = await setupLinkedPackage({
      rfqStatus: "accepted",
      rfqAmount: 12000,
      recStatus: "accepted",
      recAmount: 12000,
    });
    try {
      const { status, body } = await fetchAlignment(token, fx.jobId);
      if (status !== 200 || !body?.ok || body?.hasWarnings !== false || (body?.warnings?.length || 0) > 0) {
        run.fail(
          "W09-API-05E clean aligned accept",
          `${status} hasWarnings=${body?.hasWarnings} warnings=${body?.warnings?.length}`
        );
      } else {
        run.pass("W09-API-05E clean linked accept returns no warnings");
      }
    } finally {
      await cleanup(svc, { packageId: fx.packageId, jobId: fx.jobId, rfqIds: [fx.rfqId] });
    }
  }

  run.gap(
    "W09-API-05 UI win wizard warning smoke",
    "manual: open Mark Won on TenderDetail — alignment panel shows when hasWarnings (not in script scope)"
  );
}

export async function runW08AcceptAlignment(run) {
  run.section("P0-B2 — Accept alignment baseline + Phase 2 warn (W08/W09)");

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    run.fail("W08-accept auth", e.message);
    return;
  }

  if (!WRITE) {
    run.gap(
      "W08-API-03 Package accept mirrors linked rfqs",
      "requires --write; PATCH recipient with rfq_id → rfqs.status/quote_amount"
    );
    run.gap(
      "W08-API-03 Tender accept does not sync rfq_recipients",
      "requires --write; PATCH /api/rfq/:id accepted leaves linked recipient unchanged (W08-DRIFT-004)"
    );
    run.gap(
      "W08-API-04 Accept rollup to scope/package",
      "requires --write; document gap — accepted does not roll up scope/package (W08-DRIFT-005)"
    );
    run.gap(
      "W09-API-05 Package-only accept invisible to win source",
      "requires --write; unlinked recipient accept absent from buildWinRowsFromRfqs (W09-DRIFT-002)"
    );
    run.gap(
      "W09-API-05 alignment endpoint (05A–05E)",
      "requires --write; GET /api/tender/:jobId/accept-alignment warning types"
    );
    return;
  }

  const svc = serviceClient();
  if (!svc) {
    run.fail("W08-accept setup", "service role required");
    return;
  }

  const ts = Date.now();
  const address = `${MARK} W08 Accept ${ts}`;
  const tradeId = "plumbing";
  const tradeLabel = "Plumbing";
  const acceptedAmount = 12500;

  let jobId = null;
  let packageId = null;
  let linkedRfqId = null;
  let scopeId = null;
  let linkedRecipientId = null;
  let unlinkedRecipientId = null;

  try {
    const { data: sub } = await svc.from("subcontractors").select("id, email").limit(1).single();
    if (!sub?.id) {
      run.skip("W08-accept setup", "no subcontractors row");
      return;
    }

    jobId = await createJob(token, ts);
    if (!jobId) {
      run.fail("W08-accept setup", "could not create job");
      return;
    }

    const { data: rfqRow, error: rfqErr } = await svc
      .from("rfqs")
      .insert({
        job_id: jobId,
        subcontractor_id: sub.id,
        trade: tradeId,
        status: "received",
        quote_amount: 11000,
      })
      .select("id")
      .single();
    if (rfqErr || !rfqRow?.id) {
      run.fail("W08-accept setup", `rfqs insert: ${rfqErr?.message || "no id"}`);
      return;
    }
    linkedRfqId = rfqRow.id;

    const pkgCreate = await createPackage(token, {
      jobId,
      address,
      tradeId,
      tradeLabel,
      ts,
      recipients: [
        {
          subcontractor_id: sub.id,
          business_name: "Linked Plumber",
          email: sub.email || `linked-${ts}@example.test`,
          status: "received",
          rfq_id: linkedRfqId,
        },
        {
          business_name: "Email Only Plumber",
          email: `email-only-${ts}@example.test`,
          status: "received",
        },
      ],
    });
    packageId = pkgCreate.packageId;
    if (pkgCreate.status !== 200 || !packageId) {
      run.fail("W08-accept setup", `package create: ${pkgCreate.status} ${JSON.stringify(pkgCreate.body)}`);
      return;
    }

    const { data: scopes } = await svc
      .from("rfq_trade_scopes")
      .select("id, status")
      .eq("package_id", packageId);
    scopeId = scopes?.[0]?.id;
    const scopeStatusBefore = scopes?.[0]?.status || "";

    const { data: pkgRow } = await svc.from("rfq_packages").select("status").eq("id", packageId).single();
    const packageStatusBefore = pkgRow?.status || "";

    const { data: recips } = await svc
      .from("rfq_recipients")
      .select("id, rfq_id, email, status")
      .eq("package_id", packageId);
    linkedRecipientId = recips?.find((r) => r.rfq_id === linkedRfqId)?.id;
    unlinkedRecipientId = recips?.find((r) => !r.rfq_id)?.id;
    if (!linkedRecipientId || !unlinkedRecipientId) {
      run.fail("W08-accept setup", `expected linked + unlinked recipients; got ${JSON.stringify(recips)}`);
      return;
    }

    const rfqCountBefore = async () => {
      const { count } = await svc.from("rfqs").select("id", { count: "exact", head: true }).eq("job_id", jobId);
      return count || 0;
    };

    // ── TenderDetail-style accept: rfqs only (W08-DRIFT-004 baseline) ─────────
    run.section("TenderDetail accept path (PATCH /api/rfq/:id)");

    const tenderPatch = await patch(
      `/api/rfq/${linkedRfqId}`,
      { status: "accepted", quote_amount: acceptedAmount },
      token
    );
    if (tenderPatch.status !== 200 || !tenderPatch.body?.ok) {
      run.fail(
        "W08-API-03 Tender accept updates rfqs",
        `${tenderPatch.status} ${JSON.stringify(tenderPatch.body)}`
      );
      return;
    }

    const { data: rfqAfterTender } = await svc
      .from("rfqs")
      .select("status, quote_amount")
      .eq("id", linkedRfqId)
      .single();
    if (rfqAfterTender?.status !== "accepted" || Number(rfqAfterTender?.quote_amount) !== acceptedAmount) {
      run.fail(
        "W08-API-03 Tender accept updates rfqs",
        `expected accepted/${acceptedAmount}; got ${JSON.stringify(rfqAfterTender)}`
      );
      return;
    }
    run.pass("W08-API-03 Tender accept updates rfqs.status and quote_amount");
    run.pass("W08-API-01 PATCH /api/rfq/:id accept updates rfqs (TenderDetail path)");

    const { data: linkedRecAfterTender } = await svc
      .from("rfq_recipients")
      .select("status, quote_amount")
      .eq("id", linkedRecipientId)
      .single();
    if (linkedRecAfterTender?.status === "accepted") {
      run.fail(
        "W08-API-03 Tender accept does not sync rfq_recipients",
        `recipient became accepted — unexpected sync`
      );
      return;
    }
    run.pass("W08-API-03 Tender accept does not update linked rfq_recipients (W08-DRIFT-004 baseline)");

    // Reset rfq to received for package accept test
    await svc.from("rfqs").update({ status: "received", quote_amount: 11000 }).eq("id", linkedRfqId);
    await svc.from("rfq_recipients").update({ status: "received", quote_amount: null }).eq("id", linkedRecipientId);

    // ── PackageDetail accept with linked rfq_id (W08-API-03) ─────────────────
    run.section("PackageDetail accept path (linked rfq_id)");

    const countBeforePkgAccept = await rfqCountBefore();
    const pkgAcceptAmount = 13200;

    const pkgPatch = await patch(
      `/api/rfq-packages/${packageId}/recipients/${linkedRecipientId}`,
      { status: "accepted", quote_amount: pkgAcceptAmount },
      token
    );
    if (pkgPatch.status !== 200 || !pkgPatch.body?.ok) {
      run.fail(
        "W08-API-03 Package accept mirrors rfqs",
        `${pkgPatch.status} ${JSON.stringify(pkgPatch.body)}`
      );
      return;
    }

    const countAfterPkgAccept = await rfqCountBefore();
    if (countAfterPkgAccept !== countBeforePkgAccept) {
      run.fail(
        "W08-API-03 Package accept does not duplicate rfqs",
        `${countBeforePkgAccept} → ${countAfterPkgAccept}`
      );
      return;
    }
    run.pass("W08-API-03 Package accept does not duplicate rfqs");

    const { data: rfqAfterPkg } = await svc
      .from("rfqs")
      .select("status, quote_amount")
      .eq("id", linkedRfqId)
      .single();
    if (rfqAfterPkg?.status !== "accepted" || Number(rfqAfterPkg?.quote_amount) !== pkgAcceptAmount) {
      run.fail(
        "W08-API-03 Package accept mirrors linked rfqs",
        `expected accepted/${pkgAcceptAmount}; got ${JSON.stringify(rfqAfterPkg)}`
      );
      return;
    }
    run.pass("W08-API-03 Package accept with linked rfq_id syncs rfqs.status and quote_amount");

    const { data: linkedRecAfterPkg } = await svc
      .from("rfq_recipients")
      .select("status, quote_amount")
      .eq("id", linkedRecipientId)
      .single();
    if (linkedRecAfterPkg?.status !== "accepted") {
      run.fail("W08-API-03 Package accept updates recipient", `status=${linkedRecAfterPkg?.status}`);
      return;
    }
    run.pass("W08-API-03 Package accept updates rfq_recipients when accepted via package path");

    // ── W08-API-04 Rollup gap ─────────────────────────────────────────────────
    run.section("W08-API-04 Accept rollup (scope/package)");

    const { data: scopeAfterAccept } = await svc
      .from("rfq_trade_scopes")
      .select("status")
      .eq("id", scopeId)
      .single();
    if (scopeAfterAccept?.status === "accepted") {
      run.fail("W08-API-04 scope rollup", "rfq_trade_scopes.status became accepted unexpectedly");
      return;
    }
    run.gap(
      "W08-API-04 accepted does not roll up to rfq_trade_scopes",
      `scope stayed ${scopeAfterAccept?.status || scopeStatusBefore} after recipient accept (W08-DRIFT-005)`
    );

    const { data: pkgAfterAccept } = await svc.from("rfq_packages").select("status").eq("id", packageId).single();
    if (pkgAfterAccept?.status !== packageStatusBefore) {
      run.gap(
        "W08-API-04 rfq_packages status changed on accept",
        `${packageStatusBefore} → ${pkgAfterAccept?.status} — unexpected; review W08-DRIFT-005`
      );
    } else {
      run.gap(
        "W08-API-04 accepted does not roll up to rfq_packages",
        `package status unchanged (${packageStatusBefore}) after recipient accept (W08-DRIFT-005)`
      );
    }

    // ── W09-API-05 Win source + package-only invisible ────────────────────────
    run.section("W09-API-05 Win handoff source (rfqs only)");

    const unlinkedAmount = 9800;
    await patch(
      `/api/rfq-packages/${packageId}/recipients/${unlinkedRecipientId}`,
      { status: "accepted", quote_amount: unlinkedAmount },
      token
    );

    const { data: allRfqs } = await svc.from("rfqs").select("*").eq("job_id", jobId);
    const winRows = buildWinRowsFromRfqs(allRfqs);
    const acceptedWinRows = winRows.filter((w) => w.status === "accepted");

    if (acceptedWinRows.length !== 1 || acceptedWinRows[0].id !== linkedRfqId) {
      run.fail(
        "W09-API-05 win source is rfqs only (linked path)",
        `expected 1 accepted win row for linked rfq; got ${JSON.stringify(acceptedWinRows)}`
      );
      return;
    }
    run.pass("W09-API-05 linked package accept visible via synced rfqs in win-row builder");

    const rfqForEmailOnly = (allRfqs || []).find(
      (r) => String(r.trade) === tradeId && Number(r.quote_amount) === unlinkedAmount
    );
    if (rfqForEmailOnly) {
      run.fail("W09-API-05 email-only package accept", "unexpected rfqs row created for unlinked recipient");
      return;
    }
    run.gap(
      "W09-API-05 email-only package accept invisible to win source",
      "unlinked recipient accepted on package but no rfqs row — alignment endpoint surfaces package_only_accept (Phase 2)"
    );

    const { status: alignStatus, body: alignBody } = await fetchAlignment(token, jobId);
    const alignTypes = warningTypes(alignBody);
    if (alignStatus !== 200 || !alignBody?.ok || !alignTypes.includes("package_only_accept")) {
      run.fail(
        "W09-API-05A alignment on main fixture",
        `expected package_only_accept; got ${alignStatus} ${alignTypes.join(",")}`
      );
    } else {
      run.pass("W09-API-05A main fixture — alignment endpoint detects package_only_accept");
    }

    run.gap(
      "W08/W09 matcher and mail transport",
      "no accept-path changes to imapQuoteMatch or sendPlainMail in this baseline"
    );

    await runAlignmentEndpointTests(run, token, svc, sub);
  } finally {
    await cleanup(svc, { packageId, jobId, rfqIds: linkedRfqId ? [linkedRfqId] : [] });
  }
}
