/**
 * ai-models-migration.test.mjs — the Nov 2026 move of every Hub AI call off claude-sonnet-4-5 (retired 2026-11-30)
 * and off the shared CLAUDE_MODEL, onto one task per call in server/lib/aiModels.mjs.
 *
 *   1. Source guard: no call site creates its own Anthropic client, calls the SDK or the logger directly, hard-codes a
 *      model id, reads CLAUDE_MODEL, reads a reply as content[0], or names a task that doesn't exist.
 *   2. The task table: defaults, env overrides, retirement warnings, reply text with a thinking block first.
 *   3. Each migrated module's request, captured by a fake client: the task's model and effort, no sampling
 *      parameters, no assistant prefill, no forced tool choice, room to think in max_tokens, no obsolete beta header,
 *      and the reply parsed when it starts with a thinking block (as Haiku 5.5 / Sonnet 5.5 replies can).
 *
 * No network, no database, no key: a fake client answers every call (ANTHROPIC_BASE_URL points nowhere, so a call that
 * slipped past the fake would fail fast, not reach Anthropic). The test runs from an empty temporary folder, so no
 * .env file is loaded: a checkout's real settings and secrets can't change (or leak into) the result.
 *
 *   node scripts/tests/ai-models-migration.test.mjs
 */
import { readdirSync, readFileSync, statSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";

process.chdir(mkdtempSync(join(tmpdir(), "blh-ai-test-cwd-")));   // dotenv reads ./.env: there is none here
for (const k of ["SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CLAUDE_MODEL", "AI_FALLBACK_MODEL",
  "BLUEPRINT_MODEL", "BLUEPRINT_FALLBACK_MODEL", "BLUEPRINT_REVIEW_MODEL", "DOC_PROOFREAD_MODEL", "DOC_PROOFREAD_FALLBACK_MODEL"]) process.env[k] = "";
process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-a-real-key";
process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:9";

const Anthropic = (await import("@anthropic-ai/sdk")).default;
const ai = await import("../../server/lib/aiModels.mjs");
const { AI_TASKS, modelsFor, aiConfigWarnings, aiModelStatus, aiModelSummary, replyText, retirementOf, createForTask,
  _setAiClientForTests, _resetAiModelState, aiClient, SONNET, HAIKU, DEFAULT_FALLBACK_MODEL } = ai;
for (const t of AI_TASKS) { process.env[`AI_MODEL_${t.toUpperCase()}`] = ""; process.env[`AI_EFFORT_${t.toUpperCase()}`] = ""; }

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 700)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const apiError = (status, type, message) => Anthropic.APIError.generate(status, { type: "error", error: { type, message } }, message, {});

// ── 1. Source guard ──────────────────────────────────────────────────────────────────────────────
section("Source guard: every AI call goes through a task in aiModels.mjs");
const ROOT = new URL("../../", import.meta.url).pathname;
function walk(dir) {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) continue;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walk(rel));
    else if (/\.(mjs|cjs|js)$/.test(name)) out.push(rel);
  }
  return out;
}
const files = [...walk("server"), ...walk("src/blueprint")];
/** Source lines that aren't comments, as [line number, text]. */
const codeLines = (src) => src.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => !/^\s*(\/\/|\*|\/\*)/.test(l));
const GATEWAY = new Set(["server/lib/aiModels.mjs", "server/lib/aiGateway.mjs"]);
const RULES = [
  { name: "no call site creates its own Anthropic client (aiClient() in aiModels.mjs)", re: /new\s+Anthropic\s*\(/, allow: new Set(["server/lib/aiModels.mjs"]) },
  { name: "no call site calls the SDK directly (messages.create / stream / parse)", re: /\.messages\.(create|stream|parse)\s*\(/, allow: GATEWAY },
  { name: "no call site calls the logger directly (callAI / wrapStream): createForTask / streamForTask", re: /\b(callAI|wrapStream)\s*\(/, allow: GATEWAY },
  { name: "nothing reads the shared CLAUDE_MODEL", re: /CLAUDE_MODEL/, allow: new Set(["server/lib/aiModels.mjs"]) },
  { name: "no hard-coded model id outside aiModels.mjs / the cost table", re: /["'`]claude-(opus|sonnet|haiku|instant|fable|mythos|2|3)[a-z0-9.@-]*["'`]/, allow: GATEWAY },
  { name: "no obsolete prompt-caching beta header (prompt caching is GA; Blueprint chat still sends it, unchanged by this migration)", re: /prompt-caching-2024-07-31/, allow: new Set(["src/blueprint/agent/runAgent.js", "server/lib/blueprintRoutes.mjs"]) },
];
const sources = Object.fromEntries(files.map((f) => [f, readFileSync(join(ROOT, f), "utf8")]));
for (const rule of RULES) {
  const hits = [];
  for (const f of files) if (!rule.allow.has(f)) for (const [n, l] of codeLines(sources[f])) if (rule.re.test(l)) hits.push(`${f}:${n}  ${l.trim().slice(0, 120)}`);
  ok(rule.name, hits.length === 0, hits.join("\n    "));
}
{
  const hits = [];
  for (const f of files) {
    if (!/aiModels\.mjs/.test(sources[f]) || GATEWAY.has(f)) continue;
    for (const [n, l] of codeLines(sources[f])) if (/\.content\??\.?\[0\]/.test(l)) hits.push(`${f}:${n}  ${l.trim()}`);
  }
  ok("no reply is read as content[0] (a reply can start with a thinking block): replyText()", hits.length === 0, hits.join("\n    "));
}
const taskCalls = [];
for (const f of files) {
  if (GATEWAY.has(f)) continue;
  const src = sources[f];
  for (const m of src.matchAll(/\b(createForTask|streamForTask)\(\s*[^,()]+(?:\(\))?\s*,\s*(["'])([a-z_]+)\2\s*,\s*\{/g)) {
    const body = src.slice(m.index, m.index + 1500).split(/\n\s*\}\s*,\s*\{|\n\s*\}\s*\)|\n\s*\},\s*\n/)[0];
    taskCalls.push({ file: f, line: src.slice(0, m.index).split("\n").length, task: m[3], body });
  }
}
ok(`every literal task name exists (${taskCalls.length} call sites)`, taskCalls.length >= 25 && taskCalls.every((c) => AI_TASKS.includes(c.task)), taskCalls.filter((c) => !AI_TASKS.includes(c.task)).map((c) => `${c.file}:${c.line} ${c.task}`).join(", ") || `only ${taskCalls.length}`);
ok("no request names its own model (the task does)", taskCalls.every((c) => !/^\s*model\s*:/m.test(c.body)), taskCalls.filter((c) => /^\s*model\s*:/m.test(c.body)).map((c) => `${c.file}:${c.line}`).join(", "));
{
  const used = new Set(taskCalls.map((c) => c.task));
  // Tasks chosen by a variable at the call site (procurement, schedule routes) are checked at runtime below.
  const viaVariable = ["procurement_draft", "procurement_summary", "schedule_analysis", "schedule_task_advice", "blueprint_chat", "blueprint_document_review"];
  const unused = AI_TASKS.filter((t) => !used.has(t) && !viaVariable.includes(t));
  ok("every task in the table is used somewhere", unused.length === 0, unused.join(", "));
}

// ── 2. The task table ────────────────────────────────────────────────────────────────────────────
section("The task table");
ok(`${AI_TASKS.length} tasks, each defaulting to a current model (Sonnet 5.5 or Haiku 5.5), none to a model being retired`,
  AI_TASKS.every((t) => [SONNET, HAIKU].includes(modelsFor(t).primary) && !retirementOf(modelsFor(t).primary)), AI_TASKS.map((t) => `${t}=${modelsFor(t).primary}`).join(" "));
ok("Haiku for extraction / classification, Sonnet for reasoning and outward writing (spot checks)",
  ["invoice_extract", "invoice_classify", "quote_pdf_extract", "voice_tasks", "supervisor_voice", "marketing_photo_sort"].every((t) => modelsFor(t).primary === HAIKU)
  && ["sales_transcript", "rfq_tender_extract", "schedule_generate", "marketing_content", "tender_email_draft", "procurement_draft"].every((t) => modelsFor(t).primary === SONNET));
ok("every task has an effort level; the fallback is Haiku 4.5", AI_TASKS.every((t) => ["low", "medium", "high"].includes(modelsFor(t).effort) && modelsFor(t).fallback === DEFAULT_FALLBACK_MODEL));
process.env.AI_MODEL_SALES_TRANSCRIPT = "claude-opus-5-5";
process.env.AI_EFFORT_SALES_TRANSCRIPT = "medium";
ok("AI_MODEL_<TASK> and AI_EFFORT_<TASK> set one task, and only that task", modelsFor("sales_transcript").primary === "claude-opus-5-5" && modelsFor("sales_transcript").effort === "medium" && modelsFor("schedule_generate").primary === SONNET);
process.env.AI_EFFORT_SALES_TRANSCRIPT = "turbo";
ok("…an effort level that isn't one is ignored (the task's default stands)", modelsFor("sales_transcript").effort === "low");
process.env.AI_MODEL_SALES_TRANSCRIPT = ""; process.env.AI_EFFORT_SALES_TRANSCRIPT = "";
process.env.BLUEPRINT_REVIEW_MODEL = "claude-haiku-5-5";
ok("the older BLUEPRINT_REVIEW_MODEL still sets the Blueprint document review", modelsFor("blueprint_document_review").primary === "claude-haiku-5-5");
process.env.BLUEPRINT_REVIEW_MODEL = "";
process.env.AI_MODEL_FEE_PROPOSAL_PARSE = "claude-sonnet-4-5-20250929";
process.env.CLAUDE_MODEL = "claude-sonnet-4-5";
{
  const w = aiConfigWarnings();
  ok("/health warns about a task set to claude-sonnet-4-5 (retired 2026-11-30) and about a leftover CLAUDE_MODEL",
    w.some((x) => /fee_proposal_parse: model claude-sonnet-4-5-20250929 is retired on 2026-11-30/.test(x)) && w.some((x) => /CLAUDE_MODEL is set but no longer read/.test(x)) && aiModelStatus().warnings.length === w.length, w.join(" | "));
  ok("…and CLAUDE_MODEL changes nothing", AI_TASKS.every((t) => t === "fee_proposal_parse" || modelsFor(t).primary !== "claude-sonnet-4-5"));
}
process.env.AI_MODEL_FEE_PROPOSAL_PARSE = ""; process.env.CLAUDE_MODEL = "";
ok("no warnings with nothing set", aiConfigWarnings().length === 0, aiConfigWarnings().join(" | "));
ok("/api/health lists each task's model", Object.keys(aiModelSummary()).length === AI_TASKS.length && aiModelSummary().invoice_extract === HAIKU);
ok("replyText reads text blocks after a thinking block and joins them", replyText({ content: [{ type: "thinking", thinking: "", signature: "s" }, { type: "text", text: "Hello " }, { type: "text", text: "there" }] }) === "Hello there" && replyText({ content: [] }) === "" && replyText(null) === "");
ok("aiClient() is one shared client per retry setting, null without a key", (() => { const a = aiClient({ maxRetries: 1 }), b = aiClient({ maxRetries: 1 }); process.env.ANTHROPIC_API_KEY = ""; const none = aiClient(); process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-a-real-key"; return a && a === b && a !== aiClient({ maxRetries: 0 }) && none === null; })());
{
  let e = null; try { await createForTask(null, "invoice_extract", { max_tokens: 10, messages: [] }); } catch (x) { e = x; }
  ok("a call without a key fails as an authentication problem (plain-English text names ANTHROPIC_API_KEY)", ai.classifyAiError(e) === "auth");
}

// ── 3. Each module's request, through a fake client ──────────────────────────────────────────────
section("Each migrated module's request (fake client)");
const calls = [];
let script = {};                 // model → Error | "refusal"
let responder = () => "{}";      // params → reply text
let streamText = "";
const fake = {
  messages: {
    create: async (params, opts) => {
      calls.push({ params, opts });
      const s = script[params.model];
      if (s instanceof Error) throw s;
      if (s === "refusal") return { id: "msg_r", type: "message", role: "assistant", model: params.model, content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: "general_harms" }, usage: { input_tokens: 10, output_tokens: 0 } };
      return { id: "msg_t", type: "message", role: "assistant", model: params.model, stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50 },
        content: [{ type: "thinking", thinking: "", signature: "sig" }, { type: "text", text: responder(params) }] };
    },
    stream: (params, opts) => {
      calls.push({ params, opts, stream: true });
      const s = script[params.model];
      return {
        on() { return this; },
        async *[Symbol.asyncIterator]() {
          if (s instanceof Error) throw s;
          yield { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } };
          yield { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "" } };
          for (let i = 0; i < streamText.length; i += 20) yield { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: streamText.slice(i, i + 20) } };
        },
      };
    },
  },
};
_setAiClientForTests(fake);

/** What's wrong with a captured request for `task` (empty = right). */
function problems(call, task) {
  if (!call) return ["no request was sent"];
  const p = call.params, { primary, effort } = modelsFor(task), out = [];
  if (p.model !== primary) out.push(`model ${p.model}, expected ${primary}`);
  if (p.output_config?.effort !== effort) out.push(`effort ${p.output_config?.effort}, expected ${effort}`);
  for (const k of ["temperature", "top_p", "top_k"]) if (k in p) out.push(`sends ${k}`);
  if (p.messages?.at(-1)?.role !== "user") out.push("the last message isn't the user's (assistant prefill: a 400 on 5.5 models)");
  if (["tool", "any"].includes(p.tool_choice?.type)) out.push("forced tool_choice (a 400 on Sonnet 5.5)");
  if (!(p.max_tokens >= 1024)) out.push(`max_tokens ${p.max_tokens}: no room to think`);
  if (p.thinking?.budget_tokens) out.push("thinking.budget_tokens (a 400 on 5.5 models)");
  if (/prompt-caching/.test(call.opts?.headers?.["anthropic-beta"] || "")) out.push("obsolete prompt-caching beta header");
  return out;
}
async function check(name, task, run, verify = () => true) {
  calls.length = 0; _resetAiModelState();
  let result, error = null;
  try { result = await run(); } catch (e) { error = e; }
  const p = problems(calls[0], task);
  let verified = false; try { verified = !error && verify(result); } catch (e) { error = e; }
  ok(`${name} → ${task} (${modelsFor(task).primary}, effort ${modelsFor(task).effort})`, p.length === 0 && verified, [...p, error?.stack || error?.message || (!verified ? `unexpected result: ${JSON.stringify(result)?.slice(0, 300)}` : "")].filter(Boolean).join("; "));
}
function fakeApp() {
  const routes = {};
  const reg = (m) => (path, ...h) => { routes[`${m} ${path}`] = h.at(-1); };
  return { routes, get: reg("GET"), post: reg("POST"), put: reg("PUT"), patch: reg("PATCH"), delete: reg("DELETE"), use() {} };
}
function fakeRes() {
  const r = { statusCode: 200, body: undefined, chunks: [], headers: {}, headersSent: false, ended: false };
  Object.assign(r, {
    status(c) { r.statusCode = c; return r; }, json(b) { r.body = b; r.headersSent = true; return r; }, send(b) { r.body = b; r.headersSent = true; return r; },
    setHeader(k, v) { r.headers[k] = v; }, flushHeaders() { r.headersSent = true; }, write(c) { r.chunks.push(String(c)); r.headersSent = true; return true; }, end() { r.ended = true; }, flush() {},
  });
  return r;
}
async function route(register, key, req) {
  const app = fakeApp(); register(app);
  const h = app.routes[key]; if (!h) throw new Error(`route ${key} not registered`);
  const res = fakeRes(); await h({ params: {}, query: {}, headers: {}, user: { id: "u1", role: "admin" }, ...req }, res); return res;
}
/** A Supabase stand-in: from(table) returns `tables[table]` for lists and its first row for single reads. */
function fakeSb(tables = {}) {
  return {
    from(t) {
      const rows = tables[t] || [];
      const chain = new Proxy({}, { get: (_, k) => k === "then" ? (f, r) => Promise.resolve({ data: rows, error: null }).then(f, r)
        : (k === "maybeSingle" || k === "single") ? async () => ({ data: rows[0] ?? null, error: null }) : () => chain });
      return chain;
    },
  };
}

const sales = await import("../../server/lib/salesRoutes.mjs");
responder = () => JSON.stringify({ summary: "Met the client on site.", lead: {}, project: { project_type: "extension" }, qualifying: { qualify_budget: 2 }, activity: { type: "meeting", summary: "Site meeting" } });
await check("Sales: meeting transcript analysis", "sales_transcript",
  () => sales.analyseTranscriptWithBlueprint("Client: our budget is about 900k and we own the block.", { first_name: "Jo", stage: "qualify" }),
  (r) => r.summary === "Met the client on site." && r.project.project_type === "extension");

const marketingAgent = await import("../../server/lib/marketingAgent.mjs");
const mode = Object.keys(marketingAgent.MODE_PROMPTS)[0];
responder = () => JSON.stringify({ headline: "Slab day", body: "Poured in the rain, finished clean." });
await check("Marketing agent: generateContent", "marketing_content",
  () => marketingAgent.generateContent(mode, { topic: "Slab pour" }, "Write a short post"), (r) => r && typeof r === "object");

const marketingRoutes = await import("../../server/lib/marketingRoutes.mjs");
await check("Marketing: POST /api/marketing/generate", "marketing_content",
  () => route(marketingRoutes.registerMarketingRoutes, "POST /api/marketing/generate", { body: { mode, topic: "Slab pour", user_request: "Write a short post" } }),
  (res) => res.statusCode === 200 && res.body?.ok === true);
streamText = JSON.stringify({ headline: "Frame up", body: "Frames stood today." });
await check("Marketing: POST /api/marketing/generate/stream (streamed; thinking events ignored)", "marketing_content",
  () => route(marketingRoutes.registerMarketingRoutes, "POST /api/marketing/generate/stream", { body: { mode, topic: "Frame", user_request: "Write it" } }),
  (res) => calls[0]?.stream === true && res.chunks.some((c) => c.includes('"done":true')) && !res.chunks.some((c) => c.includes('"error"')));

const media = await import("../../server/lib/marketingMedia.mjs");
const tmp = mkdtempSync(join(tmpdir(), "blh-ai-test-"));
const frames = [0, 1].map((i) => { const p = join(tmp, `f${i}.jpg`); writeFileSync(p, Buffer.from([0xff, 0xd8, 0xff, 0xd9])); return p; });
responder = () => "```json\n" + JSON.stringify({ project_stage: "frame", construction_progress_summary: "Wall frames up." }) + "\n```";
await check("Marketing media: drone-frame analysis", "marketing_vision", () => media.analyseFramesWithClaude(frames, { suburb: "Stirling" }), (r) => r.project_stage === "frame");
rmSync(tmp, { recursive: true, force: true });

const inbox = await import("../../server/lib/marketingLibraryInboxRoutes.mjs");
const { LIBRARY_CATEGORIES } = await import("../../server/lib/marketingLibraryRoutes.mjs");
responder = () => LIBRARY_CATEGORIES[1];
await check("Marketing inbox: photo sort", "marketing_photo_sort", () => inbox.classifyWithHaiku(Buffer.from("img"), "image/jpeg"), (r) => r === LIBRARY_CATEGORIES[1]);

const procurement = await import("../../server/lib/procurementAiService.mjs");
responder = () => JSON.stringify({ summary: "Can supply in 10 days.", priceExGst: 4500, leadDays: 10, actionNeeded: null });
await check("Procurement: supplier reply summary", "procurement_summary", () => procurement.summariseSupplierReply("We can do it for $4,500 ex GST, 10 days."), (r) => !!r);
responder = () => "Subject: Quote request — 12 Hill St\n\nHi, could you quote the items below.";
await check("Procurement: supplier quote-request draft", "procurement_draft",
  () => procurement.draftSupplierEmail(fakeSb({ suppliers: [{ id: "s1", name: "Timber Co", email: "t@example.com" }], procurement_items: [{ id: "i1", item_name: "Wall frames", job_id: "j1" }], projects: [{ address: "12 Hill St" }] }), { supplierId: "s1", itemIds: ["i1"] }),
  (r) => /Quote request/.test(JSON.stringify(r)));

const insights = await import("../../server/lib/projectInsights.mjs");
responder = () => JSON.stringify({ title: "Framing 12% over budget", body: "Framing is $4,200 over its $35,000 budget." });
await check("Project insights: alert text", "project_insight", () => insights.generateInsight({ trade: "framing", variance_pct: 12 }, "budget_risk"), (r) => r.title === "Framing 12% over budget");

const schedulePlan = await import("../../server/lib/scheduleClaudePlan.mjs");
responder = () => JSON.stringify({ tasks: [{ name: "Wall frames", duration_days: 5 }] });
await check("Schedule: generate a programme", "schedule_generate",
  () => schedulePlan.generateSchedulePlanWithClaude({ categoryBlocks: [{ phase: "frame", phaseLabel: "Frame", lineItems: ["Wall frames"] }], buildingFacts: { storeys: 1 } }),
  (r) => r.tasks.length === 1);

const scheduleRoutes = await import("../../server/lib/scheduleRoutes.mjs");
responder = () => "- Order trusses 4 weeks ahead\n- Check crane access";
await check("Schedule: POST /api/schedule/task-advice", "schedule_task_advice",
  () => route(scheduleRoutes.registerScheduleRoutes, "POST /api/schedule/task-advice", { body: { taskName: "Roof trusses" } }), (res) => /trusses/.test(res.body?.advice || ""));

const diary = await import("../../server/lib/siteDiaryRoutes.mjs");
responder = () => JSON.stringify({ weather: "fine", trades_onsite: ["Framing"], work_completed: "Frames up", issues: "", instructions_given: "", visitors: "" });
await check("Site diary: POST /api/diary/structure", "site_diary_structure",
  () => route(diary.registerSiteDiaryRoutes, "POST /api/diary/structure", { body: { transcript: "Fine day, framers stood the walls." } }), (res) => res.body?.structured?.weather === "fine");

const supervisor = await import("../../server/lib/supervisorRoutes.mjs");
responder = () => "```json\n" + JSON.stringify({ type: "diary", data: { weather: "rainy", tradesOnSite: ["Plumbing"], workCompleted: "Rough-in", issues: "", nextSteps: "" } }) + "\n```";
await check("Supervisor: POST /api/supervisor/parse-voice (a fenced JSON reply is accepted)", "supervisor_voice",
  () => route(supervisor.registerSupervisorRoutes, "POST /api/supervisor/parse-voice", { body: { transcript: "Rainy, plumbers did rough-in." } }), (res) => res.body?.ok === true && res.body.result.type === "diary");

const voice = await import("../../server/lib/voiceTasks.mjs");
responder = () => JSON.stringify([{ title: "Fix the gutter on the north side", priority: "normal", category: "general", description: "" }]);
await check("Voice tasks: transcript → draft tasks", "voice_tasks", () => voice.splitTranscriptToTasks("Need to fix the gutter on the north side."), (r) => r.length === 1);

const module4 = await import("../../server/lib/module4Routes.mjs");
responder = () => "Hi Dave,\n\nJust following up on the roofing quote for 12 Hill St.";
await check("Tendering: POST /api/tender/query-draft (reply names the model that answered)", "tender_email_draft",
  () => route(module4.registerModule4Routes, "POST /api/tender/query-draft", { body: { address: "12 Hill St", trade: "Roofing" } }), (res) => res.body?.ok === true && res.body.model === SONNET && /following up/.test(res.body.body));

const module5 = await import("../../server/lib/module5Routes.mjs");
responder = () => JSON.stringify({ quote_number: "Q1", address: "12 Hill St", net_total: 100, categories: [] });
await check("Fee proposal: POST /api/fee-proposal/parse-pdf", "fee_proposal_parse",
  () => route(module5.registerModule5Routes, "POST /api/fee-proposal/parse-pdf", { body: { dataBase64: Buffer.from("%PDF-1.4 test").toString("base64") } }), () => calls.length === 1);

const costIntel = await import("../../server/lib/costIntelligenceRoutes.mjs");
responder = () => JSON.stringify({ fields: { floor_area_m2: { value: 210, confidence: 80 } }, overall_confidence: 75, notes: "" });
await check("Cost intelligence: plan PDF metrics", "cost_plan_metrics",
  () => route(costIntel.registerCostIntelligenceRoutes, "POST /api/cost-intelligence/jobs/:jobId/metrics/extract", { params: { jobId: "j1" }, body: { pdf_base64: "JVBERi0xLjQ=" } }), () => calls.length === 1);

const finance = await import("../../server/lib/financeRoutes.mjs");
responder = () => JSON.stringify({ document_kind: "invoice", supplier_name: "Bunnings", amount_total: 110 });
await check("Finance: invoice OCR", "invoice_extract", () => finance.extractInvoiceHaiku("aW1n", "image/png"), (r) => r.supplier_name === "Bunnings");
responder = () => JSON.stringify({ trade_category_id: "c1", confidence: 90 });
await check("Finance: invoice trade category", "invoice_classify",
  () => finance.inferTradeCategory(null, { supplierName: "Timber Co", description: "Framing timber" }, [{ id: "c1", name: "Carpentry" }, { id: "c2", name: "Plumbing" }]),
  (r) => r.trade_category_id === "c1" && r.source === "ai");
{
  // The AI job match never ran before (undefined MODEL): it stays off unless the owner sets FINANCE_AI_JOB_MATCH=1.
  const doc = { supplier_name: "Acme Plumbing", extracted_address: "4 Quarry Rd Stirling" }, ctx = { jobs: [{ id: "j1", address: "17 Mount Barker Rd Hahndorf" }], subcontractors: [] };
  calls.length = 0; process.env.FINANCE_AI_JOB_MATCH = "";
  const off = await finance.matchDocument(doc, ctx);
  ok("Finance: the AI job match is off by default (as it always was in practice): no call, the invoice stays unmatched", off.job_id === null && calls.length === 0, JSON.stringify(off));
  process.env.FINANCE_AI_JOB_MATCH = "1";
  responder = () => JSON.stringify({ job_id: "j1", confidence: 100, reasoning: "Address matches" });
  await check("Finance: AI job match with FINANCE_AI_JOB_MATCH=1, confidence capped at 90 (never auto-approved)", "invoice_classify",
    () => finance.matchDocument(doc, ctx), (r) => r?.job_id === "j1" && r.match_method === "ai" && r.match_confidence === 90);
  process.env.FINANCE_AI_JOB_MATCH = "";
}

const docReview = await import("../../src/blueprint/lib/documentReview.js");
responder = () => "## Score: 72/100\n## Summary\nSolid scope, no payment terms.";
await check("Blueprint: document review (through the task caller)", "blueprint_document_review",
  () => docReview.runAttachmentDocumentReview({ callModel: (p) => createForTask(fake, "blueprint_document_review", p, { module: "test" }),
    attachments: [{ kind: "text", name: "proposal.txt", text: "Fixed price proposal for 12 Hill St. Scope: extension." }], messages: [{ role: "user", content: "Review this proposal" }] }),
  (r) => /Score: 72/.test(r));
{
  let e = null; try { await docReview.runAttachmentDocumentReview({ attachments: [{ kind: "text", text: "x" }], messages: [] }); } catch (x) { e = x; }
  ok("…and the review can't be called without the task caller (no path around the logger)", /callModel is required/.test(e?.message || ""));
}

section("Fallback and declines on a migrated module");
script = { [SONNET]: apiError(404, "not_found_error", `model: ${SONNET}`) };
responder = () => JSON.stringify({ summary: "From the fallback.", lead: {}, project: {}, qualifying: {}, activity: {} });
calls.length = 0; _resetAiModelState();
{
  const r = await sales.analyseTranscriptWithBlueprint("Short transcript.", null);
  const [first, second] = calls.map((c) => c.params);
  ok("a model the key can't use (404) → the same request on Haiku 4.5, adapted (no effort), and the reply still parses",
    r.summary === "From the fallback." && first.model === SONNET && second?.model === DEFAULT_FALLBACK_MODEL && !second.output_config && second.messages === first.messages, calls.map((c) => c.params.model).join());
}
script = { [SONNET]: apiError(400, "invalid_request_error", "tool_choice: type 'tool' is not supported for this model") };
calls.length = 0; _resetAiModelState();
{
  await sales.analyseTranscriptWithBlueprint("Short transcript.", null);
  const st = aiModelStatus();
  ok("a 400 about one task's request skips that model for that task only; a 404 / 403 (the key) skips it for every task",
    st.tasks.sales_transcript.using === DEFAULT_FALLBACK_MODEL && st.tasks.schedule_generate.using === SONNET && st.skipped.length === 1 && st.skipped[0].task === "sales_transcript", JSON.stringify(st.skipped));
}
script = { [HAIKU]: "refusal" };
responder = () => JSON.stringify({ trade_category_id: "c2", confidence: 70 });
calls.length = 0; _resetAiModelState();
{
  const r = await finance.inferTradeCategory(null, { supplierName: "Pipe Co" }, [{ id: "c2", name: "Plumbing" }]);
  ok("a request a model declines (stop_reason refusal) is answered by the fallback model, and the model isn't skipped afterwards",
    r.trade_category_id === "c2" && calls.map((c) => c.params.model).join() === `${HAIKU},${DEFAULT_FALLBACK_MODEL}` && aiModelStatus().skipped.length === 0
    && aiModelStatus().recentFallbacks[0]?.reason === "declined", JSON.stringify(aiModelStatus().recentFallbacks));
}
script = { [HAIKU]: "refusal", [DEFAULT_FALLBACK_MODEL]: "refusal" };
calls.length = 0; _resetAiModelState();
{
  const r = await finance.inferTradeCategory(null, { supplierName: "Pipe Co" }, [{ id: "c2", name: "Plumbing" }]);
  ok("…declined by both: the caller's own no-answer path runs (no category), two calls, no more", r.trade_category_id === null && calls.length === 2, JSON.stringify(r));
}
script = {};

_setAiClientForTests(null);
console.log(`\nai-models-migration: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
