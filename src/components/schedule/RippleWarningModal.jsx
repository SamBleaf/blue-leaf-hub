export default function RippleWarningModal({ preview, onConfirm, onBreakDependency, onCancel, busy }) {
  if (!preview) return null;
  const affected = preview.affected || [];
  const downstream = affected.slice(1);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-card border border-hairline bg-surface p-5 shadow-xl">
        <h2 className="text-lg font-bold text-primary">Confirm schedule ripple</h2>
        <p className="mt-2 text-sm text-muted">
          Moving <span className="font-semibold text-ink">{affected[0]?.name || "this task"}</span> will push {downstream.length} downstream task{downstream.length === 1 ? "" : "s"}.
        </p>
        {downstream.length ? (
          <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-hairline bg-page">
            {downstream.map((task) => (
              <div key={task.id} className="border-b border-hairline px-3 py-2 text-sm last:border-b-0">
                <p className="font-semibold text-ink">{task.name}</p>
                <p className="text-xs text-muted">{task.old_start_date || "-"} to {task.new_start_date || "-"} / ends {task.new_end_date || "-"}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-muted">No downstream tasks will move.</p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm font-semibold text-muted">Cancel</button>
          <button type="button" onClick={onBreakDependency} disabled={busy} className="rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-ink disabled:opacity-50">Adjust only this task</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Saving..." : "Confirm ripple"}
          </button>
        </div>
      </div>
    </div>
  );
}
