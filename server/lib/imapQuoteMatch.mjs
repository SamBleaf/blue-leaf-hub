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

export function matchBySubjectAddress(parsed, rfqRows) {
  const hint = extractAddressHintFromSubject(parsed?.subject || "");
  if (!hint) return null;
  const subjectNorm = normalizeLooseText(parsed?.subject || "");
  const bodyNorm = normalizeLooseText(parsed?.text || parsed?.html || "");
  let best = null;
  let bestScore = 0;
  for (const rfq of rfqRows) {
    const addr = rfq?.jobs?.address || "";
    if (!fuzzyAddressMatch(addr, hint)) continue;
    let score = 4;
    const tradeNorm = normalizeLooseText(rfq?.trade || "");
    if (tradeNorm && subjectNorm.includes(tradeNorm)) score += 2;
    if (tradeNorm && bodyNorm.includes(tradeNorm)) score += 1;
    if (score > bestScore) {
      best = rfq;
      bestScore = score;
    }
  }
  if (!best || bestScore < 4) return null;
  return { rfq: best, reason: "subject_address" };
}

function maybeFirstAddress(parsed) {
  const from = parsed?.from?.value;
  if (!Array.isArray(from) || !from.length) return "";
  return normEmail(from[0]?.address || "");
}

/** Sender email matches subcontractor on an RFQ for a tendering job */
export function matchBySenderSubcontractor(fromEmail, rfqRows) {
  const fe = normEmail(fromEmail);
  if (!fe) return null;
  for (const rfq of rfqRows) {
    const se = normEmail(rfq?.subcontractors?.email || "");
    if (se && se === fe) {
      return { rfq, reason: "sender_subcontractor" };
    }
  }
  return null;
}

/**
 * Priority: In-Reply-To / References → subject/address → sender=sub email
 * @param {*} parsed — mailparser result
 * @param {object[]} rfqRows
 */
export function resolveInboundRfqMatch(parsed, rfqRows) {
  const a = matchBySentMessageId(parsed, rfqRows);
  if (a) return a;
  const b = matchBySubjectAddress(parsed, rfqRows);
  if (b) return b;
  const c = matchBySenderSubcontractor(maybeFirstAddress(parsed), rfqRows);
  if (c) return c;
  return null;
}

export function generateOutboundMessageId() {
  return `<${randomUUID()}@blueleafbuilding.com.au>`;
}
