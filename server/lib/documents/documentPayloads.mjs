// documentPayloads.mjs — Document Engine (R03 design, matching the approved Blue Leaf mock-ups).
//
// PURE mapping layer: a typed project FIXTURE → a docxtemplater merge PAYLOAD for each first-release
// document (Client Project Brief, Architect Design Brief, Technical Selection Register), filled by the
// EXISTING renderer (docTemplates.renderDocxTemplate) against public/templates/. No DB, no invented
// columns, no migrations — a typed fixture only. Doc-type constants (breadcrumb, section label, title,
// tagline, callout, footer) are generated here; only project CONTENT comes from the fixture.

import { documentIdentity, fmtAuDate as fmtIdDate } from "./documentIdentity.mjs";

export const SELECTION_STATUSES = [
  "Client-approved", "Confirmed", "Proposed", "Preferred", "Preliminary", "TBC",
  "N/A", "Excluded", "By Others", "Existing to Remain", "Undecided", "Hold", "Design", "Retain", "Deferred",
];
/** Architect design-register status vocabulary (Tab 17 #9): intent vs technical verification. */
export const ARCHITECT_ITEM_STATUSES = ["Client-approved", "Proposed", "To verify"];

const GROUP_ORDER = ["External", "Internal Finishes", "Joinery", "Wet Areas", "Services & Fixtures", "External Works"];
const paras = (arr) => (arr || []).map((t) => ({ PARA_TEXT: String(t || "") }));
const items = (arr) => (arr || []).map((t) => ({ ITEM_TEXT: String(t || "") }));

/** Chunk [label,value] pairs into metadata rows of two pairs each. */
function metaRows(pairs) {
  const rows = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const a = pairs[i], b = pairs[i + 1] || ["", ""];
    rows.push({ LA: a[0], VA: String(a[1] || "—"), LB: b[0], VB: String(b[1] || (b[0] ? "—" : "")) });
  }
  return rows;
}

// Every document prints one identity: BLB-[TYPE]-[PROJECT REF]-[REVISION] (documentIdentity.mjs). A draft carries
// no revision — it isn't one yet — and says "Draft — not issued"; an issued copy prints its revision and date.
function chrome(fx, { type, breadcrumb, sectionLabel, title, tagline }) {
  const meta = fx.meta;
  const id = documentIdentity({ type, projectRef: meta.ref, status: meta.status, revision: meta.revision, revisionLabel: meta.revisionLabel, issuedDate: meta.issuedDate });
  return {
    BREADCRUMB: breadcrumb, SECTION_LABEL: sectionLabel, DOC_TITLE: title, TAGLINE: tagline,
    FOOTER_MID: `${id.number}  ·  ${id.issued ? id.statusText.toUpperCase() : "DRAFT — NOT ISSUED"}`,
    _docNumber: id.number, _statusValue: id.issued ? `${id.revision}  /  ${id.statusText}` : "DRAFT  /  NOT ISSUED", _id: id,
  };
}

/**
 * The preference status key, in print order. A Requirement is a recorded need, not a verified outcome (CPB3-06).
 * Whether "Client-approved" reads "Client-confirmed" to a client is an owner decision (checkpoint 3 review, Q3).
 */
const STATUS_KEY = [
  ["Preferred", "the look you like."],
  ["Proposed", "a specific option we're reviewing with you."],
  ["Client-approved", "you've confirmed it with us."],
  ["Requirement", "a need you've told us about. We'll assess whether and how it can be met; it isn't a confirmed outcome."],
  ["For consultant review", "checked before it's relied on."],
  ["Existing to Remain", "stays as it is."],
  ["TBC", "still to be confirmed."],
];
/** What happens to the proposed scope next, by the brief's pathway. */
const SCOPE_NEXT = {
  design_build: "It will be refined as the design develops.",
  build_only: "We'll confirm it with you before pricing.",
  plans_supplied: "We'll confirm it against your plans and the consultant documents before pricing.",
  architect_tender: "We'll confirm it against your architect's documents before pricing.",
};
/** 01 — Client Project Brief (BLB-CPB, template cpb-2.4). Reader: the homeowner, after the concept presentation. */
const two = (n) => String(n).padStart(2, "0");
/**
 * Bounded table rows (independent review CPB-04/08), for a template dataTable({ bounded: true }):
 *   up to three rows → the whole table stays together;
 *   four or more     → the header keeps its first two rows, the last two rows stay together, and the table may break
 *                      between any other rows (its header repeats on the next page). Never a single row alone.
 */
export function boundedRows(key, rows) {
  const n = rows.length;
  if (n <= 3) return { [`${key}_KEEP`]: rows.slice(0, Math.max(0, n - 1)), [key]: [], [`${key}_PEN`]: [], [`${key}_LAST`]: rows.slice(Math.max(0, n - 1)) };
  return { [`${key}_KEEP`]: rows.slice(0, 1), [key]: rows.slice(1, n - 2), [`${key}_PEN`]: rows.slice(n - 2, n - 1), [`${key}_LAST`]: rows.slice(n - 1) };
}
export function buildClientBriefPayload(fx) {
  const b = fx.clientBrief || {}, p = fx.project || {}, meta = fx.meta || {};
  const id = documentIdentity({ type: "client_brief", projectRef: meta.ref, status: meta.status, revision: meta.revision, revisionLabel: meta.revisionLabel, issuedDate: meta.issuedDate });
  const overview = (b.overview || []).filter(Boolean);
  const priorities = (b.priorities || []).filter(Boolean).slice(0, 3);
  const scopeIn = (b.scopeIn || []).filter((x) => x && x.text);
  const boundaries = (b.boundaries || []).map((g) => ({ ...g, items: (g.items || []).filter((x) => x && x.text) })).filter((g) => g.items.length);
  // Preferences grouped by category (CPB-07). Every row names its place: WHERE where a place's run starts, WHERE_AGAIN
  // (printed quietly) after that, so a row at the top of a continued page is never without it (CPB3-04).
  const prefGroups = (b.preferences || []).map((g) => {
    const items = (g.items || []).filter((x) => x && x.text);
    const rows = items.map((x, i) => { const first = i === 0 || items[i - 1].where !== x.where; return { WHERE: first ? (x.where || "") : "", WHERE_AGAIN: first ? "" : (x.where || ""), TEXT: x.text, STATUS: x.status || "" }; });
    // Bounded per group: the header row stays with its first two rows and the last two rows stay together.
    return { GROUP: g.group, ...boundedRows("ROWS", rows) };
  }).filter((g) => g.ROWS_LAST.length).map((g, k, all) => ({ G_LAST: k === all.length - 1, ...g }));   // the status key closes the last group
  // The key explains every status printed, and only those (CPB3-06), in this order.
  const printed = new Set((b.preferences || []).flatMap((g) => (g.items || []).filter((x) => x && x.text).map((x) => x.status)));
  // A status name never breaks across a line ("For / consultant review"): non-breaking spaces inside it (verification CLOSE-02).
  const prefKey = STATUS_KEY.filter(([s]) => printed.has(s)).map(([s, t]) => `${s.replace(/ /g, "\u00A0")}: ${t}`).join("  ");
  const drawing = String(p.drawingBasis || "").trim();
  // Only design and build develops the design from here; every other pathway confirms what is drawn (review CPB3-H01).
  const developing = !b.pathway || b.pathway === "design_build";
  const assumes = [
    // The recorded drawing basis is a title as typed ("Measured sketch, 6 November 2026"), so it is never set into the
    // grammar of a sentence (final inspection POWDER-01, CONSISTENCY-07).
    drawing ? `This brief is based on the drawing basis recorded on page 1 (${drawing}). Dimensions and details are still to be ${developing ? "developed" : "confirmed"}.` : "This brief is based on our conversations so far. The drawings will become its basis once they are prepared.",
    // CPB2-07: disciplines named only where the project evidently needs them (registerDocuments: technicalChecks).
    b.technicalChecks === "general" ? "Any required technical checks and approvals will be confirmed before construction."
      : "The relevant consultants will need to confirm any structural, energy, drainage and approval requirements.",
    "Final selections, quantities, timeframe and the construction price are not set by this document.",
  ];
  const noted = [...(b.noted || []).filter((g) => (g.items || []).length), { label: "This brief assumes", items: assumes }];
  const decisions = (b.decisions || []).filter((d) => d && d.action);
  const steps = (b.nextSteps?.steps || []).filter((x) => x && x.label);
  const ptsa = b.nextSteps?.ptsa || null;

  // Sections are numbered in reading order, counting only the ones that print.
  const present = {
    s1: !!(overview.length || priorities.length || b.direction),
    s2: !!(scopeIn.length || boundaries.length),
    s3: prefGroups.length > 0,
    s4: true,
    s5: decisions.length > 0,
    s6: true,
  };
  const nums = {}; let n = 0;
  for (const k of ["s1", "s2", "s3", "s4", "s5", "s6"]) if (present[k]) nums[k] = two(++n);

  const metaPairs = [
    ["Prepared for", p.clientName], ["Site", p.siteAddress],
    ["Project", p.projectLabel || p.projectDescription], ["Drawing basis", drawing || "Not yet recorded"],
    ["Document", id.number], ["Status", id.issued ? `${id.revision} · ${id.statusText}` : id.statusText],
    ["Prepared by", p.preparedBy || "Blue Leaf Building"],
    id.issued ? ["Issued to", meta.recipient || p.clientName] : ["Prepared", fmtIdDate(meta.preparedDate)],
  ];
  const kicker = ["Preliminary", p.stageLabel].filter(Boolean).join("  /  ");
  return {
    HDR_DOC_TYPE: "Client Project Brief",
    HDR_PROJECT: p.siteShort || p.siteAddress || "",
    FTR_IDENTITY: `${id.number}   ·   ${id.statusText}`,
    DOC_KICKER: id.issued ? kicker : `Draft  /  ${kicker}`,
    DOC_TITLE: "Project brief",
    HAS_SUBTITLE: !!b.subtitle, DOC_SUBTITLE: b.subtitle || "",
    META_ROWS: metaRows(metaPairs),
    STATUS_LABEL: id.issued ? "Preliminary record" : "Draft for review — not issued",
    // CPB-03: no blanket "nothing is approved" — selections carry their own evidenced status.
    // A later revision says which issued revision it replaces (final inspection R02-01).
    STATUS_BODY: (id.issued && meta.supersedes?.label ? `This revision replaces ${meta.supersedes.label}${meta.supersedes.issuedDate ? `, issued ${fmtIdDate(meta.supersedes.issuedDate)}` : ""}. ` : "") + "This brief records the preferences and decisions discussed so far, so we can confirm them together. It is not a construction specification, a fixed-price quotation or a contract. It doesn't itself authorise purchasing, construction or changes to a contract, and each selection carries the status shown.",

    HAS_S1: present.s1, S1_NUM: nums.s1 || "",
    OVERVIEW: overview.map((t) => ({ PARA: t })),
    HAS_PRIORITIES: priorities.length > 0,
    PRI_BAND_3: priorities.length === 3, PRI_BAND_2: priorities.length === 2, PRI_INLINE: priorities.length === 1,   // CPB-10
    PN1: "01", PN2: "02", PN3: "03", PL1: priorities[0] || "", PL2: priorities[1] || "", PL3: priorities[2] || "",
    HAS_PRIORITY_NOTE: !!b.priorityNote, PRIORITY_NOTE: b.priorityNote || "",
    HAS_DIRECTION: !!b.direction, DIRECTION: b.direction || "",

    HAS_S2: present.s2, S2_NUM: nums.s2 || "",
    SCOPE_INTRO: `This is the building work we currently propose, based on ${drawing ? "the drawing basis above" : "our conversations so far"}. ${SCOPE_NEXT[b.pathway] || SCOPE_NEXT.design_build}`,
    // CPB-06: register references stay in the record, not in the client's sentences.
    // SCOPE_IN is the whole list (for checks); the template prints the bounded split SCOPE_ROWS_* under a title that
    // repeats on the next page, so continued items are never shown without it (CPB2-01).
    HAS_SCOPE_IN: scopeIn.length > 0, SCOPE_IN: scopeIn.map((x) => ({ TEXT: x.text })), ...boundedRows("SCOPE_ROWS", scopeIn.map((x) => ({ TEXT: x.text }))),
    HAS_BOUNDARIES: boundaries.length > 0,
    BOUNDARY_TITLE: b.boundaryTitle || "What stays, what's not included and what still needs checking",
    // B_ITEMS is each whole list (for checks); the template prints the bounded split B_ROWS_* under a repeating label.
    BOUNDARIES: boundaries.map((g) => { const rows = g.items.map((x) => ({ TEXT: x.text })); return { B_LABEL: g.label, HAS_B_NOTE: !!g.note, B_NOTE: g.note || "", B_ITEMS: rows, ...boundedRows("B_ROWS", rows) }; }),

    HAS_S3: present.s3, S3_NUM: nums.s3 || "",
    PREF_INTRO: "Your preferences so far describe a direction, not a final specification: products, sizes and details are confirmed as the project develops.",
    PREF_GROUPS: prefGroups,
    PREF_KEY: prefKey,

    HAS_S4: present.s4, S4_NUM: nums.s4,
    // N_ITEMS is the whole list (for checks); the template prints the bounded split N_BUL_* so a list stays with its label.
    NOTED: noted.map((g) => { const items = g.items.map((t) => ({ TEXT: t })); return { N_LABEL: g.label, N_ITEMS: items, ...boundedRows("N_BUL", items) }; }),

    HAS_S5: present.s5, S5_NUM: nums.s5 || "",
    DECISIONS_INTRO: decisions.length === 1 ? "This needs to be settled before the project can move on. We'll work through it with you." : "These need to be settled before the project can move on. We'll work through them with you.",
    ...boundedRows("DECISIONS", decisions.map((d) => ({ REF: d.ref || "", ACTION: d.action, OWNER: d.owner || "To be agreed" }))),

    S6_NUM: nums.s6,
    NEXT_PARAS: (b.nextSteps?.paras || []).map((t) => ({ PARA: t })),
    HAS_STEPS: steps.length > 0, NO_STEPS: steps.length === 0,
    ...boundedRows("STEPS", steps.map((x) => ({ SLABEL: x.label, SNOW: x.current ? "\nWhere we are now" : "", STEXT: x.text || "" }))),
    HAS_PTSA: !!ptsa, PTSA_NOTE: ptsa?.text || "",

    ABOUT_LABEL: "About this document",
    ABOUT_BODY: id.issued
      // "We", not the issuer's name mid-sentence ("Sam Morris, Blue Leaf Building prepared …": final inspection KESTREL-03);
      // the cover names who prepared it.
      ? `We prepared this brief from our discussions and the information recorded for your project. It's a record for you to keep and doesn't need a signature. If anything here doesn't match what you told us, let us know and we'll issue a revised brief.`
      : "This is a draft for review. It has not been issued, and it will carry a revision number and issue date once it is.",
  };
}

// Design-register grouping: an explicit row group (live register data) wins; fixtures fall back to ID prefixes.
const archGroup = (id, group) => group || (/^(EX|WN|ST|RF|PL)/.test(id) ? "Envelope & structure" : "Internal & services");

/** 02 — Architect Design Brief (coordination-first). */
export function buildArchitectBriefPayload(fx) {
  const a = fx.architectBrief || {}, p = fx.project;
  const c = chrome(fx, { type: "architect_brief", breadcrumb: "Architect / Consultant  /  Design Study",
    sectionLabel: "Design coordination  /  Architect", title: "Architect design brief",
    tagline: "Requirements, decisions and actions to progress the next drawing issue." });
  // design register, grouped by element
  const byGroup = new Map();
  for (const r of a.scheduleItems || []) { const g = archGroup(r.itemId || "", r.group); if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g).push(r); }
  const GROUPS = ["Envelope & structure", "Internal & services"].filter((g) => byGroup.has(g)).map((g) => ({
    GROUP_NAME: g, ITEMS: byGroup.get(g).map((r) => ({ REF_ID: r.itemId || "", LOCATION: r.location || "", DIRECTION: r.requirement || "", STATUS: r.status || "", RESPONSE: r.action || "", DWG: r.dwgRef || "" })),
  }));
  return {
    ...c,
    META_ROWS: metaRows([["Project", p.projectDescription], ["Design basis", p.drawingBasis], ["Site", p.siteAddress], ["Audience", p.architect], ["Issued status", c._statusValue], ["Prepared by", p.preparedBy || "Blue Leaf Building"]]),
    CALLOUT_LABEL: "Please read first",
    CALLOUT_BODY: "Approved client requirements are instructions about desired outcomes. Technical design solutions are not approved until the responsible designer or consultant has reviewed and documented them.",
    ACTIONS_INTRO: paras([a.actionsIntro || "The following are the decisions most likely to delay the next coordinated drawing issue. Reference IDs match the register and the design schedule below."]),
    ACTIONS: (a.actions || []).map((x) => ({ REF_ID: x.id || "", ACTION: x.action || "", OWNER: x.owner || "—", STATUS: x.status || "OPEN" })),
    CONFIRMED_REQS: (a.confirmedReqs || []).map((t, i) => ({ REF_ID: `REQ-${String(i + 1).padStart(2, "0")}`, REF_TEXT: String(t || "") })),
    PREFERENCES: paras([a.clientPrefs && a.clientPrefs.length ? `Client preferences requiring development: ${a.clientPrefs.map((s) => String(s).replace(/\.\s*$/, "")).join("; ")}. These preferences are not final product or technical approvals.` : ""]),
    GROUPS,
    ...(() => {
      // Deliberate pagination (Tab 17 #1): a short/medium brief stays one tight page; a long brief moves
      // the Design register to its own page and fills that page with the referenced-documents list, so
      // page 2 is a composed reference page — never a split table or a sliver.
      const total = (a.actions || []).length + (a.confirmedReqs || []).length + (a.scheduleItems || []).length;
      const brk = total >= 13;
      return { ARCH_BREAK: brk, HAS_REFS: (brk && (a.references || []).length) ? [{}] : [], REFERENCES: items(a.references) };
    })(),
  };
}

// ── 03 Client Selections Presentation (editorial, client-facing) ──────────────
// Built from the SAME fx.selections as the Technical register — grouped into client-friendly areas,
// shown as cards, with a plain-language status key. No fabricated colours or products.
const PRESENT_AREAS = [
  { name: "Exterior selections", groups: ["External", "External Works"] },
  { name: "Interior selections", groups: ["Internal Finishes"] },
  { name: "Joinery & kitchen", groups: ["Joinery"] },
  { name: "Bathrooms & wet areas", groups: ["Wet Areas"] },
  { name: "Services & comfort", groups: ["Services & Fixtures"] },
];
const AREA_TAGLINE = "Agreed in principle for review — supplier schedules and drawings remain the technical reference.";
const NEEDS_DECISION = new Set(["TBC", "Hold", "Design", "Undecided", "Preliminary"]);
/** The client presentation says this once per row instead of repeating "TBC" (Tab 26 R05 retest). The technical register keeps TBC. */
export const PRESENTATION_PENDING_LABEL = "Still to be decided";
const known = (v) => (v && v !== "TBC" ? v : "");

export function buildClientPresentationPayload(fx) {
  const p = fx.project, cp = fx.clientPresentation || {};
  const c = chrome(fx, { type: "client_presentation", breadcrumb: "Client Selections  /  Design Study",
    sectionLabel: "Client selections  /  Design development", title: "Materials & finishes",
    tagline: "A considered palette, with every decision traceable." });
  const byGroup = new Map();
  for (const r of fx.selections || []) { if (!byGroup.has(r.group)) byGroup.set(r.group, []); byGroup.get(r.group).push(r); }
  let n = 0;
  const AREAS = PRESENT_AREAS.map((a) => {
    const rows = a.groups.flatMap((g) => byGroup.get(g) || []);
    if (!rows.length) return null;
    n += 1;
    return {
      AREA_NUM: String(n).padStart(2, "0"), AREA_NAME: a.name, AREA_TAGLINE,
      ITEMS: rows.map((r) => {
        // No product yet: the item is the heading and the room the label, so nothing reads "TBC".
        const product = known(r.product), source = known(r.responsibility);
        const split = !product && r.item;
        return {
          REF_ID: r.itemId || "", CAT: (split ? r.where : r.category) || "", NAME: product || r.item || "",
          DESC: known(r.finish), STATUS: known(r.status) || PRESENTATION_PENDING_LABEL,
          SOURCE: source, SEP: source ? "   /   " : "",
        };
      }),
    };
  }).filter(Boolean);
  const DECISIONS = (fx.selections || []).filter((r) => NEEDS_DECISION.has(r.status)).map((r) => ({
    REF_ID: r.itemId || "", ITEM: [r.category, known(r.product)].filter(Boolean).join(" — "), OWNER: known(r.responsibility) || "—", STATUS: known(r.status) || PRESENTATION_PENDING_LABEL,
  }));
  const palette = (cp.palette || []).slice(0, 4);
  const tiles = {};
  for (let i = 0; i < 4; i++) { const t = palette[i] || {}; tiles[`TILE${i + 1}_AREA`] = t.area || ""; tiles[`TILE${i + 1}_NAME`] = t.name || ""; tiles[`TILE${i + 1}_NOTE`] = t.note || ""; }
  return {
    ...c,
    SUBLINE: [p.projectDescription, p.siteAddress].filter(Boolean).join("   /   "),
    APPROACH_PARAS: paras(cp.approachParas && cp.approachParas.length ? cp.approachParas
      : ["The intention is a warm, durable home developed from a restrained, consistent palette. These pages summarise the current selections in a format that is easy to review; supplier schedules and architectural drawings remain the technical reference."]),
    HAS_PALETTE: palette.length ? [{}] : [],
    ...tiles,
    READ_LABEL: "Reading this schedule",
    READ_BODY: "Preferred means the look is agreed in principle, not the exact product. Proposed means a specific option is being reviewed. Client-approved requires documented acceptance. Still to be decided means no choice has been made yet. Nothing in this document authorises procurement.",
    AREAS,
    HAS_DECISIONS: DECISIONS.length ? [{}] : [],
    DECISIONS,
  };
}

/** 04 — Technical Selection Register (reference-first, dense, grouped). */
export function buildSelectionsSchedulePayload(fx) {
  const p = fx.project;
  const c = chrome(fx, { type: "selections_schedule", breadcrumb: "Technical Selections  /  Design Study",
    sectionLabel: "Procurement  /  Technical reference", title: "Selection register",
    tagline: "Room and element schedule · source references · decision status" });
  const byGroup = new Map();
  for (const r of fx.selections || []) { if (!byGroup.has(r.group)) byGroup.set(r.group, []); byGroup.get(r.group).push(r); }
  const GROUPS = [...byGroup.keys()]
    .sort((x, y) => (GROUP_ORDER.indexOf(x) < 0 ? 99 : GROUP_ORDER.indexOf(x)) - (GROUP_ORDER.indexOf(y) < 0 ? 99 : GROUP_ORDER.indexOf(y)))
    .map((g) => ({ GROUP_NAME: g, ITEMS: byGroup.get(g).map((r) => ({ REF_ID: r.itemId || "", ROOM: r.category || "", SELECTION: r.product || "", FINISH: r.finish || "", QTY: r.qty || "—", STATUS: r.status || "TBC", SOURCE: r.responsibility || "" })) }));
  return {
    ...c,
    META_ROWS: metaRows([["Project", p.projectDescription], ["Site", p.siteAddress], ["Basis", p.drawingBasis], ["Issue", c._statusValue]]),
    GROUPS,
    FOOTER_NOTE: "'Preferred' and 'proposed' items are not purchase instructions. Quantities marked — are preliminary. Original supplier documentation remains the technical source; updates require Blue Leaf review.",
  };
}

// ── 04 Tender Scope & Pricing Notes (INTERNAL) ───────────────────────────────
// One master copy for the Buildxact estimator. Never a client or supplier document, and it carries no amounts or quantities.
export function buildTenderNotesPayload(fx) {
  const t = fx.tenderNotes || {}, p = fx.project;
  const c = chrome(fx, { type: "tender_scope_notes", breadcrumb: "Internal  /  Tender",
    sectionLabel: "Internal  /  Estimating", title: "Tender scope & pricing notes",
    tagline: "What to price, what is out, and what is still open. Buildxact holds the numbers." });
  return {
    ...c,
    META_ROWS: metaRows([["Project", p.projectDescription], ["Drawing basis", p.drawingBasis], ["Site", p.siteAddress], ["Audience", "Blue Leaf estimating only"], ["Status", c._statusValue], ["Prepared by", p.preparedBy]]),
    CALLOUT_LABEL: "Internal only",
    CALLOUT_BODY: "Not for the client, consultants or trades. Blue Leaf assumptions below are labelled pricing guides. They are not client choices, approvals or prices. Reference IDs match the project register.",
    SECTIONS: (t.sections || []).map((sec, i) => ({
      SEC_NUM: String(i + 1).padStart(2, "0"), SEC_TITLE: sec.title, SEC_INTRO: sec.intro || "",
      ROWS: sec.rows.map((r) => ({ REF_ID: r.itemId || "", AREA: r.area || "", TEXT: r.text || "", STATUS: r.status || "", NOTE: r.note || "" })),
    })),
  };
}

export const DOC_DEFS = {
  client_brief: { templateFile: "blb-client-brief-template.docx", build: buildClientBriefPayload, label: "Client Project Brief" },
  architect_brief: { templateFile: "blb-architect-brief-template.docx", build: buildArchitectBriefPayload, label: "Architect Design Brief" },
  client_presentation: { templateFile: "blb-client-presentation-template.docx", build: buildClientPresentationPayload, label: "Client Selections Presentation" },
  selections_schedule: { templateFile: "blb-selections-schedule-template.docx", build: buildSelectionsSchedulePayload, label: "Technical Selection Register" },
  tender_scope_notes: { templateFile: "blb-tender-notes-template.docx", build: buildTenderNotesPayload, label: "Tender Scope & Pricing Notes" },
};

// ── Pre-issue validation (Tab 17 blockers) ───────────────────────────────────
// REPLACE ME with no letter either side: "Full roof replacement" is real scope, "__REPLACE_ME__" is a placeholder
// (review rounds 4-5).
export const PLACEHOLDER_RX = /(\{\{|\}\}|\bTODO\b|\bTBD\b|(?<![a-z])REPLACE[_ ]?ME(?![a-z])|\bXXX+\b|lorem ipsum|placeholder)/i;
const FAKE_MONEY_RX = /\$\s?0(?:[.,]0{1,2})?(?!\d)/;
function walkStrings(node, visit, path = "") {
  if (node == null) return;
  if (typeof node === "string") { visit(node, path); return; }
  if (Array.isArray(node)) { node.forEach((v, i) => walkStrings(v, visit, `${path}[${i}]`)); return; }
  if (typeof node === "object") for (const k of Object.keys(node)) walkStrings(node[k], visit, path ? `${path}.${k}` : k);
}

export function validateFixture(fx, { mode = "issue", logoPresent = true } = {}) {
  const errors = [];
  const p = (fx && fx.project) || {}, meta = (fx && fx.meta) || {};
  if (!p.clientName || !String(p.clientName).trim()) errors.push("Missing client name.");
  if (!p.siteAddress || !String(p.siteAddress).trim()) errors.push("Missing site address.");
  if (meta.status && !["Draft", "Issued"].includes(meta.status)) errors.push(`Invalid document status "${meta.status}".`);
  const dateField = meta.status === "Issued" ? meta.issuedDate : (meta.preparedDate || meta.issuedDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateField || ""))) errors.push("Missing or malformed document date (expected YYYY-MM-DD).");
  walkStrings(fx, (s, path) => {
    if (PLACEHOLDER_RX.test(s)) errors.push(`Unresolved placeholder / TODO text at ${path}: "${s.slice(0, 48)}".`);
    if (FAKE_MONEY_RX.test(s)) errors.push(`Suspect $0 / blank money value at ${path}: "${s.slice(0, 48)}".`);
  });
  for (const r of fx?.selections || []) if (r.status && !SELECTION_STATUSES.includes(r.status)) errors.push(`Selection ${r.itemId || "?"} has unknown status "${r.status}".`);
  for (const r of fx?.architectBrief?.scheduleItems || []) if (r.status && !ARCHITECT_ITEM_STATUSES.includes(r.status)) errors.push(`Architect item ${r.itemId || "?"} status "${r.status}" is not in the coordination vocabulary.`);
  if (mode === "draft") return { ok: true, errors: [], warnings: errors };
  if (meta.status !== "Issued") errors.push('Document is not marked "Issued" (a Draft/specimen may not be issued to a client).');
  if (meta.status === "Issued" && !/^\d{4}-\d{2}-\d{2}$/.test(String(meta.issuedDate || ""))) errors.push("Issued document has no valid issued date.");
  if (!logoPresent) errors.push("Approved Blue Leaf identity is missing — cannot issue.");
  return { ok: errors.length === 0, errors, warnings: [] };
}
