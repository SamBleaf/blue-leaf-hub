import { gmailSendConfigured, sendViaGmail } from "./gmailSend.mjs";
import { getSmtpTransporter, smtpFromAddress, smtpReady } from "./smtpSend.mjs";
import { resendSendConfigured, sendViaResend } from "./resendSend.mjs";

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

export async function sendPlainMail(opts) {
  const errors = [];

  // 1) Resend (HTTPS API) — preferred when configured. Survives host SMTP-port blocks and has no
  //    OAuth token to expire. Only active once RESEND_API_KEY AND RESEND_FROM are both set.
  if (resendSendConfigured()) {
    try {
      const via = await sendViaResend(opts);
      if (via) return "resend";
    } catch (resendErr) {
      console.warn("[mail] Resend send failed, trying Gmail/SMTP fallback:", resendErr?.message || resendErr);
      errors.push(`Resend: ${resendErr?.message || resendErr}`);
    }
  }

  // 2) Gmail OAuth. Can fail with invalid_grant (expired/revoked token) — fall through to SMTP.
  if (gmailSendConfigured()) {
    try {
      await sendViaGmail(opts);
      return "gmail";
    } catch (gmailErr) {
      console.warn("[mail] Gmail send failed, trying SMTP fallback:", gmailErr?.message || gmailErr);
      errors.push(`Gmail: ${gmailErr?.message || gmailErr}`);
    }
  }

  // 3) SMTP (same connected account, app password).
  try {
    const viaSmtp = await sendViaSmtp(opts);
    if (viaSmtp) return "smtp";
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
