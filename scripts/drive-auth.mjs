#!/usr/bin/env node
/**
 * One-time Google Drive OAuth helper — used only for the fee proposal Google Docs workflow.
 * Email sending is handled separately via SMTP (no Google account needed for that).
 *
 * Prereqs:
 * 1. Google Cloud Console → APIs & Services → Enable Google Drive API
 * 2. Create OAuth 2.0 Client ID (Web application)
 * 3. Add Authorised redirect URI: http://localhost:8787/auth/drive/callback
 * 4. Put GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET in .env
 *
 * Run (from repo root):
 *   npm run auth:drive
 *
 * Then add GOOGLE_DRIVE_REFRESH_TOKEN=... to .env and restart the API.
 */
import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
const redirectUri =
  process.env.GOOGLE_DRIVE_REDIRECT_URI?.trim() || "http://localhost:8787/auth/drive/callback";

if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET in .env first.");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const url = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "select_account consent",
  scope: SCOPES
});

console.log("\n1) Open this URL in your browser and sign in with your Google account:\n");
console.log(url);
console.log(
  "\n2) After you approve, you will be redirected to localhost (the page may show an error — that's fine).\n" +
    "   Copy the ENTIRE `code` query value from the URL bar.\n"
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
    console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`);
  } else {
    console.warn(
      "No refresh_token returned — revoke app access in Google Account → Security and run again."
    );
  }
  console.log("\n--- Done ---\n");
} catch (e) {
  console.error("Token exchange failed:", e?.message || e);
  process.exit(1);
}
