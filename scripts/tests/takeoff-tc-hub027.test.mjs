// Hub review HUB 027 — timber "Size and grade" choices per purpose (owner, 21 Oct 2026). Pure rules from
// shared/takeoff/engine/families.js: the stated choices, a pick fills section + grade together (never a treatment,
// never an LVL grade), a saved company product fills its own identity exactly as saved, the list shows the choice the
// saved fields match (nothing new stored), and measurements / the 1200 + 300n grid (Sam, 25 Oct 2026; HUB 028) are unchanged. The server keeps
// these fields (takeoff-api.test.mjs "TC J1"); the screens are in e2e/ui-review/tc-catalogue.spec.js ("HUB 027").
//   node scripts/tests/takeoff-tc-hub027.test.mjs
import assert from "node:assert/strict";
import {
  TIMBER_GRID, TIMBER_PRESETS, TIMBER_PURPOSES, applyTimberPreset, computeWorkspace, describeFamilySpec, familyIdentity, familyProblems, matchTimberChoice, normaliseFamilySpec,
  timberPresetLabel, timberPresetMatches, timberPresetsFor, timberProductFill, timberProductMatches,
} from "../../shared/takeoff/index.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 3).join("\n    ")}`); } }

const labels = (purpose) => timberPresetsFor(purpose).map(timberPresetLabel);
/** The spec Add timber creates (TakeoffApp addTimber), with the purpose tapped. */
const addTimber = (purpose) => ({ family: "timber", purpose, section: {}, stock: { kind: "grid", minMm: 1200, incrementMm: 300 } });
const preset = (purpose, label) => timberPresetsFor(purpose).find((p) => timberPresetLabel(p) === label);

t("each purpose offers its stated choices (no treatment, no built-in LVL)", () => {
  assert.deepEqual(labels("studs"), ["90 × 35 MGP10", "90 × 45 MGP10", "120 × 35 MGP10", "120 × 45 MGP10"]);
  assert.deepEqual(labels("noggins"), ["90 × 35"]);
  assert.deepEqual(labels("plates"), ["90 × 45"]);
  assert.deepEqual(labels("battens"), ["90 × 35", "70 × 35", "90 × 45", "70 × 45"]);
  for (const p of ["rafters", "joists", "trim", "other"]) assert.deepEqual(timberPresetsFor(p), [], p);
  assert.deepEqual(timberPresetsFor("nonsense"), []);
  for (const [purpose, list] of Object.entries(TIMBER_PRESETS)) {
    assert.ok(TIMBER_PURPOSES.includes(purpose));
    assert.ok(Object.isFrozen(list));
    for (const p of list) {
      assert.ok(Object.isFrozen(p));
      assert.equal(p.treatment, undefined, `${p.id} carries no treatment`);
      assert.ok(!/lvl/i.test(`${p.id} ${p.grade || ""} ${timberPresetLabel(p)}`), `${p.id} is not an LVL row`);
      assert.deepEqual(Object.keys(p).sort(), ["depthMm", "grade", "id", "widthMm"]);
    }
    assert.equal(new Set(list.map((p) => p.id)).size, list.length, "ids unique within a purpose");
  }
  // grades only where the owner named one (studs); the others fill the size only
  for (const purpose of ["noggins", "plates", "battens"]) for (const p of TIMBER_PRESETS[purpose]) assert.equal(p.grade, null);
});

t("fills section and grade together; treatment, plies, sizing and stock unchanged (a product's hidden species is cleared)", () => {
  const before = { ...addTimber("studs"), treatment: "H2", species: "Radiata pine", plies: 2, sizing: { provenance: "manual", reference: null }, stock: { kind: "grid", minMm: 1200, incrementMm: 300, maxMm: 6000 } };
  const after = applyTimberPreset(before, preset("studs", "90 × 45 MGP10"));
  assert.deepEqual(after.section, { depthMm: 90, widthMm: 45 });
  assert.equal(after.grade, "MGP10");
  for (const k of ["treatment", "plies", "sizing", "stock", "purpose", "family"]) assert.deepEqual(after[k], before[k], k);
  assert.equal(after.species, null, "species only comes from a company product and never shows on the card");
  assert.deepEqual(before.section, {}, "the input is not mutated");
  const n = normaliseFamilySpec(after);
  assert.equal(n.sizing.provenance, "manual");
  assert.deepEqual([n.stock.kind, n.stock.minMm, n.stock.incrementMm], ["grid", 1200, 300]);
  assert.deepEqual(TIMBER_GRID, { kind: "grid", minMm: 1200, incrementMm: 300 });
  // straight from Add timber: the only thing still missing to order is the treatment (never filled by a built-in row)
  const fresh = applyTimberPreset(addTimber("studs"), preset("studs", "90 × 45 MGP10"));
  assert.deepEqual(familyProblems(fresh).map((p) => p.message), ["Enter the treatment (or \"untreated\")."]);
  assert.equal(fresh.treatment, undefined);
});

t("a size-only choice (plates 90 × 45) leaves an entered grade untouched", () => {
  const after = applyTimberPreset({ ...addTimber("plates"), grade: "MGP12", treatment: "H2" }, preset("plates", "90 × 45"));
  assert.deepEqual([after.section, after.grade, after.treatment], [{ depthMm: 90, widthMm: 45 }, "MGP12", "H2"]);
  assert.equal(applyTimberPreset(addTimber("noggins"), preset("noggins", "90 × 35")).grade, null, "no grade invented");
});

t("a built-in choice clears a saved product's supplier code and species (neither shows on the card); treatment and supplier stay", () => {
  const fromProduct = { ...addTimber("battens"), section: { depthMm: 70, widthMm: 35 }, grade: "MGP10", treatment: "H3", species: "Radiata pine", supplierName: "Supplier A", productCode: "PB7035H3" };
  const other = applyTimberPreset(fromProduct, preset("battens", "90 × 35"));
  assert.equal(other.productCode, null, "a different size is not that product");
  assert.equal(other.species, null);
  assert.equal(other.supplierName, "Supplier A");
  assert.equal(other.treatment, "H3");
  // the same size picked as the plain row: it is no longer that product either (the list would otherwise snap back)
  const same = applyTimberPreset(fromProduct, preset("battens", "70 × 35"));
  assert.deepEqual([same.productCode, same.species, same.supplierName, same.treatment], [null, null, "Supplier A", "H3"]);
  assert.equal(matchTimberChoice(same, timberPresetsFor("battens"), [{ id: "pre-a", spec: { ...fromProduct } }]), "battens-70x35", "after a reload too");
});

t("review: an LVL company product, then the built-in 90 × 35 MGP10 — no hidden LVL left on the order line", () => {
  const lvl = { family: "timber", purpose: "studs", section: { depthMm: 90, widthMm: 45 }, grade: "LVL13", treatment: "H2-S", species: "LVL", supplierName: "Supplier B", productCode: "LVL9045" };
  const s = applyTimberPreset(timberProductFill(addTimber("studs"), lvl), preset("studs", "90 × 35 MGP10"));
  assert.equal(describeFamilySpec(s).line, "90 × 35 · MGP10 · H2-S", "treatment stays (it is on the card); species LVL is gone");
  const id = familyIdentity(s);
  assert.deepEqual([id.grade, id.species ?? null, id.productCode ?? null], ["mgp10", null, null]);
  assert.equal(matchTimberChoice(s, timberPresetsFor("studs"), [{ id: "pre-lvl", spec: lvl }]), "studs-90x35-mgp10");
});

t("review: two suppliers' products with the same size, grade, treatment and species stay apart (the list shows the one picked)", () => {
  const A = { id: "pA", spec: { family: "timber", purpose: "battens", section: { depthMm: 70, widthMm: 35 }, grade: "MGP10", treatment: "H3", supplierName: "Yard A", productCode: "A-7035" } };
  const B = { id: "pB", spec: { ...A.spec, supplierName: "Yard B", productCode: "B-7035" } };
  const built = timberPresetsFor("battens");
  assert.equal(matchTimberChoice(timberProductFill(addTimber("battens"), B.spec), built, [A, B]), "pB");
  assert.equal(matchTimberChoice(timberProductFill(addTimber("battens"), A.spec), built, [A, B]), "pA");
  // the same fields typed by hand (no supplier, no code) are the built-in row, never a product
  const typed = { ...addTimber("battens"), section: { depthMm: 70, widthMm: 35 }, grade: "MGP10", treatment: "H3" };
  assert.equal(matchTimberChoice(typed, built, [A, B]), "battens-70x35");
  assert.equal(matchTimberChoice({ ...typed, supplierName: "Yard B" }, built, [A, B]), "battens-70x35", "a supplier without B's code is not B's product");
  assert.equal(timberProductMatches(timberProductFill(addTimber("battens"), B.spec), B), true);
  assert.equal(timberProductMatches(timberProductFill(addTimber("battens"), B.spec), A), false);
  assert.equal(timberPresetMatches(typed, built.find((p) => p.id === "battens-70x35")), true);
});

t("a saved company product fills its own grade and treatment exactly (batten H3; an LVL stud from its product only)", () => {
  const batten = { family: "timber", purpose: "battens", section: { depthMm: 70, widthMm: 35 }, grade: "MGP10", treatment: "H3", supplierName: "Supplier A" };
  const filled = timberProductFill({ ...addTimber("battens"), treatment: "H2", species: "Radiata pine", plies: 1 }, batten);
  assert.deepEqual([filled.section, filled.grade, filled.treatment, filled.species, filled.supplierName, filled.productCode], [{ depthMm: 70, widthMm: 35 }, "MGP10", "H3", null, "Supplier A", null]);
  assert.equal(filled.purpose, "battens");
  assert.equal(filled.plies, 1, "plies are not part of the size choice");
  filled.section.depthMm = 999;
  assert.equal(batten.section.depthMm, 70, "the product is never changed through the job copy");
  const lvl = { family: "timber", purpose: "studs", section: { depthMm: 90, widthMm: 45 }, grade: "LVL13", species: "LVL", supplierName: "Supplier B", productCode: "LVL9045" };
  const s = timberProductFill(applyTimberPreset(addTimber("studs"), preset("studs", "90 × 45 MGP10")), lvl);
  assert.deepEqual([s.grade, s.treatment, s.species, s.productCode], ["LVL13", null, "LVL", "LVL9045"], "nothing kept from MGP10, no H-class invented");
  assert.ok(normaliseFamilySpec(s));
});

t("matchTimberChoice: the preset id for 90 × 45 MGP10, 'custom' for 140 × 45, null when empty", () => {
  const studs = timberPresetsFor("studs");
  assert.equal(matchTimberChoice({ ...addTimber("studs"), section: { depthMm: 90, widthMm: 45 }, grade: "MGP10" }, studs), "studs-90x45-mgp10");
  assert.equal(matchTimberChoice({ ...addTimber("studs"), section: { depthMm: 90, widthMm: 45 }, grade: "mgp10 " }, studs), "studs-90x45-mgp10", "case and spaces don't matter");
  assert.equal(matchTimberChoice({ ...addTimber("studs"), section: { depthMm: 140, widthMm: 45 }, grade: "MGP10" }, studs), "custom");
  assert.equal(matchTimberChoice({ ...addTimber("studs"), section: { depthMm: 90, widthMm: 45 }, grade: "MGP12" }, studs), "custom", "a graded row needs its grade");
  assert.equal(matchTimberChoice({ ...addTimber("studs"), section: { depthMm: 90 } }, studs), "custom", "half a section is custom");
  assert.equal(matchTimberChoice({ ...addTimber("studs"), grade: "MGP10" }, studs), "custom");
  assert.equal(matchTimberChoice(addTimber("studs"), studs), null);
  assert.equal(matchTimberChoice({ ...addTimber("studs"), treatment: "H2" }, studs), null, "a treatment alone is not a size");
  assert.equal(matchTimberChoice({ ...addTimber("studs"), section: { depthMm: null, widthMm: null }, grade: null }, studs), null);
  // size-only rows match on the section whatever grade was typed
  assert.equal(matchTimberChoice({ ...addTimber("plates"), section: { depthMm: 90, widthMm: 45 }, grade: "MGP12" }, timberPresetsFor("plates")), "plates-90x45");
  // a company product wins when its section, grade, treatment and species all match; a changed treatment falls back
  const products = [{ id: "pre-b", spec: { family: "timber", purpose: "battens", section: { depthMm: 70, widthMm: 35 }, grade: "MGP10", treatment: "H3" } }];
  const b = timberProductFill(addTimber("battens"), products[0].spec);
  assert.equal(matchTimberChoice(b, timberPresetsFor("battens"), products), "pre-b");
  assert.equal(matchTimberChoice({ ...b, treatment: "h3" }, timberPresetsFor("battens"), products), "pre-b");
  assert.equal(matchTimberChoice({ ...b, treatment: "H4" }, timberPresetsFor("battens"), products), "battens-70x35");
  assert.equal(matchTimberChoice({ ...b, treatment: "H4" }, [], products), "custom");
});

t("existing measurements and the 1200 + 300n grid are unchanged by a pick; only the identity changes", () => {
  const mat = (spec) => ({ id: "st", name: "Studs", methodKey: "wall_frame", methodVersion: 1, spec, rules: { centresMm: 600, studHeightMm: 2700 } });
  const typed = { ...addTimber("studs"), section: { depthMm: 90, widthMm: 35 }, grade: "MGP10", treatment: "H2" };
  const snap = (spec) => ({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [],
    materials: [mat(spec)],
    measurements: [{ id: "w1", kind: "wall", inputs: { kind: "rect", widthMm: 4800, heightMm: 2700, name: "North" } }],
    contributions: [{ id: "c1", measurementId: "w1", jobMaterialId: "st", role: "wall" }] });
  const a = snap(typed), b = snap(applyTimberPreset(typed, preset("studs", "90 × 45 MGP10")));
  const before = computeWorkspace(a), after = computeWorkspace(b);
  assert.deepEqual(b.measurements, a.measurements);
  assert.deepEqual(b.contributions, a.contributions);
  const rows = (c) => c.scheduleLines.filter((l) => l.jobMaterialIds.includes("st")).map((l) => [l.quantity, l.unit, l.finishedLengthMm]);
  assert.ok(rows(before).length > 0, "the wall produces studs");
  assert.deepEqual(rows(after), rows(before));
  for (const [, , len] of rows(after)) assert.ok(len >= 1200 && (len - 1200) % 300 === 0, `${len} on the 1200 + 300n grid`);
  assert.deepEqual(rows(after), [[9, "piece", 2700]], "4,800 wall @600 → 9 studs of 2,700, each bought as a 2,700 length");
  // the identity (what is bought) is the only change
  const key = (c) => c.scheduleLines.find((l) => l.jobMaterialIds.includes("st")).specKey;
  assert.match(key(before), /90x35/);
  assert.match(key(after), /90x45/);
  const ida = familyIdentity(a.materials[0].spec), idb = familyIdentity(b.materials[0].spec);
  assert.deepEqual([ida.section, idb.section], [{ depthMm: 90, widthMm: 35 }, { depthMm: 90, widthMm: 45 }]);
  assert.deepEqual({ ...idb, section: null }, { ...ida, section: null }, "only the section changed in what is bought");
});

console.log(`takeoff-tc-hub027: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
