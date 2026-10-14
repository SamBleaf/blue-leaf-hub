// =============================================================================
// measure/TimberPanel.jsx — sheet content for repeated timber members (TC-R04 02 §2, 03 T1/T2):
//   TickPanel          one member station: remove / put back, duplicate, override its length (tied to its station)
//   DistributionPanel  the run members are spaced along: count, offsets, endpoint inclusion, spacing
//   MemberPanel        the member line: projected vs true length and the pitch (projected only)
// Writes go back through MeasureScreen's undoable edits (distribution inputs.overrides / material rules).
// =============================================================================
import { Banner, Btn, NumberField } from "../ui.jsx";
import { fmtMm, fmtRaw } from "../format.js";

/** onRun: back to the whole distribution run (its count, offsets, endpoints, spacing). At ordinary zoom the ticks sit
 *  closer than a finger, so a tap on the run line always lands on a tick — this is the way to the run's settings. */
export function TickPanel({ tick, override, noun, canEdit, onRemove, onRestore, onDuplicate, onRemoveCopy, onLength, onClearLength, onRun, runLabel }) {
  const dupWanted = override?.duplicate || 0;
  return (
    <div className="space-y-2 text-sm" data-tick-panel="">
      {onRun && <Btn kind="ghost" className="-ml-3" onClick={onRun}>‹ {runLabel || "Whole run"}</Btn>}
      <p className="font-medium text-ink">{noun[0].toUpperCase() + noun.slice(1)} at {fmtRaw(tick.positionMm)} mm along the run</p>
      {tick.removed ? <p className="text-muted">Removed from the order.</p> : (
        <p className="text-ink">Needs <b>{fmtMm(tick.lengthNeededMm)} mm</b>{tick.lengthOverridden ? " (length changed for this one)" : ""}
          {tick.pieces > 0 ? ` · ${tick.pieces} piece${tick.pieces === 1 ? "" : "s"} here` : ""}</p>
      )}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {tick.removed ? <Btn onClick={onRestore}>Put it back</Btn> : <Btn kind="danger" onClick={onRemove}>Remove {noun}</Btn>}
          {!tick.removed && <Btn onClick={onDuplicate}>Duplicate</Btn>}
          {!tick.removed && dupWanted > 0 && <Btn kind="ghost" onClick={onRemoveCopy}>Remove a copy</Btn>}
        </div>
      )}
      {dupWanted > 0 && (tick.duplicates || 0) !== dupWanted && (
        <Banner tone="warn">{dupWanted} extra {dupWanted === 1 ? "copy is" : "copies are"} saved here, but this version of the calculation doesn&apos;t count duplicates yet — the order doesn&apos;t include {dupWanted === 1 ? "it" : "them"}.</Banner>
      )}
      {canEdit && !tick.removed && (
        <>
          <NumberField label={`Length for this ${noun} only`} value={override?.lengthMm ?? null} min={1} max={30000} onCommit={onLength}
            help="Overrides stay tied to this station; they're flagged if the run or spacing changes." />
          {override?.lengthMm != null && <Btn kind="ghost" onClick={onClearLength}>Use the measured length</Btn>}
        </>
      )}
    </div>
  );
}

/** emptyNote: why no members are counted when the engine said so (e.g. offsets longer than the run) — the generic
 *  "member line" hint is only for when nothing else is wrong.
 *  spacing / onSpacing: equal bays is a MATERIAL rule (the engine spaces every run of the material the same way), so
 *  it is shown and changed as such — never as a per-run input the calculation would ignore. */
export function DistributionPanel({ lengthMm, count, noun, centresMm, inputs, spacing, canEdit, staleCount, onInputs, onSpacing, onClearStale, emptyNote = null }) {
  const i = inputs || {};
  const equal = spacing === "equal";
  return (
    <div className="space-y-2 text-sm" data-distribution-panel="">
      <p className="font-medium text-ink">Distribution run — {fmtRaw(lengthMm)} mm</p>
      <p className="text-ink">{count != null ? <><b>{count}</b> {noun} at {fmtMm(centresMm)} mm {equal ? "maximum centres (equal bays)" : "centres"}</> : emptyNote || "Members appear once the member line and its length are set."}</p>
      <p className="text-[11px] text-muted">This is the line the {noun} are spaced along — not the roof perimeter. Tap a tick to remove, duplicate or change one.</p>
      {staleCount > 0 && <Banner tone="warn" action={canEdit ? <Btn onClick={onClearStale}>Clear them</Btn> : null}>{staleCount} member change{staleCount === 1 ? " no longer matches" : "s no longer match"} a station (the run or spacing changed) — review.</Banner>}
      {canEdit && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Start offset" value={i.startOffsetMm ?? 0} onCommit={(n) => onInputs({ startOffsetMm: n })} />
          <NumberField label="End offset" value={i.endOffsetMm ?? 0} onCommit={(n) => onInputs({ endOffsetMm: n })} />
          <label className="flex min-h-[44px] items-center gap-2 text-xs text-ink"><input type="checkbox" className="h-5 w-5 rounded border-hairline text-primary" checked={i.includeStart !== false} onChange={(e) => onInputs({ includeStart: e.target.checked })} />Member at the start</label>
          <label className="flex min-h-[44px] items-center gap-2 text-xs text-ink"><input type="checkbox" className="h-5 w-5 rounded border-hairline text-primary" checked={i.includeEnd !== false} onChange={(e) => onInputs({ includeEnd: e.target.checked })} />Member at the end</label>
          {onSpacing && <label className="col-span-2 flex min-h-[44px] items-center gap-2 text-xs text-ink"><input type="checkbox" className="h-5 w-5 rounded border-hairline text-primary" checked={equal} onChange={(e) => onSpacing(e.target.checked ? "equal" : "fixed")} />Equal bays on every run of this material (no centre larger than {fmtMm(centresMm)} mm)</label>}
        </div>
      )}
    </div>
  );
}

/** The member line: projected vs true length and the pitch (projected only — the engine needs one, 0 for a level
 *  member such as a joist; a true length is already sloped and is never pitched again, 03 T2). */
export function MemberPanel({ lengthMm, lengthSource, pitchDeg, purpose, canEdit, onPitch }) {
  const projected = lengthSource !== "true" && lengthSource !== "entered";
  const hasPitch = pitchDeg != null && pitchDeg >= 0 && pitchDeg < 90;
  const trueLen = projected && hasPitch && lengthMm ? lengthMm / Math.cos((pitchDeg * Math.PI) / 180) : null;
  const rafters = purpose === "rafters";
  return (
    <div className="space-y-2 text-sm" data-member-panel="">
      {lengthMm != null && <p className="text-ink">Member line <b>{fmtRaw(lengthMm)} mm</b> {projected ? "measured in plan (projected)" : "measured as a true length — pitch not applied"}
        {trueLen ? <> → <b>{fmtRaw(trueLen)} mm</b> true at {pitchDeg}°</> : null}</p>}
      {lengthSource === "entered" && <Banner tone="info">This timber uses an entered cut length — a member line isn&apos;t needed.</Banner>}
      {projected && canEdit && <NumberField label={rafters ? "Roof pitch" : "Pitch"} unit="°" value={pitchDeg ?? null} min={0} max={75} onCommit={onPitch}
        help={rafters ? "Applies to projected (plan) lengths only." : "Applies to projected (plan) lengths only — enter 0 for a level member."} />}
      {projected && !hasPitch && <p className="text-amber-800">Enter the pitch{rafters ? "" : " (0 if level)"} to get the true member length.</p>}
    </div>
  );
}
