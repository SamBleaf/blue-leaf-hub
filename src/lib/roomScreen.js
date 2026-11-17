/**
 * roomScreen.js — the pure rules behind the Rooms list and the room screen (REGISTER_SCREENS_SPEC.md S2, S3, S3p;
 * owner approval 17 Nov 2026). No React, no network: the components in src/components/sales/lead-detail/register/
 * (RoomsList, RoomScreen, RoomBriefCard, ChoiceRow, HouseStrip) call these, and scripts/tests/register-rooms-ui.test.mjs
 * tests them on the real job.
 *
 *   Floors          normaliseFloor, floorKey, floorsOf, walkOrder, floorChoices
 *   Room list edits nextRoomName, addRoomMeta, duplicateRoomMeta, moveRoomToFloor, moveRoomStep, tickMoveMeta,
 *                   restoreLevels, renameRoomMeta, setRoomScope, removeRoomPlan, answerCount
 *   List rows       briefPreview, roomListRow, listCounts, workSummary, filterRooms, floorBlocks, actionsPillText, storeysNote
 *   List words      removeRoomText, addedText, duplicatedText, movedText, tickMoveLabel, tickCount
 *   Earlier answers earlierWords, workWordFor, keepWorkPlan, changeWorkPlan, readdable
 *   Room screen     roomPromptSet, roomLayout (which prompt goes in which group, and what no row shows), houseLinesFor,
 *                   stripView, exceptionSeedFrom, roomActionPoints, roomPosition, existingWorksFor, existingWorkSeed,
 *                   actionSeed, roomSaveState, flushWithin
 *   Room brief      briefSeed, standardBriefText, toggleAnswerList, connectedFrom, connectCandidates, usableNotedWords
 *   Words           adelaideDay, timeOfDay, saveWords, shortName
 *
 * Every transform returns new arrays; nothing here writes to the store. Room writes are whole room lists for one
 * mutateMeta call; a removal is a replaceItems function.
 */
import {
  makeRoom, promptsFor, partitionRoomPrompts, resolvePromptId, answerConfigFor, questionById, roomInheritedLines, roomLinesToConfirm,
  normaliseRoomConfirmations, normaliseAnswer, toggleOption, itemPatch, exceptionFieldsFrom, dispositionLabel,
  ROOM_SCOPES, ROOM_TYPES, ROOM_SCOPES_WITH_WORK, HIDDEN_ROOM_SCOPE_PROMPTS, ROOM_BRIEF_PROMPT, ROOM_MUST_HAVES, HIDDEN_OPTION_IDS,
  UNRESOLVED_REASONS, ANSWER_SCHEMA_VERSION,
} from "./register.js";
import {
  clean, lowerFirst, tidy, chipWords, roomBriefRecord, isUnfinished, disagreeingScope, scopeAgrees, floorLabel, openPoints, isOpenPoint, labelOf, recordWords,
} from "./briefModel.js";

/** The follow-up question whose records are the room's actions ("+ Needs action from…" adds one). */
export const ACTION_PROMPT = "R-010";

// ── Floors ─────────────────────────────────────────────────────────────────────────────────────────

const KNOWN_FLOOR = /^(lower ground|basement|ground|mezzanine|upper|first|second|third|lower)(?:\s+floor)?$/i;
const FLOOR_RANK = { basement: -2, "lower ground": -1, lower: -1, ground: 0, mezzanine: 0.5, upper: 1, first: 1, second: 2, third: 3 };

/** A floor as stored: trimmed, a capital first letter, " floor" dropped from a known name ("upper floor" → "Upper"). */
export function normaliseFloor(value) {
  let t = clean(value);
  if (!t) return "Ground";
  const m = KNOWN_FLOOR.exec(t);
  if (m) t = m[1].toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
/** Two spellings of one floor ("upper", "Upper", "UPPER") are one floor. */
export const floorKey = (value) => normaliseFloor(value).toLowerCase();

/**
 * The job's floors in building order (known names ranked, others after them in walk order), each with its rooms in
 * walk order. extra: floors to show even with no rooms yet (a floor just added). The first spelling seen is kept.
 */
export function floorsOf(rooms, extra = []) {
  const map = new Map();
  const add = (level, room, seq) => {
    const key = floorKey(level);
    if (!map.has(key)) map.set(key, { key, level: normaliseFloor(level), label: floorLabel(normaliseFloor(level)), rooms: [], seq });
    if (room) map.get(key).rooms.push(room);
  };
  (rooms || []).forEach((r, i) => add(r.level, r, i));
  extra.forEach((l, i) => add(l, null, 10000 + i));
  return [...map.values()].sort((a, b) => {
    const ra = FLOOR_RANK[a.key], rb = FLOOR_RANK[b.key];
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return a.seq - b.seq;
  });
}
/** Every room in walk order across floors: the order the list shows and Next / Previous follow. */
export const walkOrder = (rooms, extra = []) => floorsOf(rooms, extra).flatMap((f) => f.rooms);

/** The floor chips offered for a room: the job's floors, then Ground and Upper if they aren't there yet. */
export function floorChoices(rooms) {
  const floors = floorsOf(rooms, ["Ground", "Upper"]);
  return floors.map((f) => ({ level: f.level, label: f.label, key: f.key }));
}

// ── Room list edits (one mutateMeta call each) ─────────────────────────────────────────────────────

const reorder = (list) => list.map((r, i) => makeRoom({ ...r, order: i }));
/** A room's name without its number ("Bedroom 4" → "Bedroom"). */
export const baseName = (name) => clean(name).replace(/\s+\d+$/, "") || "Room";

/** The next free number for a room name across the job: "Bedroom" → "Bedroom 5" when Bedroom … Bedroom 4 exist. */
export function nextRoomName(rooms, name) {
  const base = baseName(name);
  const rx = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s+(\\d+))?$`, "i");
  let max = 0;
  for (const r of rooms || []) {
    const m = rx.exec(clean(r.name));
    if (m) max = Math.max(max, m[1] ? Number(m[1]) : 1);
  }
  return max ? `${base} ${max + 1}` : base;
}

/** Index after the last room on a floor, or the end of the list when the floor is empty. */
function endOfFloor(rooms, level) {
  const key = floorKey(level);
  let at = -1;
  rooms.forEach((r, i) => { if (floorKey(r.level) === key) at = i; });
  return at < 0 ? rooms.length : at + 1;
}
/** The spelling a floor already has on this job, so a chip joins the existing group. */
function floorSpelling(rooms, level) {
  const key = floorKey(level);
  const hit = (rooms || []).find((r) => floorKey(r.level) === key);
  return hit ? hit.level : normaliseFloor(level);
}

/** Add a room at the end of its floor: a numbered name, the chip's type and the Work word chosen once. */
export function addRoomMeta(rooms, { name, roomType = "generic", level = "Ground", scope }) {
  const list = (rooms || []).slice();
  const room = makeRoom({ name: nextRoomName(list, name), roomType, level: floorSpelling(list, level), scope });
  list.splice(endOfFloor(list, level), 0, room);
  const next = reorder(list);
  return { rooms: next, room: next.find((r) => r.id === room.id) };
}

/** Duplicate copies type, floor and Work only (never answers, the brief, the sheet or confirmations), placed directly below. */
export function duplicateRoomMeta(rooms, id) {
  const list = (rooms || []).slice();
  const at = list.findIndex((r) => r.id === id);
  if (at < 0) return { rooms: list, room: null, source: null };
  const src = list[at];
  const room = makeRoom({ name: nextRoomName(list, src.name), roomType: src.roomType, level: src.level, scope: src.scope });
  list.splice(at + 1, 0, room);
  const next = reorder(list);
  return { rooms: next, room: next.find((r) => r.id === room.id), source: src };
}

/** Move one room to a floor (a chip value), placed at the end of that floor. */
export function moveRoomToFloor(rooms, id, level) {
  const list = (rooms || []).slice();
  const at = list.findIndex((r) => r.id === id);
  if (at < 0) return list;
  const spelt = floorSpelling(list.filter((r) => r.id !== id), level);
  if (floorKey(list[at].level) === floorKey(spelt)) return list;
  const [room] = list.splice(at, 1);
  list.splice(endOfFloor(list, spelt), 0, { ...room, level: spelt });
  return reorder(list);
}

/** Move up / Move down: swap with the neighbouring room on the same floor. */
export function moveRoomStep(rooms, id, dir) {
  const list = (rooms || []).slice();
  const at = list.findIndex((r) => r.id === id);
  if (at < 0) return list;
  const key = floorKey(list[at].level);
  let j = at + dir;
  while (j >= 0 && j < list.length && floorKey(list[j].level) !== key) j += dir;
  if (j < 0 || j >= list.length) return list;
  [list[at], list[j]] = [list[j], list[at]];
  return reorder(list);
}

/** Drag on desktop: drop one room before another, taking that room's floor. */
export function dropRoomBefore(rooms, id, beforeId) {
  if (id === beforeId) return rooms;
  const list = (rooms || []).slice();
  const at = list.findIndex((r) => r.id === id);
  if (at < 0) return list;
  const [room] = list.splice(at, 1);
  const to = list.findIndex((r) => r.id === beforeId);
  if (to < 0) return rooms;
  list.splice(to, 0, { ...room, level: list[to].level });
  return reorder(list);
}

/** Tick mode: every ticked room to one floor, in one save. Returns the new list and what Undo puts back. */
export function tickMoveMeta(rooms, ids, level) {
  const tick = new Set(ids);
  const spelt = floorSpelling(rooms, level);
  const previous = {};
  const next = (rooms || []).map((r) => {
    if (!tick.has(r.id) || floorKey(r.level) === floorKey(spelt)) return r;
    previous[r.id] = r.level;
    return makeRoom({ ...r, level: spelt });
  });
  return { rooms: next, previous, moved: Object.keys(previous).length };
}
/** Undo a tick-mode move. */
export const restoreLevels = (rooms, previous) => (rooms || []).map((r) => (previous[r.id] != null ? makeRoom({ ...r, level: previous[r.id] }) : r));

export function renameRoomMeta(rooms, id, name) {
  const n = clean(name);
  if (!n) return rooms;
  return (rooms || []).map((r) => (r.id === id ? makeRoom({ ...r, name: n }) : r));
}
export const setRoomScope = (rooms, id, scope) => (rooms || []).map((r) => (r.id === id ? makeRoom({ ...r, scope }) : r));
export const patchRoom = (rooms, id, partial) => (rooms || []).map((r) => (r.id === id ? makeRoom({ ...r, ...partial }) : r));

/** How many records a room holds (the remove confirmation names them). */
export const answerCount = (register, id) => (register?.items || []).filter((i) => i.roomId === id).length;
/** Remove a room and its records: the replaceItems function (the existing ContextStep removal). */
export const removeRoomPlan = (id) => (cur) => ({
  ...cur,
  meta: { ...cur.meta, rooms: reorder((cur.meta.rooms || []).filter((r) => r.id !== id)) },
  items: cur.items.filter((i) => i.roomId !== id),
});

// ── The add panel ──────────────────────────────────────────────────────────────────────────────────

/** The room chips in the add panel, in walk order (spec S2). "Other…" asks for a name. */
export const ADD_ROOM_CHIPS = [
  ["Entry", "hall"], ["Living", "living"], ["Dining", "dining"], ["Kitchen", "kitchen"], ["Pantry", "pantry"], ["Scullery", "scullery"],
  ["Laundry", "laundry"], ["Bathroom", "bathroom"], ["Ensuite", "ensuite"], ["WC", "wc"], ["Bedroom", "bedroom"], ["Robe", "wir"],
  ["Study", "study"], ["Stairs", "stairs"], ["Garage", "garage"], ["Alfresco", "alfresco"], ["Outside", "external"],
];
/** The floors offered by "+ Add a floor" that the job doesn't have yet. */
export const addFloorOptions = (rooms) => ["Upper", "Lower ground"].filter((l) => !floorsOf(rooms).some((f) => f.key === floorKey(l)));

// ── List rows ──────────────────────────────────────────────────────────────────────────────────────

const STATUS_ONLY = /^(new|retain|retained|keep|existing|alter|altered|renovate|renovated|remove|n\/a|na|tbc|yes|no)\.?$/i;
/** A must-have that only names the room it's in ("Pantry" in a pantry) says nothing. */
function namesOnlyTheRoom(room, words) {
  const w = clean(words).toLowerCase();
  const names = new Set([clean(room.name).toLowerCase(), baseName(room.name).toLowerCase(), clean(ROOM_TYPES[room.roomType] || "").toLowerCase(), String(room.roomType || "")]);
  return !w || w.split(/,\s*/).every((p) => names.has(p));
}
const itemWords = (item) => {
  const typed = clean(item?.description);
  return typed && !isUnfinished(typed) ? typed : chipWords(item);
};
const roomItemsOf = (register, room) => (register?.items || []).filter((i) => i.roomId === room.id);
const ownFor = (items, qid) => items.filter((i) => resolvePromptId(i.promptKey) === qid && !i.overridesDefaultId);

/** The muted must-have summary after "Brief needed": the room-type layout records, the brief's own chips, typed scope words. */
export function mustHaveWords(register, room) {
  const items = roomItemsOf(register, room);
  const parts = [];
  const push = (w) => { const x = clean(w); if (x && !namesOnlyTheRoom(room, x) && !parts.some((p) => p.toLowerCase() === x.toLowerCase())) parts.push(x); };
  for (const qid of ROOM_MUST_HAVES[room.roomType] || []) for (const i of ownFor(items, qid)) push(itemWords(i));
  for (const b of ownFor(items, ROOM_BRIEF_PROMPT)) push(chipWords(b));
  const disagree = new Set(disagreeingScope(register, room).map((i) => i.id));
  for (const i of items) {
    if (!HIDDEN_ROOM_SCOPE_PROMPTS.has(resolvePromptId(i.promptKey)) || disagree.has(i.id)) continue;
    const typed = clean(i.description);
    if (typed && !STATUS_ONLY.test(typed) && !isUnfinished(typed)) push(typed);
  }
  return parts.join(" · ");
}

/** Line 2 of a room row: the brief preview, or "Brief needed" with the must-haves; the unfinished words for the tag. */
export function briefPreview(register, room) {
  const rec = roomBriefRecord(register, room);
  const text = clean(rec?.description);
  const unfinished = text && isUnfinished(rec.description) ? text : "";
  const has = !!text && !unfinished;
  const work = ROOM_SCOPES_WITH_WORK.has(room.scope);
  return { text: has ? text : "", needed: work && !has, unfinished, mustHaves: has ? "" : mustHaveWords(register, room) };
}

/** The room's open points under the Actions rule (spec S4): its own records only. */
export function roomActionPoints(register, context, room, points = null) {
  return (points || openPoints(register, context, { scope: "all" })).filter((p) => p.place?.kind === "room" && p.place.key === room.id);
}

/** Everything a row on the Rooms list shows. points: openPoints(…, { scope: "all" }) computed once for the list. */
export function roomListRow(register, context, room, points = null) {
  const preview = briefPreview(register, room);
  const actions = roomActionPoints(register, context, room, points).length;
  return { ...preview, checkWork: disagreeingScope(register, room).length > 0, actions };
}

/** The filter counts: All · Brief needed · Check work. */
export function listCounts(register) {
  const rooms = register?.meta?.rooms || [];
  return {
    all: rooms.length,
    brief: rooms.filter((r) => briefPreview(register, r).needed).length,
    check: rooms.filter((r) => disagreeingScope(register, r).length > 0).length,
  };
}
export function filterRooms(register, rooms, filter) {
  if (filter === "brief") return rooms.filter((r) => briefPreview(register, r).needed);
  if (filter === "check") return rooms.filter((r) => disagreeingScope(register, r).length > 0);
  return rooms;
}
/** "8 new · 8 renovated": one count per Work word, in the control's order, zeros left out. */
export function workSummary(rooms) {
  const order = ["new", "renovated", "altered", "existing_remain", "not_in_scope"];
  const n = (k) => (rooms || []).filter((r) => r.scope === k).length;
  const word = { new: "new", renovated: "renovated", altered: "altered", existing_remain: "no change", not_in_scope: "not in this job" };
  return order.filter((k) => n(k)).map((k) => `${n(k)} ${word[k]}`).join(" · ");
}

/**
 * The list's floor blocks: every floor in building order (floors just added and still empty included), each with the
 * rooms the filter shows, in walk order. A filtered floor with nothing to show is left out; total is the floor's full count.
 */
export function floorBlocks(register, filter = "all", extra = []) {
  const rooms = register?.meta?.rooms || [];
  const shown = new Set(filterRooms(register, rooms, filter).map((r) => r.id));
  return floorsOf(rooms, extra)
    .map((f) => ({ ...f, total: f.rooms.length, rooms: f.rooms.filter((r) => shown.has(r.id)) }))
    .filter((f) => filter === "all" || f.rooms.length);
}

/** Where a room sits in walk order: "Room 4 of 16", and the rooms either side for Previous / Next. */
export function roomPosition(rooms, id) {
  const order = walkOrder(rooms);
  const at = order.findIndex((r) => r.id === id);
  return { index: at, number: at + 1, total: order.length, prev: at > 0 ? order[at - 1] : null, next: at >= 0 && at < order.length - 1 ? order[at + 1] : null };
}

/** "1 action" / "3 actions" (the row's action pill), or "" for none. */
export const actionsPillText = (n) => (n > 0 ? `${n} action${n === 1 ? "" : "s"}` : "");
/** The remove confirmation names what goes with the room. */
export function removeRoomText(register, room) {
  const n = answerCount(register, room.id);
  const name = clean(room.name) || "this room";
  return n ? `Remove ${name} and its ${n} answer${n === 1 ? "" : "s"}? Anything already on the client portal is kept.` : `Remove ${name}? Nothing has been recorded in it yet.`;
}
/** The toasts after an add, a duplicate and a tick-mode move. */
export const addedText = (room) => `Added ${clean(room.name)} ${onFloor(room.level)}`;
export const duplicatedText = (room, source) => `Added ${clean(room.name)} below ${clean(source.name)} — its answers weren't copied`;
export const movedText = (n, level) => `Moved ${n} room${n === 1 ? "" : "s"} to the ${lowerFirst(floorLabel(level)).toLowerCase()}`;
/** Tick mode's button: "Move 5 rooms to Upper floor". */
export const tickMoveLabel = (n, level) => `Move ${n} room${n === 1 ? "" : "s"} to ${floorLabel(level)}`;
/** How many ticked rooms a tick-mode save would move (a room already on that floor isn't counted). */
export const tickCount = (rooms, ids, level) => (rooms || []).filter((r) => ids.includes(r.id) && floorKey(r.level) !== floorKey(level)).length;

/**
 * "Rooms are on 2 floors; the job says 1 storey — check in Sales." when the storeys fact is on file and the rooms span
 * more floors. Read only: storeys is never written from here.
 */
export function storeysNote(rooms, storeys) {
  const s = Number(storeys);
  if (!Number.isFinite(s) || s <= 0) return "";
  const n = floorsOf(rooms).length;
  return n > s ? `Rooms are on ${n} floors; the job says ${s} storey${s === 1 ? "" : "s"} — check in Sales.` : "";
}

/** The room bar's save state from each record's (the store's saveStateOf): the worst one wins. */
export function roomSaveState(items, saveStateOf) {
  const states = (items || []).map((i) => (saveStateOf ? saveStateOf(i.id) : "saved"));
  for (const s of ["rejected", "conflict", "error", "dirty"]) if (states.includes(s)) return s;
  return "saved";
}

/**
 * Save before moving room (spec S3 "Next and previous flush the save first"). Tries flush() until it reports everything
 * saved, for at most ms (a save already in flight answers false, so it is asked again). Resolves true or false; never throws.
 */
export async function flushWithin(flush, { ms = 8000, retryMs = 500, now = () => Date.now(), wait = (t) => new Promise((r) => setTimeout(r, t)), timeout = wait } = {}) {
  const until = now() + ms;
  for (;;) {
    let ok = false;
    try {
      ok = await Promise.race([Promise.resolve().then(() => flush()), timeout(Math.max(0, until - now())).then(() => "timeout")]);
    } catch { ok = false; }
    if (ok === true) return true;
    if (ok === "timeout" || now() + retryMs >= until) return false;
    await wait(retryMs);
  }
}

// ── Earlier answers that disagree with the room's Work (spec S3 card 3) ────────────────────────────

/** What an earlier whole-room answer says, in its own words ("New kitchen", "Renovate"). */
export function earlierWords(item) {
  const sel = (item?.answer?.selected || []).find((s) => s && !s.stale);
  return clean(sel?.label) || clean(item?.description) || dispositionLabel(item?.disposition);
}
/** The Work word an earlier answer stands for, or null. Alter reads as Renovated unless its words say "alter". */
export function workWordFor(item) {
  const d = item?.disposition;
  if (d === "new") return "new";
  if (d === "alter") return /\balter/i.test(earlierWords(item)) ? "altered" : "renovated";
  if (d === "retain") return "existing_remain";
  if (d === "excluded") return "not_in_scope";
  return null;
}
/** Has the signed contract fixed this record? Then the banner sends staff to a variation. */
export const contractFixed = (item) => !!(item?.sync?.baselined || item?.sync?.locked);
/** [Keep <Work>]: delete the disagreeing record shown (the next one, if any, shows after). */
export function keepWorkPlan(register, room) {
  const first = disagreeingScope(register, room)[0];
  return { remove: first ? [first] : [] };
}
/** [Change to <word>]: the room takes the word, and every earlier answer that now disagrees goes. */
export function changeWorkPlan(register, room, scope) {
  return { scope, remove: disagreeingScope(register, { ...room, scope }) };
}
/** A removed record as Undo puts it back: the same content under a fresh id, so the save never sends a delete and an insert for one id. */
export const readdable = (item) => { const rest = { ...item }; delete rest.id; return { ...rest, sync: null }; };

// ── Which prompt goes where on the room screen ─────────────────────────────────────────────────────

/** Every prompt for this room (detailed ones included: "Show detailed prompts" is retired). */
export function roomPromptSet(register, room, { projectType = "", stage = "" } = {}) {
  return promptsFor("room", { roomType: room.roomType, roomScope: room.scope, projectType, renovationOverlay: !!register?.meta?.renovationOverlay, stage, showDetail: true });
}

/** A short subject for a house line ("Floor finish" → "Floor", "Cabinetry look" → "Cabinetry"). */
export const shortName = (q) => clean(String(q?.short || "").replace(/\s*\([^)]*\)/g, "").replace(/\s+(finish|look)$/i, ""));

/** The house records a room reads for a question, by the question's zone table, whether or not anything is chosen yet. */
function houseRecordsFor(register, sourceId, roomType) {
  const defaults = (register?.items || []).filter((i) => i.isDefault && !i.roomId && resolvePromptId(i.promptKey) === sourceId);
  if (!defaults.length) return [];
  const cfg = answerConfigFor(sourceId);
  const table = cfg?.standard?.roomZones || cfg?.roomZones;
  if (!table) return defaults.slice(0, 1);
  const zones = table[roomType] || table["*"] || [];
  if (cfg?.roomReadsAll) {
    const hits = zones.flatMap((z) => defaults.filter((d) => d.answer?.zone?.key === z));
    return hits.length ? hits : defaults.filter((d) => !d.answer?.zone).slice(0, 1);
  }
  for (const z of zones) { const hit = defaults.find((d) => d.answer?.zone?.key === z); if (hit) return [hit]; }
  return defaults.filter((d) => !d.answer?.zone).slice(0, 1);
}
const liveSel = (item) => (item?.answer && Number(item.answer.v) <= ANSWER_SCHEMA_VERSION ? (item.answer.selected || []).filter((s) => s && !s.stale) : []);
/** The not-allowed option on a record (engineered stone on the benchtop), or null. */
export function notAllowedOption(qid, item) {
  const hidden = HIDDEN_OPTION_IDS[qid];
  if (!hidden) return null;
  return liveSel(item).find((s) => hidden.has((s.path || [])[0]) || hidden.has(s.optionId)) || null;
}
const parked = (item) => ["unresolved", "client_unsure"].includes(item?.answer?.state);
const ORDINARY = /^[A-Z][a-z]/;
/** Staff words read mid-sentence: "Tiles Allowed/ Client to decide" → "tiles allowed, client to decide". Acronyms stay. */
function midSentence(text) {
  return clean(String(text || "").replace(/\s*\/\s*/g, ", ")).split(" ").map((w) => (ORDINARY.test(w) && !/[A-Z]/.test(w.slice(1)) ? w.toLowerCase() : w)).join(" ").replace(/[.;,]\s*$/, "");
}
function reasonWords(item) {
  const k = item?.answer?.unresolved?.reason;
  if (k === "designer_to_confirm") return "designer to confirm";
  if (k === "decide_later") return "the client will decide later";
  if (k === "blue_leaf_to_advise") return "Blue Leaf to advise";
  return k && UNRESOLVED_REASONS[k] ? lowerFirst(UNRESOLVED_REASONS[k].label || "") : "";
}

/**
 * The house choices zoned to this room that are still open (amber) or not allowed (red), one line each, for the house
 * strip. A question the room answers for itself isn't listed: its own row is where it's settled.
 */
export function houseLinesFor(register, room, questions) {
  if (!room || room.scope === "not_in_scope") return [];
  const items = roomItemsOf(register, room);
  const out = [];
  for (const q of questions || []) {
    const sourceId = q.inherits || (answerConfigFor(q.id)?.standard ? q.id : null);
    if (!sourceId || items.some((i) => resolvePromptId(i.promptKey) === q.id)) continue;
    for (const def of houseRecordsFor(register, sourceId, room.roomType)) {
      const short = shortName(q) || labelOf(def);
      const bad = notAllowedOption(sourceId, def);
      if (bad) {
        const what = clean(bad.label).toLowerCase();
        out.push({ item: def, question: q, sourceId, tone: "red", action: "Change", text: `${short}: ${what} can't be used — choose another with the client`, shortText: `${short}: ${what} can't be used` });
        continue;
      }
      if (!parked(def) && !isOpenPoint(def)) continue;
      const noted = clean(def.answer?.note) || clean(def.description);
      const chips = chipWords(def);
      const reason = reasonWords(def);
      const words = noted ? midSentence(noted) : clean(def.nextAction) ? lowerFirst(tidy(def.nextAction)) : `${chips ? `${lowerFirst(chips)} — ` : ""}${reason || "still to be chosen"}`;
      out.push({ item: def, question: q, sourceId, tone: "amber", action: "Open", text: `${short}: ${words}`, shortText: `${short}: ${words}` });
    }
  }
  return out;
}

/**
 * The "Same as the rest of the house" strip: the summary, what's left to confirm, and when it was confirmed.
 * Open and not-allowed house lines are shown as lines of their own, so they're left out of the summary and never confirmed.
 */
export function stripView(register, room, questions) {
  const lines = room.scope === "not_in_scope" ? [] : roomInheritedLines(register, room, questions);
  const houseLines = houseLinesFor(register, room, questions);
  const held = new Set(houseLines.map((h) => h.item.id));
  const same = lines.filter((l) => !held.has(l.def.id) && l.status !== "overridden" && !parked(l.def));
  const pending = roomLinesToConfirm(same);
  const conf = normaliseRoomConfirmations(room.defaultConfirmations);
  const latest = same.map((l) => conf[l.def.id]?.at).filter(Boolean).sort().at(-1) || "";
  const summary = same.map((l) => {
    const words = clean(l.def.description) || chipWords(l.def);
    return `${l.surface || shortName(l.question)}: ${lowerFirst(words)}`;
  }).join(" · ");
  return { lines, same, houseLines, pending, summary, confirmedOn: !pending.length && same.length && latest ? adelaideDay(latest) : "", confirmedCount: same.filter((l) => l.status === "confirmed").length };
}

/** "Different here": a room exception from a house line (the existing logic). A not-allowed choice never carries across. */
export function exceptionSeedFrom(line, room) {
  const q = line.question;
  const fields = exceptionFieldsFrom(line.def, { keepZone: !!line.surface });
  const hidden = HIDDEN_OPTION_IDS[resolvePromptId(line.def.promptKey)];
  const answer = fields.answer && hidden
    ? normaliseAnswer({ ...fields.answer, selected: (fields.answer.selected || []).filter((s) => !hidden.has((s.path || [])[0])) })
    : fields.answer;
  return { itemKind: q.itemKind, category: q.category, promptKey: q.id, roomId: room.id, section: "room", technicalStatus: q.technical, responsibility: q.owner || "", source: room.sheet || "", ...fields, answer };
}

/** The seed a room's own record starts from (no level or name snapshot: documents read the live room). */
export const roomSeed = (q, room) => ({ itemKind: q.itemKind, category: q.category, promptKey: q.id, roomId: room.id, section: "room", technicalStatus: q.technical, responsibility: q.owner || "", source: room.sheet || "" });

// Room-type questions first, then the shared ones, then the decisions list (spec S3 "More choices" order).
const sortKey = (q) => (q.topic === "decisions" ? 2 : String(q.id).startsWith("R-") ? 1 : 0);
const byPlace = (list) => list.map((q, i) => ({ q, i })).sort((a, b) => sortKey(a.q) - sortKey(b.q) || a.i - b.i).map((x) => x.q);

/**
 * Where everything on a room screen goes. Returns
 *   { questions, primary, more, office, strip, mustHaves, ownChips, brief, banner, actions, other, rowItems(q), collapsed }
 * primary / more / office are question lists for the "Choices for this room" card. Hidden whole-room scope questions are
 * never asked; the room brief and must-haves sit in the brief card; house choices sit in the strip; R-010 follow-ups are
 * the room's actions. other: every record of the room that no row shows (nothing is ever hidden).
 */
export function roomLayout(register, context, room, { projectType = "", stage = "", points = null } = {}) {
  const questions = roomPromptSet(register, room, { projectType, stage });
  const items = roomItemsOf(register, room);
  const strip = stripView(register, room, questions);
  const mustIds = ROOM_MUST_HAVES[room.roomType] || [];
  const briefIds = new Set([ROOM_BRIEF_PROMPT, ...mustIds]);
  const exceptionsFor = (qid) => items.filter((i) => i.overridesDefaultId && resolvePromptId(i.promptKey) === qid);
  const stripIds = new Set();
  for (const q of questions) {
    if (ownFor(items, q.id).length || exceptionsFor(q.id).length) continue;
    if (strip.lines.some((l) => l.question.id === q.id) || strip.houseLines.some((h) => h.question.id === q.id)) stripIds.add(q.id);
  }
  // The hiddenAlias rule (RoomsStep): a question presented with a site record is that record. The existing-works one
  // (R-013 with W-004) stays as a row that shows the shared site records for this room; any other shows only when the
  // room already has a record of its own.
  const aliasHidden = (q) => {
    const via = answerConfigFor(q.id)?.presentedWith;
    return !!via && via !== EXISTING_WORKS_PROMPT && !ownFor(items, q.id).length;
  };
  const primarySet = partitionRoomPrompts(questions);
  const primary = [], more = [], office = [];
  for (const q of questions) {
    if (HIDDEN_ROOM_SCOPE_PROMPTS.has(q.id) || briefIds.has(q.id) || q.id === ACTION_PROMPT || stripIds.has(q.id) || aliasHidden(q)) continue;
    if (answerConfigFor(q.id)?.tier === "office_only") office.push(q);
    else if (primarySet.has(q.id) && q.topic !== "decisions") primary.push(q);
    else more.push(q);
  }
  const rowItems = (q) => {
    if (answerConfigFor(q.id)?.repeat) return ownFor(items, q.id);
    const exc = exceptionsFor(q.id);
    return exc.length ? exc : ownFor(items, q.id).slice(0, 1);
  };
  const collapsed = room.scope === "existing_remain" || room.scope === "not_in_scope";
  const shown = new Set();
  const banner = room.scope === "not_in_scope" ? [] : disagreeingScope(register, room);
  const actions = room.scope === "not_in_scope" ? [] : roomActionPoints(register, context, room, points);
  banner.forEach((i) => shown.add(i.id));
  actions.forEach((p) => p.ids.forEach((id) => shown.add(id)));
  const brief = collapsed ? null : roomBriefRecord(register, room);
  const mustHaves = collapsed ? [] : mustIds.map((qid) => ({ question: questionById(qid), item: ownFor(items, qid)[0] || null })).filter((m) => m.question);
  if (!collapsed) {
    if (brief) shown.add(brief.id);
    mustHaves.forEach((m) => m.item && shown.add(m.item.id));
    for (const q of [...primary, ...more, ...office]) for (const i of rowItems(q)) shown.add(i.id);
  }
  const other = room.scope === "not_in_scope" ? items : items.filter((i) => !shown.has(i.id));
  return {
    questions, strip, primary: byPlace(primary), more: byPlace(more), office: byPlace(office), stripIds, mustHaves,
    ownChips: !mustIds.length || liveSel(brief).length > 0, brief, banner, actions, other, rowItems, collapsed,
  };
}

/** The site question whose records a room's "Existing-to-new junctions & make good" row shows (Tab 27 B06: one record). */
export const EXISTING_WORKS_PROMPT = "W-004";
/** Is this the existing-works row (a room question presented with the shared site record)? */
export const isExistingWorksRow = (q) => answerConfigFor(q?.id)?.presentedWith === EXISTING_WORKS_PROMPT;
/** The shared existing-works records that name this room (no roomId: they belong to Site & existing). */
export const existingWorksFor = (register, room) => (register?.items || []).filter((i) => !i.roomId && resolvePromptId(i.promptKey) === EXISTING_WORKS_PROMPT
  && (i.answer?.areaIds || []).includes(room.id));
/** The seed of a new existing-works record for this room: the site record, with this room as its area. */
export function existingWorkSeed(room, id) {
  const q = questionById(EXISTING_WORKS_PROMPT);
  return { ...(id ? { id } : {}), itemKind: q?.itemKind || "scope", category: q?.category || "demolition", promptKey: EXISTING_WORKS_PROMPT, section: "site",
    disposition: "undecided", responsibility: q?.owner || "", answer: { v: ANSWER_SCHEMA_VERSION, areaIds: [room.id] } };
}
/** "+ Needs action from…": a new follow-up (R-010) for this room, created when its words or its who are saved. */
export const actionSeed = (room, id) => ({ ...(id ? { id } : {}), promptKey: ACTION_PROMPT, itemKind: "action", category: "notes", roomId: room.id, section: "room" });

/** How an "Other things recorded here" record reads: an agreeing earlier answer says so; the rest show their words. */
export function otherWords(register, room, item) {
  const qid = resolvePromptId(item.promptKey);
  if (HIDDEN_ROOM_SCOPE_PROMPTS.has(qid)) {
    // Only a record that says New, Alter, Retain or Excluded can agree; typed words alone are an earlier note.
    if (!workWordFor(item)) return `Earlier note: “${earlierWords(item) || "nothing recorded"}”`;
    return `Earlier answer: ${earlierWords(item)} — ${scopeAgrees(room, item) ? "agrees with" : "disagrees with"} the room`;
  }
  const words = recordWords(item) || clean(item.description) || clean(item.nextAction) || (item.disposition && item.disposition !== "undecided" ? dispositionLabel(item.disposition) : "");
  return `${labelOf(item)}: ${words || "nothing recorded yet"}`;
}

// ── The room brief (spec S3 card 4) ────────────────────────────────────────────────────────────────

/** The seed the room's brief record is created from on the first keystroke (build contract). */
export const briefSeed = (room, id) => ({ ...(id ? { id } : {}), roomId: room.id, promptKey: ROOM_BRIEF_PROMPT, itemKind: "requirement", category: "layout", section: "room" });

/** "Nothing special — standard room" (owner decision 3): "Standard WC; no special requirements." from the room's own name. */
export function standardBriefText(room) {
  const base = baseName(room?.name);
  const type = clean(String(ROOM_TYPES[room?.roomType] || "room").split(" / ")[0]);
  const word = base && base !== "Room" ? base : type;
  return `Standard ${lowerFirst(word)}; no special requirements.`;
}

/**
 * Toggle one value in a list kept on the answer (connectsTo, usedBy). Keeps answer.v: 1 and every other key; an empty
 * list is dropped rather than stored.
 */
export function toggleAnswerList(answer, key, value, nature = "requirement") {
  const base = answer && typeof answer === "object" ? answer : { nature, selected: [], state: "not_discussed" };
  const list = Array.isArray(base[key]) ? base[key] : [];
  const nextList = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  const rest = { ...base };
  delete rest[key];
  return normaliseAnswer({ ...rest, v: ANSWER_SCHEMA_VERSION, ...(nextList.length ? { [key]: nextList } : {}) });
}

/** Rooms whose brief says they connect to this one (shown muted, read live; nothing is copied). */
export function connectedFrom(register, room) {
  const mine = roomBriefRecord(register, room)?.answer?.connectsTo || [];
  return (register?.meta?.rooms || []).filter((r) => r.id !== room.id && !mine.includes(r.id)
    && (roomBriefRecord(register, r)?.answer?.connectsTo || []).includes(room.id));
}

/** The "Connects to" chips shown before "+ More rooms": the nearest rooms on the same floor in walk order, plus any chosen. */
export function connectCandidates(rooms, room, chosen = [], n = 5) {
  const order = walkOrder(rooms);
  const at = order.findIndex((r) => r.id === room.id);
  const same = order.filter((r) => r.id !== room.id && floorKey(r.level) === floorKey(room.level));
  const near = same.map((r) => ({ r, d: Math.abs(order.indexOf(r) - at) })).sort((a, b) => a.d - b.d).slice(0, n).map((x) => x.r.id);
  const keep = new Set([...near, ...chosen]);
  return { shown: order.filter((r) => keep.has(r.id)), more: order.filter((r) => r.id !== room.id && !keep.has(r.id)) };
}

/**
 * "Noted earlier: … · Use these". Words typed on a record that match a chip's label exactly (case aside) become that chip,
 * and those words come off the typed note; words that match nothing stay. Returns null when nothing matches.
 */
export function usableNotedWords(config, item) {
  const typed = clean(item?.description);
  if (!typed || !config?.options) return null;
  const parts = typed.split(/\s*[,;]\s*|\s+-\s+/).map(clean).filter(Boolean);
  const matched = [], left = [];
  for (const p of parts) {
    const o = config.options.find((x) => clean(x.label).toLowerCase() === p.toLowerCase());
    if (o && !matched.some((m) => m.id === o.id)) matched.push(o); else if (!o) left.push(p);
  }
  if (!matched.length) return null;
  let answer = item.answer;
  for (const o of matched) {
    const on = liveSel({ answer }).some((s) => (s.path || [])[0] === o.id);
    if (!on) answer = toggleOption(config, answer, [o.id]);
  }
  return { matched: matched.map((o) => o.label), patch: itemPatch(item, config, answer, { description: left.join(", ") }) };
}

// ── Words ──────────────────────────────────────────────────────────────────────────────────────────

const TZ = "Australia/Adelaide";
/** "16 Nov": the Adelaide day of a stamp. */
export function adelaideDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try { return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: TZ }).format(d); } catch { return d.toISOString().slice(0, 10); }
}
/** "9:41 pm", Adelaide time. */
export function timeOfDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  try { return new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(d).replace(/\s?([ap])\.?m\.?$/i, " $1m").toLowerCase(); } catch { return ""; }
}
/** The room bar's save state from the store's save block: { text, tone } or null. */
export function saveWords(save) {
  if (!save || !save.state) return null;
  if (save.state === "saved") return { text: save.at ? `Saved ${timeOfDay(save.at)}` : "Saved", tone: "ok" };
  if (save.state === "dirty" || save.state === "saving") return { text: "Saving…", tone: "muted" };
  if (save.state === "error") return { text: "Not saved — will retry", tone: "warn" };
  if (save.state === "rejected") return { text: save.message || "Not saved", tone: "error" };
  if (save.state === "conflict") return { text: save.message || "Changed elsewhere — check", tone: "warn" };
  return null;
}
/** "on the ground floor" for the add toast. */
export const onFloor = (level) => `on the ${lowerFirst(floorLabel(level)).replace(/^([A-Z][a-z]+)/, (w) => w.toLowerCase())}`;
/** The work word's label ("No change"), or the stored word for one this screen doesn't know. */
export const workLabel = (scope) => ROOM_SCOPES[scope] || clean(String(scope || "").replace(/_/g, " "));
