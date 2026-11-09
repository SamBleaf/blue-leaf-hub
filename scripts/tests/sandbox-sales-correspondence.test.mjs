/**
 * sandbox-sales-correspondence.test.mjs — what Client correspondence reads from the REAL Hub API (R05 P2, loopback
 * sandbox only). Covers the send switches the page reports, that they match what the send routes really do, that a
 * refused send records nothing, and that the status logic reads the real response shape. It never sends mail: it
 * refuses to run if any send switch is on.
 *
 * Refuses any non-loopback URL. Keys come only from ~/.blh-register-sandbox/. Credentials are never printed.
 *
 * Run: node scripts/tests/sandbox-sales-correspondence.test.mjs   (sandbox postgrest + gateway + api running)
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";
import { STAGE_EMAIL_TEMPLATES, correspondenceStatus, recordedSendAt, defaultStageTemplate, isSendingOff, templateBlockedReason, templateSendPath } from "../../src/lib/leadCorrespondence.js";

const API = "http://localhost:8797", GW = "http://localhost:54321";
for (const u of [API, GW]) if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) { console.error("Refusing: loopback sandbox only."); process.exit(2); }
const SB_DIR = join(homedir(), ".blh-register-sandbox");
const secrets = JSON.parse(readFileSync(join(SB_DIR, "secrets.json"), "utf8"));
const creds = JSON.parse(readFileSync(join(SB_DIR, "credentials.local.json"), "utf8"));
const svc = createClient(GW, secrets.service_key, { auth: { persistSession: false } });
const anon = () => createClient(GW, secrets.anon_key, { auth: { persistSession: false } });

const MARK = `BLH TEST CORRESPONDENCE ${Date.now()}`;
let pass = 0, fail = 0;
const check = (n, c, d = "") => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `\n      ${String(d).slice(0, 300)}` : ""}`); } };
const section = (t) => console.log(`\n▸ ${t}`);

async function signIn(email, password) {
  const { data, error } = await anon().auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for a test account: ${error.message}`);
  return data.session.access_token;
}
async function api(tok, method, path, body) {
  const r = await fetch(API + path, { method, headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let b = null; try { b = await r.json(); } catch { /* non-json */ }
  return { status: r.status, ok: r.ok && b?.ok !== false, body: b };
}

const FLAGS = ["mailbox", "qualify", "discovery", "concept", "tender", "pipeline"];
const created = [];
let seq = 0;
async function mkLead(stage, fields = {}) {
  const c = await api(admin, "POST", "/api/sales/leads", { first_name: "Corr", last_name: `Lead${++seq}`, name: `${MARK} ${seq}`, email: `corr-${randomBytes(4).toString("hex")}@blueleaf.test`, site_address: buildTestJobAddress({ suite: "SALES-CORRESPONDENCE", workflowId: String(seq) }), project_type: "renovation", lead_source: "referral" });
  if (!c.ok) throw new Error(`could not create a lead: ${c.status}`);
  const id = c.body.lead.id;
  created.push(id);
  const { error } = await svc.from("leads").update({ stage, ...fields }).eq("id", id);
  if (error) throw new Error(`could not place the lead: ${error.message}`);
  return id;
}
const rowsFor = async (id) => (await svc.from("correspondence").select("id").eq("lead_id", id)).data || [];

let admin, client, designerId = null;
try {
  admin = await signIn(creds.staff.email, creds.staff.password);
  client = await signIn(creds.client.email, creds.client.password);

  section("The page is told which sending is switched on");
  const leadId = await mkLead("qualify");
  const box = await api(admin, "GET", `/api/sales/leads/${leadId}/mailbox`);
  check("the mailbox read works", box.ok, box.status);
  check("every family's switch is reported", FLAGS.every((f) => typeof box.body?.sending?.[f] === "boolean"), JSON.stringify(box.body?.sending));
  const anyOn = FLAGS.filter((f) => box.body?.sending?.[f] !== false);
  if (anyOn.length) { console.error(`Refusing to continue: sending is switched on in this sandbox (${anyOn.join(", ")}). This test must never send mail.`); process.exitCode = 2; throw new Error("sending is on"); }
  check("a new lead has an empty history", Array.isArray(box.body.messages) && box.body.messages.length === 0);
  check("which reads as nothing recorded", correspondenceStatus(box.body).line === "No emails recorded for this lead yet.");

  section("Rejected: who can read it");
  check("no token is refused", (await api(null, "GET", `/api/sales/leads/${leadId}/mailbox`)).status === 401);
  check("a client is refused", (await api(client, "GET", `/api/sales/leads/${leadId}/mailbox`)).status === 403);

  section("What the page says matches what the routes do");
  const designer = await svc.from("crm_contacts").insert({ first_name: "Corr", last_name: "Designer", company: MARK, contact_type: "designer" }).select("id").single();
  if (designer.error) throw new Error(`could not create a designer: ${designer.error.message}`);
  designerId = designer.data.id;
  for (const [stage, list] of Object.entries(STAGE_EMAIL_TEMPLATES)) {
    for (const t of list) {
      const id = await mkLead(stage, { selected_designer_contact_id: designerId });
      const url = `/api/sales/leads/${id}/${templateSendPath(t)}`;
      const before = await svc.from("leads").select("*").eq("id", id).single();
      const prev = await api(admin, "POST", url, { which: t.which, preview: true });
      check(`${t.key}: preview works with sending off`, prev.ok && !!prev.body?.preview?.subject, `${prev.status} ${prev.body?.error}`);
      const flag = (await api(admin, "GET", `/api/sales/leads/${id}/mailbox`)).body.sending;
      check(`${t.key}: the page would say sending is off`, isSendingOff(t.flag, flag));
      const sent = await api(admin, "POST", url, { which: t.which, subject: "Not going out", text: "Not going out" });
      check(`${t.key}: the send is refused 503`, sent.status === 503, sent.status);
      check(`${t.key}: a refused send records nothing`, (await rowsFor(id)).length === 0);
      const after = await svc.from("leads").select("*").eq("id", id).single();
      check(`${t.key}: a refused send stamps nothing`, !t.sentField || after.data[t.sentField] === before.data[t.sentField]);
    }
  }

  section("Rejected: the free-form composer");
  const compose = await api(admin, "POST", `/api/sales/leads/${leadId}/email`, { subject: "Not going out", body: "Not going out" });
  check("refused 503 while its switch is off", compose.status === 503, compose.status);
  check("records nothing", (await rowsFor(leadId)).length === 0);

  section("Rejected: discovery email with no designer");
  const noDesigner = await mkLead("discovery");
  const nd = await api(admin, "POST", `/api/sales/leads/${noDesigner}/discovery-email/send`, { preview: true });
  check("the server refuses it too, matching the page's message", nd.status === 400 && /designer/i.test(nd.body?.error || ""), `${nd.status} ${nd.body?.error}`);
  check("the page blocks it first", /Select a designer/.test(templateBlockedReason(STAGE_EMAIL_TEMPLATES.discovery[0], { selected_designer_contact_id: null })));

  section("Rejected: no recipient");
  const noMail = await mkLead("qualify", { email: null });
  const np = await api(admin, "POST", `/api/sales/leads/${noMail}/qualify-email/send`, { preview: true });
  check("the preview says there's no address, and doesn't crash", np.status === 400 && /email/i.test(np.body?.error || ""), `${np.status} ${np.body?.error}`);

  section("Status logic against real rows");
  const logged = await mkLead("winning_offer");
  const row = (o) => ({ lead_id: logged, email_from: "a@blueleaf.test", email_to: "b@blueleaf.test", body: "x", ...o });
  const ins = await svc.from("correspondence").insert([
    row({ direction: "outbound", subject: "I edited this subject", message_id: `<concept-brief_questions-${logged}-1@blueleafbuilding.com.au>`, sent_at: "2026-11-02T02:00:00Z" }),
    row({ direction: "inbound", subject: "Re: thanks", message_id: `<client-${logged}@mail.test>`, sent_at: "2026-11-04T02:00:00Z" }),
  ]);
  check("rows inserted", !ins.error, ins.error?.message);
  const real = await api(admin, "GET", `/api/sales/leads/${logged}/mailbox`);
  const [brief, interim] = STAGE_EMAIL_TEMPLATES.winning_offer;
  const lead = (await svc.from("leads").select("*").eq("id", logged).single()).data;
  check("the latest message is what's summarised", correspondenceStatus(real.body).line === "Received 4 Nov 2026: Re: thanks", correspondenceStatus(real.body).line);
  check("a template is tied to its row even with an edited subject", recordedSendAt(brief, real.body.messages, lead)?.startsWith("2026-11-02"));
  check("a template with no row isn't marked sent", recordedSendAt(interim, real.body.messages, lead) === null);
  check("the next unsent template is offered", defaultStageTemplate(STAGE_EMAIL_TEMPLATES.winning_offer, real.body.messages, lead).key === "interim");
} catch (e) {
  fail++;
  console.log(`  ✗ unexpected: ${String(e.message).slice(0, 300)}`);
} finally {
  if (created.length) {
    await svc.from("correspondence").delete().in("lead_id", created);
    await svc.from("lead_activities").delete().in("lead_id", created);
    await svc.from("leads").delete().in("id", created);
  }
  if (designerId) await svc.from("crm_contacts").delete().eq("id", designerId);
}

console.log(`\n${fail ? "FAILED" : "PASSED"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? (process.exitCode || 1) : 0);
