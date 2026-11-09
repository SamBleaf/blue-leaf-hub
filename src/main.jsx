import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./index.css";

async function clearDevServiceWorkers() {
  if (!import.meta.env.DEV || typeof navigator === "undefined" || !navigator.serviceWorker?.getRegistrations) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    /* ignore */
  }
}

registerSW({
  immediate: true,
  onRegisterError(error) {
    console.warn("[pwa-register]", error);
  }
});

// A new deploy must take over the open page automatically. The SW uses skipWaiting + clientsClaim, so the
// new worker activates and claims this page the moment it is ready — but the page keeps running the OLD bundle
// until something reloads it. Without this, a staff member sees stale UI after a deploy until they manually
// reload a SECOND time (the first reload only swaps the worker in the background). Reload once when control
// passes to a new worker. Guards: PROD only; skip the first-ever registration (no prior controller, e.g. a
// brand-new visit) so it doesn't double-load; and a one-shot flag so it can never loop.
if (import.meta.env.PROD && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;   // first registration, or already reloading
    reloading = true;
    window.location.reload();
  });
}

async function boot() {
  // ── UI Review Mode (non-production) ─────────────────────────────────────────
  // Dead in production: VITE_UI_REVIEW_MODE is unset, so this branch is statically
  // false and the dynamic import is tree-shaken out of the prod bundle. To remove
  // the feature entirely: delete this block, src/ui-review/, and the
  // VITE_UI_REVIEW_MODE branch in src/lib/AuthContext.jsx.
  if (import.meta.env.VITE_UI_REVIEW_MODE === "true") {
    try {
      const { installUiReview } = await import("./ui-review/install.js");
      installUiReview();
    } catch (e) {
      console.error("[ui-review] install failed", e);
    }
  }
  await clearDevServiceWorkers().catch(() => {});
  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
}

boot();
