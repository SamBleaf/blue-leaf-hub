/**
 * adminRoutes.mjs — Admin-only endpoints
 * Director-gated. Currently exposes AI cost summary for Settings widget.
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
    requireRole("director"),
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

  console.log("[admin] routes registered");
}
