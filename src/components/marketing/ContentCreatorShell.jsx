import { useSearchParams, useNavigate } from "react-router-dom";

// Content Studio shell (Run A placeholder). The full media-first Creator ships in Run B.
// Honours ?asset_id=, ?campaign_id=, ?week_start= deep links (carried through to Legacy Studio).
export default function ContentCreatorShell() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const assetId = params.get("asset_id");
  const campaignId = params.get("campaign_id");
  const weekStart = params.get("week_start");

  function openLegacy() {
    const qs = new URLSearchParams();
    if (assetId) qs.set("asset_id", assetId);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    navigate(`/marketing/studio/legacy${suffix}`);
  }

  return (
    <div className="space-y-6 pb-24">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Marketing</p>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">
          Content Studio — Create from media
        </h1>
      </header>

      <div className="max-w-2xl space-y-4 rounded-card border border-hairline bg-surface p-6">
        <p className="text-sm leading-relaxed text-ink">
          The new Content Studio will start from real project photos, videos, and drone footage. The
          asset becomes the brief: AI analyses the media, suggests content angles, then helps create a
          multi-platform content package for Josh to review.
        </p>

        <p className="text-sm font-medium text-muted">Media-first Creator planned for Run B.</p>

        {(campaignId || weekStart) && (
          <p className="rounded-lg bg-page px-3 py-2 text-xs text-muted">
            Planning context received{weekStart ? ` · week of ${weekStart}` : ""}
            {campaignId ? " · campaign linked" : ""}. The new Creator will use this; for now, use Legacy
            Studio.
          </p>
        )}

        <div className="rounded-lg border border-hairline bg-page p-4">
          <p className="text-sm text-ink">
            Use Legacy Studio for the current prompt-first generator until the new Creator is built.
          </p>
          <button
            type="button"
            onClick={openLegacy}
            className="mt-3 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90"
          >
            Open Legacy Studio
          </button>
        </div>
      </div>
    </div>
  );
}
