import { NavLink } from "react-router-dom";

/**
 * BaseLayout — the shared responsive shell for the field app (and, later, the client portal).
 * Mobile-first: a coloured sticky header + a fixed bottom nav, with the content constrained to a
 * phone-width column so it reads like a purpose-built field app even on desktop. Honours iOS safe
 * areas. Chrome colour is passed in so each role/app has its own identity.
 *
 * Props:
 *   navItems: [{ to, label, short, icon (JSX), end? }]
 *   chromeColor, headerTitle, headerSub, userEmail, onSignOut, banner (JSX), children
 */
export default function BaseLayout({
  navItems = [],
  chromeColor = "#006c9b",
  headerTitle,
  headerSub,
  onSignOut,
  banner = null,
  children,
}) {
  return (
    <div className="min-h-screen bg-page flex flex-col">
      <header className="sticky top-0 z-20 text-white" style={{ backgroundColor: chromeColor, paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{headerTitle}</p>
            {headerSub ? <p className="text-[11px] text-white/70 truncate">{headerSub}</p> : null}
          </div>
          {onSignOut ? (
            <button type="button" onClick={onSignOut} className="shrink-0 text-[11px] font-medium text-white/80 hover:text-white">
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      {banner ? <div className="w-full">{banner}</div> : null}

      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-4 pb-24">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-20 bg-surface border-t border-hairline" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-lg mx-auto flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                  isActive ? "text-primary" : "text-muted hover:text-ink"
                }`
              }
            >
              <span className="h-6 w-6 flex items-center justify-center">{item.icon}</span>
              {item.short || item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
