// Resend transactional-email transport.
//
// Sends over the Resend HTTPS API (port 443), so unlike SMTP it is never blocked by host egress
// rules (Railway), and unlike Gmail OAuth it has no refresh-token that expires every 7 days.
//
// Opt-in: this transport is only "configured" when BOTH RESEND_API_KEY and RESEND_FROM are set, so
// nothing changes until RESEND_FROM is supplied (and its domain is verified in the Resend dashboard).
// RESEND_FROM should be an address on the verified domain, e.g.
//   RESEND_FROM="Blue Leaf Building <admin@blueleafbuilding.com.au>"
// Replies go to the From address (admin@…), which the IMAP poller already watches for quote replies.

let _resend = null;

async function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) {
    const { Resend } = await import("resend");
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

// Default to admin@ on the verified blueleafbuilding.com.au domain so Resend activates as soon as
// RESEND_API_KEY is present — no separate RESEND_FROM env is required. Override with RESEND_FROM
// (e.g. a different display name or address on the verified domain) if ever needed.
const DEFAULT_RESEND_FROM = "Blue Leaf Building <admin@blueleafbuilding.com.au>";

export function resendFromAddress() {
  return process.env.RESEND_FROM?.trim() || DEFAULT_RESEND_FROM;
}

export function resendSendConfigured() {
  return Boolean(process.env.RESEND_API_KEY && resendFromAddress());
}

export async function sendViaResend({ to, cc, bcc, subject, text, html, attachments, headers, replyTo }) {
  const resend = await getResend();
  const from = resendFromAddress();
  if (!resend || !from) return null;

  const payload = { from, to, subject };
  if (typeof text === "string" && text.trim()) payload.text = text;
  if (typeof html === "string" && html.trim()) payload.html = html.trim();
  if (!payload.text && !payload.html) payload.text = String(text ?? "");
  if (cc) payload.cc = cc;
  if (bcc) payload.bcc = bcc;
  if (replyTo) payload.replyTo = replyTo;

  if (headers && typeof headers === "object") {
    // Resend manages its own Message-ID — forwarding a reserved one can be rejected. Strip it and
    // pass any other custom headers through. (RFQ reply-matching falls back to subject + sender.)
    const safe = {};
    for (const [k, v] of Object.entries(headers)) {
      if (/^message-id$/i.test(k)) continue;
      safe[k] = v;
    }
    if (Object.keys(safe).length) payload.headers = safe;
  }

  if (Array.isArray(attachments) && attachments.length) {
    payload.attachments = attachments.map((a) => ({
      filename: a.filename || "attachment.bin",
      content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content || "")
    }));
  }

  // Resend returns { data, error } and does NOT throw on a rejected send — inspect both.
  const { data, error } = await resend.emails.send(payload);
  if (error) {
    throw new Error(`Resend: ${error?.message || JSON.stringify(error)}`);
  }
  if (!data?.id) {
    throw new Error("Resend: send not accepted (no id returned).");
  }
  // Return the Resend message id (not the bare "resend" string) so callers can persist it for
  // webhook matching (rfqs.resend_email_id). A non-empty string here still means "sent via Resend".
  return data.id;
}

/**
 * Send many emails in ONE Resend Batch API call (up to 100). This is the only safe way to
 * fan out a bulk send: sending them as separate concurrent requests trips Resend's per-second
 * rate limit, and the rejected ones fall through to the slow SMTP fallback — which is what made
 * a 19-recipient resend hang for minutes. One batch call is a single request, ~1–2s for all.
 *
 * Each message: { to, subject, text, html, headers, replyTo }. `from` is shared. Batch does not
 * support attachments/scheduling (Resend limitation) — fine for link-only notifications.
 * Returns the per-message result array `[{ id }, ...]` in the same order as `messages`.
 */
export async function sendBatchViaResend(messages) {
  const resend = await getResend();
  const from = resendFromAddress();
  if (!resend || !from) throw new Error("Resend not configured.");
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const payload = messages.map((m) => {
    const item = { from, to: Array.isArray(m.to) ? m.to : [m.to], subject: m.subject };
    if (typeof m.text === "string" && m.text.trim()) item.text = m.text;
    if (typeof m.html === "string" && m.html.trim()) item.html = m.html.trim();
    if (!item.text && !item.html) item.text = String(m.text ?? "");
    if (m.replyTo) item.replyTo = m.replyTo;
    if (m.headers && typeof m.headers === "object") {
      const safe = {};
      for (const [k, v] of Object.entries(m.headers)) {
        if (/^message-id$/i.test(k)) continue; // Resend manages its own Message-ID
        if (v != null) safe[k] = String(v);
      }
      if (Object.keys(safe).length) item.headers = safe;
    }
    return item;
  });

  // Resend caps a batch at 100 emails — chunk so a large recipient list never gets rejected.
  const CHUNK = 100;
  const out = [];
  for (let i = 0; i < payload.length; i += CHUNK) {
    const slice = payload.slice(i, i + CHUNK);
    const { data, error } = await resend.batch.send(slice);
    if (error) {
      throw new Error(`Resend batch: ${error?.message || JSON.stringify(error)}`);
    }
    // SDK shape: { data: { data: [{ id }, ...] } } — normalise to the inner array.
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    out.push(...list);
  }
  return out;
}
