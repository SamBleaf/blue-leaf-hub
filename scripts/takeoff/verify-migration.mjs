// Migration 206 verification on an ISOLATED Postgres (never Supabase). Writes a Markdown report.
//   node scripts/takeoff/verify-migration.mjs [report.md]
// Steps: fresh DB → Supabase-shaped stub → apply 206 → re-apply 206 (idempotency) → catalog audit
// (tables, RLS, grants, function security/search_path/EXECUTE, triggers, constraints) → live access
// probes as anon/authenticated (expected: denied).
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { freshTakeoffDb } from "../tests/lib/takeoffTestDb.mjs";

const out = process.argv[2] || "migration-206-verification.md";
const sqlPath = new URL("../../supabase/migrations/206_takeoff_foundation.sql", import.meta.url);
const sql = readFileSync(sqlPath, "utf8");
const t0 = Date.now();
const db = await freshTakeoffDb("blh_takeoff_migverify");
if (db.skip) { console.log(`BLOCKED: ${db.skip}`); process.exit(2); }
const c = db.client;
const lines = [];
const q = async (s, p) => (await c.query(s, p)).rows;
const version = (await q("select version()"))[0].version;
let reapply = "PASS";
try { await c.query(sql); } catch (e) { reapply = `FAIL — ${e.message}`; }

const tables = await q(`select c.relname as table, c.relrowsecurity as rls,
  (select count(*) from pg_policies p where p.tablename=c.relname)::int as policies,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_select, has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select,
  has_table_privilege('authenticated', c.oid, 'INSERT') as auth_insert, has_table_privilege('service_role', c.oid, 'SELECT') as svc_select
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'takeoff\\_%' order by 1`);
const funcs = await q(`select p.proname as fn, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer,
  coalesce(array_to_string(p.proconfig, ','), '') as config,
  has_function_privilege('public', p.oid, 'EXECUTE') as public_exec, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec, has_function_privilege('service_role', p.oid, 'EXECUTE') as svc_exec
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'takeoff\\_%' order by 1`);
const triggers = await q(`select event_object_table as table, trigger_name, string_agg(event_manipulation, '/' order by event_manipulation) as events, action_timing
  from information_schema.triggers where trigger_name like 'takeoff\\_%' group by 1,2,4 order by 1,2`);
const jdCols = await q(`select column_name, data_type from information_schema.columns where table_name='job_documents' and column_name in ('revision_label','content_sha256','byte_size','archived_at','archived_by') order by 1`);
const buckets = await q(`select id, public from storage.buckets where id in ('job-plans','takeoff-exports') order by 1`);
const checks = await q(`select conrelid::regclass::text as table, conname, pg_get_constraintdef(oid) as def from pg_constraint where conname like 'takeoff\\_%' and contype='c' order by 1,2`);

// live access probes as the client roles
const probes = [];
for (const role of ["anon", "authenticated"]) {
  for (const [label, stmt] of [
    ["select takeoff_workspaces", "select * from public.takeoff_workspaces limit 1"],
    ["insert takeoff_exports", "insert into public.takeoff_exports (order_id, export_no, is_draft, snapshot, snapshot_sha256, calculation_version, profile_schema_version, workspace_revision, order_revision, created_by_type) values (gen_random_uuid(),1,true,'{}','x','v',1,1,1,'staff')"],
    ["execute takeoff_commit", "select public.takeoff_commit(gen_random_uuid(), 1, '{}'::jsonb, '{\"type\":\"staff\"}'::jsonb, null)"],
    ["execute takeoff_place_order", "select public.takeoff_place_order(null,null,1,'[]','[]',null,current_date,false,null,null)"],
  ]) {
    await c.query("BEGIN"); await c.query(`SET LOCAL ROLE ${role}`);
    let result;
    try { await c.query(stmt); result = "ALLOWED (unexpected)"; } catch (e) { result = /permission denied/.test(e.message) ? "denied ✓" : `error: ${e.message}`; }
    await c.query("ROLLBACK");
    probes.push({ role, label, result });
  }
}
await db.close();

const bool = (b) => (b ? "yes" : "no");
const allRls = tables.every((t) => t.rls && t.policies === 0 && !t.anon_select && !t.auth_select && !t.auth_insert && t.svc_select);
const allFns = funcs.every((f) => !f.public_exec && !f.anon_exec && !f.auth_exec && f.svc_exec && !f.security_definer && /search_path=/.test(f.config));
const allProbes = probes.every((p) => p.result === "denied ✓");
lines.push(`# Migration 206 verification (isolated Postgres)`, "",
  `- Database: ${version}`, `- Migration file: \`supabase/migrations/206_takeoff_foundation.sql\` sha256 \`${createHash("sha256").update(sql).digest("hex")}\``,
  `- Applied to a fresh database with the Supabase-shaped base stub (\`scripts/tests/fixtures/takeoff-db-stub.sql\`): **PASS**`,
  `- Re-applied on top of itself (idempotency): **${reapply}**`,
  `- Tables: ${tables.length}; RLS on with no client policies and no anon/authenticated privileges: **${allRls ? "PASS" : "FAIL"}**`,
  `- Functions: ${funcs.length}; SECURITY INVOKER, pinned search_path, EXECUTE only for service_role: **${allFns ? "PASS" : "FAIL"}**`,
  `- Client-role access probes: **${allProbes ? "PASS (all denied)" : "FAIL"}**`,
  `- Generated: ${new Date().toISOString()} in ${((Date.now() - t0) / 1000).toFixed(1)} s`, "",
  "> This is an isolated database. Migration 206 has NOT been applied to production — see the read-only live probe.", "",
  "## Tables", "", "| table | RLS | policies | anon SELECT | authenticated SELECT | authenticated INSERT | service_role SELECT |", "|---|---|---|---|---|---|---|",
  ...tables.map((t) => `| ${t.table} | ${bool(t.rls)} | ${t.policies} | ${bool(t.anon_select)} | ${bool(t.auth_select)} | ${bool(t.auth_insert)} | ${bool(t.svc_select)} |`), "",
  "## Functions", "", "| function | security definer | config | PUBLIC exec | anon exec | authenticated exec | service_role exec |", "|---|---|---|---|---|---|---|",
  ...funcs.map((f) => `| ${f.fn}(${f.args}) | ${bool(f.security_definer)} | ${f.config} | ${bool(f.public_exec)} | ${bool(f.anon_exec)} | ${bool(f.auth_exec)} | ${bool(f.svc_exec)} |`), "",
  "## Triggers", "", "| table | trigger | events | timing |", "|---|---|---|---|", ...triggers.map((t) => `| ${t.table} | ${t.trigger_name} | ${t.events} | ${t.action_timing} |`), "",
  "## CHECK constraints (takeoff_*)", "", ...checks.map((x) => `- ${x.table}.${x.conname}: \`${x.def}\``), "",
  "## job_documents additive columns", "", ...jdCols.map((x) => `- ${x.column_name} (${x.data_type})`), "",
  "## Storage buckets", "", ...buckets.map((b) => `- ${b.id}: public=${b.public}`), "",
  "## Client-role access probes", "", "| role | attempt | result |", "|---|---|---|", ...probes.map((p) => `| ${p.role} | ${p.label} | ${p.result} |`), "");
writeFileSync(out, lines.join("\n"));
console.log(lines.slice(0, 12).join("\n"));
process.exit(allRls && allFns && allProbes && reapply === "PASS" ? 0 : 1);
