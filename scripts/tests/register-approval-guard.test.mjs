/**
 * register-approval-guard.test.mjs — review B3 (server side) and N18: an approval covers what the client agreed, on both
 * save paths; and a by-when set on an action prints with it in the client's brief and the Technical Selections Schedule.
 *
 * No server, no database: an in-memory stand-in for the lead row, the project rows and register_apply (the same pattern
 * as register-structured-store.test.mjs). The screen rule itself (register.editOutrunsApproval) is in
 * register-r03-model.test.mjs.
 * Run: node scripts/tests/register-approval-guard.test.mjs
 */
import { saveRegister, loadRegister, promoteRegisterToProject, leadApprovalReason, RegisterError } from "../../server/lib/registerStore.mjs";
import { buildRegisterFixture } from "../../server/lib/registerDocuments.mjs";
import { buildClientBriefPayload, buildSelectionsSchedulePayload } from "../../server/lib/documents/documentPayloads.mjs";
import { makeItem, makeRoom, emptyMeta, writeRegister } from "../../src/lib/register.js";
import { REGISTER_PROJECTS } from "../documents/fixtures/register-projects.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 600)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const clone = (v) => JSON.parse(JSON.stringify(v));
const flat = (o) => JSON.stringify(o);

const LEAD_ID = "11111111-1111-1111-1111-111111111111", JOB_ID = "22222222-2222-2222-2222-222222222222", PROJECT_ID = "33333333-3333-3333-3333-333333333333";

/** A lead (and optionally its project) in memory; register_apply applies ops without its SQL guards. */
function world({ lead = {}, project = null } = {}) {
  let clock = 0, seq = 0;
  const stamp = () => new Date(Date.UTC(2026, 10, 10, 0, 0, ++clock)).toISOString();
  const db = {
    leads: [{ id: LEAD_ID, job_id: JOB_ID, name: "Test Client", project_type: "renovation", stage: "consultants", selections_schedule: [], updated_at: stamp(), ...lead }],
    projects: project === null ? [] : [{ id: PROJECT_ID, job_id: JOB_ID, is_preconstruction: true, register_meta: null, ...project }],
    client_selections: [], room_scope_items: [], job_events: [],
  };
  const applied = [];
  const insert = (op, table) => { const now = stamp(); db[table].push({ id: `row-${++seq}`, project_id: PROJECT_ID, source_register_item_id: op.item_id, client_visible: false, status: "not_started", created_at: now, updated_at: now, ...op.row, sort_order: op.row.sort_order ?? 0 }); };
  const update = (op, table) => { const row = db[table].find((r) => r.id === op.row_id); const { sort_order, ...rest } = op.row; Object.assign(row, rest, { updated_at: stamp(), ...(sort_order == null ? {} : { sort_order }) }); };
  const rpc = async (_name, args) => {
    applied.push(clone(args.p_ops));
    for (const op of args.p_ops) {
      if (op.op === "meta_init") db.projects[0].register_meta = { ...op.meta, rev: 1, promotion: { status: "complete" } };
      else if (op.op === "meta_set") db.projects[0].register_meta = { ...op.meta, rev: (db.projects[0].register_meta.rev || 0) + 1 };
      else if (op.op === "sel_insert") insert(op, "client_selections");
      else if (op.op === "scope_insert") insert(op, "room_scope_items");
      else if (op.op === "sel_update") update(op, "client_selections");
      else if (op.op === "scope_update") update(op, "room_scope_items");
    }
    return { data: { ok: true, results: [], promoted: {} }, error: null };
  };
  const from = (t) => {
    const st = { filters: [], op: "select", payload: null };
    const rows = () => (db[t] || []).filter((r) => st.filters.every(([c, v]) => String(r[c]) === String(v)));
    const run = () => {
      if (st.op === "update") { const hit = rows(); hit.forEach((r) => Object.assign(r, clone(st.payload))); return hit; }
      if (st.op === "insert") { (db[t] ||= []).push(...[].concat(st.payload)); return [].concat(st.payload); }
      return rows();
    };
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; }, like() { return b; }, in() { return b; },
      eq(c, v) { st.filters.push([c, v]); return b; },
      update(p) { st.op = "update"; st.payload = p; return b; },
      insert(p) { st.op = "insert"; st.payload = p; return b; },
      maybeSingle() { return Promise.resolve({ data: clone(run()[0] ?? null), error: null }); },
      then(res, rej) { return Promise.resolve({ data: clone(run()), error: null }).then(res, rej); },
    };
    return b;
  };
  return { sb: { from, rpc }, db, applied };
}
async function refusal(p) { try { await p; return null; } catch (e) { return e instanceof RegisterError ? e : { message: String(e) }; } }

const EV = { at: "2026-11-15T10:00:00.000Z", by: "Sam Morris", method: "meeting" };
const room = makeRoom({ id: "kt", name: "Kitchen", roomType: "kitchen", scope: "renovated" });
const approvedReq = makeItem({ id: "w15", itemKind: "requirement", promptKey: "W-015", category: "windows", certainty: "client_approved", evidence: EV, description: "No steps at the entry" });
const scratchpad = () => clone(writeRegister({ meta: emptyMeta({ rooms: [room] }), items: [approvedReq] }));

section("The shared rule (leadApprovalReason)");
ok("reworded and still client-approved, same evidence: refused", leadApprovalReason(approvedReq, { ...approvedReq, description: "Two steps up to the entry are fine" }) === "reapproval_required");
ok("the same words re-saved: fine", leadApprovalReason(approvedReq, { ...approvedReq, description: " no steps at the ENTRY" }) === null);
ok("stepped back to Proposed: fine", leadApprovalReason(approvedReq, { ...approvedReq, description: "Two steps", certainty: "proposed", evidence: null }) === null);
ok("with fresh evidence of a re-approval: fine", leadApprovalReason(approvedReq, { ...approvedReq, description: "Two steps", evidence: { ...EV, at: "2026-11-17T09:00:00.000Z" } }) === null);
ok("a selection's typed words aren't its approval", leadApprovalReason({ ...approvedReq, itemKind: "selection" }, { ...approvedReq, itemKind: "selection", description: "Something else" }) === null);

section("Lead mode (the scratchpad) refuses it");
{
  const w = world({ lead: { selections_schedule: scratchpad() } });
  const loaded = await loadRegister(w.sb, LEAD_ID, { autoPromote: false });
  const it = loaded.register.items.find((i) => i.id === "w15");
  const e = await refusal(saveRegister(w.sb, LEAD_ID, { changes: [{ ...it, description: "Two steps up to the entry are fine" }] }, { actor: { name: "Staff" } }));
  ok("409, reason reapproval_required, in plain words", e?.status === 409 && e.conflicts?.[0]?.reason === "reapproval_required" && /changed after client approval/.test(e.message), flat({ status: e?.status, msg: e?.message, c: e?.conflicts }));
  ok("nothing was written", w.db.leads[0].selections_schedule.some((r) => r.id === "w15" && r.description === "No steps at the entry"));
  const stepped = await saveRegister(w.sb, LEAD_ID, { changes: [{ ...it, description: "Two steps up to the entry are fine", certainty: "proposed", evidence: null }] }, { actor: { name: "Staff" } });
  ok("the screen's step-back saves", stepped.register.items.find((i) => i.id === "w15").certainty === "proposed");
}

section("Project mode refuses it before register_apply (whose SQL compares a scope row's words only for a baseline)");
{
  const w = world({ lead: { selections_schedule: scratchpad() }, project: {} });
  await promoteRegisterToProject(w.sb, { leadId: LEAD_ID, projectId: PROJECT_ID, actor: { id: null, name: "Staff" } });
  const loaded = await loadRegister(w.sb, LEAD_ID);
  const it = loaded.register.items.find((i) => i.id === "w15");
  ok("the approved requirement is on the project, still approved with its evidence", loaded.mode === "project" && it?.certainty === "client_approved" && it.evidence?.by === "Sam Morris", flat(it));
  const before = w.applied.length;
  const e = await refusal(saveRegister(w.sb, LEAD_ID, { changes: [{ ...it, description: "Two steps up to the entry are fine" }] }, { actor: { name: "Staff" } }));
  ok("409 reapproval_required, and register_apply is never called", e?.status === 409 && e.conflicts?.[0]?.reason === "reapproval_required" && w.applied.length === before, flat({ status: e?.status, c: e?.conflicts }));
  const notes = await refusal(saveRegister(w.sb, LEAD_ID, { changes: [{ ...it, nextAction: "Confirm the threshold detail" }] }, { actor: { name: "Staff" } }));
  ok("a note or next action on it still saves", notes === null);
  const fresh = await loadRegister(w.sb, LEAD_ID);
  const it2 = fresh.register.items.find((i) => i.id === "w15");
  const stepped = await refusal(saveRegister(w.sb, LEAD_ID, { changes: [{ ...it2, description: "Two steps up to the entry are fine", certainty: "proposed", evidence: null }] }, { actor: { name: "Staff" } }));
  ok("the screen's step-back saves", stepped === null);
}

section("A by-when prints with the action (N18)");
{
  const p = REGISTER_PROJECTS.kestrel();
  const input = { lead: p.lead, context: p.context, register: p.register, projectRef: p.projectRef, status: "Draft", issuedDate: "2026-11-17", revision: 1 };
  const base = buildRegisterFixture("client_brief", input).clientBrief.decisions;
  ok("the fixture has decisions to print", base.length >= 3, flat(base));
  // Ten client actions, each with a by-when: every one prints (the cap of seven is for everything else).
  const extra = Array.from({ length: 10 }, (_, k) => makeItem({ id: `ca${k}`, itemKind: "action", promptKey: "W-025", category: "notes", responsibility: "client", description: `Choose the tiles for room ${k + 1}`, nextAction: `Choose the tiles for room ${k + 1}`, actionDue: k === 0 ? "2026-11-28" : k === 1 ? "next_meeting" : "" }));
  const many = { ...input, register: { ...p.register, items: [...p.register.items, ...extra] } };
  const fx = buildRegisterFixture("client_brief", many);
  const d = fx.clientBrief.decisions;
  ok("every client action prints, beyond seven", extra.every((x) => d.some((y) => /Choose the tiles for room/.test(y.action) && y.action.startsWith(`Choose the tiles for room ${x.id.slice(2) * 1 + 1}.`))) && d.length >= 10, d.length);
  ok("the client's come first", d.slice(0, d.filter((x) => x.owner === "Client").length).every((x) => x.owner === "Client"));
  const rows = (pl, k) => [...pl[`${k}_KEEP`], ...pl[k], ...pl[`${k}_PEN`], ...pl[`${k}_LAST`]];
  const pay = rows(buildClientBriefPayload(fx), "DECISIONS");
  ok("the Who cell carries the by-when on its own line", pay.some((r) => r.OWNER === "Client\nBy 28 Nov") && pay.some((r) => r.OWNER === "Client\nBy our next meeting") && pay.some((r) => r.OWNER === "Client"), flat(pay.map((r) => r.OWNER)));
  // The schedule's actions say who and by when.
  const sel = p.register.items.find((i) => i.itemKind === "selection");
  const tssReg = { ...p.register, items: p.register.items.map((i) => (i.id === sel.id ? makeItem({ ...i, nextAction: "Confirm the colour code", responsibility: "trade", actionDue: "next_issue" }) : i)) };
  const tss = buildRegisterFixture("selections_schedule", { ...input, register: tssReg });
  const act = tss.technicalSchedule.actions.find((a) => /Confirm the colour code/.test(a.text));
  ok("a schedule action keeps its by-when", act?.by === "By the next drawing issue", flat(tss.technicalSchedule.actions));
  const tpay = rows(buildSelectionsSchedulePayload(tss), "ACTIONS").find((r) => /Confirm the colour code/.test(r.TEXT));
  ok("…and prints it under who", /\nBy the next drawing issue$/.test(tpay?.WHO || ""), flat(tpay));
}

console.log(`\nregister-approval-guard: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
