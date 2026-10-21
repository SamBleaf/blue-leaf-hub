// Hub review HUB 024 — an aluminium setup saved as a company product (review fixes, 21 Oct 2026). Pure rules from
// shared/takeoff/companyProducts.js: a name never ends up holding a different angle (a same-named product is only
// versioned for the same profile), and a job's own copy that already holds the company version (e.g. the one it just
// saved) isn't flagged out of date; its own kerf confirmation never counts as a difference. The server side is in
// takeoff-api.test.mjs ("HUB 024 …"), the screens in e2e/ui-review/tc-hub-review.spec.js ("HUB 024 …").
//   node scripts/tests/takeoff-tc-hub024.test.mjs
import assert from "node:assert/strict";
import { companyVersionDiffers, findAluminiumProduct, profileSizeText, sameAluminiumProfile } from "../../shared/takeoff/companyProducts.js";
import { aluminiumPreset } from "../../shared/takeoff/products/index.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 3).join("\n    ")}`); } }

const NAME = "Aluminium angle 50 × 50 × 3";
const spec = (over = {}) => ({ ...aluminiumPreset(), kerfMm: 3, ...over });
const angle = (a, b, th) => ({ shape: "equal-angle", aMm: a, bMm: b, tMm: th });
const product = (id, name, sp, extra = {}) => ({ id, name, revision: 1, isActive: true, methodKey: "linear_stock", methodVersion: 1, spec: sp, rules: {}, profile: null, ...extra });

t("profileSizeText reads a complete angle only", () => {
  assert.equal(profileSizeText(spec()), "50 × 50 × 3");
  assert.equal(profileSizeText(spec({ profile: angle(40, 40, 2) })), "40 × 40 × 2");
  assert.equal(profileSizeText(spec({ profile: angle(50, null, 3) })), null);
  assert.equal(profileSizeText(spec({ profile: angle(50, 50, 0) })), null);
  assert.equal(profileSizeText({}), null);
  assert.equal(profileSizeText(null), null);
});

t("sameAluminiumProfile: legs and thickness decide; stock, kerf and finish don't", () => {
  assert.equal(sameAluminiumProfile(spec(), spec({ stockLengthMm: 6000, kerfMm: 4, finish: "Anodised" })), true);
  assert.equal(sameAluminiumProfile(spec(), spec({ profile: angle(40, 40, 2) })), false, "the review case: 40 × 40 × 2 is not the 50 × 50 × 3");
  assert.equal(sameAluminiumProfile(spec(), spec({ profile: angle(50, 50, 2) })), false);
  assert.equal(sameAluminiumProfile(spec(), spec({ profile: angle(50, 40, 3) })), false);
  assert.equal(sameAluminiumProfile(spec(), spec({ profile: { aMm: 50, bMm: 50, tMm: 3 } })), true, "no shape on one side: the sizes decide");
  assert.equal(sameAluminiumProfile(spec(), spec({ profile: { ...angle(50, 50, 3), shape: "unequal-angle" } })), false);
  assert.equal(sameAluminiumProfile(spec({ profile: { aMm: "50", bMm: 50, tMm: 3 } }), spec()), true, "a number typed as text");
});

t("findAluminiumProduct: by name in any letter case; active aluminium only, never a company default", () => {
  const list = [
    product("p-flash", NAME, { family: "flashing" }),
    product("p-old", NAME, spec(), { isActive: false }),
    product("p-def", NAME, spec(), { rules: { companyDefault: true } }),
    product("p-50", NAME, spec()),
  ];
  assert.equal(findAluminiumProduct(list, "aluminium angle 50 × 50 × 3 ")?.id, "p-50");
  assert.equal(findAluminiumProduct(list, "Window angle"), null);
  assert.equal(findAluminiumProduct(list, ""), null);
  assert.equal(findAluminiumProduct(null, NAME), null);
});

t("companyVersionDiffers: the version a job just saved from its own copy is not an update (its kerf confirmation stays its own)", () => {
  // the job copy (rev 1) with its kerf confirmed and stock changed, then saved as rev 2: the server clears kerfConfirmed
  const job = { id: "jm", name: NAME, methodKey: "linear_stock", methodVersion: 1, spec: spec({ kerfConfirmed: true, stockLengthMm: 6000 }), rules: {}, profile: null, fromPresetId: "p-50", fromPresetRevision: 1 };
  const rev2 = product("p-50", NAME, { ...job.spec, kerfConfirmed: false }, { revision: 2 });
  assert.equal(companyVersionDiffers(job, rev2), false);
  // job-only rules never travel with a company product, so they are no difference either
  assert.equal(companyVersionDiffers({ ...job, rules: { carried: { finish: "Mill" } } }, rev2), false);
  // a real change by someone else IS an update (stock, kerf value, finish, window detail, name)
  assert.equal(companyVersionDiffers(job, { ...rev2, spec: { ...rev2.spec, stockLengthMm: 5000 } }), true);
  assert.equal(companyVersionDiffers(job, { ...rev2, spec: { ...rev2.spec, kerfMm: 4 } }), true);
  assert.equal(companyVersionDiffers(job, { ...rev2, spec: { ...rev2.spec, finish: "Anodised" } }), true);
  assert.equal(companyVersionDiffers(job, { ...rev2, spec: { ...rev2.spec, windowPreset: { ...rev2.spec.windowPreset, head: true } } }), true);
  assert.equal(companyVersionDiffers(job, { ...rev2, name: "Window angle 50 × 50 × 3" }), true);
  // not set is not set: null, missing and "" read the same
  assert.equal(companyVersionDiffers({ ...job, spec: { ...job.spec, alloyTemper: null } }, { ...rev2, spec: { ...rev2.spec, alloyTemper: "" } }), false);
  // outside aluminium a kerf confirmation is an ordinary field (nothing else changes for other families)
  const flash = { name: "F", methodKey: "flashing_runs", spec: { family: "flashing", kerfConfirmed: true }, rules: {}, profile: null };
  assert.equal(companyVersionDiffers(flash, { ...flash, spec: { family: "flashing", kerfConfirmed: false } }), true);
  assert.equal(companyVersionDiffers(null, rev2), false);
});

console.log(`takeoff-tc-hub024: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
