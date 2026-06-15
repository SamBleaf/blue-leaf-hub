#!/usr/bin/env node
/**
 * One-time Google OAuth helper — Drive (fee proposals) + read scopes for GSC/GA4/GBP/Sheets.
 *
 * Prereqs (Google Cloud Console → APIs & Services):
 * 1. Enable: Google Drive API, Google Sheets API (+ Search Console / Analytics / Business if used)
 * 2. OAuth 2.0 Client ID (Web application)
 * 3. Authorised redirect URI must match GOOGLE_DRIVE_REDIRECT_URI (default below)
 * 4. GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET in .env
 *
 * IMPORTANT: stop `npm run dev` first — this script needs the redirect port to itself.
 *
 * Run:  npm run auth:drive
 * Then put the printed GOOGLE_DRIVE_REFRESH_TOKEN in .env (and Railway) and restart the API.
 */
import "dotenv/config";
import http from "node:http";
// Use the lightweight google-auth-library (OAuth2 only) instead of the giant `googleapis`
// meta-package — the latter takes 60s+ to import. This loads in ~50ms.
import { OAuth2Client } from "google-auth-library";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets.readonly", // NEW — Company Cost Model sync
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
];

const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
const redirectUri =
  process.env.GOOGLE_DRIVE_REDIRECT_URI?.trim() || "http://localhost:8787/auth/drive/callback";

if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET in .env first.");
  process.exit(1);
}

const cb = new URL(redirectUri);
const port = Number(cb.port) || 80;
const oauth2 = new OAuth2Client(clientId, clientSecret, redirectUri);
const url = oauth2.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });

// Local capture server — receives Google's redirect and grabs the code automatically.
// (This removes the old copy-paste-the-code step that was failing.)
const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${port}`);
  console.log(`  → request: ${req.method} ${reqUrl.pathname}`);
  if (reqUrl.pathname === "/favicon.ico") { res.writeHead(204); res.end(); return; }
  if (reqUrl.pathname !== cb.pathname) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Waiting for the Google OAuth redirect…");
    return;
  }
  const err = reqUrl.searchParams.get("error");
  const code = reqUrl.searchParams.get("code");
  if (err) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`Authorisation error: ${err}. Return to the terminal.`);
    console.error(`\n❌ Google returned an error: ${err}`);
    console.error("   If 'access_denied': add your email as a Test user on the OAuth consent screen, or set User type = Internal.");
    server.close(); setTimeout(() => process.exit(1), 800); return;
  }
  if (!code) { res.writeHead(400); res.end("No authorisation code in the redirect."); return; }
  console.log("\n✅ Callback received — exchanging the code for a token…");
  try {
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h2 style='font-family:sans-serif'>&#9989; Authorised. Copy the token from your terminal — you can close this tab.</h2>");
    console.log("\n========================================================");
    if (tokens.refresh_token) {
      console.log("PASTE THIS INTO .env (and Railway), then restart the API:\n");
      console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`);
    } else {
      console.warn("No refresh_token returned — revoke this app at https://myaccount.google.com/permissions and run again.");
    }
    console.log("\nScopes granted:", tokens.scope || "(none reported)");
    console.log("========================================================\n");
  } catch (e) {
    res.writeHead(500); res.end("Token exchange failed: " + (e?.message || e));
    console.error("\n❌ Token exchange failed:", e?.message || e);
  } finally {
    server.close();
    setTimeout(() => process.exit(0), 1500); // give the browser time to render before exit
  }
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`\nPort ${port} is in use — stop 'npm run dev' (or whatever is on ${port}) and run this again.`);
  } else {
    console.error("\nCould not start the local capture server:", e.message);
  }
  process.exit(1);
});

server.listen(port, () => {
  console.log(`\nListening for Google's redirect on ${redirectUri}\n`);
  console.log("1) Make sure 'npm run dev' is NOT running.");
  console.log("2) Open this URL, sign in, and approve every permission:\n");
  console.log(url + "\n");
  console.log("3) The browser will redirect back here and the token prints below automatically.\n");
});
