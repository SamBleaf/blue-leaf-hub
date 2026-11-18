// Ply brace on short walls + "Ply whole wall" (Sam, 18 Nov 2026).  node scripts/tests/takeoff-tc-ply-brace.test.mjs
import assert from "node:assert/strict";
import { computeWorkspace, wallFramingDefaults, methodFor, WALL_FRAMING_RULES, addBracingMark, removeBracingMark, setPlyWholeWall, plyWholeWallOn, cleanBracing, bracingForWall, bracingMarkText, PLY_BRACE_PRODUCTS } from "../../shared/takeoff/index.js";
import { cleanMeasurementInputs } from "../../server/lib/takeoff/takeoffService.mjs";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 4).join("\n    ")}`); } }
const rect = (id, w, h, n, extra = {}) => ({ id, kind: "wall", inputs: { kind: "rect", widthMm: w, heightMm: h, name: n, ...extra } });
function ws(measurements) {
  const spec = wallFramingDefaults([]);
  spec.components.studs = { ...spec.components.studs, section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", stock: { maxMm: null, unavailableMm: [] } };
  spec.components.noggins = { ...spec.components.noggins, stock: { maxMm: null, unavailableMm: [] } };
  const mk = methodFor(spec);
  const walls = { id: "walls", name: "Walls", methodKey: mk.key, methodVersion: mk.version, spec, rules: { ...WALL_FRAMING_RULES, carriesRoof: true } };
  return { workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [], materials: [walls], measurements,
    contributions: measurements.map((m, i) => ({ id: `c${i}`, measurementId: m.id, jobMaterialId: "walls", role: "wall" })) };
}
let n = 0; const ids = () => `id${n++}`;
const base = { kind: "rect", widthMm: 1160, heightMm: 2400 };

t("1160 wall: a 1200 ply sheet is accepted, ripped to 1,160, no refusal", () => {
  const r = addBracingMark(base, { type: "ply", atMm: 800, lengthMm: 1160, id: "p1" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.mark, { id: "p1", type: "ply", xMm: 0, widthMm: 1160 });
  assert.match(bracingMarkText(r.mark, 2400), /ripped to 1,160 mm/);
  assert.equal(addBracingMark(r.inputs, { type: "ply", atMm: 100, lengthMm: 1160 }).ok, false, "a second sheet does not fit");
  assert.equal(addBracingMark(base, { type: "ply", atMm: 0, lengthMm: 1200, id: "q" }).mark.widthMm, undefined, "exactly 1200 is a full sheet");
});

t("1160 wall orders ONE full sheet (2745) with the rip on the cut list, no yellow-box problem", () => {
  const r = addBracingMark(base, { type: "ply", atMm: 500, lengthMm: 1160, id: "p1" });
  const c = computeWorkspace(ws([rect("w1", 1160, 2400, "Wall 4", { bracing: r.inputs.bracing })]));
  const ply = c.scheduleLines.find((l) => l.bracing?.id === PLY_BRACE_PRODUCTS[0].id);
  assert.equal(ply.quantity, 1);
  assert.equal(ply.finishedLengthMm, 2745);
  assert.match(ply.item.note, /ripped to 1,160 mm/);
  const probs = Object.values(c.materialResults).flatMap((x) => x.problems || []).filter((p) => /bracing/.test(p.code));
  assert.equal(probs.length, 0);
  assert.equal(bracingForWall(r.inputs.bracing, 2400, 1160).notes.length, 0);
});

t("a sheet tapped near the wall end: clamped full sheet; squeezed beside another it is ripped to what is left", () => {
  const w = { kind: "rect", widthMm: 3700, heightMm: 2400 };
  const a = addBracingMark(w, { type: "ply", atMm: 3600, lengthMm: 3700, id: "a" });
  assert.equal(a.mark.xMm, 2500);
  const b = addBracingMark(a.inputs, { type: "ply", atMm: 3500, lengthMm: 3700, id: "b" });
  assert.equal(b.ok, true);
  assert.deepEqual({ x: b.mark.xMm, w: b.mark.widthMm }, { x: 1300, w: undefined }, "tapped past the end onto a sheet: nearest free full-sheet place");
  assert.equal(addBracingMark(a.inputs, { type: "ply", atMm: 2400, lengthMm: 3700 }).ok, false, "a plain overlap in the middle is still refused");
  const e = addBracingMark({ ...w, bracing: [{ id: "m", type: "ply", xMm: 0 }] }, { type: "ply", atMm: 1900, lengthMm: 1500, id: "c" });
  assert.equal(e.ok, true);
  assert.deepEqual(e.mark, { id: "c", type: "ply", xMm: 1200, widthMm: 300 });
});

t("whole wall: 3700 -> 4 sheets, last ripped to 100; order counts 4", () => {
  const r = setPlyWholeWall({ kind: "rect", widthMm: 3700, heightMm: 2400 }, 3700, true, ids);
  assert.equal(r.ok, true);
  assert.equal(r.sheets, 4);
  assert.equal(r.rippedMm, 100);
  const m = r.inputs.bracing;
  assert.deepEqual(m.map((x) => x.xMm), [0, 1200, 2400, 3600]);
  assert.equal(m[3].widthMm, 100);
  assert.ok(m.every((x) => x.whole));
  assert.equal(plyWholeWallOn(r.inputs), true);
  const c = computeWorkspace(ws([rect("w1", 3700, 2400, "Wall 1", { bracing: m })]));
  assert.equal(c.scheduleLines.find((l) => l.bracing?.id === PLY_BRACE_PRODUCTS[0].id).quantity, 4);
  assert.match(c.scheduleLines.find((l) => l.bracing).item.note, /ripped to 100 mm/);
  assert.equal(setPlyWholeWall({ kind: "rect" }, 3600, true, ids).rippedMm, null, "exact multiple: no rip");
});

t("toggling ON replaces hand-placed ply sheets (no doubling); OFF removes only whole-wall sheets; crosses stay; last removal deletes the key", () => {
  const inp = { kind: "rect", widthMm: 3700, heightMm: 2400, bracing: [{ id: "man", type: "ply", xMm: 600 }, { id: "x", type: "cross", xMm: 0, spanMm: 2700 }] };
  const on = setPlyWholeWall(inp, 3700, true, ids);
  assert.equal(on.inputs.bracing.length, 5, "4 whole-wall sheets + cross; the hand sheet is absorbed");
  assert.ok(!on.inputs.bracing.some((x) => x.id === "man"));
  const on2 = setPlyWholeWall(on.inputs, 3700, true, ids);
  assert.equal(on2.inputs.bracing.length, 5, "switching on twice does not stack sheets");
  const off = setPlyWholeWall(on.inputs, 3700, false);
  assert.deepEqual(off.inputs.bracing.map((x) => x.id), ["x"]);
  assert.equal(setPlyWholeWall({ kind: "rect" }, 3601, true, ids).sheets, 3, "a 1 mm sliver is rounding, not a fourth sheet");
  assert.equal(setPlyWholeWall({ kind: "rect" }, 3610, true, ids).sheets, 4);
  assert.equal(cleanBracing([{ id: "a", type: "ply", xMm: 0, widthMm: "900" }]).ok, false, "widthMm must be a number");
  const plain = setPlyWholeWall({ kind: "rect", widthMm: 3700 }, 3700, true, ids);
  assert.ok(!("bracing" in setPlyWholeWall(plain.inputs, 3700, false).inputs));
  assert.equal(setPlyWholeWall({}, 0, true).ok, false);
});

t("multi-wall: each wall gets its own cover; hoop iron cross unaffected", () => {
  const w = [rect("a", 3700, 2400, "A", setPlyWholeWall({ kind: "rect" }, 3700, true, ids).inputs.bracing ? { bracing: setPlyWholeWall({ kind: "rect" }, 3700, true, ids).inputs.bracing } : {}),
    rect("b", 1160, 2400, "B", { bracing: setPlyWholeWall({ kind: "rect" }, 1160, true, ids).inputs.bracing.concat([{ id: "x", type: "cross", xMm: 0, spanMm: 600 }]) })];
  const c = computeWorkspace(ws(w));
  const ply = c.scheduleLines.find((l) => l.bracing?.id === PLY_BRACE_PRODUCTS[0].id);
  assert.equal(ply.quantity, 5);
  assert.ok(c.scheduleLines.some((l) => l.hoop && l.item.hoopMetres > 0));
  assert.equal(c.scheduleLines.find((l) => l.bracing?.name?.startsWith("TENSIONER")).quantity, 2);
});

t("server whitelist: widthMm and whole kept, bad width refused, junk dropped", () => {
  const ok = cleanBracing([{ id: "a", type: "ply", xMm: 1200.4, widthMm: 100.2, whole: true, junk: 1 }, { id: "b", type: "ply", xMm: 0, widthMm: 1200 }]);
  assert.deepEqual(ok.marks, [{ id: "a", type: "ply", xMm: 1200, widthMm: 100, whole: true }, { id: "b", type: "ply", xMm: 0 }]);
  for (const w of [0, -5, 1300, "x"]) assert.equal(cleanBracing([{ id: "a", type: "ply", xMm: 0, widthMm: w }]).ok, false);
  const out = cleanMeasurementInputs("wall", { kind: "rect", widthMm: 1160, heightMm: 2400, bracing: [{ id: "p", type: "ply", xMm: 0, widthMm: 1160 }] }, null);
  assert.deepEqual(out.bracing, [{ id: "p", type: "ply", xMm: 0, widthMm: 1160 }]);
  assert.equal(removeBracingMark(out, "p").bracing, undefined);
});

console.log(`takeoff-tc-ply-brace: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
