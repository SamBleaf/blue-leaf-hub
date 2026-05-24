import { useEffect, useState } from "react";
import { authFetch } from "../../lib/authFetch.js";
import { getSupabase } from "../../lib/supabaseClient.js";

const CONTENT_MODES = [
  { value: "educational",    label: "Educate" },
  { value: "opinion",        label: "Opinion" },
  { value: "behind_scenes",  label: "Behind it" },
  { value: "client_focused", label: "For clients" },
  { value: "story",          label: "Story" },
  { value: "authority",      label: "Authority" },
  { value: "vision",         label: "Vision" },
];

const BATCH_FORMATS = [
  { channel: "instagram",    mode: "social_instagram", label: "Instagram",    icon: "📸",
    hint: "Short caption + hashtags" },
  { channel: "facebook",     mode: "social_facebook",  label: "Facebook",     icon: "👥",
    hint: "Longer post, community tone" },
  { channel: "website",      mode: "website",          label: "Website Copy", icon: "🌐",
    hint: "SEO-optimised, professional" },
  { channel: "email",        mode: "email",            label: "Email",        icon: "✉️",
    hint: "Client nurture, CTA-driven" },
  { channel: "client_guide", mode: "client_guide",     label: "Client Guide", icon: "📖",
    hint: "Educational, step-by-step" },
  { channel: "landing_page", mode: "cta",              label: "Landing Page", icon: "🎯",
    hint: "Conversion-focused, clear value prop" },
];

function storageUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = sb.storage.from("marketing-media").getPublicUrl(path);
  return data?.publicUrl || null;
}

function fetchFormat(fmt, asset, pillar, clientStage, contentMode) {
  const topic = asset.analysis?.summary || asset.analysis?.suggested_caption_hook || "Project photo";
  return authFetch("/api/marketing/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: fmt.mode,
      channel: fmt.channel,
      pillar: pillar || "the_work",
      client_stage: clientStage || undefined,
      topic,
      user_request: topic,
      context: { project_context: "" },
      photo_asset_id: asset.id,
      photo_analysis: asset.analysis || {},
      content_mode: contentMode || "educational",
    }),
  });
}

export default function BatchGenerator({ asset, onDone, pillar, clientStage }) {
  const initialResults = Object.fromEntries(
    BATCH_FORMATS.map((f) => [f.channel, { status: "pending", data: null }]),
  );
  const [results, setResults] = useState(initialResults);
  const [saved, setSaved] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [batchMode, setBatchMode] = useState("educational");
  const [generatedWithMode, setGeneratedWithMode] = useState(null);

  function runAll() {
    setResults(Object.fromEntries(
      BATCH_FORMATS.map((f) => [f.channel, { status: "generating", data: null }]),
    ));
    setSaved(new Set());
    setSaveError("");
    setGeneratedWithMode(batchMode);

    BATCH_FORMATS.forEach((fmt) => {
      fetchFormat(fmt, asset, pillar, clientStage, batchMode)
        .then((r) => r.json())
        .then((data) => {
          setResults((prev) => ({
            ...prev,
            [fmt.channel]: { status: data.error ? "error" : "done", data },
          }));
        })
        .catch((err) => {
          setResults((prev) => ({
            ...prev,
            [fmt.channel]: { status: "error", data: { error: err.message } },
          }));
        });
    });
  }

  function retryFormat(fmt) {
    setResults((prev) => ({ ...prev, [fmt.channel]: { status: "generating", data: null } }));
    setGeneratedWithMode(batchMode);
    fetchFormat(fmt, asset, pillar, clientStage, batchMode)
      .then((r) => r.json())
      .then((data) => {
        setResults((prev) => ({
          ...prev,
          [fmt.channel]: { status: data.error ? "error" : "done", data },
        }));
      })
      .catch((err) => {
        setResults((prev) => ({
          ...prev,
          [fmt.channel]: { status: "error", data: { error: err.message } },
        }));
      });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { runAll(); }, []);

  const topic = asset.analysis?.summary || asset.analysis?.suggested_caption_hook || "Project photo";

  function buildSaveRow(fmt) {
    const result = results[fmt.channel];
    return {
      channel: fmt.channel,
      mode: fmt.mode,
      pillar: pillar || "the_work",
      client_stage: clientStage || null,
      topic,
      content: result?.data?.content || result?.data || {},
      review_scores: result?.data?.review_scores || {},
      media_source_id: asset.id,
    };
  }

  async function saveSingle(fmt) {
    setSaveError("");
    try {
      const r = await authFetch("/api/marketing/generate/all-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [buildSaveRow(fmt)] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Save failed");
      setSaved((prev) => new Set([...prev, fmt.channel]));
    } catch (e) {
      setSaveError(e.message);
    }
  }

  async function saveAll() {
    setSaving(true);
    setSaveError("");
    try {
      const unsaved = BATCH_FORMATS.filter(
        (f) => results[f.channel]?.status === "done" && !saved.has(f.channel),
      );
      if (!unsaved.length) return;
      const r = await authFetch("/api/marketing/generate/all-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: unsaved.map(buildSaveRow) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Save failed");
      setSaved((prev) => new Set([...prev, ...unsaved.map((f) => f.channel)]));
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const doneCount = BATCH_FORMATS.filter((f) => results[f.channel]?.status === "done").length;
  const unsavedDoneCount = BATCH_FORMATS.filter(
    (f) => results[f.channel]?.status === "done" && !saved.has(f.channel),
  ).length;
  const generatingCount = BATCH_FORMATS.filter((f) => results[f.channel]?.status === "generating").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onDone}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors"
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
          <div>
            <h2 className="text-sm font-semibold text-ink">All formats</h2>
            <p className="text-xs text-muted truncate max-w-[240px]">
              {asset.original_filename || "Project photo"}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap gap-1 items-center justify-end">
            <span className="text-xs text-muted mr-1">Mode:</span>
            {CONTENT_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setBatchMode(m.value)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${batchMode === m.value ? "border-primary bg-primary/10 text-primary font-medium" : "border-hairline text-muted hover:border-primary/40"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {generatedWithMode && generatedWithMode !== batchMode && doneCount > 0 && (
            <p className="text-xs text-amber-700">Mode changed — regenerate to apply</p>
          )}
          <div className="flex items-center gap-2">
          {(asset.preview_url || asset.thumbnail_path || asset.storage_path) && (
            <img
              src={asset.preview_url || storageUrl(asset.thumbnail_path || asset.storage_path)}
              alt=""
              className="w-10 h-10 rounded-lg object-cover border border-hairline"
            />
          )}
          <button
            onClick={runAll}
            disabled={generatingCount > 0}
            className="text-xs border border-hairline text-muted hover:text-ink px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
          >
            Regenerate all
          </button>
          <button
            onClick={saveAll}
            disabled={saving || unsavedDoneCount === 0}
            className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            {saving ? "Saving…" : `Save ${unsavedDoneCount > 0 ? unsavedDoneCount : ""} to library`}
          </button>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {generatingCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <svg className="animate-spin w-3.5 h-3.5 text-primary shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Generating {doneCount} / {BATCH_FORMATS.length} formats…
        </div>
      )}

      {saveError && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</div>
      )}

      {/* Format grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {BATCH_FORMATS.map((fmt) => (
          <FormatCard
            key={fmt.channel}
            fmt={fmt}
            result={results[fmt.channel]}
            isSaved={saved.has(fmt.channel)}
            onRetry={() => retryFormat(fmt)}
            onSave={() => saveSingle(fmt)}
          />
        ))}
      </div>
    </div>
  );
}

function FormatCard({ fmt, result, isSaved, onRetry, onSave }) {
  const status = result?.status || "pending";
  const content = result?.data?.content || result?.data || {};
  const bodyPreview = content.body
    ? content.body.slice(0, 200) + (content.body.length > 200 ? "…" : "")
    : null;

  return (
    <div className="bg-surface border border-hairline rounded-xl p-4 space-y-3">
      {/* Card header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{fmt.icon}</span>
          <div>
            <p className="text-sm font-medium text-ink">{fmt.label}</p>
            <p className="text-xs text-muted">{fmt.hint}</p>
          </div>
        </div>
        {status === "done" && (
          isSaved ? (
            <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
              Saved ✓
            </span>
          ) : (
            <button
              onClick={onSave}
              className="text-xs border border-primary text-primary px-2.5 py-1 rounded-lg hover:bg-primary/5 transition-colors shrink-0"
            >
              Save
            </button>
          )
        )}
      </div>

      {/* Status */}
      {status === "pending" && (
        <p className="text-xs text-muted">Waiting…</p>
      )}

      {status === "generating" && (
        <div className="flex items-center gap-2 text-xs text-muted py-2">
          <svg className="animate-spin w-3.5 h-3.5 text-primary shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Generating…
        </div>
      )}

      {status === "error" && (
        <div className="space-y-2">
          <p className="text-xs text-red-600">
            {result?.data?.error || "Generation failed"}
          </p>
          <button
            onClick={onRetry}
            className="text-xs border border-red-300 text-red-600 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {status === "done" && (
        <div className="space-y-2">
          {content.title && (
            <p className="text-xs font-semibold text-ink">{content.title}</p>
          )}
          {/* Email: show subject */}
          {fmt.channel === "email" && content.subject && (
            <p className="text-xs text-muted">
              <span className="font-medium">Subject:</span> {content.subject}
            </p>
          )}
          {bodyPreview && (
            <p className="text-xs text-muted leading-relaxed">{bodyPreview}</p>
          )}
          {content.hashtags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {content.hashtags.slice(0, 5).map((h) => (
                <span key={h} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                  #{h}
                </span>
              ))}
              {content.hashtags.length > 5 && (
                <span className="text-xs text-muted">+{content.hashtags.length - 5}</span>
              )}
            </div>
          )}
          {result?.data?.review_scores?.overall_pass === false && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              ⚠ Review flags — check before saving
            </p>
          )}
        </div>
      )}
    </div>
  );
}
