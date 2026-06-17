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
  return "resend";
}
