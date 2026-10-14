// TC-R04 05 supports + accessories (B1–B6) and acceptance BAT01 / BAT02 / BOM01 / BOM02, against the production
// engine modules. Every fixtures.json case of kind "supports" / "sealant" runs through the real functions.
//   node scripts/tests/takeoff-tc-supports.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FIXINGS_NOT_QUANTIFIED, aggregateFixings, boxesFor, fixingsAlongLine, fixingsDemand, requiredStations, supportGrid,
} from "../../shared/takeoff/engine/supports.js";
import { accessoryRoutes, aggregateConsumables, childFlashingDemands, mergeAccessoryResults, sealantVolumeMl } from "../../shared/takeoff/engine/accessories.js";
import { LENGTH_KINDS } from "../../shared/takeoff/engine/contract.js";
import { manualPieceResult, measuredRunResult } from "../../shared/takeoff/flashing.js";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

const fixtures = JSON.parse(readFileSync(new URL("../../docs/takeoff/TC-R04/fixtures.json", import.meta.url), "utf8")).cases;
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const codes = (r) => r.problems.map((p) => p.code);
const linear = (r) => r.demands.filter((d) => d.kind === "linear");
const fixDemands = (r) => r.demands.filter((d) => d.role === "fixing-support-to-frame");
const totalLen = (ds) => ds.reduce((s, d) => s + d.lengthMm * d.quantity, 0);
const noZeroQuantities = (r) => assert.ok(!r.demands.some((d) => d.quantity === 0), "an unknown quantity must never be emitted as 0");

const SCREW = { material: "steel", corrosionClass: "C4", lengthMm: 65, head: "bugle", substrate: "timber" };
const pitch = (pitchMm, extra = {}) => ({ mode: "pitch", pitchMm, edgeStartMm: 0, edgeEndMm: 0, identity: SCREW, ...extra });
const WALL = { id: "W01", widthMm: 4800, heightMm: 2700 };
const W1 = { id: "W1", x0: 1500, y0: 900, x1: 2400, y1: 2100 };
const BATTEN = { sku: "405307", name: "Hardie Cavity Batten 70×19" };
const layer = (over = {}) => ({ id: "cavity", materialId: "m-batten", orientation: "vertical", maxSpacingMm: 600, identity: BATTEN, stockPolicy: { kind: "list", lengthsMm: [3000] }, fixing: pitch(400), ...over });
const stationsOf = (r) => r.layout.stations.map((s) => s.atMm);
const recipe = (...groups) => ({ id: "axon-cavity", groups });

// ── fixtures.json (kinds owned by this module) ───────────────────────────────────────────────────────────────
for (const c of fixtures.filter((x) => x.kind === "supports")) {
  t(`fixture ${c.id}: blank ${c.input.width} × ${c.input.height} at ${c.input.centres} → ${c.expected} mm of supports`, () => {
    const r = supportGrid({ id: "F", widthMm: c.input.width, heightMm: c.input.height }, [], layer({ maxSpacingMm: c.input.centres }));
    const ds = linear(r);
    assert.equal(ds.length, Math.ceil(c.input.width / c.input.centres) + 1, "vertical count = ceil(W/spacing)+1");
    assert.ok(ds.every((d) => d.lengthMm === c.input.height && d.quantity === 1));
    assert.equal(totalLen(ds), c.expected);
    assert.equal(r.status.quantity, "calculated");
  });
}
for (const c of fixtures.filter((x) => x.kind === "sealant")) {
  t(`fixture ${c.id}: ${c.input.diameter} mm round bead × ${c.input.length} mm = ${c.expected} ml`, () => {
    near(sealantVolumeMl({ diameterMm: c.input.diameter, lengthMm: c.input.length }), c.expected);
    const r = accessoryRoutes(WALL, [], {}, { groups: [{ id: "seal", kind: "sealant", identity: { sku: "PU" }, routes: [{ id: "run", source: "manual", lengthMm: c.input.length, beadCount: 1, crossSection: { diameterMm: c.input.diameter } }] }] });
    const d = r.demands.find((x) => x.role === "sealant");
    assert.equal(d.unit, "ml"); near(d.quantity, c.expected);
    assert.ok(codes(r).includes("sealant-yield-missing"), "no cartridge conversion without an explicit yield");
  });
}
t("fixtures: this module's kinds are present (supports, sealant)", () => {
  assert.ok(fixtures.some((x) => x.kind === "supports") && fixtures.some((x) => x.kind === "sealant"));
});

// ── B1 stations ──────────────────────────────────────────────────────────────────────────────────────────────
t("B1 horizontal primitive: ceil((H−a−b)/spacing)+1 rows, each the wall width", () => {
  const r = supportGrid(WALL, [], layer({ orientation: "horizontal" }));
  assert.equal(linear(r).length, Math.ceil(2700 / 600) + 1);
  assert.ok(linear(r).every((d) => d.lengthMm === 4800));
});
t("B1 exact multiple includes the end once; offsets shift the range (6,100 − 50 − 50 at 600 → 11)", () => {
  assert.equal(supportGrid({ id: "x", widthMm: 6000, heightMm: 2400 }, [], layer()).layout.stations.length, 11);
  const r = supportGrid({ id: "x", widthMm: 6100, heightMm: 2400 }, [], layer({ startOffsetMm: 50, endOffsetMm: 50 }));
  assert.deepEqual(stationsOf(r), [50, 650, 1250, 1850, 2450, 3050, 3650, 4250, 4850, 5450, 6050]);
});
t("B1 required panel joint is never snapped away; no gap exceeds max; phase kept beyond it", () => {
  const r = requiredStations({ fromMm: 0, toMm: 4800, requiredMm: [{ atMm: 1210, ref: "J1" }], maxSpacingMm: 600 });
  const at = r.stations.map((s) => s.atMm);
  assert.ok(at.includes(1210));
  assert.deepEqual(at, [0, 600, 1200, 1210, 1800, 2400, 3000, 3600, 4200, 4800], "phase grid preserved (no minimum gap set)");
  for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] <= 600 + 1e-9);
  assert.deepEqual(r.stations.find((s) => s.atMm === 1210).refs, ["J1"]);
});
t("B1 phase conflicts with a required joint (min gap 70) → that interval equal-spaced, joint kept, conflict reported", () => {
  const r = requiredStations({ fromMm: 0, toMm: 4800, requiredMm: [1210], maxSpacingMm: 600, minGapMm: 70 });
  const at = r.stations.map((s) => s.atMm);
  assert.ok(at.includes(1210));
  near(at[1], 1210 / 3, 1e-9); near(at[2], 2420 / 3, 1e-9);
  assert.deepEqual(at.slice(4), [1800, 2400, 3000, 3600, 4200, 4800], "phase preserved where feasible");
  const p = r.problems.find((x) => x.code === "phase-not-preserved");
  assert.ok(p && p.blocking === false);
  for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 70 - 1e-9 && at[i] - at[i - 1] <= 600 + 1e-9);
});
t("B1 selected phase: grid at phase + k·spacing between the wall ends", () => {
  const r = requiredStations({ fromMm: 0, toMm: 2400, maxSpacingMm: 600, phaseMm: 300 });
  assert.deepEqual(r.stations.map((s) => s.atMm), [0, 300, 900, 1500, 2100, 2400]);
});
t("B1 incompatible constraints are reported, never resolved by moving a joint", () => {
  const out = requiredStations({ fromMm: 50, toMm: 4750, requiredMm: [20, { atMm: 2400 }, { atMm: 2420 }], maxSpacingMm: 600, minGapMm: 70 });
  assert.ok(out.problems.some((p) => p.code === "required-station-outside" && p.blocking));
  assert.ok(!out.stations.some((s) => s.atMm === 50 && s.kinds.includes("required")), "the 20 mm joint is not snapped to the range start");
  const c = out.problems.find((p) => p.code === "required-stations-conflict");
  assert.ok(c && c.blocking);
  assert.ok([2400, 2420].every((x) => out.stations.some((s) => s.atMm === x)), "both conflicting joints kept");
});
t("B1 rake: supports clipped to the wall polygon, lengths vary", () => {
  const rake = { id: "R", polygon: [{ x: 0, y: 0 }, { x: 4800, y: 0 }, { x: 4800, y: 3600 }, { x: 0, y: 2400 }] };
  const ds = linear(supportGrid(rake, [], layer({ stockPolicy: { kind: "list", lengthsMm: [3600] } })));
  assert.equal(ds.length, 9);
  ds.forEach((d, i) => near(d.lengthMm, 2400 + (i * 600) / 4, 1e-6));
});
t("B1 gable apex: horizontal rows shorten towards the apex", () => {
  const gable = { id: "G", polygon: [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 2400 }, { x: 3000, y: 4200 }, { x: 0, y: 2400 }] };
  const r = supportGrid(gable, [], layer({ orientation: "horizontal", stockPolicy: { kind: "list", lengthsMm: [6000] } }));
  const byY = Object.fromEntries(r.layout.lines.map((l) => [l.atMm, l.lengthMm]));
  near(byY[2400], 6000, 1e-6); near(byY[3000], 4000, 1e-6); near(byY[3600], 2000, 1e-6);
  assert.equal(byY[4200], undefined, "the apex point is not a support piece");
  assert.ok(r.explain.some((e) => /4,200 mm lies wholly inside openings or outside the wall/.test(e)));
});

// ── BAT01: openings, perimeter members, dedupe only within the same layer ───────────────────────────────────
t("BAT01 an opening splits a support into actual lower/upper pieces (not a naive count subtraction)", () => {
  const r = supportGrid(WALL, [W1], layer());
  const at1800 = linear(r).filter((d) => d.sourceRefs[0].station === 1800);
  assert.deepEqual(at1800.map((d) => d.lengthMm), [900, 600]);
  assert.match(at1800[0].label, /below W1/); assert.match(at1800[1].label, /above W1/);
  assert.ok(at1800.every((d) => d.sourceRefs.some((s) => s.openingId === "W1")));
  assert.equal(new Set(r.demands.map((d) => d.id)).size, r.demands.length, "stable unique ids");
  assert.equal(linear(r).filter((d) => d.sourceRefs[0].station === 2400)[0].lengthMm, 2700, "a support on the opening's edge line is not cut");
  assert.equal(totalLen(linear(r)), 24300 - 1200);
});
t("BAT01 jamb members: one coincident with a support in the same layer is deduplicated; the other is added", () => {
  const r = supportGrid(WALL, [W1], layer({ openingMembers: { edges: ["left", "right"] } }));
  const jambs = linear(r).filter((d) => d.role.startsWith("jamb"));
  assert.deepEqual(jambs.map((d) => [d.role, d.lengthMm]), [["jamb-left", 1200]]);
  assert.ok(r.explain.some((e) => /jamb-right W1 is the same physical member/.test(e)));
});
t("BAT01 identical jambs of adjoining openings count once; head/sill members clip to the wall", () => {
  const A = { id: "A", x0: 1500, y0: 900, x1: 2100, y1: 2100 }, B = { id: "B", x0: 2100, y0: 900, x1: 2700, y1: 2100 };
  const r = supportGrid(WALL, [A, B], layer({ openingMembers: { edges: ["left", "right", "head"], extendMm: 50 } }));
  const at2100 = linear(r).filter((d) => d.role.startsWith("jamb") && d.sourceRefs[0].station === 2100);
  assert.equal(at2100.length, 1);
  near(at2100[0].lengthMm, 1300, 1e-9);
  const heads = linear(r).filter((d) => d.role === "head");
  assert.equal(heads.length, 2, "two separate heads (different extents) are not merged");
});
t("BAT01 dedupe never crosses layers: existing studs are layout only; the coincident cavity layer is all purchased", () => {
  const studs = supportGrid(WALL, [], layer({ id: "studs", existing: true }));
  const cavity = supportGrid(WALL, [], layer());
  assert.equal(studs.demands.length, 0);
  assert.equal(studs.layout.lines.length, 9);
  assert.ok(studs.explain.some((e) => /not purchased/.test(e)));
  assert.equal(linear(cavity).length, 9);
  assert.ok(stationsOf(studs).every((s, i) => s === stationsOf(cavity)[i]));
});
t("BAT01 a panel joint needing a double support gives two plies (never deduplicated)", () => {
  const r = supportGrid(WALL, [], layer({ requiredStationsMm: [{ atMm: 2400, ref: "panel joint", plies: 2 }] }));
  const at = linear(r).filter((d) => d.sourceRefs[0].station === 2400);
  assert.equal(at.length, 2);
  assert.notEqual(at[0].id, at[1].id);
});
t("B1 movement/floor joints are tagged breaks — supports are never bridged across them", () => {
  const r = supportGrid(WALL, [], layer({ breaks: [{ atMm: 1350, gapMm: 20, ref: "floor joint" }] }));
  assert.equal(linear(r).length, 18);
  for (const d of linear(r)) near(d.lengthMm, 1340, 1e-9);
  assert.ok(r.layout.lines.every((l) => l.toMm <= 1340 + 1e-9 || l.fromMm >= 1360 - 1e-9));
});

// ── B3 procurement ───────────────────────────────────────────────────────────────────────────────────────────
t("B3 support longer than stock with no joint rule → needs-joint-detail (no LM ÷ stock shortcut)", () => {
  const r = supportGrid({ id: "T", widthMm: 1200, heightMm: 3600 }, [], layer({ stockPolicy: { kind: "list", lengthsMm: [2700] } }));
  assert.equal(linear(r).length, 3);
  assert.ok(linear(r).every((d) => d.lengthMm === 3600 && d.quantity === 1 && d.unit === "piece" && d.noSplice === true));
  assert.ok(linear(r).every((d) => d.problems?.some((p) => p.code === "needs-joint-detail")));
  assert.equal(r.status.quantity, "incomplete");
  assert.ok(!r.demands.some((d) => d.unit === "lm"));
});
t("B3 approved joints split pieces only at approved positions; stockPolicy passed through", () => {
  const sp = { kind: "list", lengthsMm: [2700] };
  const r = supportGrid({ id: "T", widthMm: 1200, heightMm: 3600 }, [], layer({ stockPolicy: sp, jointPolicy: { positionsMm: [1200, 2400], ref: "noggins" } }));
  const at0 = linear(r).filter((d) => d.sourceRefs[0].station === 0);
  assert.deepEqual(at0.map((d) => d.lengthMm), [2400, 1200]);
  assert.ok(linear(r).every((d) => d.stockPolicy === sp && d.lengthKind === LENGTH_KINDS.CUT));
  assert.ok(r.layout.joints.every((j) => [1200, 2400].includes(j.atMm)));
  assert.equal(r.status.quantity, "calculated");
});
t("B3 unknown AAC rail spacing: unresolved, no invented default; a reviewed entered layout is labelled with its authority", () => {
  const none = supportGrid(WALL, [], layer({ maxSpacingMm: undefined, fixing: undefined }));
  assert.equal(none.demands.length, 0);
  assert.ok(codes(none).includes("support-spacing-unresolved"));
  assert.equal(none.status.quantity, "incomplete");
  assert.notEqual(none.status.installation, "supported-by-selected-rule");
  const entered = supportGrid(WALL, [], layer({ maxSpacingMm: undefined, fixing: undefined, fixingScope: { status: "by-others", reason: "rail fixings by AAC installer" },
    stockPolicy: { kind: "list", lengthsMm: [6000] }, manualLayout: { count: 4, lengthMm: 4800, authority: { kind: "project-detail", ref: "Walsc rail layout rev B" } } }));
  const d = linear(entered)[0];
  assert.equal(d.quantity, 4); assert.equal(d.provenance, "manual");
  assert.equal(entered.status.installation, "project-detail-supplied");
  assert.equal(entered.status.quantity, "estimate");
});
t("B1 support-span limit and narrow-strip attachment count are checked against the frame members crossed", () => {
  const studs = [0, 600, 1200, 1800, 2400, 3000, 3600, 4200, 4800];
  const horiz = (over) => layer({ orientation: "horizontal", stockPolicy: { kind: "list", lengthsMm: [5400] }, supportSpanMm: 600, attachmentTargetsMm: studs, ...over });
  assert.ok(!codes(supportGrid(WALL, [], horiz())).includes("support-span-exceeded"));
  const gap = supportGrid(WALL, [], horiz({ attachmentTargetsMm: studs.filter((x) => x !== 2400) }));
  assert.ok(gap.problems.some((p) => p.code === "support-span-exceeded" && /1,200 mm/.test(p.message)));
  assert.equal(gap.status.quantity, "incomplete");
  const narrow = supportGrid({ id: "N", widthMm: 450, heightMm: 2700 }, [], horiz({ attachmentTargetsMm: [0], minAttachments: 2 }));
  assert.ok(codes(narrow).includes("too-few-attachments"));
  assert.ok(codes(supportGrid(WALL, [], layer({ supportSpanMm: 600 }))).includes("attachment-targets-missing"));
});
t("B4 intersection fixings default to the frame members crossed (attachment targets), never the support spacing", () => {
  const studs = [0, 450, 900, 1350, 1800, 2250, 2700, 3150, 3600, 4050, 4500];
  const r = supportGrid(WALL, [], layer({ orientation: "horizontal", stockPolicy: { kind: "list", lengthsMm: [5400] }, attachmentTargetsMm: studs,
    fixing: { mode: "intersections", edgeStartMm: 0, edgeEndMm: 0, perPoint: 1, identity: SCREW } }));
  assert.equal(fixDemands(r)[0].quantity, 6 * studs.length);
});
t("06 missing stock data leaves procurement at missing-product while the installed quantity is calculated", () => {
  const r = supportGrid(WALL, [], layer({ stockPolicy: undefined }));
  assert.equal(r.status.quantity, "calculated");
  assert.equal(r.status.procurement, "missing-product");
  const s = accessoryRoutes(WALL, [], {}, recipe({ id: "seal", kind: "sealant", identity: { sku: "PU" }, routes: [{ source: "manual", lengthMm: 1000, beadCount: 1, crossSection: { diameterMm: 6 } }] }));
  assert.deepEqual([s.status.quantity, s.status.procurement], ["calculated", "missing-product"]);
});
t("B1 element limit: excess is rejected with split-wall guidance, never truncated", () => {
  const r = supportGrid(WALL, [], layer({ maxSpacingMm: 0.5 }));
  assert.ok(codes(r).includes("too-many-elements"));
  assert.equal(r.demands.length, 0);
});
t("C0 invalid, zero-sized or wholly-outside openings require correction (blocking)", () => {
  const r = supportGrid(WALL, [{ id: "Z", x0: 100, y0: 100, x1: 100, y1: 900 }, { id: "O", x0: 5000, y0: 0, x1: 5600, y1: 900 }], layer());
  assert.ok(codes(r).includes("opening-invalid") && codes(r).includes("opening-outside-wall"));
  assert.equal(r.status.quantity, "incomplete");
});
t("06 three independent statuses: calculated quantity, source-pending installation, missing product", () => {
  const r = supportGrid(WALL, [], layer({ identity: undefined, authority: { kind: "rule", ref: "H02 T1", reviewed: false } }));
  assert.deepEqual(r.status, { quantity: "calculated", installation: "source-pending", procurement: "missing-product" });
  const ok = supportGrid(WALL, [], layer({ authority: { kind: "rule", ref: "H02 T1 N2", reviewed: true } }));
  assert.equal(ok.status.installation, "supported-by-selected-rule");
});

// ── BAT02: edge zones change stations AND the fixing tuple together ───────────────────────────────────────────
const ZONE = { fromMm: 0, toMm: 1200, maxSpacingMm: 300, ruleRef: "H04 T3 edge N3", fixing: pitch(200, { ruleRef: "H04 T3 edge N3" }) };
t("BAT02 edge zone: tighter stations in the zone interval, transition support kept, zone fixing tuple applied", () => {
  const base = supportGrid(WALL, [], layer());
  assert.deepEqual(stationsOf(base), [0, 600, 1200, 1800, 2400, 3000, 3600, 4200, 4800]);
  assert.deepEqual(fixDemands(base).map((d) => d.quantity), [9 * (Math.ceil(2700 / 400) + 1)]);
  const z = supportGrid(WALL, [], layer({ edgeZones: [ZONE] }));
  assert.deepEqual(stationsOf(z), [0, 300, 600, 900, 1200, 1800, 2400, 3000, 3600, 4200, 4800]);
  const tr = z.layout.stations.find((s) => s.atMm === 1200);
  assert.equal(tr.zoneRef, ZONE.ruleRef, "the transition support takes the zone row");
  const [zf, gf] = [fixDemands(z).find((d) => /zone0/.test(d.id)), fixDemands(z).find((d) => /general/.test(d.id))];
  assert.equal(zf.quantity, 5 * fixingsAlongLine(2700, 200));
  assert.equal(gf.quantity, 6 * fixingsAlongLine(2700, 400));
  assert.notDeepEqual(z.demands.map((d) => d.id), base.demands.map((d) => d.id));
});
t("BAT02 changing the zone row updates spacing and fixing together", () => {
  const z2 = supportGrid(WALL, [], layer({ edgeZones: [{ ...ZONE, maxSpacingMm: 450, fixing: pitch(150) }] }));
  assert.deepEqual(stationsOf(z2).slice(0, 4), [0, 450, 900, 1200]);
  assert.equal(fixDemands(z2).find((d) => /zone0/.test(d.id)).quantity, 4 * fixingsAlongLine(2700, 150));
});
t("BAT02 a zone row with spacing but no fixing config is incomplete — the general fixing is never borrowed", () => {
  const r = supportGrid(WALL, [], layer({ edgeZones: [{ ...ZONE, fixing: undefined }] }));
  const p = r.problems.find((x) => x.code === "zone-tuple-incomplete");
  assert.ok(p && p.message.includes(FIXINGS_NOT_QUANTIFIED));
  assert.equal(fixDemands(r).length, 1, "only the general tuple is quantified");
  assert.equal(r.status.quantity, "incomplete");
  noZeroQuantities(r);
});
t("B2 window jambs are not corner zones; an unsourced zone keeps installation source-pending", () => {
  assert.deepEqual(stationsOf(supportGrid(WALL, [W1], layer())), stationsOf(supportGrid(WALL, [], layer())));
  const r = supportGrid(WALL, [], layer({ authority: { kind: "rule", ref: "H04", reviewed: true }, edgeZones: [{ ...ZONE, ruleRef: undefined }] }));
  assert.ok(codes(r).includes("edge-zone-unsourced"));
  assert.equal(r.status.installation, "source-pending");
});

// ── B4 fasteners ─────────────────────────────────────────────────────────────────────────────────────────────
t("B4 endpoint-aware n = ceil(U/p)+1 (both ends); float noise tolerated, a real 1 mm over is not", () => {
  assert.equal(fixingsAlongLine(2700, 300), 10);
  assert.equal(fixingsAlongLine(2700 + 1e-9, 300), 10);
  assert.equal(fixingsAlongLine(2701, 300), 11);
  assert.equal(fixingsAlongLine(2700, 300, { bothEnds: false }), 9);
  assert.equal(fixingsAlongLine(0, 300), 1);
  assert.throws(() => fixingsAlongLine(100, 0));
});
t("B4 edge offsets, multiplicity and terminal fixings come from the row", () => {
  const r = fixingsDemand({ id: "f", materialId: "m", role: "fixing-support-to-frame", label: "x", lines: [{ id: "a", startMm: 0, endMm: 2700 }], rule: pitch(300, { edgeStartMm: 50, edgeEndMm: 50, perPoint: 2, extraPerLine: 1 }) });
  assert.equal(r.demand.quantity, (Math.ceil(2600 / 300) + 1) * 2 + 1);
});
t("B4 intersections: frame members crossing the usable length × per-intersection multiplicity", () => {
  const r = fixingsDemand({ id: "f", materialId: "m", role: "fixing-support-to-frame", label: "x", lines: [{ id: "a", startMm: 0, endMm: 4800 }],
    rule: { mode: "intersections", targetsMm: [0, 600, 1200, 1800, 2400, 3000, 3600, 4200, 4800, 5400], edgeStartMm: 0, edgeEndMm: 0, perPoint: 2, identity: SCREW } });
  assert.equal(r.demand.quantity, 18);
});
t("B4 a prescribed special pattern is used as given — the generic formula is not applied", () => {
  const r = fixingsDemand({ id: "f", materialId: "m", role: "fixing-support-to-frame", label: "x", lines: [{ id: "a", startMm: 0, endMm: 2700 }, { id: "b", startMm: 0, endMm: 900 }],
    rule: { mode: "pattern", countPerLine: 4, pitchMm: 100, identity: SCREW } });
  assert.equal(r.demand.quantity, 8);
});
t("B4 incomplete spec → 'fixings not quantified — detail required', never 0; support spacing is never the fixing pitch", () => {
  const noPitch = supportGrid(WALL, [], layer({ fixing: { mode: "pitch", edgeStartMm: 0, edgeEndMm: 0, identity: SCREW } }));
  assert.equal(fixDemands(noPitch).length, 0);
  assert.ok(noPitch.problems.some((p) => p.code === "fixings-not-quantified" && p.message.includes(FIXINGS_NOT_QUANTIFIED) && /fixing pitch/.test(p.message)));
  const noRule = supportGrid(WALL, [], layer({ fixing: undefined }));
  assert.ok(noRule.problems.some((p) => p.message.includes(FIXINGS_NOT_QUANTIFIED)));
  assert.equal(noRule.status.quantity, "incomplete");
  const noCorrosion = supportGrid(WALL, [], layer({ fixing: pitch(400, { identity: { ...SCREW, corrosionClass: null } }) }));
  assert.ok(noCorrosion.problems.some((p) => /corrosionClass/.test(p.message)));
  const short = fixingsDemand({ id: "f", materialId: "m", role: "r", label: "x", lines: [{ id: "a", startMm: 0, endMm: 60 }], rule: pitch(300, { edgeStartMm: 50, edgeEndMm: 50 }) });
  assert.equal(short.demand, null);
  for (const r of [noPitch, noRule, noCorrosion]) noZeroQuantities(r);
});
t("B4 cladding-only scope: fixings by others with a reason are recorded as omitted, not unresolved", () => {
  const r = supportGrid(WALL, [], layer({ fixing: undefined, fixingScope: { status: "by-others", reason: "installer supplies screws" } }));
  assert.equal(fixDemands(r).length, 0);
  assert.ok(!codes(r).includes("fixings-not-quantified"));
  assert.equal(r.status.quantity, "calculated");
  assert.ok(codes(supportGrid(WALL, [], layer({ fixingScope: { status: "exclude" } }))).includes("scope-reason-missing"));
});
t("B4 boxes = ceil(total × (1+spare) / box), rounded AFTER job aggregation; identities never pooled across", () => {
  assert.equal(boxesFor(260, 0, 200), 2);
  assert.equal(boxesFor(250, 0.1, 250), 2);
  assert.equal(boxesFor(0, 0, 100), 0);
  assert.throws(() => boxesFor(10, undefined, 100));
  const d = (id, q, identity = SCREW) => ({ id, kind: "count", role: "fixing-support-to-frame", quantity: q, identity });
  const agg = aggregateFixings([d("a", 30), d("b", 30), d("c", 30, { ...SCREW, corrosionClass: "C3" })], () => ({ boxSize: 100, spareRate: 0 }));
  assert.deepEqual(agg.lines.map((l) => [l.fixings, l.boxes]), [[60, 1], [30, 1]], "30+30 → one box, not one per wall");
  const missing = aggregateFixings([d("a", 30)]);
  assert.equal(missing.lines[0].boxes, null);
  assert.ok(missing.problems.some((p) => p.code === "fixing-pack-missing"));
});

// ── BOM01: accessory routes, no double opening deduction, unknown never zero ──────────────────────────────────
const D1 = { id: "D1", x0: 600, y0: 0, x1: 1500, y1: 2100 };
t("BOM01 starter: base less doors (detail excludes them); overlapping doors deducted once", () => {
  const g = { id: "starter", kind: "starter", identity: { sku: "base trim" }, routes: ["base"], excludeDoors: true, stockPolicy: { kind: "fixed", lengthMm: 6000 } };
  assert.equal(totalLen(accessoryRoutes(WALL, [D1, W1], {}, recipe(g)).demands), 3900);
  const D2 = { id: "D2", x0: 1200, y0: 0, x1: 1800, y1: 2100 };
  assert.equal(totalLen(accessoryRoutes(WALL, [D1, D2], {}, recipe(g)).demands), 3600);
  assert.equal(totalLen(accessoryRoutes(WALL, [D1], {}, recipe({ ...g, excludeDoors: false })).demands), 4800);
});
t("BOM01 trims longer than stock: needs-joint-detail unless the detail permits an overlap joint", () => {
  const g = { id: "starter", kind: "starter", identity: { sku: "s" }, routes: ["base"], stockPolicy: { kind: "fixed", lengthMm: 3000 } };
  const r = accessoryRoutes(WALL, [], {}, recipe(g));
  assert.ok(codes(r).includes("needs-joint-detail"));
  assert.deepEqual(r.layout.readiness.missing, ["starter"]);
  const ok = accessoryRoutes(WALL, [], {}, recipe({ ...g, jointOverlapMm: 100 }));
  assert.deepEqual(ok.demands.map((d) => d.lengthMm), [3000, 1900]);
});
t("BOM01 joint strips come from actual layout joints (clipped at openings), never from grooves", () => {
  const layoutInfo = { joints: [{ id: "HJ1", orientation: "horizontal", atMm: 1200, fromMm: 0, toMm: 4800 }, { id: "G1", kind: "groove", orientation: "horizontal", atMm: 600, fromMm: 0, toMm: 4800 }] };
  const r = accessoryRoutes(WALL, [W1], layoutInfo, recipe({ id: "hj", kind: "joint-strip", orientation: "horizontal", identity: { sku: "h-joint" }, stockPolicy: { kind: "fixed", lengthMm: 3000 } }));
  assert.deepEqual(r.demands.map((d) => d.lengthMm), [1500, 2400]);
});
t("BOM01 membrane estimate: openings not deducted by default; deduct policy uses the opening union once; cladding net area ignored", () => {
  const g = { id: "wrap", kind: "membrane", mode: "estimate", allowanceRate: 0.1, identity: { sku: "wrap" } };
  const area = (ops, extra = {}, info = {}) => accessoryRoutes(WALL, ops, info, recipe({ ...g, ...extra })).demands[0].quantity;
  near(area([W1]), 12.96 * 1.1, 1e-9);
  near(area([W1], {}, { netAreaM2: 5 }), 12.96 * 1.1, 1e-9);
  const sq = { id: "S", x0: 1500, y0: 900, x1: 2400, y1: 1800 };
  near(area([sq], { openingPolicy: "deduct" }), 12.15 * 1.1, 1e-9);
  near(area([sq, { ...sq, id: "S2" }], { openingPolicy: "deduct" }), 12.15 * 1.1, 1e-9);
  near(area([sq], { openingPolicy: "deduct", revealWrapMm: 100 }), (12.15 + 0.36) * 1.1, 1e-9);
  const r = accessoryRoutes(WALL, [sq], {}, recipe(g));
  assert.equal(r.status.quantity, "estimate");
  near(r.layout.areas.netM2, 12.15, 1e-9);
});
t("BOM01 membrane roll mode: course width, side/end laps and roll length with cut loss kept", () => {
  const g = { id: "wrap", kind: "membrane", mode: "roll", orientation: "horizontal", courseWidthMm: 1370, sideLapMm: 150, endLapMm: 150, rollLengthMm: 30000, identity: { sku: "wrap" } };
  const big = accessoryRoutes(WALL, [W1], {}, recipe(g));
  assert.equal(big.demands[0].quantity, 1);
  assert.deepEqual(big.layout.membranes.wrap.runsMm, [4800, 4800, 4800]);
  const small = accessoryRoutes(WALL, [], {}, recipe({ ...g, rollLengthMm: 10000 }));
  assert.equal(small.demands[0].quantity, 2);
  assert.equal(small.layout.membranes.wrap.seamsMm, 9600 + 1370);
  assert.ok(codes(accessoryRoutes(WALL, [W1], {}, recipe({ ...g, openingPolicy: "deduct" }))).includes("membrane-roll-opening-policy"));
});
t("BOM01 tape: opening perimeter + membrane seams × explicit allowance → rolls; unknown seams unresolved", () => {
  const mem = { id: "wrap", kind: "membrane", mode: "roll", orientation: "horizontal", courseWidthMm: 1370, sideLapMm: 150, endLapMm: 150, rollLengthMm: 30000, identity: { sku: "wrap" } };
  const tape = { id: "tape", kind: "tape", routes: ["opening-perimeter", "membrane-seams"], membraneGroupId: "wrap", allowanceRate: 0.1, rollLengthMm: 25000, identity: { sku: "tape" } };
  const r = accessoryRoutes(WALL, [W1], {}, recipe(tape, mem));
  near(r.demands.find((d) => d.role === "tape").quantity, ((4200 + 9600) * 1.1) / 25000, 1e-12);
  assert.equal(aggregateConsumables(r.demands).find((l) => l.unit === "roll" && l.identity.sku === "tape").quantity, 1, "whole rolls only after job aggregation");
  const est = accessoryRoutes(WALL, [W1], {}, recipe(tape, { ...mem, mode: "estimate" }));
  assert.ok(codes(est).includes("tape-seams-unknown"));
  assert.ok(!est.demands.some((d) => d.role === "tape"));
  assert.deepEqual(est.layout.readiness.missing, ["tape"]);
});
t("BOM01 sealant: named routes × beads × section → ml, cartridges only from an explicit yield", () => {
  const g = { id: "seal", kind: "sealant", identity: { sku: "PU" }, cartridgeMl: 300, applicationYield: 0.9, routes: [{ id: "W perim", source: "opening-perimeter", beadCount: 1, crossSection: { diameterMm: 6 } }] };
  const r = accessoryRoutes(WALL, [W1], {}, recipe(g));
  assert.equal(r.demands[0].unit, "cartridge");
  near(r.demands[0].quantity, sealantVolumeMl({ diameterMm: 6, lengthMm: 4200 }) / 270, 1e-12);
  assert.equal(aggregateConsumables(r.demands)[0].quantity, Math.ceil(sealantVolumeMl({ diameterMm: 6, lengthMm: 4200 }) / 270));
  const missing = accessoryRoutes(WALL, [W1], {}, recipe({ ...g, routes: [{ source: "opening-perimeter", crossSection: { diameterMm: 6 } }] }));
  assert.ok(codes(missing).includes("sealant-bead-missing"));
  assert.equal(missing.demands.length, 0);
  assert.equal(missing.status.quantity, "incomplete");
});
t("BOM01 AAC adhesive: unresolved without a REVIEWED yield (never 0, never borrowed from sealant)", () => {
  const seal = { id: "mj-sealant", kind: "sealant", identity: { sku: "movement-joint sealant" }, routes: [{ source: "manual", lengthMm: 2700, beadCount: 1, crossSection: { widthMm: 10, depthMm: 10 } }] };
  const glue = { id: "aac-glue", kind: "aac-adhesive", basis: "net-area", identity: { sku: "Walsc adhesive" } };
  for (const y of [undefined, { per: 10, unit: "bag", reviewed: false, ref: "old PDF" }]) {
    const r = accessoryRoutes(WALL, [], {}, recipe(seal, { ...glue, yield: y }));
    assert.ok(codes(r).includes("aac-adhesive-yield-unresolved"));
    assert.deepEqual(r.demands.map((d) => d.role), ["sealant"]);
    assert.deepEqual(r.layout.readiness.missing, ["aac-glue"]);
    assert.equal(r.status.quantity, "incomplete");
    noZeroQuantities(r);
  }
  const ok = accessoryRoutes(WALL, [W1], {}, recipe(seal, { ...glue, yield: { per: 5, unit: "bag", reviewed: true, ref: "Walsc guide 2026 p.12" } }));
  near(ok.demands.find((d) => d.role === "aac-adhesive").quantity, 11.88 / 5, 1e-9);
  assert.equal(aggregateConsumables(ok.demands).find((l) => l.unit === "bag").quantity, Math.ceil(11.88 / 5));
  assert.notEqual(ok.demands[0].id, ok.demands[1].id);
  const manual = accessoryRoutes(WALL, [], {}, recipe({ ...glue, manualQuantity: { quantity: 3, unit: "bag", authority: "supplier takeoff 14/10" } }));
  assert.equal(manual.demands[0].provenance, "manual");
});
t("BOM01 mesh: full coverage and equivalent joint strips are never both counted", () => {
  const rev = { per: 50, unit: "roll", reviewed: true, ref: "system guide" };
  const full = { id: "mesh-full", kind: "mesh", basis: "net-area", coatingSystem: "render-A", yield: rev, identity: { sku: "mesh" } };
  const strip = { id: "mesh-joints", kind: "mesh", basis: "joint-lm", coatingSystem: "render-A", yield: { ...rev, per: 50 }, identity: { sku: "mesh strip" } };
  const r = accessoryRoutes(WALL, [], { joints: [{ id: "J", orientation: "vertical", atMm: 2400, fromMm: 0, toMm: 2700 }] }, recipe(full, strip));
  assert.ok(codes(r).includes("mesh-double-count"));
  assert.deepEqual(r.demands.map((d) => d.role), ["mesh"]);
  const both = accessoryRoutes(WALL, [], { joints: [{ id: "J", orientation: "vertical", atMm: 2400, fromMm: 0, toMm: 2700 }] }, recipe(full, { ...strip, additional: true }));
  assert.equal(both.demands.length, 2);
});
t("BOM01 corners: tagged heights incl. chosen returns; shared corner ids deduplicated across walls; types separate", () => {
  const ext = { id: "ext", kind: "corner", cornerType: "external", identity: { sku: "ext corner" }, stockPolicy: { kind: "fixed", lengthMm: 3000 } };
  const int = { ...ext, id: "int", cornerType: "internal", identity: { sku: "int corner" } };
  const a = accessoryRoutes(WALL, [], { corners: [{ id: "C-NE", type: "external", at: "end", extraMm: 50 }, { id: "C-NE", type: "external", at: "end", extraMm: 50 }, { id: "C-IN", type: "internal", heightMm: 2700 }] }, recipe(ext, int));
  const b = accessoryRoutes({ id: "W02", widthMm: 3600, heightMm: 2700 }, [], { corners: [{ id: "C-NE", type: "external", at: "start", extraMm: 50 }] }, recipe(ext, int));
  assert.equal(a.demands.filter((d) => d.role === "corner").length, 2);
  const m = mergeAccessoryResults([a, b]);
  const ne = m.demands.filter((d) => d.id.includes("C-NE"));
  assert.equal(ne.length, 1);
  assert.equal(ne[0].lengthMm, 2750);
  assert.deepEqual(ne[0].sourceRefs.map((s) => s.wallId), ["W01", "W02"]);
  assert.notDeepEqual(m.demands.find((d) => d.id.includes("C-IN")).identity, ne[0].identity);
  const conflict = mergeAccessoryResults([a, accessoryRoutes({ id: "W03", widthMm: 3600, heightMm: 3000 }, [], { corners: [{ id: "C-NE", type: "external", at: "start", extraMm: 50 }] }, recipe(ext))]);
  assert.ok(codes(conflict).includes("shared-id-conflict"));
});
t("BOM01 scope: by-others/exclude recorded as omitted with reason; unknown required quantity is unresolved, not excluded", () => {
  const r = accessoryRoutes(WALL, [W1], {}, recipe(
    { id: "vents", kind: "vent", identity: { sku: "vent" }, routes: ["base"], scope: { status: "by-others", reason: "ventilation by façade contractor" } },
    { id: "primer", kind: "primer", basis: "cut-ends", identity: { sku: "edge sealer" } },
    { id: "coat", kind: "coating", scope: { status: "exclude" }, identity: { sku: "render" } },
  ));
  assert.deepEqual(r.layout.readiness.omitted.map((o) => [o.id, o.scope]), [["vents", "by-others"], ["coat", "exclude"]]);
  assert.deepEqual(r.layout.readiness.missing, ["primer"]);
  assert.ok(codes(r).includes("scope-reason-missing"));
  assert.equal(r.demands.length, 0);
  assert.equal(r.status.quantity, "incomplete");
  assert.equal(r.layout.readiness.complete, false);
});
t("B5 vents/closers keep their ventilation spec in the product — never inferred", () => {
  const r = accessoryRoutes(WALL, [], {}, recipe({ id: "closer", kind: "closer", identity: { sku: "closer" }, routes: ["top"], stockPolicy: { kind: "fixed", lengthMm: 6000 } }));
  assert.ok(codes(r).includes("ventilation-spec-missing"));
  assert.equal(r.status.procurement, "missing-product");
});

// ── BOM02: child flashing — exactly one demand, length kind kept, allowance at most once ─────────────────────
const TEMPLATE = { materialId: "m-flash", edges: ["head"], profile: { id: "head-flash", revision: 3 }, identity: { finish: "COLORBOND", bmt: 0.55, colour: "Monument" }, wallId: "W01" };
t("BOM02 tight child: one demand at the measured edge; the +200 is applied once downstream, never pre-added", () => {
  const r = childFlashingDemands([W1], { ...TEMPLATE, lengthKind: LENGTH_KINDS.TIGHT });
  assert.equal(r.demands.length, 1);
  const d = r.demands[0];
  assert.equal(d.lengthKind, LENGTH_KINDS.TIGHT); assert.equal(d.lengthMm, 900);
  assert.equal(measuredRunResult(d.lengthMm).finishedLengthMm, 1100);
  assert.deepEqual(d.sourceRefs[0], { wallId: "W01", openingId: "W1", role: "head" });
  assert.equal(d.identity.profileRevision, 3);
  assert.ok(r.explain.some((e) => /1,100 mm/.test(e)));
});
t("BOM02 finished child (head incl. returns): finished length, no measured-run allowance", () => {
  const r = childFlashingDemands([W1], { ...TEMPLATE, lengthKind: LENGTH_KINDS.FINISHED, extensionsMm: { head: { startMm: 100, endMm: 100 } } });
  const d = r.demands[0];
  assert.equal(d.lengthKind, LENGTH_KINDS.FINISHED); assert.equal(d.lengthMm, 1100);
  assert.equal(manualPieceResult(d.lengthMm, 1).finishedLengthMm, 1100, "finished bypasses +200");
});
t("BOM02 tight extensions must say whether the allowance already covers them (never twice)", () => {
  const amb = childFlashingDemands([W1], { ...TEMPLATE, lengthKind: LENGTH_KINDS.TIGHT, extensionsMm: { head: { startMm: 100, endMm: 100 } } });
  assert.ok(codes(amb).includes("flashing-extension-ambiguous"));
  assert.equal(amb.demands.length, 0);
  const inside = childFlashingDemands([W1], { ...TEMPLATE, lengthKind: LENGTH_KINDS.TIGHT, extensionsMm: { head: { startMm: 100, endMm: 100 } }, extensionsBeyondAllowance: false });
  assert.equal(inside.demands[0].lengthMm, 900);
  const beyond = childFlashingDemands([W1], { ...TEMPLATE, lengthKind: LENGTH_KINDS.TIGHT, extensionsMm: { head: { startMm: 100, endMm: 100 } }, extensionsBeyondAllowance: true });
  assert.equal(measuredRunResult(beyond.demands[0].lengthMm).finishedLengthMm, 1300);
});
t("BOM02 exactly one demand per opening edge; regenerated (same ids) when geometry changes, never appended", () => {
  const W2 = { id: "W2", x0: 3000, y0: 900, x1: 3600, y1: 2100 };
  const t1 = { ...TEMPLATE, edges: ["head", "sill"], lengthKind: LENGTH_KINDS.TIGHT };
  const a = childFlashingDemands([W1, W2], t1);
  assert.equal(a.demands.length, 4);
  assert.equal(new Set(a.demands.map((d) => d.id)).size, 4);
  const b = childFlashingDemands([{ ...W1, x1: 2700 }, W2], t1);
  assert.deepEqual(b.demands.map((d) => d.id), a.demands.map((d) => d.id));
  assert.equal(b.demands[0].lengthMm, 1200);
});
t("BOM02 a hand-measured equivalent is linked by choice, never silently double counted", () => {
  const base = { ...TEMPLATE, lengthKind: LENGTH_KINDS.TIGHT };
  const undecided = childFlashingDemands([W1], { ...base, manualEquivalents: [{ openingId: "W1", edge: "head", measurementId: "M7" }] });
  assert.ok(undecided.problems.some((p) => p.code === "flashing-possible-double-count" && p.blocking));
  assert.equal(childFlashingDemands([W1], { ...base, manualEquivalents: [{ openingId: "W1", edge: "head", measurementId: "M7", choice: "use-manual" }] }).demands.length, 0);
  const gen = childFlashingDemands([W1], { ...base, manualEquivalents: [{ openingId: "W1", edge: "head", measurementId: "M7", choice: "use-generated" }] });
  assert.ok(gen.demands[0].sourceRefs.some((s) => s.measurementId === "M7" && s.role === "replaced-manual"));
});
t("BOM02 manual override becomes a reviewable difference; missing length kind generates nothing", () => {
  const r = childFlashingDemands([W1], { ...TEMPLATE, lengthKind: LENGTH_KINDS.FINISHED, overrides: { "W1:head": { lengthMm: 1250, reason: "site measure" } } });
  assert.equal(r.demands[0].provenance, "manual"); assert.equal(r.demands[0].lengthMm, 1250);
  assert.ok(r.problems.some((p) => p.code === "override-difference" && p.blocking === false));
  const none = childFlashingDemands([W1], { ...TEMPLATE });
  assert.equal(none.demands.length, 0);
  assert.ok(codes(none).includes("flashing-length-kind-missing"));
});
t("BOM02 accessory flashing group produces the same single child demand", () => {
  const r = accessoryRoutes(WALL, [W1], {}, recipe({ id: "head-flash", kind: "flashing", template: { ...TEMPLATE, lengthKind: LENGTH_KINDS.TIGHT } }));
  assert.equal(r.demands.length, 1);
  assert.equal(r.demands[0].lengthKind, LENGTH_KINDS.TIGHT);
  assert.equal(r.status.quantity, "calculated");
});

console.log(`takeoff-tc-supports: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
