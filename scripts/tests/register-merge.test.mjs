/**
 * register-merge.test.mjs — the register store's pure rules in src/lib/registerMerge.js:
 *   - two rooms added at once on two screens never share an order after the merge (finding P10);
 *   - a failed save never shows the browser's own error text, and offline reads "Not saved — retrying" (N6);
 *   - the brief's own details (rooms, floors, work words) report their own save state to the room bar (N5);
 *   - Undo of several deletes, in any order, puts the records back in their old order (round 3, S3);
 *   - round 4: the position hint a record put back as new is saved with, where a save's answer keeps it (U1), and a
 *     record deleted while a save travels stays out of that save's answer (U2).
 * No server, no database. Run: node scripts/tests/register-merge.test.mjs
 */
import { readFileSync } from "node:fs";
import { emptyMeta, makeRoom, makeItem } from "../../src/lib/register.js";
import { mergeMeta, distinctRoomOrder, planRegisterRestore, registerDraftOf, saveFailure, metaSaveState, SAVE_RETRY_WORDS, deletedPlaces, planUndelete, placeHint, insertInPlace, withoutPendingDeletes } from "../../src/lib/registerMerge.js";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 600)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const orders = (meta) => meta.rooms.map((r) => `${r.id}:${r.order}`).join(" ");

section("Room order after a merge (P10)");
{
  const kitchen = makeRoom({ id: "k", name: "Kitchen", order: 0 });
  const living = makeRoom({ id: "l", name: "Living", order: 1 });
  const base = emptyMeta({ rooms: [kitchen, living] });
  // Both screens add the next room (#3) at the same time: both take order 2.
  const mine = emptyMeta({ rooms: [kitchen, living, makeRoom({ id: "bath", name: "Bathroom", order: 2 })] });
  const theirs = emptyMeta({ rooms: [kitchen, living, makeRoom({ id: "ldy", name: "Laundry", order: 2 })], rev: 4 });
  const merged = mergeMeta(base, mine, theirs);
  const os = merged.rooms.map((r) => r.order);
  ok("both added rooms are kept", merged.rooms.length === 4 && merged.rooms.some((r) => r.id === "bath") && merged.rooms.some((r) => r.id === "ldy"), orders(merged));
  ok("no two rooms share an order", new Set(os).size === os.length, orders(merged));
  ok("my room keeps its place first; theirs moves down one", orders(merged) === "k:0 l:1 bath:2 ldy:3", orders(merged));
  ok("the server's revision is kept", merged.rev === 4);

  const again = mergeMeta(base, mine, theirs);
  ok("the same merge gives the same order every time", orders(again) === orders(merged));

  // Orders that are already distinct (with gaps after a removal) are kept exactly.
  const gappy = emptyMeta({ rooms: [makeRoom({ id: "a", order: 0 }), makeRoom({ id: "b", order: 3 }), makeRoom({ id: "c", order: 7 })] });
  const kept = mergeMeta(gappy, gappy, gappy);
  ok("distinct orders are never rewritten (rooms nobody touched stay as they were)", orders(kept) === "a:0 b:3 c:7", orders(kept));

  // A run of clashes: each later room moves on past the one before it.
  const run = distinctRoomOrder([{ id: "a", order: 0 }, { id: "b", order: 1 }, { id: "c", order: 1 }, { id: "d", order: 2 }, { id: "e", order: 9 }]);
  ok("a run of clashes is resolved in list order", run.map((r) => r.order).join(",") === "0,1,2,3,9", JSON.stringify(run));
  ok("a room that already had a free order is the same object (nothing changes)", run[0].order === 0 && run[4].order === 9);
  ok("an empty list stays empty", distinctRoomOrder([]).length === 0 && distinctRoomOrder(null).length === 0);

  // P7: a floor added on the Rooms list (meta.floors) survives a merge with someone else's change.
  const fBase = emptyMeta({ rooms: [kitchen] });
  const fMine = emptyMeta({ rooms: [kitchen], floors: ["Upper"] });
  const fTheirs = emptyMeta({ rooms: [kitchen], planRev: "A102 Rev D", rev: 5 });
  const fMerged = mergeMeta(fBase, fMine, fTheirs);
  ok("my new floor is kept when someone else changed another detail", JSON.stringify(fMerged.floors) === JSON.stringify(["Upper"]) && fMerged.planRev === "A102 Rev D", JSON.stringify(fMerged.floors));

  // A restore of an unsaved room add on top of a room added elsewhere meanwhile.
  const current = { meta: emptyMeta({ rooms: [kitchen, living, makeRoom({ id: "ldy", name: "Laundry", order: 2 })], rev: 5 }), items: [] };
  const plan = planRegisterRestore({ meta: { base, mine }, items: [] }, current);
  const ro = plan.reg.meta.rooms.map((r) => r.order);
  ok("restoring an offline room add next to one added elsewhere: distinct orders too", plan.metaTouched && new Set(ro).size === ro.length && plan.reg.meta.rooms.length === 4, orders(plan.reg.meta));
}

section("Save failure words (N6)");
{
  const offline = saveFailure({ ok: false, error: "Failed to fetch", network: true });
  ok("offline: 'Not saved — retrying', and it is tried again", offline.message === SAVE_RETRY_WORDS && offline.retry === true && SAVE_RETRY_WORDS === "Not saved — retrying");
  ok("the browser's own text never shows", !/fetch|network/i.test(offline.message));
  const gateway = saveFailure({ ok: false, error: "Request failed (HTTP 502)", status: 502, body: null });
  ok("a gateway page instead of the Hub's answer reads the same and retries", gateway.message === SAVE_RETRY_WORDS && gateway.retry === true);
  const own = saveFailure({ ok: false, error: "The brief is too long to save in one go.", status: 400, body: { ok: false, error: "The brief is too long to save in one go." } });
  ok("the Hub's own plain-English refusal is shown as it is, with no automatic retry", own.message === "The brief is too long to save in one go." && own.retry === false);
  const ownServer = saveFailure({ ok: false, error: "Couldn't save the brief.", status: 500, body: { ok: false, error: "Couldn't save the brief." } });
  ok("a Hub 500 with its own words keeps them (unchanged behaviour)", ownServer.message === "Couldn't save the brief." && ownServer.retry === false);
  const bare = saveFailure({ ok: false, error: "Request failed (HTTP 413)", status: 413, body: null });
  ok("a refusal with no words of its own never shows 'HTTP'", !/HTTP|Request failed/.test(bare.message) && bare.retry === false, bare.message);
}

section("The room bar's save state for the brief's own details (N5)");
{
  ok("nothing changed: saved", metaSaveState({ seq: 3, sent: 3, saved: 3, saving: false, state: "saved" }) === "saved");
  ok("a Work tap not sent yet: dirty", metaSaveState({ seq: 4, sent: 3, saved: 3, saving: false, state: "dirty" }) === "dirty");
  ok("sent and in flight: saving", metaSaveState({ seq: 4, sent: 4, saved: 3, saving: true, state: "saving" }) === "saving");
  ok("changed again while a save is in flight: dirty, not saving", metaSaveState({ seq: 5, sent: 4, saved: 3, saving: true, state: "saving" }) === "dirty");
  ok("the save failed: error", metaSaveState({ seq: 4, sent: 4, saved: 3, saving: false, state: "error" }) === "error");
  ok("another record failed but the details saved: still saved", metaSaveState({ seq: 4, sent: 4, saved: 4, saving: false, state: "error" }) === "saved");
  ok("no arguments: saved", metaSaveState() === "saved");
}

section("Undo of several deletes keeps the old order (S3)");
{
  // The store's own steps, without React: a delete remembers its place (deletedPlaces, counting earlier deletes not yet
  // undone), an Undo puts the record back there (planUndelete with before) and forgets it.
  const shelf = () => {
    let list = [...ORIGINAL].map((id) => makeItem({ id }));
    const places = new Map();
    const ghosts = () => [...places].map(([id, before]) => ({ id, before }));
    return {
      ids: () => list.map((i) => i.id).join(""),
      del(ids) {
        for (const [id, before] of deletedPlaces(list, ids, ghosts())) places.set(id, before);
        list = list.filter((i) => !ids.includes(i.id));
      },
      undo(id) {
        const plan = planUndelete(makeItem({ id }), { current: { items: list }, before: places.get(id) ?? null });
        if (plan) list = plan.items;
        places.delete(id);
      },
      gone: () => [...places.keys()],
    };
  };
  const ORIGINAL = "abcdefg";
  const s1 = shelf(); s1.del(["b"]); s1.del(["d"]); s1.undo("b"); s1.undo("d");
  ok("abcdefg: b then d deleted, undone b then d → abcdefg (the old rule gave abdc…)", s1.ids() === ORIGINAL, s1.ids());
  const s2 = shelf(); s2.del(["b"]); s2.del(["c"]); s2.undo("b"); s2.undo("c");
  ok("…b then c (next to each other), undone in the same order → abcdefg", s2.ids() === ORIGINAL, s2.ids());
  ok("a record that was first goes back first", (() => { const s = shelf(); s.del(["a"]); s.del(["b"]); s.undo("b"); s.undo("a"); return s.ids(); })() === ORIGINAL);
  ok("deletedPlaces leaves out an id not on the list", deletedPlaces([makeItem({ id: "a" })], ["zz"]).size === 0);
  ok("with no place known the record goes to the end, as before", planUndelete(makeItem({ id: "x" }), { current: { items: [makeItem({ id: "a" })] } }).items.map((i) => i.id).join("") === "ax");

  // Any mix of single deletes, bulk removals and Undos, in any order, ends in the old order once everything is undone.
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  let bad = null;
  for (let run = 0; run < 400 && !bad; run++) {
    const s = shelf();
    for (let step = 0; step < 12; step++) {
      const on = s.ids().split("").filter(Boolean), gone = s.gone();
      const pick = rnd(3);
      if (on.length && pick === 0) s.del([on[rnd(on.length)]]);
      else if (on.length > 1 && pick === 1) { const a = on[rnd(on.length)], b = on[rnd(on.length)]; s.del([...new Set([a, b])]); }
      else if (gone.length) s.undo(gone[rnd(gone.length)]);
      const mid = s.ids();
      if (mid !== [...ORIGINAL].filter((c) => mid.includes(c)).join("")) { bad = `run ${run}: out of order on the way: ${mid}`; break; }
    }
    let gone = s.gone();
    while (gone.length) { s.undo(gone[rnd(gone.length)]); gone = s.gone(); }
    if (!bad && s.ids() !== ORIGINAL) bad = `run ${run}: ${s.ids()}`;
  }
  ok("400 random runs of deletes, bulk removals and Undos: always in the old order, on the way and at the end", !bad, bad);
}

section("Round 4: Undo's place once the delete reached the server (U1), and a delete made while a save travels (U2)");
{
  const L = ["a", "b", "c", "d"].map((id) => makeItem({ id }));
  ok("placeHint: the id now before the record", placeHint(L, "c") === "b");
  ok("…null when it is first, or not on the list", placeHint(L, "a") === null && placeHint(L, "zz") === null && placeHint(null, "a") === null);
  const ids = (l) => l.map((i) => i.id).join("");
  const answer = ["a", "c", "d"].map((id) => makeItem({ id }));
  ok("insertInPlace: after the nearest record before it on screen that the answer holds", ids(insertInPlace(answer, makeItem({ id: "b" }), ["a", "b", "c", "d"])) === "abcd");
  ok("…skipping records before it the answer doesn't hold", ids(insertInPlace(["a", "d"].map((id) => makeItem({ id })), makeItem({ id: "c" }), ["a", "b", "c", "d"])) === "acd");
  ok("…first when nothing before it is held", ids(insertInPlace(answer, makeItem({ id: "z" }), ["z", "a", "c", "d"])) === "zacd");
  ok("…at the end when the screen never had it", ids(insertInPlace(answer, makeItem({ id: "q" }), ["a", "c", "d"])) === "acdq");
  const server = ["a", "x", "b"].map((id) => makeItem({ id, sync: { mode: "lead", version: `v2-${id}` } }));
  const pending = new Map([["x", makeItem({ id: "x", sync: { mode: "lead", version: "v1-x" } })], ["b", makeItem({ id: "b" })]]);
  const w = withoutPendingDeletes(server, pending, new Set(["b"]));
  ok("withoutPendingDeletes: a record whose delete waits stays out of the answer", ids(w.items) === "ab");
  ok("…and its pending delete gets the server's copy now (its version)", w.stillDeleting.get("x")?.sync.version === "v2-x" && w.stillDeleting.size === 1);
  ok("…a delete this very save carried isn't held back (the server answered it)", w.items.some((i) => i.id === "b"));
  ok("…nothing pending, nothing held back", ids(withoutPendingDeletes(server, new Map()).items) === "axb");
}

section("The store and the header use them");
{
  const hook = readFileSync(new URL("../../src/components/sales/lead-detail/register/useRegister.js", import.meta.url), "utf8");
  const workshop = readFileSync(new URL("../../src/components/sales/lead-detail/register/RegisterWorkshop.jsx", import.meta.url), "utf8");
  ok("a failed save's words come from saveFailure (never r.error straight onto the screen)", /const failed = saveFailure\(r\)/.test(hook) && !/message: r\.error \|\|/.test(hook));
  ok("only a retryable failure is tried again", /if \(!failed\.retry\) return false;/.test(hook));
  ok("while it retries the words stay 'Not saved — retrying' (no Saving… flicker)", /s\.state === "error" && s\.message === SAVE_RETRY_WORDS \? s : \{ \.\.\.s, state: "saving" \}/.test(hook));
  ok("the store exposes metaState and saveAt", /saveAt, metaState,/.test(hook) && /metaSaveState\(\{ seq: metaSeq\.current/.test(hook));
  ok("RegisterWorkshop passes metaState, saveAt and onOpenRecord to the room screen", /metaState=\{store\.metaState\} saveAt=\{store\.saveAt\} onOpenRecord=/.test(workshop));
  ok("the header hides its save state while a room is open", /saveText && !\(open && roomShown\)/.test(workshop));
  ok("the header never says 'Unsaved…' or 'Save failed'", !/Unsaved…|"Save failed"/.test(workshop));
  ok("the Rooms list reports tick mode up", /onTickChange=\{onTickChange\}/.test(workshop) && /"data-register-room", live && step === "rooms" \? \(roomShown \? "open" : tickMode \? "tick" : null\)/.test(workshop));
  ok("an older context answer can't overwrite a newer one", /const n = \+\+ctxSeq\.current;[\s\S]*?if \(n !== ctxSeq\.current\) return;/.test(workshop));
  ok("the tabs say which one is current", /aria-current=\{step === s\.key \? "page" : undefined\}/.test(workshop) && /aria-label="Project brief steps"/.test(workshop));
  ok("Expand is offered from 768 px (the bottom nav shows below it)", /md:inline-flex" data-testid="register-expand"/.test(workshop) && !/sm:inline-block" data-testid="register-expand"/.test(workshop));
  ok("the full-width workspace isn't pushed down by a parent's margin", /fixed inset-0 z-40 !mt-0/.test(workshop));
  ok("the ⋯ menu holds the existing-building override, following the project type", /Ask about the existing building/.test(workshop) && /disabled=\{byType\}/.test(workshop) && /renovationOverlay: !reg\.meta\.renovationOverlay/.test(workshop));
  ok("the subline has no '—' placeholders, and the badge's words no system terms", !/Project type —|Drawings —/.test(workshop) && !/h: "[^"]*canonical/.test(workshop));
  ok("the badge shows on the Register and Handover tabs only", /MODE_BADGE_STEPS = new Set\(\["register", "handover"\]\)/.test(workshop));
}

section("Round 5 (K5): a record put back by Undo and restored from the device draft keeps its place");
{
  const mk = (id, extra = {}) => makeItem({ id, itemKind: "requirement", promptKey: "W-020", category: "notes", description: `Item ${id}`, ...extra });
  const baseItems = new Map(["a", "c", "d"].map((id) => [id, mk(id, { sync: { mode: "lead", version: "v1" } })]));
  const onScreen = { meta: emptyMeta({}), items: ["a", "b", "c", "d"].map((id) => (baseItems.get(id) || mk(id))) };   // b put back by Undo after its delete reached the server
  const draft = registerDraftOf({ reg: onScreen, baseMeta: onScreen.meta, baseItems, dirtyIds: ["b"], metaDirty: false });
  ok("the draft keeps the record that was before it", draft.items.length === 1 && draft.items[0].after === "a" && draft.items[0].base === null, JSON.stringify(draft.items.map((i) => i.after)));
  const reloaded = { meta: emptyMeta({}), items: ["a", "c", "d"].map((id) => baseItems.get(id)) };
  const plan = planRegisterRestore(draft, reloaded);
  ok("restored straight after it, not at the end", plan.reg.items.map((i) => i.id).join("") === "abcd" && plan.addedIds.join() === "b", plan.reg.items.map((i) => i.id).join(""));
  const first = registerDraftOf({ reg: { meta: onScreen.meta, items: ["b", "a", "c", "d"].map((id) => baseItems.get(id) || mk(id)) }, baseMeta: onScreen.meta, baseItems, dirtyIds: ["b"], metaDirty: false });
  ok("first on the list: restored first", planRegisterRestore(first, reloaded).reg.items.map((i) => i.id).join("") === "bacd");
  const gone = planRegisterRestore({ meta: null, items: [{ base: null, mine: mk("b"), after: "zzz" }] }, reloaded);
  ok("the record before it has gone: at the end", gone.reg.items.map((i) => i.id).join("") === "acdb");
  const old = planRegisterRestore({ meta: null, items: [{ base: null, mine: mk("b") }] }, reloaded);
  ok("an older draft holds no place: at the end, as before", old.reg.items.map((i) => i.id).join("") === "acdb");
  ok("an edit of a stored record carries no place", registerDraftOf({ reg: onScreen, baseMeta: onScreen.meta, baseItems, dirtyIds: ["c"], metaDirty: false }).items[0].after === undefined);
}

section("Round 5 (K3): Undo after the version refresh never writes the older copy over another screen's edit");
{
  const mk = (extra = {}) => makeItem({ id: "x", itemKind: "requirement", promptKey: "W-020", category: "notes", description: "Keep the lemon tree", ...extra });
  const base = mk({ sync: { mode: "lead", version: "v1" } });
  const shown = mk({ sync: { mode: "lead", version: "v1" } });                                            // what this screen showed when it was deleted
  const theirs = mk({ nextAction: "Ask about the fence", sync: { mode: "lead", version: "v2" } });          // another screen's edit, read in while the delete waited
  const cur = { items: [] };
  const plan = planUndelete(shown, { current: cur, pending: theirs, base });
  ok("the other screen's edit is kept, and nothing is written (no field of mine changed)", plan.item.nextAction === "Ask about the fence" && plan.dirty === false && plan.item.sync.version === "v2", JSON.stringify([plan.item.nextAction, plan.dirty]));
  const mine = mk({ description: "Keep the lemon tree and the fig", sync: { mode: "lead", version: "v1" } });
  const merged = planUndelete(mine, { current: cur, pending: theirs, base });
  ok("what this screen changed is kept on top, and saved", merged.item.description === "Keep the lemon tree and the fig" && merged.item.nextAction === "Ask about the fence" && merged.dirty === true);
  const same1 = planUndelete(shown, { current: cur, pending: base, base });
  ok("no refresh in between: as before (not dirty)", same1.dirty === false && same1.item.nextAction === "");
  const noBase = planUndelete(shown, { current: cur, pending: theirs });
  ok("without the base copy it behaves as before", noBase.item.nextAction === "" && noBase.dirty === true);
}

console.log(`\nregister-merge: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
