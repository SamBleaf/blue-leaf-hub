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

export default function RescaleReview({ ws, onDone }) {
  const rows = useMemo(() => rescaleCandidates(ws.view), [ws.view]);
  const [picked, setPicked] = useState(() => new Set(rows.map((r) => r.measurement.id)));
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">No runs are using an older scale.</p>;
  function apply() {
    const recs = rows.filter((r) => picked.has(r.measurement.id)).map((r) => ({ ...r.measurement, calibrationId: r.to.id }));
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
              <input type="checkbox" className="h-5 w-5 rounded text-primary" checked={picked.has(r.measurement.id)}
                onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.measurement.id); else n.delete(r.measurement.id); return n; })} />
              <span className="flex-1">
                Order {r.before ? `${fmtMm(r.before.finishedLengthMm)} mm` : "—"} → <b>{r.after ? `${fmtMm(r.after.finishedLengthMm)} mm` : "invalid"}</b>
                <span className="block text-[11px] text-muted">Measured {r.before ? fmtRaw(r.before.rawLengthMm) : "—"} → {r.after ? fmtRaw(r.after.rawLengthMm) : "—"} mm · page {r.to.pageIndex + 1}{r.to.regionLabel ? ` · ${r.to.regionLabel}` : ""}</span>
              </span>
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
