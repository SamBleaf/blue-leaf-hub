// =============================================================================
// Isolated Postgres for takeoff DB tests. NEVER touches Supabase / production.
//
//   TAKEOFF_TEST_DB_URL=postgres://...  use an existing throwaway server (CI service container)
//   (unset)                             start a private local cluster with the Homebrew/apt
//                                       `initdb` + `pg_ctl` binaries in $TMPDIR/blh-takeoff-pg
//
// A fresh database is created per run, the Supabase-shaped stub is applied, then the REAL
// migration file 206 — so tests exercise the SQL that would ship.
// =============================================================================
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

const ROOT = new URL("../../../", import.meta.url);
const STUB = new URL("scripts/tests/fixtures/takeoff-db-stub.sql", ROOT);
const MIGRATIONS = ["supabase/migrations/206_takeoff_foundation.sql"];

function findBin(name) {
  for (const dir of ["/opt/homebrew/bin", "/opt/homebrew/opt/postgresql@17/bin", "/usr/local/bin", "/usr/lib/postgresql/17/bin", "/usr/lib/postgresql/16/bin", "/usr/bin"]) {
    if (existsSync(join(dir, name))) return join(dir, name);
  }
  return null;
}

function assertSafeUrl(url) {
  if (/supabase\.(co|com|in)|pooler\.supabase|amazonaws\.com|railway/i.test(url)) {
    throw new Error("Refusing to run takeoff DB tests against a hosted database. Use a throwaway local/CI Postgres.");
  }
}

async function ensureLocalServer() {
  const port = Number(process.env.TAKEOFF_TEST_DB_PORT || 55432);
  const dataDir = join(tmpdir(), "blh-takeoff-pg");
  const initdb = findBin("initdb"), pgctl = findBin("pg_ctl");
  if (!initdb || !pgctl) return { skip: "No local Postgres binaries (initdb/pg_ctl) and TAKEOFF_TEST_DB_URL unset." };
  if (!existsSync(join(dataDir, "PG_VERSION"))) {
    mkdirSync(dataDir, { recursive: true });
    execFileSync(initdb, ["-D", dataDir, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C", "--no-instructions"], { stdio: "ignore", env: { ...process.env, LC_ALL: "C", LANG: "C" } });
  }
  const status = spawnSync(pgctl, ["-D", dataDir, "status"], { encoding: "utf8" });
  if (status.status !== 0) {
    // LC_ALL must be a valid locale or macOS postmaster aborts ("became multithreaded during startup").
    execFileSync(pgctl, ["-D", dataDir, "-l", join(dataDir, "server.log"), "-o", `-p ${port} -k ${dataDir} -c listen_addresses=127.0.0.1`, "-w", "start"],
      { stdio: "ignore", env: { ...process.env, LC_ALL: "C", LANG: "C" } });
  }
  return { url: `postgres://postgres@127.0.0.1:${port}/postgres` };
}

/** Create a fresh DB with stub + migration 206 applied. Returns { client, url, close } or { skip }. */
export async function freshTakeoffDb(name = "blh_takeoff_test", { migrate = true } = {}) {
  let adminUrl = process.env.TAKEOFF_TEST_DB_URL;
  if (!adminUrl) {
    const s = await ensureLocalServer();
    if (s.skip) return { skip: s.skip };
    adminUrl = s.url;
  }
  assertSafeUrl(adminUrl);
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = adminUrl.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(readFileSync(STUB, "utf8"));
  if (migrate) for (const m of MIGRATIONS) await client.query(readFileSync(new URL(m, ROOT), "utf8"));
  else await client.query("INSERT INTO storage.buckets (id, name, public) VALUES ('job-plans', 'job-plans', false)");
  return { client, url, close: () => client.end() };
}

/**
 * A PERSISTENT database for the local takeoff sandbox (created + migrated once, then reused).
 * Same safety rules: never a hosted database.
 */
export async function persistentTakeoffDb(name = "blh_takeoff_sandbox", { reset = false } = {}) {
  let adminUrl = process.env.TAKEOFF_TEST_DB_URL;
  if (!adminUrl) {
    const s = await ensureLocalServer();
    if (s.skip) return { skip: s.skip };
    adminUrl = s.url;
  }
  assertSafeUrl(adminUrl);
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  if (reset) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  const exists = (await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name])).rowCount > 0;
  if (!exists) await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = adminUrl.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
  if (!exists) {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    await c.query(readFileSync(STUB, "utf8"));
    for (const m of MIGRATIONS) await c.query(readFileSync(new URL(m, ROOT), "utf8"));
    await c.end();
  }
  return { url, created: !exists };
}

/** A second connection to the same DB (for concurrency tests). */
export async function connect(url) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
}
