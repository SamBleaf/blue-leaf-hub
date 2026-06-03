/**
 * Financial Command Centre routes — budget seeding, progress claims, variations, WIPAA
 * Registered separately from financeRoutes.mjs to keep file sizes manageable.
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);

import { getServiceSupabase } from "./supabaseService.mjs";
import { upsertNormalizedCost } from "./normalizedCosts.mjs";
import { getJobInsights } from "./projectInsights.mjs";
import { pullBuildexactEstimate } from "./buildexactDeepIntegration.mjs";
import { getBuildexactCategoryMapping } from "./buildexactParser.mjs";
import { buildexactConfigured } from "./buildexactClient.mjs";
import { sendPlainMail } from "./notifyMail.mjs";
import { buildProgressClaimTokens, STAGE_LABELS as STAGE_LABELS_FROM_TOKENS } from "./docTokens.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import { translateDbError } from "./apiResponse.mjs";
import { getCanonicalContractValue } from "./factsService.mjs";

// ── Helpers ────────────────────────────────────────────────────────────────────

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[—–-]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Map workforce timesheet task_category → trade_categories.name so in-house labour
// lands in the per-trade budget-vs-actual (H8). 'other' has no clean trade home and
// stays in the labour total only. Names must match migration 031 trade_categories.
const TASK_CATEGORY_TO_TRADE_NAME = {
  first_fix_framing: "Carpentry",
  cladding: "External Cladding",
  second_fix: "Carpentry",
  outdoor_works: "Landscaping",
  formwork_slab_prep: "Concrete & Footings",
  site_labouring: "Site Establishment",
  site_cleanup: "Site Cleaner",
  supervision: "Preliminaries",
  // other: intentionally unmapped
};

/**
 * Match a Buildxact category name to a trade_category row.
 * Strategy:
 *  1. getBuildexactCategoryMapping() returns the canonical name → exact DB lookup
 *  2. Direct normalised-name match as fallback
 *  3. Word-overlap score as last resort
 */
function matchTradeCategory(buildexactCategoryName, tradeCategories) {
  const mapping = getBuildexactCategoryMapping(buildexactCategoryName);
  if (mapping?.name) {
    const exact = tradeCategories.find(c => norm(c.name) === norm(mapping.name));
    if (exact) return exact;
  }
  // Fallback: direct normalised match on the raw Buildxact category name
  const directNorm = norm(buildexactCategoryName);
  const direct = tradeCategories.find(c => norm(c.name) === directNorm);
  if (direct) return direct;

  // Word-overlap fallback
  const tokens = directNorm.split(" ").filter(w => w.length > 2);
  let best = null, bestScore = 0;
  for (const cat of tradeCategories) {
    const cn = norm(cat.name);
    const hits = tokens.filter(t => cn.includes(t)).length;
    const score = tokens.length ? hits / tokens.length : 0;
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return bestScore >= 0.5 ? best : null;
}

/**
 * Parse a CSV string of "category,amount" rows into an array.
 * Accepts both category names and exact category IDs.
 */
function parseBudgetCsv(csvText, tradeCategories) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#"));
  const rows = [];
  for (const line of lines) {
    const parts = line.split(",").map(p => p.trim());
    if (parts.length < 2) continue;
    const nameOrId = parts[0].replace(/^"|"$/g, "");
    const amount = parseFloat(parts[1].replace(/[$,]/g, ""));
    if (!nameOrId || !Number.isFinite(amount) || amount < 0) continue;
    // Try exact ID match first
    let cat = tradeCategories.find(c => c.id === nameOrId);
    if (!cat) cat = matchTradeCategory(nameOrId, tradeCategories);
    if (cat) rows.push({ trade_category_id: cat.id, amount });
    else rows.push({ unmatched: nameOrId, amount });
  }
  return rows;
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerFinanceCCRoutes(app) {

  // ── Canonical contract value (Phase 5) ───────────────────────────────────────
  // contract_value is a GENERATED fact = original_contract_value + Σ(signed variations
  // ex-GST). Single source of truth = factsService.getCanonicalContractValue (shared by the
  // finance KPIs, WIPAA-save, and the CRM referral rollup); the reconcile tool's Hub side
  // uses the identical formula (buildexactReconcile.mjs). This thin wrapper preserves the
  // call signature used across the KPI handlers and passes the already-fetched job row +
  // signed-variation total as the defensive fallback (money must never silently zero out).
  async function contractValueOf(jobId, jobRow, signedVariationsTotal) {
    const inline = Number(jobRow?.original_contract_value ?? jobRow?.contract_value ?? 0)
      + Number(signedVariationsTotal || 0);
    return getCanonicalContractValue(jobId, { fallback: inline });
  }

  // ── Budget: list ──────────────────────────────────────────────────────────
  // Returns all 37 trade categories with their job_budget row (or nulls if not seeded)
  app.get("/api/finance/jobs/:jobId/budget", requireAuth, async (req, res) => {
    const { jobId } = req.params;
    const sb = getServiceSupabase();
    const [catsRes, budgetsRes] = await Promise.all([
      sb.from("trade_categories").select("id, name, sort_order, category_type").eq("is_active", true).order("sort_order"),
      sb.from("job_budgets").select("*").eq("job_id", jobId)
    ]);
    if (catsRes.error) return res.status(500).json({ ok: false, error: translateDbError(catsRes.error) });
    const budgetMap = new Map((budgetsRes.data || []).map(b => [b.trade_category_id, b]));
    const categories = (catsRes.data || []).map(cat => ({
      ...cat,
      budget: budgetMap.get(cat.id) || null
    }));
    const seeded = (budgetsRes.data || []).length > 0;
    res.json({ ok: true, categories, seeded });
  });

  // ── Budget: seed from Buildxact (via Cost Intelligence estimate sync) ───
  app.post("/api/finance/jobs/:jobId/budget/seed", requireAuth, async (req, res) => {
    const { jobId } = req.params;
    const sb = getServiceSupabase();
    try {
      const { syncEstimateToCostIntelligence } = await import("./costIntelligenceEstimate.mjs");
      const result = await syncEstimateToCostIntelligence(sb, jobId);
      if (!result.ok) {
        const status = result.error?.includes("not configured") || result.error?.includes("No Buildxact") ? 400 : 502;
        return res.status(status).json({ ok: false, error: result.error });
      }
      const { data: budgets } = await sb.from("job_budgets").select("*").eq("job_id", jobId);
      res.json({
        ok: true,
        seeded: result.budgets_seeded,
        unmatched: result.unmatched?.length || 0,
        unmatchedCategories: result.unmatched || [],
        normalized_rows: result.normalized_rows,
        quote_capable_count: result.quote_capable_count,
        budgets: budgets || []
      });
    } catch (e) {
      console.error("[budget/buildexact-import]", e?.message);
      return res.status(502).json({ ok: false, error: translateDbError(e) });
    }
  });

  // ── Budget: CSV import ────────────────────────────────────────────────────
  // Body: { csv: "<base64 or raw text>" }
  // Format: one line per trade — "Category Name,amount" or "trade_category_id,amount"
  app.post("/api/finance/jobs/:jobId/budget/import", requireAuth, async (req, res) => {
    const { jobId } = req.params;
    const { csv } = req.body || {};
    if (!csv) return res.status(400).json({ ok: false, error: "csv field required" });

    const sb = getServiceSupabase();

    const { encoding } = req.body || {};
    let csvText = csv;
    if (encoding === "base64" || (encoding !== "text" && !/[\r\n,;]/.test(csv.slice(0, 100)))) {
      try { csvText = Buffer.from(csv, "base64").toString("utf-8"); } catch { /* treat as raw text */ }
    }

    const { data: tradeCategories } = await sb.from("trade_categories")
      .select("id, name").eq("is_active", true).order("sort_order");
    const parsed = parseBudgetCsv(csvText, tradeCategories || []);
    const valid = parsed.filter(r => r.trade_category_id);
    const unmatched = parsed.filter(r => r.unmatched);

    if (!valid.length) {
      return res.status(422).json({ ok: false, error: "No rows could be matched to trade categories.", unmatched });
    }

    // Check existing for original_budget preservation
    const { data: existing } = await sb.from("job_budgets")
      .select("trade_category_id, original_budget").eq("job_id", jobId);
    const existingMap = new Map((existing || []).map(b => [b.trade_category_id, b]));
    const isFirstSeed = !existing?.length;
    const now = new Date().toISOString();

    const upserts = valid.map(({ trade_category_id, amount }) => {
      const ex = existingMap.get(trade_category_id);
      return {
        job_id: jobId,
        trade_category_id,
        original_budget: ex?.original_budget ?? amount,
        budget_amount: amount,
        seeded_from: "csv",
        seeded_at: now,
        updated_at: now
      };
    });

    const { error: upsertErr } = await sb.from("job_budgets")
      .upsert(upserts, { onConflict: "job_id,trade_category_id" });
    if (upsertErr) return res.status(500).json({ ok: false, error: translateDbError(upsertErr) });

    const { data: budgets } = await sb.from("job_budgets").select("*").eq("job_id", jobId);
    res.json({ ok: true, imported: valid.length, unmatched: unmatched.length, unmatchedRows: unmatched, budgets: budgets || [] });
  });

  // ── Budget: edit a single line ────────────────────────────────────────────
  app.put("/api/finance/jobs/:jobId/budget/:tradeCategoryId", requireAuth, async (req, res) => {
    const { jobId, tradeCategoryId } = req.params;
    const { budget_amount, forecast_amount, forecast_notes, reason } = req.body || {};

    if (budget_amount === undefined && forecast_amount === undefined) {
      return res.status(400).json({ ok: false, error: "budget_amount or forecast_amount required" });
    }
    if (!reason?.trim()) {
      return res.status(400).json({ ok: false, error: "reason is required for budget edits" });
    }

    const sb = getServiceSupabase();
    const { data: existing } = await sb.from("job_budgets")
      .select("*").eq("job_id", jobId).eq("trade_category_id", tradeCategoryId).maybeSingle();

    if (!existing) {
      // Create if not exists (manual entry)
      const { data: inserted, error } = await sb.from("job_budgets").insert({
        job_id: jobId,
        trade_category_id: tradeCategoryId,
        budget_amount: budget_amount ?? 0,
        forecast_amount: forecast_amount ?? null,
        forecast_notes: forecast_notes ?? null,
        original_budget: budget_amount ?? 0,
        seeded_from: "manual",
        seeded_at: new Date().toISOString()
      }).select().single();
      if (error) return res.status(500).json({ ok: false, error: translateDbError(error) });
      return res.json({ ok: true, budget: inserted });
    }

    // Build update + history entries
    const updates = { updated_at: new Date().toISOString() };
    const historyRows = [];

    if (budget_amount !== undefined && Number(budget_amount) !== Number(existing.budget_amount)) {
      updates.budget_amount = Number(budget_amount);
      historyRows.push({
        job_budget_id: existing.id,
        field_changed: "budget_amount",
        previous_value: existing.budget_amount,
        new_value: Number(budget_amount),
        reason: reason.trim()
      });
    }
    if (forecast_amount !== undefined) {
      updates.forecast_amount = forecast_amount === null ? null : Number(forecast_amount);
      historyRows.push({
        job_budget_id: existing.id,
        field_changed: "forecast_amount",
        previous_value: existing.forecast_amount,
        new_value: forecast_amount === null ? null : Number(forecast_amount),
        reason: reason.trim()
      });
    }
    if (forecast_notes !== undefined) updates.forecast_notes = forecast_notes;

    const { data: updated, error: upErr } = await sb.from("job_budgets")
      .update(updates).eq("id", existing.id).select().single();
    if (upErr) return res.status(500).json({ ok: false, error: translateDbError(upErr) });

    if (historyRows.length) {
      await sb.from("job_budget_history").insert(historyRows);
    }

    res.json({ ok: true, budget: updated });
  });

  // ── Budget: history for a line ────────────────────────────────────────────
  app.get("/api/finance/jobs/:jobId/budget/:tradeCategoryId/history", requireAuth, async (req, res) => {
    const { jobId, tradeCategoryId } = req.params;
    const sb = getServiceSupabase();
    const { data: budget } = await sb.from("job_budgets")
      .select("id").eq("job_id", jobId).eq("trade_category_id", tradeCategoryId).maybeSingle();
    if (!budget) return res.json({ ok: true, history: [] });
    const { data, error } = await sb.from("job_budget_history")
      .select("*").eq("job_budget_id", budget.id).order("changed_at", { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: translateDbError(error) });
    res.json({ ok: true, history: data || [] });
  });

  // ── Job financials summary (for Command Centre KPI bar) ───────────────────
  app.get("/api/finance/jobs/:jobId/summary", requireAuth, async (req, res) => {
    const { jobId } = req.params;
    const sb = getServiceSupabase();

    const [jobRes, docsRes, variationsRes, claimsRes, paymentsRes] = await Promise.all([
      sb.from("jobs").select("id, address, contract_value, original_contract_value, estimated_total_cost, forecast_total_cost, target_margin_pct, floor_margin_pct, financial_locked").eq("id", jobId).single(),
      sb.from("financial_documents").select("amount_ex_gst, status, trade_category_id").eq("job_id", jobId).in("status", ["approved", "filed", "xero_synced"]),
      sb.from("job_variations").select("amount_ex_gst, status").eq("job_id", jobId),
      sb.from("progress_claims").select("amount_ex_gst, status").eq("job_id", jobId).neq("status", "void"),
      sb.from("progress_claim_payments").select("payment_amount, progress_claim_id")
    ]);

    if (jobRes.error) return res.status(404).json({ ok: false, error: "Job not found" });
    const job = jobRes.data;
    const docs = docsRes.data || [];
    const variations = variationsRes.data || [];
    const claims = claimsRes.data || [];

    // KPI calculations (enforced definitions from plan)
    const signedVariationsTotal = variations
      .filter(v => v.status === "signed")
      .reduce((s, v) => s + Number(v.amount_ex_gst || 0), 0);

    // contract_value via the canonical Generated fact (Phase 5). Identical formula.
    const contractValue = await contractValueOf(jobId, job, signedVariationsTotal);

    const claimsIssued = claims
      .filter(c => !["draft", "void"].includes(c.status))
      .reduce((s, c) => s + Number(c.amount_ex_gst || 0), 0);

    // Sum payments for claims belonging to this job
    const claimIds = new Set(claims.map(c => c.id));
    const allPayments = paymentsRes.data || [];
    const claimsPaid = allPayments
      .filter(p => claimIds.has(p.progress_claim_id))
      .reduce((s, p) => s + Number(p.payment_amount || 0), 0);

    const actualCosts = docs.reduce((s, d) => s + Number(d.amount_ex_gst || 0), 0);

    const workingMarginPct = contractValue > 0
      ? ((contractValue - actualCosts) / contractValue) * 100
      : null;

    const forecastTotalCost = Number(job.forecast_total_cost || job.estimated_total_cost || 0);
    const forecastMarginPct = contractValue > 0 && forecastTotalCost > 0
      ? ((contractValue - forecastTotalCost) / contractValue) * 100
      : null;

    // Flag data mismatch — contract value and forecast cost are from different sources
    // and can diverge wildly if one isn't synced (e.g. Buildexact estimate vs signed contract)
    const forecastDataQualityWarning = forecastMarginPct != null && Math.abs(forecastMarginPct) > 200;

    const targetMargin = Number(job.target_margin_pct || 40);

    // Underclaim detection: needs schedule % complete (Phase H). Return raw numbers for now.
    const unsignedVariationsTotal = variations
      .filter(v => ["draft", "sent_to_client"].includes(v.status))
      .reduce((s, v) => s + Number(v.amount_ex_gst || 0), 0);

    res.json({
      ok: true,
      job: {
        id: job.id,
        address: job.address,
        financial_locked: job.financial_locked,
        target_margin_pct: targetMargin,
        floor_margin_pct: Number(job.floor_margin_pct || 33)
      },
      kpis: {
        contract_value: Math.round(contractValue * 100) / 100,
        original_contract_value: Number(job.original_contract_value || job.contract_value || 0),
        signed_variations: Math.round(signedVariationsTotal * 100) / 100,
        unsigned_variations: Math.round(unsignedVariationsTotal * 100) / 100,
        claims_issued: Math.round(claimsIssued * 100) / 100,
        claims_paid: Math.round(claimsPaid * 100) / 100,
        actual_costs: Math.round(actualCosts * 100) / 100,
        forecast_total_cost: forecastTotalCost || null,
        working_margin_pct: workingMarginPct != null ? Math.round(workingMarginPct * 10) / 10 : null,
        forecast_margin_pct: forecastMarginPct != null ? Math.round(forecastMarginPct * 10) / 10 : null,
        forecast_data_quality_warning: forecastDataQualityWarning
      }
    });
  });

  // ── Command Centre aggregate (single round-trip for full page load) ────────
  // Combines: summary KPIs + budget/actuals + wipaa + requires-action + claims/variations summary
  app.get("/api/finance/jobs/:jobId/command-centre", requireAuth, async (req, res) => {
    const { jobId } = req.params;
    const sb = getServiceSupabase();

    const [
      jobRes, docsRes, variationsRes, claimsRes,
      budgetsRes, wipaaReviewRes, pendingInvoicesRes, recentInsights
    ] = await Promise.all([
      sb.from("jobs")
        .select("id, address, contract_value, original_contract_value, estimated_total_cost, forecast_total_cost, target_margin_pct, floor_margin_pct, financial_locked, last_wipaa_review_date")
        .eq("id", jobId).single(),
      // Approved docs for KPI actual_costs + budget actuals
      sb.from("financial_documents")
        .select("amount_ex_gst, status, trade_category_id")
        .eq("job_id", jobId).in("status", ["approved", "filed", "xero_synced"]),
      // All variations
      sb.from("job_variations")
        .select("id, amount_ex_gst, status").eq("job_id", jobId),
      // Non-void claims with nested payments (avoids full-table scan on payments)
      sb.from("progress_claims")
        .select("id, claim_number, amount_ex_gst, status, due_date, issued_date, progress_claim_payments(payment_amount)")
        .eq("job_id", jobId).neq("status", "void").order("claim_number", { ascending: true }),
      // Budget rows (for budget_vs_actual)
      sb.from("job_budgets")
        .select("trade_category_id, budget_amount, original_budget, forecast_amount, forecast_notes, seeded_from, trade_categories(name, sort_order, category_type)")
        .eq("job_id", jobId),
      // Last WIPAA review (for days_since)
      sb.from("wipaa_reviews")
        .select("review_date").eq("job_id", jobId).order("review_date", { ascending: false }).limit(1).maybeSingle(),
      // Pending approval invoices
      sb.from("financial_documents")
        .select("id, supplier_name, amount_ex_gst, ai_job_match_confidence, ai_trade_confidence, trade_category_id, status, created_at")
        .eq("job_id", jobId).eq("status", "pending_approval")
        .order("created_at", { ascending: true }).limit(5),
      // Recent insights (non-fatal — defaults to [] if migration not yet applied)
      getJobInsights(jobId, sb, { limit: 5 }).catch(() => []),
    ]);

    if (jobRes.error) return res.status(404).json({ ok: false, error: "Job not found" });
    if (wipaaReviewRes.error) console.warn("[command-centre] wipaa_reviews:", wipaaReviewRes.error.message);

    const job = jobRes.data;
    const docs = docsRes.data || [];
    const variations = variationsRes.data || [];
    const claims = claimsRes.data || [];
    const budgets = budgetsRes.data || [];

    // ── Labour cost (from approved timesheets) ────────────────────────────────
    // Labour is keyed on timesheets.job_id ONLY (direct builder-job attribution).
    // Phase 7 (carpentry de-island) flag: if this rollup is ever made
    // carpentry-aware (i.e. also follows carpentry_jobs.job_id == jobId to fold in
    // carpentry labour), it MUST run the carpentry timesheet set through
    // excludeDoubleCounted() from server/lib/labourAttribution.mjs first — a
    // timesheet carrying BOTH job_id and carpentry_job_id is already counted here
    // and the builder job is its canonical home. Not done now: additive only, no
    // number change this phase (see labourAttribution.mjs CALL SITES).
    let labourData = { total_cost: 0, by_category: [] };
    // Labour grouped by trade_category_id so it can fold into budget-vs-actual (H8).
    const labourByTrade = new Map();
    try {
      const { data: labourEntries } = await sb
        .from("timesheet_entries")
        .select("task_category, hours, cost_amount, timesheets!inner(job_id, status)")
        .eq("timesheets.job_id", jobId)
        .eq("timesheets.status", "approved");

      if (labourEntries?.length) {
        const grouped = {};
        for (const e of labourEntries) {
          const cat = e.task_category;
          if (!grouped[cat]) grouped[cat] = { task_category: cat, cost: 0, hours: 0 };
          grouped[cat].cost += Number(e.cost_amount || 0);
          grouped[cat].hours += Number(e.hours || 0);
        }
        labourData = {
          total_cost: Object.values(grouped).reduce((s, c) => s + c.cost, 0),
          by_category: Object.values(grouped),
        };

        // Resolve task_category → trade_category_id so labour shows in budget-vs-actual.
        const tradeNames = [...new Set(
          Object.keys(grouped).map(c => TASK_CATEGORY_TO_TRADE_NAME[c]).filter(Boolean)
        )];
        if (tradeNames.length) {
          const { data: tradeRows } = await sb
            .from("trade_categories").select("id, name").in("name", tradeNames);
          const nameToId = new Map((tradeRows || []).map(t => [t.name, t.id]));
          for (const g of Object.values(grouped)) {
            const tradeName = TASK_CATEGORY_TO_TRADE_NAME[g.task_category];
            const tradeId = tradeName && nameToId.get(tradeName);
            if (!tradeId) continue;
            labourByTrade.set(tradeId, (labourByTrade.get(tradeId) || 0) + g.cost);
          }
        }
      }
    } catch { /* timesheet tables may not exist yet — graceful fallback */ }

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const labourCost = labourData.total_cost;
    const signedTotal = variations.filter(v => v.status === "signed").reduce((s, v) => s + Number(v.amount_ex_gst || 0), 0);
    const sentTotal   = variations.filter(v => ["draft", "sent_to_client"].includes(v.status)).reduce((s, v) => s + Number(v.amount_ex_gst || 0), 0);
    const draftCount  = variations.filter(v => v.status === "draft").length;

    // contract_value via the canonical Generated fact (Phase 5). Identical formula.
    const contractValue = await contractValueOf(jobId, job, signedTotal);
    // Spec: claims_issued = SUM(claims WHERE status NOT IN draft/void). Void already excluded by query.
    const claimsIssued  = claims.filter(c => c.status !== "draft").reduce((s, c) => s + Number(c.amount_ex_gst || 0), 0);
    // Payments nested in claims — no separate query needed
    const claimsPaid    = claims.reduce((s, c) => s + (c.progress_claim_payments || []).reduce((ps, p) => ps + Number(p.payment_amount || 0), 0), 0);
    const actualCosts   = docs.reduce((s, d) => s + Number(d.amount_ex_gst || 0), 0) + labourCost;

    const workingMarginPct = contractValue > 0 ? ((contractValue - actualCosts) / contractValue) * 100 : null;
    const forecastTotal    = Number(job.forecast_total_cost || job.estimated_total_cost || 0);
    const forecastMarginPct = contractValue > 0 && forecastTotal > 0 ? ((contractValue - forecastTotal) / contractValue) * 100 : null;
    // Guards: the working margin is valid whenever contract value > 0 (keep it). The forecast
    // margin depends on job.forecast_total_cost, which can be stale/wrong (e.g. $1.42M on an
    // $11,900 job → -11,832%). Flag an implausible forecast margin instead of displaying garbage.
    const contractValueMissing = contractValue <= 0;
    // The frontend (JobCommandCentre MarginIndicator) already handles this flag — it nulls the
    // forecast margin and shows "⚠ Data mismatch — sync Buildexact". The command-centre endpoint
    // simply wasn't sending it (only /summary computed it), so the raw -11,832% leaked through.
    const forecastDataQualityWarning = forecastMarginPct != null && Math.abs(forecastMarginPct) > 200;

    // ── Budget vs Actual ─────────────────────────────────────────────────────
    const actualsByTrade = new Map();
    for (const doc of docs) {
      if (!doc.trade_category_id) continue;
      actualsByTrade.set(doc.trade_category_id, (actualsByTrade.get(doc.trade_category_id) || 0) + Number(doc.amount_ex_gst || 0));
    }
    // Fold in-house labour into the per-trade actuals (H8) so budget-vs-actual reflects
    // labour, not just supplier invoices.
    for (const [tradeId, cost] of labourByTrade) {
      actualsByTrade.set(tradeId, (actualsByTrade.get(tradeId) || 0) + cost);
    }
    // Surface labour that maps to a trade with no budget row, so it isn't hidden.
    const budgetedTradeIds = new Set(budgets.map(b => b.trade_category_id));
    const labourOnlyTradeIds = [...labourByTrade.keys()].filter(id => !budgetedTradeIds.has(id));
    if (labourOnlyTradeIds.length) {
      const { data: extraTrades } = await sb
        .from("trade_categories").select("id, name, sort_order, category_type").in("id", labourOnlyTradeIds);
      for (const t of extraTrades || []) {
        budgets.push({
          trade_category_id: t.id,
          budget_amount: 0,
          original_budget: 0,
          forecast_amount: 0,
          forecast_notes: null,
          seeded_from: "labour",
          trade_categories: { name: t.name, sort_order: t.sort_order, category_type: t.category_type },
        });
      }
    }
    const budgetVsActual = budgets.map(b => {
      const actual  = actualsByTrade.get(b.trade_category_id) || 0;
      const budget  = Number(b.budget_amount || 0);
      const forecast = Number(b.forecast_amount || b.budget_amount || 0);
      const variance = actual - budget;
      const variancePct = budget > 0 ? (variance / budget) * 100 : null;
      return {
        trade_category_id: b.trade_category_id,
        name: b.trade_categories?.name || "",
        sort_order: b.trade_categories?.sort_order || 99,
        budget_amount: budget,
        forecast_amount: forecast,
        actual_amount: Math.round(actual * 100) / 100,
        variance: Math.round(variance * 100) / 100,
        variance_pct: variancePct != null ? Math.round(variancePct * 10) / 10 : null,
        status: variancePct != null && variancePct > 10 ? "over" : variancePct != null && variancePct > 0 ? "watch" : "ok",
      };
    }).sort((a, b) => a.sort_order - b.sort_order);

    // ── WIPAA ────────────────────────────────────────────────────────────────
    const pct_complete = forecastTotal > 0 ? Math.min(actualCosts / forecastTotal, 1) : null;
    const projectedMarginPct = contractValue > 0 && forecastTotal > 0 ? ((contractValue - forecastTotal) / contractValue) * 100 : null;

    const lastReviewDate = job.last_wipaa_review_date || wipaaReviewRes.data?.review_date || null;
    const daysSinceReview = lastReviewDate
      ? Math.floor((Date.now() - new Date(lastReviewDate).getTime()) / 86400000)
      : null;

    res.json({
      ok: true,
      job: {
        id: job.id,
        address: job.address,
        financial_locked: job.financial_locked,
        target_margin_pct: Number(job.target_margin_pct || 40),
        floor_margin_pct: Number(job.floor_margin_pct || 33),
      },
      kpis: {
        contract_value: Math.round(contractValue * 100) / 100,
        original_contract_value: Number(job.original_contract_value || job.contract_value || 0),
        claims_issued: Math.round(claimsIssued * 100) / 100,
        claims_paid: Math.round(claimsPaid * 100) / 100,
        actual_costs: Math.round(actualCosts * 100) / 100,
        contract_value_missing: contractValueMissing,
        forecast_data_quality_warning: forecastDataQualityWarning,
        working_margin_pct: workingMarginPct != null ? Math.round(workingMarginPct * 10) / 10 : null,
        forecast_margin_pct: (!forecastDataQualityWarning && forecastMarginPct != null) ? Math.round(forecastMarginPct * 10) / 10 : null,
      },
      budget_vs_actual: budgetVsActual,
      wipaa: {
        cost_to_date: Math.round(actualCosts * 100) / 100,
        forecast_total_cost: forecastTotal || null,
        estimated_total_cost: Number(job.estimated_total_cost || 0) || null,
        pct_complete,
        projected_margin_pct: (!forecastDataQualityWarning && projectedMarginPct != null) ? Math.round(projectedMarginPct * 10) / 10 : null,
      },
      days_since_wipaa_review: daysSinceReview,
      variations: {
        signed_total: Math.round(signedTotal * 100) / 100,
        sent_total: Math.round(sentTotal * 100) / 100,
        draft_count: draftCount,
      },
      claims: claims.filter(c => c.status === "overdue"),
      pending_approvals: pendingInvoicesRes.data || [],
      recent_insights: recentInsights || [],
      labour: {
        total_cost: Math.round(labourData.total_cost * 100) / 100,
        by_category: labourData.by_category,
      },
    });
  });

  // ── Job: update financial fields (target margin, forecast cost, original contract) ──
  app.patch("/api/finance/jobs/:jobId/financials", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const allowed = ["target_margin_pct", "floor_margin_pct", "forecast_total_cost", "original_contract_value", "financial_locked"];
    const updates = { updated_at: new Date().toISOString() };
    for (const k of allowed) {
      if (k in req.body) {
        updates[k] = typeof req.body[k] === "boolean" ? req.body[k]
          : req.body[k] === null || req.body[k] === "" ? null
          : Number(req.body[k]);
      }
    }
    const { data, error } = await sb.from("jobs")
      .update(updates).eq("id", req.params.jobId)
      .select("id, address, contract_value, original_contract_value, target_margin_pct, floor_margin_pct, forecast_total_cost, financial_locked")
      .single();
    if (error) return res.status(500).json({ ok: false, error: translateDbError(error) });
    res.json({ ok: true, job: data });
  });

  // ── WIPAA: current calculation ────────────────────────────────────────────
  app.get("/api/finance/jobs/:jobId/wipaa/current", requireAuth, async (req, res) => {
    const { jobId } = req.params;
    const sb = getServiceSupabase();
    const [jobRes, docsRes, variationsRes] = await Promise.all([
      sb.from("jobs").select("id, address, contract_value, original_contract_value, estimated_total_cost, forecast_total_cost, target_margin_pct, last_wipaa_review_date").eq("id", jobId).single(),
      sb.from("financial_documents").select("amount_ex_gst").eq("job_id", jobId).in("status", ["approved", "filed", "xero_synced"]),
      sb.from("job_variations").select("amount_ex_gst, status").eq("job_id", jobId)
    ]);
    if (jobRes.error) return res.status(500).json({ ok: false, error: translateDbError(jobRes.error) });
    const job = jobRes.data;
    const cost_to_date = (docsRes.data || []).reduce((s, d) => s + Number(d.amount_ex_gst || 0), 0);

    const signedVariations = (variationsRes.data || [])
      .filter(v => v.status === "signed")
      .reduce((s, v) => s + Number(v.amount_ex_gst || 0), 0);

    // contract_value via the canonical Generated fact (Phase 5). Identical formula.
    const contract_value = await contractValueOf(jobId, job, signedVariations);
    const estimated_total_cost = Number(job.estimated_total_cost) || null;
    // Use forecast_total_cost (editable) when set; fall back to original estimate
    const forecast_total_cost = Number(job.forecast_total_cost) || estimated_total_cost;

    let pct_complete = null, earned_revenue = null, wipaa = null, projected_margin_pct = null;
    if (forecast_total_cost && forecast_total_cost > 0 && contract_value > 0) {
      pct_complete = Math.min(cost_to_date / forecast_total_cost, 1);
      earned_revenue = pct_complete * contract_value;
      wipaa = earned_revenue - cost_to_date;
    }
    if (forecast_total_cost && contract_value > 0) {
      projected_margin_pct = ((contract_value - forecast_total_cost) / contract_value) * 100;
    }

    const daysSinceReview = job.last_wipaa_review_date
      ? Math.floor((Date.now() - new Date(job.last_wipaa_review_date).getTime()) / 86400000)
      : null;

    res.json({
      ok: true,
      job: { id: job.id, address: job.address, target_margin_pct: job.target_margin_pct, last_wipaa_review_date: job.last_wipaa_review_date },
      wipaa: {
        cost_to_date: Math.round(cost_to_date * 100) / 100,
        estimated_total_cost,
        forecast_total_cost,
        contract_value: Math.round(contract_value * 100) / 100,
        pct_complete,
        earned_revenue: earned_revenue != null ? Math.round(earned_revenue * 100) / 100 : null,
        wipaa: wipaa != null ? Math.round(wipaa * 100) / 100 : null,
        projected_margin_pct: projected_margin_pct != null ? Math.round(projected_margin_pct * 10) / 10 : null,
        days_since_review: daysSinceReview,
        review_overdue: daysSinceReview != null && daysSinceReview > 30
      }
    });
  });

  // ── WIPAA: save review snapshot ───────────────────────────────────────────
  app.post("/api/finance/jobs/:jobId/wipaa/review", requireAuth, async (req, res) => {
    const { jobId } = req.params;
    const { forecast_total_cost, notes, pct_complete } = req.body || {};
    const sb = getServiceSupabase();

    // Fetch current state for snapshot
    const [jobRes, docsRes, claimsRes, variationsRes] = await Promise.all([
      sb.from("jobs").select("contract_value, original_contract_value, estimated_total_cost").eq("id", jobId).single(),
      sb.from("financial_documents").select("amount_ex_gst").eq("job_id", jobId).in("status", ["approved", "filed", "xero_synced"]),
      sb.from("progress_claims").select("amount_ex_gst").eq("job_id", jobId).in("status", ["issued","overdue","partially_paid","paid","disputed"]),
      sb.from("job_variations").select("amount_ex_gst, status").eq("job_id", jobId)
    ]);
    const job = jobRes.data || {};
    const cost_to_date = (docsRes.data || []).reduce((s, d) => s + Number(d.amount_ex_gst || 0), 0);
    const signedVariationsTotal = (variationsRes.data || [])
      .filter(v => v.status === "signed")
      .reduce((s, v) => s + Number(v.amount_ex_gst || 0), 0);
    // Canonical contract value (Phase 5 Generated fact = original + Σ signed variations).
    // mig 079 dropped the storage trigger, so the stored jobs.contract_value is unmaintained —
    // route through contractValueOf (shared helper) so the WIPAA snapshot matches the Command
    // Centre + reconcile (N1 fix). The fetched signed-variations total is the defensive fallback.
    const contract_value = await contractValueOf(jobId, job, signedVariationsTotal);
    const forecast = forecast_total_cost ? Number(forecast_total_cost) : null;
    const projected_margin_pct = forecast && contract_value > 0
      ? ((contract_value - forecast) / contract_value) * 100 : null;

    const progress_billed = (claimsRes.data || []).reduce((s, c) => s + Number(c.amount_ex_gst || 0), 0);
    const { data: review, error } = await sb.from("wipaa_reviews").insert({
      job_id: jobId,
      review_date: new Date().toISOString().slice(0, 10),
      contract_value,
      original_estimate: Number(job.estimated_total_cost) || null,
      forecast_total_cost: forecast,
      cost_to_date: Math.round(cost_to_date * 100) / 100,
      progress_billed: Math.round(progress_billed * 100) / 100,
      pct_complete: pct_complete ? Number(pct_complete) : null,
      projected_margin_pct: projected_margin_pct != null ? Math.round(projected_margin_pct * 10) / 10 : null,
      notes: notes || null
    }).select().single();
    if (error) return res.status(500).json({ ok: false, error: translateDbError(error) });

    // Update job's last review date and forecast if provided
    const jobUpdates = { last_wipaa_review_date: review.review_date };
    if (forecast) jobUpdates.forecast_total_cost = forecast;
    await sb.from("jobs").update(jobUpdates).eq("id", jobId);

    res.json({ ok: true, review });
  });

  // ── WIPAA: history ────────────────────────────────────────────────────────
  app.get("/api/finance/jobs/:jobId/wipaa/history", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const { data, error } = await sb.from("wipaa_reviews")
      .select("*").eq("job_id", req.params.jobId).order("review_date", { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: translateDbError(error) });
    res.json({ ok: true, reviews: data || [] });
  });

  // ── Budget: actual costs by trade (for Budget vs Actual view) ────────────
  app.get("/api/finance/jobs/:jobId/budget/actuals", requireAuth, async (req, res) => {
    const { jobId } = req.params;
    const sb = getServiceSupabase();
    const [budgetsRes, docsRes] = await Promise.all([
      sb.from("job_budgets").select("*, trade_categories(name, sort_order, category_type)").eq("job_id", jobId),
      sb.from("financial_documents")
        .select("trade_category_id, amount_ex_gst, status")
        .eq("job_id", jobId)
        .in("status", ["approved", "filed", "xero_synced"])
        .not("trade_category_id", "is", null)
    ]);

    // Aggregate actuals by trade category
    const actualsByTrade = new Map();
    for (const doc of docsRes.data || []) {
      const prev = actualsByTrade.get(doc.trade_category_id) || 0;
      actualsByTrade.set(doc.trade_category_id, prev + Number(doc.amount_ex_gst || 0));
    }

    const rows = (budgetsRes.data || []).map(b => {
      const actual = actualsByTrade.get(b.trade_category_id) || 0;
      const budget = Number(b.budget_amount || 0);
      const forecast = Number(b.forecast_amount || b.budget_amount || 0);
      const variance = actual - budget;
      const variancePct = budget > 0 ? (variance / budget) * 100 : null;
      // Status: 🟢 under, 🟡 within 10%, 🔴 over
      let status = "ok";
      if (variancePct != null && variancePct > 10) status = "over";
      else if (variancePct != null && variancePct > 0) status = "watch";
      return {
        trade_category_id: b.trade_category_id,
        name: b.trade_categories?.name || "",
        sort_order: b.trade_categories?.sort_order || 99,
        category_type: b.trade_categories?.category_type || "trade",
        budget_amount: budget,
        original_budget: Number(b.original_budget || 0),
        forecast_amount: forecast,
        actual_amount: Math.round(actual * 100) / 100,
        variance: Math.round(variance * 100) / 100,
        variance_pct: variancePct != null ? Math.round(variancePct * 10) / 10 : null,
        status,
        seeded_from: b.seeded_from,
        forecast_notes: b.forecast_notes
      };
    }).sort((a, b) => a.sort_order - b.sort_order);

    // Also include any actuals for unbudgeted trade categories
    for (const [tradeCatId, actual] of actualsByTrade) {
      if (!rows.find(r => r.trade_category_id === tradeCatId)) {
        rows.push({
          trade_category_id: tradeCatId,
          name: "Unbudgeted",
          sort_order: 999,
          category_type: "trade",
          budget_amount: 0,
          original_budget: 0,
          forecast_amount: 0,
          actual_amount: Math.round(actual * 100) / 100,
          variance: Math.round(actual * 100) / 100,
          variance_pct: null,
          status: "over"
        });
      }
    }

    const totals = rows.reduce((acc, r) => ({
      budget: acc.budget + r.budget_amount,
      actual: acc.actual + r.actual_amount,
      forecast: acc.forecast + r.forecast_amount
    }), { budget: 0, actual: 0, forecast: 0 });

    res.json({ ok: true, rows, totals });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // PROGRESS CLAIMS
  // ════════════════════════════════════════════════════════════════════════════

  // ── Stage → canonical mapping ───────────────────────────────────────────────
  // Maps fee proposal milestone strings to progress_claims.stage enum values
  const MILESTONE_TO_STAGE = [
    [/deposit/i,               "deposit"],
    [/slab|footings/i,         "slab"],
    [/frame|roof\s*frame/i,    "frame"],
    [/lock.?up/i,              "lock_up"],
    [/lining|joinery|fixing|internal|fit.?out/i, "fixing"],
    [/practical|completion|pc\b/i, "practical_completion"],
  ];

  function milestoneToStage(milestone) {
    const s = String(milestone || "");
    for (const [re, stage] of MILESTONE_TO_STAGE) {
      if (re.test(s)) return stage;
    }
    return "custom";
  }

  const STAGE_LABELS = STAGE_LABELS_FROM_TOKENS;

  // ── Load fee schedule for a job ─────────────────────────────────────────────
  // Returns staged schedule with: stage, label, pct, amount_ex_gst, claimed, remaining
  app.get("/api/finance/jobs/:jobId/claims/schedule", requireAuth, async (req, res) => {
    const { jobId } = req.params;
    const sb = getServiceSupabase();

    const [jobRes, proposalRes, claimsRes] = await Promise.all([
      sb.from("jobs").select("contract_value, original_contract_value").eq("id", jobId).single(),
      sb.from("fee_proposals").select("fee_schedule, data").eq("job_id", jobId)
        .in("status", ["accepted", "sent"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("progress_claims").select("stage, amount_ex_gst, status")
        .eq("job_id", jobId).neq("status", "void")
    ]);

    const contractValue = Number(jobRes.data?.original_contract_value || jobRes.data?.contract_value || 0);

    // Pull fee_schedule from accepted proposal or fall back to default APB schedule
    let feeSchedule = proposalRes.data?.fee_schedule
      || proposalRes.data?.data?.fee_schedule
      || null;

    const DEFAULT_SCHEDULE = [
      { STAGE_CLAIM: "Deposit",             MILESTONE: "Deposit",                  PERCENTAGE: "5%"  },
      { STAGE_CLAIM: "Progress Payment 1",  MILESTONE: "Slab",                     PERCENTAGE: "20%" },
      { STAGE_CLAIM: "Progress Payment 2",  MILESTONE: "Wall and roof frames",      PERCENTAGE: "30%" },
      { STAGE_CLAIM: "Progress Payment 3",  MILESTONE: "Lock up",                  PERCENTAGE: "20%" },
      { STAGE_CLAIM: "Progress Payment 4",  MILESTONE: "Internal linings",         PERCENTAGE: "15%" },
      { STAGE_CLAIM: "Progress Payment 5",  MILESTONE: "Practical completion",     PERCENTAGE: "10%" },
    ];

    if (!Array.isArray(feeSchedule) || !feeSchedule.length) feeSchedule = DEFAULT_SCHEDULE;

    // Normalise percentage strings → numbers
    const schedule = feeSchedule.map((row, i) => {
      const rawPct = String(row.PERCENTAGE || row.percentage || "0").replace(/%/g, "").trim();
      const pct = parseFloat(rawPct) || 0;
      const stage = milestoneToStage(row.MILESTONE || row.milestone || row.STAGE_CLAIM || row.stage_claim || "");
      return {
        index: i,
        stage_claim_label: row.STAGE_CLAIM || row.stage_claim || `Stage ${i + 1}`,
        milestone: row.MILESTONE || row.milestone || "",
        stage,
        stage_label: STAGE_LABELS[stage] || stage,
        pct,
        amount_ex_gst: contractValue > 0 ? Math.round((pct / 100) * contractValue * 100) / 100 : null,
      };
    });

    // Sum already-claimed amounts by stage
    const claimedByStage = {};
    for (const claim of claimsRes.data || []) {
      const s = claim.stage || "custom";
      claimedByStage[s] = (claimedByStage[s] || 0) + Number(claim.amount_ex_gst || 0);
    }
    const totalClaimed = Object.values(claimedByStage).reduce((a, b) => a + b, 0);

    const rows = schedule.map(s => ({
      ...s,
      claimed: claimedByStage[s.stage] || 0,
      remaining: s.amount_ex_gst != null ? Math.max(0, s.amount_ex_gst - (claimedByStage[s.stage] || 0)) : null,
      fully_claimed: s.amount_ex_gst != null && (claimedByStage[s.stage] || 0) >= s.amount_ex_gst * 0.99
    }));

    res.json({
      ok: true,
      contract_value: contractValue,
      total_claimed: Math.round(totalClaimed * 100) / 100,
      source: proposalRes.data ? "fee_proposal" : "default",
      schedule: rows
    });
  });

  // ── List claims ─────────────────────────────────────────────────────────────
  app.get("/api/finance/jobs/:jobId/claims", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const { data, error } = await sb.from("progress_claims")
      .select("*, progress_claim_payments(payment_amount, payment_date, payment_method, payment_reference)")
      .eq("job_id", req.params.jobId)
      .order("claim_number");
    if (error) return res.status(500).json({ ok: false, error: translateDbError(error) });

    const claims = (data || []).map(c => ({
      ...c,
      amount_paid: (c.progress_claim_payments || []).reduce((s, p) => s + Number(p.payment_amount || 0), 0)
    }));
    res.json({ ok: true, claims });
  });

  // ── Create claim ────────────────────────────────────────────────────────────
  app.post("/api/finance/jobs/:jobId/claims", requireAuth, async (req, res) => {
    const { jobId } = req.params;
    const { stage, description, amount_ex_gst, claim_reference } = req.body || {};
    if (!stage) return res.status(400).json({ ok: false, error: "stage required" });
    if (!amount_ex_gst || Number(amount_ex_gst) <= 0) return res.status(400).json({ ok: false, error: "amount_ex_gst must be greater than zero" });
    const sb = getServiceSupabase();

    // Revised contract = original + signed variations
    const [jobRes, varsRes] = await Promise.all([
      sb.from("jobs").select("original_contract_value, contract_value").eq("id", jobId).single(),
      sb.from("job_variations").select("amount_ex_gst").eq("job_id", jobId).eq("status", "signed")
    ]);
    const job = jobRes.data || {};
    const signedVarsTotal = (varsRes.data || []).reduce((s, v) => s + Number(v.amount_ex_gst || 0), 0);
    // Revised contract = canonical contract_value Generated fact (Phase 5). Identical formula.
    const contractValue = await contractValueOf(jobId, job, signedVarsTotal);

    // Race-safe auto-increment: retry on unique constraint collision
    let claim = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const [lastRes, priorRes] = await Promise.all([
        sb.from("progress_claims")
          .select("claim_number").eq("job_id", jobId)
          .order("claim_number", { ascending: false }).limit(1).maybeSingle(),
        // Only count ISSUED claims in cumulative — not drafts or voids
        sb.from("progress_claims")
          .select("amount_ex_gst").eq("job_id", jobId)
          .in("status", ["issued","overdue","partially_paid","paid","disputed"])
      ]);
      const claim_number = (lastRes.data?.claim_number || 0) + 1;
      const cumulative_prior = (priorRes.data || []).reduce((s, c) => s + Number(c.amount_ex_gst || 0), 0);
      const cumulative_claimed = cumulative_prior + Number(amount_ex_gst);
      const percentage_claimed = contractValue > 0 ? (cumulative_claimed / contractValue) * 100 : null;

      const { data, error } = await sb.from("progress_claims").insert({
        job_id: jobId,
        claim_number,
        claim_reference: claim_reference || null,
        stage,
        description: description || null,
        amount_ex_gst: Number(amount_ex_gst),
        cumulative_claimed,
        percentage_claimed,
        status: "draft"
      }).select().single();

      if (!error) { claim = data; break; }
      if (error.code !== "23505" || attempt === 2) return res.status(500).json({ ok: false, error: translateDbError(error) });
    }
    if (!claim) return res.status(500).json({ ok: false, error: "Failed to assign claim number" });
    res.json({ ok: true, claim });
  });

  // ── Update claim (draft only) ────────────────────────────────────────────────
  app.put("/api/finance/jobs/:jobId/claims/:claimId", requireAuth, async (req, res) => {
    const { claimId } = req.params;
    const sb = getServiceSupabase();
    const { data: existing } = await sb.from("progress_claims").select("status").eq("id", claimId).single();
    if (!existing) return res.status(404).json({ ok: false, error: "Not found" });
    if (existing.status !== "draft") return res.status(400).json({ ok: false, error: "Only draft claims can be edited" });

    const allowed = ["stage", "description", "amount_ex_gst", "claim_reference"];
    const updates = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (k in req.body) updates[k] = req.body[k];

    const { data, error } = await sb.from("progress_claims").update(updates).eq("id", claimId).select().single();
    if (error) return res.status(500).json({ ok: false, error: translateDbError(error) });
    res.json({ ok: true, claim: data });
  });

  // ── Issue claim (draft → issued): generate PDF + email ──────────────────────
  app.post("/api/finance/jobs/:jobId/claims/:claimId/send", requireAuth, async (req, res) => {
    const { jobId, claimId } = req.params;
    const { email_to, email_cc } = req.body || {};
    const sb = getServiceSupabase();

    const [claimRes, jobRes, variationsRes, priorClaimsRes, docsRes, budgetsRes] = await Promise.all([
      sb.from("progress_claims").select("*").eq("id", claimId).single(),
      sb.from("jobs").select("address, client_name, original_contract_value, contract_value, target_margin_pct, floor_margin_pct, forecast_total_cost, estimated_total_cost").eq("id", jobId).single(),
      sb.from("job_variations").select("variation_number, title, description, amount_ex_gst, status").eq("job_id", jobId).neq("status", "void").order("variation_number"),
      sb.from("progress_claims").select("stage, amount_ex_gst, status, claim_number, id")
        .eq("job_id", jobId).neq("status", "void").neq("id", claimId),
      sb.from("financial_documents").select("amount_ex_gst, trade_category_id").eq("job_id", jobId).in("status", ["approved", "filed", "xero_synced"]),
      sb.from("job_budgets").select("*, trade_categories(name, sort_order)").eq("job_id", jobId)
    ]);

    if (!claimRes.data) return res.status(404).json({ ok: false, error: "Claim not found" });
    const claim = claimRes.data;
    const job = jobRes.data || {};
    if (claim.status !== "draft") return res.status(400).json({ ok: false, error: "Only draft claims can be issued" });

    const variations = variationsRes.data || [];
    const signedVariations = variations.filter(v => v.status === "signed");
    const signedVariationsTotal = signedVariations.reduce((s, v) => s + Number(v.amount_ex_gst || 0), 0);
    const originalContract = Number(job.original_contract_value || job.contract_value || 0);
    // Revised contract = canonical contract_value Generated fact (Phase 5). Identical formula.
    const revisedContract = await contractValueOf(jobId, job, signedVariationsTotal);

    // Prior non-draft non-void claims (exclude this claim)
    const priorClaims = priorClaimsRes.data || [];
    const previousClaimsTotal = priorClaims.reduce((s, c) => s + Number(c.amount_ex_gst || 0), 0);
    const claimedStages = new Set(priorClaims.map(c => c.stage).filter(Boolean));

    // Compute actuals by trade for Budget vs Actual table
    const actualsByTrade = new Map();
    for (const doc of docsRes.data || []) {
      if (!doc.trade_category_id) continue;
      actualsByTrade.set(doc.trade_category_id, (actualsByTrade.get(doc.trade_category_id) || 0) + Number(doc.amount_ex_gst || 0));
    }
    const actualCostsTotal = (docsRes.data || []).reduce((s, d) => s + Number(d.amount_ex_gst || 0), 0);

    const budgetActuals = (budgetsRes.data || []).map(b => {
      const actual = actualsByTrade.get(b.trade_category_id) || 0;
      const budget = Number(b.budget_amount || 0);
      const variance = actual - budget;
      let status = "ok";
      if (budget > 0 && (variance / budget) > 0.1) status = "over";
      else if (variance > 0) status = "watch";
      return {
        name: b.trade_categories?.name || "—",
        sort_order: b.trade_categories?.sort_order || 99,
        budget_amount: budget,
        actual_amount: Math.round(actual * 100) / 100,
        forecast_amount: Number(b.forecast_amount || b.budget_amount || 0),
        variance: Math.round(variance * 100) / 100,
        status
      };
    }).sort((a, b) => a.sort_order - b.sort_order).filter(r => r.budget_amount > 0 || r.actual_amount > 0);

    // KPIs for internal snapshot
    const workingMarginPct = revisedContract > 0
      ? ((revisedContract - actualCostsTotal) / revisedContract) * 100 : null;
    const forecastCost = Number(job.forecast_total_cost || job.estimated_total_cost || 0);
    const forecastMarginPct = revisedContract > 0 && forecastCost > 0
      ? ((revisedContract - forecastCost) / revisedContract) * 100 : null;
    const estimatedCost = Number(job.estimated_total_cost || 0);
    const pctComplete = estimatedCost > 0 ? Math.min((actualCostsTotal / estimatedCost) * 100, 100) : null;

    const kpis = {
      actual_costs: actualCostsTotal,
      working_margin_pct: workingMarginPct != null ? Math.round(workingMarginPct * 10) / 10 : null,
      forecast_margin_pct: forecastMarginPct != null ? Math.round(forecastMarginPct * 10) / 10 : null,
    };

    const issuedDate = new Date().toISOString().slice(0, 10);
    const dueDate = new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10);

    // Build token map once — shared by both PDFs
    const tokens = buildProgressClaimTokens(claim, job, {
      signedVariationsTotal, originalContract, revisedContract,
      previousClaimsTotal, claimedStages, issuedDate, dueDate,
      variations, budgetActuals, kpis,
      pctComplete: pctComplete != null ? Math.round(pctComplete) : null
    });

    // Generate both PDFs in parallel
    const [clientPdf, internalPdf] = await Promise.all([
      generateClientProgressClaimPdf(tokens),
      generateInternalProgressClaimPdf(tokens)
    ]);

    const { data: updated, error: updErr } = await sb.from("progress_claims")
      .update({ status: "issued", issued_date: issuedDate, due_date: dueDate, updated_at: new Date().toISOString() })
      .eq("id", claimId).select().single();
    if (updErr) return res.status(500).json({ ok: false, error: translateDbError(updErr) });

    // Email client PDF if address provided
    let emailSent = false;
    let trackingId = null;
    if (email_to) {
      const stageLabel = STAGE_LABELS[claim.stage] || claim.stage;
      const fmtAud = n => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n || 0);
      const amountEx = Number(claim.amount_ex_gst || 0);
      const safeAddr = (job.address || "").replace(/[^a-zA-Z0-9]/g, "-");
      const { randomUUID } = await import("crypto");
      trackingId = randomUUID();
      const baseUrl = (process.env.APP_URL || "https://blueleafhub.com.au").replace(/\/$/, "");
      const pixelUrl = `${baseUrl}/api/track/email/${trackingId}`;
      try {
        const bodyText = [
          `Please find attached Progress Claim ${claim.claim_number} for ${job.address}.`,
          ``,
          `Stage: ${stageLabel}`,
          `Amount (ex GST): ${fmtAud(amountEx)}`,
          `GST: ${fmtAud(amountEx * 0.1)}`,
          `Total (inc GST): ${fmtAud(amountEx * 1.1)}`,
          `Payment due: ${dueDate}`,
          ``,
          `Please direct all payment enquiries to accounts@blueleafbuilding.com.au.`,
          ``,
          `Blue Leaf Building`,
        ].join("\n");
        await sendPlainMail({
          to: email_to,
          cc: email_cc || undefined,
          subject: `Progress Claim ${claim.claim_number} — ${job.address}`,
          text: bodyText,
          html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${bodyText}</pre><img src="${pixelUrl}" width="1" height="1" style="display:none" alt="">`,
          attachments: [{
            filename: `Progress-Claim-${claim.claim_number}-${safeAddr}.pdf`,
            content: clientPdf,
            contentType: "application/pdf"
          }]
        });
        emailSent = true;
        // Record tracking event (fire and forget)
        sb.from("email_delivery_events").insert({
          tracking_id: trackingId,
          resource_type: "claim",
          resource_id: claimId,
          job_id: jobId,
          recipient_email: email_to,
          sent_at: new Date().toISOString(),
          open_count: 0
        }).then().catch(e => console.error("[claims] tracking insert:", e?.message));
      } catch (e) {
        console.error("[claims] email error:", e?.message);
      }
    }

    res.json({
      ok: true,
      claim: updated,
      emailSent,
      tracking_id: trackingId,
      pdf_b64: clientPdf.toString("base64"),
      internal_pdf_b64: internalPdf.toString("base64")
    });
  });

  // ── Record payment ───────────────────────────────────────────────────────────
  app.post("/api/finance/jobs/:jobId/claims/:claimId/pay", requireAuth, async (req, res) => {
    const { claimId } = req.params;
    const { payment_amount, payment_date, payment_reference, payment_method } = req.body || {};
    if (!payment_amount || !payment_date) return res.status(400).json({ ok: false, error: "payment_amount and payment_date required" });
    const sb = getServiceSupabase();

    const { data: claim } = await sb.from("progress_claims")
      .select("*, progress_claim_payments(payment_amount)")
      .eq("id", claimId).single();
    if (!claim) return res.status(404).json({ ok: false, error: "Not found" });

    await sb.from("progress_claim_payments").insert({
      progress_claim_id: claimId,
      payment_amount: Number(payment_amount),
      payment_date,
      payment_reference: payment_reference || null,
      payment_method: payment_method || "eft"
    });

    // Update claim status
    const totalPaid = (claim.progress_claim_payments || []).reduce((s, p) => s + Number(p.payment_amount || 0), 0) + Number(payment_amount);
    const claimAmount = Number(claim.amount_ex_gst || 0) * 1.1; // inc GST
    const newStatus = totalPaid >= claimAmount * 0.99 ? "paid"
      : totalPaid > 0 ? "partially_paid"
      : claim.status;

    await sb.from("progress_claims").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", claimId);

    const { data: refreshed } = await sb.from("progress_claims")
      .select("*, progress_claim_payments(payment_amount, payment_date, payment_method, payment_reference)")
      .eq("id", claimId).single();
    res.json({ ok: true, claim: refreshed });
  });

  // ── Void claim ──────────────────────────────────────────────────────────────
  app.post("/api/finance/jobs/:jobId/claims/:claimId/void", requireAuth, async (req, res) => {
    const { claimId } = req.params;
    const { reason } = req.body || {};
    const sb = getServiceSupabase();
    const voidUpdate = { status: "void", updated_at: new Date().toISOString() };
    if (reason) voidUpdate.description = `VOIDED: ${reason}`;
    const { data, error } = await sb.from("progress_claims")
      .update(voidUpdate)
      .eq("id", claimId).select().single();
    if (error) return res.status(500).json({ ok: false, error: translateDbError(error) });
    res.json({ ok: true, claim: data });
  });

  // ── Client-facing progress claim PDF ─────────────────────────────────────────
  // Mirrors BlueLeaf_Client_Progress_Claim.docx structure.
  async function generateClientProgressClaimPdf(t) {
    const PDFDocument = require("pdfkit");
    const path = require("path");
    const logoPath = path.resolve("public/brand/logo-black.png");
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks = [];
      doc.on("data", c => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const PRI = "#006c9b";
      const W   = doc.page.width;
      const M   = 50; // margin
      const CW  = W - M * 2; // content width

      // ── Header ─────────────────────────────────────────────────────
      // Blue top accent bar
      doc.rect(0, 0, W, 4).fill(PRI);
      // Logo (left) — logo-black.png is the full Blue Leaf Building brand mark
      try { doc.image(logoPath, M, 10, { width: 190 }); } catch (_) {
        doc.fillColor(PRI).fontSize(18).font("Helvetica-Bold").text("BLUE LEAF BUILDING", M, 18);
      }
      // Document type + metadata (right)
      doc.fillColor(PRI).fontSize(13).font("Helvetica-Bold")
        .text("PROGRESS CLAIM", M, 14, { align: "right", width: CW });
      doc.fillColor("#000").fontSize(10).font("Helvetica-Bold")
        .text(`No. ${t.claim_number}`, M, 32, { align: "right", width: CW });
      doc.fillColor("#555").fontSize(9).font("Helvetica")
        .text(`Date: ${t.claim_date_short}`, M, 46, { align: "right", width: CW })
        .text(`Due: ${t.due_date_short}`, M, 58, { align: "right", width: CW });
      // Blue bottom accent bar
      doc.rect(0, 84, W, 2).fill(PRI);

      let y = 96;

      // ── Project Overview block ──────────────────────────────────────
      pdfSectionHeader(doc, "Project Overview", M, y, CW, PRI);
      y += 22;
      const ovLeft = [
        ["Project",       t.project_name],
        ["Client",        t.client_name],
        ["Current Stage", t.current_stage],
        ["Progress",      t.progress_percent],
      ];
      const ovRight = [
        ["Next Milestone", t.next_milestone],
        ["Claim Number",   t.claim_number],
        ["Claim Date",     t.claim_date_short],
      ];
      y = pdfTwoColTable(doc, ovLeft, ovRight, M, y, CW);
      y += 10;

      // ── Project Progress ────────────────────────────────────────────
      pdfSectionHeader(doc, "Project Progress", M, y, CW, PRI);
      y += 22;
      if (t.weekly_summary) {
        doc.fillColor("#333").fontSize(9).font("Helvetica-Oblique")
          .text(t.weekly_summary, M, y, { width: CW });
        y += doc.heightOfString(t.weekly_summary, { width: CW }) + 10;
      }
      // Milestone checkboxes
      doc.fillColor("#000").fontSize(9).font("Helvetica-Bold").text("Milestone Progress:", M, y);
      y += 14;
      for (const m of t._milestones) {
        const isComplete = m.status.startsWith("Complete");
        const isActive   = m.status === "In Progress";
        const box = isComplete ? "☑" : isActive ? "☐" : "☐";
        const color = isComplete ? "#059669" : isActive ? PRI : "#888";
        const suffix = isActive ? "  ← Current claim" : "";
        doc.fillColor(color).fontSize(9).font(isActive ? "Helvetica-Bold" : "Helvetica")
          .text(`${box}  ${m.label}: ${m.status}${suffix}`, M + 10, y);
        y += 14;
      }
      y += 6;

      // ── Current Claim Summary ───────────────────────────────────────
      pdfSectionHeader(doc, "Current Claim Summary", M, y, CW, PRI);
      y += 22;
      const claimRows = [
        ["Current Claim Amount (inc GST)", t.current_claim_inc],
        ["Previous Claims (ex GST)",        t.previous_claims_ex || "—"],
        ["Contract Value",                 t.contract_value],
        ["Revised Contract Value",         t.revised_contract_value],
        ["Cumulative Claimed to Date",     t.claimed_to_date],
      ];
      y = pdfAmountTable(doc, claimRows, M, y, CW, PRI);
      y += 6;

      // Highlight total-due box
      doc.rect(M, y, CW, 26).fill(PRI);
      doc.fillColor("white").fontSize(11).font("Helvetica-Bold")
        .text("TOTAL DUE", M + 10, y + 7)
        .text(t.current_claim_inc, M, y + 7, { align: "right", width: CW - 10 });
      y += 36;

      // ── Payment Details ─────────────────────────────────────────────
      pdfSectionHeader(doc, "Payment Details", M, y, CW, PRI);
      y += 22;
      const payRows = [
        ["Account Name",    t.account_name],
        ["Bank",            t.bank_name],
        ["BSB",             t.bsb],
        ["Account Number",  t.account_number],
        ["Payment Terms",   t.payment_terms],
        ["Reference",       t.payment_reference],
      ];
      y = pdfFieldGrid(doc, payRows, M, y, CW);
      y += 10;

      // ── Variations (if any) ─────────────────────────────────────────
      if (t._variations.length > 0) {
        if (y > doc.page.height - 180) { doc.addPage(); y = M; }
        pdfSectionHeader(doc, "Approved Variations", M, y, CW, PRI);
        y += 22;
        y = pdfVariationsTable(doc, t._variations, M, y, CW, PRI);
        y += 10;
      }

      // ── Notes ───────────────────────────────────────────────────────
      if (t.client_message) {
        if (y > doc.page.height - 100) { doc.addPage(); y = M; }
        pdfSectionHeader(doc, "Notes", M, y, CW, PRI);
        y += 22;
        doc.fillColor("#333").fontSize(9).font("Helvetica")
          .text(t.client_message, M, y, { width: CW });
        y += doc.heightOfString(t.client_message, { width: CW }) + 10;
      }

      // ── Footer ──────────────────────────────────────────────────────
      pdfFooter(doc, t);
      doc.end();
    });
  }

  // ── Internal APB / Financial Intelligence PDF ─────────────────────────────
  // Mirrors BlueLeaf_Internal_Progress_Claim.docx structure.
  async function generateInternalProgressClaimPdf(t) {
    const PDFDocument = require("pdfkit");
    const path = require("path");
    const logoPath = path.resolve("public/brand/logo-black.png");
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks = [];
      doc.on("data", c => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const PRI = "#006c9b";
      const RED = "#dc2626";
      const W   = doc.page.width;
      const M   = 50;
      const CW  = W - M * 2;

      // ── Header ─────────────────────────────────────────────────────
      // Blue top accent bar
      doc.rect(0, 0, W, 4).fill(PRI);
      // Logo (left)
      try { doc.image(logoPath, M, 10, { width: 190 }); } catch (_) {
        doc.fillColor(PRI).fontSize(18).font("Helvetica-Bold").text("BLUE LEAF BUILDING", M, 18);
      }
      // Document type + metadata (right)
      doc.fillColor(PRI).fontSize(13).font("Helvetica-Bold")
        .text("PROGRESS CLAIM", M, 14, { align: "right", width: CW });
      doc.fillColor("#000").fontSize(10).font("Helvetica-Bold")
        .text(`No. ${t.claim_number}`, M, 32, { align: "right", width: CW });
      doc.fillColor("#555").fontSize(9).font("Helvetica")
        .text(`Date: ${t.claim_date_short}`, M, 46, { align: "right", width: CW });
      doc.fillColor(RED).fontSize(8).font("Helvetica-Bold")
        .text("INTERNAL — DO NOT DISTRIBUTE", M, 58, { align: "right", width: CW });
      // Blue bottom accent bar
      doc.rect(0, 84, W, 2).fill(PRI);

      let y = 96;

      // ── Project Information ─────────────────────────────────────────
      pdfSectionHeader(doc, "Project Information", M, y, CW, PRI);
      y += 22;
      const projRows = [
        ["Project Name",    t.project_name],
        ["Project Number",  t.project_number],
        ["Client",          t.client_name],
        ["Site Address",    t.site_address],
        ["Claim Number",    t.claim_number],
        ["Claim Date",      t.claim_date_short],
        ["Project Manager", t.project_manager],
        ["Current Stage",   t.current_stage],
      ];
      y = pdfFieldGrid(doc, projRows, M, y, CW);
      y += 10;

      // ── Financial Command Centre Snapshot ──────────────────────────
      pdfSectionHeader(doc, "Financial Command Centre Snapshot", M, y, CW, PRI);
      y += 22;
      const fcRows = [
        ["Original Contract",       t.original_contract],
        ["Approved Variations",     t.approved_variations],
        ["Revised Contract",        t.revised_contract],
        ["Build Completion %",      t.build_completion],
        ["Claims Raised to Date",   t.claimed_to_date],
        ["Actual Costs to Date",    t.actual_costs],
        ["Working Margin",          t.working_margin],
        ["Forecast Margin",         t.forecast_margin],
        ["Margin Status",           t.margin_status],
      ];
      y = pdfFieldGrid(doc, fcRows, M, y, CW);
      y += 10;

      // ── Budget vs Actual Analysis ───────────────────────────────────
      if (t._budgetActuals.length > 0) {
        if (y > doc.page.height - 200) { doc.addPage(); y = M; }
        pdfSectionHeader(doc, "Budget vs Actual Analysis", M, y, CW, PRI);
        y += 22;
        y = pdfBudgetActualTable(doc, t._budgetActuals, M, y, CW, PRI, RED);
        y += 10;
      }

      // ── Progress Claim Summary ──────────────────────────────────────
      if (y > doc.page.height - 140) { doc.addPage(); y = M; }
      pdfSectionHeader(doc, "Progress Claim Summary", M, y, CW, PRI);
      y += 22;
      const claimRows = [
        ["Current Claim Amount (ex GST)", t.current_claim_ex],
        ["GST",                           t.gst],
        ["Current Claim Amount (inc GST)",t.current_claim_inc],
      ];
      y = pdfAmountTable(doc, claimRows, M, y, CW, PRI);
      doc.rect(M, y, CW, 26).fill(PRI);
      doc.fillColor("white").fontSize(11).font("Helvetica-Bold")
        .text("TOTAL DUE", M + 10, y + 7)
        .text(t.current_claim_inc, M, y + 7, { align: "right", width: CW - 10 });
      y += 36;

      // ── APB Internal Review Checklist ───────────────────────────────
      if (y > doc.page.height - 160) { doc.addPage(); y = M; }
      pdfSectionHeader(doc, "APB Internal Review Checklist", M, y, CW, PRI);
      y += 22;
      const checklist = [
        "Claimed % aligns with actual site completion",
        "Underclaim risk checked",
        "Variation approvals complete",
        "Cashflow reviewed",
        "Margin movement reviewed",
        "Progress photos attached",
      ];
      for (const item of checklist) {
        doc.fillColor("#000").fontSize(10).font("Helvetica")
          .text(`☐  ${item}`, M + 8, y);
        y += 16;
      }
      y += 10;

      // ── Payment Details ─────────────────────────────────────────────
      pdfSectionHeader(doc, "Payment Details", M, y, CW, PRI);
      y += 22;
      const payRows = [
        ["Account Name",    t.account_name],
        ["BSB",             t.bsb],
        ["Account Number",  t.account_number],
        ["Reference",       t.payment_reference],
      ];
      pdfFieldGrid(doc, payRows, M, y, CW);

      // ── Footer ──────────────────────────────────────────────────────
      pdfFooter(doc, t, true);
      doc.end();
    });
  }

  // ── PDF helpers ───────────────────────────────────────────────────────────

  function pdfSectionHeader(doc, title, x, y, w, color) {
    doc.rect(x, y, w, 18).fill(color);
    doc.fillColor("white").fontSize(9).font("Helvetica-Bold")
      .text(title.toUpperCase(), x + 8, y + 5);
  }

  function pdfFieldGrid(doc, rows, x, y, w) {
    const col = w / 2;
    for (const [label, value] of rows) {
      doc.fillColor("#555").fontSize(8).font("Helvetica")
        .text(label, x + 4, y + 2, { width: col - 8 });
      doc.fillColor("#000").fontSize(8.5).font("Helvetica-Bold")
        .text(String(value || "—"), x + col, y + 2, { width: col - 4 });
      y += 14;
      doc.moveTo(x, y).lineTo(x + w, y).strokeColor("#e5e7eb").lineWidth(0.3).stroke();
    }
    return y + 4;
  }

  function pdfTwoColTable(doc, leftRows, rightRows, x, y, w) {
    const half = w / 2 - 6;
    const col2x = x + w / 2 + 6;
    let ly = y, ry = y;
    for (const [label, value] of leftRows) {
      doc.fillColor("#555").fontSize(8).font("Helvetica").text(label, x + 4, ly + 2, { width: half - 8 });
      doc.fillColor("#000").fontSize(8.5).font("Helvetica-Bold").text(String(value || "—"), x + half / 2, ly + 2, { width: half / 2 });
      ly += 14;
    }
    for (const [label, value] of rightRows) {
      doc.fillColor("#555").fontSize(8).font("Helvetica").text(label, col2x + 4, ry + 2, { width: half - 8 });
      doc.fillColor("#000").fontSize(8.5).font("Helvetica-Bold").text(String(value || "—"), col2x + half / 2, ry + 2, { width: half / 2 });
      ry += 14;
    }
    return Math.max(ly, ry) + 4;
  }

  function pdfAmountTable(doc, rows, x, y, w) {
    for (const [label, value] of rows) {
      doc.fillColor("#444").fontSize(9).font("Helvetica").text(label, x + 6, y + 3, { width: w - 120 });
      doc.fillColor("#000").fontSize(9).font("Helvetica-Bold").text(String(value || "—"), x + w - 110, y + 3, { width: 104, align: "right" });
      y += 18;
      doc.moveTo(x, y).lineTo(x + w, y).strokeColor("#e5e7eb").lineWidth(0.3).stroke();
    }
    return y + 2;
  }

  function pdfVariationsTable(doc, variations, x, y, w, color) {
    // Header
    doc.rect(x, y, w, 16).fill("#f0f7fb");
    const cols = [w * 0.1, w * 0.5, w * 0.25, w * 0.15];
    const headers = ["#", "Description", "Value", "Status"];
    let cx = x;
    for (let i = 0; i < headers.length; i++) {
      doc.fillColor(color).fontSize(8).font("Helvetica-Bold").text(headers[i], cx + 4, y + 4, { width: cols[i] - 4 });
      cx += cols[i];
    }
    y += 16;
    for (const v of variations) {
      cx = x;
      const vals = [v.number, v.description, v.value, v.status];
      for (let i = 0; i < vals.length; i++) {
        doc.fillColor("#000").fontSize(8).font("Helvetica").text(String(vals[i] || "—"), cx + 4, y + 3, { width: cols[i] - 6 });
        cx += cols[i];
      }
      y += 14;
      doc.moveTo(x, y).lineTo(x + w, y).strokeColor("#e5e7eb").lineWidth(0.3).stroke();
    }
    return y + 4;
  }

  function pdfBudgetActualTable(doc, rows, x, y, w, color, redColor) {
    // Header
    doc.rect(x, y, w, 16).fill("#f0f7fb");
    const cols = [w * 0.28, w * 0.18, w * 0.18, w * 0.18, w * 0.18];
    const headers = ["Trade", "Budget", "Actual", "Forecast", "Variance"];
    let cx = x;
    for (let i = 0; i < headers.length; i++) {
      const align = i === 0 ? "left" : "right";
      doc.fillColor(color).fontSize(8).font("Helvetica-Bold")
        .text(headers[i], cx + 4, y + 4, { width: cols[i] - 6, align });
      cx += cols[i];
    }
    y += 16;

    const fmtN = n => n == null ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
    const over = new Set(["over"]);
    const watch = new Set(["watch"]);

    for (const row of rows) {
      cx = x;
      const vals = [
        row.name,
        fmtN(row.budget_amount),
        fmtN(row.actual_amount),
        fmtN(row.forecast_amount),
        fmtN(row.variance)
      ];
      for (let i = 0; i < vals.length; i++) {
        const align = i === 0 ? "left" : "right";
        let fc = "#000";
        if (i === 4) fc = over.has(row.status) ? redColor : watch.has(row.status) ? "#d97706" : "#059669";
        doc.fillColor(fc).fontSize(8).font(i === 4 ? "Helvetica-Bold" : "Helvetica")
          .text(String(vals[i] || "—"), cx + 4, y + 3, { width: cols[i] - 6, align });
        cx += cols[i];
      }
      y += 14;
      doc.moveTo(x, y).lineTo(x + w, y).strokeColor("#e5e7eb").lineWidth(0.3).stroke();
    }
    return y + 4;
  }

  function pdfFooter(doc, t, internal = false) {
    const W = doc.page.width;
    const M = 50;
    const footY = doc.page.height - 36;
    doc.moveTo(M, footY - 8).lineTo(W - M, footY - 8).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
    const left = `${t.company_name}  ·  ${t.company_abn}`;
    const right = internal ? "INTERNAL DOCUMENT — NOT FOR DISTRIBUTION" : t.company_email;
    doc.fillColor("#999").fontSize(7).font("Helvetica")
      .text(left, M, footY, { width: (W - M * 2) * 0.6 })
      .text(right, M, footY, { width: W - M * 2, align: "right" });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VARIATIONS  (Phase E)
  // ════════════════════════════════════════════════════════════════════════════

  // ── List variations ──────────────────────────────────────────────────────────
  app.get("/api/finance/jobs/:jobId/variations", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const { data, error } = await sb.from("job_variations")
      .select("*, trade_categories(name)")
      .eq("job_id", req.params.jobId)
      .order("variation_number");
    if (error) return res.status(500).json({ ok: false, error: translateDbError(error) });
    const variations = (data || []).map(v => ({
      ...v,
      trade_category_name: v.trade_categories?.name || null
    }));
    res.json({ ok: true, variations });
  });

  // ── Create variation (draft) ─────────────────────────────────────────────────
  app.post("/api/finance/jobs/:jobId/variations", requireAuth, async (req, res) => {
    const { jobId } = req.params;
    const { title, description, trade_category_id, cost_to_builder, amount_ex_gst, line_items, eot_days } = req.body || {};
    if (!title) return res.status(400).json({ ok: false, error: "title required" });

    if (amount_ex_gst != null && Number(amount_ex_gst) < 0) return res.status(400).json({ ok: false, error: "amount_ex_gst cannot be negative" });

    const sb = getServiceSupabase();
    let variation = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: last } = await sb.from("job_variations")
        .select("variation_number").eq("job_id", jobId)
        .order("variation_number", { ascending: false }).limit(1).maybeSingle();
      const variation_number = (last?.variation_number || 0) + 1;
      const { data, error } = await sb.from("job_variations").insert({
        job_id: jobId,
        variation_number,
        title,
        description: description || null,
        trade_category_id: trade_category_id || null,
        cost_to_builder: cost_to_builder != null ? Number(cost_to_builder) : null,
        amount_ex_gst: Number(amount_ex_gst || 0),
        line_items: line_items || [],
        eot_days: Number(eot_days || 0),
        status: "draft"
      }).select("*, trade_categories(name)").single();
      if (!error) { variation = data; break; }
      if (error.code !== "23505" || attempt === 2) return res.status(500).json({ ok: false, error: translateDbError(error) });
    }
    if (!variation) return res.status(500).json({ ok: false, error: "Failed to assign variation number" });
    res.json({ ok: true, variation: { ...variation, trade_category_name: variation.trade_categories?.name || null } });
  });

  // ── Buildxact recipes for quantity-based pricing ─────────────────────────────
  // Returns flattened line items from the active Buildxact estimate for this job.
  // Each item: { id, category, description, unit_cost, uom, suggested_qty }
  app.get("/api/finance/jobs/:jobId/variations/recipes", requireAuth, async (req, res) => {
    const { jobId } = req.params;
    if (!buildexactConfigured()) {
      return res.json({ ok: true, recipes: [], source: "none", message: "Buildxact not configured" });
    }
    const sb = getServiceSupabase();
    let buildexactJobId = null;
    const { data: job } = await sb.from("jobs").select("buildexact_job_id").eq("id", jobId).single();
    buildexactJobId = job?.buildexact_job_id;
    if (!buildexactJobId) {
      const { data: proj } = await sb.from("projects").select("buildexact_job_id").eq("job_id", jobId).maybeSingle();
      buildexactJobId = proj?.buildexact_job_id;
    }
    if (!buildexactJobId) {
      return res.json({ ok: true, recipes: [], source: "none", message: "No Buildxact job linked" });
    }
    try {
      const { estimate } = await pullBuildexactEstimate(buildexactJobId);
      const recipes = [];
      for (const cat of estimate.categories || []) {
        for (const item of cat.active_items || []) {
          if (!item.description || !(item.unit_cost > 0)) continue;
          recipes.push({
            id: item.id || item.code || `${cat.name}-${item.description}`.replace(/\s+/g, "-"),
            category: cat.name,
            description: item.description,
            unit_cost: Number(item.unit_cost || 0),
            uom: item.uom || "item",
            suggested_qty: Number(item.units || 1),
          });
        }
      }
      res.json({ ok: true, recipes, source: "buildxact" });
    } catch (e) {
      console.error("[variations/recipes]", e?.message);
      res.json({ ok: true, recipes: [], source: "error", message: "Could not load cost recipes." });
    }
  });

  // ── Update variation (draft only) ────────────────────────────────────────────
  app.put("/api/finance/jobs/:jobId/variations/:vid", requireAuth, async (req, res) => {
    const { vid } = req.params;
    const sb = getServiceSupabase();
    const { data: existing } = await sb.from("job_variations").select("status").eq("id", vid).single();
    if (!existing) return res.status(404).json({ ok: false, error: "Not found" });
    if (existing.status !== "draft") return res.status(400).json({ ok: false, error: "Only draft variations can be edited" });

    const allowed = ["title", "description", "trade_category_id", "cost_to_builder", "amount_ex_gst", "line_items", "eot_days", "variation_reference"];
    const updates = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (k in req.body) {
      updates[k] = ["cost_to_builder", "amount_ex_gst", "eot_days"].includes(k) && req.body[k] != null
        ? Number(req.body[k]) : req.body[k];
    }

    const { data, error } = await sb.from("job_variations")
      .update(updates).eq("id", vid).select("*, trade_categories(name)").single();
    if (error) return res.status(500).json({ ok: false, error: translateDbError(error) });
    res.json({ ok: true, variation: { ...data, trade_category_name: data.trade_categories?.name || null } });
  });

  // ── Send variation to client: PDF + email ────────────────────────────────────
  app.post("/api/finance/jobs/:jobId/variations/:vid/send", requireAuth, async (req, res) => {
    const { jobId, vid } = req.params;
    const { email_to, email_cc } = req.body || {};
    const sb = getServiceSupabase();

    const [varRes, jobRes] = await Promise.all([
      sb.from("job_variations").select("*, trade_categories(name)").eq("id", vid).single(),
      sb.from("jobs").select("address, client_name, original_contract_value, contract_value").eq("id", jobId).single()
    ]);
    if (!varRes.data) return res.status(404).json({ ok: false, error: "Variation not found" });
    const variation = { ...varRes.data, trade_category_name: varRes.data.trade_categories?.name || null };
    const job = jobRes.data || {};
    if (!["draft", "rejected"].includes(variation.status)) {
      return res.status(400).json({ ok: false, error: "Only draft or re-issued variations can be sent" });
    }

    const { buildVariationTokens } = await import("./docTokens.mjs");
    const tokens = buildVariationTokens(variation, job);
    const pdfBuffer = await generateVariationPdf(tokens);

    const sentDate = new Date().toISOString();
    const { data: updated, error: updErr } = await sb.from("job_variations")
      .update({ status: "sent_to_client", sent_date: sentDate, updated_at: sentDate })
      .eq("id", vid).select().single();
    if (updErr) return res.status(500).json({ ok: false, error: translateDbError(updErr) });

    let emailSent = false;
    let trackingId = null;
    if (email_to) {
      const fmtAud = n => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n || 0);
      const amountEx = Number(variation.amount_ex_gst || 0);
      const safeAddr = (job.address || "").replace(/[^a-zA-Z0-9]/g, "-");
      const { randomUUID } = await import("crypto");
      trackingId = randomUUID();
      const baseUrl = (process.env.APP_URL || "https://blueleafhub.com.au").replace(/\/$/, "");
      const pixelUrl = `${baseUrl}/api/track/email/${trackingId}`;
      try {
        const bodyText = [
          `Please find attached Variation ${variation.variation_number} for ${job.address}.`,
          ``,
          `Title: ${variation.title}`,
          ...(variation.description ? [`Description: ${variation.description}`, ``] : [``]),
          `Amount (ex GST): ${fmtAud(amountEx)}`,
          `GST: ${fmtAud(amountEx * 0.1)}`,
          `Total (inc GST): ${fmtAud(amountEx * 1.1)}`,
          ...(variation.eot_days ? [`Extension of time: ${variation.eot_days} days`, ``] : [``]),
          `To approve this variation, please reply to this email or contact us at accounts@blueleafbuilding.com.au.`,
          ``,
          `Blue Leaf Building`,
        ].join("\n");
        await sendPlainMail({
          to: email_to,
          cc: email_cc || undefined,
          subject: `Variation ${variation.variation_number} — ${job.address}`,
          text: bodyText,
          html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${bodyText}</pre><img src="${pixelUrl}" width="1" height="1" style="display:none" alt="">`,
          attachments: [{
            filename: `Variation-${variation.variation_number}-${safeAddr}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf"
          }]
        });
        emailSent = true;
        sb.from("email_delivery_events").insert({
          tracking_id: trackingId,
          resource_type: "variation",
          resource_id: vid,
          job_id: jobId,
          recipient_email: email_to,
          sent_at: new Date().toISOString(),
          open_count: 0
        }).then().catch(e => console.error("[variations] tracking insert:", e?.message));
      } catch (e) {
        console.error("[variations] email error:", e?.message);
      }
    }

    res.json({ ok: true, variation: updated, emailSent, tracking_id: trackingId, pdf_b64: pdfBuffer.toString("base64") });
  });

  // ── Sign variation (admin marks as signed after client approval) ─────────────
  // E6: contract_value is recalculated live in /summary — no stored update needed
  app.post("/api/finance/jobs/:jobId/variations/:vid/sign", requireAuth, async (req, res) => {
    const { jobId, vid } = req.params;
    const sb = getServiceSupabase();
    const { data: existing } = await sb.from("job_variations").select("status, amount_ex_gst").eq("id", vid).single();
    if (!existing) return res.status(404).json({ ok: false, error: "Not found" });
    if (existing.status !== "sent_to_client") {
      return res.status(400).json({ ok: false, error: "Only variations sent to client can be signed. Send the variation first." });
    }

    const signedDate = new Date().toISOString();
    const { data: variation, error } = await sb.from("job_variations")
      .update({ status: "signed", signed_date: signedDate, updated_at: signedDate })
      .eq("id", vid).select().single();
    if (error) return res.status(500).json({ ok: false, error: translateDbError(error) });

    // Update normalized_costs with variation amount
    if (variation.trade_category_id) {
      const { data: tradeCat } = await sb.from("trade_categories").select("name").eq("id", variation.trade_category_id).maybeSingle();
      await upsertNormalizedCost(sb, {
        jobId: variation.job_id,
        tradeCategoryId: variation.trade_category_id,
        tradeCategoryName: tradeCat?.name,
        field: "variation",
        amount: Number(variation.amount_ex_gst || 0),
      }).catch(e => console.warn("[sign] normalized_costs:", e.message));
    }

    res.json({ ok: true, variation });
  });

  // ── Reject variation ─────────────────────────────────────────────────────────
  app.post("/api/finance/jobs/:jobId/variations/:vid/reject", requireAuth, async (req, res) => {
    const { vid } = req.params;
    const { reason } = req.body || {};
    const sb = getServiceSupabase();
    const { data, error } = await sb.from("job_variations")
      .update({ status: "rejected", rejection_reason: reason || null, updated_at: new Date().toISOString() })
      .eq("id", vid).select().single();
    if (error) return res.status(500).json({ ok: false, error: translateDbError(error) });
    res.json({ ok: true, variation: data });
  });

  // ── Void variation ───────────────────────────────────────────────────────────
  app.post("/api/finance/jobs/:jobId/variations/:vid/void", requireAuth, async (req, res) => {
    const { vid } = req.params;
    const sb = getServiceSupabase();
    const { data, error } = await sb.from("job_variations")
      .update({ status: "void", updated_at: new Date().toISOString() })
      .eq("id", vid).select().single();
    if (error) return res.status(500).json({ ok: false, error: translateDbError(error) });
    res.json({ ok: true, variation: data });
  });

  // ── Variation PDF ─────────────────────────────────────────────────────────────
  async function generateVariationPdf(t) {
    const PDFDocument = require("pdfkit");
    const path = require("path");
    const logoPath = path.resolve("public/brand/logo-black.png");
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks = [];
      doc.on("data", c => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const PRI = "#006c9b";
      const W   = doc.page.width;
      const M   = 50;
      const CW  = W - M * 2;

      // ── Header ─────────────────────────────────────────────────────
      // Blue top accent bar
      doc.rect(0, 0, W, 4).fill(PRI);
      // Logo (left)
      try { doc.image(logoPath, M, 10, { width: 190 }); } catch (_) {
        doc.fillColor(PRI).fontSize(18).font("Helvetica-Bold").text("BLUE LEAF BUILDING", M, 18);
      }
      // Document type + metadata (right)
      doc.fillColor(PRI).fontSize(13).font("Helvetica-Bold")
        .text("VARIATION", M, 14, { align: "right", width: CW });
      doc.fillColor("#000").fontSize(10).font("Helvetica-Bold")
        .text(`No. ${t.variation_number}`, M, 32, { align: "right", width: CW });
      doc.fillColor("#555").fontSize(9).font("Helvetica")
        .text(`Date: ${t.variation_date}`, M, 46, { align: "right", width: CW });
      if (t.variation_reference) {
        doc.fillColor("#555").fontSize(9).font("Helvetica")
          .text(`Ref: ${t.variation_reference}`, M, 58, { align: "right", width: CW });
      }
      // Blue bottom accent bar
      doc.rect(0, 84, W, 2).fill(PRI);

      let y = 96;

      // Project block
      pdfSectionHeader(doc, "Project Details", M, y, CW, PRI); y += 22;
      const projRows = [
        ["Project",   t.project_name],
        ["Client",    t.client_name],
        ["Reference", t.variation_reference],
      ];
      y = pdfFieldGrid(doc, projRows, M, y, CW);
      y += 10;

      // Variation details
      pdfSectionHeader(doc, "Variation Details", M, y, CW, PRI); y += 22;
      doc.fillColor("#000").fontSize(10).font("Helvetica-Bold").text(t.variation_title, M, y); y += 16;
      if (t.variation_description) {
        doc.fillColor("#333").fontSize(9).font("Helvetica").text(t.variation_description, M, y, { width: CW });
        y += doc.heightOfString(t.variation_description, { width: CW }) + 10;
      }
      if (t.trade) {
        doc.fillColor("#555").fontSize(8).font("Helvetica").text(`Trade: ${t.trade}`, M, y); y += 14;
      }
      if (t.eot_days && t.eot_days !== "Nil") {
        doc.fillColor("#d97706").fontSize(8).font("Helvetica-Bold").text(`Extension of Time: ${t.eot_days}`, M, y); y += 14;
      }
      y += 4;

      // Line items (if any)
      if (Array.isArray(t._lineItems) && t._lineItems.length > 0) {
        pdfSectionHeader(doc, "Line Items", M, y, CW, PRI); y += 22;
        const cols = [CW * 0.45, CW * 0.15, CW * 0.2, CW * 0.2];
        const headers = ["Description", "Qty / UOM", "Unit Rate", "Total"];
        doc.rect(M, y, CW, 16).fill("#f0f7fb");
        let cx = M;
        for (let i = 0; i < headers.length; i++) {
          doc.fillColor(PRI).fontSize(8).font("Helvetica-Bold")
            .text(headers[i], cx + 4, y + 4, { width: cols[i] - 6, align: i > 0 ? "right" : "left" });
          cx += cols[i];
        }
        y += 16;
        const fmtN = n => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n || 0);
        for (const item of t._lineItems) {
          const qty  = Number(item.qty || item.quantity || 1);
          const rate = Number(item.unit_cost || item.rate || 0);
          const total = qty * rate;
          cx = M;
          const vals = [
            item.description || "—",
            `${qty} ${item.uom || ""}`.trim(),
            fmtN(rate),
            fmtN(total)
          ];
          for (let i = 0; i < vals.length; i++) {
            doc.fillColor("#000").fontSize(8).font("Helvetica")
              .text(vals[i], cx + 4, y + 3, { width: cols[i] - 6, align: i > 0 ? "right" : "left" });
            cx += cols[i];
          }
          y += 14;
          doc.moveTo(M, y).lineTo(M + CW, y).strokeColor("#e5e7eb").lineWidth(0.3).stroke();
        }
        y += 6;
      }

      // Amount summary
      pdfSectionHeader(doc, "Amount", M, y, CW, PRI); y += 22;
      const amountRows = [
        ["Variation Amount (ex GST)", t.amount_ex],
        ["GST (10%)",                 t.gst],
      ];
      y = pdfAmountTable(doc, amountRows, M, y, CW, PRI);
      doc.rect(M, y, CW, 26).fill(PRI);
      doc.fillColor("white").fontSize(11).font("Helvetica-Bold")
        .text("TOTAL (inc GST)", M + 10, y + 7)
        .text(t.amount_inc, M, y + 7, { align: "right", width: CW - 10 });
      y += 36;

      // Approval section
      if (y > doc.page.height - 120) { doc.addPage(); y = M; }
      pdfSectionHeader(doc, "Client Approval", M, y, CW, PRI); y += 22;
      doc.fillColor("#333").fontSize(9).font("Helvetica")
        .text("By signing below, the client approves this variation and authorises Blue Leaf Building to proceed with the additional works.", M, y, { width: CW });
      y += 30;
      doc.moveTo(M, y).lineTo(M + 200, y).strokeColor("#999").lineWidth(0.5).stroke();
      doc.fillColor("#555").fontSize(8).font("Helvetica").text("Client Signature", M, y + 4);
      doc.moveTo(M + 250, y).lineTo(M + 380, y).strokeColor("#999").lineWidth(0.5).stroke();
      doc.fillColor("#555").fontSize(8).font("Helvetica").text("Date", M + 250, y + 4);

      pdfFooter(doc, t);
      doc.end();
    });
  }

  // ── Cashflow forecast (next 3 months) ─────────────────────────────────────
  app.get("/api/finance/jobs/:jobId/cashflow", requireAuth, async (req, res) => {
    const { jobId } = req.params;
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeMonthsOut = new Date(today);
    threeMonthsOut.setMonth(threeMonthsOut.getMonth() + 3);

    const monthKey = (d) => {
      const dt = new Date(d);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    };
    const monthLabel = (key) => {
      const [y, m] = key.split("-").map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString("en-AU", { month: "short", year: "numeric" });
    };

    const bucketMonths = [];
    for (let i = 0; i < 3; i++) {
      bucketMonths.push(monthKey(new Date(today.getFullYear(), today.getMonth() + i, 1)));
    }
    const currentMonth = bucketMonths[0];
    const bucketMap = new Map(
      bucketMonths.map((month) => [month, { label: monthLabel(month), month, inflows: [], outflows: [] }])
    );

    const [claimsRes, invoicesRes, variationsRes] = await Promise.all([
      sb.from("progress_claims")
        .select("claim_number, amount_ex_gst, due_date, status, description, progress_claim_payments(payment_amount)")
        .eq("job_id", jobId)
        .not("status", "in", '("draft","void")')
        .not("due_date", "is", null),
      sb.from("financial_documents")
        .select("supplier_name, amount_ex_gst, created_at")
        .eq("job_id", jobId)
        .eq("status", "pending_approval"),
      sb.from("job_variations")
        .select("title, amount_ex_gst, sent_date")
        .eq("job_id", jobId)
        .eq("status", "sent_to_client"),
    ]);

    if (claimsRes.error) return res.status(500).json({ ok: false, error: translateDbError(claimsRes.error) });
    if (invoicesRes.error) return res.status(500).json({ ok: false, error: translateDbError(invoicesRes.error) });
    if (variationsRes.error) return res.status(500).json({ ok: false, error: translateDbError(variationsRes.error) });

    let overdueClaimsCount = 0;

    for (const claim of claimsRes.data || []) {
      const paid = (claim.progress_claim_payments || []).reduce(
        (s, p) => s + Number(p.payment_amount || 0), 0
      );
      const unpaid = Number(claim.amount_ex_gst || 0) - paid;
      if (unpaid <= 0.01) continue;

      const due = new Date(claim.due_date);
      due.setHours(0, 0, 0, 0);
      const desc =
        claim.description?.trim() ||
        `Stage ${claim.claim_number} claim`;

      let targetMonth;
      if (due < today) {
        targetMonth = currentMonth;
        overdueClaimsCount++;
      } else if (due > threeMonthsOut) {
        continue;
      } else {
        targetMonth = monthKey(due);
      }

      const bucket = bucketMap.get(targetMonth);
      if (!bucket) continue;

      bucket.inflows.push({
        type: "claim",
        description: desc,
        amount_ex_gst: Math.round(unpaid * 100) / 100,
        due_date: claim.due_date,
        status: claim.status,
      });
    }

    for (const inv of invoicesRes.data || []) {
      const created = inv.created_at ? new Date(inv.created_at) : null;
      if (!created || Number.isNaN(created.getTime())) continue;
      const payDate = new Date(created);
      payDate.setDate(payDate.getDate() + 14);
      payDate.setHours(0, 0, 0, 0);
      if (payDate > threeMonthsOut) continue;

      let targetMonth = monthKey(payDate);
      if (!bucketMap.has(targetMonth)) {
        if (payDate < today) targetMonth = currentMonth;
        else continue;
      }

      const bucket = bucketMap.get(targetMonth);
      if (!bucket) continue;

      bucket.outflows.push({
        type: "invoice",
        description: inv.supplier_name || "Supplier invoice",
        amount_ex_gst: Math.round(Number(inv.amount_ex_gst || 0) * 100) / 100,
      });
    }

    let cumulative = 0;
    const buckets = bucketMonths.map((month) => {
      const b = bucketMap.get(month);
      const inTotal = b.inflows.reduce((s, x) => s + x.amount_ex_gst, 0);
      const outTotal = b.outflows.reduce((s, x) => s + x.amount_ex_gst, 0);
      const net = Math.round((inTotal - outTotal) * 100) / 100;
      cumulative = Math.round((cumulative + net) * 100) / 100;
      return {
        label: b.label,
        month: b.month,
        inflows: b.inflows,
        outflows: b.outflows,
        net_inflow: net,
        cumulative_net: cumulative,
      };
    });

    const total_expected_in = Math.round(
      buckets.reduce((s, b) => s + b.inflows.reduce((t, x) => t + x.amount_ex_gst, 0), 0) * 100
    ) / 100;
    const total_expected_out = Math.round(
      buckets.reduce((s, b) => s + b.outflows.reduce((t, x) => t + x.amount_ex_gst, 0), 0) * 100
    ) / 100;

    res.json({
      ok: true,
      buckets,
      total_expected_in,
      total_expected_out,
      overdue_claims_count: overdueClaimsCount,
    });
  });

  // ── Requires Action ───────────────────────────────────────────────────────
  app.get("/api/finance/jobs/:jobId/requires-action", requireAuth, async (req, res) => {
    const { jobId } = req.params;
    const sb = getServiceSupabase();
    const [invoicesRes, claimsRes] = await Promise.all([
      sb.from("financial_documents")
        .select("id, supplier_name, amount_ex_gst, ai_job_match_confidence, ai_trade_confidence, trade_category_id, status, created_at")
        .eq("job_id", jobId)
        .eq("status", "pending_approval")
        .order("created_at", { ascending: true })
        .limit(5),
      sb.from("progress_claims")
        .select("id, claim_number, amount_ex_gst, status, due_date, issued_date")
        .eq("job_id", jobId)
        .eq("status", "overdue")
        .order("due_date", { ascending: true })
        .limit(5),
    ]);
    res.json({
      ok: true,
      pending_invoices: invoicesRes.data || [],
      overdue_claims: claimsRes.data || [],
    });
  });

  // ── Migrate progress_billed → progress_claims ─────────────────────────────
  app.post("/api/finance/jobs/:jobId/migrate-progress-billed", requireAuth, requireRole("admin"), async (req, res) => {
    const { jobId } = req.params;
    const sb = getServiceSupabase();

    // Check if already migrated
    const { data: existing } = await sb.from("progress_claims").select("id").eq("job_id", jobId).limit(1);
    if (existing?.length) return res.json({ ok: true, skipped: true, reason: "Claims already exist for this job" });

    const { data: job } = await sb.from("jobs").select("progress_billed, contract_value, original_contract_value").eq("id", jobId).single();
    if (!job?.progress_billed || Number(job.progress_billed) <= 0) {
      return res.json({ ok: true, skipped: true, reason: "No progress_billed value to migrate" });
    }

    const amount = Number(job.progress_billed);
    const { data: claim, error } = await sb.from("progress_claims").insert({
      job_id: jobId,
      claim_number: 1,
      stage: "custom",
      description: "Migrated from legacy progress_billed field",
      amount_ex_gst: amount,
      cumulative_claimed: amount,
      status: "paid",
      issued_date: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single();

    if (error) return res.status(500).json({ ok: false, error: translateDbError(error) });
    res.json({ ok: true, migrated: true, claim });
  });

  // ── First-Friday WIPAA reminder (checked on each finance request) ──────────
  let lastWipaaReminderDate = null;

  function isFirstFriday(date = new Date()) {
    if (date.getDay() !== 5) return false; // not Friday
    return date.getDate() <= 7;             // first Friday = within first 7 days of month
  }

  async function sendWipaaReminders() {
    const sb = getServiceSupabase();
    const today = new Date().toISOString().slice(0, 10);
    if (lastWipaaReminderDate === today) return; // already ran today
    if (!isFirstFriday()) return;
    lastWipaaReminderDate = today;

    // Get all active (under-construction) jobs with no WIPAA review in last 30 days.
    // jobs.status CHECK is ('tendering','won','lost','archived') — a job under contract/
    // construction is 'won'. The old filter used active/in_progress/construction, none of
    // which are valid, so this always returned empty and the reminder never sent.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: jobs } = await sb.from("jobs")
      .select("id, address, last_wipaa_review_date")
      .eq("status", "won")
      .or(`last_wipaa_review_date.is.null,last_wipaa_review_date.lt.${thirtyDaysAgo}`);

    if (!jobs?.length) return;

    // Admin emails live on user_profiles directly (auth.users is not queryable via PostgREST).
    const { data: admins } = await sb.from("user_profiles")
      .select("email").eq("role", "admin").eq("is_active", true);

    // Send one summary email
    const jobList = jobs.map(j => `• ${j.address} (last review: ${j.last_wipaa_review_date || "never"})`).join("\n");
    try {
      await sendPlainMail({
        to: (admins || []).map(u => u.email).filter(Boolean).join(", ") || "accounts@blueleafbuilding.com.au",
        subject: `WIPAA Review Due — ${jobs.length} job${jobs.length > 1 ? "s" : ""} (${today})`,
        text: `Monthly WIPAA review is due for the following jobs:\n\n${jobList}\n\nLogin to Blue Leaf Hub to complete each review.\n${(process.env.APP_URL || "https://blueleafhub.com.au").replace(/\/$/, "")}/finance/jobs`,
      });
    } catch (e) {
      console.error("[WIPAA reminder] email failed:", e.message);
    }
  }

  // Hook into the auth middleware so it fires on the first finance request each first-Friday
  app.use("/api/finance", (_req, _res, next) => { sendWipaaReminders().catch(console.error); next(); });
}
