// =============================================================================
// RescaleReview — after a page is re-scaled, runs measured with the OLDER scale are flagged.
// Calibrations are never edited in place; this screen shows each affected run's order length
// before → after under the newest scale for its page/region and applies the new scale only to
// the runs the user selects. Frozen exports and placed orders are untouched.
// =============================================================================
import { useMemo, useState } from "react";
import { rescaleCandidates } from "../../../shared/takeoff/index.js";
import { partial } from "./changeset.js";
import { Banner, Btn } from "./ui.jsx";
import { fmtMm, fmtRaw } from "./format.js";

/** A re-stamped wall's openings keep their mm (they never move with the scale): said once, naming any that won't fit. */
function wallOpeningsText(wall) {
  const ops = wall.openings || [];
  if (!ops.length) return "";
  const off = ops.filter((o) => !o.fits);
  if (off.length) return ` · ${off.map((o) => o.label || "an opening").join(", ")} won't fit at the new size: move ${off.length > 1 ? "them" : "it"} after`;
  return ` · ${ops.length > 1 ? `its ${ops.length} openings keep their sizes: check them` : "its opening keeps its size: check it"} after`;
}

export default function RescaleReview({ ws, onDone }) {
  const rows = useMemo(() => rescaleCandidates(ws.view), [ws.view]);
  // HUB 029: a traced wall the new scale can't take (e.g. its gable apex would be off the wall) is never ticked or sent:
  // the server would refuse the whole change, runs included
  const blocked = (r) => !!r.wall?.problem;
  const [picked, setPicked] = useState(() => new Set(rows.filter((r) => !blocked(r)).map((r) => r.measurement.id)));
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">No runs are using an older scale.</p>;
  function apply() {
    const recs = rows.filter((r) => picked.has(r.measurement.id) && !blocked(r)).map((r) => ({ ...r.measurement, calibrationId: r.to.id }));
    if (recs.length) ws.edit(partial({ measurements: recs }));
    onDone?.();
  }
  return (
    <div className="space-y-3">
      <Banner tone="info">These runs were measured before the page was re-scaled. Choose which to recalculate with the new scale. Exports already made and placed orders don&apos;t change.</Banner>
      <ul className="divide-y divide-hairline rounded-card border border-hairline bg-white">
        {rows.map((r) => (
          <li key={r.measurement.id}>
            <label className="flex min-h-[52px] items-center gap-3 px-3 py-2 text-sm">
              <input type="checkbox" className="h-5 w-5 rounded text-primary" checked={picked.has(r.measurement.id) && !blocked(r)} disabled={blocked(r)}
                onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.measurement.id); else n.delete(r.measurement.id); return n; })} />
              {r.wall ? (
                // HUB 029: a traced wall reads as its length before → after (it has no order length of its own)
                <span className="flex-1" data-rescale-wall={r.measurement.id}>
                  {r.measurement.inputs?.name || r.measurement.label || "Wall"}: {fmtRaw(r.wall.beforeMm)} → <b>{fmtRaw(r.wall.afterMm)} mm</b> long
                  {r.wall.heightAfterMm != null ? <>, {fmtRaw(r.wall.heightBeforeMm)} → <b>{fmtRaw(r.wall.heightAfterMm)} mm</b> high</> : null}
                  <span className="block text-[11px] text-muted">Traced wall · page {r.to.pageIndex + 1}{r.to.regionLabel ? ` · ${r.to.regionLabel}` : ""}{wallOpeningsText(r.wall)}</span>
                  {r.wall.problem ? <span className="block text-[11px] font-medium text-amber-800" data-rescale-problem="">{r.wall.problem.message}</span> : null}
                </span>
              ) : (
                <span className="flex-1">
                  Order {r.before ? `${fmtMm(r.before.finishedLengthMm)} mm` : "—"} → <b>{r.after ? `${fmtMm(r.after.finishedLengthMm)} mm` : "invalid"}</b>
                  <span className="block text-[11px] text-muted">Measured {r.before ? fmtRaw(r.before.rawLengthMm) : "—"} → {r.after ? fmtRaw(r.after.rawLengthMm) : "—"} mm · page {r.to.pageIndex + 1}{r.to.regionLabel ? ` · ${r.to.regionLabel}` : ""}</span>
                </span>
              )}
            </label>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Btn onClick={onDone}>Not now</Btn>
        <Btn kind="primary" className="flex-1" disabled={!picked.size || !ws.capabilities?.edit} onClick={apply}>Use the new scale for {picked.size} run(s)</Btn>
      </div>
    </div>
  );
}
