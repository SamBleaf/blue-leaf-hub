import { ImapFlow } from "imapflow";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { resendFromAddress } from "./resendSend.mjs";
import { smtpFromAddress } from "./smtpSend.mjs";

// Mirror server-sent mail into the user's IMAP "Sent" mailbox so it shows up in their mail client.
// Resend/SMTP send server-side and never touch the mailbox, so without this nothing the Hub sends
// appears in Sent. (Gmail-API sends already land in Gmail's Sent, so we skip those.) NON-FATAL +
// fire-and-forget — never blocks or fails a send.

function imapCfg() {
  const host = process.env.IMAP_HOST?.trim();
  const user = process.env.IMAP_USER?.trim();
  const pass = process.env.IMAP_PASS;
  if (!host || !user || !pass) return null;
  return {
    host,
    port: Number(process.env.IMAP_PORT) || 993,
    secure: String(process.env.IMAP_SECURE ?? "true") !== "false",
    auth: { user, pass },
    logger: false,
  };
}

function buildRaw({ from, to, cc, subject, text, html, headers }) {
  return new Promise((resolve, reject) => {
    const mail = { from, to, subject, text };
    if (cc) mail.cc = cc;
    if (html && String(html).trim()) mail.html = String(html).trim();
    if (headers && typeof headers === "object" && Object.keys(headers).length) mail.headers = headers;
    new MailComposer(mail).compile().build((err, msg) => (err ? reject(err) : resolve(msg)));
  });
}

export async function mirrorToSentMailbox(opts, transport) {
  try {
    const cfg = imapCfg();
    if (!cfg) return;
    const from = transport === "smtp" ? smtpFromAddress() || resendFromAddress() : resendFromAddress();
    const raw = await buildRaw({ ...opts, from });
    const client = new ImapFlow(cfg);
    await client.connect();
    try {
      const boxes = await client.list();
      let path = boxes.find((b) => b.specialUse === "\\Sent")?.path;
      if (!path) path = boxes.map((b) => b.path).find((p) => /^(sent|sent items|sent messages|inbox[./]sent)$/i.test(p)) || "Sent";
      await client.append(path, raw, ["\\Seen"]);
    } finally {
      try { await client.logout(); } catch { /* ignore */ }
    }
  } catch (e) {
    console.warn("[mail] Sent-mailbox mirror skipped:", e?.message || e);
  }
}
