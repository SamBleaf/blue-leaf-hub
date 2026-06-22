import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/useAuth.js";
import { can } from "../../lib/roles.js";
import { apiFetch } from "../../lib/apiFetch.js";
import { getSupabase, supabaseConfigured } from "../../lib/supabaseClient";
import { Card, Loading, Empty, PageTitle, fmtDate } from "../clientportal/clientPortalUi.jsx";

const STATUS_DOT = { complete: "bg-emerald-500", in_progress: "bg-blue-500", planned: "bg-slate-300" };

export default function FieldHome() {
  const { role } = useAuth();
  const showCost = can.viewCostData(role);
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
  const [tasksByProject, setTasksByProject] = useState({});
  const [projectName, setProjectName] = useState({});
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        // Today on site — schedule_tasks spanning today, not complete.
        if (supabaseConfigured) {
          const sb = getSupabase();
          const [{ data: tasks }, { data: projects }] = await Promise.all([
            sb.from("schedule_tasks")
              .select("id, name, trade, phase, percent_complete, status, project_id, start_date, end_date")
              .lte("start_date", today).gte("end_date", today).neq("status", "complete").order("phase"),
            sb.from("projects").select("id, address").limit(50),
          ]);
          if (!stop) {
            const names = {};
            for (const p of projects || []) names[p.id] = p.address;
            const grouped = {};
            for (const t of tasks || []) (grouped[t.project_id] ||= []).push(t);
            setProjectName(names);
            setTasksByProject(grouped);
          }
        }
        // My carpentry jobs (active) — cost-stripped card data.
        if (can.accessCarpentry(role)) {
          const { ok, data } = await apiFetch("/api/carpentry/jobs?status=active");
          if (!stop && ok) setJobs(data?.jobs || []);
        }
      } catch (e) {
        console.error("[FieldHome] load failed", e);
      } finally {
        setLoading(false);
      }
    })();
    return () => { stop = true; };
  }, [role, today]);

  const taskCount = useMemo(() => Object.values(tasksByProject).reduce((n, a) => n + a.length, 0), [tasksByProject]);
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; })();

  if (loading) return <div className="space-y-4"><PageTitle sub={fmtDate(today)}>{greeting}</PageTitle><Loading label="Loading your day…" /></div>;

  return (
    <div className="space-y-4">
      <PageTitle sub={fmtDate(today)}>{greeting}</PageTitle>

      <Card title={`Today on site${taskCount ? ` · ${taskCount}` : ""}`}>
        {taskCount === 0 ? (
          <Empty title="Nothing scheduled for today" hint="Tasks spanning today across active projects show here." />
        ) : (
          <div className="space-y-4">
            {Object.entries(tasksByProject).map(([pid, items]) => (
              <div key={pid}>
                <p className="text-xs font-semibold text-muted mb-1">{projectName[pid] || "Project"}</p>
                <div className="space-y-1.5">
                  {items.map((t) => (
                    <div key={t.id} className="flex items-center gap-2.5 rounded-lg border border-hairline bg-page/50 px-3 py-2">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[t.status] || "bg-slate-300"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink truncate">{t.name}</p>
                        <p className="text-[11px] text-muted">{[t.trade, t.phase].filter(Boolean).join(" · ")}</p>
                      </div>
                      {t.percent_complete > 0 && t.percent_complete < 100 && (
                        <span className="text-[11px] text-muted shrink-0">{t.percent_complete}%</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {can.accessCarpentry(role) && (
        <Card title={`My jobs${jobs.length ? ` · ${jobs.length}` : ""}`} action={<Link to="/field/jobs" className="text-xs font-medium text-primary">All</Link>}>
          {jobs.length === 0 ? (
            <Empty title="No active jobs" />
          ) : (
            <div className="space-y-1.5">
              {jobs.slice(0, 5).map((j) => (
                <Link key={j.id} to={`/carpentry/${j.id}`} className="block rounded-lg border border-hairline bg-page/50 px-3 py-2 hover:bg-page transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink truncate">{j.reference || j.clientName || "Job"}</p>
                    <span className="text-[11px] text-muted shrink-0">{j.status}</span>
                  </div>
                  <p className="text-[11px] text-muted truncate">{j.address}</p>
                  {(j.startDate || j.endDate) && (
                    <p className="text-[11px] text-muted mt-0.5">{fmtDate(j.startDate)} → {fmtDate(j.endDate)}</p>
                  )}
                  {showCost && j.quotedValue != null && (
                    <p className="text-[11px] text-muted mt-0.5">Quoted ${Number(j.quotedValue).toLocaleString()}</p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card title="Quick actions">
        <div className="grid grid-cols-2 gap-2">
          <Link to="/field/diary" className="rounded-lg border border-hairline px-3 py-3 text-sm font-medium text-ink text-center hover:bg-page">Site diary</Link>
          <Link to="/field/tasks" className="rounded-lg border border-hairline px-3 py-3 text-sm font-medium text-ink text-center hover:bg-page">Tasks</Link>
          <Link to="/field/whs" className="rounded-lg border border-hairline px-3 py-3 text-sm font-medium text-ink text-center hover:bg-page">WHS</Link>
          <Link to="/operations" className="rounded-lg border border-hairline px-3 py-3 text-sm font-medium text-ink text-center hover:bg-page">Operations</Link>
        </div>
      </Card>
    </div>
  );
}
