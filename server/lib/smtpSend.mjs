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
    tls: { rejectUnauthorized: true }
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
