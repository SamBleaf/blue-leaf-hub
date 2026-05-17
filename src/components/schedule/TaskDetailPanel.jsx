import BuildexactCostBadge from "./BuildexactCostBadge.jsx";
import ProcurementPanel from "./ProcurementPanel.jsx";
import { computeEndDate, taskStatusFromPercent } from "../../lib/scheduleUtils.js";

export default function TaskDetailPanel({ task, tasks = [], phaseOptions = [], subcontractors = [], onChange, onClose, onSave, onDelete, onAskBlueprint, advice, busy }) {
  if (!task) return null;
  const patch = (next) => onChange({ ...task, ...next });
  const setPercent = (value) => {
    const percent = Math.max(0, Math.min(100, Number(value) || 0));
    patch({ percent_complete: percent, status: taskStatusFromPercent(percent) });
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/40" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-hairline bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Task detail</p>
            <input value={task.name || ""} onChange={(e) => patch({ name: e.target.value })} className="mt-1 w-full border-0 bg-transparent p-0 text-xl font-bold text-primary focus:ring-0" />
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-page">Close</button>
        </div>

        <section className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-muted">
            Phase
            <select value={task.phase || ""} onChange={(e) => patch({ phase: e.target.value })} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm">
              {phaseOptions.map((phase) => <option key={phase.value || phase} value={phase.value || phase}>{phase.label || phase}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-muted">
            Task type
            <select value={task.task_type || "standard"} onChange={(e) => patch({ task_type: e.target.value, duration_days: e.target.value === "milestone" ? 0 : task.duration_days })} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm">
              <option value="standard">Standard</option>
              <option value="milestone">Milestone</option>
              <option value="procurement">Procurement</option>
            </select>
          </label>
          <label className="block text-xs font-semibold text-muted">
            Start date
            <input type="date" value={task.start_date || ""} onChange={(e) => patch({ start_date: e.target.value, end_date: computeEndDate(e.target.value, task.duration_days, task.task_type === "milestone" || task.is_hold_point) })} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm" />
          </label>
          <label className="block text-xs font-semibold text-muted">
            End date
            <input type="date" value={task.end_date || ""} onChange={(e) => patch({ end_date: e.target.value })} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm" />
          </label>
          <label className="block text-xs font-semibold text-muted">
            Duration days
            <input type="number" min={0} value={task.duration_days ?? 0} onChange={(e) => patch({ duration_days: Number(e.target.value), end_date: computeEndDate(task.start_date, Number(e.target.value), task.task_type === "milestone" || task.is_hold_point) })} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm" />
          </label>
          <label className="block text-xs font-semibold text-muted">
            Priority
            <select value={task.priority || "medium"} onChange={(e) => patch({ priority: e.target.value })} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
        </section>

        <section className="mt-4 rounded-lg border border-hairline bg-page p-3">
          <label className="block text-xs font-semibold text-muted">
            % complete: <span className="font-mono text-ink">{task.percent_complete || 0}%</span>
            <input type="range" min={0} max={100} value={task.percent_complete || 0} onChange={(e) => setPercent(e.target.value)} className="mt-2 w-full" />
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-muted">
              Assigned trade
              <input value={task.assignee_trade || task.trade || ""} onChange={(e) => patch({ assignee_trade: e.target.value, trade: e.target.value })} className="mt-1 w-full rounded-lg border border-hairline bg-surface px-2 py-2 text-sm" />
            </label>
            <label className="block text-xs font-semibold text-muted">
              Subcontractor
              <select value={task.assigned_subcontractor_id || ""} onChange={(e) => patch({ assigned_subcontractor_id: e.target.value || null })} className="mt-1 w-full rounded-lg border border-hairline bg-surface px-2 py-2 text-sm">
                <option value="">Unassigned</option>
                {subcontractors.map((s) => <option key={s.id} value={s.id}>{s.business_name} ({s.trade})</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-muted">
              Planned hours
              <input type="number" min={0} value={task.planned_hours ?? ""} onChange={(e) => patch({ planned_hours: e.target.value === "" ? "" : Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-hairline bg-surface px-2 py-2 text-sm" />
            </label>
            <label className="block text-xs font-semibold text-muted">
              Planned cost
              <input type="number" min={0} value={task.planned_cost ?? ""} onChange={(e) => patch({ planned_cost: e.target.value === "" ? "" : Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-hairline bg-surface px-2 py-2 text-sm" />
            </label>
          </div>
          {task.buildexact_match ? (
            <p className="mt-3 rounded border border-primary/20 bg-surface px-2 py-2 text-xs text-muted">
              Buildexact: <BuildexactCostBadge match={task.buildexact_match} amount={task.planned_cost} /> <span className="ml-1">{task.buildexact_match.description}</span>
            </p>
          ) : null}
        </section>

        <ProcurementPanel task={task} onChange={(next) => patch(next)} />

        <section className="mt-4">
          <p className="text-xs font-semibold text-muted">Predecessors</p>
          <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-hairline bg-page p-2">
            {tasks.filter((t) => t.id !== task.id).map((other) => (
              <label key={other.id} className="flex items-center gap-2 border-b border-hairline py-1 text-xs last:border-b-0">
                <input
                  type="checkbox"
                  checked={(task.depends_on || []).includes(other.id)}
                  onChange={(e) => {
                    const cur = new Set(task.depends_on || []);
                    if (e.target.checked) cur.add(other.id);
                    else cur.delete(other.id);
                    patch({ depends_on: [...cur] });
                  }}
                />
                <span className="truncate">{other.name}</span>
              </label>
            ))}
          </div>
        </section>

        <label className="mt-4 block text-xs font-semibold text-muted">
          Notes
          <textarea value={task.notes || ""} onChange={(e) => patch({ notes: e.target.value })} rows={4} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm" />
        </label>

        <button type="button" onClick={onAskBlueprint} disabled={busy?.advice} className="mt-4 w-full rounded-lg border border-primary py-2 text-sm font-semibold text-primary disabled:opacity-50">
          {busy?.advice ? "Asking..." : "Ask Blueprint about this task"}
        </button>
        {advice ? <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-hairline bg-page p-2 text-xs text-ink">{advice}</pre> : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={onDelete} disabled={busy?.save} className="rounded-lg border border-danger/50 px-3 py-2 text-sm font-semibold text-danger">Delete task</button>
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-hairline py-2 text-sm font-semibold text-ink">Cancel</button>
          <button type="button" onClick={onSave} disabled={busy?.save || !task.name?.trim()} className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy?.save ? "Saving..." : "Save"}
          </button>
        </div>
      </aside>
    </div>
  );
}
