/**
 * UI Review Mode — installer (review-only).
 *
 * Replaces window.fetch with a shim that serves local fixtures for the app's data calls
 * (/api/*, Supabase REST /rest/v1/*, Supabase auth /auth/v1/*). Everything else (static
 * assets, the HTML doc) passes straight through to the real fetch. Never touches the network
 * for live data, so the UI renders entirely from fixtures with NO credentials.
 *
 * Called once from src/main.jsx, ONLY when import.meta.env.VITE_UI_REVIEW_MODE === "true".
 */
import { UI_REVIEW } from "./config.js";
import { resolveReview } from "./registry.js";
import "./fixtures/index.js"; // registers all fixture handlers as a side-effect

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body ?? null), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isDataCall(url) {
  return (
    url.includes("/api/") ||
    url.includes("/rest/v1/") ||
    url.includes("/auth/v1/") ||
    url.includes("supabase.co") ||
    url.includes("buildxact") ||
    url.includes("dropbox")
  );
}

// ── Page-ready marker ─────────────────────────────────────────────────────────
// Sets <html data-ui-review-ready="true"> once the mock data calls have settled and
// React has had a tick to paint, so Playwright never screenshots a loading/error state.
// Re-armed on SPA navigation. Review-only.
let pending = 0;
let readyTimer = null;
function markNotReady() {
  if (typeof document !== "undefined") document.documentElement.setAttribute("data-ui-review-ready", "false");
}
function scheduleReady() {
  clearTimeout(readyTimer);
  readyTimer = setTimeout(() => {
    if (pending === 0 && typeof document !== "undefined") {
      document.documentElement.setAttribute("data-ui-review-ready", "true");
    }
  }, 450);
}

export function installUiReview() {
  if (!UI_REVIEW || typeof window === "undefined" || window.__uiReviewInstalled) return;
  window.__uiReviewInstalled = true;

  const realFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const opts = init || (typeof input === "object" && input) || {};

    if (!isDataCall(url)) return realFetch(input, init);

    pending += 1;
    markNotReady();
    try {
      // Supabase auth endpoints — return a benign fake so supabase-js never errors.
      if (url.includes("/auth/v1/")) {
        return jsonResponse({ access_token: "ui-review", token_type: "bearer", expires_in: 3600, user: null });
      }
      const matched = resolveReview(url, opts);
      if (matched !== undefined) return jsonResponse(matched);
      // Safe defaults so an un-fixtured endpoint never crashes a view:
      //   Supabase REST → empty array;  our API → { ok: true } (empty success).
      return jsonResponse(url.includes("/rest/v1/") ? [] : { ok: true });
    } finally {
      pending -= 1;
      scheduleReady();
    }
  };

  // Re-arm the ready marker on SPA route changes (pushState/popstate) so a Playwright
  // navigation to a new route waits for THAT route to settle, not the previous one.
  const reArm = () => { markNotReady(); scheduleReady(); };
  for (const m of ["pushState", "replaceState"]) {
    const orig = window.history[m];
    window.history[m] = function (...args) { const r = orig.apply(this, args); reArm(); return r; };
  }
  window.addEventListener("popstate", reArm);
  window.addEventListener("load", scheduleReady);

  markNotReady();
  scheduleReady(); // pages with no data calls still become ready shortly after load

  document.documentElement.setAttribute("data-ui-review", "1");
  console.info("%c[ui-review] mock data layer active — NOT production", "color:#006c9b;font-weight:bold");
}
