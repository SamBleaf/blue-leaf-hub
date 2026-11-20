// =============================================================================
// planVectors.js — the plan's own linework for "Snap to plan" and "Check against plan".
// Segments are read once per page from the pdf.js operator list (in PDF user space, the space measurements are stored
// in) and kept in memory only — never saved. Walls are re-detected when the page scale changes. Everything heavy is
// pure maths in shared/takeoff/vectorSnap.js; this file only talks to pdf.js and React.
// =============================================================================
import { useEffect, useState } from "react";
import { extractSegments, mergeCollinear, buildSnapIndex } from "../../../shared/takeoff/vectorSnap.js";
import { pointToMm } from "../../../shared/takeoff/calibration.js";
import { loadPdfJs } from "./pdfDocument.js";

const linesCache = new WeakMap(); // pdf doc → Map(pageIndex → Promise<lines>)
const idle = () => new Promise((r) => (typeof requestIdleCallback === "function" ? requestIdleCallback(() => r(), { timeout: 800 }) : setTimeout(r, 0)));

/** The page's merged straight lines (scale-free), extracted once. pdf.js parses the page off the main thread. */
export function pageLines(doc, pageIndex) {
  let byPage = linesCache.get(doc);
  if (!byPage) linesCache.set(doc, (byPage = new Map()));
  if (!byPage.has(pageIndex)) {
    byPage.set(pageIndex, (async () => {
      const lib = await loadPdfJs();
      const page = await doc.getPage(pageIndex + 1);
      const ol = await page.getOperatorList();
      await idle(); // the two passes below run on the main thread (~30–100 ms on an A1 sheet): wait for a quiet moment
      return mergeCollinear(extractSegments(ol, lib.OPS), { minLen: 4 });
    })().catch((e) => { byPage.delete(pageIndex); throw e; }));
  }
  return byPage.get(pageIndex);
}

/** mm per PDF unit of a page calibration (same on both axes for a uniform scale). */
export function mmPerUnitOf(cal) {
  if (!cal) return null;
  const o = { x: 0, y: 0 }, a = pointToMm(cal, o, { x: 1, y: 0 }), b = pointToMm(cal, o, { x: 0, y: 1 });
  const v = (Math.hypot(a.x, a.y) + Math.hypot(b.x, b.y)) / 2;
  return v > 0 ? v : null;
}

/** The snap index for a page at its scale: { ix, state: "off" | "loading" | "ready" | "none" | "error" }. */
export function usePlanSnap({ doc, pageIndex, cal, enabled }) {
  const mm = mmPerUnitOf(cal);
  const mmKey = mm ? Math.round(mm * 1000) / 1000 : null;
  const [res, setRes] = useState({ ix: null, state: "off", key: null });
  const key = enabled && doc && mmKey ? `${pageIndex}|${mmKey}` : null;
  useEffect(() => {
    if (!key) return undefined;
    let stop = false;
    setRes((r) => (r.key === key ? r : { ix: null, state: "loading", key }));
    pageLines(doc, pageIndex).then((lines) => {
      if (stop) return;
      const ix = buildSnapIndex(lines, mmKey);
      setRes({ ix, state: ix.walls.length ? "ready" : "none", key });
    }).catch(() => { if (!stop) setRes({ ix: null, state: "error", key }); });
    return () => { stop = true; };
  }, [key, doc, pageIndex, mmKey]);
  return key ? res : { ix: null, state: "off", key: null };
}
