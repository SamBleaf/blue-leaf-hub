// =============================================================================
// JobPlansCard — Hub-side "issue plans to the field" card (Feature 1). Used on the
// carpentry job + construction project detail. Uploads a PDF into Supabase Storage
// (server), lists the job's CURRENT plans, and supersedes EXPLICITLY (the uploader
// picks the plan a revision replaces — never inferred). base = "/api/carpentry/jobs/:id"
// or "/api/projects/:id". Worker sees the current set on the PWA.
// =============================================================================
import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetch, apiPost, apiDelete } from "../lib/apiFetch.js";

const PLAN_TYPES = [
  { v: "architectural", l: "Architectural" }, { v: "engineering", l: "Engineering" },
  { v: "structural", l: "Structural" }, { v: "survey", l: "Survey" },
  { v: "specification", l: "Specification" }, { v: "plan", l: "Plan (other)" },
];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("read failed"));
    r.onload = () => resolve(r.result);
    r.readAsDataURL(file);
  });
}

export default function JobPlansCard({ base }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [file, setFile] = useState(null);
  const [docType, setDocType] = useState("architectural");
  const [revision, setRevision] = useState("");
  const [supersedes, setSupersedes] = useState("");   // "" = new plan
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data, error: e } = await apiFetch(`${base}/plans`);
    setLoading(false);
    if (!ok) { setError(e || "Could not load plans."); return; }
    setError(null);
    setPlans(data?.plans || []);
  }, [base]);
  useEffect(() => { load(); }, [load]);

  async function upload() {
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const dataUrl = await fileToBase64(file);
      const { ok, error: e } = await apiPost(`${base}/plans`, {
        fileBase64: dataUrl, fileName: file.name, documentType: docType,
        revision: revision.trim() || undefined, supersedesDocumentId: supersedes || undefined,
      });
      if (!ok) { setError(e || "Upload failed."); return; }
      setFile(null); setRevision(""); setSupersedes("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch {
      setError("Couldn't read that file.");
    } finally {
      setUploading(false);
    }
  }

  async function viewPlan(docId) {
    const { ok, data } = await apiFetch(`/api/job-plans/${docId}/download`);
    if (ok && data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
    else setError("Couldn't open that plan.");
  }
  async function removePlan(docId) {
    if (!confirm("Remove this plan from the field?")) return;
    const { ok, error: e } = await apiDelete(`/api/job-plans/${docId}`);
    if (ok) setPlans((p) => p.filter((x) => x.docId !== docId));
    else setError(e || "Could not remove.");
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink mb-3">Plans <span className="text-muted font-normal">(issued to the field)</span></h3>
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-3">{error}</div>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : plans.length === 0 ? (
        <p className="text-sm text-muted mb-3">No plans issued yet.</p>
      ) : (
        <div className="space-y-1.5 mb-3">
          {plans.map((p) => (
            <div key={p.docId} className="flex items-center gap-2 text-sm rounded-lg border border-hairline px-3 py-2">
              <span className="flex-1 min-w-0 truncate text-ink">{p.fileName} <span className="text-[10px] text-muted">· {p.documentType}</span></span>
              <button onClick={() => viewPlan(p.docId)} className="text-xs text-primary hover:underline shrink-0">View</button>
              <button onClick={() => removePlan(p.docId)} className="text-xs text-muted hover:text-red-500 shrink-0">Remove</button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-hairline pt-3 space-y-2">
          <input ref={fileRef} type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <select value={docType} onChange={(e) => setDocType(e.target.value)} className="border border-hairline rounded-lg px-2 py-2 text-sm focus-ring">
              {PLAN_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
            <input value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="Revision (e.g. Rev C)" className="border border-hairline rounded-lg px-2 py-2 text-sm focus-ring" />
          </div>
          <select value={supersedes} onChange={(e) => setSupersedes(e.target.value)} className="w-full border border-hairline rounded-lg px-2 py-2 text-sm focus-ring" title="A revision replaces one existing current plan; a new plan supersedes nothing.">
            <option value="">New plan (supersede nothing)</option>
            {plans.map((p) => <option key={p.docId} value={p.docId}>Revision of: {p.fileName}</option>)}
          </select>
          <button onClick={upload} disabled={!file || uploading} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-40">
            {uploading ? "Uploading…" : "Upload plan"}
          </button>
      </div>
    </div>
  );
}
