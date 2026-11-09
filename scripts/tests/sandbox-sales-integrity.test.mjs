/**
 * sandbox-sales-integrity.test.mjs — R05 P1 Sales integrity through the REAL Hub API (loopback sandbox only).
 *
 * Covers: same-request forged gates, forward jumps over a hard gate, contract evidence (the only way to
 * "signed" is a real PDF), the blanket-PATCH deny-list, role enforcement, stage-transition concurrency,
 * activity logging only after a successful move, Won/job idempotency and recovery, and the database guard
 * (mig 217) that refuses the same writes when they come straight from a browser token.
 *
 * Failure injection uses short-lived triggers named __si_* in the sandbox database, dropped in `finally`.
 * Refuses any non-loopback URL. Keys come only from ~/.blh-register-sandbox/. Credentials are never printed.
 *
 * Run: node scripts/tests/sandbox-sales-integrity.test.mjs   (sandbox postgrest + gateway + api running)
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";

const API = "http://localhost:8797", GW = "http://localhost:54321";
for (const u of [API, GW]) if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) { console.error("Refusing: loopback sandbox only."); process.exit(2); }
const SB_DIR = join(homedir(), ".blh-register-sandbox");
const secrets = JSON.parse(readFileSync(join(SB_DIR, "secrets.json"), "utf8"));
const creds = JSON.parse(readFileSync(join(SB_DIR, "credentials.local.json"), "utf8"));
const svc = createClient(GW, secrets.service_key, { auth: { persistSession: false } });
const anon = () => createClient(GW, secrets.anon_key, { auth: { persistSession: false } });
// The same anon key + user JWT a browser holds, straight to PostgREST with no Hub API in between.
const asBrowser = (tok) => createClient(GW, secrets.anon_key, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${tok}` } } });

const PSQL = `${process.env.PG_BIN || "/opt/homebrew/bin"}/psql`;
const sql = (q) => execFileSync(PSQL, ["-h", join(SB_DIR, "run"), "-p", "54329", "-U", "postgres", "-d", "blh", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" });

const MARK = `BLH TEST INTEGRITY ${Date.now()}`;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
const pdf = () => PDF.toString("base64");
const NOT_A_PDF = Buffer.from("PK\u0003\u0004 this is a zipped Word document, not a PDF").toString("base64");
const TRUNCATED_PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog").toString("base64");
const CUT_AFTER_EARLIER_EOF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer<<>>\n%%EOF\n2 0 obj\n<< /Sig /Adobe.PPKLite /Contents <0a0b").toString("base64");
const TEXT_WITH_MARKERS = Buffer.from("these are my notes. %PDF- is not a real header. %%EOF").toString("base64");
const JPEG_WITH_MARKERS = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(" %PDF-1.4 xx %%EOF")]).toString("base64");
const NOW = new Date().toISOString();
const QUALIFIED = { qualify_budget: 2, qualify_timeframe: 2, qualify_site: 2, qualify_decision_maker: 2, discovery_meeting_booked_at: NOW };
const PAST_CONCEPT = { ...QUALIFIED, concept_agreement_status: "accepted" };

let pass = 0, fail = 0;
const check = (n, c, d = "") => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `\n      ${String(d).slice(0, 400)}` : ""}`); } };
const section = (t) => console.log(`\n▸ ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const email = `si-${role}-${randomBytes(4).toString("hex")}@blueleaf.test`;
  const password = randomBytes(18).toString("hex");
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser: ${error.message}`);
  const { error: pe } = await svc.from("user_profiles").upsert({ id: data.user.id, email, full_name: `SI ${role}`, role, is_active: true });
  if (pe) throw new Error(`profile: ${pe.message}`);
  createdUsers.push(data.user.id);
  return signIn(email, password);
}

let admin, employee, supervisor, client;
let seq = 0;
const addressFor = () => buildTestJobAddress({ suite: "SALES-INTEGRITY", workflowId: String(++seq) });
/** A real (non-test) lead created through the API, then placed at a stage with stored facts. */
async function mkLead(stage = "enquiry", fields = {}) {
  const c = await api(admin, "POST", "/api/sales/leads", { first_name: "Integrity", last_name: `Lead${seq}`, name: `${MARK} ${seq}`, site_address: addressFor(), project_type: "renovation", lead_source: "referral" });
  if (!c.ok) throw new Error(`create lead: ${JSON.stringify(c.body)}`);
  const id = c.body.lead.id;
  if (stage !== "enquiry" || Object.keys(fields).length) {
    const { error } = await svc.from("leads").update({ stage, ...fields }).eq("id", id);
    if (error) throw new Error(`seed lead: ${error.message}`);
  }
  return id;
}
const lead = async (id) => (await svc.from("leads").select("*").eq("id", id).single()).data;
const getLead = async (id) => (await api(admin, "GET", `/api/sales/leads/${id}`)).body.lead;
const stageEvents = async (id) => (await svc.from("lead_activities").select("summary, detail").eq("lead_id", id).eq("activity_type", "stage_change")).data || [];
const notes = async (id) => (await svc.from("lead_activities").select("summary, detail").eq("lead_id", id).eq("activity_type", "note")).data || [];
const evidenceRows = async (id) => (await svc.from("lead_documents").select("*").eq("lead_id", id).eq("document_type", "construction_contract")).data || [];
const markSigned = (id, tok = admin, extra = {}) => api(tok, "POST", `/api/sales/leads/${id}/contract/mark-signed`, { signedPdfBase64: pdf(), filename: "Signed Contract.pdf", executedConfirmed: true, contractRef: "HIA 2026 Rev A", ...extra });
const patchLead = (id, body, tok = admin) => api(tok, "PATCH", `/api/sales/leads/${id}`, body);
const projectsFor = async (jobId) => (await svc.from("projects").select("id, is_preconstruction").eq("job_id", jobId)).data || [];

async function main() {
  admin = await signIn(creds.staff.email, creds.staff.password);
  client = await signIn(creds.client.email, creds.client.password);
  employee = await makeUser("employee");
  supervisor = await makeUser("supervisor");

  section("A request can't satisfy its own gate (D2)");
  {
    const id = await mkLead("qualify");
    const forged = await patchLead(id, { stage: "discovery", qualify_budget: 2, qualify_timeframe: 2, qualify_site: 2, qualify_decision_maker: 2, discovery_meeting_booked_at: NOW });
    check("forged score + booking in the same request → 422", forged.status === 422 && forged.body?.code === "GATE_BLOCKED", JSON.stringify(forged.body));
    const after = await lead(id);
    check("…nothing from the forged request was saved", after.stage === "qualify" && !after.qualify_budget && !after.discovery_meeting_booked_at);
    check("…and no stage_change event was written", (await stageEvents(id)).length === 0);

    const tender = await mkLead("tender", PAST_CONCEPT);
    const r04 = await patchLead(tender, { stage: "won", contract_status: "signed" });
    check("PR #4 regression: {stage:won, contract_status:signed} is rejected", r04.status === 400 && (await lead(tender)).stage === "tender", JSON.stringify(r04.body));

    const score = await patchLead(id, { qualify_budget: 2, qualify_timeframe: 2, qualify_site: 2, qualify_decision_maker: 2 });
    const logged = await patchLead(id, { discovery_meeting_booked_at: NOW, discovery_meeting_at: NOW, discovery_meeting_source: "manual" });
    check("QualifyActions' manual build-conversation logging still works through PATCH", score.ok && logged.ok, JSON.stringify(logged.body));
    const real = await patchLead(id, { stage: "discovery" });
    check("once the facts are stored, the advance passes", real.ok && real.body.lead.stage === "discovery", JSON.stringify(real.body));
  }

  section("A valid PDF isn't enough: a person has to say it's this client's contract (audit R05-02)");
  {
    const id = await mkLead("tender", PAST_CONCEPT);
    const noCheck = await markSigned(id, admin, { executedConfirmed: undefined });
    check("a real PDF with no confirmation is refused", noCheck.status === 400 && noCheck.body?.code === "VERIFICATION_REQUIRED", JSON.stringify(noCheck.body));
    const noRef = await markSigned(id, admin, { contractRef: "   " });
    check("no reference is refused", noRef.status === 400 && noRef.body?.code === "VERIFICATION_REQUIRED", JSON.stringify(noRef.body));
    const truthy = await markSigned(id, admin, { executedConfirmed: "true" });
    check("only an explicit true counts", truthy.status === 400);
    check("nothing was stored or marked", (await evidenceRows(id)).length === 0 && (await lead(id)).contract_status !== "signed");
    check("Won is still refused", (await patchLead(id, { stage: "won" })).status === 422);
    const good = await markSigned(id, admin, { contractRef: "HIA 2026 Rev B" });
    check("confirmed, it's accepted", good.ok, JSON.stringify(good.body));
    const [row] = await evidenceRows(id);
    const rowLead = await lead(id);
    check("the record says whose contract, which reference and who checked it", row.revision_label === "HIA 2026 Rev B" && row.review_status === "reconciled" && row.review_notes.includes(rowLead.name) && row.review_notes.includes("HIA 2026 Rev B") && row.review_notes.includes(creds.staff.email), row.review_notes);
    check("and so does the lead's history", (await notes(id)).some((n) => (n.detail || "").includes("HIA 2026 Rev B") && (n.detail || "").includes(creds.staff.email)));
  }

  section("Forward jumps check every hard gate crossed (D3)");
  {
    const a = await mkLead("enquiry");
    const r = await patchLead(a, { stage: "consultants" });
    check("Enquiry → Consultants is refused and names the gate it would skip", r.status === 422 && /Discovery/.test(r.body?.error || "") && (await lead(a)).stage === "enquiry", JSON.stringify(r.body));

    const b = await mkLead("discovery", QUALIFIED);
    const r2 = await patchLead(b, { stage: "tender" });
    check("Discovery → Tender is refused at the Concept gate", r2.status === 422 && /Concept/.test(r2.body?.error || ""), JSON.stringify(r2.body));

    const c = await mkLead("nurture");
    const r3 = await patchLead(c, { stage: "won" });
    check("Nurture → Won can't go around the gates", r3.status === 422 && (await lead(c)).stage === "nurture", JSON.stringify(r3.body));
    const r4 = await patchLead(c, { stage: "enquiry" });
    check("…but a nurture lead can come back to the start", r4.ok, JSON.stringify(r4.body));

    const arch = await mkLead("tender", { lead_type: "architect_tender" });
    const back = await patchLead(arch, { stage: "consultants" });
    const fwd = await patchLead(arch, { stage: "tender" });
    check("Architect Tender: Consultants ↔ Tender still moves (existing behaviour)", back.ok && fwd.ok, JSON.stringify(fwd.body));
    const archWon = await patchLead(arch, { stage: "won" });
    check("…and Architect Tender still needs the Won gate", archWon.status === 422 && /signed/.test(archWon.body?.error || ""), JSON.stringify(archWon.body));
    const archEarly = await mkLead("enquiry", { lead_type: "architect_tender" });
    const archJump = await patchLead(archEarly, { stage: "consultants" });
    check("…and a jump over Discovery meets the Discovery gate (D6)", archJump.status === 422 && /Discovery/.test(archJump.body?.error || "") && (await lead(archEarly)).stage === "enquiry", JSON.stringify(archJump.body));

    const bad = await patchLead(a, { stage: "not_a_stage" });
    check("an unknown stage is refused", bad.status === 400 && (await lead(a)).stage === "enquiry", JSON.stringify(bad.body));
  }

  section("Test leads and backward moves stay ungated");
  {
    const c = await api(admin, "POST", "/api/sales/leads", { first_name: "Integrity", last_name: "Test", name: `${MARK} test-lead`, site_address: addressFor(), project_type: "renovation", lead_source: "referral", is_test: true });
    const won = await patchLead(c.body.lead.id, { stage: "won" });
    check("a test lead jumps Enquiry → Won with nothing recorded", won.ok && won.body.lead.stage === "won", JSON.stringify(won.body));
    check("…and the skipped requirements are logged as a bypass", won.body.gateWarnings.includes("Building contract signed"), JSON.stringify(won.body.gateWarnings));

    const id = await mkLead("consultants");
    const back = await patchLead(id, { stage: "qualify" });
    check("a real lead can move backward with no gate", back.ok && back.body.lead.stage === "qualify", JSON.stringify(back.body));
    const lost = await patchLead(await mkLead("tender"), { stage: "lost" });
    check("a real lead can be marked Lost with no gate", lost.ok, JSON.stringify(lost.body));
  }

  section("Contract evidence (D5)");
  {
    const id = await mkLead("tender", PAST_CONCEPT);
    const direct = await patchLead(id, { contract_status: "signed" });
    const dated = await patchLead(id, { contract_signed_date: "2026-01-01" });
    check("PATCH can't set signed or a signed date, and points at the writer", direct.status === 400 && dated.status === 400 && /signed PDF/.test(direct.body?.error || ""), JSON.stringify(direct.body));
    check("…nothing stored", !(await lead(id)).contract_status && !(await lead(id)).contract_signed_date);

    const blocked = await patchLead(id, { stage: "won" });
    check("Won names both missing things", blocked.status === 422 && /building contract signed/.test(blocked.body?.error || "") && /signed contract PDF on file/.test(blocked.body?.error || ""), JSON.stringify(blocked.body));

    const noPdf = await api(admin, "POST", `/api/sales/leads/${id}/contract/mark-signed`, { filename: "x.pdf" });
    check("signed without a PDF is rejected", noPdf.status === 400 && noPdf.body?.code === "PDF_REQUIRED", JSON.stringify(noPdf.body));
    const notPdf = await markSigned(id, admin, { signedPdfBase64: NOT_A_PDF, filename: "contract.docx" });
    check("a non-PDF is rejected", notPdf.status === 400 && notPdf.body?.code === "NOT_A_PDF", JSON.stringify(notPdf.body));
    const cut = await markSigned(id, admin, { signedPdfBase64: TRUNCATED_PDF });
    check("a truncated PDF is rejected", cut.status === 400 && cut.body?.code === "NOT_A_PDF", JSON.stringify(cut.body));
    for (const [what, file] of [["a PDF cut off after an earlier %%EOF", CUT_AFTER_EARLIER_EOF], ["plain text holding both markers", TEXT_WITH_MARKERS], ["JPEG bytes holding both markers", JPEG_WITH_MARKERS]]) {
      const r = await markSigned(id, admin, { signedPdfBase64: file });
      check(`${what} is rejected`, r.status === 400 && r.body?.code === "NOT_A_PDF", JSON.stringify(r.body));
    }
    const badDate = await markSigned(id, admin, { signedDate: "2026-13-45" });
    const future = await markSigned(id, admin, { signedDate: "2099-01-01" });
    check("an invalid or future signed date is rejected", badDate.status === 400 && future.status === 400, JSON.stringify(future.body));
    check("…none of those left a document or a signed status", (await evidenceRows(id)).length === 0 && !(await lead(id)).contract_status);

    const good = await markSigned(id, admin, { signedDate: "2026-10-03" });
    check("a real PDF is accepted", good.ok && good.body.lead.contractEvidencePresent === true, JSON.stringify(good.body));
    const stored = await lead(id);
    check("…lead is signed with the date given", stored.contract_status === "signed" && stored.contract_signed_date === "2026-10-03", JSON.stringify(stored.contract_signed_date));
    const docs = await evidenceRows(id);
    check("…one evidence row at the standard path", docs.length === 1 && new RegExp(`^leads/${id}/2026-10-03-signed-contract\\.pdf$`).test(docs[0].storage_path), docs[0]?.storage_path);
    const dl = await svc.storage.from("lead-documents").download(docs[0].storage_path);
    const bytes = dl.data ? Buffer.from(await dl.data.arrayBuffer()) : Buffer.alloc(0);
    check("…and the stored file is the uploaded PDF", bytes.equals(PDF), dl.error?.message);
    check("GET reports the evidence", (await getLead(id)).contract_evidence_present === true);
    const again = await markSigned(id, admin, { signedDate: "2026-10-03" });
    const after2 = await evidenceRows(id);
    check("a second upload never overwrites the first", again.ok && after2.length === 2 && new Set(after2.map((d) => d.storage_path)).size === 2, JSON.stringify(after2.map((d) => d.storage_path)));

    const won = await patchLead(id, { stage: "won" });
    check("Won now passes", won.ok && won.body.lead.stage === "won" && won.body.lead.contract_evidence_present === true, JSON.stringify(won.body));
  }

  section("A lead already marked signed with no file");
  {
    const id = await mkLead("tender", { ...PAST_CONCEPT, contract_status: "signed", contract_signed_date: "2025-03-01" });
    const before = await getLead(id);
    check("GET shows signed with no evidence", before.contract_status === "signed" && before.contract_evidence_present === false);
    const blocked = await patchLead(id, { stage: "won" });
    check("Won asks only for the PDF", blocked.status === 422 && /signed contract PDF on file/.test(blocked.body?.error || "") && !/building contract signed/.test(blocked.body?.error || ""), JSON.stringify(blocked.body));
    const attach = await markSigned(id, admin, { signedDate: "2026-11-01" });
    check("the PDF can be attached", attach.ok && attach.body.lead.contractEvidencePresent === true, JSON.stringify(attach.body));
    check("…the historical signed date is kept", (await lead(id)).contract_signed_date === "2025-03-01", (await lead(id)).contract_signed_date);
    check("…and that is logged", (await notes(id)).some((n) => /PDF attached/.test(n.summary)));
    const won = await patchLead(id, { stage: "won" });
    check("Won then passes", won.ok, JSON.stringify(won.body));

    const undated = await mkLead("tender", { ...PAST_CONCEPT, contract_status: "signed", contract_signed_date: null });
    const noDate = await markSigned(undated);
    check("attaching a PDF with no date leaves an unknown signed date unknown", noDate.ok && (await lead(undated)).contract_signed_date === null, (await lead(undated)).contract_signed_date);
    const undated2 = await mkLead("tender", { ...PAST_CONCEPT, contract_status: "signed", contract_signed_date: null });
    const withDate = await markSigned(undated2, admin, { signedDate: "2025-06-15" });
    check("…and records the date when staff give one", withDate.ok && (await lead(undated2)).contract_signed_date === "2025-06-15", (await lead(undated2)).contract_signed_date);
  }

  section("One door for contract evidence");
  {
    const id = await mkLead("tender", { ...PAST_CONCEPT, contract_status: "signed", contract_signed_date: "2025-03-01" });
    const generic = await api(admin, "POST", `/api/sales/leads/${id}/documents`, { filename: "photo.jpg", data: NOT_A_PDF, mime_type: "image/jpeg", document_type: "construction_contract" });
    check("the generic Documents upload can't create contract evidence", generic.status === 400 && generic.body?.code === "USE_CONTRACT_WRITER" && (await evidenceRows(id)).length === 0, JSON.stringify(generic.body));
    const other = await api(admin, "POST", `/api/sales/leads/${id}/documents`, { filename: "notes.pdf", data: pdf(), mime_type: "application/pdf", document_type: "other" });
    check("…ordinary documents still upload", other.ok, JSON.stringify(other.body));

    await markSigned(id);
    const [doc] = await evidenceRows(id);
    const denied = await api(employee, "DELETE", `/api/sales/leads/${id}/documents/${doc.id}`);
    check("an employee can't remove the signed contract", denied.status === 403 && (await evidenceRows(id)).length === 1, JSON.stringify(denied.body));
    const removed = await api(admin, "DELETE", `/api/sales/leads/${id}/documents/${doc.id}`);
    check("a director can, and it is logged", removed.ok && (await notes(id)).some((n) => /PDF removed/.test(n.summary)), JSON.stringify(removed.body));
    const blocked = await patchLead(id, { stage: "won" });
    check("with the file gone, Won is blocked again", blocked.status === 422 && (await getLead(id)).contract_evidence_present === false, JSON.stringify(blocked.body));
  }

  section("Server-owned fields");
  {
    const id = await mkLead("tender", PAST_CONCEPT);
    for (const body of [{ is_test: true }, { won_at: "2026-01-01" }, { job_id: "00000000-0000-0000-0000-000000000000" }, { contract_evidence_present: true }, { lead_type: "architect_tender" }, { ptsa_signed_at: NOW }, { stage_entered_at: NOW }]) {
      const r = await patchLead(id, body);
      check(`PATCH refuses ${Object.keys(body)[0]}`, r.status === 400 && r.body?.code === "SERVER_OWNED_FIELD", JSON.stringify(r.body));
    }
    for (const body of [{ schedule_signed_off_at: NOW }, { schedule_signed_off_by: createdUsers[0] }, { delivery_model: "build_only" }]) {
      const r = await patchLead(id, body);
      check(`PATCH refuses ${Object.keys(body)[0]}`, r.status === 400 && r.body?.code === "SERVER_OWNED_FIELD", JSON.stringify(r.body));
    }
    const ticked = await patchLead(id, { tender_substatus: "contract_signed" });
    check("PATCH can't tick Contract signed on the progress strip", ticked.status === 400 && /signed PDF/.test(ticked.body?.error || ""), JSON.stringify(ticked.body));
    const row = await lead(id);
    check("…and none of them were stored", !row.is_test && !row.won_at && !row.job_id && row.lead_type !== "architect_tender" && !row.schedule_signed_off_at && row.delivery_model !== "build_only" && row.tender_substatus !== "contract_signed");
    const facts = await api(admin, "PUT", `/api/register/leads/${id}/facts`, { deliveryModel: "build_only" });
    check("delivery_model still saves through its own writer", facts.ok && (await lead(id)).delivery_model === "build_only", JSON.stringify(facts.body));
    const ok = await patchLead(id, { contract_status: "sent", contract_sent_date: "2026-10-01", tender_substatus: "contract_sent" });
    check("fields the UI really writes still save", ok.ok && ok.body.lead.contract_status === "sent", JSON.stringify(ok.body));

    const signedAtCreate = await api(admin, "POST", "/api/sales/leads", { first_name: "X", name: `${MARK} x`, lead_source: "referral", contract_status: "signed" });
    const wonAtCreate = await api(admin, "POST", "/api/sales/leads", { first_name: "X", name: `${MARK} x`, lead_source: "referral", stage: "won" });
    check("a new lead can't be created signed or won", signedAtCreate.status === 400 && wonAtCreate.status === 400, JSON.stringify(wonAtCreate.body));
    const later = await api(admin, "POST", "/api/sales/leads", { first_name: "X", name: `${MARK} later`, lead_source: "referral", stage: "tender" });
    check("a standard lead can't be created past Enquiry", later.status === 400 && later.body?.code === "SERVER_OWNED_FIELD", JSON.stringify(later.body));
    const archConsultants = await api(admin, "POST", "/api/sales/leads", { first_name: "X", name: `${MARK} arch-early`, lead_source: "referral", lead_type: "architect_tender", stage: "consultants" });
    check("an Architect Tender can only be created at Tender", archConsultants.status === 400, JSON.stringify(archConsultants.body));
    const archIntake = await api(admin, "POST", "/api/sales/leads", { first_name: "X", name: `${MARK} arch`, site_address: addressFor(), lead_source: "referral", lead_type: "architect_tender", stage: "tender" });
    check("the Architect Tender intake still creates at Tender", archIntake.ok && archIntake.body.lead.stage === "tender", JSON.stringify(archIntake.body));
    const testLater = await api(admin, "POST", "/api/sales/leads", { first_name: "X", name: `${MARK} test-later`, site_address: addressFor(), lead_source: "referral", is_test: true, stage: "consultants" });
    check("a test lead can still start anywhere", testLater.ok && testLater.body.lead.stage === "consultants", JSON.stringify(testLater.body));
    const plain = await api(admin, "POST", "/api/sales/leads", { first_name: "X", name: `${MARK} plain`, lead_source: "referral" });
    check("a normal lead starts at Enquiry", plain.ok && plain.body.lead.stage === "enquiry", JSON.stringify(plain.body));
  }

  section("Direct database writes with a browser token (mig 217)");
  {
    const id = await mkLead("tender", PAST_CONCEPT);
    for (const [who, tok] of [["employee", employee], ["director", admin]]) {
      const db = asBrowser(tok);
      for (const change of [{ stage: "won" }, { contract_status: "signed" }, { contract_signed_date: "2026-01-01" }, { ptsa_status: "signed" }, { concept_agreement_status: null }, { lead_type: "architect_tender" }, { is_test: true }]) {
        const r = await db.from("leads").update(change).eq("id", id).select("id");
        check(`${who} token can't change ${Object.keys(change)[0]} directly`, !!r.error && !r.data?.length, JSON.stringify(r.data));
      }
    }
    const row = await lead(id);
    check("…the lead is exactly as it was", row.stage === "tender" && !row.contract_status && !row.contract_signed_date && row.ptsa_status !== "signed" && row.concept_agreement_status === "accepted" && row.lead_type !== "architect_tender" && !row.is_test, JSON.stringify(row.stage));

    const db = asBrowser(employee);
    const forged = await db.from("lead_documents").insert({ lead_id: id, filename: "fake.pdf", storage_path: "does/not/exist.pdf", document_type: "construction_contract" }).select("id");
    check("a browser token can't create contract evidence", !!forged.error && (await evidenceRows(id)).length === 0 && (await getLead(id)).contract_evidence_present === false, JSON.stringify(forged.data));
    const won = await patchLead(id, { stage: "won" });
    check("…and the forged attempt doesn't help a lead reach Won", won.status === 422 && (await lead(id)).stage === "tender", JSON.stringify(won.body));

    const ordinary = await db.from("lead_documents").insert({ lead_id: id, filename: "ordinary.pdf", storage_path: `leads/${id}/ordinary.pdf`, document_type: "other" }).select("id").single();
    check("other document types are not affected", !ordinary.error, ordinary.error?.message);
    const promote = await db.from("lead_documents").update({ document_type: "construction_contract" }).eq("id", ordinary.data?.id).select("id");
    check("an ordinary document can't be relabelled as the contract", !!promote.error && (await evidenceRows(id)).length === 0, JSON.stringify(promote.data));

    await markSigned(id);
    const [real] = await evidenceRows(id);
    const del = await db.from("lead_documents").delete().eq("id", real.id).select("id");
    check("a browser token can't remove the signed contract", !!del.error && (await evidenceRows(id)).length === 1, JSON.stringify(del.data));
    const relabel = await db.from("lead_documents").update({ document_type: "other" }).eq("id", real.id).select("id");
    check("…or relabel it", !!relabel.error && (await evidenceRows(id)).length === 1, JSON.stringify(relabel.data));

    const direct = await asBrowser(admin).from("leads").insert({ first_name: "X", name: `${MARK} direct`, lead_source: "referral", lead_source_category: "referral", stage: "won" }).select("id");
    check("a browser token can't insert a lead past Enquiry", !!direct.error, JSON.stringify(direct.data));

    const { data: job } = await svc.from("jobs").insert({ address: addressFor().trim(), client_name: `${MARK} guard`, project_type: "renovation", status: "tendering" }).select("id").single();
    const link = await asBrowser(admin).from("leads").update({ job_id: job.id }).eq("id", id).is("job_id", null).select("job_id").single();
    check("RfqEngine's direct job_id link still works", !link.error && link.data?.job_id === job.id, link.error?.message);
    const service = await svc.from("leads").update({ contract_status: "sent" }).eq("id", id).select("contract_status").single();
    check("the Hub's service role is not affected", !service.error && service.data.contract_status === "sent", service.error?.message);
  }

  // Every /api/sales and /api/tender route is admin-only at the prefix gate in dev-api.mjs ("A4"), which runs
  // before the route-level checks. So employees AND supervisors are refused here; the route-level limits for
  // a future opening to supervisors are covered by the role predicates in sales-stage-gates.test.mjs.
  section("Roles (D7)");
  {
    const id = await mkLead("tender", PAST_CONCEPT);
    check("employee can't mark a contract signed", (await markSigned(id, employee)).status === 403 && (await evidenceRows(id)).length === 0);
    const ptsa = await api(employee, "POST", `/api/sales/leads/${id}/ptsa/mark-signed`, { signedPdfBase64: pdf(), filename: "p.pdf" });
    check("employee can't mark a PTSA signed", ptsa.status === 403, JSON.stringify(ptsa.body));
    const accept = await api(employee, "POST", `/api/sales/leads/${id}/concept-agreement/accept`, {});
    check("employee can't accept a concept agreement", accept.status === 403, JSON.stringify(accept.body));
    const handoff = await api(employee, "POST", `/api/sales/leads/${id}/won/retry-handoff`, {});
    check("employee can't re-run the hand-off", handoff.status === 403, JSON.stringify(handoff.body));
    const finalize = await api(employee, "POST", "/api/tender/win-finalize", { jobId: "00000000-0000-0000-0000-000000000000", rfqUpdates: [{ id: "x" }] });
    check("employee can't finalize a Tender win", finalize.status === 403, JSON.stringify(finalize.body));
    const day = await patchLead(id, { suburb: "Unley" }, employee);
    check("employee has no Sales API access at all (unchanged, A4 prefix gate)", day.status === 403 && (await lead(id)).suburb !== "Unley", JSON.stringify(day.body));
    const cl = await api(client, "GET", `/api/sales/leads/${id}`);
    check("a client is refused outright", cl.status === 403, JSON.stringify(cl.body));

    check("a director can mark a contract signed", (await markSigned(id)).ok);
    const empWon = await patchLead(id, { stage: "won" }, employee);
    check("employee can't move a lead to Won, even with the gate met", empWon.status === 403 && (await lead(id)).stage === "tender", JSON.stringify(empWon.body));
    const supSign = await markSigned(id, supervisor);
    check("supervisor is refused too while Sales is admin-only", supSign.status === 403 && (await evidenceRows(id)).length === 1, JSON.stringify(supSign.body));
    const supWon = await patchLead(id, { stage: "won" }, supervisor);
    check("supervisor can't move a lead to Won while Sales is admin-only", supWon.status === 403 && (await lead(id)).stage === "tender", JSON.stringify(supWon.body));

    const supUnsign = await patchLead(id, { contract_status: "sent" }, supervisor);
    check("supervisor can't un-sign a contract", supUnsign.status === 403 && (await lead(id)).contract_status === "signed", JSON.stringify(supUnsign.body));
    const both = await patchLead(id, { contract_status: "sent", stage: "won" });
    check("un-sign and a stage move can't be combined", both.status === 400 && (await lead(id)).contract_status === "signed", JSON.stringify(both.body));
    const unsign = await patchLead(id, { contract_status: "sent" });
    check("a director can un-sign", unsign.ok && unsign.body.lead.contract_status === "sent" && unsign.body.lead.contract_signed_date === null, JSON.stringify(unsign.body));
    check("…it is logged with who did it", (await notes(id)).some((n) => /changed from signed to sent/.test(n.summary) && new RegExp(creds.staff.email.split("@")[0]).test(n.detail || "")));
    const signedOn = new Date().toISOString().slice(0, 10);
    check("…and the log keeps the date that was cleared", (await notes(id)).some((n) => /changed from signed to sent/.test(n.summary) && (n.detail || "").includes(`Signed date was ${signedOn}`)), JSON.stringify(await notes(id)));
    check("…and the PDF stays on file", (await getLead(id)).contract_evidence_present === true);
    const stale = await patchLead(id, { stage: "won" });
    check("old evidence alone doesn't reach Won", stale.status === 422 && /building contract signed/.test(stale.body?.error || "") && !/PDF on file/.test(stale.body?.error || ""), JSON.stringify(stale.body));
    await markSigned(id);
    const adminWon = await patchLead(id, { stage: "won" });
    check("re-signing with a PDF lets a director move it to Won", adminWon.ok, JSON.stringify(adminWon.body));
  }

  section("Concurrency and event logging");
  const dropped = [];
  try {
    // Hold the first update open so the second request reads the old stage, then loses on the WHERE clause.
    const slow = await mkLead("enquiry");
    sql(`CREATE OR REPLACE FUNCTION public.__si_slow() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(1.2); RETURN NEW; END $$;
         CREATE TRIGGER __si_slow_tr BEFORE UPDATE OF stage ON public.leads FOR EACH ROW WHEN (OLD.id = '${slow}' AND NEW.stage <> OLD.stage) EXECUTE FUNCTION public.__si_slow();`);
    dropped.push(`DROP TRIGGER IF EXISTS __si_slow_tr ON public.leads; DROP FUNCTION IF EXISTS public.__si_slow();`);
    const first = patchLead(slow, { stage: "qualify" });
    await sleep(350);
    const second = patchLead(slow, { stage: "qualify" });
    const [a, b] = await Promise.all([first, second]);
    check("double advance: one wins, the other gets a plain 409", a.status === 200 && b.status === 409 && b.body?.code === "STAGE_CONFLICT" && /Reload/.test(b.body?.error || ""), `${a.status} ${b.status} ${JSON.stringify(b.body)}`);
    check("…exactly one stage_change event", (await stageEvents(slow)).length === 1, JSON.stringify(await stageEvents(slow)));
    check("…and the lead moved once", (await lead(slow)).stage === "qualify");

    const burst = await mkLead("enquiry");
    const results = await Promise.all(Array.from({ length: 8 }, () => patchLead(burst, { stage: "qualify" })));
    check("a burst of 8 advances only ever returns 200 or 409", results.every((r) => r.status === 200 || r.status === 409), results.map((r) => r.status).join(","));
    check("…one stage_change event in total", (await stageEvents(burst)).length === 1, String((await stageEvents(burst)).length));
    const retry = await patchLead(burst, { stage: "qualify" });
    check("a retry after success is a no-op with no second event", retry.ok && (await stageEvents(burst)).length === 1);

    const failed = await mkLead("enquiry");
    const f = await patchLead(failed, { stage: "qualify", definitely_not_a_column: "x" });
    check("a failed update returns an error", f.status === 400 && !/schema cache|PGRST|column/i.test(f.body?.error || ""), JSON.stringify(f.body));
    check("…writes no stage_change event", (await stageEvents(failed)).length === 0);
    check("…and doesn't move the lead", (await lead(failed)).stage === "enquiry");

    const noLog = await mkLead("enquiry");
    sql(`CREATE OR REPLACE FUNCTION public.__si_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$;
         CREATE TRIGGER __si_fail_tr BEFORE INSERT ON public.lead_activities FOR EACH ROW WHEN (NEW.lead_id = '${noLog}') EXECUTE FUNCTION public.__si_fail();`);
    dropped.push(`DROP TRIGGER IF EXISTS __si_fail_tr ON public.lead_activities; DROP FUNCTION IF EXISTS public.__si_fail();`);
    const moved = await patchLead(noLog, { stage: "qualify" });
    check("a failed activity insert doesn't fail a completed move", moved.ok && (await lead(noLog)).stage === "qualify", JSON.stringify(moved.body));
    check("…and no event exists to contradict it", (await stageEvents(noLog)).length === 0);

    section("Won idempotency and recovery");
    const w = await mkLead("tender", PAST_CONCEPT);
    const conv = await api(admin, "POST", `/api/sales/leads/${w}/convert-to-job`);
    const jobId = conv.body?.job?.id;
    check("job created from the lead", !!jobId, JSON.stringify(conv.body));
    await markSigned(w);
    const won1 = await patchLead(w, { stage: "won" });
    check("Won flips the job and creates one project", won1.ok && won1.body.wonHandoff?.ok === true && (await projectsFor(jobId)).length === 1, JSON.stringify(won1.body?.wonHandoff));
    check("…and the job is won", (await svc.from("jobs").select("status").eq("id", jobId).single()).data.status === "won");
    const eventsAfterWon = (await stageEvents(w)).length;
    const won2 = await patchLead(w, { stage: "won" });
    check("a second Won call is a no-op", won2.ok && (await stageEvents(w)).length === eventsAfterWon && (await projectsFor(jobId)).length === 1, JSON.stringify(won2.body));
    await patchLead(w, { stage: "tender" });
    const won3 = await patchLead(w, { stage: "won" });
    check("back to Tender and Won again creates no duplicate", won3.ok && won3.body.wonHandoff?.ok === true && (await projectsFor(jobId)).length === 1, JSON.stringify(won3.body?.wonHandoff));
    const leadJobs = (await svc.from("jobs").select("id").eq("lead_id", w)).data || [];
    check("…still one job for the lead", leadJobs.length === 1, String(leadJobs.length));
    const r1 = await api(admin, "POST", `/api/sales/leads/${w}/won/retry-handoff`, {});
    const r2 = await api(admin, "POST", `/api/sales/leads/${w}/won/retry-handoff`, {});
    check("re-running the hand-off twice is safe", r1.ok && r2.ok && r2.body.handoff.projectId === r1.body.handoff.projectId && (await projectsFor(jobId)).length === 1, JSON.stringify(r2.body));

    const notWon = await mkLead("tender");
    const nw = await api(admin, "POST", `/api/sales/leads/${notWon}/won/retry-handoff`, {});
    check("the retry refuses a lead that isn't Won", nw.status === 409 && nw.body?.code === "NOT_WON", JSON.stringify(nw.body));
    const noJob = await mkLead("won");
    const nj = await api(admin, "POST", `/api/sales/leads/${noJob}/won/retry-handoff`, {});
    check("the retry asks for a job when there is none", nj.status === 409 && nj.body?.code === "NO_JOB", JSON.stringify(nj.body));

    // Won succeeded but the hand-off failed: the lead stays Won, the failure is reported, and retry finishes it.
    const flaky = await mkLead("tender", PAST_CONCEPT);
    const flakyJob = (await api(admin, "POST", `/api/sales/leads/${flaky}/convert-to-job`)).body.job.id;
    await markSigned(flaky);
    sql(`CREATE OR REPLACE FUNCTION public.__si_job_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$;
         CREATE TRIGGER __si_job_fail_tr BEFORE UPDATE OF status ON public.jobs FOR EACH ROW WHEN (OLD.id = '${flakyJob}') EXECUTE FUNCTION public.__si_job_fail();`);
    const dropJobFail = `DROP TRIGGER IF EXISTS __si_job_fail_tr ON public.jobs; DROP FUNCTION IF EXISTS public.__si_job_fail();`;
    dropped.push(dropJobFail);
    const softWon = await patchLead(flaky, { stage: "won" });
    check("a failed hand-off doesn't un-win the lead, and says so", softWon.ok && softWon.body.lead.stage === "won" && softWon.body.wonHandoff?.ok === false, JSON.stringify(softWon.body?.wonHandoff));
    const stillDown = await api(admin, "POST", `/api/sales/leads/${flaky}/won/retry-handoff`, {});
    check("the retry reports it if it still can't finish", stillDown.status === 502 && stillDown.body?.code === "HANDOFF_INCOMPLETE", JSON.stringify(stillDown.body));
    sql(dropJobFail);
    dropped.splice(dropped.indexOf(dropJobFail), 1);
    const fixed = await api(admin, "POST", `/api/sales/leads/${flaky}/won/retry-handoff`, {});
    check("the retry finishes the job", fixed.ok && (await svc.from("jobs").select("status").eq("id", flakyJob).single()).data.status === "won" && (await projectsFor(flakyJob)).length === 1, JSON.stringify(fixed.body));

    // The state the Won panel's link names: job already won, project gone.
    await svc.from("projects").delete().eq("job_id", flakyJob);
    const restored = await api(admin, "POST", `/api/sales/leads/${flaky}/won/retry-handoff`, {});
    check("the retry restores a project missing from Operations", restored.ok && (await projectsFor(flakyJob)).length === 1, JSON.stringify(restored.body));
    const restoredAgain = await api(admin, "POST", `/api/sales/leads/${flaky}/won/retry-handoff`, {});
    check("…and only ever one", restoredAgain.ok && (await projectsFor(flakyJob)).length === 1, JSON.stringify(restoredAgain.body));

    // A pre-construction portal project that can't graduate isn't in Operations, whatever the row count says.
    const pre = await mkLead("tender", PAST_CONCEPT);
    const preJob = (await api(admin, "POST", `/api/sales/leads/${pre}/convert-to-job`)).body.job.id;
    await markSigned(pre);
    await svc.from("projects").insert({ job_id: preJob, address: addressFor().trim(), status: "active", is_preconstruction: true });
    sql(`CREATE OR REPLACE FUNCTION public.__si_grad_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$;
         CREATE TRIGGER __si_grad_fail_tr BEFORE UPDATE OF is_preconstruction ON public.projects FOR EACH ROW WHEN (OLD.job_id = '${preJob}') EXECUTE FUNCTION public.__si_grad_fail();`);
    const dropGradFail = `DROP TRIGGER IF EXISTS __si_grad_fail_tr ON public.projects; DROP FUNCTION IF EXISTS public.__si_grad_fail();`;
    dropped.push(dropGradFail);
    const notGraduated = await patchLead(pre, { stage: "won" });
    check("a project that failed to graduate is reported, not called done", notGraduated.ok && notGraduated.body.wonHandoff?.ok === false && (await projectsFor(preJob))[0].is_preconstruction === true, JSON.stringify(notGraduated.body?.wonHandoff));
    const gradStill = await api(admin, "POST", `/api/sales/leads/${pre}/won/retry-handoff`, {});
    check("…the retry says so while it still can't finish", gradStill.status === 502 && gradStill.body?.code === "HANDOFF_INCOMPLETE", JSON.stringify(gradStill.body));
    sql(dropGradFail);
    dropped.splice(dropped.indexOf(dropGradFail), 1);
    const graduated = await api(admin, "POST", `/api/sales/leads/${pre}/won/retry-handoff`, {});
    const preProjects = await projectsFor(preJob);
    check("…and finishes once it can", graduated.ok && preProjects.length === 1 && preProjects[0].is_preconstruction === false, JSON.stringify(graduated.body));

    // A won job that was later archived from the Tender board has already handed over.
    await svc.from("jobs").update({ status: "archived" }).eq("id", flakyJob);
    const afterArchive = await api(admin, "POST", `/api/sales/leads/${flaky}/won/retry-handoff`, {});
    check("the retry on a won job archived later reports done and doesn't un-archive it", afterArchive.ok && (await svc.from("jobs").select("status").eq("id", flakyJob).single()).data.status === "archived" && (await projectsFor(flakyJob)).length === 1, JSON.stringify(afterArchive.body));

    // An archived or lost job was closed on purpose. Won and the retry leave it alone.
    for (const closedStatus of ["archived", "lost"]) {
      const closed = await mkLead("tender", PAST_CONCEPT);
      const closedJob = (await api(admin, "POST", `/api/sales/leads/${closed}/convert-to-job`)).body.job.id;
      await markSigned(closed);
      await svc.from("jobs").update({ status: closedStatus }).eq("id", closedJob);
      const entered = await patchLead(closed, { stage: "won" });
      check(`moving to Won leaves a ${closedStatus} job closed and says so`, entered.ok && entered.body.wonHandoff?.ok === false && !!entered.body.wonHandoff?.message && (await svc.from("jobs").select("status").eq("id", closedJob).single()).data.status === closedStatus, JSON.stringify(entered.body?.wonHandoff));
      const retried = await api(admin, "POST", `/api/sales/leads/${closed}/won/retry-handoff`, {});
      check(`…the retry refuses in plain words (${closedStatus})`, retried.status === 409 && retried.body?.code === "JOB_CLOSED" && /Tender Manager/.test(retried.body?.error || ""), JSON.stringify(retried.body));
      check(`…the job is still ${closedStatus} with no project`, (await svc.from("jobs").select("status").eq("id", closedJob).single()).data.status === closedStatus && (await projectsFor(closedJob)).length === 0);
      await svc.from("jobs").update({ status: "tendering" }).eq("id", closedJob);
      const reopened = await api(admin, "POST", `/api/sales/leads/${closed}/won/retry-handoff`, {});
      check(`…and restoring it lets the hand-off finish (${closedStatus})`, reopened.ok && (await projectsFor(closedJob)).length === 1, JSON.stringify(reopened.body));
    }

    // Won with no job: creating the job afterwards must still complete the hand-off, even onto an existing job.
    const addr = addressFor();
    const lateWon = await mkLead("won", { site_address: addr });
    const { data: existing } = await svc.from("jobs").insert({ address: addr.trim(), client_name: `${MARK} late`, project_type: "renovation", status: "tendering" }).select("id").single();
    const lateConv = await api(admin, "POST", `/api/sales/leads/${lateWon}/convert-to-job`);
    check("creating the job after Won links the existing job", lateConv.body?.job?.id === existing.id, JSON.stringify(lateConv.body));
    check("…and completes the hand-off", (await svc.from("jobs").select("status").eq("id", existing.id).single()).data.status === "won" && (await projectsFor(existing.id)).length === 1);

    section("The Tender win path honours the Won gate");
    const tw = await mkLead("tender", PAST_CONCEPT);
    const twJob = (await api(admin, "POST", `/api/sales/leads/${tw}/convert-to-job`)).body.job.id;
    const refused = await api(admin, "POST", "/api/tender/win-finalize", { jobId: twJob, rfqUpdates: [{ id: "00000000-0000-0000-0000-000000000000", status: "accepted" }], acceptedTrades: [] });
    check("win-finalize is refused without a signed contract", refused.status === 422 && refused.body?.code === "GATE_BLOCKED", JSON.stringify(refused.body));
    check("…before anything is written", (await lead(tw)).stage === "tender" && (await svc.from("jobs").select("status").eq("id", twJob).single()).data.status !== "won");
  } finally {
    for (const q of dropped) { try { sql(q); } catch (e) { console.log(`  ! cleanup failed: ${e.message}`); } }
  }

  const left = sql(`SELECT count(*) FROM pg_trigger WHERE tgname LIKE '__si_%' AND NOT tgisinternal;`).trim();
  check("no injected triggers remain in the sandbox", left === "0", left);
}

try {
  await main();
} catch (e) {
  fail++;
  console.log(`  ✗ test run aborted: ${e.message}`);
} finally {
  try {
    await svc.from("leads").update({ archived: true }).like("name", `${MARK}%`);
    for (const id of createdUsers) await svc.from("user_profiles").update({ is_active: false }).eq("id", id);
  } catch { /* cleanup is best-effort in the sandbox */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
