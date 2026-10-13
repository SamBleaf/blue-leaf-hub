// =============================================================================
// pdfDocument.js — lazy pdf.js loader + document/page helpers for the takeoff viewer.
// pdfjs-dist is pinned in package.json; the legacy build supports older iOS Safari and its
// worker is bundled locally through Vite's ?url import (no CDN). Loaded only when a takeoff opens.
// =============================================================================

export const MAX_BACKING_PIXELS = 4096 * 4096; // per canvas
export const SETTLE_MS = 180;
export const ZOOM_MIN_FACTOR = 0.5;  // × fit
export const ZOOM_MAX_FACTOR = 16;   // × fit

let pdfjsPromise = null;
/** Lazy-load pdf.js + its local worker (cached for the session). */
export function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
    ]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    }).catch((e) => { pdfjsPromise = null; throw e; });
  }
  return pdfjsPromise;
}

/** Open a PDF from bytes. Caller must call doc.destroy() when done. */
export async function openPdf(bytes) {
  const lib = await loadPdfJs();
  // pdf.js transfers the buffer to its worker — give it a copy so callers keep theirs.
  const task = lib.getDocument({ data: bytes.slice(), isEvalSupported: false, disableAutoFetch: true, verbosity: 0 });
  return await task.promise;
}

/** Page metadata in the shape shared/takeoff expects. */
export function pageMetaOf(page) {
  return { viewBox: page.view.slice(), rotate: page.rotate || 0, userUnit: page.userUnit || 1 };
}
