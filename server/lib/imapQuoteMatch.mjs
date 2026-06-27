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

/**
 * Full matcher with ambiguity metadata (P0-B3).
 * @returns {{ match: { rfq, reason } | null, ambiguity: null | 'ambiguous_address' | 'ambiguous_sender' }}
 */
export function resolveInboundRfqMatchWithMeta(parsed, rfqRows) {
  const thread = matchBySentMessageId(parsed, rfqRows);
  if (thread) return { match: thread, ambiguity: null };

  const subject = matchBySubjectAddress(parsed, rfqRows);
  if (subject?.rfq) return { match: subject, ambiguity: null };
  if (subject?.ambiguous) {
    return { match: null, ambiguity: subject.ambiguity || "ambiguous_address" };
  }

  const fromEmail = maybeFirstAddress(parsed);
  const senderRows = findSenderSubcontractorCandidates(fromEmail, rfqRows);
  if (senderRows.length === 1) {
    return {
      match: { rfq: senderRows[0], reason: "sender_subcontractor" },
      ambiguity: null,
    };
  }
  if (senderRows.length > 1) {
    const subSubject = matchBySubjectAddress(parsed, senderRows);
    if (subSubject?.rfq) return { match: subSubject, ambiguity: null };
    if (subSubject?.ambiguous) {
      return { match: null, ambiguity: "ambiguous_address" };
    }
    return { match: null, ambiguity: "ambiguous_sender" };
  }

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
