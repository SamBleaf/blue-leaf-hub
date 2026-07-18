// =============================================================================
// ChargeUpJobDetail — the custom layout for the permanent "BLB Charge Up" category
// (reference BL-CHARGEUP). Instead of the standard carpentry tabs it manages the
// list of small "sites" (charge_up_jobs, mig 145) where chargeable work is done.
// Workers pick a site when logging hours in the PWA; per-site hours + charge-out $
// analytics (P3) drive invoicing. Rendered by CarpentryJobDetail's branch.
// =============================================================================
import { useState, useEffect, useCallback, Fragment } from "react";
import { Link } from "react-router-dom";
import { apiFetch, apiPost, apiPatch, apiDelete } from "../lib/apiFetch.js";
import { useAuth } from "../lib/useAuth.js";
import { can } from "../lib/roles.js";

const fmt$ = (n) => (n == null ? "—" : `$${Math.round(Number(n)).toLocaleString()}`);

export default function ChargeUpJobDetail({ job }) {
  const { role } = useAuth();
  const showCost = can.viewCostData(role);
  const [sites, setSites] = useState([]);
  const [summary, setSummary] = useState(null);
  const [openSite, setOpenSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [migrationPending, setMigrationPending] = useState(false);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ siteLabel: "", address: "", notes: "" });
  const [savingId, setSavingId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [sitesRes, sumRes] = await Promise.all([
      apiFetch(`/api/carpentry/jobs/${job.id}/charge-up-jobs`),
      apiFetch(`/api/carpentry/jobs/${job.id}/charge-up-summary`),
    ]);
    setLoading(false);
    if (!sitesRes.ok) { setError(sitesRes.error || "Could not load charge-up sites."); return; }
    setError(null);
    setMigrationPending(!!sitesRes.data?.migrationPending);
    setSites(sitesRes.data?.chargeUpJobs || []);
    if (sumRes.ok) setSummary(sumRes.data);
  }, [job.id]);
  useEffect(() => { load(); }, [load]);

  async function addSite() {
    if (!form.siteLabel.trim()) return;
    setAdding(true); setError(null);
    const { ok, data, error: e } = await apiPost(`/api/carpentry/jobs/${job.id}/charge-up-jobs`, form);
    setAdding(false);
    if (!ok) { setError(e || "Could not add the site."); return; }
    setSites((s) => [...s, data.chargeUpJob]);
    setForm({ siteLabel: "", address: "", notes: "" });
  }

  async function patchSite(row, patch) {
    setSavingId(row.id); setError(null);
    const { ok, data, error: e } = await apiPatch(`/api/carpentry/charge-up-jobs/${row.id}`, patch);
    setSavingId(null);
    if (!ok) { setError(e || "Update failed."); return; }
    setSites((s) => s.map((x) => (x.id === row.id ? data.chargeUpJob : x)));
  }

  async function archive(row) {
    if (!confirm(`Archive "${row.siteLabel}"? It's hidden from the worker picker, but its logged hours stay in the analytics.`)) return;
    setSavingId(row.id);
    const { ok } = await apiDelete(`/api/carpentry/charge-up-jobs/${row.id}`);
    setSavingId(null);
    if (ok) setSites((s) => s.map((x) => (x.id === row.id ? { ...x, status: "archived" } : x)));
  }

  const visible = sites.filter((s) => showArchived || s.status !== "archived");
  const archivedCount = sites.filter((s) => s.status === "archived").length;

  return (
    <div className="space-y-6 pb-24 p-6 max-w-4xl mx-auto">
      <header>
        <Link to="/carpentry" className="text-xs text-primary hover:underline">&larr; Carpentry</Link>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mt-2">BLB Charge Up</p>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">{job.address || "Charge Up"}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Small chargeable jobs by site. Add a site here; the boys pick it when they log hours on the app.
          Hours track per site &amp; per person for invoicing — the site cost still rolls up to the whole Charge Up category.
        </p>
      </header>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
      {migrationPending && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          Charge-up sites aren&rsquo;t enabled yet — apply <span className="font-mono">migration 145</span> in Supabase, then reload.
        </div>
      )}

      {/* Add a site */}
      {!migrationPending && (
        <div className="rounded-card border border-hairline bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink mb-3">Add a charge-up site</h2>
          <div className="grid gap-3 sm:grid-cols-[2fr_2fr] mb-3">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Site / location *</label>
              <input value={form.siteLabel} onChange={(e) => setForm((f) => ({ ...f, siteLabel: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addSite()}
                placeholder="e.g. 12 Smith St — deck repair" className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Address / info (optional)</label>
              <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Full address or a note the boys see" className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
            </div>
          </div>
          <button onClick={addSite} disabled={adding || !form.siteLabel.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-40">
            {adding ? "Adding…" : "Add site"}
          </button>
        </div>
      )}

      {/* Sites list */}
      <div className="rounded-card border border-hairline bg-surface overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-hairline">
          <h2 className="text-sm font-semibold text-ink">Charge-up sites {visible.length > 0 && <span className="text-muted font-normal">({visible.length})</span>}</h2>
          {archivedCount > 0 && (
            <button onClick={() => setShowArchived((v) => !v)} className="text-xs text-muted hover:text-ink">
              {showArchived ? "Hide" : "Show"} archived ({archivedCount})
            </button>
          )}
        </div>
        {loading ? (
          <p className="p-4 text-sm text-muted">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="p-4 text-sm text-muted">No sites yet — add one above.</p>
        ) : (
          <div className="divide-y divide-hairline">
            {visible.map((s) => (
              <div key={s.id} className={`flex flex-wrap items-center gap-3 p-3 ${savingId === s.id ? "opacity-60" : ""} ${s.status === "archived" ? "bg-page/40" : ""}`}>
                <div className="flex-1 min-w-[12rem]">
                  <input defaultValue={s.siteLabel} onBlur={(e) => e.target.value.trim() && e.target.value !== s.siteLabel && patchSite(s, { siteLabel: e.target.value })}
                    className="w-full text-sm font-medium text-ink bg-transparent border-0 border-b border-transparent hover:border-hairline focus:border-primary focus-ring px-0 py-0.5" />
                  <input defaultValue={s.address || ""} onBlur={(e) => e.target.value !== (s.address || "") && patchSite(s, { address: e.target.value })}
                    placeholder="Address / info" className="w-full text-xs text-muted bg-transparent border-0 border-b border-transparent hover:border-hairline focus:border-primary focus-ring px-0 py-0.5 mt-0.5" />
                </div>
                {s.status === "archived" ? (
                  <>
                    <span className="text-[10px] uppercase tracking-wide text-muted">Archived</span>
                    <button onClick={() => patchSite(s, { status: "active" })} className="text-xs text-primary hover:underline">Restore</button>
                  </>
                ) : (
                  <button onClick={() => archive(s)} className="text-xs text-muted hover:text-red-500" title="Archive">Archive</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Per-site invoicing analytics */}
      {summary && summary.subJobs.length > 0 ? (
        <div className="rounded-card border border-hairline bg-surface overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-hairline">
            <h2 className="text-sm font-semibold text-ink">Hours &amp; charge-out by site</h2>
            <span className="text-xs text-muted">{summary.categoryTotals.hours}h · {fmt$(summary.categoryTotals.chargeOut)} charge-out</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-hairline">
                  <th className="px-4 py-2">Location</th>
                  <th className="px-2 py-2 text-right">Hours</th>
                  <th className="px-2 py-2 text-right">Charge-out</th>
                  {showCost && <th className="px-4 py-2 text-right">Cost</th>}
                </tr>
              </thead>
              <tbody>
                {summary.subJobs.map((s) => (
                  <Fragment key={s.chargeUpJobId}>
                    <tr className="border-b border-hairline/60 cursor-pointer hover:bg-page/40" onClick={() => setOpenSite((o) => (o === s.chargeUpJobId ? null : s.chargeUpJobId))}>
                      <td className="px-4 py-2 font-medium text-ink">{openSite === s.chargeUpJobId ? "▾ " : "▸ "}{s.siteLabel}</td>
                      <td className="px-2 py-2 text-right">{s.hours}</td>
                      <td className="px-2 py-2 text-right font-medium text-ink">{fmt$(s.chargeOut)}</td>
                      {showCost && <td className="px-4 py-2 text-right text-muted">{fmt$(s.cost)}</td>}
                    </tr>
                    {openSite === s.chargeUpJobId && s.byPerson.map((p) => (
                      <tr key={p.employeeId || p.name} className="text-xs text-muted bg-page/30">
                        <td className="px-8 py-1">{p.name}</td>
                        <td className="px-2 py-1 text-right">{p.hours}</td>
                        <td className="px-2 py-1 text-right">{fmt$(p.chargeOut)}</td>
                        {showCost && <td className="px-4 py-1 text-right">{fmt$(p.cost)}</td>}
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {summary.untagged && summary.untagged.hours > 0 && (
                  <tr className="text-xs text-amber-700 bg-amber-50">
                    <td className="px-4 py-2">Untagged (no location picked)</td>
                    <td className="px-2 py-2 text-right">{summary.untagged.hours}</td>
                    <td className="px-2 py-2 text-right">{fmt$(summary.untagged.chargeOut)}</td>
                    {showCost && <td className="px-4 py-2 text-right">{fmt$(summary.untagged.cost)}</td>}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[11px] text-muted border-t border-hairline">Charge-out = approved hours × each person&rsquo;s charge-up rate. Click a site for the per-person breakdown.</p>
        </div>
      ) : (
        <p className="text-xs text-muted px-1">
          Per-site hours &amp; charge-out appear here once the boys log time against these sites (and it&rsquo;s approved).
        </p>
      )}
    </div>
  );
}
