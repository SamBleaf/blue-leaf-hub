// WHS Engine routes (Phase 1).
// Profile = single source of truth. Save recomputes the risk engine + marks
// generated documents stale. Generate renders a template from the profile.

import fs from "node:fs/promises";
import path from "node:path";
import { ok, err, rowToCamel, rowsToCamel, translateDbError } from "../apiResponse.mjs";
import { requireAuth } from "../requireAuth.mjs";
import { getServiceSupabase } from "../supabaseService.mjs";
import { WHS_QUESTIONNAIRE, PROMOTED_FIELDS } from "./whsQuestionnaire.mjs";
import { deriveOutputs } from "./whsRiskRules.mjs";
import { buildMergeContext } from "./whsMergeFields.mjs";
import { renderTemplate } from "./whsRenderer.mjs";

const TEMPLATE_DIR = path.join(process.cwd(), "docs", "whs", "template-pack");

// Phase 1: only the WHS Management Plan is wired (prove the pipeline on one doc).
const TEMPLATES = {
  project_whs_management_plan: {
    file: "03_project_whs_management_plan.md",
    title: "Project WHS Management Plan",
    audience: "management",
    version: "1.0",
  },
};

const BOOL_PROMOTED = new Set(["site_fenced", "temporary_fencing_required"]);

// ── Prefill helpers ──
function mapProjectType(raw) {
  const t = String(raw || "").toLowerCase().replace(/[\s_-]+/g, "");
  if (t.includes("new") || t === "newbuild" || t === "newbome") return "new_home";
  if (t.includes("renov")) return "renovation";
  if (t.includes("addit") || t.includes("extens")) return "addition";
  return "";
}

function mapStoreys(n) {
  const num = parseInt(n, 10);
  if (num === 1) return "single";
  if (num === 2) return "double";
  if (num >= 3) return "triple";
  return "";
}

function coerceBool(v) {
  if (v === true || v === "yes" || v === "true") return true;
  if (v === false || v === "no" || v === "false") return false;
  return null;
}

// Build the row patch: promoted answers -> columns, full set -> answers jsonb, derived -> columns.
function buildProfilePatch(answers, derived) {
  const patch = { answers, ...derived };
  for (const f of PROMOTED_FIELDS) {
    if (answers[f] === undefined) continue;
    patch[f] = BOOL_PROMOTED.has(f) ? coerceBool(answers[f]) : answers[f];
  }
  return patch;
}

function normName(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// Sync project_swms links from the risk engine's derived applicable_swms (H6).
// Induction reads project_swms; without this its SWMS list is always empty. swms_templates
// has no seed and no management UI, so we auto-create a stub template per derived SWMS
// activity (Sam attaches the actual PDF to the template later) and keep the links in sync.
// No other code writes project_swms, so a full replace per project is safe.
async function syncProjectSwms(sb, projectId, applicableSwms) {
  const names = Array.isArray(applicableSwms)
    ? [...new Set(applicableSwms.filter(Boolean).map(String))]
    : [];
  try {
    const { data: templates } = await sb.from("swms_templates").select("id, trade, title, is_active");
    const pool = templates || [];
    const byTitle = new Map(pool.map((t) => [normName(t.title), t]));
    const linkRows = [];
    for (const name of names) {
      let tpl =
        byTitle.get(normName(name)) ||
        pool.find((t) => normName(t.trade) === normName(name)) ||
        pool.find((t) => normName(t.title) === normName(`${name} SWMS`));
      if (!tpl) {
        const { data: created, error: ce } = await sb
          .from("swms_templates")
          .insert({ trade: name, title: `${name} SWMS`, is_active: true })
          .select("id, trade, title").single();
        if (ce || !created) continue;
        tpl = created;
        pool.push(created);
        byTitle.set(normName(created.title), created);
      }
      if (tpl.is_active === false) continue;
      linkRows.push({ project_id: projectId, swms_template_id: tpl.id, trade: tpl.trade || name });
    }
    await sb.from("project_swms").delete().eq("project_id", projectId);
    if (linkRows.length) await sb.from("project_swms").insert(linkRows);
  } catch (e) {
    console.warn("[whs/project_swms-sync]", e?.message);
  }
}

export function registerWhsEngineRoutes(app) {
  // ── Questionnaire definition (drives the UI) ──
  app.get("/api/whs/questionnaire", requireAuth, (_req, res) =>
    ok(res, { questionnaire: WHS_QUESTIONNAIRE, promotedFields: PROMOTED_FIELDS }));

  // ── Load a project's WHS profile + Level 1 prefill ──
  app.get("/api/whs/projects/:projectId/profile", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database unavailable");
    const projectId = String(req.params.projectId);
    try {
      const { data: profile } = await sb.from("whs_site_profiles").select("*").eq("project_id", projectId).maybeSingle();
      const { data: project } = await sb.from("projects").select("*").eq("id", projectId).maybeSingle();
      if (!project) return err(res, 404, "Project not found");
      let job = null;
      if (project.job_id) ({ data: job } = await sb.from("jobs").select("*").eq("id", project.job_id).maybeSingle());

      const appUrl = (process.env.APP_URL || "https://blueleafhub.com.au").replace(/\/$/, "");
      const prefill = {
        project_name: project.address || "",
        project_address: project.address || "",
        client_name: project.client_name || project.portal_client_name || job?.client_name || "",
        project_type: job?.project_type || project.project_type || "",
        site_supervisor_name: project.supervisor || job?.supervisor || "",
        principal_contractor: "Blue Leaf Building",
        m0_project_type: mapProjectType(job?.project_type || project.project_type),
        m0_storeys: mapStoreys(job?.storeys ?? project.storeys),
        site_qr_induction_url: `${appUrl}/induct/${projectId}`,
      };
      return ok(res, { profile: profile ? rowToCamel(profile) : null, prefill, questionnaire: WHS_QUESTIONNAIRE });
    } catch (e) {
      return err(res, 500, e?.message || "Failed to load WHS profile");
    }
  });

  // ── Save answers → recompute risk engine → mark docs stale ──
  app.put("/api/whs/projects/:projectId/profile", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database unavailable");
    const projectId = String(req.params.projectId);
    const answers = req.body?.answers && typeof req.body.answers === "object" ? req.body.answers : {};
    try {
      const derived = deriveOutputs(answers);
      const patch = buildProfilePatch(answers, derived);
      patch.updated_by = req.caller?.id || null;
      patch.updated_at = new Date().toISOString();
      if (req.body?.status === "complete") {
        patch.status = "complete";
        patch.completed_at = new Date().toISOString();
      }

      const { data: existing } = await sb.from("whs_site_profiles").select("id, version").eq("project_id", projectId).maybeSingle();
      let row;
      if (existing) {
        patch.version = (existing.version || 1) + 1;
        const { data, error } = await sb.from("whs_site_profiles").update(patch).eq("id", existing.id).select("*").single();
        if (error) return err(res, 500, translateDbError(error));
        row = data;
        // Profile changed → any generated (non-approved) document is now stale.
        await sb.from("whs_documents")
          .update({ is_stale: true, status: "stale" })
          .eq("project_id", projectId)
          .neq("status", "approved");
      } else {
        patch.project_id = projectId;
        patch.created_by = req.caller?.id || null;
        patch.version = 1;
        const { data, error } = await sb.from("whs_site_profiles").insert(patch).select("*").single();
        if (error) return err(res, 500, translateDbError(error));
        row = data;
      }
      // Keep induction SWMS in sync with the risk engine's derived list (H6).
      await syncProjectSwms(sb, projectId, row?.applicable_swms);
      return ok(res, { profile: rowToCamel(row) });
    } catch (e) {
      return err(res, 500, e?.message || "Failed to save WHS profile");
    }
  });

  // ── List generated documents ──
  app.get("/api/whs/projects/:projectId/documents", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database unavailable");
    try {
      const { data, error } = await sb.from("whs_documents")
        .select("*").eq("project_id", req.params.projectId)
        .order("generated_at", { ascending: false });
      if (error) return err(res, 500, translateDbError(error));
      return ok(res, { documents: rowsToCamel(data || []) });
    } catch (e) {
      return err(res, 500, e?.message || "Failed to load documents");
    }
  });

  // ── Generate a document from the profile ──
  app.post("/api/whs/projects/:projectId/generate/:templateKey", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database unavailable");
    const tpl = TEMPLATES[req.params.templateKey];
    if (!tpl) return err(res, 400, "Unknown template");
    const projectId = String(req.params.projectId);
    try {
      const { data: profile } = await sb.from("whs_site_profiles").select("*").eq("project_id", projectId).maybeSingle();
      if (!profile) return err(res, 400, "Complete the WHS questionnaire before generating documents");
      const { data: project } = await sb.from("projects").select("*").eq("id", projectId).maybeSingle();
      let job = null;
      if (project?.job_id) ({ data: job } = await sb.from("jobs").select("*").eq("id", project.job_id).maybeSingle());

      const documentMeta = {
        document_title: tpl.title,
        document_key: req.params.templateKey,
        template_version: tpl.version,
        profile_version: profile.version,
      };
      const context = buildMergeContext({ project: project || {}, job: job || {}, profile, documentMeta });
      const markdown = await fs.readFile(path.join(TEMPLATE_DIR, tpl.file), "utf8");
      const { rendered, missing, missingRequired } = renderTemplate(markdown, context);

      const insert = {
        project_id: projectId,
        template_key: req.params.templateKey,
        document_title: tpl.title,
        audience_layer: tpl.audience,
        template_version: tpl.version,
        profile_version: profile.version,
        rendered_markdown: rendered,
        missing_fields: missingRequired,
        status: missingRequired.length ? "requires_review" : "generated",
        is_stale: false,
        generated_by: req.caller?.id || null,
      };
      const { data, error } = await sb.from("whs_documents").insert(insert).select("*").single();
      if (error) return err(res, 500, translateDbError(error));
      return ok(res, { document: rowToCamel(data), missing, missingRequired });
    } catch (e) {
      return err(res, 500, e?.message || "Failed to generate document");
    }
  });
}
