/**
 * Audit and clean up all test/seed/demo data.
 *
 *   node scripts/cleanup-test-data.mjs --audit     # read-only: show what exists
 *   node scripts/cleanup-test-data.mjs --dry-run   # show what would be deleted, no writes
 *   node scripts/cleanup-test-data.mjs             # interactive full cleanup (prompts per category)
 */
import { createClient } from "@supabase/supabase-js";
import { config as dotenvConfig } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import readline from "readline";

dotenvConfig({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SVC    = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_URL || !SVC) {
  console.error("✗ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const AUDIT   = process.argv.includes("--audit");
const DRY_RUN = process.argv.includes("--dry-run");
const MODE    = AUDIT ? "AUDIT" : DRY_RUN ? "DRY-RUN" : "LIVE";

// ── Fixed UUIDs used by seed scripts ───────────────────────────────────────
const SEED_JOB_ID      = "5eed0000-0000-4000-8000-000000000001";
const SEED_PROJECT_ID  = "5eed0000-0000-4000-8000-000000000002";
const SEED_PROPOSAL_ID = "5eed0000-0000-4000-8000-000000000003";

const E2E_JOB_ID    = "e2e00000-0000-4000-8000-000000000001";
const E2E_PROJECT_A = "e2e00000-0000-4000-8000-000000000002";
const E2E_PROJECT_B = "e2e00000-0000-4000-8000-000000000003";
const E2E_LEAD_ID   = "e2e00000-0000-4000-8000-000000000004";

// Address prefixes used as test markers
const ADDRESS_PATTERNS = ["__E2E_%", "__DEMO%", "__DRYRUN_%"];

// Test auth emails (exact or pattern)
const TEST_EMAIL_PATTERNS = [
  "%@blueleafbuilding.test",
  "testclient@example.test",
  "dryrun-%@example.test",
];

// Test EMPLOYEE markers (workforce). Real staff never use these name prefixes or emails, so these
// are safe; matched precisely against the start of the name (prefix) or test email domains.
const EMP_NAME_PATTERNS  = ["ZZZ-%", "AUDIT-TEST%", "TEST-%", "__BLH TEST%"];
const EMP_EMAIL_PATTERNS = ["%+wftest@%", "%@example.%", "%@blueleafbuilding.test"];

// ── Helpers ─────────────────────────────────────────────────────────────────
function sb() {
  return createClient(SB_URL, SVC, { auth: { persistSession: false } });
}

const counts = { deleted: {}, found: {} };
function tally(table, n, action) {
  counts[action][table] = (counts[action][table] || 0) + n;
}

async function safeDelete(client, table, filter) {
  let q = client.from(table).delete();
  for (const [col, val] of Object.entries(filter)) {
    if (Array.isArray(val)) {
      if (!val.length) return 0;
      q = q.in(col, val);
    } else if (typeof val === "string" && val.includes("%")) {
      q = q.like(col, val);
    } else {
      q = q.eq(col, val);
    }
  }
  const { data, error } = await q.select("id");
  if (error) {
    if (error.code === "42P01") return 0; // table doesn't exist — skip silently
    console.warn(`  ⚠ ${table}: ${error.message}`);
    return 0;
  }
  return (data || []).length;
}

async function safeCount(client, table, filter) {
  let q = client.from(table).select("id", { count: "exact", head: true });
  for (const [col, val] of Object.entries(filter)) {
    if (Array.isArray(val)) {
      if (!val.length) return 0;
      q = q.in(col, val);
    } else if (typeof val === "string" && val.includes("%")) {
      q = q.like(col, val);
    } else {
      q = q.eq(col, val);
    }
  }
  const { count, error } = await q;
  if (error) {
    if (error.code === "42P01") return 0;
    return 0;
  }
  return count || 0;
}

async function confirm(question) {
  if (AUDIT || DRY_RUN) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (ans) => {
      rl.close();
      resolve(ans.toLowerCase() === "y");
    });
  });
}

function row(label, n) {
  const icon = n === 0 ? "·" : AUDIT || DRY_RUN ? "→" : "✓";
  console.log(`  ${icon} ${label.padEnd(42)} ${n}`);
}

// ── Phase 1 — collect all test project/job IDs ──────────────────────────────
async function collectIds(client) {
  const ids = {
    jobIds:     new Set([SEED_JOB_ID, E2E_JOB_ID]),
    projectIds: new Set([SEED_PROJECT_ID, E2E_PROJECT_A, E2E_PROJECT_B]),
    leadIds:    new Set([E2E_LEAD_ID]),
    userIds:    new Set(),
  };

  // Jobs identified by address pattern
  for (const pattern of ADDRESS_PATTERNS) {
    const { data } = await client.from("jobs").select("id").like("address", pattern);
    (data || []).forEach((r) => ids.jobIds.add(r.id));
  }

  // Projects by address pattern
  for (const pattern of ADDRESS_PATTERNS) {
    const { data } = await client.from("projects").select("id").like("address", pattern);
    (data || []).forEach((r) => ids.projectIds.add(r.id));
  }

  // Projects linked to test jobs (may use a real address)
  if (ids.jobIds.size) {
    const { data } = await client.from("projects").select("id").in("job_id", [...ids.jobIds]);
    (data || []).forEach((r) => ids.projectIds.add(r.id));
  }

  // Test user profiles
  for (const pattern of TEST_EMAIL_PATTERNS) {
    const { data } = await client
      .from("user_profiles")
      .select("id")
      .like("email", pattern);
    (data || []).forEach((r) => ids.userIds.add(r.id));
  }

  // Test employees (workforce) by name prefix or test email
  const empIds = new Set();
  for (const pattern of EMP_NAME_PATTERNS) {
    const { data } = await client.from("employees").select("id").like("name", pattern);
    (data || []).forEach((r) => empIds.add(r.id));
  }
  for (const pattern of EMP_EMAIL_PATTERNS) {
    const { data } = await client.from("employees").select("id").like("email", pattern);
    (data || []).forEach((r) => empIds.add(r.id));
  }

  return {
    jobIds:     [...ids.jobIds],
    projectIds: [...ids.projectIds],
    leadIds:    [...ids.leadIds],
    userIds:    [...ids.userIds],
    empIds:     [...empIds],
  };
}

// ── Phase 2 — audit mode (counts only) ──────────────────────────────────────
async function runAudit(client, ids) {
  console.log("\n── Test data found ──────────────────────────────────────────");
  console.log(`  Jobs identified:     ${ids.jobIds.length}`);
  console.log(`  Projects identified: ${ids.projectIds.length}`);
  console.log(`  Leads identified:    ${ids.leadIds.length}`);
  console.log(`  Test users:          ${ids.userIds.length}`);
  console.log("");

  const portalTables = [
    "portal_notifications", "portal_audit_logs",
    "selection_options", "client_selections", "client_actions",
    "portal_milestones", "portal_updates", "portal_decisions",
    "portal_claims", "portal_documents", "portal_meetings",
    "portal_messages", "project_client_users",
  ];

  if (ids.projectIds.length) {
    console.log("  Portal/project rows:");
    for (const t of portalTables) {
      // selection_options links via client_selections, handled separately below
      if (t === "selection_options") continue;
      const n = await safeCount(client, t, { project_id: ids.projectIds });
      row(t, n);
    }
    // selection_options via client_selections
    const { data: sels } = await client
      .from("client_selections")
      .select("id")
      .in("project_id", ids.projectIds);
    const selIds = (sels || []).map((s) => s.id);
    const soCount = selIds.length
      ? await safeCount(client, "selection_options", { selection_id: selIds })
      : 0;
    row("selection_options (via client_selections)", soCount);
  }

  if (ids.jobIds.length) {
    console.log("\n  Job-linked rows:");
    for (const t of ["financial_documents", "job_variations", "progress_claims", "fee_proposals"]) {
      const n = await safeCount(client, t, { job_id: ids.jobIds });
      row(t, n);
    }
  }

  if (ids.userIds.length) {
    console.log("\n  Auth users:");
    row("user_profiles", await safeCount(client, "user_profiles", { id: ids.userIds }));
    console.log(`  → Plus ${ids.userIds.length} auth.users entries (need admin API to delete)`);
  }

  if (ids.empIds?.length) {
    console.log("\n  Workforce (test employees):");
    row("employees", ids.empIds.length);
    row("timesheets (employee_id)", await safeCount(client, "timesheets", { employee_id: ids.empIds }));
    row("timesheet_entries (employee_id)", await safeCount(client, "timesheet_entries", { employee_id: ids.empIds }));
    row("employee_cost_rates (employee_id)", await safeCount(client, "employee_cost_rates", { employee_id: ids.empIds }));
  }

  // SQL demo seed detection — no address marker, detect by known seed text
  const { data: demoMilestones } = await client
    .from("portal_milestones")
    .select("project_id, key")
    .like("confidence_note", "%Roof trusses delayed 5 days%");
  if (demoMilestones?.length) {
    const demoProjectIds = [...new Set(demoMilestones.map((r) => r.project_id))];
    console.log(
      `\n  ⚠  SQL demo seed (seed_portal_v2_demo.sql) detected on ${demoProjectIds.length} real project(s):`
    );
    demoProjectIds.forEach((pid) => console.log(`     project_id: ${pid}`));
    console.log(
      "     These are overlaid onto real projects. Remove manually via Supabase SQL editor\n" +
      "     (delete portal_milestones/updates/etc. WHERE project_id = '<id>')."
    );
  }
}

// ── Phase 3 — delete (or dry-run preview) ────────────────────────────────────
async function deleteCategory(client, label, ops) {
  console.log(`\n── ${label} ──────────────────────────────────────────────────`);
  let total = 0;
  for (const { table, filter, note } of ops) {
    const n = AUDIT || DRY_RUN
      ? await safeCount(client, table, filter)
      : await safeDelete(client, table, filter);
    total += n;
    row(note || table, n);
    tally(table, n, AUDIT || DRY_RUN ? "found" : "deleted");
  }
  return total;
}

async function runCleanup(client, ids) {
  if (!ids.projectIds.length && !ids.jobIds.length && !ids.userIds.length && !ids.empIds?.length) {
    console.log("\n✓ Nothing to clean up — database looks clean.");
    return;
  }

  const verb = AUDIT ? "Found" : DRY_RUN ? "Would delete" : "Deleting";
  console.log(`\n[${MODE}] ${verb} across ${ids.projectIds.length} project(s), ${ids.jobIds.length} job(s), ${ids.userIds.length} user(s).`);

  if (!AUDIT && !DRY_RUN) {
    const go = await confirm(
      `\nThis will permanently delete all test data. Are you sure?`
    );
    if (!go) { console.log("Aborted."); process.exit(0); }
  }

  // Step 1: portal_notifications + audit_logs
  if (ids.projectIds.length) {
    await deleteCategory(client, "Portal notifications & audit logs", [
      { table: "portal_notifications", filter: { project_id: ids.projectIds } },
      { table: "portal_audit_logs",    filter: { project_id: ids.projectIds } },
    ]);

    // Step 2: selection_options via client_selections (must go before client_selections)
    const { data: sels } = await client
      .from("client_selections")
      .select("id")
      .in("project_id", ids.projectIds);
    const selIds = (sels || []).map((s) => s.id);
    if (selIds.length && !AUDIT && !DRY_RUN) {
      await client.from("selection_options").delete().in("selection_id", selIds);
    }
    const soCount = selIds.length ? await safeCount(client, "selection_options", { selection_id: selIds }) : 0;
    if (DRY_RUN) row("selection_options (via client_selections)", soCount);

    // Step 3: all project-linked portal tables
    await deleteCategory(client, "Portal project data", [
      { table: "client_selections",    filter: { project_id: ids.projectIds } },
      { table: "client_actions",       filter: { project_id: ids.projectIds } },
      { table: "portal_milestones",    filter: { project_id: ids.projectIds } },
      { table: "portal_updates",       filter: { project_id: ids.projectIds } },
      { table: "portal_decisions",     filter: { project_id: ids.projectIds } },
      { table: "portal_claims",        filter: { project_id: ids.projectIds } },
      { table: "portal_documents",     filter: { project_id: ids.projectIds } },
      { table: "portal_meetings",      filter: { project_id: ids.projectIds } },
      { table: "portal_messages",      filter: { project_id: ids.projectIds } },
      { table: "project_client_users", filter: { project_id: ids.projectIds } },
    ]);
  }

  // Step 4: progress payments → claims
  if (ids.jobIds.length) {
    const { data: claims } = await client
      .from("progress_claims")
      .select("id")
      .in("job_id", ids.jobIds);
    const claimIds = (claims || []).map((c) => c.id);
    if (claimIds.length && !AUDIT && !DRY_RUN) {
      await client.from("progress_claim_payments").delete().in("progress_claim_id", claimIds);
    }
    if (DRY_RUN && claimIds.length) {
      const n = await safeCount(client, "progress_claim_payments", { progress_claim_id: claimIds });
      row("progress_claim_payments (via progress_claims)", n);
    }

    await deleteCategory(client, "Job finance data", [
      { table: "progress_claims",      filter: { job_id: ids.jobIds } },
      { table: "financial_documents",  filter: { job_id: ids.jobIds } },
      { table: "job_variations",       filter: { job_id: ids.jobIds } },
      { table: "fee_proposals",        filter: { job_id: ids.jobIds } },
    ]);
  }

  // Step 5: projects (FK child of jobs)
  if (ids.projectIds.length) {
    await deleteCategory(client, "Projects", [
      { table: "projects", filter: { id: ids.projectIds } },
    ]);
  }

  // Step 6: leads + jobs
  if (ids.leadIds.length || ids.jobIds.length) {
    await deleteCategory(client, "Leads & jobs", [
      ...(ids.leadIds.length ? [{ table: "leads", filter: { id: ids.leadIds } }] : []),
      ...(ids.jobIds.length  ? [{ table: "jobs",  filter: { id: ids.jobIds  } }] : []),
    ]);
  }

  // Step 6b: workforce — test employees + their timesheets/cost rates (FK-ordered).
  if (ids.empIds?.length) {
    // Detach any site_tasks pointing at a test employee so the employee row isn't FK-blocked
    // (keeps the task; just clears the test assignee/completer).
    if (!AUDIT && !DRY_RUN) {
      await client.from("site_tasks").update({ assigned_to: null }).in("assigned_to", ids.empIds);
      await client.from("site_tasks").update({ completed_by: null }).in("completed_by", ids.empIds);
    }
    await deleteCategory(client, "Workforce (test employees)", [
      { table: "timesheet_entries",   filter: { employee_id: ids.empIds } },
      { table: "timesheets",          filter: { employee_id: ids.empIds } },
      { table: "employee_cost_rates", filter: { employee_id: ids.empIds } },
      { table: "employees",           filter: { id: ids.empIds } },
    ]);
  }

  // Step 7: users — user_profiles first, then auth.users via admin API
  if (ids.userIds.length) {
    console.log("\n── Auth users ───────────────────────────────────────────────");
    if (!AUDIT && !DRY_RUN) {
      for (const uid of ids.userIds) {
        await client.from("user_profiles").delete().eq("id", uid);
        const { error } = await client.auth.admin.deleteUser(uid);
        if (error) console.warn(`  ⚠ auth.deleteUser(${uid}): ${error.message}`);
        else console.log(`  ✓ user_profiles + auth.users: ${uid}`);
      }
    } else {
      row("user_profiles", await safeCount(client, "user_profiles", { id: ids.userIds }));
      row("auth.users (admin API)", ids.userIds.length);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔍 Test data cleanup — mode: ${MODE}`);
  const client = sb();

  console.log("\nCollecting test data IDs…");
  const ids = await collectIds(client);

  if (AUDIT) {
    await runAudit(client, ids);
    return;
  }

  await runAudit(client, ids);
  await runCleanup(client, ids);

  if (!AUDIT) {
    const action = DRY_RUN ? "found" : "deleted";
    const summary = Object.entries(counts[action] || {})
      .filter(([, n]) => n > 0)
      .map(([t, n]) => `${n} ${t}`)
      .join(", ");
    console.log(`\n${DRY_RUN ? "Would delete" : "Done."} ${summary || "nothing"}.`);
  }
}

main().catch((err) => {
  console.error("\n✗", err.message);
  process.exit(1);
});
