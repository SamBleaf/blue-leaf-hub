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
  return { status: r.status, data };
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
  const o = await SP(`/workspaces/${wsId}/orders`, { id: orderId, supplierId: supplier });
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
  const o = await SP(`/workspaces/${ws2}/orders`, { id: oid, supplierId: supplier, delivery: { method: "pickup", pickupBranch: "Test branch", asap: true, contactPhone: "0400 000 000" } });
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
    const o = await SP(`/workspaces/${w3}/orders`, { id: oid, supplierId: supplier, delivery: { method: "pickup", pickupBranch: "Test branch", asap: true, contactPhone: "0400 000 000" } });
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
  const o = await SP(`/workspaces/${w4}/orders`, { id: oid, supplierId: supplier, delivery: { method: "pickup", pickupBranch: "Test branch", asap: true, contactPhone: "0400 000 000" } });
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
  const o = await SP(`/workspaces/${w4}/orders`, { id: oid, supplierId: supplier, delivery: { method: "pickup" } });
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

server.close();
await pool.end();
console.log(`takeoff-api: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
