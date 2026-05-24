import { useState, useEffect, useRef, useCallback } from "react";
import ReviewPanel from "./ReviewPanel.jsx";
import { authFetch } from "../../lib/authFetch.js";
import { getSupabase } from "../../lib/supabaseClient.js";

function storageUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = sb.storage.from("marketing-media").getPublicUrl(path);
  return data?.publicUrl || null;
}

// Map frontend channel value → backend mode (MODE_PROMPTS keys)
const CHANNEL_TO_MODE = {
  instagram:    "social_instagram",
  facebook:     "social_facebook",
  website:      "website",
  email:        "email",
  client_guide: "client_guide",
  landing_page: "cta",
  other:        "social_instagram",
};

const CHANNELS = [
  { value: "instagram",    label: "Instagram",     hint: "Short caption + hashtags, visual-first" },
  { value: "facebook",     label: "Facebook",      hint: "Longer post, community feel, link-friendly" },
  { value: "website",      label: "Website Copy",  hint: "SEO-optimised, professional tone" },
  { value: "email",        label: "Email",         hint: "Client nurture, personalised, CTA-driven" },
  { value: "client_guide", label: "Client Guide",  hint: "Education piece, step-by-step, reassuring" },
  { value: "landing_page", label: "Landing Page",  hint: "Conversion-focused, clear value prop" },
];

const PILLARS = [
  { value: "how_we_build",     label: "How We Build",     colour: "bg-blue-100 text-blue-700",   desc: "Process transparency, quality without buzzwords" },
  { value: "what_to_expect",   label: "What to Expect",   colour: "bg-purple-100 text-purple-700", desc: "Client journey, timeline, milestones" },
  { value: "the_work",         label: "The Work",         colour: "bg-emerald-100 text-emerald-700", desc: "Project showcases, before/after, craftsmanship" },
  { value: "community_craft",  label: "Community & Craft",colour: "bg-amber-100 text-amber-700",  desc: "Local roots, team stories, trade relationships" },
];

const CONTENT_MODES = [
  { value: "educational",    label: "Educate" },
  { value: "opinion",        label: "Opinion" },
  { value: "behind_scenes",  label: "Behind it" },
  { value: "client_focused", label: "For clients" },
  { value: "story",          label: "Story" },
  { value: "authority",      label: "Authority" },
  { value: "vision",         label: "Vision" },
];

const CLIENT_STAGES = [
  { value: "", label: "No stage filter" },
  { value: "awareness",        label: "Awareness" },
  { value: "consideration",    label: "Consideration" },
  { value: "enquiry",          label: "Enquiry" },
  { value: "nurture",          label: "Nurture" },
  { value: "pre_construction", label: "Pre-construction" },
  { value: "on_site",          label: "On Site" },
  { value: "post_handover",    label: "Post Handover" },
];

export default function ContentGenerator({ seedAsset, onSeedConsumed }) {
  const [channel, setChannel] = useState("instagram");
  const [pillar, setPillar] = useState("how_we_build");
  const [contentMode, setContentMode] = useState("educational");
  const [clientStage, setClientStage] = useState("");
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [photoContext, setPhotoContext] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(null);
  const generateRef = useRef(null);

  useEffect(() => {
    if (!seedAsset) return;
    const summary = seedAsset.analysis?.summary || "";
    const stage = seedAsset.stage_detected
      ? `${seedAsset.stage_detected} stage`
      : "";
    const topicValue = summary || stage || "Project photo";

    setTopic(topicValue);
    setPillar(seedAsset.analysis?.suggested_pillar || "the_work");
    setChannel("instagram");
    setPhotoContext({
      url: seedAsset.preview_url || storageUrl(seedAsset.thumbnail_path || seedAsset.storage_path),
      analysis: seedAsset.analysis,
      assetId: seedAsset.id,
    });
    onSeedConsumed?.();

    if (summary) {
      setTimeout(() => generateRef.current?.(), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSeedConsumed intentionally omitted
  }, [seedAsset]);

  const generate = useCallback(async function generate() {
    if (!topic.trim()) { setError("Add a topic or brief before generating."); return; }
    setGenerating(true);
    setError("");
    setDraft(null);
    setSavedId(null);
    setStreamingText("");
    try {
      const body = JSON.stringify({
        mode: CHANNEL_TO_MODE[channel] || "social_instagram",
        channel,
        pillar,
        client_stage: clientStage || undefined,
        topic,
        context: {
          ...(context ? { project_context: context } : {}),
          ...(photoContext?.analysis ? { photo_analysis: photoContext.analysis } : {}),
        },
        user_request: context ? `${topic}\n\nContext: ${context}` : topic,
        photo_asset_id: photoContext?.assetId || undefined,
        photo_analysis: photoContext?.analysis || undefined,
        content_mode: contentMode,
      });
      const response = await authFetch("/api/marketing/generate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!response.ok) {
        const j = await response.json().catch(() => ({}));
        throw new Error(j.error || `Error ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          let parsed;
          try { parsed = JSON.parse(payload); } catch { continue; }
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.text) { accumulated += parsed.text; setStreamingText(accumulated); }
          if (parsed.done) {
            setDraft({ content: parsed.content, review_scores: parsed.review_scores });
            setStreamingText("");
          }
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }, [channel, pillar, clientStage, topic, context, photoContext, contentMode]);

  useEffect(() => {
    generateRef.current = generate;
  }, [generate]);

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const r = await authFetch("/api/marketing/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          pillar,
          client_stage: clientStage || undefined,
          topic,
          title: draft.content?.title || topic,
          body: draft.content?.body || "",
          cta: draft.content?.cta || "",
          hashtags: draft.content?.hashtags || [],
          review_scores: draft.review_scores || {},
          status: "draft",
          media_source_id: photoContext?.assetId || null,
          content_mode: contentMode,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      setSavedId(j.item?.id || j.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setDraft(null);
    setSavedId(null);
    setError("");
  }

  const selectedChannel = CHANNELS.find((c) => c.value === channel);
  const selectedPillar = PILLARS.find((p) => p.value === pillar);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* LEFT — Input form */}
      <div className="space-y-5">
        {/* Channel */}
        <div>
          <label className="block text-sm font-medium text-ink mb-2">Channel</label>
          <div className="grid grid-cols-2 gap-2">
            {CHANNELS.map((c) => (
              <button
                key={c.value}
                onClick={() => setChannel(c.value)}
                className={[
                  "px-3 py-2.5 rounded-lg border text-sm text-left transition-all",
                  channel === c.value
                    ? "border-primary bg-primary/5 text-primary font-medium"
                    : "border-hairline bg-surface text-ink hover:border-primary/40",
                ].join(" ")}
              >
                <div className="font-medium">{c.label}</div>
                <div className="text-xs text-muted mt-0.5 leading-tight">{c.hint}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Pillar */}
        <div>
          <label className="block text-sm font-medium text-ink mb-2">Content Pillar</label>
          <div className="grid grid-cols-2 gap-2">
            {PILLARS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPillar(p.value)}
                className={[
                  "px-3 py-2.5 rounded-lg border text-sm text-left transition-all",
                  pillar === p.value
                    ? "border-primary bg-primary/5 text-primary font-medium"
                    : "border-hairline bg-surface text-ink hover:border-primary/40",
                ].join(" ")}
              >
                <span className={`inline-block text-xs px-1.5 py-0.5 rounded font-medium mb-1 ${p.colour}`}>
                  {p.label}
                </span>
                <div className="text-xs text-muted leading-tight">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-2">Content mode</label>
          <div className="flex flex-wrap gap-1.5">
            {CONTENT_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setContentMode(m.value)}
                className={[
                  "text-xs px-3 py-1.5 rounded-lg border transition-colors",
                  contentMode === m.value
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-hairline text-muted hover:border-primary/40",
                ].join(" ")}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Client stage + topic */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Client Stage</label>
            <select
              value={clientStage}
              onChange={(e) => setClientStage(e.target.value)}
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              {CLIENT_STAGES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {photoContext && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {photoContext.url && (
              <img
                src={photoContext.url}
                alt=""
                className="w-10 h-10 rounded object-cover flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-emerald-800">Photo attached</p>
              <p className="text-xs text-emerald-700 truncate">
                {photoContext.analysis?.summary || "Photo from media library"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPhotoContext(null)}
              className="text-emerald-600 hover:text-emerald-800 flex-shrink-0"
              aria-label="Remove photo"
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">
            Topic / Brief <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={`e.g. "Slab pour at Stirling renovation — rainy day, great result"`}
            className="w-full border border-hairline rounded-lg px-3 py-2 text-sm bg-surface text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">
            Additional Context <span className="text-muted text-xs font-normal">(optional)</span>
          </label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={3}
            placeholder="Project details, specific angles to cover, tone notes, client quotes..."
            className="w-full border border-hairline rounded-lg px-3 py-2 text-sm bg-surface text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
          />
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={generate}
            disabled={generating || !topic.trim()}
            className="flex-1 bg-primary text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Generating…
              </span>
            ) : "Generate Content"}
          </button>
          {draft && (
            <button
              onClick={reset}
              className="px-4 py-2.5 text-sm border border-hairline rounded-lg text-muted hover:text-ink transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Current selection summary */}
        {(selectedChannel || selectedPillar) && (
          <div className="text-xs text-muted bg-slate-50 rounded-lg px-3 py-2 border border-hairline">
            <span className="font-medium text-ink">{selectedChannel?.label}</span>
            {selectedPillar && <> · <span className={`px-1 py-0.5 rounded ${selectedPillar.colour}`}>{selectedPillar.label}</span></>}
            {clientStage && <> · {CLIENT_STAGES.find((s) => s.value === clientStage)?.label}</>}
          </div>
        )}
      </div>

      {/* RIGHT — Draft output + review */}
      <div>
        {!draft && !generating && (
          <div className="h-full flex items-center justify-center text-center text-muted border-2 border-dashed border-hairline rounded-xl p-8 min-h-[300px]">
            <div>
              <div className="text-3xl mb-3">✍️</div>
              <p className="text-sm font-medium text-ink mb-1">Ready to create</p>
              <p className="text-xs">Choose a channel, pillar, and topic<br />then hit Generate</p>
            </div>
          </div>
        )}

        {generating && streamingText && (
          <div className="rounded-lg border border-hairline bg-page p-4 text-sm text-ink whitespace-pre-wrap font-mono opacity-70 min-h-[300px]">
            {streamingText}
            <span className="animate-pulse text-primary">▍</span>
          </div>
        )}

        {generating && !streamingText && (
          <div className="h-full flex items-center justify-center text-center text-muted border-2 border-dashed border-hairline rounded-xl p-8 min-h-[300px]">
            <div>
              <svg className="animate-spin w-8 h-8 text-primary mx-auto mb-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-sm">Writing and reviewing…</p>
            </div>
          </div>
        )}

        {draft && (
          <div className="space-y-4">
            {/* Content preview */}
            <ContentPreview draft={draft} channel={channel} />

            {/* Review panel */}
            <ReviewPanel
              scores={draft.review_scores}
              blocked={draft.review_scores?.apb_reference?.pass === false}
              blockReason={draft.review_scores?.block_reason}
            />

            {/* Save actions */}
            {!(draft.review_scores?.apb_reference?.pass === false) && (
              <div className="flex gap-3">
                {savedId ? (
                  <div className="flex-1 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Saved to library
                  </div>
                ) : (
                  <button
                    onClick={saveDraft}
                    disabled={saving}
                    className="flex-1 border border-primary text-primary rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-primary/5 disabled:opacity-50 transition-colors"
                  >
                    {saving ? "Saving…" : "Save to Library"}
                  </button>
                )}
                <button
                  onClick={generate}
                  disabled={generating}
                  className="px-4 py-2.5 text-sm border border-hairline rounded-lg text-muted hover:text-ink transition-colors"
                >
                  Regenerate
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ContentPreview({ draft, channel }) {
  const [copied, setCopied] = useState(false);
  const content = draft.content || {};

  function copyAll() {
    const parts = [];
    if (content.title) parts.push(content.title);
    if (content.body) parts.push(content.body);
    if (content.cta) parts.push(`\n${content.cta}`);
    if (content.hashtags?.length) parts.push(content.hashtags.map((h) => `#${h}`).join(" "));
    navigator.clipboard.writeText(parts.join("\n\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="bg-surface border border-hairline rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted uppercase tracking-wide">Draft</span>
        <button
          onClick={copyAll}
          className="text-xs text-muted hover:text-ink flex items-center gap-1.5 transition-colors"
        >
          {copied ? (
            <>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              Copy all
            </>
          )}
        </button>
      </div>

      {content.title && (
        <div>
          <p className="text-xs text-muted mb-1">Title</p>
          <p className="text-sm font-semibold text-ink">{content.title}</p>
        </div>
      )}

      {/* Email: subject + preview_text above body */}
      {channel === "email" && content.subject && (
        <div>
          <p className="text-xs text-muted mb-1">Subject</p>
          <p className="text-sm font-medium text-ink">{content.subject}</p>
        </div>
      )}
      {channel === "email" && content.preview_text && (
        <p className="text-xs text-muted italic">{content.preview_text}</p>
      )}

      {content.body && (
        <div>
          <p className="text-xs text-muted mb-1">Body</p>
          <p
            className="text-sm text-ink whitespace-pre-wrap leading-relaxed"
            style={channel === "website" ? { lineHeight: "1.75" } : undefined}
          >
            {content.body}
          </p>
          {/* Instagram: character count */}
          {channel === "instagram" && (
            <p className={[
              "text-xs mt-1 tabular-nums",
              (content.body?.length || 0) > 300 ? "text-red-500" :
              (content.body?.length || 0) > 150 ? "text-amber-500" :
              "text-emerald-600",
            ].join(" ")}>
              {content.body?.length || 0} / 2200
            </p>
          )}
          {/* Facebook: character count (no limit indicator) */}
          {channel === "facebook" && (
            <p className="text-xs text-muted mt-1 tabular-nums">
              {content.body?.length || 0} characters
            </p>
          )}
        </div>
      )}

      {content.cta && (
        <div>
          <p className="text-xs text-muted mb-1">Call to Action</p>
          <p className="text-sm text-ink font-medium">{content.cta}</p>
        </div>
      )}

      {content.hashtags?.length > 0 && (
        <div>
          <p className="text-xs text-muted mb-1">Hashtags</p>
          <div className="flex flex-wrap gap-1.5">
            {content.hashtags.map((tag) => (
              <span key={tag} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {content.alt_text && (
        <div>
          <p className="text-xs text-muted mb-1">Alt text / image caption</p>
          <p className="text-xs text-ink italic">{content.alt_text}</p>
        </div>
      )}

      {content.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <p className="text-xs text-amber-700">{content.notes}</p>
        </div>
      )}
    </div>
  );
}
