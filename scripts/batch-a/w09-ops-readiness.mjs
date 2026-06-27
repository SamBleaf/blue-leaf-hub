/**
 * P0-B5 — Operations readiness checklist (W09-API-04/06/07)
 *
 * Proves read-only computeOpsReadiness + GET endpoints:
 * - Fresh won job: core project ok, ops setup items missing
 * - Lead sync gap when lead_id set
 * - PO readiness flags unissued trades + batch PO projectId note
 * - GET is read-only (table counts unchanged)
 */
import {
  WRITE,
  MARK,
  post,
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

async function createJob(token, ts) {
  const { body } = await post(
    "/api/jobs",
    { address: `${MARK} W09 Ops ${ts} St, Adelaide SA 5000`, status: "tendering" },
    token
  );
  return body?.job?.id || null;
}

async function fetchProjectReadiness(token, projectId) {
  return get(`/api/projects/${projectId}/ops-readiness`, token);
}

async function fetchJobReadiness(token, jobId) {
  return get(`/api/jobs/${jobId}/ops-readiness`, token);
}

async function winFinalize(token, { jobId, rfqId, sub, tradeId, quoteAmount }) {
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
  return post(
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
}

async function tableCounts(svc, jobId, projectId) {
  const counts = {};
  const tables = [
    ["procurement_items", "job_id", jobId],
    ["schedule_tasks", "project_id", projectId],
    ["whs_site_profiles", "project_id", projectId],
    ["cost_intelligence", "job_id", jobId],
    ["projects", "id", projectId],
  ];
  for (const [table, col, id] of tables) {
    if (!id) {
      counts[table] = 0;
      continue;
    }
    const { count } = await svc.from(table).select("id", { count: "exact", head: true }).eq(col, id);
    counts[table] = count || 0;
  }
  return counts;
}

function itemStatus(body, id) {
  return (body?.items || []).find((i) => i.id === id)?.status;
}

function itemDetail(body, id) {
  return (body?.items || []).find((i) => i.id === id)?.detail || "";
}

export async function runW09OpsReadiness(run) {
  run.section("P0-B5 — Operations readiness checklist (W09)");

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    run.fail("W09-ops auth", e.message);
    return;
  }

  if (!WRITE) {
    run.gap("W09-API-07 operations readiness checklist", "requires --write");
    run.gap("W09-API-07A fresh won job core ok ops missing", "requires --write");
    run.gap("W09-API-07B GET read-only side effects", "requires --write");
    run.gap("W09-API-04 lead sync gap flagged", "requires --write");
    run.gap("W09-API-06 PO/projectId readiness gap flagged", "requires --write");
    run.gap("W09-UI-05 Operations Project banner smoke", "manual: open /operations/:projectId after win");
    run.gap("W09-E2E-01 Mark Won → Operations checklist", "manual/E2E extend batch-a");
    return;
  }

  const svc = serviceClient();
  if (!svc) {
    run.fail("W09-ops setup", "service role required");
    return;
  }

  const ts = Date.now();
  const tradeId = "plumbing";
  const quoteAmount = 15500;
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
      run.skip("W09-ops setup", "no subcontractors row");
      return;
    }

    jobId = await createJob(token, ts);
    if (!jobId) {
      run.fail("W09-ops setup", "could not create job");
      return;
    }

    const { data: rfqRow } = await svc
      .from("rfqs")
      .insert({
        job_id: jobId,
        subcontractor_id: sub.id,
        trade: tradeId,
        status: "accepted",
        quote_amount: quoteAmount,
      })
      .select("id")
      .single();
    rfqId = rfqRow?.id;

    const { body: leadBody } = await post(
      "/api/sales/leads",
      {
        first_name: "Ops",
        last_name: "Test",
        stage: "tender",
        site_address: `${MARK} W09 Ops Lead ${ts}, Adelaide SA 5000`,
      },
      token
    );
    leadId = leadBody?.lead?.id;
    if (!leadId) {
      run.fail("W09-ops setup lead", JSON.stringify(leadBody));
      return;
    }
    await svc
      .from("jobs")
      .update({ lead_id: leadId, client_name: "Ops Test Client", client_email: "ops@test.example" })
      .eq("id", jobId);
    await svc.from("leads").update({ job_id: jobId }).eq("id", leadId);

    const { status: finStatus, body: finBody } = await winFinalize(token, {
      jobId,
      rfqId,
      sub,
      tradeId,
      quoteAmount,
    });
    projectId = finBody?.project?.id;
    if (finStatus !== 200 || !finBody?.ok || !projectId) {
      run.fail("W09-ops setup win-finalize", `${finStatus} ${JSON.stringify(finBody)}`);
      return;
    }

    run.section("W09-API-07 Operations readiness checklist");

    const beforeCounts = await tableCounts(svc, jobId, projectId);
    const { status, body } = await fetchProjectReadiness(token, projectId);
    const afterCounts = await tableCounts(svc, jobId, projectId);

    if (status !== 200 || !body?.ok || !Array.isArray(body.items) || body.items.length < 14) {
      run.fail("W09-API-07 checklist shape", `${status} items=${body?.items?.length}`);
      return;
    }
    run.pass(`W09-API-07 returns ${body.items.length} checklist items`);

    if (itemStatus(body, "project_created") === "ok" && itemStatus(body, "project_job_id") === "ok") {
      run.pass("W09-API-07A core project items ok after win");
    } else {
      run.fail(
        "W09-API-07A core project items ok",
        `project_created=${itemStatus(body, "project_created")} project_job_id=${itemStatus(body, "project_job_id")}`
      );
    }

    const opsMissing = ["procurement_started", "schedule_ready", "whs_setup", "portal_enabled"].every(
      (id) => itemStatus(body, id) === "missing"
    );
    if (opsMissing) {
      run.pass("W09-API-07A ops setup items missing on fresh won job");
    } else {
      run.fail(
        "W09-API-07A ops setup items missing",
        body.items
          .filter((i) => ["procurement_started", "schedule_ready", "whs_setup", "portal_enabled"].includes(i.id))
          .map((i) => `${i.id}:${i.status}`)
          .join(", ")
      );
    }

    if (JSON.stringify(beforeCounts) === JSON.stringify(afterCounts)) {
      run.pass("W09-API-07B GET is read-only — table counts unchanged");
    } else {
      run.fail(
        "W09-API-07B read-only",
        `before=${JSON.stringify(beforeCounts)} after=${JSON.stringify(afterCounts)}`
      );
    }

    run.section("W09-API-04 Lead sync gap");

    if (itemStatus(body, "lead_won_sync") === "warning" && itemDetail(body, "lead_won_sync").includes("W09-DRIFT-004")) {
      run.pass("W09-API-04 lead_won_sync warning when lead_id set and stage not won");
    } else {
      run.fail(
        "W09-API-04 lead sync gap",
        `status=${itemStatus(body, "lead_won_sync")} detail=${itemDetail(body, "lead_won_sync")}`
      );
    }

    run.section("W09-API-06 PO readiness gap");

    if (
      itemStatus(body, "po_readiness") === "missing" &&
      itemDetail(body, "po_readiness").includes("without PO") &&
      !itemDetail(body, "po_readiness").includes("W09-DRIFT-006")
    ) {
      run.pass("W09-API-06 PO readiness flags unissued PO (batch PO projectId fixed P0-C1)");
    } else {
      run.fail(
        "W09-API-06 PO readiness",
        `status=${itemStatus(body, "po_readiness")} detail=${itemDetail(body, "po_readiness")}`
      );
    }

    if (itemStatus(body, "client_name") === "ok" && itemStatus(body, "client_email") === "ok") {
      run.pass("W09-API-07 client identity carried to project at win");
    } else {
      run.fail(
        "W09-API-07 client identity",
        `name=${itemStatus(body, "client_name")} email=${itemStatus(body, "client_email")}`
      );
    }

    if (itemStatus(body, "accepted_trades_cost_intel") === "ok") {
      run.pass("W09-API-07 accepted trades / cost_intelligence ok when quote_amount present at win");
    } else {
      run.fail(
        "W09-API-07 cost intelligence item",
        `status=${itemStatus(body, "accepted_trades_cost_intel")}`
      );
    }

    const { status: jobStatus, body: jobBody } = await fetchJobReadiness(token, jobId);
    if (jobStatus === 200 && jobBody?.ok && jobBody?.projectId === projectId) {
      run.pass("W09-API-07 job alias endpoint resolves same project checklist");
    } else {
      run.fail("W09-API-07 job alias", `${jobStatus} ${JSON.stringify(jobBody)}`);
    }

    if (body.overallReady === false && body.missingCount > 0) {
      run.pass("W09-API-07 overallReady false when setup items missing");
    } else {
      run.fail(
        "W09-API-07 overallReady",
        `overallReady=${body.overallReady} missing=${body.missingCount}`
      );
    }

    run.gap(
      "W09-UI-05 Operations Project banner smoke",
      "manual: /operations/:projectId shows dismissible Operations setup checklist banner"
    );
    run.gap(
      "W09-E2E-01 Mark Won → Operations checklist",
      "extend e2e/tests/workflows/batch-a when E2E win path is enabled"
    );
  } finally {
    await cleanupWinJob(svc, { jobId, projectId, leadId, rfqIds: rfqId ? [rfqId] : [] });
  }
}
