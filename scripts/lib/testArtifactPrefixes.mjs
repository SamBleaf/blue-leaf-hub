/**
 * Test artifact folder name classification for Dropbox cleanup.
 * Used by cleanup-test-artifacts.mjs — adopt canonical names in new tests.
 */

/** New tests should prefer __BLH TEST__/<suite>/<timestamp>_<suffix>/ */
export const PRIMARY_TEST_PREFIX = "__BLH TEST__";

/** @typedef {'safe-canonical' | 'legacy-review-only' | 'skipped'} TestArtifactCategory */

/**
 * Safe canonical — deletable with `--confirm` only.
 * @type {{ pattern: RegExp, reason: string }[]}
 */
export const SAFE_CANONICAL_MATCHERS = [
  { pattern: /^BLH TEST\b/i, reason: "BLH TEST prefix" },
  { pattern: /^__BLH TEST/i, reason: "__BLH TEST prefix" },
  { pattern: /^__BLH_TEST/i, reason: "__BLH_TEST prefix" },
  { pattern: /^__HARDENING TEST/i, reason: "__HARDENING TEST prefix" },
];

/**
 * Legacy review-only — listed in dry-run; deletable only with
 * `--confirm --include-legacy-test-names --confirm-legacy "DELETE LEGACY TEST FOLDERS"`.
 * @type {{ pattern: RegExp, reason: string }[]}
 */
export const LEGACY_REVIEW_MATCHERS = [
  { pattern: /^BATCHA\b/i, reason: "BATCHA prefix + timestamp" },
  { pattern: /^BATCH A\b/i, reason: "BATCH A prefix" },
  { pattern: /^__BATCH_A__/i, reason: "__BATCH_A__ prefix" },
  { pattern: /^__BATCH A/i, reason: "__BATCH A prefix" },
  { pattern: /^__E2E/i, reason: "__E2E prefix" },
  { pattern: /^E2E\b/i, reason: "E2E prefix" },
  { pattern: /^DEBUG2\b/i, reason: "DEBUG2 prefix" },
  { pattern: /^DEBUG\b/i, reason: "DEBUG prefix" },
  { pattern: /^__P0A5\b/i, reason: "__P0A5 prefix" },
  { pattern: /^__DRYRUN/i, reason: "__DRYRUN prefix" },
  { pattern: /^__DEMO\b/i, reason: "__DEMO prefix" },
  { pattern: /^__RFQ TEST/i, reason: "__RFQ TEST prefix" },
  {
    pattern: /^\d{13}\s+TEST STREET\b/i,
    reason: "timestamp + TEST STREET",
  },
  {
    pattern: /^\d{13}\s+TEST\s+(ST(REET)?|ROAD|LANE|AVE(NUE)?)\b/i,
    reason: "timestamp + test address marker",
  },
  {
    pattern: /^\d{13}\s+.*\bTEST\b/i,
    reason: "timestamp + TEST marker in address",
  },
];

/** @deprecated Use classifyTestArtifactName — kept for docs/log compatibility */
export const ALLOWED_TEST_PREFIXES = [
  PRIMARY_TEST_PREFIX,
  "__BLH TEST",
  "BLH TEST",
  "__HARDENING TEST__",
  "__HARDENING TEST",
  "BATCHA",
  "BATCH A",
  "__BATCH_A__",
  "__BATCH A",
  "__E2E",
  "E2E",
  "DEBUG2",
  "DEBUG",
  "__P0A5",
  "__DRYRUN",
  "__DEMO",
  "__RFQ TEST",
];

/**
 * Classify a Dropbox folder/file display name.
 * @param {string} name — last path segment
 * @returns {{ category: TestArtifactCategory, reason: string }}
 */
export function classifyTestArtifactName(name) {
  const n = String(name || "").trim();
  if (!n) return { category: "skipped", reason: "empty name" };

  for (const { pattern, reason } of SAFE_CANONICAL_MATCHERS) {
    if (pattern.test(n)) return { category: "safe-canonical", reason };
  }
  for (const { pattern, reason } of LEGACY_REVIEW_MATCHERS) {
    if (pattern.test(n)) return { category: "legacy-review-only", reason };
  }
  return { category: "skipped", reason: "no test marker pattern" };
}

/**
 * @param {string} name
 * @returns {boolean} true if safe-canonical or legacy-review-only
 */
export function isTestArtifactName(name) {
  const { category } = classifyTestArtifactName(name);
  return category === "safe-canonical" || category === "legacy-review-only";
}

/**
 * Build a recommended test job address for new hardening tests.
 * @param {{ suite: string, workflowId?: string, ts?: number }} opts
 */
export function buildTestJobAddress({ suite, workflowId = "", ts = Date.now() }) {
  const wf = workflowId ? `${workflowId} ` : "";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${PRIMARY_TEST_PREFIX} ${suite} ${wf}${ts}_${suffix}, Adelaide SA 5000`.replace(/_/g, " ");
}
