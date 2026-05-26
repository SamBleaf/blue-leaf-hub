import { useState, useEffect, useCallback, useMemo } from "react";
import { authFetch } from "../../lib/authFetch.js";
import { getSupabase } from "../../lib/supabaseClient.js";

const POSITION_LABELS = {
  hook: "Establishing",
  context: "Context",
  build: "Activity",
  proof: "Detail",
  cta: "Reveal",
};

const MODE_LABELS = {
  brand_awareness: "Brand awareness",
  generate_enquiries: "Generate enquiries",
  educate: "Educational",
  build_authority: "Build authority",
  seo: "SEO",
};

function clipKey(clip) {
  return String(clip.frame_index);
}

function frameThumb(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = sb.storage.from("marketing-media").getPublicUrl(path);
  return data?.publicUrl || null;
}

export default function VideoReview({ assetId, onDone, onGenerateFinal }) {
  const [clips, setClips] = useState([]);
  const [story, setStory] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [swapping, setSwapping] = useState(null);
  const [showTooltip, setShowTooltip] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await authFetch(`/api/marketing/media/${assetId}/story-sequence`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to load story");
      if (!j.ready) {
        setStory(null);
        setClips([]);
        return;
      }
      const seq = j.story_sequence;
      setStory(seq);
      const list = seq?.clips || [];
      setClips(list);
      setDecisions((prev) => {
        const next = { ...prev };
        for (const c of list) {
          const k = clipKey(c);
          if (!next[k]) next[k] = "keep";
        }
        return next;
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => { load(); }, [load]);

  const keepCount = useMemo(
    () => clips.filter((c) => (decisions[clipKey(c)] || "keep") === "keep").length,
    [clips, decisions],
  );

  // Minimum clips to proceed: 1 for very short videos, 3 for longer ones.
  const minKeep = Math.min(clips.length, 3);

  const totalSecs = useMemo(
    () => clips.reduce((n, c) => {
      if ((decisions[clipKey(c)] || "keep") === "remove") return n;
      return n + (c.duration_secs || 5);
    }, 0),
    [clips, decisions],
  );

  const captionPreview = useMemo(() => {
    const kept = clips.filter((c) => (decisions[clipKey(c)] || "keep") === "keep");
    const text = kept.map((c) => c.caption).filter(Boolean).join(" ");
    return text.length > 220 ? `${text.slice(0, 217)}…` : text;
  }, [clips, decisions]);

  function setDecision(clip, value) {
    setDecisions((prev) => ({ ...prev, [clipKey(clip)]: value }));
  }

  async function wantAlternative(clip, index) {
    const key = clipKey(clip);
    setSwapping(key);
    setError("");
    try {
      const used = clips
        .map((c, i) => (i !== index ? c.frame_index : null))
        .filter((n) => n != null);
      const params = new URLSearchParams({
        position: clip.position,
        exclude: used.join(","),
      });
      const r = await authFetch(`/api/marketing/media/${assetId}/clip-alternative?${params}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No alternative found");

      const alt = j.clip;
      setClips((prev) => prev.map((c, i) => (i === index ? {
        ...c,
        frame_index: alt.frame_index,
        timestamp_secs: alt.timestamp_secs,
        storage_path: alt.storage_path,
        overall_score: alt.overall_score,
        thumbnail_url: alt.thumbnail_url,
        primary_subject: alt.primary_subject,
        caption: alt.primary_subject || c.caption,
      } : c)));
      setDecisions((prev) => ({ ...prev, [String(alt.frame_index)]: "keep" }));
    } catch (e) {
      setError(e.message);
    } finally {
      setSwapping(null);
    }
  }

  async function generateFinal() {
    setGenerating(true);
    setError("");
    try {
      const approvedClips = clips
        .filter((c) => (decisions[clipKey(c)] || "keep") === "keep")
        .map((c) => ({
          ...c,
          thumbnail_url: undefined,
        }));

      const story_sequence = {
        ...story,
        clips: approvedClips,
        reviewed_at: new Date().toISOString(),
      };

      const r = await authFetch("/api/marketing/assemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_asset_id: assetId, story_sequence }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save review");

      onGenerateFinal?.(j);
      onDone?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-muted py-8 text-center">Loading AI edit…</div>;
  }

  if (!story?.clips?.length) {
    return (
      <div className="text-sm text-muted py-8 text-center border border-dashed border-hairline rounded-xl">
        Story sequence not ready yet.
      </div>
    );
  }

  const confidence = story.confidence ?? 0;
  const confPct = Math.min(100, Math.max(0, confidence));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Review AI edit</h2>
          <p className="text-sm text-muted mt-0.5">
            AI selected {clips.length} clip{clips.length !== 1 ? "s" : ""} · {totalSecs} seconds
            {story.objective ? ` · ${MODE_LABELS[story.objective] || story.objective}` : ""}
          </p>
        </div>
        {onDone && (
          <button type="button" onClick={onDone} className="text-sm text-muted hover:text-ink shrink-0">
            Close
          </button>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {clips.map((clip, index) => {
          const key = clipKey(clip);
          const decision = decisions[key] || "keep";
          const removed = decision === "remove";
          const thumb = clip.thumbnail_url || frameThumb(clip.storage_path);

          return (
            <div
              key={`${key}-${index}`}
              className={[
                "rounded-xl border overflow-hidden transition-all",
                removed ? "opacity-45 border-hairline" : "border-hairline bg-surface",
              ].join(" ")}
            >
              <div className="aspect-video bg-slate-100 relative">
                {thumb ? (
                  <img src={thumb} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl">🎬</div>
                )}
              </div>
              <div className="px-2 py-2 space-y-2">
                <p className={`text-xs font-medium text-center ${removed ? "line-through text-muted" : "text-ink"}`}>
                  {POSITION_LABELS[clip.position] || clip.position}
                </p>
                <div className="flex justify-center gap-1">
                  <button
                    type="button"
                    title="Keep"
                    onClick={() => setDecision(clip, "keep")}
                    className={`text-sm px-2 py-1 rounded ${decision === "keep" ? "bg-emerald-100 ring-1 ring-emerald-400" : "hover:bg-slate-100"}`}
                  >
                    👍
                  </button>
                  <button
                    type="button"
                    title="Remove"
                    onClick={() => setDecision(clip, "remove")}
                    className={`text-sm px-2 py-1 rounded ${decision === "remove" ? "bg-red-100 ring-1 ring-red-300" : "hover:bg-slate-100"}`}
                  >
                    👎
                  </button>
                  <button
                    type="button"
                    title="Want alternative"
                    disabled={swapping === key}
                    onClick={() => wantAlternative(clip, index)}
                    className={`text-sm px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40 ${decision === "want_alt" ? "bg-amber-100 ring-1 ring-amber-300" : ""}`}
                  >
                    {swapping === key ? "…" : "🔁"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {captionPreview && (
        <div>
          <p className="text-xs font-medium text-muted mb-1">Caption preview</p>
          <p className="text-sm text-ink leading-relaxed italic border-l-2 border-primary/30 pl-3">
            &ldquo;{captionPreview}&rdquo;
          </p>
        </div>
      )}

      {story.assumptions_detected && (
        <div className="border border-amber-300 bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-800">
          ⚠ Low confidence on some clips — verify this content matches what was actually shot before publishing.
        </div>
      )}

      <div className="relative flex items-center gap-3 text-xs flex-wrap">
        <span className="text-muted shrink-0">Confidence:</span>
        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden max-w-[200px]">
          <div
            className={`h-full rounded-full ${confPct >= 80 ? "bg-emerald-500" : confPct >= 70 ? "bg-amber-500" : "bg-red-400"}`}
            style={{ width: `${confPct}%` }}
          />
        </div>
        <span className="font-medium text-ink">{confPct}%</span>
        <button
          type="button"
          className="text-primary hover:underline relative"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onFocus={() => setShowTooltip(true)}
          onBlur={() => setShowTooltip(false)}
        >
          What does this mean?
        </button>
        {showTooltip && (
          <div className="absolute z-10 left-0 top-full mt-1 max-w-xs text-xs bg-ink text-white rounded-lg px-3 py-2 shadow-lg">
            Blue Leaf Hub scored the clip selection and caption against your project data. Above 80% = high confidence. Below 70% = some assumptions were made — review the caption before publishing.
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={generateFinal}
        disabled={generating || keepCount < minKeep}
        className="w-full bg-primary text-white text-sm font-medium py-3 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {generating ? "Saving…" : "Generate Final →"}
      </button>
      {keepCount < minKeep && (
        <p className="text-xs text-muted text-center">
          Approve at least {minKeep} clip{minKeep !== 1 ? "s" : ""} (👍) to continue
        </p>
      )}
    </div>
  );
}
