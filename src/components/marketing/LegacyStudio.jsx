import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import ContentGenerator from "./ContentGenerator.jsx";
import { apiFetch } from "../../lib/apiFetch.js";

// Legacy Studio (temporary) — hosts the unchanged prompt-first ContentGenerator at
// /marketing/studio/legacy. Replaces the old in-page tab-state seeding with a query-param
// deep link: ?asset_id=<id> is fetched and handed to ContentGenerator as seedAsset, so the
// Media → "Open in Content Studio" flow still pre-fills the generator across the route boundary.
export default function LegacyStudio() {
  const [params] = useSearchParams();
  const assetId = params.get("asset_id");

  const [seedAsset, setSeedAsset] = useState(null);
  const [loadingAsset, setLoadingAsset] = useState(Boolean(assetId));
  const [assetError, setAssetError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!assetId) {
      setLoadingAsset(false);
      return;
    }
    setLoadingAsset(true);
    setAssetError(null);
    (async () => {
      const { ok, data, error } = await apiFetch(`/api/marketing/media/${assetId}`);
      if (cancelled) return;
      if (ok && data?.asset) setSeedAsset(data.asset);
      else setAssetError(error || "Couldn't load that photo — you can still write a post below.");
      setLoadingAsset(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return (
    <div className="space-y-4 pb-24">
      <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-ink">
        <span className="font-semibold">Legacy Studio (temporary).</span> This is the original
        prompt-first generator. The new media-first Content Studio is on the way —{" "}
        <Link to="/marketing/studio" className="font-semibold text-primary underline">
          see what is coming
        </Link>
        .
      </div>

      {assetError && (
        <div className="rounded-lg border border-hairline bg-page px-4 py-2 text-xs text-muted">
          {assetError}
        </div>
      )}

      {loadingAsset ? (
        <div className="rounded-card border border-hairline bg-surface p-6 text-sm text-muted">
          Loading photo…
        </div>
      ) : (
        <ContentGenerator seedAsset={seedAsset} onSeedConsumed={() => setSeedAsset(null)} />
      )}
    </div>
  );
}
