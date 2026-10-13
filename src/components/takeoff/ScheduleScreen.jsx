// =============================================================================
// ScheduleScreen — the length schedule: Qty × finished length per material/profile, with the
// raw/allowance explanation on expansion and long-piece / ceiling flags. Lines only group when
// the full spec, profile and finished length match; different lengths are never merged into LM.
// "Ordered" counts come ONLY from recorded placed orders (exports don't count).
// Any long piece — measured run, manual or counted finished length — can be split explicitly (R04 F07).
// The split replaces the pieces it splits (for N identical pieces, choose how many); the rest stay whole.
// Remove split restores the originals. A split made against a source that later changes is flagged stale.
// =============================================================================
import { useMemo, useState } from "react";
import { describeSpec, evaluateSplit, PROBLEM_TEXT } from "../../../shared/takeoff/index.js";
import { partial } from "./changeset.js";
import { Banner, Btn, NumberField, Sheet } from "./ui.jsx";
import { fmtLm, fmtMm } from "./format.js";

export default function ScheduleScreen({ ws, onBack }) {
  const view = ws.view, computed = ws.computed;
  const [open, setOpen] = useState(null);
  const [splitFor, setSplitFor] = useState(null);
  const mats = useMemo(() => new Map(view.materials.map((m) => [m.id, m])), [view.materials]);
  const contribs = useMemo(() => new Map((computed?.contributions || []).map((c) => [c.contributionId, c])), [computed]);
  const status = useMemo(() => new Map((ws.server?.orderStatus || []).map((s) => [s.bucketKey, s])), [ws.server]);
  const groups = useMemo(() => {
    const g = new Map();
    for (const l of computed?.scheduleLines || []) {
      const m = mats.get(l.jobMaterialIds[0]);
      const name = m?.name || "Material";
      let spec = ""; try { spec = m ? describeSpec(m.spec, m.profile).line : ""; } catch { /* legacy */ }
      if (!g.has(l.specKey)) g.set(l.specKey, { name, spec, lines: [] });
      g.get(l.specKey).lines.push(l);
    }
    return [...g.values()];
  }, [computed, mats]);
  const surplus = (ws.server?.orderStatus || []).filter((s) => s.reconcile);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {onBack && <Btn kind="ghost" onClick={onBack}>‹ Back</Btn>}
        <h2 className="flex-1 text-base font-semibold text-ink">Length schedule</h2>
        <span className="text-sm text-muted">{fmtLm(computed?.totalLm)} LM total</span>
      </div>
      {!groups.length && <p className="py-6 text-center text-sm text-muted">No lengths yet — measure runs, count pieces or add manual lengths.</p>}
      {surplus.length > 0 && <Banner tone="warn">Some placed orders no longer match the takeoff (a measurement or rule changed). They show as surplus — check them before ordering more.</Banner>}
      {groups.map((g) => (
        <section key={g.name + g.lines[0].specKey} className="rounded-card border border-hairline bg-white">
          <h3 className="border-b border-hairline px-3 py-2 text-sm font-semibold text-ink">{g.name}{g.spec && <span className="block text-[11px] font-normal text-muted">{g.spec}</span>}</h3>
          <ul className="divide-y divide-hairline">
            {g.lines.map((l) => {
              const st = status.get(l.bucketKey);
              const isOpen = open === l.bucketKey;
              return (
                <li key={l.bucketKey}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : l.bucketKey)} aria-expanded={isOpen}
                    className="flex min-h-[48px] w-full items-center gap-3 px-3 py-2 text-left">
                    <span className="w-16 shrink-0 text-sm font-semibold text-ink">{l.quantity} ×</span>
                    <span className="flex-1 text-sm text-ink">{fmtMm(l.finishedLengthMm)} mm
                      {l.ceilingExceeded ? <span className="ml-2 rounded bg-red-50 px-1.5 text-[11px] font-semibold text-red-700">over ceiling</span>
                        : l.handlingFlag ? <span className="ml-2 rounded bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-800">long piece</span> : null}
                      {l.problems.length > 0 && !l.ceilingExceeded && <span className="ml-2 rounded bg-red-50 px-1.5 text-[11px] font-semibold text-red-700">needs attention</span>}
                    </span>
                    {st && <span className="shrink-0 text-[11px] text-muted">{st.ordered ? `${st.ordered} ordered · ${st.remaining} left${st.surplus ? ` · ${st.surplus} surplus` : ""}` : "not ordered"}</span>}
                    <span aria-hidden="true" className="text-muted">{isOpen ? "▾" : "▸"}</span>
                  </button>
                  {isOpen && (
                    <div className="space-y-1 bg-page px-3 py-2 text-xs">
                      {l.problems.map((p) => <p key={p} className="text-red-700">{PROBLEM_TEXT[p] || p}</p>)}
                      {l.contributionIds.map((cid) => {
                        const c = contribs.get(cid);
                        if (!c) return null;
                        const canSplit = !!c.result && ws.capabilities?.edit;
                        return (
                          <div key={cid} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2 py-1.5">
                            <span className="flex-1 text-ink">{c.split ? `${c.result.quantity > 1 ? `${c.split.originals || 1} of ${c.result.quantity} × ` : ""}${fmtMm(c.result.finishedLengthMm)} mm split into ${c.split.children.map((x) => fmtMm(x.finishedLengthMm)).join(" + ")} (laps ${c.split.laps.join(", ")} mm)${c.result.quantity - (c.split.originals || 1) > 0 ? ` · ${c.result.quantity - (c.split.originals || 1)} kept whole` : ""}${c.split.stale ? " — source changed, review" : ""}` : c.explanation}</span>
                            {canSplit && <Btn kind="ghost" onClick={() => setSplitFor(cid)}>{c.split ? (c.split.stale ? "Review split" : "Edit split") : "Split"}</Btn>}
                            {c.split && ws.capabilities?.edit && (
                              <Btn kind="ghost" onClick={() => { const raw = view.contributions.find((x) => x.id === cid); ws.edit(partial({ contributions: [{ ...raw, split: null }] })); }}>Remove split</Btn>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="px-3 py-2 text-right text-xs text-muted">{g.lines.reduce((a, l) => a + l.quantity, 0)} pieces · {fmtLm(g.lines.reduce((a, l) => a + l.finishedLengthMm * l.quantity, 0) / 1000)} LM</p>
        </section>
      ))}
      {splitFor && (() => {
        const c = contribs.get(splitFor);
        const raw = view.contributions.find((x) => x.id === splitFor);
        const mat = mats.get(raw?.jobMaterialId);
        if (!c || !raw) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 lg:items-center" role="dialog" aria-modal="true" aria-label="Split piece">
            <div className="w-full max-w-lg"><Sheet title={c.kind === "run" ? "Split this run" : "Split these pieces"} onClose={() => setSplitFor(null)}>
              <SplitForm required={c.result.finishedLengthMm} rules={mat?.rules} initial={raw.split} quantity={c.result.quantity} measured={c.kind === "run"}
                onApply={(sp) => { ws.edit(partial({ contributions: [{ ...raw, split: { ...sp, sourceFinishedMm: c.result.finishedLengthMm, version: (raw.split?.version || 0) + 1 } }] })); setSplitFor(null); }}
                onCancel={() => setSplitFor(null)} />
            </Sheet></div>
          </div>
        );
      })()}
    </div>
  );
}

/** Explicit split: child lengths + a lap per joint; coverage must reach the run's finished length. */
export function SplitForm({ required, rules, initial, onApply, onCancel, quantity = 1, measured = true }) {
  const [originals, setOriginals] = useState(Math.min(initial?.originals || 1, quantity));
  const [pieces, setPieces] = useState(initial?.pieces?.length ? initial.pieces : [null, null]);
  const [laps, setLaps] = useState(initial?.laps?.length ? initial.laps : [null]);
  const ready = pieces.every((p) => p > 0) && laps.every((l) => l != null && l >= 0);
  let ev = null, err = null;
  if (ready) { try { ev = evaluateSplit({ requiredFinishedMm: required, pieces, laps }, rules); } catch (e) { err = e.message; } }
  const setP = (i) => (n) => setPieces((a) => a.map((x, j) => (j === i ? n : x)));
  const setL = (i) => (n) => setLaps((a) => a.map((x, j) => (j === i ? n : x)));
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted">{measured
        ? <>This run needs <b className="text-ink">{fmtMm(required)} mm</b> of coverage (its allowance is already included — pieces don&apos;t get another one).</>
        : <>Each piece is a finished <b className="text-ink">{fmtMm(required)} mm</b> length — the split pieces must cover it (no allowance is added).</>} Enter each piece and the lap at each joint.</p>
      {quantity > 1 && (
        <NumberField label={`How many of the ${quantity} pieces to split`} unit="pcs" integer min={1} max={quantity} value={originals} onCommit={(n) => setOriginals(n)}
          help={`${quantity - originals} stay whole at ${fmtMm(required)} mm.`} />
      )}
      {pieces.map((p, i) => (
        <div key={i} className="space-y-2">
          <NumberField label={`Piece ${i + 1} length`} value={p} onCommit={setP(i)} />
          {i < pieces.length - 1 && <NumberField label={`Lap at joint ${i + 1}`} value={laps[i]} min={0} onCommit={setL(i)} help="Ask the supplier or use the product's installation instructions — there is no default lap." />}
        </div>
      ))}
      <div className="flex gap-2">
        <Btn onClick={() => { setPieces((a) => [...a, null]); setLaps((a) => [...a, null]); }} disabled={pieces.length >= 20}>Add piece</Btn>
        <Btn onClick={() => { setPieces((a) => a.slice(0, -1)); setLaps((a) => a.slice(0, -1)); }} disabled={pieces.length <= 2}>Remove piece</Btn>
      </div>
      {err && <Banner tone="error">{err}</Banner>}
      {ev && (
        <Banner tone={ev.valid ? "ok" : "error"}>
          Pieces {ev.children.map((c) => `${fmtMm(c.finishedLengthMm)}${c.handlingFlag ? " (long)" : ""}`).join(" + ")} − laps {ev.laps.join(" + ")} = coverage <b>{fmtMm(ev.coverageMm)} mm</b>
          {ev.valid ? (ev.overcoverageMm > 0 ? ` (${fmtMm(ev.overcoverageMm)} mm over)` : " — exact") : `. ${ev.problems.join(" ")}`}
        </Banner>
      )}
      <div className="flex gap-2">
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn kind="primary" className="flex-1" disabled={!ev?.valid} onClick={() => onApply({ pieces: ev.children.map((c) => c.finishedLengthMm), laps: ev.laps, originals })}>Apply split</Btn>
      </div>
    </div>
  );
}
