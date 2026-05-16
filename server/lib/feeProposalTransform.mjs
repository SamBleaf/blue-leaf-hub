const PC_RE = /\b(pc\s*sum|provisional\s*sum|allowance)\b/i;

function titleCaseSentence(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/**
 * Build inclusion sections for docxtemplater from parsed categories.
 * @param {{ categories?: { name?: string, number?: number, active_items?: { description?: string }[] }[] }} parsed
 */
export function buildInclusionSectionsFromParse(parsed) {
  const sections = [];
  for (const cat of parsed.categories || []) {
    const items = [];
    for (const it of cat.active_items || []) {
      const d = titleCaseSentence(it.description);
      if (!d) continue;
      items.push({ ITEM_TEXT: d });
    }
    if (items.length) {
      sections.push({
        SECTION_HEADING: cat.name || `Category ${cat.number}`,
        SECTION_ITEMS: items
      });
    }
  }
  return sections;
}

export function extractPcSumsFromParse(parsed) {
  const out = [];
  for (const cat of parsed.categories || []) {
    for (const it of cat.active_items || []) {
      const desc = String(it.description || "");
      if (PC_RE.test(desc) || /\ballowance\b/i.test(desc)) {
        out.push({
          PC_DESCRIPTION: desc.trim(),
          PC_AMOUNT: formatCurrencyAud(it.total || 0)
        });
      }
    }
  }
  return out;
}

export function buildSummaryRowsFromParse(parsed) {
  return (parsed.categories || []).map((c) => {
    const ex = Number(c.subtotal_ex_gst ?? c.subtotal ?? 0);
    const inc = Number(c.subtotal_inc_gst ?? Math.round(ex * 1.1 * 100) / 100);
    return {
      CATEGORY_NAME: c.name || String(c.number),
      CATEGORY_COST_GST: formatCurrencyAud(inc)
    };
  });
}

export function formatCurrencyAud(n) {
  const x = Number(n) || 0;
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(x);
}

export function salutationFromClientName(name) {
  const n = String(name || "").trim();
  if (!n) return "";
  return n.replace(/\s+&\s+/g, " and ").replace(/\s+/g, " ");
}

export const DEFAULT_EXCLUSIONS = [
  "Not included is relocation of the existing meter box if required. Can provide PC sum if necessary",
  "Asbestos identification, testing, removal or remediation",
  "Rock excavation, hammering or blasting",
  "Removal, relocation or rectification of unknown or undocumented services",
  "Latent site conditions including unsuitable soil, groundwater or concealed structural defects",
  "Existing termite damage, treatment or rectification works",
  "Traffic control or council permits",
  "Authority fees, SA Water fees, service upgrade costs or utility provider charges",
  "Surveying, engineering redesign, architectural redesign or consultant variations after contract execution",
  "Client-requested design changes or variations after tender submission",
  "Landscaping, planting and irrigation unless noted",
  "Escalation in material pricing or supplier increases beyond tender validity period (30 days)",
  "Unforeseen structural rectification works to existing building elements"
];

export const DEFAULT_FEE_SCHEDULE = [
  { STAGE_CLAIM: "Deposit", MILESTONE: "Deposit", PERCENTAGE: "5%" },
  { STAGE_CLAIM: "Progress Payment 1", MILESTONE: "Slab", PERCENTAGE: "20%" },
  { STAGE_CLAIM: "Progress Payment 2", MILESTONE: "Wall and roof frames", PERCENTAGE: "30%" },
  { STAGE_CLAIM: "Progress Payment 3", MILESTONE: "Lock up", PERCENTAGE: "20%" },
  { STAGE_CLAIM: "Progress Payment 4", MILESTONE: "Internal linings", PERCENTAGE: "15%" },
  { STAGE_CLAIM: "Progress Payment 5", MILESTONE: "Joinery", PERCENTAGE: "10%" },
  { STAGE_CLAIM: "Progress Payment 6", MILESTONE: "Practical completion", PERCENTAGE: "10%" }
];

export const DEFAULT_NEXT_STEPS = `We will prepare contract documentation and coordinate consultant reviews. Please advise of any queries on this fee proposal within 14 days.`;

export const DEFAULT_OPENING = `Thank you for the opportunity to provide this fee proposal for your project. The following summarises our scope, inclusions, and fee structure.`;

/**
 * Map parsed Buildexact → proposal JSON for UI + docxtemplater.
 */
export function parsedToProposalDraft(parsed, opts = {}) {
  const seq = opts.quoteSeq != null ? String(opts.quoteSeq) : "";
  const quote_number = seq ? `Quote ${seq}` : parsed.quote_number || "";
  const total_inc_gst = parsed.estimate_total || 0;
  return {
    quote_number,
    address: parsed.address || "",
    client_name: parsed.client_name || "",
    client_salutation: salutationFromClientName(parsed.client_name),
    architect_name: "",
    building_type: parsed.building_type || "",
    arch_ref: "",
    eng_ref: "",
    spec_ref: "TENDER",
    date: parsed.date_prepared || new Date().toLocaleDateString("en-AU"),
    net_total: parsed.net_total,
    markup_percent: parsed.markup_percent,
    markup_amount: parsed.markup_amount,
    tax_amount: parsed.tax,
    total_inc_gst,
    signatories: "Joshua Manning and Sam Morris",
    opening_paragraph: DEFAULT_OPENING,
    next_steps: DEFAULT_NEXT_STEPS,
    categories: parsed.categories || [],
    SUMMARY_ROWS: buildSummaryRowsFromParse(parsed),
    inclusion_sections: [],
    pc_sums: extractPcSumsFromParse(parsed),
    optional_items: [],
    exclusions: [...DEFAULT_EXCLUSIONS],
    fee_schedule: DEFAULT_FEE_SCHEDULE.map((r) => ({ ...r }))
  };
}

/**
 * Shape for docxtemplater render().
 */
export function proposalToDocxData(p) {
  const exclusions = (p.exclusions || []).map((e) => ({
    EXCLUSION_TEXT: typeof e === "string" ? e : e.EXCLUSION_TEXT || ""
  }));
  const opt = (p.optional_items || []).map((o) => ({
    OPTION_DESCRIPTION: o.OPTION_DESCRIPTION || o.description || "",
    OPTION_PRICE: o.OPTION_PRICE || o.price || ""
  }));
  const summary =
    (p.SUMMARY_ROWS && p.SUMMARY_ROWS.length
      ? p.SUMMARY_ROWS
      : (p.categories || []).map((c) => ({
          CATEGORY_NAME: c.name || String(c.number),
          CATEGORY_COST_GST: formatCurrencyAud((c.subtotal || 0) * 1.1)
        }))) || [];
  const inc =
    p.inclusion_sections && p.inclusion_sections.length
      ? p.inclusion_sections
      : buildInclusionSectionsFromParse({
          categories: p.categories || []
        });
  const pc = p.pc_sums && p.pc_sums.length ? p.pc_sums : extractPcSumsFromParse({ categories: p.categories || [] });
  const fee = p.fee_schedule?.length ? p.fee_schedule : DEFAULT_FEE_SCHEDULE;

  return {
    QUOTE_NUMBER: p.quote_number || "",
    PROJECT_ADDRESS: p.address || "",
    DATE: p.date || "",
    CLIENT_SALUTATION: p.client_salutation || p.client_name || "",
    ARCH_REF: p.arch_ref || "",
    ENG_REF: p.eng_ref || "",
    SPEC_REF: p.spec_ref || "",
    TOTAL_INC_GST: formatCurrencyAud(p.total_inc_gst || 0),
    SIGNATORIES: p.signatories || "",
    OPENING_PARAGRAPH: p.opening_paragraph || "",
    NEXT_STEPS: p.next_steps || "",
    SUMMARY_ROWS: summary,
    TOTAL_COST_GST: formatCurrencyAud(p.total_inc_gst || 0),
    OPTIONAL_ITEMS: opt,
    FEE_SCHEDULE: fee.map((r) => ({
      STAGE_CLAIM: r.STAGE_CLAIM || r.stage || "",
      MILESTONE: r.MILESTONE || r.milestone || "",
      PERCENTAGE: r.PERCENTAGE || r.percentage || ""
    })),
    INCLUSION_SECTIONS: inc.map((sec) => ({
      SECTION_HEADING: sec.SECTION_HEADING || sec.section_heading || "",
      SECTION_ITEMS: (sec.SECTION_ITEMS || sec.section_items || []).map((it) => ({
        ITEM_TEXT: it.ITEM_TEXT || it.item_text || ""
      }))
    })),
    PC_SUMS: pc.map((x) => ({
      PC_DESCRIPTION: x.PC_DESCRIPTION || x.pc_description || "",
      PC_AMOUNT: x.PC_AMOUNT || x.pc_amount || ""
    })),
    EXCLUSIONS: exclusions
  };
}
