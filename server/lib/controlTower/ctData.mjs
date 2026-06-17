/**
 * ctData.mjs — HUB TOWER (Control Tower) read-only data accessor.
 *
 * The Control Tower reads business data and writes ONLY to its own two tables
 * (ct_findings, ct_action_queue). This module enforces that contract at the
 * application level; migration 095 enforces it again at the database level via
 * the dedicated `control_tower_ro` role. Two independent layers.
 *
 * ── How the database role is used ────────────────────────────────────────────
 * We do NOT add a Postgres driver. Instead we connect through PostgREST as the
 * `control_tower_ro` role by presenting a JWT whose `role` claim is
 * "control_tower_ro" (signed with the project JWT secret, stored only in the
 * server env var SUPABASE_CT_JWT). PostgREST runs every query under that role,
 * so the database physically rejects any business-table write or any DELETE.
 *
 * ── Fail-closed ──────────────────────────────────────────────────────────────
 * If the Control Tower JWT is not configured, this module does NOT silently fall
 * back to the service-role key (that would defeat the hard DB guard). It returns
 * null from getCtClient() and the route layer reports "not configured".
 *
 * Required server env vars (set in Railway / Supabase — NEVER in frontend, NEVER
 * committed):
 *   SUPABASE_URL            — already used by the app (or VITE_SUPABASE_URL)
 *   SUPABASE_ANON_KEY       — apikey header for PostgREST (or VITE_SUPABASE_ANON_KEY)
 *   SUPABASE_CT_JWT         — long-lived JWT, claim {"role":"control_tower_ro"},
 *                             signed with the Supabase project JWT secret.
 */

import { createClient } from "@supabase/supabase-js";

/** The ONLY tables the Control Tower may write to. */
export const CT_WRITABLE_TABLES = Object.freeze(["ct_findings", "ct_action_queue"]);

let _client = null;
let _resolved = false;

function resolveConfig() {
  const url =
    process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  const anonKey =
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim();
  const ctJwt = process.env.SUPABASE_CT_JWT?.trim();
  return { url, anonKey, ctJwt };
}

/** True when the Control Tower role-scoped client can be built. */
export function controlTowerConfigured() {
  const { url, anonKey, ctJwt } = resolveConfig();
  return Boolean(url && anonKey && ctJwt);
}

/**
 * Which required env vars are missing (for status reporting — never leaks values).
 * @returns {string[]}
 */
export function controlTowerMissingEnv() {
  const { url, anonKey, ctJwt } = resolveConfig();
  const missing = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!anonKey) missing.push("SUPABASE_ANON_KEY");
  if (!ctJwt) missing.push("SUPABASE_CT_JWT");
  return missing;
}

/**
 * The role-scoped Supabase client (runs every query as control_tower_ro).
 * Returns null (fail-closed) when not configured — callers must guard.
 * @returns {import('@supabase/supabase-js').SupabaseClient|null}
 */
export function getCtClient() {
  if (_resolved) return _client;
  _resolved = true;
  const { url, anonKey, ctJwt } = resolveConfig();
  if (!url || !anonKey || !ctJwt) {
    _client = null;
    return _client;
  }
  _client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${ctJwt}` } },
  });
  return _client;
}

function requireClient() {
  const c = getCtClient();
  if (!c) {
    throw new Error(
      "Control Tower data layer not configured (missing: " +
        controlTowerMissingEnv().join(", ") +
        ")."
    );
  }
  return c;
}

/**
 * READ — returns a query builder for any table. Reads only: the underlying role
 * has no write privilege on business tables, so .insert/.update/.delete would be
 * rejected by the database. Use .select(...) on the result.
 * @param {string} table
 */
export function ctRead(table) {
  return requireClient().from(table);
}

/**
 * WRITE — only permitted for ct_findings and ct_action_queue. Throws otherwise.
 * DELETE is never exposed by this module (and is revoked at the DB level too).
 * @param {string} table
 */
export function ctWrite(table) {
  if (!CT_WRITABLE_TABLES.includes(table)) {
    throw new Error(
      `Control Tower is read-only for '${table}'. Writes are permitted only to: ${CT_WRITABLE_TABLES.join(
        ", "
      )}.`
    );
  }
  return requireClient().from(table);
}
