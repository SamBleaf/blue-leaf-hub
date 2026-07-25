import { randomUUID } from "crypto";

function normEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function normalizeLooseText(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Collect Message-IDs from In-Reply-To / References (angle-bracket or bare). */
export function collectInboundMessageIds(parsed) {
  const out = new Set();
  const addRaw = (raw) => {
    if (raw == null) return;
    const s = Array.isArray(raw) ? raw.join(" ") : String(raw);
    for (const m of s.match(/<[^>\s]+>/g) || []) {
      out.add(m.slice(1, -1).trim());
    }
    for (const m of s.match(/\b[\w.+-]+@[\w.-]+\b/g) || []) {
      if (s.includes(`<${m}>`)) continue;
    }
  };
  addRaw(parsed?.inReplyTo);
  addRaw(parsed?.references);
  return [...out];
}

function normalizeStoredMessageId(id) {
  return String(id || "")
    .replace(/^<|>$/g, "")
    .trim()
    .toLowerCase();
}

/** Match RFQ by outbound Message-ID stored on rfqs.sent_message_id */
export function matchBySentMessageId(parsed, rfqRows) {
  const incoming = collectInboundMessageIds(parsed).map((x) =>
    normalizeStoredMessageId(x).toLowerCase()
  );
  if (!incoming.length) return null;
  for (const rfq of rfqRows) {
    const sid = normalizeStoredMessageId(rfq.sent_message_id).toLowerCase();
    if (!sid) continue;
    if (incoming.some((id) => id === sid)) {
      return { rfq, reason: "in_reply_to" };
    }
  }
  return null;
}

/** Extract address hint from subject (RFQ - addr - trade pattern or leading numbers). */
export function extractAddressHintFromSubject(subject) {
  const s = String(subject || "");
  const m1 = s.match(/RFQ\s*-\s*(.+?)\s+-\s+/i);
  if (m1?.[1]) return m1[1].trim();
  const m2 = s.match(/(\d+\s+[A-Za-z0-9 ,.'-]{5,90})/);
  if (m2?.[1]) return m2[1].trim();
  return "";
}

function tokenizeAddress(addr) {
  return normalizeLooseText(addr)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
}

/** Fuzzy: hint tokens should mostly appear in job address */
export function fuzzyAddressMatch(jobAddress, hint) {
  const ja = normalizeLooseText(jobAddress);
  const hi = normalizeLooseText(hint);
  if (!ja || !hi || hi.length < 6) return false;
  if (ja.includes(hi) || hi.includes(ja)) return true;
  const tokens = tokenizeAddress(hint);
  if (tokens.length < 2) return ja.includes(tokens[0] || "");
  let hit = 0;
  for (const t of tokens) {
    if (ja.includes(t)) hit += 1;
  }
  return hit >= Math.min(2, Math.ceil(tokens.length * 0.6));
}

function scoreSubjectAddressForRfq(parsed, rfq) {
  const hint = extractAddressHintFromSubject(parsed?.subject || "");
  if (!hint) return 0;
  const addr = rfq?.jobs?.address || "";
  if (!fuzzyAddressMatch(addr, hint)) return 0;
  const subjectNorm = normalizeLooseText(parsed?.subject || "");
  const bodyNorm = normalizeLooseText(parsed?.text || parsed?.html || "");
  let score = 4;
  const tradeNorm = normalizeLooseText(rfq?.trade || "");
  if (tradeNorm && subjectNorm.includes(tradeNorm)) score += 2;
  if (tradeNorm && bodyNorm.includes(tradeNorm)) score += 1;
  return score;
}

/**
 * Subject/address match on a candidate set.
 * @returns {{ rfq, reason: 'subject_address' } | { ambiguous: true, ambiguity: 'ambiguous_address' } | null}
 */
export function matchBySubjectAddress(parsed, rfqRows) {
  const scored = (rfqRows || [])
    .map((rfq) => ({ rfq, score: scoreSubjectAddressForRfq(parsed, rfq) }))
    .filter((row) => row.score >= 4);
  if (!scored.length) return null;
  const bestScore = Math.max(...scored.map((row) => row.score));
  const top = scored.filter((row) => row.score === bestScore);
  if (top.length > 1) {
    return { ambiguous: true, ambiguity: "ambiguous_address" };
  }
  return { rfq: top[0].rfq, reason: "subject_address" };
}

export function maybeFirstAddress(parsed) {
  const from = parsed?.from?.value;
  if (!Array.isArray(from) || !from.length) return "";
  return normEmail(from[0]?.address || "");
}

/** All open RFQs whose subcontractor email equals fromEmail. */
export function findSenderSubcontractorCandidates(fromEmail, rfqRows) {
  const fe = normEmail(fromEmail);
  if (!fe) return [];
  return (rfqRows || []).filter((rfq) => {
    const se = normEmail(rfq?.subcontractors?.email || "");
    return se && se === fe;
  });
}

/** Sender email matches subcontractor on exactly one open RFQ (legacy export). */
export function matchBySenderSubcontractor(fromEmail, rfqRows) {
  const candidates = findSenderSubcontractorCandidates(fromEmail, rfqRows);
  if (candidates.length === 1) {
    return { rfq: candidates[0], reason: "sender_subcontractor" };
  }
  return null;
}

// Free-mail / shared providers — a domain here can't identify a company, so domain matching is skipped.
const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "live.com.au", "msn.com",
  "yahoo.com", "yahoo.com.au", "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com",
  "bigpond.com", "bigpond.net.au", "optusnet.com.au", "iinet.net.au", "internode.on.net",
  "tpg.com.au", "exetel.com.au", "proton.me", "protonmail.com",
]);

// Blue Leaf's own domains — every RFQ reply has admin@blueleafbuilding.com.au in To/CC, so these
// must be excluded from sender/company resolution or they'd match our own domain on every email.
const OWN_DOMAINS = new Set(["blueleafbuilding.com.au", "blueleafbuilding.test"]);

function domainOf(email) {
  const e = normEmail(email);
  const at = e.lastIndexOf("@");
  return at >= 0 ? e.slice(at + 1) : "";
}

/** Every sender-ish address on the inbound mail: from + reply-to + cc + to (minus our own
 *  addresses). Catches colleague / shared-inbox / reply-all replies where the original contact
 *  isn't the From address. */
export function collectSenderAddresses(parsed) {
  const out = new Set();
  for (const field of ["from", "replyTo", "cc", "to"]) {
    const v = parsed?.[field]?.value;
    if (Array.isArray(v)) for (const a of v) {
      const e = normEmail(a?.address);
      if (e && !OWN_DOMAINS.has(domainOf(e))) out.add(e);
    }
  }
  return [...out];
}

const RFQ_TOKEN_RE = /BLH-RFQ-([0-9a-f]{8,36})/i;

/** L1 — durable RFQ token: X-BlueLeaf-RFQ-ID header (full id) or "BLH-RFQ-<id>" in subject/body.
 *  Transport- and sender-proof: survives a colleague reply, a shared inbox, and forwards. */
export function matchByRfqToken(parsed, rfqRows) {
  const rows = rfqRows || [];
  let headerId = "";
  try { headerId = String(parsed?.headers?.get?.("x-blueleaf-rfq-id") || "").trim().toLowerCase(); } catch { /* no headers map */ }
  if (headerId) {
    const hit = rows.find((r) => String(r.id).toLowerCase() === headerId);
    if (hit) return { rfq: hit, reason: "rfq_token_header" };
  }
  // Scan subject + BOTH parts (not text-OR-html): a reply's text/plain is usually non-empty but may
  // not carry the token (e.g. the tender blast hides it in the HTML), so html must be searched too.
  const m = `${parsed?.subject || ""} ${parsed?.text || ""} ${parsed?.html || ""}`.match(RFQ_TOKEN_RE);
  if (m?.[1]) {
    const tok = m[1].toLowerCase();
    const hits = rows.filter((r) => String(r.id).toLowerCase().startsWith(tok));
    if (hits.length === 1) return { rfq: hits[0], reason: "rfq_token_body" };
  }
  return null;
}

/** Resolve the COMPANY (subcontractor) by any sender address — exact email first, then non-free-mail
 *  domain. Returns the company's RFQ rows + whether the signal spans >1 company (ambiguous). */
function findCompanyCandidates(addrs, rfqRows) {
  const rows = rfqRows || [];
  const subId = (r) => r?.subcontractor_id || normEmail(r?.subcontractors?.email);
  const byEmail = rows.filter((r) => addrs.includes(normEmail(r?.subcontractors?.email)));
  if (byEmail.length) {
    return { rows: byEmail, multiCompany: new Set(byEmail.map(subId)).size > 1, via: "email" };
  }
  const domains = new Set(addrs.map(domainOf).filter((d) => d && !FREE_MAIL_DOMAINS.has(d)));
  if (!domains.size) return { rows: [], multiCompany: false, via: null };
  const byDomain = rows.filter((r) => domains.has(domainOf(r?.subcontractors?.email)));
  return { rows: byDomain, multiCompany: new Set(byDomain.map(subId)).size > 1, via: "domain" };
}

/** Does the matched RFQ's trade appear in the email? Used to disambiguate within a company. */
function tradeSignal(parsed, rfq) {
  const tradeNorm = normalizeLooseText(rfq?.trade || "");
  if (!tradeNorm) return 0;
  const hay = normalizeLooseText(`${parsed?.subject || ""} ${parsed?.text || parsed?.html || ""}`);
  return hay.includes(tradeNorm) ? 3 : 0;
}

/** Pick ONE RFQ from a single company's set, by trade signal. Never guesses on a tie. */
function disambiguateByTrade(parsed, rows) {
  if (rows.length === 1) return { rfq: rows[0], reason: "company_single_rfq" };
  const scored = rows.map((rfq) => ({ rfq, score: scoreSubjectAddressForRfq(parsed, rfq) + tradeSignal(parsed, rfq) }));
  const best = Math.max(...scored.map((s) => s.score));
  if (best <= 0) return { ambiguous: true, ambiguity: "ambiguous_trade" };
  const top = scored.filter((s) => s.score === best);
  if (top.length > 1) return { ambiguous: true, ambiguity: "ambiguous_trade" };
  return { rfq: top[0].rfq, reason: "company_trade" };
}

/** STRICT subject/address: only stands alone when it uniquely fixes BOTH the address AND the trade.
 *  Replaces the old address-only auto-attribution that mis-filed Spaellacy under Andrew Evans. */
export function matchBySubjectAddressStrict(parsed, rfqRows) {
  const scored = (rfqRows || [])
    .map((rfq) => ({ rfq, addr: scoreSubjectAddressForRfq(parsed, rfq), trade: tradeSignal(parsed, rfq) }))
    .filter((r) => r.addr >= 4 && r.trade > 0);
  if (!scored.length) return null;
  const best = Math.max(...scored.map((r) => r.addr + r.trade));
  const top = scored.filter((r) => r.addr + r.trade === best);
  if (top.length > 1) return { ambiguous: true, ambiguity: "ambiguous_address" };
  return { rfq: top[0].rfq, reason: "subject_address_strict" };
}

/**
 * Layered, confidence-ranked matcher. Golden rule: a WRONG auto-match is worse than unmatched, so
 * uncertain results return an ambiguity reason and fall to the unmatched queue.
 * Order: L1 token → L2 thread → L3 company (exact email / domain) then trade → L5 strict address+trade.
 * @returns {{ match: { rfq, reason } | null, ambiguity: string | null }}
 */
export function resolveInboundRfqMatchWithMeta(parsed, rfqRows) {
  const token = matchByRfqToken(parsed, rfqRows);
  if (token) return { match: token, ambiguity: null };

  const thread = matchBySentMessageId(parsed, rfqRows);
  if (thread) return { match: thread, ambiguity: null };

  // L3 — resolve the company by any sender address, then the trade within it.
  const addrs = collectSenderAddresses(parsed);
  const company = findCompanyCandidates(addrs, rfqRows);
  if (company.rows.length) {
    if (company.multiCompany) return { match: null, ambiguity: "ambiguous_company" };
    const picked = disambiguateByTrade(parsed, company.rows);
    if (picked?.rfq) return { match: picked, ambiguity: null };
    return { match: null, ambiguity: picked?.ambiguity || "ambiguous_trade" };
  }

  // L5 — strict address+trade only. Address ALONE no longer auto-attributes across companies.
  const strict = matchBySubjectAddressStrict(parsed, rfqRows);
  if (strict?.rfq) return { match: strict, ambiguity: null };
  if (strict?.ambiguous) return { match: null, ambiguity: strict.ambiguity };

  return { match: null, ambiguity: null };
}

/**
 * Priority: thread → unique subject/address → sender (single or disambiguated by address).
 * @param {*} parsed — mailparser result
 * @param {object[]} rfqRows
 */
export function resolveInboundRfqMatch(parsed, rfqRows) {
  return resolveInboundRfqMatchWithMeta(parsed, rfqRows).match;
}

export function generateOutboundMessageId() {
  return `<${randomUUID()}@blueleafbuilding.com.au>`;
}
