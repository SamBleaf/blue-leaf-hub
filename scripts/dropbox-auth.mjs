#!/usr/bin/env node
/**
 * One-time Dropbox OAuth2 helper (offline refresh token).
 *
 * Prereqs (Dropbox App Console https://www.dropbox.com/developers/apps):
 * 1. Create app → Scoped access → Full Dropbox or App folder (match your needs)
 * 2. Permissions: account_info.read, files.content.read, files.content.write, files.metadata.read, files.metadata.write, sharing.read, sharing.write
 * 3. Add redirect URI = same as DROPBOX_REDIRECT_URI (default below)
 * 4. Put DROPBOX_APP_KEY (= App key) and DROPBOX_APP_SECRET in `.env`
 *
 * Run (from project root):
 *   node scripts/dropbox-auth.mjs
 *
 * On success, DROPBOX_REFRESH_TOKEN is written into `.env` automatically (not printed).
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const DROPBOX_AUTH = "https://www.dropbox.com/oauth2/authorize";
const DROPBOX_TOKEN = "https://api.dropboxapi.com/oauth2/token";

const appKey = process.env.DROPBOX_APP_KEY?.trim();
const appSecret = process.env.DROPBOX_APP_SECRET?.trim();
const redirectUri =
  process.env.DROPBOX_REDIRECT_URI?.trim() || "http://localhost:8787/auth/dropbox/callback";

const SCOPES = [
  "account_info.read",
  "files.content.read",
  "files.content.write",
  "files.metadata.read",
  "files.metadata.write",
  "sharing.read",
  "sharing.write"
].join(" ");

const ENV_KEY = "DROPBOX_REFRESH_TOKEN";
const envPath = path.resolve(process.cwd(), ".env");

/** Redact refresh_token value in JSON text so logs never contain the secret. */
function redactRefreshTokenInRawJson(raw) {
  return String(raw).replace(/("refresh_token"\s*:\s*")([^"\\]+)(")/g, '$1[REDACTED]$3');
}

async function writeRefreshTokenToEnv(refreshToken) {
  let content = "";
  try {
    content = await fs.readFile(envPath, "utf8");
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }

  const lines = content.split(/\r?\n/);
  let replaced = false;
  const next = lines.map((line) => {
    if (/^\s*DROPBOX_REFRESH_TOKEN\s*=/.test(line)) {
      replaced = true;
      return `${ENV_KEY}=${refreshToken}`;
    }
    return line;
  });

  let out = replaced ? next.join("\n") : content.trim() ? `${content.trim()}\n${ENV_KEY}=${refreshToken}` : `${ENV_KEY}=${refreshToken}`;
  if (!out.endsWith("\n")) out += "\n";

  await fs.writeFile(envPath, out, "utf8");
}

if (!appKey || !appSecret) {
  console.error("Set DROPBOX_APP_KEY and DROPBOX_APP_SECRET in .env first.");
  process.exit(1);
}

const authUrl = new URL(DROPBOX_AUTH);
authUrl.searchParams.set("client_id", appKey);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("token_access_type", "offline");
authUrl.searchParams.set("redirect_uri", redirectUri);
authUrl.searchParams.set("scope", SCOPES);

console.log("\n1) Open this URL, sign in, and approve the app:\n");
console.log(authUrl.toString());
console.log(
  "\n2) You will be redirected to your redirect URI with ?code=...\n" +
    "   Copy the code value.\n"
);

const rl = readline.createInterface({ input, output });
const code = (await rl.question("Paste authorisation code here: ")).trim();
rl.close();

if (!code) {
  console.error("No code entered.");
  process.exit(1);
}

const body = new URLSearchParams({
  code,
  grant_type: "authorization_code",
  client_id: appKey,
  client_secret: appSecret,
  redirect_uri: redirectUri
});

try {
  const res = await fetch(DROPBOX_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const rawText = await res.text();

  console.log("\n--- Dropbox token HTTP response ---");
  console.log("HTTP status:", res.status);
  console.log("Raw response text (before JSON.parse):", redactRefreshTokenInRawJson(rawText));

  let json;
  try {
    json = rawText ? JSON.parse(rawText) : {};
  } catch (parseErr) {
    console.error("Response is not valid JSON:", parseErr?.message || parseErr);
    process.exit(1);
  }

  if (!res.ok) {
    console.error("Token error:", json.error || json.error_description || json);
    process.exit(1);
  }

  if (json.refresh_token) {
    await writeRefreshTokenToEnv(json.refresh_token);
    console.log("DROPBOX_REFRESH_TOKEN written to .env successfully");
  } else {
    console.log("Parsed JSON (no refresh_token):", json);
    console.warn("\nNo refresh_token — ensure token_access_type=offline and re-run.");
  }
  console.log("\n--- Done ---\n");
} catch (e) {
  console.error(e);
  process.exit(1);
}
