import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const PWA_DISMISS_KEY = "blhub_pwa_prompt_dismissed";

// Show back arrow on all worker pages except home
const HOME_PATHS = ["/worker", "/worker/"];

// onBack — override what the back button does (for multi-step flows within one route)
export default function WorkerLayout({ children, onBack }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const dismissed = useRef(false);

  const isHome = HOME_PATHS.includes(location.pathname);
  const handleBack = onBack ?? (() => navigate(-1));

  useEffect(() => {
    if (localStorage.getItem(PWA_DISMISS_KEY)) return;

    function handler(e) {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    }
    window.addEventListener("beforeinstallprompt", handler);
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
  }

  return (
    <div className="flex min-h-screen flex-col bg-page">
      {/* Blue header */}
      <header className="h-14 bg-primary flex items-center px-4 shrink-0 relative">
        {/* Back button — all pages except home */}
        {!isHome ? (
          <button
            type="button"
            onClick={handleBack}
            aria-label="Back"
            className="flex items-center justify-center w-9 h-9 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition shrink-0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        ) : (
          <div className="w-9 shrink-0" />
        )}

        {/* Centred logo */}
        <div className="flex-1 flex justify-center">
          <img
            src="/brand/logo-white.png"
            alt="Blue Leaf Building"
            className="max-h-8 w-auto"
          />
        </div>

        {/* Right spacer to keep logo centred */}
        <div className="w-9 shrink-0" />
      </header>

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

      {/* Page content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
