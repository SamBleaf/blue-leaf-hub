/**
 * Verifies SMTP credentials from .env (nodemailer verify — no message sent).
 * Run from repo root: node scripts/smtp-verify.mjs
 */
import "dotenv/config";
import nodemailer from "nodemailer";

function envBool(v, defaultValue = false) {
  if (v == null || v === "") return defaultValue;
  return String(v).toLowerCase() === "true" || v === "1";
}

const host = process.env.SMTP_HOST?.trim();
const user = process.env.SMTP_USER?.trim();
const pass = process.env.SMTP_PASS?.trim();
const from = process.env.SMTP_FROM?.trim();

if (!host || !user || !pass) {
  console.error("Missing SMTP_HOST, SMTP_USER, or SMTP_PASS in .env");
  process.exit(1);
}

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

const transport = nodemailer.createTransport(opts);

try {
  await transport.verify();
  console.log("SMTP verify OK:", { host, port, secure, user, smtp_from: from || "(SMTP_FROM not set)" });
} catch (err) {
  console.error("SMTP verify failed:", err?.message || String(err));
  process.exit(1);
}
