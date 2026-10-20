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

// HUB 021: one pdf.js worker for the session. pdf.js destroys a worker it created itself with each document, so
// every reopen fetched and started the 1.1 MB worker again (and couldn't with no signal); a worker we pass in stays.
let sharedWorker = null;
const PDF_FILE_ERRORS = new Set(["InvalidPDFException", "PasswordException", "MissingPDFException", "UnexpectedResponseException", "ResponseException"]);
function workerFor(lib) {
  if (!sharedWorker || sharedWorker.destroyed) sharedWorker = new lib.PDFWorker({ name: "takeoff-plans" });
  return sharedWorker;
}

/** Open a PDF from bytes. Caller must call doc.destroy() when done (the shared worker stays). */
export async function openPdf(bytes) {
  const lib = await loadPdfJs();
  // pdf.js transfers the buffer to its worker — give it a copy so callers keep theirs.
  const open = () => lib.getDocument({ data: bytes.slice(), worker: workerFor(lib), isEvalSupported: false, disableAutoFetch: true, verbosity: 0 }).promise;
  try { return await open(); } catch (e) {
    if (PDF_FILE_ERRORS.has(e?.name)) throw e;   // the file itself — a fresh worker won't help
    try { sharedWorker?.destroy(); } catch { /* already gone */ }
    sharedWorker = null;                         // a crashed worker (e.g. out of memory): start a fresh one, once
    return await open();
  }
}

/** Page metadata in the shape shared/takeoff expects. */
export function pageMetaOf(page) {
  return { viewBox: page.view.slice(), rotate: page.rotate || 0, userUnit: page.userUnit || 1 };
}
