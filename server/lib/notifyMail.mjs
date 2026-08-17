import { gmailSendConfigured, sendViaGmail } from "./gmailSend.mjs";
import { getSmtpTransporter, smtpFromAddress, smtpReady } from "./smtpSend.mjs";
import { resendSendConfigured, sendViaResend } from "./resendSend.mjs";
import { mirrorToSentMailbox } from "./imapSentAppend.mjs";

// Transactional mail (RFQs, reminders, portal, finance, auth, schedule…) sends through Blue Leaf's
// OWN mail server (SMTP, mail.blueleafbuilding.com.au) FIRST, so it sends as us, threads correctly,
// and lands in our Sent folder (via the IMAP mirror). Resend is a FALLBACK only — used when SMTP is
// unreachable. (Marketing/CRM campaigns deliberately call Resend directly in crmRoutes.mjs; that is
// the one module where Resend is the default, for bulk deliverability + engagement webhooks.)

// SMTP cooldown: if the mail server is briefly unreachable, one send fails fast (smtpSend timeouts),
// trips this cooldown, and the next ~90s of mail skips straight to Resend instead of each one eating
// the connect timeout. Auto-recovers — no manual reset.
let _smtpCooldownUntil = 0;
const SMTP_COOLDOWN_MS = 90_000;
const smtpOnCooldown = () => Date.now() < _smtpCooldownUntil;

// Two DIFFERENT questions about an SMTP failure:
//  (a) is the server unhealthy? → cool SMTP down so the rest of a blast skips it (avoids per-message
//      hangs). True for any connection/timeout-class error.
//  (b) is it safe to re-send THIS message on the fallback? → ONLY when we're certain nothing was
//      ever transmitted (couldn't connect / no greeting / DNS). A socket/data timeout is AMBIGUOUS
//      (the server may already have accepted it) → NOT safe → never retried → no duplicate to a trade.
const isSmtpUnhealthy = (e) => {
  const s = String(e?.code || "") + " " + String(e?.message || "");
  return /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ESOCKET|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|EDNS|EPIPE|timeout|greeting|connection/i.test(s);
};
const isPreSendSmtpError = (e) => {
  const code = String(e?.code || "");
  const msg = String(e?.message || "");
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|EDNS/i.test(code)) return true; // never connected
  if (/Connection timeout|Greeting never received|getaddrinfo|ECONNREFUSED/i.test(msg)) return true; // pre-DATA
  return false; // socket/data timeout, 4xx/5xx, ECONNRESET, … → ambiguous, treat as "may have sent"
};

export function mailTransportName() {
  if (smtpReady() && !smtpOnCooldown()) return "smtp";
  if (gmailSendConfigured()) return "gmail";
  if (resendSendConfigured()) return "resend";
  return null;
}

async function sendViaSmtp({ to, cc, bcc, subject, text, html, attachments, headers, messageId, inReplyTo, references }) {
  const transport = getSmtpTransporter();
  const from = smtpFromAddress();
  if (!transport || !from) return null;
  const mail = { from, to, subject, text };
  if (cc) mail.cc = cc;
  if (bcc) mail.bcc = bcc;
  if (html && String(html).trim()) mail.html = String(html).trim();
  if (headers && typeof headers === "object" && Object.keys(headers).length) mail.headers = headers;
  // Threading (additive; existing callers pass none). A caller-supplied Message-ID lets us persist
  // the exact id we sent under (correspondence.message_id) so an inbound reply's In-Reply-To can be
  // matched back to it. inReplyTo/references thread our replies onto the client's message.
  if (messageId) mail.messageId = messageId;
  if (inReplyTo) mail.inReplyTo = inReplyTo;
  if (references) mail.references = references;
  if (Array.isArray(attachments) && attachments.length) {
    mail.attachments = attachments.map((a) => ({
      filename: a.filename || "attachment.bin",
      content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content || ""),
      contentType: a.mimeType || a.contentType || undefined,
      // Inline (CID) images — e.g. the signature logo — are referenced from the HTML as cid:<id>.
      ...(a.cid ? { cid: a.cid, contentDisposition: "inline" } : {}),
    }));
  }
  await transport.sendMail(mail);
  return "smtp";
}

/**
 * Send one email via ONE transport, chosen up front: SMTP (our own mail server) → Gmail → Resend.
 *
 * HARD GUARANTEE — a single message is attempted on EXACTLY ONE transport and is NEVER re-sent on a
 * second one. That is the anti-duplicate rule: if SMTP fails after connecting, the message may
 * already be delivered, so we report it failed (the caller can retry) rather than risk a trade
 * receiving it twice. Only "SMTP not attempted at all" (cooling down / unreachable) routes a FRESH
 * message to Resend — where nothing was ever transmitted over SMTP, so there is no duplicate.
 *
 * Returns `{ transport, resendId }`:
 *   - `transport` is "smtp" | "gmail" | "resend" (the winning transport).
 *   - `resendId` is the Resend message id when sent via Resend, else `null` (persist on rfqs.resend_email_id
 *     so the Resend webhook can attribute delivery/open/bounce events).
 *
 * Backward-compatible: callers `await` this and ignore the return value.
 */
export async function sendPlainMail(opts) {
  const errors = [];

  // 1) SMTP — Blue Leaf's own mail server, PRIMARY for transactional mail. Sends as us, threads
  //    correctly, and mirrors into the Sent mailbox. Skipped only while cooling down after a recent
  //    connection failure.
  if (smtpReady() && !smtpOnCooldown()) {
    try {
      const viaSmtp = await sendViaSmtp(opts);
      if (viaSmtp) { mirrorToSentMailbox(opts, "smtp"); return { transport: "smtp", resendId: null }; }
      // sendViaSmtp returned null → SMTP isn't actually configured; fall through to a fallback.
    } catch (smtpErr) {
      errors.push(`SMTP: ${smtpErr?.message || smtpErr}`);
      // Cool SMTP down whenever the server looks unhealthy — so the REST of a blast skips it instead
      // of each message eating the timeout. (Recipient-level 5xx like "no such mailbox" is NOT an
      // unhealthy-server signal, so it won't cool the transport down.)
      if (isSmtpUnhealthy(smtpErr)) {
        _smtpCooldownUntil = Date.now() + SMTP_COOLDOWN_MS;
        console.warn("[mail] SMTP unhealthy — cooling down:", smtpErr?.message || smtpErr);
      }
      if (isPreSendSmtpError(smtpErr)) {
        // Certain NOTHING was transmitted (never connected / no greeting) → safe to fail this same
        // message over to Resend below. No duplicate is possible.
        console.warn("[mail] SMTP never connected — falling back to Resend:", smtpErr?.message || smtpErr);
      } else {
        // Ambiguous: connected, then failed (socket/data timeout, 4xx/5xx). The server MAY already
        // have accepted the message — do NOT retry on another transport, or a trade could get it
        // twice. Report it failed instead; a human can safely re-send.
        throw new Error(`Email send failed on the mail server after connecting; not retried, to avoid a duplicate. (${smtpErr?.message || smtpErr})`);
      }
    }
  }

  // 2) Gmail OAuth — only if SMTP is entirely absent (legacy path; Blue Leaf runs its own SMTP).
  if (gmailSendConfigured() && !smtpReady()) {
    try {
      await sendViaGmail(opts);
      return { transport: "gmail", resendId: null };
    } catch (gmailErr) {
      console.warn("[mail] Gmail send failed, trying Resend fallback:", gmailErr?.message || gmailErr);
      errors.push(`Gmail: ${gmailErr?.message || gmailErr}`);
    }
  }

  // 3) Resend (HTTPS API) — FALLBACK for transactional mail (used when the mail server is
  //    unreachable). Marketing/CRM campaigns call Resend directly elsewhere; this is not that path.
  if (resendSendConfigured()) {
    try {
      const resendId = await sendViaResend(opts);
      if (resendId) { mirrorToSentMailbox(opts, "resend"); return { transport: "resend", resendId }; }
    } catch (resendErr) {
      errors.push(`Resend: ${resendErr?.message || resendErr}`);
    }
  }

  if (errors.length) {
    throw new Error(`All configured mail transports failed — ${errors.join("; ")}.`);
  }
  throw new Error(
    "No mail transport configured. Set SMTP_* (your mail server) — and optionally RESEND_API_KEY as a fallback."
  );
}
