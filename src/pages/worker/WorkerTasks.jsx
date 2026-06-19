import { useEffect, useState } from "react";
import WorkerLayout from "../../components/worker/WorkerLayout.jsx";
import { workerFetch } from "../../lib/workerFetch.js";
import { uploadWorkerPhoto } from "../../lib/workerPhoto.js";

const FILTER_TABS = ["All", "My tasks", "Urgent", "Done"];

const PRIORITY_DOT = {
  urgent: "bg-red-500",
  normal: "bg-gray-400",
  when_time_permits: "bg-transparent border border-gray-400",
};

const PRIORITY_BADGE = {
  urgent: "bg-red-100 text-red-700",
  normal: "bg-gray-100 text-gray-600",
  when_time_permits: "bg-slate-50 text-slate-500",
};

export default function WorkerTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [notes, setNotes] = useState("");
  const [me, setMe] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [photoPath, setPhotoPath] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    Promise.all([
      workerFetch("/api/worker/tasks").then(r => r.json()),
      workerFetch("/api/worker/me").then(r => r.json()),
    ]).then(([tasksJ, meJ]) => {
      if (stop) return;
      if (tasksJ.ok) setTasks(tasksJ.tasks || []);
      if (meJ.ok) setMe(meJ);
    }).catch(() => {}).finally(() => { if (!stop) setLoading(false); });
    return () => { stop = true; };
  }, []);

  const myId = me?.employee?.id;

  function filteredTasks() {
    let list = tasks;
    if (filter === "My tasks") list = list.filter(t => t.assigned_to === myId || t.assigned_to === null);
    if (filter === "Urgent") list = list.filter(t => t.priority === "urgent");
    if (filter === "Done") list = list.filter(t => t.status === "done");
    else list = list.filter(t => t.status !== "done");
    return list;
  }

  const doneTasks = tasks.filter(t => t.status === "done");
  const activeTasks = filteredTasks();

  const byPriority = {
    urgent: activeTasks.filter(t => t.priority === "urgent"),
    normal: activeTasks.filter(t => t.priority === "normal"),
    when_time_permits: activeTasks.filter(t => t.priority === "when_time_permits"),
  };

  async function completeTask(taskId) {
    setCompleting(true);
    try {
      const body = { notes: notes || undefined, photoPath: photoPath || undefined };
      const res = await workerFetch(`/api/worker/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (j.ok) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: "done", completed_at: new Date().toISOString() } : t));
        setSelected(null);
        setNotes("");
        setPhotoPath(null);
        setPhotoPreview(null);
      }
    } catch { /* ignore */ } finally {
      setCompleting(false);
    }
  }

  async function handleTaskPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selected) return;
    setPhotoBusy(true);
    try {
      const path = await uploadWorkerPhoto(file, { entityType: "site_task", entityId: selected.id });
      setPhotoPath(path);
      setPhotoPreview(URL.createObjectURL(file));
    } catch (err) {
      alert(err?.message || "Could not upload the photo");
    } finally {
      setPhotoBusy(false);
    }
  }

  if (loading) {
    return <WorkerLayout><div className="flex items-center justify-center pt-24 text-muted text-sm">Loading…</div></WorkerLayout>;
  }

  function TaskRow({ task }) {
    return (
      <button
        type="button"
        onClick={() => { setSelected(task); setNotes(""); setPhotoPath(null); setPhotoPreview(null); }}
        className="w-full flex items-start gap-3 py-3 text-left hover:bg-gray-50 transition"
      >
        <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] || "bg-gray-400"}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-ink leading-snug">{task.title}</p>
          {task.assigned_to && task.employees && (
            <p className="text-xs text-muted mt-0.5">{task.employees.name}</p>
          )}
          {(task.created_via === "voice_note" || task.created_via === "ai_extraction") && (
            <p className="text-xs text-muted mt-0.5">via voice note</p>
          )}
        </div>
      </button>
    );
  }

  function PriorityGroup({ label, tasks: groupTasks }) {
    if (!groupTasks.length) return null;
    return (
      <div className="mb-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1 px-4">{label}</p>
        <div className="bg-white border border-hairline rounded-lg divide-y divide-hairline px-4">
          {groupTasks.map(t => <TaskRow key={t.id} task={t} />)}
        </div>
      </div>
    );
  }

  return (
    <WorkerLayout>
      <div className="px-4 pt-5 pb-8">
        <h1 className="text-base font-bold text-ink mb-4">Site tasks</h1>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-4 overflow-x-auto">
          {FILTER_TABS.map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${filter === f ? "bg-primary text-white" : "bg-white border border-hairline text-ink"}`}
            >
              {f}
            </button>
          ))}
        </div>

        {filter === "Done" ? (
          doneTasks.length === 0 ? (
            <p className="text-sm text-muted text-center mt-8">No completed tasks</p>
          ) : (
            <div className="bg-white border border-hairline rounded-lg divide-y divide-hairline px-4">
              {doneTasks.map(t => (
                <div key={t.id} className="flex items-center gap-3 py-3">
                  <span className="text-green-500 shrink-0">✓</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted line-through">{t.title}</p>
                    {t.completed_at && (
                      <p className="text-xs text-muted">{new Date(t.completed_at).toLocaleDateString()}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <>
            {activeTasks.length === 0 && (
              <p className="text-sm text-muted text-center mt-8">No tasks</p>
            )}
            <PriorityGroup label="Urgent" tasks={byPriority.urgent} />
            <PriorityGroup label="Normal" tasks={byPriority.normal} />
            <PriorityGroup label="When time permits" tasks={byPriority.when_time_permits} />

            {/* Done section (collapsed) */}
            {doneTasks.length > 0 && filter === "All" && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowDone(v => !v)}
                  className="text-sm text-muted font-medium"
                >
                  ✅ Completed ({doneTasks.length}) {showDone ? "▲" : "▼"}
                </button>
                {showDone && (
                  <div className="mt-2 bg-white border border-hairline rounded-lg divide-y divide-hairline px-4">
                    {doneTasks.map(t => (
                      <div key={t.id} className="flex items-center gap-3 py-3">
                        <span className="text-green-500 shrink-0 text-xs">✓</span>
                        <p className="text-sm text-muted line-through">{t.title}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Task detail bottom sheet */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} />
          <div className="relative w-full bg-white rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0 mr-3">
                <h3 className="text-base font-bold text-ink leading-snug">{selected.title}</h3>
                {selected.description && <p className="text-sm text-muted mt-1">{selected.description}</p>}
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${PRIORITY_BADGE[selected.priority] || ""}`}>
                {selected.priority?.replace(/_/g, " ")}
              </span>
            </div>

            <textarea
              placeholder="Completion notes (optional)"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 mb-3"
            />

            {photoPreview && (
              <img src={photoPreview} alt="Completion photo" className="w-full max-h-48 object-cover rounded-lg border border-hairline mb-3" />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => completeTask(selected.id)}
                disabled={completing}
                className="flex-1 py-3 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50"
              >
                {completing ? "Marking done…" : "Mark as done"}
              </button>
              <button
                type="button"
                onClick={() => document.getElementById("task-photo-input")?.click()}
                disabled={photoBusy}
                className="px-4 py-3 rounded-lg border border-hairline text-ink text-sm font-medium disabled:opacity-50"
              >
                {photoBusy ? "Uploading…" : photoPath ? "Photo ✓" : "Add photo"}
              </button>
              <button
                type="button"
                onClick={() => { setSelected(null); setNotes(""); setPhotoPath(null); setPhotoPreview(null); }}
                className="px-4 py-3 rounded-lg border border-hairline text-ink text-sm font-medium"
              >
                Cancel
              </button>
            </div>
            <input id="task-photo-input" type="file" accept="image/*" capture="environment" className="hidden" onChange={handleTaskPhoto} />
          </div>
        </div>
      )}
    </WorkerLayout>
  );
}
