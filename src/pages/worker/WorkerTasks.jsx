import { useEffect, useRef, useState } from "react";
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import WorkerLayout from "../../components/worker/WorkerLayout.jsx";
import { workerFetch, isWorkerPreview } from "../../lib/workerFetch.js";
import { uploadWorkerPhoto } from "../../lib/workerPhoto.js";
import { getSelectedJob, setSelectedJob } from "../../lib/workerJob.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS = {
  general:            "General",
  defect:             "Defect",
  safety:             "Safety",
  materials:          "Materials",
  inspection:         "Inspection",
  first_fix_framing:  "Framing",
  cladding:           "Cladding",
  second_fix:         "Second Fix",
  outdoor_works:      "Outdoor Works",
  formwork_slab_prep: "Formwork / Slab Prep",
  site_labouring:     "Site Labouring",
  site_cleanup:       "Site Cleanup",
  supervision:        "Supervision",
};

function categoryLabel(cat) {
  return CATEGORY_LABELS[cat] || cat;
}

function vibrate(ms) {
  try { navigator.vibrate?.(ms); } catch { /* ignore */ }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Tick({ checked, onToggle, disabled }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={checked ? "Mark undone" : "Mark done"}
      className={[
        "flex-shrink-0 w-6 h-6 rounded-full border-2 transition-all duration-150",
        "flex items-center justify-center",
        checked
          ? "bg-emerald-500 border-emerald-500"
          : "border-slate-300 hover:border-primary bg-white",
        "disabled:opacity-40",
      ].join(" ")}
    >
      {checked && (
        <svg viewBox="0 0 12 9" className="w-3 h-3" fill="none">
          <path d="M1 4.5L4.5 8L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function ProgressRing({ done, total }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? done / total : 0;
  const dash = circ * pct;
  return (
    <svg width={56} height={56} viewBox="0 0 56 56">
      <circle cx={28} cy={28} r={r} fill="none" stroke="#e5e7eb" strokeWidth={4} />
      <circle
        cx={28} cy={28} r={r} fill="none"
        stroke="#059669" strokeWidth={4}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        style={{ transform: "rotate(-90deg)", transformOrigin: "28px 28px", transition: "stroke-dasharray 0.3s ease" }}
      />
      <text x={28} y={28} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600} fill="#374151">
        {done}/{total}
      </text>
    </svg>
  );
}

function CategoryHeader({ label, done, total }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const complete = done === total && total > 0;
  return (
    <div className="flex items-center gap-3 mb-1 mt-4 first:mt-0">
      <p className={`text-xs font-semibold uppercase tracking-wide flex-1 ${complete ? "text-emerald-600" : "text-muted"}`}>
        {label}
      </p>
      <span className="text-xs font-medium text-muted tabular-nums">{done}/{total}</span>
      {pct > 0 && (
        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${complete ? "bg-emerald-500" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, myId, toggling, onToggle, onTap }) {
  const isDone = task.status === "done";
  return (
    <div className="flex items-center gap-3 bg-white border border-hairline rounded-lg px-3 py-3">
      <Tick checked={isDone} onToggle={onToggle} disabled={toggling} />
      <button type="button" onClick={onTap} className="flex-1 min-w-0 text-left">
        <p className={`text-sm leading-snug ${isDone ? "line-through text-muted" : "text-ink"}`}>{task.title}</p>
        {task.employees?.name && (
          <p className="text-xs text-muted mt-0.5">{task.assigned_to === myId ? "Your task" : task.employees.name}</p>
        )}
      </button>
    </div>
  );
}

function DoneRow({ task, myId, toggling, onToggle, onTap }) {
  return (
    <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-3">
      <Tick checked onToggle={onToggle} disabled={toggling} />
      <button type="button" onClick={onTap} className="flex-1 min-w-0 text-left">
        <p className="text-sm text-muted line-through leading-snug">{task.title}</p>
        {task.completed_at && (
          <p className="text-xs text-muted mt-0.5">
            Done {new Date(task.completed_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            {task.employees?.name && task.assigned_to !== myId ? ` · ${task.employees.name}` : ""}
          </p>
        )}
        {task.completion_notes && <p className="text-xs text-muted mt-0.5 italic">{task.completion_notes}</p>}
      </button>
    </div>
  );
}

function BlockedRow({ task, onTap }) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-3 text-left"
    >
      <span className="shrink-0 text-amber-500 font-bold text-sm leading-none">!</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink leading-snug">{task.title}</p>
        {task.completion_notes && <p className="text-xs text-amber-700 mt-0.5">{task.completion_notes}</p>}
      </div>
    </button>
  );
}

// Wraps a row with drag-to-reorder for supervisors/admins. The listeners live on a
// dedicated grip handle (touch-action:none on the handle only) so the list still scrolls
// and taps/ticks still work — press-and-drag the ⠿ handle to move a task.
function SortableTaskRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 20 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-1">
      <div className="flex-1 min-w-0">{children}</div>
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        style={{ touchAction: "none" }}
        className="shrink-0 px-2 flex items-center justify-center text-slate-300 hover:text-primary active:text-primary cursor-grab touch-none rounded-lg"
      >
        <span className="text-lg leading-none select-none">⠿</span>
      </button>
    </div>
  );
}

// Wraps the task area in a DndContext only when the viewer can reorder — regular workers
// get the plain list with zero drag overhead.
function DragArea({ canReorder, sensors, onDragEnd, children }) {
  if (!canReorder) return <>{children}</>;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      {children}
    </DndContext>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WorkerTasks() {
  const preview = isWorkerPreview();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [me, setMe] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [job, setJob] = useState(getSelectedJob());
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  // Task detail sheet
  const [sheet, setSheet] = useState(null);
  const [sheetNotes, setSheetNotes] = useState("");
  const [sheetPhotoPath, setSheetPhotoPath] = useState(null);
  const [sheetPhotoPreview, setSheetPhotoPreview] = useState(null);
  const [sheetPhotoBusy, setSheetPhotoBusy] = useState(false);
  const [sheetSaving, setSheetSaving] = useState(false);
  const [sheetBlockMode, setSheetBlockMode] = useState(false);

  // Add task sheet (supervisor / leading hand)
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addCategory, setAddCategory] = useState("general");
  const [addPriority, setAddPriority] = useState("normal");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState(null);

  const [showDone, setShowDone] = useState(false);

  const photoInputRef = useRef(null);

  const myId = me?.employee?.id;
  const isSupervisor = me?.employee?.is_leading_hand;

  // Load job list + me.
  useEffect(() => {
    let stop = false;
    Promise.all([
      workerFetch("/api/worker/jobs").then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) })),
      workerFetch("/api/worker/me").then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) })),
    ]).then(([jobsR, meR]) => {
      if (stop) return;
      if (jobsR.status === 401 || meR.status === 401) { setAuthError(true); return; }
      if (jobsR.body.ok) setJobs(jobsR.body.jobs || []);
      if (meR.body.ok) setMe(meR.body);
      if (!jobsR.body.ok && !meR.body.ok) setLoadError(true);
    }).catch(() => { if (!stop) setLoadError(true); }).finally(() => { if (!stop) setLoading(false); });
    return () => { stop = true; };
  }, []);

  // Load tasks when job changes.
  useEffect(() => {
    if (!job?.id) { setTasks([]); return; }
    let stop = false;
    setTasksLoading(true);
    workerFetch(`/api/worker/tasks?jobId=${encodeURIComponent(job.id)}&jobType=${encodeURIComponent(job.type || "")}`)
      .then(r => r.json())
      .then(j => { if (!stop && j.ok) setTasks(j.tasks || []); })
      .catch(() => {})
      .finally(() => { if (!stop) setTasksLoading(false); });
    return () => { stop = true; };
  }, [job?.id, job?.type]);

  function pickJob(j) {
    const next = { id: j.id, type: j.type, address: j.address };
    setJob(next);
    setSelectedJob(next);
    setShowJobPicker(false);
  }

  // Optimistic toggle done / open.
  async function toggleTask(task) {
    if (preview) return;
    const isDone = task.status === "done";
    const newStatus = isDone ? "open" : "done";
    setTogglingId(task.id);
    setTasks(prev => prev.map(t => t.id === task.id
      ? { ...t, status: newStatus, completed_at: newStatus === "done" ? new Date().toISOString() : null }
      : t
    ));
    if (!isDone) vibrate(15);
    try {
      const res = await workerFetch(`/api/worker/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const j = await res.json();
      if (!j.ok) {
        setTasks(prev => prev.map(t => t.id === task.id ? task : t));
        if (res.status === 401) alert("Your worker link has expired — ask the office for a new link.");
        else alert(j.error || "Couldn't update this task.");
      }
    } catch {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
      alert("Couldn't update — check your connection.");
    } finally {
      setTogglingId(null);
    }
  }

  function openSheet(task) {
    setSheet(task);
    setSheetNotes(task.completion_notes || "");
    setSheetPhotoPath(task.completion_photo_url || null);
    setSheetPhotoPreview(task.completion_photo_signed_url || null);
    setSheetBlockMode(false);
  }

  function closeSheet() {
    setSheet(null);
    setSheetNotes("");
    setSheetPhotoPath(null);
    setSheetPhotoPreview(null);
    setSheetBlockMode(false);
  }

  async function handleSheetPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !sheet) return;
    setSheetPhotoBusy(true);
    try {
      const path = await uploadWorkerPhoto(file, { entityType: "site_task", entityId: sheet.id });
      setSheetPhotoPath(path);
      setSheetPhotoPreview(URL.createObjectURL(file));
    } catch (err) {
      alert(err?.message || "Could not upload the photo");
    } finally {
      setSheetPhotoBusy(false);
    }
  }

  async function saveSheet(newStatus) {
    if (!sheet || preview) return;
    setSheetSaving(true);
    const body = {
      status: newStatus,
      ...(sheetNotes.trim() ? { completionNotes: sheetNotes.trim() } : {}),
      ...(sheetPhotoPath ? { completionPhotoUrl: sheetPhotoPath } : {}),
    };
    try {
      const res = await workerFetch(`/api/worker/tasks/${sheet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (j.ok) {
        setTasks(prev => prev.map(t => t.id === sheet.id
          ? {
              ...t,
              status: newStatus,
              completion_notes: sheetNotes.trim() || t.completion_notes,
              completion_photo_url: sheetPhotoPath || t.completion_photo_url,
              completed_at: newStatus === "done" ? (j.task?.completed_at || new Date().toISOString()) : null,
            }
          : t
        ));
        if (newStatus === "done") vibrate(15);
        closeSheet();
      } else {
        alert(res.status === 401
          ? "Your worker link has expired — ask the office for a new link."
          : (j.error || "Couldn't save. Please try again."));
      }
    } catch {
      alert("Couldn't save — check your connection.");
    } finally {
      setSheetSaving(false);
    }
  }

  async function addTask() {
    if (!addTitle.trim() || !job?.id) return;
    setAddBusy(true);
    setAddError(null);
    // Worker-token endpoint — a leading hand can add tasks onsite via magic link (no admin session).
    const res = await workerFetch(`/api/worker/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, title: addTitle.trim(), category: addCategory, priority: addPriority }),
    });
    const j = await res.json().catch(() => ({}));
    setAddBusy(false);
    if (j.ok) {
      setTasks(prev => [j.task, ...prev]);
      setAddTitle("");
      setAddCategory("general");
      setAddPriority("normal");
      setShowAddSheet(false);
    } else {
      setAddError(j.error || "Could not add task.");
    }
  }

  // ── Data slices ───────────────────────────────────────────────────────────────

  const urgentTasks    = tasks.filter(t => t.status !== "done" && t.status !== "wont_do" && t.status !== "blocked" && t.priority === "urgent");
  const blockedTasks   = tasks.filter(t => t.status === "blocked");
  const doneTasks      = tasks.filter(t => t.status === "done");
  const activeTasks    = tasks.filter(t => t.status !== "done" && t.status !== "wont_do" && t.status !== "blocked" && t.priority !== "urgent");

  const byCategory = {};
  for (const t of activeTasks) {
    const cat = t.category || "general";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(t);
  }
  // Done tasks grouped by category too, so a fully-completed category still shows (with its rows,
  // so a mis-tick can be undone right there) instead of silently vanishing. Active cats first.
  const doneByCategory = {};
  for (const t of doneTasks) {
    const cat = t.category || "general";
    if (!doneByCategory[cat]) doneByCategory[cat] = [];
    doneByCategory[cat].push(t);
  }
  const categoryOrder = [...new Set([...Object.keys(byCategory), ...Object.keys(doneByCategory)])];

  function categoryProgress(cat) {
    const all = tasks.filter(t => (t.category || "general") === cat && t.status !== "wont_do");
    return { done: all.filter(t => t.status === "done").length, total: all.length };
  }

  const totalActive = tasks.filter(t => t.status !== "wont_do").length;
  const totalDone   = doneTasks.length;

  // ── Drag-to-reorder (supervisors / admins) ─────────────────────────────────────
  // A leading hand on their worker link, or an admin previewing, can hold-drag the ⠿
  // handle to reorder tasks within a group. The new order persists and every worker sees it.
  const canReorder = !!(isSupervisor || preview);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

  async function persistOrder(nextTasks, prevTasks) {
    if (!job?.id) return;
    try {
      const res = await workerFetch("/api/worker/tasks/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, jobType: job.type || "", orderedIds: nextTasks.map(t => t.id) }),
      });
      if (!res.ok) throw new Error("reorder failed");
    } catch {
      setTasks(prevTasks); // revert to the last known-good order
      alert("Couldn't save the new order — please try again.");
    }
  }

  function onDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // Reorder only within the same visible group (Hit List, or one category).
    const groups = [urgentTasks.map(t => t.id), ...categoryOrder.map(cat => (byCategory[cat] || []).map(t => t.id))];
    const group = groups.find(g => g.includes(active.id));
    if (!group || !group.includes(over.id)) return;
    const oldIndex = tasks.findIndex(t => t.id === active.id);
    const newIndex = tasks.findIndex(t => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const prev = tasks;
    const next = arrayMove(tasks, oldIndex, newIndex);
    setTasks(next);
    vibrate(10);
    persistOrder(next, prev);
  }

  // Render a task list either as a sortable group (supervisors/admins) or plain rows.
  function renderTaskRows(list) {
    if (!canReorder) {
      return list.map(t => (
        <TaskRow key={t.id} task={t} myId={myId} toggling={togglingId === t.id} onToggle={() => toggleTask(t)} onTap={() => openSheet(t)} />
      ));
    }
    return (
      <SortableContext items={list.map(t => t.id)} strategy={verticalListSortingStrategy}>
        {list.map(t => (
          <SortableTaskRow key={t.id} id={t.id}>
            <TaskRow task={t} myId={myId} toggling={togglingId === t.id} onToggle={() => toggleTask(t)} onTap={() => openSheet(t)} />
          </SortableTaskRow>
        ))}
      </SortableContext>
    );
  }

  // ── Loading / error ───────────────────────────────────────────────────────────

  if (loading) {
    return <WorkerLayout><div className="flex items-center justify-center pt-24 text-muted text-sm">Loading…</div></WorkerLayout>;
  }
  if (authError) {
    return (
      <WorkerLayout>
        <div className="px-6 pt-20 text-center">
          <h1 className="text-base font-bold text-ink mb-2">Your link has expired</h1>
          <p className="text-sm text-muted">This worker link is no longer valid or has been reset.<br />Please ask your site supervisor for a new link.</p>
        </div>
      </WorkerLayout>
    );
  }
  if (loadError) {
    return (
      <WorkerLayout>
        <div className="px-6 pt-20 text-center">
          <p className="text-sm text-muted mb-3">Couldn&apos;t load your tasks.</p>
          <button type="button" onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold">Try again</button>
        </div>
      </WorkerLayout>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <WorkerLayout>
      <div className="px-4 pt-5 pb-24">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-base font-bold text-ink">Today&apos;s job tasks</h1>
            {job && <p className="text-xs text-muted mt-0.5 truncate max-w-[200px]">{job.address}</p>}
          </div>
          {totalActive > 0 && <ProgressRing done={totalDone} total={totalActive} />}
        </div>

        {/* Job selector */}
        <button
          type="button"
          onClick={() => setShowJobPicker(true)}
          className="w-full flex items-center justify-between gap-2 mb-4 px-3 py-2.5 rounded-lg bg-white border border-hairline text-left"
        >
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold text-muted uppercase tracking-wide">Job</span>
            <span className={`block text-sm font-medium truncate ${job ? "text-ink" : "text-muted"}`}>
              {job ? job.address : "Select a job"}
            </span>
          </span>
          <span className="text-primary text-sm font-semibold shrink-0">Change ▾</span>
        </button>

        {/* Supervisor add task button */}
        {job && isSupervisor && (
          <button
            type="button"
            onClick={() => setShowAddSheet(true)}
            className="w-full mb-4 py-2.5 rounded-lg border border-dashed border-primary text-primary text-sm font-semibold text-center hover:bg-primary/5 transition-colors"
          >
            + Add task
          </button>
        )}

        {!job ? (
          <div className="text-center mt-10">
            <p className="text-sm text-muted">Select a job to see its tasks.</p>
            <button type="button" onClick={() => setShowJobPicker(true)} className="mt-3 inline-block px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold">Choose a job</button>
          </div>
        ) : tasksLoading ? (
          <p className="text-sm text-muted text-center mt-10">Loading tasks…</p>
        ) : totalActive === 0 && totalDone === 0 ? (
          <p className="text-sm text-muted text-center mt-10">No tasks on this job yet.</p>
        ) : (
          <DragArea canReorder={canReorder} sensors={sensors} onDragEnd={onDragEnd}>
            {/* Whole-list payoff — the achievement moment when everything's ticked off */}
            {totalActive > 0 && totalDone === totalActive && (
              <div className="mb-5 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
                <p className="text-sm font-bold text-emerald-700">All tasks done — great work today.</p>
                <p className="text-xs text-emerald-600 mt-0.5">{totalDone} task{totalDone === 1 ? "" : "s"} smashed.</p>
              </div>
            )}
            {canReorder && totalActive > totalDone && (
              <p className="text-[11px] text-muted mb-3 flex items-center gap-1">
                <span className="text-slate-400">⠿</span> Hold and drag the handle to set the order workers see.
              </p>
            )}
            {/* Hit List — urgent, ungrouped, top */}
            {urgentTasks.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Hit List</p>
                <div className="space-y-2">
                  {renderTaskRows(urgentTasks)}
                </div>
              </div>
            )}

            {/* Per-category groups (completed categories stay, showing the payoff + their rows) */}
            {categoryOrder.map(cat => {
              const { done, total } = categoryProgress(cat);
              const allDone = done === total && total > 0;
              const rows = allDone ? (doneByCategory[cat] || []) : (byCategory[cat] || []);
              return (
                <div key={cat}>
                  <CategoryHeader label={categoryLabel(cat)} done={done} total={total} />
                  {allDone && <p className="text-xs text-emerald-600 font-medium mb-2">{categoryLabel(cat)} tasks complete. Nice work.</p>}
                  <div className="space-y-2 mb-2">
                    {allDone
                      ? rows.map(t => (
                          <TaskRow key={t.id} task={t} myId={myId} toggling={togglingId === t.id} onToggle={() => toggleTask(t)} onTap={() => openSheet(t)} />
                        ))
                      : renderTaskRows(rows)}
                  </div>
                </div>
              );
            })}

            {/* Blocked */}
            {blockedTasks.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Blocked</p>
                <div className="space-y-2">
                  {blockedTasks.map(t => (
                    <BlockedRow key={t.id} task={t} onTap={() => openSheet(t)} />
                  ))}
                </div>
              </div>
            )}

            {/* Done (collapsed) */}
            {doneTasks.length > 0 && (
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setShowDone(v => !v)}
                  className="text-sm text-muted font-medium flex items-center gap-1.5"
                >
                  <span className="text-emerald-500 text-xs">✓</span>
                  Completed ({doneTasks.length}) {showDone ? "▲" : "▼"}
                </button>
                {showDone && (
                  <div className="mt-2 space-y-2">
                    {doneTasks.map(t => (
                      <DoneRow key={t.id} task={t} myId={myId} toggling={togglingId === t.id} onToggle={() => toggleTask(t)} onTap={() => openSheet(t)} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </DragArea>
        )}
      </div>

      {/* ── Job picker ──────────────────────────────────────────────────────── */}
      {showJobPicker && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowJobPicker(false)} />
          <div className="relative w-full bg-white rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto">
            <h3 className="text-base font-bold text-ink mb-3">Choose a job</h3>
            {jobs.length === 0 ? (
              <p className="text-sm text-muted">No active jobs found.</p>
            ) : (
              <div className="divide-y divide-hairline">
                {jobs.map(j => (
                  <button
                    key={`${j.type}-${j.id}`}
                    type="button"
                    onClick={() => pickJob(j)}
                    className="w-full flex items-center gap-3 py-3 text-left"
                  >
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm truncate ${job?.id === j.id ? "font-semibold text-primary" : "text-ink"}`}>{j.address}</span>
                      <span className="block text-xs text-muted">{j.type === "carpentry" ? "Carpentry" : "Construction"}{j.recent ? " · recent" : ""}</span>
                    </span>
                    {job?.id === j.id && <span className="text-primary shrink-0">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Task detail sheet ────────────────────────────────────────────────── */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={closeSheet} />
          <div className="relative w-full bg-white rounded-t-2xl p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0 mr-3">
                <h3 className="text-base font-bold text-ink leading-snug">{sheet.title}</h3>
                {sheet.description && <p className="text-sm text-muted mt-1">{sheet.description}</p>}
                {sheet.completion_notes && !sheetBlockMode && (
                  <p className="text-xs text-muted mt-1 italic">{sheet.completion_notes}</p>
                )}
              </div>
              <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                sheet.status === "blocked"    ? "bg-amber-100 text-amber-700" :
                sheet.status === "done"       ? "bg-emerald-100 text-emerald-700" :
                sheet.priority === "urgent"   ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
              }`}>
                {sheet.status === "blocked" ? "Blocked" : sheet.status === "done" ? "Done" : (sheet.priority || "").replace(/_/g, " ")}
              </span>
            </div>

            {!sheetBlockMode ? (
              <>
                <textarea
                  placeholder="Add a note (optional)"
                  value={sheetNotes}
                  onChange={e => setSheetNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 mb-3"
                />
                {sheetPhotoPreview && (
                  <img src={sheetPhotoPreview} alt="Completion photo" className="w-full max-h-48 object-cover rounded-lg border border-hairline mb-3" />
                )}
                <div className="flex gap-2 flex-wrap">
                  {sheet.status !== "done" && (
                    <button
                      type="button"
                      onClick={() => saveSheet("done")}
                      disabled={preview || sheetSaving}
                      className="flex-1 py-3 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50"
                    >
                      {preview ? "Read-only preview" : sheetSaving ? "Saving…" : "Mark done"}
                    </button>
                  )}
                  {sheet.status === "done" && (
                    <button
                      type="button"
                      onClick={() => saveSheet("open")}
                      disabled={preview || sheetSaving}
                      className="flex-1 py-3 rounded-lg border border-hairline text-ink text-sm font-semibold disabled:opacity-50"
                    >
                      {sheetSaving ? "Saving…" : "Mark undone"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={sheetPhotoBusy || sheetSaving}
                    className="px-4 py-3 rounded-lg border border-hairline text-ink text-sm font-medium disabled:opacity-50"
                  >
                    {sheetPhotoBusy ? "Uploading…" : sheetPhotoPath ? "Photo ✓" : "Add photo"}
                  </button>
                  {sheet.status !== "done" && (
                    <button
                      type="button"
                      onClick={() => setSheetBlockMode(true)}
                      className="px-4 py-3 rounded-lg border border-amber-300 text-amber-700 text-sm font-medium"
                    >
                      Blocked
                    </button>
                  )}
                  <button type="button" onClick={closeSheet} className="px-4 py-3 rounded-lg border border-hairline text-muted text-sm font-medium">
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-ink font-medium mb-2">What&apos;s blocking this task?</p>
                <textarea
                  placeholder="e.g. Waiting on material — fascia brackets"
                  value={sheetNotes}
                  onChange={e => setSheetNotes(e.target.value)}
                  rows={3}
                  autoFocus
                  className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-amber-300 mb-3"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => saveSheet("blocked")}
                    disabled={!sheetNotes.trim() || sheetSaving}
                    className="flex-1 py-3 rounded-lg bg-amber-500 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {sheetSaving ? "Saving…" : "Mark blocked"}
                  </button>
                  <button type="button" onClick={() => setSheetBlockMode(false)} className="px-4 py-3 rounded-lg border border-hairline text-ink text-sm font-medium">
                    Back
                  </button>
                </div>
              </>
            )}

            <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleSheetPhoto} />
          </div>
        </div>
      )}

      {/* ── Add task sheet (supervisor / leading hand) ───────────────────────── */}
      {showAddSheet && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddSheet(false)} />
          <div className="relative w-full bg-white rounded-t-2xl p-5">
            <h3 className="text-base font-bold text-ink mb-4">Add task</h3>
            {addError && <p className="text-sm text-red-600 mb-3">{addError}</p>}
            <input
              value={addTitle}
              onChange={e => setAddTitle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addTask()}
              placeholder="Task title"
              autoFocus
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 mb-3"
            />
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Category</label>
                <select value={addCategory} onChange={e => setAddCategory(e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none bg-white">
                  {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Priority</label>
                <select value={addPriority} onChange={e => setAddPriority(e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none bg-white">
                  <option value="urgent">Urgent</option>
                  <option value="normal">Normal</option>
                  <option value="when_time_permits">When time permits</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={addTask} disabled={addBusy || !addTitle.trim()} className="flex-1 py-3 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50">
                {addBusy ? "Adding…" : "Add task"}
              </button>
              <button type="button" onClick={() => { setShowAddSheet(false); setAddTitle(""); setAddError(null); }} className="px-5 py-3 rounded-lg border border-hairline text-ink text-sm font-medium">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </WorkerLayout>
  );
}
