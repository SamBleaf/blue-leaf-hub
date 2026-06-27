import { useCallback, useEffect, useRef, useState } from "react";
import { portalGet, portalPatch } from "../../lib/clientPortalApi.js";

/** Compact relative time ("just now", "3h ago", or a date). */
function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24);
  if (dd < 7) return `${dd}d ago`;
  return d.toLocaleDateString();
}

/**
 * In-portal notification bell. Polls the client's own notifications (scoped
 * server-side to target_user_id), shows an unread badge, and marks read on click.
 * `tone="light"` renders white-on-chrome for the portal sidebar/header.
 */
export default function NotificationBell({ projectId, tone = "light" }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    const { ok, data } = await portalGet(projectId, "notifications");
    if (ok) setItems(data?.notifications || []);
  }, [projectId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const unread = items.filter((n) => !n.readAt).length;

  async function markRead(n) {
    if (n.readAt) return;
    setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    await portalPatch(projectId, `notifications/${n.id}/read`);
  }

  const iconColor = tone === "light" ? "text-white/70 hover:text-white" : "text-ink/70 hover:text-ink";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        onClick={() => setOpen((o) => !o)}
        className={`relative transition ${iconColor}`}
      >
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#D4A24C] px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 max-h-96 w-72 overflow-y-auto rounded-xl border border-hairline bg-surface text-ink shadow-lg">
          <div className="border-b border-hairline px-4 py-2.5 text-[13px] font-bold">Notifications</div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted">You&rsquo;re all caught up.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => markRead(n)}
                className={`block w-full border-b border-hairline px-4 py-3 text-left transition last:border-b-0 hover:bg-page ${n.readAt ? "opacity-60" : ""}`}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-primary"}`} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold leading-snug">{n.title}</p>
                    {n.body ? <p className="mt-0.5 text-xs leading-snug text-muted">{n.body}</p> : null}
                    <p className="mt-1 text-[10px] text-muted">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
