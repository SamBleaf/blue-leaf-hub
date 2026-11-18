// Cavity slider on a drawn door (Sam, 18 Nov 2026, live job wall 24: 5,590 long, D1 at 4,280). The door is what was drawn; Cavity
// slider keeps it where it is and doubles the opening towards the pocket side. Also: a bare framing-detail stub (just the
// "Reviewed detail" chip) no longer switches the automatic opening framing off.
//   node scripts/tests/takeoff-tc-cavity-door.test.mjs
import assert from "node:assert/strict";
import { WALL_FRAMING_RULES, computeWorkspace, wallFramingDefaults } from "../../shared/takeoff/index.js";
import { cavityConvert, cavityDefaultSide, cavityDoor, cavityOff, cavitySetLeaf, cavitySetSide, cavityWarning } from "../../src/components/takeoff/measure/tools.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 4).join("\n    ")}`); } }

const LEN = 5590;
const door = { xMm: 4280, sillMm: 0, widthMm: 820, heightMm: 2040, type: "door", label: "D1" };
const span = (i) => [i.xMm, i.xMm + i.widthMm];

t("toggle on: the door keeps its 820 and its place; pocket right grows rightwards 4,280–5,940 and warns past the 5,590 wall end", () => {
  const r = cavityConvert(door, "right", LEN);
  assert.deepEqual(span(r.inputs), [4280, 5940]);
  assert.equal(r.inputs.cavityLeafMm, 820);
  assert.equal(r.inputs.cavityPocket, "right");
  assert.match(r.warning, /350 past the end of the wall/);
  assert.deepEqual([cavityDoor(r.inputs).doorX, cavityDoor(r.inputs).leaf], [4280, 820]);
});

t("toggle on: pocket left moves the offset back by door + 20 → 3,440–5,100, door still 4,280–5,100", () => {
  const r = cavityConvert(door, "left", LEN);
  assert.deepEqual(span(r.inputs), [3440, 5100]);
  assert.equal(r.warning, null);
  assert.equal(cavityDoor(r.inputs).doorX, 4280);
});

t("default side: the side with room; both fit → right; neither → right (and a warning)", () => {
  assert.equal(cavityDefaultSide(door, LEN), "left");                     // right runs off the wall end
  assert.deepEqual(span(cavityConvert(door, null, LEN).inputs), [3440, 5100]);
  assert.equal(cavityDefaultSide({ ...door, xMm: 2000 }, LEN), "right");  // both fit
  assert.equal(cavityDefaultSide({ ...door, xMm: 2000 }, LEN, [{ x0: 2900, x1: 3300, label: "W1" }]), "left"); // right hits W1
  assert.equal(cavityDefaultSide({ ...door, xMm: 100 }, 1000), "right");
  assert.match(cavityConvert({ ...door, xMm: 100 }, null, 1000).warning, /past the end/);
});

t("a pocket into another opening is a warning, never a refusal or a silent move", () => {
  const r = cavityConvert({ ...door, xMm: 2000 }, "right", LEN, [{ x0: 2900, x1: 3300, label: "W1" }]);
  assert.deepEqual(span(r.inputs), [2000, 3660]);
  assert.match(r.warning, /runs into W1/);
  assert.match(cavityConvert({ ...door, xMm: 300 }, "left", LEN).warning, /past the start of the wall/);
});

t("switching side: the pocket jumps over, the door stays at 4,280 both ways", () => {
  const right = cavityConvert({ ...door, xMm: 2000 }, "right", LEN).inputs;
  const left = cavitySetSide(right, "left", LEN).inputs;
  assert.deepEqual(span(left), [1160, 2820]);
  assert.equal(cavityDoor(left).doorX, 2000);
  const back = cavitySetSide(left, "right", LEN).inputs;
  assert.deepEqual(back, right);
});

t("changing door width: the jamb edge (away from the pocket) stays fixed", () => {
  const right = cavityConvert({ ...door, xMm: 2000 }, "right", LEN).inputs;       // 2000–3660, jamb at 2000
  const r2 = cavitySetLeaf(right, 920, LEN).inputs;
  assert.deepEqual([span(r2)[0], r2.widthMm, r2.cavityLeafMm], [2000, 1860, 920]);
  const left = cavityConvert({ ...door, xMm: 2000 }, "left", LEN).inputs;          // 1160–2820, jamb at 2820
  const l2 = cavitySetLeaf(left, 920, LEN).inputs;
  assert.equal(span(l2)[1], 2820);
  assert.deepEqual([l2.widthMm, l2.xMm], [1860, 960]);
  assert.equal(cavityDoor(l2).doorX + 920, 2820, "the door's own right edge (the jamb) hasn't moved");
  assert.match(cavitySetLeaf(right, 1500, 3000).warning, /past the end/);
});

t("toggle off: the opening returns to the door width at the door's position, both sides; round trips are exact", () => {
  for (const side of ["right", "left"]) {
    const on = cavityConvert(door, side, LEN).inputs;
    assert.deepEqual(cavityOff(on), door, side);
  }
  assert.equal(cavityOff(door), door);
});

t("saved legacy slider data: stored geometry is untouched and read the same way (leaf + side are stored)", () => {
  const legacy = { xMm: 600, sillMm: 0, widthMm: 1860, heightMm: 2040, type: "door", label: "D1", cavityLeafMm: 920, cavityPocket: "right" };
  assert.equal(cavityWarning(legacy, 3600), null);
  assert.deepEqual(cavityDoor(legacy), { leaf: 920, pocket: "right", doorX: 600 });
  assert.deepEqual(cavityDoor({ ...legacy, cavityPocket: "left" }), { leaf: 920, pocket: "left", doorX: 1540 });
  assert.deepEqual(cavityOff(legacy), { xMm: 600, sillMm: 0, widthMm: 920, heightMm: 2040, type: "door", label: "D1" });
});

// ── engine: framing follows the full opening ────────────────────────────────────────────────────────────────────
const product = (id, purpose, over = {}) => ({ id, name: id, isActive: true, methodKey: "linear_stock", methodVersion: 1, rules: {},
  spec: { family: "timber", purpose, section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", species: null, supplierName: "Yard A", productCode: null, stock: { maxMm: null, unavailableMm: [] }, ...over } });
const READY = () => wallFramingDefaults([product("p-stud", "studs"), product("p-plate", "plates"), product("p-nog", "noggins", { section: { depthMm: 90, widthMm: 35 } })]);
const run = (openingInputs, rules = { ...WALL_FRAMING_RULES, carriesRoof: false }) => {
  const ms = [{ id: "w", kind: "wall", inputs: { kind: "rect", widthMm: LEN, heightMm: 2700, name: "Wall 24" } },
    { id: "o", kind: "opening", parentId: "w", inputs: openingInputs }];
  const c = computeWorkspace({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [],
    materials: [{ id: "walls", name: "Walls", methodKey: "wall_framing", methodVersion: 1, spec: READY(), rules }], measurements: ms,
    contributions: [{ id: "c", measurementId: "w", jobMaterialId: "walls", role: "wall" }] });
  const l = c.materialResults.walls.layouts.find((x) => x.wallLabel === "Wall 24");
  return { c, l, res: c.materialResults.walls };
};
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);

t("framing: a left-pocket slider at 3,440–5,100 has kings/jambs at its ends and no stud inside; the pocket end (left) has 2 full studs", () => {
  const { l } = run(cavityConvert(door, "left", LEN).inputs);
  const live = l.ticks.filter((x) => x.state !== "removed" && x.positionMm > 3440 - 1 && x.positionMm < 5100 + 1).map((x) => x.positionMm);
  assert.ok(live.every((x) => x < 3440 + 150 || x > 5100 - 150), `no stud inside the opening: ${live}`);
  const sides = l.ticks.filter((x) => x.state === "side").map((x) => x.positionMm).sort((a, b) => a - b);
  assert.equal(sides.filter((x) => x < 3440).length, 2, "pocket end: 2 full studs");
  assert.deepEqual(sides.filter((x) => x > 5100), [5167.5], "doorway end: the king stands beside the jack, one stud past the 5,100 edge");
  near(sides.filter((x) => x < 3440)[1], 3417.5);
  const o = l.openings.find((x) => x.id === "o");
  assert.equal(o.rule.cavity.pocket, "left");
  near(o.xLeftMm, 3440); near(o.xRightMm, 5100);
});

t("framing follows the switch: pocket right at 2,000 puts the 2-stud pocket end on the right", () => {
  const { l } = run(cavityConvert({ ...door, xMm: 2000 }, "right", LEN).inputs);
  const o = l.openings.find((x) => x.id === "o");
  assert.deepEqual([o.rule.kings.left, o.rule.kings.right], [1, 2]);
  const l2 = run(cavityConvert({ ...door, xMm: 2000 }, "left", LEN).inputs).l.openings.find((x) => x.id === "o");
  assert.deepEqual([l2.rule.kings.left, l2.rule.kings.right], [2, 1]);
});

t("a cavity opening that overruns the wall end is still worked out (the warning is the UI's; the engine neither throws nor moves it)", () => {
  const { c } = run(cavityConvert(door, "right", LEN).inputs);
  assert.ok(c.materialResults.walls);
});

// ── investigation: a bare "Reviewed detail" stub must not switch automatic framing off ──────────────────────────
t("a stub detail ({source:'reviewed-detail'} with nothing entered) no longer blocks the automatic lintel, jacks and trimmers", () => {
  const base = cavityConvert(door, "left", LEN).inputs;
  const stub = run({ ...base, detail: { source: "reviewed-detail" } });
  const none = run(base);
  const o = stub.l.openings.find((x) => x.id === "o");
  assert.equal(o.complete, true);
  assert.ok(o.rule, "rule framing applied");
  assert.equal(JSON.stringify(stub.res.demands), JSON.stringify(none.res.demands), "same quantities as no detail");
  assert.ok(!stub.res.problems?.some((p) => p.code === "opening_framing_not_counted"));
});

t("a detail with something entered still wins (manual beats automatic): members entered → no rule, its own count", () => {
  const base = cavityConvert(door, "left", LEN).inputs;
  const { l } = run({ ...base, detail: { source: "explicit", belowSill: { required: false }, aboveHead: { required: false }, members: [] } });
  assert.equal(l.openings.find((x) => x.id === "o").rule, undefined);
});

t("an incomplete detail with a region answered still wins and is still reported, never guessed", () => {
  const base = cavityConvert(door, "left", LEN).inputs;
  const { res } = run({ ...base, detail: { source: "reviewed-detail", belowSill: { required: false } } });
  assert.ok(res.problems.some((p) => p.code === "opening_framing_not_counted" || /aren't counted/.test(p.message)));
});

console.log(`takeoff-tc-cavity-door: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
