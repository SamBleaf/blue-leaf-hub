/**
 * RFQ trade intelligence API — merge, trade master library, package coverage.
 */
import { getServiceSupabase } from "./supabaseService.mjs";
import {
  getTradeMasterSeed,
  loadTradeMaster,
  seedTradeMasterLibrary,
  tradeLabel
} from "./tradeMasterLibrary.mjs";
import { getBuildxactTemplateCatalog } from "./costIntelligenceEstimate.mjs";
import { buildRfqTradeConfig, registerAdHocTradeConfig } from "./rfqTradeConfig.mjs";
import { processExtraction } from "./rfqScopePipeline.mjs";
import {
  buildRfqTradeIntelligence,
  planToTradeScopes,
  reconcilePackageTradeCoverage
} from "./rfqTradeIntelligence.mjs";

export function registerRfqTradeRoutes(app) {
  const sb = () => getServiceSupabase();

  app.get("/api/trade-master", async (_req, res) => {
    const db = sb();
    try {
      if (db) {
        const catalog = await getBuildxactTemplateCatalog(db);
        return res.json({
          ok: true,
          trades: catalog.categories,
          source: "cost_intelligence",
          category_count: catalog.category_count,
          quote_capable_count: catalog.quote_capable_count
        });
      }
      return res.json({ ok: true, trades: getTradeMasterSeed(), source: "seed" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/trade-master/seed", async (_req, res) => {
    const db = sb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const result = await seedTradeMasterLibrary(db);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/trade-master/:tradeId", async (req, res) => {
    const db = sb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    const allowed = [
      "trade_name",
      "trade_category",
      "subcategory",
      "buildxact_category",
      "buildxact_trade_key",
      "default_rfq_template",
      "default_attachments",
      "default_trade_notes",
      "is_active",
      "quote_required",
      "contractor_tags",
      "priority"
    ];
    const patch = { updated_at: new Date().toISOString() };
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    try {
      const { data, error } = await db
        .from("trade_master_library")
        .update(patch)
        .eq("trade_id", req.params.tradeId)
        .select("*")
        .single();
      if (error) throw error;
      res.json({ ok: true, trade: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/rfq/trade-config", async (_req, res) => {
    const db = sb();
    try {
      const config = await buildRfqTradeConfig(db);
      res.json({ ok: true, ...config });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/rfq/trade-config/register", async (req, res) => {
    const { trade_id, trade_name } = req.body || {};
    const row = registerAdHocTradeConfig(trade_id, trade_name);
    if (!row) return res.status(400).json({ error: "trade_id required" });
    res.json({ ok: true, trade: row });
  });

  app.post("/api/rfq/trade-intelligence/merge", async (req, res) => {
    const db = sb();
    try {
      const { extraction, job_id, buildexact_job_id } = req.body || {};
      const cleaned = processExtraction(extraction || {}, null);
      const intel = await buildRfqTradeIntelligence({
        db: db || null,
        extraction: cleaned,
        jobId: job_id,
        buildexactJobId: buildexact_job_id
      });
      res.json({
        ok: true,
        extraction: cleaned,
        merged_plan: intel.merged_plan,
        estimate_baseline: intel.estimate_baseline,
        estimate_summary: intel.estimate_summary,
        missing_trade_analysis: intel.missing_trade_analysis,
        trade_coverage: intel.trade_coverage
      });
    } catch (e) {
      console.error("[rfq/trade-intelligence/merge]", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/rfq-packages/:packageId/reconcile-coverage", async (req, res) => {
    const db = sb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const result = await reconcilePackageTradeCoverage(db, req.params.packageId);
      if (!result) return res.status(404).json({ error: "Package not found" });
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/rfq-packages/:packageId/generate-missing-scopes", async (req, res) => {
    const db = sb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { data: pkg } = await db
        .from("rfq_packages")
        .select("id, tender_deadline, extraction_data, job_id, estimate_baseline, missing_trade_analysis, rfq_trade_scopes(trade_id)")
        .eq("id", req.params.packageId)
        .single();
      if (!pkg) return res.status(404).json({ error: "Package not found" });

      const existing = new Set((pkg.rfq_trade_scopes || []).map((s) => s.trade_id));
      const intel = await buildRfqTradeIntelligence({
        db,
        extraction: pkg.extraction_data || {},
        jobId: pkg.job_id
      });

      let missing = (pkg.missing_trade_analysis || []).filter((m) => m.actions?.includes("generate_rfq"));
      if (!missing.length) {
        missing = intel.missing_trade_analysis.filter((m) => m.actions?.includes("generate_rfq"));
      }

      const planById = new Map();
      for (const row of intel.merged_plan || []) planById.set(row.trade_id, row);
      for (const row of pkg.estimate_baseline || intel.estimate_baseline || []) {
        if (!planById.has(row.trade_id)) planById.set(row.trade_id, row);
      }

      const created = [];
      for (const m of missing) {
        if (existing.has(m.trade_id)) continue;
        const planRow = planById.get(m.trade_id) || {
          trade_id: m.trade_id,
          trade_label: m.trade_label,
          source: "estimate"
        };
        const scope = planToTradeScopes(planRow);
        const { data: ts, error } = await db
          .from("rfq_trade_scopes")
          .insert({
            package_id: pkg.id,
            trade_id: scope.trade_id,
            trade_label: scope.trade_label || tradeLabel(scope.trade_id),
            scope_bullets: scope.scope_bullets,
            exclusions: scope.exclusions || [],
            questions: scope.questions || [],
            due_date: pkg.tender_deadline || "",
            status: "draft",
            source: scope.source || "estimate",
            ai_enrichment: scope.ai_enrichment || [],
            estimate_line_refs: scope.estimate_line_refs || []
          })
          .select("*")
          .single();
        if (error) throw error;
        created.push(ts);
        existing.add(m.trade_id);
      }

      await reconcilePackageTradeCoverage(db, req.params.packageId);
      res.json({ ok: true, created_count: created.length, scopes: created });
    } catch (e) {
      console.error("[rfq-packages/generate-missing-scopes]", e);
      res.status(500).json({ error: e.message });
    }
  });
}
