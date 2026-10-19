// Hub review HUB 002 / HUB 007 — which section a material / line belongs to, and the accessory supplier rule.
import assert from "node:assert/strict";
import { SECTIONS, accessorySupplierConflict, lineSection, materialGroup, materialSection } from "../../shared/takeoff/index.js";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}
const mat = (family, extra = {}) => ({ id: family || "fl", name: family || "Flashing", spec: family ? { family, ...extra } : { finish: "colorbond" } });

t("flashings (no family) are Flashings; timber is Timber; cladding, battens, accessories and aluminium are Cladding", () => {
  assert.equal(materialGroup(mat(null)), "flashings");
  assert.equal(materialGroup(mat("flashing")), "flashings");
  assert.equal(materialGroup(mat("timber")), "timber");
  for (const f of ["cladding", "aac", "foam", "timber-cladding", "batten", "accessory", "aluminium"]) assert.equal(materialGroup(mat(f)), "cladding", f);
  assert.equal(materialSection(mat(null)), SECTIONS.FLASHINGS);
  assert.equal(materialSection(mat("timber")), SECTIONS.TIMBER_CLADDING);
  assert.equal(materialSection(mat("aluminium")), SECTIONS.TIMBER_CLADDING);
});

t("a line follows its material; without one, generic lines are timber and cladding and the rest are flashings", () => {
  const byId = new Map([["al", { id: "al", spec: { family: "aluminium" } }], ["fl", { id: "fl", spec: {} }]]);
  assert.equal(lineSection({ jobMaterialIds: ["al"], generic: true }, byId), SECTIONS.TIMBER_CLADDING);
  assert.equal(lineSection({ jobMaterialId: "fl" }, byId), SECTIONS.FLASHINGS);
  assert.equal(lineSection({ jobMaterialIds: ["gone"], generic: true }, byId), SECTIONS.TIMBER_CLADDING);
  assert.equal(lineSection({ jobMaterialIds: ["gone"] }, byId), SECTIONS.FLASHINGS);
});

t("an accessory naming another supplier conflicts; the same supplier (loosely named) or no name does not", () => {
  const fix = mat("accessory", { supplierName: "Fielders" });
  assert.equal(accessorySupplierConflict(fix, "Fielders (Wingfield branch)"), null);
  assert.equal(accessorySupplierConflict(fix, "FIELDERS PTY LTD"), null);
  assert.equal(accessorySupplierConflict(fix, "Bunnings Trade"), "Fielders");
  assert.equal(accessorySupplierConflict(fix, null), null);
  assert.equal(accessorySupplierConflict(mat("accessory"), "Bunnings"), null);
  assert.equal(accessorySupplierConflict(mat("cladding", { supplierName: "James Hardie" }), "Bunnings"), null); // only accessories
});

console.log(`takeoff-sections: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
