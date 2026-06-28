import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiPost } from "../lib/apiFetch.js";

const CATS = [
  { key: "projects", label: "Projects" },
  { key: "jobs", label: "Jobs" },
  { key: "leads", label: "Leads" },
];

// Admin-only tool to remove test-marked records (BLH TEST / __BATCH_A__ / __E2E / __DRYRUN / __DEMO …).
// The server re-validates every id is test-marked, so this can ONLY ever delete test data.
export default function DataCleanup() {
  const [scan, setScan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sel, setSel] = useState({ projects: new Set(), jobs: new Set(), leads: new Set() });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function load() {
    setLoading(true); setError(""); setResult(null);
    const { ok, data, error } = await apiFetch("/api/admin/cleanup/scan");
    if (!ok) { setError(error || "Failed to scan"); setLoading(false); return; }
    setScan({ projects: data.projects || [], jobs: data.jobs || [], leads: data.leads || [] });
    setSel({ projects: new Set(), jobs: new Set(), leads: new Set() });
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const totalFound = scan ? scan.projects.length + scan.jobs.length + scan.leads.length : 0;
  const totalSel = sel.projects.size + sel.jobs.size + sel.leads.size;

  function toggle(cat, id) {
    setSel((s) => { const n = new Set(s[cat]); n.has(id) ? n.delete(id) : n.add(id); return { ...s, [cat]: n }; });
  }
  function toggleAll(cat) {
    setSel((s) => {
      const all = scan[cat].map((r) => r.id);
      return { ...s, [cat]: s[cat].size === all.length ? new Set() : new Set(all) };
    });
  }
  function selectEverything() {
    setSel({ projects: new Set(scan.projects.map((r) => r.id)), jobs: new Set(scan.jobs.map((r) => r.id)), leads: new Set(scan.leads.map((r) => r.id)) });
  }

  async function doDelete() {
    setBusy(true); setError("");
    const { ok, data, error } = await apiPost("/api/admin/cleanup/delete", {
      projectIds: [...sel.projects], jobIds: [...sel.jobs], leadIds: [...sel.leads],
    });
    setBusy(false); setConfirmOpen(false); setConfirmText("");
    if (!ok) { setError(error || "Delete failed"); return; }
    setResult(data);
    await load();
  }

  const confirmValid = useMemo(() => confirmText.trim().toUpperCase() === "DELETE", [confirmText]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold text-primary tracking-tight">Data Cleanup</h1>
      <p className="text-sm text-muted mt-1">
        Removes <strong>test-marked</strong> records left over from building (BLH TEST, __BATCH_A__, __E2E, __DRYRUN, __DEMO…).
        The server only ever deletes records that match a test marker — real client data can&apos;t be selected here.
      </p>

      <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
        Deletion is permanent and cascades (a project takes its schedule, claims and portal data with it). You have no DB backups yet — consider enabling Supabase backups first.
      </div>

      {result && (
        <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          Deleted {result.projects} project{result.projects !== 1 ? "s" : ""}, {result.jobs} job{result.jobs !== 1 ? "s" : ""}, {result.leads} lead{result.leads !== 1 ? "s" : ""}.
          {result.rejected ? ` (${result.rejected} skipped — not test-marked.)` : ""}
        </div>
      )}
      {error && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      <div className="mt-5 flex items-center justify-between">
        <p className="text-sm text-ink"><span className="font-semibold">{totalFound}</span> test-marked record{totalFound !== 1 ? "s" : ""} found</p>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="text-sm text-primary font-medium">Re-scan</button>
          {totalFound > 0 && <button type="button" onClick={selectEverything} className="text-sm text-primary font-medium">Select all</button>}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted mt-6">Scanning…</p>
      ) : totalFound === 0 ? (
        <p className="text-sm text-muted mt-6">✓ No test-marked records — you&apos;re clean.</p>
      ) : (
        <div className="mt-3 space-y-4">
          {CATS.map(({ key, label }) => scan[key].length > 0 && (
            <div key={key} className="rounded-card border border-hairline bg-surface">
              <div className="flex items-center justify-between px-3 py-2 border-b border-hairline bg-page">
                <span className="text-sm font-semibold text-ink">{label} ({scan[key].length})</span>
                <button type="button" onClick={() => toggleAll(key)} className="text-xs text-primary font-medium">
                  {sel[key].size === scan[key].length ? "Clear" : "Select all"}
                </button>
              </div>
              <ul className="divide-y divide-hairline max-h-72 overflow-y-auto">
                {scan[key].map((r) => (
                  <li key={r.id}>
                    <label className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-page">
                      <input type="checkbox" checked={sel[key].has(r.id)} onChange={() => toggle(key, r.id)} />
                      <span className="text-ink truncate">{r.label || r.id}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {totalSel > 0 && (
        <div className="sticky bottom-4 mt-5">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="w-full py-3 rounded-lg bg-danger text-white text-sm font-semibold shadow-sm"
          >
            Delete {totalSel} selected
          </button>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => !busy && setConfirmOpen(false)}>
          <div className="bg-surface rounded-card p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-ink">Delete {totalSel} record{totalSel !== 1 ? "s" : ""}?</h2>
            <p className="text-sm text-muted mt-2">
              This permanently removes {sel.projects.size} project(s), {sel.jobs.size} job(s) and {sel.leads.size} lead(s) and everything attached to them. This cannot be undone.
            </p>
            <p className="text-sm text-ink mt-3">Type <span className="font-mono font-semibold">DELETE</span> to confirm:</p>
            <input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring"
              placeholder="DELETE"
            />
            <div className="mt-4 flex gap-2 justify-end">
              <button type="button" onClick={() => { setConfirmOpen(false); setConfirmText(""); }} disabled={busy} className="px-4 py-2 rounded-lg border border-hairline text-sm text-muted">Cancel</button>
              <button type="button" onClick={doDelete} disabled={!confirmValid || busy} className="px-4 py-2 rounded-lg bg-danger text-white text-sm font-semibold disabled:opacity-50">
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
