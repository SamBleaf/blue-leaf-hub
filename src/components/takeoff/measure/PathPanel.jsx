// =============================================================================
// measure/PathPanel.jsx — sheet content for a continuous flashing run (TC-R04 13): live tight length and order
// length per piece, the red hard-maximum overflow vs the amber handling advisory, explicit splits (numeric station,
// move to a corner, remove, recalculate when a geometry edit made one invalid) and the three statuses.
// Pure presentation: every change goes back through MeasureScreen's undoable edits.
// =============================================================================
import { useState } from "react";
import { Banner, Btn, NumberField } from "../ui.jsx";
import { fmtMm, fmtRaw } from "../format.js";
import { explainableMm } from "./tools.js";

const QTY = { calculated: "calculated", estimate: "estimate", incomplete: "incomplete" };
const INST = { unspecified: "not specified", "source-pending": "source pending (not verified)", "project-detail-supplied": "project detail supplied", "supported-by-selected-rule": "supported by the selected rule" };
const PROC = { ready: "ready to order", draft: "draft — not ready to order", "missing-product": "needs product setup", "unavailable-stock": "stock unavailable" };

/**
 * Quantity · Installation · Procurement — exactly what the engine reported, never upgraded. HUB 006: kept out of the
 * way while measuring (collapsed "Details"); real problems are shown separately in plain English.
 */
export function StatusRow({ status }) {
  if (!status) return null;
  return (
    <details className="text-[11px] text-muted">
      <summary className="flex min-h-[44px] cursor-pointer items-center text-xs text-primary">Details</summary>
      <p data-statuses="">
        Quantity: <b className="font-semibold text-ink">{QTY[status.quantity] || status.quantity}</b> · Installation: <b className="font-semibold text-ink">{INST[status.installation] || status.installation}</b> · Procurement: <b className="font-semibold text-ink">{PROC[status.procurement] || status.procurement}</b>
      </p>
    </details>
  );
}

// shown by the dedicated lines above (or by SplitList / the drawing hint) — everything else is listed as-is
const SHOWN_ELSEWHERE = new Set(["piece_over_max", "no_legal_split", "handling_length", "max_unknown", "path_in_progress", "path_incomplete"]);
const pieceTight = (pc, r) => explainableMm(pc.tightMm, { allowanceMm: pc.allowanceMm, extraMm: pc.extraMm || 0, incrementMm: r.incrementMm, orderMm: pc.orderMm, lengthKind: pc.lengthKind });
const legsOf = (path) => (path?.layout?.segmentLengthsMm || []).filter((l) => l > 0.001).length;

/** "Measured … + allowance … → order …" for the path (one line per ordered piece when split). */
export function PathResult({ path }) {
  if (!path || !(path.tightTotalMm > 0) || !path.pieces?.length) return null;
  const r = path.config.rules;
  const legs = legsOf(path);
  const pieces = path.pieces;
  const over = pieces.filter((pc) => pc.overMax);
  const long = pieces.filter((pc) => pc.handlingFlag && !pc.overMax);
  const maxUnknown = path.problems.some((p) => p.code === "max_unknown");
  return (
    <div className="space-y-1 text-sm" data-path-result="">
      {pieces.length === 1 ? (
        <p className="text-ink">Measured <b>{pieceTight(pieces[0], r)}</b> + allowance {fmtMm(r.allowanceMm)} → order <b>{fmtMm(pieces[0].orderMm)} mm</b></p>
      ) : (
        <>
          <p className="text-ink">Measured <b>{fmtRaw(path.tightTotalMm)}</b> along the run → <b>{pieces.length} pieces</b>, each with its own {fmtMm(r.allowanceMm)} allowance:</p>
          <ul className="space-y-0.5 pl-1" data-pieces-list="">
            {pieces.map((pc) => (
              <li key={pc.index} className={pc.overMax ? "font-semibold text-red-700" : pc.handlingFlag ? "text-amber-800" : "text-ink"}>
                Piece {pc.index + 1}: {pieceTight(pc, r)} + {fmtMm(pc.allowanceMm)} → <b>{fmtMm(pc.orderMm)} mm</b>{pc.overMax ? " — over the maximum" : pc.handlingFlag ? " — long piece" : ""}
              </li>
            ))}
          </ul>
        </>
      )}
      {legs > 1 && <p className="text-[11px] text-muted">{legs} legs — corners are cut/folded on site; they add no pieces or allowances.</p>}
      {over.map((pc) => (
        <p key={pc.index} className="font-semibold text-red-700" data-overflow-text="">
          {pieces.length > 1 ? `Piece ${pc.index + 1}` : "This run"} orders {fmtMm(pc.orderMm)} mm — over the {fmtMm(r.orderCeilingMm)} mm maximum. The red part is the overflow;{" "}
          {pc.legalSplitMm != null ? `tap it to split at the limit (${fmtRaw(pc.legalSplitMm)} mm along the run).` : "there is no legal split position — resolve it manually."}
        </p>
      ))}
      {long.map((pc) => (
        <p key={`h${pc.index}`} className="text-amber-800" data-handling-text="">
          {pieces.length > 1 ? `Piece ${pc.index + 1}` : "This run"} orders {fmtMm(pc.orderMm)} mm — longer than the {fmtMm(r.handlingThresholdMm)} mm handling length. Advisory only; no split is needed.
        </p>
      ))}
      {maxUnknown && <p className="text-amber-800">This flashing has no maximum orderable length set up — keep drawing, but set it up before ordering.</p>}
      {path.problems.filter((p) => !SHOWN_ELSEWHERE.has(p.code) && !p.code.startsWith("split_")).map((p, i) => (
        <p key={`p${i}`} className={p.blocking === false ? "text-amber-800" : "font-semibold text-red-700"} data-path-problem={p.code}>{p.message}</p>
      ))}
    </div>
  );
}

/** How the order lengths were worked out (engine explanation lines), collapsed by default. */
export function PathExplain({ path }) {
  if (!path?.explain?.length) return null;
  return (
    <details className="text-[11px] text-muted">
      <summary className="min-h-[44px] cursor-pointer py-2 text-xs font-medium text-primary">How this was worked out</summary>
      <ul className="space-y-0.5">{path.explain.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </details>
  );
}

/**
 * Explicit splits of a run: numeric station, move to a corner, remove, recalculate an invalid one; add one by station.
 * Compact for phones: one 44 px row per split; its controls open only for the active split.
 * @param {{ path:object, canEdit:boolean, activeSplit:number|null, onActivate:Function, onMove:(i,mm)=>void,
 *   onCorner:(i,vertexIndex)=>void, onRemove:(i)=>void, onRecalc:(i)=>void, onAdd:(mm)=>void, onSplitAtLimit:()=>void }} p
 */
export function SplitList({ path, canEdit, activeSplit, onActivate, onMove, onCorner, onRemove, onRecalc, onAdd, onSplitAtLimit }) {
  const [adding, setAdding] = useState(false);
  const [addKey, setAddKey] = useState(0);
  if (!path?.layout) return null;
  // corners are numbered along the run (Corner 1 = the first bend); `i` stays the vertex index the engine moves to
  const corners = path.layout.vertexStationsMm.map((s, i) => ({ i, s })).slice(1, -1);
  const problemOf = (i) => path.problems.find((p) => p.refs?.some((r) => r.splitIndex === i));
  return (
    <div className="space-y-1.5" data-split-list="">
      {path.overflow?.legalSplitMm != null && canEdit && (
        <Btn kind="primary" className="w-full" onClick={onSplitAtLimit}>Split at limit ({fmtRaw(path.overflow.legalSplitMm)} mm)</Btn>
      )}
      {path.splits.map((rec, i) => {
        const p = problemOf(i);
        const open = activeSplit === i;
        return (
          <div key={i} className={`rounded-lg border ${open ? "border-primary bg-primary/5" : p ? "border-red-200" : "border-hairline"}`} data-split-row={i}>
            <button type="button" aria-expanded={open} className="min-h-[44px] w-full px-2 text-left text-sm font-medium text-ink" onClick={() => onActivate(open ? null : i)}>
              Split {i + 1} — {fmtRaw(rec.stationMm)} mm along the run{rec.rebuilt ? " (same cut location)" : ""}
            </button>
            {p && (
              <div className="px-2 pb-2"><Banner tone="warn" action={canEdit ? <Btn onClick={() => onRecalc(i)}>Recalculate</Btn> : null}>{p.message}</Banner></div>
            )}
            {canEdit && open && (
              <div className="grid grid-cols-2 gap-2 px-2 pb-2">
                <div className="col-span-2">
                  <NumberField label={`Split ${i + 1} position (mm along the run)`} value={Math.round(rec.givenMm * 10) / 10} min={0.001} max={path.tightTotalMm}
                    onCommit={(n) => onMove(i, n)} />
                </div>
                {corners.length > 0 && (
                  <label className="block text-xs font-medium text-muted">Move to a corner
                    <select className="mt-1 block min-h-[44px] w-full rounded-lg border border-hairline bg-white px-2 text-base text-ink" value=""
                      onChange={(e) => { if (e.target.value !== "") onCorner(i, Number(e.target.value)); }}>
                      <option value="">Corner…</option>
                      {corners.map((c, k) => <option key={c.i} value={c.i}>Corner {k + 1} — {fmtRaw(c.s)} mm</option>)}
                    </select>
                  </label>
                )}
                <Btn kind="danger" className={`self-end ${corners.length ? "" : "col-span-2"}`} onClick={() => onRemove(i)}>Remove split {i + 1}</Btn>
              </div>
            )}
          </div>
        );
      })}
      {canEdit && path.pieces?.length > 0 && (adding ? (
        <NumberField key={addKey} label="Add a split at (mm along the run)" value={null} min={0.001} max={path.tightTotalMm} autoFocus
          onCommit={(n) => { onAdd(n); setAddKey((k) => k + 1); setAdding(false); }} help="A split makes a site joint — each piece gets its own allowance." />
      ) : <Btn kind="ghost" onClick={() => setAdding(true)}>Add a split by distance…</Btn>)}
    </div>
  );
}
