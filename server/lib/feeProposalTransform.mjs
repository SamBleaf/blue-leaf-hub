import { getBuildexactCategoryMapping, parseCostMetrics } from "./buildexactParser.mjs";

// Common Buildxact-estimator misspellings → corrected (word-boundary, case-insensitive).
const SCOPE_SPELLING = [
  [/\bmasonary\b/gi, "masonry"],
  [/\bsanity\s+ware\b/gi, "sanitaryware"],
  [/\bwidows\b/gi, "windows"],
  [/\bpendent\b/gi, "pendant"],
  [/\bscorpian\b/gi, "scorpion"],
  [/\bdissemble\b/gi, "disassemble"]
];
// Estimator pricing/unit shorthand to strip from client-facing bullets.
const SCOPE_STRIP = [
  /\s*\bpc\s+per\s+[a-z/0-9 ]+/gi,   // "pc per point/fixture", "pc per m2"
  /\s*\bpc\s*pm2\b/gi,
  /\s*\bper\s+lm\b/gi,
  /\s*\bday\s*rate\b/gi,
  /\s*\(\s*lm[^)]*\)/gi,             // "(lm per level)", "( lm)"
  /\s*\(\s*\d+%\s*\)/g,              // "(2%)"
  /\s*\bat\s+\d+\s*centres\b/gi      // "at 300 centres"
];
// Proper nouns / standards to re-capitalise AFTER sentence-casing.
const SCOPE_PROPER = [
  [/\bnathers\b/gi, "NatHERS"],
  [/\bcolorbond\b/gi, "COLORBOND"],
  [/\bc\/bond\b/gi, "COLORBOND"],
  [/\blosp\b/gi, "LOSP"],
  [/\blvl\b/gi, "LVL"],
  [/\bpvc\b/gi, "PVC"],
  [/\bwhs\b/gi, "WHS"],
  [/\bled\b/gi, "LED"],
  [/\bmpa\b/gi, "MPa"],
  [/\br(\d(?:\.\d)?)\b/gi, (_m, n) => "R" + n]   // r2.5 → R2.5
];

function titleCaseSentence(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);   // first char up, preserve the rest
}

// Turn a raw Buildxact line into a client-ready scope bullet: fix typos, strip PC/PS markers + inline
// $ amounts + estimator pricing shorthand, collapse a trailing "labour"/"supply" tag (so the pair
// de-dupes to one bullet), sentence-case to tame ALL-CAPS, then re-capitalise known proper nouns.
// The wizard stays editable for final polish.
function cleanScopeText(desc) {
  let d = String(desc || "").trim();
  for (const [re, to] of SCOPE_SPELLING) d = d.replace(re, to);
  d = d.replace(/\s*\$\s?[\d,]+(?:\.\d+)?\b/g, "");          // inline "$2000"
  d = d.replace(/\s*\(?\bps\b\)?\s*\(?\s*pm2\s*\)?/i, " ");  // "PS (pm2)"
  for (const re of SCOPE_STRIP) d = d.replace(re, "");
  // Strip a trailing run of estimator tags (labour / supply / PC / PS / (PC)) — looped so combined
  // tails like "… supply (PC)" or "… labour PC" fully collapse; the labour/supply pair then de-dupes.
  let prev;
  do { prev = d; d = d.replace(/\s*[-–(]?\s*\b(labour|supply|pc|ps)\b\)?\s*$/i, "").trim(); } while (d !== prev);
  d = d.replace(/\s{2,}/g, " ").trim();
  d = d ? d.charAt(0).toUpperCase() + d.slice(1).toLowerCase() : d; // sentence case
  for (const [re, to] of SCOPE_PROPER) d = d.replace(re, to);
  return d.trim();
}

// Client-facing relabels for internal Buildxact trade-role category names.
const CLIENT_CATEGORY_LABEL = {
  "Roof Plumber": "Roofing",
  Tiler: "Tiling",
  "Site Cleaner": "Site Cleaning",
  "Outdoor works supply": "Outdoor Works"
};
// Canonical display name for a category, with client-friendly relabels + typo correction.
function displayCategoryName(name) {
  let raw = String(name || "").trim();
  if (!raw) return "";
  for (const [re, to] of SCOPE_SPELLING) raw = raw.replace(re, to); // fix typos in headings too (Masonary → masonry)
  const canon = getBuildexactCategoryMapping(raw)?.name || raw;
  return CLIENT_CATEGORY_LABEL[canon] || CLIENT_CATEGORY_LABEL[raw] || canon;
}

// Fixed block pinned to the top of every proposal's Inclusions (per Sam — builders warranty is constant).
export const BUILDERS_WARRANTY_SECTION = {
  SECTION_HEADING: "Builders Warranty",
  SECTION_ITEMS: [
    { ITEM_TEXT: "5 Year builders warranty" },
    { ITEM_TEXT: "10 Year structural warranty" },
    { ITEM_TEXT: "6 month maintenance/defect period" }
  ]
};

/**
 * Build inclusion sections for docxtemplater from the IMPORT categories — Builders Warranty pinned
 * first, then one section per category with cleaned bullets (markers/amounts stripped, meta rows
 * dropped). Phase 5b will blend RFQ scope bullets into each category.
 * @param {{ categories?: { name?: string, number?: number, active_items?: { description?: string }[] }[] }} parsed
 */
export function buildInclusionSectionsFromParse(parsed) {
  const sections = [{
    SECTION_HEADING: BUILDERS_WARRANTY_SECTION.SECTION_HEADING,
    SECTION_ITEMS: BUILDERS_WARRANTY_SECTION.SECTION_ITEMS.map((i) => ({ ...i }))
  }];
  for (const cat of parsed.categories || []) {
    const heading = displayCategoryName(cat.name) || `Category ${cat.number}`;
    if (heading === BUILDERS_WARRANTY_SECTION.SECTION_HEADING) continue; // don't duplicate the pinned warranty
    const items = [];
    const seen = new Set();
    for (const it of cat.active_items || []) {
      const raw = String(it.description || "");
      if (/COST\s+METRIC/i.test(raw) || /\bSCHED\b/i.test(raw)) continue; // skip meta rows (cost metrics, schedule)
      const d = cleanScopeText(raw);                                      // client-ready bullet
      const k = d.toLowerCase();
      if (!d || seen.has(k)) continue;                                    // de-dupe (collapses labour/supply pairs)
      seen.add(k);
      items.push({ ITEM_TEXT: d });
    }
    if (items.length) sections.push({ SECTION_HEADING: heading, SECTION_ITEMS: items });
  }
  return sections;
}

const normaliseBullet = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Phase 5b — blend the polished RFQ scope into the import-derived inclusion sections.
// `scopeByCategory` is a Map(canonicalCategoryName → bullet[]). For each section we put the RFQ
// scope bullets first (they're the considered, client-ready scope), then append any import line
// items not already covered. De-dupes on normalised text so scope + estimate don't repeat.
export function mergeRfqScopeIntoInclusions(sections, scopeByCategory) {
  if (!scopeByCategory || !scopeByCategory.size) return sections;
  return (sections || []).map((sec) => {
    const canon = displayCategoryName(sec.SECTION_HEADING);
    const bullets = scopeByCategory.get(canon) || scopeByCategory.get(sec.SECTION_HEADING);
    if (!bullets || !bullets.length) return sec;
    const seen = new Set();
    const merged = [];
    for (const b of bullets) {
      const t = cleanScopeText(b);
      const k = normaliseBullet(t);
      if (!t || seen.has(k)) continue;
      seen.add(k);
      merged.push({ ITEM_TEXT: t });
    }
    for (const it of sec.SECTION_ITEMS || []) {
      const k = normaliseBullet(it.ITEM_TEXT);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(it);
    }
    return { SECTION_HEADING: sec.SECTION_HEADING, SECTION_ITEMS: merged };
  });
}

// PC/PS come ONLY from Buildxact's explicit Allowance flag (per Sam's decision — Buildxact is the
// single source of truth). The report export has no Allowance column, so PC/PS auto-fill requires the
// estimateitems export; a report-format upload yields an empty PC/PS section to be filled manually.
export function extractPcSumsFromParse(parsed) {
  const out = [];
  for (const cat of parsed.categories || []) {
    for (const it of cat.active_items || []) {
      const allow = String(it.allowance || "").toUpperCase();
      if (allow !== "PC" && allow !== "PS") continue;
      const amount = Number(it.total_inc_gst ?? it.total ?? 0);
      out.push({
        PC_DESCRIPTION: cleanScopeText(it.description),
        PC_AMOUNT: `${allow} sum of ${formatCurrencyAud(amount)}`
      });
    }
  }
  return out;
}

export function buildSummaryRowsFromParse(parsed) {
  const rows = [];
  for (const c of parsed.categories || []) {
    const ex = Number(c.subtotal_ex_gst ?? c.subtotal ?? 0);
    const inc = Number(c.subtotal_inc_gst ?? Math.round(ex * 1.1 * 100) / 100);
    if (!(inc > 0)) continue; // drop $0 categories (Garage Door, Appliances, Glazing… padded Q1209)
    rows.push({
      CATEGORY_NAME: displayCategoryName(c.name) || String(c.number),
      CATEGORY_COST_GST: formatCurrencyAud(inc)
    });
  }
  return rows;
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
  // Mirror the Buildxact quote number (Q1196 → "Quote 1196") per Sam's decision; fall back to the
  // internal sequence only when the estimate carries no number of its own.
  const bxNum = String(parsed.quote_number || "").replace(/^Q/i, "").trim();
  const seq = opts.quoteSeq != null ? String(opts.quoteSeq) : "";
  const quote_number = bxNum ? `Quote ${bxNum}` : seq ? `Quote ${seq}` : "";
  const total_inc_gst = parsed.estimate_total || 0;
  const metrics = parseCostMetrics(parsed.categories || []);
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
    floor_area_m2: metrics.floor_area_m2 != null ? metrics.floor_area_m2 : "",
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
    p.SUMMARY_ROWS && p.SUMMARY_ROWS.length
      ? p.SUMMARY_ROWS
      : buildSummaryRowsFromParse({ categories: p.categories || [] }); // $0-dropped, exact inc-GST (no *1.1)
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

// ─── APB-Balanced version (dual-output) ───────────────────────────────────────
// Static, write-once sales content for the APB-styled proposal, drawn from the APB "Creating
// Professional Contract Proposals" methodology and BLB's own assets (the client portal, APB
// membership, licence BLD 332830). Every block is overridable per-proposal via p.apb.* — these are
// the defaults the APB template renders until Sam customises them.
export const APB_CONTENT = {
  NICHE_STATEMENT: "Adelaide's boutique builder — custom new builds & bespoke renovations",
  WHY_BUILD_WITH_US:
    "Blue Leaf Building is a boutique Adelaide construction company delivering high-quality custom new builds and bespoke renovations. Founded by directors Joshua Manning and Sam Morris — who began as a high-end carpentry company and grew into a full-scale builder — we're recognised for craftsmanship, collaboration and innovation, and recommended by highly regarded architects for making the building journey seamless and rewarding.\n\nWhat sets us apart is what comes standard:\n\n• LVL stud frames as standard — laminated veneer lumber for perfectly straight, true walls, H2 termite-resistant and engineered from sustainably harvested timber. Stronger, more durable and more stable than conventional pine framing, at no additional cost.\n\n• Energy efficiency & comfort as standard — world-leading sealing membranes, vented cavity systems and double glazing included on every home (the same technology used in the world's most energy-efficient homes). The result: healthier indoor air, lower power bills, a quieter home, and a longer building life — at no extra cost.\n\n• Personalised service & involvement — we take on only a limited number of projects each year, with weekly site meetings to keep you involved and informed throughout. The result isn't just a house; it's a home that truly reflects you.",
  ONLINE_PM_BODY:
    "Every Blue Leaf client receives a login to the Blue Leaf client portal. From any device, anywhere, you can watch progress photos as your home takes shape, follow your live construction schedule and see exactly what's happening next, make and confirm your selections with prices locked in, read every communication and approval in one place, and track your budget and any variations. With 24/7 access you'll always feel up to speed — and you can share the journey with family and friends.",
  CONSTRUCTION_SCHEDULE_INTRO:
    "Your project is scheduled for completion within approximately [ADD WEEKS] weeks from the commencement of construction. We guarantee adherence to this timeframe by closely monitoring your personalised construction schedule, which you follow live in your portal from slab through to practical completion.",
  VARIATIONS_CLAUSE:
    "Variations are charged at cost price, plus a 25% builder's margin. Every variation is approved by you in writing before any additional work is carried out — so there are no surprises at the end.",
  SUMMARY_BODY:
    "Thank you for the opportunity to provide this proposal. We've valued the time spent together on your project and believe the rapport we've built will make for a rewarding experience and a result you'll love.\n\nShould you choose Blue Leaf Building, we'll take every step to exceed your expectations and guide you smoothly through the entire process. We look forward to bringing your new home to life.",
  GUARANTEES: [
    { GUARANTEE_HEADING: "10-Year Structural Warranty", GUARANTEE_TEXT: "We back the bones of your home for a full decade — well beyond the industry's 5-year standard — so you have long-term peace of mind that the core structure is protected." },
    { GUARANTEE_HEADING: "5-Year Non-Structural Warranty", GUARANTEE_TEXT: "We extend coverage on non-structural elements to 5 years, instead of the standard 2 — confidence in both form and function." },
    { GUARANTEE_HEADING: "Transferable Warranty", GUARANTEE_TEXT: "If you sell your home within the warranty period, the coverage transfers to the new owner — boosting resale value and protecting your investment." },
    { GUARANTEE_HEADING: "6-Month Defect Liability Period", GUARANTEE_TEXT: "Twice the standard — more time after moving in to live with your home and flag any issues, which we fix at no extra cost." },
    { GUARANTEE_HEADING: "Fixed Price", GUARANTEE_TEXT: "Outside your nominated PC and provisional-sum allowances, the contract price is fixed — the price you sign is the price you pay. Variations occur only with your written approval, charged at cost plus a 25% builder's margin." },
    { GUARANTEE_HEADING: "Direct Communication", GUARANTEE_TEXT: "You speak directly with your builder — Joshua or Sam — not a call centre. Weekly on-site meetings keep you across every step." }
  ],
  TESTIMONIALS: [
    { TESTIMONIAL_TEXT: "[Add a named client testimonial here]", TESTIMONIAL_AUTHOR: "[First name, Suburb — project type]" }
  ],
  LICENCES: [
    { LICENCE_TEXT: "Licensed Builder — BLD 332830" },
    { LICENCE_TEXT: "ABN 88 656 051 188" },
    { LICENCE_TEXT: "Member, Master Builders Association (MBA)" },
    { LICENCE_TEXT: "Member, Association of Professional Builders (APB)" }
  ],
  RESPONSIBILITIES_OURS: [
    "All construction works in accordance with the plans, specifications and the Building Code of Australia",
    "All local government fees and permits",
    "All insurances and Workplace Health & Safety requirements",
    "All hire fees and site establishment",
    "Prompt notification of any changes required to the design or material specifications"
  ],
  RESPONSIBILITIES_YOURS: [
    "Water and electricity connection and supply during construction",
    "Reasonable site access during the construction period",
    "Timely selection of all items in your selection schedule when prompted",
    "Prompt response to any questions or approvals required",
    "Timely payment of progress claims and approved variations"
  ]
};

// Render data for the APB-Balanced template: everything the original has, PLUS the new sales sections.
// Used by /api/fee-proposal/generate-docx when style==='apb'. Content falls back to APB_CONTENT.
export function proposalToApbDocxData(p) {
  const a = p && p.apb && typeof p.apb === "object" ? p.apb : {};
  return {
    ...proposalToDocxData(p),
    NICHE_STATEMENT: a.niche_statement || APB_CONTENT.NICHE_STATEMENT,
    WHY_BUILD_WITH_US: a.why_build_with_us || APB_CONTENT.WHY_BUILD_WITH_US,
    ONLINE_PM_BODY: a.online_pm || APB_CONTENT.ONLINE_PM_BODY,
    CONSTRUCTION_SCHEDULE_INTRO: a.construction_schedule || APB_CONTENT.CONSTRUCTION_SCHEDULE_INTRO,
    VARIATIONS_CLAUSE: a.variations || APB_CONTENT.VARIATIONS_CLAUSE,
    APB_SUMMARY_BODY: a.summary || APB_CONTENT.SUMMARY_BODY,
    GUARANTEES: Array.isArray(a.guarantees) ? a.guarantees : APB_CONTENT.GUARANTEES,
    TESTIMONIALS: Array.isArray(a.testimonials) ? a.testimonials : APB_CONTENT.TESTIMONIALS,
    LICENCES: Array.isArray(a.licences) ? a.licences : APB_CONTENT.LICENCES,
    RESPONSIBILITIES_OURS: (Array.isArray(a.responsibilities_ours) ? a.responsibilities_ours : APB_CONTENT.RESPONSIBILITIES_OURS).map((t) => ({ RESP_TEXT: t })),
    RESPONSIBILITIES_YOURS: (Array.isArray(a.responsibilities_yours) ? a.responsibilities_yours : APB_CONTENT.RESPONSIBILITIES_YOURS).map((t) => ({ RESP_TEXT: t }))
  };
}

// Scan an APB render object for unfilled [ADD …] / [INSERT …] tokens so generation can be BLOCKED
// before a templated bracket ever reaches a client (APB QC: never present a placeholder).
export function findApbPlaceholders(apbData) {
  const found = new Set();
  const walk = (v) => {
    if (typeof v === "string") {
      const m = v.match(/\[(?:add|insert)[^\]]*\]/gi);
      if (m) m.forEach((x) => found.add(x));
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(walk);
    }
  };
  walk(apbData);
  return [...found];
}
