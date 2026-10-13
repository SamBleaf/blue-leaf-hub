// =============================================================================
// Seed EXAMPLE takeoffs into a running local sandbox through its real HTTP API, then save the
// server-generated supplier PDFs + JSON snapshots. Synthetic plan only — no customer data.
//
//   npm run takeoff:sandbox -- --reset src/ui-review/fixtures/takeoff/synthetic-plan-set.pdf   (terminal 1)
//   node scripts/takeoff/seed-example.mjs [outDir]                                           (terminal 2)
//
// Exercises: two-axis calibration with an independent check (page 1) and on a /Rotate 90 page with
// an offset crop box (page 2); drawn flashing profiles (hem, open return, mirrored part);
// a company standard copied into the job; measured runs incl. connected corners, a long piece
// (handling flag) and over-ceiling runs resolved by explicit splits; counted lengths; manual
// finished pieces; orders → draft + order-ready exports → externally placed → one cancellation.
// =============================================================================
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const API = process.env.TAKEOFF_SANDBOX_API || "http://127.0.0.1:8788";
const OUT = resolve(process.argv[2] || join(homedir(), "Takeoff-Review", "seeded-example"));
const JOB = "5a4db0c5-0000-4000-8000-00000000a001";
const meta = JSON.parse(readFileSync(new URL("../../src/ui-review/fixtures/takeoff/synthetic-plan-set.json", import.meta.url), "utf8"));
mkdirSync(OUT, { recursive: true });

const STAFF = { Authorization: "Bearer sandbox-admin" };
const WORKER = { "x-worker-token": "sandbox-leading-hand" };
async function call(method, path, body, headers = STAFF) {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get("content-type") || "";
  const data = ct.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer());
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(data)}`);
  return data;
}
const log = (m) => console.log(`  ${m}`);

// ── plan + geometry ──────────────────────────────────────────────────────────
const job = await call("GET", `/api/takeoff/jobs/carpentry/${JOB}`);
const plan = job.plans.find((p) => /synthetic/i.test(p.title));
if (!plan) throw new Error("Load src/ui-review/fixtures/takeoff/synthetic-plan-set.pdf into the sandbox first (see header).");
const P1 = meta.pages[0], P2 = meta.pages[1];
const k1 = P1.pdfUnitsPerMm, k2 = P2.pdfUnitsPerMm;
const at1 = (xmm, ymm) => ({ x: 120 + xmm * k1, y: 150 + ymm * k1 });            // page 1 building origin
const o2 = { x: P2.viewBox[0], y: P2.viewBox[1] };
const at2 = (xmm, ymm) => ({ x: o2.x + 120 + xmm * k2, y: o2.y + 150 + ymm * k2 }); // page 2 (rotated 90)

// ── workspace ────────────────────────────────────────────────────────────────
const ws = (await call("POST", `/api/takeoff/jobs/carpentry/${JOB}/workspaces`, { id: randomUUID(), name: "Example — flashings (seeded)" })).workspace;
let rev = ws.revision;
async function commit(changes, headers = STAFF) {
  const r = await call("POST", `/api/takeoff/workspaces/${ws.id}/commit`.replace("/api/takeoff", headers === WORKER ? "/api/worker/takeoff" : "/api/takeoff"),
    { expectedRevision: rev, idempotencyKey: `seed-${randomUUID()}`, changes }, headers);
  rev = r.commit.revision;
  return r;
}

// calibrations: page 1 (whole page, independent 3,000 check) + page 2 (/Rotate 90 → screen-horizontal = PDF vertical)
const cal1 = randomUUID(), cal2 = randomUUID();
await commit({
  workspace: { primaryDocumentId: plan.id, primaryPageIndex: 0 },
  calibrations: { insert: [
    { id: cal1, documentId: plan.id, pageIndex: 0, pageMeta: { viewBox: P1.viewBox, rotate: 0, userUnit: 1 }, basisRotation: 0,
      horizontal: { p1: at1(0, -40 / k1), p2: at1(12000, -40 / k1), knownMm: 12000 },
      vertical: { p1: at1(-40 / k1, 0), p2: at1(-40 / k1, 8000), knownMm: 8000 },
      verification: { p1: at1(0, 8000 + 30 / k1), p2: at1(3000, 8000 + 30 / k1), expectedMm: 3000 } },
    { id: cal2, documentId: plan.id, pageIndex: 1, pageMeta: { viewBox: P2.viewBox, rotate: 90, userUnit: 1 }, basisRotation: 90,
      horizontal: { p1: at2(-40 / k2, 0), p2: at2(-40 / k2, 8000), knownMm: 8000 },
      vertical: { p1: at2(0, -40 / k2), p2: at2(12000, -40 / k2), knownMm: 12000 },
      verification: { p1: at2(0, 8000 + 30 / k2), p2: at2(3000, 8000 + 30 / k2), expectedMm: 3000 } },
  ] },
});
log("calibrated page 1 (ready) and rotated page 2 (ready)");

// profiles
const apron = { initialDirectionDeg: 0, segments: [{ id: "a1", lengthMm: 100 }, { id: "a2", lengthMm: 150 }, { id: "a3", lengthMm: 50 }],
  bends: [{ turnDeg: 90 }, { turnDeg: -90 }], start: { type: "none" }, end: { type: "closed_hem", widthMm: 10, side: "right" }, coatedFace: "left" };
const barge = { initialDirectionDeg: 0, segments: [{ id: "b1", lengthMm: 80 }, { id: "b2", lengthMm: 160 }, { id: "b3", lengthMm: 120 }, { id: "b4", lengthMm: 25 }],
  bends: [{ turnDeg: 90 }, { turnDeg: 45 }, { turnDeg: -90 }], start: { type: "open_return", widthMm: 15, side: "left" }, end: { type: "closed_hem", widthMm: 12.5, side: "right" }, coatedFace: "right" };
const spec = (colour) => ({ product: "Flashing", finish: "COLORBOND", bmt: 0.55, colour });

// company standard → copied into the job (independent copy)
const std = (await call("POST", "/api/takeoff/presets", { content: { name: "Std valley gutter (example)", methodKey: "flashing_runs", methodVersion: 1,
  spec: spec("Basalt"), rules: {}, profile: { initialDirectionDeg: 0, segments: [{ lengthMm: 60 }, { lengthMm: 200 }, { lengthMm: 60 }], bends: [{ turnDeg: -60 }, { turnDeg: -60 }], start: { type: "none" }, end: { type: "none" }, coatedFace: "left" },
  sourceReview: { status: "user_entered" } } })).preset;
const M = { apron: randomUUID(), barge: randomUUID(), valley: randomUUID(), stop: randomUUID() };
await commit({ materials: { upsert: [
  { id: M.apron, name: "Apron flashing", methodKey: "flashing_runs", methodVersion: 1, spec: spec("Monument"), rules: {}, profile: apron },
  { id: M.barge, name: "Barge flashing", methodKey: "flashing_runs", methodVersion: 1, spec: spec("Surfmist"), rules: {}, profile: barge },
  { id: M.valley, fromPreset: { presetId: std.presetId, revision: std.revision } },
  { id: M.stop, name: "Stop end (pieces)", methodKey: "finished_piece_count", methodVersion: 1, spec: { ...spec("Monument"), productCode: "SE-EX" }, rules: {}, profile: null },
] } });
log("materials: Apron, Barge, Valley (from company standard), Stop end (pieces)");

// measurements
const run = (doc, page, cal, a, b) => ({ id: randomUUID(), kind: "run", documentId: doc, pageIndex: page, calibrationId: cal, points: [a, b] });
const runs = {
  eaves: run(plan.id, 0, cal1, at1(1000, 2000), at1(5312, 2000)),                   // 4,312 → 4,600
  cornerA: run(plan.id, 0, cal1, at1(5312, 2000), at1(5312, 5000)),                 // connected corner: 3,000 → 3,200
  long: run(plan.id, 0, cal1, at1(0, 6000), at1(7000, 6000)),                       // 7,000 → 7,200 (split 3,700 + 3,700, lap 200)
  over: run(plan.id, 0, cal1, at1(500, 7500), at1(9301, 7500)),                     // 8,801 → 9,100 over ceiling (split 4,600 + 4,600, lap 100)
  handling: run(plan.id, 0, cal1, at1(11000, 0), at1(11000, 5900)),                 // 5,900 → 6,100 handling flag
  rotated: run(plan.id, 1, cal2, at2(1000, 2000), at2(5312, 2000)),                 // rotated page: 4,312 → 4,600
  valleyRun: run(plan.id, 0, cal1, at1(2000, 3000), at1(6200, 3000)),               // 4,200 → 4,400
};
const count = { id: randomUUID(), kind: "count", documentId: plan.id, pageIndex: 0, points: [at1(9000, 1000), at1(9500, 1000), at1(10000, 1000), at1(10500, 1000)], finishedLengthMm: 2400 };
const manual = { id: randomUUID(), kind: "manual", finishedLengthMm: 300, quantity: 6 };
const c = (m, mat, split) => ({ id: randomUUID(), measurementId: m.id, jobMaterialId: mat, split: split || null });
const C = {
  eaves: c(runs.eaves, M.apron), cornerA: c(runs.cornerA, M.apron), handling: c(runs.handling, M.apron), rotated: c(runs.rotated, M.apron),
  long: c(runs.long, M.barge), over: c(runs.over, M.barge), count: c(count, M.barge), valley: c(runs.valleyRun, M.valley), stop: c(manual, M.stop),
};
// a leading hand records the runs/counts from the Worker app (actor = employee)
await commit({ measurements: { upsert: [...Object.values(runs), count, manual] }, contributions: { upsert: Object.values(C) } }, WORKER);
await commit({ contributions: { upsert: [
  { ...C.long, split: { pieces: [3700, 3700], laps: [200], sourceFinishedMm: 7200 } },
  { ...C.over, split: { pieces: [4600, 4600], laps: [100], sourceFinishedMm: 9100 } },
] } });
log("measured 7 runs (1 on the rotated page), 4 counted 2,400s, 6 manual 300 stop ends; split the 7,200 and the 9,100");

// orders
const wsNow = await call("GET", `/api/takeoff/workspaces/${ws.id}`);
const lines = wsNow.computed.scheduleLines;
const supplierId = (await call("GET", "/api/takeoff/suppliers")).defaultSupplierId;
async function makeOrder(filter, delivery, notes) {
  const id = randomUUID();
  const o = (await call("POST", `/api/takeoff/workspaces/${ws.id}/orders`, { id, supplierId, delivery })).order;
  const ordLines = lines.filter(filter).map((l) => ({ bucketKey: l.bucketKey, quantity: l.quantity }));
  const saved = await call("PATCH", `/api/takeoff/orders/${id}`, { expectedRevision: o.revision, lines: ordLines, notes });
  return { id, ref: o.orderRef, revision: saved.result.revision };
}
async function exportOrder(o, isDraft) {
  const wsRev = (await call("GET", `/api/takeoff/workspaces/${ws.id}`)).snapshot.workspace.revision;
  const e = (await call("POST", `/api/takeoff/orders/${o.id}/exports`, { isDraft, idempotencyKey: `seed-x-${randomUUID()}`, expectedOrderRevision: o.revision, expectedWorkspaceRevision: wsRev })).export;
  const pdf = await call("GET", `/api/takeoff/exports/${e.exportId}/pdf`);
  const file = join(OUT, `${o.ref}-export-${e.exportNo}${isDraft ? "-DRAFT" : ""}.pdf`);
  writeFileSync(file, pdf);
  return { ...e, file };
}
const bySpec = (name) => (l) => l.jobMaterialIds.some((id) => (wsNow.snapshot.materials.find((m) => m.id === id) || {}).name === name);
const flashings = await makeOrder((l) => !bySpec("Stop end (pieces)")(l) && l.problems.length === 0,
  { method: "delivery", address: "1 Example Street, Testville (synthetic)", addressSource: "entered", requiredDate: "2026-10-27", contactName: "Site lead", contactPhone: "0400 000 000" },
  "Example order — synthetic data");
const draft = await exportOrder(flashings, true);
const ready = await exportOrder(flashings, false);
await call("POST", `/api/takeoff/orders/${flashings.id}/placements`, { exportId: ready.exportId, placedOn: "2026-10-13", supplierReference: "SO-EXAMPLE-1", idempotencyKey: `seed-p-${randomUUID()}` });
log(`${flashings.ref}: draft export ${draft.exportNo}, order-ready export ${ready.exportNo}, recorded as placed (SO-EXAMPLE-1)`);

const stops = await makeOrder(bySpec("Stop end (pieces)"), { method: "pickup", pickupBranch: "Example branch" }, "Pickup example");
const stopsReady = await exportOrder(stops, false);
const pl = (await call("POST", `/api/takeoff/orders/${stops.id}/placements`, { exportId: stopsReady.exportId, placedOn: "2026-10-13", supplierReference: "SO-EXAMPLE-2", idempotencyKey: `seed-p-${randomUUID()}` })).placement;
await call("POST", `/api/takeoff/placements/${pl.placementId}/cancel`, { reason: "Example cancellation — supplier out of stock" });
log(`${stops.ref}: exported, placed (SO-EXAMPLE-2), then cancelled with a reason`);

// snapshots for the reviewer
const final = await call("GET", `/api/takeoff/workspaces/${ws.id}`);
const orders = await call("GET", `/api/takeoff/workspaces/${ws.id}/orders`);
writeFileSync(join(OUT, "workspace-snapshot.json"), JSON.stringify(final.snapshot, null, 2));
writeFileSync(join(OUT, "computed-schedule.json"), JSON.stringify({ totalLm: final.computed.totalLm, orderReady: final.computed.orderReady, scheduleLines: final.computed.scheduleLines, contributions: final.computed.contributions }, null, 2));
writeFileSync(join(OUT, "orders-and-status.json"), JSON.stringify({ orders: orders.orders, orderStatus: orders.orderStatus }, null, 2));
const summary = final.computed.scheduleLines.map((l) => `${String(l.quantity).padStart(3)} × ${String(l.finishedLengthMm).padStart(6)} mm  ${l.handlingFlag ? "LONG " : "     "}${l.problems.length ? `problems: ${l.problems.join(",")}` : ""}  [${l.jobMaterialIds.map((id) => final.snapshot.materials.find((m) => m.id === id)?.name).join(", ")}]`).join("\n");
const status = orders.orderStatus.map((s) => `required ${s.required} · ordered ${s.ordered} · remaining ${s.remaining}${s.surplus ? ` · surplus ${s.surplus}` : ""}  (${s.bucketKey.split("|").pop()} mm)`).join("\n");
writeFileSync(join(OUT, "SUMMARY.txt"), `Seeded example takeoff (synthetic plan)\nWorkspace ${ws.id} revision ${final.snapshot.workspace.revision}\n\nLength schedule:\n${summary}\n\nRequired / ordered / remaining:\n${status}\n\nExports: ${[draft, ready, stopsReady].map((e) => e.file.split("/").pop()).join(", ")}\n`);
console.log(`\n  Saved to ${OUT}\n`);
console.log(readFileSync(join(OUT, "SUMMARY.txt"), "utf8"));
