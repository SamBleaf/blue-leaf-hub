// =============================================================================
// shared/takeoff/catalogue.js — editable defaults and SUGGESTIONS for new materials.
//
// Nothing here is a verified supplier catalogue. Colour names are common COLORBOND names for
// convenience only; availability, codes and product compatibility vary by product and region
// and must be checked with the supplier. Custom entries are always allowed. A material created
// from these defaults is "user_entered" until someone records a sourced review.
// =============================================================================

export const DEFAULT_SUPPLIER_NAME_HINT = "Fielders";

/** Flashing-only default spec (0.55 BMT is a FLASHING default, not a roofing default). */
export const FLASHING_SPEC_DEFAULTS = Object.freeze({
  product: "Flashing",
  finish: "COLORBOND",
  bmt: 0.55,
  colour: "",
  colourCode: "",
});

export const COLOUR_NAME_SUGGESTIONS = Object.freeze([
  "Basalt", "Classic Cream", "Cottage Green", "Deep Ocean", "Dover White", "Dune", "Evening Haze", "Gully",
  "Ironstone", "Jasper", "Mangrove", "Manor Red", "Monument", "Night Sky", "Pale Eucalypt", "Paperbark",
  "Shale Grey", "Southerly", "Surfmist", "Wallaby", "Windspray", "Woodland Grey",
]);

export const FINISH_SUGGESTIONS = Object.freeze(["COLORBOND", "ZINCALUME", "Galvanised", "Other"]);

export const SOURCE_REVIEW_STATUSES = Object.freeze({
  USER_ENTERED: "user_entered",
  REVIEWED: "reviewed",
});

/** A preset is only "verified" when every source field is present. */
export function sourceReviewComplete(r) {
  return !!(r && r.sourceUrl && r.title && r.checkedAt && r.reviewedBy && r.status === SOURCE_REVIEW_STATUSES.REVIEWED);
}
