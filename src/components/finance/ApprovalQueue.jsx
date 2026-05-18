import { useCallback, useEffect, useState } from "react";

function fmtAmount(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

const METHOD_COLOR = {
  exact_job_ref: "text-green-700 bg-green-50 border-green-200",
  exact_po: "text-green-700 bg-green-50 border-green-200",
  exact_address: "text-green-700 bg-green-50 border-green-200",
  supplier_default: "text-blue-700 bg-blue-50 border-blue-200",
  fuzzy_address: "text-amber-700 bg-amber-50 border-amber-200",
  fuzzy_supplier: "text-amber-700 bg-amber-50 border-amber-200",
  ai: "text-purple-700 bg-purple-50 border-purple-200",
  manual: "text-muted bg-page border-hairline",
};

const METHOD_LABELS = {
  exact_job_ref: "Job ref match",
  exact_po: "PO match",
  exact_address: "Exact address",
  supplier_default: "Supplier default",
  fuzzy_address: "Fuzzy address",
  fuzzy_supplier: "Fuzzy supplier",
  ai: "AI matched",
  manual: "Manual",
};

function ApprovalCard({ doc, jobs, onApprove, onReject, onRematch }) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [rematchJob, setRematchJob] = useState(doc.job_id || "");
  const [rematchOpen, setRematchOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const matchClass = METHOD_COLOR[doc.match_method] || "text-muted bg-page border-hairline";

  async function handleApprove() {
    setBusy(true);
    await onApprove(doc.id);
    setBusy(false);
  }

  async function handleReject() {
    setBusy(true);
    await onReject(doc.id, rejectComment);
    setBusy(false);
    setRejectOpen(false);
  }

  async function handleRematch() {
    if (!rematchJob) return;
    setBusy(true);
    await onRematch(doc.id, rematchJob);
    setBusy(false);
    setRematchOpen(false);
  }

  return (
    <div className="rounded-card border border-hairline bg-surface overflow-hidden">
      <div className="grid md:grid-cols-2 gap-0">
        {/* Left: extracted data */}
        <div className="p-4 border-b md:border-b-0 md:border-r border-hairline">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted mb-2">Invoice details</p>
          <p className="text-base font-bold text-ink">{doc.supplier_name || "Unknown supplier"}</p>
          {doc.supplier_abn && <p className="text-xs text-muted mt-0.5">ABN {doc.supplier_abn}</p>}

          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Invoice #</span>
              <span className="text-ink font-medium">{doc.invoice_number || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Date</span>
              <span className="text-ink">{fmtDate(doc.invoice_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Due</span>
              <span className="text-ink">{fmtDate(doc.due_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Ex GST</span>
              <span className="text-ink">{fmtAmount(doc.amount_ex_gst)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">GST</span>
              <span className="text-ink">{fmtAmount(doc.gst_amount)}</span>
            </div>
            <div className="flex justify-between border-t border-hairline pt-1 mt-1">
              <span className="font-semibold text-ink">Total</span>
              <span className="font-bold text-lg text-ink">{fmtAmount(doc.amount_total)}</span>
            </div>
          </div>

          {doc.description && <p className="mt-3 text-xs text-muted italic">{doc.description}</p>}
        </div>

        {/* Right: job match */}
        <div className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted mb-2">Matched job</p>

          {(() => { const job = jobs.find(j => j.id === doc.job_id); return job ? (
            <div className="space-y-2">
              <p className="text-base font-bold text-primary leading-tight">{job.address}</p>
              {job.job_reference && <p className="text-xs text-muted">Ref: {job.job_reference}</p>}
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${matchClass}`}>
                {METHOD_LABELS[doc.match_method] || doc.match_method}
                {doc.match_confidence < 100 && ` · ${doc.match_confidence}%`}
              </span>
            </div>
          ) : <p className="text-sm text-warning font-semibold">No job matched — reassign before approving</p>; })()}

          {doc.is_duplicate && (
            <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-warning font-semibold">
              Possible duplicate invoice detected
            </div>
          )}

          {/* Rematch */}
          <button
            type="button"
            onClick={() => setRematchOpen(o => !o)}
            className="mt-4 text-xs text-primary hover:underline font-semibold"
          >
            {rematchOpen ? "Cancel reassign" : "Reassign to different job"}
          </button>
          {rematchOpen && (
            <div className="mt-2 flex gap-2">
              <select
                value={rematchJob}
                onChange={e => setRematchJob(e.target.value)}
                className="flex-1 rounded-lg border border-hairline bg-surface px-2 py-1.5 text-sm text-ink"
              >
                <option value="">— Select job —</option>
                {jobs.map(j => (
                  <option key={j.id} value={j.id}>{j.address}{j.job_reference ? ` (${j.job_reference})` : ""}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleRematch}
                disabled={!rematchJob || busy}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                Set
              </button>
            </div>
          )}

          {/* Approval actions */}
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleApprove}
              disabled={busy || !doc.job_id}
              className="w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent/90 disabled:opacity-40 transition"
            >
              {busy ? "Processing…" : "Approve & File to Dropbox"}
            </button>

            {!rejectOpen ? (
              <button
                type="button"
                onClick={() => setRejectOpen(true)}
                className="w-full rounded-lg border border-hairline py-2 text-sm font-semibold text-muted hover:text-danger hover:border-danger/40 transition"
              >
                Reject
              </button>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={rejectComment}
                  onChange={e => setRejectComment(e.target.value)}
                  placeholder="Reason for rejection (optional)…"
                  rows={2}
                  className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-danger/30 resize-none"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setRejectOpen(false)} className="flex-1 rounded-lg border border-hairline py-1.5 text-sm text-muted">Cancel</button>
                  <button type="button" onClick={handleReject} disabled={busy} className="flex-1 rounded-lg bg-danger py-1.5 text-sm font-bold text-white disabled:opacity-40">Confirm reject</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ApprovalQueue({ onAction }) {
  const [documents, setDocuments] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dr, jr] = await Promise.all([
        fetch("/api/finance/documents?status=pending_approval&limit=50").then(r => r.json()),
        fetch("/api/finance/jobs").then(r => r.json())
      ]);
      if (dr.ok) setDocuments(dr.documents);
      if (jr.ok) setJobs(jr.jobs);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(id) {
    const r = await fetch(`/api/finance/documents/${id}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    });
    const j = await r.json();
    if (j.ok) {
      setDocuments(prev => prev.filter(d => d.id !== id));
      onAction?.();
    }
  }

  async function handleReject(id, comment) {
    const r = await fetch(`/api/finance/documents/${id}/reject`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment })
    });
    const j = await r.json();
    if (j.ok) {
      setDocuments(prev => prev.filter(d => d.id !== id));
      onAction?.();
    }
  }

  async function handleRematch(id, job_id) {
    const r = await fetch(`/api/finance/documents/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id })
    });
    const j = await r.json();
    if (j.ok) {
      setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...j.document } : d));
    }
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>;

  if (!documents.length) {
    return (
      <div className="rounded-card border border-dashed border-hairline bg-page py-16 text-center">
        <p className="text-sm font-semibold text-ink">All clear — no invoices pending approval.</p>
        <p className="text-xs text-muted mt-1">Upload invoices from the Inbox tab to start.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{documents.length} invoice{documents.length !== 1 ? "s" : ""} awaiting review</p>
      {documents.map(doc => (
        <ApprovalCard
          key={doc.id}
          doc={doc}
          jobs={jobs}
          onApprove={handleApprove}
          onReject={handleReject}
          onRematch={handleRematch}
        />
      ))}
    </div>
  );
}
