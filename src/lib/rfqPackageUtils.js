/**
 * Read RFQ package API rows (camelCase from apiResponse.mjs).
 * Snake_case fallbacks retained for any legacy direct-Supabase reads.
 */

function pick(obj, ...keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && v !== "") return v;
  }
  return "";
}

function pickArr(obj, ...keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

export function packageJobId(pkg) {
  return pick(pkg, "jobId", "job_id") || null;
}

export function packageProjectAddress(pkg) {
  return pick(pkg, "projectAddress", "project_address") || "Unnamed project";
}

export function packageProjectType(pkg) {
  return pick(pkg, "projectType", "project_type");
}

export function packageTenderDeadline(pkg) {
  return pick(pkg, "tenderDeadline", "tender_deadline");
}

export function packageArchitectClient(pkg) {
  return pick(pkg, "architectClient", "architect_client");
}

export function packageDropboxUrl(pkg) {
  return pick(pkg, "dropboxUrl", "dropbox_url");
}

export function packageCreatedAt(pkg) {
  return pick(pkg, "createdAt", "created_at");
}

export function packageCoverageScore(pkg) {
  const tradeCoverage = packageTradeCoverage(pkg);
  if (tradeCoverage.percent != null) return Number(tradeCoverage.percent) || 0;
  const raw = pkg?.coverageScore ?? pkg?.coverage_score;
  return raw != null ? Number(raw) || 0 : 0;
}

export function packageTradeScopes(pkg) {
  return pickArr(pkg, "rfqTradeScopes", "rfq_trade_scopes");
}

export function packageAddenda(pkg) {
  return pickArr(pkg, "rfqAddenda", "rfq_addenda");
}

export function packageSuggestedTrades(pkg) {
  return pickArr(pkg, "suggestedTrades", "suggested_trades");
}

export function packageTradeCoverage(pkg) {
  return pkg?.tradeCoverage ?? pkg?.trade_coverage ?? {};
}

export function packageMissingTradeAnalysis(pkg) {
  return pickArr(pkg, "missingTradeAnalysis", "missing_trade_analysis");
}

export function scopeRecipients(scope) {
  return pickArr(scope, "rfqRecipients", "rfq_recipients");
}

export function scopeTradeLabel(scope) {
  return pick(scope, "tradeLabel", "trade_label");
}

export function scopeTradeId(scope) {
  return pick(scope, "tradeId", "trade_id");
}

export function scopeBullets(scope) {
  return pickArr(scope, "scopeBullets", "scope_bullets");
}

export function scopeDueDate(scope) {
  return pick(scope, "dueDate", "due_date");
}

export function scopeInternalNotes(scope) {
  return pick(scope, "internalNotes", "internal_notes");
}

export function scopeContractorNotes(scope) {
  return pick(scope, "contractorNotes", "contractor_notes");
}

export function recipientFollowUpDue(r) {
  return pick(r, "followUpDue", "follow_up_due");
}

export function recipientFollowUpSentAt(r) {
  return pick(r, "followUpSentAt", "follow_up_sent_at");
}

/** Meta form field read (edit form uses snake_case keys in state). */
export function packageMetaField(pkg, snakeKey) {
  const camelMap = {
    project_address: "projectAddress",
    tender_deadline: "tenderDeadline",
    architect_client: "architectClient",
    dropbox_url: "dropboxUrl",
  };
  const camel = camelMap[snakeKey];
  if (camel && pkg?.[camel] != null) return pkg[camel];
  return pkg?.[snakeKey] ?? "";
}
