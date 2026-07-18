// =============================================================================
// StageEditor — slide-in drawer to edit one carpentry stage's planned dates + lock.
// Opened by clicking a stage on the Pipeline calendar. Saving ripples the stage's
// dependents forward (see WorkforcePipelineTab.onSaveEdit → stageRipple). Shows the
// labour value + workforce category so the schedule stays tied to the budget.
// =============================================================================
import { useState } from "react";

const fmt$ = (n) => (n == null ? null : `$${Math.round(n).toLocaleString()}`);
const shift = (ymd, days) => { if (!ymd) return ymd; const d = new Date(`${ymd}T12:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

export default function StageEditor({ block, saving, onClose, onSave }) {
  const [start, setStart] = useState(block.start || "");
  const [end, setEnd] = useState(block.end || block.start || "");
  const [locked, setLocked] = useState(!!block.locked);

  // Shift both dates together (move the whole stage) by N days.
  const move = (days) => { setStart((s) => shift(s, days)); setEnd((e) => shift(e, days)); };
  const invalid = start && end && end < start;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-sm h-full bg-surface shadow-xl border-l border-hairline p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <span className="w-3 h-3 rounded-sm inline-block mr-1.5 align-middle" style={{ background: block.palette?.dot }} />
            <span className="text-sm font-semibold text-ink align-middle">{block.stageLabel}</span>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink text-lg leading-none">×</button>
        </div>
        <p className="text-xs text-muted mb-4">{block.jobLabel}</p>

        <div className="space-y-1 mb-4 text-xs">
          {block.workforceTaskCategory && <div className="flex justify-between"><span className="text-muted">Workforce stream</span><span className="text-ink">{block.workforceTaskCategory}</span></div>}
          {fmt$(block.labourSell) && <div className="flex justify-between"><span className="text-muted">Labour value (drives duration)</span><span className="text-ink font-medium">{fmt$(block.labourSell)}</span></div>}
        </div>

        {block.actualStart && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 mb-4 text-xs">
            <p className="font-medium text-emerald-800 mb-0.5">Actual (from approved timesheets)</p>
            <div className="flex justify-between text-emerald-700">
              <span>{block.actualStart} → {block.actualEnd || "in progress"}</span>
              {block.actualHours ? <span className="font-medium">{block.actualHours}h</span> : null}
            </div>
          </div>
        )}

        <label className="block text-xs font-medium text-ink mb-1">Start</label>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring mb-3" />
        <label className="block text-xs font-medium text-ink mb-1">End</label>
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring mb-1" />
        {invalid && <p className="text-[11px] text-red-600 mb-2">End can’t be before start.</p>}

        <div className="flex items-center gap-1.5 my-3">
          <span className="text-xs text-muted mr-1">Shift:</span>
          {[["-7", -7], ["-1", -1], ["+1", 1], ["+7", 7]].map(([lbl, n]) => (
            <button key={lbl} type="button" onClick={() => move(n)} className="px-2 py-1 text-xs rounded border border-hairline text-muted hover:text-ink">{lbl}d</button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-ink cursor-pointer mb-5">
          <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} className="rounded" />
          Lock (pin against auto-layout &amp; ripple)
        </label>

        <p className="text-[11px] text-muted mb-3">Saving moves this stage and pushes any dependent stages forward. Later stages will not be pulled earlier.</p>

        <div className="flex gap-2">
          <button type="button" disabled={saving || invalid} onClick={() => onSave({ block, plannedStart: start || null, plannedEnd: end || null, locked })}
            className="flex-1 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40">
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-hairline text-sm font-medium">Cancel</button>
        </div>
      </div>
    </div>
  );
}
