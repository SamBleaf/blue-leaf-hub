import { authFetch } from "../lib/authFetch.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";

const DOC_TYPES = [
  { value: "public_liability", label: "Public Liability" },
  { value: "workers_comp", label: "Workers Comp" },
  { value: "licence", label: "Licence" },
  { value: "swms", label: "SWMS" },
  { value: "other", label: "Other" }
];

function statusChip(cls, label) {
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${cls}`}>{label}</span>;
}

function docChip(status) {
  if (status === "current") return statusChip("bg-accent/20 text-accent", "current");
  if (status === "expiring_soon") return statusChip("bg-warning/25 text-amber-900", "expiring");
  if (status === "expired") return statusChip("bg-danger/20 text-danger", "expired");
  return statusChip("border border-dashed border-danger text-danger", "missing");
}

export default function WhsManager() {
  const { projectId } = useParams();
  const [tab, setTab] = useState("contractors");
  const [project, setProject] = useState(null);
  const [compliance, setCompliance] = useState([]);
  const [inductions, setInductions] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addSubId, setAddSubId] = useState("");
  const [addForm, setAddForm] = useState({
    documentType: "public_liability",
    documentName: "",
    issueDate: "",
    expiryDate: "",
    policyNumber: "",
    insurer: "",
    file: null
  });
  const [reportOpen, setReportOpen] = useState(false);
  const [reportForm, setReportForm] = useState({
    reportType: "incident",
    severity: "medium",
    title: "",
    description: "",
    correctiveAction: "",
    reportedBy: "",
    photos: []
  });
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState({});

  const loadProject = useCallback(async () => {
    if (!supabaseConfigured || !projectId) return;
    const sb = getSupabase();
    const { data } = await sb.from("projects").select("id, address").eq("id", projectId).single();
    setProject(data);
  }, [projectId]);

  const loadCompliance = useCallback(async () => {
    const res = await authFetch(`/api/whs/${projectId}/compliance`);
    const j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || "Load failed");
    setCompliance(j.subcontractors || []);
  }, [projectId]);

  const loadInductions = useCallback(async () => {
    const res = await authFetch(`/api/whs/${projectId}/inductions`);
    const j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || "Load failed");
    setInductions(j.inductions || []);
  }, [projectId]);

  const loadReports = useCallback(async () => {
    const res = await authFetch(`/api/whs/${projectId}/reports`);
    const j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || "Load failed");
    setReports(j.reports || []);
  }, [projectId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await loadCompliance();
      await loadInductions();
      await loadReports();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [loadCompliance, loadInductions, loadReports]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const url = await QRCode.toDataURL(`${window.location.origin}/induct/${projectId}`, { width: 300, margin: 2 });
        if (!stop) setQrDataUrl(url);
      } catch {
        if (!stop) setQrDataUrl("");
      }
    })();
    return () => {
      stop = true;
    };
  }, [projectId]);

  const counts = useMemo(() => {
    let exp = 0;
    let soon = 0;
    for (const s of compliance) {
      for (const d of s.documents || []) {
        const st = d.computed_status || d.status;
        if (st === "expired") exp += 1;
        else if (st === "expiring_soon") soon += 1;
      }
    }
    const openReports = reports.filter((r) => r.status === "open" || r.status === "in_progress").length;
    return { exp, soon, openReports };
  }, [compliance, reports]);

  async function saveCompliance() {
    if (!addSubId || !addForm.file) {
      setError("Choose subcontractor and file.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const fileBase64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] || "");
        r.onerror = reject;
        r.readAsDataURL(addForm.file);
      });
      const res = await authFetch("/api/whs/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subcontractorId: addSubId,
          documentType: addForm.documentType,
          documentName: addForm.documentName,
          issueDate: addForm.issueDate || null,
          expiryDate: addForm.expiryDate || null,
          policyNumber: addForm.policyNumber,
          insurer: addForm.insurer,
          fileBase64,
          fileName: addForm.file.name
        })
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Save failed");
      setAddOpen(false);
      setAddForm({
        documentType: "public_liability",
        documentName: "",
        issueDate: "",
        expiryDate: "",
        policyNumber: "",
        insurer: "",
        file: null
      });
      await refresh();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitReport() {
    setBusy(true);
    setError("");
    try {
      const photosBase64 = [];
      for (const f of reportForm.photos) {
        const b64 = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(",")[1] || "");
          r.onerror = reject;
          r.readAsDataURL(f);
        });
        photosBase64.push({ name: f.name, data: b64 });
      }
      const res = await authFetch(`/api/whs/${projectId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: reportForm.reportType,
          severity: reportForm.severity,
          title: reportForm.title,
          description: reportForm.description,
          correctiveAction: reportForm.correctiveAction,
          reportedBy: reportForm.reportedBy,
          photosBase64
        })
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Save failed");
      setReportOpen(false);
      setReportForm({
        reportType: "incident",
        severity: "medium",
        title: "",
        description: "",
        correctiveAction: "",
        reportedBy: "",
        photos: []
      });
      await refresh();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function resolveReport(id) {
    setBusy(true);
    setError("");
    try {
      const res = await authFetch(`/api/whs/report/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" })
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Update failed");
      await refresh();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function downloadQr() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `induction-qr-${projectId}.png`;
    a.click();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/induct/${projectId}`);
  }

  return (
    <div className="space-y-6 pb-24">
      <Link to={`/operations/${projectId}`} className="text-sm font-semibold text-accent underline">
        ← Back to project
      </Link>
      <header className="rounded-card border border-hairline bg-surface p-4 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">{project?.address || "Project"}</h1>
          <p className="text-sm text-muted">WHS</p>
        </div>
        <Link to={`/operations/${projectId}/whs-setup`} className="text-sm font-semibold text-primary underline">
          WHS Setup →
        </Link>
      </header>

      {error ? <div className="text-sm text-danger">{error}</div> : null}

      <div className="flex flex-wrap gap-2 border-b border-hairline pb-2">
        {["contractors", "inductions", "incidents"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize ${tab === t ? "bg-primary text-white" : "border border-hairline text-ink"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-muted">Loading…</p> : null}

      {tab === "contractors" ? (
        <div className="space-y-4">
          {(counts.exp > 0 || counts.soon > 0) ? (
            <div className="flex items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-amber-950">
              <span aria-hidden>⚠️</span>
              <span>
                {counts.exp} expired, {counts.soon} expiring within 30 days (across listed documents).
              </span>
            </div>
          ) : null}
          {compliance.map((s) => {
            const docs = s.documents || [];
            const bad = docs.some((d) => ["expired", "expiring_soon", "missing"].includes(d.computed_status || d.status));
            return (
              <div key={s.subcontractor_id} className="rounded-card border border-hairline bg-surface p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-ink">{s.name}</h2>
                    <span className="mt-1 inline-block rounded-full bg-page px-2 py-0.5 text-xs text-muted">{s.trade || "—"}</span>
                  </div>
                  <span className={`text-xs font-bold uppercase ${bad ? "text-warning" : "text-accent"}`}>{bad ? "Action Required" : "All Good"}</span>
                </div>
                <button type="button" className="mt-3 text-sm font-semibold text-primary underline" onClick={() => setExpanded((e) => ({ ...e, [s.subcontractor_id]: !e[s.subcontractor_id] }))}>
                  Documents {expanded[s.subcontractor_id] ? "▼" : "▶"}
                </button>
                {expanded[s.subcontractor_id] ? (
                  <ul className="mt-2 space-y-2 text-sm">
                    {docs.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center gap-2 border-t border-hairline pt-2">
                        <span className="font-semibold">{d.document_type}</span>
                        <span className="text-muted">{d.document_name || "—"}</span>
                        <span className="text-xs text-muted">exp: {d.expiry_date || "—"}</span>
                        {docChip(d.computed_status || d.status)}
                        {d.dropbox_path ? (
                          <span className="font-mono text-[10px] text-muted" title={d.dropbox_path}>
                            {d.dropbox_path.slice(-40)}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setAddSubId(s.subcontractor_id);
                    setAddOpen(true);
                  }}
                  className="mt-3 rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-primary"
                >
                  Add document
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {tab === "inductions" ? (
        <div className="space-y-6">
          <div className="rounded-card border border-hairline bg-surface p-6 text-center shadow-sm">
            {qrDataUrl ? <img src={qrDataUrl} alt="Induction QR" className="mx-auto max-w-[300px]" /> : <p className="text-muted">Generating QR…</p>}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={downloadQr} className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white">
                Download QR code
              </button>
              <button type="button" onClick={copyLink} className="rounded-lg border border-hairline px-4 py-3 text-sm font-semibold text-ink">
                Copy link
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-card border border-hairline">
            <table className="min-w-full text-sm">
              <thead className="bg-page text-left text-xs uppercase text-muted">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Trade</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Signature</th>
                  <th className="px-3 py-2">PDF</th>
                </tr>
              </thead>
              <tbody>
                {inductions.map((r) => (
                  <tr key={r.id} className="border-t border-hairline">
                    <td className="px-3 py-2">{r.person_name}</td>
                    <td className="px-3 py-2">{r.company || "—"}</td>
                    <td className="px-3 py-2">{r.trade || "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted">{new Date(r.inducted_at).toLocaleString("en-AU")}</td>
                    <td className="px-3 py-2">{r.signature_data_url ? "Signature ✓" : "—"}</td>
                    <td className="px-3 py-2">
                      {r.induction_pdf_path ? (
                        <span className="font-mono text-[10px] text-primary" title={r.induction_pdf_path}>
                          {r.induction_pdf_path.slice(-32)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "incidents" ? (
        <div className="space-y-4">
          <button type="button" onClick={() => setReportOpen(true)} className="rounded-lg bg-danger px-4 py-3 text-sm font-semibold text-white">
            Report incident
          </button>
          <ul className="space-y-2">
            {reports.map((r) => {
              const ex = expanded[r.id];
              return (
                <li key={r.id} className="rounded-card border border-hairline bg-surface p-3">
                  <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left text-sm" onClick={() => setExpanded((e) => ({ ...e, [r.id]: !e[r.id] }))}>
                    {statusChip("bg-page text-ink", r.report_type)}
                    {r.severity ? statusChip("bg-warning/20 text-amber-900", r.severity) : null}
                    <span className="font-semibold text-ink">{r.title}</span>
                    <span className="text-xs text-muted">{new Date(r.reported_at).toLocaleDateString("en-AU")}</span>
                    <span className="text-xs font-bold text-primary">{r.status}</span>
                  </button>
                  {ex ? (
                    <div className="mt-2 space-y-2 border-t border-hairline pt-2 text-sm text-muted">
                      <p>{r.description}</p>
                      <p>{r.corrective_action}</p>
                      {r.photo_paths?.length ? (
                        <p className="text-xs font-mono">
                          {r.photo_paths.length} photo(s) on Dropbox
                        </p>
                      ) : null}
                      {r.status === "open" || r.status === "in_progress" ? (
                        <button type="button" disabled={busy} onClick={() => resolveReport(r.id)} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white">
                          Resolved
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {addOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && setAddOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-hairline bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-primary">Add compliance document</h2>
            <label className="mt-3 block text-xs font-semibold text-muted">
              Type
              <select value={addForm.documentType} onChange={(e) => setAddForm((f) => ({ ...f, documentType: e.target.value }))} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm">
                {DOC_TYPES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-xs font-semibold text-muted">
              Document name
              <input value={addForm.documentName} onChange={(e) => setAddForm((f) => ({ ...f, documentName: e.target.value }))} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm" />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-muted">
                Issue date
                <input type="date" value={addForm.issueDate} onChange={(e) => setAddForm((f) => ({ ...f, issueDate: e.target.value }))} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-muted">
                Expiry date
                <input type="date" value={addForm.expiryDate} onChange={(e) => setAddForm((f) => ({ ...f, expiryDate: e.target.value }))} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm" />
              </label>
            </div>
            <label className="mt-3 block text-xs font-semibold text-muted">
              Policy #
              <input value={addForm.policyNumber} onChange={(e) => setAddForm((f) => ({ ...f, policyNumber: e.target.value }))} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm" />
            </label>
            <label className="mt-3 block text-xs font-semibold text-muted">
              Insurer
              <input value={addForm.insurer} onChange={(e) => setAddForm((f) => ({ ...f, insurer: e.target.value }))} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm" />
            </label>
            <label className="mt-3 block text-xs font-semibold text-muted">
              File (PDF or image)
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => setAddForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
                className="mt-1 w-full text-sm"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-2 text-sm text-muted" onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={saveCompliance} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reportOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && setReportOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-hairline bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-primary">Report incident</h2>
            <label className="mt-3 block text-xs font-semibold text-muted">
              Type
              <select value={reportForm.reportType} onChange={(e) => setReportForm((f) => ({ ...f, reportType: e.target.value }))} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm">
                <option value="incident">incident</option>
                <option value="near_miss">near_miss</option>
                <option value="hazard">hazard</option>
                <option value="defect">defect</option>
                <option value="non_conformance">non_conformance</option>
              </select>
            </label>
            <label className="mt-3 block text-xs font-semibold text-muted">
              Severity
              <select value={reportForm.severity} onChange={(e) => setReportForm((f) => ({ ...f, severity: e.target.value }))} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm">
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </label>
            <label className="mt-3 block text-xs font-semibold text-muted">
              Title
              <input value={reportForm.title} onChange={(e) => setReportForm((f) => ({ ...f, title: e.target.value }))} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm" />
            </label>
            <label className="mt-3 block text-xs font-semibold text-muted">
              Description
              <textarea value={reportForm.description} onChange={(e) => setReportForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm" />
            </label>
            <label className="mt-3 block text-xs font-semibold text-muted">
              Corrective action
              <textarea value={reportForm.correctiveAction} onChange={(e) => setReportForm((f) => ({ ...f, correctiveAction: e.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm" />
            </label>
            <label className="mt-3 block text-xs font-semibold text-muted">
              Reported by
              <input value={reportForm.reportedBy} onChange={(e) => setReportForm((f) => ({ ...f, reportedBy: e.target.value }))} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm" />
            </label>
            <label className="mt-3 block text-xs font-semibold text-muted">
              Photos
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => setReportForm((f) => ({ ...f, photos: [...(e.target.files || [])] }))}
                className="mt-1 w-full text-sm"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-2 text-sm text-muted" onClick={() => setReportOpen(false)}>
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={submitReport} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
