/**
 * registerDocuments.mjs — Master Register R03 · controlled documents (Tab 22 §A D1–D3, D-031/D-035/DOC-001).
 *
 * ONE pipeline, existing engine: live register + Sales context → doc-engine FIXTURE (the contract of
 * server/lib/documents/documentPayloads.mjs) → payload → docTemplates.renderDocxTemplate (the canonical
 * renderer) → LibreOffice PDF (docxToPdf.mjs). No second engine, no hand-assembled documents.
 *
 *   D1 client_brief         Preliminary Client Project Brief — issue record only, no signature (D-035)
 *   D2 architect_brief      Architect Design Brief — client intent kept distinct from technical solutions
 *   D3 selections_schedule  Technical Selections Schedule — for the design team, estimator, suppliers and trades
 *      client_presentation  Client Selections Presentation — for the client
 *                           Both from the SAME records (selectionRecords), each with its own revision series
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
import { restrictedFindings, restrictedInText, restrictedFieldsOf } from "../../src/lib/restrictedProducts.js";
import {
  roomLabel, refCode, outstandingReasons, isClientSelection, resolvePromptId, questionById, docGroupFor, categoryLabel, clientSafeAnswer,
  dispositionLabel, responsibilityLabel, supplyLabel, PROJECT_TYPE_LABELS, DELIVERY_MODELS, INCLUDED_DISPOSITIONS,
  QUESTION_LIBRARY_VERSION, answerSummary, natureOf, answerConfigFor, linkedParentLabel, baselineAssumptions, performanceSuggestions, technicalLabel, pricingLabel,
  roomDefaultsFor, stableStringify,
} from "../../src/lib/register.js";
import { architectBriefModel, architectBriefLines, budgetLine, BUDGET_BAND_RX, whoOf, dueLabel } from "../../src/lib/briefModel.js";
import { contentChecks, releaseBlockers, restrictedGuidance } from "../../src/lib/registerQuality.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "../../public/templates");
const BUCKET = "lead-documents";
const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const REGISTER_DOC_TYPES = {
  client_brief: { label: "Preliminary Client Project Brief", def: "client_brief", audience: "client" },
  architect_brief: { label: "Architect Design Brief", def: "architect_brief", audience: "architect" },
  // Two documents from one register (SELECTIONS_SPEC.md S1): each has its own revision series, so issuing one never
  // supersedes the other. Both read selectionRecords().
  selections_schedule: { label: "Technical Selections Schedule", def: "selections_schedule", audience: "consultant" },
  client_presentation: { label: "Client Selections Presentation", def: "client_presentation", audience: "client" },
  tender_scope_notes: { label: "Tender Scope & Pricing Notes", def: "tender_scope_notes", audience: "internal" },
};
const DOC_TYPE_KEYS = new Set(Object.keys(REGISTER_DOC_TYPES));
export const COORD_DISCIPLINES = { architect: "Architect", routleys: "Routleys (plumbing fixtures)", tli: "TLI (lighting & electrical)", windows: "Window supplier", engineer: "Engineer", energy: "Energy assessor", joiner: "Joiner" };

const STAGE_LABEL = { enquiry: "Enquiry", qualify: "Qualify", discovery: "Discovery", winning_offer: "Concept presentation", fee_proposal: "PTSA / plans", consultants: "Design coordination", tender: "Tender", won: "Contract" };
const SCHEDULE_GROUPS = new Set(["External", "Internal Finishes", "Joinery", "Wet Areas", "Services & Fixtures", "External Works"]);
const ENVELOPE_CATS = new Set(["roof", "cladding", "windows", "insulation", "structure", "existing", "demolition", "site", "external", "stairs"]);
// The calendar date in Adelaide, where documents are issued: a UTC date printed the day before for anything issued
// before 10:30 am (found in the final inspection). YYYY-MM-DD.
const ADELAIDE_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Adelaide", year: "numeric", month: "2-digit", day: "2-digit" });
export const isoDate = (d = new Date()) => ADELAIDE_DAY.format(new Date(d));
export const adelaideDay = isoDate;
const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const sentence = (s) => { const t = clean(s); return t && !/[.!?]$/.test(t) ? `${t}.` : t; };

export class DocumentError extends Error {
  constructor(status, message, code, extra = {}) { super(message); this.status = status; this.code = code; Object.assign(this, extra); }
}

// ── fixture builders (live data → the doc-engine fixture contract) ───────────────────────────────

/** What a record says, in words people read: what was typed, else what was chosen on the card. Client-safe either way. */
const said = (item) => clean(item.description) || clean(answerSummary(item));
/** A by-when in a document's words (spec S4 actionDue): "By the next drawing issue", "By our next meeting", "By 28 Nov". */
const byWords = (due, reader = "") => (due === "next_issue" ? "By the next drawing issue" : due === "next_meeting" ? (reader === "client" ? "By our next meeting" : "By the next meeting")
  : dueLabel(due) ? `By ${dueLabel(due)}` : "");
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

/**
 * The project reference printed in BLB-[TYPE]-[REF]-[REV]. The Hub has no allocated project number yet (an owner
 * decision: format and when it is minted), so live documents use the lead-derived reference they always have.
 * `projectRef` is the hook for that number, and is how fixtures print a real-looking one.
 */
export const legacyProjectRef = (leadId) => `BL${String(leadId).replace(/-/g, "").slice(0, 6).toUpperCase()}`;

function baseFixture({ lead, context, register, revision, status, issuedDate, issuer, recipientName, projectRef, supersedes }) {
  const typeLabel = PROJECT_TYPE_LABELS[context.projectType] || "Residential project";
  const architect = (context.consultants || []).find((c) => ["architect", "designer", "interior_designer"].includes(c.role));
  const street = clean(String(context.identity.siteAddress || "").split(",")[0]);
  return {
    meta: { ref: projectRef || legacyProjectRef(lead.id), revision, status, issuedDate: status === "Issued" ? issuedDate : undefined, preparedDate: issuedDate, recipient: clean(recipientName) || undefined,
      // The issued revision this one replaces (final inspection R02-01): { label: "R01", issuedDate: "2026-10-28" }.
      supersedes: status === "Issued" && supersedes?.label ? { label: supersedes.label, issuedDate: supersedes.issuedDate || undefined } : undefined },
    project: {
      clientName: context.identity.clientName,
      suburb: clean(context.identity.suburb),
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
 * A group is one kind of work over one family of rooms (kitchen and living; bedrooms, robes and study; bathrooms and
 * laundry; …), in the room list's order, and names its rooms only: "New kitchen, scullery, living room, dining room and
 * family room". No category label: a label can't be both accurate and non-repetitive for every mix of rooms (CPB3-01/02:
 * "New living areas: … scullery …", "New bedrooms and study: … study"). A room name starting with an ordinary room word
 * is lowercased mid-sentence ("Guest WC" → "guest WC"); any other name (a person's, "Mia's bedroom") prints as typed. A
 * name that is only an adjective reads as a room ("Living" → "living room").
 *
 * A group of New rooms the project's own description line already lists is folded into that line instead of printed
 * again (CPB3-03: "New garage" after "New two-storey home with a double garage"). The fold must never hide a room's work,
 * so it is narrow, and when in doubt the group keeps its own line (a repeat, never a loss). It is a whitelist, not a
 * list of words to avoid (reviews CPB4-01, FOLD4B-01/02, FOLD4C-01): the line has no room and no area chips, is recorded
 * New or Included, and its WHOLE text has the shape
 *     new [storey/size words] home|house|dwelling|residence  with <list> [on|at a … block|site|lot]   (new build, knockdown)
 *     new [storey/size words] [rear|side|front] extension|addition  with <list> […]           (extension, renovation)
 * where every item of <list> is a room ("a double garage", "four bedrooms", "a study") with only an article, a number or
 * a size word before it. Each room of the group must be one of those items. Anything else (a parenthesis, a semicolon,
 * "excluded", "under separate contract", "a garage door", "New roof over the house with …") doesn't fold. The line keeps
 * its words exactly; it gains the group's references. When two project-wide lines each describe a building (a house and a
 * flat), nothing folds.
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
// Room families, each in reading order: rooms of one family and one kind of work share a line.
const ROOM_FAMILIES = [
  ["kitchen", "scullery", "pantry", "living", "dining", "family", "theatre"],
  ["bedroom", "wir", "study"],
  ["bathroom", "ensuite", "wc", "laundry", "mudroom"],
  ["hall", "stairs"],
  ["garage"],
  ["alfresco", "balcony", "external"],
];
// Words a room name can start with that are ordinary nouns or adjectives, lowercased mid-sentence. Anything else is a name.
const ROOM_WORDS = new Set(["kitchen", "scullery", "butler's", "pantry", "bathroom", "ensuite", "powder", "laundry", "mudroom", "living", "dining", "family", "rumpus",
  "theatre", "media", "bedroom", "main", "master", "guest", "walk-in", "robe", "study", "office", "stairs", "stair", "hall", "entry", "garage", "alfresco", "pergola",
  "balcony", "deck", "lounge", "meals", "retreat", "games", "upstairs", "downstairs", "upper", "lower", "ground", "first", "front", "rear", "back", "side", "outdoor",
  "sitting", "library", "cellar", "storage", "store", "workshop", "home", "kids", "nursery", "parents", "linen", "toilet", "shower", "spare", "second", "third",
  "external", "room", "gym", "sunroom", "verandah", "veranda", "porch", "patio", "courtyard", "attic", "loft", "basement", "utility", "dressing", "drying"]);
// A room named only by an adjective reads as a room mid-sentence: "Living" → "living room".
const BARE_ROOM = new Set(["living", "dining", "family", "rumpus", "sitting", "games", "media"]);
const roomOf = (register, i) => (register.meta.rooms || []).find((r) => r.id === i.roomId);
/** A place name for the start of a table cell: a room named only by an adjective reads as a room, "Family" → "Family room", as the scope list says it (final inspection RIDGELINE-03). */
const placeName = (name) => (BARE_ROOM.has(clean(name).toLowerCase()) ? `${clean(name)} room` : name);
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
const escapeRx = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// The whole line, as a whitelist: new [modifiers] BUILDING with LIST [place]. The building must be the project's own: a
// whole home on a new build or knockdown, an extension on an extension or renovation. "Rear", "ancillary" and the like
// name a second building on the site, so they never come before a home (review FOLD4C-01).
const FOLD_LINE = new RegExp(String.raw`^(?:brand-)?new(?:-build)?\s+(?:(?:[a-z]+-(?:storey|level|bedroom|floor)|single|double|upper|lower|ground|family|modern|contemporary|custom|large|compact)\s+){0,3}(?:(home|house|dwelling|residence)|(?:(?:rear|side|front)\s+)?(extension|addition))\s+with\s+(.+?)(?:\s+(?:on|at)\s+(?:a|an|the)\s+(?:[a-z-]+\s+){0,2}(?:block|site|lot|allotment))?$`);
const FOLD_HOME_PROJECTS = new Set(["new_build", "knockdown_rebuild"]), FOLD_EXTENSION_PROJECTS = new Set(["extension", "renovation"]);
// Any line that names a building, however it is written. With two of them (a house and a flat, two extensions) nothing
// folds: the rooms can't be told apart by words (reviews FOLD4D-01, ONEBLD-01).
const BUILDING_WORD = /\b(?:home|house|dwelling|residence|unit|flat|studio|cabin|cottage|annexe?|extension|addition|duplex|townhouse|villa|pavilion|bungalow|granny|build|rebuild|building|property|knock-?down)s?\b/i;
const FOLD_COUNT = "a|an|the|one|two|three|four|five|six|single|double|triple|twin|tandem|separate|attached|detached|integrated|internal|large|new|lock-up";
// Ordinary room nouns a description lists alongside the group's rooms ("four bedrooms, a study and a double garage").
const FOLD_ROOM_NOUNS = ["bedroom", "bathroom", "ensuite", "study", "office", "garage", "laundry", "kitchen", "scullery", "pantry", "butler's pantry", "living area", "living room", "dining room",
  "family room", "rumpus room", "media room", "theatre", "retreat", "powder room", "wc", "toilet", "walk-in robe", "robe", "mudroom", "alfresco", "deck", "balcony", "cellar", "workshop"];
const foldItem = (noun) => new RegExp(`^(?:(?:${FOLD_COUNT})\\s+){0,3}${escapeRx(noun)}s?$`);
/** Does this project-wide line already list every one of these rooms as part of the new building? (CPB3-03, CPB4-01) */
function lineListsRooms(line, rooms, allRooms, projectType) {
  // projectWide is also implied by the grammar (a room or area line starts "Room: "); kept so the rule never depends on it.
  if (!line.projectWide || !["new", "included"].includes(line.disposition)) return false;
  const m = clean(line.text).toLowerCase().replace(/\.$/, "").match(FOLD_LINE);
  if (!m || !(m[1] ? FOLD_HOME_PROJECTS : FOLD_EXTENSION_PROJECTS).has(projectType)) return false;
  const items = m[3].split(/\s*,\s*(?:and\s+)?|\s+and\s+/).map((x) => x.trim());
  const nouns = [...FOLD_ROOM_NOUNS, ...allRooms.map((r) => roomWords(r.name).text.toLowerCase())].map(foldItem);
  if (!items.every((x) => nouns.some((rx) => rx.test(x)))) return false;
  return rooms.every((r) => { const rx = foldItem(roomWords(r.name).text.toLowerCase()); return items.some((x) => rx.test(x)); });
}
function groupRoomScope(register, list, lineOf, projectType) {
  const out = [], groups = new Map();
  for (const i of list) {
    const kind = roomOnlyWork(register, i);
    // Project-wide: no room and no area chips (an area-scoped record names its areas in a prefix, review SCOPE4-02).
    const area = roomLabel(register, i);
    if (!kind) { out.push({ ...lineOf(i), refs: [refCode(i)], projectWide: !i.roomId && (area === "Whole house" || area === "Site / existing"), disposition: i.disposition, section: i.section }); continue; }
    const room = roomOf(register, i), fam = ROOM_FAMILIES.findIndex((f) => f.includes(room.roomType)), key = `${kind.kind}|${fam}`;
    if (!groups.has(key)) { const g = { kind, fam, rooms: [], refs: [] }; groups.set(key, g); out.push(g); }
    const g = groups.get(key);
    if (!g.rooms.some((r) => r.id === room.id)) g.rooms.push(room);
    g.refs.push(refCode(i));
  }
  // CPB3-03: a New group the project's description line already lists is not printed twice; that line carries its
  // references. Only New work folds (review CPB4-01): Renovated, Refurbished and Alterations to always keep their line.
  const lines = out.filter((x) => !x.rooms);
  // …and the target must be the project's only New or Included description line (site works aside), so a house line
  // worded without a building word ("Two-storey new build …") still stops a flat's line from taking its rooms (FOLD5-01).
  const oneBuilding = lines.filter((l) => BUILDING_WORD.test(clean(l.text))).length === 1
    && lines.filter((l) => l.projectWide && l.section !== "site" && ["new", "included"].includes(l.disposition)).length === 1;
  const folded = out.filter((x) => x.rooms && x.kind.kind === "new" && oneBuilding).filter((g) => {
    const into = lines.find((l) => lineListsRooms(l, g.rooms, register.meta.rooms || [], projectType));
    if (into) into.refs.push(...g.refs);
    return !!into;
  });
  const rank = new Map((register.meta.rooms || []).map((r, k) => [r.id, k]));
  return out.filter((x) => !folded.includes(x)).map((x) => {
    if (!x.rooms) return { text: x.text, ref: x.ref, refs: x.refs };
    const family = ROOM_FAMILIES[x.fam];
    const rooms = x.rooms.slice().sort((a, b) => (family ? family.indexOf(a.roomType) - family.indexOf(b.roomType) : 0) || rank.get(a.id) - rank.get(b.id));
    return { text: x.kind.verb(roomNames(rooms), roomWords(rooms[0].name).common), ref: x.refs[0], refs: x.refs };
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
// The kicker names where the project is, never something the brief doesn't contain: no brief has a price, so no label
// says "pricing" (checkpoint 4 review, finding 1).
const PATHWAY_STAGE_LABEL = { build_only: "Scope review", plans_supplied: "Plans review", architect_tender: "Tender" };
/** The cover's way of working, where the pathway isn't the delivery model itself. */
const PATHWAY_PROJECT_LABEL = { plans_supplied: "Plans supplied", architect_tender: "Architect-led design" };

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
      // Says how the engagement runs, never that design input can be skipped (as CPB2-03 for build only), and never that
      // the supplied plans are complete or ready to build from (CPB3-07: the review's own wording).
      paras: ["You've supplied plans for this project. We'll confirm the consultant information and any remaining details required before pricing."],
      steps: mark([
        { label: "Plans review", text: general ? "Any consultant documents and approvals the work needs are confirmed against your plans." : "Engineering, energy and other consultant documents are confirmed against your plans." },
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
        { label: "Concept", text: "We record the direction discussed so far in this brief." },
        { label: "Pre-construction agreement", text: "A separate agreement sets out the design and pricing services, responsibilities and fees." },
        { label: "Design, selections and pricing", text: "Consultants coordinate the design, your selections are confirmed and the scope is priced." },
        { label: "Building contract", text: "The contract confirms the scope, price and programme before construction starts." },
      ], lead.stage === "fee_proposal" ? 1 : 0),
      // One concise clarification the table row doesn't already say, and no office acronym (final inspection KESTREL-01).
      ptsa: { text: "The pre-construction agreement is separate from this brief and from any building contract." },
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
  const scopeIn = groupRoomScope(register, items.filter((i) => isWork(i) && INCLUDED_DISPOSITIONS.has(i.disposition) && (said(i) || i.disposition !== "undecided")), (i) => entry(i, `${where(i)}${workWords(i)}`), context.projectType);
  const isRisk = (i) => i.technicalStatus === "needs_verification" && (["site", "existing", "demolition", "structure"].includes(i.category) || i.section === "site");
  // CPB2-07: the consultant disciplines are named only where the project evidently needs them (new floor area, or a
  // recorded site or structural check); otherwise the brief says it generally and implies no process the job may not need.
  const technicalChecks = ["new_build", "knockdown_rebuild", "extension"].includes(context.projectType) || items.some(isRisk) ? "named" : "general";
  const block = (label, note, list) => ({ label, note, items: list });
  const physical = (i) => !NOT_WORK.has(natureOf(i));

  // 7 · Decisions: a real action (an action record, or an open next action), never a recorded preference. Every one
  // set for the client prints (the ⚑ says it will, spec S4); other decisions fill the list up to seven.
  const open = items.filter((i) => outstandingReasons(i).some((r) => r === "decision" || r === "action") && i.itemKind !== "requirement")
    .filter((i) => !["architect", "consultant", "trade"].includes(i.responsibility))
    .map((i) => ({ i, action: clean(i.nextAction) && !i.resolved ? clean(i.nextAction) : natureOf(i) === "action" ? said(i) : "" }))
    .filter(({ i, action }) => action && !(isClientSelection(i) && DESIGN_DIRECTION.has(i.certainty) && !clean(i.nextAction)));
  const clients = open.filter(({ i }) => i.responsibility === "client");
  const decisions = [...clients, ...open.filter(({ i }) => i.responsibility !== "client").slice(0, Math.max(0, 7 - clients.length))];
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
    groups.get(g).push({ where: placeName(area(i)), text: clean(i.description || i.product) || said(i), status: selectionStatus(i), ref: refCode(i) });
  }
  // An office-only technical note (R-015 tolerances) is never shown as the client's requirement (review CPB4-L01); a
  // check it needs prints under "Still to be checked".
  const goals = items.filter((i) => i.itemKind === "requirement" && said(i) && resolvePromptId(i.promptKey) !== "P-005" && answerConfigFor(resolvePromptId(i.promptKey))?.tier !== "office_only")
    .map((i) => ({ where: placeName(area(i)), text: `${plainShort(i)}: ${said(i)}`, status: reviewOnly(i) ? "For consultant review" : "Requirement", ref: refCode(i) }));
  const preferences = [...CPB_GROUP_ORDER.filter((g) => groups.has(g)).map((g) => ({ group: g, items: groups.get(g) })), ...(goals.length ? [{ group: "Requirements and goals", items: goals.slice(0, 8) }] : [])];

  // 6 · Noted facts stay facts.
  const facts = items.filter((i) => natureOf(i) === "fact" && clean(answerSummary(i)) && i.answer?.state !== "not_applicable")
    .map((i) => (!SETTLED_FACT(i) ? unconfirmedFact(i) : siteAccessSentence(i) || `${plainShort(i)}: ${readableList(i)}`));

  if (lead.stage !== LEAD_STAGES.WON) fx.project.stageLabel = PATHWAY_STAGE_LABEL[cpbPathway(context)] || fx.project.stageLabel;
  // The cover names the brief's own pathway, as the kicker and next steps do: a plans-supplied brief never reads
  // "Design & build" (final inspection CONSISTENCY-01). Project types in sentence case, as the subtitle (RIDGELINE-08).
  const typeWords = `${typeLabel.charAt(0)}${typeLabel.slice(1).toLowerCase()}`;
  // Single spaces round the dot, as the STATUS cell beside it (verification CLOSE-01).
  fx.project.projectLabel = [typeWords, PATHWAY_PROJECT_LABEL[cpbPathway(context)] || DELIVERY_MODELS[context.deliveryModel]].filter(Boolean).join(" · ");
  // The boundaries heading names only the lists that print (final inspection RIDGELINE-11).
  const has = (label) => boundaries.some((g) => g.label === label && g.items.length);
  const titleParts = [has("Existing to remain or protect") && "what stays",
    ["Not in the current scope", "By others", "Items you plan to supply"].some(has) && "what's not included",
    ["Still to be decided", "Still to be checked"].some(has) && "what still needs checking"].filter(Boolean);
  const boundaryTitle = titleParts.length ? `${andList(titleParts).charAt(0).toUpperCase()}${andList(titleParts).slice(1)}` : "";
  fx.clientBrief = {
    pathway: cpbPathway(context),
    subtitle: `${typeWords}${context.identity.suburb ? `, ${context.identity.suburb}` : ""}`,
    overview: [description, occupancy].filter(Boolean),
    priorities, priorityNote,
    direction: vision && vision !== description ? vision : "",
    scopeIn,
    technicalChecks,
    boundaries,
    boundaryTitle,
    preferences,
    noted: facts.length ? [{ label: "What we have noted about the site and household", items: facts }] : [],
    decisions: decisions.map(({ i, action }) => ({ ref: refCode(i), action: sentence(action), owner: i.responsibility ? responsibilityLabel(i.responsibility) : "", by: byWords(i.actionDue, "client") })),
    nextSteps: cpbNextSteps(lead, context, technicalChecks),
  };
  return fx;
}

// ── Architect Design Brief (BLB-ADB): coordination first ─────────────────────────────────────────
// Master Register Tab 11:25-30 (T2), Tab 22:14-22 (D2), Tab 17:36/:84-86 (coordination first; client-approved intent
// vs technical solution to verify), Tab 27:20 (an action and its requirement are linked by reference, never repeated).
// Owner's editorial rule (16 Nov 2026): common information once, then the meaningful exceptions; statuses only where
// they say something; no system wording repeated row after row.
/** Who acts on a record, in an architect's words: the named consultant where one is recorded, else the discipline. */
function adbWho(context, i) {
  const w = whoOf(context, i);
  if (w.key !== "consultant") return w.label;
  const coord = questionById(resolvePromptId(i.promptKey))?.coord;
  return !i.actionRole && coord && COORD_DISCIPLINES[coord] ? COORD_DISCIPLINES[coord] : w.label;
}
/**
 * The Architect Design Brief (adb-2.0): the brief model (src/lib/briefModel.js) is the fixture, so the PDF, the
 * Documents step's "What will print" list and the issued snapshot all hold the same lines, each with its record ids.
 */
function architectBriefFixture(input) {
  const { context, register } = input;
  const fx = baseFixture(input);
  const model = architectBriefModel(register, context, { recipientName: input.recipientName });
  fx.project.projectLabel = model.projectLabel;
  // The brief is from the business (spec S6); who issued it stays on the issue record (issued_by_name).
  fx.project.preparedBy = "Blue Leaf Building";
  fx.architectBrief = {
    model: "adb-2.0",
    subtitle: model.subtitle, preparedFor: model.preparedFor, projectLabel: model.projectLabel,
    project: model.project, site: model.site, points: model.points, hasBy: model.hasBy,
    roomGroups: model.roomGroups, floorBands: model.floorBands, selections: model.selections, selectionsTitle: model.selectionsTitle, outside: model.outside,
    // The single line allowed to hold dollars (owner decision 1), so the money check can tell it apart.
    budgetBand: budgetLine(context) || undefined,
    lines: architectBriefLines(model, { siteAddress: fx.project.siteAddress, clientName: fx.project.clientName, drawingBasis: fx.project.drawingBasis }),
    notPrinted: model.notPrinted, counts: model.counts,
  };
  return fx;
}

// ── Selections: one model for the Technical Selections Schedule and the Client Selections Presentation ─────
// docs/documents/SELECTIONS_SPEC.md. Every field comes from an existing register or context field: nothing here adds
// data, and both documents read the same records, so they can never describe one selection two ways.

/** The schedule's trade and system groups, in order (spec §3.2). A category not listed is "Other selections". */
export const TRADE_GROUPS = [
  ["Roof and walls", ["roof", "cladding", "insulation"]],
  ["Windows and doors", ["windows", "doors"]],
  ["Internal finishes", ["flooring", "walls_ceiling", "paint", "trim", "stairs"]],
  ["Joinery and benchtops", ["joinery", "benchtop", "appliances"]],
  ["Plumbing fixtures and tiling", ["sanitary", "tiling", "plumbing"]],
  ["Lighting and electrical", ["electrical"]],
  ["Heating, cooling and services", ["hvac", "services"]],
  ["External works", ["external", "site"]],
];
const TRADE_OF = new Map(TRADE_GROUPS.flatMap(([g, cats]) => cats.map((c) => [c, g])));
export const tradeGroupFor = (category) => TRADE_OF.get(category) || "Other selections";
const TRADE_ORDER = [...TRADE_GROUPS.map(([g]) => g), "Other selections"];
/** Questions whose open actions are selection decisions, whatever their category (K-012 "unresolved choices"). */
const CHOICE_QUESTIONS = new Set(["K-012"]);
/**
 * A record staff add by hand has no question and the category "notes" (the register can't set another), so a TLI
 * fitting or a window maker's opening would never reach its trade. It goes with the discipline of the document it
 * cites (lead_documents.discipline, keyed as COORD_DISCIPLINES): no supplier name is guessed (spec critique).
 */
const DISCIPLINE_GROUP = { tli: "Lighting and electrical", windows: "Windows and doors", routleys: "Plumbing fixtures and tiling", joiner: "Joinery and benchtops" };

/**
 * A received document as one line: its issuer and number ("Rylock RM-6403"); with no number, its file name ("TLI
 * lighting legend"), with the issuer first when the name doesn't start with it. The revision is printed in its own
 * column, never repeated here (QA K-07).
 */
function sourceDocLabel(d) {
  const stem = clean(String(d.filename || "").replace(/\.(pdf|docx?|xlsx?)$/i, ""));
  if (clean(d.docNumber)) return clean([d.issuer, d.docNumber].filter(Boolean).join(" "));
  if (stem) return d.issuer && !stem.toLowerCase().startsWith(clean(d.issuer).toLowerCase()) ? `${clean(d.issuer)} ${stem}` : stem;
  return clean(d.issuer) || "Document on file";
}
const reviewOf = (d) => d?.reviewStatus ?? d?.review_status ?? null;
/**
 * Approved with real evidence: who, when and how recorded on the record. An approval that exists only as the portal
 * board's "approved" status has evidence made up when the row is read (registerStore: by "Portal board"), which can
 * come from a promoted scratchpad item nobody approved (research A, SFS-15): the selections documents don't count it.
 */
const approvedWithEvidence = (i) => approvalIsEvidenced(i) && !i.sync?.approvedOnBoard;
/**
 * The selection state (spec §2), never more than the record holds. The portal's answers keep their own states, so the
 * client is never asked again about something they've already answered (spec critique: in_review, changes_requested).
 */
function selectionState(i, hasWords) {
  if (i.disposition === "retain") return "existing";
  if (i.sync?.status === "changes_requested") return "change_requested";
  if (i.sync?.status === "in_review") return "with_blue_leaf";
  if (["client_unsure", "unresolved"].includes(i.answer?.state) || (i.answer?.selected || []).some((x) => x?.stale)) return "undecided";
  if (i.certainty === "client_approved") return approvedWithEvidence(i) ? "approved" : "proposed";
  if (i.certainty === "proposed") return "proposed";
  if (i.certainty === "preference") return "preferred";
  // Someone owns it or has an action on it (a supplier's "TBC by designer"): it is being decided, not undiscussed.
  return hasWords || clean(i.nextAction) || i.responsibility ? "undecided" : "not_discussed";
}
/** One word per state, the same in both documents; the presentation leaves out what the client never discussed. */
const STATE_WORDS = { approved: "Client-approved", proposed: "Proposed", preferred: "", undecided: "To be decided", not_discussed: "Not yet discussed",
  existing: "Existing to remain", with_blue_leaf: "Client's choice, with Blue Leaf", change_requested: "Change requested, with Blue Leaf" };
/** A legacy row's description carries "— Supplier: X" (readRegister): never the client's words. */
const clientWords = (t) => clean(String(t || "").replace(/\s+—\s+Supplier:[^—]*/g, ""));
/** A pre-register schedule row adopted as a record: "item — Supplier: X — notes". Only its item is the client's. */
const isLegacyRow = (i) => i.updatedAt === "1970-01-01T00:00:00.000Z" && i.category === "notes";

/**
 * One record per client selection, with every field either document prints (spec §2). opts.coord narrows to one
 * party's records (a coordination pack): the question's coordination tag, or the supplier's name.
 */
export function selectionRecords(register, context = {}, { coord } = {}) {
  const rooms = register.meta.rooms || [];
  const byId = new Map(register.items.map((i) => [i.id, i]));
  const docs = new Map((context.drawings || []).filter((d) => d?.id).map((d) => [d.id, d]));
  const coordOf = (i) => questionById(resolvePromptId(i.promptKey))?.coord || null;
  const disciplineOf = (i) => clean(docs.get(i.sourceDocId)?.discipline) || null;
  let items = register.items.filter(isClientSelection);
  // A pack: the question's coordination tag, the discipline of the document the record cites, or (Routleys and TLI
  // only, as before) the supplier's name.
  if (coord) items = items.filter((i) => coordOf(i) === coord || disciplineOf(i) === coord || (coord === "routleys" && /routleys/i.test(i.supplier || "")) || (coord === "tli" && /\btli\b/i.test(i.supplier || "")));
  return orderItems(register, items).map((i) => {
    const room = rooms.find((r) => r.id === i.roomId);
    const q = questionById(resolvePromptId(i.promptKey));
    const zone = clean(i.answer?.zone?.label);
    const areas = (i.answer?.areaIds || []).map((id) => rooms.find((r) => r.id === id)).filter(Boolean).map((r) => placeName(clean(r.name)));
    // A room's own choice; the rooms a project-wide record names; a house-wide default (with its zone); the site; the
    // room a portal-board row was created for; or a record tied to no room, said as such ("throughout the house" would
    // claim more than the record does, e.g. a TLI fitting before the lighting plan arrives).
    const location = room ? placeName(clean(room.name)) : areas.length ? roomList(areas) : i.isDefault ? (zone || "Throughout the house")
      : i.section === "site" ? "Site" : clean(i.room) || "No room recorded";
    const linked = i.overridesDefaultId ? byId.get(i.overridesDefaultId) : null;
    // An exception names what it replaces only when that default applies to this room (ADB-01, roomDefaultsFor).
    const applies = !!(room && linked && q && roomDefaultsFor(register, q, room.roomType).some((d) => d.id === linked.id));
    const defWords = applies ? clientWords(linked.description) || clean(linked.product) || said(linked) : "";
    const custom = !q;   // a record staff added by hand: its description names it
    const legacy = isLegacyRow(i);
    // Gutters say which roof (linkedParentLabel), as before (register-documents-structured "gutters say which roof").
    const under = linkedParentLabel(register, i);
    const withParent = (t) => (t && under ? `${t}, ${under}` : t);
    const product = withParent(clean(i.product));
    const typed = withParent(custom ? "" : legacy ? clean(String(i.description || "").split(" — ")[0]) : clientWords(i.description) || clean(answerSummary(i)));
    const words = product || typed;
    const doc = i.sourceDocId ? docs.get(i.sourceDocId) || null : null;
    const review = reviewOf(doc);
    // A preference with nothing recorded to say what it is, is still to be decided: blank only ever means a recorded
    // preferred direction (spec critique).
    const raw = selectionState(i, !!words);
    const state = raw === "preferred" && !words ? "undecided" : raw;
    const technical = i.technicalStatus === "needs_verification" ? "to_verify" : i.technicalStatus === "verified" && clean(i.technicalEvidence?.ref) ? "verified" : "";
    const sourceFlag = i.sourceDocId && !doc ? "missing" : review === "superseded" ? "superseded" : ["received", "under_review"].includes(review) ? "unreviewed" : "";
    const qty = Number(i.quantity);
    return {
      id: i.id, ref: refCode(i), category: i.category, coord: coordOf(i), promptId: q?.id || null,
      // A supplier's document decides the trade (a laundry trough on Routleys' selection is a plumbing fixture, QA R07);
      // otherwise the category; a hand-added record goes with the discipline of the document it cites (S11).
      group: (doc?.type === "supplier_document" && DISCIPLINE_GROUP[clean(doc.discipline)]) || (TRADE_OF.has(i.category) ? tradeGroupFor(i.category) : DISCIPLINE_GROUP[disciplineOf(i)] || "Other selections"),
      item: custom ? (legacy ? clean(String(i.description || "").split(" — ")[0]) : clientWords(i.description)) || categoryLabel(i.category) : clean(itemShort(i).replace(/\s*—\s*who\?$/i, "")),
      roomId: room?.id || null, location, sheet: clean(room?.sheet), level: clean(room?.level),
      house: !room && !areas.length && !!i.isDefault && !zone, zone: !room && !areas.length && i.isDefault ? zone : "", zoneKey: clean(i.answer?.zone?.key), elementKey: clean(i.answer?.element?.key), replaces: defWords ? `${defWords.charAt(0).toLowerCase()}${defWords.slice(1)}` : "",
      product: words, named: !!product, description: custom ? "" : clientWords(i.description),
      // The client's own words beside a product put to them, when they differ: the selected-vs-proposed pair (spec §4).
      direction: product && typed && !i.sync?.boardCreated && typed.toLowerCase() !== product.toLowerCase() ? typed : "",
      // A preference shows the client's words, never a product someone else wrote on it (spec critique).
      preferenceWords: typed || "",
      manufacturer: clean(i.manufacturer), model: clean(i.model), supplier: clean(i.supplier),
      // Staff-reviewed client wording (owner decision 8): the presentation's label and words; the schedule keeps the
      // supplier's own line.
      clientLabel: clean(i.clientLabel), clientDescription: clean(i.clientDescription),
      finish: clean(i.colour),
      // Never a zero (Tab 22:25): 0 or blank is not recorded.
      quantity: Number.isFinite(qty) && qty > 0 ? clean(`${i.quantity} ${i.unit || ""}`) : "", zeroQuantity: i.quantity !== null && i.quantity !== undefined && i.quantity !== "" && Number(i.quantity) === 0,
      supplyBy: i.supplyBy ? supplyLabel(i.supplyBy) : "",
      state, selection: STATE_WORDS[state], technical, technicalRef: technical === "verified" ? clean(i.technicalEvidence.ref) : "",
      boardOnlyApproval: i.certainty === "client_approved" && approvalIsEvidenced(i) && !!i.sync?.approvedOnBoard,
      // Known: the client's evidenced choice (or kept as it is), said in words, with no technical check open and a
      // reviewed source. Unresolved: nothing to say what it is, or still to be decided. Everything else is provisional.
      knowledge: !words && state !== "existing" ? "unresolved" : ["undecided", "not_discussed", "change_requested"].includes(state) ? "unresolved"
        : ["approved", "existing"].includes(state) && technical !== "to_verify" && !sourceFlag ? "known" : "provisional",
      responsibility: i.responsibility || null, next: !i.resolved ? clean(i.nextAction) : "",
      clientVisible: i.sync?.clientVisible !== false,
      source: doc ? sourceDocLabel(doc) : clean(i.source),
      sourceDocId: doc ? doc.id : null, sourceDocNumber: clean(doc?.docNumber),
      sourceFlag,
    };
  });
}
const SOURCE_FLAG_WORDS = { superseded: "Source superseded", unreviewed: "Source not yet reviewed", missing: "Source not on file" };

/** Records whose printed content matches, except the room, are said once with every room (editorial rule). */
function mergeByRoom(rows, sig) {
  const out = [], seen = new Map();
  for (const r of rows) {
    if (!r.roomId) { out.push({ ...r, rooms: [], refs: [r.ref] }); continue; }
    const k = sig(r);
    // Two identical records in one room are two items (a supplier listing a product twice), never one merged row.
    if (seen.has(k) && !seen.get(k).roomIds.includes(r.roomId)) { const g = seen.get(k); g.rooms.push(r.location); g.refs.push(r.ref); g.roomIds.push(r.roomId); continue; }
    const g = { ...r, rooms: [r.location], refs: [r.ref], roomIds: [r.roomId] };
    seen.set(k, g); out.push(g);
  }
  return out;
}
const roomList = (names) => andList(names.map((n, k) => (k ? n.charAt(0).toLowerCase() + n.slice(1) : n)));
const byIdOf = (register, id) => register.items.find((i) => i.id === id);
function selectionAction(x, records, opts = {}) {
  const cites = !!x.sourceDocId && records.some((r) => r.sourceDocId === x.sourceDocId);
  if (opts.coord) return questionById(resolvePromptId(x.promptKey))?.coord === opts.coord || (opts.coord === "routleys" && /routleys/i.test(`${x.supplier || ""}`)) || (opts.coord === "tli" && /\btli\b/i.test(`${x.supplier || ""}`)) || cites;
  return TRADE_OF.has(x.category) || CHOICE_QUESTIONS.has(resolvePromptId(x.promptKey)) || cites;
}
const REVIEW_WORDS = { received: "Received, not yet reviewed", under_review: "Under review", reconciled: "Reconciled", superseded: "Superseded" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || "")); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : clean(d); };
const KNOWLEDGE = ["known", "provisional", "unresolved"];

/** Technical Selections Schedule (BLB-TSS). For the design team, estimator, suppliers and trades (spec §3). */
function technicalScheduleFixture(input, opts = {}) {
  const { context, register } = input;
  const fx = baseFixture(input);
  const records = selectionRecords(register, context, opts);
  const coordLabel = opts.coord ? COORD_DISCIPLINES[opts.coord] || opts.coord : "";
  // A counted product never merges across rooms: one quantity can't speak for two (QA R01).
  const sig = (r) => [r.group, r.item, r.product, r.direction, r.manufacturer, r.model, r.supplier, r.supplyBy, r.finish, r.quantity, r.selection, r.technical, r.sourceDocId || r.source, r.sourceFlag, r.replaces, r.quantity ? r.roomId : ""].join("|");
  const merged = mergeByRoom(records, sig);
  const ordered = TRADE_ORDER.map((g) => ({ group: g, rows: merged.filter((r) => r.group === g) })).filter((g) => g.rows.length);
  // 04 · Source documents, keyed once (S1, S2 …) in the order rows print: a row prints the key, not the document again.
  const docOf = new Map((context.drawings || []).filter((d) => d?.id).map((d) => [d.id, d]));
  const keyOf = new Map();
  for (const g of ordered) for (const r of g.rows) if (r.sourceDocId && !keyOf.has(r.sourceDocId)) keyOf.set(r.sourceDocId, `S${keyOf.size + 1}`);
  const sources = [...keyOf.keys()].map((id) => { const d = docOf.get(id); return { key: keyOf.get(id), document: sourceDocLabel(d),
    revision: [clean(d.revision) || "No revision printed", d.receivedAt ? `received ${longDate(d.receivedAt)}` : ""].filter(Boolean).join(", "),
    review: REVIEW_WORDS[reviewOf(d)] || "On file" }; });
  // A supplier's code says whose it is ("Routleys code 62397"); supply is said only where it isn't Blue Leaf (the
  // reading note says so once; QA R03).
  // A code ("62397", "DL.2") says whose it is; a reference in words ("quote item 2") reads as it is.
  const owned = (r) => (/^[a-z]+\s/i.test(r.model) ? `${r.supplier} ${r.model}` : `${r.supplier} code ${r.model}`);
  const detailOf = (r) => [r.manufacturer, r.supplier && r.model ? owned(r) : r.supplier || (r.model ? `Code ${r.model}` : ""),
    r.supplyBy && r.supplyBy !== supplyLabel("blue_leaf") ? `Supply: ${r.supplyBy}` : ""].filter(Boolean).join(" · ");
  const groups = ordered.map((g) => ({ group: g.group, rows: g.rows.map((r) => ({
      ref: r.refs.join(", "), item: r.item,
      // A house-wide row's location is blank: "throughout the house" is said once, in the reading note.
      location: r.house ? "" : r.rooms.length > 1 ? roomList(r.rooms) : r.location, replaces: r.replaces,
      product: r.product, direction: r.direction, detail: detailOf(r),
      finish: r.finish, quantity: r.quantity, selection: r.selection,
      technical: r.technical === "to_verify" ? "To verify" : r.technical === "verified" ? "Verified" : "",
      source: r.sourceDocId ? keyOf.get(r.sourceDocId) : r.source, sourceFlag: SOURCE_FLAG_WORDS[r.sourceFlag] || "",
    })) }));
  // 02 · Requirements these selections must meet: requirement records in the schedule's trades (or tagged for the pack's party).
  const verified = (i) => i.technicalStatus === "verified" && clean(i.technicalEvidence?.ref);
  const reqItems = orderItems(register, register.items.filter((i) => i.itemKind === "requirement" && said(i)
    && (opts.coord ? questionById(resolvePromptId(i.promptKey))?.coord === opts.coord : TRADE_OF.has(i.category))
    && answerConfigFor(resolvePromptId(i.promptKey))?.tier !== "office_only"));
  const requirements = reqItems.map((i) => {
    const approved = i.certainty === "client_approved" && approvedWithEvidence(i);
    const tech = i.technicalStatus === "needs_verification" ? "To verify" : verified(i) ? "Verified" : reviewOnly(i) ? "For consultant review" : "";
    return { ref: refCode(i), text: sentence(`${plainShort(i)}: ${said(i)}`).replace(/\.$/, ""), applies: tradeGroupFor(i.category),
      status: [approved ? "Client-approved" : "", tech].filter(Boolean).join(", "), who: i.technicalStatus === "needs_verification" ? adbWho(context, i) : "" };
  });
  // 03 · Open actions and checks: every open next action on a schedule record, and the open actions recorded against
  // the schedule's trades (in a pack, that party's). Linked by reference; nothing repeats a product. Source problems
  // are the preview's pre-issue checks, never instructions printed for outside readers (spec critique).
  const actions = records.filter((r) => r.next).map((r) => { const i = byIdOf(register, r.id); return { ref: r.ref, text: r.next, who: adbWho(context, i), by: byWords(i?.actionDue), resp: r.responsibility }; });
  const recordIds = new Set(records.map((r) => r.id));
  // Every selection decision the presentation asks the client about is here too (QA K-04): the same rule.
  for (const i of orderItems(register, register.items.filter((x) => !recordIds.has(x.id) && x.itemKind === "action" && !x.resolved && clean(x.nextAction)
    && selectionAction(x, records, opts)))) actions.push({ ref: refCode(i), text: clean(i.nextAction), who: adbWho(context, i), by: byWords(i.actionDue), resp: i.responsibility });
  // In a coordination pack, the party's own requests (owner Trade / supplier) come first, addressed to them; everything
  // else waits on the client or Blue Leaf and is listed for information only.
  const requests = opts.coord ? actions.filter((a) => a.resp === "trade").map((a) => ({ ...a, who: coordLabel })) : actions;
  const pending = opts.coord ? actions.filter((a) => a.resp !== "trade") : [];
  const tally = Object.fromEntries(KNOWLEDGE.map((k) => [k, records.filter((r) => r.knowledge === k).length]));
  fx.selections = records;
  if (context.sourcesUnchecked) fx.__sourcesUnchecked = true;
  fx.technicalSchedule = {
    coord: coordLabel, party: opts.coord ? coordLabel.replace(/\s*\(.*\)$/, "") : "", groups, requirements, actions: requests, pending, sources,
    knowledge: tally, total: records.length,
    statuses: [...new Set(records.map((r) => r.state))],
    technicalShown: [...new Set(records.map((r) => r.technical).filter(Boolean))],
    hasQuantities: records.some((r) => r.quantity), hasHouse: groups.some((g) => g.rows.some((r) => r.location === "")),
    supplyNoted: records.some((r) => r.supplyBy),
    hasDirection: records.some((r) => r.direction), hasFlags: records.some((r) => r.sourceFlag),
  };
  return fx;
}

/**
 * Client Selections Presentation (BLB-CSP). For the client: what they have chosen, what is proposed, what is still open,
 * and what Blue Leaf needs from them (spec §4). The client-safe projection: no references, codes, suppliers' document
 * numbers, owners other than the client, technical states or quantities; never a selection they haven't discussed.
 */
function clientSelectionsFixture(input) {
  const { context, register } = input;
  const fx = baseFixture(input);
  const all = selectionRecords(register, context);
  const records = all.filter((r) => r.state !== "not_discussed");
  const rooms = register.meta.rooms || [];
  const named = (r) => clean([r.manufacturer && !r.product.toLowerCase().startsWith(r.manufacturer.toLowerCase()) ? r.manufacturer : "", r.product].filter(Boolean).join(" "));
  // A preference is the client's own direction; a product shows only once it has been put to them (proposed), chosen
  // or approved. A preference that has only a product typed on it says so at issue (pre-issue warning).
  // A supplier's line printed in capitals or as a code ("CS DESIGN FIXED LIGHT…", "TLI-D700+-10.6W-WH-3K") isn't words
  // a client reads: the record's own description says what it is, and the schedule keeps the supplier's line.
  // Mostly capitals (over half the letters), or one word with no space: a supplier's line or code, not reading words.
  const codeLike = (t) => { if (!t) return false; if (!/\s/.test(t.trim())) return true; const letters = t.match(/[A-Za-z]/g) || [];
    return letters.length > 0 && (t.match(/[A-Z]/g) || []).length / letters.length > 0.5; };
  // A supplier's product is put to the client only once Blue Leaf has reconciled its document (owner, checkpoint 01
  // review): until then the client sees their own direction, marked "Being confirmed".
  const reconciled = (r) => !["unreviewed", "superseded", "missing"].includes(r.sourceFlag);
  const productWords = (r) => r.clientDescription || (r.named ? (codeLike(r.product) ? r.description : named(r)) : r.product);
  const yours = (r) => {
    if (r.state === "preferred") return r.clientDescription || r.preferenceWords || (r.named ? named(r) : "");
    if (r.state === "proposed" && r.named && !reconciled(r)) return r.preferenceWords;
    return productWords(r);
  };
  // What the client is told: a proposal they can't identify is still to be decided (a Proposed item always describes
  // a real option); one waiting on an unreconciled supplier document is being confirmed (owner, checkpoint 01 review).
  const clientState = (r) => (r.state !== "proposed" ? r.state : !reconciled(r) && r.named ? "confirming" : !yours(r) ? "undecided" : "proposed");
  const STATUS = { ...STATE_WORDS, confirming: "Being confirmed", not_discussed: "" };
  // The client's earlier words show beside a proposal only when staff have raised the difference with them (an open
  // action the client owns): a description can also be a staff label ("Ensuite window"), never shown as the client's.
  // The finish line is left out when the client's words already say it ("…, stainless steel").
  const saysFinish = (r) => !!r.finish && !!r.clientDescription && r.clientDescription.toLowerCase().includes(r.finish.toLowerCase());
  const row = (r) => { const st = clientState(r); return { item: r.clientLabel || r.item, text: yours(r), finish: st === "confirming" || saysFinish(r) ? "" : r.finish, status: STATUS[st], state: st,
    replaces: r.replaces, earlier: ["proposed", "with_blue_leaf"].includes(st) && r.next && r.responsibility === "client" ? r.direction : "", roomId: r.roomId, id: r.id }; };
  const sig = (x) => `${x.item}|${x.text}|${x.finish}|${x.status}|${x.replaces}|${x.earlier}`;
  const strip = (x) => { const { state, id, ...rest } = x; return rest; };
  // By location: throughout the house first, then each room in order; rooms with identical selections share a group.
  const house = records.filter((r) => r.house).map(row);
  const zones = [...new Set(records.filter((r) => r.zone).map((r) => r.zone))].map((z) => ({ group: z, rows: records.filter((r) => r.zone === z).map(row) }));
  const loose = records.filter((r) => !r.house && !r.zone && !r.roomId).map(row);
  const perRoom = rooms.map((rm) => ({ room: rm, rows: records.filter((r) => r.roomId === rm.id).map(row) })).filter((g) => g.rows.length);
  const holders = new Map();
  // Each room once per shared row: two identical records in one room never make "Bathroom and bathroom" (owner review).
  for (const g of perRoom) for (const x of g.rows) { const k = sig(x); if (!holders.has(k)) holders.set(k, []); const hs = holders.get(k); if (!hs.some((h) => h.id === g.room.id)) hs.push(g.room); }
  const byRooms = new Map();
  for (const g of perRoom) for (const x of g.rows) {
    const hs = holders.get(sig(x));
    if (hs[0].id !== g.room.id) continue;
    const key = hs.map((h) => h.id).join("+");
    if (!byRooms.has(key)) byRooms.set(key, { rooms: hs, rows: [] });
    byRooms.get(key).rows.push(x);
  }
  const order = new Map(rooms.map((r, k) => [r.id, k]));
  const groups = [
    ...(house.length ? [{ group: "Throughout the house", rows: house }] : []),
    ...zones,
    ...[...byRooms.values()].sort((a, b) => order.get(a.rooms[0].id) - order.get(b.rooms[0].id) || b.rooms.length - a.rooms.length)
      .map((g) => ({ group: roomList(g.rooms.map((r) => placeName(clean(r.name)))), rows: g.rows })),
    ...(loose.length ? [{ group: "Not yet placed in a room", rows: loose }] : []),
  ];
  // What we need from you: each open action the client owns on a selection (in its own words) and each selection the
  // client is to decide. A proposal awaiting their answer is marked Proposed where it prints, and the section says so
  // once, never a row per proposal (editorial rule). Never something they've already answered (with Blue Leaf, change
  // requested), and never an item not yet released to them on the portal.
  const needs = [];
  for (const r of all) {
    if (!r.clientVisible || ["with_blue_leaf", "change_requested", "approved", "existing"].includes(r.state)) continue;
    const where = r.roomId ? r.location : r.house ? "Throughout the house" : "";
    const label = r.clientLabel || r.item;
    if (r.next && r.responsibility === "client") needs.push({ item: label, where, text: sentence(r.next) });
    else if (["undecided", "not_discussed"].includes(r.state) && r.responsibility === "client") needs.push({ item: label, where, text: `Choose the ${label.toLowerCase()}.` });
  }
  // Whether any proposal awaits the client's answer: asked once, without a number (a count of records never matched the
  // merged rows, QA C04).
  const proposals = records.some((r) => clientState(r) === "proposed" && r.clientVisible && !(r.next && r.responsibility === "client"));
  const recordIds = new Set(all.map((r) => r.id));
  for (const i of orderItems(register, register.items.filter((x) => !recordIds.has(x.id) && !x.resolved && x.responsibility === "client" && clean(x.nextAction)
    && selectionAction(x, all) && answerConfigFor(resolvePromptId(x.promptKey))?.tier !== "office_only"))) {
    const room = rooms.find((r) => r.id === i.roomId);
    needs.push({ item: clientWords(i.description) || plainShort(i), where: room ? placeName(clean(room.name)) : "", text: sentence(i.nextAction) });
  }
  fx.selections = all;
  if (context.sourcesUnchecked) fx.__sourcesUnchecked = true;
  // What changed from the record's own state, for the pre-issue checks (never printed).
  const shownAs = Object.fromEntries(records.map((r) => [r.id, clientState(r)]));
  fx.clientSelections = { groups: groups.map((g) => ({ ...g, rows: g.rows.map(strip) })), needs, proposals, shownAs };
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
  if (docType === "selections_schedule") return technicalScheduleFixture(input, opts);
  if (docType === "client_presentation") return clientSelectionsFixture(input);
  if (docType === "tender_scope_notes") return tenderNotesFixture(input);
  throw new DocumentError(400, "Unknown document type.", "BAD_DOC");
}

// ── pre-issue checks (Tab 14 release blockers) ───────────────────────────────────────────────────

const MONEY_RX = /\$\s?\d/;
/** SafeWork SA: notifying work with installed ("legacy") engineered stone. */
const LEGACY_STONE_NOTICE = "https://www.safework.sa.gov.au/industry/construction/engineered-stone-prohibition/notification-of-work-with-legacy-engineered-stone";
const LEGACY_DISPOSITION = { retain: "to remain", remove: "to be removed", make_good: "to be made good", alter: "to be altered" };
const LEGACY_WHS = (url) => `controlled work, and SafeWork SA must be notified before it starts (${url}). Plan it through the job's WHS process: this document check is not WHS clearance.`;
/**
 * Every string a document prints: the template's data, built by the document's own payload builder. The stone check
 * reads this, not the records, so every way a word reaches the page counts (a scope line, an item kept, a decision, the
 * client's priority note …) and nothing has to be guessed about which fields print (review round 5).
 */
function printedStrings(docType, fx) {
  const def = DOC_DEFS[REGISTER_DOC_TYPES[docType]?.def];
  let data = fx;
  try { if (def) data = def.build(fx); } catch { data = fx; }
  const out = [];
  const walk = (n) => { if (typeof n === "string") { if (n.trim()) out.push(n); } else if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === "object") Object.values(n).forEach(walk); };
  walk(data);
  return out;
}
const STONE_HOW = "A client document never names it, whatever the wording. Write new work as only what will be supplied (for example \"New porcelain island benchtop\"). Write work on stone already installed without the material (for example \"Remove the existing kitchen benchtops\"), mark the record Retain, Remove, Make good or Alter, and put the material in its Product field, which the document doesn't print: the register keeps it and the WHS notice still applies. The original wording stays in the register's history.";
/** The fixture without the architect's brief's one budget line, which may hold the client's confirmed band (owner decision 1). */
function withoutBudgetBand(docType, fx) {
  const band = fx?.architectBrief?.budgetBand;
  if (docType !== "architect_brief" || !band || !BUDGET_BAND_RX.test(band)) return fx;
  const ab = fx.architectBrief;
  return { ...fx, architectBrief: { ...ab, budgetBand: undefined, project: (ab.project || []).map((r) => (r.key === "budget" && r.text === band ? { ...r, text: "" } : r)),
    lines: (ab.lines || []).map((l) => (l.source?.key === "budget" && l.text === band ? { ...l, text: "" } : l)) } };
}
/**
 * What a dollar figure in print comes from, so its red entry has a Fix: the first printed line of the architect's brief
 * that holds one (its record, room or fact), else the first record whose printed words hold one. [] when it can't tell.
 */
function moneyTargets(docType, fx, register) {
  const band = fx?.architectBrief?.budgetBand;
  const line = docType === "architect_brief" ? (fx.architectBrief?.lines || []).find((l) => MONEY_RX.test(`${l.label} ${l.text}`) && !(band && l.text === band)) : null;
  if (line?.ids?.length) return [{ kind: "record", id: line.ids[0] }];
  if (line?.source?.kind === "fact" && line.source.key) return [{ kind: "fact", key: line.source.key }];
  if (line?.source?.kind === "room") { const id = String(line.source.key || "").split(",").find((x) => (register.meta.rooms || []).some((r) => r.id === x)); if (id) return [{ kind: "room", id }]; }
  if (line?.source?.kind === "meta") return [{ kind: "meta", key: line.source.key }];
  const item = (register.items || []).find((i) => MONEY_RX.test([i.description, i.product, i.model, i.colour, i.supplier, i.source, i.nextAction, i.clientLabel, i.clientDescription, answerSummary(i)].join(" ")));
  return item ? [{ kind: "record", id: item.id }] : [];
}
export function registerDocChecks(docType, fx, { register, recipientName, mode }) {
  const errors = [], warnings = [], errorTargets = [];
  // Each red entry can carry what fixes it (REGISTER_SCREENS_SPEC.md S5: a Fix on every entry).
  const block = (list, msg, targets) => { list.push(msg); if (list === errors && targets?.length) errorTargets.push({ text: msg, targets }); };
  const clientFacing = REGISTER_DOC_TYPES[docType]?.audience !== "internal";
  // The release blockers the register can tell on its own: the same rules the Documents step counts and marks before a
  // preview (src/lib/registerQuality.js). Outside an issue they warn; who it's going to matters only at issue.
  for (const b of releaseBlockers(docType, register, { recipientName, drawingBasis: fx.project.drawingBasis, clientFacing })) {
    if (b.key === "recipient" && mode !== "issue") continue;
    block(mode === "issue" ? errors : warnings, b.text, b.targets);
  }
  const strings = JSON.stringify(withoutBudgetBand(docType, fx));
  if (MONEY_RX.test(strings)) block(errors, "The document would contain a dollar figure — register documents never show prices or allowances.", moneyTargets(docType, fx, register));
  // Prohibited products (CPB-02; src/lib/restrictedProducts.js). A selection that will be supplied and names one stops a
  // client-facing document, whatever the wording around it; anything else that names one (a "no engineered stone"
  // requirement, the client's note, existing or removed stone, a brand, the estimator's notes) warns. The room is
  // named, so two records with the same name can be told apart.
  const found = restrictedFindings(register.items);
  // Five review rounds showed that free text can't be read for whether stone is new or already installed, so a client
  // document that would PRINT engineered stone (or its shorthand) can't be issued, whatever the wording; staff write the
  // line without it and keep the material in the record (review rounds 1-5). Supply selections block as before.
  const shown = printedStrings(docType, fx), printedHit = (t) => !!t && shown.some((x) => x.includes(t));
  // The architect's brief prints the Sales description and record wording as typed; words addressed to the client read
  // wrongly to the design team (QA REC-12).
  // Read from the brief's own rows, not the template's standard wording (which speaks to the design team).
  if (docType === "architect_brief") { const you = (fx.architectBrief?.lines || []).map((l) => l.text).find((x) => /\b(you|your|you're|yours)\b/i.test(x || "")); if (you) warnings.push(`The Architect Design Brief would print wording addressed to the client: "${clean(you).slice(0, 90)}". Reword the Sales description or the record for the design team.`); }
  const docLabel = REGISTER_DOC_TYPES[docType]?.label || "document";
  const stop = (msg) => (mode === "issue" && clientFacing ? errors : warnings).push(msg);
  const reported = [];
  for (const { item, product, blocking, field } of found) {
    const room = roomLabel(register, item);
    const what = `"${clean(item.description || item.product) || itemShort(item)}"${room ? ` (${room})` : ""}`;
    const words = clean(said(item));
    // A supplied selection naming it is a release blocker above (releaseBlockers); an internal document only warns.
    if (blocking) { if (!clientFacing) warnings.push(restrictedGuidance(register, { item, product })); reported.push(clean(item.description || item.product)); continue; }
    // Any of the record's own fields that names it and that this document prints (its description, card answer,
    // product, supplier …; review STONE4F-02).
    const shownField = restrictedFieldsOf(item).find((h) => printedHit(clean(h.text))) || (product.level === "error" && ["description", "option"].includes(field) && printedHit(words) ? { text: words } : null);
    if (shownField) { const msg = `${what} names engineered stone in words the ${docLabel} prints. ${product.level === "error" ? product.rule : "Engineered stone is prohibited in Australia from 1 July 2024: it can't be manufactured, supplied, processed or installed."} ${STONE_HOW}`;
      stop(msg); if (mode === "issue" && clientFacing) errorTargets.push({ text: msg, targets: [{ kind: "record", id: item.id }] }); reported.push(words, clean(shownField.text)); continue; }
    // Not printed. A record kept, removed, made good or altered may be stone already installed: say what that needs,
    // without claiming it is (checkpoint 3 review, Q5): it is never WHS clearance.
    const label = LEGACY_DISPOSITION[item.disposition];
    if (label) warnings.push(`${what} names ${product.level === "error" ? "engineered stone" : "a brand that has sold engineered stone"} (${label}). New engineered stone can't be supplied or installed (prohibited in Australia from 1 July 2024): check none is. If it is stone already installed, removing, repairing, making a minor modification to, or disposing of it is ${LEGACY_WHS(LEGACY_STONE_NOTICE)}`);
    else warnings.push(`${what} mentions ${product.label.toLowerCase()}. Check it isn't being supplied or installed. ${product.rule}`);
  }
  // Anything else the document would print that names it: a decision, a priority note, a fact, an excluded item
  // (review STONE4F-03: bare "quartz" with a bench word counts here as it does on a record).
  for (const text of shown) {
    const [product] = restrictedInText(text);
    if (product && !reported.some((w) => w && text.includes(w))) { stop(`The ${docLabel} would print "${clean(text).slice(0, 90)}", which names engineered stone. ${product.rule} ${STONE_HOW}`); reported.push(text); }
  }
  // Characters Lato can't print come out blank. Ranges checked against Lato's own character set: other scripts
  // (Hebrew to Tibetan, Hangul, CJK), technical symbols, dingbats, misc symbols and arrows, emoji.
  const unprintable = [...new Set((strings.match(/[\u0590-\u0FFF\u1100-\u11FF\u2300-\u23FF\u2600-\u27BF\u2B00-\u2BFF\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]|[\uD800-\uDBFF][\uDC00-\uDFFF]/g) || []))];
  if (unprintable.length) warnings.push(`Some characters may not print in the Blue Leaf font: ${unprintable.slice(0, 8).join(" ")}. Check names and descriptions.`);
  if (docType === "selections_schedule" && !fx.selections.length) errors.push("There are no client selections to schedule yet.");
  if (docType === "client_presentation" && !(fx.clientSelections?.groups || []).length) errors.push("There are no client selections to present yet.");
  if (SELECTION_DOCS.has(docType)) selectionChecks(docType, fx, { register, errors, warnings, shown });
  if (docType === "tender_scope_notes" && !fx.tenderNotes.sections.some((sec) => sec.title !== "Drawing references")) errors.push("There is nothing in the register for the estimator yet.");
  if (docType === "client_brief" && !fx.clientBrief.scopeIn.length && !fx.clientBrief.preferences.length) warnings.push("The brief has no recorded scope or preferences yet.");
  const v = validateFixture(fx, { mode: mode === "issue" ? "issue" : "draft" });
  if (mode === "issue") errors.push(...v.errors); else warnings.push(...v.warnings);
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], errorTargets };
}

// ── Selections documents: source, approval and client-safety checks (SELECTIONS_SPEC.md §5) ──
const SELECTION_DOCS = new Set(["selections_schedule", "client_presentation"]);
function selectionChecks(docType, fx, { register, errors, warnings, shown }) {
  const recs = fx.selections || [];
  const name = (r) => `"${r.item}"${r.location && r.location !== "No room recorded" ? ` (${r.location.toLowerCase() === "throughout the house" ? "throughout the house" : r.location})` : ""}`;
  // A superseded source can't be issued in either document: the schedule would cite it and the presentation would show
  // its product (Tab 22:28, "correct supplier version"). Relink the record to the current document first.
  for (const r of recs.filter((x) => x.sourceFlag === "superseded")) errors.push(`${name(r)} cites ${r.source}, which has been superseded. Link the record to the current document, and check its product, finish and quantity against it.`);
  for (const r of recs.filter((x) => x.sourceFlag === "missing")) errors.push(`${name(r)} cites a document that is no longer on file. Link it to a document on file, or clear its source.`);
  if (fx.selections && register.items.some((i) => i.sourceDocId) && fx.__sourcesUnchecked) errors.push("The source documents the selections cite couldn't be read, so they can't be checked. Try again.");
  // Verified against a document nobody has reviewed: a supplier's quote is not technical verification (spec critique).
  for (const r of recs.filter((x) => x.technical === "verified" && x.sourceFlag === "unreviewed")) errors.push(`${name(r)} is marked verified against ${r.source}, which hasn't been reviewed. Review the document (mark it reconciled) or step the record back to "needs verification".`);
  const unreviewed = recs.filter((x) => x.sourceFlag === "unreviewed" && x.technical !== "verified");
  if (unreviewed.length) warnings.push(docType === "client_presentation"
    ? `${unreviewed.length} selection(s) come from a document still marked received or under review (${[...new Set(unreviewed.map((r) => r.source))].join(", ")}). Until it is reconciled, their products aren't put to the client: they print as Being confirmed, with the client's own direction.`
    : `${unreviewed.length} selection(s) cite a document still marked received or under review (${[...new Set(unreviewed.map((r) => r.source))].join(", ")}). They print as cited, flagged "Source not yet reviewed".`);
  // An approval held only as the portal board's status, with no who, when or how (research A, SFS-15).
  for (const r of recs.filter((x) => x.boardOnlyApproval)) errors.push(`${name(r)} is approved on the portal board with no recorded evidence of who approved it, when and how. Record the approval, or step it back; until then it prints as Proposed.`);
  // Two approved records for one element in one place: identified by question, room, zone and element (spec critique).
  const seen = new Map();
  for (const r of recs.filter((x) => x.state === "approved" && x.promptId)) {
    const k = [r.promptId, r.roomId || r.location, r.zoneKey, r.elementKey].join("|");
    if (!seen.has(k)) seen.set(k, []);
    seen.get(k).push(r);
  }
  // Records with their own product codes are separate products (one record per product, spec §6); two approved records
  // with no code, or the same code, for one element are more likely one choice recorded twice.
  for (const list of seen.values()) if (list.length > 1 && new Set(list.map((r) => r.product.toLowerCase())).size > 1
    && (list.every((r) => !r.model) || new Set(list.map((r) => r.model)).size < list.length)) warnings.push(`${list.length} client-approved records for ${name(list[0])} name different products (${list.map((r) => `"${r.product}"`).join(", ")}). Check they are separate items, not one changed choice.`);
  for (const r of recs.filter((x) => x.zeroQuantity)) warnings.push(`${name(r)} has a quantity of 0. A quantity that isn't known is left blank; it prints blank.`);
  if (docType === "client_presentation") {
    const shownAs = fx.clientSelections?.shownAs || {};
    const notReady = recs.filter((x) => x.state === "proposed" && shownAs[x.id] === "undecided");
    if (notReady.length) warnings.push(`${notReady.length} proposal(s) have nothing a client can read (${notReady.map(name).join(", ")}). They print as To be decided: record a client description, or the client's own words.`);
    // Two rows in one location under one name can't be told apart (owner review: "Sink & mixer" twice).
    for (const g of fx.clientSelections?.groups || []) {
      const seen = new Map();
      for (const x of g.rows) seen.set(x.item, (seen.get(x.item) || 0) + 1);
      for (const [label, n] of seen) if (n > 1) warnings.push(`${n} rows in ${g.group} print as "${label}". Give each a client label (for example "Kitchen sink", "Kitchen mixer").`);
    }
    // A preference shows the client's words; one with only a product typed on it shows the product as theirs.
    for (const r of recs.filter((x) => x.state === "preferred" && !x.preferenceWords && x.named)) warnings.push(`${name(r)} is a preference with only a product recorded ("${r.product}"). The presentation shows it as the client's preferred direction: record the client's own words, or mark it Proposed if it was put to them.`);
    // The client never sees a register reference, a product code or a supplier's document number.
    const codes = [...new Set(recs.flatMap((r) => [r.ref, r.model, r.sourceDocNumber].filter((c) => c && c.length >= 3)))];
    const leaked = codes.filter((c) => shown.some((t) => t.includes(c)));
    if (leaked.length) errors.push(`The presentation would print a reference, code or document number the client shouldn't see (${leaked.slice(0, 5).join(", ")}). Reword the record's description or next action without it.`);
  }
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

/** The filled DOCX for a document, without the PDF step (the wording check reads and marks it: documentProofread.mjs). */
export function fillRegisterDocx(docType, fx, { layout } = {}) {
  const defKey = REGISTER_DOC_TYPES[asDocType(docType, layout)].def;
  const t = templateFor(defKey);
  return renderDocxTemplate(t.bytes, t.def.build(fx));
}

export async function renderRegisterDocument(docType, fx, { layout } = {}) {
  const spec = REGISTER_DOC_TYPES[asDocType(docType, layout)];
  const defKey = spec.def;
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

export async function loadInputs(sb, leadId, actor) {
  const { data: lead } = await sb.from("leads").select("id, name, stage, job_id, project_type").eq("id", leadId).maybeSingle();
  if (!lead) throw new DocumentError(404, "Lead not found", "NOT_FOUND");
  const loaded = await loadRegister(sb, leadId, { actor });
  const context = await loadRegisterContext(sb, leadId);
  await resolveCitedDocuments(sb, leadId, loaded.register, context);
  return { lead, loaded, register: loaded.register, context };
}

/**
 * The documents register records cite (sourceDocId), read by id: the context lists only the 30 most recent, so an older
 * (likely superseded) source would otherwise read as missing, and its flag would never fire. If they can't be read, the
 * selections documents say so at issue (sourcesUnchecked) rather than passing silently.
 */
async function resolveCitedDocuments(sb, leadId, register, context) {
  const have = new Set((context.drawings || []).map((d) => d.id));
  const want = [...new Set((register.items || []).map((i) => i.sourceDocId).filter((id) => id && !have.has(id)))];
  if (!want.length) return;
  try {
    const { data, error } = await sb.from("lead_documents").select("id, filename, document_type, created_at, revision_label, discipline, issuer, doc_number, received_at, review_status")
      .eq("lead_id", leadId).in("id", want);
    if (error) throw error;
    context.drawings = [...(context.drawings || []), ...(data || []).map((d) => ({ id: d.id, filename: d.filename, type: d.document_type, at: d.created_at, revision: d.revision_label || null,
      discipline: d.discipline || null, issuer: d.issuer || null, docNumber: d.doc_number || null, receivedAt: d.received_at || null, reviewStatus: d.review_status || null, cited: true }))];
  } catch { context.sourcesUnchecked = true; }
}

/** The next revision number, and the issued revision it will replace (printed on the new one: final inspection R02-01). */
async function issueHistory(sb, leadId, docType) {
  // The date the earlier revision PRINTED is in its stored snapshot; issued_at is a moment later, and revisions issued
  // before the Adelaide-day fix printed the UTC day (verification CODE-01). issued_at only when there is no snapshot.
  const { data, error } = await sb.from("lead_documents").select("version, revision_label, issued_at, printed_date:source_snapshot->fixture->meta->>issuedDate").eq("lead_id", leadId).eq("document_type", docType)
    .not("issued_at", "is", null).order("version", { ascending: false }).limit(1);
  if (error) {
    if (error.code === "42703") throw new DocumentError(503, "Apply migration 213 first (document issue registry).", "SCHEMA");
    throw new DocumentError(400, "Could not read the issue history.", "HISTORY");
  }
  const last = data?.[0];
  const supersedes = last ? { label: last.revision_label || issueRevisionLabel(last.version), issuedDate: /^\d{4}-\d{2}-\d{2}$/.test(last.printed_date || "") ? last.printed_date : last.issued_at ? isoDate(last.issued_at) : undefined } : null;
  return { revision: (last?.version || 0) + 1, supersedes };
}

/** The next revision number alone (the wording check prints it on its draft: documentProofread.mjs). */
export async function nextVersion(sb, leadId, docType) { return (await issueHistory(sb, leadId, docType)).revision; }

// A stable fingerprint of the register content a document is rendered from: item id → version (updatedAt as
// the fallback for an unversioned row). Round-tripped from preview to issue so that if the brief changed
// between the two, the issue is refused and no stale controlled document is recorded (Tab 27 R04 review §1).
// The rooms (name, floor, Work, sheet), the drawing basis and occupancy, and the Sales facts a brief prints are part of it
// too (REGISTER_SCREENS_SPEC.md S5): a change to any of them after the preview must not issue unseen. Not meta.rev, which
// moves on every room navigation.
const digest = (v) => createHash("sha256").update(JSON.stringify(v ?? null)).digest("hex").slice(0, 16);
export function registerItemVersions(register, context = null) {
  const v = Object.fromEntries((register?.items || []).map((i) => [i.id, i.sync?.version ?? i.updatedAt ?? null]));
  const m = register?.meta || {};
  // Room type and confirmed house defaults change the printed row too (a must-have naming only its room; a house line).
  v.__rooms = digest([(m.rooms || []).map((r) => [r.id, r.name, r.level, r.scope, r.sheet, r.order, r.roomType || "", stableStringify(r.defaultConfirmations || {})]), m.planRev || "", m.occupancy || ""]);
  if (context) {
    const g = context.goals || {}, b = context.budget || {};
    v.__facts = digest([g.vision, g.keyRequirements, g.concern, b.min, b.max, b.confirmed, b.financeStatus, b.desiredStart, context.projectType, context.deliveryModel,
      (context.consultants || []).map((c) => [c.role, c.name, c.company, c.status]), context.site || null, context.identity || null]);
  }
  return v;
}
export function versionsDiffer(expected, current) {
  if (!expected || typeof expected !== "object") return false;        // no expectation sent → guard is inert
  const ek = Object.keys(expected), ck = Object.keys(current);
  if (ek.length !== ck.length) return true;
  for (const k of ek) if (String(expected[k]) !== String(current[k])) return true;   // changed or vanished item
  for (const k of ck) if (!(k in expected)) return true;                             // a new item appeared
  return false;
}

// ── public API ───────────────────────────────────────────────────────────────────────────────────

/** Render a DRAFT (not stored). Returns the PDF, the pre-issue check result, and the content fingerprint. */
/** The old "client layout" of the selections document is now the Client Selections Presentation (spec S1). */
const asDocType = (docType, layout) => (docType === "selections_schedule" && layout === "client" ? "client_presentation" : docType);

export async function previewDocument(sb, leadId, requestedType, { layout, recipientName, actor } = {}) {
  const docType = asDocType(requestedType, layout);
  if (!DOC_TYPE_KEYS.has(docType)) throw new DocumentError(400, "Unknown document type.", "BAD_DOC");
  const { lead, register, context } = await loadInputs(sb, leadId, actor);
  let revision = 1, supersedes = null;
  try { ({ revision, supersedes } = await issueHistory(sb, leadId, docType)); } catch { /* preview works pre-213 */ }
  const input = { lead, context, register, revision, supersedes, issuedDate: isoDate(), issuer: actor?.name, recipientName };
  const fx = buildRegisterFixture(docType, { ...input, status: "Draft" });
  // Show exactly what WOULD block an issue (checked on the issued form of the same document).
  const checks = registerDocChecks(docType, buildRegisterFixture(docType, { ...input, status: "Issued" }), { register, recipientName, mode: "issue" });
  const out = await renderRegisterDocument(docType, fx, { layout });
  if (out.leaks.length) checks.errors.push(`Rendering problem: ${out.leaks.join(", ")}.`);
  checks.warnings.push(...(out.fontWarnings || []));
  // What will print, line by line with record ids (click-a-line), and the content checks (never block an issue).
  checks.content = contentChecks(docType, register, context, fx.architectBrief?.model ? fx.architectBrief : null);
  return { pdf: out.pdf, checks, revision, itemVersions: registerItemVersions(register, context), lines: fx.architectBrief?.lines || null, notPrinted: fx.architectBrief?.notPrinted || null };
}

/**
 * Issue an immutable revision. Blocks on any pre-issue error (nothing stored). Retries once if someone
 * else issued the same document at the same moment (the PDF carries its revision number).
 */
export async function issueDocument(sb, leadId, requestedType, { recipientName, recipientEmail, layout, actor, expectedVersions } = {}) {
  const docType = asDocType(requestedType, layout);
  if (!DOC_TYPE_KEYS.has(docType)) throw new DocumentError(400, "Unknown document type.", "BAD_DOC");
  for (let attempt = 0; attempt < 2; attempt++) {
    const { lead, loaded, register, context } = await loadInputs(sb, leadId, actor);
    // R04 review §1: refuse to issue a controlled document from data that changed since it was previewed.
    // `expectedVersions` is the fingerprint the preview returned (round-tripped by the client). If the
    // register moved on — a concurrent edit, or the client's own edits never persisted — nothing is issued.
    if (versionsDiffer(expectedVersions, registerItemVersions(register, context))) {
      throw new DocumentError(409, "The brief changed since you previewed it — nothing was issued. Re-open the preview to see the current version, then issue again.", "ISSUE_STALE");
    }
    const { revision, supersedes } = await issueHistory(sb, leadId, docType);
    const issuedDate = isoDate();
    const fx = buildRegisterFixture(docType, { lead, context, register, revision, supersedes, status: "Issued", issuedDate, issuer: actor?.name, recipientName });
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
    const versions = registerItemVersions(register, context);
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
      if (/is not a register document type/.test(error.message || "") || error.code === "23514") throw new DocumentError(503, docType === "client_presentation"
        ? "Apply migration 220 first (the Client Selections Presentation as its own document). Nothing was issued."
        : "Apply migration 218 first (Tender Scope & Pricing Notes). Nothing was issued.", "SCHEMA");
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
  const input = { lead, context, register, revision: 1, issuedDate: isoDate(), issuer: actor?.name };
  const fx = buildRegisterFixture("selections_schedule", { ...input, status: "Draft" }, { coord: discipline });
  if (!fx.selections.length && !fx.technicalSchedule.requirements.length && !fx.technicalSchedule.actions.length) throw new DocumentError(422, `No register items are tagged for ${COORD_DISCIPLINES[discipline]} yet.`, "EMPTY");
  // A pack goes outside Blue Leaf: what would block an issue blocks the pack (superseded source, a price, engineered stone).
  const checks = registerDocChecks("selections_schedule", buildRegisterFixture("selections_schedule", { ...input, status: "Issued" }, { coord: discipline }), { register, recipientName: COORD_DISCIPLINES[discipline], mode: "issue" });
  const blocking = checks.errors.filter((e) => !/no client selections to schedule/.test(e));
  if (blocking.length) throw new DocumentError(422, "This coordination request can't be produced yet.", "PREFLIGHT", { checks: { errors: blocking, warnings: checks.warnings } });
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
