// Hub review HUB 005 — "Split to handling length" (one action, fewest even pieces within the handling length, each
// with its own allowance + order rounding) and the 300 mm order step for new flashings. Drives the REAL engine.
import assert from "node:assert/strict";
import { buildCalibration, verifyCalibration } from "../../shared/takeoff/calibration.js";
import { FLASHING_RULE_DEFAULTS, NEW_FLASHING_RULES } from "../../shared/takeoff/flashing.js";
import { computeFlashingPath, splitToHandling, MAX_RUN_SPLITS } from "../../shared/takeoff/engine/flashingPath.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); } }
const cal = verifyCalibration(buildCalibration({ horizontal: { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, knownMm: 2000 }, vertical: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 100 }, knownMm: 2000 } }).calibration,
  { p1: { x: 0, y: 0 }, p2: { x: 50, y: 0 }, expectedMm: 1000 });
const u = (mm) => mm / 20;
const P = (...xy) => xy.map(([x, y]) => ({ x, y }));
const path = (points, extra = {}) => computeFlashingPath({ runId: "r1", materialId: "m1", identity: { profile: "P1", colour: "Monument" }, points, calibration: cal, complete: true, ...extra });
/** recompute with the proposed splits — what the builder sees after the action */
const after = (points, res, extra = {}) => path(points, { ...extra, splitsMm: res.splitsMm });
const L = (mm) => P([0, 0], [u(mm), 0]);

t("new flashings order in 300 mm steps; the R03 engine default is unchanged for older data", () => {
  assert.equal(NEW_FLASHING_RULES.incrementMm, 300);
  assert.equal(NEW_FLASHING_RULES.allowanceMm, 200);
  assert.equal(FLASHING_RULE_DEFAULTS.incrementMm, 100);
  assert.equal(path(L(4312), { rules: NEW_FLASHING_RULES }).pieces[0].orderMm, 4800);   // 4,312 + 200 → 4,800
  assert.equal(path(L(4312)).pieces[0].orderMm, 4600);                                  // old data: 100 mm step
});

t("a 10,000 mm run with corners (6,000 handling, 300 step) → 2 even pieces of 5,000 → 5,400 each, in ONE action", () => {
  const pts = P([0, 0], [u(4000), 0], [u(4000), u(4000)], [u(6000), u(4000)]);
  const p = path(pts, { rules: NEW_FLASHING_RULES });
  assert.equal(p.pieces.length, 1);                                  // left whole until the builder chooses Split
  const res = splitToHandling(p);
  assert.deepEqual(res.problems, []);
  assert.equal(res.pieces, 2); assert.equal(res.changed, true);
  assert.deepEqual(res.splitsMm, [5000]);
  assert.deepEqual(res.orderMm, [5400, 5400]);
  const q = after(pts, res, { rules: NEW_FLASHING_RULES });
  assert.deepEqual(q.pieces.map((pc) => pc.orderMm), [5400, 5400]);   // the engine agrees once applied
  assert.ok(q.pieces.every((pc) => !pc.handlingFlag && !pc.overMax));
});

t("fewest pieces within the handling length: 17,000 → 3 × 5,666.7 → 6,000 each (5,800 tight is the most one piece can take)", () => {
  const p = path(L(17000), { rules: NEW_FLASHING_RULES });
  assert.ok(p.pieces[0].overMax);
  const res = splitToHandling(p);
  assert.equal(res.pieces, 3);
  assert.deepEqual(res.orderMm, [6000, 6000, 6000]);
  const q = after(L(17000), res, { rules: NEW_FLASHING_RULES });
  assert.deepEqual(q.pieces.map((pc) => pc.orderMm), [6000, 6000, 6000]);
  // 17,401 tight needs a 4th piece (3 × 5,800.3 would round to 6,300)
  assert.equal(splitToHandling(path(L(17401), { rules: NEW_FLASHING_RULES })).pieces, 4);
});

t("replaces earlier hand-placed splits; undo is the previous splits (returned unchanged when blocked)", () => {
  const pts = L(12000);
  const p = path(pts, { rules: NEW_FLASHING_RULES, splitsMm: [8800] });
  const res = splitToHandling(p);
  assert.equal(res.pieces, 3);
  assert.equal(res.splitsMm.length, 2);
  assert.ok(Math.abs(res.splitsMm[0] - 4000) < 1e-6 && Math.abs(res.splitsMm[1] - 8000) < 1e-6);
  assert.deepEqual(p.splitsMm, [8800]);   // the input is untouched (the caller's undo state)
});

t("a run already within the handling length is left alone, with a plain note", () => {
  const res = splitToHandling(path(L(3000), { rules: NEW_FLASHING_RULES }));
  assert.equal(res.changed, false); assert.deepEqual(res.splitsMm, []);
  assert.equal(res.problems[0].code, "already_within");
  assert.match(res.problems[0].message, /already orders within the 6,000 mm handling length/);
});

t("exact blocker: a handling length that can't hold the allowance, and a run needing more pieces than a run can have", () => {
  const tiny = splitToHandling(path(L(3000), { rules: { ...NEW_FLASHING_RULES, handlingThresholdMm: 200 } }));
  assert.equal(tiny.changed, false); assert.equal(tiny.problems[0].code, "handling_too_short");
  assert.match(tiny.problems[0].message, /200 mm handling length leaves no room once the 200 mm allowance/);
  const huge = splitToHandling(path(L(29000), { rules: { ...NEW_FLASHING_RULES, handlingThresholdMm: 900, orderCeilingMm: 9000 } }));
  assert.equal(huge.problems[0].code, "handling_too_many");
  assert.match(huge.problems[0].message, new RegExp(`more than the ${MAX_RUN_SPLITS + 1} a run can have`));
});

t("the order ceiling still wins when it is below the handling length", () => {
  const res = splitToHandling(path(L(12000), { rules: { ...NEW_FLASHING_RULES, handlingThresholdMm: 9000, orderCeilingMm: 6000 } }));
  assert.equal(res.limitMm, 6000);
  assert.ok(res.orderMm.every((x) => x <= 6000));
});

console.log(`takeoff-tc-hub005: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
