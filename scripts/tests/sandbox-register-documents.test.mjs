/**
 * sandbox-register-documents.test.mjs — the document outputs through the real API, Postgres and LibreOffice (R05 P5, Tab 27 Gate 6).
 * Card answers in the existing documents, the internal Tender Scope & Pricing Notes, issue, revision and immutability, and proof
 * it can't reach a client. Refuses any non-loopback URL. Keys come only from ~/.blh-register-sandbox/. Credentials are never printed.
 * Run: node scripts/tests/sandbox-register-documents.test.mjs   (sandbox postgrest + gateway + api + SPA running)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { makeRoom, emptyMeta, makeItem, setCategoryTier, BASELINE_CATEGORIES } from "../../src/lib/register.js";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const { chromium } = await import("playwright");

const SPA = "http://localhost:5184", API = "http://localhost:8797", GW = "http://localhost:54321";
for (const u of [SPA, API, GW]) if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) { console.error("Refusing: loopback sandbox only."); process.exit(2); }
try { await fetch(SPA, { signal: AbortSignal.timeout(5000) }); } catch { console.error("The sandbox SPA isn't reachable on :5184. Start it first."); process.exit(1); }

const SB_DIR = join(homedir(), ".blh-register-sandbox");
const secrets = JSON.parse(readFileSync(join(SB_DIR, "secrets.json"), "utf8"));
const creds = JSON.parse(readFileSync(join(SB_DIR, "credentials.local.json"), "utf8"));
const EVIDENCE = join(homedir(), "blh-register-evidence", "r05", "p5");
mkdirSync(EVIDENCE, { recursive: true });
const svc = createClient(GW, secrets.service_key, { auth: { persistSession: false } });
const anon = () => createClient(GW, secrets.anon_key, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await anon().auth.signInWithPassword({ email: creds.staff.email, password: creds.staff.password });
if (authErr) { console.error("Sandbox sign-in failed."); process.exit(1); }
const session = auth.session;
const headers = { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" };

let pass = 0, fail = 0, seq = 0;
const check = (n, c, d = "") => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `\n      ${String(d).slice(0, 500)}` : ""}`); } };
const section = (t) => console.log(`\n▸ ${t}`);

async function api(method, path, body, h = headers) {
  const r = await fetch(API + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ok: r.ok, body: await r.json().catch(() => null) };
}
async function mkLead() {
  const n = ++seq;
  const r = await api("POST", "/api/sales/leads", { first_name: "Docs", last_name: `Test${n}`, name: `Docs Test ${n}`, email: `docs-${Date.now()}-${n}@example.invalid`, phone: "0400 000 000",
    site_address: buildTestJobAddress({ suite: "REGISTER-DOCS", workflowId: `P5-${n}` }), suburb: "Stirling", project_type: "renovation", lead_source: "referral", is_test: true, stage: "consultants" });
  if (!r.body?.ok) throw new Error(`could not create a lead: ${r.status}`);
  return r.body.lead.id;
}
const getReg = async (id) => (await api("GET", `/api/register/leads/${id}`)).body.register;
const byPrompt = (reg, q) => reg.items.filter((i) => i.promptKey === q && !i.roomId);
const live = (i) => (i?.answer?.selected || []).filter((s) => !s.stale);

const pageErrors = [];
let browser;
async function newPage(opts) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-localhost-auth-token", JSON.stringify(session)]);
  const page = await ctx.newPage();
  await page.route("**/api/blueprint/chat", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, reply: "Stub" }) }));
  page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 300)));
  return page;
}
const by = (p, id) => p.getByTestId(id).filter({ visible: true });
const inSlot = (p, slot, id) => by(p, slot).getByTestId(id);
async function open(p, id, step = "whole_house") {
  await p.goto(`${SPA}/sales/${id}`, { waitUntil: "domcontentloaded" });
  await by(p, "register-workshop").first().waitFor({ timeout: 45000 });
  const start = by(p, "continue-brief");
  if (await start.count()) await start.first().click();
  await by(p, `step-${step}`).waitFor({ timeout: 15000 });
  await by(p, `step-${step}`).click();
}
async function saved(p) {
  const badge = p.getByTestId("register-save-state").filter({ visible: true });
  await badge.filter({ hasText: /^Saved/ }).waitFor({ timeout: 15000 }).catch(async () => { throw new Error(`never reached Saved, badge says: ${await badge.innerText().catch(() => "(none)")}`); });
}
async function settle(p) { await p.waitForTimeout(1500); await saved(p); }
const pressed = async (loc) => (await loc.getAttribute("aria-pressed")) === "true";
const focusId = (p) => p.evaluate(() => document.activeElement?.getAttribute("data-testid"));
const pdfText = (b64, name) => {
  const f = join(tmpdir(), `docs-${process.pid}-${name}.pdf`);
  writeFileSync(f, Buffer.from(b64, "base64"));
  try { return execFileSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" }); } catch { return null; }
};

const kitchen = makeRoom({ id: "dc_kitchen", name: "Kitchen", roomType: "kitchen", level: "Ground", order: 0 });
const item = (promptKey, itemKind, category, more) => makeItem({ promptKey, itemKind, category, section: more?.section || "project", ...more });
const answer = (selected, more = {}) => ({ v: 1, state: "recorded", selected: selected.map(([path, label]) => ({ optionId: path[path.length - 1], path, label })), ...more });
const NOTE = "STAFFONLYP58841";

async function main() {
  browser = await chromium.launch();
  const id = await mkLead();
  const baseline = setCategoryTier(null, "kitchen", "standard", { at: "2026-11-10", by: "Staff" });
  const items = [
    item("W-013", "selection", "cladding", { isDefault: true, certainty: "preference", technicalStatus: "needs_verification", answer: answer([[["render", "rendered_aac"], "Render · Rendered AAC"]], { nature: "choice", zone: { key: "main_walls", label: "Main walls" }, note: NOTE }) }),
    item("K-005", "selection", "benchtop", { isDefault: true, certainty: "preference", answer: answer([[["engineered_stone"], "Engineered stone"]], { nature: "choice", zone: { key: "kitchen", label: "Kitchen" } }) }),
    item("W-001", "scope", "site", { section: "site", answer: answer([[["steep_access"], "Steep access"]], { nature: "fact" }) }),
    item("W-004", "scope", "demolition", { section: "site", disposition: "remove", answer: answer([[["demolish"], "Demolish"]], { nature: "scope", element: { id: "el_a", key: "walls", label: "Walls" }, areaIds: [kitchen.id] }) }),
  ];
  const seeded = await api("PUT", `/api/register/leads/${id}`, { meta: { ...emptyMeta({ planRev: "Concept A", rooms: [kitchen], baseline }), rev: 0 }, changes: items });
  if (!seeded.ok) throw new Error(`seed failed ${JSON.stringify(seeded.body).slice(0, 300)}`);
  const tierText = BASELINE_CATEGORIES.find((c) => c.key === "kitchen").tiers.standard;

  section("The three existing documents print card answers");
  for (const kind of ["client_brief", "architect_brief", "selections_schedule"]) {
    const r = await api("POST", `/api/register/leads/${id}/documents/${kind}/preview`, { recipientName: "Docs Test" });
    const text = r.ok ? pdfText(r.body.pdf, kind)?.replace(/\s+/g, " ") : "";
    check(`${kind} renders`, r.ok && !!text, JSON.stringify(r.body).slice(0, 200));
    check(`${kind} carries no tier wording, assumption or staff note`, !text.includes(tierText) && !/pricing assumption/i.test(text) && !text.includes(NOTE));
    if (kind === "selections_schedule") check("the schedule prints what was tapped", /Engineered stone/.test(text) && /Rendered AAC/.test(text), text.slice(0, 400));
    if (kind === "client_brief") {
      check("steep access isn't work", !/Included[^.]*Steep access/.test(text));
      check("demolition prints against its room", /Kitchen: Walls/.test(text), text.slice(0, 600));
    }
  }

  section("Tender Scope & Pricing Notes");
  const pv = await api("POST", `/api/register/leads/${id}/documents/tender_scope_notes/preview`, { recipientName: "Blue Leaf estimating" });
  const previewText = pv.ok ? pdfText(pv.body.pdf, "tender")?.replace(/\s+/g, " ") : "";
  const f = join(tmpdir(), `docs-${process.pid}-plain.pdf`);
  writeFileSync(f, Buffer.from(pv.body.pdf, "base64"));
  const reading = execFileSync("pdftotext", [f, "-"], { encoding: "utf8" }).replace(/\s+/g, " ");
  const squeezed = reading.replace(/\s+/g, "");
  check("preview renders with no blocking checks", pv.ok && pv.body.checks.errors.length === 0, JSON.stringify(pv.body?.checks || pv.body).slice(0, 300));
  check("it says internal only", /Internal only/i.test(previewText) && /Blue Leaf estimating only/.test(previewText));
  check("the assumption is there and labelled", squeezed.includes(tierText.replace(/\s+/g, "")) && /draftwording/.test(squeezed), reading.slice(-700));
  check("facts are recorded as facts", /Site and household facts/.test(previewText) && /Steep access/.test(previewText));
  check("staff notes are here and only here", squeezed.includes(NOTE), reading.slice(reading.indexOf("Construction systems"), reading.indexOf("Construction systems") + 500));
  check("there is no dollar sign", !previewText.includes("$"));

  section("Issue, revise, immutable history (Gate 6 CHECK)");
  const blank = await api("POST", `/api/register/leads/${id}/documents/tender_scope_notes/issue`, { recipientName: "" });
  check("no recipient, no issue", blank.status === 422 && blank.body?.code === "PREFLIGHT");
  const stale = await api("POST", `/api/register/leads/${id}/documents/tender_scope_notes/issue`, { recipientName: "Blue Leaf estimating", expectedVersions: { made_up_item: 1 } });
  check("a stale preview can't be issued", stale.status === 409 && stale.body?.code === "ISSUE_STALE", JSON.stringify(stale.body).slice(0, 200));
  const first = await api("POST", `/api/register/leads/${id}/documents/tender_scope_notes/issue`, { recipientName: "Blue Leaf estimating", expectedVersions: pv.body.itemVersions });
  check("P01 issues", first.ok && first.body.document.revision_label === "P01", JSON.stringify(first.body).slice(0, 300));
  const p1 = first.body.document;
  check("the audience is internal (DB)", p1.audience === "internal" && p1.document_type === "tender_scope_notes");
  await new Promise((r) => setTimeout(r, 1200));
  const fresh = await getReg(id);
  const changed = await api("PUT", `/api/register/leads/${id}`, { changes: [{ ...fresh.items.find((i) => i.promptKey === "K-005"), colour: "Polar white" }], deletes: [] });
  check("the register moves on", changed.ok, JSON.stringify(changed.body).slice(0, 200));
  const second = await api("POST", `/api/register/leads/${id}/documents/tender_scope_notes/issue`, { recipientName: "Blue Leaf estimating" });
  check("P02 issues", second.ok && second.body.document.revision_label === "P02", JSON.stringify(second.body).slice(0, 300));
  check("P02 says what it replaced", second.body.supersededId === p1.id);
  const { data: rowsAfter } = await svc.from("lead_documents").select("id, status, content_sha256, storage_path, revision_label").eq("lead_id", id).eq("document_type", "tender_scope_notes").order("version");
  check("P01 is superseded, its hash and file unchanged (DB)", rowsAfter[0].status === "superseded" && rowsAfter[0].content_sha256 === p1.content_sha256 && rowsAfter[0].storage_path === p1.storage_path);
  check("P02 is current (DB)", rowsAfter[1].status === "current" && rowsAfter[1].content_sha256 !== p1.content_sha256);
  const { error: tamper } = await svc.from("lead_documents").update({ content_sha256: "tampered" }).eq("id", p1.id);
  check("an issued row can't be rewritten (DB trigger)", !!tamper);
  const url = await api("GET", `/api/register/leads/${id}/documents/${p1.id}/url`);
  check("P01 can still be opened", url.ok && !!url.body.url);
  const docx = await api("GET", `/api/register/leads/${id}/documents/${p1.id}/url?export=docx`);
  check("and its DOCX export", docx.ok && !!docx.body.url);
  const unknown = await api("POST", `/api/register/leads/${id}/documents/rfq_pack/issue`, { recipientName: "x" });
  check("an unknown document type is refused", unknown.status === 400);

  section("It can't reach a client or trade");
  const { data: clientAuth } = await anon().auth.signInWithPassword({ email: creds.client.email, password: creds.client.password });
  const clientHeaders = { authorization: `Bearer ${clientAuth.session.access_token}`, "content-type": "application/json" };
  const listed = await api("GET", `/api/register/leads/${id}/documents`, null, clientHeaders);
  check("a client token gets no document list", !listed.ok);
  const clientDb = createClient(GW, secrets.anon_key, { auth: { persistSession: false }, global: { headers: { authorization: `Bearer ${clientAuth.session.access_token}` } } });
  const { data: clientRows } = await clientDb.from("lead_documents").select("id").eq("document_type", "tender_scope_notes");
  check("a client token reads no row (RLS, DB)", (clientRows || []).length === 0);
  const pack = await api("GET", `/api/register/leads/${id}/packs/architect`);
  if (pack.ok) { const pt = pdfText(pack.body.pdf, "pack")?.replace(/\s+/g, " ") || ""; check("a supplier pack carries none of it", !pt.includes(tierText) && !pt.includes(NOTE)); }
  else check("a supplier pack carries none of it (no items tagged for it)", pack.status === 422, JSON.stringify(pack.body).slice(0, 200));

  section("On screen");
  const p = await newPage({ viewport: { width: 1440, height: 1000 } });
  await open(p, id, "documents");
  await by(p, "doc-card-tender_scope_notes").waitFor({ timeout: 15000 });
  await by(p, "doc-card-tender_scope_notes").filter({ hasText: /P02/ }).waitFor({ timeout: 15000 });
  const card = await by(p, "doc-card-tender_scope_notes").innerText();
  check("the card says internal only", /Internal only/.test(card) && /Never goes to the client/.test(card), card);
  check("the current revision shows", /P02/.test(card), card);
  await by(p, "doc-card-tender_scope_notes").getByRole("button", { name: /Preview/ }).first().click();
  await by(p, "doc-card-tender_scope_notes").locator("iframe").waitFor({ timeout: 45000 });
  check("the draft opens", true);
  await p.screenshot({ path: join(EVIDENCE, "tender-notes-card.png"), fullPage: false });
  const m = await newPage({ viewport: { width: 375, height: 812 }, hasTouch: true });
  await open(m, id, "documents");
  await by(m, "doc-card-tender_scope_notes").waitFor({ timeout: 15000 });
  const offenders = await m.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && e.getClientRects().length).slice(0, 8).map((e) => `${e.tagName}.${String(e.className).slice(0, 70)} right=${Math.round(e.getBoundingClientRect().right)}`));
  check("no sideways scrolling at phone width", await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), offenders.join(" | "));
  await m.context().close();
  await p.context().close();
  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
}

try { await main(); }
catch (e) { fail++; console.log(`  ✗ test stopped: ${e.message.slice(0, 900)}\n${(e.stack || "").split("\n").slice(1, 4).join("\n")}`); }
finally { await browser?.close(); }
console.log(`\nsandbox-register-documents: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
