/**
 * blueprint-supabase-transport.test.mjs — the Nov 2026 Blueprint chat outage, second cause.
 *
 * Railway builds the API on Node 20 (nixpacks.toml), which has no native WebSocket. supabase-js then refuses to create
 * a client unless a WebSocket transport is passed ("Node.js 20 detected without native WebSocket support"). Blueprint's
 * knowledge lookup created its client without one, outside its own try, so every chat failed with "Blueprint hit an
 * unexpected error" before the model was called. The API key and the model were fine.
 *
 * Node 22+ has a native WebSocket, so this test removes it to reproduce the Node 20 condition. No network, no key.
 *
 *   node scripts/tests/blueprint-supabase-transport.test.mjs
 */
import fs from "node:fs";
import path from "node:path";

process.env.SUPABASE_URL = "https://abcdefghijklmnop.supabase.co";   // never contacted: the lookups fail and are caught
process.env.SUPABASE_SERVICE_ROLE_KEY = "test.service.role";
delete process.env.BLUEPRINT_USE_VOYAGE;
delete globalThis.WebSocket;                                         // as on Node 20

const { buildChatSystemPrompt } = await import("../../src/blueprint/agent/runAgent.js");
const { getRelevantContext } = await import("../../src/blueprint/agent/knowledgeBase.js");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 400)}` : ""}`); } };
const quiet = async (fn) => { const w = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = w; } };

console.log("\nWithout a native WebSocket (the Node 20 condition)");
let prompt = null, thrown = null;
try { prompt = await quiet(() => buildChatSystemPrompt("chat", "Reply with the single word OK.", {})); } catch (e) { thrown = e; }
ok("the chat system prompt builds (it threw before the fix)", !thrown && typeof prompt === "string" && prompt.length > 1000, thrown?.message);

let rag = null; thrown = null;
try { rag = await quiet(() => getRelevantContext("framing inspection", { limit: 2 })); } catch (e) { thrown = e; }
ok("the knowledge lookup returns, and an unreachable database gives no context rather than an error", !thrown && rag === "", thrown?.message);

console.log("\nA knowledge-base failure never stops the chat");
process.env.SUPABASE_URL = "not a url";   // createClient throws "Invalid supabaseUrl"
thrown = null; rag = null;
try { rag = await quiet(() => getRelevantContext("anything")); } catch (e) { thrown = e; }
ok("a client that can't be created gives no context, not an error", !thrown && rag === "", thrown?.message);

console.log("\nEvery Blueprint Supabase client passes a WebSocket transport");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const files = ["server/lib/blueprintRoutes.mjs", ...fs.readdirSync(path.join(root, "src/blueprint"), { recursive: true }).filter((f) => /\.(m?js)$/.test(f)).map((f) => `src/blueprint/${f}`)];
for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), "utf8");
  for (const m of src.matchAll(/createClient\(([^;]*?)\);/gs)) {
    ok(`${f}: createClient(${m[1].split(",")[0].trim()}, …) has a transport`, /transport/.test(m[1]), m[0]);
  }
}

console.log(`\n${fail ? "FAILED" : "PASSED"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
