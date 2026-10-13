// =============================================================================
// MeasureScreen — full-screen plan with Run / Count / Select / Pan (R03 §3, §5).
//   Run    tap start, tap finish = one straight run. "Connected" makes the finish the next
//          start, so each corner ends a run (each run gets its own allowance). Separately
//          drawn equal runs are never merged.
//   Count  enter the FINISHED length first, then tap each occurrence. Changing the length
//          starts a new count — earlier marks keep their length.
//   Select tap a run/mark to adjust (drag handle + magnifier) or remove it.
//   Pan    every drag navigates; nothing is placed.
// Two fingers always navigate. Runs must stay inside the scaled region. Measuring is blocked
// on a replaced plan (existing measurements stay visible for review).
// =============================================================================
import { useMemo, useRef, useState } from "react";
import { measuredRunResult, segmentLengthMm, pointsWithinCalibration, latestPageCalibrations as pageCalibrations, CALIBRATION_STATUS } from "../../../shared/takeoff/index.js";
import { newId } from "../../lib/takeoffApi.js";
import PdfViewport from "./PdfViewport.jsx";
import { PointHandlesLayer } from "./PointHandles.jsx";
import { partial } from "./changeset.js";
import { Banner, Btn, FocusedWindow, NumberField, SaveChip, Sheet } from "./ui.jsx";
import { fmtMm, fmtRaw } from "./format.js";

const MODES = [
  { k: "run", label: "Run" }, { k: "count", label: "Count" }, { k: "select", label: "Select" }, { k: "pan", label: "Pan" },
];

function distToSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export default function MeasureScreen({ ws, doc, document: planDoc, pageIndex, displayRotation, materialId, onChangeMaterial, onScale, onClose }) {
  const vpRef = useRef(null);
  const [mode, setMode] = useState("run");
  const [connected, setConnected] = useState(true);
  const [start, setStart] = useState(null);
  const [countLen, setCountLen] = useState(null);
  const [activeCount, setActiveCount] = useState(null); // measurement id
  const [selected, setSelected] = useState(null);
  const [handleSel, setHandleSel] = useState(null);
  const [msg, setMsg] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [hist, setHist] = useState({ past: [], future: [] }); // ops: { undo: partial, redo: partial }

  const view = ws.view;
  const material = view.materials.find((m) => m.id === materialId) || null;
  const stale = planDoc && planDoc.status !== "current";
  const cals = useMemo(() => pageCalibrations(view.calibrations, planDoc?.id, pageIndex), [view.calibrations, planDoc?.id, pageIndex]);
  const [regionKey, setRegionKey] = useState(null);
  const cal = cals.find((c) => (c.regionLabel || "") === (regionKey ?? (cals.length === 1 ? cals[0].regionLabel || "" : ""))) || (cals.length === 1 ? cals[0] : null);
  const needsRegionChoice = cals.length > 1 && regionKey == null;

  const pageMeasurements = view.measurements.filter((m) => m.documentId === planDoc?.id && m.pageIndex === pageIndex && !m.archived);
  const contribByMeasurement = useMemo(() => new Map(view.contributions.map((c) => [c.measurementId, c])), [view.contributions]);
  const computedBy = useMemo(() => new Map((ws.computed?.contributions || []).map((c) => [c.measurementId, c])), [ws.computed]);

  // Session undo/redo: each op stores the partial change-set to re-apply and to revert.
  // Kept in a ref so no side effects run inside React state updaters.
  const histRef = useRef({ past: [], future: [] });
  const sync = () => setHist({ ...histRef.current });
  function record(op) {
    ws.edit(op.redo);
    histRef.current = { past: [...histRef.current.past, op].slice(-100), future: [] };
    sync();
  }
  function undo() {
    const h = histRef.current;
    if (!h.past.length) return;
    const op = h.past[h.past.length - 1];
    ws.edit(op.undo);
    if (op.restoreStart !== undefined) setStart(op.restoreStart);
    histRef.current = { past: h.past.slice(0, -1), future: [op, ...h.future] };
    sync();
  }
  function redo() {
    const h = histRef.current;
    if (!h.future.length) return;
    const [op, ...rest] = h.future;
    ws.edit(op.redo);
    histRef.current = { past: [...h.past, op], future: rest };
    sync();
  }

  const canMeasure = !stale && !!material && ws.capabilities?.edit;

  function onTap(p) {
    setMsg(null);
    if (mode === "select") {
      const sp = vpRef.current.toScreen(p);
      let best = null, bestD = 18;
      for (const m of pageMeasurements) {
        const pts = (m.points || []).map((q) => vpRef.current.toScreen(q));
        const d = m.kind === "run" && pts.length === 2 ? distToSeg(sp, pts[0], pts[1]) : Math.min(...pts.map((q) => Math.hypot(q.x - sp.x, q.y - sp.y)));
        if (d < bestD) { bestD = d; best = m.id; }
      }
      setSelected(best);
      return;
    }
    if (!canMeasure) { setMsg(stale ? "This plan has been replaced — measure on the current revision." : !material ? "Choose a material first." : "You can't change this takeoff."); return; }
    if (mode === "run") {
      if (material.methodKey === "finished_piece_count") { setMsg("This material takes finished lengths only — use Count, or Add lengths on the takeoff page."); return; }
      if (!cal) { setMsg("Scale this page before measuring runs."); return; }
      if (needsRegionChoice) { setMsg("Choose which scaled region you are measuring in."); return; }
      if (!pointsWithinCalibration(cal, [p])) { setMsg("That point is outside the scaled region."); return; }
      if (!start) { setStart(p); return; }
      const s0 = vpRef.current.toScreen(start), s1 = vpRef.current.toScreen(p);
      if (Math.hypot(s1.x - s0.x, s1.y - s0.y) < 20) { setMsg("Tap the finish further from the start — zoom in for short runs."); return; }
      const mid = newId(), cid = newId();
      const meas = { id: mid, kind: "run", documentId: planDoc.id, pageIndex, calibrationId: cal.id, points: [start, p] };
      const con = { id: cid, measurementId: mid, jobMaterialId: material.id };
      const raw = segmentLengthMm(cal, start, p);
      try { setLastResult(measuredRunResult(raw, material.rules)); } catch { setLastResult(null); }
      record({ redo: partial({ measurements: [meas], contributions: [con] }), undo: partial({ archive: { measurements: [mid], contributions: [cid] } }), restoreStart: start });
      setStart(connected ? p : null);
      return;
    }
    if (mode === "count") {
      if (!countLen) { setMsg("Enter the finished length first."); return; }
      const existing = activeCount && view.measurements.find((m) => m.id === activeCount && !m.archived);
      if (existing && existing.finishedLengthMm === countLen) {
        const next = { ...existing, points: [...existing.points, p] };
        record({ redo: partial({ measurements: [next] }), undo: partial({ measurements: [existing] }) });
      } else {
        const mid = newId(), cid = newId();
        const meas = { id: mid, kind: "count", documentId: planDoc.id, pageIndex, calibrationId: null, points: [p], finishedLengthMm: countLen };
        record({ redo: partial({ measurements: [meas], contributions: [{ id: cid, measurementId: mid, jobMaterialId: material.id }] }), undo: partial({ archive: { measurements: [mid], contributions: [cid] } }) });
        setActiveCount(mid);
      }
    }
  }

  function moveEndpoint(handleId, p, commit) {
    const [mid, idx] = handleId.split(":");
    const m = view.measurements.find((x) => x.id === mid);
    if (!m) return;
    if (m.kind === "run") {
      const c = view.calibrations.find((x) => x.id === m.calibrationId);
      if (c && !pointsWithinCalibration(c, [p])) { setMsg("That point is outside the scaled region."); return; }
    }
    if (!commit) return;
    const next = { ...m, points: m.points.map((q, i) => (i === Number(idx) ? p : q)) };
    record({ redo: partial({ measurements: [next] }), undo: partial({ measurements: [m] }) });
  }

  function removeSelected() {
    const m = view.measurements.find((x) => x.id === selected);
    if (!m) return;
    const c = contribByMeasurement.get(m.id);
    record({ redo: partial({ archive: { measurements: [m.id], contributions: c ? [c.id] : [] } }), undo: partial({ measurements: [m], contributions: c ? [c] : [] }) });
    setSelected(null);
  }

  const sel = view.measurements.find((m) => m.id === selected);
  const selComputed = sel ? computedBy.get(sel.id) : null;
  const handlePts = sel ? (sel.points || []).map((p, i) => ({ id: `${sel.id}:${i}`, p, label: `${sel.kind} point ${i + 1}` })) : [];
  const runCount = pageMeasurements.filter((m) => m.kind === "run").length;

  return (
    <FocusedWindow
      title={material ? material.name : "Measure"}
      subtitle={`${planDoc?.title || "Plan"} · page ${pageIndex + 1}${cal ? ` · ${cal.status === CALIBRATION_STATUS.READY ? "scaled" : "scale needs review"}` : " · not scaled"}`}
      onClose={onClose} closeLabel="Done"
      actions={<>
        <SaveChip status={ws.status} />
        <Btn kind="ghost" onClick={undo} disabled={!hist.past.length} aria-label="Undo">↶</Btn>
        <Btn kind="ghost" onClick={redo} disabled={!hist.future.length} aria-label="Redo">↷</Btn>
      </>}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1 border-b border-hairline bg-white px-2 py-1">
          <div role="radiogroup" aria-label="Tool" className="flex rounded-lg border border-hairline p-0.5">
            {MODES.map((m) => (
              <button key={m.k} type="button" role="radio" aria-checked={mode === m.k} onClick={() => { setMode(m.k); setStart(null); setMsg(null); }}
                className={`min-h-[40px] min-w-[56px] rounded-md px-2 text-sm font-medium ${mode === m.k ? "bg-primary text-white" : "text-ink"}`}>{m.label}</button>
            ))}
          </div>
          {mode === "run" && (
            <label className="ml-1 flex min-h-[40px] items-center gap-1.5 text-xs text-ink">
              <input type="checkbox" checked={connected} onChange={(e) => { setConnected(e.target.checked); setStart(null); }} className="h-5 w-5 rounded border-hairline text-primary" />
              Connected
            </label>
          )}
          <button type="button" onClick={onChangeMaterial} className="ml-auto min-h-[40px] max-w-[45%] truncate rounded-lg border border-hairline px-2 text-xs text-ink">{material ? `Material: ${material.name}` : "Choose material"}</button>
          <Btn kind="ghost" onClick={() => vpRef.current?.fit()} aria-label="Fit page">Fit</Btn>
        </div>
        {stale && <div className="px-2 pt-2"><Banner tone="warn">This plan has been replaced. Existing measurements stay here for review — measure on the current revision.</Banner></div>}
        {!cal && !stale && mode === "run" && <div className="px-2 pt-2"><Banner tone="info" action={onScale && <Btn kind="primary" onClick={onScale}>Scale page</Btn>}>This page has no scale yet. You can still count pieces.</Banner></div>}
        {cal && cal.status !== CALIBRATION_STATUS.READY && <div className="px-2 pt-2"><Banner tone="warn" action={onScale && <Btn onClick={onScale}>Re-scale</Btn>}>The scale on this page {cal.status === "needs_review" ? "failed its check" : "hasn't been checked"} — runs are shown but can&apos;t be ordered until it is re-scaled.</Banner></div>}
        {cals.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 px-2 pt-2 text-xs">
            <span className="text-muted">Scaled region:</span>
            {cals.map((c) => (
              <button key={c.id} type="button" onClick={() => setRegionKey(c.regionLabel || "")} aria-pressed={(c.regionLabel || "") === regionKey}
                className={`min-h-[36px] rounded-full border px-3 ${(c.regionLabel || "") === regionKey ? "border-primary bg-primary/10 text-primary" : "border-hairline"}`}>{c.regionLabel || "Whole page"}</button>
            ))}
          </div>
        )}
        <PdfViewport
          ref={vpRef} doc={doc} pageIndex={pageIndex} displayRotation={displayRotation}
          mode={mode === "pan" ? "pan" : "tap"} onTap={mode === "pan" ? undefined : onTap} className="min-h-0 flex-1"
          ariaLabel="Plan — tap to measure"
          overlay={({ toScreen }) => (
            <>
              {cal?.region && (() => { const a = toScreen({ x: cal.region.x0, y: cal.region.y0 }), b = toScreen({ x: cal.region.x1, y: cal.region.y1 }); return <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} fill="none" stroke="#006c9b" strokeDasharray="4 4" />; })()}
              {pageMeasurements.map((m) => {
                const pts = (m.points || []).map(toScreen);
                const isSel = m.id === selected;
                const c = computedBy.get(m.id);
                const problem = c?.problems?.length;
                const color = isSel ? "#f59e0b" : problem ? "#dc2626" : m.kind === "run" ? "#006c9b" : "#16a34a";
                if (m.kind === "run" && pts.length === 2) {
                  const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
                  const label = c?.pieces?.[0] ? fmtMm(c.result?.finishedLengthMm) : "";
                  return (
                    <g key={m.id} data-measurement-id={m.id} data-kind="run">
                      <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke={color} strokeWidth={isSel ? 4 : 3} strokeLinecap="round" />
                      {label && <text x={mx} y={my - 6} textAnchor="middle" fontSize="12" fontWeight="700" fill={color} stroke="#fff" strokeWidth="3" paintOrder="stroke">{label}</text>}
                    </g>
                  );
                }
                return (
                  <g key={m.id} data-measurement-id={m.id} data-kind={m.kind}>
                    {pts.map((q, i) => (
                      <g key={i}>
                        <circle cx={q.x} cy={q.y} r={9} fill={color} fillOpacity={0.9} />
                        <text x={q.x} y={q.y + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{i + 1}</text>
                      </g>
                    ))}
                  </g>
                );
              })}
              {start && (() => { const s = toScreen(start); return <circle cx={s.x} cy={s.y} r={7} fill="#fff" stroke="#006c9b" strokeWidth={3} />; })()}
              {sel && mode === "select" && (
                <PointHandlesLayer points={handlePts} toScreen={toScreen} viewportRef={vpRef} selectedId={handleSel} onSelect={setHandleSel}
                  onMove={(id, p) => moveEndpoint(id, p, false)} onCommit={(id, p) => moveEndpoint(id, p, true)} />
              )}
            </>
          )}
        />
      </div>
      <Sheet title={mode === "count" ? "Count pieces" : mode === "select" ? (sel ? "Selected" : "Select") : "Measure runs"} initialFocus={false}>
        {msg && <div className="mb-2"><Banner tone="warn">{msg}</Banner></div>}
        {mode === "run" && (
          <div className="space-y-1 text-sm">
            {lastResult ? (
              <p className="text-ink">Measured <b>{fmtRaw(lastResult.rawLengthMm)}</b> + allowance {fmtMm(lastResult.allowanceMm)} → order <b>{fmtMm(lastResult.finishedLengthMm)} mm</b>
                {lastResult.ceilingExceeded ? <span className="ml-1 font-semibold text-red-700">over order ceiling — split it</span> : lastResult.handlingFlag ? <span className="ml-1 font-semibold text-amber-700">long piece</span> : null}</p>
            ) : <p className="text-muted">{start ? "Tap the finish of this run." : "Tap the start of a straight run."} Hold for a magnifier.</p>}
            <p className="text-[11px] text-muted">{runCount} run(s) on this page. {connected ? "Connected: each corner ends a run and starts the next." : "Each pair of taps is one run."}</p>
            {start && <Btn onClick={() => setStart(null)}>End this line</Btn>}
          </div>
        )}
        {mode === "count" && (
          <div className="space-y-2">
            <NumberField label="Finished length (no allowance added)" value={countLen} onCommit={(n) => { setCountLen(n); setActiveCount(null); }} help="Changing the length starts a new count — earlier marks keep their length." />
            {activeCount && (() => { const m = view.measurements.find((x) => x.id === activeCount); return m ? <p className="text-sm">Counted <b>{m.points.length}</b> × {fmtMm(m.finishedLengthMm)} mm</p> : null; })()}
            {activeCount && <Btn onClick={() => setActiveCount(null)}>Finish count</Btn>}
          </div>
        )}
        {mode === "select" && (sel ? (
          <div className="space-y-2 text-sm">
            <p className="font-medium text-ink">{sel.kind === "run" ? "Run" : `Count — ${sel.points?.length || 0} marks`}</p>
            {selComputed?.explanation && <p className="text-muted">{selComputed.explanation}</p>}
            {selComputed?.problems?.length > 0 && <Banner tone="warn">{selComputed.problems.join(", ").replace(/_/g, " ")}</Banner>}
            <p className="text-[11px] text-muted">Drag a handle to adjust; the magnifier shows the exact spot.</p>
            <Btn kind="danger" onClick={removeSelected} disabled={!ws.capabilities?.edit}>Remove</Btn>
          </div>
        ) : <p className="text-sm text-muted">Tap a run or count mark to select it.</p>)}
        {mode === "pan" && <p className="text-sm text-muted">Drag to move around; pinch or use +/− to zoom. Nothing is placed in Pan.</p>}
        {ws.saveError && <div className="mt-2"><Banner tone={ws.status === "unsynced" ? "warn" : "error"}>{ws.saveError}</Banner></div>}
      </Sheet>
    </FocusedWindow>
  );
}
