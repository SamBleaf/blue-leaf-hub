// googleapis is a very large package whose cold import takes ~10s+ — load it lazily so it never
// blocks API server startup. Only the actual send path below needs it.
let _google = null;
async function getGoogle() {
  if (!_google) ({ google: _google } = await import("googleapis"));
  return _google;
}

async function gmailOAuth2Client() {
  const cid = process.env.GMAIL_CLIENT_ID?.trim();
  const cs = process.env.GMAIL_CLIENT_SECRET?.trim();
  const rt = process.env.GMAIL_REFRESH_TOKEN?.trim();
  if (!cid || !cs || !rt) return null;
  const redirect = process.env.GMAIL_REDIRECT_URI?.trim() || "http://localhost:8787/auth/gmail/callback";
  const google = await getGoogle();
  const oauth2 = new google.auth.OAuth2(cid, cs, redirect);
  oauth2.setCredentials({ refresh_token: rt });
  return oauth2;
}

export function gmailSendConfigured() {
  const cid = process.env.GMAIL_CLIENT_ID?.trim();
  const cs = process.env.GMAIL_CLIENT_SECRET?.trim();
  const rt = process.env.GMAIL_REFRESH_TOKEN?.trim();
  const from = process.env.GMAIL_SENDER_EMAIL?.trim();
  return Boolean(cid && cs && rt && from);
}

function formatOptionalMimeHeaders(headers) {
  if (!headers || typeof headers !== "object") return [];
  const lines = [];
  for (const [k, val] of Object.entries(headers)) {
    const v = String(val || "").trim();
    if (!v) continue;
    lines.push(`${k}: ${v.replace(/\r?\n/g, " ")}`);
  }
  return lines;
}

/** RFC 5322-ish plain message, base64url for Gmail API `raw`. */
export function encodeGmailRawMessage({ from, to, cc, bcc, subject, text, headers }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    ...(bcc ? [`Bcc: ${bcc}`] : []),
    `Subject: ${subject}`,
    ...formatOptionalMimeHeaders(headers),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text.replace(/\r?\n/g, "\r\n")
  ];
  const raw = lines.join("\r\n");
  return Buffer.from(raw, "utf8").toString("base64url");
}

/** multipart/alternative (plain + html) for Gmail API `raw`. */
export function encodeGmailMultipartMessage({ from, to, cc, bcc, subject, text, html, headers }) {
  const boundary = `bl_rf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  const subj = String(subject).replace(/\r?\n/g, " ");
  const plainPart = String(text).replace(/\r?\n/g, "\r\n");
  const htmlPart = String(html).replace(/\r?\n/g, "\r\n");
  const mime = [
    `From: ${from}`,
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    ...(bcc ? [`Bcc: ${bcc}`] : []),
    `Subject: ${subj}`,
    ...formatOptionalMimeHeaders(headers),
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    plainPart,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    htmlPart,
    "",
    `--${boundary}--`
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

function wrapBase64MimeBody(buf) {
  const b64 = Buffer.isBuffer(buf) ? buf.toString("base64") : Buffer.from(buf).toString("base64");
  const lines = [];
  for (let i = 0; i < b64.length; i += 76) {
    lines.push(b64.slice(i, i + 76));
  }
  return lines.join("\r\n");
}

/**
 * multipart/mixed: optional multipart/alternative body + file attachments (e.g. PDF PO).
 * @param {{ from: string, to: string, subject: string, text: string, html?: string, attachments?: { filename: string, mimeType?: string, content: Buffer }[] }} opts
 */
export function encodeGmailMixedWithAttachments({ from, to, cc, bcc, subject, text, html, attachments, headers }) {
  const outer = `bl_mix_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  const subj = String(subject).replace(/\r?\n/g, " ");
  const plainPart = String(text).replace(/\r?\n/g, "\r\n");
  const parts = [
    `From: ${from}`,
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    ...(bcc ? [`Bcc: ${bcc}`] : []),
    `Subject: ${subj}`,
    ...formatOptionalMimeHeaders(headers),
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${outer}"`,
    "",
    `--${outer}`
  ];

  const htmlTrim = html && String(html).trim();
  if (htmlTrim) {
    const inner = `bl_alt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    const htmlPart = String(htmlTrim).replace(/\r?\n/g, "\r\n");
    parts.push(`Content-Type: multipart/alternative; boundary="${inner}"`, "", `--${inner}`);
    parts.push(
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      plainPart,
      "",
      `--${inner}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      htmlPart,
      "",
      `--${inner}--`,
      ""
    );
  } else {
    parts.push(
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      plainPart,
      ""
    );
  }

  for (const att of attachments || []) {
    if (!att?.content?.length) continue;
    const fn = String(att.filename || "attachment.bin").replace(/\r?\n/g, " ");
    const mime = String(att.mimeType || "application/octet-stream").replace(/\r?\n/g, " ");
    parts.push(
      `--${outer}`,
      `Content-Type: ${mime}; name="${fn}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${fn}"`,
      "",
      wrapBase64MimeBody(att.content),
      ""
    );
  }

  parts.push(`--${outer}--`);
  return Buffer.from(parts.join("\r\n"), "utf8").toString("base64url");
}

export async function sendViaGmail({ to, cc, bcc, subject, text, html, attachments, headers }) {
  const auth = await gmailOAuth2Client();
  const fromAddr = process.env.GMAIL_SENDER_EMAIL?.trim();
  if (!auth || !fromAddr) {
    throw new Error("Gmail is not configured (missing client, secret, refresh token, or GMAIL_SENDER_EMAIL).");
  }
  const from = fromAddr.includes("<") ? fromAddr : `${process.env.SAM_NAME || "Sam Morris"} <${fromAddr}>`;
  const google = await getGoogle();
  const gmail = google.gmail({ version: "v1", auth });
  const atts = Array.isArray(attachments) ? attachments.filter((a) => a?.content?.length) : [];
  let raw;
  if (atts.length) {
    raw = encodeGmailMixedWithAttachments({ from, to, cc, bcc, subject, text, html, attachments: atts, headers });
  } else {
    raw = html && String(html).trim()
      ? encodeGmailMultipartMessage({ from, to, cc, bcc, subject, text, html: String(html).trim(), headers })
      : encodeGmailRawMessage({ from, to, cc, bcc, subject, text, headers });
  }
  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw }
  });
}
