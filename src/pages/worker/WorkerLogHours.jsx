import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import WorkerLayout from "../../components/worker/WorkerLayout.jsx";
import { workerFetch, isWorkerPreview } from "../../lib/workerFetch.js";

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

// LOCAL calendar date (NOT toISOString — that shifts a day in AU timezones, which
// would reject same-day logging in the morning).
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function WorkerLogHours() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [existingId, setExistingId] = useState(null);
  const [approved, setApproved] = useState(false);
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [entries, setEntries] = useState([]);
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [subtasks, setSubtasks] = useState({});   // P3: { task_category: [{ key, label, budgetLineItemId }] }
  const [activeCat, setActiveCat] = useState(null); // which category's sub-task chooser is open
  const [chargeUpSites, setChargeUpSites] = useState([]); // BLB Charge Up: sites to pick as a Location
  const [chargeUpJobId, setChargeUpJobId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const preview = isWorkerPreview();
  const [me, setMe] = useState(null);
  const [date, setDate] = useState(() => params.get("date") || todayStr());
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInputRef = useRef(null);
  const photoTargetIdx = useRef(null);

  useEffect(() => {
    let stop = false;
    Promise.all([
      workerFetch("/api/worker/me").then(r => r.json()).catch(() => null),
      workerFetch("/api/worker/projects").then(r => r.json()).catch(() => null),
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

  // Load any existing timesheet for the selected date → prefill it (so a logged day
  // opens with its entries to edit), or flag it approved (locked).
  useEffect(() => {
    let stop = false;
    workerFetch(`/api/worker/timesheets/${date}`)
      .then(r => r.json())
      .then(j => {
        if (stop) return;
        const ts = j?.timesheet;
        if (ts) {
          setExistingId(ts.id);
          setApproved(ts.status === "approved");
          setEntries((ts.timesheet_entries || []).map(e => ({
            task_category: e.task_category,
            budget_line_item_id: e.budget_line_item_id || null,
            label: TASK_OPTIONS.find(t => t.value === e.task_category)?.label || e.task_category,
            hours: Number(e.hours) || 8,
            notes: e.notes || "",
            completion_photo_url: e.completion_photo_url || "",
            manuallyEdited: true,
          })));
          if (ts.project_id) setSelectedId(ts.project_id);
          else if (ts.carpentry_job_id) setSelectedId(ts.carpentry_job_id);
          setChargeUpJobId(ts.timesheet_entries?.[0]?.charge_up_job_id || "");   // restore the picked location
        } else {
          setExistingId(null);
          setApproved(false);
          setEntries([]);
          setChargeUpJobId("");
        }
      })
      .catch(() => {});
    return () => { stop = true; };
  }, [date]);

  // P3: load the job's confirmed sub-tasks (carpentry only) for the two-level picker.
  useEffect(() => {
    const proj = projects.find(p => p.id === selectedId);
    if (!selectedId || proj?.type !== "carpentry") { setSubtasks({}); setActiveCat(null); setChargeUpSites([]); return; }
    let stop = false;
    workerFetch(`/api/worker/jobs/${selectedId}/subtasks`)
      .then(r => r.json())
      .then(j => { if (!stop && j?.ok) { setSubtasks(j.subtasks || {}); setChargeUpSites(j.chargeUpSites || []); } })
      .catch(() => {});
    return () => { stop = true; };
  }, [selectedId, projects]);

  const standardHours = me?.settings?.standard_hours ?? 8;
  const isLeadingHand = me?.employee?.is_leading_hand ?? false;
  const selectedProject = projects.find(p => p.id === selectedId) || null;
  const hasSub = (cat) => (subtasks[cat] || []).length > 0;
  // Display label = parent category + sub-task (resolved from the loaded sub-tasks when re-editing).
  const displayLabel = (e) => {
    if (e.subtaskLabel) return `${e.label} · ${e.subtaskLabel}`;
    if (e.budget_line_item_id) {
      const st = (subtasks[e.task_category] || []).find(s => s.budgetLineItemId === e.budget_line_item_id);
      return st ? `${e.label} · ${st.label}` : e.label;
    }
    return e.label;
  };
  const totalHours = entries.reduce((s, e) => s + Number(e.hours || 0), 0);
  const overHrs = totalHours - standardHours;
  const hoursWarning = overHrs > 2 ? "red" : overHrs > 0.5 ? "amber" : null;

  // Even-split standard hours across selected tasks (nearest 0.5h, remainder on the last task).
  function fairSplit(total, count) {
    if (count <= 0) return [];
    const per = Math.max(0.5, Math.round((total / count) * 2) / 2);
    const arr = Array(count).fill(per);
    const last = Math.round((total - per * (count - 1)) * 2) / 2;
    arr[count - 1] = last >= 0.5 ? last : per;
    return arr;
  }
  // Re-split the standard day across tasks the worker has NOT hand-edited; edited tasks keep theirs.
  function redistribute(list) {
    const manualSum = list.filter(e => e.manuallyEdited).reduce((s, e) => s + Number(e.hours || 0), 0);
    const autoIdx = list.map((e, i) => (e.manuallyEdited ? -1 : i)).filter(i => i >= 0);
    const split = fairSplit(Math.max(0, standardHours - manualSum), autoIdx.length);
    return list.map((e, i) => {
      const k = autoIdx.indexOf(i);
      return k === -1 ? e : { ...e, hours: split[k] };
    });
  }

  function addTask(task) {
    // Two-level: a category with sub-tasks opens its chooser instead of adding directly.
    if (hasSub(task.value)) { setActiveCat(prev => (prev === task.value ? null : task.value)); return; }
    const existing = entries.findIndex(e => e.task_category === task.value && !e.budget_line_item_id);
    if (existing !== -1) { removeEntry(existing); return; } // tap again to remove
    setEntries(prev => redistribute([...prev, { task_category: task.value, budget_line_item_id: null, label: task.label, hours: standardHours, notes: "", completion_photo_url: "", manuallyEdited: false }]));
  }
  // P3: add/remove a sub-task entry, keyed by (category, budget_line_item_id) so two sub-tasks under
  // one parent don't collapse into one entry.
  function addSubtask(cat, catLabel, st) {
    const existing = entries.findIndex(e => e.task_category === cat && e.budget_line_item_id === st.budgetLineItemId);
    if (existing !== -1) { removeEntry(existing); return; }
    setEntries(prev => redistribute([...prev, { task_category: cat, budget_line_item_id: st.budgetLineItemId, subtaskLabel: st.label, label: catLabel, hours: standardHours, notes: "", completion_photo_url: "", manuallyEdited: false }]));
  }
  function patchEntry(idx, patch) {
    setEntries(prev => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function setEntryHours(idx, val) {
    const n = Number(val);
    if (!n || n <= 0) return; // ignore empty/zero — keeps the previous value
    patchEntry(idx, { hours: Math.min(24, n), manuallyEdited: true });
  }
  function bumpHours(idx, delta) {
    setEntries(prev => prev.map((e, i) => (i === idx ? { ...e, hours: Math.max(0.5, Math.min(24, Number(e.hours || 0) + delta)), manuallyEdited: true } : e)));
  }
  function removeEntry(idx) {
    setEntries(prev => redistribute(prev.filter((_, i) => i !== idx)));
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
    if (approved || !entries.length || !selectedProject) return;
    if (chargeUpSites.length > 0 && !chargeUpJobId) { alert("Pick a location before submitting charge-up work."); return; }
    setSubmitting(true);
    try {
      const payload = entries.map(e => ({
        task_category: e.task_category,
        budget_line_item_id: e.budget_line_item_id || null,
        hours: Number(e.hours),
        notes: e.notes || null,
        completion_photo_url: e.completion_photo_url || null,
      }));
      const res = await workerFetch("/api/worker/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          selectedProject.type === "carpentry"
            ? { date, carpentry_job_id: selectedProject.id, charge_up_job_id: chargeUpJobId || null, entries: payload }
            : { date, project_id: selectedProject.id, job_id: selectedProject.job_id || null, entries: payload }
        ),
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

  // ── Approved → read-only (worker can't edit an approved timesheet) ──────────
  if (approved) {
    const dayLabel = new Date(date).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" });
    return (
      <WorkerLayout onBack={() => navigate(-1)}>
        <div className="px-4 pt-5 pb-8">
          <h1 className="text-base font-bold text-ink mb-1">{dayLabel}</h1>
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm mb-4">
            <span className="font-semibold text-green-800">✓ Approved</span>
            <span className="text-green-700"> — this timesheet is locked. Contact the office if it needs changing.</span>
          </div>
          <div className="space-y-2">
            {entries.map((e, i) => (
              <div key={i} className="rounded-lg border border-hairline bg-white px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink">{displayLabel(e)}</span>
                  <span className="text-sm font-semibold text-ink">{e.hours}h</span>
                </div>
                {e.notes && <p className="text-xs text-muted mt-1">{e.notes}</p>}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm font-semibold px-1 mt-3">
            <span className="text-muted">Total</span><span className="text-ink">{totalHours}h</span>
          </div>
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
              onChange={e => { setSelectedId(e.target.value); setChargeUpJobId(""); }}
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

        {/* BLB Charge Up: pick the location the work was done at (required) */}
        {chargeUpSites.length > 0 && (
          <div className="mb-4">
            <label className="text-xs text-muted uppercase tracking-wide block mb-1">Location <span className="text-red-500">*</span></label>
            <select
              value={chargeUpJobId}
              onChange={e => setChargeUpJobId(e.target.value)}
              className="w-full rounded-lg border border-hairline px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="" disabled>Pick the site…</option>
              {chargeUpSites.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            {chargeUpJobId && chargeUpSites.find(s => s.id === chargeUpJobId)?.address && (
              <p className="text-xs text-muted mt-1">{chargeUpSites.find(s => s.id === chargeUpJobId).address}</p>
            )}
          </div>
        )}
        {date !== todayStr() && <p className="text-xs text-amber-600 mb-4">Backdating to {date}</p>}
        {date === todayStr() && <div className="mb-4" />}

        {/* Add task — one tap adds at a standard day (categories with sub-tasks open a chooser) */}
        <label className="text-xs text-muted uppercase tracking-wide block mb-2">Add what you worked on</label>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {TASK_OPTIONS.map(t => {
            const added = entries.some(e => e.task_category === t.value);
            const sub = hasSub(t.value);
            const isActive = activeCat === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => addTask(t)}
                className={`min-h-12 px-3 rounded-lg border text-sm text-left transition flex items-center justify-between gap-1 ${added || isActive ? "border-primary bg-primary/5 text-primary" : "border-hairline bg-white text-ink hover:border-primary hover:bg-primary/5"}`}
              >
                <span>{added ? "✓ " : "+ "}{t.label}</span>
                {sub && <span className="text-[10px] opacity-70">{isActive ? "▾" : "›"}</span>}
              </button>
            );
          })}
        </div>

        {/* Sub-task chooser for the active category (two-level picker) */}
        {activeCat && hasSub(activeCat) && (
          <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs font-semibold text-primary mb-2">{TASK_OPTIONS.find(t => t.value === activeCat)?.label} — pick the task</p>
            <div className="grid grid-cols-2 gap-2">
              {subtasks[activeCat].map(st => {
                const on = entries.some(e => e.task_category === activeCat && e.budget_line_item_id === st.budgetLineItemId);
                const catLabel = TASK_OPTIONS.find(t => t.value === activeCat)?.label || activeCat;
                return (
                  <button key={st.budgetLineItemId} type="button" onClick={() => addSubtask(activeCat, catLabel, st)}
                    className={`min-h-11 px-3 rounded-lg border text-sm text-left ${on ? "border-primary bg-primary/10 text-primary" : "border-hairline bg-white text-ink"}`}>
                    {on ? "✓ " : "+ "}{st.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {!activeCat && <div className="mb-3" />}

        {/* Entries with inline hours + optional notes/photo */}
        {entries.length > 0 && (
          <>
            <label className="text-xs text-muted uppercase tracking-wide block mb-2">Hours</label>
            <div className="space-y-2 mb-3">
              {entries.map((e, idx) => {
                const hasDetail = e.notes || e.completion_photo_url;
                return (
                  <div key={`${e.task_category}|${e.budget_line_item_id || ""}`} className="rounded-lg border border-hairline bg-white">
                    <div className="flex items-center gap-1.5 px-3 py-2.5">
                      <span className="flex-1 min-w-0 truncate text-sm text-ink">{displayLabel(e)}</span>
                      <button type="button" onClick={() => bumpHours(idx, -0.5)} aria-label="Less hours" className="w-9 h-9 shrink-0 rounded-full border border-hairline text-ink text-lg leading-none flex items-center justify-center">−</button>
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
                      <button type="button" onClick={() => bumpHours(idx, 0.5)} aria-label="More hours" className="w-9 h-9 shrink-0 rounded-full border border-hairline text-ink text-lg leading-none flex items-center justify-center">+</button>
                      <button type="button" onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)} aria-label="Notes and photo" className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-lg leading-none ${hasDetail ? "text-primary" : "text-muted"}`}>⋯</button>
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
          disabled={preview || submitting || !entries.length || !selectedProject}
          className="w-full py-3 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50"
        >
          {preview
            ? "Read-only preview"
            : submitting
              ? "Submitting…"
              : !selectedProject
                ? "Pick a site to submit"
                : !entries.length
                  ? "Add a task to submit"
                  : `${existingId ? "Update" : "Submit"} ${totalHours}h`}
        </button>
      </div>
    </WorkerLayout>
  );
}
