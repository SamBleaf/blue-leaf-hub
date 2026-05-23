/**
 * RFQ trade intelligence — merge AI extraction, Buildxact estimate, and trade master library.
 * Estimate baseline is source of truth for quote-capable trades; AI enriches only (never removes).
 */
import {
  loadTradeMaster,
  quoteRequiredTradeIds,
  RFQ_TRADE_ORDER,
  tradeLabel,
  getTradeMasterSeed
} from "./tradeMasterLibrary.mjs";
import {
  loadRfqTradeLibraryFromCostIntelligence,
  loadTradeCategoriesEnriched,
  pullJobEstimateForCostIntelligence,
  quoteCapableTradesFromEstimate
} from "./costIntelligenceEstimate.mjs";

const AI_TRADE_KEYS = new Set(RFQ_TRADE_ORDER);

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[—–-]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bulletsFromNote(note) {
  if (!note || typeof note !== "object") return [];
  const items = [];
  if (note.scope_summary) items.push(String(note.scope_summary).trim());
  for (const x of note.specific_items || []) {
    const t = String(x).trim();
    if (t) items.push(t);
  }
  return items.filter(Boolean);
}

function mergeSources(a, b) {
  const set = new Set([a, b].filter(Boolean));
  if (set.has("ai") && set.has("estimate")) return "ai+estimate";
  if (set.has("ai")) return "ai";
  if (set.has("estimate")) return "estimate";
  if (set.has("library")) return "library";
  return "manual";
}

/** @deprecated Use quoteCapableTradesFromEstimate from costIntelligenceEstimate.mjs */
export function tradesFromBuildxactEstimate(estimate, tradeCategories = []) {
  return quoteCapableTradesFromEstimate(estimate, tradeCategories);
}

/** Trades detected from AI extraction JSON (11 canonical keys). */
export function tradesFromAiExtraction(extraction) {
  const out = [];
  const notes = extraction?.trade_notes || {};
  for (const tradeId of RFQ_TRADE_ORDER) {
    const note = notes[tradeId];
    const bullets = bulletsFromNote(note);
    const hasContent =
      bullets.length > 0 ||
      (note?.scope_summary && String(note.scope_summary).trim()) ||
      (Array.isArray(note?.specific_items) && note.specific_items.length > 0);
    if (!hasContent) continue;
    out.push({
      trade_id: tradeId,
      trade_label: tradeLabel(tradeId),
      source: "ai",
      scope_bullets: bullets,
      exclusions: [],
      questions: note?.missing_info ? [String(note.missing_info)] : [],
      ai_enrichment: bullets.slice(1),
      estimate_categories: [],
      estimate_line_refs: []
    });
  }
  return out;
}

/**
 * Merge AI + estimate + library into unified trade plan. Never drops estimate/library quote trades.
 * @param {{ extraction?: object, estimateCategories?: ReturnType<tradesFromBuildxactEstimate>, library?: object[] }} input
 */
export function mergeTradePlan({ extraction, estimateCategories = [], library = getTradeMasterSeed() }) {
  const libraryById = new Map(library.map((r) => [r.trade_id, r]));
  const merged = new Map();

  for (const est of estimateCategories) {
    const cur = merged.get(est.trade_id);
    const lib = libraryById.get(est.trade_id);
    if (cur) {
      cur.source = mergeSources(cur.source, "estimate");
      cur.estimate_categories = [...new Set([...(cur.estimate_categories || []), ...(est.estimate_categories || [])])];
      cur.estimate_line_refs = [...(cur.estimate_line_refs || []), ...(est.estimate_line_refs || [])];
      if (!cur.scope_bullets?.length) cur.scope_bullets = est.scope_bullets || lib?.default_rfq_template || [];
      cur.buildxact_trade_key = est.buildxact_trade_key || cur.buildxact_trade_key;
      cur.in_library = Boolean(lib);
    } else {
      merged.set(est.trade_id, {
        ...est,
        in_library: Boolean(lib),
        quote_required: true,
        scope_bullets: est.scope_bullets?.length ? est.scope_bullets : lib?.default_rfq_template || ["Scope per Buildxact estimate and tender documents."]
      });
    }
  }

  for (const ai of tradesFromAiExtraction(extraction || {})) {
    const cur = merged.get(ai.trade_id);
    if (cur) {
      cur.source = mergeSources(cur.source, "ai");
      const base = new Set(cur.scope_bullets || []);
      for (const b of ai.scope_bullets || []) base.add(b);
      cur.scope_bullets = [...base];
      cur.ai_enrichment = [...new Set([...(cur.ai_enrichment || []), ...(ai.ai_enrichment || []), ...(ai.scope_bullets || [])])];
      if (ai.questions?.length) cur.questions = [...new Set([...(cur.questions || []), ...ai.questions])];
    } else if (AI_TRADE_KEYS.has(ai.trade_id)) {
      merged.set(ai.trade_id, { ...ai, in_library: libraryById.has(ai.trade_id), quote_required: true });
    }
  }

  return [...merged.values()].sort((a, b) => (a.trade_label || "").localeCompare(b.trade_label || ""));
}

/**
 * @param {{ baseline: object[], scopeTradeIds: string[], rfqTradeIds?: string[] }} args
 */
export function analyzeMissingTrades({ baseline, scopeTradeIds, rfqTradeIds = [] }) {
  const scopeSet = new Set(scopeTradeIds);
  const rfqSet = new Set(rfqTradeIds);
  const missing = [];
  for (const row of baseline) {
    if (!row.quote_required) continue;
    const inScope = scopeSet.has(row.trade_id);
    const hasRfq = rfqSet.has(row.trade_id);
    if (!inScope && !hasRfq) {
      missing.push({
        trade_id: row.trade_id,
        trade_label: row.trade_label || tradeLabel(row.trade_id),
        reason: "Trade exists in Buildxact estimate but no RFQ package scope was generated",
        source: row.source || "estimate",
        estimate_categories: row.estimate_categories || [],
        actions: ["generate_rfq"]
      });
    } else if (inScope && !hasRfq) {
      missing.push({
        trade_id: row.trade_id,
        trade_label: row.trade_label || tradeLabel(row.trade_id),
        reason: "Scope drafted but RFQ not yet sent to subcontractors",
        source: row.source || "estimate",
        estimate_categories: row.estimate_categories || [],
        actions: ["send_rfq"]
      });
    }
  }
  return missing;
}

export function buildTradeCoverageReport({ mergedPlan, scopeTradeIds, rfqTradeIds = [], missingAnalysis = [] }) {
  const quoteTrades = mergedPlan.filter((t) => t.quote_required !== false);
  const denom = quoteTrades.length || 1;
  const covered = quoteTrades.filter((t) => scopeTradeIds.includes(t.trade_id));
  const withRfq = quoteTrades.filter((t) => rfqTradeIds.includes(t.trade_id));
  const pct = Math.min(100, Math.round((covered.length / denom) * 100));

  return {
    percent: pct,
    quote_required_count: quoteTrades.length,
    covered_count: covered.length,
    rfq_sent_count: withRfq.length,
    covered: covered.map((t) => ({
      trade_id: t.trade_id,
      label: t.trade_label,
      source: t.source,
      has_rfq: rfqTradeIds.includes(t.trade_id)
    })),
    missing: missingAnalysis,
    by_source: {
      ai: mergedPlan.filter((t) => String(t.source).includes("ai")).length,
      estimate: mergedPlan.filter((t) => String(t.source).includes("estimate")).length,
      library: mergedPlan.filter((t) => String(t.source) === "library").length
    }
  };
}

/**
 * Full intelligence pass for a tender job.
 */
export async function buildRfqTradeIntelligence({ db, extraction, jobId, buildexactJobId }) {
  const library = db ? await loadRfqTradeLibraryFromCostIntelligence(db) : getTradeMasterSeed();
  let estimateCategories = [];
  let estimateRaw = null;
  let tradeCategories = [];

  if (db) {
    try {
      tradeCategories = await loadTradeCategoriesEnriched(db);
    } catch {
      /* optional */
    }
  }

  if (db && jobId) {
    try {
      const pulled = await pullJobEstimateForCostIntelligence(db, jobId);
      if (pulled.ok) {
        estimateRaw = pulled.estimate;
        estimateCategories = pulled.quote_capable_trades || [];
      }
    } catch (e) {
      console.warn("[rfq-trade-intel] cost intelligence estimate pull failed:", e?.message || e);
    }
  } else if (buildexactJobId) {
    try {
      const { pullBuildexactEstimate } = await import("./buildexactDeepIntegration.mjs");
      const pulled = await pullBuildexactEstimate(buildexactJobId);
      estimateRaw = pulled.estimate;
      estimateCategories = quoteCapableTradesFromEstimate(pulled.estimate, tradeCategories);
    } catch (e) {
      console.warn("[rfq-trade-intel] estimate pull failed:", e?.message || e);
    }
  }

  const merged_plan = mergeTradePlan({ extraction, estimateCategories, library });
  const baseline =
    estimateCategories.length > 0
      ? merged_plan.filter((t) => String(t.source).includes("estimate"))
      : merged_plan.filter((t) => t.quote_required !== false);
  const missing_analysis = analyzeMissingTrades({
    baseline,
    scopeTradeIds: [],
    rfqTradeIds: []
  });

  const trade_coverage = buildTradeCoverageReport({
    mergedPlan: merged_plan,
    scopeTradeIds: [],
    rfqTradeIds: [],
    missingAnalysis: missing_analysis
  });

  return {
    merged_plan,
    estimate_baseline: baseline,
    estimate_categories: estimateCategories,
    estimate_summary: estimateRaw
      ? {
          category_count: estimateRaw.categories?.length || 0,
          quote_category_count: estimateCategories.length
        }
      : null,
    missing_trade_analysis: missing_analysis,
    trade_coverage
  };
}

/** Apply AI enrichment only — adds bullets, never removes trades from plan. */
export function enrichPlanWithAi(plan, extraction) {
  const aiTrades = tradesFromAiExtraction(extraction);
  const byId = new Map(plan.map((t) => [t.trade_id, { ...t }]));
  for (const ai of aiTrades) {
    const cur = byId.get(ai.trade_id);
    if (!cur) continue;
    cur.source = mergeSources(cur.source, "ai");
    const bullets = new Set([...(cur.scope_bullets || [])]);
    for (const b of ai.scope_bullets || []) bullets.add(b);
    cur.scope_bullets = [...bullets];
    cur.ai_enrichment = [...new Set([...(cur.ai_enrichment || []), ...(ai.scope_bullets || [])])];
    byId.set(ai.trade_id, cur);
  }
  return [...byId.values()];
}

export function planToTradeScopes(planEntry) {
  return {
    trade_id: planEntry.trade_id,
    trade_label: planEntry.trade_label || tradeLabel(planEntry.trade_id),
    scope_bullets: planEntry.scope_bullets?.length ? planEntry.scope_bullets : ["Scope per plans and specifications."],
    exclusions: planEntry.exclusions || [],
    questions: planEntry.questions || [],
    source: planEntry.source || "manual",
    ai_enrichment: planEntry.ai_enrichment || [],
    estimate_line_refs: planEntry.estimate_line_refs || [],
    estimate_category: planEntry.trade_category || ""
  };
}

/**
 * Recompute coverage / missing analysis for an existing RFQ package.
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} packageId
 */
export async function reconcilePackageTradeCoverage(db, packageId, { refreshEstimate = false } = {}) {
  const { data: pkg, error } = await db
    .from("rfq_packages")
    .select(`
      id, job_id, extraction_data, estimate_baseline,
      rfq_trade_scopes ( trade_id, status, rfq_recipients ( status ) )
    `)
    .eq("id", packageId)
    .single();
  if (error) throw error;
  if (!pkg) return null;

  const scopes = pkg.rfq_trade_scopes || [];
  const scopeTradeIds = scopes.map((s) => s.trade_id);
  const rfqTradeIds = scopes
    .filter((s) => {
      const sent = s.status === "sent" || (s.rfq_recipients || []).some((r) => r.status === "sent" || r.status === "quoted");
      return sent;
    })
    .map((s) => s.trade_id);

  const hasStoredBaseline = Array.isArray(pkg.estimate_baseline) && pkg.estimate_baseline.length > 0;
  const intel = !refreshEstimate && hasStoredBaseline
    ? {
        merged_plan: pkg.estimate_baseline,
        estimate_baseline: pkg.estimate_baseline
      }
    : await buildRfqTradeIntelligence({
        db,
        extraction: pkg.extraction_data || {},
        jobId: pkg.job_id
      });

  const missing_trade_analysis = analyzeMissingTrades({
    baseline: intel.estimate_baseline,
    scopeTradeIds,
    rfqTradeIds
  });
  const trade_coverage = buildTradeCoverageReport({
    mergedPlan: intel.merged_plan,
    scopeTradeIds,
    rfqTradeIds,
    missingAnalysis: missing_trade_analysis
  });

  const suggested_trades = missing_trade_analysis
    .filter((m) => m.actions?.includes("generate_rfq"))
    .map((m) => ({
      tradeId: m.trade_id,
      label: m.trade_label,
      risk: "high",
      reason: m.reason
    }));

  const coverage_score = trade_coverage.percent ?? 0;

  await db
    .from("rfq_packages")
    .update({
      estimate_baseline: intel.estimate_baseline,
      missing_trade_analysis,
      trade_coverage,
      coverage_score,
      suggested_trades,
      updated_at: new Date().toISOString()
    })
    .eq("id", packageId);

  return { trade_coverage, missing_trade_analysis, suggested_trades, estimate_baseline: intel.estimate_baseline };
}

export function computeCoverageFromLibrary(scopeTradeIds, library) {
  const required = quoteRequiredTradeIds(library);
  const covered = scopeTradeIds.filter((id) => required.includes(id));
  const pct = required.length ? Math.min(100, Math.round((covered.length / required.length) * 100)) : 0;
  const missingIds = required.filter((id) => !scopeTradeIds.includes(id));
  return {
    coverage_score: pct,
    suggested_trades: missingIds.slice(0, 12).map((id) => {
      const row = library.find((r) => r.trade_id === id);
      return {
        tradeId: id,
        label: row?.trade_name || tradeLabel(id),
        risk: "high",
        reason: "In estimate baseline / trade library but not in RFQ package"
      };
    })
  };
}
