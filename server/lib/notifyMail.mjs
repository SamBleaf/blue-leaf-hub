import { gmailSendConfigured, sendViaGmail } from "./gmailSend.mjs";
import { getSmtpTransporter, smtpFromAddress, smtpReady } from "./smtpSend.mjs";
import { resendSendConfigured, sendViaResend } from "./resendSend.mjs";
import { mirrorToSentMailbox } from "./imapSentAppend.mjs";

export function mailTransportName() {
  // Resend (HTTPS) is preferred when configured — not blocked by host egress, no OAuth token expiry.
  if (resendSendConfigured()) return "resend";
  if (gmailSendConfigured()) return "gmail";
  if (smtpReady()) return "smtp";
  return null;
}

async function sendViaSmtp({ to, cc, bcc, subject, text, html, attachments, headers }) {
  const transport = getSmtpTransporter();
  const from = smtpFromAddress();
  if (!transport || !from) return null;
  const mail = { from, to, subject, text };
  if (cc) mail.cc = cc;
  if (bcc) mail.bcc = bcc;
  if (html && String(html).trim()) mail.html = String(html).trim();
  if (headers && typeof headers === "object" && Object.keys(headers).length) mail.headers = headers;
  if (Array.isArray(attachments) && attachments.length) {
    mail.attachments = attachments.map((a) => ({
      filename: a.filename || "attachment.bin",
      content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content || ""),
      contentType: a.mimeType || undefined
    }));
  }
  await transport.sendMail(mail);
  return "smtp";
}

/**
 * Send one email via the first available transport (Resend → Gmail → SMTP).
 *
 * Returns `{ transport, resendId }`:
 *   - `transport` is "resend" | "gmail" | "smtp" (the winning transport).
 *   - `resendId` is the Resend message id when sent via Resend, else `null`. Persist it on the
 *     rfqs row (rfqs.resend_email_id) so the Resend webhook can attribute delivery/open/click/
 *     bounce events to that RFQ. Gmail/SMTP have no such id, hence null.
 *
 * Backward-compatible: every existing caller `await`s this and ignores the return value (audited),
 * so widening the bare "resend"/"gmail"/"smtp" string to an object breaks nothing.
 */
export async function sendPlainMail(opts) {
  const errors = [];

  // 1) Resend (HTTPS API) — preferred when configured. Survives host SMTP-port blocks and has no
  //    OAuth token to expire. Only active once RESEND_API_KEY AND RESEND_FROM are both set.
  if (resendSendConfigured()) {
    try {
      const resendId = await sendViaResend(opts);
      // sendViaResend returns the Resend message id (truthy string) on success, or null if not
      // actually configured at call time.
      if (resendId) { mirrorToSentMailbox(opts, "resend"); return { transport: "resend", resendId }; }
    } catch (resendErr) {
      console.warn("[mail] Resend send failed, trying Gmail/SMTP fallback:", resendErr?.message || resendErr);
      errors.push(`Resend: ${resendErr?.message || resendErr}`);
    }
  }

  // 2) Gmail OAuth. Can fail with invalid_grant (expired/revoked token) — fall through to SMTP.
  if (gmailSendConfigured()) {
    try {
      await sendViaGmail(opts);
      return { transport: "gmail", resendId: null };
    } catch (gmailErr) {
      console.warn("[mail] Gmail send failed, trying SMTP fallback:", gmailErr?.message || gmailErr);
      errors.push(`Gmail: ${gmailErr?.message || gmailErr}`);
    }
  }

  // 3) SMTP (same connected account, app password).
  try {
    const viaSmtp = await sendViaSmtp(opts);
    if (viaSmtp) { mirrorToSentMailbox(opts, "smtp"); return { transport: "smtp", resendId: null }; }
  } catch (smtpErr) {
    errors.push(`SMTP: ${smtpErr?.message || smtpErr}`);
  }

  if (errors.length) {
    throw new Error(`All configured mail transports failed — ${errors.join("; ")}.`);
  }
  throw new Error(
    "No mail transport configured. Add RESEND_API_KEY + RESEND_FROM (recommended), Gmail OAuth (GMAIL_*), or SMTP_* in `.env`."
  );
}
