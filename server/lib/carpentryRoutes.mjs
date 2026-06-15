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
import { requireAuth } from "./requireAuth.mjs";
import { ok, err, rowToCamel, rowsToCamel, translateDbError } from "./apiResponse.mjs";
import { buildexactConfigured, getJobById } from "./buildexactClient.mjs";
import { pullBuildexactEstimate } from "./buildexactDeepIntegration.mjs";
import { parseXLSX } from "./buildexactParser.mjs";
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

      // Auto-seed budget categories from the Buildexact estimate (labour categories drive the
      // workforce labour push). Non-fatal — job creation still succeeds if Buildexact is unreachable.
      if (buildexactJobId) {
        try {
          const r = await seedBudgetsFromBuildexact(sb, job.id, buildexactJobId);
          console.log(`[carpentry/jobs POST] auto-seeded ${r.seeded} budget categories for ${job.reference}`);
        } catch (e) {
          console.warn("[carpentry/jobs POST] budget auto-seed failed:", e?.message);
        }
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
      return ok(res, { job: rowToCamel(job), performance });
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

  // ── POST /api/carpentry/buildexact/fetch ────────────────────────────────────

  app.post("/api/carpentry/buildexact/fetch", requireAuth, async (req, res) => {
    if (!buildexactConfigured()) {
      return err(res, 503, "Buildexact is not configured — set BUILDEXACT_USERNAME and BUILDEXACT_API_KEY.");
    }
    try {
      const buildexactJobId = String(req.body?.buildexactJobId || "").trim();
      if (!buildexactJobId) return err(res, 400, "buildexactJobId is required.");

      // Fetch job metadata and estimate in parallel
      const [jobDataResult, estimateResult] = await Promise.allSettled([
        getJobById(buildexactJobId),
        pullBuildexactEstimate(buildexactJobId),
      ]);

      const jobData = jobDataResult.status === "fulfilled" ? jobDataResult.value : null;
      const estimateData = estimateResult.status === "fulfilled" ? estimateResult.value : null;

      if (!estimateData && !jobData) {
        const msg = estimateResult.reason?.message || "Could not fetch Buildexact data for this job ID.";
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

      // net_total = sell price ex GST (what they charge the builder)
      const quotedValue = estimate.net_total ? Math.round(Number(estimate.net_total) * 100) / 100 : null;

      // Estimate total inc GST for reference
      const estimateTotal = estimate.estimate_total ? Math.round(Number(estimate.estimate_total) * 100) / 100 : null;

      return ok(res, {
        prefill: {
          buildexactJobId,
          clientName,
          address,
          description,
          quotedValue,
          estimateTotal,
        },
        raw: {
          jobName: description,
          categories: (estimate.categories || []).map((c) => ({
            name: c.name,
            subtotalExGst: c.subtotal_ex_gst,
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
      return ok(res, {
        prefill: {
          clientName: p.client_name || "",
          address: p.address || "",
          description: desc,
          quotedValue: round2(p.net_total),     // ex-GST sell price (what we charge the builder)
          estimateTotal: round2(p.estimate_total),
          quoteNumber: p.quote_number || "",
          buildingType: p.building_type || "",
        },
        raw: {
          quoteNumber: p.quote_number || "",
          buildingType: p.building_type || "",
          // Classify each estimate category: names without "supply" are labour
          // budget lines (actuals come from workforce timesheets); names with
          // "supply" are material budget lines (actuals from carpentry_job_costs).
          categories: (p.categories || []).map((c) => ({
            name: c.name,
            subtotalExGst: c.subtotal_ex_gst,
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

      // Record actual_start on first diary entry
      if (!job.actual_start) {
        await sb.from("carpentry_jobs")
          .update({ actual_start: date, updated_at: new Date().toISOString() })
          .eq("id", req.params.id);
      }

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
        .select("*, employees!assigned_to(id, name)")
        .eq("carpentry_job_id", req.params.id)
        .neq("status", "wont_do")
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return ok(res, { tasks: data || [] });
    } catch (e) {
      console.error("[carpentry/tasks GET]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── POST /api/carpentry/jobs/:id/tasks ──────────────────────────────────────

  app.post("/api/carpentry/jobs/:id/tasks", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { title, description, priority = "normal", dueDate } = req.body || {};
      if (!title?.trim()) return err(res, 400, "title is required.");
      const VALID_PRIORITY = ["urgent", "normal", "when_time_permits"];
      if (!VALID_PRIORITY.includes(priority)) return err(res, 400, "Invalid priority.");

      const row = {
        carpentry_job_id: req.params.id,
        project_id: null,
        title: title.trim(),
        description: description?.trim() || null,
        priority,
        due_date: dueDate || null,
        created_by: req.caller.id,
        created_via: "manual",
        status: "open",
        sort_order: 0,
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

  // ── PATCH /api/carpentry/tasks/:id ──────────────────────────────────────────

  app.patch("/api/carpentry/tasks/:id", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { status, completionNotes } = req.body || {};
      const patch = { updated_at: new Date().toISOString() };
      if (status !== undefined) {
        const VALID = ["open", "in_progress", "done", "wont_do"];
        if (!VALID.includes(status)) return err(res, 400, "Invalid status.");
        patch.status = status;
        if (status === "done") {
          patch.completed_at = new Date().toISOString();
        }
      }
      if (completionNotes !== undefined) patch.completion_notes = completionNotes || null;
      const { data: task, error } = await sb
        .from("site_tasks")
        .update(patch)
        .eq("id", req.params.id)
        .select("*, employees!assigned_to(id, name)")
        .single();
      if (error) throw error;
      if (!task) return err(res, 404, "Task not found.", "NOT_FOUND");
      return ok(res, { task });
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
      const { costType, description, amount, costDate, source = "manual", sourceReference } = req.body || {};

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

  // Pull the Buildexact estimate categories and (re)seed a carpentry job's labour/material budget
  // lines. Labour categories get a workforce_task_category — the labour→Buildexact push reads
  // category_name from here to set each Work Order line's cost category. Used by job creation
  // (auto-seed) and the manual seed endpoint / one-off backfills.
  async function seedBudgetsFromBuildexact(sb, carpentryJobId, buildexactJobId) {
    const pulled = await pullBuildexactEstimate(buildexactJobId);
    const cats = pulled?.estimate?.categories || [];
    if (!cats.length) return { seeded: 0 };
    await sb.from("carpentry_job_budgets").delete().eq("job_id", carpentryJobId);
    const rows = cats.map((c, i) => {
      const name = String(c.name || "").trim() || `Category ${i + 1}`;
      const costType = classifyCostType(name);
      return {
        job_id: carpentryJobId,
        category_name: name,
        cost_type: costType,
        budget_ex_gst: round2(c.subtotal_ex_gst ?? 0),
        workforce_task_category: costType === "labour" ? matchTaskCategory(name) : null,
        sort_order: i,
      };
    });
    const { error } = await sb.from("carpentry_job_budgets").insert(rows);
    if (error) throw error;
    return { seeded: rows.length };
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
      await sb.from("carpentry_job_budgets").delete().eq("job_id", jobId);
      const rows = categories.map((c, i) => {
        const name = String(c.name || "").trim() || `Category ${i + 1}`;
        const costType = c.costType === "labour" || c.costType === "material"
          ? c.costType
          : classifyCostType(name);
        return {
          job_id: jobId,
          category_name: name,
          cost_type: costType,
          budget_ex_gst: round2(c.subtotalExGst ?? c.budgetExGst ?? 0),
          workforce_task_category: costType === "labour" ? matchTaskCategory(name) : null,
          sort_order: i,
        };
      });
      const { data, error } = await sb.from("carpentry_job_budgets").insert(rows).select("*");
      if (error) return err(res, 500, translateDbError(error));
      return ok(res, { budgets: rowsToCamel(data || []) });
    } catch (e) {
      console.error("[carpentry/budget/seed POST]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── GET /api/carpentry/jobs/:id/budget ──────────────────────────────────────
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
      const cm = await getCostModel(sb); // company cost model (null until mig 090 + sync)

      const { data: costRows } = await sb.from("carpentry_job_costs").select("amount").eq("job_id", jobId);
      const materialActualTotal = round2((costRows || []).reduce((s, c) => s + Number(c.amount || 0), 0));

      const lines = (budgets || []).map((b) => {
        const budget = round2(b.budget_ex_gst);
        const isLabour = b.cost_type === "labour";
        const actual = isLabour
          ? round2(labourByTask[b.workforce_task_category] || 0)
          : 0; // material per-line actuals not tracked yet (see totals.materialActual)
        const actualHours = isLabour ? (hoursByTask[b.workforce_task_category] || 0) : 0;
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
