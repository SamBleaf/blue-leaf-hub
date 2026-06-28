// marketingPackageRoutes.mjs — Content package persistence + Approval Queue API (Run C1).
//
//   POST  /api/marketing/packages              — persist an already-generated draft set as a package
//   GET   /api/marketing/packages?status=       — list packages (+ child items) — Approval Queue source
//   GET   /api/marketing/packages/:id           — single package + child items
//   PATCH /api/marketing/packages/:id/approve   — approval decision (approve | request_changes | reject)
//
// Mounts under the blanket /api/marketing admin gate (dev-api.mjs). Standards: apiResponse + camelCase.
// No live AI, no posting. Requires migration 122 (packages table + content_items package columns) to be
// applied at runtime; without it these queries return a translated DB error (UI shows a demo fallback).

import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth } from "./requireAuth.mjs";
import { ok, err, rowToCamel, rowsToCamel, translateDbError } from "./apiResponse.mjs";

function sb() {
  return getServiceSupabase();
}

const PACKAGE_ITEM_SELECT =
  "*, marketing_content_items(id, channel, status, title, body, cta, hashtags, review_scores, operational_labels, risk_level, generation_metadata)";

// approval action → status (content_items + packages share this enum)
const APPROVE_ACTION = { approve: "approved", request_changes: "draft", reject: "archived" };

function shapePackage(row) {
  const items = row.marketing_content_items || [];
  const { marketing_content_items: _drop, ...rest } = row;
  return { ...rowToCamel(rest), items: rowsToCamel(items) };
}

export function registerMarketingPackageRoutes(app) {
  // ─── Persist a package from already-generated drafts (no AI, no posting) ───
  app.post("/api/marketing/packages", requireAuth, async (req, res) => {
    const db = sb();
    if (!db) return err(res, 503, "Database not configured");

    const { topic, pillar, angle, audience, platforms, sourceAssetId, reviewSummary, drafts } = req.body || {};
    if (!Array.isArray(drafts) || drafts.length === 0) return err(res, 400, "At least one draft is required");

    const { data: pkg, error: pkgErr } = await db
      .from("marketing_content_packages")
      .insert({
        topic: topic || angle?.title || null,
        pillar: pillar || angle?.pillar || null,
        angle_payload: angle || {},
        source_asset_ids: sourceAssetId ? [sourceAssetId] : [],
        audience: Array.isArray(audience) ? audience : [],
        recommended_platforms: Array.isArray(platforms) ? platforms : [],
        status: "in_review",
        review_summary: reviewSummary || {},
        created_by: req.caller?.id || null,
      })
      .select()
      .single();
    if (pkgErr) return err(res, 400, translateDbError(pkgErr));

    const itemRows = drafts.map((d) => ({
      channel: d.channel || "instagram",
      pillar: pillar || angle?.pillar || "the_work",
      topic: topic || angle?.title || "",
      title: d.title || "",
      body: d.body || "",
      cta: d.cta || "",
      hashtags: Array.isArray(d.hashtags) ? d.hashtags : [],
      review_scores: d.reviewScores || {},
      status: "in_review",
      media_source_id: sourceAssetId || null,
      package_id: pkg.id,
      operational_labels: Array.isArray(d.operationalLabels) ? d.operationalLabels : [],
      risk_level: d.riskLevel || null,
      generation_metadata: d.generationMetadata || {},
      created_by: req.caller?.id || null,
    }));

    const { data: items, error: itemErr } = await db
      .from("marketing_content_items")
      .insert(itemRows)
      .select("id, channel, status");
    if (itemErr) return err(res, 500, translateDbError(itemErr));

    return ok(res, { package: rowToCamel(pkg), items: rowsToCamel(items || []) });
  });

  // ─── List packages (Approval Queue) ───────────────────────────────────────
  app.get("/api/marketing/packages", requireAuth, async (req, res) => {
    const db = sb();
    if (!db) return err(res, 503, "Database not configured");

    let query = db.from("marketing_content_packages").select(PACKAGE_ITEM_SELECT).order("created_at", { ascending: false });
    if (req.query.status) query = query.eq("status", req.query.status);

    const { data, error } = await query;
    if (error) return err(res, 500, translateDbError(error));
    return ok(res, { packages: (data || []).map(shapePackage) });
  });

  // ─── Package detail ───────────────────────────────────────────────────────
  app.get("/api/marketing/packages/:id", requireAuth, async (req, res) => {
    const db = sb();
    if (!db) return err(res, 503, "Database not configured");
    const { data, error } = await db
      .from("marketing_content_packages")
      .select(PACKAGE_ITEM_SELECT)
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) return err(res, 500, translateDbError(error));
    if (!data) return err(res, 404, "Package not found");
    return ok(res, { package: shapePackage(data) });
  });

  // ─── Approval decision (no publishing) ────────────────────────────────────
  app.patch("/api/marketing/packages/:id/approve", requireAuth, async (req, res) => {
    const db = sb();
    if (!db) return err(res, 503, "Database not configured");

    const status = APPROVE_ACTION[req.body?.action];
    if (!status) return err(res, 400, "action must be approve, request_changes, or reject");

    const { data: pkg, error } = await db
      .from("marketing_content_packages")
      .update({ status })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) return err(res, 400, translateDbError(error));

    // Cascade the decision to child content items (no publish — status only).
    await db.from("marketing_content_items").update({ status }).eq("package_id", req.params.id);

    return ok(res, { package: rowToCamel(pkg) });
  });
}
