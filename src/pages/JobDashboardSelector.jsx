import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../lib/ProjectContext.jsx";

function fmtCurrency(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
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

export default function JobDashboardSelector() {
  const navigate = useNavigate();
  const { project, allProjects, selectProject } = useProject();
  const [summaries, setSummaries] = useState({});
  const [loading, setLoading] = useState(true);

  // Skip the selector when a project with a job is already in context
  useEffect(() => {
    if (project?.job_id) navigate(`/finance/jobs/${project.job_id}`, { replace: true });
  }, [project, navigate]);

  // Load KPI summaries for all projects that have a job_id
  useEffect(() => {
    const projectsWithJobs = allProjects.filter(p => p.job_id);
    if (!projectsWithJobs.length) { setLoading(false); return; }

    Promise.all(
      projectsWithJobs.map(p =>
        fetch(`/api/finance/jobs/${p.job_id}/summary`)
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

  function open(project) {
    selectProject(project);
    navigate(`/finance/jobs/${project.job_id}`);
  }

  return (
    <div className="px-4 md:px-6 py-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Job Financial Dashboard</h1>
        <p className="text-sm text-muted mt-0.5">Select a project to open its command centre</p>
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projectsWithJobs.map(project => {
            const s = summaries[project.job_id];
            const kpis = s?.kpis;
            const target = s?.job?.target_margin_pct;
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => open(project)}
                className="rounded-card border border-hairline bg-surface p-4 text-left hover:border-primary/40 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-ink leading-tight group-hover:text-primary transition-colors line-clamp-2">
                    {project.address}
                  </p>
                  {kpis && <MarginBadge pct={kpis.working_margin_pct} target={target} />}
                </div>
                {kpis ? (
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div>
                      <span className="text-muted">Contract</span>
                      <p className="font-semibold text-ink">{fmtCurrency(kpis.contract_value)}</p>
                    </div>
                    <div>
                      <span className="text-muted">Actual costs</span>
                      <p className="font-semibold text-ink">{fmtCurrency(kpis.actual_costs)}</p>
                    </div>
                    <div>
                      <span className="text-muted">Claimed</span>
                      <p className="font-semibold text-ink">{fmtCurrency(kpis.claims_issued)}</p>
                    </div>
                    <div>
                      <span className="text-muted">Forecast margin</span>
                      <p className="font-semibold text-ink">
                        {kpis.forecast_margin_pct != null ? `${kpis.forecast_margin_pct.toFixed(1)}%` : "—"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted">No financial data yet</p>
                )}
              </button>
            );
          })}
        </div>
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
