/**
 * register-promotion.test.mjs — Master Register R03 store unit tests (no DB).
 *
 * The SQL side of promotion / write-through (register_apply) is proven on a real Postgres by
 * register-migration-213.test.mjs and end-to-end through the real API by register-e2e.test.mjs. This
 * file pins the JS side of server/lib/registerStore.mjs with an in-memory client that records the RPC:
 *   • the load-bearing partition (only genuine choices → client_selections; scope / requirement / action /
 *     settled-out selections → room_scope_items), promotion never issues anything to the client,
 *   • promote-once (no-op when already promoted / no project / pre-213), failures are observable,
 *   • lossless item ⇄ row mapping (description, category key, room id, quantity, evidence, readiness),
 *   • save → ops: update with base version, reclassification = delete + insert (same id), deletes only for
 *     persisted rows, conflicts surface as 409 with nothing written.
 * Run: npm run test:register-promotion
 */
import {
  promoteRegisterToProject, saveRegister, storeFor, itemToSelRow, itemToRsiRow, selRowToItem, rsiRowToItem, RegisterError,
} from "../../server/lib/registerStore.mjs";
import { makeItem, makeRoom, emptyMeta, writeRegister } from "../../src/lib/register.js";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${detail}` : ""}`); } };

/** Minimal supabase-js stand-in: tables in memory, rpc recorded / scripted. */
function fakeSb({ tables = {}, rpc = () => ({ data: { ok: true, results: [], promoted: { selections: 0, scopeItems: 0 } }, error: null }) } = {}) {
  const calls = [];
  const db = JSON.parse(JSON.stringify(tables));
  const from = (t) => {
    const st = { t, filters: [], op: "select", payload: null };
    const rows = () => (db[t] || []).filter((r) => st.filters.every(([c, v]) => String(r[c]) === String(v)));
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; },
      eq(c, v) { st.filters.push([c, v]); return b; },
      insert(p) { st.op = "insert"; st.payload = p; (db[t] ||= []).push(...[].concat(p)); calls.push({ insert: t, p }); return b; },
      maybeSingle() { return Promise.resolve({ data: rows()[0] || null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: st.op === "insert" ? st.payload : rows(), error: null }).then(res, rej); },
    };
    return b;
  };
  return { from, rpc: async (name, args) => { calls.push({ rpc: name, args }); return rpc(name, args); }, calls, db };
}

const kitchen = makeRoom({ name: "Kitchen", roomType: "kitchen", level: "GF" });
const sink = makeItem({ itemKind: "selection", category: "sanitary", promptKey: "K-007", roomId: kitchen.id, description: "Undermount sink", product: "Franke Bell", certainty: "proposed", supplier: "Routleys", quantity: 1, unit: "ea" });
const demo = makeItem({ itemKind: "scope", category: "demolition", promptKey: "W-004", section: "site", disposition: "remove", description: "Demolish existing kitchen" });
const req = makeItem({ itemKind: "requirement", category: "insulation", promptKey: "W-016", description: "Improve thermal comfort", technicalStatus: "needs_verification" });
const act = makeItem({ itemKind: "action", category: "joinery", promptKey: "K-014", roomId: kitchen.id, description: "Coordinate appliance dims", responsibility: "blue_leaf" });
const byOthers = makeItem({ itemKind: "selection", category: "appliances", roomId: kitchen.id, description: "Client supplies fridge", disposition: "by_others" });
const deferred = makeItem({ itemKind: "selection", category: "external", description: "Pool fence", disposition: "deferred" });
const meta = emptyMeta({ rooms: [kitchen], planRev: "A102 Rev C" });
const register = { meta, items: [sink, demo, req, act, byOthers, deferred] };
const lead = { id: "11111111-1111-1111-1111-111111111111", job_id: "22222222-2222-2222-2222-222222222222", stage: "consultants", selections_schedule: writeRegister(register), updated_at: "2026-11-07T00:00:00Z" };
const project = { id: "33333333-3333-3333-3333-333333333333", job_id: lead.job_id, is_preconstruction: true, register_meta: null };

// ── partition guard ─────────────────────────────────────────────────────────────────────────────
ok("partition: only the genuine choice goes to client_selections",
  storeFor(sink) === "client_selections" && [demo, req, act, byOthers, deferred].every((i) => storeFor(i) === "room_scope_items"));

// ── promotion ───────────────────────────────────────────────────────────────────────────────────
{
  const sb = fakeSb({ tables: { leads: [lead], projects: [project] } });
  const r = await promoteRegisterToProject(sb, { leadId: lead.id, actor: { id: null, name: "Tester" } });
  const call = sb.calls.find((c) => c.rpc === "register_apply");
  const ops = call?.args?.p_ops || [];
  ok("promote: one atomic register_apply call in promote mode", r.ok && call && call.args.p_mode === "promote" && call.args.p_project_id === project.id);
  ok("promote: meta_init carries the room list + drawing basis", ops[0]?.op === "meta_init" && ops[0].meta.rooms.length === 1 && ops[0].meta.planRev === "A102 Rev C");
  ok("promote: the sink is a sel_insert; scope / requirement / action / by-others / deferred are scope_inserts",
    ops.filter((o) => o.op === "sel_insert").map((o) => o.item_id).join() === sink.id
    && ops.filter((o) => o.op === "scope_insert").length === 5);
  ok("promote: nothing is issued to the client (no issue op, no client_visible flag sent)",
    !ops.some((o) => o.op === "sel_issue") && !ops.some((o) => o.row && "client_visible" in o.row));
  ok("promote: provenance note recorded internally", /Master Register/.test(ops.find((o) => o.op === "sel_insert").row.internal_notes));
  ok("promote: requirement keeps its kind + needs-verification state", ops.find((o) => o.item_id === req.id).row.item_kind === "requirement"
    && ops.find((o) => o.item_id === req.id).row.technical_status === "needs_verification");
}
{
  const sb = fakeSb({ tables: { leads: [lead], projects: [{ ...project, register_meta: { rev: 1 } }] } });
  const r = await promoteRegisterToProject(sb, { leadId: lead.id });
  ok("promote: no-op when the project is already promoted (no RPC)", r.ok && r.alreadyPromoted && !sb.calls.some((c) => c.rpc));
}
{
  const sb = fakeSb({ tables: { leads: [{ ...lead, job_id: null }], projects: [] } });
  const r = await promoteRegisterToProject(sb, { leadId: lead.id });
  ok("promote: never creates a project — no job ⇒ nothing happens", !r.ok && /no job/.test(r.reason) && !sb.calls.some((c) => c.rpc));
}
{
  const sb = fakeSb({ tables: { leads: [lead], projects: [project] }, rpc: () => ({ data: null, error: { message: "boom" } }) });
  const r = await promoteRegisterToProject(sb, { leadId: lead.id });
  ok("promote: a failure returns ok:false and is recorded as a register.promotion_failed event (observable, retried on next open)",
    !r.ok && sb.calls.some((c) => c.insert === "job_events" && c.p.event_type === "register.promotion_failed"));
}

// ── lossless mapping ────────────────────────────────────────────────────────────────────────────
{
  const ev = { at: "2026-11-12T10:00:00Z", by: "Sam", method: "meeting", ref: "Concept presentation" };
  const approved = makeItem({ ...sink, certainty: "client_approved", evidence: ev, technicalStatus: "verified", technicalEvidence: { at: "2026-11-20", by: "Arch", ref: "A301 D" } });
  const row = { id: "r1", ...itemToSelRow(approved, register, 3), source_register_item_id: approved.id, status: "approved", approved_at: ev.at, client_visible: false, updated_at: "2026-11-12T10:00:00.123456+00:00" };
  const back = selRowToItem(row, { isPreconstruction: true });
  ok("mapping: selection ⇄ client_selections row is lossless (description, category key, room, product, supplier, qty, readiness, evidence)",
    back.id === approved.id && back.description === "Undermount sink" && back.category === "sanitary" && back.roomId === kitchen.id
    && back.product === "Franke Bell" && back.supplier === "Routleys" && back.quantity === 1 && back.unit === "ea"
    && back.certainty === "client_approved" && back.evidence?.ref === "Concept presentation" && back.technicalStatus === "verified");
  ok("mapping: the row version + canonical id travel in sync (never persisted to the lead)", back.sync.rowId === "r1" && back.sync.version === row.updated_at && back.sync.table === "client_selections");
  ok("mapping: portal title falls back to the question heading when the direction is blank", itemToSelRow(makeItem({ ...sink, description: "" }), register).item_name === "Sink & mixer");
  const rrow = { id: "s1", ...itemToRsiRow(req, register), source_register_item_id: req.id, updated_at: "x" };
  const rback = rsiRowToItem(rrow);
  ok("mapping: requirement ⇄ room_scope_items row is lossless", rback.itemKind === "requirement" && rback.description === "Improve thermal comfort" && rback.technicalStatus === "needs_verification" && rback.promptKey === "W-016");
  const board = selRowToItem({ id: "b1", project_id: project.id, category: "Tiling", item_name: "Board tile", status: "approved", approved_at: "2026-10-01", client_visible: true, updated_at: "v" }, { isPreconstruction: false });
  ok("mapping: a portal-board row is adopted (cs_ id), shows as approved-on-board and locked after contract",
    board.id === "cs_b1" && board.certainty === "client_approved" && board.sync.approvedOnBoard && board.sync.locked && board.sync.boardCreated);
}

// ── save → ops ──────────────────────────────────────────────────────────────────────────────────
{
  const selRow = { id: "row-sink", project_id: project.id, ...itemToSelRow(sink, register), source_register_item_id: sink.id, status: "not_started", client_visible: false, updated_at: "2026-11-08T01:00:00.000001+00:00" };
  const rsiRow = { id: "row-demo", project_id: project.id, ...itemToRsiRow(demo, register), source_register_item_id: demo.id, updated_at: "2026-11-08T01:00:00.000002+00:00" };
  const promoted = { ...project, register_meta: { ...meta, rev: 4 } };
  const tables = { leads: [lead], projects: [promoted], client_selections: [selRow], room_scope_items: [rsiRow] };
  const loadedSink = selRowToItem(selRow, { isPreconstruction: true });
  const loadedDemo = rsiRowToItem(rsiRow);
  const sb = fakeSb({ tables, rpc: () => ({ data: { ok: true, results: [] }, error: null }) });
  await saveRegister(sb, lead.id, {
    meta: { ...meta, rev: 4, planRev: "A102 Rev D" },
    changes: [
      makeItem({ ...loadedSink, product: "Franke Bell 1.5", sync: loadedSink.sync }),                                // same store → update
      makeItem({ ...loadedDemo, itemKind: "selection", disposition: "included", sync: loadedDemo.sync }),              // scope → selection
      makeItem({ itemKind: "action", description: "New follow-up" }),                                                  // new
    ],
    deletes: [{ id: "never-saved", sync: null }],
  }, { actor: { id: null, name: "T" } });
  const ops = sb.calls.find((c) => c.rpc === "register_apply")?.args.p_ops || [];
  ok("save: meta change → meta_set with base rev", ops.some((o) => o.op === "meta_set" && o.base_rev === 4 && o.meta.planRev === "A102 Rev D"));
  ok("save: same-store edit → sel_update with the loaded base version", ops.some((o) => o.op === "sel_update" && o.row_id === "row-sink" && o.base_version === selRow.updated_at && o.row.selected_product === "Franke Bell 1.5"));
  ok("save: reclassification → scope_delete + sel_insert with the SAME stable id",
    ops.some((o) => o.op === "scope_delete" && o.item_id === demo.id && o.base_version === rsiRow.updated_at) && ops.some((o) => o.op === "sel_insert" && o.item_id === demo.id));
  ok("save: a brand-new item → insert; an unsaved delete → no op", ops.filter((o) => o.op === "scope_insert").length === 1 && !ops.some((o) => o.item_id === "never-saved"));
  ok("save: existing rows keep their sort order (not re-indexed)", ops.find((o) => o.op === "sel_update").row.sort_order === null);

  const sbC = fakeSb({ tables, rpc: () => ({ data: { ok: false, conflicts: [{ item_id: sink.id, reason: "stale" }] }, error: null }) });
  let caught = null;
  try { await saveRegister(sbC, lead.id, { changes: [makeItem({ ...loadedSink, product: "X", sync: loadedSink.sync })] }); } catch (e) { caught = e; }
  ok("save: an RPC conflict surfaces as 409 with the conflicting item (nothing written)", caught instanceof RegisterError && caught.status === 409 && caught.conflicts?.[0]?.itemId === sink.id);
}
{
  // a project appeared since the screen loaded → promote then MODE_CHANGED (client re-applies its edits)
  const sb = fakeSb({ tables: { leads: [lead], projects: [project] } });
  let caught = null;
  try { await saveRegister(sb, lead.id, { changes: [makeItem({ ...sink, sync: { mode: "lead", version: sink.updatedAt } })] }); } catch (e) { caught = e; }
  ok("save: when a project now exists, the brief is promoted and the client is told to reload (MODE_CHANGED)",
    caught?.code === "MODE_CHANGED" && sb.calls.some((c) => c.rpc === "register_apply" && c.args.p_mode === "promote"));
}

console.log(`\nregister-promotion (R03 store): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
