import nodemailer from "nodemailer";

function envBool(v, defaultValue = false) {
  if (v == null || v === "") return defaultValue;
  return String(v).toLowerCase() === "true" || v === "1";
}

function smtpTransportOptions() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT) || 587;
  const secureEnv = process.env.SMTP_SECURE;
  const secure =
    secureEnv != null && String(secureEnv).trim() !== ""
      ? envBool(secureEnv, false)
      : port === 465;
  const opts = {
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: true },
    // Fail FAST when the host can't reach the mail server (e.g. Railway egress hiccup) so the caller
    // falls over to the Resend fallback in seconds, not the OS default of ~2 minutes. This tight
    // timeout + notifyMail's SMTP cooldown is what lets "SMTP primary" stay iron-clad.
    connectionTimeout: 10_000, // TCP connect
    greetingTimeout: 10_000,   // wait for the server 220 banner
    socketTimeout: 20_000,     // inactivity once connected
    // Pool + reuse one authenticated connection across a recipient blast (a 19-recipient tender send
    // is one handshake, not 19) — faster and gentler on the mail server.
    pool: true,
    maxConnections: 3,
    maxMessages: 100
  };
  if (!secure && port === 587) {
    opts.requireTLS = true;
  }
  return opts;
}

let _smtpTransporter = null;

export function getSmtpTransporter() {
  const opts = smtpTransportOptions();
  if (!opts) return null;
  if (!_smtpTransporter) {
    _smtpTransporter = nodemailer.createTransport(opts);
  }
  return _smtpTransporter;
}

export function smtpFromAddress() {
  return process.env.SMTP_FROM?.trim() || "";
}

export function smtpReady() {
  return Boolean(getSmtpTransporter() && smtpFromAddress());
}

/**
 * Handshake-only health check (connect + greet + auth, NO message sent) with a hard timeout.
 * Used as a pre-flight before a blast so we can route the WHOLE batch to the fallback when the mail
 * server is unreachable — instead of losing the first message to a timeout. Never throws.
 * Returns true only when the mail server is reachable and the credentials are accepted.
 */
export async function verifySmtp(timeoutMs = 8000) {
  const t = getSmtpTransporter();
  if (!t || !smtpFromAddress()) return false;
  try {
    return await Promise.race([
      t.verify().then(() => true).catch(() => false),
      new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs))
    ]);
  } catch {
    return false;
  }
}
