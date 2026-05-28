import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../lib/ProjectContext.jsx";
import { authFetch } from "../lib/authFetch.js";

const currencyFmt = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0
});

function fmtCurrency(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return currencyFmt.format(n);
}

function fmtCompactM(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}m`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return fmtCurrency(v);
}

function MarginBadge({ pct, target }) {
  if (pct == null) return <span className="text-muted text-xs">—</span>;
  const diff = pct - (target || 40);
  const color = diff > 1 ? "text-green-700 bg-green-50 border-green-200"
    : diff > -1 ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-red-700 bg-red-50 border-red-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${color}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

function computeJobMetrics(summary) {
  const kpis = summary?.kpis;
  const job = summary?.job;
  if (!kpis) {
    return { priorityScore: 0, underclaim: null, warning: null, kpis: null, target: null };
  }

  const target = job?.target_margin_pct ?? 40;
  const working = kpis.working_margin_pct;
  let priorityScore = 0;

  if (working != null && working < target - 1) priorityScore += 40;
  if (working != null && working < 33) priorityScore += 20;

  let underclaim = null;
  const estCost = kpis.forecast_total_cost;
  if (estCost > 0 && kpis.contract_value > 0) {
    const buildPct = (kpis.actual_costs / estCost) * 100;
    const claimsPct = (kpis.claims_issued / kpis.contract_value) * 100;
    if (buildPct - claimsPct > 10) {
      priorityScore += 15;
      underclaim = Math.round(((buildPct - claimsPct) / 100) * kpis.contract_value);
    }
  }

  let warning = null;
  if (working != null && working < 33) {
    warning = { severity: "floor", text: "Below APB floor (33%)" };
  } else if (working != null && working < target) {
    warning = { severity: "target", text: `Below target (${target}%)` };
  } else if (underclaim != null) {
    warning = { severity: "underclaim", text: `Underclaim — ~${Math.round(underclaim / 1000)}k` };
  }

  return { priorityScore, underclaim, warning, kpis, target };
}

const SORT_OPTIONS = [
  { id: "risk", label: "⚠ Risk" },
  { id: "value", label: "$ Value" },
  { id: "alpha", label: "A–Z" },
];

export default function JobDashboardSelector({ forcePortfolio = false }) {
  const navigate = useNavigate();
  const { project, allProjects, selectProject } = useProject();
  const [summaries, setSummaries] = useState({});
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("risk");

  // Auto-navigate to the job command centre only when NOT in portfolio mode
  useEffect(() => {
    if (!forcePortfolio && project?.job_id) navigate(`/finance/jobs/${project.job_id}`, { replace: true });
  }, [forcePortfolio, project, navigate]);

  // Load KPI summaries for all projects that have a job_id
  useEffect(() => {
    const projectsWithJobs = allProjects.filter(p => p.job_id);
    if (!projectsWithJobs.length) { setLoading(false); return; }

    Promise.all(
      projectsWithJobs.map(p =>
        authFetch(`/api/finance/jobs/${p.job_id}/summary`)
          .then(r => r.json())
          .then(j => j.ok ? [p.job_id, j] : [p.job_id, null])
          .catch(() => [p.job_id, null])
      )
    ).then(results => {
      const map = {};
      for (const [jobId, data] of results) if (data) map[jobId] = data;
      setSummaries(map);
      setLoading(false);
    });
  }, [allProjects]);

  const projectsWithJobs = allProjects.filter(p => p.job_id);
  const projectsWithoutJobs = allProjects.filter(p => !p.job_id);

  const enrichedJobs = useMemo(
    () => projectsWithJobs.map((p) => ({
      project: p,
      summary: summaries[p.job_id] || null,
      ...computeJobMetrics(summaries[p.job_id]),
    })),
    [projectsWithJobs, summaries]
  );

  const sortedJobs = useMemo(() => {
    const items = [...enrichedJobs];
    if (sortBy === "risk") {
      items.sort((a, b) => {
        if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
        return (a.project.address || "").localeCompare(b.project.address || "");
      });
    } else if (sortBy === "value") {
      items.sort((a, b) => {
        const av = a.kpis?.contract_value ?? -1;
        const bv = b.kpis?.contract_value ?? -1;
        if (bv !== av) return bv - av;
        return (a.project.address || "").localeCompare(b.project.address || "");
      });
    } else {
      items.sort((a, b) =>
        (a.project.address || "").localeCompare(b.project.address || "", "en-AU")
      );
    }
    return items;
  }, [enrichedJobs, sortBy]);

  const portfolioTotals = useMemo(() => {
    let totalContract = 0;
    let totalCosts = 0;
    let marginSum = 0;
    let marginCount = 0;

    for (const item of enrichedJobs) {
      if (!item.kpis) continue;
      totalContract += Number(item.kpis.contract_value) || 0;
      totalCosts += Number(item.kpis.actual_costs) || 0;
      if (item.kpis.working_margin_pct != null) {
        marginSum += item.kpis.working_margin_pct;
        marginCount++;
      }
    }

    return {
      totalContract,
      totalCosts,
      avgMargin: marginCount > 0 ? marginSum / marginCount : null,
    };
  }, [enrichedJobs]);

  function open(proj) {
    selectProject(proj);
    navigate(`/finance/jobs/${proj.job_id}`);
  }

  return (
    <div className="px-4 md:px-6 py-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">Director Portfolio</h1>
          <p className="text-sm text-muted mt-0.5">
            {projectsWithJobs.length} active job{projectsWithJobs.length === 1 ? "" : "s"}
            {!loading && portfolioTotals.totalContract > 0 && (
              <span> · {fmtCompactM(portfolioTotals.totalContract)} total contract value</span>
            )}
          </p>
        </div>

        {!loading && projectsWithJobs.length > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted mr-1 hidden sm:inline">
              Sort by
            </span>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSortBy(opt.id)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  sortBy === opt.id
                    ? "border-primary bg-primary text-white"
                    : "border-hairline bg-surface text-muted hover:text-ink hover:border-primary/30"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-card border border-hairline bg-surface p-4 animate-pulse h-28" />
          ))}
        </div>
      )}

      {!loading && projectsWithJobs.length === 0 && (
        <div className="rounded-card border border-dashed border-hairline bg-page py-16 text-center">
          <p className="text-sm font-semibold text-ink">No projects linked to Buildxact jobs yet</p>
          <p className="text-xs text-muted mt-1">Link a project to a job in the Tender Manager to enable financial tracking.</p>
        </div>
      )}

      {!loading && projectsWithJobs.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sortedJobs.map(({ project: proj, kpis, target, priorityScore, warning }) => {
              const borderClass = priorityScore >= 40
                ? "border-l-4 border-l-red-400"
                : priorityScore >= 15
                  ? "border-l-4 border-l-amber-300"
                  : "";

              return (
                <button
                  key={proj.id}
                  type="button"
                  onClick={() => open(proj)}
                  className={`rounded-card border border-hairline bg-surface p-4 text-left hover:border-primary/40 hover:shadow-sm transition-all group ${borderClass}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-ink leading-tight group-hover:text-primary transition-colors line-clamp-2">
                      {proj.address}
                    </p>
                    {kpis && <MarginBadge pct={kpis.working_margin_pct} target={target} />}
                  </div>

                  {kpis ? (
                    <>
                      <div className="mt-3 flex items-end justify-between gap-2">
                        <p className="text-lg font-bold text-ink tabular-nums">
                          {fmtCurrency(kpis.contract_value)}
                        </p>
                        <p className="text-xs text-muted shrink-0">
                          Forecast{" "}
                          {kpis.forecast_margin_pct != null && !kpis.forecast_data_quality_warning
                            ? `${kpis.forecast_margin_pct.toFixed(1)}%`
                            : "—"}
                        </p>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-lg border border-hairline bg-page px-2 py-1.5 text-center">
                          <p className="text-[10px] text-muted">💰 Claimed</p>
                          <p className="text-xs font-semibold text-ink tabular-nums mt-0.5">
                            {fmtCurrency(kpis.claims_issued)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-hairline bg-page px-2 py-1.5 text-center">
                          <p className="text-[10px] text-muted">📄 Costs</p>
                          <p className="text-xs font-semibold text-ink tabular-nums mt-0.5">
                            {fmtCurrency(kpis.actual_costs)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-hairline bg-page px-2 py-1.5 text-center">
                          <p className="text-[10px] text-muted">🏦 Paid</p>
                          <p className="text-xs font-semibold text-ink tabular-nums mt-0.5">
                            {fmtCurrency(kpis.claims_paid)}
                          </p>
                        </div>
                      </div>

                      {warning && (
                        <p className={`mt-3 text-xs font-semibold ${
                          warning.severity === "floor"
                            ? "text-red-700"
                            : "text-amber-700"
                        }`}>
                          {warning.severity === "floor" ? "🔴" : "🟡"} {warning.text}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-3 text-xs text-muted">No financial data yet</p>
                  )}
                </button>
              );
            })}
          </div>

          <div className="border-t border-hairline pt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="font-bold text-ink">Portfolio totals</span>
            <span className="text-muted">
              Total contract:{" "}
              <span className="font-semibold text-ink">{fmtCompactM(portfolioTotals.totalContract)}</span>
            </span>
            <span className="text-muted">
              Total costs:{" "}
              <span className="font-semibold text-ink">{fmtCompactM(portfolioTotals.totalCosts)}</span>
            </span>
            <span className="text-muted">
              Avg margin:{" "}
              <span className="font-semibold text-ink">
                {portfolioTotals.avgMargin != null
                  ? `${portfolioTotals.avgMargin.toFixed(1)}%`
                  : "—"}
              </span>
            </span>
          </div>
        </>
      )}

      {!loading && projectsWithoutJobs.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
            Projects without job link ({projectsWithoutJobs.length})
          </p>
          <div className="rounded-card border border-dashed border-hairline bg-page divide-y divide-hairline">
            {projectsWithoutJobs.map(p => (
              <div key={p.id} className="px-4 py-2.5 flex items-center justify-between">
                <span className="text-sm text-muted">{p.address}</span>
                <span className="text-xs text-muted/60">No Buildxact job linked</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
