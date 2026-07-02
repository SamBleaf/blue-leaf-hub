/**
 * W03 — Fee Proposal / PTSA API skeletons
 * W03-API-05, W03-API-05b, W03-API-07
 */
import { WRITE, post, get, getAuthToken, serviceClient } from "./_helpers.mjs";

const STUB_PDF_B64 = Buffer.from("%PDF-1.4 stub\n%%EOF").toString("base64");

export async function runW03(run) {
  run.section("W03 Fee Proposal / PTSA");

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    run.fail("Auth token", e.message);
    return;
  }

  if (!WRITE) {
    run.skip("W03-API-05 PTSA mark-signed job link behaviour", "requires --write");
    run.skip("W03-API-05b fee proposal accept stamps lead fee_proposal_id", "requires --write");
    run.skip("W03-API-05c (DISC-002) finance accept stamps lead fee_proposal_id", "requires --write");
    run.skip("W03-API-07 PTSA signed without site_address handoff", "requires --write");
    run.gap("W03-API-05 PTSA mark-signed (read-only)", "verify with --write when site_address present");
    run.gap("W03-API-07 PTSA no address (read-only)", "SAM-W03-001 — signed stored; handoff guard pending");
    return;
  }

  const ts = Date.now();
  const svc = serviceClient();

  const { body: leadA } = await post(
    "/api/sales/leads",
    {
      first_name: "PTSA",
      last_name: `WithAddr${ts}`,
      email: `ptsa-a-${ts}@example.test`,
      lead_source: "referral", // mig 127: lead_source_category required on create
      site_address: `${ts} Test Street, Adelaide SA 5000`,
      stage: "accepted",
    },
    token
  );
  const leadAId = leadA?.lead?.id;
  let jobAId = null;

  if (leadAId) {
    const signed = await post(
      `/api/sales/leads/${leadAId}/ptsa/mark-signed`,
      { signedPdfBase64: STUB_PDF_B64, filename: `ptsa-${ts}.pdf` },
      token
    );
    const { data: refreshed } = await svc.from("leads").select("job_id, ptsa_status").eq("id", leadAId).single();
    jobAId = refreshed?.job_id;
    if (signed.status === 200 && refreshed?.ptsa_status === "signed" && refreshed?.job_id) {
      run.pass("W03-API-05 PTSA mark-signed links job when site_address present");
    } else {
      run.gap(
        "W03-API-05 PTSA mark-signed job link behaviour",
        `signed=${refreshed?.ptsa_status} job_id=${refreshed?.job_id || "null"}`
      );
    }
  }

  const { body: leadB } = await post(
    "/api/sales/leads",
    {
      first_name: "PTSA",
      last_name: `NoAddr${ts}`,
      email: `ptsa-b-${ts}@example.test`,
      lead_source: "referral", // mig 127: lead_source_category required on create
      stage: "accepted",
    },
    token
  );
  const leadBId = leadB?.lead?.id;

  if (leadBId) {
    const signed = await post(
      `/api/sales/leads/${leadBId}/ptsa/mark-signed`,
      { signedPdfBase64: STUB_PDF_B64, filename: `ptsa-noaddr-${ts}.pdf` },
      token
    );
    const { data: refreshed } = await svc.from("leads").select("job_id, ptsa_status").eq("id", leadBId).single();
    // SAM-W03-001 Option B: signed stored but provisioning.siteAddressWarning must be true when jobId is null
    if (signed.status === 200 && refreshed?.ptsa_status === "signed" && !refreshed?.job_id) {
      if (signed.body?.provisioning?.siteAddressWarning === true) {
        run.pass("W03-API-07 PTSA signed without site_address returns siteAddressWarning:true");
      } else {
        run.fail(
          "W03-API-07 PTSA signed without site_address returns siteAddressWarning:true",
          `provisioning.siteAddressWarning=${JSON.stringify(signed.body?.provisioning?.siteAddressWarning)} — server fix needed (W03-DRIFT-002 / SAM-W03-001 Option B)`
        );
      }
    } else {
      run.fail("W03-API-07 PTSA no-address baseline", `status=${signed.status} ptsa_status=${refreshed?.ptsa_status} job_id=${refreshed?.job_id}`);
    }
    if (svc) await svc.from("leads").delete().eq("id", leadBId);
  }

  run.section("W03-API-05b fee proposal accept → lead.fee_proposal_id");

  const fpTs = Date.now();
  const siteAddress = `${fpTs} Fee Link St, Adelaide SA 5000`;
  const { body: leadFp } = await post(
    "/api/sales/leads",
    {
      first_name: "FeeLink",
      last_name: `Test${fpTs}`,
      email: `feelink-${fpTs}@example.test`,
      lead_source: "referral", // mig 127: lead_source_category required on create
      site_address: siteAddress,
      stage: "fee_proposal",
    },
    token
  );
  const leadFpId = leadFp?.lead?.id;
  let jobFpId = null;
  let fpId = null;

  if (leadFpId && svc) {
    const convert = await post(`/api/sales/leads/${leadFpId}/convert-to-job`, {}, token);
    jobFpId = convert.body?.job?.id;
    if (convert.status === 200 && jobFpId) {
      const { data: fpRow, error: fpErr } = await svc
        .from("fee_proposals")
        .insert({
          job_id: jobFpId,
          status: "draft",
          quote_number: `BLH-TEST-${fpTs}`,
          address: siteAddress,
          client_name: "FeeLink Test",
        })
        .select("id")
        .single();
      fpId = fpRow?.id;
      if (fpErr || !fpId) {
        run.fail("W03-API-05b setup fee_proposal insert", fpErr?.message || "no id");
      } else {
        const accept = await post(`/api/fee-proposal/${fpId}/accept`, {}, token);
        const { data: leadRow } = await svc
          .from("leads")
          .select("fee_proposal_id, job_id")
          .eq("id", leadFpId)
          .single();
        if (
          accept.status === 200 &&
          accept.body?.ok &&
          leadRow?.fee_proposal_id === fpId &&
          leadRow?.job_id === jobFpId
        ) {
          run.pass("W03-API-05b accept stamps leads.fee_proposal_id for W04 handoff");
        } else {
          run.fail(
            "W03-API-05b accept stamps leads.fee_proposal_id",
            `accept=${accept.status} fee_proposal_id=${leadRow?.fee_proposal_id} expected=${fpId}`
          );
        }
        const leadGet = await get(`/api/sales/leads/${leadFpId}`, token);
        const linkedId = leadGet.body?.lead?.fee_proposal_id ?? leadGet.body?.lead?.feeProposalId;
        if (linkedId === fpId) {
          run.pass("W03-API-05b GET lead returns fee_proposal_id for tender handoff");
        } else {
          run.fail(
            "W03-API-05b GET lead fee_proposal_id",
            `got ${JSON.stringify(linkedId)} expected ${fpId}`
          );
        }
        await svc.from("fee_proposals").delete().eq("id", fpId);
      }
    } else {
      run.fail("W03-API-05b setup convert-to-job", `${convert.status} ${JSON.stringify(convert.body)}`);
    }
    if (svc) {
      if (jobFpId) {
        await svc.from("job_fact_history").delete().eq("job_id", jobFpId);
        await svc.from("job_events").delete().eq("job_id", jobFpId);
        await svc.from("jobs").delete().eq("id", jobFpId);
      }
      await svc.from("lead_activities").delete().eq("lead_id", leadFpId);
      await svc.from("leads").delete().eq("id", leadFpId);
    }
  }

  // ── W03-API-05c (DISC-002-FINANCE-FEE-LINK-01) ── finance accept must stamp leads.fee_proposal_id (parity with sales)
  run.section("W03-API-05c (DISC-002) finance accept → lead.fee_proposal_id + contract value");
  const fnTs = Date.now();
  const fnAddr = `${fnTs} Finance Link St, Adelaide SA 5000`;
  const { body: leadFn } = await post(
    "/api/sales/leads",
    { first_name: "FinanceLink", last_name: `Test${fnTs}`, email: `financelink-${fnTs}@example.test`, lead_source: "referral", site_address: fnAddr, stage: "fee_proposal" },
    token
  );
  const leadFnId = leadFn?.lead?.id;
  let jobFnId = null, fnFpId = null;
  if (leadFnId && svc) {
    const convert = await post(`/api/sales/leads/${leadFnId}/convert-to-job`, {}, token);
    jobFnId = convert.body?.job?.id;
    if (convert.status === 200 && jobFnId) {
      const { data: fpRow, error: fpErr } = await svc
        .from("fee_proposals")
        .insert({ job_id: jobFnId, status: "draft", quote_number: `BLH-TEST-FIN-${fnTs}`, address: fnAddr, client_name: "FinanceLink Test", total_inc_gst: 110000, tax_amount: 10000 })
        .select("id")
        .single();
      fnFpId = fpRow?.id;
      if (fpErr || !fnFpId) {
        run.fail("W03-API-05c setup fee_proposal insert", fpErr?.message || "no id");
      } else {
        const accept = await post(`/api/finance/fee-proposals/${fnFpId}/accept`, {}, token);
        const { data: leadRow } = await svc.from("leads").select("fee_proposal_id").eq("id", leadFnId).single();
        // DISC-002: finance accept now stamps leads.fee_proposal_id (parity with the sales accept route)
        if (accept.status === 200 && accept.body?.ok && leadRow?.fee_proposal_id === fnFpId) {
          run.pass("W03-API-05c (DISC-002) finance accept stamps leads.fee_proposal_id");
        } else {
          run.fail("W03-API-05c finance accept stamps leads.fee_proposal_id", `accept=${accept.status} fee_proposal_id=${leadRow?.fee_proposal_id} expected=${fnFpId}`);
        }
        // no regression: contract value still written from typed totals (110000 inc − 10000 tax = 100000 ex)
        const { data: jobRow } = await svc.from("jobs").select("original_contract_value").eq("id", jobFnId).single();
        if (accept.body?.contract_value_set === 100000 && jobRow?.original_contract_value === 100000) {
          run.pass("W03-API-05c finance accept still sets contract value (no regression)");
        } else {
          run.fail("W03-API-05c finance contract value", `set=${accept.body?.contract_value_set} job.original=${jobRow?.original_contract_value} expected=100000`);
        }
        await svc.from("fee_proposals").delete().eq("id", fnFpId);
      }
    } else {
      run.fail("W03-API-05c setup convert-to-job", `${convert.status} ${JSON.stringify(convert.body)}`);
    }
    if (jobFnId) {
      await svc.from("job_fact_history").delete().eq("job_id", jobFnId);
      await svc.from("job_events").delete().eq("job_id", jobFnId);
      await svc.from("jobs").delete().eq("id", jobFnId);
    }
    await svc.from("lead_activities").delete().eq("lead_id", leadFnId);
    await svc.from("leads").delete().eq("id", leadFnId);
  }

  if (svc) {
    if (jobAId) await svc.from("jobs").delete().eq("id", jobAId);
    if (leadAId) await svc.from("leads").delete().eq("id", leadAId);
  }
}
