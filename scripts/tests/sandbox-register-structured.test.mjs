/**
 * sandbox-register-structured.test.mjs — R05 P3 (Tab 27 Gate 1 CHECK) through the real Hub API, real
 * PostgREST + RLS and real register_apply. Loopback sandbox only.
 *
 * Lead scratchpad → promotion → canonical load / save → portal projection → document input, for mixed
 * multi-system answers, repeatable elements, assumptions, room ids, 409 conflicts, locked approvals, legacy
 * records, and proof that staff-only fields never reach a client.
 *
 * Refuses any non-loopback URL. Reads keys only from ~/.blh-register-sandbox/. Prints no credentials.
 * Run: node scripts/tests/sandbox-register-structured.test.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { makeItem, stableStringify } from "../../src/lib/register.js";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";
import { INTERNAL_MARK, buildStructuredRegister, LEGACY_ROWS } from "./lib/registerStructuredFixture.mjs";

const API = process.env.REGISTER_E2E_API || "http://localhost:8797";
const GW = process.env.REGISTER_E2E_GATEWAY || "http://localhost:54321";
for (const u of [API, GW]) if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(u)) { console.error("Refusing: loopback sandbox only."); process.exit(2); }
const SB = join(homedir(), ".blh-register-sandbox");
const secrets = JSON.parse(readFileSync(join(SB, "secrets.json"), "utf8"));
const creds = JSON.parse(readFileSync(join(SB, "credentials.local.json"), "utf8"));
const svc = createClient(GW, secrets.service_key, { auth: { persistSession: false } });
const anon = () => createClient(GW, secrets.anon_key, { auth: { persistSession: false } });
const OUT = mkdtempSync(join(tmpdir(), "register-structured-"));
mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 500)}` : ""}`); } };
const same = (a, b) => stableStringify(a) === stableStringify(b);
async function signIn(c) { const { data, error } = await anon().auth.signInWithPassword({ email: c.email, password: c.password }); if (error) throw new Error("sign-in failed"); return data.session.access_token; }
async function api(tok, method, path, body) {
  const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${tok}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  return { status: r.status, ok: r.ok && j?.ok !== false, body: j };
}
function pdfText(b64, name) {
  const p = join(OUT, name);
  writeFileSync(p, Buffer.from(b64, "base64"));
  try { return execFileSync("pdftotext", ["-layout", p, "-"], { encoding: "utf8" }); } catch { return null; }
}

const fx = buildStructuredRegister();
const N = fx.named;

async function main() {
  const staff = await signIn(creds.staff);
  const client = await signIn(creds.client);
  const clientDb = createClient(GW, secrets.anon_key, { global: { headers: { Authorization: `Bearer ${client}` } }, auth: { persistSession: false } });
  const getReg = async (leadId) => { const r = await api(staff, "GET", `/api/register/leads/${leadId}`); if (!r.ok) throw new Error(`load: ${r.body?.error}`); return r.body; };
  const put = (leadId, body) => api(staff, "PUT", `/api/register/leads/${leadId}`, body);
  const itemOf = (reg, id) => reg.register.items.find((i) => i.id === id);

  console.log("\nLead scratchpad");
  const address = buildTestJobAddress({ suite: "REGISTER-STRUCTURED", workflowId: "P3" });
  const made = await api(staff, "POST", "/api/sales/leads", { first_name: "Avery", last_name: "Stone", name: "Avery Stone", email: "avery.stone@example.invalid", phone: "0400 000 000",
    site_address: address, suburb: "Stirling", project_type: "renovation", lead_source: "referral", is_test: true, stage: "winning_offer" });
  ok("test lead created through the Sales API", made.ok, JSON.stringify(made.body));
  const leadId = made.body.lead.id;

  const saved = await put(leadId, { meta: fx.meta, changes: fx.items });
  ok("mixed structured register saves on the lead", saved.ok, JSON.stringify(saved.body).slice(0, 300));
  const { data: rawLead } = await svc.from("leads").select("selections_schedule").eq("id", leadId).single();
  await svc.from("leads").update({ selections_schedule: [...rawLead.selections_schedule, ...JSON.parse(JSON.stringify(LEGACY_ROWS))] }).eq("id", leadId);
  const lead1 = await getReg(leadId);
  ok("mode is lead until a project exists", lead1.mode === "lead");
  ok("every answer reads back unchanged from the real column", fx.items.every((i) => same(itemOf(lead1, i.id)?.answer, i.answer)));
  ok("multiple wall systems are separate records under one question", lead1.register.items.filter((i) => i.promptKey === "W-013" && i.answer).length === 2);
  ok("repeatable external elements are separate records with stable ids", same(lead1.register.items.filter((i) => i.promptKey === "W-010").map((i) => i.answer.element.id).sort(), ["el_driveway_front", "el_fence_rear"]));
  ok("room confirmation is on the room, no per-room copy of the default", Object.keys(lead1.register.meta.rooms.find((r) => r.id === fx.rooms.bed1.id).defaultConfirmations).length === 2 && !lead1.register.items.some((i) => i.roomId === fx.rooms.bed1.id));
  const plain = itemOf(lead1, "ri_w017_plain_text");
  ok("legacy text reads back with no answer and no parsing", plain?.answer === null && plain.description === "Engineered oak, matt, living zones");
  const concept = lead1.register.items.find((i) => /Blackbutt boards/.test(i.description));
  ok("a legacy concept row is readable", !!concept && concept.answer === null);

  // stale write in lead mode
  const beforeStale = itemOf(lead1, N.floorMain.id);
  const edit1 = await put(leadId, { changes: [{ ...beforeStale, answer: { ...beforeStale.answer, note: "first edit" } }] });
  const staleLead = await put(leadId, { changes: [{ ...beforeStale, answer: { ...beforeStale.answer, note: "stale edit" } }] });
  ok("a stale lead save is a 409", edit1.ok && staleLead.status === 409 && staleLead.body?.code === "CONFLICT");
  ok("and the newer answer stands", itemOf(await getReg(leadId), N.floorMain.id).answer.note === "first edit");

  console.log("\nPromotion");
  await api(staff, "PATCH", `/api/sales/leads/${leadId}`, { stage: "fee_proposal" });
  const conv = await api(staff, "POST", `/api/sales/leads/${leadId}/convert-to-job`);
  ok("converted to a job", conv.ok, JSON.stringify(conv.body).slice(0, 300));
  const jobId = conv.body.job.id;
  const pc = await api(staff, "POST", `/api/sales/leads/${leadId}/preconstruction-portal`);
  ok("pre-construction project created", pc.ok, JSON.stringify(pc.body).slice(0, 300));
  const projectId = pc.body.project.id;
  const proj1 = await getReg(leadId);
  ok("register now reads the project record", proj1.mode === "project" && proj1.projectId === projectId);
  const { data: sels } = await svc.from("client_selections").select("*").eq("project_id", projectId);
  const { data: rsis } = await svc.from("room_scope_items").select("*").eq("project_id", projectId);
  const selIds = new Set(sels.map((s) => s.source_register_item_id)), rsiIds = new Set(rsis.map((s) => s.source_register_item_id));
  ok("client choices are in client_selections", fx.selectionKeys.every((k) => selIds.has(N[k].id)), fx.selectionKeys.filter((k) => !selIds.has(N[k].id)).join());
  ok("facts, scope, risks, excluded and N/A are in the internal store", fx.scopeStoreKeys.every((k) => rsiIds.has(N[k].id)), fx.scopeStoreKeys.filter((k) => !rsiIds.has(N[k].id)).join());
  ok("everything promoted exactly once", sels.length + rsis.length === fx.items.length + LEGACY_ROWS.length, `${sels.length}+${rsis.length}`);
  ok("nothing is visible to the client", sels.every((s) => s.client_visible === false));
  const { count: actions0 } = await svc.from("client_actions").select("*", { count: "exact", head: true }).eq("project_id", projectId);
  ok("recording answers created no client task", actions0 === 0);
  ok("the answer is namespaced in register_detail on real rows", rsis.find((r) => r.source_register_item_id === N.access.id).register_detail.answer?.nature === "fact" && sels.find((r) => r.source_register_item_id === N.wallMain.id).register_detail.answer?.zone?.key === "main_walls");
  ok("legacy rows carry no answer key", !("answer" in sels.find((r) => r.source_register_item_id === "ri_w017_plain_text").register_detail));
  const expected = (i) => (i.id === N.floorMain.id ? { ...i.answer, note: "first edit" } : i.answer);
  ok("every answer is unchanged after promotion and reload", fx.items.every((i) => same(itemOf(proj1, i.id)?.answer, expected(i))), fx.items.filter((i) => !same(itemOf(proj1, i.id)?.answer, expected(i))).map((i) => i.promptKey).join());
  ok("item ids are unchanged", fx.items.every((i) => !!itemOf(proj1, i.id)));
  ok("room ids and room links are unchanged", itemOf(proj1, N.kitchenFloor.id).roomId === fx.rooms.kitchen.id && itemOf(proj1, N.demolish.id).answer.areaIds[0] === fx.rooms.kitchen.id);
  ok("the exception still points at its default", itemOf(proj1, N.kitchenFloor.id).overridesDefaultId === N.floorMain.id);
  ok("room confirmations survive into register_meta", same(proj1.register.meta.rooms.find((r) => r.id === fx.rooms.bed1.id).defaultConfirmations, fx.rooms.bed1.defaultConfirmations));
  ok("legacy text survives promotion", itemOf(proj1, "ri_w017_plain_text").description === "Engineered oak, matt, living zones" && itemOf(proj1, "ri_w017_plain_text").answer === null);
  ok("recording an answer approved nothing", fx.items.every((i) => itemOf(proj1, i.id).certainty === i.certainty) && !proj1.register.items.some((i) => i.certainty === "client_approved"));
  ok("an assumption stayed out of every product column", !sels.find((r) => r.source_register_item_id === N.assumed.id).selected_product && !JSON.stringify({ ...sels.find((r) => r.source_register_item_id === N.assumed.id), register_detail: null }).includes(INTERNAL_MARK));

  console.log("\nCanonical save");
  const dw = itemOf(proj1, N.driveway.id);
  const roofVersion = itemOf(proj1, N.roof.id).sync.version;
  const dwSave = await put(leadId, { changes: [{ ...dw, answer: { ...dw.answer, selected: [...dw.answer.selected, { path: ["charcoal"], label: "Charcoal" }] } }] });
  ok("an answer edit saves to the canonical row", dwSave.ok && itemOf(await getReg(leadId), N.driveway.id).answer.selected.length === 2, JSON.stringify(dwSave.body).slice(0, 300));
  ok("no other row was touched", itemOf(await getReg(leadId), N.roof.id).sync.version === roofVersion);
  const hist = await api(staff, "GET", `/api/register/leads/${leadId}/history?itemId=${N.driveway.id}`);
  ok("the change is in the item's history", hist.ok && hist.body.events.some((e) => e.changes?.register_detail));

  const proj2 = await getReg(leadId);
  const roofNow = itemOf(proj2, N.roof.id);
  const toExcluded = await put(leadId, { changes: [{ ...roofNow, disposition: "excluded" }] });
  const after = itemOf(await getReg(leadId), N.roof.id);
  ok("excluding moves it to the internal store with the same id and answer", toExcluded.ok && after.sync.table === "room_scope_items" && same(after.answer, N.roof.answer), JSON.stringify(toExcluded.body).slice(0, 300));
  const toBack = await put(leadId, { changes: [{ ...after, disposition: "undecided" }] });
  const after2 = itemOf(await getReg(leadId), N.roof.id);
  ok("including it again brings it back the same", toBack.ok && after2.sync.table === "client_selections" && same(after2.answer, N.roof.answer));

  const proj3 = await getReg(leadId);
  const stale = itemOf(proj3, N.floorWet.id);
  const firstSave = await put(leadId, { changes: [{ ...stale, answer: { ...stale.answer, note: "newer" } }] });
  const staleSave = await put(leadId, { changes: [{ ...stale, answer: { ...stale.answer, selected: [{ path: ["carpet"], label: "Carpet" }] } }] });
  const afterStale = itemOf(await getReg(leadId), N.floorWet.id);
  ok("a stale canonical save is a 409 and writes nothing", firstSave.ok && staleSave.status === 409 && staleSave.body?.conflicts?.[0]?.reason === "stale" && afterStale.answer.selected[0].optionId === "tile" && afterStale.answer.note === "newer");

  console.log("\nLocked approvals (real register_apply)");
  const carpet = (it) => ({ ...it, answer: { ...it.answer, selected: [{ path: ["carpet"], label: "Carpet" }] } });
  const ev = { at: new Date().toISOString(), by: "Sandbox Staff", method: "meeting", ref: "Meeting note" };
  const flA = itemOf(await getReg(leadId), N.floorWet.id);
  const approve = await put(leadId, { changes: [{ ...flA, certainty: "client_approved", evidence: ev }] });
  ok("approval still needs and takes evidence", approve.ok, JSON.stringify(approve.body).slice(0, 300));
  const flB = itemOf(await getReg(leadId), N.floorWet.id);
  const reappr = await put(leadId, { changes: [{ ...carpet(flB) }] });
  ok("changing an approved answer on the old evidence is refused", reappr.status === 409 && reappr.body?.conflicts?.[0]?.reason === "reapproval_required", JSON.stringify(reappr.body).slice(0, 300));
  ok("and the approved answer is unchanged", itemOf(await getReg(leadId), N.floorWet.id).answer.selected[0].optionId === "tile");
  const noted = await put(leadId, { changes: [{ ...flB, answer: { ...flB.answer, note: "Sample requested" } }] });
  ok("a staff note doesn't need re-approval", noted.ok, JSON.stringify(noted.body).slice(0, 300));
  const { data: rowOrdered } = await svc.from("client_selections").update({ status: "ordered" }).eq("project_id", projectId).eq("source_register_item_id", N.floorWet.id).select("id").single();
  const flC = itemOf(await getReg(leadId), N.floorWet.id);
  ok("an ordered row loads as locked", flC.sync.locked === true && !!rowOrdered);
  const lockd = await put(leadId, { changes: [carpet(flC)] });
  ok("an ordered selection's answer can't change", lockd.status === 409 && lockd.body?.conflicts?.[0]?.reason === "post_contract_locked", JSON.stringify(lockd.body).slice(0, 300));
  await svc.from("room_scope_items").update({ baselined_at: new Date().toISOString() }).eq("project_id", projectId).eq("source_register_item_id", N.fence.id);
  const fc = itemOf(await getReg(leadId), N.fence.id);
  const blocked = await put(leadId, { changes: [{ ...fc, answer: { ...fc.answer, selected: [{ path: ["timber"], label: "Timber" }] } }] });
  ok("baselined scope can't change through its answer", blocked.status === 409 && blocked.body?.conflicts?.[0]?.reason === "baseline_locked", JSON.stringify(blocked.body).slice(0, 300));
  const delivery = await put(leadId, { changes: [{ ...fc, answer: { ...fc.answer, delivery: { method: "subcontract", trade: "Fencer" } } }] });
  ok("delivery can still be recorded on baselined scope", delivery.ok, JSON.stringify(delivery.body).slice(0, 300));

  console.log("\nPortal projection");
  await svc.from("project_client_users").insert({ project_id: projectId, user_id: creds.client.id, role: "primary", is_active: true });
  const reg4 = await getReg(leadId);
  const wall = itemOf(reg4, N.wallFeature.id), sinkItem = itemOf(reg4, N.sink.id), assumedItem = itemOf(reg4, N.assumed.id), wallPlain = itemOf(reg4, N.wallMain.id);
  const held = await api(staff, "POST", `/api/register/leads/${leadId}/portal/issue`, { items: [assumedItem, wallPlain].map((i) => ({ id: i.id, sync: i.sync })) });
  ok("an assumption or a part-answer alone can't be released to the client", held.status === 409 && held.body?.code === "SELECTION_NOT_READY", JSON.stringify(held.body).slice(0, 300));
  const { data: opt } = await svc.from("selection_options").insert([{ selection_id: wall.sync.rowId, label: "Option A", product_name: "Feature board 150", supplier: "Example Co" }]).select().single();
  const issue = await api(staff, "POST", `/api/register/leads/${leadId}/portal/issue`, { items: [wall, sinkItem].map((i) => ({ id: i.id, sync: i.sync })) });
  ok("staff release two selections deliberately", issue.ok && (issue.body.held || []).length === 0, JSON.stringify(issue.body).slice(0, 300));
  const board = await api(client, "GET", `/api/portal/app/${projectId}/selections`);
  const names = (board.body?.selections || []).map((s) => s.itemName);
  ok("the client sees only what was released", board.ok && names.length === 2, JSON.stringify(names));
  ok("a structured choice reaches the client by its plain name", names.includes("Fibre cement sheet — Feature"), JSON.stringify(names));
  const boardText = JSON.stringify(board.body);
  ok("no staff-only text on the client board", !boardText.includes(INTERNAL_MARK));
  ok("no register internals on the client board", !/registerDetail|register_detail|internalNotes|pricingStatus|technicalStatus|"certainty"|assumption/.test(boardText), boardText.slice(0, 400));
  for (const [label, path] of [["home", `/api/portal/app/${projectId}/home`], ["actions", `/api/portal/app/${projectId}/actions`], ["notifications", `/api/portal/app/${projectId}/notifications`]]) {
    const r = await api(client, "GET", path);
    ok(`client ${label} carries nothing internal (${r.status})`, [200, 404].includes(r.status) && !JSON.stringify(r.body).includes(INTERNAL_MARK));
  }
  const { data: acts } = await svc.from("client_actions").select("title, description").eq("project_id", projectId);
  ok("client tasks are plain and carry nothing internal", acts.length === 2 && !JSON.stringify(acts).includes(INTERNAL_MARK), JSON.stringify(acts));
  for (const table of ["client_selections", "room_scope_items", "job_events", "leads", "projects"]) {
    const { data } = await clientDb.from(table).select("*").limit(5);
    ok(`a client token reads no ${table} rows directly`, Array.isArray(data) && data.length === 0, JSON.stringify(data).slice(0, 200));
  }
  const adminAsClient = await api(client, "GET", `/api/portal/admin/v2/${projectId}/overview`);
  ok("a client can't use the staff portal console", [401, 403].includes(adminAsClient.status), adminAsClient.status);
  const regAsClient = await api(client, "GET", `/api/register/leads/${leadId}`);
  ok("a client can't use the register API", regAsClient.status === 403, regAsClient.status);

  const chose = await api(client, "POST", `/api/portal/app/${projectId}/selections/${wall.sync.rowId}/select`, { optionId: opt.id });
  ok("the client chooses through the existing portal route", chose.ok, JSON.stringify(chose.body).slice(0, 300));
  const afterChoice = itemOf(await getReg(leadId), N.wallFeature.id);
  ok("the client's choice leaves the structured answer intact", same(afterChoice.answer, N.wallFeature.answer) && afterChoice.sync.status === "in_review");
  ok("and does not count as an approval", afterChoice.certainty !== "client_approved");
  const staleOverChoice = await put(leadId, { changes: [{ ...wall, answer: { ...wall.answer, note: "stale screen" } }] });
  ok("a screen loaded before the client's choice can't overwrite it", staleOverChoice.status === 409);

  console.log("\nDocument input");
  for (const docType of ["client_brief", "architect_brief", "selections_schedule"]) {
    const r = await api(staff, "POST", `/api/register/leads/${leadId}/documents/${docType}/preview`, { recipientName: "Avery Stone" });
    const t = r.ok ? pdfText(r.body.pdf, `${docType}.pdf`) : null;
    ok(`${docType} renders from the promoted register`, r.ok && typeof t === "string" && t.length > 100, r.body?.error);
    ok(`${docType} contains nothing internal`, typeof t === "string" && !t.includes(INTERNAL_MARK));
  }
  const issued = await api(staff, "POST", `/api/register/leads/${leadId}/documents/client_brief/issue`, { recipientName: "Avery Stone", recipientEmail: "avery.stone@example.invalid" });
  ok("a client brief issues from the promoted register", issued.ok, JSON.stringify(issued.body).slice(0, 300));
  const { data: snap } = await svc.from("lead_documents").select("source_snapshot").eq("id", issued.body.document.id).single();
  ok("the issued snapshot holds nothing internal", !JSON.stringify(snap.source_snapshot).includes(INTERNAL_MARK));
  ok("the issued snapshot keeps the item versions", Object.keys(snap.source_snapshot.itemVersions || {}).includes(N.wallMain.id));
  const tender = await api(staff, "GET", `/api/register/leads/${leadId}/tender`);
  ok("the staff tender view carries the structured answer", tender.ok && tender.body.tender.included.some((r) => r.id === N.driveway.id && r.answer?.element?.key === "driveway"), JSON.stringify(tender.body).slice(0, 200));

  console.log("\nExisting records keep working");
  const legacyNow = itemOf(await getReg(leadId), "ri_w017_plain_text");
  const legacyEdit = await put(leadId, { changes: [{ ...legacyNow, certainty: "proposed" }] });
  const legacyAfter = itemOf(await getReg(leadId), "ri_w017_plain_text");
  ok("a legacy record still edits, text intact, still unstructured", legacyEdit.ok && legacyAfter.certainty === "proposed" && legacyAfter.description === "Engineered oak, matt, living zones" && legacyAfter.answer === null);
  const plainNew = makeItem({ itemKind: "selection", category: "paint", promptKey: "W-019", section: "project", description: "Warm white" });
  const plainAdd = await put(leadId, { changes: [plainNew] });
  ok("a plain free-text item can still be added", plainAdd.ok && itemOf(await getReg(leadId), plainNew.id)?.answer === null, JSON.stringify(plainAdd.body).slice(0, 200));
  const { count: promotedEvents } = await svc.from("job_events").select("*", { count: "exact", head: true }).eq("job_id", jobId).eq("event_type", "register.promoted");
  ok("promotion ran once", promotedEvents === 1, promotedEvents);

  console.log(`\nsandbox-register-structured: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error("FATAL", e?.message || e); process.exit(1); });
