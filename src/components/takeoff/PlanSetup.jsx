// =============================================================================
// PlanSetup — choose the plan and its PRIMARY floor-plan page (a job preference — it is never
// an automatic scale for other pages). Small thumbnails are rendered one at a time for the
// first pages; larger sets use a page-number picker. Thumbnail canvases are released on exit.
// =============================================================================
import { useEffect, useRef, useState } from "react";
import { latestPageCalibrations } from "../../../shared/takeoff/index.js";
import { AsyncState, Banner, Btn, FocusedWindow } from "./ui.jsx";
import { docLabel } from "./format.js";

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
  return <canvas ref={ref} className="mx-auto block max-h-[150px] max-w-full bg-white shadow-sm" aria-hidden="true" />;
}

export default function PlanSetup({ plans, planState, selectedDocId, onSelectDoc, primary, calibrations, onChoosePage, onClose, onExternalView }) {
  const queue = useRef(Promise.resolve());
  const [page, setPage] = useState(primary?.documentId === selectedDocId ? primary.pageIndex ?? 0 : 0);
  const n = planState.numPages || 0;
  const doc = plans.find((p) => p.id === selectedDocId);
  const statusOf = (pi) => {
    const cals = latestPageCalibrations(calibrations, selectedDocId, pi);
    if (!cals.length) return "Not scaled";
    return cals.every((c) => c.status === "ready") ? "Ready" : "Needs review";
  };
  return (
    <FocusedWindow title="Plan setup" subtitle="Choose the plan and its main floor-plan page" onClose={onClose} closeLabel="Back">
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
            Downloading plan{planState.progress?.total ? ` — ${Math.round((planState.progress.loaded / planState.progress.total) * 100)}%` : planState.progress?.loaded ? ` — ${(planState.progress.loaded / 1048576).toFixed(1)} MB` : "…"}
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
                    <button type="button" onClick={() => setPage(i)} aria-pressed={page === i}
                      className={`w-full rounded-card border-2 bg-page p-2 text-left ${page === i ? "border-primary" : "border-transparent"}`}>
                      <Thumb doc={planState.doc} pageIndex={i} queue={queue} />
                      <span className="mt-1 block text-xs font-medium text-ink">Page {i + 1}{primary?.documentId === selectedDocId && primary.pageIndex === i ? " · primary" : ""}</span>
                      <span className="block text-[11px] text-muted">{statusOf(i)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label htmlFor="page-no" className="mb-1 block text-xs font-medium text-muted">Page (1–{n})</label>
                  <input id="page-no" inputMode="numeric" value={page + 1} onChange={(e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 1 && v <= n) setPage(v - 1); }}
                    className="min-h-[44px] w-full rounded-lg border border-hairline px-3 text-base" />
                </div>
                <span className="pb-3 text-xs text-muted">{statusOf(page)}</span>
              </div>
            )}
          </>
        )}
      </div>
      <div className="border-t border-hairline bg-white p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <Btn kind="primary" className="w-full" disabled={planState.status !== "ready"} onClick={() => onChoosePage(selectedDocId, page)}>Use page {page + 1} as the main plan page</Btn>
      </div>
    </FocusedWindow>
  );
}
