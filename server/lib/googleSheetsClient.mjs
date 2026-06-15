// Lightweight Google Sheets reader — OAuth refresh-token + REST. Deliberately avoids the giant
// `googleapis` meta-package (which takes 60s+ to import). Reuses the existing GOOGLE_DRIVE_* OAuth
// credentials (same account, +spreadsheets.readonly scope). Read-only.
import { config as dotenvConfig } from "dotenv";
const { parsed: _env = {} } = dotenvConfig();
const envv = (k) => process.env[k]?.trim() || _env[k]?.trim();

export function googleSheetsConfigured() {
  return !!(envv("GOOGLE_DRIVE_CLIENT_ID") && envv("GOOGLE_DRIVE_CLIENT_SECRET") && envv("GOOGLE_DRIVE_REFRESH_TOKEN"));
}

let _cache = { token: null, exp: 0 };
async function accessToken() {
  if (_cache.token && Date.now() < _cache.exp - 60_000) return _cache.token;
  const body = new URLSearchParams({
    client_id: envv("GOOGLE_DRIVE_CLIENT_ID"),
    client_secret: envv("GOOGLE_DRIVE_CLIENT_SECRET"),
    refresh_token: envv("GOOGLE_DRIVE_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("Google token refresh failed: " + (j.error_description || j.error || r.status));
  _cache = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return j.access_token;
}

// Read several named ranges in one call. Returns { [rangeName]: rows[][] }.
export async function readNamedRanges(spreadsheetId, names, { unformatted = true } = {}) {
  if (!spreadsheetId) throw new Error("No spreadsheetId");
  const at = await accessToken();
  const q = names.map((n) => "ranges=" + encodeURIComponent(n)).join("&")
    + (unformatted ? "&valueRenderOption=UNFORMATTED_VALUE" : "");
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${q}`, {
    headers: { Authorization: "Bearer " + at },
  });
  const j = await r.json();
  if (j.error) throw new Error("Google Sheets API: " + j.error.message);
  const out = {};
  (j.valueRanges || []).forEach((vr, i) => { out[names[i]] = vr.values || []; });
  return out;
}
