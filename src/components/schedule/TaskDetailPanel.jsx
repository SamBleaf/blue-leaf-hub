import { useState } from "react";
import BuildexactCostBadge from "./BuildexactCostBadge.jsx";
import ProcurementPanel from "./ProcurementPanel.jsx";
import { computeEndDate, previewRipple, taskStatusFromPercent } from "../../lib/scheduleUtils.js";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="caption mb-1 block">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "mt-0.5 w-full rounded border border-hairline bg-surface px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary";
const selectCls = "mt-0.5 w-full rounded border border-hairline bg-surface px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary";

export default function TaskDetailPanel({ task, tasks = [], phaseOptions = [], subcontractors = [], onChange, onClose, onSave, onDelete, onAskBlueprint, advice, busy }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [ripplePreview, setRipplePreview] = useState(null);

  if (!task) return null;
  const patch = (next) => onChange({ ...task, ...next });

  function handleStartDateChange(newDate) {
    patch({ start_date: newDate, end_date: computeEndDate(newDate, task.duration_days, task.task_type === "milestone" || task.is_hold_point) });
    if (task.id && tasks.length) {
      const preview = previewRipple(tasks, task.id, newDate);
      setRipplePreview(preview.affected.length > 1 ? preview : null);
    }
  }
  const setPercent = (value) => {
    const percent = Math.max(0, Math.min(100, Number(value) || 0));
    patch({ percent_complete: percent, status: taskStatusFromPercent(percent) });
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/40" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="h-full w-full max-w-md overflow-y-auto border-l border-hairline bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-hairline bg-surface px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="section-label">Task</span>
            <button type="button" onClick={onClose} className="rounded px-2 py-1 text-xs text-muted hover:bg-page">✕ Close</button>
          </div>
          <input
            value={task.name || ""}
            onChange={(e) => patch({ name: e.target.value })}
            className="mt-1 w-full border-0 bg-transparent p-0 text-lg font-bold text-ink focus:ring-0 placeholder:text-muted"
            placeholder="Task name"
          />
          {task.task_type && task.task_type !== "standard" ? (
            <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary capitalize">{task.task_type}</span>
          ) : null}
        </div>

        <div className="space-y-4 p-4">

          {/* ── Primary fields (always visible) ── */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input
                type="date"
                value={task.start_date || ""}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Duration (days)">
              <input
                type="number"
                min={0}
                value={task.duration_days ?? 0}
                onChange={(e) => patch({ duration_days: Number(e.target.value), end_date: computeEndDate(task.start_date, Number(e.target.value), task.task_type === "milestone" || task.is_hold_point) })}
                className={inputCls}
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                value={task.end_date || ""}
                onChange={(e) => patch({ end_date: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Trade">
              <input
                value={task.assignee_trade || task.trade || ""}
                onChange={(e) => patch({ assignee_trade: e.target.value, trade: e.target.value })}
                className={inputCls}
                placeholder="e.g. Framing"
              />
            </Field>
          </div>

          {/* Ripple preview */}
          {ripplePreview && ripplePreview.affected.length > 1 ? (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
              <span className="mt-0.5 text-warning text-sm">⚠</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-warning">Cascade preview</p>
                <p className="text-xs text-muted mt-0.5">
                  Changing this date will shift <strong>{ripplePreview.affected.length - 1}</strong> downstream task{ripplePreview.affected.length - 1 !== 1 ? "s" : ""}. Save to confirm.
                </p>
              </div>
              <button type="button" onClick={() => setRipplePreview(null)} className="text-xs text-muted hover:text-ink flex-shrink-0">✕</button>
            </div>
          ) : null}

          {/* Progress slider */}
          <div className="rounded-lg border border-hairline bg-page p-3">
            <div className="flex items-center justify-between">
              <span className="caption">Progress</span>
              <span className="font-mono text-sm font-semibold text-ink">{task.percent_complete || 0}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={task.percent_complete || 0}
              onChange={(e) => setPercent(e.target.value)}
              className="mt-2 w-full accent-accent"
            />
            <div className="mt-1 flex justify-between text-xs text-muted">
              <span>Not started</span>
              <span className="font-semibold text-ink capitalize">{task.status || "planned"}</span>
              <span>Complete</span>
            </div>
          </div>

          {/* Notes */}
          <Field label="Notes">
            <textarea
              value={task.notes || ""}
              onChange={(e) => patch({ notes: e.target.value })}
              rows={3}
              placeholder="Any notes for this task…"
              className={`${inputCls} resize-none`}
            />
          </Field>

          {/* ── Advanced section (collapsible) ── */}
          <div className="rounded-lg border border-hairline">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left"
            >
              <span className="section-label">Advanced</span>
              <span className="text-xs text-muted">{advancedOpen ? "Hide ▲" : "Show ▼"}</span>
            </button>

            {advancedOpen ? (
              <div className="space-y-3 border-t border-hairline p-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Phase">
                    <select value={task.phase || ""} onChange={(e) => patch({ phase: e.target.value })} className={selectCls}>
                      {phaseOptions.map((phase) => <option key={phase.value || phase} value={phase.value || phase}>{phase.label || phase}</option>)}
                    </select>
                  </Field>
                  <Field label="Task type">
                    <select
                      value={task.task_type || "standard"}
                      onChange={(e) => patch({ task_type: e.target.value, duration_days: e.target.value === "milestone" ? 0 : task.duration_days })}
                      className={selectCls}
                    >
                      <option value="standard">Standard</option>
                      <option value="milestone">Milestone</option>
                      <option value="procurement">Procurement</option>
                      <option value="inspection">Inspection</option>
                      <option value="approval">Approval</option>
                    </select>
                  </Field>
                  <Field label="Priority">
                    <select value={task.priority || "medium"} onChange={(e) => patch({ priority: e.target.value })} className={selectCls}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </Field>
                  <Field label="Subcontractor">
                    <select value={task.assigned_subcontractor_id || ""} onChange={(e) => patch({ assigned_subcontractor_id: e.target.value || null })} className={selectCls}>
                      <option value="">Unassigned</option>
                      {subcontractors.map((s) => <option key={s.id} value={s.id}>{s.business_name} ({s.trade})</option>)}
                    </select>
                  </Field>
                  <Field label="Planned hours">
                    <input type="number" min={0} value={task.planned_hours ?? ""} onChange={(e) => patch({ planned_hours: e.target.value === "" ? "" : Number(e.target.value) })} className={inputCls} />
                  </Field>
                  <Field label="Planned cost ($)">
                    <input type="number" min={0} value={task.planned_cost ?? ""} onChange={(e) => patch({ planned_cost: e.target.value === "" ? "" : Number(e.target.value) })} className={inputCls} />
                  </Field>
                </div>

                {task.buildexact_match ? (
                  <p className="rounded border border-primary/20 bg-page px-2 py-2 text-xs text-muted">
                    Buildexact: <BuildexactCostBadge match={task.buildexact_match} amount={task.planned_cost} />
                    <span className="ml-1">{task.buildexact_match.description}</span>
                  </p>
                ) : null}

                {/* Dependencies */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="section-label">Dependencies</span>
                    <button
                      type="button"
                      onClick={() => {
                        const available = tasks.filter((t) => t.id !== task.id && !(task.task_dependencies || []).some((d) => d.taskId === t.id));
                        if (!available.length) return;
                        patch({ task_dependencies: [...(task.task_dependencies || []), { taskId: available[0].id, type: "FS", lag: 0 }] });
                      }}
                      className="rounded px-2 py-0.5 text-xs text-accent hover:bg-page"
                    >
                      + Add
                    </button>
                  </div>
                  {(task.task_dependencies || []).length === 0 ? (
                    <p className="mt-1 text-xs italic text-muted">None set.</p>
                  ) : (
                    <div className="mt-1 overflow-hidden rounded border border-hairline">
                      <table className="w-full text-xs">
                        <thead className="bg-page text-muted">
                          <tr>
                            <th className="px-2 py-1.5 text-left font-semibold">Predecessor</th>
                            <th className="w-14 px-2 py-1.5 text-left font-semibold">Type</th>
                            <th className="w-12 px-2 py-1.5 text-left font-semibold">Lag</th>
                            <th className="w-6" />
                          </tr>
                        </thead>
                        <tbody>
                          {(task.task_dependencies || []).map((dep, i) => {
                            const predecessor = tasks.find((t) => t.id === dep.taskId);
                            return (
                              <tr key={dep.taskId} className="border-t border-hairline">
                                <td className="px-2 py-1">
                                  <select
                                    value={dep.taskId}
                                    onChange={(e) => {
                                      const next = [...(task.task_dependencies || [])];
                                      next[i] = { ...dep, taskId: e.target.value };
                                      patch({ task_dependencies: next });
                                    }}
                                    className="w-full rounded border border-hairline bg-surface px-1 py-0.5 text-xs"
                                  >
                                    {predecessor && <option value={predecessor.id}>{predecessor.name}</option>}
                                    {tasks.filter((t) => t.id !== task.id && (t.id === dep.taskId || !(task.task_dependencies || []).some((d) => d.taskId === t.id))).map((t) => (
                                      <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-2 py-1">
                                  <select
                                    value={dep.type || "FS"}
                                    onChange={(e) => {
                                      const next = [...(task.task_dependencies || [])];
                                      next[i] = { ...dep, type: e.target.value };
                                      patch({ task_dependencies: next });
                                    }}
                                    className="w-full rounded border border-hairline bg-surface px-1 py-0.5 text-xs"
                                  >
                                    <option value="FS">FS</option>
                                    <option value="SS">SS</option>
                                    <option value="FF">FF</option>
                                  </select>
                                </td>
                                <td className="px-2 py-1">
                                  <input
                                    type="number"
                                    value={dep.lag ?? 0}
                                    onChange={(e) => {
                                      const next = [...(task.task_dependencies || [])];
                                      next[i] = { ...dep, lag: Number(e.target.value) };
                                      patch({ task_dependencies: next });
                                    }}
                                    className="w-full rounded border border-hairline bg-surface px-1 py-0.5 text-xs"
                                  />
                                </td>
                                <td className="px-2 py-1 text-center">
                                  <button
                                    type="button"
                                    onClick={() => patch({ task_dependencies: (task.task_dependencies || []).filter((_, j) => j !== i) })}
                                    className="text-muted hover:text-danger"
                                  >
                                    ✕
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* Procurement panel */}
          <ProcurementPanel task={task} onChange={(next) => patch(next)} />

          {/* Blueprint advice */}
          <button
            type="button"
            onClick={onAskBlueprint}
            disabled={busy?.advice}
            className="w-full rounded-lg border border-primary/30 py-2 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
          >
            {busy?.advice ? "Asking Blueprint…" : "Ask Blueprint about this task"}
          </button>
          {advice ? (
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-hairline bg-page p-2 text-xs text-ink">{advice}</pre>
          ) : null}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 border-t border-hairline pt-4">
            <button type="button" onClick={onDelete} disabled={busy?.save} className="rounded-lg border border-danger/40 px-3 py-2 text-sm font-semibold text-danger hover:bg-danger/5">
              Delete
            </button>
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-hairline py-2 text-sm font-semibold text-ink hover:bg-page">
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={busy?.save || !task.name?.trim()}
              className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {busy?.save ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
