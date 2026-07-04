/**
 * marketingLibraryInboxRoutes.mjs — Marketing Library Inbox / Triage
 *
 * INBOX-BATCH-A: scan/ingest + file/reject (single + bulk).
 * INBOX-BATCH-C: auto-sort pass (quality_score, pHash dedup, category suggestion, job hint).
 *
 * Provides a front door for bulk photo imports. Dump hundreds of images into
 * /BLUE LEAF BUILDING/MARKETING/LIBRARY/00 INBOX/ then cull/file them here.
 *
 * All routes are admin-only.  All Dropbox operations are sequential — never Promise.all
 * (CLAUDE.md Dropbox sequential reads rule).  All responses via apiResponse.mjs law.
 *
 * Routes:
 *   POST /api/marketing/library/inbox/scan
 *     — lists the INBOX Dropbox folder, inserts marketing_library rows for
 *       unseen files (status='inbox', category null/'00 INBOX').  Idempotent.
 *     Response: { ok, scanned, added }
 *
 *   POST /api/marketing/library/inbox/sort           ← INBOX-BATCH-C
 *     body: { limit?: number, useAI?: boolean }
 *     — runs the free sorters (quality_score, pHash, category heuristic) over
 *       inbox rows, then clusters pHashes into dup_group ids.
 *       useAI=true additionally calls Haiku vision to pick a category.
 *     Response: { ok, processed, dupGroups, aiUsed }
 *
 *   POST /api/marketing/library/:id/file
 *     — validate category; move file INBOX→category folder; update row:
 *       category, project_id, dropbox_path, dropbox_shared_link, status='filed'.
 *     Response: { ok, asset }
 *
 *   POST /api/marketing/library/:id/reject
 *     — move file INBOX→_REJECTED/; set status='rejected'.  Never deletes.
 *     Response: { ok }
 *
 *   POST /api/marketing/library/bulk-file
 *     body: { ids: [], category, projectId }
 *     — sequential per-item file; returns per-item results.
 *     Response: { ok, results: [{ id, ok, error? }] }
 *
 *   POST /api/marketing/library/bulk-reject
 *     body: { ids: [] }
 *     — sequential per-item reject; returns per-item results.
 *     Response: { ok, results: [{ id, ok, error? }] }
 *
 * IMPORTANT: Live Dropbox calls are present in the code but are NOT executed
 * during this build session.  The server is NOT booted against the live .env.
 */

import { getServiceSupabase }     from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import {
  ok,
  err,
  rowToCamel,
  translateDbError,
} from "./apiResponse.mjs";
import {
  dropboxConfigured,
  getDropboxAccessToken,
  listFolderAllEntries,
  dropboxMoveFile,
  dropboxDownloadBuffer,
  ensurePublicSharedLink,
  createFolderIfNotExists,
} from "./dropboxClient.mjs";
import {
  LIBRARY_CATEGORIES,
  DROPBOX_LIBRARY_BASE,
  libraryFolderPath,
  LIBRARY_INBOX_FOLDER,
  LIBRARY_REJECTED_FOLDER,
} from "./marketingLibraryRoutes.mjs";
import { mapAssetToCategory } from "./marketingLibraryBackfillRoutes.mjs";
import { haversineMeters }     from "./geoDistance.mjs";
import Anthropic from "@anthropic-ai/sdk";
import { callAI } from "./aiGateway.mjs";
import { config as dotenvConfig } from "dotenv";

// ─── Folder path constants ────────────────────────────────────────────────────

/** Absolute Dropbox path to the bulk-dump inbox folder. */
const INBOX_PATH     = `${DROPBOX_LIBRARY_BASE}/${LIBRARY_INBOX_FOLDER}`;

/** Absolute Dropbox path to the rejected/culled assets folder. */
const REJECTED_PATH  = `${DROPBOX_LIBRARY_BASE}/${LIBRARY_REJECTED_FOLDER}`;

// ─── DB helper ────────────────────────────────────────────────────────────────

function db() {
  return getServiceSupabase();
}

// ─── INBOX-BATCH-C: Auto-sort helpers ────────────────────────────────────────

/**
 * Load dotenv key for the optional Haiku AI pass.
 * Mirrors the pattern in marketingAgent.mjs: won't override an existing env var.
 */
const { parsed: _env = {} } = dotenvConfig();
const _apiKey = process.env.ANTHROPIC_API_KEY?.trim() || _env.ANTHROPIC_API_KEY?.trim();

/** Haiku model id — vision-capable, cheapest Anthropic tier. */
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

/**
 * Attempt to dynamically require sharp.
 * Returns the sharp function if available, otherwise null.
 * We use a dynamic import so the server starts even if sharp is absent.
 */
let _sharp = null;
async function getSharp() {
  if (_sharp !== undefined) return _sharp;
  try {
    const mod = await import("sharp");
    _sharp = mod.default || mod;
    return _sharp;
  } catch {
    _sharp = null;
    return null;
  }
}

/**
 * Compute a perceptual hash (average hash) from an image buffer using sharp.
 *
 * Algorithm:
 *   1. Resize to 9×8 (need 9 wide for 8 column-diffs)
 *   2. Convert to greyscale
 *   3. For each row, compute the 8 horizontal differences (col[i+1] > col[i])
 *   4. Pack the resulting 64 bits into a 16-char hex string
 *
 * Returns a 16-char hex string, or null on failure.
 *
 * @param {Buffer} buffer — raw image bytes
 * @returns {Promise<string|null>}
 */
async function computePHash(buffer) {
  const sharp = await getSharp();
  if (!sharp) return null;
  try {
    const { data } = await sharp(buffer)
      .resize(9, 8, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // data is a Buffer of 9*8 = 72 bytes, row-major
    let bits = BigInt(0);
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const idx = row * 9 + col;
        const bit = data[idx + 1] > data[idx] ? 1n : 0n;
        bits = (bits << 1n) | bit;
      }
    }
    return bits.toString(16).padStart(16, "0");
  } catch (e) {
    console.warn("[inbox/sort] pHash error:", e?.message);
    return null;
  }
}

/**
 * Compute quality_score (0–1) from image buffer.
 *
 * Signals (weighted blend):
 *   - resolution (megapixels, normalised — 4MP=0.6, 12MP=1.0 ceiling)    weight 0.35
 *   - sharpness proxy (std-dev of greyscale pixels in 64×64 crop)         weight 0.40
 *   - exposure sanity (mean brightness not clipped — ideal 80–180/255)    weight 0.25
 *
 * Falls back to resolution-only when sharp is unavailable.
 *
 * @param {Buffer} buffer
 * @param {{ width?: number, height?: number }} [meta] — from sharp metadata if pre-fetched
 * @returns {Promise<number>} 0–1
 */
async function computeQualityScore(buffer, meta = {}) {
  const sharp = await getSharp();
  if (!sharp) {
    // No sharp: use known dimensions if provided, else 0.5 fallback
    const w = meta?.width || 0;
    const h = meta?.height || 0;
    if (!w || !h) return 0.5;
    const mp = (w * h) / 1_000_000;
    return Math.min(1, mp / 12);
  }

  try {
    // Get metadata (width/height) if not already known
    const imgMeta = await sharp(buffer).metadata();
    const w = imgMeta.width  || meta?.width  || 0;
    const h = imgMeta.height || meta?.height || 0;

    // ── Signal 1: resolution ──────────────────────────────────────────────────
    // Normalise: 12 MP → 1.0, 4 MP → 0.5, <1 MP → low score
    const mp = (w * h) / 1_000_000;
    const resScore = Math.min(1, mp / 12);

    // ── Signal 2: sharpness (std-dev of greyscale 64×64 crop) ────────────────
    // Higher std-dev = more texture = sharper. Clip at ~70 std-dev = 1.0.
    const { data: rawPix } = await sharp(buffer)
      .resize(64, 64, { fit: "cover" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const n = rawPix.length;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += rawPix[i];
    const mean = sum / n;
    let variance = 0;
    for (let i = 0; i < n; i++) {
      const d = rawPix[i] - mean;
      variance += d * d;
    }
    const stdDev = Math.sqrt(variance / n);
    // Empirically, well-focused photos score 30–70+ std-dev; blurry ones <15
    const sharpScore = Math.min(1, stdDev / 70);

    // ── Signal 3: exposure sanity ─────────────────────────────────────────────
    // Perfect exposure: mean brightness 80–180 (of 255).  Clip = near 0 or 255.
    const expScore = (() => {
      if (mean >= 80 && mean <= 180) return 1.0;
      if (mean < 80)  return mean / 80;        // underexposed penalty
      return (255 - mean) / 75;               // overexposed penalty
    })();

    const score = 0.35 * resScore + 0.40 * sharpScore + 0.25 * Math.max(0, expScore);
    return Math.max(0, Math.min(1, score));

  } catch (e) {
    console.warn("[inbox/sort] quality score error:", e?.message);
    return 0.5; // safe fallback
  }
}

/**
 * Hamming distance between two hex hash strings.
 * Returns Infinity when either hash is null/falsy.
 *
 * @param {string|null} a
 * @param {string|null} b
 * @returns {number}
 */
function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    dist += xor.toString(2).split("").filter((c) => c === "1").length;
  }
  return dist;
}

/**
 * Cluster pHashes into dup groups using a single-link greedy approach.
 * Any two hashes with Hamming distance ≤ threshold are in the same group.
 * Returns a Map<id, groupId>.
 *
 * @param {Array<{ id: string, phash: string|null }>} items
 * @param {number} [threshold=8]  — max Hamming bits to be "near-duplicate"
 * @returns {Map<string, string>}  id → dup_group string (or null if no cluster)
 */
function clusterPHashes(items, threshold = 8) {
  // Union-Find
  const parent = new Map(items.map((it) => [it.id, it.id]));

  function find(x) {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
    return parent.get(x);
  }
  function union(x, y) {
    const px = find(x), py = find(y);
    if (px !== py) parent.set(px, py);
  }

  // O(n²) — fine for ≤200 images per sort run
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (hammingDistance(items[i].phash, items[j].phash) <= threshold) {
        union(items[i].id, items[j].id);
      }
    }
  }

  // Assign group ids — only items with ≥1 near-duplicate get a dup_group label.
  const groupSize = new Map();
  for (const it of items) {
    const root = find(it.id);
    groupSize.set(root, (groupSize.get(root) || 0) + 1);
  }

  const result = new Map();
  const groupLabel = new Map(); // root → "dup-<shortHash>"
  for (const it of items) {
    const root = find(it.id);
    if ((groupSize.get(root) || 0) < 2) {
      result.set(it.id, null); // singleton — not a duplicate
    } else {
      if (!groupLabel.has(root)) {
        groupLabel.set(root, `dup-${root.slice(0, 8)}`);
      }
      result.set(it.id, groupLabel.get(root));
    }
  }

  return result;
}

/**
 * Best-effort job hint (NO GPS).
 *
 * Strategy (cheap, no geocoding):
 *   1. Source folder name contains job address substring
 *      e.g. dropbox_path="/…/00 INBOX/stirling-reno-2026/img.jpg" → match "stirling"
 *   2. Filename contains a job address substring (lowercased)
 *   3. Otherwise null
 *
 * @param {object} row     — marketing_library row (dropbox_path, original_filename)
 * @param {Array<{id:string,address:string}>} jobs
 * @returns {string|null}  project_id UUID or null
 */
function guessJobFromFilename(row, jobs) {
  const haystack = [
    (row.dropbox_path    || "").toLowerCase(),
    (row.original_filename || "").toLowerCase(),
  ].join(" ");

  for (const job of jobs) {
    if (!job.address) continue;
    // Try matching any word ≥4 chars from the address against the haystack
    const words = job.address.toLowerCase().split(/\W+/).filter((w) => w.length >= 4);
    if (words.length && words.every((w) => haystack.includes(w))) {
      return job.id;
    }
    // Single meaningful word match (suburb name) — weaker but useful
    if (words.some((w) => w.length >= 6 && haystack.includes(w))) {
      return job.id;
    }
  }
  return null;
}

// ─── INBOX-BATCH-C / G2-A: GPS → nearest-job suggestion ─────────────────────

/**
 * Maximum radius (metres) within which a geocoded job is considered a match
 * for a photo's EXIF GPS coordinates.  2 km is generous for a construction
 * site — covers the job site itself plus any photos taken nearby on the day.
 * Adjust upward if jobs are in rural areas with sparse geocoding coverage.
 */
const NEAREST_JOB_RADIUS_M = 2000;

/**
 * Attempt to extract GPS coordinates from an image buffer using exifr.
 *
 * exifr handles JPEG, HEIC, and most RAW formats.  Returns
 * `{ latitude, longitude }` when GPS tags are present, or `undefined` when
 * the image has no GPS data (most studio shots, screen-captures, etc.).
 *
 * Always wrapped in try/catch by the caller — many images legitimately have
 * no GPS; that is not an error.
 *
 * @param {Buffer} buffer — raw image bytes
 * @returns {Promise<{ latitude: number, longitude: number } | undefined>}
 */
async function extractExifGps(buffer) {
  // Dynamic import so the server starts even if exifr ever fails to load
  const exifr = await import("exifr").then((m) => m.default || m);
  return exifr.gps(buffer);
}

/**
 * Find the nearest geocoded job to a GPS coordinate, within NEAREST_JOB_RADIUS_M.
 *
 * @param {number} lat  — photo latitude
 * @param {number} lng  — photo longitude
 * @param {Array<{ id: string, geoLat: number, geoLng: number }>} geocodedJobs
 *   — jobs that have both geo_lat and geo_lng set (loaded once per sort run)
 * @returns {string|null}  job id UUID or null if nothing within radius
 */
function findNearestJob(lat, lng, geocodedJobs) {
  let bestId   = null;
  let bestDist = Infinity;

  for (const job of geocodedJobs) {
    const dist = haversineMeters(lat, lng, job.geoLat, job.geoLng);
    if (dist < bestDist) {
      bestDist = dist;
      bestId   = job.id;
    }
  }

  if (bestId && bestDist <= NEAREST_JOB_RADIUS_M) return bestId;
  return null;
}

/**
 * Haiku vision call — returns one of the 7 LIBRARY_CATEGORIES strings.
 * Wraps in try/catch so caller falls back to heuristic on failure.
 *
 * @param {Buffer} buffer — image bytes
 * @param {string} mediaType — MIME type (e.g. "image/jpeg")
 * @returns {Promise<string>}
 */
async function classifyWithHaiku(buffer, mediaType) {
  if (!_apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const client = new Anthropic({ apiKey: _apiKey, maxRetries: 1 });
  const base64 = buffer.toString("base64");
  const categoryList = LIBRARY_CATEGORIES.join("\n");

  const response = await callAI(
    client,
    {
      model: HAIKU_MODEL,
      max_tokens: 64,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType || "image/jpeg", data: base64 },
            },
            {
              type: "text",
              text: `You are classifying a construction marketing photo for Blue Leaf Building.\n\nCategories:\n${categoryList}\n\nReply with ONLY the exact category string from the list above that best fits this image. No explanation.`,
            },
          ],
        },
      ],
    },
    { module: "marketingInboxSort" }
  );

  const raw = response.content.find((b) => b.type === "text")?.text?.trim() || "";
  // Validate — must exactly match one of the 7 categories
  const match = LIBRARY_CATEGORIES.find((c) => raw.includes(c));
  if (!match) throw new Error(`Haiku returned unrecognised category: ${raw}`);
  return match;
}

/**
 * Guess media_type from filename extension (matches marketing_media_assets media_type values).
 * @param {string} filename
 * @returns {string}
 */
function guessMediaType(filename) {
  const ext = (filename || "").split(".").pop().toLowerCase();
  const videoExts = ["mp4", "mov", "avi", "mkv", "webm", "mts", "m4v"];
  const photoExts = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "tiff", "tif", "bmp", "raw", "dng"];
  if (videoExts.includes(ext)) return "video";
  if (photoExts.includes(ext)) return "photo";
  return "photo"; // safe default for inbox assets
}

/**
 * Guess MIME type from file extension.
 * @param {string} filename
 * @returns {string}
 */
function guessMimeType(filename) {
  const ext = (filename || "").split(".").pop().toLowerCase();
  const map = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif",  webp: "image/webp", heic: "image/heic",
    heif: "image/heif", tiff: "image/tiff", tif: "image/tiff",
    bmp: "image/bmp",
  };
  return map[ext] || "image/jpeg";
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Derive the target Dropbox path for a file being moved from the INBOX to a
 * category folder.  Preserves the original filename component (last segment of
 * the current dropbox_path, or the original_filename column as fallback).
 *
 * @param {string} currentPath    — current dropbox_path from the DB row
 * @param {string} originalFilename — original_filename from the DB row
 * @param {string} category       — validated LIBRARY_CATEGORIES value
 * @returns {string}
 */
function buildFiledPath(currentPath, originalFilename, category) {
  const rawName = currentPath
    ? currentPath.split("/").pop()
    : null;
  const fileName = rawName || originalFilename || "asset";
  return `${libraryFolderPath(category)}/${fileName}`;
}

/**
 * Derive the target Dropbox path for a file being rejected.
 *
 * @param {string} currentPath
 * @param {string} originalFilename
 * @returns {string}
 */
function buildRejectedPath(currentPath, originalFilename) {
  const rawName = currentPath
    ? currentPath.split("/").pop()
    : null;
  const fileName = rawName || originalFilename || "asset";
  return `${REJECTED_PATH}/${fileName}`;
}

// ─── Core per-item operations ─────────────────────────────────────────────────
// Extracted as standalone async functions so they can be called from both the
// single-item routes and the bulk loops without code duplication.

/**
 * File a single asset: move Dropbox file, refresh shared link, update DB row.
 *
 * @param {string} id           — marketing_library UUID
 * @param {string} category     — validated category from LIBRARY_CATEGORIES
 * @param {string|null} projectId
 * @returns {Promise<{ asset: object }>}
 * @throws on Dropbox or DB error
 */
async function fileAsset(id, category, projectId) {
  const supabase = db();

  // Fetch current row — we need dropbox_path and original_filename.
  const { data: row, error: fetchErr } = await supabase
    .from("marketing_library")
    .select("id, dropbox_path, original_filename, status")
    .eq("id", id)
    .single();

  if (fetchErr || !row) {
    throw new Error(fetchErr ? translateDbError(fetchErr) : "Asset not found");
  }

  const token      = await getDropboxAccessToken();
  const targetPath = buildFiledPath(row.dropbox_path, row.original_filename, category);

  // Ensure destination folder exists (idempotent — safe to call every time).
  await createFolderIfNotExists(token, libraryFolderPath(category));

  // Move INBOX → category folder.
  const moved = await dropboxMoveFile(token, row.dropbox_path, targetPath);
  const movedPath = moved?.metadata?.path_display || moved?.path_display || targetPath;

  // Refresh public shared link on the new location.
  const sharedLink = await ensurePublicSharedLink(token, movedPath);

  // Update the DB row.
  const patch = {
    category,
    project_id:          projectId || null,
    dropbox_path:        movedPath,
    dropbox_shared_link: sharedLink,
    status:              "filed",
  };

  const { data: updated, error: updateErr } = await supabase
    .from("marketing_library")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (updateErr) throw new Error(translateDbError(updateErr));

  return { asset: rowToCamel(updated) };
}

/**
 * Reject a single asset: move Dropbox file to _REJECTED, update DB row.
 *
 * @param {string} id — marketing_library UUID
 * @returns {Promise<void>}
 * @throws on Dropbox or DB error
 */
async function rejectAsset(id) {
  const supabase = db();

  const { data: row, error: fetchErr } = await supabase
    .from("marketing_library")
    .select("id, dropbox_path, original_filename, status")
    .eq("id", id)
    .single();

  if (fetchErr || !row) {
    throw new Error(fetchErr ? translateDbError(fetchErr) : "Asset not found");
  }

  const token      = await getDropboxAccessToken();
  const targetPath = buildRejectedPath(row.dropbox_path, row.original_filename);

  // Ensure _REJECTED folder exists.
  await createFolderIfNotExists(token, REJECTED_PATH);

  // Move INBOX → _REJECTED.
  const moved = await dropboxMoveFile(token, row.dropbox_path, targetPath);
  const movedPath = moved?.metadata?.path_display || moved?.path_display || targetPath;

  // Update the DB row — clear shared link (rejected assets aren't served publicly).
  const { error: updateErr } = await supabase
    .from("marketing_library")
    .update({
      dropbox_path:        movedPath,
      dropbox_shared_link: null,
      status:              "rejected",
    })
    .eq("id", id);

  if (updateErr) throw new Error(translateDbError(updateErr));
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerMarketingLibraryInboxRoutes(app) {

  // ── POST /api/marketing/library/inbox/sort ────────────────────────────────
  // INBOX-BATCH-C: auto-sort pass over inbox rows.
  //
  // For each inbox row missing quality_score (idempotent — already-scored rows
  // are skipped unless re-scoring, but we choose to skip for simplicity):
  //   1. Download the Dropbox file buffer (sequential — never Promise.all)
  //   2. Compute quality_score (0–1) + pHash
  //   3. Suggest category from heuristic (mapAssetToCategory)
  //   4. If useAI=true, call Haiku vision for category (fallback to heuristic on error)
  //   5a. Extract EXIF GPS → find nearest geocoded job → set suggested_project_id (G2-A)
  //   5b. Filename/path heuristic fallback for suggested_project_id (no GPS → batch-C)
  //   6. Update the DB row (suggested_project_id only; project_id = user-confirmed at file-time)
  // After all rows processed: cluster pHashes → assign dup_group.
  //
  // Returns: { ok, processed, dupGroups, aiUsed }

  app.post(
    "/api/marketing/library/inbox/sort",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      const supabase = db();
      if (!supabase) return err(res, 503, "Database not configured");
      if (!dropboxConfigured()) {
        return err(res, 503, "Dropbox is not configured — set DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN");
      }

      const rawLimit  = Number(req.body?.limit  ?? 100);
      const limit     = Math.min(Math.max(1, rawLimit || 100), 500);
      const useAI     = req.body?.useAI === true || req.body?.useAI === "true";

      // ── Fetch inbox rows not yet quality-scored ──────────────────────────────
      const { data: rows, error: fetchErr } = await supabase
        .from("marketing_library")
        .select("id, dropbox_path, original_filename, status, quality_score, dup_group, category, notes, project_id")
        .eq("status", "inbox")
        .is("quality_score", null)   // skip already-scored rows (idempotent)
        .order("created_at", { ascending: true })
        .limit(limit);

      if (fetchErr) return err(res, 500, translateDbError(fetchErr));

      const pending = rows || [];

      if (!pending.length) {
        return ok(res, { processed: 0, dupGroups: 0, aiUsed: false });
      }

      // ── Load jobs for job-hint matching (once per sort run) ─────────────────
      //
      // Two separate queries:
      //   1. geocodedJobs — jobs with lat/lng for EXIF GPS matching (G2-A primary signal)
      //   2. allJobs     — all jobs with addresses for filename fallback (batch-C legacy)
      //
      // The geocoded-job list is fetched in a single query and reused across all
      // images in this sort run — never one query per image.

      const { data: geocodedJobRows } = await supabase
        .from("jobs")
        .select("id, geo_lat, geo_lng")
        .not("geo_lat", "is", null)
        .not("geo_lng",  "is", null);

      // Normalise to camelCase here for use with haversineMeters
      const geocodedJobs = (geocodedJobRows || []).map((r) => ({
        id:     r.id,
        geoLat: Number(r.geo_lat),
        geoLng: Number(r.geo_lng),
      }));

      const { data: jobRows } = await supabase
        .from("jobs")
        .select("id, address")
        .not("address", "is", null);
      const jobs = jobRows || [];

      // ── Get Dropbox token once ────────────────────────────────────────────────
      let token;
      try {
        token = await getDropboxAccessToken();
      } catch (tokenErr) {
        return err(res, 502, `Dropbox auth failed: ${tokenErr?.message || "unknown"}`);
      }

      // ── Per-row processing (sequential — Dropbox sequential reads rule) ──────
      let processed = 0;
      let aiUsed    = false;

      // Collect (id, phash) pairs for clustering after the loop
      const phashItems = [];

      for (const row of pending) {
        try {
          if (!row.dropbox_path) continue;

          // 1. Download buffer
          const buffer = await dropboxDownloadBuffer(token, row.dropbox_path);
          if (!buffer || !buffer.length) continue;

          // 2. Compute quality_score + pHash
          const qualityScore = await computeQualityScore(buffer);
          const phash        = await computePHash(buffer);

          // 3. Category heuristic (reuse existing logic from backfill)
          const { category: heuristicCat, needsReview } = mapAssetToCategory({
            media_type:       guessMediaType(row.original_filename),
            stage_detected:   null,
            analysis:         null,
            is_dji_dlog_m:    false,
            original_filename: row.original_filename,
          });

          // 4. AI category (optional, Haiku, per-item try/catch)
          let suggestedCategory = heuristicCat;
          if (useAI) {
            try {
              const mimeType = guessMimeType(row.original_filename || row.dropbox_path || "");
              suggestedCategory = await classifyWithHaiku(buffer, mimeType);
              aiUsed = true;
            } catch (aiErr) {
              console.warn(`[inbox/sort] Haiku failed for ${row.id}: ${aiErr?.message} — using heuristic`);
              suggestedCategory = heuristicCat;
            }
          }

          // 5a. GPS-based job suggestion (G2-A — primary signal)
          //
          // Try to extract EXIF GPS from the buffer.  Many images have no GPS
          // (screenshots, studio shots, imports from non-GPS cameras) — this is
          // normal and we silently skip.  exifr.gps() returns
          // { latitude, longitude } or undefined.
          //
          // If GPS is found AND there are geocoded jobs within NEAREST_JOB_RADIUS_M,
          // record the nearest job id as `suggested_project_id`.
          // This is separate from the user-confirmed `project_id` — it only
          // pre-populates the picker; a human must confirm at file-time.

          let suggestedProjectId = null;

          try {
            const gps = await extractExifGps(buffer);
            if (gps?.latitude != null && gps?.longitude != null && geocodedJobs.length > 0) {
              suggestedProjectId = findNearestJob(gps.latitude, gps.longitude, geocodedJobs);
            }
          } catch (gpsErr) {
            // No GPS, unsupported format, or exifr not available — normal, skip silently
            console.debug(`[inbox/sort] GPS extraction skipped for ${row.id}: ${gpsErr?.message}`);
          }

          // 5b. Filename-based fallback (batch-C legacy heuristic)
          //
          // Only used for the filename hint — GPS takes precedence.
          // The filename hint still writes to suggested_project_id (not project_id),
          // so the user can confirm or override it.
          if (!suggestedProjectId) {
            suggestedProjectId = guessJobFromFilename(row, jobs) || null;
          }

          // 6. Update DB row
          const patch = {
            quality_score: qualityScore,
            // Track phash in memory only for the clustering pass (written to dup_group below).
          };

          // Update category only if still '00 INBOX' (i.e. not yet user-set)
          if (!row.category || row.category === "00 INBOX") {
            patch.category    = suggestedCategory;
            patch.notes       = needsReview && !useAI
              ? (row.notes || null)
              : row.notes || null;
          }

          // Write suggested_project_id (GPS-derived or filename fallback).
          // Never overwrite an already-confirmed project_id — that is authoritative.
          // suggested_project_id is always safe to refresh with the latest signal.
          if (suggestedProjectId) {
            patch.suggested_project_id = suggestedProjectId;
          }

          const { error: updateErr } = await supabase
            .from("marketing_library")
            .update(patch)
            .eq("id", row.id);

          if (updateErr) {
            console.error(`[inbox/sort] DB update failed for ${row.id}:`, updateErr?.message);
            continue;
          }

          phashItems.push({ id: row.id, phash });
          processed += 1;

        } catch (rowErr) {
          // Per-item failure: log and continue — never abort the batch
          console.error(`[inbox/sort] row ${row.id} failed:`, rowErr?.message || rowErr);
        }
      }

      // ── Cluster pHashes → assign dup_group ───────────────────────────────────
      // Only cluster items that got a valid phash
      const hashable = phashItems.filter((it) => it.phash !== null);
      const groupMap  = clusterPHashes(hashable);
      let dupGroups   = 0;

      // Count distinct non-null group ids
      const distinctGroups = new Set();
      for (const [, gid] of groupMap) {
        if (gid) distinctGroups.add(gid);
      }
      dupGroups = distinctGroups.size;

      // Write dup_group back to DB (sequential)
      for (const it of hashable) {
        const gid = groupMap.get(it.id) || null;
        // Only update if group changed (skip if already null and no group)
        const { error: dupErr } = await supabase
          .from("marketing_library")
          .update({ dup_group: gid })
          .eq("id", it.id);

        if (dupErr) {
          console.warn(`[inbox/sort] dup_group update failed for ${it.id}:`, dupErr?.message);
        }
      }

      return ok(res, { processed, dupGroups, aiUsed });
    }
  );

  // ── POST /api/marketing/library/inbox/scan ────────────────────────────────
  // Lists the INBOX Dropbox folder and inserts a marketing_library row for
  // every file not already indexed (idempotent — skips known dropbox_paths).
  //
  // Rows are inserted with:
  //   status            = 'inbox'
  //   category          = '00 INBOX'  (overwritten when filed)
  //   dropbox_path      = the INBOX path
  //   original_filename = the file's name in Dropbox
  //
  // Returns: { ok: true, scanned: N, added: N }

  app.post(
    "/api/marketing/library/inbox/scan",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      const supabase = db();
      if (!supabase) return err(res, 503, "Database not configured");
      if (!dropboxConfigured()) {
        return err(res, 503, "Dropbox is not configured — set DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN");
      }

      let token;
      try {
        token = await getDropboxAccessToken();
      } catch (tokenErr) {
        return err(res, 502, `Dropbox auth failed: ${tokenErr?.message || "unknown"}`);
      }

      // List all file entries in the INBOX folder.
      // listFolderAllEntries handles pagination internally.
      let entries;
      try {
        entries = await listFolderAllEntries(token, INBOX_PATH);
      } catch (listErr) {
        // INBOX folder not created yet → treat as an empty inbox, not an error.
        if (String(listErr?.message || "").includes("not_found")) {
          entries = [];
        } else {
          return err(res, 502, `Dropbox list failed: ${listErr?.message || "unknown"}`);
        }
      }

      // Only files — skip sub-folders.
      const files = entries.filter((e) => e[".tag"] === "file");

      if (!files.length) {
        return ok(res, { scanned: 0, added: 0 });
      }

      // Fetch already-indexed paths from the DB so we can skip duplicates.
      // Pull only paths that start with the INBOX prefix to keep the set small.
      const { data: existing, error: existErr } = await supabase
        .from("marketing_library")
        .select("dropbox_path")
        .like("dropbox_path", `${INBOX_PATH}/%`);

      if (existErr) return err(res, 500, translateDbError(existErr));

      const knownPaths = new Set(
        (existing || []).map((r) => (r.dropbox_path || "").toLowerCase())
      );

      let added = 0;

      // Sequential insert — never Promise.all.
      for (const entry of files) {
        const filePath = entry.path_display || entry.path_lower || "";
        if (!filePath) continue;
        if (knownPaths.has(filePath.toLowerCase())) continue;

        const insert = {
          category:          LIBRARY_INBOX_FOLDER,  // '00 INBOX' — overwritten on file
          status:            "inbox",
          dropbox_path:      filePath,
          original_filename: entry.name || filePath.split("/").pop() || "unknown",
          tags:              [],
          evergreen:         false,
        };

        const { error: insertErr } = await supabase
          .from("marketing_library")
          .insert(insert);

        if (insertErr) {
          // Log and continue — a single failed insert should not abort the scan.
          console.error(`[inbox/scan] insert failed for ${filePath}:`, insertErr?.message || insertErr);
          continue;
        }

        knownPaths.add(filePath.toLowerCase());
        added += 1;
      }

      return ok(res, { scanned: files.length, added });
    }
  );

  // ── POST /api/marketing/library/:id/file ─────────────────────────────────
  // File (categorise + optionally job-link) an inbox asset.
  //
  // Body: { category, projectId? }
  //   category  — required; must be one of LIBRARY_CATEGORIES
  //   projectId — optional UUID linking to jobs table
  //
  // Moves the Dropbox file from its current location → category folder.
  // Updates: category, project_id, dropbox_path, dropbox_shared_link, status='filed'.
  //
  // Returns: { ok: true, asset: { ...camelCased row } }

  app.post(
    "/api/marketing/library/:id/file",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      const supabase = db();
      if (!supabase) return err(res, 503, "Database not configured");
      if (!dropboxConfigured()) {
        return err(res, 503, "Dropbox is not configured — set DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN");
      }

      const { id } = req.params;
      const { category, projectId } = req.body || {};

      if (!category || !LIBRARY_CATEGORIES.includes(category)) {
        return err(
          res,
          400,
          `category is required and must be one of: ${LIBRARY_CATEGORIES.join(", ")}`
        );
      }

      try {
        const result = await fileAsset(id, category, projectId || null);
        return ok(res, result);
      } catch (e) {
        console.error(`[library/:id/file] id=${id}:`, e?.message || e);
        return err(res, 502, e?.message || "Failed to file asset");
      }
    }
  );

  // ── POST /api/marketing/library/:id/reject ────────────────────────────────
  // Cull/reject an inbox asset.
  //
  // Moves the Dropbox file from its current location → _REJECTED/.
  // Sets status='rejected'.  File is NEVER hard-deleted.
  //
  // Returns: { ok: true }

  app.post(
    "/api/marketing/library/:id/reject",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      const supabase = db();
      if (!supabase) return err(res, 503, "Database not configured");
      if (!dropboxConfigured()) {
        return err(res, 503, "Dropbox is not configured — set DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN");
      }

      const { id } = req.params;

      try {
        await rejectAsset(id);
        return ok(res);
      } catch (e) {
        console.error(`[library/:id/reject] id=${id}:`, e?.message || e);
        return err(res, 502, e?.message || "Failed to reject asset");
      }
    }
  );

  // ── POST /api/marketing/library/bulk-file ─────────────────────────────────
  // Bulk-file a selection of inbox assets to the same category (+ optional job).
  //
  // Body: { ids: string[], category: string, projectId?: string }
  //
  // Sequential per-item — never Promise.all.
  // Per-item try/catch so one failure does not abort the batch.
  //
  // Returns: { ok: true, results: [{ id, ok, error? }] }

  app.post(
    "/api/marketing/library/bulk-file",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      const supabase = db();
      if (!supabase) return err(res, 503, "Database not configured");
      if (!dropboxConfigured()) {
        return err(res, 503, "Dropbox is not configured — set DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN");
      }

      const { ids, category, projectId } = req.body || {};

      if (!Array.isArray(ids) || !ids.length) {
        return err(res, 400, "ids must be a non-empty array");
      }
      if (!category || !LIBRARY_CATEGORIES.includes(category)) {
        return err(
          res,
          400,
          `category is required and must be one of: ${LIBRARY_CATEGORIES.join(", ")}`
        );
      }

      const results = [];

      for (const id of ids) {
        try {
          await fileAsset(id, category, projectId || null);
          results.push({ id, ok: true });
        } catch (e) {
          console.error(`[bulk-file] id=${id}:`, e?.message || e);
          results.push({ id, ok: false, error: e?.message || "Failed to file asset" });
        }
      }

      return ok(res, { results });
    }
  );

  // ── POST /api/marketing/library/bulk-reject ───────────────────────────────
  // Bulk-reject a selection of inbox assets.
  //
  // Body: { ids: string[] }
  //
  // Sequential per-item — never Promise.all.
  // Per-item try/catch so one failure does not abort the batch.
  //
  // Returns: { ok: true, results: [{ id, ok, error? }] }

  app.post(
    "/api/marketing/library/bulk-reject",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      const supabase = db();
      if (!supabase) return err(res, 503, "Database not configured");
      if (!dropboxConfigured()) {
        return err(res, 503, "Dropbox is not configured — set DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN");
      }

      const { ids } = req.body || {};

      if (!Array.isArray(ids) || !ids.length) {
        return err(res, 400, "ids must be a non-empty array");
      }

      const results = [];

      for (const id of ids) {
        try {
          await rejectAsset(id);
          results.push({ id, ok: true });
        } catch (e) {
          console.error(`[bulk-reject] id=${id}:`, e?.message || e);
          results.push({ id, ok: false, error: e?.message || "Failed to reject asset" });
        }
      }

      return ok(res, { results });
    }
  );
}
