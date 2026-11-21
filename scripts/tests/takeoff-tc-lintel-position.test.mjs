// Lintel position (Sam, 18 Nov 2026, live job, Wall 1 3,955 x 2,700, W1 3,430 wide, head at 2,600): when the lintel won't fit
// above the window it can be put in the roof frame or the floor frame. Default (absent) = under the top plate, as before.
//   node scripts/tests/takeoff-tc-lintel-position.test.mjs
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { WALL_FRAMING_RULES, computeWorkspace, wallFramingDefaults } from "../../shared/takeoff/index.js";
import { cleanMeasurementInputs } from "../../server/lib/takeoff/takeoffService.mjs";
import { NOTE_CODES } from "../../shared/takeoff/fixes.js";
import { memberGroup } from "../../shared/takeoff/supplierOrder.js";
import { LINTEL_POSITIONS } from "../../shared/takeoff/engine/openingRules.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 4).join("\n    ")}`); } }

const product = (id, purpose, over = {}) => ({ id, name: id, isActive: true, methodKey: "linear_stock", methodVersion: 1, rules: {},
  spec: { family: "timber", purpose, section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", species: null, supplierName: "Yard A", productCode: null, stock: { maxMm: null, unavailableMm: [] }, ...over } });
const READY = () => wallFramingDefaults([product("p-stud", "studs"), product("p-plate", "plates"), product("p-nog", "noggins", { section: { depthMm: 90, widthMm: 35 } })]);
const walls = (spec, rules) => ({ id: "walls", name: "Walls", methodKey: "wall_framing", methodVersion: 1, spec, rules });
const snap = (materials, measurements, contributions) => ({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [], materials, measurements, contributions });
const wm = (id, widthMm, heightMm, name) => ({ id, kind: "wall", inputs: { kind: "rect", widthMm, heightMm, name } });
const om = (id, parentId, label, type, xMm, widthMm, heightMm, sillMm, extra = {}) => ({ id, kind: "opening", parentId, inputs: { xMm, sillMm, widthMm, heightMm, label, type, ...extra } });
const onW = (measurementId) => ({ id: `c-${measurementId}-walls`, measurementId, jobMaterialId: "walls", role: "wall" });
const ROOF = { carriesRoof: true, roofMass: "sheet", rlwMm: 3000, rafterSpacingMm: 600, windClass: "N2" };
const run = (measurements) => computeWorkspace(snap([walls(READY(), { ...WALL_FRAMING_RULES, ...ROOF })], measurements, measurements.filter((m) => m.kind === "wall").map((m) => onW(m.id))));
const WR = (c) => c.materialResults.walls;
const dem = (c, re) => WR(c).demands.filter((d) => re.test(d.label)).map((d) => [d.label.replace(/^Wall \d+ /, ""), d.quantity, d.lengthMm]);
const codes = (c) => WR(c).problems.map((p) => p.code);
const rule = (c) => WR(c).layouts[0].openings[0].rule;
// Sam's wall: 3,955 x 2,700, W1 3,430 x 600 at 450, sill 2,000 (head 2,600) from the floor: 145 mm free above the head
const SAM = (extra = {}) => [wm("w", 3955, 2700, "Wall 1"), om("o", "w", "W1", "window", 450, 3430, 600, 2000, extra)];

t("constants and note codes", () => {
  assert.deepEqual([...LINTEL_POSITIONS], ["underTopPlate", "roofFrame", "floorFrame"]);
  assert.ok(NOTE_CODES.includes("lintel_aloft") && NOTE_CODES.includes("lintel_aloft_blocking"));
});

t("under the top plate (default, field absent): a 240 x 45 LVL13 doesn't fit the 145 mm, as before", () => {
  const c = run(SAM());
  const r = rule(c);
  assert.equal(r.lintel.status, "sized");
  assert.equal(r.lintel.depthMm, 240);
  assert.deepEqual([r.lintel.noFit.neededMm, r.lintel.noFit.freeMm], [240, 145]);
  assert.equal(r.position, "underTopPlate");
  const msg = WR(c).problems.find((p) => p.code === "lintel_no_fit").message;
  assert.match(msg, /put it in the roof or floor frame\./);
  assert.ok(!/confirm the lintel sits in the top plate/.test(msg));
  // an explicit "underTopPlate" behaves identically
  assert.deepEqual(WR(run(SAM({ lintelPosition: "underTopPlate" }))).demands, WR(c).demands);
});

t("roof frame: fits (no noFit, no lintel_no_fit), same table size, one head trimmer, cripples 145 - 45 = 100 at the centres, lintel counted", () => {
  const c = run(SAM({ lintelPosition: "roofFrame" }));
  const r = rule(c);
  assert.equal(r.position, "roofFrame");
  assert.equal(r.lintel.status, "sized");
  assert.equal(r.lintel.depthMm, 240);
  assert.equal(r.lintel.noFit, undefined);
  assert.ok(!codes(c).includes("lintel_no_fit"));
  assert.equal(r.trimmers.head, 1);
  assert.ok(dem(c, /head trimmer/).length === 1 && dem(c, /head trimmer/)[0][1] === 1);
  const cr = dem(c, /above-head/);
  assert.ok(cr.length > 0, "cripples above the head are counted");
  assert.ok(cr.every((x) => x[2] === 100), `each cripple is 100 long (free 145 less one 45 trimmer): ${JSON.stringify(cr)}`);
  assert.ok(dem(c, /lintel/i).length >= 1, "the lintel is counted");
  const note = WR(c).problems.find((p) => p.code === "lintel_aloft");
  assert.match(note.message, /W1: lintel in the roof frame — check the roof frame layout with the truss supplier\./);
  assert.equal(note.blocking, false);
  assert.equal(WR(c).status.quantity, "calculated");
});

t("roof frame: lintel length = opening + bearing each end, as under the top plate", () => {
  const a = dem(run(SAM()), /lintel/i), b = dem(run(SAM({ lintelPosition: "roofFrame" })), /lintel/i);
  assert.deepEqual(b, a);
});

t("roof frame: a roof width chip still sizes the lintel (roof table unchanged)", () => {
  const a = rule(run(SAM({ lintelPosition: "roofFrame", loadRlwMm: 1500 }))).lintel;
  const b = rule(run(SAM({ loadRlwMm: 1500 }))).lintel;
  assert.deepEqual([a.section, a.plies], [b.section, b.plies]);
});

t("floor frame: the floor-load lintel table is NOT mapped, so the size is typed; incomplete until it is", () => {
  const c = run(SAM({ lintelPosition: "floorFrame" }));
  const r = rule(c);
  assert.equal(r.lintel.status, "engineer");
  assert.match(r.lintel.reason, /size from the engineer \(floor load\)/);
  assert.equal(WR(c).status.quantity, "incomplete");
  assert.match(WR(c).problems.find((p) => p.code === "lintel_aloft").message, /size from the engineer \(floor load\)/);
  assert.deepEqual(dem(c, /lintel/i), [], "no lintel invented");
  assert.ok(dem(c, /above-head/).length > 0, "the cripples above the head trimmer are still counted");
  assert.ok(dem(c, /head trimmer/).length === 1);
  // typed 240 x 45 x 1: counted, calculated again
  const d = run(SAM({ lintelPosition: "floorFrame", lintel: { depthMm: 240, breadthMm: 45, plies: 1, grade: "LVL13" } }));
  assert.equal(rule(d).lintel.status, "typed");
  assert.equal(rule(d).lintel.noFit, undefined);
  assert.equal(WR(d).status.quantity, "calculated");
  assert.ok(dem(d, /lintel/i).length >= 1);
});

t("switching back restores the original result exactly", () => {
  const base = WR(run(SAM())).demands;
  const roof = WR(run(SAM({ lintelPosition: "roofFrame" }))).demands;
  assert.notDeepEqual(roof, base);
  assert.deepEqual(WR(run(SAM({ lintelPosition: "underTopPlate" }))).demands, base);
});

t("free space at or under one trimmer: just the head trimmer, no cripples; under 50 left: solid blocking and a note", () => {
  // head 2,685 from the floor: 2,700 - 2,640 = 60 free: more than a trimmer (45), 15 mm left, under 50 → blocking
  const tight = run([wm("w", 3955, 2700, "Wall 1"), om("o", "w", "W1", "window", 450, 3430, 685, 2000, { lintelPosition: "roofFrame" })]);
  assert.deepEqual(dem(tight, /above-head/), []);
  assert.ok(dem(tight, /head block/i).length >= 1, JSON.stringify(WR(tight).demands.map((d) => d.label)));
  assert.ok(codes(tight).includes("lintel_aloft_blocking"));
  // the block must not print with the kings and jacks (review defect: "blocking" matched /king/)
  assert.equal(memberGroup("head block").key, "junction");
  // head at the top of the studs: nothing above
  const flush = run([wm("w", 3955, 2700, "Wall 1"), om("o", "w", "W1", "window", 450, 3430, 700, 2000, { lintelPosition: "roofFrame" })]);
  assert.deepEqual(dem(flush, /above-head/), []);
  assert.equal(rule(flush).lintel.noFit, undefined);
});

t("an opening in a wall that doesn't carry the roof, or a full-height opening, ignores the position", () => {
  const nl = computeWorkspace(snap([walls(READY(), { ...WALL_FRAMING_RULES, ...ROOF, carriesRoof: false })], SAM({ lintelPosition: "roofFrame" }), [onW("w")]));
  assert.equal(WR(nl).layouts[0].openings[0].rule.position, "underTopPlate");
  const fh = run(SAM({ lintelPosition: "roofFrame", fullHeight: true }));
  assert.equal(rule(fh).position, "underTopPlate");
});

t("server whitelist: only the three positions; junk is rejected; absent and the default are not stored", () => {
  const base = { xMm: 0, sillMm: 0, widthMm: 900, heightMm: 2100, type: "window" };
  assert.equal(cleanMeasurementInputs("opening", { ...base, lintelPosition: "roofFrame" }).lintelPosition, "roofFrame");
  assert.equal(cleanMeasurementInputs("opening", { ...base, lintelPosition: "floorFrame" }).lintelPosition, "floorFrame");
  assert.equal("lintelPosition" in cleanMeasurementInputs("opening", { ...base, lintelPosition: "underTopPlate" }), false);
  assert.equal("lintelPosition" in cleanMeasurementInputs("opening", base), false);
  for (const junk of ["roof", "ROOFFRAME", "", 3, {}, true]) assert.throws(() => cleanMeasurementInputs("opening", { ...base, lintelPosition: junk }), `junk ${JSON.stringify(junk)}`);
});

// openings without the field: the same workspaces through origin/main's engine (a git archive of it) give identical results
let oldEngine = null;
try { const dir = execSync("mktemp -d").toString().trim(); execSync(`git archive origin/main shared | tar -x -C ${dir}`, { stdio: "ignore" }); oldEngine = await import(`${dir}/shared/takeoff/index.js`); } catch { /* no origin/main here: the full takeoff suite's totals tests cover it */ }
t("openings without the field: results byte-identical to origin/main (and a typed or chip-sized lintel too)", () => {
  if (!oldEngine) return;
  let n = 0;
  for (const rules of [ROOF, { ...ROOF, carriesRoof: false }, {}]) for (const ms of [SAM(), SAM({ loadRlwMm: 1500 }), SAM({ lintel: { depthMm: 90, breadthMm: 45, plies: 1, grade: "LVL13" } })]) {  // typed with its own grade: a gradeless typed lintel now takes the item's lintel product (takeoff-tc-framing-visible)
    const mk = (ws) => JSON.stringify(ws.computeWorkspace(snap([walls(READY(), { ...WALL_FRAMING_RULES, ...rules })], ms, [onW("w")])));
    const a = mk(oldEngine), b = mk({ computeWorkspace });
    // the only permitted difference is the new "put it in the roof or floor frame" wording and the rule's position
    // (and, from takeoff-calc@14, the wall layout's own frame extent: a lone wall's frame is its traced length)
    const norm = (x) => x.replace(/Lower the window, or [^"]*?\./g, "L").replace(/"position":"underTopPlate",/g, "").replace(/"frame":\{[^}]*\},/g, "");
    assert.equal(norm(b), norm(a)); n++;
  }
  assert.equal(n, 9);
});

console.log(`takeoff-tc-lintel-position: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
