// CaptureInvoiceCard — capture a supplier invoice / misc receipt onto a carpentry job: scan or upload
// a PDF/photo (phone opens the camera), Haiku OCR prefills supplier + ex-GST amount + invoice date, the
// operator confirms, and it's filed to Dropbox (/BLUE LEAF BUILDING/RECIEPTS, named "<D.M.YYYY>
// <supplier>") and added to the job's material tally. Shared by the internal-house glance + the Carpentry
// job Costs tab. For real jobs, pass budgetCategories=[{id,name}] (material budget lines) to let the user
// file the cost against a cost category. Shows a double-count guard when the job also has Finance invoices.
import { useState, useRef } from "react";
import { apiFetch, apiPost } from "../../lib/apiFetch.js";
import { fileToUploadBase64 } from "../../lib/receiptFile.js";

const fmt$ = (n) => (n == null ? "—" : `$${Math.round(Number(n)).toLocaleString()}`);

export default function CaptureInvoiceCard({ jobId, costs = [], onSaved, budgetCategories = [], receiptsOnly = false }) {
  const fileRef = useRef(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  // receiptsOnly: list only the rows that have a stored receipt (used where a full cost table already
  // lists every manual cost, e.g. the Carpentry job Costs tab, so we don't duplicate it).
  const captured = costs.filter((c) => c.source === "manual" && (!receiptsOnly || c.hasReceipt))
    .sort((a, b) => String(b.costDate || "").localeCompare(String(a.costDate || "")));
  const financeCount = costs.filter((c) => c.source === "finance").length;

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    setScanBusy(true); setMsg(null); setDraft(null);
    try {
      const { base64, mimeType } = await fileToUploadBase64(file);
      const { ok, data, error } = await apiPost(`/api/carpentry/jobs/${jobId}/cost-receipt/scan`, { fileBase64: base64, mimeType });
      if (!ok) { setMsg({ type: "error", text: error || "Couldn't read the invoice." }); return; }
      setDraft({
        fileBase64: base64,
        mimeType,
        supplierName: data.supplierName || "",
        description: data.suggestedDescription || data.supplierName || "Supplier invoice",
        amount: data.amountExGst != null ? String(data.amountExGst) : "",
        costDate: data.invoiceDate || new Date().toISOString().slice(0, 10),
        budgetId: "",
      });
      if (!data.extractionOk || data.amountExGst == null) setMsg({ type: "info", text: "Couldn't auto-read the amount — check the invoice and enter it below." });
    } catch (ex) {
      setMsg({ type: "error", text: ex.message || "Couldn't process that file." });
    } finally { setScanBusy(false); }
  }

  async function save() {
    if (!draft) return;
    if (!draft.description.trim()) { setMsg({ type: "error", text: "Add a description." }); return; }
    const amt = Number(draft.amount);
    if (draft.amount === "" || !(amt >= 0)) { setMsg({ type: "error", text: "Enter the ex-GST amount." }); return; }
    setSaving(true); setMsg(null);
    const { ok, data, error } = await apiPost(`/api/carpentry/jobs/${jobId}/cost-receipt`, {
      fileBase64: draft.fileBase64,
      mimeType: draft.mimeType,
      costType: "material",
      description: draft.description.trim(),
      amount: amt,
      costDate: draft.costDate,
      supplierName: draft.supplierName || undefined,
      carpentryJobBudgetId: draft.budgetId || undefined,
    });
    setSaving(false);
    if (!ok) { setMsg({ type: "error", text: error || "Couldn't save the cost." }); return; }
    setDraft(null);
    setMsg({ type: data.receiptWarning ? "info" : "success", text: data.receiptWarning || "Invoice added to the job tally — filed to Dropbox." });
    onSaved?.();
  }

  async function openReceipt(costId) {
    const { ok, data } = await apiFetch(`/api/carpentry/jobs/${jobId}/costs/${costId}/receipt-link`);
    if (ok && data?.url) window.open(data.url, "_blank", "noopener");
    else setMsg({ type: "error", text: "Couldn't open the receipt." });
  }

  return (
    <div className="rounded-card border border-hairline bg-surface overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-hairline">
        <h2 className="text-sm font-semibold text-ink">Supplier invoices &amp; misc costs</h2>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={onFile} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={scanBusy || saving}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {scanBusy ? "Reading…" : "📷 Scan / upload invoice"}
          </button>
        </div>
      </div>

      {financeCount > 0 && (
        <p className="mx-4 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          ⚠ This job already has {financeCount} supplier invoice{financeCount === 1 ? "" : "s"} from Finance. Capture misc
          receipts here — don&rsquo;t re-enter a Finance invoice here too, or it&rsquo;ll be counted twice.
        </p>
      )}

      {msg && <p className={`px-4 pt-3 text-xs ${msg.type === "error" ? "text-red-600" : msg.type === "success" ? "text-green-600" : "text-muted"}`}>{msg.text}</p>}

      {draft && (
        <div className="m-4 rounded-lg border border-primary/30 bg-primary/[0.03] p-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Confirm the invoice — then it adds to the tally</p>
          <div className={`grid grid-cols-1 gap-2 ${budgetCategories.length ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
            <label className="text-xs text-muted">Supplier / description
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
            {budgetCategories.length > 0 && (
              <label className="text-xs text-muted">Cost category
                <select value={draft.budgetId} onChange={(e) => setDraft((d) => ({ ...d, budgetId: e.target.value }))}
                  className="mt-0.5 w-full rounded-lg border border-hairline px-2 py-1.5 text-sm text-ink bg-white focus-ring">
                  <option value="">— Uncategorised —</option>
                  {budgetCategories.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <p className="text-[10px] text-muted">Read by AI from the file — check the amount before saving. Stored ex-GST; filed to Dropbox as the invoice date + supplier.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setDraft(null); setMsg(null); }} disabled={saving}
              className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-page">Discard</button>
            <button type="button" onClick={save} disabled={saving}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">{saving ? "Saving…" : "Add to job"}</button>
          </div>
        </div>
      )}

      {captured.length === 0 ? (
        !draft && <p className="p-4 text-sm text-muted">No invoices captured here yet. Scan or upload a supplier receipt and it adds straight to the job&rsquo;s material tally.</p>
      ) : (
        <div className="divide-y divide-hairline">
          {captured.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink truncate">{c.supplierName || c.description}</p>
                <p className="text-[11px] text-muted truncate">{c.supplierName && c.description && c.description !== c.supplierName ? `${c.description} · ` : ""}{c.costDate || ""}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {c.hasReceipt && <button type="button" onClick={() => openReceipt(c.id)} className="text-xs text-primary hover:underline">📄 View</button>}
                <span className="text-sm font-semibold text-ink">{fmt$(c.amount)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
