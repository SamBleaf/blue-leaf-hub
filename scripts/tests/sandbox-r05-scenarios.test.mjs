/**
 * sandbox-r05-scenarios.test.mjs — R05 P7: the integrated regression, through the real API, PostgREST, RLS and Postgres.
 * Scenarios 1 to 11 of the work order. Scenario 12 (phone and desktop) is the Playwright walkthrough in scripts/tests/walkthrough/.
 * Refuses any non-loopback URL. Keys come only from ~/.blh-register-sandbox/. Credentials are never printed.
 * Run: node scripts/tests/sandbox-r05-scenarios.test.mjs   (sandbox postgrest + gateway + api + SPA running)
 */
import { readFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";
import { makeRoom, emptyMeta, makeItem, setCategoryTier, confirmRoomDefaults } from "../../src/lib/register.js";
import { gateRows, STAGE_GATES } from "../../src/lib/stageGates.js";

const SPA = "http://localhost:5184", API = "http://localhost:8797", GW = "http://localhost:54321";
for (const u of [SPA, API, GW]) if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) { console.error("Refusing: loopback sandbox only."); process.exit(2); }
const SB_DIR = join(homedir(), ".blh-register-sandbox");
const secrets = JSON.parse(readFileSync(join(SB_DIR, "secrets.json"), "utf8"));
const creds = JSON.parse(readFileSync(join(SB_DIR, "credentials.local.json"), "utf8"));
const EVIDENCE = join(homedir(), "blh-register-evidence", "r05", "p7");
mkdirSync(EVIDENCE, { recursive: true });
const svc = createClient(GW, secrets.service_key, { auth: { persistSession: false } });
const anon = () => createClient(GW, secrets.anon_key, { auth: { persistSession: false } });
const asBrowser = (tok) => createClient(GW, secrets.anon_key, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${tok}` } } });
const NOW = new Date().toISOString();
const MARK = `BLH TEST SCENARIO ${Date.now()}`;
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
  const email = `sc-${role}-${randomBytes(4).toString("hex")}@blueleaf.test`;
  const password = randomBytes(18).toString("hex");
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser: ${error.message}`);
  const { error: pe } = await svc.from("user_profiles").upsert({ id: data.user.id, email, full_name: `SC ${role}`, role, is_active: true });
  if (pe) throw new Error(`profile: ${pe.message}`);
  createdUsers.push(data.user.id);
  return signIn(email, password);
}

let admin, client;
let seq = 0;
const addressFor = () => buildTestJobAddress({ suite: "R05-SCENARIOS", workflowId: String(++seq) });
/** A real (non-test) lead created through the API, then placed at a stage with stored facts. */
async function mkLead(stage = "enquiry", fields = {}) {
  const c = await api(admin, "POST", "/api/sales/leads", { first_name: "Scenario", last_name: `Lead${seq}`, name: `${MARK} ${seq}`, site_address: addressFor(), project_type: "renovation", lead_source: "referral" });
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

const getReg = async (id) => (await api(admin, "GET", `/api/register/leads/${id}`)).body;
const putReg = (id, b) => api(admin, "PUT", `/api/register/leads/${id}`, b);
const ans = (selected, more = {}) => ({ v: 1, state: "recorded", selected: selected.map(([path, label]) => ({ optionId: path[path.length - 1], path, label })), ...more });
const scene = (n, t) => section(`Scenario ${n}: ${t}`);
const ACCEPTED = { ...QUALIFIED, concept_agreement_status: "accepted" };

async function main() {
  admin = await signIn(creds.staff.email, creds.staff.password);
  client = await signIn(creds.client.email, creds.client.password);

  scene(1, "standard design and build");
  {
    const id = await mkLead("enquiry");
    check("Enquiry to Qualify", (await patchLead(id, { stage: "qualify" })).ok);
    check("Discovery refused until qualified", (await patchLead(id, { stage: "discovery" })).status === 422);
    await patchLead(id, { qualify_budget: 2, qualify_timeframe: 2, qualify_site: 2, qualify_decision_maker: 2 });
    await patchLead(id, { discovery_meeting_booked_at: NOW, discovery_meeting_at: NOW, discovery_meeting_source: "manual" });
    check("Discovery once the facts are stored", (await patchLead(id, { stage: "discovery" })).ok);
    check("Concept refused until the agreement is accepted", (await patchLead(id, { stage: "winning_offer" })).status === 422);
    await svc.from("leads").update({ concept_agreement_status: "accepted" }).eq("id", id);
    check("Concept", (await patchLead(id, { stage: "winning_offer" })).ok);
    check("PTSA / Plans", (await patchLead(id, { stage: "fee_proposal" })).ok);
    const ptsa = await api(admin, "POST", `/api/sales/leads/${id}/ptsa/mark-signed`, { signedPdfBase64: PDF, filename: "Signed PTSA.pdf" });
    check("PTSA signed with its PDF", ptsa.ok, JSON.stringify(ptsa.body).slice(0, 200));
    check("Consultants", (await patchLead(id, { stage: "consultants" })).ok);
    check("Tender", (await patchLead(id, { stage: "tender" })).ok);
    const job1 = await api(admin, "POST", `/api/sales/leads/${id}/convert-to-job`);
    check("the job is created from the lead", job1.ok, JSON.stringify(job1.body).slice(0, 200));
    check("Won refused without a contract", (await patchLead(id, { stage: "won" })).status === 422);
    check("Contract signed with its PDF", (await api(admin, "POST", `/api/sales/leads/${id}/contract/mark-signed`, { executedConfirmed: true, contractRef: "HIA 2026 Rev A", signedPdfBase64: PDF, filename: "Signed Contract.pdf" })).ok);
    const won = await patchLead(id, { stage: "won" });
    check("Won", won.ok && won.body.lead.stage === "won", JSON.stringify(won.body).slice(0, 200));
    const row = await lead(id);
    const { data: created } = row.job_id ? await svc.from("projects").select("id, is_preconstruction").eq("job_id", row.job_id) : { data: null };
    check("a job exists and one project (DB)", !!row.job_id && created?.length === 1, JSON.stringify({ job: row.job_id, created, warnings: won.body.provisioning, won: won.body.wonHandoff }).slice(0, 500));
  }

  scene("2 and 7", "renovation with existing works, promoted to the project record");
  const kitchen = makeRoom({ id: "sc_kit", name: "Kitchen", roomType: "kitchen", order: 0, scope: "renovated" });
  const bed = makeRoom({ id: "sc_bed", name: "Bed 1", roomType: "bedroom", order: 1, scope: "renovated" });
  const reno = await mkLead("consultants", { ...ACCEPTED, ptsa_status: "signed" });
  const demo = makeItem({ itemKind: "scope", category: "demolition", promptKey: "W-004", section: "site", disposition: "remove", answer: ans([[["demolish"], "Demolish"]], { nature: "scope", element: { id: "el_1", key: "walls", label: "Walls" }, areaIds: [kitchen.id] }) });
  const access = makeItem({ itemKind: "scope", category: "site", promptKey: "W-001", section: "site", answer: ans([[["steep_access"], "Steep access"]], { nature: "fact" }) });
  const floor = makeItem({ itemKind: "selection", category: "flooring", promptKey: "W-017", section: "project", isDefault: true, certainty: "preference", answer: ans([[["carpet"], "Carpet"]], { nature: "choice", zone: { key: "bedroom_floor", label: "Bedrooms" } }) });
  const bench = makeItem({ itemKind: "selection", category: "benchtop", promptKey: "K-005", roomId: kitchen.id, room: "Kitchen", certainty: "proposed", product: "Stone X", answer: ans([[["engineered_stone"], "Engineered stone"]], { nature: "choice" }) });
  const baseline = setCategoryTier(null, "walls", "standard", { at: NOW, by: "Staff" });
  const confirmedBed = confirmRoomDefaults(bed, [floor], { at: NOW, by: "Staff" });
  const first = await putReg(reno, { meta: { ...emptyMeta({ planRev: "Rev A", renovationOverlay: true, rooms: [kitchen, confirmedBed], baseline, lastStep: "rooms", lastRoomId: bed.id }), rev: 0 }, changes: [demo, access, floor, bench] });
  check("the brief saves on the lead", first.ok, JSON.stringify(first.body).slice(0, 200));
  let reg = (await getReg(reno)).register;
  const tenderView = (await api(admin, "GET", `/api/register/leads/${reno}/tender`)).body.tender;
  check("demolition is scope, against its room", tenderView.included.some((r) => r.id === demo.id && r.area === "Kitchen"), JSON.stringify(tenderView.included).slice(0, 300));
  check("the access fact isn't scope", !tenderView.included.some((r) => r.id === access.id));

  scene(5, "several meetings refining the same record");
  {
    const before = reg.items.find((i) => i.id === floor.id);
    const r2 = await putReg(reno, { changes: [{ ...before, answer: ans([[["timber", "engineered"], "Timber · Engineered"]], { nature: "choice", zone: before.answer.zone }) }] });
    check("the second meeting changes the same record", r2.ok, JSON.stringify(r2.body).slice(0, 200));
    reg = (await getReg(reno)).register;
    check("the same id, no duplicate", reg.items.filter((i) => i.promptKey === "W-017").length === 1 && reg.items.find((i) => i.id === floor.id).answer.selected[0].optionId === "engineered");
    check("the resume point is kept", reg.meta.lastRoomId === bed.id);
  }

  await patchLead(reno, { stage: "consultants" }).catch(() => {});
  const conv = await api(admin, "POST", `/api/sales/leads/${reno}/convert-to-job`);
  const hasJob = conv.ok || !!(await lead(reno)).job_id;
  check("a job exists", hasJob, JSON.stringify(conv.body).slice(0, 200));
  const pc = await api(admin, "POST", `/api/sales/leads/${reno}/preconstruction-portal`);
  check("pre-construction project created", pc.ok, JSON.stringify(pc.body).slice(0, 300));
  const projectId = pc.body.project.id;
  let loaded = await getReg(reno);
  reg = loaded.register;
  check("the register now reads the project record", loaded.mode === "project" && loaded.projectId === projectId);
  check("every item kept its id", [demo, access, floor, bench].every((i) => reg.items.some((x) => x.id === i.id)));
  check("the area link survived", reg.items.find((i) => i.id === demo.id).answer.areaIds[0] === kitchen.id);
  check("the pricing guide survived", reg.meta.baseline.categories.walls?.tier === "standard");
  check("room confirmations survived", Object.keys(reg.meta.rooms.find((r) => r.id === bed.id).defaultConfirmations).length === 1);
  check("the fact is in the internal store, not client selections (DB)", (await svc.from("client_selections").select("id").eq("project_id", projectId).eq("source_register_item_id", access.id)).data.length === 0);

  scene(6, "a consultant updates finishes after preliminary choices");
  {
    const up = await api(admin, "POST", `/api/register/leads/${reno}/documents/sources`, { filename: "Interior schedule Rev B.pdf", data: PDF, mimeType: "application/pdf", documentType: "consultant_document", discipline: "architect", revisionLabel: "B", itemIds: [floor.id] });
    const uploaded = up.ok ? up : await api(admin, "POST", `/api/register/leads/${reno}/sources`, { filename: "Interior schedule Rev B.pdf", data: PDF, mimeType: "application/pdf", documentType: "consultant_document", discipline: "architect", revisionLabel: "B", itemIds: [floor.id] });
    check("the consultant's schedule is kept and linked to the record", uploaded.ok, JSON.stringify(uploaded.body).slice(0, 200));
    const held = reg.items.find((i) => i.id === floor.id);
    const r = await putReg(reno, { changes: [{ ...held, product: "Consultant specified oak", source: "Interior schedule Rev B" }] });
    check("staff reconcile it onto the same record", r.ok && (await getReg(reno)).register.items.find((i) => i.id === floor.id).product === "Consultant specified oak", JSON.stringify(r.body).slice(0, 200));
    const after = (await getReg(reno)).register.items.find((i) => i.id === floor.id);
    check("it isn't approved by that", after.certainty !== "client_approved");
  }

  scene(8, "controlled document revision and issue");
  {
    const p1 = await api(admin, "POST", `/api/register/leads/${reno}/documents/architect_brief/issue`, { recipientName: "Studio Example" });
    check("P01", p1.ok && p1.body.document.revision_label === "P01", JSON.stringify(p1.body).slice(0, 300));
    const held = (await getReg(reno)).register.items.find((i) => i.id === access.id);
    await putReg(reno, { changes: [{ ...held, nextAction: "Check crane access" }] });
    const p2 = await api(admin, "POST", `/api/register/leads/${reno}/documents/architect_brief/issue`, { recipientName: "Studio Example" });
    check("P02", p2.ok && p2.body.document.revision_label === "P02");
    const { data: rows } = await svc.from("lead_documents").select("status, content_sha256").eq("id", p1.body.document.id).single().then((r) => ({ data: [r.data] }));
    check("P01 is superseded and its hash unchanged (DB)", rows[0].status === "superseded" && rows[0].content_sha256 === p1.body.document.content_sha256);
    const notes2 = await api(admin, "POST", `/api/register/leads/${reno}/documents/tender_scope_notes/issue`, { recipientName: "Blue Leaf estimating" });
    check("Tender Notes issue on the project record, internal", notes2.ok && notes2.body.document.audience === "internal", JSON.stringify(notes2.body).slice(0, 300));
  }

  scene(11, "an approved Client Portal selection stays intact");
  {
    reg = (await getReg(reno)).register;
    const b = reg.items.find((i) => i.id === bench.id);
    const issued = await api(admin, "POST", `/api/register/leads/${reno}/portal/issue`, { items: [{ id: b.id, sync: b.sync }] });
    check("issued to the portal", issued.ok, JSON.stringify(issued.body).slice(0, 300));
    const fresh = (await getReg(reno)).register.items.find((i) => i.id === bench.id);
    const appr = await putReg(reno, { changes: [{ ...fresh, certainty: "client_approved", evidence: { at: NOW, by: "Staff", method: "meeting", ref: "Meeting 4 Nov" } }] });
    check("approved with evidence", appr.ok, JSON.stringify(appr.body).slice(0, 300));
    const approved = (await getReg(reno)).register.items.find((i) => i.id === bench.id);
    const overwrite = await putReg(reno, { changes: [{ ...approved, product: "A different stone" }] });
    check("a later change needs the client's re-confirmation", overwrite.status === 409 && overwrite.body?.conflicts?.[0]?.reason === "reapproval_required", JSON.stringify(overwrite.body).slice(0, 300));
    const { data: sel } = await svc.from("client_selections").select("*").eq("project_id", projectId).eq("source_register_item_id", bench.id).single();
    check("the approved selection is unchanged (DB)", sel.status === "approved");
    const clientDb = asBrowser(client);
    const { data: seen } = await clientDb.from("projects").select("register_meta").eq("id", projectId);
    check("a client token can't read the pricing guide (RLS, DB)", (seen || []).every((r) => !r.register_meta));
  }

  scene(3, "architect-prepared drawings");
  {
    const id = await mkLead("discovery", QUALIFIED);
    await supply(id);
    check("goes to Consultants with no concept approval", (await patchLead(id, { stage: "consultants" })).ok);
    check("the contract gate still stands", (await patchLead(id, { stage: "won" })).status === 422);
  }

  scene(4, "build-only engagement");
  {
    const id = await mkLead("discovery", QUALIFIED);
    const set = await api(admin, "PUT", `/api/register/leads/${id}/facts`, { deliveryModel: "build_only" });
    check("delivery model recorded", set.ok && (await lead(id)).delivery_model === "build_only", JSON.stringify(set.body).slice(0, 200));
    check("it waives nothing: Concept's gate still applies", (await patchLead(id, { stage: "consultants" })).status === 422);
    const ctx = await api(admin, "GET", `/api/register/leads/${id}/context`);
    check("the register still knows the model", ctx.body.context.deliveryModel === "build_only");
  }

  scene(9, "contract signed without valid evidence is rejected");
  {
    const id = await mkLead("tender", ACCEPTED);
    check("a status alone can't be set", (await patchLead(id, { contract_status: "signed" })).status === 400);
    check("a file that isn't a PDF is refused", (await api(admin, "POST", `/api/sales/leads/${id}/contract/mark-signed`, { executedConfirmed: true, contractRef: "HIA 2026 Rev A", signedPdfBase64: Buffer.from("not a pdf").toString("base64"), filename: "x.pdf" })).status === 400);
    check("no PDF is refused", (await api(admin, "POST", `/api/sales/leads/${id}/contract/mark-signed`, { filename: "x.pdf" })).status === 400);
    check("Won is refused", (await patchLead(id, { stage: "won" })).status === 422);
    check("nothing was stored (DB)", (await svc.from("lead_documents").select("id").eq("lead_id", id).eq("document_type", "construction_contract")).data.length === 0);
  }

  scene(10, "Won and operations handover");
  {
    await patchLead(reno, { stage: "tender" });
    const beforeWon = await api(admin, "GET", `/api/register/leads/${reno}/handover-status`);
    check("before signing, the next step is the contract", /contract/i.test(beforeWon.body.status.nextAction?.label || ""), JSON.stringify(beforeWon.body.status?.nextAction));
    check("contract signed with its PDF", (await api(admin, "POST", `/api/sales/leads/${reno}/contract/mark-signed`, { executedConfirmed: true, contractRef: "HIA 2026 Rev A", signedPdfBase64: PDF, filename: "Signed.pdf" })).ok);
    const won = await patchLead(reno, { stage: "won" });
    check("Won", won.ok, JSON.stringify(won.body).slice(0, 300));
    const row = await lead(reno);
    const { data: projects } = await svc.from("projects").select("id, is_preconstruction").eq("job_id", row.job_id);
    check("the same project moves to Operations, no duplicate (DB)", projects.length === 1 && projects[0].id === projectId && projects[0].is_preconstruction === false);
    const after = await api(admin, "GET", `/api/register/leads/${reno}/handover-status`);
    check("the status is truthful: signed, baseline still to record", /baseline/i.test(after.body.status.nextAction?.label || ""), JSON.stringify(after.body.status?.nextAction));
    const retry = await api(admin, "POST", `/api/sales/leads/${reno}/won/retry-handoff`, {});
    const { data: again } = await svc.from("projects").select("id").eq("job_id", row.job_id);
    check("a retry makes no duplicate (DB)", retry.status < 500 && again.length === 1, JSON.stringify(retry.body).slice(0, 200));
    const locked = (await getReg(reno)).register.items.find((i) => i.id === bench.id);
    const lock = await putReg(reno, { changes: [{ ...locked, product: "Another stone", certainty: "client_approved" }] });
    check("after the contract, an approved selection is locked", lock.status === 409 && lock.body?.conflicts?.[0]?.reason === "post_contract_locked", JSON.stringify(lock.body).slice(0, 200));
  }

  section("Server and screen read the same gates");
  {
    for (const [from, to, facts] of [["qualify", "discovery", {}], ["discovery", "winning_offer", QUALIFIED], ["winning_offer", "fee_proposal", ACCEPTED], ["fee_proposal", "consultants", ACCEPTED], ["consultants", "tender", ACCEPTED]]) {
      const id = await mkLead(from, facts);
      const stored = (await api(admin, "GET", `/api/sales/leads/${id}`)).body.lead;
      const rows = gateRows(to, stored);
      const unmetHard = rows.required.filter((r) => !r.met);
      const res = await patchLead(id, { stage: to });
      if (unmetHard.length) check(`${from} to ${to}: the screen's required list matches the refusal`, res.status === 422 && unmetHard.every((r) => (res.body.error || "").includes(r.blockPhrase || r.label.toLowerCase())), res.body?.error);
      else {
        const expected = rows.recommended.filter((r) => !r.met).map((r) => r.label).sort().join();
        check(`${from} to ${to}: the screen's recommended list matches the server's warnings`, res.ok && (res.body.gateWarnings || []).slice().sort().join() === expected, `${(res.body.gateWarnings || []).join()} vs ${expected}`);
      }
    }
    const pageSource = readFileSync(join(process.cwd(), "src/pages/LeadDetail.jsx"), "utf8"), serverSource = readFileSync(join(process.cwd(), "server/lib/salesRoutes.mjs"), "utf8");
    check("both import the one gate module, and neither holds its own list", /stageGates\.js/.test(pageSource) && /stageGates\.js/.test(serverSource) && !/GATE_REQUIREMENTS\s*=/.test(pageSource) && !/const STAGE_GATES\s*=/.test(serverSource) && Object.keys(STAGE_GATES).length > 0);
  }
}

try { await main(); }
catch (e) { fail++; console.log(`  ✗ test stopped: ${e.message.slice(0, 900)}\n${(e.stack || "").split("\n").slice(1, 4).join("\n")}`); }
finally { for (const u of createdUsers) await svc.auth.admin.deleteUser(u).catch(() => {}); }
console.log(`\nsandbox-r05-scenarios: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
