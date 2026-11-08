/**
 * LegacyScheduleRows — the pre-register Concept "Finishes schedule" and Consultants "Provisional F&F
 * schedule" lists, shown only while the Master Register is switched off for a lead (REGISTER_ENABLED /
 * REGISTER_PILOT_LEADS, see registerEnabledFor). Same storage as before — rows {area,item,supplier?,notes}
 * in leads.selections_schedule — so switching the register on later adopts every row (readRegister).
 * Register-format rows ({kind:"meta"|"item"}) are never shown or touched here. Saves run in order and typing
 * is debounced, so a slow keystroke save can never land after (and undo) a later add/delete.
 */
import { useEffect, useRef, useState } from "react";

const VARIANTS = {
  concept: { title: "Finishes schedule", empty: "Start the finishes schedule — it carries through to Consultants + the proposal.", supplier: false },
  consultants: { title: "Provisional fittings & fixtures schedule", empty: "Carries the finishes from Concept. Issue the provisional F&F to suppliers, then tick “issued” below.", supplier: true },
};
const isRow = (r) => r && typeof r === "object";

export default function LegacyScheduleRows({ lead, patch, variant }) {
  const v = VARIANTS[variant];
  const all = Array.isArray(lead.selections_schedule) ? lead.selections_schedule : [];
  const kept = all.filter((r) => isRow(r) && r.kind);
  const [rows, setRows] = useState(() => all.filter((r) => isRow(r) && !r.kind));
  const keptRef = useRef(kept);
  const queue = useRef(Promise.resolve());
  const timer = useRef(null);
  const pending = useRef(null);
  useEffect(() => { keptRef.current = kept; });

  function persist(next) {
    pending.current = null;
    queue.current = queue.current.then(() => patch({ selections_schedule: [...keptRef.current, ...next] })).catch(() => null);
  }
  function save(next, now) {
    setRows(next);
    clearTimeout(timer.current);
    pending.current = next;
    if (now) persist(next); else timer.current = setTimeout(() => persist(next), 600);
  }
  // Leaving the stage mid-typing still saves the last edit.
  useEffect(() => () => { clearTimeout(timer.current); if (pending.current) persist(pending.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const addRow = () => save([...rows, v.supplier ? { area: "", item: "", supplier: "", notes: "" } : { area: "", item: "", notes: "" }], true);
  const editRow = (i, k, val) => save(rows.map((r, ix) => (ix === i ? { ...r, [k]: val } : r)));
  const delRow = (i) => save(rows.filter((_, ix) => ix !== i), true);

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="section-label">{v.title}</h3>
        <button type="button" onClick={addRow} className="text-xs font-semibold text-primary hover:underline">+ Add row</button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">{v.empty}</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-1.5">
              <input value={r.area || ""} onChange={(e) => editRow(i, "area", e.target.value)} placeholder="Area" className={`${v.supplier ? "w-24" : "w-28"} min-w-0 rounded-lg border border-hairline px-2 py-1 text-xs`} />
              <input value={r.item || ""} onChange={(e) => editRow(i, "item", e.target.value)} placeholder={v.supplier ? "Item" : "Item / finish"} className="min-w-0 flex-1 rounded-lg border border-hairline px-2 py-1 text-xs" />
              {v.supplier
                ? <input value={r.supplier || ""} onChange={(e) => editRow(i, "supplier", e.target.value)} placeholder="Supplier" className="w-28 min-w-0 rounded-lg border border-hairline px-2 py-1 text-xs" />
                : <input value={r.notes || ""} onChange={(e) => editRow(i, "notes", e.target.value)} placeholder="Notes" className="min-w-0 flex-1 rounded-lg border border-hairline px-2 py-1 text-xs" />}
              <button type="button" onClick={() => delRow(i)} className="shrink-0 px-1.5 text-xs text-red-500 hover:text-red-700">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
