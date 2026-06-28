/**
 * adminRoutes.mjs — Admin-only endpoints
 * Admin-gated (user_profiles.role = 'admin'). Exposes AI cost summary for the Settings widget.
 */

import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";

export function registerAdminRoutes(app) {
  /**
   * GET /api/ai-costs/summary?month=YYYY-MM
   * Returns AI call totals for the requested month (defaults to current month).
   * Director role required.
   */
  app.get(
    "/api/ai-costs/summary",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const sb = getServiceSupabase();
        if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });

        // Determine month window
        const monthParam = req.query.month; // e.g. "2026-05"
        let monthStart, monthEnd;
        if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
          monthStart = `${monthParam}-01T00:00:00.000Z`;
          const [y, m] = monthParam.split("-").map(Number);
          const nextM = m === 12 ? 1 : m + 1;
          const nextY = m === 12 ? y + 1 : y;
          monthEnd = `${String(nextY).padStart(4, "0")}-${String(nextM).padStart(2, "0")}-01T00:00:00.000Z`;
        } else {
          const now = new Date();
          const y = now.getUTCFullYear();
          const m = now.getUTCMonth() + 1;
          monthStart = `${y}-${String(m).padStart(2, "0")}-01T00:00:00.000Z`;
          const nextM = m === 12 ? 1 : m + 1;
          const nextY = m === 12 ? y + 1 : y;
          monthEnd = `${String(nextY).padStart(4, "0")}-${String(nextM).padStart(2, "0")}-01T00:00:00.000Z`;
        }

        // Fetch rows for the month
        const { data: rows, error } = await sb
          .from("ai_call_log")
          .select("module, model, input_tokens, output_tokens, cost_usd, is_streaming, called_at")
          .gte("called_at", monthStart)
          .lt("called_at", monthEnd)
          .order("called_at", { ascending: true });

        if (error) return res.status(500).json({ ok: false, error: error.message });

        const totalCost = rows.reduce((s, r) => s + (r.cost_usd || 0), 0);
        const totalCalls = rows.length;
        const totalInputTokens = rows.reduce((s, r) => s + (r.input_tokens || 0), 0);
        const totalOutputTokens = rows.reduce((s, r) => s + (r.output_tokens || 0), 0);

        // By module
        const moduleMap = {};
        for (const r of rows) {
          const key = r.module || "unknown";
          if (!moduleMap[key]) moduleMap[key] = { module: key, calls: 0, cost_usd: 0 };
          moduleMap[key].calls++;
          moduleMap[key].cost_usd += r.cost_usd || 0;
        }
        const byModule = Object.values(moduleMap)
          .sort((a, b) => b.cost_usd - a.cost_usd);

        // By model
        const modelMap = {};
        for (const r of rows) {
          const key = r.model || "unknown";
          if (!modelMap[key]) modelMap[key] = { model: key, calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
          modelMap[key].calls++;
          modelMap[key].input_tokens  += r.input_tokens  || 0;
          modelMap[key].output_tokens += r.output_tokens || 0;
          modelMap[key].cost_usd += r.cost_usd || 0;
        }
        const byModel = Object.values(modelMap)
          .sort((a, b) => b.cost_usd - a.cost_usd);

        // Daily trend
        const dayMap = {};
        for (const r of rows) {
          const day = (r.called_at || "").slice(0, 10);
          if (!day) continue;
          if (!dayMap[day]) dayMap[day] = { date: day, calls: 0, cost_usd: 0 };
          dayMap[day].calls++;
          dayMap[day].cost_usd += r.cost_usd || 0;
        }
        const dailyTrend = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));

        // Available months (last 12 months with any data)
        const { data: monthRows } = await sb
          .from("ai_call_log")
          .select("called_at")
          .order("called_at", { ascending: false })
          .limit(10000);

        const monthSet = new Set();
        for (const r of monthRows || []) {
          const m = (r.called_at || "").slice(0, 7);
          if (m) monthSet.add(m);
        }
        const availableMonths = [...monthSet].sort().reverse();

        return res.json({
          ok: true,
          month: monthParam || `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`,
          total_cost_usd:      totalCost,
          total_calls:         totalCalls,
          total_input_tokens:  totalInputTokens,
          total_output_tokens: totalOutputTokens,
          by_module:    byModule,
          by_model:     byModel,
          daily_trend:  dailyTrend,
          available_months: availableMonths,
        });
      } catch (err) {
        console.error("[ai-costs/summary]", err.message);
        res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  // ── Data Cleanup (admin) ────────────────────────────────────────────────────
  // Anchored-at-start test markers. Real records never start with these, so matching is safe.
  const TEST_MARKERS = ["BLH TEST%", "__BLH TEST%", "__HARDENING TEST%", "__BATCH_A__%", "BATCHA%", "BATCH A%", "__E2E%", "E2E %", "DEBUG%", "DEBUG2%", "__DRYRUN%", "__DEMO%", "__P0A5%", "__RFQ TEST%"];

  async function scanTable(sb, table, col) {
    const map = new Map();
    for (const m of TEST_MARKERS) {
      const { data } = await sb.from(table).select(`id, ${col}`).ilike(col, m);
      for (const r of data || []) map.set(r.id, r[col]);
    }
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  }

  // Re-validate ids server-side: only ids that STILL match a test marker survive. The tool can
  // therefore never delete a real record, even if the client sends a bad id.
  async function testMarkedIds(sb, table, col, ids) {
    if (!ids?.length) return [];
    const safe = new Set();
    for (const m of TEST_MARKERS) {
      const { data } = await sb.from(table).select("id").ilike(col, m).in("id", ids);
      for (const r of data || []) safe.add(r.id);
    }
    return ids.filter((id) => safe.has(id));
  }

  // GET /api/admin/cleanup/scan — list test-marked projects/jobs/leads.
  app.get("/api/admin/cleanup/scan", requireAuth, requireRole("admin"), async (_req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
      const [projects, jobs, leads] = await Promise.all([
        scanTable(sb, "projects", "address"),
        scanTable(sb, "jobs", "address"),
        scanTable(sb, "leads", "name"),
      ]);
      res.json({ ok: true, projects, jobs, leads });
    } catch (err) {
      console.error("[admin/cleanup/scan]", err.message);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/admin/cleanup/delete { projectIds, jobIds, leadIds }
  // Deletes only test-marked records (re-validated). Projects go via admin_delete_projects()
  // which bypasses the append-only audit trigger; jobs/leads delete directly.
  app.post("/api/admin/cleanup/delete", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
      const { projectIds = [], jobIds = [], leadIds = [] } = req.body || {};

      const pSafe = await testMarkedIds(sb, "projects", "address", projectIds);
      const jSafe = await testMarkedIds(sb, "jobs", "address", jobIds);
      const lSafe = await testMarkedIds(sb, "leads", "name", leadIds);
      const rejected =
        (projectIds.length - pSafe.length) + (jobIds.length - jSafe.length) + (leadIds.length - lSafe.length);

      const counts = { projects: 0, jobs: 0, leads: 0 };

      if (pSafe.length) {
        // Clear children that may not cascade, then delete projects past the audit trigger.
        await sb.from("workforce_allocations").delete().in("project_id", pSafe);
        await sb.from("schedule_tasks").delete().in("project_id", pSafe);
        const { data, error } = await sb.rpc("admin_delete_projects", { p_ids: pSafe });
        if (error) {
          const hint = /admin_delete_projects|PGRST202|function/i.test(`${error.message} ${error.code}`)
            ? "Migration 123 (admin_delete_projects) isn't applied yet — apply it in Supabase, then retry."
            : error.message;
          return res.status(500).json({ ok: false, error: hint });
        }
        counts.projects = typeof data === "number" ? data : pSafe.length;
      }
      if (jSafe.length) {
        const { data } = await sb.from("jobs").delete().in("id", jSafe).select("id");
        counts.jobs = (data || []).length;
      }
      if (lSafe.length) {
        const { data } = await sb.from("leads").delete().in("id", lSafe).select("id");
        counts.leads = (data || []).length;
      }

      res.json({ ok: true, ...counts, rejected });
    } catch (err) {
      console.error("[admin/cleanup/delete]", err.message);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  console.log("[admin] routes registered");
}
