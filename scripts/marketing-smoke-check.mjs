#!/usr/bin/env node
/**
 * Marketing Command Centre — staging smoke check harness.
 *
 * SAFE BY DEFAULT: runs in dry-run/help mode if no staging URL is supplied.
 * Does NOT read any .env file. Does NOT apply migrations. Does NOT write data.
 * Does NOT run against production — refuses obvious localhost without explicit confirm.
 *
 * Usage:
 *   node scripts/marketing-smoke-check.mjs --help
 *   node scripts/marketing-smoke-check.mjs \
 *     --base-url=https://YOUR_STAGING_API.up.railway.app \
 *     --token=YOUR_ADMIN_JWT
 *
 * Flags:
 *   --base-url=URL     Staging API base URL (required to run checks)
 *   --token=JWT        Admin JWT for authenticated routes (required to run checks)
 *   --confirm-local    Required when base-url is localhost to acknowledge staging intent
 *   --include-writes   Print stub (write checks are manual-only — see SOP 18-08)
 *   --help             Print this help and exit
 *
 * Output: pass/fail table printed to stdout. Tokens are redacted in all output.
 *
 * NOTE: Write-flow checks (Approval → Calendar → Mark-as-posted, Package send,
 * Evergreen marking, Attribution seed) are NOT covered by this harness. Those require
 * manual execution per SOP 18-08 (docs/sops/18_marketing_agent/18-08_staging_runtime_smoke_checklist.md).
 */

import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
const { values: flags } = parseArgs({
  options: {
    "base-url":        { type: "string" },
    "token":           { type: "string" },
    "confirm-local":   { type: "boolean", default: false },
    "include-writes":  { type: "boolean", default: false },
    "help":            { type: "boolean", default: false },
  },
  allowPositionals: false,
  strict: false,
});

const HELP = `
Marketing Command Centre — staging smoke check harness

Usage:
  node scripts/marketing-smoke-check.mjs [flags]

Required flags (to run checks):
  --base-url=URL     Staging API base URL
                     e.g. https://blh-staging.up.railway.app
                     e.g. http://localhost:8787 (requires --confirm-local)
  --token=JWT        Admin JWT for authenticated routes (redacted in output)

Optional flags:
  --confirm-local    Acknowledge localhost is a staging instance (not production)
  --include-writes   Print write-flow check stubs (all are manual-only)
  --help             Print this help and exit

Examples:
  # Dry run (no URL supplied — prints help):
  node scripts/marketing-smoke-check.mjs

  # Staging remote:
  node scripts/marketing-smoke-check.mjs \\
    --base-url=https://blh-staging.up.railway.app \\
    --token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

  # Local staging:
  node scripts/marketing-smoke-check.mjs \\
    --base-url=http://localhost:8787 \\
    --confirm-local \\
    --token=eyJ...

Write-flow checks require manual execution per SOP 18-08.
`.trim();

if (flags.help || !flags["base-url"] || !flags["token"]) {
  console.log(HELP);
  if (!flags.help && (!flags["base-url"] || !flags["token"])) {
    console.log("\n[DRY RUN] No --base-url or --token supplied. Exiting without running checks.");
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Safety guards
// ---------------------------------------------------------------------------
const baseUrl = flags["base-url"].replace(/\/$/, "");
const rawToken = flags["token"];

const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(baseUrl);
if (isLocalhost && !flags["confirm-local"]) {
  console.error(
    "\n[SAFETY] --base-url is localhost. If this is a local staging instance (not production),\n" +
    "         re-run with --confirm-local to acknowledge.\n" +
    "         Do NOT use this harness against a locally-running production app.\n"
  );
  process.exit(1);
}

// Redact token in all output
const redactedToken = rawToken.slice(0, 8) + "…[REDACTED]";
console.log(`\nMarketing Command Centre — Staging Smoke Check`);
console.log(`Base URL : ${baseUrl}`);
console.log(`Token    : ${redactedToken}`);
console.log(`Mode     : read-only endpoint checks`);
console.log(`─`.repeat(60));

// ---------------------------------------------------------------------------
// Read-only endpoints to check
// ---------------------------------------------------------------------------
const ENDPOINTS = [
  {
    label:   "Command Centre snapshot",
    path:    "/api/marketing/command-centre",
    auth:    true,
    checks:  [
      (body) => body.ok === true,
      (body) => !body.data?.demo,   // must not be demo banner
    ],
    checkLabels: ["ok:true", "not demo"],
  },
  {
    label:   "Campaign templates (7 expected)",
    path:    "/api/marketing/templates",
    auth:    true,
    checks:  [
      (body) => body.ok === true,
      (body) => Array.isArray(body.data) && body.data.length === 7,
    ],
    checkLabels: ["ok:true", "length=7"],
  },
  {
    label:   "Weekly planner",
    path:    "/api/marketing/planner",
    auth:    true,
    checks:  [
      (body) => body.ok === true,
    ],
    checkLabels: ["ok:true"],
  },
  {
    label:   "Content packages list",
    path:    "/api/marketing/packages",
    auth:    true,
    checks:  [
      (body) => body.ok === true,
    ],
    checkLabels: ["ok:true"],
  },
  {
    label:   "Calendar events",
    path:    "/api/marketing/calendar",
    auth:    true,
    checks:  [
      (body) => body.ok === true,
    ],
    checkLabels: ["ok:true"],
  },
  {
    label:   "Evergreen library",
    path:    "/api/marketing/evergreen",
    auth:    true,
    checks:  [
      (body) => body.ok === true,
    ],
    checkLabels: ["ok:true"],
  },
  {
    label:   "Intelligence dashboard",
    path:    "/api/marketing/intelligence",
    auth:    true,
    checks:  [
      (body) => body.ok === true,
      (body) => !body.data?.demo,
    ],
    checkLabels: ["ok:true", "not demo"],
  },
  {
    label:   "Attribution (30d)",
    path:    "/api/marketing/attribution?days=30",
    auth:    true,
    checks:  [
      (body) => body.ok === true,
      (body) => !body.data?.demo,
    ],
    checkLabels: ["ok:true", "not demo"],
  },
  {
    label:   "Admin gate (401 check — no token)",
    path:    "/api/marketing/command-centre",
    auth:    false,
    checks:  [
      (body, status) => status === 401 || status === 403,
    ],
    checkLabels: ["401/403 without token"],
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
const PASS = "PASS";
const FAIL = "FAIL";
const WARN = "WARN";

const results = [];

for (const ep of ENDPOINTS) {
  const url = `${baseUrl}${ep.path}`;
  const headers = { "Content-Type": "application/json" };
  if (ep.auth) headers["Authorization"] = `Bearer ${rawToken}`;

  let status, body, error;
  try {
    const res = await fetch(url, { headers });
    status = res.status;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
  } catch (e) {
    error = e.message;
  }

  if (error) {
    results.push({ label: ep.label, result: FAIL, detail: `Fetch error: ${error}` });
    continue;
  }

  const checkResults = ep.checks.map((fn, i) => {
    let passed;
    try {
      passed = fn(body ?? {}, status);
    } catch {
      passed = false;
    }
    return { label: ep.checkLabels[i] ?? `check-${i}`, passed };
  });

  const allPass = checkResults.every((c) => c.passed);
  const failed = checkResults.filter((c) => !c.passed).map((c) => c.label);

  results.push({
    label:  ep.label,
    result: allPass ? PASS : FAIL,
    detail: allPass
      ? `HTTP ${status}`
      : `HTTP ${status} — failed: ${failed.join(", ")}`,
  });
}

// ---------------------------------------------------------------------------
// Write-flow stubs (if requested)
// ---------------------------------------------------------------------------
const WRITE_STUBS = [
  "Package send → marketing_content_packages row created",
  "Approval decision (approve/reject) cascades to child items",
  "Calendar schedule → Mark as posted → social_post_publishes (publish_mode=manual)",
  "Evergreen marking → evergreen_score persists",
  "Attribution display reflects seeded known+unknown source leads",
];

if (flags["include-writes"]) {
  for (const stub of WRITE_STUBS) {
    results.push({
      label:  `[MANUAL] ${stub}`,
      result: WARN,
      detail: "Not implemented — manual only. Run SOP 18-08.",
    });
  }
}

// ---------------------------------------------------------------------------
// Print table
// ---------------------------------------------------------------------------
const pad = (s, n) => s.slice(0, n).padEnd(n);
const COL1 = 46, COL2 = 6, COL3 = 52;

console.log(`\n${pad("Endpoint / check", COL1)} ${pad("Result", COL2)} ${"Detail"}`);
console.log(`${"─".repeat(COL1)} ${"─".repeat(COL2)} ${"─".repeat(COL3)}`);

for (const r of results) {
  const icon = r.result === PASS ? "✓" : r.result === WARN ? "?" : "✗";
  console.log(`${pad(r.label, COL1)} ${icon} ${pad(r.result, COL2-2)}  ${r.detail}`);
}

const passCount = results.filter((r) => r.result === PASS).length;
const failCount = results.filter((r) => r.result === FAIL).length;
const warnCount = results.filter((r) => r.result === WARN).length;

console.log(`\n${"─".repeat(COL1 + COL2 + COL3 + 2)}`);
console.log(`PASS: ${passCount}  FAIL: ${failCount}  MANUAL: ${warnCount}`);

if (failCount > 0) {
  console.log(`\n[RESULT] BLOCK — ${failCount} check(s) failed. Do not proceed to merge prep.`);
  console.log(`         Fix failures, re-run smoke harness, then re-check SOP 18-08 write flows.`);
} else {
  console.log(`\n[RESULT] READ-ONLY CHECKS CLEAR — run SOP 18-08 write-flow checks manually before marking ACCEPT.`);
}

console.log(`\nWrite-flow verification (Approval → Calendar → Mark-as-posted, Package send,`);
console.log(`Evergreen, Attribution seed) requires manual execution per:`);
console.log(`  docs/sops/18_marketing_agent/18-08_staging_runtime_smoke_checklist.md\n`);
