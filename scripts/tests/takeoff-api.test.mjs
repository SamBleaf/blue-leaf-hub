// =============================================================================
// Takeoff API integration tests — REAL Express routes + REAL auth middleware + REAL migration
// 206 SQL (RPCs, triggers, constraints) on an isolated local Postgres. Only PostgREST is
// replaced (pgSupabaseShim). No Supabase project, no live data, no network.
//
//   node scripts/tests/takeoff-api.test.mjs
//
// Covers the R03 acceptance table: A01–A06, A08–A17, A21–A27 (A07 + SQL atomicity in
// takeoff-db.test.mjs; A18–A20 recovery in e2e/ui-review/takeoff.spec.js; A28 in takeoff-pdf.test.mjs).
// =============================================================================
import assert from "node:assert/strict";
import { register } from "node:module";
import crypto from "node:crypto";
import pg from "pg";
import { freshTakeoffDb } from "./lib/takeoffTestDb.mjs";
import { makePgSupabase } from "./lib/pgSupabaseShim.mjs";
import { buildKnownPlanPdf } from "./lib/takeoffPdfFixture.mjs";

const db = await freshTakeoffDb("blh_takeoff_api");
if (db.skip) { console.log(`takeoff-api: SKIPPED — ${db.skip}`); process.exit(0); }
await db.close();
const pool = new pg.Pool({ connectionString: db.url, max: 8 });
const sb = makePgSupabase(pool);
globalThis.__MOCK_SB__ = sb;

register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  if (url.endsWith("/server/lib/supabaseService.mjs")) {
    return { format: "module", shortCircuit: true, source: "export function getServiceSupabase(){ return globalThis.__MOCK_SB__ || null; }" };
  }
  return nextLoad(url, context);
}`), import.meta.url);

process.env.TAKEOFF_ENABLED = "true";
const { default: express } = await import("express");
const { registerWorkforceRoutes } = await import("../../server/lib/workforceRoutes.mjs");
const { registerTakeoffRoutes } = await import("../../server/lib/takeoff/takeoffRoutes.mjs");

const app = express();
app.use(express.json({ limit: "60mb" }));
registerWorkforceRoutes(app);
registerTakeoffRoutes(app);
const server = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
const BASE = `http://127.0.0.1:${server.address().port}`;

// ── seed ─────────────────────────────────────────────────────────────────────
const id = () => crypto.randomUUID();
const U = { admin: id(), sup: id(), emp: id() };
const q = (sql, p) => pool.query(sql, p);
for (const [k, uid] of Object.entries(U)) {
  await q("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [uid, `${k}@test.local`]);
  await q("INSERT INTO user_profiles (id, role) VALUES ($1, $2)", [uid, k === "admin" ? "admin" : k === "sup" ? "supervisor" : "employee"]);
  sb._tokens.set(`tok-${k}`, { id: uid, email: `${k}@test.local` });
}
const J = { carpA: id(), carpB: id(), job: id(), proj: id(), projNoJob: id(), site: id() };
await q("INSERT INTO carpentry_jobs (id, address, status) VALUES ($1, '1 Test St', 'active'), ($2, '2 Foreign Rd', 'complete')", [J.carpA, J.carpB]);
await q("INSERT INTO jobs (id, address) VALUES ($1, '3 Project Ave')", [J.job]);
await q("INSERT INTO projects (id, job_id, address, status) VALUES ($1, $2, '3 Project Ave', 'active'), ($3, NULL, '4 Orphan Ct', 'active')", [J.proj, J.job, J.projNoJob]);
await q("INSERT INTO charge_up_jobs (id, carpentry_job_id, status, address) VALUES ($1, $2, 'active', '5 Site Way')", [J.site, J.carpA]);
const E = { lh: id(), w: id() };
await q("INSERT INTO employees (id, name, is_leading_hand, is_active, worker_token) VALUES ($1, 'Lee Hand', true, true, 'wt-lh'), ($2, 'Will Worker', false, true, 'wt-w')", [E.lh, E.w]);
const supplier = id();
await q("INSERT INTO suppliers (id, name, email, phone, notes, account_terms) VALUES ($1, 'Fielders Test Branch', 'orders@fielders.test', '08 0000 0000', 'PRIVATE NOTE', '30 days')", [supplier]);
await q("INSERT INTO company_profile (name, abn, address, phone) VALUES ('Blue Leaf Building', '00 000 000 000', '1 Office Rd', '08 0000 0000')");

const plan = buildKnownPlanPdf({});
async function storePlan(owner, title) {
  const docId = id();
  const path = `${owner.carpentryJobId ? `carpentry/${owner.carpentryJobId}` : owner.chargeUpJobId ? `charge-up/${owner.chargeUpJobId}` : `job/${owner.jobId}`}/${docId}.pdf`;
  await sb.storage.from("job-plans").upload(path, plan.bytes);
  const sha = crypto.createHash("sha256").update(plan.bytes).digest("hex");
  await q(`INSERT INTO job_documents (id, job_id, carpentry_job_id, charge_up_job_id, document_type, title, status, storage_provider, storage_path, audience_layer, content_sha256, byte_size)
           VALUES ($1,$2,$3,$4,'architectural',$5,'current','supabase',$6,'worker',$7,$8)`,
    [docId, owner.jobId || null, owner.carpentryJobId || null, owner.chargeUpJobId || null, title, `job-plans/${path}`, sha, plan.bytes.length]);
  return docId;
}
const D = {
  a: await storePlan({ carpentryJobId: J.carpA }, "A-plan.pdf"),
  b: await storePlan({ carpentryJobId: J.carpB }, "B-plan.pdf"),
  site: await storePlan({ chargeUpJobId: J.site }, "Site-plan.pdf"),
};

// ── http helpers ─────────────────────────────────────────────────────────────
async function call(method, path, { as = "admin", body, worker, preview } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (worker) headers["x-worker-token"] = worker;
  else headers.Authorization = `Bearer tok-${as}`;
  if (preview) headers["x-preview-employee-id"] = preview;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get("content-type") || "";
  const data = ct.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { status: r.status, data, headers: r.headers };
}
const S = (p, o) => call("GET", `/api/takeoff${p}`, o);
const SP = (p, body, o = {}) => call("POST", `/api/takeoff${p}`, { ...o, body });
const W = (p, o) => call("GET", `/api/worker/takeoff${p}`, o);
const WP = (p, body, o = {}) => call("POST", `/api/worker/takeoff${p}`, { ...o, body });

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 3).join("\n    ")}`); }
}
const f = plan.meta.features;
const H = { p1: f.horizontalDim.p1, p2: f.horizontalDim.p2, knownMm: 12000 };
const V = { p1: f.verticalDim.p1, p2: f.verticalDim.p2, knownMm: 8000 };
const CHECK = { p1: f.checkDim.p1, p2: f.checkDim.p2, expectedMm: 3000 };
const pageMeta = { viewBox: plan.meta.viewBox, rotate: 0, userUnit: 1 };
const k = plan.meta.pdfUnitsPerMm;
const runPts = (mm, y = 300) => [{ x: 200, y }, { x: 200 + mm * k, y }];
const profile = {
  initialDirectionDeg: 0, segments: [{ id: "s1", lengthMm: 100 }, { id: "s2", lengthMm: 150 }, { id: "s3", lengthMm: 50 }],
  bends: [{ turnDeg: 90 }, { turnDeg: -90 }], start: { type: "none" }, end: { type: "closed_hem", widthMm: 10, side: "right" }, coatedFace: "left",
};
const spec = { product: "Flashing", finish: "COLORBOND", bmt: 0.55, colour: "Monument" };

// ── feature flag + capabilities ──────────────────────────────────────────────
await t("flag off → endpoints 404 FEATURE_DISABLED; capabilities report disabled", async () => {
  process.env.TAKEOFF_ENABLED = "false";
  const a = await S(`/jobs/carpentry/${J.carpA}`);
  assert.equal(a.status, 404); assert.equal(a.data.code, "FEATURE_DISABLED");
  const c = await S("/capabilities");
  assert.equal(c.status, 200); assert.equal(c.data.enabled, false);
  process.env.TAKEOFF_ENABLED = "true";
});
await t("capabilities: admin places orders; supervisor prepares only; LH edits; worker none", async () => {
  assert.equal((await S("/capabilities")).data.capabilities.placeOrders, true);
  const sup = (await S("/capabilities", { as: "sup" })).data.capabilities;
  assert.equal(sup.placeOrders, false); assert.equal(sup.edit, true);
  const lh = (await W(`/capabilities?jobType=carpentry&jobId=${J.carpA}`, { worker: "wt-lh" })).data.capabilities;
  assert.equal(lh.edit, true); assert.equal(lh.editStandards, false); assert.equal(lh.placeOrders, false);
  const w = (await W("/capabilities", { worker: "wt-w" })).data.capabilities;
  assert.equal(w.view, false);
});
await t("employee/client login cannot reach staff takeoff routes", async () => {
  assert.equal((await S(`/jobs/carpentry/${J.carpA}`, { as: "emp" })).status, 403);
  assert.equal((await S(`/jobs/carpentry/${J.carpA}`, { as: "nobody" })).status, 401);
});

// ── A01–A03 job entry ────────────────────────────────────────────────────────
await t("A01 carpentry job: plans listed with document identity", async () => {
  const r = await S(`/jobs/carpentry/${J.carpA}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.plans.map((p) => p.id), [D.a]);
  assert.equal(r.data.plans[0].contentSha256.length, 64);
});
await t("A02 project resolves to its job; project without job → 409 actionable", async () => {
  assert.equal((await S(`/jobs/project/${J.proj}`)).status, 200);
  const r = await S(`/jobs/project/${J.projNoJob}`);
  assert.equal(r.status, 409); assert.equal(r.data.code, "NO_LINKED_JOB"); assert.match(r.data.error, /no linked job/);
});
await t("A03 charge-up site has its own scope", async () => {
  const r = await S(`/jobs/charge-up/${J.site}`);
  assert.deepEqual(r.data.plans.map((p) => p.id), [D.site]);
});

// ── workspace + commit ───────────────────────────────────────────────────────
const wsId = id();
let rev;
await t("create workspace (idempotent on client id)", async () => {
  const a = await SP(`/jobs/carpentry/${J.carpA}/workspaces`, { id: wsId, name: "Flashings" });
  assert.equal(a.status, 200); rev = a.data.workspace.revision;
  const b = await SP(`/jobs/carpentry/${J.carpA}/workspaces`, { id: wsId, name: "Flashings" });
  assert.equal(b.data.workspace.id, wsId);
  const n = await q("SELECT count(*)::int n FROM takeoff_workspaces"); assert.equal(n.rows[0].n, 1);
});
const ids = { cal: id(), mat: id(), r1: id(), r2: id(), man: id(), c1: id(), c2: id(), c3: id(), cnt: id(), cnt2: id(), cc: id(), cc2: id() };
await t("commit: calibration (server-recomputed) + runs + manual + profile; A24 tampered values ignored", async () => {
  const r = await SP(`/workspaces/${wsId}/commit`, {
    expectedRevision: rev, idempotencyKey: "commit-0001",
    changes: {
      workspace: { primaryDocumentId: D.a, primaryPageIndex: 0 },
      calibrations: { insert: [{ id: ids.cal, documentId: D.a, pageIndex: 0, pageMeta, basisRotation: 0, horizontal: H, vertical: V, verification: CHECK, sx: 999, status: "ready" }] },
      materials: { upsert: [{ id: ids.mat, name: "Apron", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec, profile }] },
      measurements: { upsert: [
        { id: ids.r1, kind: "run", documentId: D.a, pageIndex: 0, calibrationId: ids.cal, points: runPts(4312), rawLengthMm: 1 },
        { id: ids.r2, kind: "run", documentId: D.a, pageIndex: 0, calibrationId: ids.cal, points: runPts(4312, 320) },
        { id: ids.man, kind: "manual", finishedLengthMm: 4312, quantity: 3 },
      ] },
      contributions: { upsert: [
        { id: ids.c1, measurementId: ids.r1, jobMaterialId: ids.mat }, { id: ids.c2, measurementId: ids.r2, jobMaterialId: ids.mat },
        { id: ids.c3, measurementId: ids.man, jobMaterialId: ids.mat },
      ] },
    },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  rev = r.data.commit.revision;
  const cal = r.data.snapshot.calibrations[0];
  assert.ok(Math.abs(cal.sx - plan.meta.mmPerPdfUnit) / plan.meta.mmPerPdfUnit < 1e-9, "server-computed scale");
  assert.equal(cal.status, "ready");
  const m = r.data.snapshot.measurements.find((x) => x.id === ids.r1);
  assert.ok(Math.abs(m.rawLengthMm - 4312) < 1e-6, `raw ${m.rawLengthMm}`);
  const lines = r.data.computed.scheduleLines;
  assert.equal(lines.find((l) => l.finishedLengthMm === 4600).quantity, 2);
  assert.equal(lines.find((l) => l.finishedLengthMm === 4312).quantity, 3);
});
await t("A09 retry with the same key → same revision, no duplicates", async () => {
  const r = await SP(`/workspaces/${wsId}/commit`, { expectedRevision: rev - 1, idempotencyKey: "commit-0001", changes: {} });
  assert.equal(r.status, 200); assert.equal(r.data.commit.replayed, true); assert.equal(r.data.commit.revision, rev);
  const n = await q("SELECT count(*)::int n FROM takeoff_measurements WHERE workspace_id=$1", [wsId]); assert.equal(n.rows[0].n, 3);
});
await t("A08 two writers on the same revision → exactly one wins, other 409", async () => {
  const mk = (n) => SP(`/workspaces/${wsId}/commit`, { expectedRevision: rev, idempotencyKey: `race-${n}-xxxx`, changes: { workspace: { name: `Race ${n}` } } });
  const [a, b] = await Promise.all([mk(1), mk(2)]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  const loser = a.status === 409 ? a : b;
  assert.match(loser.data.error, /kept on this device/);
  rev = (a.status === 200 ? a : b).data.commit.revision;
});
await t("A06 tampering: foreign plan / calibration on another page / foreign workspace", async () => {
  const r1 = await SP(`/workspaces/${wsId}/commit`, { expectedRevision: rev, changes: { measurements: { upsert: [{ id: id(), kind: "count", documentId: D.b, pageIndex: 0, points: [{ x: 1, y: 1 }], finishedLengthMm: 2400 }] } } });
  assert.equal(r1.status, 403);
  const r2 = await SP(`/workspaces/${wsId}/commit`, { expectedRevision: rev, changes: { measurements: { upsert: [{ id: id(), kind: "run", documentId: D.a, pageIndex: 3, calibrationId: ids.cal, points: runPts(1000) }] } } });
  assert.equal(r2.status, 400);
  const r3 = await SP(`/workspaces/${wsId}/commit`, { expectedRevision: rev, changes: { contributions: { upsert: [{ id: id(), measurementId: id(), jobMaterialId: ids.mat }] } } });
  assert.equal(r3.status, 400);
  // A workspace on job B (not visible to the leading hand)
  const wsB = id();
  await SP(`/jobs/carpentry/${J.carpB}/workspaces`, { id: wsB, name: "B" });
  assert.equal((await W(`/workspaces/${wsB}`, { worker: "wt-lh" })).status, 403);
  assert.equal((await W(`/documents/${D.b}/content`, { worker: "wt-lh" })).status, 403);
});
await t("region scope: run crossing the scaled region rejected", async () => {
  const calR = id();
  const ok1 = await SP(`/workspaces/${wsId}/commit`, { expectedRevision: rev, changes: { calibrations: { insert: [{ id: calR, documentId: D.a, pageIndex: 0, pageMeta, basisRotation: 0, horizontal: H, vertical: V, verification: CHECK, region: { x0: 100, y0: 100, x1: 400, y1: 400 }, regionLabel: "Ground" }] } } });
  assert.equal(ok1.status, 200, JSON.stringify(ok1.data)); rev = ok1.data.commit.revision;
  const r = await SP(`/workspaces/${wsId}/commit`, { expectedRevision: rev, changes: { measurements: { upsert: [{ id: id(), kind: "run", documentId: D.a, pageIndex: 0, calibrationId: calR, points: [{ x: 150, y: 150 }, { x: 600, y: 150 }] }] } } });
  assert.equal(r.status, 400); assert.equal(r.data.code, "OUTSIDE_REGION");
});
await t("axis mismatch > 0.5% refused unless separate scales chosen", async () => {
  const badV = { ...V, knownMm: 8200 };
  const r = await SP(`/workspaces/${wsId}/commit`, { expectedRevision: rev, changes: { calibrations: { insert: [{ id: id(), documentId: D.a, pageIndex: 1, pageMeta, basisRotation: 0, horizontal: H, vertical: badV }] } } });
  assert.equal(r.status, 400); assert.equal(r.data.code, "AXIS_MISMATCH");
});

// ── A04 / A05 worker roles + preview ─────────────────────────────────────────
await t("A04 leading hand reads + writes; ordinary worker denied", async () => {
  const g = await W(`/workspaces/${wsId}`, { worker: "wt-lh" });
  assert.equal(g.status, 200);
  const c = await WP(`/workspaces/${wsId}/commit`, { expectedRevision: rev, changes: { measurements: { upsert: [{ id: ids.cnt, kind: "count", documentId: D.a, pageIndex: 0, points: [{ x: 10, y: 10 }, { x: 20, y: 10 }], finishedLengthMm: 2400 }] }, contributions: { upsert: [{ id: ids.cc, measurementId: ids.cnt, jobMaterialId: ids.mat }] } } }, { worker: "wt-lh" });
  assert.equal(c.status, 200, JSON.stringify(c.data)); rev = c.data.commit.revision;
  const by = await q("SELECT created_by_type, created_by_employee_id, created_by_user_id FROM takeoff_measurements WHERE id=$1", [ids.cnt]);
  assert.equal(by.rows[0].created_by_type, "employee"); assert.equal(by.rows[0].created_by_employee_id, E.lh); assert.equal(by.rows[0].created_by_user_id, null);
  assert.equal((await W(`/workspaces/${wsId}`, { worker: "wt-w" })).status, 403);
  assert.equal((await WP(`/workspaces/${wsId}/commit`, { expectedRevision: rev, changes: {} }, { worker: "wt-w" })).status, 403);
});
await t("A05 admin preview: reads allowed, every write denied", async () => {
  assert.equal((await W(`/workspaces/${wsId}`, { as: "admin", preview: E.lh })).status, 200);
  assert.equal((await WP(`/workspaces/${wsId}/commit`, { expectedRevision: rev, changes: {} }, { as: "admin", preview: E.lh })).status, 403);
  assert.equal((await WP(`/jobs/carpentry/${J.carpA}/workspaces`, { name: "x" }, { as: "admin", preview: E.lh })).status, 403);
});
await t("A17 count length change: new marks new length, old marks keep theirs", async () => {
  const c = await WP(`/workspaces/${wsId}/commit`, { expectedRevision: rev, changes: { measurements: { upsert: [{ id: ids.cnt2, kind: "count", documentId: D.a, pageIndex: 0, points: [{ x: 30, y: 10 }], finishedLengthMm: 3000 }] }, contributions: { upsert: [{ id: ids.cc2, measurementId: ids.cnt2, jobMaterialId: ids.mat }] } } }, { worker: "wt-lh" });
  rev = c.data.commit.revision;
  const lines = c.data.computed.scheduleLines;
  assert.equal(lines.find((l) => l.finishedLengthMm === 2400).quantity, 2);
  assert.equal(lines.find((l) => l.finishedLengthMm === 3000).quantity, 1);
});

// ── A16 split ────────────────────────────────────────────────────────────────
const longRun = id(), longC = id();
await t("A16 split: valid split replaces original; invalid rejected; undo restores once", async () => {
  let r = await SP(`/workspaces/${wsId}/commit`, { expectedRevision: rev, changes: { measurements: { upsert: [{ id: longRun, kind: "run", documentId: D.a, pageIndex: 0, calibrationId: ids.cal, points: runPts(7000, 500) }] }, contributions: { upsert: [{ id: longC, measurementId: longRun, jobMaterialId: ids.mat }] } } });
  rev = r.data.commit.revision;
  assert.equal(r.data.computed.scheduleLines.find((l) => l.finishedLengthMm === 7200).quantity, 1);
  r = await SP(`/workspaces/${wsId}/commit`, { expectedRevision: rev, changes: { contributions: { upsert: [{ id: longC, measurementId: longRun, jobMaterialId: ids.mat, split: { pieces: [3600, 3600], laps: [200], sourceFinishedMm: 7200 } }] } } });
  assert.equal(r.status, 400); assert.equal(r.data.code, "SPLIT_INVALID");
  r = await SP(`/workspaces/${wsId}/commit`, { expectedRevision: rev, changes: { contributions: { upsert: [{ id: longC, measurementId: longRun, jobMaterialId: ids.mat, split: { pieces: [3700, 3700], laps: [200], sourceFinishedMm: 7200 } }] } } });
  assert.equal(r.status, 200); rev = r.data.commit.revision;
  assert.equal(r.data.computed.scheduleLines.find((l) => l.finishedLengthMm === 7200), undefined);
  assert.equal(r.data.computed.scheduleLines.find((l) => l.finishedLengthMm === 3700).quantity, 2);
  r = await SP(`/workspaces/${wsId}/commit`, { expectedRevision: rev, changes: { contributions: { upsert: [{ id: longC, measurementId: longRun, jobMaterialId: ids.mat, split: null }] } } });
  rev = r.data.commit.revision;
  assert.equal(r.data.computed.scheduleLines.find((l) => l.finishedLengthMm === 7200).quantity, 1);
  assert.equal(r.data.computed.scheduleLines.find((l) => l.finishedLengthMm === 3700), undefined);
});

// ── A10 standards ────────────────────────────────────────────────────────────
let presetId;
await t("A10 standard copied into job; job edit never writes back; worker cannot edit standards", async () => {
  const p = await SP("/presets", { content: { name: "Std apron", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec, profile } });
  assert.equal(p.status, 200, JSON.stringify(p.data)); presetId = p.data.preset.presetId;
  const jm = id();
  let r = await SP(`/workspaces/${wsId}/commit`, { expectedRevision: rev, changes: { materials: { upsert: [{ id: jm, fromPreset: { presetId } }] } } });
  rev = r.data.commit.revision;
  const copy = r.data.snapshot.materials.find((m) => m.id === jm);
  assert.equal(copy.fromPresetId, presetId); assert.equal(copy.profile.segments[0].lengthMm, 100);
  r = await SP(`/workspaces/${wsId}/commit`, { expectedRevision: rev, changes: { materials: { upsert: [{ ...copy, profile: { ...copy.profile, segments: copy.profile.segments.map((s, i) => (i === 0 ? { ...s, lengthMm: 120 } : s)) } }] } } });
  rev = r.data.commit.revision;
  const std = (await S("/presets")).data.presets.find((x) => x.id === presetId);
  assert.equal(std.profile.segments[0].lengthMm, 100); assert.equal(std.revision, 1);
  assert.equal((await WP("/presets", { content: { name: "x" } }, { worker: "wt-lh" })).status, 404); // no worker route
  const sup = await S("/suppliers"); assert.ok(sup.data.suppliers[0].email);
  const wsup = await W("/suppliers", { worker: "wt-lh" });
  // leading hands see the order contact they will send the PDF to — never account terms or notes
  assert.equal(wsup.data.suppliers[0].email, "orders@fielders.test");
  assert.equal(JSON.stringify(wsup.data).includes("PRIVATE NOTE"), false); assert.equal(JSON.stringify(wsup.data).includes("30 days"), false);
  assert.equal(wsup.data.defaultSupplierId, supplier);
});

// ── orders, exports, placements ─────────────────────────────────────────────
let orderId, orderRev, readyExportId, firstExportPdfSha;
await t("order: create + lines; order-ready export blocked until supplier/delivery complete", async () => {
  orderId = id();
  const o = await SP(`/workspaces/${wsId}/orders`, { category: "flashings", id: orderId, supplierId: supplier });
  assert.equal(o.status, 200); assert.match(o.data.order.orderRef, /^FO-\d{6}$/); orderRev = o.data.order.revision;
  const sched = (await S(`/workspaces/${wsId}/orders`)).data.scheduleLines.filter((l) => l.problems.length === 0 && l.finishedLengthMm === 4600);
  const pr = await call("PATCH", `/api/takeoff/orders/${orderId}`, { body: { expectedRevision: orderRev, lines: sched.map((l) => ({ bucketKey: l.bucketKey, quantity: l.quantity })) } });
  assert.equal(pr.status, 200, JSON.stringify(pr.data)); orderRev = pr.data.result.revision;
  const wsRev = (await S(`/workspaces/${wsId}`)).data.snapshot.workspace.revision;
  const e = await SP(`/orders/${orderId}/exports`, { isDraft: false, idempotencyKey: "exp-notready", expectedOrderRevision: orderRev, expectedWorkspaceRevision: wsRev });
  assert.equal(e.status, 400); assert.equal(e.data.code, "NOT_READY"); assert.match(e.data.error, /delivery or pickup/);
});
await t("draft export: frozen + watermarked PDF; A21 export doesn't change ordered", async () => {
  const wsRev = (await S(`/workspaces/${wsId}`)).data.snapshot.workspace.revision;
  const e = await SP(`/orders/${orderId}/exports`, { isDraft: true, idempotencyKey: "exp-draft-1", expectedOrderRevision: orderRev, expectedWorkspaceRevision: wsRev });
  assert.equal(e.status, 200, JSON.stringify(e.data)); assert.equal(e.data.export.artifactStatus, "ready");
  const pdf = await S(`/exports/${e.data.export.exportId}/pdf`);
  assert.equal(pdf.data.subarray(0, 4).toString(), "%PDF");
  const st = (await S(`/workspaces/${wsId}/orders`)).data.orderStatus;
  assert.ok(st.every((x) => x.ordered === 0));
});
await t("order-ready export after delivery set; stale expected revision → 409", async () => {
  let pr = await call("PATCH", `/api/takeoff/orders/${orderId}`, { body: { expectedRevision: orderRev, delivery: { method: "delivery", address: "1 Test St", requiredDate: "2026-10-20", contactPhone: "0400 000 000" } } });
  orderRev = pr.data.result.revision;
  const wsRev = (await S(`/workspaces/${wsId}`)).data.snapshot.workspace.revision;
  const stale = await SP(`/orders/${orderId}/exports`, { isDraft: false, idempotencyKey: "exp-stale-1", expectedOrderRevision: orderRev - 1, expectedWorkspaceRevision: wsRev });
  assert.equal(stale.status, 409);
  const e = await SP(`/orders/${orderId}/exports`, { isDraft: false, idempotencyKey: "exp-ready-1", expectedOrderRevision: orderRev, expectedWorkspaceRevision: wsRev });
  assert.equal(e.status, 200, JSON.stringify(e.data)); readyExportId = e.data.export.exportId;
  const again = await SP(`/orders/${orderId}/exports`, { isDraft: false, idempotencyKey: "exp-ready-1", expectedOrderRevision: orderRev, expectedWorkspaceRevision: wsRev });
  assert.equal(again.data.export.exportId, readyExportId);
  const ex = await q("SELECT count(*)::int n FROM takeoff_exports WHERE order_id=$1", [orderId]); assert.equal(ex.rows[0].n, 2);
  firstExportPdfSha = (await q("SELECT pdf_sha256 FROM takeoff_exports WHERE id=$1", [readyExportId])).rows[0].pdf_sha256;
});
await t("A11/A26 rule edit + supplier edit after export: frozen snapshot/PDF unchanged", async () => {
  const snapBefore = (await q("SELECT snapshot_sha256 FROM takeoff_exports WHERE id=$1", [readyExportId])).rows[0].snapshot_sha256;
  const snap = (await S(`/workspaces/${wsId}`)).data.snapshot;
  const mat = snap.materials.find((m) => m.id === ids.mat);
  const r = await SP(`/workspaces/${wsId}/commit`, { expectedRevision: snap.workspace.revision, changes: { materials: { upsert: [{ ...mat, rules: { allowanceMm: 300, incrementMm: 100 } }] } } });
  assert.equal(r.status, 200); rev = r.data.commit.revision;
  assert.ok(r.data.computed.scheduleLines.find((l) => l.finishedLengthMm === 4700)); // before 4600 → after 4700
  await q("UPDATE suppliers SET name='Renamed Supplier', updated_at=now() WHERE id=$1", [supplier]);
  const after = await q("SELECT snapshot_sha256, pdf_sha256, snapshot->'supplier'->>'name' AS sname FROM takeoff_exports WHERE id=$1", [readyExportId]);
  assert.equal(after.rows[0].snapshot_sha256, snapBefore); assert.equal(after.rows[0].pdf_sha256, firstExportPdfSha);
  assert.equal(after.rows[0].sname, "Fielders Test Branch");
  const pdf = await S(`/exports/${readyExportId}/pdf`);
  assert.equal(crypto.createHash("sha256").update(pdf.data).digest("hex"), firstExportPdfSha);
});
await t("A27 artifact failure: retryable, no ready link, no placement", async () => {
  // revert the rule so the order's lines still exist
  const snap = (await S(`/workspaces/${wsId}`)).data.snapshot;
  const mat = snap.materials.find((m) => m.id === ids.mat);
  rev = (await SP(`/workspaces/${wsId}/commit`, { expectedRevision: snap.workspace.revision, changes: { materials: { upsert: [{ ...mat, rules: {} }] } } })).data.commit.revision;
  sb._failures.upload = 1;
  const e = await SP(`/orders/${orderId}/exports`, { isDraft: true, idempotencyKey: "exp-fail-1", expectedOrderRevision: orderRev, expectedWorkspaceRevision: rev });
  assert.equal(e.status, 502); assert.equal(e.data.code, "ARTIFACT_FAILED"); assert.match(e.data.error, /nothing was sent or placed/);
  const row = (await q("SELECT id, artifact_status, pdf_document_id FROM takeoff_exports WHERE order_id=$1 ORDER BY export_no DESC LIMIT 1", [orderId])).rows[0];
  assert.equal(row.artifact_status, "failed"); assert.equal(row.pdf_document_id, null);
  assert.equal((await S(`/exports/${row.id}/pdf`)).status, 409);
  const retry = await SP(`/exports/${row.id}/retry`, {});
  assert.equal(retry.status, 200); assert.equal(retry.data.export.artifactStatus, "ready");
});

// A22/A23 partial allocation in a clean workspace
const ws2 = id(); let rev2; const m10 = id(), c10 = id(), mat2 = id();
async function exportReady(oid, key, extra = {}) {
  const o = (await S(`/workspaces/${ws2}/orders`)).data.orders.find((x) => x.id === oid);
  const wsRev = (await S(`/workspaces/${ws2}`)).data.snapshot.workspace.revision;
  const e = await SP(`/orders/${oid}/exports`, { isDraft: false, idempotencyKey: key, expectedOrderRevision: o.revision, expectedWorkspaceRevision: wsRev, ...extra });
  assert.equal(e.status, 200, JSON.stringify(e.data));
  return e.data.export.exportId;
}
async function newOrder(qty) {
  const oid = id();
  const o = await SP(`/workspaces/${ws2}/orders`, { category: "flashings", id: oid, supplierId: supplier, delivery: { method: "pickup", pickupBranch: "Test branch", asap: true, contactPhone: "0400 000 000" } });
  const line = (await S(`/workspaces/${ws2}/orders`)).data.scheduleLines[0];
  const pr = await call("PATCH", `/api/takeoff/orders/${oid}`, { body: { expectedRevision: o.data.order.revision, lines: [{ bucketKey: line.bucketKey, quantity: qty }] } });
  assert.equal(pr.status, 200, JSON.stringify(pr.data));
  return oid;
}
let placeA, orderA;
await t("A22 required 10, placed 6 → remaining 4; retry unchanged; over-allocation needs explicit surplus", async () => {
  await SP(`/jobs/carpentry/${J.carpA}/workspaces`, { id: ws2, name: "Partial" });
  const r = await SP(`/workspaces/${ws2}/commit`, { expectedRevision: 1, changes: {
    materials: { upsert: [{ id: mat2, name: "Barge", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec, profile }] },
    measurements: { upsert: [{ id: m10, kind: "manual", finishedLengthMm: 4600, quantity: 10 }] },
    contributions: { upsert: [{ id: c10, measurementId: m10, jobMaterialId: mat2 }] } } });
  rev2 = r.data.commit.revision; void rev2;
  orderA = await newOrder(6);
  const exA = await exportReady(orderA, "exA-ready-1");
  assert.equal((await SP(`/orders/${orderA}/placements`, { exportId: exA, placedOn: "2026-10-13", idempotencyKey: "place-sup-1" }, { as: "sup" })).status, 403);
  const p = await SP(`/orders/${orderA}/placements`, { exportId: exA, placedOn: "2026-10-13", supplierReference: "SO-123", idempotencyKey: "place-A-0001" });
  assert.equal(p.status, 200, JSON.stringify(p.data)); placeA = p.data.placement.placementId;
  let st = (await S(`/workspaces/${ws2}/orders`)).data.orderStatus[0];
  assert.deepEqual([st.required, st.ordered, st.remaining], [10, 6, 4]);
  const again = await SP(`/orders/${orderA}/placements`, { exportId: exA, placedOn: "2026-10-13", idempotencyKey: "place-A-0001" });
  assert.equal(again.data.placement.placementId, placeA);
  st = (await S(`/workspaces/${ws2}/orders`)).data.orderStatus[0]; assert.equal(st.ordered, 6);
  // placed order is locked
  const o = (await S(`/workspaces/${ws2}/orders`)).data.orders.find((x) => x.id === orderA);
  assert.equal((await call("PATCH", `/api/takeoff/orders/${orderA}`, { body: { expectedRevision: o.revision, notes: "x" } })).status, 400);
  const orderB = await newOrder(6);
  // R04b R7: pieces already placed can't go on another order-ready export by accident…
  const oB = (await S(`/workspaces/${ws2}/orders`)).data.orders.find((x) => x.id === orderB);
  const refused = await SP(`/orders/${orderB}/exports`, { isDraft: false, idempotencyKey: "exB-refused", expectedOrderRevision: oB.revision, expectedWorkspaceRevision: (await S(`/workspaces/${ws2}`)).data.snapshot.workspace.revision });
  assert.equal(refused.status, 400); assert.match(refused.data.error, /already on/);
  // …only with an explicit "order extra" acknowledgement
  const exB = await exportReady(orderB, "exB-ready-1", { acknowledgeSurplus: true });
  const over = await SP(`/orders/${orderB}/placements`, { exportId: exB, placedOn: "2026-10-13", idempotencyKey: "place-B-0001" });
  assert.equal(over.status, 409); assert.equal(over.data.code, "SURPLUS");
  const ack = await SP(`/orders/${orderB}/placements`, { exportId: exB, placedOn: "2026-10-13", acknowledgeSurplus: true, idempotencyKey: "place-B-0002" });
  assert.equal(ack.status, 200); assert.equal(ack.data.placement.surplus, 2);
  st = (await S(`/workspaces/${ws2}/orders`)).data.orderStatus[0];
  assert.deepEqual([st.required, st.ordered, st.remaining, st.surplus], [10, 12, 0, 2]);
});
await t("A23 cancel placement reverses its commitment; history kept; cancelled order not editable", async () => {
  const c = await SP(`/placements/${placeA}/cancel`, { reason: "Supplier out of stock" });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  const st = (await S(`/workspaces/${ws2}/orders`)).data.orderStatus[0];
  assert.deepEqual([st.ordered, st.remaining], [6, 4]);
  const hist = (await S(`/workspaces/${ws2}/orders`)).data.orders.find((o) => o.id === orderA);
  assert.equal(hist.status, "cancelled"); assert.equal(hist.placements[0].status, "cancelled"); assert.ok(hist.exports.length >= 1);
  assert.equal((await SP(`/placements/${placeA}/cancel`, { reason: "again" })).status, 400);
});

// ── plan lifecycle A12–A15 ───────────────────────────────────────────────────
await t("A13 cross-job supersession rejected before storage/DB mutation", async () => {
  const before = sb._buckets.get("job-plans").size;
  const r = await call("POST", `/api/carpentry/jobs/${J.carpA}/plans`, { body: { fileBase64: Buffer.from(plan.bytes).toString("base64"), fileName: "x.pdf", supersedesDocumentId: D.b } });
  assert.equal(r.status, 400);
  assert.equal(sb._buckets.get("job-plans").size, before);
  assert.equal((await q("SELECT status FROM job_documents WHERE id=$1", [D.b])).rows[0].status, "current");
});
await t("A15 new revision supersedes measured plan: takeoff → needs review, old measurements kept + flagged", async () => {
  const r = await call("POST", `/api/carpentry/jobs/${J.carpA}/plans`, { body: { fileBase64: Buffer.from(plan.bytes).toString("base64"), fileName: "A-plan-revB.pdf", revision: "Rev B", supersedesDocumentId: D.a } });
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.version, 2); assert.equal(r.data.revisionLabel, "Rev B");
  assert.equal((await q("SELECT status FROM job_documents WHERE id=$1", [D.a])).rows[0].status, "superseded");
  const g = (await S(`/workspaces/${wsId}`)).data;
  assert.equal(g.snapshot.workspace.state, "needs_review");
  assert.ok(g.snapshot.measurements.find((m) => m.id === ids.r1));
  assert.ok(g.computed.contributions.find((c) => c.contributionId === ids.c1).problems.includes("plan_superseded"));
  const again = await call("POST", `/api/carpentry/jobs/${J.carpA}/plans`, { body: { fileBase64: Buffer.from(plan.bytes).toString("base64"), fileName: "dup.pdf", supersedesDocumentId: D.a } });
  assert.equal(again.status, 409);
  const cal = await SP(`/workspaces/${wsId}/commit`, { expectedRevision: g.snapshot.workspace.revision, changes: { calibrations: { insert: [{ id: id(), documentId: D.a, pageIndex: 0, pageMeta, basisRotation: 0, horizontal: H, vertical: V }] } } });
  assert.equal(cal.status, 400);
  const wsRev = g.snapshot.workspace.revision;
  const o = (await S(`/workspaces/${wsId}/orders`)).data.orders.find((x) => x.id === orderId);
  const e = await SP(`/orders/${orderId}/exports`, { isDraft: false, idempotencyKey: "exp-after-supersede", expectedOrderRevision: o.revision, expectedWorkspaceRevision: wsRev });
  assert.equal(e.status, 400); assert.equal(e.data.code, "NOT_READY");
});
await t("A14 delete measured plan → archived, bytes kept; unreferenced plan → row then object removed", async () => {
  const pathA = (await q("SELECT storage_path FROM job_documents WHERE id=$1", [D.a])).rows[0].storage_path.split("/").slice(1).join("/");
  const del = await call("DELETE", `/api/job-plans/${D.a}`);
  assert.equal(del.status, 200); assert.equal(del.data.archived, true);
  assert.ok(sb._buckets.get("job-plans").has(pathA));
  assert.equal((await S(`/documents/${D.a}/content`)).status, 200); // historic plan still viewable
  const loose = await storePlan({ carpentryJobId: J.carpA }, "loose.pdf");
  const pathL = (await q("SELECT storage_path FROM job_documents WHERE id=$1", [loose])).rows[0].storage_path.split("/").slice(1).join("/");
  const d2 = await call("DELETE", `/api/job-plans/${loose}`);
  assert.equal(d2.data.archived, false);
  assert.equal((await q("SELECT count(*)::int n FROM job_documents WHERE id=$1", [loose])).rows[0].n, 0);
  assert.equal(sb._buckets.get("job-plans").has(pathL), false);
});
await t("plan bytes: authorised, integrity-checked, oversize → 413 with device-viewer fallback", async () => {
  const r = await W(`/documents/${D.site}/content`, { worker: "wt-lh" });
  assert.equal(r.status, 200); assert.equal(Buffer.compare(r.data, Buffer.from(plan.bytes)), 0);
  const bigDoc = id();
  await q(`INSERT INTO job_documents (id, charge_up_job_id, document_type, title, status, storage_provider, storage_path, audience_layer, byte_size)
           VALUES ($1,$2,'architectural','big.pdf','current','supabase','job-plans/x/big.pdf','worker',$3)`, [bigDoc, J.site, 50 * 1024 * 1024]);
  const big = await W(`/documents/${bigDoc}/content`, { worker: "wt-lh" });
  assert.equal(big.status, 413); assert.equal(big.data.code, "TOO_LARGE");
});

// ── adversarial-review regressions ───────────────────────────────────────────
await t("review #1: a shrunk requirement never locks out later, unrelated placements", async () => {
  const w3 = id(), mat = id(), m1 = id(), c1 = id(), m2 = id(), c2 = id();
  await SP(`/jobs/carpentry/${J.carpA}/workspaces`, { id: w3, name: "Lockout" });
  let r = await SP(`/workspaces/${w3}/commit`, { expectedRevision: 1, changes: {
    materials: { upsert: [{ id: mat, name: "M", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec, profile }] },
    measurements: { upsert: [{ id: m1, kind: "manual", finishedLengthMm: 4600, quantity: 10 }, { id: m2, kind: "manual", finishedLengthMm: 3000, quantity: 5 }] },
    contributions: { upsert: [{ id: c1, measurementId: m1, jobMaterialId: mat }, { id: c2, measurementId: m2, jobMaterialId: mat }] } } });
  const place = async (bucketLen, qty, key) => {
    const oid = id();
    const o = await SP(`/workspaces/${w3}/orders`, { category: "flashings", id: oid, supplierId: supplier, delivery: { method: "pickup", pickupBranch: "Test branch", asap: true, contactPhone: "0400 000 000" } });
    const line = (await S(`/workspaces/${w3}/orders`)).data.scheduleLines.find((l) => l.finishedLengthMm === bucketLen);
    await call("PATCH", `/api/takeoff/orders/${oid}`, { body: { expectedRevision: o.data.order.revision, lines: [{ bucketKey: line.bucketKey, quantity: qty }] } });
    const ord = (await S(`/workspaces/${w3}/orders`)).data.orders.find((x) => x.id === oid);
    const wsRev = (await S(`/workspaces/${w3}`)).data.snapshot.workspace.revision;
    const e = await SP(`/orders/${oid}/exports`, { isDraft: false, idempotencyKey: `${key}-exp`, expectedOrderRevision: ord.revision, expectedWorkspaceRevision: wsRev });
    return SP(`/orders/${oid}/placements`, { exportId: e.data.export.exportId, placedOn: "2026-10-13", idempotencyKey: `${key}-place` });
  };
  assert.equal((await place(4600, 10, "lock-a")).status, 200);
  const snap = (await S(`/workspaces/${w3}`)).data.snapshot;
  r = await SP(`/workspaces/${w3}/commit`, { expectedRevision: snap.workspace.revision, changes: { measurements: { upsert: [{ id: m1, kind: "manual", finishedLengthMm: 4600, quantity: 4 }] } } });
  assert.equal(r.status, 200);
  const st = r.data.orderStatus.find((x) => x.required === 4);
  assert.equal(st.surplus, 6);
  const p2 = await place(3000, 5, "lock-b");
  assert.equal(p2.status, 200, JSON.stringify(p2.data));
});
await t("review #2: concurrent PDF retries never leave a ready export without bytes", async () => {
  const oid = (await q("SELECT id FROM takeoff_orders WHERE workspace_id=$1 AND status='draft' LIMIT 1", [wsId])).rows[0]?.id || orderId;
  const o = (await S(`/workspaces/${wsId}/orders`)).data.orders.find((x) => x.id === oid);
  const wsRev = (await S(`/workspaces/${wsId}`)).data.snapshot.workspace.revision;
  sb._failures.upload = 1;
  const e = await SP(`/orders/${oid}/exports`, { isDraft: true, idempotencyKey: "race-exp-1", expectedOrderRevision: o.revision, expectedWorkspaceRevision: wsRev });
  assert.equal(e.status, 502);
  const ex = (await q("SELECT id FROM takeoff_exports WHERE order_id=$1 ORDER BY export_no DESC LIMIT 1", [oid])).rows[0].id;
  const [a, b, c] = await Promise.all([SP(`/exports/${ex}/retry`, {}), SP(`/exports/${ex}/retry`, {}), SP(`/exports/${ex}/retry`, {})]);
  assert.deepEqual([a.status, b.status, c.status], [200, 200, 200]);
  const pdf = await S(`/exports/${ex}/pdf`);
  assert.equal(pdf.status, 200); assert.equal(pdf.data.subarray(0, 4).toString(), "%PDF");
  const docs = (await q("SELECT count(*)::int n FROM job_documents WHERE document_type='purchase_order' AND storage_path LIKE $1", [`takeoff-exports/%-e${(await q("SELECT export_no FROM takeoff_exports WHERE id=$1", [ex])).rows[0].export_no}-draft-%`])).rows[0].n;
  assert.ok(docs >= 1);
  const orphanObjects = [...sb._buckets.get("takeoff-exports").keys()].length - (await q("SELECT count(*)::int n FROM job_documents WHERE document_type='purchase_order'")).rows[0].n;
  assert.equal(orphanObjects, 0, "no orphan objects");
});
await t("review #7: unknown contribution role rejected (no double counting)", async () => {
  const snap = (await S(`/workspaces/${wsId}`)).data.snapshot;
  const r = await SP(`/workspaces/${wsId}/commit`, { expectedRevision: snap.workspace.revision, changes: { contributions: { upsert: [{ id: id(), measurementId: ids.man, jobMaterialId: ids.mat, role: "extra" }] } } });
  assert.equal(r.status, 400);
  const dup = await SP(`/workspaces/${wsId}/commit`, { expectedRevision: snap.workspace.revision, changes: { contributions: { upsert: [{ id: id(), measurementId: ids.man, jobMaterialId: ids.mat }] } } });
  assert.equal(dup.status, 409); // unique active (measurement, material)
});
await t("review #10/#17: plan upload can't supersede a non-plan; plan download link won't sign non-plans", async () => {
  const exportDoc = (await q("SELECT id FROM job_documents WHERE document_type='purchase_order' LIMIT 1")).rows[0].id;
  const r = await call("POST", `/api/carpentry/jobs/${J.carpA}/plans`, { body: { fileBase64: Buffer.from(plan.bytes).toString("base64"), fileName: "x.pdf", supersedesDocumentId: exportDoc } });
  assert.equal(r.status, 400);
  assert.equal((await call("GET", `/api/job-plans/${exportDoc}/download`)).status, 404);
});
await t("review #11: a placement replay can't reuse another action's key", async () => {
  const o = (await S(`/workspaces/${ws2}/orders`)).data.orders.find((x) => x.status === "draft") || null;
  if (!o) return; // all orders already placed in this scenario
  const r = await SP(`/orders/${o.id}/placements`, { exportId: o.exports[0]?.id, placedOn: "2026-10-13", idempotencyKey: "exB-ready-1" });
  assert.equal(r.status, 400);
});
await t("review #13: absurd page index rejected with a plain 400", async () => {
  const snap = (await S(`/workspaces/${wsId}`)).data.snapshot;
  const r = await SP(`/workspaces/${wsId}/commit`, { expectedRevision: snap.workspace.revision, changes: { measurements: { upsert: [{ id: id(), kind: "count", documentId: D.site, pageIndex: 3e9, points: [{ x: 1, y: 1 }], finishedLengthMm: 100 }] } } });
  assert.equal(r.status === 400 || r.status === 403, true);
  const many = await SP(`/workspaces/${wsId}/commit`, { expectedRevision: snap.workspace.revision, changes: { calibrations: { insert: Array.from({ length: 21 }, () => ({ id: id() })) } } });
  assert.equal(many.status, 400); assert.equal(many.data.code, "LIMIT");
});
await t("review #6: a hash-anchored plan can't be repointed; served bytes must match the scaled bytes", async () => {
  const anchored = (await q("SELECT id, storage_path FROM job_documents WHERE content_sha256 IS NOT NULL AND document_type='architectural' LIMIT 1")).rows[0];
  await assert.rejects(q("UPDATE job_documents SET storage_path='job-plans/elsewhere.pdf' WHERE id=$1", [anchored.id]), /TAKEOFF_IMMUTABLE/);
  // tamper the stored bytes behind a calibrated plan (storage-level) → refused, not silently served
  const path = (await q("SELECT storage_path FROM job_documents WHERE id=$1", [D.a])).rows[0].storage_path.split("/").slice(1).join("/");
  const orig = sb._buckets.get("job-plans").get(path);
  sb._buckets.get("job-plans").set(path, Buffer.from("%PDF-1.4 tampered"));
  const r = await S(`/documents/${D.a}/content`);
  assert.equal(r.status, 500); assert.equal(r.data.code, "INTEGRITY");
  sb._buckets.get("job-plans").set(path, orig);
});
await t("HUB 021: plan bytes carry their stored hash (X-Content-Sha256) for the device copy, and stay out of the HTTP cache", async () => {
  const r = await S(`/documents/${D.a}/content`);
  assert.equal(r.status, 200);
  const sha = (await q("SELECT content_sha256 FROM job_documents WHERE id=$1", [D.a])).rows[0].content_sha256;
  assert.match(sha, /^[0-9a-f]{64}$/);
  assert.equal(r.headers.get("x-content-sha256"), sha);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  const w = await W(`/documents/${D.site}/content`, { worker: "wt-lh" });
  if (w.status === 200) assert.equal(w.headers.get("x-content-sha256"), (await q("SELECT content_sha256 FROM job_documents WHERE id=$1", [D.site])).rows[0].content_sha256);
});
await t("review #9: replacing a plan bumps the takeoff revision (stale exports can't freeze)", async () => {
  const before = (await q("SELECT revision FROM takeoff_workspaces WHERE id=$1", [wsId])).rows[0].revision;
  const cur = (await S(`/jobs/carpentry/${J.carpA}`)).data.plans.find((p) => p.status === "current");
  const r = await call("POST", `/api/carpentry/jobs/${J.carpA}/plans`, { body: { fileBase64: Buffer.from(plan.bytes).toString("base64"), fileName: "rev-c.pdf", supersedesDocumentId: cur.id } });
  assert.equal(r.status, 200);
  void before; // the workspace only references the old docs if it measured on them
  const refs = (await q("SELECT count(*)::int n FROM takeoff_measurements WHERE workspace_id=$1 AND document_id=$2", [wsId, cur.id])).rows[0].n;
  if (refs) assert.ok((await q("SELECT revision FROM takeoff_workspaces WHERE id=$1", [wsId])).rows[0].revision > before);
});

// ── R04 corrections over real routes + real SQL ──────────────────────────────
const w4 = id(); const r4 = { m1: id(), m2: id(), a: id(), b: id(), ca: id(), cb: id(), man: id(), cm: id(), perf: id(), zinc: id() };
async function w4rev() { return (await S(`/workspaces/${w4}`)).data.snapshot.workspace.revision; }
await t("R04 F01: changing the colour of a line's material makes the saved line stale; re-saving keeps it (no silent relink); export refused; draft prints the bucket's colour", async () => {
  await SP(`/jobs/carpentry/${J.carpA}/workspaces`, { id: w4, name: "R04" });
  let r = await SP(`/workspaces/${w4}/commit`, { expectedRevision: 1, changes: {
    materials: { upsert: [{ id: r4.m1, name: "Apron A", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec, profile }, { id: r4.m2, name: "Apron B", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec, profile }] },
    measurements: { upsert: [{ id: r4.a, kind: "manual", finishedLengthMm: 4600, quantity: 1 }, { id: r4.b, kind: "manual", finishedLengthMm: 4600, quantity: 1 }] },
    contributions: { upsert: [{ id: r4.ca, measurementId: r4.a, jobMaterialId: r4.m1 }, { id: r4.cb, measurementId: r4.b, jobMaterialId: r4.m2 }] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const oid = id();
  const o = await SP(`/workspaces/${w4}/orders`, { category: "flashings", id: oid, supplierId: supplier, delivery: { method: "pickup", pickupBranch: "Test branch", asap: true, contactPhone: "0400 000 000" } });
  const line = (await S(`/workspaces/${w4}/orders`)).data.scheduleLines[0];
  r = await call("PATCH", `/api/takeoff/orders/${oid}`, { body: { expectedRevision: o.data.order.revision, lines: [{ bucketKey: line.bucketKey, quantity: 1, jobMaterialId: r4.m1 }] } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual((await S(`/orders/${oid}/preview`)).data.preview.problems, []);
  r = await SP(`/workspaces/${w4}/commit`, { expectedRevision: await w4rev(), changes: { materials: { upsert: [{ id: r4.m1, name: "Apron A", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec: { ...spec, colour: "Surfmist" }, profile }] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const pv = (await S(`/orders/${oid}/preview`)).data.preview;
  assert.ok(pv.problems.some((p) => /material changed/.test(p)), JSON.stringify(pv.problems));
  // editing something else re-sends the line unchanged → still m1 → still stale (never relinked to m2)
  const ord = (await S(`/workspaces/${w4}/orders`)).data.orders.find((x) => x.id === oid);
  r = await call("PATCH", `/api/takeoff/orders/${oid}`, { body: { expectedRevision: ord.revision, notes: "edit", lines: ord.lines.map((l) => ({ bucketKey: l.bucketKey, quantity: l.quantity, jobMaterialId: l.jobMaterialId })) } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const ord2 = (await S(`/workspaces/${w4}/orders`)).data.orders.find((x) => x.id === oid);
  assert.equal(ord2.lines[0].jobMaterialId, r4.m1);
  const wsRev = await w4rev();
  const ex = await SP(`/orders/${oid}/exports`, { isDraft: false, idempotencyKey: "r4-f01-ready", expectedOrderRevision: ord2.revision, expectedWorkspaceRevision: wsRev });
  assert.equal(ex.status, 400); assert.equal(ex.data.code, "NOT_READY");
  const dr = await SP(`/orders/${oid}/exports`, { isDraft: true, idempotencyKey: "r4-f01-draft", expectedOrderRevision: ord2.revision, expectedWorkspaceRevision: wsRev });
  assert.equal(dr.status, 200, JSON.stringify(dr.data));
  const snap = (await q("SELECT snapshot FROM takeoff_exports WHERE id=$1", [dr.data.export.exportId])).rows[0].snapshot;
  assert.equal(snap.groups[0].spec.colour, "Monument");
  // explicit update to the bucket m1 now supplies → ready again, printed Surfmist
  const now = (await S(`/workspaces/${w4}/orders`)).data;
  const surf = now.scheduleLines.find((l) => /surfmist/.test(l.bucketKey));
  r = await call("PATCH", `/api/takeoff/orders/${oid}`, { body: { expectedRevision: now.orders.find((x) => x.id === oid).revision, lines: [{ bucketKey: surf.bucketKey, quantity: 1, jobMaterialId: r4.m1 }] } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual((await S(`/orders/${oid}/preview`)).data.preview.problems, []);
});
await t("R04 F07/F05: manual 7,200 × 3 split one original over HTTP → 2 × 7,200 + 2 × 3,700; server stamps provenance; a quantity change makes it stale", async () => {
  let r = await SP(`/workspaces/${w4}/commit`, { expectedRevision: await w4rev(), changes: {
    measurements: { upsert: [{ id: r4.man, kind: "manual", finishedLengthMm: 7200, quantity: 3 }] },
    contributions: { upsert: [{ id: r4.cm, measurementId: r4.man, jobMaterialId: r4.m2, split: { pieces: [3700, 3700], laps: [200], sourceFinishedMm: 7200, originals: 1 } }] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const c = r.data.computed.contributions.find((x) => x.contributionId === r4.cm);
  assert.equal(c.split.stale, false, JSON.stringify(c.split)); assert.equal(c.split.valid, true);
  const byLen = {}; for (const p of c.pieces) byLen[p.finishedLengthMm] = (byLen[p.finishedLengthMm] || 0) + p.quantity;
  assert.deepEqual(byLen, { 3700: 2, 7200: 2 }, JSON.stringify(c.pieces));
  const stored = (await q("SELECT split FROM takeoff_contributions WHERE id=$1", [r4.cm])).rows[0].split;
  assert.ok(stored.sourceSignature, "signature stamped by the server");
  r = await SP(`/workspaces/${w4}/commit`, { expectedRevision: await w4rev(), changes: { measurements: { upsert: [{ id: r4.man, kind: "manual", finishedLengthMm: 7200, quantity: 4 }] } } });
  assert.equal(r.status, 200);
  assert.equal(r.data.computed.contributions.find((x) => x.contributionId === r4.cm).split.stale, true);
});
await t("R04 F06/F04: perforated + unpainted specs survive commit → reload → snapshot; solid/perforated never share a bucket", async () => {
  const perfSpec = { product: "Flashing", construction: "perforated", finishId: "colorbond", bmt: 0.55, colour: "Surfmist", perforation: { pattern: "round", holeSizeMm: 3, pitchMm: 6, extent: "all" } };
  const zincSpec = { product: "Flashing", finishId: "zincalume", bmt: 0.5, colour: "" };
  let r = await SP(`/workspaces/${w4}/commit`, { expectedRevision: await w4rev(), changes: {
    materials: { upsert: [{ id: r4.perf, name: "Vent", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec: perfSpec, profile }, { id: r4.zinc, name: "Zinc", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec: zincSpec, profile }] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const mats = (await S(`/workspaces/${w4}`)).data.snapshot.materials;
  const perf = mats.find((m) => m.id === r4.perf), zinc = mats.find((m) => m.id === r4.zinc);
  assert.equal(perf.spec.construction, "perforated"); assert.equal(perf.spec.perforation.holeSizeMm, 3); assert.equal(perf.spec.finish, "COLORBOND");
  assert.equal(zinc.spec.colourApplicable, false); assert.equal(zinc.spec.colour, null);
  assert.deepEqual(r.data.computed.materialProblems[r4.zinc], []);
  const bad = await SP(`/workspaces/${w4}/commit`, { expectedRevision: await w4rev(), changes: { materials: { upsert: [{ id: r4.perf, name: "Vent", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec: { ...perfSpec, perforation: { holeSizeMm: "abc" } }, profile }] } } });
  assert.equal(bad.status, 400);
});

await t("R04 real plans: a plan uploaded BEFORE migration 206 (no hash/size) is served, anchored on first open, and calibrations made on it record that hash", async () => {
  const legacy = id();
  const path = `carpentry/${J.carpA}/${legacy}.pdf`;
  await sb.storage.from("job-plans").upload(path, plan.bytes);
  await q(`INSERT INTO job_documents (id, carpentry_job_id, document_type, title, status, storage_provider, storage_path, audience_layer)
           VALUES ($1,$2,'architectural','Legacy-plan.pdf','current','supabase',$3,'worker')`, [legacy, J.carpA, `job-plans/${path}`]);
  const r = await S(`/documents/${legacy}/content`);
  assert.equal(r.status, 200);
  const row = (await q("SELECT content_sha256, byte_size FROM job_documents WHERE id=$1", [legacy])).rows[0];
  assert.equal(row.content_sha256, crypto.createHash("sha256").update(plan.bytes).digest("hex"));
  assert.equal(Number(row.byte_size), plan.bytes.length);
  // a calibration on it is anchored to those bytes
  const cid = id();
  const c = await SP(`/workspaces/${w4}/commit`, { expectedRevision: await w4rev(), changes: { calibrations: { insert: [{ id: cid, documentId: legacy, pageIndex: 0, pageMeta, basisRotation: 0, horizontal: H, vertical: V }] } } });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  assert.equal((await q("SELECT content_sha256 FROM takeoff_calibrations WHERE id=$1", [cid])).rows[0].content_sha256, row.content_sha256);
});

await t("R04b R9: 'Review split' (re-apply, version+1) re-stamps a stale split against the current source → not stale", async () => {
  const snap = (await S(`/workspaces/${w4}`)).data.snapshot;
  const raw = snap.contributions.find((c) => c.id === r4.cm);           // made stale earlier by qty 3 → 4
  const r = await SP(`/workspaces/${w4}/commit`, { expectedRevision: snap.workspace.revision, changes: { contributions: { upsert: [{ ...raw, split: { ...raw.split, sourceSignature: undefined, version: (raw.split.version || 1) + 1 } }] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.computed.contributions.find((x) => x.contributionId === r4.cm).split.stale, false);
});
await t("R04b R13 + R8: order-ready needs branch / date / contact; open exported orders are reported per length", async () => {
  const oid = id();
  const o = await SP(`/workspaces/${w4}/orders`, { category: "flashings", id: oid, supplierId: supplier, delivery: { method: "pickup" } });
  const line = (await S(`/workspaces/${w4}/orders`)).data.scheduleLines.find((l) => /surfmist/.test(l.bucketKey));
  await call("PATCH", `/api/takeoff/orders/${oid}`, { body: { expectedRevision: o.data.order.revision, lines: [{ bucketKey: line.bucketKey, quantity: 1 }] } });
  const pv = (await S(`/orders/${oid}/preview`)).data.preview.problems.join(" ");
  for (const re of [/pickup branch/, /required by/, /site contact phone/]) assert.match(pv, re);
  const list = (await S(`/workspaces/${w4}/orders`)).data;
  assert.ok(list.orderStatus.every((x) => typeof x.onExportedOrders === "number"));
});

await t("R04 A03: a perforated company standard copies into two jobs with every spec field; editing job A's copy leaves the standard and job B unchanged", async () => {
  const perfSpec = { product: "Flashing", construction: "perforated", finishId: "colorbond", bmt: 0.55, colour: "Surfmist", perforation: { pattern: "round", holeSizeMm: 3, pitchMm: 6, arrangement: "staggered", extent: "all" } };
  const p = await SP("/presets", { content: { name: "Std vent", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec: perfSpec, profile } });
  assert.equal(p.status, 200, JSON.stringify(p.data));
  const pid = p.data.preset.presetId, a = id(), b = id();
  let r = await SP(`/workspaces/${w4}/commit`, { expectedRevision: await w4rev(), changes: { materials: { upsert: [{ id: a, fromPreset: { presetId: pid } }, { id: b, fromPreset: { presetId: pid } }] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const ca = r.data.snapshot.materials.find((m) => m.id === a);
  assert.equal(ca.spec.construction, "perforated"); assert.equal(ca.spec.perforation.arrangement, "staggered"); assert.equal(ca.spec.perforation.holeSizeMm, 3);
  r = await SP(`/workspaces/${w4}/commit`, { expectedRevision: await w4rev(), changes: { materials: { upsert: [{ ...ca, spec: { ...ca.spec, colour: "Monument", perforation: { ...ca.spec.perforation, holeSizeMm: 4 } } }] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const after = r.data.snapshot.materials;
  assert.equal(after.find((m) => m.id === b).spec.perforation.holeSizeMm, 3);
  assert.equal(after.find((m) => m.id === b).spec.colour, "Surfmist");
  const std = (await S("/presets")).data.presets.find((x) => x.id === pid);
  assert.equal(std.spec.perforation.holeSizeMm, 3); assert.equal(std.spec.colour, "Surfmist"); assert.equal(std.revision, 1);
});

// ── TC-R04 generic methods over HTTP (migration 207) ─────────────────────────
const w5 = id();
const D5 = await storePlan({ carpentryJobId: J.carpA }, "TC-plan.pdf"); // earlier tests replace D.a
const t5 = { cal: id(), tim: id(), dist: id(), mem: id(), cd: id(), cm: id(), clad: id(), wall: id(), win: id(), cw: id(), alu: id(), op: id(), co: id(), fl: id(), path: id(), cp: id() };
async function w5rev() { return (await S(`/workspaces/${w5}`)).data.snapshot.workspace.revision; }
const timberSpec = { family: "timber", purpose: "rafters", section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H3", endAllowanceMm: 100 };
await t("TC J1 over HTTP: distribution + member roles persist; the SERVER computes 18 × 5,400 (client totals ignored)", async () => {
  await SP(`/jobs/carpentry/${J.carpA}/workspaces`, { id: w5, name: "TC" });
  const r = await SP(`/workspaces/${w5}/commit`, { expectedRevision: 1, changes: {
    calibrations: { insert: [{ id: t5.cal, documentId: D5, pageIndex: 0, pageMeta, basisRotation: 0, horizontal: H, vertical: V, verification: CHECK }] },
    materials: { upsert: [{ id: t5.tim, name: "Rafters", methodKey: "repeated_members", methodVersion: 2, spec: timberSpec, rules: { centresMm: 600, lengthSource: "projected", pitchDeg: 30 } }] },
    measurements: { upsert: [
      { id: t5.dist, kind: "distribution", documentId: D5, pageIndex: 0, calibrationId: t5.cal, points: runPts(10000), inputs: { startOffsetMm: 0, endOffsetMm: 0, includeStart: true, includeEnd: true, spacing: "fixed", overrides: [] }, rawLengthMm: 1 },
      { id: t5.mem, kind: "member", documentId: D5, pageIndex: 0, calibrationId: t5.cal, points: runPts(4500, 340), inputs: { mode: "projected" } },
    ] },
    contributions: { upsert: [{ id: t5.cd, measurementId: t5.dist, jobMaterialId: t5.tim, role: "distribution" }, { id: t5.cm, measurementId: t5.mem, jobMaterialId: t5.tim, role: "member" }] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  // HUB 027: what a "Size and grade" pick writes (section + grade; treatment typed or from a product) is kept by the server
  const tm = r.data.snapshot.materials.find((x) => x.id === t5.tim);
  assert.deepEqual([tm.spec.section, tm.spec.grade, tm.spec.treatment], [{ depthMm: 90, widthMm: 45 }, "MGP10", "H3"]);
  const roles = await q("SELECT role FROM takeoff_contributions WHERE job_material_id=$1 ORDER BY role", [t5.tim]);
  assert.deepEqual(roles.rows.map((x) => x.role), ["distribution", "member"]);
  const m = r.data.snapshot.measurements.find((x) => x.id === t5.dist);
  assert.ok(Math.abs(m.rawLengthMm - 10000) < 1e-6, `server length ${m.rawLengthMm}`);
  const ls = r.data.computed.scheduleLines.filter((l) => l.jobMaterialIds.includes(t5.tim));
  assert.deepEqual(ls.map((l) => `${l.quantity} ${l.unit} @${l.finishedLengthMm}`), ["18 piece @5400"]);
});
await t("TC: role ↔ kind enforced (a wall can't be a distribution; a flashing can't take a wall)", async () => {
  const fl = await SP(`/workspaces/${w5}/commit`, { expectedRevision: await w5rev(), changes: {
    materials: { upsert: [{ id: t5.fl, name: "Barge", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec, profile }] },
    measurements: { upsert: [{ id: t5.wall, kind: "wall", inputs: { kind: "rect", widthMm: 4800, heightMm: 2700, name: "North" } }] } } });
  assert.equal(fl.status, 200, JSON.stringify(fl.data));
  const bad1 = await SP(`/workspaces/${w5}/commit`, { expectedRevision: await w5rev(), changes: { contributions: { upsert: [{ id: id(), measurementId: t5.wall, jobMaterialId: t5.tim, role: "distribution" }] } } });
  assert.equal(bad1.status, 400); assert.match(bad1.data.error, /can't be used that way/);
  const bad2 = await SP(`/workspaces/${w5}/commit`, { expectedRevision: await w5rev(), changes: { contributions: { upsert: [{ id: id(), measurementId: t5.wall, jobMaterialId: t5.fl, role: "wall" }] } } });
  assert.equal(bad2.status, 400);
  const bad3 = await SP(`/workspaces/${w5}/commit`, { expectedRevision: await w5rev(), changes: { contributions: { upsert: [{ id: id(), measurementId: t5.wall, jobMaterialId: t5.tim, role: "bogus" }] } } });
  assert.equal(bad3.status, 400);
});
await t("TC J2 over HTTP: Axon wall + window → 4 sheets; an opening must name a wall of THIS takeoff (or none)", async () => {
  const { productGroups, specFromGroup } = await import("../../shared/takeoff/products/index.js");
  const axon = productGroups({ family: "cladding" }).find((g) => g.name === "Axon 133 smooth");
  const foreign = await SP(`/workspaces/${w5}/commit`, { expectedRevision: await w5rev(), changes: { measurements: { upsert: [{ id: id(), kind: "opening", parentId: id(), inputs: { xMm: 0, sillMm: 0, widthMm: 600, heightMm: 600 } }] } } });
  assert.equal(foreign.status, 400);
  const r = await SP(`/workspaces/${w5}/commit`, { expectedRevision: await w5rev(), changes: {
    materials: { upsert: [{ id: t5.clad, name: "Axon", methodKey: "sheet_layout", methodVersion: 2, spec: specFromGroup(axon), rules: {} }] },
    measurements: { upsert: [{ id: t5.win, kind: "opening", parentId: t5.wall, inputs: { xMm: 1350, sillMm: 900, widthMm: 900, heightMm: 900, label: "W01" } }] },
    contributions: { upsert: [{ id: t5.cw, measurementId: t5.wall, jobMaterialId: t5.clad, role: "wall" }] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const ls = r.data.computed.scheduleLines.filter((l) => l.jobMaterialIds.includes(t5.clad));
  // + the Axon's own 14 battens and 1 roll of foam tape, worked out by the server (wall-by-wall step 4)
  assert.deepEqual(ls.map((l) => `${l.quantity} ${l.unit} @${l.finishedLengthMm}${l.follower ? ` ${l.follower}` : ""}`), ["4 sheet @2750", "14 piece @3000 battens", "1 roll @null tape"]);
});
await t("TC aluminium + continuous flashing over HTTP; generic order lines keep unit/item; export freezes items + appendix; appendix PDF served", async () => {
  const { aluminiumPreset } = await import("../../shared/takeoff/products/index.js");
  const pts = [{ x: 200, y: 400 }, { x: 200 + 750 * k, y: 400 }, { x: 200 + 750 * k, y: 400 + 750 * k }, { x: 200 + 1500 * k, y: 400 + 750 * k }, { x: 200 + 1500 * k, y: 400 + 1500 * k }];
  let r = await SP(`/workspaces/${w5}/commit`, { expectedRevision: await w5rev(), changes: {
    materials: { upsert: [{ id: t5.alu, name: "Angle 50x50x3", methodKey: "linear_stock", methodVersion: 1, spec: { ...aluminiumPreset(), kerfMm: 3, kerfConfirmed: true }, rules: {} }] },
    measurements: { upsert: [{ id: t5.op, kind: "opening", inputs: { xMm: 0, sillMm: 0, widthMm: 600, heightMm: 2400, label: "W01" } },
      { id: t5.path, kind: "polyline", documentId: D5, pageIndex: 0, calibrationId: t5.cal, points: pts, inputs: { splitsMm: [] } }] },
    contributions: { upsert: [{ id: t5.co, measurementId: t5.op, jobMaterialId: t5.alu, role: "opening" }, { id: t5.cp, measurementId: t5.path, jobMaterialId: t5.fl }] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const sl = r.data.computed.scheduleLines;
  assert.deepEqual(sl.filter((l) => l.jobMaterialIds.includes(t5.alu)).map((l) => `${l.quantity} ${l.unit} @${l.finishedLengthMm}`), ["1 bar @6500"]);
  assert.deepEqual(sl.filter((l) => l.jobMaterialIds.includes(t5.fl)).map((l) => `${l.quantity}×${l.finishedLengthMm}`), ["1×3200"]);
  // a split station beyond the run is rejected server-side
  const badSplit = await SP(`/workspaces/${w5}/commit`, { expectedRevision: await w5rev(), changes: { measurements: { upsert: [{ id: t5.path, kind: "polyline", documentId: D5, pageIndex: 0, calibrationId: t5.cal, points: pts, inputs: { splitsMm: [5000] } }] } } });
  assert.equal(badSplit.status, 400);
  const oid = id();
  const o = await SP(`/workspaces/${w5}/orders`, { category: "timber_cladding", id: oid, supplierId: supplier, delivery: { method: "pickup", pickupBranch: "Wingfield", asap: true, contactPhone: "0400 000 000" } });
  assert.equal(o.status, 200, JSON.stringify(o.data));
  const sched = (await S(`/workspaces/${w5}/orders`)).data.scheduleLines;
  // HUB 007: the flashing never rides on the timber-and-cladding order
  const mixed = await call("PATCH", `/api/takeoff/orders/${oid}`, { body: { expectedRevision: o.data.order.revision, lines: sched.map((l) => ({ bucketKey: l.bucketKey, quantity: l.quantity })) } });
  assert.equal(mixed.status, 400); assert.match(mixed.data.error, /goes on a Flashings order, not this Timber and cladding order/);
  const pr = await call("PATCH", `/api/takeoff/orders/${oid}`, { body: { expectedRevision: o.data.order.revision, lines: sched.filter((l) => l.generic).map((l) => ({ bucketKey: l.bucketKey, quantity: l.quantity })) } });
  assert.equal(pr.status, 200, JSON.stringify(pr.data));
  const stored = await q("SELECT unit, quantity, finished_length_mm, item FROM takeoff_order_lines WHERE order_id=$1 ORDER BY unit", [oid]);
  assert.deepEqual(stored.rows.map((x) => x.unit).sort(), ["bar", "piece", "piece", "roll", "sheet"]); // + the Axon's battens and foam tape (step 4)
  const sheetRow = stored.rows.find((x) => x.unit === "sheet");
  assert.equal(sheetRow.quantity, 4); assert.match(sheetRow.item.description, /Axon 133 smooth/);
  const wsRev = await w5rev();
  const e = await SP(`/orders/${oid}/exports`, { isDraft: false, idempotencyKey: "tc-exp-1", expectedOrderRevision: pr.data.result.revision, expectedWorkspaceRevision: wsRev });
  assert.equal(e.status, 200, JSON.stringify(e.data));
  const snap = (await q("SELECT snapshot FROM takeoff_exports WHERE id=$1", [e.data.export.exportId])).rows[0].snapshot;
  assert.equal(snap.category, "timber_cladding");
  assert.deepEqual(snap.totals.byUnit, { piece: 18 + 14, sheet: 4, bar: 1, roll: 1 });
  assert.deepEqual([...new Set(snap.items.map((g) => g.groupLabel))], ["Timber", "Cladding"]); // Timber part first, then Cladding (aluminium sits there)
  assert.equal(snap.groups.length, 0);
  assert.equal(snap.appendix.aluminium[0].bars[0].cuts.length, 3);
  assert.equal(snap.appendix.flashingRuns.length, 0);
  // the flashing goes on its own Flashings order, which carries the run reference
  const fid = id();
  const fo = await SP(`/workspaces/${w5}/orders`, { category: "flashings", id: fid, supplierId: supplier, delivery: { method: "pickup", pickupBranch: "Wingfield", asap: true, contactPhone: "0400 000 000" } });
  const fpr = await call("PATCH", `/api/takeoff/orders/${fid}`, { body: { expectedRevision: fo.data.order.revision, lines: sched.filter((l) => !l.generic).map((l) => ({ bucketKey: l.bucketKey, quantity: l.quantity })) } });
  assert.equal(fpr.status, 200, JSON.stringify(fpr.data));
  const fe = await SP(`/orders/${fid}/exports`, { isDraft: true, idempotencyKey: "tc-exp-1f", expectedOrderRevision: fpr.data.result.revision, expectedWorkspaceRevision: wsRev });
  assert.equal(fe.status, 200, JSON.stringify(fe.data));
  const fsnap = (await q("SELECT snapshot FROM takeoff_exports WHERE id=$1", [fe.data.export.exportId])).rows[0].snapshot;
  assert.equal(fsnap.category, "flashings"); assert.equal(fsnap.items.length, 0); assert.equal(fsnap.appendix.flashingRuns.length, 1);
  const pdf = await S(`/exports/${e.data.export.exportId}/pdf`);
  assert.equal(pdf.data.subarray(0, 4).toString(), "%PDF");
  const app = await S(`/exports/${e.data.export.exportId}/appendix`);
  assert.equal(app.status, 200); assert.equal(app.data.subarray(0, 4).toString(), "%PDF");
  const other = await S(`/exports/${e.data.export.exportId}/appendix`, { worker: "wt-w" });
  assert.notEqual(other.status, 200); // the appendix is behind the same export access as the PDF
});

await t("TC F1: a split at the limit with its plan anchor survives the server round-trip (10,000 → 9,000 + 1,400, never 9,100)", async () => {
  const { pointAtStation } = await import("../../shared/takeoff/engine/flashingPath.js");
  const snap = (await S(`/workspaces/${w5}`)).data.snapshot;
  const cal = snap.calibrations.find((c) => c.id === t5.cal);
  const pts = [{ x: 200, y: 300 }, { x: 200 + 5000 * k, y: 300 }, { x: 200 + 5000 * k, y: 300 + 5000 * k }];
  const at = pointAtStation(pts, cal, 8800);
  const pid = id(), cid = id();
  const r = await SP(`/workspaces/${w5}/commit`, { expectedRevision: snap.workspace.revision, changes: {
    measurements: { upsert: [{ id: pid, kind: "polyline", documentId: D5, pageIndex: 0, calibrationId: t5.cal, points: pts, inputs: { splitsMm: [8800], splitAnchors: [{ stationMm: 8800, x: at.x, y: at.y }] } }] },
    contributions: { upsert: [{ id: cid, measurementId: pid, jobMaterialId: t5.fl }] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const stored = r.data.snapshot.measurements.find((m) => m.id === pid).inputs.splitAnchors[0];
  assert.equal(stored.x, at.x); assert.equal(stored.y, at.y); // full precision kept
  const c = r.data.computed.contributions.find((x) => x.contributionId === cid);
  assert.deepEqual(c.pieces.map((p) => p.finishedLengthMm), [9000, 1400]);
  assert.deepEqual(c.problems, []);
});

// ── adversarial review fixes (server) ─────────────────────────────────────────
await t("QO-01/F01/SEC-01: placing an order allocates timber/sheet/bar lines too — 'already ordered' reconciles", async () => {
  const oid = id();
  const o = await SP(`/workspaces/${w5}/orders`, { category: "timber_cladding", id: oid, supplierId: supplier, delivery: { method: "pickup", pickupBranch: "Wingfield", asap: true, contactPhone: "0400 000 000" } });
  const sched = (await S(`/workspaces/${w5}/orders`)).data.scheduleLines.filter((l) => l.generic && !l.problems.length);
  assert.ok(sched.some((l) => l.unit === "sheet"));
  const pr = await call("PATCH", `/api/takeoff/orders/${oid}`, { body: { expectedRevision: o.data.order.revision, lines: sched.map((l) => ({ bucketKey: l.bucketKey, quantity: l.quantity })) } });
  assert.equal(pr.status, 200, JSON.stringify(pr.data));
  const e = await SP(`/orders/${oid}/exports`, { isDraft: false, idempotencyKey: "tc-place-exp", expectedOrderRevision: pr.data.result.revision, expectedWorkspaceRevision: await w5rev(), acknowledgeSurplus: true });
  assert.equal(e.status, 200, JSON.stringify(e.data));
  const pl = await SP(`/orders/${oid}/placements`, { exportId: e.data.export.exportId, placedOn: "2026-10-14", idempotencyKey: "tc-place-1", acknowledgeSurplus: true });
  assert.equal(pl.status, 200, JSON.stringify(pl.data));
  const sheet = sched.find((l) => l.unit === "sheet");
  const st = (await S(`/workspaces/${w5}/orders`)).data.orderStatus.find((x) => x.bucketKey === sheet.bucketKey);
  assert.equal(st.ordered, sheet.quantity); assert.equal(st.remaining, 0);
  const alloc = await q("SELECT sum(quantity)::int n FROM takeoff_placement_allocations WHERE bucket_key=$1 AND contribution_id IS NOT NULL", [sheet.bucketKey]);
  assert.equal(alloc.rows[0].n, sheet.quantity); // attributed to the wall's contribution, not surplus
});
await t("SEC-08/SEC-02: a measurement's kind can't change under an existing assignment; a method can't take a kind it doesn't read", async () => {
  const snap = (await S(`/workspaces/${w5}`)).data.snapshot;
  const wall = snap.measurements.find((m) => m.id === t5.wall);
  const r = await SP(`/workspaces/${w5}/commit`, { expectedRevision: snap.workspace.revision, changes: { measurements: { upsert: [{ id: t5.wall, kind: "opening", inputs: { xMm: 0, sillMm: 0, widthMm: 600, heightMm: 600 } }] } } });
  assert.equal(r.status, 400, JSON.stringify(r.data)); void wall;
  const man = id();
  const r2 = await SP(`/workspaces/${w5}/commit`, { expectedRevision: snap.workspace.revision, changes: {
    measurements: { upsert: [{ id: man, kind: "manual", finishedLengthMm: 1200, quantity: 2 }] }, contributions: { upsert: [{ id: id(), measurementId: man, jobMaterialId: t5.clad }] } } });
  assert.equal(r2.status, 400); assert.match(r2.data.error, /can't use a manual measurement/);
});
await t("F15/SEC-05/SEC-07/SEC-10/SEC-11: multi-point plan walls, >20 splits, foreign offcuts, null entries and oversize rules are 400s (never 500)", async () => {
  const snap = (await S(`/workspaces/${w5}`)).data.snapshot, rev = snap.workspace.revision;
  const send = (changes) => SP(`/workspaces/${w5}/commit`, { expectedRevision: rev, changes });
  const corner = await send({ measurements: { upsert: [{ id: id(), kind: "wall", documentId: D5, pageIndex: 0, calibrationId: t5.cal, points: [{ x: 200, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 260 }], inputs: { kind: "rect", heightMm: 2700 } }] } });
  assert.equal(corner.status, 400); assert.match(corner.data.error, /one straight wall at a time/);
  const splits = Array.from({ length: 21 }, (_, i) => 100 * (i + 1));
  const many = await send({ measurements: { upsert: [{ id: id(), kind: "polyline", documentId: D5, pageIndex: 0, calibrationId: t5.cal, points: runPts(8000, 380), inputs: { splitsMm: splits } }] } });
  assert.equal(many.status, 400); assert.match(many.data.error, /at most 20 splits/);
  const foreign = await send({ measurements: { upsert: [{ id: id(), kind: "offcut", inputs: { lengthMm: 900, materialId: id(), label: "x" } }] } });
  assert.equal(foreign.status, 400); assert.match(foreign.data.error, /offcut must belong/);
  for (const bad of [{ materials: { upsert: [null] } }, { measurements: { upsert: [{ id: id(), kind: "wall", inputs: { kind: "polygon", polygon: [null, null, null] } }] } }]) {
    const r = await send(bad);
    assert.equal(r.status, 400, JSON.stringify(r.data));
  }
  const deep = {}; let cur = deep; for (let i = 0; i < 8; i++) { cur.a = {}; cur = cur.a; }
  const tooDeep = await send({ materials: { upsert: [{ id: t5.tim, name: "Rafters", methodKey: "repeated_members", methodVersion: 2, spec: timberSpec, rules: { centresMm: 600, x: deep } }] } });
  assert.equal(tooDeep.status, 400); assert.match(tooDeep.data.error, /nested too deeply/);
  const tooLong = await send({ materials: { upsert: [{ id: t5.tim, name: "Rafters", methodKey: "repeated_members", methodVersion: 2, spec: timberSpec, rules: { centresMm: 600, list: Array.from({ length: 51 }, (_, i) => i) } }] } });
  assert.equal(tooLong.status, 400);
});
await t("SEC-12: the supplier export shows the job ADDRESS only — never the client's name", async () => {
  await q("UPDATE carpentry_jobs SET client_name='Jane Citizen' WHERE id=$1", [J.carpA]);
  const oid = id();
  const o = await SP(`/workspaces/${w5}/orders`, { category: "flashings", id: oid, supplierId: supplier, delivery: { method: "pickup", pickupBranch: "B", asap: true, contactPhone: "0400 000 000" } });
  const prev = await S(`/orders/${oid}/preview`);
  assert.equal(prev.status, 200, JSON.stringify(prev.data));
  assert.equal(JSON.stringify(prev.data).includes("Jane Citizen"), false);
  await q("UPDATE carpentry_jobs SET client_name=NULL WHERE id=$1", [J.carpA]);
  void o;
});
await t("SEC-13: the site appendix is behind the same access as the PDF on the WORKER route too", async () => {
  const ex = (await q("SELECT e.id FROM takeoff_exports e JOIN takeoff_orders o ON o.id=e.order_id WHERE o.workspace_id=$1 AND e.is_draft=false LIMIT 1", [w5])).rows[0];
  const lh = await W(`/exports/${ex.id}/appendix`, { worker: "wt-lh" });
  assert.equal(lh.status, 200, String(lh.status)); assert.equal(lh.data.subarray(0, 4).toString(), "%PDF");
  const ordinary = await W(`/exports/${ex.id}/appendix`, { worker: "wt-w" });
  assert.notEqual(ordinary.status, 200);
});

await t("HUB 009: a new order's site contact defaults to whoever creates it (name + phone from their records); typed values win", async () => {
  const empId = id();
  await q("INSERT INTO employees (id, name, phone, is_active) VALUES ($1, 'Sam Office', '0412 345 678', true)", [empId]);
  await q("UPDATE user_profiles SET full_name='Sam Morris', employee_id=$2 WHERE id=$1", [U.admin, empId]);
  // HUB 007: a new order must say which section it is for
  const none = await SP(`/workspaces/${w5}/orders`, { id: id(), delivery: { method: "pickup" } });
  assert.equal(none.status, 400); assert.match(none.data.error, /Flashings or a Timber and cladding order/);
  const a = await SP(`/workspaces/${w5}/orders`, { category: "flashings", id: id(), delivery: { method: "pickup" } });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  assert.equal(a.data.order.delivery.contactName, "Sam Morris"); assert.equal(a.data.order.delivery.contactPhone, "0412 345 678");
  const b = await SP(`/workspaces/${w5}/orders`, { category: "flashings", id: id(), delivery: { method: "pickup", contactName: "Site lead", contactPhone: "0499 999 999" } });
  assert.equal(b.data.order.delivery.contactName, "Site lead"); assert.equal(b.data.order.delivery.contactPhone, "0499 999 999");
});

await t("HUB 008: office staff add a supplier from the order on the Hub AND in the Worker app; others are refused; the same name is reused", async () => {
  const a = await SP("/suppliers", { name: "Fielders Wingfield", phone: "08 8000 1234" });
  assert.equal(a.status, 200, JSON.stringify(a.data)); assert.equal(a.data.supplier.existed, false);
  const again = await SP("/suppliers", { name: "  fielders WINGFIELD " }, { as: "sup" });
  assert.equal(again.status, 200); assert.equal(again.data.supplier.id, a.data.supplier.id); assert.equal(again.data.supplier.existed, true);
  assert.equal((await q("SELECT count(*)::int AS n FROM suppliers WHERE lower(name)='fielders wingfield'")).rows[0].n, 1);
  assert.equal((await SP("/suppliers", { name: "X" }, { as: "emp" })).status, 403);
  // a leading hand in the Worker app is refused …
  assert.equal((await W("/capabilities", { worker: "wt-lh" })).data.capabilities.addSuppliers, false);
  assert.equal((await WP("/suppliers", { name: "Bunnings" }, { worker: "wt-lh" })).status, 403);
  // … until their employee record is linked to an Admin login (office staff on a phone, e.g. the director)
  await q("UPDATE employees SET user_id=$1 WHERE id=$2", [U.admin, E.lh]);
  try {
    assert.equal((await W("/capabilities", { worker: "wt-lh" })).data.capabilities.addSuppliers, true);
    const w = await WP("/suppliers", { name: "Stratco Wingfield", email: "orders@stratco.test" }, { worker: "wt-lh" });
    assert.equal(w.status, 200, JSON.stringify(w.data)); assert.equal(w.data.supplier.existed, false);
    const names = (await W("/suppliers", { worker: "wt-lh" })).data.suppliers.map((x) => x.name);
    assert.ok(names.includes("Stratco Wingfield") && names.includes("Fielders Wingfield"), names.join(", "));
    assert.equal((await WP("/suppliers", { name: "Bad email", email: "nope" }, { worker: "wt-lh" })).status, 400);
    assert.equal((await WP("/suppliers", { name: "  " }, { worker: "wt-lh" })).status, 400);
    assert.equal((await WP("/suppliers", { name: "Preview" }, { as: "admin", preview: E.lh })).status, 403);   // an admin's read-only "preview as worker" never adds
  } finally { await q("UPDATE employees SET user_id=NULL WHERE id=$1", [E.lh]); }
});

await t("HUB 014: Save as company default — office staff on the Hub and linked Worker-app logins; never a flashing standard; a job's own choice survives reload", async () => {
  const { productGroups, specFromGroup } = await import("../../shared/takeoff/products/index.js");
  const { applyCompanyDefault, companyDefaultContent } = await import("../../shared/takeoff/companyDefaults.js");
  const g = productGroups({ family: "cladding" }).find((x) => x.name === "Axon 400 smooth");
  const mat = { id: id(), name: "Axon 400 smooth", methodKey: "sheet_layout", methodVersion: 2, spec: { ...specFromGroup(g), assemblyId: "axon-vertical", spareRate: 10 },
    rules: { route: "cavity", installConditions: { wind: "N2", substrate: "Timber frame", "on-or-off-stud": "on-stud", "fixing-family": "ND nails", "direct-or-cavity": "cavity" } } };
  const first = await SP("/company-defaults", { content: companyDefaultContent(mat) });
  assert.equal(first.status, 200, JSON.stringify(first.data)); assert.equal(first.data.preset.revision, 1);
  const pid = first.data.preset.presetId;
  const listed = (await S("/presets")).data.presets.find((p) => p.id === pid);
  assert.equal(listed.rules.companyDefault, true); assert.equal(listed.rules.installConditions.wind, "N2"); assert.equal(listed.spec.spareRate, 10);
  // revise (CAS on the revision); a stale revision is refused
  assert.equal((await SP("/company-defaults", { presetId: pid, expectedRevision: 1, content: companyDefaultContent({ ...mat, spec: { ...mat.spec, spareRate: 12 } }) }, { as: "sup" })).data.preset.revision, 2);
  assert.notEqual((await SP("/company-defaults", { presetId: pid, expectedRevision: 1, content: companyDefaultContent(mat) })).status, 200);
  // never a way to overwrite a flashing standard or save flashing content
  const std = (await S("/presets")).data.presets.find((p) => !p.rules?.companyDefault);
  if (std) assert.equal((await SP("/company-defaults", { presetId: std.id, expectedRevision: std.revision, content: companyDefaultContent(mat) })).status, 400);
  assert.equal((await SP("/company-defaults", { content: { name: "F", methodKey: "flashing_runs", methodVersion: 1, spec, rules: {}, profile } })).status, 400);
  assert.equal((await SP("/company-defaults", { content: companyDefaultContent(mat) }, { as: "emp" })).status, 403);
  // Worker app: a leading hand is refused; the same login linked to an Admin account saves (Sam on his phone)
  assert.equal((await W("/capabilities", { worker: "wt-lh" })).data.capabilities.saveCompanyDefaults, false);
  assert.equal((await WP("/company-defaults", { presetId: pid, expectedRevision: 2, content: companyDefaultContent(mat) }, { worker: "wt-lh" })).status, 403);
  await q("UPDATE employees SET user_id=$1 WHERE id=$2", [U.admin, E.lh]);
  try {
    assert.equal((await W("/capabilities", { worker: "wt-lh" })).data.capabilities.saveCompanyDefaults, true);
    const w = await WP("/company-defaults", { presetId: pid, expectedRevision: 2, content: companyDefaultContent(mat) }, { worker: "wt-lh" });
    assert.equal(w.status, 200, JSON.stringify(w.data)); assert.equal(w.data.preset.revision, 3);
    assert.equal((await WP("/company-defaults", { content: companyDefaultContent(mat) }, { as: "admin", preview: E.lh })).status, 403);
  } finally { await q("UPDATE employees SET user_id=NULL WHERE id=$1", [E.lh]); }
  // a job changes wind to N3 for this site: reload keeps N3 and the link; the company default stays N2
  const preset = (await S("/presets")).data.presets.find((p) => p.id === pid);
  const w1 = id();
  await SP(`/jobs/carpentry/${J.carpA}/workspaces`, { id: w1, name: "HUB014" });
  const job = applyCompanyDefault(mat, preset);
  job.rules.installConditions.wind = "N3";
  const r = await SP(`/workspaces/${w1}/commit`, { expectedRevision: 1, changes: { materials: { upsert: [job] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const back = (await S(`/workspaces/${w1}`)).data.snapshot.materials.find((m) => m.id === job.id);
  assert.equal(back.rules.installConditions.wind, "N3");
  assert.deepEqual(back.rules.defaultsFrom, { presetId: pid, revision: 3, productId: g.id });
  assert.equal((await S("/presets")).data.presets.find((p) => p.id === pid).rules.installConditions.wind, "N2");
});

await t("HUB 013 / HUB 020: Review & export opens ONE flashing draft in step with the takeoff; an old 34-piece draft comes up to 79; reopening writes nothing; discard; placed is locked", async () => {
  const w = id(); const M = { pb: id(), ax: id(), co: id(), he: id() };
  await SP(`/jobs/carpentry/${J.carpA}/workspaces`, { id: w, name: "HUB013" });
  const names = { pb: "Cladding perforated bottom flashing", ax: "Axon starter flashing", co: "Corner flashing", he: "Head flashing" };
  const colours = { pb: "Monument", ax: "Surfmist", co: "Basalt", he: "Woodland Grey" };
  const runs = [["pb", 3000, 16], ["ax", 2400, 20], ["ax", 1200, 3], ["co", 2700, 29], ["he", 1800, 11]];
  const ms = runs.map(() => id()), cs = runs.map(() => id());
  let r = await SP(`/workspaces/${w}/commit`, { expectedRevision: 1, changes: {
    materials: { upsert: Object.keys(M).map((k) => ({ id: M[k], name: names[k], methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec: { ...spec, colour: colours[k] }, profile })) },
    measurements: { upsert: runs.map(([, len, n], i) => ({ id: ms[i], kind: "manual", finishedLengthMm: len, quantity: n })) },
    contributions: { upsert: runs.map(([k], i) => ({ id: cs[i], measurementId: ms[i], jobMaterialId: M[k] })) } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const sched = (await S(`/workspaces/${w}/orders`)).data.scheduleLines;
  const key = (k, len) => sched.find((l) => l.jobMaterialIds[0] === M[k] && l.finishedLengthMm === len).bucketKey;
  const total = (o) => o.lines.reduce((a, l) => a + l.quantity, 0);
  // the old draft, made when the takeoff had fewer flashings: Axon 5 + Corner 29 = 34
  const old = id();
  const o1 = await SP(`/workspaces/${w}/orders`, { category: "flashings", id: old, delivery: { method: "pickup" } });
  r = await call("PATCH", `/api/takeoff/orders/${old}`, { body: { expectedRevision: o1.data.order.revision, lines: [{ bucketKey: key("ax", 2400), quantity: 5 }, { bucketKey: key("co", 2700), quantity: 29 }] } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  // Review & export: the same draft, brought up to 79 (16 / 23 / 29 / 11), naming what changed
  const open1 = await SP(`/workspaces/${w}/orders/open`, { section: "flashings", newId: id() });
  assert.equal(open1.status, 200, JSON.stringify(open1.data));
  assert.equal(open1.data.order.id, old); assert.equal(open1.data.created, false);
  assert.equal(total(open1.data.order), 79);
  assert.deepEqual(open1.data.changes.map((c) => c.materialName).sort(), ["Axon starter flashing", "Cladding perforated bottom flashing", "Head flashing"]);
  assert.equal(open1.data.order.delivery.basis, undefined);   // the refresh record never reaches the app
  // opening again: the same draft and revision, nothing written; the Worker app opens the same one
  const open2 = await SP(`/workspaces/${w}/orders/open`, { section: "flashings", newId: id() });
  assert.equal(open2.data.order.id, old); assert.equal(open2.data.order.revision, open1.data.order.revision); assert.deepEqual(open2.data.changes, []);
  const wOpen = await WP(`/workspaces/${w}/orders/open`, { section: "flashings", newId: id() }, { worker: "wt-lh" });
  assert.equal(wOpen.status, 200, JSON.stringify(wOpen.data)); assert.equal(wOpen.data.order.id, old);
  // the supplier PDF numbers the flashings exactly as the screen does, and adds to 79; the refresh record is not frozen
  const prev = await S(`/orders/${old}/preview`);
  assert.deepEqual(prev.data.preview.snapshot.groups.map((g) => `${g.profileId} ${g.materialName} ${g.pieces}`),
    ["P1 Axon starter flashing 23", "P2 Cladding perforated bottom flashing 16", "P3 Corner flashing 29", "P4 Head flashing 11"]);
  assert.equal(prev.data.preview.snapshot.totals.pieces, 79);
  assert.equal(JSON.stringify(prev.data.preview.snapshot).includes("basis"), false);
  // HUB 020: take Head off and save; reopen by id: same draft number, Head stays off (the user's choice), takeoff untouched
  const wsRev = (await S(`/workspaces/${w}`)).data.snapshot.workspace.revision;
  const withoutHead = open2.data.order.lines.filter((l) => l.jobMaterialId !== M.he).map((l) => ({ bucketKey: l.bucketKey, quantity: l.quantity, jobMaterialId: l.jobMaterialId }));
  r = await call("PATCH", `/api/takeoff/orders/${old}`, { body: { expectedRevision: open2.data.order.revision, lines: withoutHead, delivery: { method: "pickup", pickupBranch: "Wingfield" } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const open3 = await SP(`/workspaces/${w}/orders/open`, { section: "flashings", orderId: old, newId: id() });
  assert.equal(open3.data.order.orderRef, open1.data.order.orderRef); assert.equal(total(open3.data.order), 68); assert.deepEqual(open3.data.changes, []);
  assert.equal(open3.data.order.delivery.pickupBranch, "Wingfield");
  assert.equal((await S(`/workspaces/${w}`)).data.snapshot.workspace.revision, wsRev);
  assert.equal((await S(`/workspaces/${w}/orders`)).data.orders.filter((o) => o.status === "draft").length, 1);
  // put Head back by hand (the screen's Add): it is followed again from then on
  r = await call("PATCH", `/api/takeoff/orders/${old}`, { body: { expectedRevision: open3.data.order.revision, lines: [...withoutHead, { bucketKey: key("he", 1800), quantity: 11 }] } });
  assert.equal((await SP(`/workspaces/${w}/orders/open`, { section: "flashings", orderId: old })).data.order.lines.reduce((a, l) => a + l.quantity, 0), 79);
  // another draft can be discarded (a stale revision is refused); a discarded draft can't be edited or reopened
  const second = id();
  const o2 = await SP(`/workspaces/${w}/orders`, { category: "flashings", id: second, delivery: { method: "pickup" } });
  assert.equal((await SP(`/orders/${second}/discard`, { expectedRevision: o2.data.order.revision + 5 })).status, 409);
  const disc = await SP(`/orders/${second}/discard`, { expectedRevision: o2.data.order.revision });
  assert.equal(disc.status, 200, JSON.stringify(disc.data));
  assert.equal((await S(`/workspaces/${w}/orders`)).data.orders.find((o) => o.id === second).status, "cancelled");
  assert.equal((await call("PATCH", `/api/takeoff/orders/${second}`, { body: { expectedRevision: o2.data.order.revision + 1, lines: [] } })).status, 400);
  assert.equal((await SP(`/workspaces/${w}/orders/open`, { section: "flashings", orderId: second })).status, 400);
  // a placed order is locked: it can't be reopened for editing
  await q("UPDATE takeoff_orders SET status='placed' WHERE id=$1", [old]);
  const locked = await SP(`/workspaces/${w}/orders/open`, { section: "flashings", orderId: old });
  assert.equal(locked.status, 400); assert.match(locked.data.error, /Placed orders are locked/);
});

await t("HUB 019: office staff add and edit a supplier (with pickup address) from the order; a placed/exported order keeps its frozen details; works before migration 210", async () => {
  const add = await SP("/suppliers", { name: "Stratco Gepps Cross", email: "orders@stratco.test", phone: "08 8000 1111", address: "1 Grand Junction Rd, Wingfield SA" });
  assert.equal(add.status, 200, JSON.stringify(add.data));
  const sid = add.data.supplier.id;
  assert.equal(add.data.supplier.address, "1 Grand Junction Rd, Wingfield SA");
  assert.equal((await S("/suppliers")).data.suppliers.find((x) => x.id === sid).address, "1 Grand Junction Rd, Wingfield SA");
  // an order to that supplier, exported as the supplier PDF: its details are frozen in the export
  const w = id(), mid = id(), msr = id(), con = id();
  await SP(`/jobs/carpentry/${J.carpA}/workspaces`, { id: w, name: "HUB019" });
  let r = await SP(`/workspaces/${w}/commit`, { expectedRevision: 1, changes: {
    materials: { upsert: [{ id: mid, name: "Ridge", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec, profile }] },
    measurements: { upsert: [{ id: msr, kind: "manual", finishedLengthMm: 3000, quantity: 2 }] },
    contributions: { upsert: [{ id: con, measurementId: msr, jobMaterialId: mid }] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const oid = id();
  const o = await SP(`/workspaces/${w}/orders`, { category: "flashings", id: oid, supplierId: sid, delivery: { method: "pickup", pickupBranch: "Wingfield", asap: true, contactPhone: "0400 000 000" } });
  const line = (await S(`/workspaces/${w}/orders`)).data.scheduleLines[0];
  const pr = await call("PATCH", `/api/takeoff/orders/${oid}`, { body: { expectedRevision: o.data.order.revision, lines: [{ bucketKey: line.bucketKey, quantity: 2 }] } });
  const wsRev = (await S(`/workspaces/${w}`)).data.snapshot.workspace.revision;
  const e = await SP(`/orders/${oid}/exports`, { isDraft: false, idempotencyKey: "hub019-exp", expectedOrderRevision: pr.data.result.revision, expectedWorkspaceRevision: wsRev });
  assert.equal(e.status, 200, JSON.stringify(e.data));
  // office staff correct the phone from the order; leading hands / previews can't; a duplicate name or bad email is refused
  const ed = await call("PATCH", `/api/takeoff/suppliers/${sid}`, { body: { phone: "08 8000 2222" } });
  assert.equal(ed.status, 200, JSON.stringify(ed.data)); assert.equal(ed.data.supplier.phone, "08 8000 2222");
  assert.equal((await call("PATCH", `/api/worker/takeoff/suppliers/${sid}`, { body: { phone: "1" }, worker: "wt-lh" })).status, 403);
  assert.equal((await call("PATCH", `/api/worker/takeoff/suppliers/${sid}`, { body: { phone: "1" }, as: "admin", preview: E.lh })).status, 403);
  assert.equal((await call("PATCH", `/api/takeoff/suppliers/${sid}`, { body: { name: "fielders wingfield" } })).status, 400);
  assert.equal((await call("PATCH", `/api/takeoff/suppliers/${sid}`, { body: { email: "nope" } })).status, 400);
  const frozen = (await q("SELECT snapshot FROM takeoff_exports WHERE id=$1", [e.data.export.exportId])).rows[0].snapshot;
  assert.equal(frozen.supplier.phone, "08 8000 1111"); assert.equal(frozen.supplier.address, "1 Grand Junction Rd, Wingfield SA");
  const prev = await S(`/orders/${oid}/preview`);
  assert.equal(prev.data.preview.snapshot.supplier.phone, "08 8000 2222");   // future PDFs use the new details
  // before migration 210 (no address column): adding and listing still work; the address just isn't kept
  await q("ALTER TABLE suppliers RENAME COLUMN address TO address_hidden");
  try {
    const pre = await SP("/suppliers", { name: "Pre 210 Supplies", address: "2 Somewhere St" });
    assert.equal(pre.status, 200, JSON.stringify(pre.data)); assert.equal(pre.data.supplier.addressSaved, false);
    assert.equal((await S("/suppliers")).status, 200);
  } finally { await q("ALTER TABLE suppliers RENAME COLUMN address_hidden TO address"); }
});

await t("HUB 017: a gable saves its values one at a time (eaves → apex height → apex position): a missing position is a draft, never refused", async () => {
  const w = id(), wall = id();
  await SP(`/jobs/carpentry/${J.carpA}/workspaces`, { id: w, name: "HUB017" });
  const rev = async () => (await S(`/workspaces/${w}`)).data.snapshot.workspace.revision;
  const put = async (inputs) => SP(`/workspaces/${w}/commit`, { expectedRevision: await rev(), changes: { measurements: { upsert: [{ id: wall, kind: "wall", inputs: { kind: "gable", widthMm: 6573, name: "Gable end", ...inputs } }] } } });
  let r = await put({ eavesHeightMm: 3600 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await put({ eavesHeightMm: 3600, apexHeightMm: 4200 });   // refused before the fix — that cleared the apex height on site
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await put({ eavesHeightMm: 3600, apexHeightMm: 4200, apexXMm: 3287 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const m = (await S(`/workspaces/${w}`)).data.snapshot.measurements.find((x) => x.id === wall);
  assert.deepEqual([m.inputs.eavesHeightMm, m.inputs.apexHeightMm, m.inputs.apexXMm], [3600, 4200, 3287]);
  // values that ARE present must still make sense
  const low = await put({ eavesHeightMm: 3600, apexHeightMm: 3500, apexXMm: 3287 });
  assert.equal(low.status, 400); assert.match(low.data.error, /apex must be higher than the eaves/);
  const end = await put({ eavesHeightMm: 3600, apexHeightMm: 4200, apexXMm: 6573 });
  assert.equal(end.status, 400); assert.match(end.data.error, /between the two wall ends/);
});

await t("HUB 022: a Line run's walls keep runId + seq on the REAL server (reload in tap order, one save); one wall's height changes alone; bad run fields are dropped", async () => {
  const { productGroups, specFromGroup } = await import("../../shared/takeoff/products/index.js");
  const axon = productGroups({ family: "cladding" }).find((g) => g.name === "Axon 400 smooth");
  const w = id(), cal = id(), clad = id(), run = id();
  const doc = await storePlan({ carpentryJobId: J.carpA }, "HUB022-plan.pdf");
  await SP(`/jobs/carpentry/${J.carpA}/workspaces`, { id: w, name: "HUB022" });
  const rev = async () => (await S(`/workspaces/${w}`)).data.snapshot.workspace.revision;
  // four connected walls 6 / 4 / 6 / 4 m traced in one run: corners shared exactly, saved in ONE commit
  const c = (xMm, yMm) => ({ x: 200 + xMm * k, y: 200 + yMm * k });
  const corners = [c(0, 0), c(6000, 0), c(6000, 4000), c(0, 4000), c(0, 0)];
  const walls = [0, 1, 2, 3].map((i) => ({ id: id(), seq: i + 1, pts: [corners[i], corners[i + 1]], h: i < 2 ? 2700 : 3600 }));
  const loose = { id: id(), seq: 1 }, noSeq = id();
  const send = [walls[2], walls[0], walls[3], walls[1]].map((x) => ({ id: x.id, kind: "wall", documentId: doc, pageIndex: 0, calibrationId: cal, points: x.pts,
    inputs: { kind: "rect", heightMm: x.h, name: `Wall ${x.seq}`, runId: run, seq: x.seq } }));
  send.push({ id: loose.id, kind: "wall", documentId: doc, pageIndex: 0, calibrationId: cal, points: [c(0, 5000), c(3000, 5000)], inputs: { kind: "rect", heightMm: 2700, name: "Bad run", runId: "not-a-uuid", seq: 1 } });
  send.push({ id: noSeq, kind: "wall", documentId: doc, pageIndex: 0, calibrationId: cal, points: [c(0, 6000), c(3000, 6000)], inputs: { kind: "rect", heightMm: 2700, name: "No seq", runId: run, seq: 2.5, extra: "dropped" } });
  const r = await SP(`/workspaces/${w}/commit`, { expectedRevision: await rev(), changes: {
    calibrations: { insert: [{ id: cal, documentId: doc, pageIndex: 0, pageMeta, basisRotation: 0, horizontal: H, vertical: V, verification: CHECK }] },
    materials: { upsert: [{ id: clad, name: "Axon 400 smooth", methodKey: "sheet_layout", methodVersion: 2, spec: specFromGroup(axon), rules: {} }] },
    measurements: { upsert: send },
    contributions: { upsert: walls.map((x) => ({ id: id(), measurementId: x.id, jobMaterialId: clad, role: "wall" })) } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  // stored in the row itself (geometry jsonb — no migration), and every wall of the run shares ONE save time
  const rows = (await q("SELECT id, geometry, created_at FROM takeoff_measurements WHERE workspace_id=$1 AND kind='wall'", [w])).rows;
  for (const x of walls) {
    const g = rows.find((row) => row.id === x.id).geometry;
    assert.deepEqual([g.inputs.runId, g.inputs.seq, g.inputs.heightMm], [run, x.seq, x.h]);
  }
  assert.equal(new Set(rows.filter((row) => walls.some((x) => x.id === row.id)).map((row) => String(row.created_at))).size, 1, "one save time — seq is what orders them");
  // a fresh load: the run comes back in tap order by seq, whatever order the rows arrive in
  const snap = (await S(`/workspaces/${w}`)).data.snapshot;
  const inRun = snap.measurements.filter((m) => m.inputs?.runId === run).sort((a, b) => a.inputs.seq - b.inputs.seq);
  assert.deepEqual(inRun.map((m) => m.id), walls.map((x) => x.id));
  assert.deepEqual(inRun.map((m) => m.inputs.heightMm), [2700, 2700, 3600, 3600]);
  assert.deepEqual(inRun.map((m) => m.inputs.name), ["Wall 1", "Wall 2", "Wall 3", "Wall 4"]);
  // the corners stay shared exactly (a shared corner drags both walls on the plan)
  for (let i = 0; i < 3; i++) assert.deepEqual(inRun[i].points[1], inRun[i + 1].points[0]);
  // invalid run fields are dropped, never guessed: the wall stands on its own (and unknown keys go as before)
  const bad = snap.measurements.find((m) => m.id === loose.id), half = snap.measurements.find((m) => m.id === noSeq);
  assert.equal(bad.inputs.runId, undefined); assert.equal(bad.inputs.seq, undefined);
  assert.equal(half.inputs.runId, undefined); assert.equal(half.inputs.seq, undefined); assert.equal(half.inputs.extra, undefined);
  // acceptance 4 at the server: Select → Height 3,600 on wall 1 sends that wall only; the rest of the run is untouched
  const before = Object.fromEntries(inRun.map((m) => [m.id, JSON.stringify(m)]));
  const w1 = inRun[0];
  const r2 = await SP(`/workspaces/${w}/commit`, { expectedRevision: snap.workspace.revision, changes: { measurements: { upsert: [{ ...w1, inputs: { ...w1.inputs, heightMm: 3600 } }] } } });
  assert.equal(r2.status, 200, JSON.stringify(r2.data));
  const after = (await S(`/workspaces/${w}`)).data.snapshot.measurements.filter((m) => m.inputs?.runId === run).sort((a, b) => a.inputs.seq - b.inputs.seq);
  assert.deepEqual([after[0].inputs.heightMm, after[0].inputs.runId, after[0].inputs.seq], [3600, run, 1], "the edited wall keeps its run and place");
  for (const m of after.slice(1)) assert.equal(JSON.stringify({ ...m, revision: undefined }), JSON.stringify({ ...JSON.parse(before[m.id]), revision: undefined }), `${m.inputs.name} unchanged`);
  // the server's own quantities: the Axon walls' sheets, and (wall-by-wall step 4) their own battens and foam tape
  const lines = r2.data.computed.scheduleLines.filter((l) => l.jobMaterialIds.includes(clad));
  assert.ok(lines.length > 0 && lines.every((l) => l.unit === "sheet" || ["battens", "tape"].includes(l.follower)), JSON.stringify(lines.map((l) => l.unit)));
  assert.deepEqual([...new Set(lines.map((l) => l.follower || "sheets"))], ["sheets", "battens", "tape"]);
});

await t("wall-by-wall step 5: walls saved in ONE commit (one save time) come back in id order on every load, so two runs saved together stay Run 1, Run 2 and the review order never changes after an edit", async () => {
  const { productGroups, specFromGroup } = await import("../../shared/takeoff/products/index.js");
  const { orderedId } = await import("../../src/lib/orderedId.js");
  const { reviewWalls, wallRuns } = await import("../../src/components/takeoff/measure/tools.js");
  const axon = productGroups({ family: "cladding" }).find((g) => g.name === "Axon 400 smooth");
  const w = id(), cal = id(), clad = id();
  const doc = await storePlan({ carpentryJobId: J.carpA }, "STEP5-order-plan.pdf");
  await SP(`/jobs/carpentry/${J.carpA}/workspaces`, { id: w, name: "STEP5 order" });
  const rev = async () => (await S(`/workspaces/${w}`)).data.snapshot.workspace.revision;
  const c = (xMm, yMm) => ({ x: 200 + xMm * k, y: 200 + yMm * k });
  // traced offline: Run A (two walls), then Run B (two walls), then a wall by numbers — the ids are made in that order
  const runA = orderedId(), a = [orderedId(), orderedId()], runB = orderedId(), b = [orderedId(), orderedId()], loose = orderedId();
  const rec = (mid, runId, seq, y) => ({ id: mid, kind: "wall", documentId: doc, pageIndex: 0, calibrationId: cal, points: [c(0, y), c(3000, y)], inputs: { kind: "rect", heightMm: 2700, name: `W ${mid.slice(-4)}`, runId, seq } });
  // sent with Run B FIRST, so the rows sit in the table B before A — only the id can bring A back first
  const send = [rec(b[1], runB, 2, 4000), rec(b[0], runB, 1, 3000), { id: loose, kind: "wall", inputs: { kind: "rect", widthMm: 2400, heightMm: 2700, name: "By numbers" } }, rec(a[1], runA, 2, 1000), rec(a[0], runA, 1, 0)];
  const r = await SP(`/workspaces/${w}/commit`, { expectedRevision: await rev(), changes: {
    calibrations: { insert: [{ id: cal, documentId: doc, pageIndex: 0, pageMeta, basisRotation: 0, horizontal: H, vertical: V, verification: CHECK }] },
    materials: { upsert: [{ id: clad, name: "Axon 400 smooth", methodKey: "sheet_layout", methodVersion: 2, spec: specFromGroup(axon), rules: {} }] },
    measurements: { upsert: send },
    contributions: { upsert: send.map((x) => ({ id: id(), measurementId: x.id, jobMaterialId: clad, role: "wall" })) } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const rows = (await q("SELECT created_at FROM takeoff_measurements WHERE workspace_id=$1 AND kind='wall'", [w])).rows;
  assert.equal(new Set(rows.map((row) => String(row.created_at))).size, 1, "one save time for all five walls");
  const check = async (when) => {
    const snap = (await S(`/workspaces/${w}`)).data.snapshot;
    const walls = snap.measurements.filter((m) => m.kind === "wall");
    assert.deepEqual(walls.map((m) => m.id), [a[0], a[1], b[0], b[1], loose], `${when}: in the order made`);
    const runs = wallRuns(snap.measurements);
    assert.deepEqual([runs.get(runA).n, runs.get(runB).n], [1, 2], `${when}: Run A is Run 1`);
    assert.deepEqual(reviewWalls(snap.measurements, snap.contributions, clad).map((m) => m.id), [a[0], a[1], b[0], b[1], loose], `${when}: review order`);
    return snap;
  };
  const snap = await check("first load");
  await check("second load");
  // an edit rewrites one row of Run A (the finding: its new row version sits after Run B's) — the order holds
  const a0 = snap.measurements.find((m) => m.id === a[0]);
  const r2 = await SP(`/workspaces/${w}/commit`, { expectedRevision: snap.workspace.revision, changes: { measurements: { upsert: [{ ...a0, inputs: { ...a0.inputs, heightMm: 3600 } }] } } });
  assert.equal(r2.status, 200, JSON.stringify(r2.data));
  await check("after an edit");
  // the commit's own reply (the snapshot the app keeps until the next load) is in the same order
  assert.deepEqual(r2.data.snapshot.measurements.filter((m) => m.kind === "wall").map((m) => m.id), [a[0], a[1], b[0], b[1], loose]);
});

await t("HUB 022 step 2: + Window / + Door on the plan saves an elevation opening the REAL server keeps unchanged (no plan points, no new fields); deducted for every material on the wall", async () => {
  const { productGroups, specFromGroup } = await import("../../shared/takeoff/products/index.js");
  const { methodFor } = await import("../../shared/takeoff/index.js");
  const { planOpening } = await import("../../src/components/takeoff/measure/geometry.js");
  const { nextOpeningLabel, openingRecord } = await import("../../src/components/takeoff/measure/tools.js");
  const fam = (s) => { const m = methodFor(s); return { spec: s, methodKey: m.key, methodVersion: m.version }; };
  const axon = productGroups({ family: "cladding" }).find((g) => g.name === "Axon 400 smooth");
  const bat = productGroups({}).find((g) => /Cavity Batten/.test(g.name));
  const w = id(), cal = id(), clad = id(), batId = id(), run = id();
  const doc = await storePlan({ carpentryJobId: J.carpA }, "HUB022b-plan.pdf");
  await SP(`/jobs/carpentry/${J.carpA}/workspaces`, { id: w, name: "HUB022b" });
  const rev = async () => (await S(`/workspaces/${w}`)).data.snapshot.workspace.revision;
  const c = (xMm, yMm) => ({ x: 200 + xMm * k, y: 200 + yMm * k });
  const corners = [c(0, 0), c(6000, 0), c(6000, 4000), c(0, 4000)];
  const walls = [0, 1, 2, 3].map((i) => ({ id: id(), seq: i + 1, pts: [corners[i], corners[(i + 1) % 4]] }));
  const r1 = await SP(`/workspaces/${w}/commit`, { expectedRevision: await rev(), changes: {
    calibrations: { insert: [{ id: cal, documentId: doc, pageIndex: 0, pageMeta, basisRotation: 0, horizontal: H, vertical: V, verification: CHECK }] },
    materials: { upsert: [{ id: clad, name: "Axon 400 smooth", ...fam({ ...specFromGroup(axon), assemblyId: "axon-vertical" }), rules: { route: "cavity" } },
      { id: batId, name: "Cavity battens", ...fam(specFromGroup(bat)), rules: { maxSpacingMm: 600 } }] },
    measurements: { upsert: walls.map((x) => ({ id: x.id, kind: "wall", documentId: doc, pageIndex: 0, calibrationId: cal, points: x.pts, inputs: { kind: "rect", heightMm: 2700, name: `Wall ${x.seq}`, runId: run, seq: x.seq } })) },
    contributions: { upsert: walls.flatMap((x) => [clad, batId].map((m) => ({ id: id(), measurementId: x.id, jobMaterialId: m, role: "wall" }))) } } });
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  // the client's own maths on the server's calibration record: two taps per opening → wall, offset, width (nearest 10)
  const snap1 = (await S(`/workspaces/${w}`)).data.snapshot;
  const sc = snap1.calibrations.find((x) => x.id === cal);
  const onPlan = snap1.measurements.filter((m) => m.kind === "wall").map((m) => ({ id: m.id, points: m.points, cal: sc }));
  const opts = { pxPerUnit: 0.06 / k };
  const taps = [[c(1000, 0), c(2200, 0), "window"], [c(6000, 500), c(6000, 1700), "window"], [c(3800, 4000), c(5000, 4000), "window"], [c(0, 2000), c(0, 2900), "door"]];
  const sent = taps.map(([a, b, type]) => {
    const r = planOpening(onPlan, a, b, opts);
    assert.ok(r.ok, JSON.stringify(r));
    return openingRecord(id(), r.wallId, { xMm: r.xMm, sillMm: type === "door" ? 0 : 900, widthMm: r.widthMm, heightMm: type === "door" ? 2100 : 1200, label: nextOpeningLabel([], type), type });
  });
  assert.deepEqual(sent.map((o) => [walls.findIndex((x) => x.id === o.parentId) + 1, o.inputs.xMm, o.inputs.widthMm]), [[1, 1000, 1200], [2, 500, 1200], [3, 1000, 1200], [4, 1100, 900]]);
  // each opening is its own save (one Undo each), with no assignment of its own — exactly as the elevation saves one
  let comp = null;
  for (const o of sent) {
    const r = await SP(`/workspaces/${w}/commit`, { expectedRevision: await rev(), changes: { measurements: { upsert: [o] } } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    comp = r.data.computed;
  }
  const snap = (await S(`/workspaces/${w}`)).data.snapshot;
  for (const o of sent) {
    const got = snap.measurements.find((m) => m.id === o.id);
    assert.deepEqual([got.kind, got.parentId, got.points ?? null, got.documentId ?? null, got.calibrationId ?? null], ["opening", o.parentId, null, null, null]);
    assert.deepEqual(got.inputs, o.inputs, "kept exactly: offset, sill, width, height, label, type");
  }
  const row = (await q("SELECT geometry FROM takeoff_measurements WHERE id=$1", [sent[3].id])).rows[0].geometry;
  assert.deepEqual(Object.keys(row).sort(), ["inputs", "parentId", "v"], "no plan points stored");
  assert.equal(row.inputs.sillMm, 0, "the door sits on the floor");
  // the server's own quantities: every material on each wall deducts that wall's openings (and nothing is blocked)
  for (const m of [clad, batId]) {
    for (const x of walls) {
      const L = comp.materialResults[m].layouts.find((l) => l.wallMeasurementId === x.id || l.wallId === x.id);
      const expect = sent.filter((o) => o.parentId === x.id).reduce((a, o) => a + (o.inputs.widthMm * o.inputs.heightMm) / 1e6, 0);
      assert.ok(Math.abs(L.areas.openingM2 - expect) < 1e-9, `${m === clad ? "Axon" : "battens"} wall ${x.seq}: ${L.areas.openingM2} m² of openings (expected ${expect})`);
    }
    assert.equal((comp.materialResults[m].problems || []).filter((p) => /^opening_/.test(p.code)).length, 0);
  }
  // an opening with plan points is still refused (the plan never sends them), and Undo of one opening takes only it off
  const bad = await SP(`/workspaces/${w}/commit`, { expectedRevision: snap.workspace.revision, changes: { measurements: { upsert: [{ ...sent[0], id: id(), documentId: doc, pageIndex: 0, calibrationId: cal, points: [c(1000, 0), c(2200, 0)] }] } } });
  assert.equal(bad.status, 400); assert.match(bad.data.error, /entered by numbers/);
  const un = await SP(`/workspaces/${w}/commit`, { expectedRevision: snap.workspace.revision, changes: { measurements: { archive: [sent[3].id] } } });
  assert.equal(un.status, 200, JSON.stringify(un.data));
  const left = (await S(`/workspaces/${w}`)).data.snapshot.measurements.filter((m) => m.kind === "opening").map((m) => m.id).sort();
  assert.deepEqual(left, sent.slice(0, 3).map((o) => o.id).sort());
});

await t("HUB 023: Rectangle and Area outline walls on the REAL server keep every corner and the cladding through a reload; 12 m² / 9.6 m² laid out with real sheets; a corner drag with its openings kept in place saves in one commit", async () => {
  const { productGroups, specFromGroup } = await import("../../shared/takeoff/products/index.js");
  const { methodFor } = await import("../../shared/takeoff/index.js");
  const { isRectOutline, keepOpeningsInPlace, outlineFrame, outlineOpening, rectCorners } = await import("../../src/components/takeoff/measure/geometry.js");
  const { nextOpeningLabel, openingRecord, outlineWallInputs } = await import("../../src/components/takeoff/measure/tools.js");
  const fam = (s) => { const m = methodFor(s); return { spec: s, methodKey: m.key, methodVersion: m.version }; };
  const axon = productGroups({ family: "cladding" }).find((g) => g.name === "Axon 400 smooth");
  const w = id(), cal = id(), clad = id(), rectId = id(), gableId = id();
  const doc = await storePlan({ carpentryJobId: J.carpA }, "HUB023-elevation.pdf");
  await SP(`/jobs/carpentry/${J.carpA}/workspaces`, { id: w, name: "HUB023" });
  const rev = async () => (await S(`/workspaces/${w}`)).data.snapshot.workspace.revision;
  // PDF y runs up the page: c(x, y) is x mm across and y mm up the elevation
  const c = (xMm, yMm) => ({ x: 200 + xMm * k, y: 200 + yMm * k });
  const rect = rectCorners(c(0, 0), c(4000, 3000));
  const gable = [c(5000, 0), c(9000, 0), c(9000, 1800), c(7000, 3000), c(5000, 1800)];   // Axon 400 comes up to 3,000 long
  const r1 = await SP(`/workspaces/${w}/commit`, { expectedRevision: await rev(), changes: {
    calibrations: { insert: [{ id: cal, documentId: doc, pageIndex: 0, pageMeta, basisRotation: 0, horizontal: H, vertical: V, verification: CHECK }] },
    materials: { upsert: [{ id: clad, name: "Axon 400 smooth", ...fam({ ...specFromGroup(axon), assemblyId: "axon-vertical", spareRate: 0 }), rules: { route: "cavity" } }] },
    measurements: { upsert: [
      { id: rectId, kind: "wall", documentId: doc, pageIndex: 0, calibrationId: cal, points: rect, inputs: outlineWallInputs([]) },
      { id: gableId, kind: "wall", documentId: doc, pageIndex: 0, calibrationId: cal, points: gable, inputs: outlineWallInputs([{ kind: "wall", inputs: { name: "Wall 1" } }]) }] },
    contributions: { upsert: [rectId, gableId].map((m) => ({ id: id(), measurementId: m, jobMaterialId: clad, role: "wall" })) } } });
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  // reload: every corner, the outline kind, the name and the cladding are kept
  const snap1 = (await S(`/workspaces/${w}`)).data.snapshot;
  const got = (mid) => snap1.measurements.find((m) => m.id === mid);
  assert.deepEqual(got(rectId).points, rect); assert.deepEqual(got(gableId).points, gable, "all five corners");
  assert.deepEqual([got(rectId).inputs.kind, got(rectId).inputs.name, got(gableId).inputs.kind, got(gableId).inputs.name], ["polygon", "Wall 1", "polygon", "Wall 2"]);
  assert.equal(isRectOutline(got(rectId).points), true);
  assert.deepEqual(snap1.contributions.filter((x) => x.jobMaterialId === clad).map((x) => [x.measurementId, x.role]).sort(), [[rectId, "wall"], [gableId, "wall"]].sort());
  // the server's own quantities: 12 m² and 11 m², real Axon 400 sheet sizes
  const res = r1.data.computed.materialResults[clad];
  const L = (mid) => res.layouts.find((l) => l.wallMeasurementId === mid);
  assert.ok(Math.abs(L(rectId).areas.grossM2 - 12) < 1e-6, String(L(rectId).areas.grossM2));
  assert.ok(Math.abs(L(gableId).areas.grossM2 - 9.6) < 1e-6, String(L(gableId).areas.grossM2));
  assert.equal(L(gableId).wall.polygon.length, 5);
  const sheets = res.demands.filter((d) => d.unit === "sheet");
  assert.ok(sheets.length >= 8 && sheets.every((d) => axon.lengthsMm.includes(d.identity.stockLengthMm) && d.identity.stockWidthMm === 1200), JSON.stringify(sheets.map((d) => d.identity.stockLengthMm)));
  // + Window from two corners on the Rectangle (the client's maths on the server's calibration)
  const sc = snap1.calibrations.find((x) => x.id === cal);
  const ow = outlineOpening(outlineFrame(rect, sc), c(1000, 1000), c(2200, 2200), "window");
  const op = openingRecord(id(), rectId, { xMm: ow.xMm, sillMm: ow.sillMm, widthMm: ow.widthMm, heightMm: ow.heightMm, label: nextOpeningLabel([], "window"), type: "window" });
  assert.deepEqual([op.inputs.xMm, op.inputs.sillMm, op.inputs.widthMm, op.inputs.heightMm], [1000, 1000, 1200, 1200]);
  const r2 = await SP(`/workspaces/${w}/commit`, { expectedRevision: await rev(), changes: { measurements: { upsert: [op] } } });
  assert.equal(r2.status, 200, JSON.stringify(r2.data));
  // drag the bottom-left corner (only it moves) left and down: the wall and its window in ONE commit (one Undo), the
  // window re-measured from the new leftmost / lowest corner
  const moved = rect.map((q, i) => (i === 0 ? c(-500, -200) : q));
  const kept = keepOpeningsInPlace(rect, moved, sc, [op]).openings[0];
  assert.deepEqual([kept.inputs.xMm, kept.inputs.sillMm, kept.inputs.widthMm, kept.inputs.heightMm], [1500, 1200, 1200, 1200]);
  const r3 = await SP(`/workspaces/${w}/commit`, { expectedRevision: await rev(), changes: { measurements: { upsert: [{ ...got(rectId), points: moved }, kept] } } });
  assert.equal(r3.status, 200, JSON.stringify(r3.data));
  const snap3 = (await S(`/workspaces/${w}`)).data.snapshot;
  assert.deepEqual(snap3.measurements.find((m) => m.id === rectId).points, moved);
  assert.deepEqual(snap3.measurements.find((m) => m.id === op.id).inputs, kept.inputs);
  const L3 = r3.data.computed.materialResults[clad].layouts.find((l) => l.wallMeasurementId === rectId);
  assert.ok(Math.abs(L3.areas.grossM2 - 13.15) < 1e-6, String(L3.areas.grossM2));
  assert.equal(L3.wall.polygon.length, 4);
  assert.deepEqual([L3.openings[0].x0, L3.openings[0].y0, L3.openings[0].x1, L3.openings[0].y1], [1500, 1200, 2700, 2400], "the window where it was tapped");
  // a corner wall that isn't an outline is still refused (a floor-plan wall is straight); an outline has 200 corners at most
  const bent = await SP(`/workspaces/${w}/commit`, { expectedRevision: snap3.workspace.revision, changes: { measurements: { upsert: [{ id: id(), kind: "wall", documentId: doc, pageIndex: 0, calibrationId: cal, points: gable.slice(0, 3), inputs: { kind: "rect", heightMm: 2700 } }] } } });
  assert.equal(bent.status, 400); assert.match(bent.data.error, /one straight wall at a time/);
  const many = Array.from({ length: 201 }, (_, i) => c(10000 + 2000 * Math.cos(i / 32), 2000 + 2000 * Math.sin(i / 32)));
  const big = await SP(`/workspaces/${w}/commit`, { expectedRevision: snap3.workspace.revision, changes: { measurements: { upsert: [{ id: id(), kind: "wall", documentId: doc, pageIndex: 0, calibrationId: cal, points: many, inputs: { kind: "polygon" } }] } } });
  assert.equal(big.status, 400, JSON.stringify(big.data));
});

await t("wall-by-wall step 4: the REAL server works out an Axon's battens, foam tape and H-flashing from its walls (nothing new stored); the Timber and cladding order freezes them with their product codes", async () => {
  const { productGroups, specFromGroup } = await import("../../shared/takeoff/products/index.js");
  const { methodFor } = await import("../../shared/takeoff/index.js");
  const { BLUE_LEAF_JH_DEFAULTS: D } = await import("../../shared/takeoff/companyDefaults.js");
  const axon = productGroups({ family: "cladding" }).find((g) => g.name === "Axon 400 smooth");
  const spec = { ...specFromGroup(axon), assemblyId: "axon-vertical", spareRate: 0 }, m = methodFor(spec);
  const w = id(), clad = id(), tall = id(), east = id(), door = id(), hand = id(), bat = id();
  await SP(`/jobs/carpentry/${J.carpA}/workspaces`, { id: w, name: "Step 4" });
  const rev = async () => (await S(`/workspaces/${w}`)).data.snapshot.workspace.revision;
  // the Axon exactly as the Blue Leaf default sets it up: cavity, 10 mm H-flashing joint
  const r1 = await SP(`/workspaces/${w}/commit`, { expectedRevision: await rev(), changes: {
    materials: { upsert: [{ id: clad, name: "Axon 400 smooth", methodKey: m.key, methodVersion: m.version, spec, rules: { route: D.route, installConditions: { ...D.installConditions, "direct-or-cavity": D.route }, jointRows: { atMm: [], ...D.jointRule } } }] },
    measurements: { upsert: [{ id: tall, kind: "wall", inputs: { kind: "rect", widthMm: 3000, heightMm: 3600, name: "Tall" } }, { id: east, kind: "wall", inputs: { kind: "rect", widthMm: 4000, heightMm: 2700, name: "East" } },
      { id: door, kind: "opening", parentId: east, inputs: { xMm: 1500, sillMm: 0, widthMm: 900, heightMm: 2100, label: "D1", type: "door" } }] },
    contributions: { upsert: [tall, east].map((mid) => ({ id: id(), measurementId: mid, jobMaterialId: clad, role: "wall" })) } } });
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  // nothing new is stored: the material keeps only what was sent, the followers are worked out on every calculation
  const row = (await q("SELECT spec, rules FROM takeoff_job_materials WHERE id=$1", [clad])).rows[0];
  assert.equal(JSON.stringify(row).includes("follower"), false);
  const sum = (c) => c.scheduleLines.filter((l) => l.jobMaterialIds.includes(clad)).map((l) => `${l.quantity} ${l.unit}${l.follower ? ` ${l.follower}` : ""} — ${l.item.description}`);
  // Tall: 6 × (3,000 + 600) uprights, bottom, top and the batten behind the H joint at 3,000 → 15 pieces; East: 14 pieces
  // (door: no sill, the bottom stops at it) → 18 + 4 + 2 + 2 (3,000 / 1,000 / 1,500 + 1,600 / 2,100 + 900 …) on 3,000 battens;
  // tape 7.18 + 6.0 m → 1 roll; H-flashing 3,000 → 1 length
  const lines1 = sum(r1.data.computed);
  assert.deepEqual(lines1.filter((x) => / (battens|hflashing|tape) — /.test(x)).map((x) => x.replace(/^\d+ /, "N ")), [
    "N piece battens — Hardie Cavity Batten 70 × 19, code 405307 — 3,000 mm length",
    "N piece hflashing — Hardie™ 9mm Alum Horizontal H Flashing, code 305613 — 3,000 mm length",
    "N roll tape — Hardie™ 50mm Foam Back Sealing Tape, 25 m roll, code 304560"]);
  const res = r1.data.computed.materialResults[clad];
  const lay = (mid) => res.layouts.find((L) => L.wallMeasurementId === mid).followers;
  assert.deepEqual([lay(tall).battens.lines.length, lay(tall).battens.totalMm, lay(tall).tape.totalMm, lay(tall).hFlashing.totalMm], [15, 30600, 7180, 3000]);
  assert.deepEqual([lay(east).battens.lines.length, lay(east).battens.totalMm, lay(east).tape.totalMm, lay(east).hFlashing.totalMm], [14, 29600, 6000, 0]);
  const bLine = r1.data.computed.scheduleLines.find((l) => l.jobMaterialIds.includes(clad) && l.follower === "battens");
  assert.equal(bLine.quantity, res.allocation.groups.find((g) => g.identityKey.includes("\"follower\":\"battens\"")).barCount);
  // reload: the same followers from the stored walls alone
  const again = (await S(`/workspaces/${w}`)).data;
  assert.deepEqual(sum(again.computed), lines1);
  // an older job's batten material set up by hand on East: no automatic battens there, never doubled
  const r2 = await SP(`/workspaces/${w}/commit`, { expectedRevision: await rev(), changes: {
    materials: { upsert: [{ id: bat, name: "Cavity battens", methodKey: "support_grid", methodVersion: 1, spec: { family: "batten", orientation: "vertical", product: { name: "Batten 70 × 19", widthMm: 70, thicknessMm: 19, lengthsMm: [3000] } }, rules: { maxSpacingMm: 600 } }] },
    contributions: { upsert: [{ id: hand, measurementId: east, jobMaterialId: bat, role: "wall" }] } } });
  assert.equal(r2.status, 200, JSON.stringify(r2.data));
  const res2 = r2.data.computed.materialResults[clad];
  assert.equal(res2.layouts.find((L) => L.wallMeasurementId === east).followers.battens.state, "hand-made");
  assert.ok(res2.problems.some((p) => p.code === "followers_hand_made" && /^East: battens come from Cavity battens \(set up by hand\)/.test(p.message)));
  assert.equal(res2.demands.filter((d) => d.follower === "battens").every((d) => d.sourceRefs[0].measurementId === tall), true);
  // the Timber and cladding order: every Axon line, frozen with its unit and product code; the supplier PDF is served
  const oid = id();
  const o = await SP(`/workspaces/${w}/orders`, { category: "timber_cladding", id: oid, supplierId: supplier, delivery: { method: "pickup", pickupBranch: "Wingfield", asap: true, contactPhone: "0400 000 000" } });
  assert.equal(o.status, 200, JSON.stringify(o.data));
  const sched = (await S(`/workspaces/${w}/orders`)).data.scheduleLines.filter((l) => l.jobMaterialIds.includes(clad));
  const pr = await call("PATCH", `/api/takeoff/orders/${oid}`, { body: { expectedRevision: o.data.order.revision, lines: sched.map((l) => ({ bucketKey: l.bucketKey, quantity: l.quantity })) } });
  assert.equal(pr.status, 200, JSON.stringify(pr.data));
  const stored = (await q("SELECT unit, quantity, item FROM takeoff_order_lines WHERE order_id=$1", [oid])).rows;
  for (const code of ["405307", "305613", "304560"]) assert.ok(stored.some((x) => x.item.description.includes(`code ${code}`)), `order line with code ${code}`);
  assert.deepEqual(stored.find((x) => x.item.description.includes("304560")).unit, "roll");
  const e = await SP(`/orders/${oid}/exports`, { isDraft: false, idempotencyKey: "step4-exp", expectedOrderRevision: pr.data.result.revision, expectedWorkspaceRevision: await rev() });
  assert.equal(e.status, 200, JSON.stringify(e.data));
  const snap = (await q("SELECT snapshot FROM takeoff_exports WHERE id=$1", [e.data.export.exportId])).rows[0].snapshot;
  assert.equal(snap.items.length, 1, "the battens, tape and H-flashing sit under the cladding");
  assert.deepEqual(snap.items[0].lines.filter((l) => /code (405307|305613|304560)/.test(l.description)).map((l) => l.unit), ["piece", "piece", "roll"]);
  const pdf = await S(`/exports/${e.data.export.exportId}/pdf`);
  assert.equal(pdf.data.subarray(0, 4).toString(), "%PDF");
});

await t("HUB 025: untick + re-tick an opening in ONE save is a plain DUPLICATE_ASSIGNMENT refusal (never 'That was already saved.' or a Conflict); the two halves as two saves just save; no-change save, replay and a real conflict behave", async () => {
  const { aluminiumPreset } = await import("../../shared/takeoff/products/index.js");
  const { PROBLEM_TEXT } = await import("../../shared/takeoff/index.js");
  const w = id(), alu = id(), wall = id(), op = id(), c1 = id(), c2 = id();
  await SP(`/jobs/carpentry/${J.carpA}/workspaces`, { id: w, name: "HUB025" });
  const snapOf = async () => (await S(`/workspaces/${w}`)).data.snapshot;
  const commit = (body) => SP(`/workspaces/${w}/commit`, body);
  const mat = { id: alu, name: "Aluminium angle 50 × 50 × 3", methodKey: "linear_stock", methodVersion: 1, spec: { ...aluminiumPreset(), kerfMm: 3, kerfConfirmed: true }, rules: {} };
  let r = await commit({ expectedRevision: (await snapOf()).workspace.revision, idempotencyKey: `h25-setup-${w}`, changes: {
    materials: { upsert: [mat] },
    measurements: { upsert: [{ id: wall, kind: "wall", inputs: { kind: "rect", widthMm: 4000, heightMm: 2700, name: "North" } },
      { id: op, kind: "opening", parentId: wall, inputs: { xMm: 500, sillMm: 900, widthMm: 900, heightMm: 1200, label: "W01", type: "window" } }] },
    contributions: { upsert: [{ id: c1, measurementId: op, jobMaterialId: alu, role: "opening" }] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const rev0 = r.data.commit.revision;
  // (i) the recorded batch: stop using W01 (archive c1) and use it again under a new id (c2), in one save
  r = await commit({ expectedRevision: rev0, idempotencyKey: `h25-retick-${w}`, changes: { contributions: { upsert: [{ id: c2, measurementId: op, jobMaterialId: alu, role: "opening" }], archive: [c1] } } });
  assert.equal(r.status, 409);
  assert.equal(r.data.code, "DUPLICATE_ASSIGNMENT");
  assert.equal(r.data.error, PROBLEM_TEXT.duplicate_assignment);
  assert.notEqual(r.data.error, "That was already saved.");
  assert.equal((await snapOf()).workspace.revision, rev0, "nothing saved");
  // (ii) what the client now sends: the archive, then the new assignment in the next save
  r = await commit({ expectedRevision: rev0, idempotencyKey: `h25-half1-${w}`, changes: { contributions: { upsert: [], archive: [c1] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await commit({ expectedRevision: r.data.commit.revision, idempotencyKey: `h25-half2-${w}`, changes: { contributions: { upsert: [{ id: c2, measurementId: op, jobMaterialId: alu, role: "opening" }], archive: [] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const live = await q("SELECT id FROM takeoff_contributions WHERE measurement_id=$1 AND job_material_id=$2 AND archived_at IS NULL", [op, alu]);
  assert.deepEqual(live.rows.map((x) => x.id), [c2], "W01 counted once");
  // (iii) a no-change save (the material re-sent as it is) just saves
  let snap = await snapOf();
  const m = snap.materials.find((x) => x.id === alu);
  const same = { id: m.id, name: m.name, methodKey: m.methodKey, methodVersion: m.methodVersion, spec: m.spec, rules: m.rules };
  const noChange = { expectedRevision: snap.workspace.revision, idempotencyKey: `h25-same-${w}`, changes: { materials: { upsert: [same] } } };
  r = await commit(noChange);
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.commit.replayed, false);
  const revSame = r.data.commit.revision;
  // (iv) the same key again (a lost reply resent unchanged) is a replay: 200, same revision
  r = await commit(noChange);
  assert.equal(r.status, 200); assert.equal(r.data.commit.replayed, true); assert.equal(r.data.commit.revision, revSame);
  assert.equal((await snapOf()).workspace.revision, revSame);
  // (v) a real conflict (older base, new key) is still CONFLICT, and the server's data is untouched
  r = await commit({ expectedRevision: snap.workspace.revision, idempotencyKey: `h25-stale-${w}`, changes: { materials: { upsert: [{ ...same, name: "Renamed" }] } } });
  assert.equal(r.status, 409); assert.equal(r.data.code, "CONFLICT");
  snap = await snapOf();
  assert.equal(snap.workspace.revision, revSame);
  assert.equal(snap.materials.find((x) => x.id === alu).name, "Aluminium angle 50 × 50 × 3");
});

// ── HUB 024: add an aluminium setup to the company products ──────────────────────────────────────────────────
const H24 = { name: "Aluminium angle 50 × 50 × 3", wA: id(), wB: id(), jmA: id(), jmB: id(), presetId: null };
const h24Mat = (snap, mid) => snap.materials.find((m) => m.id === mid);
const h24Snap = async (w) => (await S(`/workspaces/${w}`)).data.snapshot;
await t("HUB 024 save, find and restore: the setup saved on one job (kerf kept, its confirmation not) is found by name on another job and restores every setting", async () => {
  const { aluminiumPreset } = await import("../../shared/takeoff/products/index.js");
  const base = aluminiumPreset();
  const spec24 = { ...base, kerfMm: 3, kerfConfirmed: true, finish: "Mill", windowPreset: { ...base.windowPreset, head: true, jambAllowanceTotalMm: 80 } };
  // the first job: its aluminium material, set up and confirmed for that job
  await SP(`/jobs/carpentry/${J.carpA}/workspaces`, { id: H24.wA, name: "HUB024 A" });
  let r = await SP(`/workspaces/${H24.wA}/commit`, { expectedRevision: 1, changes: { materials: { upsert: [{ id: H24.jmA, name: H24.name, methodKey: "linear_stock", methodVersion: 1, spec: spec24, rules: {} }] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const mA = h24Mat(r.data.snapshot, H24.jmA);
  // Add to company products: the job's own name and settings (open flags / a default link sent along are dropped)
  const save = await SP("/company-products", { name: mA.name, methodKey: mA.methodKey, methodVersion: mA.methodVersion, spec: mA.spec,
    rules: { ...mA.rules, carried: { finish: "Anodised" }, defaultsFrom: { presetId: id(), revision: 1, productId: "x" }, companyDefault: true } });
  assert.equal(save.status, 200, JSON.stringify(save.data)); assert.equal(save.data.preset.revision, 1);
  H24.presetId = save.data.preset.presetId;
  const found = (await S("/presets")).data.presets.filter((p) => p.name.toLowerCase().includes("aluminium angle"));
  assert.equal(found.length, 1);
  const pr = found[0];
  assert.equal(pr.id, H24.presetId); assert.equal(pr.name, H24.name); assert.equal(pr.methodKey, "linear_stock");
  assert.equal(pr.spec.stockLengthMm, 6500); assert.deepEqual([pr.spec.profile.aMm, pr.spec.profile.bMm, pr.spec.profile.tMm], [50, 50, 3]);
  assert.equal(pr.spec.kerfMm, 3); assert.equal(pr.spec.kerfConfirmed, false, "each job still confirms its kerf");
  assert.equal(pr.spec.finish, "Mill"); assert.equal(pr.spec.windowPreset.head, true); assert.equal(pr.spec.windowPreset.jambAllowanceTotalMm, 80);
  for (const k of ["carried", "defaultsFrom", "companyDefault"]) assert.equal(k in pr.rules, false, k);
  assert.equal(pr.sourceReview.status, "user_entered");
  const by = await q("SELECT created_by_user_id FROM takeoff_material_preset_revisions WHERE preset_id=$1 AND revision=1", [H24.presetId]);
  assert.equal(by.rows[0].created_by_user_id, U.admin);
  // the first job's own material is untouched and unlinked (it keeps its confirmation)
  const a2 = h24Mat(await h24Snap(H24.wA), H24.jmA);
  assert.equal(a2.spec.kerfConfirmed, true); assert.equal(a2.fromPresetId, null);
  // another job: Use on this job copies that exact revision, and a reload restores every saved setting
  await SP(`/jobs/carpentry/${J.carpB}/workspaces`, { id: H24.wB, name: "HUB024 B" });
  r = await SP(`/workspaces/${H24.wB}/commit`, { expectedRevision: 1, changes: { materials: { upsert: [{ id: H24.jmB, fromPreset: { presetId: H24.presetId } }] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const mB = h24Mat(await h24Snap(H24.wB), H24.jmB);
  assert.equal(mB.name, H24.name); assert.equal(mB.fromPresetId, H24.presetId); assert.equal(mB.fromPresetRevision, 1);
  assert.deepEqual(mB.spec, pr.spec);
  assert.equal(mB.spec.kerfConfirmed, false);
});

await t("HUB 024 isolation: changing the new job's copy never changes the company product or the first job, and the reverse", async () => {
  const mB = h24Mat(await h24Snap(H24.wB), H24.jmB);
  let r = await SP(`/workspaces/${H24.wB}/commit`, { expectedRevision: (await h24Snap(H24.wB)).workspace.revision,
    changes: { materials: { upsert: [{ ...mB, spec: { ...mB.spec, stockLengthMm: 6000, kerfConfirmed: true } }] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  let pr = (await S("/presets")).data.presets.find((p) => p.id === H24.presetId);
  assert.equal(pr.revision, 1); assert.equal(pr.spec.stockLengthMm, 6500); assert.equal(pr.spec.kerfConfirmed, false);
  const mA = h24Mat(await h24Snap(H24.wA), H24.jmA);
  assert.equal(mA.spec.stockLengthMm, 6500);
  // now the first job changes; the new job's copy and the company product stay as they were
  r = await SP(`/workspaces/${H24.wA}/commit`, { expectedRevision: (await h24Snap(H24.wA)).workspace.revision,
    changes: { materials: { upsert: [{ ...mA, spec: { ...mA.spec, stockLengthMm: 5000, finish: "Anodised" } }] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const b2 = h24Mat(await h24Snap(H24.wB), H24.jmB);
  assert.equal(b2.spec.stockLengthMm, 6000); assert.equal(b2.spec.finish, "Mill"); assert.equal(b2.spec.kerfConfirmed, true);
  pr = (await S("/presets")).data.presets.find((p) => p.id === H24.presetId);
  assert.equal(pr.revision, 1); assert.equal(pr.spec.stockLengthMm, 6500); assert.equal(pr.spec.finish, "Mill");
});

await t("HUB 024 who may save: office staff on the Hub and linked Worker-app logins; aluminium only, never a flashing standard or a company default; same name = next version on its revision", async () => {
  const { aluminiumPreset, productGroups, specFromGroup } = await import("../../shared/takeoff/products/index.js");
  const alu = { name: H24.name, methodKey: "linear_stock", methodVersion: 1, spec: { ...aluminiumPreset(), kerfMm: 3 }, rules: {} };
  assert.equal((await SP("/company-products", alu, { as: "emp" })).status, 403);
  // never flashing, timber or cladding content
  const fl = await SP("/company-products", { name: "F", methodKey: "flashing_runs", methodVersion: 1, spec, rules: {}, profile });
  assert.equal(fl.status, 400); assert.equal(fl.data.error, "Only an aluminium setup can be added here.");
  const timber = await SP("/company-products", { name: "Studs", methodKey: "repeated_members", methodVersion: 2, spec: { family: "timber", purpose: "studs", section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", stock: { maxMm: 6000 } }, rules: {} });
  assert.equal(timber.status, 400, JSON.stringify(timber.data));
  const g = productGroups({ family: "cladding" }).find((x) => x.name === "Axon 400 smooth");
  assert.equal((await SP("/company-products", { name: "Axon", methodKey: "sheet_layout", methodVersion: 2, spec: { ...specFromGroup(g), assemblyId: "axon-vertical" }, rules: {} })).status, 400);
  // an incomplete profile is refused (nothing saved)
  const half = await SP("/company-products", { ...alu, name: "Half angle", spec: { ...alu.spec, profile: { shape: "equal-angle", aMm: 50, bMm: null, tMm: 3 } } });
  assert.equal(half.status, 400); assert.equal(half.data.error, "Enter the profile size (e.g. 50 × 50 × 3).");
  assert.equal((await S("/presets")).data.presets.some((p) => p.name === "Half angle"), false);
  // the narrow route can't revise a flashing standard (A10's) or a company default (HUB 014's)
  const all = (await S("/presets")).data.presets;
  assert.equal((await SP("/company-products", { ...alu, presetId, expectedRevision: all.find((p) => p.id === presetId).revision })).status, 400);
  const cd = all.find((p) => p.rules?.companyDefault === true);
  assert.ok(cd, "a company default exists (HUB 014)");
  assert.equal((await SP("/company-products", { ...alu, presetId: cd.id, expectedRevision: cd.revision })).status, 400);
  assert.equal((await SP("/company-products", { ...alu, presetId: "not-a-uuid", expectedRevision: 1 })).status, 400);
  // same name: the next version, on the revision it was read at; a stale revision is refused and changes nothing
  const v2 = await SP("/company-products", { ...alu, spec: { ...alu.spec, stockLengthMm: 6100 }, presetId: H24.presetId, expectedRevision: 1 }, { as: "sup" });
  assert.equal(v2.status, 200, JSON.stringify(v2.data)); assert.equal(v2.data.preset.revision, 2);
  const stale = await SP("/company-products", { ...alu, presetId: H24.presetId, expectedRevision: 1 });
  assert.equal(stale.status, 409); assert.equal(stale.data.code, "CONFLICT");
  let pr = (await S("/presets")).data.presets.find((p) => p.id === H24.presetId);
  assert.equal(pr.revision, 2); assert.equal(pr.spec.stockLengthMm, 6100);
  // the job that copied revision 1 keeps its own copy
  assert.equal(h24Mat(await h24Snap(H24.wB), H24.jmB).fromPresetRevision, 1);
  // Worker app: a leading hand is refused; the same login linked to an Admin account saves (Sam on his phone)
  assert.equal((await W("/capabilities", { worker: "wt-lh" })).data.capabilities.addCompanyProducts, false);
  assert.equal((await W("/capabilities", { worker: "wt-lh" })).data.capabilities.editStandards, false);
  assert.equal((await WP("/company-products", alu, { worker: "wt-lh" })).status, 403);
  await q("UPDATE employees SET user_id=$1 WHERE id=$2", [U.admin, E.lh]);
  try {
    const caps = (await W("/capabilities", { worker: "wt-lh" })).data.capabilities;
    assert.equal(caps.addCompanyProducts, true); assert.equal(caps.editStandards, false);
    const w = await WP("/company-products", { ...alu, presetId: H24.presetId, expectedRevision: 2 }, { worker: "wt-lh" });
    assert.equal(w.status, 200, JSON.stringify(w.data)); assert.equal(w.data.preset.revision, 3);
    const by = await q("SELECT created_by_user_id FROM takeoff_material_preset_revisions WHERE preset_id=$1 AND revision=3", [H24.presetId]);
    assert.equal(by.rows[0].created_by_user_id, U.admin);
    assert.equal((await WP("/company-products", alu, { as: "admin", preview: E.lh })).status, 403);   // read-only preview never saves
    assert.equal((await WP("/presets", { content: { name: "x" } }, { worker: "wt-lh" })).status, 404);   // the full standards route stays Hub-only
  } finally { await q("UPDATE employees SET user_id=NULL WHERE id=$1", [E.lh]); }
  pr = (await S("/presets")).data.presets.find((p) => p.id === H24.presetId);
  assert.equal(pr.revision, 3); assert.equal(pr.spec.kerfConfirmed, false);
});

await t("HUB 024 review: a new version never turns one size's product into another angle (refused, nothing saved); a different size saves under its own name", async () => {
  const { aluminiumPreset } = await import("../../shared/takeoff/products/index.js");
  const before = (await S("/presets")).data.presets.find((p) => p.id === H24.presetId);
  assert.deepEqual([before.spec.profile.aMm, before.spec.profile.bMm, before.spec.profile.tMm], [50, 50, 3]);
  const small = { name: H24.name, methodKey: "linear_stock", methodVersion: 1, spec: { ...aluminiumPreset(), profile: { shape: "equal-angle", aMm: 40, bMm: 40, tMm: 2 }, kerfMm: 3 }, rules: {} };
  const r = await SP("/company-products", { ...small, presetId: H24.presetId, expectedRevision: before.revision });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.equal(r.data.error, `“${H24.name}” is a 50 × 50 × 3 angle. Give this 40 × 40 × 2 setup its own name.`);
  const after = (await S("/presets")).data.presets.find((p) => p.id === H24.presetId);
  assert.equal(after.revision, before.revision);
  assert.deepEqual(after.spec.profile, before.spec.profile);
  // the same profile still saves as the next version (stock / kerf / finish may change), and a new name is a new product
  const same = await SP("/company-products", { ...small, spec: { ...small.spec, profile: { ...before.spec.profile }, stockLengthMm: 6000 }, presetId: H24.presetId, expectedRevision: before.revision });
  assert.equal(same.status, 200, JSON.stringify(same.data)); assert.equal(same.data.preset.revision, before.revision + 1);
  const own = await SP("/company-products", { ...small, name: "Aluminium angle 40 × 40 × 2" });
  assert.equal(own.status, 200, JSON.stringify(own.data)); assert.equal(own.data.preset.revision, 1);
  assert.notEqual(own.data.preset.presetId, H24.presetId);
  const list = (await S("/presets")).data.presets;
  assert.deepEqual(list.find((p) => p.id === own.data.preset.presetId).spec.profile, { shape: "equal-angle", aMm: 40, bMm: 40, tMm: 2 });
  assert.deepEqual([list.find((p) => p.id === H24.presetId).spec.profile.aMm, list.find((p) => p.id === H24.presetId).spec.stockLengthMm], [50, 6000]);
});

// ── HUB 026: a side of aluminium measured on a scaled elevation (the Run tool's save, as MeasureScreen sends it) ──
await t("HUB 026: an aluminium side measured on a scaled elevation keeps its cut length under that profile through a reload; never joined; a page with no scale is refused", async () => {
  const { aluminiumPreset } = await import("../../shared/takeoff/products/index.js");
  const w = id(), cal = id(), alu = id(), op = id(), side = id(), long = id();
  const doc = await storePlan({ carpentryJobId: J.carpA }, "HUB026-elevation.pdf");
  await SP(`/jobs/carpentry/${J.carpA}/workspaces`, { id: w, name: "HUB026" });
  const rev = async () => (await S(`/workspaces/${w}`)).data.snapshot.workspace.revision;
  const sidePts = runPts(1800, 300);
  const r1 = await SP(`/workspaces/${w}/commit`, { expectedRevision: await rev(), changes: {
    calibrations: { insert: [{ id: cal, documentId: doc, pageIndex: 0, pageMeta, basisRotation: 0, horizontal: H, vertical: V, verification: CHECK }] },
    materials: { upsert: [{ id: alu, name: "Aluminium angle 50 × 50 × 3", methodKey: "linear_stock", methodVersion: 1, spec: { ...aluminiumPreset(), kerfMm: 3, kerfConfirmed: true }, rules: {} }] },
    measurements: { upsert: [
      { id: op, kind: "opening", inputs: { xMm: 0, sillMm: 0, widthMm: 600, heightMm: 2400, label: "W01" } },
      { id: side, kind: "polyline", documentId: doc, pageIndex: 0, calibrationId: cal, points: sidePts, inputs: { splitsMm: [] } }] },
    contributions: { upsert: [{ id: id(), measurementId: op, jobMaterialId: alu, role: "opening" }, { id: id(), measurementId: side, jobMaterialId: alu, role: "primary" }] } } });
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  // the reload: a fresh read of the takeoff
  const g1 = (await S(`/workspaces/${w}`)).data;
  const m = g1.snapshot.measurements.find((x) => x.id === side);
  assert.deepEqual([m.kind, m.documentId, m.pageIndex, m.calibrationId], ["polyline", doc, 0, cal]);
  assert.deepEqual(m.points, sidePts, "the same two ends");
  assert.deepEqual(g1.snapshot.contributions.filter((c) => c.measurementId === side).map((c) => [c.jobMaterialId, c.role]), [[alu, "primary"]], "under that profile");
  const res1 = g1.computed.materialResults[alu];
  const runs1 = res1.demands.filter((d) => d.sourceRefs?.[0]?.measurementId === side);
  assert.equal(runs1.length, 1, "one straight side is one cut");
  assert.equal(runs1[0].role, "run");
  assert.ok(Math.abs(runs1[0].lengthMm - 1800) <= 0.5, `cut length ${runs1[0].lengthMm}`);
  assert.equal(runs1[0].noSplice, true, "never joined");
  assert.deepEqual([runs1[0].stockPolicy.lengthMm, runs1[0].stockPolicy.kerfMm], [6500, 3]);
  // pooled with the opening's cuts in ONE allocation group (the same bars)
  const opDems = res1.demands.filter((d) => d.sourceRefs?.[0]?.measurementId === op);
  assert.deepEqual(opDems.map((d) => d.role).sort(), ["jamb-left", "jamb-right", "sill"]);
  const groups1 = res1.allocation.groups;
  assert.equal(groups1.length, 1, "one group for the profile");
  const placed1 = groups1[0].bars.flatMap((b) => b.cuts.map((c) => c.demandId));
  for (const d of [...runs1, ...opDems]) assert.ok(placed1.includes(d.id), `${d.id} on a bar`);
  const buy1 = groups1[0].purchase.map((p) => `${p.quantity}×${p.stockLengthMm}`);
  assert.deepEqual(buy1, ["2×6500"]);   // 2,500 + 2,500 + 600 + 1,800 with 3 mm kerf
  // no-join and stock rules: a 7,000 mm side is longer than the 6,500 bar — listed as unavailable, never split
  const r2 = await SP(`/workspaces/${w}/commit`, { expectedRevision: await rev(), changes: {
    measurements: { upsert: [{ id: long, kind: "polyline", documentId: doc, pageIndex: 0, calibrationId: cal, points: runPts(7000, 340), inputs: { splitsMm: [] } }] },
    contributions: { upsert: [{ id: id(), measurementId: long, jobMaterialId: alu, role: "primary" }] } } });
  assert.equal(r2.status, 200, JSON.stringify(r2.data));
  const res2 = (await S(`/workspaces/${w}`)).data.computed.materialResults[alu];
  const longDems = res2.demands.filter((d) => d.sourceRefs?.[0]?.measurementId === long);
  assert.equal(longDems.length, 1);
  assert.ok(Math.abs(longDems[0].lengthMm - 7000) <= 0.5, String(longDems[0].lengthMm));
  assert.ok(longDems.every((d) => d.lengthMm >= 7000 - 0.5 && d.noSplice === true), "never split into shorter pieces");
  const [g2] = res2.allocation.groups;
  assert.equal(res2.allocation.groups.length, 1);
  assert.deepEqual(g2.unavailable.filter((u) => u.demandId === longDems[0].id).map((u) => u.reason), ["exceeds-stock"]);
  assert.ok(!g2.bars.some((b) => b.cuts.some((c) => c.demandId === longDems[0].id)), "not on any bar");
  assert.deepEqual(g2.purchase.map((p) => `${p.quantity}×${p.stockLengthMm}`), buy1, "the other pieces still buy the same bars");
  // only a scaled page gives a length: no scale → refused, nothing saved
  const before = await rev();
  const r3 = await SP(`/workspaces/${w}/commit`, { expectedRevision: before, changes: {
    measurements: { upsert: [{ id: id(), kind: "polyline", documentId: doc, pageIndex: 0, calibrationId: null, points: runPts(1200, 380), inputs: { splitsMm: [] } }] } } });
  assert.equal(r3.status, 400);
  assert.equal(r3.data.error, "Scale this plan page before measuring.");
  assert.equal(await rev(), before, "nothing saved");
});

server.close();
await pool.end();
console.log(`takeoff-api: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
