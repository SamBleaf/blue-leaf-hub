import { useState, useEffect } from "react";
import { apiFetch } from "../../lib/apiFetch.js";
import { DEMO_ASSET } from "./creatorData.js";
import { DemoBanner } from "./MarketingStateBanner.jsx";

// MediaPickerModal (Run B) — pick a media asset from the vault. Falls back to a safe
// demo asset when the vault is unreachable (no staging data), so the flow stays usable.
export default function MediaPickerModal({ open, onClose, onSelect }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { ok, data } = await apiFetch("/api/marketing/media?limit=24");
      if (cancelled) return;
      const list = data?.assets || data?.media || data?.items || [];
      if (ok) {
        // Live response (even if empty) → real media or a true empty state, never demo.
        setAssets(list);
        setUsingDemo(false);
      } else {
        setAssets([DEMO_ASSET]);
        setUsingDemo(true);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-card bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary">Select media</h2>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">
            Close
          </button>
        </div>

        {usingDemo && (
          <div className="mb-3">
            <DemoBanner note="Showing a demo asset so you can try the flow." />
          </div>
        )}

        {loading ? (
          <p className="p-6 text-sm text-muted">Loading media…</p>
        ) : assets.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">
            No media yet. Upload site photos from the Media tab, then pick one here.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {assets.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onSelect(a);
                  onClose();
                }}
                className="overflow-hidden rounded-card border border-hairline bg-page text-left transition hover:border-primary/40"
              >
                <div className="flex h-28 items-center justify-center bg-page">
                  {a.preview_url ? (
                    <img src={a.preview_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-muted">{a.demo ? "Demo asset" : "No preview"}</span>
                  )}
                </div>
                <div className="p-2">
                  <p className="truncate text-xs font-medium text-ink">
                    {a.original_filename || a.analysis?.summary || "Untitled asset"}
                  </p>
                  <p className="text-[11px] text-muted">
                    {a.stage_detected || a.media_type || "media"}
                    {a.analysis_status ? ` · ${a.analysis_status}` : ""}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
