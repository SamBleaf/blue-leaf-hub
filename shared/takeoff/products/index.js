// =============================================================================
// shared/takeoff/products/index.js — the researched product catalogue as pickable PRODUCT GROUPS.
//
// A group = one manufacturer profile (e.g. "Axon 133 smooth", 1200 wide, 9 thick) with its published SKUs as
// lengths/heights. Picking a group copies a SNAPSHOT into the job material (family spec `product`), so
// catalogue updates never silently change a job (06). Facts carry their source refs; installation stays
// "source-pending" and supplier availability "unconfirmed" (research seed — 09/10).
// Owner preferences (12): Walsc first for AAC; Rendex is a separate foam family with no seeded dimensions.
// =============================================================================
import { CATALOGUE_SEED } from "./seed.js";

const FAMILY_OF = { cladding: "cladding", aac: "aac", batten: "batten", "aluminium-profile": "aluminium" };
const LAYOUT_OF = (p) => (/^axon/.test(p.id) ? "sheet" : /^(linea|stria)/.test(p.id) ? "course" : /^matrix/.test(p.id) ? "grid" : p.family === "aac" ? "panel" : "sheet");
const ORIENTATION_OF = (p) => (/^linea/.test(p.id) ? "horizontal" : "vertical");

/** Group the seed SKUs into profiles. Lengths are the published SKU lengths (sheet heights / board lengths). */
export function productGroups({ family } = {}) {
  const groups = new Map();
  for (const p of CATALOGUE_SEED.products) {
    const fam = FAMILY_OF[p.family] || p.family;
    if (family && fam !== family) continue;
    if (!p.dimensionsMm) continue; // e.g. aluminium preset is handled by aluminiumPreset()
    const key = `${p.manufacturer}|${p.name}|${p.dimensionsMm.width}|${p.dimensionsMm.thickness}`;
    let g = groups.get(key);
    if (!g) {
      g = { id: key, family: fam, manufacturer: p.manufacturer, name: p.name, widthMm: p.dimensionsMm.width, thicknessMm: p.dimensionsMm.thickness,
        effectiveCoverMm: p.effectiveCoverMm ?? null, layout: LAYOUT_OF(p), orientation: ORIENTATION_OF(p), skus: [], sourceRefs: new Set(),
        installationState: p.installationState || "source-pending", supplierAvailability: p.supplierAvailability || "unconfirmed" };
      groups.set(key, g);
    }
    g.skus.push({ sku: p.sku, id: p.id, lengthMm: p.dimensionsMm.length, packQuantity: p.publishedPackQuantity ?? null });
    for (const r of p.sourceRefs || []) g.sourceRefs.add(r);
  }
  const preferred = CATALOGUE_SEED.preferredSystems || {};
  return [...groups.values()].map((g) => ({ ...g, sourceRefs: [...g.sourceRefs], skus: g.skus.sort((a, b) => a.lengthMm - b.lengthMm), lengthsMm: [...new Set(g.skus.map((s) => s.lengthMm))].sort((a, b) => a - b) }))
    .sort((a, b) => (a.family === "aac" ? Number(b.manufacturer === preferred.aac) - Number(a.manufacturer === preferred.aac) : 0) || a.name.localeCompare(b.name) || a.widthMm - b.widthMm);
}

/** Assembly candidates that name this product family (never auto-approved). */
export function assembliesFor(group) {
  const id = String(group?.skus?.[0]?.id || "");
  return CATALOGUE_SEED.assemblyCandidates.filter((a) => {
    if (/^axon/.test(id)) return a.id === "axon-vertical";
    if (/^linea/.test(id)) return a.id === "linea-horizontal";
    if (/^stria/.test(id)) return /^stria/.test(a.id) && (group.name.includes("Fine") ? a.id === "stria-fine-texture" : a.id !== "stria-fine-texture");
    if (/^matrix/.test(id)) return a.id === "matrix-grid";
    if (/^hebel50/.test(id)) return a.id === "hebel50";
    if (/^hebelxl/.test(id)) return a.id === "hebelxl";
    if (/^walsc/.test(id)) return a.id === "walsc50";
    return false;
  });
}

/** Spec for a job material made from a product group (a frozen snapshot of the catalogue facts). */
export function specFromGroup(group, { orientation, assemblyId, sku } = {}) {
  const chosen = sku ? group.skus.find((s) => s.sku === sku) : null;
  return {
    family: group.family,
    layout: group.layout,
    orientation: orientation || group.orientation,
    assemblyId: assemblyId || assembliesFor(group)[0]?.id || null,
    product: {
      id: group.id, manufacturer: group.manufacturer, name: group.name, sku: chosen?.sku || null,
      lengthMm: chosen?.lengthMm || null, lengthsMm: chosen ? [chosen.lengthMm] : group.lengthsMm,
      skus: (chosen ? [chosen] : group.skus).map((x) => ({ sku: x.sku, lengthMm: x.lengthMm })),
      widthMm: group.widthMm, thicknessMm: group.thicknessMm, effectiveCoverMm: group.effectiveCoverMm,
      gapMm: group.layout === "grid" ? 10 : null, sourceRefs: group.sourceRefs, installationState: group.installationState,
      packQuantity: chosen?.packQuantity ?? null, fullPackRequired: false,
    },
  };
}

/** Owner's aluminium preset (11): 50 × 50 × 3 equal angle, 6500 stock, no joins; kerf must be confirmed. */
export function aluminiumPreset() {
  const p = CATALOGUE_SEED.products.find((x) => x.family === "aluminium-profile") || {};
  return {
    family: "aluminium",
    profile: { shape: "equal-angle", aMm: p.sectionMm?.legA ?? 50, bMm: p.sectionMm?.legB ?? 50, tMm: p.sectionMm?.thickness ?? 3 },
    finish: p.finish || null, alloyTemper: p.alloyTemper || null,
    stockLengthMm: (p.stockLengthsMm && p.stockLengthsMm[0]) || 6500, kerfMm: null, kerfConfirmed: false, endTrimMm: p.endTrimMm ?? 0,
    finalEndAcceptable: true, minRetainedOffcutMm: 300,
    windowPreset: { left: true, right: true, bottom: true, head: false, jambAllowanceTotalMm: 100, bottomAllowanceMm: 0, headAllowanceMm: 0 },
  };
}

/** Rendex EPS (12): no seeded dimensions — the exact product and system values must be entered. */
export function rendexTemplate() {
  return { family: "foam", layout: "sheet", orientation: "vertical", assemblyId: "rendex-eps", coating: null,
    product: { id: "rendex-custom", manufacturer: "Rendex", name: "Rendex EPS (enter product)", lengthMm: null, widthMm: null, thicknessMm: null, effectiveCoverMm: null, sourceRefs: ["F01", "F02"], installationState: "source-pending" } };
}

export const CUSTOM_TIMBER_PROFILE = CATALOGUE_SEED.customTimberProfile;
export const TIMBER_ORDERING_POLICY = CATALOGUE_SEED.timberOrderingPolicy;
export const SOURCE_STATUS = CATALOGUE_SEED.status;
