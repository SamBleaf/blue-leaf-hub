// documentPayloads.mjs — R01 Document Engine Proof.
//
// PURE mapping layer: a typed project FIXTURE → a docxtemplater merge PAYLOAD for each of the three
// first-release documents (Client Brief, Architect Brief, Selections Schedule). These payloads are
// filled by the EXISTING renderer (docTemplates.renderDocxTemplate) against the templates in
// public/templates/. No database access, no invented columns, no migrations — R01 accepts a typed
// fixture only. Field map (placeholder tag → fixture source) lives beside each builder below.
//
// SOURCE-OF-TRUTH NOTE (per register Tab 14/16): at integration time the fixture is assembled from
//   - scalar job facts  → factsService/getJobProfile
//   - repeating room/category selections → client_selections + selection_options (post pre-con project)
//   - pre-job concept preferences → leads.selections_schedule (legacy, temporary, read-only after promotion)
// R01 does NOT wire those; it proves the template + payload contract on fixtures.

/**
 * @typedef {Object} DocFixtureMeta
 * @property {string} docNumber        e.g. "BLB-BRIEF-0417"
 * @property {string} revision         e.g. "1"
 * @property {string} issuedDate       ISO "YYYY-MM-DD"
 * @property {"Draft"|"Issued"} status
 * @property {string} [audience]       e.g. "Client", "Architect / design team"
 */
/**
 * @typedef {Object} DocFixtureProject
 * @property {string} clientName
 * @property {string} [clientSalutation]
 * @property {string} projectDescription
 * @property {string} siteAddress
 * @property {string} [deliveryModel]
 * @property {string} [drawingBasis]
 * @property {string} [architect]
 * @property {string} [preparedBy]
 * @property {string} [stageLabel]     e.g. "Concept stage"
 */
/**
 * @typedef {Object} SelectionRow
 * @property {string} group    External | Internal Finishes | Joinery | Wet Areas | Services & Fixtures | External Works
 * @property {string} itemId
 * @property {string} category category / room
 * @property {string} product
 * @property {string} finish
 * @property {string} [qty]
 * @property {string} status   see SELECTION_STATUSES
 * @property {string} responsibility
 */

/** Allowed selection decision states (explicit non-decision states are legal, per Tab 10 §C / AUD-027). */
export const SELECTION_STATUSES = [
  "Client-approved", "Confirmed", "Proposed", "Preliminary", "TBC",
  "N/A", "Excluded", "By Others", "Existing to Remain", "Undecided",
];

const GROUP_ORDER = ["External", "Internal Finishes", "Joinery", "Wet Areas", "Services & Fixtures", "External Works"];

function fmtAuDate(iso) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) return String(iso);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}
const paras = (arr) => (arr || []).map((t) => ({ PARA_TEXT: String(t || "") }));
const items = (arr) => (arr || []).map((t) => ({ ITEM_TEXT: String(t || "") }));
const footerMeta = (meta) => `${meta.docNumber} · Rev ${meta.revision}${meta.status === "Draft" ? " · DRAFT" : ""}`;

function sharedHeader(fx, { title, statusLine, audienceLabel }) {
  const p = fx.project, meta = fx.meta;
  const metaRows = [
    ["Client", p.clientName],
    ["Project", p.projectDescription],
    ["Site address", p.siteAddress],
    p.deliveryModel ? ["Delivery model", p.deliveryModel] : null,
    p.drawingBasis ? ["Drawing basis", p.drawingBasis] : null,
    p.architect ? ["Architect / designer", p.architect] : null,
    audienceLabel && meta.audience ? ["Audience", meta.audience] : null,
    ["Issued", fmtAuDate(meta.issuedDate)],
    ["Document / revision", `${meta.docNumber} · Rev ${meta.revision}`],
    p.preparedBy ? ["Prepared by", p.preparedBy] : null,
  ].filter(Boolean).map(([LABEL, VALUE]) => ({ LABEL, VALUE: String(VALUE || "") }));
  return {
    DOC_TITLE: title,
    STATUS_LINE: statusLine,
    META_ROWS: metaRows,
    FOOTER_META: footerMeta(meta),
  };
}

/** Client Project Brief. Tags: SUMMARY_PARAS[], SCOPE_IN[], SCOPE_OUT[], PREFERENCE_GROUPS[{GROUP_NAME,ITEMS[]}], ASSUMPTIONS[], DECISIONS[], NEXT_STEPS_PARAS[]. */
export function buildClientBriefPayload(fx) {
  const b = fx.clientBrief || {};
  const stage = fx.project.stageLabel || "Concept stage";
  return {
    ...sharedHeader(fx, { title: "Project Brief", statusLine: `${(fx.meta.status || "Draft").toUpperCase()} — ${stage}` }),
    CALLOUT: "Preliminary — this is a design brief, not a construction specification or a fixed-price quotation. Quantities, products and allowances are indicative until the paid pre-construction (PTSA) stage.",
    SUMMARY_PARAS: paras(b.summaryParas),
    SCOPE_IN: items(b.scopeIn),
    SCOPE_OUT: items(b.scopeOut),
    PREFERENCE_GROUPS: (b.preferenceGroups || []).map((g) => ({ GROUP_NAME: g.name, ITEMS: items(g.items) })),
    ASSUMPTIONS: items(b.assumptions),
    DECISIONS: items(b.decisions),
    NEXT_STEPS_PARAS: paras(b.nextStepsParas),
    FOOTER_NOTE: "Prepared by Blue Leaf Building for discussion at concept stage. Figures are indicative and subject to developed design and pricing.",
  };
}

/** Architect Design Brief. Tags: PURPOSE_PARAS[], CONFIRMED_REQS[], CLIENT_PREFS[], SCHEDULE_ITEMS[{ITEM_ID,LOCATION,REQUIREMENT,STATUS,ACTION,DWG_REF}], COORDINATION[], OUTSTANDING[], REFERENCES[]. */
export function buildArchitectBriefPayload(fx) {
  const a = fx.architectBrief || {};
  return {
    ...sharedHeader(fx, { title: "Design Brief", statusLine: "FOR ARCHITECT / DESIGN TEAM", audienceLabel: true }),
    CALLOUT: "This brief distinguishes CONFIRMED instructions from PRELIMINARY client preferences. Nothing here implies consultant sign-off; technical design and certification remain the responsibility of the named consultants.",
    PURPOSE_PARAS: paras(a.purposeParas),
    CONFIRMED_REQS: items(a.confirmedReqs),
    CLIENT_PREFS: items(a.clientPrefs),
    SCHEDULE_ITEMS: (a.scheduleItems || []).map((r) => ({
      ITEM_ID: r.itemId || "", LOCATION: r.location || "", REQUIREMENT: r.requirement || "",
      STATUS: r.status || "", ACTION: r.action || "", DWG_REF: r.dwgRef || "",
    })),
    COORDINATION: items(a.coordination),
    OUTSTANDING: items(a.outstanding),
    REFERENCES: items(a.references),
    FOOTER_NOTE: "Issued by Blue Leaf Building. Confirmed items are instructions; preliminary items are client preferences for coordination, not final specification.",
  };
}

/** Selections & Finishes Schedule. Tag: SCHEDULE_ROWS[{ITEM_ID,CATEGORY,PRODUCT,FINISH,QTY,STATUS,RESPONSIBILITY}] (flattened, group-sorted, header repeats). */
export function buildSelectionsSchedulePayload(fx) {
  const rows = [...(fx.selections || [])].sort((x, y) => {
    const gi = GROUP_ORDER.indexOf(x.group), gj = GROUP_ORDER.indexOf(y.group);
    return (gi < 0 ? 99 : gi) - (gj < 0 ? 99 : gj);
  });
  return {
    ...sharedHeader(fx, { title: "Selections Schedule", statusLine: "DEVELOPED SELECTIONS — status per item" }),
    SCHEDULE_ROWS: rows.map((r) => ({
      ITEM_ID: r.itemId || "",
      CATEGORY: [r.group, r.category].filter(Boolean).join(" / "),
      PRODUCT: r.product || "",
      FINISH: r.finish || "",
      QTY: r.qty || "—",
      STATUS: r.status || "TBC",
      RESPONSIBILITY: r.responsibility || "",
    })),
    FOOTER_NOTE: "Status is shown in words (not colour). 'Proposed' and 'TBC' items are not yet client-approved. No pricing is shown on the design schedule by default.",
  };
}

export const DOC_DEFS = {
  client_brief: { templateFile: "blb-client-brief-template.docx", build: buildClientBriefPayload, label: "Client Project Brief" },
  architect_brief: { templateFile: "blb-architect-brief-template.docx", build: buildArchitectBriefPayload, label: "Architect Design Brief" },
  selections_schedule: { templateFile: "blb-selections-schedule-template.docx", build: buildSelectionsSchedulePayload, label: "Selections & Finishes Schedule" },
};

// ── Pre-issue validation (R01 task 6) ────────────────────────────────────────
const PLACEHOLDER_RX = /(\{\{|\}\}|\bTODO\b|\bTBD\b|REPLACE[_ ]?ME|\bXXX+\b|lorem ipsum)/i;
const FAKE_MONEY_RX = /\$\s?0(?:[.,]0{1,2})?\b/; // $0, $0.00 — a fabricated/blank construction price

function walkStrings(node, visit, path = "") {
  if (node == null) return;
  if (typeof node === "string") { visit(node, path); return; }
  if (Array.isArray(node)) { node.forEach((v, i) => walkStrings(v, visit, `${path}[${i}]`)); return; }
  if (typeof node === "object") { for (const k of Object.keys(node)) walkStrings(node[k], visit, path ? `${path}.${k}` : k); }
}

/**
 * Validate a fixture before rendering/issuing.
 * @param {object} fx fixture
 * @param {{mode?: "draft"|"issue"}} [opts]
 * @returns {{ok:boolean, errors:string[], warnings:string[]}}
 * In "issue" mode any error blocks (ok=false). In "draft" mode errors are downgraded to warnings (ok=true) so a draft can still render WITH a visible warning.
 */
export function validateFixture(fx, { mode = "issue" } = {}) {
  const errors = [];
  const p = (fx && fx.project) || {};
  if (!p.clientName || !String(p.clientName).trim()) errors.push("Missing client name.");
  if (!p.siteAddress || !String(p.siteAddress).trim()) errors.push("Missing site address.");
  if (!fx?.meta?.issuedDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(fx.meta.issuedDate))) errors.push("Missing or malformed issued date (expected YYYY-MM-DD).");
  if (fx?.meta?.status && !["Draft", "Issued"].includes(fx.meta.status)) errors.push(`Invalid document status "${fx.meta.status}".`);

  walkStrings(fx, (s, path) => {
    if (PLACEHOLDER_RX.test(s)) errors.push(`Unresolved placeholder / TODO text at ${path}: "${s.slice(0, 48)}".`);
    if (FAKE_MONEY_RX.test(s)) errors.push(`Suspect $0 / blank money value at ${path}: "${s.slice(0, 48)}".`);
  });

  for (const r of fx?.selections || []) {
    if (r.status && !SELECTION_STATUSES.includes(r.status)) errors.push(`Selection ${r.itemId || "?"} has unknown status "${r.status}" (allowed: ${SELECTION_STATUSES.join(", ")}).`);
  }

  if (mode === "draft") return { ok: true, errors: [], warnings: errors };
  return { ok: errors.length === 0, errors, warnings: [] };
}
