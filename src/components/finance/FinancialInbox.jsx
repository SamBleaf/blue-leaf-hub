import { authFetch } from "../../lib/authFetch.js";
import { useCallback, useEffect, useRef, useState } from "react";

const STATUS_LABELS = {
  unmatched: { label: "Unmatched", chip: "border-warning/40 bg-warning/10 text-warning" },
  matched: { label: "Matched", chip: "border-blue-200 bg-blue-50 text-blue-700" },
  pending_approval: { label: "Pending approval", chip: "border-primary/30 bg-primary/10 text-primary" },
  approved: { label: "Approved", chip: "border-accent/30 bg-accent/10 text-accent" },
  filed: { label: "Filed", chip: "border-green-200 bg-green-50 text-green-700" },
  rejected: { label: "Rejected", chip: "border-danger/30 bg-danger/10 text-danger" },
  xero_synced: { label: "Xero synced", chip: "border-purple-200 bg-purple-50 text-purple-700" },
};

const METHOD_LABELS = {
  exact_job_ref: "Job ref",
  exact_po: "PO match",
  exact_address: "Address",
  supplier_default: "Supplier",
  fuzzy_address: "Fuzzy addr",
  fuzzy_supplier: "Fuzzy supplier",
  ai: "AI",
  manual: "Manual",
};

const STATUS_FILTERS = ["all", "unmatched", "pending_approval", "filed", "rejected"];

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function fmtAmount(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
}

function ConfidencePill({ method, confidence }) {
  if (!method) return null;
  const isExact = confidence === 100;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${isExact ? "border-green-200 bg-green-50 text-green-700" : "border-hairline bg-page text-muted"}`}>
      {METHOD_LABELS[method] || method} {!isExact && `${confidence}%`}
    </span>
  );
}

function StatusChip({ status }) {
  const s = STATUS_LABELS[status] || { label: status, chip: "border-hairline bg-page text-muted" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.chip}`}>
      {s.label}
    </span>
  );
}

function DocumentDetail({ doc, jobs, onUpdate, onClose }) {
  const [selJob, setSelJob] = useState(doc.job_id || "");
  const [notes, setNotes] = useState(doc.notes || "");
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [carpentryJobs, setCarpentryJobs] = useState([]);
  const [selCarpentry, setSelCarpentry] = useState(doc.carpentry_job_id || "");
  const [materialCats, setMaterialCats] = useState([]);
  const [selCat, setSelCat] = useState(doc.carpentry_cost_category || "");
  const [assigningCj, setAssigningCj] = useState(false);

  useEffect(() => {
    authFetch("/api/finance/carpentry-jobs").then(r => r.json())
      .then(j => { if (j.ok) setCarpentryJobs(j.carpentryJobs || []); })
      .catch(() => {});
  }, []);

  // Load the chosen carpentry job's material supply categories (for the PO line's cost category)
  useEffect(() => {
    if (!selCarpentry) { setMaterialCats([]); return; }
    authFetch(`/api/finance/carpentry-jobs/${selCarpentry}/material-categories`).then(r => r.json())
      .then(j => { if (j.ok) setMaterialCats(j.categories || []); })
      .catch(() => {});
  }, [selCarpentry]);

  async function assignCarpentry(cjId, category) {
    setAssigningCj(true);
    try {
      const r = await authFetch(`/api/finance/documents/${doc.id}/carpentry-job`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carpentry_job_id: cjId || null, carpentry_cost_category: category || null })
      });
      const j = await r.json();
      if (j.ok) { onUpdate(j.document); if (cjId) setSelJob(""); }
    } finally { setAssigningCj(false); }
  }

  async function rematch() {
    setSaving(true);
    try {
      const r = await authFetch(`/api/finance/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: selJob || null, notes })
      });
      const j = await r.json();
      if (j.ok) onUpdate(j.document);
    } finally { setSaving(false); }
  }

  async function approve() {
    setApproving(true);
    try {
      const r = await authFetch(`/api/finance/documents/${doc.id}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
      });
      const j = await r.json();
      if (j.ok) onUpdate(j.document);
    } finally { setApproving(false); }
  }

  async function reject() {
    setRejecting(true);
    try {
      const r = await authFetch(`/api/finance/documents/${doc.id}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
      });
      const j = await r.json();
      if (j.ok) onUpdate(j.document);
    } finally { setRejecting(false); }
  }

  const canApprove = doc.status === "pending_approval" || doc.status === "matched";
  const canReject = doc.status === "pending_approval" || doc.status === "matched" || doc.status === "unmatched";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-surface shadow-xl border-l border-hairline"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-surface px-4 py-3">
          <h3 className="text-sm font-bold text-ink truncate max-w-[280px]">{doc.original_filename}</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink text-lg leading-none">✕</button>
        </div>

        <div className="space-y-5 p-4">
          {doc.is_duplicate && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning font-semibold">
              Possible duplicate detected — same invoice number and supplier already on file.
            </div>
          )}

          <section>
            <h4 className="section-label mb-2">Extracted data</h4>
            <dl className="space-y-1.5 text-sm">
              {[
                ["Supplier", doc.supplier_name],
                ["ABN", doc.supplier_abn],
                ["Invoice #", doc.invoice_number],
                ["Invoice date", fmtDate(doc.invoice_date)],
                ["Due date", fmtDate(doc.due_date)],
                ["Amount ex GST", fmtAmount(doc.amount_ex_gst)],
                ["GST", fmtAmount(doc.gst_amount)],
                ["Total", doc.amount_total != null ? <strong>{fmtAmount(doc.amount_total)}</strong> : "—"],
                ["Payment terms", doc.payment_terms],
                ["Description", doc.description],
              ].map(([k, v]) => v ? (
                <div key={k} className="flex gap-2">
                  <dt className="w-28 flex-shrink-0 text-muted">{k}</dt>
                  <dd className="text-ink min-w-0 break-words">{v}</dd>
                </div>
              ) : null)}
            </dl>
          </section>

          {(doc.extracted_address || doc.extracted_job_ref || doc.extracted_po_number) && (
            <section>
              <h4 className="section-label mb-2">Signals found in document</h4>
              <dl className="space-y-1.5 text-sm">
                {doc.extracted_address && <div className="flex gap-2"><dt className="w-28 text-muted">Address</dt><dd className="text-ink">{doc.extracted_address}</dd></div>}
                {doc.extracted_job_ref && <div className="flex gap-2"><dt className="w-28 text-muted">Job ref</dt><dd className="text-ink">{doc.extracted_job_ref}</dd></div>}
                {doc.extracted_po_number && <div className="flex gap-2"><dt className="w-28 text-muted">PO number</dt><dd className="text-ink">{doc.extracted_po_number}</dd></div>}
              </dl>
            </section>
          )}

          <section>
            <h4 className="section-label mb-2">Job match</h4>
            <div className="flex items-center gap-2 mb-3">
              <StatusChip status={doc.status} />
              <ConfidencePill method={doc.match_method} confidence={doc.match_confidence} />
            </div>
            <select
              value={selJob}
              onChange={e => setSelJob(e.target.value)}
              className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— No job matched —</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>{j.address}{j.arch_ref ? ` (${j.arch_ref})` : ""}</option>
              ))}
            </select>

            {/* …or allocate to a carpentry job — material cost pushes to Buildexact as a Purchase Order */}
            <label className="mt-3 mb-1 block text-xs text-muted">…or a carpentry job (material cost → Buildexact PO)</label>
            <select
              value={selCarpentry}
              onChange={e => { setSelCarpentry(e.target.value); setSelCat(""); assignCarpentry(e.target.value, ""); }}
              disabled={assigningCj}
              className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            >
              <option value="">— Not a carpentry job —</option>
              {carpentryJobs.map(c => (
                <option key={c.id} value={c.id}>{c.reference} — {c.address}{!c.buildexact_job_id ? " (no BX link)" : ""}</option>
              ))}
            </select>

            {selCarpentry && (
              <>
                <label className="mt-2 mb-1 block text-xs text-muted">Supply category (Buildexact cost line)</label>
                <select
                  value={selCat}
                  onChange={e => { setSelCat(e.target.value); assignCarpentry(selCarpentry, e.target.value); }}
                  disabled={assigningCj}
                  className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                >
                  <option value="">— Set in Buildexact when completing —</option>
                  {materialCats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </>
            )}

            {doc.carpentry_job_id && (doc.buildexact_purchase_order_id || doc.buildexact_push_error) && (
              <p className={`mt-2 text-xs ${doc.buildexact_push_error ? "text-danger" : "text-accent"}`}>
                {doc.buildexact_push_error
                  ? `⚠ Buildexact push failed: ${doc.buildexact_push_error}`
                  : "✓ Pushed to Buildexact as a Purchase Order (set the supply category + complete it there)"}
              </p>
            )}
          </section>

          <section>
            <h4 className="section-label mb-2">Notes</h4>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Internal notes..."
              className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </section>

          {doc.dropbox_path && (
            <p className="text-xs text-muted">
              <span className="font-semibold">Filed at:</span> {doc.dropbox_path}
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={rematch}
              disabled={saving}
              className="w-full rounded-lg border border-hairline bg-page py-2 text-sm font-semibold text-ink hover:bg-surface disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save / Re-match"}
            </button>
            {canApprove && (
              <button
                type="button"
                onClick={approve}
                disabled={approving || (!doc.job_id && !doc.carpentry_job_id)}
                className="w-full rounded-lg bg-accent py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-40"
              >
                {approving
                  ? "Approving…"
                  : doc.carpentry_job_id
                    ? "Approve & push to Buildexact"
                    : "Approve & File to Dropbox"}
              </button>
            )}
            {canReject && (
              <button
                type="button"
                onClick={reject}
                disabled={rejecting}
                className="w-full rounded-lg border border-danger/40 py-2 text-sm font-semibold text-danger hover:bg-danger/5 disabled:opacity-50"
              >
                {rejecting ? "Rejecting…" : "Reject"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UploadZone({ onUploaded }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  async function convertHeicToJpeg(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        canvas.toBlob(blob => {
          URL.revokeObjectURL(url);
          if (!blob) return reject(new Error("HEIC conversion failed"));
          const reader = new FileReader();
          reader.onload = e => resolve({ base64: e.target.result.split(",")[1], mime: "image/jpeg" });
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        }, "image/jpeg", 0.88);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Browser cannot decode this HEIC file")); };
      img.src = url;
    });
  }

  async function processFile(file) {
    setUploading(true);
    setResult(null);
    try {
      const isHeic = /image\/hei[cf]/i.test(file.type) || /\.heic$/i.test(file.name);
      let base64, mimeType;
      if (isHeic) {
        const converted = await convertHeicToJpeg(file);
        base64 = converted.base64;
        mimeType = converted.mime;
      } else {
        base64 = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = e => res(e.target.result.split(",")[1]);
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
        mimeType = file.type;
      }
      const r = await authFetch("/api/finance/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name.replace(/\.heic$/i, ".jpg"), mimeType, data: base64 })
      });
      const j = await r.json();
      if (j.ok) {
        setResult({ ok: true, doc: j.document });
        onUploaded?.();
      } else {
        setResult({ ok: false, error: j.error });
      }
    } catch (e) {
      setResult({ ok: false, error: e.message });
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed cursor-pointer transition py-10 ${dragging ? "border-primary bg-primary/5" : "border-hairline hover:border-primary/40 hover:bg-page"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }}
        />
        {uploading ? (
          <p className="text-sm text-muted">Extracting data with AI…</p>
        ) : (
          <>
            <div className="text-3xl text-muted">⬆</div>
            <div className="text-center">
              <p className="text-sm font-semibold text-ink">Drop invoice or receipt here</p>
              <p className="text-xs text-muted mt-0.5">PDF, JPEG, PNG, HEIC · extracts automatically</p>
            </div>
          </>
        )}
      </div>

      {result && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${result.ok ? "border-green-200 bg-green-50 text-green-700" : "border-danger/30 bg-danger/5 text-danger"}`}>
          {result.ok
            ? `Captured: ${result.doc.supplier_name || "unknown supplier"} · ${result.doc.amount_total != null ? new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(result.doc.amount_total) : "amount unknown"} · ${result.doc.job_id ? `matched (${result.doc.match_method})` : "unmatched — review below"}`
            : `Error: ${result.error}`}
        </div>
      )}
    </div>
  );
}

export default function FinancialInbox({ onUploaded }) {
  const [documents, setDocuments] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [imapStatus, setImapStatus] = useState(null);
  const [imapPolling, setImapPolling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dr, jr, ir] = await Promise.all([
        authFetch(`/api/finance/documents?status=${filter}&limit=100`).then(r => r.json()),
        authFetch("/api/finance/jobs").then(r => r.json()),
        authFetch("/api/finance/imap/status").then(r => r.json()).catch(() => null),
      ]);
      if (dr.ok) setDocuments(dr.documents);
      if (jr.ok) setJobs(jr.jobs);
      if (ir?.ok) setImapStatus(ir);
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function triggerImapPoll() {
    setImapPolling(true);
    try {
      const r = await authFetch("/api/finance/imap/poll", { method: "POST" }).then(r => r.json());
      // The poll summary nests per-account results under `.accounts` (same shape as /status `.last`),
      // so the failure banner keeps working after a manual "Check now".
      setImapStatus(prev => ({ ...prev, last: r.accounts || [], busy: false }));
      if (r.processed > 0) load();
    } finally {
      setImapPolling(false);
    }
  }

  function handleUpdate(updated) {
    setDocuments(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d));
    setSelected(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev);
    onUploaded?.();
  }

  function handleUploaded() {
    onUploaded?.();
    load();
  }

  return (
    <div className="space-y-4">
      <UploadZone onUploaded={handleUploaded} />

      {/* Email inbox poller status */}
      {imapStatus && (
        <div className="flex items-center justify-between rounded-lg border border-hairline bg-page px-4 py-2.5 text-xs gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-muted flex-wrap">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${imapStatus.configured ? "bg-green-400" : "bg-slate-300"}`} />
            {imapStatus.configured ? (
              <span>
                {(imapStatus.accounts || []).join(", ")} connected
              </span>
            ) : (
              <span>Email inbox not configured</span>
            )}
            {(() => {
              const lastResults = Array.isArray(imapStatus.last) ? imapStatus.last : (imapStatus.last ? [imapStatus.last] : []);
              const latest = lastResults.filter(r => r.at && !r.initialized).sort((a, b) => b.at.localeCompare(a.at))[0];
              if (!latest) return null;
              const totalNew = lastResults.reduce((s, r) => s + (r.processed || 0), 0);
              return (
                <span className="text-muted">
                  · last check {new Date(latest.at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
                  {totalNew > 0 && <span className="text-accent font-semibold"> · {totalNew} new</span>}
                </span>
              );
            })()}
          </div>
          {imapStatus.configured && (
            <button
              type="button"
              onClick={triggerImapPoll}
              disabled={imapPolling || imapStatus.busy}
              className="rounded border border-hairline bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:bg-page disabled:opacity-40 transition"
            >
              {imapPolling ? "Checking…" : "Check now"}
            </button>
          )}
        </div>
      )}

      {/* Inbox login-failure banner — surface IMAP auth/poll failures instead of failing silently */}
      {imapStatus && (() => {
        const results = Array.isArray(imapStatus.last) ? imapStatus.last : (imapStatus.last ? [imapStatus.last] : []);
        const failed = results.filter(r => r && r.ok === false);
        if (!failed.length) return null;
        return (
          <div className="rounded-lg border border-danger bg-surface px-4 py-2.5 text-xs text-danger">
            <span className="font-semibold">⚠ Inbox login failing — </span>
            {failed.map(f => `${f.account}: ${f.error || "authentication failed"}`).join(" · ")}
            <span className="opacity-80"> · check that mailbox&apos;s password (IMAP) in the server env, then “Check now”.</span>
          </div>
        );
      })()}

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${filter === s ? "border-primary bg-primary text-white" : "border-hairline bg-surface text-muted hover:text-ink"}`}
          >
            {s === "all" ? "All" : STATUS_LABELS[s]?.label || s}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-muted">Loading…</p>}

      {!loading && !documents.length && (
        <div className="rounded-card border border-dashed border-hairline bg-page py-10 text-center">
          <p className="text-sm text-muted">No documents{filter !== "all" ? ` with status "${filter}"` : ""} — upload one above.</p>
        </div>
      )}

      <div className="space-y-2">
        {documents.map(doc => (
          <button
            key={doc.id}
            type="button"
            onClick={() => setSelected(doc)}
            className="w-full text-left rounded-card border border-hairline bg-surface p-3 hover:border-primary/40 hover:shadow-sm transition"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-ink truncate">{doc.supplier_name || doc.original_filename}</span>
                  {doc.is_duplicate && <span className="text-[10px] font-bold text-warning">DUPE?</span>}
                  {doc.source === "email" && (
                    <span className="text-[10px] font-semibold rounded bg-blue-50 border border-blue-200 text-blue-700 px-1.5 py-0.5">Email</span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {jobs.find(j => j.id === doc.job_id)?.address || "No job matched"} · {fmtDate(doc.invoice_date)}
                  {doc.email_from && <span className="ml-1">· {doc.email_from}</span>}
                </div>
                {doc.description && <div className="mt-0.5 text-xs text-muted truncate">{doc.description}</div>}
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <span className="text-sm font-bold text-ink">
                  {doc.amount_total != null ? new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(doc.amount_total) : "—"}
                </span>
                <StatusChip status={doc.status} />
                <ConfidencePill method={doc.match_method} confidence={doc.match_confidence} />
              </div>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <DocumentDetail
          doc={selected}
          jobs={jobs}
          onUpdate={handleUpdate}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
