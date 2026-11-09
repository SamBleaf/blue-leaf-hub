/**
 * sandbox-register-wholehouse.test.mjs — Whole House in a real browser and through the real API (R05 P4b, Tab 27 Gate 3 CHECK).
 * Headless Chromium against the loopback sandbox SPA, Hub API, PostgREST and Postgres, at desktop and phone width.
 *
 * Mixed AAC and feature cladding, flat and pitched roofs with linked gutters, main and bedroom floors, kitchen and scullery,
 * bathroom and ensuite, staff-only performance suggestions, the pricing guide, promotion to the project record, and
 * proof that neither the guide nor a suggestion reaches a client.
 *
 * Refuses any non-loopback URL. Keys come only from ~/.blh-register-sandbox/. Credentials are never printed.
 * Screenshots: ~/blh-register-evidence/r05/p4b/
 *
 * Run: node scripts/tests/sandbox-register-wholehouse.test.mjs   (sandbox postgrest + gateway + api + SPA running)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { makeRoom, emptyMeta, makeItem, outstandingReasons, stableStringify, BASELINE_CATEGORIES, PERFORMANCE_SUGGESTIONS } from "../../src/lib/register.js";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const { chromium } = await import("playwright");

const SPA = "http://localhost:5184", API = "http://localhost:8797", GW = "http://localhost:54321";
for (const u of [SPA, API, GW]) if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) { console.error("Refusing: loopback sandbox only."); process.exit(2); }
try { await fetch(SPA, { signal: AbortSignal.timeout(5000) }); } catch { console.error("The sandbox SPA isn't reachable on :5184. Start it first."); process.exit(1); }

const SB_DIR = join(homedir(), ".blh-register-sandbox");
const secrets = JSON.parse(readFileSync(join(SB_DIR, "secrets.json"), "utf8"));
const creds = JSON.parse(readFileSync(join(SB_DIR, "credentials.local.json"), "utf8"));
const EVIDENCE = join(homedir(), "blh-register-evidence", "r05", "p4b");
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
  const r = await api("POST", "/api/sales/leads", { first_name: "Whole", last_name: `House${n}`, name: `Whole House ${n}`, email: `wholehouse-${Date.now()}-${n}@example.invalid`, phone: "0400 000 000",
    site_address: buildTestJobAddress({ suite: "REGISTER-WHOLEHOUSE", workflowId: `P4B-${n}` }), suburb: "Stirling", project_type: "new_build", lead_source: "referral", is_test: true, stage: "winning_offer" });
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
  const f = join(tmpdir(), `wholehouse-${process.pid}-${name}.pdf`);
  writeFileSync(f, Buffer.from(b64, "base64"));
  try { return execFileSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" }); } catch { return null; }
};

const rooms = {
  kitchen: makeRoom({ id: "wh_kitchen", name: "Kitchen", roomType: "kitchen", level: "Ground", order: 0 }),
  scullery: makeRoom({ id: "wh_scullery", name: "Scullery", roomType: "scullery", level: "Ground", order: 1 }),
  bathroom: makeRoom({ id: "wh_bathroom", name: "Bathroom", roomType: "bathroom", level: "Upper", order: 2 }),
  ensuite: makeRoom({ id: "wh_ensuite", name: "Ensuite", roomType: "ensuite", level: "Upper", order: 3 }),
  living: makeRoom({ id: "wh_living", name: "Living", roomType: "living", level: "Ground", order: 4 }),
  bed: makeRoom({ id: "wh_bed", name: "Bed 1", roomType: "bedroom", level: "Upper", order: 5 }),
  laundry: makeRoom({ id: "wh_laundry", name: "Laundry", roomType: "laundry", level: "Ground", order: 6 }),
};
const pickRoom = (p, room) => by(p, "room-picker").selectOption(room.id);

async function main() {
  browser = await chromium.launch();
  const id = await mkLead();
  await api("PUT", `/api/register/leads/${id}`, { meta: { ...emptyMeta({ planRev: "Concept A", rooms: Object.values(rooms), lastStep: "whole_house" }), rev: 0 }, changes: [] });
  const p = await newPage({ viewport: { width: 1440, height: 1000 } });
  await open(p, id);

  section("Several wall systems (B01, DEC-MRUX-01)");
  await by(p, "zone-W-013-main_walls").click();
  await by(p, "choice-W-013-render").click();
  await by(p, "choice-W-013-render-rendered_aac").click();
  await by(p, "add-another-W-013").click();
  await by(p, "zone-W-013-feature").last().click();
  await by(p, "choice-W-013-lightweight_cladding").last().click();
  await by(p, "choice-W-013-lightweight_cladding-fibre_cement_sheet").last().click();
  await saved(p);
  let reg = await getReg(id);
  let walls = byPrompt(reg, "W-013");
  check("AAC render and fibre cement are two records, each with its zone and its own status", walls.length === 2 && walls.map((w) => w.answer.zone.key).sort().join() === "feature,main_walls" && walls.every((w) => w.certainty === "preference" && w.disposition === "undecided"));
  check("nothing typed", walls.every((w) => !w.description));

  section("Roof systems with gutters separate (MR-UX-01B)");
  check("no gutter row before there is a roof", (await by(p, "card-W-014-gutters").count()) === 0);
  await by(p, "zone-W-014-main_roof").click();
  await by(p, "choice-W-014-metal_roofing").click();
  await by(p, "choice-W-014-metal_roofing-pitched").click();
  await by(p, "choice-W-014-metal_roofing-pitched-corrugated").click();
  await by(p, "choice-W-014-metal_roofing-pitched-corrugated-dark_tone").click();
  await by(p, "card-W-014-gutters").waitFor();
  check("the gutter row appears under the roof and asks only about gutters", (await by(p, "card-W-014-gutters").innerText()).includes("Quad") && !(await by(p, "card-W-014-gutters").innerText()).includes("Metal roofing"));
  await by(p, "choice-W-014-gutters-quad").click();
  check("one gutter record per roof, so its + Add another is the roof's own", (await by(p, "add-another-W-014-gutters").count()) === 0 && (await by(p, "add-another-W-014").count()) === 1);
  await by(p, "add-another-W-014").click();
  await by(p, "zone-W-014-alfresco_or_verandah").last().click();
  await by(p, "choice-W-014-metal_roofing").last().click();
  await by(p, "choice-W-014-metal_roofing-flat_or_low_pitch").last().click();
  await by(p, "choice-W-014-metal_roofing-flat_or_low_pitch-standing_seam").last().click();
  await by(p, "choice-W-014-gutters-box_gutter").last().click();
  await saved(p);
  await p.screenshot({ path: join(EVIDENCE, "walls-roof-desktop.png"), fullPage: false });
  reg = await getReg(id);
  const roofs = byPrompt(reg, "W-014").filter((i) => !i.answer?.linkedItemIds?.length);
  const gutters = byPrompt(reg, "W-014").filter((i) => i.answer?.linkedItemIds?.length);
  const pitched = roofs.find((r) => r.answer.zone?.key === "main_roof"), alfresco = roofs.find((r) => r.answer.zone?.key === "alfresco_or_verandah");
  check("a pitched main roof and a low-pitch alfresco are separate records", roofs.length === 2 && live(pitched)[0].path.join("/") === "metal_roofing/pitched/corrugated/dark_tone" && live(alfresco)[0].path.join("/") === "metal_roofing/flat_or_low_pitch/standing_seam");
  check("two gutter records, each linked to its own roof", gutters.length === 2 && gutters.find((g) => live(g)[0].optionId === "quad").answer.linkedItemIds[0] === pitched.id && gutters.find((g) => live(g)[0].optionId === "box_gutter").answer.linkedItemIds[0] === alfresco.id);
  check("gutters aren't defaults and say what they are", gutters.every((g) => !g.isDefault && g.answer.element.key === "gutters" && g.itemKind === "selection"));
  check("the roof's answer doesn't mention them", !JSON.stringify(pitched.answer.selected).includes("gutter"));
  check("a roof needs checking against the plans and manufacturer data, and claims nothing", pitched.technicalStatus === "needs_verification" && !pitched.evidence);

  await by(p, "prompt-W-014").last().getByTitle("Remove this item").click();
  await saved(p);
  reg = await getReg(id);
  check("removing a roof leaves its gutter on the record and on the page", byPrompt(reg, "W-014").length === 3 && (await by(p, "card-W-014-gutters").count()) === 2);
  await p.reload({ waitUntil: "domcontentloaded" });
  await by(p, "card-W-014-gutters").first().waitFor({ timeout: 45000 });
  check("and after a reload", (await by(p, "card-W-014-gutters").count()) === 2);

  section("Windows and doors");
  await by(p, "choice-W-015-glazing-double_glazing").click();
  await by(p, "choice-W-015-frame-aluminium").click();
  await by(p, "choice-W-015-frame_colour-dark").click();
  await by(p, "choice-W-018-door_height-2340").click();
  await by(p, "choice-W-018-jamb_or_edge_detail-p50_shadowline").click();
  check("door type and skirting wait for More detail", (await by(p, "choice-W-018-door_type-standard").count()) === 0 && (await by(p, "choice-W-018-skirting-standard").count()) === 0);
  await by(p, "more-W-018").click();
  await by(p, "choice-W-018-skirting-standard").click();
  await saved(p);
  reg = await getReg(id);
  check("windows held as a requirement, nothing claimed", byPrompt(reg, "W-015")[0].answer.nature === "requirement" && live(byPrompt(reg, "W-015")[0]).map((s) => s.optionId).sort().join() === "aluminium,dark,double_glazing" && byPrompt(reg, "W-015")[0].technicalStatus === "needs_verification");
  check("doors are one record with its groups", byPrompt(reg, "W-018").length === 1 && live(byPrompt(reg, "W-018")[0]).length === 3);

  section("Performance goals: staff-only, review required (B04, DEC-MRUX-03)");
  check("no review list before a goal", (await by(p, "review-W-016").count()) === 0);
  await by(p, "choice-W-016-airtightness").click();
  await by(p, "choice-W-016-passive_house_target").click();
  await by(p, "review-W-016").waitFor();
  const review = await by(p, "review-W-016").innerText();
  check("marked review required and staff only", /Review required/.test(review) && /Staff only/.test(review));
  check("says nothing is selected, specified, priced or agreed", /Nothing here is selected, specified, priced or agreed/.test(review));
  check("Passive House is called an intent, not an outcome", /A Passive House target is an intent/.test(review));
  check("names the checks to confirm", /Climate zone/.test(review) && /Vapour and condensation control/.test(review));
  check("lists what each goal may prompt", /continuous air-control layer/.test(review) && /heat-recovery ventilation/.test(review));
  await p.screenshot({ path: join(EVIDENCE, "performance-review-desktop.png"), fullPage: false });
  await saved(p);
  reg = await getReg(id);
  const goal = byPrompt(reg, "W-016")[0];
  check("only the goals are stored", live(goal).map((s) => s.optionId).sort().join() === "airtightness,passive_house_target" && !JSON.stringify(reg).includes(PERFORMANCE_SUGGESTIONS.airtightness[0].text));
  check("still needs verification, and that is what keeps it open", goal.technicalStatus === "needs_verification" && outstandingReasons(makeItem(goal)).join() === "verification");
  check("no product or insulation item was created from a goal", byPrompt(reg, "W-016").length === 1 && !reg.items.some((i) => i.category === "insulation" && i.promptKey !== "W-016"));
  await by(p, "choice-W-016-airtightness").click();
  check("taking a goal off takes its suggestions off", !(await by(p, "review-W-016").innerText()).includes("air-control layer"));
  await by(p, "choice-W-016-airtightness").click();

  section("Floors by zone: one tap each (MR-UX-01E)");
  check("no zone to tap", (await by(p, "zone-W-017-main_floor").count()) === 0 && (await by(p, "zone-W-017-bedroom_floor").count()) === 0);
  check("each zone is named on its row", /Main floor/.test(await by(p, "slot-W-017-main_floor").innerText()) && /Bedroom floor/.test(await by(p, "slot-W-017-bedroom_floor").innerText()) && /Wet-area floor/.test(await by(p, "slot-W-017-wet_area_floor").innerText()));
  await inSlot(p, "slot-W-017-main_floor", "choice-W-017-timber").click();
  await inSlot(p, "slot-W-017-main_floor", "choice-W-017-timber-engineered").click();
  await inSlot(p, "slot-W-017-bedroom_floor", "choice-W-017-carpet").focus();
  await p.keyboard.press("Enter");
  check("Enter on a row nothing is saved on yet selects it", await pressed(inSlot(p, "slot-W-017-bedroom_floor", "choice-W-017-carpet")));
  check("and focus stays on the button", (await focusId(p)) === "choice-W-017-carpet", await focusId(p));
  await inSlot(p, "slot-W-017-wet_area_floor", "choice-W-017-tile").click();
  await saved(p);
  reg = await getReg(id);
  let floors = byPrompt(reg, "W-017");
  check("three separate defaults from three taps of family", floors.length === 3 && floors.every((f) => f.isDefault && f.answer.selected.length === 1) && floors.map((f) => f.answer.zone.key).sort().join() === "bedroom_floor,main_floor,wet_area_floor");
  const wetId = floors.find((f) => f.answer.zone.key === "wet_area_floor").id;
  await by(p, "slot-W-017-wet_area_floor").getByTitle("Remove this item").click();
  await saved(p);
  reg = await getReg(id);
  check("× removes that zone's record", byPrompt(reg, "W-017").length === 2);
  await inSlot(p, "slot-W-017-wet_area_floor", "choice-W-017-tile").click();
  await saved(p);
  reg = await getReg(id);
  check("answering it again makes a new record with a new id", byPrompt(reg, "W-017").length === 3 && !byPrompt(reg, "W-017").some((f) => f.id === wetId));

  await by(p, "add-zone-W-017-other_zone").click();
  const otherBox = by(p, "slot-W-017-other_zone").getByLabel("Which area");
  await otherBox.pressSequentially("Sun room");
  check("an Other zone takes its own words key by key", (await otherBox.inputValue()) === "Sun room" && await otherBox.evaluate((el) => el === document.activeElement));
  await inSlot(p, "slot-W-017-other_zone", "choice-W-017-polished_concrete").click();
  await saved(p);
  reg = await getReg(id);
  check("and is its own default, named in those words", byPrompt(reg, "W-017").some((f) => f.answer.zone.key === "other_zone" && f.answer.zone.label === "Sun room"));
  check("the used zones still show, and Other zone can be used again", (await by(p, "add-zone-W-017-other_zone").count()) === 1);

  section("Paint by surface, no generic sheen chip (MR-UX-01G)");
  const cardText = async (slot) => by(p, slot).innerText();
  check("no sheen chip on any surface until asked", !/Low sheen/.test((await cardText("slot-W-019-walls")).replace("Usual finish for this surface: Low sheen", "")) && (await p.getByTestId("choice-W-019-finish_level-low_sheen").count()) === 0);
  check("walls say what is usual", /Usual finish for this surface: Low sheen/.test(await cardText("slot-W-019-walls")));
  check("the ceiling and trim say theirs", /Flat/.test(await cardText("slot-W-019-ceiling")) && /Semi-gloss/.test(await cardText("slot-W-019-trim")));
  check("the ceiling row offers ceiling types and no palette", (await inSlot(p, "slot-W-019-ceiling", "choice-W-019-ceiling-square_set").count()) === 1 && (await inSlot(p, "slot-W-019-ceiling", "choice-W-019-palette-warm").count()) === 0);
  await inSlot(p, "slot-W-019-walls", "choice-W-019-palette-warm").click();
  await inSlot(p, "slot-W-019-ceiling", "choice-W-019-ceiling-square_set").click();
  await inSlot(p, "slot-W-019-walls", "more-W-019").click();
  await inSlot(p, "slot-W-019-walls", "choice-W-019-finish_level-matt").click();
  check("choosing a finish replaces the usual line", !/Usual finish/.test(await cardText("slot-W-019-walls")));
  await saved(p);
  reg = await getReg(id);
  const paint = byPrompt(reg, "W-019");
  check("two surfaces, two records", paint.length === 2 && paint.find((x) => x.answer.zone.key === "walls").answer.selected.map((s) => s.path.join("/")).sort().join() === "finish_level/matt,palette/warm" && paint.find((x) => x.answer.zone.key === "ceiling").answer.selected[0].path.join("/") === "ceiling/square_set");
  check("the usual finish wasn't recorded for the surface nobody chose one for", !paint.find((x) => x.answer.zone.key === "ceiling").answer.selected.some((s) => s.path[0] === "finish_level"));

  section("Kitchen, scullery, bathroom, ensuite standards (B03)");
  await inSlot(p, "slot-K-005-kitchen", "choice-K-005-engineered_stone").click();
  check("Scullery is a button away, not a row nobody asked for", (await by(p, "slot-K-005-scullery").count()) === 0);
  await by(p, "add-zone-K-005-scullery").click();
  await inSlot(p, "slot-K-005-scullery", "choice-K-005-laminate").click();
  await inSlot(p, "slot-B-008-bathroom", "choice-B-008-chrome").click();
  await by(p, "add-zone-B-008-ensuite").click();
  await inSlot(p, "slot-B-008-ensuite", "choice-B-008-brushed_brass").click();
  await inSlot(p, "slot-L-003-laundry", "choice-L-003-bench").click();
  await by(p, "slot-L-003-laundry").getByTitle("Remove this item").click();
  await saved(p);
  reg = await getReg(id);
  const bench = byPrompt(reg, "K-005"), tap = byPrompt(reg, "B-008");
  check("kitchen and scullery are separate whole-house defaults", bench.length === 2 && bench.every((b) => b.isDefault && !b.roomId && b.section === "project") && bench.map((b) => b.answer.zone.key).sort().join() === "kitchen,scullery");
  check("bathroom and ensuite too", tap.length === 2 && tap.map((b) => `${b.answer.zone.key}:${live(b)[0].optionId}`).sort().join() === "bathroom:chrome,ensuite:brushed_brass");
  check("waterproofing isn't on the page: a look isn't a technical check (B03)", !/Waterproofing/.test(await by(p, "register-workshop").innerText()));
  await p.screenshot({ path: join(EVIDENCE, "standards-desktop.png"), fullPage: false });

  section("A reload loses nothing and adds nothing");
  const beforeReload = await getReg(id);
  await p.reload({ waitUntil: "domcontentloaded" });
  await by(p, "slot-W-017-main_floor").waitFor({ timeout: 45000 });
  check("selected states are back", await pressed(inSlot(p, "slot-W-017-main_floor", "choice-W-017-timber")) && await pressed(inSlot(p, "slot-K-005-scullery", "choice-K-005-laminate")) && await pressed(by(p, "choice-W-014-gutters-quad").first()));
  const afterReload = await getReg(id);
  check("the same items, same ids", stableStringify(beforeReload.items.map((i) => i.id).sort()) === stableStringify(afterReload.items.map((i) => i.id).sort()));

  section("Rooms read the right default (Gate 3 CHECK)");
  await by(p, "step-rooms").click();
  const inherited = async (q) => by(p, `prompt-${q}`).innerText();
  await pickRoom(p, rooms.kitchen);
  await by(p, "prompt-K-005").waitFor();
  check("the kitchen reads the kitchen standard", /Whole-house default:\s*Engineered stone/.test(await inherited("K-005")), await inherited("K-005"));
  await pickRoom(p, rooms.scullery);
  await p.waitForTimeout(150);
  check("the scullery reads its own", /Whole-house default:\s*Laminate/.test(await inherited("K-005")), await inherited("K-005"));
  await pickRoom(p, rooms.bathroom);
  await by(p, "prompt-B-008").waitFor();
  check("the bathroom reads chrome", /Whole-house default:\s*Chrome/.test(await inherited("B-008")), await inherited("B-008"));
  await pickRoom(p, rooms.ensuite);
  await p.waitForTimeout(150);
  check("the ensuite reads brass", /Whole-house default:\s*Brushed brass/.test(await inherited("B-008")), await inherited("B-008"));
  await pickRoom(p, rooms.living);
  await by(p, "prompt-R-005").waitFor();
  check("living reads the main floor", /Timber · Engineered/.test(await inherited("R-005")), await inherited("R-005"));
  await pickRoom(p, rooms.laundry);
  await by(p, "prompt-L-004").waitFor();
  check("the laundry reads the wet-area floor", /Whole-house default:\s*Tile/.test(await inherited("L-004")), await inherited("L-004"));
  await pickRoom(p, rooms.bed);
  await by(p, "prompt-R-005").waitFor();
  check("a bedroom reads the bedroom floor", /Whole-house default:\s*Carpet/.test(await inherited("R-005")), await inherited("R-005"));
  await by(p, "prompt-R-005").getByRole("button", { name: "Record a room exception" }).click();
  await by(p, "choice-R-005-timber").click();
  await saved(p);
  reg = await getReg(id);
  const exception = reg.items.find((i) => i.roomId === rooms.bed.id && i.promptKey === "R-005");
  const bedDefault = byPrompt(reg, "W-017").find((f) => f.answer.zone.key === "bedroom_floor");
  check("the exception is its own record, linked to the bedroom default", exception?.overridesDefaultId === bedDefault.id);
  check("the whole-house default didn't move", live(bedDefault)[0].optionId === "carpet");
  check("no other room got a record", reg.items.filter((i) => i.promptKey === "R-005").length === 1);
  check("the room is the zone, so the exception doesn't carry the whole-house zone", !exception.answer.zone);
  await pickRoom(p, rooms.scullery);
  await by(p, "prompt-K-005").getByRole("button", { name: "Record a room exception" }).click();
  await by(p, "choice-K-005-porcelain").click();
  await saved(p);
  await by(p, "step-whole_house").click();
  await inSlot(p, "slot-K-005-scullery", "choice-K-005-timber").click();
  await saved(p);
  await by(p, "step-rooms").click();
  await pickRoom(p, rooms.scullery);
  await by(p, "prompt-K-005").waitFor();
  check("a room exception still shows when the default it came from changes", await pressed(by(p, "choice-K-005-porcelain")));

  await by(p, "step-whole_house").click();
  await inSlot(p, "slot-B-009-bathroom", "choice-B-009-full_height").click();
  await saved(p);
  await by(p, "step-rooms").click();
  await pickRoom(p, rooms.ensuite);
  await by(p, "prompt-B-009").waitFor();
  check("an ensuite with no standard of its own reads the bathroom's", /Whole-house default:\s*Full height/.test(await inherited("B-009")), await inherited("B-009"));
  await by(p, "prompt-B-009").getByRole("button", { name: "Record a room exception" }).click();
  await by(p, "choice-B-009-feature_tile").click();
  await saved(p);
  await by(p, "step-whole_house").click();
  await by(p, "add-zone-B-009-ensuite").click();
  await inSlot(p, "slot-B-009-ensuite", "choice-B-009-partial_height").click();
  await saved(p);
  await by(p, "step-rooms").click();
  await pickRoom(p, rooms.ensuite);
  await by(p, "prompt-B-009").waitFor();
  check("the exception stays on screen after a closer default appears later", await pressed(by(p, "choice-B-009-feature_tile")) && !/Whole-house default/.test(await inherited("B-009")));

  section("Pricing guide");
  await by(p, "step-whole_house").click();
  await by(p, "baseline-guide").waitFor();
  const guideText = await by(p, "baseline-guide").innerText();
  check("labelled staff only, after the client's direction, and not a choice or a price", /Staff only/.test(guideText) && /after the client's direction/.test(guideText) && /isn't a client choice, an approval or a price/.test(guideText));
  check("draft wording says so while Blue Leaf hasn't confirmed it", /Draft wording/.test(guideText));
  const onPage = await by(p, "register-workshop").innerText();
  check("it comes after the standards on the page", onPage.indexOf("Blue Leaf pricing guide") > onPage.indexOf("Laundry standards"));
  const itemsBefore = stableStringify((await getReg(id)).items);
  await by(p, "baseline-project-upgraded").click();
  await saved(p);
  reg = await getReg(id);
  check("the project guide is stored as a guide", reg.meta.baseline.projectTier === "upgraded");
  check("and fills in no category", Object.keys(reg.meta.baseline.categories).length === 0);
  check("and touches no item", stableStringify(reg.items) === itemsBefore);
  check("no assumption shows yet", (await by(p, "assumption-L-003").count()) === 0);

  await by(p, "baseline-guide").getByText("By category").click();
  await by(p, "baseline-laundry-standard").click();
  await saved(p);
  check("a blank row now reads as a labelled assumption", /Blue Leaf pricing assumption \(Standard, draft wording\):/.test(await by(p, "assumption-L-003").innerText()) && /Not a client choice, an approval or a price/.test(await by(p, "assumption-L-003").innerText()));
  await by(p, "baseline-floors-premium").click();
  await by(p, "baseline-roof-premium").click();
  await saved(p);
  reg = await getReg(id);
  check("each category keeps its own tier", reg.meta.baseline.categories.laundry.tier === "standard" && reg.meta.baseline.categories.floors.tier === "premium" && !reg.meta.baseline.categories.walls);
  check("wording, version and who are copied on", reg.meta.baseline.categories.laundry.text.length > 10 && /^blue-leaf-baseline-v/.test(reg.meta.baseline.categories.laundry.baselineVersion) && !!reg.meta.baseline.categories.laundry.by && !!reg.meta.baseline.categories.laundry.at);
  check("items are still untouched: an explicit floor stays explicit", stableStringify(reg.items) === itemsBefore);
  check("a floor someone chose shows no assumption", (await inSlot(p, "slot-W-017-main_floor", "assumption-W-017").count()) === 0);
  check("the category says the choice is what counts", /no assumption is used/.test(await by(p, "baseline-cat-floors").innerText()) || /Chosen:/.test(await by(p, "baseline-cat-floors").innerText()));
  check("roofs chosen: premium isn't applied to them", /no assumption is used/.test(await by(p, "baseline-cat-roof").innerText()));

  await by(p, "baseline-project-standard").click();
  await saved(p);
  reg = await getReg(id);
  check("changing the project guide moves no category", reg.meta.baseline.projectTier === "standard" && reg.meta.baseline.categories.floors.tier === "premium" && reg.meta.baseline.categories.roof.tier === "premium");
  await by(p, "baseline-use-project").click();
  await saved(p);
  reg = await getReg(id);
  check("the one-tap fill sets only open categories", reg.meta.baseline.categories.floors.tier === "premium" && reg.meta.baseline.categories.laundry.tier === "standard" && reg.meta.baseline.categories.hvac.tier === "standard" && !reg.meta.baseline.categories.walls && !reg.meta.baseline.categories.windows);
  check("still no item changed", stableStringify(reg.items) === itemsBefore);
  await p.screenshot({ path: join(EVIDENCE, "pricing-guide-desktop.png"), fullPage: false });

  await inSlot(p, "slot-L-003-laundry", "choice-L-003-bench").click();
  await saved(p);
  reg = await getReg(id);
  const laundry = byPrompt(reg, "L-003")[0];
  check("a real choice takes the assumption's place on the row", (await inSlot(p, "slot-L-003-laundry", "assumption-L-003").count()) === 0);
  check("and the tier stays where it was, for anything still open", reg.meta.baseline.categories.laundry.tier === "standard");
  check("the choice is a preference, never an approval", laundry.certainty === "preference" && !laundry.evidence && !laundry.answer.assumption);
  check("no record anywhere was approved by any of this", !reg.items.some((i) => i.certainty === "client_approved"));

  await by(p, "notdecided-W-020").click();
  await saved(p);
  check("Not decided is exactly where an assumption applies", /Standard/.test(await by(p, "assumption-W-020").innerText()));
  await by(p, "step-register").click();
  const parkedHvac = (await getReg(id)).items.find((i) => i.promptKey === "W-020");
  check("the office Register labels it too", /Blue Leaf assumption: Standard/.test(await by(p, `reg-row-${parkedHvac.id}`).innerText()));
  await p.screenshot({ path: join(EVIDENCE, "register-assumption-chip.png"), fullPage: false });
  await by(p, "step-whole_house").click();
  await by(p, "baseline-guide").waitFor();
  await saved(p);

  section("Older screen and bad data");
  const fresh = await getReg(id);
  const { baseline: _dropped, ...metaWithout } = fresh.meta;
  const stale = await api("PUT", `/api/register/leads/${id}`, { meta: metaWithout, changes: [] });
  check("a screen that predates the guide can save", stale.ok, JSON.stringify(stale.body).slice(0, 300));
  reg = await getReg(id);
  check("and doesn't wipe it", reg.meta.baseline.categories.floors?.tier === "premium");
  const junk = await api("PUT", `/api/register/leads/${id}`, { meta: { ...reg.meta, baseline: { projectTier: "platinum", categories: { roof: { tier: "gold", text: "made up" }, walls: { tier: "standard", text: "Kept as sent" } } } }, changes: [] });
  check("bad tiers are refused quietly and the save holds", junk.ok, JSON.stringify(junk.body).slice(0, 300));
  reg = await getReg(id);
  check("nothing unknown is stored", reg.meta.baseline.projectTier === "" && !reg.meta.baseline.categories.roof && reg.meta.baseline.categories.walls.tier === "standard");
  await api("PUT", `/api/register/leads/${id}`, { meta: { ...reg.meta, baseline: { projectTier: "standard", categories: { laundry: fresh.meta.baseline.categories.laundry, windows: { tier: "upgraded", text: BASELINE_CATEGORIES.find((c) => c.key === "windows").tiers.upgraded, baselineVersion: "blue-leaf-baseline-v1.0" }, hvac: fresh.meta.baseline.categories.hvac } } }, changes: [] });

  section("Nothing internal reaches a document");
  const forbidden = [...BASELINE_CATEGORIES.flatMap((c) => Object.values(c.tiers)), ...Object.values(PERFORMANCE_SUGGESTIONS).flat().map((s) => s.text), "pricing assumption"];
  for (const kind of ["client_brief", "architect_brief", "selections_schedule"]) {
    const r = await api("POST", `/api/register/leads/${id}/documents/${kind}/preview`, { recipientName: "Whole House" });
    const text = r.ok ? pdfText(r.body.pdf, kind) : "";
    check(`${kind} preview renders`, r.ok && !!text, JSON.stringify(r.body).slice(0, 200));
    if (text) { const squeezed = text.replace(/\s+/g, " "); check(`${kind} has no tier wording, suggestion or the word assumption`, !forbidden.some((f) => squeezed.toLowerCase().includes(f.toLowerCase())), forbidden.find((f) => squeezed.toLowerCase().includes(f.toLowerCase()))); }
  }

  section("Tender view: labelled assumptions for the estimator");
  await api("PATCH", `/api/sales/leads/${id}`, { stage: "consultants" });
  const tender = (await api("GET", `/api/register/leads/${id}/tender`)).body.tender;
  check("the assumptions in use are listed, by what still has nothing chosen", tender.assumptions.some((a) => a.key === "hvac" && a.tierLabel === "Standard" && a.status === "open"), JSON.stringify(tender.assumptions).slice(0, 400));
  check("windows have real choices, so their tier isn't used", !tender.assumptions.some((a) => a.key === "windows"));
  check("a category settled by real choices isn't", !tender.assumptions.some((a) => a.key === "roof"));
  check("each line has no amount", tender.assumptions.every((a) => !Object.keys(a).some((k) => /price|cost|amount|rate/i.test(k))));
  const t = await newPage({ viewport: { width: 1440, height: 1000 } });
  await open(t, id, "tender");
  await by(t, "tender-assumptions").waitFor({ timeout: 15000 });
  const tenderText = await by(t, "register-workshop").innerText();
  check("the screen says what they are", /Blue Leaf pricing assumptions \(internal\)/.test(tenderText) && /Not a client choice, an approval or a price/.test(tenderText));
  await t.screenshot({ path: join(EVIDENCE, "tender-assumptions.png"), fullPage: false });
  await t.context().close();

  section("Promotion: one continuous record");
  await api("PATCH", `/api/sales/leads/${id}`, { stage: "fee_proposal" });
  const conv = await api("POST", `/api/sales/leads/${id}/convert-to-job`);
  check("converted to a job", conv.ok, JSON.stringify(conv.body).slice(0, 300));
  const pc = await api("POST", `/api/sales/leads/${id}/preconstruction-portal`);
  check("project created", pc.ok, JSON.stringify(pc.body).slice(0, 300));
  const projectId = pc.body.project.id;
  const before = (await svc.from("leads").select("selections_schedule").eq("id", id).single()).data.selections_schedule.filter((r) => r.kind === "item");
  const after = await api("GET", `/api/register/leads/${id}`);
  check("now on the project record", after.body.mode === "project");
  const preg = after.body.register;
  check("every item came across with its id", before.every((i) => preg.items.some((x) => x.id === i.id)));
  check("the guide came across", preg.meta.baseline.projectTier === "standard" && preg.meta.baseline.categories.windows.tier === "upgraded");
  const { data: row } = await svc.from("projects").select("register_meta").eq("id", projectId).single();
  check("stored in register_meta on the project (DB)", row.register_meta.baseline?.categories?.windows?.tier === "upgraded");
  const { data: sels } = await svc.from("client_selections").select("source_register_item_id, client_visible, register_detail, item_name").eq("project_id", projectId);
  const gut = sels.find((s) => s.register_detail?.answer?.element?.key === "gutters");
  check("gutters are their own client-selection row, internal until issued (DB)", !!gut && gut.client_visible === false && /Gutters/.test(gut.item_name));
  check("every selection is internal", sels.every((s) => s.client_visible === false));
  check("an assumption was not written to a row (DB)", !sels.some((s) => s.register_detail?.answer?.assumption));
  const { count: actions } = await svc.from("client_actions").select("*", { count: "exact", head: true }).eq("project_id", projectId);
  check("no client task was created (DB)", actions === 0);

  const { baseline: _projectGuide, ...projectMetaWithout } = preg.meta;
  const olderProjectSave = await api("PUT", `/api/register/leads/${id}`, { meta: projectMetaWithout, changes: [] });
  check("a screen that predates the guide can save on a project too", olderProjectSave.ok, JSON.stringify(olderProjectSave.body).slice(0, 300));
  const { data: rowKept } = await svc.from("projects").select("register_meta").eq("id", projectId).single();
  check("and doesn't wipe it (DB)", rowKept.register_meta.baseline?.categories?.windows?.tier === "upgraded");

  const pp = await newPage({ viewport: { width: 1440, height: 1000 } });
  await open(pp, id);
  await by(pp, "baseline-guide").waitFor({ timeout: 15000 });
  check("on the project record the assumption still shows on an open row", /Blue Leaf pricing assumption \(Standard/.test(await by(pp, "assumption-W-020").first().innerText()));
  await by(pp, "baseline-guide").getByText("By category").click();
  await by(pp, "baseline-windows-premium").click();
  await saved(pp);
  const { data: row2 } = await svc.from("projects").select("register_meta").eq("id", projectId).single();
  check("a tier can still be changed on a project (DB)", row2.register_meta.baseline.categories.windows.tier === "premium");
  await inSlot(pp, "slot-K-004-kitchen", "choice-K-004-flat_panel").click();
  await saved(pp);
  const { data: tiles } = await svc.from("client_selections").select("register_detail, client_visible").eq("project_id", projectId);
  check("a new standard lands in the canonical store as a whole-house default (DB)", tiles.some((s) => s.register_detail?.promptKey === "K-004" && s.register_detail?.isDefault === true && s.register_detail?.answer?.zone?.key === "kitchen" && s.client_visible === false));
  await pp.context().close();

  const { data: clientAuth } = await anon().auth.signInWithPassword({ email: creds.client.email, password: creds.client.password });
  const clientDb = createClient(GW, secrets.anon_key, { global: { headers: { Authorization: `Bearer ${clientAuth.session.access_token}` } }, auth: { persistSession: false } });
  const { data: seen } = await clientDb.from("projects").select("register_meta").eq("id", projectId);
  check("a client token can't read the guide from the project row", !(seen || []).length);
  const clientApi = await api("GET", `/api/register/leads/${id}`, undefined, { authorization: `Bearer ${clientAuth.session.access_token}` });
  check("nor through the Hub API", clientApi.status === 401 || clientApi.status === 403, clientApi.status);

  section("Phone width, touch");
  const mid = await mkLead();
  await api("PUT", `/api/register/leads/${mid}`, { meta: { ...emptyMeta({ rooms: [rooms.kitchen], lastStep: "whole_house" }), rev: 0 }, changes: [] });
  const m = await newPage({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  await open(m, mid);
  await by(m, "slot-W-017-main_floor").waitFor();
  const overflow = () => m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("no sideways scroll on Whole House", (await overflow()) <= 0, await overflow());
  const floorBtn = inSlot(m, "slot-W-017-main_floor", "choice-W-017-timber");
  await floorBtn.scrollIntoViewIfNeeded();
  await floorBtn.tap();
  check("a tap selects", await pressed(floorBtn));
  const bb = await floorBtn.boundingBox();
  check("a comfortable touch target", bb.height >= 40, bb.height);
  await by(m, "zone-W-014-main_roof").scrollIntoViewIfNeeded();
  await by(m, "zone-W-014-main_roof").tap();
  await by(m, "choice-W-014-metal_roofing").tap();
  await by(m, "card-W-014-gutters").waitFor();
  check("the gutter row fits", (await overflow()) <= 0, await overflow());
  await by(m, "choice-W-014-gutters-quad").tap();
  check("gutters take a tap too", await pressed(by(m, "choice-W-014-gutters-quad")));
  await by(m, "choice-W-016-passive_house_target").scrollIntoViewIfNeeded();
  await by(m, "choice-W-016-passive_house_target").tap();
  await by(m, "review-W-016").waitFor();
  check("the review list fits", (await overflow()) <= 0, await overflow());
  await by(m, "review-W-016").scrollIntoViewIfNeeded();
  await m.screenshot({ path: join(EVIDENCE, "performance-review-375.png"), fullPage: false });
  await by(m, "baseline-project-upgraded").scrollIntoViewIfNeeded();
  await by(m, "baseline-project-upgraded").tap();
  await by(m, "baseline-guide").getByText("By category").tap();
  await by(m, "baseline-cat-walls").waitFor();
  check("the pricing guide fits", (await overflow()) <= 0, await overflow());
  await by(m, "baseline-guide").scrollIntoViewIfNeeded();
  await m.screenshot({ path: join(EVIDENCE, "pricing-guide-375.png"), fullPage: false });
  await by(m, "add-zone-K-005-scullery").scrollIntoViewIfNeeded();
  await by(m, "add-zone-K-005-scullery").tap();
  await by(m, "slot-K-005-scullery").waitFor();
  await inSlot(m, "slot-K-005-scullery", "choice-K-005-laminate").tap();
  await settle(m);
  const mreg = await getReg(mid);
  check("touch answers reached the store", byPrompt(mreg, "K-005").length === 1 && byPrompt(mreg, "K-005")[0].answer.zone.key === "scullery" && mreg.meta.baseline.projectTier === "upgraded" && byPrompt(mreg, "W-014").length === 2);
  await m.context().close();

  check("no page errors in any browser run", pageErrors.length === 0, pageErrors.join(" | "));
}

main().catch((e) => { fail++; console.log(`  ✗ test stopped: ${String(e.stack || e).slice(0, 900)}`); }).finally(async () => {
  try { await browser?.close(); } catch { /* already closed */ }
  console.log(`\nsandbox-register-wholehouse: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
