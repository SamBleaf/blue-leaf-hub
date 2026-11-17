/**
 * register-store-hook.test.mjs — fix round 2 on the register's client store (useRegister) and its screen (RegisterWorkshop):
 *   R1  the register's "is this copy on screen?" watch follows the element the screen swaps to after loading;
 *   R3  a words box saves on every keystroke: typing the approved words back puts the approval and its evidence back;
 *   R18 after a meta save the next save sends the new rev (no "room list was changed elsewhere" on every second save);
 *   B1  undeleteItem: Undo puts the very record back (same id, same sync), so the next save neither deletes nor duplicates it;
 *   R13 the full-width workspace has no top padding above its sticky bar;
 *   R19 the "Budget confirmed" field in Sales reads as a yes.
 * Fix round 3:
 *   S1  the two copies of the register (desktop and phone layouts): a read waits for the other copy's save on its way;
 *   S2  a meta save answered with another screen's newer meta, under edits made meanwhile, still meets the conflict merge;
 *   S3  several deletes undone, in any order, come back in their old order.
 * Fix round 4:
 *   U1  Undo after the delete reached the server: the record is saved again with a position hint, so the STORED order (what
 *       GET and a reload read) keeps its old place too, in lead mode and project mode;
 *   U2  a record deleted while a save carrying its edit travels stays off the screen when that answer lands, Undo puts it
 *       back, and its delete otherwise goes with the server's version now (no "changed elsewhere" refusal).
 *
 * The pure rules (registerMerge.approvalStep, planUndelete, metaAfterSave) are tested directly. The store itself runs for
 * real: useRegister is bundled with esbuild, rendered once with react-dom/server (which runs its hooks but no effects),
 * and its network calls go to the real server code (registerStore.mjs) over an in-memory database. No browser, no server.
 * Run: node scripts/tests/register-store-hook.test.mjs
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { makeItem, makeRoom, emptyMeta, writeRegister, readRegister } from "../../src/lib/register.js";
import { approvalStep, approvalRestore, planUndelete, metaAfterSave, deletedPlaces, placeHint } from "../../src/lib/registerMerge.js";
import { saveRegister, loadRegister, promoteRegisterToProject, RegisterError, placeHints, orderWithHints, placeInTables } from "../../server/lib/registerStore.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 600)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const clone = (v) => JSON.parse(JSON.stringify(v));
const flat = (v) => JSON.stringify(v);

const LEAD_ID = "11111111-1111-1111-1111-111111111111", JOB_ID = "22222222-2222-2222-2222-222222222222", PROJECT_ID = "33333333-3333-3333-3333-333333333333";
const EV = { at: "2026-11-15T10:00:00.000Z", by: "Sam Morris", method: "meeting" };
const room = makeRoom({ id: "kt", name: "Kitchen", roomType: "kitchen", scope: "renovated" });
const approvedReq = makeItem({ id: "w15", itemKind: "requirement", promptKey: "W-015", category: "windows", certainty: "client_approved", evidence: EV, description: "No steps at the entry" });
const plainReq = makeItem({ id: "w20", itemKind: "requirement", promptKey: "W-020", category: "notes", description: "Keep the lemon tree" });
const plainReq2 = makeItem({ id: "w21", itemKind: "requirement", promptKey: "W-021", category: "notes", description: "Morning sun in the kitchen" });
const scratchpad = () => clone(writeRegister({ meta: emptyMeta({ rooms: [room] }), items: [approvedReq, plainReq, plainReq2] }));

// ── Pure rules ──────────────────────────────────────────────────────────────────────────────────────────────────
section("approvalStep: one keystroke at a time (R3)");
{
  const typed = (item, kept, partial) => { const s = approvalStep(item, partial, kept); return { s, item: makeItem({ ...item, ...s.partial, sync: item.sync }), kept: s.keep === undefined ? kept : s.keep }; };
  let t = typed(approvedReq, null, { description: "No steps at the entryx" });
  ok("the first key steps an approved record back to Proposed, without evidence, and keeps the approved copy", t.s.stepped && t.item.certainty === "proposed" && t.item.evidence === null && t.kept === approvedReq);
  const t2 = typed(t.item, t.kept, { description: "No steps at the entryxy" });
  ok("further keys leave the kept copy as it is", !t2.s.stepped && !t2.s.restored && t2.s.keep === undefined && t2.item.certainty === "proposed");
  const t3 = typed(t2.item, t2.kept, { description: "  no steps at the ENTRY " });
  ok("the approved words typed back (spaces and case aside) restore the approval and its evidence, and end the kept copy", t3.s.restored && t3.item.certainty === "client_approved" && flat(t3.item.evidence) === flat(EV) && t3.s.keep === null);
  ok("…keeping the words as typed", t3.item.description === "  no steps at the ENTRY ");
  const noted = typed(t.item, t.kept, { nextAction: "Check the threshold" });
  ok("an edit to another field while the words differ restores nothing", !noted.s.restored && noted.item.certainty === "proposed");
  const set = typed(t.item, t.kept, { certainty: "preference" });
  ok("setting the certainty on purpose ends the kept copy", set.s.keep === null && !set.s.restored && set.item.certainty === "preference");
  const reapproved = typed(t.item, t.kept, { certainty: "client_approved", evidence: { ...EV, at: "2026-11-17T09:00:00.000Z" } });
  ok("approving it again with new evidence ends the kept copy too", reapproved.s.keep === null && reapproved.item.evidence.at === "2026-11-17T09:00:00.000Z");
  ok("without a kept copy nothing comes back", approvalStep(makeItem({ ...approvedReq, certainty: "proposed", evidence: null }), { description: "No steps at the entry" }, null).restored === false);
  ok("a record that isn't approved never steps back", approvalStep(plainReq, { description: "Anything" }, null).stepped === false);

  const sel = makeItem({ id: "s1", itemKind: "selection", category: "benchtop", description: "Benchtop", product: "Calacatta", certainty: "client_approved", evidence: EV });
  const s1 = typed(sel, null, { product: "Calacattax" });
  ok("a selection's product steps it back", s1.s.stepped && s1.item.certainty === "proposed");
  ok("…and the approved product typed back restores it", typed(s1.item, s1.kept, { product: "Calacatta" }).s.restored);
  const s2 = typed(s1.item, s1.kept, { description: "Island benchtop" });
  ok("a selection's own words aren't its approval: they neither step back nor block the restore", !s2.s.stepped && typed(s2.item, s2.kept, { product: "Calacatta" }).s.restored);
  const answered = makeItem({ ...approvedReq, id: "a1", answer: { v: 1, state: "recorded", nature: "requirement", selected: [{ path: ["airtightness"], label: "Airtightness" }] } });
  const a1 = typed(answered, null, { description: "No steps at the entryx" });
  const a2 = typed(a1.item, a1.kept, { answer: { ...answered.answer, selected: [{ path: ["passive_house_target"], label: "Passive House target" }] } });
  ok("words back but a different answer: nothing comes back (the answer is approved too)", !typed(a2.item, a2.kept, { description: "No steps at the entry" }).s.restored);
  ok("approvalRestore refuses another record's copy", approvalRestore(approvedReq, makeItem({ ...a1.item, id: "other" })) === null);
}

section("planUndelete: Undo puts the very record back (B1)");
{
  const loaded = makeItem({ ...plainReq, sync: { mode: "lead", version: "v1" } });
  const others = [makeItem({ id: "a" }), makeItem({ id: "b" }), makeItem({ id: "c" })];
  const pend = planUndelete(loaded, { current: { items: others }, pending: loaded, at: 1 });
  ok("a delete not yet saved: same id, same sync, nothing to save", pend.item.id === "w20" && flat(pend.item.sync) === flat(loaded.sync) && pend.dirty === false);
  ok("…back where it was in the list", pend.items.map((i) => i.id).join() === "a,w20,b,c");
  const edited = planUndelete(makeItem({ ...loaded, description: "Keep the lemon tree and the fig" }), { current: { items: others }, pending: loaded });
  ok("edits made before the delete still need saving", edited.dirty === true && edited.items[3].id === "w20");
  const flying = planUndelete(loaded, { current: { items: others }, pending: loaded, flying: true });
  ok("a delete already on its way: saved again", flying.dirty === true && flat(flying.item.sync) === flat(loaded.sync));
  const gone = planUndelete(loaded, { current: { items: others }, pending: null, at: 99 });
  ok("a delete the server already has: back as new under the same id (no sync), at the end", gone.dirty === true && gone.item.sync === null && gone.item.id === "w20" && gone.items[3].id === "w20");
  ok("a record already there isn't added twice", planUndelete(others[0], { current: { items: others } }) === null);
}

section("metaAfterSave: the meta a save's answer stands for (R18)");
{
  const sent = emptyMeta({ rev: 4, planRev: "DA rev 4", floors: ["Upper"] });
  const fresh = emptyMeta({ rev: 5, planRev: "DA rev 4", floors: ["Upper"] });
  ok("an answer read after the save is used as it is", metaAfterSave(sent, fresh) === fresh);
  const later = emptyMeta({ rev: 6, planRev: "DA rev 5" });
  ok("so is one that also holds another screen's later save", metaAfterSave(sent, later) === later);
  const stale = metaAfterSave(sent, emptyMeta({ rev: 4, planRev: "DA rev 3" }));
  ok("an answer read before the save: what was sent, at the next rev", stale.rev === 5 && stale.planRev === "DA rev 4" && flat(stale.floors) === flat(["Upper"]));
  ok("no meta sent: the answer as it is", metaAfterSave(null, fresh) === fresh);

  // Round 3 (S2): another screen's save landed between this save and the answer (rev 6 for a save sent on 4).
  ok("…another screen's later save, nothing changed here since: used as it is", metaAfterSave(sent, later, { changedSince: false }) === later);
  const mine = metaAfterSave(sent, later, { changedSince: true });
  ok("…with edits made here since: what was sent, at r + 1 (so the next save meets the conflict and merges)", mine.rev === 5 && mine.planRev === "DA rev 4" && flat(mine.floors) === flat(["Upper"]));
  ok("…this save's own answer (r + 1) is used even with edits made since", metaAfterSave(sent, fresh, { changedSince: true }) === fresh);
  const held = emptyMeta({ rev: 3, planRev: "DA rev 2" });
  ok("nothing sent, another screen moved the rev on, edits made here since: the copy they started from", metaAfterSave(null, emptyMeta({ rev: 4, planRev: "DA rev 9" }), { changedSince: true, before: held }) === held);
  ok("nothing sent, the rev unmoved: the answer, edits or not", metaAfterSave(null, emptyMeta({ rev: 3 }), { changedSince: true, before: held }).rev === 3 && metaAfterSave(null, fresh, { changedSince: true, before: emptyMeta({ rev: 5 }) }) === fresh);
}

// ── The store and the watch, bundled ────────────────────────────────────────────────────────────────────────────
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REG = join(REPO, "src/components/sales/lead-detail/register");
const dir = mkdtempSync(join(tmpdir(), "register-store-hook-"));
const out = join(REPO, "node_modules", ".cache", `register-store-hook-${process.pid}.mjs`);
const entry = join(dir, "entry.jsx");
const stub = join(dir, "apiFetch.stub.js");
writeFileSync(stub, `
export const apiFetch = (url, opts) => globalThis.__registerApi.fetch(url, opts);
export const apiPut = (url, body, opts) => globalThis.__registerApi.put(url, body, opts);
export const apiPost = (url, body) => globalThis.__registerApi.post(url, body);
`);
writeFileSync(entry, `
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useRegister, watchShown, trackSave, savesSettled } from ${JSON.stringify(join(REG, "useRegister.js"))};
export { watchShown, trackSave, savesSettled };
export function mountStore(leadId, opts) {
  let api = null;
  function Probe() { api = useRegister(leadId, opts); return null; }
  renderToStaticMarkup(createElement(Probe));
  return api;
}
`);

/**
 * A lead (and optionally its project) in memory; register_apply rev-checks meta_set as migration 213 does.
 * hooks.afterApply, when set, runs once straight after the next apply is written (another screen saving in between).
 */
function world({ lead = {}, project = null } = {}) {
  let clock = 0, seq = 0;
  const hooks = {};
  const stamp = () => new Date(Date.UTC(2026, 10, 10, 0, 0, ++clock)).toISOString();
  const db = {
    leads: [{ id: LEAD_ID, job_id: JOB_ID, name: "Test Client", project_type: "renovation", stage: "consultants", selections_schedule: [], updated_at: stamp(), ...lead }],
    projects: project === null ? [] : [{ id: PROJECT_ID, job_id: JOB_ID, is_preconstruction: true, register_meta: null, ...project }],
    client_selections: [], room_scope_items: [], job_events: [],
  };
  const insert = (op, table) => { const now = stamp(); db[table].push({ id: `row-${++seq}`, project_id: PROJECT_ID, source_register_item_id: op.item_id, client_visible: false, status: "not_started", created_at: now, updated_at: now, ...op.row, sort_order: op.row.sort_order ?? 0 }); };
  const update = (op, table) => {
    const row = db[table].find((r) => r.id === op.row_id);
    if (!row) return { item_id: op.item_id, reason: "missing" };
    if (row.updated_at !== op.base_version) return { item_id: op.item_id, reason: "stale" };
    const { sort_order, ...rest } = op.row;
    Object.assign(row, rest, { updated_at: stamp(), ...(sort_order == null ? {} : { sort_order }) });
    return null;
  };
  const rpc = async (_name, args) => {
    const conflicts = [];
    for (const op of args.p_ops) {
      const stored = db.projects[0]?.register_meta;
      if (op.op === "meta_set" && stored && (Number(stored.rev) || 0) !== (op.base_rev ?? -1)) conflicts.push({ item_id: "__meta__", reason: "meta_stale" });
    }
    if (conflicts.length) return { data: { ok: false, conflicts }, error: null };
    for (const op of args.p_ops) {
      if (op.op === "meta_init") db.projects[0].register_meta = { ...op.meta, rev: 1, promotion: { status: "complete" } };
      else if (op.op === "meta_set") db.projects[0].register_meta = { ...op.meta, rev: (db.projects[0].register_meta.rev || 0) + 1 };
      else if (op.op === "sel_insert") insert(op, "client_selections");
      else if (op.op === "scope_insert") insert(op, "room_scope_items");
      else if (op.op === "sel_update") { const c = update(op, "client_selections"); if (c) conflicts.push(c); }
      else if (op.op === "scope_update") { const c = update(op, "room_scope_items"); if (c) conflicts.push(c); }
      else if (op.op === "sel_delete") db.client_selections = db.client_selections.filter((r) => r.id !== op.row_id);
      else if (op.op === "scope_delete") db.room_scope_items = db.room_scope_items.filter((r) => r.id !== op.row_id);
    }
    if (conflicts.length) return { data: { ok: false, conflicts }, error: null };
    if (hooks.afterApply) { const f = hooks.afterApply; hooks.afterApply = null; await f(); }
    return { data: { ok: true, results: [], promoted: {} }, error: null };
  };
  const from = (t) => {
    const st = { filters: [], op: "select", payload: null, orders: [] };
    const rows = () => (db[t] || []).filter((r) => st.filters.every(([c, v]) => String(r[c]) === String(v)));
    // order() sorts as PostgREST does (each key in turn, a stable sort), so the project's stored order is what GET reads.
    const sorted = (list) => [...list].sort((a, z) => {
      for (const [c, asc] of st.orders) { if (a[c] === z[c]) continue; return (a[c] < z[c] ? -1 : 1) * (asc ? 1 : -1); }
      return 0;
    });
    const run = () => {
      if (st.op === "update") { const hit = rows(); hit.forEach((r) => Object.assign(r, clone(st.payload))); return hit; }
      if (st.op === "insert") { (db[t] ||= []).push(...[].concat(st.payload)); return [].concat(st.payload); }
      return sorted(rows());
    };
    const b = {
      select() { return b; }, order(c, o = {}) { st.orders.push([c, o.ascending !== false]); return b; }, limit() { return b; }, like() { return b; }, in() { return b; },
      eq(c, v) { st.filters.push([c, v]); return b; },
      update(p) { st.op = "update"; st.payload = p; return b; },
      insert(p) { st.op = "insert"; st.payload = p; return b; },
      maybeSingle() { return Promise.resolve({ data: clone(run()[0] ?? null), error: null }); },
      then(res, rej) { return Promise.resolve({ data: clone(run()), error: null }).then(res, rej); },
    };
    return b;
  };
  return { sb: { from, rpc }, db, hooks };
}

/**
 * The register routes, in memory: GET and PUT answer as registerRoutes.mjs does. oldAnswer: answer a meta save with the
 * meta as it was before the save (the server before the R18 fix), to show the store copes with that on its own.
 * putDelay: a slow save (ms before it is written), so a read made meanwhile would be answered first.
 */
function serve(w, { oldAnswer = false, putDelay = 0 } = {}) {
  const log = [];
  globalThis.__registerApi = {
    fetch: async () => {
      const o = await loadRegister(w.sb, LEAD_ID);
      log.push({ get: true });
      return { ok: true, status: 200, data: clone({ register: o.register, mode: o.mode, projectId: o.projectId, jobId: o.jobId, isPreconstruction: o.isPreconstruction,
        promotion: o.promotion || null, pendingPromotion: !!o.pendingPromotion, schemaReady: o.schemaReady !== false }) };
    },
    put: async (_url, body) => {
      const sent = clone(body);
      if (putDelay) await new Promise((r) => setTimeout(r, putDelay));
      try {
        const before = oldAnswer && sent.meta ? (await loadRegister(w.sb, LEAD_ID)).register.meta : null;
        const o = await saveRegister(w.sb, LEAD_ID, clone(sent), { actor: { name: "Staff" } });
        log.push({ body: sent, status: 200 });
        return { ok: true, status: 200, data: clone({ register: before ? { ...o.register, meta: before } : o.register, mode: o.mode }) };
      } catch (e) {
        if (!(e instanceof RegisterError)) throw e;
        log.push({ body: sent, status: e.status, reason: e.conflicts?.[0]?.reason || e.code });
        const b = { ok: false, error: e.message, code: e.code, conflicts: e.conflicts };
        return { ok: false, data: null, status: e.status, error: e.message, code: e.code, body: b };
      }
    },
    post: async () => ({ ok: false, status: 400, error: "Not used here.", body: { ok: false, error: "Not used here." } }),
  };
  return log;
}
const puts = (log) => log.filter((l) => !l.get);
const refusals = (log) => puts(log).filter((l) => l.status !== 200);
const storedLead = (w, id) => readRegister(w.db.leads[0]).items.find((i) => i.id === id);
const storedRows = (w, id) => [...w.db.room_scope_items, ...w.db.client_selections].filter((r) => r.source_register_item_id === id);

try {
  await build({
    entryPoints: [entry], outfile: out, bundle: true, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
    nodePaths: [join(REPO, "node_modules")], external: ["react", "react-dom", "react-dom/server"],
    define: { "import.meta.env": "{}" },
    plugins: [{ name: "stub-api", setup(b) { b.onResolve({ filter: /\/apiFetch\.js$/ }, () => ({ path: stub })); } }],
  });
  const H = await import(pathToFileURL(out).href);

  section("watchShown: is this copy on screen? (R1)");
  {
    const observers = [];
    class FakeRO { constructor(cb) { this.cb = cb; this.targets = []; this.on = true; observers.push(this); } observe(t) { this.targets.push(t); } disconnect() { this.on = false; } }
    const body = { tag: "body" };
    let rects = 1;
    const el = { getClientRects: () => ({ length: rects }) };
    const seen = [];
    const stop = H.watchShown(el, (v) => seen.push(v), FakeRO, body);
    ok("checked straight away", flat(seen) === "[true]");
    ok("it watches the window (the body) and the element itself", observers[0].targets.includes(body) && observers[0].targets.includes(el));
    rects = 0; observers[0].cb();
    ok("a layout that hides it (display:none) reads as not shown", seen.at(-1) === false);
    rects = 1; observers[0].cb();
    ok("shown again when the window crosses back", seen.at(-1) === true);
    stop();
    ok("stopping disconnects", observers[0].on === false);
    const hidden = []; H.watchShown({ getClientRects: () => ({ length: 0 }) }, (v) => hidden.push(v), FakeRO, body);
    ok("the CSS-hidden copy starts not shown (so it never loads)", flat(hidden) === "[false]");
    ok("no element, nothing watched", typeof H.watchShown(null, () => { throw new Error("called"); }, FakeRO, body) === "function");
  }

  for (const mode of ["lead", "project"]) {
    section(`The store, ${mode} mode: an approved record's words typed one key at a time (R3)`);
    const w = world({ lead: { selections_schedule: scratchpad(), ...(mode === "lead" ? { job_id: null } : {}) }, project: mode === "project" ? {} : null });
    if (mode === "project") await promoteRegisterToProject(w.sb, { leadId: LEAD_ID, projectId: PROJECT_ID, actor: { id: null, name: "Staff" } });
    const log = serve(w);
    const store = H.mountStore(LEAD_ID, { enabled: true });
    const loaded = await store.reload();
    ok("it loads", loaded?.mode === mode && loaded.register.items.length === 3, flat({ mode: loaded?.mode }));
    const now = async (id) => (mode === "lead" ? storedLead(w, id) : (await loadRegister(w.sb, LEAD_ID)).register.items.find((i) => i.id === id));

    store.updateItem("w15", { description: "No steps at the entryx" });
    await store.flush();
    ok("the first key saves it as Proposed, without evidence", puts(log).at(-1)?.body.changes?.[0]?.certainty === "proposed" && puts(log).at(-1).body.changes[0].evidence === null && (await now("w15")).certainty === "proposed");
    store.updateItem("w15", { description: "No steps at the entr" });
    store.updateItem("w15", { description: "No steps at the entry" });
    await store.flush();
    const back = await now("w15");
    ok("typing the approved words back saves it approved again, with the original evidence", back.certainty === "client_approved" && back.evidence?.at === EV.at && back.evidence?.by === EV.by && back.description === "No steps at the entry", flat(back));
    store.updateItem("w15", { description: "No steps at the entry, please" });
    await store.flush();
    ok("a real change still steps it back", (await now("w15")).certainty === "proposed");
    ok("the server refused nothing on the way", refusals(log).length === 0, flat(refusals(log)));

    section(`The store, ${mode} mode: Undo of a delete (B1)`);
    const w20 = loaded.register.items.find((i) => i.id === "w20");
    const before = puts(log).length;
    store.deleteItem("w20");
    const put = store.undeleteItem(w20);
    ok("Undo before the save: the same record, same id and sync", put?.id === "w20" && flat(put.sync) === flat(w20.sync) && put.description === w20.description);
    await store.flush();
    ok("…and the save neither deletes nor sends it (nothing to save)", puts(log).length === before && (mode === "lead" ? !!storedLead(w, "w20") : storedRows(w, "w20").length === 1));
    ok("Undo of a record already on screen does nothing", store.undeleteItem(w20) === null);

    store.deleteItem("w20");
    await store.flush();
    ok("a saved delete removes it", puts(log).at(-1)?.body.deletes?.some((d) => d.id === "w20") && (mode === "lead" ? !storedLead(w, "w20") : storedRows(w, "w20").length === 0));
    store.undeleteItem(w20);
    await store.flush();
    const again = puts(log).at(-1)?.body.changes?.find((c) => c.id === "w20");
    ok("Undo after the delete was saved: saved again as new, under the same id", again && !again.sync && (mode === "lead" ? storedLead(w, "w20")?.description === "Keep the lemon tree" : storedRows(w, "w20").length === 1), flat(again));

    const w21 = (await loadRegister(w.sb, LEAD_ID)).register.items.find((i) => i.id === "w21");
    store.deleteItem("w21");
    const flying = store.flush();          // the delete is on its way
    store.undeleteItem(w21);               // Undo pressed while it travels
    await flying;
    await store.flush();
    const copies = mode === "lead" ? readRegister(w.db.leads[0]).items.filter((i) => i.id === "w21").length : storedRows(w, "w21").length;
    ok("Undo while the delete travels: the record is back once, under its own id", copies === 1, copies);
    ok("no refusals", refusals(log).length === 0, flat(refusals(log)));
  }

  section("The store, project mode: the room list saved again and again (R18)");
  for (const oldAnswer of [false, true]) {
    const w = world({ lead: { selections_schedule: scratchpad() }, project: {} });
    await promoteRegisterToProject(w.sb, { leadId: LEAD_ID, projectId: PROJECT_ID, actor: { id: null, name: "Staff" } });
    const log = serve(w, { oldAnswer });
    const store = H.mountStore(LEAD_ID, { enabled: true });
    const loaded = await store.reload();
    const r0 = loaded.register.meta.rev;
    store.mutateMeta({ planRev: "DA rev 4" }); await store.flush();
    store.mutateMeta({ floors: ["Upper"] }); await store.flush();
    store.mutateMeta({ lastStep: "rooms" }); await store.flush();
    const label = oldAnswer ? "even when the answer was read before the save (the server before its fix)" : "with the server's answer";
    ok(`three meta saves, each sent on the rev the last one left, ${label}`, flat(puts(log).map((p) => p.body.meta?.rev)) === flat([r0, r0 + 1, r0 + 2]), flat(puts(log).map((p) => p.body.meta?.rev)));
    ok(`…none refused as changed elsewhere, and no reload in between (${oldAnswer ? "old" : "new"} answer)`, refusals(log).length === 0 && log.filter((l) => l.get).length === 1, flat(log.map((l) => l.status || "get")));
    const m = w.db.projects[0].register_meta;
    ok(`…all three saved (${oldAnswer ? "old" : "new"} answer)`, m.rev === r0 + 3 && m.planRev === "DA rev 4" && flat(m.floors) === flat(["Upper"]) && m.lastStep === "rooms", flat(m));
  }
  {
    // The conflict rule itself is unchanged: another screen's save in between is still a conflict, merged and saved.
    const w = world({ lead: { selections_schedule: scratchpad() }, project: {} });
    await promoteRegisterToProject(w.sb, { leadId: LEAD_ID, projectId: PROJECT_ID, actor: { id: null, name: "Staff" } });
    const log = serve(w);
    const store = H.mountStore(LEAD_ID, { enabled: true });
    const loaded = await store.reload();
    await saveRegister(w.sb, LEAD_ID, { meta: { ...loaded.register.meta, planRev: "DA rev 9" } }, { actor: { name: "Other screen" } });
    store.mutateMeta({ floors: ["Upper"] });
    await store.flush();
    await new Promise((r) => setTimeout(r, 120));
    ok("a save on a rev another screen moved on is still refused as changed elsewhere", refusals(log)[0]?.reason === "meta_stale", flat(refusals(log)));
    ok("…then merged and saved, keeping both changes", w.db.projects[0].register_meta.planRev === "DA rev 9" && flat(w.db.projects[0].register_meta.floors) === flat(["Upper"]), flat(w.db.projects[0].register_meta));
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  section("The store, project mode: another screen saves the room list while this one's save travels (S2)");
  for (const typedMeanwhile of [true, false]) {
    const w = world({ lead: { selections_schedule: scratchpad() }, project: {} });
    await promoteRegisterToProject(w.sb, { leadId: LEAD_ID, projectId: PROJECT_ID, actor: { id: null, name: "Staff" } });
    const log = serve(w);
    const store = H.mountStore(LEAD_ID, { enabled: true });
    const r0 = (await store.reload()).register.meta.rev;
    // Screen B saves its floors straight after this screen's save is written, before the answer is read (rev r0 + 2).
    w.hooks.afterApply = async () => {
      const now = (await loadRegister(w.sb, LEAD_ID)).register.meta;
      await saveRegister(w.sb, LEAD_ID, { meta: { ...now, floors: ["Upper"] } }, { actor: { name: "Other screen" } });
    };
    store.mutateMeta({ planRev: "DA rev 4" });
    const flying = store.flush();
    if (typedMeanwhile) store.mutateMeta({ lastStep: "rooms" });   // a room box typed into while the save travels
    await flying;
    if (!typedMeanwhile) store.mutateMeta({ lastStep: "rooms" });
    await store.flush();
    await sleep(150);   // a conflict is merged and saved again 50 ms later
    const m = w.db.projects[0].register_meta;
    const label = typedMeanwhile ? "typed while it travelled" : "typed after the answer";
    ok(`the other screen's floors are kept, and both of this screen's changes saved (${label})`,
      flat(m.floors) === flat(["Upper"]) && m.planRev === "DA rev 4" && m.lastStep === "rooms", flat(m));
    if (typedMeanwhile) ok("…the next save was sent on this save's own rev, met 'changed elsewhere' and was merged (not written over theirs)",
      puts(log)[1]?.body.meta?.rev === r0 + 1 && refusals(log)[0]?.reason === "meta_stale", flat(puts(log).map((p) => [p.body.meta?.rev, p.status])));
    else ok("…the answer held the other screen's floors, so the next save went straight through on its rev",
      puts(log)[1]?.body.meta?.rev === r0 + 2 && refusals(log).length === 0, flat(puts(log).map((p) => [p.body.meta?.rev, p.status])));
  }

  section("Two copies of the register: the copy coming into view reads after the other copy's save (S1)");
  {
    const w = world({ lead: { selections_schedule: scratchpad(), job_id: null } });
    const log = serve(w, { putDelay: 60 });
    const going = H.mountStore(LEAD_ID, { enabled: true });         // the copy going out of sight (an iPad turned round)
    await going.reload();
    const coming = H.mountStore(LEAD_ID, { enabled: true });        // the copy coming into view
    going.updateItem("w20", { description: "Keep the lemon tree and the fig" });
    const saving = going.flush();                                     // the save the layout change starts (slow here)
    const got = await coming.reload();                                // its read, started at the same moment
    await saving;
    ok("the read waits for the save on its way, so it holds the last edit", got.register.items.find((i) => i.id === "w20")?.description === "Keep the lemon tree and the fig");
    const putAt = log.findIndex((l) => !l.get), lastGet = log.map((l) => !!l.get).lastIndexOf(true);
    ok("…the save was written before the read was answered", putAt >= 0 && putAt < lastGet, flat(log.map((l) => (l.get ? "get" : "put"))));
  }
  {
    // The copy going out of sight had a save in flight and more edits behind it: it sends them at once (not after the
    // autosave pause), and the read waits for that save too.
    const w = world({ lead: { selections_schedule: scratchpad(), job_id: null } });
    const log = serve(w, { putDelay: 40 });
    const hidden = H.mountStore(LEAD_ID, { enabled: false });
    await hidden.reload();
    hidden.updateItem("w20", { description: "Keep the lemon tree and the fig" });
    const first = hidden.flush();
    hidden.updateItem("w21", { description: "Morning sun in the kitchen and the study" });
    hidden.flush();                                                   // what the layout change asks for: queued behind the first
    const coming = H.mountStore(LEAD_ID, { enabled: true });
    const got = await coming.reload();
    await first;
    const byId = new Map(got.register.items.map((i) => [i.id, i]));
    ok("both edits are in the read (the second save went straight after the first, and was waited for)",
      byId.get("w20")?.description === "Keep the lemon tree and the fig" && byId.get("w21")?.description === "Morning sun in the kitchen and the study", flat(log.map((l) => (l.get ? "get" : "put"))));
    ok("…two saves, both before the read", flat(log.map((l) => (l.get ? "get" : "put"))) === flat(["get", "put", "put", "get"]), flat(log.map((l) => (l.get ? "get" : "put"))));
  }
  {
    ok("nothing on its way: settled straight away", (await H.savesSettled("lead-none", 40)) === true);
    H.trackSave("lead-stuck", new Promise(() => {}));
    const t0 = Date.now();
    const settled = await H.savesSettled("lead-stuck", 40);
    ok("a save that never answers is waited for only so long, then the read goes ahead", settled === false && Date.now() - t0 >= 35 && Date.now() - t0 < 1000);
    let release;
    H.trackSave("lead-chain", new Promise((r) => { release = r; }));
    setTimeout(() => { H.trackSave("lead-chain", sleep(40)); release(); }, 20);
    const t1 = Date.now();
    ok("a save started before the last one lands is waited for too", (await H.savesSettled("lead-chain", 2000)) === true && Date.now() - t1 >= 55);
  }

  section("The store: several deletes undone, in any order, come back in their old order (S3)");
  {
    const five = ["a", "b", "c", "d", "e"].map((id, k) => makeItem({ id, itemKind: "requirement", promptKey: `W-03${k}`, category: "notes", description: `Note ${id}` }));
    const w = world({ lead: { selections_schedule: clone(writeRegister({ meta: emptyMeta({ rooms: [room] }), items: five })), job_id: null } });
    serve(w);
    const store = H.mountStore(LEAD_ID, { enabled: true });
    const loaded = await store.reload();
    const rec = new Map(loaded.register.items.map((i) => [i.id, i]));
    // The list on screen, read through replaceItems (it hands over the store's own copy; unchanged, it changes nothing).
    const order = () => { let ids = ""; store.replaceItems((cur) => { ids = cur.items.map((i) => i.id).join(""); return cur; }); return ids; };
    const run = (deletes, undos) => { deletes.forEach((id) => store.deleteItem(id)); const mid = order(); undos.forEach((id) => store.undeleteItem(rec.get(id))); return [mid, order()]; };
    ok("loaded in order", order() === "abcde");
    ok("b then d deleted, undone b then d: abcde (was abdce)", flat(run(["b", "d"], ["b", "d"])) === flat(["ace", "abcde"]));
    ok("…undone d then b: abcde", flat(run(["b", "d"], ["d", "b"])) === flat(["ace", "abcde"]));
    ok("next to each other, b then c, undone b then c: abcde", flat(run(["b", "c"], ["b", "c"])) === flat(["ade", "abcde"]));
    ok("'Delete all' b, c, d, then its Undo (each in turn): abcde", flat(run(["b", "c", "d"], ["b", "c", "d"])) === flat(["ae", "abcde"]));
    ok("the first and the last, undone last first: abcde", flat(run(["a", "e"], ["e", "a"])) === flat(["bcd", "abcde"]));
    store.replaceItems((cur) => ({ ...cur, items: cur.items.filter((i) => i.id !== "b" && i.id !== "d") }));   // a room deleted with its records
    store.undeleteItem(rec.get("d")); store.undeleteItem(rec.get("b"));
    ok("removed together (replaceItems), undone in any order: abcde", order() === "abcde");
    store.deleteItem("b"); store.deleteItem("d");
    await store.flush();
    store.undeleteItem(rec.get("b")); store.undeleteItem(rec.get("d"));
    ok("deletes already saved, then undone: back in their old places on screen", order() === "abcde");
  }

  // ── Round 4 ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const peekOf = (store) => () => { let cur = null; store.replaceItems((c) => { cur = c; return c; }); return cur; };

  section("The server's position hint, as a rule (U1)");
  {
    const held = new Set(["a", "c"]);
    const hints = placeHints([{ id: "b", __afterId: "a" }, { id: "x", __afterId: null }, { id: "c", __afterId: "a" }, { id: "y" },
      { id: "z", __afterId: 7 }, { id: "q", __afterId: "q" }], held);
    ok("only records not stored yet take a hint (a stored record is never moved), and only an id or null", flat([...hints]) === flat([["b", "a"], ["x", null]]), flat([...hints]));
    ok("lead order: after the id it names, null first", orderWithHints(["a", "c", "d", "b", "x"], hints).join("") === "xabcd");
    ok("…a record whose neighbour is put back in the same save waits for it, whatever order they were sent in",
      orderWithHints(["a", "e", "d", "c"], new Map([["d", "c"], ["c", "a"]])).join("") === "acde");
    ok("…one whose neighbour is nowhere goes at the end", orderWithHints(["a", "b", "z"], new Map([["z", "gone"]])).join("") === "abz");

    // Project mode: the rows' sort_order. a0 c1 d2 e3 in the scope table; b goes after a, with no number free.
    const rsi = (id, order, movable = true) => [id, { table: "room_scope_items", order, movable }];
    const cur = (ids) => ({ meta: emptyMeta({}), items: ids.map((id) => makeItem({ id, itemKind: "requirement" })) });
    const rows = new Map([rsi("a", 0), rsi("c", 1), rsi("d", 2), rsi("e", 5)]);
    const p = placeInTables({ current: cur(["a", "c", "d", "e"]), rows, fresh: [{ id: "b", store: "room_scope_items" }], hints: new Map([["b", "a"]]) });
    ok("no number free: the rows after move up only as far as they need (e keeps 5)", p.orderFor.get("b") === 1 && flat([...p.moved]) === flat([["c", 2], ["d", 3]]), flat([[...p.orderFor], [...p.moved]]));
    const gap = placeInTables({ current: cur(["a", "c"]), rows: new Map([rsi("a", 0), rsi("c", 4)]), fresh: [{ id: "b", store: "room_scope_items" }], hints: new Map([["b", "a"]]) });
    ok("a number free: taken, nothing moves", gap.orderFor.get("b") === 1 && gap.moved.size === 0);
    const first = placeInTables({ current: cur(["a"]), rows: new Map([rsi("a", 0)]), fresh: [{ id: "b", store: "room_scope_items" }], hints: new Map([["b", null]]) });
    ok("first: before the first row (a number below it), nothing moves", first.orderFor.get("b") === -1 && first.moved.size === 0);
    const locked = placeInTables({ current: cur(["a", "c"]), rows: new Map([rsi("a", 0), rsi("c", 1, false)]), fresh: [{ id: "b", store: "room_scope_items" }], hints: new Map([["b", "a"]]) });
    ok("a row that mustn't be rewritten (issued, approved, baselined) is never moved: the record ties with the one before it", locked.orderFor.get("b") === 0 && locked.moved.size === 0);
    const edited = placeInTables({ current: cur(["a", "c"]), rows: new Map([rsi("a", 0), rsi("c", 1, false)]), fresh: [{ id: "b", store: "room_scope_items" }], hints: new Map([["b", "a"]]), editing: new Set(["c"]) });
    ok("…but one this save updates anyway can be (its own update carries the new number)", edited.orderFor.get("b") === 1 && flat([...edited.moved]) === flat([["c", 2]]));
    const deleting = placeInTables({ current: cur(["a", "c", "d"]), rows: new Map([rsi("a", 0), rsi("c", 1), rsi("d", 2)]), fresh: [{ id: "b", store: "room_scope_items" }], hints: new Map([["b", "a"]]), gone: new Set(["c"]) });
    ok("a row this save deletes leaves its number free", deleting.orderFor.get("b") === 1 && deleting.moved.size === 0, flat([[...deleting.orderFor], [...deleting.moved]]));
    const mixed = new Map([["s1", { table: "client_selections", order: 0, movable: true }], rsi("a", 1), rsi("b", 2)]);
    const afterSel = placeInTables({ current: cur(["s1", "a", "b"]), rows: mixed, fresh: [{ id: "x", store: "room_scope_items" }], hints: new Map([["x", "s1"]]) });
    ok("a scope record after a selection goes first of the scope rows", afterSel.orderFor.get("x") === 0 && afterSel.moved.size === 0);
    const selAfterScope = placeInTables({ current: cur(["s1", "a", "b"]), rows: mixed, fresh: [{ id: "s2", store: "client_selections" }], hints: new Map([["s2", "b"]]) });
    ok("a selection after a scope row goes last of the selections", selAfterScope.orderFor.get("s2") === 1);
    const plain = placeInTables({ current: cur(["a", "c"]), rows: new Map([rsi("a", 0), rsi("c", 7)]), fresh: [{ id: "n", store: "room_scope_items" }] });
    ok("a new record with no hint goes at the end (after the highest number, never onto one in use)", plain.orderFor.get("n") === 8);

    // Random runs: the screen's Undo (deletedPlaces + planUndelete + placeHint) against the project's sort_order
    // (placeInTables), with deletes saved and Undos saved one at a time or several in one save. After every save the
    // stored order (sort_order, then oldest first) must read exactly as the screen does.
    const ORIGINAL = "abcdefgh";
    let seed = 7;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    let bad = null;
    for (let run = 0; run < 300 && !bad; run++) {
      let made = 0;
      const stored = new Map([...ORIGINAL].map((id, k) => [id, { order: k, made: made++ }]));
      let list = [...ORIGINAL].map((id) => makeItem({ id, itemKind: "requirement" }));
      const places = new Map();
      const storedIds = () => [...stored].sort((x, z) => x[1].order - z[1].order || x[1].made - z[1].made).map(([id]) => id).join("");
      for (let step = 0; step < 14 && !bad; step++) {
        const on = list.map((i) => i.id), gone = [...ORIGINAL].filter((id) => !on.includes(id));
        if (on.length && (rnd(2) === 0 || !gone.length)) {
          const ids = [...new Set([on[rnd(on.length)], on[rnd(on.length)]])].slice(0, 1 + rnd(2));
          for (const [id, before] of deletedPlaces(list, ids, [...places].map(([id2, b]) => ({ id: id2, before: b })))) { places.delete(id); places.set(id, before); }
          list = list.filter((i) => !ids.includes(i.id));
          ids.forEach((id) => stored.delete(id));                               // the delete is saved
        } else if (gone.length) {
          const undone = [...new Set(Array.from({ length: 1 + rnd(3) }, () => gone[rnd(gone.length)]))];
          for (const id of undone) { list = planUndelete(makeItem({ id, itemKind: "requirement" }), { current: { items: list }, before: places.get(id) ?? null }).items; places.delete(id); }
          const hints = new Map(undone.map((id) => [id, placeHint(list, id)]));
          const ids = storedIds().split("").filter(Boolean);
          const rows = new Map(ids.map((id) => [id, { table: "room_scope_items", order: stored.get(id).order, movable: true }]));
          const p = placeInTables({ current: cur(ids), rows, fresh: undone.map((id) => ({ id, store: "room_scope_items" })), hints });
          for (const [id, order] of p.moved) stored.get(id).order = order;
          for (const id of undone) stored.set(id, { order: p.orderFor.get(id), made: made++ });
        }
        const screenIds = list.map((i) => i.id).join("");
        if (storedIds() !== screenIds) bad = `run ${run} step ${step}: stored ${storedIds()} vs screen ${screenIds}`;
      }
    }
    ok("300 random runs of saved deletes and Undos (one or several per save): the stored order always reads as the screen", !bad, bad);
  }

  for (const mode of ["lead", "project"]) {
    section(`The store, ${mode} mode: Undo after the delete reached the server keeps its place in the STORED order (U1)`);
    const recs = [
      ...(mode === "project" ? [makeItem({ id: "s1", itemKind: "selection", category: "tapware", description: "Basin mixer" }),
        makeItem({ id: "s2", itemKind: "selection", category: "tapware", description: "Shower rose" })] : []),
      ...["a", "b", "c", "d", "e"].map((id, k) => makeItem({ id, itemKind: "requirement", promptKey: `W-04${k}`, category: "notes", description: `Note ${id}` })),
    ];
    const w = world({ lead: { selections_schedule: clone(writeRegister({ meta: emptyMeta({ rooms: [room] }), items: recs })), ...(mode === "lead" ? { job_id: null } : {}) }, project: mode === "project" ? {} : null });
    if (mode === "project") await promoteRegisterToProject(w.sb, { leadId: LEAD_ID, projectId: PROJECT_ID, actor: { id: null, name: "Staff" } });
    const log = serve(w);
    const store = H.mountStore(LEAD_ID, { enabled: true });
    const loaded = await store.reload();
    const rec = new Map(loaded.register.items.map((i) => [i.id, i]));
    const peek = peekOf(store);
    const screen = () => peek().items.map((i) => i.id).join(",");
    const stored = async () => (await loadRegister(w.sb, LEAD_ID)).register.items.map((i) => i.id).join(",");
    const original = await stored();
    ok("loaded in order", screen() === original && original === (mode === "project" ? "s1,s2,a,b,c,d,e" : "a,b,c,d,e"), original);
    const undo = (...ids) => ids.forEach((id) => store.undeleteItem(rec.get(id)));

    store.deleteItem("b"); await store.flush();
    ok("the delete reached the server", !(await stored()).split(",").includes("b"));
    undo("b"); await store.flush();
    const sent = puts(log).at(-1)?.body.changes?.find((c) => c.id === "b");
    ok("the save puts it back as new with a hint: the record now before it", sent && !sent.sync && sent.__afterId === "a", flat(sent));
    ok("after the next save, GET (and so a reload or a print) reads the old order", (await stored()) === original, await stored());
    ok("…and so does the screen", screen() === original, screen());
    const raw = mode === "lead" ? w.db.leads[0].selections_schedule.find((i) => i.id === "b") : storedRows(w, "b")[0];
    ok("the hint is never stored", raw && !("__afterId" in raw) && !flat(raw).includes("__afterId"), flat(raw));

    store.deleteItem("b"); store.deleteItem("c"); store.deleteItem("d"); await store.flush();
    undo("b", "c", "d"); await store.flush();
    ok("'Delete all' saved, then its Undo (each in turn, one save): the old order stored", (await stored()) === original, await stored());

    store.deleteItem("b"); store.deleteItem("c"); store.deleteItem("d"); await store.flush();
    let movedRows = 0, rewritten = [];
    for (const id of ["d", "c", "b"]) {
      const snap = new Map(clone(w.db.room_scope_items).map((r) => [r.id, r]));
      undo(id); await store.flush();
      for (const r of w.db.room_scope_items) {
        const was = snap.get(r.id);
        if (!was || was.sort_order === r.sort_order) continue;
        movedRows++;
        const strip = (row) => { const o = { ...row }; delete o.sort_order; delete o.updated_at; return o; };
        if (flat(strip(was)) !== flat(strip(r))) rewritten.push(r.source_register_item_id);
      }
    }
    ok("…undone last first, one save each (project mode: no number free, the rows after move up): the old order stored", (await stored()) === original, await stored());
    if (mode === "project") ok("…rows moved up to make room change their sort_order and nothing else", movedRows > 0 && !rewritten.length, flat({ movedRows, rewritten }));
    ok("…on screen too", screen() === original, screen());

    store.deleteItem("c");
    const travelling = store.flush();      // the delete is on its way
    undo("c");                             // Undo pressed while it travels
    await travelling;
    ok("Undo while the delete travels: the answer leaves it where Undo put it (not at the end)", screen() === original, screen());
    await store.flush();
    ok("…and the next save stores it there", (await stored()) === original, await stored());

    store.deleteItem("a"); await store.flush(); undo("a"); await store.flush();
    ok(mode === "project" ? "the first scope record (after the last selection): back first of the scope rows" : "the first record: back first", (await stored()) === original, await stored());
    if (mode === "project") {
      store.deleteItem("s1"); await store.flush(); undo("s1"); await store.flush();
      ok("the first selection: back first", (await stored()) === original, await stored());
      store.deleteItem("s2"); await store.flush(); undo("s2"); await store.flush();
      ok("the last selection (the record after it is a scope row): back last of the selections", (await stored()) === original, await stored());
    }
    store.deleteItem("e"); await store.flush(); undo("e"); await store.flush();
    ok("the last record: back last", (await stored()) === original, await stored());
    ok("no save was refused on the way", refusals(log).length === 0, flat(refusals(log)));
    ok("each record is stored once", (await stored()).split(",").length === recs.length && (mode === "lead" || ["a", "b", "c", "d", "e", "s1", "s2"].every((id) => storedRows(w, id).length === 1)));
  }

  for (const mode of ["lead", "project"]) {
    section(`The store, ${mode} mode: a record deleted while a save carrying its edit travels (U2)`);
    const w = world({ lead: { selections_schedule: scratchpad(), ...(mode === "lead" ? { job_id: null } : {}) }, project: mode === "project" ? {} : null });
    if (mode === "project") await promoteRegisterToProject(w.sb, { leadId: LEAD_ID, projectId: PROJECT_ID, actor: { id: null, name: "Staff" } });
    const log = serve(w);
    const store = H.mountStore(LEAD_ID, { enabled: true });
    await store.reload();
    const peek = peekOf(store);
    const screen = () => peek().items.map((i) => i.id).join(",");
    const held = async (id) => (await loadRegister(w.sb, LEAD_ID)).register.items.find((i) => i.id === id) || null;

    store.updateItem("w20", { description: "Keep the lemon tree and the fig" });
    const shown = peek().items.find((i) => i.id === "w20");       // the record as the screen shows it (what Undo hands back)
    const travelling = store.flush();                               // the save carrying the edit
    store.deleteItem("w20");                                        // deleted while it travels
    await travelling;
    ok("the save's answer doesn't bring it back on screen", screen() === "w15,w21", screen());
    ok("…it is still on the server, with the edit (the delete hasn't gone yet)", (await held("w20"))?.description === "Keep the lemon tree and the fig");
    const back = store.undeleteItem(shown);
    ok("Undo puts it back, in its place", back?.id === "w20" && screen() === "w15,w20,w21", screen());
    const before = puts(log).length;
    await store.flush();
    ok("…and nothing deletes it: no delete is sent", puts(log).slice(before).every((p) => !(p.body.deletes || []).some((d) => d.id === "w20")), flat(puts(log).slice(before).map((p) => p.body.deletes)));
    ok("…the record and its edit are kept", (await held("w20"))?.description === "Keep the lemon tree and the fig");

    store.updateItem("w21", { description: "Morning sun in the kitchen and the study" });
    const going = store.flush();
    store.deleteItem("w21");
    await going;
    const versionNow = (await held("w21"))?.sync?.version;
    ok("no Undo: still off the screen after the answer", screen() === "w15,w20", screen());
    await store.flush();
    const del = puts(log).at(-1)?.body.deletes?.find((d) => d.id === "w21");
    ok("…the delete goes with the server's version now (the save just answered bumped it)", del && del.sync?.version === versionNow, flat([del, versionNow]));
    ok("…so it isn't refused as changed elsewhere, and the record is gone", refusals(log).length === 0 && !(await held("w21")), flat(refusals(log)));
  }

  section("The store: a save refused while a delete waits keeps that record off the screen (U2)");
  {
    const w = world({ lead: { selections_schedule: scratchpad(), job_id: null } });
    const log = serve(w);
    const store = H.mountStore(LEAD_ID, { enabled: true });
    const loaded = await store.reload();
    const peek = peekOf(store);
    const screen = () => peek().items.map((i) => i.id).join(",");
    // Another screen edits w21 first, so this screen's edit of it is refused as changed elsewhere (409, then merged).
    const w21 = loaded.register.items.find((i) => i.id === "w21");
    await saveRegister(w.sb, LEAD_ID, { changes: [{ ...w21, nextAction: "Ask about the blinds" }] }, { actor: { name: "Other screen" } });
    store.updateItem("w21", { description: "Morning sun in the kitchen and the study" });
    store.deleteItem("w20");
    await store.flush();
    ok("the save was refused (another screen's edit)", refusals(log)[0]?.reason === "stale", flat(refusals(log)));
    ok("…and the record whose delete waits isn't put back on screen by the merge", screen() === "w15,w21", screen());
    await store.flush();   // the merge's own retry (50 ms later) is put back by the peek above, so save now
    ok("…the retry deletes it, and keeps both edits of w21", !storedLead(w, "w20") && storedLead(w, "w21")?.description === "Morning sun in the kitchen and the study" && storedLead(w, "w21")?.nextAction === "Ask about the blinds");
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(out, { force: true });
}

// ── The screens' source (no browser here) ──────────────────────────────────────────────────────────────────────
const read = (p) => readFileSync(join(REPO, p), "utf8");
const workshop = read("src/components/sales/lead-detail/register/RegisterWorkshop.jsx");
const hook = read("src/components/sales/lead-detail/register/useRegister.js");

section("RegisterWorkshop watches the element it shows (R1)");
ok("every root takes the callback ref (the loading placeholder, the switched-off lists and the full screen)", (workshop.match(/ref=\{setRoot\}/g) || []).length === 3 && !/ref=\{rootRef\}/.test(workshop));
ok("the watch comes from useShown, kept in rootRef for the Escape rule", /const \[setRoot, visible\] = useShown\(rootRef\);/.test(workshop) && /rootRef\.current\?\.querySelectorAll/.test(workshop));
ok("no [] effect that watches the first element only", !/new ResizeObserver\(check\)[\s\S]{0,120}\}, \[\]\);/.test(workshop));
ok("useShown re-watches whenever the element changes", /useEffect\(\(\) => watchShown\(el, setShown\), \[el\]\);/.test(hook) && /if \(node\) setEl\(node\);/.test(hook));
ok("the register loads only while shown, and the body flags follow it", /useRegister\(lead\.id, \{ enabled: visible,/.test(workshop) && /const live = visible && open && !!reg && !store\.disabled;/.test(workshop));

section("Undo reaches the screens (B1)");
ok("RoomScreen and DocumentsStep get undeleteItem", /<RoomScreen[\s\S]*?undeleteItem=\{store\.undeleteItem\}[\s\S]*?\/>/.test(workshop) && /<DocumentsStep[\s\S]*?undeleteItem=\{store\.undeleteItem\}[\s\S]*?\/>/.test(workshop));
ok("the store returns it", /deleteItem, undeleteItem, replaceItems/.test(hook));
{
  // Integration (round 2): the record drawer's room cards get it too, from both places the drawer opens, so the
  // drawer's earlier-answer Undo puts back the same ids instead of readdIfGone copies.
  const drawer = read("src/components/sales/lead-detail/register/EditDrawer.jsx");
  const docs = read("src/components/sales/lead-detail/register/DocumentsStep.jsx");
  ok("EditDrawer takes undeleteItem and hands it to its RoomBriefCard",
    /export default function EditDrawer\(\{[^}]*\bundeleteItem\b/.test(drawer) && /<RoomBriefCard[^>]*undeleteItem=\{undeleteItem\}/s.test(drawer));
  ok("both EditDrawers are given it (the workshop's record drawer, the Documents drawer)",
    /<EditDrawer[^>]*undeleteItem=\{store\.undeleteItem\}/s.test(workshop) && /<EditDrawer[^>]*undeleteItem=\{undeleteItem\}/s.test(docs));
}

section("The store uses the shared rules (R3, R18)");
ok("updateItem goes through approvalStep", /const step = approvalStep\(item, partial, kept\?\.item \|\| null\);/.test(hook) && !/editOutrunsApproval\(item, partial\)/.test(hook));
ok("every save adopts metaAfterSave's meta as the server's copy, told whether the meta changed meanwhile (R18, S2)",
  /server\.meta = metaAfterSave\(body\.meta \|\| null, server\.meta, \{ changedSince: metaChangedInFlight, before \}\);\s*baseRef\.current\.meta = server\.meta;/.test(hook)
  && /const before = baseRef\.current\.meta;\s*const server = adopt\(r\.data\);/.test(hook));

section("The two copies of the register take turns (S1)");
ok("a read waits for any save of the lead on its way before it fetches", /await savesSettled\(leadId\);\s*if \(!mounted\.current\) return null;\s*const r = await apiFetch\(`\/api\/register\/leads\/\$\{leadId\}`\);/.test(hook));
ok("every save counts as on its way until it and its merge are done", /trackSave\(leadId, new Promise\(\(r\) => \{ landed = r; \}\)\);\s*try \{/.test(hook) && /\} finally \{ landed\(\); \}/.test(hook));
ok("a copy out of sight sends what's left at once (after a save, and after a merge)", /if \(onScreen\.current\) schedule\(\); else flushRef\.current\(\);/.test(hook)
  && /if \(onScreen\.current\) timer\.current = setTimeout\(\(\) => \{ flushRef\.current\(\); \}, 50\);\s*else flushRef\.current\(\);/.test(hook));
ok("a copy shown again lets go of its old register before reading afresh (no stale copy to type into)",
  /const cameBack = enabled && !onScreen\.current;\s*onScreen\.current = enabled;/.test(hook) && /if \(cameBack && own\) \{ regRef\.current = null; loadedFor\.current = null; setReg\(null\); \}\s*load\(\);/.test(hook));
ok("…and the workshop shows 'Loading the brief…' while it has none", /\(store\.loading && !reg\) && <p className="text-sm text-muted">Loading the brief…<\/p>/.test(workshop));

section("Undo keeps the old order (S3)");
ok("deletes remember their place through deletedPlaces, counting earlier deletes not yet undone", /deletedPlaces\(items, ids, ghosts\)/.test(hook) && /before: deletedAt\.current\.get\(item\.id\) \?\? null/.test(hook));
ok("a single delete and a bulk removal both remember it", /if \(there\) rememberPlaces\(cur\.items, \[id\]\);/.test(hook) && /if \(gone\.length\) rememberPlaces\(cur\.items, gone\.map\(\(i\) => i\.id\)\);/.test(hook));
{
  const docs = read("src/components/sales/lead-detail/register/DocumentsStep.jsx");
  const card = read("src/components/sales/lead-detail/register/RoomBriefCard.jsx");
  ok("'Delete all' and the earlier-answer banner still undo through the store's undeleteItem, one record at a time",
    /gone\.forEach\(\(i\) => undeleteItem\(i\)\)/.test(docs) && /if \(undeleteItem\) \{ undeleteItem\(i\); continue; \}/.test(card));
}

section("The full-width workspace (R13, P2 residual)");
const overlay = (workshop.match(/className=\{expanded \? "fixed inset-0 z-40[^"]*"/) || [""])[0];
ok("the scrolling workspace has no top padding (it pushed the sticky bar 16 px down)", overlay && !/\b(sm:)?p[yt]-\d/.test(overlay) && /\bpb-3\b/.test(overlay) && /\bsm:pb-4\b/.test(overlay), overlay);
const barAt = workshop.indexOf("ref={expandBarRef}"), cardAt = workshop.indexOf('data-testid="register-workshop"');
ok("its bar sits at the very top, outside the card, full width, with the gap below it as a spacer", barAt > 0 && barAt < cardAt && /ref=\{expandBarRef\} className="sticky top-0 z-30 -mx-2[^"]*sm:-mx-6/.test(workshop) && /<div className="h-3 sm:h-4" aria-hidden="true" \/>/.test(workshop));

section("Budget confirmed in Sales reads as a yes (R19)");
const leadPage = read("src/pages/LeadDetail.jsx");
ok("the placeholder is a yes", /label="Budget confirmed"[^\n]*placeholder="e\.g\. Yes — approved finance"/.test(leadPage) && !/\$1\.3M–\$1\.5M approved finance/.test(leadPage));
ok("a muted hint says how the brief reads it", /text-muted[^"]*" data-testid="budget-confirmed-hint">Starts with Yes = confirmed for the brief\.</.test(leadPage));

console.log(`\nregister-store-hook: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
