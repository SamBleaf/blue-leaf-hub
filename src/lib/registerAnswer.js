/**
 * registerAnswer.js — the typed answer a register item can carry (R05 P3, Tab 27 Gates 0.2 and 1).
 *
 * WHERE IT LIVES. One namespaced field, `item.answer`, on the existing register item:
 *   • lead scratchpad: inside the item row in `leads.selections_schedule`;
 *   • project: `register_detail.answer` on `client_selections` / `room_scope_items` (jsonb, mig 213).
 * No new table or column. `null` means a legacy / free-text record: its `description` stays the answer and
 * is never parsed.
 *
 * WHAT IT DOES NOT HOLD. Everything the register already has a home for stays there, so no fact has two
 * sources (CLAUDE.md Canonical Data Law, Tab 27 Gate 1.1):
 *   client preference ............ item.certainty ("preference" / "proposed")
 *   client approval .............. item.certainty ("client_approved") + item.evidence
 *   construction scope ........... item.disposition  (contract inclusion is DERIVED: contractInclusionOf)
 *   technical verification ....... item.technicalStatus + item.technicalEvidence
 *   pricing status ............... item.pricingStatus + item.pricingRef
 *   responsible party ............ item.responsibility, next step item.nextAction
 *   category / question link ..... item.category, item.promptKey
 *   shared default / exception ... item.isDefault, item.overridesDefaultId (zone via answer.zone)
 * Selecting an answer can never approve, verify, price or scope anything: there is no field here to do it.
 *
 * WHAT IT ADDS (schema v1):
 *   v              schema version
 *   state          ANSWER_STATES: Not discussed ≠ Client unsure ≠ N/A ≠ To be resolved ≠ Recorded
 *   nature         ANSWER_NATURES: a recorded fact is not construction scope
 *   configVersion  the answer-map version the option ids came from
 *   selected[]     { optionId, path[], label, stale? } — several allowed, partial paths allowed (B02).
 *                  optionId is always the path's last step. One entry per path, except on an open option
 *                  (OPEN_OPTION_IDS, "Other"), where the label holds the person's own words, so two Other
 *                  answers with different words are two entries.
 *                  stale = kept after an upstream choice changed, awaiting review; never silently dropped.
 *                  Words typed on an Other zone or element that is then replaced are kept here too, flagged, under a
 *                  path starting "_zone" or "_element". No option has that path, so they can be removed but not reused.
 *                  The label is copied once, when the option is chosen, and is what people read from then on
 *   element        { id, key, label } — the physical thing a repeatable item is about. key = its type
 *                  (driveway), id = which one (stable across edits, separates two driveways), label = the
 *                  words people read ("Front driveway")
 *   zone           { key, label } — main floor / bedrooms / wet areas, façade zone, paint surface …
 *   areaIds[]      room / project-area ids this item covers (same item from Site & Existing and Rooms)
 *   sourceQuestionIds[]  Tab 21 ids a merged card stands in for (W-004 / W-006 / W-008)
 *   linkedItemIds[]      related items, e.g. gutters → roof
 *   unresolved     { reason, note } — why it is parked; the owner is item.responsibility (no forced note)
 *   assumption     { origin, tier, baselineVersion, categoryKey, text, at, by } — INTERNAL pricing assumption
 *   delivery       { method, trade, note } — INTERNAL, decided at Tender, independent of contract inclusion
 *   note           short INTERNAL staff note
 *   clientNote     words written FOR the client, where a question asks for them (P-005 "plus note"). Only present
 *                  when something was written. Printed in the Client Brief, so it counts as what the answer says
 *
 * INTERNAL means staff only. `clientSafeAnswer` is an allow-list: anything not named there cannot reach a
 * client projection, including fields added later.
 *
 * Pure module — no React, no network. Safe in the browser and in Node.
 */

export const ANSWER_SCHEMA_VERSION = 1;
export const ANSWER_MAP_VERSION = "tab21-answer-map-v1.0";

export const ANSWER_STATES = {
  not_discussed: "Not discussed",
  recorded: "Recorded",
  client_unsure: "Client unsure",
  unresolved: "To be resolved",
  not_applicable: "Not applicable",
};

/** What the record IS. Only "choice" can become a client-facing selection. */
export const ANSWER_NATURES = {
  fact: "Fact",
  choice: "Client choice",
  scope: "Construction scope",
  requirement: "Requirement",
  risk: "Risk / investigation",
  action: "Action",
  technical: "Technical check",
};

/** Tab 27 B09. defaultOwner is a RESPONSIBILITIES key, offered by the UI and stored on item.responsibility. */
export const UNRESOLVED_REASONS = {
  decide_later: { label: "Decide later", defaultOwner: "client" },
  blue_leaf_to_advise: { label: "Blue Leaf to advise", defaultOwner: "blue_leaf" },
  designer_to_confirm: { label: "Designer / consultant to confirm", defaultOwner: "architect" },
  awaiting_info: { label: "Awaiting drawings / info", defaultOwner: "" },
};

export const ASSUMPTION_ORIGINS = { blue_leaf_baseline: "Blue Leaf preliminary pricing assumption" };
export const BASELINE_TIERS = { standard: "Standard", upgraded: "Upgraded", premium: "Premium" };

/** Who physically delivers included work. Decided at Tender (B13); says nothing about contract inclusion. */
export const DELIVERY_METHODS = { undecided: "Not decided", self_perform: "Blue Leaf crew", subcontract: "Subcontracted" };

// ── Canonical form ────────────────────────────────────────────────────────────────────────────────

const has = (set, k) => Object.prototype.hasOwnProperty.call(set, k);
const text = (v) => (v == null || typeof v === "object" ? "" : String(v).trim());
const keyIn = (set, v) => (typeof v === "string" && has(set, v) ? v : "");
const omit = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
const uniqueIds = (list) => (Array.isArray(list) ? [...new Set(list.map(text).filter(Boolean))] : []);

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

/** JSON with sorted keys. Postgres jsonb reorders keys, so plain JSON.stringify can't compare stored values. */
export const stableStringify = (v) => JSON.stringify(sortKeys(v ?? null));

/**
 * The catch-all options. Their label isn't configured wording: it is what the person actually said, and the
 * only place that text lives ("Other: spotted gum shiplap"). Never put it in the staff-only note.
 */
export const OPEN_OPTION_IDS = new Set(["other", "other_zone"]);

/** The words on an open option. The bare word "Other" says nothing. */
export const statedText = (label) => (/^other( zone)?$/i.test(label || "") ? "" : label || "");

function normSelected(list) {
  if (!Array.isArray(list)) return [];
  const byKey = new Map();
  for (const raw of list) {
    const e = typeof raw === "string" ? { optionId: raw } : raw;
    if (!e || typeof e !== "object") continue;
    const given = pathIds(e.path);
    // The path decides. A separate optionId could otherwise change what is shown without changing the path.
    const optionId = given[given.length - 1] || text(e.optionId);
    if (!optionId) continue;
    const path = given.length ? given : [optionId];
    const label = text(e.label);
    const key = path.join("\u0001") + (OPEN_OPTION_IDS.has(optionId) ? `\u0002${statedText(label)}` : "");
    const entry = { ...omit(e, ["optionId", "path", "label", "stale"]), optionId, path, label, ...(e.stale ? { stale: true } : {}) };
    const held = byKey.get(key);
    if (!held || (held.stale && !entry.stale)) byKey.set(key, entry);   // a live entry outranks a flagged copy; order holds
  }
  return [...byKey.values()];
}
// A path may repeat an id at different levels ("other" under "other"), so it is never de-duplicated.
function pathIds(list) { return Array.isArray(list) ? list.map(text).filter(Boolean) : []; }

function normElement(e) {
  if (!e || typeof e !== "object") return null;
  const out = { ...omit(e, ["id", "key", "label"]), id: text(e.id), key: text(e.key), label: text(e.label) };
  return out.id || out.key || out.label ? out : null;
}
function normZone(z) {
  if (!z || typeof z !== "object") return null;
  const out = { ...omit(z, ["key", "label"]), key: text(z.key), label: text(z.label) };
  return out.key || out.label ? out : null;
}
function normUnresolved(u) {
  if (!u || typeof u !== "object") return null;
  const out = { ...omit(u, ["reason", "note"]), reason: keyIn(UNRESOLVED_REASONS, u.reason), note: text(u.note) };
  return out.reason || out.note ? out : null;
}
/** One pricing assumption, in its one stored shape. Null when it says nothing. */
export function normaliseAssumption(a) {
  if (!a || typeof a !== "object") return null;
  const known = ["origin", "tier", "baselineVersion", "categoryKey", "text", "at", "by"];
  const out = {
    ...omit(a, known), origin: text(a.origin) || "blue_leaf_baseline", tier: keyIn(BASELINE_TIERS, a.tier),
    baselineVersion: text(a.baselineVersion), categoryKey: text(a.categoryKey), text: text(a.text), at: text(a.at), by: text(a.by),
  };
  return out.tier || out.text ? out : null;
}
function normDelivery(d) {
  if (!d || typeof d !== "object") return null;
  const out = { ...omit(d, ["method", "trade", "note"]), method: keyIn(DELIVERY_METHODS, d.method), trade: text(d.trade), note: text(d.note) };
  return out.method || out.trade || out.note ? out : null;
}

const KNOWN_KEYS = ["v", "state", "nature", "configVersion", "selected", "element", "zone", "areaIds", "sourceQuestionIds", "linkedItemIds", "unresolved", "assumption", "delivery", "note", "clientNote"];

/**
 * The one canonical form of an answer. Returns null when there is nothing in it. Same input in any key
 * order gives identical output, and normalising twice changes nothing. Unknown keys are kept, and a record
 * written by a newer schema is returned untouched, so an older reader can't strip what it doesn't know.
 */
export function normaliseAnswer(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (Number(raw.v) > ANSWER_SCHEMA_VERSION) return sortKeys(raw);
  const selected = normSelected(raw.selected);
  const unresolved = normUnresolved(raw.unresolved);
  const state = keyIn(ANSWER_STATES, raw.state) || (unresolved ? "unresolved" : selected.length ? "recorded" : "not_discussed");
  const a = {
    ...omit(raw, KNOWN_KEYS),
    v: ANSWER_SCHEMA_VERSION, state, nature: keyIn(ANSWER_NATURES, raw.nature) || null, configVersion: text(raw.configVersion),
    selected, element: normElement(raw.element), zone: normZone(raw.zone), areaIds: uniqueIds(raw.areaIds),
    sourceQuestionIds: uniqueIds(raw.sourceQuestionIds), linkedItemIds: uniqueIds(raw.linkedItemIds),
    unresolved, assumption: normaliseAssumption(raw.assumption), delivery: normDelivery(raw.delivery), note: text(raw.note),
    ...(text(raw.clientNote) ? { clientNote: text(raw.clientNote) } : {}),
  };
  const blank = state === "not_discussed" && !selected.length && !a.element && !a.zone && !a.areaIds.length && !a.sourceQuestionIds.length
    && !a.linkedItemIds.length && !unresolved && !a.assumption && !a.delivery && !a.note && !a.clientNote && !Object.keys(omit(raw, KNOWN_KEYS)).length;
  return blank ? null : sortKeys(a);
}

// ── Reading an answer ─────────────────────────────────────────────────────────────────────────────

const liveSelected = (a) => (Array.isArray(a?.selected) ? a.selected.filter((s) => !s.stale) : []);
const humanise = (id) => { const s = String(id || "").replace(/_/g, " "); return s.charAt(0).toUpperCase() + s.slice(1); };
/** What a chosen option reads as, everywhere it is shown. */
const shownLabel = (s) => s.label || humanise(s.optionId);

/** "legacy_text" for an old free-text record, otherwise the answer state. */
export function answerStateOf(item) {
  if (item?.answer) return item.answer.state || "not_discussed";
  const typed = [item?.description, item?.product, item?.model, item?.colour].some((v) => String(v || "").trim());
  return typed ? "legacy_text" : "not_discussed";
}

/** Why this is parked, and who holds it. Null unless the answer is actually in the "unresolved" state. */
export function unresolvedOf(item) {
  const a = item?.answer;
  if (!a || a.state !== "unresolved") return null;
  return { reason: a.unresolved?.reason || "", note: a.unresolved?.note || "", owner: item.responsibility || "", nextAction: item.nextAction || "" };
}

/**
 * The ONLY view of an answer a client document, portal row or notification may use. An allow-list of what
 * was chosen and where, plus a note staff wrote for the client. Internal notes, assumptions, unresolved reasons,
 * delivery and links can't appear.
 */
export function clientSafeAnswer(item) {
  const a = item?.answer;
  if (!a || !(Number(a.v) <= ANSWER_SCHEMA_VERSION)) return null;
  return {
    state: a.state,
    selected: liveSelected(a).map((s) => ({ label: shownLabel(s) })),
    element: a.element?.label || "",
    zone: a.zone?.label || "",
    ...(text(a.clientNote) ? { clientNote: text(a.clientNote) } : {}),
  };
}

/** One line from what was chosen, e.g. "Fibre cement sheet — Feature". "" when nothing was chosen. */
export function answerSummary(item) {
  const c = clientSafeAnswer(item);
  if (!c || (!c.selected.length && !c.element)) return "";
  return [c.element, c.selected.map((s) => s.label).join(", "), c.zone].filter(Boolean).join(" — ");
}

/** May this answer sit in the client-facing selection store? Facts, risks and N/A never can. */
export function answerAllowsClientSelection(answer) {
  if (!answer) return true;
  return answer.state !== "not_applicable" && (!answer.nature || answer.nature === "choice");
}

// ── Change detection ──────────────────────────────────────────────────────────────────────────────

/** Which element or zone this is, including the words people read for it. */
const placeOf = (thing) => (thing ? { id: thing.id || "", key: thing.key || "", label: thing.label || "" } : "");

/**
 * The part of an answer a client decision or agreed scope rests on: what was chosen and the words shown for
 * it, which element and zone it covers and the words shown for those, and what kind of record it is. It
 * compares what people read, not only the ids behind it. Stored labels are copied when someone chooses an
 * option, so rewording an option in the config never touches them. A note written for the client counts, because
 * the client reads it. Staff notes, assumptions and delivery don't count.
 */
function materialOf(raw) {
  const a = normaliseAnswer(raw);
  if (a && Number(a.v) > ANSWER_SCHEMA_VERSION) return a;
  const state = a?.state || "not_discussed";
  const selected = liveSelected(a).map((s) => `${s.path.join("/")}=${shownLabel(s)}`).sort();
  const element = placeOf(a?.element), zone = placeOf(a?.zone), areaIds = [...(a?.areaIds || [])].sort();
  // Stamping a nature on an answer that says nothing yet (a note on an old record) isn't a change.
  const saysSomething = state !== "not_discussed" || selected.length || element || zone || areaIds.length;
  return { state, nature: saysSomething ? a?.nature || "" : "", selected, element, zone, areaIds, ...(a?.clientNote ? { clientNote: a.clientNote } : {}) };
}
export const answerMaterialChanged = (a, b) => stableStringify(materialOf(a)) !== stableStringify(materialOf(b));

/** A short stable value that changes when what a default says changes. Used to flag confirmed rooms. */
export function answerFingerprint(item) {
  const basis = stableStringify({
    material: materialOf(item?.answer), description: text(item?.description), product: text(item?.product), manufacturer: text(item?.manufacturer),
    model: text(item?.model), colour: text(item?.colour), supplier: text(item?.supplier), disposition: item?.disposition || "",
    supplyBy: item?.supplyBy || "", responsibility: item?.responsibility || "",
  });
  let h = 5381;
  for (let i = 0; i < basis.length; i++) h = ((h << 5) + h + basis.charCodeAt(i)) >>> 0;
  return "fp_" + h.toString(36);
}

// ── Blue Leaf pricing assumptions (B05) ───────────────────────────────────────────────────────────

/** Has anyone actually chosen or stated something for this item? */
export function hasExplicitChoice(item) {
  if (liveSelected(item?.answer).length) return true;
  return [item?.description, item?.product, item?.manufacturer, item?.model, item?.colour].some((v) => String(v || "").trim());
}

/** The assumption an estimator may rely on: none once a real choice exists. */
export function activeAssumption(item) {
  const a = item?.answer?.assumption;
  return a && !hasExplicitChoice(item) ? a : null;
}

/**
 * Record a Blue Leaf pricing assumption on an unresolved item. Changes the answer block only, so it can't
 * become a preference, an approval, a product or a price. Returns the item unchanged if a real choice exists.
 */
export function applyPricingAssumption(item, assumption) {
  if (hasExplicitChoice(item)) return item;
  const answer = normaliseAnswer({ ...(item.answer || {}), assumption });
  return answer ? { ...item, answer } : item;
}

// ── Defaults, exceptions, room confirmation (B10, DEC-MRUX-02) ────────────────────────────────────

/** What a room exception starts from: the choice itself, not the default's own notes or assumption. */
export function exceptionAnswerFrom(def) {
  const a = def?.answer;
  if (!a) return null;
  return normaliseAnswer({ v: a.v, state: a.state, nature: a.nature, configVersion: a.configVersion, selected: a.selected, element: a.element, zone: a.zone, sourceQuestionIds: a.sourceQuestionIds });
}

/** room.defaultConfirmations: { [defaultItemId]: { at, by, fingerprint } }. */
export function normaliseRoomConfirmations(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const id of Object.keys(raw).sort()) {
    const c = raw[id];
    if (c && typeof c === "object" && c.at) out[id] = { at: text(c.at), by: text(c.by), fingerprint: text(c.fingerprint), ...(text(c.words) ? { words: text(c.words) } : {}) };
  }
  return out;
}

/**
 * "Confirm room defaults": this room uses these defaults. Applicability only. Returns a new ROOM and never
 * touches an item, so it can't approve, verify or price anything, and needs no per-room copy of the default.
 * Pass exceptionFor(defaultId) so an overridden default is left alone. Parked defaults stay open.
 */
export function confirmRoomDefaults(room, defaults, { at, by, exceptionFor } = {}) {
  const next = { ...normaliseRoomConfirmations(room.defaultConfirmations) };
  for (const def of defaults || []) {
    if (exceptionFor?.(def.id)) continue;
    if (["unresolved", "client_unsure"].includes(def.answer?.state)) continue;
    next[def.id] = { at: text(at), by: text(by), fingerprint: answerFingerprint(def), words: text(def.description) || answerSummary(def) || text(def.product) };
  }
  return { ...room, defaultConfirmations: normaliseRoomConfirmations(next) };
}

/** inherited | confirmed | changed (default moved since it was confirmed) | overridden. */
export function roomDefaultStatus(room, def, exception) {
  if (exception) return "overridden";
  const c = normaliseRoomConfirmations(room?.defaultConfirmations)[def?.id];
  if (!c) return "inherited";
  return c.fingerprint === answerFingerprint(def) ? "confirmed" : "changed";
}
