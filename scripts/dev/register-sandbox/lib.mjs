// Blue Leaf Hub — LOCAL REGISTER SANDBOX — shared paths/config (DEV / TEST ONLY).
// Never reads the repo's .env. Never connects anywhere but localhost:54329 / the sandbox socket.
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, "../../..");
export const MIGRATIONS_DIR = join(REPO, "supabase", "migrations");
export const WORKAROUNDS_DIR = join(HERE, "workarounds");

export const SB_DIR = resolve(process.env.BLH_SANDBOX_DIR || join(homedir(), ".blh-register-sandbox"));
export const PGDATA = join(SB_DIR, "pg");
export const RUN_DIR = join(SB_DIR, "run"); // unix socket dir (0700)
export const LOG_DIR = join(SB_DIR, "logs");
export const STORAGE_DIR = join(SB_DIR, "storage");
export const SECRETS_FILE = join(SB_DIR, "secrets.json");
export const CREDS_FILE = join(SB_DIR, "credentials.local.json");
export const PGRST_CONF = join(SB_DIR, "postgrest.conf");
export const HUB_ENV = join(SB_DIR, "hub.env");
export const HUB_CWD = join(SB_DIR, "hub-cwd");

export const PG_PORT = 54329;
export const PGRST_PORT = 54330;
export const GATEWAY_PORT = 54321;
export const DB_NAME = "blh";
export const DB_SUPERUSER = "postgres";
export const PUBLIC_URL = `http://localhost:${GATEWAY_PORT}`;

export const PG_BIN = process.env.PG_BIN || "/opt/homebrew/bin";
export const POSTGREST_BIN = process.env.POSTGREST_BIN || "/opt/homebrew/bin/postgrest";

// Hard guard: the runtime dir (secrets, credentials, data) must never live inside the repo.
{
  const rel = relative(REPO, SB_DIR);
  if (!rel.startsWith("..") && !isAbsolute(rel)) {
    throw new Error(`Refusing: sandbox dir ${SB_DIR} is inside the repo ${REPO} (secrets would land in git).`);
  }
}

/** require() bound to the repo's node_modules (pg, jsonwebtoken, @supabase/supabase-js). */
export const repoRequire = createRequire(join(REPO, "package.json"));

export function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function loadSecrets() {
  if (!existsSync(SECRETS_FILE)) {
    throw new Error(`No ${SECRETS_FILE} — run: node scripts/dev/register-sandbox/sandbox.mjs init`);
  }
  return readJson(SECRETS_FILE);
}

// Environment for child processes that talk to the sandbox Postgres: strips every PG-prefixed,
// DATABASE_URL and Supabase variable so nothing inherited from the shell can redirect a command
// at another server.
export function scrubbedEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^PG/.test(k) || /^(DATABASE_URL|SUPABASE_|VITE_SUPABASE_|POSTGRES)/.test(k)) continue;
    env[k] = v;
  }
  return { ...env, LC_ALL: "C", LANG: "C", PGCONNECT_TIMEOUT: "5", ...extra };
}
