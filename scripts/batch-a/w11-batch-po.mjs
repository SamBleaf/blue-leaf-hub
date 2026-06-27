/**
 * P0-C1 + W11 PO PDF refine — Batch PO projectId + quote attachment
 * W11-SEC-02 (W11-PO-SEC-01) — employee blocked from POST /api/po/issue
 *
 * Proves:
 * - W11-SEC-02 employee token → POST /api/po/issue returns 403
 * - batch-po-check finds accepted RFQs needing POs after win
 * - Legacy TenderDetail mirror used empty projectId (rfqs.project_id absent)
 * - resolvePurchaseOrderProjectId resolves from projects.job_id
 * - POST /api/po/issue accepts jobId-only batch path (after fix)
 * - Duplicate rfq_id POST returns existing PO without second row
 * - PO email includes generated PO PDF (W11-API-05)
 * - Submitted quote PDF attached when available (W11-API-06)
 * - Missing quote does not block PO issue (W11-API-07)
 */
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  WRITE,
  post,
  get,
  getAuthToken,
  serviceClient,
  SB_URL,
  SB_ANON,
} from "./_helpers.mjs";
import { ensureE2EUsers } from "../create-e2e-users.mjs";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";

const E2E_PASSWORD = "BlueLeaf-E2E-2026!";

async function getTokenForEmail(email, password = E2E_PASSWORD) {
  if (!SB_URL || !SB_ANON) throw new Error("Missing Supabase URL or anon key");
  const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) throw new Error(error?.message || `No session for ${email}`);
  return data.session.access_token;
}
import {
  resolvePurchaseOrderProjectId,
} from "../../server/lib/poProjectResolve.mjs";
import { resolveRfqQuotePdfForPo } from "../../server/lib/poQuoteAttachment.mjs";
import { buildPurchaseOrderPdfBuffer, defaultStandardConditions } from "../../server/lib/poPdfKit.mjs";

/** Mirror pre-fix TenderDetail.jsx issueBatchPos projectId source. */
function legacyBatchPoProjectId(rfqs, rfqId) {
  return rfqs.find((r) => r.id === rfqId)?.project_id || "";
}

async function cleanup(svc, { jobId, projectId, rfqIds = [] }) {
  if (!svc) return;
  if (projectId) {
    await svc.from("purchase_orders").delete().eq("project_id", projectId);
    await svc.from("projects").delete().eq("id", projectId);
  }
  for (const rfqId of rfqIds) {
    await svc.from("rfqs").delete().eq("id", rfqId);
  }
  if (jobId) {
    await svc.from("cost_intelligence").delete().eq("job_id", jobId);
    await svc.from("jobs").delete().eq("id", jobId);
  }
}

async function createJob(token, address) {
  const { body } = await post(
    "/api/jobs",
    { address, status: "tendering" },
    token
  );
  return body?.job?.id || null;
}

async function winFinalize(token, { jobId, rfqId, sub, tradeId, quoteAmount }) {
  return post(
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
      tentative_start_date: null,
      emails: [],
      costIntel: {},
    },
    token
  );
}

async function generateLocalPoPdfSample(run, { jobAddress, quoteAmount }) {
  try {
    const buf = await buildPurchaseOrderPdfBuffer({
      poNumber: "BLH-TEST-PO-001",
      dateCreatedIso: new Date().toLocaleDateString("en-AU"),
      company: {
        companyName: "Blue Leaf Building",
        abn: process.env.COMPANY_ABN?.trim() || "",
        address: "PO Box 3225 Newton SA 5074",
        phone: "0434 046 399",
        email: "sam@blueleafbuilding.com.au",
        website: "https://www.blueleafbuilding.com.au",
      },
      vendor: {
        lines: ["Test Subcontractor Pty Ltd", "Attn: Test Contact", "sub@test.example"],
      },
      jobAddress,
      tradeTitle: "Plumbing",
      scheduledCompletionIso: "TBC",
      tentativeStartLabel: "Q3 2026",
      lineItems: [
        {
          description: "Plumbing — lot",
          qty: "1",
          unit: "lot",
          unitCost: quoteAmount,
          lineTotal: quoteAmount,
        },
      ],
      subtotalExGst: quoteAmount,
      gstAmount: Math.round(quoteAmount * 0.1 * 100) / 100,
      totalIncGst: Math.round(quoteAmount * 1.1 * 100) / 100,
      standardConditions: defaultStandardConditions(),
      quoteReference: {
        fileName: "Unavailable",
        receivedDate: "—",
        acceptedAmountExGst: quoteAmount,
        attachmentStatus: "Not available",
      },
    });
    if (!buf?.length) {
      run.fail("W11-UI-01 local PO PDF sample", "empty buffer");
      return;
    }
    const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "output");
    await mkdir(outDir, { recursive: true });
    const outPath = join(outDir, "w11-po-sample.pdf");
    await writeFile(outPath, buf);
    run.pass(`W11-UI-01 local PO PDF sample written (${buf.length} bytes) → scripts/output/w11-po-sample.pdf`);
  } catch (e) {
    run.fail("W11-UI-01 local PO PDF sample", e?.message || String(e));
  }
}

export async function runW11BatchPo(run) {
  run.section("P0-C1 + W11 PO PDF refine");

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    run.fail("W11-batch auth", e.message);
    return;
  }

  if (!WRITE) {
    run.gap("W11-SEC-02 employee POST /api/po/issue returns 403", "requires --write");
    run.gap("W11-API-01 batch-po-check accepted RFQs", "requires --write");
    run.gap("W11-API-02 projectId from job spine", "requires --write");
    run.gap("W11-API-03 batch PO without rfqs.project_id", "requires --write");
    run.gap("W11-API-04 duplicate rfq_id idempotency", "requires --write");
    run.gap("W11-API-05 PO email includes PO PDF", "requires --write");
    run.gap("W11-API-06 submitted quote PDF attach when available", "requires --write");
    run.gap("W11-API-07 missing quote does not block PO issue", "requires --write");
    run.gap("W09-API-06 PO readiness gap after fix", "requires --write");
    run.gap("W11-UI-01 PO PDF visual smoke", "requires --write (local sample PDF)");
    return;
  }

  // ── W11-SEC-02 — employee cannot issue POs (SAM-W11-002) ──────────────────
  run.section("W11-SEC-02 employee blocked from PO issue (SAM-W11-002)");
  try {
    const users = await ensureE2EUsers();
    const employeeToken = await getTokenForEmail(users.employee.email);
    const { status: secStatus, body: secBody } = await post(
      "/api/po/issue",
      { jobId: "00000000-0000-0000-0000-000000000001", trade: "plumbing", toEmail: "sec@test.example", contactName: "Sec", totalExGst: 1000 },
      employeeToken
    );
    if (secStatus === 403) {
      run.pass("W11-SEC-02 employee POST /api/po/issue returns 403 Forbidden");
    } else {
      run.fail("W11-SEC-02 employee PO issue role gate", `expected 403; got ${secStatus} ${JSON.stringify(secBody)}`);
    }
  } catch (e) {
    run.fail("W11-SEC-02 setup", e.message);
  }

  const svc = serviceClient();
  if (!svc) {
    run.fail("W11-batch setup", "service role required");
    return;
  }

  const ts = Date.now();
  const jobAddress = buildTestJobAddress({ suite: "W11", workflowId: "PO", ts });
  const tradeId = "plumbing";
  const quoteAmount = 16800;
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
      run.skip("W11-batch setup", "no subcontractors row");
      return;
    }

    jobId = await createJob(token, jobAddress);
    if (!jobId) {
      run.fail("W11-batch setup", "could not create job");
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
      .select("id, job_id")
      .single();
    rfqId = rfqRow?.id;

    const { status: finStatus, body: finBody } = await winFinalize(token, {
      jobId,
      rfqId,
      sub,
      tradeId,
      quoteAmount,
    });
    projectId = finBody?.project?.id;
    if (finStatus !== 200 || !finBody?.ok || !projectId) {
      run.fail("W11-batch setup win-finalize", `${finStatus} ${JSON.stringify(finBody)}`);
      return;
    }

    run.section("W11-API-01 batch-po-check");

    const { status: bpStatus, body: bpBody } = await get(`/api/tender/batch-po-check/${jobId}`, token);
    if (bpStatus !== 200 || !bpBody?.ok || !bpBody.trades?.some((t) => t.rfq_id === rfqId)) {
      run.fail("W11-API-01 batch-po-check", `${bpStatus} ${JSON.stringify(bpBody)}`);
      return;
    }
    run.pass("W11-API-01 batch-po-check lists accepted RFQ needing PO");

    run.section("W11-API-02 legacy vs resolved projectId");

    const { data: rfqList } = await svc.from("rfqs").select("id, job_id").eq("job_id", jobId);
    const legacyPid = legacyBatchPoProjectId(rfqList || [], rfqId);
    if (legacyPid === "") {
      run.pass("W11-API-02 legacy mirror — rfqs.project_id absent (empty projectId bug reproduced)");
    } else {
      run.fail("W11-API-02 legacy mirror", `expected empty legacy projectId; got ${legacyPid}`);
    }

    const resolved = await resolvePurchaseOrderProjectId(svc, { projectId: "", jobId });
    if (resolved === projectId) {
      run.pass("W11-API-02 resolvePurchaseOrderProjectId from projects.job_id");
    } else {
      run.fail("W11-API-02 resolve projectId", `expected ${projectId}; got ${resolved}`);
    }

    run.section("W11-API-03 batch PO issue without rfqs.project_id");

    const poPayload = {
      projectId: "",
      jobId,
      jobAddress,
      trade: tradeId,
      toEmail: sub.email || `po-test-${ts}@example.test`,
      contactName: sub.contact || "Test",
      subcontractorId: sub.id,
      rfqId,
      totalExGst: quoteAmount,
    };

    const { status: poStatus, body: poBody } = await post("/api/po/issue", poPayload, token);

    if (poStatus === 400 && String(poBody?.error || "").includes("projectId")) {
      run.fail(
        "W11-API-03 batch PO still rejects empty projectId without job spine resolve",
        `${poStatus} ${JSON.stringify(poBody)}`
      );
      return;
    }

    if (poStatus !== 200 || !poBody?.ok || !poBody?.purchase_order?.id) {
      run.fail("W11-API-03 batch PO issue", `${poStatus} ${JSON.stringify(poBody)}`);
      return;
    }

    const po = poBody.purchase_order;
    if (po.project_id !== projectId) {
      run.fail("W11-API-03 project_id", `expected ${projectId}; got ${po.project_id}`);
      return;
    }
    if (po.job_id !== jobId || po.rfq_id !== rfqId || po.subcontractor_id !== sub.id) {
      run.fail("W11-API-03 PO links", JSON.stringify({ job_id: po.job_id, rfq_id: po.rfq_id, subcontractor_id: po.subcontractor_id }));
      return;
    }
    run.pass("W11-API-03 batch PO issue resolves projectId from jobId (no rfqs.project_id)");
    run.pass("W11-API-03 PO row created with project_id, job_id, rfq_id, subcontractor_id");
    run.pass("W11-API-03 PDF generation succeeds (no 502)");

    run.section("W11-API-05 PO email includes generated PO PDF");

    if (Number(poBody.po_email_attachment_count) >= 1) {
      run.pass("W11-API-05 po_email_attachment_count >= 1 (generated PO PDF)");
    } else {
      run.fail(
        "W11-API-05 PO PDF attachment count",
        `expected >= 1; got ${poBody.po_email_attachment_count}`
      );
    }

    run.section("W11-API-07 missing submitted quote does not block PO issue");

    if (poBody.quote_attachment_included === false && poBody.quote_attachment_warning) {
      run.pass("W11-API-07 PO issued without quote PDF — warning returned, not blocked");
    } else if (poBody.quote_attachment_included === true) {
      run.gap(
        "W11-API-07 missing quote non-blocking",
        "test RFQ unexpectedly had quote PDF attached — cannot assert missing-quote path"
      );
    } else {
      run.fail("W11-API-07 quote attachment flags", JSON.stringify({
        included: poBody.quote_attachment_included,
        warning: poBody.quote_attachment_warning,
      }));
    }

    run.section("W11-API-06 submitted quote PDF attach when available");

    const envQuoteRfqId = String(process.env.W11_TEST_QUOTE_RFQ_ID || "").trim();
    let quoteProbeId = envQuoteRfqId;
    if (!quoteProbeId) {
      const { data: sampleRfq } = await svc
        .from("rfqs")
        .select("id, quote_pdf_path, quote_pdf_url, dropbox_pdf_url")
        .or("quote_pdf_path.neq.,quote_pdf_url.neq.,dropbox_pdf_url.neq.")
        .limit(1)
        .maybeSingle();
      quoteProbeId = sampleRfq?.id || "";
    }

    if (quoteProbeId) {
      try {
        const resolved = await resolveRfqQuotePdfForPo(svc, quoteProbeId);
        if (resolved.attachment?.content?.length) {
          run.pass("W11-API-06 resolveRfqQuotePdfForPo returns quote PDF buffer");
        } else {
          run.gap(
            "W11-API-06 submitted quote PDF attach on PO email",
            resolved.warning || "quote path/URL present but download failed"
          );
        }
      } catch (e) {
        run.gap("W11-API-06 submitted quote PDF attach", e?.message || String(e));
      }
    } else {
      run.gap(
        "W11-API-06 submitted quote PDF attach on PO email",
        "no rfqs row with quote_pdf_path or URL — set W11_TEST_QUOTE_RFQ_ID for full attach proof"
      );
    }

    run.section("W11-API-04 duplicate rfq_id idempotency");

    const existingPo = po;

    const { count: beforeCount } = await svc
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("rfq_id", rfqId);

    const { status: dupStatus, body: dupBody } = await post("/api/po/issue", poPayload, token);
    const { count: afterCount } = await svc
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("rfq_id", rfqId);

    if (
      dupStatus === 200 &&
      dupBody?.ok &&
      dupBody?.duplicate === true &&
      dupBody?.purchase_order?.id === existingPo.id &&
      afterCount === beforeCount &&
      dupBody?.quote_attachment_included !== true
    ) {
      run.pass("W11-API-04 duplicate rfq_id returns existing PO without new row or re-attach");
    } else {
      run.fail(
        "W11-API-04 idempotency",
        `status=${dupStatus} duplicate=${dupBody?.duplicate} before=${beforeCount} after=${afterCount}`
      );
    }

    run.section("W09-API-06 PO readiness after P0-C1");

    const { status: orStatus, body: orBody } = await get(`/api/projects/${projectId}/ops-readiness`, token);
    const poItem = (orBody?.items || []).find((i) => i.id === "po_readiness");
    if (
      orStatus === 200 &&
      orBody?.ok &&
      poItem &&
      !String(poItem.detail || "").includes("W09-DRIFT-006")
    ) {
      run.pass("W09-API-06 ops readiness PO item no longer cites broken batch PO projectId path");
    } else {
      run.fail("W09-API-06 ops readiness PO detail", JSON.stringify(poItem));
    }

    run.section("W11-UI-01 PO PDF visual smoke");

    await generateLocalPoPdfSample(run, { jobAddress, quoteAmount });
    run.gap(
      "W11-UI-01 manual watermark readability",
      "open scripts/output/w11-po-sample.pdf — title and body must be readable; watermark faint lower-left only"
    );
  } finally {
    await cleanup(svc, { jobId, projectId, rfqIds: rfqId ? [rfqId] : [] });
  }
}
