import { useCallback, useEffect, useState } from "react";

function fmtAmount(n) {
  if (n == null || isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_CHIP = {
  unmatched: "border-warning/40 bg-warning/10 text-warning",
  pending_approval: "border-primary/30 bg-primary/10 text-primary",
  approved: "border-accent/30 bg-accent/10 text-accent",
  filed: "border-green-200 bg-green-50 text-green-700",
  rejected: "border-danger/30 bg-danger/10 text-danger",
};

export default function JobFinancials() {
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/finance/jobs").then(r => r.json()).then(j => { if (j.ok) setJobs(j.jobs); });
  }, []);

  const loadDocs = useCallback(async (jobId) => {
    if (!jobId) { setDocuments([]); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/finance/documents?job_id=${jobId}&limit=200`).then(r => r.json());
      if (r.ok) setDocuments(r.documents);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDocs(selectedJobId); }, [selectedJobId, loadDocs]);

  // Summarise by status
  const filed = documents.filter(d => d.status === "filed" || d.status === "approved" || d.status === "xero_synced");
  const pending = documents.filter(d => d.status === "pending_approval");
  const totalFiled = filed.reduce((s, d) => s + Number(d.amount_total || 0), 0);
  const totalPending = pending.reduce((s, d) => s + Number(d.amount_total || 0), 0);
  const totalGst = filed.reduce((s, d) => s + Number(d.gst_amount || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-ink">Select job</label>
        <select
          value={selectedJobId}
          onChange={e => setSelectedJobId(e.target.value)}
          className="rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[280px]"
        >
          <option value="">— Choose a project —</option>
          {jobs.map(j => (
            <option key={j.id} value={j.id}>{j.address}{j.job_reference ? ` · ${j.job_reference}` : ""}</option>
          ))}
        </select>
      </div>

      {!selectedJobId && (
        <div className="rounded-card border border-dashed border-hairline bg-page py-16 text-center">
          <p className="text-sm text-muted">Select a project above to view its financials.</p>
        </div>
      )}

      {selectedJobId && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-card border border-hairline bg-surface p-4 text-center">
              <div className="text-lg font-bold text-ink">{fmtAmount(totalFiled)}</div>
              <div className="text-xs text-muted">Total filed</div>
            </div>
            <div className="rounded-card border border-hairline bg-surface p-4 text-center">
              <div className="text-lg font-bold text-warning">{fmtAmount(totalPending)}</div>
              <div className="text-xs text-muted">Pending approval</div>
            </div>
            <div className="rounded-card border border-hairline bg-surface p-4 text-center">
              <div className="text-lg font-bold text-muted">{fmtAmount(totalGst)}</div>
              <div className="text-xs text-muted">GST (filed)</div>
            </div>
            <div className="rounded-card border border-hairline bg-surface p-4 text-center">
              <div className="text-lg font-bold text-ink">{documents.length}</div>
              <div className="text-xs text-muted">Total documents</div>
            </div>
          </div>

          {/* WIP teaser (Phase 2) */}
          <div className="rounded-card border border-dashed border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-semibold text-primary">WIP calculation coming in Phase 2</p>
            <p className="text-xs text-muted mt-1">
              Once Xero is connected, this panel will show: contract value, % complete (from Schedule Manager),
              revenue recognised, progress claims billed, and WIP position — the APB monthly scorecard view.
            </p>
          </div>

          {/* Document list */}
          {loading && <p className="text-sm text-muted">Loading…</p>}

          {!loading && !documents.length && (
            <p className="text-sm text-muted">No documents filed against this job yet.</p>
          )}

          {!loading && documents.length > 0 && (
            <div className="overflow-x-auto rounded-card border border-hairline bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-hairline bg-page text-xs font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    {["Supplier", "Invoice #", "Date", "Amount (inc GST)", "Status", "Filed at"].map(h => (
                      <th key={h} className="px-3 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {documents.map(doc => (
                    <tr key={doc.id} className="border-b border-hairline hover:bg-page">
                      <td className="px-3 py-2.5">
                        <span className="font-semibold text-ink">{doc.supplier_name || "—"}</span>
                        {doc.description && <span className="block text-xs text-muted truncate max-w-[200px]">{doc.description}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-muted">{doc.invoice_number || "—"}</td>
                      <td className="px-3 py-2.5 text-muted">{fmtDate(doc.invoice_date)}</td>
                      <td className="px-3 py-2.5 font-semibold text-ink">{fmtAmount(doc.amount_total)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_CHIP[doc.status] || "border-hairline bg-page text-muted"}`}>
                          {doc.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted truncate max-w-[160px]">
                        {doc.dropbox_path ? doc.dropbox_path.split("/").pop() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-hairline bg-page">
                  <tr>
                    <td colSpan={3} className="px-3 py-2.5 text-xs font-bold text-muted">Filed total</td>
                    <td className="px-3 py-2.5 text-sm font-bold text-ink">{fmtAmount(totalFiled)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
