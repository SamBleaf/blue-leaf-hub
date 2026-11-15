/**
 * aiModels.mjs — which Claude model each AI task uses, and what to do when a model isn't available.
 *
 * Why this exists: Blueprint was hard-pinned to one model by a whitelist that ignored the environment, so when the
 * production API key lost access to it every call failed with a generic error and config couldn't switch it off
 * (handover, Nov 2026). Now:
 *
 *   - Each task names its own model, read from the environment, with a default matched to the job and its token cost.
 *   - A request is adapted to the model it is sent to (newer models reject `temperature` and forced tool choice; older
 *     ones reject `effort`), so switching a model in the environment can't break the request shape.
 *   - If a model is refused for this key (not found / no permission / a request it can't accept), the same request is
 *     retried once on the task's fallback model, the refusal is logged, and that model is skipped for a while so later
 *     calls don't pay for a failed attempt first. Rate limits, billing and authentication errors never fall back:
 *     another model wouldn't fix them.
 *
 * Task defaults (override with the env vars shown):
 *   blueprint_chat      BLUEPRINT_MODEL | CLAUDE_MODEL   claude-sonnet-5-5 at effort "low" (a coaching chat with tools)
 *   blueprint_utility   BLUEPRINT_MODEL | CLAUDE_MODEL   same model: knowledge formatting, SOP drafts
 *   document_proofread  DOC_PROOFREAD_MODEL              claude-haiku-5-5 at effort "low" (spelling and wording: a
 *                                                        small, well-defined task; about a tenth of a cent per brief)
 *   fallback for all    AI_FALLBACK_MODEL                claude-haiku-4-5-20251001 (the model production is known to
 *                                                        reach; per-task overrides BLUEPRINT_FALLBACK_MODEL,
 *                                                        DOC_PROOFREAD_FALLBACK_MODEL)
 */
import Anthropic from "@anthropic-ai/sdk";
import { config as dotenvConfig } from "dotenv";
import { callAI, wrapStream } from "./aiGateway.mjs";

const { parsed: _env = {} } = dotenvConfig();
/** An env value, from the process first, then the .env file (a shell can export an empty value: CLAUDE.md). */
const envVal = (name) => (process.env[name] || "").trim() || (_env[name] || "").trim();
const firstEnv = (names) => names.map(envVal).find(Boolean) || "";

export const DEFAULT_FALLBACK_MODEL = "claude-haiku-4-5-20251001";
/** The API key, read the same way (process first, then .env). */
export const anthropicApiKey = () => envVal("ANTHROPIC_API_KEY");

const TASKS = {
  blueprint_chat: { env: ["BLUEPRINT_MODEL", "CLAUDE_MODEL"], fallbackEnv: ["BLUEPRINT_FALLBACK_MODEL", "AI_FALLBACK_MODEL"], model: "claude-sonnet-5-5", effort: "low" },
  blueprint_utility: { env: ["BLUEPRINT_MODEL", "CLAUDE_MODEL"], fallbackEnv: ["BLUEPRINT_FALLBACK_MODEL", "AI_FALLBACK_MODEL"], model: "claude-sonnet-5-5", effort: "low" },
  document_proofread: { env: ["DOC_PROOFREAD_MODEL"], fallbackEnv: ["DOC_PROOFREAD_FALLBACK_MODEL", "AI_FALLBACK_MODEL"], model: "claude-haiku-5-5", effort: "low" },
};

/** The model chain for a task: [primary, fallback] (one entry when they're the same). */
export function modelsFor(task) {
  const t = TASKS[task];
  if (!t) throw new Error(`Unknown AI task "${task}"`);
  const primary = firstEnv(t.env) || t.model;
  const fallback = firstEnv(t.fallbackEnv) || DEFAULT_FALLBACK_MODEL;
  return { primary, fallback, effort: t.effort, chain: primary === fallback ? [primary] : [primary, fallback] };
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
const SKIP_MS = 10 * 60 * 1000;
const unavailable = new Map();   // model → { until, status, reason, at }
const recent = [];               // the last few fallbacks, for /health
function markUnavailable(model, err, task) {
  const entry = { until: Date.now() + SKIP_MS, status: err?.status || null, reason: classifyAiError(err), at: new Date().toISOString() };
  unavailable.set(model, entry);
  recent.unshift({ task, model, ...entry });
  recent.length = Math.min(recent.length, 10);
  console.warn(`[ai] ${task}: model ${model} refused (${entry.status || "?"} ${entry.reason}): ${String(err?.message || "").slice(0, 300)} — using the fallback model for ${SKIP_MS / 60000} minutes`);
}
function liveChain(task) {
  const { chain, effort } = modelsFor(task);
  const now = Date.now();
  const live = chain.filter((m) => !(unavailable.get(m)?.until > now));
  return { chain: live.length ? live : [chain.at(-1)], effort };
}

/** For /health: the models each task uses now, and recent refusals. No secrets. */
export function aiModelStatus() {
  const now = Date.now();
  return {
    tasks: Object.fromEntries(Object.keys(TASKS).map((t) => [t, { ...modelsFor(t), using: liveChain(t).chain[0] }])),
    skipped: [...unavailable.entries()].filter(([, v]) => v.until > now).map(([model, v]) => ({ model, status: v.status, reason: v.reason, since: v.at })),
    recentFallbacks: recent.slice(),
  };
}
/** Tests only. */
export function _resetAiModelState() { unavailable.clear(); recent.length = 0; }

/**
 * messages.create for a task, through the logging gateway, falling back once on a model refusal.
 * Returns the response; `response.model` says which model answered.
 */
export async function createForTask(client, task, params, meta = {}, sdkOptions) {
  const { chain, effort } = liveChain(task);
  let refused = null;   // [model, error]: skipped only once another model has answered (review MODEL-01)
  for (let i = 0; i < chain.length; i++) {
    try {
      const response = await callAI(client, adaptParams(params, chain[i], { effort }), { module: meta.module || task }, sdkOptions);
      if (refused) markUnavailable(refused[0], refused[1], task);
      return response;
    } catch (err) {
      if (i === chain.length - 1 || !isModelProblem(err)) throw err;
      refused = [chain[i], err];
    }
  }
  throw new Error("unreachable");
}

/**
 * A streamed reply for a task: yields the SDK's stream events. Falls back once if the model is refused before any
 * event arrives; after the reply has started an error is passed on (a half-sent reply can't be retried silently).
 */
export async function* streamForTask(client, task, params, meta = {}, sdkOptions) {
  const { chain, effort } = liveChain(task);
  let refused = null;
  for (let i = 0; i < chain.length; i++) {
    let started = false;
    try {
      const stream = wrapStream(client.messages.stream(adaptParams(params, chain[i], { effort }), sdkOptions), chain[i], { module: meta.module || task });
      for await (const event of stream) {
        if (!started && refused) markUnavailable(refused[0], refused[1], task);
        started = true;
        yield event;
      }
      return;
    } catch (err) {
      if (started || i === chain.length - 1 || !isModelProblem(err)) throw err;
      refused = [chain[i], err];
    }
  }
}
