// =============================================================================
// InternalHouseJobDetail — cost-only "glance" layout for the two internal house
// jobs (references BL-JOSH-HOUSE / BL-SAM-HOUSE, seeded by mig 202). These are
// real carpentry_jobs (so finance invoices + timesheet hours attach directly) but
// carry NO Buildxact quote and NO budget/allowance — so instead of the standard
// budget-vs-variance tabs they get this Charge-Up-STYLE panel: total hours +
// labour $ + material $ by cost category + tasks done. No budget/variance UI.
//
// Reads existing endpoints only:
//   GET /api/carpentry/jobs/:id/summary  → hours, labour $ (+ by category), material $ total
//   GET /api/carpentry/jobs/:id/costs    → material/other rows (manual + finance read-through, Phase 0)
//   GET /api/carpentry/jobs/:id/tasks    → site_tasks (completed ones = "tasks done")
// Rendered by CarpentryJobDetail's reference branch (see INTERNAL_HOUSE_REFERENCES).
// =============================================================================
import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { apiFetch, apiPost } from "../lib/apiFetch.js";
import { useAuth } from "../lib/useAuth.js";
import { can } from "../lib/roles.js";

const fmt$ = (n) => (n == null ? "—" : `$${Math.round(Number(n)).toLocaleString()}`);
const fmtH = (n) => (n == null ? "—" : `${Math.round(Number(n) * 10) / 10}`);

// Read a chosen invoice file for upload: PDFs pass through as-is; images are downscaled + JPEG-compressed
// (phone photos are large) so the scan POST stays small. Returns { base64, mimeType }.
function fileToUploadBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    if (!file.type?.startsWith("image/")) {
      reader.onload = () => resolve({ base64: String(reader.result).split(",")[1] || "", mimeType: file.type || "application/pdf" });
      reader.readAsDataURL(file);
      return;
    }
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read the image."));
      img.onload = () => {
        const maxDim = 1800;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const s = maxDim / Math.max(width, height);
          width = Math.round(width * s); height = Math.round(height * s);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
        resolve({ base64: dataUrl.split(",")[1] || "", mimeType: "image/jpeg" });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Humanise a timesheet task_category slug (mirrors CarpentryJobDetail's CATEGORY_LABEL_MAP,
// with a title-case fallback for any unmapped stream so nothing renders as a raw slug).
const TASK_CATEGORY_LABELS = {
  general: "General", defect: "Defect", safety: "Safety", materials: "Materials",
  inspection: "Inspection", first_fix_framing: "Framing", cladding: "Cladding",
  second_fix: "Second Fix", outdoor_works: "Outdoor Works",
  formwork_slab_prep: "Formwork / Slab Prep", site_labouring: "Site Labouring",
  site_cleanup: "Site Cleanup", supervision: "Supervision",
};
const catLabel = (c) =>
  TASK_CATEGORY_LABELS[c] || String(c || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase()) || "Uncategorised";

export default function InternalHouseJobDetail({ job }) {
  const { role } = useAuth();
  const showCost = can.viewCostData(role);   // director-gate all $ like the other carpentry views

  const [summary, setSummary] = useState(null);
  const [costs, setCosts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Scan / upload a supplier invoice straight onto this job (director-only, behind showCost).
  const fileRef = useRef(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanMsg, setScanMsg] = useState(null);         // { type, text }
  const [draft, setDraft] = useState(null);             // prefilled cost awaiting confirmation
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [sumRes, costRes, taskRes] = await Promise.all([
      apiFetch(`/api/carpentry/jobs/${job.id}/summary`),
      apiFetch(`/api/carpentry/jobs/${job.id}/costs`),
      apiFetch(`/api/carpentry/jobs/${job.id}/tasks`),
    ]);
    setLoading(false);
    if (!sumRes.ok) { setError(sumRes.error || "Could not load this job."); return; }
    setError(null);
    setSummary(sumRes.data?.summary || null);
    setCosts(costRes.ok ? (costRes.data?.costs || []) : []);
    setTasks(taskRes.ok ? (taskRes.data?.tasks || []) : []);
  }, [job.id]);
  useEffect(() => { load(); }, [load]);

  async function onInvoiceFile(e) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";   // allow re-picking the same file
    if (!file) return;
    setScanBusy(true); setScanMsg(null); setDraft(null);
    try {
      const { base64, mimeType } = await fileToUploadBase64(file);
      const { ok, data, error: err } = await apiPost(`/api/carpentry/jobs/${job.id}/cost-receipt/scan`, {
        fileBase64: base64, mimeType, filename: file.name,
      });
      if (!ok) { setScanMsg({ type: "error", text: err || "Couldn't read the invoice." }); return; }
      setDraft({
        receiptPath: data.receiptPath,
        supplierName: data.supplierName || "",
        description: data.suggestedDescription || data.supplierName || "Supplier invoice",
        amount: data.amountExGst != null ? String(data.amountExGst) : "",
        costDate: data.invoiceDate || new Date().toISOString().slice(0, 10),
      });
      if (!data.extractionOk || data.amountExGst == null) {
        setScanMsg({ type: "info", text: "Couldn't auto-read the amount — check the invoice and enter it below." });
      }
    } catch (ex) {
      setScanMsg({ type: "error", text: ex.message || "Couldn't process that file." });
    } finally { setScanBusy(false); }
  }

  async function saveInvoiceCost() {
    if (!draft) return;
    if (!draft.description.trim()) { setScanMsg({ type: "error", text: "Add a description." }); return; }
    const amt = Number(draft.amount);
    if (draft.amount === "" || !(amt >= 0)) { setScanMsg({ type: "error", text: "Enter the ex-GST amount." }); return; }
    setSaving(true); setScanMsg(null);
    const { ok, error: err } = await apiPost(`/api/carpentry/jobs/${job.id}/costs`, {
      costType: "material",
      description: draft.description.trim(),
      amount: amt,
      costDate: draft.costDate,
      receiptPath: draft.receiptPath,
      supplierName: draft.supplierName || undefined,
    });
    setSaving(false);
    if (!ok) { setScanMsg({ type: "error", text: err || "Couldn't save the cost." }); return; }
    setDraft(null);
    setScanMsg({ type: "success", text: "Invoice added to the job tally." });
    await load();
  }

  // Captured supplier invoices = the manual cost rows (what we've added here); finance read-through
  // rows are shown in the category table, not re-listed. Newest first.
  const capturedInvoices = costs.filter((c) => c.source === "manual")
    .sort((a, b) => String(b.costDate || "").localeCompare(String(a.costDate || "")));

  // Labour by category — from summary (already reconciles to summary.labourActual). Fail-soft if
  // the API predates the labourByCategory field (older server): fall back to a single labour row.
  const labourByCategory = summary?.labourByCategory
    || (summary ? [{ category: "general", hours: summary.labourHours ?? null, cost: summary.labourActual }] : []);

  // Material / other by category — group the /costs rows (manual carpentry_job_costs + finance
  // read-through, Phase 0) by their category label. Category is free text; null → "Uncategorised".
  const materialByCategory = (() => {
    const map = new Map();
    for (const c of costs) {
      const key = c.category || "Uncategorised";
      const cur = map.get(key) || { category: key, amount: 0, hasFinance: false };
      cur.amount += Number(c.amount || 0);
      if (c.source === "finance") cur.hasFinance = true;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  })();

  const doneTasks = tasks
    .filter((t) => t.status === "done")
    .sort((a, b) => String(b.completedAt || "").localeCompare(String(a.completedAt || "")));

  const jobName = job.address || job.clientName || job.reference || "Internal house";

  return (
    <div className="space-y-6 pb-24 p-6 max-w-4xl mx-auto">
      <header>
        <Link to="/carpentry" className="text-xs text-primary hover:underline">&larr; Carpentry</Link>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mt-2">Internal · Blue Leaf</p>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">{jobName}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Cost-only internal job — hours, labour and material spend tracked against actuals. No quote,
          no budget or variance. Scan or upload supplier invoices below (or allocate them in Finance).
        </p>
      </header>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <p className="p-4 text-sm text-muted">Loading…</p>
      ) : (
        <>
          {/* KPI tiles */}
          {summary && (
            <div className={`grid grid-cols-2 gap-3 ${showCost ? "sm:grid-cols-4" : "sm:grid-cols-1"}`}>
              <div className="rounded-card border border-hairline bg-surface px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted">Total hours</p>
                <p className="text-2xl font-semibold text-ink mt-0.5">{fmtH(summary.labourHours)}</p>
              </div>
              {showCost && (
                <div className="rounded-card border border-hairline bg-surface px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted">Labour $</p>
                  <p className="text-2xl font-semibold text-ink mt-0.5">{fmt$(summary.labourActual)}</p>
                </div>
              )}
              {showCost && (
                <div className="rounded-card border border-hairline bg-surface px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted">Material $</p>
                  <p className="text-2xl font-semibold text-ink mt-0.5">{fmt$(summary.otherActual)}</p>
                  {summary.financeActual > 0 && (
                    <p className="text-[10px] text-muted mt-0.5">{fmt$(summary.financeActual)} from invoices</p>
                  )}
                </div>
              )}
              {showCost && (
                <div className="rounded-card border border-hairline bg-surface px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted">Total $</p>
                  <p className="text-2xl font-semibold text-accent mt-0.5">{fmt$(summary.totalActual)}</p>
                </div>
              )}
            </div>
          )}

          {/* Labour by cost category */}
          {showCost && (
            <div className="rounded-card border border-hairline bg-surface overflow-hidden">
              <h2 className="text-sm font-semibold text-ink px-4 py-2 border-b border-hairline">Labour by category</h2>
              {labourByCategory.length === 0 ? (
                <p className="p-4 text-sm text-muted">No approved hours logged yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-hairline">
                        <th className="px-4 py-2">Category</th>
                        <th className="px-2 py-2 text-right">Hours</th>
                        <th className="px-4 py-2 text-right">Labour $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labourByCategory.map((l) => (
                        <tr key={l.category} className="border-b border-hairline/60 last:border-0">
                          <td className="px-4 py-2 font-medium text-ink">{catLabel(l.category)}</td>
                          <td className="px-2 py-2 text-right text-ink">{fmtH(l.hours)}</td>
                          <td className="px-4 py-2 text-right text-ink">{fmt$(l.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {summary && (
                      <tfoot>
                        <tr className="border-t border-hairline text-[13px] font-semibold text-ink">
                          <td className="px-4 py-2">Total</td>
                          <td className="px-2 py-2 text-right">{fmtH(summary.labourHours)}</td>
                          <td className="px-4 py-2 text-right">{fmt$(summary.labourActual)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Supplier invoices — scan / upload a PDF or photo straight onto the job (adds to the tally) */}
          {showCost && (
            <div className="rounded-card border border-hairline bg-surface overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-hairline">
                <h2 className="text-sm font-semibold text-ink">Supplier invoices</h2>
                <div className="flex items-center gap-2">
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={onInvoiceFile} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={scanBusy || saving}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                    {scanBusy ? "Reading…" : "📷 Scan / upload invoice"}
                  </button>
                </div>
              </div>

              {scanMsg && (
                <p className={`px-4 pt-3 text-xs ${scanMsg.type === "error" ? "text-red-600" : scanMsg.type === "success" ? "text-green-600" : "text-muted"}`}>{scanMsg.text}</p>
              )}

              {draft && (
                <div className="m-4 rounded-lg border border-primary/30 bg-primary/[0.03] p-3 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Confirm the invoice — then it adds to the tally</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className="text-xs text-muted sm:col-span-1">Supplier / description
                      <input value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                        className="mt-0.5 w-full rounded-lg border border-hairline px-2 py-1.5 text-sm text-ink focus-ring" />
                    </label>
                    <label className="text-xs text-muted">Amount (ex-GST)
                      <input type="number" step="0.01" min="0" value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                        placeholder="0.00" className="mt-0.5 w-full rounded-lg border border-hairline px-2 py-1.5 text-sm text-ink text-right focus-ring" />
                    </label>
                    <label className="text-xs text-muted">Date
                      <input type="date" value={draft.costDate} onChange={(e) => setDraft((d) => ({ ...d, costDate: e.target.value }))}
                        className="mt-0.5 w-full rounded-lg border border-hairline px-2 py-1.5 text-sm text-ink focus-ring" />
                    </label>
                  </div>
                  <p className="text-[10px] text-muted">Read by AI from the file — check the amount before saving. Stored ex-GST.</p>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => { setDraft(null); setScanMsg(null); }} disabled={saving}
                      className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-page">Discard</button>
                    <button type="button" onClick={saveInvoiceCost} disabled={saving}
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">{saving ? "Saving…" : "Add to job"}</button>
                  </div>
                </div>
              )}

              {capturedInvoices.length === 0 ? (
                !draft && <p className="p-4 text-sm text-muted">No invoices captured here yet. Scan or upload a supplier invoice and it adds straight to the job&rsquo;s material tally.</p>
              ) : (
                <div className="divide-y divide-hairline">
                  {capturedInvoices.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink truncate">{c.supplierName || c.description}</p>
                        <p className="text-[11px] text-muted truncate">{c.supplierName && c.description && c.description !== c.supplierName ? `${c.description} · ` : ""}{c.costDate || ""}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {c.receiptUrl && <a href={c.receiptUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">📄 View</a>}
                        <span className="text-sm font-semibold text-ink">{fmt$(c.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Material / other by cost category (manual costs + finance invoices) */}
          {showCost && (
            <div className="rounded-card border border-hairline bg-surface overflow-hidden">
              <h2 className="text-sm font-semibold text-ink px-4 py-2 border-b border-hairline">Materials &amp; other by category</h2>
              {materialByCategory.length === 0 ? (
                <p className="p-4 text-sm text-muted">No material or supplier costs yet. Scan or upload a supplier invoice above, or allocate one in Finance.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-hairline">
                        <th className="px-4 py-2">Category</th>
                        <th className="px-4 py-2 text-right">Amount $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materialByCategory.map((m) => (
                        <tr key={m.category} className="border-b border-hairline/60 last:border-0">
                          <td className="px-4 py-2 font-medium text-ink">
                            {m.category}
                            {m.hasFinance && <span className="ml-2 text-[10px] uppercase tracking-wide text-accent">invoiced</span>}
                          </td>
                          <td className="px-4 py-2 text-right text-ink">{fmt$(m.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {summary && (
                      <tfoot>
                        <tr className="border-t border-hairline text-[13px] font-semibold text-ink">
                          <td className="px-4 py-2">Total</td>
                          <td className="px-4 py-2 text-right">{fmt$(summary.otherActual)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tasks done */}
          <div className="rounded-card border border-hairline bg-surface overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-hairline">
              <h2 className="text-sm font-semibold text-ink">Tasks done</h2>
              <span className="text-xs text-muted">{doneTasks.length} of {tasks.length}</span>
            </div>
            {doneTasks.length === 0 ? (
              <p className="p-4 text-sm text-muted">No completed tasks yet.</p>
            ) : (
              <div className="divide-y divide-hairline">
                {doneTasks.map((t) => (
                  <div key={t.id} className="flex items-start gap-3 p-3">
                    <span className="mt-0.5 text-accent" aria-hidden>✓</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink">{t.title}</p>
                      <p className="text-[11px] text-muted mt-0.5">
                        {catLabel(t.category)}
                        {t.completer?.name ? ` · ${t.completer.name}` : ""}
                        {t.completedAt ? ` · ${String(t.completedAt).slice(0, 10)}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
