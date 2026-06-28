// marketingLibraryRoutes.mjs — Evergreen library foundation (Marketing Batch 2).
//
//   GET  /api/marketing/evergreen            — content items flagged evergreen (evergreen_score > 0)
//   POST /api/marketing/content/:id/evergreen — mark/adjust a content item's evergreen score
//
// Mounts under the blanket /api/marketing admin gate. Uses migration 122's content_items.evergreen_score.
// No AI, no external publishing.

import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import { ok, err, rowToCamel, rowsToCamel, translateDbError } from "./apiResponse.mjs";

function sb() {
  return getServiceSupabase();
}

export function registerMarketingLibraryRoutes(app) {
  app.get("/api/marketing/evergreen", requireAuth, requireRole("admin"), async (req, res) => {
    const db = sb();
    if (!db) return err(res, 503, "Database not configured");
    const { data, error } = await db
      .from("marketing_content_items")
      .select("id, channel, pillar, title, body, status, evergreen_score, operational_labels, media_source_id, created_at")
      .gt("evergreen_score", 0)
      .order("evergreen_score", { ascending: false })
      .limit(100);
    if (error) return err(res, 500, translateDbError(error));
    return ok(res, { items: rowsToCamel(data || []) });
  });

  app.post("/api/marketing/content/:id/evergreen", requireAuth, requireRole("admin"), async (req, res) => {
    const db = sb();
    if (!db) return err(res, 503, "Database not configured");
    const score = typeof req.body?.score === "number" ? req.body.score : 1;
    const { data, error } = await db
      .from("marketing_content_items")
      .update({ evergreen_score: score })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) return err(res, 400, translateDbError(error));
    return ok(res, { item: rowToCamel(data) });
  });
}
