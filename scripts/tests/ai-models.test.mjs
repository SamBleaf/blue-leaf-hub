/**
 * ai-models.test.mjs — server/lib/aiModels.mjs: which model each AI task uses, the request adapted to each model, and
 * the fallback when a model is refused (the Nov 2026 Blueprint outage: the production key couldn't reach the pinned
 * model, and a whitelist stopped the environment from switching it). Uses a fake Anthropic client: no network, no key.
 *
 *   node scripts/tests/ai-models.test.mjs
 */
// Run from an empty folder: dotenv reads ./.env, and a checkout's real settings would change the result.
process.chdir((await import("node:fs")).mkdtempSync((await import("node:path")).join((await import("node:os")).tmpdir(), "blh-ai-test-cwd-")));
for (const k of ["BLUEPRINT_MODEL", "CLAUDE_MODEL", "BLUEPRINT_FALLBACK_MODEL", "AI_FALLBACK_MODEL", "DOC_PROOFREAD_MODEL", "DOC_PROOFREAD_FALLBACK_MODEL", "AI_MODEL_BLUEPRINT_CHAT"]) process.env[k] = "";
process.env.AI_CALL_LOG_DISABLED = "1";      // fake calls are never written to ai_call_log
const Anthropic = (await import("@anthropic-ai/sdk")).default;
const { modelsFor, modelTraits, adaptParams, isModelProblem, classifyAiError, createForTask, streamForTask, aiModelStatus, _resetAiModelState, DEFAULT_FALLBACK_MODEL } = await import("../../server/lib/aiModels.mjs");
const { trimChatHistory, runBlueprintAgent } = await import("../../src/blueprint/agent/runAgent.js");
const { estimateCost } = await import("../../server/lib/aiGateway.mjs");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 500)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const apiError = (status, type, message) => Anthropic.APIError.generate(status, { type: "error", error: { type, message } }, message, {});

/** A fake client: `script` maps a model id to an error to throw (or a reply text). Records every request. */
function fakeClient(script = {}) {
  const calls = [];
  const reply = (model) => ({ id: "msg_1", type: "message", role: "assistant", model, content: [{ type: "text", text: `reply from ${model}` }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } });
  return {
    calls,
    messages: {
      create: async (params) => { calls.push(params); const s = script[params.model]; if (s instanceof Error) throw s; return reply(params.model); },
      stream: (params) => {
        calls.push(params);
        const s = script[params.model];
        const events = [{ type: "content_block_delta", delta: { type: "text_delta", text: `hi from ${params.model}` } }, { type: "content_block_delta", delta: { type: "text_delta", text: "!" } }];
        return {
          on() { return this; },
          async *[Symbol.asyncIterator]() {
            if (s instanceof Error) throw s;
            if (s?.failAfterFirst) { yield events[0]; throw apiError(404, "not_found_error", "model gone mid-stream"); }
            yield* events;
          },
        };
      },
    },
  };
}

section("Which model each task uses (environment first, then the task's default)");
ok("Blueprint chat defaults to the current Sonnet at low effort; proofreading to the current Haiku; both fall back to Haiku 4.5",
  modelsFor("blueprint_chat").primary === "claude-sonnet-5-5" && modelsFor("blueprint_chat").effort === "low" && modelsFor("document_proofread").primary === "claude-haiku-5-5"
  && modelsFor("blueprint_chat").fallback === DEFAULT_FALLBACK_MODEL && DEFAULT_FALLBACK_MODEL === "claude-haiku-4-5-20251001", JSON.stringify(modelsFor("blueprint_chat")));
process.env.CLAUDE_MODEL = "claude-sonnet-4-5";
ok("the shared CLAUDE_MODEL is no longer read (it pointed every module at claude-sonnet-4-5, retired 2026-11-30)", modelsFor("blueprint_chat").primary === "claude-sonnet-5-5");
process.env.BLUEPRINT_MODEL = "claude-opus-5-5";
ok("BLUEPRINT_MODEL is honoured for Blueprint — no whitelist overrides the environment — and doesn't touch proofreading", modelsFor("blueprint_chat").primary === "claude-opus-5-5" && modelsFor("document_proofread").primary === "claude-haiku-5-5");
process.env.BLUEPRINT_MODEL = DEFAULT_FALLBACK_MODEL;
ok("a primary equal to the fallback is tried once", modelsFor("blueprint_chat").chain.length === 1);
process.env.BLUEPRINT_MODEL = ""; process.env.CLAUDE_MODEL = "";
ok("an unknown task is a programming error", (() => { try { modelsFor("nope"); return false; } catch { return true; } })());

section("The request is adapted to the model it's sent to");
const t = (m) => JSON.stringify(modelTraits(m));
ok("Sonnet 5.5: effort yes, sampling no, forced tool choice no", t("claude-sonnet-5-5") === JSON.stringify({ effort: true, sampling: false, forcedToolChoice: false }), t("claude-sonnet-5-5"));
ok("Sonnet 4.6: effort, sampling and forced tool choice", t("claude-sonnet-4-6") === JSON.stringify({ effort: true, sampling: true, forcedToolChoice: true }));
ok("Haiku 4.5: no effort; sampling and forced tool choice", t("claude-haiku-4-5-20251001") === JSON.stringify({ effort: false, sampling: true, forcedToolChoice: true }));
ok("Haiku 5.5: effort, no sampling, forced tool choice allowed; Opus 5.5 refuses forced tool choice", t("claude-haiku-5-5") === JSON.stringify({ effort: true, sampling: false, forcedToolChoice: true }) && !modelTraits("claude-opus-5-5").forcedToolChoice);
const base = { max_tokens: 100, temperature: 0.2, tool_choice: { type: "tool", name: "hub_list_subcontractors" }, output_config: { format: { type: "json_schema", schema: {} } }, messages: [] };
const a55 = adaptParams(base, "claude-sonnet-5-5", { effort: "low" }), a45 = adaptParams(base, "claude-haiku-4-5-20251001", { effort: "low" });
ok("…on Sonnet 5.5: no temperature, tool choice 'auto', effort set, the output format kept", a55.model === "claude-sonnet-5-5" && !("temperature" in a55) && a55.tool_choice.type === "auto" && a55.output_config.effort === "low" && !!a55.output_config.format, JSON.stringify(a55));
ok("…on Haiku 4.5: temperature and the forced tool kept, no effort, the output format kept", a45.temperature === 0.2 && a45.tool_choice.type === "tool" && !("effort" in a45.output_config) && !!a45.output_config.format, JSON.stringify(a45));
ok("…the caller's request is never changed", base.temperature === 0.2 && base.tool_choice.type === "tool" && !base.model && !("effort" in base.output_config));
ok("…an empty output_config is dropped (Haiku 4.5, no format)", !("output_config" in adaptParams({ messages: [] }, "claude-haiku-4-5-20251001", { effort: "low" })));

section("When a model is refused, the same request goes to the fallback — and only then");
ok("a 400 about the request itself is not a model problem (every model would refuse it); one naming a model parameter is (review MODEL-01)",
  !isModelProblem(apiError(400, "invalid_request_error", "messages.1: all messages must have non-empty content except for the optional final assistant message"))
  && !isModelProblem(apiError(400, "invalid_request_error", "prompt is too long: 250000 tokens > 200000 maximum"))
  && isModelProblem(apiError(400, "invalid_request_error", "tool_choice: type 'tool' is not supported for this model")) && isModelProblem(apiError(400, "invalid_request_error", "effort is not supported on this model")));
ok("the 403 'Your API key does not have permission to use the specified resource' is a model problem, not a key problem (review MODEL-03)",
  classifyAiError(apiError(403, "permission_error", "Your API key does not have permission to use the specified resource.")) === "model");
ok("404 / 403 / 400 are model problems; 429, 401, 500 and a billing 400 are not", isModelProblem(apiError(404, "not_found_error", "model: x")) && isModelProblem(apiError(403, "permission_error", "no access"))
  && isModelProblem(apiError(400, "invalid_request_error", "tool_choice not supported")) && !isModelProblem(apiError(429, "rate_limit_error", "slow down"))
  && !isModelProblem(apiError(401, "authentication_error", "invalid x-api-key")) && !isModelProblem(apiError(500, "api_error", "boom"))
  && !isModelProblem(apiError(400, "invalid_request_error", "Your credit balance is too low")));
ok("errors are classified for a plain-English message", classifyAiError(apiError(404, "not_found_error", "model: claude-sonnet-4-6")) === "model" && classifyAiError(apiError(429, "rate_limit_error", "x")) === "rate_limit"
  && classifyAiError(apiError(401, "authentication_error", "invalid x-api-key")) === "auth" && classifyAiError(apiError(400, "invalid_request_error", "Your credit balance is too low")) === "billing"
  && classifyAiError(apiError(529, "overloaded_error", "Overloaded")) === "overloaded" && classifyAiError(new Error("socket hang up")) === "unknown");
_resetAiModelState();
{
  const c = fakeClient({ "claude-sonnet-5-5": apiError(404, "not_found_error", "model: claude-sonnet-5-5") });
  const r = await createForTask(c, "blueprint_chat", { max_tokens: 50, messages: [{ role: "user", content: "hi" }] }, { module: "test" });
  ok("a refused model is retried once on the fallback, which answers", r.model === DEFAULT_FALLBACK_MODEL && c.calls.map((x) => x.model).join() === `claude-sonnet-5-5,${DEFAULT_FALLBACK_MODEL}`, c.calls.map((x) => x.model).join());
  const r2 = await createForTask(c, "blueprint_chat", { max_tokens: 50, messages: [{ role: "user", content: "again" }] }, { module: "test" });
  ok("…and the refused model is then skipped for a while (no paid failed attempt on every request)", r2.model === DEFAULT_FALLBACK_MODEL && c.calls.length === 3 && c.calls[2].model === DEFAULT_FALLBACK_MODEL);
  const st = aiModelStatus();
  ok("…/health shows the model in use, the skipped one and why", st.tasks.blueprint_chat.using === DEFAULT_FALLBACK_MODEL && st.skipped.some((s) => s.model === "claude-sonnet-5-5" && s.reason === "model" && s.status === 404) && st.recentFallbacks.length === 1, JSON.stringify(st));
}
_resetAiModelState();
{
  const c = fakeClient({ "claude-sonnet-5-5": apiError(429, "rate_limit_error", "slow down") });
  let thrown = null; try { await createForTask(c, "blueprint_chat", { max_tokens: 50, messages: [] }); } catch (e) { thrown = e; }
  ok("a rate limit is passed on, never retried on another model", thrown?.status === 429 && c.calls.length === 1);
}
_resetAiModelState();
{
  const c = fakeClient({ "claude-sonnet-5-5": apiError(404, "not_found_error", "model"), [DEFAULT_FALLBACK_MODEL]: apiError(404, "not_found_error", "model") });
  let thrown = null; try { await createForTask(c, "blueprint_chat", { max_tokens: 50, messages: [] }); } catch (e) { thrown = e; }
  ok("if the fallback is refused too, that error is passed on (and classified as a model problem)", thrown?.status === 404 && c.calls.length === 2 && classifyAiError(thrown) === "model");
}

_resetAiModelState();
{
  const bad = apiError(400, "invalid_request_error", "messages.1: all messages must have non-empty content except for the optional final assistant message");
  const c = fakeClient({ "claude-sonnet-5-5": bad, [DEFAULT_FALLBACK_MODEL]: bad });
  let thrown = null; try { await createForTask(c, "blueprint_chat", { max_tokens: 50, messages: [] }); } catch (e) { thrown = e; }
  ok("a request-shaped 400 is passed on at once: no second model, nothing skipped for anyone else (review MODEL-01)", thrown?.status === 400 && c.calls.length === 1 && aiModelStatus().skipped.length === 0);
}
_resetAiModelState();
{
  const c = fakeClient({ "claude-sonnet-5-5": apiError(404, "not_found_error", "model"), [DEFAULT_FALLBACK_MODEL]: apiError(404, "not_found_error", "model") });
  try { await createForTask(c, "blueprint_chat", { max_tokens: 50, messages: [] }); } catch { /* expected */ }
  ok("…and a model is skipped only once another model has answered (both refused: nothing skipped)", aiModelStatus().skipped.length === 0);
}

section("Streaming: falls back before the first word, never after");
_resetAiModelState();
{
  const c = fakeClient({ "claude-sonnet-5-5": apiError(403, "permission_error", "no access to model") });
  let text = ""; for await (const ev of streamForTask(c, "blueprint_chat", { max_tokens: 50, messages: [] })) text += ev.delta.text;
  ok("a stream refused before any event continues on the fallback model", text === `hi from ${DEFAULT_FALLBACK_MODEL}!` && c.calls.length === 2, text);
}
_resetAiModelState();
{
  const c = fakeClient({ "claude-sonnet-5-5": { failAfterFirst: true } });
  let text = "", thrown = null;
  try { for await (const ev of streamForTask(c, "blueprint_chat", { max_tokens: 50, messages: [] })) text += ev.delta.text; } catch (e) { thrown = e; }
  ok("an error after the reply started is passed on, not silently retried (the client already has part of a reply)", thrown?.status === 404 && text === "hi from claude-sonnet-5-5" && c.calls.length === 1);
}

section("The Blueprint agent loop");
ok("a trimmed chat history always opens with the user's turn", (() => {
  const h = Array.from({ length: 9 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
  const k = trimChatHistory(h, 4); return k[0].role === "user" && k.length === 3 && k.at(-1).content === "m8";
})());
_resetAiModelState();
{
  const c = fakeClient({ "claude-sonnet-5-5": apiError(404, "not_found_error", "model: claude-sonnet-5-5") });
  const reply = await runBlueprintAgent({ anthropic: c, model: "claude-sonnet-5-5", maxTokens: 200, mode: "chat", messages: [{ role: "user", content: "How is the pipeline looking?" }], extras: { enableTools: false },
    callModel: (params, opts) => createForTask(c, "blueprint_chat", params, { module: "test" }, opts) });
  ok("the agent's requests go through the task caller: a refused model falls back and Blueprint still answers", reply === `reply from ${DEFAULT_FALLBACK_MODEL}` && c.calls[0].output_config?.effort === "low" && !("output_config" in c.calls[1]), reply);
}

section("Cost logging");
ok("current prices: Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50, Haiku 4.5 $1/$5, Sonnet 4.6 $3/$15 per million (longest prefix wins)",
  Math.abs(estimateCost("claude-sonnet-5-5", 1e6, 1e6) - 12) < 1e-9 && Math.abs(estimateCost("claude-haiku-5-5", 1e6, 1e6) - 0.6) < 1e-9
  && Math.abs(estimateCost("claude-haiku-4-5-20251001", 1e6, 1e6) - 6) < 1e-9 && Math.abs(estimateCost("claude-sonnet-4-6", 1e6, 1e6) - 18) < 1e-9);

console.log(`\nai-models: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
