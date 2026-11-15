/**
 * restrictedProducts.js — products Blue Leaf can't lawfully supply or install, checked before a document is issued.
 *
 * The check never rewrites what the client chose. It is deliberately conservative, because reading negation in free
 * text proved unreliable in two independent reviews ("Not laminate, engineered stone", "Final pick was engineered
 * stone" and "Engineered stone, changed to Calacatta" were all misread as not choosing it):
 *
 *   - BLOCKS a client-facing document: a live selection (itemKind "selection", not retained, removed, excluded, N/A or
 *     by others) whose printed fields (description, product, manufacturer, model, colour, supplier, source, chosen
 *     option labels) name engineered stone, or whose card option is engineered stone. Negation doesn't count: a
 *     selection names only what will be supplied ("Porcelain benchtop, 20 mm"); existing or removed stone goes on a
 *     record marked Retain or Remove, and the register's history keeps the original choice.
 *   - WARNS here: the same words anywhere else (a requirement such as "no engineered stone", the client's own note,
 *     retained or removed stone, the estimator's notes), and brands that also sell compliant ranges. The register's
 *     document check (registerDocChecks) then also stops a client-facing document that would PRINT the words, whatever
 *     the record (review rounds 1-5); the material of stone already installed is kept in an unprinted field.
 *
 * "Engineered stone" also matches common shorthand and misspellings (eng. stone, E-stone, engineerd, agglomerate,
 * engineered quartz). "Quartz" alone is ambiguous (a colour, a look, a sink, a brand), so it counts only as a bench
 * material: next to a bench word ("quartz island bench"), or alone on a bench record (benchtop, splashback, vanity top,
 * laundry bench) when the same field names no compliant material, and never in the colour field.
 *
 * Engineered stone: prohibited in Australia from 1 July 2024 (manufacture, supply, processing and installation).
 * South Australia's transitional arrangements have ended. Cement- and concrete-based "reconstituted" or
 * "manufactured" stone (veneers, retaining blocks, pavers), natural stone, porcelain and sintered stone are not
 * engineered stone. Reference below.
 */
const BENCH_WORDS = String.raw`bench(?:top)?s?|tops?|island|worktops?|surfaces?|slabs?|splashbacks?|vanity`;
// "quartz" that isn't a colour, a look, a finish, a sink or part of a brand name.
const QUARTZ = String.raw`(?<!(?:quantum|wk)[\s-]+)\bquartz\b(?![\s-]*(?:look|looks|looking|lookalike|look-alike|style|effect|finish|colou?r|grey|gray|tones?|toned|sinks?|crystals?)\b)`;

export const RESTRICTED_PRODUCTS = [
  {
    key: "engineered_stone",
    label: "Engineered stone",
    level: "error",
    rule: "Engineered stone is prohibited in Australia from 1 July 2024: it can't be manufactured, supplied, processed or installed.",
    reference: "https://www.safework.sa.gov.au/industry/construction/engineered-stone-prohibition",
    optionIds: ["engineered_stone"],
    // Unambiguous: engineered stone(s), its shorthand and misspellings, agglomerate stone, engineered or reconstituted quartz,
    // quartz stone or surface, and quartz within two words of a bench word. Engineered timber and quartzite don't match.
    pattern: new RegExp(String.raw`\b(?:engineered|engineerd|enginered|engeneered|engenered|enginneered|eng\.?|agglomerated?)[\s-]*(?:stones?|quartz)\b|\be[\s-]?stones?\b|\breconstituted\s+quartz\b|${QUARTZ}[\s-]+(?:[a-z0-9]+[\s-]+){0,2}?(?:${BENCH_WORDS})\b`, "i"),
    // Bare "quartz" on a bench record, when the same field names no compliant material.
    benchPattern: new RegExp(QUARTZ, "i"),
    compliant: /\b(porcelain|sintered|granite|marble|natural\s+stone|quartzite|laminate|timber|glass|concrete|terrazzo|solid\s+surface|corian|stainless|travertine|limestone|soapstone|dekton|neolith)\b/i,
  },
  {
    key: "engineered_stone_brand",
    label: "A brand that sells engineered stone",
    level: "warning",
    rule: "These brands have sold engineered stone; several now also sell compliant ranges. Confirm the product is a compliant range before it is supplied.",
    reference: "https://www.safework.sa.gov.au/industry/construction/engineered-stone-prohibition",
    optionIds: [],
    pattern: /\b(caesarstone|silestone|essastone|smartstone|quantum\s+quartz|stone\s+ambassador|wk\s+quartz|lithostone)\b/i,
  },
];

const BENCH_CATEGORIES = new Set(["benchtop", "splashback"]);
const BENCH_PROMPTS = new Set(["K-005", "K-006", "B-004", "L-003"]);
const BENCH_TEXT = new RegExp(String.raw`\b(?:${BENCH_WORDS})\b`, "i");
/** A selection that would be supplied (or installed) for this project: not existing, removed, outside the scope or by others. */
const isSupply = (item) => item?.itemKind === "selection" && !["retain", "remove", "excluded", "na", "by_others"].includes(item?.disposition);

const liveOptions = (item) => (item?.answer?.selected || []).filter((s) => !s?.stale);
/** Fields a client document can print, as [field, text]. The colour is printed but never read as a bare "quartz". */
const printedOf = (item) => [["description", item?.description], ["product", item?.product], ["manufacturer", item?.manufacturer], ["model", item?.model],
  ["colour", item?.colour], ["supplier", item?.supplier], ["source", item?.source], ...liveOptions(item).map((s) => ["option", s?.label])].filter(([, t]) => t).map(([f, t]) => [f, String(t)]);
/** Fields that don't print: the client's own note. */
const unprintedOf = (item) => [["clientNote", item?.answer?.clientNote]].filter(([, t]) => t).map(([f, t]) => [f, String(t)]);
const optionIdsOf = (item) => liveOptions(item).flatMap((s) => [s?.optionId, ...(Array.isArray(s?.path) ? s.path : [])]).filter(Boolean);

/** Does this [field, text] list name the product? Returns the first field that does, or null. */
function namedIn(product, fields, benchRecord) {
  for (const [field, text] of fields) {
    if (product.pattern.test(text)) return field;
    if (product.benchPattern && benchRecord && field !== "colour" && product.benchPattern.test(text) && !product.compliant.test(text)) return field;
  }
  return null;
}

/**
 * Every live register item that names a restricted product: [{ item, product, blocking, field }]. blocking is true
 * only when an error-level product is named in a printed field (or chosen on the card) of a selection that will be
 * supplied. Anything else that names one is reported with blocking false, so staff see it as a warning. Excluded and
 * N/A items are ignored.
 */
export function restrictedFindings(items) {
  const out = [];
  for (const item of items || []) {
    if (["excluded", "na"].includes(item?.disposition)) continue;
    const printed = printedOf(item), ids = optionIdsOf(item);
    const benchRecord = BENCH_CATEGORIES.has(item?.category) || BENCH_PROMPTS.has(item?.promptKey) || printed.some(([f, t]) => f !== "colour" && BENCH_TEXT.test(t));
    let found = null;
    for (const product of RESTRICTED_PRODUCTS) {
      const field = ids.some((id) => product.optionIds.includes(id)) ? "option" : namedIn(product, printed, benchRecord);
      const quiet = field ? null : namedIn(product, unprintedOf(item), benchRecord);
      if (!field && !quiet) continue;
      const f = { item, product, field: field || quiet, blocking: !!field && product.level === "error" && isSupply(item) };
      if (f.blocking) { found = f; break; }
      if (!found || (product.level === "error" && found.product.level !== "error")) found = f;
    }
    if (found) out.push(found);
  }
  return out;
}

/**
 * Error-level products named in a piece of free text: the product pattern, or bare "quartz" in a clause that names a
 * bench and no compliant material ("island top in white quartz"). The register's document check (registerDocChecks)
 * scans every string a document prints this way, and stops a client-facing document that would print one (review
 * rounds 1-6).
 */
export function restrictedInText(text) {
  const t = String(text || "");
  const clauses = t.split(/[;,.\n]|\s[-–—]\s/);
  return RESTRICTED_PRODUCTS.filter((p) => p.level === "error" && (p.pattern.test(t)
    || (p.benchPattern && clauses.some((c) => BENCH_TEXT.test(c) && p.benchPattern.test(c) && !p.compliant.test(c)))));
}

/**
 * Every printed field of a record (description, product, manufacturer, model, colour, supplier, source, chosen option)
 * that names an error-level product, as [{ product, field, text }]. The document check stops a client document whose
 * printed text contains one of them, whichever field it came from (review STONE4F-02).
 */
export function restrictedFieldsOf(item) {
  const printed = printedOf(item);
  const benchRecord = BENCH_CATEGORIES.has(item?.category) || BENCH_PROMPTS.has(item?.promptKey) || printed.some(([f, t]) => f !== "colour" && BENCH_TEXT.test(t));
  const out = [];
  for (const product of RESTRICTED_PRODUCTS.filter((p) => p.level === "error")) {
    for (const [field, text] of printed) if (namedIn(product, [[field, text]], benchRecord)) out.push({ product, field, text });
  }
  return out;
}
