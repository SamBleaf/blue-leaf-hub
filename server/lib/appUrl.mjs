// Single source of truth for the app's public base URL.
//
// Used to build links that go OUT to people (invite emails, progress-claim /
// variation emails, WHS share links, etc.). The canonical production host is
// https://blueleafhub.com.au (single-origin on Railway — the Node server serves
// both the API and the built SPA). Always prefer the APP_URL env var; the
// fallback exists so a missing/forgotten env var still produces a WORKING link
// rather than a localhost one (the bug that broke a teammate's invite link).
//
// NOTE: crmRoutes (unsubscribe) and portal notifications historically used
// different fallback domains (hub.blueleafbuilding.com.au / blueleafbuilding.com.au).
// Those are intentionally NOT migrated here until the intended domain is confirmed.
export function appBaseUrl() {
  return (process.env.APP_URL || "https://blueleafhub.com.au").replace(/\/$/, "");
}
