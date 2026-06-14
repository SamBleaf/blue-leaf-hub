import { authFetch } from "./authFetch.js";

// Worker PWA fetch (W01).
// Field workers open the PWA from a per-worker magic link (/worker?token=…). The token is
// captured once and stored, then sent on every worker API call so they never need a Supabase
// account. If no token is present (e.g. an admin viewing the PWA while logged in), it falls
// back to the normal authenticated fetch.

const TOKEN_KEY = "blhub_worker_token";

// Capture a magic-link token from the URL on first import (the worker just opened their link).
(function captureWorkerToken() {
  try {
    const t = new URL(window.location.href).searchParams.get("token");
    if (t) localStorage.setItem(TOKEN_KEY, t);
  } catch { /* ignore */ }
})();

export function getWorkerToken() {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
}

export function clearWorkerToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

// Fetch a worker endpoint, injecting the magic-link token when present.
export function workerFetch(path, opts = {}) {
  const token = getWorkerToken();
  if (!token) return authFetch(path, opts);
  const sep = path.includes("?") ? "&" : "?";
  const url = `${path}${sep}token=${encodeURIComponent(token)}`;
  return fetch(url, opts);
}
