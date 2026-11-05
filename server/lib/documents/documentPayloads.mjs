// documentPayloads.mjs — Document Engine (R03 design, matching the approved Blue Leaf mock-ups).
//
// PURE mapping layer: a typed project FIXTURE → a docxtemplater merge PAYLOAD for each first-release
// document (Client Project Brief, Architect Design Brief, Technical Selection Register), filled by the
// EXISTING renderer (docTemplates.renderDocxTemplate) against public/templates/. No DB, no invented
// columns, no migrations — a typed fixture only. Doc-type constants (breadcrumb, section label, title,
// tagline, callout, footer) are generated here; only project CONTENT comes from the fixture.

export const SELECTION_STATUSES = [
  "Client-approved", "Confirmed", "Proposed", "Preferred", "Preliminary", "TBC",
  "N/A", "Excluded", "By Others", "Existing to Remain", "Undecided", "Hold", "Design", "Retain",
];
/** Architect design-register status vocabulary (Tab 17 #9): intent vs technical verification. */
export const ARCHITECT_ITEM_STATUSES = ["Client-approved", "Proposed", "To verify"];

const GROUP_ORDER = ["External", "Internal Finishes", "Joinery", "Wet Areas", "Services & Fixtures", "External Works"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fmtAuDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "")); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(iso || ""); };
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

function chrome(fx, { prefix, breadcrumb, sectionLabel, title, tagline }) {
  const meta = fx.meta, issued = meta.status === "Issued";
  const docNumber = `${prefix}-${meta.ref}`;
  const issueCode = `P${String(meta.revision).padStart(2, "0")}`;
  const statusValue = issued ? `ISSUED  /  ${fmtAuDate(meta.issuedDate)}` : `PRELIMINARY  /  ${issueCode}`;
  return {
    BREADCRUMB: breadcrumb, SECTION_LABEL: sectionLabel, DOC_TITLE: title, TAGLINE: tagline,
    FOOTER_MID: `${docNumber}  ·  ${issued ? "ISSUED" : "DRAFT"}`,
    _docNumber: docNumber, _statusValue: statusValue,
  };
}

/** 01 — Client Project Brief (editorial). */
export function buildClientBriefPayload(fx) {
  const b = fx.clientBrief || {}, p = fx.project;
  const c = chrome(fx, { prefix: "PBR", breadcrumb: "Client Project Brief  /  Design Study",
    sectionLabel: "Concept presentation  ·  Renovation + extension", title: "Project brief",
    tagline: "A clear foundation for the next phase of your home." });
  const intn = (i, k) => (b.intentions && b.intentions[i] ? b.intentions[i][k] : "");
  return {
    ...c,
    META_ROWS: metaRows([["Prepared for", p.clientName], ["Site", p.siteAddress], ["Design basis", p.drawingBasis], ["Document status", c._statusValue]]),
    SUMMARY_PARAS: paras(b.summaryParas),
    INT1_NUM: "01", INT1_LABEL: intn(0, "label"), INT1_TEXT: intn(0, "text"),
    INT2_NUM: "02", INT2_LABEL: intn(1, "label"), INT2_TEXT: intn(1, "text"),
    INT3_NUM: "03", INT3_LABEL: intn(2, "label"), INT3_TEXT: intn(2, "text"),
    SCOPE_IN: items(b.scopeIn),
    SCOPE_OUT: items(b.scopeOut),
    PREFERENCE_GROUPS: (b.preferenceGroups || []).map((g) => ({ GROUP_NAME: g.name, ITEMS: items(g.items) })),
    QUESTIONS: (b.questions || []).map((q) => ({ REF_ID: q.id || "", ACTION: q.action || "", OWNER: q.owner || "—", STATUS: q.status || "OPEN" })),
    NEXT_STEPS_PARAS: paras(b.nextStepsParas),
    // Composed closing page (Tab 17 #2): Blue Leaf process path + working assumptions + a status anchor.
    // A full brief (one that carries the process path) breaks before the questions so page 1 ends on the
    // design narrative and page 2 reads as one composed block; a short brief stays a single page.
    CB_BREAK: !!(b.processSteps && b.processSteps.length),
    HAS_PROCESS: (b.processSteps && b.processSteps.length) ? [{}] : [],
    ...procFields(b.processSteps),
    ASSUMPTIONS: items(b.assumptions),
    CLOSE_LABEL: "Document status · preliminary",
    CLOSE_BODY: "Prepared for discussion at concept stage. This is a design brief, not a fixed-price quotation: products, quantities and allowances are indicative and are developed and confirmed during pre-construction. No client signature is required.",
  };
}

/** Pad the Blue Leaf process path to five fixed stage slots for the client-brief band. */
function procFields(steps) {
  const out = {};
  for (let i = 0; i < 5; i++) { const s = (steps || [])[i] || {}; out[`PROC${i + 1}_NUM`] = s.num || ""; out[`PROC${i + 1}_LABEL`] = s.label || ""; out[`PROC${i + 1}_NOTE`] = s.note || ""; }
  return out;
}

const archGroup = (id) => (/^(EX|WN|ST|RF|PL)/.test(id) ? "Envelope & structure" : "Internal & services");

/** 02 — Architect Design Brief (coordination-first). */
export function buildArchitectBriefPayload(fx) {
  const a = fx.architectBrief || {}, p = fx.project;
  const c = chrome(fx, { prefix: "ADB", breadcrumb: "Architect / Consultant  /  Design Study",
    sectionLabel: "Design coordination  /  Architect", title: "Architect design brief",
    tagline: "Requirements, decisions and actions to progress the next drawing issue." });
  // design register, grouped by element
  const byGroup = new Map();
  for (const r of a.scheduleItems || []) { const g = archGroup(r.itemId || ""); if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g).push(r); }
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

export function buildClientPresentationPayload(fx) {
  const p = fx.project, cp = fx.clientPresentation || {};
  const c = chrome(fx, { prefix: "SFS", breadcrumb: "Client Selections  /  Design Study",
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
      ITEMS: rows.map((r) => ({
        REF_ID: r.itemId || "", CAT: r.category || "", NAME: r.product || "",
        DESC: r.finish || "", STATUS: r.status || "TBC", SOURCE: r.responsibility || "",
      })),
    };
  }).filter(Boolean);
  const DECISIONS = (fx.selections || []).filter((r) => NEEDS_DECISION.has(r.status)).map((r) => ({
    REF_ID: r.itemId || "", ITEM: [r.category, r.product].filter(Boolean).join(" — "), OWNER: r.responsibility || "—", STATUS: r.status || "TBC",
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
    READ_BODY: "Preferred means the look is agreed in principle, not the exact product. Proposed means a specific option is being reviewed. Client-approved requires documented acceptance. Nothing in this document authorises procurement.",
    AREAS,
    HAS_DECISIONS: DECISIONS.length ? [{}] : [],
    DECISIONS,
  };
}

/** 04 — Technical Selection Register (reference-first, dense, grouped). */
export function buildSelectionsSchedulePayload(fx) {
  const p = fx.project;
  const c = chrome(fx, { prefix: "TSR", breadcrumb: "Technical Selections  /  Design Study",
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

export const DOC_DEFS = {
  client_brief: { templateFile: "blb-client-brief-template.docx", build: buildClientBriefPayload, label: "Client Project Brief" },
  architect_brief: { templateFile: "blb-architect-brief-template.docx", build: buildArchitectBriefPayload, label: "Architect Design Brief" },
  client_presentation: { templateFile: "blb-client-presentation-template.docx", build: buildClientPresentationPayload, label: "Client Selections Presentation" },
  selections_schedule: { templateFile: "blb-selections-schedule-template.docx", build: buildSelectionsSchedulePayload, label: "Technical Selection Register" },
};

// ── Pre-issue validation (Tab 17 blockers) ───────────────────────────────────
const PLACEHOLDER_RX = /(\{\{|\}\}|\bTODO\b|\bTBD\b|REPLACE[_ ]?ME|\bXXX+\b|lorem ipsum|placeholder)/i;
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
