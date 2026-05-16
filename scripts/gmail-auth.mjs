#!/usr/bin/env node
/**
 * One-time Gmail OAuth helper — prints authorisation URL, then exchanges
 * the authorisation code for a refresh token (paste code from redirect URL).
 *
 * Prereqs:
 * 1. Google Cloud Console → APIs & Services → Enable Gmail API
 * 2. Create OAuth 2.0 Client ID (Desktop app or Web application)
 * 3. If Web: add Authorised redirect URI = value of GMAIL_REDIRECT_URI below
 * 4. Put GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env (repo root)
 *
 * Run (from repo root):
 *   node scripts/gmail-auth.mjs
 *
 * Then add GMAIL_REFRESH_TOKEN=... to .env and restart the API.
 */
import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify"
];

const clientId = process.env.GMAIL_CLIENT_ID?.trim();
const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
const redirectUri =
  process.env.GMAIL_REDIRECT_URI?.trim() || "http://localhost:8787/auth/gmail/callback";

if (!clientId || !clientSecret) {
  console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env first.");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const url = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES
});

console.log("\n1) Open this URL in your browser and sign in with the Gmail / Workspace account:\n");
console.log(url);
console.log(
  "\n2) After you approve, you will be redirected to your redirect URI with ?code=...\n" +
    "   Copy the ENTIRE `code` query value (URL-decoded if needed).\n"
);

const rl = readline.createInterface({ input, output });
const code = (await rl.question("Paste authorisation code here: ")).trim();
rl.close();

if (!code) {
  console.error("No code entered.");
  process.exit(1);
}

try {
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);
  console.log("\n--- Add these to your .env (keep secret) ---\n");
  if (tokens.refresh_token) {
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
  } else {
    console.warn(
      "No refresh_token returned — revoke app access in Google Account → Security and run again with prompt=consent."
    );
  }
  console.log(`\nOptional: GMAIL_SENDER_EMAIL=you@yourdomain.com`);
  console.log("\n--- Done ---\n");
} catch (e) {
  console.error("Token exchange failed:", e?.message || e);
  process.exit(1);
}
