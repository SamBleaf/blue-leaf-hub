/**
 * marketingMedia.mjs
 * Blue Leaf Building — Video Pipeline (Stage 2)
 *
 * Requires: fluent-ffmpeg, @ffmpeg-installer/ffmpeg, sharp, openai
 * LUT files: server/luts/dji_dlog_m_to_rec709.cube, server/luts/bluelaf_brand.cube
 * Optional: @remotion/renderer for overlay rendering
 */

import { exec } from "child_process";
import { promisify } from "util";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { getServiceSupabase } from "./supabaseService.mjs";
import { extractMeaningfulFrames, downloadFramesForAnalysis } from "./videoIntelligence.mjs";
import Anthropic from "@anthropic-ai/sdk";
import { config as dotenvConfig } from "dotenv";

const { parsed: _env = {} } = dotenvConfig();
const _apiKey        = process.env.ANTHROPIC_API_KEY?.trim() || _env.ANTHROPIC_API_KEY?.trim();
const _openaiKey     = process.env.OPENAI_API_KEY?.trim()    || _env.OPENAI_API_KEY?.trim();
const VISION_MODEL   = "claude-sonnet-4-5";

const execP       = promisify(exec);
const __dirname   = dirname(fileURLToPath(import.meta.url));
const LUTS_DIR    = join(__dirname, "../luts");
const LUT_DLOG_M  = join(LUTS_DIR, "dji_dlog_m_to_rec709.cube");
const LUT_BRAND   = join(LUTS_DIR, "bluelaf_brand.cube");
const LUT_WARM    = join(LUTS_DIR, "bluelaf_warm.cube");
const LUT_NATURAL = join(LUTS_DIR, "bluelaf_natural.cube");

// ── FFmpeg path resolution ────────────────────────────────────────────────────

async function getFfmpegPath() {
  // Try system ffmpeg first
  for (const bin of ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "ffmpeg"]) {
    try { await execP(`"${bin}" -version`); return bin; } catch { /* try next */ }
  }
  // Fallback: @ffmpeg-installer/ffmpeg
  try {
    const { path } = await import("@ffmpeg-installer/ffmpeg");
    return path;
  } catch {
    throw new Error("ffmpeg not found. Install with: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)");
  }
}

async function getFfprobePath() {
  for (const bin of ["/usr/bin/ffprobe", "/usr/local/bin/ffprobe", "ffprobe"]) {
    try { await execP(`"${bin}" -version`); return bin; } catch { /* try next */ }
  }
  return "ffprobe";
}

// ── D-Log M Detection ─────────────────────────────────────────────────────────

/**
 * Detect whether a video file was shot in DJI D-Log M.
 * DJI writes color_space=bt2020 + color_transfer=arib-std-b67 (HLG) or
 * specific transfer_characteristics for D-Log M in the video stream.
 */
export async function detectDLogM(filePath) {
  const ffprobe = await getFfprobePath();
  try {
    const { stdout } = await execP(
      `"${ffprobe}" -v quiet -print_format json -show_streams "${filePath}"`
    );
    const info = JSON.parse(stdout);
    const videoStream = info.streams?.find(s => s.codec_type === "video") || {};
    const tags = JSON.stringify(videoStream.tags || {}).toLowerCase();
    // DJI D-Log M indicators
    const isDLogM =
      (videoStream.color_transfer === "arib-std-b67") ||
      (videoStream.color_space === "bt2020nc") ||
      tags.includes("dlog") ||
      tags.includes("d-log");
    return isDLogM;
  } catch {
    return false;
  }
}

// ── Frame Extraction ──────────────────────────────────────────────────────────

/**
 * Extract frames at regular intervals from a video.
 * @param {string} filePath - input video path
 * @param {number} intervalSeconds - extract a frame every N seconds
 * @returns {string[]} array of temp JPEG paths
 */
export async function extractFrames(filePath, intervalSeconds = 5) {
  const ffmpeg = await getFfmpegPath();
  const dir    = await mkdtemp(join(tmpdir(), "blb-frames-"));
  const pattern = join(dir, "frame%04d.jpg");

  await execP(
    `"${ffmpeg}" -i "${filePath}" -vf "fps=1/${intervalSeconds},scale=1280:-2" -q:v 3 "${pattern}" -y`
  );

  const { readdirSync } = await import("fs");
  const frames = readdirSync(dir)
    .filter(f => f.endsWith(".jpg"))
    .sort()
    .map(f => join(dir, f));

  return frames;
}

// ── Claude Vision Analysis ────────────────────────────────────────────────────

/**
 * Analyse extracted frames using Claude Vision.
 * Samples up to 8 frames to stay within token limits.
 */
export async function analyseFramesWithClaude(framePaths, projectContext = {}) {
  if (!_apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const client = new Anthropic({ apiKey: _apiKey, maxRetries: 1 });
  // Sample frames evenly — max 8
  const maxFrames = 8;
  const step   = Math.max(1, Math.floor(framePaths.length / maxFrames));
  const sample = framePaths.filter((_, i) => i % step === 0).slice(0, maxFrames);

  const imageContent = await Promise.all(
    sample.map(async (p) => {
      const buf = await readFile(p);
      return {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: buf.toString("base64") },
      };
    })
  );

  const contextText = [
    projectContext.project_type && `Project type: ${projectContext.project_type}`,
    projectContext.suburb        && `Location: ${projectContext.suburb}`,
    projectContext.build_stage   && `Build stage: ${projectContext.build_stage}`,
  ].filter(Boolean).join("\n");

  const response = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: [
        ...imageContent,
        {
          type: "text",
          text: `You are analysing ${sample.length} frames from a drone video for Blue Leaf Building (Adelaide custom builder).${contextText ? "\n" + contextText : ""}

Analyse the construction progress and identify content opportunities. Return ONLY valid JSON:
{
  "project_stage": "site_prep|slab|frame|lock_up|fit_out|completion|unknown",
  "construction_progress_summary": "2-3 sentences describing what is visible",
  "workmanship_observations": ["specific details"],
  "best_visual_moments": [
    { "frame_index": 0, "reason": "why this frame stands out", "score": 8 }
  ],
  "educational_angles": ["content opportunities from this footage"],
  "recommended_segments": [
    { "description": "what to cut", "purpose": "why include this", "priority": "high|medium|low" }
  ],
  "caption_suggestions": ["1-2 Instagram caption ideas"],
  "do_not_publish_frames": [],
  "overall_brand_fit": "strong|moderate|weak"
}`,
        },
      ],
    }],
  });

  const raw = response.content.find(b => b.type === "text")?.text?.trim() || "";
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Frame analysis returned non-JSON");
    return JSON.parse(match[0]);
  }
}

// ── Best Segment Identification ───────────────────────────────────────────────

/**
 * Identify best video segments based on Claude analysis.
 * Returns simple time-based estimates.
 */
export function identifyBestSegments(analysis, targetDurationSecs = 30) {
  const segments = analysis.recommended_segments || [];
  if (!segments.length) {
    // Default: take the whole clip up to target duration
    return [{ startSec: 0, endSec: targetDurationSecs, reason: "Full clip" }];
  }
  // Distribute time evenly across high-priority segments
  const high    = segments.filter(s => s.priority === "high");
  const use     = high.length ? high : segments.slice(0, 3);
  const segDur  = Math.floor(targetDurationSecs / use.length);
  return use.map((s, i) => ({
    startSec: i * segDur * 2,          // approximate spacing through clip
    endSec:   i * segDur * 2 + segDur,
    reason:   s.description,
  }));
}

// ── FFmpeg Segment Cutting ────────────────────────────────────────────────────

/**
 * Cut and concatenate segments from a video.
 */
export async function cutSegments(inputPath, segments, outputPath) {
  const ffmpeg = await getFfmpegPath();
  const dir    = await mkdtemp(join(tmpdir(), "blb-segs-"));

  // Cut each segment
  const segPaths = await Promise.all(
    segments.map(async (seg, i) => {
      const p = join(dir, `seg${i}.mp4`);
      const dur = seg.endSec - seg.startSec;
      await execP(
        `"${ffmpeg}" -ss ${seg.startSec} -t ${dur} -i "${inputPath}" -c:v libx264 -c:a aac -avoid_negative_ts make_zero "${p}" -y`
      );
      return p;
    })
  );

  if (segPaths.length === 1) {
    // Just copy the single segment
    await execP(`cp "${segPaths[0]}" "${outputPath}"`);
  } else {
    // Concatenate using concat demuxer
    const listFile = join(dir, "concat.txt");
    await writeFile(listFile, segPaths.map(p => `file '${p}'`).join("\n"));
    await execP(
      `"${ffmpeg}" -f concat -safe 0 -i "${listFile}" -c copy "${outputPath}" -y`
    );
  }

  // Clean up temp segments
  await rm(dir, { recursive: true, force: true });
  return outputPath;
}

// ── LUT Application ───────────────────────────────────────────────────────────

const COLOUR_LUTS = {
  brand:   LUT_BRAND,
  warm:    LUT_WARM,
  natural: LUT_NATURAL,
};

/**
 * Apply LUT colour grading. If D-Log M detected, applies conversion LUT first.
 */
export async function applyLUTs(inputPath, isDLogM, colourPreset, outputPath) {
  const ffmpeg  = await getFfmpegPath();
  const presetLut = COLOUR_LUTS[colourPreset] || LUT_BRAND;

  const filterParts = [];

  if (isDLogM && existsSync(LUT_DLOG_M)) {
    filterParts.push(`lut3d='${LUT_DLOG_M}'`);
  }
  if (existsSync(presetLut)) {
    filterParts.push(`lut3d='${presetLut}'`);
  }

  const vf = filterParts.length > 0 ? filterParts.join(",") : "null";
  await execP(
    `"${ffmpeg}" -i "${inputPath}" -vf "${vf}" -c:v libx264 -crf 18 -c:a copy "${outputPath}" -y`
  );
  return outputPath;
}

// ── Smart Reframe ─────────────────────────────────────────────────────────────

const ASPECT_RATIOS = {
  "9x16": "9:16",
  "1x1":  "1:1",
  "16x9": "16:9",
  "4x5":  "4:5",
};

const CROP_FILTERS = {
  "9x16": "crop=iw*9/16:ih:iw/2-iw*9/32:0",
  "1x1":  "crop=ih:ih:(iw-ih)/2:0",
  "16x9": "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080",
  "4x5":  "crop=iw*4/5:ih:iw/2-iw*2/5:0",
};

/**
 * Reframe video to target aspect ratio using centre crop.
 */
export async function smartReframe(inputPath, targetAspect, outputPath) {
  const ffmpeg = await getFfmpegPath();
  const cropFilter = CROP_FILTERS[targetAspect] || CROP_FILTERS["16x9"];
  await execP(
    `"${ffmpeg}" -i "${inputPath}" -vf "${cropFilter}" -c:v libx264 -crf 18 -c:a copy "${outputPath}" -y`
  );
  return outputPath;
}

// ── Remotion Overlay Rendering ────────────────────────────────────────────────

/**
 * Render Remotion text overlays and composite onto video.
 * Falls back gracefully if Remotion is not installed.
 */
export async function renderRemotionOverlays(inputPath, outputPath, overlayOptions = {}) {
  const {
    suburb, build_stage, week_number, show_outro = true,
  } = overlayOptions;

  // Try Remotion renderer — skip gracefully if not installed
  try {
    const { renderMedia, selectComposition } = await import("@remotion/renderer");
    // Remotion composition rendering logic would go here
    // For now, pass through without overlay (template setup required first)
    console.info("[marketing/remotion] Remotion available but template render not yet configured");
  } catch {
    console.info("[marketing/remotion] Remotion not installed — skipping overlays");
  }

  // Simple FFmpeg text overlay fallback
  const ffmpeg = await getFfmpegPath();
  const textFilters = [];

  if (suburb || build_stage) {
    const label = [suburb, build_stage].filter(Boolean).join(" — ");
    // Escaped for FFmpeg drawtext
    const safeLabel = label.replace(/'/g, "\\'").replace(/:/g, "\\:");
    textFilters.push(
      `drawtext=text='${safeLabel}':fontsize=32:fontcolor=white:shadowx=2:shadowy=2:x=(w-tw)/2:y=h*0.85:enable='between(t,0,3)'`
    );
  }

  if (textFilters.length === 0) {
    // No overlays — just copy through
    await execP(`cp "${inputPath}" "${outputPath}"`);
    return outputPath;
  }

  await execP(
    `"${ffmpeg}" -i "${inputPath}" -vf "${textFilters.join(",")}" -c:v libx264 -crf 18 -c:a copy "${outputPath}" -y`
  );
  return outputPath;
}

// ── Audio Transcription ───────────────────────────────────────────────────────

/**
 * Transcribe audio using OpenAI Whisper.
 * Returns SRT format string, or null if no speech detected or API not configured.
 */
export async function transcribeAudio(filePath) {
  if (!_openaiKey) {
    console.info("[marketing/whisper] OPENAI_API_KEY not set — skipping transcription");
    return null;
  }

  try {
    // Dynamic import to avoid requiring openai at startup
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: _openaiKey });

    const { createReadStream } = await import("fs");
    const stream = createReadStream(filePath);

    const response = await openai.audio.transcriptions.create({
      file: stream,
      model: "whisper-1",
      response_format: "srt",
    });

    return response || null;
  } catch (e) {
    console.warn("[marketing/whisper] Transcription failed:", e.message);
    return null;
  }
}

// ── Caption Burning ───────────────────────────────────────────────────────────

/**
 * Burn SRT captions into video using FFmpeg.
 * Style: Lato (fallback Arial), white text, dark shadow, bottom centre.
 */
export async function burnCaptions(inputPath, srtContent, outputPath) {
  const ffmpeg = await getFfmpegPath();
  const dir    = await mkdtemp(join(tmpdir(), "blb-srt-"));
  const srtPath = join(dir, "captions.srt");
  await writeFile(srtPath, srtContent, "utf-8");

  // FFmpeg subtitles filter — Lato with dark shadow
  const safeSubPath = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
  await execP(
    `"${ffmpeg}" -i "${inputPath}" -vf "subtitles='${safeSubPath}':force_style='FontName=Arial,FontSize=18,PrimaryColour=&Hffffff,BackColour=&H80000000,Shadow=2,MarginV=60'" -c:v libx264 -crf 18 -c:a copy "${outputPath}" -y`
  );

  await rm(dir, { recursive: true, force: true });
  return outputPath;
}

// ── Timelapse Generation ──────────────────────────────────────────────────────

/**
 * Assemble still frames into a smooth timelapse using FFmpeg minterpolate.
 * No Python/RIFE required.
 */
export async function smoothTimelapse(framePaths, outputPath, fps = 24) {
  const ffmpeg  = await getFfmpegPath();
  const dir     = await mkdtemp(join(tmpdir(), "blb-tl-"));
  const listFile = join(dir, "frames.txt");

  await writeFile(listFile, framePaths.map(p => `file '${p}'`).join("\n"));

  // Assemble frames, then smooth with minterpolate
  const rawPath = join(dir, "raw.mp4");
  await execP(
    `"${ffmpeg}" -f concat -safe 0 -i "${listFile}" -r ${fps} -c:v libx264 -crf 18 "${rawPath}" -y`
  );
  await execP(
    `"${ffmpeg}" -i "${rawPath}" -vf "minterpolate=fps=${fps}:mi_mode=mci" -c:v libx264 -crf 18 "${outputPath}" -y`
  );

  await rm(dir, { recursive: true, force: true });
  return outputPath;
}

// ── Thumbnail Generation ──────────────────────────────────────────────────────

export async function generateThumbnail(videoPath, atSecond = 5, outputPath) {
  const ffmpeg = await getFfmpegPath();
  await execP(
    `"${ffmpeg}" -ss ${atSecond} -i "${videoPath}" -vframes 1 -q:v 2 "${outputPath}" -y`
  );
  return outputPath;
}

// ── Music Mixing ──────────────────────────────────────────────────────────────

/**
 * Mix background music into video at specified volume ratio.
 * Existing audio treated as ambient (kept at 1 - musicVolume).
 */
async function mixMusic(inputPath, musicPath, outputPath, musicVolume = 0.6) {
  const ffmpeg = await getFfmpegPath();
  const ambientVol = (1 - musicVolume).toFixed(2);
  await execP(
    `"${ffmpeg}" -i "${inputPath}" -i "${musicPath}" -filter_complex "[0:a]volume=${ambientVol}[a1];[1:a]volume=${musicVolume},atrim=0:duration=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${inputPath}")[a2];[a1][a2]amix=inputs=2[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac "${outputPath}" -y`
  );
  return outputPath;
}

// ── Full Drone Pipeline ───────────────────────────────────────────────────────

/**
 * Complete automated pipeline for drone footage.
 * Called async after /api/marketing/media/upload for video assets.
 */
export async function runFullDronePipeline(assetId, filePath, context = {}) {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("DB not configured");

  const workDir = await mkdtemp(join(tmpdir(), "blb-drone-"));
  const log     = [];

  function logStep(step, status = "ok", detail = "") {
    log.push({ step, status, detail, ts: new Date().toISOString() });
    console.info(`[marketing/pipeline] ${step}: ${status}`, detail || "");
  }

  // localSrc is the downloaded video — all ffmpeg steps use this, never filePath directly
  const localSrc = join(workDir, "src.mp4");

  try {
    // 0. Download video from Supabase storage to local temp file
    // filePath is a Supabase storage path (e.g. "uploads/2024/01/<assetId>.mp4")
    logStep("download_source", "running");
    const { data: srcData, error: srcErr } = await sb.storage
      .from("marketing-media")
      .download(filePath);
    if (srcErr || !srcData) {
      throw new Error(`Failed to download source video: ${srcErr?.message || "no data"}`);
    }
    await writeFile(localSrc, Buffer.from(await srcData.arrayBuffer()));
    logStep("download_source", "ok", `${filePath}`);

    // 1. Detect D-Log M
    logStep("detect_dlog_m", "running");
    const isDLogM = await detectDLogM(localSrc);
    await sb.from("marketing_media_assets").update({ is_dji_dlog_m: isDLogM }).eq("id", assetId);
    logStep("detect_dlog_m", isDLogM ? "detected" : "not_detected");

    // 2. Extract meaningful frames (scene-change detection → upload to Supabase storage)
    logStep("extract_frames", "running");
    const frameRecords = await extractMeaningfulFrames(localSrc, assetId, sb);
    logStep("extract_frames", "ok", `${frameRecords.length} frames (scene-change detection)`);

    // 3. Download frames locally for Claude Vision analysis
    logStep("download_frames", "running");
    const framePaths = await downloadFramesForAnalysis(frameRecords, sb, workDir);
    logStep("download_frames", "ok", `${framePaths.length} frames ready for analysis`);

    // 4. Analyse with Claude
    logStep("analyse_frames", "running");
    const analysis = await analyseFramesWithClaude(framePaths, context);
    await sb.from("marketing_media_assets").update({
      analysis,
      stage_detected: analysis.project_stage || null,
    }).eq("id", assetId);
    logStep("analyse_frames", "ok", analysis.project_stage || "unknown stage");

    // 5. Identify best segments
    logStep("identify_segments", "running");
    const segments = identifyBestSegments(analysis, 30);
    logStep("identify_segments", "ok", `${segments.length} segments`);

    // 6. Cut segments (use localSrc — not the Supabase storage path)
    logStep("cut_segments", "running");
    const cutPath = join(workDir, "cut.mp4");
    await cutSegments(localSrc, segments, cutPath);
    logStep("cut_segments", "ok");

    // 7. Apply LUTs
    logStep("apply_luts", "running");
    const lutPath = join(workDir, "lut.mp4");
    await applyLUTs(cutPath, isDLogM, "brand", lutPath);
    logStep("apply_luts", "ok", isDLogM ? "D-Log M conversion applied" : "brand LUT applied");

    // 8. 9:16 reframe
    logStep("reframe_9x16", "running");
    const reframe916 = join(workDir, "9x16.mp4");
    await smartReframe(lutPath, "9x16", reframe916);
    logStep("reframe_9x16", "ok");

    // 16:9 (original ratio)
    const reframe169 = join(workDir, "16x9.mp4");
    await smartReframe(lutPath, "16x9", reframe169);

    // 8. Remotion overlays (9:16 version)
    logStep("render_overlays", "running");
    const overlaid916 = join(workDir, "9x16_overlaid.mp4");
    await renderRemotionOverlays(reframe916, overlaid916, {
      suburb: context.suburb || "",
      build_stage: analysis.project_stage || "",
    });
    logStep("render_overlays", "ok");

    // 9. Transcribe audio
    logStep("transcribe", "running");
    let srt = null;
    try {
      srt = await transcribeAudio(localSrc);
      logStep("transcribe", srt ? "ok" : "no_speech");
    } catch (e) {
      logStep("transcribe", "skipped", e.message);
    }

    // 10. Burn captions if we got a transcript
    let finalPath916 = overlaid916;
    if (srt) {
      logStep("burn_captions", "running");
      const captioned = join(workDir, "9x16_final.mp4");
      await burnCaptions(overlaid916, srt, captioned);
      finalPath916 = captioned;
      logStep("burn_captions", "ok");
    }

    // 11. Generate thumbnail
    logStep("thumbnail", "running");
    const thumbPath = join(workDir, "thumb.jpg");
    await generateThumbnail(lutPath, 5, thumbPath);
    logStep("thumbnail", "ok");

    // Upload outputs to Supabase Storage
    const year  = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");

    async function uploadToStorage(localPath, remotePath) {
      const buf = await readFile(localPath);
      const { error } = await sb.storage.from("marketing-media").upload(remotePath, buf, { upsert: true });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
      return remotePath;
    }

    const export916Path = `exports/${year}/${month}/${assetId}_9x16.mp4`;
    const export169Path = `exports/${year}/${month}/${assetId}_16x9.mp4`;
    const thumbStorePath = `thumbnails/${assetId}.jpg`;

    await uploadToStorage(finalPath916, export916Path);
    await uploadToStorage(reframe169, export169Path);
    await uploadToStorage(thumbPath,  thumbStorePath);

    // Update asset with thumbnail
    await sb.from("marketing_media_assets").update({ thumbnail_path: thumbStorePath }).eq("id", assetId);

    // Create export records
    await sb.from("marketing_media_exports").insert([
      { media_asset_id: assetId, export_format: "9x16", storage_path: export916Path, status: "ready", pipeline_log: log, captions_burned: !!srt },
      { media_asset_id: assetId, export_format: "16x9", storage_path: export169Path, status: "ready", pipeline_log: log },
    ]);

    logStep("complete", "ok");
    return { analysis, exports: { "9x16": export916Path, "16x9": export169Path }, thumbnail: thumbStorePath, captions_srt: srt };

  } catch (e) {
    log.push({ step: "error", status: "failed", detail: e.message, ts: new Date().toISOString() });
    console.error("[marketing/pipeline] FAILED for asset", assetId, e.message);

    // Update any existing processing exports to failed
    await sb.from("marketing_media_exports")
      .update({ status: "failed", pipeline_log: log })
      .eq("media_asset_id", assetId)
      .eq("status", "processing");

    // Insert a failed export record if none exist
    const { data: existing } = await sb.from("marketing_media_exports").select("id").eq("media_asset_id", assetId).limit(1);
    if (!existing?.length) {
      await sb.from("marketing_media_exports").insert({
        media_asset_id: assetId, export_format: "9x16",
        status: "failed", pipeline_log: log,
      });
    }
    throw e;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Re-export for additional export format ────────────────────────────────────

export async function reexportAsset(exportId, originalPath, exportFormat, colourPreset, mediaType) {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("DB not configured");

  const workDir = await mkdtemp(join(tmpdir(), "blb-reexport-"));
  const log     = [{ step: "start", ts: new Date().toISOString() }];

  try {
    const isDLogM = false; // LUT already applied in original pipeline
    const lutPath = join(workDir, "lut.mp4");
    await applyLUTs(originalPath, isDLogM, colourPreset, lutPath);

    const reframePath = join(workDir, `${exportFormat}.mp4`);
    await smartReframe(lutPath, exportFormat, reframePath);

    const year  = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const outPath = `exports/${year}/${month}/${exportId}_${exportFormat}.mp4`;

    const buf = await readFile(reframePath);
    await sb.storage.from("marketing-media").upload(outPath, buf, { upsert: true });

    await sb.from("marketing_media_exports").update({ status: "ready", storage_path: outPath, pipeline_log: log }).eq("id", exportId);
    log.push({ step: "complete", ts: new Date().toISOString() });
  } catch (e) {
    log.push({ step: "error", detail: e.message, ts: new Date().toISOString() });
    await sb.from("marketing_media_exports").update({ status: "failed", pipeline_log: log }).eq("id", exportId);
    throw e;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Final Assembly with Music ─────────────────────────────────────────────────

export async function assembleExport(exportId, originalPath, musicPath, options = {}) {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("DB not configured");

  const {
    music_volume = 0.6, colour_preset = "brand",
    export_formats = ["9x16"], isDLogM = false,
  } = options;

  const workDir = await mkdtemp(join(tmpdir(), "blb-assemble-"));
  const log     = [{ step: "start", ts: new Date().toISOString() }];

  try {
    // Apply LUT
    const lutPath = join(workDir, "lut.mp4");
    await applyLUTs(originalPath, isDLogM, colour_preset, lutPath);
    log.push({ step: "lut", status: "ok", ts: new Date().toISOString() });

    const year  = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");

    for (const format of export_formats) {
      const reframePath = join(workDir, `${format}.mp4`);
      await smartReframe(lutPath, format, reframePath);

      const mixedPath = join(workDir, `${format}_music.mp4`);
      await mixMusic(reframePath, musicPath, mixedPath, music_volume);

      const outPath = `exports/${year}/${month}/${exportId}_${format}_final.mp4`;
      const buf = await readFile(mixedPath);
      await sb.storage.from("marketing-media").upload(outPath, buf, { upsert: true });

      log.push({ step: `export_${format}`, status: "ok", path: outPath, ts: new Date().toISOString() });
    }

    await sb.from("marketing_media_exports").update({
      status: "ready", pipeline_log: log,
    }).eq("id", exportId);

  } catch (e) {
    log.push({ step: "error", detail: e.message, ts: new Date().toISOString() });
    await sb.from("marketing_media_exports").update({ status: "failed", pipeline_log: log }).eq("id", exportId);
    throw e;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
