// Hub review HUB 029 — clear order blockers, or make each one a one-tap fix. Plan: docs/hub_review/ORDER_BLOCKERS_PLAN.md
// ("Sam's decisions (25 October 2026)" override its defaults: a wall with no height still holds the whole cladding).
// Part A, build step 1 (engine blocker data), through the SAME computeWorkspace the panel, the mock and the server use,
// on synthetic walls shaped like the recorded job (no job data here):
//   - an incomplete wall names only what it is missing, in the wall page's own labels ("Wall 3: enter the Wall height."),
//     with scope "wall" and refs [{ measurementId, missing }] (missing = the wall page's inputs, as its missingHeights;
//     "scale" for a traced wall on a page with no usable scale); a wall shape problem carries the same refs, naming the
//     field that fixes it; a Studs (wall_frame) or Walls wall_incomplete carries them too (its wording unchanged);
//   - every familyProblems need names its card `field` (one of FAMILY_NEED_FIELDS);
//   - a note is said once on each of a material's own lines (result.problems keeps every copy);
//   - orderReady is false while a measured item is held with no lines (an item with nothing measured never counts);
//   - rescaleCandidates also lists traced walls, with the wall length before and after (an outline's height too), the
//     reason the server would refuse the re-stamp (a gable apex off the wall at the new length), and its openings.
//   node scripts/tests/takeoff-tc-hub029.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FAMILY_NEED_FIELDS, WALL_FRAMING_RULES, buildCalibration, computeWorkspace, familyProblems, gableInputProblem, methodFor, rescaleCandidates, verifyCalibration,
  wallFramingDefaults, wallIncompleteText,
} from "../../shared/takeoff/index.js";
import { productGroups, specFromGroup } from "../../shared/takeoff/products/index.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 3).join("\n    ")}`); } }

// 1 PDF unit = 20 mm on both axes, verified (order-ready); a re-scale of the same page reads 1 unit = 21 mm
const scale = (mm) => verifyCalibration(buildCalibration({ horizontal: { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, knownMm: 100 * mm }, vertical: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 100 }, knownMm: 100 * mm } }).calibration,
  { p1: { x: 0, y: 0 }, p2: { x: 50, y: 0 }, expectedMm: 50 * mm });
const CAL = { ...scale(20), id: "cal", documentId: "d", pageIndex: 0, calibrationRevision: 1 };
const CAL2 = { ...scale(21), id: "cal2", documentId: "d", pageIndex: 0, calibrationRevision: 2 };

const group = (name) => productGroups({ family: "cladding" }).find((g) => g.name === name);
const fam = (spec) => { const m = methodFor(spec); return { spec, methodKey: m.key, methodVersion: m.version }; };
// Blue Leaf's Axon: cavity, the 10 mm H-flashing joint rule (HUB 015), the seed's axon-vertical assembly (source-pending)
const JOINT = { atMm: [], gapMm: 10, detailRef: "H-flashing" };
const axon = (id) => ({ id, name: "Axon 400 smooth", ...fam({ ...specFromGroup(group("Axon 400 smooth")), assemblyId: "axon-vertical" }), rules: { route: "cavity", jointRows: JOINT } });
const rect = (id, widthMm, heightMm, name) => ({ id, kind: "wall", inputs: { kind: "rect", ...(widthMm != null ? { widthMm } : {}), ...(heightMm != null ? { heightMm } : {}), name } });
/** A wall traced on the plan (its length from the scale), heights typed in. */
const traced = (id, mm, name, inputs = {}) => ({ id, kind: "wall", documentId: "d", pageIndex: 0, calibrationId: "cal", points: [{ x: 1, y: 1 }, { x: 1 + mm / 20, y: 1 }], inputs: { kind: "rect", name, ...inputs } });
const con = (id, measurementId, jobMaterialId, role = "wall") => ({ id, measurementId, jobMaterialId, role });
const ws = (materials, measurements, contributions, calibrations = [CAL]) => ({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } },
  documents: [{ id: "d", status: "current" }], calibrations, materials, measurements, contributions });
const linesOf = (c, id) => c.scheduleLines.filter((l) => l.jobMaterialIds.includes(id));
const probs = (c, id, code) => c.materialResults[id].problems.filter((p) => p.code === code);

/** The recorded job's shape (synthetic): the first Axon on Walls 1, 3 and 4 (Wall 3 traced 420 mm long with no Wall
 *  height, as it was traced before the Line tool had one), the second Axon on Walls 12 and 13. */
const JOB = (wall3 = {}) => ws([axon("clad"), axon("clad2")],
  [rect("w1", 3600, 3600, "Wall 1"), traced("w3", 420, "Wall 3", wall3), rect("w4", 4200, 3600, "Wall 4"), rect("w12", 3000, 3600, "Wall 12"), rect("w13", 2400, 3600, "Wall 13")],
  [con("a1", "w1", "clad"), con("a3", "w3", "clad"), con("a4", "w4", "clad"), con("b12", "w12", "clad2"), con("b13", "w13", "clad2")]);

/** The wall page's own missingHeights (WallsScreen.jsx), read from the source so the two can't drift apart. */
const missingHeights = (() => {
  const src = readFileSync(new URL("../../src/components/takeoff/WallsScreen.jsx", import.meta.url), "utf8");
  const body = src.match(/function missingHeights\(inp = \{\}\) \{\n([\s\S]*?)\n\}\n/);
  assert.ok(body, "WallsScreen.jsx still has missingHeights");
  return new Function("inp = {}", body[1]);
})();

/** One Axon wall on its own: its wall_incomplete problem (or none). */
const incomplete = (m) => {
  const c = computeWorkspace(ws([axon("clad")], [m], [con("a", m.id, "clad")]));
  return probs(c, "clad", "wall_incomplete");
};

t("an incomplete wall names only what it is missing, in the wall page's labels, with scope 'wall' and refs [{ measurementId, missing }]", () => {
  // the recorded job's Wall 3: traced (its length comes from the plan), no Wall height
  const [w3] = incomplete(traced("w3", 420, "Wall 3"));
  assert.deepEqual({ ...w3 }, { code: "wall_incomplete", message: "Wall 3: enter the Wall height.", blocking: true, scope: "wall", refs: [{ measurementId: "w3", missing: ["heightMm"] }] });
  assert.ok(!/length and heights/.test(w3.message), "never asks for a length it already has");
  const cases = [
    [rect("w5", null, 2700, "Wall 5"), ["widthMm"], "Wall 5: trace or enter the Wall length."],
    [rect("w5", null, null, "Wall 5"), ["widthMm", "heightMm"], "Wall 5: trace or enter the Wall length and enter the Wall height."],
    [{ id: "r", kind: "wall", inputs: { kind: "rake", widthMm: 3000, name: "Rake" } }, ["startHeightMm", "endHeightMm"], "Rake: enter the Height at start and end."],
    [{ id: "r", kind: "wall", inputs: { kind: "rake", widthMm: 3000, startHeightMm: 2400, name: "Rake" } }, ["endHeightMm"], "Rake: enter the Height at end."],
    [{ id: "g", kind: "wall", inputs: { kind: "gable", widthMm: 6000, name: "Gable" } }, ["eavesHeightMm", "apexHeightMm", "apexXMm"], "Gable: enter the Eaves height, Apex height and Apex position."],
    [{ id: "g", kind: "wall", inputs: { kind: "gable", widthMm: 6000, eavesHeightMm: 2400, name: "Gable" } }, ["apexHeightMm", "apexXMm"], "Gable: enter the Apex height and Apex position."],
    [{ id: "g", kind: "wall", inputs: { kind: "gable", widthMm: 6000, eavesHeightMm: 2400, apexHeightMm: 3600, name: "Gable" } }, ["apexXMm"], "Gable: enter the Apex position."],
    // a rake may start at 0 (triangular): only an absent height is missing
    [{ id: "r", kind: "wall", inputs: { kind: "rake", widthMm: 3000, startHeightMm: 0, name: "Rake" } }, ["endHeightMm"], "Rake: enter the Height at end."],
    [{ id: "o", kind: "wall", inputs: { kind: "polygon", name: "Outline" } }, ["outline"], "Outline: trace the wall outline."],
  ];
  for (const [m, missing, message] of cases) {
    const ps = incomplete(m);
    assert.equal(ps.length, 1, `${message} ${JSON.stringify(ps)}`);
    assert.deepEqual([ps[0].message, ps[0].scope, ps[0].refs], [message, "wall", [{ measurementId: m.id, missing }]]);
    assert.equal(wallIncompleteText(m.inputs.name, missing), message, "the exported wording is the engine's");
  }
  // the heights listed are the ones the wall page asks for (its missingHeights), on every value the real server can store
  for (const inputs of [{ kind: "rect", widthMm: 3000 }, { kind: "rake", widthMm: 3000 }, { kind: "rake", widthMm: 3000, startHeightMm: 2400 }, { kind: "rake", widthMm: 3000, endHeightMm: 2400 },
    { kind: "gable", widthMm: 6000 }, { kind: "gable", widthMm: 6000, eavesHeightMm: 2400 }, { kind: "gable", widthMm: 6000, apexHeightMm: 3600, apexXMm: 3000 },
    { kind: "gable", widthMm: 6000, eavesHeightMm: 2400, apexXMm: 3000 }]) {
    const [p] = incomplete({ id: "x", kind: "wall", inputs: { ...inputs, name: "X" } });
    assert.deepEqual(p.refs[0].missing, missingHeights(inputs), JSON.stringify(inputs));
  }
  // KNOWN disagreements, pinned with the engine's answer (open for step 4, which owns WallsScreen; Sam hasn't ruled). None
  // can be saved by the real server: cleanInputs refuses a rake or apex height under 1 and stores "" as null.
  const known = [
    // a rake height of 0: present for the engine (a triangular rake), missing on the wall page
    [{ kind: "rake", widthMm: 3000, startHeightMm: 0, endHeightMm: 2400 }, [], ["startHeightMm"]],
    // a gable apex height of 0: missing for the engine, present on the wall page
    [{ kind: "gable", widthMm: 6000, eavesHeightMm: 2400, apexHeightMm: 0, apexXMm: 3000 }, ["apexHeightMm"], []],
    // a gable apex position of "": present for the engine (so it is a shape problem, "between the two wall ends"), missing on the wall page
    [{ kind: "gable", widthMm: 6000, eavesHeightMm: 2400, apexHeightMm: 3600, apexXMm: "" }, [], ["apexXMm"]],
  ];
  for (const [inputs, engine, page] of known) {
    const ps = incomplete({ id: "x", kind: "wall", inputs: { ...inputs, name: "X" } });
    assert.deepEqual(ps.length ? ps[0].refs[0].missing : [], engine, `engine: ${JSON.stringify(inputs)}`);
    assert.deepEqual(missingHeights(inputs), page, `wall page: ${JSON.stringify(inputs)}`);
  }
  // a complete wall has none
  assert.deepEqual(incomplete(rect("ok", 3000, 2700, "OK")), []);
  // a traced wall whose page has no usable scale has no length to type: it names the scale, never "enter the Wall length"
  const unscaled = { ...traced("w3", 420, "Wall 3"), calibrationId: "gone" };
  for (const [m, missing, message] of [
    [unscaled, ["scale", "heightMm"], "Wall 3: scale this plan page and enter the Wall height."],
    [{ ...unscaled, inputs: { kind: "rect", heightMm: 2700, name: "Wall 3" } }, ["scale"], "Wall 3: scale this plan page."],
    [{ ...unscaled, points: [{ x: 1, y: 1 }, { x: 50, y: 1 }, { x: 50, y: 40 }], inputs: { kind: "polygon", name: "Outline" } }, ["scale"], "Outline: scale this plan page."],
  ]) {
    const ps = incomplete(m);
    assert.deepEqual(ps.map((p) => [p.message, p.refs]), [[message, [{ measurementId: m.id, missing }]]]);
    assert.equal(wallIncompleteText(m.inputs.name, missing), message);
  }
  // as the real server saves it (the traced length kept in widthMm), it works from that length and the raw code says why
  const saved = computeWorkspace(ws([axon("clad")], [{ ...unscaled, inputs: { kind: "rect", widthMm: 4200, heightMm: 2700, name: "Wall 3" } }], [con("a", "w3", "clad")]));
  assert.deepEqual(probs(saved, "clad", "wall_incomplete"), []);
  assert.ok(linesOf(saved, "clad").length && linesOf(saved, "clad").every((l) => l.problems.includes("calibration_missing")));
});

t("two walls with the same name: each problem names its own wall (its tag) and its own measurement", () => {
  const c = computeWorkspace(ws([axon("clad")], [rect("wa", 3000, 2700, "Wall"), rect("wb", 3000, null, "Wall"), rect("wc", 2000, null, "Wall")],
    [con("a", "wa", "clad"), con("b", "wb", "clad"), con("c", "wc", "clad")]));
  const ps = probs(c, "clad", "wall_incomplete");
  assert.deepEqual(ps.map((p) => p.refs), [[{ measurementId: "wb", missing: ["heightMm"] }], [{ measurementId: "wc", missing: ["heightMm"] }]]);
  assert.deepEqual(ps.map((p) => p.message), ["Wall (wb): enter the Wall height.", "Wall (wc): enter the Wall height."]);
});

t("a wall shape problem carries its wall's measurement ref, scope and the field that fixes it (one code, six fields)", () => {
  const g = (id, inputs) => ({ id, kind: "wall", inputs: { kind: "gable", widthMm: 6000, eavesHeightMm: 2400, apexXMm: 3000, apexHeightMm: 3600, name: id, ...inputs } });
  const ms = [rect("w1", 3000, "abc", "Wall 1"), rect("w2", -5, 2700, "Wall 2"), g("G1", { apexHeightMm: 2000 }), g("G2", { apexXMm: 6000 }), g("G3", { eavesHeightMm: -1 }),
    { id: "r", kind: "wall", inputs: { kind: "rake", widthMm: 3000, startHeightMm: 0, endHeightMm: 0, name: "Rake" } },
    { id: "r2", kind: "wall", inputs: { kind: "rake", widthMm: 3000, startHeightMm: 2400, endHeightMm: "abc", name: "Rake 2" } },
    { id: "o1", kind: "wall", inputs: { kind: "polygon", polygon: [{ x: 0, y: 0 }, { x: 1000, y: 1000 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }], name: "Bow" } },
    { id: "o2", kind: "wall", inputs: { kind: "polygon", polygon: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 0 }], name: "Flat" } }];
  const c = computeWorkspace(ws([axon("clad")], ms, ms.map((m) => con(`c-${m.id}`, m.id, "clad"))));
  const ps = c.materialResults.clad.problems.filter((p) => ["wall_dimension_invalid", "wall_polygon_invalid", "wall_self_intersecting"].includes(p.code));
  assert.deepEqual(ps.map((p) => [p.code, p.message, p.blocking, p.scope, p.refs]), [
    ["wall_dimension_invalid", "Wall 1: Wall height must be a number greater than 0.", true, "wall", [{ measurementId: "w1", missing: ["heightMm"] }]],
    ["wall_dimension_invalid", "Wall 2: Wall length must be a number greater than 0.", true, "wall", [{ measurementId: "w2", missing: ["widthMm"] }]],
    ["wall_dimension_invalid", "G1: Gable apex must be higher than the eaves.", true, "wall", [{ measurementId: "G1", missing: ["apexHeightMm"] }]],
    ["wall_dimension_invalid", "G2: Gable apex position must be between the two wall ends.", true, "wall", [{ measurementId: "G2", missing: ["apexXMm"] }]],
    ["wall_dimension_invalid", "G3: Gable eaves height must be 0 or more.", true, "wall", [{ measurementId: "G3", missing: ["eavesHeightMm"] }]],
    ["wall_dimension_invalid", "Rake: A raked wall needs start and end heights (0 or more, not both 0).", true, "wall", [{ measurementId: "r", missing: ["startHeightMm", "endHeightMm"] }]],
    ["wall_dimension_invalid", "Rake 2: A raked wall needs start and end heights (0 or more, not both 0).", true, "wall", [{ measurementId: "r2", missing: ["endHeightMm"] }]],
    ["wall_self_intersecting", "Bow: The wall outline crosses or touches itself — retrace it.", true, "wall", [{ measurementId: "o1", missing: ["outline"] }]],
    ["wall_polygon_invalid", "Flat: The wall outline has no area.", true, "wall", [{ measurementId: "o2", missing: ["outline"] }]]]);
  // the gable fields agree with the one rule the server and the wall page use (gableInputProblem)
  assert.equal(gableInputProblem(ms[2].inputs, 6000).field, "apexHeightMm");
  assert.equal(gableInputProblem(ms[3].inputs, 6000).field, "apexXMm");
});

t("a Studs (wall_frame) or Walls wall_incomplete says which wall and field too, with its wording unchanged", () => {
  const spec = wallFramingDefaults([]);
  const mk = methodFor(spec);
  const walls = { id: "walls", name: "Walls", methodKey: mk.key, methodVersion: mk.version, spec, rules: { ...WALL_FRAMING_RULES } };
  const studs = { id: "st", name: "Studs", methodKey: "wall_frame", methodVersion: 1, spec: { family: "timber", purpose: "studs", section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2" }, rules: { centresMm: 600 } };
  const ms = [rect("w1", 3000, null, "Wall 1"), rect("w2", null, 2700, "Wall 2"), { ...traced("w3", 4200, "Wall 3", { heightMm: 2700 }), calibrationId: "gone" }];
  const c = computeWorkspace(ws([walls, studs], ms, ms.flatMap((m) => [con(`a-${m.id}`, m.id, "walls"), con(`b-${m.id}`, m.id, "st")])));
  const wi = (id) => probs(c, id, "wall_incomplete").map((p) => [p.message, p.scope, p.refs]);
  assert.deepEqual(wi("walls"), [
    ["Wall 1: enter the Wall height.", "wall", [{ measurementId: "w1", missing: ["heightMm"] }]],
    ["Wall 2: trace the wall length.", "wall", [{ measurementId: "w2", missing: ["widthMm"] }]],
    ["Wall 3: trace the wall length.", "wall", [{ measurementId: "w3", missing: ["scale"] }]]]);
  assert.deepEqual(wi("st"), [
    ["Wall 1: enter the stud cut length or frame height.", "wall", [{ measurementId: "w1", missing: ["heightMm"] }]],
    ["Wall 2: enter or trace the wall length.", "wall", [{ measurementId: "w2", missing: ["widthMm"] }]],
    ["Wall 3: enter or trace the wall length.", "wall", [{ measurementId: "w3", missing: ["scale"] }]]]);
  // a Noggins item with no section names its card field, as familyProblems' needs do
  const nog = { id: "ng", name: "Noggins", methodKey: "linear_stock", methodVersion: 1, spec: { family: "timber", purpose: "noggins", section: {}, grade: "MGP10", treatment: "H2" }, rules: {} };
  const n = computeWorkspace(ws([nog], [rect("w1", 3000, 2700, "Wall 1")], [con("n", "w1", "ng")]));
  assert.ok(n.materialResults.ng.problems.filter((p) => p.code === "material_incomplete").every((p) => p.field === "section"), JSON.stringify(n.materialResults.ng.problems));
  assert.ok(n.materialResults.ng.problems.some((p) => p.message === "Enter the stud/noggin section so the clear bays can be worked out."));
});

t("one incomplete wall holds every line of its cladding and the pooled tape and H-flashing; the other cladding's own lines stay clear", () => {
  const c = computeWorkspace(JOB());
  const block = "Wall 3: enter the Wall height.";
  const own = linesOf(c, "clad");
  assert.ok(own.length >= 4 && own.every((l) => l.problems.includes(block)), JSON.stringify(own.map((l) => [l.item?.description, l.problems])));
  // the complete walls' quantities are still shown (sheets, battens) — never counted as zero
  assert.ok(own.some((l) => l.unit === "sheet" && l.quantity > 0) && own.some((l) => l.follower === "battens" && l.quantity > 0));
  const pooled = c.scheduleLines.filter((l) => l.follower === "tape" || l.follower === "hflashing");
  assert.deepEqual(pooled.map((l) => [l.follower, l.jobMaterialIds]).sort(), [["hflashing", ["clad", "clad2"]], ["tape", ["clad", "clad2"]]]);
  assert.ok(pooled.every((l) => l.problems.includes(block)), "its share of the job's tape and H-flashing is short by that wall");
  const second = linesOf(c, "clad2").filter((l) => !l.follower || l.follower === "battens");
  assert.ok(second.length && second.every((l) => !l.jobMaterialIds.includes("clad") && l.problems.length === 0), JSON.stringify(second.map((l) => l.problems)));
  assert.deepEqual(c.materialResults.clad.status.quantity, "incomplete");
  assert.equal(c.orderReady, false);
  // exactly one blocking problem on the item: Wall 3, with its wall ref
  assert.deepEqual(c.materialResults.clad.problems.filter((p) => p.blocking !== false).map((p) => [p.code, p.refs]), [["wall_incomplete", [{ measurementId: "w3", missing: ["heightMm"] }]]]);
});

t("installation notes never block, each line says each note once, result.problems keeps every wall's copy, and installation stays source-pending", () => {
  const c = computeWorkspace(JOB({ heightMm: 3600 }));
  const r = c.materialResults.clad;
  const walls = r.layouts.length;
  assert.equal(walls, 3);
  for (const code of ["assembly_coverage_unstated", "installation_rule_missing"]) {
    const ps = probs(c, "clad", code);
    assert.equal(ps.length, walls, `${code}: one per wall in result.problems`);
    assert.ok(ps.every((p) => p.blocking === false));
    for (const l of linesOf(c, "clad")) assert.equal(l.notes.filter((n) => n === ps[0].message).length, 1, `${code} once on ${l.item?.description}`);
  }
  for (const l of c.scheduleLines) assert.equal(new Set(l.notes).size, l.notes.length, `no repeated note on ${l.item?.description}`);
  assert.equal(r.status.installation, "source-pending");
  assert.equal(c.materialResults.clad2.status.installation, "source-pending");
});

t("at Wall height 3,600 every line clears and the job is ready; a measured item held with no lines makes it not ready; an item with nothing measured doesn't", () => {
  const ready = JOB({ heightMm: 3600 });
  const c = computeWorkspace(ready);
  assert.ok(c.scheduleLines.length && c.scheduleLines.every((l) => l.problems.length === 0), JSON.stringify(c.scheduleLines.filter((l) => l.problems.length).map((l) => l.problems)));
  assert.deepEqual([c.materialResults.clad.status, c.orderReady], [{ quantity: "calculated", installation: "source-pending", procurement: "ready" }, true]);
  // a Support battens item on Wall 1 with no product: blocked, no lines at all — the job isn't ready while it is held
  const bat = { id: "bat", name: "Support battens", ...fam({ family: "batten", product: {} }), rules: {} };
  const held = computeWorkspace({ ...ready, materials: [...ready.materials, bat], contributions: [...ready.contributions, con("s1", "w1", "bat")] });
  assert.deepEqual(linesOf(held, "bat"), []);
  assert.ok(held.materialResults.bat.problems.some((p) => p.blocking !== false));
  assert.ok(held.scheduleLines.every((l) => l.problems.length === 0), "every listed line is clear");
  assert.deepEqual(held.unplaced, [], "nothing unplaced either: only the held item says it isn't ready");
  assert.equal(held.orderReady, false);
  // an empty Timber item (nothing measured, no section) never holds the job
  const timber = { id: "raf", name: "Timber (rafters)", methodKey: "repeated_members", methodVersion: 2, spec: { family: "timber", purpose: "rafters", section: {} }, rules: {} };
  const empty = computeWorkspace({ ...ready, materials: [...ready.materials, timber] });
  assert.ok(empty.materialResults.raf.problems.some((p) => p.blocking !== false), "it has needs of its own");
  assert.equal(empty.orderReady, true);
  // a flashing-only job keeps its own rule (no generic items): unchanged
  assert.equal(computeWorkspace(ws([], [], [])).orderReady, false, "nothing on the schedule is never ready");
});

t("the rescale review lists a traced wall on a re-scaled page with its length before and after; applying the new scale clears calibration_superseded", () => {
  const w = { ...JOB({ heightMm: 3600 }), calibrations: [CAL, CAL2] };
  const c = computeWorkspace(w);
  assert.ok(linesOf(c, "clad").every((l) => l.problems.includes("calibration_superseded")), "the traced wall's cladding is held by the old scale");
  const rows = rescaleCandidates(w);
  assert.deepEqual(rows.map((r) => [r.measurement.id, r.from.id, r.to.id, r.before, r.after]), [["w3", "cal", "cal2", null, null]], "entered walls are never listed");
  assert.ok(Math.abs(rows[0].wall.beforeMm - 420) < 1e-6 && Math.abs(rows[0].wall.afterMm - 441) < 1e-6, JSON.stringify(rows[0].wall));
  // the review's own apply: the same calibrationId re-stamp it does for runs (RescaleReview.jsx)
  const applied = { ...w, measurements: w.measurements.map((m) => (m.id === rows[0].measurement.id ? { ...m, calibrationId: rows[0].to.id } : m)) };
  const after = computeWorkspace(applied);
  assert.ok(after.scheduleLines.every((l) => !l.problems.includes("calibration_superseded")), JSON.stringify(after.scheduleLines.map((l) => l.problems)));
  assert.deepEqual(rescaleCandidates(applied), []);
  assert.equal(after.orderReady, true);
  // a traced elevation outline reads its width along the wall; an archived wall is never listed
  const outline = { id: "ol", kind: "wall", documentId: "d", pageIndex: 0, calibrationId: "cal", points: [{ x: 10, y: 10 }, { x: 160, y: 10 }, { x: 160, y: 130 }, { x: 10, y: 130 }], inputs: { kind: "polygon", name: "Outline" } };
  const two = rescaleCandidates({ ...w, measurements: [...w.measurements, outline, { ...traced("gone", 1000, "Gone"), archived: true }] });
  const ol = two.find((r) => r.measurement.id === "ol");
  assert.ok(Math.abs(ol.wall.beforeMm - 3000) < 1e-6 && Math.abs(ol.wall.afterMm - 3150) < 1e-6, JSON.stringify(ol.wall));
  // an outline grows in height too (so its sheets change): the row says both
  assert.ok(Math.abs(ol.wall.heightBeforeMm - 2400) < 1e-6 && Math.abs(ol.wall.heightAfterMm - 2520) < 1e-6, JSON.stringify(ol.wall));
  assert.ok(!two.some((r) => r.measurement.id === "gone"));
  assert.deepEqual(rows[0].wall.problem, null);
  assert.ok(!("heightAfterMm" in rows[0].wall), "a wall along a line has an entered height, never a scaled one");
});

t("the rescale review says why a traced wall can't take the new scale (the server would refuse it, runs included), and that openings keep their sizes", () => {
  // the page was first scaled 2x too long (1 unit = 40 mm), then scaled correctly (1 unit = 20 mm)
  const LONG = { ...scale(40), id: "cal", documentId: "d", pageIndex: 0, calibrationRevision: 1 };
  const RIGHT = { ...scale(20), id: "cal2", documentId: "d", pageIndex: 0, calibrationRevision: 2 };
  const tr = (id, units, inputs) => ({ id, kind: "wall", documentId: "d", pageIndex: 0, calibrationId: "cal", points: [{ x: 1, y: 1 }, { x: 1 + units, y: 1 }], inputs: { kind: "rect", name: id, ...inputs } });
  // a gable traced at 6,000 with its apex centred (the wall page's "Centre (3,000)"), really 3,000 long
  const gable = tr("Gable", 150, { kind: "gable", eavesHeightMm: 2400, apexHeightMm: 3600, apexXMm: 3000 });
  const fine = tr("Wall 1", 100, { heightMm: 2700 });
  const ops = [
    { id: "o1", kind: "opening", parentId: "Wall 1", inputs: { xMm: 500, sillMm: 900, widthMm: 900, heightMm: 1200, label: "W1", type: "window" } },
    { id: "o2", kind: "opening", parentId: "Wall 1", inputs: { xMm: 2400, sillMm: 0, widthMm: 820, heightMm: 2040, label: "D1", type: "door" } },
    { id: "o3", kind: "opening", parentId: "Wall 1", inputs: { xMm: 100, sillMm: 0, widthMm: 100, heightMm: 100, label: "X" }, archived: true }];
  const view = ws([axon("clad")], [gable, fine, ...ops], [con("a", "Gable", "clad"), con("b", "Wall 1", "clad")], [LONG, RIGHT]);
  const rows = rescaleCandidates(view);
  const g = rows.find((r) => r.measurement.id === "Gable"), w = rows.find((r) => r.measurement.id === "Wall 1");
  assert.deepEqual([g.wall.beforeMm, g.wall.afterMm], [6000, 3000]);
  assert.deepEqual(g.wall.problem, { code: "wall_dimension_invalid", field: "apexXMm", message: "At 3,000 mm long the apex is off the wall: change the Apex position first." });
  // exactly the server's check on the re-stamp (cleanInputs → gableInputProblem on the length under the new scale)
  assert.equal(gableInputProblem(gable.inputs, g.wall.afterMm)?.field, "apexXMm");
  assert.deepEqual([w.wall.beforeMm, w.wall.afterMm, w.wall.problem], [4000, 2000, null]);
  // openings are kept in mm (as entered or tapped), so they don't move with the scale: D1 (2,400 to 3,220) no longer fits
  assert.deepEqual(w.wall.openings, [{ id: "o1", label: "W1", fits: true }, { id: "o2", label: "D1", fits: false }]);
  // with the apex moved first, the gable can take the new scale
  const moved = rescaleCandidates({ ...view, measurements: view.measurements.map((m) => (m.id === "Gable" ? { ...m, inputs: { ...m.inputs, apexXMm: 1500 } } : m)) });
  assert.equal(moved.find((r) => r.measurement.id === "Gable").wall.problem, null);
  // a newer scale whose region no longer covers the wall: the server refuses it as outside the scaled region
  const boxed = { ...RIGHT, region: { x0: 0, y0: 0, x1: 50, y1: 50 } };
  const out = rescaleCandidates({ ...view, calibrations: [LONG, boxed] }).find((r) => r.measurement.id === "Wall 1");
  assert.equal(out.wall.problem?.code, "outside_region");
});

t("every familyProblems need names its card field (one of FAMILY_NEED_FIELDS), and the messages are unchanged", () => {
  const blank = (k) => ({ section: {}, stock: { maxMm: 600, unavailableMm: [] }, component: k });
  const specs = [
    { family: "timber", purpose: "rafters", section: {} },
    { family: "timber", purpose: "walls", components: { studs: blank("studs"), plates: blank("plates"), longPlates: blank("longPlates"), noggins: blank("noggins") } },
    { family: "aluminium", profile: {}, stockLengthMm: 6500 },
    { family: "batten", product: {} },
    { family: "accessory", product: {} },
    { family: "cladding", layout: "sheet", product: {} },
    { family: "cladding", layout: "grid", product: {} },
    { family: "aac", product: {} },
    { family: "foam", product: {} },
    { family: "timber-cladding", layout: "course", supply: "random", product: {} },
  ];
  const used = new Set();
  for (const s of specs) {
    const ps = familyProblems(s, { usesLongPlates: true });
    assert.ok(ps.length, s.family);
    for (const p of ps) {
      assert.ok(FAMILY_NEED_FIELDS.includes(p.field), `${s.family}: "${p.message}" names ${p.field}`);
      used.add(p.field);
    }
  }
  assert.deepEqual([...used].sort(), [...FAMILY_NEED_FIELDS].sort(), "every field is one a need really names");
  assert.deepEqual(familyProblems({ family: "batten", product: {} }).map((p) => [p.field, p.message]), [
    ["product", "Choose the batten / rail product."], ["product.size", "Enter the batten section (width × thickness)."], ["product.lengths", "Enter the stock length(s)."]]);
  assert.deepEqual(familyProblems({ family: "timber", purpose: "walls", components: { studs: { ...blank("studs"), section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", stock: { maxMm: 6000 } } } })
    .filter((p) => p.part === "studs").map((p) => [p.part, p.field, p.message]), [["studs", "treatment", "Studs: enter the treatment (or \"untreated\")."]]);
  // the field travels onto the material's own problems (the panel and the fix rows read them there)
  const c = computeWorkspace(ws([{ id: "bat", name: "Support battens", ...fam({ family: "batten", product: {} }), rules: {} }], [rect("w1", 3000, 2700, "Wall 1")], [con("s", "w1", "bat")]));
  assert.deepEqual(probs(c, "bat", "material_incomplete").map((p) => [p.field, p.blocking]), [["product", true], ["product.size", true], ["product.lengths", true]]);
});

t("regression: one Axon wall with no heights is still an incomplete draft with no lines (TC-R04 J2), never zero", () => {
  const c = computeWorkspace(ws([axon("clad")], [rect("north", 4800, null, "North")], [con("a", "north", "clad")]));
  assert.deepEqual(linesOf(c, "clad"), []);
  assert.deepEqual(probs(c, "clad", "wall_incomplete").map((p) => [p.message, p.refs]), [["North: enter the Wall height.", [{ measurementId: "north", missing: ["heightMm"] }]]]);
  assert.equal(c.orderReady, false);
});

console.log(`takeoff-tc-hub029: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
