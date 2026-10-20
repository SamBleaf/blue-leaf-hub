// =============================================================================
// shared/takeoff/catalogue.js — material SPEC model, dropdown options and editable defaults.
//
// Options come from published Fielders pages checked 14 Oct 2026 (R04 pack, 02-FIELDERS-DROPDOWNS):
// they document finish FAMILIES and palettes, not a confirmed SA custom-folding stock matrix.
// Every combination stays "confirm with supplier" until someone records a supplier confirmation.
// 0.55 BMT is Blue Leaf's flashing default (owner instruction), not a sourced Fielders value.
// Custom entries are always allowed; legacy values are kept as entered.
// =============================================================================
import { TakeoffValidationError, isFiniteNumber } from "./units.js";

export const SPEC_SCHEMA_VERSION = 2;
export const DEFAULT_SUPPLIER_NAME_HINT = "Fielders";
/** Blue Leaf's horizontal sheet joint (Sam, 20 Oct 2026, Hub review HUB 015): a 10 mm gap with an H-flashing. */
export const BLUE_LEAF_SHEET_JOINT = Object.freeze({ gapMm: 10, detailRef: "H-flashing" });
export const COMPANY_DEFAULT_BMT = 0.55;

export const PALETTES = Object.freeze({
  classic: Object.freeze(["Surfmist", "Shale Grey", "Windspray", "Basalt", "Classic Cream", "Manor Red", "Woodland Grey", "Monument", "Jasper", "Night Sky", "Dover White", "Southerly", "Bluegum", "Paperbark", "Evening Haze", "Dune", "Gully", "Wallaby", "Pale Eucalypt", "Cottage Green", "Ironstone", "Deep Ocean"]),
  matt: Object.freeze(["Surfmist", "Dune", "Shale Grey", "Bluegum", "Basalt", "Monument"]),
  ultra: Object.freeze(["Surfmist", "Shale Grey", "Windspray", "Dune", "Wallaby", "Woodland Grey", "Monument"]),
  metallic: Object.freeze(["Galactic", "Cosmic", "Rhea", "Astro", "Aries", "Celestian"]),
});

// Published BMTs by scope (S1 cappings table) — evidence, NOT confirmed folded-flashing stock.
const S1 = "Fielders cappings table (S1) — confirm for folded flashing";
export const FINISHES = Object.freeze([
  { id: "colorbond", label: "COLORBOND", group: "Painted", painted: true, palette: "classic", bmt: [[0.5, S1]] },
  { id: "colorbond_matt", label: "COLORBOND Matt", group: "Painted", painted: true, palette: "matt", bmt: [] },
  { id: "colorbond_metallic", label: "COLORBOND Metallic", group: "Painted", painted: true, palette: "metallic", bmt: [] },
  { id: "colorbond_ultra", label: "COLORBOND Ultra", group: "Painted", painted: true, palette: "ultra", bmt: [[0.55, S1]] },
  { id: "superdura_stainless", label: "SUPERDURA Stainless", group: "Painted", painted: true, palette: null, bmt: [[0.45, S1]] },
  { id: "zincalume", label: "ZINCALUME", group: "Unpainted", painted: false, palette: null, bmt: [[0.5, S1]] },
  { id: "galvanised", label: "Galvanised", group: "Unpainted", painted: false, palette: null, bmt: [] },
  { id: "heritage_galvanised", label: "Heritage Galvanised", group: "Unpainted", painted: false, palette: null, bmt: [[0.5, S1]] },
  { id: "other", label: "Other / custom", group: "Other", painted: null, palette: null, bmt: [] },
]);
const FINISH_BY_ID = new Map(FINISHES.map((f) => [f.id, f]));

export const PERFORATION_PATTERNS = Object.freeze([
  { id: "round", label: "Round holes" },
  { id: "slot", label: "Slots" },
  { id: "square", label: "Square holes" },
  { id: "other", label: "Other (describe)" },
]);
export const AVAILABILITY = Object.freeze({ CONFIRM: "confirm_with_supplier", CONFIRMED: "supplier_confirmed" });

/** Legacy free-text finish → finish id (unknown text stays "other" with its label kept). */
export function finishIdFor(finish) {
  if (!finish) return null;
  const f = String(finish).trim().toLowerCase();
  const hit = FINISHES.find((x) => x.label.toLowerCase() === f || x.id === f);
  if (hit) return hit.id;
  if (f === "galvanized") return "galvanised";
  return "other";
}

export function finishInfo(id) { return FINISH_BY_ID.get(id) || FINISH_BY_ID.get("other"); }

/** Colour options for a finish (null = free entry). */
export function colourOptions(finishId) {
  const f = finishInfo(finishId);
  return f.palette ? PALETTES[f.palette] : null;
}

/** Thickness options: the company default first, then published values with their scope. */
export function thicknessOptions(finishId) {
  const out = [{ value: COMPANY_DEFAULT_BMT, note: "Blue Leaf default — confirm with supplier" }];
  for (const [v, note] of finishInfo(finishId).bmt) if (v !== COMPANY_DEFAULT_BMT) out.push({ value: v, note });
  return out;
}

const r2 = (n) => Math.round(Number(n) * 100) / 100;
// eslint-disable-next-line no-control-regex -- strip control characters from free text
const txt = (v, max = 80) => (v == null ? null : String(v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) || null);

/**
 * Canonical spec (schema v2). Accepts legacy v1 specs ({product, finish, bmt, colour, …}):
 *   missing construction → solid; finish text → finishId; legacy colour "N/A" on an unpainted finish → not applicable.
 * Pure + total: never throws for incomplete input (completeness is materialProblems' job); throws only for
 * values that can never be valid (negative BMT, NaN hole sizes).
 */
export function normaliseSpec(spec) {
  const s = spec || {};
  const finishId = s.finishId && FINISH_BY_ID.has(s.finishId) ? s.finishId : finishIdFor(s.finish);
  const info = finishId ? finishInfo(finishId) : null;
  const legacyNA = typeof s.colour === "string" && /^(n\/?a|natural|none|not applicable)$/i.test(s.colour.trim());
  // colour applies to painted finishes; "other" lets the user say
  let colourApplicable = info ? info.painted : null;
  // "Other / custom": painted or not must be ANSWERED (a blank colour is not "unpainted"); legacy "N/A" = unpainted
  if (colourApplicable === null) colourApplicable = s.colourApplicable === false || legacyNA ? false : s.colourApplicable === true || (s.colour && !legacyNA) ? true : null;
  let bmt = s.bmt === "" || s.bmt == null ? null : Number(s.bmt);
  if (bmt != null && (!isFiniteNumber(bmt) || bmt <= 0 || bmt >= 10)) throw new TakeoffValidationError("BMT must be a thickness in mm, e.g. 0.55.");
  const construction = s.construction === "perforated" ? "perforated" : "solid";
  let perforation = null;
  if (construction === "perforated") {
    const p = s.perforation || {};
    const num = (v, label) => {
      if (v === "" || v == null) return null;
      const n = Number(v);
      if (!isFiniteNumber(n) || n <= 0 || n > 1000) throw new TakeoffValidationError(`${label} must be a positive size in mm.`);
      return r2(n);
    };
    const extent = p.extent === "selected_legs" ? "selected_legs" : "all";
    perforation = {
      supplierProductCode: txt(p.supplierProductCode, 60),
      pattern: PERFORATION_PATTERNS.some((x) => x.id === p.pattern) ? p.pattern : null,
      holeSizeMm: num(p.holeSizeMm ?? p.holeDiameterMm, "Hole size"),
      pitchMm: num(p.pitchMm, "Pitch"),
      openAreaPct: (() => {
        if (p.openAreaPct === "" || p.openAreaPct == null) return null;
        const n = Number(p.openAreaPct);
        if (!isFiniteNumber(n) || n <= 0 || n >= 100) throw new TakeoffValidationError("Open area must be between 0 and 100 %.");
        return r2(n);
      })(),
      extent,
      legIds: extent === "selected_legs" ? [...new Set((p.legIds || []).map(String))].sort() : [],
      solidMarginMm: num(p.solidMarginMm, "Solid margin"),
      arrangement: ["straight", "staggered"].includes(p.arrangement) ? p.arrangement : null,
      description: txt(p.description, 200),
    };
  }
  return {
    v: SPEC_SCHEMA_VERSION,
    product: txt(s.product) || "Flashing",
    productCode: txt(s.productCode, 60),
    construction,
    finishId,
    finish: info && finishId !== "other" ? info.label : txt(s.finish, 60),
    bmt: bmt == null ? null : r2(bmt),
    colourApplicable,
    colour: colourApplicable && !legacyNA ? txt(s.colour, 60) : null, // "N/A" / "none" is not a colour
    colourCode: colourApplicable ? txt(s.colourCode, 40) : null,
    perforation,
    availability: s.availability === AVAILABILITY.CONFIRMED ? AVAILABILITY.CONFIRMED : AVAILABILITY.CONFIRM,
    supplierName: txt(s.supplierName),
    notes: txt(s.notes, 300),
  };
}

/** Fields that change what is fabricated — the grouping/identity part of a spec. */
export function fabricationIdentity(spec) {
  const n = normaliseSpec(spec);
  return {
    product: n.product.toLowerCase(), productCode: n.productCode, construction: n.construction, finishId: n.finishId,
    finish: n.finishId === "other" ? (n.finish || "").toLowerCase() : null, bmt: n.bmt,
    colour: n.colourApplicable ? (n.colour || "").toLowerCase() || null : "n/a", colourCode: n.colourCode,
    perforation: n.perforation ? { ...n.perforation, description: n.perforation.description?.toLowerCase() || null } : null,
  };
}

/** Problems that block ordering (drafts may hold them). Codes are keys of PROBLEM_TEXT. */
export function specProblems(spec, profile = null) {
  const n = normaliseSpec(spec);
  const out = [];
  const placeholder = !n.finish || /^other( \/ custom)?$/i.test(n.finish.trim());
  if (!n.finishId || placeholder || n.bmt == null || n.colourApplicable == null || (n.colourApplicable && !n.colour)) out.push("material_incomplete");
  if (n.construction === "perforated") {
    const p = n.perforation;
    const defined = p.supplierProductCode || (p.pattern && p.holeSizeMm && p.pitchMm && p.pitchMm > p.holeSizeMm && (p.pattern !== "other" || p.description));
    const legsOk = p.extent === "all" || (p.legIds.length && (!profile || p.legIds.every((id) => profile.segments?.some((s) => String(s.id) === id))));
    if (!defined || !legsOk) out.push("perforation_incomplete");
  }
  return out;
}

/** One line for screens/PDF: "COLORBOND Monument 0.55 BMT · perforated Ø3 @ 6 pitch (legs L2)". */
export function describeSpec(spec, profile = null) {
  const n = normaliseSpec(spec);
  const parts = [n.finish || "Finish?", n.colourApplicable === true ? n.colour || "colour?" : n.colourApplicable === false ? "natural (unpainted)" : "painted or unpainted?", n.bmt != null ? `${n.bmt} BMT` : "BMT?"];
  let perf = null;
  if (n.perforation) {
    const p = n.perforation;
    const legs = p.extent === "all" ? "all legs" : `legs ${p.legIds.map((id) => legLabel(profile, id)).join(", ")}`;
    const pat = p.pattern ? `${PERFORATION_PATTERNS.find((x) => x.id === p.pattern).label.toLowerCase()} ${p.holeSizeMm ?? "?"} mm @ ${p.pitchMm ?? "?"} mm pitch` : null;
    perf = ["PERFORATED", p.supplierProductCode && `code ${p.supplierProductCode}`, pat, p.arrangement && `${p.arrangement} rows`, p.openAreaPct != null && `${p.openAreaPct}% open`, legs, p.solidMarginMm != null && `solid margin ${p.solidMarginMm} mm`, p.description].filter(Boolean).join(" · ");
  }
  return { line: parts.join(" · "), perforation: perf, availability: n.availability === AVAILABILITY.CONFIRMED ? "Supplier confirmed" : "Confirm availability with supplier" };
}

function legLabel(profile, id) {
  const i = profile?.segments?.findIndex((s) => String(s.id) === String(id));
  return i >= 0 ? `L${i + 1}` : id;
}

/** Flashing-only default spec (0.55 BMT is a FLASHING default, not a roofing default). */
export const FLASHING_SPEC_DEFAULTS = Object.freeze({
  product: "Flashing", construction: "solid", finishId: "colorbond", finish: "COLORBOND", bmt: COMPANY_DEFAULT_BMT, colour: "", colourCode: "",
});

// kept for older imports
export const COLOUR_NAME_SUGGESTIONS = PALETTES.classic;
export const FINISH_SUGGESTIONS = Object.freeze(FINISHES.map((f) => f.label));

export const SOURCE_REVIEW_STATUSES = Object.freeze({
  USER_ENTERED: "user_entered",
  REVIEWED: "reviewed",
});

/** A preset is only "verified" when every source field is present. */
export function sourceReviewComplete(r) {
  return !!(r && r.sourceUrl && r.title && r.checkedAt && r.reviewedBy && r.status === SOURCE_REVIEW_STATUSES.REVIEWED);
}
