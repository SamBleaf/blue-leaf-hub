/**
 * sandbox-sales-pathway.test.mjs — the engagement pathway and the remaining Sales stage work (R05 P6, Sales blueprint Tab 11).
 * The four required outcomes through the real API and Postgres, proof a commercial gate is never bypassed, and the screens.
 * Refuses any non-loopback URL. Keys come only from ~/.blh-register-sandbox/. Credentials are never printed.
 * Run: node scripts/tests/sandbox-sales-pathway.test.mjs   (sandbox postgrest + gateway + api + SPA running)
 */
import { readFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const { chromium } = await import("playwright");

const SPA = "http://localhost:5184", API = "http://localhost:8797", GW = "http://localhost:54321";
for (const u of [SPA, API, GW]) if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) { console.error("Refusing: loopback sandbox only."); process.exit(2); }
const SB_DIR = join(homedir(), ".blh-register-sandbox");
const secrets = JSON.parse(readFileSync(join(SB_DIR, "secrets.json"), "utf8"));
const creds = JSON.parse(readFileSync(join(SB_DIR, "credentials.local.json"), "utf8"));
const EVIDENCE = join(homedir(), "blh-register-evidence", "r05", "p6");
mkdirSync(EVIDENCE, { recursive: true });
const svc = createClient(GW, secrets.service_key, { auth: { persistSession: false } });
const anon = () => createClient(GW, secrets.anon_key, { auth: { persistSession: false } });
const asBrowser = (tok) => createClient(GW, secrets.anon_key, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${tok}` } } });
const NOW = new Date().toISOString();
const MARK = `BLH TEST PATHWAY ${Date.now()}`;
const QUALIFIED = { qualify_budget: 2, qualify_timeframe: 2, qualify_site: 2, qualify_decision_maker: 2, discovery_meeting_booked_at: NOW };
const NOTE = "Full architectural set A100-A400 Rev C, supplied by Studio Example";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n").toString("base64");

let pass = 0, fail = 0;
const check = (n, c, d = "") => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `\n      ${String(d).slice(0, 400)}` : ""}`); } };
const section = (t) => console.log(`\n▸ ${t}`);
async function signIn(email, password) {
  const { data, error } = await anon().auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for a test account: ${error.message}`);
  return data.session.access_token;
}
async function api(tok, method, path, body) {
  const r = await fetch(API + path, { method, headers: { authorization: `Bearer ${tok}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let b = null; try { b = await r.json(); } catch { /* non-json */ }
  return { status: r.status, ok: r.ok && b?.ok !== false, body: b };
}

const createdUsers = [];
async function makeUser(role) {
  const email = `pw-${role}-${randomBytes(4).toString("hex")}@blueleaf.test`;
  const password = randomBytes(18).toString("hex");
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser: ${error.message}`);
  const { error: pe } = await svc.from("user_profiles").upsert({ id: data.user.id, email, full_name: `PW ${role}`, role, is_active: true });
  if (pe) throw new Error(`profile: ${pe.message}`);
  createdUsers.push(data.user.id);
  return signIn(email, password);
}

let admin, employee, supervisor, client, browser;
let seq = 0;
const addressFor = () => buildTestJobAddress({ suite: "SALES-PATHWAY", workflowId: String(++seq) });
/** A real (non-test) lead created through the API, then placed at a stage with stored facts. */
async function mkLead(stage = "enquiry", fields = {}) {
  const c = await api(admin, "POST", "/api/sales/leads", { first_name: "Pathway", last_name: `Lead${seq}`, name: `${MARK} ${seq}`, site_address: addressFor(), project_type: "renovation", lead_source: "referral" });
  if (!c.ok) throw new Error(`create lead: ${JSON.stringify(c.body)}`);
  const id = c.body.lead.id;
  if (stage !== "enquiry" || Object.keys(fields).length) {
    const { error } = await svc.from("leads").update({ stage, ...fields }).eq("id", id);
    if (error) throw new Error(`seed lead: ${error.message}`);
  }
  return id;
}
const lead = async (id) => (await svc.from("leads").select("*").eq("id", id).single()).data;
const patchLead = (id, b, tok = admin) => api(tok, "PATCH", `/api/sales/leads/${id}`, b);
const supply = (id, tok = admin, b = { supplied: true, note: NOTE }) => api(tok, "POST", `/api/sales/leads/${id}/plans-supplied`, b);
const notes = async (id) => (await svc.from("lead_activities").select("summary, detail").eq("lead_id", id).eq("activity_type", "note")).data || [];

async function main() {
  admin = await signIn(creds.staff.email, creds.staff.password);
  client = await signIn(creds.client.email, creds.client.password);
  employee = await makeUser("employee");
  supervisor = await makeUser("supervisor");

  section("Outcome 1: normal design and build follows the design process");
  {
    const id = await mkLead("discovery", QUALIFIED);
    const jump = await patchLead(id, { stage: "consultants" });
    check("Discovery straight to Consultants is refused", jump.status === 422 && jump.body?.code === "GATE_BLOCKED", JSON.stringify(jump.body));
    check("it says what is missing", /concept agreement/i.test(jump.body?.error || ""), jump.body?.error);
    check("no plans recorded means no pathway change", (await lead(id)).plans_supplied_at === null);
  }

  section("Outcome 2: completed plans skip the irrelevant design approvals");
  {
    const id = await mkLead("discovery", QUALIFIED);
    const noNote = await supply(id, admin, { supplied: true, note: "   " });
    check("a note is required", noNote.status === 400 && noNote.body?.code === "NOTE_REQUIRED", JSON.stringify(noNote.body));
    check("nothing changed", (await lead(id)).plans_supplied_at === null);
    const done = await supply(id);
    check("a director can record it", done.ok, JSON.stringify(done.body));
    const row = await lead(id);
    check("what, who and when are stored", !!row.plans_supplied_at && !!row.plans_supplied_by && row.plans_supplied_note === NOTE);
    check("it is in the lead's history", (await notes(id)).some((n) => /plans supplied/i.test(n.summary) && n.detail.includes(NOTE)));
    const twice = await supply(id);
    check("recording it twice is refused", twice.status === 409 && twice.body?.code === "NO_CHANGE");
    const move = await patchLead(id, { stage: "consultants" });
    check("Discovery to Consultants now passes", move.ok && move.body.lead.stage === "consultants", JSON.stringify(move.body));
    check("no concept or PTSA bypass is logged, because neither applies", !(move.body.gateWarnings || []).some((w) => /concept|PTSA/i.test(w)), JSON.stringify(move.body.gateWarnings));
    const tender = await patchLead(id, { stage: "tender" });
    check("Tender readiness still warns on what's missing", tender.ok && (tender.body.gateWarnings || []).some((w) => /Consultant documents/i.test(w)), JSON.stringify(tender.body.gateWarnings));
    const won = await patchLead(id, { stage: "won" });
    check("Won still needs a signed contract", won.status === 422 && /contract/i.test(won.body?.error || ""), JSON.stringify(won.body));
    check("the lead hasn't moved", (await lead(id)).stage === "tender");
  }

  section("Commercial gates are never bypassed");
  {
    const early = await mkLead("qualify");
    await supply(early);
    const skip = await patchLead(early, { stage: "consultants" });
    check("recording plans doesn't skip Discovery's gate", skip.status === 422 && /qualifying score|build conversation/i.test(skip.body?.error || ""), JSON.stringify(skip.body));
    const forged = await patchLead(early, { plans_supplied_at: NOW });
    check("the blanket save can't set it", forged.status === 400 && forged.body?.code === "SERVER_OWNED_FIELD", JSON.stringify(forged.body));
    const stage = await mkLead("discovery", QUALIFIED);
    const oneRequest = await patchLead(stage, { stage: "consultants", plans_supplied_note: "made up", plans_supplied_at: NOW });
    check("nor in the same request as the move", oneRequest.status === 400 && (await lead(stage)).stage === "discovery", JSON.stringify(oneRequest.body));
    const db = asBrowser(employee);
    const { error: direct } = await db.from("leads").update({ plans_supplied_at: NOW }).eq("id", stage);
    check("a browser token can't write it straight to the database", !!direct || !(await lead(stage)).plans_supplied_at, direct?.message);
    check("and the row is unchanged (DB)", (await lead(stage)).plans_supplied_at === null);
    const denied = await supply(stage, employee);
    check("an employee can't record it", denied.status === 403, JSON.stringify(denied.body));
    const clientTry = await supply(stage, client);
    check("a client can't either", clientTry.status === 401 || clientTry.status === 403, JSON.stringify(clientTry.body));
  }

  section("Outcome 3: build-only or construction management with no plans is unchanged");
  for (const model of ["build_only", "construction_management"]) {
    const id = await mkLead("discovery", { ...QUALIFIED, delivery_model: model });
    const jump = await patchLead(id, { stage: "consultants" });
    check(`${model} still needs the concept agreement`, jump.status === 422, JSON.stringify(jump.body));
    const withPlans = await mkLead("discovery", { ...QUALIFIED, delivery_model: model });
    await supply(withPlans);
    check(`${model} with plans recorded takes the plans route`, (await patchLead(withPlans, { stage: "consultants" })).ok);
    check(`${model} didn't change the delivery model`, (await lead(withPlans)).delivery_model === model);
  }

  section("Outcome 4: Architect Tender keeps its own path");
  {
    const id = await mkLead("tender", { ...QUALIFIED, lead_type: "architect_tender" });
    const r = await supply(id);
    check("it can't be given a second pathway", r.status === 409 && r.body?.code === "PATHWAY_FIXED", JSON.stringify(r.body));
    const won = await patchLead(id, { stage: "won" });
    check("Won still needs a signed contract", won.status === 422, JSON.stringify(won.body));
  }

  section("Reversible, the same way");
  {
    const id = await mkLead("discovery", QUALIFIED);
    await supply(id);
    const blank = await supply(id, admin, { supplied: false, note: "" });
    check("undoing it needs a reason too", blank.status === 400);
    const undo = await supply(id, admin, { supplied: false, note: "Client's set turned out to be concept only" });
    check("a director can undo it", undo.ok, JSON.stringify(undo.body));
    const row = await lead(id);
    check("all three facts clear", row.plans_supplied_at === null && row.plans_supplied_by === null && row.plans_supplied_note === null);
    check("the history keeps both", (await notes(id)).filter((n) => /plans[- ]supplied/i.test(n.summary)).length === 2);
    check("the design stages apply again", (await patchLead(id, { stage: "consultants" })).status === 422);
  }

  section("On screen");
  browser = await chromium.launch();
  const { data: authed } = await anon().auth.signInWithPassword({ email: creds.staff.email, password: creds.staff.password });
  const newPage = async (opts) => {
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-localhost-auth-token", JSON.stringify(authed.session)]);
    const page = await ctx.newPage();
    await page.route("**/api/blueprint/chat", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, reply: "Stub" }) }));
    page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 300)));
    return page;
  };
  const pageErrors = [];
  const by = (p, id) => p.getByTestId(id).filter({ visible: true });
  const open = async (p, id) => { await p.goto(`${SPA}/sales/${id}`, { waitUntil: "domcontentloaded" }); await p.getByRole("button", { name: /Move to|Next:/ }).first().waitFor({ timeout: 45000 }).catch(() => {}); };
  const uiLead = await mkLead("discovery", { ...QUALIFIED, concept_agreement_status: null });
  const p = await newPage({ viewport: { width: 1440, height: 1000 } });
  await open(p, uiLead);
  await by(p, "plans-supplied-open").waitFor({ timeout: 45000 });
  await by(p, "plans-supplied-open").click();
  await by(p, "plans-supplied-save").click();
  await by(p, "pathway-prompt").getByText(/Say what was supplied/).waitFor({ timeout: 8000 });
  check("the note is asked for on screen", true);
  await by(p, "plans-supplied-note").fill(NOTE);
  await by(p, "plans-supplied-save").click();
  await by(p, "pathway-plans-supplied").waitFor({ timeout: 10000 });
  const banner = await by(p, "pathway-plans-supplied").innerText();
  check("it says why Concept and PTSA are gone", /Concept and PTSA \/ Plans don't apply/.test(banner), banner);
  check("the reminder about agreed services is on screen", /still has to be separately agreed/.test(banner));
  check("the commercial gates are named as staying", /Discovery, Tender readiness and a signed contract still do/.test(banner));
  const stepper = await p.locator(".lg\\:flex").filter({ hasText: "Discovery" }).first().innerText();
  check("the stepper has no Concept or PTSA", !/Concept|PTSA/.test(stepper) && /Consultants/.test(stepper), stepper);
  check("the next stage is Consultants", (await p.getByRole("button", { name: /Move to Consultants/ }).count()) > 0);
  await p.screenshot({ path: join(EVIDENCE, "plans-supplied-desktop.png"), fullPage: false });
  await p.waitForTimeout(800);
  const focus = await p.locator("#lead-focus").filter({ visible: true }).first().innerText();
  check("no concept agreement, fee or design meeting is left on the screen (audit R05-03)", !/Concept agreement/.test(focus.replace(/Concept and PTSA[^\n]*/g, "")) && !/DESIGNER & FEES|Designer & fees/i.test(focus) && !/Concept fee invoice/i.test(focus) && !/Design meeting/i.test(focus), focus.slice(0, 900));
  check("the script asks about the supplied plans instead", /review the supplied plans/.test(focus) && !/concept design package/.test(focus));
  check("the design-stage emails say why they're gone", /plans are already complete/.test(focus));
  const m = await newPage({ viewport: { width: 375, height: 812 }, hasTouch: true });
  await open(m, uiLead);
  await by(m, "pathway-plans-supplied").waitFor({ timeout: 45000 }).catch(() => {});
  check("no sideways scrolling at phone width", await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await m.screenshot({ path: join(EVIDENCE, "plans-supplied-375.png"), fullPage: false });
  await m.context().close();

  section("Consultants: received isn't ready (CNS-02, CNS-03, CNS-05)");
  const cn = await mkLead("consultants", { ...QUALIFIED, concept_agreement_status: "accepted", consultant_roster: [{ role: "engineer", contactId: "", deliverables: [{ key: "structural_drawings", status: "received" }] }] });
  const cp = await newPage({ viewport: { width: 1440, height: 1000 } });
  await open(cp, cn);
  await cp.getByText("Consultants & deliverables").first().waitFor({ timeout: 45000 });
  await cp.getByText(/0 ready/).first().waitFor({ timeout: 15000 });
  check("a received document doesn't count as ready", true);
  await cp.locator("button", { hasText: /^Received$/ }).first().click();
  await by(cp, "deliverable-fields-structural_drawings").getByText(/Add the revision/).waitFor({ timeout: 8000 });
  check("it can't be marked reviewed with nothing to point at", (await cp.locator("button", { hasText: /^Reviewed$/ }).count()) === 0);
  await by(cp, "deliverable-revision-structural_drawings").fill("Rev B");
  await cp.waitForTimeout(600);
  await cp.locator("button", { hasText: /^Received$/ }).first().click();
  await cp.locator("button", { hasText: /^Reviewed$/ }).first().waitFor();
  await cp.locator("button", { hasText: /^Reviewed$/ }).first().click();
  await cp.locator("button", { hasText: /^In the set$/ }).first().waitFor();
  await cp.getByText(/1 ready/).first().waitFor({ timeout: 8000 });
  check("reviewed and in the set counts as ready", true);
  await cp.waitForTimeout(800);
  const roster = (await lead(cn)).consultant_roster;
  check("revision and status are saved inside the roster (DB)", roster[0].deliverables[0].revision === "Rev B" && roster[0].deliverables[0].status === "included", JSON.stringify(roster));
  await cp.context().close();

  section("Re-issue flows to a real dependent document (audit coverage gap)");
  const ri = await mkLead("consultants", { ...QUALIFIED, concept_agreement_status: "accepted", consultant_roster: [{ role: "engineer", contactId: "", deliverables: [{ key: "structural_drawings", status: "included", revision: "B" }, { key: "engineer_certificate", status: "included", revision: "A" }] }] });
  const rp = await newPage({ viewport: { width: 1440, height: 1000 } });
  await open(rp, ri);
  await rp.getByText(/2 ready/).first().waitFor({ timeout: 45000 });
  await rp.getByRole("button", { name: "changed?" }).first().click();
  await rp.getByText(/re-issue required/).first().waitFor({ timeout: 8000 });
  check("the dependent document is flagged and stops counting", (await rp.getByText(/1 ready/).count()) > 0);
  await rp.waitForTimeout(800);
  const cert = (await lead(ri)).consultant_roster[0].deliverables.find((d) => d.key === "engineer_certificate");
  check("the flag is saved (DB)", cert.reissue === true);
  check("the flag records what caused it (DB)", cert.reissueFrom?.[0]?.key === "structural_drawings" && cert.reissueFrom[0].revision === "B" && !!cert.reissueFrom[0].at, JSON.stringify(cert));
  const certPill = await by(rp, "deliverable-status-engineer_certificate").innerText();
  check("the flagged document's pill says Re-issue, not In the set (Tab 26 retest)", certPill.trim() === "Re-issue", certPill);
  check("the changed document keeps its own status", (await by(rp, "deliverable-status-structural_drawings").innerText()).trim() === "In the set");
  const why = await by(rp, "deliverable-reissue-engineer_certificate").innerText();
  check("the warning names the change that caused it", /re-issue required: Structural drawings changed \(now Rev B\)/.test(why), why);
  await by(rp, "deliverable-detail-structural_drawings").click();
  await by(rp, "deliverable-revision-structural_drawings").fill("C");
  await rp.waitForTimeout(400);
  check("typing the new revision after pressing changed? updates the warning (review fix)", /Structural drawings changed \(now Rev C\)/.test(await by(rp, "deliverable-reissue-engineer_certificate").innerText()));
  await by(rp, "deliverable-status-engineer_certificate").click();
  await rp.getByText(/2 ready/).first().waitFor({ timeout: 8000 });
  await rp.waitForTimeout(800);
  const cleared = (await lead(ri)).consultant_roster[0].deliverables.find((d) => d.key === "engineer_certificate");
  check("clicking it once re-done clears the flag and its cause (DB)", cleared.reissue === false && cleared.reissueFrom == null && cleared.status === "issued", JSON.stringify(cleared));
  await rp.context().close();

  section("An older re-issue flag with no recorded cause still reads correctly");
  const ro = await mkLead("consultants", { ...QUALIFIED, concept_agreement_status: "accepted", consultant_roster: [{ role: "engineer", contactId: "", deliverables: [{ key: "structural_drawings", status: "included", revision: "B" }, { key: "engineer_certificate", status: "included", revision: "A", reissue: true }] }] });
  const op = await newPage({ viewport: { width: 1440, height: 1000 } });
  await open(op, ro);
  await by(op, "deliverable-reissue-engineer_certificate").waitFor({ timeout: 45000 });
  check("the pill says Re-issue", (await by(op, "deliverable-status-engineer_certificate").innerText()).trim() === "Re-issue");
  check("the warning falls back to the plain wording", (await by(op, "deliverable-reissue-engineer_certificate").innerText()).trim() === "⟳ re-issue required");
  await op.context().close();

  section("Job warning says what is actually wrong (audit R05-04)");
  const jm = await mkLead("consultants", { ...QUALIFIED, concept_agreement_status: "accepted", ptsa_status: "signed" });
  const jp = await newPage({ viewport: { width: 1440, height: 1000 } });
  await open(jp, jm);
  await by(jp, "job-missing").waitFor({ timeout: 45000 });
  const jobPage = await by(jp, "job-missing").innerText();
  check("it says the job is missing, with the address on file", /Job not created yet/.test(jobPage) && /site address is on file/.test(jobPage), jobPage);
  check("it no longer claims the address is missing", (await jp.getByText(/site address is missing/i).count()) === 0 && (await jp.getByText("Add site address before advancing").count()) === 0);
  await by(jp, "job-missing").getByRole("button", { name: /Create job/ }).click();
  await jp.waitForTimeout(2500);
  check("the button creates the job (DB)", !!(await lead(jm)).job_id);
  await jp.getByTestId("job-missing").filter({ visible: true }).waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  check("and the warning goes", (await by(jp, "job-missing").count()) === 0);
  await jp.context().close();

  section("Contract check on screen (audit R05-02)");
  const ct = await mkLead("tender", { ...QUALIFIED, concept_agreement_status: "accepted", ptsa_status: "signed" });
  const cg = await newPage({ viewport: { width: 1440, height: 1000 } });
  await open(cg, ct);
  await cg.locator('input[aria-label="Signed building contract PDF"]').first().setInputFiles({ name: "contract.pdf", mimeType: "application/pdf", buffer: Buffer.from(PDF, "base64") });
  await by(cg, "contract-verify").waitFor({ timeout: 45000 });
  const sign = cg.getByRole("button", { name: /Mark contract as signed/ }).filter({ visible: true }).first();
  check("choosing a PDF isn't enough", await sign.isDisabled());
  check("it names this client and job", (await by(cg, "contract-verify").innerText()).includes((await lead(ct)).name));
  await by(cg, "contract-ref").fill("HIA 2026 Rev C");
  check("a reference alone isn't enough", await sign.isDisabled());
  await by(cg, "contract-confirm").check();
  await sign.click();
  await by(cg, "contract-check-record").waitFor({ timeout: 15000 });
  check("the check is shown on the record", /HIA 2026 Rev C/.test(await by(cg, "contract-check-record").innerText()));
  await cg.context().close();

  section("Board Move menu (audit coverage gap)");
  const bl = await mkLead("consultants", { ...QUALIFIED, concept_agreement_status: "accepted", plans_supplied_at: NOW, plans_supplied_note: "board test" });
  const blName = (await lead(bl)).name;
  const bp = await newPage({ viewport: { width: 1363, height: 936 } });
  await bp.goto(`${SPA}/sales`, { waitUntil: "domcontentloaded" });
  const cardOf = () => bp.getByText(blName, { exact: true }).filter({ visible: true }).first().locator('xpath=ancestor::div[contains(@class,"group")][1]');
  await cardOf().waitFor({ timeout: 45000 });
  const settle = async () => { await cardOf().scrollIntoViewIfNeeded(); await cardOf().hover(); await bp.waitForTimeout(500); };
  const moveTo = async (target) => { await settle(); await cardOf().getByRole("button", { name: "Move ▾" }).click(); await by(bp, "board-move-menu").getByRole("menuitem", { name: target, exact: true }).click({ timeout: 8000 }); };
  await settle();
  await cardOf().getByRole("button", { name: "Move ▾" }).click();
  const menu = await by(bp, "board-move-menu").innerText();
  check("the menu isn't clipped and lists stages that apply", /Tender/.test(menu) && /Won/.test(menu) && !/Concept|PTSA/.test(menu), menu);
  await bp.keyboard.press("Escape");
  await moveTo("Tender");
  await by(bp, "board-move-notice").waitFor({ timeout: 10000 });
  check("moving works, and says what it skipped", /moved to Tender/.test(await by(bp, "board-move-notice").innerText()) && /Skipped and logged/.test(await by(bp, "board-move-notice").innerText()), await by(bp, "board-move-notice").innerText());
  check("the lead moved (DB)", (await lead(bl)).stage === "tender");
  await bp.waitForTimeout(1200);
  await moveTo("Won");
  await bp.getByRole("alert").filter({ hasText: /contract/i }).first().waitFor({ timeout: 10000 });
  check("a refusal shows its reason on the page", /contract/i.test(await by(bp, "board-move-notice").innerText()));
  check("the lead stayed (DB)", (await lead(bl)).stage === "tender");
  await bp.context().close();

  section("Enquiry, PTSA and Won");
  const en = await mkLead("enquiry", { phone: "0400000000" });
  await open(p, en);
  await by(p, "enquiry-missing").waitFor({ timeout: 45000 });
  const missing = await by(p, "enquiry-missing").innerText();
  check("Enquiry asks only for what's missing", /Budget/.test(missing) && !/Phone/.test(missing), missing);
  check("Enquiry shows who has it", /with/.test(await by(p, "enquiry-summary").innerText()));
  const pt = await mkLead("fee_proposal", { ...QUALIFIED, concept_agreement_status: "accepted" });
  await svc.storage.from("lead-documents").upload(`leads/${pt}/plan-${Date.now()}.pdf`, Buffer.from(PDF, "base64"), { contentType: "application/pdf" }).then(async ({ data }) => {
    await svc.from("lead_documents").insert({ lead_id: pt, filename: "A101 Plan Rev C.pdf", storage_path: data.path, mime_type: "application/pdf", document_type: "working_drawings", uploaded_by: "test" });
  });
  await open(p, pt);
  await by(p, "stage-drawings").waitFor({ timeout: 45000 });
  await by(p, "stage-drawings").getByText("A101 Plan Rev C.pdf").waitFor({ timeout: 10000 });
  const draw = await by(p, "stage-drawings").innerText();
  check("the drawing can be opened inside the stage", /Latest/.test(draw) && (await by(p, "stage-drawings").locator("a").count()) === 1, draw);
  await p.context().close();
  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
}

try { await main(); }
catch (e) { fail++; console.log(`  ✗ test stopped: ${e.message.slice(0, 900)}\n${(e.stack || "").split("\n").slice(1, 4).join("\n")}`); }
finally {
  await browser?.close();
  for (const u of createdUsers) await svc.auth.admin.deleteUser(u).catch(() => {});
}
console.log(`\nsandbox-sales-pathway: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
