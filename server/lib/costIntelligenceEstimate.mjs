/**
 * Cost Intelligence — canonical Buildxact estimate template + per-job estimate parsing.
 * RFQ trade intelligence and Finance budget seeding consume this module (single source of truth).
 */
import { pullBuildexactEstimate } from "./buildexactDeepIntegration.mjs";
import { getBuildexactCategoryMapping } from "./buildexactParser.mjs";
import { buildexactConfigured } from "./buildexactClient.mjs";
import { getTradeMasterSeed, rfqTradeIdFromBuildxactKey, tradeLabel } from "./tradeMasterLibrary.mjs";

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[—–-]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match Buildxact category name → trade_categories row (same logic as Finance CC).
 */
export function matchTradeCategoryRow(buildxactCategoryName, tradeCategories) {
  const mapping = getBuildexactCategoryMapping(buildxactCategoryName);
  if (mapping?.name) {
    const exact = tradeCategories.find((c) => norm(c.name) === norm(mapping.name));
    if (exact) return exact;
  }
  const directNorm = norm(buildxactCategoryName);
  const direct = tradeCategories.find((c) => norm(c.name) === directNorm);
  if (direct) return direct;

  const tokens = directNorm.split(" ").filter((w) => w.length > 2);
  let best = null;
  let bestScore = 0;
  for (const cat of tradeCategories) {
    const cn = norm(cat.name);
    const hits = tokens.filter((t) => cn.includes(t)).length;
    const score = tokens.length ? hits / tokens.length : 0;
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

/** Enrich trade_categories rows with Buildxact parser metadata + RFQ trade id. */
export function enrichTradeCategoryRow(cat) {
  const mapping = getBuildexactCategoryMapping(cat.name);
  const tradeKey = mapping?.tradeKey || cat.buildxact_trade_key || "";
  const rfqTradeId = rfqTradeIdFromBuildxactKey(tradeKey);
  return {
    ...cat,
    buildxact_category_name: mapping?.name || cat.name,
    phase: mapping?.phase || null,
    buildxact_trade_key: tradeKey,
    has_quote_line: mapping?.hasQuoteLine ?? cat.category_type === "trade",
    rfq_trade_id: rfqTradeId,
    rfq_trade_label: rfqTradeId ? tradeLabel(rfqTradeId) : null
  };
}

/** @param {import('@supabase/supabase-js').SupabaseClient} db */
export async function loadTradeCategoriesEnriched(db) {
  if (!db) {
    return getTradeMasterSeed().map((r) => ({
      id: null,
      name: r.buildxact_category || r.trade_name,
      sort_order: r.priority || 50,
      category_type: r.quote_required ? "trade" : "overhead",
      buildxact_category_name: r.buildxact_category,
      phase: null,
      buildxact_trade_key: r.buildxact_trade_key,
      has_quote_line: r.quote_required !== false,
      rfq_trade_id: r.trade_id,
      rfq_trade_label: r.trade_name
    }));
  }
  const { data, error } = await db
    .from("trade_categories")
    .select("id, name, buildxact_code, sort_order, category_type, is_active")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data || []).map(enrichTradeCategoryRow);
}

/** Master template catalog (37 categories) for Cost Intelligence UI + RFQ baseline. */
export async function getBuildxactTemplateCatalog(db) {
  const categories = await loadTradeCategoriesEnriched(db);
  return {
    source: db ? "trade_categories" : "seed",
    category_count: categories.length,
    quote_capable_count: categories.filter((c) => c.has_quote_line && c.rfq_trade_id).length,
    categories
  };
}

/** @param {import('@supabase/supabase-js').SupabaseClient} db */
export async function resolveBuildxactJobId(db, jobId) {
  const { data: job } = await db.from("jobs").select("id, buildexact_job_id").eq("id", jobId).maybeSingle();
  let buildexactJobId = job?.buildexact_job_id || null;
  if (!buildexactJobId) {
    const { data: proj } = await db
      .from("projects")
      .select("buildexact_job_id")
      .eq("job_id", jobId)
      .maybeSingle();
    buildexactJobId = proj?.buildexact_job_id || null;
  }
  return buildexactJobId;
}

/**
 * Parse normalised estimate into Cost Intelligence category rows (all categories with amounts).
 */
export function parseEstimateIntoCostCategories(estimate, tradeCategories = []) {
  const rows = [];
  const unmatched = [];

  for (const cat of estimate?.categories || []) {
    const amount = Number(cat.subtotal_ex_gst || cat.subtotal || 0);
    const tradeCat = tradeCategories.length ? matchTradeCategoryRow(cat.name, tradeCategories) : null;
    const mapping = getBuildexactCategoryMapping(cat.name);
    const lineItems = (cat.active_items || [])
      .filter((it) => {
        const d = String(it?.description || "");
        return d && !/\bSCHED\b/i.test(d) && !/COST\s+METRIC/i.test(d);
      })
      .map((it) => ({
        description: it.description,
        total: Number(it.total ?? it.amount) || 0,
        unit_cost: Number(it.unit_cost) || 0,
        uom: it.uom || "",
        units: Number(it.units) || 0
      }));

    const row = {
      buildxact_category_name: cat.name,
      amount_ex_gst: amount,
      line_item_count: lineItems.length,
      line_items: lineItems,
      trade_category_id: tradeCat?.id || null,
      trade_category_name: tradeCat?.name || mapping?.name || null,
      phase: mapping?.phase || null,
      buildxact_trade_key: mapping?.tradeKey || null,
      has_quote_line: mapping?.hasQuoteLine ?? false,
      rfq_trade_id: rfqTradeIdFromBuildxactKey(mapping?.tradeKey),
      rfq_trade_label: mapping?.tradeKey ? tradeLabel(rfqTradeIdFromBuildxactKey(mapping.tradeKey)) : null
    };

    if (tradeCategories.length && amount > 0 && !tradeCat) {
      unmatched.push({ buildxact_name: cat.name, amount });
    }
    rows.push(row);
  }

  return {
    categories: rows,
    unmatched,
    total_ex_gst: rows.reduce((s, r) => s + (r.amount_ex_gst || 0), 0),
    quote_capable_total: rows
      .filter((r) => r.has_quote_line && r.rfq_trade_id)
      .reduce((s, r) => s + (r.amount_ex_gst || 0), 0)
  };
}

/**
 * Quote-capable trades aggregated for RFQ engine (grouped by rfq_trade_id).
 * @param {{ categories?: unknown[] }} estimate
 * @param {ReturnType<enrichTradeCategoryRow>[]} [tradeCategories]
 */
export function quoteCapableTradesFromEstimate(estimate, tradeCategories = []) {
  const parsed = parseEstimateIntoCostCategories(estimate, tradeCategories);
  const byRfq = new Map();

  for (const row of parsed.categories) {
    if (!row.has_quote_line || !row.rfq_trade_id) continue;
    if (!row.amount_ex_gst && !row.line_items?.length) continue;

    const tradeId = row.rfq_trade_id;
    const existing = byRfq.get(tradeId);
    const lineRefs = (row.line_items || []).map((it) => ({
      description: it.description,
      total: it.total,
      category: row.buildxact_category_name
    }));

    if (existing) {
      existing.estimate_categories.push(row.buildxact_category_name);
      existing.estimate_line_refs.push(...lineRefs);
      existing.estimate_total += row.amount_ex_gst || 0;
      if (row.trade_category_id) existing.trade_category_ids.push(row.trade_category_id);
    } else {
      byRfq.set(tradeId, {
        trade_id: tradeId,
        trade_label: row.rfq_trade_label || tradeLabel(tradeId),
        trade_category_ids: row.trade_category_id ? [row.trade_category_id] : [],
        source: "estimate",
        estimate_categories: [row.buildxact_category_name],
        buildxact_trade_key: row.buildxact_trade_key,
        estimate_line_refs: lineRefs,
        estimate_total: row.amount_ex_gst || 0,
        scope_bullets: [`Budget line from Buildxact: ${row.buildxact_category_name}`],
        ai_enrichment: [],
        quote_required: true
      });
    }
  }

  return [...byRfq.values()];
}

/** Pull + parse estimate for a hub job. */
export async function pullJobEstimateForCostIntelligence(db, jobId) {
  if (!buildexactConfigured()) {
    return { ok: false, error: "Buildxact API not configured", estimate: null };
  }
  const buildexactJobId = await resolveBuildxactJobId(db, jobId);
  if (!buildexactJobId) {
    return { ok: false, error: "No Buildxact job linked", estimate: null };
  }
  const tradeCategories = await loadTradeCategoriesEnriched(db);
  const { estimate, costMetrics } = await pullBuildexactEstimate(buildexactJobId);
  const parsed = parseEstimateIntoCostCategories(estimate, tradeCategories);
  return {
    ok: true,
    buildexact_job_id: buildexactJobId,
    estimate,
    cost_metrics: costMetrics || null,
    parsed,
    quote_capable_trades: quoteCapableTradesFromEstimate(estimate, tradeCategories)
  };
}

/**
 * Sync Buildxact estimate → job_budgets + normalized_costs (budget_amount).
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 */
export async function syncEstimateToCostIntelligence(db, jobId) {
  const pulled = await pullJobEstimateForCostIntelligence(db, jobId);
  if (!pulled.ok) return pulled;

  const { data: existingBudgets } = await db.from("job_budgets").select("trade_category_id, original_budget").eq("job_id", jobId);
  const existingMap = new Map((existingBudgets || []).map((b) => [b.trade_category_id, b]));
  const now = new Date().toISOString();
  const budgetUpserts = [];

  for (const row of pulled.parsed.categories) {
    if (!row.trade_category_id || !(row.amount_ex_gst > 0)) continue;
    const existing = existingMap.get(row.trade_category_id);
    budgetUpserts.push({
      job_id: jobId,
      trade_category_id: row.trade_category_id,
      original_budget: existing?.original_budget ?? row.amount_ex_gst,
      budget_amount: row.amount_ex_gst,
      seeded_from: "buildxact",
      seeded_at: now,
      updated_at: now
    });
  }

  if (budgetUpserts.length) {
    const { error } = await db.from("job_budgets").upsert(budgetUpserts, { onConflict: "job_id,trade_category_id" });
    if (error) throw error;
  }

  const normUpserts = [];
  for (const row of pulled.parsed.categories) {
    if (!row.trade_category_id) continue;
    normUpserts.push({
      job_id: jobId,
      trade_category_id: row.trade_category_id,
      budget_amount: row.amount_ex_gst > 0 ? row.amount_ex_gst : null,
      data_quality: row.amount_ex_gst > 0 ? "complete" : "partial",
      updated_at: now
    });
  }
  if (normUpserts.length) {
    const { error: normErr } = await db.from("normalized_costs").upsert(normUpserts, { onConflict: "job_id,trade_category_id" });
    if (normErr) console.warn("[cost-intel] normalized_costs upsert", normErr.message);
  }

  if (pulled.cost_metrics && Object.keys(pulled.cost_metrics).length) {
    const { data: existingPm } = await db.from("project_metrics").select("id").eq("job_id", jobId).maybeSingle();
    const pmPatch = {
      job_id: jobId,
      floor_area_m2: pulled.cost_metrics.floor_area ?? null,
      extraction_source: "buildxact",
      extracted_at: now,
      updated_at: now
    };
    if (existingPm?.id) {
      await db.from("project_metrics").update(pmPatch).eq("id", existingPm.id);
    } else {
      await db.from("project_metrics").insert(pmPatch);
    }
  }

  return {
    ok: true,
    budgets_seeded: budgetUpserts.length,
    normalized_rows: normUpserts.length,
    unmatched: pulled.parsed.unmatched,
    quote_capable_count: pulled.quote_capable_trades.length,
    parsed: pulled.parsed
  };
}

/**
 * Seed job_budgets + normalized_costs from an already-parsed estimate
 * (e.g. from XLSX/PDF parse — no Buildexact API call needed).
 *
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.db
 * @param {string} opts.jobId
 * @param {Array} opts.categories  — parsed.categories from parseXLSX() / PDF extraction
 *                                   Each item needs: { name, subtotal_ex_gst, active_items? }
 * @returns {{ ok: boolean, budgets_seeded: number, normalized_rows: number, unmatched: string[] }}
 */
export async function seedJobBudgetsFromEstimateData({ db, jobId, categories }) {
  if (!db || !jobId || !Array.isArray(categories) || !categories.length) {
    return { ok: false, reason: "missing_params" };
  }

  const tradeCategories = await loadTradeCategoriesEnriched(db);
  const fakeEstimate = { categories };
  const parsed = parseEstimateIntoCostCategories(fakeEstimate, tradeCategories);

  const { data: existingBudgets } = await db
    .from("job_budgets")
    .select("trade_category_id, original_budget")
    .eq("job_id", jobId);
  const existingMap = new Map((existingBudgets || []).map((b) => [b.trade_category_id, b]));
  const now = new Date().toISOString();

  const budgetUpserts = [];
  for (const row of parsed.categories) {
    if (!row.trade_category_id || !(row.amount_ex_gst > 0)) continue;
    const existing = existingMap.get(row.trade_category_id);
    budgetUpserts.push({
      job_id: jobId,
      trade_category_id: row.trade_category_id,
      // Preserve original_budget if already set (don't overwrite a locked baseline)
      original_budget: existing?.original_budget ?? row.amount_ex_gst,
      budget_amount: row.amount_ex_gst,
      seeded_from: "fee_proposal_parse",
      seeded_at: now,
      updated_at: now
    });
  }

  if (budgetUpserts.length) {
    const { error } = await db
      .from("job_budgets")
      .upsert(budgetUpserts, { onConflict: "job_id,trade_category_id" });
    if (error) throw error;
  }

  const normUpserts = [];
  for (const row of parsed.categories) {
    if (!row.trade_category_id) continue;
    normUpserts.push({
      job_id: jobId,
      trade_category_id: row.trade_category_id,
      budget_amount: row.amount_ex_gst > 0 ? row.amount_ex_gst : null,
      data_quality: row.amount_ex_gst > 0 ? "complete" : "partial",
      updated_at: now
    });
  }
  if (normUpserts.length) {
    const { error: normErr } = await db
      .from("normalized_costs")
      .upsert(normUpserts, { onConflict: "job_id,trade_category_id" });
    if (normErr) console.warn("[cost-intel] normalized_costs upsert from fee proposal:", normErr.message);
  }

  return {
    ok: true,
    budgets_seeded: budgetUpserts.length,
    normalized_rows: normUpserts.length,
    unmatched: parsed.unmatched
  };
}

/** RFQ library rows derived from cost intelligence trade_categories. */
export async function loadRfqTradeLibraryFromCostIntelligence(db) {
  const cats = await loadTradeCategoriesEnriched(db);
  const byRfq = new Map();
  for (const cat of cats) {
    if (!cat.rfq_trade_id) continue;
    const existing = byRfq.get(cat.rfq_trade_id);
    if (existing) {
      if (cat.name && !existing.buildxact_categories.includes(cat.name)) {
        existing.buildxact_categories.push(cat.name);
      }
      continue;
    }
    byRfq.set(cat.rfq_trade_id, {
      trade_id: cat.rfq_trade_id,
      trade_name: cat.rfq_trade_label || tradeLabel(cat.rfq_trade_id),
      trade_category: cat.category_type || "trade",
      buildxact_category: cat.name,
      buildxact_categories: [cat.name],
      buildxact_trade_key: cat.buildxact_trade_key || "",
      quote_required: cat.has_quote_line !== false,
      priority: cat.sort_order || 50,
      is_active: true,
      default_rfq_template: [],
      default_attachments: ["Plans", "Specifications"]
    });
  }
  const rows = [...byRfq.values()];
  return rows.length ? rows : getTradeMasterSeed();
}
