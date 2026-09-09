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
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/apiFetch.js";
import { useAuth } from "../lib/useAuth.js";
import { can } from "../lib/roles.js";

const fmt$ = (n) => (n == null ? "—" : `$${Math.round(Number(n)).toLocaleString()}`);
const fmtH = (n) => (n == null ? "—" : `${Math.round(Number(n) * 10) / 10}`);

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
          no budget or variance. Material spend includes supplier invoices allocated in Finance.
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

          {/* Material / other by cost category (manual costs + finance invoices) */}
          {showCost && (
            <div className="rounded-card border border-hairline bg-surface overflow-hidden">
              <h2 className="text-sm font-semibold text-ink px-4 py-2 border-b border-hairline">Materials &amp; other by category</h2>
              {materialByCategory.length === 0 ? (
                <p className="p-4 text-sm text-muted">No material or supplier costs yet. Allocate supplier invoices to this job in Finance and they&rsquo;ll appear here.</p>
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
