/**
 * sandbox-client-portal.test.mjs — Tab 26 R05 retest follow-ups, on screen as the client and as staff.
 * Client: an approved item with no product reads "Confirmed by Blue Leaf"; a choice being reviewed can be changed;
 * undecided items say a choice is a preference; no "Price on request" or "No allowance set"; Home names the next
 * milestone. Staff: Portal Admin shows plain statuses, links a client response to the lead, and the Clients list
 * shows the real portal status. A dedicated test client (random password, never printed) is created and removed.
 * Refuses any non-loopback URL. Run: node scripts/tests/sandbox-client-portal.test.mjs   (sandbox running)
 */
import { readFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";

const { chromium } = await import("playwright");
const SPA = "http://localhost:5184", API = "http://localhost:8797", GW = "http://localhost:54321";
for (const u of [SPA, API, GW]) if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) { console.error("Refusing: loopback sandbox only."); process.exit(2); }
const SB_DIR = join(homedir(), ".blh-register-sandbox");
const secrets = JSON.parse(readFileSync(join(SB_DIR, "secrets.json"), "utf8"));
const creds = JSON.parse(readFileSync(join(SB_DIR, "credentials.local.json"), "utf8"));
const EVIDENCE = join(homedir(), "blh-register-evidence", "r05", "tab26");
mkdirSync(EVIDENCE, { recursive: true });
const svc = createClient(GW, secrets.service_key, { auth: { persistSession: false } });
const anon = () => createClient(GW, secrets.anon_key, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const check = (n, c, d = "") => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `\n      ${String(d).slice(0, 400)}` : ""}`); } };
const section = (t) => console.log(`\n▸ ${t}`);
async function api(tok, method, path, body) {
  const r = await fetch(API + path, { method, headers: { authorization: `Bearer ${tok}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let b = null; try { b = await r.json(); } catch { /* non-json */ }
  return { status: r.status, ok: r.ok && b?.ok !== false, body: b };
}
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

const created = { users: [], projects: [], jobs: [], leads: [] };
let browser;
const pageErrors = [];
async function newPage(session, opts = { viewport: { width: 1280, height: 900 } }) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-localhost-auth-token", JSON.stringify(session)]);
  const page = await ctx.newPage();
  await page.route("**/api/blueprint/chat", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, reply: "Stub" }) }));
  page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 300)));
  return page;
}

async function main() {
  // ── fixtures ──────────────────────────────────────────────────────────────────────────────────
  const email = `tab26-client-${randomBytes(4).toString("hex")}@blueleaf.test`;
  const password = randomBytes(18).toString("hex");
  const user = must(await svc.auth.admin.createUser({ email, password, email_confirm: true }), "create client").user;
  created.users.push(user.id);
  must(await svc.from("user_profiles").upsert({ id: user.id, email, full_name: "Tab26 Client", role: "client", is_active: true }), "client profile");
  const { data: clientAuth } = await anon().auth.signInWithPassword({ email, password });
  const { data: staffAuth } = await anon().auth.signInWithPassword({ email: creds.staff.email, password: creds.staff.password });
  const staffTok = staffAuth.session.access_token;

  const addr = buildTestJobAddress({ suite: "TAB26-PORTAL", workflowId: randomBytes(3).toString("hex") });
  const job = must(await svc.from("jobs").insert({ address: addr }).select("id").single(), "job");
  created.jobs.push(job.id);
  const proj = must(await svc.from("projects").insert({ job_id: job.id, address: addr, is_preconstruction: true, build_phase: "pre_construction", portal_v2_enabled: true, portal_enabled: true }).select("id").single(), "project");
  created.projects.push(proj.id);
  const lead = must(await svc.from("leads").insert({ first_name: "Tab26", last_name: "Portal", name: "Tab26 Portal", site_address: addr, stage: "consultants", is_test: true, job_id: job.id }).select("id").single(), "lead");
  created.leads.push(lead.id);
  must(await svc.from("project_client_users").insert({ project_id: proj.id, user_id: user.id, role: "primary", is_active: true }), "link client");
  // The next open milestone isn't the one marked current: Home must give the next one's own date (review fix).
  must(await svc.from("portal_milestones").insert([
    { project_id: proj.id, key: "design_signoff", label: "Design sign-off", sort_order: 1, is_current: false, eta: "2026-12-05" },
    { project_id: proj.id, key: "council", label: "Council approval", sort_order: 2, is_current: true, eta: "2027-02-20" },
  ]), "milestones");
  const sel = async (row, options = []) => {
    const s = must(await svc.from("client_selections").insert({ project_id: proj.id, client_visible: true, category: "Finishes", ...row }).select("id").single(), row.item_name);
    if (options.length) must(await svc.from("selection_options").insert(options.map((o, i) => ({ selection_id: s.id, sort_order: i, ...o }))), "options");
    return s.id;
  };
  const approvedNoProduct = await sel({ item_name: "Skirting profile", status: "approved", approved_at: new Date().toISOString(), sort_order: 1 });
  const inReview = await sel({ item_name: "Robe hook", status: "in_review", selected_product: "Matte white hook", sort_order: 2 },
    [{ label: "Option A", product_name: "Matte white hook", price_inc_gst: 40 }, { label: "Option B", product_name: "Brushed nickel hook", price_inc_gst: null }]);
  const undecided = await sel({ item_name: "Towel rail", status: "awaiting_client", sort_order: 3 },
    [{ label: "Option A", product_name: "Heated rail" }, { label: "Option B", product_name: "Single bar", price_inc_gst: 120 }]);
  const singleInReview = await sel({ item_name: "Shower screen", status: "in_review", selected_product: "Frameless 10 mm", sort_order: 4 });

  browser = await chromium.launch();

  // ── client ────────────────────────────────────────────────────────────────────────────────────
  section("Client: Selections");
  const c = await newPage(clientAuth.session);
  await c.goto(`${SPA}/client-portal/selections`, { waitUntil: "domcontentloaded" });
  await c.getByText("Skirting profile").first().waitFor({ timeout: 45000 });
  const board = await c.locator("main").innerText().catch(async () => c.locator("body").innerText());
  check("an approved item with no product reads 'Confirmed by Blue Leaf', not 'Chosen: —'", /Confirmed by Blue Leaf/.test(await c.getByTestId(`client-selection-chosen-${approvedNoProduct}`).innerText()) && !/Chosen: —/.test(board));
  check("no 'No allowance set' when there isn't one", !/No allowance set/.test(board));
  check("no 'Price on request'; it says 'Price to be confirmed'", !/Price on request/.test(board) && /Price to be confirmed/.test(board));
  check("undecided items say choosing is a preference, confirmed before it's final", /Choosing tells us your preference\. Blue Leaf confirms any cost or timing change with you before it.s final\./.test(board));
  check("a choice being reviewed can be changed", (await c.getByTestId(`client-change-choice-${inReview}`).count()) === 1);
  check("a single proposal being reviewed points to messages instead", /Need a change\? Message us/.test(await c.getByTestId(`client-selection-chosen-${singleInReview}`).innerText()));
  await c.screenshot({ path: join(EVIDENCE, "client-selections.png"), fullPage: true });
  await c.getByTestId(`client-change-choice-${inReview}`).click();
  await c.getByText("Choose again and we’ll review your new choice instead.").waitFor({ timeout: 8000 });
  check("changing shows the options again", true);
  const optB = must(await svc.from("selection_options").select("id").eq("selection_id", inReview).eq("label", "Option B").single(), "option B");
  await c.getByTestId(`client-choose-${optB.id}`).click();
  await c.getByTestId(`client-selection-chosen-${inReview}`).waitFor({ timeout: 10000 });
  const robe = must(await svc.from("client_selections").select("status, selected_product").eq("id", inReview).single(), "robe");
  check("the new choice is saved and still waits for Blue Leaf (DB)", robe.status === "in_review" && robe.selected_product === "Brushed nickel hook", JSON.stringify(robe));
  check("the screen shows the new choice", /Brushed nickel hook/.test(await c.getByTestId(`client-selection-chosen-${inReview}`).innerText()));
  check("an undecided item is untouched (DB)", (must(await svc.from("client_selections").select("status").eq("id", undecided).single(), "towel")).status === "awaiting_client");

  section("Client: Home");
  await c.goto(`${SPA}/client-portal`, { waitUntil: "domcontentloaded" });
  await c.getByText("Before we start on site").first().waitFor({ timeout: 30000 });
  const home = await c.locator("body").innerText();
  check("the card is 'Before we start on site', not 'Your build starts soon'", !/Your build starts soon/.test(home));
  check("it names the next milestone and its date", /Next: Design sign-off · 5 Dec 2026/.test(await c.getByTestId("client-next-milestone").innerText()), await c.getByTestId("client-next-milestone").innerText().catch(() => ""));
  await c.screenshot({ path: join(EVIDENCE, "client-home.png"), fullPage: false });
  await c.context().close();

  // ── staff ─────────────────────────────────────────────────────────────────────────────────────
  section("Staff: Portal Admin v2");
  const s = await newPage(staffAuth.session);
  await s.goto(`${SPA}/portal-admin/${proj.id}/v2`, { waitUntil: "domcontentloaded" });
  await s.getByTestId(`v2-selection-${inReview}`).waitFor({ timeout: 45000 });
  const robeRow = await s.getByTestId(`v2-selection-${inReview}`).innerText();
  check("a client response reads in plain words", /Client responded: review in the register/.test(robeRow) && !/in_review/.test(robeRow), robeRow);
  check("with a link to the lead's register", (await s.getByTestId(`v2-selection-${inReview}`).getByRole("link", { name: /Open the lead.s register/ }).getAttribute("href")) === `/sales/${lead.id}`);
  check("an item with the client says so", /With client/.test(await s.getByTestId(`v2-selection-${undecided}`).innerText()));
  check("an approved item has no register link", (await s.getByTestId(`v2-selection-${approvedNoProduct}`).getByRole("link").count()) === 0);

  section("Staff: the Clients list shows the real portal status");
  const liveTag = `live${randomBytes(3).toString("hex")}`;
  const liveAddr = buildTestJobAddress({ suite: "TAB26-PORTAL", workflowId: liveTag });
  const liveJob = must(await svc.from("jobs").insert({ address: liveAddr }).select("id").single(), "live job");
  created.jobs.push(liveJob.id);
  const live = must(await svc.from("projects").insert({ job_id: liveJob.id, address: liveAddr, is_preconstruction: false, portal_v2_enabled: true, portal_enabled: true }).select("id").single(), "live project");
  created.projects.push(live.id);
  const list = await api(staffTok, "GET", "/api/operations/projects");
  const row = (list.body?.projects || []).find((p) => p.id === live.id);
  check("the list API returns both portal flags", row?.portal_enabled === true && row?.portal_v2_enabled === true, JSON.stringify(row || {}).slice(0, 200));
  await s.goto(`${SPA}/portal-admin`, { waitUntil: "domcontentloaded" });
  const card = s.getByRole("button").filter({ hasText: liveTag });
  await card.waitFor({ timeout: 30000 });
  check("it says 'Portal v2 enabled', not 'Portal not set up'", /Portal v2 enabled/.test(await card.innerText()));
  await card.click();
  await s.waitForURL(new RegExp(`/portal-admin/${live.id}/v2$`), { timeout: 15000 }).catch(() => {});
  check("and opens the v2 console", s.url().endsWith(`/portal-admin/${live.id}/v2`), s.url());
  await s.context().close();
  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
}

try { await main(); }
catch (e) { fail++; console.log(`  ✗ test stopped: ${e.message.slice(0, 900)}\n${(e.stack || "").split("\n").slice(1, 4).join("\n")}`); }
finally {
  await browser?.close();
  for (const id of created.projects) { await svc.from("client_selections").delete().eq("project_id", id); await svc.from("portal_milestones").delete().eq("project_id", id); await svc.from("project_client_users").delete().eq("project_id", id); }
  for (const id of created.leads) await svc.from("leads").delete().eq("id", id);
  // Projects with portal audit rows can only be removed through admin_delete_projects (mig 123); do it before the user goes.
  if (created.projects.length) { const r = await svc.rpc("admin_delete_projects", { p_ids: created.projects }); if (r.error) console.log(`  (cleanup) projects: ${r.error.message}`); }
  for (const id of created.jobs) { const r = await svc.from("jobs").delete().eq("id", id); if (r.error) console.log(`  (cleanup) job: ${r.error.message}`); }
  for (const id of created.users) {
    await svc.from("user_profiles").delete().eq("id", id);
    const r = await svc.auth.admin.deleteUser(id); if (r.error) console.log(`  (cleanup) user: ${r.error.message}`);
  }
}
console.log(`\nsandbox-client-portal: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
