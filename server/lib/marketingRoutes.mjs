/**
 * marketingRoutes.mjs
 * Blue Leaf Building — Marketing Module API
 * Stage 1: content generation, campaigns, basic photo analysis
 * Stage 2: media assets, video pipeline, music library
 *
 * All routes require authentication. Blueprint routes are NOT touched here.
 */

import { createWriteStream } from "fs";
import { stat, rm, readFile } from "fs/promises";
import { join as pathJoin } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import { pipeline as streamPipeline } from "stream/promises";
import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import {
  runReviewChecks,
  parseMarketingResponse,
  MODE_PROMPTS,
  CONTENT_PILLARS,
  MODEL,
  PHOTO_ANALYSIS_SYSTEM_PROMPT,
} from "./marketingAgent.mjs";
import {
  BLUE_LEAF_IDENTITY,
  CONTENT_MODE_MODIFIERS,
  GENERATION_JSON_FORMAT,
  formatPhotoAnalysisForPrompt,
  enrichUserRequest,
} from "./marketingPrompts.mjs";
import Anthropic from "@anthropic-ai/sdk";
import { config as dotenvConfig } from "dotenv";
import {
  assertVisionMediaType,
  HEIC_UNSUPPORTED_MESSAGE,
  resolveVisionMediaType,
} from "./visionImage.mjs";

const execP = promisify(exec);

const { parsed: _env = {} } = dotenvConfig();
const _apiKey = process.env.ANTHROPIC_API_KEY?.trim() || _env.ANTHROPIC_API_KEY?.trim();
const VISION_MODEL =
  process.env.CLAUDE_MODEL?.trim() || _env.CLAUDE_MODEL?.trim() || "claude-sonnet-4-6";

function sbClient() {
  return getServiceSupabase();
}

const PHOTO_ANALYSE_USER_TEXT = `You are a construction analyst for Blue Leaf Building, a premium custom home builder in Adelaide.

Analyse this image and return ONLY what is directly visible. Do not invent materials, specifications, ratings, or construction details.

Return a JSON object with these exact fields:
{
  "visible_facts": [],
  "design_principles": [],
  "probable_assumptions": [],
  "unknowns": [],
  "build_stage": "",
  "content_opportunities": [],
  "summary": "",
  "suggested_caption_hook": "",
  "suggested_pillar": ""
}

CRITICAL RULE: Never state as fact what you cannot see. If you cannot confirm a material or specification, list it in unknowns.
Do not guess timber species, stone types, energy ratings, or construction specifications from visual cues alone.
Design principles and observable design intent ARE safe to describe. Specific products and specs are NOT.
build_stage must be one of: site_prep | slab | frame | lock_up | fixing | completion | landscaping | design_photo (or null).
suggested_pillar must be one of: the_work | how_we_build | what_to_expect | community_craft`;


function buildUserMessageText(mode, generationContext, enrichedRequest) {
  const modePrompt = MODE_PROMPTS[mode] || MODE_PROMPTS.social_instagram;
  const contextBlock = [
    generationContext.pillar && `Content pillar: ${CONTENT_PILLARS[generationContext.pillar]?.label || generationContext.pillar}`,
    generationContext.client_stage && `Client stage: ${generationContext.client_stage}`,
    generationContext.topic && `Topic: ${generationContext.topic}`,
    generationContext.project_context && `Project context: ${generationContext.project_context}`,
    formatPhotoAnalysisForPrompt(generationContext.photo_analysis),
  ].filter(Boolean).join("\n");
  return [modePrompt, "", contextBlock, "", `Request: ${enrichedRequest}`].join("\n");
}


async function buildGenerationMessages(sb, mode, generationContext, enrichedRequest, photo_asset_id, content_mode = "educational") {
  const systemPrompt = BLUE_LEAF_IDENTITY + (CONTENT_MODE_MODIFIERS[content_mode] || CONTENT_MODE_MODIFIERS.educational) + GENERATION_JSON_FORMAT;
  const userText = buildUserMessageText(mode, generationContext, enrichedRequest);
  const userContent = [];

  if (photo_asset_id && sb) {
    const { data: asset } = await sb
      .from("marketing_media_assets")
      .select("storage_path, storage_bucket, mime_type")
      .eq("id", photo_asset_id)
      .single();

    if (asset) {
      try {
        const { data: fileData, error: dlErr } = await sb.storage
          .from(asset.storage_bucket || "marketing-media")
          .download(asset.storage_path);
        if (!dlErr && fileData) {
          const arrayBuffer = await fileData.arrayBuffer();
          const buf = Buffer.from(arrayBuffer);
          const mediaType = resolveVisionMediaType(buf, asset.mime_type, asset.storage_path);
          if (mediaType) {
            userContent.push({
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: buf.toString("base64"),
              },
            });
          }
        }
      } catch {
        // Non-fatal — generate without image if download fails
      }
    }
  }

  userContent.push({ type: "text", text: userText });
  return {
    systemPrompt,
    messages: [{ role: "user", content: userContent }],
  };
}

function parseVisionAnalysisJson(raw) {
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Model returned non-JSON analysis");
    return JSON.parse(match[0]);
  }
}


function mediaPreviewStoragePath(asset) {
  return asset.thumbnail_path || asset.storage_path || null;
}

/** Signed URL for uploads; public URL for thumbnails/ folder (migration 047). */
async function attachMediaPreviewUrl(sb, asset) {
  const path = mediaPreviewStoragePath(asset);
  if (!path || !sb) return { ...asset, preview_url: null };
  const bucket = asset.storage_bucket || "marketing-media";
  if (path.startsWith("thumbnails/")) {
    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return { ...asset, preview_url: data?.publicUrl || null };
  }
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return { ...asset, preview_url: null };
  return { ...asset, preview_url: data.signedUrl };
}

async function attachMediaPreviewUrls(sb, assets) {
  return Promise.all(assets.map((a) => attachMediaPreviewUrl(sb, a)));
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
      photo_asset_id,
      content_mode = "educational",
    } = req.body;
    if (!mode)         return res.status(400).json({ ok: false, error: "mode required" });
    if (!topic)        return res.status(400).json({ ok: false, error: "topic required" });
    if (!user_request) return res.status(400).json({ ok: false, error: "user_request required" });

    const enrichedRequest = enrichUserRequest(
      photo_analysis || context.photo_analysis,
      user_request,
      topic,
    );

    try {
      const generationContext = {
        pillar,
        client_stage,
        topic,
        project_context: context.project_context || null,
        photo_analysis: photo_analysis || context.photo_analysis || null,
      };

      if (!_apiKey) return res.status(503).json({ ok: false, error: "AI not configured" });

      const sb = sbClient();
      const { systemPrompt, messages } = await buildGenerationMessages(
        sb, mode, generationContext, enrichedRequest, photo_asset_id || null, content_mode,
      );
      const client = new Anthropic({ apiKey: _apiKey, maxRetries: 1 });
      const response = await client.messages.create(
        {
          model: MODEL,
          max_tokens: 2048,
          temperature: 0.7,
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          messages,
        },
        { headers: { "anthropic-beta": "prompt-caching-2024-07-31" } },
      );
      const raw = response.content.find((b) => b.type === "text")?.text?.trim() || "";
      const content = parseMarketingResponse(raw);

      const review_scores = runReviewChecks(content, mode, generationContext.photo_analysis);

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
    const {
      mode, channel, pillar, client_stage, context = {}, topic, user_request,
      photo_analysis, photo_asset_id, content_mode = "educational",
    } = req.body;
    if (!mode) return res.status(400).json({ error: "mode required" });
    if (!_apiKey) return res.status(503).json({ error: "AI not configured" });

    const photoAnalysis = photo_analysis || context.photo_analysis || null;
    const enrichedRequest = enrichUserRequest(photoAnalysis, user_request, topic);

    const generationContext = {
      pillar,
      client_stage,
      topic,
      project_context: context.project_context || null,
      photo_analysis: photoAnalysis,
    };

    const sb = sbClient();
    const { systemPrompt, messages } = await buildGenerationMessages(
      sb, mode, generationContext, enrichedRequest, photo_asset_id || null, content_mode,
    );

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
          temperature: 0.7,
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          messages,
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
      const review_scores = runReviewChecks(content, channel || mode, photoAnalysis);
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

  /**
   * POST /api/marketing/generate/all-save
   * Bulk-save an array of generated results to marketing_content_items.
   */
  app.post("/api/marketing/generate/all-save", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ error: "DB not configured" });

    const { items = [] } = req.body;
    if (!items.length) return res.status(400).json({ error: "No items to save" });

    const rows = items.map((item) => {
      const c = item.content || {};
      return {
        channel:         item.channel,
        pillar:          item.pillar || "the_work",
        client_stage:    item.client_stage || null,
        topic:           item.topic || "",
        title:           c.title || null,
        body:            c.body || null,
        cta:             c.cta || null,
        hashtags:        c.hashtags || [],
        structured_body: {},
        status:          "draft",
        review_scores:   item.review_scores || {},
        media_source_id: item.media_source_id || null,
        campaign_id:     item.campaign_id     || null,
        tags:            [],
        created_by:      req.caller.id,
        updated_at:      new Date().toISOString(),
      };
    });

    const { data, error } = await sb.from("marketing_content_items").insert(rows).select("id, channel");
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, saved: data });
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
      .select("*, marketing_content_items(count)")
      .neq("status", "archived")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const campaigns = (data || []).map((c) => {
      const countRow = c.marketing_content_items;
      const content_count = Array.isArray(countRow) && countRow[0]?.count != null
        ? countRow[0].count
        : 0;
      const { marketing_content_items: _c, ...rest } = c;
      return { ...rest, content_count };
    });
    return res.json({ ok: true, campaigns });
  });

  app.get("/api/marketing/campaigns/:id", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { data, error } = await sb.from("marketing_campaigns")
      .select("*, marketing_content_items(count)")
      .eq("id", req.params.id)
      .single();
    if (error) return res.status(404).json({ ok: false, error: error.message });
    const content_count = data.marketing_content_items?.[0]?.count ?? 0;
    const { marketing_content_items: _c, ...campaign } = data;
    return res.json({ ok: true, campaign: { ...campaign, content_count } });
  });

  app.put("/api/marketing/campaigns/:id", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { id } = req.params;
    const {
      name, objective, channels, start_at, end_at, status,
      goal, audience, tone, posting_schedule, content_sources,
      platform_settings, content_mix, ai_rules, approval_mode,
    } = req.body;
    const { data, error } = await sb.from("marketing_campaigns")
      .update({
        ...(name !== undefined && { name }),
        ...(objective !== undefined && { objective }),
        ...(channels !== undefined && { channels }),
        ...(start_at !== undefined && { start_at: start_at || null }),
        ...(end_at !== undefined && { end_at: end_at || null }),
        ...(status !== undefined && { status }),
        ...(goal !== undefined && { goal }),
        ...(audience !== undefined && { audience }),
        ...(tone !== undefined && { tone }),
        ...(posting_schedule !== undefined && { posting_schedule }),
        ...(content_sources !== undefined && { content_sources }),
        ...(platform_settings !== undefined && { platform_settings }),
        ...(content_mix !== undefined && { content_mix }),
        ...(ai_rules !== undefined && { ai_rules }),
        ...(approval_mode !== undefined && { approval_mode }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, campaign: data });
  });

  app.get("/api/marketing/campaigns/:id/slots", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    let q = sb.from("campaign_schedule_slots")
      .select("*, marketing_content_items(id, channel, title, body, status, pillar, topic)")
      .eq("campaign_id", req.params.id)
      .order("slot_date");
    const { from, to } = req.query;
    if (from) q = q.gte("slot_date", from);
    if (to) q = q.lte("slot_date", to);
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, slots: data || [] });
  });

  app.post("/api/marketing/campaigns/:id/slots", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { id } = req.params;
    const { pattern } = req.body;
    const { data: campaign, error: campErr } = await sb.from("marketing_campaigns")
      .select("start_at, end_at")
      .eq("id", id)
      .single();
    if (campErr || !campaign) return res.status(404).json({ ok: false, error: "Campaign not found" });

    const start = new Date(`${(campaign.start_at || new Date().toISOString().slice(0, 10))}T12:00:00`);
    const endYmd = campaign.end_at || null;
    const end = endYmd
      ? new Date(`${endYmd}T12:00:00`)
      : new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const slots = [];
    const current = new Date(start);
    while (current <= end) {
      const dow = days[current.getDay()];
      const matching = (pattern || []).filter((p) => p.day === dow);
      const slotYmd = [
        current.getFullYear(),
        String(current.getMonth() + 1).padStart(2, "0"),
        String(current.getDate()).padStart(2, "0"),
      ].join("-");
      for (const m of matching) {
        slots.push({
          campaign_id: id,
          slot_date: slotYmd,
          day_of_week: dow,
          channel: m.channel || null,
          content_mode: m.content_mode || null,
          status: "empty",
        });
      }
      current.setDate(current.getDate() + 1);
    }
    if (!slots.length) return res.json({ ok: true, created: 0 });

    await sb.from("campaign_schedule_slots").delete().eq("campaign_id", id).eq("status", "empty");
    const { data, error } = await sb.from("campaign_schedule_slots").insert(slots).select("id");
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, created: data.length });
  });

  app.put("/api/marketing/campaigns/:id/slots/:slotId", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { content_item_id, status } = req.body;
    const { data, error } = await sb.from("campaign_schedule_slots")
      .update({
        ...(content_item_id !== undefined && { content_item_id: content_item_id || null }),
        ...(status !== undefined && { status }),
      })
      .eq("id", req.params.slotId)
      .eq("campaign_id", req.params.id)
      .select("*, marketing_content_items(id, channel, title, body, status, pillar, topic)")
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, slot: data });
  });

  app.get("/api/marketing/campaigns/:id/content", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { data, error } = await sb.from("marketing_content_items")
      .select("*")
      .eq("campaign_id", req.params.id)
      .neq("status", "archived")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, items: data || [] });
  });

  app.post("/api/marketing/campaigns/:id/content/:itemId", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { data, error } = await sb.from("marketing_content_items")
      .update({ campaign_id: req.params.id, updated_at: new Date().toISOString() })
      .eq("id", req.params.itemId)
      .select()
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, item: data });
  });

  // POST /api/marketing/campaigns/:id/slots/:slotId/publish
  app.post("/api/marketing/campaigns/:id/slots/:slotId/publish", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { metrics = {} } = req.body;
    const { data, error } = await sb.from("campaign_schedule_slots")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        published_by: req.caller.id,
        published_metrics: metrics,
      })
      .eq("id", req.params.slotId)
      .eq("campaign_id", req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, slot: data });
  });

  // POST /api/marketing/campaigns/:id/slots/auto-assign
  // Body: { content_item_ids: [uuid...] } — ordered, assigns to next empty slots in date order
  app.post("/api/marketing/campaigns/:id/slots/auto-assign", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { content_item_ids = [] } = req.body;
    if (!content_item_ids.length) return res.status(400).json({ ok: false, error: "No items to assign" });
    const { data: emptySlots } = await sb.from("campaign_schedule_slots")
      .select("id").eq("campaign_id", req.params.id).eq("status", "empty")
      .order("slot_date").limit(content_item_ids.length);
    if (!emptySlots?.length) return res.json({ ok: true, assigned: 0, message: "No empty slots available" });
    const updates = emptySlots.map((slot, i) => ({
      id: slot.id,
      content_item_id: content_item_ids[i],
      status: "assigned",
    }));
    await Promise.all(
      updates.map((u) =>
        sb.from("campaign_schedule_slots")
          .update({ content_item_id: u.content_item_id, status: "assigned" })
          .eq("id", u.id),
      ),
    );
    return res.json({ ok: true, assigned: updates.length });
  });

  // POST /api/marketing/campaigns/:id/preload
  // Body: { count: 8, content_modes: ['educational','story','behind_scenes','authority'] }
  // Returns generated items (not saved) for preview before user approves
  app.post("/api/marketing/campaigns/:id/preload", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    if (!_apiKey) return res.status(503).json({ ok: false, error: "AI not configured" });
    const { data: campaign } = await sb.from("marketing_campaigns")
      .select("*").eq("id", req.params.id).single();
    if (!campaign) return res.status(404).json({ ok: false, error: "Campaign not found" });
    const { count = 8, content_modes = ["educational", "story", "behind_scenes", "authority"] } = req.body;
    const { data: photos } = await sb.from("marketing_media_assets")
      .select("id, analysis, original_filename, thumbnail_path, storage_path, storage_bucket")
      .eq("media_type", "photo")
      .not("analysis", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!photos?.length) {
      return res.status(400).json({ ok: false, error: "No analysed photos found. Upload and analyse project photos first." });
    }
    const { data: slots } = await sb.from("campaign_schedule_slots")
      .select("id, slot_date, day_of_week, channel, content_mode")
      .eq("campaign_id", req.params.id)
      .eq("status", "empty")
      .order("slot_date")
      .limit(count);
    const targetSlots = slots?.length
      ? slots
      : Array.from({ length: count }, (_, i) => ({
          id: null, channel: i % 2 === 0 ? "instagram" : "facebook", content_mode: null,
        }));

    const { BLUE_LEAF_IDENTITY: BLI, CONTENT_MODE_MODIFIERS: CMM, formatPhotoAnalysisForPrompt: fpa } = await import("./marketingPrompts.mjs");
    const { MODE_PROMPTS, runReviewChecks, parseMarketingResponse } = await import("./marketingAgent.mjs");
    const { resolveVisionMediaType } = await import("./visionImage.mjs");
    const client = new Anthropic({ apiKey: _apiKey, maxRetries: 1 });

    const previews = [];
    for (let i = 0; i < Math.min(count, targetSlots.length); i++) {
      const slot = targetSlots[i];
      const photo = photos[i % photos.length];
      const mode = content_modes[i % content_modes.length];
      const channel = slot.channel || (i % 2 === 0 ? "instagram" : "facebook");
      const channelMode = channel === "instagram" ? "social_instagram" : "social_facebook";
      const systemPrompt = BLI + (CMM[mode] || CMM.educational);
      const analysis = photo.analysis || {};
      const analysisText = fpa(analysis);
      const topic = analysis.summary || analysis.suggested_caption_hook || "Project photo";
      const modeInstruction = MODE_PROMPTS[channelMode] || MODE_PROMPTS.social_instagram;
      const userText = [modeInstruction, "", analysisText, "", `Request: ${topic}`].join("\n");
      const userContent = [];
      try {
        const { data: fileData } = await sb.storage.from(photo.storage_bucket || "marketing-media").download(photo.storage_path);
        if (fileData) {
          const buf = Buffer.from(await fileData.arrayBuffer());
          const mediaType = resolveVisionMediaType(buf, null, photo.storage_path);
          if (mediaType) {
            userContent.push({ type: "image", source: { type: "base64", media_type: mediaType, data: buf.toString("base64") } });
          }
        }
      } catch { /* non-fatal */ }
      userContent.push({ type: "text", text: userText });
      try {
        const response = await client.messages.create(
          {
            model: "claude-sonnet-4-5",
            max_tokens: 1024,
            temperature: 0.7,
            system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
            messages: [{ role: "user", content: userContent }],
          },
          { headers: { "anthropic-beta": "prompt-caching-2024-07-31" } },
        );
        const raw = response.content.find((b) => b.type === "text")?.text?.trim() || "";
        const content = parseMarketingResponse(raw);
        const review_scores = runReviewChecks(content, channelMode);
        previews.push({
          slot_id: slot.id,
          slot_date: slot.slot_date,
          channel,
          content_mode: mode,
          photo_asset_id: photo.id,
          photo_thumbnail: photo.thumbnail_path || photo.storage_path,
          content,
          review_scores,
          topic,
        });
      } catch (e) {
        previews.push({ slot_id: slot.id, slot_date: slot.slot_date, channel, content_mode: mode, error: e.message });
      }
    }
    return res.json({ ok: true, previews });
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
    const assets = await attachMediaPreviewUrls(sb, (data || []).map((a) => {
      const exports = a.marketing_media_exports || [];
      const latest = exports.sort((x, y) => new Date(y.created_at) - new Date(x.created_at))[0];
      return { ...a, pipeline_status: latest?.status || (exports.length === 0 ? "none" : "unknown") };
    }));
    return res.json({ ok: true, assets, count: count || 0 });
  });

  /**
   * POST /api/marketing/media/upload-video
   * Stream large video files (drone footage etc.) directly to the server —
   * bypasses Supabase's 50 MB per-object storage limit.
   *
   * Browser sends:
   *   Content-Type: video/mp4 (or the actual MIME)
   *   X-Filename: <URI-encoded filename>
   *   X-Campaign-Objective: brand_awareness|educate|generate_enquiries (optional)
   *   Authorization: Bearer <token>
   *   body: raw binary stream
   *
   * Server:
   *   1. Pipes stream → temp file (no memory buffering)
   *   2. Extracts thumbnail with ffmpeg → uploads to Supabase thumbnails/
   *   3. Creates marketing_media_assets row (storage_path = null, raw video stays local)
   *   4. Runs video intelligence pipeline on the temp file in background
   *   5. Returns { ok: true, media_asset_id }
   */
  app.post("/api/marketing/media/upload-video", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    if (!_apiKey) return res.status(503).json({ ok: false, error: "AI not configured" });

    const originalFilename = decodeURIComponent(req.headers["x-filename"] || "video.mp4");
    const mimeType = (req.headers["content-type"] || "video/mp4").split(";")[0].trim();
    const campaignObjective = req.headers["x-campaign-objective"] || "brand_awareness";
    const isDrone = /dji/i.test(originalFilename) || /drone/i.test(originalFilename);
    const mediaType = isDrone ? "drone_video" : "video";
    const ext = originalFilename.split(".").pop()?.toLowerCase() || "mp4";
    const uid = randomUUID();
    const tmpPath = pathJoin(tmpdir(), `blvi-upload-${uid}.${ext}`);

    let assetId = null;
    try {
      // 1. Stream request body → temp file (no size cap, no memory buffering)
      const writeStream = createWriteStream(tmpPath);
      await streamPipeline(req, writeStream);

      const stats = await stat(tmpPath);
      const fileSizeBytes = stats.size;
      console.log(`[upload-video] received ${originalFilename} (${(fileSizeBytes / 1024 / 1024).toFixed(1)} MB) → ${tmpPath}`);

      // 2. Create DB record (no Supabase storage_path — raw video stays on server temp disk)
      const { data: asset, error: dbErr } = await sb
        .from("marketing_media_assets")
        .insert({
          media_type: mediaType,
          mime_type: mimeType,
          original_filename: originalFilename,
          file_size_bytes: fileSizeBytes,
          storage_path: null,
          storage_bucket: "marketing-media",
          analysis_status: "pending",
          created_by: req.caller.id,
        })
        .select("id")
        .single();
      if (dbErr) throw new Error(dbErr.message);
      assetId = asset.id;

      // 3. Extract thumbnail (first frame) → upload to Supabase for card preview
      try {
        const ffmpegBin = await (async () => {
          for (const bin of ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "ffmpeg"]) {
            try { await execP(`"${bin}" -version`); return bin; } catch { /* try next */ }
          }
          return "ffmpeg";
        })();
        const thumbPath = pathJoin(tmpdir(), `blvi-thumb-${uid}.jpg`);
        await execP(
          `"${ffmpegBin}" -i "${tmpPath}" -vf "select=eq(n\\,0),scale=640:-2" -frames:v 1 -q:v 3 "${thumbPath}" -y`,
          { maxBuffer: 5 * 1024 * 1024 }
        );
        const thumbBuf = await readFile(thumbPath);
        const thumbStoragePath = `thumbnails/${assetId}/thumb.jpg`;
        await sb.storage.from("marketing-media").upload(thumbStoragePath, thumbBuf, { contentType: "image/jpeg", upsert: true });
        await sb.from("marketing_media_assets").update({ thumbnail_path: thumbStoragePath }).eq("id", assetId);
        await rm(thumbPath, { force: true }).catch(() => {});
        console.log(`[upload-video] thumbnail uploaded for asset ${assetId}`);
      } catch (thumbErr) {
        console.warn("[upload-video] thumbnail extraction failed:", thumbErr.message);
      }

      // 4. Respond immediately — pipeline runs in background
      res.json({ ok: true, media_asset_id: assetId, status: "processing" });

      // 5. Video intelligence pipeline (cleans up tmpPath on completion)
      (async () => {
        try {
          const { runVideoIntelligencePipeline } = await import("./videoIntelligence.mjs");
          await runVideoIntelligencePipeline(assetId, null, sb, _apiKey, campaignObjective, {
            localVideoPath: tmpPath,
            cleanupLocalPath: true,
          });
          console.log(`[upload-video] pipeline complete for asset ${assetId}`);
        } catch (e) {
          console.error(`[upload-video] pipeline error for asset ${assetId}:`, e.message);
          await rm(tmpPath, { force: true }).catch(() => {});
        }
      })();

    } catch (err) {
      await rm(tmpPath, { force: true }).catch(() => {});
      console.error("[upload-video]", err);
      if (!res.headersSent) {
        return res.status(500).json({ ok: false, error: err.message || "Video upload failed" });
      }
    }
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

    const isVideo = ["video", "drone_video", "timelapse", "testimonial_video"].includes(media_type);

    const insertRow = {
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
    };
    if (isVideo) insertRow.analysis_status = "pending";

    const { data: asset, error } = await sb.from("marketing_media_assets").insert(insertRow).select().single();

    if (error) return res.status(400).json({ ok: false, error: error.message });

    if (isVideo) {
      try {
        const { runFullDronePipeline } = await import("./marketingMedia.mjs");
        runFullDronePipeline(asset.id, storage_path, { project_id, job_id }).catch((e) => {
          console.error("[marketing/pipeline] async error for asset", asset.id, e.message);
        });
      } catch (e) {
        console.warn("[marketing/pipeline] marketingMedia.mjs not available:", e.message);
      }

      (async () => {
        try {
          const {
            runVideoIntelligencePipeline,
          } = await import("./videoIntelligence.mjs");
          const campaignObjective = req.body.campaign_objective || "educate";
          await runVideoIntelligencePipeline(
            asset.id, storage_path, sb, _apiKey, campaignObjective,
          );
        } catch (e) {
          console.error("[videoIntelligence pipeline]", e.message);
          await sb.from("marketing_media_assets")
            .update({ analysis_status: "error" })
            .eq("id", asset.id);
        }
      })();

      return res.json({ ok: true, media_asset_id: asset.id, status: "processing" });
    }

    const withPreview = await attachMediaPreviewUrl(sb, asset);
    return res.json({ ok: true, media_asset_id: asset.id, status: "ready", asset: withPreview });
  });

  app.get("/api/marketing/media/:id", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { data, error } = await sb.from("marketing_media_assets").select("*, marketing_media_exports(*)").eq("id", req.params.id).single();
    if (error) return res.status(404).json({ ok: false, error: error.message });
    const asset = await attachMediaPreviewUrl(sb, data);
    return res.json({ ok: true, asset });
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

  app.post("/api/marketing/media/:id/analyse", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    if (!_apiKey) return res.status(503).json({ ok: false, error: "AI not configured" });

    const { data: asset, error: assetErr } = await sb
      .from("marketing_media_assets")
      .select("storage_path, storage_bucket, mime_type, media_type")
      .eq("id", req.params.id)
      .single();

    if (assetErr || !asset) return res.status(404).json({ ok: false, error: "Asset not found" });

    const isPhoto =
      asset.media_type === "photo" ||
      asset.mime_type?.startsWith("image/");
    if (!isPhoto) {
      return res.status(400).json({ ok: false, error: "Only photos can be analysed" });
    }

    try {
      let base64;
      let mediaType;

      const { image_base64, media_type: bodyMediaType } = req.body || {};
      if (image_base64) {
        base64 = String(image_base64).replace(/^data:image\/\w+;base64,/, "");
        mediaType = bodyMediaType || "image/jpeg";
        assertVisionMediaType(mediaType);
      } else {
        const { data: fileData, error: dlErr } = await sb.storage
          .from(asset.storage_bucket || "marketing-media")
          .download(asset.storage_path);
        if (dlErr) throw new Error(`Could not load image from storage: ${dlErr.message}`);

        const buf = Buffer.from(await fileData.arrayBuffer());
        mediaType = resolveVisionMediaType(buf, asset.mime_type, asset.storage_path);
        if (!mediaType) throw new Error(HEIC_UNSUPPORTED_MESSAGE);

        // Anthropic hard limit: 5 MB decoded. If the stored image is over 4.5 MB, ask
        // the client to resize it in the browser and re-send as image_base64.
        if (buf.length > 4_500_000) {
          return res.status(422).json({
            ok: false,
            tooLarge: true,
            error: `Image is ${(buf.length / 1_048_576).toFixed(1)} MB — too large for direct analysis (max 4.5 MB). It will be resized automatically.`,
          });
        }

        base64 = buf.toString("base64");
      }

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
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            { type: "text", text: `${PHOTO_ANALYSE_USER_TEXT}\n\nReturn ONLY valid JSON. No markdown fences or commentary.` },
          ],
        }],
      });

      const raw = response.content.find((b) => b.type === "text")?.text || "{}";
      const analysis = parseVisionAnalysisJson(raw);

      const stage =
        analysis.build_stage && analysis.build_stage !== "null"
          ? analysis.build_stage
          : analysis.stage || null;

      const { data: updated, error: updateErr } = await sb
        .from("marketing_media_assets")
        .update({
          analysis,
          stage_detected: stage,
        })
        .eq("id", req.params.id)
        .select()
        .single();

      if (updateErr) throw new Error(`Could not save analysis: ${updateErr.message}`);

      const withPreview = await attachMediaPreviewUrl(sb, updated);
      return res.json({ ok: true, analysis, asset: withPreview });
    } catch (err) {
      console.error("[media/analyse]", err);
      return res.status(500).json({ ok: false, error: err.message || "Analysis failed" });
    }
  });

  async function enrichStoryClips(sb, story) {
    if (!story?.clips?.length) return story;
    const clips = await Promise.all(story.clips.map(async (c) => {
      if (!c.storage_path) return c;
      const { data } = await sb.storage.from("marketing-media").createSignedUrl(c.storage_path, 3600);
      return { ...c, thumbnail_url: data?.signedUrl || null };
    }));
    return { ...story, clips };
  }

  app.get("/api/marketing/media/:id/story-sequence", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });

    const { data: asset, error: assetErr } = await sb
      .from("marketing_media_assets")
      .select("analysis_status")
      .eq("id", req.params.id)
      .single();

    if (assetErr || !asset) return res.status(404).json({ ok: false, error: "Asset not found" });

    if (asset.analysis_status !== "complete") {
      return res.json({
        ok: true,
        ready: false,
        status: asset.analysis_status || "processing",
      });
    }

    const { data: exportRec } = await sb
      .from("marketing_media_exports")
      .select("story_sequence")
      .eq("media_asset_id", req.params.id)
      .eq("export_format", "story_sequence")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const story = exportRec?.story_sequence
      ? await enrichStoryClips(sb, exportRec.story_sequence)
      : null;

    return res.json({ ok: true, ready: true, story_sequence: story });
  });

  app.get("/api/marketing/media/:id/clip-alternative", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });

    const { position } = req.query;
    if (!position) return res.status(400).json({ ok: false, error: "position query required" });

    const exclude = (req.query.exclude || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const { selectAlternativeClip } = await import("./videoIntelligence.mjs");
      const clip = await selectAlternativeClip(req.params.id, position, exclude, sb);
      if (!clip) return res.status(404).json({ ok: false, error: "No alternative clip found" });

      const { data: signed } = await sb.storage.from("marketing-media").createSignedUrl(clip.storage_path, 3600);
      return res.json({
        ok: true,
        clip: {
          frame_index: clip.frame_index,
          timestamp_secs: clip.timestamp_secs,
          storage_path: clip.storage_path,
          overall_score: clip.overall_score,
          primary_subject: clip.primary_subject,
          thumbnail_url: signed?.signedUrl || null,
        },
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
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

  /**
   * PATCH /api/marketing/media/:id/analysis
   * Save manually-corrected analysis fields without re-running the AI.
   * Body: { analysis: { summary?, visible_facts?, design_principles?,
   *                      suggested_caption_hook?, content_opportunities?,
   *                      build_stage?, ... } }
   */
  app.patch("/api/marketing/media/:id/analysis", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const analysis = req.body?.analysis;
    if (!analysis || typeof analysis !== "object") {
      return res.status(400).json({ ok: false, error: "analysis object required" });
    }
    // Merge with existing analysis so partial updates are safe
    const { data: existing, error: fetchErr } = await sb
      .from("marketing_media_assets")
      .select("analysis")
      .eq("id", req.params.id)
      .single();
    if (fetchErr) return res.status(404).json({ ok: false, error: fetchErr.message });
    const merged = { ...(existing?.analysis || {}), ...analysis };
    const stage = merged.build_stage && merged.build_stage !== "null" ? merged.build_stage : null;
    const { data, error } = await sb
      .from("marketing_media_assets")
      .update({ analysis: merged, stage_detected: stage, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const withPreview = await attachMediaPreviewUrl(sb, data);
    return res.json({ ok: true, asset: withPreview });
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
      media_asset_id, story_sequence,
    } = req.body;

    // Video review approval — persist reviewed story sequence (Final Assembly adds music later)
    if (media_asset_id && story_sequence && !export_id) {
      const { data, error } = await sb
        .from("marketing_media_exports")
        .upsert(
          {
            media_asset_id,
            export_format: "story_sequence",
            story_sequence,
            status: "ready",
          },
          { onConflict: "media_asset_id,export_format" },
        )
        .select("id")
        .single();

      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true, export_id: data.id, status: "ready" });
    }

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
