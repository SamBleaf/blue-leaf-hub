// carpentryWhsPackRoutes.mjs — Phase B: the per-job site WHS pack workflow (admin/supervisor).
// The supervisor answers a short questionnaire (which modules apply, pre-ticked from project_type),
// selects the controls ACTUALLY used per module, fills the Part-3 site details, and generates one
// composed 3-part pack. A competent reviewer approves it; the crew then signs that version (Phase C).
import { ok, err, rowsToCamel, rowToCamel, translateDbError } from "../apiResponse.mjs";
import { requireAuth, requireRole } from "../requireAuth.mjs";
import { getServiceSupabase } from "../supabaseService.mjs";
import { workCategoriesForProjectType } from "./carpentrySwmsMap.mjs";
import { composeWhsPack } from "./packCompose.mjs";
import { needsJustification } from "./hierarchyBar.mjs";
import { buildWhsPackPdfBuffer } from "./packPdfKit.mjs";
import { getBrandingEmailLogo } from "../brandingAssets.mjs";
import { J_MAP_CODES, jScopeMissing } from "./carpentryScope.mjs";

const isPart1 = (m) => m.part === 1 || m.is_hrcw === "yes" || m.is_hrcw === "boundary";

async function loadApplicableModules(sb, projectType) {
  const cats = workCategoriesForProjectType(projectType);
  const { data } = await sb.from("swms_templates").select("*")
    .eq("trade", "Carpentry").eq("is_active", true).overlaps("work_category", cats).order("module_code");
  return data || [];
}

// Modules SELECTABLE in the builder: the project-type pre-tick set + every module a job-scope question can
// derive (so ticking "load-bearing? yes" can surface H-08/H-09, which no full-package stage overlaps) +
// whatever's already selected on the pack. Broader than loadApplicableModules, which drives the pre-tick.
async function loadSelectableModules(sb, projectType, pack) {
  const cats = workCategoriesForProjectType(projectType);
  const selected = [...(pack?.selected_hrcw || []), ...(pack?.selected_task || [])];
  const [{ data: byCat }, { data: byCode }] = await Promise.all([
    sb.from("swms_templates").select("*").eq("trade", "Carpentry").eq("is_active", true).overlaps("work_category", cats),
    sb.from("swms_templates").select("*").eq("trade", "Carpentry").eq("is_active", true).in("module_code", [...new Set([...J_MAP_CODES, ...selected])]),
  ]);
  const merged = new Map();
  for (const m of [...(byCat || []), ...(byCode || [])]) merged.set(m.id, m);
  return [...merged.values()].sort((a, b) => String(a.module_code).localeCompare(String(b.module_code)));
}

// Load a job's current pack + its selected modules + company, and compose the 3-part HTML.
// Shared by the admin compose endpoint and the worker field sign-on (workforceRoutes.mjs).
export async function loadAndComposePack(sb, jobId) {
  const { data: job } = await sb.from("carpentry_jobs").select("id, reference, address, project_type, client_name").eq("id", jobId).maybeSingle();
  if (!job) return { error: "Job not found." };
  const { data: pack } = await sb.from("carpentry_whs_packs").select("*").eq("carpentry_job_id", jobId).maybeSingle();
  if (!pack) return { job, pack: null, html: null };
  const codes = [...(pack.selected_hrcw || []), ...(pack.selected_task || [])];
  const { data: modules } = codes.length
    ? await sb.from("swms_templates").select("*").in("module_code", codes)
    : { data: [] };
  let company = {};
  try { const { data: c } = await sb.from("company_profile").select("name, abn, address, phone, email").order("id").limit(1).maybeSingle(); company = c || {}; } catch { /* pre-mig */ }
  const html = composeWhsPack({ job: rowToCamel(job), company, pack, modules: modules || [] });
  return { job, pack, html };
}

async function getOrCreatePack(sb, jobId, projectType, callerId) {
  let { data: pack } = await sb.from("carpentry_whs_packs").select("*").eq("carpentry_job_id", jobId).maybeSingle();
  if (!pack) {
    const mods = await loadApplicableModules(sb, projectType);
    const scaffold = {
      carpentry_job_id: jobId,
      selected_hrcw: mods.filter(isPart1).map((m) => m.module_code),
      selected_task: mods.filter((m) => !isPart1(m)).map((m) => m.module_code),
      selected_controls: {}, answers: {}, ppe: {}, consultation: {}, created_by: callerId || null,
    };
    const { data, error } = await sb.from("carpentry_whs_packs").insert(scaffold).select("*").single();
    if (error) {
      // Two concurrent first-loads race the one-pack-per-job unique index; the loser re-reads the winner's row.
      if (error.code === "23505" || /duplicate|unique/i.test(String(error.message || ""))) {
        const { data: existing } = await sb.from("carpentry_whs_packs").select("*").eq("carpentry_job_id", jobId).maybeSingle();
        if (existing) return existing;
      }
      throw error;
    }
    pack = data;
  }
  return pack;
}

// The "Blue Leaf standard controls" house template: { module_code: [control text] } of CONFIRMED
// standard picks, pre-filled on new jobs as SUGGESTIONS (never ticks). Deploy-order net: if migration
// 169 hasn't been applied the table is absent — return an empty template rather than 500 the pack load.
async function loadStandardControls(sb, scope = "carpentry") {
  try {
    const { data, error } = await sb.from("whs_control_templates").select("controls").eq("scope", scope).maybeSingle();
    if (error) {
      // 42P01 = table absent (migration 169 not applied yet). The house standard is OPTIONAL, so NEVER let a
      // read error break the safety-critical pack load — degrade to "no standard". Log the unexpected ones.
      const expected = error.code === "42P01" || /relation .* does not exist|whs_control_templates/i.test(String(error.message || ""));
      if (!expected) console.warn("[whs] loadStandardControls:", error.message || error);
      return {};
    }
    return (data && data.controls && typeof data.controls === "object") ? data.controls : {};
  } catch (e) {
    console.warn("[whs] loadStandardControls threw:", e?.message || e);
    return {};
  }
}

export function registerCarpentryWhsPackRoutes(app) {
  // Load (or scaffold) the job's pack + every applicable module (with content_json for the control pickers).
  app.get("/api/carpentry/jobs/:jobId/whs-pack", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const jobId = String(req.params.jobId);
    try {
      const { data: job } = await sb.from("carpentry_jobs").select("id, reference, address, project_type, client_name").eq("id", jobId).maybeSingle();
      if (!job) return err(res, 404, "Job not found.");
      const pack = await getOrCreatePack(sb, jobId, job.project_type, req.caller?.id);
      const modules = await loadSelectableModules(sb, job.project_type, pack);
      // Crew × current-pack-version sign-on (the field liability shield). Crew = active employees
      // rostered to this job (Planner allocations) — same source as the legacy SWMS matrix.
      const { data: allocs } = await sb.from("workforce_allocations").select("employee_id").eq("carpentry_job_id", jobId);
      const empIds = [...new Set((allocs || []).map((a) => a.employee_id).filter(Boolean))];
      let crew = [];
      if (empIds.length) {
        const { data: emps } = await sb.from("employees").select("id, name").in("id", empIds).eq("is_active", true).order("name");
        crew = emps || [];
      }
      const { data: sg } = await sb.from("whs_swms_signon").select("employee_id, pack_version, signed_at").eq("pack_id", pack.id);
      // The house-standard control template — the client pre-fills these as SUGGESTIONS (never ticks) for
      // the scoped-in modules. Sent with the pack so no second round-trip is needed.
      const standardControls = await loadStandardControls(sb, "carpentry");
      return ok(res, { pack: rowToCamel(pack), modules: rowsToCamel(modules), job: rowToCamel(job), crew: rowsToCamel(crew), signons: rowsToCamel(sg || []), standardControls });
    } catch (e) {
      return err(res, 500, translateDbError(e) || "Could not load the WHS pack.");
    }
  });

  // Save the supervisor's selections + Part-3 answers.
  app.put("/api/carpentry/jobs/:jobId/whs-pack", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const jobId = String(req.params.jobId);
    const b = req.body || {};
    // An ISSUED pack is a signed liability document — its selections must not change in place (that would
    // silently diverge the composed doc from what the crew signed while they still read as signed). Editing
    // requires an explicit "revise" (bumps version → draft → everyone re-signs).
    const { data: existing } = await sb.from("carpentry_whs_packs").select("review_status").eq("carpentry_job_id", jobId).maybeSingle();
    if (existing?.review_status === "issued") {
      return err(res, 409, "This pack is issued and signed. Click 'New revision' before changing it — that bumps the version so the crew re-signs.");
    }
    const patch = { updated_at: new Date().toISOString() };
    if (Array.isArray(b.selectedHrcw)) patch.selected_hrcw = b.selectedHrcw.map(String);
    if (Array.isArray(b.selectedTask)) patch.selected_task = b.selectedTask.map(String);
    if (b.selectedControls && typeof b.selectedControls === "object") patch.selected_controls = b.selectedControls;
    if (b.answers && typeof b.answers === "object") patch.answers = b.answers;
    if (b.ppe && typeof b.ppe === "object") patch.ppe = b.ppe;
    if (b.consultation && typeof b.consultation === "object") patch.consultation = b.consultation;
    // Document control (Phase 2): scheduled review date + the competent reviewer record.
    if (typeof b.reviewDueAt === "string" || b.reviewDueAt === null) patch.review_due_at = b.reviewDueAt || null;
    if (typeof b.reviewedBy === "string" || b.reviewedBy === null) patch.reviewed_by = b.reviewedBy || null;
    if (typeof b.reviewedAt === "string" || b.reviewedAt === null) patch.reviewed_at = b.reviewedAt || null;
    try {
      let { data, error } = await sb.from("carpentry_whs_packs").update(patch).eq("carpentry_job_id", jobId).select("*").single();
      // Deploy-order net: if migration 168 hasn't been applied yet the review-date columns don't exist —
      // don't 500 the whole save; drop just those keys and persist everything else.
      if (error && (error.code === "42703" || /review_due_at|reviewed_by|reviewed_at|column .* does not exist/i.test(String(error.message || "")))) {
        delete patch.review_due_at; delete patch.reviewed_by; delete patch.reviewed_at;
        ({ data, error } = await sb.from("carpentry_whs_packs").update(patch).eq("carpentry_job_id", jobId).select("*").single());
      }
      if (error) return err(res, 500, translateDbError(error));
      return ok(res, { pack: rowToCamel(data) });
    } catch (e) {
      return err(res, 500, translateDbError(e) || "Could not save the pack.");
    }
  });

  // Compose the 3-part pack HTML (preview / issue).
  app.get("/api/carpentry/jobs/:jobId/whs-pack/compose", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const jobId = String(req.params.jobId);
    try {
      const { error, html, pack } = await loadAndComposePack(sb, jobId);
      if (error) return err(res, 404, error);
      if (!pack) return err(res, 400, "No pack for this job yet.");
      return ok(res, { html });
    } catch (e) {
      return err(res, 500, translateDbError(e) || "Could not compose the pack.");
    }
  });

  // The printed artefact (Phase 3) — a branded, page-numbered A4 PDF (the Surface-C archival record).
  app.get("/api/carpentry/jobs/:jobId/whs-pack/pdf", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const jobId = String(req.params.jobId);
    try {
      const { error, job, pack } = await loadAndComposePack(sb, jobId);
      if (error) return err(res, 404, error);
      if (!pack) return err(res, 400, "No pack for this job yet.");
      const codes = [...(pack.selected_hrcw || []), ...(pack.selected_task || [])];
      const { data: modules } = codes.length ? await sb.from("swms_templates").select("*").in("module_code", codes) : { data: [] };
      let company = {};
      try { const { data: c } = await sb.from("company_profile").select("name, abn, address, phone, email").order("id").limit(1).maybeSingle(); company = c || {}; } catch { /* pre-mig */ }
      const logoDataUrl = await getBrandingEmailLogo(sb).catch(() => "");
      const buf = await buildWhsPackPdfBuffer({ job: rowToCamel(job), company, pack, modules: modules || [], logoDataUrl });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="WHS-Pack-${String(job.reference || "pack").replace(/[^\w.-]+/g, "-")}-v${pack.version || 1}.pdf"`);
      return res.end(buf);
    } catch (e) {
      return err(res, 500, translateDbError(e) || "Could not build the PDF.");
    }
  });

  // Approve (issue) — requires every selected module to be reviewed. Or revise (bump version → re-sign).
  app.post("/api/carpentry/jobs/:jobId/whs-pack/:action", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const jobId = String(req.params.jobId);
    const action = req.params.action;
    try {
      const { data: pack } = await sb.from("carpentry_whs_packs").select("*").eq("carpentry_job_id", jobId).maybeSingle();
      if (!pack) return err(res, 404, "No pack for this job.");
      if (action === "approve") {
        // An issued pack is immutable through approve — re-approving would silently reassign the reviewer
        // record (approved_by/at) with no revision. Force a revision to change anything.
        if (pack.review_status === "issued") return err(res, 409, "This pack is already issued. Click 'New revision' to change it, then re-approve.");
        const codes = [...(pack.selected_hrcw || []), ...(pack.selected_task || [])];
        if (!codes.length) return err(res, 409, "Select at least one module that applies to this job before issuing.");
        const { data: mods } = await sb.from("swms_templates").select("module_code, review_status, content_json, part, is_hrcw").in("module_code", codes);
        // Every selected code must still exist in the register (a deleted/renamed module can't silently vanish).
        const missing = codes.filter((c) => !(mods || []).some((m) => m.module_code === c));
        if (missing.length) return err(res, 409, `These modules no longer exist in the register: ${missing.join(", ")}. Fix the pack selection before issuing.`);
        const unreviewed = (mods || []).filter((m) => m.review_status !== "reviewed").map((m) => m.module_code);
        if (unreviewed.length) return err(res, 409, `These modules aren't reviewed yet: ${unreviewed.join(", ")}. A WHS reviewer must approve each module in Settings first.`);
        // A selected module that HAS control options but none ticked would render "cannot proceed" — block it.
        const sel = pack.selected_controls || {};
        const noControls = (mods || []).filter((m) => {
          const opts = Array.isArray(m.content_json?.controlOptions) ? m.content_json.controlOptions : [];
          // Count only ticks whose TEXT still exists in the register — a control edited/removed after it was
          // ticked leaves a stale text that must NOT count as a live control (else an HRCW issues with none).
          const validPicked = (Array.isArray(sel[m.module_code]) ? sel[m.module_code] : []).filter((t) => opts.some((o) => o.text === t));
          return opts.length > 0 && validPicked.length === 0;
        }).map((m) => m.module_code);
        if (noControls.length) return err(res, 409, `Select the controls in place for: ${noControls.join(", ")}. You can't issue a pack with an HRCW/task that has no controls ticked.`);
        // G-2: an HRCW module whose top ticked control is admin (L5) or PPE (L6) is leaning on paperwork/a
        // mask — require a written justification before issue (it renders in the pack for the reviewer).
        const just = pack.answers?.justifications || {};
        const needJust = (mods || []).filter((m) => {
          const opts = Array.isArray(m.content_json?.controlOptions) ? m.content_json.controlOptions : [];
          const picked = Array.isArray(sel[m.module_code]) ? sel[m.module_code] : [];
          const levels = opts.filter((o) => picked.includes(o.text)).map((o) => Number(o.level));
          return needsJustification(levels, isPart1(m)) && !String(just[m.module_code] || "").trim();
        }).map((m) => m.module_code);
        if (needJust.length) return err(res, 409, `These high-risk modules rely on admin/PPE as the top control — add a written justification for: ${needJust.join(", ")}.`);
        // G-6: every job-scope question must be answered (a negative is an answer, a blank is not) — this
        // is what produces the "considered and not applicable" record and stops a module being silently missed.
        const scopeMissing = jScopeMissing(pack.answers?.jScope || {});
        if (scopeMissing.length) return err(res, 409, "Answer every job-scope question before issuing (Section 1) — a blank isn't an answer.");
        // G-8: a pack must carry a scheduled review date before it issues.
        if (!pack.review_due_at) return err(res, 409, "Set a scheduled review date (Section 3) before issuing — a pack with no review date is how the last SWMS went four years stale.");
        // G-3: if fall arrest is in use, the rescue plan must be complete — no arrest without a way down.
        if (pack.answers?.fallArrestInUse) {
          const need = [["rescuer", "named rescuer on site"], ["rescueMethod", "rescue method"], ["groundClearance", "ground-clearance calculation"]]
            .filter(([k]) => !String(pack.answers?.[k] || "").trim()).map(([, l]) => l);
          if (need.length) return err(res, 409, `Fall arrest is in use — complete the rescue plan before issuing: ${need.join(", ")}.`);
        }
        const { data, error } = await sb.from("carpentry_whs_packs").update({ review_status: "issued", approved_by: req.caller?.id || null, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("carpentry_job_id", jobId).select("*").single();
        if (error) return err(res, 500, translateDbError(error));
        return ok(res, { pack: rowToCamel(data) });
      }
      if (action === "revise") {
        // Clear the competent-reviewer sign-off too — a revised pack must not re-issue carrying the previous
        // reviewer's name/date as if they'd seen the changed content (the stale-sign-off this system guards against).
        const { data, error } = await sb.from("carpentry_whs_packs").update({ version: (Number(pack.version) || 1) + 1, review_status: "draft", approved_by: null, approved_at: null, reviewed_by: null, reviewed_at: null, updated_at: new Date().toISOString() }).eq("carpentry_job_id", jobId).select("*").single();
        if (error) return err(res, 500, translateDbError(error));
        return ok(res, { pack: rowToCamel(data) });
      }
      return err(res, 400, "Unknown action.");
    } catch (e) {
      return err(res, 500, translateDbError(e) || "Could not update the pack.");
    }
  });

  // ── House "Blue Leaf standard controls" template ─────────────────────────────────────────────────
  // A saved library of standard control CHOICES per module — pre-filled on new jobs as SUGGESTIONS, never
  // as ticks. It asserts nothing about any site; only a supervisor's on-site tap confirms a control.
  app.get("/api/carpentry/whs-control-template", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      return ok(res, { controls: await loadStandardControls(sb, "carpentry") });
    } catch (e) {
      return err(res, 500, translateDbError(e) || "Could not load the standard controls.");
    }
  });

  // Save the current CONFIRMED control picks as the house standard. Body: { controls: { code: [text] } }.
  app.put("/api/carpentry/whs-control-template", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const raw = (req.body && typeof req.body.controls === "object" && req.body.controls) || {};
    // Sanitise to { code: [non-empty string, ...] } with at least one control — never store junk as the standard.
    const controls = {};
    for (const [code, texts] of Object.entries(raw)) {
      if (!Array.isArray(texts)) continue;
      const clean = [...new Set(texts.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim()))];
      if (clean.length) controls[String(code)] = clean;
    }
    try {
      const row = { scope: "carpentry", name: "Blue Leaf standard controls", controls, updated_by: req.caller?.id || null, updated_at: new Date().toISOString() };
      const { data, error } = await sb.from("whs_control_templates").upsert(row, { onConflict: "scope" }).select("controls").single();
      if (error) {
        if (error.code === "42P01" || /relation .* does not exist|whs_control_templates/i.test(String(error.message || ""))) {
          return err(res, 503, "Apply migration 169 (whs_control_templates) before saving the house standard.");
        }
        return err(res, 500, translateDbError(error));
      }
      return ok(res, { controls: data.controls || {} });
    } catch (e) {
      return err(res, 500, translateDbError(e) || "Could not save the standard controls.");
    }
  });
}
