#!/usr/bin/env node
/**
 * HUB-QA-ROLE-PREVIEW Phase 6 — drift test.
 * Cross-checks the console's declared access matrix against the REAL route authz, so the
 * console can't silently drift from what the backend actually enforces. (Sample of routes.)
 */
import { createRunner, assertServerUp, get, SB_URL, SB_ANON } from "./_helpers.mjs";
import { createClient } from "@supabase/supabase-js";
import { ensureE2EUsers } from "../create-e2e-users.mjs";
import { PERSONAS, gateFor } from "../../src/lib/roleAccess.js";

const PW = "BlueLeaf-E2E-2026!";
const P = (k) => PERSONAS.find((p) => p.key === k);
const ymd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
async function tok(email) {
  const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: PW });
  if (error || !data?.session?.access_token) throw new Error(error?.message || `No session ${email}`);
  return data.session.access_token;
}

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║   HUB-QA-ROLE-PREVIEW Phase 6 — matrix vs real route authz    ║");
console.log("╚══════════════════════════════════════════════════════════════╝");

const run = createRunner();
run.section("Environment");
if (!(await assertServerUp(run))) process.exit(1);

let sup, emp;
try { const u = await ensureE2EUsers(); sup = await tok(u.supervisor.email); emp = await tok(u.employee.email); }
catch (e) { run.fail("QA-RP-DRIFT auth setup", e.message); process.exit(1); }

const d = ymd();
const denied = (s) => s === 401 || s === 403; // either form = the role can't reach it
run.section("QA-RP-DRIFT — console matrix vs real route authz (Workforce sample)");

// Console says: employee has NO workforce → a workforce admin/supervisor route must deny.
const empWf = await get("/api/workforce/planner-jobs", emp);
if (gateFor(P("employee"), "accessWorkforce") === false && denied(empWf.status))
  run.pass(`QA-RP-DRIFT-01 employee: console says no-Workforce AND route denies (${empWf.status})`);
else run.fail("QA-RP-DRIFT-01", `matrix(accessWorkforce)=${gateFor(P("employee"), "accessWorkforce")} route=${empWf.status}`);

// Console says: supervisor HAS workforce → the same route must allow (200).
const supWf = await get("/api/workforce/planner-jobs", sup);
if (gateFor(P("supervisor"), "accessWorkforce") === true && supWf.status === 200)
  run.pass("QA-RP-DRIFT-02 supervisor: console says Workforce AND route returns 200");
else run.fail("QA-RP-DRIFT-02", `matrix=${gateFor(P("supervisor"), "accessWorkforce")} route=${supWf.status}`);

// Days-off (P5) route is admin/supervisor — employee denied.
const empNw = await get(`/api/workforce/non-working-days?from=${d}&to=${d}`, emp);
if (denied(empNw.status)) run.pass(`QA-RP-DRIFT-03 employee denied the days-off route (${empNw.status})`);
else run.fail("QA-RP-DRIFT-03", `expected denied; got ${empNw.status}`);

// The worker-preview route the console reuses is admin/supervisor — employee denied.
const empPrev = await get("/api/workforce/employees/00000000-0000-0000-0000-000000000000/task-preview", emp);
if (denied(empPrev.status)) run.pass(`QA-RP-DRIFT-04 worker-preview route is admin/supervisor (employee ${empPrev.status})`);
else run.fail("QA-RP-DRIFT-04", `expected denied; got ${empPrev.status}`);

// Supervisor is allowed the Planner allocations read.
const supAlloc = await get(`/api/workforce/allocations?from=${d}&to=${d}`, sup);
if (supAlloc.status === 200) run.pass("QA-RP-DRIFT-05 supervisor allowed Planner allocations (200)");
else run.fail("QA-RP-DRIFT-05", `expected 200; got ${supAlloc.status}`);

const { passed, failed, gapDocumented, failures } = run.stats;
console.log("\n── Summary ──────────────────────────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Gap-documented: ${gapDocumented}`);
if (failures.length) { console.log("\n  Failures:"); for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`); }
process.exit(failed > 0 ? 1 : 0);
