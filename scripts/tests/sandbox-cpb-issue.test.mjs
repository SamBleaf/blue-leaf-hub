/**
 * sandbox-cpb-issue.test.mjs — the Client Project Brief (cpb-2.3) issued for real on the isolated sandbox (independent
 * reviews CPB-15, CPB2-04): preview → issue R01 through the API → download the stored PDF and match its checksum →
 * change a selection and the drawing basis, issue R02 → R02 prints the new drawing set, R01 still opens unchanged with
 * the set it was issued against → a client login can't see either. Evidence (the issued PDFs and the registry rows) is
 * written to ~/blh-register-evidence/docsuite/cpb4/. Refuses any non-loopback URL; credentials are
 * never printed. Nothing is emailed: an issue is a record. Run: node scripts/tests/sandbox-cpb-issue.test.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";
import { REGISTER_PROJECTS, KESTREL_SUPPLIED_PLANS } from "../documents/fixtures/register-projects.mjs";
import { pdfFontNames } from "../../server/lib/docxToPdf.mjs";

const API = "http://localhost:8797", GW = "http://localhost:54321";
for (const u of [API, GW]) if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) { console.error("Refusing: loopback sandbox only."); process.exit(2); }
const SB_DIR = join(homedir(), ".blh-register-sandbox");
const secrets = JSON.parse(readFileSync(join(SB_DIR, "secrets.json"), "utf8"));
const creds = JSON.parse(readFileSync(join(SB_DIR, "credentials.local.json"), "utf8"));
const EVIDENCE = join(homedir(), "blh-register-evidence", "docsuite", "cpb4");
mkdirSync(EVIDENCE, { recursive: true });
const svc = createClient(GW, secrets.service_key, { auth: { persistSession: false } });
const anon = () => createClient(GW, secrets.anon_key, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const check = (n, c, d = "") => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `\n      ${String(d).slice(0, 500)}` : ""}`); } };
const section = (t) => console.log(`\n▸ ${t}`);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const pdfText = (buf, name) => { const f = join(EVIDENCE, name); writeFileSync(f, buf); try { return execFileSync("pdftotext", [f, "-"], { encoding: "utf8" }); } catch { return ""; } };

async function main() {
  const { data: auth, error } = await anon().auth.signInWithPassword({ email: creds.staff.email, password: creds.staff.password });
  if (error) throw new Error("staff sign-in failed");
  const headers = { authorization: `Bearer ${auth.session.access_token}`, "content-type": "application/json" };
  const api = async (method, path, body, h = headers) => { const r = await fetch(API + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); let b = null; try { b = await r.json(); } catch { /* not json */ } return { status: r.status, ok: r.ok && b?.ok !== false, body: b }; };
  const fetchIssued = async (leadId, docId) => {
    const u = await api("GET", `/api/register/leads/${leadId}/documents/${docId}/url`);
    if (!u.ok) return null;
    const href = u.body.url.startsWith("http") ? u.body.url : `${GW}/storage/v1${u.body.url}`;
    return Buffer.from(await (await fetch(href)).arrayBuffer());
  };

  section("The Kestrel Court brief on a sandbox lead");
  const k = REGISTER_PROJECTS.kestrel();
  const created = await api("POST", "/api/sales/leads", { first_name: "Jordan", last_name: "Whitcombe", name: "Jordan & Mia Whitcombe", email: `cpb2-${Date.now()}@example.invalid`, phone: "0400 000 000",
    site_address: buildTestJobAddress({ suite: "DOCSUITE-CPB2", workflowId: String(Date.now()) }), suburb: "Stirling", project_type: "renovation", lead_source: "referral", is_test: true });
  if (!created.ok) throw new Error(`could not create a lead: ${created.status}`);
  const id = created.body.lead.id;
  await svc.from("leads").update({ stage: "winning_offer", delivery_model: "design_build", project_description: k.context.goals.description, wo_client_vision: k.context.goals.vision }).eq("id", id);
  const seeded = await api("PUT", `/api/register/leads/${id}`, { meta: { ...k.register.meta, rev: 0 }, changes: k.register.items });
  check("the register is saved through the API", seeded.ok, JSON.stringify(seeded.body).slice(0, 300));

  section("Preview, then issue R01");
  const pv = await api("POST", `/api/register/leads/${id}/documents/client_brief/preview`, { recipientName: "Jordan & Mia Whitcombe" });
  const pvText = pv.ok ? pdfText(Buffer.from(pv.body.pdf, "base64"), "CPB-preview-draft.pdf") : "";
  check("the preview renders with no blocking checks", pv.ok && pv.body.checks.errors.length === 0, JSON.stringify(pv.body?.checks).slice(0, 400));
  check("the draft carries no revision and says it isn't issued", /BLB-CPB-BL[0-9A-F]{6}/.test(pvText) && /Draft — not issued/.test(pvText) && !/BLB-CPB-BL[0-9A-F]{6}-R\d\d/.test(pvText));
  const r1 = await api("POST", `/api/register/leads/${id}/documents/client_brief/issue`, { recipientName: "Jordan & Mia Whitcombe", expectedVersions: pv.body.itemVersions });
  const d1 = r1.body?.document;
  check("issued as R01, to the named recipient, audience client", r1.ok && d1.revision_label === "R01" && d1.recipient_name === "Jordan & Mia Whitcombe" && d1.status === "current", JSON.stringify(r1.body).slice(0, 300));
  check("the stored file name and path carry R01", /R01\.pdf$/.test(d1.filename) && /-R01-[0-9a-f]{6}\.pdf$/.test(d1.storage_path), `${d1.filename} | ${d1.storage_path}`);
  const f1 = await fetchIssued(id, d1.id);
  check("the stored PDF downloads and matches the recorded checksum", !!f1 && sha(f1) === d1.content_sha256);
  const t1 = pdfText(f1, "CPB-issued-R01.pdf");
  check("every page of the issued PDF carries BLB-CPB-[ref]-R01 and 'Issued'", /BLB-CPB-BL[0-9A-F]{6}-R01\s+·\s+Issued/.test(t1) && (t1.match(/BLB-CPB-BL[0-9A-F]{6}-R01/g) || []).length >= 3);
  check("the issued PDF is Lato only (font fail-safe)", pdfFontNames(f1).length > 0 && pdfFontNames(f1).every((f) => /^Lato-/.test(f)), pdfFontNames(f1).join());
  // The issue was rendered by the code and template in this checkout (review CPB3-H10): the recorded template hash is the
  // file's own, and the cpb-2.3 wording is in the PDF (site access as a sentence; each preference group's header with
  // the column labels; the status key explaining Requirement).
  const templateHash = sha(readFileSync(new URL("../../public/templates/blb-client-brief-template.docx", import.meta.url))).slice(0, 16);
  const flatT1 = t1.replace(/\s+/g, " ");
  check("the issued brief used this checkout's cpb-2.3 template and wording", d1.template_version === `blb-client-brief-template.docx@${templateHash}`
    && /Site access is steep, with narrow or restricted areas\./.test(flatT1) && /What we propose to build/.test(t1)
    && /WHEREBATHROOMSANDLAUNDRYSTATUS/.test(t1.replace(/\s+/g, "")) && /Requirement: a need you've told us about\./.test(flatT1), `${d1.template_version} vs @${templateHash}`);
  check("R01 prints the drawing set it was issued against", t1.includes(k.register.meta.planRev) && !t1.includes(KESTREL_SUPPLIED_PLANS));

  section("Change the brief and its drawing basis, issue R02; R01 stays");
  const reg = (await api("GET", `/api/register/leads/${id}`)).body.register;
  const basin = reg.items.find((i) => i.promptKey === "B-005");
  // CPB2-04: the clients' supplied plans are recorded as the new drawing basis (the record, not the stage, says which set).
  const changed = await api("PUT", `/api/register/leads/${id}`, { meta: { ...reg.meta, planRev: KESTREL_SUPPLIED_PLANS }, changes: [{ ...basin, description: "Undermount basin" }], deletes: [] });
  check("a selection and the drawing basis change", changed.ok, JSON.stringify(changed.body).slice(0, 300));
  const pv2 = await api("POST", `/api/register/leads/${id}/documents/client_brief/preview`, { recipientName: "Jordan & Mia Whitcombe" });
  const r2 = await api("POST", `/api/register/leads/${id}/documents/client_brief/issue`, { recipientName: "Jordan & Mia Whitcombe", expectedVersions: pv2.body.itemVersions });
  const d2 = r2.body?.document;
  check("issued as R02", r2.ok && d2.revision_label === "R02" && r2.body.supersededId === d1.id, JSON.stringify(r2.body).slice(0, 300));
  const f2 = await fetchIssued(id, d2.id);
  const t2 = pdfText(f2, "CPB-issued-R02.pdf");
  check("R02 prints the new drawing set and the changed selection, not the old set", t2.includes(KESTREL_SUPPLIED_PLANS) && !t2.includes(k.register.meta.planRev) && /Undermount basin/.test(t2));
  const { data: rows } = await svc.from("lead_documents").select("id, revision_label, status, content_sha256, storage_path, filename, recipient_name, audience, template_version, issued_at").eq("lead_id", id).eq("document_type", "client_brief").order("version");
  check("R01 is superseded, R02 current, in the registry", rows.length === 2 && rows[0].status === "superseded" && rows[1].status === "current");
  const again = await fetchIssued(id, d1.id);
  check("R01 still opens, byte for byte as issued, with its original drawing set", !!again && sha(again) === d1.content_sha256 && rows[0].content_sha256 === d1.content_sha256
    && pdfText(again, "CPB-R01-reopened.pdf").includes(k.register.meta.planRev));
  const { error: tamper } = await svc.from("lead_documents").update({ revision_label: "R09" }).eq("id", d1.id);
  check("an issued row can't be rewritten (DB trigger)", !!tamper);
  writeFileSync(join(EVIDENCE, "CPB-registry-rows.json"), JSON.stringify(rows, null, 2));

  section("It doesn't reach a client");
  const { data: clientAuth } = await anon().auth.signInWithPassword({ email: creds.client.email, password: creds.client.password });
  const ch = { authorization: `Bearer ${clientAuth.session.access_token}`, "content-type": "application/json" };
  check("a client token gets no document list", !(await api("GET", `/api/register/leads/${id}/documents`, null, ch)).ok);
  const clientDb = createClient(GW, secrets.anon_key, { auth: { persistSession: false }, global: { headers: { authorization: `Bearer ${clientAuth.session.access_token}` } } });
  const { data: seen } = await clientDb.from("lead_documents").select("id").eq("lead_id", id);
  check("a client token reads no registry row (RLS)", (seen || []).length === 0);
  console.log(`\n  evidence: ${EVIDENCE}`);
}

try { await main(); }
catch (e) { fail++; console.log(`  ✗ test stopped: ${e.message.slice(0, 600)}`); }
console.log(`\nsandbox-cpb-issue: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
