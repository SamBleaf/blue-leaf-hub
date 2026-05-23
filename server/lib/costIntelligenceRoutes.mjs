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
}
