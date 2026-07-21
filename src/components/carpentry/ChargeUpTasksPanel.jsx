// =============================================================================
// ChargeUpTasksPanel — a lean task list for a BLB Charge Up site. Reuses the SAME
// site_tasks table + the SAME add / edit / complete / delete endpoints as a carpentry
// job (charge-up-scoped GET/POST + the id-scoped PATCH/DELETE /api/carpentry/tasks/:id),
// but a fit-for-charge-up UI — no budget-category dropdown, construction template, or
// transcript AI (those are job-only). Completion photos resolve via the shared mediaUrl.
// =============================================================================
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiPost, apiPatch, apiDelete } from "../../lib/apiFetch.js";
import { mediaUrl } from "../../lib/media.js";
import AssigneeStack from "../AssigneeStack.jsx";
import AssigneePickerSheet from "../AssigneePickerSheet.jsx";

const PRIORITIES = [
  { v: "urgent", l: "Urgent" },
  { v: "normal", l: "Normal" },
  { v: "when_time_permits", l: "When time permits" },
];
const PRIORITY_BADGE = {
  urgent: "bg-red-100 text-red-700",
  normal: "bg-slate-100 text-slate-600",
  when_time_permits: "bg-slate-50 text-muted",
};
const CATEGORIES = [
  { v: "general", l: "General" },
  { v: "defect", l: "Defect" },
  { v: "safety", l: "Safety" },
  { v: "materials", l: "Materials" },
  { v: "inspection", l: "Inspection" },
];
const EMPTY = { title: "", priority: "normal", category: "general", assignedTo: "", description: "" };

export default function ChargeUpTasksPanel({ siteId, canModerate = false }) {
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [enlarged, setEnlarged] = useState(null);
  const [pickerTask, setPickerTask] = useState(null);
  const [pickerSaving, setPickerSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await apiFetch(`/api/carpentry/charge-up-jobs/${siteId}/tasks`);
    setLoading(false);
    if (ok) setTasks(data?.tasks || []);
  }, [siteId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    apiFetch("/api/workforce/employees").then(({ ok, data }) => { if (ok) setEmployees((data?.employees || []).filter((e) => e.is_active !== false)); }).catch(() => {});
  }, []);

  async function addTask() {
    if (!form.title.trim()) return;
    setAdding(true); setError(null);
    const { ok, error: e } = await apiPost(`/api/carpentry/charge-up-jobs/${siteId}/tasks`, {
      title: form.title.trim(), description: form.description.trim() || undefined,
      priority: form.priority, category: form.category, assignedTo: form.assignedTo || undefined,
    });
    setAdding(false);
    if (!ok) { setError(e || "Could not add the task."); return; }
    setForm(EMPTY); setShowAdd(false);
    load();   // reload rather than splice the raw POST row (keeps camel shape consistent)
  }
  async function toggleDone(task) {
    const next = task.status === "done" || task.status === "blocked" ? "open" : "done";
    setTogglingId(task.id);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));   // optimistic
    const { ok } = await apiPatch(`/api/carpentry/tasks/${task.id}`, { status: next });
    setTogglingId(null);
    if (!ok) load();   // roll back to server truth on failure
  }
  async function deleteTask(task) {
    if (!confirm(`Remove task "${task.title}"?`)) return;
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    const { ok } = await apiDelete(`/api/carpentry/tasks/${task.id}`);
    if (!ok) load();
  }
  async function saveAssignees(workerIds) {
    if (!pickerTask) return;
    setPickerSaving(true); setError(null);
    const { ok, error: e } = await apiPost(`/api/carpentry/tasks/${pickerTask.id}/assignees`, { workerIds });
    setPickerSaving(false);
    if (!ok) { setError(e || "Could not update assignees."); return; }
    setPickerTask(null); load();
  }
  async function saveEdit() {
    if (!editTask?.title?.trim()) return;
    setSavingEdit(true);
    const { ok, error: e } = await apiPatch(`/api/carpentry/tasks/${editTask.id}`, {
      title: editTask.title.trim(), category: editTask.category, priority: editTask.priority,
    });
    setSavingEdit(false);
    if (!ok) { setError(e || "Could not save the task."); return; }
    setEditTask(null); load();
  }

  const open = tasks.filter((t) => t.status !== "done" && t.status !== "wont_do");
  const done = tasks.filter((t) => t.status === "done");

  const row = (task) => {
    const photo = mediaUrl(task);
    const isDone = task.status === "done";
    return (
      <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg border border-hairline bg-white">
        <button onClick={() => toggleDone(task)} disabled={togglingId === task.id}
          className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors disabled:opacity-40 ${isDone ? "border-accent bg-accent text-white" : "border-slate-300 hover:border-primary"}`}
          aria-label={isDone ? "Reopen" : "Mark done"}>
          {isDone && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="w-3 h-3"><path d="M20 6 9 17l-5-5" /></svg>}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-snug ${isDone ? "text-muted line-through" : "text-ink"}`}>{task.title}</p>
          {task.description && <p className="text-xs text-muted mt-0.5">{task.description}</p>}
          <div className="mt-1">
            <AssigneeStack assignees={task.assignees} size="xs" onClick={canModerate ? () => setPickerTask(task) : undefined} />
          </div>
          {isDone && task.completer?.name && <p className="text-[11px] text-emerald-700 mt-0.5">✓ {task.completer.name}</p>}
          {photo && (
            <button type="button" onClick={() => setEnlarged(photo)} className="mt-1.5 block" title="View photo">
              <img src={photo} alt="Completed work" className="w-16 h-16 rounded-lg object-cover border border-hairline" />
            </button>
          )}
        </div>
        <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${PRIORITY_BADGE[task.priority] || ""}`}>
          {PRIORITIES.find((p) => p.v === task.priority)?.l || task.priority}
        </span>
        {canModerate && (
          <>
            <button onClick={() => setEditTask({ id: task.id, title: task.title || "", category: task.category || "general", priority: task.priority || "normal" })}
              className="shrink-0 text-muted hover:text-primary text-xs px-1" title="Edit">✎</button>
            <button onClick={() => deleteTask(task)} className="shrink-0 text-muted hover:text-red-500 text-xs px-1" title="Remove">✕</button>
          </>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink">Tasks {open.length > 0 && <span className="text-muted font-normal">({open.length})</span>}</h3>
        {canModerate && (
          <button onClick={() => setShowAdd((v) => !v)} className="px-3 py-1.5 text-xs rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors">
            {showAdd ? "Cancel" : "+ Add task"}
          </button>
        )}
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-3">{error}</div>}

      {showAdd && canModerate && (
        <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-hairline space-y-2.5">
          <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="What needs doing?"
            onKeyDown={(e) => e.key === "Enter" && addTask()} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Detail (optional)"
            className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring resize-none" />
          <div className="grid grid-cols-3 gap-2">
            <select value={form.priority} onChange={(e) => set("priority", e.target.value)} className="border border-hairline rounded-lg px-2 py-2 text-sm focus-ring">
              {PRIORITIES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
            <select value={form.category} onChange={(e) => set("category", e.target.value)} className="border border-hairline rounded-lg px-2 py-2 text-sm focus-ring">
              {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
            <select value={form.assignedTo} onChange={(e) => set("assignedTo", e.target.value)} className="border border-hairline rounded-lg px-2 py-2 text-sm focus-ring">
              <option value="">Unassigned</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end">
            <button onClick={addTask} disabled={adding || !form.title.trim()} className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-40">
              {adding ? "Adding…" : "Add task"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">Loading tasks…</p>
      ) : open.length === 0 && done.length === 0 ? (
        <p className="text-sm text-muted">No tasks yet{canModerate ? " — add one above." : "."}</p>
      ) : (
        <div className="space-y-2">
          {open.map(row)}
          {done.length > 0 && (
            <>
              <button onClick={() => setShowDone((v) => !v)} className="text-xs text-muted hover:text-ink mt-2">
                {showDone ? "Hide" : "Show"} done ({done.length})
              </button>
              {showDone && <div className="space-y-2 mt-2">{done.map(row)}</div>}
            </>
          )}
        </div>
      )}

      {/* Edit sheet */}
      {editTask && (
        <div className="fixed inset-0 z-[10002] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditTask(null)} />
          <div className="relative bg-white rounded-t-xl sm:rounded-card w-full max-w-sm mx-0 sm:mx-4 p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-ink">Edit task</h4>
              <button onClick={() => setEditTask(null)} className="text-muted hover:text-ink text-lg leading-none" aria-label="Close">✕</button>
            </div>
            <input value={editTask.title} onChange={(e) => setEditTask((t) => ({ ...t, title: e.target.value }))} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
            <div className="grid grid-cols-2 gap-2">
              <select value={editTask.priority} onChange={(e) => setEditTask((t) => ({ ...t, priority: e.target.value }))} className="border border-hairline rounded-lg px-2 py-2 text-sm focus-ring">
                {PRIORITIES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
              <select value={editTask.category} onChange={(e) => setEditTask((t) => ({ ...t, category: e.target.value }))} className="border border-hairline rounded-lg px-2 py-2 text-sm focus-ring">
                {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
            </div>
            <div className="flex justify-end">
              <button onClick={saveEdit} disabled={savingEdit || !editTask.title.trim()} className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-40">
                {savingEdit ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo lightbox */}
      {enlarged && (
        <div className="fixed inset-0 z-[10002] bg-black/80 flex items-center justify-center p-6" onClick={() => setEnlarged(null)}>
          <img src={enlarged} alt="Completed work" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}

      {pickerTask && (
        <AssigneePickerSheet
          title="Assign to task"
          candidates={employees.map((e) => ({ id: e.id, name: e.name, trade: e.trade }))}
          initial={(pickerTask.assignees || []).map((a) => a.id)}
          saving={pickerSaving}
          onSave={saveAssignees}
          onClose={() => setPickerTask(null)}
        />
      )}
    </div>
  );
}
