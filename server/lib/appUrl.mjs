// Single source of truth for the app's public base URL.
//
// Used to build links that go OUT to people (invite emails, progress-claim /
// variation emails, WHS share links, etc.). The canonical production host is
// https://blueleafhub.com.au (single-origin on Railway — the Node server serves
// both the API and the built SPA).
//
// HARD RULE: never emit a localhost / non-absolute link in an outbound email.
// A misconfigured APP_URL (e.g. left as http://localhost:5173 in Railway) was the
// cause of "Set up your account does nothing" — the button pointed at localhost.
// So we IGNORE an APP_URL that is empty, not absolute http(s), or localhost, and
// fall back to the canonical host. Set ALLOW_LOCALHOST_LINKS=1 to opt back into a
// localhost APP_URL for local invite-email testing.
//
// NOTE: crmRoutes (unsubscribe) and portal notifications historically used
// different fallback domains (hub.blueleafbuilding.com.au / blueleafbuilding.com.au).
// Those are intentionally NOT migrated here until the intended domain is confirmed.
const CANONICAL = "https://blueleafhub.com.au";

export function appBaseUrl() {
  const raw = (process.env.APP_URL || "").trim().replace(/\/$/, "");
  const isAbsolute = /^https?:\/\//i.test(raw);
  const isLocal = /(localhost|127\.0\.0\.1|0\.0\.0\.0|:5173|:3000|:8787)/i.test(raw);
  if (!isAbsolute) return CANONICAL;
  if (isLocal && process.env.ALLOW_LOCALHOST_LINKS !== "1") return CANONICAL;
  return raw;
}
