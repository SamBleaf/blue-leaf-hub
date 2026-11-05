// documentPayloads.mjs — R01/R02 Document Engine.
//
// PURE mapping layer: a typed project FIXTURE → a docxtemplater merge PAYLOAD for each of the three
// first-release documents (Client Brief, Architect Brief, Selections Schedule), filled by the EXISTING
// renderer (docTemplates.renderDocxTemplate) against public/templates/. No DB, no invented columns,
// no migrations — a typed fixture only. (R02 redesign per register Tab 17: compact issue strip, real
// logo, calmer hierarchy, grouped landscape schedule, draft/issue control, status vocabulary.)
//
// SOURCE-OF-TRUTH NOTE (register Tab 14/16): at integration the fixture is assembled from factsService
// (scalar job facts), client_selections + selection_options (repeating selections), and legacy
// leads.selections_schedule (pre-job concept, read-only after promotion). R02 proves the contract on fixtures.

/** @typedef {Object} DocFixtureMeta
 * @property {string} docNumber  @property {string} revision
 * @property {string} [issuedDate] ISO — shown only when status === "Issued"
 * @property {string} [preparedDate] ISO — shown as "Prepared" when Draft
 * @property {"Draft"|"Issued"} status  @property {string} [audience] */
/** @typedef {Object} SelectionRow
 * @property {string} group External|Internal Finishes|Joinery|Wet Areas|Services & Fixtures|External Works
 * @property {string} itemId @property {string} category @property {string} product @property {string} finish
 * @property {string} [qty] @property {string} status @property {string} responsibility */

/** Selection decision states (explicit non-decision states are legal, per Tab 10 §C / AUD-027). */
export const SELECTION_STATUSES = [
  "Client-approved", "Confirmed", "Proposed", "Preliminary", "TBC",
  "N/A", "Excluded", "By Others", "Existing to Remain", "Undecided",
];
/** Architect coordination-schedule status vocabulary (Tab 17 #9): intent vs technical verification — never imply consultant sign-off. */
export const ARCHITECT_ITEM_STATUSES = ["Client-approved", "Proposed", "To verify"];

const GROUP_ORDER = ["External", "Internal Finishes", "Joinery", "Wet Areas", "Services & Fixtures", "External Works"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function fmtAuDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(iso || "");
}
const paras = (arr) => (arr || []).map((t) => ({ PARA_TEXT: String(t || "") }));
const items = (arr) => (arr || []).map((t) => ({ ITEM_TEXT: String(t || "") }));
const shortName = (p) => (p.siteAddress || p.clientName || "").split(",")[0].trim();

/** Shared header / issue-strip / footer fields + draft-vs-issued date control. */
function chrome(fx, { note }) {
  const p = fx.project, meta = fx.meta;
  const issued = meta.status === "Issued";
  const statusLabel = issued ? "ISSUED" : "DRAFT — SPECIMEN";
  const dateLabel = issued ? "Issued" : "Prepared";
  const dateVal = fmtAuDate(issued ? meta.issuedDate : (meta.preparedDate || meta.issuedDate));
  return {
    ISSUE_LINE_1: `${meta.docNumber} · Rev ${meta.revision}`,
    ISSUE_LINE_2: `${statusLabel} · ${dateLabel} ${dateVal}`,
    SUBLINE: [p.clientName, p.siteAddress, p.stageLabel].filter(Boolean).join("  ·  "),
    ISSUE_NOTE: note,
    FOOTER_LEFT: `Blue Leaf Building · ${shortName(p)}`,
    FOOTER_MID: `${meta.docNumber} · Rev ${meta.revision} · ${issued ? "ISSUED" : "DRAFT"}`,
  };
}

/** Client Project Brief (editorial). */
export function buildClientBriefPayload(fx) {
  const b = fx.clientBrief || {};
  return {
    DOC_TITLE: "Project Brief",
    ...chrome(fx, { note: "Preliminary design brief — not a construction specification or a fixed-price quotation. Indicative until the paid pre-construction (PTSA) stage." }),
    SUMMARY_PARAS: paras(b.summaryParas),
    SCOPE_IN: items(b.scopeIn),
    SCOPE_OUT: items(b.scopeOut),
    PREFERENCE_GROUPS: (b.preferenceGroups || []).map((g) => ({ GROUP_NAME: g.name, ITEMS: items(g.items) })),
    ASSUMPTIONS: items(b.assumptions),
    DECISIONS: items(b.decisions),
    NEXT_STEPS_PARAS: paras(b.nextStepsParas),
  };
}

/** Architect Design Brief (coordination-first). */
export function buildArchitectBriefPayload(fx) {
  const a = fx.architectBrief || {}, p = fx.project;
  const metaRows = [
    ["Project", p.projectDescription],
    p.architect ? ["Architect / designer", p.architect] : null,
    p.drawingBasis ? ["Drawing basis", p.drawingBasis] : null,
    ["Prepared by", p.preparedBy || "Blue Leaf Building"],
  ].filter(Boolean).map(([LABEL, VALUE]) => ({ LABEL, VALUE: String(VALUE || "") }));
  return {
    DOC_TITLE: "Design Brief",
    ...chrome(fx, { note: "For the architect / design team. Confirmed items are client-approved intent; preliminary items are preferences; technical verification remains with the named consultants." }),
    META_ROWS: metaRows,
    ACTIONS: items(a.actions),
    PURPOSE_PARAS: paras(a.purposeParas),
    CONFIRMED_REQS: items(a.confirmedReqs),
    CLIENT_PREFS: items(a.clientPrefs),
    SCHEDULE_ITEMS: (a.scheduleItems || []).map((r) => ({
      ITEM_ID: r.itemId || "", LOCATION: r.location || "", REQUIREMENT: r.requirement || "",
      STATUS: r.status || "", ACTION: r.action || "", DWG_REF: r.dwgRef || "",
    })),
    REFERENCES: items(a.references),
  };
}

/** Selections & Finishes Schedule (reference-first, grouped, landscape). */
export function buildSelectionsSchedulePayload(fx) {
  const byGroup = new Map();
  for (const r of fx.selections || []) {
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group).push(r);
  }
  const GROUPS = [...byGroup.keys()]
    .sort((a, b) => (GROUP_ORDER.indexOf(a) < 0 ? 99 : GROUP_ORDER.indexOf(a)) - (GROUP_ORDER.indexOf(b) < 0 ? 99 : GROUP_ORDER.indexOf(b)))
    .map((g) => ({
      GROUP_NAME: g,
      ITEMS: byGroup.get(g).map((r) => ({
        ITEM_ID: r.itemId || "", CATEGORY: r.category || "", PRODUCT: r.product || "",
        FINISH: r.finish || "", QTY: r.qty || "—", STATUS: r.status || "TBC", RESPONSIBILITY: r.responsibility || "",
      })),
    }));
  return {
    DOC_TITLE: "Selections & Finishes Schedule",
    ...chrome(fx, { note: "Developed selections — status shown per item, in words (not by colour)." }),
    GROUPS,
    FOOTER_NOTE: "'Proposed' and 'TBC' items are not yet client-approved. No pricing is shown on the design schedule by default.",
  };
}

export const DOC_DEFS = {
  client_brief: { templateFile: "blb-client-brief-template.docx", build: buildClientBriefPayload, label: "Client Project Brief" },
  architect_brief: { templateFile: "blb-architect-brief-template.docx", build: buildArchitectBriefPayload, label: "Architect Design Brief" },
  selections_schedule: { templateFile: "blb-selections-schedule-template.docx", build: buildSelectionsSchedulePayload, label: "Selections & Finishes Schedule" },
};

// ── Pre-issue validation (R01 task 6 / Tab 17 blockers) ──────────────────────
const PLACEHOLDER_RX = /(\{\{|\}\}|\bTODO\b|\bTBD\b|REPLACE[_ ]?ME|\bXXX+\b|lorem ipsum|placeholder)/i;
const FAKE_MONEY_RX = /\$\s?0(?:[.,]0{1,2})?(?!\d)/;

function walkStrings(node, visit, path = "") {
  if (node == null) return;
  if (typeof node === "string") { visit(node, path); return; }
  if (Array.isArray(node)) { node.forEach((v, i) => walkStrings(v, visit, `${path}[${i}]`)); return; }
  if (typeof node === "object") for (const k of Object.keys(node)) walkStrings(node[k], visit, path ? `${path}.${k}` : k);
}

/**
 * Validate a fixture before rendering/issuing.
 * @param {object} fx @param {{mode?:"draft"|"issue", logoPresent?:boolean}} [opts]
 * @returns {{ok:boolean, errors:string[], warnings:string[]}}
 * Draft mode: content errors become warnings so a clearly-marked specimen can still render.
 * Issue mode: any content error blocks, AND the document must be status "Issued" with an issued date and a present logo (Tab 17 issue blockers).
 */
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
  for (const r of fx?.selections || []) {
    if (r.status && !SELECTION_STATUSES.includes(r.status)) errors.push(`Selection ${r.itemId || "?"} has unknown status "${r.status}".`);
  }
  for (const r of fx?.architectBrief?.scheduleItems || []) {
    if (r.status && !ARCHITECT_ITEM_STATUSES.includes(r.status)) errors.push(`Architect item ${r.itemId || "?"} status "${r.status}" is not in the coordination vocabulary (${ARCHITECT_ITEM_STATUSES.join(", ")}).`);
  }

  if (mode === "draft") return { ok: true, errors: [], warnings: errors };
  // issue mode — add issue-control blockers
  if (meta.status !== "Issued") errors.push('Document is not marked "Issued" (a Draft/specimen may not be issued to a client).');
  if (meta.status === "Issued" && !/^\d{4}-\d{2}-\d{2}$/.test(String(meta.issuedDate || ""))) errors.push("Issued document has no valid issued date.");
  if (!logoPresent) errors.push("Approved Blue Leaf logo artwork is missing — cannot issue.");
  return { ok: errors.length === 0, errors, warnings: [] };
}
