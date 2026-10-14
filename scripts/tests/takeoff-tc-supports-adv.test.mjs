// TC-R04 05 supports + accessories — ADVERSARIAL verification (B1–B6, BAT01/BAT02/BOM01/BOM02). Each test tries to
// break a spec rule ("never", "only", "once", "not zero") or a boundary of the production engine; the defects it
// found are fixed in shared/takeoff/engine/supports.js + accessories.js and pinned here. Production functions only.
//   node scripts/tests/takeoff-tc-supports-adv.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FIXINGS_NOT_QUANTIFIED, MAX_ELEMENTS_PER_WALL, aggregateFixings, boxesFor, fixingsAlongLine, fixingsDemand, maxStockLengthMm, requiredStations, supportGrid,
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
const total = (ds) => ds.reduce((s, d) => s + d.lengthMm * d.quantity, 0);
const role = (r, x) => r.demands.filter((d) => d.role === x);
const uniqueIds = (r) => assert.equal(new Set(r.demands.map((d) => d.id)).size, r.demands.length, "demand ids must be unique");
const sane = (r) => {
  for (const d of r.demands) assert.ok(Number.isFinite(d.quantity) && d.quantity > 0, `${d.id}: quantity ${d.quantity} — never 0, NaN or negative`);
  for (const d of r.demands.filter((x) => x.kind === "linear" && x.unit === "piece")) assert.ok(Number.isFinite(d.lengthMm) && d.lengthMm > 0, `${d.id}: length ${d.lengthMm}`);
};

const SCREW = { material: "steel", corrosionClass: "C4", lengthMm: 65, head: "bugle", substrate: "timber" };
const NAIL = { material: "stainless", corrosionClass: "C5", lengthMm: 40, head: "flat", substrate: "timber batten" };
const pitch = (pitchMm, extra = {}) => ({ mode: "pitch", pitchMm, edgeStartMm: 0, edgeEndMm: 0, identity: SCREW, ...extra });
const WALL = { id: "W01", widthMm: 4800, heightMm: 2700 };
const W1 = { id: "W1", x0: 1500, y0: 900, x1: 2400, y1: 2100 };
const layer = (over = {}) => ({ id: "cavity", materialId: "m-batten", orientation: "vertical", maxSpacingMm: 600, identity: { sku: "405307" }, stockPolicy: { kind: "list", lengthsMm: [3000] }, fixing: pitch(400), ...over });
const recipe = (...groups) => ({ id: "assembly", groups });
const TEMPLATE = { materialId: "m-flash", edges: ["head"], lengthKind: LENGTH_KINDS.TIGHT, profile: { id: "head-flash", revision: 3 }, identity: { finish: "COLORBOND", bmt: 0.55, colour: "Monument" }, wallId: "W01" };
const sealGroup = (routes, extra = {}) => ({ id: "seal", kind: "sealant", identity: { sku: "PU40" }, routes, ...extra });

// ── fixtures.json, adversarially: same production functions, off-grid and alternative-input paths ────────────
for (const c of fixtures.filter((x) => x.kind === "supports")) {
  t(`fixture ${c.id}: horizontal primitive on the transposed wall gives the same ${c.expected} mm; off-grid width adds one support`, () => {
    const r = supportGrid({ id: "F", widthMm: c.input.height, heightMm: c.input.width }, [], layer({ orientation: "horizontal", maxSpacingMm: c.input.centres, stockPolicy: { kind: "list", lengthsMm: [c.input.height] } }));
    assert.equal(total(linear(r)), c.expected);
    const off = supportGrid({ id: "F", widthMm: c.input.width + 1, heightMm: c.input.height }, [], layer({ maxSpacingMm: c.input.centres }));
    assert.equal(linear(off).length, Math.ceil((c.input.width + 1) / c.input.centres) + 1, "4,801 at 600 → 10 supports, never 9");
    uniqueIds(off);
  });
}
for (const c of fixtures.filter((x) => x.kind === "sealant")) {
  t(`fixture ${c.id}: area / width×depth paths agree; tagged corner route of ${c.input.length} mm gives ${c.expected} ml`, () => {
    near(sealantVolumeMl({ areaMm2: Math.PI * (c.input.diameter / 2) ** 2, lengthMm: c.input.length }), c.expected);
    near(sealantVolumeMl({ diameterMm: c.input.diameter, lengthMm: c.input.length / 2, beadCount: 2 }), c.expected);
    const r = accessoryRoutes({ id: "F", widthMm: 3000, heightMm: c.input.length }, [], { corners: [{ id: "C", type: "external", at: "end" }] },
      recipe(sealGroup([{ id: "corner", source: "corners", beadCount: 1, crossSection: { diameterMm: c.input.diameter } }])));
    near(r.demands[0].quantity, c.expected);
  });
}

// ── B1 dedupe: identical physical members only, independent of drawing order ─────────────────────────────────
t("BAT01 jamb dedupe never depends on the order openings were drawn (contained jamb counted once either way)", () => {
  const A = { id: "A", x0: 1500, y0: 900, x1: 2100, y1: 2100 }, B = { id: "B", x0: 2100, y0: 600, x1: 2700, y1: 2100 };
  const L = layer({ openingMembers: { edges: ["left", "right"] }, maxSpacingMm: 2000 });
  const ab = supportGrid(WALL, [A, B], L), ba = supportGrid(WALL, [B, A], L);
  assert.equal(total(linear(ab)), total(linear(ba)));
  const at2100 = linear(ab).filter((d) => d.role.startsWith("jamb") && d.sourceRefs[0].station === 2100);
  assert.deepEqual(at2100.map((d) => d.lengthMm), [1500], "B's longer jamb hosts A's contained one");
  assert.deepEqual([...new Set(linear(ab).map((d) => d.id))].sort(), [...new Set(linear(ba).map((d) => d.id))].sort());
});
t("BAT01 partial overlap is kept and flagged, never silently merged or dropped", () => {
  const A = { id: "A", x0: 1500, y0: 900, x1: 2100, y1: 2100 }, B = { id: "B", x0: 2100, y0: 1500, x1: 2700, y1: 2400 };
  const r = supportGrid(WALL, [A, B], layer({ openingMembers: { edges: ["left", "right"] }, maxSpacingMm: 2000 }));
  assert.equal(linear(r).filter((d) => d.role.startsWith("jamb") && d.sourceRefs[0].station === 2100).length, 2);
  assert.ok(r.problems.some((p) => p.code === "members-overlap" && p.blocking === false));
});
t("BAT01 existing layer: nothing purchased even with perimeter members and fixings; no fixing demand", () => {
  const r = supportGrid(WALL, [W1], layer({ existing: true, openingMembers: { edges: ["left", "right", "head", "sill"] } }));
  assert.equal(r.demands.length, 0);
  assert.ok(r.layout.lines.length > 9);
  assert.equal(r.layout.fixings["support-to-frame"].state, "existing-supports");
});
t("B1 stations closer than 0.001 mm still get distinct, stable demand ids", () => {
  const r = supportGrid(WALL, [], layer({ requiredStationsMm: [1000, 1000.0004] }));
  uniqueIds(r);
  assert.deepEqual(supportGrid(WALL, [], layer({ requiredStationsMm: [1000, 1000.0004] })).demands.map((d) => d.id), r.demands.map((d) => d.id), "deterministic");
});

t("C0 wall.js opening form {xMm, sillMm, widthMm, heightMm} is placed where it is; a size without a position is rejected, never put at the origin", () => {
  const wallJs = { id: "W1", xMm: 1500, sillMm: 900, widthMm: 900, heightMm: 1200 };
  const a = supportGrid(WALL, [wallJs], layer()), b = supportGrid(WALL, [W1], layer());
  assert.deepEqual(a.demands.map((d) => [d.id, d.lengthMm]), b.demands.map((d) => [d.id, d.lengthMm]));
  const unplaced = { id: "W1", widthMm: 900, heightMm: 1200 };
  const s = supportGrid(WALL, [unplaced], layer());
  assert.ok(codes(s).includes("opening-invalid"));
  assert.equal(s.status.quantity, "incomplete");
  assert.ok(!linear(s).some((d) => d.sourceRefs[0].station === 600 && d.lengthMm < 2700), "no phantom cut at the wall origin");
  const acc = accessoryRoutes(WALL, [unplaced], {}, recipe({ id: "wrap", kind: "membrane", mode: "estimate", openingPolicy: "deduct", identity: { sku: "w" } }));
  assert.equal(acc.layout.areas.openingM2, 0);
  assert.equal(acc.status.quantity, "incomplete");
  assert.ok(codes(childFlashingDemands([unplaced], TEMPLATE)).includes("opening-invalid"));
  assert.equal(childFlashingDemands([wallJs], TEMPLATE).demands[0].lengthMm, 900);
});

// ── B1 required stations: never snapped, incompatible constraints reported ─────────────────────────────────────
t("B1 a joint 1 mm from the wall end under a 70 mm minimum gap is kept and reported, not merged into the end", () => {
  const r = requiredStations({ fromMm: 0, toMm: 4800, requiredMm: [{ atMm: 1, ref: "PJ0" }], maxSpacingMm: 600, minGapMm: 70 });
  assert.ok(r.stations.some((s) => s.atMm === 1 && s.refs.includes("PJ0")));
  assert.ok(r.stations.some((s) => s.atMm === 0));
  assert.ok(r.problems.some((p) => p.code === "required-stations-conflict" && p.blocking));
});
t("B1 when equal bays cannot satisfy both max spacing and minimum gap, a blocking incompatibility is raised", () => {
  const r = requiredStations({ fromMm: 0, toMm: 1210, maxSpacingMm: 600, minGapMm: 500 });
  assert.ok(r.problems.some((p) => p.code === "spacing-constraints-incompatible" && p.blocking));
  assert.ok(supportGrid({ id: "N", widthMm: 1210, heightMm: 2700 }, [], layer({ minGapMm: 500 })).status.quantity === "incomplete");
});
t("B2 a required joint exactly on a zone transition keeps both roles and the zone row", () => {
  const r = requiredStations({ fromMm: 0, toMm: 4800, requiredMm: [{ atMm: 1200, ref: "PJ1" }], maxSpacingMm: 600, zones: [{ fromMm: 0, toMm: 1200, maxSpacingMm: 300, ruleRef: "Z" }] });
  const s = r.stations.filter((x) => x.atMm === 1200);
  assert.equal(s.length, 1);
  assert.deepEqual([...s[0].kinds].sort(), ["required", "transition"]);
  assert.equal(s[0].zoneRef, "Z");
});
t("B1 a spacing value that is not a number is unresolved — no default spacing is invented", () => {
  for (const sp of ["600", null, NaN]) {
    const r = supportGrid(WALL, [], layer({ maxSpacingMm: sp }));
    assert.equal(linear(r).length, 0);
    assert.ok(codes(r).includes("support-spacing-unresolved") || codes(r).includes("invalid-input"));
    assert.equal(r.status.quantity, "incomplete");
  }
});
t("B1 cut-backs, joint gaps and offsets are validated: a support never extends past the wall", () => {
  for (const over of [{ endCutsMm: { start: -100 } }, { endCutsMm: { end: NaN } }, { breaks: [{ atMm: 1000, gapMm: -50 }] }, { startOffsetMm: -1 }]) {
    const r = supportGrid(WALL, [], layer(over));
    assert.ok(codes(r).includes("invalid-input"), JSON.stringify(over));
    assert.equal(r.demands.length, 0);
  }
  const ok = supportGrid(WALL, [W1], layer({ endCutsMm: { start: 10, end: 10 }, openingGapMm: 5 }));
  assert.ok(ok.layout.lines.every((l) => l.fromMm >= 10 - 1e-9 && l.toMm <= 2690 + 1e-9));
  assert.deepEqual(linear(ok).filter((d) => d.sourceRefs[0].station === 1800).map((d) => d.lengthMm), [885, 585]);
});
t("B1 element limit counts generated pieces (plies, breaks), not just stations — rejected, never truncated", () => {
  const r = supportGrid(WALL, [], layer({ breaks: [{ atMm: 1350 }] }), { maxElements: 14 });
  assert.ok(codes(r).includes("too-many-elements"));
  assert.equal(r.demands.length, 0);
  assert.equal(r.status.quantity, "incomplete");
  assert.equal(MAX_ELEMENTS_PER_WALL, 5000);
});
t("B1 a panel joint shares one support only if both panel edges fit its face; otherwise double/wider is required", () => {
  const joint = (plies) => ({ atMm: 2400, ref: "PJ", minFaceWidthMm: 45, plies });
  const narrow = supportGrid(WALL, [], layer({ faceWidthMm: 35, requiredStationsMm: [joint(1)] }));
  assert.ok(narrow.problems.some((p) => p.code === "joint-support-too-narrow" && p.blocking));
  assert.equal(narrow.status.quantity, "incomplete");
  const doubled = supportGrid(WALL, [], layer({ faceWidthMm: 35, requiredStationsMm: [joint(2)] }));
  assert.ok(!codes(doubled).includes("joint-support-too-narrow"));
  assert.equal(linear(doubled).filter((d) => d.sourceRefs[0].station === 2400).length, 2);
  assert.equal(doubled.status.quantity, "calculated");
  assert.ok(codes(supportGrid(WALL, [], layer({ requiredStationsMm: [joint(1)] }))).includes("support-face-width-missing"));
  assert.ok(!codes(supportGrid(WALL, [], layer({ faceWidthMm: 70, requiredStationsMm: [joint(1)] }))).includes("joint-support-too-narrow"));
});
t("B1 rake lengths stay unrounded (exact clipped geometry, no display rounding)", () => {
  const rake = { id: "R", polygon: [{ x: 0, y: 0 }, { x: 4700, y: 0 }, { x: 4700, y: 3500 }, { x: 0, y: 2400 }] };
  const ds = linear(supportGrid(rake, [], layer({ stockPolicy: { kind: "list", lengthsMm: [3600] } })));
  ds.forEach((d) => { const x = d.sourceRefs[0].station; near(d.lengthMm, 2400 + (1100 * x) / 4700, 1e-9); });
  assert.ok(ds.some((d) => !Number.isInteger(d.lengthMm)), "fractional lengths are kept");
});

// ── B3 procurement ───────────────────────────────────────────────────────────────────────────────────────────
t("B3 a broken stock list never silently skips the needs-joint-detail check (missing-product instead)", () => {
  for (const sp of [{ kind: "list", lengthsMm: [2700, "x"] }, { kind: "list", lengthsMm: [0] }, { kind: "fixed", lengthMm: -1 }, { kind: "grid", maxMm: "4800" }, { kind: "mystery" }]) {
    assert.equal(maxStockLengthMm(sp), null, JSON.stringify(sp));
    const r = supportGrid({ id: "T", widthMm: 1200, heightMm: 3600 }, [], layer({ stockPolicy: sp }));
    assert.ok(codes(r).includes("stock-policy-missing"));
    assert.equal(r.status.procurement, "missing-product");
  }
  assert.equal(maxStockLengthMm({ kind: "grid", minMm: 1200, incrementMm: 600 }), Infinity);
});
t("B3 summed LM is never divided by stock length: three short pieces stay three demands", () => {
  const r = supportGrid({ id: "S", widthMm: 1200, heightMm: 900 }, [], layer({ stockPolicy: { kind: "list", lengthsMm: [2700] } }));
  assert.equal(linear(r).length, 3);
  assert.ok(linear(r).every((d) => d.quantity === 1 && d.lengthMm === 900 && d.unit === "piece" && d.noSplice));
});
t("B3 entered rail count longer than stock needs a joint detail; missing stock policy is missing-product; lines link to the demand", () => {
  const manual = (over) => supportGrid(WALL, [], layer({ maxSpacingMm: undefined, manualLayout: { count: 4, lengthMm: 4800, authority: { kind: "project-detail", ref: "Walsc rail layout B" } }, ...over }));
  const long = manual({});
  assert.ok(long.problems.some((p) => p.code === "needs-joint-detail" && p.blocking));
  assert.equal(long.status.quantity, "incomplete");
  const nostock = manual({ stockPolicy: undefined });
  assert.equal(nostock.status.procurement, "missing-product");
  assert.ok(nostock.layout.lines.every((l) => l.demandId === nostock.demands[0].id));
  const zoned = manual({ stockPolicy: { kind: "list", lengthsMm: [6000] }, edgeZones: [{ fromMm: 0, toMm: 1200, maxSpacingMm: 300, ruleRef: "Z", fixing: pitch(200) }] });
  assert.ok(zoned.problems.some((p) => p.code === "zone-needs-stations" && p.message.includes(FIXINGS_NOT_QUANTIFIED)));
  assert.equal(role(zoned, "fixing-support-to-frame").length, 0, "zone rows are never replaced by the general fixing");
});
t("B3 entered stations off the wall are blocking; entered stations still take their zone's fixing row", () => {
  const off = supportGrid(WALL, [], layer({ maxSpacingMm: undefined, manualLayout: { stationsMm: [-500, 0, 2400], authority: { kind: "project-detail", ref: "rev A" } } }));
  assert.ok(codes(off).includes("manual-station-outside"));
  assert.equal(off.status.quantity, "incomplete");
  const ZONE = { fromMm: 0, toMm: 1200, maxSpacingMm: 300, ruleRef: "Z", fixing: pitch(200) };
  const r = supportGrid(WALL, [], layer({ maxSpacingMm: undefined, edgeZones: [ZONE], manualLayout: { stationsMm: [0, 300, 600, 1200, 2400], authority: { kind: "project-detail", ref: "rev A" } } }));
  const f = role(r, "fixing-support-to-frame");
  assert.equal(f.find((d) => /zone0/.test(d.id)).quantity, 4 * fixingsAlongLine(2700, 200));
  assert.equal(f.find((d) => /general/.test(d.id)).quantity, fixingsAlongLine(2700, 400));
});

// ── B4 fasteners ─────────────────────────────────────────────────────────────────────────────────────────────
t("B4 two INDEPENDENT demands: cladding-to-support by intersections with cladding rows, unaffected by the frame fixing", () => {
  const rows = [150, 450, 750, 1050, 1350, 1650, 1950, 2250, 2550];
  const clad = { mode: "intersections", edgeStartMm: 0, edgeEndMm: 0, perPoint: 2, identity: NAIL };
  const a = supportGrid(WALL, [], layer({ claddingFixing: clad, claddingLayout: { rowsMm: rows } }));
  assert.equal(role(a, "fixing-cladding-to-support")[0].quantity, 9 * rows.length * 2);
  const b = supportGrid(WALL, [], layer({ fixing: pitch(300), claddingFixing: clad, claddingLayout: { rowsMm: rows } }));
  assert.equal(role(b, "fixing-cladding-to-support")[0].quantity, role(a, "fixing-cladding-to-support")[0].quantity);
  assert.notEqual(role(b, "fixing-support-to-frame")[0].quantity, role(a, "fixing-support-to-frame")[0].quantity);
  assert.notEqual(role(a, "fixing-cladding-to-support")[0].id, role(a, "fixing-support-to-frame")[0].id);
  const win = supportGrid(WALL, [W1], layer({ claddingFixing: clad, claddingLayout: { rowsMm: rows } }));
  assert.equal(win.layout.lines.find((l) => l.atMm === 1800 && l.fromMm === 0).claddingFixings, 3 * 2, "rows inside the window are not fixed");
});
t("B4 panel-edge pitch: each panel's stretch of support is fixed end to end separately (n = ceil(U/p)+1 per panel)", () => {
  const r = supportGrid(WALL, [], layer({ claddingFixing: pitch(200, { edgeStartMm: 10, edgeEndMm: 10, identity: NAIL }), claddingLayout: { panelJointsMm: [1350] } }));
  assert.equal(role(r, "fixing-cladding-to-support")[0].quantity, 9 * 2 * fixingsAlongLine(1330, 200));
  const whole = supportGrid(WALL, [], layer({ claddingFixing: pitch(200, { edgeStartMm: 10, edgeEndMm: 10, identity: NAIL }) }));
  assert.equal(role(whole, "fixing-cladding-to-support")[0].quantity, 9 * fixingsAlongLine(2680, 200));
});
t("B4 cladding fixing named but unspecified is 'not quantified', never 0; by-others is an omitted scope", () => {
  const r = supportGrid(WALL, [], layer({ claddingFixing: null }));
  assert.ok(r.problems.some((p) => p.code === "fixings-not-quantified" && p.message.includes(FIXINGS_NOT_QUANTIFIED)));
  assert.equal(r.status.quantity, "incomplete");
  assert.equal(r.layout.fixings["cladding-to-support"].state, "not-quantified");
  sane(r);
  const byOthers = supportGrid(WALL, [], layer({ claddingFixingScope: { status: "by-others", reason: "cladder supplies nails" } }));
  assert.deepEqual([byOthers.layout.fixings["cladding-to-support"].state, byOthers.status.quantity], ["omitted", "calculated"]);
  assert.equal(supportGrid(WALL, [], layer()).layout.fixings["cladding-to-support"].state, "not-in-layer");
});
t("BAT02 the zone row's cladding fixing is used in the zone; a zone row without one is incomplete (never borrows)", () => {
  const ZONE = { fromMm: 0, toMm: 1200, maxSpacingMm: 300, ruleRef: "Z", fixing: pitch(200) };
  const clad = pitch(300, { identity: NAIL });
  const missing = supportGrid(WALL, [], layer({ edgeZones: [ZONE], claddingFixing: clad }));
  assert.ok(missing.problems.some((p) => p.code === "zone-tuple-incomplete" && /cladding fixing/.test(p.message)));
  assert.equal(role(missing, "fixing-cladding-to-support").length, 1, "only the general tuple");
  assert.equal(missing.status.quantity, "incomplete");
  const full = supportGrid(WALL, [], layer({ edgeZones: [{ ...ZONE, claddingFixing: pitch(150, { identity: NAIL }) }], claddingFixing: clad }));
  assert.equal(role(full, "fixing-cladding-to-support").find((d) => /zone0/.test(d.id)).quantity, 5 * fixingsAlongLine(2700, 150));
});
t("B4 support spacing is never used as the frame-fixing pitch: intersections without frame positions are not quantified", () => {
  const r = supportGrid(WALL, [], layer({ orientation: "horizontal", stockPolicy: { kind: "list", lengthsMm: [5400] }, fixing: { mode: "intersections", edgeStartMm: 0, edgeEndMm: 0, identity: SCREW } }));
  assert.equal(role(r, "fixing-support-to-frame").length, 0);
  assert.ok(r.problems.some((p) => /frame member positions/.test(p.message)));
});
t("B4 corner omissions come from the row; omitting more than a piece has is not quantified", () => {
  const line = [{ id: "a", startMm: 0, endMm: 2700 }];
  assert.equal(fixingsDemand({ id: "f", materialId: "m", role: "fixing-x", label: "x", lines: line, rule: pitch(300, { omitPerLine: 2, extraPerLine: 1 }) }).demand.quantity, 10 - 2 + 1);
  const over = fixingsDemand({ id: "f", materialId: "m", role: "fixing-x", label: "x", lines: [{ id: "a", startMm: 0, endMm: 100 }], rule: pitch(300, { omitPerLine: 3 }) });
  assert.equal(over.demand, null);
  assert.ok(over.problems[0].message.includes(FIXINGS_NOT_QUANTIFIED));
  assert.ok(fixingsDemand({ id: "f", materialId: "m", role: "fixing-x", label: "x", lines: line, rule: pitch(300, { omitPerLine: -1 }) }).problems[0].message.includes("corner omissions"));
});
t("B4 a frame member listed twice is one intersection; no lines is no demand (never a 0-quantity line)", () => {
  const r = fixingsDemand({ id: "f", materialId: "m", role: "fixing-x", label: "x", lines: [{ id: "a", startMm: 0, endMm: 1200 }], rule: { mode: "intersections", targetsMm: [0, 600, 600, 1200, 1200.0000001], edgeStartMm: 0, edgeEndMm: 0, identity: SCREW } });
  assert.equal(r.demand.quantity, 3);
  const none = fixingsDemand({ id: "f", materialId: "m", role: "fixing-x", label: "x", lines: [], rule: pitch(300) });
  assert.deepEqual([none.demand, none.problems.length], [null, 0]);
  assert.ok(fixingsDemand({ id: "f", materialId: "m", role: "fixing-x", label: "x", lines: [{ id: "a", startMm: 0, endMm: 1 }], rule: { mode: "intersections", targetsMm: [0, "x"], edgeStartMm: 0, edgeEndMm: 0, identity: SCREW } }).problems.length);
});
t("B4 tolerance only absorbs float noise: 0.1 mm over a pitch multiple adds a fixing; 1 fixing over a box adds a box", () => {
  assert.equal(fixingsAlongLine(2100.1, 300), 9);
  assert.equal(fixingsAlongLine(0.1 + 0.2 + 2099.7, 300), 8);
  assert.equal(boxesFor(1001, 0, 1000), 2);
  assert.equal(boxesFor(1000, 0.1, 1100), 1, "1000 × 1.1 = 1100.0000000000002 is float noise");
  assert.throws(() => boxesFor(10.5, 0, 100));
});
t("B4 box rounding happens once per job after pooling identical fasteners across walls; bad pack data is a problem, not a crash", () => {
  const walls = ["W1", "W2", "W3"].map((id) => supportGrid({ id, widthMm: 1200, heightMm: 2400 }, [], layer()));
  const ds = walls.flatMap((r) => role(r, "fixing-support-to-frame"));
  const agg = aggregateFixings(ds, () => ({ boxSize: 100, spareRate: 0 }));
  assert.equal(agg.lines.length, 1);
  assert.equal(agg.lines[0].fixings, 3 * 3 * fixingsAlongLine(2400, 400));
  assert.equal(agg.lines[0].boxes, Math.ceil(agg.lines[0].fixings / 100), "one rounding, not one box per wall");
  const bad = aggregateFixings(ds, () => ({ boxSize: 0, spareRate: 0 }));
  assert.equal(bad.lines[0].boxes, null);
  assert.ok(codes(bad).includes("fixing-pack-missing"));
  assert.equal(aggregateFixings(ds, () => ({ boxSize: 100, spareRate: -0.1 })).lines[0].boxes, null);
});

// ── BOM01: consumables, union routes, unknown never zero ─────────────────────────────────────────────────────
t("BOM01 sealant cartridges are exact per wall and rounded once for the job — never 'tubes per wall'", () => {
  const walls = Array.from({ length: 10 }, (_, i) => accessoryRoutes({ id: `W${i}`, widthMm: 1000, heightMm: 2700 }, [], {},
    recipe(sealGroup([{ source: "manual", lengthMm: 1000, beadCount: 1, crossSection: { diameterMm: 6 } }], { cartridgeMl: 300, applicationYield: 1 }))));
  walls.forEach((r) => near(r.demands[0].quantity, sealantVolumeMl({ diameterMm: 6, lengthMm: 1000 }) / 300, 1e-12));
  const lines = aggregateConsumables(mergeAccessoryResults(walls).demands);
  assert.deepEqual(lines.map((l) => [l.unit, l.quantity, l.demandIds.length]), [["cartridge", 1, 10]]);
});
t("BOM01 tape rolls, membrane estimate rolls and reviewed-yield bags are pooled before rounding", () => {
  const groups = [
    { id: "tape", kind: "tape", routes: ["opening-perimeter"], rollLengthMm: 25000, identity: { sku: "tape" } },
    { id: "wrap", kind: "membrane", mode: "estimate", rollWidthMm: 1370, rollLengthMm: 30000, identity: { sku: "wrap" } },
    { id: "glue", kind: "aac-adhesive", basis: "net-area", yield: { per: 5, unit: "bag", reviewed: true, ref: "Walsc guide p.12" }, identity: { sku: "glue" } },
  ];
  const walls = ["A", "B", "C"].map((id) => accessoryRoutes({ id, widthMm: 2400, heightMm: 2700 }, [{ id: "O", x0: 900, y0: 900, x1: 1500, y1: 2100 }], {}, recipe(...groups)));
  const lines = aggregateConsumables(walls.flatMap((r) => r.demands));
  const sku = (x) => lines.find((l) => l.identity.sku === x);
  assert.deepEqual(lines.map((l) => l.unit).sort(), ["bag", "roll", "roll"]);
  assert.equal(sku("tape").quantity, Math.ceil((3 * 3600) / 25000), "1 roll for the job, not 1 per wall");
  assert.equal(sku("wrap").quantity, Math.ceil((3 * 2400 * 2700) / (1370 * 30000)));
  assert.equal(sku("glue").quantity, Math.ceil((3 * (6.48 - 0.72)) / 5), "4 bags, not 3 × ceil(1.152) = 6");
  for (const r of walls) sane(r);
});
t("BOM01 overlapping openings: perimeter routes follow the union (never edged twice); touching frames keep both edges", () => {
  const S = { id: "S", x0: 1500, y0: 900, x1: 2400, y1: 1800 }, S2 = { id: "S2", x0: 1800, y0: 900, x1: 2700, y1: 1800 };
  const perim = (ops, source = "opening-perimeter") => accessoryRoutes(WALL, ops, {}, recipe(sealGroup([{ source, beadCount: 1, crossSection: { areaMm2: 1000 } }]))).demands[0].quantity;
  near(perim([S, S2]), 2 * (1200 + 900));
  near(perim([S, { ...S, id: "S-copy" }]), 2 * (900 + 900), 1e-9);
  const A = { id: "A", x0: 1500, y0: 900, x1: 2100, y1: 2100 }, B = { id: "B", x0: 2100, y0: 900, x1: 2700, y1: 2100 };
  near(perim([A, B], "opening-jambs"), 4 * 1200);
  const heads = accessoryRoutes(WALL, [S, S2], {}, recipe({ id: "h", kind: "trim", identity: { sku: "h" }, routes: ["opening-head"], stockPolicy: { kind: "fixed", lengthMm: 6000 } }));
  assert.equal(total(heads.demands), 1200);
  const stacked = accessoryRoutes(WALL, [{ id: "lo", x0: 1500, y0: 300, x1: 2400, y1: 1200 }, { id: "hi", x0: 1500, y0: 1200, x1: 2400, y1: 2400 }], {},
    recipe({ id: "h", kind: "trim", identity: { sku: "h" }, routes: ["opening-head", "opening-sill"], stockPolicy: { kind: "fixed", lengthMm: 6000 } }));
  assert.equal(stacked.demands.length, 4, "a head touching the next opening's sill is two real edges");
});
t("BOM01 membrane reveal wrap follows the union perimeter; deduction is the union area — never twice", () => {
  const S = { id: "S", x0: 1500, y0: 900, x1: 2400, y1: 1800 }, S2 = { id: "S2", x0: 1800, y0: 900, x1: 2700, y1: 1800 };
  const r = accessoryRoutes(WALL, [S, S2], {}, recipe({ id: "wrap", kind: "membrane", mode: "estimate", openingPolicy: "deduct", revealWrapMm: 100, identity: { sku: "wrap" } }));
  near(r.demands[0].quantity, 12.96 - 1.08 + (4200 * 100) / 1e6, 1e-9);
});
t("BOM01 a corner shared by two walls is sealed once after merging (shared id), and conflicts are blocking", () => {
  const g = sealGroup([{ id: "corner", source: "corners", beadCount: 1, crossSection: { areaMm2: 100 } }]);
  const a = accessoryRoutes({ id: "W1", widthMm: 3000, heightMm: 2700 }, [], { corners: [{ id: "C1", type: "external", at: "end" }] }, recipe(g));
  const b = accessoryRoutes({ id: "W2", widthMm: 3000, heightMm: 2700 }, [], { corners: [{ id: "C1", type: "external", at: "start" }] }, recipe(g));
  const m = mergeAccessoryResults([a, b]);
  assert.equal(m.demands.length, 1);
  near(m.demands[0].quantity, 270);
  assert.deepEqual(m.demands[0].sourceRefs.map((s) => s.wallId), ["W1", "W2"]);
  const c = accessoryRoutes({ id: "W3", widthMm: 3000, heightMm: 3000 }, [], { corners: [{ id: "C1", type: "external", at: "start" }] }, recipe(g));
  const bad = mergeAccessoryResults([a, c]);
  assert.ok(codes(bad).includes("shared-id-conflict"));
  assert.equal(bad.status.quantity, "incomplete");
});
t("BOM01 distinct walls never merge: ids carry the wall, and a wall without an id is rejected", () => {
  const g = { id: "st", kind: "starter", identity: { sku: "s" }, routes: ["base"], stockPolicy: { kind: "fixed", lengthMm: 6000 } };
  const m = mergeAccessoryResults([accessoryRoutes({ id: "N", widthMm: 3000, heightMm: 2700 }, [], {}, recipe(g)), accessoryRoutes({ id: "S", widthMm: 3000, heightMm: 2700 }, [], {}, recipe(g))]);
  assert.equal(total(m.demands), 6000);
  for (const r of [accessoryRoutes({ widthMm: 3000, heightMm: 2700 }, [], {}, recipe(g)), supportGrid({ widthMm: 3000, heightMm: 2700 }, [], layer())]) {
    assert.ok(codes(r).includes("invalid-input"));
    assert.equal(r.demands.length, 0);
  }
});
t("BOM01 joints: every layout joint needs a unique id (else demand ids collide) — rejected, not merged", () => {
  const g = { id: "hj", kind: "joint-strip", identity: { sku: "h" }, stockPolicy: { kind: "fixed", lengthMm: 3000 } };
  for (const joints of [[{ orientation: "horizontal", atMm: 1200, fromMm: 0, toMm: 2400 }], [{ id: "J", orientation: "horizontal", atMm: 1200, fromMm: 0, toMm: 2400 }, { id: "J", orientation: "horizontal", atMm: 1200, fromMm: 2400, toMm: 4800 }]]) {
    const r = accessoryRoutes(WALL, [], { joints }, recipe(g));
    assert.ok(codes(r).includes("invalid-input"));
    assert.equal(r.demands.length, 0);
  }
});
t("BOM01 duplicate opening ids are blocking and never produce colliding demand ids (supports and accessories)", () => {
  const ops = [{ id: "W", x0: 500, y0: 900, x1: 1100, y1: 2100 }, { id: "W", x0: 3000, y0: 900, x1: 3500, y1: 2100 }];
  const s = supportGrid(WALL, ops, layer({ openingMembers: { edges: ["head"] } }));
  uniqueIds(s);
  assert.ok(codes(s).includes("opening-duplicate-id"));
  assert.equal(s.status.quantity, "incomplete");
  const a = accessoryRoutes(WALL, ops, {}, recipe({ id: "h", kind: "trim", identity: { sku: "h" }, routes: ["opening-head"], stockPolicy: { kind: "fixed", lengthMm: 6000 } }));
  uniqueIds(a);
  assert.equal(a.status.quantity, "incomplete");
  assert.ok(codes(accessoryRoutes(WALL, [], {}, recipe({ id: "x", kind: "manual" }, { id: "x", kind: "manual" }))).includes("invalid-input"), "group ids unique too");
});
t("BOM01 zero-length routes emit no demand (no 0-quantity lines) and unknown kinds are unresolved, not omitted", () => {
  const r = accessoryRoutes(WALL, [], {}, recipe(
    sealGroup([{ source: "corners", beadCount: 1, crossSection: { diameterMm: 6 } }]),
    { id: "tape", kind: "tape", routes: ["opening-perimeter"], rollLengthMm: 25000, identity: { sku: "t" } },
    { id: "mesh", kind: "mesh", basis: "joint-lm", yield: { per: 50, unit: "roll", reviewed: true, ref: "guide" }, identity: { sku: "m" } },
    { id: "odd", kind: "gizmo", identity: { sku: "g" } },
  ));
  assert.equal(r.demands.length, 0);
  sane(r);
  assert.deepEqual(r.layout.readiness.missing, ["odd"]);
  assert.deepEqual(r.layout.readiness.omitted, []);
});
t("BOM01 a stress sweep of recipes never emits 0 / NaN / negative quantities or duplicate ids", () => {
  const walls = [WALL, { id: "R", polygon: [{ x: 0, y: 0 }, { x: 4800, y: 0 }, { x: 4800, y: 3600 }, { x: 0, y: 2400 }] }, { id: "N", widthMm: 300, heightMm: 2700 }];
  const opsets = [[], [W1], [W1, { id: "D", x0: 3000, y0: 0, x1: 3900, y1: 2100 }], [{ id: "X", x0: -100, y0: 2000, x1: 600, y1: 2800 }]];
  for (const w of walls) {
    for (const ops of opsets) {
      const a = accessoryRoutes(w, ops, { joints: [{ id: "J1", orientation: "horizontal", atMm: 1350, fromMm: 0, toMm: 4800 }], corners: [{ id: "C", type: "external", at: "end" }] }, recipe(
        { id: "st", kind: "starter", identity: { sku: "s" }, routes: ["base"], excludeDoors: true, stockPolicy: { kind: "fixed", lengthMm: 3000 }, jointOverlapMm: 50 },
        { id: "hj", kind: "joint-strip", identity: { sku: "j" }, stockPolicy: { kind: "fixed", lengthMm: 3000 }, jointOverlapMm: 0 },
        { id: "co", kind: "corner", cornerType: "external", identity: { sku: "c" }, stockPolicy: { kind: "fixed", lengthMm: 4000 } },
        { id: "wrap", kind: "membrane", mode: "roll", orientation: "horizontal", courseWidthMm: 1370, sideLapMm: 150, endLapMm: 150, rollLengthMm: 30000, identity: { sku: "w" } },
        { id: "tape", kind: "tape", routes: ["opening-perimeter", "membrane-seams"], membraneGroupId: "wrap", rollLengthMm: 25000, identity: { sku: "t" } },
        sealGroup([{ source: "opening-perimeter", beadCount: 2, crossSection: { widthMm: 10, depthMm: 6 } }, { source: "corners", beadCount: 1, crossSection: { diameterMm: 6 } }], { cartridgeMl: 600, applicationYield: 0.85 }),
      ));
      sane(a); uniqueIds(a);
      const s = supportGrid(w, ops, layer({ openingMembers: { edges: ["left", "right", "head", "sill"], extendMm: 45 }, stockPolicy: { kind: "list", lengthsMm: [5400] } }));
      sane(s); uniqueIds(s);
    }
  }
});

// ── BOM02 / B6: child flashings ──────────────────────────────────────────────────────────────────────────────
t("BOM02 a repeated edge is still exactly one demand per opening edge", () => {
  const r = childFlashingDemands([W1], { ...TEMPLATE, edges: ["head", "head", "sill", "sill"] });
  assert.deepEqual(r.demands.map((d) => d.role), ["flashing-head", "flashing-sill"]);
  uniqueIds(r);
});
t("BOM02 tight child never pre-adds the allowance even with custom rules; finished never gets one", () => {
  const rules = { allowanceMm: 300, incrementMm: 100 };
  const tight = childFlashingDemands([W1], { ...TEMPLATE, rules });
  assert.equal(tight.demands[0].lengthMm, 900);
  const once = measuredRunResult(tight.demands[0].lengthMm, rules);
  assert.equal(once.finishedLengthMm - tight.demands[0].lengthMm, 300, "allowance applied once, downstream");
  const fin = childFlashingDemands([W1], { ...TEMPLATE, rules, lengthKind: LENGTH_KINDS.FINISHED, extensionsMm: { head: { startMm: 50, endMm: 50 } } });
  assert.equal(fin.demands[0].lengthMm, 1000);
  assert.equal(manualPieceResult(fin.demands[0].lengthMm, 1, rules).finishedLengthMm, 1000);
});
t("BOM02 overlapping openings get no child flashings (blocking) — never two flashings over one stretch; others still generate", () => {
  const S = { id: "S", x0: 1500, y0: 900, x1: 2400, y1: 1800 }, S2 = { id: "S2", x0: 1800, y0: 900, x1: 2700, y1: 1800 };
  const r = childFlashingDemands([S, S2, { id: "far", x0: 3500, y0: 900, x1: 4000, y1: 1800 }], TEMPLATE);
  assert.deepEqual(r.demands.map((d) => d.sourceRefs[0].openingId), ["far"]);
  assert.ok(r.problems.some((p) => p.code === "openings-overlap" && p.blocking));
  assert.equal(r.status.quantity, "incomplete");
  const touching = childFlashingDemands([{ id: "A", x0: 1500, y0: 900, x1: 2100, y1: 2100 }, { id: "B", x0: 2100, y0: 900, x1: 2700, y1: 2100 }], TEMPLATE);
  assert.equal(touching.demands.length, 2, "touching openings are separate frames");
});
t("BOM02 an undecided hand-measured equivalent leaves quantity incomplete (blocking), not calculated", () => {
  const r = childFlashingDemands([W1], { ...TEMPLATE, manualEquivalents: [{ openingId: "W1", edge: "head", measurementId: "M7" }] });
  assert.equal(r.status.quantity, "incomplete");
  const g = accessoryRoutes(WALL, [W1], {}, recipe({ id: "hf", kind: "flashing", template: { ...TEMPLATE, manualEquivalents: [{ openingId: "W1", edge: "head", measurementId: "M7" }] } }));
  assert.deepEqual(g.layout.readiness.missing, ["hf"]);
  const numeric = childFlashingDemands([{ ...W1, id: 7 }], { ...TEMPLATE, manualEquivalents: [{ openingId: 7, edge: "head", measurementId: "M7", choice: "use-manual" }] });
  assert.equal(numeric.demands.length, 0, "numeric opening ids still link to their equivalent");
});
t("BOM02 child flashings need wall ids and unique opening ids; regeneration keeps ids stable", () => {
  const r = childFlashingDemands([W1], { ...TEMPLATE, wallId: undefined });
  assert.deepEqual([r.demands.length, r.status.quantity], [0, "incomplete"]);
  assert.ok(codes(r).includes("wall-id-missing"));
  const dup = childFlashingDemands([W1, { ...W1, x0: 3000, x1: 3600 }], TEMPLATE);
  assert.equal(dup.demands.length, 1);
  assert.ok(codes(dup).includes("opening-duplicate-id"));
  const a = childFlashingDemands([W1], TEMPLATE), b = childFlashingDemands([{ ...W1, y1: 2200, x1: 2500 }], TEMPLATE);
  assert.deepEqual(a.demands.map((d) => d.id), b.demands.map((d) => d.id));
  assert.equal(b.demands[0].lengthMm, 1000);
});
t("BOM02 accessory flashing group: invalid / off-wall openings never get a child; openingIds selects openings", () => {
  const off = accessoryRoutes(WALL, [{ id: "O", x0: 5000, y0: 900, x1: 5600, y1: 2100 }, W1], {}, recipe({ id: "hf", kind: "flashing", template: TEMPLATE }));
  assert.deepEqual(off.demands.map((d) => d.sourceRefs[0].openingId), ["W1"]);
  assert.equal(off.status.quantity, "incomplete");
  const sel = accessoryRoutes(WALL, [W1, { id: "W2", x0: 3000, y0: 900, x1: 3600, y1: 2100 }], {}, recipe({ id: "hf", kind: "flashing", openingIds: ["W2"], template: TEMPLATE }));
  assert.deepEqual(sel.demands.map((d) => d.sourceRefs[0].openingId), ["W2"]);
});

// ── statuses, merging, invalid input ─────────────────────────────────────────────────────────────────────────
t("06 merge: installation is out-of-scope only when every part is; otherwise the weakest axis wins", () => {
  const oos = accessoryRoutes(WALL, [], {}, recipe({ id: "v", kind: "vent", scope: { status: "exclude", reason: "not required" } }));
  assert.equal(oos.status.installation, "out-of-scope");
  assert.equal(mergeAccessoryResults([oos, oos]).status.installation, "out-of-scope");
  const pending = accessoryRoutes({ id: "W2", widthMm: 1000, heightMm: 1000 }, [], {}, { authority: { kind: "rule", ref: "H04", reviewed: false }, groups: [sealGroup([{ source: "manual", lengthMm: 100, beadCount: 1, crossSection: { diameterMm: 6 } }])] });
  assert.equal(mergeAccessoryResults([oos, pending]).status.installation, "source-pending");
});
t("Invalid or null inputs never throw out of the methods; they return a blocking invalid-input problem", () => {
  const cases = [
    () => supportGrid(WALL, [], null), () => supportGrid(null, [], layer()), () => supportGrid({ id: "Z", widthMm: 0, heightMm: 2700 }, [], layer()),
    () => supportGrid({ id: "B", polygon: [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }] }, [], layer()),
    () => supportGrid(WALL, [], layer({ edgeZones: [null] })), () => supportGrid(WALL, [], layer({ requiredStationsMm: [null] })),
    () => supportGrid(WALL, [], layer({ requiredStationsMm: [{ atMm: 100, minFaceWidthMm: -5 }] })), () => supportGrid(WALL, [], layer({ claddingLayout: { rowsMm: "150" }, claddingFixing: pitch(200) })),
    () => supportGrid(WALL, [], layer({ claddingFixingScope: { status: "maybe" } })), () => supportGrid(WALL, [], layer({ faceWidthMm: 0 })),
    () => accessoryRoutes(WALL, [], {}, null), () => accessoryRoutes(null, [], {}, recipe()), () => accessoryRoutes(WALL, [], { joints: [null] }, recipe({ id: "j", kind: "joint-strip", identity: {} })),
    () => accessoryRoutes(WALL, [], {}, recipe({ id: "s", kind: "sealant", identity: {}, routes: [{ source: "nowhere", beadCount: 1, crossSection: { diameterMm: 6 } }] })),
    () => childFlashingDemands(null, null), () => childFlashingDemands([null], TEMPLATE),
  ];
  for (const [i, f] of cases.entries()) {
    let r;
    assert.doesNotThrow(() => { r = f(); }, `case ${i}`);
    assert.ok(r.problems.length || r.demands.length === 0, `case ${i}`);
    assert.ok(!r.demands.some((d) => !(d.quantity > 0)), `case ${i}`);
  }
  assert.equal(supportGrid(WALL, [], null).status.quantity, "incomplete");
  assert.throws(() => sealantVolumeMl({ diameterMm: 0, lengthMm: 100 }));
  assert.throws(() => sealantVolumeMl({ diameterMm: 6, lengthMm: -1 }));
  assert.throws(() => fixingsAlongLine(-1, 300));
  assert.throws(() => aggregateConsumables([{ id: "x", kind: "count", unit: "roll", quantity: NaN }]));
});

console.log(`takeoff-tc-supports-adv: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
