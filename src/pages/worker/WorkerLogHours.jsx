import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkerLayout from "../../components/worker/WorkerLayout.jsx";
import { authFetch } from "../../lib/authFetch.js";

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

const HOUR_CHIPS = [6, 7, 7.5, 8, 8.5, 9];

export default function WorkerLogHours() {
  const navigate = useNavigate();
  const [step, setStep] = useState("pick_task"); // pick_task | enter_hours | review | success
  const [selectedTask, setSelectedTask] = useState(null);
  const [entries, setEntries] = useState([]);
  const [hours, setHours] = useState("8");
  const [notes, setNotes] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [me, setMe] = useState(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    authFetch("/api/worker/me").then(r => r.json()).then(j => { if (j.ok) setMe(j); }).catch(() => {});
  }, []);

  const standardHours = me?.settings?.standard_hours ?? 8;
  const isLeadingHand = me?.employee?.is_leading_hand ?? false;
  const projectId = me?.current_project_id || null;
  const jobId = me?.yesterday_project?.id || null;

  const totalHours = entries.reduce((s, e) => s + Number(e.hours), 0);

  function startEnterHours(task) {
    setSelectedTask(task);
    setHours(String(standardHours));
    setNotes("");
    setPhotoUrl("");
    setStep("enter_hours");
  }

  function addEntry() {
    const h = parseFloat(hours);
    if (!h || h <= 0) return;
    const entry = { task_category: selectedTask.value, label: selectedTask.label, hours: h, notes: notes || null, completion_photo_url: photoUrl || null };
    if (editIdx !== null) {
      setEntries(prev => prev.map((e, i) => i === editIdx ? entry : e));
      setEditIdx(null);
    } else {
      setEntries(prev => [...prev, entry]);
    }
    setStep("review");
  }

  function removeEntry(idx) {
    setEntries(prev => prev.filter((_, i) => i !== idx));
  }

  function editEntry(idx) {
    const e = entries[idx];
    setSelectedTask(TASK_OPTIONS.find(t => t.value === e.task_category));
    setHours(String(e.hours));
    setNotes(e.notes || "");
    setPhotoUrl(e.completion_photo_url || "");
    setEditIdx(idx);
    setStep("enter_hours");
  }

  async function submitTimesheet() {
    if (!entries.length) return;
    setSubmitting(true);
    try {
      const res = await authFetch("/api/worker/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, project_id: projectId, job_id: jobId, entries }),
      });
      const j = await res.json();
      if (j.ok) { setStep("success"); }
      else { alert(j.error || "Submit failed"); }
    } catch {
      alert("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  const overHrs = totalHours - standardHours;
  const hoursWarning = overHrs > 2 ? "red" : overHrs > 0.5 ? "amber" : null;

  // ── Success ──────────────────────────────────────────────────────────────
  if (step === "success") {
    return (
      <WorkerLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="#006c9b" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-ink mb-2">Submitted</h2>
          <p className="text-sm text-muted mb-6">Your timesheet for today has been sent for approval.</p>
          <button type="button" onClick={() => navigate("/worker")} className="px-6 py-3 rounded-lg bg-primary text-white text-sm font-semibold">
            Done
          </button>
        </div>
      </WorkerLayout>
    );
  }

  // ── Pick task ─────────────────────────────────────────────────────────────
  if (step === "pick_task") {
    return (
      <WorkerLayout onBack={() => navigate("/worker")}>
        <div className="px-4 pt-5 pb-8">
          <h1 className="text-base font-bold text-ink mb-1">What did you work on?</h1>
          {/* Date picker — defaults to today, allow previous days */}
          <div className="mb-5">
            <input
              type="date"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={e => setDate(e.target.value)}
              className="text-sm text-muted border-0 bg-transparent focus:outline-none cursor-pointer"
            />
          </div>
          <div className="space-y-2">
            {TASK_OPTIONS.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => startEnterHours(t)}
                className="w-full min-h-14 flex items-center px-4 rounded-lg border border-hairline bg-white text-ink text-sm font-medium text-left hover:border-primary hover:bg-primary/5 transition"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </WorkerLayout>
    );
  }

  // ── Enter hours ───────────────────────────────────────────────────────────
  if (step === "enter_hours") {
    return (
      <WorkerLayout onBack={() => { setStep("pick_task"); setEditIdx(null); }}>
        <div className="px-4 pt-5 pb-8">
          <h1 className="text-base font-bold text-ink mb-5">{selectedTask?.label}</h1>

          {/* Large hours input */}
          <div className="flex flex-col items-center mb-6">
            <label className="text-xs text-muted mb-1 uppercase tracking-wide">Hours</label>
            <input
              type="number"
              min="0.5"
              max="24"
              step="0.5"
              value={hours}
              onChange={e => setHours(e.target.value)}
              className="text-5xl font-bold text-ink text-center w-36 border-b-2 border-primary bg-transparent outline-none py-2"
            />
            <p className="text-xs text-muted mt-2">Standard day: {standardHours} hrs</p>
          </div>

          {/* Quick chips */}
          <div className="flex gap-2 justify-center flex-wrap mb-6">
            {HOUR_CHIPS.map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setHours(String(h))}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${parseFloat(hours) === h ? "bg-primary text-white border-primary" : "bg-white text-ink border-hairline"}`}
              >
                {h}
              </button>
            ))}
          </div>

          {/* Notes */}
          <textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 mb-4"
          />

          {/* Photo upload (leading hand only) */}
          {isLeadingHand && (
            <div className="mb-4">
              <label className="text-xs text-muted block mb-1">Completion photo (optional)</label>
              <input
                type="url"
                placeholder="Photo URL"
                value={photoUrl}
                onChange={e => setPhotoUrl(e.target.value)}
                className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}

          <button
            type="button"
            onClick={addEntry}
            className="w-full py-3 rounded-lg bg-primary text-white text-sm font-semibold"
          >
            Add to timesheet
          </button>
        </div>
      </WorkerLayout>
    );
  }

  // ── Review ────────────────────────────────────────────────────────────────
  return (
    <WorkerLayout onBack={() => setStep("pick_task")}>
      <div className="px-4 pt-5 pb-8">
        <div className="flex items-center gap-2 mb-5">
          <h1 className="text-base font-bold text-ink">Review timesheet</h1>
        </div>

        {/* Entries list */}
        <div className="rounded-card bg-white border border-hairline divide-y divide-hairline mb-4">
          {entries.map((e, idx) => (
            <div key={idx} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink">{e.label}</p>
                {e.notes && <p className="text-xs text-muted mt-0.5 truncate">{e.notes}</p>}
              </div>
              <span className="text-sm text-muted shrink-0">{e.hours}h</span>
              <button type="button" onClick={() => editEntry(idx)} className="text-xs text-primary font-medium shrink-0">Edit</button>
              <button type="button" onClick={() => removeEntry(idx)} className="text-muted text-base leading-none shrink-0">×</button>
            </div>
          ))}
        </div>

        {/* Total + warning */}
        <div className="flex justify-between text-sm font-semibold mb-1 px-1">
          <span className="text-muted">Total</span>
          <span className={hoursWarning === "red" ? "text-red-600" : hoursWarning === "amber" ? "text-amber-600" : "text-ink"}>
            {totalHours}h
          </span>
        </div>
        {hoursWarning === "amber" && <p className="text-xs text-amber-600 mb-3 px-1">Over standard hours</p>}
        {hoursWarning === "red" && <p className="text-xs text-red-600 mb-3 px-1">Significantly over standard hours</p>}

        <button
          type="button"
          onClick={() => setStep("pick_task")}
          className="w-full py-2.5 rounded-lg border border-hairline text-ink text-sm font-medium mb-3"
        >
          + Add another task
        </button>
        <button
          type="button"
          onClick={submitTimesheet}
          disabled={submitting || !entries.length}
          className="w-full py-3 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit timesheet"}
        </button>
      </div>
    </WorkerLayout>
  );
}
