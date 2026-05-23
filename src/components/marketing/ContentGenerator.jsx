import { useState } from "react";
import ReviewPanel from "./ReviewPanel.jsx";
import { authFetch } from "../../lib/authFetch.js";

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

export default function ContentGenerator() {
  const [channel, setChannel] = useState("instagram");
  const [pillar, setPillar] = useState("how_we_build");
  const [clientStage, setClientStage] = useState("");
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(null);

  async function generate() {
    if (!topic.trim()) { setError("Add a topic or brief before generating."); return; }
    setGenerating(true);
    setError("");
    setDraft(null);
    setSavedId(null);
    try {
      const r = await authFetch("/api/marketing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: CHANNEL_TO_MODE[channel] || "social_instagram",
          channel,
          pillar,
          client_stage: clientStage || undefined,
          topic,
          context: context ? { project_context: context } : {},
          user_request: context ? `${topic}\n\nContext: ${context}` : topic,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      setDraft(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

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

        {generating && (
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
            <ContentPreview draft={draft} />

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

function ContentPreview({ draft }) {
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

      {content.body && (
        <div>
          <p className="text-xs text-muted mb-1">Body</p>
          <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{content.body}</p>
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
