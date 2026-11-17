// =============================================================================
// engine/openingSelectors.js — HUB 031: what the opening rules ask the span tables (jambs per side, lintel size).
// Step 4 shipped without tables (every opening says "needs roof information"); the cited tables come in step 5.
// =============================================================================

/** @returns {{ jambs:(q:object)=>object, lintels:(q:object)=>object }} */
export function openingSelectors() {
  const needs = { outcome: "needs_roof", jambsPerSide: null, reasons: ["The roof isn't described yet, so no span table was used."], basis: "" };
  return { jambs: () => needs, lintels: () => ({ ...needs, reasons: ["needs roof information"] }) };
}
