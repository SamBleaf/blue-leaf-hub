#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Blue Leaf Hub — LOCAL REGISTER SANDBOX runner (DEV / TEST ONLY)
// ════════════════════════════════════════════════════════════════════════════
// A disposable, fully local Supabase-compatible stack:
//   Postgres 17  localhost:54329 (+ unix socket in ~/.blh-register-sandbox/run)
//   PostgREST    127.0.0.1:54330 (role authenticator)
//   Gateway      localhost:54321 (/rest/v1 → PostgREST, /auth/v1, /storage/v1)
// ZERO connection to production: never reads the repo .env, never connects to
// any remote host. Runtime data/secrets live in ~/.blh-register-sandbox/.
//
// Usage: node scripts/dev/register-sandbox/sandbox.mjs <command> [--force]
//   init       fresh cluster + shim + all migrations + workarounds + seed + buckets
//              + postgrest.conf + secrets + hub.env (refuses if pg/ exists unless --force)
//   start      start Postgres            stop    stop Postgres
//   status     cluster / migration / port status
//   reset      drop + recreate DB `blh`, re-apply shim + migrations + seed (wipes storage)
//   migrate    apply migration files not yet recorded in sandbox_meta.sandbox_migrations
//   report     regenerate scripts/dev/register-sandbox/MIGRATION_REPORT.md from the tracking table
//   psql       print the psql connection command
//   postgrest  run PostgREST in the foreground with the generated config
//   gateway    run the Supabase-compatible gateway in the foreground
//   api        run the Hub API (server/dev-api.mjs) against the sandbox with a CLEAN env
//              (cwd = ~/.blh-register-sandbox/hub-cwd so dotenv never loads the repo .env;
//              macOS: outbound network limited to loopback via sandbox-exec; --allow-network opts out)
//   vite       run the Vite SPA on http://localhost:5184 with import.meta.env from hub.env ONLY
//              (envDir = hub-cwd; /api proxied to the sandbox Hub API on :8797; same isolation)
// ════════════════════════════════════════════════════════════════════════════
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync,
  symlinkSync, unlinkSync, writeFileSync, lstatSync, readlinkSync
} from "node:fs";
import net from "node:net";
import { join, basename } from "node:path";
import {
  HERE, REPO, MIGRATIONS_DIR, WORKAROUNDS_DIR, SB_DIR, PGDATA, RUN_DIR, LOG_DIR, STORAGE_DIR,
  SECRETS_FILE, CREDS_FILE, PGRST_CONF, HUB_ENV, HUB_CWD, PG_PORT, PGRST_PORT, GATEWAY_PORT,
  DB_NAME, DB_SUPERUSER, PG_BIN, POSTGREST_BIN, PUBLIC_URL, repoRequire, readJson, scrubbedEnv
} from "./lib.mjs";

const SHIM_SQL = join(HERE, "shim.sql");
const SEED_SQL = join(HERE, "seed.sql");
const BUCKETS = ["lead-documents", "templates", "job-plans", "site-media", "marketing-media", "branding",
  "job-cost-receipts", "takeoff-exports"];

const bin = (name) => join(PG_BIN, name);
const log = (...a) => console.log("[sandbox]", ...a);
const die = (msg, code = 1) => { console.error(`[sandbox] ERROR: ${msg}`); process.exit(code); };

// ── helpers ──────────────────────────────────────────────────────────────────
function randomString(len, alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789") {
  const out = [];
  while (out.length < len) {
    for (const b of randomBytes(len * 2)) {
      if (b < 256 - (256 % alphabet.length)) out.push(alphabet[b % alphabet.length]);
      if (out.length === len) break;
    }
  }
  return out.join("");
}

function writePrivate(file, content) {
  writeFileSync(file, content, { mode: 0o600 });
  chmodSync(file, 0o600);
}

function ensureDirs() {
  for (const d of [SB_DIR, RUN_DIR]) { mkdirSync(d, { recursive: true, mode: 0o700 }); chmodSync(d, 0o700); }
  for (const d of [LOG_DIR, STORAGE_DIR]) mkdirSync(d, { recursive: true, mode: 0o700 });
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { env: scrubbedEnv(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.error) throw r.error;
  return r;
}

function psqlArgs(db = DB_NAME) {
  return ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", RUN_DIR, "-p", String(PG_PORT), "-U", DB_SUPERUSER, "-d", db];
}

function psql(args, { db = DB_NAME, input } = {}) {
  return run(bin("psql"), [...psqlArgs(db), ...args], {
    input,
    env: scrubbedEnv({ PGOPTIONS: "-c client_min_messages=warning" })
  });
}

function psqlOk(args, opts) {
  const r = psql(args, opts);
  if (r.status !== 0) throw new Error(`psql failed (${r.status}):\n${r.stderr || r.stdout}`);
  return r.stdout;
}

/** Run a single SQL string and return tuples-only, unaligned output lines. */
function sqlRows(sql, opts) {
  return psqlOk(["-A", "-t", "-F", "\t", "-c", sql], opts).split("\n").filter((l) => l.length);
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

function pgRunning() {
  if (!existsSync(join(PGDATA, "PG_VERSION"))) return false;
  const r = run(bin("pg_ctl"), ["-D", PGDATA, "status"]);
  return r.status === 0;
}

function portOpen(port, host = "127.0.0.1") {
  return new Promise((res) => {
    const s = net.connect({ port, host });
    s.once("connect", () => { s.destroy(); res(true); });
    s.once("error", () => res(false));
    s.setTimeout(800, () => { s.destroy(); res(false); });
  });
}

// ── secrets / credentials (generated once, outside the repo) ────────────────
function loadOrCreateSecrets() {
  if (existsSync(SECRETS_FILE)) return readJson(SECRETS_FILE);
  const jwt = repoRequire("jsonwebtoken");
  const jwt_secret = randomString(48);
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 10 * 365 * 24 * 3600;
  const anon_key = jwt.sign({ iss: "supabase", ref: "blh-register-sandbox", role: "anon", iat, exp }, jwt_secret, { algorithm: "HS256", noTimestamp: true });
  const service_key = jwt.sign({ iss: "supabase", ref: "blh-register-sandbox", role: "service_role", iat, exp }, jwt_secret, { algorithm: "HS256", noTimestamp: true });
  const secrets = {
    _comment: "Blue Leaf Hub LOCAL REGISTER SANDBOX secrets — dev/test only, never commit, never use against production.",
    jwt_secret,
    anon_key,
    service_key,
    postgres_password: randomString(32),
    authenticator_password: randomString(32),
    created_at: new Date().toISOString()
  };
  writePrivate(SECRETS_FILE, JSON.stringify(secrets, null, 2) + "\n");
  log(`generated ${SECRETS_FILE}`);
  return secrets;
}

function loadOrCreateCreds() {
  if (existsSync(CREDS_FILE)) return readJson(CREDS_FILE);
  const creds = {
    _comment: "Blue Leaf Hub LOCAL REGISTER SANDBOX logins — dev/test only. Recreated by seed on init/reset.",
    staff: { id: randomUUID(), email: "register.sandbox@blueleaf.test", password: randomString(24), role: "admin" },
    client: { id: randomUUID(), email: "client.sandbox@blueleaf.test", password: randomString(24), role: "client" }
  };
  writePrivate(CREDS_FILE, JSON.stringify(creds, null, 2) + "\n");
  log(`generated ${CREDS_FILE}`);
  return creds;
}

// ── config files ────────────────────────────────────────────────────────────
function writePostgrestConf(secrets) {
  const conf = `# Blue Leaf Hub LOCAL REGISTER SANDBOX — PostgREST config (generated by sandbox.mjs; dev/test only)
db-uri = "postgres://authenticator:${secrets.authenticator_password}@localhost:${PG_PORT}/${DB_NAME}"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public, extensions"
db-channel-enabled = true
db-channel = "pgrst"
db-max-rows = 1000
db-pool = 10
db-plan-enabled = false
server-host = "127.0.0.1"
server-port = ${PGRST_PORT}
jwt-secret = "${secrets.jwt_secret}"
jwt-secret-is-base64 = false
openapi-mode = "follow-privileges"
log-level = "warn"
`;
  writePrivate(PGRST_CONF, conf);
}

function writeHubEnv(secrets) {
  const env = [
    `SUPABASE_URL=${PUBLIC_URL}`,
    `VITE_SUPABASE_URL=${PUBLIC_URL}`,
    `SUPABASE_SERVICE_ROLE_KEY=${secrets.service_key}`,
    `VITE_SUPABASE_ANON_KEY=${secrets.anon_key}`,
    `PORT_API=8797`,
    `NODE_ENV=development`
  ].join("\n") + "\n";
  writePrivate(HUB_ENV, env);
  // hub-cwd: a working directory whose .env IS hub.env, so `dotenv` (which reads <cwd>/.env)
  // can never pick up the repo's production .env. cwd-relative asset dirs are symlinked back.
  mkdirSync(HUB_CWD, { recursive: true, mode: 0o700 });
  writePrivate(join(HUB_CWD, ".env"), env);
  linkHubCwd();
}

// cwd-relative paths the Hub + Vite/Tailwind resolve from the working directory, (re)pointed at THIS
// checkout every time — so a home-directory run copy never reads through to a Desktop checkout (macOS TCC
// blocks app-launched processes there) and Tailwind finds the Hub theme (tailwind/postcss config + content).
function linkHubCwd() {
  mkdirSync(HUB_CWD, { recursive: true, mode: 0o700 });
  for (const d of ["docs", "src", "public", "shared", "index.html", "tailwind.config.js", "postcss.config.js"]) {
    const link = join(HUB_CWD, d);
    const target = join(REPO, d);
    let current = null;
    try { if (lstatSync(link).isSymbolicLink()) current = readlinkSync(link); else continue; } catch { /* missing */ }
    if (current === target) continue;
    if (current !== null) unlinkSync(link);
    if (existsSync(target)) symlinkSync(target, link);
  }
}

// ── cluster lifecycle ───────────────────────────────────────────────────────
function initCluster(secrets) {
  const pwfile = join(SB_DIR, ".pwfile");
  writePrivate(pwfile, secrets.postgres_password + "\n");
  try {
    const r = run(bin("initdb"), ["-D", PGDATA, "-U", DB_SUPERUSER, "--locale=C", "--encoding=UTF8",
      "--auth-local=trust", "--auth-host=scram-sha-256", `--pwfile=${pwfile}`]);
    if (r.status !== 0) throw new Error(`initdb failed:\n${r.stderr || r.stdout}`);
  } finally {
    try { unlinkSync(pwfile); } catch { /* ignore */ }
  }
  appendFileSync(join(PGDATA, "postgresql.conf"), `
# ── Blue Leaf Hub LOCAL REGISTER SANDBOX (appended by sandbox.mjs) ──
listen_addresses = 'localhost'
port = ${PG_PORT}
unix_socket_directories = '${RUN_DIR}'
unix_socket_permissions = 0700
max_connections = 60
logging_collector = off
log_min_messages = warning
log_min_error_statement = error
timezone = 'UTC'
`);
}

function startPg() {
  if (pgRunning()) { log("postgres already running"); return; }
  if (!existsSync(join(PGDATA, "PG_VERSION"))) die(`no cluster at ${PGDATA} — run init first`);
  const r = run(bin("pg_ctl"), ["-D", PGDATA, "-l", join(LOG_DIR, "postgres.log"), "-w", "-t", "60", "start"]);
  if (r.status !== 0) die(`pg_ctl start failed:\n${r.stderr || r.stdout}\nsee ${join(LOG_DIR, "postgres.log")}`);
  log(`postgres started on localhost:${PG_PORT} (socket ${RUN_DIR})`);
}

function stopPg() {
  if (!pgRunning()) { log("postgres not running"); return; }
  const r = run(bin("pg_ctl"), ["-D", PGDATA, "-m", "fast", "-w", "stop"]);
  if (r.status !== 0) die(`pg_ctl stop failed:\n${r.stderr || r.stdout}`);
  log("postgres stopped");
}

function createDb() {
  psqlOk(["-c", `CREATE DATABASE ${DB_NAME} TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`], { db: "postgres" });
}

function dropDb() {
  psqlOk(["-c", `DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`], { db: "postgres" });
}

// ── schema application ──────────────────────────────────────────────────────
function applyShim(secrets) {
  const r = psql(["-v", `authenticator_password=${secrets.authenticator_password}`, "-f", SHIM_SQL]);
  if (r.status !== 0) throw new Error(`shim.sql failed:\n${r.stderr}`);
  log("shim applied");
}

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
}

function workaroundFor(file) {
  const base = file.replace(/\.sql$/, "");
  const before = join(WORKAROUNDS_DIR, `${base}.before.sql`);
  const after = join(WORKAROUNDS_DIR, `${base}.after.sql`);
  return { before: existsSync(before) ? before : null, after: existsSync(after) ? after : null };
}

function appliedMigrations() {
  return new Set(sqlRows("SELECT filename FROM sandbox_meta.sandbox_migrations"));
}

function summariseError(stderr) {
  const lines = (stderr || "").split("\n").filter((l) => l.trim() && !/^WARNING:\s+there is (no|already a) transaction/.test(l));
  const i = lines.findIndex((l) => /ERROR:/.test(l));
  return (i >= 0 ? lines.slice(i, i + 8) : lines.slice(-8)).join("\n");
}

function applyMigrations({ stopOnError = false } = {}) {
  const files = migrationFiles();
  const done = appliedMigrations();
  const results = [];
  for (const f of files) {
    if (done.has(f)) { results.push({ file: f, status: "already-applied" }); continue; }
    const full = join(MIGRATIONS_DIR, f);
    const checksum = createHash("sha256").update(readFileSync(full)).digest("hex");
    const wa = workaroundFor(f);
    const used = [wa.before, wa.after].filter(Boolean).map((p) => basename(p));
    const args = ["-1"];
    if (wa.before) args.push("-f", wa.before);
    args.push("-f", full);
    if (wa.after) args.push("-f", wa.after);
    args.push("-c", `INSERT INTO sandbox_meta.sandbox_migrations (filename, checksum, workarounds) VALUES (${lit(f)}, ${lit(checksum)}, ARRAY[${used.map(lit).join(",")}]::text[]) ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum, workarounds = EXCLUDED.workarounds, applied_at = now()`);
    const t0 = Date.now();
    const r = psql(args);
    const ms = Date.now() - t0;
    if (r.status === 0) {
      results.push({ file: f, status: "applied", ms, workarounds: used });
      console.log(`  ok    ${f}${used.length ? `  (+ ${used.join(", ")})` : ""}  ${ms}ms`);
    } else {
      const error = summariseError(r.stderr);
      results.push({ file: f, status: "failed", ms, workarounds: used, error });
      console.log(`  FAIL  ${f}\n${error.replace(/^/gm, "        ")}`);
      if (stopOnError) break;
    }
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const payload = JSON.stringify({ at: new Date().toISOString(), results }, null, 2);
  writeFileSync(join(LOG_DIR, `migrate-${stamp}.json`), payload);
  writeFileSync(join(LOG_DIR, "last-migrate.json"), payload);
  const applied = results.filter((r) => r.status === "applied").length;
  const failed = results.filter((r) => r.status === "failed");
  log(`migrations: ${applied} applied now, ${results.filter((r) => r.status === "already-applied").length} already applied, ${failed.length} failed (of ${files.length} files)`);
  return { results, failed };
}

function applySeed(creds) {
  const r = psql([
    "-v", `staff_id=${creds.staff.id}`, "-v", `staff_email=${creds.staff.email}`, "-v", `staff_password=${creds.staff.password}`,
    "-v", `client_id=${creds.client.id}`, "-v", `client_email=${creds.client.email}`, "-v", `client_password=${creds.client.password}`,
    "-f", SEED_SQL
  ]);
  if (r.status !== 0) throw new Error(`seed.sql failed:\n${r.stderr}`);
  const buckets = sqlRows("SELECT id FROM storage.buckets ORDER BY id");
  for (const b of new Set([...buckets, ...BUCKETS])) mkdirSync(join(STORAGE_DIR, b), { recursive: true });
  log(`seeded staff ${creds.staff.email} (admin) + client ${creds.client.email} (client); buckets: ${buckets.join(", ")}`);
}

function applyEverything(secrets, creds, opts) {
  applyShim(secrets);
  const m = applyMigrations(opts);
  try { applySeed(creds); } catch (e) { console.error(String(e.message || e)); m.seedError = String(e.message || e); }
  psqlOk(["-c", "NOTIFY pgrst, 'reload schema'"]);
  return m;
}

function wipeStorage() {
  rmSync(STORAGE_DIR, { recursive: true, force: true });
  mkdirSync(STORAGE_DIR, { recursive: true, mode: 0o700 });
}

// ── commands ────────────────────────────────────────────────────────────────
async function cmdInit(flags) {
  if (existsSync(PGDATA) && !flags.force) die(`${PGDATA} already exists — use 'reset' to rebuild the DB, or 'init --force' to recreate the cluster`);
  if (existsSync(PGDATA)) {
    if (pgRunning()) stopPg();
    rmSync(PGDATA, { recursive: true, force: true });
    log(`removed old cluster ${PGDATA}`);
  }
  ensureDirs();
  wipeStorage();
  const secrets = loadOrCreateSecrets();
  const creds = loadOrCreateCreds();
  initCluster(secrets);
  log(`cluster initialised at ${PGDATA}`);
  startPg();
  createDb();
  const m = applyEverything(secrets, creds, flags);
  writePostgrestConf(secrets);
  writeHubEnv(secrets);
  log(`wrote ${PGRST_CONF}, ${HUB_ENV}, ${HUB_CWD}/.env`);
  printNext();
  if (m.failed.length || m.seedError) process.exitCode = 2;
}

function cmdReset(flags) {
  ensureDirs();
  startPg();
  const secrets = loadOrCreateSecrets();
  const creds = loadOrCreateCreds();
  dropDb();
  createDb();
  wipeStorage();
  log(`database ${DB_NAME} recreated, storage wiped`);
  const m = applyEverything(secrets, creds, flags);
  writePostgrestConf(secrets);
  writeHubEnv(secrets);
  log("reset complete — if PostgREST is running it reloads automatically (NOTIFY sent); restart it if it lost its pool");
  if (m.failed.length || m.seedError) process.exitCode = 2;
}

function cmdMigrate(flags) {
  if (!pgRunning()) die("postgres is not running — run: sandbox.mjs start");
  const pending = migrationFiles().filter((f) => !appliedMigrations().has(f));
  if (!pending.length) { log("no pending migrations"); return; }
  log(`pending: ${pending.join(", ")}`);
  const m = applyMigrations(flags);
  psqlOk(["-c", "NOTIFY pgrst, 'reload schema'"]);
  if (m.failed.length) process.exitCode = 2;
}

async function cmdStatus() {
  const running = pgRunning();
  console.log(`sandbox dir : ${SB_DIR}`);
  console.log(`postgres    : ${running ? "RUNNING" : "stopped"}  localhost:${PG_PORT}  socket ${RUN_DIR}  data ${PGDATA}`);
  if (running) {
    try {
      const files = migrationFiles();
      const done = appliedMigrations();
      const pending = files.filter((f) => !done.has(f));
      console.log(`migrations  : ${done.size}/${files.length} applied${pending.length ? `; pending/failed: ${pending.join(", ")}` : ""}`);
      const [users] = sqlRows("SELECT count(*) FROM auth.users");
      const [tables] = sqlRows("SELECT count(*) FROM pg_tables WHERE schemaname = 'public'");
      console.log(`db ${DB_NAME}      : ${tables} public tables, ${users} auth users`);
    } catch (e) { console.log(`db          : not initialised (${String(e.message).split("\n")[0]})`); }
  }
  console.log(`postgrest   : ${(await portOpen(PGRST_PORT)) ? "LISTENING" : "not running"}  127.0.0.1:${PGRST_PORT}`);
  console.log(`gateway     : ${(await portOpen(GATEWAY_PORT)) ? "LISTENING" : "not running"}  ${PUBLIC_URL}`);
  console.log(`hub.env     : ${existsSync(HUB_ENV) ? HUB_ENV : "(missing)"}`);
}

function cmdPsql() {
  console.log(`${bin("psql")} -h ${RUN_DIR} -p ${PG_PORT} -U ${DB_SUPERUSER} -d ${DB_NAME}`);
  console.log(`# TCP alternative (password = postgres_password in ${SECRETS_FILE}):`);
  console.log(`#   ${bin("psql")} "postgresql://${DB_SUPERUSER}@localhost:${PG_PORT}/${DB_NAME}"`);
}

function foreground(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: "inherit", ...opts });
  const fwd = (sig) => { try { child.kill(sig); } catch { /* gone */ } };
  process.on("SIGINT", () => fwd("SIGINT"));
  process.on("SIGTERM", () => fwd("SIGTERM"));
  child.on("exit", (code, sig) => process.exit(code ?? (sig ? 1 : 0)));
}

function cmdPostgrest() {
  if (!existsSync(PGRST_CONF)) die(`missing ${PGRST_CONF} — run init`);
  if (!existsSync(POSTGREST_BIN)) die(`postgrest not found at ${POSTGREST_BIN} — brew install postgrest`);
  foreground(POSTGREST_BIN, [PGRST_CONF], { env: scrubbedEnv() });
}

function cmdGateway() {
  foreground(process.execPath, [join(HERE, "gateway.mjs")], { env: scrubbedEnv() });
}

/** Hub API against the sandbox. Clean env (no inherited secrets) + cwd whose .env is hub.env,
 *  because server modules call dotenv's config() which reads <cwd>/.env and would otherwise load
 *  the repo's PRODUCTION .env (mail, Dropbox, Anthropic, Xero …). */
function hubProcessEnv() {
  if (!existsSync(HUB_ENV)) die(`missing ${HUB_ENV} — run init`);
  if (!existsSync(join(HUB_CWD, ".env"))) writeHubEnv(loadOrCreateSecrets());
  linkHubCwd();
  const hubEnv = {};
  for (const line of readFileSync(HUB_ENV, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) hubEnv[m[1]] = m[2];
  }
  const keep = {};
  for (const k of ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TERM"]) if (process.env[k]) keep[k] = process.env[k];
  return { ...keep, ...hubEnv };
}

/** Defence in depth (macOS): run under sandbox-exec with ALL outbound network denied except
 *  loopback + unix sockets, so no code path can reach production or any third party. */
function runIsolated(label, args, env) {
  if (process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec") && !flags.allowNetwork) {
    const profile = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))(allow network-outbound (remote unix-socket))';
    log(`${label} (cwd ${HUB_CWD}; env = hub.env only; outbound network = loopback only)`);
    foreground("/usr/bin/sandbox-exec", ["-p", profile, process.execPath, ...args], { cwd: HUB_CWD, env });
  } else {
    log(`${label} (cwd ${HUB_CWD}; env = hub.env only; outbound network NOT restricted)`);
    foreground(process.execPath, args, { cwd: HUB_CWD, env });
  }
}

function cmdApi() {
  const env = hubProcessEnv();
  runIsolated(`starting Hub API on http://localhost:${env.PORT_API}`, [join(REPO, "server", "dev-api.mjs")], env);
}

/** Vite SPA against the sandbox: envDir = hub-cwd (never the repo .env), port 5184, /api → :8797. */
function cmdVite() {
  const env = hubProcessEnv();
  runIsolated("starting Vite SPA on http://localhost:5184 (/api → sandbox Hub API)",
    [join(REPO, "node_modules", "vite", "bin", "vite.js"), "--config", join(HERE, "vite.sandbox.config.mjs")], env);
}

/** Regenerate MIGRATION_REPORT.md from the DB tracking table + the last migrate log. */
function cmdReport() {
  if (!pgRunning()) die("postgres is not running — run: sandbox.mjs start");
  const files = migrationFiles();
  const applied = new Map(sqlRows("SELECT filename, array_to_string(workarounds, ' '), to_char(applied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') FROM sandbox_meta.sandbox_migrations")
    .map((l) => { const [f, w, at] = l.split("\t"); return [f, { w, at }]; }));
  let last = { results: [] };
  try { last = readJson(join(LOG_DIR, "last-migrate.json")); } catch { /* none */ }
  const lastBy = new Map(last.results.map((r) => [r.file, r]));
  const nums = files.map((f) => parseInt(f, 10)).filter(Number.isFinite);
  const missing = [];
  for (let n = 1; n <= Math.max(...nums); n++) if (!nums.includes(n)) missing.push(String(n).padStart(3, "0"));
  const failed = files.filter((f) => !applied.has(f));
  const withWa = files.filter((f) => applied.get(f)?.w);
  const pgVer = sqlRows("SHOW server_version")[0];
  const pgrstVer = existsSync(POSTGREST_BIN) ? run(POSTGREST_BIN, ["--version"]).stdout.trim() : "postgrest not installed";
  const rows = files.map((f) => {
    const a = applied.get(f);
    const l = lastBy.get(f);
    const status = a ? "applied" : (l?.status === "failed" ? "**FAILED**" : "pending");
    const note = a ? (a.w ? `workaround: ${a.w}` : "") : (l?.error ? l.error.split("\n")[0].replace(/\|/g, "\\|") : "");
    return `| ${f} | ${status} | ${l?.ms ?? ""} | ${note} |`;
  });
  const md = `# Register sandbox — migration report

> Generated by \`node scripts/dev/register-sandbox/sandbox.mjs report\` — ${new Date().toISOString()}
> DEV / TEST ONLY. Local Postgres ${pgVer} + ${pgrstVer}. Nothing here touched production.

## Summary

| | |
|---|---|
| Migration files in \`supabase/migrations/\` | **${files.length}** (${files[0]} … ${files[files.length - 1]}) |
| Applied cleanly (in filename sort order, one \`psql -1 -v ON_ERROR_STOP=1\` run each) | **${files.length - failed.length}** |
| Failed / not applied | **${failed.length}**${failed.length ? ` — ${failed.join(", ")}` : ""} |
| Per-migration workarounds used (\`workarounds/<name>.before.sql\` / \`.after.sql\`) | **${withWa.length}**${withWa.length ? ` — ${withWa.join(", ")}` : " (none needed — the \`workarounds/\` dir does not exist)"} |
| Numbers absent from the sequence | ${missing.join(", ") || "none"} (extra suffixed file: ${files.filter((f) => /^\d+[a-z]_/.test(f)).join(", ") || "none"}) |

Everything platform-specific was handled in \`shim.sql\` (applied first); no migration file was edited.

## What the migrations needed from the Supabase platform (provided by shim.sql)

- \`auth.uid()\` in ~80 RLS policies / functions; \`auth.users(id)\` as an FK target (~70 references).
- Roles \`anon\` / \`authenticated\` / \`service_role\` (policy targets, GRANTs) and \`authenticator\`
  (095_control_tower.sql: \`GRANT control_tower_ro TO authenticator\`).
- \`storage.buckets\` inserts (099, 152, 204, 206) and \`storage.objects\` policies (047, 060, 186, 204);
  \`storage.foldername()\` (047).
- \`uuid_generate_v4()\` (025) — uuid-ossp in schema \`extensions\`, on the Supabase search_path.
- Supabase default privileges (tables/sequences/functions created by \`postgres\` are granted to the API roles).

## Notes

- 111, 117, 186, 206 contain their own \`BEGIN; … COMMIT;\`. Under \`psql -1\` the inner COMMIT ends the
  wrapper transaction early (harmless WARNINGs); an error after that point would not roll back the earlier
  statements of that file. All four applied cleanly.
- The sequence has no 018/019/076/080; 103b_portal_v2_backfill.sql sorts after 103_client_portal_v2.sql.
- RLS observation as of 2026-11-07 (not a migration failure): \`public.internal_categories\` (mig 200) has policy
  \`auth_users FOR ALL TO authenticated USING (true) WITH CHECK (true)\` and no restrictive \`deny_clients\`
  (it post-dates 104), so a portal CLIENT JWT can read and modify it directly via PostgREST. Verified in the
  sandbox (smoke check e7; a client-role UPDATE inside a rolled-back transaction hit all 6 seed rows).

## Per-migration outcome

| file | status | ms | note |
|---|---|---|---|
${rows.join("\n")}
`;
  writeFileSync(join(HERE, "MIGRATION_REPORT.md"), md);
  log(`wrote ${join(HERE, "MIGRATION_REPORT.md")} (${files.length - failed.length}/${files.length} applied)`);
}

function printNext() {
  console.log(`
Next (each in its own terminal, from ${REPO}):
  node scripts/dev/register-sandbox/sandbox.mjs postgrest   # PostgREST  127.0.0.1:${PGRST_PORT}
  node scripts/dev/register-sandbox/sandbox.mjs gateway     # Gateway    ${PUBLIC_URL}
  node scripts/dev/register-sandbox/smoke.mjs               # smoke test (starts/stops its own children)
Secrets: ${SECRETS_FILE}   Logins: ${CREDS_FILE}   Hub env: ${HUB_ENV}`);
}

// ── main ────────────────────────────────────────────────────────────────────
const [cmd, ...rest] = process.argv.slice(2);
const flags = { force: rest.includes("--force"), stopOnError: rest.includes("--stop-on-error"), allowNetwork: rest.includes("--allow-network") };
const commands = {
  init: () => cmdInit(flags), start: () => { ensureDirs(); startPg(); }, stop: stopPg, status: cmdStatus,
  reset: () => cmdReset(flags), migrate: () => cmdMigrate(flags), psql: cmdPsql,
  postgrest: cmdPostgrest, gateway: cmdGateway, api: cmdApi, vite: cmdVite, report: cmdReport
};
if (!commands[cmd]) {
  const lines = readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1);
  const header = lines.slice(0, lines.findIndex((l) => !l.startsWith("//")));
  console.log(header.filter((l) => !/^\/\/ ═/.test(l)).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(cmd ? 1 : 0);
}
try { await commands[cmd](); } catch (e) { die(e.stack || String(e)); }
