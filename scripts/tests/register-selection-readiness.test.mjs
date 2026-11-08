/**
 * register-selection-readiness.test.mjs — R04 Slice 1 (P0-SEL) regression (loopback sandbox only).
 *
 * Proves the canonical Register→Portal selection fix:
 *   1. Release-readiness gate: a selection with no option and no specified product (incl. placeholder
 *      "TBC") is HELD on issue — stays client_visible=false, no client_action, not notified. A selection
 *      with a specified product OR >=1 option is released (awaiting_client).
 *   2. Single-proposal response: the client Accepts (→ in_review) or Requests changes (→ changes_requested,
 *      a DISTINCT state carrying the client's note — never a routine approval).
 *   3. Regression: an option-backed selection still works via /select (→ in_review).
 *   4. Re-issuing an in_review selection is NOT gated and preserves its status.
 * All against the SAME canonical client_selections id — no duplicate portal record.
 *
 * Run: node scripts/tests/register-selection-readiness.test.mjs
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const API = process.env.REGISTER_E2E_API || "http://localhost:8797";
const GW = process.env.REGISTER_E2E_GATEWAY || "http://localhost:54321";
for (const u of [API, GW]) if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(u)) { console.error("Refusing: loopback sandbox only."); process.exit(2); }
const SB = join(homedir(), ".blh-register-sandbox");
const secrets = JSON.parse(readFileSync(join(SB, "secrets.json"), "utf8"));
const handoff = JSON.parse(readFileSync(join(SB, "staging-handoff.json"), "utf8"));
const creds = JSON.parse(readFileSync(join(SB, "credentials.local.json"), "utf8"));
const svc = createClient(GW, secrets.service_key, { auth: { persistSession: false } });
const anon = () => createClient(GW, secrets.anon_key, { auth: { persistSession: false } });

const CLIENT = creds.client || { email: creds.client_email, password: creds.client_password };
const LEAD = handoff.projects.find((p) => p.label.includes("P3")).leadId;
const PROJECT = "f4de74e9-26ce-4ae4-b45e-3991d3e36256";
const MARK = `RDY-TEST-${Date.now()}`;

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `\n      ${d}` : ""}`); } };

async function signIn(c) { const { data, error } = await anon().auth.signInWithPassword({ email: c.email, password: c.password }); if (error) throw new Error(`${c.email}: ${error.message}`); return data.session.access_token; }
async function api(tok, method, path, body) {
  const r = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${tok}` }, body: body ? JSON.stringify(body) : undefined });
  let b = null; try { b = await r.json(); } catch { /* */ }
  return { ok: r.ok, status: r.status, body: b };
}
async function insertSel({ name, product = null, visible = false, status = "not_started", options = 0 }) {
  const { data, error } = await svc.from("client_selections").insert({
    project_id: PROJECT, item_name: name, category: "tapware", status, client_visible: visible,
    selected_product: product, register_detail: { section: "project", description: name, categoryKey: "tapware" },
  }).select("id, updated_at").single();
  if (error) throw new Error(`insert ${name}: ${error.message}`);
  for (let i = 0; i < options; i++) {
    await svc.from("selection_options").insert({ selection_id: data.id, label: `Option ${i + 1}`, product_name: `${name} opt ${i + 1}`, price_inc_gst: 100 + i * 50 });
  }
  return data.id;
}
async function selRow(id) { const { data } = await svc.from("client_selections").select("id, status, client_visible, selected_product, client_notes").eq("id", id).maybeSingle(); return data; }
async function clientActions(id) { const { data } = await svc.from("client_actions").select("id, status").eq("project_id", PROJECT).eq("related_entity_type", "client_selection").eq("related_entity_id", id); return data || []; }
// Pull the exact {id, sync} the portal/issue endpoint expects, straight from the staff register GET.
async function issueItems(staff, rowIds) {
  const reg = await api(staff, "GET", `/api/register/leads/${LEAD}`);
  const items = (reg.body?.register?.items || []).filter((i) => i.sync?.table === "client_selections" && rowIds.includes(i.sync.rowId));
  return items.map((i) => ({ id: i.id, sync: i.sync }));
}
async function cleanup() {
  const { data } = await svc.from("client_selections").select("id").eq("project_id", PROJECT).like("item_name", `${MARK}%`);
  for (const r of data || []) { await svc.from("selection_options").delete().eq("selection_id", r.id); await svc.from("client_selections").delete().eq("id", r.id); }
}

async function main() {
  const staff = await signIn(handoff.staff_login);
  const client = await signIn(CLIENT);
  await cleanup();

  // ── build staged selections ───────────────────────────────────────────────
  const A = await insertSel({ name: `${MARK} A product`, product: "Caroma Luna basin mixer, brushed nickel" });
  const B = await insertSel({ name: `${MARK} B empty`, product: null });
  const C = await insertSel({ name: `${MARK} C placeholder`, product: "TBC" });
  const D = await insertSel({ name: `${MARK} D options`, product: null, options: 2 });
  const F = await insertSel({ name: `${MARK} F product`, product: "Phoenix Vivid shower rail, matte black" });

  // ── 1. Release-readiness gate ─────────────────────────────────────────────
  const items = await issueItems(staff, [A, B, C, D, F]);
  ok("register GET surfaces all 5 staged selections", items.length === 5, `got ${items.length}`);
  const issue = await api(staff, "POST", `/api/register/leads/${LEAD}/portal/issue`, { items });
  ok("portal/issue returns ok with a held list", issue.ok && Array.isArray(issue.body?.held), `${issue.status} ${JSON.stringify(issue.body?.held)}`);
  const heldIds = new Set((issue.body?.held || []).map((h) => h.itemId));
  const idToItem = Object.fromEntries(items.map((i) => [i.sync.rowId, i.id]));
  ok("B (no product) is HELD", heldIds.has(idToItem[B]));
  ok("C (placeholder 'TBC') is HELD", heldIds.has(idToItem[C]));
  ok("A (product) is NOT held", !heldIds.has(idToItem[A]));
  ok("D (options) is NOT held", !heldIds.has(idToItem[D]));

  const [rA, rB, rC, rD] = await Promise.all([selRow(A), selRow(B), selRow(C), selRow(D)]);
  ok("A released: client_visible + awaiting_client", rA.client_visible === true && rA.status === "awaiting_client", JSON.stringify(rA));
  ok("D released: client_visible + awaiting_client", rD.client_visible === true && rD.status === "awaiting_client", JSON.stringify(rD));
  ok("B stays staged: client_visible=false, still not_started", rB.client_visible === false && rB.status === "not_started", JSON.stringify(rB));
  ok("C stays staged: client_visible=false", rC.client_visible === false, JSON.stringify(rC));
  ok("held B generated NO client_action (no false task/notification)", (await clientActions(B)).length === 0);
  ok("released A generated a client_action", (await clientActions(A)).length >= 1);

  // ── 2. Single-proposal response: Accept ───────────────────────────────────
  const acc = await api(client, "POST", `/api/portal/app/${PROJECT}/selections/${A}/respond`, { action: "accept" });
  ok("client Accept → 200 in_review", acc.ok && acc.body?.status === "in_review", `${acc.status} ${JSON.stringify(acc.body)}`);
  const rAacc = await selRow(A);
  ok("A now in_review, same id, product preserved", rAacc.status === "in_review" && rAacc.selected_product === "Caroma Luna basin mixer, brushed nickel");
  ok("Accept cleared the client action (responded)", (await clientActions(A)).every((a) => a.status === "responded"));

  // ── 2b. Single-proposal response: Request changes (DISTINCT outcome) ───────
  const rc = await api(client, "POST", `/api/portal/app/${PROJECT}/selections/${F}/respond`, { action: "request_change", notes: "Prefer chrome, not matte black" });
  ok("client Request-change → 200 changes_requested", rc.ok && rc.body?.status === "changes_requested", `${rc.status} ${JSON.stringify(rc.body)}`);
  const rF = await selRow(F);
  ok("F is changes_requested (NOT in_review — not a routine approval)", rF.status === "changes_requested");
  ok("F carries the client's requested change note", rF.client_notes === "Prefer chrome, not matte black");
  const rcNoNote = await api(client, "POST", `/api/portal/app/${PROJECT}/selections/${D}/respond`, { action: "request_change" });
  ok("Request-change without a note is rejected (400)", !rcNoNote.ok && rcNoNote.status === 400, `${rcNoNote.status}`);

  // ── 3. Regression: option-backed selection still works via /select ─────────
  const sel = await api(client, "POST", `/api/portal/app/${PROJECT}/selections/${D}/select`, { optionId: (await svc.from("selection_options").select("id").eq("selection_id", D).limit(1).single()).data.id });
  ok("option path /select still → in_review", sel.ok && sel.body?.status === "in_review", `${sel.status} ${JSON.stringify(sel.body)}`);

  // ── 4. Re-issue an in_review selection is NOT gated and preserves status ───
  const reitems = await issueItems(staff, [A]);
  const reissue = await api(staff, "POST", `/api/register/leads/${LEAD}/portal/issue`, { items: reitems });
  ok("re-issue of in_review A is not gated (ok, not held)", reissue.ok && !(reissue.body?.held || []).some((h) => h.itemId === reitems[0]?.id), `${reissue.status} ${JSON.stringify(reissue.body?.held)}`);
  ok("A status preserved as in_review after re-issue", (await selRow(A)).status === "in_review");

  // ── respond guard: /respond refuses a selection with no proposed product ───
  await svc.from("client_selections").update({ client_visible: true, status: "awaiting_client" }).eq("id", B);
  const noProd = await api(client, "POST", `/api/portal/app/${PROJECT}/selections/${B}/respond`, { action: "accept" });
  ok("/respond refuses a selection with no proposed product (409)", !noProd.ok && noProd.status === 409, `${noProd.status}`);

  await cleanup();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
