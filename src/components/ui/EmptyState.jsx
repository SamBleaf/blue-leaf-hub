/**
 * EmptyState — a calm "nothing here yet" block to replace blank space / `—` / dead
 * columns. Presentational. Optional icon and a single action slot.
 *
 * <EmptyState title="No leads need action" hint="You're all caught up." />
 * <EmptyState title="No costs booked yet" action={<button…>Add</button>} compact />
 */
export default function EmptyState({ title, hint, icon, action, compact = false, className = "" }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "py-6" : "py-10"} ${className}`}>
      {icon ? <div className="mb-2 text-muted/70">{icon}</div> : null}
      {title ? <p className="text-sm font-semibold text-ink">{title}</p> : null}
      {hint ? <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">{hint}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
