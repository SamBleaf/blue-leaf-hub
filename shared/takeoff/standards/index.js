// =============================================================================
// standards/index.js — HUB 031: the cited span tables the opening rules read (jamb studs per side, lintel size).
// Constants first; the tables and selectors follow in the lintel step.
// =============================================================================

/** The roof load widths the tables are laid out in (mm). The card offers exactly these; "Not sure" leaves openings at "needs roof information". */
export const ROOF_LOAD_WIDTHS_MM = Object.freeze([1500, 3000, 4500, 6000, 7500]);
/** Rafter or truss spacings the lintel tables have columns for (mm). */
export const ROOF_SPACINGS_MM = Object.freeze([600, 1200]);
/** Where a lintel size is looked up. First is the default (Sam's lintels are LVL). */
export const LINTEL_PRODUCTS = Object.freeze([["SmartLVL13", "SmartLVL 13 (LVL)"], ["MGP10", "Pine MGP10"]]);
