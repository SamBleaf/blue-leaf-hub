// =============================================================================
// measure/FloorPanel.jsx — the Floor frame sheet on the plan (Sam, 18 Nov 2026, Phase 1).
//
// Owner rule: simple onsite. A normal job is: draw the outline, tap a direction and centres (both already defaulted), tick the beams (each with a
// size), done. Steps with nothing to ask collapse to one summary line. Every edit is one undoable change (MeasureScreen's record).
//   1 Outline      Rectangle (two corners) or Outline (each corner, then Finish)
//   2 Openings     + Stair void / + Opening (drawn the same way, one at a time; skip with no openings)
//   3 Trusses      "Span the short way" (default) / "Span the long way"; centres 450 / 600 / Other
//   4 Beams        one row per truss-end edge: Beam on/off, size chips 400x63 / 445x63 / Other (the last size used is the next beam's); no size = Incomplete
//   5 Strongbacks  120 x 35 along truss ends with no beam + mid-span rows from the span rule: a summary line, rows and size under More
//   6 Trimmers     one chip row per stair void (445x63 default / 400x63)
//   7 Flooring     Structaflor over the main floor (outline less openings and wet areas): "N sheets (M m² laid, waste W%)"; sheet width, waste % and offcut reuse under More
//   Wet areas      + Wet area beside the openings: m² only for now (the Scyon sheets are phase 3)
// =============================================================================
import { useState } from "react";
import { BEAM_SIZE_CHIPS, BEAM_UNSIZED, TRIMMER_DEFAULT_SIZE, TRIMMER_SIZE_CHIPS, parseSize } from "../../../../shared/takeoff/engine/floor/geometry.js";
import { Banner, Btn, NumberField } from "../ui.jsx";
import { fmtM2 } from "../format.js";

const m = (mm) => (Number(mm) / 1000).toFixed(2);
const SB_SIZES = ["90x35", "120x35", "140x35"];
const CENTRES = [450, 600];
const SHEET_WIDTHS = [800, 600];

function Chip({ on, onClick, children, disabled, ...p }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick} {...p}
      className={`min-h-[44px] rounded-lg border px-3 text-sm font-medium focus-ring disabled:opacity-40 ${on ? "border-primary bg-primary/10 text-primary" : "border-hairline bg-surface text-ink"}`}>{children}</button>
  );
}

/** Size chips (two quick sizes + Other, which opens a box). `value` is the current size ("445x63"), or null / "unsized". */
function SizeChips({ chips, value, onPick, disabled, ariaLabel, testId }) {
  const [other, setOther] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState(null);
  const custom = value && value !== BEAM_UNSIZED && !chips.includes(value);
  const commit = () => {
    const s = parseSize(text);
    if (!s) { setErr("Type a size like 445x63."); return; }
    setErr(null); setOther(false); setText(""); onPick(s);
  };
  return (
    <div className="space-y-1" role="group" aria-label={ariaLabel} data-size-chips={testId}>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => <Chip key={c} on={value === c} disabled={disabled} onClick={() => onPick(c)}>{c.replace("x", " × ")} LVL</Chip>)}
        <Chip on={other || !!custom} disabled={disabled} onClick={() => setOther((o) => !o)}>{custom ? `${value.replace("x", " × ")} LVL` : "Other"}</Chip>
      </div>
      {other && (
        <div className="flex items-start gap-2">
          <input aria-label="Size, depth x thickness" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} placeholder="e.g. 360x63"
            className="min-h-[44px] w-32 rounded-lg border border-hairline px-3 text-sm focus-ring" inputMode="text" autoFocus />
          <Btn onClick={commit}>Set</Btn>
          {err && <p className="self-center text-[11px] text-amber-800" role="alert">{err}</p>}
        </div>
      )}
    </div>
  );
}

const Line = ({ label, children, testId }) => (
  <div className="rounded-lg border border-hairline bg-page px-3 py-2" data-floor-step={testId}>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
    {children}
  </div>
);

export default function FloorPanel({ material, layout, results, floor, voids, wets = [], canEdit, canDraw, mode, floorDraw, drawing, onDraw, onCancelDraw, onRule, onStrongbackSize, onRemoveShape, onRedrawFloor,
  orderGroups, onDone, needScale, onScale }) {
  const rules = material?.rules || {};
  const beams = rules.beams && typeof rules.beams === "object" ? rules.beams : {};
  const last = rules.lastBeamSize || null;
  const blocking = (results?.problems || []).filter((p) => p.blocking !== false);
  const notes = (results?.problems || []).filter((p) => p.blocking === false && !["floor_supplier_layout"].includes(p.code));
  const totals = layout?.totals || null;
  const ends = (layout?.edges || []).filter((e) => e.kind === "end");
  const stairs = (voids || []).filter((v) => v.stair);
  const [more, setMore] = useState(false);
  const [moreSheets, setMoreSheets] = useState(false);
  const sheets = layout?.sheets || null;
  const [otherCentres, setOtherCentres] = useState(false);
  const centres = Number(rules.centresMm ?? 450);
  const span = rules.span === "long" ? "long" : "short";
  const setBeam = (id, size) => onRule({ beams: { ...beams, [id]: size }, ...(size && size !== BEAM_UNSIZED ? { lastBeamSize: size } : {}) });
  const clearBeam = (id) => { const n = { ...beams }; delete n[id]; onRule({ beams: n }); };
  const allBeamed = ends.length > 0 && ends.every((e) => beams[e.id]);
  const selectAll = () => {
    if (allBeamed) { const n = { ...beams }; for (const e of ends) delete n[e.id]; onRule({ beams: n }); return; }
    const n = { ...beams };
    for (const e of ends) if (!n[e.id]) n[e.id] = last || BEAM_UNSIZED;
    onRule({ beams: n });
  };

  return (
    <div className="space-y-2 text-sm" data-floor-panel="">
      <p className="flex min-h-[44px] items-center font-semibold text-ink"><span className="truncate" data-floor-material="">{material?.name}</span></p>

      {needScale && (
        <div className="space-y-2" data-floor-needs-scale="">
          <p className="text-amber-800">This page has no scale yet. Scale it, then you come straight back here to draw.</p>
          {onScale && <Btn kind="primary" onClick={onScale}>Scale page</Btn>}
        </div>
      )}

      {/* 1 Outline */}
      {!needScale && !floor && (
        <Line label="1 · Floor outline" testId="outline">
          <p className="text-muted" data-floor-hint="">{drawing ? (mode === "rect" ? "Now tap the opposite corner." : "Tap the next corner. Double-tap the last one, press Finish, or tap the first corner.")
            : mode === "rect" ? "Tap one corner of the floor, then the opposite corner." : "Tap each corner of the floor in turn. Double-tap the last one, or press Finish."}</p>
          <p className="text-[11px] text-muted">Rectangle for a square-cornered floor, Outline for any other shape.</p>
        </Line>
      )}
      {floor && (
        <Line label="1 · Floor outline" testId="outline">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-ink" data-floor-summary="">{totals ? <><b>{fmtM2(totals.outlineAreaM2)} m²</b> · {m(layout.frame.widthMm)} × {m(layout.frame.spanMm)} m</> : "Outline drawn"}</p>
            {canEdit && <Btn kind="ghost" onClick={onRedrawFloor}>Redraw</Btn>}
          </div>
        </Line>
      )}

      {/* 2 Openings */}
      {floor && (
        <Line label="2 · Openings and wet areas" testId="openings">
          {floorDraw ? (
            <div className="space-y-1">
              <p className="text-muted" data-floor-hint="">{floorDraw.wet ? "Draw the wet area on the plan" : floorDraw.stair ? "Draw the stair void on the plan" : "Draw the opening on the plan"} {mode === "rect" ? "(tap two opposite corners)." : "(tap each corner, then Finish)."}</p>
              <Btn kind="ghost" onClick={onCancelDraw}>Cancel</Btn>
            </div>
          ) : (
            <div className="space-y-1">
              {voids.length === 0 && wets.length === 0 && <p className="text-muted">No openings or wet areas.</p>}
              {voids.map((v) => (
                <div key={v.m.id} className="flex items-center gap-2" data-floor-void={v.m.id}>
                  <p className="min-w-0 flex-1 truncate text-ink">{v.name}{v.stair ? "" : " (no trimmers)"}</p>
                  {canEdit && <Btn kind="ghost" onClick={() => onRemoveShape(v.m)} aria-label={`Remove ${v.name}`}>Remove</Btn>}
                </div>
              ))}
              {wets.map((w) => {
                const a = (layout?.wets || []).find((x) => x.id === w.m.id)?.areaM2;
                return (
                  <div key={w.m.id} className="flex items-center gap-2" data-floor-wet={w.m.id}>
                    <p className="min-w-0 flex-1 truncate text-ink">{w.name}{a != null ? ` · ${fmtM2(a)} m²` : ""}</p>
                    {canEdit && <Btn kind="ghost" onClick={() => onRemoveShape(w.m)} aria-label={`Remove ${w.name}`}>Remove</Btn>}
                  </div>
                );
              })}
              {canEdit && canDraw && (
                <div className="flex flex-wrap gap-2">
                  <Btn onClick={() => onDraw(true)} data-floor-add-stair="">+ Stair void</Btn>
                  <Btn onClick={() => onDraw(false)} data-floor-add-opening="">+ Opening</Btn>
                  <Btn onClick={() => onDraw(false, true)} data-floor-add-wet="">+ Wet area</Btn>
                </div>
              )}
            </div>
          )}
        </Line>
      )}

      {/* 3 Trusses: direction and centres */}
      {floor && (
        <Line label="3 · Trusses" testId="trusses">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Truss direction" data-floor-span="">
              <Chip on={span === "short"} disabled={!canEdit} onClick={() => onRule({ span: "short" })}>Span the short way</Chip>
              <Chip on={span === "long"} disabled={!canEdit} onClick={() => onRule({ span: "long" })}>Span the long way</Chip>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Truss centres" data-floor-centres="">
              {CENTRES.map((c) => <Chip key={c} on={centres === c} disabled={!canEdit} onClick={() => onRule({ centresMm: c })}>{c} centres</Chip>)}
              <Chip on={!CENTRES.includes(centres)} disabled={!canEdit} onClick={() => setOtherCentres(true)}>{CENTRES.includes(centres) ? "Other" : `${centres} centres`}</Chip>
            </div>
            {(otherCentres || !CENTRES.includes(centres)) && canEdit && <NumberField label="Centres" value={centres} min={200} max={1200} onCommit={(n) => onRule({ centresMm: n })} />}
            {totals && <p className="text-ink" data-floor-truss-summary=""><b>{totals.trussCount} trusses</b> · {layout.trussesByLength.map((g) => `${g.count} × ${(g.lengthMm).toLocaleString("en-AU")}`).join(", ")}</p>}
          </div>
        </Line>
      )}

      {/* 4 Beams */}
      {floor && totals && (
        <Line label="4 · Beams at the truss ends" testId="beams">
          <div className="space-y-2">
            {ends.length === 0 && <p className="text-muted">No truss-end edges.</p>}
            {ends.length > 1 && canEdit && <Btn onClick={selectAll} data-floor-select-all="">{allBeamed ? "Clear all ends" : "Select all ends"}</Btn>}
            {ends.map((e) => {
              const v = beams[e.id];
              const on = v !== undefined && v !== null && v !== "";
              const size = on ? (parseSize(v) || (v === BEAM_UNSIZED ? null : v)) : null;
              return (
                <div key={e.id} className="space-y-1 rounded-lg border border-hairline bg-white px-2 py-1" data-floor-edge-row={e.id}>
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 text-ink"><b>Edge {e.label}</b> · {m(e.lengthMm)} m</p>
                    <Chip on={on} disabled={!canEdit} onClick={() => (on ? clearBeam(e.id) : setBeam(e.id, last || BEAM_UNSIZED))} data-floor-beam-toggle={e.id}>{on ? "Beam" : "No beam"}</Chip>
                  </div>
                  {on && <SizeChips chips={BEAM_SIZE_CHIPS} value={size} disabled={!canEdit} onPick={(s) => setBeam(e.id, s)} ariaLabel={`Edge ${e.label} beam size`} testId={e.id} />}
                  {on && !size && <p className="text-[11px] font-medium text-amber-800" data-floor-beam-needs-size="">Choose this beam&apos;s size. It&apos;s set by the engineer.</p>}
                  {!on && <p className="text-[11px] text-muted">A 120 × 35 strongback ties these truss ends.</p>}
                </div>
              );
            })}
          </div>
        </Line>
      )}

      {/* 5 Strongbacks (summary) */}
      {floor && totals && (
        <Line label="5 · Strongbacks" testId="strongbacks">
          <p className="text-ink" data-floor-strongback-summary=""><b>{totals.strongbackLm.toFixed(2)} lm</b> · {totals.endStrongbackLm.toFixed(2)} at truss ends, {totals.midStrongbackLm.toFixed(2)} mid-span ({totals.strongbackRows} row{totals.strongbackRows === 1 ? "" : "s"})</p>
          {canEdit && <Btn kind="ghost" onClick={() => setMore((x) => !x)} aria-expanded={more} data-floor-more="">{more ? "Less" : "More"}</Btn>}
          {more && (
            <div className="space-y-2" data-floor-strongback-more="">
              <div role="group" aria-label="Mid-span rows" className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">Mid-span rows</span>
                <Chip on={rules.strongbackRows == null} onClick={() => onRule({ strongbackRows: null })}>Auto ({totals.strongbackRowsAuto})</Chip>
                {[0, 1, 2, 3].map((n) => <Chip key={n} on={rules.strongbackRows === n} onClick={() => onRule({ strongbackRows: n })}>{n}</Chip>)}
              </div>
              <div role="group" aria-label="Strongback size" className="flex flex-wrap items-center gap-2" data-floor-strongback-size="">
                <span className="text-xs text-muted">Size</span>
                {SB_SIZES.map((s) => <Chip key={s} on={`${material.spec.components.strongback.section.depthMm}x${material.spec.components.strongback.section.widthMm}` === s} onClick={() => onStrongbackSize(s)}>{s.replace("x", " × ")}</Chip>)}
              </div>
              <p className="text-[11px] text-muted">Set from the truss layout. Confirm the size and the end strongbacks with the truss supplier.</p>
            </div>
          )}
        </Line>
      )}

      {/* 6 Trimmers */}
      {floor && stairs.length > 0 && (
        <Line label="6 · Stair trimmers" testId="trimmers">
          <div className="space-y-2">
            {stairs.map((v) => (
              <div key={v.m.id} className="space-y-1" data-floor-trimmer-row={v.m.id}>
                <p className="text-ink"><b>{v.name}</b></p>
                <div className="flex flex-wrap gap-2" role="group" aria-label={`${v.name} trimmer size`}>
                  {TRIMMER_SIZE_CHIPS.map((c) => <Chip key={c} on={(rules.trimmerSizes?.[v.m.id] || TRIMMER_DEFAULT_SIZE) === c} disabled={!canEdit} onClick={() => onRule({ trimmerSizes: { ...(rules.trimmerSizes || {}), [v.m.id]: c } })}>{c.replace("x", " × ")} LVL</Chip>)}
                </div>
              </div>
            ))}
            <p className="text-[11px] text-muted">Sizes by engineer.</p>
          </div>
        </Line>
      )}

      {/* 7 Flooring (Structaflor over the main floor) */}
      {floor && totals && (
        <Line label="7 · Flooring" testId="flooring">
          <p className="text-ink" data-floor-areas="">Main floor <b>{fmtM2(totals.mainAreaM2)} m²</b>{totals.wetM2 > 0 && <> · wet areas <b>{fmtM2(totals.wetM2)} m²</b>{(layout.wets || []).length > 1 ? ` (${layout.wets.map((w) => `${w.name} ${fmtM2(w.areaM2)}`).join(", ")})` : ""}</>}{totals.openingsM2 > 0 && <> · openings {fmtM2(totals.openingsM2)} m²</>}</p>
          {sheets ? (
            <>
              <p className="text-ink" data-floor-sheets-summary=""><b>{sheets.sheet.name.replace("STRUCTAFLOR", "Structaflor")}</b> · {sheets.summary}</p>
              {canEdit && <Btn kind="ghost" onClick={() => setMoreSheets((x) => !x)} aria-expanded={moreSheets} data-floor-sheets-more="">{moreSheets ? "Less" : "More"}</Btn>}
              {moreSheets && (
                <div className="space-y-2" data-floor-sheets-more-panel="">
                  <div role="group" aria-label="Sheet size" className="flex flex-wrap items-center gap-2" data-floor-sheet-width="">
                    <span className="text-xs text-muted">Sheet</span>
                    {SHEET_WIDTHS.map((w) => <Chip key={w} on={sheets.sheet.widthMm === w} onClick={() => onRule({ sheetWidthMm: w === 800 ? null : w })}>3600 × {w}</Chip>)}
                  </div>
                  <NumberField label="Waste %" value={sheets.wastePct} min={0} max={50} onCommit={(n) => onRule({ wastePct: n === 5 ? null : n })} />
                  <Chip on={sheets.reuseOffcuts} onClick={() => onRule({ reuseOffcuts: sheets.reuseOffcuts ? false : null })} data-floor-reuse="">Reuse offcuts {sheets.reuseOffcuts ? "on" : "off"}</Chip>
                  <p className="text-[11px] text-muted">{sheets.packedSheets} sheets {sheets.reuseOffcuts ? "with offcuts reused" : "with no offcut reuse"}{sheets.reuseOffcuts ? `, ${sheets.packedNoReuseSheets} without` : ""}, plus waste, rounded up. Thickness {sheets.sheet.thicknessMm} mm from the truss centres.</p>
                </div>
              )}
            </>
          ) : <p className="text-muted">No main floor left to sheet.</p>}
        </Line>
      )}

      {/* the order, as the supplier reads it */}
      {floor && totals && (
        <Line label="Order" testId="order">
          {blocking.length > 0 && (
            <Banner tone="warn"><span data-floor-incomplete="">Incomplete.</span> {blocking.map((p) => p.message).join(" ")}</Banner>
          )}
          {orderGroups.length > 0 ? (
            <ul className="divide-y divide-hairline" data-floor-order="">
              {orderGroups.map((g) => (
                <li key={g.key} className="py-1" data-floor-order-group={g.heading}>
                  <p className="text-[11px] font-bold tracking-wide text-ink">{g.heading} <span className="font-normal text-muted">{[g.totalLm ? `${g.totalLm.toFixed(2)} LM` : null, g.totalEa ? `${g.totalEa} EA` : null].filter(Boolean).join(" · ")}</span></p>
                  {g.rows.map((r) => <p key={`${r.product}|${r.unit}`} className="text-xs text-muted">{g.heading === "FLOORING" ? `${r.product} — ${r.quantity} sheets` : <>{r.product} · {r.unit === "EA" ? `${r.quantity} EA` : `${r.cutText} = ${r.totalLm.toFixed(2)} LM`}</>}</p>)}
                </li>
              ))}
            </ul>
          ) : <p className="text-muted">Nothing to order yet.</p>}
          {notes.map((p) => <p key={p.message} className="text-[11px] text-muted">{p.message}</p>)}
          <p className="text-[11px] text-muted">The truss supplier designs the layout. These counts are for ordering and checking.</p>
        </Line>
      )}
      {!floor && blocking.length > 0 && !needScale && <Banner tone="warn">{blocking.map((p) => p.message).join(" ")}</Banner>}
      <div className="flex flex-wrap gap-2">{onDone && <Btn kind="primary" onClick={onDone} data-floor-done="">Done</Btn>}</div>
    </div>
  );
}
