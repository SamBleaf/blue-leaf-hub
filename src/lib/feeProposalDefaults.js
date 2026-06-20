import { cloneDefaultInclusionSections } from "./defaultInclusions.js";
import { cloneDefaultExclusions, DEFAULT_EXCLUSIONS_LIST } from "./defaultExclusions.js";

export { cloneDefaultInclusionSections, cloneDefaultExclusions };

/** @deprecated use cloneDefaultExclusions — kept for any legacy imports */
export const DEFAULT_EXCLUSIONS = DEFAULT_EXCLUSIONS_LIST;

export const DEFAULT_FEE_SCHEDULE = [
  { STAGE_CLAIM: "Deposit", MILESTONE: "Deposit", PERCENTAGE: "5%" },
  { STAGE_CLAIM: "Progress Payment 1", MILESTONE: "Slab", PERCENTAGE: "20%" },
  { STAGE_CLAIM: "Progress Payment 2", MILESTONE: "Wall and roof frames", PERCENTAGE: "30%" },
  { STAGE_CLAIM: "Progress Payment 3", MILESTONE: "Lock up", PERCENTAGE: "20%" },
  { STAGE_CLAIM: "Progress Payment 4", MILESTONE: "Internal linings", PERCENTAGE: "15%" },
  { STAGE_CLAIM: "Progress Payment 5", MILESTONE: "Practical completion", PERCENTAGE: "10%" }
];

export const DEFAULT_NEXT_STEPS = `We will prepare contract documentation and coordinate consultant reviews. Please advise of any queries on this fee proposal within 14 days.`;

export const DEFAULT_OPENING = `Thank you for the opportunity to provide this fee proposal for your project. The following summarises our scope, inclusions, and fee structure.`;

function fmtAud(n) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(n) || 0);
}

export function emptyProposal() {
  return {
    quote_number: "",
    address: "",
    client_name: "",
    client_salutation: "",
    architect_name: "",
    building_type: "",
    arch_ref: "",
    eng_ref: "",
    spec_ref: "TENDER",
    floor_area_m2: "",
    dropbox_pdf_path: "",
    date: new Date().toLocaleDateString("en-AU"),
    net_total: 0,
    markup_percent: 0,
    markup_amount: 0,
    tax_amount: 0,
    total_inc_gst: 0,
    signatories: "Joshua Manning and Sam Morris",
    opening_paragraph: DEFAULT_OPENING,
    next_steps: DEFAULT_NEXT_STEPS,
    categories: [],
    SUMMARY_ROWS: [],
    inclusion_sections: cloneDefaultInclusionSections(),
    pc_sums: [],
    optional_items: [],
    exclusions: cloneDefaultExclusions(),
    fee_schedule: DEFAULT_FEE_SCHEDULE.map((r) => ({ ...r }))
  };
}

export const TEMPLATE_STORAGE_KEY = "blhub_fee_proposal_docx_template_b64";

export function salutationFromClientName(name) {
  const n = String(name || "").trim();
  if (!n) return "";
  return n.replace(/\s+&\s+/g, " and ").replace(/\s+/g, " ");
}

/** Summary tab + docxtemplater rows from parsed categories — local fallback; drops $0 categories. */
function buildSummaryFromParsed(parsed) {
  const rows = [];
  for (const c of parsed.categories || []) {
    const ex = Number(c.subtotal_ex_gst ?? c.subtotal ?? 0);
    const inc = Number(c.subtotal_inc_gst ?? Math.round(ex * 1.1 * 100) / 100);
    if (!(inc > 0)) continue;
    const name = c.name || String(c.number ?? "");
    rows.push({
      name,
      subtotal_ex_gst: ex,
      subtotal_inc_gst: inc,
      CATEGORY_NAME: name,
      CATEGORY_SUBTOTAL_EX_GST: fmtAud(ex),
      CATEGORY_COST_GST: fmtAud(inc)
    });
  }
  return rows;
}

// Local fallback — PC/PS from the explicit Allowance flag only (Buildxact is the source of truth).
function buildPcFromParsed(parsed) {
  const out = [];
  for (const cat of parsed.categories || []) {
    for (const it of cat.active_items || []) {
      const allow = String(it.allowance || "").toUpperCase();
      if (allow !== "PC" && allow !== "PS") continue;
      const amount = Number(it.total_inc_gst ?? it.total ?? 0);
      out.push({
        PC_DESCRIPTION: String(it.description || "").trim(),
        PC_AMOUNT: `${allow} sum of ${fmtAud(amount)}`
      });
    }
  }
  return out;
}

/** Merge Buildexact parse payload into editable proposal shape. */
export function mergeParsedToProposal(parsed, quoteSeq) {
  const base = emptyProposal();
  // Mirror the Buildxact quote number (Q1196 → "Quote 1196"); fall back to the internal sequence.
  const bxNum = String(parsed.quote_number || "").replace(/^Q/i, "").trim();
  const qn = bxNum ? `Quote ${bxNum}` : quoteSeq != null ? `Quote ${quoteSeq}` : "";
  const floor = parsed.cost_metrics?.floor_area_m2;
  return {
    ...base,
    quote_number: qn,
    address: parsed.address || "",
    client_name: parsed.client_name || "",
    client_salutation: salutationFromClientName(parsed.client_name),
    building_type: parsed.building_type || "",
    arch_ref: parsed.arch_ref != null ? String(parsed.arch_ref) : "",
    eng_ref: parsed.eng_ref != null ? String(parsed.eng_ref) : "",
    floor_area_m2: floor != null ? String(floor) : base.floor_area_m2,
    date: parsed.date_prepared || base.date,
    net_total: parsed.net_total || 0,
    markup_percent: parsed.markup_percent || 0,
    markup_amount: parsed.markup_amount || 0,
    tax_amount: parsed.tax || 0,
    total_inc_gst: parsed.estimate_total || 0,
    categories: parsed.categories || [],
    // Prefer the server-enriched transform (PC/PS from Allowance, $0-dropped summary, import-driven
    // inclusions with Builders Warranty pinned); fall back to local builders only if absent.
    SUMMARY_ROWS: parsed.summary_rows?.length ? parsed.summary_rows : buildSummaryFromParsed(parsed),
    inclusion_sections: parsed.inclusion_sections?.length ? parsed.inclusion_sections : cloneDefaultInclusionSections(),
    pc_sums: parsed.pc_sums?.length ? parsed.pc_sums : buildPcFromParsed(parsed),
    exclusions: cloneDefaultExclusions()
  };
}
