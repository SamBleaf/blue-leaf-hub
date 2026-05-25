/**
 * videoIntelligence.mjs
 * Blue Leaf Building — Video Intelligence Layer
 *
 * V1: Scene-change frame extraction + Supabase storage upload
 * V2: Claude Haiku clip scoring (scoreVideoClips) — 5-dimension scoring + narrative position
 * V3: Narrative template engine (generateStorySequence) — composite selection + Sonnet captions
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
import { BLUE_LEAF_IDENTITY, CONTENT_MODE_MODIFIERS } from "./marketingPrompts.mjs";

const { parsed: _env = {} } = dotenvConfig();
const _apiKey = process.env.ANTHROPIC_API_KEY?.trim() || _env.ANTHROPIC_API_KEY?.trim();

const HAIKU_MODEL  = "claude-haiku-4-5";
const SONNET_MODEL = "claude-sonnet-4-6";

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

// ── V1: Scene-Change Frame Extraction ────────────────────────────────────────

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
      const timestamps = [];
      const tsRe = /pts_time:(\d+\.?\d*)/g;
      let m;
      while ((m = tsRe.exec(sceneStderr)) !== null) {
        timestamps.push(parseFloat(m[1]));
      }
      return await _uploadFrames(sceneFiles, tmpDir, assetId, sb, timestamps);
    }

    // --- Fallback: fixed-interval fps=1/20 ---
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

/** @private */
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
 * Sequential download — concurrent reads fail for online-only (Smart Sync) files.
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

const CLIP_SCORE_PROMPT = `You are a construction video analyst for Blue Leaf Building, a premium custom home builder.
Score this frame from a construction site video.
Return ONLY valid JSON:
{
  "construction_stage": "site_prep|slab|frame|lock_up|fitout|completion|landscaping|null",
  "activity_description": "1 sentence describing what is happening",
  "composition_score": 1-10,
  "motion_score": 1-10,
  "narrative_value": 1-10,
  "construction_importance": 1-10,
  "visual_preference_score": 1-10,
  "narrative_position": "establishing|progress|detail|activity|reveal|avoid|none",
  "confidence_pct": 0-100
}
VISUAL PREFERENCES — score higher for:
✓ Symmetry and geometric lines in the frame
✓ Shadow lines and material texture contrast
✓ Craftsmanship closeups showing trade skill
✓ Reveal shots (partial to full view of a space or element)
✓ Site-to-landscape relationship
✓ Team members actively working (not posing)
✓ Material transitions and junctions
Score lower for (narrative_position = "avoid"):
✗ Empty static shots with no activity or feature
✗ Repeated wide shots from the same angle as a previous frame
✗ Overexposed or significantly blurred frames
✗ Random machinery with no construction context
✗ Messy or incomplete work areas with no narrative purpose
narrative_position meanings:
  establishing: wide shot showing site/building in context
  progress: work underway at this build stage
  detail: closeup of specific material, joint, or craft element
  activity: trade team actively working
  reveal: partial-to-full view that creates visual interest
  avoid: low quality, repetitive, or off-brand`;

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

  const client = new Anthropic({ apiKey: key, maxRetries: 1 });
  const scored = [];

  for (const fr of frameRecords) {
    // Download frame buffer from storage for Vision
    let imageData;
    try {
      const { data, error } = await sb.storage.from("marketing-media").download(fr.storage_path);
      if (error || !data) {
        console.warn(`[videoIntelligence/score] Download failed for ${fr.storage_path}: ${error?.message}`);
        continue;
      }
      imageData = Buffer.from(await data.arrayBuffer()).toString("base64");
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

    const row = {
      media_asset_id:          assetId,
      frame_index:             fr.frame_index,
      timestamp_secs:          fr.timestamp_secs ?? null,
      frame_storage_path:      fr.storage_path,
      construction_stage:      scoreData.construction_stage  || null,
      activity_description:    scoreData.activity_description || null,
      composition_score:       scoreData.composition_score       ?? null,
      motion_score:            scoreData.motion_score            ?? null,
      narrative_value:         scoreData.narrative_value         ?? null,
      construction_importance: scoreData.construction_importance ?? null,
      visual_preference_score: scoreData.visual_preference_score ?? null,
      narrative_position:      scoreData.narrative_position      || "none",
      confidence_pct:          scoreData.confidence_pct          ?? null,
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

// ── V3: Narrative Template Engine ─────────────────────────────────────────────

/**
 * Narrative templates per campaign objective.
 * Each template is an ordered array of narrative_position values (matching DB enum).
 * Clip selection picks the best-scoring clip whose tagged position matches each slot.
 */
const NARRATIVE_TEMPLATES = {
  educational:  ["establishing", "detail",   "activity", "detail",   "reveal"],
  story:        ["establishing", "progress", "activity", "detail",   "reveal"],
  authority:    ["detail",       "activity", "detail",   "progress", "reveal"],
  recruitment:  ["activity",     "establishing", "activity", "detail", "reveal"],
  architect:    ["establishing", "detail",   "detail",   "activity", "reveal"],
  progress:     ["establishing", "progress", "activity", "progress", "reveal"],
};

/**
 * Composite clip quality score — used for ranking within a position group.
 * @param {object} clip - video_clip_scores row
 * @returns {number}
 */
function _compositeScore(clip) {
  return (clip.narrative_value         || 0) * 0.4
       + (clip.construction_importance || 0) * 0.3
       + (clip.visual_preference_score || 0) * 0.2
       + (clip.composition_score       || 0) * 0.1;
}

/**
 * Select the best clip for a given narrative position slot.
 * Prefers clips whose tagged narrative_position matches the slot; falls back to any non-avoid clip.
 *
 * @param {string} position - desired narrative position
 * @param {Array}  clips    - all scored rows for this asset (already filtered, avoid removed)
 * @param {Set}    usedIds  - set of `id` values already assigned
 * @returns {object|null}
 */
function _selectClipForPosition(position, clips, usedIds) {
  const available = clips.filter(c => !usedIds.has(c.id) && c.narrative_position !== "avoid");

  // Prefer exact position match
  const preferred = available.filter(c => c.narrative_position === position);
  const pool      = preferred.length ? preferred : available;

  if (!pool.length) return null;

  return pool.sort((a, b) => _compositeScore(b) - _compositeScore(a))[0];
}

/**
 * Generate a single caption + per-clip overlay texts for the whole sequence using Claude Sonnet.
 * One call covers all clips — more contextually coherent than per-clip generation.
 *
 * @param {Array}  orderedClips    - selected clip rows in template order
 * @param {string} objective       - campaign objective
 * @param {object} projectContext  - { project_type, suburb, build_stage, voiceNote? }
 * @param {Anthropic} client
 * @returns {Promise<{caption: string, clip_overlays: string[], confidence_pct: number}>}
 */
async function _generateSequenceCaption(orderedClips, objective, projectContext, client) {
  const ctx = projectContext || {};

  const clipDescriptions = orderedClips
    .map((c, i) =>
      `${i + 1}. [${c.narrative_position}] ${c.activity_description || "construction footage"}` +
      (c.construction_stage ? ` (stage: ${c.construction_stage})` : "")
    )
    .join("\n");

  const contextBlock = [
    ctx.project_type && `Project type: ${ctx.project_type}`,
    ctx.suburb        && `Location: ${ctx.suburb}`,
    ctx.build_stage   && `Build stage: ${ctx.build_stage}`,
    ctx.voiceNote     && `Voice note transcript:\n${ctx.voiceNote}`,
  ].filter(Boolean).join("\n");

  const modeModifier = CONTENT_MODE_MODIFIERS[objective] || CONTENT_MODE_MODIFIERS.educational;
  const systemPrompt = `${BLUE_LEAF_IDENTITY}\n\n${modeModifier}`;

  const userMessage = `Generate a caption and clip overlay texts for this ${objective} video sequence.\n\nClip sequence:\n${clipDescriptions}\n${contextBlock ? `\nContext:\n${contextBlock}` : ""}\n\nReturn ONLY valid JSON:\n{\n  "caption": "<Instagram caption, 2–4 sentences, no hashtags, follows Blue Leaf voice>",\n  "clip_overlays": ["<3–5 word overlay for clip 1>", "<overlay for clip 2>"],\n  "confidence_pct": 0-100\n}\nclip_overlays must have exactly ${orderedClips.length} entries, one per clip, in order.`;

  try {
    const resp = await client.messages.create({
      model:      SONNET_MODEL,
      max_tokens: 600,
      system:     systemPrompt,
      messages:   [{ role: "user", content: userMessage }],
    });

    const raw     = resp.content.find(b => b.type === "text")?.text?.trim() || "";
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed  = JSON.parse(jsonStr);

    return {
      caption:       parsed.caption        || "",
      clip_overlays: Array.isArray(parsed.clip_overlays) ? parsed.clip_overlays : [],
      confidence_pct: typeof parsed.confidence_pct === "number" ? parsed.confidence_pct : 70,
    };
  } catch (e) {
    console.warn(`[videoIntelligence/story] Caption generation failed: ${e.message}`);
    return { caption: "", clip_overlays: [], confidence_pct: 50 };
  }
}

/**
 * Generate a narrative clip sequence for a media asset using scored frames.
 * Selects clips per template position, generates a single caption + per-clip overlays
 * with Claude Sonnet, and writes the result to marketing_media_exports.story_sequence.
 *
 * @param {string} assetId            - marketing_media_assets UUID
 * @param {string} campaignObjective  - educational|story|authority|recruitment|architect|progress
 * @param {object} projectContext     - { project_type?, suburb?, build_stage?, voiceNote? }
 * @param {object} sb                 - Supabase service client
 * @param {string} [apiKey]           - optional ANTHROPIC_API_KEY override
 * @returns {Promise<object>}         - story_sequence payload
 */
export async function generateStorySequence(assetId, campaignObjective, projectContext, sb, apiKey) {
  const key = apiKey || _apiKey;
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured");

  const client = new Anthropic({ apiKey: key, maxRetries: 1 });

  // 1. Load all scored clips for this asset
  const { data: clips, error: clipErr } = await sb
    .from("video_clip_scores")
    .select("*")
    .eq("media_asset_id", assetId);

  if (clipErr) throw new Error(`Failed to load clip scores: ${clipErr.message}`);
  if (!clips?.length) throw new Error(`No scored clips found for asset ${assetId}`);

  const template = NARRATIVE_TEMPLATES[campaignObjective] || NARRATIVE_TEMPLATES.educational;

  // 2. Select clips — one per template position
  const usedIds = new Set();
  const selectedClips = [];

  for (const position of template) {
    const clip = _selectClipForPosition(position, clips, usedIds);
    if (clip) {
      usedIds.add(clip.id);
      selectedClips.push({ position, clip });
    }
  }

  // Guarantee minimums: must have at least 1 establishing + 1 progress/detail + 1 activity/reveal
  const hasEstablishing = selectedClips.some(s => s.position === "establishing");
  const hasContent      = selectedClips.some(s => ["progress", "detail"].includes(s.position));
  const hasHuman        = selectedClips.some(s => ["activity", "reveal"].includes(s.position));

  if (!hasEstablishing || !hasContent || !hasHuman) {
    console.warn(`[videoIntelligence/story] Sequence for ${assetId} may be incomplete — insufficient scored clip variety`);
  }

  // Cap at 6 clips
  const cappedClips = selectedClips.slice(0, 6);
  const orderedClipRows = cappedClips.map(s => s.clip);

  // 3. Generate caption + overlays (single Sonnet call)
  const { caption, clip_overlays, confidence_pct } = await _generateSequenceCaption(
    orderedClipRows,
    campaignObjective,
    projectContext || {},
    client
  );

  const assumptionsDetected = confidence_pct < 70;

  // 4. Build story_sequence payload
  const storySequence = {
    template:             campaignObjective,
    clips:                cappedClips.map((s, i) => ({
      clip_score_id: s.clip.id,
      position:      s.position,
      overlay:       clip_overlays[i] || "",
    })),
    caption,
    overall_confidence:   confidence_pct,
    assumptions_detected: assumptionsDetected,
  };

  // 5. Write to marketing_media_exports (upsert on asset + format)
  const { error: upsertErr } = await sb
    .from("marketing_media_exports")
    .upsert(
      {
        media_asset_id: assetId,
        export_format:  "story_sequence",
        story_sequence: storySequence,
        status:         "ready",
      },
      { onConflict: "media_asset_id,export_format" }
    );

  if (upsertErr) {
    console.warn(`[videoIntelligence/story] Export upsert failed: ${upsertErr.message}`);
  }

  return storySequence;
}

/**
 * Return the next-best clip for a narrative position, excluding already-used frame indices.
 * Normalises return fields for backward-compat with marketingRoutes.mjs callers
 * (storage_path, overall_score).
 *
 * @param {string}   assetId              - marketing_media_assets UUID
 * @param {string}   position             - narrative position
 * @param {string[]} excludeFrameIndices  - frame_index values to exclude
 * @param {object}   sb                   - Supabase service client
 * @returns {Promise<object|null>}
 */
export async function selectAlternativeClip(assetId, position, excludeFrameIndices, sb) {
  const { data: clips, error } = await sb
    .from("video_clip_scores")
    .select("*")
    .eq("media_asset_id", assetId);

  if (error || !clips?.length) return null;

  const usedIds = new Set(
    clips
      .filter(c => (excludeFrameIndices || []).map(Number).includes(c.frame_index))
      .map(c => c.id)
  );

  const clip = _selectClipForPosition(position, clips, usedIds);
  if (!clip) return null;

  // Normalise for backward-compat: callers expect storage_path and overall_score
  return {
    ...clip,
    storage_path: clip.frame_storage_path,
    overall_score: Math.round(_compositeScore(clip)),
  };
}

// ── Full pipeline: V1 → V2 → V3 ──────────────────────────────────────────────

/**
 * Full V1–V3 pipeline: extract frames → score → generate story sequence.
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
  campaignObjective = "educational",
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
    // Download from Supabase storage.
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
