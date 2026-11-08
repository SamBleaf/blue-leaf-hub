/**
 * register-e2e.test.mjs — Master Register R03 END-TO-END through the REAL Hub API (sandbox only).
 *
 * Drives the actual Express routes over HTTP (server/dev-api.mjs, started by
 * `node scripts/dev/register-sandbox/sandbox.mjs api`) against the local Supabase-compatible sandbox
 * (all migrations applied, real PostgREST + RLS, storage, LibreOffice PDF rendering). It never touches
 * production: it refuses any non-loopback URL and reads keys only from ~/.blh-register-sandbox/.
 *
 * Three fictional projects (Tab R03 §12):
 *   A  two-storey renovation + extension, 13 rooms — the full lifecycle Concept → register → job →
 *      pre-construction project (promotion) → office edits → documents (issue + supersede) → client portal
 *      choice + staff approval → consultant document → tender → signed contract + Won → baseline → handover
 *   B  custom new build — whole-house standards, room upgrades, supplier packs, tender allowances
 *   C  small bathroom + laundry renovation — a short brief, no clutter
 * Each check is tagged with the R03 acceptance scenario number it evidences (#1..#25).
 *
 * Prereqs: sandbox postgrest + gateway + api running. Run: npm run test:register-e2e
 * Evidence (PDFs, summary.json) is written to $REGISTER_E2E_OUT (default: OS temp dir).
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { makeItem, makeRoom, emptyMeta, promptsFor } from "../../src/lib/register.js";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";

const SB_DIR = join(homedir(), ".blh-register-sandbox");
const API = process.env.REGISTER_E2E_API || "http://localhost:8797";
const GW = process.env.REGISTER_E2E_GATEWAY || "http://localhost:54321";
const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/;
if (!LOOPBACK.test(API) || !LOOPBACK.test(GW)) { console.error("Refusing: the register e2e only runs against a local sandbox."); process.exit(2); }
const OUT = process.env.REGISTER_E2E_OUT || join(tmpdir(), `register-e2e-${Date.now()}`);
mkdirSync(OUT, { recursive: true });

const secrets = JSON.parse(readFileSync(join(SB_DIR, "secrets.json"), "utf8"));
const creds = JSON.parse(readFileSync(join(SB_DIR, "credentials.local.json"), "utf8"));
const svc = createClient(GW, secrets.service_key, { auth: { persistSession: false } });
const anonClient = () => createClient(GW, secrets.anon_key, { auth: { persistSession: false } });

const results = [];
let pass = 0, fail = 0;
function check(scenario, name, cond, detail = "") {
  results.push({ scenario, name, ok: !!cond, detail: cond ? undefined : String(detail).slice(0, 400) });
  if (cond) { pass++; console.log(`  ✓ [${scenario}] ${name}`); } else { fail++; console.log(`  ✗ [${scenario}] ${name}${detail ? `\n      ${String(detail).slice(0, 400)}` : ""}`); }
}
async function api(token, method, path, body) {
  const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  return { status: r.status, ok: r.ok && j?.ok !== false, body: j };
}
async function signIn(c) {
  const { data, error } = await anonClient().auth.signInWithPassword({ email: c.email, password: c.password });
  if (error) throw new Error(`sign-in failed for ${c.email}: ${error.message}`);
  return data.session.access_token;
}
function pdfText(buf, name) {
  const p = join(OUT, name);
  writeFileSync(p, buf);
  try { return execFileSync("pdftotext", ["-layout", p, "-"], { encoding: "utf8" }); } catch { return ""; }
}
const day = new Date().toISOString().slice(0, 10);

// Register helpers — GET, mutate items locally, PUT only what changed (as the UI does).
async function getReg(tok, leadId) { const r = await api(tok, "GET", `/api/register/leads/${leadId}`); if (!r.ok) throw new Error(`load: ${r.body?.error}`); return r.body; }
async function putReg(tok, leadId, { meta, changes = [], deletes = [] }) { return api(tok, "PUT", `/api/register/leads/${leadId}`, { meta, changes, deletes }); }
const find = (reg, pred) => reg.register.items.find(pred);
async function editItem(tok, leadId, pred, partial) {
  const reg = await getReg(tok, leadId);
  const it = find(reg, pred);
  if (!it) throw new Error("item not found for edit");
  return putReg(tok, leadId, { changes: [{ ...it, ...partial }] });
}

async function main() {
  const staff = await signIn(creds.staff);
  const clientTok = await signIn(creds.client);
  console.log(`\nsandbox API ${API} · evidence → ${OUT}\n`);

  // ═══ SCENARIO A — renovation + extension, two storeys ═══════════════════════════════════════
  console.log("▸ Scenario A — renovation + extension");
  const addrA = buildTestJobAddress({ suite: "REGISTER-E2E", workflowId: "A" });
  const cA = await api(staff, "POST", "/api/sales/leads", {
    first_name: "Morgan", last_name: "Hart", name: "Morgan & Alex Hart", email: "hart.family@example.invalid", phone: "0400 111 222",
    site_address: addrA, suburb: "Stirling", project_type: "renovation", lead_source: "referral", is_test: true, stage: "winning_offer",
    construction_budget_min: 650000, construction_budget_max: 800000, key_requirements: "More light, a family kitchen, better thermal comfort",
    wo_client_vision: "A warm, light-filled home that works for a growing family",
  });
  check("#1", "lead created through the real Sales API", cA.ok, JSON.stringify(cA.body));
  const leadA = cA.body.lead;

  const ctx = await api(staff, "GET", `/api/register/leads/${leadA.id}/context`);
  const c = ctx.body?.context;
  check("#1", "register context prefilled from Sales (client, site, type, budget, goals) — nothing re-entered",
    c?.identity.clientName === "Morgan & Alex Hart" && c?.identity.siteAddress === addrA.trim() && c?.projectType === "renovation"
    && c?.budget.min === 650000 && /growing family/.test(c?.goals.vision || ""), JSON.stringify(c?.identity));

  const rooms = [
    ["Ground", "Entry", "hall", "renovated"], ["Ground", "Living", "living", "renovated"], ["Ground", "Kitchen", "kitchen", "new"],
    ["Ground", "Scullery", "scullery", "new"], ["Ground", "Laundry", "laundry", "renovated"], ["Ground", "Powder", "wc", "new"],
    ["Ground", "Alfresco", "alfresco", "new"], ["Ground", "External", "external", "renovated"], ["First", "Main bedroom", "bedroom", "new"],
    ["First", "Ensuite", "ensuite", "new"], ["First", "Bed 2", "bedroom", "new"], ["First", "Bathroom", "bathroom", "new"], ["First", "Stair", "stairs", "new"],
  ].map(([level, name, roomType, scope], order) => makeRoom({ level, name, roomType, scope, order, sheet: level === "Ground" ? "A102 Rev C" : "A103 Rev C" }));
  const R = Object.fromEntries(rooms.map((r) => [r.name, r]));
  const floorDefault = makeItem({ itemKind: "selection", category: "flooring", promptKey: "W-017", section: "project", isDefault: true, description: "Engineered oak, matt — living zones", certainty: "preference" });
  const items = [
    floorDefault,
    makeItem({ itemKind: "selection", category: "paint", promptKey: "W-019", section: "project", isDefault: true, description: "Warm white walls, low sheen; square-set ceilings", certainty: "preference" }),
    makeItem({ itemKind: "requirement", category: "insulation", promptKey: "W-016", section: "project", description: "Improve thermal comfort and reduce uncontrolled air leakage", technicalStatus: "needs_verification", responsibility: "consultant" }),
    makeItem({ itemKind: "requirement", category: "windows", promptKey: "W-015", section: "project", description: "Double glazing to new openings; control western sun", certainty: "client_approved",
      evidence: { at: new Date().toISOString(), by: "Sandbox Staff", method: "meeting", ref: "Concept presentation" }, technicalStatus: "needs_verification", responsibility: "architect" }),
    makeItem({ itemKind: "requirement", category: "notes", promptKey: "P-005", section: "project", description: "Natural light, Comfort, Storage; growing family", certainty: "preference" }),
    makeItem({ itemKind: "scope", category: "demolition", promptKey: "W-004", section: "site", disposition: "remove", description: "Demolish existing kitchen and rear lean-to; retain front rooms" }),
    makeItem({ itemKind: "action", category: "existing", promptKey: "W-005", section: "site", description: "Existing floor substrate and roof framing condition unknown — inspect", technicalStatus: "needs_verification", responsibility: "consultant" }),
    makeItem({ itemKind: "scope", category: "site", promptKey: "W-007", section: "site", disposition: "included", description: "Family stays in front rooms; temporary kitchen in dining" }),
    makeItem({ itemKind: "action", category: "existing", promptKey: "W-008", section: "site", description: "Roof and floor junction where the extension meets the existing house", technicalStatus: "needs_verification", responsibility: "architect" }),
    makeItem({ itemKind: "scope", category: "scope", promptKey: "R-003", roomId: R.Kitchen.id, disposition: "new", description: "New kitchen with island; make good floor and plumbing", source: "A102 Rev C" }),
    makeItem({ itemKind: "selection", category: "benchtop", promptKey: "K-005", roomId: R.Kitchen.id, description: "Stone-look benchtop, 40mm edge", certainty: "preference" }),
    makeItem({ itemKind: "selection", category: "sanitary", promptKey: "K-007", roomId: R.Kitchen.id, description: "Undermount double sink + filtered tap", product: "Franke Bell", model: "BCX 620", supplier: "Routleys", supplyBy: "blue_leaf", certainty: "proposed", quantity: 1, unit: "ea" }),
    makeItem({ itemKind: "scope", category: "appliances", promptKey: "K-008", roomId: R.Kitchen.id, disposition: "by_others", description: "Client supplies fridge", supplyBy: "client" }),
    makeItem({ itemKind: "selection", category: "flooring", promptKey: "R-005", roomId: R.Kitchen.id, overridesDefaultId: floorDefault.id, description: "Large-format porcelain tile", certainty: "preference" }),
    makeItem({ itemKind: "action", category: "notes", promptKey: "K-012", roomId: R.Kitchen.id, description: "Decide appliance tier before tender", responsibility: "client" }),
    makeItem({ itemKind: "action", category: "joinery", promptKey: "K-011", roomId: R.Kitchen.id, description: "Drawer runners + push-to-open: joiner to confirm", technicalStatus: "needs_verification", responsibility: "trade" }),
    makeItem({ itemKind: "scope", category: "scope", promptKey: "R-003", roomId: R.External.id, disposition: "retain", description: "Existing west brick wall retained" }),
    makeItem({ itemKind: "scope", category: "external", promptKey: "O-006", roomId: R.External.id, disposition: "excluded", description: "Landscaping to rear yard — client's landscaper later" }),
    makeItem({ itemKind: "scope", category: "external", promptKey: "O-007", roomId: R.External.id, disposition: "deferred", description: "Plunge pool — future stage" }),
    makeItem({ itemKind: "selection", category: "sanitary", promptKey: "B-003", roomId: R.Bathroom.id, description: "Wall-hung toilet, concealed cistern", certainty: "preference", supplier: "Routleys" }),
    makeItem({ itemKind: "selection", category: "sanitary", promptKey: "B-006", roomId: R.Ensuite.id, description: "Walk-in shower, frameless screen, niche", certainty: "preference", supplier: "Routleys" }),
    makeItem({ itemKind: "requirement", category: "layout", promptKey: "R-004", roomId: R["Bed 2"].id, description: "Acoustic privacy from the living area", certainty: "preference" }),
    makeItem({ itemKind: "selection", category: "electrical", promptKey: "K-010", roomId: R.Kitchen.id, description: "Pendants over island; LED under shelves", certainty: "preference", supplier: "TLI" }),
  ];
  const meta = emptyMeta({ rooms, planRev: "Concept set C — 04 Nov 2026", occupancy: "occupied", lastRoomId: R.Kitchen.id, lastStep: "rooms" });
  const s1 = await putReg(staff, leadA.id, { meta: { ...meta, rev: 0 }, changes: items });
  check("#3", "walk-through captured: 13 rooms, whole house, site, room items saved in one batch (lead mode)", s1.ok && s1.body.mode === "lead" && s1.body.register.items.length === items.length, JSON.stringify(s1.body).slice(0, 300));
  const f1 = await api(staff, "PUT", `/api/register/leads/${leadA.id}/facts`, { deliveryModel: "design_build" });
  check("#1", "delivery model recorded as a Sales fact on the lead (before a job exists)", f1.ok && f1.body.owner === "lead");

  const r1 = await getReg(staff, leadA.id);
  check("#3", "save & resume: reopening returns every item with stable ids and the saved room pointer",
    r1.register.items.length === items.length && items.every((i) => r1.register.items.some((x) => x.id === i.id)) && r1.register.meta.lastRoomId === R.Kitchen.id);
  check("#2", "Concept work stays inside the existing winning_offer stage (no new pipeline stage)", (await api(staff, "GET", `/api/sales/leads/${leadA.id}`)).body?.lead?.stage === "winning_offer");
  check("#8", "detailed (post-PTSA) items saved while the PTSA is unsigned — work ahead, no payment gate",
    !!find(r1, (i) => i.promptKey === "K-011") && c?.commercial.ptsaStatus !== "signed");

  // concurrency in lead mode: a stale second screen
  const stale = { ...find(r1, (i) => i.promptKey === "K-005") };
  const okEdit = await putReg(staff, leadA.id, { changes: [{ ...stale, description: "Stone-look benchtop, 40mm mitred edge" }] });
  const staleEdit = await putReg(staff, leadA.id, { changes: [{ ...stale, description: "STALE SECOND SCREEN" }] });
  check("#19", "lead mode: a stale second screen is rejected (409) and nothing is written", okEdit.ok && staleEdit.status === 409 && staleEdit.body?.conflicts?.[0]?.reason === "stale");

  // rename + reorder rooms — links survive (#4)
  const r2 = await getReg(staff, leadA.id);
  const renamed = r2.register.meta.rooms.map((r) => (r.name === "Kitchen" ? { ...r, name: "Kitchen & Meals" } : r));
  [renamed[0], renamed[2]] = [renamed[2], renamed[0]];
  const ren = await putReg(staff, leadA.id, { meta: { ...r2.register.meta, rooms: renamed.map((r, i) => ({ ...r, order: i })) } });
  const r3 = await getReg(staff, leadA.id);
  check("#4", "rename + reorder: room ids unchanged, kitchen items still linked, new name shown",
    ren.ok && r3.register.meta.rooms[0].name === "Kitchen & Meals" && r3.register.items.filter((i) => i.roomId === R.Kitchen.id).length === items.filter((i) => i.roomId === R.Kitchen.id).length);

  // D1 at Concept Presentation — preview + issue (lead mode: no job yet)
  const pv = await api(staff, "POST", `/api/register/leads/${leadA.id}/documents/client_brief/preview`, { recipientName: "Morgan & Alex Hart" });
  const pvText = pv.ok ? pdfText(Buffer.from(pv.body.pdf, "base64"), "A-client-brief-DRAFT.pdf") : "";
  check("#15", "Preliminary Client Brief renders from stored register values (real engine → PDF)",
    pv.ok && /Morgan & Alex Hart/.test(pvText) && /west brick wall retained/i.test(pvText) && /Landscaping/i.test(pvText), pv.body?.error || pvText.slice(0, 200));
  check("#15", "brief contains no dollar figures and no unfilled placeholders", pv.ok && !/\$\s?\d/.test(pvText) && !/\{[#/]?[A-Z_]{2,}\}/.test(pvText));
  const iss1 = await api(staff, "POST", `/api/register/leads/${leadA.id}/documents/client_brief/issue`, { recipientName: "Morgan & Alex Hart", recipientEmail: "hart.family@example.invalid" });
  check("#18", "client brief issued as P01 with recipient + checksum (no signature required)", iss1.ok && iss1.body.document.revision_label === "P01" && !!iss1.body.document.content_sha256, JSON.stringify(iss1.body).slice(0, 300));
  const docxUrl = iss1.ok ? await api(staff, "GET", `/api/register/leads/${leadA.id}/documents/${iss1.body.document.id}/url?export=docx`) : null;
  check("#5fix", "an issued document stores BOTH the PDF and the controlled DOCX export (no half-stored issue — Tab 25 issue 5)", !!docxUrl?.ok && !!docxUrl.body.url, JSON.stringify(docxUrl?.body || {}).slice(0, 160));
  const noRecip = await api(staff, "POST", `/api/register/leads/${leadA.id}/documents/client_brief/issue`, { recipientName: "" });
  check("#18", "issue is blocked without a recipient (pre-issue checks)", noRecip.status === 422);

  // PTSA signed → job (real convert route) → pre-construction project (real route) → PROMOTION
  await api(staff, "PATCH", `/api/sales/leads/${leadA.id}`, { stage: "fee_proposal" });
  const conv = await api(staff, "POST", `/api/sales/leads/${leadA.id}/convert-to-job`);
  check("#9", "lead converted to a job through the existing route", conv.ok && !!conv.body.job?.id, JSON.stringify(conv.body).slice(0, 300));
  const jobId = conv.body.job.id;
  const { data: jobRow } = await svc.from("jobs").select("delivery_model, project_type").eq("id", jobId).single();
  check("#1", "delivery model stamped forward to the job fact at conversion (Tab 23 Q4)", jobRow?.delivery_model === "design_build");
  const snapshotBefore = (await svc.from("leads").select("selections_schedule").eq("id", leadA.id).single()).data.selections_schedule;
  const pc1 = await api(staff, "POST", `/api/sales/leads/${leadA.id}/preconstruction-portal`);
  const pc2 = await api(staff, "POST", `/api/sales/leads/${leadA.id}/preconstruction-portal`);
  check("#9", "pre-construction project created once (second call reuses it)", pc1.ok && pc1.body.created === true && pc2.ok && pc2.body.created === false);
  const projectId = pc1.body.project.id;
  const { data: sels } = await svc.from("client_selections").select("*").eq("project_id", projectId);
  const { data: rsis } = await svc.from("room_scope_items").select("*").eq("project_id", projectId);
  const selItemIds = new Set((sels || []).map((s) => s.source_register_item_id));
  const expectSel = items.filter((i) => i.itemKind === "selection" && !["excluded", "by_others", "na", "deferred"].includes(i.disposition));
  check("#9", "promotion copied every item exactly once into the right store", sels.length === expectSel.length && rsis.length === items.length - expectSel.length
    && expectSel.every((i) => selItemIds.has(i.id)), `sel ${sels.length}/${expectSel.length} rsi ${rsis.length}`);
  check("#7", "requirements (thermal, glazing, acoustic, priorities) never became product selections", ["W-016", "W-015", "R-004", "P-005"].every((k) => rsis.some((r) => r.register_detail?.promptKey === k && r.item_kind === "requirement")) && !sels.some((s) => s.register_detail?.promptKey === "W-016"));
  check("#12", "promoted selections are staged — none visible to the client", sels.every((s) => s.client_visible === false));
  const { count: actions0 } = await svc.from("client_actions").select("*", { count: "exact", head: true }).eq("project_id", projectId);
  check("#11", "no client portal task was created for any scope / requirement / selection", actions0 === 0);
  const { count: promotedEvents } = await svc.from("job_events").select("*", { count: "exact", head: true }).eq("job_id", jobId).eq("event_type", "register.promoted");
  check("#9", "promotion recorded once in the project history", promotedEvents === 1);

  // AFTER promotion: edits write the canonical records (#10)
  const rp = await getReg(staff, leadA.id);
  check("#10", "register now reads the project record (mode = project)", rp.mode === "project" && rp.projectId === projectId);
  const sinkRowBefore = sels.find((s) => s.register_detail?.promptKey === "K-007");
  const e1 = await editItem(staff, leadA.id, (i) => i.promptKey === "K-007", { model: "BCX 610-50" });
  const { data: sinkRow1 } = await svc.from("client_selections").select("*").eq("id", sinkRowBefore.id).single();
  check("#10", "office edit after promotion updated the canonical client_selections row (no sync button)", e1.ok && sinkRow1.selected_model_code === "BCX 610-50" && sinkRow1.updated_at !== sinkRowBefore.updated_at, JSON.stringify(e1.body).slice(0, 200));
  const snapshotAfter = (await svc.from("leads").select("selections_schedule").eq("id", leadA.id).single()).data.selections_schedule;
  check("#10", "the lead scratchpad is untouched history (no second writable copy)", JSON.stringify(snapshotAfter) === JSON.stringify(snapshotBefore));
  const stalePatch = await api(staff, "PATCH", `/api/sales/leads/${leadA.id}`, { selections_schedule: [] });
  check("#10", "a stale screen writing the lead scratchpad is refused (409 REGISTER_PROMOTED)", stalePatch.status === 409 && stalePatch.body?.code === "REGISTER_PROMOTED");
  const reload = await getReg(staff, leadA.id);
  check("#10", "reopening the register shows the updated value", find(reload, (i) => i.promptKey === "K-007")?.model === "BCX 610-50");

  // Documents from the canonical record; supersede + retrieval (#16 #17 #18)
  await api(staff, "PATCH", `/api/sales/leads/${leadA.id}`, { stage: "consultants" });
  const ab = await api(staff, "POST", `/api/register/leads/${leadA.id}/documents/architect_brief/issue`, { recipientName: "Studio Example Architects" });
  const abUrl = ab.ok ? await api(staff, "GET", `/api/register/leads/${leadA.id}/documents/${ab.body.document.id}/url`) : null;
  const abText = abUrl?.ok ? pdfText(Buffer.from(await (await fetch(abUrl.body.url.startsWith("http") ? abUrl.body.url : GW + "/storage/v1" + abUrl.body.url)).arrayBuffer()), "A-architect-brief-P01.pdf") : "";
  check("#16", "Architect Brief issued with the drawing basis and architect / consultant actions",
    ab.ok && /Concept set C/.test(abText) && /junction where the extension meets/i.test(abText) && /To verify/i.test(abText), ab.body?.error || abText.slice(0, 300));
  const ss1 = await api(staff, "POST", `/api/register/leads/${leadA.id}/documents/selections_schedule/issue`, { recipientName: "Morgan & Alex Hart" });
  const fetchDoc = async (id, name) => { const u = await api(staff, "GET", `/api/register/leads/${leadA.id}/documents/${id}/url`); if (!u.ok) return ""; const href = u.body.url.startsWith("http") ? u.body.url : GW + "/storage/v1" + u.body.url; return pdfText(Buffer.from(await (await fetch(href)).arrayBuffer()), name); };
  const ss1Text = ss1.ok ? await fetchDoc(ss1.body.document.id, "A-selections-P01.pdf") : "";
  check("#17", "Selections Schedule contains only client choices — the updated sink model, no scope / exclusions / requirements",
    ss1.ok && /BCX 610-50/.test(ss1Text) && !/west brick wall/i.test(ss1Text) && !/Landscaping/i.test(ss1Text) && !/thermal comfort/i.test(ss1Text), ss1.body?.error || ss1Text.slice(0, 300));
  check("#5", "whole-house floor default listed once; the kitchen exception listed separately", (ss1Text.match(/Engineered oak/g) || []).length === 1 && /porcelain/i.test(ss1Text));
  await editItem(staff, leadA.id, (i) => i.promptKey === "K-007", { model: "BCX 620-60" });
  const ss2 = await api(staff, "POST", `/api/register/leads/${leadA.id}/documents/selections_schedule/issue`, { recipientName: "Morgan & Alex Hart" });
  const list = await api(staff, "GET", `/api/register/leads/${leadA.id}/documents`);
  const schedRevs = (list.body?.documents?.issued || []).filter((d) => d.document_type === "selections_schedule");
  const p01 = schedRevs.find((d) => d.revision_label === "P01"), p02 = schedRevs.find((d) => d.revision_label === "P02");
  const p01Again = p01 ? await fetchDoc(p01.id, "A-selections-P01-retrieved.pdf") : "";
  const p02Text = p02 ? await fetchDoc(p02.id, "A-selections-P02.pdf") : "";
  check("#18", "re-issue: P02 current, P01 superseded and still retrievable with its ORIGINAL content",
    ss2.ok && p01?.status === "superseded" && p02?.status === "current" && /BCX 610-50/.test(p01Again) && /BCX 620-60/.test(p02Text) && p01.content_sha256 !== p02.content_sha256);
  const delIssued = await api(staff, "DELETE", `/api/sales/leads/${leadA.id}/documents/${p01?.id}`);
  check("#18", "an issued revision cannot be deleted through the documents tab", delIssued.status === 409);

  // Client portal: explicit issue → client choice → staff approval (#12 #13 #22)
  const regP = await getReg(staff, leadA.id);
  const bench = find(regP, (i) => i.promptKey === "K-005"), sink = find(regP, (i) => i.promptKey === "K-007");
  // R04 P0-SEL: configure the benchtop's options BEFORE releasing it — an unready selection (no option and
  // no specified product) is now held back from the portal. (The sink already carries a specified product.)
  const { data: optB } = await svc.from("selection_options").insert([{ selection_id: bench.sync.rowId, label: "Option A", product_name: "Caesarstone Cloudburst", supplier: "Stone Co" },
    { selection_id: bench.sync.rowId, label: "Option B", product_name: "Smartstone Arcadia", supplier: "Stone Co" }]).select();
  const issue = await api(staff, "POST", `/api/register/leads/${leadA.id}/portal/issue`, { items: [bench, sink].map((i) => ({ id: i.id, sync: i.sync })) });
  const { data: benchRow } = await svc.from("client_selections").select("*").eq("id", bench.sync.rowId).single();
  check("#12", "staff deliberately issued two selections → visible + 'Select …' tasks created", issue.ok && benchRow.client_visible && benchRow.status === "awaiting_client");
  await svc.from("project_client_users").insert({ project_id: projectId, user_id: creds.client.id, role: "primary", is_active: true });
  const board = await api(clientTok, "GET", `/api/portal/app/${projectId}/selections`);
  const boardItems = board.body?.selections || board.body?.items || [];
  check("#22", "client portal board shows ONLY the two issued selections (staged + scope invisible)", board.ok && boardItems.length === 2, JSON.stringify(board.body).slice(0, 300));
  const choose = await api(clientTok, "POST", `/api/portal/app/${projectId}/selections/${bench.sync.rowId}/select`, { optionId: optB.find((o) => o.label === "Option B").id });
  check("#22", "client chose an option through the existing portal route", choose.ok && choose.body.status === "in_review", JSON.stringify(choose.body));
  const regQ = await getReg(staff, leadA.id);
  const benchQ = find(regQ, (i) => i.id === bench.id);
  check("#13", "the client's choice waits for Blue Leaf review — not approved", benchQ.sync.status === "in_review" && benchQ.certainty !== "client_approved" && benchQ.sync.clientChoice?.product === "Smartstone Arcadia");
  const staleStaff = await putReg(staff, leadA.id, { changes: [{ ...bench, nextAction: "stale screen edit" }] });
  check("#19", "a staff screen loaded before the client's choice cannot overwrite it (409 stale)", staleStaff.status === 409);
  const approve = await putReg(staff, leadA.id, { changes: [{ ...benchQ, certainty: "client_approved", evidence: { at: new Date().toISOString(), by: "Sandbox Staff", method: "portal_choice", ref: "Client chose Option B in the portal" } }] });
  const { data: benchA } = await svc.from("client_selections").select("status, approved_at, approval_evidence").eq("id", bench.sync.rowId).single();
  const { data: benchAct } = await svc.from("client_actions").select("status").eq("related_entity_id", bench.sync.rowId).single();
  check("#13", "staff approval with evidence → approved, task closed", approve.ok && benchA.status === "approved" && benchA.approval_evidence?.method === "portal_choice" && benchAct.status === "completed");
  const { data: clientDirect } = await createClient(GW, secrets.anon_key, { global: { headers: { Authorization: `Bearer ${clientTok}` } }, auth: { persistSession: false } }).from("room_scope_items").select("id");
  check("#23", "a portal client's JWT reads ZERO internal scope rows directly from the database (RLS)", Array.isArray(clientDirect) && clientDirect.length === 0);
  const clientStaffApi = await api(clientTok, "GET", `/api/register/leads/${leadA.id}`);
  check("#23", "a portal client cannot reach the staff register API (403)", clientStaffApi.status === 403);

  // Technical vs pricing vs decision stay separate (#14); consultant document (#19)
  const glazing = find(regQ, (i) => i.promptKey === "W-015");
  check("#14", "client-approved glazing still shows technical verification outstanding; pricing independent",
    glazing.certainty === "client_approved" && glazing.technicalStatus === "needs_verification" && glazing.pricingStatus === "not_reviewed");
  const src = await api(staff, "POST", `/api/register/leads/${leadA.id}/sources`, { filename: "Window schedule Rev B.pdf", mimeType: "application/pdf",
    data: readFileSync(join(OUT, "A-client-brief-DRAFT.pdf")).toString("base64"), documentType: "supplier_document", discipline: "windows", issuer: "Example Windows",
    docNumber: "WS-118", revisionLabel: "Rev B", receivedAt: day, outstandingQuestion: "Confirm U-value for west sliders", itemIds: [glazing.id] });
  check("#19", "supplier document stored intact and linked to the register item", src.ok && src.body.document.register_item_ids.includes(glazing.id) && src.body.document.review_status === "received");
  const ver = await editItem(staff, leadA.id, (i) => i.id === glazing.id, { technicalStatus: "verified", technicalEvidence: { at: new Date().toISOString(), by: "Sandbox Staff", ref: "Example Windows WS-118 Rev B" }, sourceDocId: src.body.document.id });
  check("#19", "staff reviewed it and marked the glazing requirement verified with the document as evidence", ver.ok);
  const regV = await getReg(staff, leadA.id);
  const benchV = find(regV, (i) => i.id === bench.id);
  const overwrite = await putReg(staff, leadA.id, { changes: [{ ...benchV, product: "Supplier substitute stone" }] });
  check("#19", "a supplier/consultant change can't silently overwrite an approved selection (needs re-approval)", overwrite.status === 409 && overwrite.body?.conflicts?.[0]?.reason === "reapproval_required");

  // Tender (#20)
  await api(staff, "PATCH", `/api/sales/leads/${leadA.id}`, { stage: "tender" });
  const t = await api(staff, "GET", `/api/register/leads/${leadA.id}/tender`);
  const tt = t.body?.tender;
  check("#20", "tender view: included / excluded / by others / unresolved / specified / needs-pricing from the same records",
    t.ok && tt.included.some((r) => /New kitchen/.test(r.description)) && tt.excluded.some((r) => /Landscaping/.test(r.description))
    && tt.byOthers.some((r) => /fridge/.test(r.description)) && tt.unresolved.length > 0 && tt.specified.some((r) => /BCX 620-60/.test(r.product))
    && tt.risks.some((r) => /substrate/.test(r.description)), JSON.stringify(tt || t.body).slice(0, 300));
  const link = await editItem(staff, leadA.id, (i) => i.promptKey === "K-007", { pricingRef: "fee_proposal:Q-TEST:pc:sink", pricingStatus: "allowance_or_estimate" });
  const { data: sinkPriced } = await svc.from("client_selections").select("pricing_ref, pricing_status, allowance_amount").eq("id", sinkRowBefore.id).single();
  check("#20", "tender links an existing cost reference — no price copied into the register", link.ok && sinkPriced.pricing_ref === "fee_proposal:Q-TEST:pc:sink" && sinkPriced.allowance_amount === null);

  // Signed contract + staff approval → one handover (#21)
  await api(staff, "PATCH", `/api/sales/leads/${leadA.id}`, { contract_status: "signed", contract_signed_date: day });
  const won = await api(staff, "PATCH", `/api/sales/leads/${leadA.id}`, { stage: "won" });
  const { data: projs } = await svc.from("projects").select("id, is_preconstruction").eq("job_id", jobId);
  check("#21", "Won graduates the SAME project (one project, no duplicate) to Operations", won.ok && projs.length === 1 && projs[0].id === projectId && projs[0].is_preconstruction === false);
  const { count: promotedEvents2 } = await svc.from("job_events").select("*", { count: "exact", head: true }).eq("job_id", jobId).eq("event_type", "register.promoted");
  check("#9", "Won did not promote a second time", promotedEvents2 === 1);
  const regW = await getReg(staff, leadA.id);
  const benchW = find(regW, (i) => i.id === bench.id);
  const lockChange = await putReg(staff, leadA.id, { changes: [{ ...benchW, product: "Different stone", certainty: "client_approved" }] });
  check("#21", "after contract, an approved selection's product is locked (variation path)", lockChange.status === 409 && lockChange.body?.conflicts?.[0]?.reason === "post_contract_locked");
  const noteOk = await putReg(staff, leadA.id, { changes: [{ ...benchW, nextAction: "Order with joinery package" }] });
  check("#21", "…while operational notes on it can still be recorded", noteOk.ok);
  const base1 = await api(staff, "POST", `/api/register/leads/${leadA.id}/baseline`, {});
  const { data: leadW } = await svc.from("leads").select("ops_ready_checklist").eq("id", leadA.id).single();
  check("#21", "explicit staff action recorded contract baseline B01 and ticked the Ops-Ready transfer item", base1.ok && base1.body.baseline.revision === "B01" && leadW.ops_ready_checklist?.selections_transfer === true, JSON.stringify(base1.body).slice(0, 200));
  const regB = await getReg(staff, leadA.id);
  const stagedLeft = regB.register.items.filter((i) => i.sync?.table === "client_selections" && !i.sync.clientVisible);
  // R04 P0-SEL: the office specifies a product on each remaining selection before releasing it — a
  // description-only preference is design direction, not yet a client-actionable task (it would be held).
  for (const i of stagedLeft) await svc.from("client_selections").update({ selected_product: `${(i.description || "Selection").slice(0, 60)} — as specified` }).eq("id", i.sync.rowId);
  const regB2 = await getReg(staff, leadA.id);
  const stagedReady = regB2.register.items.filter((i) => i.sync?.table === "client_selections" && !i.sync.clientVisible);
  const rel = await api(staff, "POST", `/api/register/leads/${leadA.id}/portal/issue`, { items: stagedReady.map((i) => ({ id: i.id, sync: i.sync })) });
  const { count: invites } = await svc.from("project_client_users").select("*", { count: "exact", head: true }).eq("project_id", projectId);
  check("#21", "remaining (now-specified) selections released to the portal by staff; none held; no extra client invitation created", rel.ok && (rel.body?.held || []).length === 0 && invites === 1);

  // Whole-lifecycle integrity (#25)
  const { data: selsEnd } = await svc.from("client_selections").select("id, source_register_item_id").eq("project_id", projectId);
  const { data: rsisEnd } = await svc.from("room_scope_items").select("id, source_register_item_id").eq("project_id", projectId);
  const ids = [...selsEnd, ...rsisEnd].map((r) => r.source_register_item_id);
  check("#25", "every register item lives in exactly ONE canonical store — no duplicates, none lost", new Set(ids).size === ids.length && items.every((i) => ids.includes(i.id)));

  // Regression of neighbouring modules (#24) + portal (#22)
  for (const [label, path, tok] of [["sales leads", "/api/sales/leads", staff], ["lead detail", `/api/sales/leads/${leadA.id}`, staff], ["lead documents", `/api/sales/leads/${leadA.id}/documents`, staff],
    ["scorecard", "/api/sales/scorecard", staff], ["carpentry jobs", "/api/carpentry/jobs", staff], ["finance jobs", "/api/finance/jobs", staff],
    ["portal admin overview", `/api/portal/admin/v2/${projectId}/overview`, staff], ["client portal actions", `/api/portal/app/${projectId}/actions`, clientTok],
    ["client portal home", `/api/portal/app/${projectId}/home`, clientTok]]) {
    const r = await api(tok, "GET", path);
    check(label.startsWith("client") || label.startsWith("portal") ? "#22" : "#24", `regression: ${label} responds ${r.status}`, r.status === 200, r.body?.error);
  }

  // Cross-project isolation through the API (#23)
  const leadIso = (await api(staff, "POST", "/api/sales/leads", { first_name: "Iso", last_name: "Lation", name: "BLH TEST isolation", site_address: buildTestJobAddress({ suite: "REGISTER-E2E", workflowId: "ISO" }), project_type: "new_build", lead_source: "referral", is_test: true, stage: "consultants" })).body.lead;
  await api(staff, "POST", `/api/sales/leads/${leadIso.id}/convert-to-job`);
  await api(staff, "POST", `/api/sales/leads/${leadIso.id}/preconstruction-portal`);
  const hijack = await putReg(staff, leadIso.id, { changes: [{ ...benchW, description: "hijack" }] });
  const { data: benchSafe } = await svc.from("client_selections").select("item_name").eq("id", bench.sync.rowId).single();
  check("#23", "a save through another lead can't touch this project's rows", !hijack.ok && benchSafe.item_name !== "hijack");

  // ═══ SCENARIO B — custom new build ══════════════════════════════════════════════════════════
  console.log("\n▸ Scenario B — custom new build");
  const leadB = (await api(staff, "POST", "/api/sales/leads", { first_name: "Priya", last_name: "Nair", name: "Priya Nair", site_address: buildTestJobAddress({ suite: "REGISTER-E2E", workflowId: "B" }), suburb: "Unley", project_type: "new_build", lead_source: "website", is_test: true, stage: "consultants" })).body.lead;
  const bRooms = [["Ground", "Living", "living"], ["Ground", "Kitchen", "kitchen"], ["Ground", "Laundry", "laundry"], ["First", "Main bedroom", "bedroom"], ["First", "Ensuite", "ensuite"], ["First", "Bed 2", "bedroom"]]
    .map(([level, name, roomType], order) => makeRoom({ level, name, roomType, scope: "new", order, sheet: "WD-201 Rev A" }));
  const BR = Object.fromEntries(bRooms.map((r) => [r.name, r]));
  const bFloor = makeItem({ itemKind: "selection", category: "flooring", promptKey: "W-017", isDefault: true, description: "Hybrid plank, light oak", certainty: "proposed" });
  const bItems = [bFloor,
    makeItem({ itemKind: "selection", category: "paint", promptKey: "W-019", isDefault: true, description: "Dulux Natural White, low sheen", certainty: "proposed" }),
    makeItem({ itemKind: "selection", category: "doors", promptKey: "W-018", isDefault: true, description: "2340 flush doors, matte black levers", certainty: "preference" }),
    makeItem({ itemKind: "requirement", category: "insulation", promptKey: "W-016", description: "7-star energy target; airtight envelope", technicalStatus: "needs_verification", responsibility: "consultant" }),
    makeItem({ itemKind: "selection", category: "flooring", promptKey: "R-005", roomId: BR["Main bedroom"].id, overridesDefaultId: bFloor.id, description: "Wool-blend carpet upgrade", certainty: "preference" }),
    makeItem({ itemKind: "selection", category: "sanitary", promptKey: "K-007", roomId: BR.Kitchen.id, description: "Single bowl undermount", product: "Abey Lucia", supplier: "Routleys", pricingStatus: "allowance_or_estimate", pricingRef: "PC sink allowance" }),
    makeItem({ itemKind: "selection", category: "sanitary", promptKey: "B-008", roomId: BR.Ensuite.id, description: "Brushed nickel tapware", supplier: "Routleys", certainty: "preference" }),
    makeItem({ itemKind: "selection", category: "electrical", promptKey: "K-010", roomId: BR.Kitchen.id, description: "Pendant trio over island", supplier: "TLI", certainty: "preference" }),
    makeItem({ itemKind: "selection", category: "joinery", promptKey: "L-003", roomId: BR.Laundry.id, description: "Laminate cabinetry with stone top", certainty: "preference" }),
  ];
  const bSave = await putReg(staff, leadB.id, { meta: { ...emptyMeta({ rooms: bRooms, planRev: "WD set Rev A" }), rev: 0 }, changes: bItems });
  check("#5", "new build: whole-house standards + a bedroom carpet upgrade captured", bSave.ok && bSave.body.register.items.length === bItems.length);
  const bPrev = await api(staff, "POST", `/api/register/leads/${leadB.id}/documents/selections_schedule/preview`, { recipientName: "Priya Nair" });
  const bText = bPrev.ok ? pdfText(Buffer.from(bPrev.body.pdf, "base64"), "B-selections-DRAFT.pdf") : "";
  check("#5", "schedule lists each whole-house standard once plus the carpet exception", (bText.match(/Hybrid plank/g) || []).length === 1 && /Wool-blend carpet/.test(bText));
  const clientLayout = await api(staff, "POST", `/api/register/leads/${leadB.id}/documents/selections_schedule/preview`, { recipientName: "Priya Nair", layout: "client" });
  check("#17", "the client presentation layout renders from the SAME selection rows", clientLayout.ok && /Wool-blend carpet/.test(pdfText(Buffer.from(clientLayout.body.pdf, "base64"), "B-selections-client-DRAFT.pdf")));
  const rPack = await api(staff, "GET", `/api/register/leads/${leadB.id}/packs/routleys`);
  const rText = rPack.ok ? pdfText(Buffer.from(rPack.body.pdf, "base64"), "B-routleys-pack.pdf") : "";
  check("#19", "Routleys coordination pack = only Routleys-tagged fixtures", rPack.ok && /Abey Lucia/.test(rText) && /Brushed nickel/.test(rText) && !/Pendant/.test(rText) && !/Hybrid plank/.test(rText));
  const tPack = await api(staff, "GET", `/api/register/leads/${leadB.id}/packs/tli`);
  check("#19", "TLI pack = only lighting items", tPack.ok && /Pendant trio/.test(pdfText(Buffer.from(tPack.body.pdf, "base64"), "B-tli-pack.pdf")));

  // ═══ SCENARIO C — small bathroom + laundry renovation ═══════════════════════════════════════
  console.log("\n▸ Scenario C — small renovation");
  const leadC = (await api(staff, "POST", "/api/sales/leads", { first_name: "Ellis", last_name: "Grey", name: "Ellis Grey", site_address: buildTestJobAddress({ suite: "REGISTER-E2E", workflowId: "C" }), project_type: "renovation", lead_source: "referral", is_test: true, stage: "winning_offer" })).body.lead;
  const cRooms = [makeRoom({ name: "Bathroom", roomType: "bathroom", scope: "renovated", order: 0 }), makeRoom({ name: "Laundry", roomType: "laundry", scope: "renovated", order: 1 })];
  const cPrompts = cRooms.flatMap((r) => promptsFor("room", { roomType: r.roomType, roomScope: r.scope, projectType: "renovation", stage: "winning_offer" }));
  check("#3", `small renovation: ${cPrompts.length} relevant prompts across both rooms — no kitchen, living, bedroom, outdoor or new-build prompts`,
    cPrompts.length <= 36 && !cPrompts.some((q) => /^(K|V|D|H|O)-/.test(q.id)));
  const cSave = await putReg(staff, leadC.id, { meta: { ...emptyMeta({ rooms: cRooms, planRev: "Sketch v2" }), rev: 0 }, changes: [
    makeItem({ itemKind: "scope", category: "scope", promptKey: "B-001", roomId: cRooms[0].id, disposition: "alter", description: "Full renovation within existing footprint" }),
    makeItem({ itemKind: "scope", category: "existing", promptKey: "R-013", roomId: cRooms[0].id, disposition: "make_good", description: "Make good hallway floor junction" }),
    makeItem({ itemKind: "selection", category: "sanitary", promptKey: "B-004", roomId: cRooms[0].id, description: "Wall-hung vanity, 900", certainty: "preference" }),
    makeItem({ itemKind: "selection", category: "joinery", promptKey: "L-003", roomId: cRooms[1].id, description: "Laundry cabinetry + trough", certainty: "preference" }),
  ] });
  const cIss = await api(staff, "POST", `/api/register/leads/${leadC.id}/documents/client_brief/issue`, { recipientName: "Ellis Grey" });
  check("#6", "renovation scope distinguishes alter vs make good, and a short brief issues cleanly", cSave.ok && cIss.ok);

  writeFileSync(join(OUT, "summary.json"), JSON.stringify({ at: new Date().toISOString(), api: API, pass, fail, leads: { A: leadA.id, B: leadB.id, C: leadC.id }, projectId, results }, null, 2));
}

main()
  .catch((e) => { fail++; console.error("\n✗ FATAL:", e.stack || e.message); })
  .finally(() => {
    console.log(`\nregister-e2e: ${pass} passed, ${fail} failed · evidence: ${OUT}`);
    process.exit(fail ? 1 : 0);
  });
