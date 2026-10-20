// Hub review HUB 014 — company cladding defaults per catalogue product. Sam's reviewed values for James Hardie
// (cavity, N2, timber frame, on studs, ND nails, 10% spares, Axon 10 mm H-flashing joints) are applied when the
// product is picked; product facts always stay the catalogue's. Drives the REAL shared module, engine and the
// server's content cleaner.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeWorkspace } from "../../shared/takeoff/index.js";
import { productGroups, specFromGroup } from "../../shared/takeoff/products/index.js";
import { BLUE_LEAF_JH_DEFAULTS, applyCompanyDefault, companyDefaultContent, defaultSummary, findCompanyDefault, isCompanyDefault, isDefaulted } from "../../shared/takeoff/companyDefaults.js";
import { cleanMaterialContent } from "../../server/lib/takeoff/takeoffService.mjs";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); } }
const G = (name, w) => productGroups({ family: "cladding" }).find((g) => g.name === name && (!w || g.widthMm === w));
const AXON400 = G("Axon 400 smooth");
const ASM = { axon: "axon-vertical", linea: "linea-horizontal", stria: "stria-smooth-horizontal", matrix: "matrix-grid" };
const material = (g, assemblyId, extra = {}) => ({ id: "m1", name: g.name, methodKey: g.layout === "sheet" ? "sheet_layout" : g.layout === "grid" ? "panel_grid" : "course_layout", methodVersion: g.layout === "sheet" ? 2 : 1,
  spec: { ...specFromGroup(g), assemblyId, spareRate: 0, supplierName: null, ...extra.spec }, rules: { ...extra.rules } });
const D = BLUE_LEAF_JH_DEFAULTS;
// a company default exactly as migration 211 seeds it (product identity only)
const seeded = (g, extra = {}) => ({ id: `pre-${g.name}`, name: `${g.name} — company default`, revision: 1, isActive: true, updatedAt: "2026-10-20T00:00:00Z",
  methodKey: "sheet_layout", methodVersion: 2,
  spec: { family: "cladding", layout: g.layout, product: { id: g.id, manufacturer: g.manufacturer, name: g.name, widthMm: g.widthMm, thicknessMm: g.thicknessMm }, spareRate: D.spareRate, supplierName: null },
  rules: { companyDefault: true, route: D.route, installConditions: { ...D.installConditions }, ...(g.layout === "sheet" ? { jointRows: { atMm: [], ...D.jointRule } } : {}) }, ...extra });

t("findCompanyDefault matches the product id only; ignores company products, retired defaults and other products; newest wins", () => {
  const def = seeded(AXON400);
  const companyProduct = { ...seeded(AXON400), id: "pre-product", rules: { route: "direct" } };
  const retired = { ...seeded(AXON400), id: "pre-old", isActive: false, updatedAt: "2027-01-01T00:00:00Z" };
  const other = seeded(G("Axon 133 smooth"));
  const spec = specFromGroup(AXON400);
  assert.equal(findCompanyDefault([companyProduct, retired, other, def], spec).id, def.id);
  assert.equal(isCompanyDefault(companyProduct), false);
  const newer = { ...seeded(AXON400), id: "pre-new", revision: 2, updatedAt: "2026-10-21T00:00:00Z" };
  assert.equal(findCompanyDefault([def, newer], spec).id, "pre-new");
  assert.equal(findCompanyDefault([def], { family: "cladding", product: {} }), null);
});

t("Axon 400 smooth: the default applies cavity, N2, timber frame, on studs, ND nails, 10% and the 10 mm H-flashing joint; product facts unchanged", () => {
  const m = material(AXON400, ASM.axon);
  const before = JSON.stringify(m.spec.product);
  const out = applyCompanyDefault(m, seeded(AXON400));
  assert.equal(out.spec.spareRate, 10);
  assert.equal(out.rules.route, "cavity");
  assert.deepEqual(out.rules.installConditions, { wind: "N2", substrate: "Timber frame", "on-or-off-stud": "on-stud", "fixing-family": "ND nails", "direct-or-cavity": "cavity" });
  assert.deepEqual(out.rules.jointRows, { atMm: [], gapMm: 10, detailRef: "H-flashing" });
  assert.deepEqual(out.rules.defaultsFrom, { presetId: "pre-Axon 400 smooth", revision: 1, productId: AXON400.id });
  assert.equal(JSON.stringify(out.spec.product), before, "width, thickness, cover, SKUs and lengths stay the catalogue's");
  assert.deepEqual(out.spec.product.lengthsMm, [2450, 2750, 3000]);
  assert.equal(out.spec.product.effectiveCoverMm, 1200);
  assert.ok(isDefaulted(out));
  // a default holding other product sizes never overwrites the product rule
  const wrong = seeded(AXON400); wrong.spec.product = { ...wrong.spec.product, widthMm: 900, effectiveCoverMm: 850 };
  assert.equal(applyCompanyDefault(m, wrong).spec.product.effectiveCoverMm, 1200);
});

t("guards: stock lengths outside the product, a grid product's lengths, other products and keys the assembly doesn't ask are ignored", () => {
  const sub = seeded(AXON400); sub.spec.product = { ...sub.spec.product, lengthsMm: [2750, 3000, 3600] };
  const out = applyCompanyDefault(material(AXON400, ASM.axon), sub);
  assert.deepEqual(out.spec.product.lengthsMm, [2750, 3000]);
  assert.deepEqual(out.spec.product.skus.map((k) => k.lengthMm), [2750, 3000]);
  const none = seeded(AXON400); none.spec.product = { ...none.spec.product, lengthsMm: [3600] };
  assert.deepEqual(applyCompanyDefault(material(AXON400, ASM.axon), none).spec.product.lengthsMm, [2450, 2750, 3000]);
  const mx = G("Matrix", 1190), matrix = { ...seeded(mx) }; matrix.spec.product = { ...matrix.spec.product, lengthsMm: [1] };
  const mOut = applyCompanyDefault(material(mx, ASM.matrix), matrix);
  assert.deepEqual(mOut.spec.product.lengthsMm, specFromGroup(mx).product.lengthsMm);
  assert.deepEqual(mOut.rules.installConditions, { wind: "N2", "on-or-off-stud": "on-stud", "fixing-family": "ND nails" }, "Matrix asks no substrate");
  assert.equal(mOut.rules.route, undefined, "Matrix asks no fixing route");
  assert.equal(mOut.rules.jointRows, undefined, "the sheet joint rule is for sheets only");
  const m = material(AXON400, ASM.axon);
  assert.equal(applyCompanyDefault(m, seeded(G("Axon 133 smooth"))), m, "another product's default is never applied");
});

t("applied after a product change: the default route wins over the old product's carried route, and that flag is cleared", () => {
  const m = material(AXON400, ASM.axon, { rules: { carried: { route: { value: "direct", from: "Axon 133 smooth" }, installConditions: { value: { wind: "N3" }, from: "Axon 133 smooth" } } } });
  const out = applyCompanyDefault(m, seeded(AXON400));
  assert.equal(out.rules.route, "cavity");
  assert.equal(out.rules.carried, undefined);
  // explicit joint heights already on the job are kept (only an empty rule is filled)
  const tall = applyCompanyDefault(material(AXON400, ASM.axon, { rules: { jointRows: { atMm: [2700], gapMm: 6 } } }), seeded(AXON400));
  assert.deepEqual(tall.rules.jointRows, { atMm: [2700], gapMm: 6 });
});

t("Stria, Linea: only the answers their own assembly asks are applied; the rest is listed as still needed", () => {
  const lin = applyCompanyDefault(material(G("Linea", 180), ASM.linea), seeded(G("Linea", 180)));
  assert.deepEqual(lin.rules.installConditions, { wind: "N2", substrate: "Timber frame", "fixing-family": "ND nails", cavity: "cavity" });
  assert.equal(lin.rules.route, "cavity");
  assert.deepEqual(defaultSummary(lin, seeded(G("Linea", 180))).missing, ["edge-zone"]);
  const st = applyCompanyDefault(material(G("Stria smooth", 325), ASM.stria), seeded(G("Stria smooth", 325)));
  assert.deepEqual(st.rules.installConditions, { wind: "N2" });
  assert.deepEqual(defaultSummary(st, seeded(G("Stria smooth", 325))).missing, ["profile-width", "edge-zone", "fixing-style"]);
});

t("summary: Cavity · Wind N2 · Timber frame · On studs · ND nails · 10% spares · lengths · joint; a job change marks only that row", () => {
  const out = applyCompanyDefault(material(AXON400, ASM.axon), seeded(AXON400));
  const { rows, missing } = defaultSummary(out, seeded(AXON400));
  assert.equal(rows.map((r) => r.value).join(" · "), "Cavity · Wind N2 · Timber frame · On studs · ND nails · 10% spares · 2,450 / 2,750 / 3,000 mm · 10 mm H-flashing joints");
  assert.deepEqual(missing, []);
  assert.ok(rows.every((r) => !r.differs));
  const job = { ...out, rules: { ...out.rules, installConditions: { ...out.rules.installConditions, wind: "N3" } } };
  const s2 = defaultSummary(job, seeded(AXON400));
  assert.deepEqual(s2.rows.filter((r) => r.differs).map((r) => r.key), ["wind"]);
  assert.equal(s2.rows.find((r) => r.key === "wind").value, "Wind N3");
});

t("save content keeps the routine choices only and passes the server's cleaner with the conditions intact", () => {
  const out = applyCompanyDefault(material(AXON400, ASM.axon, { spec: { notes: "site note" } }), seeded(AXON400));
  const job = { ...out, rules: { ...out.rules, jointRows: { atMm: [3000], gapMm: 10, detailRef: "H-flashing" }, datumMm: 300, jointsDraft: { x: 1 }, review: { product: { state: "reviewed" } },
    carried: { route: { value: "direct", from: "x" } }, installConditions: { ...out.rules.installConditions, wind: "N3", "direct-or-cavity": "cavity" } } };
  const c = companyDefaultContent(job);
  assert.deepEqual(Object.keys(c.rules).sort(), ["companyDefault", "installConditions", "jointRows", "route"]);
  assert.deepEqual(c.rules.jointRows, { atMm: [], gapMm: 10, detailRef: "H-flashing" }, "joint heights are per wall, never company data");
  assert.equal(c.rules.installConditions.wind, "N3");
  assert.equal(c.rules.installConditions["direct-or-cavity"], undefined, "written from the route, not stored as an answer");
  assert.equal(c.spec.notes, undefined);
  const clean = cleanMaterialContent(c);
  assert.equal(clean.rules.companyDefault, true);
  assert.deepEqual(clean.rules.installConditions, c.rules.installConditions);
  assert.equal(clean.spec.product.id, AXON400.id);
  assert.equal(clean.spec.spareRate, 10);
  // the job's link to its default survives the server too (reload shows the summary again)
  assert.deepEqual(cleanMaterialContent(out).rules.defaultsFrom, out.rules.defaultsFrom);
});

t("engine: a 4,800 × 2,700 Axon 400 wall with the default — sheets counted with 10% spares; no 'conditions still needed'; installation still source-pending", () => {
  const out = applyCompanyDefault(material(AXON400, ASM.axon), seeded(AXON400));
  const ws = { workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [],
    materials: [{ ...out, id: "clad" }],
    measurements: [{ id: "wall", kind: "wall", inputs: { kind: "rect", widthMm: 4800, heightMm: 2700, name: "North" } }],
    contributions: [{ id: "c1", measurementId: "wall", jobMaterialId: "clad", role: "wall" }] };
  const r = computeWorkspace(ws).materialResults.clad;
  const codes = r.problems.map((p) => p.code);
  assert.ok(!codes.includes("installation_selectors_missing"), codes.join(","));
  assert.equal(r.status.installation, "source-pending");
  const lines = computeWorkspace(ws).scheduleLines.filter((l) => (l.jobMaterialIds || []).includes("clad") && l.unit === "sheet");
  assert.equal(lines.reduce((n, l) => n + l.quantity, 0), 5, JSON.stringify(lines.map((l) => [l.quantity, l.finishedLengthMm])));
  assert.equal(lines.reduce((n, l) => n + (l.spareQuantity || 0), 0), 1, "10% spares on 4 sheets rounds up to 1");
  // without the default the same wall still asks for the installation conditions
  const bare = computeWorkspace({ ...ws, materials: [{ ...material(AXON400, ASM.axon), id: "clad" }] }).materialResults.clad;
  assert.ok(bare.problems.some((p) => p.code === "installation_selectors_missing"));
});

t("migration 211 seeds exactly the James Hardie cladding products, with Sam's values, and skips a product that already has a default", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/211_takeoff_company_cladding_defaults.sql", import.meta.url), "utf8");
  const ids = [...sql.matchAll(/"product":\{"id":"([^"]+)"/g)].map((m) => m[1]).sort();
  const jh = productGroups({ family: "cladding" }).filter((g) => g.manufacturer === "James Hardie").map((g) => g.id).sort();
  assert.deepEqual(ids, jh);
  assert.equal((sql.match(/"wind":"N2","substrate":"Timber frame","on-or-off-stud":"on-stud","fixing-family":"ND nails"/g) || []).length, jh.length);
  assert.equal((sql.match(/"jointRows":\{"atMm":\[\],"gapMm":10,"detailRef":"H-flashing"\}/g) || []).length, jh.filter((id) => /Axon/.test(id)).length);
  assert.match(sql, /WHERE NOT EXISTS/);
  assert.doesNotMatch(sql, /CREATE TEMP|DROP |DELETE /);
});

console.log(`takeoff-tc-hub014: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
