// AngleCards (Run B) — plain-English content angles derived from the asset analysis.
// Single-select (radio semantics); the system never auto-selects.
export default function AngleCards({ angles, selectedId, onSelect }) {
  if (!angles?.length) {
    return (
      <p className="rounded-lg bg-page px-3 py-2 text-sm text-muted">
        No angles yet — analyse the photo (or pick a different one) to see suggested stories.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {angles.map((a) => {
        const active = selectedId === a.id;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a.id)}
            aria-pressed={active}
            className={`w-full rounded-card border p-3 text-left transition ${
              active ? "border-primary bg-primary/5" : "border-hairline bg-surface hover:border-primary/40"
            }`}
          >
            <p className="text-sm font-semibold text-ink">{a.title}</p>
            {a.subtitle && <p className="text-xs capitalize text-muted">{a.subtitle}</p>}
            {a.why && <p className="mt-1 text-[11px] text-muted">{a.why}</p>}
          </button>
        );
      })}
    </div>
  );
}
