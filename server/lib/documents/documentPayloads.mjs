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
export const ARCHITECT_ITEM_STATUSES = ["Client-approved", "For consultant review", "Proposed", "To verify", "Verified"];

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

/**
 * 02 — Architect Design Brief (BLB-ADB, template adb-1.0 on the CPB design system). Reader: the architect and the design
 * team. Coordination first (Master Register Tab 17:36): what we need from them, then the decisions that affect the
 * drawings, then what the design must achieve, the changes to the building, the design direction by location and the
 * documents on file. Statuses print only where they say something (owner's editorial rule, 16 Nov 2026).
 */
export function buildArchitectBriefPayload(fx) {
  const a = fx.architectBrief || {}, p = fx.project || {}, meta = fx.meta || {};
  const id = documentIdentity({ type: "architect_brief", projectRef: meta.ref, status: meta.status, revision: meta.revision, revisionLabel: meta.revisionLabel, issuedDate: meta.issuedDate });
  const overview = (a.overview || []).filter(Boolean);
  const requests = (a.requests || []).filter((x) => x && x.text);
  const decisions = (a.decisions || []).filter((x) => x && x.text);
  const reqs = (a.requirements || []).filter((x) => x && x.text);
  const scope = (a.scope || []).map((g) => ({ ...g, rows: (g.rows || []).filter((r) => r && r.text) })).filter((g) => g.rows.length);
  const direction = (a.directionGroups || []).map((g) => ({ ...g, rows: (g.rows || []).filter((r) => r && r.text) })).filter((g) => g.rows.length);
  const refs = (a.references || []).filter(Boolean);
  // The documents on file sit with the project and its design basis (Tab 11:28, section 1), not at the end.
  const present = { s1: overview.length > 0 || refs.length > 0, s2: requests.length > 0, s3: decisions.length > 0, s4: reqs.length > 0, s5: scope.length > 0, s6: direction.length > 0 };
  const nums = {}; let n = 0;
  for (const k of ["s1", "s2", "s3", "s4", "s5", "s6"]) if (present[k]) nums[k] = two(++n);
  const refsOf = (r) => (r.refs && r.refs.length ? r.refs.join(", ") : r.ref || "");
  // Grouped tables (design-system groupedTable): one repeating header row per group, rows bounded.
  const groups = (list, bandKey, rowsKey, lastKey, rowOf) => list.map((g, k) => ({ [lastKey]: k === list.length - 1, [bandKey]: g.group, ...boundedRows(rowsKey, g.rows.map(rowOf)) }));
  const reqStatuses = new Set(reqs.map((r) => r.status).filter(Boolean));
  const dirStatuses = new Set(direction.flatMap((g) => g.rows.flatMap((r) => String(r.status || "").split(", ").map((x) => x.charAt(0).toUpperCase() + x.slice(1)))).filter(Boolean));
  const anyCheck = scope.some((g) => g.rows.some((r) => r.check));
  const drawing = String(p.drawingBasis || "").trim();
  return {
    HDR_DOC_TYPE: "Architect Design Brief",
    HDR_PROJECT: p.siteShort || p.siteAddress || "",
    FTR_IDENTITY: `${id.number}   ·   ${id.statusText}`,
    DOC_KICKER: id.issued ? "Design coordination" : "Draft  /  Design coordination",
    DOC_TITLE: "Design brief",
    HAS_SUBTITLE: !!a.subtitle, DOC_SUBTITLE: a.subtitle || "",
    META_ROWS: metaRows([
      ["Prepared for", a.preparedFor || meta.recipient || "The design team"], ["Site", p.siteAddress],
      ["Client", p.clientName], ["Drawing basis", drawing || "Not yet recorded"],
      ["Project", p.projectLabel || p.projectDescription], ["Document", id.number],
      ["Prepared by", p.preparedBy || "Blue Leaf Building"], ["Status", id.issued ? `${id.revision} · ${id.statusText}` : id.statusText],
    ]),
    STATUS_LABEL: id.issued ? "Coordination brief" : "Draft for review — not issued",
    // Tab 11:30, Tab 17:20/:86: never imply approval of a technical solution or consultant sign-off.
    STATUS_BODY: (id.issued && meta.supersedes?.label ? `This revision replaces ${meta.supersedes.label}${meta.supersedes.issuedDate ? `, issued ${fmtIdDate(meta.supersedes.issuedDate)}` : ""}. ` : "")
      + "This brief sets out what we need from the design team, what the client needs the design to achieve and the design direction so far. It isn't a construction instruction, and it doesn't approve a technical solution or stand in for consultant sign-off: technical design stays with the architect and the relevant consultants.",

    HAS_S1: present.s1, S1_NUM: nums.s1 || "",
    OVERVIEW: overview.map((t) => ({ PARA: t })),
    HAS_REFS: refs.length > 0, REFS_LABEL: "Drawings and documents on file",
    ...boundedRows("REFS", refs.map((t) => ({ TEXT: t }))),

    HAS_S2: present.s2, S2_NUM: nums.s2 || "",
    // Said once, here (the brief's only response protocol): no closing box repeating it.
    REQUESTS_INTRO: "Please reply against these references, quoting the drawing number and revision. A request stays open until we've checked your revised drawings against it; nothing you send changes the client's choices until they confirm it.",
    ...boundedRows("REQUESTS", requests.map((x) => ({ REF: x.ref || "", TEXT: x.text, WHO: x.who || "To be agreed" }))),

    HAS_S3: present.s3, S3_NUM: nums.s3 || "",
    DECISIONS_INTRO: `${decisions.length === 1 ? "This is" : "These are"} being settled with the client or by Blue Leaf. We'll confirm each outcome in writing before you rely on it.`,
    ...boundedRows("DECISIONS", decisions.map((x) => ({ REF: x.ref || "", TEXT: x.text, WHO: x.who || "To be agreed" }))),

    HAS_S4: present.s4, S4_NUM: nums.s4 || "",
    // The statuses printed are explained here, once, and only those (as the client brief's key, CPB3-06).
    REQS_INTRO: ["What the client needs the design to achieve.",
      reqs.some((r) => !r.status) ? "Unmarked: the client's stated requirement, not yet confirmed in writing." : "",
      reqStatuses.has("Client-approved") ? "Client-approved: the client has confirmed it with us; it isn't a technical approval." : "",
      reqStatuses.has("For consultant review") ? "For consultant review: a performance direction for the relevant consultant to assess, not a specified product." : "",
      reqStatuses.has("To verify") ? "To verify: the design team still needs to confirm how it is met." : "",
      reqStatuses.has("Verified") ? "Verified: confirmed by the design team, with its reference on file." : ""].filter(Boolean).join(" "),
    ...boundedRows("REQS", reqs.map((x) => ({ REF: x.ref || "", TEXT: x.text, STATUS: x.status || "" }))),

    HAS_S5: present.s5, S5_NUM: nums.s5 || "",
    // Says only what the groups below hold (QA RID-11: a new build has nothing that stays).
    SCOPE_INTRO: `${(() => { const has = (g) => scope.some((x) => x.group === g); const parts = [has("Existing to remain or protect") && "what stays",
      ["Not in the current scope", "By others", "Supplied by the client", "Still to be decided"].some(has) && "what sits outside it"].filter(Boolean);
      return parts.length ? `The work as recorded now, with ${parts.join(" and ")}.` : "The work as recorded now."; })()}${anyCheck ? " To verify marks an item whose technical check is still open." : ""}`,
    // The Check column is labelled only when a row has a check open; otherwise it stays quiet (owner's editorial rule).
    SCOPE_CHECK_HEAD: anyCheck ? "Check" : "",
    SCOPE_GROUPS: groups(scope, "SG", "SROWS", "S_LAST", (r) => ({ REF: refsOf(r), TEXT: r.text, CHECK: r.check || "" })),

    HAS_S6: present.s6, S6_NUM: nums.s6 || "",
    HAS_DIRECTION: !!a.direction, DIRECTION: a.direction ? `The design direction: ${a.direction}` : "",
    DIR_INTRO: ["What applies throughout the house is listed once; each room then shows its own choices and where it differs from the house.",
      ["Proposed", "Client-approved"].some((st) => dirStatuses.has(st)) ? `Each item is the client's preferred direction unless marked ${["Proposed", "Client-approved"].filter((st) => dirStatuses.has(st)).join(" or ")}; none is a product or technical approval.` : "Each item is the client's preferred direction; none is a product or technical approval.",
      // Each printed status defined once (QA REC-10: Proposed means put to the client, not a proposed technical solution).
      dirStatuses.has("Proposed") ? "Proposed: a specific option put to the client, not yet decided." : "",
      dirStatuses.has("Client-approved") ? "Client-approved: the client has confirmed it with us." : "",
      dirStatuses.has("To verify") ? "To verify: the design team still needs to confirm it." : "",
      dirStatuses.has("Verified") ? "Verified: confirmed by the design team, with its reference on file." : ""].filter(Boolean).join(" "),
    DIR_GROUPS: groups(direction, "DG", "DROWS", "D_LAST", (r) => ({ ITEM: r.item || "", ITEM_REF: r.ref ? `\n${r.ref}` : "", TEXT: r.text, STATUS: r.status || "" })),


    _docNumber: id.number, _id: id,
  };
}

// ── Pair 2: Technical Selections Schedule and Client Selections Presentation (docs/documents/SELECTIONS_SPEC.md) ──
// Both payloads read the fixture's selectionRecords output (registerDocuments.mjs), so the two documents can never say
// one selection two ways. Design-system templates: author-tss.mjs (A4 landscape) and author-csp.mjs (A4 portrait).

/** The selection statuses either document prints. A preference is unmarked (owner decision Q2). */
export const SELECTION_STATE_WORDS = ["", "Client-approved", "Proposed", "To be decided", "Not yet discussed", "Existing to remain", "Client's choice, with Blue Leaf", "Change requested, with Blue Leaf"];
/** One word for a selection not chosen yet, the same in both documents (spec critique: one label per state). */
export const PRESENTATION_PENDING_LABEL = "To be decided";
const supersedesNote = (meta) => (meta.status === "Issued" && meta.supersedes?.label
  ? `This revision replaces ${meta.supersedes.label}${meta.supersedes.issuedDate ? `, issued ${fmtIdDate(meta.supersedes.issuedDate)}` : ""}. ` : "");
const nl = (t) => (t ? `\n${t}` : "");
/** A cell's two lines: the second only when it has text, and never under an empty first line (spec critique). */
const twoLines = (first, second) => (first ? { a: first, b: nl(second) } : { a: second || "", b: "" });

/** Technical Selections Schedule (BLB-TSS). Reader: the design team, estimator, suppliers and trades. */
export function buildSelectionsSchedulePayload(fx) {
  const t = fx.technicalSchedule || {}, p = fx.project || {}, meta = fx.meta || {};
  const id = documentIdentity({ type: "selections_schedule", projectRef: meta.ref, status: meta.status, revision: meta.revision, revisionLabel: meta.revisionLabel, issuedDate: meta.issuedDate });
  const groups = (t.groups || []).filter((g) => g.rows && g.rows.length);
  const reqs = t.requirements || [], actions = t.actions || [], pending = t.pending || [], sources = t.sources || [];
  const present = { s1: groups.length > 0, s2: reqs.length > 0, s3: actions.length > 0, s3b: pending.length > 0, s4: sources.length > 0 };
  const nums = {}; let n = 0;
  for (const k of ["s1", "s2", "s3", "s3b", "s4"]) if (present[k]) nums[k] = two(++n);
  const states = new Set(t.statuses || []), tech = new Set(t.technicalShown || []);
  const drawing = String(p.drawingBasis || "").trim();
  const pack = t.coord ? `Coordination request: ${t.coord}` : "";
  return {
    HDR_DOC_TYPE: pack ? "Coordination request" : "Technical Selections Schedule",
    HDR_PROJECT: p.siteShort || p.siteAddress || "",
    FTR_IDENTITY: `${id.number}   ·   ${id.statusText}`,
    DOC_KICKER: [id.issued ? "" : "Draft", pack || "Selections and coordination"].filter(Boolean).join("  /  "),
    DOC_TITLE: "Technical selections schedule",
    HAS_SUBTITLE: !!p.projectLabel, DOC_SUBTITLE: p.projectLabel || "",
    META_ROWS: metaRows([
      ["Prepared for", meta.recipient || t.coord || "The project team"], ["Client", p.clientName],
      ["Site", p.siteAddress], ["Drawing basis", drawing || "Not yet recorded"],
      ["Stage", p.stageLabel], ["Document", id.number],
      ["Prepared by", p.preparedBy || "Blue Leaf Building"], ["Status", id.issued ? `${id.revision} · ${id.statusText}` : id.statusText],
    ]),
    // The issue state, never a static "Issued" (spec critique); never a purchase order, a variation or a technical
    // approval (Tab 15:51, Tab 17:18, Tab 22:25); a supplier's document cited here is not adopted (Tab 14:76).
    STATUS_LABEL: id.issued ? "Issued for coordination" : "Draft for coordination — not issued",
    STATUS_BODY: `${supersedesNote(meta)}It isn't a purchase order, a variation or a technical approval. A product is the client's choice only where it is marked Client-approved, and a technical item is settled only where it is marked Verified. A supplier's document cited here is that supplier's own information: citing it isn't acceptance of its content.`,
    // Each printed status, defined once (owner decision Q2), and the known / provisional / unresolved split (the brief).
    READ_INTRO: ["Grouped by trade and system. Each row is one register record, or rooms with identical records.",
      t.hasHouse ? "A row with no location applies throughout the house." : "",
      states.has("preferred") ? "Unmarked: the client's preferred direction; no product is chosen yet." : "",
      states.has("proposed") ? "Proposed: an option put to the client, not yet accepted." : "",
      states.has("with_blue_leaf") ? "Client's choice, with Blue Leaf: the client has answered on the portal and Blue Leaf is reviewing it." : "",
      states.has("change_requested") ? "Change requested, with Blue Leaf: the client has asked for a change." : "",
      states.has("approved") ? "Client-approved: the client has confirmed it with us; it isn't a technical approval." : "",
      states.has("undecided") ? "To be decided: no choice has been made yet." : "",
      states.has("not_discussed") ? "Not yet discussed: not raised with the client yet." : "",
      states.has("existing") ? "Existing to remain: kept as it is." : "",
      tech.has("to_verify") ? "To verify: a technical check is still open." : "",
      tech.has("verified") ? "Verified: technically checked, with the reference on file." : "",
      t.hasDirection ? "Where a record's own words differ from the product named, they are shown under it as the recorded direction." : "",
      t.supplyNoted ? "Blue Leaf supplies each item unless its supply is noted." : "",
      t.sources?.length ? "A source key (S1 …) is listed in the source documents at the end." : "",
      "A blank finish or quantity hasn't been recorded; a quantity from a supplier's schedule is that supplier's count."].filter(Boolean).join(" "),
    SUMMARY: t.total ? summaryOf(t.total, t.knowledge || {}) : "",

    HAS_S1: present.s1, S1_NUM: nums.s1 || "",
    SEL_GROUPS: groups.map((g, k) => ({ G_LAST: k === groups.length - 1, GROUP: g.group, ...boundedRows("ROWS", g.rows.map((r) => {
      const st = twoLines(r.selection, r.technical), src = twoLines(r.source, r.sourceFlag);
      const loc = [r.location, r.replaces ? `instead of the ${r.replaces}` : ""].filter(Boolean).join(", ");
      return {
        REF: r.ref, ITEM: r.item, LOC: nl(loc.charAt(0).toUpperCase() + loc.slice(1)),
        // No product: the Status says "To be decided" once; the cell holds only the detail (QA K-08).
        ...(() => { const sel = twoLines(r.product, [r.detail, r.direction ? `Recorded direction: ${r.direction}` : ""].filter(Boolean).join("\n")); return { SEL: sel.a, DETAIL: sel.b }; })(),
        FINISH: r.finish || "", QTY: r.quantity || "", STATUS: st.a, TECH: st.b, SOURCE: src.a, FLAG: src.b,
      };
    })) })),

    HAS_S2: present.s2, S2_NUM: nums.s2 || "",
    REQS_INTRO: "What the client has asked these selections to achieve. A requirement marked To verify is still to be confirmed by the party named.",
    ...boundedRows("REQS", reqs.map((x) => ({ REF: x.ref || "", TEXT: x.text, APPLIES: x.applies || "", STATUS: x.status || "", WHO: nl(x.who && /To verify/.test(x.status || "") ? x.who : "") }))),

    HAS_S3: present.s3, S3_NUM: nums.s3 || "",
    // A pack asks its party for what is theirs to answer (owner review: the Routleys pack read as Blue Leaf's to-do list).
    S3_KICKER: t.party ? "Requests" : "Open items", S3_TITLE: t.party ? `What we need from ${t.party}` : "Open actions and checks",
    // Not "everything still open": a To-verify row's check is marked where it prints (QA K-06).
    ACTIONS_INTRO: t.party ? "Please reply against these references. A row in section 01 changes only once Blue Leaf has checked your reply and updated the register."
      : "The open actions on these selections and the decisions they wait on, by reference. A row in section 01 changes only once its action is closed and the register updated; a row marked To verify still needs its technical check.",
    ...boundedRows("ACTIONS", actions.map((x) => ({ REF: x.ref || "", TEXT: sentenceOf(x.text), WHO: x.who || "To be agreed" }))),

    HAS_S3B: present.s3b, S3B_NUM: nums.s3b || "",
    PENDING_INTRO: "Decisions and follow-ups with the client and Blue Leaf that affect these selections, for information. Nothing here is asked of you.",
    ...boundedRows("PENDING", pending.map((x) => ({ REF: x.ref || "", TEXT: sentenceOf(x.text), WHO: x.who || "To be agreed" }))),

    HAS_S4: present.s4, S4_NUM: nums.s4 || "",
    SOURCES_INTRO: "The received documents this schedule cites, by key. The originals are kept as received; Blue Leaf reconciles each against the register by hand.",
    ...boundedRows("SOURCES", sources.map((x) => ({ KEY: x.key, DOC: x.document, REV: x.revision, REVIEW: x.review }))),

    _docNumber: id.number, _id: id,
  };
}
/** "27 selections. Known: 3. Provisional: 20. Unresolved: 4." with each class defined once (the brief). */
function summaryOf(total, k) {
  const part = (n, label, def) => (n ? `${label}: ${n} (${def})` : "");
  return `${total} selection${total === 1 ? "" : "s"}. ${[part(k.known, "Known", "client-approved or existing, no check or source open"),
    part(k.provisional, "Provisional", "proposed, preferred, or approved with a check or source still open"),
    part(k.unresolved, "Unresolved", "still to be decided, or nothing recorded")].filter(Boolean).join("; ")}.`;
}
const sentenceOf = (s) => { const x = String(s || "").replace(/\s+/g, " ").trim(); return x && !/[.!?]$/.test(x) ? `${x}.` : x; };

/** Client Selections Presentation (BLB-CSP). Reader: the client. No references, codes, suppliers or technical states. */
export function buildClientPresentationPayload(fx) {
  const c = fx.clientSelections || {}, p = fx.project || {}, meta = fx.meta || {};
  const id = documentIdentity({ type: "client_presentation", projectRef: meta.ref, status: meta.status, revision: meta.revision, revisionLabel: meta.revisionLabel, issuedDate: meta.issuedDate });
  const groups = (c.groups || []).filter((g) => g.rows && g.rows.length);
  const needs = c.needs || [], proposals = c.proposals || 0;
  const statuses = new Set(groups.flatMap((g) => g.rows.map((r) => r.status || "")));
  const present = { s1: needs.length > 0 || proposals > 0, s2: groups.length > 0 };
  const nums = {}; let n = 0;
  for (const k of ["s1", "s2"]) if (present[k]) nums[k] = two(++n);
  const marked = ["Proposed", "Being confirmed", "Client-approved", "To be decided", "Existing to remain", "Client's choice, with Blue Leaf", "Change requested, with Blue Leaf"].filter((st) => statuses.has(st));
  return {
    HDR_DOC_TYPE: "Your selections",
    HDR_PROJECT: p.siteShort || p.siteAddress || "",
    FTR_IDENTITY: `${id.number}   ·   ${id.statusText}`,
    DOC_KICKER: id.issued ? "Client selections" : "Draft  /  Client selections",
    DOC_TITLE: "Your selections",
    HAS_SUBTITLE: !!p.projectLabel, DOC_SUBTITLE: p.projectLabel || "",
    META_ROWS: metaRows([
      ["Prepared for", meta.recipient || p.clientName], ["Site", p.siteAddress],
      ["Prepared by", p.preparedBy || "Blue Leaf Building"], ["Date", fmtIdDate(meta.issuedDate || meta.preparedDate)],
      ["Document", id.number], ["Status", id.issued ? `${id.revision} · ${id.statusText}` : id.statusText],
    ]),
    STATUS_LABEL: id.issued ? "Your selections as recorded" : "Draft for review — not issued",
    // Negative statements only: no process promise (spec critique; as the ADB's cover note).
    STATUS_BODY: `${supersedesNote(meta)}This records your selections as they stand on ${fmtIdDate(meta.issuedDate || meta.preparedDate)}. It isn't a contract document, a price or a technical approval. A selection marked Client-approved records your choice; it doesn't mean the item has been checked or ordered.`,

    HAS_S1: present.s1, S1_NUM: nums.s1 || "",
    // Proposals are marked where they print; said once here, never a row each (editorial rule).
    NEEDS_INTRO: [needs.length ? (needs.length === 1 ? "One decision we need from you before these selections can be settled." : "The decisions we need from you before these selections can be settled.") : "",
      proposals ? `${needs.length ? "Also, please" : "Please"} let us know whether each selection marked Proposed in the next section suits you.` : ""].filter(Boolean).join(" "),
    HAS_NEEDS: needs.length > 0,
    ...boundedRows("NEEDS", needs.map((x) => ({ ITEM: x.item, WHERE: nl(x.where), TEXT: x.text }))),

    HAS_S2: present.s2, S2_NUM: nums.s2 || "",
    // Statuses defined once, only those that print (owner decision Q2).
    SEL_INTRO: [groups[0]?.group === "Throughout the house" ? "What applies throughout the house comes first, then each room." : "Room by room.",
      marked.length ? `Each item is your preferred direction unless it is marked ${andWords(marked)}.` : "Each item is your preferred direction.",
      statuses.has("Proposed") ? "Proposed: an option we've put to you, not yet accepted." : "",
      statuses.has("Being confirmed") ? "Being confirmed: we're checking the supplier's details before putting an option to you." : "",
      statuses.has("Client-approved") ? "Client-approved: you've confirmed it with us." : "",
      statuses.has("To be decided") ? "To be decided: not chosen yet." : "",
      statuses.has("Existing to remain") ? "Existing to remain: staying as it is." : "",
      statuses.has("Client's choice, with Blue Leaf") ? "Client's choice, with Blue Leaf: you've told us your choice and we're reviewing it." : "",
      statuses.has("Change requested, with Blue Leaf") ? "Change requested, with Blue Leaf: you've asked for a change and we're looking at it." : "",
      groups.some((g) => g.rows.some((r) => r.earlier)) ? "Where we've proposed something different from what was recorded before, the earlier direction is shown under it." : ""].filter(Boolean).join(" "),
    SEL_GROUPS: groups.map((g, k) => ({ G_LAST: k === groups.length - 1, GROUP: g.group, ...boundedRows("ROWS", g.rows.map((r) => ({
      // Nothing chosen: the status says "To be decided" once (QA C08).
      ITEM: r.item, STATUS: r.status || "",
      // Neutral: the earlier words may have been a proposal, not the client's own ask (QA C05). Never an empty first line.
      ...(() => { const c = twoLines(`${r.text || ""}${r.text && r.replaces ? `, instead of the ${r.replaces}` : ""}`,
        [r.finish, r.earlier ? `Previously recorded: ${r.earlier.charAt(0).toLowerCase()}${r.earlier.slice(1)}` : ""].filter(Boolean).join("\n")); return { TEXT: c.a, FINISH: c.b }; })(),
    }))) })),

    _docNumber: id.number, _id: id,
  };
}
const andWords = (l) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} or ${l.at(-1)}` : l[0] || "");

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
  selections_schedule: { templateFile: "blb-selections-schedule-template.docx", build: buildSelectionsSchedulePayload, label: "Technical Selections Schedule" },
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
  // A selection record's status (selectionRecords) must be one the documents define; the R01 JSON fixtures' rows carry
  // the older vocabulary in .status.
  for (const r of fx?.selections || []) {
    if (r.selection !== undefined && !SELECTION_STATE_WORDS.includes(r.selection)) errors.push(`Selection ${r.ref || "?"} has unknown status "${r.selection}".`);
    else if (r.selection === undefined && r.status && !SELECTION_STATUSES.includes(r.status)) errors.push(`Selection ${r.itemId || "?"} has unknown status "${r.status}".`);
  }
  const ab = fx?.architectBrief || {};
  for (const r of [...(ab.requirements || []), ...(ab.directionGroups || []).flatMap((g) => g.rows || []), ...(ab.scope || []).flatMap((g) => (g.rows || []).map((x) => ({ ...x, status: x.check })))])
    if (r.status && !String(r.status).split(", ").every((x) => ARCHITECT_ITEM_STATUSES.some((st) => st.toLowerCase() === x.toLowerCase()))) errors.push(`Architect brief item ${r.ref || "?"} status "${r.status}" is not in the coordination vocabulary.`);
  if (mode === "draft") return { ok: true, errors: [], warnings: errors };
  if (meta.status !== "Issued") errors.push('Document is not marked "Issued" (a Draft/specimen may not be issued to a client).');
  if (meta.status === "Issued" && !/^\d{4}-\d{2}-\d{2}$/.test(String(meta.issuedDate || ""))) errors.push("Issued document has no valid issued date.");
  if (!logoPresent) errors.push("Approved Blue Leaf identity is missing — cannot issue.");
  return { ok: errors.length === 0, errors, warnings: [] };
}
