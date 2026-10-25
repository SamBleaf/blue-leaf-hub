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
// Part B, build step 2 (fix rows, shared/takeoff/fixes.js), on the same synthetic walls:
//   - fixesFor turns every blocker into one row with a target (a wall at its missing field, the card at a field, a
//     one-tap apply, Measure, the scale or the rescale review, or HUB 010's flashing route), deduped by target: the
//     recorded job's Wall 3 is exactly ONE row on every line it holds (pooled tape and H-flashing included);
//   - a raw plan code on a line is mapped back through the contributions to the measurement that carries it;
//   - installation notes (isInstallationNote), nothing_measured and opening_clipped are never rows; an item with nothing
//     measured has none; two walls (or two items) with the same name are kept apart, and same-name items name their walls;
//   - guard: every code the engine raises is classified (a fix target, a note, or internal to a module whose problems
//     never reach a line), notes never block, and a corpus of blocked takeoffs gives every blocker an explicit target;
//   - Sam's decision 6 (25 Oct): a new Walls item starts with his products (studs 90 × 35 LVL Smart 10 H2, plates
//     90 × 45 MGP10 H2, long plates 90 × 45 LVL Smart 10 H2, noggins 90 × 35 MGP10 untreated), so it has no fix rows,
//     and its 35 mm studs set the side studs, merges and noggin bays.
//   node scripts/tests/takeoff-tc-hub029.test.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  BLUE_LEAF_SHEET_JOINT, FAMILY_NEED_FIELDS, FIX_APPLY_ACTIONS, FIX_CARD_FIELDS, FIX_ROUTES, FIX_TARGETS, FIX_TARGET_KINDS, FIX_WALL_FIELDS, INSTALLATION_STATUS, NOTE_CODES,
  PROBLEM_TEXT, PROCUREMENT_STATUS, QUANTITY_STATUS, WALL_FRAMING_RULES, buildCalibration, computeWorkspace, familyProblems, fixEntryFor, fixTargetKey, fixesFor, gableInputProblem,
  isInstallationNote, methodFor, rescaleCandidates, starterProfile, verifyCalibration, wallFramingDefaults, wallIncompleteText, wallsText,
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

t("one incomplete wall holds every line of its cladding and the job's pooled battens, tape and H-flashing; the other cladding's own sheets stay clear", () => {
  const c = computeWorkspace(JOB());
  const block = "Wall 3: enter the Wall height.";
  const own = linesOf(c, "clad");
  assert.ok(own.length >= 4 && own.every((l) => l.problems.includes(block)), JSON.stringify(own.map((l) => [l.item?.description, l.problems])));
  // the complete walls' quantities are still shown (sheets, battens) — never counted as zero
  assert.ok(own.some((l) => l.unit === "sheet" && l.quantity > 0) && own.some((l) => l.follower === "battens" && l.quantity > 0));
  // HUB 030 (Sam: "Whole job"): the pine battens are bought once for the job too, so they carry the block as the tape
  // and H-flashing do — their quantity is short by that wall's share
  const pooled = c.scheduleLines.filter((l) => l.follower === "tape" || l.follower === "hflashing" || l.follower === "battens");
  // (a pine length can serve walls of the first cladding only, so some batten lines name it alone)
  assert.deepEqual([...new Set(pooled.map((l) => `${l.follower} ${l.jobMaterialIds.join("+")}`))].sort(), ["battens clad", "battens clad+clad2", "hflashing clad+clad2", "tape clad+clad2"]);
  assert.ok(pooled.every((l) => l.problems.includes(block)), "its share of the job's battens, tape and H-flashing is short by that wall");
  const second = linesOf(c, "clad2").filter((l) => !l.follower);
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
  // a Walls item on a wall with no height: blocked, no lines at all — the job isn't ready while it is held (HUB 030 made
  // an empty Support battens product the owner's pine batten, so that is no longer the example)
  const wf = { id: "wf", name: "Walls", ...fam(wallFramingDefaults()), rules: {} };
  const held = computeWorkspace({ ...ready, materials: [...ready.materials, wf], measurements: [...ready.measurements, rect("wx", 3000, null, "Wall X")],
    contributions: [...ready.contributions, con("s1", "wx", "wf")] });
  assert.deepEqual(linesOf(held, "wf"), []);
  assert.ok(held.materialResults.wf.problems.some((p) => p.blocking !== false && p.code === "wall_incomplete"));
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
    { family: "batten", product: { id: "custom-batten" } },   // an EMPTY batten product takes the owner's pine (HUB 030)
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
  assert.deepEqual(familyProblems({ family: "batten", product: {} }), [], "HUB 030: an empty Support battens product is the owner's pine batten, so it needs nothing");
  assert.deepEqual(familyProblems({ family: "batten", product: { id: "custom-batten" } }).map((p) => [p.field, p.message]), [
    ["product", "Choose the batten / rail product."], ["product.size", "Enter the batten section (width × thickness)."], ["product.lengths", "Enter the stock length(s)."]]);
  assert.deepEqual(familyProblems({ family: "timber", purpose: "walls", components: { studs: { ...blank("studs"), section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", stock: { maxMm: 6000 } } } })
    .filter((p) => p.part === "studs").map((p) => [p.part, p.field, p.message]), [["studs", "treatment", "Studs: enter the treatment (or \"untreated\")."]]);
  // the field travels onto the material's own problems (the panel and the fix rows read them there)
  const c = computeWorkspace(ws([{ id: "bat", name: "Support battens", ...fam({ family: "batten", product: { id: "custom-batten" } }), rules: {} }], [rect("w1", 3000, 2700, "Wall 1")], [con("s", "w1", "bat")]));
  assert.deepEqual(probs(c, "bat", "material_incomplete").map((p) => [p.field, p.blocking]), [["product", true], ["product.size", true], ["product.lengths", true]]);
});

t("regression: one Axon wall with no heights is still an incomplete draft with no lines (TC-R04 J2), never zero", () => {
  const c = computeWorkspace(ws([axon("clad")], [rect("north", 4800, null, "North")], [con("a", "north", "clad")]));
  assert.deepEqual(linesOf(c, "clad"), []);
  assert.deepEqual(probs(c, "clad", "wall_incomplete").map((p) => [p.message, p.refs]), [["North: enter the Wall height.", [{ measurementId: "north", missing: ["heightMm"] }]]]);
  assert.equal(c.orderReady, false);
});

// ── Part B: fix rows (build step 2) ──────────────────────────────────────────

const rowsOf = (w, opts) => fixesFor(computeWorkspace(w), w, opts);
const blockedKeys = (c, message) => c.scheduleLines.filter((l) => l.problems.includes(message)).map((l) => l.bucketKey).sort();

t("fixes: the recorded job's one blocker is exactly ONE row, a wall target at its missing field, on every line it holds (pooled ones too)", () => {
  const w = JOB();
  const c = computeWorkspace(w);
  const rows = fixesFor(c, w);
  assert.equal(rows.length, 1, JSON.stringify(rows.map((r) => r.short)));
  const [r] = rows;
  assert.deepEqual(r.target, { kind: "wall", materialId: "clad", measurementId: "w3", field: "heightMm" });
  assert.equal(r.key, fixTargetKey(r.target));
  assert.deepEqual([r.code, r.codes, r.materialId, r.wallId, r.subject, r.action], ["wall_incomplete", ["wall_incomplete"], "clad", "w3", "Wall 3", "enter the Wall height"]);
  assert.equal(r.short, "Wall 3: enter the Wall height");
  assert.equal(r.reason, "Wall 3 has no Wall height", "the line label reads 'not orderable yet: Wall 3 has no Wall height ›'");
  // the two Axon items share a name, so the row names this one's walls
  assert.equal(r.walls, "Walls 1, 3–4");
  assert.equal(r.text, "Wall 3 on Axon 400 smooth (Walls 1, 3–4): enter the Wall height");
  // every line that carries it points at this row: all of the first Axon's lines and the job's pooled battens (HUB 030),
  // tape and H-flashing
  const pooledKeys = c.scheduleLines.filter((l) => l.follower === "tape" || l.follower === "hflashing" || l.follower === "battens").map((l) => l.bucketKey).sort();
  assert.deepEqual([...r.bucketKeys].sort(), blockedKeys(c, "Wall 3: enter the Wall height."));
  assert.ok(pooledKeys.every((k) => r.bucketKeys.includes(k)), "the pooled lines too");
  // the second Axon's panel lists the pooled lines, so it shows the same row (the first Axon's, naming its walls)
  const second = fixesFor(c, w, { materialId: "clad2" });
  assert.deepEqual(second.map((x) => [x.key, x.materialId, x.text]), [[r.key, "clad", r.text]]);
  assert.deepEqual([...second[0].bucketKeys].sort(), c.scheduleLines.filter((l) => l.follower && l.jobMaterialIds.includes("clad2")).map((l) => l.bucketKey).sort(), "the pooled lines it lists");
  // the Timber and cladding section has it; Flashings has nothing
  assert.deepEqual(fixesFor(c, w, { section: "timber_cladding" }).map((x) => x.key), [r.key]);
  assert.deepEqual(fixesFor(c, w, { section: "flashings" }), []);
  // with the height entered there is nothing left to fix
  assert.deepEqual(rowsOf(JOB({ heightMm: 3600 })), []);
});

t("fixes: an incomplete wall's row targets exactly its fix: the field, the page's scale, or retracing the outline", () => {
  const one = (m) => rowsOf(ws([axon("clad")], [m], [con("a", m.id, "clad")]));
  const cases = [
    [rect("w5", null, 2700, "Wall 5"), { kind: "wall", materialId: "clad", measurementId: "w5", field: "widthMm" }, "Wall 5 has no Wall length"],
    [{ id: "r", kind: "wall", inputs: { kind: "rake", widthMm: 3000, name: "Rake" } }, { kind: "wall", materialId: "clad", measurementId: "r", field: "startHeightMm" }, "Rake has no Height at start or end"],
    [{ id: "g", kind: "wall", inputs: { kind: "gable", widthMm: 6000, eavesHeightMm: 2400, name: "Gable" } }, { kind: "wall", materialId: "clad", measurementId: "g", field: "apexHeightMm" },
      "Gable has no Apex height or Apex position"],
    [{ ...traced("w3", 420, "Wall 3"), calibrationId: "gone" }, { kind: "scale", documentId: "d", pageIndex: 0, measurementIds: ["w3"] }, "Wall 3 is on a plan page with no scale"],
    [{ id: "ol", kind: "wall", documentId: "d", pageIndex: 0, calibrationId: "cal", points: [{ x: 1, y: 1 }, { x: 50, y: 1 }], inputs: { kind: "polygon", name: "Outline" } },
      { kind: "measure", materialId: "clad", documentId: "d", pageIndex: 0, measurementIds: ["ol"] }, "Outline has no traced outline"],
  ];
  for (const [m, target, reason] of cases) {
    const rows = one(m).filter((r) => r.code === "wall_incomplete");
    assert.equal(rows.length, 1, `${m.id}: ${JSON.stringify(one(m).map((r) => r.short))}`);
    assert.deepEqual([rows[0].target, rows[0].reason], [target, reason], m.id);
  }
  // a shape problem goes to the field that fixes it; a traced outline that crosses itself is retraced on the plan
  const g = { id: "G1", kind: "wall", inputs: { kind: "gable", widthMm: 6000, eavesHeightMm: 2400, apexXMm: 3000, apexHeightMm: 2000, name: "G1" } };
  assert.deepEqual(one(g).map((r) => [r.code, r.target]), [["wall_dimension_invalid", { kind: "wall", materialId: "clad", measurementId: "G1", field: "apexHeightMm" }]]);
  const bow = { id: "bow", kind: "wall", documentId: "d", pageIndex: 0, calibrationId: "cal", points: [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 50, y: 0 }, { x: 0, y: 50 }], inputs: { kind: "polygon", name: "Bow" } };
  assert.deepEqual(one(bow).map((r) => [r.code, r.target.kind, r.target.measurementIds, r.short]),
    [["wall_self_intersecting", "measure", ["bow"], "Bow: retrace the outline (it crosses itself)"]]);
  // an opening's problem opens its wall with that opening's form
  const wo = rect("wo", 3000, 2700, "Wall O");
  const ops = [{ id: "op1", kind: "opening", parentId: "wo", inputs: { xMm: 9000, sillMm: 0, widthMm: 900, heightMm: 900, label: "W1" } }];
  assert.deepEqual(rowsOf(ws([axon("clad")], [wo, ...ops], [con("a", "wo", "clad")])).map((r) => [r.target, r.short]),
    [[{ kind: "wall", materialId: "clad", measurementId: "wo", openingId: "op1" }, "Wall O: W1 is outside the wall"]]);
});

t("fixes: installation notes are notes (isInstallationNote), never rows; the assembly mismatch still blocks and is ONE tap that clears it", () => {
  const w = JOB({ heightMm: 3600 });
  const c = computeWorkspace(w);
  const notes = c.materialResults.clad.problems.filter(isInstallationNote);
  assert.ok(notes.length >= 6 && notes.every((p) => p.blocking === false && p.axis === "installation"));
  assert.ok(["assembly_coverage_unstated", "installation_rule_missing"].every((code) => notes.some((p) => p.code === code)));
  assert.ok(notes.every((p) => NOTE_CODES.includes(p.code)));
  assert.deepEqual(fixesFor(c, w), [], "never a fix row");
  assert.equal(c.materialResults.clad.status.installation, "source-pending", "the engine's status is unchanged");
  // a hand-picked assembly for another product (Linea's on the Axon): axis installation but BLOCKING — not a note
  const mis = { ...axon("clad"), spec: { ...axon("clad").spec, assemblyId: "linea-horizontal" } };
  const wm = ws([mis], [rect("w1", 3600, 2700, "Wall 1"), rect("w2", 3000, 2700, "Wall 2")], [con("a", "w1", "clad"), con("b", "w2", "clad")]);
  const cm = computeWorkspace(wm);
  const p = cm.materialResults.clad.problems.find((x) => x.code === "assembly_method_mismatch");
  assert.ok(p && p.blocking === true && p.axis === "installation" && !isInstallationNote(p));
  const rows = fixesFor(cm, wm);
  assert.deepEqual(rows.map((r) => [r.target, r.short]), [[{ kind: "apply", materialId: "clad", action: "clearAssembly" },
    "Axon 400 smooth: the assembly doesn't match this product: clear it"]]);
  assert.ok(rows[0].bucketKeys.length && rows[0].bucketKeys.length === cm.scheduleLines.filter((l) => l.problems.length).length);
  // the apply: clear the assembly → nothing left to fix
  const cleared = { ...wm, materials: [{ ...mis, spec: { ...mis.spec, assemblyId: null } }] };
  assert.deepEqual(rowsOf(cleared), []);
  assert.ok(computeWorkspace(cleared).scheduleLines.every((l) => !l.problems.length));
});

t("fixes: a raw plan code on a line is mapped back through the contributions to the measurement that carries it", () => {
  // the page was re-scaled: the rescale review with Wall 3 ticked, one row for the page
  const re = { ...JOB({ heightMm: 3600 }), calibrations: [CAL, CAL2] };
  const c = computeWorkspace(re);
  const rows = fixesFor(c, re);
  assert.deepEqual(rows.map((r) => [r.code, r.target, r.short]),
    [["calibration_superseded", { kind: "rescale", documentId: "d", pageIndex: 0, measurementIds: ["w3"] }, "Page 1 was re-scaled: use the new scale for Wall 3"]]);
  assert.deepEqual([...rows[0].bucketKeys].sort(), blockedKeys(c, "calibration_superseded"));
  // the review's own apply (re-stamp the wall's scale) clears it
  const applied = { ...re, measurements: re.measurements.map((m) => (m.id === "w3" ? { ...m, calibrationId: "cal2" } : m)) };
  assert.deepEqual(rowsOf(applied), []);
  // a scale that isn't checked, a wall outside the scaled area, one on a replaced plan, one whose scale is gone
  const UNCHECKED = { ...buildCalibration({ horizontal: { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, knownMm: 2000 }, vertical: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 100 }, knownMm: 2000 } }).calibration,
    id: "calu", documentId: "d2", pageIndex: 0, calibrationRevision: 1 };
  const BOXED = { ...CAL, id: "calb", documentId: "d3", region: { x0: 0, y0: 0, x1: 50, y1: 50 } };
  const OLD = { ...CAL, id: "calo", documentId: "dold" };
  const tr = (id, cal, doc, extra = {}) => ({ ...traced(id, 3000, id, { heightMm: 2700, ...extra }), calibrationId: cal, documentId: doc });
  const v = { ...ws([axon("clad")], [tr("T1", "calu", "d2"), tr("T2", "calb", "d3"), tr("T3", "calo", "dold"), tr("T4", "gone", "d", { widthMm: 3000 })],
    ["T1", "T2", "T3", "T4"].map((id) => con(`c${id}`, id, "clad")), [CAL, UNCHECKED, BOXED, OLD]),
    documents: [{ id: "d", status: "current" }, { id: "d2", status: "current" }, { id: "d3", status: "current" }, { id: "dold", status: "superseded" }] };
  const got = rowsOf(v).map((r) => [r.code, r.target, r.short]);
  assert.deepEqual(got.sort(), [
    ["calibration_missing", { kind: "scale", documentId: "d", pageIndex: 0, measurementIds: ["T4"] }, "Page 1 isn't scaled: scale it"],
    ["calibration_not_ready", { kind: "scale", documentId: "d2", pageIndex: 0, measurementIds: ["T1"] }, "Page 1's scale isn't checked: check it"],
    ["outside_region", { kind: "measure", materialId: "clad", documentId: "d3", pageIndex: 0, measurementIds: ["T2"] }, "T2 is outside the scaled area: retrace it"],
    ["plan_superseded", { kind: "measure", materialId: "clad", documentId: "dold", pageIndex: 0, measurementIds: ["T3"] }, "T3 is on a replaced plan: retrace it on the current plan"],
  ].sort());
  // a run on a cladding (it can't use it): one tap takes it off that material, and only that contribution
  const runM = { id: "r1", kind: "run", documentId: "d", pageIndex: 0, calibrationId: "cal", points: [{ x: 1, y: 1 }, { x: 101, y: 1 }] };
  const u = ws([axon("clad")], [rect("w1", 3600, 2700, "Wall 1"), runM], [con("a", "w1", "clad"), con("e", "r1", "clad", "primary")]);
  const ur = rowsOf(u);
  assert.deepEqual(ur.map((r) => [r.target, r.short]), [[{ kind: "apply", materialId: "clad", action: "removeContribution", contributionId: "e", measurementId: "r1" },
    "A run is on the wrong material: remove it from Axon 400 smooth"]]);
  assert.deepEqual(rowsOf({ ...u, contributions: u.contributions.filter((x) => x.id !== "e") }), []);
});

t("fixes: two walls with the same name get different targets; two items with the same name stay apart and name their walls", () => {
  // one item, two walls called "Wall" with no height
  const same = ws([axon("clad")], [rect("wa", 3000, 2700, "Wall"), rect("wb", 3000, null, "Wall"), rect("wc", 2000, null, "Wall")], [con("a", "wa", "clad"), con("b", "wb", "clad"), con("c", "wc", "clad")]);
  assert.deepEqual(rowsOf(same).map((r) => [r.target.measurementId, r.short]), [["wb", "Wall (wb): enter the Wall height"], ["wc", "Wall (wc): enter the Wall height"]]);
  // two "Axon 400 smooth" items, each with a wall with no height and no product: four rows, each naming its item's walls
  const bare = (id) => ({ ...axon(id), spec: { ...axon(id).spec, product: {} } });
  const two = ws([bare("A"), bare("B")], [rect("w1", 3600, 2700, "Wall 1"), rect("w3", 420, null, "Wall 3"), rect("w12", 3000, 2700, "Wall 12"), rect("w13", 2400, null, "Wall 13")],
    [con("a1", "w1", "A"), con("a3", "w3", "A"), con("b12", "w12", "B"), con("b13", "w13", "B")]);
  const rows = rowsOf(two);
  const pick = (mid, kind) => rows.filter((r) => r.materialId === mid && r.target.kind === kind).map((r) => r.text);
  assert.deepEqual(pick("A", "wall"), ["Wall 3 on Axon 400 smooth (Walls 1, 3): enter the Wall height"]);
  assert.deepEqual(pick("B", "wall"), ["Wall 13 on Axon 400 smooth (Walls 12–13): enter the Wall height"]);
  assert.ok(pick("A", "card").includes("Axon 400 smooth (Walls 1, 3): choose the product") && pick("B", "card").includes("Axon 400 smooth (Walls 12–13): choose the product"),
    JSON.stringify(rows.map((r) => r.text)));
  assert.equal(new Set(rows.map((r) => r.key)).size, rows.length, "every row its own target");
  // one wall on two items (a cladding and its Support battens) with no height: one tap fixes both, so it is ONE row
  const bat = { id: "bat", name: "Support battens", ...fam({ family: "batten", product: { name: "Pine", widthMm: 90, thicknessMm: 35, lengthsMm: [3600, 4200] } }), rules: { maxSpacingMm: 600 } };
  const shared = ws([axon("clad"), bat], [rect("w1", 3600, 2700, "Wall 1"), rect("w3", 3000, null, "Wall 3")], [con("a1", "w1", "clad"), con("a3", "w3", "clad"), con("s1", "w1", "bat"), con("s3", "w3", "bat")]);
  const sr = rowsOf(shared).filter((r) => r.code === "wall_incomplete");
  assert.deepEqual(sr.map((r) => [r.target.measurementId, r.materialIds]), [["w3", ["clad", "bat"]]]);
});

t("fixes: dedupe by target — one tap that fixes many problems is one row", () => {
  // three walls taller than the sheet on an Axon with no joint rule: one 'use a 10 mm joint' apply for the item
  const tall = { ...axon("clad"), rules: { route: "cavity" } };
  const w = ws([tall], [rect("w1", 3600, 3600, "Wall 1"), rect("w2", 3000, 4200, "Wall 2"), rect("w3", 2400, 2700, "Wall 3"), rect("w4", 2000, 3300, "Wall 4")],
    ["w1", "w2", "w3", "w4"].map((id) => con(`c${id}`, id, "clad")));
  const rows = rowsOf(w);
  assert.deepEqual(rows.map((r) => [r.code, r.target]), [["sheet_too_tall", { kind: "apply", materialId: "clad", action: "useSheetJoint", jointRows: { atMm: [], ...BLUE_LEAF_SHEET_JOINT } }]]);
  assert.deepEqual([rows[0].count, [...rows[0].wallIds].sort()], [3, ["w1", "w2", "w4"]]);
  assert.equal(rows[0].short, "Axon 400 smooth: walls taller than the sheet: use a 10 mm joint with an H-flashing");
  // the apply exactly as the wall page's own button does it clears every wall
  assert.deepEqual(rowsOf({ ...w, materials: [{ ...tall, rules: { ...tall.rules, jointRows: rows[0].target.jointRows } }] }), []);
  // with a joint rule already set, a sheet that still doesn't fit opens that wall's joint row sheet
  const ruled = { ...tall, rules: { route: "cavity", jointRows: { atMm: [1000], gapMm: 10, detailRef: "H-flashing" } } };
  const wr = rowsOf(ws([ruled], [rect("w2", 3000, 4200, "Wall 2")], [con("a", "w2", "clad")]));
  assert.deepEqual(wr.map((r) => [r.code, r.target]), [["sheet_too_tall", { kind: "wall", materialId: "clad", measurementId: "w2", sheet: "jointRow" }]]);
  // a Support battens item with no spacing on two walls: nothing to fix (HUB 030 decision 2: 600 centres and no counted
  // fixings are Sam's defaults); a fixing scope marked "by others" with no reason on both walls is ONE row
  const bat = { id: "bat", name: "Support battens", ...fam({ family: "batten", product: { name: "Pine", widthMm: 90, thicknessMm: 35, lengthsMm: [3600, 4200] } }), rules: {} };
  const two = (rules) => ws([{ ...bat, rules }], [rect("w1", 3600, 2700, "Wall 1"), rect("w2", 3000, 2700, "Wall 2")], [con("a", "w1", "bat"), con("b", "w2", "bat")]);
  assert.deepEqual(rowsOf(two({})), []);
  const b = rowsOf(two({ fixingScope: { status: "by-others" } }));
  assert.equal(b.length, 1, JSON.stringify(b.map((r) => r.short)));
  assert.deepEqual([b[0].code, b[0].target.kind, b[0].target.materialId], ["scope-reason-missing", "card", "bat"]);
  // a material need and the engine's own copy of it are one row (the aluminium kerf)
  const al = { id: "al", name: "Angle", methodKey: "linear_stock", methodVersion: 1, spec: { family: "aluminium", profile: { shape: "angle", aMm: 50, bMm: 50, tMm: 3 }, stockLengthMm: 6500 }, rules: {} };
  const ar = rowsOf(ws([al], [{ id: "r1", kind: "run", documentId: "d", pageIndex: 0, calibrationId: "cal", points: [{ x: 1, y: 1 }, { x: 101, y: 1 }] }], [con("a", "r1", "al", "primary")]));
  assert.deepEqual(ar.map((r) => [r.codes, r.target]), [[["material_incomplete", "kerf_unconfirmed"], { kind: "card", materialId: "al", field: "kerfMm" }]]);
});

t("fixes: card targets name the field (a Walls part's too); an item with nothing measured has no rows; a flashing keeps HUB 010's route", () => {
  const spec = wallFramingDefaults([]);
  const mk = methodFor(spec);
  const noTreat = { ...spec, components: { ...spec.components, studs: { ...spec.components.studs, treatment: null } } };
  const walls = { id: "walls", name: "Walls", methodKey: mk.key, methodVersion: mk.version, spec: noTreat, rules: { ...WALL_FRAMING_RULES } };
  const wr = rowsOf(ws([walls], [rect("w1", 3000, 2700, "Wall 1")], [con("a", "w1", "walls")]));
  assert.deepEqual(wr.map((r) => [r.target, r.short, r.text]), [[{ kind: "card", materialId: "walls", field: "treatment", part: "studs" }, "Studs: enter the treatment", "Studs on Walls: enter the treatment"]]);
  // the empty Timber (rafters) item: its needs are setup, not fixes, until something is measured for it
  const raf = { id: "raf", name: "Timber (rafters)", methodKey: "repeated_members", methodVersion: 2, spec: { family: "timber", purpose: "rafters", section: {} }, rules: {} };
  const empty = ws([raf], [], []);
  assert.ok(computeWorkspace(empty).materialResults.raf.problems.some((p) => p.blocking !== false));
  assert.deepEqual(rowsOf(empty), []);
  const runM = { id: "r1", kind: "run", documentId: "d", pageIndex: 0, calibrationId: "cal", points: [{ x: 1, y: 1 }, { x: 201, y: 1 }] };
  assert.deepEqual(rowsOf(ws([raf], [runM], [con("a", "r1", "raf", "distribution")])).map((r) => [r.code, r.target, r.short]), [
    ["material_incomplete", { kind: "card", materialId: "raf", field: "section" }, "Timber (rafters): enter the timber section"],
    ["material_incomplete", { kind: "card", materialId: "raf", field: "grade" }, "Timber (rafters): enter the grade or species"],
    ["material_incomplete", { kind: "card", materialId: "raf", field: "treatment" }, "Timber (rafters): enter the treatment"],
    ["member_missing", { kind: "measure", materialId: "raf", tool: "member", documentId: null, pageIndex: null, measurementIds: [] }, "Timber (rafters): measure one member, or enter the cut length"]]);
  // a flashing with no colour: one row for the flashing, HUB 010's route with its line and code; a run with no scale
  // (no line at all) is its page's scale
  const fl = { id: "fl", name: "Ridge", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec: { product: "Flashing", finish: "COLORBOND", bmt: 0.55 }, profile: starterProfile() };
  const runs = [runM, { ...runM, id: "r2" }, { ...runM, id: "r3", calibrationId: "gone" }];
  const fw = ws([fl], runs, runs.map((m) => con(`c${m.id}`, m.id, "fl", "primary")));
  const fc = computeWorkspace(fw);
  const fr = fixesFor(fc, fw);
  const line = fc.scheduleLines.find((l) => l.jobMaterialIds.includes("fl"));
  assert.deepEqual(fr.map((r) => [r.code, r.target]), [
    ["material_incomplete", { kind: "flashing", materialId: "fl", bucketKey: line.bucketKey, problems: ["material_incomplete"] }],
    ["calibration_missing", { kind: "scale", documentId: "d", pageIndex: 0, measurementIds: ["r3"] }]]);
  assert.deepEqual(fixesFor(fc, fw, { section: "timber_cladding" }), []);
});

t("fixes: wallsText says an item's walls in one short phrase", () => {
  assert.equal(wallsText(["Wall 1", "Wall 3", "Wall 4", "Wall 5", "Wall 6", "Wall 7", "Wall 8", "Wall 9", "Wall 10", "Wall 11"]), "Walls 1, 3–11");
  assert.equal(wallsText(["Wall 13", "Wall 12"]), "Walls 12–13");
  assert.equal(wallsText(["Wall 3"]), "Wall 3");
  assert.equal(wallsText(["North", "Wall 1", "Wall 3"]), "Walls 1, 3, North");
  assert.equal(wallsText(["South", "North"]), "North, South");
  assert.equal(wallsText(["Wall 1", "Wall 3", "Wall 5", "Wall 7", "Wall 9", "Wall 11"]), "Walls 1, 3, 5, 7, +2 more");
  assert.equal(wallsText([]), null);
});

t("decision 6 (Sam, 25 Oct): a new Walls item starts with Sam's products, needs nothing, and its 35 mm studs set the side studs, merges and noggin bays", () => {
  const spec = wallFramingDefaults([]);
  const mk = methodFor(spec);
  const walls = { id: "walls", name: "Walls", methodKey: mk.key, methodVersion: mk.version, spec, rules: { ...WALL_FRAMING_RULES } };
  // the HUB 028 worked example: Wall 1 6,000 with D1 820 wide at 1,000; Wall 2 4,000 with W1 1,800 wide at 1,200, sill 900
  const ms = [rect("w1", 6000, 2700, "Wall 1"), rect("w2", 4000, 2700, "Wall 2"),
    { id: "d1", kind: "opening", parentId: "w1", inputs: { xMm: 1000, sillMm: 0, widthMm: 820, heightMm: 2040, label: "D1", type: "door" } },
    { id: "o1", kind: "opening", parentId: "w2", inputs: { xMm: 1200, sillMm: 900, widthMm: 1800, heightMm: 1200, label: "W1", type: "window" } }];
  const w = ws([walls], ms, [con("a", "w1", "walls"), con("b", "w2", "walls")]);
  const c = computeWorkspace(w);
  const r = c.materialResults.walls;
  assert.deepEqual(r.problems.filter((p) => p.blocking !== false), [], "no product needs");
  assert.deepEqual([r.status.procurement, c.orderReady, fixesFor(c, w)], ["ready", true, []]);
  assert.deepEqual(c.scheduleLines.map((l) => [l.quantity, l.item.description]), [
    [21, "Studs 90 × 35 LVL Smart 10 H2 — 2,700 mm length"], [2, "Plates 90 × 45 MGP10 H2 — 6,000 mm length"], [2, "Plates 90 × 45 MGP10 H2 — 4,200 mm length"],
    [1, "Noggins 90 × 35 MGP10 untreated — 4,200 mm length"], [1, "Noggins 90 × 35 MGP10 untreated — 2,700 mm length"]]);
  // 2 studs each side of an opening, 35 apart, the first half a stud (17.5) off its edge; a grid stud within 35 merges
  const at = (id) => r.layouts.find((l) => l.wallMeasurementId === id).ticks.filter((x) => x.state !== "removed").map((x) => x.positionMm);
  assert.deepEqual(at("w1"), [0, 600, 947.5, 982.5, 1837.5, 1872.5, 2400, 3000, 3600, 4200, 4800, 5400, 6000]);
  assert.deepEqual(at("w2"), [0, 600, 1147.5, 1182.5, 3017.5, 3052.5, 3600, 4000]);
  // noggins: a 600 bay less one 35 stud = 565 clear
  const nog = (id) => r.demands.filter((d) => d.identity.component === "noggins" && d.sourceRefs[0].wallId === id).flatMap((d) => Array(d.quantity).fill(d.lengthMm));
  assert.deepEqual([nog("w1"), nog("w2")], [[565, 312.5, 492.5, 565, 565, 565, 565, 565, 565], [565, 512.5, 512.5, 365]]);
  // a saved company product for a part still wins over Sam's default
  const prod = { id: "p", name: "Studs 90 × 45 MGP10 H2", isActive: true, methodKey: "wall_frame", methodVersion: 1, rules: {},
    spec: { family: "timber", purpose: "studs", section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", stock: { maxMm: 6000, unavailableMm: [] } } };
  const own = wallFramingDefaults([prod]).components;
  assert.deepEqual([own.studs.section, own.studs.grade, own.plates.grade, own.noggins.treatment], [{ depthMm: 90, widthMm: 45 }, "MGP10", "MGP10", "untreated"]);
});

// ── the guard: every blocking code the engine raises maps to a target ────────

const SRC = new URL("../../shared/takeoff/", import.meta.url);
const SOURCES = [...readdirSync(new URL("engine/", SRC)).filter((f) => f.endsWith(".js")).map((f) => `engine/${f}`), "schedule.js", "flashing.js", "catalogue.js", "profile.js", "calibration.js"];
const CODE = "([a-z][a-z0-9]*(?:[_-][a-z0-9]+)+)";
const RAISE = [
  new RegExp(`\\bcode:\\s*"${CODE}"`, "g"),
  new RegExp(`\\b(problem|qty|note|inst|proc|mismatch|fail|block|followerNote|invalid)\\(\\s*"${CODE}"`, "g"),
  new RegExp(`\\.push\\(\\s*"${CODE}"\\s*\\)`, "g"),
  new RegExp(`\\bunresolved\\([^\\n]*?,\\s*"${CODE}"\\)`, "g"),
];
/** Modules whose problems never reach a material or a line: dispatch reads only the allocation's groups (unavailable
 *  pieces become unavailable_stock), selectStock's reason travels in that message, and schedule.js maps a flashing
 *  path's codes through PATH_CODE onto PROBLEM_TEXT codes (checked below). */
const INTERNAL_FILES = new Set(["engine/allocator.js", "engine/stock.js", "engine/flashingPath.js", "engine/sheetCutPlan.js"]);
/** Every raise site, by code: [{ file, helper, statement }] */
const raised = (() => {
  const out = new Map();
  for (const f of SOURCES) {
    const src = readFileSync(new URL(f, SRC), "utf8");
    for (const re of RAISE) {
      for (const m of src.matchAll(re)) {
        const code = m[m.length - 1];
        const helper = re === RAISE[1] ? m[1] : re === RAISE[3] ? "unresolved" : null;
        const end = src.slice(m.index).search(/;\s*(\n|\}|\/\/|$)/);
        const statement = src.slice(m.index, m.index + (end < 0 ? 400 : end + 1));
        if (!out.has(code)) out.set(code, []);
        out.get(code).push({ file: f, helper, statement, src });
      }
    }
  }
  return out;
})();
const STATUSES = new Set([...INSTALLATION_STATUS, ...QUANTITY_STATUS, ...PROCUREMENT_STATUS]);
/** PROBLEM_TEXT words order-line and save codes too; those come from the order screen and the server, not the engine. */
const NOT_ENGINE = new Set(["line_stale_missing", "line_stale_material", "line_stale_quantity", "line_stale_inputs", "duplicate_assignment"]);

t("guard: every code the engine raises is classified: a fix target, a note, or internal to a module whose problems never reach a line", () => {
  assert.ok(raised.size > 150, `the scan finds the engine's codes (${raised.size})`);
  const unclassified = [];
  for (const [code, sites] of raised) {
    if (STATUSES.has(code)) continue;   // installs.push("source-pending"): a status, not a problem
    if (fixEntryFor(code) || NOTE_CODES.includes(code)) continue;
    if (sites.every((s) => INTERNAL_FILES.has(s.file))) continue;
    unclassified.push(`${code} (${[...new Set(sites.map((s) => s.file))].join(", ")})`);
  }
  assert.deepEqual(unclassified, [], "a new engine code needs a fix target (FIX_TARGETS) or a NOTE_CODES entry");
  // the one code built from a group's kind ("coating-yield-unresolved" …) is matched by its ending
  assert.ok(readFileSync(new URL("engine/accessories.js", SRC), "utf8").includes("-yield-unresolved`"));
  for (const k of ["coating-yield-unresolved", "primer-yield-unresolved", "finish-coat-yield-unresolved"]) assert.equal(fixEntryFor(k)?.to, "group", k);
  // every code a line can carry as text (PROBLEM_TEXT, flashing included) has a target
  for (const code of Object.keys(PROBLEM_TEXT)) if (!NOT_ENGINE.has(code)) assert.ok(fixEntryFor(code), `PROBLEM_TEXT ${code}`);
  // no table entry is a dead letter, and a note is never also a fix
  for (const code of Object.keys(FIX_TARGETS)) assert.ok(raised.has(code) || PROBLEM_TEXT[code], `FIX_TARGETS.${code} is raised somewhere`);
  for (const code of NOTE_CODES) assert.ok(raised.has(code), `NOTE_CODES ${code} is raised somewhere`);
  assert.deepEqual(NOTE_CODES.filter((c) => FIX_TARGETS[c]), []);
  // every entry routes somewhere real, and names a real field or tool
  for (const [code, e] of Object.entries(FIX_TARGETS)) {
    assert.ok(FIX_ROUTES.includes(e.to), `${code}: route ${e.to}`);
    if (typeof e.field === "string") assert.ok(FIX_CARD_FIELDS.includes(e.field), `${code}: field ${e.field}`);
    if (typeof e.fallbackField === "string") assert.ok(FIX_CARD_FIELDS.includes(e.fallbackField), `${code}: field ${e.fallbackField}`);
    if (e.to === "tool") assert.ok(["member", "distribution"].includes(e.tool), `${code}: tool ${e.tool}`);
  }
  for (const f of FAMILY_NEED_FIELDS) assert.ok(FIX_CARD_FIELDS.includes(f), `need field ${f}`);
});

t("guard: a note never blocks at any raise site (a note helper, blocking: false, or made a note by dispatch)", () => {
  const dispatch = readFileSync(new URL("engine/dispatch.js", SRC), "utf8");
  // the note helpers themselves never block
  const src = (f) => readFileSync(new URL(f, SRC), "utf8");
  for (const [f, re] of [["engine/cladding.js", /const note = \([^)]*\) => problem\([^;]*blocking: false/], ["engine/cladding.js", /const inst = \([^)]*\) => problem\([^;]*blocking: false/],
    ["engine/followers.js", /export const followerNote = \([^)]*\) => problem\([^;]*blocking: false/]]) assert.match(src(f), re, `${f}: ${re}`);
  for (const code of NOTE_CODES) {
    for (const s of raised.get(code) || []) {
      if (["note", "inst", "followerNote"].includes(s.helper)) continue;
      if (/blocking:\s*false/.test(s.statement)) continue;
      // the options object passed by name (timber.js: const ref = { blocking: false, … })
      const named = [...s.statement.matchAll(/,\s*([A-Za-z_$][\w$]*)\)\s*\)?\s*;/g)].map((x) => x[1]);
      if (named.some((id) => new RegExp(`const ${id} = \\{ blocking: false`).test(s.src))) continue;
      // T4: base studs still order; dispatch turns this one into a note before anything reads it
      if (code === "opening_framing_incomplete" && dispatch.includes('p.code === "opening_framing_incomplete" ? { ...p, blocking: false')) continue;
      assert.fail(`${code} is raised blocking in ${s.file}: ${s.statement.slice(0, 160)}`);
    }
  }
});

/** Blocked takeoffs, one blocker family each (synthetic). */
function blockedCorpus() {
  const UNCHECKED = { ...buildCalibration({ horizontal: { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, knownMm: 2000 }, vertical: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 100 }, knownMm: 2000 } }).calibration,
    id: "calu", documentId: "d", pageIndex: 1, calibrationRevision: 1 };
  const runM = (id, units = 100, cal = "cal") => ({ id, kind: "run", documentId: "d", pageIndex: 0, calibrationId: cal, points: [{ x: 1, y: 1 }, { x: 1 + units, y: 1 }] });
  const timber = (id, purpose, extra = {}, rules = {}, mk = "repeated_members", v = 2) => ({ id, name: `Timber ${id}`, methodKey: mk, methodVersion: v,
    spec: { family: "timber", purpose, section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", ...extra }, rules });
  const bat = (id, product, rules = {}) => ({ id, name: `Battens ${id}`, ...fam({ family: "batten", product }), rules });
  const spec = wallFramingDefaults([]);
  const mk = methodFor(spec);
  const g = (id, inputs) => ({ id, kind: "wall", inputs: { kind: "gable", widthMm: 6000, eavesHeightMm: 2400, apexXMm: 3000, apexHeightMm: 3600, name: id, ...inputs } });
  const out = [JOB(), { ...JOB({ heightMm: 3600 }), calibrations: [CAL, CAL2] }];
  {
    const ms = [rect("w1", 3000, "abc", "Wall 1"), g("G1", { apexHeightMm: 2000 }), g("G2", { apexXMm: 6000 }),
      { id: "o1", kind: "wall", inputs: { kind: "polygon", polygon: [{ x: 0, y: 0 }, { x: 1000, y: 1000 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }], name: "Bow" } },
      { id: "o2", kind: "wall", inputs: { kind: "polygon", polygon: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 0 }], name: "Flat" } },
      rect("wo", 3000, 2700, "Wall O"), { id: "op1", kind: "opening", parentId: "wo", inputs: { xMm: 9000, sillMm: 0, widthMm: 900, heightMm: 900, label: "W1" } },
      { id: "op2", kind: "opening", parentId: "wo", inputs: { xMm: 100, sillMm: 0, widthMm: 0, heightMm: 900, label: "W2" } }];
    out.push(ws([axon("clad")], ms, ms.filter((m) => m.kind === "wall").map((m) => con(`c-${m.id}`, m.id, "clad"))));
  }
  out.push(ws([{ ...axon("mis"), spec: { ...axon("mis").spec, assemblyId: "linea-horizontal" } }, { ...axon("tall"), rules: { route: "cavity" } },
    { ...axon("hor"), spec: { ...axon("hor").spec, orientation: "horizontal" } }, { ...axon("jr"), rules: { route: "cavity", jointRows: { atMm: [1000], gapMm: -5, detailRef: "H" } } },
    { ...axon("bare"), spec: { ...axon("bare").spec, product: {} } }],
  [rect("w1", 3600, 2700, "Wall 1"), rect("w2", 3600, 3600, "Wall 2"), rect("w3", 3600, 2700, "Wall 3"), rect("w4", 3600, 2700, "Wall 4"), rect("w5", 3600, 2700, "Wall 5")],
  [con("a", "w1", "mis"), con("b", "w2", "tall"), con("c", "w3", "hor"), con("d", "w4", "jr"), con("e", "w5", "bare")]));
  out.push({ ...ws([axon("clad")], [{ ...traced("t1", 3000, "T1", { heightMm: 2700 }), pageIndex: 1, calibrationId: "calu" }, { ...traced("t4", 3000, "T4", { widthMm: 3000, heightMm: 2700 }), calibrationId: "gone" },
    runM("r1")], [con("a", "t1", "clad"), con("b", "t4", "clad"), con("e", "r1", "clad", "primary")]), calibrations: [CAL, UNCHECKED] });
  // HUB 030: an EMPTY product is the owner's pine batten and a single length is a one-length list, so these are the
  // Support battens blockers that can still happen: a half-typed custom batten, and a product with no stock length
  out.push(ws([bat("b1", { id: "custom-batten", name: "Pine" }), bat("b2", { name: "Pine", widthMm: 90, thicknessMm: 35 }, { maxSpacingMm: 600 })], [rect("w1", 3600, 2700, "Wall 1")], [con("a", "w1", "b1"), con("b", "w1", "b2")]));
  out.push(ws([timber("raf", "rafters", {}, { lengthSource: "projected", pitchDeg: 20 }), timber("raf2", "rafters", { section: {} }), timber("long", "rafters", { stock: { maxMm: 3600 } }, { lengthSource: "entered", enteredLengthMm: 7000 }),
    timber("dup", "rafters", {}, { lengthSource: "entered", enteredLengthMm: 3000 })],
  [runM("r1", 200), { id: "mem", kind: "member", documentId: "d", pageIndex: 0, calibrationId: "cal", points: [{ x: 1, y: 1 }, { x: 100, y: 1 }] }, runM("r3", 200), runM("r4", 200), runM("r5", 100)],
  [con("a", "r1", "raf", "distribution"), con("b", "mem", "raf2", "member"), con("c", "r3", "long", "distribution"), con("d", "r4", "dup", "distribution"), con("e", "r5", "dup", "distribution")]));
  out.push(ws([timber("st", "studs", {}, { centresMm: 600 }, "wall_frame", 1), timber("st2", "studs", {}, { centresMm: 600, heightMode: "frame" }, "wall_frame", 1), timber("ng", "noggins", { section: {} }, {}, "linear_stock", 1)],
    [rect("w1", 3000, null, "Wall 1"), rect("w2", 3000, 2700, "Wall 2")], [con("a", "w1", "st"), con("b", "w2", "st2"), con("c", "w2", "ng")]));
  out.push(ws([{ id: "walls", name: "Walls", methodKey: mk.key, methodVersion: mk.version, spec: { ...spec, components: { ...spec.components, studs: { ...spec.components.studs, treatment: null } } }, rules: { ...WALL_FRAMING_RULES } }],
    [rect("w1", 3000, null, "Wall 1"), g("Gable", {}), rect("w3", 3000, 2700, "Wall 3")], [con("a", "w1", "walls"), con("b", "Gable", "walls"), con("c", "w3", "walls")]));
  out.push(ws([{ id: "al", name: "Angle", methodKey: "linear_stock", methodVersion: 1, spec: { family: "aluminium", profile: {}, stockLengthMm: 6500 }, rules: {} },
    { id: "acc", name: "Trims", ...fam({ family: "accessory", product: { name: "Trim set" } }), rules: {} },
    { id: "acc2", name: "Starter", ...fam({ family: "accessory", product: { name: "Starter set" } }), rules: { recipe: { groups: [{ id: "starter", label: "Starter", kind: "starter" }] } } }],
  [runM("r1"), rect("w1", 3600, 2700, "Wall 1")], [con("a", "r1", "al", "primary"), con("b", "w1", "acc"), con("c", "w1", "acc2")]));
  out.push(ws([{ id: "fl", name: "Ridge", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec: { product: "Flashing", finish: "COLORBOND", bmt: 0.55 }, profile: starterProfile() }],
    [runM("r1"), runM("r2", 100, "gone")], [con("a", "r1", "fl", "primary"), con("b", "r2", "fl", "primary")]));
  return out;
}

t("guard: on a corpus of blocked takeoffs every blocker has an explicit target of a known kind, every blocked line points at a row, and notes never block", () => {
  const seen = new Set();
  for (const [i, w] of blockedCorpus().entries()) {
    const c = computeWorkspace(w);
    const rows = fixesFor(c, w);
    assert.ok(rows.length, `#${i} has rows`);
    for (const r of rows) {
      assert.ok(!r.fallback, `#${i} ${r.code}: an explicit table entry (${r.short})`);
      assert.ok(FIX_TARGET_KINDS.includes(r.target.kind), `#${i} ${r.code}: kind ${r.target.kind}`);
      assert.equal(r.key, fixTargetKey(r.target));
      if (r.target.kind === "wall") assert.ok(!r.target.field || FIX_WALL_FIELDS.includes(r.target.field), `#${i} ${r.code}: wall field ${r.target.field}`);
      if (r.target.kind === "card") assert.ok(r.target.field === null || FIX_CARD_FIELDS.includes(r.target.field), `#${i} ${r.code}: card field ${r.target.field}`);
      if (r.target.kind === "apply") assert.ok(FIX_APPLY_ACTIONS.includes(r.target.action), `#${i} ${r.code}: action ${r.target.action}`);
      for (const k of ["short", "text", "reason", "subject", "action"]) assert.ok(typeof r[k] === "string" && r[k] && !/ — |\.$/.test(r[k]), `#${i} ${r.code}: ${k} "${r[k]}"`);
      for (const code of r.codes) seen.add(code);
    }
    for (const [id, res] of Object.entries(c.materialResults)) {
      if (!c.contributions.some((x) => x.jobMaterialId === id)) continue;
      for (const p of res.problems) {
        if (NOTE_CODES.includes(p.code)) assert.equal(p.blocking, false, `#${i} ${p.code} is a note`);
        if (p.blocking === false) continue;
        assert.ok(rows.some((r) => r.codes.includes(p.code) && r.materialIds.includes(id)), `#${i} ${id}: ${p.code} has a row (${p.message})`);
      }
    }
    for (const l of c.scheduleLines) if (l.problems.length) assert.ok(rows.some((r) => r.bucketKeys.includes(l.bucketKey)), `#${i}: a blocked line points at a row (${l.problems})`);
  }
  // the corpus reaches every target kind and the blocker families of the audit (B1–B4, B7–B10, B12–B13, B15, B17–B20, B22–B25)
  for (const code of ["wall_incomplete", "wall_dimension_invalid", "wall_polygon_invalid", "wall_self_intersecting", "opening_outside_wall", "opening_invalid", "calibration_superseded",
    "calibration_not_ready", "calibration_missing", "measurement_unused", "assembly_method_mismatch", "sheet_too_tall", "joint_rows_invalid", "orientation_not_permitted",
    // support-spacing-unresolved is gone: with no spacing entered a Support battens item uses Sam's 600 (HUB 030 decision 2)
    "material_incomplete", "product_parameter_missing", "stock-policy-missing", "member_missing", "distribution_missing", "distribution_overlap", "unavailable_stock", "plates_missing",
    "wall_not_straight", "kerf_unconfirmed", "recipe_missing", "routes-missing"]) assert.ok(seen.has(code), `the corpus raises ${code}`);
});

console.log(`takeoff-tc-hub029: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
