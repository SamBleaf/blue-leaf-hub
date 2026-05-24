import { useState, useEffect, useRef, useCallback } from "react";
import FinalAssembly from "./FinalAssembly.jsx";
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

  // Poll for processing assets (pipeline_status comes from list endpoint derived field)
  useEffect(() => {
    const processing = assets.filter((a) => a.pipeline_status === "processing");
    if (processing.length === 0) return;
    const timer = setTimeout(load, 5000);
    return () => clearTimeout(timer);
  }, [assets, load]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");

    const isVideo = file.type.startsWith("video/");
    const isDrone = file.name.toLowerCase().includes("dji") || file.name.toLowerCase().includes("drone");
    const mediaType = isDrone ? "drone_video" : isVideo ? "video" : "photo";
    const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const uid = crypto.randomUUID();
    const storagePath = `uploads/${year}/${month}/${uid}.${ext}`;

    setUploadProgress(isVideo ? "Uploading to storage…" : "Uploading…");
    try {
      // 1. Upload file directly to Supabase Storage
      const sb = getSupabase();
      const { error: storageErr } = await sb.storage
        .from("marketing-media")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (storageErr) throw new Error(`Storage upload failed: ${storageErr.message}`);

      setUploadProgress(isVideo ? "Registering — video pipeline will run in background…" : "Registering…");

      // 2. Register the asset with the API (sends JSON, not FormData)
      const r = await authFetch("/api/marketing/media/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storage_path: storagePath,
          storage_bucket: "marketing-media",
          mime_type: file.type,
          media_type: mediaType,
          original_filename: file.name,
          file_size_bytes: file.size,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      // Reload full list to get pipeline_status derived field
      load();
      setUploadProgress("");
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
            onClose={() => setSelected(null)}
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
  // Already a full URL
  if (path.startsWith("http")) return path;
  const sb = getSupabase();
  const { data } = sb.storage.from("marketing-media").getPublicUrl(path);
  return data?.publicUrl || null;
}

function AssetCard({ asset, selected, onClick }) {
  const isVideo = asset.mime_type?.startsWith("video/");
  const statusIcon = STATUS_ICONS[asset.pipeline_status] || STATUS_ICONS.ready;
  const thumbUrl = storageUrl(asset.thumbnail_path);

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

function AssetDetail({ asset, onConsent, onAssemble, onGeneratePost, onClose }) {
  const isVideo = asset.mime_type?.startsWith("video/");

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

      {asset.thumbnail_path && (
        <img src={storageUrl(asset.thumbnail_path)} alt="" className="w-full rounded-lg object-cover max-h-48" />
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

      {/* AI analysis summary */}
      {asset.analysis?.summary && (
        <div className="bg-slate-50 rounded-lg px-3 py-2">
          <p className="text-xs font-medium text-ink mb-1">AI Analysis</p>
          <p className="text-xs text-muted leading-relaxed">{asset.analysis.summary}</p>
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
        <button
          type="button"
          onClick={onGeneratePost}
          className="w-full bg-primary text-white text-sm px-4 py-2.5 rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          Generate post from this photo →
        </button>
      )}

      {/* Assemble button */}
      {isVideo && asset.consent_for_marketing && (
        <button
          onClick={onAssemble}
          className="w-full bg-primary text-white text-sm px-4 py-2.5 rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          Final Assembly →
        </button>
      )}
    </div>
  );
}
