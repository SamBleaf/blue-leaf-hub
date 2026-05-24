import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth } from "./requireAuth.mjs";

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * @param {import("express").Express} app
 */
export function registerOperationsRoutes(app) {
  // ── Operations enriched projects list ──────────────────────────────────────

  app.get("/api/operations/projects", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured." });
    try {
      const { data: projects, error: pe } = await sb
        .from("projects")
        .select("id, address, status, tentative_start_date, accepted_trades, buildexact_job_id, buildexact_link_source, created_at, schedule_baseline_locked_at, jobs(id, won_at)")
        .order("created_at", { ascending: false });
      if (pe) throw pe;

      const projectIds = (projects || []).map((p) => p.id);
      let tasks = [];
      if (projectIds.length) {
        const { data: td } = await sb
          .from("schedule_tasks")
          .select("id, project_id, name, start_date, end_date, percent_complete, task_type, is_hold_point, assignee_trade, trade")
          .in("project_id", projectIds)
          .is("deleted_at", null);
        tasks = td || [];
      }

      const today = new Date().toISOString().slice(0, 10);
      const byProject = {};
      for (const t of tasks) {
        if (!byProject[t.project_id]) byProject[t.project_id] = [];
        byProject[t.project_id].push(t);
      }

      const enriched = (projects || []).map((p) => {
        const pt = byProject[p.id] || [];
        const total = pt.length;
        const done = pt.filter((t) => (Number(t.percent_complete) || 0) >= 100).length;
        const overdue = pt.filter((t) => (Number(t.percent_complete) || 0) < 100 && t.end_date && t.end_date < today).length;
        const overall = total > 0 ? Math.round(pt.reduce((s, t) => s + (Number(t.percent_complete) || 0), 0) / total) : 0;

        const nextMilestone = pt
          .filter((t) => (t.task_type === "milestone" || t.is_hold_point) && (Number(t.percent_complete) || 0) < 100 && t.start_date >= today)
          .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] || null;

        const activeTrades = [...new Set(
          pt.filter((t) => { const pct = Number(t.percent_complete) || 0; return pct > 0 && pct < 100; })
            .map((t) => t.assignee_trade || t.trade).filter(Boolean)
        )];

        const health = overdue >= 4 ? "red" : overdue >= 1 ? "amber" : "green";

        return { ...p, schedule: { total, done, overdue, overall, nextMilestone, activeTrades, health } };
      });

      return res.json({ ok: true, projects: enriched });
    } catch (e) {
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get("/api/operations/global-tasks", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured." });
    try {
      const { data: projects } = await sb.from("projects").select("id, address");
      const { data: tasks } = await sb
        .from("schedule_tasks")
        .select("id, project_id, name, phase, start_date, end_date, percent_complete, task_type, is_hold_point, assignee_trade, trade")
        .is("deleted_at", null)
        .order("start_date", { ascending: true, nullsFirst: false });
      return res.json({ ok: true, projects: projects || [], tasks: tasks || [] });
    } catch (e) {
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // ── Trade conflict detection ───────────────────────────────────────────────

  app.get("/api/operations/trade-conflicts", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured." });
    try {
      // Fetch all incomplete tasks with a trade assigned and valid date range
      const { data: tasks, error } = await sb
        .from("schedule_tasks")
        .select("id, project_id, name, assignee_trade, trade, start_date, end_date, percent_complete, projects(id, address, status)")
        .is("deleted_at", null)
        .not("start_date", "is", null)
        .not("end_date", "is", null)
        .lt("percent_complete", 100);
      if (error) throw error;

      // Filter to active projects only; use assignee_trade ?? trade
      const activeTasks = (tasks || []).filter(
        t => t.projects?.status === "active" && (t.assignee_trade || t.trade)
      ).map(t => ({
        id: t.id,
        project_id: t.project_id,
        address: t.projects?.address || "Unknown",
        tradeName: (t.assignee_trade || t.trade).trim(),
        taskName: t.name,
        start: t.start_date,
        end: t.end_date,
      }));

      // Group by trade name
      const byTrade = {};
      for (const t of activeTasks) {
        if (!byTrade[t.tradeName]) byTrade[t.tradeName] = [];
        byTrade[t.tradeName].push(t);
      }

      // Find overlapping date ranges across different projects
      const conflicts = [];
      for (const [tradeName, tradeTasks] of Object.entries(byTrade)) {
        const conflictingProjects = new Map(); // projectId → {address, taskName, startDate, endDate}

        for (let i = 0; i < tradeTasks.length; i++) {
          for (let j = i + 1; j < tradeTasks.length; j++) {
            const a = tradeTasks[i];
            const b = tradeTasks[j];
            if (a.project_id === b.project_id) continue; // same project = fine
            // Date range overlap: a.start <= b.end AND b.start <= a.end
            if (a.start <= b.end && b.start <= a.end) {
              if (!conflictingProjects.has(a.project_id)) {
                conflictingProjects.set(a.project_id, { id: a.project_id, address: a.address, taskName: a.taskName, startDate: a.start, endDate: a.end });
              }
              if (!conflictingProjects.has(b.project_id)) {
                conflictingProjects.set(b.project_id, { id: b.project_id, address: b.address, taskName: b.taskName, startDate: b.start, endDate: b.end });
              }
            }
          }
        }

        if (conflictingProjects.size >= 2) {
          conflicts.push({ trade: tradeName, projects: [...conflictingProjects.values()] });
        }
      }

      return res.json({ ok: true, conflicts });
    } catch (e) {
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
