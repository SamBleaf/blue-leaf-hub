/**
 * briefModel.js — what the architect's brief prints, built once from the register and the Sales context
 * (docs/documents/REGISTER_SCREENS_SPEC.md S4–S6; owner decisions 16–17 Nov 2026).
 *
 * One module, read by the server (the PDF, adb-2.0) and the browser (the Documents step's "What will print" list, the
 * Actions list, a room's "How this room reads" line), so what staff see is what prints. Pure: no React, no network.
 *
 *   openPoints(register, context, { scope })  every record waiting on someone (the Actions list; section 03)
 *   roomRow(register, context, room)          one room as the brief prints it (section 04; "How this room reads")
 *   architectBriefModel(register, context, o) the whole brief: sections, printed lines (with record ids), and every
 *                                             record that doesn't print, with the reason
 *
 * Printing rules (spec S6):
 *   - Every line names its subject; no reference codes in the reading text (the ids travel with the line).
 *   - Light tidy only: spaces collapsed, " - " between words becomes ", ", a cell starts with a capital. Typed words
 *     otherwise print as typed (spelling isn't corrected).
 *   - Held back, and warned in the Documents step: unfinished notes (ending "-", ":" or "—"), status-only words that
 *     repeat or contradict the record's status, empty records, an action that doesn't say what's needed, and a
 *     whole-room scope answer that disagrees with the room's Work word.
 *   - Nothing prints twice: a point in 03 isn't repeated in 04 or 05.
 *   - A line held open for a prohibited product says why it is open, never the product.
 */
import {
  questionById, resolvePromptId, categoryLabel, natureOf, roomDefaultsFor, answerConfigFor, isClientSelection,
  ROOM_SCOPES, ROOM_SCOPES_WITH_WORK, ROOM_SCOPE_DISPOSITION, ROOM_TYPES, HIDDEN_ROOM_SCOPE_PROMPTS, ROOM_BRIEF_PROMPT, ROOM_MUST_HAVES,
  DRAWING_IMPACT, ACTION_ROLES, ROOM_USED_BY, PROJECT_TYPE_LABELS, DELIVERY_MODELS, UNRESOLVED_REASONS, ANSWER_SCHEMA_VERSION,
} from "./register.js";
import { LEAD_FINANCE_STATUS_LABELS } from "./constants.js";

// ── Words ──────────────────────────────────────────────────────────────────────────────────────────

export const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const capFirst = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
/** A word that is an ordinary capitalised word ("Island", not "AAC" or "NBN"): lowercased mid-sentence. */
const ordinaryWord = (w) => /^[A-Z][a-z]/.test(w) && !/[A-Z]/.test(w.slice(1));
export const lowerFirst = (t) => { const w = String(t || "").split(/\s/)[0]; return ordinaryWord(w) ? t.charAt(0).toLowerCase() + t.slice(1) : t; };
export const sentence = (t) => { const x = clean(t); return x && !/[.!?]$/.test(x) ? `${x}.` : x; };
export const andList = (l) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} and ${l.at(-1)}` : l[0] || "");

/** Typed words that stop mid-thought ("stairs -", "Retain:") never print until finished. */
export function isUnfinished(text) { const t = String(text || "").replace(/\s+$/, ""); return !!clean(t) && /[-–—:]$/.test(t); }

/** The light tidy: spaces collapsed, " - " between words read as a comma, a leading capital. Nothing else changes. */
export function tidy(text) {
  let t = clean(text).replace(/\s+[-–—]\s+/g, ", ").replace(/\s+,/g, ",").replace(/,{2,}/g, ",");
  t = t.replace(/[,;]\s*$/, "");
  return capFirst(t);
}

// Words that only restate a status: on a record they say nothing a reader can act on.
const STATUS_WORDS = new Set(["new", "retain", "retained", "keep", "kept", "existing", "existing to remain", "remain", "stays", "alter", "altered", "alterations",
  "renovate", "renovated", "renovation", "remove", "removed", "demolish", "excluded", "exclude", "included", "include", "n/a", "na", "tbc", "by others",
  "deferred", "undecided", "not decided", "yes", "no"]);
const WORD_DISPOSITION = { new: "new", retain: "retain", retained: "retain", keep: "retain", kept: "retain", existing: "retain", "existing to remain": "retain", remain: "retain",
  stays: "retain", alter: "alter", altered: "alter", alterations: "alter", renovate: "alter", renovated: "alter", renovation: "alter", remove: "remove", removed: "remove",
  demolish: "remove", excluded: "excluded", exclude: "excluded", included: "included", include: "included", "by others": "by_others", deferred: "deferred" };
const statusOnly = (item) => STATUS_WORDS.has(clean(item?.description).toLowerCase().replace(/[.!]+$/, ""));
/** "Retain" typed on a record marked New: the two can't both be true. */
export function contradictsStatus(item) {
  const w = WORD_DISPOSITION[clean(item?.description).toLowerCase().replace(/[.!]+$/, "")];
  return !!w && !!item?.disposition && item.disposition !== "undecided" && w !== item.disposition;
}

const ASKS = /\b(confirm|check|decide|choose|select|provide|send|advise|detail|design|size|measure|inspect|verify|assess|investigate|book|arrange|agree|review|update|show|draw|price|quote|supply)\b/i;

/** The live (not stale) choices on a record's card, with their option paths. Empty for a newer answer this screen can't read. */
function liveSelected(item) {
  const a = item?.answer;
  if (!a || !(Number(a.v) <= ANSWER_SCHEMA_VERSION)) return [];
  return (a.selected || []).filter((s) => s && !s.stale);
}
// First-level options that are attribute groups ("Ceiling · Square set"): the group's name isn't printed with its value.
const ATTRIBUTE_GROUPS = new Set(["ceiling", "finish_level", "palette", "feature_areas", "glazing", "frame", "frame_colour", "door_height", "door_type", "jamb_or_edge_detail",
  "hardware_style", "skirting", "architraves", "cornice", "opening_style", "priorities", "heating_and_cooling", "ventilation", "hot_water"]);
const CHIP_WORDS = { "by client": "supplied by the client", "by_client": "supplied by the client" };

/**
 * A record's choices in words: "walk-in, niche, hobless"; "square set, flat"; "rendered AAC". A branch shared by every
 * choice is said once; an attribute group's name is dropped unless its value is only a number ("door height 2340").
 * filter(sel) keeps only the choices that count (DRAWING_IMPACT options).
 */
export function chipWords(item, filter = null) {
  const sel = liveSelected(item).filter((s) => !filter || filter(s));
  const parts = [];
  for (const s of sel) {
    const segs = String(s.label || "").split(" · ").map(clean).filter(Boolean);
    const group = (s.path || [])[0];
    let words;
    if (segs.length < 2) words = segs;
    else if (ATTRIBUTE_GROUPS.has(group)) words = /^\d/.test(segs.at(-1)) ? [`${segs[0]} ${segs.at(-1)}`] : segs.slice(1);
    else if (segs[1].toLowerCase().includes(segs[0].toLowerCase().slice(0, 5))) words = segs.slice(1);   // "Render · Rendered AAC"
    else words = segs;
    for (const w of words) { const m = CHIP_WORDS[w.toLowerCase()] || w; if (!parts.some((p) => p.toLowerCase() === m.toLowerCase())) parts.push(m); }
  }
  return parts.map((w, k) => (k === 0 ? w : lowerFirst(w))).join(", ");
}

/** Does the typed text only list the card's choices (so the fuller card words print instead)? */
function typedIsChips(typed, chips) {
  if (!typed || !chips) return false;
  const have = new Set(chips.toLowerCase().split(/,\s*/));
  return typed.toLowerCase().split(/\s*,\s*/).every((p) => have.has(p.trim()));
}

/** A question's short name, without its parenthesis or a trailing "who?" ("Envelope quality"). */
export function plainShort(item) {
  const q = questionById(resolvePromptId(item?.promptKey));
  return clean(String(q?.short || categoryLabel(item?.category)).replace(/\s*\([^)]*\)/g, "").replace(/\s*—\s*who\?$/i, ""));
}

const roomById = (register, id) => (register?.meta?.rooms || []).find((r) => r.id === id) || null;
const ROOM_ZONE_KEYS = new Set([...Object.keys(ROOM_TYPES), "wet_area", "kitchen_and_joinery"]);

/**
 * Where a record sits, in the brief's words: a room's name, "Throughout" (the whole house) or "Site & existing".
 * order sorts the brief's points: whole house, then rooms in walk order, then the site.
 */
export function placeOf(register, item) {
  const rooms = register?.meta?.rooms || [];
  const k = item?.roomId ? rooms.findIndex((r) => r.id === item.roomId) : -1;
  if (k >= 0) return { key: item.roomId, label: rooms[k].name, kind: "room", order: 10 + k };
  const q = questionById(resolvePromptId(item?.promptKey));
  if (item?.section === "site" || q?.section === "site") return { key: "site", label: "Site & existing", kind: "site", order: 5000 };
  return { key: "throughout", label: "Throughout", kind: "throughout", order: 0 };
}

/** The record's own name in a line: its element or zone ("Gutters", "Main walls"), else the question's short name. */
export function labelOf(item) {
  const element = clean(item?.answer?.element?.label), zone = clean(item?.answer?.zone?.label);
  if (element) return element;
  if (zone) return ROOM_ZONE_KEYS.has(item.answer.zone.key) ? `${zone} ${lowerFirst(plainShort(item))}` : zone;
  return plainShort(item);
}
/** The subject that leads a printed point: the room's name joins a room record ("Laundry washer / dryer layout"). */
export function subjectOf(register, item) {
  const room = roomById(register, item?.roomId);
  const label = labelOf(item);
  if (!room || clean(item?.answer?.element?.label) || clean(item?.answer?.zone?.label)) return label;
  return `${clean(room.name)} ${lowerFirst(label)}`;
}

// ── Who and by when (spec S4) ──────────────────────────────────────────────────────────────────────

const ENERGY_WORDS = /\benergy\b|\bthermal\b|\bnathers\b/i;
/** The design team on file: current roles only, architects before designers. */
export function designTeam(context) {
  const ROLE_ORDER = { architect: 0, designer: 1, interior_designer: 2, engineer: 3, consultant: 4, energy: 5, land_surveyor: 6, soil_geotech: 7, other: 8 };
  return (context?.consultants || []).filter((c) => !["completed", "inactive"].includes(c.status)).slice()
    .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
}
/** The named architect or designer on file, or null. */
export function namedArchitect(context) {
  return designTeam(context).find((c) => ["architect", "designer", "interior_designer"].includes(c.role)) || null;
}

/**
 * Who acts on a record, as a group key (print order) and words. responsibility is the one "who"; actionRole only says
 * which consultant. Without an actionRole the consultant is read from the question (engineer, energy) as before.
 */
export function whoOf(context, item) {
  const r = item?.responsibility;
  const people = designTeam(context);
  const named = (roles, test) => { const c = people.find((x) => roles.includes(x.role) && (!test || test(x))); return c ? clean(c.company || c.name) : ""; };
  if (!r) return { key: "none", label: "To be agreed", named: "" };
  if (r === "client") return { key: "client", label: "Client", named: "" };
  if (r === "blue_leaf") return { key: "blue_leaf", label: "Blue Leaf", named: "" };
  if (r === "trade") return { key: "trade", label: "Trade / supplier", named: "" };
  if (r === "architect") { const n = named(["architect", "designer", "interior_designer"]); return { key: "architect", label: n || "Architect", named: n }; }
  const role = item.actionRole || "";
  const coord = questionById(resolvePromptId(item.promptKey))?.coord;
  if (role === "engineer" || (!role && (coord === "engineer" || ["structure", "existing", "site"].includes(item.category)))) {
    const n = named(["engineer"]); return { key: "engineer", label: n || "Engineer", named: n };
  }
  if (role === "energy" || (!role && (coord === "energy" || ENERGY_WORDS.test(`${item.description || ""} ${item.nextAction || ""}`)))) {
    const n = named(["energy", "consultant", "other"], (x) => x.role === "energy" || ENERGY_WORDS.test(`${x.company || ""} ${x.name || ""}`));
    return { key: "energy", label: n || "Energy assessor", named: n };
  }
  if (role && ACTION_ROLES[role]) return { key: "consultant", label: role === "other" ? "Consultant" : ACTION_ROLES[role], named: "" };
  return { key: "consultant", label: "Consultant", named: "" };
}
/** The print order of the "Who" groups (spec S4: the order the architect reads them). */
export const WHO_ORDER = ["architect", "engineer", "energy", "consultant", "trade", "client", "blue_leaf", "none"];
export const WHO_GROUP_LABEL = { architect: "Architect", engineer: "Engineer", energy: "Energy assessor", consultant: "Consultant", trade: "Trade or supplier", client: "Client", blue_leaf: "Blue Leaf", none: "No one named yet" };
const DESIGN_TEAM_RESP = new Set(["architect", "consultant", "trade"]);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Next issue", "Next meeting" or "28 Nov". "" when no by-when is set. */
export function dueLabel(due) {
  if (due === "next_issue") return "Next issue";
  if (due === "next_meeting") return "Next meeting";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(due || ""));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : "";
}

// ── What a record is ───────────────────────────────────────────────────────────────────────────────

/** Work on the building (a change, not a fact, a risk or a requirement): it changes the drawings wherever it sits. */
const WORK_DISPOSITIONS = new Set(["new", "included", "alter", "remove", "make_good"]);
export const isWorkRecord = (item) => item?.itemKind === "scope" && WORK_DISPOSITIONS.has(item.disposition)
  && !["fact", "risk", "technical", "requirement", "action"].includes(natureOf(item));
const DISPOSITION_WORDS = { new: "New", included: "Included", alter: "Alter", remove: "Remove", make_good: "Make good" };
const officeOnly = (item) => answerConfigFor(resolvePromptId(item?.promptKey))?.tier === "office_only";
const isHiddenScope = (item) => !!item?.roomId && HIDDEN_ROOM_SCOPE_PROMPTS.has(resolvePromptId(item.promptKey));
const evidenced = (item) => !!(item?.evidence?.at && item?.evidence?.by) || !!item?.sync?.approvedOnBoard;

/** An element whose place in the job is still open ("Retaining: in or out of this job?"). */
export const isInOut = (item) => !!item?.answer?.element && item.disposition === "undecided" && natureOf(item) === "scope" && !liveSelected(item).length;

/** Does the record hold anything at all? */
export function isEmptyRecord(item) {
  const a = item?.answer;
  return !clean(item?.description) && !liveSelected(item).length && !clean(a?.note) && !clean(item?.product) && !clean(item?.nextAction)
    && (item?.disposition || "undecided") === "undecided" && item?.technicalStatus !== "needs_verification" && a?.state !== "unresolved"
    && !a?.element && item?.supplyBy !== "client" && item?.itemKind !== "action";
}

/**
 * Does a whole-room scope answer agree with the room's Work word? New ↔ New; Renovated or Altered ↔ Alter; No change ↔
 * Retain; Not in this job ↔ Excluded. A record with no status, or one that says nothing about the room as a whole
 * (Included, Make good …), doesn't disagree.
 */
export function scopeAgrees(room, item) {
  const d = item?.disposition;
  if (!room || !["new", "alter", "retain", "excluded"].includes(d)) return true;
  return (ROOM_SCOPE_DISPOSITION[room.scope] || null) === d;
}
/** The whole-room scope records of a room that disagree with its Work word (the earlier-answer banner, spec S3). */
export function disagreeingScope(register, room) {
  return (register?.items || []).filter((i) => i.roomId === room.id && isHiddenScope(i) && !scopeAgrees(room, i));
}

/** Why a record won't print, whatever section it would go in. "" when nothing holds it back. */
export function heldBackReason(register, item) {
  if (isUnfinished(item.description)) return "unfinished";
  if (isHiddenScope(item) && !scopeAgrees(roomById(register, item.roomId), item)) return "disagrees";
  if (statusOnly(item) && contradictsStatus(item)) return "contradicts";
  if (item.itemKind === "action" && !clean(item.nextAction) && !ASKS.test(clean(item.description))) return "no_ask";
  return "";
}
export const HELD_BACK_WORDS = {
  unfinished: "unfinished: it ends mid-thought",
  disagrees: "it disagrees with the room's Work",
  contradicts: "its words contradict its status",
  no_ask: "it doesn't say what's needed",
};

// ── Open points: the Actions list and section 03 (spec S4) ─────────────────────────────────────────

/**
 * Is a record waiting on someone? Not resolved AND any of: a next action, an action record, a technical check, a parked
 * ("unresolved") answer, or an element still in or out of the job. A whole-room scope answer is never a point.
 */
export function isOpenPoint(item) {
  if (!item || item.resolved || isHiddenScope(item)) return false;
  if (officeOnly(item) && !DESIGN_TEAM_RESP.has(item.responsibility)) return false;
  return !!clean(item.nextAction) || item.itemKind === "action" || item.technicalStatus === "needs_verification"
    || item.answer?.state === "unresolved" || isInOut(item);
}
/** Is an open point for the next drawing issue? Everything but a client's finish choice (that goes to the client and the schedule). */
export function forNextIssue(item) {
  if (item.itemKind === "action" || DESIGN_TEAM_RESP.has(item.responsibility) || item.technicalStatus === "needs_verification") return true;
  if (DRAWING_IMPACT[resolvePromptId(item.promptKey)] || item.itemKind === "requirement" || isInOut(item)) return true;
  return false;
}
const reasonWords = (item) => {
  const key = item.answer?.unresolved?.reason;
  if (key === "designer_to_confirm") return "designer to confirm";
  if (key === "decide_later") return "the client will decide later";
  if (key === "blue_leaf_to_advise") return "Blue Leaf to advise";
  return key && UNRESOLVED_REASONS[key] ? lowerFirst(UNRESOLVED_REASONS[key]) : "";
};

/** What a point asks, in words (never the option a prohibited-product rule holds open). */
function askOf(item) {
  if (clean(item.nextAction)) return lowerFirst(tidy(item.nextAction));
  if (item.itemKind === "action") return lowerFirst(tidy(item.description));
  if (isInOut(item)) return "is it part of this job?";
  if (item.answer?.state === "unresolved") {
    const r = reasonWords(item);
    return `still to be ${natureOf(item) === "choice" || item.itemKind === "selection" ? "chosen" : "decided"}${r ? `; ${r}` : ""}`;
  }
  const typed = clean(item.description), chips = chipWords(item);
  const words = typed && !typedIsChips(typed, chips) ? tidy(typed) : chips || tidy(typed);
  const agreed = item.certainty === "client_approved" && evidenced(item) ? " (agreed with the client)" : "";
  // A performance goal is intent for the consultant to assess, never a specified product (DEC-MRUX-03).
  const review = answerConfigFor(resolvePromptId(item.promptKey))?.reviewSuggestions ? " (for consultant review)" : "";
  return words ? `confirm ${lowerFirst(words)}${agreed}${review}` : `to be confirmed${agreed}${review}`;
}

/**
 * Every record waiting on someone, grouped for print: [{ ids, item, subject, label, place, who, by, due, text, held, nextIssue }].
 * scope "next_issue" keeps what the next drawing issue needs (section 03); "all" adds the client's finish choices.
 * Held-back points (an action that doesn't say what's needed …) are kept, flagged, so the Actions list can show them.
 */
export function openPoints(register, context, { scope = "next_issue" } = {}) {
  const items = (register?.items || []).filter(isOpenPoint).filter((i) => scope === "all" || forNextIssue(i));
  const points = items.map((item, k) => {
    const place = placeOf(register, item), who = whoOf(context, item);
    const held = heldBackReason(register, item);
    return { ids: [item.id], item, k, subject: subjectOf(register, item), label: labelOf(item), place, who, due: item.actionDue || "", by: dueLabel(item.actionDue),
      ask: askOf(item), held, nextIssue: forNextIssue(item), inOut: isInOut(item) };
  });
  // Elements still in or out in one place are asked once ("Retaining and pool: are they part of this job?").
  const merged = [];
  for (const p of points) {
    const twin = p.inOut && !p.held && merged.find((m) => m.inOut && !m.held && m.place.key === p.place.key && m.who.key === p.who.key && m.due === p.due
      && resolvePromptId(m.item.promptKey) === resolvePromptId(p.item.promptKey));
    if (twin) { twin.ids.push(...p.ids); twin.labels.push(p.label); continue; }
    merged.push({ ...p, labels: [p.label] });
  }
  for (const p of merged) {
    if (p.inOut && p.labels.length > 1) p.text = `${andList(p.labels.map((l, k) => (k ? lowerFirst(l) : l)))}: are they part of this job?`;
    else p.text = `${p.subject}: ${p.ask}`;
    p.text = sentence(p.text);
  }
  return merged.sort((a, b) => WHO_ORDER.indexOf(a.who.key) - WHO_ORDER.indexOf(b.who.key) || a.place.order - b.place.order || a.k - b.k);
}

// ── Rooms (section 04) ─────────────────────────────────────────────────────────────────────────────

export const floorLabel = (level) => {
  const l = clean(level) || "Ground";
  return /^(ground|upper|lower|first|second|third|basement|mezzanine)$/i.test(l) ? `${capFirst(l.toLowerCase())} floor` : capFirst(l);
};
const roomTypeWords = (room) => new Set([clean(room?.name).toLowerCase(), clean(ROOM_TYPES[room?.roomType] || "").toLowerCase(), String(room?.roomType || "")]);
/** A must-have that only names the room it's in ("Pantry" in a pantry) says nothing. */
const namesOnlyTheRoom = (room, item) => {
  const words = chipWords(item).toLowerCase(), typed = clean(item.description).toLowerCase();
  const names = roomTypeWords(room);
  return (!!words && words.split(", ").every((w) => names.has(w)) && !typed) || (!!typed && names.has(typed));
};

/** The words a record prints with: its typed words (tidied), else its card's choices, plus who supplies it. */
export function recordWords(item, { impact = null } = {}) {
  const filter = impact?.options && !(impact.options.includes("ceiling") && item.answer?.zone?.key === "ceiling")
    ? (s) => impact.options.includes((s.path || [])[0]) : null;
  const chips = chipWords(item, filter);
  const typed = clean(item.description);
  let words = impact?.words === "chips" ? chips : typed && !isUnfinished(typed) ? (typedIsChips(typed, chips) ? chips : tidy(typed)) : chips;
  words = capFirst(words);
  const extra = [];
  if (impact?.colour && clean(item.colour)) extra.push(`Colour: ${tidy(item.colour)}`);
  if (item.supplyBy === "client" && !/supplied by the client/i.test(words)) extra.push("Supplied by the client");
  if (item.disposition === "by_others" && !/by others/i.test(words)) extra.push("By others");
  return [words, ...extra].filter(Boolean).map(sentence).join(" ");
}

/** A typed list of labels ("Full-height, Walk-in, Drawers") reads as one list: "Full-height, walk-in, drawers". */
function labelList(text) {
  const parts = String(text || "").replace(/\.$/, "").split(/,\s*/);
  if (parts.length < 2 || parts.some((p) => p.split(/\s+/).length > 3)) return text;
  return sentence(parts.map((p, k) => (k ? lowerFirst(p) : p)).join(", "));
}

/** Is a record one the drawings depend on (owner decision 5)? Returns its rule, or null. */
export function drawingImpactOf(item) {
  const rule = DRAWING_IMPACT[resolvePromptId(item?.promptKey)];
  if (!rule) return null;
  const sel = liveSelected(item);
  if (rule.elements && !rule.elements.includes(item.answer?.element?.key)) return null;
  if (rule.options && !(rule.options.includes("ceiling") && item.answer?.zone?.key === "ceiling") && sel.length && !sel.some((s) => rule.options.includes((s.path || [])[0]))) return null;
  return rule;
}

/** The rooms a whole-house default reaches by the register's own rule, where the room hasn't answered it itself. */
function roomsReading(register, def) {
  const q = questionById(resolvePromptId(def.promptKey));
  if (!q) return [];
  return (register.meta.rooms || []).filter((r) => ROOM_SCOPES_WITH_WORK.has(r.scope)
    && !(register.items || []).some((i) => i.roomId === r.id && resolvePromptId(i.promptKey) === q.id && !i.overridesDefaultId)
    && roomDefaultsFor(register, { ...q, inherits: q.inherits || q.id }, r.roomType).some((d) => d.id === def.id));
}

/** The room's brief record (R-004): the first one with words, else the first. */
export function roomBriefRecord(register, room) {
  const own = (register?.items || []).filter((i) => i.roomId === room.id && resolvePromptId(i.promptKey) === ROOM_BRIEF_PROMPT);
  return own.find((i) => clean(i.description)) || own[0] || null;
}
/** Does the room have a finished room brief (the agreed C2 rule for rooms with work)? */
export function hasRoomBrief(register, room) {
  const b = roomBriefRecord(register, room);
  return !!b && !!clean(b.description) && !isUnfinished(b.description);
}

/**
 * One room as section 04 prints it: { room, work, text, brief, placeholder, ids, parts }. text is the content cell after
 * the placeholder; ids are every record the row stands for (so a click on it opens the room, and nothing is unreachable).
 * opts.taken: ids already printed elsewhere (section 03), so nothing prints twice.
 */
export function roomRow(register, context, room, { taken = new Set(), houseDefaults = [] } = {}) {
  const items = (register?.items || []).filter((i) => i.roomId === room.id);
  const ids = [], parts = [], held = [];
  const work = ROOM_SCOPES_WITH_WORK.has(room.scope);
  const cover = (i) => { if (!ids.includes(i.id)) ids.push(i.id); };
  // 1 · The room brief.
  const brief = roomBriefRecord(register, room);
  const briefText = brief && clean(brief.description) && !isUnfinished(brief.description) ? sentence(tidy(brief.description)) : "";
  for (const b of items.filter((i) => resolvePromptId(i.promptKey) === ROOM_BRIEF_PROMPT)) {
    if (b === brief && briefText) cover(b); else if (isUnfinished(b.description)) held.push({ id: b.id, reason: "unfinished" }); else if (b !== brief && !isEmptyRecord(b)) cover(b);
  }
  if (brief && !briefText && !isUnfinished(brief.description) && !isEmptyRecord(brief)) cover(brief);
  // 2 · Connects to, who uses it, rough size.
  const a = brief?.answer && Number(brief.answer.v) <= ANSWER_SCHEMA_VERSION ? brief.answer : null;
  const links = (Array.isArray(a?.connectsTo) ? a.connectsTo : []).map((id) => (id === "outside" ? "outside" : roomById(register, id)?.name)).filter(Boolean);
  if (links.length) parts.push(`Connects to ${andList(links.map((n) => (n === "outside" ? n : `the ${lowerFirst(clean(n))}`)))}.`);
  const users = (Array.isArray(a?.usedBy) ? a.usedBy : []).map((k) => ROOM_USED_BY[k]).filter(Boolean);
  if (users.length) parts.push(`Used by ${andList(users.map((u, k) => (k ? lowerFirst(u) : lowerFirst(u))))}.`);
  if (brief?.quantity && /m²|m2|sqm/i.test(brief.unit || "")) parts.push(`About ${brief.quantity} m².`);
  const roomChips = brief ? chipWords(brief) : "";
  if (roomChips) parts.push(`Must-haves: ${lowerFirst(roomChips)}.`);
  // 3 · Must-haves (the room-type layout questions and the room's other requirements), then 4 · what the drawings depend on.
  const scopeWords = [], fittings = [];
  for (const i of items) {
    const qid = resolvePromptId(i.promptKey);
    if (qid === ROOM_BRIEF_PROMPT || taken.has(i.id)) continue;
    const why = heldBackReason(register, i);
    if (why) { held.push({ id: i.id, reason: why }); continue; }
    if (isHiddenScope(i)) {
      cover(i);                                                         // agrees: it rides on the Work cell
      const w = clean(i.description);
      if (w && !statusOnly(i)) scopeWords.push(sentence(tidy(w)));
      continue;
    }
    if (isEmptyRecord(i)) continue;
    const mustHave = (ROOM_MUST_HAVES[room.roomType] || []).includes(qid) || i.itemKind === "requirement";
    const impact = drawingImpactOf(i);
    if (mustHave) {
      if (namesOnlyTheRoom(room, i)) { cover(i); continue; }
      const w = labelList(recordWords(i));
      if (w) { parts.push(`${plainShort(i)}: ${lowerFirst(w)}`); cover(i); }
      continue;
    }
    if (impact) {
      const w = recordWords(i, { impact });
      if (w) { fittings.push(`${clean(i.answer?.element?.label) || plainShort(i)}: ${lowerFirst(w)}`); cover(i); }
    } else if (isWorkRecord(i) && !isOpenPoint(i)) {
      const w = recordWords(i) || DISPOSITION_WORDS[i.disposition];
      fittings.push(`${clean(i.answer?.element?.label) || plainShort(i)}: ${lowerFirst(w)}`); cover(i);
    }
  }
  parts.push(...fittings);                                             // must-haves first, then what the drawings show
  // 5 · House defaults that reach only this room (the laundry's cabinetry), then 6 · the room's scope words.
  for (const d of houseDefaults) { const w = recordWords(d, { impact: drawingImpactOf(d) }); if (w) { parts.push(`${plainShort(d)}: ${lowerFirst(w)}`); cover(d); } }
  parts.push(...scopeWords);
  const placeholder = work && !briefText;
  const text = [briefText, ...parts.map(sentence)].filter(Boolean).join(" ");
  return { room, roomId: room.id, name: clean(room.name), floor: floorLabel(room.level), workKey: room.scope, work: ROOM_SCOPES[room.scope] || capFirst(String(room.scope || "")),
    brief: briefText, placeholder, text, ids, held, empty: !text };
}

// ── The architect's brief (adb-2.0) ────────────────────────────────────────────────────────────────

export const BUDGET_BANDS = [
  { key: "under_400", min: null, max: 400000, label: "Under $400k" },
  { key: "400_600", min: 400000, max: 600000, label: "$400k–$600k" },
  { key: "600_800", min: 600000, max: 800000, label: "$600k–$800k" },
  { key: "800_1m", min: 800000, max: 1000000, label: "$800k–$1m" },
  { key: "1m_1_5m", min: 1000000, max: 1500000, label: "$1m–$1.5m" },
  { key: "over_1_5m", min: 1500000, max: null, label: "Over $1.5m" },
];
const money = (n) => (n >= 1000000 ? `$${String(Math.round(n / 100000) / 10).replace(/\.0$/, "")}m` : `$${Math.round(n / 1000)}k`);
/** "$800k–$1m", "Under $400k", "Over $1.5m". "" without a figure. */
export function budgetWords(min, max) {
  const lo = Number.isFinite(min) && min > 0 ? min : null, hi = Number.isFinite(max) && max > 0 ? max : null;
  if (lo && hi) return lo === hi ? money(lo) : `${money(lo)}–${money(hi)}`;
  if (hi) return `Under ${money(hi)}`;
  if (lo) return `Over ${money(lo)}`;
  return "";
}
/** The one line of the brief that may hold dollars (owner decision 1): only once the client confirmed it. Checked at issue. */
export const BUDGET_BAND_RX = /^(?:(?:Under|Over) )?\$\d+(?:\.\d)?[km](?:–\$\d+(?:\.\d)?[km])? construction budget, ex GST \(the client's figure\)\.$/;
export function budgetLine(context) {
  const b = context?.budget || {};
  const words = budgetWords(b.min, b.max);
  return words && b.confirmed ? `${words} construction budget, ex GST (the client's figure).` : "";
}

const OCCUPANCY_WORDS = { vacant: "The home will be empty during the works.", occupied: "The client lives in the home during the works.", partly: "Part of the home stays lived in." };
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const startWords = (iso) => { const m = /^(\d{4})-(\d{2})/.exec(String(iso || "")); return m ? `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}` : ""; };
const titleCase = (t) => clean(t).toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Of|And|The)\b/g, (w, _x, k) => (k ? w.toLowerCase() : w));
/** "An extension and renovation: 16 rooms, 8 new and 8 renovated." */
function plannedWords(context, rooms) {
  const inJob = rooms.filter((r) => r.scope !== "not_in_scope");
  const count = (k) => inJob.filter((r) => r.scope === k).length;
  const renov = count("renovated") + count("altered");
  const base = { new_build: "A new home", knockdown_rebuild: "A knockdown and rebuild", renovation: "A renovation", extension: renov ? "An extension and renovation" : "An extension" }[context?.projectType] || "The project";
  if (!inJob.length) return "";
  const bits = [["new", count("new")], ["renovated", count("renovated")], ["altered", count("altered")], ["with no change", count("existing_remain")]].filter(([, n]) => n).map(([w, n]) => `${n} ${w}`);
  return `${base}: ${inJob.length} room${inJob.length === 1 ? "" : "s"}${bits.length ? `, ${andList(bits)}` : ""}.`;
}

/**
 * The whole architect's brief, as printed (spec S6). Every row carries the ids it stands for and its source, so the
 * Documents step can open it; notPrinted lists every other record with the reason.
 *   o.recipientName: who it is issued to (else the named architect, else "The design team").
 */
export function architectBriefModel(register, context = {}, { recipientName = "" } = {}) {
  const items = register?.items || [];
  const rooms = (register?.meta?.rooms || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const printed = new Set();
  const take = (ids) => ids.forEach((id) => printed.add(id));

  // Cover.
  const architect = namedArchitect(context);
  const firm = architect?.company && architect.company !== architect.name ? architect.company : "";
  const recipient = clean(recipientName);
  const preparedFor = recipient ? (architect && [architect.name, architect.company].includes(recipient) ? clean([architect.name, firm].filter(Boolean).join(", ")) : recipient)
    : architect ? clean([architect.name, firm].filter(Boolean).join(", ")) : "";

  // 01 The project.
  const project = [];
  const planned = plannedWords(context, rooms);
  if (planned) project.push({ key: "planned", label: "What's planned", text: planned, source: { kind: "room", key: "rooms" }, ids: [] });
  const g = context?.goals || {};
  if (clean(g.vision)) project.push({ key: "vision", label: "In the client's words", text: `“${clean(g.vision).replace(/[.\s]+$/, "")}.”`, source: { kind: "fact", key: "vision" }, ids: [] });
  if (clean(g.keyRequirements)) project.push({ key: "must_haves", label: "Must-haves", text: sentence(clean(g.keyRequirements).split(/\n+/).map(clean).filter(Boolean).join("; ")), source: { kind: "fact", key: "must_haves" }, ids: [] });
  if (clean(g.concern)) project.push({ key: "concern", label: "What worries them", text: sentence(g.concern), source: { kind: "fact", key: "concern" }, ids: [] });
  const b = context?.budget || {};
  const funding = [LEAD_FINANCE_STATUS_LABELS[b.financeStatus] && b.financeStatus !== "unsure" ? sentence(LEAD_FINANCE_STATUS_LABELS[b.financeStatus]) : "",
    startWords(b.desiredStart) ? `Target start ${startWords(b.desiredStart)}.` : ""].filter(Boolean).join(" ");
  if (funding) project.push({ key: "funding", label: "Funding and timing", text: funding, source: { kind: "fact", key: "funding" }, ids: [] });
  const band = budgetLine(context);
  project.push({ key: "budget", label: "Budget", text: band || "To be confirmed by Blue Leaf.", source: { kind: "fact", key: "budget" }, ids: [], gap: !band });
  const prio = items.find((i) => !i.roomId && resolvePromptId(i.promptKey) === "P-005");
  const quality = items.find((i) => !i.roomId && resolvePromptId(i.promptKey) === "W-009");
  const prioWords = prio ? (chipWords(prio) || tidy(prio.description)) : "";
  const prioList = prioWords ? andList(prioWords.split(/\s*,\s*/).map((w, k) => (k ? lowerFirst(w) : capFirst(w)))) : "";
  const qWords = quality && !isUnfinished(quality.description) ? (chipWords(quality) || tidy(quality.description)) : "";
  const priorities = [prioList ? sentence(prioList) : "", qWords ? `Quality priorities: ${lowerFirst(qWords)}.` : ""].filter(Boolean).join(" ");
  if (priorities) { const ids = [prio, quality].filter((x) => x && (x === prio ? prioList : qWords)).map((x) => x.id); project.push({ key: "priorities", label: "The client's priorities", text: priorities, source: { kind: "record", key: "priorities" }, ids }); take(ids); }
  // What the design must achieve, house-wide, once settled (open ones are points in 03): each under its own subject.
  for (const i of items) {
    const qid = resolvePromptId(i.promptKey);
    if (i.roomId || i.itemKind !== "requirement" || ["P-005", "W-009"].includes(qid) || isOpenPoint(i) || heldBackReason(register, i) || isEmptyRecord(i) || officeOnly(i)) continue;
    const w = recordWords(i);
    if (!w) continue;
    const agreed = i.certainty === "client_approved" && evidenced(i) ? " (agreed with the client)" : "";
    const review = answerConfigFor(qid)?.reviewSuggestions ? " (for consultant review)" : "";
    project.push({ key: `req:${i.id}`, label: labelOf(i), text: sentence(`${w.replace(/\.$/, "")}${agreed}${review}`), source: { kind: "record" }, ids: [i.id] });
    take([i.id]);
  }

  // 02 Site and constraints.
  const s = context?.site || {};
  const site = [];
  if (s.council || s.zone) site.push({ key: "council", label: "Council and zone", text: [s.council ? sentence(titleCase(s.council)) : "", s.zone ? sentence(`${clean(s.zone)}${/zone$/i.test(clean(s.zone)) ? "" : " zone"}`) : ""].filter(Boolean).join(" "), source: { kind: "site", key: "council" }, ids: [] });
  if (s.council || s.zone || s.bushfire != null) site.push({ key: "bushfire", label: "Bushfire", text: s.bushfire === true ? "In a mapped bushfire area. BAL to be assessed." : s.bushfire === false ? "Not in a mapped bushfire area." : "Not confirmed.", source: { kind: "site", key: "bushfire" }, ids: [] });
  if (clean(s.slopeBand)) site.push({ key: "slope", label: "Slope", text: sentence(capFirst(clean(s.slopeBand).replace(/_/g, " "))), source: { kind: "site", key: "slope" }, ids: [] });
  if (clean(s.complexity)) site.push({ key: "complexity", label: "Site complexity", text: sentence(capFirst(clean(s.complexity).replace(/_/g, " "))), source: { kind: "site", key: "complexity" }, ids: [] });
  const access = items.find((i) => !i.roomId && resolvePromptId(i.promptKey) === "W-001");
  if (access && !heldBackReason(register, access)) { const w = recordWords(access); if (w) { site.push({ key: "access", label: "Access", text: w, source: { kind: "record", key: "access" }, ids: [access.id] }); take([access.id]); } }
  const occ = OCCUPANCY_WORDS[register?.meta?.occupancy];
  if (occ) site.push({ key: "occupancy", label: "During the works", text: occ, source: { kind: "meta", key: "occupancy" }, ids: [] });

  // 03 Needed for the next drawing issue.
  const allPoints = openPoints(register, context, { scope: "next_issue" });
  const points = allPoints.filter((p) => !p.held).map((p, k) => ({ n: k + 1, text: p.text, who: p.who.label, by: p.by, ids: p.ids, whoKey: p.who.key, source: { kind: "record" } }));
  points.forEach((p) => take(p.ids));
  const hasBy = points.some((p) => p.by);

  // 04 Rooms. House defaults the drawings depend on that reach exactly one room print in that room's row.
  const houseImpact = items.filter((i) => !i.roomId && drawingImpactOf(i) && !printed.has(i.id) && !heldBackReason(register, i) && !isEmptyRecord(i));
  const toRoom = new Map(), shared = [];
  for (const d of houseImpact) {
    const zoneKey = d.answer?.zone?.key;
    const reach = zoneKey && ROOM_ZONE_KEYS.has(zoneKey) ? roomsReading(register, d) : [];
    if (reach.length === 1) { if (!toRoom.has(reach[0].id)) toRoom.set(reach[0].id, []); toRoom.get(reach[0].id).push(d); }
    else shared.push({ d, reach });
  }
  const rowsAll = rooms.filter((r) => r.scope !== "not_in_scope").map((r) => roomRow(register, context, r, { taken: printed, houseDefaults: toRoom.get(r.id) || [] }));
  rowsAll.forEach((r) => take(r.ids));
  // Rooms with nothing recorded and the same Work share one row at the end of their floor.
  const floors = [...new Set(rowsAll.map((r) => r.floor))];
  const roomGroups = floors.map((floor) => {
    const own = rowsAll.filter((r) => r.floor === floor);
    const withText = own.filter((r) => r.text);
    const bare = own.filter((r) => !r.text);
    const byWork = new Map();
    for (const r of bare) { if (!byWork.has(r.workKey)) byWork.set(r.workKey, []); byWork.get(r.workKey).push(r); }
    const grouped = [...byWork.values()].map((rs) => ({ room: rs.map((r) => r.name).join(", "), work: rs[0].work, text: "", placeholder: rs[0].placeholder, ids: rs.flatMap((r) => r.ids), roomIds: rs.map((r) => r.roomId) }));
    return { floor, rows: [...withText.map((r) => ({ room: r.name, work: r.work, text: r.text, brief: r.brief, placeholder: r.placeholder, ids: r.ids, roomIds: [r.roomId] })), ...grouped] };
  });

  // 05 Selections that affect the drawings: whole-house records, said once per subject.
  const selections = [];
  const sel = (key, label, text, ids) => { const hit = selections.find((x) => x.key === key); if (hit) { hit.parts.push(text); hit.ids.push(...ids); } else selections.push({ key, label, parts: [text], ids: [...ids] }); };
  for (const { d, reach } of shared) {
    const qid = resolvePromptId(d.promptKey), rule = drawingImpactOf(d);
    const words = recordWords(d, { impact: rule });
    if (!words) continue;
    const zone = clean(d.answer?.zone?.label), element = clean(d.answer?.element?.label);
    if (qid === "W-019") sel("W-019", rule.label, words, [d.id]);
    else if (zone && ROOM_ZONE_KEYS.has(d.answer.zone.key)) sel(`zone:${d.answer.zone.key}`, reach.length > 1 ? `All ${zone.toLowerCase().replace(/(?<![s])$/, "s")}` : zone, `${plainShort(d)}: ${lowerFirst(words)}`, [d.id]);
    else sel(`${qid}:${d.id}`, element || zone || rule.label || plainShort(d), words, [d.id]);
  }
  // House-wide and site work (demolition, a new opening …): it changes the drawings, so it prints here too.
  let hasWork = false;
  for (const i of items) {
    if (i.roomId || printed.has(i.id) || !isWorkRecord(i) || drawingImpactOf(i) || isOpenPoint(i) || heldBackReason(register, i) || isEmptyRecord(i)) continue;
    sel(`work:${i.id}`, labelOf(i), recordWords(i) || DISPOSITION_WORDS[i.disposition], [i.id]);
    hasWork = true;
  }
  const selectionRows = selections.map((x) => {
    // W-019: two records that both say "square set" say it once.
    const text = x.key === "W-019" ? sentence(capFirst([...new Set(x.parts.flatMap((p) => p.replace(/\.$/, "").split(/,\s*/)).map((w) => w.toLowerCase()))].join(", ")))
      : x.parts.map(sentence).join(" ");
    return { label: x.label, text, ids: x.ids, source: { kind: "record" } };
  });
  selectionRows.forEach((r) => take(r.ids));

  // 06 Outside this job: rooms not in the job, and work by others, supplied by the client or left out, not said above.
  const outside = [];
  const notIn = rooms.filter((r) => r.scope === "not_in_scope");
  if (notIn.length) outside.push({ label: "Rooms not in this job", text: sentence(andList(notIn.map((r) => clean(r.name)))), ids: [], source: { kind: "room", key: "not_in_scope" } });
  const OUT = { excluded: "Not in this job", deferred: "A possible later stage", by_others: "By others" };
  for (const i of items) {
    if (printed.has(i.id) || isHiddenScope(i) || heldBackReason(register, i) || isEmptyRecord(i) || i.itemKind === "selection" && !drawingImpactOf(i)) continue;
    const kind = OUT[i.disposition] || (i.supplyBy === "client" ? "Supplied by the client" : null);
    if (!kind || natureOf(i) === "fact") continue;
    const room = roomById(register, i.roomId);
    const w = recordWords(i).replace(/\s*(Supplied by the client|By others)\.$/i, "");
    outside.push({ label: kind, text: sentence(`${room ? `${clean(room.name)}: ` : ""}${labelOf(i)}${w ? `: ${lowerFirst(w.replace(/\.$/, ""))}` : ""}`), ids: [i.id], source: { kind: "record" } });
    take([i.id]);
  }

  // Everything that doesn't print, with the reason (the Documents step's "Not in this brief").
  const notPrinted = [];
  for (const i of items) {
    if (printed.has(i.id)) continue;
    const why = heldBackReason(register, i);
    if (why) notPrinted.push({ id: i.id, group: "held", reason: why });
    else if (isEmptyRecord(i)) notPrinted.push({ id: i.id, group: "empty", reason: "empty" });
    else if (isClientSelection(i) || i.itemKind === "selection") notPrinted.push({ id: i.id, group: "schedule", reason: "schedule" });
    else if (isOpenPoint(i) && !forNextIssue(i)) notPrinted.push({ id: i.id, group: "client", reason: "client" });
    else notPrinted.push({ id: i.id, group: "office", reason: "office" });
  }

  const typeLabel = PROJECT_TYPE_LABELS[context?.projectType] || "Residential project";
  const suburb = clean(context?.identity?.suburb);
  return {
    subtitle: `${typeLabel.charAt(0)}${typeLabel.slice(1).toLowerCase()}${suburb ? `, ${suburb}` : ""}`,
    preparedFor, preparedForGap: !preparedFor,
    projectLabel: [typeLabel, DELIVERY_MODELS[context?.deliveryModel]].filter(Boolean).join(" · "),
    project, site, points, hasBy, roomGroups, floorBands: floors.length > 1, selections: selectionRows, outside, notPrinted,
    selectionsTitle: hasWork ? "Work and selections that affect the drawings" : "Selections that affect the drawings",
    counts: { records: items.length, printed: printed.size, notPrinted: notPrinted.length },
  };
}

/**
 * Every line the architect's brief prints, in print order: [{ section, group, label, text, ids, source, placeholder }].
 * The Documents step lists these beside the PDF; each opens its source. The cover lines come from the fixture's project.
 */
export function architectBriefLines(model, cover = {}) {
  const lines = [];
  const push = (section, row, extra = {}) => lines.push({ section, label: row.label || "", text: row.text || "", ids: row.ids || [], source: row.source || { kind: "record" }, ...extra });
  push("cover", { label: "Prepared for", text: model.preparedFor || "The design team", source: { kind: "consultant", key: "architect" } }, { placeholder: model.preparedForGap });
  if (cover.siteAddress) push("cover", { label: "Site", text: cover.siteAddress, source: { kind: "fact", key: "site" } });
  if (cover.clientName) push("cover", { label: "Client", text: cover.clientName, source: { kind: "fact", key: "client" } });
  push("cover", { label: "Drawing basis", text: cover.drawingBasis || "Not yet recorded", source: { kind: "meta", key: "planRev" } }, { placeholder: !cover.drawingBasis });
  if (model.projectLabel) push("cover", { label: "Project", text: model.projectLabel, source: { kind: "fact", key: "project" } });
  for (const r of model.project) push("project", r, { placeholder: !!r.gap });
  for (const r of model.site) push("site", r);
  for (const p of model.points) push("points", { label: String(p.n), text: `${p.text} · ${p.who}${p.by ? ` · ${p.by}` : ""}`, ids: p.ids, source: { kind: "record" } });
  for (const g of model.roomGroups) for (const r of g.rows) push("rooms", { label: r.room, text: `${r.work}${r.placeholder ? " · Brief to follow." : ""}${r.text ? ` ${r.text}` : ""}`, ids: r.ids, source: { kind: "room", key: r.roomIds.join(",") } }, { group: model.floorBands ? g.floor : "", placeholder: r.placeholder });
  for (const r of model.selections) push("selections", r);
  for (const r of model.outside) push("outside", r);
  return lines;
}
export const BRIEF_SECTION_TITLES = { cover: "Cover", project: "01 The project", site: "02 Site and constraints", points: "03 Needed for the next drawing issue", rooms: "04 Rooms", selections: "05 Selections that affect the drawings", outside: "06 Outside this job" };
