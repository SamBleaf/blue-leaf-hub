/**
 * marketingLibraryBackfillRoutes.mjs — Marketing Library Backfill (Batch 02B)
 *
 * Mirrors existing `marketing_media_assets` rows into the Dropbox library +
 * `marketing_library` index created in Batch 02A.
 *
 * Route:
 *   POST /api/marketing/library/backfill
 *     body/query: { dryRun?: boolean (default true), limit?: number }
 *
 * SAFETY:
 * - dryRun=true (default): read-only. Returns a plan object — zero writes.
 * - dryRun=false: live path — downloads from Supabase bucket, uploads to
 *   Dropbox, inserts marketing_library row. Do NOT call with dryRun=false
 *   until ready to run against live data.
 * - Originals in the marketing-media bucket are NEVER deleted or modified.
 * - Sequential loop, never Promise.all (CLAUDE.md Dropbox sequential reads).
 * - Per-asset try/catch: one failure never aborts the batch.
 * - Idempotent: assets already mirrored (supabase_mirror_path already present
 *   in marketing_library) are skipped — re-runs are safe.
 *
 * DO NOT boot the server against the live .env during the build session.
 * The live path code is present but must be exercised intentionally via
 * an authenticated admin POST with dryRun=false.
 */

import { getServiceSupabase }     from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import {
  ok,
  err,
  rowsToCamel,
  translateDbError,
} from "./apiResponse.mjs";
import {
  dropboxConfigured,
  getDropboxAccessToken,
  dropboxUploadBuffer,
  ensurePublicSharedLink,
} from "./dropboxClient.mjs";
import {
  LIBRARY_CATEGORIES,
  libraryFolderPath,
} from "./marketingLibraryRoutes.mjs";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Fallback category when no confident mapping can be found. */
const FALLBACK_CATEGORY = "05 BEHIND THE SCENES";

/** Bucket name for the existing Supabase marketing media storage. */
const SUPABASE_MEDIA_BUCKET = "marketing-media";

// ─── Filename sanitiser (matches 02A convention) ──────────────────────────────
// Per CLAUDE.md: lowercase, spaces→hyphens, strip specials except - and .
// Prefix with ISO date for chronological sorting in Dropbox.

function sanitiseBackfillFilename(raw) {
  const today = new Date().toISOString().slice(0, 10);
  const stem = String(raw || "asset")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "asset";
  return `${today}-${stem}`;
}

// ─── Category mapping heuristic ───────────────────────────────────────────────
//
// Maps a marketing_media_assets row to one of the 7 APB library categories.
//
// Signal priority (first match wins):
//   1. media_type="testimonial_video"            → 04 CLIENT TESTIMONIALS
//   2. analysis.overall_brand_fit or shot_type   (check for ad/campaign hints)
//   3. stage_detected / shot_type contains reel  → 06 REELS & SHORTS
//   4. suggested_uses / tags contain "ad"        → 07 PAST CAMPAIGN ADS
//   5. media_type photo/video + stage_detected   → 01 COMPLETED PROJECTS
//      (if stage_detected indicates a finished stage — completion, fitout, etc.)
//   6. shot_type / capture_source contains "team"|"staff"|"culture"
//                                                → 02 TEAM & CULTURE
//   7. media_type="transcript"|"notes"           → 03 BRAND GUIDELINES
//      (brand voice / copy assets are closest to guidelines)
//   8. media_type="drone_video"|"timelapse"      → 05 BEHIND THE SCENES
//      (action footage that doesn't fit completed-project evidence yet)
//   9. Any other photo/video                     → 05 BEHIND THE SCENES (fallback)
//
// Returns { category, needsReview } — needsReview=true when the mapping is
// uncertain so a human can re-file via the Library UI.

export function mapAssetToCategory(asset) {
  // NOTE: marketing_media_assets (migration 046) only has these signal columns —
  // media_type, stage_detected, analysis (jsonb), is_dji_dlog_m, original_filename.
  // Richer hints (shot type, suggested uses, tags) live inside the `analysis` jsonb,
  // so we fold that whole blob + the filename into the signal text.
  const mediaType      = String(asset.media_type     || "").toLowerCase();
  const stageDetected  = String(asset.stage_detected || "").toLowerCase();
  const isDlog         = asset.is_dji_dlog_m === true;
  const analysisStr    = JSON.stringify(asset.analysis || {}).toLowerCase();
  const filename       = String(asset.original_filename || "").toLowerCase();
  const signals        = [analysisStr, filename, stageDetected].join(" ");

  // 1. Testimonial video → CLIENT TESTIMONIALS
  if (mediaType === "testimonial_video" || /\b(testimonial|review)\b/.test(signals)) {
    return { category: "04 CLIENT TESTIMONIALS", needsReview: mediaType !== "testimonial_video" };
  }

  // 2. Ad/campaign signals → PAST CAMPAIGN ADS
  if (/\b(paid.?ad|campaign.?ad|sponsored|advertisement|boosted)\b/.test(signals)) {
    return { category: "07 PAST CAMPAIGN ADS", needsReview: false };
  }

  // 3. Reel/short signals → REELS & SHORTS
  if (/\b(reel|short|tiktok|stories)\b/.test([mediaType, signals].join(" "))) {
    return { category: "06 REELS & SHORTS", needsReview: false };
  }

  // 4. Completed-project evidence: stage detected as a finished construction phase
  const completedStages = ["completion", "fitout", "floor_coverings", "painting", "lock_up", "frame"];
  if (
    (mediaType === "photo" || mediaType === "video" || mediaType === "drone_video") &&
    completedStages.some((s) => stageDetected.includes(s))
  ) {
    return { category: "01 COMPLETED PROJECTS", needsReview: false };
  }

  // 5. Team / culture signals → TEAM & CULTURE
  if (/\b(team|staff|culture|people|crew|office|portrait|headshot)\b/.test(signals)) {
    return { category: "02 TEAM & CULTURE", needsReview: false };
  }

  // 6. Brand / copy assets (transcript, notes, doc) → BRAND GUIDELINES
  if (mediaType === "transcript" || mediaType === "notes") {
    return { category: "03 BRAND GUIDELINES", needsReview: true };
  }

  // 7. Drone / timelapse / D-Log footage → BEHIND THE SCENES (action during construction)
  if (isDlog || mediaType === "drone_video" || mediaType === "timelapse") {
    return { category: "05 BEHIND THE SCENES", needsReview: false };
  }

  // 8. Fallback — any unclassified asset lands in BEHIND THE SCENES, flagged for review
  return { category: FALLBACK_CATEGORY, needsReview: true };
}

// ─── DB helper ────────────────────────────────────────────────────────────────

function sb() {
  return getServiceSupabase();
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerMarketingLibraryBackfillRoutes(app) {

  /**
   * POST /api/marketing/library/backfill
   *
   * Query / body params:
   *   dryRun  — boolean string or boolean (default true)
   *   limit   — max assets to process in one call (default 50, max 200)
   *
   * Dry-run response shape:
   *   {
   *     ok: true,
   *     dryRun: true,
   *     wouldMirror: N,
   *     plan: [
   *       {
   *         sourceId:        uuid,
   *         sourcePath:      "uploads/…/asset.jpg",
   *         originalFilename: "photo.jpg",
   *         mediaType:       "photo",
   *         category:        "01 COMPLETED PROJECTS",
   *         needsReview:     false,
   *         targetDropboxPath: "/BLUE LEAF BUILDING/MARKETING/LIBRARY/01…/2026-07-03-photo.jpg",
   *         title:           "photo.jpg",
   *       }
   *     ],
   *     skippedAlreadyMirrored: M,
   *   }
   *
   * Live-run response shape:
   *   {
   *     ok: true,
   *     dryRun: false,
   *     mirrored: N,
   *     errors: [ { sourceId, sourcePath, error } ],
   *     skippedAlreadyMirrored: M,
   *   }
   */
  app.post(
    "/api/marketing/library/backfill",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      const db = sb();
      if (!db) return err(res, 503, "Database not configured");

      // ── Parse parameters ──────────────────────────────────────────────────────
      // Accept dryRun from both JSON body and query string.
      const rawDryRun =
        req.body?.dryRun !== undefined ? req.body.dryRun : req.query.dryRun;

      // Default is true — caller must explicitly pass dryRun=false to write
      const dryRun =
        rawDryRun === undefined || rawDryRun === null
          ? true
          : rawDryRun === false || rawDryRun === "false"
            ? false
            : true;

      const requestedLimit = Number(req.body?.limit ?? req.query.limit ?? 50);
      const limit = Math.min(Math.max(1, requestedLimit || 50), 200);

      // ── Find not-yet-mirrored assets ──────────────────────────────────────────
      //
      // Idempotency check: a marketing_library row with supabase_mirror_path
      // matching the asset's storage_path means this asset was already mirrored.
      // We use a NOT EXISTS sub-select equivalent via Supabase's `.not` + subquery
      // pattern — since Supabase JS doesn't support correlated subqueries directly,
      // we first load already-mirrored paths and filter them out in JS.
      //
      // For production scale (many thousands of assets) a SQL-side NOT EXISTS via
      // RPC would be preferable, but for a backfill batch of ≤200 rows this is
      // safe and avoids needing a new migration or RPC.

      // Step 1: all supabase_mirror_paths already in the library
      const { data: alreadyMirrored, error: mirroredErr } = await db
        .from("marketing_library")
        .select("supabase_mirror_path")
        .not("supabase_mirror_path", "is", null);

      if (mirroredErr) {
        return err(res, 500, translateDbError(mirroredErr));
      }

      const mirroredPaths = new Set(
        (alreadyMirrored || [])
          .map((r) => r.supabase_mirror_path)
          .filter(Boolean)
      );

      // Step 2: load marketing_media_assets up to limit + buffer (to account for skips)
      // We fetch limit + mirroredPaths.size rows so after filtering we still have ~limit
      const fetchLimit = Math.min(limit + mirroredPaths.size + 10, 500);

      const { data: allAssets, error: assetsErr } = await db
        .from("marketing_media_assets")
        .select(
          "id, storage_path, storage_bucket, original_filename, media_type, " +
          "stage_detected, analysis, is_dji_dlog_m, project_id, job_id, created_at"
        )
        .not("storage_path", "is", null)
        .order("created_at", { ascending: true })
        .limit(fetchLimit);

      if (assetsErr) {
        return err(res, 500, translateDbError(assetsErr));
      }

      const assets = allAssets || [];
      const skippedAlreadyMirrored = assets.filter(
        (a) => mirroredPaths.has(a.storage_path)
      ).length;

      const pending = assets
        .filter((a) => !mirroredPaths.has(a.storage_path))
        .slice(0, limit);

      // ── Build the plan ────────────────────────────────────────────────────────
      const plan = pending.map((asset) => {
        const { category, needsReview } = mapAssetToCategory(asset);
        const filename = sanitiseBackfillFilename(
          asset.original_filename || asset.storage_path?.split("/").pop() || "asset"
        );
        const targetDropboxPath = `${libraryFolderPath(category)}/${filename}`;
        const title = asset.original_filename
          || asset.storage_path?.split("/").pop()
          || asset.id;

        return {
          sourceId:          asset.id,
          sourcePath:        asset.storage_path,
          originalFilename:  asset.original_filename || null,
          mediaType:         asset.media_type,
          category,
          needsReview,
          targetDropboxPath,
          title,
          jobId:             asset.job_id || null,
        };
      });

      // ── Dry-run: return plan with zero writes ─────────────────────────────────
      if (dryRun) {
        return ok(res, {
          dryRun:                  true,
          wouldMirror:             plan.length,
          plan,
          skippedAlreadyMirrored,
        });
      }

      // ── Live path: download → upload → insert (sequential, per-asset try/catch) ─
      //
      // IMPORTANT: do NOT call this endpoint with dryRun=false during the build
      // session. The code below is correct and ready, but must be exercised
      // intentionally against the live environment by an admin.

      if (!dropboxConfigured()) {
        return err(
          res,
          503,
          "Dropbox is not configured — set DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN"
        );
      }

      let token;
      try {
        token = await getDropboxAccessToken();
      } catch (tokenErr) {
        return err(res, 502, `Dropbox auth failed: ${tokenErr?.message || "unknown"}`);
      }

      const mirrored = [];
      const errors   = [];

      for (const item of plan) {
        try {
          // 1. Download from Supabase Storage bucket
          const bucket = SUPABASE_MEDIA_BUCKET;
          const { data: blob, error: dlErr } = await db.storage
            .from(bucket)
            .download(item.sourcePath);

          if (dlErr || !blob) {
            throw new Error(
              `Supabase download failed: ${dlErr?.message || "no data returned"}`
            );
          }

          const buffer = Buffer.from(await blob.arrayBuffer());
          if (!buffer.length) {
            throw new Error("Downloaded file is empty — skipping");
          }

          // 2. Upload to Dropbox category folder
          const uploadResult = await dropboxUploadBuffer(
            token,
            item.targetDropboxPath,
            buffer,
            { autorename: true }
          );
          const uploadedPath =
            uploadResult.path_display ||
            uploadResult.path_lower ||
            item.targetDropboxPath;

          // 3. Ensure public shared link
          const dropboxSharedLink = await ensurePublicSharedLink(token, uploadedPath);

          // 4. Insert marketing_library index row
          //    supabase_mirror_path = original storage_path so re-runs skip this asset
          const insertRow = {
            category:            item.category,
            asset_type:          item.mediaType || null,
            project_id:          item.jobId || null,
            title:               item.title,
            original_filename:   item.originalFilename || null,
            dropbox_path:        uploadedPath,
            dropbox_shared_link: dropboxSharedLink,
            supabase_mirror_path: item.sourcePath,
            pillar:              null,
            stage:               null,
            channel:             null,
            tags:                [],
            evergreen:           false,
            notes: item.needsReview
              ? "Auto-backfilled from marketing-media — needs human category review"
              : null,
            created_by: req.user?.id || null,
          };

          const { error: insertErr } = await db
            .from("marketing_library")
            .insert(insertRow);

          if (insertErr) {
            throw new Error(translateDbError(insertErr));
          }

          mirrored.push({
            sourceId:          item.sourceId,
            sourcePath:        item.sourcePath,
            category:          item.category,
            dropboxPath:       uploadedPath,
            dropboxSharedLink,
            needsReview:       item.needsReview,
          });

        } catch (assetErr) {
          // Per-asset failure: log, collect, continue — never abort the batch
          console.error(
            `[marketing/library/backfill] asset ${item.sourceId} failed:`,
            assetErr?.message || assetErr
          );
          errors.push({
            sourceId:  item.sourceId,
            sourcePath: item.sourcePath,
            error:     assetErr?.message || "unknown error",
          });
        }
      }

      return ok(res, {
        dryRun:                 false,
        mirrored:               mirrored.length,
        mirroredAssets:         mirrored,
        errors,
        skippedAlreadyMirrored,
      });
    }
  );
}
