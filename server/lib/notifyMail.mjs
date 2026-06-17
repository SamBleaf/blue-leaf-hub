import { gmailSendConfigured, sendViaGmail } from "./gmailSend.mjs";
import { getSmtpTransporter, smtpFromAddress, smtpReady } from "./smtpSend.mjs";

export function mailTransportName() {
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
  const { to, cc, bcc, subject, text, html, attachments, headers } = opts;
  if (gmailSendConfigured()) {
    try {
      await sendViaGmail({ to, cc, bcc, subject, text, html, attachments, headers });
      return "gmail";
    } catch (gmailErr) {
      // Gmail OAuth can fail with invalid_grant (expired/revoked token). Rather than hard-fail
      // the whole send, fall back to SMTP (the same connected account, via app password) when
      // it's configured. Only re-throw if there's no working SMTP fallback.
      console.warn("[mail] Gmail send failed, trying SMTP fallback:", gmailErr?.message || gmailErr);
      try {
        const viaSmtp = await sendViaSmtp(opts);
        if (viaSmtp) return "smtp";
      } catch (smtpErr) {
        const e = new Error(
          `Gmail send failed (${gmailErr?.message || gmailErr}) and the SMTP fallback also failed (${smtpErr?.message || smtpErr}).`
        );
        e.cause = gmailErr;
        throw e;
      }
      throw gmailErr; // Gmail failed and no SMTP configured
    }
  }
  const viaSmtp = await sendViaSmtp(opts);
  if (viaSmtp) return "smtp";
  throw new Error(
    "No mail transport configured. Add Gmail OAuth vars (GMAIL_*) or SMTP_* in `.env`."
  );
}
