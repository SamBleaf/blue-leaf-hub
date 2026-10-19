// Takeoff SQL tests on an ISOLATED Postgres (mocks can't prove privileges/atomicity/FKs).
//   node scripts/tests/takeoff-db.test.mjs
// A07 privileges, immutability triggers, A12 atomic supersession, RPC over-allocation guard,
// CAS under two real connections, and idempotent re-application of migration 206.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { freshTakeoffDb, connect } from "./lib/takeoffTestDb.mjs";

const db = await freshTakeoffDb("blh_takeoff_sql");
if (db.skip) { console.log(`takeoff-db: SKIPPED — ${db.skip}`); process.exit(0); }
const c = db.client;
let pass = 0, fail = 0;
async function t(name, fn) {
  try { await c.query("BEGIN"); await fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); }
  finally { await c.query("ROLLBACK").catch(() => {}); }
}
const id = () => crypto.randomUUID();
const one = async (sql, p) => (await c.query(sql, p)).rows[0];
const rejects = async (sql, p, rx) => {
  await c.query("SAVEPOINT s");
  try { await c.query(sql, p); } catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); if (rx) assert.match(e.message, rx); return; }
  throw new Error(`expected failure: ${sql}`);
};

// fixtures (committed — each test runs in its own rolled-back transaction)
const carp = id(), carpB = id(), user = id(), doc = id(), docB = id(), ws = id(), sup = id();
await c.query("INSERT INTO auth.users (id) VALUES ($1)", [user]);
await c.query("INSERT INTO carpentry_jobs (id, address) VALUES ($1,'A'), ($2,'B')", [carp, carpB]);
await c.query("INSERT INTO suppliers (id, name) VALUES ($1, 'Fielders')", [sup]);
await c.query(`INSERT INTO job_documents (id, carpentry_job_id, document_type, title, status, storage_provider, storage_path)
  VALUES ($1,$2,'architectural','A','current','supabase','job-plans/a.pdf'), ($3,$4,'architectural','B','current','supabase','job-plans/b.pdf')`, [doc, carp, docB, carpB]);
await c.query("INSERT INTO takeoff_workspaces (id, carpentry_job_id, name, created_by_type, created_by_user_id) VALUES ($1,$2,'W','staff',$3)", [ws, carp, user]);
const actor = JSON.stringify({ type: "staff", userId: user });
const calRow = (cid, documentId) => ({ id: cid, documentId, pageIndex: 0, pageMeta: { viewBox: [0, 0, 842, 595], rotate: 0, userUnit: 1 }, basisRotation: 0, mode: "uniform",
  sx: 35.27, sy: 35.27, measuredSx: 35.27, measuredSy: 35.27, discrepancy: 0, tolerance: 0.005, horizontal: {}, vertical: {}, status: "ready" });

await t("A07 anon/authenticated: no table access, no RPC execute", async () => {
  for (const role of ["anon", "authenticated"]) {
    await c.query(`SET LOCAL ROLE ${role}`);
    await rejects("SELECT * FROM public.takeoff_workspaces", [], /permission denied/);
    await rejects("SELECT public.takeoff_commit($1::uuid, 1, '{}'::jsonb, $2::jsonb, NULL)", [ws, actor], /permission denied/);
    await rejects("SELECT public.takeoff_place_order(NULL,NULL,1,'[]','[]',NULL,current_date,false,NULL,NULL)", [], /permission denied/);
    await rejects("SELECT public.takeoff_next_order_ref()", [], /permission denied/);
    await rejects("INSERT INTO public.takeoff_exports (order_id, export_no, is_draft, snapshot, snapshot_sha256, calculation_version, profile_schema_version, workspace_revision, order_revision, created_by_type) VALUES (gen_random_uuid(),1,true,'{}','x','v',1,1,1,'staff')", [], /permission denied/);
    await c.query("RESET ROLE");
  }
  const f = await one("SELECT has_function_privilege('public', 'public.takeoff_commit(uuid,integer,jsonb,jsonb,text)', 'EXECUTE') AS pub, has_function_privilege('service_role', 'public.takeoff_commit(uuid,integer,jsonb,jsonb,text)', 'EXECUTE') AS svc");
  assert.equal(f.pub, false); assert.equal(f.svc, true);
  const rls = await one("SELECT bool_and(relrowsecurity) AS on FROM pg_class WHERE relname LIKE 'takeoff\\_%' AND relkind = 'r'");
  assert.equal(rls.on, true);
});

await t("CAS: stale revision rejected; children + revision move together", async () => {
  const r = await one("SELECT public.takeoff_commit($1, 1, $2::jsonb, $3::jsonb, 'key-aaaaaaaa') AS r", [ws, JSON.stringify({ calibrations: { insert: [calRow(id(), doc)] } }), actor]);
  assert.equal(r.r.revision, 2);
  await rejects("SELECT public.takeoff_commit($1, 1, '{}'::jsonb, $2::jsonb, NULL)", [ws, actor], /TAKEOFF_CONFLICT/);
  const replay = await one("SELECT public.takeoff_commit($1, 1, '{}'::jsonb, $2::jsonb, 'key-aaaaaaaa') AS r", [ws, actor]);
  assert.equal(replay.r.replayed, true); assert.equal(replay.r.revision, 2);
});

await t("atomicity: a failing child aborts the whole commit (no partial rows, revision unchanged)", async () => {
  const good = { id: id(), kind: "manual", finishedLengthMm: 4600, quantity: 2 };
  const badRun = { id: id(), kind: "run", documentId: docB, pageIndex: 0, calibrationId: id(), geometry: { points: [] } }; // foreign doc
  await rejects("SELECT public.takeoff_commit($1, 1, $2::jsonb, $3::jsonb, NULL)", [ws, JSON.stringify({ measurements: { upsert: [good, badRun] } }), actor], /TAKEOFF_SCOPE/);
  assert.equal((await one("SELECT count(*)::int n FROM takeoff_measurements")).n, 0);
  assert.equal((await one("SELECT revision FROM takeoff_workspaces WHERE id=$1", [ws])).revision, 1);
});

await t("scope: upsert of an id owned by another workspace is rejected", async () => {
  const ws2 = id(), mid = id();
  await c.query("INSERT INTO takeoff_workspaces (id, carpentry_job_id, name, created_by_type) VALUES ($1,$2,'W2','staff')", [ws2, carp]);
  await c.query("SELECT public.takeoff_commit($1, 1, $2::jsonb, $3::jsonb, NULL)", [ws2, JSON.stringify({ measurements: { upsert: [{ id: mid, kind: "manual", finishedLengthMm: 100, quantity: 1 }] } }), actor]);
  await rejects("SELECT public.takeoff_commit($1, 1, $2::jsonb, $3::jsonb, NULL)", [ws, JSON.stringify({ measurements: { upsert: [{ id: mid, kind: "manual", finishedLengthMm: 999, quantity: 1 }] } }), actor], /TAKEOFF_SCOPE/);
  assert.equal(Number((await one("SELECT finished_length_mm FROM takeoff_measurements WHERE id=$1", [mid])).finished_length_mm), 100);
});

await t("one-job CHECK on new roots", async () => {
  await rejects("INSERT INTO takeoff_workspaces (carpentry_job_id, job_id, name, created_by_type) VALUES ($1, gen_random_uuid(), 'x', 'staff')", [carp], /takeoff_ws_one_job|foreign key/);
  await rejects("INSERT INTO takeoff_workspaces (name, created_by_type) VALUES ('x', 'staff')", [], /takeoff_ws_one_job/);
});

await t("immutability: calibrations, exports, placements, allocations, preset revisions", async () => {
  const cid = id();
  await c.query("SELECT public.takeoff_commit($1, 1, $2::jsonb, $3::jsonb, NULL)", [ws, JSON.stringify({ calibrations: { insert: [calRow(cid, doc)] } }), actor]);
  await rejects("UPDATE takeoff_calibrations SET sx = 1 WHERE id=$1", [cid], /TAKEOFF_IMMUTABLE/);
  await rejects("DELETE FROM takeoff_calibrations WHERE id=$1", [cid], /TAKEOFF_IMMUTABLE/);
  const oid = id();
  await c.query("INSERT INTO takeoff_orders (id, workspace_id, order_ref, supplier_id, created_by_type) VALUES ($1,$2,'FO-T1',$3,'staff')", [oid, ws, sup]);
  const ex = await one("SELECT public.takeoff_create_export($1, 1, 2, NULL, true, '{\"a\":1}'::jsonb, 'h', 'v', 1, $2::jsonb, NULL) AS r", [oid, actor]);
  const exId = ex.r.exportId;
  await rejects("UPDATE takeoff_exports SET snapshot = '{\"a\":2}' WHERE id=$1", [exId], /frozen/);
  await rejects("DELETE FROM takeoff_exports WHERE id=$1", [exId], /cannot be deleted/);
  const pdfDoc = id();
  await c.query("INSERT INTO job_documents (id, carpentry_job_id, document_type, title) VALUES ($1,$2,'purchase_order','o')", [pdfDoc, carp]);
  await c.query("UPDATE takeoff_exports SET artifact_status='ready', pdf_document_id=$2, pdf_sha256='abc' WHERE id=$1", [exId, pdfDoc]);
  await rejects("UPDATE takeoff_exports SET pdf_sha256='other' WHERE id=$1", [exId], /ready export cannot change/);
  await rejects("DELETE FROM takeoff_workspaces WHERE id=$1", [ws], /TAKEOFF_IMMUTABLE/);
  const p = await one("SELECT public.takeoff_save_preset(NULL, 0, '{\"name\":\"S\",\"methodKey\":\"flashing_runs\",\"methodVersion\":1}'::jsonb, $1, true) AS r", [user]);
  await rejects("UPDATE takeoff_material_preset_revisions SET name='x' WHERE preset_id=$1", [p.r.presetId], /TAKEOFF_IMMUTABLE/);
});

await t("export: ready requires a stored PDF (constraint)", async () => {
  const oid = id();
  await c.query("INSERT INTO takeoff_orders (id, workspace_id, order_ref, created_by_type) VALUES ($1,$2,'FO-T2','staff')", [oid, ws]);
  const ex = await one("SELECT public.takeoff_create_export($1, 1, 1, NULL, true, '{}'::jsonb, 'h', 'v', 1, $2::jsonb, NULL) AS r", [oid, actor]);
  await rejects("UPDATE takeoff_exports SET artifact_status='ready' WHERE id=$1", [ex.r.exportId], /takeoff_export_ready_has_pdf/);
});

await t("order-ready export refuses missing supplier; draft export allowed; stale revision 409", async () => {
  const oid = id();
  await c.query("INSERT INTO takeoff_orders (id, workspace_id, order_ref, created_by_type) VALUES ($1,$2,'FO-T3','staff')", [oid, ws]);
  await rejects("SELECT public.takeoff_create_export($1, 1, 1, NULL, false, '{}'::jsonb, 'h', 'v', 1, $2::jsonb, NULL)", [oid, actor], /choose a supplier/);
  await rejects("SELECT public.takeoff_create_export($1, 1, 99, NULL, true, '{}'::jsonb, 'h', 'v', 1, $2::jsonb, NULL)", [oid, actor], /TAKEOFF_CONFLICT/);
});

await t("placement RPC: over-allocation rejected; surplus needs acknowledgement; one active placement", async () => {
  const mid = id(), mat = id(), con = id();
  await c.query("SELECT public.takeoff_commit($1, 1, $2::jsonb, $3::jsonb, NULL)", [ws, JSON.stringify({
    materials: { upsert: [{ id: mat, name: "M", methodKey: "flashing_runs", methodVersion: 1 }] },
    measurements: { upsert: [{ id: mid, kind: "manual", finishedLengthMm: 4600, quantity: 10 }] },
    contributions: { upsert: [{ id: con, measurementId: mid, jobMaterialId: mat }] } }), actor]);
  const req = JSON.stringify([{ contributionId: con, bucketKey: "B|4600", quantity: 10 }]);
  const mkOrder = async (ref) => {
    const oid = id();
    await c.query("INSERT INTO takeoff_orders (id, workspace_id, order_ref, supplier_id, created_by_type) VALUES ($1,$2,$3,$4,'staff')", [oid, ws, ref, sup]);
    const ex = await one("SELECT public.takeoff_create_export($1, 1, 2, (SELECT updated_at FROM suppliers WHERE id=$3), false, '{}'::jsonb, 'h', 'v', 1, $2::jsonb, NULL) AS r", [oid, actor, sup]);
    const pdfDoc = id();
    await c.query("INSERT INTO job_documents (id, carpentry_job_id, document_type, title) VALUES ($1,$2,'purchase_order','o')", [pdfDoc, carp]);
    await c.query("UPDATE takeoff_exports SET artifact_status='ready', pdf_document_id=$2, pdf_sha256='x' WHERE id=$1", [ex.r.exportId, pdfDoc]);
    return { oid, exId: ex.r.exportId };
  };
  const a = await mkOrder("FO-A");
  await c.query("SELECT public.takeoff_place_order($1,$2,2,$3::jsonb,$4::jsonb,'SO1',current_date,false,$5,'pk-aaaaaaaa')",
    [a.oid, a.exId, req, JSON.stringify([{ contributionId: con, bucketKey: "B|4600", finishedLengthMm: 4600, quantity: 6 }]), user]);
  const b = await mkOrder("FO-B");
  await rejects("SELECT public.takeoff_place_order($1,$2,2,$3::jsonb,$4::jsonb,NULL,current_date,false,$5,NULL)",
    [b.oid, b.exId, req, JSON.stringify([{ contributionId: con, bucketKey: "B|4600", finishedLengthMm: 4600, quantity: 5 }]), user], /already covers/);
  await rejects("SELECT public.takeoff_place_order($1,$2,2,$3::jsonb,$4::jsonb,NULL,current_date,false,$5,NULL)",
    [b.oid, b.exId, req, JSON.stringify([{ contributionId: null, bucketKey: "B|4600", finishedLengthMm: 4600, quantity: 5 }]), user], /confirm the surplus/);
  await rejects("SELECT public.takeoff_place_order($1,$2,2,$3::jsonb,'[]'::jsonb,NULL,current_date,false,$4,NULL)", [a.oid, a.exId, req, user], /already placed/);
  await rejects("INSERT INTO takeoff_placements (order_id, export_id, placed_on, placed_by_user_id) VALUES ($1,$2,current_date,$3)", [a.oid, a.exId, user], /takeoff_one_active_placement|duplicate/);
  const pl = await one("SELECT id FROM takeoff_placements WHERE order_id=$1", [a.oid]);
  await rejects("UPDATE takeoff_placements SET placed_on = current_date - 1 WHERE id=$1", [pl.id], /only be cancelled/);
  await rejects("DELETE FROM takeoff_placement_allocations", [], /TAKEOFF_IMMUTABLE/);
  await rejects("SELECT public.takeoff_cancel_placement($1, '', $2)", [pl.id, user], /reason/);
  await c.query("SELECT public.takeoff_cancel_placement($1, 'Stock', $2)", [pl.id, user]);
  // draft exports can never be placed
  const oid = id();
  await c.query("INSERT INTO takeoff_orders (id, workspace_id, order_ref, supplier_id, created_by_type) VALUES ($1,$2,'FO-D',$3,'staff')", [oid, ws, sup]);
  const dx = await one("SELECT public.takeoff_create_export($1, 1, 2, NULL, true, '{}'::jsonb, 'h', 'v', 1, $2::jsonb, NULL) AS r", [oid, actor]);
  await rejects("SELECT public.takeoff_place_order($1,$2,2,'[]'::jsonb,'[]'::jsonb,NULL,current_date,false,$3,NULL)", [oid, dx.r.exportId, user], /order-ready export/);
});

await t("A12 failed new-row insert leaves old plan current (atomic supersede)", async () => {
  await rejects("SELECT public.takeoff_plan_insert($1::jsonb, $2)", [JSON.stringify({ carpentry_job_id: carp, document_type: null, title: "x", storage_path: "p" }), doc], /null value|not-null/);
  assert.equal((await one("SELECT status FROM job_documents WHERE id=$1", [doc])).status, "current");
  assert.equal((await one("SELECT count(*)::int n FROM job_documents WHERE supersedes_document_id=$1", [doc])).n, 0);
});
await t("A13 cross-job / non-current supersession rejected in SQL too", async () => {
  await rejects("SELECT public.takeoff_plan_insert($1::jsonb, $2)", [JSON.stringify({ carpentry_job_id: carp, document_type: "architectural", title: "x", storage_path: "p" }), docB], /same job/);
  const r = await one("SELECT public.takeoff_plan_insert($1::jsonb, $2) AS r", [JSON.stringify({ carpentry_job_id: carp, document_type: "architectural", title: "x", storage_path: "p" }), doc]);
  assert.equal((await one("SELECT version FROM job_documents WHERE id=$1", [r.r.docId])).version, 2);
  await rejects("SELECT public.takeoff_plan_insert($1::jsonb, $2)", [JSON.stringify({ carpentry_job_id: carp, document_type: "architectural", title: "y", storage_path: "q" }), doc], /already been replaced/);
});
await t("A14 FK blocks deleting a measured plan row; archive helper archives instead", async () => {
  await c.query("SELECT public.takeoff_commit($1, 1, $2::jsonb, $3::jsonb, NULL)", [ws, JSON.stringify({ calibrations: { insert: [calRow(id(), doc)] } }), actor]);
  await rejects("DELETE FROM job_documents WHERE id=$1", [doc], /foreign key/);
  const a = await one("SELECT public.takeoff_archive_if_referenced($1, $2) AS r", [doc, user]);
  assert.equal(a.r.archived, true);
  const d = await one("SELECT status, archived_at FROM job_documents WHERE id=$1", [doc]);
  assert.equal(d.status, "superseded"); assert.ok(d.archived_at);
  assert.equal((await one("SELECT public.takeoff_archive_if_referenced($1, $2) AS r", [docB, user])).r.archived, false);
});

await t("review #9b: primary plan replaced → needs_review + revision bump", async () => {
  await c.query("UPDATE takeoff_workspaces SET primary_document_id=$2 WHERE id=$1", [ws, doc]);
  const before = (await one("SELECT revision FROM takeoff_workspaces WHERE id=$1", [ws])).revision;
  await c.query("SELECT public.takeoff_plan_insert($1::jsonb, $2)", [JSON.stringify({ carpentry_job_id: carp, document_type: "architectural", title: "r3", storage_path: "p3" }), doc]);
  const after = await one("SELECT revision, state FROM takeoff_workspaces WHERE id=$1", [ws]);
  assert.equal(after.state, "needs_review"); assert.equal(after.revision, before + 1);
});
await t("review #10: a plan upload cannot supersede a non-plan document", async () => {
  const po = id();
  await c.query("INSERT INTO job_documents (id, carpentry_job_id, document_type, title, status, storage_provider) VALUES ($1,$2,'purchase_order','po','current','supabase')", [po, carp]);
  await rejects("SELECT public.takeoff_plan_insert($1::jsonb, $2)", [JSON.stringify({ carpentry_job_id: carp, document_type: "architectural", title: "x", storage_path: "p" }), po], /only an issued plan/);
});
await t("review #7 (+207): contribution role defaults to 'primary', unknown roles rejected; one active (measurement, material)", async () => {
  const mid = id(), mat = id();
  // 207: an unknown role is REJECTED by the role check (206 silently stored 'primary')
  await rejects("SELECT public.takeoff_commit($1, 1, $2::jsonb, $3::jsonb, NULL)", [ws, JSON.stringify({
    materials: { upsert: [{ id: mat, name: "M", methodKey: "flashing_runs", methodVersion: 1 }] },
    measurements: { upsert: [{ id: mid, kind: "manual", finishedLengthMm: 100, quantity: 1 }] },
    contributions: { upsert: [{ id: id(), measurementId: mid, jobMaterialId: mat, role: "extra" }] } }), actor], /takeoff_contrib_role_207/);
  await c.query("SELECT public.takeoff_commit($1, 1, $2::jsonb, $3::jsonb, NULL)", [ws, JSON.stringify({
    materials: { upsert: [{ id: mat, name: "M", methodKey: "flashing_runs", methodVersion: 1 }] },
    measurements: { upsert: [{ id: mid, kind: "manual", finishedLengthMm: 100, quantity: 1 }] },
    contributions: { upsert: [{ id: id(), measurementId: mid, jobMaterialId: mat }] } }), actor]);
  assert.equal((await one("SELECT role FROM takeoff_contributions WHERE measurement_id=$1", [mid])).role, "primary");
  await rejects("SELECT public.takeoff_commit($1, 2, $2::jsonb, $3::jsonb, NULL)", [ws, JSON.stringify({ contributions: { upsert: [{ id: id(), measurementId: mid, jobMaterialId: mat }] } }), actor], /duplicate key|unique/);
});
await t("review #6: hash-anchored job_documents identity is immutable; legacy rows unaffected", async () => {
  const a = id();
  await c.query("INSERT INTO job_documents (id, carpentry_job_id, document_type, title, storage_provider, storage_path, content_sha256) VALUES ($1,$2,'plan','a','supabase','job-plans/a','abc')", [a, carp]);
  await rejects("UPDATE job_documents SET storage_path='job-plans/b' WHERE id=$1", [a], /TAKEOFF_IMMUTABLE/);
  await c.query("UPDATE job_documents SET status='superseded', title='renamed' WHERE id=$1", [a]); // status/title still editable
  await c.query("UPDATE job_documents SET storage_path='job-plans/b2' WHERE id=$1", [doc]); // legacy (no hash) unaffected
});
await t("review #1: a shrunk requirement doesn't lock out a placement on an untouched pair", async () => {
  const mat = id(), m1 = id(), m2 = id(), c1 = id(), c2 = id();
  await c.query("SELECT public.takeoff_commit($1, 1, $2::jsonb, $3::jsonb, NULL)", [ws, JSON.stringify({
    materials: { upsert: [{ id: mat, name: "M", methodKey: "flashing_runs", methodVersion: 1 }] },
    measurements: { upsert: [{ id: m1, kind: "manual", finishedLengthMm: 4600, quantity: 10 }, { id: m2, kind: "manual", finishedLengthMm: 3000, quantity: 5 }] },
    contributions: { upsert: [{ id: c1, measurementId: m1, jobMaterialId: mat }, { id: c2, measurementId: m2, jobMaterialId: mat }] } }), actor]);
  const mk = async (ref) => {
    const oid = id();
    await c.query("INSERT INTO takeoff_orders (id, workspace_id, order_ref, supplier_id, created_by_type) VALUES ($1,$2,$3,$4,'staff')", [oid, ws, ref, sup]);
    const ex = await one("SELECT public.takeoff_create_export($1, 1, 2, (SELECT updated_at FROM suppliers WHERE id=$3), false, '{}'::jsonb, 'h', 'v', 1, $2::jsonb, NULL) AS r", [oid, actor, sup]);
    const d = id();
    await c.query("INSERT INTO job_documents (id, carpentry_job_id, document_type, title) VALUES ($1,$2,'purchase_order','o')", [d, carp]);
    await c.query("UPDATE takeoff_exports SET artifact_status='ready', pdf_document_id=$2, pdf_sha256='x' WHERE id=$1", [ex.r.exportId, d]);
    return { oid, exId: ex.r.exportId };
  };
  const a = await mk("FO-L1");
  await c.query("SELECT public.takeoff_place_order($1,$2,2,$3::jsonb,$4::jsonb,NULL,current_date,false,$5,NULL)",
    [a.oid, a.exId, JSON.stringify([{ contributionId: c1, bucketKey: "A|4600", quantity: 10 }, { contributionId: c2, bucketKey: "A|3000", quantity: 5 }]),
      JSON.stringify([{ contributionId: c1, bucketKey: "A|4600", finishedLengthMm: 4600, quantity: 10 }]), user]);
  const b = await mk("FO-L2");
  // requirement for c1 shrank to 4 (surplus 6) — placing the untouched c2 pair must still work
  await c.query("SELECT public.takeoff_place_order($1,$2,2,$3::jsonb,$4::jsonb,NULL,current_date,false,$5,NULL)",
    [b.oid, b.exId, JSON.stringify([{ contributionId: c1, bucketKey: "A|4600", quantity: 4 }, { contributionId: c2, bucketKey: "A|3000", quantity: 5 }]),
      JSON.stringify([{ contributionId: c2, bucketKey: "A|3000", finishedLengthMm: 3000, quantity: 5 }]), user]);
});

await t("rule changes on a job material keep an immutable audit history", async () => {
  const mat = id();
  await c.query("SELECT public.takeoff_commit($1, 1, $2::jsonb, $3::jsonb, NULL)", [ws, JSON.stringify({ materials: { upsert: [{ id: mat, name: "M", methodKey: "flashing_runs", methodVersion: 1, rules: { orderCeilingMm: 9000 } }] } }), actor]);
  await c.query("SELECT public.takeoff_commit($1, 2, $2::jsonb, $3::jsonb, NULL)", [ws, JSON.stringify({ materials: { upsert: [{ id: mat, name: "M", methodKey: "flashing_runs", methodVersion: 1, rules: { orderCeilingMm: 12000 } }] } }), actor]);
  await c.query("SELECT public.takeoff_commit($1, 3, $2::jsonb, $3::jsonb, NULL)", [ws, JSON.stringify({ materials: { upsert: [{ id: mat, name: "M renamed", methodKey: "flashing_runs", methodVersion: 1, rules: { orderCeilingMm: 12000 } }] } }), actor]);
  const h = (await c.query("SELECT old_rules, new_rules, changed_by_type FROM takeoff_material_rule_history WHERE job_material_id=$1 ORDER BY changed_at, material_revision", [mat])).rows;
  assert.equal(h.length, 2); // created + one real rule change (rename alone is not a rule change)
  assert.equal(h[1].old_rules.orderCeilingMm, 9000); assert.equal(h[1].new_rules.orderCeilingMm, 12000);
  await rejects("DELETE FROM takeoff_material_rule_history WHERE job_material_id=$1", [mat], /TAKEOFF_IMMUTABLE/);
});

await t("CAS under two real connections: exactly one concurrent commit wins", async () => {
  await c.query("ROLLBACK");
  const c1 = await connect(db.url), c2 = await connect(db.url);
  const rev0 = (await c.query("SELECT revision FROM takeoff_workspaces WHERE id=$1", [ws])).rows[0].revision;
  // Autocommit: each RPC is its own transaction; the row lock serialises them inside Postgres.
  const call = (cl, name) => cl.query(`SELECT public.takeoff_commit($1, $3, '{"workspace":{"name":"${name}"}}'::jsonb, $2::jsonb, NULL) AS r`, [ws, actor, rev0])
    .then(() => "ok", (e) => (/TAKEOFF_CONFLICT/.test(e.message) ? "conflict" : e.message));
  const results = await Promise.all([call(c1, "A"), call(c2, "B")]);
  assert.deepEqual(results.sort(), ["conflict", "ok"]);
  assert.equal((await c.query("SELECT revision FROM takeoff_workspaces WHERE id=$1", [ws])).rows[0].revision, rev0 + 1);
  await c1.end(); await c2.end();
  await c.query("BEGIN");
});

await t("migration 206 re-applies cleanly (idempotent)", async () => {
  await c.query("ROLLBACK");
  await c.query(readFileSync(new URL("../../supabase/migrations/206_takeoff_foundation.sql", import.meta.url), "utf8"));
  await c.query("BEGIN");
});

// ── 207: generic methods ─────────────────────────────────────────────────────
await t("207 new measurement kinds: entered walls need inputs, traced kinds need a scale, finished length only for count/manual", async () => {
  const mat = id();
  await c.query("INSERT INTO takeoff_job_materials (id, workspace_id, name, method_key, method_version) VALUES ($1,$2,'Cladding','sheet_layout',2)", [mat, ws]);
  const ins = (kind, extra = {}) => c.query(`INSERT INTO takeoff_measurements (id, workspace_id, kind, document_id, calibration_id, geometry, finished_length_mm, quantity, created_by_type, created_by_user_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'staff',$9)`, [id(), ws, kind, extra.doc || null, extra.cal || null, extra.geometry ? JSON.stringify(extra.geometry) : null, extra.len || null, extra.qty || null, user]);
  await ins("wall", { geometry: { v: 2, inputs: { kind: "rect", widthMm: 4800, heightMm: 2700 } } });              // entered wall: ok
  await ins("opening", { geometry: { v: 2, inputs: { widthMm: 900, heightMm: 900, xMm: 600, sillMm: 900 }, parentId: id() } });
  await ins("offcut", { geometry: { v: 2, inputs: { lengthMm: 891 } } });
  await rejects(`INSERT INTO takeoff_measurements (id, workspace_id, kind, created_by_type, created_by_user_id) VALUES ('${id()}','${ws}','wall','staff','${user}')`, [], /takeoff_meas_entered_inputs/);
  await rejects(`INSERT INTO takeoff_measurements (id, workspace_id, kind, geometry, created_by_type, created_by_user_id) VALUES ('${id()}','${ws}','polyline','{"points":[]}','staff','${user}')`, [], /takeoff_meas_run_has_cal/);
  await rejects(`INSERT INTO takeoff_measurements (id, workspace_id, kind, geometry, created_by_type, created_by_user_id) VALUES ('${id()}','${ws}','wall','{"points":[{"x":1,"y":1}]}','staff','${user}')`, [], /takeoff_meas_traced_has_cal/);
  await rejects(`INSERT INTO takeoff_measurements (id, workspace_id, kind, quantity, created_by_type, created_by_user_id) VALUES ('${id()}','${ws}','manual',1,'staff','${user}')`, [], /takeoff_meas_count_len/);
  await rejects(`INSERT INTO takeoff_measurements (id, workspace_id, kind, geometry, created_by_type, created_by_user_id) VALUES ('${id()}','${ws}','sketch','{}','staff','${user}')`, [], /takeoff_meas_kind_207/);
});
await t("207 contribution roles: generic roles accepted, unknown rejected", async () => {
  const mat = id(), m = id();
  await c.query("INSERT INTO takeoff_job_materials (id, workspace_id, name, method_key, method_version) VALUES ($1,$2,'Rafters','repeated_members',2)", [mat, ws]);
  await c.query("INSERT INTO takeoff_measurements (id, workspace_id, kind, geometry, created_by_type, created_by_user_id) VALUES ($1,$2,'wall','{\"inputs\":{}}','staff',$3)", [m, ws, user]);
  await c.query("INSERT INTO takeoff_contributions (id, workspace_id, measurement_id, job_material_id, role) VALUES ($1,$2,$3,$4,'wall')", [id(), ws, m, mat]);
  await rejects(`INSERT INTO takeoff_contributions (id, workspace_id, measurement_id, job_material_id, role) VALUES ('${id()}','${ws}','${m}','${mat}','bogus')`, [], /takeoff_contrib_role_207/);
});
await t("207 order lines: unit + item; sheets/boxes/counted pieces need no length, bars do; save_order writes them", async () => {
  // the earlier "206 re-applies" test commits 206 again (its own BEGIN/COMMIT), which restores the 206 save_order —
  // exactly what an operator re-running 206 after 207 would do. 207 must then be re-run; do that here.
  await c.query(readFileSync(new URL("../../supabase/migrations/207_takeoff_generic_methods.sql", import.meta.url), "utf8"));
  const mat = id(), o = id();
  await c.query("INSERT INTO takeoff_job_materials (id, workspace_id, name, method_key, method_version) VALUES ($1,$2,'Axon','sheet_layout',2)", [mat, ws]);
  await c.query("INSERT INTO takeoff_orders (id, workspace_id, order_ref, created_by_type, created_by_user_id) VALUES ($1,$2,'FO-207',  'staff',$3)", [o, ws, user]);
  const lines = [{ bucketKey: "axon|sheet|2450x1200", specKey: "axon", jobMaterialId: mat, quantity: 5, unit: "sheet", item: { sku: "403931", lengthMm: 2450, widthMm: 1200 } },
    { bucketKey: "nails|box", specKey: "nails", jobMaterialId: mat, quantity: 2, unit: "box", item: { boxSize: 500 } }];
  const r = await one("SELECT public.takeoff_save_order($1, 1, NULL, $2::jsonb) AS r", [o, JSON.stringify(lines)]);
  assert.equal(r.r.lineCount, 2);
  const rows = (await c.query("SELECT unit, finished_length_mm, item FROM takeoff_order_lines WHERE order_id=$1 ORDER BY unit", [o])).rows;
  assert.deepEqual(rows.map((x) => x.unit), ["box", "sheet"]); assert.equal(rows[1].finished_length_mm, null); assert.equal(rows[1].item.sku, "403931");
  await rejects("SELECT public.takeoff_save_order($1, 2, NULL, $2::jsonb)", [o, JSON.stringify([{ bucketKey: "x", specKey: "x", jobMaterialId: mat, quantity: 1, unit: "bar" }])], /len_for_pieces/);
  // a counted piece (e.g. a set of clips) has no length and must still save (F13/SEC-09)
  const r2 = await one("SELECT public.takeoff_save_order($1, 2, NULL, $2::jsonb) AS r", [o, JSON.stringify([{ bucketKey: "clips|piece", specKey: "clips", jobMaterialId: mat, quantity: 4, unit: "piece", item: { description: "Clips" } }])]);
  assert.equal(r2.r.lineCount, 1);
  await rejects("SELECT public.takeoff_save_order($1, 3, NULL, $2::jsonb)", [o, JSON.stringify([{ bucketKey: "x", specKey: "x", jobMaterialId: mat, quantity: 1, unit: "furlong" }])], /unit_check/);
  const f = await one("SELECT has_function_privilege('anon', 'public.takeoff_save_order(uuid,integer,jsonb,jsonb)', 'EXECUTE') AS a");
  assert.equal(f.a, false);
});
await t("207 re-applies cleanly (idempotent) and leaves 206 flashing rules intact", async () => {
  await c.query(readFileSync(new URL("../../supabase/migrations/207_takeoff_generic_methods.sql", import.meta.url), "utf8"));
  await rejects(`INSERT INTO takeoff_measurements (id, workspace_id, kind, geometry, created_by_type, created_by_user_id) VALUES ('${id()}','${ws}','run','{"points":[]}','staff','${user}')`, [], /takeoff_meas_run_has_cal/);
});

await t("209 (HUB 005): open flashings on a 100 mm step move to 300 with history; placed / other steps / timber untouched; standards get a new revision; re-run changes nothing", async () => {
  const mig = readFileSync(new URL("../../supabase/migrations/209_takeoff_flashing_order_step_300.sql", import.meta.url), "utf8").replace(/^(BEGIN|COMMIT);$/gm, "");
  const R = (inc) => JSON.stringify({ allowanceMm: 200, incrementMm: inc, handlingThresholdMm: 6000, orderCeilingMm: 9000 });
  const w = id(), A = id(), B = id(), C = id(), D = id(), E = id(), oid = id();
  await c.query("INSERT INTO takeoff_workspaces (id, carpentry_job_id, name, created_by_type, created_by_user_id) VALUES ($1,$2,'W209','staff',$3)", [w, carpB, user]);
  const p = await one("SELECT public.takeoff_save_preset(NULL, 0, $1::jsonb, $2, true) AS r", [JSON.stringify({ name: "Std apron", methodKey: "flashing_runs", methodVersion: 1, spec: {}, rules: JSON.parse(R(100)) }), user]);
  const pid = p.r.presetId;
  const mat = (mid, name, spec, rules, preset = null) => c.query(`INSERT INTO takeoff_job_materials (id, workspace_id, name, method_key, method_version, spec, rules, from_preset_id, from_preset_revision)
    VALUES ($1,$2,$3,$4,1,$5::jsonb,$6::jsonb,$7,$8)`, [mid, w, name, spec.family === "timber" ? "repeated_members" : "flashing_runs", JSON.stringify(spec), rules, preset, preset ? 1 : null]);
  await mat(A, "Apron", {}, R(100));
  await mat(B, "Barge (placed)", {}, R(100));
  await mat(C, "Ridge 50", {}, R(50));
  await mat(D, "Rafters", { family: "timber" }, "{}");
  await mat(E, "From standard", {}, R(100), pid);
  await c.query("INSERT INTO takeoff_orders (id, workspace_id, order_ref, supplier_id, created_by_type) VALUES ($1,$2,'FO-209',$3,'staff')", [oid, w, sup]);
  await c.query("INSERT INTO takeoff_order_lines (order_id, bucket_key, spec_key, job_material_id, finished_length_mm, quantity) VALUES ($1,'k','s',$2,4600,1)", [oid, B]);
  const ex = await one("SELECT public.takeoff_create_export($1, 1, 1, (SELECT updated_at FROM suppliers WHERE id=$3), false, '{\"a\":1}'::jsonb, 'h', 'v', 1, $2::jsonb, NULL) AS r", [oid, actor, sup]);
  await c.query("INSERT INTO takeoff_placements (order_id, export_id, placed_on, placed_by_user_id) VALUES ($1,$2,current_date,$3)", [oid, ex.r.exportId, user]);
  const wsRev = (await one("SELECT revision FROM takeoff_workspaces WHERE id=$1", [w])).revision;
  await c.query(mig);
  const inc = async (mid) => Number((await one("SELECT rules->>'incrementMm' AS i FROM takeoff_job_materials WHERE id=$1", [mid])).i ?? NaN);
  assert.equal(await inc(A), 300); assert.equal(await inc(E), 300);
  assert.equal(await inc(B), 100);   // on a placed order
  assert.equal(await inc(C), 50);    // someone chose another step
  assert.deepEqual((await one("SELECT rules FROM takeoff_job_materials WHERE id=$1", [D])).rules, {});
  const h = await one("SELECT old_rules->>'incrementMm' AS o, new_rules->>'incrementMm' AS n, material_revision FROM takeoff_material_rule_history WHERE job_material_id=$1", [A]);
  assert.deepEqual([h.o, h.n, h.material_revision], ["100", "300", 2]);
  const pr = await one("SELECT current_revision FROM takeoff_material_presets WHERE id=$1", [pid]);
  assert.equal(pr.current_revision, 2);
  assert.equal((await one("SELECT rules->>'incrementMm' AS i FROM takeoff_material_preset_revisions WHERE preset_id=$1 AND revision=2", [pid])).i, "300");
  assert.equal((await one("SELECT rules->>'incrementMm' AS i FROM takeoff_material_preset_revisions WHERE preset_id=$1 AND revision=1", [pid])).i, "100");   // old revision kept
  assert.equal((await one("SELECT from_preset_revision FROM takeoff_job_materials WHERE id=$1", [E])).from_preset_revision, 2);
  assert.equal((await one("SELECT revision FROM takeoff_workspaces WHERE id=$1", [w])).revision, wsRev + 1);
  // re-run: nothing left to move
  await c.query("DROP TABLE _t209, _p209");
  const again = await c.query(mig);
  const counts = again.find((r) => r.command === "SELECT" && r.rows[0]?.job_flashings_moved_to_300 != null).rows[0];
  assert.equal(Number(counts.job_flashings_moved_to_300), 0); assert.equal(Number(counts.company_standards_moved_to_300), 0);
});

await db.close();
console.log(`takeoff-db: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
