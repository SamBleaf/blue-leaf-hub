/**
 * Read-only operations readiness checklist (P0-B5).
 * Surfaces post-win setup gaps — no writes.
 */

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v) {
  return String(v || "").trim();
}

function makeItem(id, label, status, detail, link = null) {
  return { id, label, status, detail, link };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{ jobId?: string, projectId?: string }} opts
 */
export async function computeOpsReadiness(sb, { jobId, projectId } = {}) {
  const jid = str(jobId);
  const pid = str(projectId);

  if (!jid && !pid) {
    throw new Error("jobId or projectId required.");
  }

  let project = null;
  let job = null;

  if (pid) {
    const { data, error } = await sb.from("projects").select("*").eq("id", pid).maybeSingle();
    if (error) throw error;
    project = data;
    if (project?.job_id) {
      const { data: j, error: je } = await sb.from("jobs").select("*").eq("id", project.job_id).maybeSingle();
      if (je) throw je;
      job = j;
    }
  } else if (jid) {
    const { data: j, error: je } = await sb.from("jobs").select("*").eq("id", jid).maybeSingle();
    if (je) throw je;
    job = j;
    if (job?.id) {
      const { data: p, error: pe } = await sb
        .from("projects")
        .select("*")
        .eq("job_id", job.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (pe) throw pe;
      project = p;
    }
  }

  const effectiveJobId = job?.id || project?.job_id || jid || null;
  const effectiveProjectId = project?.id || null;

  const items = [];

  // 1. Project row created
  items.push(
    project?.id
      ? makeItem("project_created", "Project row created", "ok", "Operations project exists for this won job.")
      : makeItem(
          "project_created",
          "Project row created",
          "missing",
          "No projects row found — win-finalize or trigger 096 may not have run."
        )
  );

  // 2. Project has job_id
  items.push(
    project?.job_id
      ? makeItem("project_job_id", "Project linked to job", "ok", `job_id ${project.job_id} is set on the project.`)
      : makeItem(
          "project_job_id",
          "Project linked to job",
          project ? "missing" : "missing",
          "Project row is missing job_id — Operations spine is incomplete."
        )
  );

  const clientName = str(project?.portal_client_name) || str(job?.client_name);
  const clientEmail = str(project?.portal_client_email) || str(job?.client_email);
  const address = str(project?.address) || str(job?.address);
  const contractValue =
    numOrNull(job?.original_contract_value) ?? numOrNull(project?.contract_value);

  // 3. Client name
  items.push(
    clientName
      ? makeItem("client_name", "Client name present", "ok", clientName)
      : makeItem(
          "client_name",
          "Client name present",
          "missing",
          "No portal_client_name on project or client_name on job.",
          effectiveProjectId ? `/portal-admin/${effectiveProjectId}` : null
        )
  );

  // 4. Client email
  items.push(
    clientEmail
      ? makeItem("client_email", "Client email present", "ok", clientEmail)
      : makeItem(
          "client_email",
          "Client email present",
          "missing",
          "No portal_client_email on project or client_email on job.",
          effectiveProjectId ? `/portal-admin/${effectiveProjectId}` : null
        )
  );

  // 5. Address
  items.push(
    address && address !== "Unknown"
      ? makeItem("address_present", "Project address present", "ok", address)
      : makeItem(
          "address_present",
          "Project address present",
          "missing",
          "Project or job address is missing or placeholder."
        )
  );

  // 6. Contract value
  items.push(
    contractValue != null && contractValue > 0
      ? makeItem(
          "contract_value",
          "Contract value present",
          "ok",
          `$${contractValue.toLocaleString("en-AU")} ex GST recorded on job/project.`
        )
      : makeItem(
          "contract_value",
          "Contract value present",
          "warning",
          "No original_contract_value on job — fee proposal may not have been accepted or carried at win."
        )
  );

  // Parallel reads for remaining checks
  let acceptedRfqs = [];
  let costIntelCount = 0;
  let procurementCount = 0;
  let scheduleTaskCount = 0;
  let whsProfileCount = 0;
  let unissuedPoCount = 0;
  let lead = null;

  if (effectiveJobId) {
    const [
      rfqRes,
      ciRes,
      procRes,
      leadRes,
    ] = await Promise.all([
      sb.from("rfqs").select("id, trade, quote_amount, status").eq("job_id", effectiveJobId).eq("status", "accepted"),
      sb.from("cost_intelligence").select("id", { count: "exact", head: true }).eq("job_id", effectiveJobId),
      sb.from("procurement_items").select("id", { count: "exact", head: true }).eq("job_id", effectiveJobId),
      job?.lead_id
        ? sb.from("leads").select("id, stage, won_at").eq("id", job.lead_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (rfqRes.error) throw rfqRes.error;
    if (ciRes.error) throw ciRes.error;
    if (procRes.error) throw procRes.error;
    if (leadRes.error) throw leadRes.error;

    acceptedRfqs = rfqRes.data || [];
    costIntelCount = ciRes.count || 0;
    procurementCount = procRes.count || 0;
    lead = leadRes.data;

    if (acceptedRfqs.length) {
      const rfqIds = acceptedRfqs.map((r) => r.id);
      const { data: existingPos } = await sb
        .from("purchase_orders")
        .select("rfq_id")
        .in("rfq_id", rfqIds)
        .not("rfq_id", "is", null);
      const issued = new Set((existingPos || []).map((p) => p.rfq_id));
      unissuedPoCount = acceptedRfqs.filter((r) => !issued.has(r.id)).length;
    }
  }

  if (effectiveProjectId) {
    const [schedRes, whsRes] = await Promise.all([
      sb
        .from("schedule_tasks")
        .select("id", { count: "exact", head: true })
        .eq("project_id", effectiveProjectId)
        .is("deleted_at", null),
      sb.from("whs_site_profiles").select("id", { count: "exact", head: true }).eq("project_id", effectiveProjectId),
    ]);
    if (schedRes.error) throw schedRes.error;
    if (whsRes.error) throw whsRes.error;
    scheduleTaskCount = schedRes.count || 0;
    whsProfileCount = whsRes.count || 0;
  }

  const acceptedTrades = Array.isArray(project?.accepted_trades) ? project.accepted_trades : [];
  const acceptedWithAmount = acceptedRfqs.filter((r) => numOrNull(r.quote_amount) > 0).length;

  // 7. Accepted trades / cost intelligence
  if (acceptedRfqs.length === 0 && acceptedTrades.length === 0) {
    items.push(
      makeItem(
        "accepted_trades_cost_intel",
        "Accepted trades / cost intelligence",
        "warning",
        "No accepted RFQs or accepted_trades snapshot on project yet."
      )
    );
  } else if (costIntelCount > 0 && (acceptedWithAmount > 0 || acceptedTrades.length > 0)) {
    items.push(
      makeItem(
        "accepted_trades_cost_intel",
        "Accepted trades / cost intelligence",
        "ok",
        `${costIntelCount} cost intelligence row(s); ${acceptedRfqs.length || acceptedTrades.length} accepted trade(s) recorded.`
      )
    );
  } else if (acceptedWithAmount > 0 && costIntelCount === 0) {
    items.push(
      makeItem(
        "accepted_trades_cost_intel",
        "Accepted trades / cost intelligence",
        "warning",
        "Accepted trades with quote amounts exist but no cost_intelligence rows — win may have skipped amount seeding."
      )
    );
  } else {
    items.push(
      makeItem(
        "accepted_trades_cost_intel",
        "Accepted trades / cost intelligence",
        "warning",
        `${acceptedRfqs.length} accepted RFQ(s) but only ${costIntelCount} cost intelligence row(s). Confirm quote_amount before win where possible.`
      )
    );
  }

  // 8. Lead won sync
  if (!job?.lead_id) {
    items.push(
      makeItem(
        "lead_won_sync",
        "Lead pipeline won sync",
        "ok",
        "No lead_id on job — lead sync not applicable."
      )
    );
  } else if (lead?.stage === "won") {
    items.push(
      makeItem(
        "lead_won_sync",
        "Lead pipeline won sync",
        "ok",
        `Linked lead is stage won${lead.won_at ? ` (${lead.won_at.slice(0, 10)})` : ""}.`
      )
    );
  } else {
    items.push(
      makeItem(
        "lead_won_sync",
        "Lead pipeline won sync",
        "warning",
        `Job has lead_id but lead stage is "${lead?.stage || "unknown"}" — win-finalize does not sync leads (W09-DRIFT-004).`,
        "/sales/pipeline"
      )
    );
  }

  // 9. Procurement planning started
  items.push(
    procurementCount > 0
      ? makeItem(
          "procurement_started",
          "Procurement planning started",
          "ok",
          `${procurementCount} procurement item(s) on register.`
        )
      : makeItem(
          "procurement_started",
          "Procurement planning started",
          "missing",
          "No procurement_items found for this job.",
          "/operations/procurement"
        )
  );

  // 10. Purchase order readiness
  if (acceptedRfqs.length === 0) {
    items.push(
      makeItem(
        "po_readiness",
        "Purchase order readiness",
        "warning",
        "No accepted subcontractor RFQs — PO issuance not applicable yet."
      )
    );
  } else if (unissuedPoCount === 0) {
    items.push(
      makeItem(
        "po_readiness",
        "Purchase order readiness",
        "ok",
        "Purchase orders issued for all accepted trades."
      )
    );
  } else {
    items.push(
      makeItem(
        "po_readiness",
        "Purchase order readiness",
        "missing",
        `${unissuedPoCount} accepted trade(s) without PO. Issue from Operations project or TenderDetail batch PO.`,
        effectiveProjectId ? `/operations/${effectiveProjectId}` : null
      )
    );
  }

  // 11. Schedule tasks or start date
  const hasSchedule = scheduleTaskCount > 0;
  const hasStartDate = Boolean(str(project?.tentative_start_date));
  if (hasSchedule) {
    items.push(
      makeItem(
        "schedule_ready",
        "Schedule or start date present",
        "ok",
        `${scheduleTaskCount} schedule task(s) on project.`
      )
    );
  } else if (hasStartDate) {
    items.push(
      makeItem(
        "schedule_ready",
        "Schedule or start date present",
        "ok",
        `Tentative start date ${project.tentative_start_date} set — generate full schedule when ready.`,
        effectiveProjectId ? `/operations/${effectiveProjectId}/schedule` : null
      )
    );
  } else {
    items.push(
      makeItem(
        "schedule_ready",
        "Schedule or start date present",
        "missing",
        "No schedule_tasks and no tentative_start_date — generate schedule manually.",
        effectiveProjectId ? `/operations/${effectiveProjectId}/schedule` : null
      )
    );
  }

  // 12. WHS setup started
  items.push(
    whsProfileCount > 0
      ? makeItem(
          "whs_setup",
          "WHS setup started",
          "ok",
          "WHS site profile exists for this project."
        )
      : makeItem(
          "whs_setup",
          "WHS setup started",
          "missing",
          "No whs_site_profiles row — run WHS setup manually.",
          effectiveProjectId ? `/operations/${effectiveProjectId}/whs-setup` : null
        )
  );

  // 13. Client portal enabled
  items.push(
    project?.portal_enabled
      ? makeItem(
          "portal_enabled",
          "Client portal enabled",
          "ok",
          "portal_enabled is true on project."
        )
      : makeItem(
          "portal_enabled",
          "Client portal enabled",
          "missing",
          "Client portal not enabled — invite client when ready.",
          effectiveProjectId ? `/portal-admin/${effectiveProjectId}` : null
        )
  );

  // 14. Dropbox / project folder
  const dropboxLink =
    str(project?.dropbox_shared_link) ||
    str(project?.dropbox_internal_path) ||
    str(job?.dropbox_shared_link) ||
    str(job?.dropbox_link) ||
    str(job?.dropbox_internal_path);
  items.push(
    dropboxLink
      ? makeItem(
          "dropbox_folder",
          "Dropbox / project folder present",
          "ok",
          "Dropbox link or internal path recorded on job/project."
        )
      : makeItem(
          "dropbox_folder",
          "Dropbox / project folder present",
          "warning",
          "No Dropbox shared link or internal path — confirm job folder exists."
        )
  );

  const readyCount = items.filter((i) => i.status === "ok").length;
  const missingCount = items.filter((i) => i.status === "missing").length;
  const warningCount = items.filter((i) => i.status === "warning").length;

  return {
    projectId: effectiveProjectId,
    jobId: effectiveJobId,
    items,
    readyCount,
    missingCount,
    warningCount,
    overallReady: missingCount === 0 && warningCount === 0,
  };
}
