// =============================================================================
// AssigneePickerSheet — a multi-select bottom sheet for assigning workers to a task.
// Pure UI: the parent supplies the candidate list + the current selection + onSave. Used by
// the worker PWA (crew scope), carpentry, charge-up + ops task panels. Selecting toggles
// membership; "Unassigned" is simply an empty selection.
// =============================================================================
import { useState } from "react";

export default function AssigneePickerSheet({
  candidates = [], initial = [], onSave, onClose, saving = false,
  title = "Assign workers", onShowAll, showingAll = false,
}) {
  const [sel, setSel] = useState(() => new Set(initial));
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="fixed inset-0 z-[60] flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-ink">{title}</h3>
          <button onClick={onClose} className="text-muted text-xl leading-none" aria-label="Close">✕</button>
        </div>

        {candidates.length === 0 ? (
          <p className="text-sm text-muted py-2">No crew rostered here — {onShowAll ? "show all workers below." : "no workers to show."}</p>
        ) : (
          <div className="space-y-1 mb-3">
            {candidates.map((c) => {
              const on = sel.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left ${on ? "border-primary bg-primary/5" : "border-hairline"}`}
                >
                  <span className="text-sm text-ink">{c.name}{c.trade ? <span className="text-xs text-muted capitalize"> · {String(c.trade).replace(/_/g, " ")}</span> : null}</span>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${on ? "border-primary bg-primary text-white" : "border-slate-300"}`}>
                    {on && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="w-3 h-3"><path d="M20 6 9 17l-5-5" /></svg>}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {onShowAll && !showingAll && (
          <button type="button" onClick={onShowAll} className="text-xs text-primary font-medium mb-3">Show all workers</button>
        )}

        <div className="flex gap-2">
          <button onClick={() => onSave([...sel])} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-hairline text-sm text-muted">Cancel</button>
        </div>
      </div>
    </div>
  );
}
