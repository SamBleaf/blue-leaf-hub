/**
 * carpentryRoutes.mjs — Blue Leaf Hub Carpentry Subsidiary Module
 *
 * All routes require auth. Uses ok/err/rowToCamel/rowsToCamel from apiResponse.mjs.
 *
 * Route map:
 *   GET    /api/carpentry/jobs                   — list jobs (with basic stats)
 *   POST   /api/carpentry/jobs                   — create job (seeds default milestones)
 *   GET    /api/carpentry/jobs/:id               — get job detail
 *   PATCH  /api/carpentry/jobs/:id               — update job fields
 *   PATCH  /api/carpentry/jobs/:id/status        — change status
 *
 *   POST   /api/carpentry/buildexact/fetch       — fetch Buildexact estimate by job ID
 *
 *   GET    /api/carpentry/jobs/:id/milestones    — list milestones
 *   POST   /api/carpentry/jobs/:id/milestones    — add milestone
 *   PATCH  /api/carpentry/milestones/:mid        — update milestone
 *   DELETE /api/carpentry/milestones/:mid        — delete milestone
 *
 *   GET    /api/carpentry/jobs/:id/diary         — list diary entries (desc)
 *   POST   /api/carpentry/jobs/:id/diary         — create diary entry
 *   PATCH  /api/carpentry/diary/:eid             — update diary entry
 *
 *   GET    /api/carpentry/jobs/:id/costs         — list cost entries
 *   POST   /api/carpentry/jobs/:id/costs         — add cost entry
 *   DELETE /api/carpentry/costs/:cid             — delete cost entry
 *
 *   GET    /api/carpentry/jobs/:id/summary       — budget vs actual costing summary
 */

import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import { ok, err, rowToCamel, rowsToCamel, translateDbError } from "./apiResponse.mjs";
import { signSiteTaskPhotos, isUuid } from "./siteMedia.mjs";
import { transcribeAudio, transcriptionConfigured } from "./transcribe.mjs";
import { splitTranscriptToTasks } from "./voiceTasks.mjs";
import { buildexactConfigured, getJobById, resolveBuildexactJobId, getEstimatesByJob, getEstimateItems, beList, getCustomerContacts } from "./buildexactClient.mjs";
import { pullBuildexactEstimate } from "./buildexactDeepIntegration.mjs";
import { autoLayoutMilestones } from "./carpentryScheduleUtils.mjs";
import { parseXLSX } from "./buildexactParser.mjs";
import { geocodeToFacts } from "./geocodeService.mjs";
import { getCostModel, burnForLine } from "./costModelService.mjs";

// ── Constants ─────────────────────────────────────────────────────────────────

const JOB_STATUSES    = ["active", "on_hold", "defects", "complete", "cancelled"];
const PROJECT_TYPES   = ["frame", "fitoff", "lockup", "full_package", "other"];
const COST_TYPES      = ["material", "subcontract", "other"];
const MILESTONE_STATUSES = ["pending", "complete"];

// Classify a Buildexact estimate category as labour vs material for the budget split.
// "install"/"installation" in the name → labour even if it also says "supply" (e.g.
// "AAC and foam supply and installation" is a combined supply+install line); a pure
// "… supply" → material; otherwise labour. (Actuals self-sort by parentTask regardless;
// this only drives the budget display.)
function classifyCostType(name) {
  const n = String(name || "").toLowerCase();
  if (/install/.test(n)) return "labour";
  if (/supply/.test(n)) return "material";
  return "labour";
}

// ── Default milestone templates ───────────────────────────────────────────────

function defaultMilestones(projectType) {
  switch (projectType) {
    case "frame":
      return [
        { name: "Site measure / Prestart", sort_order: 10 },
        { name: "Material ordered",        sort_order: 20 },
        { name: "Frame delivery",          sort_order: 30 },
        { name: "Frame start",             sort_order: 40 },
        { name: "Frame complete",          sort_order: 50 },
        { name: "Truss install",           sort_order: 60 },
        { name: "Lock-up / Wrap",          sort_order: 70 },
        { name: "Defects",                 sort_order: 80 },
        { name: "Final inspection",        sort_order: 90 },
        { name: "Practical completion",    sort_order: 100 },
      ];
    case "fitoff":
      return [
        { name: "Site ready for fit-off",  sort_order: 10 },
        { name: "Material ordered",        sort_order: 20 },
        { name: "Fit-off start",           sort_order: 30 },
        { name: "Fit-off complete",        sort_order: 40 },
        { name: "Defects",                 sort_order: 50 },
        { name: "Final inspection",        sort_order: 60 },
        { name: "Practical completion",    sort_order: 70 },
      ];
    case "lockup":
      return [
        { name: "Site measure / Prestart", sort_order: 10 },
        { name: "Material ordered",        sort_order: 20 },
        { name: "Cladding delivery",       sort_order: 30 },
        { name: "Lock-up start",           sort_order: 40 },
        { name: "Cladding complete",       sort_order: 50 },
        { name: "Defects",                 sort_order: 60 },
        { name: "Final inspection",        sort_order: 70 },
        { name: "Practical completion",    sort_order: 80 },
      ];
    case "full_package":
      return [
        { name: "Site measure / Prestart", sort_order: 10 },
        { name: "Material ordered",        sort_order: 20 },
        { name: "Frame delivery",          sort_order: 30 },
        { name: "Frame start",             sort_order: 40 },
        { name: "Frame complete",          sort_order: 50 },
        { name: "Truss install",           sort_order: 60 },
        { name: "Lock-up / Wrap",          sort_order: 70 },
        { name: "Cladding start",          sort_order: 80 },
        { name: "Cladding complete",       sort_order: 90 },
        { name: "Fit-off start",           sort_order: 100 },
        { name: "Fit-off complete",        sort_order: 110 },
        { name: "Defects",                 sort_order: 120 },
        { name: "Final inspection",        sort_order: 130 },
        { name: "Practical completion",    sort_order: 140 },
      ];
    default: // "other"
      return [
        { name: "Start",    sort_order: 10 },
        { name: "Complete", sort_order: 20 },
      ];
  }
}

// Default per-stage site-task checklist seeded onto a new carpentry job (and
// applyable to an existing job). A practical starting point the leading hand ticks
// off / edits — not exhaustive. category 'inspection' marks the QC-style checks.
const SITE_TASK_STAGES = {
  prestart: [
    { title: "Pre-start: confirm site access, amenities & power", category: "general" },
    { title: "Pre-start: check plans, levels & set-out", category: "inspection" },
  ],
  frame: [
    { title: "Frame: set out & check square", category: "general" },
    { title: "Frame: install wall frames (LVL)", category: "general" },
    { title: "Frame: brace & plumb walls", category: "general" },
    { title: "Frame: QC check before sheeting/lining", category: "inspection" },
  ],
  roof: [
    { title: "Roof: install trusses / rafters", category: "general" },
    { title: "Roof: check tie-downs & batten spacing", category: "inspection" },
  ],
  lockup: [
    { title: "Lock-up: install windows & external doors", category: "general" },
    { title: "Lock-up: wrap & external cladding", category: "general" },
  ],
  fitoff: [
    { title: "Fit-off: hang internal doors", category: "general" },
    { title: "Fit-off: skirting & architraves", category: "general" },
    { title: "Fit-off: install hardware & fixtures", category: "general" },
  ],
  final: [
    { title: "Final: clean down site", category: "general" },
    { title: "Final: defect walk & sign-off", category: "inspection" },
  ],
};

function defaultSiteTasks(projectType) {
  let stages;
  switch (projectType) {
    case "frame":        stages = ["prestart", "frame", "roof", "final"]; break;
    case "fitoff":       stages = ["prestart", "fitoff", "final"]; break;
    case "lockup":       stages = ["prestart", "lockup", "final"]; break;
    case "full_package": stages = ["prestart", "frame", "roof", "lockup", "fitoff", "final"]; break;
    default:             stages = ["prestart", "final"];
  }
  const out = [];
  let order = 10;
  for (const s of stages) {
    for (const t of (SITE_TASK_STAGES[s] || [])) {
      out.push({ ...t, sort_order: order });
      order += 10;
    }
  }
  return out;
}

// Build site_tasks insert rows for a carpentry job from the default checklist.
function buildDefaultTaskRows(job, callerId, now) {
  return defaultSiteTasks(job.project_type).map((t) => ({
    carpentry_job_id: job.id,
    project_id: null,
    title: t.title,
    category: t.category,
    priority: "normal",
    status: "open",
    created_by: callerId,
    created_via: "manual",
    sort_order: t.sort_order,
    created_at: now,
  }));
}

// ── Route registration ────────────────────────────────────────────────────────

/**
 * @param {import("express").Express} app
 */
export function registerCarpentryRoutes(app) {

  // ── GET /api/carpentry/jobs ─────────────────────────────────────────────────

  app.get("/api/carpentry/jobs", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const status = req.query.status ? String(req.query.status).trim() : null;
      let query = sb
        .from("carpentry_jobs")
        .select("*")
        .order("created_at", { ascending: false });

      if (status && JOB_STATUSES.includes(status)) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw error;

      return ok(res, { jobs: rowsToCamel(data || []) });
    } catch (e) {
      console.error("[carpentry/jobs GET]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── POST /api/carpentry/jobs ────────────────────────────────────────────────

  app.post("/api/carpentry/jobs", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const {
        clientName,
        clientContact,
        clientPhone,
        clientEmail,
        address,
        description,
        projectType = "full_package",
        quotedValue,
        quotedCost,
        quotedMarginPct,
        startDate,
        endDate,
        floorAreaM2,
        storeyCount = 1,
        notes,
        buildexactJobId,
        buildexactEstimateId,
      } = req.body || {};

      if (!clientName || !address) {
        return err(res, 400, "clientName and address are required.");
      }
      if (projectType && !PROJECT_TYPES.includes(projectType)) {
        return err(res, 400, `projectType must be one of: ${PROJECT_TYPES.join(", ")}.`);
      }

      // Reference: prefer the Buildexact job number (e.g. "J1171") so the carpentry ref matches
      // Buildexact 1:1; fall back to the CJB-NNN sequence when there's no linked Buildexact job.
      let reference = null;
      if (buildexactJobId) {
        try {
          const bxJob = await getJobById(buildexactJobId);
          if (bxJob?.number) reference = String(bxJob.number).trim();
        } catch (e) {
          console.warn("[carpentry/create] couldn't read Buildexact job number:", e?.message);
        }
      }
      if (!reference) {
        const { data: seqVal, error: seqErr } = await sb.rpc("alloc_carpentry_sequence");
        if (seqErr) throw seqErr;
        reference = `CJB-${String(seqVal).padStart(3, "0")}`;
      }

      const now = new Date().toISOString();
      const { data: job, error: je } = await sb
        .from("carpentry_jobs")
        .insert({
          reference,
          buildexact_job_id:      buildexactJobId      || null,
          buildexact_estimate_id: buildexactEstimateId || null,
          client_name:     String(clientName).trim(),
          client_contact:  clientContact  ? String(clientContact).trim()  : null,
          client_phone:    clientPhone    ? String(clientPhone).trim()    : null,
          client_email:    clientEmail    ? String(clientEmail).trim()    : null,
          address:         String(address).trim(),
          description:     description    ? String(description).trim()    : null,
          project_type:    projectType,
          status:          "active",
          quoted_value:    quotedValue     != null ? Number(quotedValue)     : null,
          quoted_cost:     quotedCost      != null ? Number(quotedCost)      : null,
          quoted_margin_pct: quotedMarginPct != null ? Number(quotedMarginPct) : null,
          start_date:      startDate       || null,
          end_date:        endDate         || null,
          floor_area_m2:   floorAreaM2     != null ? Number(floorAreaM2)    : null,
          storey_count:    Number(storeyCount) || 1,
          notes:           notes           ? String(notes).trim()           : null,
          created_at:      now,
          updated_at:      now,
        })
        .select("*")
        .single();

      if (je) throw je;

      // Seed default milestones
      const milestoneRows = defaultMilestones(job.project_type).map((m) => ({
        job_id:     job.id,
        name:       m.name,
        sort_order: m.sort_order,
        status:     "pending",
        created_at: now,
      }));
      if (milestoneRows.length) {
        const { error: me } = await sb.from("carpentry_job_milestones").insert(milestoneRows);
        if (me) console.warn("[carpentry/jobs POST] milestone seed error:", me.message);
      }

      // Site-task auto-seed removed. New jobs start with zero tasks so the leading hand
      // can build the task list from scratch (voice transcript, manual, or on-demand QC
      // template via POST /api/carpentry/jobs/:id/tasks/apply-qc-template).

      // NOTE: the budget is NOT auto-seeded from the Buildexact API. The v3 estimate API
      // returns a flat, cost-only line-item list (no per-category markup), so it cannot
      // produce the marked-up sell-ex-GST per category that the budget needs — and on some
      // accounts each leaf line came through as its own "category" (the ~100-row budget bug).
      // The authoritative source is the reviewed Estimate-Items XLSX import, which seeds the
      // budget via POST /budget/seed (mapping workforce_task_category for the labour push).
      // The API fetch still supplies the job code + client contact at /buildexact/fetch.

      // Geocode the carpentry site (fire-and-forget) so it can plot on the Ops map (mig 138).
      // Carpentry is often standalone external-builder work with no parent job, so this is
      // the only place its coordinates come from. Full address precision, like builder jobs.
      if (job.address) {
        geocodeToFacts("carpentry_jobs", job.id, String(job.address).trim(), "address").catch(() => {});
      }

      return ok(res, { job: rowToCamel(job) });
    } catch (e) {
      console.error("[carpentry/jobs POST]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── GET /api/carpentry/jobs/:id ─────────────────────────────────────────────

  app.get("/api/carpentry/jobs/:id", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { data: job, error } = await sb
        .from("carpentry_jobs")
        .select("*")
        .eq("id", req.params.id)
        .single();
      if (error || !job) return err(res, 404, "Carpentry job not found.", "NOT_FOUND");
      // Include performance snapshot for completed jobs
      let performance = null;
      if (job.status === "complete") {
        const { data: perf } = await sb
          .from("carpentry_job_performance")
          .select("*")
          .eq("job_id", job.id)
          .maybeSingle();
        if (perf) performance = rowToCamel(perf);
      }
      // D6: Actual Start = the FIRST APPROVED timesheet on this job (proof of work on site),
      // unless it's been set manually. (Actual End stays manual.) Derived on read so it's always
      // accurate; the stored column wins if a human set it.
      const jobOut = rowToCamel(job);
      if (!job.actual_start) {
        const { data: firstTs } = await sb
          .from("timesheets")
          .select("date")
          .eq("carpentry_job_id", job.id)
          .eq("status", "approved")
          .order("date", { ascending: true })
          .limit(1);
        if (firstTs?.[0]?.date) { jobOut.actualStart = firstTs[0].date; jobOut.actualStartDerived = true; }
      }
      return ok(res, { job: jobOut, performance });
    } catch (e) {
      console.error("[carpentry/jobs/:id GET]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── PATCH /api/carpentry/jobs/:id ───────────────────────────────────────────

  app.patch("/api/carpentry/jobs/:id", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const allowed = [
        "clientName", "clientContact", "clientPhone", "clientEmail",
        "address", "description", "projectType",
        "quotedValue", "quotedCost", "quotedMarginPct",
        "startDate", "endDate", "actualStart", "actualEnd",
        "floorAreaM2", "storeyCount", "notes",
        "buildexactJobId", "buildexactEstimateId",
      ];
      const toSnake = {
        clientName:          "client_name",
        clientContact:       "client_contact",
        clientPhone:         "client_phone",
        clientEmail:         "client_email",
        address:             "address",
        description:         "description",
        projectType:         "project_type",
        quotedValue:         "quoted_value",
        quotedCost:          "quoted_cost",
        quotedMarginPct:     "quoted_margin_pct",
        startDate:           "start_date",
        endDate:             "end_date",
        actualStart:         "actual_start",
        actualEnd:           "actual_end",
        floorAreaM2:         "floor_area_m2",
        storeyCount:         "storey_count",
        notes:               "notes",
        buildexactJobId:     "buildexact_job_id",
        buildexactEstimateId:"buildexact_estimate_id",
      };
      const patch = {};
      for (const key of allowed) {
        if (key in (req.body || {})) {
          patch[toSnake[key]] = req.body[key];
        }
      }
      if (!Object.keys(patch).length) return err(res, 400, "No valid fields to update.");
      if (patch.project_type && !PROJECT_TYPES.includes(patch.project_type)) {
        return err(res, 400, `projectType must be one of: ${PROJECT_TYPES.join(", ")}.`);
      }
      patch.updated_at = new Date().toISOString();

      const { data: job, error } = await sb
        .from("carpentry_jobs")
        .update(patch)
        .eq("id", req.params.id)
        .select("*")
        .single();
      if (error) throw error;
      if (!job) return err(res, 404, "Carpentry job not found.", "NOT_FOUND");

      // Re-geocode when the site address changed in this PATCH (fire-and-forget).
      if ("address" in patch && patch.address) {
        geocodeToFacts("carpentry_jobs", job.id, String(patch.address).trim(), "address").catch(() => {});
      }

      return ok(res, { job: rowToCamel(job) });
    } catch (e) {
      console.error("[carpentry/jobs/:id PATCH]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── PATCH /api/carpentry/jobs/:id/status ────────────────────────────────────

  app.patch("/api/carpentry/jobs/:id/status", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const status = String(req.body?.status || "").trim();
      if (!JOB_STATUSES.includes(status)) {
        return err(res, 400, `status must be one of: ${JOB_STATUSES.join(", ")}.`);
      }
      const patch = { status, updated_at: new Date().toISOString() };
      // Record actual_end when completing a job
      if (status === "complete" && !req.body?.actualEnd) {
        patch.actual_end = new Date().toISOString().slice(0, 10);
      }
      const { data: job, error } = await sb
        .from("carpentry_jobs")
        .update(patch)
        .eq("id", req.params.id)
        .select("*")
        .single();
      if (error) throw error;
      if (!job) return err(res, 404, "Carpentry job not found.", "NOT_FOUND");
      return ok(res, { job: rowToCamel(job) });
    } catch (e) {
      console.error("[carpentry/jobs/:id/status PATCH]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── DELETE /api/carpentry/jobs/:id ──────────────────────────────────────────
  // Remove a carpentry job. Child rows (budgets, milestones, costs, diary,
  // performance, site_tasks) cascade; timesheets + marketing tags are set null.
  app.delete("/api/carpentry/jobs/:id", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { data: job } = await sb
        .from("carpentry_jobs")
        .select("id, reference")
        .eq("id", req.params.id)
        .maybeSingle();
      if (!job) return err(res, 404, "Carpentry job not found.", "NOT_FOUND");
      const { error } = await sb.from("carpentry_jobs").delete().eq("id", req.params.id);
      if (error) throw error;
      return ok(res, { deleted: true, reference: job.reference || null });
    } catch (e) {
      console.error("[carpentry/jobs/:id DELETE]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── GET /api/carpentry/buildexact/debug ─────────────────────────────────────
  // TEMP diagnostic: returns the raw Buildxact estimate-items response for a job so
  // the category/line-item field shapes can be mapped (this account nests them
  // differently than the default). Read-only. Remove once Fetch grouping is fixed.
  app.get("/api/carpentry/buildexact/debug", requireAuth, async (req, res) => {
    if (!buildexactConfigured()) return err(res, 503, "Buildexact is not configured.");
    try {
      const ref = String(req.query.job || req.query.jobNumber || "").trim();
      if (!ref) return err(res, 400, "Pass ?job=<job number or GUID>, e.g. ?job=J1120");
      const { jobId } = await resolveBuildexactJobId(ref);
      if (!jobId) return err(res, 404, `No Buildexact job matched "${ref}".`);
      const estimates = beList(await getEstimatesByJob(jobId));
      if (!estimates.length) return err(res, 404, `No estimate found for job "${ref}".`);
      const chosen = estimates.find((e) => e?.isAccepted) || estimates[0];
      const estimateId = chosen?.estimateId || chosen?.id;
      const items = beList(await getEstimateItems(estimateId));
      const allFieldNames = [...new Set(items.flatMap((it) => Object.keys(it || {})))].sort();
      return ok(res, {
        jobRef: ref,
        jobId,
        estimateId,
        estimateNumber: chosen?.number ?? null,
        totalItems: items.length,
        allFieldNames,
        sampleItems: items.slice(0, 25),
      });
    } catch (e) {
      return err(res, 502, e?.message || "Buildexact debug failed.");
    }
  });

  // ── POST /api/carpentry/buildexact/fetch ────────────────────────────────────

  app.post("/api/carpentry/buildexact/fetch", requireAuth, async (req, res) => {
    if (!buildexactConfigured()) {
      return err(res, 503, "Buildexact is not configured — set BUILDEXACT_USERNAME and BUILDEXACT_API_KEY.");
    }
    try {
      const ref = String(req.body?.buildexactJobId || "").trim();
      if (!ref) return err(res, 400, "Enter a Buildexact job number or ID.");

      // Resolve the entered job number (e.g. "J1120") — or a pasted GUID — to Buildexact's
      // internal jobId. Without this, a job number lands in an OData filter as a property
      // name and Buildexact rejects the query.
      let resolved;
      try {
        resolved = await resolveBuildexactJobId(ref);
      } catch (e) {
        return err(res, 502, `Couldn't reach Buildexact: ${e?.message || "lookup failed"}`);
      }
      const buildexactJobId = resolved.jobId;
      if (!buildexactJobId) {
        return err(
          res,
          404,
          `No Buildexact job matched "${ref}"${resolved.jobsSearched ? ` (searched ${resolved.jobsSearched} job${resolved.jobsSearched === 1 ? "" : "s"})` : ""}. Check the job number, or use the estimate XLSX import instead.`
        );
      }

      // Fetch job metadata and estimate in parallel
      const [jobDataResult, estimateResult] = await Promise.allSettled([
        getJobById(buildexactJobId),
        pullBuildexactEstimate(buildexactJobId),
      ]);

      const jobData = jobDataResult.status === "fulfilled" ? jobDataResult.value : null;
      const estimateData = estimateResult.status === "fulfilled" ? estimateResult.value : null;

      if (!estimateData && !jobData) {
        const msg = estimateResult.reason?.message || "Could not fetch Buildexact data for this job.";
        return err(res, 502, msg);
      }

      const estimate = estimateData?.estimate || {};

      // Extract pre-fill fields — be permissive with field name variants
      const clientName =
        jobData?.Customer ||
        jobData?.CustomerName ||
        jobData?.client_name ||
        estimate.client_name ||
        "";

      const address =
        jobData?.SiteAddress ||
        jobData?.Address ||
        jobData?.site_address ||
        estimate.address ||
        "";

      const description =
        jobData?.Name ||
        jobData?.Description ||
        jobData?.name ||
        "";

      // Client contact — JobDto doesn't reliably carry email/phone (the cause of the
      // "contact doesn't come across" bug). Best-effort + non-fatal: read any direct
      // fields on the job, then resolve the client's primary contact via /clients/:id/contacts.
      let clientContact = "", clientEmail = "", clientPhone = "";
      try {
        clientEmail = jobData?.CustomerEmail || jobData?.customerEmail || jobData?.clientEmail || jobData?.email || "";
        clientPhone = jobData?.CustomerPhone || jobData?.customerPhone || jobData?.clientPhone || jobData?.phone || jobData?.mobile || "";
        const customerId = jobData?.clientId || jobData?.customerId || jobData?.ClientId || jobData?.CustomerId || jobData?.client_id || jobData?.customer_id || null;
        if (customerId) {
          const contactsRaw = await getCustomerContacts(customerId).catch(() => null);
          const list = Array.isArray(contactsRaw) ? contactsRaw : (contactsRaw?.value || contactsRaw?.data || []);
          const primary = list.find((c) => c?.email || c?.Email) || list[0];
          if (primary) {
            clientContact = [primary.firstName || primary.FirstName, primary.lastName || primary.LastName].filter(Boolean).join(" ").trim()
              || primary.name || primary.Name || primary.fullName || "";
            clientEmail = clientEmail || primary.email || primary.Email || "";
            clientPhone = clientPhone || primary.phone || primary.Phone || primary.mobile || primary.Mobile || "";
          }
        }
        if (!clientEmail && !clientPhone) {
          console.warn("[carpentry/buildexact/fetch] no client contact resolved — jobData keys:", Object.keys(jobData || {}).join(","));
        }
      } catch (e) {
        console.warn("[carpentry/buildexact/fetch] contact resolve failed:", e?.message);
      }

      // Prefer the marked-up SELL ex-GST when the estimate carries markup; net_total is the cost.
      const quotedValue = (estimate.sell_total_ex_gst ?? estimate.net_total)
        ? Math.round(Number(estimate.sell_total_ex_gst ?? estimate.net_total) * 100) / 100 : null;

      // Estimate total inc GST for reference
      const estimateTotal = estimate.estimate_total ? Math.round(Number(estimate.estimate_total) * 100) / 100 : null;

      return ok(res, {
        prefill: {
          buildexactJobId,
          clientName,
          clientContact,
          clientEmail,
          clientPhone,
          address,
          description,
          quotedValue,
          estimateTotal,
          categories: (estimate.categories || []).map((c) => ({
            name: c.name,
            subtotalExGst: c.subtotal_ex_gst,
            sellExGst: c.subtotal_sell_ex_gst ?? c.subtotal_ex_gst,
            costExGst: c.subtotal_ex_gst,
            costType: classifyCostType(c.name),
          })),
        },
        raw: {
          jobName: description,
          sourceFormat: estimate.source_format || "api",
          categories: (estimate.categories || []).map((c) => ({
            name: c.name,
            subtotalExGst: c.subtotal_ex_gst,
            sellExGst: c.subtotal_sell_ex_gst ?? c.subtotal_ex_gst,
            costExGst: c.subtotal_ex_gst,
          })),
        },
      });
    } catch (e) {
      console.error("[carpentry/buildexact/fetch POST]", e);
      return err(res, 502, e?.message || "Buildexact fetch failed.");
    }
  });

  // ── POST /api/carpentry/estimate/parse-xlsx ─────────────────────────────────
  // Parse an uploaded Buildexact estimate XLSX (no API needed). Returns the same
  // prefill shape as /buildexact/fetch so the New Job modal reuses one code path.
  app.post("/api/carpentry/estimate/parse-xlsx", requireAuth, async (req, res) => {
    const b64 = String(req.body?.dataBase64 || "").trim();
    if (!b64) return err(res, 400, "dataBase64 is required.");
    try {
      const buf = Buffer.from(b64.replace(/^data:.*,/, ""), "base64");
      const p = parseXLSX(buf, String(req.body?.filename || ""));
      const round2 = (v) => (v != null && v !== "" ? Math.round(Number(v) * 100) / 100 : null);
      const desc = [p.quote_number, p.building_type].filter(Boolean).join(" — ");
      // sell ex-GST (cost + markup) = what we charge the builder; the marked-up
      // figure the budget should show. Falls back to net_total (cost) for the
      // legacy report export which carries no per-category markup.
      const sellTotal = round2(p.sell_total_ex_gst ?? p.net_total);
      return ok(res, {
        prefill: {
          clientName: p.client_name || "",
          address: p.address || "",
          description: desc,
          quotedValue: sellTotal,               // ex-GST SELL price (markup-inclusive)
          estimateTotal: round2(p.estimate_total),
          quoteNumber: p.quote_number || "",
          buildingType: p.building_type || "",
        },
        raw: {
          quoteNumber: p.quote_number || "",
          buildingType: p.building_type || "",
          sourceFormat: p.source_format || "",   // 'estimateitems' (good) | 'report' (legacy — warn)
          costTotalExGst: round2(p.net_total),
          sellTotalExGst: sellTotal,
          markupAmount: round2(p.markup_amount),
          // Classify each estimate category: names without "supply" are labour
          // budget lines (actuals from workforce timesheets); names with "supply"
          // are material budget lines (actuals from carpentry_job_costs). Budget =
          // markup-inclusive sell ex-GST; cost = ex-markup (for margin).
          categories: (p.categories || []).map((c) => ({
            name: c.name,
            subtotalExGst: c.subtotal_ex_gst,                              // cost ex-markup
            sellExGst: round2(c.subtotal_sell_ex_gst ?? c.subtotal_ex_gst), // markup-inclusive ex-GST
            costExGst: round2(c.subtotal_ex_gst),
            allowance: c.active_items?.some((it) => it.allowance) ? "PC/PS" : "",
            costType: classifyCostType(c.name),
          })),
        },
      });
    } catch (e) {
      console.error("[carpentry/estimate/parse-xlsx POST]", e);
      return err(res, 502, e?.message || "Could not read the estimate file.");
    }
  });

  // ── GET /api/carpentry/jobs/:id/milestones ──────────────────────────────────

  app.get("/api/carpentry/jobs/:id/milestones", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { data, error } = await sb
        .from("carpentry_job_milestones")
        .select("*")
        .eq("job_id", req.params.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return ok(res, { milestones: rowsToCamel(data || []) });
    } catch (e) {
      console.error("[carpentry/milestones GET]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── POST /api/carpentry/jobs/:id/milestones ─────────────────────────────────

  app.post("/api/carpentry/jobs/:id/milestones", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { name, targetDate, actualDate, sortOrder = 0, notes } = req.body || {};
      if (!name) return err(res, 400, "name is required.");

      // Verify job exists
      const { data: job } = await sb
        .from("carpentry_jobs").select("id").eq("id", req.params.id).maybeSingle();
      if (!job) return err(res, 404, "Carpentry job not found.", "NOT_FOUND");

      const { data: milestone, error } = await sb
        .from("carpentry_job_milestones")
        .insert({
          job_id:      req.params.id,
          name:        String(name).trim(),
          target_date: targetDate  || null,
          actual_date: actualDate  || null,
          status:      "pending",
          sort_order:  Number(sortOrder) || 0,
          notes:       notes ? String(notes).trim() : null,
          created_at:  new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) throw error;
      return ok(res, { milestone: rowToCamel(milestone) });
    } catch (e) {
      console.error("[carpentry/milestones POST]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── POST /api/carpentry/jobs/:id/milestones/auto-layout ─────────────────────
  // D2: set milestone target dates from a commencement date + frame-delivery date, using crew-scaled
  // build durations + procurement lead-times. Returns the proposed dates for a confirm step.
  app.post("/api/carpentry/jobs/:id/milestones/auto-layout", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const jobId = req.params.id;
      const { commencementDate, frameDeliveryDate, apply } = req.body || {};
      if (!commencementDate) return err(res, 400, "commencementDate is required.");
      const { data: job } = await sb.from("carpentry_jobs").select("id, crew_size_overrides").eq("id", jobId).maybeSingle();
      if (!job) return err(res, 404, "Carpentry job not found.", "NOT_FOUND");
      const { data: milestones } = await sb
        .from("carpentry_job_milestones").select("id, name, target_date, sort_order").eq("job_id", jobId).order("sort_order");
      if (!milestones?.length) return err(res, 400, "This job has no milestones to lay out.");

      const computed = autoLayoutMilestones({
        commencementDate,
        frameDeliveryDate,
        milestones,
        crewSizes: job.crew_size_overrides || {},
      });
      const byId = new Map(milestones.map((m) => [m.id, m]));
      const affected = computed
        .filter((c) => c.targetDate)
        .map((c) => ({ id: c.id, name: c.name, oldTargetDate: byId.get(c.id)?.target_date || null, newTargetDate: c.targetDate }));

      // Preview unless apply:true — so the UI can show the proposed dates first.
      if (apply) {
        for (const c of affected) {
          await sb.from("carpentry_job_milestones")
            .update({ target_date: c.newTargetDate, updated_at: new Date().toISOString() })
            .eq("id", c.id);
        }
      }
      return ok(res, { applied: Boolean(apply), affected });
    } catch (e) {
      console.error("[carpentry/milestones/auto-layout POST]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── PATCH /api/carpentry/milestones/:mid ────────────────────────────────────

  app.patch("/api/carpentry/milestones/:mid", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { name, targetDate, actualDate, status, sortOrder, notes } = req.body || {};
      const patch = {};
      if (name        !== undefined) patch.name        = String(name).trim();
      if (targetDate  !== undefined) patch.target_date = targetDate  || null;
      if (actualDate  !== undefined) patch.actual_date = actualDate  || null;
      if (notes       !== undefined) patch.notes       = notes ? String(notes).trim() : null;
      if (sortOrder   !== undefined) patch.sort_order  = Number(sortOrder) || 0;
      if (status      !== undefined) {
        if (!MILESTONE_STATUSES.includes(status)) {
          return err(res, 400, `status must be one of: ${MILESTONE_STATUSES.join(", ")}.`);
        }
        patch.status = status;
      }
      if (!Object.keys(patch).length) return err(res, 400, "No valid fields to update.");

      const { data: milestone, error } = await sb
        .from("carpentry_job_milestones")
        .update(patch)
        .eq("id", req.params.mid)
        .select("*")
        .single();
      if (error) throw error;
      if (!milestone) return err(res, 404, "Milestone not found.", "NOT_FOUND");
      return ok(res, { milestone: rowToCamel(milestone) });
    } catch (e) {
      console.error("[carpentry/milestones/:mid PATCH]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── DELETE /api/carpentry/milestones/:mid ───────────────────────────────────

  app.delete("/api/carpentry/milestones/:mid", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { error } = await sb
        .from("carpentry_job_milestones")
        .delete()
        .eq("id", req.params.mid);
      if (error) throw error;
      return ok(res);
    } catch (e) {
      console.error("[carpentry/milestones/:mid DELETE]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── GET /api/carpentry/jobs/:id/diary ───────────────────────────────────────

  app.get("/api/carpentry/jobs/:id/diary", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { data, error } = await sb
        .from("carpentry_site_diary")
        .select("*")
        .eq("job_id", req.params.id)
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return ok(res, { entries: rowsToCamel(data || []) });
    } catch (e) {
      console.error("[carpentry/diary GET]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── POST /api/carpentry/jobs/:id/diary ──────────────────────────────────────

  app.post("/api/carpentry/jobs/:id/diary", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const {
        entryDate,
        weather,
        tradesOnsite,
        workCompleted,
        issues,
        instructionsGiven,
        visitors,
        rawVoiceTranscript,
        structuredByAi = false,
        supervisor,
        photoPaths,
      } = req.body || {};

      // Verify job exists
      const { data: job } = await sb
        .from("carpentry_jobs").select("id, actual_start").eq("id", req.params.id).maybeSingle();
      if (!job) return err(res, 404, "Carpentry job not found.", "NOT_FOUND");

      const date = entryDate || new Date().toISOString().slice(0, 10);

      const { data: entry, error } = await sb
        .from("carpentry_site_diary")
        .insert({
          job_id:               req.params.id,
          entry_date:           date,
          weather:              weather              || null,
          trades_onsite:        Array.isArray(tradesOnsite) ? tradesOnsite : [],
          work_completed:       workCompleted        || null,
          issues:               issues               || null,
          instructions_given:   instructionsGiven    || null,
          visitors:             visitors             || null,
          raw_voice_transcript: rawVoiceTranscript   || null,
          structured_by_ai:     Boolean(structuredByAi),
          supervisor:           supervisor           || null,
          photo_paths:          Array.isArray(photoPaths) ? photoPaths : [],
          created_at:           new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) throw error;

      // D6: actual_start is no longer stamped from the first diary entry — it's derived from the
      // first APPROVED timesheet (see the job GET), which is the real proof of work on site.

      return ok(res, { entry: rowToCamel(entry) });
    } catch (e) {
      console.error("[carpentry/diary POST]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── PATCH /api/carpentry/diary/:eid ─────────────────────────────────────────

  app.patch("/api/carpentry/diary/:eid", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const {
        entryDate, weather, tradesOnsite, workCompleted,
        issues, instructionsGiven, visitors, supervisor,
        rawVoiceTranscript, structuredByAi, photoPaths,
      } = req.body || {};

      const patch = {};
      if (entryDate          !== undefined) patch.entry_date           = entryDate;
      if (weather            !== undefined) patch.weather              = weather || null;
      if (tradesOnsite       !== undefined) patch.trades_onsite        = Array.isArray(tradesOnsite) ? tradesOnsite : [];
      if (workCompleted      !== undefined) patch.work_completed       = workCompleted || null;
      if (issues             !== undefined) patch.issues               = issues || null;
      if (instructionsGiven  !== undefined) patch.instructions_given   = instructionsGiven || null;
      if (visitors           !== undefined) patch.visitors             = visitors || null;
      if (supervisor         !== undefined) patch.supervisor           = supervisor || null;
      if (rawVoiceTranscript !== undefined) patch.raw_voice_transcript = rawVoiceTranscript || null;
      if (structuredByAi     !== undefined) patch.structured_by_ai    = Boolean(structuredByAi);
      if (photoPaths         !== undefined) patch.photo_paths          = Array.isArray(photoPaths) ? photoPaths : [];

      if (!Object.keys(patch).length) return err(res, 400, "No valid fields to update.");

      const { data: entry, error } = await sb
        .from("carpentry_site_diary")
        .update(patch)
        .eq("id", req.params.eid)
        .select("*")
        .single();
      if (error) throw error;
      if (!entry) return err(res, 404, "Diary entry not found.", "NOT_FOUND");
      return ok(res, { entry: rowToCamel(entry) });
    } catch (e) {
      console.error("[carpentry/diary/:eid PATCH]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── GET /api/carpentry/jobs/:id/tasks ───────────────────────────────────────

  app.get("/api/carpentry/jobs/:id/tasks", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { data, error } = await sb
        .from("site_tasks")
        .select("*, assigned:employees!assigned_to(id, name), completer:employees!completed_by(id, name)")
        .eq("carpentry_job_id", req.params.id)
        .neq("status", "wont_do")
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      await signSiteTaskPhotos(sb, data || []);
      return ok(res, { tasks: rowsToCamel(data || []) });
    } catch (e) {
      console.error("[carpentry/tasks GET]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── POST /api/carpentry/jobs/:id/tasks ──────────────────────────────────────

  app.post("/api/carpentry/jobs/:id/tasks", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      if (!isUuid(req.params.id)) return err(res, 400, "Invalid job id.");
      const { title, description, priority = "normal", dueDate, category = "general", assignedTo, createdVia = "manual", taskAudience = "worker" } = req.body || {};
      if (!title?.trim()) return err(res, 400, "title is required.");
      if (!["worker", "supervisor"].includes(taskAudience)) return err(res, 400, "Invalid taskAudience.");
      const VALID_PRIORITY = ["urgent", "normal", "when_time_permits"];
      if (!VALID_PRIORITY.includes(priority)) return err(res, 400, "Invalid priority.");
      // Generic task types + the canonical labour streams (D4: a task's category can be the job's
      // labour budget stream so it ties to the budget + timesheet task_category). Must match the
      // site_tasks.category CHECK (migration 114).
      const VALID_CATEGORY = [
        "general", "defect", "safety", "materials", "inspection",
        "first_fix_framing", "cladding", "second_fix", "outdoor_works",
        "formwork_slab_prep", "site_labouring", "site_cleanup", "supervision",
      ];
      if (!VALID_CATEGORY.includes(category)) return err(res, 400, "Invalid category.");
      const VALID_CREATED_VIA = ["manual", "voice_note", "ai_extraction"];
      if (!VALID_CREATED_VIA.includes(createdVia)) return err(res, 400, "Invalid createdVia.");
      if (assignedTo && !isUuid(assignedTo)) return err(res, 400, "Invalid assignee.");

      const row = {
        carpentry_job_id: req.params.id,
        project_id: null,
        title: title.trim(),
        description: description?.trim() || null,
        priority,
        category,
        assigned_to: assignedTo || null,
        due_date: dueDate || null,
        created_by: req.caller.id,
        created_via: createdVia,
        status: "open",
        sort_order: 0,
        // D3: 'worker' (default) or 'supervisor' (QC / order-ahead tasks). Only set when provided
        // so it's safe before migration 115 adds the column.
        ...(taskAudience && taskAudience !== "worker" ? { task_audience: taskAudience } : {}),
      };
      const { data: task, error } = await sb
        .from("site_tasks")
        .insert(row)
        .select("*, employees!assigned_to(id, name)")
        .single();
      if (error) throw error;
      return ok(res, { task });
    } catch (e) {
      console.error("[carpentry/tasks POST]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── POST /api/carpentry/jobs/:id/tasks/apply-template ───────────────────────
  // Apply the default per-stage site-task checklist to an EXISTING job. Idempotent:
  // skips any default whose title is already present, so it can be re-run safely.
  app.post("/api/carpentry/jobs/:id/tasks/apply-template", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      if (!isUuid(req.params.id)) return err(res, 400, "Invalid job id.");
      const { data: job, error: je } = await sb
        .from("carpentry_jobs").select("id, project_type").eq("id", req.params.id).maybeSingle();
      if (je) throw je;
      if (!job) return err(res, 404, "Job not found.", "NOT_FOUND");

      const { data: existing } = await sb.from("site_tasks").select("title").eq("carpentry_job_id", job.id);
      const have = new Set((existing || []).map((t) => (t.title || "").trim().toLowerCase()));
      const now = new Date().toISOString();
      const rows = buildDefaultTaskRows(job, req.caller.id, now)
        .filter((r) => !have.has(r.title.trim().toLowerCase()));
      if (!rows.length) return ok(res, { added: 0, tasks: [] });

      const { data, error } = await sb.from("site_tasks").insert(rows).select("*, employees!assigned_to(id, name)");
      if (error) throw error;
      return ok(res, { added: data.length, tasks: data });
    } catch (e) {
      console.error("[carpentry/tasks apply-template]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── POST /api/carpentry/jobs/:id/tasks/apply-qc-template ───────────────────
  // On-demand: seed the default per-stage checklist onto a job. Idempotent — skips
  // any default task whose title is already present on the job. Admin/supervisor only.
  app.post("/api/carpentry/jobs/:id/tasks/apply-qc-template", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      if (!isUuid(req.params.id)) return err(res, 400, "Invalid job id.");
      const { data: job, error: je } = await sb
        .from("carpentry_jobs").select("id, project_type").eq("id", req.params.id).maybeSingle();
      if (je) throw je;
      if (!job) return err(res, 404, "Job not found.", "NOT_FOUND");

      const { data: existing } = await sb.from("site_tasks").select("title").eq("carpentry_job_id", job.id);
      const have = new Set((existing || []).map((t) => (t.title || "").trim().toLowerCase()));
      const now = new Date().toISOString();
      const rows = buildDefaultTaskRows(job, req.caller.id, now)
        .filter((r) => !have.has(r.title.trim().toLowerCase()));
      if (!rows.length) return ok(res, { added: 0, tasks: [] });

      const { data, error } = await sb.from("site_tasks").insert(rows).select("*, employees!assigned_to(id, name)");
      if (error) throw error;
      return ok(res, { added: (data || []).length, tasks: data || [] });
    } catch (e) {
      console.error("[carpentry/tasks apply-qc-template]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── POST /api/carpentry/jobs/:id/tasks/from-transcript ──────────────────────
  // Voice-to-tasks: paste a site walk-through transcript (Plaud, or in-app
  // recording → /api/transcribe) and get back a DRAFT task list for review.
  // Creates NOTHING — the UI shows the drafts, the user edits/dedupes, then
  // posts the keepers to POST /tasks (createdVia:'ai_extraction').
  app.post("/api/carpentry/jobs/:id/tasks/from-transcript", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    try {
      const transcript = String(req.body?.transcript || "").trim();
      if (!transcript) return err(res, 400, "transcript is required.");
      if (transcript.length > 20000) return err(res, 413, "Transcript too long — split it into shorter sessions.");
      const jobLabel = String(req.body?.jobLabel || "").trim();
      // Feed the job's labour work streams to the extractor so drafts land in the right
      // stream (e.g. Cladding, Soffit linings) instead of always the generic category set.
      const sb = getServiceSupabase();
      let workStreams = [];
      if (sb) {
        const { data: budgets } = await sb
          .from("carpentry_job_budgets")
          .select("category_name, cost_type, workforce_task_category")
          .eq("job_id", req.params.id)
          .eq("cost_type", "labour");
        workStreams = (budgets || [])
          .filter((b) => b.workforce_task_category)
          .map((b) => ({ value: b.workforce_task_category, label: b.category_name }));
      }
      const tasks = await splitTranscriptToTasks(transcript, { jobLabel, workStreams });
      return ok(res, { tasks, draft: true });
    } catch (e) {
      console.error("[carpentry/tasks from-transcript]", e);
      return err(res, 502, e.message || "Could not extract tasks from the transcript.");
    }
  });

  // ── POST /api/transcribe ────────────────────────────────────────────────────
  // Generic speech-to-text (Whisper). Body: { audioBase64, mimeType?, filename? }.
  // Returns { transcript }. Used by in-app voice capture; safe to adopt elsewhere
  // (sales meeting analysis, site diary memos) instead of paste-only.
  app.post("/api/transcribe", requireAuth, async (req, res) => {
    try {
      if (!transcriptionConfigured()) return err(res, 503, "Transcription is not configured (OPENAI_API_KEY missing).");
      const { audioBase64, mimeType, filename } = req.body || {};
      if (!audioBase64) return err(res, 400, "audioBase64 is required.");
      const b64 = String(audioBase64).replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(b64, "base64");
      if (!buffer.length) return err(res, 400, "Empty audio.");
      if (buffer.length > 25 * 1024 * 1024) return err(res, 413, "Audio too large (max 25MB).");
      const transcript = await transcribeAudio(buffer, {
        filename: filename || "audio.webm",
        mimeType: mimeType || "audio/webm",
      });
      return ok(res, { transcript });
    } catch (e) {
      console.error("[transcribe]", e);
      return err(res, 502, e.message || "Transcription failed.");
    }
  });

  // ── PATCH /api/carpentry/tasks/:id ──────────────────────────────────────────
  // Supports: status toggle (done / un-done / blocked), completionNotes, completionPhotoUrl,
  // priority, category. On →done: stamps completed_at + completed_by (caller's employee).
  // On →open/blocked: clears completed_at and completed_by.

  app.patch("/api/carpentry/tasks/:id", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { status, completionNotes, completionPhotoUrl, priority, category, title, description, sortOrder, sort_order, assignedTo, assigned_to } = req.body || {};
      const patch = { updated_at: new Date().toISOString() };

      if (title !== undefined) {
        if (!title?.trim()) return err(res, 400, "title must not be empty.");
        patch.title = title.trim();
      }
      if (description !== undefined) patch.description = description?.trim() || null;
      const resolvedSortOrder = sortOrder !== undefined ? sortOrder : sort_order;
      if (resolvedSortOrder !== undefined) patch.sort_order = resolvedSortOrder;
      const resolvedAssignedTo = assignedTo !== undefined ? assignedTo : assigned_to;
      if (resolvedAssignedTo !== undefined) {
        if (resolvedAssignedTo !== null && !isUuid(resolvedAssignedTo)) return err(res, 400, "Invalid assignee.");
        patch.assigned_to = resolvedAssignedTo || null;
      }

      if (status !== undefined) {
        const VALID = ["open", "in_progress", "done", "wont_do", "blocked"];
        if (!VALID.includes(status)) return err(res, 400, "Invalid status.");
        patch.status = status;
        if (status === "done") {
          patch.completed_at = new Date().toISOString();
          // Resolve caller's employee record for the audit trail.
          const { data: callerEmp } = await sb.from("employees").select("id").eq("user_id", req.caller.id).maybeSingle();
          if (callerEmp?.id) patch.completed_by = callerEmp.id;
        } else if (status === "open" || status === "blocked") {
          // Un-done or blocked → clear completion stamp.
          patch.completed_at = null;
          patch.completed_by = null;
        }
      }

      if (completionNotes !== undefined) patch.completion_notes = completionNotes || null;
      if (completionPhotoUrl !== undefined) patch.completion_photo_url = completionPhotoUrl || null;
      if (priority !== undefined) {
        const VALID_P = ["urgent", "normal", "when_time_permits"];
        if (!VALID_P.includes(priority)) return err(res, 400, "Invalid priority.");
        patch.priority = priority;
      }
      if (category !== undefined) {
        const VALID_CAT = [
          "general", "defect", "safety", "materials", "inspection",
          "first_fix_framing", "cladding", "second_fix", "outdoor_works",
          "formwork_slab_prep", "site_labouring", "site_cleanup", "supervision",
        ];
        if (!VALID_CAT.includes(category)) return err(res, 400, "Invalid category.");
        patch.category = category;
      }

      const { data: task, error } = await sb
        .from("site_tasks")
        .update(patch)
        .eq("id", req.params.id)
        .select("*, assigned:employees!assigned_to(id, name), completer:employees!completed_by(id, name)")
        .single();
      if (error) throw error;
      if (!task) return err(res, 404, "Task not found.", "NOT_FOUND");
      return ok(res, { task: rowToCamel(task) });
    } catch (e) {
      console.error("[carpentry/tasks/:id PATCH]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── DELETE /api/carpentry/tasks/:id ─────────────────────────────────────────

  app.delete("/api/carpentry/tasks/:id", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { error } = await sb
        .from("site_tasks")
        .update({ status: "wont_do", updated_at: new Date().toISOString() })
        .eq("id", req.params.id);
      if (error) throw error;
      return ok(res, {});
    } catch (e) {
      console.error("[carpentry/tasks/:id DELETE]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── GET /api/carpentry/jobs/:id/costs ───────────────────────────────────────

  app.get("/api/carpentry/jobs/:id/costs", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { data, error } = await sb
        .from("carpentry_job_costs")
        .select("*")
        .eq("job_id", req.params.id)
        .order("cost_date", { ascending: false });
      if (error) throw error;
      return ok(res, { costs: rowsToCamel(data || []) });
    } catch (e) {
      console.error("[carpentry/costs GET]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── POST /api/carpentry/jobs/:id/costs ──────────────────────────────────────

  app.post("/api/carpentry/jobs/:id/costs", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { costType, description, amount, costDate, source = "manual", sourceReference, carpentryJobBudgetId } = req.body || {};

      if (!costType) return err(res, 400, "costType is required.");
      if (!COST_TYPES.includes(costType)) {
        return err(res, 400, `costType must be one of: ${COST_TYPES.join(", ")}.`);
      }
      if (!description) return err(res, 400, "description is required.");
      if (amount == null || Number(amount) < 0) return err(res, 400, "amount must be a non-negative number.");

      // Verify job exists
      const { data: job } = await sb
        .from("carpentry_jobs").select("id").eq("id", req.params.id).maybeSingle();
      if (!job) return err(res, 404, "Carpentry job not found.", "NOT_FOUND");

      const now = new Date().toISOString();
      const { data: cost, error } = await sb
        .from("carpentry_job_costs")
        .insert({
          job_id:           req.params.id,
          cost_type:        costType,
          description:      String(description).trim(),
          amount:           Number(amount),
          source:           ["manual", "xero"].includes(source) ? source : "manual",
          source_reference: sourceReference ? String(sourceReference).trim() : null,
          cost_date:        costDate || new Date().toISOString().slice(0, 10),
          // D5: tag to a material budget line for per-category actuals (only when provided, so
          // this is safe before migration 113 adds the column).
          ...(carpentryJobBudgetId ? { carpentry_job_budget_id: carpentryJobBudgetId } : {}),
          created_at:       now,
          updated_at:       now,
        })
        .select("*")
        .single();
      if (error) throw error;
      return ok(res, { cost: rowToCamel(cost) });
    } catch (e) {
      console.error("[carpentry/costs POST]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── DELETE /api/carpentry/costs/:cid ────────────────────────────────────────

  app.delete("/api/carpentry/costs/:cid", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { error } = await sb
        .from("carpentry_job_costs")
        .delete()
        .eq("id", req.params.cid);
      if (error) throw error;
      return ok(res);
    } catch (e) {
      console.error("[carpentry/costs/:cid DELETE]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── Budget helpers ──────────────────────────────────────────────────────────
  const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
  const WORKFORCE_LABOUR_TASKS = [
    { key: "first_fix_framing", label: "First Fix Framing" },
    { key: "cladding", label: "Cladding" },
    { key: "second_fix", label: "Second Fix" },
    { key: "outdoor_works", label: "Outdoor Works" },
    { key: "formwork_slab_prep", label: "Formwork Slab Prep" },
    { key: "site_labouring", label: "Site Labouring" },
    { key: "site_cleanup", label: "Site Cleanup" },
    { key: "supervision", label: "Supervision" },
  ];
  const normaliseName = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  function matchTaskCategory(categoryName) {
    const n = normaliseName(categoryName);
    if (!n) return null;
    let best = null;
    for (const t of WORKFORCE_LABOUR_TASKS) {
      const tn = normaliseName(t.label);
      if (n === tn || n.startsWith(tn) || n.includes(tn)) {
        if (!best || tn.length > normaliseName(best.label).length) best = t;
      }
    }
    return best ? best.key : null;
  }

  // ── POST /api/carpentry/jobs/:id/budget/seed ────────────────────────────────
  // Seed budget lines from the imported estimate categories. Labour lines (names
  // without "supply") map to a workforce task_category; material lines (with
  // "supply") are budget-only. Idempotent — re-seeding replaces existing lines.
  app.post("/api/carpentry/jobs/:id/budget/seed", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const jobId = req.params.id;
    const categories = Array.isArray(req.body?.categories) ? req.body.categories : [];
    if (!categories.length) return err(res, 400, "categories[] is required.");
    try {
      const { data: job } = await sb.from("carpentry_jobs").select("id").eq("id", jobId).maybeSingle();
      if (!job) return err(res, 404, "Carpentry job not found.", "NOT_FOUND");

      // Desired budget lines from the imported categories.
      const desired = categories.map((c, i) => {
        const name = String(c.name || "").trim() || `Category ${i + 1}`;
        const costType = c.costType === "labour" || c.costType === "material"
          ? c.costType
          : classifyCostType(name);
        // budget_ex_gst = the marked-up SELL price ex-GST; cost_ex_gst = ex-markup cost.
        // sellExGst falls back to subtotalExGst for the legacy report export (no per-category markup).
        const cost = round2(c.costExGst ?? c.subtotalExGst ?? 0);
        const sell = round2(c.sellExGst ?? c.subtotalExGst ?? c.budgetExGst ?? 0);
        return {
          category_name: name,
          cost_type: costType,
          budget_ex_gst: sell,
          cost_ex_gst: cost,
          workforce_task_category: costType === "labour" ? matchTaskCategory(name) : null,
          sort_order: i,
        };
      });

      // Upsert by category_name — matching the DB UNIQUE(job_id, category_name) — so existing lines
      // KEEP their id on re-import, preserving any carpentry_job_costs tagged to them (D5). Keying on
      // category_name ALONE (not cost_type:name) is deliberate: if classifyCostType flips a category
      // between imports (e.g. a rename gains/loses "supply"), a composite key would miss the existing
      // row, take the INSERT branch, and trip a 23505 on (job_id, category_name). Name-only → UPDATE in
      // place (cost_type + workforce_task_category get corrected). Lines no longer in the estimate are removed.
      const keyOf = (r) => String(r.category_name).trim().toLowerCase();
      const { data: existing } = await sb
        .from("carpentry_job_budgets").select("id, category_name, cost_type").eq("job_id", jobId);
      const existingByKey = new Map((existing || []).map((e) => [keyOf(e), e.id]));
      const keptIds = new Set();
      const out = [];
      for (const d of desired) {
        const existingId = existingByKey.get(keyOf(d));
        if (existingId) {
          const { data: upd, error } = await sb.from("carpentry_job_budgets").update(d).eq("id", existingId).select("*").single();
          if (error) return err(res, 500, translateDbError(error));
          keptIds.add(existingId);
          if (upd) out.push(upd);
        } else {
          const { data: ins, error } = await sb.from("carpentry_job_budgets").insert({ job_id: jobId, ...d }).select("*").single();
          if (error) return err(res, 500, translateDbError(error));
          if (ins) { keptIds.add(ins.id); out.push(ins); }
        }
      }
      const removeIds = (existing || []).filter((e) => !keptIds.has(e.id)).map((e) => e.id);
      if (removeIds.length) await sb.from("carpentry_job_budgets").delete().in("id", removeIds);
      return ok(res, { budgets: rowsToCamel(out) });
    } catch (e) {
      console.error("[carpentry/budget/seed POST]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── GET /api/carpentry/jobs/:id/budget ──────────────────────────────────────
  // AU financial year (Jul–Jun) + quarter for a YYYY-MM-DD date. FY label e.g. "2025-26".
  // Quarters within the FY: Q1 Jul–Sep, Q2 Oct–Dec, Q3 Jan–Mar, Q4 Apr–Jun.
  function auFyQuarter(dateStr) {
    const d = new Date(`${dateStr}T12:00:00Z`);
    const m = d.getUTCMonth(), y = d.getUTCFullYear();
    const fyStart = m >= 6 ? y : y - 1;
    const fy = `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;
    const q = m >= 6 ? Math.floor((m - 6) / 3) + 1 : Math.floor((m + 6) / 3) + 1;
    return { fy, q };
  }

  // FY/quarter labour-cost rollup for the two standing internal jobs (BL-INTERNAL, BL-CHARGEUP) —
  // the cost of internal downtime / charge-up per period. Labour = approved-timesheet cost_amount,
  // mirroring the per-job budget view. Advisory reporting; touches nothing else.
  app.get("/api/carpentry/internal-cost-summary", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { data: jobs } = await sb.from("carpentry_jobs").select("id, reference, address").in("reference", ["BL-INTERNAL", "BL-CHARGEUP"]);
      const out = [];
      for (const job of jobs || []) {
        const { data: entries } = await sb
          .from("timesheet_entries")
          .select("cost_amount, hours, timesheets!inner(carpentry_job_id, status, date)")
          .eq("timesheets.carpentry_job_id", job.id)
          .eq("timesheets.status", "approved");
        const byPeriod = {};
        for (const e of entries || []) {
          const d = e.timesheets?.date; if (!d) continue;
          const { fy, q } = auFyQuarter(d);
          const key = `${fy}|${q}`;
          (byPeriod[key] ||= { fy, quarter: q, cost: 0, hours: 0 });
          byPeriod[key].cost += Number(e.cost_amount || 0);
          byPeriod[key].hours += Number(e.hours || 0);
        }
        const periods = Object.values(byPeriod).map(p => ({ ...p, cost: round2(p.cost), hours: round2(p.hours) }))
          .sort((a, b) => a.fy.localeCompare(b.fy) || a.quarter - b.quarter);
        const fyMap = {};
        for (const p of periods) { (fyMap[p.fy] ||= { fy: p.fy, cost: 0, hours: 0 }); fyMap[p.fy].cost += p.cost; fyMap[p.fy].hours += p.hours; }
        const fyTotals = Object.values(fyMap).map(x => ({ ...x, cost: round2(x.cost), hours: round2(x.hours) }));
        out.push({ reference: job.reference, address: job.address, fyTotals, periods });
      }
      return ok(res, { jobs: out });
    } catch (e) {
      console.error("[carpentry/internal-cost-summary]", e);
      return err(res, 500, translateDbError(e));
    }
  });

  // Per-category budget vs actual. Labour actuals come from approved timesheets
  // (by mapped task_category); material actuals from carpentry_job_costs (total).
  app.get("/api/carpentry/jobs/:id/budget", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const jobId = req.params.id;
    try {
      const { data: budgets } = await sb
        .from("carpentry_job_budgets").select("*").eq("job_id", jobId).order("sort_order");

      const { data: entries } = await sb
        .from("timesheet_entries")
        .select("task_category, cost_amount, hours, timesheets!inner(carpentry_job_id, status)")
        .eq("timesheets.carpentry_job_id", jobId)
        .eq("timesheets.status", "approved");
      const labourByTask = {}, hoursByTask = {};
      for (const e of entries || []) {
        labourByTask[e.task_category] = (labourByTask[e.task_category] || 0) + Number(e.cost_amount || 0);
        hoursByTask[e.task_category] = (hoursByTask[e.task_category] || 0) + Number(e.hours || 0);
      }
      // P1 (earned value): task-completion % per labour category — done/total of site_tasks for this
      // job, grouped by category (the shared 8-key spine). Excludes 'wont_do' from the denominator so a
      // parked task can't cap completion below 100% forever. This is the % complete that turns
      // spend-so-far into a projected final margin. Labour only — material has no task signal.
      const { data: siteTasks } = await sb
        .from("site_tasks").select("category, status").eq("carpentry_job_id", jobId);
      const taskDone = {}, taskTotal = {};
      for (const t of siteTasks || []) {
        if (t.status === "wont_do") continue;
        taskTotal[t.category] = (taskTotal[t.category] || 0) + 1;
        if (t.status === "done") taskDone[t.category] = (taskDone[t.category] || 0) + 1;
      }
      // Fraction 0..1, or null when the category has no counted tasks (can't project).
      const pctCompleteFor = (cat) => (taskTotal[cat] > 0 ? taskDone[cat] / taskTotal[cat] : null);

      const cm = await getCostModel(sb); // company cost model (null until mig 090 + sync)

      const { data: costRows } = await sb.from("carpentry_job_costs").select("*").eq("job_id", jobId);
      const materialActualTotal = round2((costRows || []).reduce((s, c) => s + Number(c.amount || 0), 0));
      // D5: per-line material actuals — costs tagged to a budget line via carpentry_job_budget_id.
      const materialActualByLine = {};
      for (const c of costRows || []) {
        if (c.carpentry_job_budget_id) materialActualByLine[c.carpentry_job_budget_id] = (materialActualByLine[c.carpentry_job_budget_id] || 0) + Number(c.amount || 0);
      }

      const lines = (budgets || []).map((b) => {
        const budget = round2(b.budget_ex_gst);
        const isLabour = b.cost_type === "labour";
        const actual = isLabour
          ? round2(labourByTask[b.workforce_task_category] || 0)
          : round2(materialActualByLine[b.id] || 0); // D5: per-line material actuals from tagged costs
        const actualHours = isLabour ? (hoursByTask[b.workforce_task_category] || 0) : 0;
        // P1: earned-value projection for this line — labour only (material has no completion signal).
        // projectedCost = actual ÷ %complete; projectedMargin = (sell − projectedCost) / sell.
        const pctComplete = isLabour ? pctCompleteFor(b.workforce_task_category) : null;
        const projectedCost = pctComplete > 0 ? round2(actual / pctComplete) : null;
        const projectedMarginPct = (pctComplete > 0 && budget > 0)
          ? round2(((budget - projectedCost) / budget) * 100) : null;
        return {
          id: b.id,
          categoryName: b.category_name,
          costType: b.cost_type,
          workforceTaskCategory: b.workforce_task_category,
          budget,
          actual,
          variance: round2(budget - actual),
          // P3: profitable-days + live actuals per labour category (null until cost model synced)
          burn: isLabour ? burnForLine(budget, actual, actualHours, cm) : null,
          // P1: null unless this is a labour line with counted tasks
          pctComplete,          // fraction 0..1 or null
          projectedCost,        // $ or null
          projectedMarginPct,   // percent (e.g. 24.3) or null
        };
      });

      const sum = (pred, f) => round2(lines.filter(pred).reduce((s, l) => s + f(l), 0));
      const labourBudget = sum((l) => l.costType === "labour", (l) => l.budget);
      const labourActual = sum((l) => l.costType === "labour", (l) => l.actual);
      const materialBudget = sum((l) => l.costType === "material", (l) => l.budget);
      const totals = {
        labourBudget, labourActual,
        materialBudget, materialActual: materialActualTotal,
        totalBudget: round2(labourBudget + materialBudget),
        totalActual: round2(labourActual + materialActualTotal),
      };
      // P1: job-level LABOUR projection — aggregate % complete across DISTINCT labour task categories
      // (shared categories not double-counted), then project final labour cost + margin. Material is
      // excluded (guardrail #4 — no task signal; its thermometer stays spend-vs-allowable).
      const labourCats = [...new Set((budgets || [])
        .filter((b) => b.cost_type === "labour" && b.workforce_task_category)
        .map((b) => b.workforce_task_category))];
      let projDone = 0, projTotal = 0;
      for (const cat of labourCats) { projDone += taskDone[cat] || 0; projTotal += taskTotal[cat] || 0; }
      const labourPct = projTotal > 0 ? projDone / projTotal : null;
      const labourProjectedCost = labourPct > 0 ? round2(labourActual / labourPct) : null;
      totals.projection = {
        available: labourPct != null,
        labourPctComplete: labourPct,                    // fraction 0..1 or null
        labourProjectedCost,                             // $ or null
        labourProjectedMarginPct: (labourPct > 0 && labourBudget > 0)
          ? round2(((labourBudget - labourProjectedCost) / labourBudget) * 100) : null,
        labourTasksDone: projDone,
        labourTasksTotal: projTotal,
      };
      // P3/P5: job-level burn-rate — how many full-team days the labour budget supports (the
      // schedule guardrail) + live labour margin. Null-safe when the cost model isn't synced.
      const burn = cm ? {
        available: true,
        headcount: cm.headcount,
        hoursPerDay: cm.hoursPerDay,
        teamChargeUpPerDay: round2(cm.teamChargeUpPerDay),
        teamBreakEvenPerDay: round2(cm.teamBreakEvenPerDay),
        atMarginDays: cm.teamChargeUpPerDay > 0 ? Math.round((labourBudget / cm.teamChargeUpPerDay) * 10) / 10 : null,
        breakEvenDays: cm.teamBreakEvenPerDay > 0 ? Math.round((labourBudget / cm.teamBreakEvenPerDay) * 10) / 10 : null,
        labourMarginRemaining: round2(labourBudget - labourActual),
      } : { available: false };
      return ok(res, { lines, totals, burn });
    } catch (e) {
      console.error("[carpentry/budget GET]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── GET /api/carpentry/jobs/:id/summary ─────────────────────────────────────

  app.get("/api/carpentry/jobs/:id/summary", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const id = req.params.id;

      // Fetch job
      const { data: job, error: je } = await sb
        .from("carpentry_jobs").select("*").eq("id", id).single();
      if (je || !job) return err(res, 404, "Carpentry job not found.", "NOT_FOUND");

      // Labour actual — approved timesheets linked to this carpentry job
      const { data: timesheets } = await sb
        .from("timesheets")
        .select("id, employee_id")
        .eq("carpentry_job_id", id)
        .eq("status", "approved");

      let labourActual = 0;
      for (const ts of timesheets || []) {
        const [{ data: entries }, { data: emp }] = await Promise.all([
          sb.from("timesheet_entries").select("hours").eq("timesheet_id", ts.id),
          sb.from("employees").select("hourly_rate").eq("id", ts.employee_id).maybeSingle(),
        ]);
        const rate = Number(emp?.hourly_rate || 0);
        const hours = (entries || []).reduce((sum, e) => sum + Number(e.hours || 0), 0);
        labourActual += hours * rate;
      }
      labourActual = Math.round(labourActual * 100) / 100;

      // Material + subcontract costs
      const { data: costRows } = await sb
        .from("carpentry_job_costs")
        .select("amount")
        .eq("job_id", id);
      const otherActual = Math.round(
        (costRows || []).reduce((sum, c) => sum + Number(c.amount || 0), 0) * 100
      ) / 100;

      const totalActual = Math.round((labourActual + otherActual) * 100) / 100;
      const revenue = Number(job.quoted_value || 0);
      const budgetCost = Number(job.quoted_cost || 0);
      const budgetMarginPct = Number(job.quoted_margin_pct || 0);

      const forecastMarginPct = revenue > 0
        ? Math.round(((revenue - totalActual) / revenue) * 10000) / 100
        : null;
      const variance = forecastMarginPct != null && budgetMarginPct
        ? Math.round((forecastMarginPct - budgetMarginPct) * 100) / 100
        : null;

      return ok(res, {
        summary: {
          revenue,
          budgetCost,
          budgetMarginPct,
          labourActual,
          otherActual,
          totalActual,
          forecastMarginPct,
          variance,
          timesheetCount: (timesheets || []).length,
          costEntryCount: (costRows || []).length,
        },
      });
    } catch (e) {
      console.error("[carpentry/summary GET]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── POST /api/carpentry/jobs/:id/closeout ─────────────────────────────────
  // Marks a carpentry job complete, sets actual_end, and writes a row to
  // carpentry_job_performance for historical reporting (Sprint 4).
  // Accepts optional body: { lessonsLearned?: string, actualEnd?: "YYYY-MM-DD" }

  app.post("/api/carpentry/jobs/:id/closeout", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const id = req.params.id;

      // Fetch job
      const { data: job, error: je } = await sb
        .from("carpentry_jobs").select("*").eq("id", id).single();
      if (je || !job) return err(res, 404, "Carpentry job not found.", "NOT_FOUND");

      if (job.status === "complete") {
        return err(res, 400, "Job is already closed.");
      }
      if (job.status === "cancelled") {
        return err(res, 400, "Cannot close a cancelled job.");
      }

      // ── Compute final actuals ───────────────────────────────────────────────
      const { data: timesheets } = await sb
        .from("timesheets")
        .select("id, employee_id")
        .eq("carpentry_job_id", id)
        .eq("status", "approved");

      let labourCost = 0;
      let labourHours = 0;
      for (const ts of timesheets || []) {
        const [{ data: entries }, { data: emp }] = await Promise.all([
          sb.from("timesheet_entries").select("hours").eq("timesheet_id", ts.id),
          sb.from("employees").select("hourly_rate").eq("id", ts.employee_id).maybeSingle(),
        ]);
        const rate = Number(emp?.hourly_rate || 0);
        const hrs  = (entries || []).reduce((s, e) => s + Number(e.hours || 0), 0);
        labourHours += hrs;
        labourCost  += hrs * rate;
      }
      labourCost  = Math.round(labourCost  * 100) / 100;
      labourHours = Math.round(labourHours * 100) / 100;

      const { data: costRows } = await sb
        .from("carpentry_job_costs").select("amount").eq("job_id", id);
      const materialCost = Math.round(
        (costRows || []).reduce((s, c) => s + Number(c.amount || 0), 0) * 100
      ) / 100;

      const totalCost        = Math.round((labourCost + materialCost) * 100) / 100;
      const revenue          = Number(job.quoted_value || 0);
      const budgetMarginPct  = Number(job.quoted_margin_pct || 0) || null;
      const finalMarginPct   = revenue > 0
        ? Math.round(((revenue - totalCost) / revenue) * 10000) / 100
        : null;
      const variancePct      = finalMarginPct != null && budgetMarginPct != null
        ? Math.round((finalMarginPct - budgetMarginPct) * 100) / 100
        : null;

      const floorAreaM2 = Number(job.floor_area_m2 || 0) || null;
      const hoursPerM2  = floorAreaM2 && labourHours > 0
        ? Math.round((labourHours / floorAreaM2) * 100) / 100 : null;
      const costPerM2   = floorAreaM2 && totalCost > 0
        ? Math.round((totalCost   / floorAreaM2) * 100) / 100 : null;

      const actualEnd   = req.body?.actualEnd || new Date().toISOString().slice(0, 10);
      const actualStart = job.actual_start || job.start_date;
      const durationDays = actualStart
        ? Math.round((new Date(actualEnd) - new Date(actualStart)) / 86400000)
        : null;

      const closedAt = new Date().toISOString();
      const closedBy = req.caller?.id || null;

      // ── Write performance row ───────────────────────────────────────────────
      const { error: pe } = await sb
        .from("carpentry_job_performance")
        .upsert({
          job_id:              id,
          final_revenue:       revenue || null,
          final_labour_cost:   labourCost,
          final_material_cost: materialCost,
          final_total_cost:    totalCost,
          labour_hours:        labourHours,
          final_margin_pct:    finalMarginPct,
          budget_margin_pct:   budgetMarginPct,
          variance_pct:        variancePct,
          floor_area_m2:       floorAreaM2,
          hours_per_m2:        hoursPerM2,
          cost_per_m2:         costPerM2,
          duration_days:       durationDays,
          timesheet_count:     (timesheets || []).length,
          cost_entry_count:    (costRows || []).length,
          lessons_learned:     req.body?.lessonsLearned || null,
          closed_at:           closedAt,
          closed_by:           closedBy,
        }, { onConflict: "job_id" });
      if (pe) return err(res, 502, translateDbError(pe));

      // ── Mark job complete ───────────────────────────────────────────────────
      const { data: updated, error: ue } = await sb
        .from("carpentry_jobs")
        .update({
          status:     "complete",
          actual_end: actualEnd,
          updated_at: closedAt,
        })
        .eq("id", id)
        .select()
        .single();
      if (ue) return err(res, 502, translateDbError(ue));

      const performance = {
        finalRevenue:      revenue || null,
        finalLabourCost:   labourCost,
        finalMaterialCost: materialCost,
        finalTotalCost:    totalCost,
        labourHours,
        finalMarginPct,
        budgetMarginPct,
        variancePct,
        floorAreaM2,
        hoursPerM2,
        costPerM2,
        durationDays,
        timesheetCount:  (timesheets || []).length,
        costEntryCount:  (costRows || []).length,
        closedAt,
      };

      return ok(res, { job: rowToCamel(updated), performance });
    } catch (e) {
      console.error("[carpentry/closeout POST]", e);
      return err(res, 502, translateDbError(e));
    }
  });
}
