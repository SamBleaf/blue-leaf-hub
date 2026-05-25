import { useState, useEffect, useRef, useCallback } from "react";
import FinalAssembly from "./FinalAssembly.jsx";
import BatchGenerator from "./BatchGenerator.jsx";
import VideoReview from "./VideoReview.jsx";
import { getSupabase } from "../../lib/supabaseClient.js";
import { authFetch } from "../../lib/authFetch.js";

const MEDIA_TYPE_LABELS = {
  photo:              "Photo",
  video:              "Video",
  drone_video:        "Drone Video",
  timelapse:          "Timelapse",
  testimonial_video:  "Testimonial Video",
  transcript:         "Transcript",
  notes:              "Notes",
};

const HEIC_MIMES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);

function isHeicFile(file) {
  const t = (file.type || "").toLowerCase();
  return HEIC_MIMES.has(t) || /\.heic$/i.test(file.name) || /\.heif$/i.test(file.name);
}

function normalizeImageMime(file) {
  const t = (file.type || "").toLowerCase();
  if (t === "image/jpg" || t === "image/pjpeg") return "image/jpeg";
  if (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(t)) return t;
  const ext = file.name.split(".").pop()?.toLowerCase();
  const extMap = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
  return extMap[ext] || "image/jpeg";
}

/**
 * Convert any browser-decodable image (incl. HEIC on Safari) to JPEG base64
 * for the Anthropic vision API (hard limit: 5 MB decoded).
 * Scales to ≤ 2048px on the longest side before encoding to keep output well under the limit.
 */
async function photoToJpegBase64(source) {
  const blob =
    typeof source === "string"
      ? await fetch(source).then((r) => {
        if (!r.ok) throw new Error("Could not load image for conversion");
        return r.blob();
      })
      : source;
  const bitmap = await createImageBitmap(blob);
  try {
    // Scale down to max 2048px on longest side (Anthropic 5 MB hard limit).
    // A 4032×3024 iPhone HEIC → 2048×1536 at q=0.82 ≈ 0.8–2 MB — well within limits.
    const MAX_DIM = 2048;
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);

    const jpegBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Could not convert image to JPEG"))),
        "image/jpeg",
        0.82,
      );
    });
    const buf = await jpegBlob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  } finally {
    bitmap.close?.();
  }
}

async function preparePhotoUpload(file) {
  if (!isHeicFile(file)) {
    return { file, mimeType: normalizeImageMime(file), filename: file.name };
  }
  const base64 = await photoToJpegBase64(file);
  const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bin], { type: "image/jpeg" });
  const filename = file.name.replace(/\.heic$/i, ".jpg").replace(/\.heif$/i, ".jpg");
  return { file: blob, mimeType: "image/jpeg", filename };
}

const STATUS_ICONS = {
  processing: (
    <svg className="animate-spin w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  ),
  ready: (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="text-emerald-500">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  failed: (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="text-red-500">
      <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  ),
};

export default function MediaUpload({ onGeneratePost }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [showAssembly, setShowAssembly] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [showVideoReview, setShowVideoReview] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch("/api/marketing/media");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to load");
      setAssets(j.assets || j || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll for processing exports (drone pipeline)
  useEffect(() => {
    const processing = assets.filter((a) => a.pipeline_status === "processing");
    if (processing.length === 0) return;
    const timer = setTimeout(load, 5000);
    return () => clearTimeout(timer);
  }, [assets, load]);

  // Poll video intelligence (story sequence) every 15s while analysing
  useEffect(() => {
    const analysing = assets.filter(
      (a) => a.mime_type?.startsWith("video/") &&
        a.analysis_status &&
        a.analysis_status !== "complete" &&
        a.analysis_status !== "error",
    );
    if (analysing.length === 0) return;

    const poll = async () => {
      let changed = false;
      for (const asset of analysing) {
        try {
          const r = await authFetch(`/api/marketing/media/${asset.id}/story-sequence`);
          const j = await r.json();
          if (j.ready) changed = true;
        } catch { /* ignore */ }
      }
      if (changed) load();
    };

    const timer = setInterval(poll, 15000);
    poll();
    return () => clearInterval(timer);
  }, [assets, load]);

  async function handleUpload(e) {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;
    setUploading(true);
    setError("");

    const isVideo = rawFile.type.startsWith("video/");

    try {
      if (isVideo) {
        // ── Video path — stream directly to server (bypasses Supabase 50 MB limit) ──
        setUploadProgress(`Uploading ${(rawFile.size / 1024 / 1024).toFixed(0)} MB — please wait…`);
        const r = await authFetch("/api/marketing/media/upload-video", {
          method: "POST",
          headers: {
            "Content-Type": rawFile.type || "video/mp4",
            "X-Filename": encodeURIComponent(rawFile.name),
            "X-Campaign-Objective": "brand_awareness",
          },
          body: rawFile,
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
        load();
        setUploadProgress("");
      } else {
        // ── Photo path — convert HEIC if needed, then upload to Supabase directly ──
        setUploadProgress(isHeicFile(rawFile) ? "Converting HEIC to JPEG…" : "Preparing…");
        const prepared = await preparePhotoUpload(rawFile);
        const uploadFile = prepared.file;
        const mimeType = prepared.mimeType;
        const filename = prepared.filename;
        const ext = filename.split(".").pop() || "jpg";
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, "0");
        const uid = crypto.randomUUID();
        const storagePath = `uploads/${year}/${month}/${uid}.${ext}`;

        setUploadProgress("Uploading…");
        const sb = getSupabase();
        const { error: storageErr } = await sb.storage
          .from("marketing-media")
          .upload(storagePath, uploadFile, { contentType: mimeType, upsert: false });
        if (storageErr) throw new Error(`Storage upload failed: ${storageErr.message}`);

        setUploadProgress("Registering…");
        const r = await authFetch("/api/marketing/media/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storage_path: storagePath,
            storage_bucket: "marketing-media",
            mime_type: mimeType,
            media_type: "photo",
            original_filename: filename,
            file_size_bytes: uploadFile.size,
          }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
        load();
        const assetId = j.media_asset_id || j.asset?.id;
        if (assetId) {
          authFetch(`/api/marketing/media/${assetId}/analyse`, { method: "POST" }).catch(() => {});
        }
        setUploadProgress("");
      }
    } catch (err) {
      setError(err.message);
      setUploadProgress("");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function grantConsent(assetId) {
    try {
      const r = await authFetch(`/api/marketing/media/${assetId}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      });
      if (!r.ok) throw new Error("Failed to update consent");
      setAssets((prev) => prev.map((a) => a.id === assetId ? { ...a, consent_for_marketing: true } : a));
      if (selected?.id === assetId) setSelected((prev) => ({ ...prev, consent_for_marketing: true }));
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-48 text-muted text-sm">Loading media library…</div>;
  }

  if (showVideoReview && selected) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setShowVideoReview(false)}
          className="flex items-center gap-2 text-sm text-muted hover:text-ink mb-4 transition-colors"
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Media
        </button>
        <VideoReview
          assetId={selected.id}
          onDone={() => { setShowVideoReview(false); load(); }}
          onGenerateFinal={() => {
            setShowVideoReview(false);
            setShowAssembly(true);
          }}
        />
      </div>
    );
  }

  if (showAssembly && selected) {
    return (
      <div>
        <button
          onClick={() => setShowAssembly(false)}
          className="flex items-center gap-2 text-sm text-muted hover:text-ink mb-4 transition-colors"
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Media
        </button>
        <FinalAssembly asset={selected} onDone={() => { setShowAssembly(false); load(); }} />
      </div>
    );
  }

  if (showBatch && selected) {
    return (
      <div>
        <BatchGenerator
          asset={selected}
          onDone={() => { setShowBatch(false); }}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left — upload + asset list */}
      <div className="lg:col-span-2 space-y-4">
        {/* Upload area */}
        <div
          onClick={() => !uploading && fileRef.current?.click()}
          className={[
            "border-2 border-dashed rounded-xl px-6 py-8 text-center cursor-pointer transition-all",
            uploading ? "border-primary/40 bg-primary/5 cursor-not-allowed" : "border-hairline hover:border-primary/40 hover:bg-slate-50",
          ].join(" ")}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleUpload}
            className="hidden"
          />
          {uploading ? (
            <div>
              <svg className="animate-spin w-6 h-6 text-primary mx-auto mb-2" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-sm text-primary font-medium">{uploadProgress}</p>
            </div>
          ) : (
            <div>
              <div className="text-3xl mb-2">📁</div>
              <p className="text-sm font-medium text-ink">Upload photo or video</p>
              <p className="text-xs text-muted mt-1">DJI D-Log M drone footage auto-detected · Video pipeline runs in background</p>
            </div>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}

        {/* Asset grid */}
        {assets.length === 0 ? (
          <div className="flex items-center justify-center h-36 text-muted text-sm border-2 border-dashed border-hairline rounded-xl">
            No media yet — upload a photo or video to get started
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                selected={selected?.id === asset.id}
                onClick={() => setSelected(asset)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Right — detail panel */}
      <div>
        {selected ? (
          <AssetDetail
            asset={selected}
            onConsent={() => grantConsent(selected.id)}
            onAssemble={() => setShowAssembly(true)}
            onGeneratePost={() => onGeneratePost?.(selected)}
            onBatchGenerate={() => setShowBatch(true)}
            onReviewEdit={() => setShowVideoReview(true)}
            onClose={() => setSelected(null)}
            onAnalyseError={setError}
            onReanalysed={(updated) => {
              setError("");
              setSelected(updated);
              setAssets((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted text-sm border-2 border-dashed border-hairline rounded-xl p-6 min-h-[200px]">
            Select an asset to view details
          </div>
        )}
      </div>
    </div>
  );
}

function storageUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = sb.storage.from("marketing-media").getPublicUrl(path);
  return data?.publicUrl || null;
}

function assetPreviewUrl(asset) {
  if (asset.preview_url) return asset.preview_url;
  return storageUrl(asset.thumbnail_path || asset.storage_path);
}

function AssetCard({ asset, selected, onClick }) {
  const isVideo = asset.mime_type?.startsWith("video/");
  const statusIcon = STATUS_ICONS[asset.pipeline_status] || STATUS_ICONS.ready;
  const thumbUrl = assetPreviewUrl(asset);

  return (
    <button
      onClick={onClick}
      className={[
        "relative rounded-xl border overflow-hidden aspect-square bg-slate-100 transition-all",
        selected ? "border-primary shadow-md ring-2 ring-primary/20" : "border-hairline hover:border-primary/40",
      ].join(" ")}
    >
      {thumbUrl ? (
        <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-3xl">
          {isVideo ? "🎬" : "🖼️"}
        </div>
      )}

      {/* Status badge */}
      <div className="absolute top-1.5 right-1.5 bg-white/90 backdrop-blur-sm rounded-full p-1">
        {statusIcon}
      </div>

      {/* Consent indicator */}
      {!asset.consent_for_marketing && (
        <div className="absolute bottom-0 left-0 right-0 bg-amber-500/90 text-white text-xs text-center py-0.5">
          No consent
        </div>
      )}

      {/* Type label */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1">
        <p className="text-white text-xs font-medium truncate">
          {MEDIA_TYPE_LABELS[asset.media_type] || asset.media_type}
        </p>
      </div>
    </button>
  );
}

/**
 * A single editable chip. Click the text to edit inline; × to delete.
 * color: "green" | "blue" | "slate"
 */
function EditableChip({ value, color = "slate", onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (!trimmed) { onDelete(); }
    else if (trimmed !== value) { onEdit(trimmed); }
    setEditing(false);
  }

  const colorCls = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    blue:  "bg-blue-50 text-blue-700 border-blue-200",
    slate: "bg-slate-100 text-slate-600 border-slate-200",
  }[color] || "bg-slate-100 text-slate-600 border-slate-200";

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={`text-[10px] border px-1.5 py-0.5 rounded-full outline-none ${colorCls}`}
        style={{ width: `${Math.max(80, draft.length * 6.5)}px`, maxWidth: "220px" }}
      />
    );
  }

  return (
    <span className={`group inline-flex items-center gap-1 text-[10px] border px-1.5 py-0.5 rounded-full cursor-pointer hover:brightness-95 transition-all ${colorCls}`}>
      <span
        title="Click to edit"
        onClick={() => { setDraft(value); setEditing(true); }}
        className="leading-tight"
      >
        {value}
      </span>
      <button
        type="button"
        title="Remove"
        onClick={e => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity shrink-0 leading-none text-[11px] font-bold"
      >
        ×
      </button>
    </span>
  );
}

/** One-line text field that shows as a label until clicked */
function EditableTextField({ value, placeholder, italic = false, onEdit, className = "" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const ref = useRef(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed !== (value || "")) onEdit(trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setDraft(value || ""); setEditing(false); }
        }}
        rows={2}
        className={`w-full text-xs border border-primary/30 rounded-lg px-2 py-1 outline-none resize-none ${className}`}
      />
    );
  }

  return (
    <p
      title="Click to edit"
      onClick={() => { setDraft(value || ""); setEditing(true); }}
      className={`text-xs cursor-pointer hover:bg-primary/5 rounded px-1 -mx-1 transition-colors ${italic ? "italic text-primary/80" : "text-muted leading-relaxed"} ${className}`}
    >
      {value || <span className="text-muted/50">{placeholder}</span>}
    </p>
  );
}

/** Small inline "+" button that expands to a text input to add a new chip */
function AddChipButton({ onAdd, color = "slate" }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef(null);

  useEffect(() => { if (adding) ref.current?.focus(); }, [adding]);

  const colorCls = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    blue:  "bg-blue-50 text-blue-700 border-blue-200",
    slate: "bg-slate-100 text-slate-600 border-slate-200",
  }[color] || "bg-slate-100 text-slate-600 border-slate-200";

  function commit() {
    const trimmed = draft.trim();
    if (trimmed) onAdd(trimmed);
    setDraft("");
    setAdding(false);
  }

  if (adding) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setDraft(""); setAdding(false); }
        }}
        placeholder="Add…"
        className={`text-[10px] border px-1.5 py-0.5 rounded-full outline-none ${colorCls}`}
        style={{ width: "80px" }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setAdding(true)}
      className="text-[10px] border border-dashed border-hairline text-muted hover:text-ink hover:border-ink px-1.5 py-0.5 rounded-full transition-colors"
    >
      +
    </button>
  );
}

function AssetDetail({ asset, onConsent, onAssemble, onGeneratePost, onBatchGenerate, onReviewEdit, onClose, onReanalysed, onAnalyseError }) {
  const isVideo = asset.mime_type?.startsWith("video/");
  const [analysing, setAnalysing] = useState(false);
  const [analyseError, setAnalyseError] = useState("");
  // ── Analysis editing state ──────────────────────────────────────────────────
  const [editedAnalysis, setEditedAnalysis] = useState(null); // null = no local edits
  const [savingEdits, setSavingEdits] = useState(false);
  const [editSaveError, setEditSaveError] = useState("");
  const hasAnalysis = !!(
    asset.analysis?.summary ||
    asset.analysis?.visible_facts?.length
  );
  const previewUrl = assetPreviewUrl(asset);

  // Reset edit state when switching to a different asset
  useEffect(() => { setEditedAnalysis(null); setEditSaveError(""); }, [asset.id]);

  const workingAnalysis = editedAnalysis ?? asset.analysis ?? {};
  const hasEdits = editedAnalysis !== null;

  function editArray(field, index, newValue) {
    const base = editedAnalysis ?? { ...asset.analysis };
    const arr = [...(base[field] ?? [])];
    arr[index] = newValue;
    setEditedAnalysis({ ...base, [field]: arr });
  }
  function deleteArrayItem(field, index) {
    const base = editedAnalysis ?? { ...asset.analysis };
    const arr = [...(base[field] ?? [])];
    arr.splice(index, 1);
    setEditedAnalysis({ ...base, [field]: arr });
  }
  function addArrayItem(field, value) {
    const base = editedAnalysis ?? { ...asset.analysis };
    const arr = [...(base[field] ?? []), value];
    setEditedAnalysis({ ...base, [field]: arr });
  }
  function editField(field, value) {
    const base = editedAnalysis ?? { ...asset.analysis };
    setEditedAnalysis({ ...base, [field]: value });
  }

  async function saveEdits() {
    if (!editedAnalysis) return;
    setSavingEdits(true);
    setEditSaveError("");
    try {
      const r = await authFetch(`/api/marketing/media/${asset.id}/analysis`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: editedAnalysis }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Save failed");
      onReanalysed?.(j.asset || { ...asset, analysis: editedAnalysis });
      setEditedAnalysis(null);
    } catch (e) {
      setEditSaveError(e.message);
    } finally {
      setSavingEdits(false);
    }
  }

  async function applyAnalysisResponse(j) {
    if (!j.analysis) throw new Error("No analysis returned from server");
    if (j.asset) {
      onReanalysed?.(j.asset);
    } else {
      onReanalysed?.({
        ...asset,
        analysis: j.analysis,
        stage_detected: j.analysis.build_stage || j.analysis.stage || asset.stage_detected,
      });
    }
  }

  async function reanalyse() {
    setAnalysing(true);
    setAnalyseError("");
    onAnalyseError?.("");
    try {
      // Step 1: Let the server download and analyse the file directly.
      // The server does magic-byte sniffing and will return a clear HEIC error if needed.
      let r = await authFetch(`/api/marketing/media/${asset.id}/analyse`, { method: "POST" });

      let j = {};
      try {
        j = await r.json();
      } catch {
        throw new Error(`Analysis failed (${r.status})`);
      }

      if (!r.ok) {
        const errMsg = j.error || `Analysis failed (${r.status})`;
        // Server returns tooLarge:true for images >4.5 MB, or HEIC for unsupported format.
        // Either way: resize in the browser (scale to ≤2048px, q=0.82) and retry.
        const needsBrowserResize = j.tooLarge || /heic/i.test(errMsg) || /heif/i.test(errMsg);

        if (needsBrowserResize) {
          const url = asset.preview_url || assetPreviewUrl(asset);
          if (!url) throw new Error(errMsg);
          let imageBase64;
          try {
            // photoToJpegBase64 caps at 2048px longest side — always produces < 4 MB output.
            imageBase64 = await photoToJpegBase64(url);
          } catch {
            // Browser cannot decode this format (e.g. HEIC on Chrome) — surface server message.
            throw new Error(errMsg);
          }
          const r2 = await authFetch(`/api/marketing/media/${asset.id}/analyse`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_base64: imageBase64, media_type: "image/jpeg" }),
          });
          let j2 = {};
          try { j2 = await r2.json(); } catch { throw new Error(errMsg); }
          if (!r2.ok) throw new Error(j2.error || errMsg);
          await applyAnalysisResponse(j2);
          return;
        }

        throw new Error(errMsg);
      }

      await applyAnalysisResponse(j);
    } catch (e) {
      const msg = e.message || "Analysis failed";
      setAnalyseError(msg);
      onAnalyseError?.(msg);
    } finally {
      setAnalysing(false);
    }
  }

  return (
    <div className="bg-surface border border-hairline rounded-xl p-4 space-y-4 sticky top-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">
          {MEDIA_TYPE_LABELS[asset.media_type] || asset.media_type}
        </span>
        <button onClick={onClose} className="text-muted hover:text-ink transition-colors">
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {previewUrl && (
        <img src={previewUrl} alt="" className="w-full rounded-lg object-cover max-h-48" />
      )}

      <div className="space-y-2 text-xs text-muted">
        {asset.original_filename && <p className="truncate font-medium text-ink">{asset.original_filename}</p>}
        {asset.file_size_bytes && (
          <p>{(asset.file_size_bytes / 1024 / 1024).toFixed(1)} MB</p>
        )}
        {asset.duration_seconds && <p>{Math.round(asset.duration_seconds)}s</p>}
        {asset.is_dji_dlog_m && (
          <p className="text-blue-600 font-medium">⚡ DJI D-Log M detected</p>
        )}
        {asset.stage_detected && <p>Stage: {asset.stage_detected}</p>}
        {asset.capture_date && (
          <p>Captured: {new Date(asset.capture_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</p>
        )}
      </div>

      {/* AI analysis — editable */}
      {hasAnalysis ? (
        <div className="bg-slate-50 rounded-lg px-3 py-2 space-y-2">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-ink">AI Analysis</p>
            <div className="flex items-center gap-2">
              {hasEdits && (
                <button
                  type="button"
                  onClick={() => { setEditedAnalysis(null); setEditSaveError(""); }}
                  className="text-[10px] text-muted hover:text-ink underline underline-offset-2"
                >
                  Discard
                </button>
              )}
              <button
                type="button"
                onClick={reanalyse}
                disabled={analysing}
                className="text-[10px] text-muted hover:text-ink underline underline-offset-2 disabled:opacity-50"
              >
                {analysing ? "Analysing…" : "Re-analyse"}
              </button>
            </div>
          </div>

          {analyseError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-xs text-red-700 leading-relaxed">{analyseError}</p>
            </div>
          )}

          {/* Hint on first load */}
          {!hasEdits && (
            <p className="text-[10px] text-muted/60 italic">Click any item to correct it · × to remove · + to add</p>
          )}

          {/* Summary */}
          {(workingAnalysis.summary || hasEdits) && (
            <EditableTextField
              value={workingAnalysis.summary}
              placeholder="Add a summary…"
              onEdit={v => editField("summary", v)}
            />
          )}

          {/* Confirmed visible (visible_facts) */}
          {(workingAnalysis.visible_facts?.length > 0 || hasEdits) && (
            <div>
              <p className="text-[10px] font-medium text-muted uppercase tracking-wide mb-1">Confirmed visible</p>
              <div className="flex flex-wrap gap-1">
                {(workingAnalysis.visible_facts || []).map((f, i) => (
                  <EditableChip
                    key={`vf-${i}`}
                    value={f}
                    color="green"
                    onEdit={v => editArray("visible_facts", i, v)}
                    onDelete={() => deleteArrayItem("visible_facts", i)}
                  />
                ))}
                <AddChipButton onAdd={v => addArrayItem("visible_facts", v)} color="green" />
              </div>
            </div>
          )}

          {/* Design principles */}
          {(workingAnalysis.design_principles?.length > 0 || hasEdits) && (
            <div>
              <p className="text-[10px] font-medium text-muted uppercase tracking-wide mb-1">Design principles</p>
              <div className="flex flex-wrap gap-1">
                {(workingAnalysis.design_principles || []).map((p, i) => (
                  <EditableChip
                    key={`dp-${i}`}
                    value={p}
                    color="blue"
                    onEdit={v => editArray("design_principles", i, v)}
                    onDelete={() => deleteArrayItem("design_principles", i)}
                  />
                ))}
                <AddChipButton onAdd={v => addArrayItem("design_principles", v)} color="blue" />
              </div>
            </div>
          )}

          {/* Caption hook */}
          {(workingAnalysis.suggested_caption_hook || hasEdits) && (
            <EditableTextField
              value={workingAnalysis.suggested_caption_hook}
              placeholder="Add a caption hook…"
              italic
              onEdit={v => editField("suggested_caption_hook", v)}
            />
          )}

          {/* Content opportunities */}
          {(workingAnalysis.content_opportunities?.length > 0 || hasEdits) && (
            <div>
              <p className="text-[10px] font-medium text-muted uppercase tracking-wide mb-1">Content angles</p>
              <div className="space-y-1">
                {(workingAnalysis.content_opportunities || []).map((opp, i) => (
                  <div key={`co-${i}`} className="group flex items-start gap-1.5">
                    <span className="text-primary/60 shrink-0 text-[10px] mt-0.5">·</span>
                    <EditableTextField
                      value={opp}
                      onEdit={v => editArray("content_opportunities", i, v)}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => deleteArrayItem("content_opportunities", i)}
                      className="opacity-0 group-hover:opacity-40 hover:!opacity-80 transition-opacity text-[11px] font-bold text-muted shrink-0 mt-0.5"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addArrayItem("content_opportunities", "New content angle")}
                  className="text-[10px] text-muted hover:text-primary transition-colors mt-0.5"
                >
                  + add angle
                </button>
              </div>
            </div>
          )}

          {/* Save corrections */}
          {hasEdits && (
            <div className="pt-1 border-t border-hairline space-y-1">
              {editSaveError && (
                <p className="text-[10px] text-red-600">{editSaveError}</p>
              )}
              <button
                type="button"
                onClick={saveEdits}
                disabled={savingEdits}
                className="w-full text-xs bg-primary text-white rounded-lg py-1.5 font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {savingEdits ? "Saving…" : "Save corrections"}
              </button>
            </div>
          )}
        </div>
      ) : !isVideo && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
          <p className="text-xs font-medium text-ink mb-1">No AI analysis yet</p>
          <p className="text-xs text-muted mb-2">Analysis runs automatically on new uploads. Click to run it now.</p>
          {analyseError && (
            <div className="mb-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-xs text-red-700 leading-relaxed">{analyseError}</p>
            </div>
          )}
          <button
            type="button"
            onClick={reanalyse}
            disabled={analysing}
            className="text-xs bg-slate-700 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {analysing ? "Analysing…" : "Analyse this photo"}
          </button>
        </div>
      )}

      {/* Consent */}
      {!asset.consent_for_marketing ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
          <p className="text-xs font-medium text-amber-800 mb-1.5">Client consent required</p>
          <p className="text-xs text-amber-700 mb-2">Confirm you have consent to use this asset in marketing materials.</p>
          <button
            onClick={onConsent}
            className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-amber-600 transition-colors"
          >
            Mark consent given
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-emerald-700">
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Consent recorded
        </div>
      )}

      {!isVideo && asset.consent_for_marketing && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={onGeneratePost}
            className="w-full bg-primary text-white text-sm px-4 py-2.5 rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Generate post from this photo →
          </button>
          {asset.analysis?.summary && (
            <button
              type="button"
              onClick={onBatchGenerate}
              className="w-full bg-emerald-600 text-white text-sm px-4 py-2.5 rounded-lg font-medium hover:bg-emerald-700 transition-colors"
            >
              Generate all formats →
              <span className="text-xs opacity-75 ml-1">(6 posts at once)</span>
            </button>
          )}
        </div>
      )}

      {/* Video intelligence status */}
      {isVideo && (
        <div className="rounded-lg border border-hairline px-3 py-2.5 space-y-2">
          {asset.analysis_status === "complete" && (
            <>
              <p className="text-xs text-emerald-700 font-medium">AI edit ready for review</p>
              <button
                type="button"
                onClick={onReviewEdit}
                className="w-full bg-primary text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors"
              >
                Review AI edit →
              </button>
            </>
          )}
          {(asset.analysis_status === "processing" || asset.analysis_status === "pending") && (
            <p className="text-xs text-amber-800 flex items-center gap-2">
              <svg className="animate-spin w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Analysing footage… this takes 3–5 minutes.
            </p>
          )}
          {asset.analysis_status === "error" && (
            <p className="text-xs text-red-600">Video analysis failed — check server logs and try re-uploading.</p>
          )}
          {!asset.analysis_status && asset.pipeline_status === "processing" && (
            <p className="text-xs text-muted">Export pipeline running in background…</p>
          )}
        </div>
      )}

      {isVideo && asset.consent_for_marketing && (
        <button
          type="button"
          onClick={onAssemble}
          className="w-full border border-hairline text-ink text-sm px-4 py-2.5 rounded-lg font-medium hover:bg-slate-50 transition-colors"
        >
          Final Assembly →
        </button>
      )}
    </div>
  );
}
