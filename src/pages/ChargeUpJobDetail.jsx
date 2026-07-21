// =============================================================================
// ChargeUpJobDetail — the custom layout for the permanent "BLB Charge Up" category
// (reference BL-CHARGEUP). Instead of the standard carpentry tabs it manages the
// list of small "sites" (charge_up_jobs, mig 145) where chargeable work is done.
// Workers pick a site when logging hours in the PWA; per-site hours + charge-out $
// analytics (P3) drive invoicing. Rendered by CarpentryJobDetail's branch.
// =============================================================================
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { apiFetch, apiPost, apiPatch, apiDelete } from "../lib/apiFetch.js";
import { useAuth } from "../lib/useAuth.js";
import { can } from "../lib/roles.js";
import ChargeUpSiteDetailModal from "../components/carpentry/ChargeUpSiteDetailModal.jsx";

const fmt$ = (n) => (n == null ? "—" : `$${Math.round(Number(n)).toLocaleString()}`);
const pctFmt = (n) => (n == null ? "—" : `${Math.round(n)}%`);
// Gross margin % = (charge-out − cost) / charge-out. null when cost is hidden (non-director) or no charge-out.
const marginPct = (chargeOut, cost) => (cost != null && Number(chargeOut) > 0 ? ((chargeOut - cost) / chargeOut) * 100 : null);

export default function ChargeUpJobDetail({ job }) {
  const { role } = useAuth();
  const showCost = can.viewCostData(role);
  const canModerate = can.accessCarpentry(role);   // admin/supervisor — manage site details, tasks, diary
  const [sites, setSites] = useState([]);
  const [summary, setSummary] = useState(null);
  const [detailSite, setDetailSite] = useState(null);   // site whose detail pop-up is open
  const [loading, setLoading] = useState(true);
  const [migrationPending, setMigrationPending] = useState(false);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ siteLabel: "", address: "", notes: "" });
  const [savingId, setSavingId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [untagged, setUntagged] = useState([]);
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [sitesRes, sumRes, untagRes] = await Promise.all([
      apiFetch(`/api/carpentry/jobs/${job.id}/charge-up-jobs`),
      apiFetch(`/api/carpentry/jobs/${job.id}/charge-up-summary`),
      apiFetch(`/api/carpentry/jobs/${job.id}/charge-up-untagged`),
    ]);
    setLoading(false);
    if (!sitesRes.ok) { setError(sitesRes.error || "Could not load charge-up sites."); return; }
    setError(null);
    setMigrationPending(!!sitesRes.data?.migrationPending);
    setSites(sitesRes.data?.chargeUpJobs || []);
    if (sumRes.ok) setSummary(sumRes.data);
    setUntagged(untagRes.ok ? (untagRes.data?.untaggedEntries || []) : []);
  }, [job.id]);
  useEffect(() => { load(); }, [load]);

  // Assign untagged charge-up hours to a site (all entryIds → one site), then reload so they
  // move into the per-site analytics.
  async function assignUntagged(entryIds, chargeUpJobId) {
    if (!chargeUpJobId || !entryIds.length) return;
    setAssigning(true); setError(null);
    const { ok, error: e } = await apiPost(`/api/carpentry/jobs/${job.id}/charge-up-assign`, { entryIds, chargeUpJobId });
    if (!ok) { setError(e || "Could not assign the hours."); setAssigning(false); return; }
    await load();
    setAssigning(false);
  }

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

  // Margin changes charge-out (computed server-side off wage cost), so reload the summary after.
  async function patchSiteMargin(row, value) {
    const v = String(value).trim();
    const marginPct = v === "" ? null : Number(v);
    if (marginPct != null && (!Number.isFinite(marginPct) || marginPct < 0 || marginPct >= 100)) { setError("Margin must be between 0 and 99.99%."); return; }
    setSavingId(row.id); setError(null);
    const { ok, error: e } = await apiPatch(`/api/carpentry/charge-up-jobs/${row.id}`, { marginPct });
    if (!ok) { setError(e || "Update failed."); setSavingId(null); return; }
    await load();
    setSavingId(null);
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
  // The per-site margin column (mig 150) is present once site rows carry the key.
  const marginReady = sites.length > 0 && Object.prototype.hasOwnProperty.call(sites[0], "marginPct");

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

      {/* ① Category summary — top-line totals for the whole Charge Up category */}
      {!migrationPending && summary && (
        <div className={`grid grid-cols-2 gap-3 ${showCost ? "sm:grid-cols-5" : "sm:grid-cols-3"}`}>
          <div className="rounded-card border border-hairline bg-surface px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Total hours</p>
            <p className="text-2xl font-semibold text-ink mt-0.5">{summary.categoryTotals.hours}</p>
          </div>
          <div className="rounded-card border border-hairline bg-surface px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Charge-out</p>
            <p className="text-2xl font-semibold text-ink mt-0.5">{fmt$(summary.categoryTotals.chargeOut)}</p>
          </div>
          {showCost && (
            <div className="rounded-card border border-hairline bg-surface px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">Gross margin</p>
              <p className="text-2xl font-semibold text-accent mt-0.5">{pctFmt(marginPct(summary.categoryTotals.chargeOut, summary.categoryTotals.cost))}</p>
            </div>
          )}
          {showCost && (
            <div className="rounded-card border border-hairline bg-surface px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">Cost</p>
              <p className="text-2xl font-semibold text-muted mt-0.5">{fmt$(summary.categoryTotals.cost)}</p>
            </div>
          )}
          <div className="rounded-card border border-hairline bg-surface px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Active sites</p>
            <p className="text-2xl font-semibold text-ink mt-0.5">{sites.filter((s) => s.status !== "archived").length}</p>
          </div>
        </div>
      )}

      {/* ① by-financial-year breakdown */}
      {!migrationPending && summary?.byFy?.length > 0 && (
        <div className="rounded-card border border-hairline bg-surface overflow-hidden">
          <h2 className="text-sm font-semibold text-ink px-4 py-2 border-b border-hairline">By financial year</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-hairline">
                  <th className="px-4 py-2">Financial year</th>
                  <th className="px-2 py-2 text-right">Hours</th>
                  <th className="px-2 py-2 text-right">Charge-out</th>
                  {showCost && <th className="px-4 py-2 text-right">Cost</th>}
                </tr>
              </thead>
              <tbody>
                {summary.byFy.map((f) => (
                  <tr key={f.fy} className="border-b border-hairline/60 last:border-0">
                    <td className="px-4 py-2 font-medium text-ink">FY {f.fy}</td>
                    <td className="px-2 py-2 text-right">{f.hours}</td>
                    <td className="px-2 py-2 text-right font-medium text-ink">{fmt$(f.chargeOut)}</td>
                    {showCost && <td className="px-4 py-2 text-right text-muted">{fmt$(f.cost)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                  <button type="button" onClick={() => setDetailSite(s)}
                    className="text-sm font-medium text-primary hover:underline text-left inline-flex items-center gap-1" title="Open site details, shifts & photos">
                    {s.siteLabel}<span className="text-[10px] text-muted">↗</span>
                  </button>
                  {s.address && <p className="text-xs text-muted mt-0.5">{s.address}</p>}
                </div>
                {marginReady && showCost && s.status !== "archived" && (
                  <label className="flex items-center gap-1 shrink-0 text-xs text-muted" title="Target gross margin on wages for this site. Charge-out = wage cost ÷ (1 − margin). Blank = use each worker's charge-up rate.">
                    <span>Margin</span>
                    <input type="number" min="0" max="99.99" step="1" defaultValue={s.marginPct != null ? Number(s.marginPct) : ""}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        const next = raw === "" ? null : Number(raw);
                        const cur = s.marginPct != null ? Number(s.marginPct) : null;
                        if (next !== cur) patchSiteMargin(s, raw);
                      }}
                      placeholder="—" className="w-14 text-right text-sm text-ink bg-transparent border-0 border-b border-hairline focus:border-primary focus-ring px-0 py-0.5" />
                    <span>%</span>
                  </label>
                )}
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

      {/* ② Untagged hours — assign historic/un-located charge-up hours to a site */}
      {untagged.length > 0 && sites.some((s) => s.status !== "archived") && (
        <div className="rounded-card border border-amber-200 bg-amber-50/60 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-amber-200">
            <h2 className="text-sm font-semibold text-amber-900">Untagged hours — assign to a site</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-800">{untagged.length} entr{untagged.length === 1 ? "y" : "ies"} · {untagged.reduce((t, e) => t + e.hours, 0)}h</span>
              <select disabled={assigning} defaultValue="" onChange={(e) => { if (e.target.value) assignUntagged(untagged.map((u) => u.entryId), e.target.value); }}
                className="text-xs border border-amber-300 rounded px-2 py-1 bg-white">
                <option value="">Assign all to…</option>
                {sites.filter((s) => s.status !== "archived").map((s) => <option key={s.id} value={s.id}>{s.siteLabel}</option>)}
              </select>
            </div>
          </div>
          <p className="px-4 py-2 text-[11px] text-amber-800">These charge-up hours were approved without a site (e.g. logged before the Location picker). Assign each to a site so it shows in the per-site invoicing figures below.</p>
          <div className="divide-y divide-amber-200/70 max-h-72 overflow-y-auto">
            {untagged.map((u) => (
              <div key={u.entryId} className={`flex items-center gap-3 px-4 py-2 text-sm ${assigning ? "opacity-60" : ""}`}>
                <span className="text-xs text-muted w-24 shrink-0">{u.date || "—"}</span>
                <div className="flex-1 min-w-0">
                  <span className="block text-ink truncate">{u.employeeName}</span>
                  {u.notes && <span className="block text-[11px] text-muted truncate">{u.notes}</span>}
                </div>
                <span className="text-xs text-muted w-14 text-right shrink-0">{u.hours}h</span>
                <select disabled={assigning} defaultValue="" onChange={(e) => { if (e.target.value) assignUntagged([u.entryId], e.target.value); }}
                  className="text-xs border border-hairline rounded px-2 py-1 bg-white w-40 shrink-0">
                  <option value="">Assign to…</option>
                  {sites.filter((s) => s.status !== "archived").map((s) => <option key={s.id} value={s.id}>{s.siteLabel}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

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
                  {showCost && <th className="px-2 py-2 text-right">Margin</th>}
                  {showCost && <th className="px-4 py-2 text-right">Cost</th>}
                </tr>
              </thead>
              <tbody>
                {summary.subJobs.map((s) => (
                  <tr key={s.chargeUpJobId} className="border-b border-hairline/60 cursor-pointer hover:bg-page/40"
                    onClick={() => setDetailSite(sites.find((x) => x.id === s.chargeUpJobId) || { id: s.chargeUpJobId, siteLabel: s.siteLabel, address: s.address })}>
                    <td className="px-4 py-2 font-medium">
                      <div className="text-primary">
                        {s.siteLabel}<span className="ml-1 text-[10px] text-muted">↗</span>
                        {s.marginPct != null && <span className="ml-1.5 text-[10px] font-normal text-accent">{Number(s.marginPct)}% margin</span>}
                      </div>
                      {s.lastDate && <div className="text-[10px] font-normal text-muted">last worked {s.lastDate}</div>}
                    </td>
                    <td className="px-2 py-2 text-right text-ink">{s.hours}</td>
                    <td className="px-2 py-2 text-right font-medium text-ink">{fmt$(s.chargeOut)}</td>
                    {showCost && <td className="px-2 py-2 text-right text-muted">{pctFmt(marginPct(s.chargeOut, s.cost))}</td>}
                    {showCost && <td className="px-4 py-2 text-right text-muted">{fmt$(s.cost)}</td>}
                  </tr>
                ))}
                {summary.untagged && summary.untagged.hours > 0 && (
                  <tr className="text-xs text-amber-700 bg-amber-50">
                    <td className="px-4 py-2">Untagged (no location picked)</td>
                    <td className="px-2 py-2 text-right">{summary.untagged.hours}</td>
                    <td className="px-2 py-2 text-right">{fmt$(summary.untagged.chargeOut)}</td>
                    {showCost && <td className="px-2 py-2 text-right">{pctFmt(marginPct(summary.untagged.chargeOut, summary.untagged.cost))}</td>}
                    {showCost && <td className="px-4 py-2 text-right">{fmt$(summary.untagged.cost)}</td>}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[11px] text-muted border-t border-hairline">Charge-out = approved hours × each worker&rsquo;s charge-up rate (or the site&rsquo;s target margin when set). Click a site to open its details, shifts &amp; photos.</p>
        </div>
      ) : (
        <p className="text-xs text-muted px-1">
          Per-site hours &amp; charge-out appear here once the boys log time against these sites (and it&rsquo;s approved).
        </p>
      )}

      {detailSite && (
        <ChargeUpSiteDetailModal
          site={detailSite}
          showCost={showCost}
          canModerate={canModerate}
          onClose={() => setDetailSite(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
