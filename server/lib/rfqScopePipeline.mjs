/**
 * RFQ scope cleaning + structured normalisation + send-readiness checks.
 */
import { rulesForTrade } from "./rfqTradeExtractionRules.mjs";

const STANDARD_REF_PATTERNS = [
  /\bAS\/NZS\s*[\d]+(?:\.[\d]+)?\b/gi,
  /\bAS\s*[\d]+(?:\.[\d]+){0,2}\b/gi
];

const SITE_CONTEXT_PATTERNS = [
  /\bexisting\s+(site|structure|dwelling|house)\b/i,
  /\bdemolition\b/i,
  /\bsite\s+(slope|access|fall|constraint)\b/i,
  /\bretaining\b/i,
  /\bbenchmark\b/i,
  /\bgeotech/i,
  /\bneighbour/i,
  /\bworking\s+hours\b/i,
  /\bexisting\s+services\b/i,
  /\baccess\s+restriction/i,
  /\brl\s*[~≈]?\s*\d/i,
  /\bsite\s+classification\b/i
];

const ADMIN_PATTERNS = [
  /\bsite\s+visit\b/i,
  /\bfor\s+information\s+only\b/i,
  /\battached\s+for\s+information\b/i,
  /\ballowance\s+to\s+be\s+made\s+for\s+unspecified\b/i
];

function normKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fuzzy dedupe: normalise verbs/objects so near-duplicates collapse. */
function fuzzyLineKey(line) {
  let k = normKey(line);
  k = k.replace(/\b(as per|per|to)\s+(structural|engineer|architect|drawings?|details?|specs?)\b/g, " per drawings ");
  k = k.replace(/\b(footings?|footing)\b/g, " footing ");
  k = k.replace(/\b(slabs?|slab)\b/g, " slab ");
  return k;
}

export function emptyStructuredTradeNote() {
  return {
    project_information: [],
    scope_of_works: [],
    confirm_items: [],
    assumptions: [],
    tender_requirements: [],
    submission_requirements: [],
    standards: [],
    missing_items: [],
    scope_summary: "",
    specific_items: [],
    missing_info: ""
  };
}

function linesFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  if (/[•\u2022]/.test(raw)) {
    const segs = raw.split(/\s*[•\u2022]\s+/).map((l) => l.trim()).filter(Boolean);
    if (segs.length > 1) return segs;
  }
  return raw
    .split(/\n+/)
    .map((l) => l.replace(/^[\s•*-]+/, "").trim())
    .filter(Boolean);
}

function splitRunOnParagraph(line) {
  const s = String(line).trim();
  if (s.length < 120) return [s];
  const parts = s.split(/(?<=[.;])\s+(?=[A-Z])/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 12);
}

function extractStandardRefs(text) {
  const found = [];
  const seen = new Set();
  for (const re of STANDARD_REF_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const norm = m[0].replace(/\s+/g, " ").trim();
      const key = norm.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        found.push(norm);
      }
    }
  }
  return found;
}

function isSiteContextLine(line) {
  const s = String(line).trim();
  if (!s) return false;
  if (SITE_CONTEXT_PATTERNS.some((re) => re.test(s))) return true;
  if (ADMIN_PATTERNS.some((re) => re.test(s))) return true;
  if (/\b\d+\s*m[²2]\b/i.test(s) && !/\b(price|supply|install|excavat|pour)\b/i.test(s)) return true;
  return false;
}

function lineMatchesTrade(line, tradeId) {
  const rules = rulesForTrade(tradeId);
  const lower = line.toLowerCase();
  if (rules.ignore?.some((k) => lower.includes(k))) return false;
  if (!rules.keywords?.length) return true;
  return rules.keywords.some((k) => lower.includes(k));
}

function dedupeLines(lines, max = 12) {
  const out = [];
  const seen = new Set();
  for (const raw of lines) {
    for (const part of splitRunOnParagraph(raw)) {
      let t = part.replace(/\bFurthermore\b[,;:]?\s*/gi, "").replace(/^Ensure that\s+/i, "").trim();
      if (!t || t.length < 8) continue;
      const key = fuzzyLineKey(t);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
      if (out.length >= max) break;
    }
    if (out.length >= max) break;
  }
  return out;
}

function consolidateStandards(refs) {
  const unique = [...new Set(refs.map((r) => r.replace(/\s+/g, " ").trim()).filter(Boolean))];
  if (!unique.length) return [];
  return [`All works to comply with ${unique.join(", ")} and relevant Australian Standards.`];
}

function stripStandardsFromLines(lines) {
  const refs = [];
  const out = [];
  for (const line of lines) {
    const found = extractStandardRefs(line);
    if (found.length) refs.push(...found);
    const stripped = line
      .replace(/\b(AS\/NZS|AS)\s*[\d.]+[^.;]*/gi, "")
      .replace(/\bcomply\s+with\s+AS[^.;]*/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (stripped.length > 10 && !/^(as per|per)\s*$/i.test(stripped)) out.push(stripped);
  }
  return { lines: out, refs };
}

export function normalizeStructuredTradeNote(raw) {
  const base = emptyStructuredTradeNote();
  if (!raw || typeof raw !== "object") return base;

  const pullArr = (k) => {
    if (Array.isArray(raw[k])) return raw[k].map(String).map((s) => s.trim()).filter(Boolean);
    return [];
  };

  let scope = pullArr("scope_of_works");
  if (!scope.length) scope = linesFromText(raw.scope_summary);
  if (!scope.length && Array.isArray(raw.specific_items)) scope = raw.specific_items.map(String).filter(Boolean);

  base.project_information = pullArr("project_information");
  base.confirm_items = pullArr("confirm_items");
  base.assumptions = pullArr("assumptions");
  base.tender_requirements = pullArr("tender_requirements");
  base.submission_requirements = pullArr("submission_requirements");
  base.missing_items = pullArr("missing_items");
  if (!base.missing_items.length && raw.missing_info) {
    base.missing_items = String(raw.missing_info)
      .split(/[;,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const stdFromField = pullArr("standards");
  const { lines: scopeNoStd, refs } = stripStandardsFromLines(scope);
  base.scope_of_works = scopeNoStd;
  base.standards = stdFromField.length ? stdFromField : consolidateStandards(refs);

  return base;
}

/**
 * Clean one trade note: dedupe, trade filter, move site context, single standards block.
 */
export function processTradeNote(note, tradeId, projectContext = {}) {
  const structured = normalizeStructuredTradeNote(note);
  const rules = rulesForTrade(tradeId);

  let scope = dedupeLines([...structured.scope_of_works, ...(note?.specific_items || [])], 10);
  const assumptions = dedupeLines([...structured.assumptions, ...projectContext.assumptions_site_conditions || []], 8);
  const projectInfo = dedupeLines(structured.project_information, 4);

  const toAssumptions = [];
  const scopeKept = [];
  for (const line of scope) {
    if (isSiteContextLine(line)) toAssumptions.push(line);
    else if (lineMatchesTrade(line, tradeId)) scopeKept.push(line);
    else if (!rules.keywords?.length) scopeKept.push(line);
  }

  const allAssumptions = dedupeLines([...assumptions, ...toAssumptions], 8);
  const { lines: scopeClean, refs } = stripStandardsFromLines(scopeKept);
  const standards = structured.standards?.length
    ? structured.standards.slice(0, 1)
    : consolidateStandards([...extractStandardRefs(note?.scope_summary || ""), ...refs]);

  const tenderReq = dedupeLines(
    structured.tender_requirements.length
      ? structured.tender_requirements
      : ["Price lump sum ex GST", "Confirm lead time and availability"],
    6
  );
  const submitReq = dedupeLines(
    structured.submission_requirements.length
      ? structured.submission_requirements
      : ["List exclusions clearly in writing", "Include insurance certificates if requested"],
    5
  );

  const missing_items = dedupeLines(structured.missing_items, 6);

  const scope_summary = scopeClean.join("\n");

  return {
    ...structured,
    project_information: projectInfo,
    scope_of_works: scopeClean,
    assumptions: allAssumptions,
    tender_requirements: tenderReq,
    submission_requirements: submitReq,
    standards,
    missing_items,
    scope_summary,
    specific_items: scopeClean,
    missing_info: missing_items.join("; ")
  };
}

export function normalizeProjectContext(raw) {
  const assumptions = [];
  if (Array.isArray(raw?.assumptions_site_conditions)) {
    assumptions.push(...raw.assumptions_site_conditions.map(String).filter(Boolean));
  }
  if (raw?.site_conditions) assumptions.push(String(raw.site_conditions).trim());
  return {
    project_information: Array.isArray(raw?.project_information)
      ? raw.project_information.map(String).filter(Boolean)
      : [],
    assumptions_site_conditions: dedupeLines(assumptions, 12)
  };
}

/** Process full extraction object after AI merge. */
export function processExtraction(extraction, tradeIds = null) {
  const ex = extraction && typeof extraction === "object" ? extraction : {};
  const ids =
    tradeIds ||
    Object.keys(ex.trade_notes || {}).filter((k) => ex.trade_notes[k]);
  const projectContext = normalizeProjectContext(ex.project_context || {});

  if (ex.key_project_notes) {
    for (const line of linesFromText(ex.key_project_notes)) {
      if (isSiteContextLine(line)) projectContext.assumptions_site_conditions.push(line);
    }
    projectContext.assumptions_site_conditions = dedupeLines(projectContext.assumptions_site_conditions, 12);
  }

  const trade_notes = {};
  for (const tid of ids) {
    trade_notes[tid] = processTradeNote(ex.trade_notes?.[tid] || {}, tid, projectContext);
  }

  return {
    ...ex,
    project_context: projectContext,
    trade_notes,
    coverage_gaps: dedupeLines(ex.coverage_gaps || [], 5)
  };
}

/** Pre-send readiness for selected trades. */
export function validateRfqReadiness({
  selectedTradeIds,
  tradeRecipients,
  tradeNotes,
  tradeConfigById
}) {
  const issues = [];
  const tradeChecks = [];

  for (const tradeId of selectedTradeIds) {
    const config = tradeConfigById?.[tradeId] || {};
    const note = tradeNotes?.[tradeId] || {};
    const recipients = tradeRecipients?.[tradeId] || [];
    const scopeLines = note.scope_of_works?.length
      ? note.scope_of_works
      : linesFromText(note.scope_summary);
    const missing = [];

    if (!config.trade_id && !config.trade_name) missing.push("Not in trade library");
    if (!scopeLines.length) missing.push("No scope generated");
    if (!config.email_opener) missing.push("No email template");
    if (!recipients.length) missing.push("No recipients selected");
    if ((note.missing_items || []).length && !scopeLines.length) missing.push("Missing info — add scope manually");

    const ready = missing.length === 0;
    tradeChecks.push({
      trade_id: tradeId,
      trade_label: config.trade_name || tradeId,
      ready,
      missing,
      scope_count: scopeLines.length,
      recipient_count: recipients.length
    });
    if (!ready) issues.push(...missing.map((m) => `${config.trade_name || tradeId}: ${m}`));
  }

  const denom = tradeChecks.length || 1;
  const readyCount = tradeChecks.filter((t) => t.ready).length;
  const percent = Math.round((readyCount / denom) * 100);

  return {
    percent,
    ready: percent === 100,
    trades: tradeChecks,
    issues
  };
}

export function bulletsFromStructuredNote(note) {
  const n = normalizeStructuredTradeNote(note);
  return dedupeLines([...n.scope_of_works, ...n.specific_items], 14);
}
