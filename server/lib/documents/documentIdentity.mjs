// documentIdentity.mjs — one identification convention for every Blue Leaf controlled document.
//
//   BLB-[TYPE]-[PROJECT REF]-[REVISION]      e.g. BLB-CPB-0417-R01
//
// Six things are kept apart and never confused (docs/documents/DOCUMENT_SUITE.md §2):
//   1. document type      — the code below (CPB, ADB, SFS, TSN)
//   2. project reference  — the project's own reference (fixture meta.ref); never derived from an address
//   3. draft vs issued    — a draft carries NO revision: it isn't one yet
//   4. issue revision     — R01, R02 … from the registry's integer version (lead_documents.version)
//   5. drawing/source rev — printed exactly as recorded ("Drawing basis"), never in Blue Leaf's R format
//   6. register item ref  — refCode (e.g. K005-3F9), the same on every document
//
// Prospective only: rows already issued keep their stored revision_label (P01 …), filename and storage path.

/** Document type codes. TSN keeps its name (owner, 15 Nov 2026: the estimator is in-house). The tender handover gets a code when it is specified. */
export const DOC_CODES = {
  client_brief: "CPB",
  architect_brief: "ADB",
  selections_schedule: "SFS",      // one code for the document; the layout is named on the page
  client_presentation: "SFS",
  tender_scope_notes: "TSN",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const fmtAuDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "")); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(iso || ""); };

/** The issue revision for a registry version: 1 → "R01". */
export const issueRevisionLabel = (version) => `R${String(Math.max(1, Number(version) || 1)).padStart(2, "0")}`;

/**
 * The identity printed on a document.
 * @param {{ type: string, projectRef: string, status: "Draft"|"Issued", revision?: number, revisionLabel?: string, issuedDate?: string }} o
 * @returns {{ code, base, number, revision, issued, statusText, statusShort }}
 */
export function documentIdentity({ type, projectRef, status, revision, revisionLabel, issuedDate }) {
  const code = DOC_CODES[type] || String(type || "DOC").toUpperCase();
  const ref = String(projectRef || "").trim() || "UNREF";
  const base = `BLB-${code}-${ref}`;
  const issued = status === "Issued";
  const rev = issued ? (revisionLabel || issueRevisionLabel(revision)) : null;
  return {
    code, base, issued, revision: rev,
    number: issued ? `${base}-${rev}` : base,
    statusText: issued ? `Issued ${fmtAuDate(issuedDate)}` : "Draft — not issued",
    statusShort: issued ? `${rev} · Issued ${fmtAuDate(issuedDate)}` : "Draft — not issued",
  };
}
