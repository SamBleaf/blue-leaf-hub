/**
 * sandbox-register-guided.test.mjs — the guided answer cards in a real browser (R05 P4a, Tab 27 Gate 2 CHECK).
 * Headless Chromium against the loopback sandbox SPA, Hub API, PostgREST and Postgres, at desktop and phone width.
 *
 * Covers what a string render can't: tapping and keyboard use on the live page, what actually reaches the store,
 * autosave, a reload, a real version conflict on a project record, phone-width touch and no page overflow.
 *
 * Refuses any non-loopback URL. Keys come only from ~/.blh-register-sandbox/. Credentials are never printed.
 * Screenshots: ~/blh-register-evidence/r05/p4a/
 *
 * Run: node scripts/tests/sandbox-register-guided.test.mjs   (sandbox postgrest + gateway + api + SPA running)
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { outstandingReasons, makeItem } from "../../src/lib/register.js";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const { chromium } = await import("playwright");

const SPA = "http://localhost:5184", API = "http://localhost:8797", GW = "http://localhost:54321";
for (const u of [SPA, API, GW]) if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) { console.error("Refusing: loopback sandbox only."); process.exit(2); }
try { await fetch(SPA, { signal: AbortSignal.timeout(5000) }); } catch { console.error("The sandbox SPA isn't reachable on :5184. Start it first."); process.exit(1); }

const SB_DIR = join(homedir(), ".blh-register-sandbox");
const secrets = JSON.parse(readFileSync(join(SB_DIR, "secrets.json"), "utf8"));
const creds = JSON.parse(readFileSync(join(SB_DIR, "credentials.local.json"), "utf8"));
const EVIDENCE = join(homedir(), "blh-register-evidence", "r05", "p4a");
mkdirSync(EVIDENCE, { recursive: true });
const svc = createClient(GW, secrets.service_key, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await createClient(GW, secrets.anon_key, { auth: { persistSession: false } }).auth.signInWithPassword({ email: creds.staff.email, password: creds.staff.password });
if (authErr) { console.error("Sandbox sign-in failed."); process.exit(1); }
const session = auth.session;
const headers = { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" };

let pass = 0, fail = 0, seq = 0;
const check = (n, c, d = "") => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `\n      ${String(d).slice(0, 400)}` : ""}`); } };
const section = (t) => console.log(`\n▸ ${t}`);

async function api(method, path, body) {
  const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const created = [];
async function mkLead(extra = {}) {
  const n = ++seq;
  const r = await api("POST", "/api/sales/leads", { first_name: "Guided", last_name: `Card${n}`, name: `Guided Card ${n}`, email: `guided-${Date.now()}-${n}@example.invalid`, phone: "0400 000 000",
    site_address: buildTestJobAddress({ suite: "REGISTER-GUIDED", workflowId: `P4A-${n}` }), suburb: "Stirling", project_type: "renovation", lead_source: "referral", is_test: true, stage: "winning_offer", ...extra });
  if (!r.body?.ok) throw new Error(`could not create a lead: ${r.status}`);
  created.push(r.body.lead.id);
  return r.body.lead.id;
}
const getReg = async (id) => (await api("GET", `/api/register/leads/${id}`)).body.register;
const byPrompt = (reg, q) => reg.items.filter((i) => i.promptKey === q);

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
async function open(p, id) {
  await p.goto(`${SPA}/sales/${id}`, { waitUntil: "domcontentloaded" });
  await by(p, "register-workshop").first().waitFor({ timeout: 45000 });
  const start = by(p, "continue-brief");
  if (await start.count()) await start.first().click();
  await by(p, "step-whole_house").waitFor({ timeout: 15000 });
}
async function saved(p) {
  const badge = p.getByTestId("register-save-state").filter({ visible: true });
  await badge.filter({ hasText: /^Saved/ }).waitFor({ timeout: 15000 }).catch(async () => { throw new Error(`never reached Saved, badge says: ${await badge.innerText().catch(() => "(none)")}`); });
}
const pressed = async (loc) => (await loc.getAttribute("aria-pressed")) === "true";
const focusId = (p) => p.evaluate(() => document.activeElement?.getAttribute("data-testid"));

async function main() {
  browser = await chromium.launch();
  const id = await mkLead();

  section("Site access at desktop: taps, no typing");
  const p = await newPage({ viewport: { width: 1440, height: 1000 } });
  await open(p, id);
  await by(p, "step-site").click();
  await by(p, "card-W-001").waitFor();
  check("the generic work dropdown is gone from site access", (await by(p, "prompt-W-001").locator("select").count()) === 0);
  check("the old + chips are gone", !(await by(p, "prompt-W-001").innerText()).includes("+ Standard"));
  await by(p, "choice-W-001-steep_access").click();
  await by(p, "choice-W-001-limited_parking").click();
  check("the choices read as selected", await pressed(by(p, "choice-W-001-steep_access")) && await pressed(by(p, "choice-W-001-limited_parking")));
  check("what's recorded is spelled out", (await by(p, "summary-W-001").innerText()).includes("Steep access, Limited parking"));
  await saved(p);
  check("the card says it saved", /Saved/.test(await by(p, "summary-W-001").innerText()));
  let reg = await getReg(id);
  let access = byPrompt(reg, "W-001")[0];
  check("one record, with ids, nothing typed", byPrompt(reg, "W-001").length === 1 && access.answer.selected.map((s) => s.optionId).join() === "steep_access,limited_parking" && access.description === "");
  check("recorded as a fact, not construction scope", access.answer.nature === "fact" && access.disposition === "undecided" && access.answer.state === "recorded");
  check("not flagged as an open decision", outstandingReasons(makeItem(access)).length === 0);
  await p.screenshot({ path: join(EVIDENCE, "site-access-desktop.png"), fullPage: false });

  await by(p, "prompt-W-001").getByRole("button", { name: "Office fields" }).click();
  const office = await by(p, "prompt-W-001").innerText();
  check("the office fields on a fact offer no scope status, quantity or pricing", !/Scope \/ disposition|Quantity|Pricing/i.test(office) && /Technical verification/i.test(office));
  await by(p, "prompt-W-001").getByRole("button", { name: "Less" }).click();

  section("Keyboard");
  await by(p, "choice-W-007-yes").focus();
  await p.keyboard.press("Enter");
  check("Enter selects", await pressed(by(p, "choice-W-007-yes")));
  check("focus stays on the button after the row is created", (await focusId(p)) === "choice-W-007-yes", await focusId(p));
  await by(p, "choice-W-007-yes-temporary_kitchen").waitFor();
  await p.keyboard.press("Tab");
  check("Tab moves to the next choice", (await focusId(p)) === "choice-W-007-no", await focusId(p));
  await p.keyboard.press("Tab"); await p.keyboard.press("Tab");
  check("Tab reaches the follow-up that just appeared", (await focusId(p)) === "choice-W-007-yes-work_zones", await focusId(p));
  await p.keyboard.press("Space");
  check("Space selects the follow-up", await pressed(by(p, "choice-W-007-yes-work_zones")));
  await by(p, "choice-W-007-yes-temporary_kitchen").focus();
  await p.keyboard.press("Space");
  await saved(p);
  check("focus is visible on a choice", await by(p, "choice-W-007-yes-temporary_kitchen").evaluate((el) => getComputedStyle(el).outlineStyle !== "none" || getComputedStyle(el).boxShadow !== "none"));
  reg = await getReg(id);
  check("both follow-ups recorded, Yes implied", byPrompt(reg, "W-007")[0].answer.selected.map((s) => s.path.join("/")).sort().join() === "yes/temporary_kitchen,yes/work_zones");

  section("Changing an earlier answer");
  await by(p, "choice-W-007-no").click();
  await by(p, "kept-W-007").waitFor();
  check("the follow-ups are kept and flagged on screen", /Temporary kitchen/.test(await by(p, "kept-W-007").innerText()) && /Work zones/.test(await by(p, "kept-W-007").innerText()));
  await saved(p);
  reg = await getReg(id);
  let occ = byPrompt(reg, "W-007")[0];
  check("the store still holds them, flagged", occ.answer.selected.filter((s) => s.stale).length === 2 && occ.answer.selected.find((s) => !s.stale).optionId === "no");
  check("a flagged follow-up shows as outstanding", outstandingReasons(makeItem(occ)).includes("decision"));
  await p.screenshot({ path: join(EVIDENCE, "kept-after-branch-change.png"), fullPage: false });

  section("Reload");
  await p.reload({ waitUntil: "domcontentloaded" });
  await by(p, "card-W-001").waitFor({ timeout: 45000 });
  check("Continue opens where staff left off, choices still selected", await pressed(by(p, "choice-W-001-steep_access")) && await pressed(by(p, "choice-W-007-no")));
  check("flagged answers survive a reload", /Temporary kitchen/.test(await by(p, "kept-W-007").innerText()));
  await by(p, "kept-W-007").getByRole("button", { name: "Use again" }).first().click();
  await saved(p);
  reg = await getReg(id);
  occ = byPrompt(reg, "W-007")[0];
  check("Use again brings one back and replaces No", occ.answer.selected.some((s) => !s.stale && s.path[0] === "yes") && !occ.answer.selected.some((s) => !s.stale && s.path[0] === "no"));

  section("A risk with an owner");
  await by(p, "prompt-W-011").locator("input[placeholder^='What needs']").first().fill("Possible old footings under the slab");
  await by(p, "choice-W-011-investigation").click();
  await by(p, "prompt-W-011").locator("select").first().selectOption("blue_leaf");
  await saved(p);
  reg = await getReg(id);
  let risk = byPrompt(reg, "W-011")[0];
  check("recorded with what it is, how to handle it and who has it", risk.description.includes("old footings") && risk.answer.selected[0].optionId === "investigation" && risk.responsibility === "blue_leaf" && risk.answer.nature === "risk" && risk.disposition === "undecided");
  check("open until done", outstandingReasons(makeItem(risk)).join() === "action");
  await by(p, "prompt-W-011").getByLabel("Done").check();
  await saved(p);
  reg = await getReg(id);
  check("Done closes it", outstandingReasons(makeItem(byPrompt(reg, "W-011")[0])).length === 0);

  section("Scope first: external works");
  await by(p, "element-W-010-driveway").click();
  await by(p, "choice-W-010-new").click();
  await by(p, "choice-W-010-new-exposed_aggregate").click();
  await saved(p);
  reg = await getReg(id);
  let dw = byPrompt(reg, "W-010")[0];
  check("a driveway in exposed aggregate with no typing", dw.answer.element.key === "driveway" && !!dw.answer.element.id && dw.disposition === "new" && dw.answer.selected[0].path.join("/") === "new/exposed_aggregate" && dw.description === "");
  await by(p, "add-another-W-010").click();
  await by(p, "element-W-010-fencing").last().click();
  await by(p, "choice-W-010-by_others").last().click();
  await saved(p);
  reg = await getReg(id);
  check("a second element is its own record", byPrompt(reg, "W-010").length === 2 && byPrompt(reg, "W-010").some((i) => i.answer.element.key === "fencing" && i.disposition === "by_others"));
  check("no material asked of work by others (B07)", !(await p.getByTestId("choice-W-010-by_others-timber").count()));

  section("Whole house: trees, Not decided, repeat");
  await by(p, "step-whole_house").click();
  await by(p, "card-W-014").waitFor();
  await by(p, "choice-W-014-metal_roofing").click();
  await by(p, "choice-W-014-metal_roofing-pitched").click();
  await by(p, "choice-W-014-metal_roofing-pitched-corrugated").click();
  await by(p, "notdecided-W-013").click();
  await by(p, "reasons-W-013").waitFor();
  await by(p, "reason-W-013-blue_leaf_to_advise").click();
  check("the reason suggests who has it", (await by(p, "reasons-W-013").locator("select").inputValue()) === "blue_leaf");
  await by(p, "add-another-W-013").click();
  await by(p, "zone-W-013-feature").last().click();
  await by(p, "choice-W-013-lightweight_cladding").last().click();
  await by(p, "choice-W-013-lightweight_cladding-fibre_cement_sheet").last().click();
  await by(p, "zone-W-017-main_floor").click();
  await by(p, "choice-W-017-timber").click();
  await by(p, "add-another-W-017").click();
  await by(p, "zone-W-017-wet_area_floor").last().click();
  await by(p, "choice-W-017-tile").last().click();
  await by(p, "choice-W-018-door_height-2340").click();
  await by(p, "choice-W-018-jamb_or_edge_detail-p50_shadowline").click();
  await saved(p);
  reg = await getReg(id);
  const roof = byPrompt(reg, "W-014")[0];
  check("the roof tree stored its path", roof.answer.selected[0].path.join("/") === "metal_roofing/pitched/corrugated" && roof.answer.selected[0].label === "Metal roofing · Pitched · Corrugated");
  check("a choice is a preference, never an approval", roof.certainty === "preference" && !roof.evidence);
  const walls = byPrompt(reg, "W-013");
  const wall = walls.find((w) => w.answer.state === "unresolved");
  const feature = walls.find((w) => w.answer.zone?.key === "feature");
  check("a second wall system is its own record, no typing (B01)", walls.length === 2 && feature.answer.selected[0].label === "Lightweight cladding · Fibre cement sheet" && !feature.description);
  check("Not decided needs no note, and has a reason and an owner", wall.answer.state === "unresolved" && wall.answer.unresolved.reason === "blue_leaf_to_advise" && wall.responsibility === "blue_leaf" && !wall.answer.note && !wall.description);
  const floors = byPrompt(reg, "W-017");
  check("two floor defaults, one per zone", floors.length === 2 && floors.every((f) => f.isDefault) && floors.map((f) => f.answer.zone.key).sort().join() === "main_floor,wet_area_floor");
  check("door height and jamb both held", byPrompt(reg, "W-018")[0].answer.selected.map((s) => s.label).join(" | ") === "Door height · 2340 | Jamb or edge detail · P50 shadowline");
  await p.screenshot({ path: join(EVIDENCE, "whole-house-desktop.png"), fullPage: false });

  section("More detail and a note");
  await by(p, "more-W-013").first().click();
  check("Deferred and Existing to remain appear", !!(await by(p, "settle-W-013-deferred").first().count()) && !!(await by(p, "settle-W-013-retain").first().count()));
  await by(p, "note-W-014").click();
  await by(p, "note-input-W-014").fill("Check the fascia");
  await saved(p);
  reg = await getReg(id);
  check("the note is on the answer and nowhere else", byPrompt(reg, "W-014")[0].answer.note === "Check the fascia" && !byPrompt(reg, "W-014")[0].description);

  section("Approval stays where it was, and a choice can't make one");
  await by(p, "prompt-W-014").getByRole("button", { name: "Office fields" }).click();
  await by(p, "prompt-W-014").locator("label", { hasText: "Client status" }).locator("xpath=following-sibling::select").selectOption("client_approved");
  await by(p, "prompt-W-014").getByPlaceholder("Reference (meeting, email date, document)…").fill("Meeting 10 Nov");
  await by(p, "prompt-W-014").getByRole("button", { name: "Confirm" }).click();
  await saved(p);
  reg = await getReg(id);
  check("client approval still takes evidence, in the office fields", byPrompt(reg, "W-014")[0].certainty === "client_approved" && !!byPrompt(reg, "W-014")[0].evidence?.by);
  check("once approved it is no longer open", !outstandingReasons(makeItem(byPrompt(reg, "W-014")[0])).includes("decision"));
  await by(p, "choice-W-014-metal_roofing-pitched-standing_seam").click();
  await saved(p);
  reg = await getReg(id);
  check("changing the answer steps it back to Proposed, evidence cleared", byPrompt(reg, "W-014")[0].certainty === "proposed" && !byPrompt(reg, "W-014")[0].evidence);
  check("and says so", await p.getByText("changed after client approval").filter({ visible: true }).count() > 0);

  section("Typing where typing is the answer");
  await by(p, "choice-W-017-other").first().click();
  await by(p, "other-W-017-other").first().pressSequentially("Other recycled boards");
  check("words with spaces, and starting with Other, type normally", (await by(p, "other-W-017-other").first().inputValue()) === "Other recycled boards");
  await saved(p);
  reg = await getReg(id);
  check("they are the answer's label", byPrompt(reg, "W-017").some((f) => f.answer.selected.some((s) => s.label === "Other recycled boards")));
  await by(p, "note-input-W-014").fill("");
  await by(p, "note-input-W-014").pressSequentially("Check the fascia line");
  check("a note types normally too", (await by(p, "note-input-W-014").inputValue()) === "Check the fascia line");
  await saved(p);

  section("Project step: priorities");
  await by(p, "step-context").click();
  await by(p, "card-P-005").waitFor();
  for (const o of ["space", "comfort", "storage"]) await by(p, `choice-P-005-${o}`).click();
  check("a fourth is refused on screen", await by(p, "choice-P-005-privacy").isDisabled());
  await saved(p);
  reg = await getReg(id);
  check("priorities are ids, not a comma string", byPrompt(reg, "P-005")[0].answer.selected.length === 3 && byPrompt(reg, "P-005")[0].description === "");
  const brief = await api("POST", `/api/register/leads/${id}/documents/client_brief/preview`, { recipientName: "Guided Card" });
  const briefPath = join(tmpdir(), `guided-brief-${process.pid}.pdf`);
  writeFileSync(briefPath, Buffer.from(brief.body?.pdf || "", "base64"));
  const briefText = (() => { try { return execFileSync("pdftotext", ["-layout", briefPath, "-"], { encoding: "utf8" }); } catch { return ""; } })();
  rmSync(briefPath, { force: true });
  check("the Client Brief reads the chosen priorities", brief.status === 200 && /comfort/i.test(briefText) && /storage/i.test(briefText), `${brief.status} ${brief.body?.error || ""}`);

  section("Office table");
  await by(p, "step-register").click();
  await by(p, "register-table").waitFor();
  const fact = p.locator(`[data-testid="reg-row-${access.id}"]`).filter({ visible: true });
  const open0 = await p.getByText("Outstanding only").count();
  if (open0) await p.getByLabel("Outstanding only").uncheck();
  await fact.waitFor();
  check("a site fact has no work status to set", (await fact.innerText()).includes("Not scope"));
  check("it shows what was chosen", (await fact.locator("input").first().getAttribute("placeholder")).includes("Steep access"));
  await fact.getByRole("button", { name: "Edit" }).click();
  await by(p, "card-W-001").waitFor();
  check("opened in the office it gets the same card", await pressed(by(p, "choice-W-001-steep_access")));

  section("Legacy text");
  const legacyId = await mkLead();
  const { data: rawLead } = await svc.from("leads").select("selections_schedule").eq("id", legacyId).single();
  await svc.from("leads").update({ selections_schedule: [...(rawLead.selections_schedule || []), { kind: "item", id: "ri_legacy_floor", itemKind: "selection", category: "flooring", promptKey: "W-017", section: "project", isDefault: true, description: "Engineered oak, matt, living zones", certainty: "preference", disposition: "undecided", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" }] }).eq("id", legacyId);
  const lp = await newPage({ viewport: { width: 1440, height: 1000 } });
  await open(lp, legacyId);
  await by(lp, "step-whole_house").click();
  await by(lp, "card-W-017").waitFor();
  const written = by(lp, "card-W-017").getByLabel("Written earlier");
  check("old text is on screen, untouched and nothing is pre-selected from it", (await written.inputValue()) === "Engineered oak, matt, living zones" && !(await pressed(by(lp, "choice-W-017-timber"))));
  await by(lp, "choice-W-017-timber").click();
  await saved(lp);
  const lreg = await getReg(legacyId);
  check("choosing keeps the old text word for word", byPrompt(lreg, "W-017")[0].description === "Engineered oak, matt, living zones" && byPrompt(lreg, "W-017")[0].id === "ri_legacy_floor" && byPrompt(lreg, "W-017")[0].answer.selected[0].optionId === "timber");

  section("A vanity in a room, no typing");
  const before = await getReg(legacyId);
  await api("PUT", `/api/register/leads/${legacyId}`, { meta: { ...before.meta, rooms: [{ id: "room_bath_1", name: "Bathroom", roomType: "bathroom", level: "Ground", scope: "renovated", order: 0, sheet: "" }] }, changes: [], deletes: [] });
  await lp.reload({ waitUntil: "domcontentloaded" });
  await by(lp, "step-rooms").waitFor({ timeout: 45000 });
  await by(lp, "step-rooms").click();
  await by(lp, "card-B-001").waitFor();
  await lp.locator("details", { has: lp.getByTestId("card-B-004") }).last().locator("summary").first().click();
  await by(lp, "choice-B-004-wall_hung").click();
  await by(lp, "choice-B-004-wall_hung-two_basins").click();
  await saved(lp);
  const vreg = await getReg(legacyId);
  const vanity = byPrompt(vreg, "B-004")[0];
  check("wall-hung, two basins, on the room, no typing", vanity.roomId === "room_bath_1" && vanity.answer.selected[0].path.join("/") === "wall_hung/two_basins" && !vanity.description);
  await lp.context().close();

  section("Phone width, touch");
  const m = await newPage({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  await open(m, id);
  await by(m, "step-whole_house").tap();
  await by(m, "card-W-019").waitFor();
  const overflow = () => m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("no sideways scroll on the whole-house cards", (await overflow()) <= 0, await overflow());
  await by(m, "choice-W-019-palette-warm").scrollIntoViewIfNeeded();
  await by(m, "choice-W-019-palette-warm").tap();
  await by(m, "choice-W-019-ceiling-square_set").tap();
  const box = await by(m, "choice-W-019-palette-warm").boundingBox();
  check("a choice is a comfortable touch target", box.height >= 40, box.height);
  check("tap selected it", await pressed(by(m, "choice-W-019-palette-warm")));
  await saved(m);
  await by(m, "notdecided-W-015").tap();
  await by(m, "reasons-W-015").waitFor();
  check("the reason row fits at phone width", (await overflow()) <= 0, await overflow());
  const cardBox = await by(m, "card-W-019").boundingBox();
  check("the card has most of the phone's width", cardBox.width >= 270, cardBox.width);
  await m.screenshot({ path: join(EVIDENCE, "whole-house-375.png"), fullPage: false });
  reg = await getReg(id);
  check("touch answers reached the store", byPrompt(reg, "W-019")[0].answer.selected.map((s) => s.path.join("/")).join() === "palette/warm,ceiling/square_set");
  await by(m, "step-site").tap();
  await by(m, "card-W-001").waitFor();
  check("no sideways scroll on Site & existing", (await overflow()) <= 0, await overflow());
  await by(m, "card-W-001").scrollIntoViewIfNeeded();
  await m.screenshot({ path: join(EVIDENCE, "site-375.png"), fullPage: false });
  await m.context().close();

  section("Rooms and a real conflict on a project record");
  const pid = await mkLead();
  const baseReg = await getReg(pid);
  await api("PUT", `/api/register/leads/${pid}`, { meta: { ...baseReg.meta, rooms: [{ id: "room_kitchen_1", name: "Kitchen", roomType: "kitchen", level: "Ground", scope: "renovated", order: 0, sheet: "" }] }, changes: [], deletes: [] });
  await api("PATCH", `/api/sales/leads/${pid}`, { stage: "fee_proposal" });
  const conv = await api("POST", `/api/sales/leads/${pid}/convert-to-job`);
  const portal = await api("POST", `/api/sales/leads/${pid}/preconstruction-portal`);
  check("the lead becomes a project record", conv.status < 300 && portal.status < 300, JSON.stringify([conv.body, portal.body]).slice(0, 200));
  const rp = await newPage({ viewport: { width: 1440, height: 1000 } });
  await open(rp, pid);
  await by(rp, "step-rooms").click();
  await by(rp, "card-K-001").waitFor();
  await by(rp, "choice-K-001-new_kitchen").click();
  await saved(rp);
  let preg = await getReg(pid);
  const k1 = byPrompt(preg, "K-001")[0];
  check("project mode: the answer is on the canonical record", preg.items.length === 1 && k1.disposition === "new" && !!k1.sync?.rowId && k1.answer.selected[0].optionId === "new_kitchen");
  check("still nothing typed on a project record", k1.description === "");
  check("the row reads as project record", /Project record/.test(await by(rp, "register-mode").innerText()));
  const behind = await api("PUT", `/api/register/leads/${pid}`, { changes: [{ ...k1, nextAction: "Measure the old kitchen" }], deletes: [] });
  check("someone else saves the same item first", behind.status === 200, JSON.stringify(behind.body).slice(0, 200));
  await by(rp, "choice-K-001-partial_retrofit").click();
  await rp.getByTestId("register-save-state").filter({ visible: true }).filter({ hasText: /^Saved/ }).waitFor({ timeout: 20000 });
  preg = await getReg(pid);
  const merged = byPrompt(preg, "K-001")[0];
  check("the version conflict merges: both changes kept", merged.answer.selected[0].optionId === "partial_retrofit" && merged.disposition === "alter" && merged.nextAction === "Measure the old kitchen", JSON.stringify({ a: merged.answer?.selected, n: merged.nextAction }));
  await rp.context().close();

  check("no script errors on any page", pageErrors.length === 0, pageErrors.join(" | "));
}

try { await main(); }
catch (e) { fail++; console.log(`  ✗ test stopped: ${String(e.message || e).slice(0, 500)}`); }
finally {
  await browser?.close();
  for (const id of created) {
    const { data } = await svc.from("leads").select("job_id").eq("id", id).maybeSingle();
    if (data?.job_id) continue;     // a promoted test lead stays: it's marked BLH TEST and the job trigger owns its rows
    await svc.from("leads").delete().eq("id", id);
  }
}
console.log(`\nsandbox-register-guided: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
