import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkerLayout from "../../components/worker/WorkerLayout.jsx";
import { authFetch } from "../../lib/authFetch.js";

// Read an image file, downscale it, and return a compressed JPEG data URL so a
// completion photo stays small enough to store inline (a few hundred KB).
function compressImageToDataUrl(file, maxDim = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        let { width, height } = img;
        if (width >= height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
        else if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const TASK_OPTIONS = [
  { value: "first_fix_framing",  label: "First fix / framing" },
  { value: "cladding",           label: "Cladding" },
  { value: "second_fix",         label: "Second fix" },
  { value: "outdoor_works",      label: "Outdoor works" },
  { value: "formwork_slab_prep", label: "Formwork / slab prep" },
  { value: "site_labouring",     label: "Site labouring" },
  { value: "site_cleanup",       label: "Site cleanup" },
  { value: "supervision",        label: "Supervision" },
];

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function WorkerLogHours() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [entries, setEntries] = useState([]);
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [me, setMe] = useState(null);
  const [date, setDate] = useState(todayStr);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInputRef = useRef(null);
  const photoTargetIdx = useRef(null);

  useEffect(() => {
    let stop = false;
    Promise.all([
      authFetch("/api/worker/me").then(r => r.json()).catch(() => null),
      authFetch("/api/worker/projects").then(r => r.json()).catch(() => null),
    ]).then(([meRes, projRes]) => {
      if (stop) return;
      if (meRes?.ok) setMe(meRes);
      const list = projRes?.ok ? (projRes.projects || []) : [];
      setProjects(list);
      // Default to the worker's most recent site, or the only site if there's just one
      const current = meRes?.ok ? meRes.current_project_id : null;
      if (current && list.some(p => p.id === current)) setSelectedId(current);
      else if (list.length === 1) setSelectedId(list[0].id);
    });
    return () => { stop = true; };
  }, []);

  const standardHours = me?.settings?.standard_hours ?? 8;
  const isLeadingHand = me?.employee?.is_leading_hand ?? false;
  const selectedProject = projects.find(p => p.id === selectedId) || null;
  const totalHours = entries.reduce((s, e) => s + Number(e.hours || 0), 0);
  const overHrs = totalHours - standardHours;
  const hoursWarning = overHrs > 2 ? "red" : overHrs > 0.5 ? "amber" : null;

  function addTask(task) {
    const existing = entries.findIndex(e => e.task_category === task.value);
    if (existing !== -1) { setExpandedIdx(existing); return; } // already added — open it
    setEntries(prev => [...prev, { task_category: task.value, label: task.label, hours: standardHours, notes: "", completion_photo_url: "" }]);
  }
  function patchEntry(idx, patch) {
    setEntries(prev => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function setEntryHours(idx, val) {
    const n = Number(val);
    if (!n || n <= 0) return; // ignore empty/zero — keeps the previous value
    patchEntry(idx, { hours: Math.min(24, n) });
  }
  function bumpHours(idx, delta) {
    setEntries(prev => prev.map((e, i) => (i === idx ? { ...e, hours: Math.max(0.5, Math.min(24, Number(e.hours || 0) + delta)) } : e)));
  }
  function removeEntry(idx) {
    setEntries(prev => prev.filter((_, i) => i !== idx));
    setExpandedIdx(null);
  }
  function openPhotoFor(idx) {
    photoTargetIdx.current = idx;
    photoInputRef.current?.click();
  }
  async function handlePhotoPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const idx = photoTargetIdx.current;
    if (!file || idx == null) return;
    setPhotoBusy(true);
    try {
      patchEntry(idx, { completion_photo_url: await compressImageToDataUrl(file) });
    } catch {
      alert("Couldn't read that photo — please try another.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function submit() {
    if (!entries.length || !selectedProject) return;
    setSubmitting(true);
    try {
      const payload = entries.map(e => ({
        task_category: e.task_category,
        hours: Number(e.hours),
        notes: e.notes || null,
        completion_photo_url: e.completion_photo_url || null,
      }));
      const res = await authFetch("/api/worker/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, project_id: selectedProject.id, job_id: selectedProject.job_id || null, entries: payload }),
      });
      const j = await res.json();
      if (j.ok) setSubmitted(true);
      else alert(j.error || "Submit failed");
    } catch {
      alert("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success ──────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <WorkerLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="#006c9b" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-ink mb-2">Submitted</h2>
          <p className="text-sm text-muted mb-6">Your timesheet has been sent for approval.</p>
          <button type="button" onClick={() => navigate("/worker")} className="px-6 py-3 rounded-lg bg-primary text-white text-sm font-semibold">
            Done
          </button>
        </div>
      </WorkerLayout>
    );
  }

  // ── Single-screen log ──────────────────────────────────────────────────────
  return (
    <WorkerLayout onBack={() => navigate("/worker")}>
      {/* Shared hidden picker — targets whichever entry's photo is being set */}
      <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoPick} className="hidden" />

      <div className="px-4 pt-5 pb-28">
        <h1 className="text-base font-bold text-ink mb-4">Log hours</h1>

        {/* Day + Site — pre-filled, change inline */}
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <label className="text-xs text-muted uppercase tracking-wide block mb-1">Day</label>
            <input
              type="date"
              value={date}
              max={todayStr()}
              onChange={e => setDate(e.target.value)}
              className="w-full rounded-lg border border-hairline px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-xs text-muted uppercase tracking-wide block mb-1">Site</label>
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="w-full rounded-lg border border-hairline px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="" disabled>Select…</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.address}{p.status && p.status !== "active" ? ` (${String(p.status).replace(/_/g, " ")})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        {date !== todayStr() && <p className="text-xs text-amber-600 mb-4">Backdating to {date}</p>}
        {date === todayStr() && <div className="mb-4" />}

        {/* Add task — one tap adds at a standard day */}
        <label className="text-xs text-muted uppercase tracking-wide block mb-2">Add what you worked on</label>
        <div className="grid grid-cols-2 gap-2 mb-6">
          {TASK_OPTIONS.map(t => {
            const added = entries.some(e => e.task_category === t.value);
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => addTask(t)}
                className={`min-h-12 px-3 rounded-lg border text-sm text-left transition ${added ? "border-primary bg-primary/5 text-primary" : "border-hairline bg-white text-ink hover:border-primary hover:bg-primary/5"}`}
              >
                {added ? "✓ " : "+ "}{t.label}
              </button>
            );
          })}
        </div>

        {/* Entries with inline hours + optional notes/photo */}
        {entries.length > 0 && (
          <>
            <label className="text-xs text-muted uppercase tracking-wide block mb-2">Hours</label>
            <div className="space-y-2 mb-3">
              {entries.map((e, idx) => {
                const hasDetail = e.notes || e.completion_photo_url;
                return (
                  <div key={e.task_category} className="rounded-lg border border-hairline bg-white">
                    <div className="flex items-center gap-1.5 px-3 py-2.5">
                      <span className="flex-1 min-w-0 truncate text-sm text-ink">{e.label}</span>
                      <button type="button" onClick={() => bumpHours(idx, -0.5)} aria-label="Less hours" className="w-8 h-8 shrink-0 rounded-full border border-hairline text-ink text-lg leading-none flex items-center justify-center">−</button>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.5"
                        max="24"
                        step="0.5"
                        value={e.hours}
                        onChange={ev => setEntryHours(idx, ev.target.value)}
                        className="w-12 shrink-0 text-center text-sm font-semibold text-ink border-b border-hairline bg-transparent outline-none"
                      />
                      <button type="button" onClick={() => bumpHours(idx, 0.5)} aria-label="More hours" className="w-8 h-8 shrink-0 rounded-full border border-hairline text-ink text-lg leading-none flex items-center justify-center">+</button>
                      <button type="button" onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)} aria-label="Notes and photo" className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-lg leading-none ${hasDetail ? "text-primary" : "text-muted"}`}>⋯</button>
                      <button type="button" onClick={() => removeEntry(idx)} aria-label="Remove" className="w-7 h-8 shrink-0 text-muted text-xl leading-none flex items-center justify-center">×</button>
                    </div>
                    {expandedIdx === idx && (
                      <div className="px-3 pb-3 pt-1 border-t border-hairline space-y-3">
                        <textarea
                          placeholder="Notes (optional)"
                          value={e.notes || ""}
                          rows={2}
                          onChange={ev => patchEntry(idx, { notes: ev.target.value })}
                          className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        {isLeadingHand && (
                          e.completion_photo_url ? (
                            <div className="flex items-center gap-3">
                              <img src={e.completion_photo_url} alt="Completion" className="w-14 h-14 rounded-lg object-cover border border-hairline" />
                              <button type="button" onClick={() => openPhotoFor(idx)} className="text-sm text-primary font-medium">Replace</button>
                              <button type="button" onClick={() => patchEntry(idx, { completion_photo_url: "" })} className="text-sm text-muted">Remove</button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => openPhotoFor(idx)} disabled={photoBusy} className="w-full py-2 rounded-lg border border-hairline text-ink text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                <circle cx="12" cy="13" r="4" />
                              </svg>
                              {photoBusy ? "Processing…" : "Add completion photo"}
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-sm font-semibold px-1">
              <span className="text-muted">Total</span>
              <span className={hoursWarning === "red" ? "text-red-600" : hoursWarning === "amber" ? "text-amber-600" : "text-ink"}>{totalHours}h</span>
            </div>
            {hoursWarning && (
              <p className={`text-xs px-1 mt-0.5 ${hoursWarning === "red" ? "text-red-600" : "text-amber-600"}`}>
                {hoursWarning === "red" ? "Well over a standard day" : "Over standard hours"}
              </p>
            )}
          </>
        )}
      </div>

      {/* Sticky submit */}
      <div className="fixed inset-x-0 bottom-0 border-t border-hairline bg-page px-4 py-3">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !entries.length || !selectedProject}
          className="w-full py-3 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50"
        >
          {submitting
            ? "Submitting…"
            : !selectedProject
              ? "Pick a site to submit"
              : !entries.length
                ? "Add a task to submit"
                : `Submit ${totalHours}h`}
        </button>
      </div>
    </WorkerLayout>
  );
}
