/**
 * marketingRoutes.mjs
 * Blue Leaf Building — Marketing Module API
 * Stage 1: content generation, campaigns, basic photo analysis
 * Stage 2: media assets, video pipeline, music library
 *
 * All routes require authentication. Blueprint routes are NOT touched here.
 */

import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import {
  generateContent,
  runReviewChecks,
  buildMarketingPrompt,
  parseMarketingResponse,
  MODEL,
  PHOTO_ANALYSIS_SYSTEM_PROMPT,
  PHOTO_ANALYSIS_USER_PROMPT,
} from "./marketingAgent.mjs";
import Anthropic from "@anthropic-ai/sdk";
import { config as dotenvConfig } from "dotenv";

const { parsed: _env = {} } = dotenvConfig();
const _apiKey = process.env.ANTHROPIC_API_KEY?.trim() || _env.ANTHROPIC_API_KEY?.trim();
const VISION_MODEL = "claude-sonnet-4-5";

function sbClient() {
  return getServiceSupabase();
}

export function registerMarketingRoutes(app) {

  // ── Stage 1: Content Generation ─────────────────────────────────────────────

  /**
   * POST /api/marketing/generate
   * Generate content via AI. Does NOT auto-save — user reviews first.
   */
  app.post("/api/marketing/generate", requireAuth, async (req, res) => {
    const {
      mode,
      pillar,
      client_stage,
      context = {},
      topic,
      user_request,
      photo_analysis,
    } = req.body;
    if (!mode)         return res.status(400).json({ ok: false, error: "mode required" });
    if (!topic)        return res.status(400).json({ ok: false, error: "topic required" });
    if (!user_request) return res.status(400).json({ ok: false, error: "user_request required" });

    const enrichedRequest = photo_analysis?.summary
      ? `[Photo: ${photo_analysis.summary}${photo_analysis.stage ? ` | Build stage: ${photo_analysis.stage}` : ""}]\n\n${user_request || topic}`
      : (user_request || topic);

    try {
      const generationContext = {
        pillar,
        client_stage,
        topic,
        project_context: context.project_context || null,
        photo_analysis: photo_analysis || context.photo_analysis || null,
      };

      const content = await generateContent(mode, generationContext, enrichedRequest);
      const review_scores = runReviewChecks(content, mode);

      return res.json({ ok: true, content, review_scores });
    } catch (e) {
      console.error("[marketing/generate]", e);
      return res.status(502).json({ ok: false, error: e.message });
    }
  });

  /**
   * POST /api/marketing/generate/stream
   * SSE streaming version of content generation. Falls through to non-streaming on error.
   */
  app.post("/api/marketing/generate/stream", requireAuth, async (req, res) => {
    const { mode, channel, pillar, client_stage, context = {}, topic, user_request } = req.body;
    if (!mode) return res.status(400).json({ error: "mode required" });
    if (!_apiKey) return res.status(503).json({ error: "AI not configured" });

    const generationContext = {
      pillar,
      client_stage,
      topic,
      project_context: context.project_context || null,
      photo_analysis:  context.photo_analysis  || null,
    };
    const { systemPrompt, userMessage } = buildMarketingPrompt(mode, generationContext, user_request || topic || "");

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    try {
      const client = new Anthropic({ apiKey: _apiKey, maxRetries: 1 });
      const stream = await client.messages.stream(
        {
          model: MODEL,
          max_tokens: 2048,
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: userMessage }],
        },
        { headers: { "anthropic-beta": "prompt-caching-2024-07-31" } },
      );

      let fullText = "";
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          fullText += event.delta.text;
          res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
        }
      }

      const content = parseMarketingResponse(fullText);
      const review_scores = runReviewChecks(content, channel || mode);
      res.write(`data: ${JSON.stringify({ done: true, content, review_scores })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err) {
      console.error("[marketing/generate/stream]", err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      } else {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    }
  });

  // ── Stage 1: Content Items CRUD ─────────────────────────────────────────────

  /**
   * POST /api/marketing/content
   * Save approved or draft content item.
   */
  app.post("/api/marketing/content", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });

    const {
      channel, pillar, client_stage, topic, title, body, cta,
      hashtags, structured_body, status, review_scores, publish_date,
      campaign_id, project_id, job_id, lead_id, media_source_id, tags,
    } = req.body;

    if (!channel) return res.status(400).json({ ok: false, error: "channel required" });
    if (!topic)   return res.status(400).json({ ok: false, error: "topic required" });

    const record = {
      channel, pillar, client_stage, topic,
      title: title || null,
      body:  body  || null,
      cta:   cta   || null,
      hashtags:       hashtags       || [],
      structured_body: structured_body || {},
      status:         status         || "draft",
      review_scores:  review_scores  || {},
      publish_date:   publish_date   || null,
      campaign_id:    campaign_id    || null,
      project_id:     project_id     || null,
      job_id:         job_id         || null,
      lead_id:        lead_id        || null,
      media_source_id: media_source_id || null,
      tags:           tags           || [],
      created_by:     req.caller.id,
      updated_at:     new Date().toISOString(),
    };

    // If approving, set approval metadata
    if (status === "approved") {
      // Block approval if APB reference detected
      if (review_scores?.apb_reference?.pass === false) {
        return res.status(400).json({ ok: false, error: "Cannot approve: APB reference detected. Remove all APB references before approving." });
      }
      record.approved_at  = new Date().toISOString();
      record.reviewed_by  = req.caller.id;
    }

    const { data, error } = await sb.from("marketing_content_items").insert(record).select().single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    return res.json({ ok: true, item: data });
  });

  /**
   * GET /api/marketing/content
   * Paginated list with filters.
   */
  app.get("/api/marketing/content", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });

    const { channel, status, campaign_id, project_id, tags, limit = 50, offset = 0 } = req.query;

    let q = sb.from("marketing_content_items")
      .select("*", { count: "exact" })
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (channel)     q = q.eq("channel", channel);
    if (status)      q = q.eq("status", status);
    if (campaign_id) q = q.eq("campaign_id", campaign_id);
    if (project_id)  q = q.eq("project_id", project_id);
    if (tags)        q = q.overlaps("tags", Array.isArray(tags) ? tags : [tags]);

    const { data, error, count } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, items: data || [], count: count || 0 });
  });

  /**
   * GET /api/marketing/content/:id
   */
  app.get("/api/marketing/content/:id", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { data, error } = await sb.from("marketing_content_items").select("*").eq("id", req.params.id).single();
    if (error) return res.status(404).json({ ok: false, error: error.message });
    return res.json({ ok: true, item: data });
  });

  /**
   * PUT /api/marketing/content/:id
   */
  app.put("/api/marketing/content/:id", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });

    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.created_at;
    delete updates.created_by;

    // Enforce APB hard-block on approval
    if (updates.status === "approved") {
      const review = updates.review_scores || {};
      if (review.apb_reference?.pass === false) {
        return res.status(400).json({ ok: false, error: "Cannot approve: APB reference detected. Remove all APB references before approving." });
      }
      updates.approved_at = new Date().toISOString();
      updates.reviewed_by = req.caller.id;
    }

    const { data, error } = await sb.from("marketing_content_items").update(updates).eq("id", req.params.id).select().single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    return res.json({ ok: true, item: data });
  });

  /**
   * DELETE /api/marketing/content/:id — soft delete (status → archived)
   */
  app.delete("/api/marketing/content/:id", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { error } = await sb.from("marketing_content_items")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", req.params.id);
    if (error) return res.status(400).json({ ok: false, error: error.message });
    return res.json({ ok: true });
  });

  // ── Stage 1: Campaigns ────────────────────────────────────────────────────

  app.post("/api/marketing/campaigns", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { name, objective, channels, start_at, end_at, status, tags } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "name required" });
    const { data, error } = await sb.from("marketing_campaigns").insert({
      name, objective: objective || null,
      channels: channels || [],
      start_at: start_at || null,
      end_at:   end_at   || null,
      status:   status   || "active",
      tags:     tags     || [],
      created_by: req.caller.id,
    }).select().single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    return res.json({ ok: true, campaign: data });
  });

  app.get("/api/marketing/campaigns", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { data, error } = await sb.from("marketing_campaigns")
      .select("*")
      .neq("status", "archived")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, campaigns: data || [] });
  });

  app.put("/api/marketing/campaigns/:id", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id; delete updates.created_by; delete updates.created_at;
    const { data, error } = await sb.from("marketing_campaigns").update(updates).eq("id", req.params.id).select().single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    return res.json({ ok: true, campaign: data });
  });

  // ── Stage 1: Photo Analysis ────────────────────────────────────────────────

  /**
   * POST /api/marketing/media/analyse-photo
   * Multipart image upload → Claude Vision analysis.
   * Does NOT save — user reviews first.
   */
  app.post("/api/marketing/media/analyse-photo", requireAuth, async (req, res) => {
    if (!_apiKey) return res.status(503).json({ ok: false, error: "AI not configured" });

    // Expect base64 image in body (client converts file to base64)
    const { image_base64, media_type = "image/jpeg" } = req.body;
    if (!image_base64) return res.status(400).json({ ok: false, error: "image_base64 required" });

    try {
      const client = new Anthropic({ apiKey: _apiKey, maxRetries: 1 });
      const response = await client.messages.create({
        model: VISION_MODEL,
        max_tokens: 2048,
        system: PHOTO_ANALYSIS_SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: media_type,
                data: image_base64,
              },
            },
            { type: "text", text: PHOTO_ANALYSIS_USER_PROMPT },
          ],
        }],
      });

      const raw = response.content.find(b => b.type === "text")?.text?.trim() || "";
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

      let analysis;
      try {
        analysis = JSON.parse(jsonStr);
      } catch {
        const match = jsonStr.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("Model returned non-JSON analysis");
        analysis = JSON.parse(match[0]);
      }

      return res.json({ ok: true, analysis });
    } catch (e) {
      console.error("[marketing/analyse-photo]", e);
      return res.status(502).json({ ok: false, error: e.message });
    }
  });

  // ── Stage 2: Media Assets ─────────────────────────────────────────────────

  /**
   * GET /api/marketing/media
   * List all media assets (newest first), with latest export status joined.
   */
  app.get("/api/marketing/media", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { project_id, media_type, limit = 50, offset = 0 } = req.query;
    let q = sb
      .from("marketing_media_assets")
      .select("*, marketing_media_exports(id, export_format, status, storage_path, created_at)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);
    if (project_id) q = q.eq("project_id", project_id);
    if (media_type)  q = q.eq("media_type", media_type);
    const { data, error, count } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    // Attach a top-level pipeline_status derived from the most recent export
    const assets = (data || []).map((a) => {
      const exports = a.marketing_media_exports || [];
      const latest = exports.sort((x, y) => new Date(y.created_at) - new Date(x.created_at))[0];
      return { ...a, pipeline_status: latest?.status || (exports.length === 0 ? "none" : "unknown") };
    });
    return res.json({ ok: true, assets, count: count || 0 });
  });

  /**
   * POST /api/marketing/media/upload
   * For photos: analyse immediately.
   * For videos: kick off async pipeline, return media_asset_id.
   */
  app.post("/api/marketing/media/upload", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });

    const {
      storage_path, storage_bucket = "marketing-media",
      mime_type, media_type, original_filename, file_size_bytes,
      project_id, job_id, capture_date,
    } = req.body;

    if (!storage_path) return res.status(400).json({ ok: false, error: "storage_path required" });
    if (!media_type)   return res.status(400).json({ ok: false, error: "media_type required" });
    if (!mime_type)    return res.status(400).json({ ok: false, error: "mime_type required" });

    const { data: asset, error } = await sb.from("marketing_media_assets").insert({
      storage_path,
      storage_bucket,
      mime_type,
      media_type,
      original_filename: original_filename || null,
      file_size_bytes:   file_size_bytes   || null,
      project_id:        project_id        || null,
      job_id:            job_id            || null,
      capture_date:      capture_date      || null,
      created_by:        req.caller.id,
    }).select().single();

    if (error) return res.status(400).json({ ok: false, error: error.message });

    // For video types, kick off pipeline asynchronously
    const isVideo = ["video","drone_video","timelapse","testimonial_video"].includes(media_type);
    if (isVideo) {
      // Import pipeline lazily to avoid startup cost when video isn't used
      try {
        const { runFullDronePipeline } = await import("./marketingMedia.mjs");
        // Fire and forget — status is tracked via marketing_media_exports
        runFullDronePipeline(asset.id, storage_path, { project_id, job_id }).catch(e => {
          console.error("[marketing/pipeline] async error for asset", asset.id, e.message);
        });
      } catch (e) {
        console.warn("[marketing/pipeline] marketingMedia.mjs not available:", e.message);
      }
      return res.json({ ok: true, media_asset_id: asset.id, status: "processing" });
    }

    return res.json({ ok: true, media_asset_id: asset.id, status: "ready", asset });
  });

  app.get("/api/marketing/media/:id", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { data, error } = await sb.from("marketing_media_assets").select("*, marketing_media_exports(*)").eq("id", req.params.id).single();
    if (error) return res.status(404).json({ ok: false, error: error.message });
    return res.json({ ok: true, asset: data });
  });

  app.get("/api/marketing/media/:id/status", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { data, error } = await sb
      .from("marketing_media_exports")
      .select("id, export_format, status, pipeline_log, storage_path, created_at")
      .eq("media_asset_id", req.params.id)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const allReady = data?.length > 0 && data.every(e => e.status === "ready");
    return res.json({ ok: true, exports: data || [], pipeline_complete: allReady });
  });

  app.post("/api/marketing/media/:id/export", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { export_format, colour_preset = "brand" } = req.body;
    if (!export_format) return res.status(400).json({ ok: false, error: "export_format required" });

    const { data: asset, error: assetErr } = await sb.from("marketing_media_assets").select("storage_path,media_type").eq("id", req.params.id).single();
    if (assetErr) return res.status(404).json({ ok: false, error: "Asset not found" });

    const { data: exportRecord, error } = await sb.from("marketing_media_exports").insert({
      media_asset_id: req.params.id,
      export_format,
      colour_preset,
      status: "processing",
    }).select().single();
    if (error) return res.status(400).json({ ok: false, error: error.message });

    // Trigger async additional export
    try {
      const { reexportAsset } = await import("./marketingMedia.mjs");
      reexportAsset(exportRecord.id, asset.storage_path, export_format, colour_preset, asset.media_type).catch(e => {
        console.error("[marketing/reexport]", e.message);
      });
    } catch (e) {
      console.warn("[marketing/reexport] marketingMedia.mjs not available:", e.message);
    }

    return res.json({ ok: true, export_id: exportRecord.id, status: "processing" });
  });

  app.post("/api/marketing/media/:id/consent", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { consent } = req.body;
    if (typeof consent !== "boolean") return res.status(400).json({ ok: false, error: "consent (boolean) required" });
    const { data, error } = await sb.from("marketing_media_assets")
      .update({ consent_for_marketing: consent })
      .eq("id", req.params.id)
      .select("id, consent_for_marketing")
      .single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    return res.json({ ok: true, asset: data });
  });

  // ── Stage 2: Music Library ─────────────────────────────────────────────────

  app.get("/api/marketing/music", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    let q = sb.from("marketing_music_library").select("*").eq("is_active", true).order("mood").order("title");
    if (req.query.mood) q = q.eq("mood", req.query.mood);
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, tracks: data || [] });
  });

  app.post("/api/marketing/music", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { title, artist, source, storage_path, duration_seconds, mood, bpm } = req.body;
    if (!title)        return res.status(400).json({ ok: false, error: "title required" });
    if (!storage_path) return res.status(400).json({ ok: false, error: "storage_path required" });
    if (!mood)         return res.status(400).json({ ok: false, error: "mood required" });
    const { data, error } = await sb.from("marketing_music_library").insert({
      title, artist: artist || null, source: source || "youtube_audio_library",
      storage_path, duration_seconds: duration_seconds || null,
      mood, bpm: bpm || null, added_by: req.caller.id,
    }).select().single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    return res.json({ ok: true, track: data });
  });

  // ── Stage 2: Final Assembly ────────────────────────────────────────────────

  /**
   * POST /api/marketing/assemble
   * Apply music + colour grade + export to final formats.
   */
  app.post("/api/marketing/assemble", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });

    const {
      export_id, music_track_id, music_volume = 0.6,
      colour_preset = "brand", export_formats = ["9x16"],
    } = req.body;

    if (!export_id)      return res.status(400).json({ ok: false, error: "export_id required" });
    if (!music_track_id) return res.status(400).json({ ok: false, error: "music_track_id required — select a music track before exporting" });

    // Verify consent before allowing export
    const { data: exportRec, error: expErr } = await sb
      .from("marketing_media_exports")
      .select("*, marketing_media_assets(storage_path, consent_for_marketing, is_dji_dlog_m, media_type)")
      .eq("id", export_id).single();
    if (expErr) return res.status(404).json({ ok: false, error: "Export not found" });
    if (!exportRec.marketing_media_assets?.consent_for_marketing) {
      return res.status(403).json({ ok: false, error: "consent_for_marketing is required before final export. Set consent on the media asset first." });
    }

    const { data: track, error: trackErr } = await sb.from("marketing_music_library").select("storage_path").eq("id", music_track_id).single();
    if (trackErr) return res.status(404).json({ ok: false, error: "Music track not found" });

    // Update export record with assembly settings
    await sb.from("marketing_media_exports").update({
      music_track_id,
      music_volume,
      colour_preset,
      status: "processing",
    }).eq("id", export_id);

    // Trigger async assembly
    try {
      const { assembleExport } = await import("./marketingMedia.mjs");
      assembleExport(
        export_id,
        exportRec.marketing_media_assets.storage_path,
        track.storage_path,
        { music_volume, colour_preset, export_formats, isDLogM: exportRec.marketing_media_assets.is_dji_dlog_m }
      ).catch(e => console.error("[marketing/assemble]", e.message));
    } catch (e) {
      console.warn("[marketing/assemble] marketingMedia.mjs not available:", e.message);
    }

    return res.json({ ok: true, export_id, status: "processing" });
  });
}
