import { authFetch } from "../../lib/authFetch.js";
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

function NumInput({ label, value, onSave, hint }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function open() { setDraft(value != null ? String(value) : ""); setEditing(true); }
  function save() {
    const n = parseFloat(draft);
    onSave(isNaN(n) ? null : n);
    setEditing(false);
  }

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-hairline last:border-0">
      <div>
        <span className="text-sm text-muted">{label}</span>
        {hint && <span className="block text-xs text-muted/60">{hint}</span>}
      </div>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted">$</span>
          <input
            autoFocus
            type="number"
            min="0"
            step="1000"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            className="w-36 rounded-lg border border-hairline px-2 py-1 text-sm text-ink bg-page focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button onClick={save} className="rounded bg-primary px-2 py-1 text-xs font-semibold text-white">✓</button>
          <button onClick={() => setEditing(false)} className="text-xs text-muted hover:text-ink">✕</button>
        </div>
      ) : (
        <button onClick={open} className="text-sm font-semibold text-ink hover:text-primary transition-colors">
          {value != null ? fmtAmount(value) : <span className="text-muted italic text-xs">Click to set…</span>}
        </button>
      )}
    </div>
  );
}

function WipaaBar({ pct }) {
  const pctClamped = Math.min(Math.max(pct || 0, 0), 1);
  return (
    <div className="mt-2 h-3 rounded-full bg-page border border-hairline overflow-hidden">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${(pctClamped * 100).toFixed(1)}%` }}
      />
    </div>
  );
}

function WipaaPanel({ jobId, contractValue, estimatedTotalCost, progressBilled, onSaveJob }) {
  const [wipaa, setWipaa] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/finance/jobs/${jobId}/wipaa`).then(r => r.json());
      if (r.ok) setWipaa(r.wipaa);
    } finally { setLoading(false); }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  // Reload when saved values change (after patch)
  useEffect(() => { load(); }, [contractValue, estimatedTotalCost, progressBilled, load]);

  const ready = wipaa?.pct_complete != null;
  const overbilled = wipaa?.wipaa != null && wipaa.wipaa < 0;

  return (
    <div className="rounded-card border border-primary/20 bg-primary/[0.03] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-primary">WIPAA Calculator</p>
          <p className="text-xs text-muted">Work In Progress Accounting Adjustment — APB monthly method</p>
        </div>
        <button onClick={load} disabled={loading} className="text-xs text-primary hover:opacity-70 disabled:opacity-40">↺ Refresh</button>
      </div>

      {/* Editable inputs */}
      <div className="rounded-lg border border-hairline bg-surface p-4 space-y-0">
        <NumInput
          label="Contract value (ex GST)"
          value={contractValue}
          onSave={v => onSaveJob({ contract_value: v })}
          hint="Total price agreed with client"
        />
        <NumInput
          label="Estimated total cost (ex GST)"
          value={estimatedTotalCost}
          onSave={v => onSaveJob({ estimated_total_cost: v })}
          hint="Budgeted cost to complete project"
        />
        <NumInput
          label="Progress billed to client (ex GST)"
          value={progressBilled}
          onSave={v => onSaveJob({ progress_billed: v })}
          hint="Progress claims invoiced to date · Xero will feed this automatically"
        />
      </div>

      {/* Derived outputs */}
      {loading && <p className="text-sm text-muted">Calculating…</p>}

      {!loading && wipaa && (
        <>
          <div className="rounded-lg border border-hairline bg-surface p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Actual cost to date</span>
              <span className="font-semibold text-ink">
                {fmtAmount(wipaa.cost_to_date)}
                <span className="text-xs text-muted ml-1">({wipaa.invoice_count} invoice{wipaa.invoice_count !== 1 ? "s" : ""})</span>
              </span>
            </div>

            {ready ? (
              <>
                <div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">% Complete</span>
                    <span className="font-bold text-ink">{(wipaa.pct_complete * 100).toFixed(1)}%</span>
                  </div>
                  <WipaaBar pct={wipaa.pct_complete} />
                  <p className="text-xs text-muted mt-1">Cost incurred ÷ estimated total cost</p>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-muted">Earned revenue</span>
                  <span className="font-semibold text-ink">{fmtAmount(wipaa.earned_revenue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Progress billed</span>
                  <span className="font-semibold text-ink">{fmtAmount(wipaa.progress_billed)}</span>
                </div>

                <div className={`rounded-lg px-4 py-3 border ${overbilled ? "border-warning/40 bg-warning/10" : "border-accent/30 bg-accent/10"}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-ink">WIPAA position</span>
                    <span className={`text-lg font-bold ${overbilled ? "text-warning" : "text-accent"}`}>
                      {wipaa.wipaa >= 0 ? "+" : ""}{fmtAmount(wipaa.wipaa)}
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-1">
                    {overbilled
                      ? "Over-billed — you have collected more than earned. Liability on balance sheet."
                      : "Under-billed — you have earned more than collected. Asset on balance sheet."}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted italic">
                Set contract value and estimated total cost above to calculate WIPAA position.
              </p>
            )}
          </div>

          <div className="text-xs text-muted space-y-0.5 bg-page rounded-lg px-3 py-2.5 border border-hairline">
            <p className="font-semibold text-ink mb-1">WIPAA formula (APB)</p>
            <p>% Complete = Cost incurred ÷ Total estimated cost</p>
            <p>Earned revenue = % Complete × Contract value</p>
            <p>WIPAA = Earned revenue − Progress billed</p>
          </div>
        </>
      )}

      {contractValue != null && estimatedTotalCost != null && (() => {
        const projectedMargin = contractValue - estimatedTotalCost;
        const marginPct = (projectedMargin / contractValue) * 100;
        const marginColor = marginPct >= 40 ? "text-accent" : marginPct >= 33 ? "text-warning" : "text-danger";
        return (
          <div className="rounded-card border border-hairline bg-surface p-4">
            <p className="text-sm font-bold text-primary mb-3">Project P&L</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-hairline bg-page p-3 text-center">
                <div className="text-base font-bold text-ink">{fmtAmount(contractValue)}</div>
                <div className="text-xs text-muted mt-0.5">Contract value</div>
              </div>
              <div className="rounded-lg border border-hairline bg-page p-3 text-center">
                <div className="text-base font-bold text-ink">{fmtAmount(estimatedTotalCost)}</div>
                <div className="text-xs text-muted mt-0.5">Estimated total cost</div>
              </div>
              <div className="rounded-lg border border-hairline bg-page p-3 text-center">
                <div className={`text-base font-bold ${marginColor}`}>{fmtAmount(projectedMargin)}</div>
                <div className="text-xs text-muted mt-0.5">Projected margin $</div>
              </div>
              <div className="rounded-lg border border-hairline bg-page p-3 text-center">
                <div className={`text-base font-bold ${marginColor}`}>{marginPct.toFixed(1)}%</div>
                <div className="text-xs text-muted mt-0.5">Projected margin %</div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default function JobFinancials() {
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadJobs = useCallback(async () => {
    const r = await authFetch("/api/finance/jobs").then(r => r.json());
    if (r.ok) setJobs(r.jobs);
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const loadDocs = useCallback(async (jobId) => {
    if (!jobId) { setDocuments([]); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/finance/documents?job_id=${jobId}&limit=200`).then(r => r.json());
      if (r.ok) setDocuments(r.documents);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDocs(selectedJobId); }, [selectedJobId, loadDocs]);

  async function saveJobField(updates) {
    if (!selectedJobId) return;
    const r = await fetch(`/api/finance/jobs/${selectedJobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    }).then(r => r.json());
    if (r.ok) setJobs(prev => prev.map(j => j.id === selectedJobId ? { ...j, ...r.job } : j));
  }

  const job = jobs.find(j => j.id === selectedJobId);

  const filed = documents.filter(d => ["filed", "approved", "xero_synced"].includes(d.status));
  const totalFiled = filed.reduce((s, d) => s + Number(d.amount_total || 0), 0);

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
            <option key={j.id} value={j.id}>{j.address}{j.arch_ref ? ` · ${j.arch_ref}` : ""}</option>
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
          {/* WIPAA Calculator */}
          <WipaaPanel
            jobId={selectedJobId}
            contractValue={job?.contract_value ?? null}
            estimatedTotalCost={job?.estimated_total_cost ?? null}
            progressBilled={job?.progress_billed ?? null}
            onSaveJob={saveJobField}
          />

          {/* Document list */}
          {loading && <p className="text-sm text-muted">Loading…</p>}

          {!loading && !documents.length && (
            <p className="text-sm text-muted">No documents filed against this job yet.</p>
          )}

          {!loading && documents.length > 0 && (
            <div className="overflow-x-auto rounded-card border border-hairline bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-hairline bg-page section-label">
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
