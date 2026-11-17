/**
 * registerQuality.js — the content checks on a register document (REGISTER_SCREENS_SPEC.md S5 "Before you send"),
 * each with the record, room or fact that fixes it. Pure: read by the server's preview and by the browser, so a fix in
 * the Documents step's edit drawer clears its warning straight away and the server agrees on "Preview again".
 *
 * Content checks never block an issue (owner decision 2: a missing vision or must-haves is a warning only).
 * releaseBlockers holds the release-blocker rules that need only the register (the drawing basis, approvals without
 * evidence, verified without a reference, the agreed room-brief rule, a supplied selection naming a prohibited product,
 * and who it's going to): the server's registerDocChecks (server/lib/registerDocuments.mjs) runs them first and adds the
 * checks that need the rendered fixture (a dollar figure, prohibited words in print, the selections' sources); the
 * Documents step counts them before a preview and marks their lines red.
 *
 * A target is { kind, id?, key? }:
 *   record     a register item (id)            room       a room (id)             rooms   the Rooms list (key "floors")
 *   fact       a lead fact (key: vision …)     architect  the design team's architect
 *   meta       register meta (key planRev …)   actions    the Actions list (key "unnamed")
 *   recipient  the "Issue to" box
 * A release blocker's record target can carry help: the full guidance, shown under the record in the edit drawer.
 */
import { ROOM_SCOPES, ROOM_SCOPES_WITH_WORK, resolvePromptId, questionById, categoryLabel, roomLabel, dispositionLabel } from "./register.js";
import {
  clean, andList, hasRoomBrief, disagreeingScope, openPoints, heldBackReason, deletableEmpty, namedArchitect, plainShort, labelOf, placeOf, subjectOf,
  budgetInverted,
} from "./briefModel.js";
import { restrictedFindings } from "./restrictedProducts.js";

const quote = (t, n = 40) => { const x = clean(t); return `“${x.length > n ? `${x.slice(0, n - 1)}…` : x}”`; };
const rec = (id) => ({ kind: "record", id });
// A room named only by an adjective reads as a room mid-sentence: "the Living" → "the living room".
const roomPhrase = (name) => { const n = clean(name) || "room"; return /^(living|dining|family|rumpus|sitting|games|media)$/i.test(n) ? `${n.toLowerCase()} room` : n; };

/** Rooms with work in them (New, Renovated, Altered) and no finished room brief. */
export function roomsNeedingBrief(register) {
  return (register?.meta?.rooms || []).filter((r) => ROOM_SCOPES_WITH_WORK.has(r.scope) && !hasRoomBrief(register, r));
}
/** The release blocker for the architect's brief (agreed C2 rule), with its targets. Names the Work words it covers. */
export function roomBriefBlocker(register) {
  const rooms = roomsNeedingBrief(register);
  if (!rooms.length) return null;
  const n = rooms.length;
  const words = ["new", "renovated", "altered"].filter((k) => rooms.some((r) => r.scope === k)).map((k) => ROOM_SCOPES[k].toLowerCase());
  const work = words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words.at(-1)}` : words[0] || "";
  return { key: "room_briefs", text: `${n} ${work ? `${work} ` : ""}room${n === 1 ? " has" : "s have"} no room brief: ${rooms.map((r) => clean(r.name)).join(", ")}.`,
    targets: rooms.map((r) => ({ kind: "room", id: r.id })), action: "rooms" };
}

// ── Release blockers (S5 "Can't issue yet") ──────────────────────────────────────────────────────────

/** Documents only Blue Leaf reads (REGISTER_DOC_TYPES audience "internal" on the server): a prohibited product warns there. */
const INTERNAL_DOCS = new Set(["tender_scope_notes"]);
const approvalEvidenced = (i) => !!(i.evidence?.at && i.evidence?.by) || !!i.sync?.approvedOnBoard;
const itemShort = (i) => questionById(resolvePromptId(i.promptKey))?.short || categoryLabel(i.category);
const plural = (n, one, many) => (n === 1 ? one : many);
/**
 * The full CPB-02 guidance for a supplied selection naming a prohibited product (shown in the edit drawer, and the red
 * line of the other client documents). Names the record as the brief does ("Kitchen benchtop"), with its typed words.
 */
export function restrictedGuidance(register, { item, product }) {
  const typed = clean(item.description || item.product);
  const subject = subjectOf(register, item) || itemShort(item);
  const place = item.roomId ? "" : roomLabel(register, item) === "Site / existing" ? " (Site & existing)" : (item.answer?.areaIds || []).length ? ` (${roomLabel(register, item)})` : "";
  const what = `${subject}${place}${typed && typed.toLowerCase() !== subject.toLowerCase() ? ` (“${typed}”)` : ""}`;
  return `${what} names ${product.label.toLowerCase()} in a selection that will be supplied. ${product.rule} A selection names only what will be supplied, so reword it even if it says what was replaced or avoided (for example "Porcelain benchtop, 20 mm"); agree a compliant alternative with the client if needed. Existing or removed stone goes on a record marked Retain or Remove. The original wording stays in the register's history.`;
}
/** The short red line (spec S5): "Kitchen benchtop names engineered stone. It can't be supplied or installed in Australia — …". */
function restrictedLine(register, { item, product }) {
  const thing = { benchtop: "benchtop", splashback: "splashback" }[item.category] || "material";
  return `${subjectOf(register, item)} names ${product.label.toLowerCase()}. It can't be supplied or installed in Australia — agree another ${thing} with the client and change the record.`;
}

/**
 * The release blockers a document's register can tell on its own: [{ key, text, targets, action? }], in the order staff
 * should fix them (the law first, the recipient last). Pure: the server runs these first in registerDocChecks, and the
 * Documents step counts them before a preview ("3 to fix before issuing") and marks their lines red.
 *   recipientName  who it's going to ("" blocks: the architect's brief says to name the architect)
 *   drawingBasis   the current drawing set (defaults to register.meta.planRev)
 *   clientFacing   override; by default every document but the internal tender notes
 */
export function releaseBlockers(docType, register, { recipientName = "", drawingBasis, clientFacing } = {}) {
  const items = register?.items || [];
  const out = [];
  // 1 · A selection that will be supplied names a prohibited product (CPB-02; src/lib/restrictedProducts.js).
  if (clientFacing ?? !INTERNAL_DOCS.has(docType)) {
    for (const f of restrictedFindings(items).filter((x) => x.blocking)) {
      const help = restrictedGuidance(register, f);
      out.push({ key: `restricted:${f.item.id}`, text: docType === "architect_brief" ? restrictedLine(register, f) : help, targets: [{ kind: "record", id: f.item.id, help }] });
    }
  }
  // 2 · Client-approved needs evidence; verified needs a reference.
  const approvals = items.filter((i) => i.certainty === "client_approved" && !approvalEvidenced(i));
  if (approvals.length) {
    const n = approvals.length;
    out.push({ key: "approvals", targets: approvals.map((i) => ({ kind: "record", id: i.id })),
      text: `${n} ${plural(n, "item is", "items are")} marked client-approved without evidence: record who approved ${plural(n, "it", "them")}, when and how, or step ${plural(n, "it", "them")} back.` });
  }
  const unverified = items.filter((i) => i.technicalStatus === "verified" && !clean(i.technicalEvidence?.ref));
  if (unverified.length) {
    const n = unverified.length;
    out.push({ key: "verified", targets: unverified.map((i) => ({ kind: "record", id: i.id })),
      text: `${n} ${plural(n, "item is", "items are")} marked verified without a technical reference: add the drawing or consultant reference, or step ${plural(n, "it", "them")} back to “needs verification”.` });
  }
  // 3 · The agreed C2 rule: the architect's brief can't issue while a New, Renovated or Altered room has no room brief.
  if (docType === "architect_brief") { const b = roomBriefBlocker(register); if (b) out.push(b); }
  // 4 · The drawing basis.
  const basis = drawingBasis === undefined ? register?.meta?.planRev : drawingBasis;
  if (!clean(basis)) out.push({ key: "drawing_basis", text: "Record the current drawing set / revision on The project before issuing.", targets: [{ kind: "meta", key: "planRev" }] });
  // 5 · Who it's going to.
  if (!clean(recipientName)) {
    out.push(docType === "architect_brief"
      ? { key: "recipient", text: "Say who it's going to: name the architect, or type a name under “Issue to”.", targets: [{ kind: "architect" }], action: "architect" }
      : { key: "recipient", text: "Enter who the document is being issued to.", targets: [{ kind: "recipient" }] });
  }
  return out;
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
 * The content checks for one document. The fourth argument (the document's brief model) is accepted for older callers
 * and no longer read: every check here counts records, not printed lines.
 *   o.keepIds  records held elsewhere (a received document's linked records): never offered for deletion
 * Returns [{ key, text, targets, action?, place? }] in the order staff should work through them.
 */
export function contentChecks(docType, register, context = {}, _model = null, { keepIds = [] } = {}) {
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
  } else if (budgetInverted(context)) {
    // Sales can save the two figures one at a time; an upside-down band never prints (budgetWords), so say why.
    out.push({ key: "budget_band", targets: [{ kind: "fact", key: "budget" }], action: "story", text: "The budget's lower figure is more than its upper figure, so the brief says the budget is “to be confirmed by Blue Leaf”. Check the two figures." });
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
    const first = clash[0], rec0 = first.recs[0];
    const word = clean(rec0.description) || rec0.answer?.selected?.[0]?.label || dispositionLabel(rec0.disposition);
    // Its own action: Fix steps through the clashing rooms (each target), not the rooms without a brief.
    out.push({ key: "scope_clash", targets: clash.map((x) => ({ kind: "room", id: x.r.id })), action: "clash",
      text: `${andList(clash.map((x) => clean(x.r.name)))}: an earlier answer disagrees with the room's work (${clean(first.r.name)} is ${ROOM_SCOPES[first.r.scope] || "set to another Work"}; an earlier answer says ${quote(word)}). The room's setting prints; the earlier answer is held back.` });
  }
  // 5 · Points for the next drawing issue with no one named: each record its own point (Retaining, Pool), as the Actions
  // list counts them, not the brief's merged lines.
  const unnamed = openPoints(register, context, { scope: "next_issue", merge: false }).filter((p) => !p.held && p.who?.key === "none");
  if (unnamed.length) {
    out.push({ key: "unnamed", targets: [{ kind: "actions", key: "unnamed" }, ...unnamed.flatMap((p) => p.ids.map(rec))], action: "actions",
      text: `${unnamed.length} point${unnamed.length === 1 ? "" : "s"} for the next drawing issue ${unnamed.length === 1 ? "has" : "have"} no one named: ${unnamed.map((p) => labelOf(p.item)).join(", ")}.` });
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
    text: `${labelOf(i)} says ${quote(i.description)} but is marked ${dispositionLabel(i.disposition)}. It won't print until they agree.` });
  for (const { i } of held.filter((x) => x.why === "no_ask")) out.push({ key: `no_ask:${i.id}`, targets: [rec(i.id)],
    text: `${clean(i.description) ? quote(i.description) : labelOf(i)}: ${i.responsibility === "client" ? "a client action" : "an action"} that doesn't say what's needed. It won't print.` });
  // 10 · Empty answers, by room: only those "Delete all n" may delete (nothing points at them, review R6).
  const empties = new Map();
  for (const i of deletableEmpty(register, { keep: keepIds })) {
    const k = placeOf(register, i).label;
    if (!empties.has(k)) empties.set(k, []);
    empties.get(k).push(i);
  }
  // place: the confirm's words ("Delete 3 empty Laundry answers? They hold nothing.").
  for (const [place, list] of empties) out.push({ key: `empty:${place}`, targets: list.map((i) => rec(i.id)), action: "delete_empty", place,
    text: `${list.length} empty answer${list.length === 1 ? "" : "s"} in ${place === "Throughout" ? "the whole house" : place === "Site & existing" ? "Site & existing" : `the ${place}`} print${list.length === 1 ? "s" : ""} nothing: ${list.map((i) => labelOf(i)).join("; ")}.` });
  return out;
}
