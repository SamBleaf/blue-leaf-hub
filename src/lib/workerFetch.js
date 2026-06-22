import { authFetch } from "./authFetch.js";

// Worker PWA fetch (W01).
// Field workers open the PWA from a per-worker magic link (/worker?token=…). The token is
// captured once and stored, then sent on every worker API call so they never need a Supabase
// account. If no token is present (e.g. an admin viewing the PWA while logged in), it falls
// back to the normal authenticated fetch.

const TOKEN_KEY = "blhub_worker_token";

// Capture a magic-link token from the URL on first import (the worker just opened their link),
// then STRIP it from the address bar + history so the long-lived credential doesn't linger in the
// URL, bookmarks, screenshots, or the Referer header. The persisted localStorage copy keeps the
// worker authenticated, so removing it from the URL is non-breaking.
(function captureWorkerToken() {
  try {
    const url = new URL(window.location.href);
    const t = url.searchParams.get("token");
    if (t) {
      localStorage.setItem(TOKEN_KEY, t);
      url.searchParams.delete("token");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  } catch { /* ignore */ }
})();

export function getWorkerToken() {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
}

export function clearWorkerToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

// Fetch a worker endpoint, sending the magic-link token in the x-worker-token HEADER (not the URL)
// so the credential never leaks via access logs, browser history, or the Referer header. Falls back
// to the normal authenticated fetch when no worker token is present (e.g. an admin viewing the PWA).
export function workerFetch(path, opts = {}) {
  const token = getWorkerToken();
  if (!token) return authFetch(path, opts);
  return fetch(path, { ...opts, headers: { ...(opts.headers || {}), "x-worker-token": token } });
}
