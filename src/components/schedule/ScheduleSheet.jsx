import { useState, useEffect, useRef } from "react";
import BuildexactCostBadge from "./BuildexactCostBadge.jsx";
import { groupTasksByPhase, phaseColor, phaseLabel, taskStatusFromPercent } from "../../lib/scheduleUtils.js";

const CELL_CLASS = "w-full rounded border border-transparent bg-transparent px-1 py-1 text-xs hover:border-hairline focus:border-primary";

function SelectCell({ value, onCommit, options }) {
  return (
    <select value={value ?? ""} onChange={(e) => onCommit(e.target.value)} className={CELL_CLASS}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// Commit-on-blur/Enter editor. Previously this committed on every keystroke,
// which fired a PATCH + full task reload per character — stealing focus mid-edit,
// persisting half-typed values, and masking the dependency cascade. Now the user
// types freely and we commit ONCE on blur or Enter, so date/duration changes apply
// cleanly and ripple to dependent tasks.
function InputCell({ value, type = "text", onCommit }) {
  const [draft, setDraft] = useState(value ?? "");
  const focused = useRef(false);
  // Keep the field in sync with external updates (e.g. a cascade reload) — but
  // never clobber what the user is actively typing.
  useEffect(() => { if (!focused.current) setDraft(value ?? ""); }, [value]);

  const commit = () => {
    focused.current = false;
    const original = value ?? "";
    if (type === "number") {
      if (draft === "" || draft === null) return;         // don't commit an empty number
      const n = Number(draft);
      if (Number.isNaN(n)) return;                        // ignore non-numeric input
      if (n === Number(original)) return;                 // compare numerically: "5.0" === 5 → no PATCH
      onCommit(n);
    } else {
      if (String(draft) === String(original)) return;     // no change → no PATCH, no reload
      onCommit(draft);
    }
  };

  return (
    <input
      type={type}
      value={draft}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.currentTarget.blur(); }
        else if (e.key === "Escape") { setDraft(value ?? ""); focused.current = false; e.currentTarget.blur(); }
      }}
      className={CELL_CLASS}
    />
  );
}

function EditableCell({ value, type = "text", onCommit, options }) {
  if (options) return <SelectCell value={value} onCommit={onCommit} options={options} />;
  return <InputCell value={value} type={type} onCommit={onCommit} />;
}

export default function ScheduleSheet({ tasks = [], phaseLabels = {}, selectedIds = [], onSelectIds, onPatchTask, _onOpenTask, onAddTask, onBulkDelete }) {
  const today = new Date().toISOString().slice(0, 10);
  const { order, groups } = groupTasksByPhase(tasks);
  const selected = new Set(selectedIds);
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectIds([...next]);
  };

  return (
    <div className="rounded-card border border-hairline bg-surface">
      {selectedIds.length ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline bg-page px-3 py-2 text-sm">
          <span className="font-semibold text-ink">{selectedIds.length} selected</span>
          <button type="button" onClick={onBulkDelete} className="rounded-lg border border-danger/40 px-3 py-1.5 text-danger">Delete selected</button>
          <button type="button" onClick={() => onSelectIds([])} className="rounded-lg border border-hairline px-3 py-1.5 text-muted">Clear</button>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-[1200px] w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-page text-muted">
            <tr>
              {["#", "Phase", "Task name", "Duration", "Planned start", "Planned finish", "Assigned", "%", "Priority", "Planned hrs", "Planned cost", "Predecessors", "Linked from", "Linked to"].map((h) => (
                <th key={h} className="border-b border-hairline px-2 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.map((phase) => {
              const list = groups[phase] || [];
              const phaseHours = list.reduce((sum, t) => sum + (Number(t.planned_hours) || 0), 0);
              const phaseCost = list.reduce((sum, t) => sum + (Number(t.planned_cost) || 0), 0);
              return (
                <>
                  <tr key={`phase-${phase}`} className="bg-page">
                    <td className="border-b border-hairline px-2 py-2" style={{ borderLeft: `4px solid ${phaseColor(phase)}` }} />
                    <td colSpan={13} className="border-b border-hairline px-2 py-2 font-bold text-primary">
                      {phaseLabel(phase, phaseLabels)} · {list.length} tasks · {phaseHours}h · ${phaseCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      <button type="button" onClick={() => onAddTask(phase)} className="ml-3 rounded bg-surface px-2 py-1 text-xs text-accent">+ add</button>
                    </td>
                  </tr>
                  {list.map((task, index) => (
                    <tr key={task.id} className="hover:bg-page">
                      <td className="border-b border-hairline px-2 py-1">
                        <label className="flex items-center gap-1">
                          <input type="checkbox" checked={selected.has(task.id)} onChange={() => toggle(task.id)} />
                          {index + 1}
                        </label>
                      </td>
                      <td className="border-b border-hairline px-2 py-1">{phaseLabel(task.phase, phaseLabels)}</td>
                      <td className="border-b border-hairline px-2 py-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`flex-shrink-0 w-2 h-2 rounded-full ${
                            (task.percent_complete||0) >= 100 ? "bg-green-400" :
                            (task.end_date && task.end_date < today) ? "bg-red-400" :
                            (task.percent_complete||0) > 0 ? "bg-blue-400" : "bg-slate-300"
                          }`} />
                          <EditableCell value={task.name} onCommit={(v) => v.trim() && onPatchTask(task.id, { name: v.trim() })} />
                        </div>
                      </td>
                      <td className="border-b border-hairline px-2 py-1"><EditableCell type="number" value={task.duration_days} onCommit={(v) => onPatchTask(task.id, { duration_days: v })} /></td>
                      <td className="border-b border-hairline px-2 py-1"><EditableCell type="date" value={task.start_date || ""} onCommit={(v) => onPatchTask(task.id, { start_date: v })} /></td>
                      <td className="border-b border-hairline px-2 py-1"><EditableCell type="date" value={task.end_date || ""} onCommit={(v) => onPatchTask(task.id, { end_date: v })} /></td>
                      <td className="border-b border-hairline px-2 py-1"><EditableCell value={task.assignee_trade || task.trade || ""} onCommit={(v) => onPatchTask(task.id, { assignee_trade: v, trade: v })} /></td>
                      <td className="border-b border-hairline px-2 py-1"><EditableCell type="number" value={task.percent_complete || 0} onCommit={(v) => onPatchTask(task.id, { percent_complete: v, status: taskStatusFromPercent(v) })} /></td>
                      <td className="border-b border-hairline px-2 py-1">
                        <EditableCell
                          value={task.priority || "medium"}
                          onCommit={(v) => onPatchTask(task.id, { priority: v })}
                          options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "critical", label: "Critical" }]}
                        />
                      </td>
                      <td className="border-b border-hairline px-2 py-1"><EditableCell type="number" value={task.planned_hours ?? ""} onCommit={(v) => onPatchTask(task.id, { planned_hours: v })} /></td>
                      <td className="border-b border-hairline px-2 py-1"><BuildexactCostBadge match={task.buildexact_match} amount={task.planned_cost} /></td>
                      <td className="max-w-[180px] truncate border-b border-hairline px-2 py-1">{(task.depends_on || []).join(", ")}</td>
                      <td className="border-b border-hairline px-2 py-1">{task.buildexact_match ? "Buildexact" : task.template_id ? "Template" : "-"}</td>
                      <td className="border-b border-hairline px-2 py-1">{task.buildexact_line_item_id || "-"}</td>
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
