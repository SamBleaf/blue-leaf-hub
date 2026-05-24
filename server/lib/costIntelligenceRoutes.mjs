/**
 * Cost Intelligence API — Buildxact estimate template + per-job estimate sync.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth } from "./requireAuth.mjs";
import {
  getBuildxactTemplateCatalog,
  pullJobEstimateForCostIntelligence,
  syncEstimateToCostIntelligence
} from "./costIntelligenceEstimate.mjs";

export function registerCostIntelligenceRoutes(app) {
  app.use("/api/cost-intelligence", requireAuth);

  /** Master Buildxact template (37 trade_categories + mapping metadata). */
  app.get("/api/cost-intelligence/template", async (_req, res) => {
    const db = getServiceSupabase();
    try {
      const catalog = await getBuildxactTemplateCatalog(db);
      res.json({ ok: true, ...catalog });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /** Live estimate breakdown for a job (requires linked Buildxact job). */
  app.get("/api/cost-intelligence/jobs/:jobId/estimate", async (req, res) => {
    const db = getServiceSupabase();
    if (!db) return res.status(503).json({ ok: false, error: "DB unavailable" });
    try {
      const result = await pullJobEstimateForCostIntelligence(db, req.params.jobId);
      if (!result.ok) return res.status(result.error?.includes("not configured") ? 400 : 404).json(result);
      res.json({
        ok: true,
        buildexact_job_id: result.buildexact_job_id,
        cost_metrics: result.cost_metrics,
        parsed: result.parsed,
        quote_capable_trades: result.quote_capable_trades,
        summary: {
          category_count: result.parsed.categories.length,
          total_ex_gst: result.parsed.total_ex_gst,
          quote_capable_total: result.parsed.quote_capable_total,
          unmatched_count: result.parsed.unmatched.length
        }
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /** Sync estimate → job_budgets + normalized_costs + project_metrics. */
  app.post("/api/cost-intelligence/jobs/:jobId/sync-estimate", async (req, res) => {
    const db = getServiceSupabase();
    if (!db) return res.status(503).json({ ok: false, error: "DB unavailable" });
    try {
      const result = await syncEstimateToCostIntelligence(db, req.params.jobId);
      if (!result.ok) return res.status(400).json(result);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── project_metrics: get ──────────────────────────────────────────────────────
  app.get("/api/cost-intelligence/jobs/:jobId/metrics", async (req, res) => {
    const db = getServiceSupabase();
    const { jobId } = req.params;
    const [metricsRes, jobRes] = await Promise.all([
      db.from("project_metrics").select("*").eq("job_id", jobId).maybeSingle(),
      db.from("jobs").select("id, address, floor_area_m2, project_type, storeys").eq("id", jobId).maybeSingle(),
    ]);
    res.json({ ok: true, metrics: metricsRes.data || null, job: jobRes.data || null });
  });

  // ── project_metrics: sync from existing sources ───────────────────────────────
  app.post("/api/cost-intelligence/jobs/:jobId/metrics/sync", async (req, res) => {
    const db = getServiceSupabase();
    const { jobId } = req.params;
    const now = new Date().toISOString();

    // Pull from jobs table
    const { data: job } = await db.from("jobs")
      .select("floor_area_m2, project_type, storeys")
      .eq("id", jobId).maybeSingle();

    // Pull latest cost_intelligence row for this job
    const { data: ci } = await db.from("cost_intelligence")
      .select("roof_area, wall_area, wet_areas, floor_area_m2, storeys")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: existing } = await db.from("project_metrics").select("id").eq("job_id", jobId).maybeSingle();

    const patch = {
      job_id: jobId,
      floor_area_m2: job?.floor_area_m2 || ci?.floor_area_m2 || null,
      roof_area_m2: ci?.roof_area || null,
      wall_area_m2: ci?.wall_area || null,
      wet_areas: ci?.wet_areas || null,
      project_type: job?.project_type || null,
      storeys: job?.storeys || ci?.storeys || null,
      extraction_source: "sync",
      extracted_at: now,
      updated_at: now,
    };

    if (existing?.id) {
      await db.from("project_metrics").update(patch).eq("id", existing.id);
    } else {
      await db.from("project_metrics").insert({ ...patch, created_at: now });
    }

    const { data: updated } = await db.from("project_metrics").select("*").eq("job_id", jobId).maybeSingle();
    res.json({ ok: true, metrics: updated });
  });

  // ── project_metrics: manual update ───────────────────────────────────────────
  app.put("/api/cost-intelligence/jobs/:jobId/metrics", async (req, res) => {
    const db = getServiceSupabase();
    const { jobId } = req.params;
    const now = new Date().toISOString();
    const allowed = [
      "floor_area_m2","roof_area_m2","wall_area_m2","storeys","site_slope","site_access",
      "project_type","wall_type","roof_type","wet_areas","number_of_windows","window_area_m2",
      "has_raked_ceilings","has_skillion_roof","has_parapets","has_suspended_slab",
      "has_retaining_walls","bal_rating","architectural_complexity_score","overall_complexity_score",
      "garage_area_m2","alfresco_area_m2","deck_area_m2","concrete_volume_m3",
    ];
    const patch = { updated_at: now };
    for (const k of allowed) {
      if (k in req.body) patch[k] = req.body[k] === "" ? null : req.body[k];
    }

    const { data: existing } = await db.from("project_metrics").select("id").eq("job_id", jobId).maybeSingle();
    if (existing?.id) {
      patch.extraction_source = "manual";
      await db.from("project_metrics").update(patch).eq("id", existing.id);
    } else {
      await db.from("project_metrics").insert({ job_id: jobId, ...patch, extraction_source: "manual", created_at: now });
    }
    const { data: updated } = await db.from("project_metrics").select("*").eq("job_id", jobId).maybeSingle();
    res.json({ ok: true, metrics: updated });
  });

  // ── project_metrics: AI extraction from plan PDF ──────────────────────────────
  // Body: { pdf_base64: string, filename?: string }
  app.post("/api/cost-intelligence/jobs/:jobId/metrics/extract", async (req, res) => {
    const { jobId } = req.params;
    const { pdf_base64, filename } = req.body || {};
    if (!pdf_base64) return res.status(400).json({ ok: false, error: "pdf_base64 required" });

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) return res.status(503).json({ ok: false, error: "ANTHROPIC_API_KEY not set" });

    const client = new Anthropic({ apiKey });

    const prompt = `You are extracting project metrics from an architectural plan PDF for a residential building project in South Australia.

Extract the following fields from the plans. For each field, provide a confidence score (0-100) based on how certain you are.

Return ONLY valid JSON in this exact structure:
{
  "fields": {
    "floor_area_m2": { "value": number|null, "confidence": number },
    "garage_area_m2": { "value": number|null, "confidence": number },
    "alfresco_area_m2": { "value": number|null, "confidence": number },
    "deck_area_m2": { "value": number|null, "confidence": number },
    "roof_area_m2": { "value": number|null, "confidence": number },
    "storeys": { "value": number|null, "confidence": number },
    "wet_areas": { "value": number|null, "confidence": number },
    "number_of_windows": { "value": number|null, "confidence": number },
    "has_raked_ceilings": { "value": boolean|null, "confidence": number },
    "has_skillion_roof": { "value": boolean|null, "confidence": number },
    "has_suspended_slab": { "value": boolean|null, "confidence": number },
    "has_retaining_walls": { "value": boolean|null, "confidence": number },
    "wall_type": { "value": string|null, "confidence": number },
    "roof_type": { "value": string|null, "confidence": number },
    "site_slope": { "value": "flat"|"gentle"|"moderate"|"steep"|"very_steep"|null, "confidence": number }
  },
  "overall_confidence": number,
  "notes": string
}

Definitions:
- floor_area_m2: internal floor area (habitable), excluding garage/alfresco
- wet_areas: count of bathrooms + ensuites + laundries
- has_raked_ceilings: true if any raked, sloped, or cathedral ceilings shown
- wall_type: "brick_veneer", "double_brick", "lightweight_clad", "rendered", or describe
- roof_type: "tiled", "colorbond", "flat", "skillion", "gable", "hip", or describe
- site_slope: assess from section drawings or site plan notation`;

    try {
      const response = await client.messages.create({
        model: process.env.CLAUDE_MODEL || "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdf_base64 },
            },
            { type: "text", text: prompt },
          ],
        }],
      });

      const raw = response.content[0]?.text || "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return res.status(422).json({ ok: false, error: "Claude did not return valid JSON", raw });

      const parsed = JSON.parse(jsonMatch[0]);
      const fields = parsed.fields || {};
      const overallConfidence = parsed.overall_confidence || 0;

      // Build the patch from high-confidence fields (threshold: 40%)
      const patch = {};
      const lowConfidence = [];
      for (const [key, item] of Object.entries(fields)) {
        if (item.value != null) {
          if (item.confidence >= 40) {
            patch[key] = item.value;
          } else {
            lowConfidence.push({ field: key, value: item.value, confidence: item.confidence });
          }
        }
      }

      // Save high-confidence fields
      const db = getServiceSupabase();
      const now = new Date().toISOString();
      const { data: existing } = await db.from("project_metrics").select("id").eq("job_id", jobId).maybeSingle();
      if (existing?.id) {
        await db.from("project_metrics").update({
          ...patch, extraction_source: "ai_plans", extraction_confidence: overallConfidence,
          extracted_at: now, updated_at: now
        }).eq("id", existing.id);
      } else {
        await db.from("project_metrics").insert({
          job_id: jobId, ...patch, extraction_source: "ai_plans",
          extraction_confidence: overallConfidence, extracted_at: now, created_at: now, updated_at: now
        });
      }

      const { data: updated } = await db.from("project_metrics").select("*").eq("job_id", jobId).maybeSingle();
      res.json({
        ok: true,
        metrics: updated,
        overall_confidence: overallConfidence,
        low_confidence_fields: lowConfidence,
        notes: parsed.notes || "",
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── normalized_costs: get for job ─────────────────────────────────────────────
  app.get("/api/cost-intelligence/jobs/:jobId/normalized-costs", async (req, res) => {
    const db = getServiceSupabase();
    const { jobId } = req.params;
    const [ncRes, tcRes, metricsRes] = await Promise.all([
      db.from("normalized_costs").select("*, trade_categories(name, sort_order)").eq("job_id", jobId).order("trade_categories(sort_order)"),
      db.from("trade_categories").select("id, name, sort_order").eq("is_active", true).order("sort_order"),
      db.from("project_metrics").select("floor_area_m2, roof_area_m2, wall_area_m2").eq("job_id", jobId).maybeSingle(),
    ]);

    // Merge: all trade categories with their normalized_costs row (or nulls)
    const ncMap = new Map((ncRes.data || []).map(r => [r.trade_category_id, r]));
    const rows = (tcRes.data || []).map(tc => ({
      trade_category_id: tc.id,
      trade_category_name: tc.name,
      sort_order: tc.sort_order,
      ...(ncMap.get(tc.id) || {}),
    }));

    res.json({ ok: true, rows, metrics: metricsRes.data || null });
  });

  // ── helpers ───────────────────────────────────────────────────────────────────
  function pct(arr, p) {
    if (!arr.length) return null;
    const idx = (p / 100) * (arr.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return arr[lo];
    return arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
  }

  function storeyRange(s) {
    if (s == null) return null;
    if (s <= 1) return "1";
    if (s === 2) return "2";
    return "3+";
  }

  // ── POST /api/cost-intelligence/benchmarks/recompute ─────────────────────────
  app.post("/api/cost-intelligence/benchmarks/recompute", async (_req, res) => {
    const db = getServiceSupabase();
    if (!db) return res.status(503).json({ ok: false, error: "DB unavailable" });
    try {
      const [ncRes, pmRes] = await Promise.all([
        db.from("normalized_costs").select("trade_category_id, job_id, rate_per_m2_floor, actual_amount, quoted_amount, budget_amount, budget_vs_actual_pct"),
        db.from("project_metrics").select("job_id, project_type, site_slope, storeys"),
      ]);
      const pmMap = new Map((pmRes.data || []).map(m => [m.job_id, m]));
      const groups = new Map();
      for (const nc of (ncRes.data || [])) {
        const pm = pmMap.get(nc.job_id) || {};
        const key = `${nc.trade_category_id}|||${pm.project_type || ""}|||${pm.site_slope || ""}|||${storeyRange(pm.storeys) || ""}`;
        if (!groups.has(key)) {
          groups.set(key, {
            trade_category_id: nc.trade_category_id,
            project_type: pm.project_type || null,
            site_slope: pm.site_slope || null,
            storey_range: storeyRange(pm.storeys),
            rates: [], totals: [], overruns: [],
          });
        }
        const g = groups.get(key);
        if (nc.rate_per_m2_floor != null) g.rates.push(Number(nc.rate_per_m2_floor));
        const total = Number(nc.actual_amount || nc.quoted_amount || nc.budget_amount || 0);
        if (total > 0) g.totals.push(total);
        if (nc.budget_vs_actual_pct != null) g.overruns.push(Number(nc.budget_vs_actual_pct));
      }
      let upserted = 0;
      const now = new Date().toISOString();
      for (const g of groups.values()) {
        if (g.rates.length < 3) continue;
        g.rates.sort((a, b) => a - b);
        g.totals.sort((a, b) => a - b);
        const overrunCount = g.overruns.filter(v => v > 0).length;
        const row = {
          rate_per_m2_floor_avg: g.rates.reduce((s, v) => s + v, 0) / g.rates.length,
          rate_per_m2_floor_p25: pct(g.rates, 25),
          rate_per_m2_floor_p50: pct(g.rates, 50),
          rate_per_m2_floor_p75: pct(g.rates, 75),
          rate_per_m2_floor_min: g.rates[0],
          rate_per_m2_floor_max: g.rates[g.rates.length - 1],
          sample_count: g.rates.length,
          total_cost_avg: g.totals.length ? g.totals.reduce((s, v) => s + v, 0) / g.totals.length : null,
          total_cost_p25: pct(g.totals, 25),
          total_cost_p50: pct(g.totals, 50),
          total_cost_p75: pct(g.totals, 75),
          avg_budget_overrun_pct: g.overruns.length ? g.overruns.reduce((s, v) => s + v, 0) / g.overruns.length : null,
          overrun_frequency_pct: g.overruns.length ? (overrunCount / g.overruns.length) * 100 : null,
          covers_period_from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          covers_period_to: now.slice(0, 10),
          last_updated: now,
        };
        let q = db.from("cost_benchmarks").select("id").eq("trade_category_id", g.trade_category_id);
        q = g.project_type ? q.eq("project_type", g.project_type) : q.is("project_type", null);
        q = g.site_slope ? q.eq("site_slope", g.site_slope) : q.is("site_slope", null);
        q = g.storey_range ? q.eq("storey_range", g.storey_range) : q.is("storey_range", null);
        const { data: existing } = await q.maybeSingle();
        if (existing?.id) {
          await db.from("cost_benchmarks").update(row).eq("id", existing.id);
        } else {
          await db.from("cost_benchmarks").insert({
            trade_category_id: g.trade_category_id,
            project_type: g.project_type,
            site_slope: g.site_slope,
            storey_range: g.storey_range,
            ...row,
          });
        }
        upserted++;
      }
      res.json({ ok: true, groups_computed: groups.size, benchmarks_upserted: upserted });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── GET /api/cost-intelligence/benchmarks ─────────────────────────────────────
  app.get("/api/cost-intelligence/benchmarks", async (req, res) => {
    const db = getServiceSupabase();
    if (!db) return res.status(503).json({ ok: false, error: "DB unavailable" });
    try {
      let q = db.from("cost_benchmarks")
        .select("*, trade_categories(id, name, sort_order)")
        .order("last_updated", { ascending: false });
      if (req.query.trade_category_id) q = q.eq("trade_category_id", req.query.trade_category_id);
      if (req.query.project_type) q = q.eq("project_type", req.query.project_type);
      if (req.query.site_slope) q = q.eq("site_slope", req.query.site_slope);
      if (req.query.storey_range) q = q.eq("storey_range", req.query.storey_range);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      res.json({ ok: true, benchmarks: data || [] });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── GET /api/cost-intelligence/jobs/:jobId/comparison ────────────────────────
  app.get("/api/cost-intelligence/jobs/:jobId/comparison", async (req, res) => {
    const db = getServiceSupabase();
    if (!db) return res.status(503).json({ ok: false, error: "DB unavailable" });
    const { jobId } = req.params;
    try {
      const [ncRes, pmRes] = await Promise.all([
        db.from("normalized_costs").select("*, trade_categories(id, name, sort_order)").eq("job_id", jobId),
        db.from("project_metrics").select("*").eq("job_id", jobId).maybeSingle(),
      ]);
      const normCosts = ncRes.data || [];
      const metrics = pmRes.data || null;
      if (normCosts.length === 0) return res.json({ ok: true, comparison: [], metrics });
      const tradeIds = [...new Set(normCosts.map(nc => nc.trade_category_id))];
      const { data: allBenchmarks } = await db.from("cost_benchmarks")
        .select("*").in("trade_category_id", tradeIds).gte("sample_count", 3);
      const benchmarks = allBenchmarks || [];
      const sr = storeyRange(metrics?.storeys);
      const comparison = [];
      for (const nc of normCosts) {
        const rate = nc.rate_per_m2_floor != null ? Number(nc.rate_per_m2_floor) : null;
        const total = Number(nc.actual_amount || nc.quoted_amount || nc.budget_amount || 0) || null;
        if (rate == null && !total) continue;
        const tradeBenchmarks = benchmarks.filter(b => b.trade_category_id === nc.trade_category_id);
        let benchmark = null;
        let matchType = "none";
        const candidates = [
          [tradeBenchmarks.find(b => b.project_type === metrics?.project_type && b.site_slope === metrics?.site_slope && b.storey_range === sr), "exact"],
          [tradeBenchmarks.find(b => b.project_type === metrics?.project_type && b.site_slope === metrics?.site_slope && b.storey_range == null), "partial"],
          [tradeBenchmarks.find(b => b.project_type === metrics?.project_type && b.site_slope == null && b.storey_range == null), "partial"],
          [tradeBenchmarks.find(b => b.project_type == null && b.site_slope == null && b.storey_range == null), "global"],
        ];
        for (const [b, t] of candidates) {
          if (b) { benchmark = b; matchType = t; break; }
        }
        let riskLevel = null;
        let deltaVsAvg = null;
        if (benchmark && rate != null && benchmark.rate_per_m2_floor_avg) {
          const avg = Number(benchmark.rate_per_m2_floor_avg);
          const p75 = Number(benchmark.rate_per_m2_floor_p75 || avg);
          deltaVsAvg = avg > 0 ? ((rate - avg) / avg) * 100 : null;
          if (rate <= p75) riskLevel = "low";
          else if (rate <= p75 * 1.18) riskLevel = "medium";
          else riskLevel = "high";
        }
        comparison.push({
          trade_category_id: nc.trade_category_id,
          trade_name: nc.trade_categories?.name || "",
          sort_order: nc.trade_categories?.sort_order || 0,
          current_rate: rate,
          current_total: total,
          benchmark,
          risk_level: riskLevel,
          delta_vs_avg_pct: deltaVsAvg,
          match_type: matchType,
        });
      }
      comparison.sort((a, b) => a.sort_order - b.sort_order);
      res.json({ ok: true, comparison, metrics });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── GET /api/cost-intelligence/jobs/:jobId/similar ────────────────────────────
  app.get("/api/cost-intelligence/jobs/:jobId/similar", async (req, res) => {
    const db = getServiceSupabase();
    if (!db) return res.status(503).json({ ok: false, error: "DB unavailable" });
    const { jobId } = req.params;
    try {
      const [targetRes, othersRes] = await Promise.all([
        db.from("project_metrics").select("*").eq("job_id", jobId).maybeSingle(),
        db.from("project_metrics").select("*, jobs(id, address, project_type)").neq("job_id", jobId),
      ]);
      const target = targetRes.data;
      if (!target) return res.json({ ok: true, similar: [] });
      const others = othersRes.data || [];
      const scored = [];
      for (const other of others) {
        let score = 0;
        if (target.project_type && other.project_type && target.project_type === other.project_type) score += 30;
        if (target.floor_area_m2 && other.floor_area_m2) {
          const diff = Math.abs(target.floor_area_m2 - other.floor_area_m2) / target.floor_area_m2;
          if (diff <= 0.2) score += 20; else if (diff <= 0.4) score += 10;
        }
        if (target.storeys != null && other.storeys != null && target.storeys === other.storeys) score += 10;
        if (target.site_slope && other.site_slope && target.site_slope === other.site_slope) score += 15;
        if (target.has_raked_ceilings != null && other.has_raked_ceilings != null && target.has_raked_ceilings === other.has_raked_ceilings) score += 5;
        if (target.wet_areas != null && other.wet_areas != null && Math.abs(target.wet_areas - other.wet_areas) <= 1) score += 5;
        if (target.architectural_complexity_score != null && other.architectural_complexity_score != null) {
          const diff = Math.abs(target.architectural_complexity_score - other.architectural_complexity_score);
          if (diff <= 2) score += 15; else if (diff <= 4) score += 7;
        }
        scored.push({
          job_id: other.job_id,
          address: other.jobs?.address || other.job_id,
          project_type: other.jobs?.project_type || other.project_type,
          similarity_score: score,
          floor_area_m2: other.floor_area_m2,
          storeys: other.storeys,
          site_slope: other.site_slope,
        });
      }
      scored.sort((a, b) => b.similarity_score - a.similarity_score);
      res.json({ ok: true, similar: scored.slice(0, 5) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── GET /api/cost-intelligence/trends/:tradeCategoryId ───────────────────────
  app.get("/api/cost-intelligence/trends/:tradeCategoryId", async (req, res) => {
    const db = getServiceSupabase();
    if (!db) return res.status(503).json({ ok: false, error: "DB unavailable" });
    const { tradeCategoryId } = req.params;
    const period = Math.min(24, Math.max(1, parseInt(req.query.period) || 12));
    try {
      const { data: rows, error } = await db.from("normalized_costs")
        .select("rate_per_m2_floor, recorded_at")
        .eq("trade_category_id", tradeCategoryId)
        .not("rate_per_m2_floor", "is", null)
        .order("recorded_at", { ascending: true });
      if (error) throw new Error(error.message);
      if (!rows || rows.length === 0) return res.json({ ok: true, points: [], trend: "stable", period });
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - period);
      const cutoffStr = cutoff.toISOString().slice(0, 7);
      const byMonth = new Map();
      for (const row of rows) {
        const month = (row.recorded_at || "").slice(0, 7);
        if (!month || month < cutoffStr) continue;
        if (!byMonth.has(month)) byMonth.set(month, []);
        byMonth.get(month).push(Number(row.rate_per_m2_floor));
      }
      const points = [];
      for (const [month, rates] of byMonth.entries()) {
        const avg = rates.reduce((s, v) => s + v, 0) / rates.length;
        points.push({ month, avg: Math.round(avg * 100) / 100, count: rates.length });
      }
      points.sort((a, b) => a.month.localeCompare(b.month));
      let trend = "stable";
      if (points.length >= 3) {
        const third = Math.max(1, Math.floor(points.length / 3));
        const firstAvg = points.slice(0, third).reduce((s, p) => s + p.avg, 0) / third;
        const lastAvg = points.slice(-third).reduce((s, p) => s + p.avg, 0) / third;
        const change = firstAvg > 0 ? ((lastAvg - firstAvg) / firstAvg) * 100 : 0;
        if (change > 5) trend = "rising";
        else if (change < -5) trend = "falling";
      }
      res.json({ ok: true, points, trend, period });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── POST /api/cost-intelligence/pretender/estimate ────────────────────────────
  app.post("/api/cost-intelligence/pretender/estimate", async (req, res) => {
    const db = getServiceSupabase();
    if (!db) return res.status(503).json({ ok: false, error: "DB unavailable" });
    const { floor_area_m2, project_type, storeys, site_slope, has_raked_ceilings, has_suspended_slab, wet_areas, job_id } = req.body || {};
    const floorArea = Number(floor_area_m2) || 0;
    const sr = storeyRange(storeys ? Number(storeys) : null);
    try {
      const { data: allBenchmarks } = await db.from("cost_benchmarks")
        .select("*, trade_categories(id, name, sort_order)")
        .gte("sample_count", 3);
      const benchmarks = allBenchmarks || [];
      const byTrade = new Map();
      for (const b of benchmarks) {
        if (!byTrade.has(b.trade_category_id)) byTrade.set(b.trade_category_id, []);
        byTrade.get(b.trade_category_id).push(b);
      }
      const estimate_ranges = [];
      let totalLow = 0, totalHigh = 0;
      for (const [tradeId, tradeBenchmarks] of byTrade.entries()) {
        const candidates = [
          tradeBenchmarks.find(b => b.project_type === project_type && b.site_slope === site_slope && b.storey_range === sr),
          tradeBenchmarks.find(b => b.project_type === project_type && b.site_slope === site_slope && b.storey_range == null),
          tradeBenchmarks.find(b => b.project_type === project_type && b.site_slope == null && b.storey_range == null),
          tradeBenchmarks.find(b => b.project_type == null && b.site_slope == null && b.storey_range == null),
        ];
        const best = candidates.find(Boolean);
        if (!best || !best.rate_per_m2_floor_avg || !floorArea) continue;
        const low = Math.round(Number(best.rate_per_m2_floor_p25 || best.rate_per_m2_floor_avg) * floorArea);
        const high = Math.round(Number(best.rate_per_m2_floor_p75 || best.rate_per_m2_floor_avg) * floorArea);
        const avg = Math.round(Number(best.rate_per_m2_floor_avg) * floorArea);
        totalLow += low; totalHigh += high;
        const matchIdx = candidates.indexOf(best);
        estimate_ranges.push({
          trade_category_id: tradeId,
          name: best.trade_categories?.name || tradeId,
          sort_order: best.trade_categories?.sort_order || 0,
          low, high, avg,
          rate_per_m2: Number(best.rate_per_m2_floor_avg),
          confidence: Math.min(100, best.sample_count * 10),
          sample_count: best.sample_count,
          match_type: matchIdx === 0 ? "exact" : matchIdx === 3 ? "global" : "partial",
        });
      }
      estimate_ranges.sort((a, b) => a.sort_order - b.sort_order);
      const confidence_pct = estimate_ranges.length
        ? Math.min(95, Math.round((estimate_ranges.reduce((s, r) => s + r.sample_count, 0) / estimate_ranges.length) * 8))
        : 0;
      const { data: saved } = await db.from("pretender_estimates").insert({
        job_id: job_id || null,
        floor_area_m2: floorArea || null,
        project_type: project_type || null,
        storeys: storeys ? Number(storeys) : null,
        site_slope: site_slope || null,
        has_raked_ceilings: has_raked_ceilings ?? null,
        has_suspended_slab: has_suspended_slab ?? null,
        wet_areas: wet_areas ? Number(wet_areas) : null,
        estimate_ranges,
        suggested_total_low: totalLow,
        suggested_total_high: totalHigh,
        confidence_pct,
        created_by: req.user?.id || null,
      }).select("id").maybeSingle();
      res.json({ ok: true, id: saved?.id || null, estimate_ranges, suggested_total_low: totalLow, suggested_total_high: totalHigh, confidence_pct, trade_count: estimate_ranges.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}
