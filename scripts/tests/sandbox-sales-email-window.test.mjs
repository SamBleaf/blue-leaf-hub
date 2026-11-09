/**
 * sandbox-sales-email-window.test.mjs — the email review window and the booking email in a real browser (R05 P2).
 * Headless Chromium against the loopback sandbox SPA and API, at desktop and phone width. Previews use the real
 * routes. EVERY send is answered by this test inside the browser, so no send reaches the Hub and no mail can leave.
 * It also refuses to run if any send switch is on.
 *
 * Covers what a string render can't: a failed send is readable while the window is open and keeps the edits; a meeting
 * card's booking email goes through the one Client correspondence window; sending off is honoured there; and the
 * Tender pointer lands on the follow-up after a presentation.
 *
 * Refuses any non-loopback URL. Keys come only from ~/.blh-register-sandbox/. Credentials are never printed.
 * Screenshots: ~/blh-register-evidence/r05/p2-fix/
 *
 * Run: node scripts/tests/sandbox-sales-email-window.test.mjs   (sandbox postgrest + gateway + api + SPA running)
 */
import { mkdirSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const { chromium } = await import("playwright");

const SPA = "http://localhost:5184", API = "http://localhost:8797", GW = "http://localhost:54321";
for (const u of [SPA, API, GW]) if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) { console.error("Refusing: loopback sandbox only."); process.exit(2); }
try { await fetch(SPA, { signal: AbortSignal.timeout(5000) }); } catch { console.error("The sandbox SPA isn't reachable on :5184. Start it first."); process.exit(1); }

const SB_DIR = join(homedir(), ".blh-register-sandbox");
const secrets = JSON.parse(readFileSync(join(SB_DIR, "secrets.json"), "utf8"));
const creds = JSON.parse(readFileSync(join(SB_DIR, "credentials.local.json"), "utf8"));
const EVIDENCE = join(homedir(), "blh-register-evidence", "r05", "p2-fix");
mkdirSync(EVIDENCE, { recursive: true });
const svc = createClient(GW, secrets.service_key, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await createClient(GW, secrets.anon_key, { auth: { persistSession: false } }).auth.signInWithPassword({ email: creds.staff.email, password: creds.staff.password });
if (authErr) { console.error("Sandbox sign-in failed."); process.exit(1); }
const session = auth.session;
const headers = { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" };

const MARK = `BLH TEST EMAIL WINDOW ${Date.now()}`;
let pass = 0, fail = 0, seq = 0;
const check = (n, c, d = "") => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `\n      ${String(d).slice(0, 300)}` : ""}`); } };
const section = (t) => console.log(`\n▸ ${t}`);

const created = [];
async function mkLead(stage, fields = {}) {
  const r = await fetch(`${API}/api/sales/leads`, { method: "POST", headers, body: JSON.stringify({ first_name: "Window", last_name: `Lead${++seq}`, name: `${MARK} ${seq}`, email: `window-${randomBytes(4).toString("hex")}@blueleaf.test`, site_address: buildTestJobAddress({ suite: "SALES-EMAIL-WINDOW", workflowId: String(seq) }), project_type: "renovation", lead_source: "referral" }) });
  const j = await r.json();
  if (!j.ok) throw new Error(`could not create a lead: ${r.status}`);
  created.push(j.lead.id);
  const { error } = await svc.from("leads").update({ stage, ...fields }).eq("id", j.lead.id);
  if (error) throw new Error(`could not place the lead: ${error.message}`);
  return j.lead.id;
}

const ALL_ON = { mailbox: true, qualify: true, discovery: true, concept: true, tender: true, pipeline: true };
const SEND = /\/api\/sales\/leads\/[^/]+\/((qualify|discovery|concept|tender|pipeline)-email\/send|meetings\/[^/]+\/invite-email|email)$/;
const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const pageErrors = [];
let browser;

/** A page whose send answers come from `state.reply`. Previews reach the real route; nothing else in SEND does. */
async function newPage(width, height, state) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-localhost-auth-token", JSON.stringify(session)]);
  const page = await ctx.newPage();
  await page.route("**/api/blueprint/chat", (route) => json(route, 200, { ok: true, reply: "Stub" }));
  await page.route(SEND, (route) => {
    const body = route.request().postDataJSON() || {};
    if (body.preview === true) return route.continue();
    state.sends.push({ path: new URL(route.request().url()).pathname, body });
    return json(route, state.reply.status, state.reply.body);
  });
  if (state.mailboxOn) await page.route(/\/mailbox$/, (route) => json(route, 200, { ok: true, messages: [], sending: ALL_ON }));
  page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 300)));
  return page;
}
async function open(page, id) {
  await page.goto(`${SPA}/sales/${id}`, { waitUntil: "domcontentloaded" });
  await page.getByText("Client correspondence").filter({ visible: true }).first().waitFor({ timeout: 45000 });
  await page.waitForTimeout(700);
}
const button = (p, name) => p.getByRole("button", { name }).filter({ visible: true });
const inViewAndOnTop = (loc) => loc.evaluate((el) => {
  const r = el.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { visible: r.top >= 0 && r.bottom <= innerHeight, onTop: top === el || el.contains(top) };
});
const FAILED = { status: 400, body: { ok: false, error: "SMTP blew up" } };
const SENT = { status: 200, body: { ok: true, sent: true, transport: "stub" } };

async function failedSend(width, height, name) {
  section(`${name}: a failed send can be read and loses nothing`);
  const state = { sends: [], reply: FAILED, mailboxOn: true };
  const p = await newPage(width, height, state);
  await open(p, await mkLead("qualify"));
  await button(p, /^Review qualify email/).click();
  const send = button(p, "Send email");
  await send.waitFor();
  const subject = p.locator(".fixed.inset-0 input").filter({ visible: true }).first();
  await subject.fill("My edited subject");
  await send.click();
  const alert = p.locator('[role="alert"]').filter({ hasText: "SMTP blew up" }).filter({ visible: true });
  await alert.waitFor({ timeout: 5000 });
  const seen = await inViewAndOnTop(alert);
  check("the error is in view and nothing covers it", seen.visible && seen.onTop, JSON.stringify(seen));
  await p.screenshot({ path: join(EVIDENCE, `failed-send-${name}.png`) });
  check("it says it failed and that the edits are kept", /Send failed/.test(await alert.innerText()) && /edits are still here/.test(await alert.innerText()));
  check("the window stayed open with the edit", (await subject.inputValue()) === "My edited subject");
  check("Send can be pressed again", await send.isEnabled());
  check("the error isn't also hidden behind the window", (await p.locator('[role="status"]').filter({ hasText: "SMTP blew up" }).filter({ visible: true }).count()) === 0);
  check("the attempt was answered here and reached no server", state.sends.length === 1 && state.sends[0].body.subject === "My edited subject", JSON.stringify(state.sends));

  state.reply = SENT;
  await send.click();
  await p.getByText("The Hub can't see whether it was delivered").filter({ visible: true }).first().waitFor({ timeout: 5000 });
  check("a retry that works closes the window and doesn't claim delivery", (await button(p, "Send email").count()) === 0);

  state.reply = FAILED;
  await button(p, /^Review qualify email/).click();
  await button(p, "Send email").waitFor();
  await button(p, "Send email").click();
  await p.locator('[role="alert"]').filter({ visible: true }).waitFor({ timeout: 5000 });
  await button(p, "Close").click();
  const left = p.locator('[role="status"]').filter({ hasText: "SMTP blew up" }).filter({ visible: true });
  await left.waitFor({ timeout: 5000 });
  check("closing the window leaves the failure showing beside the button", /Send failed/.test(await left.innerText()));
  await p.context().close();
}

async function bookingEmailOff(width, height, name) {
  section(`${name}: the booking email lives in Client correspondence, and sending off is honoured`);
  const state = { sends: [], reply: SENT, mailboxOn: false };
  const p = await newPage(width, height, state);
  await open(p, await mkLead("tender", { tender_substatus: "proposal_presented" }));
  check("the meeting card has no send of its own", (await button(p, "Email booking link").count()) === 0);

  await button(p, /^Next: Follow up on the proposal/).click();
  const list = p.locator('[data-next-target="stage-email"] select').filter({ visible: true });
  await p.waitForTimeout(1100);
  check("the pointer lands on the follow-up, already chosen", (await list.inputValue()) === "proposal_followup", await list.inputValue());
  const pointed = await inViewAndOnTop(list);
  check("and it's in view", pointed.visible && pointed.onTop, JSON.stringify(pointed));
  check("focus goes to the Review button", await p.evaluate(() => document.activeElement?.textContent?.trim() === "Review email"));

  await button(p, "Go to the booking email").click();
  await p.waitForTimeout(1100);
  check("the meeting card's button chooses that meeting's email", (await list.inputValue()) === "booking_proposal_presentation", await list.inputValue());
  check("the page says sending is off", await p.getByText("Sending is turned off for this email, so you can preview it").filter({ visible: true }).first().isVisible());

  await button(p, "Review email").click();
  const send = button(p, "Send email");
  await send.waitFor({ timeout: 10000 });
  const windowText = await p.locator(".fixed.inset-0").filter({ hasText: "Proposal presentation booking link: preview" }).filter({ visible: true }).innerText();
  await p.screenshot({ path: join(EVIDENCE, `booking-email-off-${name}.png`) });
  check("a real preview opens", /booking link: preview/i.test(windowText));
  check("Send can't be pressed", await send.isDisabled());
  check("the window says it's a preview only", /Sending is turned off for this email/.test(windowText));
  check("no developer flag name on screen", !/LEAD_MAILBOX_ENABLED/.test(await p.locator("body").innerText()));
  check("nothing was sent", state.sends.length === 0, JSON.stringify(state.sends));
  check("no sideways scroll", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.context().close();
}

async function bookingEmailOn(width, height, name) {
  section(`${name}: the booking email when sending is on (answered in the browser)`);
  const state = { sends: [], reply: FAILED, mailboxOn: true };
  const p = await newPage(width, height, state);
  await open(p, await mkLead("consultants"));
  await button(p, "Go to the booking email").click();
  await p.waitForTimeout(1100);
  await button(p, /^Review proposal presentation booking link/).click();
  const send = button(p, "Send email");
  await send.waitFor({ timeout: 10000 });
  await p.locator(".fixed.inset-0 input").filter({ visible: true }).first().fill("Book your presentation");
  await send.click();
  const refused = p.locator(".fixed.inset-0 [role=\"alert\"]").filter({ hasText: "SMTP blew up" }).filter({ visible: true });
  await refused.waitFor({ timeout: 5000 });
  check("a failed booking email shows in the same window", await refused.isVisible());
  check("it posts to the existing route with the edited copy", state.sends[0]?.path.endsWith("/meetings/proposal_presentation/invite-email") && state.sends[0]?.body.subject === "Book your presentation" && state.sends[0]?.body.preview === undefined, JSON.stringify(state.sends[0]));
  state.reply = SENT;
  await send.click();
  await p.getByText("The Hub can't see whether it was delivered").filter({ visible: true }).first().waitFor({ timeout: 5000 });
  check("sent is not reported as delivered", (await button(p, "Send email").count()) === 0);
  await p.context().close();
}

try {
  const box = await (await fetch(`${API}/api/sales/leads/${await mkLead("qualify")}/mailbox`, { headers })).json();
  const on = Object.entries(box.sending || {}).filter(([, v]) => v !== false).map(([k]) => k);
  if (!box.sending || on.length) { console.error(`Refusing to continue: sending is switched on or unknown in this sandbox (${on.join(", ")}).`); process.exitCode = 2; throw new Error("sending is on"); }

  browser = await chromium.launch({ headless: true });
  for (const [w, h, name] of [[1440, 900, "desktop"], [375, 812, "phone"]]) {
    await failedSend(w, h, name);
    await bookingEmailOff(w, h, name);
    await bookingEmailOn(w, h, name);
  }
  section("Page health");
  check("no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
} catch (e) {
  fail++;
  console.log(`  ✗ unexpected: ${String(e.message).slice(0, 400)}`);
} finally {
  await browser?.close();
  if (created.length) {
    await svc.from("correspondence").delete().in("lead_id", created);
    await svc.from("lead_activities").delete().in("lead_id", created);
    await svc.from("leads").delete().in("id", created);
  }
}

console.log(`\n${fail ? "FAILED" : "PASSED"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? (process.exitCode || 1) : 0);
