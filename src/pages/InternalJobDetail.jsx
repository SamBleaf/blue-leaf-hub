// =============================================================================
// InternalJobDetail — the custom layout for the permanent "BL-INTERNAL" carpentry job
// (reference BL-INTERNAL). Cost-only sibling of ChargeUpJobDetail: instead of charge-out
// + margin it reports internal OVERHEAD cost by category by financial year / quarter.
//
// Six seeded categories (mig 200) on the Charge Up backbone, two cost sources:
//   • worked  (booked)   → ATEC / Logistics / Personal work — approved timesheet_entries
//                          tagged internal_category_id, valued at the booked cost_amount.
//   • leave   (modelled) → Annual / Sick / RDO — DERIVED from the leave / RDO spine at
//                          report time (never worker-logged), flagged "estimated".
//
// Data: GET /api/carpentry/internal-cost-summary (the BL-INTERNAL element = worked + derived
// leave merged onto one category × FY × quarter axis, director-gated cost). Category CRUD +
// retro-assign of untagged worked hours mirror the Charge Up admin surface, cost-only.
// Rendered by CarpentryJobDetail's branch for reference === INTERNAL_REFERENCE.
// =============================================================================
import { Fragment, useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { apiFetch, apiPost, apiPatch, apiDelete } from "../lib/apiFetch.js";
import { useAuth } from "../lib/useAuth.js";
import { can } from "../lib/roles.js";
import { INTERNAL_REFERENCE, LEAVE_TYPES, LEAVE_TYPE_LABELS } from "../lib/constants.js";
import InternalCategoryDetailModal from "../components/carpentry/InternalCategoryDetailModal.jsx";

const fmt$ = (n) => (n == null ? "—" : `$${Math.round(Number(n)).toLocaleString()}`);
const fmtH = (n) => (n == null ? "0" : `${Math.round((Number(n) || 0) * 10) / 10}`);
const Q_SHORT = { 1: "Q1", 2: "Q2", 3: "Q3", 4: "Q4" };

// Archive-safe label — a leave category can be removed from the registry but still carry
// historical cost; fall back to the built-in leave-type label so the report line survives
// (plan §10 / archive semantics).
const catLabel = (c) => c?.categoryLabel || (c?.leaveType && LEAVE_TYPE_LABELS[c.leaveType]) || "(unknown category)";
const isLeaveCat = (c) => c?.costSource === "leave" || c?.estimated;
const hasData = (c) => (Number(c?.hours) || 0) > 0 || (Number(c?.cost) || 0) > 0;

export default function InternalJobDetail({ job }) {
  const { role } = useAuth();
  const showCost = can.viewCostData(role);      // cost is pay-derived → directors only; hours stay visible
  const canModerate = can.accessCarpentry(role);
  const [summary, setSummary] = useState(null); // the BL-INTERNAL element of internal-cost-summary
  const [categories, setCategories] = useState([]); // CRUD list (management: notes, clean rows)
  const [untagged, setUntagged] = useState([]);
  const [detailCat, setDetailCat] = useState(null); // report row whose Shifts modal is open
  const [loading, setLoading] = useState(true);
  const [migrationPending, setMigrationPending] = useState(false);
  const [error, setError] = useState(null);
  const [showQuarters, setShowQuarters] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ categoryLabel: "", costSource: "timesheet", leaveType: "annual" });

  const load = useCallback(async () => {
    setLoading(true);
    const [sumRes, catRes, untagRes] = await Promise.all([
      apiFetch(`/api/carpentry/internal-cost-summary`),
      apiFetch(`/api/carpentry/jobs/${job.id}/internal-categories`),
      apiFetch(`/api/carpentry/jobs/${job.id}/internal-untagged`),
    ]);
    setLoading(false);
    if (!sumRes.ok) { setError(sumRes.error || "Could not load the internal cost report."); return; }
    setError(null);
    const internal = (sumRes.data?.jobs || []).find((j) => j.reference === INTERNAL_REFERENCE) || null;
    setSummary(internal);
    setMigrationPending(!!catRes.data?.migrationPending || internal?.categoriesAvailable === false);
    setCategories(catRes.ok ? (catRes.data?.internalCategories || []) : []);
    setUntagged(untagRes.ok ? (untagRes.data?.untaggedEntries || []) : []);
  }, [job.id]);
  useEffect(() => { load(); }, [load]);

  const reportCats = useMemo(() => summary?.categories || [], [summary]);

  // Combined worked + derived-leave FY (and quarter) totals — the endpoint's top-level fyTotals is
  // worked-only, so aggregate the per-category periods to get the true internal-cost picture.
  const fyRollup = useMemo(() => {
    const fyMap = new Map();
    for (const c of reportCats) {
      for (const p of c.periods || []) {
        if (!fyMap.has(p.fy)) fyMap.set(p.fy, { fy: p.fy, hours: 0, cost: 0, rateMissing: false, quarters: new Map() });
        const f = fyMap.get(p.fy);
        f.hours += Number(p.hours) || 0;
        f.cost += Number(p.cost) || 0;
        f.rateMissing = f.rateMissing || !!p.rateMissing;
        if (!f.quarters.has(p.quarter)) f.quarters.set(p.quarter, { quarter: p.quarter, hours: 0, cost: 0 });
        const q = f.quarters.get(p.quarter);
        q.hours += Number(p.hours) || 0; q.cost += Number(p.cost) || 0;
      }
    }
    return [...fyMap.values()]
      .map((f) => ({ ...f, quarters: [...f.quarters.values()].sort((a, b) => a.quarter - b.quarter) }))
      .sort((a, b) => b.fy.localeCompare(a.fy)); // newest FY first
  }, [reportCats]);

  const totals = useMemo(() => {
    let hours = 0, cost = 0, workedCost = 0, leaveCost = 0, anyRateMissing = false;
    for (const c of reportCats) {
      hours += Number(c.hours) || 0;
      const cc = Number(c.cost) || 0;
      cost += cc;
      if (isLeaveCat(c)) leaveCost += cc; else workedCost += cc;
      if (c.rateMissing) anyRateMissing = true;
    }
    return { hours, cost, workedCost, leaveCost, anyRateMissing };
  }, [reportCats]);

  // A report row is shown if it's active, has data, or archived-view is on. Archived-but-costed
  // rows always show so history (esp. leave lines) never silently vanishes.
  const visibleCats = reportCats.filter((c) => showArchived || c.status !== "archived" || hasData(c));
  const hiddenArchivedCount = reportCats.filter((c) => c.status === "archived" && !hasData(c)).length;
  const activeCount = categories.filter((c) => c.status !== "archived").length;
  // Retro-assign targets: only WORKED (timesheet) active categories — a leave target is rejected
  // server-side so costed leave can never be written into the timesheet ledger.
  const assignTargets = categories.filter((c) => c.status !== "archived" && c.costSource === "timesheet");

  async function assignUntagged(entryIds, internalCategoryId) {
    if (!internalCategoryId || !entryIds.length) return;
    setAssigning(true); setError(null);
    const { ok, error: e } = await apiPost(`/api/carpentry/jobs/${job.id}/internal-assign`, { entryIds, internalCategoryId });
    if (!ok) { setError(e || "Could not assign the hours."); setAssigning(false); return; }
    await load();
    setAssigning(false);
  }

  async function addCategory() {
    if (!form.categoryLabel.trim()) return;
    setAdding(true); setError(null);
    const body = { categoryLabel: form.categoryLabel.trim(), costSource: form.costSource };
    if (form.costSource === "leave") body.leaveType = form.leaveType;
    const { ok, error: e } = await apiPost(`/api/carpentry/jobs/${job.id}/internal-categories`, body);
    setAdding(false);
    if (!ok) { setError(e || "Could not add the category."); return; }
    setForm({ categoryLabel: "", costSource: "timesheet", leaveType: "annual" });
    await load();
  }

  async function patchCategory(row, patch) {
    setSavingId(row.id); setError(null);
    const { ok, error: e } = await apiPatch(`/api/carpentry/internal-categories/${row.id}`, patch);
    setSavingId(null);
    if (!ok) { setError(e || "Update failed."); return; }
    await load();
  }

  async function archiveCategory(row) {
    if (!confirm(`Archive "${catLabel(row)}"? It's hidden from the worker picker, but its logged/derived cost stays in the report.`)) return;
    setSavingId(row.id); setError(null);
    const { ok, error: e } = await apiDelete(`/api/carpentry/internal-categories/${row.id}`);
    setSavingId(null);
    if (!ok) { setError(e || "Could not archive."); return; }
    await load();
  }

  return (
    <div className="space-y-6 pb-24 p-6 max-w-4xl mx-auto">
      <header>
        <Link to="/carpentry" className="text-xs text-primary hover:underline">&larr; Carpentry</Link>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mt-2">Internal cost</p>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">{job.address || "BL-INTERNAL"}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Where the non-site hours go — training, logistics, personal work, and paid leave — costed by category by
          financial year. Worked categories are booked from approved timesheets; leave categories are modelled from the
          leave &amp; RDO spine. No charge-out, no invoice — this is pure overhead.
        </p>
      </header>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
      {migrationPending && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          Internal categories aren&rsquo;t enabled yet — apply <span className="font-mono">migrations 200 &amp; 201</span> in Supabase, then reload.
        </div>
      )}
      {!migrationPending && totals.anyRateMissing && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          Some leave days couldn&rsquo;t be costed — a worker has no base pay rate on file. Those hours count but their cost is
          understated (flagged below). Set the rate in the Team directory to fix the figure.
        </div>
      )}

      {/* ① Category summary — top-line internal-cost totals */}
      {!migrationPending && summary && (
        <div className={`grid grid-cols-2 gap-3 ${showCost ? "sm:grid-cols-5" : "sm:grid-cols-2"}`}>
          <div className="rounded-card border border-hairline bg-surface px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Total hours</p>
            <p className="text-2xl font-semibold text-ink mt-0.5">{fmtH(totals.hours)}</p>
          </div>
          {showCost && (
            <div className="rounded-card border border-hairline bg-surface px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">Total cost</p>
              <p className="text-2xl font-semibold text-ink mt-0.5">{fmt$(totals.cost)}</p>
            </div>
          )}
          {showCost && (
            <div className="rounded-card border border-hairline bg-surface px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">Worked (booked)</p>
              <p className="text-2xl font-semibold text-ink mt-0.5">{fmt$(totals.workedCost)}</p>
            </div>
          )}
          {showCost && (
            <div className="rounded-card border border-hairline bg-surface px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">Leave (modelled)</p>
              <p className="text-2xl font-semibold text-amber-700 mt-0.5">{fmt$(totals.leaveCost)}</p>
            </div>
          )}
          <div className="rounded-card border border-hairline bg-surface px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Active categories</p>
            <p className="text-2xl font-semibold text-ink mt-0.5">{activeCount}</p>
          </div>
        </div>
      )}

      {/* ② by-financial-year breakdown (with quarter toggle) */}
      {!migrationPending && fyRollup.length > 0 && (
        <div className="rounded-card border border-hairline bg-surface overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-hairline">
            <h2 className="text-sm font-semibold text-ink">By financial year</h2>
            <button onClick={() => setShowQuarters((v) => !v)} className="text-xs text-primary hover:underline">
              {showQuarters ? "Hide quarters" : "Show quarters"}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-hairline">
                  <th className="px-4 py-2">Period</th>
                  <th className="px-2 py-2 text-right">Hours</th>
                  {showCost && <th className="px-4 py-2 text-right">Cost</th>}
                </tr>
              </thead>
              <tbody>
                {fyRollup.map((f) => (
                  <Fragment key={f.fy}>
                    <tr className="border-b border-hairline/60">
                      <td className="px-4 py-2 font-medium text-ink">
                        FY {f.fy}
                        {f.rateMissing && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-red-100 text-red-700 align-middle">rate missing</span>}
                      </td>
                      <td className="px-2 py-2 text-right">{fmtH(f.hours)}</td>
                      {showCost && <td className="px-4 py-2 text-right font-medium text-ink">{fmt$(f.cost)}</td>}
                    </tr>
                    {showQuarters && f.quarters.map((q) => (
                      <tr key={`${f.fy}-${q.quarter}`} className="border-b border-hairline/40 last:border-0 bg-page/40 text-xs">
                        <td className="px-4 py-1.5 pl-8 text-muted">{Q_SHORT[q.quarter] || `Q${q.quarter}`}</td>
                        <td className="px-2 py-1.5 text-right text-muted">{fmtH(q.hours)}</td>
                        {showCost && <td className="px-4 py-1.5 text-right text-muted">{fmt$(q.cost)}</td>}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ③ Untagged worked hours — retro-assign to a worked category */}
      {untagged.length > 0 && assignTargets.length > 0 && (
        <div className="rounded-card border border-amber-200 bg-amber-50/60 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-amber-200">
            <h2 className="text-sm font-semibold text-amber-900">Untagged hours — assign to a category</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-800">{untagged.length} entr{untagged.length === 1 ? "y" : "ies"} · {fmtH(untagged.reduce((t, e) => t + (Number(e.hours) || 0), 0))}h</span>
              <select disabled={assigning} defaultValue="" onChange={(e) => { if (e.target.value) assignUntagged(untagged.map((u) => u.entryId), e.target.value); }}
                className="text-xs border border-amber-300 rounded px-2 py-1 bg-white">
                <option value="">Assign all to…</option>
                {assignTargets.map((c) => <option key={c.id} value={c.id}>{catLabel(c)}</option>)}
              </select>
            </div>
          </div>
          <p className="px-4 py-2 text-[11px] text-amber-800">These internal hours were approved without a category (e.g. logged before the picker existed). Assign each to a worked category so it shows in the report below. Leave categories are derived — they can&rsquo;t receive worked hours.</p>
          <div className="divide-y divide-amber-200/70 max-h-72 overflow-y-auto">
            {untagged.map((u) => (
              <div key={u.entryId} className={`flex items-center gap-3 px-4 py-2 text-sm ${assigning ? "opacity-60" : ""}`}>
                <span className="text-xs text-muted w-24 shrink-0">{u.date || "—"}</span>
                <div className="flex-1 min-w-0">
                  <span className="block text-ink truncate">{u.employeeName}</span>
                  {u.notes && <span className="block text-[11px] text-muted truncate">{u.notes}</span>}
                </div>
                <span className="text-xs text-muted w-14 text-right shrink-0">{fmtH(u.hours)}h</span>
                <select disabled={assigning} defaultValue="" onChange={(e) => { if (e.target.value) assignUntagged([u.entryId], e.target.value); }}
                  className="text-xs border border-hairline rounded px-2 py-1 bg-white w-40 shrink-0">
                  <option value="">Assign to…</option>
                  {assignTargets.map((c) => <option key={c.id} value={c.id}>{catLabel(c)}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ④ Cost by category */}
      {!migrationPending && (
        <div className="rounded-card border border-hairline bg-surface overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-hairline">
            <h2 className="text-sm font-semibold text-ink">Cost by category {visibleCats.length > 0 && <span className="text-muted font-normal">({visibleCats.length})</span>}</h2>
            {hiddenArchivedCount > 0 && (
              <button onClick={() => setShowArchived((v) => !v)} className="text-xs text-muted hover:text-ink">
                {showArchived ? "Hide" : "Show"} archived ({hiddenArchivedCount})
              </button>
            )}
          </div>
          {loading ? (
            <p className="p-4 text-sm text-muted">Loading…</p>
          ) : visibleCats.length === 0 ? (
            <p className="p-4 text-sm text-muted">No categories yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-hairline">
                    <th className="px-4 py-2">Category</th>
                    <th className="px-2 py-2">Source</th>
                    <th className="px-2 py-2 text-right">Hours</th>
                    {showCost && <th className="px-4 py-2 text-right">Cost</th>}
                    {canModerate && <th className="px-2 py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {visibleCats.map((c) => {
                    const leave = isLeaveCat(c);
                    const clickable = !!c.internalCategoryId;
                    return (
                      <tr key={c.internalCategoryId || c.slug || catLabel(c)}
                        className={`border-b border-hairline/60 last:border-0 ${clickable ? "cursor-pointer hover:bg-page/40" : ""} ${c.status === "archived" ? "bg-page/40" : ""}`}
                        onClick={clickable ? () => setDetailCat({ id: c.internalCategoryId, categoryLabel: catLabel(c), costSource: c.costSource, leaveType: c.leaveType, estimated: c.estimated, rateMissing: c.rateMissing, hours: c.hours, cost: c.cost, fyTotals: c.fyTotals, status: c.status }) : undefined}>
                        <td className="px-4 py-2 font-medium text-ink">
                          <span className={clickable ? "text-primary" : ""}>{catLabel(c)}</span>
                          {clickable && <span className="ml-1 text-[10px] text-muted">↗</span>}
                          {c.status === "archived" && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted">Archived</span>}
                          {c.rateMissing && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-red-100 text-red-700">rate missing</span>}
                        </td>
                        <td className="px-2 py-2">
                          {leave
                            ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">Estimated</span>
                            : <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 font-medium">Booked</span>}
                        </td>
                        <td className="px-2 py-2 text-right text-ink">{fmtH(c.hours)}</td>
                        {showCost && <td className={`px-4 py-2 text-right ${leave ? "text-amber-700" : "text-ink"}`}>{fmt$(c.cost)}</td>}
                        {canModerate && (
                          <td className="px-2 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {c.internalCategoryId && (
                              c.status === "archived"
                                ? <button disabled={savingId === c.internalCategoryId} onClick={() => patchCategory({ id: c.internalCategoryId }, { status: "active" })} className="text-xs text-primary hover:underline">Restore</button>
                                : <button disabled={savingId === c.internalCategoryId} onClick={() => archiveCategory({ id: c.internalCategoryId, categoryLabel: catLabel(c) })} className="text-xs text-muted hover:text-red-500">Archive</button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-4 py-2 text-[11px] text-muted border-t border-hairline">
            <span className="text-sky-700 font-medium">Booked</span> = worked hours from approved timesheets.{" "}
            <span className="text-amber-700 font-medium">Estimated</span> = leave modelled from the leave &amp; RDO spine (Annual = base + 17.5% loading + super; Sick = base + super; RDO = break-even). Click a worked category for its shifts.
          </p>
        </div>
      )}

      {/* ⑤ Add an ad-hoc category (the six are seeded — this is rare) */}
      {!migrationPending && canModerate && (
        <details className="rounded-card border border-hairline bg-surface p-4">
          <summary className="text-sm font-semibold text-ink cursor-pointer">Add a category</summary>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr] mt-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Category name *</label>
              <input value={form.categoryLabel} onChange={(e) => setForm((f) => ({ ...f, categoryLabel: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
                placeholder="e.g. Tool maintenance" className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Cost source</label>
              <select value={form.costSource} onChange={(e) => setForm((f) => ({ ...f, costSource: e.target.value }))}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring bg-white">
                <option value="timesheet">Worked (booked)</option>
                <option value="leave">Leave (derived)</option>
              </select>
            </div>
            {form.costSource === "leave" && (
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Leave type</label>
                <select value={form.leaveType} onChange={(e) => setForm((f) => ({ ...f, leaveType: e.target.value }))}
                  className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring bg-white">
                  {Object.values(LEAVE_TYPES).map((t) => <option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
            )}
          </div>
          <button onClick={addCategory} disabled={adding || !form.categoryLabel.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-40">
            {adding ? "Adding…" : "Add category"}
          </button>
          <p className="mt-2 text-[11px] text-muted">The six standard categories are seeded automatically. Worked categories appear in the worker picker; leave categories are derived from the leave / RDO spine.</p>
        </details>
      )}

      {detailCat && (
        <InternalCategoryDetailModal
          category={detailCat}
          showCost={showCost}
          onClose={() => setDetailCat(null)}
        />
      )}
    </div>
  );
}
