// hierarchyBar.mjs — the single most important glance in the pack (Design §6.1). Given the hierarchy-of-
// control levels of the controls ACTUALLY selected for a module, compute how high up the hierarchy the
// protection sits, and render a 6-segment bar. Greyscale-safe: meaning is carried by fill POSITION (a
// right-side-only fill = leaning on PPE), colour is secondary. Pure — mirror of src/lib/whsHierarchy.js.

export const HOC = { 1: "Eliminate", 2: "Substitute", 3: "Isolate", 4: "Engineering", 5: "Administrative", 6: "PPE" };
export const TIER_COLOR = { green: "#1F7A3D", amber: "#C77700", red: "#B3261E", none: "#C9D1D8" };

/** @param {number[]} levels the L1..L6 levels of the SELECTED controls. */
export function hierarchyTier(levels) {
  const filled = [...new Set((levels || []).map(Number).filter((l) => l >= 1 && l <= 6))].sort((a, b) => a - b);
  // The BEST control in place = the lowest level number (L1 eliminate is the strongest). A module carrying
  // an L1–L4 control is protected by engineering-or-higher even if it also lists PPE. Colour by the best,
  // never the worst — the whole point is "does this module have a real high-order control, or only PPE?".
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

// HRCW (Part 1) modules whose BEST control is admin (L5) or PPE (L6) — i.e. no engineering-or-higher
// control selected — need a written justification (gate G-2). Task modules can legitimately be PPE-led.
export function needsJustification(levels, isHrcw) {
  const { best } = hierarchyTier(levels);
  return !!isHrcw && best != null && best >= 5;
}

/** Render the bar as inline-styled HTML for the composed pack. */
export function renderBarHtml(levels) {
  const { filled, tier, label } = hierarchyTier(levels);
  const on = TIER_COLOR[tier];
  const segs = [1, 2, 3, 4, 5, 6].map((l) =>
    `<span style="display:inline-block;width:16px;height:8px;margin-right:2px;border-radius:1px;background:${filled.includes(l) ? on : "#E3E7EB"}"></span>`
  ).join("");
  return `<span style="white-space:nowrap">${segs}</span><span style="font-size:10px;font-weight:700;color:${on};margin-left:6px;letter-spacing:.03em">${label}</span>`;
}
