// An unfinished opening framing override is ignored for counting (Sam, 18 Nov 2026, live W1 with the "no extra members" tick
// only): the automatic rules frame the opening and one note says the override isn't used. A COMPLETE detail still wins.
//   node scripts/tests/takeoff-tc-framing-override.test.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { CALCULATION_VERSION, WALL_FRAMING_RULES, computeWorkspace, wallFramingDefaults } from "../../shared/takeoff/index.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 4).join("\n    ")}`); } }

const product = (id, purpose, over = {}) => ({ id, name: id, isActive: true, methodKey: "linear_stock", methodVersion: 1, rules: {},
  spec: { family: "timber", purpose, section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", species: null, supplierName: "Yard A", productCode: null, stock: { maxMm: null, unavailableMm: [] }, ...over } });
const READY = () => wallFramingDefaults([product("p-stud", "studs"), product("p-plate", "plates"), product("p-nog", "noggins", { section: { depthMm: 90, widthMm: 35 } })]);
const W1 = { xMm: 1200, sillMm: 900, widthMm: 1200, heightMm: 1200, type: "window", label: "W1" };
const run = (detail, { rules = { ...WALL_FRAMING_RULES, carriesRoof: false }, spec = READY() } = {}) => {
  const ms = [{ id: "w", kind: "wall", inputs: { kind: "rect", widthMm: 3955, heightMm: 2700, name: "Wall 1" } },
    { id: "o", kind: "opening", parentId: "w", inputs: { ...W1, ...(detail === undefined ? {} : { detail }) } }];
  const c = computeWorkspace({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [],
    materials: [{ id: "walls", name: "Walls", methodKey: "wall_framing", methodVersion: 1, spec, rules }], measurements: ms,
    contributions: [{ id: "c", measurementId: "w", jobMaterialId: "walls", role: "wall" }] });
  const res = c.materialResults.walls;
  return { res, o: res.layouts.find((x) => x.wallLabel === "Wall 1").openings.find((x) => x.id === "o"), codes: (res.problems || []).map((p) => p.code) };
};
const hash = (res) => createHash("sha256").update(JSON.stringify(res.demands)).digest("hex").slice(0, 16);
const auto = run(undefined);

t("the version is bumped past @8", () => assert.notEqual(CALCULATION_VERSION, "takeoff-calc@8"));

t("Sam's W1 ({source:'reviewed-detail', members:[]}, no ref, no regions) is framed automatically and says the override is unused", () => {
  const r = run({ source: "reviewed-detail", members: [] });
  assert.ok(r.o.rule, "rule framing applied");
  assert.equal(r.o.complete, true);
  assert.ok(r.codes.includes("framing_override_unfinished"));
  assert.ok(!r.codes.includes("opening_framing_not_counted"));
  assert.ok(!r.res.problems.some((p) => /aren't counted/.test(p.message)));
  assert.equal(hash(r.res), hash(auto.res), "same quantities as no detail at all");
  const note = r.res.problems.find((p) => p.code === "framing_override_unfinished");
  assert.equal(note.blocking, false);
  assert.match(note.message, /W1 has an unfinished framing override that isn't used\. Finish it or clear it\./);
  assert.ok(r.res.demands.some((d) => /king|jack|lintel/i.test(`${d.role} ${d.label}`)), "kings, jacks, lintel counted");
});

t("{source:'explicit'} alone is framed automatically", () => {
  const r = run({ source: "explicit" });
  assert.ok(r.o.rule);
  assert.equal(hash(r.res), hash(auto.res));
});

t("no detail at all: automatic, no unfinished note", () => {
  assert.ok(auto.o.rule);
  assert.ok(!auto.codes.includes("framing_override_unfinished"));
});

t("a member with no length or product keeps the detail unfinished", () => {
  const r = run({ source: "explicit", belowSill: { required: false }, aboveHead: { required: false }, members: [{ id: "m1", role: "king", quantity: 2 }] });
  assert.ok(r.o.rule);
  assert.ok(r.codes.includes("framing_override_unfinished"));
});

const complete = { source: "explicit", ref: "owner quantities", belowSill: { required: false }, aboveHead: { required: false },
  members: [{ id: "k", role: "king", quantity: 2, lengthFrom: "stud", addMm: 0, sameAsStud: true }] };
t("a complete explicit detail with members wins: manual, no rule, no unfinished note, own members counted", () => {
  const r = run(complete);
  assert.equal(r.o.rule, undefined);
  assert.equal(r.o.complete, true);
  assert.ok(!r.codes.includes("framing_override_unfinished"));
  assert.ok(r.res.demands.some((d) => d.role === "king"));
});

t("an empty list with everything answered (complete) is manual: members: [] is a real answer once the rest is entered", () => {
  const r = run({ source: "explicit", belowSill: { required: false }, aboveHead: { required: false }, members: [] });
  assert.equal(r.o.rule, undefined);
});

t("plates section with no width: auto framing can't run, one note says why and what to set", () => {
  const spec = READY();
  spec.components.plates.section = { depthMm: 90 };
  const r = run(undefined, { spec });
  assert.equal(r.o.rule, undefined);
  const notes = r.res.problems.filter((p) => p.code === "framing_auto_unavailable");
  assert.equal(notes.length, 1);
  assert.equal(notes[0].blocking, false);
  assert.match(notes[0].message, /plates section has no width/);
});

t("rules.openingFraming === false: one note says it is switched off", () => {
  const r = run(undefined, { rules: { ...WALL_FRAMING_RULES, carriesRoof: false, openingFraming: false } });
  assert.equal(r.o.rule, undefined);
  const notes = r.res.problems.filter((p) => p.code === "framing_auto_unavailable");
  assert.equal(notes.length, 1);
  assert.match(notes[0].message, /switched off/);
});

console.log(`takeoff-tc-framing-override: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
