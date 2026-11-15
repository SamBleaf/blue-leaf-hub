/**
 * registerDocuments.mjs — Master Register R03 · controlled documents (Tab 22 §A D1–D3, D-031/D-035/DOC-001).
 *
 * ONE pipeline, existing engine: live register + Sales context → doc-engine FIXTURE (the contract of
 * server/lib/documents/documentPayloads.mjs) → payload → docTemplates.renderDocxTemplate (the canonical
 * renderer) → LibreOffice PDF (docxToPdf.mjs). No second engine, no hand-assembled documents.
 *
 *   D1 client_brief         Preliminary Client Project Brief — issue record only, no signature (D-035)
 *   D2 architect_brief      Architect Design Brief — client intent kept distinct from technical solutions
 *   D3 selections_schedule  Selections & Finishes Schedule — technical register layout, or the client
 *                           presentation layout, from the SAME selection rows
 *
 * Issue = immutable: the PDF (+ controlled DOCX export) is stored under a unique path (never overwritten),
 * the issue row is written by register_issue_document (supersedes the previous revision in one transaction),
 * and the exact fixture + template hash + register versions are kept as the source snapshot. The register
 * stays the editable authority; the issued PDF is the authority for WHAT WAS ISSUED (DOC-001).
 * Nothing is emailed or sent from here — staff send the issued file themselves.
 */
import fs from "fs";
import { createHash, randomBytes } from "crypto";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import PizZip from "pizzip";
import { renderDocxTemplate } from "./docTemplates.mjs";
import { convertDocxToPdfBuffer, pdfFontNames } from "./docxToPdf.mjs";
import { DOC_DEFS, validateFixture } from "./documents/documentPayloads.mjs";
import { loadRegister } from "./registerStore.mjs";
import { loadRegisterContext } from "./registerContext.mjs";
import { issueRevisionLabel } from "./documents/documentIdentity.mjs";
import { STAGE_ORDER } from "../../src/lib/stageGates.js";
import { LEAD_STAGES } from "../../src/lib/constants.js";
import { restrictedFindings, restrictedInText } from "../../src/lib/restrictedProducts.js";
import {
  roomLabel, refCode, outstandingReasons, isClientSelection, resolvePromptId, questionById, docGroupFor, categoryLabel, clientSafeAnswer,
  dispositionLabel, responsibilityLabel, supplyLabel, PROJECT_TYPE_LABELS, DELIVERY_MODELS, INCLUDED_DISPOSITIONS,
  QUESTION_LIBRARY_VERSION, answerSummary, natureOf, answerConfigFor, linkedParentLabel, baselineAssumptions, performanceSuggestions, technicalLabel, pricingLabel,
} from "../../src/lib/register.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "../../public/templates");
const BUCKET = "lead-documents";
const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const REGISTER_DOC_TYPES = {
  client_brief: { label: "Preliminary Client Project Brief", def: "client_brief", audience: "client" },
  architect_brief: { label: "Architect Design Brief", def: "architect_brief", audience: "architect" },
  selections_schedule: { label: "Selections & Finishes Schedule", def: "selections_schedule", audience: "client", altLayout: "client_presentation" },
  tender_scope_notes: { label: "Tender Scope & Pricing Notes", def: "tender_scope_notes", audience: "internal" },
};
const DOC_TYPE_KEYS = new Set(Object.keys(REGISTER_DOC_TYPES));
export const COORD_DISCIPLINES = { architect: "Architect", routleys: "Routleys (plumbing fixtures)", tli: "TLI (lighting & electrical)", windows: "Window supplier", engineer: "Engineer", energy: "Energy assessor", joiner: "Joiner" };

const STAGE_LABEL = { enquiry: "Enquiry", qualify: "Qualify", discovery: "Discovery", winning_offer: "Concept presentation", fee_proposal: "PTSA / plans", consultants: "Design coordination", tender: "Tender", won: "Contract" };
const SCHEDULE_GROUPS = new Set(["External", "Internal Finishes", "Joinery", "Wet Areas", "Services & Fixtures", "External Works"]);
const ENVELOPE_CATS = new Set(["roof", "cladding", "windows", "insulation", "structure", "existing", "demolition", "site", "external", "stairs"]);
const isoDate = (d = new Date()) => new Date(d).toISOString().slice(0, 10);
const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const sentence = (s) => { const t = clean(s); return t && !/[.!?]$/.test(t) ? `${t}.` : t; };

export class DocumentError extends Error {
  constructor(status, message, code, extra = {}) { super(message); this.status = status; this.code = code; Object.assign(this, extra); }
}

// ── fixture builders (live data → the doc-engine fixture contract) ───────────────────────────────

/** What a record says, in words people read: what was typed, else what was chosen on the card. Client-safe either way. */
const said = (item) => clean(item.description) || clean(answerSummary(item));
/** A recorded fact, risk or check is not work, whatever older status it carries (Tab 27 MR-UX-02.8). */
const NOT_WORK = new Set(["fact", "risk", "technical", "requirement", "action"]);
const isWork = (item) => item.itemKind === "scope" && !NOT_WORK.has(natureOf(item));
const sourceTag = (item) => (item.overridesDefaultId ? " (room exception)" : item.isDefault ? " (project default)" : "");
const reviewOnly = (item) => (answerConfigFor(resolvePromptId(item.promptKey))?.reviewSuggestions ? " (intent, subject to consultant review)" : "");

function itemShort(item) { return questionById(resolvePromptId(item.promptKey))?.short || categoryLabel(item.category); }
function orderItems(register, items) {
  const rank = new Map((register.meta.rooms || []).map((r, i) => [r.id, i]));
  return items.slice().sort((a, b) => (a.roomId ? rank.get(a.roomId) ?? 999 : -1) - (b.roomId ? rank.get(b.roomId) ?? 999 : -1));
}
/** A selection may only read "Client-approved" with evidence (or an approval recorded on the portal board). */
function approvalIsEvidenced(item) { return !!(item.evidence?.at && item.evidence?.by) || !!item.sync?.approvedOnBoard; }

function selectionStatus(item) {
  if (item.disposition === "retain") return "Existing to Remain";
  if (item.certainty === "client_approved") return approvalIsEvidenced(item) ? "Client-approved" : "Proposed";
  return { proposed: "Proposed", preference: "Preferred" }[item.certainty] || "TBC";
}

/** The product line: a named product, what was chosen on the card, or both. Gutters say which roof. */
function productWords(register, item) {
  const named = clean([item.manufacturer, item.product || item.description, item.model].filter(Boolean).join(" "));
  const chosen = clean(answerSummary(item));
  const under = linkedParentLabel(register, item);
  const words = named && chosen ? `${named} (${chosen})` : named || chosen;
  return words && under ? `${words}, ${under}` : words;
}

export function selectionRows(register, { coord } = {}) {
  let items = register.items.filter(isClientSelection);
  if (coord) items = items.filter((i) => questionById(resolvePromptId(i.promptKey))?.coord === coord || (coord === "routleys" && /routleys/i.test(i.supplier || "")) || (coord === "tli" && /\btli\b/i.test(i.supplier || "")));
  return orderItems(register, items).map((i) => {
    const group = docGroupFor(i.category);
    return {
      itemId: refCode(i),
      group: SCHEDULE_GROUPS.has(group) ? group : "Internal Finishes",
      category: `${roomLabel(register, i)} — ${itemShort(i)}${sourceTag(i)}`,
      where: `${roomLabel(register, i)}${sourceTag(i)}`, item: itemShort(i),   // split, for the client presentation
      product: productWords(register, i) || "TBC",
      finish: clean(i.colour) || "TBC",
      qty: i.quantity != null ? clean(`${i.quantity} ${i.unit || ""}`) : "—",            // never a fake zero
      status: selectionStatus(i),
      responsibility: clean([i.supplyBy && supplyLabel(i.supplyBy), i.supplier, i.source, i.technicalStatus === "needs_verification" ? "Tech: to verify" : null].filter(Boolean).join(" · ")) || "TBC",   // never invent an owner
    };
  });
}

/**
 * The project reference printed in BLB-[TYPE]-[REF]-[REV]. The Hub has no allocated project number yet (an owner
 * decision: format and when it is minted), so live documents use the lead-derived reference they always have.
 * `projectRef` is the hook for that number, and is how fixtures print a real-looking one.
 */
export const legacyProjectRef = (leadId) => `BL${String(leadId).replace(/-/g, "").slice(0, 6).toUpperCase()}`;

function baseFixture({ lead, context, register, revision, status, issuedDate, issuer, recipientName, projectRef }) {
  const typeLabel = PROJECT_TYPE_LABELS[context.projectType] || "Residential project";
  const architect = (context.consultants || []).find((c) => ["architect", "designer", "interior_designer"].includes(c.role));
  const street = clean(String(context.identity.siteAddress || "").split(",")[0]);
  return {
    meta: { ref: projectRef || legacyProjectRef(lead.id), revision, status, issuedDate: status === "Issued" ? issuedDate : undefined, preparedDate: issuedDate, recipient: clean(recipientName) || undefined },
    project: {
      clientName: context.identity.clientName,
      siteShort: [street, context.identity.suburb].filter(Boolean).filter((v, i, a) => i === 0 || !new RegExp(`,?\\s${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i").test(a[0])).join(", "),
      projectLabel: [typeLabel, DELIVERY_MODELS[context.deliveryModel]].filter(Boolean).join("  ·  "),
      stageLabel: STAGE_LABEL[lead.stage] || "",
      siteAddress: [context.identity.siteAddress, context.identity.suburb].filter(Boolean).filter((v, i, a) => i === 0 || !a[0].includes(v)).join(", "),
      drawingBasis: register.meta.planRev || "",
      projectDescription: clean(`${typeLabel}${context.identity.suburb ? ` · ${context.identity.suburb}` : ""}`),
      architect: architect?.name || "Architect / designer",
      preparedBy: issuer || "Blue Leaf Building",
      sectionLabel: `${STAGE_LABEL[lead.stage] || "Project brief"}  ·  ${typeLabel}`,
    },
  };
}

// ── Client Project Brief (BLB-CPB): what the homeowner reads ──────────────────────────────────────
const CPB_GROUP = { External: "Exterior", "Internal Finishes": "Interior finishes", General: "Interior finishes", Joinery: "Joinery and kitchen",
  "Wet Areas": "Bathrooms and laundry", "Services & Fixtures": "Services and fixtures", "External Works": "Outdoor areas" };
const CPB_GROUP_ORDER = ["Exterior", "Windows and doors", "Interior finishes", "Joinery and kitchen", "Bathrooms and laundry", "Services and fixtures", "Outdoor areas"];
const KITCHEN_ROOMS = new Set(["kitchen", "scullery", "pantry"]), WET_ROOMS = new Set(["bathroom", "ensuite", "wc", "laundry", "mudroom"]);
/** A room item is grouped by its room (a kitchen sink is a kitchen item); a whole-house default by what it is. */
function cpbGroup(register, i) {
  const type = (register.meta.rooms || []).find((r) => r.id === i.roomId)?.roomType;
  if (["windows", "doors"].includes(i.category)) return "Windows and doors";
  if (KITCHEN_ROOMS.has(type)) return "Joinery and kitchen";
  if (WET_ROOMS.has(type)) return "Bathrooms and laundry";
  return CPB_GROUP[docGroupFor(i.category)] || "Interior finishes";
}
const plainShort = (item) => clean(itemShort(item).replace(/\s*\([^)]*\)/g, ""));
const DESIGN_DIRECTION = new Set(["preference", "proposed", "client_approved"]);
/** "Steep access, Narrow or restricted access" → "Steep access and narrow or restricted access." (CPB-11) */
function readableList(item) {
  const safe = clientSafeAnswer(item) || {};
  const labels = (safe.selected || []).map((x) => clean(x.label)).filter(Boolean);
  // A branch answer stores "Yes · Work zones"; when every part shares the branch, say it once: "Yes — work zones, …".
  const branch = labels.length > 1 && labels.every((l) => l.includes(" · ")) ? labels[0].split(" · ")[0] : "";
  const shared = branch && labels.every((l) => l.split(" · ")[0] === branch);
  const parts = labels.length ? (shared ? labels.map((l) => l.split(" · ").slice(1).join(" · ")) : labels) : [clean(answerSummary(item))];
  const ordinary = (w) => /^[A-Z][a-z]/.test(w) && !/[A-Z]/.test(w.slice(1));   // "Narrow…" yes, "AAC" or "NBN" no
  const words = parts.map((w, k) => ((k > 0 || shared) && ordinary(w) ? w.charAt(0).toLowerCase() + w.slice(1) : w));
  const list = words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}` : words[0];
  const joined = shared ? `${branch} — ${list}` : list;
  const element = clean(safe.element?.label || safe.element || ""), zone = clean(safe.zone?.label || safe.zone || "");
  return sentence(labels.length ? [element, joined, zone].filter(Boolean).join(" — ") : joined);
}

/**
 * Site access in plain sentences (CPB2-05). Each recorded option keeps its own qualifier, so an "or" is never upgraded
 * to an "and"; a constraint that needs planning is said as one, never as a feature of the site ("crane or plant access
 * will need to be planned for", not "with crane or plant access"). An element, a zone or an option not listed here
 * falls back to the full recorded words (readableList).
 */
const ACCESS_IS = { steep_access: "steep" };
const ACCESS_WITH = { narrow_or_restricted_access: "narrow or restricted areas", limited_parking: "limited parking" };
const ACCESS_PLAN = { crane_or_plant_access: "crane or plant access", delivery_constraints: "delivery constraints", shared_or_neighbour_access: "shared or neighbour access" };
const ACCESS_KNOWN = new Set(["standard_driveway", ...Object.keys(ACCESS_IS), ...Object.keys(ACCESS_WITH), ...Object.keys(ACCESS_PLAN)]);
const andList = (l) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} and ${l.at(-1)}` : l[0] || "");
const capFirst = (t) => t.charAt(0).toUpperCase() + t.slice(1);
export function siteAccessSentence(item) {
  if (resolvePromptId(item?.promptKey) !== "W-001") return "";
  const safe = clientSafeAnswer(item);
  if (!safe || safe.state !== "recorded") return "";
  // The client-safe projection drops option ids; read them from the same live (not stale) options it shows.
  const ids = (item.answer.selected || []).filter((s) => !s?.stale).map((s) => s?.optionId);
  if (safe.element || safe.zone || !ids.length || ids.some((id) => !ACCESS_KNOWN.has(id))) return "";
  const pick = (map) => Object.keys(map).filter((id) => ids.includes(id)).map((id) => map[id]);
  const is = pick(ACCESS_IS), withs = pick(ACCESS_WITH), plans = pick(ACCESS_PLAN);
  const how = ids.includes("standard_driveway") ? ["by a standard driveway", ...is.map((a) => `is ${a}`)] : is;
  const first = how.length ? `Site access is ${andList(how)}${withs.length ? `, with ${andList(withs)}` : ""}.` : withs.length ? `Site access has ${andList(withs)}.` : "";
  const then = plans.length ? `${first ? capFirst(andList(plans)) : `Site access: ${andList(plans)}`} will need to be planned for.` : "";
  return [first, then].filter(Boolean).join(" ");
}

/**
 * A fact the client is unsure about, or that is still to be resolved, is never printed as settled (review CPB3-C03):
 * "Site access: still to be confirmed (noted so far: steep access and crane or plant access)."
 */
const SETTLED_FACT = (i) => !["client_unsure", "unresolved"].includes(i?.answer?.state);
const UNSURE_LABEL = /^(unsure|not sure|not decided|undecided|tbc|to be confirmed)$/i;
const ordinaryWord = (w) => /^[A-Z][a-z]/.test(w) && !/[A-Z]/.test(w.slice(1));
function unconfirmedFact(i) {
  // What was noted, said exactly as a recorded answer would be (shared branch once, element and zone kept), minus "Unsure".
  const live = (i.answer?.selected || []).filter((x) => !x?.stale && !UNSURE_LABEL.test(clean(x?.label)));
  let noted = live.length ? readableList({ ...i, answer: { ...i.answer, state: "recorded", selected: live } }).replace(/\.$/, "") : "";
  const first = noted.split(/\s/)[0] || "";
  if (!clientSafeAnswer(i)?.element && ordinaryWord(first)) noted = noted.charAt(0).toLowerCase() + noted.slice(1);
  return `${plainShort(i)}: still to be confirmed${noted ? ` (noted so far: ${noted})` : ""}.`;
}

/**
 * Room-by-room scope said once per group of rooms (CPB2-02), as a fixed rule over the recorded words: nothing is
 * generated, nothing is strengthened, and every record stays in the register.
 *
 * A record is grouped only when it answers a whole-room scope prompt (WHOLE_ROOM_PROMPTS; an element prompt such as
 * hall finishes keeps its own line) and, apart from its room's name and words that add nothing ("as shown on the concept
 * plans", "the", "full"), its typed words AND its card answer together say at most one kind of work, and that kind
 * agrees with its disposition: "new" on a New record; "renovate", "refurbish" or "alter" on an Alter record. No work
 * word: the disposition decides (New, or "Alterations to"). Anything else keeps its own line with the typed words: a
 * renovation recorded as New, a qualifier ("alternative", "plan A"), a question mark, a hyphenated word ("built-in"), or
 * a room whose name itself starts with a work word ("New kitchen", "Existing kitchen"). Each kind is its own group, so
 * Renovated, Refurbished and Alterations to are never merged under one word.
 *
 * Groups follow the room list's order. A group of four or more rooms takes a short label ("New living areas: kitchen,
 * scullery, living room …"); a smaller group is just its rooms ("New bathroom, ensuite and laundry"). A room name
 * starting with an ordinary room word is lowercased mid-sentence ("Guest WC" → "guest WC"); any other name (a person's,
 * "Mia's bedroom") prints as typed. A name that is only an adjective reads as a room ("Living" → "living room").
 */
const WORK_KINDS = [
  { kind: "new", disposition: "new", words: ["new"], verb: (x) => `New ${x}` },
  { kind: "renovate", disposition: "alter", words: ["renovate", "renovated", "renovation", "renovations", "renovating"], verb: (x) => `Renovated ${x}` },
  { kind: "refurbish", disposition: "alter", words: ["refurbish", "refurbished", "refurbishment", "refurbishing"], verb: (x) => `Refurbished ${x}` },
  { kind: "alter", disposition: "alter", words: ["alter", "altered", "alteration", "alterations", "altering"], verb: (x, common) => `Alterations to ${common ? "the " : ""}${x}` },
];
const DEFAULT_KIND = { new: "new", alter: "alter" };
/** Whole-room scope prompts: their answer sets the room's disposition (New / Renovate / Alter / Retained …). */
const WHOLE_ROOM_PROMPTS = new Set(["R-002", "R-003", "K-001", "B-001", "L-001", "V-001", "D-001"]);
const NAME_WORK_WORDS = new Set(["existing", "old", "original", "current", ...WORK_KINDS.flatMap((w) => w.words)]);
const ROOM_FILLER = new Set(["full", "fully", "complete", "completely", "as", "shown", "drawn", "per", "on", "in", "the", "concept", "plan", "plans", "drawing", "drawings", "sketch", "room", "area", "to", "be", "built", "work", "works", "of"]);
const ROOM_FAMILIES = [
  { types: ["kitchen", "scullery", "pantry", "living", "dining", "family", "theatre"], label: () => "living areas" },
  { types: ["bedroom", "wir", "study"], label: (n) => andList([n.bedroom > 1 ? "bedrooms" : n.bedroom ? "bedroom" : n.wir ? "robes" : "", n.study > 1 ? "studies" : n.study ? "study" : ""].filter(Boolean)) },
  { types: ["bathroom", "ensuite", "wc", "laundry", "mudroom"], label: (n) => { const b = n.bathroom + n.ensuite + n.wc, l = n.laundry + n.mudroom; return andList([b > 1 ? "bathrooms" : b ? "bathroom" : "", l > 1 ? "laundries" : l ? "laundry" : ""].filter(Boolean)); } },
  { types: ["hall", "stairs"], label: (n) => andList([n.hall ? "halls" : "", n.stairs ? "stairs" : ""].filter(Boolean)) },
  { types: ["garage"], label: () => "garages" },
  { types: ["alfresco", "balcony", "external"], label: () => "outdoor areas" },
];
const LABEL_FROM = 4;   // a group of this many rooms or more takes a label
// Words a room name can start with that are ordinary nouns or adjectives, lowercased mid-sentence. Anything else is a name.
const ROOM_WORDS = new Set(["kitchen", "scullery", "butler's", "pantry", "bathroom", "ensuite", "powder", "laundry", "mudroom", "living", "dining", "family", "rumpus",
  "theatre", "media", "bedroom", "main", "master", "guest", "walk-in", "robe", "study", "office", "stairs", "stair", "hall", "entry", "garage", "alfresco", "pergola",
  "balcony", "deck", "lounge", "meals", "retreat", "games", "upstairs", "downstairs", "upper", "lower", "ground", "first", "front", "rear", "back", "side", "outdoor",
  "sitting", "library", "cellar", "storage", "store", "workshop", "home", "kids", "nursery", "parents", "linen", "toilet", "shower", "spare", "second", "third",
  "external", "room", "gym", "sunroom", "verandah", "veranda", "porch", "patio", "courtyard", "attic", "loft", "basement", "utility", "dressing", "drying"]);
// A room named only by an adjective reads as a room mid-sentence: "Living" → "living room".
const BARE_ROOM = new Set(["living", "dining", "family", "rumpus", "sitting", "games", "media"]);
const roomOf = (register, i) => (register.meta.rooms || []).find((r) => r.id === i.roomId);
/** The room name mid-sentence, and whether it is a common noun (so "the" may go before it). */
function roomWords(name) {
  const n = clean(name), first = n.split(/\s+/)[0] || "";
  const common = ROOM_WORDS.has(first.toLowerCase());
  const text = common && ordinaryWord(first) ? n.charAt(0).toLowerCase() + n.slice(1) : n;
  return { text: BARE_ROOM.has(text) ? `${text} room` : text, common };
}
/** The kind of work a room record says, when it says nothing else; null when it must keep its own line. */
function roomOnlyWork(register, i) {
  const room = i.roomId && DEFAULT_KIND[i.disposition] && WHOLE_ROOM_PROMPTS.has(resolvePromptId(i.promptKey)) ? roomOf(register, i) : null;
  const name = clean(room?.name).toLowerCase();
  if (!name || NAME_WORK_WORDS.has(name.split(/\s+/)[0])) return null;
  const kinds = new Set();
  // The typed words and the card answer are read together, so "Refurbished" on the card still decides the kind when the
  // typed words are only filler (verification V3-01), and two kinds between them keep the record on its own line.
  const words = `${clean(i.description)} ${clean(answerSummary(i))}`.toLowerCase();
  for (const t of words.split(name).join(" ").split(/[\s,.;:]+/).filter(Boolean)) {
    const k = WORK_KINDS.find((w) => w.words.includes(t));
    if (k) kinds.add(k.kind);
    else if (!ROOM_FILLER.has(t)) return null;
  }
  if (kinds.size > 1) return null;
  const kind = WORK_KINDS.find((w) => w.kind === (kinds.size ? [...kinds][0] : DEFAULT_KIND[i.disposition]));
  return kind.disposition === i.disposition ? kind : null;
}
const plural = (w) => (/[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : /(s|sh|ch|x)$/.test(w) ? `${w}es` : `${w}s`);
/**
 * Room names in reading order; three or more numbered rooms that run on are named once: "bedrooms 2 to 4". The Hub names
 * the first room of a type "Bedroom" and the next "Bedroom 2", so an unnumbered room straight before its run counts as
 * number 1: "Bedroom, Bedroom 2, Bedroom 3" → "bedrooms 1 to 3" (verification V-05).
 */
function roomNames(rooms) {
  const num = (r) => { const m = clean(r.name).match(/^(.*\S)\s+(\d+)$/); return m ? m : null; };
  const words = [];
  for (let k = 0; k < rooms.length; k++) {
    const next = rooms[k + 1] && num(rooms[k + 1]);
    if (!num(rooms[k]) && next && next[1].toLowerCase() === clean(rooms[k].name).toLowerCase() && Number(next[2]) === 2) {
      let j = k + 1;
      while (j + 1 < rooms.length && num(rooms[j + 1])?.[1] === next[1] && Number(num(rooms[j + 1])[2]) === Number(num(rooms[j])[2]) + 1) j++;
      if (j >= k + 2) { words.push(`${plural(roomWords(next[1]).text)} 1 to ${num(rooms[j])[2]}`); k = j; continue; }
    }
    const m = num(rooms[k]);
    let j = k;
    while (m && j + 1 < rooms.length && num(rooms[j + 1])?.[1] === m[1] && Number(num(rooms[j + 1])[2]) === Number(num(rooms[j])[2]) + 1) j++;
    if (m && j >= k + 2) { words.push(`${plural(roomWords(m[1]).text)} ${m[2]} to ${num(rooms[j])[2]}`); k = j; } else words.push(roomWords(rooms[k].name).text);
  }
  return andList(words);
}
function groupRoomScope(register, list, lineOf) {
  const out = [], groups = new Map();
  for (const i of list) {
    const kind = roomOnlyWork(register, i);
    if (!kind) { out.push(lineOf(i)); continue; }
    const room = roomOf(register, i), fam = ROOM_FAMILIES.findIndex((f) => f.types.includes(room.roomType)), key = `${kind.kind}|${fam}`;
    if (!groups.has(key)) { const g = { kind, fam, rooms: [], refs: [] }; groups.set(key, g); out.push(g); }
    const g = groups.get(key);
    if (!g.rooms.some((r) => r.id === room.id)) g.rooms.push(room);
    g.refs.push(refCode(i));
  }
  const rank = new Map((register.meta.rooms || []).map((r, k) => [r.id, k]));
  return out.map((x) => {
    if (!x.rooms) return x;
    const family = ROOM_FAMILIES[x.fam];
    const rooms = x.rooms.slice().sort((a, b) => (family ? family.types.indexOf(a.roomType) - family.types.indexOf(b.roomType) : 0) || rank.get(a.id) - rank.get(b.id));
    const count = Object.fromEntries((family?.types || []).map((t) => [t, rooms.filter((r) => r.roomType === t).length]));
    const label = rooms.length >= LABEL_FROM ? (family ? family.label(count) : "rooms") : "";
    const text = label ? `${x.kind.verb(label, true)}: ${roomNames(rooms)}` : x.kind.verb(roomNames(rooms), roomWords(rooms[0].name).common);
    return { text, ref: x.refs[0], refs: x.refs };
  });
}

/**
 * The brief's own pathway: the engagement pathway (stageGates), with a build-only delivery model on the design and
 * build pathway read as build only, so a build-only client is never told about concept design or a PTSA (CPB-01).
 * Which pipeline stages apply to build only is still an owner decision (R05 release package §4, #1).
 */
export function cpbPathway(context) {
  const p = context.engagementPathway || "design_build";
  return p === "design_build" && context.deliveryModel === "build_only" ? "build_only" : p;
}
const PATHWAY_STAGE_LABEL = { build_only: "Scope and pricing", plans_supplied: "Plans and pricing", architect_tender: "Tender" };

/**
 * The client's next steps, by the brief's pathway and where the lead is (Tab 22 D4; stageGates pathway rules).
 * technicalChecks "general" (a small job with no recorded site or structural check) names no consultant disciplines
 * here either (CPB2-07, review CPB3-C08).
 */
function cpbNextSteps(lead, context, technicalChecks = "named") {
  const general = technicalChecks === "general";
  const pathway = cpbPathway(context);
  const at = STAGE_ORDER.indexOf(lead.stage);
  const before = (st) => at <= STAGE_ORDER.indexOf(st);
  const mark = (steps, i) => steps.map((x, k) => ({ ...x, current: k === i }));
  if (lead.stage === LEAD_STAGES.WON) return { paras: ["The building contract is in place. Your project now moves to construction planning, and this brief stays on file as the record of the agreed direction."], steps: [], ptsa: null };
  if (pathway === "build_only") {
    // CPB2-03: say how the engagement runs, never that drawings, consultants or approvals can be skipped.
    return {
      paras: ["This project is proceeding on a build-only pathway. We'll confirm the work, measurements and any drawings or approvals needed before finalising the price."],
      steps: mark([
        { label: "Confirm the scope", text: "We confirm the work, measurements and any drawings or approvals needed." },
        { label: "Pricing", text: "We price the confirmed scope and your selections." },
        { label: "Building contract", text: "The contract confirms the scope, price and programme before work starts." },
        { label: "Construction", text: "The work is scheduled and carried out." },
      ], lead.stage === "tender" ? 1 : 0),
      ptsa: null,
    };
  }
  if (pathway === "plans_supplied") {
    return {
      // Says how the engagement runs, never that design input can be skipped (as CPB2-03 for build only).
      paras: ["Your plans are already prepared, so this project is proceeding on a plans-supplied pathway. Next, the consultant documents are confirmed against your plans and the work is priced."],
      steps: mark([
        { label: "Consultant documents", text: general ? "Any consultant documents and approvals the work needs are confirmed against your plans." : "Engineering, energy and other consultant documents are confirmed against your plans." },
        { label: "Pricing", text: "The confirmed scope and selections are priced." },
        { label: "Building contract", text: "The contract confirms the scope, price and programme before construction starts." },
      ], lead.stage === "tender" ? 1 : 0),
      ptsa: null,
    };
  }
  if (pathway === "architect_tender") {
    return {
      paras: ["Your architect leads the design. Blue Leaf's role is to review the documents and price the work."],
      steps: mark([
        { label: "Document review", text: "We review the architect's documents and raise anything that affects scope or price." },
        { label: "Pricing", text: "The documented scope is priced." },
        { label: "Building contract", text: "The contract confirms the scope, price and programme before construction starts." },
      ], lead.stage === "tender" ? 1 : 0),
      ptsa: null,
    };
  }
  const preAgreement = context.commercial?.ptsaStatus !== "signed" && before("fee_proposal");
  if (preAgreement) {
    return {
      paras: ["The next step is to agree how the design and pricing will be developed. This brief sets the direction; the stages below turn it into coordinated drawings, confirmed selections and a defined scope for pricing."],
      steps: mark([
        { label: "Concept", text: "We record the agreed direction in this brief." },
        { label: "Pre-construction agreement", text: "A separate agreement sets out the design and pricing services, responsibilities and fees." },
        { label: "Design, selections and pricing", text: "Consultants coordinate the design, your selections are confirmed and the scope is priced." },
        { label: "Building contract", text: "The contract confirms the scope, price and programme before construction starts." },
      ], lead.stage === "fee_proposal" ? 1 : 0),
      ptsa: { text: "The pre-construction agreement (PTSA) is separate from this brief and from any building contract. It sets out the design and pricing services, responsibilities and fees before that work begins." },
    };
  }
  return {
    paras: ["Your pre-construction agreement is in place. The design is being coordinated with the consultants, and your selections and the scope are being developed for pricing."],
    steps: mark([
      { label: "Design coordination", text: general ? "Any technical input the design needs is coordinated with the consultants." : "Consultants coordinate the structure, services and energy requirements with the design." },
      { label: "Selections", text: "Your finishes and fixtures are confirmed in the selections schedule." },
      { label: "Pricing", text: "The confirmed scope and selections are priced." },
      { label: "Building contract", text: "The contract confirms the scope, price and programme before construction starts." },
    ], lead.stage === "tender" ? 2 : 0),
    ptsa: null,
  };
}

function clientBriefFixture(input) {
  const { lead, context, register } = input;
  const fx = baseFixture(input);
  const items = orderItems(register, register.items);
  const area = (i) => roomLabel(register, i);
  // A row names its room (or the rooms an area answer covers); project-wide rows read without a place prefix.
  const where = (i) => { const a = area(i); return a === "Whole house" || a === "Site / existing" ? "" : `${a}: `; };
  const entry = (i, text) => ({ text: clean(text), ref: refCode(i) });

  // 1 · The project. Sales words verbatim; nothing generated in their place.
  const occupancy = { occupied: "The home is expected to stay occupied during the works.", partly: "Part of the home is expected to stay occupied during the works.", vacant: "The home is expected to be vacant during the works." }[register.meta.occupancy] || "";
  const description = sentence(context.goals.description);
  const vision = sentence(context.goals.vision);
  const pItem = items.find((i) => !i.roomId && resolvePromptId(i.promptKey) === "P-005");
  const chosen = (clientSafeAnswer(pItem)?.selected || []).map((c) => c.label);
  const priorities = (chosen.length ? chosen : (pItem?.description || "").split(/\s*;\s*/)[0].split(/\s*,\s*/).filter(Boolean)).slice(0, 3);
  const priorityNote = clean(clientSafeAnswer(pItem)?.clientNote || (pItem?.description || "").split(/\s*;\s*/).slice(1).join("; "));
  const typeLabel = PROJECT_TYPE_LABELS[context.projectType] || "Residential project";

  // 2 · Scope. Work only (a fact, risk, check or requirement is never work — Tab 27 MR-UX-02.8).
  const workWords = (i) => { const w = said(i) || dispositionLabel(i.disposition); return i.disposition === "remove" && !/demol|remov/i.test(w) ? `${w} (removal)` : i.disposition === "make_good" && !/make good|match/i.test(w) ? `${w} (make good)` : w; };
  const scopeIn = groupRoomScope(register, items.filter((i) => isWork(i) && INCLUDED_DISPOSITIONS.has(i.disposition) && (said(i) || i.disposition !== "undecided")), (i) => entry(i, `${where(i)}${workWords(i)}`));
  const isRisk = (i) => i.technicalStatus === "needs_verification" && (["site", "existing", "demolition", "structure"].includes(i.category) || i.section === "site");
  // CPB2-07: the consultant disciplines are named only where the project evidently needs them (new floor area, or a
  // recorded site or structural check); otherwise the brief says it generally and implies no process the job may not need.
  const technicalChecks = ["new_build", "knockdown_rebuild", "extension"].includes(context.projectType) || items.some(isRisk) ? "named" : "general";
  const block = (label, note, list) => ({ label, note, items: list });
  const physical = (i) => !NOT_WORK.has(natureOf(i));

  // 7 · Decisions: a real action (an action record, or an open next action), never a recorded preference.
  const decisions = items.filter((i) => outstandingReasons(i).some((r) => r === "decision" || r === "action") && i.itemKind !== "requirement")
    .filter((i) => !["architect", "consultant", "trade"].includes(i.responsibility))
    .map((i) => ({ i, action: clean(i.nextAction) && !i.resolved ? clean(i.nextAction) : natureOf(i) === "action" ? said(i) : "" }))
    .filter(({ i, action }) => action && !(isClientSelection(i) && DESIGN_DIRECTION.has(i.certainty) && !clean(i.nextAction)))
    .sort((a, b) => (a.i.responsibility === "client" ? -1 : 0) - (b.i.responsibility === "client" ? -1 : 0)).slice(0, 7);
  const inDecisions = new Set(decisions.map((d) => d.i.id));

  const boundaries = [
    block("Existing to remain or protect", "", items.filter((i) => i.disposition === "retain" && physical(i)).map((i) => entry(i, `${where(i)}${said(i) || plainShort(i)}`))),
    block("Not in the current scope", "Not part of the work proposed now.",
      items.filter((i) => ["excluded", "deferred"].includes(i.disposition) && physical(i)).map((i) => entry(i, `${where(i)}${said(i) || plainShort(i)}${i.disposition === "deferred" ? " (possible later stage)" : ""}`))),
    block("By others", "Arranged separately, outside Blue Leaf's work.", items.filter((i) => i.disposition === "by_others" && physical(i)).map((i) => entry(i, `${where(i)}${said(i) || plainShort(i)}`))),
    block("Items you plan to supply", "We'll confirm with you how these are installed.",
      items.filter((i) => i.supplyBy === "client" && !["excluded", "by_others", "na"].includes(i.disposition)).map((i) => entry(i, `${where(i)}${said(i) || plainShort(i)}`))),
    block("Still to be decided", "",
      items.filter((i) => isWork(i) && i.disposition === "undecided" && said(i) && !inDecisions.has(i.id) && i.supplyBy !== "client").map((i) => entry(i, `${where(i)}${said(i)}`))),
    block("Still to be checked", "",
      items.filter(isRisk).map((i) => entry(i, `${where(i)}${said(i) || plainShort(i)}. ${responsibilityLabel(i.responsibility || "consultant")} to confirm.`))),
  ];

  // 5 · Design direction: recorded preferences, grouped for a reader, status in words. Requirements as goals.
  const groups = new Map();
  for (const i of items.filter((x) => isClientSelection(x) && DESIGN_DIRECTION.has(x.certainty) && (said(x) || x.product))) {
    const g = cpbGroup(register, i);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ where: area(i), text: clean(i.description || i.product) || said(i), status: selectionStatus(i), ref: refCode(i) });
  }
  const goals = items.filter((i) => i.itemKind === "requirement" && said(i) && resolvePromptId(i.promptKey) !== "P-005")
    .map((i) => ({ where: area(i), text: `${plainShort(i)}: ${said(i)}`, status: reviewOnly(i) ? "For consultant review" : "Requirement", ref: refCode(i) }));
  const preferences = [...CPB_GROUP_ORDER.filter((g) => groups.has(g)).map((g) => ({ group: g, items: groups.get(g) })), ...(goals.length ? [{ group: "Requirements and goals", items: goals.slice(0, 8) }] : [])];

  // 6 · Noted facts stay facts.
  const facts = items.filter((i) => natureOf(i) === "fact" && clean(answerSummary(i)) && i.answer?.state !== "not_applicable")
    .map((i) => (!SETTLED_FACT(i) ? unconfirmedFact(i) : siteAccessSentence(i) || `${plainShort(i)}: ${readableList(i)}`));

  if (lead.stage !== LEAD_STAGES.WON) fx.project.stageLabel = PATHWAY_STAGE_LABEL[cpbPathway(context)] || fx.project.stageLabel;
  fx.clientBrief = {
    pathway: cpbPathway(context),
    subtitle: `${typeLabel.charAt(0)}${typeLabel.slice(1).toLowerCase()}${context.identity.suburb ? `, ${context.identity.suburb}` : ""}`,
    overview: [description, occupancy].filter(Boolean),
    priorities, priorityNote,
    direction: vision && vision !== description ? vision : "",
    scopeIn,
    technicalChecks,
    boundaries,
    preferences,
    noted: facts.length ? [{ label: "What we have noted about the site and household", items: facts }] : [],
    decisions: decisions.map(({ i, action }) => ({ ref: refCode(i), action: sentence(action), owner: i.responsibility ? responsibilityLabel(i.responsibility) : "" })),
    nextSteps: cpbNextSteps(lead, context, technicalChecks),
  };
  return fx;
}

function architectBriefFixture(input) {
  const { context, register } = input;
  const fx = baseFixture(input);
  const items = orderItems(register, register.items);
  const area = (i) => roomLabel(register, i);
  const roomSheet = (i) => (register.meta.rooms || []).find((r) => r.id === i.roomId)?.sheet || "";
  const archStatus = (i) => (i.technicalStatus === "needs_verification" ? "To verify" : i.certainty === "client_approved" && approvalIsEvidenced(i) ? "Client-approved" : "Proposed");
  const actions = items.filter((i) => !i.resolved && (i.itemKind === "action" || (i.nextAction && i.nextAction.trim())) && ["architect", "consultant", "", undefined, null].includes(i.responsibility))
    .slice(0, 14).map((i) => ({ id: refCode(i), action: clean(i.nextAction) || said(i) || itemShort(i), owner: responsibilityLabel(i.responsibility || "architect"), status: "OPEN" }));
  const register_ = items.filter((i) => (isWork(i) && !["na", "undecided"].includes(i.disposition)) || i.itemKind === "requirement" || i.technicalStatus === "needs_verification")
    .filter((i) => said(i) || i.itemKind === "scope")
    .map((i) => ({
      itemId: refCode(i), location: area(i),
      requirement: clean(`${isWork(i) ? `${dispositionLabel(i.disposition)}: ` : i.itemKind === "requirement" ? "Requirement: " : ""}${said(i) || itemShort(i)}${sourceTag(i)}${reviewOnly(i)}`),
      status: archStatus(i), action: clean(i.nextAction), dwgRef: clean(i.source || roomSheet(i) || register.meta.planRev), group: ENVELOPE_CATS.has(i.category) ? "Envelope & structure" : "Internal & services",
    }));
  fx.architectBrief = {
    actionsIntro: "The following are the decisions most likely to delay the next coordinated drawing issue. Reference IDs match the design register below and the project register.",
    actions,
    // Client-approved isn't technically verified (Tab 26 DOC-02): say so while the technical check is open.
    confirmedReqs: items.filter((i) => i.itemKind === "requirement" && i.certainty === "client_approved" && approvalIsEvidenced(i) && said(i))
      .map((i) => `${area(i)}: ${said(i)}${i.technicalStatus === "needs_verification" ? " (technical check pending)" : ""}`),
    clientPrefs: items.filter((i) => isClientSelection(i) && ["preference", "proposed"].includes(i.certainty) && (said(i) || i.product)).slice(0, 10).map((i) => `${area(i)} ${itemShort(i).toLowerCase()}: ${clean(i.description || i.product) || said(i)}`),
    scheduleItems: register_,
    references: [register.meta.planRev ? `Current drawing basis: ${register.meta.planRev}` : null,
      ...(context.drawings || []).slice(0, 10).map((d) => clean(`${d.filename}${d.revision ? ` — ${d.revision}` : ""}${d.issuer ? ` (${d.issuer})` : ""}`))].filter(Boolean),
  };
  return fx;
}

function selectionsFixture(input, opts = {}) {
  const fx = baseFixture(input);
  fx.selections = selectionRows(input.register, opts);
  fx.clientPresentation = {};
  return fx;
}

/**
 * Tender Scope & Pricing Notes (Tab 27 B12, Gate 6.2). INTERNAL: the one document allowed to read assumptions, staff notes and
 * review suggestions. No amounts and no quantities, because Buildxact holds the numbers and nothing is measured yet.
 */
function tenderNotesFixture(input) {
  const { context, register } = input;
  const fx = baseFixture(input);
  const items = orderItems(register, register.items);
  const words = (i) => { const w = productWords(register, i) || said(i) || itemShort(i); return `${w}${sourceTag(i)}`; };
  const noteOf = (i) => clean([i.answer?.note, i.nextAction && !i.resolved ? `Next: ${i.nextAction}` : "", i.responsibility ? responsibilityLabel(i.responsibility) : ""].filter(Boolean).join(" · "));
  const row = (i, status) => ({ itemId: refCode(i), area: roomLabel(register, i), text: words(i), status, note: noteOf(i) });
  const isExisting = (i) => ["W-004", "W-006", "W-008", "R-013"].includes(resolvePromptId(i.promptKey));
  const nature = natureOf;
  const out = (i) => ["excluded", "deferred", "by_others", "na"].includes(i.disposition) || i.answer?.state === "not_applicable";
  const systems = items.filter((i) => isClientSelection(i) && ENVELOPE_CATS.has(i.category));
  const finishes = items.filter((i) => isClientSelection(i) && !ENVELOPE_CATS.has(i.category));
  const selStatus = (i) => [selectionStatus(i), technicalLabel(i.technicalStatus) === technicalLabel("needs_verification") ? "to verify" : "", pricingLabel(i.pricingStatus)].filter(Boolean).join(" · ");
  const sections = [
    { title: "Included work", intro: "In Blue Leaf's scope, by area.", rows: items.filter((i) => isWork(i) && INCLUDED_DISPOSITIONS.has(i.disposition) && !isExisting(i)).map((i) => row(i, dispositionLabel(i.disposition))) },
    { title: "Existing works and demolition", intro: "Demolish, retain, alter, make good, protect and match.", rows: items.filter((i) => isExisting(i) && isWork(i) && !out(i) && i.disposition !== "undecided").map((i) => row(i, dispositionLabel(i.disposition))) },
    { title: "Excluded or deferred", intro: "Not to be priced in this tender.", rows: items.filter((i) => ["excluded", "deferred"].includes(i.disposition) && !NOT_WORK.has(nature(i))).map((i) => row(i, dispositionLabel(i.disposition))) },
    { title: "By others or client supplied", intro: "Allow for coordination only. Who carries it out is decided at Tender.", rows: items.filter((i) => (i.disposition === "by_others" || ["client", "by_others"].includes(i.supplyBy)) && !NOT_WORK.has(nature(i))).map((i) => row(i, i.disposition === "by_others" ? dispositionLabel(i.disposition) : supplyLabel(i.supplyBy))) },
    { title: "Construction systems and materials", intro: "Envelope and structure, as chosen so far. Each system is its own line.", rows: systems.map((i) => row(i, selStatus(i))) },
    { title: "Finishes and fittings", intro: "Project defaults and room exceptions, as chosen so far.", rows: finishes.map((i) => row(i, selStatus(i))) },
    { title: "Site and household facts", intro: "Recorded facts. These are constraints to allow for, not work to price as scope.", rows: items.filter((i) => nature(i) === "fact" && said(i)).map((i) => row(i, "Fact")) },
    { title: "Existing-condition risks", intro: "Allow for investigation or exclusions.", rows: items.filter((i) => nature(i) === "risk" && (said(i) || i.nextAction)).map((i) => row(i, i.resolved ? "Closed" : "Open")) },
    { title: "Unresolved decisions", intro: "Decide before pricing is final.", rows: items.filter((i) => outstandingReasons(i).includes("decision") && !out(i)).map((i) => row(i, i.answer?.state === "client_unsure" ? "Client unsure" : "To be decided")) },
    { title: "Technical questions", intro: "A designer, engineer or trade must confirm these.", rows: items.filter((i) => i.technicalStatus === "needs_verification" || (nature(i) === "technical" && !i.resolved && said(i))).map((i) => row(i, technicalLabel(i.technicalStatus))) },
    { title: "Blue Leaf pricing assumptions", intro: "Labelled guides for what isn't chosen. Not a client choice, an approval or a price. Anything the client chooses replaces them.", rows: baselineAssumptions(register).map((a) => ({ itemId: "", area: a.label, text: `${a.tierLabel}: ${a.text}`, status: a.draft ? "Assumption, draft wording" : "Assumption", note: a.status === "part" && a.gaps.length ? `Covers only: ${a.gaps.join(", ")}` : "" })) },
    { title: "Performance goals for review", intro: "Staff-only prompts for Blue Leaf or consultant review. Nothing here is selected, specified or priced.", rows: items.flatMap((i) => performanceSuggestions(i.answer).flatMap((g) => g.suggestions.map((sg) => ({ itemId: refCode(i), area: sg.area, text: sg.text, status: "Review required", note: g.goalLabel })))) },
    { title: "Drawing references", intro: "The drawings this was prepared against.", rows: [register.meta.planRev ? { itemId: "", area: "Drawing basis", text: register.meta.planRev, status: "Current", note: "" } : null, ...(context.drawings || []).map((d) => ({ itemId: "", area: "Drawing", text: clean(d.filename), status: clean(d.revision) || "On file", note: clean(d.issuer) }))].filter(Boolean) },
  ].filter((sec) => sec.rows.length);
  fx.tenderNotes = { sections };
  return fx;
}

export function buildRegisterFixture(docType, input, opts = {}) {
  if (docType === "client_brief") return clientBriefFixture(input);
  if (docType === "architect_brief") return architectBriefFixture(input);
  if (docType === "selections_schedule") return selectionsFixture(input, opts);
  if (docType === "tender_scope_notes") return tenderNotesFixture(input);
  throw new DocumentError(400, "Unknown document type.", "BAD_DOC");
}

// ── pre-issue checks (Tab 14 release blockers) ───────────────────────────────────────────────────

const MONEY_RX = /\$\s?\d/;
export function registerDocChecks(docType, fx, { register, recipientName, mode }) {
  const errors = [], warnings = [];
  if (!clean(fx.project.drawingBasis)) (mode === "issue" ? errors : warnings).push("Record the current drawing set / revision (Project step) before issuing.");
  if (mode === "issue" && !clean(recipientName)) errors.push("Enter who the document is being issued to.");
  const falseApprovals = register.items.filter((i) => i.certainty === "client_approved" && !approvalIsEvidenced(i));
  if (falseApprovals.length) (mode === "issue" ? errors : warnings).push(`${falseApprovals.length} item(s) are marked client-approved without evidence — record the approval or step them back.`);
  const unverified = register.items.filter((i) => i.technicalStatus === "verified" && !i.technicalEvidence?.ref);
  if (unverified.length) (mode === "issue" ? errors : warnings).push(`${unverified.length} item(s) are marked verified without a technical reference.`);
  const strings = JSON.stringify(fx);
  if (MONEY_RX.test(strings)) errors.push("The document would contain a dollar figure — register documents never show prices or allowances.");
  // Prohibited products (CPB-02; src/lib/restrictedProducts.js). A selection that will be supplied and names one stops a
  // client-facing document, whatever the wording around it; anything else that names one (a "no engineered stone"
  // requirement, the client's note, existing or removed stone, a brand, the estimator's notes) warns. The room is
  // named, so two records with the same name can be told apart.
  const clientFacing = REGISTER_DOC_TYPES[docType]?.audience !== "internal";
  const found = restrictedFindings(register.items);
  for (const { item, product, blocking } of found) {
    const room = roomLabel(register, item);
    const what = `"${clean(item.description || item.product) || itemShort(item)}"${room ? ` (${room})` : ""}`;
    if (blocking) (mode === "issue" && clientFacing ? errors : warnings).push(`${what} names ${product.label.toLowerCase()} in a selection that will be supplied. ${product.rule} A selection names only what will be supplied, so reword it even if it says what was replaced or avoided (for example "Porcelain benchtop, 20 mm"); agree a compliant alternative with the client if needed. Existing or removed stone goes on a record marked Retain or Remove. The original wording stays in the register's history.`);
    else warnings.push(`${what} mentions ${product.label.toLowerCase()}. Check it isn't being supplied or installed. ${product.rule}`);
  }
  if (!found.some((f) => f.product.level === "error")) for (const product of restrictedInText(strings)) warnings.push(`This document mentions ${product.label.toLowerCase()} (for example in a pricing assumption). ${product.rule}`);
  // Characters Lato can't print come out blank. Ranges checked against Lato's own character set: other scripts
  // (Hebrew to Tibetan, Hangul, CJK), technical symbols, dingbats, misc symbols and arrows, emoji.
  const unprintable = [...new Set((strings.match(/[\u0590-\u0FFF\u1100-\u11FF\u2300-\u23FF\u2600-\u27BF\u2B00-\u2BFF\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]|[\uD800-\uDBFF][\uDC00-\uDFFF]/g) || []))];
  if (unprintable.length) warnings.push(`Some characters may not print in the Blue Leaf font: ${unprintable.slice(0, 8).join(" ")}. Check names and descriptions.`);
  if (docType === "selections_schedule" && !fx.selections.length) errors.push("There are no client selections to schedule yet.");
  if (docType === "tender_scope_notes" && !fx.tenderNotes.sections.some((sec) => sec.title !== "Drawing references")) errors.push("There is nothing in the register for the estimator yet.");
  if (docType === "client_brief" && !fx.clientBrief.scopeIn.length && !fx.clientBrief.preferences.length) warnings.push("The brief has no recorded scope or preferences yet.");
  const v = validateFixture(fx, { mode: mode === "issue" ? "issue" : "draft" });
  if (mode === "issue") errors.push(...v.errors); else warnings.push(...v.warnings);
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

/** Scan the RENDERED document for leaked placeholders / empty values (belt and braces after render). */
function renderedTextIssues(docxBuffer) {
  try {
    const zip = new PizZip(docxBuffer);
    const xml = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n)).map((n) => zip.files[n].asText()).join(" ");
    const text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const bad = [];
    if (/\{\s*[#/^]?\s*[A-Z][A-Z0-9_]+\s*\}/.test(text)) bad.push("unfilled template tag");   // tags with digits too (INT1_NUM)
    if (/\bundefined\b|\bNaN\b|\[object Object\]|\[Client\]/.test(text)) bad.push("empty or invalid value");
    return bad;
  } catch { return ["the document could not be read back"]; }
}

// ── render ───────────────────────────────────────────────────────────────────────────────────────

function templateFor(defKey) {
  const def = DOC_DEFS[defKey];
  const file = join(TEMPLATE_DIR, def.templateFile);
  const bytes = fs.readFileSync(file);
  return { def, bytes, file: def.templateFile, hash: createHash("sha256").update(bytes).digest("hex").slice(0, 16) };
}

/**
 * The font fail-safe (independent review CPB-13), read from the fonts embedded in the rendered PDF.
 * No Lato at all: the server is missing the font and the whole document came out in a substitute, so it is refused,
 * unless DOCUMENT_FONT_CHECK=warn is set while Lato is being installed. Lato plus another font: some characters (an
 * arrow, a tick, another script) fell back, so staff are warned and can check the text.
 */
export function fontVerdict(fonts, env = process.env) {
  const foreign = (fonts || []).filter((f) => !/^Lato-/.test(f));
  if (!(fonts || []).some((f) => /^Lato-/.test(f))) {
    const msg = `font substitution (${foreign.join(", ") || "no fonts embedded"}): the server needs the Lato font installed`;
    return String(env?.DOCUMENT_FONT_CHECK || "").toLowerCase() === "warn" ? { error: null, warnings: [msg] } : { error: msg, warnings: [] };
  }
  return { error: null, warnings: foreign.length ? [`Some characters printed in a fallback font (${foreign.join(", ")}). Check the text for symbols or characters from other scripts.`] : [] };
}

export async function renderRegisterDocument(docType, fx, { layout } = {}) {
  const spec = REGISTER_DOC_TYPES[docType];
  const defKey = layout === "client" && spec.altLayout ? spec.altLayout : spec.def;
  const t = templateFor(defKey);
  const payload = t.def.build(fx);
  const docx = renderDocxTemplate(t.bytes, payload);
  const leaks = renderedTextIssues(docx);
  const pdf = await convertDocxToPdfBuffer(docx);
  // Fail safe (independent review CPB-13): every register template is Lato only. Any other font means the server
  // substituted (e.g. Lato isn't installed), so the document is refused rather than issued looking wrong.
  const fonts = pdfFontNames(pdf);
  const verdict = fontVerdict(fonts);
  if (verdict.error) leaks.push(verdict.error);
  return { docx, pdf, template: { key: defKey, file: t.file, hash: t.hash }, leaks, fonts, fontWarnings: verdict.warnings };
}

// ── load inputs ──────────────────────────────────────────────────────────────────────────────────

async function loadInputs(sb, leadId, actor) {
  const { data: lead } = await sb.from("leads").select("id, name, stage, job_id, project_type").eq("id", leadId).maybeSingle();
  if (!lead) throw new DocumentError(404, "Lead not found", "NOT_FOUND");
  const loaded = await loadRegister(sb, leadId, { actor });
  const context = await loadRegisterContext(sb, leadId);
  return { lead, loaded, register: loaded.register, context };
}

async function nextVersion(sb, leadId, docType) {
  const { data, error } = await sb.from("lead_documents").select("version").eq("lead_id", leadId).eq("document_type", docType)
    .not("issued_at", "is", null).order("version", { ascending: false }).limit(1);
  if (error) {
    if (error.code === "42703") throw new DocumentError(503, "Apply migration 213 first (document issue registry).", "SCHEMA");
    throw new DocumentError(400, "Could not read the issue history.", "HISTORY");
  }
  return (data?.[0]?.version || 0) + 1;
}

// A stable fingerprint of the register content a document is rendered from: item id → version (updatedAt as
// the fallback for an unversioned row). Round-tripped from preview to issue so that if the brief changed
// between the two, the issue is refused and no stale controlled document is recorded (Tab 27 R04 review §1).
export function registerItemVersions(register) {
  return Object.fromEntries((register?.items || []).map((i) => [i.id, i.sync?.version ?? i.updatedAt ?? null]));
}
function versionsDiffer(expected, current) {
  if (!expected || typeof expected !== "object") return false;        // no expectation sent → guard is inert
  const ek = Object.keys(expected), ck = Object.keys(current);
  if (ek.length !== ck.length) return true;
  for (const k of ek) if (String(expected[k]) !== String(current[k])) return true;   // changed or vanished item
  for (const k of ck) if (!(k in expected)) return true;                             // a new item appeared
  return false;
}

// ── public API ───────────────────────────────────────────────────────────────────────────────────

/** Render a DRAFT (not stored). Returns the PDF, the pre-issue check result, and the content fingerprint. */
export async function previewDocument(sb, leadId, docType, { layout, recipientName, actor } = {}) {
  if (!DOC_TYPE_KEYS.has(docType)) throw new DocumentError(400, "Unknown document type.", "BAD_DOC");
  const { lead, register, context } = await loadInputs(sb, leadId, actor);
  let revision = 1;
  try { revision = await nextVersion(sb, leadId, docType); } catch { /* preview works pre-213 */ }
  const input = { lead, context, register, revision, issuedDate: isoDate(), issuer: actor?.name, recipientName };
  const fx = buildRegisterFixture(docType, { ...input, status: "Draft" });
  // Show exactly what WOULD block an issue (checked on the issued form of the same document).
  const checks = registerDocChecks(docType, buildRegisterFixture(docType, { ...input, status: "Issued" }), { register, recipientName, mode: "issue" });
  const out = await renderRegisterDocument(docType, fx, { layout });
  if (out.leaks.length) checks.errors.push(`Rendering problem: ${out.leaks.join(", ")}.`);
  checks.warnings.push(...(out.fontWarnings || []));
  return { pdf: out.pdf, checks, revision, itemVersions: registerItemVersions(register) };
}

/**
 * Issue an immutable revision. Blocks on any pre-issue error (nothing stored). Retries once if someone
 * else issued the same document at the same moment (the PDF carries its revision number).
 */
export async function issueDocument(sb, leadId, docType, { recipientName, recipientEmail, layout, actor, expectedVersions } = {}) {
  if (!DOC_TYPE_KEYS.has(docType)) throw new DocumentError(400, "Unknown document type.", "BAD_DOC");
  for (let attempt = 0; attempt < 2; attempt++) {
    const { lead, loaded, register, context } = await loadInputs(sb, leadId, actor);
    // R04 review §1: refuse to issue a controlled document from data that changed since it was previewed.
    // `expectedVersions` is the fingerprint the preview returned (round-tripped by the client). If the
    // register moved on — a concurrent edit, or the client's own edits never persisted — nothing is issued.
    if (versionsDiffer(expectedVersions, registerItemVersions(register))) {
      throw new DocumentError(409, "The brief changed since you previewed it — nothing was issued. Re-open the preview to see the current version, then issue again.", "ISSUE_STALE");
    }
    const revision = await nextVersion(sb, leadId, docType);
    const issuedDate = isoDate();
    const fx = buildRegisterFixture(docType, { lead, context, register, revision, status: "Issued", issuedDate, issuer: actor?.name, recipientName });
    // New issues are R01, R02 … (one convention, documentIdentity.mjs). Rows already issued keep their stored P labels.
    const revLabel = issueRevisionLabel(revision);
    const checks = registerDocChecks(docType, fx, { register, recipientName, mode: "issue" });
    if (checks.errors.length) throw new DocumentError(422, "This document can't be issued yet.", "PREFLIGHT", { checks });
    const out = await renderRegisterDocument(docType, fx, { layout });
    if (out.leaks.length) throw new DocumentError(422, "This document can't be issued yet.", "PREFLIGHT", { checks: { errors: [`Rendering problem: ${out.leaks.join(", ")}.`], warnings: [] } });

    const sha = createHash("sha256").update(out.pdf).digest("hex");
    const stamp = `${issuedDate}-${docType.replace(/_/g, "-")}-${revLabel}-${randomBytes(3).toString("hex")}`;
    const pdfPath = `leads/${leadId}/register/${docType}/${stamp}.pdf`;
    const docxPath = `leads/${leadId}/register/${docType}/${stamp}.docx`;
    // A thrown rejection (network/timeout under undici) is normalised to the same {error} shape the
    // supabase-js client returns, so the cleanup/error-handling below runs on a throw too, not just on a
    // returned error — "nothing was issued" stays true whether the backend returns or throws.
    let up1;
    try { up1 = await sb.storage.from(BUCKET).upload(pdfPath, out.pdf, { contentType: PDF_MIME, upsert: false }); }
    catch (e) { up1 = { error: { message: e?.message || "PDF upload threw", thrown: true } }; }
    if (up1.error) throw new DocumentError(502, "Could not store the issued PDF.", "STORAGE");
    // Tab 25 issue 5: both files must store, or neither — a half-stored issue (PDF without its DOCX
    // export) would 502 on the controlled-export download. Check the DOCX upload and roll back the PDF.
    let up2;
    try { up2 = await sb.storage.from(BUCKET).upload(docxPath, out.docx, { contentType: DOCX_MIME, upsert: false }); }
    catch (e) { up2 = { error: { message: e?.message || "DOCX upload threw", thrown: true } }; }
    if (up2.error) {
      await sb.storage.from(BUCKET).remove([pdfPath]).catch(() => {});
      throw new DocumentError(502, "Could not store the issued document (DOCX export).", "STORAGE");
    }

    const label = REGISTER_DOC_TYPES[docType].label;
    const filename = `${label} — ${fx.project.clientName} — ${revLabel}.pdf`.replace(/[\\/]/g, "-");
    const versions = registerItemVersions(register);
    let data, error;
    try { ({ data, error } = await sb.rpc("register_issue_document", {
      p_lead_id: leadId, p_document_type: docType, p_expected_version: revision,
      p_row: {
        filename, file_size: out.pdf.length, mime_type: PDF_MIME, storage_path: pdfPath, uploaded_by: actor?.email || actor?.name || "register",
        content_sha256: sha, revision_label: revLabel, template_key: out.template.key,
        template_version: `${out.template.file}@${out.template.hash}`,
        source_snapshot: { fixture: fx, registerMode: loaded.mode, registerMetaRev: register.meta.rev ?? null, itemVersions: versions,
          libraryVersion: QUESTION_LIBRARY_VERSION, exportDocxPath: docxPath, layout: layout || "technical" },
        issued_by: actor?.id || null, issued_by_name: actor?.name || null, recipient_name: clean(recipientName), recipient_email: clean(recipientEmail) || null,
        audience: REGISTER_DOC_TYPES[docType].audience, job_id: lead.job_id || null, project_id: loaded.projectId || null,
      },
    })); } catch (e) { data = null; error = { message: e?.message || "register_issue_document threw", thrown: true }; }
    if (error) {
      // The DB record was not written — remove the orphaned storage objects so "nothing was issued" is
      // literally true (no unreferenced PDF/DOCX left behind). Tab 25 issue 5.
      await sb.storage.from(BUCKET).remove([pdfPath, docxPath]).catch(() => {});
      if (error.code === "42883" || error.code === "PGRST202") throw new DocumentError(503, "Apply migration 213 first (document issue registry).", "SCHEMA");
      if (/is not a register document type/.test(error.message || "") || error.code === "23514") throw new DocumentError(503, "Apply migration 218 first (Tender Scope & Pricing Notes). Nothing was issued.", "SCHEMA");
      throw new DocumentError(400, "Could not record the issue — nothing was issued.", "ISSUE", { detail: error.message });
    }
    if (data?.ok === false) {
      // No revision was recorded — drop this attempt's orphan uploads. A version conflict re-renders at
      // the next number on the retry; any other refusal surfaces cleanly.
      await sb.storage.from(BUCKET).remove([pdfPath, docxPath]).catch(() => {});
      if (data.reason === "version_conflict") continue;                           // someone issued at the same time — re-render
      throw new DocumentError(409, "Could not record the issue — nothing was issued.", "ISSUE", { detail: data.reason });
    }
    if (lead.job_id) {
      try {
        await sb.from("job_events").insert({ job_id: lead.job_id, event_type: "register.document.issued", source: "register", actor_id: actor?.id || null,
          entity_type: "document", entity_id: data.document.id, metadata: { lead_id: leadId, document_type: docType, version: revision, recipient: clean(recipientName), sha256: sha } });
      } catch { /* history is best-effort here; the issue row itself is the record */ }
    }
    return { document: data.document, supersededId: data.superseded_id || null, checks };
  }
  throw new DocumentError(409, "Another issue of this document happened at the same moment — please try again.", "VERSION");
}

const LIST_COLS = "id, filename, document_type, created_at, mime_type, file_size, version, status, revision_label, issued_at, issued_by_name, recipient_name, recipient_email, content_sha256, template_version, supersedes_document_id, discipline, issuer, doc_number, received_at, review_status, review_notes, outstanding_question, register_item_ids";

export async function listDocuments(sb, leadId) {
  const { data, error } = await sb.from("lead_documents").select(LIST_COLS).eq("lead_id", leadId)
    .in("document_type", [...DOC_TYPE_KEYS, "register_baseline", "consultant_document", "supplier_document"])
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42703") return { issued: [], sources: [], schemaReady: false };
    throw new DocumentError(400, "Could not list documents.", "LIST");
  }
  return {
    issued: (data || []).filter((d) => d.issued_at),
    sources: (data || []).filter((d) => ["consultant_document", "supplier_document"].includes(d.document_type)),
    schemaReady: true,
  };
}

export async function documentUrl(sb, leadId, docId, { export: exportDocx } = {}) {
  const { data: doc } = await sb.from("lead_documents").select("id, lead_id, storage_path, source_snapshot").eq("id", docId).eq("lead_id", leadId).maybeSingle();
  if (!doc) throw new DocumentError(404, "Document not found", "NOT_FOUND");
  const path = exportDocx ? doc.source_snapshot?.exportDocxPath : doc.storage_path;
  if (!path) throw new DocumentError(404, "No editable export for this document.", "NOT_FOUND");
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) throw new DocumentError(502, "Could not open the stored file.", "STORAGE");
  return data.signedUrl;
}

/** Draft coordination request for a consultant / supplier (filtered schedule) — not an issued record. */
export async function supplierPack(sb, leadId, discipline, { actor } = {}) {
  if (!COORD_DISCIPLINES[discipline]) throw new DocumentError(400, "Unknown discipline.", "BAD_DISCIPLINE");
  const { lead, register, context } = await loadInputs(sb, leadId, actor);
  const fx = buildRegisterFixture("selections_schedule", { lead, context, register, revision: 1, status: "Draft", issuedDate: isoDate(), issuer: actor?.name }, { coord: discipline });
  fx.project.sectionLabel = `Coordination request  ·  ${COORD_DISCIPLINES[discipline]}`;
  if (!fx.selections.length) throw new DocumentError(422, `No register items are tagged for ${COORD_DISCIPLINES[discipline]} yet.`, "EMPTY");
  const out = await renderRegisterDocument("selections_schedule", fx, {});
  return { pdf: out.pdf, count: fx.selections.length };
}

// ── received consultant / supplier documents (manual review + reconciliation, D-003) ─────────────

export async function addSourceDocument(sb, leadId, body, { actor } = {}) {
  const { filename, data, mimeType, documentType = "consultant_document", discipline, issuer, docNumber, revisionLabel, receivedAt, outstandingQuestion, itemIds } = body || {};
  if (!clean(filename) || !data) throw new DocumentError(400, "A file is required.", "BAD_FILE");
  if (!["consultant_document", "supplier_document"].includes(documentType)) throw new DocumentError(400, "Unknown document type.", "BAD_DOC");
  const buffer = Buffer.from(data, "base64");
  const safe = clean(filename).toLowerCase().replace(/\s+/g, "-").replace(/[^\w.-]/g, "");
  const path = `leads/${leadId}/register/sources/${isoDate()}-${randomBytes(3).toString("hex")}-${safe}`;
  const up = await sb.storage.from(BUCKET).upload(path, buffer, { contentType: mimeType || "application/octet-stream", upsert: false });
  if (up.error) throw new DocumentError(502, "Could not store the document.", "STORAGE");
  const { data: lead } = await sb.from("leads").select("job_id").eq("id", leadId).maybeSingle();
  const { data: row, error } = await sb.from("lead_documents").insert({
    lead_id: leadId, filename: clean(filename), file_size: buffer.length, mime_type: mimeType || null, storage_path: path,
    document_type: documentType, uploaded_by: actor?.email || actor?.name || "register",
    discipline: discipline || null, issuer: clean(issuer) || null, doc_number: clean(docNumber) || null, revision_label: clean(revisionLabel) || null,
    received_at: receivedAt || isoDate(), review_status: "received", outstanding_question: clean(outstandingQuestion) || null,
    register_item_ids: Array.isArray(itemIds) ? itemIds.map(String) : [], job_id: lead?.job_id || null,
  }).select(LIST_COLS).single();
  if (error) {
    await sb.storage.from(BUCKET).remove([path]);
    if (error.code === "42703" || error.code === "23514") throw new DocumentError(503, "Apply migration 213 first (coordination documents).", "SCHEMA");
    throw new DocumentError(400, "Could not record the document.", "SOURCE");
  }
  return row;
}

export async function updateSourceDocument(sb, leadId, docId, body) {
  const patch = {};
  if (body.reviewStatus !== undefined) {
    if (!["received", "under_review", "reconciled", "superseded"].includes(body.reviewStatus)) throw new DocumentError(400, "Unknown review status.", "BAD_STATUS");
    patch.review_status = body.reviewStatus;
  }
  if (body.reviewNotes !== undefined) patch.review_notes = clean(body.reviewNotes) || null;
  if (body.outstandingQuestion !== undefined) patch.outstanding_question = clean(body.outstandingQuestion) || null;
  if (body.itemIds !== undefined) patch.register_item_ids = Array.isArray(body.itemIds) ? body.itemIds.map(String) : [];
  if (body.discipline !== undefined) patch.discipline = body.discipline || null;
  if (!Object.keys(patch).length) throw new DocumentError(400, "Nothing to update.", "EMPTY");
  const { data, error } = await sb.from("lead_documents").update(patch).eq("id", docId).eq("lead_id", leadId)
    .in("document_type", ["consultant_document", "supplier_document"]).select(LIST_COLS).maybeSingle();
  if (error) throw new DocumentError(400, "Could not update the document.", "SOURCE");
  if (!data) throw new DocumentError(404, "Document not found", "NOT_FOUND");
  return data;
}
