// =============================================================================
// Post-apply check of migration 206 on the LIVE database — READ-ONLY.
//   node scripts/takeoff/verify-live-206.mjs
// Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_ANON_KEY from .env.
//  1. every takeoff_* table answers to the service role (HEAD count, no rows read)
//  2. every takeoff_* RPC is published (PostgREST OpenAPI document — a GET)
//  3. anon is refused on every table and on the RPCs (A07 on production). The RPC probes use a random,
//     non-existent workspace id and are expected to be refused BEFORE the function runs; even if one were
//     wrongly allowed, the function would fail on the missing workspace without writing.
//  4. private takeoff-exports bucket; job_documents provenance columns present
//  5. current plans: how many already carry a content hash (anchored on first open by the app)
// Prints PASS/FAIL per check; exits 1 on any FAIL. Prints no row data.
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

const TABLES = ["takeoff_workspaces", "takeoff_calibrations", "takeoff_material_presets", "takeoff_material_preset_revisions", "takeoff_job_materials",
  "takeoff_material_rule_history", "takeoff_measurements", "takeoff_contributions", "takeoff_orders", "takeoff_order_lines", "takeoff_exports",
  "takeoff_placements", "takeoff_placement_allocations", "takeoff_idempotency"];
const RPCS = ["takeoff_commit", "takeoff_save_order", "takeoff_create_export", "takeoff_place_order", "takeoff_cancel_placement", "takeoff_plan_insert",
  "takeoff_archive_if_referenced", "takeoff_save_preset", "takeoff_next_order_ref"];
let failed = 0;
const res = (ok, label, detail = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); };

// 1. tables (service role)
for (const t of TABLES) {
  const { error, count } = await sb.from(t).select("*", { count: "exact", head: true });
  res(!error, `table ${t} exists`, error ? error.message : `${count ?? 0} rows`);
}

// 2. RPCs published (OpenAPI document, service role)
const spec = await fetch(`${url}/rest/v1/`, { headers: { apikey: service, Authorization: `Bearer ${service}`, Accept: "application/openapi+json" } }).then((r) => r.json()).catch(() => null);
const paths = Object.keys(spec?.paths || {});
for (const f of RPCS) res(paths.includes(`/rpc/${f}`), `rpc ${f} published to the service role`);

// 3. anon refused (tables + RPCs)
for (const t of TABLES) {
  const { data, error } = await anon.from(t).select("id").limit(1);
  const refused = !!error || (Array.isArray(data) && data.length === 0 && false);
  res(refused, `anon cannot read ${t}`, error ? `${error.code || ""} ${error.message}`.trim() : "NO ERROR (rows visible?)");
}
for (const [fn, args] of [
  ["takeoff_commit", { p_workspace_id: randomUUID(), p_expected_revision: 1, p_changes: {}, p_actor: { type: "staff" }, p_idempotency_key: null }],
  ["takeoff_next_order_ref", {}],
]) {
  const { error } = await anon.rpc(fn, args);
  const denied = !!error && /permission denied|not exist|Could not find|42501|PGRST202/i.test(`${error.code} ${error.message}`);
  res(denied, `anon cannot execute ${fn}`, error ? `${error.code || ""} ${error.message}`.trim() : "NO ERROR");
}

// 4. bucket + provenance columns
const { data: bucket, error: bErr } = await sb.storage.getBucket("takeoff-exports");
res(!bErr && bucket && bucket.public === false, "takeoff-exports bucket is private", bErr?.message || `public=${bucket?.public}`);
const { error: colErr } = await sb.from("job_documents").select("revision_label, content_sha256, byte_size, archived_at, archived_by").limit(1);
res(!colErr, "job_documents provenance columns", colErr?.message || "");

// 5. current plans and their anchoring
const PLAN_TYPES = ["architectural", "engineering", "structural", "survey", "specification", "plan"];
const { data: plans, error: pErr } = await sb.from("job_documents").select("id, content_sha256").in("document_type", PLAN_TYPES).eq("status", "current");
if (!pErr) console.log(`INFO  current plans: ${plans.length} · hash-anchored: ${plans.filter((p) => p.content_sha256).length} (others anchor automatically on first open in Takeoffs)`);

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
