/**
 * projectInsights.mjs
 * Blue Leaf Building — AI-powered project insight generation
 *
 * Rule: code computes every number and fires every threshold check.
 *       Haiku only writes the human-readable title + body for threshold breaches.
 *       Haiku is NEVER used to decide whether an insight is worth creating.
 */

import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { callAI } from "./aiGateway.mjs";
import { config as dotenvConfig } from "dotenv";

const { parsed: _env = {} } = dotenvConfig();
const _apiKey = process.env.ANTHROPIC_API_KEY?.trim() || _env.ANTHROPIC_API_KEY?.trim();

const HAIKU_MODEL = "claude-haiku-4-5";
const INSIGHT_EXPIRES_DAYS = 30;

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n) {
  return n != null && Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function dataHash(obj) {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 32);
}

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function daysBetween(dateA, dateB) {
  if (!dateA || !dateB) return null;
  return Math.round((new Date(dateB) - new Date(dateA)) / 86400000);
}

// ── generateInsight — Haiku text generation ───────────────────────────────────

const INSIGHT_SYSTEM = "You are a construction project analyst writing terse, factual alerts for a residential building company's project management system. Write as if briefing a senior project manager: concrete numbers, no filler phrases, no 'It appears that', no 'Please note'. Always include the key number that triggered the alert. Keep title under 50 chars. Keep body under 180 chars and max 2 sentences.";

/**
 * Generate a human-readable insight title + body using Claude Haiku.
 * Uses prompt caching on the system prompt.
 * NEVER throws — always returns a fallback if Haiku fails.
 *
 * @param {object} deltaJson  - structured data that triggered this insight
 * @param {string} insightType
 * @param {string} [apiKey]
 * @returns {Promise<{title: string, body: string}>}
 */
export async function generateInsight(deltaJson, insightType, apiKey) {
  const key = apiKey || _apiKey;
  if (!key) return { title: "Project insight", body: "A threshold was breached — review in Command Centre." };

  try {
    const client = new Anthropic({ apiKey: key, maxRetries: 1 });
    const resp = await callAI(client,
      {
        model: HAIKU_MODEL,
        max_tokens: 256,
        system: [{ type: "text", text: INSIGHT_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          content: `${JSON.stringify(deltaJson, null, 2)}\n\nInsight type: ${insightType}\n\nReturn JSON only: {"title": "...", "body": "..."}`,
        }],
      },
      { module: "projectInsights" },
      { headers: { "anthropic-beta": "prompt-caching-2024-07-31" } }
    );

    const raw = resp.content.find(b => b.type === "text")?.text?.trim() || "";
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(jsonStr);
    if (parsed.title && parsed.body) return { title: String(parsed.title).slice(0, 50), body: String(parsed.body).slice(0, 180) };
  } catch {
    // Intentional: never throw from generateInsight
  }
  return { title: "Project insight", body: "A threshold was breached — review in Command Centre." };
}

// ── getJobInsights ────────────────────────────────────────────────────────────

/**
 * Fetch recent insights for a job.
 * @param {string} jobId
 * @param {object} sb             - Supabase service client
 * @param {object} [opts]
 * @param {number} [opts.limit=5]
 * @param {boolean} [opts.dismissedToo=false]
 * @returns {Promise<Array>}
 */
export async function getJobInsights(jobId, sb, { limit = 5, dismissedToo = false } = {}) {
  if (!sb) return [];
  let q = sb.from("cost_intelligence_insights")
    .select("id, insight_type, severity, title, body, trigger_type, generated_at, is_dismissed, supporting_data")
    .eq("job_id", jobId)
    .order("generated_at", { ascending: false })
    .limit(limit);
  if (!dismissedToo) q = q.eq("is_dismissed", false);
  const { data, error } = await q;
  if (error) {
    console.warn("[projectInsights] getJobInsights failed:", error.message);
    return [];
  }
  return data || [];
}

// ── checkProjectInsights ──────────────────────────────────────────────────────

/**
 * Evaluate threshold conditions for a job and generate an AI insight if a threshold is breached.
 * All arithmetic is done here in code. Haiku only writes title + body.
 * Fire-and-forget — callers use .catch(e => console.warn(...))
 *
 * @param {string} jobId
 * @param {string} triggerType  - 'invoice_approved' | 'variation_signed' | 'schedule_update' | 'nps_submitted'
 * @param {object} sb           - Supabase service client
 * @param {string} [apiKey]
 * @param {object} [extras]     - trigger-specific data ({ taskId, projectId } | { score, comment })
 */
export async function checkProjectInsights(jobId, triggerType, sb, apiKey, extras = {}) {
  if (!sb) return;

  switch (triggerType) {
    case "invoice_approved":  return _checkInvoiceApproved(jobId, sb, apiKey);
    case "variation_signed":  return _checkVariationSigned(jobId, sb, apiKey);
    case "schedule_update":   return _checkScheduleUpdate(jobId, sb, apiKey, extras);
    case "nps_submitted":     return _checkNpsSubmitted(jobId, sb, apiKey, extras);
    default:
      console.warn("[projectInsights] Unknown triggerType:", triggerType);
  }
}

// ── invoice_approved ──────────────────────────────────────────────────────────

async function _checkInvoiceApproved(jobId, sb, apiKey) {
  // 1. Parallel fetch
  const [jobRes, docsRes, budgetsRes, costsRes, prevInsightRes] = await Promise.all([
    sb.from("jobs")
      .select("id, address, original_contract_value, contract_value, target_margin_pct, forecast_total_cost")
      .eq("id", jobId).maybeSingle(),
    sb.from("financial_documents")
      .select("amount_ex_gst, trade_category_id")
      .eq("job_id", jobId)
      .in("status", ["approved", "filed", "xero_synced"])
      .not("amount_ex_gst", "is", null),
    sb.from("job_budgets")
      .select("trade_category_id, budget_amount, trade_categories(name)")
      .eq("job_id", jobId),
    sb.from("normalized_costs")
      .select("trade_category_id, actual_amount")
      .eq("job_id", jobId),
    sb.from("cost_intelligence_insights")
      .select("supporting_data")
      .eq("job_id", jobId)
      .eq("trigger_type", "invoice_approved")
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!jobRes.data) return;
  const job = jobRes.data;
  const docs = docsRes.data || [];
  const budgets = budgetsRes.data || [];
  const costs = costsRes.data || [];

  // 2. Compute working margin in code
  const contractValue = Number(job.contract_value || job.original_contract_value || 0);
  const actualCostsSum = docs.reduce((s, d) => s + Number(d.amount_ex_gst || 0), 0);
  const workingMargin = contractValue > 0 ? ((contractValue - actualCostsSum) / contractValue) * 100 : null;

  // Build per-trade variance
  const budgetMap = new Map(budgets.map(b => [b.trade_category_id, { budget: Number(b.budget_amount || 0), name: b.trade_categories?.name || "" }]));
  const costMap   = new Map(costs.map(c => [c.trade_category_id, Number(c.actual_amount || 0)]));

  let worstTrade = null;
  let worstPct = 0;
  let bestTrade = null;
  let bestPct = 0;

  for (const [tradeId, { budget, name }] of budgetMap.entries()) {
    const actual = costMap.get(tradeId);
    if (actual == null || budget <= 0) continue;
    const pct = ((actual - budget) / budget) * 100;
    if (pct > worstPct) { worstPct = pct; worstTrade = { id: tradeId, name, budget, actual, pct }; }
    if (pct < bestPct)  { bestPct = pct;  bestTrade  = { id: tradeId, name, budget, actual, pct }; }
  }

  // 3. Previous margin for drop calculation
  const previousMarginPct = prevInsightRes.data?.supporting_data?.working_margin_pct ?? null;
  const marginDropPct = previousMarginPct != null && workingMargin != null
    ? previousMarginPct - workingMargin
    : null;

  // 4. Threshold gate — ALL CODE, no AI
  let severity = null;
  let insightType = null;
  let thresholdMet = null;

  if (marginDropPct != null && marginDropPct > 1.5) {
    severity = "alert"; insightType = "budget_risk"; thresholdMet = `margin_drop>${round2(marginDropPct)}%`;
  } else if (marginDropPct != null && marginDropPct > 1.0) {
    severity = "warning"; insightType = "budget_risk"; thresholdMet = `margin_drop>${round2(marginDropPct)}%`;
  } else if (worstTrade && worstTrade.pct > 25) {
    severity = "alert"; insightType = "overrun_pattern"; thresholdMet = `trade_over_budget>${round2(worstTrade.pct)}%`;
  } else if (worstTrade && worstTrade.pct > 15) {
    severity = "warning"; insightType = "overrun_pattern"; thresholdMet = `trade_over_budget>${round2(worstTrade.pct)}%`;
  } else if (bestTrade && bestTrade.pct < -8) {
    severity = "info"; insightType = "benchmark"; thresholdMet = `trade_under_budget<${round2(bestTrade.pct)}%`;
  }

  if (!severity) return; // No threshold met — skip, no AI call

  // 5. Build deltaJson
  const offendingTrade = insightType === "benchmark" ? bestTrade : worstTrade;
  const deltaJson = {
    trigger: "invoice_approved",
    job_address: job.address,
    working_margin_pct: round2(workingMargin),
    previous_margin_pct: round2(previousMarginPct),
    margin_drop_pct: round2(marginDropPct),
    target_margin_pct: job.target_margin_pct,
    offending_trade: offendingTrade?.name || null,
    trade_budget: offendingTrade ? round2(offendingTrade.budget) : null,
    trade_actual: offendingTrade ? round2(offendingTrade.actual) : null,
    trade_variance_pct: offendingTrade ? round2(offendingTrade.pct) : null,
  };

  await _createInsight({ jobId, insightType, severity, thresholdMet, triggerType: "invoice_approved", deltaJson, sb, apiKey });
}

// ── variation_signed ──────────────────────────────────────────────────────────

async function _checkVariationSigned(jobId, sb, apiKey) {
  const [jobRes, docsRes] = await Promise.all([
    sb.from("jobs")
      .select("id, address, contract_value, original_contract_value, target_margin_pct")
      .eq("id", jobId).maybeSingle(),
    sb.from("financial_documents")
      .select("amount_ex_gst")
      .eq("job_id", jobId)
      .in("status", ["approved", "filed", "xero_synced"])
      .not("amount_ex_gst", "is", null),
  ]);

  if (!jobRes.data) return;
  const job = jobRes.data;
  const contractValue = Number(job.contract_value || job.original_contract_value || 0);
  const actualCosts = (docsRes.data || []).reduce((s, d) => s + Number(d.amount_ex_gst || 0), 0);
  const workingMargin = contractValue > 0 ? ((contractValue - actualCosts) / contractValue) * 100 : null;

  // Get the most recently signed variation
  const { data: latestVar } = await sb.from("job_variations")
    .select("title, amount_ex_gst, eot_days")
    .eq("job_id", jobId)
    .eq("status", "signed")
    .order("signed_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // F4 — Skip Haiku insight for low-value variations (noise reduction)
  // Threshold is configurable via env var; default $2,000 ex-GST
  const VARIATION_INSIGHT_THRESHOLD =
    Number(process.env.VARIATION_INSIGHT_THRESHOLD_AUD ?? 2000);
  const variationAmount = Number(latestVar?.amount_ex_gst ?? 0);
  const hasScheduleImpact = Number(latestVar?.eot_days ?? 0) > 0;
  if (variationAmount < VARIATION_INSIGHT_THRESHOLD && !hasScheduleImpact) {
    // Low-value variation with no schedule impact — no insight needed
    return;
  }

  const deltaJson = {
    trigger: "variation_signed",
    job_address: job.address,
    variation_title: latestVar?.title || null,
    variation_amount_ex_gst: round2(Number(latestVar?.amount_ex_gst || 0)),
    new_contract_value: round2(contractValue),
    working_margin_pct: round2(workingMargin),
    target_margin_pct: job.target_margin_pct,
  };

  // variation_signed is always info — lightweight context, no threshold gate
  await _createInsight({ jobId, insightType: "benchmark", severity: "info", thresholdMet: "variation_signed", triggerType: "variation_signed", deltaJson, sb, apiKey });
}

// ── schedule_update ───────────────────────────────────────────────────────────

async function _checkScheduleUpdate(jobId, sb, apiKey, extras) {
  const { taskId, projectId } = extras;
  if (!taskId || !projectId) return;

  const [taskRes, allTasksRes] = await Promise.all([
    sb.from("schedule_tasks")
      .select("id, name, end_date, baseline_end_date, is_critical_path, project_id")
      .eq("id", taskId).maybeSingle(),
    sb.from("schedule_tasks")
      .select("end_date, baseline_end_date, is_critical_path")
      .eq("project_id", projectId)
      .is("deleted_at", null),
  ]);

  const task = taskRes.data;
  if (!task || !task.baseline_end_date) return;

  const slipDays = daysBetween(task.baseline_end_date, task.end_date);
  if (slipDays == null) return;

  // Threshold gate — code only
  let severity = null;
  let thresholdMet = null;

  if (slipDays > 14 && task.is_critical_path) {
    severity = "alert"; thresholdMet = `critical_path_slip_${slipDays}d`;
  } else if (slipDays > 7 && task.is_critical_path) {
    severity = "warning"; thresholdMet = `critical_path_slip_${slipDays}d`;
  } else if (slipDays > 14 && !task.is_critical_path) {
    severity = "info"; thresholdMet = `task_slip_${slipDays}d`;
  } else {
    return;
  }

  // Latest end date across all tasks (approximate project end)
  const allTasks = allTasksRes.data || [];
  const latestEndDate = allTasks.reduce((latest, t) => {
    if (!t.end_date) return latest;
    return !latest || t.end_date > latest ? t.end_date : latest;
  }, null);
  const baselineEndDate = allTasks.reduce((latest, t) => {
    if (!t.baseline_end_date) return latest;
    return !latest || t.baseline_end_date > latest ? t.baseline_end_date : latest;
  }, null);

  const deltaJson = {
    trigger: "schedule_update",
    task_name: task.name,
    baseline_end_date: task.baseline_end_date,
    current_end_date: task.end_date,
    slip_days: slipDays,
    is_critical_path: task.is_critical_path,
    project_latest_end: latestEndDate,
    project_baseline_end: baselineEndDate,
  };

  await _createInsight({ jobId, insightType: "benchmark", severity, thresholdMet, triggerType: "schedule_update", deltaJson, sb, apiKey });
}

// ── nps_submitted ─────────────────────────────────────────────────────────────

async function _checkNpsSubmitted(jobId, sb, apiKey, extras) {
  const { score, comment } = extras;
  if (score == null) return;

  // Threshold gate — code only
  let severity = null;
  let thresholdMet = null;
  if (score <= 5) {
    severity = "alert"; thresholdMet = `nps_score_${score}`;
  } else if (score <= 6) {
    severity = "warning"; thresholdMet = `nps_score_${score}`;
  } else {
    return;
  }

  // Fetch recent NPS for context
  const [jobRes, recentNpsRes] = await Promise.all([
    sb.from("jobs").select("address").eq("id", jobId).maybeSingle(),
    sb.from("job_nps_scores").select("score").eq("job_id", jobId).order("created_at", { ascending: false }).limit(4),
  ]);

  const recentScores = (recentNpsRes.data || []).map(r => r.score);

  const deltaJson = {
    trigger: "nps_low",
    job_address: jobRes.data?.address || null,
    score,
    comment: comment || null,
    recent_scores: recentScores,
  };

  await _createInsight({ jobId, insightType: "benchmark", severity, thresholdMet, triggerType: "nps_submitted", deltaJson, sb, apiKey });
}

// ── Internal: dedup + insert ──────────────────────────────────────────────────

async function _createInsight({ jobId, insightType, severity, thresholdMet, triggerType, deltaJson, sb, apiKey }) {
  const hash = dataHash(deltaJson);

  // Dedup check — never call Haiku if same delta already processed
  const { data: existing } = await sb.from("cost_intelligence_insights")
    .select("id")
    .eq("job_id", jobId)
    .eq("data_hash", hash)
    .maybeSingle();

  if (existing) return; // Already processed this exact state

  const { title, body } = await generateInsight(deltaJson, insightType, apiKey);

  const { error } = await sb.from("cost_intelligence_insights").insert({
    job_id:        jobId,
    insight_type:  insightType,
    severity,
    title,
    body,
    supporting_data: deltaJson,
    trigger_type:  triggerType,
    threshold_met: thresholdMet,
    data_hash:     hash,
    expires_at:    daysFromNow(INSIGHT_EXPIRES_DAYS),
  });

  if (error) {
    // Unique constraint violation means concurrent insert — not an error
    if (!error.message?.includes("unique")) {
      console.warn("[projectInsights] insert failed:", error.message);
    }
  }
}
