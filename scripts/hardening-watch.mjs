#!/usr/bin/env node
/* global process, console, setTimeout */
/**
 * hardening-watch.mjs — local supervised orchestrator for the autonomous hardening loop.
 *
 * Spec: docs/qa/HARDENING_WATCH_ORCHESTRATOR_SPEC.md
 * Source of truth: docs/qa/hardening_loop/*  (this script NEVER replaces those files; it reads
 * them, validates, invokes the next agent via a configurable command template, and validates
 * the result. It only writes its own bookkeeping: ORCHESTRATOR_BLOCKED.md and, on a hard stop,
 * the next_agent/approval_required fields.)
 *
 * Modes:
 *   --dry-run      Validate state; print next agent/task + allowed/forbidden + invocation
 *                  availability. Runs nothing. Writes nothing.   (default)
 *   --run-once     One supervised cycle: preflight → invoke next agent → validate result → stop.
 *   --interval=N   Repeat run-once every N minutes until a stop condition.
 *
 * Agent invocation is HONEST: it only runs the commands in HARDENING_CURSOR_CMD /
 * HARDENING_CLAUDE_CMD (template placeholders: {{TASK_FILE}}, {{AGENT}}, {{WAVE}}). If the
 * relevant template is unset, the watcher prints the exact packet/command, writes
 * ORCHESTRATOR_BLOCKED.md ("agent invocation not configured"), and stops cleanly.
 *
 * Exit codes:
 *   0  dry-run READY, or run-once completed one handoff, or interval finished cleanly
 *   1  invalid/contradictory state config (broken setup)
 *   2  run-mode blocker present / Sam gate (approval, next_agent:sam, dirty tree, branch, ...)
 *   3  unimplemented (reserved)
 *   4  agent invocation not configured (handoff detected, nothing run)
 *   5  agent command failed
 *   6  post-run validation failed (result rejected)
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config as loadEnv } from "dotenv";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");
const LOOP_DIR = join(REPO_ROOT, "docs", "qa", "hardening_loop");

// Optional ergonomic config: load HARDENING_* command templates from a local env file
// (gitignored) so the user sets them once instead of exporting each run. Never overrides
// values already present in the real environment. No-ops if the file is absent.
loadEnv({ path: process.env.HARDENING_WATCH_ENV || join(SCRIPT_DIR, "hardening-watch.env"), override: false });
const STATE_FILE = join(LOOP_DIR, "CURRENT_STATE.md");
const STATUS_FILE = join(LOOP_DIR, "AUTONOMOUS_LOOP_STATUS.md");
const APPROVAL_FILE = join(LOOP_DIR, "SAM_APPROVAL_REQUIRED.md");
const LOG_FILE = join(LOOP_DIR, "AGENT_HANDOFF_LOG.md");
const BLOCKED_FILE = join(LOOP_DIR, "ORCHESTRATOR_BLOCKED.md");

const REQUIRED_FILES = [
  "CURRENT_STATE.md",
  "AUTONOMOUS_LOOP_STATUS.md",
  "NEXT_CURSOR_TASK.md",
  "NEXT_CLAUDE_REVIEW.md",
  "AGENT_HANDOFF_LOG.md",
  "SAM_APPROVAL_REQUIRED.md",
];

const REQUIRED_FIELDS = [
  "loop_enabled", "next_agent", "current_wave", "current_task_file",
  "fix_mode_allowed", "product_code_changes_allowed", "approval_required",
  "live_integrations_allowed", "deploy_allowed", "max_iterations_this_session",
  "expected_branch",
];

const SHARED_FIELDS = [
  "loop_enabled", "next_agent", "current_wave", "approval_required",
  "fix_mode_allowed", "product_code_changes_allowed", "live_integrations_allowed",
  "deploy_allowed", "expected_branch",
];

const SAFE_TASK_CLASSES = [
  "no-code audit", "documentation update", "bug register update", "test-only change",
  "UI Review screenshot capture", "visual evidence indexing", "read-only API smoke",
  "lint/build verification", "approved presentational UI polish", "Claude review/planning",
  "Cursor execution of an approved packet",
];

const FORBIDDEN_TASK_CLASSES = [
  "Critical/High fix without an approved bug ID", "production-data mutation",
  "live integrations / sending email / RFQ send / PO generation",
  "Buildxact / Xero sync / Dropbox write flow",
  "schema migration / auth-security logic change",
  "finance calculations / payroll-timesheet approval logic",
  "client-portal invite / real-client pilot",
  "deploy / destructive command / broad refactor / route-table rename",
  "accepted-gap closure / business-workflow decision",
];

// Paths the watcher will never let an autonomous diff touch — always halts for Sam.
const ALWAYS_SAM = [/^server\//, /^supabase\/migrations\//];
// Always-allowed (docs + tests + review-only harness).
const ALWAYS_OK = [/^docs\//, /^e2e\//, /^scripts\//, /^src\/ui-review\//];

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
    data[line.slice(0, idx).trim()] = coerce(line.slice(idx + 1).trim());
  }
  return { ok: false, data };
}

function readFileSafe(path) {
  try { return readFileSync(path, "utf8"); } catch { return null; }
}

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: REPO_ROOT, encoding: "utf8" });
}

function gitInfo() {
  const info = { branch: null, dirty: null, head: null, error: null, statusText: "" };
  try {
    info.branch = git("branch --show-current").trim();
    info.statusText = git("status --short").trim();
    info.dirty = info.statusText.length > 0;
    info.head = git("rev-parse HEAD").trim();
  } catch (e) { info.error = e.message; }
  return info;
}

function pathAllowed(file, productCodeAllowed) {
  if (ALWAYS_SAM.some((re) => re.test(file))) return false;       // server/migrations → always Sam
  if (ALWAYS_OK.some((re) => re.test(file))) return true;          // docs/tests/ui-review
  if (file.startsWith("src/")) return productCodeAllowed === true; // other src/ only when allowed
  if (file === "package.json") return productCodeAllowed === true;
  return false;                                                    // anything else → halt for Sam
}

function agentCmdTemplate(agent) {
  const key = agent === "cursor" ? "HARDENING_CURSOR_CMD" : "HARDENING_CLAUDE_CMD";
  const v = process.env[key];
  return v && v.trim() ? v.trim() : null;
}

function substitute(tpl, vars) {
  return tpl
    .replaceAll("{{TASK_FILE}}", vars.taskFile)
    .replaceAll("{{AGENT}}", vars.agent)
    .replaceAll("{{WAVE}}", vars.wave);
}

function line(ch = "─", n = 70) { return ch.repeat(n); }
function printList(title, items) { console.log(`\n${title}`); for (const it of items) console.log(`  • ${it}`); }

function nowIso() { return new Date().toISOString(); }

function writeBlocked(title, detailLines) {
  const body = [
    "---", "active: true", "---", "",
    `# Orchestrator Blocked — ${title}`, "",
    `**When:** ${nowIso()}`, "",
    "The watch orchestrator stopped because a guard or validation failed. Resolve, then delete or",
    "set `active: false` in this file before resuming.", "",
    "## Detail",
    ...detailLines.map((l) => `- ${l}`),
    "",
    "## Resume",
    "Fix the issue above, confirm a clean tree, then re-run `npm run hardening:watch -- --run-once`.",
    "",
  ].join("\n");
  writeFileSync(BLOCKED_FILE, body, "utf8");
  console.log(`\n  → wrote ${BLOCKED_FILE.replace(REPO_ROOT + "/", "")}`);
}

/** Rewrite a single YAML front-matter field in a state file (preserves the body). */
function setStateField(file, key, value) {
  const content = readFileSafe(file);
  if (content == null) return;
  const lines = content.split(/\r?\n/);
  let inFm = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      if (!inFm) { inFm = true; continue; }
      break; // end of front-matter
    }
    if (inFm && lines[i].startsWith(`${key}:`)) { lines[i] = `${key}: ${value}`; break; }
  }
  writeFileSync(file, lines.join("\n"), "utf8");
}

function setSamGate(needApproval) {
  for (const f of [STATE_FILE, STATUS_FILE]) {
    setStateField(f, "next_agent", "sam");
    if (needApproval) setStateField(f, "approval_required", "true");
  }
  console.log(`  → set next_agent: sam${needApproval ? " + approval_required: true" : ""}`);
}

/** Load + validate state. Returns the analysis used by every mode. */
function analyze() {
  const a = { configErrors: [], blockers: [], state: {}, status: {}, approvalActive: false, git: null };

  const missing = REQUIRED_FILES.filter((f) => !existsSync(join(LOOP_DIR, f)));
  if (missing.length) a.configErrors.push(`Missing handoff files: ${missing.join(", ")}`);

  const stateRaw = readFileSafe(STATE_FILE);
  const statusRaw = readFileSafe(STATUS_FILE);
  const stateFm = stateRaw ? parseFrontMatter(stateRaw) : { ok: false, data: {} };
  const statusFm = statusRaw ? parseFrontMatter(statusRaw) : { ok: false, data: {} };
  a.state = stateFm.data; a.status = statusFm.data;
  if (!stateFm.ok) a.configErrors.push("CURRENT_STATE.md has no valid YAML front-matter");
  if (!statusFm.ok) a.configErrors.push("AUTONOMOUS_LOOP_STATUS.md has no valid YAML front-matter");

  const s = a.state;
  for (const f of REQUIRED_FIELDS) if (!(f in s)) a.configErrors.push(`CURRENT_STATE.md missing field: ${f}`);
  if ("next_agent" in s && !["cursor", "claude", "sam"].includes(s.next_agent)) {
    a.configErrors.push(`next_agent invalid: ${s.next_agent}`);
  }
  for (const b of ["loop_enabled", "fix_mode_allowed", "product_code_changes_allowed",
    "approval_required", "live_integrations_allowed", "deploy_allowed"]) {
    if (b in s && typeof s[b] !== "boolean") a.configErrors.push(`${b} must be true/false`);
  }
  if (s.fix_mode_allowed === true && s.product_code_changes_allowed === false) {
    a.configErrors.push("contradiction: fix_mode_allowed=true but product_code_changes_allowed=false");
  }
  if (s.deploy_allowed === true) a.configErrors.push("contradiction: deploy_allowed=true (never auto-allowed)");
  if (s.live_integrations_allowed === true) a.configErrors.push("contradiction: live_integrations_allowed=true (never auto-allowed)");
  if (s.approval_required === true && s.next_agent !== "sam") {
    a.configErrors.push("contradiction: approval_required=true but next_agent is not sam");
  }
  if (stateFm.ok && statusFm.ok) {
    for (const f of SHARED_FIELDS) {
      if (f in s && f in a.status && s[f] !== a.status[f]) {
        a.configErrors.push(`state mismatch on ${f}: CURRENT_STATE=${s[f]} vs LOOP_STATUS=${a.status[f]}`);
      }
    }
  }

  const approvalRaw = readFileSafe(APPROVAL_FILE);
  a.approvalActive = approvalRaw ? parseFrontMatter(approvalRaw).data.active === true : false;

  a.git = gitInfo();
  if (a.git.error) a.blockers.push(`git unavailable: ${a.git.error}`);
  else {
    if ("expected_branch" in s && a.git.branch !== s.expected_branch) {
      a.blockers.push(`branch ${a.git.branch} != expected_branch ${s.expected_branch}`);
    }
    if (a.git.dirty) a.blockers.push("working tree is dirty (clean tree required to start a cycle)");
  }
  if (s.loop_enabled === false) a.blockers.push("loop_enabled=false");
  if (s.next_agent === "sam") a.blockers.push("next_agent=sam (Sam must act)");
  if (s.approval_required === true) a.blockers.push("approval_required=true");
  if (a.approvalActive) a.blockers.push("SAM_APPROVAL_REQUIRED.md is active");
  if (s.current_task_file && !existsSync(join(REPO_ROOT, s.current_task_file))) {
    a.blockers.push(`current_task_file not found: ${s.current_task_file}`);
  }
  return a;
}

function invocationStatus() {
  return {
    cursor: agentCmdTemplate("cursor") ? "configured (HARDENING_CURSOR_CMD)" : "NOT configured",
    claude: agentCmdTemplate("claude") ? "configured (HARDENING_CLAUDE_CMD)" : "NOT configured",
  };
}

function dryRun() {
  const a = analyze();
  const s = a.state;
  console.log(line("═"));
  console.log("  HARDENING WATCH — DRY RUN (reads only; mutates nothing)");
  console.log(line("═"));
  console.log(`\n  next_agent        : ${s.next_agent ?? "?"}`);
  console.log(`  current_wave      : ${s.current_wave ?? "?"}`);
  console.log(`  current_task_file : ${s.current_task_file ?? "?"}`);
  console.log(`  expected_branch   : ${s.expected_branch ?? "?"}`);
  console.log(`  product_code_changes_allowed : ${s.product_code_changes_allowed ?? "?"}`);
  if (a.git && !a.git.error) {
    console.log(`\n  git branch        : ${a.git.branch}`);
    console.log(`  working tree      : ${a.git.dirty ? "DIRTY" : "clean"}`);
  }
  const inv = invocationStatus();
  console.log(`\n  agent invocation  : cursor → ${inv.cursor}`);
  console.log(`                      claude → ${inv.claude}`);

  printList("ALLOWED autonomous task classes:", SAFE_TASK_CLASSES);
  printList("FORBIDDEN (stop + SAM_APPROVAL_REQUIRED.md):", FORBIDDEN_TASK_CLASSES);

  console.log(`\n${line()}`);
  if (a.configErrors.length) { printList("CONFIG ERRORS (exit 1):", a.configErrors); console.log(line("═")); return 1; }
  if (a.blockers.length) {
    printList("RUN-MODE BLOCKERS (exit 2 — would not run):", a.blockers);
    console.log("\n  Dry-run is advisory: it reports blockers, it does not act on them.");
    console.log(line("═")); return 2;
  }
  console.log("  READY (exit 0): state valid, no run-mode blockers.");
  console.log(`  Next: ${s.next_agent} executes ${s.current_task_file}`);
  console.log(line("═"));
  return 0;
}

/** Run exactly one handoff cycle. Returns { status, code }. */
function runOnce() {
  const a = analyze();
  const s = a.state;
  console.log(line("═"));
  console.log(`  HARDENING WATCH — RUN-ONCE @ ${nowIso()}`);
  console.log(line("═"));

  if (a.configErrors.length) {
    printList("CONFIG ERRORS:", a.configErrors);
    writeBlocked("invalid state config", a.configErrors);
    return { status: "config-error", code: 1 };
  }

  // --- Sam gates (legitimate halts — no blocker file) ---
  if (s.next_agent === "sam" || s.approval_required === true || a.approvalActive || s.loop_enabled === false) {
    console.log("\n  HALT — Sam gate / loop disabled:");
    if (s.next_agent === "sam") console.log("   • next_agent=sam");
    if (s.approval_required === true) console.log("   • approval_required=true");
    if (a.approvalActive) console.log("   • SAM_APPROVAL_REQUIRED.md active");
    if (s.loop_enabled === false) console.log("   • loop_enabled=false");
    console.log("  Sam must act. Not running any agent.");
    return { status: "sam-gate", code: 2 };
  }

  // --- Pre-run stop conditions (environmental — print + stop; DO NOT mutate state or write a
  // blocker. These are transient/setup issues the operator fixes; the handoff stays valid.
  // ORCHESTRATOR_BLOCKED.md + Sam-flip are reserved for post-run agent/validation failures.) ---
  const guardFails = [];
  if (a.git.error) guardFails.push(`git unavailable: ${a.git.error}`);
  if (a.git && "expected_branch" in s && a.git.branch !== s.expected_branch) {
    guardFails.push(`branch ${a.git.branch} != expected_branch ${s.expected_branch}`);
  }
  if (a.git && a.git.dirty) guardFails.push(`dirty tree — commit/stash before a cycle:\n${a.git.statusText}`);
  if (!existsSync(join(REPO_ROOT, s.current_task_file || ""))) guardFails.push(`task file missing: ${s.current_task_file}`);
  if (!["cursor", "claude"].includes(s.next_agent)) guardFails.push(`unknown next_agent: ${s.next_agent}`);
  if (guardFails.length) {
    printList("STOP — preflight not satisfied (fix and re-run; no state changed):", guardFails);
    return { status: "preflight-stop", code: 2 };
  }

  // --- Determine + invoke the agent (honest: only via configured template) ---
  const agent = s.next_agent;
  const taskFile = s.current_task_file;
  const tpl = agentCmdTemplate(agent);
  console.log(`\n  next_agent : ${agent}`);
  console.log(`  task file  : ${taskFile}`);
  console.log(`  wave       : ${s.current_wave}`);

  if (!tpl) {
    const envVar = agent === "cursor" ? "HARDENING_CURSOR_CMD" : "HARDENING_CLAUDE_CMD";
    // Manual-execution mode: not configured is the NORMAL handoff point, not a failure.
    // Print the action and exit non-zero — but do NOT write a blocker (keep the tree clean).
    console.log(`\n${line()}`);
    console.log(`  ▶ ACTION REQUIRED — run the ${agent.toUpperCase()} step (no auto-invoke configured)`);
    console.log(`     packet : ${taskFile}`);
    console.log(`     wave   : ${s.current_wave}`);
    console.log(`     how    : run ${agent} on that packet (Cursor in the IDE, or invoke Claude),`);
    console.log(`              then re-run \`npm run hardening:watch -- --run-once\`.`);
    console.log(`     auto   : to let the watcher invoke it, set ${envVar} in scripts/hardening-watch.env`);
    console.log(`              (template uses {{TASK_FILE}} / {{AGENT}} / {{WAVE}}). See RUNBOOK.md.`);
    console.log(`  Handoff state preserved (next_agent stays ${agent}). No blocker written.`);
    console.log(line("═"));
    return { status: "manual-step", code: 4 };
  }

  const prevHead = a.git.head;
  const cmd = substitute(tpl, { taskFile, agent, wave: String(s.current_wave) });
  console.log(`\n  invoking: ${cmd}\n${line("·")}`);
  try {
    execSync(cmd, { cwd: REPO_ROOT, stdio: "inherit" });
  } catch (e) {
    writeBlocked("agent command failed", [`Command: ${cmd}`, `Error: ${e.message}`]);
    setSamGate(false);
    return { status: "agent-failed", code: 5 };
  }

  // --- Post-run validation ---
  const fails = postRunValidate(prevHead, s);
  if (fails.length) {
    printList("POST-RUN VALIDATION FAILED:", fails);
    const needApproval = fails.some((f) => /forbidden path|server\/|migrations|behaviour|approval/i.test(f));
    writeBlocked("post-run validation failed", fails);
    setSamGate(needApproval);
    return { status: "validation-failed", code: 6 };
  }

  const after = analyze();
  console.log(`\n${line()}`);
  console.log("  ✅ HANDOFF COMPLETE. Result validated.");
  console.log(`  next_agent now: ${after.state.next_agent} → ${after.state.current_task_file}`);
  console.log(line("═"));
  return { status: "completed", code: 0 };
}

/** Mechanical post-run checks. `pre` = the state captured BEFORE the agent ran. */
function postRunValidate(prevHead, pre) {
  const fails = [];
  const g = gitInfo();
  if (g.error) { fails.push(`git unavailable: ${g.error}`); return fails; }

  // 1. A new commit must exist (agent committed its work) and the tree must be clean.
  if (g.head === prevHead) fails.push("no new commit — agent did not commit its work");
  if (g.dirty) fails.push(`tree not clean after run — agent left uncommitted changes:\n${g.statusText}`);

  // 2. New-commit diff must be within allowed paths (else halt for Sam).
  if (g.head !== prevHead) {
    let changed = [];
    try { changed = git(`diff --name-only ${prevHead}..${g.head}`).split("\n").map((x) => x.trim()).filter(Boolean); }
    catch { changed = []; }
    const bad = changed.filter((f) => !pathAllowed(f, pre.product_code_changes_allowed === true));
    if (bad.length) fails.push(`forbidden paths in commit (need Sam review): ${bad.join(", ")}`);
  }

  // 3. State files valid + agree; next_agent valid; next task file exists.
  const post = analyze();
  if (post.configErrors.length) fails.push(`state invalid after run: ${post.configErrors.join("; ")}`);
  if (!["cursor", "claude", "sam"].includes(post.state.next_agent)) {
    fails.push(`invalid next_agent after run: ${post.state.next_agent}`);
  }
  if (post.state.current_task_file && !existsSync(join(REPO_ROOT, post.state.current_task_file))) {
    fails.push(`next task file missing: ${post.state.current_task_file}`);
  }

  // 4. Handoff log appended (more rows than before is hard to know; require the log mentions the wave).
  const log = readFileSafe(LOG_FILE) || "";
  if (!log.includes(String(pre.current_wave))) {
    fails.push(`AGENT_HANDOFF_LOG.md has no row referencing wave ${pre.current_wave}`);
  }

  // 5. Optional: declared expected result doc exists.
  if (pre.expected_result_doc && !existsSync(join(REPO_ROOT, pre.expected_result_doc))) {
    fails.push(`expected_result_doc missing: ${pre.expected_result_doc}`);
  }
  return fails;
}

function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

async function interval(minutes) {
  const maxIter = Number(analyze().state.max_iterations_this_session) || 1;
  console.log(`\n  INTERVAL MODE — every ${minutes} min, max ${maxIter} cycles this session.\n`);
  for (let i = 1; i <= maxIter; i += 1) {
    console.log(`\n${line("━")}\n  CYCLE ${i}/${maxIter}\n${line("━")}`);
    const res = runOnce();
    if (res.status !== "completed") {
      console.log(`\n  STOP — cycle ${i} ended with status "${res.status}" (code ${res.code}). Loop halted.`);
      return res.code;
    }
    if (i < maxIter) { console.log(`\n  sleeping ${minutes} min before next cycle…`); await sleep(minutes * 60_000); }
  }
  console.log(`\n  Reached max_iterations_this_session (${maxIter}). Stopping (clean).`);
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let code;
  if (args.mode === "dry-run") code = dryRun();
  else if (args.mode === "run-once") code = runOnce().code;
  else code = await interval(args.intervalMinutes);
  process.exit(code);
}

main();
