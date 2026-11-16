/**
 * aiModels.mjs — which Claude model each AI task uses, and what to do when a model isn't available.
 *
 * Every Anthropic call in the Hub goes through this file (createForTask / streamForTask), and each call names a task.
 * scripts/tests/ai-models-migration.test.mjs fails the build if a call site creates its own client, calls the SDK
 * directly, hard-codes a model id or reads CLAUDE_MODEL.
 *
 * Why this exists: Blueprint was hard-pinned to one model by a whitelist that ignored the environment, so when the
 * production API key lost access to it every call failed with a generic error and config couldn't switch it off
 * (handover, Nov 2026). Then claude-sonnet-4-5, which most modules reached through the shared CLAUDE_MODEL, was
 * deprecated with retirement on 2026-11-30. Now:
 *
 *   - Each task names its own model, read from its own env var, with a default matched to the job and its token cost.
 *     The shared CLAUDE_MODEL is no longer read by anything (a leftover value is reported on /api/blueprint/health).
 *   - A request is adapted to the model it is sent to (newer models reject `temperature` and forced tool choice; older
 *     ones reject `effort`), so switching a model in the environment can't break the request shape.
 *   - If a model is refused for this key (not found / no permission / a request it can't accept), the same request is
 *     retried once on the task's fallback model, the refusal is logged, and that model is skipped for a while so later
 *     calls don't pay for a failed attempt first. Rate limits, billing and authentication errors never fall back:
 *     another model wouldn't fix them.
 *   - If a model declines one request (HTTP 200, stop_reason "refusal"), that request is retried once on the fallback
 *     model. The model is not skipped afterwards: a decline is about the request, not the key.
 *
 * Env vars: the model for a task is AI_MODEL_<TASK> (for example AI_MODEL_SALES_TRANSCRIPT); the older names
 * BLUEPRINT_MODEL, BLUEPRINT_REVIEW_MODEL and DOC_PROOFREAD_MODEL still work. The effort level is AI_EFFORT_<TASK>
 * (low | medium | high | xhigh | max; ignored by models that don't take effort). The fallback for every task is
 * AI_FALLBACK_MODEL (default claude-haiku-4-5-20251001, the model production is known to reach), with the older
 * per-task overrides BLUEPRINT_FALLBACK_MODEL and DOC_PROOFREAD_FALLBACK_MODEL.
 *
 * Defaults (Nov 2026): Haiku 5.5 ($0.10 / $0.50 per million tokens) for extraction, classification and short internal
 * text; Sonnet 5.5 ($2 / $10) for reasoning and for writing that leaves the business. Effort "low" everywhere except
 * the cost-insights cron (numbers to compare: "medium"). The full table is TASKS below and docs/deployment/AI_MODELS_ON_RAILWAY.md.
 */
import Anthropic from "@anthropic-ai/sdk";
import { config as dotenvConfig } from "dotenv";
import { callAI, wrapStream } from "./aiGateway.mjs";

const { parsed: _env = {} } = dotenvConfig();
/** An env value, from the process first, then the .env file (a shell can export an empty value: CLAUDE.md). */
const envVal = (name) => (process.env[name] || "").trim() || (_env[name] || "").trim();
const firstEnv = (names) => names.map(envVal).find(Boolean) || "";

export const DEFAULT_FALLBACK_MODEL = "claude-haiku-4-5-20251001";
export const SONNET = "claude-sonnet-5-5";
export const HAIKU = "claude-haiku-5-5";
/** The API key, read the same way (process first, then .env). */
export const anthropicApiKey = () => envVal("ANTHROPIC_API_KEY");

/**
 * One entry per AI task: its default model and effort, the older env names it still honours, and where it is used.
 * `legacyEnv` / `legacyFallbackEnv` keep env names that were set before this table existed.
 */
const TASKS = {
  // Blueprint (sales coaching chat) — server/lib/blueprintRoutes.mjs, src/blueprint/
  blueprint_chat:            { model: SONNET, effort: "low", legacyEnv: ["BLUEPRINT_MODEL"], legacyFallbackEnv: ["BLUEPRINT_FALLBACK_MODEL"], use: "Blueprint chat with Hub tools" },
  blueprint_utility:         { model: SONNET, effort: "low", legacyEnv: ["BLUEPRINT_MODEL"], legacyFallbackEnv: ["BLUEPRINT_FALLBACK_MODEL"], use: "Blueprint knowledge formatting, SOP drafts" },
  blueprint_document_review: { model: SONNET, effort: "low", legacyEnv: ["BLUEPRINT_REVIEW_MODEL"], use: "Blueprint QC of an uploaded proposal/quote against the APB standard" },
  // Master Register documents — server/lib/documentProofread.mjs
  document_proofread:        { model: HAIKU, effort: "low", legacyEnv: ["DOC_PROOFREAD_MODEL"], legacyFallbackEnv: ["DOC_PROOFREAD_FALLBACK_MODEL"], use: "Check wording on a document preview" },
  // Sales — server/lib/salesRoutes.mjs
  sales_transcript:          { model: SONNET, effort: "low", use: "Analyse a meeting transcript into lead updates (APB qualifying)" },
  // Tendering / RFQ — server/dev-api.mjs, server/lib/module4Routes.mjs, server/lib/module5Routes.mjs
  rfq_tender_extract:        { model: SONNET, effort: "low", use: "Tender PDF → trade scopes (/api/rfq/extract)" },
  quote_pdf_extract:         { model: HAIKU, effort: "low", use: "Totals from a subcontractor quote PDF (quote inbox)" },
  subcontractor_lookup:      { model: SONNET, effort: "low", use: "Web-search a subcontractor's contact details" },
  tender_email_draft:        { model: SONNET, effort: "low", use: "Draft a follow-up email to a subcontractor" },
  fee_proposal_parse:        { model: SONNET, effort: "low", use: "Buildxact estimate PDF → fee proposal categories" },
  // Scheduling / site — server/lib/scheduleClaudePlan.mjs, scheduleRoutes.mjs, siteDiaryRoutes.mjs, supervisorRoutes.mjs, voiceTasks.mjs
  schedule_generate:         { model: SONNET, effort: "low", use: "Generate a build programme from estimate categories" },
  schedule_analysis:         { model: SONNET, effort: "low", use: "Critical path / sequencing analysis of a schedule" },
  schedule_task_advice:      { model: HAIKU, effort: "low", use: "Short scheduling tips for one task" },
  site_diary_structure:      { model: HAIKU, effort: "low", use: "Site diary transcript → structured entry" },
  supervisor_voice:          { model: HAIKU, effort: "low", use: "Supervisor voice memo → diary / task updates" },
  voice_tasks:               { model: HAIKU, effort: "low", use: "Site walk-through transcript → draft tasks" },
  // Cost intelligence / insights — server/lib/costIntelligenceRoutes.mjs, server/dev-api.mjs, projectInsights.mjs
  cost_plan_metrics:         { model: SONNET, effort: "low", use: "Read floor areas and features from a plan PDF" },
  cost_insights:             { model: HAIKU, effort: "medium", use: "Nightly cost-insights cron over active jobs" },
  project_insight:           { model: HAIKU, effort: "low", use: "Title + body for a project threshold alert" },
  // Finance — server/lib/financeRoutes.mjs
  invoice_extract:           { model: HAIKU, effort: "low", use: "Invoice / receipt OCR (one call per document)" },
  invoice_classify:          { model: HAIKU, effort: "low", use: "Invoice trade category; job match when fuzzy matching can't decide" },
  // Procurement — server/lib/procurementAiService.mjs (drafts only, never sent)
  procurement_draft:         { model: SONNET, effort: "low", use: "Draft a supplier quote request / order email" },
  procurement_summary:       { model: HAIKU, effort: "low", use: "Supplier-reply summary, client reminders, weekly summary, delay note" },
  // Marketing — server/lib/marketingAgent.mjs, marketingRoutes.mjs, marketingMedia.mjs, marketingIntelligenceRoutes.mjs,
  //             marketingLibraryInboxRoutes.mjs, videoIntelligence.mjs
  marketing_content:         { model: SONNET, effort: "low", use: "Content Studio copy, calendar autofill, video captions" },
  marketing_vision:          { model: SONNET, effort: "low", use: "Photo analysis and drone-frame analysis" },
  marketing_seo_brief:       { model: SONNET, effort: "low", use: "SEO content brief for a website page" },
  marketing_insights:        { model: HAIKU, effort: "low", use: "Weekly summary, website-question scan, strategy suggestions" },
  marketing_photo_sort:      { model: HAIKU, effort: "low", use: "Sort an inbox photo into a library category" },
  marketing_frame_score:     { model: HAIKU, effort: "low", use: "Score video frames for clip selection" },
};

export const AI_TASKS = Object.freeze(Object.keys(TASKS));
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const taskEnv = (task) => `AI_MODEL_${task.toUpperCase()}`;
const taskEffortEnv = (task) => `AI_EFFORT_${task.toUpperCase()}`;

/** The model chain for a task: [primary, fallback] (one entry when they're the same). */
export function modelsFor(task) {
  const t = TASKS[task];
  if (!t) throw new Error(`Unknown AI task "${task}"`);
  const primary = firstEnv([taskEnv(task), ...(t.legacyEnv || [])]) || t.model;
  const fallback = firstEnv([...(t.legacyFallbackEnv || []), "AI_FALLBACK_MODEL"]) || DEFAULT_FALLBACK_MODEL;
  const effortEnv = envVal(taskEffortEnv(task)).toLowerCase();
  const effort = EFFORTS.has(effortEnv) ? effortEnv : t.effort;
  return { primary, fallback, effort, chain: primary === fallback ? [primary] : [primary, fallback] };
}

// ── What each model accepts ──────────────────────────────────────────────────────────────────────
// From the Claude API model notes (Nov 2026). Matched on the model id's family prefix.
/** `effort` (output_config.effort): Opus 4.5+, Sonnet 4.6+, Haiku 5.5, Fable / Mythos. Haiku 4.5 and Sonnet 4.5 reject it. */
const EFFORT = /^claude-(fable|mythos|opus-(5|4-[5-9])|sonnet-(5|4-6)|haiku-5)/;
/** Sampling (`temperature`, `top_p`, `top_k`) is rejected from Opus 4.7, Sonnet 5 and Haiku 5.5 on. */
const NO_SAMPLING = /^claude-(fable|mythos|opus-(5|4-[7-9])|sonnet-5|haiku-5)/;
/** Forced tool choice (`any` / `tool`) is rejected on Opus 5.5, Sonnet 5.5 and Fable / Mythos 5.1+. */
const NO_FORCED_TOOL = /^claude-(fable-5-[1-9]|mythos-5-[1-9]|opus-5-[5-9]|sonnet-5-[5-9])/;

export function modelTraits(model) {
  const m = String(model || "");
  return { effort: EFFORT.test(m), sampling: !NO_SAMPLING.test(m), forcedToolChoice: !NO_FORCED_TOOL.test(m) };
}

/**
 * The request as `model` accepts it. `effort` is the task's effort level (set where the model takes it; newer
 * models think by default and effort keeps that, and the token bill, small). Never mutates `params`.
 */
export function adaptParams(params, model, { effort } = {}) {
  const t = modelTraits(model);
  const out = { ...params, model };
  if (!t.sampling) { delete out.temperature; delete out.top_p; delete out.top_k; }
  if (!t.forcedToolChoice && (out.tool_choice?.type === "tool" || out.tool_choice?.type === "any")) out.tool_choice = { type: "auto" };
  const oc = { ...(out.output_config || {}) };
  if (t.effort && effort && !oc.effort) oc.effort = effort;
  if (!t.effort) delete oc.effort;
  if (Object.keys(oc).length) out.output_config = oc; else delete out.output_config;
  return out;
}

// ── Models being retired ─────────────────────────────────────────────────────────────────────────
/** Deprecated models and the day the API stops serving them (Claude API deprecations page, Nov 2026). */
const RETIRING = [
  { prefix: "claude-sonnet-4-5", retires: "2026-11-30", replacement: SONNET },
];
export function retirementOf(model) {
  return RETIRING.find((r) => String(model || "").startsWith(r.prefix)) || null;
}

/** Config worth a look: a task set to a model being retired, or the old shared CLAUDE_MODEL still set. */
export function aiConfigWarnings() {
  const warnings = [];
  for (const task of AI_TASKS) {
    const { primary, fallback } = modelsFor(task);
    for (const [role, model] of [["model", primary], ["fallback", fallback]]) {
      const r = retirementOf(model);
      if (r) warnings.push(`${task}: ${role} ${model} is retired on ${r.retires} — set it to ${r.replacement} (or unset the env var).`);
    }
  }
  if (envVal("CLAUDE_MODEL")) warnings.push("CLAUDE_MODEL is set but no longer read: each task has its own AI_MODEL_<TASK> env var. Unset it.");
  return warnings;
}

// ── Replies ──────────────────────────────────────────────────────────────────────────────────────
/**
 * The reply's text. Newer models think by default, so a reply can start with a `thinking` block: never read
 * `content[0].text`. Text blocks are joined as they come (web-search citations split one sentence across blocks).
 */
export function replyText(response) {
  return (response?.content || []).filter((b) => b?.type === "text").map((b) => b.text || "").join("").trim();
}

// ── The client ───────────────────────────────────────────────────────────────────────────────────
const _clients = new Map();
let _testClient = null;
/**
 * The Anthropic client for AI calls (one per key and retry setting), or null when no API key is configured.
 * `apiKey` overrides the configured key (a caller that was handed one).
 */
export function aiClient({ maxRetries, apiKey } = {}) {
  if (_testClient) return _testClient;
  const key = (apiKey || "").trim() || anthropicApiKey();
  if (!key) return null;
  const id = `${key}|${maxRetries ?? ""}`;
  if (!_clients.has(id)) _clients.set(id, new Anthropic({ apiKey: key, ...(maxRetries != null ? { maxRetries } : {}) }));
  return _clients.get(id);
}
/** The error a call without an API key gets (classified "auth": the plain-English text names ANTHROPIC_API_KEY). */
export function noKeyError() {
  return Anthropic.APIError.generate(401, { type: "error", error: { type: "authentication_error", message: "ANTHROPIC_API_KEY not configured" } }, "ANTHROPIC_API_KEY not configured", {});
}
/** Tests only: every aiClient() call returns `client` (null restores the real one). */
export function _setAiClientForTests(client) { _testClient = client; }

// ── When to fall back ────────────────────────────────────────────────────────────────────────────
/** A 400 that names the model or a parameter one model takes and another doesn't (not the request's own content). */
const MODEL_SPECIFIC_400 = /\bmodel\b|effort|tool_choice|temperature|top_p|top_k|output_config|thinking|not supported|does not support|unsupported/i;

/**
 * A refusal another model could avoid: the model isn't found or allowed for this key (404 / 403), or a 400 that names
 * the model or a model-specific parameter. A 400 about the request itself ("prompt is too long", an empty message) is
 * not: every model would refuse it, so it is passed on (review MODEL-01).
 */
export function isModelProblem(err) {
  if (!err) return false;
  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.AuthenticationError) return false;
  if (/credit balance|billing|quota|payment/i.test(err.message || "")) return false;
  if (err instanceof Anthropic.NotFoundError || err instanceof Anthropic.PermissionDeniedError || [403, 404].includes(err.status)) return true;
  if (err instanceof Anthropic.BadRequestError || err.status === 400) return MODEL_SPECIFIC_400.test(err.message || "") && !/prompt is too long|too many tokens|messages\.\d+/i.test(err.message || "");
  return false;
}

/**
 * What kind of failure this is, for a plain-English message (never the provider's raw text). Decided by the error's
 * type and status first: Anthropic's 403 text ("Your API key does not have permission to use the specified resource")
 * names the API key, but it means this key can't use this model (review MODEL-03).
 */
export function classifyAiError(err) {
  const msg = err?.message || "", status = err?.status;
  if (/credit balance|billing|quota|payment/i.test(msg)) return "billing";
  if (err instanceof Anthropic.RateLimitError || status === 429) return "rate_limit";
  if (err instanceof Anthropic.AuthenticationError || status === 401) return "auth";
  if (err instanceof Anthropic.NotFoundError || err instanceof Anthropic.PermissionDeniedError || status === 403 || status === 404) return "model";
  if (status === 529 || /overloaded/i.test(msg)) return "overloaded";
  if (status === 400 && isModelProblem(err)) return "model";
  if (status) return "unknown";
  if (/rate_limit/i.test(msg)) return "rate_limit";
  if (/invalid x-api-key|authentication/i.test(msg)) return "auth";
  return "unknown";
}

export const AI_ERROR_TEXT = {
  rate_limit: "Anthropic rate limit — wait about 30 seconds and try again.",
  billing: "The AI service is unavailable (account credit or billing). Top up the Anthropic account, then try again.",
  auth: "The AI service is not configured correctly (API key). Check ANTHROPIC_API_KEY.",
  overloaded: "Anthropic is temporarily overloaded — wait a moment and try again.",
  model: "The AI model isn't available to this API key. Check ANTHROPIC_API_KEY, or set the model for this feature in the environment.",
  unknown: "The AI service hit an unexpected error. Try again in a moment.",
};

// A model refused for this key is skipped for a while, so each request doesn't pay for a failed attempt first.
// Not found / no permission (404, 403) is about the key, so the model is skipped for every task. A 400 is about one
// task's request (a parameter or schema that model won't take), so it is skipped for that task only.
const SKIP_MS = 10 * 60 * 1000;
const unavailable = new Map();   // "model" or "model@task" → { model, task, until, status, reason, at }
const recent = [];               // the last few fallbacks, for /health
function remember(entry) {
  recent.unshift(entry);
  recent.length = Math.min(recent.length, 10);
}
function markUnavailable(model, err, task) {
  const forTaskOnly = err?.status === 400;
  const entry = { model, task: forTaskOnly ? task : null, until: Date.now() + SKIP_MS, status: err?.status || null, reason: classifyAiError(err), at: new Date().toISOString() };
  unavailable.set(forTaskOnly ? `${model}@${task}` : model, entry);
  remember({ ...entry, task });
  console.warn(`[ai] ${task}: model ${model} refused (${entry.status || "?"} ${entry.reason}): ${String(err?.message || "").slice(0, 300)} — using the fallback model for ${SKIP_MS / 60000} minutes${forTaskOnly ? " (this task only)" : ""}`);
}
const isSkipped = (model, task, now) => unavailable.get(model)?.until > now || unavailable.get(`${model}@${task}`)?.until > now;
function noteDeclined(model, response, task) {
  const category = response?.stop_details?.category || null;
  remember({ task, model, status: 200, reason: "declined", category, at: new Date().toISOString() });
  console.warn(`[ai] ${task}: model ${model} declined the request (stop_reason refusal${category ? `, ${category}` : ""}) — retrying it once on the fallback model`);
}
function liveChain(task) {
  const { chain, effort } = modelsFor(task);
  const now = Date.now();
  const live = chain.filter((m) => !isSkipped(m, task, now));
  return { chain: live.length ? live : [chain.at(-1)], effort };
}

/** For /health: the models each task uses now, recent refusals, and config to fix. No secrets. */
export function aiModelStatus() {
  const now = Date.now();
  return {
    tasks: Object.fromEntries(AI_TASKS.map((t) => [t, { ...modelsFor(t), using: liveChain(t).chain[0] }])),
    skipped: [...unavailable.values()].filter((v) => v.until > now).map((v) => ({ model: v.model, ...(v.task ? { task: v.task } : {}), status: v.status, reason: v.reason, since: v.at })),
    recentFallbacks: recent.slice(),
    warnings: aiConfigWarnings(),
  };
}
/** For /api/health: task → the model it uses now. */
export function aiModelSummary() {
  return Object.fromEntries(AI_TASKS.map((t) => [t, liveChain(t).chain[0]]));
}
/** Tests only. */
export function _resetAiModelState() { unavailable.clear(); recent.length = 0; }

/**
 * messages.create for a task, through the logging gateway. Falls back once on a model refusal (error) or a declined
 * request (stop_reason "refusal"). Returns the response; `response.model` says which model answered.
 */
export async function createForTask(client, task, params, meta = {}, sdkOptions) {
  if (!client) throw noKeyError();
  const { chain, effort } = liveChain(task);
  let rejected = null;   // [model, error]: skipped only once another model has answered (review MODEL-01)
  for (let i = 0; i < chain.length; i++) {
    let response;
    try {
      response = await callAI(client, adaptParams(params, chain[i], { effort }), { module: meta.module || task }, sdkOptions);
    } catch (err) {
      if (i === chain.length - 1 || !isModelProblem(err)) throw err;
      rejected = [chain[i], err];
      continue;
    }
    if (rejected) { markUnavailable(rejected[0], rejected[1], task); rejected = null; }
    if (response?.stop_reason === "refusal" && i < chain.length - 1) { noteDeclined(chain[i], response, task); continue; }
    return response;
  }
  throw new Error("unreachable");
}

/**
 * A streamed reply for a task: yields the SDK's stream events. Falls back once if the model is refused before any
 * event arrives; after the reply has started an error is passed on (a half-sent reply can't be retried silently).
 */
export async function* streamForTask(client, task, params, meta = {}, sdkOptions) {
  if (!client) throw noKeyError();
  const { chain, effort } = liveChain(task);
  let rejected = null;
  for (let i = 0; i < chain.length; i++) {
    let started = false;
    try {
      const stream = wrapStream(client.messages.stream(adaptParams(params, chain[i], { effort }), sdkOptions), chain[i], { module: meta.module || task });
      for await (const event of stream) {
        if (!started && rejected) markUnavailable(rejected[0], rejected[1], task);
        started = true;
        yield event;
      }
      return;
    } catch (err) {
      if (started || i === chain.length - 1 || !isModelProblem(err)) throw err;
      rejected = [chain[i], err];
    }
  }
}
