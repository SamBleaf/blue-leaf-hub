/**
 * registerMerge.js — the Master Register's three-way merge, shared by the live store (useRegister) and the
 * recovery of unsaved edits after a reload (Tab 26 R05 retest). Pure: no React, no network.
 *
 * base = the copy the edit started from, mine = the local edit, theirs = the server's copy now.
 * Fields only I changed are re-applied on top of theirs; fields both sides changed keep theirs and are reported.
 */
import { makeItem, emptyMeta, mergeBaseline } from "./register.js";

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
  const items = [...dirtyIds].map((id) => reg.items.find((i) => i.id === id)).filter(Boolean)
    .map((mine) => ({ base: baseItems.get(mine.id) || null, mine }));
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
  const empty = { reg: current, touchedIds: [], metaTouched: false, conflicts: [], removed: [], nothingToRestore: true };
  if (draftIsEmpty(draft) || !current) return empty;
  // An earlier visit's draft, kept while its offer was unanswered: replay it first, then this visit's edits on top.
  if (draft.earlier) {
    const first = planRegisterRestore(draft.earlier, current, titleOf);
    const then = planRegisterRestore({ meta: draft.meta, items: draft.items }, first.reg, titleOf);
    const touchedIds = [...new Set([...first.touchedIds, ...then.touchedIds])];
    const metaTouched = first.metaTouched || then.metaTouched;
    const nothing = !touchedIds.length && !metaTouched;
    return { reg: nothing ? current : then.reg, touchedIds, metaTouched, conflicts: [...first.conflicts, ...then.conflicts], removed: [...first.removed, ...then.removed], nothingToRestore: nothing };
  }
  const now = new Map(current.items.map((i) => [i.id, i]));
  const touchedIds = [], conflicts = [], removed = [];
  const added = [];
  for (const { base, mine } of draft.items || []) {
    if (!mine?.id) continue;
    const theirs = now.get(mine.id);
    if (!theirs) {
      if (base) { removed.push(titleOf(mine)); continue; }       // it existed and was removed elsewhere
      added.push(makeItem({ ...mine, sync: null })); touchedIds.push(mine.id); continue;   // created here, never saved
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
  const items = [...current.items.map((i) => now.get(i.id)), ...added];
  const nothingToRestore = !touchedIds.length && !metaTouched;
  return { reg: nothingToRestore ? current : { meta, items }, touchedIds, metaTouched, conflicts, removed, nothingToRestore };
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
