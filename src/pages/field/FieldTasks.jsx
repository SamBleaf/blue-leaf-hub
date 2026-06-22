import { useEffect, useState } from "react";
import { can } from "../../lib/roles.js";
import { useAuth } from "../../lib/useAuth.js";
import { getSupabase, supabaseConfigured } from "../../lib/supabaseClient";
import { Card, Loading, Empty, PageTitle } from "../clientportal/clientPortalUi.jsx";

const STATUS_DOT = { complete: "bg-emerald-500", in_progress: "bg-blue-500", planned: "bg-slate-300" };

export default function FieldTasks() {
  const { role } = useAuth();
  const canEdit = can.editSchedule(role); // supervisors/admin mark done; employees view-only
  const [byProject, setByProject] = useState({});
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [err, setErr] = useState(null);

  async function load() {
    if (!supabaseConfigured()) { setLoading(false); return; }
    const sb = getSupabase();
    const [{ data: tasks }, { data: projects }] = await Promise.all([
      sb.from("schedule_tasks")
        .select("id, name, trade, phase, percent_complete, status, project_id, end_date")
        .neq("status", "complete").order("end_date"),
      sb.from("projects").select("id, address").limit(50),
    ]);
    const nm = {}; for (const p of projects || []) nm[p.id] = p.address;
    const grouped = {}; for (const t of tasks || []) (grouped[t.project_id] ||= []).push(t);
    setNames(nm); setByProject(grouped); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function markDone(t) {
    if (!canEdit) return;
    setSaving(t.id);
    setErr(null);
    const sb = getSupabase();
    const { error } = await sb.from("schedule_tasks").update({ percent_complete: 100, status: "complete" }).eq("id", t.id);
    setSaving(null);
    if (error) { setErr("Couldn't mark that task done — try again."); return; } // don't drop it from the list on failure
    setByProject((prev) => {
      const next = { ...prev };
      next[t.project_id] = (next[t.project_id] || []).filter((x) => x.id !== t.id);
      if (!next[t.project_id].length) delete next[t.project_id];
      return next;
    });
  }

  if (loading) return <div className="space-y-4"><PageTitle>Tasks</PageTitle><Loading label="Loading tasks…" /></div>;

  const projectIds = Object.keys(byProject);

  return (
    <div className="space-y-4">
      <PageTitle sub={canEdit ? "Tap the circle to mark a task done" : "View only"}>Tasks</PageTitle>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{err}</div>}
      {projectIds.length === 0 ? (
        <Empty title="No open tasks" hint="Open schedule tasks across active projects show here." />
      ) : (
        projectIds.map((pid) => (
          <Card key={pid} title={names[pid] || "Project"}>
            <div className="space-y-1.5">
              {byProject[pid].map((t) => (
                <div key={t.id} className="flex items-center gap-2.5 rounded-lg border border-hairline bg-page/50 px-3 py-2">
                  {canEdit ? (
                    <button
                      onClick={() => markDone(t)}
                      disabled={saving === t.id}
                      aria-label="Mark done"
                      className="h-9 w-9 shrink-0 flex items-center justify-center rounded-full border-2 border-hairline text-muted hover:border-primary hover:text-primary transition-colors disabled:opacity-40"
                    >
                      {saving === t.id ? "…" : "○"}
                    </button>
                  ) : (
                    <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[t.status] || "bg-slate-300"}`} />
                  )}
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
          </Card>
        ))
      )}
    </div>
  );
}
