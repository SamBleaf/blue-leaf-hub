/**
 * sandbox-register-rooms.test.mjs — Rooms and Site & Existing in a real browser and through the real API (R05 P4c, P4d; Tab 27 Gates 4 and 5).
 * Headless Chromium against the loopback sandbox SPA, Hub API, PostgREST and Postgres, at desktop and phone width.
 * Refuses any non-loopback URL. Keys come only from ~/.blh-register-sandbox/. Credentials are never printed.
 * Screenshots: ~/blh-register-evidence/r05/p4cd/
 *
 * Run: node scripts/tests/sandbox-register-rooms.test.mjs   (sandbox postgrest + gateway + api + SPA running)
 */
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { makeRoom, emptyMeta, makeItem } from "../../src/lib/register.js";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const { chromium } = await import("playwright");

const SPA = "http://localhost:5184", API = "http://localhost:8797", GW = "http://localhost:54321";
for (const u of [SPA, API, GW]) if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) { console.error("Refusing: loopback sandbox only."); process.exit(2); }
try { await fetch(SPA, { signal: AbortSignal.timeout(5000) }); } catch { console.error("The sandbox SPA isn't reachable on :5184. Start it first."); process.exit(1); }

const SB_DIR = join(homedir(), ".blh-register-sandbox");
const secrets = JSON.parse(readFileSync(join(SB_DIR, "secrets.json"), "utf8"));
const creds = JSON.parse(readFileSync(join(SB_DIR, "credentials.local.json"), "utf8"));
const EVIDENCE = join(homedir(), "blh-register-evidence", "r05", "p4cd");
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
  const r = await api("POST", "/api/sales/leads", { first_name: "Rooms", last_name: `Site${n}`, name: `Rooms Site ${n}`, email: `rooms-${Date.now()}-${n}@example.invalid`, phone: "0400 000 000",
    site_address: buildTestJobAddress({ suite: "REGISTER-ROOMS", workflowId: `P4CD-${n}` }), suburb: "Stirling", project_type: "renovation", lead_source: "referral", is_test: true, stage: "winning_offer" });
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
const rooms = {
  bed: makeRoom({ id: "rs_bed", name: "Bed 1", roomType: "bedroom", level: "Upper", order: 0 }),
  bed2: makeRoom({ id: "rs_bed2", name: "Bed 2", roomType: "bedroom", level: "Upper", order: 1, scope: "renovated" }),
  laundry: makeRoom({ id: "rs_laundry", name: "Laundry", roomType: "laundry", level: "Ground", order: 2 }),
  living: makeRoom({ id: "rs_living", name: "Living", roomType: "living", level: "Ground", order: 3 }),
};
const pickRoom = (p, room) => by(p, "room-picker").selectOption(room.id);
const def = (promptKey, category, zone, zoneLabel, path, label) => makeItem({ itemKind: "selection", category, promptKey, section: "project", isDefault: true, certainty: "preference",
  answer: { v: 1, state: "recorded", nature: "choice", zone: zone ? { key: zone, label: zoneLabel } : null, selected: [{ optionId: path[path.length - 1], path, label }] } });
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function main() {
  browser = await chromium.launch();
  const id = await mkLead();
  const defaults = [
    def("W-017", "flooring", "bedroom_floor", "Bedrooms", ["carpet"], "Carpet"),
    def("W-017", "flooring", "main_floor", "Main floor", ["tile"], "Tile"),
    def("W-019", "paint", "walls", "Walls", ["palette", "warm"], "Palette · Warm"),
    def("W-019", "paint", "ceiling", "Ceiling", ["ceiling", "square_set"], "Ceiling · Square set"),
    def("W-019", "paint", "wet_area", "Wet area", ["palette", "cool"], "Palette · Cool"),
  ];
  const seeded = await api("PUT", `/api/register/leads/${id}`, { meta: { ...emptyMeta({ planRev: "Concept A", renovationOverlay: true, rooms: Object.values(rooms), lastStep: "rooms", lastRoomId: rooms.bed.id }), rev: 0 }, changes: defaults });
  if (!seeded.ok) throw new Error(`seed failed: ${JSON.stringify(seeded.body).slice(0, 300)}`);
  const p = await newPage({ viewport: { width: 1440, height: 1000 } });
  await open(p, id, "rooms");
  await pickRoom(p, rooms.bed);

  section("A compact list instead of the same questions again (B10)");
  await by(p, "room-defaults").waitFor({ timeout: 15000 });
  const panel = await by(p, "room-defaults").innerText();
  check("floor, walls and ceiling are each listed", /Carpet/.test(panel) && /Warm/.test(panel) && /Square set/.test(panel), panel);
  check("the ceiling reaches the room (review finding)", (await by(p, "room-default-R-006-ceiling").count()) === 1);
  check("the question isn't asked again underneath", (await by(p, "prompt-R-005").count()) === 0 && (await by(p, "prompt-R-006").count()) === 0);
  check("it says what confirming isn't", /isn't client approval or a technical check/.test(panel));
  await p.screenshot({ path: join(EVIDENCE, "room-defaults-desktop.png"), fullPage: false });

  section("Confirm records applicability and nothing else");
  await by(p, "confirm-room-defaults").click();
  await saved(p);
  let reg = await getReg(id);
  const bedRoom = () => reg.meta.rooms.find((r) => r.id === rooms.bed.id);
  check("the room holds the three confirmations", Object.keys(bedRoom().defaultConfirmations).length === 3, JSON.stringify(bedRoom().defaultConfirmations).slice(0, 300));
  check("who and when are recorded", Object.values(bedRoom().defaultConfirmations).every((c) => c.at && c.by));
  check("no default was approved, verified or priced", reg.items.every((i) => i.certainty !== "client_approved" && i.technicalStatus !== "verified" && i.pricingStatus === "not_reviewed"));
  check("no per-room copies were made", reg.items.filter((i) => i.roomId).length === 0);
  check("the sibling room wasn't confirmed", Object.keys(reg.meta.rooms.find((r) => r.id === rooms.bed2.id).defaultConfirmations).length === 0);
  check("once confirmed the button goes away", (await by(p, "confirm-room-defaults").count()) === 0);
  const { data: leadRow } = await svc.from("leads").select("selections_schedule").eq("id", id).single();
  check("the confirmation is in the saved row (DB)", JSON.stringify(leadRow.selections_schedule).includes("defaultConfirmations"));

  section("One surface can differ without touching anything else");
  await by(p, "room-exception-R-006-ceiling").click();
  await by(p, "prompt-R-006").waitFor();
  await by(p, "choice-R-006-ceiling-cornice").click();
  await saved(p);
  reg = await getReg(id);
  const ceilingDefault = reg.items.find((i) => i.promptKey === "W-019" && i.answer.zone.key === "ceiling");
  const exception = reg.items.find((i) => i.roomId === rooms.bed.id && i.promptKey === "R-006");
  check("the exception names the surface it changes", exception?.overridesDefaultId === ceilingDefault.id && exception.answer.zone.key === "ceiling");
  check("the whole-house ceiling didn't move", ceilingDefault.answer.selected[0].optionId === "square_set");
  check("the walls are still confirmed", /Confirmed/.test(await by(p, "room-default-R-006-walls").innerText()));
  check("the ceiling reads as different here", /Different here/.test(await by(p, "room-default-R-006-ceiling").innerText()));
  await pickRoom(p, rooms.bed2);
  await by(p, "room-default-R-006-ceiling").waitFor();
  check("the next bedroom still reads the whole-house ceiling", /Square set/.test(await by(p, "room-default-R-006-ceiling").innerText()) && /To confirm/.test(await by(p, "room-default-R-006-ceiling").innerText()));
  await pickRoom(p, rooms.laundry);
  await by(p, "room-default-R-006-wet_area").waitFor();
  check("a laundry reads the wet-area surface too", /Cool/.test(await by(p, "room-default-R-006-wet_area").innerText()));

  section("A changed default flags the room and doesn't move it");
  await by(p, "step-whole_house").click();
  await inSlot(p, "slot-W-019-walls", "choice-W-019-palette-cool").click();
  await saved(p);
  await by(p, "step-rooms").click();
  await pickRoom(p, rooms.bed);
  await by(p, "room-default-R-006-walls").waitFor();
  check("the confirmed room is flagged", /Changed since confirmed/.test(await by(p, "room-default-R-006-walls").innerText()));
  check("the summary counts it", /1 changed/.test(await by(p, "room-defaults").innerText()));
  check("the floor is still confirmed", /Confirmed/.test(await by(p, "room-default-R-005").innerText()));
  check("confirm offers just that one", /\(1\)/.test(await by(p, "confirm-room-defaults").innerText()));
  await by(p, "confirm-room-defaults").click();
  await saved(p);
  check("confirming it clears the flag", /Confirmed/.test(await by(p, "room-default-R-006-walls").innerText()) && (await by(p, "confirm-room-defaults").count()) === 0);

  section("Quantities stay out of the meeting (B08)");
  await by(p, "prompt-R-006").getByRole("button", { name: "Office fields" }).click();
  const officeOpen = await by(p, "prompt-R-006").innerText();
  check("no quantity field in a room", !/Quantity/.test(officeOpen));
  check("no pricing field in a room", !/Pricing \(link/.test(officeOpen));
  await by(p, "prompt-R-006").getByRole("button", { name: "Less" }).click();
  reg = await getReg(id);
  check("quantity stays null, not zero (DB via API)", reg.items.every((i) => i.quantity === null));

  section("Site & Existing: area, action, element, one record (B06)");
  await by(p, "step-site").click();
  await by(p, "element-W-004-walls").first().waitFor({ timeout: 15000 });
  check("protect and match aren't a second question", (await by(p, "prompt-W-006").count()) === 0);
  await by(p, `area-W-004-${rooms.living.id}`).first().click();
  await by(p, "element-W-004-walls").first().click();
  await by(p, "choice-W-004-demolish").first().click();
  await saved(p);
  reg = await getReg(id);
  let works = reg.items.filter((i) => i.promptKey === "W-004");
  check("one record with its area, element and action", works.length === 1 && works[0].answer.areaIds[0] === rooms.living.id && works[0].answer.element.key === "walls" && works[0].disposition === "remove");
  check("nothing was typed", !works[0].description);
  const workId = works[0].id;
  await p.screenshot({ path: join(EVIDENCE, "site-existing-desktop.png"), fullPage: false });

  section("The same record from the room");
  await by(p, "step-rooms").click();
  await pickRoom(p, rooms.living);
  await by(p, "add-existing-here").waitFor({ timeout: 10000 });
  const roomText = await by(p, "register-workshop").innerText();
  check("the room shows the existing work", /Existing works here/.test(roomText) && (await by(p, "card-W-004").count()) === 1);
  await by(p, "choice-W-004-retain").first().click();
  await saved(p);
  reg = await getReg(id);
  works = reg.items.filter((i) => i.promptKey === "W-004");
  check("editing it here changed the same record", works.length === 1 && works[0].id === workId && works[0].disposition === "retain");
  await by(p, "step-site").click();
  await by(p, "choice-W-004-retain").first().waitFor();
  check("and Site & Existing shows the change", await pressed(by(p, "choice-W-004-retain").first()));
  await by(p, "choice-W-004-protect").first().click();
  await saved(p);
  reg = await getReg(id);
  check("Protect keeps the W-006 source id on the record", reg.items.find((i) => i.id === workId).answer.sourceQuestionIds.join() === "W-006");
  await by(p, "step-rooms").click();
  await pickRoom(p, rooms.bed2);
  await by(p, "add-existing-here").click();
  await by(p, "element-W-004-floors").first().click();
  await saved(p);
  reg = await getReg(id);
  const addedHere = reg.items.find((i) => i.promptKey === "W-004" && i.answer.areaIds.includes(rooms.bed2.id));
  check("work added from a room is a site record covering that room", !!addedHere && !addedHere.roomId && addedHere.section === "site");
  await by(p, "step-site").click();
  await by(p, "element-W-004-floors").first().waitFor();
  check("and is on Site & Existing", (await by(p, "card-W-004").count()) === 2);

  section("External works, scope first (B07)");
  await by(p, "element-W-010-driveway").first().click();
  await by(p, "choice-W-010-new").first().click();
  check("New asks what kind", (await by(p, "choice-W-010-new-exposed_aggregate").count()) === 1);
  await by(p, "choice-W-010-new-exposed_aggregate").first().click();
  await saved(p);
  await by(p, "add-another-W-010").click();
  await by(p, "element-W-010-fencing").last().click();
  await by(p, "choice-W-010-retain").last().click();
  await saved(p);
  check("Retain asks nothing about materials", (await by(p, "card-W-010").last().getByTestId(/choice-W-010-retain-/).count()) === 0);
  reg = await getReg(id);
  const ext = reg.items.filter((i) => i.promptKey === "W-010");
  check("one record per element, each with its own status", ext.length === 2 && ext.map((i) => i.disposition).sort().join() === "new,retain");

  section("Site facts are answered as facts (MR-UX-02)");
  await by(p, "choice-W-001-narrow_or_restricted_access").click();
  await by(p, "choice-W-001-steep_access").click();
  await saved(p);
  reg = await getReg(id);
  const access = reg.items.find((i) => i.promptKey === "W-001");
  check("two constraints, no typing, no work status", access.answer.selected.length === 2 && access.disposition === "undecided" && !access.description && access.answer.nature === "fact");
  check("the card offers no work dropdown", !/Existing to Remain/.test(await by(p, "prompt-W-001").innerText()));

  section("Outstanding and resume (Gate 5)");
  await by(p, "step-rooms").click();
  await pickRoom(p, rooms.bed);
  await by(p, "outstanding-toggle").click();
  const summary = await by(p, "outstanding-summary").innerText();
  check("what's open is grouped by place", /Bed 1|Site & existing|Whole house/.test(summary), summary);
  const siteLink = by(p, "outstanding-go-site");
  if (await siteLink.count()) { await siteLink.click(); await by(p, "element-W-004-floors").first().waitFor(); check("a tap goes straight there", true); }
  else check("a tap goes straight there", false, summary);
  await by(p, "step-rooms").click();
  await pickRoom(p, rooms.laundry);
  await saved(p).catch(() => {});
  await p.waitForTimeout(1600);
  const pr = await newPage({ viewport: { width: 1440, height: 1000 } });
  await pr.goto(`${SPA}/sales/${id}`, { waitUntil: "domcontentloaded" });
  await by(pr, "register-workshop").first().waitFor({ timeout: 45000 });
  if (await by(pr, "continue-brief").count()) await by(pr, "continue-brief").first().click();
  await by(pr, "room-picker").waitFor({ timeout: 15000 });
  check("Continue brief returns to the room left off", (await by(pr, "room-picker").inputValue()) === rooms.laundry.id);
  await pr.context().close();

  section("Phone width");
  const m = await newPage({ viewport: { width: 375, height: 812 }, hasTouch: true });
  await open(m, id, "rooms");
  await pickRoom(m, rooms.bed2);
  await by(m, "room-defaults").waitFor({ timeout: 15000 });
  check("no sideways scrolling in a room", await noOverflow(m));
  const btn = await by(m, "confirm-room-defaults").boundingBox();
  check("confirm is big enough to tap", !!btn && btn.height >= 40, JSON.stringify(btn));
  await by(m, "confirm-room-defaults").tap();
  await saved(m);
  await m.screenshot({ path: join(EVIDENCE, "room-defaults-375.png"), fullPage: false });
  await by(m, "step-site").tap();
  await by(m, "element-W-004-walls").first().waitFor();
  check("no sideways scrolling on Site & Existing", await noOverflow(m));
  await m.screenshot({ path: join(EVIDENCE, "site-existing-375.png"), fullPage: false });
  await m.context().close();

  await p.context().close();
  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
}

try { await main(); }
catch (e) { fail++; console.log(`  ✗ test stopped: ${e.message.slice(0, 900)}\n${(e.stack || "").split("\n").slice(1, 4).join("\n")}`); }
finally { await browser?.close(); }
console.log(`\nsandbox-register-rooms: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
