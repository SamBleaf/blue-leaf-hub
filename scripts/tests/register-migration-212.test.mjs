/**
 * register-migration-212.test.mjs — Master Register R02 · Increment 2 DDL test (real Postgres).
 *
 * Spins up a DISPOSABLE Postgres cluster in the OS temp dir (initdb + pg_ctl, socket-only, no TCP,
 * no Docker), creates the minimal prerequisite schema (projects/leads/client_selections), applies
 * supabase/migrations/212_master_register_promotion.sql, and proves:
 *   • the ADD COLUMNs + room_scope_items + unique indexes land (and client_visible defaults TRUE),
 *   • the unique index lets many NULL source ids coexist (manual rows) but blocks a duplicate
 *     promoted id, and ON CONFLICT DO NOTHING is idempotent,
 *   • the ROLLBACK block fully reverses the migration,
 *   • re-applying the migration is idempotent.
 * The cluster is torn down and its directory removed at the end (always, even on failure).
 *
 * Requires: a local Postgres (initdb/pg_ctl/postgres on PATH) + the `pg` driver (both present in
 * this repo). Run: npm run test:register-212-db
 */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(__dirname, "../../supabase/migrations/212_master_register_promotion.sql");
const PORT = "5440";
const dataDir = mkdtempSync(join(tmpdir(), "mr212-pg-"));

let passed = 0, failed = 0, started = false;
function check(name, cond, detail = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? `\n    ${detail}` : ""}`); }
}

// LC_ALL=C avoids macOS "postmaster became multithreaded during startup" (bad inherited locale).
const PG_ENV = { ...process.env, LC_ALL: "C", LANG: "C" };
function pgctl(args) {
  return execFileSync("pg_ctl", ["-D", dataDir, ...args], { stdio: "pipe", env: PG_ENV });
}

/** Extract the ROLLBACK SQL from the migration's trailing comment block. */
function rollbackSql(sqlText) {
  const marker = "-- ROLLBACK";
  const idx = sqlText.indexOf(marker);
  if (idx === -1) return "";
  return sqlText
    .slice(idx)
    .split("\n")
    .filter((l) => l.startsWith("--   ")) // the indented SQL lines inside the comment block
    .map((l) => l.replace(/^--\s{3}/, ""))
    .join("\n");
}

async function main() {
  // 1. init + start a throwaway cluster (socket-only — no TCP listener).
  execFileSync("initdb", ["-D", dataDir, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C"], { stdio: "pipe", env: PG_ENV });
  const logFile = join(dataDir, "server.log");
  try {
    pgctl(["-l", logFile, "-o", `-p ${PORT} -k ${dataDir} -c listen_addresses=`, "-w", "start"]);
  } catch (e) {
    let log = ""; try { log = readFileSync(logFile, "utf8"); } catch { /* ignore */ }
    throw new Error(`pg_ctl start failed: ${e.message}\n${log}`);
  }
  started = true;

  const client = new pg.Client({ host: dataDir, port: PORT, user: "postgres", database: "postgres" });
  await client.connect();

  // 2. minimal prerequisite schema (the slice migration 212 touches).
  await client.query(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id uuid, address text, status text DEFAULT 'active'
    );
    CREATE TABLE leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text
    );
    CREATE TABLE client_selections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      category text NOT NULL, item_name text NOT NULL,
      room_area text, status text DEFAULT 'not_started',
      internal_notes text, sort_order integer DEFAULT 0,
      approved_at timestamptz, created_at timestamptz DEFAULT now()
    );
    -- RLS role the migration's policy grants to (service connection ignores RLS; just needs to exist).
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated')
      THEN CREATE ROLE authenticated; END IF; END $$;
  `);

  // 3. apply the migration.
  const sqlText = readFileSync(MIGRATION, "utf8");
  await client.query(sqlText);

  // 4. structure assertions.
  const cols = (await client.query(
    `SELECT column_name, data_type, column_default, is_nullable
       FROM information_schema.columns WHERE table_name='client_selections'`
  )).rows;
  const colMap = Object.fromEntries(cols.map((c) => [c.column_name, c]));
  check("client_selections.source_register_item_id added", !!colMap.source_register_item_id);
  check("client_selections.source_lead_id added", !!colMap.source_lead_id);
  check("client_selections.promoted_at added", !!colMap.promoted_at);
  check("client_selections.client_visible added, NOT NULL, default true",
    colMap.client_visible && colMap.client_visible.is_nullable === "NO" && /true/.test(colMap.client_visible.column_default || ""),
    JSON.stringify(colMap.client_visible));

  const rsiExists = (await client.query(`SELECT to_regclass('public.room_scope_items') AS t`)).rows[0].t;
  check("room_scope_items table created", rsiExists === "room_scope_items");

  const idx = (await client.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname='public'
       AND indexname IN ('client_selections_register_item_uq','room_scope_items_register_item_uq','idx_rsi_project')`
  )).rows.map((r) => r.indexname);
  check("client_selections unique index present", idx.includes("client_selections_register_item_uq"));
  check("room_scope_items unique index present", idx.includes("room_scope_items_register_item_uq"));
  check("room_scope_items project index present", idx.includes("idx_rsi_project"));

  // 5. seed a project + lead, then exercise the unique index semantics.
  const projectId = (await client.query(`INSERT INTO projects (job_id) VALUES (gen_random_uuid()) RETURNING id`)).rows[0].id;
  const leadId = (await client.query(`INSERT INTO leads (name) VALUES ('Jane') RETURNING id`)).rows[0].id;

  // Manual (client-created) rows carry NULL source id — many must coexist (NULLs distinct).
  await client.query(
    `INSERT INTO client_selections (project_id, category, item_name) VALUES ($1,'Flooring','Manual A'),($1,'Tiling','Manual B')`,
    [projectId]
  );
  const manualDefault = (await client.query(
    `SELECT client_visible FROM client_selections WHERE item_name='Manual A'`
  )).rows[0].client_visible;
  check("manual row defaults client_visible = true", manualDefault === true);

  // Two promoted rows (distinct stable ids) + a re-run that must be a no-op.
  const promote = async () => client.query(
    `INSERT INTO client_selections (project_id, source_register_item_id, source_lead_id, client_visible, category, item_name)
       VALUES ($1,'ri_a',$2,false,'Flooring','Oak'),($1,'ri_b',$2,false,'Benchtop','Stone')
       ON CONFLICT (project_id, source_register_item_id) DO NOTHING`,
    [projectId, leadId]
  );
  await promote();
  await promote(); // idempotent re-run
  const promotedCount = Number((await client.query(
    `SELECT count(*)::int AS n FROM client_selections WHERE source_register_item_id IS NOT NULL`
  )).rows[0].n);
  check("promoted rows idempotent (2 after two runs)", promotedCount === 2, `got ${promotedCount}`);

  const totalCount = Number((await client.query(`SELECT count(*)::int AS n FROM client_selections`)).rows[0].n);
  check("manual NULL-id rows coexist with promoted rows (4 total)", totalCount === 4, `got ${totalCount}`);

  // A third manual NULL row must still be allowed (NULLs are distinct in the unique index).
  await client.query(`INSERT INTO client_selections (project_id, category, item_name) VALUES ($1,'Paint','Manual C')`, [projectId]);
  check("additional NULL-id row allowed", true);

  // Promoting a DIFFERENT lead's duplicate stable id into the SAME project must conflict-skip.
  await promote();
  const stillTwo = Number((await client.query(
    `SELECT count(*)::int AS n FROM client_selections WHERE source_register_item_id IS NOT NULL`
  )).rows[0].n);
  check("duplicate promoted id blocked by unique index", stillTwo === 2, `got ${stillTwo}`);

  // room_scope_items idempotency.
  const rsiInsert = async () => client.query(
    `INSERT INTO room_scope_items (project_id, source_register_item_id, source_lead_id, item_kind, disposition, description)
       VALUES ($1,'ri_s1',$2,'scope','remove','Demolish wall')
       ON CONFLICT (project_id, source_register_item_id) DO NOTHING`,
    [projectId, leadId]
  );
  await rsiInsert(); await rsiInsert();
  const rsiCount = Number((await client.query(`SELECT count(*)::int AS n FROM room_scope_items`)).rows[0].n);
  check("room_scope_items idempotent (1 after two runs)", rsiCount === 1, `got ${rsiCount}`);

  // 6. ROLLBACK reverses everything.
  const rb = rollbackSql(sqlText);
  check("rollback SQL extracted from migration comment", rb.includes("DROP TABLE") && rb.includes("DROP COLUMN"));
  await client.query(rb);
  const rsiGone = (await client.query(`SELECT to_regclass('public.room_scope_items') AS t`)).rows[0].t;
  check("rollback drops room_scope_items", rsiGone === null);
  const colsAfter = (await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='client_selections'`
  )).rows.map((r) => r.column_name);
  check("rollback drops the 4 added columns",
    !["source_register_item_id", "source_lead_id", "promoted_at", "client_visible"].some((c) => colsAfter.includes(c)),
    colsAfter.join(","));

  // 7. re-apply the migration — idempotent/re-runnable.
  await client.query(sqlText);
  await client.query(sqlText); // twice
  const rsiBack = (await client.query(`SELECT to_regclass('public.room_scope_items') AS t`)).rows[0].t;
  check("migration re-applies cleanly (idempotent)", rsiBack === "room_scope_items");

  await client.end();
}

try {
  if (!existsSync(MIGRATION)) throw new Error("migration file not found: " + MIGRATION);
  await main();
} catch (e) {
  failed++;
  console.log(`  ✗ harness error\n    ${e.message}`);
} finally {
  if (started) { try { pgctl(["-m", "immediate", "-w", "stop"]); } catch { /* ignore */ } }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
