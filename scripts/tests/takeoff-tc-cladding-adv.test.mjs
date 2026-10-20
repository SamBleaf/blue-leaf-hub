// TC-R04 cladding engine — ADVERSARIAL suite (verifier). Each test tries to break a spec rule in 04 §C0–C6,
// 06 (statuses, identity, limits), 10 (scope status) and 12 (Rendex) against the PRODUCTION functions in
// shared/takeoff/engine/{wall,cladding}.js: boundary/invalid inputs, "never" rules, spec closed-form counts
// swept over many inputs, independent geometry oracles, and one test per defect found in review.
//   node scripts/tests/takeoff-tc-cladding-adv.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildWall, normaliseOpenings, wallAreas, MAX_OPENINGS_PER_WALL } from "../../shared/takeoff/engine/wall.js";
import {
  sheetLayout, courseLayout, panelGrid, aacPanelLayout, areaToLinear, selectInstallationRule, MAX_ELEMENTS_PER_WALL,
} from "../../shared/takeoff/engine/cladding.js";
import { identityKey, QUANTITY_STATUS, INSTALLATION_STATUS, PROCUREMENT_STATUS, UNITS } from "../../shared/takeoff/engine/contract.js";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

const TC = new URL("../../docs/takeoff/TC-R04/", import.meta.url);
const CATALOGUE = JSON.parse(readFileSync(new URL("catalogue-seed.json", TC), "utf8"));
const P = (id) => { const p = CATALOGUE.products.find((x) => x.id === id); assert.ok(p, `catalogue has ${id}`); return p; };
const ASSEMBLY = (id) => CATALOGUE.assemblyCandidates.find((a) => a.id === id);
const AXON133 = ["axon-403931", "axon-403932", "axon-403933", "axon-404979"].map(P);
const AXON400 = ["axon-404417", "axon-404418", "axon-404419"].map(P);
const WALSC50 = ["walsc50-2200", "walsc50-2400", "walsc50-2550", "walsc50-2700", "walsc50-2850", "walsc50-3000"].map(P);
const MATRIX1190 = P("matrix-403811");
const STRIA = P("stria-405504");

const rect = (w, h, id = "W1") => buildWall({ id, kind: "rect", widthMm: w, heightMm: h });
const of = (res, role) => res.demands.filter((d) => d.role === role);
const codes = (res) => res.problems.map((p) => p.code);
const close = (a, e, msg) => assert.ok(Math.abs(a - e) <= Math.max(1e-6, 1e-9 * Math.abs(e)), `${msg ?? ""} ${a} ≠ ${e}`);
const total = (ds) => ds.reduce((s, d) => s + d.lengthMm * d.quantity, 0);
let seed = 4207;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

function checkContract(res) {
  assert.ok(QUANTITY_STATUS.includes(res.status.quantity) && INSTALLATION_STATUS.includes(res.status.installation) && PROCUREMENT_STATUS.includes(res.status.procurement));
  const ids = new Set();
  for (const d of res.demands) {
    assert.ok(!ids.has(d.id), `duplicate demand id ${d.id}`); ids.add(d.id);
    assert.ok(UNITS.includes(d.unit) && Number.isFinite(d.quantity) && d.quantity > 0, `${d.id} quantity/unit`);
    assert.ok(Array.isArray(d.sourceRefs) && d.sourceRefs.length);
  }
  for (const p of res.problems) assert.ok(typeof p.blocking === "boolean" && ["quantity", "installation", "procurement"].includes(p.axis), p.code);
  return res;
}

/** A fully stated assembly with one active row (what a reviewed catalogue entry would look like). */
const reviewedAssembly = (base, extra = {}) => {
  const a = { ...ASSEMBLY(base), activeInstallationRows: [{ id: `${base}-row`, verificationState: "active", conditions: { wind: "N2" } }], ...extra };
  return { assembly: a, conditions: Object.fromEntries(a.requiredSelectors.map((s) => [s, s === "wind" ? "N2" : "x"])) };
};

// ── D1  unresolved installation inputs can never sit under "supported-by-selected-rule" ────────────────
t("D1 AAC: an active rule with unresolved rails / fixings / control joints stays source-pending (unreviewed spacing blocks verification)", () => {
  const inst = reviewedAssembly("walsc50", { productVariantIds: WALSC50.map((p) => p.id), orientation: "vertical" });
  const w = rect(6018, 2700); // (6018 + 2) / 602 = 10 exact columns: no cut-strip review flag can mask the check
  const bare = checkContract(aacPanelLayout(w, [], WALSC50, { adhesiveJointMm: 2, installation: inst }));
  assert.ok(!codes(bare).some((c) => c === "cut_panel_needs_review" || c === "narrow_strip"));
  assert.equal(bare.status.installation, "source-pending");
  const authority = { ref: "Walsc EWS50 guide rev 2026 p.14", reviewer: "SM" };
  const done = checkContract(aacPanelLayout(w, [], WALSC50, {
    adhesiveJointMm: 2, installation: inst, rails: { atMm: [300, 1350, 2400], authority },
    reviewedComponents: [
      { group: "fixings", quantity: 120, unit: "piece", authority },
      { group: "control-joint", scope: "not-required", authority },
    ],
  }));
  assert.ok(!codes(done).includes("fixing_row_missing") && !codes(done).includes("rails_unresolved"));
  assert.equal(done.status.installation, "supported-by-selected-rule");
  assert.equal(done.layout.components.find((c) => c.group === "control-joint").state, "not-required");
});
t("D1 Rendex: an active rule with no reviewed fixing row is not 'supported'", () => {
  const rx = { id: "rx", family: "eps-cladding", manufacturer: "Rendex", name: "EPS", sku: "RX", dimensionsMm: { length: 2400, width: 1200, thickness: 75 }, effectiveCoverMm: 1200, coating: "factory", permittedOrientations: ["vertical"] };
  const inst = reviewedAssembly("rendex-eps", { productVariantIds: ["rx"], orientation: "vertical" });
  assert.equal(sheetLayout(rect(4800, 2400), [], rx, { installation: inst }).status.installation, "source-pending");
});

// ── D2  assembly coverage: brands, families and wall systems are never mixed through an assembly ────────
t("D2 Walsc panels under the seed Hebel assembly (no product list) can never reach supported-by-selected-rule", () => {
  const inst = reviewedAssembly("hebel50");
  const r = aacPanelLayout(rect(6018, 2700), [], WALSC50, { adhesiveJointMm: 2, installation: inst });
  assert.notEqual(r.status.installation, "supported-by-selected-rule");
  assert.ok(codes(r).includes("assembly_coverage_unstated"));
});
t("D2 Axon sheets under the Rendex EPS assembly → family mismatch (unspecified), never verified", () => {
  const r = sheetLayout(rect(4800, 2700), [], AXON133, { installation: reviewedAssembly("rendex-eps") });
  assert.equal(r.status.installation, "unspecified"); assert.ok(codes(r).includes("assembly_family_mismatch"));
  assert.equal(r.status.quantity, "calculated", "an installation mismatch never blocks the sheet count");
});

// ── D3  C3: vertical and horizontal installation assemblies are independent ───────────────────────────
t("D3 horizontal courses under a vertical-board assembly → orientation mismatch; unstated orientation is capped", () => {
  const vert = reviewedAssembly("stria-smooth-vertical", { productVariantIds: [STRIA.id], orientation: "vertical" });
  const r = courseLayout(rect(3000, 3000), [], STRIA, { orientation: "horizontal", installation: vert });
  assert.equal(r.status.installation, "unspecified"); assert.ok(codes(r).includes("assembly_orientation_mismatch"));
  const unstated = reviewedAssembly("stria-smooth-horizontal", { productVariantIds: [STRIA.id] });
  assert.equal(courseLayout(rect(3000, 3000), [], STRIA, { orientation: "horizontal", installation: unstated }).status.installation, "source-pending");
  const exact = reviewedAssembly("stria-smooth-horizontal", { productVariantIds: [STRIA.id], orientation: "horizontal" });
  assert.equal(courseLayout(rect(3000, 3000), [], STRIA, { orientation: "horizontal", installation: exact }).status.installation, "supported-by-selected-rule");
});
t("D3 rule selector: two matching active rows are ambiguous; null inputs never throw", () => {
  const a = { id: "x", method: "m", requiredSelectors: [], activeInstallationRows: [{ id: "1", verificationState: "active" }, { id: "2", verificationState: "active" }] };
  const r = selectInstallationRule({ assembly: a, conditions: {} }, { method: "m" });
  assert.equal(r.status, "source-pending"); assert.deepEqual(r.problems.map((p) => p.code), ["installation_rule_ambiguous"]);
  assert.equal(selectInstallationRule(null, null).status, "unspecified");
  assert.equal(selectInstallationRule({ assembly: "axon" }).status, "unspecified");
});

// ── D4  Rendex factory vs applicator coating scope ─────────────────────────────────────────────────────
const rendex = (over = {}) => ({ id: "rendex-job", family: "eps-cladding", manufacturer: "Rendex", name: "EPS sheet (job-entered)", sku: "RX-JOB",
  dimensionsMm: { length: 2400, width: 1200, thickness: 75 }, effectiveCoverMm: 1200, coating: "applicator", permittedOrientations: ["vertical"], ...over });
t("D4 factory-coated: a reviewed site basecoat is honoured (never silently dropped); joint mesh stays unresolved, not zero", () => {
  const r = checkContract(sheetLayout(rect(4800, 2400), [], rendex({ coating: "factory" }), {
    reviewedComponents: [{ group: "basecoat", quantity: 2, unit: "bag", authority: { ref: "Rendex joint detail J3", reviewer: "SM" } }],
  }));
  assert.equal(of(r, "basecoat").length, 1); assert.equal(of(r, "basecoat")[0].provenance, "manual");
  const state = Object.fromEntries(r.layout.components.map((c) => [c.group, c.state]));
  assert.deepEqual(state, { fixings: "unresolved", "joint-treatment": "unresolved", mesh: "unresolved", basecoat: "manual", "finish-coat": "not-required" });
  assert.equal(of(r, "finish-coat").length, 0, "factory finish is never ordered twice");
});
t("D4 applicator-coated: coating stays NET area even when the layout uses the no-deduction opening policy", () => {
  const r = sheetLayout(rect(4800, 2400), [{ id: "W", xMm: 1350, sillMm: 900, widthMm: 900, heightMm: 900 }], rendex(), { openingPolicy: "none" });
  close(of(r, "basecoat")[0].quantity, 4.8 * 2.4 - 0.81); assert.equal(of(r, "sheet").length, 4);
});

// ── D5  dimensional impossibility: effective cover wider than the piece ────────────────────────────────
t("D5 effective cover wider than the physical sheet/board is blocked (would under-order)", () => {
  const r = sheetLayout(rect(4800, 2400), [], rendex({ effectiveCoverMm: 1500 }), {});
  assert.equal(r.status.quantity, "incomplete"); assert.equal(r.demands.length, 0); assert.ok(codes(r).includes("product_parameter_invalid"));
  const b = courseLayout(rect(2400, 3000), [], { ...STRIA, effectiveCoverMm: 330 }, { orientation: "horizontal" });
  assert.ok(codes(b).includes("product_parameter_invalid")); assert.equal(b.demands.length, 0);
  assert.equal(of(sheetLayout(rect(4800, 2400), [], rendex({ effectiveCoverMm: 1200 }), {}), "sheet").length, 4, "cover = width is fine");
});

// ── D6  reviewed manual quantities ─────────────────────────────────────────────────────────────────────
t("D6 duplicate manual ids and fractional counted units are rejected; demand ids stay unique", () => {
  const authority = { ref: "doc", reviewer: "SM" };
  const r = checkContract(sheetLayout(rect(4800, 2400), [], rendex(), { reviewedComponents: [
    { group: "fixings", id: "a", quantity: 5, unit: "piece", authority }, { group: "fixings", id: "a", quantity: 6, unit: "piece", authority },
    { group: "joint-treatment", quantity: 2.5, unit: "cartridge", authority }, { group: "mesh", quantity: 12.5, unit: "m2", authority },
  ] }));
  assert.equal(of(r, "fixings").length, 1);
  assert.equal(r.problems.filter((p) => p.code === "manual_component_invalid").length, 2);
  assert.equal(of(r, "joint-treatment").length, 0); assert.equal(of(r, "mesh")[0].quantity, 12.5, "area units may be fractional");
});
t("D6 scope entries need authority, no quantity, and never conflict with a quantity", () => {
  const authority = { ref: "doc", reviewer: "SM" };
  const r = sheetLayout(rect(4800, 2400), [], rendex(), { reviewedComponents: [
    { group: "mesh", scope: "by-others", authority }, { group: "fixings", scope: "excluded" },
    { group: "joint-treatment", scope: "by-others", authority }, { group: "joint-treatment", quantity: 3, unit: "cartridge", authority },
  ] });
  const state = Object.fromEntries(r.layout.components.map((c) => [c.group, c.state]));
  assert.equal(state.mesh, "by-others"); assert.equal(state.fixings, "unresolved"); assert.equal(state["joint-treatment"], "unresolved");
  assert.ok(codes(r).includes("component_out_of_scope"));
  assert.equal(of(r, "joint-treatment").length, 0);
});

// ── D7  C6 is for random-length timber only ─────────────────────────────────────────────────────────────
t("D7 area→LM refuses sheets, panels, AAC and foam (never an LM of Axon sheets)", () => {
  for (const prod of [AXON133[0], MATRIX1190, WALSC50[0], rendex()]) {
    const r = areaToLinear({ netAreaM2: 24, product: prod, coverMm: 120, coverOverride: true, orderIncrementM: 1 });
    assert.equal(r.status.quantity, "incomplete", prod.id); assert.equal(r.demands.length, 0); assert.ok(codes(r).includes("wrong_family"));
  }
  assert.equal(areaToLinear({ netAreaM2: 24, coverMm: 120, orderIncrementM: 1 }).layout.orderLm, 200, "no product + entered cover is allowed");
});

// ── D8  Rendex permitted orientation ──────────────────────────────────────────────────────────────────
t("D8 an explicit permitted-orientation list is enforced for vertical too; an unknown one keeps quantities but not verification", () => {
  const r = sheetLayout(rect(4800, 2400), [], rendex({ permittedOrientations: ["horizontal"] }), {});
  assert.equal(r.status.quantity, "incomplete"); assert.ok(codes(r).includes("orientation_not_permitted"));
  const unknown = checkContract(sheetLayout(rect(4800, 2400), [], rendex({ permittedOrientations: undefined }), {
    installation: reviewedAssembly("rendex-eps", { productVariantIds: ["rendex-job"], orientation: "vertical" }),
    reviewedComponents: [{ group: "fixings", quantity: 96, unit: "piece", authority: { ref: "doc", reviewer: "SM" } }],
  }));
  assert.equal(unknown.status.quantity, "calculated"); assert.equal(of(unknown, "sheet").length, 4);
  const p = unknown.problems.find((x) => x.code === "orientation_permission_unknown");
  assert.ok(p && p.blocking === false && p.axis === "installation");
  assert.equal(unknown.status.installation, "source-pending");
});

// ── D9  C4: a cut piece is never installable just because it fits ─────────────────────────────────────
const L_WALL = () => buildWall({ id: "L", kind: "polygon", points: [{ x: 0, y: 0 }, { x: 2390, y: 0 }, { x: 2390, y: 1205 }, { x: 1195, y: 1205 }, { x: 1195, y: 2390 }, { x: 0, y: 2390 }] });
t("D9 Matrix: a 5 mm sliver left by a stepped outline (bands all full) is flagged narrow", () => {
  const r = checkContract(panelGrid(L_WALL(), [], MATRIX1190, { jointGapMm: 10, minStripMm: 300 }));
  const n = r.problems.find((p) => p.code === "narrow_strip");
  assert.ok(n, codes(r).join()); assert.deepEqual(n.refs.map((x) => x.cell), ["c1r1"]); close(n.refs[0].minWidthMm, 5);
  assert.equal(of(r, "panel").length, 4, "the sliver still consumes a whole panel");
});
t("D9 Matrix: material beside an opening narrower than the minimum is flagged; unknown minimum → review", () => {
  const ops = [{ id: "WIN", xMm: 1250, sillMm: 300, widthMm: 1090, heightMm: 600 }]; // leaves 50 mm legs left/right of the window in c1r0
  const r = panelGrid(rect(2390, 2390), ops, MATRIX1190, { jointGapMm: 10, minStripMm: 100 });
  assert.deepEqual(r.problems.find((p) => p.code === "narrow_strip").refs.map((x) => x.cell), ["c1r0"]);
  assert.ok(!codes(panelGrid(rect(2390, 2390), ops, MATRIX1190, { jointGapMm: 10, minStripMm: 40 })).includes("narrow_strip"));
  assert.ok(codes(panelGrid(rect(2390, 2390), ops, MATRIX1190, { jointGapMm: 10 })).includes("cut_panel_needs_review"));
});
t("D9 Matrix on a gable: raked cells need review even with a minimum strip; a reviewed rule cannot claim verified", () => {
  const g = buildWall({ kind: "gable", widthMm: 2390, eavesHeightMm: 1500, apexXMm: 1195, apexHeightMm: 2390 });
  const inst = reviewedAssembly("matrix-grid", { productVariantIds: [MATRIX1190.id] });
  const r = panelGrid(g, [], MATRIX1190, { jointGapMm: 10, minStripMm: 100, installation: inst });
  const rev = r.problems.find((p) => p.code === "cut_panel_needs_review");
  assert.ok(rev && rev.refs.every((x) => x.reason === "irregular")); assert.equal(r.status.installation, "source-pending");
});

// ── D10 C2 assembly predicates: stagger and joint exclusion near openings ──────────────────────────────
const JR = (extra) => ({ orientation: "horizontal", mode: "on-support", centresMm: 600, ...extra });
const jointsOf = (r) => r.layout.courses.map((c) => c.segments.flatMap((s) => s.pieces.filter((p) => p.startEnd !== "cut").map((p) => p.startMm)));
t("D10 stagger: adjacent courses never share a joint position closer than minStaggerMm", () => {
  const r = checkContract(courseLayout(rect(4000, 1200), [], STRIA, { orientation: "horizontal", joints: JR({ minStaggerMm: 600 }) }));
  const js = jointsOf(r);
  assert.equal(js.length, 4);
  for (let k = 1; k < js.length; k++) for (const a of js[k]) for (const b of js[k - 1]) assert.ok(Math.abs(a - b) >= 600 - 1e-6, `course ${k}: ${a} vs ${b}`);
  assert.deepEqual(js, [[3000], [2400], [3000], [2400]]);
  const plain = courseLayout(rect(4000, 1200), [], STRIA, { orientation: "horizontal", joints: JR() });
  assert.deepEqual(jointsOf(plain), [[3000], [3000], [3000], [3000]], "without the predicate joints may align");
});
t("D10 stagger for end-matched off-support joints alternates the joint phase", () => {
  const em = { id: "em", family: "timber-cladding", manufacturer: "S", name: "EM", sku: "EM", endMatched: true, dimensionsMm: { length: 5400, width: 140, thickness: 19 }, effectiveCoverMm: 130 };
  const r = checkContract(courseLayout(rect(12000, 390), [], em, { orientation: "horizontal", joints: { orientation: "horizontal", mode: "off-support", minPieceMm: 900, minStaggerMm: 600 } }));
  const js = jointsOf(r);
  assert.deepEqual(js, [[5400, 10800], [4800, 10200], [5400, 10800]]);
  for (const c of r.layout.courses) close(c.segments[0].pieces.reduce((s, p) => s + p.lengthMm, 0), 12000);
});
t("D10 opening clearance: no joint within the clearance of an opening edge in that band", () => {
  const win = [{ id: "WIN", xMm: 2700, sillMm: 50, widthMm: 600, heightMm: 200 }]; // partial-height: notches course 0
  const r = courseLayout(rect(4000, 300), win, STRIA, { orientation: "horizontal", joints: JR({ openingClearanceMm: 300 }) });
  const js = jointsOf(r)[0];
  assert.ok(js.length && js.every((x) => x <= 2400 + 1e-6 || x >= 3600 - 1e-6), `joints ${js}`);
  assert.deepEqual(jointsOf(courseLayout(rect(4000, 300), win, STRIA, { orientation: "horizontal", joints: JR() }))[0], [3000], "unconstrained it would sit in the notch");
  const none = courseLayout(rect(4000, 300), win, STRIA, { orientation: "horizontal", joints: JR({ openingClearanceMm: 2000 }) });
  assert.equal(none.status.quantity, "incomplete"); assert.equal(none.problems.find((p) => p.code === "needs_layout").refs[0].reason, "no-legal-joint");
});
t("D10 an unknown assembly predicate is refused, never silently ignored; invalid predicate values blocked", () => {
  const r = courseLayout(rect(4000, 300), [], STRIA, { orientation: "horizontal", joints: JR({ maxJointsPerStud: 1 }) });
  assert.ok(codes(r).includes("joint_rule_unsupported")); assert.equal(r.demands.length, 0);
  assert.ok(codes(courseLayout(rect(4000, 300), [], STRIA, { orientation: "horizontal", joints: JR({ minStaggerMm: -1 }) })).includes("joint_rule_invalid"));
  assert.equal(courseLayout(rect(4000, 300), [], STRIA, { orientation: "horizontal", joints: JR({ detailRef: "H06 fig 4", minStaggerMm: 0 }) }).status.quantity, "calculated");
});
t("D10 a microscopic support pitch never hangs: bounded stations → needs-layout", () => {
  const t0 = Date.now();
  const r = courseLayout(rect(9000, 300), [], STRIA, { orientation: "horizontal", joints: JR({ centresMm: 1e-6 }) });
  assert.ok(Date.now() - t0 < 2000); assert.equal(r.problems.find((p) => p.code === "needs_layout").refs[0].reason, "too-many-stations");
});

// ── D11 procurement identity ───────────────────────────────────────────────────────────────────────────
t("D11 end condition is part of procurement identity (end-matched never pools with square-end stock)", () => {
  const board = { id: "b", family: "timber-cladding", manufacturer: "S", name: "Shiplap", sku: null, dimensionsMm: { length: 5400, width: 140, thickness: 19 }, effectiveCoverMm: 120 };
  const a = courseLayout(rect(2400, 120), [], board, { orientation: "horizontal" }).demands[0].identity;
  const b = courseLayout(rect(2400, 120), [], { ...board, endMatched: true }, { orientation: "horizontal" }).demands[0].identity;
  assert.notEqual(identityKey(a), identityKey(b)); assert.equal(b.endCondition, "end-matched");
});
t("D11 never pool incompatible SKUs / profiles / thickness / finish / species / grade / supplier (identity keys differ)", () => {
  const base = { id: "b", family: "timber-cladding", manufacturer: "S", name: "Shiplap", sku: "SL", supplier: "A", species: "spotted gum", grade: "select", finish: "raw", dimensionsMm: { length: 5400, width: 140, thickness: 19 }, effectiveCoverMm: 120 };
  const key = (p) => identityKey(courseLayout(rect(2400, 120), [], p, { orientation: "horizontal" }).demands[0].identity);
  const k0 = key(base);
  for (const over of [{ sku: "SL2" }, { name: "Shiplap B" }, { dimensionsMm: { ...base.dimensionsMm, thickness: 22 } }, { finish: "primed" }, { species: "blackbutt" }, { grade: "standard" }, { supplier: "B" }, { treatment: "H3" }]) {
    assert.notEqual(key({ ...base, ...over }), k0, JSON.stringify(over));
  }
});

// ── D12 hostile / malformed inputs never throw ─────────────────────────────────────────────────────────
t("D12 null / garbage inputs return problems, never throw", () => {
  const calls = [
    () => buildWall(null), () => buildWall("rect"), () => normaliseOpenings(rect(1000, 1000), null), () => wallAreas(null, null),
    () => sheetLayout(rect(4800, 2400), null, AXON133, null), () => sheetLayout(null, [], "axon", {}),
    () => courseLayout(rect(4800, 2400), [null, 5], STRIA, null), () => courseLayout(rect(4800, 2400), [], { sequence: [null] }, { orientation: "horizontal", joints: true }),
    () => panelGrid(rect(2400, 2400), [], MATRIX1190, null), () => aacPanelLayout(rect(2400, 2400), [], WALSC50, { adhesiveJointMm: 2, controlJoints: true, rails: true, reviewedComponents: [null, 3] }),
    () => areaToLinear(null), () => areaToLinear({ netAreaM2: 24, coverMm: 120, product: "timber" }),
  ];
  for (const [i, f] of calls.entries()) {
    const r = f();
    assert.ok(r && (Array.isArray(r.problems) || r.status), `call ${i}`);
  }
  assert.equal(sheetLayout(rect(4800, 2400), [], AXON133, null).demands.length, 4, "null opts = defaults");
});

// ── D13 limits: rejected with split guidance, never truncated, never hung ──────────────────────────────
t("D13 more than MAX_OPENINGS_PER_WALL openings → blocked (not truncated); the maximum stays fast", () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: `O${i}`, xMm: (i * 37) % 9000, sillMm: (i * 53) % 2400, widthMm: 150 + (i % 7) * 10, heightMm: 120 + (i % 5) * 10 }));
  const over = sheetLayout(rect(10000, 2700), mk(MAX_OPENINGS_PER_WALL + 1), AXON133, {});
  assert.equal(over.demands.length, 0); assert.ok(codes(over).includes("too_many_openings"));
  const t0 = Date.now();
  const atMax = sheetLayout(rect(10000, 2700), mk(MAX_OPENINGS_PER_WALL), AXON133, {});
  const ms = Date.now() - t0;
  assert.equal(atMax.status.quantity, "calculated"); assert.ok(ms < 3000, `${ms} ms`);
  close(atMax.layout.areas.layoutCutM2, atMax.layout.areas.netM2, "cells still sum to the net area");
});
t("D13 generated-element limits for courses, grids and AAC are rejected with zero demands", () => {
  const thin = { ...STRIA, effectiveCoverMm: 0.5 };
  const c = courseLayout(rect(2400, 3000), [], thin, { orientation: "horizontal" });
  assert.ok(codes(c).includes("too_many_elements")); assert.equal(c.demands.length, 0);
  const g = panelGrid(rect(2400, 2400), [], { ...MATRIX1190, dimensionsMm: { length: 10, width: 10, thickness: 8 } }, { jointGapMm: 1 });
  assert.ok(codes(g).includes("too_many_elements")); assert.equal(g.demands.length, 0);
  const a = aacPanelLayout(rect(MAX_ELEMENTS_PER_WALL * 700, 2400), [], WALSC50, { adhesiveJointMm: 2 });
  assert.ok(codes(a).includes("too_many_elements")); assert.equal(a.demands.length, 0);
});

// ── D14 potential offcuts: the shiplap lap beyond the cover is not an offcut ──────────────────────────
t("D14 a full strip of a sheet wider than its cover lists no phantom width offcut; a cut strip lists cover − cut", () => {
  const wide = rendex({ dimensionsMm: { length: 2400, width: 1220, thickness: 75 } });
  const r = sheetLayout(rect(4800, 2400), [], wide, {});
  assert.deepEqual(r.layout.potentialOffcuts, []);
  const cut = sheetLayout(rect(4500, 2400), [], wide, {});
  assert.deepEqual(cut.layout.potentialOffcuts, [{ cellId: "c3r0", widthMm: 300, lengthMm: 2400, allocated: false }]);
});

// ── D15 determinism: the order openings are entered in never changes the result ───────────────────────
t("D15 reordering openings gives identical demands (ids, quantities and source refs)", () => {
  const ops = [{ id: "B", xMm: 1000, sillMm: 900, widthMm: 400, heightMm: 900 }, { id: "A", xMm: 1100, sillMm: 1000, widthMm: 400, heightMm: 300 }];
  for (const f of [(o) => sheetLayout(rect(4800, 2700), o, AXON133, {}), (o) => panelGrid(rect(2390, 2390), o, MATRIX1190, { jointGapMm: 10 }), (o) => courseLayout(rect(2400, 3000), o, STRIA, { orientation: "horizontal" })]) {
    assert.deepEqual(f(ops).demands, f([...ops].reverse()).demands);
  }
});
t("D16 polygon-shaped openings are refused with guidance (rectangles only), never mis-deducted", () => {
  const n = normaliseOpenings(rect(4800, 2700), [{ id: "ARCH", points: [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 500, y: 900 }] }]);
  assert.equal(n.problems[0].code, "opening_shape_unsupported"); assert.equal(n.problems[0].blocking, true); assert.equal(n.openings.length, 0);
});

// ── spec closed forms swept over many inputs (production vs the spec formula, not a copy of the code) ──
t("C1 blank wall within one sheet: count = ceil(W / cover) for 300 widths (incl. ±noise at multiples)", () => {
  for (let i = 0; i < 300; i++) {
    const W = i % 3 === 0 ? 1200 * int(1, 12) + [0, 1e-9, 0.1, -0.1][i % 4] : int(1, 14000) + rnd();
    assert.equal(of(sheetLayout(rect(W, 2400), [], AXON133, {}), "sheet").length, Math.ceil(W / 1200 - 1e-6), `W=${W}`);
  }
});
t("C4 count per axis = ceil((W+g)/(p+g)) with no outer gaps (sweep), and a shifted origin never counts fewer", () => {
  for (let W = 600; W <= 7300; W += 37) {
    const r = panelGrid(rect(W, 1190), [], MATRIX1190, { jointGapMm: 10 });
    assert.equal(r.layout.summary.columns, Math.ceil((W + 10) / 1200 - 1e-9), `W=${W}`);
    assert.ok(panelGrid(rect(W, 1190), [], MATRIX1190, { jointGapMm: 10, originXMm: -int(1, 1199) }).layout.summary.columns >= r.layout.summary.columns);
  }
  for (const W of [2390, 2395, 2400, 2401]) assert.equal(of(panelGrid(rect(W, W), [], MATRIX1190, { jointGapMm: 10 }), "panel").length, W === 2390 ? 4 : 9, `W=${W}: never four`);
});
t("C2 conservative course count = ceil(H / cover) for random heights and every catalogue board cover", () => {
  const boards = CATALOGUE.products.filter((p) => p.family === "cladding" && p.effectiveCoverMm && p.effectiveCoverMm < 1000);
  for (let i = 0; i < 120; i++) {
    const b = boards[i % boards.length], H = int(100, 6000) + (i % 2 ? 0 : rnd());
    assert.equal(courseLayout(rect(1000, H), [], b, { orientation: "horizontal" }).layout.summary.courses, Math.ceil(H / b.effectiveCoverMm - 1e-9), `${b.id} H=${H}`);
  }
});
t("C5 AAC columns = ceil((W+a)/(w+a)) for the entered adhesive joint (sweep)", () => {
  for (let W = 300; W <= 9000; W += 113) {
    for (const a of [0, 2, 3]) {
      const r = aacPanelLayout(rect(W, 2400), [], WALSC50, { adhesiveJointMm: a });
      assert.equal(of(r, "aac-panel").length, Math.ceil((W + a) / (600 + a) - 1e-9), `W=${W} a=${a}`);
    }
  }
});

// ── geometry oracles ───────────────────────────────────────────────────────────────────────────────────
/** Independent oracle: area of an axis-aligned rect ∩ a CONVEX polygon (rect, rake, gable are convex). */
function rectInConvex(poly, r) {
  let pts = poly;
  for (const [ax, v, keepAbove] of [["x", r.x0, true], ["x", r.x1, false], ["y", r.y0, true], ["y", r.y1, false]]) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i];
      const inA = keepAbove ? a[ax] >= v : a[ax] <= v, inB = keepAbove ? b[ax] >= v : b[ax] <= v;
      const cut = () => { const f = (v - a[ax]) / (b[ax] - a[ax]); return ax === "x" ? { x: v, y: a.y + f * (b.y - a.y) } : { x: a.x + f * (b.x - a.x), y: v }; };
      if (inB) { if (!inA) out.push(cut()); out.push(b); } else if (inA) out.push(cut());
    }
    pts = out;
    if (!pts.length) return 0;
  }
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += pts[i].x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * pts[i].y;
  return Math.abs(s) / 2;
}
t("C0 property: opening union clipped to raked/gable walls = independent convex-clip oracle (up to 60 overlapping openings)", () => {
  for (let n = 0; n < 60; n++) {
    const W = int(1500, 9000), H = int(1500, 3500);
    const wall = n % 2 ? buildWall({ kind: "gable", widthMm: W, eavesHeightMm: H, apexXMm: int(1, W - 1), apexHeightMm: H + int(1, 2500) })
      : buildWall({ kind: "rake", widthMm: W, startHeightMm: H, endHeightMm: int(200, 4500) });
    const ops = Array.from({ length: int(1, 60) }, (_, i) => ({ id: `O${i}`, xMm: int(-300, W), sillMm: int(-300, H), widthMm: int(50, 2500), heightMm: int(50, 2500) }));
    const kept = ops.filter((o) => normaliseOpenings(wall, [o]).openings.length);
    const xs = [...new Set(kept.flatMap((o) => [o.xMm, o.xMm + o.widthMm]))].sort((a, b) => a - b);
    const ys = [...new Set(kept.flatMap((o) => [o.sillMm, o.sillMm + o.heightMm]))].sort((a, b) => a - b);
    let u = 0;
    for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
      if (kept.some((o) => cx > o.xMm && cx < o.xMm + o.widthMm && cy > o.sillMm && cy < o.sillMm + o.heightMm)) u += rectInConvex(wall.polygon, { x0: xs[i], x1: xs[i + 1], y0: ys[j], y1: ys[j + 1] });
    }
    const a = wallAreas(wall, kept);
    assert.ok(Math.abs(a.openingAreaMm2 - u) <= 1e-6 * Math.max(1, u), `${n}: ${a.openingAreaMm2} vs ${u}`);
    assert.ok(a.netAreaMm2 >= -1e-6 && a.openingAreaMm2 <= wall.grossAreaMm2 + 1e-6);
  }
});
t("C1 property: every raked/gable strip's stock length ≥ its true maximum top (never the centre)", () => {
  for (let n = 0; n < 80; n++) {
    const W = int(1200, 9000);
    const wall = n % 2 ? buildWall({ kind: "rake", widthMm: W, startHeightMm: int(1500, 3500), endHeightMm: int(1500, 3500) })
      : buildWall({ kind: "gable", widthMm: W, eavesHeightMm: int(1500, 2500), apexXMm: int(1, W - 1), apexHeightMm: int(2600, 3550) });
    const top = (x) => { // analytic roof height of the convex outline at x
      const p = wall.polygon; let best = -Infinity;
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        if (a.x === b.x) { if (Math.abs(a.x - x) < 1e-9) best = Math.max(best, a.y, b.y); continue; }
        if (x >= Math.min(a.x, b.x) - 1e-9 && x <= Math.max(a.x, b.x) + 1e-9) best = Math.max(best, a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x));
      }
      return best;
    };
    const r = sheetLayout(wall, [], AXON133, {});
    assert.equal(r.status.quantity, "calculated");
    for (const c of r.layout.cells.filter((x) => x.occupied)) {
      const need = Math.max(...[c.rect.x0, c.rect.x1, ...wall.polygon.map((p) => p.x).filter((x) => x > c.rect.x0 && x < c.rect.x1)].map(top));
      assert.ok(c.stockLengthMm >= need - 1e-6, `${n} ${c.id}: stock ${c.stockLengthMm} < max top ${need}`);
      close(c.cutLengthMm, need, `${n} ${c.id} cut`);
    }
  }
});
t("C2 property: partial-height openings never shorten boards; a full-band opening removes exactly its width", () => {
  for (let n = 0; n < 60; n++) {
    const W = int(1000, 2900), H = 150 * int(2, 12);
    const x = int(0, W - 300), w = int(50, W - x);
    const sill = 150 * int(0, H / 150 - 1), rows = int(1, H / 150 - sill / 150);
    const full = [{ id: "F", xMm: x, sillMm: sill, widthMm: w, heightMm: 150 * rows }];
    const part = [{ id: "P", xMm: x, sillMm: sill + 20, widthMm: w, heightMm: 110 }]; // inside one band: a notch, not a removal
    const linea = P("linea-403912"); // 4,200 boards, cover 150: one piece per run on these walls
    const blank = total(courseLayout(rect(W, H), [], linea, { orientation: "horizontal" }).demands);
    close(total(courseLayout(rect(W, H), part, linea, { orientation: "horizontal" }).demands), blank, `${n} partial`);
    close(total(courseLayout(rect(W, H), full, linea, { orientation: "horizontal" }).demands), blank - rows * Math.min(w, W - x), `${n} full`);
  }
});

// ── boundaries the spec names ─────────────────────────────────────────────────────────────────────────
t("C1 shortest listed height: exactly 2,750 → 2,750; 2,750.0001 → 3,000 (a real overrun is never absorbed)", () => {
  assert.equal(of(sheetLayout(rect(1200, 2750), [], AXON133, {}), "sheet")[0].identity.stockLengthMm, 2750);
  assert.equal(of(sheetLayout(rect(1200, 2750.0001), [], AXON133, {}), "sheet")[0].identity.stockLengthMm, 3000);
  assert.equal(of(sheetLayout(rect(1200, 2750 + 1e-9), [], AXON133, {}), "sheet")[0].identity.stockLengthMm, 2750, "float noise only");
});
t("C0 an opening covering (or exceeding) the whole wall: net 0, no sheets, no crash; the clip is a warning only", () => {
  const big = [{ id: "ALL", xMm: -100, sillMm: -100, widthMm: 5000, heightMm: 3000 }];
  const a = wallAreas(rect(4800, 2700), big);
  close(a.netM2, 0); close(a.openingM2, 12.96); assert.deepEqual(a.problems.map((p) => [p.code, p.blocking]), [["opening_clipped", false]]);
  const r = checkContract(sheetLayout(rect(4800, 2700), big, AXON133, {}));
  assert.equal(of(r, "sheet").length, 0); assert.equal(r.status.quantity, "calculated");
});
t("C0 net area is never rounded (4,800.4 × 2,700 gross stays exact)", () => {
  const a = wallAreas(rect(4800.4, 2700), []);
  assert.equal(a.grossAreaMm2, 4800.4 * 2700); assert.equal(a.netM2, (4800.4 * 2700) / 1e6);
});
t("CL02 joint rows: upper course still too tall → blocked with a fresh suggestion; a row at the top edge is invalid", () => {
  const r = sheetLayout(rect(4800, 6500), [], AXON400, { jointRows: { atMm: [3000], gapMm: 10 } });
  assert.equal(r.demands.length, 0); assert.equal(r.status.procurement, "unavailable-stock");
  assert.equal(r.problems.find((p) => p.code === "sheet_too_tall").suggestedJointAtMm, 3010 + 3000);
  assert.ok(codes(sheetLayout(rect(4800, 3300), [], AXON400, { jointRows: { atMm: [3300], gapMm: 0 } })).includes("joint_rows_invalid"));
  const two = checkContract(sheetLayout(rect(4800, 6500), [], AXON400, { jointRows: { atMm: [3000, 6010], gapMm: 10 } }));
  // HUB 016: 4 + 4 full courses + the four 490 mm top pieces cut from ONE sheet (sheets shared across the length) = 9
  assert.equal(of(two, "sheet").length, 9); assert.equal(of(two, "horizontal-joint").length, 2);
});
t("CL02/J2 width change keeps existing sheet ids and only adds the new strip", () => {
  const a = sheetLayout(rect(4800, 2700), [], AXON133, { materialId: "m" }).demands.map((d) => d.id);
  const b = sheetLayout(rect(4801, 2700), [], AXON133, { materialId: "m" }).demands.map((d) => d.id);
  assert.deepEqual(b.slice(0, 4), a); assert.deepEqual(b.slice(4), ["m:W1:sheet:c4r0"]);
});
t("12 Rendex panel offcuts are never treated as linear stock (sheet demands carry no linear stock policy)", () => {
  const r = sheetLayout(rect(4500, 2400), [], rendex(), {});
  assert.ok(of(r, "sheet").every((d) => d.kind === "sheet" && d.unit === "sheet" && d.stockPolicy === undefined && d.lengthMm === undefined));
});
t("C5 AAC: adhesive 0 is an explicit value; negative / NaN blocked; control joints outside the wall invalid", () => {
  assert.equal(aacPanelLayout(rect(1200, 2400), [], WALSC50, { adhesiveJointMm: 0 }).status.quantity, "calculated");
  for (const a of [-1, NaN, "2", null]) assert.ok(codes(aacPanelLayout(rect(1200, 2400), [], WALSC50, { adhesiveJointMm: a })).includes("adhesive_joint_required"), String(a));
  assert.ok(codes(aacPanelLayout(rect(1200, 2400), [], WALSC50, { adhesiveJointMm: 2, controlJoints: { atMm: [1200], widthMm: 10 } })).includes("control_joints_invalid"));
  const r = aacPanelLayout(rect(4800, 2700), [], WALSC50, { adhesiveJointMm: 2 });
  assert.ok(!r.demands.some((d) => /lintel/i.test(d.role)), "no inferred lintels");
});
t("C4 invalid grid inputs are blocked: negative/NaN gap, unknown boundary convention, non-numeric origin", () => {
  for (const g of [-1, NaN, "10"]) assert.ok(codes(panelGrid(rect(2390, 2390), [], MATRIX1190, { jointGapMm: g })).includes("joint_gap_required"), String(g));
  assert.ok(codes(panelGrid(rect(2390, 2390), [], MATRIX1190, { jointGapMm: 10, boundaryGaps: "left" })).includes("boundary_gaps_invalid"));
  assert.ok(codes(panelGrid(rect(2390, 2390), [], MATRIX1190, { jointGapMm: 10, originXMm: "0" })).includes("grid_invalid"));
  assert.ok(codes(panelGrid(rect(2390, 2390), [], { ...P("matrix-403810"), permittedOrientations: ["landscape"] }, { jointGapMm: 10, orientation: "portrait" })).includes("orientation_not_permitted"));
});
t("C6 arithmetic boundaries: increment applied last without float creep; invalid spare/increment/area blocked", () => {
  assert.equal(areaToLinear({ netAreaM2: 24, coverMm: 120, orderIncrementM: 0.3 }).layout.orderLm, 200.1);
  assert.equal(areaToLinear({ netAreaM2: 24, coverMm: 120, orderIncrementM: 0.1 }).layout.orderLm, 200);
  assert.equal(areaToLinear({ netAreaM2: 24, coverMm: 140, spareRate: 0.05, orderIncrementM: 0.6 }).layout.orderLm, 180, "171.43 × 1.05 = 180.0 exactly");
  assert.equal(areaToLinear({ netAreaM2: 24, coverMm: 140, spareRate: 0.06, orderIncrementM: 0.6 }).layout.orderLm, 181.8);
  for (const bad of [{ spareRate: -0.1 }, { orderIncrementM: 0 }, { netAreaM2: NaN }, { coverMm: 0 }]) {
    assert.equal(areaToLinear({ netAreaM2: 24, coverMm: 120, orderIncrementM: 1, ...bad }).status.quantity, "incomplete", JSON.stringify(bad));
  }
});
t("C2/C3 datum must be a number at or below the base; sheet datum must be a number", () => {
  assert.ok(codes(courseLayout(rect(2400, 3000), [], STRIA, { orientation: "horizontal", datumMm: NaN })).includes("datum_above_base"));
  assert.ok(codes(sheetLayout(rect(2400, 3000), [], AXON133, { datumMm: "0" })).includes("datum_invalid"));
});

console.log(`takeoff-tc-cladding-adv: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
