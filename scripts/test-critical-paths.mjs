#!/usr/bin/env node
/**
 * Blue Leaf Hub — Critical Path Test Runner
 *
 * Runs against a local dev server (npm run dev must be running on port 8787).
 *
 * Usage:
 *   node scripts/test-critical-paths.mjs            # Read-only tests (fast, safe)
 *   node scripts/test-critical-paths.mjs --write    # + write/delete operations
 *   node scripts/test-critical-paths.mjs --ai       # + Claude AI endpoints (costs tokens)
 *   node scripts/test-critical-paths.mjs --all      # Everything
 *
 * Prerequisites:
 *   node scripts/create-test-user.mjs               # Creates ai-test-director@… in Supabase
 */

import { createClient } from "@supabase/supabase-js";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// override: true ensures .env values win even if shell already exported empty vars
dotenvConfig({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env"), override: true });

// ── Flags ──────────────────────────────────────────────────────────────────
const ALL   = process.argv.includes("--all");
const WRITE = ALL || process.argv.includes("--write");
const AI    = ALL || process.argv.includes("--ai");

// ── Config ─────────────────────────────────────────────────────────────────
const API      = "http://localhost:8787";
const SB_URL   = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_ANON  = process.env.VITE_SUPABASE_ANON_KEY;
const SB_SVC   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL  = process.env.APP_URL;

const TEST_EMAIL    = "ai-test-director@blueleafbuilding.test";
const TEST_PASSWORD = "BlueLeaf-Test-2026!";

// ── Result tracking ────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function pass(name) {
  console.log(`  ✓  ${name}`);
  passed++;
}

function fail(name, reason) {
  console.log(`  ✗  ${name}`);
  console.log(`       → ${reason}`);
  failed++;
  failures.push({ name, reason });
}

function skip(name, reason) {
  console.log(`  -  ${name}  (skipped: ${reason})`);
  skipped++;
}

function section(title) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);
}

// ── HTTP helpers ───────────────────────────────────────────────────────────
async function get(path, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function post(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function del(path, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method: "DELETE", headers });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// ── Main ───────────────────────────────────────────────────────────────────
console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║         Blue Leaf Hub — Critical Path Test Runner            ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  API:    ${API}`);
console.log(`  Flags:  ${[WRITE && "--write", AI && "--ai"].filter(Boolean).join(" ") || "read-only"}`);
console.log(`  Time:   ${new Date().toLocaleString("en-AU")}`);

// ── 1. Environment checks ──────────────────────────────────────────────────
section("Environment");

if (SB_URL && SB_ANON && SB_SVC) {
  pass("Supabase env vars (URL + anon + service role)");
} else {
  fail("Supabase env vars", `Missing: ${[!SB_URL && "SUPABASE_URL", !SB_ANON && "VITE_SUPABASE_ANON_KEY", !SB_SVC && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean).join(", ")}`);
}

if (APP_URL && !APP_URL.includes("localhost")) {
  pass(`APP_URL set to production URL (${APP_URL})`);
} else if (APP_URL) {
  pass(`APP_URL set (${APP_URL}) — this is localhost, ensure Railway has the production value`);
} else {
  fail("APP_URL", "Not set — invitation emails will have broken links");
}

if (process.env.ANTHROPIC_API_KEY) {
  pass("ANTHROPIC_API_KEY present");
} else {
  fail("ANTHROPIC_API_KEY", "Not set — all AI features will fail");
}

if (process.env.DROPBOX_APP_KEY && process.env.DROPBOX_REFRESH_TOKEN) {
  pass("Dropbox env vars present");
} else {
  fail("Dropbox env vars", "DROPBOX_APP_KEY or DROPBOX_REFRESH_TOKEN missing");
}

// ── 2. API server reachability ─────────────────────────────────────────────
section("API Server");

let serverUp = false;
try {
  const { status, body } = await get("/api/health");
  if (status === 200 && body.ok) {
    pass("GET /api/health");
    serverUp = true;
  } else {
    fail("GET /api/health", `Status ${status}, body: ${JSON.stringify(body)}`);
  }
} catch (e) {
  fail("GET /api/health", `Server not reachable — is 'npm run dev' running? (${e.message})`);
}

if (!serverUp) {
  console.log("\n  ⚠  Server is not running. Start with 'npm run dev' and re-run.\n");
  process.exit(1);
}

// ── 3. Integrations status ─────────────────────────────────────────────────
section("Integrations");

const { body: intStatus } = await get("/api/integrations/status");
if (intStatus.ok) {
  const transport = intStatus.mail?.transport || "none";
  pass(`Mail transport: ${transport}`);
  if (intStatus.gmail?.configured) pass("Gmail OAuth configured");
  else if (intStatus.smtp?.configured) pass("SMTP configured (Gmail OAuth not set)");
  else fail("Mail transport", "Neither Gmail OAuth nor SMTP configured");

  if (intStatus.dropbox?.configured) pass("Dropbox configured");
  else fail("Dropbox", "Not configured");

  if (intStatus.buildexact?.configured) pass("Buildexact configured");
  else fail("Buildexact", "Not configured — API key or URL missing");
} else {
  fail("GET /api/integrations/status", "Endpoint returned ok: false");
}

// ── 4. Authentication ──────────────────────────────────────────────────────
section("Authentication");

let jwt = null;
let testUserId = null;

if (!SB_URL || !SB_ANON) {
  fail("Supabase sign-in", "Missing Supabase env vars — cannot authenticate");
} else {
  try {
    const sb = createClient(SB_URL, SB_ANON, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data, error } = await sb.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });
    if (error || !data?.session?.access_token) {
      fail("Supabase sign-in (test user)", `${error?.message || "No session returned"} — run: node scripts/create-test-user.mjs`);
    } else {
      jwt = data.session.access_token;
      testUserId = data.user.id;
      pass(`Supabase sign-in as ${TEST_EMAIL}`);
    }
  } catch (e) {
    fail("Supabase sign-in", e.message);
  }
}

// ── 5. Invitation link integrity ───────────────────────────────────────────
section("Auth Routes");

if (jwt) {
  // GET a non-existent invite token — should 404 (not 500), proving appBaseUrl() works
  const { status: invStatus } = await get("/api/auth/invite/test-token-validity-check");
  if (invStatus === 404) {
    pass("GET /api/auth/invite/:token (returns 404 for unknown token — APP_URL wired correctly)");
  } else if (invStatus === 500) {
    fail("GET /api/auth/invite/:token", "Returned 500 — check appBaseUrl() in authRoutes.mjs");
  } else {
    pass(`GET /api/auth/invite/:token (status ${invStatus})`);
  }
} else {
  skip("Auth invite check", "No JWT");
}

// ── 6. Sales ───────────────────────────────────────────────────────────────
section("Sales");

if (jwt) {
  const { status: leadsStatus, body: leadsBody } = await get("/api/sales/leads", jwt);
  if (leadsStatus === 200 && leadsBody?.ok && Array.isArray(leadsBody?.leads)) {
    pass(`GET /api/sales/leads (${leadsBody.leads.length} leads)`);
  } else {
    fail("GET /api/sales/leads", `Status ${leadsStatus}, body: ${JSON.stringify(leadsBody).slice(0, 80)}`);
  }

  const { status: scorecardStatus } = await get("/api/sales/scorecard", jwt);
  if (scorecardStatus === 200) {
    pass("GET /api/sales/scorecard");
  } else {
    fail("GET /api/sales/scorecard", `Status ${scorecardStatus}`);
  }

  if (WRITE) {
    const { status: createStatus, body: createBody } = await post("/api/sales/leads", {
      client_name: "TEST — Critical Path Runner",
      project_type: "new_build",
      estimated_budget: 500000,
      lead_source: "test_script",
      stage: "enquiry"
    }, jwt);
    if (createStatus === 200 || createStatus === 201) {
      const newId = createBody?.id || createBody?.lead?.id;
      pass(`POST /api/sales/leads (created id=${newId})`);
      if (newId) {
        const { status: delStatus } = await del(`/api/sales/leads/${newId}`, jwt);
        if (delStatus === 200 || delStatus === 204) {
          pass(`DELETE /api/sales/leads/${newId} (cleanup)`);
        } else {
          fail(`DELETE /api/sales/leads/${newId}`, `Status ${delStatus} — manual cleanup needed`);
        }
      }
    } else {
      fail("POST /api/sales/leads", `Status ${createStatus} — ${JSON.stringify(createBody).slice(0, 120)}`);
    }
  } else {
    skip("POST + DELETE /api/sales/leads", "run with --write");
  }
} else {
  skip("Sales endpoints", "No JWT");
}

// ── 7. RFQ Packages ────────────────────────────────────────────────────────
section("RFQ Packages");

if (jwt) {
  const { status, body } = await get("/api/rfq-packages", jwt);
  if (status === 200 && body?.ok && Array.isArray(body?.packages)) {
    pass(`GET /api/rfq-packages (${body.packages.length} packages)`);
  } else {
    fail("GET /api/rfq-packages", `Status ${status}, body: ${JSON.stringify(body).slice(0, 80)}`);
  }
} else {
  skip("RFQ packages", "No JWT");
}

// ── 8. Finance ─────────────────────────────────────────────────────────────
section("Finance");

if (jwt) {
  const checks = [
    ["/api/finance/trade-categories", "GET /api/finance/trade-categories"],
    ["/api/finance/stats",            "GET /api/finance/stats"],
    ["/api/finance/documents",        "GET /api/finance/documents"],
    ["/api/finance/jobs",             "GET /api/finance/jobs"],
  ];
  for (const [path, label] of checks) {
    const { status, body } = await get(path, jwt);
    if (status === 200) {
      const count = Array.isArray(body) ? ` (${body.length} items)` : Array.isArray(body?.documents) ? ` (${body.documents.length} docs)` : "";
      pass(`${label}${count}`);
    } else {
      fail(label, `Status ${status}`);
    }
  }
} else {
  skip("Finance endpoints", "No JWT");
}

// ── 9. Schedule ────────────────────────────────────────────────────────────
section("Schedule");

if (jwt) {
  const { status: tplStatus, body: tplBody } = await get("/api/schedule/templates", jwt);
  if (tplStatus === 200 && tplBody?.ok && Array.isArray(tplBody?.templates)) {
    pass(`GET /api/schedule/templates (${tplBody.templates.length} templates)`);
  } else {
    fail("GET /api/schedule/templates", `Status ${tplStatus}, body: ${JSON.stringify(tplBody).slice(0, 80)}`);
  }

  if (AI) {
    // Find a real project to test schedule generation against
    const { body: jobsBody } = await get("/api/finance/jobs", jwt);
    const firstJob = Array.isArray(jobsBody) ? jobsBody[0] : null;
    if (firstJob?.project_id) {
      const { status: genStatus, body: genBody } = await post("/api/schedule/generate", {
        projectId: firstJob.project_id,
        description: "Test: 4-bedroom single storey residential new build. Slab on ground.",
        forceRegenerate: false
      }, jwt);
      if (genStatus === 200 || genStatus === 201) {
        pass(`POST /api/schedule/generate (project ${firstJob.project_id})`);
      } else {
        fail("POST /api/schedule/generate", `Status ${genStatus} — ${JSON.stringify(genBody).slice(0, 120)}`);
      }
    } else {
      skip("POST /api/schedule/generate", "No projects found in finance/jobs");
    }
  } else {
    skip("POST /api/schedule/generate (AI)", "run with --ai");
  }
} else {
  skip("Schedule endpoints", "No JWT");
}

// ── 10. Portal ─────────────────────────────────────────────────────────────
section("Client Portal");

if (jwt) {
  // Check if any portal tokens exist in the DB via the admin summary endpoint
  // We'll try to find a project with portal enabled
  const { body: jobsBody } = await get("/api/finance/jobs", jwt);
  const portalJob = Array.isArray(jobsBody) ? jobsBody.find(j => j.project_id) : null;
  if (portalJob?.project_id) {
    const { status: summaryStatus } = await get(`/api/portal/admin/${portalJob.project_id}/summary`, jwt);
    if (summaryStatus === 200) {
      pass(`GET /api/portal/admin/:projectId/summary (project ${portalJob.project_id})`);
    } else if (summaryStatus === 404) {
      pass("GET /api/portal/admin/:projectId/summary (404 — portal not enabled for this project, endpoint works)");
    } else {
      fail("GET /api/portal/admin/:projectId/summary", `Status ${summaryStatus}`);
    }
  } else {
    skip("Portal admin summary", "No projects found");
  }
} else {
  skip("Portal endpoints", "No JWT");
}

// ── 11. Blueprint AI ───────────────────────────────────────────────────────
section("Blueprint AI");

if (AI) {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { status: bpStatus, body: bpBody } = await post("/api/blueprint/chat", {
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        hubContext: { test: true }
      }, jwt);
      if (bpStatus === 200 && bpBody?.reply) {
        pass(`POST /api/blueprint/chat (reply: "${bpBody.reply.slice(0, 40)}")`);
      } else if (bpStatus === 401 || bpStatus === 403) {
        fail("POST /api/blueprint/chat", "Auth rejected — check BLUEPRINT_KEY env var");
      } else {
        fail("POST /api/blueprint/chat", `Status ${bpStatus} — ${JSON.stringify(bpBody).slice(0, 120)}`);
      }
    } catch (e) {
      fail("POST /api/blueprint/chat", e.message);
    }
  } else {
    fail("POST /api/blueprint/chat", "ANTHROPIC_API_KEY not set");
  }
} else {
  skip("POST /api/blueprint/chat (AI)", "run with --ai");
}

// ── 12. IMAP connectivity ──────────────────────────────────────────────────
section("IMAP");

if (jwt) {
  const { status: imapStatus, body: imapBody } = await get("/api/finance/imap/status", jwt);
  if (imapStatus === 200) {
    pass(`GET /api/finance/imap/status (configured: ${imapBody?.configured ?? "unknown"})`);
  } else {
    fail("GET /api/finance/imap/status", `Status ${imapStatus}`);
  }
} else {
  skip("IMAP status", "No JWT");
}

// ── 12. Client Portal v2 ────────────────────────────────────────────────────
// These assertions are migration-INDEPENDENT: they exercise the requirePortalAuth
// boundary + route registration, which reject before any portal_v2 table is read.
// Deeper data-flow assertions (invite→login→approve variation→archive→audit) need
// migrations 099–103 applied to the live DB and a seeded v2 project; see
// scripts/seed_portal_v2_demo.sql and run them once the dashboard paste is done.
section("Client Portal v2");

const FAKE_PID = "00000000-0000-0000-0000-000000000000";

{
  const { status } = await get(`/api/portal/app/${FAKE_PID}/home`);
  if (status === 401) pass("v2 client route rejects no-auth (401)");
  else fail("v2 client route no-auth", `Expected 401, got ${status}`);
}
{
  const { status } = await get(`/api/portal/app/${FAKE_PID}/home`, "not-a-real-token");
  if (status === 401) pass("v2 client route rejects forged token (401)");
  else fail("v2 client route forged token", `Expected 401, got ${status}`);
}
{
  const { status } = await post(`/api/portal/app/${FAKE_PID}/variations/x/respond`, { action: "approve" });
  if (status === 401) pass("v2 contractual write rejects no-auth (401)");
  else fail("v2 contractual write no-auth", `Expected 401, got ${status}`);
}
{
  const { status } = await get(`/api/portal/admin/v2/${FAKE_PID}/overview`);
  if (status === 401) pass("admin v2 route requires auth (401)");
  else fail("admin v2 route no-auth", `Expected 401, got ${status}`);
}
{
  const { status, body } = await post("/api/cron/portal-sync", {});
  if (status === 200 && body?.ok) pass(`POST /api/cron/portal-sync (projects: ${body.projects ?? "?"})`);
  else fail("POST /api/cron/portal-sync", `Status ${status}`);
}

// ── Summary ────────────────────────────────────────────────────────────────
const total = passed + failed + skipped;
console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log(`║  Results: ${passed} passed  ${failed} failed  ${skipped} skipped  (${total} total)`.padEnd(64) + "║");
console.log("╚══════════════════════════════════════════════════════════════╝");

if (failures.length) {
  console.log("\n  Failures:");
  failures.forEach(({ name, reason }) => {
    console.log(`  ✗ ${name}`);
    console.log(`    ${reason}`);
  });
}

console.log("");
process.exit(failed > 0 ? 1 : 0);
