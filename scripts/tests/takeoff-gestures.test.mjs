// Gesture tracker tests — run: node scripts/tests/takeoff-gestures.test.mjs
// Drives the REAL src/components/takeoff/gestures.js with synthetic pointer events on a fake
// element: tap vs 8 px slop, pan mode, two-finger pinch (incl. one finger lifting first),
// pointercancel / lost capture, handle-owned pointers, and detach mid-gesture.
import assert from "node:assert/strict";
import { createGestureTracker, TAP_SLOP_PX } from "../../src/components/takeoff/gestures.js";

globalThis.performance ??= { now: () => Date.now() };
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); } }

function fakeEl() {
  const l = {};
  return {
    l,
    addEventListener: (k, f) => { l[k] = f; },
    removeEventListener: (k) => { delete l[k]; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
    setPointerCapture() {},
  };
}
const ev = (id, x, y, extra = {}) => ({ pointerId: id, clientX: x, clientY: y, pointerType: "touch", button: 0, preventDefault() {}, target: { closest: () => null }, ...extra });

function setup(mode = "tap") {
  const el = fakeEl();
  const log = { taps: [], pans: 0, pinches: 0, ends: 0 };
  const tr = createGestureTracker({
    mode: () => mode,
    onTap: (p) => log.taps.push(p),
    onPan: () => { log.pans++; },
    onPinch: () => { log.pinches++; },
    onGestureEnd: () => { log.ends++; },
    shouldIgnore: (e) => !!e.handle,
  });
  const detach = tr.attach(el);
  const f = (k, e) => el.l[k](e);
  return { tr, log, f, detach };
}

t("short tap places one point", () => {
  const { log, f } = setup();
  f("pointerdown", ev(1, 100, 100)); f("pointermove", ev(1, 103, 102)); f("pointerup", ev(1, 103, 102));
  assert.equal(log.taps.length, 1);
});
t(`movement > ${TAP_SLOP_PX}px becomes a pan and places nothing`, () => {
  const { log, f } = setup();
  f("pointerdown", ev(1, 100, 100)); f("pointermove", ev(1, 110, 100)); f("pointerup", ev(1, 110, 100));
  assert.equal(log.taps.length, 0); assert.ok(log.pans > 0);
});
t("pan mode never taps", () => {
  const { log, f } = setup("pan");
  f("pointerdown", ev(1, 100, 100)); f("pointerup", ev(1, 100, 100));
  assert.equal(log.taps.length, 0);
});
t("second finger cancels the pending tap; pinch places nothing", () => {
  const { log, f } = setup();
  f("pointerdown", ev(1, 100, 100)); f("pointerdown", ev(2, 200, 100));
  f("pointermove", ev(2, 240, 100)); f("pointerup", ev(1, 100, 100)); f("pointerup", ev(2, 240, 100));
  assert.equal(log.taps.length, 0); assert.ok(log.pinches > 0);
});
t("first finger lifts first → remaining finger only pans, never taps", () => {
  const { log, f } = setup();
  f("pointerdown", ev(1, 100, 100)); f("pointerdown", ev(2, 200, 100)); f("pointermove", ev(1, 90, 100));
  f("pointerup", ev(1, 90, 100)); // first finger lifts
  const pansBefore = log.pans;
  f("pointermove", ev(2, 205, 101)); f("pointerup", ev(2, 205, 101));
  assert.equal(log.taps.length, 0); assert.ok(log.pans > pansBefore);
});
t("pointercancel leaves idle with no tap", () => {
  const { log, f, tr } = setup();
  f("pointerdown", ev(1, 100, 100)); f("pointercancel", ev(1, 100, 100));
  assert.equal(log.taps.length, 0); assert.equal(tr.state, "idle"); assert.equal(tr.pointerCount, 0);
});
t("lost capture mid-pan leaves idle", () => {
  const { f, tr } = setup();
  f("pointerdown", ev(1, 100, 100)); f("pointermove", ev(1, 140, 100)); f("lostpointercapture", ev(1, 140, 100));
  assert.equal(tr.state, "idle");
});
t("pointer on an endpoint handle is ignored by the viewport tracker", () => {
  const { log, f, tr } = setup();
  f("pointerdown", ev(1, 100, 100, { handle: true })); f("pointerup", ev(1, 100, 100, { handle: true }));
  assert.equal(log.taps.length, 0); assert.equal(tr.pointerCount, 0);
});
t("detach mid-gesture resets without a stray tap", () => {
  const { log, f, detach, tr } = setup();
  f("pointerdown", ev(1, 100, 100)); detach();
  assert.equal(log.taps.length, 0); assert.equal(tr.pointerCount, 0);
});
t("slow press (> 600 ms) is not a tap", () => {
  const { log, f } = setup();
  const realNow = performance.now; let now = 1000; performance.now = () => now;
  f("pointerdown", ev(1, 100, 100)); now += 900; f("pointerup", ev(1, 100, 100));
  performance.now = realNow;
  assert.equal(log.taps.length, 0);
});

console.log(`takeoff-gestures: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
