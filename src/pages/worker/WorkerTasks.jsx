import { useEffect, useRef, useState } from "react";
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import WorkerLayout from "../../components/worker/WorkerLayout.jsx";
import { workerFetch, isWorkerPreview } from "../../lib/workerFetch.js";
import { uploadWorkerPhoto } from "../../lib/workerPhoto.js";
import { getSelectedJob, setSelectedJob } from "../../lib/workerJob.js";
import PlansSheet from "../../components/worker/PlansSheet.jsx";
import AssigneeStack from "../../components/AssigneeStack.jsx";
import AssigneePickerSheet from "../../components/AssigneePickerSheet.jsx";

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

function firstName(n) {
  return String(n || "").trim().split(/\s+/)[0] || "?";
}

function vibrate(ms) {
  try { navigator.vibrate?.(ms); } catch { /* ignore */ }
}

// Press-and-hold gesture (leading hand → edit a task). Returns pointer handlers to spread onto a
// row's tap target plus consumeClick(), which swallows the click that follows a fired long-press so
// the tap (open detail sheet) doesn't also run. onHold falsy → inert (regular workers keep plain tap).
function useLongPress(onHold, ms = 500) {
  const timer = useRef(null);
  const fired = useRef(false);
  const start = useRef(null);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  if (!onHold) return { handlers: {}, consumeClick: () => false };
  return {
    handlers: {
      onPointerDown: (e) => {
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = setTimeout(() => { fired.current = true; vibrate(15); onHold(); }, ms);
      },
      onPointerMove: (e) => {
        if (timer.current && start.current && (Math.abs(e.clientX - start.current.x) > 10 || Math.abs(e.clientY - start.current.y) > 10)) clear();
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      onContextMenu: (e) => e.preventDefault(),
    },
    consumeClick: () => { if (fired.current) { fired.current = false; return true; } return false; },
  };
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

function TaskRow({ task, myId, isLeadingHand, toggling, onToggle, onTap, onAssign, onHold }) {
  const isDone = task.status === "done";
  const { handlers, consumeClick } = useLongPress(onHold);
  return (
    <div className="flex items-center gap-3 bg-white border border-hairline rounded-lg px-3 py-3">
      <Tick checked={isDone} onToggle={onToggle} disabled={toggling} />
      <button
        type="button"
        onClick={(e) => { if (consumeClick()) { e.preventDefault(); return; } onTap(); }}
        {...handlers}
        className="flex-1 min-w-0 text-left select-none"
      >
        <p className={`text-sm leading-snug ${isDone ? "line-through text-muted" : "text-ink"}`}>{task.title}</p>
        {/* Multi-assign: leading hand sees every task's stack; a worker on the task sees who else
            is on it (co-assignee first names) so they know who they're working with. */}
        {isLeadingHand ? (
          <div className="mt-1"><AssigneeStack assignees={task.assignees || []} size="xs" meId={myId} /></div>
        ) : (task.assignees || []).some(a => a.id === myId) ? (
          (task.assignees || []).length > 1 ? (
            <div className="mt-1 flex items-center gap-1.5 min-w-0">
              <AssigneeStack assignees={task.assignees || []} size="xs" meId={myId} />
              <span className="text-xs text-primary font-medium truncate">with {(task.assignees || []).filter(a => a.id !== myId).map(a => firstName(a.name)).join(", ")}</span>
            </div>
          ) : (
            <p className="text-xs text-primary font-medium mt-0.5">Assigned to you</p>
          )
        ) : null}
      </button>
      {/* C3: assign affordance — leading hand only */}
      {isLeadingHand && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onAssign(); }}
          aria-label="Assign task"
          className="shrink-0 px-2 py-1 rounded-md border border-slate-200 text-xs text-muted hover:text-primary hover:border-primary transition-colors"
        >
          {(task.assignees || []).length ? "Re-assign" : "Assign"}
        </button>
      )}
    </div>
  );
}

function DoneRow({ task, isLeadingHand, toggling, onToggle, onTap, onHold }) {
  // C4: leading hand sees who completed the task + when; regular workers see plain "Done" date.
  const completedDate = task.completed_at
    ? new Date(task.completed_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })
    : null;
  // Prefer completed_by name embed (completer); fall back to assigned_to embed (employees).
  const completedByName = task.completer?.name || null;
  const { handlers, consumeClick } = useLongPress(onHold);
  return (
    <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-3">
      <Tick checked onToggle={onToggle} disabled={toggling} />
      <button type="button" onClick={(e) => { if (consumeClick()) { e.preventDefault(); return; } onTap(); }} {...handlers} className="flex-1 min-w-0 text-left select-none">
        <p className="text-sm text-muted line-through leading-snug">{task.title}</p>
        {completedDate && (
          <p className="text-xs text-muted mt-0.5">
            {isLeadingHand && completedByName
              ? `Done by ${completedByName} · ${completedDate}`
              : `Done ${completedDate}`}
          </p>
        )}
        {task.completion_notes && <p className="text-xs text-muted mt-0.5 italic">{task.completion_notes}</p>}
      </button>
    </div>
  );
}

function BlockedRow({ task, onTap, onHold }) {
  const { handlers, consumeClick } = useLongPress(onHold);
  return (
    <button
      type="button"
      onClick={(e) => { if (consumeClick()) { e.preventDefault(); return; } onTap(); }}
      {...handlers}
      className="w-full flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-3 text-left select-none"
    >
      <span className="shrink-0 text-amber-500 font-bold text-sm leading-none">!</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink leading-snug">{task.title}</p>
        {task.completion_notes && <p className="text-xs text-amber-700 mt-0.5">{task.completion_notes}</p>}
      </div>
    </button>
  );
}

// Shared editor for a task's name / info / category. Used both for a draft (before adding, saves
// locally) and an already-added task (leading hand hold-to-edit, saves via PATCH). onSave receives
// { title, description, category }.
function TaskEditSheet({ heading = "Edit task", initial, saving, error, onSave, onClose }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [category, setCategory] = useState(initial?.category || "general");
  return (
    <div className="fixed inset-0 z-[60] flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-2xl p-5 max-h-[85vh] overflow-y-auto">
        <h3 className="text-base font-bold text-ink mb-4">{heading}</h3>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <label className="block text-xs font-medium text-muted mb-1">Task name</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          autoFocus
          placeholder="Task name"
          className="w-full border border-hairline rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 mb-3"
        />
        <label className="block text-xs font-medium text-muted mb-1">Info / notes</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          placeholder="Extra detail (optional)"
          className="w-full border border-hairline rounded-lg px-3 py-2 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 mb-3"
        />
        <label className="block text-xs font-medium text-muted mb-1">Category</label>
        <select value={category} onChange={e => setCategory(e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm bg-white focus:outline-none mb-4">
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSave({ title: title.trim(), description: description.trim(), category })}
            disabled={saving || !title.trim()}
            className="flex-1 py-3 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} className="px-5 py-3 rounded-lg border border-hairline text-ink text-sm font-medium">
            Cancel
          </button>
        </div>
      </div>
    </div>
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
  const [chargeUpSites, setChargeUpSites] = useState([]);   // Charge Up: sub-sites under the BL-CHARGEUP job
  const [chargeUpJobId, setChargeUpJobId] = useState("");   // the picked site — it OWNS the tasks
  const [plansOpen, setPlansOpen] = useState(false);
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

  // C3: assign-task sheet (leading hand only)
  const [assignTask, setAssignTask] = useState(null);   // task being assigned
  const [crew, setCrew] = useState([]);
  const [crewLoading, setCrewLoading] = useState(false);
  const [crewShowAll, setCrewShowAll] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);

  // From-transcript sheet (leading hand only)
  const [showTranscriptSheet, setShowTranscriptSheet] = useState(false);
  const [transcriptText, setTranscriptText] = useState("");
  const [transcriptBusy, setTranscriptBusy] = useState(false);
  const [transcriptError, setTranscriptError] = useState(null);
  const [draftTasks, setDraftTasks] = useState([]);       // [{ title, category, priority, description, kept }]
  const [bulkAdding, setBulkAdding] = useState(false);
  const [editDraftIndex, setEditDraftIndex] = useState(null);   // which draft is being edited (tap)

  // Edit an already-added task (leading hand hold-to-edit): name / info / category.
  const [editTask, setEditTask] = useState(null);
  const [editTaskSaving, setEditTaskSaving] = useState(false);
  const [editTaskError, setEditTaskError] = useState(null);

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

  // Charge Up jobs hold sub-sites; load them so the worker can pick a location (same as Log Hours).
  // A charge-up site OWNS its tasks, so tasks are scoped to the picked site, not the parent job.
  useEffect(() => {
    setChargeUpSites([]); setChargeUpJobId("");
    if (!job?.id || job.type !== "carpentry") return;
    let stop = false;
    workerFetch(`/api/worker/jobs/${encodeURIComponent(job.id)}/subtasks`)
      .then(r => r.json())
      .then(j => { if (!stop && j?.ok && (j.chargeUpSites || []).length) setChargeUpSites(j.chargeUpSites); })
      .catch(() => {});
    return () => { stop = true; };
  }, [job?.id, job?.type]);

  // Load tasks when job (or the picked charge-up site) changes.
  useEffect(() => {
    if (!job?.id) { setTasks([]); return; }
    const chargeUp = chargeUpSites.length > 0;
    if (chargeUp && !chargeUpJobId) { setTasks([]); return; }   // wait for a location pick
    let stop = false;
    setTasksLoading(true);
    const cu = chargeUpJobId ? `&chargeUpJobId=${encodeURIComponent(chargeUpJobId)}` : "";
    workerFetch(`/api/worker/tasks?jobId=${encodeURIComponent(job.id)}&jobType=${encodeURIComponent(job.type || "")}${cu}`)
      .then(r => r.json())
      .then(j => { if (!stop && j.ok) setTasks(j.tasks || []); })
      .catch(() => {})
      .finally(() => { if (!stop) setTasksLoading(false); });
    return () => { stop = true; };
  }, [job?.id, job?.type, chargeUpSites.length, chargeUpJobId]);

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
    // Persist any note edit before closing so notes stick even without a status-button tap.
    if (sheet && !preview && sheetNotes.trim() !== (sheet.completion_notes || "").trim()) {
      persistSheetDetail(sheet.id, { completionNotes: sheetNotes.trim() || null });
    }
    setSheet(null);
    setSheetNotes("");
    setSheetPhotoPath(null);
    setSheetPhotoPreview(null);
    setSheetBlockMode(false);
  }

  // Persist a photo/note change to the task straight away, WITHOUT changing status, and reflect it
  // in the local list. This is the core fix for orphaned sign-off photos: previously the completion
  // photo/note only saved via the status buttons, so a worker who added a photo and closed the sheet
  // (or ticked the task with the circle) uploaded the file to storage but never linked it to the task.
  async function persistSheetDetail(taskId, patch) {
    if (!taskId || preview) return;
    try {
      const res = await workerFetch(`/api/worker/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await res.json().catch(() => ({}));
      if (j.ok) {
        setTasks((prev) => prev.map((t) => t.id === taskId ? {
          ...t,
          ...(patch.completionPhotoUrl !== undefined ? { completion_photo_url: patch.completionPhotoUrl } : {}),
          ...(patch.completionNotes  !== undefined ? { completion_notes:  patch.completionNotes  } : {}),
        } : t));
      }
    } catch { /* best-effort — saveSheet still sends these on a status change */ }
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
      // Link the photo to the task immediately — don't wait for a status-button tap.
      await persistSheetDetail(sheet.id, { completionPhotoUrl: path });
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
    if (chargeUpSites.length > 0 && !chargeUpJobId) return;   // charge-up needs a location
    setAddBusy(true);
    setAddError(null);
    // Worker-token endpoint — a leading hand can add tasks onsite via magic link (no admin session).
    const res = await workerFetch(`/api/worker/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, chargeUpJobId: chargeUpJobId || undefined, title: addTitle.trim(), category: addCategory, priority: addPriority }),
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

  // ── C3: assign task (leading hand only) ──────────────────────────────────────

  // Crew scope: default to who's rostered to this site TODAY (crew/day), with a "show all" fallback.
  async function loadCrew(showAll) {
    setCrewLoading(true);
    try {
      const t = new Date();
      const dk = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
      const url = showAll
        ? `/api/worker/jobs/${encodeURIComponent(job.id)}/crew?jobType=${encodeURIComponent(job.type || "")}`
        : `/api/worker/crew/day?date=${dk}&jobId=${encodeURIComponent(job.id)}&jobType=${encodeURIComponent(job.type || "")}`;
      const res = await workerFetch(url);
      const j = await res.json().catch(() => ({}));
      if (j.ok) setCrew((j.crew || []).map((c) => ({ id: c.employeeId || c.id, name: c.name, trade: c.trade })));
    } catch { /* non-fatal — picker shows empty */ }
    finally { setCrewLoading(false); }
  }
  function openAssignSheet(task) {
    setAssignTask(task);
    setCrewShowAll(false);
    setCrew([]);
    loadCrew(false);
  }
  function showAllCrew() { setCrewShowAll(true); loadCrew(true); }

  async function doAssignMulti(workerIds) {
    if (!assignTask || preview) return;
    setAssignBusy(true);
    try {
      const res = await workerFetch(`/api/worker/tasks/${assignTask.id}/assignees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerIds }),
      });
      const j = await res.json().catch(() => ({}));
      if (j.ok) {
        const updated = j.task;
        setTasks(prev => prev.map(t => t.id === assignTask.id
          ? { ...t, assignees: updated?.assignees || [], assigned_to: updated?.assigned_to ?? null, employees: updated?.employees ?? null }
          : t
        ));
        setAssignTask(null);
      } else {
        alert(res.status === 403 ? (j.error || "Only a leading hand can assign tasks.") : (j.error || "Could not update assignees."));
      }
    } catch {
      alert("Couldn't save — check your connection.");
    } finally {
      setAssignBusy(false);
    }
  }

  // ── From-transcript (leading hand only) ──────────────────────────────────────

  async function extractTasks() {
    if (!transcriptText.trim() || !job?.id) return;
    setTranscriptBusy(true);
    setTranscriptError(null);
    setDraftTasks([]);
    try {
      const res = await workerFetch("/api/worker/tasks/from-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcriptText.trim(), jobId: job.id, jobType: job.type || "" }),
      });
      const j = await res.json().catch(() => ({}));
      if (j.ok && Array.isArray(j.tasks)) {
        setDraftTasks(j.tasks.map(t => ({ ...t, kept: true })));
      } else {
        setTranscriptError(j.error || "Could not extract tasks.");
      }
    } catch {
      setTranscriptError("Couldn't reach the server — check your connection.");
    } finally {
      setTranscriptBusy(false);
    }
  }

  async function bulkAddDrafts() {
    const toAdd = draftTasks.filter(t => t.kept);
    if (!toAdd.length || !job?.id) return;
    setBulkAdding(true);
    let added = 0;
    for (const draft of toAdd) {
      try {
        const res = await workerFetch("/api/worker/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: job.id, chargeUpJobId: chargeUpJobId || undefined, title: draft.title, description: draft.description || undefined, category: draft.category || "general", priority: draft.priority || "normal" }),
        });
        const j = await res.json().catch(() => ({}));
        if (j.ok && j.task) {
          setTasks(prev => [j.task, ...prev]);
          added++;
        }
      } catch { /* continue adding remaining */ }
    }
    setBulkAdding(false);
    setShowTranscriptSheet(false);
    setDraftTasks([]);
    setTranscriptText("");
    if (added > 0) {
      // Simple toast via alert — matches the rest of the PWA's feedback pattern
      // (no toast library; the PWA uses alert for non-blocking confirmations too).
      alert(`Added ${added} task${added === 1 ? "" : "s"}`);
    }
  }

  // Tap a draft → edit its name / info / category before adding (saves to local draft state only).
  function saveDraftEdit(fields) {
    setDraftTasks(prev => prev.map((d, i) => i === editDraftIndex ? { ...d, ...fields } : d));
    setEditDraftIndex(null);
  }

  // Hold an added task (leading hand) → edit its name / info / category via PATCH.
  function openEditTask(task) { setEditTask(task); setEditTaskError(null); }
  async function saveEditTask(fields) {
    if (!editTask || preview) { setEditTask(null); return; }
    setEditTaskSaving(true);
    setEditTaskError(null);
    try {
      const res = await workerFetch(`/api/worker/tasks/${editTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: fields.title, description: fields.description, category: fields.category }),
      });
      const j = await res.json().catch(() => ({}));
      if (j.ok) {
        setTasks(prev => prev.map(t => t.id === editTask.id
          ? { ...t, title: fields.title, description: fields.description || null, category: fields.category }
          : t));
        setEditTask(null);
      } else {
        setEditTaskError(res.status === 403 ? (j.error || "Only a leading hand can edit a task.") : (j.error || "Could not save the task."));
      }
    } catch {
      setEditTaskError("Couldn't save — check your connection.");
    } finally {
      setEditTaskSaving(false);
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
  const isChargeUp  = chargeUpSites.length > 0;                 // selected job is a Charge Up job
  const needsSite   = isChargeUp && !chargeUpJobId;            // …but no location picked yet

  // ── Drag-to-reorder (supervisors / admins) ─────────────────────────────────────
  // A leading hand on their worker link, or an admin previewing, can hold-drag the ⠿
  // handle to reorder tasks within a group. The new order persists and every worker sees it.
  const canReorder = !!(isSupervisor || preview);
  // Hold-to-edit a task's name/info/category — leading hand on their own link (PATCH is blocked in preview).
  const canEditTasks = !!isSupervisor && !preview;
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
        body: JSON.stringify({ jobId: job.id, jobType: job.type || "", chargeUpJobId: chargeUpJobId || undefined, orderedIds: nextTasks.map(t => t.id) }),
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
        <TaskRow key={t.id} task={t} myId={myId} isLeadingHand={isSupervisor} toggling={togglingId === t.id} onToggle={() => toggleTask(t)} onTap={() => openSheet(t)} onAssign={() => openAssignSheet(t)} onHold={canEditTasks ? () => openEditTask(t) : undefined} />
      ));
    }
    return (
      <SortableContext items={list.map(t => t.id)} strategy={verticalListSortingStrategy}>
        {list.map(t => (
          <SortableTaskRow key={t.id} id={t.id}>
            <TaskRow task={t} myId={myId} isLeadingHand={isSupervisor} toggling={togglingId === t.id} onToggle={() => toggleTask(t)} onTap={() => openSheet(t)} onAssign={() => openAssignSheet(t)} onHold={canEditTasks ? () => openEditTask(t) : undefined} />
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

        {/* Charge Up: pick the sub-site — it owns the tasks (a normal-job experience, within the charge-up job) */}
        {isChargeUp && (
          <div className="mb-4">
            <label className="text-[10px] font-semibold text-muted uppercase tracking-wide block mb-1">Location</label>
            <select
              value={chargeUpJobId}
              onChange={e => setChargeUpJobId(e.target.value)}
              className="w-full rounded-lg border border-hairline px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="" disabled>Pick the site…</option>
              {chargeUpSites.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        )}

        {/* Plans for this job (opens a sheet — no new route) */}
        {job && !needsSite && (
          <button
            type="button"
            onClick={() => setPlansOpen(true)}
            className="w-full flex items-center justify-between gap-2 mb-4 -mt-2 px-3 py-2 rounded-lg bg-white border border-hairline text-left"
          >
            <span className="text-sm text-ink flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-muted"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
              Plans
            </span>
            <span className="text-primary text-sm font-medium shrink-0">View →</span>
          </button>
        )}

        {/* Supervisor add task buttons */}
        {job && isSupervisor && !needsSite && (
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setShowAddSheet(true)}
              className="flex-1 py-2.5 rounded-lg border border-dashed border-primary text-primary text-sm font-semibold text-center hover:bg-primary/5 transition-colors"
            >
              + Add task
            </button>
            <button
              type="button"
              onClick={() => { setShowTranscriptSheet(true); setDraftTasks([]); setTranscriptText(""); setTranscriptError(null); }}
              className="flex-1 py-2.5 rounded-lg border border-dashed border-slate-400 text-slate-600 text-sm font-semibold text-center hover:bg-slate-50 transition-colors"
            >
              From transcript
            </button>
          </div>
        )}

        {!job ? (
          <div className="text-center mt-10">
            <p className="text-sm text-muted">Select a job to see its tasks.</p>
            <button type="button" onClick={() => setShowJobPicker(true)} className="mt-3 inline-block px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold">Choose a job</button>
          </div>
        ) : needsSite ? (
          <p className="text-sm text-muted text-center mt-10">Pick a location above to see and add its tasks.</p>
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
                          <TaskRow key={t.id} task={t} myId={myId} isLeadingHand={isSupervisor} toggling={togglingId === t.id} onToggle={() => toggleTask(t)} onTap={() => openSheet(t)} onHold={canEditTasks ? () => openEditTask(t) : undefined} />
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
                    <BlockedRow key={t.id} task={t} onTap={() => openSheet(t)} onHold={canEditTasks ? () => openEditTask(t) : undefined} />
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
                      <DoneRow key={t.id} task={t} isLeadingHand={isSupervisor} toggling={togglingId === t.id} onToggle={() => toggleTask(t)} onTap={() => openSheet(t)} onHold={canEditTasks ? () => openEditTask(t) : undefined} />
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
                {/* Who's on this task — everyone sees the roster (self marked "you"), so a worker knows their crew. */}
                {(sheet.assignees || []).length > 0 && (
                  (sheet.assignees.length === 1 && sheet.assignees[0].id === myId)
                    ? <p className="text-xs text-primary font-medium mt-1">Assigned to you</p>
                    : <p className="text-xs text-primary font-medium mt-1">Assigned: {(sheet.assignees || []).map(a => a.id === myId ? "you" : (a.name || "?")).join(", ")}</p>
                )}
                {sheet.status === "done" && ((isSupervisor || preview) ? (
                  // Supervisors / admin: full sign-off detail — who + date & time (matches the Hub).
                  <p className="text-xs text-emerald-700 mt-1">
                    Done by {sheet.completer?.name || "worker"}
                    {sheet.completed_at && ` · ${new Date(sheet.completed_at).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                  </p>
                ) : (
                  // Regular workers don't see who/when detail — just that it's done.
                  sheet.completed_at && (
                    <p className="text-xs text-emerald-700 mt-1">Done {new Date(sheet.completed_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</p>
                  )
                ))}
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
                  <a href={sheetPhotoPreview} target="_blank" rel="noreferrer" className="block mb-3" title="Open full photo">
                    <img src={sheetPhotoPreview} alt="Completion photo" className="w-full max-h-64 object-contain rounded-lg border border-hairline bg-gray-50" />
                  </a>
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

      {/* ── C3: Assign task sheet (leading hand only) ───────────────────────── */}
      {assignTask && (crewLoading && crew.length === 0 ? (
        <div className="fixed inset-0 z-[60] flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAssignTask(null)} />
          <div className="relative w-full bg-white rounded-t-2xl p-5"><p className="text-sm text-muted text-center py-6">Loading crew…</p></div>
        </div>
      ) : (
        <AssigneePickerSheet
          title="Assign task"
          candidates={crew}
          initial={(assignTask.assignees || []).map(a => a.id)}
          saving={assignBusy}
          onSave={doAssignMulti}
          onClose={() => setAssignTask(null)}
          onShowAll={showAllCrew}
          showingAll={crewShowAll}
        />
      ))}
      {/* ── From-transcript sheet (leading hand only) ─────────────────────── */}
      {showTranscriptSheet && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowTranscriptSheet(false)} />
          <div className="relative w-full bg-white rounded-t-2xl p-5 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-ink mb-1">From transcript</h3>
            <p className="text-xs text-muted mb-3">Paste or dictate your site walk-through — the AI will extract a draft task list for you to review.</p>
            {preview && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                Read-only preview — extraction works in the leading-hand app, not in preview.
              </p>
            )}

            {/* Step 1: transcript input + extract */}
            {draftTasks.length === 0 && (
              <>
                <textarea
                  value={transcriptText}
                  onChange={e => setTranscriptText(e.target.value)}
                  placeholder="Paste or dictate your site walk-through…"
                  rows={6}
                  disabled={transcriptBusy || preview}
                  className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 mb-3 disabled:opacity-50"
                />
                {transcriptError && <p className="text-sm text-red-600 mb-3">{transcriptError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={extractTasks}
                    disabled={transcriptBusy || preview || !transcriptText.trim()}
                    className="flex-1 py-3 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {preview ? "Read-only preview" : transcriptBusy ? "Extracting…" : "Extract tasks"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTranscriptSheet(false)}
                    className="px-5 py-3 rounded-lg border border-hairline text-ink text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* Step 2: draft checklist */}
            {draftTasks.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-ink">
                    {draftTasks.filter(t => t.kept).length} of {draftTasks.length} tasks selected
                  </p>
                  <button
                    type="button"
                    onClick={() => setDraftTasks([])}
                    className="text-xs text-muted underline"
                  >
                    Back
                  </button>
                </div>
                <div className="space-y-2 mb-4">
                  {draftTasks.map((t, i) => (
                    <div key={i} className="flex items-start gap-3 bg-white border border-hairline rounded-lg px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={t.kept}
                        onChange={() => setDraftTasks(prev => prev.map((d, j) => j === i ? { ...d, kept: !d.kept } : d))}
                        className="mt-0.5 shrink-0 w-4 h-4 accent-primary"
                      />
                      <button type="button" onClick={() => setEditDraftIndex(i)} className="flex-1 min-w-0 text-left">
                        <p className={`text-sm leading-snug ${t.kept ? "text-ink" : "text-muted line-through"}`}>{t.title}</p>
                        {t.description && <p className="text-xs text-muted mt-0.5 truncate">{t.description}</p>}
                        <p className="text-xs text-primary/70 mt-0.5">{categoryLabel(t.category || "general")} · tap to edit</p>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={bulkAddDrafts}
                    disabled={bulkAdding || preview || draftTasks.filter(t => t.kept).length === 0}
                    className="flex-1 py-3 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {preview ? "Read-only preview" : bulkAdding ? "Adding…" : `Add ${draftTasks.filter(t => t.kept).length} task${draftTasks.filter(t => t.kept).length === 1 ? "" : "s"}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTranscriptSheet(false)}
                    className="px-5 py-3 rounded-lg border border-hairline text-ink text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {plansOpen && job && (
        <PlansSheet
          jobId={job.id}
          jobType={job.type}
          chargeUpJobId={chargeUpJobId || undefined}
          jobLabel={chargeUpJobId ? (chargeUpSites.find(s => s.id === chargeUpJobId)?.label || job.address) : job.address}
          onClose={() => setPlansOpen(false)}
        />
      )}

      {/* Edit a draft (tap) before adding — saves to local state only */}
      {editDraftIndex != null && draftTasks[editDraftIndex] && (
        <TaskEditSheet
          heading="Edit task"
          initial={draftTasks[editDraftIndex]}
          onSave={saveDraftEdit}
          onClose={() => setEditDraftIndex(null)}
        />
      )}

      {/* Edit an added task (hold) — leading hand, saves via PATCH */}
      {editTask && (
        <TaskEditSheet
          heading="Edit task"
          initial={editTask}
          saving={editTaskSaving}
          error={editTaskError}
          onSave={saveEditTask}
          onClose={() => { setEditTask(null); setEditTaskError(null); }}
        />
      )}
    </WorkerLayout>
  );
}
