/**
 * registerChoice.js — what a tap on a guided answer does to the typed answer (R05 P4a, Tab 27 Gate 2).
 *
 * The configuration is generated: ANSWER_CONFIG in registerQuestions.js, from the Tab 21 answer map. This module
 * only reads it. Every function takes an answer and returns a new one, so the same rules hold on screen and in tests.
 *
 * The rules that matter:
 *   • A tap writes option ids and copies the label once. Rewording the config later never changes a stored answer.
 *   • Changing an earlier choice never loses a later one. A dependent answer moves across if the new branch has the
 *     same option; otherwise it stays on the record flagged stale, to be reused or removed by a person. Where a
 *     follow-up is a statement about the option above it (W-005: this hazard was inspected), it never moves across.
 *   • Nothing here can approve, verify or price: no function writes those fields. The strongest thing a choice can
 *     do to item.certainty is move "not discussed" to "preference".
 *   • A question whose dispositionUse is "none" never writes item.disposition, whatever is tapped.
 *
 * Pure module — no React, no network. Safe in the browser and in Node.
 */
import { ANSWER_CONFIG, ANSWER_CONFIG_VERSION } from "./registerQuestions.js";
import { normaliseAnswer, answerSummary, statedText, OPEN_OPTION_IDS, UNRESOLVED_REASONS, ANSWER_SCHEMA_VERSION } from "./registerAnswer.js";

export { ANSWER_CONFIG_VERSION };

/** The control config for a Tab 21 question id, or null. */
export const answerConfigFor = (id) => ANSWER_CONFIG[id] || null;

/** Can this answer be edited by the card? One written by a newer schema is left alone. */
export const answerIsEditable = (answer) => !answer || Number(answer.v) <= ANSWER_SCHEMA_VERSION;

/** A question answered on the card (buttons), rather than by a typed note or on the Project step. */
export const isGuidedConfig = (cfg) => !!cfg && (cfg.handling === "choice" || cfg.handling === "record");

/** May this question use the work disposition at all? Unconfigured (custom, legacy) items may. */
export const dispositionApplies = (cfg) => !cfg || cfg.dispositionUse !== "none";

const SETTLE_OUT = [["by_others", "By others"], ["excluded", "Excluded"]];
const SETTLE_OUT_MORE = [["deferred", "Deferred"], ["retain", "Existing to remain"]];
/** The settle-out answers a question offers beside its choices. Only choices use these. */
export function settleOptions(cfg, { showDetail = false } = {}) {
  if (cfg?.dispositionUse !== "settled_only") return [];
  return showDetail ? [...SETTLE_OUT, ...SETTLE_OUT_MORE] : SETTLE_OUT;
}

// ── Reading the tree ──────────────────────────────────────────────────────────────────────────────

const samePath = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);
const isPrefix = (prefix, path) => prefix.length <= path.length && prefix.every((id, i) => id === path[i]);
const ctxOf = (a) => ({ elementKey: a?.element?.key || "" });
const newElementId = () => {
  try { if (globalThis.crypto?.randomUUID) return "el_" + globalThis.crypto.randomUUID(); } catch { /* fall through */ }
  return "el_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
};

function childrenOf(cfg, option, ctx) {
  if (option.children) return option.children;
  if (option.details && cfg.constructionTypes) return cfg.constructionTypes[ctx.elementKey] || null;
  return null;
}

function optionAt(cfg, path, ctx) {
  let level = cfg.options || [], found = null;
  for (const id of path) {
    found = (level || []).find((o) => o.id === id);
    if (!found) return null;
    level = childrenOf(cfg, found, ctx);
  }
  return found;
}

function modeAt(cfg, parent, ctx) {
  if (!parent.length) return cfg.select === "single" ? "single" : "multi";   // grouped headings are independent of each other
  const opt = optionAt(cfg, parent, ctx);
  return opt?.multi || cfg.childSelect === "multi" ? "multi" : "single";
}

const isGroupHeading = (cfg, path) => cfg.select === "groups" && path.length === 1;

/** What people read for this path. The label of each step, so "Corrugated" keeps its "Metal roofing · Pitched". */
function labelFor(cfg, path, ctx) {
  let level = cfg.options || [];
  const parts = [];
  for (const id of path) {
    const o = (level || []).find((x) => x.id === id);
    if (!o) break;
    parts.push(o.label);
    level = childrenOf(cfg, o, ctx);
  }
  return OPEN_OPTION_IDS.has(path[path.length - 1]) ? parts[parts.length - 1] : parts.join(" · ");
}

const isOn = (selected, path) => selected.some((e) => !e.stale && isPrefix(path, e.path));
const hasWords = (e) => OPEN_OPTION_IDS.has(e.optionId) && !!statedText(e.label);

// ── Working copy ──────────────────────────────────────────────────────────────────────────────────

function working(cfg, answer) {
  const a = normaliseAnswer(answer) || {};
  return { ...a, nature: a.nature || cfg.nature, selected: a.selected || [], state: a.state || "not_discussed", unresolved: a.unresolved || null, note: a.note || "" };
}
const finish = (w) => normaliseAnswer({ ...w, v: ANSWER_SCHEMA_VERSION, configVersion: ANSWER_CONFIG_VERSION });

/** The state a record falls back to once nothing is parked. */
function restedState(cfg, w) {
  const ctx = ctxOf(w);
  const live = w.selected.filter((e) => !e.stale);
  const carried = live.map((e) => optionAt(cfg, e.path, ctx)?.state).find(Boolean);
  if (carried) return carried;
  return live.length || w.element ? "recorded" : "not_discussed";
}

const isParked = (state) => state === "unresolved" || state === "client_unsure";

// ── Choosing ──────────────────────────────────────────────────────────────────────────────────────

/** Make room for `here` among its single-answer siblings. Anything deeper on a replaced branch moves across or is flagged. */
function resolveSiblings(cfg, entries, parent, here, ctx, keepReplaced) {
  const out = [];
  for (const e of entries) {
    const known = !!optionAt(cfg, e.path, ctx);                           // a stored path the config no longer has is left alone
    const sibling = known && !e.stale && e.path.length > parent.length && isPrefix(parent, e.path) && e.path[parent.length] !== here[parent.length];
    if (!sibling) { out.push(e); continue; }
    if (e.path.length > here.length) {                                    // something was chosen further down that branch
      const moved = cfg.childrenBoundToParent ? null : [...here, ...e.path.slice(here.length)];
      if (moved && optionAt(cfg, moved, ctx)) out.push({ ...e, path: moved, optionId: moved[moved.length - 1], label: hasWords(e) ? e.label : labelFor(cfg, moved, ctx) });
      else out.push({ ...e, stale: true });
    } else if (hasWords(e) || keepReplaced) {
      out.push({ ...e, stale: true });                                    // the person's own words, or product details entered against it
    }                                                                     // otherwise it was simply the old answer at this level
  }
  return out;
}

function switchOn(cfg, selected, path, ctx, keepLabel, keepReplaced) {
  let entries = selected.filter((e) => !(e.stale && samePath(e.path, path) && !hasWords(e)));   // chosen again: the live entry replaces the flagged copy
  for (let depth = 0; depth < path.length; depth++) {
    const parent = path.slice(0, depth);
    if (modeAt(cfg, parent, ctx) === "single") entries = resolveSiblings(cfg, entries, parent, path.slice(0, depth + 1), ctx, keepReplaced);
  }
  entries = entries.filter((e) => e.stale || e.path.length >= path.length || !isPrefix(e.path, path));   // this path implies its parents
  if (!entries.some((e) => !e.stale && isPrefix(path, e.path))) entries.push({ optionId: path[path.length - 1], path, label: keepLabel ?? labelFor(cfg, path, ctx) });
  return entries;
}

function switchOff(cfg, selected, path, ctx) {
  const out = [];
  for (const e of selected) {
    if (e.stale || !isPrefix(path, e.path)) { out.push(e); continue; }
    if (e.path.length > path.length) out.push({ ...e, stale: true });     // later answers stay, flagged
  }
  const parent = path.slice(0, -1);
  if (parent.length && !isGroupHeading(cfg, parent) && !isOn(out, parent)) {
    out.push({ optionId: parent[parent.length - 1], path: parent, label: labelFor(cfg, parent, ctx) });  // the earlier step still stands
  }
  return out;
}

function limitReached(cfg, selected) {
  if (!cfg.max) return false;
  return new Set(selected.filter((e) => !e.stale).map((e) => e.path[0])).size >= cfg.max;
}

/** Would bringing this entry back take the question past its limit? Not if its top-level choice is already counted. */
const reuseBlocked = (cfg, selected, path) => limitReached(cfg, selected) && !selected.some((e) => !e.stale && e.path[0] === path[0]);

/**
 * One tap on an option, by its full path. An unknown path, or one past the limit, changes nothing.
 * keepReplaced: a plain replaced answer is kept flagged too, for an item with product details entered against it.
 */
export function toggleOption(cfg, answer, path, { keepReplaced = false } = {}) {
  const w = working(cfg, answer);
  const ctx = ctxOf(w);
  const opt = optionAt(cfg, path, ctx);
  if (!opt) return normaliseAnswer(answer);
  if (isOn(w.selected, path)) {
    if (w.selected.some((e) => !e.stale && samePath(e.path, path) && hasWords(e))) return normaliseAnswer(answer);   // typed words go through Remove
    const selected = switchOff(cfg, w.selected, path, ctx);
    const next = { ...w, selected };
    const keepParked = w.state === "unresolved" || (w.state === "client_unsure" && opt.state !== "client_unsure");
    return finish({ ...next, state: keepParked ? w.state : restedState(cfg, next) });
  }
  if (!path.slice(1).length && limitReached(cfg, w.selected)) return normaliseAnswer(answer);
  const selected = switchOn(cfg, w.selected, path, ctx, undefined, keepReplaced);
  return finish({ ...w, selected, unresolved: null, state: opt.state || "recorded" });
}

/** The person's own words on an open option ("Other"). Empty goes back to the option's own label. */
export function setOpenWords(cfg, answer, path, previousLabel, words) {
  const w = working(cfg, answer);
  const label = String(words || "") || labelFor(cfg, path, ctxOf(w));
  return finish({ ...w, selected: w.selected.map((e) => (!e.stale && samePath(e.path, path) && e.label === previousLabel ? { ...e, label } : e)) });
}

/** Take one entry off the record. Explicit, so nothing is flagged in its place except answers beneath it. */
export function removeChoice(cfg, answer, { path, label }) {
  const w = working(cfg, answer);
  const ctx = ctxOf(w);
  let done = false;
  let selected = w.selected.filter((e) => { const hit = !done && samePath(e.path, path) && e.label === label; if (hit) done = true; return !hit; });
  if (!done) return normaliseAnswer(answer);
  const parent = path.slice(0, -1);
  const removedLive = !w.selected.find((e) => samePath(e.path, path) && e.label === label)?.stale;
  if (removedLive && parent.length && !isGroupHeading(cfg, parent) && !isOn(selected, parent) && optionAt(cfg, parent, ctx)) {
    selected = [...selected, { optionId: parent[parent.length - 1], path: parent, label: labelFor(cfg, parent, ctx) }];
  }
  const next = { ...w, selected };
  return finish({ ...next, state: isParked(w.state) || w.state === "not_applicable" ? w.state : restedState(cfg, next) });
}

/** Bring a flagged answer back. It takes its place as if it had just been chosen, so the question's limit still holds. */
export function reuseChoice(cfg, answer, { path, label }) {
  const w = working(cfg, answer);
  const ctx = ctxOf(w);
  const opt = optionAt(cfg, path, ctx);
  const entry = w.selected.find((e) => e.stale && samePath(e.path, path) && e.label === label);
  if (!opt || !entry || reuseBlocked(cfg, w.selected, path)) return normaliseAnswer(answer);
  const rest = w.selected.filter((e) => e !== entry);
  return finish({ ...w, selected: switchOn(cfg, rest, path, ctx, entry.label), unresolved: null, state: opt.state || "recorded" });
}

// ── Which element, which zone ─────────────────────────────────────────────────────────────────────

/** Anything no longer valid for this element stays on the record, flagged. The part of its path that still holds stays live. */
function revalidate(cfg, w) {
  const ctx = ctxOf(w);
  const out = [];
  for (const e of w.selected) {
    if (e.stale || optionAt(cfg, e.path, ctx)) { out.push(e); continue; }
    out.push({ ...e, stale: true });
    const held = e.path.slice(0, -1);
    if (held.length && optionAt(cfg, held, ctx) && !isOn([...out, ...w.selected.filter((x) => x !== e && optionAt(cfg, x.path, ctx))], held)) {
      out.push({ optionId: held[held.length - 1], path: held, label: labelFor(cfg, held, ctx) });
    }
  }
  return { ...w, selected: out };
}

export function chooseZone(cfg, answer, key) {
  const w = working(cfg, answer);
  const o = (cfg.zones || []).find((z) => z.id === key);
  if (!o) return normaliseAnswer(answer);
  return finish({ ...w, zone: w.zone?.key === key ? null : { key, label: o.label } });
}

export function chooseElement(cfg, answer, key, { id } = {}) {
  const w = working(cfg, answer);
  const o = (cfg.elements || []).find((x) => x.id === key);
  if (!o) return normaliseAnswer(answer);
  const element = w.element?.key === key ? null : { id: w.element?.id || id || newElementId(), key, label: o.label };
  const next = revalidate(cfg, { ...w, element });
  return finish({ ...next, state: isParked(w.state) || w.state === "not_applicable" ? w.state : restedState(cfg, next) });
}

export function setZoneWords(cfg, answer, words) {
  const w = working(cfg, answer);
  if (!w.zone) return normaliseAnswer(answer);
  const o = (cfg.zones || []).find((z) => z.id === w.zone.key);
  return finish({ ...w, zone: { ...w.zone, label: String(words || "") || o?.label || "" } });
}

export function setElementWords(cfg, answer, words) {
  const w = working(cfg, answer);
  if (!w.element) return normaliseAnswer(answer);
  const o = (cfg.elements || []).find((x) => x.id === w.element.key);
  return finish({ ...w, element: { ...w.element, label: String(words || "") || o?.label || "" } });
}

// ── No answer yet (Tab 27 B09) ────────────────────────────────────────────────────────────────────

/**
 * "Not decided". What has been chosen so far stays: a conversation may stop at any level (B02). The exception is taking
 * it off when a chosen option is what parks the question ("Unsure"): that option comes off too, or the tap would do nothing.
 */
export function toggleNotDecided(cfg, answer) {
  const w = working(cfg, answer);
  if (!isParked(w.state)) return finish({ ...w, state: "unresolved" });
  const ctx = ctxOf(w);
  const parking = w.selected.filter((e) => !e.stale && isParked(optionAt(cfg, e.path, ctx)?.state));
  const next = { ...w, unresolved: null, selected: parking.reduce((list, e) => switchOff(cfg, list, e.path, ctx), w.selected) };
  return finish({ ...next, state: restedState(cfg, next) });
}

export function setClientUnsure(cfg, answer) {
  const w = working(cfg, answer);
  return finish({ ...w, unresolved: null, state: w.state === "client_unsure" ? "unresolved" : "client_unsure" });
}

export function setUnresolvedReason(cfg, answer, reason) {
  const w = working(cfg, answer);
  if (!UNRESOLVED_REASONS[reason]) return normaliseAnswer(answer);
  const same = w.state === "unresolved" && w.unresolved?.reason === reason;
  return finish({ ...w, state: "unresolved", unresolved: same ? null : { ...(w.unresolved || {}), reason, note: w.unresolved?.note || "" } });
}

/** "N/A" says no choice holds, so anything chosen stays on the record flagged rather than live. */
export function toggleNotApplicable(cfg, answer) {
  const w = working(cfg, answer);
  if (w.state === "not_applicable") return finish({ ...w, state: restedState(cfg, w) });
  return finish({ ...w, unresolved: null, state: "not_applicable", selected: w.selected.map((e) => ({ ...e, stale: true })) });
}

export function setAnswerNote(cfg, answer, note) {
  return finish({ ...working(cfg, answer), note: String(note || "") });
}

/** A note written for the client to read. Separate from the staff note, which never leaves the office. */
export function setClientNote(cfg, answer, words) {
  return finish({ ...working(cfg, answer), clientNote: String(words || "") });
}

// ── From an answer to the item ────────────────────────────────────────────────────────────────────

function topOption(cfg, answer) {
  const ctx = ctxOf(answer);
  const hit = (answer?.selected || []).find((e) => !e.stale);
  return hit ? optionAt(cfg, [hit.path[0]], ctx) : null;
}

const TYPED_FIELDS = ["description", "product", "manufacturer", "model", "colour"];

/**
 * The item fields a new answer changes. Disposition and who-supplies follow the chosen action only where the
 * question says they may, and only when the action actually moved, so tapping an element can't reset an old record.
 * Certainty can only move between "not discussed" and "preference": it never reaches an approval.
 */
export function itemPatch(item, cfg, next, extra = {}) {
  const patch = { answer: next, ...extra };
  const prev = item.answer;
  const wasNa = prev?.state === "not_applicable", isNa = next?.state === "not_applicable";
  const before = topOption(cfg, prev), after = topOption(cfg, next);
  if (cfg.dispositionUse !== "none") {
    let d = item.disposition;
    if (isNa) d = "na";
    else if (cfg.dispositionUse === "settled_only") { if (wasNa && d === "na") d = "undecided"; }
    else if (before?.id !== after?.id || wasNa) d = after?.disposition || (after || before || wasNa ? "undecided" : d);
    if (d !== item.disposition) patch.disposition = d;
  }
  if (before?.id !== after?.id) {
    const supply = after?.supplyBy || (before?.supplyBy && item.supplyBy === before.supplyBy ? "" : item.supplyBy);
    if (supply !== item.supplyBy) patch.supplyBy = supply;
  }
  if (item.itemKind === "selection" || item.itemKind === "requirement") {
    const chosen = (next?.selected || []).some((e) => !e.stale);
    const typed = TYPED_FIELDS.some((f) => String(item[f] || "").trim());
    if (chosen && item.certainty === "not_considered") patch.certainty = "preference";
    if (!chosen && !typed && item.certainty === "preference") patch.certainty = "not_considered";
  }
  return patch;
}

/** A reason chosen on the card. Offers its usual owner only where nobody has been named. */
export function reasonPatch(item, cfg, reason) {
  const next = setUnresolvedReason(cfg, item.answer, reason);
  const prevDefault = UNRESOLVED_REASONS[item.answer?.unresolved?.reason]?.defaultOwner || "";
  const owner = UNRESOLVED_REASONS[next?.unresolved?.reason]?.defaultOwner || "";
  const open = !item.responsibility || (!!prevDefault && item.responsibility === prevDefault);
  return itemPatch(item, cfg, next, open && owner !== item.responsibility ? { responsibility: owner } : {});
}

/** By others / Excluded / Deferred / Existing to remain, on a choice. A second tap takes it back. */
export function settlePatch(item, cfg, disposition) {
  const w = working(cfg, item.answer);
  if (item.disposition === disposition) {
    const next = { ...w, state: isParked(w.state) ? w.state : restedState(cfg, w) };
    return { answer: finish(next), disposition: "undecided" };
  }
  const state = isParked(w.state) ? w.state : "recorded";
  return { answer: finish({ ...w, state }), disposition };
}

// ── What the card shows ───────────────────────────────────────────────────────────────────────────

function openRows(live, path) {
  return live.filter((e) => samePath(e.path, path)).map((e) => ({ label: e.label, words: statedText(e.label) }));
}

/** The rows to draw for this answer. No decisions are left to the component. */
export function choiceView(cfg, answer, { showDetail = false } = {}) {
  const a = normaliseAnswer(answer);
  const selected = a?.selected || [];
  const live = selected.filter((e) => !e.stale);
  const ctx = ctxOf(a);
  const levels = [];
  let hidden = false;
  const atLimit = limitReached(cfg, selected);
  const showing = (o, path) => {
    if (!o.detail || showDetail || isOn(live, path)) return true;
    hidden = true;
    return false;
  };
  const walk = (list, parent, heading) => {
    const headingsOnly = cfg.select === "groups" && !parent.length;
    const rows = (headingsOnly ? list.filter((o) => !childrenOf(cfg, o, ctx)) : list).filter((o) => showing(o, [...parent, o.id]));
    if (rows.length) {
      levels.push({
        key: parent.join("/") || "root", path: parent, heading: heading || (cfg.optionLevel === "action" && cfg.elements ? "What's happening" : null), mode: modeAt(cfg, parent, ctx),
        options: rows.map((o) => {
          const path = [...parent, o.id];
          const on = isOn(live, path);
          return { id: o.id, label: o.label, path, on, open: OPEN_OPTION_IDS.has(o.id), openRows: on && OPEN_OPTION_IDS.has(o.id) ? openRows(live, path) : [], disabled: !on && !parent.length && atLimit };
        }),
      });
    }
    for (const o of list) {
      const path = [...parent, o.id];
      const kids = childrenOf(cfg, o, ctx);
      if (kids && (headingsOnly || isOn(live, path))) walk(kids, path, o.label);
    }
  };
  walk(cfg.options || [], [], null);

  const pick = (list, key, label) => {
    if (!list) return null;
    const options = list.filter((o) => { if (!o.detail || showDetail || o.id === key) return true; hidden = true; return false; }).map((o) => ({ id: o.id, label: o.label, on: o.id === key }));
    return { options, key: key || "", open: OPEN_OPTION_IDS.has(key), words: OPEN_OPTION_IDS.has(key) ? statedText(label) : "" };
  };
  const zone = pick(cfg.zones, a?.zone?.key, a?.zone?.label);
  const element = pick(cfg.elements, a?.element?.key, a?.element?.label);

  const kept = selected.filter((e) => e.stale || !optionAt(cfg, e.path, ctx)).map((e) => ({
    path: e.path, label: e.label, stale: !!e.stale, canReuse: !!e.stale && !!optionAt(cfg, e.path, ctx) && !reuseBlocked(cfg, selected, e.path), key: `${e.path.join("/")}|${e.label}`,
  }));
  const state = a?.state || "not_discussed";
  return {
    levels, zone, element, kept, state, hidden, maxReached: atLimit,
    notDecided: isParked(state), clientUnsure: state === "client_unsure", notApplicable: state === "not_applicable",
    reason: state === "unresolved" ? a?.unresolved?.reason || "" : "", note: a?.note || "", clientNote: a?.clientNote || "",
    summary: state === "not_applicable" ? "" : answerSummary({ answer: a }),
    ownNotApplicable: (cfg.options || []).some((o) => o.state === "not_applicable"),
  };
}
