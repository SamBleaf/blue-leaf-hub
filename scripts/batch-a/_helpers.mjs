/**
 * Batch A (W01–W05) test helpers — Days 6–8 hardening skeletons.
 * Run via: node scripts/batch-a/run-batch-a.mjs [--write]
 */
import { createClient } from "@supabase/supabase-js";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenvConfig({ path: join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env"), override: true });

export const API = process.env.BATCH_A_API_URL || "http://localhost:8787";
export const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
export const SB_ANON = process.env.VITE_SUPABASE_ANON_KEY;
export const SB_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const TEST_EMAIL = "ai-test-director@blueleafbuilding.test";
export const TEST_PASSWORD = "BlueLeaf-Test-2026!";
export const MARK = "__BATCH_A__";

export const WRITE = process.argv.includes("--write") || process.argv.includes("--all");

export function createRunner() {
  const stats = { passed: 0, failed: 0, skipped: 0, gapDocumented: 0, failures: [] };

  function pass(name) {
    console.log(`  ✓  ${name}`);
    stats.passed++;
  }

  function fail(name, reason) {
    console.log(`  ✗  ${name}`);
    console.log(`       → ${reason}`);
    stats.failed++;
    stats.failures.push({ name, reason });
  }

  function skip(name, reason) {
    console.log(`  -  ${name}  (skipped: ${reason})`);
    stats.skipped++;
  }

  function gap(name, detail) {
    console.log(`  ○  ${name}  (gap-documented: ${detail})`);
    stats.gapDocumented++;
    stats.passed++;
  }

  function section(title) {
    console.log(`\n── ${title} ${"─".repeat(Math.max(0, 58 - title.length))}`);
  }

  return { pass, fail, skip, gap, section, stats };
}

export async function get(path, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

export async function post(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

export async function patch(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

export async function getAuthToken() {
  if (!SB_URL || !SB_ANON) throw new Error("Missing Supabase URL or anon key");
  const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  if (error || !data?.session?.access_token) {
    throw new Error(error?.message || "No session — run: node scripts/create-test-user.mjs");
  }
  return data.session.access_token;
}

export function serviceClient() {
  if (!SB_URL || !SB_SVC) return null;
  return createClient(SB_URL, SB_SVC, { auth: { persistSession: false } });
}

export async function assertServerUp(run) {
  try {
    const { status, body } = await get("/api/health");
    if (status === 200 && body.ok) {
      run.pass("GET /api/health");
      return true;
    }
    run.fail("GET /api/health", `Status ${status}`);
    return false;
  } catch (e) {
    run.fail("GET /api/health", `Server not reachable — npm run dev? (${e.message})`);
    return false;
  }
}
