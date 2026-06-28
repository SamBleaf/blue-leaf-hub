#!/usr/bin/env node
/* global process, console */
/**
 * hardening-watch.mjs — local watch orchestrator for the autonomous hardening loop.
 *
 * Spec: docs/qa/HARDENING_WATCH_ORCHESTRATOR_SPEC.md
 * Source of truth: docs/qa/hardening_loop/*  (this script NEVER replaces those files).
 *
 * Built modes:
 *   --dry-run      Read handoff state, validate, print next agent/task + allowed/forbidden +
 *                  run-mode blockers. Runs no agents. Writes no files. (default if no mode given)
 * Stubbed modes (documented, not implemented):
 *   --run-once     One supervised cycle.
 *   --interval=N   Continuous every N minutes.
 *
 * Dry-run exit codes:
 *   0  state valid AND no run-mode blockers  → ready to run
 *   1  invalid/missing/contradictory state or missing required handoff file → broken setup
 *   2  state valid but a run-mode blocker is present (dirty tree / approval gate / sam / etc.)
 *   3  unimplemented mode (--run-once / --interval)
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");
const LOOP_DIR = join(REPO_ROOT, "docs", "qa", "hardening_loop");

const REQUIRED_FILES = [
  "CURRENT_STATE.md",
  "AUTONOMOUS_LOOP_STATUS.md",
  "NEXT_CURSOR_TASK.md",
  "NEXT_CLAUDE_REVIEW.md",
  "AGENT_HANDOFF_LOG.md",
  "SAM_APPROVAL_REQUIRED.md",
];

const REQUIRED_FIELDS = [
  "loop_enabled",
  "next_agent",
  "current_wave",
  "current_task_file",
  "fix_mode_allowed",
  "product_code_changes_allowed",
  "approval_required",
  "live_integrations_allowed",
  "deploy_allowed",
  "max_iterations_this_session",
  "expected_branch",
];

// Fields that must agree between CURRENT_STATE and AUTONOMOUS_LOOP_STATUS.
const SHARED_FIELDS = [
  "loop_enabled",
  "next_agent",
  "current_wave",
  "approval_required",
  "fix_mode_allowed",
  "product_code_changes_allowed",
  "live_integrations_allowed",
  "deploy_allowed",
  "expected_branch",
];

const SAFE_TASK_CLASSES = [
  "no-code audit",
  "documentation update",
  "bug register update",
  "test-only change",
  "UI Review screenshot capture",
  "visual evidence indexing",
  "read-only API smoke",
  "lint/build verification",
  "approved presentational UI polish",
  "Claude review/planning",
  "Cursor execution of an approved packet",
];

const FORBIDDEN_TASK_CLASSES = [
  "Critical/High fix without an approved bug ID",
  "production-data mutation",
  "live integrations / sending email / RFQ send / PO generation",
  "Buildxact / Xero sync / Dropbox write flow",
  "schema migration / auth-security logic change",
  "finance calculations / payroll-timesheet approval logic",
  "client-portal invite / real-client pilot",
  "deploy / destructive command / broad refactor / route-table rename",
  "accepted-gap closure / business-workflow decision",
];

function parseArgs(argv) {
  const args = { mode: "dry-run", intervalMinutes: null };
  for (const a of argv) {
    if (a === "--dry-run") args.mode = "dry-run";
    else if (a === "--run-once") args.mode = "run-once";
    else if (a.startsWith("--interval")) {
      args.mode = "interval";
      const m = a.match(/--interval=(\d+)/);
      args.intervalMinutes = m ? Number(m[1]) : 30;
    }
  }
  return args;
}

function coerce(raw) {
  const v = raw.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  return v;
}

/** Parse the leading `---` front-matter block into a flat object. */
function parseFrontMatter(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0].trim() !== "---") return { ok: false, data: {} };
  const data = {};
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "---") return { ok: true, data };
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    data[key] = coerce(value);
  }
  return { ok: false, data }; // no closing fence
}

function readFileSafe(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function gitInfo() {
  const info = { branch: null, dirty: null, error: null };
  try {
    info.branch = execSync("git branch --show-current", {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
    const status = execSync("git status --short", {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    info.dirty = status.trim().length > 0;
    info.statusText = status.trim();
  } catch (e) {
    info.error = e.message;
  }
  return info;
}

function line(char = "─", n = 70) {
  return char.repeat(n);
}

function printList(title, items) {
  console.log(`\n${title}`);
  for (const it of items) console.log(`  • ${it}`);
}

function dryRun() {
  const configErrors = [];
  const blockers = [];

  console.log(line("═"));
  console.log("  HARDENING WATCH — DRY RUN (reads only; mutates nothing)");
  console.log(`  loop dir: docs/qa/hardening_loop/`);
  console.log(line("═"));

  // 1) required files present
  const missing = REQUIRED_FILES.filter((f) => !existsSync(join(LOOP_DIR, f)));
  if (missing.length) configErrors.push(`Missing handoff files: ${missing.join(", ")}`);

  // 2) parse state files
  const stateRaw = readFileSafe(join(LOOP_DIR, "CURRENT_STATE.md"));
  const statusRaw = readFileSafe(join(LOOP_DIR, "AUTONOMOUS_LOOP_STATUS.md"));
  const state = stateRaw ? parseFrontMatter(stateRaw) : { ok: false, data: {} };
  const status = statusRaw ? parseFrontMatter(statusRaw) : { ok: false, data: {} };

  if (!state.ok) configErrors.push("CURRENT_STATE.md has no valid YAML front-matter block");
  if (!status.ok) configErrors.push("AUTONOMOUS_LOOP_STATUS.md has no valid YAML front-matter block");

  const s = state.data;

  // 3) required fields
  for (const f of REQUIRED_FIELDS) {
    if (!(f in s)) configErrors.push(`CURRENT_STATE.md missing field: ${f}`);
  }

  // 4) enum + type sanity
  if ("next_agent" in s && !["cursor", "claude", "sam"].includes(s.next_agent)) {
    configErrors.push(`next_agent invalid: ${s.next_agent} (expected cursor|claude|sam)`);
  }
  for (const b of [
    "loop_enabled",
    "fix_mode_allowed",
    "product_code_changes_allowed",
    "approval_required",
    "live_integrations_allowed",
    "deploy_allowed",
  ]) {
    if (b in s && typeof s[b] !== "boolean") configErrors.push(`${b} must be true/false`);
  }

  // 5) contradictions
  if (s.fix_mode_allowed === true && s.product_code_changes_allowed === false) {
    configErrors.push("contradiction: fix_mode_allowed=true but product_code_changes_allowed=false");
  }
  if (s.deploy_allowed === true) {
    configErrors.push("contradiction: deploy_allowed=true (deploy is never auto-allowed)");
  }
  if (s.approval_required === true && s.next_agent !== "sam") {
    configErrors.push("contradiction: approval_required=true but next_agent is not sam");
  }

  // 6) cross-file agreement
  if (state.ok && status.ok) {
    for (const f of SHARED_FIELDS) {
      if (f in s && f in status.data && s[f] !== status.data[f]) {
        configErrors.push(
          `state mismatch on ${f}: CURRENT_STATE=${s[f]} vs AUTONOMOUS_LOOP_STATUS=${status.data[f]}`,
        );
      }
    }
  }

  // 7) approval stub active?
  const approvalRaw = readFileSafe(join(LOOP_DIR, "SAM_APPROVAL_REQUIRED.md"));
  const approval = approvalRaw ? parseFrontMatter(approvalRaw) : { ok: false, data: {} };
  const approvalActive = approval.data.active === true;

  // ---- report: identity
  console.log(`\n  next_agent        : ${s.next_agent ?? "?"}`);
  console.log(`  current_wave      : ${s.current_wave ?? "?"}`);
  console.log(`  current_task_file : ${s.current_task_file ?? "?"}`);
  console.log(`  expected_branch   : ${s.expected_branch ?? "?"}`);
  console.log(`  loop_enabled      : ${s.loop_enabled ?? "?"}`);
  console.log(`  fix_mode_allowed  : ${s.fix_mode_allowed ?? "?"}`);
  console.log(`  product_code_changes_allowed : ${s.product_code_changes_allowed ?? "?"}`);

  // 8) git preflight → run-mode blockers
  const git = gitInfo();
  if (git.error) {
    blockers.push(`git unavailable: ${git.error}`);
  } else {
    console.log(`\n  git branch        : ${git.branch}`);
    console.log(`  working tree      : ${git.dirty ? "DIRTY" : "clean"}`);
    if ("expected_branch" in s && git.branch !== s.expected_branch) {
      blockers.push(`branch ${git.branch} != expected_branch ${s.expected_branch}`);
    }
    if (git.dirty) blockers.push("working tree is dirty (run-once/interval require a clean tree)");
  }

  // 9) other run-mode blockers
  if (s.loop_enabled === false) blockers.push("loop_enabled=false");
  if (s.next_agent === "sam") blockers.push("next_agent=sam (Sam must act)");
  if (s.approval_required === true) blockers.push("approval_required=true");
  if (approvalActive) blockers.push("SAM_APPROVAL_REQUIRED.md is active");
  if (s.current_task_file && !existsSync(join(REPO_ROOT, s.current_task_file))) {
    blockers.push(`current_task_file not found on disk: ${s.current_task_file}`);
  }

  printList("ALLOWED autonomous task classes:", SAFE_TASK_CLASSES);
  printList("FORBIDDEN (stop + write SAM_APPROVAL_REQUIRED.md):", FORBIDDEN_TASK_CLASSES);

  // ---- verdict
  console.log(`\n${line()}`);
  if (configErrors.length) {
    printList("CONFIG ERRORS (exit 1 — broken setup):", configErrors);
    console.log(line("═"));
    return 1;
  }
  if (blockers.length) {
    printList("RUN-MODE BLOCKERS (exit 2 — would not run):", blockers);
    console.log("\n  Dry-run is advisory: it reports blockers, it does not act on them.");
    console.log(line("═"));
    return 2;
  }
  console.log("  READY (exit 0): state valid, no run-mode blockers.");
  console.log(`  Next: ${s.next_agent} executes ${s.current_task_file}`);
  console.log(line("═"));
  return 0;
}

function notImplemented(mode) {
  console.log(line("═"));
  console.log(`  HARDENING WATCH — ${mode}`);
  console.log("  NOT IMPLEMENTED — supervised build pending.");
  console.log("  Progression: prove --dry-run stable → add --run-once → only then --interval=N.");
  console.log("  See docs/qa/HARDENING_WATCH_ORCHESTRATOR_SPEC.md §10.");
  console.log(line("═"));
  return 3;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let code;
  if (args.mode === "dry-run") code = dryRun();
  else if (args.mode === "run-once") code = notImplemented("--run-once");
  else code = notImplemented(`--interval=${args.intervalMinutes}`);
  process.exit(code);
}

main();
