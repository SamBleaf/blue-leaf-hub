/**
 * needsAction.js — "Needs action from…" (docs/documents/REGISTER_SCREENS_SPEC.md S4): the rules behind the ⚑ on every
 * record row, its sheet and the Actions list. Pure: no React, no network. The components in
 * src/components/sales/lead-detail/register/NeedsAction.jsx and ActionsPanel.jsx hold no rules of their own.
 *
 * What is open, and in what order, is never decided here: that is openPoints() in briefModel.js, the same rule that fills
 * the architect's brief's numbered "Needed for the next drawing issue" list. This module only says what a tap writes.
 *
 *   Who        → item.responsibility (the one "who"); item.actionRole only says which consultant (engineer, energy)
 *   What       → item.nextAction
 *   By when    → item.actionDue: "next_issue" | "next_meeting" | "YYYY-MM-DD" | ""
 *   Done       → item.resolved
 *   Checked    → technicalStatus "verified" + technicalEvidence { at, by, ref } (a reference is required)
 */
import {
  questionById, resolvePromptId, configForRow, isGuidedConfig, answerIsEditable, normaliseActionDue,
  setUnresolvedReason, toggleNotDecided, itemPatch, HIDDEN_OPTION_IDS, ANSWER_SCHEMA_VERSION,
} from "./register.js";
import {
  openPoints, isOpenPoint, forNextIssue, whoOf, dueLabel, labelOf, placeOf, isInOut, isUnfinished, tidy, chipWords,
  clean, lowerFirst, andList, designTeam, WHO_ORDER, WHO_GROUP_LABEL,
} from "./briefModel.js";

// ── Who ────────────────────────────────────────────────────────────────────────────────────────────

/** The sheet's six "Who" chips, in the order drawn, and what each writes. */
export const WHO_CHOICES = [
  { key: "client", label: "Client", responsibility: "client", actionRole: "" },
  { key: "architect", label: "Architect", responsibility: "architect", actionRole: "" },
  { key: "engineer", label: "Engineer", responsibility: "consultant", actionRole: "engineer" },
  { key: "energy", label: "Energy assessor", responsibility: "consultant", actionRole: "energy" },
  { key: "blue_leaf", label: "Blue Leaf", responsibility: "blue_leaf", actionRole: "" },
  { key: "trade", label: "Trade or supplier", responsibility: "trade", actionRole: "" },
];
/** The Actions list's inline chips on a row with no one named ("More…" opens the sheet for the rest). */
export const INLINE_WHO_KEYS = ["architect", "engineer", "energy", "client"];
const DESIGN_TEAM_KEYS = new Set(["architect", "engineer", "energy", "consultant", "trade"]);
const ENERGY_WORDS = /\benergy\b|\bthermal\b|\bnathers\b/i;
const firmOf = (c) => clean(c?.company || c?.name);

/**
 * The "Who" chips for this job: { key, label, short, named, responsibility, actionRole }. Once someone is on the design
 * team the chip names them: "Architect — Bright Studio". short is the plain word, for pills and toasts.
 */
export function whoChoices(context) {
  const team = designTeam(context);
  const named = {
    architect: team.find((c) => ["architect", "designer", "interior_designer"].includes(c.role)),
    engineer: team.find((c) => c.role === "engineer"),
    energy: team.find((c) => c.role === "energy" || (["consultant", "other"].includes(c.role) && ENERGY_WORDS.test(`${c.company || ""} ${c.name || ""}`))),
  };
  return WHO_CHOICES.map((c) => {
    const n = firmOf(named[c.key]);
    return { ...c, short: c.label, named: n, label: n ? `${c.label} — ${n}` : c.label };
  });
}
export const choiceByKey = (key, context) => whoChoices(context).find((c) => c.key === key) || null;

/** Which chip a record's who is, or null ("To be agreed", or a consultant that isn't an engineer or energy assessor). */
export function whoKeyOf(context, item) {
  if (!item?.responsibility) return null;
  const k = whoOf(context, item).key;
  return WHO_CHOICES.some((c) => c.key === k) ? k : null;
}

const OWNER_KEY = { client: "client", architect: "architect", blue_leaf: "blue_leaf", trade: "trade" };
const COORD_KEY = { architect: "architect", engineer: "engineer", energy: "energy", windows: "trade", joiner: "trade", routleys: "trade", tli: "trade" };
/** A stored or default owner as a chip key; a consultant is read as briefModel's whoOf reads it (engineer or energy). */
function ownerKey(item, responsibility) {
  if (OWNER_KEY[responsibility]) return OWNER_KEY[responsibility];
  if (responsibility !== "consultant") return null;
  const k = whoOf(null, { ...item, responsibility, actionRole: responsibility === item?.responsibility ? item?.actionRole || "" : "" }).key;
  return k === "engineer" || k === "energy" ? k : null;
}

/**
 * The chip shown as "suggested": the record's owner; otherwise the question's owner, then its coordinator.
 * A technical check never suggests the client. null when nothing points anywhere.
 */
export function suggestedWho(item, question = questionById(resolvePromptId(item?.promptKey))) {
  const technical = item?.technicalStatus === "needs_verification";
  const fits = (k) => !!k && !(technical && k === "client");
  for (const k of [item?.responsibility ? ownerKey(item, item.responsibility) : null, question?.owner ? ownerKey(item, question.owner) : null, COORD_KEY[question?.coord] || null]) {
    if (fits(k)) return k;
  }
  return null;
}

/** The default by-when: the design team by the next drawing issue; the client and Blue Leaf by the next meeting. */
export function defaultDue(whoKey) {
  if (DESIGN_TEAM_KEYS.has(whoKey)) return "next_issue";
  if (whoKey === "client" || whoKey === "blue_leaf") return "next_meeting";
  return "";
}

// ── What ───────────────────────────────────────────────────────────────────────────────────────────

const liveSelected = (item) => {
  const a = item?.answer;
  if (!a || !(Number(a.v) <= ANSWER_SCHEMA_VERSION)) return [];
  return (a.selected || []).filter((s) => s && !s.stale);
};
const hiddenOptions = (item) => HIDDEN_OPTION_IDS[resolvePromptId(item?.promptKey)] || null;
/** The card's choices in words, never an option that can't be offered (engineered stone): it would print in the brief. */
const visibleChips = (item) => { const h = hiddenOptions(item); return chipWords(item, h ? (s) => !h.has(s.optionId) : null); };
function onlyChips(typed, chips) {
  if (!typed || !chips) return false;
  const have = new Set(chips.toLowerCase().split(/,\s*/));
  return typed.toLowerCase().split(/\s*,\s*/).every((p) => have.has(p.trim()));
}
const isParked = (item) => ["unresolved", "client_unsure"].includes(item?.answer?.state);
/** Nothing chosen and nothing typed: a choice with no answer yet. */
const nothingChosen = (item) => !liveSelected(item).length && !clean(item?.description);
/** The record's words: what was typed (tidied, unless it only lists the chips), else the chips. "" when there are none. */
function wordsOf(item) {
  const chips = visibleChips(item);
  const typed = clean(item?.description);
  if (typed && !isUnfinished(typed) && !onlyChips(typed, chips)) return tidy(typed).replace(/\.+$/, "");
  return chips;
}

/**
 * The sheet's prefilled "What's needed" (spec S4 prefill rules):
 *   an action record → its own words;
 *   an element still in or out → "Decide whether <subject> is part of this job";
 *   a choice with no answer (or one parked as not decided) → "Decide the <subject>";
 *   a record with recorded words or chips → "Confirm <words>".
 */
export function prefillWhat(_reg, item) {
  if (!item) return "";
  const subject = lowerFirst(labelOf(item));
  if (item.itemKind === "action") return tidy(item.description);
  if (isInOut(item)) return `Decide whether ${subject} is part of this job`;
  if (isParked(item) || nothingChosen(item)) return `Decide the ${subject}`;
  const words = wordsOf(item);
  return words ? `Confirm ${lowerFirst(words)}` : `Decide the ${subject}`;
}

// ── What a tap writes ──────────────────────────────────────────────────────────────────────────────

/** The existing "not decided" reason that goes with each who (Tab 27 B09), so the counts agree. */
export const PARK_REASON = { client: "decide_later", architect: "designer_to_confirm", engineer: "designer_to_confirm", energy: "designer_to_confirm", blue_leaf: "blue_leaf_to_advise" };
const MAPPED_REASONS = new Set(Object.values(PARK_REASON));
export const isLocked = (item) => !!(item?.sync?.locked || item?.sync?.baselined);

/**
 * Naming who on a choice with no answer parks it as not decided, with the matching reason. Returns the answer partial
 * (through the card's own itemPatch, so answer.v and every other answer key are kept), or null when nothing changes.
 * Never on a client-approved or locked record: an action isn't a content change, so it mustn't move the answer.
 */
function parkPatch(item, whoKey) {
  if (!item || item.itemKind === "action" || isInOut(item) || item.certainty === "client_approved" || isLocked(item)) return null;
  const qid = resolvePromptId(item.promptKey);
  const cfg = qid ? configForRow(qid, item) : null;
  if (!cfg || cfg.handling !== "choice" || !isGuidedConfig(cfg) || !answerIsEditable(item.answer)) return null;
  const a = item.answer;
  const reason = PARK_REASON[whoKey] || "";
  if (a?.state === "unresolved") {
    const cur = a.unresolved?.reason || "";
    // Keep a reason that names no one ("Awaiting drawings / info"), and the one already matching.
    if (!reason || cur === reason || (cur && !MAPPED_REASONS.has(cur))) return null;
    return itemPatch(item, cfg, setUnresolvedReason(cfg, a, reason));
  }
  if (a?.state === "not_applicable" || a?.state === "client_unsure" || !nothingChosen(item)) return null;
  return itemPatch(item, cfg, reason ? setUnresolvedReason(cfg, a, reason) : toggleNotDecided(cfg, a));
}

/**
 * The item partial for a Who tap (or a change of by-when / words once set): responsibility, actionRole (only for a
 * consultant; makeItem drops it otherwise), nextAction, actionDue, resolved false; plus the parked answer for a choice
 * with no answer. An action record with no words of its own takes these as its words.
 */
export function setActionPatch(item, choice, { what = "", due = "" } = {}) {
  const patch = {
    responsibility: choice.responsibility,
    actionRole: choice.responsibility === "consultant" ? choice.actionRole || "" : "",
    nextAction: clean(what),
    actionDue: normaliseActionDue(due),
    resolved: false,
  };
  if (item?.itemKind === "action" && !clean(item.description) && clean(what)) patch.description = clean(what);
  const parked = parkPatch(item, choice.key);
  return parked ? { ...parked, ...patch } : patch;
}

/**
 * Naming who on a point that already says something (the Actions list's inline chips, and the extra records a sheet
 * names at once): the words and the by-when already typed stay; only a blank record takes the prefill and the default
 * by-when for that who. A by-when given here (the sheet's own choice) wins over both.
 */
export function assignPatch(reg, item, choice, { due } = {}) {
  return setActionPatch(item, choice, {
    what: clean(item?.nextAction) || prefillWhat(reg, item),
    due: due ?? (item?.actionDue || defaultDue(choice.key)),
  });
}

/**
 * What closing the sheet saves of "What's needed", or null for nothing (spec S4: "nothing is lost", and only typing new
 * text on a done action reopens it):
 *   set or done ...... only words really typed: { nextAction, resolved: false }; merely opening and closing saves nothing
 *   a new follow-up .. its words are its own: { description, nextAction }
 *   no one named ..... words typed before anyone is named wait under "No one named yet": { nextAction, resolved: false }
 * state is flagState(item); text the box's words; savedWhat the record's nextAction; edited whether staff typed.
 */
export function whatToSaveOnClose({ state, itemKind, isNew, savedWhat, text, edited }) {
  const t = clean(text);
  if (!t || t === clean(savedWhat)) return null;
  if (state === "set" || state === "done") return edited ? { nextAction: t, resolved: false } : null;
  if (isNew && itemKind === "action") return { description: t, nextAction: t };
  return edited ? { nextAction: t, resolved: false } : null;
}

/** Done: closed, kept, no longer printed. */
export const donePatch = () => ({ resolved: true });

/**
 * Checked (a technical check): verified with who, when and the reference. null without a reference: "verified" needs
 * one (the existing rule, register.js itemIssues). An action on it is closed too.
 */
export function checkedPatch(item, { ref, by, at } = {}) {
  if (!clean(ref)) return null;
  const closes = !!(clean(item?.nextAction) || item?.actionDue || item?.itemKind === "action");
  return { technicalStatus: "verified", technicalEvidence: { at: at || new Date().toISOString(), by: clean(by) || "Blue Leaf", ref: clean(ref) }, ...(closes ? { resolved: true } : {}) };
}

/** Clear: who, by-when and words go. The owner stays when the question has a default owner. */
export function clearPatch(item, question = questionById(resolvePromptId(item?.promptKey))) {
  return { responsibility: question?.owner || "", actionRole: "", nextAction: "", actionDue: "", resolved: false };
}

/** The fields a patch may change, to put them back (Undo). */
export function undoPatchFor(item, patch) {
  return Object.fromEntries(Object.keys(patch || {}).map((k) => [k, item?.[k] ?? (k === "technicalEvidence" ? null : "")]));
}

// ── How it reads ───────────────────────────────────────────────────────────────────────────────────

/**
 * The ⚑'s state on a row: "none" (outline grey: nothing needed), "open" (outline amber: open but no one asked),
 * "set" (the pill "<Who> · <By when>") or "done" (the muted "✓ Done").
 */
export function flagState(item) {
  if (!item) return "none";
  if (item.resolved) return "done";
  if (clean(item.nextAction) || item.actionDue) return "set";
  return isOpenPoint(item) ? "open" : "none";
}
/** The pill: "Architect · Next issue", "Client · 28 Nov", "Engineer". */
export function pillWords(context, item) {
  const who = whoOf(context, item);
  const word = who.key === "none" ? "No one named" : who.key === "consultant" ? who.label : WHO_GROUP_LABEL[who.key];
  const by = dueLabel(item?.actionDue);
  return by ? `${word} · ${by}` : word;
}
/** By when, mid-sentence: "next drawing issue", "next meeting", "28 Nov". */
export const dueWords = (due) => ({ next_issue: "next drawing issue", next_meeting: "next meeting" }[due] || dueLabel(due));
/** Today, as YYYY-MM-DD on this device's clock (staff work in Adelaide). */
export function todayIso(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
/** A picked date that has passed. */
export const isOverdue = (due, today = todayIso()) => /^\d{4}-\d{2}-\d{2}$/.test(String(due || "")) && due < today;

/** The toast after a Who tap: "Architect · next drawing issue — added to Actions". */
export const addedWords = (choice, due) => `${choice.short || choice.label}${dueWords(due) ? ` · ${dueWords(due)}` : ""} — added to Actions`;

export const FOOTNOTE_ARCHITECT = "Prints in the architect's brief under “Needed for the next drawing issue”.";
const FOOTNOTE_ARCHITECT_ROOM = "Prints in the architect's brief, in this room's row, with who and by when.";
export const FOOTNOTE_CLIENT = "Prints in the client's brief under “Decisions to make”.";
export const FOOTNOTE_BLUE_LEAF = "Not in the architect's brief. The client's brief lists it under “Decisions to make”.";
export const FOOTNOTE_OURS = "Our list only — doesn't print.";

/**
 * Where it prints, under the sheet's input: what the two briefs really do with the point, never more.
 *   The design team → the architect's 03 (openPoints "next_issue").
 *   The client → the client brief's "Decisions to make" (registerDocuments clientBriefFixture; the heading is
 *     scripts/documents/author-cpb.mjs). A requirement is never a decision there; it goes to the architect's 03 instead.
 *   Blue Leaf → never the architect's 03 (owner decision D3: forNextIssue leaves responsibility "blue_leaf" out), but the
 *     client brief lists Blue Leaf's decisions under "Decisions to make" after the client's own (its design is locked, so
 *     the footnote says so, finding R16). A requirement isn't a decision there either: that one is our list only.
 * Asked of the same rules (forNextIssue, the brief's requirement rule), so the footnote can't say otherwise.
 */
export function footnoteFor(item, whoKey) {
  // A point that belongs to one room prints in that room's row in 04, not in 03 (owner answer 17 Nov).
  const FOOTNOTE_ARCHITECT_HERE = item?.roomId ? FOOTNOTE_ARCHITECT_ROOM : FOOTNOTE_ARCHITECT;
  if (DESIGN_TEAM_KEYS.has(whoKey)) return FOOTNOTE_ARCHITECT_HERE;
  const choice = WHO_CHOICES.find((c) => c.key === whoKey);
  const asWho = item && choice ? { ...item, responsibility: choice.responsibility } : null;
  const requirement = item?.itemKind === "requirement";
  if (whoKey === "client") return requirement && forNextIssue(asWho) ? FOOTNOTE_ARCHITECT_HERE : FOOTNOTE_CLIENT;
  if (whoKey === "blue_leaf") {
    if (asWho && forNextIssue(asWho)) return FOOTNOTE_ARCHITECT_HERE;
    return requirement ? FOOTNOTE_OURS : FOOTNOTE_BLUE_LEAF;
  }
  return "";
}

/** The sheet's subject line: "Throughout · Gutters", "Laundry · Washer / dryer layout". */
export function subjectLine(reg, item, extras = []) {
  const labels = [item, ...extras].filter(Boolean).map(labelOf);
  return `${placeOf(reg, item).label} · ${andList(labels.map((l, k) => (k ? lowerFirst(l) : l)))}`;
}

// ── The Actions list ───────────────────────────────────────────────────────────────────────────────

/** A point's own name in the list ("Retaining and pool" when two elements are asked once). */
export function pointSubject(point) {
  const labels = point?.labels?.length ? point.labels : [point?.label || ""];
  return andList(labels.map((l, k) => (k ? lowerFirst(l) : l)));
}
export const pointKey = (point) => (point?.ids || []).join("+");

/** openPoints, grouped by who in print order: [{ key, label, points }]. Flattened, it is openPoints exactly. */
export function groupPoints(points) {
  return WHO_ORDER.map((key) => ({ key, label: WHO_GROUP_LABEL[key], points: (points || []).filter((p) => p.who.key === key) })).filter((g) => g.points.length);
}

/** Tapping a row: one with nothing asked yet opens the sheet at "What's needed" (its words say so); others open the record. */
export const rowOpensSheet = (point) => !!pointLine(point).nothingAsked;

/** The group a point with no one named sits in ("No one named yet"). */
export const UNNAMED_GROUP = "none";

/**
 * The Actions list's points: openPoints with every element its own row (merge: false), so Retaining and Pool each get
 * their own who chips and count once each. Only the printed 03 asks in-or-out elements in one place as one line.
 * The header pill, the Actions list and its filter counts all come from here.
 */
export const actionPoints = (reg, context, scope = "next_issue") => (reg ? openPoints(reg, context, { scope, merge: false }) : []);

/** The header pill: { count: the next-issue points (actionPoints), unnamed: those with no one named (the amber dot) }. */
export function actionsSummary(reg, context) {
  if (!reg) return { count: 0, unnamed: 0 };
  const next = actionPoints(reg, context, "next_issue");
  return { count: next.length, unnamed: next.filter((p) => p.who.key === UNNAMED_GROUP).length };
}

/**
 * Where the Actions list opens. initialFilter "next_issue" | "all" picks the filter; "unnamed" (the Documents step's
 * "Name who") is the next-issue list opened at its "No one named yet" group. Anything else is the next-issue list.
 */
export function openingView(initialFilter) {
  if (initialFilter === "all") return { filter: "all", focusGroup: null };
  return { filter: "next_issue", focusGroup: initialFilter === "unnamed" ? UNNAMED_GROUP : null };
}

export const NOTHING_ASKED = "Nothing asked yet";
const REASON_LINE = { designer_to_confirm: "Designer to confirm", decide_later: "Deciding later", blue_leaf_to_advise: "Blue Leaf to advise", awaiting_info: "Awaiting drawings or info" };
/** A row's second line: what's needed (ink), or an amber prompt. nothingAsked marks the rows the sheet should fill. */
export function pointLine(point) {
  const it = point.item;
  if (clean(it.nextAction)) return { text: tidy(it.nextAction), tone: "ink" };
  if (it.itemKind === "action") return clean(it.description) ? { text: tidy(it.description), tone: "ink" } : { text: NOTHING_ASKED, tone: "amber", nothingAsked: true };
  if (point.inOut) return { text: "In or out of this job?", tone: "amber" };
  if (it.answer?.state === "unresolved") {
    const r = REASON_LINE[it.answer.unresolved?.reason];
    if (r) return { text: r, tone: "ink" };
    const note = clean(it.answer.unresolved?.note) || clean(it.answer.note);
    return note ? { text: tidy(note), tone: "ink" } : { text: "Not decided", tone: "amber" };
  }
  if (it.technicalStatus === "needs_verification" && point.who.key === "none") return { text: "Check still open", tone: "amber" };
  return { text: NOTHING_ASKED, tone: "amber", nothingAsked: true };
}

const HELD_TAG = {
  no_ask: "Say what's needed — won't print until it does",
  unfinished: "Finish the words — won't print until they're finished",
  contradicts: "Its words contradict its status — won't print until fixed",
  disagrees: "Disagrees with the room's Work — won't print",
};
/** A row's tags: [{ text, tone: "amber" | "red" }]. */
export function pointTags(point, today = todayIso()) {
  const it = point.item, tags = [];
  const h = hiddenOptions(it);
  for (const s of h ? liveSelected(it).filter((x) => h.has(x.optionId)) : []) tags.push({ text: `${clean(s.label) || "This option"} can't be used`, tone: "red" });
  if (point.held && HELD_TAG[point.held]) tags.push({ text: HELD_TAG[point.held], tone: "amber" });
  if (point.who.key === "client" && it.technicalStatus === "needs_verification") tags.push({ text: "A technical check — usually not the client's", tone: "amber" });
  if (isOverdue(point.due, today)) tags.push({ text: "Overdue", tone: "red" });
  return tags;
}

/**
 * "Copy list": plain text, one line a point, e.g.
 *   Architect — Windows & glazing priorities (Throughout): confirm double glazed aluminium, Jolong, white frames — next drawing issue
 */
export function copyListText(points) {
  return (points || []).map((p) => {
    const who = p.who.key === "consultant" ? p.who.label : WHO_GROUP_LABEL[p.who.key] || p.who.label;
    const named = p.who.named ? ` (${p.who.named})` : "";
    const ask = p.inOut && p.ids.length > 1 ? "are they part of this job?" : p.ask;
    const by = dueWords(p.due);
    return `${who}${named} — ${pointSubject(p)} (${p.place.label}): ${ask}${by ? ` — ${by}` : ""}`;
  }).join("\n");
}
/** "Copied 9 actions" / "Copied 1 action". */
export const copiedWords = (n) => `Copied ${n} action${n === 1 ? "" : "s"}`;

/** A new whole-job follow-up (spec: "+ Needs action for the whole job" → a W-025 action record). Room ones are R-010. */
export const WHOLE_JOB_ACTION_SEED = { promptKey: "W-025", itemKind: "action", category: "notes", section: "project" };
