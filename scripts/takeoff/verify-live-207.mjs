// =============================================================================
// Post-apply check of migration 207 (TC-R04 generic methods) on the LIVE database — READ-ONLY.
//   node scripts/takeoff/verify-live-207.mjs
// Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_ANON_KEY from .env.
//  1. takeoff_order_lines has unit + item and finished_length_mm is optional (PostgREST OpenAPI definitions)
//  2. takeoff_placement_allocations has unit; finished_length_mm optional
//  3. the 207 RPCs are still published to the service role and refused to anon
//  4. existing data: every order line reads back with a unit (old rows default to 'piece')
// CHECK constraints (measurement kinds, contribution roles, unit list) and the role-writing takeoff_commit are not
// visible through PostgREST; they are proven by takeoff-db.test.mjs / takeoff-api.test.mjs, which apply the SAME
// 206 + 207 SQL to an isolated Postgres. Prints PASS/FAIL per check; exits 1 on any FAIL. Prints no row data.
// =============================================================================
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

config();
const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
if (!url || !service || !anonKey) { console.error("Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_ANON_KEY in .env"); process.exit(2); }
const sb = createClient(url, service, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

let failed = 0;
const res = (ok, label, detail = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); };

const spec = await fetch(`${url}/rest/v1/`, { headers: { apikey: service, Authorization: `Bearer ${service}`, Accept: "application/openapi+json" } }).then((r) => r.json()).catch(() => null);
const def = (t) => spec?.definitions?.[t] || null;

// 1–2. columns
for (const [table, cols] of [["takeoff_order_lines", ["unit", "item"]], ["takeoff_placement_allocations", ["unit"]]]) {
  const d = def(table);
  for (const c of cols) res(!!d?.properties?.[c], `${table}.${c} exists`);
  res(!!d && !(d.required || []).includes("finished_length_mm"), `${table}.finished_length_mm is optional (sheets / boxes / LM have none)`);
}
const { error: selErr } = await sb.from("takeoff_order_lines").select("unit, item", { head: true, count: "exact" });
res(!selErr, "service role can read order-line unit + item", selErr?.message || "");

// 3. RPCs
const paths = Object.keys(spec?.paths || {});
for (const f of ["takeoff_commit", "takeoff_save_order"]) res(paths.includes(`/rpc/${f}`), `rpc ${f} published to the service role`);
for (const [fn, args] of [
  ["takeoff_commit", { p_workspace_id: randomUUID(), p_expected_revision: 1, p_changes: {}, p_actor: { type: "staff" }, p_idempotency_key: null }],
  ["takeoff_save_order", { p_order_id: randomUUID(), p_expected_revision: 1, p_fields: null, p_lines: null }],
]) {
  const { error } = await anon.rpc(fn, args);
  res(!!error && /permission denied|not exist|Could not find|42501|PGRST202/i.test(`${error.code} ${error.message}`), `anon cannot execute ${fn}`, error ? `${error.code || ""} ${error.message}`.trim() : "NO ERROR");
}

// 4. old rows read back with a unit
const { count: total } = await sb.from("takeoff_order_lines").select("id", { head: true, count: "exact" });
const { count: noUnit } = await sb.from("takeoff_order_lines").select("id", { head: true, count: "exact" }).is("unit", null);
res((noUnit ?? 0) === 0, "every existing order line has a unit", `${total ?? 0} line(s)`);

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll 207 checks passed.");
process.exit(failed ? 1 : 0);
