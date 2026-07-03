/**
 * marketingLibraryRoutes.mjs — Marketing Asset Library (Batch 02A)
 *
 * Dropbox is SOURCE OF TRUTH.  Every row in marketing_library is an index
 * entry pointing to a live Dropbox file.  Supabase is a processing mirror only.
 *
 * Routes:
 *   GET  /api/marketing/library            — searchable/filterable asset index
 *   POST /api/marketing/library            — upload file → Dropbox → index row
 *   POST /api/marketing/library/seed-folders — idempotently create 7 Dropbox category folders (admin only)
 *
 * Legacy evergreen routes (unchanged from Batch 2 baseline):
 *   GET  /api/marketing/evergreen
 *   POST /api/marketing/content/:id/evergreen
 *
 * File upload encoding: base64 JSON body (matches the existing
 * /api/dropbox/upload-tender-document pattern in dev-api.mjs).
 * Accept: { title, category, assetType, pillar, stage, channel, tags,
 *            evergreen, notes, projectId, fileName, dataBase64 }
 *
 * IMPORTANT: Live Dropbox calls (dropboxUploadBuffer, ensurePublicSharedLink,
 * createFolderIfNotExists) are present in the code but are NEVER executed
 * during this build session.  The server is NOT booted against the live .env.
 */

import { getServiceSupabase }     from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import {
  ok,
  err,
  rowToCamel,
  rowsToCamel,
  paginate,
  translateDbError,
} from "./apiResponse.mjs";
import {
  dropboxConfigured,
  getDropboxAccessToken,
  dropboxUploadBuffer,
  ensurePublicSharedLink,
  createFolderIfNotExists,
} from "./dropboxClient.mjs";

// ─── Library category constants ───────────────────────────────────────────────
//
// APB 7-category structure under /BLUE LEAF BUILDING/MARKETING/LIBRARY/.
// Exported so the seed-folders handler and future batch scripts can reuse them.

export const LIBRARY_CATEGORIES = [
  "01 COMPLETED PROJECTS",
  "02 TEAM & CULTURE",
  "03 BRAND GUIDELINES",
  "04 CLIENT TESTIMONIALS",
  "05 BEHIND THE SCENES",
  "06 REELS & SHORTS",
  "07 PAST CAMPAIGN ADS",
];

/** Dropbox base path for the company-wide marketing library. */
export const DROPBOX_LIBRARY_BASE = "/BLUE LEAF BUILDING/MARKETING/LIBRARY";

/** Inbox drop-zone folder (bulk photo dump before triage). */
export const LIBRARY_INBOX_FOLDER = "00 INBOX";

/** Rejected/culled assets folder — files are moved here, never hard-deleted. */
export const LIBRARY_REJECTED_FOLDER = "_REJECTED";

/** Map category label → Dropbox folder path. */
export function libraryFolderPath(category) {
  return `${DROPBOX_LIBRARY_BASE}/${category}`;
}

// ─── Filename sanitiser ───────────────────────────────────────────────────────
// Per CLAUDE.md: lowercase, spaces→hyphens, strip specials except - and .
// Prefix with ISO date so sorting in Dropbox is chronological.

function sanitiseLibraryFilename(raw) {
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

// ─── DB helper ────────────────────────────────────────────────────────────────

function sb() {
  return getServiceSupabase();
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerMarketingLibraryRoutes(app) {

  // ── GET /api/marketing/library ─────────────────────────────────────────────
  // Returns a paginated, searchable, filterable index of marketing_library rows.
  //
  // Query params:
  //   search      — ilike match on title | original_filename | notes; @> match on tags
  //   category    — exact match (one of LIBRARY_CATEGORIES)
  //   pillar      — exact match
  //   stage       — exact match
  //   channel     — exact match
  //   projectId   — uuid exact match
  //   evergreen   — "true" | "false"
  //   tag         — single tag exact match (tags @> ARRAY[?])
  //   limit       — default 50, max 200
  //   offset      — default 0
  //
  // Response: { ok: true, assets: [...], total: N }

  app.get(
    "/api/marketing/library",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      const db = sb();
      if (!db) return err(res, 503, "Database not configured");

      let query = db
        .from("marketing_library")
        .select("*, job:jobs(id, address)", { count: "exact" })
        .order("created_at", { ascending: false });

      // ── Search ──────────────────────────────────────────────────────────────
      const search = req.query.search?.trim().replace(/"/g, "");
      if (search) {
        // Double-quote the ilike values so commas/parens are literals, not or() grammar
        query = query.or(
          `title.ilike."%${search}%",original_filename.ilike."%${search}%",notes.ilike."%${search}%"`
        );
      }

      // ── Facet filters ────────────────────────────────────────────────────────
      if (req.query.category) {
        query = query.eq("category", req.query.category);
      }
      if (req.query.pillar) {
        query = query.eq("pillar", req.query.pillar);
      }
      if (req.query.stage) {
        query = query.eq("stage", req.query.stage);
      }
      if (req.query.channel) {
        query = query.eq("channel", req.query.channel);
      }
      if (req.query.projectId) {
        query = query.eq("project_id", req.query.projectId);
      }
      if (req.query.evergreen === "true") {
        query = query.eq("evergreen", true);
      } else if (req.query.evergreen === "false") {
        query = query.eq("evergreen", false);
      }
      if (req.query.tag) {
        // GIN-indexed array containment: tags @> ARRAY[tag]
        query = query.contains("tags", [req.query.tag]);
      }

      // ── Pagination ───────────────────────────────────────────────────────────
      const { data, error: dbErr, count } = await paginate(query, req.query);
      if (dbErr) return err(res, 500, translateDbError(dbErr));

      const assets = rowsToCamel(data || []).map((row) => ({
        ...row,
        jobName: row.job?.address || null,
        job: undefined,
      }));

      return ok(res, { assets, total: count ?? 0 });
    }
  );

  // ── GET /api/marketing/library/jobs ──────────────────────────────────────
  // Returns a lightweight list of all jobs for the job picker in the upload form
  // and the Job facet filter.
  //
  // Response: { ok: true, jobs: [{ id, address }] }

  app.get(
    "/api/marketing/library/jobs",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      const db = sb();
      if (!db) return err(res, 503, "Database not configured");

      const { data, error: dbErr } = await db
        .from("jobs")
        .select("id, address")
        .not("address", "is", null)
        .order("address", { ascending: true });

      if (dbErr) return err(res, 500, translateDbError(dbErr));

      const jobs = (data || []).map((j) => rowToCamel(j));
      return ok(res, { jobs });
    }
  );

  // ── POST /api/marketing/library ────────────────────────────────────────────
  // Accepts a base64-encoded file + metadata, uploads to Dropbox, creates shared
  // link, then inserts an index row.
  //
  // Request body (JSON):
  //   { category, title, assetType, pillar, stage, channel, tags, evergreen,
  //     notes, projectId, fileName, dataBase64 }
  //
  // Response: { ok: true, asset: { ...rowToCamel } }

  app.post(
    "/api/marketing/library",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      const db = sb();
      if (!db) return err(res, 503, "Database not configured");

      // ── Validate required fields ─────────────────────────────────────────────
      const {
        category,
        title,
        assetType,
        pillar,
        stage,
        channel,
        tags,
        evergreen,
        notes,
        projectId,
        fileName,
        dataBase64,
      } = req.body || {};

      if (!category || !LIBRARY_CATEGORIES.includes(category)) {
        return err(
          res,
          400,
          `category is required and must be one of: ${LIBRARY_CATEGORIES.join(", ")}`
        );
      }
      if (!fileName || typeof dataBase64 !== "string" || !dataBase64.length) {
        return err(res, 400, "fileName and dataBase64 are required");
      }

      // ── Decode base64 ────────────────────────────────────────────────────────
      let buffer;
      try {
        buffer = Buffer.from(dataBase64.trim(), "base64");
      } catch {
        return err(res, 400, "Invalid base64 payload");
      }
      if (!buffer.length) {
        return err(res, 400, "File is empty after decode");
      }

      // ── Resolve Dropbox path ─────────────────────────────────────────────────
      if (!dropboxConfigured()) {
        return err(res, 503, "Dropbox is not configured — set DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN");
      }

      const safeName     = sanitiseLibraryFilename(fileName);
      const dropboxPath  = `${libraryFolderPath(category)}/${safeName}`;

      // ── Upload to Dropbox ────────────────────────────────────────────────────
      // LIVE DROPBOX CALLS — present in code; NOT executed during this build.
      let uploadedPath;
      let dropboxSharedLink;
      try {
        const token    = await getDropboxAccessToken();
        const uploaded = await dropboxUploadBuffer(token, dropboxPath, buffer, { autorename: true });
        uploadedPath   = uploaded.path_display || uploaded.path_lower || dropboxPath;

        // Public "anyone with the link" link — used for in-Hub row clicks.
        dropboxSharedLink = await ensurePublicSharedLink(token, uploadedPath);
      } catch (uploadErr) {
        console.error("[marketing/library] Dropbox upload failed:", uploadErr?.message || uploadErr);
        return err(res, 502, `Dropbox upload failed: ${uploadErr?.message || "unknown error"}`);
      }

      // ── Insert index row ─────────────────────────────────────────────────────
      const normalizedTags = Array.isArray(tags)
        ? tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
        : [];

      const insert = {
        category,
        asset_type:          assetType || null,
        project_id:          projectId || null,
        title:               title    || safeName,
        original_filename:   fileName,
        dropbox_path:        uploadedPath,
        dropbox_shared_link: dropboxSharedLink,
        supabase_mirror_path: null,
        pillar:    pillar   || null,
        stage:     stage    || null,
        channel:   channel  || null,
        tags:      normalizedTags,
        evergreen: Boolean(evergreen),
        notes:     notes    || null,
        created_by: req.user?.id || null,
      };

      const { data, error: dbErr } = await db
        .from("marketing_library")
        .insert(insert)
        .select()
        .single();

      if (dbErr) return err(res, 500, translateDbError(dbErr));

      return ok(res, { asset: rowToCamel(data) });
    }
  );

  // ── POST /api/marketing/library/seed-folders ──────────────────────────────
  // Idempotently ensures all 7 category folders exist in Dropbox under
  // /BLUE LEAF BUILDING/MARKETING/LIBRARY/.
  //
  // Admin only.  Safe to run multiple times (createFolderIfNotExists is idempotent).
  // LIVE DROPBOX CALLS — present in code; NOT executed during this build.
  //
  // Response: { ok: true, seeded: [...folderPaths], skipped: N }

  app.post(
    "/api/marketing/library/seed-folders",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      if (!dropboxConfigured()) {
        return err(res, 503, "Dropbox is not configured — set DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN");
      }

      let token;
      try {
        token = await getDropboxAccessToken();
      } catch (tokenErr) {
        return err(res, 502, `Dropbox auth failed: ${tokenErr?.message || "unknown"}`);
      }

      // Ensure the MARKETING/LIBRARY parent first, then each category subfolder,
      // then the special inbox/rejected folders.
      // Sequential — never Promise.all (CLAUDE.md Dropbox sequential reads rule).
      const parentFolders = [
        "/BLUE LEAF BUILDING/MARKETING",
        DROPBOX_LIBRARY_BASE,
      ];
      const categoryFolders = LIBRARY_CATEGORIES.map(libraryFolderPath);
      const specialFolders  = [
        `${DROPBOX_LIBRARY_BASE}/${LIBRARY_INBOX_FOLDER}`,
        `${DROPBOX_LIBRARY_BASE}/${LIBRARY_REJECTED_FOLDER}`,
      ];
      const allFolders = [...parentFolders, ...categoryFolders, ...specialFolders];

      const seeded  = [];
      const failed  = [];

      for (const folderPath of allFolders) {
        try {
          await createFolderIfNotExists(token, folderPath);
          seeded.push(folderPath);
        } catch (folderErr) {
          console.error(`[library/seed-folders] ${folderPath}:`, folderErr?.message || folderErr);
          failed.push({ path: folderPath, error: folderErr?.message || "unknown" });
        }
      }

      if (failed.length) {
        return err(
          res,
          502,
          `Seeding partially failed — ${failed.length} folder(s) could not be created. Check server logs.`
        );
      }

      return ok(res, { seeded, total: seeded.length });
    }
  );

  // ── Legacy evergreen routes (unchanged) ───────────────────────────────────
  //
  // GET  /api/marketing/evergreen
  // POST /api/marketing/content/:id/evergreen

  app.get(
    "/api/marketing/evergreen",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      const db = sb();
      if (!db) return err(res, 503, "Database not configured");
      const { data, error: dbErr } = await db
        .from("marketing_content_items")
        .select(
          "id, channel, pillar, title, body, status, evergreen_score, operational_labels, media_source_id, created_at"
        )
        .gt("evergreen_score", 0)
        .order("evergreen_score", { ascending: false })
        .limit(100);
      if (dbErr) return err(res, 500, translateDbError(dbErr));
      return ok(res, { items: rowsToCamel(data || []) });
    }
  );

  app.post(
    "/api/marketing/content/:id/evergreen",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      const db = sb();
      if (!db) return err(res, 503, "Database not configured");
      const score =
        typeof req.body?.score === "number" ? req.body.score : 1;
      const { data, error: dbErr } = await db
        .from("marketing_content_items")
        .update({ evergreen_score: score })
        .eq("id", req.params.id)
        .select()
        .single();
      if (dbErr) return err(res, 400, translateDbError(dbErr));
      return ok(res, { item: rowToCamel(data) });
    }
  );
}
