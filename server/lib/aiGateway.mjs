/**
 * aiGateway.mjs — Anthropic call logger
 *
 * Provides callAI() and wrapStream() as drop-in wrappers around
 * client.messages.create / client.messages.stream.  Every call is
 * logged to ai_call_log fire-and-forget — the main request is NEVER
 * blocked or rejected by a logging failure.
 *
 * Usage:
 *   Non-streaming: const resp = await callAI(client, params, { module: 'financeRoutes' });
 *   Streaming:     const stream = wrapStream(await client.messages.stream(params), params.model, { module: 'blueprintRoutes' });
 */

import { getServiceSupabase } from "./supabaseService.mjs";

// ── Cost table (USD per million tokens) ──────────────────────────────────────
// Keys are model-name prefixes (longest match wins).
const COST_TABLE = [
  { prefix: "claude-opus",   input: 15.00, output: 75.00 },
  { prefix: "claude-sonnet", input:  3.00, output: 15.00 },
  { prefix: "claude-haiku",  input:  0.80, output:  4.00 },
];

/**
 * Estimate cost in USD given a model name and token counts.
 * Returns null when the model is unrecognised.
 */
export function estimateCost(model, inputTokens, outputTokens) {
  const row = COST_TABLE.find(r => (model || "").startsWith(r.prefix));
  if (!row) return null;
  return ((inputTokens || 0) * row.input + (outputTokens || 0) * row.output) / 1_000_000;
}

// ── Internal log insert (fire-and-forget) ─────────────────────────────────────
async function _log({ model, usage, is_streaming, module: mod }) {
  const sb = getServiceSupabase();
  if (!sb) return;
  const input_tokens  = usage?.input_tokens  ?? null;
  const output_tokens = usage?.output_tokens ?? null;
  const cost_usd      = estimateCost(model, input_tokens, output_tokens);
  await sb.from("ai_call_log").insert({
    module:        mod || "unknown",
    model:         model || "unknown",
    input_tokens,
    output_tokens,
    cost_usd,
    is_streaming:  Boolean(is_streaming),
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * callAI — drop-in for client.messages.create(params[, sdkOptions])
 *
 * @param {import('@anthropic-ai/sdk').Anthropic} client
 * @param {object} params  — same as messages.create first argument
 * @param {object} [meta]  — { module: string }
 * @param {object} [sdkOptions] — passed through as second arg to messages.create
 * @returns same response as messages.create
 */
export async function callAI(client, params, meta = {}, sdkOptions) {
  const response = sdkOptions
    ? await client.messages.create(params, sdkOptions)
    : await client.messages.create(params);

  _log({
    model:        params.model,
    usage:        response.usage,
    is_streaming: false,
    module:       meta.module,
  }).catch(e => console.warn("[aiGateway]", e.message));

  return response;
}

/**
 * wrapStream — attaches a logging listener to a MessageStream.
 *
 * Call after client.messages.stream() and before iterating:
 *   const stream = wrapStream(await client.messages.stream(params), params.model, { module: 'x' });
 *   for await (const event of stream) { ... }
 *
 * @param {object} stream — return value of client.messages.stream()
 * @param {string} model
 * @param {object} [meta] — { module: string }
 * @returns the same stream object (for chaining)
 */
export function wrapStream(stream, model, meta = {}) {
  // 'message' event fires once when the full response is accumulated.
  if (typeof stream?.on === "function") {
    stream.on("message", (msg) => {
      _log({
        model,
        usage:        msg?.usage,
        is_streaming: true,
        module:       meta.module,
      }).catch(e => console.warn("[aiGateway]", e.message));
    });
  }
  return stream;
}
