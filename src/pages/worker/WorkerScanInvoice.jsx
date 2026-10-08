// WorkerScanInvoice — Worker PWA screen to scan/upload a supplier invoice onto ANY carpentry job.
// Leading hands / admins / supervisors only (gated on /api/worker/me.canCaptureCosts; the server enforces
// it too). Scan -> Haiku OCR prefill -> confirm ex-GST amount -> filed to Dropbox + added to the job tally.
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import WorkerLayout from "../../components/worker/WorkerLayout.jsx";
import { workerFetch, isWorkerPreview } from "../../lib/workerFetch.js";
import { fileToUploadBase64 } from "../../lib/receiptFile.js";

export default function WorkerScanInvoice() {
  const navigate = useNavigate();
  const preview = isWorkerPreview();
  const cameraRef = useRef(null);  // capture="environment" → opens the camera directly
  const uploadRef = useRef(null);  // no capture → iOS offers Photo Library + Files (existing photo or PDF)

  const [loading, setLoading] = useState(true);
  const [canCapture, setCanCapture] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [jobId, setJobId] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dup, setDup] = useState(null);     // possible duplicate flagged at scan time (soft — overridable)
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let stop = false;
    Promise.all([
      workerFetch("/api/worker/me").then((r) => r.json()).catch(() => ({ ok: false })),
      workerFetch("/api/worker/projects").then((r) => r.json()).catch(() => ({ ok: false })),
    ]).then(([me, proj]) => {
      if (stop) return;
      setCanCapture(me?.ok ? !!me.canCaptureCosts : false);
      const list = proj?.ok ? (proj.projects || []) : [];
      const js = list.filter((p) => p.type === "carpentry");
      setJobs(js);
      if (js.length === 1) setJobId(js[0].id);
      setLoading(false);
    });
    return () => { stop = true; };
  }, []);

  const isDirector = canCapture;

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    if (!jobId) { setMsg({ type: "error", text: "Pick a job first." }); return; }
    setScanBusy(true); setMsg(null); setDraft(null); setDup(null);
    try {
      const { base64, mimeType } = await fileToUploadBase64(file);
      const res = await workerFetch(`/api/worker/carpentry/jobs/${jobId}/cost-receipt/scan`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: base64, mimeType }),
      });
      const j = await res.json();
      if (!j.ok) { setMsg({ type: "error", text: j.error || "Couldn't read the invoice." }); return; }
      setDraft({
        fileBase64: base64,
        mimeType,
        supplierName: j.supplierName || "",
        description: j.suggestedDescription || j.supplierName || "Supplier invoice",
        amount: j.amountExGst != null ? String(j.amountExGst) : "",
        costDate: j.invoiceDate || new Date().toISOString().slice(0, 10),
        invoiceNumber: j.invoiceNumber || "",
      });
      setDup(j.possibleDuplicate || null);
      if (!j.extractionOk || j.amountExGst == null) setMsg({ type: "info", text: "Couldn't auto-read the amount — check the invoice and enter it below." });
    } catch (ex) {
      setMsg({ type: "error", text: ex.message || "Couldn't process that file." });
    } finally { setScanBusy(false); }
  }

  async function save() {
    if (!draft) return;
    const amt = Number(draft.amount);
    if (!draft.description.trim()) { setMsg({ type: "error", text: "Add a description." }); return; }
    if (draft.amount === "" || !(amt >= 0)) { setMsg({ type: "error", text: "Enter the ex-GST amount." }); return; }
    setSaving(true); setMsg(null);
    const res = await workerFetch(`/api/worker/carpentry/jobs/${jobId}/cost-receipt`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileBase64: draft.fileBase64, mimeType: draft.mimeType, costType: "material", description: draft.description.trim(), amount: amt, costDate: draft.costDate, supplierName: draft.supplierName || undefined, invoiceNumber: draft.invoiceNumber || undefined }),
    });
    const j = await res.json();
    setSaving(false);
    if (!j.ok) { setMsg({ type: "error", text: j.error || "Couldn't save the cost." }); return; }
    setDraft(null); setDup(null);
    setMsg({ type: j.receiptWarning ? "info" : "success", text: j.receiptWarning || "Invoice added to the job tally — filed to Dropbox." });
  }

  return (
    <WorkerLayout onBack={() => navigate("/worker")}>
      <div className="p-4 space-y-4">
        <h1 className="text-xl font-semibold text-ink">Scan a supplier invoice</h1>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : preview ? (
          <p className="text-sm text-muted">Not available in preview mode.</p>
        ) : !isDirector ? (
          <p className="text-sm text-muted">This is only available to admins and supervisors.</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted">No carpentry jobs found.</p>
        ) : (
          <>
            <label className="block text-sm text-muted">Job
              <select value={jobId} onChange={(e) => { setJobId(e.target.value); setDraft(null); setMsg(null); }}
                className="mt-1 w-full rounded-lg border border-hairline px-3 py-2.5 text-sm bg-white text-ink">
                <option value="">Select…</option>
                {jobs.map((jb) => <option key={jb.id} value={jb.id}>{jb.address || jb.reference}</option>)}
              </select>
            </label>

            {/* Two paths, same handler: the camera button forces the camera (one tap, for the field);
                the upload button has NO capture attr, so iOS shows Photo Library + Files — letting you
                pick a photo you already took or a PDF (a capture-only input hides both on iPhone). */}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
            <input ref={uploadRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={!jobId || scanBusy || saving} onClick={() => cameraRef.current?.click()}
                className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
                {scanBusy ? "Reading…" : "📷 Take photo"}
              </button>
              <button type="button" disabled={!jobId || scanBusy || saving} onClick={() => uploadRef.current?.click()}
                className="rounded-lg border border-primary px-4 py-3 text-sm font-semibold text-primary disabled:opacity-50">
                {scanBusy ? "Reading…" : "Upload photo or PDF"}
              </button>
            </div>

            {msg && <p className={`text-sm ${msg.type === "error" ? "text-red-600" : msg.type === "success" ? "text-green-600" : "text-muted"}`}>{msg.text}</p>}

            {draft && (
              <div className="rounded-lg border border-primary/30 bg-primary/[0.03] p-3 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Confirm — then it adds to the tally</p>
                {dup && (
                  <p className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                    ⚠ {dup.matchType === "invoice"
                      ? `Invoice #${dup.existing.invoiceNumber} from ${dup.existing.supplierName || "this supplier"} looks like it's already on this job`
                      : "A cost with the same supplier, date and amount is already on this job"}
                    {` (${dup.existing.supplierName || dup.existing.description || "—"} · ${dup.existing.costDate || "?"} · $${Math.round(Number(dup.existing.amount || 0)).toLocaleString()}).`}
                    {" Only add again if it's a separate bill."}
                  </p>
                )}
                <label className="block text-xs text-muted">Supplier / description
                  <input value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    className="mt-0.5 w-full rounded-lg border border-hairline px-2 py-2 text-sm text-ink" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs text-muted">Amount (ex-GST)
                    <input type="number" step="0.01" min="0" inputMode="decimal" value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                      placeholder="0.00" className="mt-0.5 w-full rounded-lg border border-hairline px-2 py-2 text-sm text-ink text-right" />
                  </label>
                  <label className="block text-xs text-muted">Date
                    <input type="date" value={draft.costDate} onChange={(e) => setDraft((d) => ({ ...d, costDate: e.target.value }))}
                      className="mt-0.5 w-full rounded-lg border border-hairline px-2 py-2 text-sm text-ink" />
                  </label>
                </div>
                <p className="text-[10px] text-muted">Read by AI from the file — check the amount before saving. Stored ex-GST.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setDraft(null); setMsg(null); setDup(null); }} disabled={saving}
                    className="flex-1 rounded-lg border border-hairline px-3 py-2.5 text-sm text-ink">Discard</button>
                  <button type="button" onClick={save} disabled={saving}
                    className="flex-1 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Add to job"}</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </WorkerLayout>
  );
}
