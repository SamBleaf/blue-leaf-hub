// =============================================================================
// shared/takeoff/engine/families.js — material FAMILIES beyond flashing (TC-R04): the spec each job material
// stores, its canonical normalisation, procurement identity and completeness problems.
//
// A job material = { name, methodKey, methodVersion, spec, rules, profile }. Flashing keeps catalogue.js
// (normaliseSpec / fabricationIdentity). Every other family sets spec.family and is normalised here.
// Product FACTS (dimensions, cover) come from the catalogue snapshot copied into the job material; the
// installation state stays "source-pending" unless a reviewed rule row / project detail is recorded.
// Ordering policy is per family: timber 1200 + 300n grid (owner, 25 Oct 2026; was 1200 + 600n from 14 Oct),
// aluminium fixed 6500 bars with kerf (11), manufactured cladding = listed product sizes (never the timber grid),
// random timber LM increment.
//
// HUB 028 Walls: one timber item (purpose "walls", method wall_framing@1) holding four parts in spec.components:
// studs, plates, long plates (90 × 45 LVL, Sam's round 3) and noggins. Each part is a small timber identity with its
// own longest length; Walls is never a Purpose chip, so "walls" stays out of TIMBER_PURPOSES.
// =============================================================================
import { TakeoffValidationError, isFiniteNumber } from "../units.js";
import { identityKey as identityKeyOf } from "./contract.js";

export const FAMILIES = Object.freeze(["timber", "cladding", "aac", "foam", "timber-cladding", "batten", "aluminium", "accessory"]);
export const TIMBER_PURPOSES = Object.freeze(["rafters", "joists", "studs", "plates", "noggins", "battens", "trim", "other"]);
/** The owner's timber grid for EVERY supplier and every timber item: 1,200 mm, then 300 mm steps (1,500, 1,800 …).
 *  Sam, 25 Oct 2026 ("Yes, 300 mm steps"; OWNER-2026-10-25), replacing the 600 mm steps of 14 Oct (OWNER-2026-10-14).
 *  The ONE definition: engine/timber.js, dispatch.js and the app read it from here. */
export const TIMBER_GRID = Object.freeze({ kind: "grid", minMm: 1200, incrementMm: 300 });
export const TIMBER_GRID_SOURCE = "OWNER-2026-10-25";
/** Is this a length on the timber grid (1,200, 1,500, 1,800 …)? Only these can be marked "not stocked". */
export function onTimberGrid(mm) {
  const n = Number(mm);
  return isFiniteNumber(n) && n >= TIMBER_GRID.minMm && (n - TIMBER_GRID.minMm) % TIMBER_GRID.incrementMm === 0;
}
export const TIMBER_COVER_OPTIONS_MM = Object.freeze([70, 90, 120, 140]);

// ── HUB 027: timber size choices per purpose (owner, 21 Oct 2026) ─────────────────────────────────────────────
// ORDERING setup only, never a structural size: a row fills the section, and the grade only where the owner named
// one (studs: MGP10). No row carries a treatment, and there is no built-in LVL row: an LVL grade and treatment come
// only from a saved company product. Rafters, joists, trim and other members have no stated choices.
export const TIMBER_PRESETS_SOURCE = "OWNER-2026-10-21";
const tp = (purpose, depthMm, widthMm, grade = null) =>
  Object.freeze({ id: `${purpose}-${depthMm}x${widthMm}${grade ? `-${grade.toLowerCase()}` : ""}`, depthMm, widthMm, grade });
export const TIMBER_PRESETS = Object.freeze({
  studs: Object.freeze([tp("studs", 90, 35, "MGP10"), tp("studs", 90, 45, "MGP10"), tp("studs", 120, 35, "MGP10"), tp("studs", 120, 45, "MGP10")]),
  noggins: Object.freeze([tp("noggins", 90, 35)]),
  plates: Object.freeze([tp("plates", 90, 45)]),
  battens: Object.freeze([tp("battens", 90, 35), tp("battens", 70, 35), tp("battens", 90, 45), tp("battens", 70, 45)]),
});

const low = (v) => (v == null ? "" : String(v).trim().toLowerCase());
const sameNum = (a, b) => (a == null || a === "" ? null : Number(a)) === (b == null || b === "" ? null : Number(b));

/** The built-in size choices for one timber purpose ([] when the owner stated none). */
export function timberPresetsFor(purpose) {
  return TIMBER_PRESETS[purpose] || [];
}

/** "90 × 45 MGP10" / "90 × 35" — how a built-in choice reads in the list. */
export function timberPresetLabel(preset) {
  return `${preset.depthMm} × ${preset.widthMm}${preset.grade ? ` ${preset.grade}` : ""}`;
}

/**
 * A built-in choice applied to a timber spec: the section, and the grade only when the choice names one (a size-only
 * row leaves an entered grade alone). Treatment, supplier, stock, plies and sizing (still "manual") are never touched.
 * A built-in row is a size, not a product: the supplier code and species can only come from a saved company product
 * and neither shows on the Timber card, so picking a built-in row clears both. An order never carries one product's
 * code or species (e.g. "LVL") on a plain "90 × 35 MGP10" line, and the list keeps showing the row picked.
 */
export function applyTimberPreset(spec, preset) {
  const s = spec || {};
  const section = { ...(s.section || {}), depthMm: preset.depthMm, widthMm: preset.widthMm };
  const grade = preset.grade || s.grade || null;
  const next = { ...s, section, grade };
  if (s.productCode) next.productCode = null;
  if (s.species) next.species = null;
  return next;
}

/** A saved company timber product's identity copied onto a job spec exactly as saved (nothing assumed or kept). */
export function timberProductFill(spec, productSpec) {
  const p = productSpec || {};
  return { ...(spec || {}),
    section: { depthMm: p.section?.depthMm ?? null, widthMm: p.section?.widthMm ?? null },
    grade: p.grade ?? null, treatment: p.treatment ?? null, species: p.species ?? null,
    supplierName: p.supplierName ?? null, productCode: p.productCode ?? null };
}

/** Does a job's timber spec hold exactly what this company product fills (everything timberProductFill writes)? */
export function timberProductMatches(spec, product) {
  const s = spec || {}, ps = product?.spec || {};
  return sameNum(ps.section?.depthMm, s.section?.depthMm) && sameNum(ps.section?.widthMm, s.section?.widthMm)
    && ["grade", "treatment", "species", "supplierName", "productCode"].every((k) => low(ps[k]) === low(s[k]));
}

/** Does a job's timber spec hold this built-in row (the same section, and the same grade when the row names one)? */
export function timberPresetMatches(spec, preset) {
  const s = spec || {};
  return sameNum(preset?.depthMm, s.section?.depthMm) && sameNum(preset?.widthMm, s.section?.widthMm) && (!preset.grade || low(preset.grade) === low(s.grade));
}

/**
 * Which choice the saved fields match (the choice itself is never stored, so it survives a reload as the fields do):
 * a company product id when the job holds exactly what that product fills (section, grade, treatment, species,
 * supplier and supplier code, so two suppliers' same-size products stay apart), else a built-in id (same section, and
 * the same grade when the row names one), "custom" when a section or grade is entered that matches nothing, null
 * when empty.
 */
export function matchTimberChoice(spec, presets = [], products = []) {
  const s = spec || {};
  const d = s.section?.depthMm, w = s.section?.widthMm;
  if ((d == null || d === "") && (w == null || w === "") && !low(s.grade)) return null;
  for (const p of products || []) if (timberProductMatches(s, p)) return p.id;
  for (const p of presets || []) if (timberPresetMatches(s, p)) return p.id;
  return "custom";
}

// ── HUB 028 Walls: one timber item, four parts ────────────────────────────────────────────────────────────────
/** The Walls purpose. Kept out of TIMBER_PURPOSES: no Purpose chip and no company-product purpose. */
export const WALLS_PURPOSE = "walls";
/** Walls parts in the order they read (the fold lists Long plates after Plates). Keys of spec.components. */
export const WALL_PARTS = Object.freeze(["studs", "plates", "longPlates", "noggins"]);
export const WALL_PART_LABELS = Object.freeze({ studs: "Studs", plates: "Plates", longPlates: "Long plates", noggins: "Noggins" });
/** Sam, 25 Oct 2026: the longest length for plates and noggins is 6,000 on every new Walls item (a saved company
 *  product's own longest length still wins). Round 3: 90 × 45 LVL plates come up to 11,000. Studs: none stated. */
export const WALL_PART_DEFAULT_MAX_MM = Object.freeze({ studs: null, plates: 6000, longPlates: 11000, noggins: 6000 });
/** Sam, round 3: "lvl 90x45 plates … we use them when long plates are required" — the Long plates part's default. */
export const WALL_LONG_PLATE_DEFAULT = Object.freeze({ depthMm: 90, widthMm: 45, grade: "LVL" });
/** Long plates start at the first 300 mm step over the pine plates' longest length [Default, needs Sam]: 6,300 over
 *  the 6,000 default (longPlateStockLengths takes the actual pine longest, so a 4,800 plate product starts them at 5,100). */
export const WALL_LVL_STOCK_MIN_MM = 6300;
/** Walls rules (bounded scalars the server already keeps): one Stud centres and one Double top plate per item. */
export const WALL_FRAMING_RULES = Object.freeze({ centresMm: 600, doubleTopPlate: false });
/** Sam, round 2 (25 Oct 2026): 2 full-length studs each side of every opening on Walls (windows, doors and other). */
export const WALL_STUDS_EACH_SIDE = 2;

const LVL_RE = /\blvl/i;
/** Is this saved timber product an LVL (grade or species names LVL, e.g. "LVL13" or species "LVL")? */
export function isLvlTimber(spec) {
  return LVL_RE.test(String(spec?.grade ?? "")) || LVL_RE.test(String(spec?.species ?? ""));
}

/**
 * The company timber products that can fill one Walls part: active timber products saved for that part's purpose
 * (the same filter as the Timber card's Size and grade list). Plates are split by LVL: Long plates take the LVL plate
 * products, Plates the others [Default, needs Sam], so saving one pine and one LVL plate product fills both parts.
 */
export function wallPartProducts(presets, part) {
  const purpose = part === "longPlates" ? "plates" : part;
  return (presets || []).filter((p) => p?.isActive !== false && p?.spec?.family === "timber" && p.spec.purpose === purpose && p.rules?.companyDefault !== true
    && (part === "longPlates" ? isLvlTimber(p.spec) : part === "plates" ? !isLvlTimber(p.spec) : true));
}

/**
 * A saved company timber product applied to one Walls part: timberProductFill (HUB 027, unchanged) plus the product's
 * stock, because the noggins can only share lengths and the plates can only be split with a longest length. The
 * product's own longest length wins; a product with none leaves that part's default (`part` given: 6,000 for plates
 * and noggins, 11,000 for long plates, none for studs). Its "not stocked" lengths are copied exactly as saved.
 */
export function wallPartFill(partSpec, productSpec, part = null) {
  const p = productSpec || {};
  const filled = timberProductFill(partSpec, p);
  const ownMax = p.stock?.maxMm;
  return { ...filled, stock: {
    maxMm: ownMax != null && ownMax !== "" ? ownMax : (part ? WALL_PART_DEFAULT_MAX_MM[part] ?? null : null),
    unavailableMm: Array.isArray(p.stock?.unavailableMm) ? [...p.stock.unavailableMm] : [],
  } };
}

const emptyPart = () => ({ section: { depthMm: null, widthMm: null }, grade: null, treatment: null, species: null, supplierName: null, productCode: null,
  stock: { maxMm: null, unavailableMm: [] } });

/**
 * A new Walls item's spec (normalised, so it is exactly what the server keeps). Each part takes the one active company
 * product saved for it when there is exactly one; with none, or two or more (one pick away in the fold), the built-in
 * choice: studs 90 × 45 MGP10, plates 90 × 45, noggins 90 × 35 (HUB 027 rows) and long plates 90 × 45 LVL (round 3).
 * Plates and noggins get Sam's 6,000 longest length and long plates 11,000 unless the product states its own.
 * Nothing is copied between parts; a built-in row never carries a treatment.
 */
export function wallFramingDefaults(presets = []) {
  const builtIn = {
    studs: TIMBER_PRESETS.studs.find((x) => x.id === "studs-90x45-mgp10"),
    plates: TIMBER_PRESETS.plates.find((x) => x.id === "plates-90x45"),
    longPlates: WALL_LONG_PLATE_DEFAULT,
    noggins: TIMBER_PRESETS.noggins.find((x) => x.id === "noggins-90x35"),
  };
  const components = {};
  for (const part of WALL_PARTS) {
    const products = wallPartProducts(presets, part);
    components[part] = products.length === 1 ? wallPartFill(emptyPart(), products[0].spec, part)
      : { ...applyTimberPreset(emptyPart(), builtIn[part]), stock: { maxMm: WALL_PART_DEFAULT_MAX_MM[part], unavailableMm: [] } };
  }
  return normaliseFamilySpec({ family: "timber", purpose: WALLS_PURPOSE, components });
}

/**
 * The longest pine plate a Walls item buys (HUB 028 round 3): the longest timber-grid length (1,200, then 300 mm steps)
 * within the plates' longest length, less the lengths marked not stocked. This is the length computePlates splits
 * pine from LVL at (6,000 by default; 6,000 not stocked → 5,700). Null with no longest length, one under 1,200 (the
 * grid's shortest) or no stock length left within it.
 */
export function wallPinePlateMaxMm(platesPart) {
  const s = platesPart?.stock || {};
  const max = Number(s.maxMm);
  if (s.maxMm == null || s.maxMm === "" || !(max >= TIMBER_GRID.minMm)) return null;
  const off = new Set((Array.isArray(s.unavailableMm) ? s.unavailableMm : []).map(Number));
  for (let l = TIMBER_GRID.minMm + Math.floor((max - TIMBER_GRID.minMm) / TIMBER_GRID.incrementMm) * TIMBER_GRID.incrementMm; l >= TIMBER_GRID.minMm; l -= TIMBER_GRID.incrementMm) {
    if (!off.has(l)) return l;
  }
  return null;
}

/**
 * The Long plates (LVL) stock lengths, ascending: 300 mm steps on the timber grid from the first step over the pine
 * plates' longest length (`overMm`, wallPinePlateMaxMm; 6,000 by default → 6,300) up to the part's longest length, plus
 * that longest length itself when it is off the grid (Sam: 11,000 → 6,300, 6,600 … 10,800, 11,000; the grid alone
 * can't reach 11,000 from 1,200 in 300 steps). A plate product with its own 4,800 longest starts them at 5,100, so a
 * 5,000 plate buys 5,100 of LVL, not 6,300. No longest length → 11,000. "Not stocked" lengths come out.
 */
export function longPlateStockLengths(part, overMm = WALL_PART_DEFAULT_MAX_MM.plates) {
  const s = part?.stock || {};
  const max = s.maxMm != null && s.maxMm !== "" && Number(s.maxMm) > 0 ? Number(s.maxMm) : WALL_PART_DEFAULT_MAX_MM.longPlates;
  const off = new Set((Array.isArray(s.unavailableMm) ? s.unavailableMm : []).map(Number));
  const over = Number(overMm);
  const first = over >= TIMBER_GRID.minMm
    ? TIMBER_GRID.minMm + (Math.floor((over - TIMBER_GRID.minMm) / TIMBER_GRID.incrementMm) + 1) * TIMBER_GRID.incrementMm
    : WALL_LVL_STOCK_MIN_MM;
  const out = [];
  for (let l = first; l <= max; l += TIMBER_GRID.incrementMm) out.push(l);
  if (!out.includes(max)) out.push(max);
  return out.filter((l) => !off.has(l));
}

/** Can a Walls part's longest length buy anything? None set is fine (a note); under 1,200 (the grid's shortest) isn't. */
export function wallPartLongestOk(part) {
  const m = part?.stock?.maxMm;
  return m == null || m === "" || Number(m) >= TIMBER_GRID.minMm;
}

/** Method per family/purpose (versioned keys from 06). */
export function methodFor(spec) {
  switch (spec?.family) {
    case "timber":
      if (spec.purpose === WALLS_PURPOSE) return { key: "wall_framing", version: 1 };
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

/** One Walls part, cleaned with the same field rules as a timber spec; a part's problem names it ("Plates: …"). */
function normaliseWallPart(p, label, part) {
  const x = p && typeof p === "object" ? p : {};
  const maxMm = num(x.stock?.maxMm, `${label}: longest available length`);
  // "not stocked" lengths are grid lengths; the Long plates' own longest length (11,000, off the 300 mm grid) is one
  // of their stock lengths too (longPlateStockLengths), so it can be marked not stocked as well
  const longest = part === "longPlates" ? maxMm ?? WALL_PART_DEFAULT_MAX_MM.longPlates : null;
  return {
    section: { depthMm: num(x.section?.depthMm, `${label}: section depth`), widthMm: num(x.section?.widthMm, `${label}: section width`) },
    grade: txt(x.grade, 40), treatment: txt(x.treatment, 40), species: txt(x.species, 40),
    supplierName: txt(x.supplierName), productCode: txt(x.productCode, 60),
    stock: { maxMm,
      unavailableMm: lengthsList(x.stock?.unavailableMm, `${label}: unavailable length`).filter((l) => onTimberGrid(l) || l === longest) },
  };
}

/** Canonical spec for a non-flashing family. Throws only for values that can never be valid. */
export function normaliseFamilySpec(spec) {
  const s = spec || {};
  const family = FAMILIES.includes(s.family) ? s.family : null;
  if (!family) throw new TakeoffValidationError("Unknown material family.");
  const base = { v: 1, family, supplierName: txt(s.supplierName), productCode: txt(s.productCode, 60), notes: txt(s.notes, 300),
    availability: s.availability === "supplier_confirmed" ? "supplier_confirmed" : "confirm_with_supplier", spareRate: s.spareRate == null || s.spareRate === "" ? 0 : num(s.spareRate, "Spare %", { min: -1e-9, max: 100 }) };
  if (family === "timber") {
    const sizing = { provenance: ["manual", "engineer-schedule", "manufacturer-schedule"].includes(s.sizing?.provenance) ? s.sizing.provenance : "manual", reference: txt(s.sizing?.reference, 120) };
    if (s.purpose === WALLS_PURPOSE) {
      // HUB 028 Walls: the parts carry the identities; the top-level section, grade, treatment and stock stay empty and
      // are ignored. No plies, end allowance or spares on Walls.
      const parts = s.components && typeof s.components === "object" ? s.components : {};
      return { ...base, spareRate: 0, purpose: WALLS_PURPOSE,
        section: { depthMm: null, widthMm: null }, grade: null, treatment: null, species: null, plies: 1,
        stock: { ...TIMBER_GRID, maxMm: null, unavailableMm: [] }, sizing, endAllowanceMm: 0,
        components: Object.fromEntries(WALL_PARTS.map((k) => [k, normaliseWallPart(parts[k], WALL_PART_LABELS[k], k)])) };
    }
    const maxMm = num(s.stock?.maxMm, "Longest available length");
    return { ...base,
      purpose: TIMBER_PURPOSES.includes(s.purpose) ? s.purpose : "other",
      section: { depthMm: num(s.section?.depthMm, "Section depth"), widthMm: num(s.section?.widthMm, "Section width") },
      grade: txt(s.grade, 40), treatment: txt(s.treatment, 40), species: txt(s.species, 40),
      plies: s.plies == null ? 1 : Math.max(1, Math.round(Number(s.plies)) || 1),
      // the owner's grid for ALL timber suppliers; availability may only remove grid lengths, never add off-grid ones
      stock: { ...TIMBER_GRID, maxMm, unavailableMm: lengthsList(s.stock?.unavailableMm, "Unavailable length").filter(onTimberGrid) },
      sizing,
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
      skus: Array.isArray(p.skus) ? p.skus.slice(0, 40).map((x) => ({ sku: txt(x?.sku, 40), lengthMm: num(x?.lengthMm, "SKU length"), ...(x?.id ? { id: txt(x.id, 80) } : {}) })).filter((x) => (x.sku || x.id) && x.lengthMm) : [],
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
  if (n.family === "timber" && n.purpose === WALLS_PURPOSE) {
    // every part's identity (a part's product change marks the item's draft lines for review; one key per material)
    return { family: "timber", purpose: WALLS_PURPOSE, components: Object.fromEntries(WALL_PARTS.map((k) => [k, timberPartIdentity(n.components[k])])) };
  }
  if (n.family === "timber") return { family: "timber", section: n.section, grade: n.grade?.toLowerCase() || null, treatment: n.treatment?.toLowerCase() || null, species: n.species?.toLowerCase() || null, productCode: n.productCode };
  if (n.family === "aluminium") return { family: "aluminium", profile: n.profile, alloyTemper: n.alloyTemper, finish: n.finish?.toLowerCase() || null, colour: n.colour?.toLowerCase() || null, productCode: n.productCode };
  const p = n.product;
  return { family: n.family, manufacturer: p.manufacturer, name: p.name, sku: p.sku, thicknessMm: p.thicknessMm, widthMm: p.widthMm, effectiveCoverMm: p.effectiveCoverMm,
    finish: p.finish?.toLowerCase() || null, orientation: n.orientation, endCondition: n.endCondition, coating: n.coating, productCode: n.productCode };
}

/** A timber part's procurement identity: the same fields as a timber material's (section, grade, treatment, species, code). */
function timberPartIdentity(p) {
  return { section: p.section, grade: p.grade?.toLowerCase() || null, treatment: p.treatment?.toLowerCase() || null, species: p.species?.toLowerCase() || null, productCode: p.productCode };
}

/** The procurement identity key a recorded OFFCUT is stamped with (a later finish/section change never lets it be
 *  consumed by a different product). Same key the allocator partitions by. */
export function stockIdentityKey(spec) {
  try { return identityKeyOf({ family: normaliseFamilySpec(spec).family, ...familyIdentity(spec) }); } catch { return null; }
}

/**
 * HUB 029: the card fields a familyProblems need can name (its `field`): the timber section, grade or species,
 * treatment and (a Walls part's) longest length; an aluminium profile and saw kerf; a product, its width × thickness,
 * effective cover and stock lengths; the foam coating; the random-length LM increment. A Walls part's need also names
 * its `part`.
 */
export const FAMILY_NEED_FIELDS = Object.freeze(["section", "grade", "treatment", "stock.maxMm", "profile", "kerfMm", "product", "product.size", "product.cover",
  "product.lengths", "coating", "orderIncrementM"]);

/**
 * Completeness problems that block ordering (drafts can hold them). A Walls item checks each part and names it
 * ("Plates: enter the treatment …", with `part`). Long plates are checked only when a plate uses them: the Walls
 * calculation says so with `usesLongPlates: true`; without it the part is skipped (a job with no plate over the pine
 * longest length never asks for an LVL treatment).
 */
export function familyProblems(spec, { usesLongPlates = false } = {}) {
  let n;
  try { n = normaliseFamilySpec(spec); } catch (e) { return [{ code: "material_incomplete", message: e.message }]; }
  const out = [];
  // HUB 029: every need names the card field that fixes it (`field`, one of FAMILY_NEED_FIELDS), so its fix opens there
  const need = (cond, field, message) => { if (!cond) out.push({ code: "material_incomplete", message, field }); };
  if (n.family === "timber" && n.purpose === WALLS_PURPOSE) {
    for (const k of WALL_PARTS) {
      if (k === "longPlates" && !usesLongPlates) continue;
      const p = n.components[k], label = WALL_PART_LABELS[k];
      const needPart = (cond, field, message) => { if (!cond) out.push({ code: "material_incomplete", message: `${label}: ${message}`, part: k, field }); };
      needPart(p.section.depthMm && p.section.widthMm, "section", "enter the timber section (e.g. 90 × 45).");
      needPart(p.grade || p.species, "grade", "enter the grade or species.");
      needPart(p.treatment, "treatment", "enter the treatment (or \"untreated\").");
      // a longest length under the grid's 1,200 can't buy any length: named once here, and no wall is worked out
      needPart(wallPartLongestOk(p), "stock.maxMm", `the longest length must be at least ${TIMBER_GRID.minMm.toLocaleString("en-AU")} mm.`);
    }
  } else if (n.family === "timber") {
    need(n.section.depthMm && n.section.widthMm, "section", "Enter the timber section (e.g. 90 × 45).");
    need(n.grade || n.species, "grade", "Enter the grade or species.");
    need(n.treatment, "treatment", "Enter the treatment (or \"untreated\").");
  } else if (n.family === "aluminium") {
    need(n.profile.aMm && n.profile.bMm && n.profile.tMm, "profile", "Enter the profile size (e.g. 50 × 50 × 3).");
    need(n.kerfMm != null && n.kerfConfirmed, "kerfMm", "Confirm the saw kerf for the cutting plan (an estimate can use 0, ordering can't).");
  } else if (n.family === "batten") {
    // a support layer: product/section and stock lengths — never a cladding "effective cover" (05 B1/B3)
    need(n.product.name, "product", "Choose the batten / rail product.");
    need(n.product.widthMm && n.product.thicknessMm, "product.size", "Enter the batten section (width × thickness).");
    need(n.product.lengthMm || n.product.lengthsMm.length, "product.lengths", "Enter the stock length(s).");
  } else if (n.family === "accessory") {
    // an accessory SET (starters, trims, sealant, fixings …): each item carries its own identity in the recipe
    need(n.product.name, "product", "Name this accessory set.");
  } else {
    need(n.product.name, "product", "Choose the product.");
    need(n.product.widthMm && n.product.thicknessMm, "product.size", "Product width and thickness are needed.");
    if (n.layout !== "grid" && n.family !== "aac") need(n.product.effectiveCoverMm, "product.cover", "Effective cover is needed (supplier/product value — not the nominal width).");
    if (n.family === "foam") need(n.coating, "coating", "Choose factory-coated or applicator-coated.");
    if (n.family === "timber-cladding" && n.supply === "random") need(n.orderIncrementM, "orderIncrementM", "Enter the supplier's LM ordering increment.");
    if (!(n.family === "timber-cladding" && n.supply === "random")) need(n.product.lengthMm || n.product.lengthsMm.length, "product.lengths", "Enter the stock length(s) or sheet height(s).");
  }
  return out;
}

/** One readable line for schedules, orders and the supplier PDF (never claims verification). */
export function describeFamilySpec(spec) {
  let n;
  try { n = normaliseFamilySpec(spec); } catch { return { line: "Material details incomplete", installation: null }; }
  const mm = (v) => (v == null ? "?" : String(v));
  if (n.family === "timber" && n.purpose === WALLS_PURPOSE) {
    // "Studs 90 × 45 MGP10 H2 · plates 90 × 45 H2 · long plates 90 × 45 LVL · noggins 90 × 35"
    const part = (k, i) => {
      const p = n.components[k], label = WALL_PART_LABELS[k];
      const sec = p.section.depthMm && p.section.widthMm ? `${mm(p.section.depthMm)} × ${mm(p.section.widthMm)}` : "section?";
      return [i === 0 ? label : label.toLowerCase(), sec, p.grade, p.species, p.treatment].filter(Boolean).join(" ");
    };
    return { line: WALL_PARTS.map(part).join(" · "), installation: "Size: manual selection (not structurally checked)" };
  }
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
