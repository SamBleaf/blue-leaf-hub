// =============================================================================
// PlanSetup — choose the plan and its PRIMARY floor-plan page (a job preference — it is never
// an automatic scale for other pages). Small thumbnails are rendered one at a time for the
// first pages; larger sets use a page-number picker. Thumbnail canvases are released on exit.
// purpose "measure" (HUB 023, the Page chip in Measure): the same picker for the page to measure
// on — tapping a page goes straight back to measuring, and the main plan page is left alone.
// =============================================================================
import { useEffect, useRef, useState } from "react";
import { latestPageCalibrations } from "../../../shared/takeoff/index.js";
import { AsyncState, Banner, Btn, FocusedWindow } from "./ui.jsx";
import { docLabel } from "./format.js";
import { useKeyboardInset } from "./measure/useKeyboardInset.js";

const THUMB_LIMIT = 24;
const THUMB_PX = 150;

function Thumb({ doc, pageIndex, queue }) {
  const ref = useRef(null);
  useEffect(() => {
    let cancelled = false, task = null, page = null;
    const canvas = ref.current;
    const run = queue.current.then(async () => {
      if (cancelled || !canvas) return;
      page = await doc.getPage(pageIndex + 1);
      const v1 = page.getViewport({ scale: 1 });
      const s = THUMB_PX / Math.max(v1.width, v1.height);
      const vp = page.getViewport({ scale: s });
      const c = canvas;
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      task = page.render({ canvasContext: c.getContext("2d"), viewport: vp });
      await task.promise.catch(() => {});
      page.cleanup();
    });
    queue.current = run.catch(() => {});
    return () => { cancelled = true; try { task?.cancel(); } catch { /* done */ } if (canvas) { canvas.width = 0; canvas.height = 0; } };
  }, [doc, pageIndex, queue]);
  // a fixed box: a tile never changes size as its page draws, so a tap never lands on a page that has just moved
  return (
    <div className="flex h-[150px] items-center justify-center" data-thumb-box="">
      <canvas ref={ref} className="block max-h-full max-w-full bg-white shadow-sm" aria-hidden="true" />
    </div>
  );
}

export default function PlanSetup({ plans, planState, selectedDocId, onSelectDoc, primary, calibrations, onChoosePage, onClose, onExternalView, purpose = "main", current = null }) {
  const queue = useRef(Promise.resolve());
  const measuring = purpose === "measure";
  const [page, setPage] = useState(measuring && current?.documentId === selectedDocId ? current.pageIndex ?? 0 : primary?.documentId === selectedDocId ? primary.pageIndex ?? 0 : 0);
  const n = planState.numPages || 0;
  const doc = plans.find((p) => p.id === selectedDocId);
  // the page-number box (big plan sets): its own text, so it can be cleared and retyped; Enter chooses the page
  const [pageText, setPageText] = useState(null);
  const kbInset = useKeyboardInset();
  const choose = () => { if (planState.status === "ready") onChoosePage(selectedDocId, page); };
  const statusOf = (pi) => {
    const cals = latestPageCalibrations(calibrations, selectedDocId, pi);
    if (!cals.length) return "Not scaled";
    return cals.every((c) => c.status === "ready") ? "Ready" : "Needs review";
  };
  return (
    <FocusedWindow title={measuring ? "Choose a page" : "Plan setup"} subtitle={measuring ? "Measure on another page. The main plan page stays the same." : "Choose the plan and its main floor-plan page"} onClose={onClose} closeLabel="Back"
      footer={kbInset > 0 ? <div aria-hidden="true" data-keyboard-spacer="" style={{ height: kbInset, flexShrink: 0 }} /> : null}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div>
          <label htmlFor="plan-doc" className="mb-1 block text-xs font-medium text-muted">Plan</label>
          <select id="plan-doc" value={selectedDocId || ""} onChange={(e) => onSelectDoc(e.target.value)} className="min-h-[44px] w-full rounded-lg border border-hairline text-base">
            {plans.map((p) => <option key={p.id} value={p.id}>{docLabel(p)}{p.status !== "current" ? " (replaced)" : ""}</option>)}
          </select>
          {doc && doc.status !== "current" && <div className="mt-2"><Banner tone="warn">This plan has been replaced. You can view it, but scale and measure on the current revision.</Banner></div>}
        </div>
        {planState.status === "loading" && (
          <p className="text-sm text-muted" role="status">
            {!planState.progress ? "Opening plan…" /* HUB 021: from this device — no download */
              : `Downloading plan${planState.progress.total ? ` — ${Math.round((planState.progress.loaded / planState.progress.total) * 100)}%` : planState.progress.loaded ? ` — ${(planState.progress.loaded / 1048576).toFixed(1)} MB` : "…"}`}
          </p>
        )}
        {planState.status === "too_large" && (
          <Banner tone="warn" action={onExternalView && <Btn onClick={() => onExternalView(selectedDocId)}>Open in device viewer</Btn>}>
            {planState.error} You can still view it in your device&apos;s PDF viewer.
          </Banner>
        )}
        {(planState.status === "error" || planState.status === "cancelled") && <AsyncState error={planState.error} onRetry={planState.retry} />}
        {planState.status === "ready" && (
          <>
            {n <= THUMB_LIMIT ? (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: n }, (_, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => (measuring ? onChoosePage(selectedDocId, i) : setPage(i))} aria-pressed={page === i} data-page-thumb={i}
                      aria-label={measuring ? `Measure on page ${i + 1}` : undefined}
                      className={`w-full rounded-card border-2 bg-page p-2 text-left ${page === i ? "border-primary" : "border-transparent"}`}>
                      <Thumb doc={planState.doc} pageIndex={i} queue={queue} />
                      <span className="mt-1 block text-xs font-medium text-ink">Page {i + 1}{primary?.documentId === selectedDocId && primary.pageIndex === i ? (measuring ? " · main plan page" : " · primary") : ""}
                        {measuring && current?.documentId === selectedDocId && current.pageIndex === i ? " · measuring now" : ""}</span>
                      <span className="block text-[11px] text-muted">{statusOf(i)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); e.currentTarget.querySelector("input")?.blur(); choose(); }}>
                <div className="flex-1">
                  <label htmlFor="page-no" className="mb-1 block text-xs font-medium text-muted">Page (1–{n})</label>
                  <input id="page-no" inputMode="numeric" enterKeyHint="go" value={pageText ?? String(page + 1)} onFocus={(e) => e.target.select()}
                    onChange={(e) => { const t = e.target.value.replace(/[^0-9]/g, ""); setPageText(t); const v = Number(t); if (t && Number.isInteger(v) && v >= 1 && v <= n) setPage(v - 1); }}
                    onBlur={() => setPageText(null)}
                    className="min-h-[44px] w-full rounded-lg border border-hairline px-3 text-base" />
                </div>
                <span className="pb-3 text-xs text-muted">{statusOf(page)}</span>
              </form>
            )}
          </>
        )}
      </div>
      {/* measuring: a thumbnail is the choice itself (one tap back to Measure); only the page-number picker needs a button */}
      {!(measuring && planState.status === "ready" && n <= THUMB_LIMIT) && (
        <div className="border-t border-hairline bg-white p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          {measuring
            ? <Btn kind="primary" className="w-full" disabled={planState.status !== "ready"} onClick={choose}>Measure on page {page + 1}</Btn>
            : <Btn kind="primary" className="w-full" disabled={planState.status !== "ready"} onClick={choose}>Use page {page + 1} as the main plan page</Btn>}
        </div>
      )}
    </FocusedWindow>
  );
}
