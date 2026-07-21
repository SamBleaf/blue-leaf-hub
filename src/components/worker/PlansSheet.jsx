// =============================================================================
// PlansSheet — worker PWA bottom sheet listing a job's CURRENT plans (Feature 1).
// Opened from Today's site card + the Tasks job card (no new route). Tap a plan →
// server signed URL → device PDF viewer. Source of truth is the Hub upload (Supabase).
// =============================================================================
import { useEffect, useState } from "react";
import { workerFetch } from "../../lib/workerFetch.js";

const TYPE_LABEL = {
  architectural: "Architectural", engineering: "Engineering", structural: "Structural",
  survey: "Survey", specification: "Specification", plan: "Plan",
};

export default function PlansSheet({ jobId, jobType = "carpentry", jobLabel, onClose }) {
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState(null);
  const [openingId, setOpeningId] = useState(null);

  useEffect(() => {
    let stop = false;
    workerFetch(`/api/worker/jobs/${jobId}/plans?jobType=${jobType}`)
      .then((r) => r.json())
      .then((j) => { if (stop) return; if (j.ok) setPlans(j.plans || []); else setError(j.error || "Couldn't load plans."); })
      .catch(() => { if (!stop) setError("Network error — try again."); });
    return () => { stop = true; };
  }, [jobId, jobType]);

  async function openPlan(docId) {
    setOpeningId(docId); setError(null);
    try {
      const r = await workerFetch(`/api/worker/plans/${docId}/download`);
      const j = await r.json();
      if (j.ok && j.signedUrl) window.open(j.signedUrl, "_blank", "noopener");
      else setError(j.error || "Couldn't open that plan.");
    } catch {
      setError("Network error — try again.");
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-2xl p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">Plans</h2>
            {jobLabel && <p className="text-xs text-muted truncate">{jobLabel}</p>}
          </div>
          <button onClick={onClose} className="shrink-0 text-muted hover:text-ink text-xl leading-none" aria-label="Close">✕</button>
        </div>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-3">{error}</div>}

        {plans === null ? (
          <p className="text-sm text-muted py-4">Loading…</p>
        ) : plans.length === 0 ? (
          <p className="text-sm text-muted py-4">No plans uploaded for this job yet.</p>
        ) : (
          <div className="space-y-2">
            {plans.map((p) => (
              <button
                key={p.docId}
                type="button"
                onClick={() => openPlan(p.docId)}
                disabled={openingId === p.docId}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-hairline bg-white text-left active:bg-page disabled:opacity-50"
              >
                <span className="w-9 h-9 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-ink truncate">{p.fileName}</span>
                  <span className="block text-[11px] text-muted">{TYPE_LABEL[p.documentType] || p.documentType}</span>
                </span>
                <span className="text-xs font-medium text-primary shrink-0">{openingId === p.docId ? "Opening…" : "Open"}</span>
              </button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted mt-3">Opens the current issued plan in your device&rsquo;s PDF viewer.</p>
      </div>
    </div>
  );
}
