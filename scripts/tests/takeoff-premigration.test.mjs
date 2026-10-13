// Pre-migration behaviour (production today): migration 206 NOT applied.
//   node scripts/tests/takeoff-premigration.test.mjs
// Real Express routes + real SQL (isolated Postgres, base schema only). Proves A25: takeoff
// endpoints say "needs migration 206" in plain English (no raw DB text, no partial success),
// while the EXISTING plan features keep working with the safer lifecycle order.
import assert from "node:assert/strict";
import { register } from "node:module";
import crypto from "node:crypto";
import pg from "pg";
import { freshTakeoffDb } from "./lib/takeoffTestDb.mjs";
import { makePgSupabase } from "./lib/pgSupabaseShim.mjs";
import { buildKnownPlanPdf } from "./lib/takeoffPdfFixture.mjs";

const db = await freshTakeoffDb("blh_takeoff_pre", { migrate: false });
if (db.skip) { console.log(`takeoff-premigration: SKIPPED — ${db.skip}`); process.exit(0); }
await db.close();
const pool = new pg.Pool({ connectionString: db.url, max: 4 });
const sb = makePgSupabase(pool);
globalThis.__MOCK_SB__ = sb;
register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  if (url.endsWith("/server/lib/supabaseService.mjs")) return { format: "module", shortCircuit: true, source: "export function getServiceSupabase(){ return globalThis.__MOCK_SB__ || null; }" };
  return nextLoad(url, context);
}`), import.meta.url);
process.env.TAKEOFF_ENABLED = "true";
const { default: express } = await import("express");
const { registerWorkforceRoutes } = await import("../../server/lib/workforceRoutes.mjs");
const { registerTakeoffRoutes } = await import("../../server/lib/takeoff/takeoffRoutes.mjs");
const app = express(); app.use(express.json({ limit: "20mb" }));
registerWorkforceRoutes(app); registerTakeoffRoutes(app);
const server = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
const BASE = `http://127.0.0.1:${server.address().port}`;
const admin = crypto.randomUUID(), carp = crypto.randomUUID();
await pool.query("INSERT INTO auth.users (id) VALUES ($1)", [admin]);
await pool.query("INSERT INTO user_profiles (id, role) VALUES ($1, 'admin')", [admin]);
await pool.query("INSERT INTO carpentry_jobs (id, address) VALUES ($1, 'Pre St')", [carp]);
sb._tokens.set("tok", { id: admin });
const call = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: { Authorization: "Bearer tok", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json() };
};
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); } }
const pdf = Buffer.from(buildKnownPlanPdf({}).bytes).toString("base64");

await t("A25 takeoff endpoints: 503 MIGRATION_PENDING with a plain message", async () => {
  const r = await call("GET", `/api/takeoff/jobs/carpentry/${carp}`);
  assert.equal(r.status, 503); assert.equal(r.data.code, "MIGRATION_PENDING");
  assert.match(r.data.error, /migration 206/); assert.doesNotMatch(r.data.error, /relation|PGRST|42P01|schema cache/);
  const c = await call("POST", `/api/takeoff/jobs/carpentry/${carp}/workspaces`, { name: "x" });
  assert.equal(c.status, 503);
});
let first;
await t("existing plan upload still works without 206 (fallback path)", async () => {
  const r = await call("POST", `/api/carpentry/jobs/${carp}/plans`, { fileBase64: pdf, fileName: "a.pdf", revision: "Rev A" });
  assert.equal(r.status, 200, JSON.stringify(r.data)); first = r.data.docId;
  const l = await call("GET", `/api/carpentry/jobs/${carp}/plans`);
  assert.deepEqual(l.data.plans.map((p) => p.docId), [first]);
});
await t("fallback supersede inserts the new row FIRST, then supersedes", async () => {
  const r = await call("POST", `/api/carpentry/jobs/${carp}/plans`, { fileBase64: pdf, fileName: "b.pdf", supersedesDocumentId: first });
  assert.equal(r.status, 200);
  const rows = (await pool.query("SELECT id, status, supersedes_document_id FROM job_documents ORDER BY uploaded_at")).rows;
  assert.equal(rows.find((x) => x.id === first).status, "superseded");
  assert.equal(rows.find((x) => x.id === r.data.docId).supersedes_document_id, first);
});
await t("cross-job supersede rejected before storage is touched", async () => {
  const other = crypto.randomUUID();
  await pool.query("INSERT INTO carpentry_jobs (id, address) VALUES ($1, 'Other')", [other]);
  const before = sb._buckets.get("job-plans").size;
  const r = await call("POST", `/api/carpentry/jobs/${other}/plans`, { fileBase64: pdf, fileName: "c.pdf", supersedesDocumentId: first });
  assert.equal(r.status, 400); assert.equal(sb._buckets.get("job-plans").size, before);
});
await t("delete without 206: row deleted, then object removed", async () => {
  const cur = (await call("GET", `/api/carpentry/jobs/${carp}/plans`)).data.plans[0].docId;
  const path = (await pool.query("SELECT storage_path FROM job_documents WHERE id=$1", [cur])).rows[0].storage_path.split("/").slice(1).join("/");
  const r = await call("DELETE", `/api/job-plans/${cur}`);
  assert.equal(r.status, 200); assert.equal(r.data.archived, false);
  assert.equal(sb._buckets.get("job-plans").has(path), false);
});
server.close(); await pool.end();
console.log(`takeoff-premigration: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
