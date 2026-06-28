// Shared marketing data-state banners (Completion Batch 1).
// One consistent vocabulary across every marketing surface so the user can always tell
// whether they are looking at LIVE, EMPTY, or DEMO data — and that demo never implies a save.

// DEMO: shown only when the marketing API is unreachable in this environment.
// Migration 122 is applied to the main DB, so demo no longer means "needs 122" — it means
// the API itself could not be reached (e.g. running the UI with no API/auth).
export function DemoBanner({ note }) {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-ink">
      <span className="font-semibold">Preview data.</span> The marketing API isn’t reachable here,
      so this shows example content — nothing on this screen is live or saved.
      {note ? <span className="text-muted"> {note}</span> : null}
    </div>
  );
}

// ERROR: a soft, non-blocking note when an action or load returned an error string.
export function ErrorNote({ error }) {
  if (!error) return null;
  return (
    <div className="rounded-lg border border-hairline bg-page px-3 py-2 text-xs text-muted">{error}</div>
  );
}

// EMPTY (live): the API responded fine, there is just nothing here yet. Teaches the next step.
export function EmptyState({ title, children }) {
  return (
    <div className="rounded-card border border-hairline bg-page p-6 text-sm text-muted">
      <p className="font-semibold text-ink">{title}</p>
      {children ? <p className="mt-1">{children}</p> : null}
    </div>
  );
}
