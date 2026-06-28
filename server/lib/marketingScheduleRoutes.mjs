// marketingScheduleRoutes.mjs — Calendar + manual publishing foundation (Marketing Batch 2).
//
//   GET   /api/marketing/calendar?from=&to=   — scheduled content items + campaign slots in range
//   POST  /api/marketing/schedule             — set content_items.scheduled_at (+ optional slot link)
//   POST  /api/marketing/publish-log          — manual "mark as posted" log (NO external API)
//   GET   /api/marketing/publish-log          — recent manual publish log
//
// Mounts under the blanket /api/marketing admin gate. No live posting; manual logging only.
// Uses migration 122 columns (content_items.scheduled_at, social_post_publishes.publish_mode/status).

import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth } from "./requireAuth.mjs";
import { ok, err, rowToCamel, rowsToCamel, translateDbError } from "./apiResponse.mjs";

function sb() {
  return getServiceSupabase();
}

export function registerMarketingScheduleRoutes(app) {
  app.get("/api/marketing/calendar", requireAuth, async (req, res) => {
    const db = sb();
    if (!db) return err(res, 503, "Database not configured");
    const { from, to } = req.query;

    let ci = db
      .from("marketing_content_items")
      .select("id, channel, title, status, scheduled_at, package_id, media_source_id")
      .not("scheduled_at", "is", null);
    if (from) ci = ci.gte("scheduled_at", from);
    if (to) ci = ci.lte("scheduled_at", to);
    const { data: content, error: ciErr } = await ci.order("scheduled_at", { ascending: true });
    if (ciErr) return err(res, 500, translateDbError(ciErr));

    let sq = db.from("campaign_schedule_slots").select("*, marketing_campaigns(name)");
    if (from) sq = sq.gte("slot_date", from);
    if (to) sq = sq.lte("slot_date", to);
    const { data: slots, error: sErr } = await sq.order("slot_date", { ascending: true });
    if (sErr) return err(res, 500, translateDbError(sErr));

    const slotRows = (slots || []).map((s) => {
      const camp = s.marketing_campaigns || {};
      const { marketing_campaigns: _drop, ...rest } = s;
      return { ...rowToCamel(rest), campaignName: camp.name || null };
    });

    return ok(res, { scheduledContent: rowsToCamel(content || []), slots: slotRows });
  });

  app.post("/api/marketing/schedule", requireAuth, async (req, res) => {
    const db = sb();
    if (!db) return err(res, 503, "Database not configured");
    const { contentItemId, scheduledAt, slotId } = req.body || {};
    if (!contentItemId || !scheduledAt) return err(res, 400, "contentItemId and scheduledAt are required");

    const { data, error } = await db
      .from("marketing_content_items")
      .update({ scheduled_at: scheduledAt })
      .eq("id", contentItemId)
      .select()
      .single();
    if (error) return err(res, 400, translateDbError(error));

    if (slotId) {
      await db
        .from("campaign_schedule_slots")
        .update({ content_item_id: contentItemId, status: "assigned" })
        .eq("id", slotId);
    }
    return ok(res, { item: rowToCamel(data) });
  });

  // Manual publish log — records that a human posted externally. No external API call.
  app.post("/api/marketing/publish-log", requireAuth, async (req, res) => {
    const db = sb();
    if (!db) return err(res, 503, "Database not configured");
    const { contentItemId, platform, platformPostId, publishedUrl, captionUsed, mediaAssetId, campaignId } = req.body || {};
    if (!contentItemId || !platform) return err(res, 400, "contentItemId and platform are required");

    const { data, error } = await db
      .from("social_post_publishes")
      .insert({
        content_item_id: contentItemId,
        platform,
        platform_post_id: platformPostId || null,
        caption_used: captionUsed || null,
        media_asset_id: mediaAssetId || null,
        campaign_id: campaignId || null,
        published_by: req.caller?.id || null,
        publish_mode: "manual",
        publish_status: "logged",
      })
      .select()
      .single();
    if (error) return err(res, 400, translateDbError(error));

    await db
      .from("marketing_content_items")
      .update({ status: "published", published_url: publishedUrl || null })
      .eq("id", contentItemId);

    return ok(res, { publish: rowToCamel(data) });
  });

  app.get("/api/marketing/publish-log", requireAuth, async (req, res) => {
    const db = sb();
    if (!db) return err(res, 503, "Database not configured");
    const { data, error } = await db
      .from("social_post_publishes")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(50);
    if (error) return err(res, 500, translateDbError(error));
    return ok(res, { publishes: rowsToCamel(data || []) });
  });
}
