import { gmailSendConfigured, sendViaGmail } from "./gmailSend.mjs";
import { getSmtpTransporter, smtpFromAddress, smtpReady } from "./smtpSend.mjs";

export function mailTransportName() {
  if (gmailSendConfigured()) return "gmail";
  if (smtpReady()) return "smtp";
  return null;
}

export async function sendPlainMail({ to, cc, bcc, subject, text, html, attachments, headers }) {
  if (gmailSendConfigured()) {
    await sendViaGmail({ to, cc, bcc, subject, text, html, attachments, headers });
    return "gmail";
  }
  const transport = getSmtpTransporter();
  const from = smtpFromAddress();
  if (transport && from) {
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
  throw new Error(
    "No mail transport configured. Add Gmail OAuth vars (GMAIL_*) or SMTP_* in `.env`."
  );
}
