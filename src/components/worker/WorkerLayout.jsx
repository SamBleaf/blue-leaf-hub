import { useEffect, useRef, useState } from "react";

const PWA_DISMISS_KEY = "blhub_pwa_prompt_dismissed";

export default function WorkerLayout({ children }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const dismissed = useRef(false);

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
      <header className="h-14 bg-primary flex items-center justify-center px-4 shrink-0">
        <img
          src="/brand/logo-white.png"
          alt="Blue Leaf Building"
          className="max-h-8 w-auto"
        />
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
