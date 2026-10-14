// =============================================================================
// shared/takeoff/engine/families.js — material FAMILIES beyond flashing (TC-R04): the spec each job material
// stores, its canonical normalisation, procurement identity and completeness problems.
//
// A job material = { name, methodKey, methodVersion, spec, rules, profile }. Flashing keeps catalogue.js
// (normaliseSpec / fabricationIdentity). Every other family sets spec.family and is normalised here.
// Product FACTS (dimensions, cover) come from the catalogue snapshot copied into the job material; the
// installation state stays "source-pending" unless a reviewed rule row / project detail is recorded.
// Ordering policy is per family: timber 1200 + 600n grid (owner, 12), aluminium fixed 6500 bars with kerf
// (11), manufactured cladding = listed product sizes (never the timber grid), random timber LM increment.
// =============================================================================
import { TakeoffValidationError, isFiniteNumber } from "../units.js";

export const FAMILIES = Object.freeze(["timber", "cladding", "aac", "foam", "timber-cladding", "batten", "aluminium", "accessory"]);
export const TIMBER_PURPOSES = Object.freeze(["rafters", "joists", "studs", "plates", "noggins", "battens", "trim", "other"]);
export const TIMBER_GRID = Object.freeze({ kind: "grid", minMm: 1200, incrementMm: 600 });
export const TIMBER_COVER_OPTIONS_MM = Object.freeze([70, 90, 120, 140]);

/** Method per family/purpose (versioned keys from 06). */
export function methodFor(spec) {
  switch (spec?.family) {
    case "timber":
      if (["rafters", "joists", "battens"].includes(spec.purpose)) return { key: "repeated_members", version: 2 };
      if (spec.purpose === "studs") return { key: "wall_frame", version: 1 };
      return { key: "linear_stock", version: 1 };                 // plates, noggins, trim, other members
    case "cladding": case "foam":
      if (spec.layout === "course") return { key: "course_layout", version: 1 };
      if (spec.layout === "grid") return { key: "panel_grid", version: 1 };
      return { key: "sheet_layout", version: 2 };
    case "aac": return { key: "aac_panel_layout", version: 1 };
    case "timber-cladding": return spec.supply === "random" ? { key: "area_to_linear", version: 2 } : { key: "course_layout", version: 1 };
    case "batten": return { key: "support_grid", version: 1 };
    case "aluminium": return { key: "linear_stock", version: 1 };
    case "accessory": return { key: "accessory_routes", version: 1 };
    default: return null;
  }
}

const num = (v, label, { min = 0, allowNull = true, max = 1e6 } = {}) => {
  if (v === "" || v === null || v === undefined) {
    if (allowNull) return null;
    throw new TakeoffValidationError(`${label} is required.`);
  }
  const n = Number(v);
  if (!isFiniteNumber(n) || n <= min || n > max) throw new TakeoffValidationError(`${label} must be a positive number${max < 1e6 ? ` up to ${max}` : ""}.`);
  return Math.round(n * 1000) / 1000;
};
// eslint-disable-next-line no-control-regex -- strip control characters
const txt = (v, max = 80) => (v == null ? null : String(v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) || null);
const lengthsList = (arr, label) => (Array.isArray(arr) ? [...new Set(arr.map((x) => num(x, label, { allowNull: false })))].sort((a, b) => a - b) : []);

/** Canonical spec for a non-flashing family. Throws only for values that can never be valid. */
export function normaliseFamilySpec(spec) {
  const s = spec || {};
  const family = FAMILIES.includes(s.family) ? s.family : null;
  if (!family) throw new TakeoffValidationError("Unknown material family.");
  const base = { v: 1, family, supplierName: txt(s.supplierName), productCode: txt(s.productCode, 60), notes: txt(s.notes, 300),
    availability: s.availability === "supplier_confirmed" ? "supplier_confirmed" : "confirm_with_supplier", spareRate: s.spareRate == null || s.spareRate === "" ? 0 : num(s.spareRate, "Spare %", { min: -1e-9, max: 100 }) };
  if (family === "timber") {
    const maxMm = num(s.stock?.maxMm, "Longest available length");
    return { ...base,
      purpose: TIMBER_PURPOSES.includes(s.purpose) ? s.purpose : "other",
      section: { depthMm: num(s.section?.depthMm, "Section depth"), widthMm: num(s.section?.widthMm, "Section width") },
      grade: txt(s.grade, 40), treatment: txt(s.treatment, 40), species: txt(s.species, 40),
      plies: s.plies == null ? 1 : Math.max(1, Math.round(Number(s.plies)) || 1),
      // the owner's grid for ALL timber suppliers; availability may only remove grid lengths, never add off-grid ones
      stock: { ...TIMBER_GRID, maxMm, unavailableMm: lengthsList(s.stock?.unavailableMm, "Unavailable length").filter((l) => l >= 1200 && (l - 1200) % 600 === 0) },
      sizing: { provenance: ["manual", "engineer-schedule", "manufacturer-schedule"].includes(s.sizing?.provenance) ? s.sizing.provenance : "manual", reference: txt(s.sizing?.reference, 120) },
      endAllowanceMm: s.endAllowanceMm == null || s.endAllowanceMm === "" ? 0 : num(s.endAllowanceMm, "End allowance", { min: -1e-9 }),
    };
  }
  if (family === "aluminium") {
    return { ...base,
      profile: { shape: txt(s.profile?.shape, 30) || "equal-angle", aMm: num(s.profile?.aMm, "Leg A"), bMm: num(s.profile?.bMm, "Leg B"), tMm: num(s.profile?.tMm, "Thickness") },
      alloyTemper: txt(s.alloyTemper, 40), finish: txt(s.finish, 60), colour: txt(s.colour, 60),
      stockLengthMm: num(s.stockLengthMm, "Stock length", { allowNull: false }),
      kerfMm: s.kerfMm == null || s.kerfMm === "" ? null : num(s.kerfMm, "Saw kerf", { min: -1e-9, max: 20 }),
      kerfConfirmed: s.kerfConfirmed === true,
      endTrimMm: s.endTrimMm == null || s.endTrimMm === "" ? 0 : num(s.endTrimMm, "End trim", { min: -1e-9, max: 500 }),
      finalEndAcceptable: s.finalEndAcceptable !== false,
      minRetainedOffcutMm: s.minRetainedOffcutMm == null || s.minRetainedOffcutMm === "" ? 300 : num(s.minRetainedOffcutMm, "Keep offcuts from", { min: -1e-9 }),
      windowPreset: {
        left: s.windowPreset?.left !== false, right: s.windowPreset?.right !== false, bottom: s.windowPreset?.bottom !== false, head: s.windowPreset?.head === true,
        jambAllowanceTotalMm: s.windowPreset?.jambAllowanceTotalMm == null ? 100 : num(s.windowPreset.jambAllowanceTotalMm, "Jamb allowance", { min: -1e-9 }),
        bottomAllowanceMm: s.windowPreset?.bottomAllowanceMm == null ? 0 : num(s.windowPreset.bottomAllowanceMm, "Bottom allowance", { min: -1e-9 }),
        headAllowanceMm: s.windowPreset?.headAllowanceMm == null ? 0 : num(s.windowPreset.headAllowanceMm, "Head allowance", { min: -1e-9 }),
      },
    };
  }
  // panel / sheet / board families: a product snapshot from the catalogue (or a custom/foam/timber entry)
  const p = s.product || {};
  const dims = { lengthMm: num(p.lengthMm, "Product length"), widthMm: num(p.widthMm, "Product width"), thicknessMm: num(p.thicknessMm, "Product thickness") };
  return { ...base,
    product: { id: txt(p.id, 80), manufacturer: txt(p.manufacturer), name: txt(p.name), sku: txt(p.sku, 40), ...dims,
      lengthsMm: lengthsList(p.lengthsMm, "Available length"),   // sheet heights / board lengths of the same profile
      skus: Array.isArray(p.skus) ? p.skus.slice(0, 40).map((x) => ({ sku: txt(x?.sku, 40), lengthMm: num(x?.lengthMm, "SKU length") })).filter((x) => x.sku && x.lengthMm) : [],
      effectiveCoverMm: num(p.effectiveCoverMm, "Effective cover"), gapMm: p.gapMm == null ? null : num(p.gapMm, "Joint gap", { min: -1e-9, max: 50 }),
      finish: txt(p.finish, 60), sourceRefs: Array.isArray(p.sourceRefs) ? p.sourceRefs.map((x) => txt(x, 20)).filter(Boolean) : [],
      packQuantity: p.packQuantity == null ? null : Math.round(Number(p.packQuantity)) || null, fullPackRequired: p.fullPackRequired === true,
      installationState: ["source-pending", "supported-by-selected-rule", "project-detail-supplied"].includes(p.installationState) ? p.installationState : "source-pending" },
    layout: ["sheet", "course", "grid"].includes(s.layout) ? s.layout : family === "aac" ? "panel" : "sheet",
    orientation: s.orientation === "horizontal" ? "horizontal" : "vertical",
    assemblyId: txt(s.assemblyId, 60),
    supply: s.supply === "random" ? "random" : "fixed",           // timber cladding: random-length LM vs fixed stock boards
    orderIncrementM: s.orderIncrementM == null ? null : num(s.orderIncrementM, "Ordering increment"),
    endCondition: ["end-matched", "square"].includes(s.endCondition) ? s.endCondition : "square",
    coating: family === "foam" ? (["factory", "applicator"].includes(s.coating) ? s.coating : null) : null,
    allowOffcutReuse: s.allowOffcutReuse === true,                // sheets: off by default (04 C1)
  };
}

/** What must be bought — changes here make draft order lines stale (06 identity). */
export function familyIdentity(spec) {
  const n = normaliseFamilySpec(spec);
  if (n.family === "timber") return { family: "timber", section: n.section, grade: n.grade?.toLowerCase() || null, treatment: n.treatment?.toLowerCase() || null, species: n.species?.toLowerCase() || null, productCode: n.productCode };
  if (n.family === "aluminium") return { family: "aluminium", profile: n.profile, alloyTemper: n.alloyTemper, finish: n.finish?.toLowerCase() || null, colour: n.colour?.toLowerCase() || null, productCode: n.productCode };
  const p = n.product;
  return { family: n.family, manufacturer: p.manufacturer, name: p.name, sku: p.sku, thicknessMm: p.thicknessMm, widthMm: p.widthMm, effectiveCoverMm: p.effectiveCoverMm,
    finish: p.finish?.toLowerCase() || null, orientation: n.orientation, endCondition: n.endCondition, coating: n.coating, productCode: n.productCode };
}

/** Completeness problems that block ordering (drafts can hold them). */
export function familyProblems(spec) {
  let n;
  try { n = normaliseFamilySpec(spec); } catch (e) { return [{ code: "material_incomplete", message: e.message }]; }
  const out = [];
  const need = (cond, message) => { if (!cond) out.push({ code: "material_incomplete", message }); };
  if (n.family === "timber") {
    need(n.section.depthMm && n.section.widthMm, "Enter the timber section (e.g. 90 × 45).");
    need(n.grade || n.species, "Enter the grade or species.");
    need(n.treatment, "Enter the treatment (or \"untreated\").");
  } else if (n.family === "aluminium") {
    need(n.profile.aMm && n.profile.bMm && n.profile.tMm, "Enter the profile size (e.g. 50 × 50 × 3).");
    need(n.kerfMm != null && n.kerfConfirmed, "Confirm the saw kerf for the cutting plan (an estimate can use 0, ordering can't).");
  } else {
    need(n.product.name, "Choose the product.");
    need(n.product.widthMm && n.product.thicknessMm, "Product width and thickness are needed.");
    if (n.layout !== "grid" && n.family !== "aac") need(n.product.effectiveCoverMm, "Effective cover is needed (supplier/product value — not the nominal width).");
    if (n.family === "foam") need(n.coating, "Choose factory-coated or applicator-coated.");
    if (n.family === "timber-cladding" && n.supply === "random") need(n.orderIncrementM, "Enter the supplier's LM ordering increment.");
    need(n.product.lengthMm || n.product.lengthsMm.length, "Enter the stock length(s) or sheet height(s).");
  }
  return out;
}

/** One readable line for schedules, orders and the supplier PDF (never claims verification). */
export function describeFamilySpec(spec) {
  let n;
  try { n = normaliseFamilySpec(spec); } catch { return { line: "Material details incomplete", installation: null }; }
  const mm = (v) => (v == null ? "?" : String(v));
  if (n.family === "timber") {
    const sec = n.section.depthMm && n.section.widthMm ? `${mm(n.section.depthMm)} × ${mm(n.section.widthMm)}` : "section?";
    return { line: [sec, n.grade, n.species, n.treatment, n.plies > 1 ? `${n.plies} plies` : null].filter(Boolean).join(" · "),
      installation: n.sizing.provenance === "manual" ? "Size: manual selection (not structurally checked)" : `Size: ${n.sizing.reference || n.sizing.provenance}` };
  }
  if (n.family === "aluminium") {
    const p = n.profile;
    return { line: [`${p.shape} ${mm(p.aMm)} × ${mm(p.bMm)} × ${mm(p.tMm)}`, n.alloyTemper, n.finish, n.colour, `${mm(n.stockLengthMm)} mm lengths`].filter(Boolean).join(" · "),
      installation: n.kerfConfirmed ? `Cutting: ${n.kerfMm} mm kerf, ${n.endTrimMm} mm end trim` : "Cutting: saw kerf not confirmed" };
  }
  const p = n.product;
  return {
    line: [p.manufacturer, p.name, p.sku ? `SKU ${p.sku}` : null, p.thicknessMm ? `${p.thicknessMm} thick` : null, p.widthMm ? `${p.widthMm} wide` : null,
      p.effectiveCoverMm ? `cover ${p.effectiveCoverMm}` : null, n.orientation, n.family === "foam" && n.coating ? `${n.coating}-coated` : null,
      n.family === "timber-cladding" ? (n.supply === "random" ? "random lengths" : "fixed lengths") : null].filter(Boolean).join(" · "),
    installation: `Installation: ${p.installationState}${n.assemblyId ? ` (${n.assemblyId})` : ""}`,
  };
}
