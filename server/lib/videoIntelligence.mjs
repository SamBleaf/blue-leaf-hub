/**
 * videoIntelligence.mjs
 * Blue Leaf Building — Video Intelligence Layer
 *
 * V1: Scene-change frame extraction + Supabase storage upload
 * V2: Claude Haiku clip scoring (scoreVideoClips)
 * V3: Narrative template engine (generateStorySequence)
 */

import { exec } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, writeFile, rm } from "fs/promises";
import { randomUUID } from "crypto";
import { readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import Anthropic from "@anthropic-ai/sdk";
import { config as dotenvConfig } from "dotenv";

const { parsed: _env = {} } = dotenvConfig();
const _apiKey = process.env.ANTHROPIC_API_KEY?.trim() || _env.ANTHROPIC_API_KEY?.trim();

const HAIKU_MODEL = "claude-haiku-4-5";

const execP = promisify(exec);

// ── FFmpeg path resolution ────────────────────────────────────────────────────

async function getFfmpegPath() {
  for (const bin of ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "ffmpeg"]) {
    try { await execP(`"${bin}" -version`); return bin; } catch { /* try next */ }
  }
  try {
    const { path } = await import("@ffmpeg-installer/ffmpeg");
    return path;
  } catch {
    throw new Error("ffmpeg not found — add ffmpeg to nixpacks.toml or install locally");
  }
}

// ── Scene-Change Frame Extraction ─────────────────────────────────────────────

/**
 * Extract meaningful frames from a local video using ffmpeg scene-change detection.
 * Falls back to fps=1/20 fixed-interval extraction if < 8 scene-change frames detected.
 *
 * @param {string} localVideoPath - absolute local path to the video file
 * @param {string} assetId        - marketing_media_assets UUID (used for storage path naming)
 * @param {object} sb             - Supabase service client
 * @returns {Promise<Array<{frame_index: number, timestamp_secs: number, storage_path: string}>>}
 */
export async function extractMeaningfulFrames(localVideoPath, assetId, sb) {
  const ffmpeg  = await getFfmpegPath();
  const tmpDir  = await mkdtemp(join(tmpdir(), `blvi-${assetId.slice(0, 8)}-`));
  const pattern = join(tmpDir, "frame%04d.jpg");

  try {
    // --- Scene-change pass ---
    // select filter picks frames where scene score > 0.35 (significant visual change).
    // showinfo writes pts_time for every selected frame to stderr.
    // -vsync vfr avoids duplicate frames. -frames:v 30 caps output.
    let sceneStderr = "";
    try {
      const res = await execP(
        `"${ffmpeg}" -i "${localVideoPath}" -vf "select='gt(scene,0.35)',showinfo,scale=1280:-2" -vsync vfr -frames:v 30 -q:v 3 "${pattern}" -y`,
        { maxBuffer: 20 * 1024 * 1024 }
      );
      sceneStderr = res.stderr || "";
    } catch (e) {
      // ffmpeg sometimes exits non-zero on filter warnings — check if frames produced anyway
      sceneStderr = e.stderr || "";
    }

    const sceneFiles = readdirSync(tmpDir).filter(f => f.endsWith(".jpg")).sort();

    if (sceneFiles.length >= 8) {
      // Parse pts_time values from showinfo stderr output
      // Each selected frame line contains "pts_time:<value>"
      const timestamps = [];
      const tsRe = /pts_time:(\d+\.?\d*)/g;
      let m;
      while ((m = tsRe.exec(sceneStderr)) !== null) {
        timestamps.push(parseFloat(m[1]));
      }
      return await _uploadFrames(sceneFiles, tmpDir, assetId, sb, timestamps);
    }

    // --- Fallback: fixed-interval fps=1/20 ---
    // Remove any partial scene-change frames first
    for (const f of sceneFiles) {
      await rm(join(tmpDir, f), { force: true }).catch(() => {});
    }

    await execP(
      `"${ffmpeg}" -i "${localVideoPath}" -vf "fps=1/20,scale=1280:-2" -q:v 3 "${pattern}" -y`,
      { maxBuffer: 20 * 1024 * 1024 }
    );

    const fbFiles = readdirSync(tmpDir).filter(f => f.endsWith(".jpg")).sort();
    const fbTimestamps = fbFiles.map((_, i) => i * 20);
    return await _uploadFrames(fbFiles, tmpDir, assetId, sb, fbTimestamps);

  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Upload a list of local frame files to Supabase Storage and return frame records.
 * @private
 */
async function _uploadFrames(frameFiles, dir, assetId, sb, timestamps) {
  const records = [];
  for (let i = 0; i < frameFiles.length; i++) {
    const localPath   = join(dir, frameFiles[i]);
    const storagePath = `frames/${assetId}/frame_${String(i).padStart(4, "0")}.jpg`;
    const buf = await readFile(localPath);
    const { error } = await sb.storage
      .from("marketing-media")
      .upload(storagePath, buf, { upsert: true, contentType: "image/jpeg" });
    if (error) {
      console.warn(`[videoIntelligence] Frame ${i} upload failed: ${error.message}`);
      continue;
    }
    records.push({
      frame_index:    i,
      timestamp_secs: timestamps[i] ?? i * 5,
      storage_path:   storagePath,
    });
  }
  return records;
}

/**
 * Download frame records from Supabase Storage to a local directory for Claude Vision analysis.
 * Frames are downloaded sequentially (Supabase Smart Sync / concurrent read limitation).
 *
 * @param {Array<{storage_path: string}>} frameRecords
 * @param {object} sb      - Supabase service client
 * @param {string} destDir - local directory to write files into
 * @returns {Promise<string[]>} absolute local paths (in same order as frameRecords)
 */
export async function downloadFramesForAnalysis(frameRecords, sb, destDir) {
  const localPaths = [];
  for (let i = 0; i < frameRecords.length; i++) {
    const fr = frameRecords[i];
    const localPath = join(destDir, `analysis_frame_${String(i).padStart(4, "0")}.jpg`);
    try {
      const { data, error } = await sb.storage.from("marketing-media").download(fr.storage_path);
      if (error || !data) {
        console.warn(`[videoIntelligence] Frame download failed: ${fr.storage_path} — ${error?.message}`);
        continue;
      }
      await writeFile(localPath, Buffer.from(await data.arrayBuffer()));
      localPaths.push(localPath);
    } catch (e) {
      console.warn(`[videoIntelligence] Frame download error: ${e.message}`);
    }
  }
  return localPaths;
}

// ── V2: Claude Haiku Clip Scoring ─────────────────────────────────────────────

const CLIP_SCORE_PROMPT = `You are scoring a video frame for Blue Leaf Building (Adelaide custom home builder).
Score each dimension honestly — these scores drive which clips get used in marketing content.

Return ONLY valid JSON with exactly these fields:
{
  "visual_quality":         <1-10>,  // sharpness, exposure, composition — 10 = publication ready
  "motion_blur":            <1-10>,  // 10 = crisp/sharp, 1 = heavily blurred
  "construction_relevance": <1-10>,  // how clearly it shows construction craft or progress
  "brand_alignment":        <1-10>,  // fits premium custom builder aesthetic
  "educational_value":      <1-10>,  // potential to explain a building technique or decision
  "human_interest":         <1-10>,  // human story, scale, lifestyle connection
  "technical_detail":       <1-10>,  // shows quality of materials or workmanship
  "overall_score":          <1-10>,  // single holistic rating
  "primary_subject":        "<one sentence — what is shown in this frame>",
  "content_opportunities":  ["<content idea>", "<content idea>"],
  "publish_ready":          <true|false>,
  "reject_reason":          "<null or reason why this frame should not be published>"
}`;

/**
 * Score a set of video frame records using Claude Haiku Vision.
 * Processes frames sequentially to respect Vision rate limits.
 * Inserts results into video_clip_scores table.
 *
 * @param {string} assetId       - marketing_media_assets UUID
 * @param {Array<{frame_index, timestamp_secs, storage_path}>} frameRecords
 * @param {object} sb            - Supabase service client
 * @param {string} [apiKey]      - optional override for ANTHROPIC_API_KEY
 * @returns {Promise<Array>}     - scored records inserted to DB
 */
export async function scoreVideoClips(assetId, frameRecords, sb, apiKey) {
  const key = apiKey || _apiKey;
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured");

  const client  = new Anthropic({ apiKey: key, maxRetries: 1 });
  const scored  = [];

  for (const fr of frameRecords) {
    // Download frame from storage for Vision analysis
    let imageData;
    try {
      const { data, error } = await sb.storage.from("marketing-media").download(fr.storage_path);
      if (error || !data) {
        console.warn(`[videoIntelligence/score] Download failed for ${fr.storage_path}: ${error?.message}`);
        continue;
      }
      const buf = Buffer.from(await data.arrayBuffer());
      imageData = buf.toString("base64");
    } catch (e) {
      console.warn(`[videoIntelligence/score] Frame ${fr.frame_index} download error: ${e.message}`);
      continue;
    }

    // Score with Claude Haiku
    let scoreData;
    try {
      const resp = await client.messages.create({
        model: HAIKU_MODEL,
        max_tokens: 512,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageData } },
            { type: "text",  text: CLIP_SCORE_PROMPT },
          ],
        }],
      });

      const raw     = resp.content.find(b => b.type === "text")?.text?.trim() || "";
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      scoreData = JSON.parse(jsonStr);
    } catch (e) {
      console.warn(`[videoIntelligence/score] Haiku scoring failed for frame ${fr.frame_index}: ${e.message}`);
      continue;
    }

    // Upsert to video_clip_scores
    const row = {
      media_asset_id:         assetId,
      frame_index:            fr.frame_index,
      storage_path:           fr.storage_path,
      timestamp_secs:         fr.timestamp_secs ?? null,
      visual_quality:         scoreData.visual_quality         ?? null,
      motion_blur:            scoreData.motion_blur            ?? null,
      construction_relevance: scoreData.construction_relevance ?? null,
      brand_alignment:        scoreData.brand_alignment        ?? null,
      educational_value:      scoreData.educational_value      ?? null,
      human_interest:         scoreData.human_interest         ?? null,
      technical_detail:       scoreData.technical_detail       ?? null,
      overall_score:          scoreData.overall_score          ?? null,
      primary_subject:        scoreData.primary_subject        ?? null,
      content_opportunities:  Array.isArray(scoreData.content_opportunities) ? scoreData.content_opportunities : [],
      publish_ready:          scoreData.publish_ready === true,
      reject_reason:          scoreData.reject_reason || null,
      model_used:             HAIKU_MODEL,
    };

    const { error: upsertErr } = await sb
      .from("video_clip_scores")
      .upsert(row, { onConflict: "media_asset_id,frame_index" });

    if (upsertErr) {
      console.warn(`[videoIntelligence/score] DB upsert failed for frame ${fr.frame_index}: ${upsertErr.message}`);
    } else {
      scored.push(row);
    }
  }

  return scored;
}

// ── V3: Narrative Template Engine ────────────────────────────────────────────

import { BLUE_LEAF_IDENTITY } from "./marketingPrompts.mjs";

const SONNET_MODEL = "claude-sonnet-4-6";

/**
 * Narrative position roles — each clip fills a structural position in the story.
 * Templates define which positions are required and how to select clips for each.
 */
const NARRATIVE_POSITIONS = {
  hook:    { duration_secs: 3,  description: "Attention-grabbing opening — highest visual_quality or human_interest" },
  build:   { duration_secs: 8,  description: "Main content — highest construction_relevance or technical_detail" },
  proof:   { duration_secs: 6,  description: "Evidence of quality — highest overall_score among remaining clips" },
  context: { duration_secs: 5,  description: "Site or scale context — construction_relevance" },
  cta:     { duration_secs: 4,  description: "Closing moment — brand_alignment, publish_ready" },
};

/**
 * Narrative templates per campaign objective.
 * Each template defines the clip sequence as an array of position keys.
 */
const NARRATIVE_TEMPLATES = {
  brand_awareness: {
    name:      "Brand Story",
    positions: ["hook", "build", "proof", "cta"],
    caption_intent: "Show the quality of thinking behind this build — performance, not aesthetics",
  },
  generate_enquiries: {
    name:      "Lead Generation",
    positions: ["hook", "proof", "build", "cta"],
    caption_intent: "Show what a Blue Leaf build looks like in practice and invite conversation",
  },
  educate: {
    name:      "Educational Sequence",
    positions: ["hook", "context", "build", "proof", "cta"],
    caption_intent: "Explain one construction decision or detail and why it matters for performance",
  },
  build_authority: {
    name:      "Authority Demonstration",
    positions: ["hook", "build", "proof", "context", "cta"],
    caption_intent: "Demonstrate craft knowledge — specific techniques, consequences, long-term outcomes",
  },
  seo: {
    name:      "Discovery Content",
    positions: ["hook", "context", "build", "cta"],
    caption_intent: "Clear, searchable content that answers homeowner questions about building",
  },
};

/**
 * Select the best clip for a given narrative position from scored frames.
 * Uses position-specific scoring heuristics. Clips already used are excluded.
 * @param {string}   position  - narrative position key
 * @param {Array}    clips     - all scored clip rows (from video_clip_scores)
 * @param {Set}      usedIdx   - frame_index values already assigned
 * @returns {object|null}
 */
function _selectClipForPosition(position, clips, usedIdx) {
  const candidates = clips.filter(c => !usedIdx.has(c.frame_index) && c.publish_ready !== false);

  if (!candidates.length) {
    // Relax publish_ready if no candidates
    const fallback = clips.filter(c => !usedIdx.has(c.frame_index));
    if (!fallback.length) return null;
    candidates.push(...fallback);
  }

  const score = (c) => {
    switch (position) {
      case "hook":
        return (c.visual_quality || 0) * 0.4 + (c.human_interest || 0) * 0.4 + (c.brand_alignment || 0) * 0.2;
      case "build":
        return (c.construction_relevance || 0) * 0.5 + (c.technical_detail || 0) * 0.3 + (c.educational_value || 0) * 0.2;
      case "proof":
        return (c.overall_score || 0) * 0.5 + (c.visual_quality || 0) * 0.3 + (c.brand_alignment || 0) * 0.2;
      case "context":
        return (c.construction_relevance || 0) * 0.6 + (c.human_interest || 0) * 0.2 + (c.visual_quality || 0) * 0.2;
      case "cta":
        return (c.brand_alignment || 0) * 0.5 + (c.visual_quality || 0) * 0.3 + (c.overall_score || 0) * 0.2;
      default:
        return c.overall_score || 0;
    }
  };

  return candidates.sort((a, b) => score(b) - score(a))[0];
}

/**
 * Generate a branded caption for a clip using Claude Sonnet.
 * @param {object} clip          - selected clip (from video_clip_scores)
 * @param {string} position      - narrative position
 * @param {string} captionIntent - from template
 * @param {object} projectCtx    - project context
 * @param {Anthropic} client
 * @returns {Promise<{caption: string, overlay_text: string}>}
 */
async function _generateCaption(clip, position, captionIntent, projectCtx, client) {
  const contextLines = [
    projectCtx.project_type && `Project type: ${projectCtx.project_type}`,
    projectCtx.suburb        && `Location: ${projectCtx.suburb}`,
    projectCtx.build_stage   && `Build stage: ${projectCtx.build_stage}`,
  ].filter(Boolean).join("\n");

  const userMessage = `Generate a caption for the following video clip.

Clip subject: ${clip.primary_subject || "construction footage"}
Narrative position: ${position} (${NARRATIVE_POSITIONS[position]?.description || position})
Content intent: ${captionIntent}
${contextLines ? `Project context:\n${contextLines}` : ""}
Clip strengths: construction_relevance=${clip.construction_relevance}, technical_detail=${clip.technical_detail}, educational_value=${clip.educational_value}
${clip.content_opportunities?.length ? `Content opportunities: ${clip.content_opportunities.join(", ")}` : ""}

Return ONLY valid JSON:
{
  "caption": "<Instagram caption, 2–4 sentences, no hashtags, follows Blue Leaf voice>",
  "overlay_text": "<3–5 word screen overlay, direct statement, no punctuation>"
}`;

  const resp = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 400,
    system: BLUE_LEAF_IDENTITY,
    messages: [{ role: "user", content: userMessage }],
  });

  const raw     = resp.content.find(b => b.type === "text")?.text?.trim() || "";
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    return { caption: raw.slice(0, 300), overlay_text: "" };
  }
}

/**
 * Generate a narrative clip sequence for a media asset using scored frames.
 * Selects clips for each template position, generates captions with Claude Sonnet,
 * and writes the result to marketing_media_exports.story_sequence.
 *
 * @param {string} assetId           - marketing_media_assets UUID
 * @param {string} campaignObjective - brand_awareness|generate_enquiries|educate|build_authority|seo
 * @param {object} projectContext    - { project_type, suburb, build_stage }
 * @param {object} sb                - Supabase service client
 * @param {string} [apiKey]          - optional ANTHROPIC_API_KEY override
 * @returns {Promise<object>}        - story_sequence payload
 */
export async function generateStorySequence(assetId, campaignObjective, projectContext, sb, apiKey) {
  const key = apiKey || _apiKey;
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured");

  const client = new Anthropic({ apiKey: key, maxRetries: 1 });

  // 1. Load scored clips for this asset
  const { data: clips, error: clipErr } = await sb
    .from("video_clip_scores")
    .select("*")
    .eq("media_asset_id", assetId)
    .order("overall_score", { ascending: false });

  if (clipErr) throw new Error(`Failed to load clip scores: ${clipErr.message}`);
  if (!clips?.length) throw new Error(`No scored clips found for asset ${assetId}`);

  const template = NARRATIVE_TEMPLATES[campaignObjective] || NARRATIVE_TEMPLATES.brand_awareness;

  // 2. Select clips for each position
  const usedIdx = new Set();
  const selectedClips = [];

  for (const position of template.positions) {
    const clip = _selectClipForPosition(position, clips, usedIdx);
    if (clip) {
      usedIdx.add(clip.frame_index);
      selectedClips.push({ position, clip });
    }
  }

  // 3. Compute confidence — ratio of publish_ready clips, penalise low overall_score
  const totalScore   = selectedClips.reduce((s, { clip }) => s + (clip.overall_score || 5), 0);
  const avgScore     = selectedClips.length ? totalScore / selectedClips.length : 5;
  const readyRatio   = selectedClips.filter(({ clip }) => clip.publish_ready).length / (selectedClips.length || 1);
  const confidence   = Math.round((avgScore / 10) * 60 + readyRatio * 40);
  const assumptionsDetected = confidence < 70;

  // 4. Generate captions sequentially
  const sequenceClips = [];
  for (const { position, clip } of selectedClips) {
    let captionData = { caption: "", overlay_text: "" };
    try {
      captionData = await _generateCaption(clip, position, template.caption_intent, projectContext || {}, client);
    } catch (e) {
      console.warn(`[videoIntelligence/story] Caption failed for position ${position}: ${e.message}`);
    }

    sequenceClips.push({
      position,
      frame_index:    clip.frame_index,
      timestamp_secs: clip.timestamp_secs,
      storage_path:   clip.storage_path,
      overall_score:  clip.overall_score,
      caption:        captionData.caption,
      overlay_text:   captionData.overlay_text,
      duration_secs:  NARRATIVE_POSITIONS[position]?.duration_secs ?? 5,
    });
  }

  // 5. Build story_sequence payload
  const storySequence = {
    objective:             campaignObjective,
    template_used:         template.name,
    clips:                 sequenceClips,
    assumptions_detected:  assumptionsDetected,
    confidence,
    generated_at:          new Date().toISOString(),
  };

  // 6. Write to marketing_media_exports (upsert on asset + format)
  const { error: upsertErr } = await sb
    .from("marketing_media_exports")
    .upsert(
      { media_asset_id: assetId, export_format: "story_sequence", story_sequence: storySequence, status: "ready" },
      { onConflict: "media_asset_id,export_format" }
    );

  if (upsertErr) {
    console.warn(`[videoIntelligence/story] Export upsert failed: ${upsertErr.message}`);
  }

  return storySequence;
}

/**
 * Return the next-best clip for a narrative position, excluding already-used frame indices.
 */
export async function selectAlternativeClip(assetId, position, excludeFrameIndices, sb) {
  const { data: clips, error } = await sb
    .from("video_clip_scores")
    .select("*")
    .eq("media_asset_id", assetId)
    .order("overall_score", { ascending: false });

  if (error || !clips?.length) return null;
  const usedIdx = new Set((excludeFrameIndices || []).map((n) => Number(n)));
  return _selectClipForPosition(position, clips, usedIdx);
}

/**
 * Full V1-V3 pipeline: extract frames -> score -> generate story sequence.
 *
 * @param {string}      assetId
 * @param {string|null} storagePath        Supabase storage path. Pass null when localVideoPath is used.
 * @param {object}      sb
 * @param {string}      apiKey
 * @param {string}      [campaignObjective]
 * @param {object}      [opts]
 * @param {string}      [opts.localVideoPath]   If set, skip Supabase download and use this local path.
 * @param {boolean}     [opts.cleanupLocalPath] Delete localVideoPath on completion.
 */
export async function runVideoIntelligencePipeline(
  assetId,
  storagePath,
  sb,
  apiKey,
  campaignObjective = "educate",
  { localVideoPath = null, cleanupLocalPath = false } = {}
) {
  const key = apiKey || _apiKey;
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured");

  let tmpPath;
  let ownsTmp;

  if (localVideoPath) {
    // Video already on local disk — provided by the streaming upload endpoint.
    tmpPath = localVideoPath;
    ownsTmp = cleanupLocalPath;
  } else {
    // Download from Supabase storage (original flow for small browser-uploaded videos).
    const { data: fileData, error: dlErr } = await sb.storage
      .from("marketing-media")
      .download(storagePath);
    if (dlErr) throw new Error(`Video download failed: ${dlErr.message}`);
    tmpPath = join(tmpdir(), `blvi-src-${assetId.slice(0, 8)}-${randomUUID()}.mp4`);
    await writeFile(tmpPath, Buffer.from(await fileData.arrayBuffer()));
    ownsTmp = true;
  }

  try {
    await sb.from("marketing_media_assets").update({ analysis_status: "processing" }).eq("id", assetId);

    const frames = await extractMeaningfulFrames(tmpPath, assetId, sb);
    await scoreVideoClips(assetId, frames, sb, key);
    const story = await generateStorySequence(assetId, campaignObjective, {}, sb, key);

    await sb.from("marketing_media_assets").update({ analysis_status: "complete" }).eq("id", assetId);
    return story;
  } catch (e) {
    await sb.from("marketing_media_assets").update({ analysis_status: "error" }).eq("id", assetId);
    throw e;
  } finally {
    if (ownsTmp && tmpPath) {
      await rm(tmpPath, { force: true }).catch(() => {});
    }
  }
}
