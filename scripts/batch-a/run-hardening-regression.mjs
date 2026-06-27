#!/usr/bin/env node
/**
 * TEST-REGRESSION-SUITE-01 — Hardening regression meta-runner (W06–W18)
 *
 * Groups existing batch-a / RFQ test scripts into one report.
 * Does NOT merge test logic — spawns existing runners only.
 *
 *   node scripts/batch-a/run-hardening-regression.mjs              # gap baselines
 *   node scripts/batch-a/run-hardening-regression.mjs --write      # fixture writes
 *   node scripts/batch-a/run-hardening-regression.mjs --write --chains  # + journey chains
 *   node scripts/batch-a/run-hardening-regression.mjs --only W06,W07
 *
 * Excluded: W17 (Claude-owned — not in matrix without owner approval)
 */
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";
import { ensureE2EUsers } from "../create-e2e-users.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHAINS = process.argv.includes("--chains");
const ONLY = (() => {
  const idx = process.argv.indexOf("--only");
  if (idx === -1 || !process.argv[idx + 1]) return null;
  return new Set(process.argv[idx + 1].split(",").map((s) => s.trim().toUpperCase()));
})();

/** @type {Array<{ workflow: string, name: string, cmd: string[], writeOnly?: boolean, gap?: string, skip?: boolean }>} */
const SUITES = [
  // W06 — RFQ package / scope
  { workflow: "W06", name: "job spine (W04/W06)", cmd: ["node", "scripts/batch-a/run-w04-w06-job-spine.mjs"] },
  { workflow: "W06", name: "package shape", cmd: ["node", "scripts/batch-a/run-w06-shape.mjs"] },
  { workflow: "W06", name: "package finalize", cmd: ["node", "scripts/batch-a/run-w06-finalize.mjs"] },

  // W07 — send / match
  { workflow: "W07", name: "IMAP matcher (unit)", cmd: ["node", "scripts/test-imap-quote-match.mjs", "--strict"] },
  { workflow: "W07", name: "engine send baseline", cmd: ["node", "scripts/batch-a/run-w07-send-baseline.mjs"] },
  {
    workflow: "W07",
    name: "unmatched resolve API",
    cmd: ["node", "scripts/test-rfq-unmatched-resolve.mjs"],
    gap: "always writes DB fixtures; requires API + Supabase service role",
  },

  // W08 — accept / quote readiness
  { workflow: "W08", name: "accept alignment", cmd: ["node", "scripts/batch-a/run-w08-accept-alignment.mjs"] },
  { workflow: "W08", name: "win quote readiness", cmd: ["node", "scripts/batch-a/run-w08-win-quote-readiness.mjs"] },

  // W09 — win / ops readiness
  { workflow: "W09", name: "ops readiness checklist", cmd: ["node", "scripts/batch-a/run-w09-ops-readiness.mjs"] },
  { workflow: "W09", name: "win/lose finalize", cmd: ["node", "scripts/batch-a/run-w05-win-finalize.mjs"] },

  // W10–W15 — ops baselines
  {
    workflow: "W10",
    name: "procurement baseline",
    cmd: ["node", "scripts/batch-a/run-w10-procurement-baseline.mjs"],
    writeOnly: true,
    gap: "write-only script — no read-only npm alias",
  },
  { workflow: "W11", name: "batch PO + security", cmd: ["node", "scripts/batch-a/run-w11-batch-po.mjs"] },
  { workflow: "W12", name: "schedule auth", cmd: ["node", "scripts/batch-a/run-w12-schedule-auth.mjs"] },
  { workflow: "W13", name: "site diary baseline", cmd: ["node", "scripts/batch-a/run-w13-site-diary-baseline.mjs"] },
  { workflow: "W14", name: "WHS baseline", cmd: ["node", "scripts/batch-a/run-w14-whs-baseline.mjs"] },
  { workflow: "W15", name: "timesheet auth", cmd: ["node", "scripts/batch-a/run-w15-timesheet-auth.mjs"] },

  // W16 — allocation (safe; migration 117)
  {
    workflow: "W16",
    name: "allocation baseline",
    cmd: ["node", "scripts/batch-a/run-w16-allocation-baseline.mjs"],
    gap: "requires migration 117; skips gracefully if schema missing",
  },

  // W17 — explicitly excluded
  {
    workflow: "W17",
    name: "workforce (Claude-owned)",
    cmd: [],
    skip: true,
    gap: "excluded per hardening scout — Claude/W17 owner approval required",
  },

  // W18 — portal automated (API scripts only; no Playwright in default run)
  { workflow: "W18", name: "portal void guard", cmd: ["node", "scripts/batch-a/run-w18-portal-void-guard.mjs"] },
  { workflow: "W18", name: "portal photo visibility", cmd: ["node", "scripts/batch-a/run-w18-portal-photo-visibility.mjs"] },
  { workflow: "W18", name: "portal finance notify", cmd: ["node", "scripts/batch-a/run-w18-portal-finance-notify.mjs"] },
  { workflow: "W18", name: "portal legacy JWT", cmd: ["node", "scripts/batch-a/run-w18-portal-sec04-legacy-jwt.mjs"] },
  { workflow: "W18", name: "portal invite API", cmd: ["node", "scripts/batch-a/run-w18-portal-api01-invite.mjs"] },
  {
    workflow: "W18",
    name: "portal admin UI (Playwright)",
    cmd: [],
    skip: true,
    gap: "manual/E2E — run separately: npm run test:w18-portal-ui01",
  },
];

/** Optional long chains (cross-workflow) */
const CHAIN_SUITES = [
  { workflow: "X-CHAIN", name: "JOURNEY-B RFQ money path", cmd: ["node", "scripts/batch-a/run-test-journey-b-01.mjs"] },
  { workflow: "X-CHAIN", name: "WIN-FINALIZE batch", cmd: ["node", "scripts/batch-a/run-test-win-finalize-01.mjs"] },
];

function parseSummary(text) {
  const m = text.match(/Passed:\s*(\d+)\s+Failed:\s*(\d+)\s+Skipped:\s*(\d+)(?:\s+Gap-documented:\s*(\d+))?/);
  if (!m) return null;
  return {
    passed: Number(m[1]),
    failed: Number(m[2]),
    skipped: Number(m[3]),
    gap: Number(m[4] || 0),
  };
}

function runSuite(suite, write) {
  if (suite.skip) {
    return { status: "gap", reason: suite.gap || "skipped" };
  }
  if (suite.writeOnly && !write) {
    return { status: "gap", reason: suite.gap || "requires --write" };
  }
  if (suite.gap && !write && suite.cmd.length === 0) {
    return { status: "gap", reason: suite.gap };
  }
  if (!suite.cmd.length) {
    return { status: "gap", reason: suite.gap || "no command" };
  }

  const args = [...suite.cmd];
  if (write && !args.includes("--write") && !args.includes("--strict")) {
    args.push("--write");
  }

  const started = Date.now();
  const result = spawnSync(args[0], args.slice(1), {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const out = `${result.stdout || ""}\n${result.stderr || ""}`;
  const summary = parseSummary(out);

  if (result.status === 0) {
    return { status: "pass", elapsed, summary, tail: out.slice(-300) };
  }
  return {
    status: "fail",
    elapsed,
    summary,
    exitCode: result.status,
    tail: out.slice(-500),
  };
}

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║     TEST-REGRESSION-SUITE-01 — Hardening meta-runner       ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write" : "read-only + gap baselines"}`);
console.log(`  Chains: ${CHAINS ? "yes" : "no (pass --chains to include)"}`);
console.log(`  Filter: ${ONLY ? [...ONLY].join(", ") : "all W06–W18"}`);
console.log(`  Time: ${new Date().toLocaleString("en-AU")}`);

const run = createRunner();
run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

// BLH-E2E-CLAUDE-001: ensure users once; child suites must not rotate passwords per call.
try {
  await ensureE2EUsers();
  run.pass("E2E users ensured (stable passwords)");
} catch (e) {
  run.fail("E2E users ensure", e.message);
  process.exit(1);
}

const allSuites = [...SUITES, ...(CHAINS ? CHAIN_SUITES : [])];
const results = [];
let totalPass = 0;
let totalFail = 0;
let totalGap = 0;

for (const suite of allSuites) {
  if (ONLY && !ONLY.has(suite.workflow) && suite.workflow !== "X-CHAIN") continue;

  run.section(`${suite.workflow} — ${suite.name}`);

  if (suite.skip || (suite.gap && suite.cmd.length === 0)) {
    run.gap(`${suite.workflow} ${suite.name}`, suite.gap || "excluded");
    results.push({ ...suite, status: "gap" });
    totalGap++;
    continue;
  }

  const r = runSuite(suite, WRITE);
  results.push({ ...suite, ...r });

  if (r.status === "pass") {
    const detail = r.summary
      ? `${r.summary.passed} pass / ${r.summary.failed} fail / ${r.summary.gap} gap (${r.elapsed}s)`
      : `${r.elapsed}s`;
    run.pass(`${suite.workflow} ${suite.name} — ${detail}`);
    totalPass++;
  } else if (r.status === "gap") {
    run.gap(`${suite.workflow} ${suite.name}`, r.reason);
    totalGap++;
  } else {
    run.fail(
      `${suite.workflow} ${suite.name}`,
      r.summary
        ? `exit ${r.exitCode}; ${r.summary.failed} failed (${r.elapsed}s)`
        : `exit ${r.exitCode} (${r.elapsed}s)`
    );
    totalFail++;
  }
}

console.log("\n── Regression matrix ────────────────────────────────────────");
console.log("  Workflow | Suite                          | Result");
console.log("  ---------|--------------------------------|--------");
for (const r of results) {
  const name = r.name.padEnd(30).slice(0, 30);
  const wf = r.workflow.padEnd(8);
  const st =
    r.status === "pass" ? "PASS" : r.status === "gap" ? "GAP " : "FAIL";
  console.log(`  ${wf} | ${name} | ${st}`);
}

console.log("\n── TEST-REGRESSION-SUITE-01 Summary ─────────────────────────");
console.log(`  Suites pass: ${totalPass}  fail: ${totalFail}  gap: ${totalGap}`);
console.log(`  W17 excluded: yes (Claude-owned)`);

if (totalFail > 0) {
  console.log("\n  Failed suites — tail output:");
  for (const r of results.filter((x) => x.status === "fail")) {
    console.log(`\n  ▼ ${r.workflow} ${r.name}`);
    if (r.tail) console.log(r.tail);
  }
}

process.exit(totalFail > 0 ? 1 : 0);
