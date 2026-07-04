/**
 * marketingLibraryInboxRoutes.mjs — Marketing Library Inbox / Triage (INBOX-BATCH-A)
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

// ─── Folder path constants ────────────────────────────────────────────────────

/** Absolute Dropbox path to the bulk-dump inbox folder. */
const INBOX_PATH     = `${DROPBOX_LIBRARY_BASE}/${LIBRARY_INBOX_FOLDER}`;

/** Absolute Dropbox path to the rejected/culled assets folder. */
const REJECTED_PATH  = `${DROPBOX_LIBRARY_BASE}/${LIBRARY_REJECTED_FOLDER}`;

// ─── DB helper ────────────────────────────────────────────────────────────────

function db() {
  return getServiceSupabase();
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
