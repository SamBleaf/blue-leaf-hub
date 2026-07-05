import { authFetch } from "../lib/authFetch.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import FilterChips from "../components/ui/FilterChips.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import OpsKpiStrip from "../components/operations/OpsKpiStrip.jsx";
import OpsActionQueue from "../components/operations/OpsActionQueue.jsx";
import OpsProjectCard from "../components/operations/OpsProjectCard.jsx";
import OpsProjectTable from "../components/operations/OpsProjectTable.jsx";
import OpsConflictBanner from "../components/operations/OpsConflictBanner.jsx";
import GlobalGanttPanel from "../components/operations/GlobalGanttPanel.jsx";
import OpsJobsMap from "../components/operations/OpsJobsMap.jsx";
import { computeOpsKpis, buildOpsActionQueue, groupProjectsByRisk } from "../lib/operationsDashboard.js";

function RiskGroup({ group, colorIndexById, layout }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-ink">{group.label}</h3>
        <StatusBadge variant={group.variant}>{group.items.length}</StatusBadge>
      </div>
      <div className={layout === "grid" ? "grid gap-3 sm:grid-cols-2" : "space-y-3"}>
        {group.items.map((p) => <OpsProjectCard key={p.id} project={p} colorIdx={colorIndexById[p.id]} />)}
      </div>
    </div>
  );
}

function PortfolioScorecard({ kpis, riskGroups }) {
  const total = kpis.active || 1;
  const seg = [
    { n: kpis.onTrack, color: "#16A34A", label: "On track" },
    { n: kpis.atRisk, color: "#D4A24C", label: "At risk" },
    { n: kpis.behind, color: "#DC2626", label: "Behind" },
  ];
  return (
    <div className="rounded-card border border-hairline bg-surface p-5">
      <h3 className="text-sm font-semibold text-ink">Portfolio health</h3>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-page">
        {seg.filter((s) => s.n > 0).map((s) => (
          <div key={s.label} style={{ width: `${(s.n / total) * 100}%`, backgroundColor: s.color }} title={`${s.label}: ${s.n}`} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        {seg.map((s) => (
          <div key={s.label} className="rounded-lg border border-hairline bg-page/60 p-3">
            <div className="text-xl font-bold text-ink">{s.n}</div>
            <div className="text-xs text-muted">{s.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">{kpis.overdue} overdue task{kpis.overdue !== 1 ? "s" : ""} across {kpis.active} active project{kpis.active !== 1 ? "s" : ""}.</p>
      {riskGroups.length === 0 && <p className="mt-2 text-xs text-muted">No active projects to score yet.</p>}
    </div>
  );
}

export default function OperationsList() {
  // ── Data layer (behaviour-preserving — same endpoints, same authFetch, same state) ──
  const [projects, setProjects] = useState([]);
  const [globalTasks, setGlobalTasks] = useState([]);
  const [globalProjects, setGlobalProjects] = useState([]);
  const [tradeConflicts, setTradeConflicts] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("board"); // board | actions | list | scorecard
  const [filterTrade, setFilterTrade] = useState("");
  const [ganttOpen, setGanttOpen] = useState(() => {
    try { return localStorage.getItem("blhub_global_gantt_open") !== "false"; } catch { return true; }
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/api/operations/projects");
      const j = await res.json();
      if (res.ok && j.ok) setProjects(j.projects || []);
      else setError(j.error || "Failed to load projects");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGlobal = useCallback(async () => {
    try {
      const res = await authFetch("/api/operations/global-tasks");
      const j = await res.json();
      if (res.ok && j.ok) {
        setGlobalTasks(j.tasks || []);
        setGlobalProjects(j.projects || []);
      }
    } catch {
      // non-fatal
    }
  }, []);

  const loadConflicts = useCallback(async () => {
    try {
      const res = await authFetch("/api/operations/trade-conflicts");
      const j = await res.json();
      if (res.ok && j.ok) setTradeConflicts(j.conflicts || []);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadGlobal(); }, [loadGlobal]);
  useEffect(() => { loadConflicts(); }, [loadConflicts]);

  function toggleGantt() {
    setGanttOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem("blhub_global_gantt_open", String(next)); } catch { /* noop */ }
      return next;
    });
  }

  // ── Derived (pure) ──
  const kpis = useMemo(() => computeOpsKpis(projects), [projects]);
  const actions = useMemo(() => buildOpsActionQueue(projects, tradeConflicts), [projects, tradeConflicts]);
  const riskGroups = useMemo(() => groupProjectsByRisk(projects), [projects]);
  const colorIndexById = useMemo(() => Object.fromEntries(projects.map((p, i) => [p.id, i])), [projects]);

  const views = [
    { value: "board", label: "Board" },
    { value: "actions", label: "Actions", count: actions.length },
    { value: "list", label: "List" },
    { value: "scorecard", label: "Scorecard" },
  ];

  return (
    <div className="space-y-5 pb-24">
      <header>
        <h1 className="page-title text-2xl">Operations</h1>
        <p className="mt-0.5 text-sm text-muted">What&rsquo;s happening, what&rsquo;s blocked, and what needs action across active builds.</p>
      </header>

      {error && <div className="text-sm text-danger">{error}</div>}

      <OpsConflictBanner conflicts={tradeConflicts} />

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !projects.length ? (
        <EmptyState title="No active projects yet" hint="Mark a tender as won in Tender Manager to start a build — it will appear here." />
      ) : (
        <>
          <OpsKpiStrip kpis={kpis} />

          <OpsJobsMap />

          <FilterChips options={views} value={view} onChange={setView} />

          {/* DESKTOP (lg+) */}
          <div className="hidden lg:block">
            {view === "board" && (
              <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
                <OpsActionQueue actions={actions} />
                <div className="space-y-5">
                  {riskGroups.map((g) => <RiskGroup key={g.key} group={g} colorIndexById={colorIndexById} layout="grid" />)}
                </div>
              </div>
            )}
            {view === "actions" && <OpsActionQueue actions={actions} />}
            {view === "list" && <OpsProjectTable projects={projects} />}
            {view === "scorecard" && <PortfolioScorecard kpis={kpis} riskGroups={riskGroups} />}
          </div>

          {/* TABLET + MOBILE (< lg) — grouped cards, never a squeezed table; action queue stays visible */}
          <div className="space-y-5 lg:hidden">
            {view === "scorecard" ? (
              <PortfolioScorecard kpis={kpis} riskGroups={riskGroups} />
            ) : (
              <>
                <OpsActionQueue actions={actions} />
                {view !== "actions" && riskGroups.map((g) => (
                  <RiskGroup key={g.key} group={g} colorIndexById={colorIndexById} layout="stack" />
                ))}
              </>
            )}
          </div>

          {/* Global cross-project schedule — secondary entry point (collapsible; primary decision surfaces are above) */}
          <div className="overflow-hidden rounded-card border border-hairline bg-surface">
            <button
              type="button"
              onClick={toggleGantt}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-ink transition-colors hover:bg-page focus-ring"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-muted">All Projects — Schedule</span>
                {globalTasks.length > 0 && (
                  <span className="rounded-full border border-hairline bg-page px-2 py-0.5 text-xs font-normal text-muted">
                    {globalProjects.length} projects · {globalTasks.length} tasks
                  </span>
                )}
                {tradeConflicts.length > 0 && (
                  <StatusBadge variant="warning">{tradeConflicts.length} conflict{tradeConflicts.length !== 1 ? "s" : ""}</StatusBadge>
                )}
              </span>
              <span className={`text-muted transition-transform ${ganttOpen ? "rotate-180" : ""}`}>▾</span>
            </button>
            {ganttOpen && (
              <div className="space-y-4 border-t border-hairline px-4 pb-4 pt-3">
                {globalTasks.length === 0 ? (
                  <p className="py-2 text-sm text-muted">No scheduled tasks found — add a schedule to a project to see it here.</p>
                ) : (
                  <GlobalGanttPanel
                    projects={globalProjects.length ? globalProjects : projects.map((p) => ({ id: p.id, address: p.address }))}
                    tasks={globalTasks}
                    filterTrade={filterTrade}
                    onFilterTrade={setFilterTrade}
                  />
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
