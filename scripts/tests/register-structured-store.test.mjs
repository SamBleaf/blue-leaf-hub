/**
 * register-structured-store.test.mjs — R05 P3 (Tab 27 Gate 1.3): structured answers survive every mapper
 * in server/lib/registerStore.mjs, from the lead scratchpad through promotion to project load and save.
 *
 * No server, no database: an in-memory stand-in for register_apply that rewrites jsonb key order the way
 * Postgres does. The real SQL guards are exercised by sandbox-register-structured.test.mjs.
 * Run: node scripts/tests/register-structured-store.test.mjs
 */
import {
  selRowToItem, rsiRowToItem, itemToSelRow, itemToRsiRow, storeFor, promoteRegisterToProject, loadRegister, saveRegister, RegisterError,
} from "../../server/lib/registerStore.mjs";
import { buildRegisterFixture, selectionRecords } from "../../server/lib/registerDocuments.mjs";
import { makeItem, makeRoom, emptyMeta, writeRegister, readRegister, stableStringify } from "../../src/lib/register.js";
import { INTERNAL_MARK, buildStructuredRegister, LEGACY_ROWS } from "./lib/registerStructuredFixture.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 600)}` : ""}`); } };
const same = (a, b) => stableStringify(a) === stableStringify(b);
/** Postgres jsonb orders object keys by length, then bytes. */
function pgJsonb(v) {
  if (Array.isArray(v)) return v.map(pgJsonb);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).map((k) => [k, pgJsonb(v[k])]));
  return v;
}
const clone = (v) => JSON.parse(JSON.stringify(v));

const LEAD_ID = "11111111-1111-1111-1111-111111111111", JOB_ID = "22222222-2222-2222-2222-222222222222", PROJECT_ID = "33333333-3333-3333-3333-333333333333";

function world({ lead = {}, project = null } = {}) {
  let clock = 0, seq = 0;
  const stamp = () => new Date(Date.UTC(2026, 10, 10, 0, 0, ++clock)).toISOString();
  const db = {
    leads: [{ id: LEAD_ID, job_id: JOB_ID, name: "Test Client", project_type: "renovation", stage: "consultants", selections_schedule: [], updated_at: stamp(), ...lead }],
    projects: project === null ? [] : [{ id: PROJECT_ID, job_id: JOB_ID, is_preconstruction: true, register_meta: null, ...project }],
    client_selections: [], room_scope_items: [], job_events: [],
  };
  const rpcCalls = [];
  const toRow = (op, table) => {
    const now = stamp();
    db[table].push({ id: `row-${++seq}`, project_id: PROJECT_ID, source_register_item_id: op.item_id, client_visible: false, status: "not_started", created_at: now, updated_at: now,
      ...op.row, register_detail: pgJsonb(op.row.register_detail || {}), sort_order: op.row.sort_order ?? 0 });
  };
  const update = (op, table) => {
    const row = db[table].find((r) => r.id === op.row_id);
    if (!row) return { item_id: op.item_id, reason: "missing" };
    if (row.updated_at !== op.base_version) return { item_id: op.item_id, reason: "stale" };
    const { sort_order, ...rest } = op.row;
    Object.assign(row, rest, { register_detail: pgJsonb(op.row.register_detail || {}), updated_at: stamp(), ...(sort_order == null ? {} : { sort_order }) });
    return null;
  };
  const rpc = async (name, args) => {
    rpcCalls.push({ name, args: clone(args) });
    const conflicts = [];
    for (const op of args.p_ops) {
      if (op.op === "meta_init") db.projects[0].register_meta = pgJsonb({ ...op.meta, rev: 1, promotion: { status: "complete", at: "2026-11-10" } });
      else if (op.op === "meta_set") db.projects[0].register_meta = pgJsonb({ ...op.meta, rev: (db.projects[0].register_meta.rev || 0) + 1, promotion: db.projects[0].register_meta.promotion });
      else if (op.op === "sel_insert") toRow(op, "client_selections");
      else if (op.op === "scope_insert") toRow(op, "room_scope_items");
      else if (op.op === "sel_update") { const c = update(op, "client_selections"); if (c) conflicts.push(c); }
      else if (op.op === "scope_update") { const c = update(op, "room_scope_items"); if (c) conflicts.push(c); }
      else if (op.op === "sel_delete") db.client_selections = db.client_selections.filter((r) => r.id !== op.row_id);
      else if (op.op === "scope_delete") db.room_scope_items = db.room_scope_items.filter((r) => r.id !== op.row_id);
    }
    if (conflicts.length) return { data: { ok: false, conflicts }, error: null };
    return { data: { ok: true, results: [], promoted: { selections: db.client_selections.length, scopeItems: db.room_scope_items.length } }, error: null };
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
      select() { return b; }, order() { return b; }, limit() { return b; },
      eq(c, v) { st.filters.push([c, v]); return b; },
      update(p) { st.op = "update"; st.payload = p; return b; },
      insert(p) { st.op = "insert"; st.payload = p; return b; },
      maybeSingle() { return Promise.resolve({ data: clone(run()[0] ?? null), error: null }); },
      then(res, rej) { return Promise.resolve({ data: clone(run()), error: null }).then(res, rej); },
    };
    return b;
  };
  return { sb: { from, rpc }, db, rpcCalls };
}

const fx = buildStructuredRegister();
const N = fx.named;
const reg = { meta: fx.meta, items: fx.items };
const scratchpad = () => [...clone(writeRegister(reg)), ...clone(LEGACY_ROWS)];
const toRowFor = (it, i) => {
  const table = storeFor(it);
  const row = table === "client_selections" ? itemToSelRow(it, reg, i) : itemToRsiRow(it, reg, i);
  return { table, row: { ...clone(row), register_detail: pgJsonb(row.register_detail), id: `r${i}`, source_register_item_id: it.id, created_at: "2026-11-01", updated_at: "2026-11-02", client_visible: false, status: "not_started" } };
};
const fromRow = ({ table, row }) => (table === "client_selections" ? selRowToItem(row, { isPreconstruction: true }) : rsiRowToItem(row));

console.log("\nEvery mapper, in both directions");
const trips = fx.items.map((it, i) => ({ it, ...toRowFor(it, i) }));
ok("answers survive item → row → item for every kind (with jsonb key reordering)", trips.every((t) => same(fromRow(t).answer, t.it.answer)), trips.filter((t) => !same(fromRow(t).answer, t.it.answer)).map((t) => t.it.promptKey).join());
ok("the answer lives under register_detail.answer", trips.every((t) => !t.it.answer || t.row.register_detail.answer));
ok("ids, rooms, prompts and defaults survive too", trips.every((t) => { const b = fromRow(t); return b.id === t.it.id && b.roomId === t.it.roomId && b.promptKey === t.it.promptKey && b.isDefault === t.it.isDefault && b.overridesDefaultId === t.it.overridesDefaultId; }));
ok("the existing axes survive independently", trips.every((t) => { const b = fromRow(t); return b.certainty === t.it.certainty && b.disposition === t.it.disposition && b.technicalStatus === t.it.technicalStatus && b.pricingStatus === t.it.pricingStatus && b.responsibility === t.it.responsibility; }));
const legacyItem = makeItem({ itemKind: "selection", description: "Plain text", category: "flooring", promptKey: "W-017" });
const legacyRow = itemToSelRow(legacyItem, reg, 0);
ok("a legacy item adds nothing to register_detail", !("answer" in legacyRow.register_detail));
ok("an old canonical row with no answer reads as legacy", selRowToItem({ id: "x", status: "not_started", source_register_item_id: "ri_x", register_detail: { promptKey: "W-017", description: "Old" } }).answer === null);

console.log("\nStore classification");
ok("client choices go to client_selections, including part-finished and unresolved", fx.selectionKeys.every((k) => storeFor(N[k]) === "client_selections"));
ok("facts, scope, risks, excluded and N/A go to the internal store", fx.scopeStoreKeys.every((k) => storeFor(N[k]) === "room_scope_items"));

console.log("\nClient-readable columns");
const selTrips = trips.filter((t) => t.table === "client_selections");
const clientColumns = (row) => { const { register_detail: _d, ...rest } = row; return JSON.stringify(rest); };
ok("nothing internal reaches a client_selections column other than register_detail", selTrips.every((t) => !clientColumns(t.row).includes(INTERNAL_MARK)), selTrips.filter((t) => clientColumns(t.row).includes(INTERNAL_MARK)).map((t) => t.it.promptKey).join());
ok("a structured choice is named from its label", itemToSelRow(N.wallFeature, reg, 0).item_name === "Fibre cement sheet — Feature");
ok("two systems under one question get different names", itemToSelRow(N.wallMain, reg, 0).item_name !== itemToSelRow(N.wallFeature, reg, 0).item_name);
ok("an assumption-only item keeps the question title, never the assumption", itemToSelRow(N.assumed, reg, 0).item_name === "Cabinetry look");
ok("typed text still wins, so legacy titles don't change", itemToSelRow(makeItem({ itemKind: "selection", description: "Oak", answer: { selected: [{ path: ["t"], label: "Timber" }] } }), reg, 0).item_name === "Oak");
ok("an assumption can't fill a product column", !itemToSelRow(N.assumed, reg, 0).selected_product);

console.log("\nLead → promotion → project → reload → document input");
{
  const w = world({ lead: { selections_schedule: scratchpad() }, project: {} });
  const lead0 = await loadRegister(w.sb, LEAD_ID, { autoPromote: false });
  ok("lead mode reads every structured answer", lead0.mode === "lead" && fx.items.every((i) => same(lead0.register.items.find((b) => b.id === i.id)?.answer, i.answer)));
  const res = await promoteRegisterToProject(w.sb, { leadId: LEAD_ID, projectId: PROJECT_ID, actor: { id: null, name: "Staff" } });
  ok("promotion succeeds", res.ok, JSON.stringify(res));
  ok("every item is promoted exactly once", w.db.client_selections.length + w.db.room_scope_items.length === fx.items.length + LEGACY_ROWS.length);
  ok("nothing is made visible to the client", w.db.client_selections.every((r) => r.client_visible === false));
  const loaded = await loadRegister(w.sb, LEAD_ID);
  const after = loaded.register.items;
  ok("project mode", loaded.mode === "project");
  ok("every structured answer is unchanged after promotion", fx.items.every((i) => same(after.find((b) => b.id === i.id)?.answer, i.answer)), fx.items.filter((i) => !same(after.find((b) => b.id === i.id)?.answer, i.answer)).map((i) => i.promptKey).join());
  ok("every item id is unchanged", fx.items.every((i) => after.some((b) => b.id === i.id)));
  ok("room confirmations survive promotion", same(loaded.register.meta.rooms.find((r) => r.id === fx.rooms.bed1.id).defaultConfirmations, fx.rooms.bed1.defaultConfirmations));
  const plain = after.find((b) => b.id === "ri_w017_plain_text");
  ok("legacy free text survives promotion untouched", plain?.answer === null && plain.description === "Engineered oak, matt, living zones");
  ok("a legacy concept row survives promotion", after.some((b) => b.answer === null && /Blackbutt boards/.test(b.description)));
  const othersOf = (id) => after.find((b) => b.id === id).answer.selected.map((s) => s.label).join("|");
  ok("two Other answers both survive promotion, in the client store", othersOf(N.twoOthers.id) === "Pressed tin|Recycled brick" && w.db.client_selections.some((r) => r.source_register_item_id === N.twoOthers.id));
  ok("and in the internal store", othersOf(N.heatingOthers.id) === "Geothermal loop|Wood heater" && w.db.room_scope_items.some((r) => r.source_register_item_id === N.heatingOthers.id));
  ok("the zone default lookup works after promotion", after.filter((b) => b.isDefault && b.promptKey === "W-017" && b.answer?.zone).length === 2);

  const context = { identity: { clientName: "Test Client", siteAddress: "1 Example St", suburb: "Stirling" }, projectType: "renovation", consultants: [], goals: {}, drawings: [] };
  const input = { lead: { id: LEAD_ID, stage: "consultants" }, context, register: loaded.register, revision: 1, status: "Draft", issuedDate: "2026-11-10", issuer: "Staff" };
  for (const docType of ["client_brief", "architect_brief", "selections_schedule", "client_presentation"]) {
    const s = JSON.stringify(buildRegisterFixture(docType, input));
    ok(`${docType}: document input carries nothing internal`, !s.includes(INTERNAL_MARK));
  }
  const rows = selectionRecords(loaded.register);
  ok("the schedule doesn't list facts, excluded or N/A items", !rows.some((r) => /Site access|Living on site/.test(`${r.item} ${r.product}`)) && rows.length === fx.selectionKeys.length + LEGACY_ROWS.length);

  console.log("\nProject save");
  const fresh = (id) => loaded.register.items.find((b) => b.id === id);
  const dw = fresh(N.driveway.id);
  const widened = { ...dw, answer: { ...dw.answer, selected: [...dw.answer.selected, { path: ["charcoal"], label: "Charcoal" }] } };
  const saved = await saveRegister(w.sb, LEAD_ID, { changes: [widened] }, { actor: { name: "Staff" } });
  ok("an edited answer saves to the canonical row", saved.register.items.find((b) => b.id === N.driveway.id).answer.selected.length === 2);
  const roofRow = () => w.db.client_selections.find((r) => r.source_register_item_id === N.roof.id);
  const untouched = roofRow().updated_at;
  const again = await saveRegister(w.sb, LEAD_ID, { changes: [saved.register.items.find((b) => b.id === N.driveway.id)] }, { actor: { name: "Staff" } });
  ok("other rows are not touched", roofRow().updated_at === untouched && !!again);

  const r1 = saved.register.items.find((b) => b.id === N.roof.id);
  const moved = await saveRegister(w.sb, LEAD_ID, { changes: [{ ...r1, disposition: "excluded" }] }, { actor: { name: "Staff" } });
  const movedItem = moved.register.items.find((b) => b.id === N.roof.id);
  ok("excluding a selection moves it across stores with the same id and answer", movedItem.sync.table === "room_scope_items" && same(movedItem.answer, N.roof.answer) && !roofRow());
  const back = await saveRegister(w.sb, LEAD_ID, { changes: [{ ...movedItem, disposition: "undecided" }] }, { actor: { name: "Staff" } });
  ok("including it again brings it back the same", back.register.items.find((b) => b.id === N.roof.id).sync.table === "client_selections" && same(back.register.items.find((b) => b.id === N.roof.id).answer, N.roof.answer));

  const sinkNow = back.register.items.find((b) => b.id === N.sink.id);
  const { answer: _dropped, ...oldScreen } = sinkNow;
  const kept = await saveRegister(w.sb, LEAD_ID, { changes: [{ ...oldScreen, nextAction: "Check stock" }] }, { actor: { name: "Staff" } });
  ok("a screen that doesn't know about answers can't erase one", same(kept.register.items.find((b) => b.id === N.sink.id).answer, N.sink.answer) && kept.register.items.find((b) => b.id === N.sink.id).nextAction === "Check stock");
  const nowSink = kept.register.items.find((b) => b.id === N.sink.id);
  const cleared = await saveRegister(w.sb, LEAD_ID, { changes: [{ ...nowSink, answer: null }] }, { actor: { name: "Staff" } });
  ok("an explicit null does clear it", cleared.register.items.find((b) => b.id === N.sink.id).answer === null);

  const metaNow = cleared.register.meta;
  const oldRooms = metaNow.rooms.map(({ defaultConfirmations: _c, ...r }) => r);
  const metaSaved = await saveRegister(w.sb, LEAD_ID, { meta: { ...metaNow, rooms: oldRooms } }, { actor: { name: "Staff" } });
  ok("an older screen saving the room list keeps room confirmations", Object.keys(metaSaved.register.meta.rooms.find((r) => r.id === fx.rooms.bed1.id).defaultConfirmations).length === 2);
}

console.log("\nLocks on structured answers (refused before anything is written)");
async function guardCase({ table = "client_selections", item, rowPatch }) {
  const w = world({ lead: { selections_schedule: clone(writeRegister({ meta: fx.meta, items: [item] })) }, project: {} });
  await promoteRegisterToProject(w.sb, { leadId: LEAD_ID, projectId: PROJECT_ID, actor: { name: "Staff" } });
  Object.assign(w.db[table][0], rowPatch);
  const loaded = await loadRegister(w.sb, LEAD_ID);
  return { w, it: loaded.register.items[0], calls: () => w.rpcCalls.length };
}
const attemptBody = async (w, body) => { try { await saveRegister(w.sb, LEAD_ID, body, { actor: { name: "Staff" } }); return null; } catch (e) { return e; } };
const attempt = (w, change) => attemptBody(w, { changes: [change] });
const carpet = (it) => ({ ...it, answer: { ...it.answer, selected: [{ path: ["carpet"], label: "Carpet" }] } });
{
  const { w, it, calls } = await guardCase({ item: N.floorMain, rowPatch: { status: "ordered", certainty: "client_approved" } });
  const before = calls();
  const e = await attempt(w, carpet(it));
  ok("an ordered selection can't have its answer changed", e instanceof RegisterError && e.status === 409 && e.conflicts?.[0]?.reason === "post_contract_locked", e?.message);
  ok("the refused save never reached the database", calls() === before && same(w.db.client_selections[0].register_detail.answer, N.floorMain.answer));
  const noted = await attempt(w, { ...it, answer: { ...it.answer, note: "Delivery booked" } });
  ok("a staff note can still be added to it", noted === null && w.db.client_selections[0].register_detail.answer.note === "Delivery booked", noted?.message);
}
{
  const ev = { at: "2026-11-01", by: "Sandbox Staff", method: "meeting" };
  const { w, it, calls } = await guardCase({ item: N.floorMain, rowPatch: { status: "approved", certainty: "client_approved", approval_evidence: ev } });
  const before = calls();
  const e = await attempt(w, { ...carpet(it), certainty: "client_approved", evidence: ev });
  ok("changing an approved answer on the same evidence needs re-approval", e?.conflicts?.[0]?.reason === "reapproval_required", e?.message);
  ok("and writes nothing", calls() === before);
  const stepped = await attempt(w, { ...carpet(it), certainty: "proposed", evidence: null });
  ok("stepping it back to Proposed is allowed", stepped === null, stepped?.message);
}
{
  const ev = { at: "2026-11-01", by: "Sandbox Staff", method: "meeting" };
  const { w, it } = await guardCase({ item: N.floorMain, rowPatch: { status: "approved", certainty: "client_approved", approval_evidence: ev } });
  const fresh = await attempt(w, { ...carpet(it), certainty: "client_approved", evidence: { at: "2026-11-09", by: "Sandbox Staff", method: "signed", ref: "Variation 3" } });
  ok("fresh evidence allows the change", fresh === null, fresh?.message);
}
{
  const { w, it, calls } = await guardCase({ table: "room_scope_items", item: N.driveway, rowPatch: { baselined_at: "2026-11-05T00:00:00Z" } });
  const before = calls();
  const e = await attempt(w, { ...it, answer: { ...it.answer, selected: [{ path: ["pavers"], label: "Pavers" }] } });
  ok("agreed scope in the contract baseline can't change through its answer", e?.conflicts?.[0]?.reason === "baseline_locked" && calls() === before, e?.message);
  const clerical = await attempt(w, { ...it, answer: { ...it.answer, delivery: { method: "self_perform" } } });
  ok("who delivers it can still be recorded", clerical === null, clerical?.message);
}
{
  const { w, it } = await guardCase({ item: N.floorMain, rowPatch: {} });
  w.db.client_selections[0].updated_at = "2026-11-10T09:00:00.000Z";
  const e = await attempt(w, carpet(it));
  ok("a stale structured save is a conflict and writes nothing", e?.status === 409 && e.conflicts?.[0]?.reason === "stale" && same(w.db.client_selections[0].register_detail.answer, N.floorMain.answer), e?.message);
}

console.log("\nLocks hold however the request is written (refused before anything is written)");
const alias = (v) => (v.endsWith("+00:00") ? v.replace("+00:00", "Z") : v.replace(/Z$/, "+00:00"));
const EV = { at: "2026-11-01", by: "Sandbox Staff", method: "meeting" };
const FRESH_EV = { at: "2026-11-09", by: "Sandbox Staff", method: "signed", ref: "Variation 3" };
const reasonOf = (e) => e?.conflicts?.[0]?.reason;
{
  const typed = makeItem({ ...N.floorMain, description: "Main floor finish" });
  const { w, it, calls } = await guardCase({ item: typed, rowPatch: { status: "ordered", certainty: "client_approved" } });
  const before = calls();
  const change = carpet(it);
  const spelledAgain = await attempt(w, { ...change, sync: { ...it.sync, version: alias(it.sync.version) } });
  ok("the same version spelled differently is still locked", reasonOf(spelledAgain) === "post_contract_locked", spelledAgain?.message);
  const spaced = await attempt(w, { ...change, sync: { ...it.sync, version: it.sync.version.replace("T", " ") } });
  ok("a looser timestamp format is still locked", reasonOf(spaced) === "post_contract_locked", spaced?.message);
  const noVersion = await attempt(w, { ...change, sync: { ...it.sync, version: undefined } });
  ok("no version at all is still locked", reasonOf(noVersion) === "post_contract_locked", noVersion?.message);
  const unparsable = await attempt(w, { ...change, sync: { ...it.sync, version: it.sync.version.replace(/:\d\d\.\d+/, ":60.000") } });
  ok("a stamp JavaScript can't read but Postgres can is still locked", reasonOf(unparsable) === "post_contract_locked", unparsable?.message);
  // Postgres rounds this up to the stored instant. JavaScript truncates it to the millisecond before.
  const justUnder = new Date(Date.parse(it.sync.version) - 1000).toISOString().replace(/\.\d+Z$/, ".9999996Z");
  const overPrecise = await attempt(w, { ...change, sync: { ...it.sync, version: justUnder } });
  ok("a stamp Postgres would round differently is still locked", reasonOf(overPrecise) === "post_contract_locked", overPrecise?.message);
  const foreign = await attempt(w, { ...change, id: "ri_forged_not_real" });
  ok("a made-up item id on a real row is refused", reasonOf(foreign) === "item_mismatch" && foreign.status === 409, foreign?.message);
  const noId = await attempt(w, { ...change, id: undefined });
  ok("no item id on a real row is refused", reasonOf(noId) === "item_mismatch", noId?.message);
  const spelledRow = await attempt(w, { ...change, sync: { ...it.sync, rowId: it.sync.rowId.toUpperCase() } });
  ok("a row id spelled differently is refused", reasonOf(spelledRow) === "missing", spelledRow?.message);
  const del = await (async () => { try { await saveRegister(w.sb, LEAD_ID, { changes: [], deletes: [{ id: "ri_forged_not_real", sync: it.sync }] }, { actor: { name: "Staff" } }); return null; } catch (e) { return e; } })();
  ok("a delete naming the wrong item is refused", reasonOf(del) === "item_mismatch", del?.message);
  ok("none of those reached the database", calls() === before && same(w.db.client_selections[0].register_detail.answer, typed.answer));
  const honest = await attempt(w, { ...it, answer: { ...it.answer, note: "Delivery booked" } });
  ok("an honest save of the same row still works", honest === null, honest?.message);
}
{
  const typed = makeItem({ ...N.floorMain, description: "Main floor finish" });
  const { w, it } = await guardCase({ item: typed, rowPatch: { status: "ordered", certainty: "client_approved" } });
  w.db.client_selections[0].updated_at = "2026-11-10T09:00:00.000Z";
  const before = w.rpcCalls.length;
  const e = await attempt(w, carpet(it));
  ok("a genuinely stale copy of a locked row is reported as stale, so the screen can merge", reasonOf(e) === "stale" && w.rpcCalls.length === before + 1, e?.message);
}
{
  const otherSel = makeItem({ itemKind: "selection", category: "cladding", promptKey: "W-013", section: "project", description: "Feature wall", product: "Probe board",
    answer: { v: 1, state: "recorded", nature: "choice", selected: [{ path: ["other"], label: "Spotted gum shiplap" }] } });
  const { w, it, calls } = await guardCase({ item: otherSel, rowPatch: { status: "approved", certainty: "client_approved", approval_evidence: EV } });
  const before = calls();
  const reworded = { ...it, answer: { ...it.answer, selected: [{ path: ["other"], label: "Painted fibre cement" }] } };
  const e = await attempt(w, reworded);
  ok("changing what an approved Other says needs re-approval", reasonOf(e) === "reapproval_required" && calls() === before, e?.message);
  const stepped = await attempt(w, { ...reworded, certainty: "proposed", evidence: null });
  ok("stepping it back to Proposed is allowed", stepped === null, stepped?.message);
}
{
  const { w, it, calls } = await guardCase({ table: "room_scope_items", item: N.driveway, rowPatch: { baselined_at: "2026-11-05T00:00:00Z" } });
  const before = calls();
  const moved = await attempt(w, { ...it, answer: { ...it.answer, element: { id: "el_driveway_rear", key: "driveway", label: "Rear driveway" } } });
  ok("baselined scope can't move to another element of the same type", reasonOf(moved) === "baseline_locked", moved?.message);
  const asFact = await attempt(w, { ...it, answer: { ...it.answer, nature: "fact" } });
  ok("baselined scope can't be turned into a fact", reasonOf(asFact) === "baseline_locked", asFact?.message);
  const spelledAgain = await attempt(w, { ...it, sync: { ...it.sync, version: alias(it.sync.version) }, answer: { ...it.answer, selected: [{ path: ["pavers"], label: "Pavers" }] } });
  ok("baselined scope stays locked when the version is spelled differently", reasonOf(spelledAgain) === "baseline_locked", spelledAgain?.message);
  const foreign = await attempt(w, { ...it, id: "ri_forged_scope", answer: { ...it.answer, selected: [{ path: ["pavers"], label: "Pavers" }] } });
  ok("baselined scope can't be reached through a made-up item id", reasonOf(foreign) === "item_mismatch", foreign?.message);
  ok("and nothing was written", calls() === before && same(w.db.room_scope_items[0].register_detail.answer, N.driveway.answer));
  const renamed = await attempt(w, { ...it, answer: { ...it.answer, element: { ...it.answer.element, label: "Rear driveway" } } });
  ok("baselined scope can't be renamed to a different element under the same id", reasonOf(renamed) === "baseline_locked", renamed?.message);
  const relabelled = await attempt(w, { ...it, answer: { ...it.answer, selected: [{ path: it.answer.selected[0].path, label: "Pavers" }] } });
  ok("baselined scope can't change the words of its option", reasonOf(relabelled) === "baseline_locked", relabelled?.message);
  ok("neither was written", calls() === before && same(w.db.room_scope_items[0].register_detail.answer, N.driveway.answer));
}
{
  const req = makeItem({ itemKind: "requirement", category: "insulation", promptKey: "W-016", section: "project", certainty: "client_approved", evidence: EV,
    answer: { v: 1, state: "recorded", nature: "requirement", selected: [{ path: ["airtightness"], label: "Airtightness" }] } });
  const passive = (it) => ({ ...it, answer: { ...it.answer, selected: [{ path: ["passive_house_target"], label: "Passive House target" }] } });
  const { w, it, calls } = await guardCase({ table: "room_scope_items", item: req, rowPatch: {} });
  ok("an approved requirement loads as approved from the internal store", it.sync.table === "room_scope_items" && it.certainty === "client_approved");
  const before = calls();
  const e = await attempt(w, passive(it));
  ok("swapping an approved requirement's answer on the old evidence needs re-approval", reasonOf(e) === "reapproval_required" && calls() === before, e?.message);
  const noted = await attempt(w, { ...it, answer: { ...it.answer, note: "Confirm with the designer" } });
  ok("a staff note on it needs nothing", noted === null, noted?.message);
  const again = (await loadRegister(w.sb, LEAD_ID)).register.items[0];
  const fresh = await attempt(w, { ...passive(again), evidence: FRESH_EV });
  ok("fresh evidence allows the change", fresh === null, fresh?.message);
  const again2 = (await loadRegister(w.sb, LEAD_ID)).register.items[0];
  const back = await attempt(w, { ...again2, answer: { ...again2.answer, selected: [{ path: ["airtightness"], label: "Airtightness" }] }, certainty: "proposed", evidence: null });
  ok("stepping it back to Proposed is allowed", back === null, back?.message);
}
{
  const { w, it, calls } = await guardCase({ table: "room_scope_items", item: makeItem({ itemKind: "requirement", category: "insulation", promptKey: "W-016", section: "project", answer: { v: 1, state: "recorded", nature: "requirement", selected: [{ path: ["airtightness"], label: "Airtightness" }] } }), rowPatch: {} });
  const before = calls();
  const e = await attempt(w, { ...it, answer: { ...it.answer, selected: [{ path: ["passive_house_target"], label: "Passive House target" }] } });
  ok("a requirement that isn't approved is free to change", e === null && calls() === before + 1, e?.message);
}

console.log("\nThe words people read are locked too (refused before anything is written)");
{
  const zonedTyped = makeItem({ ...N.floorMain, description: "Main floor finish" });     // typed text, so only the answer lock can refuse
  const { w, it, calls } = await guardCase({ item: zonedTyped, rowPatch: { status: "ordered", certainty: "client_approved" } });
  const before = calls();
  const reworded = await attempt(w, { ...it, answer: { ...it.answer, selected: [{ path: ["timber"], label: "Carpet" }] } });
  ok("an ordered selection's option words can't change", reasonOf(reworded) === "post_contract_locked", reworded?.message);
  const rezoned = await attempt(w, { ...it, answer: { ...it.answer, zone: { key: "main_floor", label: "Rear living floor" } } });
  ok("an ordered selection's zone words can't change", reasonOf(rezoned) === "post_contract_locked", rezoned?.message);
  ok("none of that reached the database", calls() === before && same(w.db.client_selections[0].register_detail.answer, zonedTyped.answer));
  const swapped = await attempt(w, { ...it, answer: { ...it.answer, selected: [{ optionId: "carpet", path: ["timber"], label: "Timber" }] } });
  ok("a mismatched option id saves as the option the path names", swapped === null && w.db.client_selections[0].register_detail.answer.selected[0].optionId === "timber", swapped?.message);
}
{
  const untyped = makeItem({ itemKind: "selection", category: "cladding", promptKey: "W-013", section: "project", answer: { v: 1, state: "recorded", nature: "choice", selected: [{ path: ["timber_feature", "timber_cladding"], label: "Timber cladding" }] } });
  const { w, it, calls } = await guardCase({ item: untyped, rowPatch: { status: "approved", certainty: "client_approved", approval_evidence: EV } });
  const before = calls();
  const e = await attempt(w, { ...it, answer: { ...it.answer, selected: [{ path: ["timber_feature", "timber_cladding"], label: "Painted fibre cement" }] } });
  ok("an approved selection's words can't change on the old evidence", reasonOf(e) === "reapproval_required" && calls() === before, e?.message);
  ok("so the title the client sees can't change either", w.db.client_selections[0].item_name === "Timber cladding");
}

console.log("\nA save that names no row can't replace a stored item");
{
  const { w, it, calls } = await guardCase({ item: N.floorMain, rowPatch: { status: "approved", certainty: "client_approved", approval_evidence: EV } });
  const before = calls();
  const scopeAnswer = { ...it.answer, nature: "scope", selected: [{ path: ["carpet"], label: "Carpet" }] };
  const crossed = await attemptBody(w, { changes: [{ ...it, sync: null, answer: scopeAnswer }], deletes: [{ id: it.id, sync: it.sync }] });
  ok("an approved selection can't be swapped by delete plus re-insert", crossed?.status === 409 && reasonOf(crossed) === "exists", crossed?.message);
  const noSync = await attempt(w, { ...carpet(it), sync: null });
  ok("nor by leaving the row out", reasonOf(noSync) === "exists", noSync?.message);
  const otherMode = await attempt(w, { ...carpet(it), sync: { mode: "lead", version: "x" } });
  ok("nor by claiming a lead-mode copy", reasonOf(otherMode) === "exists", otherMode?.message);
  ok("nothing reached the database", calls() === before && same(w.db.client_selections[0].register_detail.answer, N.floorMain.answer));
}
{
  const req = makeItem({ itemKind: "requirement", category: "insulation", promptKey: "W-016", section: "project", certainty: "client_approved", evidence: EV,
    answer: { v: 1, state: "recorded", nature: "requirement", selected: [{ path: ["airtightness"], label: "Airtightness" }] } });
  const { w, it, calls } = await guardCase({ table: "room_scope_items", item: req, rowPatch: {} });
  const before = calls();
  const crossed = await attemptBody(w, { changes: [{ ...it, sync: null, itemKind: "selection", answer: { v: 1, state: "recorded", nature: "choice", selected: [{ path: ["passive_house"], label: "Passive House" }] } }], deletes: [{ id: it.id, sync: it.sync }] });
  ok("an approved requirement can't be swapped that way", reasonOf(crossed) === "exists" && calls() === before, crossed?.message);
}
{
  const { w, it } = await guardCase({ item: N.floorMain, rowPatch: {} });
  const brandNew = makeItem({ itemKind: "selection", category: "flooring", promptKey: "W-017", section: "project", description: "A new one" });
  const added = await attempt(w, brandNew);
  ok("a genuinely new item still saves", added === null && w.db.client_selections.some((r) => r.source_register_item_id === brandNew.id), added?.message);
  const moved = await attempt(w, { ...it, disposition: "excluded" });
  ok("a real move between stores still saves", moved === null && w.db.room_scope_items.some((r) => r.source_register_item_id === it.id), moved?.message);
}

console.log("\nLead-mode save");
{
  const w = world({ lead: { job_id: null, selections_schedule: clone(writeRegister(reg)) } });
  const l1 = await loadRegister(w.sb, LEAD_ID);
  const f = l1.register.items.find((b) => b.id === N.floorMain.id);
  const r1 = await saveRegister(w.sb, LEAD_ID, { changes: [carpet(f)] }, {});
  const upd = r1.register.items.find((b) => b.id === N.floorMain.id);
  ok("an edited answer saves on the scratchpad", upd.answer.selected[0].optionId === "carpet");
  let stale = null;
  try { await saveRegister(w.sb, LEAD_ID, { changes: [f] }, {}); } catch (e) { stale = e; }
  ok("saving over a newer copy is a 409 and changes nothing", stale?.status === 409 && readRegister(w.db.leads[0]).items.find((b) => b.id === N.floorMain.id).answer.selected[0].optionId === "carpet");
  const { answer: _a, ...oldScreen } = upd;
  const r2 = await saveRegister(w.sb, LEAD_ID, { changes: [{ ...oldScreen, nextAction: "Sample" }] }, {});
  ok("a screen that doesn't know about answers can't erase one", r2.register.items.find((b) => b.id === N.floorMain.id).answer.selected[0].optionId === "carpet");
  const rooms = r2.register.meta.rooms.map(({ defaultConfirmations: _c, ...r }) => r);
  const r3 = await saveRegister(w.sb, LEAD_ID, { meta: { ...r2.register.meta, rooms } }, {});
  ok("nor erase a room confirmation", Object.keys(r3.register.meta.rooms.find((r) => r.id === fx.rooms.bed1.id).defaultConfirmations).length === 2);
  ok("emptyMeta and makeRoom agree", makeRoom(emptyMeta({ rooms: [fx.rooms.bed1] }).rooms[0]).id === fx.rooms.bed1.id);
}

console.log(`\nregister-structured-store: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
