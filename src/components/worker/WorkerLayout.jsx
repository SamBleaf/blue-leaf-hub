import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isWorkerPreview, clearPreviewEmployeeId } from "../../lib/workerFetch.js";

const PWA_DISMISS_KEY = "blhub_pwa_prompt_dismissed";

// Show back arrow on all worker pages except home
const HOME_PATHS = ["/worker", "/worker/"];

// onBack — override what the back button does (for multi-step flows within one route)
export default function WorkerLayout({ children, onBack }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  const dismissed = useRef(false);

  // Field crews work in poor signal — show a clear offline banner so a worker knows why a save
  // might not be going through, rather than tapping into silent failures.
  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);

  const isHome = HOME_PATHS.includes(location.pathname);
  const handleBack = onBack ?? (() => navigate(-1));
  const preview = isWorkerPreview();

  function exitPreview() {
    clearPreviewEmployeeId();
    navigate("/workforce/team");
  }

  useEffect(() => {
    if (localStorage.getItem(PWA_DISMISS_KEY)) return;

    function handler(e) {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    }
    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari never fires beforeinstallprompt, so the Android-style Install button
    // can't appear. Detect iPhone/iPad (and that we're not already running installed)
    // and show the manual "Share → Add to Home Screen" steps instead.
    const ua = window.navigator.userAgent || "";
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (isIOS && !isStandalone) setShowIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
      setDeferredPrompt(null);
      setShowInstall(false);
    });
  }

  function handleDismiss() {
    dismissed.current = true;
    localStorage.setItem(PWA_DISMISS_KEY, "1");
    setShowInstall(false);
    setShowIosHint(false);
  }

  return (
    <div className="flex min-h-screen flex-col bg-page">
      {/* Blue header */}
      <header className="min-h-[3.5rem] bg-primary flex items-center px-4 shrink-0 relative" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        {/* Back button — all pages except home */}
        {!isHome ? (
          <button
            type="button"
            onClick={handleBack}
            aria-label="Back"
            className="flex items-center justify-center w-11 h-11 -ml-1.5 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition shrink-0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        ) : (
          <div className="w-9 shrink-0" />
        )}

        {/* Centred logo — white leaf + wordmark */}
        <div className="flex-1 flex items-center justify-center gap-2">
          <img
            src="/brand/BLB_Icon_White.svg"
            alt=""
            aria-hidden="true"
            className="h-8 w-auto"
          />
          <img
            src="/brand/logo-white.png"
            alt="Blue Leaf Building"
            className="max-h-8 w-auto"
          />
        </div>

        {/* Right spacer to keep logo centred */}
        <div className="w-9 shrink-0" />
      </header>

      {/* Admin "preview as worker" banner — read-only; this is NOT the worker's own device */}
      {preview && (
        <div className="bg-indigo-600 text-white text-xs font-medium px-4 py-2 flex items-center justify-between gap-3 shrink-0">
          <span>👁 Preview mode — read-only. You&apos;re seeing this worker&apos;s app; you can&apos;t submit or complete on their behalf.</span>
          <button type="button" onClick={exitPreview} className="shrink-0 rounded-md bg-white/20 px-2.5 py-1 font-semibold hover:bg-white/30">Exit preview</button>
        </div>
      )}

      {/* Offline banner — field connectivity is unreliable */}
      {offline && (
        <div className="bg-amber-500 text-white text-xs font-medium px-4 py-1.5 text-center shrink-0">
          You&apos;re offline — changes can&apos;t be saved until you reconnect.
        </div>
      )}

      {/* PWA install banner */}
      {showInstall && (
        <div className="bg-white border-b border-hairline px-4 py-3 flex items-start gap-3">
          <span className="text-xl leading-none">📱</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ink leading-snug">Add to your home screen for quick access</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={handleInstall}
              className="text-sm font-semibold text-primary"
            >
              Install
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-sm text-muted"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* iOS install hint — Safari has no install prompt, so guide the manual step */}
      {showIosHint && !showInstall && (
        <div className="bg-white border-b border-hairline px-4 py-3 flex items-start gap-3">
          <span className="text-xl leading-none">📲</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ink leading-snug">
              To install: tap the Share button
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="inline-block w-4 h-4 mx-0.5 -mt-0.5 align-middle text-primary">
                <path d="M12 16V4" /><path d="m8 8 4-4 4 4" /><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
              </svg>
              at the bottom of Safari, then <span className="font-semibold">Add to Home Screen</span>.
            </p>
          </div>
          <button type="button" onClick={handleDismiss} className="text-sm text-muted shrink-0">✕</button>
        </div>
      )}

      {/* Page content */}
      <main className="flex-1 overflow-y-auto" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {children}
      </main>
    </div>
  );
}
