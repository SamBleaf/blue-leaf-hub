/**
 * registerMerge.js — the Master Register's three-way merge, shared by the live store (useRegister) and the
 * recovery of unsaved edits after a reload (Tab 26 R05 retest). Pure: no React, no network.
 *
 * base = the copy the edit started from, mine = the local edit, theirs = the server's copy now.
 * Fields only I changed are re-applied on top of theirs; fields both sides changed keep theirs and are reported.
 */
import { makeItem, emptyMeta, mergeBaseline, editOutrunsApproval } from "./register.js";

export const ITEM_FIELDS = Object.keys(makeItem({})).filter((k) => !["id", "kind", "sync", "createdAt", "updatedAt"].includes(k));
export const META_FIELDS = ["planRev", "occupancy", "renovationOverlay", "scopeAreas", "lastRoomId", "lastStep", "floors"];
export const ROOM_FIELDS = ["level", "name", "roomType", "scope", "order", "sheet", "defaultConfirmations"];
export const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Three-way merge of one item. Returns { item, conflicts: [field] }. */
export function mergeItem(base, mine, theirs) {
  if (!theirs) return { item: null, conflicts: [] };
  if (!base) return { item: makeItem({ ...theirs, ...pickChanged(makeItem({}), mine), sync: theirs.sync }), conflicts: [] };
  const out = { ...theirs };
  const conflicts = [];
  for (const f of ITEM_FIELDS) {
    if (same(mine[f], base[f])) continue;                 // I didn't touch it → keep theirs
    if (same(theirs[f], base[f]) || same(theirs[f], mine[f])) out[f] = mine[f];
    else conflicts.push(f);                               // both changed → theirs wins, tell the user
  }
  return { item: makeItem({ ...out, sync: theirs.sync }), conflicts };
}
export function pickChanged(blank, mine) {
  const out = {};
  for (const f of ITEM_FIELDS) if (!same(mine[f], blank[f])) out[f] = mine[f];
  return out;
}
export function mergeMeta(base, mine, theirs, onBaselineConflict) {
  const out = { ...theirs };
  for (const f of META_FIELDS) if (!same(mine[f], base[f]) && (same(theirs[f], base[f]))) out[f] = mine[f];
  // The guide holds eleven separate values. Merged whole, one person's Roof would silently drop another's Walls.
  const guide = mergeBaseline(base.baseline, mine.baseline, theirs.baseline);
  out.baseline = guide.baseline;
  if (guide.conflicts.length) onBaselineConflict?.(guide.conflicts);
  const baseRooms = new Map((base.rooms || []).map((r) => [r.id, r]));
  const theirRooms = new Map((theirs.rooms || []).map((r) => [r.id, r]));
  const rooms = [];
  for (const r of mine.rooms || []) {
    const b = baseRooms.get(r.id), t = theirRooms.get(r.id);
    if (!b) { rooms.push(r); continue; }                  // added by me
    if (!t) continue;                                     // deleted elsewhere
    const m = { ...t };
    for (const f of ROOM_FIELDS) if (!same(r[f], b[f]) && same(t[f], b[f])) m[f] = r[f];
    rooms.push(m);
  }
  for (const t of theirs.rooms || []) {                   // added elsewhere, or I never had it
    if (!rooms.some((r) => r.id === t.id) && !(baseRooms.has(t.id) && !(mine.rooms || []).some((r) => r.id === t.id))) rooms.push(t);
  }
  out.rooms = distinctRoomOrder(rooms.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));   // a stable sort: ties keep my order first
  return emptyMeta({ ...out, rev: theirs.rev });
}

/**
 * Rooms in list order with no two sharing an order. Two rooms added at once on two screens both take the next number;
 * after the merge the later one moves down by one, and so does anything it then meets. Orders that are already
 * distinct and rising are kept exactly (gaps too), so a merge never rewrites rooms nobody touched.
 */
export function distinctRoomOrder(rooms) {
  let last = -Infinity;
  return (rooms || []).map((r) => {
    const o = Number.isFinite(r.order) && r.order > last ? r.order : (last === -Infinity ? 0 : last + 1);
    last = o;
    return o === r.order ? r : { ...r, order: o };
  });
}

// ── Recovery of unsaved edits (device-local; see takeoffRecovery.js saveRegisterDraft) ──────────────

/** What is still unsaved, with the copy each edit started from. Deletes are deliberately not kept. */
export function registerDraftOf({ reg, baseMeta, baseItems, dirtyIds, metaDirty }) {
  if (!reg) return { meta: null, items: [] };
  // A record never saved (created here, or put back by Undo after its delete reached the server) keeps the id of the record
  // before it, so a restore after a reload puts it back in its place, not at the end (round 5, K5).
  const items = [...dirtyIds].map((id) => reg.items.find((i) => i.id === id)).filter(Boolean)
    .map((mine) => {
      const base = baseItems.get(mine.id) || null;
      if (base) return { base, mine };
      const k = reg.items.findIndex((i) => i.id === mine.id);
      return { base, mine, after: k > 0 ? reg.items[k - 1].id : null };
    });
  return { meta: metaDirty && baseMeta ? { base: baseMeta, mine: reg.meta } : null, items };
}
export const draftIsEmpty = (d) => !d || (!d.meta && !(d.items || []).length && draftIsEmpty(d.earlier));

/**
 * Plan a restore of a saved draft on top of what the screen holds now (`current`, freshly loaded, with the
 * server's sync versions). Never writes anything: the caller commits the result through the normal autosave,
 * so the server's version checks and guards still decide. Fields changed elsewhere since keep the current value.
 * Returns { reg, touchedIds, metaTouched, conflicts: [text], removed: [title], nothingToRestore }.
 */
export function planRegisterRestore(draft, current, titleOf = (i) => i.description || i.id) {
  const empty = { reg: current, touchedIds: [], metaTouched: false, conflicts: [], removed: [], nothingToRestore: true, addedIds: [] };
  if (draftIsEmpty(draft) || !current) return empty;
  // An earlier visit's draft, kept while its offer was unanswered: replay it first, then this visit's edits on top.
  if (draft.earlier) {
    const first = planRegisterRestore(draft.earlier, current, titleOf);
    const then = planRegisterRestore({ meta: draft.meta, items: draft.items }, first.reg, titleOf);
    const touchedIds = [...new Set([...first.touchedIds, ...then.touchedIds])];
    const metaTouched = first.metaTouched || then.metaTouched;
    const nothing = !touchedIds.length && !metaTouched;
    return { reg: nothing ? current : then.reg, touchedIds, metaTouched, conflicts: [...first.conflicts, ...then.conflicts], removed: [...first.removed, ...then.removed], nothingToRestore: nothing, addedIds: [...first.addedIds, ...then.addedIds] };
  }
  const now = new Map(current.items.map((i) => [i.id, i]));
  const touchedIds = [], conflicts = [], removed = [];
  const added = [];
  for (const { base, mine, after } of draft.items || []) {
    if (!mine?.id) continue;
    const theirs = now.get(mine.id);
    if (!theirs) {
      if (base) { removed.push(titleOf(mine)); continue; }       // it existed and was removed elsewhere
      added.push({ item: makeItem({ ...mine, sync: null }), ...(after === undefined ? {} : { after }) }); touchedIds.push(mine.id); continue;   // created here, never saved
    }
    const { item, conflicts: fields } = mergeItem(base, mine, theirs);
    if (fields.length) conflicts.push(`“${titleOf(mine)}” was also changed elsewhere (${fields.join(", ")}). The latest value is kept.`);
    if (ITEM_FIELDS.some((f) => !same(item[f], theirs[f]))) { now.set(mine.id, item); touchedIds.push(mine.id); }
  }
  let meta = current.meta, metaTouched = false;
  if (draft.meta?.base && draft.meta?.mine) {
    const { base, mine } = draft.meta;
    const both = META_FIELDS.filter((f) => !same(mine[f], base[f]) && !same(current.meta[f], base[f]) && !same(current.meta[f], mine[f]));
    if (both.length) conflicts.push(`Project details were also changed elsewhere (${both.join(", ")}). The latest value is kept.`);
    const merged = mergeMeta(base, mine, current.meta, (keys) => conflicts.push(`The pricing guide was also changed elsewhere (${keys.join(", ")}). The latest value is kept.`));
    if (!same({ ...merged, rev: null }, { ...current.meta, rev: null })) { meta = merged; metaTouched = true; }
  }
  let items = current.items.map((i) => now.get(i.id));
  const placed = [];
  for (const { item, after } of added) {
    // Straight after the record that was before it (first when none), else at the end (an older draft holds no place).
    const k = after === null ? 0 : after === undefined ? -1 : items.findIndex((x) => x.id === after) + 1 || -1;
    items = k < 0 ? [...items, item] : [...items.slice(0, k), item, ...items.slice(k)];
    placed.push(item.id);
  }
  const nothingToRestore = !touchedIds.length && !metaTouched;
  return { reg: nothingToRestore ? current : { meta, items }, touchedIds, metaTouched, conflicts, removed, nothingToRestore, addedIds: placed };
}

// ── Approval kept for the visit, Undo of a delete, the meta after a save (pure; useRegister uses them) ──────

/**
 * B3: the words boxes save on every keystroke, so the first character typed into an approved record steps it back to
 * Proposed (register.editOutrunsApproval). The store keeps the approved copy for the visit. When a later edit puts back
 * exactly what the client approved (the same words, ignoring spaces and case, the same answer, the same product) and
 * the record is still the stepped-back one (Proposed, no evidence), its approval and evidence come back.
 * Returns { certainty, evidence } to put back, or null.
 */
export function approvalRestore(approved, next) {
  if (!approved || !next || approved.certainty !== "client_approved" || approved.id !== next.id) return null;
  if (next.certainty !== "proposed" || next.evidence || next.itemKind !== approved.itemKind) return null;
  const rest = { ...next };
  delete rest.certainty; delete rest.evidence;     // compared as an edit: an edit that sets the certainty never outruns it
  return editOutrunsApproval(approved, rest) ? null : { certainty: approved.certainty, evidence: approved.evidence };
}

/**
 * One edit to one record, as the store applies it (useRegister.updateItem). item = the record on screen, partial = the
 * edit, kept = the approved copy held for this record since an earlier edit stepped it back (or null).
 * Returns { partial, keep, stepped, restored }:
 *   - stepped: the edit goes beyond what the client approved, so it is back to Proposed (no evidence); keep = item;
 *   - restored: the edit puts back what the client approved, so the approval and its evidence come back; keep = null;
 *   - an edit that sets the certainty itself (approved again with new evidence, or another step) ends the kept copy: keep = null;
 *   - otherwise keep is undefined (leave the kept copy as it is).
 */
export function approvalStep(item, partial, kept = null) {
  if (!item || !partial) return { partial, keep: undefined, stepped: false, restored: false };
  if ("certainty" in partial) return { partial, keep: kept ? null : undefined, stepped: false, restored: false };
  if (editOutrunsApproval(item, partial)) return { partial: { ...partial, certainty: "proposed", evidence: null }, keep: item, stepped: true, restored: false };
  const back = kept ? approvalRestore(kept, makeItem({ ...item, ...partial, sync: item.sync })) : null;
  if (back) return { partial: { ...partial, ...back }, keep: null, stepped: false, restored: true };
  return { partial, keep: undefined, stepped: false, restored: false };
}

/**
 * R18: the meta a save's answer leaves this screen on, as the copy its next edits start from. Its rev is the one the
 * next save sends. sent = the meta the save carried (at rev r), or null; answer = the meta in the server's answer;
 * changedSince = this screen changed the meta while the save travelled; before = the copy it held before the save.
 *   - A save that carried the meta at r was accepted only at r, so the server then holds r + 1: an answer at r + 1 is
 *     this save's own, and is used as it is.
 *   - An answer read before the save (rev ≤ r) would leave the screen on the old room list and send r again next time,
 *     which the server refuses as changed elsewhere. Then what was sent is what the server holds, at r + 1.
 *   - An answer past r + 1 also holds another screen's save, made straight after this one (round 3, S2). With nothing
 *     changed here since, it is used as it is. With edits made here since, they were made on what was sent, so the
 *     copy stays what was sent, at r + 1: the next save then meets "changed elsewhere" and goes through the three-way
 *     merge, instead of carrying the newer rev and writing this screen's room list over the other screen's.
 *   - Nothing sent: an answer whose rev moved on (another screen saved) is used as it is unless edits were made here
 *     since, which keep the copy they started from (before), for the same reason.
 */
export function metaAfterSave(sent, answer, { changedSince = false, before = null } = {}) {
  if (!answer) return answer;
  const got = Number(answer.rev) || 0;
  if (!sent) return changedSince && before && (Number(before.rev) || 0) !== got ? before : answer;
  const r = Number(sent.rev) || 0;
  if (got === r + 1 || (got > r + 1 && !changedSince)) return answer;
  return emptyMeta({ ...sent, rev: r + 1 });
}

/** Where a record goes back in a list of ids: straight after the last of `before` still on it (first, when none is). */
function slotAfter(ids, before) {
  const was = new Set(before);
  for (let k = ids.length - 1; k >= 0; k--) if (was.has(ids[k])) return k + 1;
  return 0;
}

/**
 * Where deleted records go back on Undo (round 3, S3), for records about to be deleted from `items`: id → the ids of
 * everything before it in the list. Records deleted earlier and not put back yet (ghosts: [{ id, before }]) are
 * counted in their old places, so each record's `before` holds everything that was before it at first. Undo puts it
 * straight after the last of those still on the list, so deletes undone in any order come back in their old order
 * (a list abcde, b then d deleted, undone b then d, or d then b: abcde). An id not on the list is left out.
 */
export function deletedPlaces(items, ids, ghosts = []) {
  let all = (items || []).map((i) => i.id);
  for (const g of ghosts || []) {
    if (!g?.id || !Array.isArray(g.before) || all.includes(g.id)) continue;
    const k = slotAfter(all, g.before);
    all = [...all.slice(0, k), g.id, ...all.slice(k)];
  }
  const out = new Map();
  for (const id of ids || []) { const k = all.indexOf(id); if (k >= 0) out.set(id, all.slice(0, k)); }
  return out;
}

/**
 * Undo of a delete (B1): the very record comes back, under its own id, so links to it (linked records, room confirmations,
 * source documents) still hold. pending = the stored copy the store keeps for a delete not yet saved, null once the delete
 * reached the server (or for a record that was never saved); flying = that delete is in the save on its way now;
 * before = the ids that were before it (deletedPlaces): it goes back straight after the last of them still on the list,
 * so several deletes undone in any order keep their old order. at = an index instead (the end when neither is known).
 * base = the copy the record was deleted from (its version), so a server copy that moved on meanwhile is merged, not overwritten.
 * Returns { item, dirty, items } (dirty: it must be saved again; items: the list with it back), or null when the record
 * is already there.
 */
export function planUndelete(item, { current = null, pending = null, flying = false, before = null, at = null, base = null } = {}) {
  const list = current?.items || [];
  if (!item?.id || list.some((i) => i.id === item.id)) return null;
  let plan;
  if (pending) {
    // Round 5 (K3): when the server's copy moved on while the delete waited (a save's answer, or another screen's edit read
    // in meanwhile), the screen's older copy is not written over it: the record comes back as a three-way merge of what
    // this screen changed (base = the copy it was deleted from) on the server's copy, so another screen's edit is kept.
    const moved = !!base && !!pending.sync && !same(base.sync?.version, pending.sync.version);
    const basis = moved ? mergeItem(base, item, pending).item : item;
    const back = makeItem({ ...basis, sync: pending.sync });
    // Not sent yet: the delete is simply dropped, and only edits made before it need saving. Sent: the save under way may
    // remove it, so it is saved again (as new, same id, if the server did remove it: useRegister's save answer).
    plan = { item: back, dirty: flying || ITEM_FIELDS.some((f) => !same(back[f], pending[f])) };
  } else {
    plan = { item: makeItem({ ...item, sync: null }), dirty: true };   // the server no longer has it: put back as new, same id
  }
  const k = Array.isArray(before) ? slotAfter(list.map((i) => i.id), before)
    : Number.isInteger(at) && at >= 0 ? Math.min(at, list.length) : list.length;
  return { ...plan, items: [...list.slice(0, k), plan.item, ...list.slice(k)] };
}

/**
 * Round 4 (U1): the position hint a record put back by Undo is saved with, once its delete has reached the server (it is
 * saved again as new, and the server would otherwise add it at the end): the id now before it in the list, or null when
 * it is first. The server uses it for the stored order only (registerStore placeHints) and never stores it.
 */
export function placeHint(items, id) {
  const k = (items || []).findIndex((i) => i.id === id);
  return k > 0 ? items[k - 1].id : null;
}

/**
 * Round 4 (U1): a record kept on screen that a save's answer doesn't hold (Undo put it back while its delete travelled):
 * it goes straight after the nearest record before it on the screen (localIds, in order) that the answer holds, or first
 * when none is, so the answer doesn't move it to the end. Returns the new list.
 */
export function insertInPlace(list, item, localIds) {
  const k = (localIds || []).indexOf(item.id);
  if (k < 0) return [...list, item];
  for (let j = k - 1; j >= 0; j--) {
    const at = list.findIndex((x) => x.id === localIds[j]);
    if (at >= 0) return [...list.slice(0, at + 1), item, ...list.slice(at + 1)];
  }
  return [item, ...list];
}

/**
 * Round 4 (U2): a save's answer, minus the records deleted here while it travelled (pending = the store's deletes not
 * yet saved, id → copy; sentDeletes = the ids whose delete this save carried). Such a record is still on the server (the
 * save may even have carried an edit of it, which bumped its version), but it must not come back on screen while its
 * delete waits, or Undo finds it already there and the next save deletes a record the screen shows. Returns
 * { items, stillDeleting: id → the server's copy now }: the pending delete goes with that copy's version.
 */
export function withoutPendingDeletes(serverItems, pending, sentDeletes = new Set()) {
  const stillDeleting = new Map();
  const items = [];
  for (const s of serverItems || []) {
    if (pending?.has(s.id) && !sentDeletes.has(s.id)) stillDeleting.set(s.id, s);
    else items.push(s);
  }
  return { items, stillDeleting };
}

// ── The store's save words (pure, so they can be tested without React; useRegister uses them) ─────────────

export const SAVE_RETRY_WORDS = "Not saved — retrying";

/**
 * How a failed save is reported: { message, retry }. Never the browser's own text ("Failed to fetch"): offline, or a
 * gateway page instead of the Hub's answer, reads "Not saved — retrying" and is tried again. The Hub's own refusal is
 * already plain English (apiResponse.mjs) and is shown as it is, with no automatic retry.
 */
export function saveFailure(r) {
  if (!r || r.network) return { message: SAVE_RETRY_WORDS, retry: true };
  const own = typeof r.body?.error === "string" ? r.body.error.trim() : "";
  if (own) return { message: own, retry: false };
  if (!r.status || r.status >= 500) return { message: SAVE_RETRY_WORDS, retry: true };
  return { message: "Not saved — press Save to try again", retry: false };
}

/**
 * The save state of the brief's own details (rooms, floors, work words, drawings: the meta block), from the store's
 * edit counters: 'dirty' | 'saving' | 'error' | 'saved'. seq = edits made, sent = edits in the last batch sent,
 * saved = edits the server has, saving = a batch is in flight, state = the store's overall save state.
 */
export function metaSaveState({ seq = 0, sent = 0, saved = 0, saving = false, state = "idle" } = {}) {
  if (seq === saved) return "saved";
  if (state === "error") return "error";
  if (saving && sent === seq) return "saving";
  return "dirty";
}
