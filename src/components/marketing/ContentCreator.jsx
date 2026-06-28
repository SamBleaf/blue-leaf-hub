import { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { apiFetch, apiPost } from "../../lib/apiFetch.js";
import AngleCards from "./AngleCards.jsx";
import ReviewSummary from "./ReviewSummary.jsx";
import MediaPickerModal from "./MediaPickerModal.jsx";
import {
  AUDIENCES,
  PLATFORMS,
  PLATFORM_TO_CHANNEL,
  deriveAnglesFromAnalysis,
  deriveJoshLabels,
  deriveRiskLevel,
  DEMO_ANGLES,
  demoDraftFor,
} from "./creatorData.js";

const RISK_ORDER = { low: 0, medium: 1, high: 2 };

// ContentCreator (Run B) — media-first Content Studio at /marketing/studio.
// "The asset is the brief": select media → see analysis → pick an angle → target → generate
// a small platform package → review with Josh labels. Reuses existing /generate + /content.
// No live integrations are required to render the flow: angles come from the stored analysis,
// and generation falls back to clearly-labelled demo drafts when the AI service is unavailable.

const CHANNEL_TO_MODE = {
  instagram: "social_instagram",
  facebook: "social_facebook",
  website: "website",
  email: "email",
};

export default function ContentCreator() {
  const [searchParams] = useSearchParams();
  const assetIdParam = searchParams.get("asset_id");
  const campaignId = searchParams.get("campaign_id");
  const weekStart = searchParams.get("week_start");

  const [mode, setMode] = useState("media"); // "media" | "idea"
  const [asset, setAsset] = useState(null);
  const [assetLoading, setAssetLoading] = useState(Boolean(assetIdParam));
  const [pickerOpen, setPickerOpen] = useState(false);

  const [ideaTopic, setIdeaTopic] = useState("");
  const [selectedAngleId, setSelectedAngleId] = useState(null);
  const [audiences, setAudiences] = useState([]);
  const [platforms, setPlatforms] = useState(PLATFORMS.filter((p) => p.default).map((p) => p.value));

  const [packageDrafts, setPackageDrafts] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [savingIdx, setSavingIdx] = useState(null);
  const [savedIdx, setSavedIdx] = useState({});
  const [savingPackage, setSavingPackage] = useState(false);
  const [packageSaved, setPackageSaved] = useState(false);

  // Resolve ?asset_id= deep link → media asset (inherits Run A seeding contract).
  useEffect(() => {
    let cancelled = false;
    if (!assetIdParam) {
      setAssetLoading(false);
      return undefined;
    }
    setAssetLoading(true);
    (async () => {
      const { ok, data } = await apiFetch(`/api/marketing/media/${assetIdParam}`);
      if (cancelled) return;
      if (ok && data?.asset) setAsset(data.asset);
      setAssetLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [assetIdParam]);

  // Reset angle selection whenever the asset changes.
  useEffect(() => {
    setSelectedAngleId(null);
  }, [asset]);

  const angles = useMemo(() => {
    if (mode === "idea") return [];
    if (!asset) return [];
    const derived = deriveAnglesFromAnalysis(asset.analysis);
    return derived.length ? derived : asset.demo ? DEMO_ANGLES : [];
  }, [asset, mode]);

  const hasMedia = Boolean(asset);
  const selectedAngle = angles.find((a) => a.id === selectedAngleId) || null;
  const canGenerate =
    platforms.length > 0 && (mode === "idea" ? ideaTopic.trim().length > 0 : Boolean(selectedAngle));

  function toggleAudience(v) {
    setAudiences((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : prev.length >= 2 ? prev : [...prev, v]
    );
  }
  function togglePlatform(v) {
    setPlatforms((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }

  async function generatePackage() {
    if (!canGenerate) return;
    setGenerating(true);
    setGenError("");
    setPackageDrafts([]);
    setSavedIdx({});
    setPackageSaved(false);
    const topic = mode === "idea" ? ideaTopic.trim() : selectedAngle?.title || asset?.analysis?.summary || "";
    const results = [];
    // Sequential (not parallel) — gentle on the AI service and deterministic ordering.
    for (const platform of platforms) {
      const channel = PLATFORM_TO_CHANNEL[platform] || "instagram";
      const { ok, data } = await apiPost("/api/marketing/generate", {
        mode: CHANNEL_TO_MODE[channel] || "social_instagram",
        channel,
        pillar: selectedAngle?.pillar || asset?.analysis?.suggested_pillar || "the_work",
        topic,
        user_request: selectedAngle ? `${selectedAngle.title}\n\n${selectedAngle.why}` : topic,
        photo_asset_id: asset?.id && !asset?.demo ? asset.id : undefined,
        photo_analysis: asset?.analysis || undefined,
        content_mode: "educational",
        context: { selected_angle: selectedAngle || null, audience: audiences },
      });
      if (ok && data?.content) {
        results.push({ platform, draft: { content: data.content, review_scores: data.review_scores } });
      } else {
        results.push({ platform, draft: demoDraftFor(platform, selectedAngle) });
      }
    }
    setPackageDrafts(results);
    setGenerating(false);
  }

  function updateDraftBody(idx, body) {
    setPackageDrafts((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, draft: { ...d.draft, content: { ...d.draft.content, body } } } : d))
    );
  }

  async function saveDraft(item, idx) {
    setSavingIdx(idx);
    setGenError("");
    const channel = PLATFORM_TO_CHANNEL[item.platform] || "instagram";
    const { ok, data, error } = await apiPost("/api/marketing/content", {
      channel,
      pillar: selectedAngle?.pillar || asset?.analysis?.suggested_pillar || "the_work",
      topic: selectedAngle?.title || ideaTopic || item.draft.content?.title || "",
      title: item.draft.content?.title || "",
      body: item.draft.content?.body || "",
      cta: item.draft.content?.cta || "",
      hashtags: item.draft.content?.hashtags || [],
      review_scores: item.draft.review_scores || {},
      status: "draft",
      media_source_id: asset?.id && !asset?.demo ? asset.id : null,
      content_mode: "educational",
      generation_metadata: {
        angle_id: selectedAngle?.id || null,
        why: selectedAngle?.why || null,
        audience: audiences,
        platform: item.platform,
      },
    });
    setSavingIdx(null);
    if (ok) setSavedIdx((prev) => ({ ...prev, [idx]: data?.item?.id || data?.id || "saved" }));
    else setGenError(error || "Could not save draft (needs a running API / staging).");
  }

  // Group the generated (non-demo) drafts into a persisted content package and send it to the
  // Approval Queue. Demo drafts are excluded so placeholder copy never reaches the queue.
  async function savePackage() {
    const realDrafts = packageDrafts.filter((d) => !d.draft.demo);
    if (!realDrafts.length) {
      setGenError("No savable drafts — demo drafts cannot be sent to the Approval Queue.");
      return;
    }
    setSavingPackage(true);
    setGenError("");
    let maxRisk = "low";
    const labelSet = new Set();
    const drafts = realDrafts.map((item) => {
      const labels = deriveJoshLabels({ reviewScores: item.draft.review_scores, hasMedia });
      const risk = deriveRiskLevel(item.draft.review_scores);
      labels.forEach((l) => labelSet.add(l));
      if (RISK_ORDER[risk] > RISK_ORDER[maxRisk]) maxRisk = risk;
      return {
        channel: PLATFORM_TO_CHANNEL[item.platform] || "instagram",
        title: item.draft.content?.title || "",
        body: item.draft.content?.body || "",
        cta: item.draft.content?.cta || "",
        hashtags: item.draft.content?.hashtags || [],
        reviewScores: item.draft.review_scores || {},
        operationalLabels: labels,
        riskLevel: risk,
        generationMetadata: {
          angle_id: selectedAngle?.id || null,
          why: selectedAngle?.why || null,
          audience: audiences,
          platform: item.platform,
        },
      };
    });
    const { ok, error } = await apiPost("/api/marketing/packages", {
      topic: selectedAngle?.title || ideaTopic || null,
      pillar: selectedAngle?.pillar || asset?.analysis?.suggested_pillar || null,
      angle: selectedAngle || null,
      audience: audiences,
      platforms,
      sourceAssetId: asset?.id && !asset?.demo ? asset.id : null,
      reviewSummary: { risk: maxRisk, labels: Array.from(labelSet) },
      drafts,
    });
    setSavingPackage(false);
    if (ok) setPackageSaved(true);
    else setGenError(error || "Could not save the package (needs a running API / staging).");
  }

  return (
    <div className="space-y-5 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Marketing</p>
          <h1 className="text-3xl font-semibold tracking-tight text-primary">
            Content Studio — Create from media
          </h1>
          <p className="mt-1 text-sm text-muted">
            The asset is the brief. Pick a photo, choose a story, and draft a small package to review.
          </p>
        </div>
        <Link to="/marketing/studio/legacy" className="text-xs font-semibold text-primary underline">
          Open Legacy Studio
        </Link>
      </header>

      {(campaignId || weekStart) && (
        <div className="rounded-lg bg-page px-3 py-2 text-xs text-muted">
          Planning context{weekStart ? ` · week of ${weekStart}` : ""}{campaignId ? " · campaign linked" : ""}.
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex gap-1 rounded-lg bg-page p-1 w-fit">
        {[
          { id: "media", label: "From media" },
          { id: "idea", label: "From idea" },
        ].map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${
              mode === m.id ? "bg-primary text-white" : "text-muted hover:bg-surface hover:text-ink"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="-mt-2 text-[11px] text-muted">
        <span className="font-medium text-ink">From media</span> starts from a project photo (best — the shot drives the angle);{" "}
        <span className="font-medium text-ink">From idea</span> starts from a topic. You’ll pick which channels to draft for next.
      </p>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* LEFT — ASSET */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Asset</h2>

          {mode === "idea" ? (
            <div className="rounded-card border border-hairline bg-surface p-4">
              <p className="text-sm font-medium text-ink">Create from idea</p>
              <p className="mt-1 text-xs text-muted">
                Educational topics can start without a photo. Add proof before approving or scheduling.
              </p>
              <button
                type="button"
                onClick={() => setMode("media")}
                className="mt-3 rounded-lg border border-hairline bg-page px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface"
              >
                Switch to media
              </button>
            </div>
          ) : assetLoading ? (
            <div className="rounded-card border border-hairline bg-surface p-6 text-sm text-muted">Loading photo…</div>
          ) : asset ? (
            <div className="space-y-3 rounded-card border border-hairline bg-surface p-4">
              <div className="flex h-40 items-center justify-center overflow-hidden rounded-lg bg-page">
                {asset.preview_url ? (
                  <img src={asset.preview_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-muted">{asset.demo ? "Demo asset (no image)" : "No preview"}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {asset.demo && <span className="rounded-full bg-warning/15 px-2 py-0.5 font-medium text-ink">DEMO</span>}
                {asset.stage_detected && (
                  <span className="rounded-full bg-page px-2 py-0.5 text-muted">{asset.stage_detected}</span>
                )}
                <span className="rounded-full bg-page px-2 py-0.5 text-muted">
                  {asset.consent_for_marketing ? "consent ✓" : "no consent"}
                </span>
                {asset.analysis_status && (
                  <span className="rounded-full bg-page px-2 py-0.5 text-muted">analysis: {asset.analysis_status}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="rounded-lg border border-hairline bg-page px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface"
              >
                Change media
              </button>
            </div>
          ) : (
            <div className="rounded-card border border-dashed border-hairline bg-surface p-6 text-center">
              <p className="text-sm font-medium text-ink">Start from a project photo</p>
              <p className="mt-1 text-xs text-muted">Select media from the vault — the analysis becomes the brief.</p>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
              >
                Select media
              </button>
              <button
                type="button"
                onClick={() => setMode("idea")}
                className="mt-2 block w-full text-xs font-medium text-primary underline"
              >
                or create from an idea
              </button>
            </div>
          )}
        </section>

        {/* MIDDLE — DECISIONS */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Decisions</h2>

          {mode === "media" && asset && (
            <div className="rounded-card border border-hairline bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">What we see</p>
              <p className="mt-1 text-sm text-ink">{asset.analysis?.summary || "This photo has not been analysed yet."}</p>
              {Array.isArray(asset.analysis?.visible_facts) && asset.analysis.visible_facts.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-muted">
                  {asset.analysis.visible_facts.slice(0, 4).map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {mode === "idea" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Your idea / topic</label>
              <input
                type="text"
                value={ideaTopic}
                onChange={(e) => setIdeaTopic(e.target.value)}
                placeholder="e.g. Why renovation budgets blow out"
                className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="mt-1 text-xs text-muted">Attach a photo before approving — proof-based posts perform best.</p>
            </div>
          )}

          {mode === "media" && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink">Choose an angle</p>
              <AngleCards angles={angles} selectedId={selectedAngleId} onSelect={setSelectedAngleId} />
            </div>
          )}

          {/* Targeting */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Audience <span className="text-xs font-normal text-muted">(max 2)</span></p>
            <div className="flex flex-wrap gap-1.5">
              {AUDIENCES.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => toggleAudience(a.value)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    audiences.includes(a.value)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-hairline text-muted hover:border-primary/40"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Platforms</p>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => togglePlatform(p.value)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    platforms.includes(p.value)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-hairline text-muted hover:border-primary/40"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {genError && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-ink">{genError}</div>
          )}

          <button
            type="button"
            onClick={generatePackage}
            disabled={!canGenerate || generating}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate package"}
          </button>
        </section>

        {/* RIGHT — PACKAGE */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Package</h2>

          {mode === "idea" && !hasMedia && packageDrafts.length > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-ink">
              Needs photo — attach a project photo before approving or scheduling.
            </div>
          )}

          {packageDrafts.length === 0 && !generating && (
            <div className="rounded-card border border-dashed border-hairline bg-surface p-6 text-center text-sm text-muted">
              {mode === "idea" ? "Enter an idea and generate to see drafts." : "Pick an angle and generate to see drafts."}
            </div>
          )}

          {generating && (
            <div className="rounded-card border border-hairline bg-surface p-6 text-center text-sm text-muted">
              Drafting {platforms.length} platform{platforms.length === 1 ? "" : "s"}…
            </div>
          )}

          {packageDrafts.map((item, idx) => (
            <div key={item.platform} className="space-y-2 rounded-card border border-hairline bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold capitalize text-primary">{item.platform}</span>
                {item.draft.content?.title && <span className="text-xs text-muted">{item.draft.content.title}</span>}
              </div>

              <textarea
                value={item.draft.content?.body || ""}
                onChange={(e) => updateDraftBody(idx, e.target.value)}
                rows={6}
                className="w-full resize-none rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />

              {Array.isArray(item.draft.content?.hashtags) && item.draft.content.hashtags.length > 0 && (
                <p className="text-[11px] text-muted">{item.draft.content.hashtags.map((h) => `#${h}`).join(" ")}</p>
              )}

              <ReviewSummary reviewScores={item.draft.review_scores} hasMedia={hasMedia} why={selectedAngle?.why} />

              <div className="flex items-center gap-2">
                {savedIdx[idx] ? (
                  <span className="text-xs font-medium text-accent">Saved to library</span>
                ) : item.draft.demo ? (
                  <span className="text-xs text-muted">Demo draft — not savable</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => saveDraft(item, idx)}
                    disabled={savingIdx === idx}
                    className="rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
                  >
                    {savingIdx === idx ? "Saving…" : "Save to Library"}
                  </button>
                )}
              </div>
            </div>
          ))}

          {packageDrafts.length > 0 && (
            <div className="rounded-card border border-hairline bg-page p-3">
              {packageSaved ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-accent">
                  <span className="font-semibold">Package sent to Approval Queue.</span>
                  <Link to="/marketing/approval" className="font-semibold text-primary underline">
                    Open Approval Queue
                  </Link>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={savePackage}
                  disabled={savingPackage || packageDrafts.every((d) => d.draft.demo)}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingPackage ? "Saving package…" : "Send package to Approval Queue"}
                </button>
              )}
              {packageDrafts.every((d) => d.draft.demo) && !packageSaved && (
                <p className="mt-2 text-[11px] text-muted">Demo drafts cannot be sent — generate real drafts on staging.</p>
              )}
            </div>
          )}
        </section>
      </div>

      <MediaPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={setAsset} />
    </div>
  );
}
