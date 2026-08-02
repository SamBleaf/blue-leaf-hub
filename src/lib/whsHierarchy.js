// whsHierarchy.js — client mirror of server/lib/whs/hierarchyBar.mjs (Design §6.1). Keep the pure logic
// identical to the server so the builder's live bar and the composed pack agree. scripts/tests/
// whs-hierarchy-parity.test.mjs asserts parity.

export const HOC = { 1: "Eliminate", 2: "Substitute", 3: "Isolate", 4: "Engineering", 5: "Administrative", 6: "PPE" };
export const TIER_COLOR = { green: "#1F7A3D", amber: "#C77700", red: "#B3261E", none: "#C9D1D8" };

/** @param {number[]} levels the L1..L6 levels of the SELECTED controls. */
export function hierarchyTier(levels) {
  const filled = [...new Set((levels || []).map(Number).filter((l) => l >= 1 && l <= 6))].sort((a, b) => a - b);
  // Best control = lowest level number (L1 eliminate is strongest). Colour by the best, never the worst.
  const best = filled.length ? filled[0] : null;
  const highest = filled.length ? filled[filled.length - 1] : null;
  let tier = "none", label = "No controls selected", ppeOnly = false;
  if (best != null) {
    if (best <= 4) { tier = "green"; label = `Top control L${best} · ${HOC[best]}`; }
    else if (best === 5) { tier = "amber"; label = "Top control L5 · Administrative"; }
    else { tier = "red"; ppeOnly = true; label = "PPE ONLY — JUSTIFY"; }
  }
  return { filled, best, highest, tier, ppeOnly, label };
}

// HRCW (Part 1) modules whose BEST control is admin (L5) or PPE (L6) need a written justification (G-2).
export function needsJustification(levels, isHrcw) {
  const { best } = hierarchyTier(levels);
  return !!isHrcw && best != null && best >= 5;
}
