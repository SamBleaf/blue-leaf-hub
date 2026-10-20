/**
 * Company cladding defaults per catalogue product (Hub review HUB 014).
 *
 * A company default is a company preset marked rules.companyDefault = true and keyed by the catalogue product
 * (spec.product.id). It holds only Blue Leaf's routine choices: spares, the stocked lengths, supplier,
 * fixing route, installation conditions and the sheet joint rule. Product facts (sizes, effective cover,
 * SKUs, sources) always come from the catalogue and are never overwritten by a default. Applying a default
 * changes the job material only; the company default changes only through an explicit "Save as company default".
 */
import { CATALOGUE_SEED } from "./products/seed.js";
import { productGroups } from "./products/index.js";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const filled = (v) => v !== undefined && v !== null && v !== "";
const ROUTE_SELECTORS = ["direct-or-cavity", "cavity"];
// written from another choice on the card (route / coating / orientation), never stored as a default answer
const DERIVED_SELECTORS = ["direct-or-cavity", "cavity", "factory-or-applicator-coated", "orientation"];
const DEFAULT_FAMILIES = ["cladding", "aac", "foam"];

/** Blue Leaf's reviewed James Hardie values (HUB 014), as seeded by migration 211. */
export const BLUE_LEAF_JH_DEFAULTS = Object.freeze({
  spareRate: 10,
  route: "cavity",
  installConditions: Object.freeze({ wind: "N2", substrate: "Timber frame", "on-or-off-stud": "on-stud", "fixing-family": "ND nails" }),
  jointRule: Object.freeze({ gapMm: 10, detailRef: "H-flashing" }),
});

const assemblyOf = (spec) => CATALOGUE_SEED.assemblyCandidates.find((a) => a.id === spec?.assemblyId) || null;
const groupCache = new Map();
function groupOf(spec) {
  if (!spec?.product?.id || !DEFAULT_FAMILIES.includes(spec.family)) return null;
  if (!groupCache.has(spec.family)) groupCache.set(spec.family, productGroups({ family: spec.family }));
  return groupCache.get(spec.family).find((g) => g.id === spec.product.id) || null;
}
const isGrid = (g) => g?.layout === "grid";

export const isCompanyDefault = (p) => !!p && p.isActive !== false && p.rules?.companyDefault === true && !!p.spec?.product?.id;

/** The saved company default for this product (the newest wins if two were ever saved), or null. */
export function findCompanyDefault(presets, spec) {
  const id = spec?.product?.id;
  if (!id) return null;
  const list = (presets || []).filter((p) => isCompanyDefault(p) && p.spec.product.id === id);
  list.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || (b.revision || 0) - (a.revision || 0));
  return list[0] || null;
}

/** The default values of a saved company default, in one flat shape. */
export function defaultValues(preset) {
  if (!preset) return null;
  const s = preset.spec || {}, r = preset.rules || {};
  const jr = r.jointRows && typeof r.jointRows === "object" ? r.jointRows : null;
  return {
    presetId: preset.id, revision: preset.revision ?? null, productId: s.product?.id || null,
    spareRate: isNum(s.spareRate) ? s.spareRate : null,
    supplierName: filled(s.supplierName) ? s.supplierName : null,
    availability: filled(s.availability) ? s.availability : null,
    lengthsMm: Array.isArray(s.product?.lengthsMm) && s.product.lengthsMm.length ? s.product.lengthsMm : null,
    route: r.route === "cavity" || r.route === "direct" ? r.route : null,
    installConditions: r.installConditions && typeof r.installConditions === "object" ? r.installConditions : null,
    jointRule: jr && isNum(jr.gapMm) ? { gapMm: jr.gapMm, detailRef: filled(jr.detailRef) ? jr.detailRef : null } : null,
  };
}

function stockSubset(g, on) {
  const lengthsMm = g.lengthsMm.filter((L) => on.includes(L));
  return {
    lengthsMm,
    skus: g.skus.filter((k) => lengthsMm.includes(k.lengthMm)).map((k) => ({ sku: k.sku, lengthMm: k.lengthMm })),
    sku: lengthsMm.length === 1 ? g.skus.find((k) => k.lengthMm === lengthsMm[0])?.sku || null : null,
    lengthMm: lengthsMm.length === 1 ? lengthsMm[0] : null,
  };
}

/**
 * Apply a saved company default to a job material (after the product is picked and carry() has run).
 * Only the default's own fields are set, each one checked against this product and its selected assembly.
 */
export function applyCompanyDefault(m, preset) {
  const def = defaultValues(preset);
  if (!def || !m?.spec?.product?.id || def.productId !== m.spec.product.id) return m;
  const spec = { ...m.spec, product: { ...m.spec.product } };
  const rules = { ...(m.rules || {}) };
  const carried = { ...(rules.carried || {}) };
  if (isNum(def.spareRate)) spec.spareRate = def.spareRate;
  if (def.supplierName) spec.supplierName = def.supplierName;
  if (def.availability) spec.availability = def.availability;
  const g = groupOf(spec);
  if (g && !isGrid(g) && def.lengthsMm) {
    const on = g.lengthsMm.filter((L) => def.lengthsMm.includes(L));
    if (on.length) Object.assign(spec.product, stockSubset(g, on));
  }
  const req = new Set(assemblyOf(spec)?.requiredSelectors || []);
  if (def.route && ROUTE_SELECTORS.some((k) => req.has(k))) { rules.route = def.route; delete carried.route; }
  const ic = Object.fromEntries(Object.entries(def.installConditions || {}).filter(([k, v]) => req.has(k) && !DERIVED_SELECTORS.includes(k) && filled(v)));
  for (const k of ROUTE_SELECTORS) if (req.has(k) && rules.route) ic[k] = rules.route; // the route's own condition, as the card writes it
  if (Object.keys(ic).length) { rules.installConditions = { ...(rules.installConditions || {}), ...ic }; delete carried.installConditions; }
  if (def.jointRule && spec.layout === "sheet" && !rules.jointRows) {
    rules.jointRows = { atMm: [], gapMm: def.jointRule.gapMm, ...(def.jointRule.detailRef ? { detailRef: def.jointRule.detailRef } : {}) };
    delete rules.jointRowsDraft; delete carried.jointRows;
  }
  if (Object.keys(carried).length) rules.carried = carried; else delete rules.carried;
  rules.defaultsFrom = { presetId: def.presetId, revision: def.revision, productId: def.productId };
  return { ...m, spec, rules };
}

/** The job material without its link to a company default (a different product, family or a fresh start). */
export function withoutDefaultsFrom(m) {
  if (!m?.rules?.defaultsFrom) return m;
  const rules = { ...m.rules };
  delete rules.defaultsFrom;
  return { ...m, rules };
}

/** True when this job material was set up from a company default of its current product. */
export const isDefaulted = (m) => !!m?.rules?.defaultsFrom && m.rules.defaultsFrom.productId === m?.spec?.product?.id;

/** Preset content for "Save as company default": the routine choices only — never walls, heights or job notes. */
export function companyDefaultContent(m) {
  const s = m?.spec || {}, r = m?.rules || {};
  const spec = { ...s };
  delete spec.notes;
  const req = new Set(assemblyOf(s)?.requiredSelectors || []);
  const ic = Object.fromEntries(Object.entries(r.installConditions || {}).filter(([k, v]) => req.has(k) && !DERIVED_SELECTORS.includes(k) && filled(v)));
  const rules = { companyDefault: true };
  if (r.route === "cavity" || r.route === "direct") rules.route = r.route;
  if (Object.keys(ic).length) rules.installConditions = ic;
  const jr = r.jointRows && typeof r.jointRows === "object" ? r.jointRows : null;
  if (s.layout === "sheet" && jr && isNum(jr.gapMm)) rules.jointRows = { atMm: [], gapMm: jr.gapMm, ...(filled(jr.detailRef) ? { detailRef: jr.detailRef } : {}) };
  return {
    name: `${s.product?.name || "Cladding"} — company default`.slice(0, 120),
    methodKey: m.methodKey, methodVersion: m.methodVersion, spec, rules,
    sourceReview: { status: "user_entered" },
  };
}

const ROUTE_TEXT = { cavity: "Cavity", direct: "Direct fix" };
const CHOICE_TEXT = { "on-stud": "On studs", "off-stud": "Off studs", face: "Face fixed", concealed: "Concealed" };
const mm = (n) => Number(n).toLocaleString("en-AU");
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The compact summary of a defaulted job material: one row per routine choice ({key, value, differs}),
 * where differs = this job was changed from the company default, plus the assembly questions still unanswered.
 */
export function defaultSummary(m, preset) {
  const def = defaultValues(preset) || {};
  const s = m?.spec || {}, r = m?.rules || {};
  const ic = r.installConditions || {};
  const req = assemblyOf(s)?.requiredSelectors || [];
  const rows = [];
  const add = (key, value, differs) => { if (filled(value)) rows.push({ key, value, differs: !!differs }); };
  if (req.some((k) => ROUTE_SELECTORS.includes(k))) add("route", ROUTE_TEXT[r.route], def.route && r.route !== def.route);
  for (const k of req) {
    if (DERIVED_SELECTORS.includes(k) || !filled(ic[k])) continue;
    const d = def.installConditions?.[k];
    add(k, k === "wind" ? `Wind ${ic[k]}` : CHOICE_TEXT[ic[k]] || String(ic[k]), filled(d) && d !== ic[k]);
  }
  add("spares", isNum(s.spareRate) ? `${mm(s.spareRate)}% spares` : null, isNum(def.spareRate) && s.spareRate !== def.spareRate);
  const lengths = (s.product?.lengthsMm || []).slice().sort((a, b) => a - b);
  const g = groupOf(s);
  if (g && !isGrid(g) && lengths.length) add("lengths", `${lengths.map(mm).join(" / ")} mm`, def.lengthsMm ? !sameList(lengths, def.lengthsMm.slice().sort((a, b) => a - b)) : lengths.length !== g.lengthsMm.length);
  const jr = r.jointRows;
  if (s.layout === "sheet" && jr && isNum(jr.gapMm)) add("joint", `${mm(jr.gapMm)} mm ${jr.detailRef || "joint"} joints`, def.jointRule && (jr.gapMm !== def.jointRule.gapMm || (jr.detailRef || null) !== def.jointRule.detailRef));
  add("supplier", s.supplierName, !!preset && (s.supplierName || null) !== (def.supplierName || null));
  const missing = req.filter((k) => (ROUTE_SELECTORS.includes(k) ? !(r.route === "cavity" || r.route === "direct") : !DERIVED_SELECTORS.includes(k) && !filled(ic[k])));
  return { rows, missing };
}
