// TaskDeleteLog — collapsible audit of deleted (soft-deleted → wont_do) tasks for a job, with restore.
// A "delete" keeps the row (status wont_do), so anything logged here is recoverable while restorable.
import { useEffect, useState, useCallback } from "react";
import { apiFetch, apiPost } from "../../lib/apiFetch.js";

export default function TaskDeleteLog({ jobId }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    const { ok, data } = await apiFetch(`/api/workforce/task-deletions?jobId=${jobId}`);
    if (ok) setRows(data?.deletions || []);
  }, [jobId]);
  useEffect(() => { if (open && rows === null) load(); }, [open, rows, load]);

  async function restore(id) {
    setBusy(id);
    const { ok } = await apiPost(`/api/workforce/task-deletions/${id}/restore`, {});
    setBusy(null);
    if (ok) load();
  }

  const count = rows?.length ?? null;
  return (
    <div className="mt-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs text-muted font-medium flex items-center gap-1.5">
        <span aria-hidden>🗑</span> Deleted tasks{count != null ? ` (${count})` : ""} {open ? "▲" : "▼"}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {rows === null ? (
            <p className="text-xs text-muted">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted">No deleted tasks logged for this job.</p>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs rounded-lg border border-hairline bg-white px-2.5 py-1.5">
                <span className="flex-1 min-w-0 truncate text-ink" title={r.title || ""}>{r.title || "(untitled task)"}</span>
                <span className="text-muted shrink-0">
                  {r.deletedByLabel || "someone"} · {r.createdAt ? new Date(r.createdAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                </span>
                {r.restorable ? (
                  <button type="button" disabled={busy === r.id} onClick={() => restore(r.id)} className="shrink-0 px-2 py-0.5 rounded border border-primary/30 text-primary font-medium disabled:opacity-50">
                    {busy === r.id ? "…" : "Restore"}
                  </button>
                ) : (
                  <span className="shrink-0 text-[10px] text-muted">restored / changed</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
