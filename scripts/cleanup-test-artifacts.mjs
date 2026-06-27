#!/usr/bin/env node
/**
 * Safe cleanup for test-created external artifacts (Dropbox job folders).
 *
 *   npm run test:cleanup-artifacts                              # dry-run (default)
 *   npm run test:cleanup-artifacts -- --confirm                 # delete safe canonical only
 *   npm run test:cleanup-artifacts -- --confirm --include-legacy-test-names --confirm-legacy "DELETE LEGACY TEST FOLDERS"
 *   npm run test:cleanup-artifacts -- --confirm --older-than-days 1
 *   npm run test:cleanup-artifacts -- --report                  # append summary to log file
 *
 * Hard rules:
 * - Safe canonical folders: deletable with --confirm only.
 * - Legacy review-only folders: require --include-legacy-test-names AND --confirm-legacy phrase.
 * - Never deletes by date or project name alone.
 * - Default is dry-run; --confirm required for destructive action.
 *
 * Supabase rows: use scripts/cleanup-test-data.mjs (separate tool).
 */
import { config as dotenvConfig } from "dotenv";
import { appendFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  dropboxConfigured,
  getDropboxAccessToken,
  getTeamNamespaceId,
  listFolderAllEntries,
  DROPBOX_SHARED_PROJECTS_BASE,
  DROPBOX_PRIVATE_INTERNAL_BASE,
} from "../server/lib/dropboxClient.mjs";
import { classifyTestArtifactName } from "./lib/testArtifactPrefixes.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: join(__dir, "..", ".env") });

const DROPBOX_API = "https://api.dropboxapi.com/2";
const LOG_PATH = join(__dir, "..", "docs", "qa", "test-artifact-cleanup-log.md");
const REQUIRED_LEGACY_PHRASE = "DELETE LEGACY TEST FOLDERS";

const args = process.argv.slice(2);
const CONFIRM = args.includes("--confirm");
const REPORT = args.includes("--report");
const INCLUDE_LEGACY = args.includes("--include-legacy-test-names");
const DRY_RUN = !CONFIRM;

const legacyPhraseIdx = args.indexOf("--confirm-legacy");
const CONFIRM_LEGACY_PHRASE =
  legacyPhraseIdx >= 0 && args[legacyPhraseIdx + 1] != null ? args[legacyPhraseIdx + 1] : null;
const LEGACY_DELETE_APPROVED =
  CONFIRM &&
  INCLUDE_LEGACY &&
  CONFIRM_LEGACY_PHRASE === REQUIRED_LEGACY_PHRASE;

const olderThanIdx = args.indexOf("--older-than-days");
const OLDER_THAN_DAYS =
  olderThanIdx >= 0 && args[olderThanIdx + 1] != null
    ? Math.max(0, Number(args[olderThanIdx + 1]) || 0)
    : null;

const cutoffMs =
  OLDER_THAN_DAYS != null ? Date.now() - OLDER_THAN_DAYS * 24 * 60 * 60 * 1000 : null;

async function dropboxRpc(accessToken, path, body) {
  const namespaceId = await getTeamNamespaceId(accessToken);
  const res = await fetch(`${DROPBOX_API}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Dropbox-API-Path-Root": JSON.stringify({
        ".tag": "namespace_id",
        namespace_id: namespaceId,
      }),
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg =
      json?.error_summary ||
      (typeof json?.error === "string" ? json.error : JSON.stringify(json?.error || text));
    throw new Error(String(msg || `Dropbox ${path} failed (${res.status})`));
  }
  return json;
}

async function listImmediateFolders(accessToken, basePath) {
  const entries = await listFolderAllEntries(accessToken, basePath, { recursive: false });
  return entries.filter((e) => e[".tag"] === "folder");
}

function folderAgeOk(entry) {
  if (cutoffMs == null) return true;
  const modified = entry.server_modified || entry.client_modified;
  if (!modified) return false;
  return new Date(modified).getTime() <= cutoffMs;
}

function segmentName(path) {
  const p = String(path || "").replace(/\/+$/, "");
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

async function deleteFolder(accessToken, path) {
  await dropboxRpc(accessToken, "files/delete_v2", { path });
}

async function scanBase(accessToken, basePath, label) {
  const folders = await listImmediateFolders(accessToken, basePath);
  const safeCanonical = [];
  const legacyReview = [];
  let skipped = 0;

  for (const entry of folders) {
    const name = segmentName(entry.path_display || entry.path_lower || entry.name);
    const { category, reason } = classifyTestArtifactName(name);

    if (category === "skipped") {
      skipped += 1;
      continue;
    }

    if (!folderAgeOk(entry)) {
      skipped += 1;
      continue;
    }

    const row = {
      label,
      name,
      path: entry.path_display || entry.path_lower,
      modified: entry.server_modified || entry.client_modified || null,
      reason,
      category,
    };

    if (category === "safe-canonical") safeCanonical.push(row);
    else legacyReview.push(row);
  }

  return { safeCanonical, legacyReview, skipped };
}

function printCategoryList(title, items, { showReason = false } = {}) {
  console.log(title);
  if (!items.length) {
    console.log("  (none)");
    return;
  }
  items.forEach((c, i) => {
    const suffix = showReason && c.reason ? ` — matched ${c.reason}` : "";
    console.log(`  ${i + 1}. ${c.name}${suffix}`);
    if (c.modified) console.log(`      modified: ${c.modified}`);
    console.log(`      path: ${c.path}`);
  });
}

function buildReport({
  mode,
  safeCanonical,
  legacyReview,
  skipped,
  deleted,
  errors,
  legacyDeleteApproved,
}) {
  const lines = [
    "",
    `## ${new Date().toISOString()} — ${mode}`,
    "",
    `- Safe canonical: ${safeCanonical.length}`,
    `- Legacy review-only: ${legacyReview.length}`,
    `- Skipped: ${skipped}`,
    `- Legacy delete approved: ${legacyDeleteApproved ? "yes" : "no"}`,
    `- Older than days: ${OLDER_THAN_DAYS ?? "any age (prefix-only)"}`,
    `- Deleted: ${deleted.length}`,
    `- Errors: ${errors.length}`,
    "",
  ];
  if (safeCanonical.length) {
    lines.push("### Safe canonical candidates", "");
    for (const c of safeCanonical) {
      lines.push(`- \`${c.path}\` (${c.reason}; ${c.modified || "unknown date"})`);
    }
    lines.push("");
  }
  if (legacyReview.length) {
    lines.push("### Legacy review-only candidates", "");
    for (const c of legacyReview) {
      lines.push(`- \`${c.path}\` (${c.reason}; ${c.modified || "unknown date"})`);
    }
    lines.push("");
  }
  if (deleted.length) {
    lines.push("### Deleted", "");
    for (const p of deleted) lines.push(`- \`${p}\``);
    lines.push("");
  }
  if (errors.length) {
    lines.push("### Errors", "");
    for (const e of errors) lines.push(`- ${e}`);
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║         Test artifact cleanup (Dropbox)                      ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`  Mode: ${DRY_RUN ? "DRY-RUN" : "CONFIRM — destructive"}`);
  console.log(`  Age filter: ${OLDER_THAN_DAYS != null ? `≥ ${OLDER_THAN_DAYS} day(s) old` : "none (prefix-only)"}`);
  if (CONFIRM && INCLUDE_LEGACY && !LEGACY_DELETE_APPROVED) {
    console.log(
      `  Legacy delete: blocked — pass --confirm-legacy "${REQUIRED_LEGACY_PHRASE}" to delete legacy candidates`
    );
  } else if (LEGACY_DELETE_APPROVED) {
    console.log("  Legacy delete: approved (phrase confirmed)");
  }
  console.log("");

  if (!dropboxConfigured()) {
    console.log("  Dropbox not configured — skipping (no DROPBOX_* env).");
    console.log("  Supabase test rows: node scripts/cleanup-test-data.mjs --audit");
    process.exit(0);
  }

  const token = await getDropboxAccessToken();
  const allSafe = [];
  const allLegacy = [];
  let totalSkipped = 0;

  for (const [label, base] of [
    ["shared-projects", DROPBOX_SHARED_PROJECTS_BASE],
    ["private-internal", DROPBOX_PRIVATE_INTERNAL_BASE],
  ]) {
    console.log(`── Scan ${label}: ${base} ──`);
    const { safeCanonical, legacyReview, skipped } = await scanBase(token, base, label);
    totalSkipped += skipped;
    allSafe.push(...safeCanonical);
    allLegacy.push(...legacyReview);
    console.log(
      `  (${safeCanonical.length} safe, ${legacyReview.length} legacy, ${skipped} skipped under this base)`
    );
    console.log("");
  }

  printCategoryList(`Safe canonical candidates:\n  count: ${allSafe.length}`, allSafe);
  console.log("");
  printCategoryList(
    `Legacy review-only candidates:\n  count: ${allLegacy.length}`,
    allLegacy,
    { showReason: true }
  );
  console.log("");
  console.log(`Skipped:\n  ${totalSkipped} folder(s)`);
  console.log("");

  const toDelete = [...allSafe];
  if (LEGACY_DELETE_APPROVED) toDelete.push(...allLegacy);

  const deleted = [];
  const errors = [];

  if (DRY_RUN) {
    console.log("No changes made.");
    if (allSafe.length || allLegacy.length) {
      console.log("\n  Safe canonical only:  npm run test:cleanup-artifacts -- --confirm");
      console.log(
        `  Include legacy:       npm run test:cleanup-artifacts -- --confirm --include-legacy-test-names --confirm-legacy "${REQUIRED_LEGACY_PHRASE}"`
      );
    }
  } else {
    if (!toDelete.length) {
      console.log("── Nothing to delete ──");
    } else {
      console.log("── Deleting ──");
      for (const c of toDelete) {
        try {
          await deleteFolder(token, c.path);
          deleted.push(c.path);
          console.log(`  ✓ deleted [${c.category}] ${c.path}`);
        } catch (e) {
          const msg = `${c.path}: ${e?.message || e}`;
          errors.push(msg);
          console.log(`  ✗ ${msg}`);
        }
      }
      if (CONFIRM && allLegacy.length && !LEGACY_DELETE_APPROVED) {
        console.log(
          `\n  ${allLegacy.length} legacy candidate(s) skipped — legacy phrase not confirmed.`
        );
      }
    }
    console.log(`\n── Done: ${deleted.length} deleted, ${errors.length} error(s) ──`);
  }

  const report = buildReport({
    mode: DRY_RUN ? "dry-run" : "confirm",
    safeCanonical: allSafe,
    legacyReview: allLegacy,
    skipped: totalSkipped,
    deleted,
    errors,
    legacyDeleteApproved: LEGACY_DELETE_APPROVED,
  });

  if (REPORT || CONFIRM) {
    try {
      appendFileSync(LOG_PATH, report);
      if (REPORT) console.log(`\n  Report appended: ${LOG_PATH}`);
    } catch (e) {
      console.warn(`  Could not write log: ${e?.message}`);
    }
  }

  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => {
  console.error("\n✗ Cleanup failed:", e?.message || e);
  process.exit(1);
});
