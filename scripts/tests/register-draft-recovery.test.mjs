/**
 * register-draft-recovery.test.mjs — Tab 26 R05 retest: unsaved register edits survive a reload on this device and
 * are offered back, never applied by themselves. Restoring merges onto the current server copy, so a stale draft
 * can't overwrite newer data. No server, no database (an in-memory IndexedDB stands in for the browser's).
 * Run: node scripts/tests/register-draft-recovery.test.mjs
 */
import { readFileSync } from "node:fs";
import { makeItem, emptyMeta } from "../../src/lib/register.js";
import { registerDraftOf, draftIsEmpty, planRegisterRestore, mergeItem } from "../../src/lib/registerMerge.js";
import {
  _setIndexedDbFactory, saveRegisterDraft, loadRegisterDraft, clearRegisterDraft, clearActorRecovery, RECOVERY_TTL_MS,
  saveEditorDraft, loadEditorDraft,
} from "../../src/lib/takeoffRecovery.js";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 600)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);

// ── a small in-memory IndexedDB (enough for takeoffRecovery.js) ─────────────────────────────────
function fakeIndexedDb() {
  const data = new Map();
  const later = (fn, ms = 0) => setTimeout(fn, ms);
  const request = (run) => { const r = {}; later(() => { try { r.result = run(); r.onsuccess?.(); } catch (e) { r.error = e; r.onerror?.(); } }); return r; };
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => ({ createIndex: () => {} }),
    transaction: () => {
      const t = {};
      const store = {
        put: (rec) => request(() => { data.set(rec.key, structuredClone(rec)); }),
        get: (k) => request(() => (data.has(k) ? structuredClone(data.get(k)) : undefined)),
        delete: (k) => request(() => { data.delete(k); }),
        getAll: () => request(() => [...data.values()].map((v) => structuredClone(v))),
      };
      t.objectStore = () => store;
      later(() => t.oncomplete?.(), 15);
      return t;
    },
  };
  return { data, open: () => { const r = { result: db }; later(() => { r.onupgradeneeded?.(); r.onsuccess?.(); }); return r; } };
}
const idb = fakeIndexedDb();
_setIndexedDbFactory(idb);

// ── fixtures ────────────────────────────────────────────────────────────────────────────────────
const sync = (v) => ({ table: "register_items", version: v });
const bench = makeItem({ id: "i_bench", itemKind: "selection", category: "benchtop", description: "Stone", sync: sync(1) });
const tile = makeItem({ id: "i_tile", itemKind: "selection", category: "wall_tiles", description: "Subway", sync: sync(1) });
const meta = emptyMeta({ planRev: "Rev A", rev: 3 });
const server = { meta, items: [bench, tile] };
const ACTOR = "staff:u1", LEAD = "lead-1";

section("What gets kept on the device");
{
  const reg = { meta: emptyMeta({ ...meta, planRev: "Rev B" }), items: [makeItem({ ...bench, description: "Marble" }), tile] };
  const d = registerDraftOf({ reg, baseMeta: meta, baseItems: new Map(server.items.map((i) => [i.id, i])), dirtyIds: ["i_bench"].values(), metaDirty: true });
  ok("only the unsaved item, with the copy it started from", d.items.length === 1 && d.items[0].mine.description === "Marble" && d.items[0].base.description === "Stone");
  ok("the project details, when they're unsaved", d.meta?.mine.planRev === "Rev B" && d.meta.base.planRev === "Rev A");
  ok("nothing unsaved is an empty draft", draftIsEmpty(registerDraftOf({ reg, baseMeta: meta, baseItems: new Map(), dirtyIds: [].values(), metaDirty: false })));
}

section("Restoring onto the current server copy");
const draft = {
  meta: { base: meta, mine: emptyMeta({ ...meta, planRev: "R05 staging drawing reference Rev B" }) },
  items: [{ base: bench, mine: makeItem({ ...bench, description: "Marble" }) }],
};
{
  const p = planRegisterRestore(draft, server);
  ok("my unsaved drawing reference comes back (the Tab 26 case)", p.reg.meta.planRev === "R05 staging drawing reference Rev B" && p.metaTouched);
  ok("my unsaved item comes back", p.reg.items.find((i) => i.id === "i_bench").description === "Marble" && p.touchedIds.includes("i_bench"));
  ok("it saves against the server's current version, so its checks still apply", p.reg.items.find((i) => i.id === "i_bench").sync.version === 1 && p.reg.meta.rev === 3);
  ok("nothing else is touched", p.reg.items.find((i) => i.id === "i_tile") === tile && p.touchedIds.length === 1);
}
{
  const landed = { meta: emptyMeta({ ...meta, planRev: "R05 staging drawing reference Rev B", rev: 4 }), items: [makeItem({ ...bench, description: "Marble", sync: sync(2) }), tile] };
  const p = planRegisterRestore(draft, landed);
  ok("if the exit save actually landed, there's nothing to restore", p.nothingToRestore && p.reg === landed);
}
{
  const elsewhere = { meta: emptyMeta({ ...meta, planRev: "Rev C from the office", rev: 5 }), items: [makeItem({ ...bench, description: "Quartz", sync: sync(2) }), tile] };
  const p = planRegisterRestore(draft, elsewhere);
  ok("a value changed elsewhere since keeps the latest value", p.reg.meta.planRev === "Rev C from the office" && p.reg.items.find((i) => i.id === "i_bench").description === "Quartz");
  ok("and says so", p.conflicts.length === 2 && p.conflicts.some((c) => /planRev/.test(c)) && p.conflicts.some((c) => /description/.test(c)), p.conflicts.join(" | "));
}
{
  const otherField = { meta, items: [makeItem({ ...bench, colour: "White", sync: sync(2) }), tile] };
  const p = planRegisterRestore({ items: draft.items }, otherField);
  const b = p.reg.items.find((i) => i.id === "i_bench");
  ok("a different field changed elsewhere: mine goes on top of theirs, with their version", b.description === "Marble" && b.colour === "White" && b.sync.version === 2 && !p.conflicts.length);
}
{
  const p = planRegisterRestore(draft, { meta, items: [tile] });
  ok("an item removed elsewhere isn't brought back, and is reported", !p.reg.items.some((i) => i.id === "i_bench") && p.removed.length === 1);
}
{
  const fresh = makeItem({ id: "i_new", itemKind: "requirement", description: "Keep the fireplace", sync: null });
  const p = planRegisterRestore({ items: [{ base: null, mine: fresh }] }, server);
  ok("an item created here and never saved comes back as new", p.reg.items.some((i) => i.id === "i_new" && i.sync == null) && p.touchedIds.includes("i_new"));
}
ok("an empty draft restores nothing", planRegisterRestore({ meta: null, items: [] }, server).nothingToRestore);
{
  // An offer left unanswered while the same item is edited again: both are kept, the earlier replayed first (review fix).
  const earlier = { meta: { base: meta, mine: emptyMeta({ ...meta, planRev: "Rev B" }) }, items: [{ base: bench, mine: makeItem({ ...bench, description: "Marble" }) }] };
  const nowDraft = { meta: null, items: [{ base: bench, mine: makeItem({ ...bench, colour: "White" }) }], earlier };
  ok("a draft holding only an earlier offer isn't empty", !draftIsEmpty({ meta: null, items: [], earlier }));
  const p = planRegisterRestore(nowDraft, server);
  const b = p.reg.items.find((i) => i.id === "i_bench");
  ok("both visits' edits to the same item come back", b.description === "Marble" && b.colour === "White", JSON.stringify({ d: b.description, c: b.colour }));
  ok("and the earlier visit's project details", p.reg.meta.planRev === "Rev B" && p.metaTouched);
  ok("once each, with the server's version", p.touchedIds.filter((x) => x === "i_bench").length === 1 && b.sync.version === 1);
}
ok("the merge is the store's own (unchanged behaviour)", mergeItem(bench, makeItem({ ...bench, description: "Marble" }), bench).item.description === "Marble");

section("Kept on this device, per person and lead");
{
  ok("saving needs a person and a lead", (await saveRegisterDraft({ actorKey: null, leadId: LEAD, draft })).ok === false);
  ok("save", (await saveRegisterDraft({ actorKey: ACTOR, leadId: LEAD, draft })).ok);
  const back = await loadRegisterDraft(ACTOR, LEAD);
  ok("load gives the same draft back", back.record?.draft.meta.mine.planRev === "R05 staging drawing reference Rev B" && back.record.kind === "register");
  ok("another person on the same device sees nothing", !(await loadRegisterDraft("staff:u2", LEAD)).record);
  ok("another lead sees nothing", !(await loadRegisterDraft(ACTOR, "lead-2")).record);
  await saveRegisterDraft({ actorKey: ACTOR, leadId: LEAD, draft: { meta: null, items: [] } });
  ok("saving an empty draft clears it", !(await loadRegisterDraft(ACTOR, LEAD)).record);
  await saveRegisterDraft({ actorKey: ACTOR, leadId: LEAD, draft: { meta: null, items: [], earlier: draft } });
  ok("a draft holding only an earlier offer is kept", !!(await loadRegisterDraft(ACTOR, LEAD)).record);
  await saveRegisterDraft({ actorKey: ACTOR, leadId: LEAD, draft });
  await clearRegisterDraft(ACTOR, LEAD);
  ok("clear removes it", !(await loadRegisterDraft(ACTOR, LEAD)).record);
  await saveRegisterDraft({ actorKey: ACTOR, leadId: LEAD, draft });
  const k = `register|${ACTOR}|${LEAD}`;
  idb.data.set(k, { ...idb.data.get(k), savedAt: Date.now() - RECOVERY_TTL_MS - 1000 });
  ok("a draft older than 7 days is ignored and removed", !(await loadRegisterDraft(ACTOR, LEAD)).record && !idb.data.has(k));
  await saveRegisterDraft({ actorKey: ACTOR, leadId: LEAD, draft });
  await saveRegisterDraft({ actorKey: "staff:u2", leadId: LEAD, draft });
  await saveEditorDraft({ actorKey: ACTOR, workspaceId: "w1", materialId: "m1", draft: { points: [] } });
  await clearActorRecovery(ACTOR);
  ok("signing out clears that person's register drafts, with their takeoff ones", !(await loadRegisterDraft(ACTOR, LEAD)).record && !(await loadEditorDraft(ACTOR, "w1", "m1")).record);
  ok("and leaves another person's alone", !!(await loadRegisterDraft("staff:u2", LEAD)).record);
}
{
  _setIndexedDbFactory({ open: () => { throw new Error("blocked"); } });
  ok("no storage (private mode): it says so instead of breaking", (await saveRegisterDraft({ actorKey: ACTOR, leadId: LEAD, draft })).ok === false && (await loadRegisterDraft(ACTOR, LEAD)).record === null);
  _setIndexedDbFactory(idb);
}

section("The register store uses it");
const hook = readFileSync(new URL("../../src/components/sales/lead-detail/register/useRegister.js", import.meta.url), "utf8");
const workshop = readFileSync(new URL("../../src/components/sales/lead-detail/register/RegisterWorkshop.jsx", import.meta.url), "utf8");
ok("the leave warning is still there", /addEventListener\("beforeunload"/.test(hook));
ok("leaving the page also saves, asking the browser to finish it", /addEventListener\("pagehide"/.test(hook) && /keepalive: true/.test(hook));
ok("only a small save asks for that (browsers refuse keepalive bodies over 64 KB), and a hidden tab saves normally", /keepalive && JSON\.stringify\(body\)\.length < 60000/.test(hook) && /visibilityState === "hidden"\) flushRef\.current\(\); \}/.test(hook));
ok("an unanswered offer is kept alongside this visit's edits", /\{ \.\.\.now, earlier: offered \}/.test(hook));
ok("every edit is kept on the device as it's made", /if \(metaTouched\) metaSeq\.current \+= 1;\s*persistDraft\(\);/.test(hook));
ok("a draft is offered, never applied while loading", /setRecovery\(\{ savedAt/.test(hook) && !/commit\(plan\.reg[^\n]*\n[^\n]*return r\.data/.test(hook));
ok("restore goes through the normal save path", /commit\(plan\.reg, plan\.touchedIds, plan\.metaTouched\)/.test(hook));
ok("signing out can find this person's drafts", /rememberActor\(actorKey\)/.test(hook));
ok("the workshop offers Restore and Discard", /register-recovery-restore/.test(workshop) && /register-recovery-discard/.test(workshop) && /actorKey: profile\?\.id \? `staff:\$\{profile\.id\}`/.test(workshop));

console.log(`\nregister-draft-recovery: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
