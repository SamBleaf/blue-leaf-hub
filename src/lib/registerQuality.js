/**
 * registerQuality.js — the content checks on a register document (REGISTER_SCREENS_SPEC.md S5 "Before you send"),
 * each with the record, room or fact that fixes it. Pure: read by the server's preview and by the browser, so a fix in
 * the Documents step's edit drawer clears its warning straight away and the server agrees on "Preview again".
 *
 * Content checks never block an issue (owner decision 2: a missing vision or must-haves is a warning only). The release
 * blockers stay in registerDocChecks (server/lib/registerDocuments.mjs); roomsNeedingBrief feeds its agreed C2 rule.
 *
 * A target is { kind, id?, key? }:
 *   record     a register item (id)            room       a room (id)             rooms   the Rooms list (key "floors")
 *   fact       a lead fact (key: vision …)     architect  the design team's architect
 *   meta       register meta (key planRev …)   actions    the Actions list (key "unnamed")
 */
import { ROOM_SCOPES_WITH_WORK, resolvePromptId } from "./register.js";
import {
  clean, andList, hasRoomBrief, disagreeingScope, openPoints, heldBackReason, isEmptyRecord, namedArchitect, plainShort, labelOf, placeOf,
} from "./briefModel.js";

const quote = (t, n = 40) => { const x = clean(t); return `“${x.length > n ? `${x.slice(0, n - 1)}…` : x}”`; };
const rec = (id) => ({ kind: "record", id });
// A room named only by an adjective reads as a room mid-sentence: "the Living" → "the living room".
const roomPhrase = (name) => { const n = clean(name) || "room"; return /^(living|dining|family|rumpus|sitting|games|media)$/i.test(n) ? `${n.toLowerCase()} room` : n; };

/** Rooms with work in them (New, Renovated, Altered) and no finished room brief. */
export function roomsNeedingBrief(register) {
  return (register?.meta?.rooms || []).filter((r) => ROOM_SCOPES_WITH_WORK.has(r.scope) && !hasRoomBrief(register, r));
}
/** The release blocker for the architect's brief (agreed C2 rule), with its targets. */
export function roomBriefBlocker(register) {
  const rooms = roomsNeedingBrief(register);
  if (!rooms.length) return null;
  const n = rooms.length;
  return { key: "room_briefs", text: `${n} new or renovated room${n === 1 ? " has" : "s have"} no room brief: ${rooms.map((r) => clean(r.name)).join(", ")}.`,
    targets: rooms.map((r) => ({ kind: "room", id: r.id })), action: "rooms" };
}

/** Does the register hint at an upper floor while every room sits on one (the Rooms floor banner, spec S2)? */
export function upperFloorHint(register) {
  const rooms = register?.meta?.rooms || [];
  const levels = new Set(rooms.map((r) => clean(r.level || "Ground").toLowerCase()));
  if (rooms.length < 2 || levels.size > 1) return null;
  const items = register?.items || [];
  const upper = items.find((i) => /upper|first floor|level 1/i.test(`${i.answer?.zone?.key || ""} ${i.answer?.zone?.label || ""}`));
  const stair = items.find((i) => i.roomId && /\bstair/i.test(clean(i.description)));
  if (!upper && !stair) return null;
  const why = [upper ? `the ${plainShort(upper).toLowerCase().includes("material") ? "cladding" : plainShort(upper).toLowerCase()} is recorded for the upper level` : "",
    stair ? `the ${roomPhrase(rooms.find((r) => r.id === stair.roomId)?.name)} mentions stairs` : ""].filter(Boolean);
  return { text: `Every room is on the ${[...levels][0] === "ground" ? "ground floor" : `${[...levels][0]} floor`}, but ${andList(why)}.`, ids: [upper?.id, stair?.id].filter(Boolean) };
}

/**
 * The content checks for one document. model: the document's brief model (architectBriefModel) when it has one.
 * Returns [{ key, text, targets, action? }] in the order staff should work through them.
 */
export function contentChecks(docType, register, context = {}, model = null) {
  if (docType !== "architect_brief") return [];
  const out = [];
  const items = register?.items || [];
  const rooms = register?.meta?.rooms || [];
  const g = context?.goals || {}, b = context?.budget || {};

  // 1 · The client's story.
  const missing = [!clean(g.vision) && "vision", !clean(g.keyRequirements) && "must-haves", !(b.min || b.max) && "budget"].filter(Boolean);
  if (missing.length) {
    const said = missing.filter((m) => m !== "budget");
    out.push({ key: "story", targets: [{ kind: "fact", key: missing[0] === "must-haves" ? "must_haves" : missing[0] }], action: "story",
      text: `The client's ${andList(missing)} ${missing.length === 1 ? "isn't" : "aren't"} recorded.${said.length ? ` The brief leaves ${said.length === 1 ? "it" : "the first two"} out` : ""}${missing.includes("budget") ? `${said.length ? " and" : " The brief"} says the budget is “to be confirmed by Blue Leaf”` : ""}.` });
  } else if (!b.confirmed) {
    out.push({ key: "budget_confirmed", targets: [{ kind: "fact", key: "budget" }], action: "story", text: "The budget isn't marked “Confirmed with the client”, so the brief says it is to be confirmed by Blue Leaf." });
  }
  // 2 · No architect named.
  if (!namedArchitect(context)) out.push({ key: "architect", targets: [{ kind: "architect" }], action: "architect", text: "No architect named: the brief is addressed to “The design team”." });
  // 3 · Floors.
  const floor = upperFloorHint(register);
  if (floor) out.push({ key: "floors", targets: [{ kind: "rooms", key: "floors" }], action: "floors", text: floor.text });
  // 4 · Earlier answers that disagree with a room's Work word.
  const clash = rooms.map((r) => ({ r, recs: disagreeingScope(register, r) })).filter((x) => x.recs.length);
  if (clash.length) {
    const first = clash[0], word = clean(first.recs[0].description) || first.recs[0].answer?.selected?.[0]?.label || first.recs[0].disposition;
    out.push({ key: "scope_clash", targets: clash.map((x) => ({ kind: "room", id: x.r.id })), action: "rooms",
      text: `${andList(clash.map((x) => clean(x.r.name)))}: an earlier answer disagrees with the room's work (${clean(first.r.name)} is ${first.r.scope === "renovated" ? "Renovated" : clean(first.r.scope).replace(/_/g, " ")}; an earlier answer says ${quote(word)}). The room's setting prints; the earlier answer is held back.` });
  }
  // 5 · Points for the next drawing issue with no one named.
  const points = model?.points || openPoints(register, context, { scope: "next_issue" }).filter((p) => !p.held);
  const unnamed = points.filter((p) => (p.whoKey || p.who?.key) === "none");
  if (unnamed.length) {
    const names = unnamed.map((p) => p.ids.map((id, k) => { const l = labelOf(items.find((i) => i.id === id)); return k ? l.charAt(0).toLowerCase() + l.slice(1) : l; }).join(" and "));
    out.push({ key: "unnamed", targets: [{ kind: "actions", key: "unnamed" }, ...unnamed.flatMap((p) => p.ids.map(rec))], action: "actions",
      text: `${unnamed.length} point${unnamed.length === 1 ? "" : "s"} for the next drawing issue ${unnamed.length === 1 ? "has" : "have"} no one named: ${names.join(", ")}.` });
  }
  // 6 · A technical check that's down to the client.
  for (const i of items.filter((x) => x.technicalStatus === "needs_verification" && x.responsibility === "client" && !x.resolved)) {
    out.push({ key: `client_check:${i.id}`, targets: [rec(i.id)], text: `${labelOf(i)}: the technical check is down to the client. A trade or engineer usually confirms it.` });
  }
  // 7–9 · Records held back from print.
  const held = items.map((i) => ({ i, why: heldBackReason(register, i) })).filter((x) => x.why);
  const unfinished = held.filter((x) => x.why === "unfinished");
  if (unfinished.length) out.push({ key: "unfinished", targets: unfinished.map((x) => rec(x.i.id)),
    text: `${unfinished.length} note${unfinished.length === 1 ? " looks" : "s look"} unfinished and won't print: ${unfinished.map((x) => `${quote(x.i.description)} (${placeOf(register, x.i).kind === "room" ? placeOf(register, x.i).label : labelOf(x.i).toLowerCase()})`).join(", ")}.` });
  for (const { i } of held.filter((x) => x.why === "contradicts")) out.push({ key: `contradicts:${i.id}`, targets: [rec(i.id)],
    text: `${labelOf(i)} says ${quote(i.description)} but is marked ${i.disposition === "new" ? "New" : clean(i.disposition).replace(/_/g, " ")}. It won't print until they agree.` });
  for (const { i } of held.filter((x) => x.why === "no_ask")) out.push({ key: `no_ask:${i.id}`, targets: [rec(i.id)],
    text: `${clean(i.description) ? quote(i.description) : labelOf(i)}: ${i.responsibility === "client" ? "a client action" : "an action"} that doesn't say what's needed. It won't print.` });
  // 10 · Empty answers, by room.
  const empties = new Map();
  for (const i of items.filter((x) => isEmptyRecord(x) && resolvePromptId(x.promptKey))) {
    const k = placeOf(register, i).label;
    if (!empties.has(k)) empties.set(k, []);
    empties.get(k).push(i);
  }
  for (const [place, list] of empties) out.push({ key: `empty:${place}`, targets: list.map((i) => rec(i.id)), action: "delete_empty",
    text: `${list.length} empty answer${list.length === 1 ? "" : "s"} in ${place === "Throughout" ? "the whole house" : place === "Site & existing" ? "Site & existing" : `the ${place}`} print${list.length === 1 ? "s" : ""} nothing: ${list.map((i) => labelOf(i)).join("; ")}.` });
  return out;
}
