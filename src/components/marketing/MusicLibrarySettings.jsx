/**
 * MusicLibrarySettings
 * Admin-only panel for managing the marketing music library.
 * Rendered inside the Settings page for users with role === "admin".
 */
import { useState, useEffect, useCallback } from "react";
import { authFetch } from "../../lib/authFetch.js";

const MOODS = ["energetic", "calm", "inspiring", "dramatic", "corporate", "upbeat", "ambient"];
const SOURCES = [
  { value: "youtube_audio_library", label: "YouTube Audio Library" },
  { value: "epidemic_sound", label: "Epidemic Sound" },
  { value: "artlist", label: "Artlist" },
  { value: "musicbed", label: "Musicbed" },
  { value: "custom", label: "Custom / Other" },
];

function formatDuration(secs) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatBytes(b) {
  if (!b) return "";
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(b / 1024)} KB`;
}

const EMPTY_FORM = {
  title: "",
  artist: "",
  source: "youtube_audio_library",
  mood: "",
  bpm: "",
  duration_seconds: "",
};

export default function MusicLibrarySettings() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Upload form state
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [audioFile, setAudioFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  // Deletion confirm
  const [confirmDelete, setConfirmDelete] = useState(null);

  const loadTracks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await authFetch("/api/marketing/music/all");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to load tracks");
      setTracks(j.tracks || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTracks(); }, [loadTracks]);

  function flash(msg, isError = false) {
    if (isError) { setError(msg); setSuccess(""); }
    else { setSuccess(msg); setError(""); }
    setTimeout(() => { setError(""); setSuccess(""); }, 4000);
  }

  async function handleToggleActive(track) {
    try {
      const r = await authFetch(`/api/marketing/music/${track.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !track.is_active }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Update failed");
      setTracks((prev) => prev.map((t) => (t.id === track.id ? j.track : t)));
      flash(track.is_active ? "Track hidden from music selector." : "Track now available in music selector.");
    } catch (e) {
      flash(e.message, true);
    }
  }

  async function handleDelete(track) {
    try {
      const r = await authFetch(`/api/marketing/music/${track.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Delete failed");
      setTracks((prev) => prev.filter((t) => t.id !== track.id));
      setConfirmDelete(null);
      flash("Track deleted.");
    } catch (e) {
      flash(e.message, true);
      setConfirmDelete(null);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!audioFile) { flash("Choose an audio file first.", true); return; }
    if (!form.title.trim()) { flash("Title is required.", true); return; }
    if (!form.mood) { flash("Mood is required.", true); return; }

    setUploading(true);
    setUploadProgress(`Uploading ${formatBytes(audioFile.size)}…`);
    setError("");
    try {
      // Step 1: upload the audio file
      const upRes = await authFetch("/api/marketing/music/upload-audio", {
        method: "POST",
        headers: {
          "Content-Type": audioFile.type || "audio/mpeg",
          "X-Filename": encodeURIComponent(audioFile.name),
        },
        body: audioFile,
      });
      const upJson = await upRes.json();
      if (!upRes.ok) throw new Error(upJson.error || "Audio upload failed");

      setUploadProgress("Saving track metadata…");

      // Step 2: register in music library
      const regRes = await authFetch("/api/marketing/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          artist: form.artist.trim() || undefined,
          source: form.source,
          mood: form.mood,
          bpm: form.bpm ? Number(form.bpm) : undefined,
          duration_seconds: form.duration_seconds ? Number(form.duration_seconds) : undefined,
          storage_path: upJson.storage_path,
        }),
      });
      const regJson = await regRes.json();
      if (!regRes.ok) throw new Error(regJson.error || "Failed to save track");

      setTracks((prev) => [regJson.track, ...prev]);
      setForm(EMPTY_FORM);
      setAudioFile(null);
      setShowForm(false);
      flash(`"${regJson.track.title}" added to music library.`);
    } catch (e) {
      flash(e.message, true);
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  }

  const moodBadgeClass = (mood) => {
    const map = {
      energetic: "bg-orange-100 text-orange-700",
      calm: "bg-blue-100 text-blue-700",
      inspiring: "bg-violet-100 text-violet-700",
      dramatic: "bg-red-100 text-red-700",
      corporate: "bg-slate-100 text-slate-600",
      upbeat: "bg-amber-100 text-amber-700",
      ambient: "bg-teal-100 text-teal-700",
    };
    return map[mood] || "bg-slate-100 text-slate-600";
  };

  return (
    <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-primary">Music Library</h2>
          <p className="mt-1 text-sm text-muted">
            Audio tracks available when assembling marketing videos. Admins only.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm((v) => !v); setError(""); }}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          {showForm ? "Cancel" : "+ Add track"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>
      )}

      {/* Upload form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-5 rounded-xl border border-hairline bg-page p-4 space-y-4"
        >
          <h3 className="text-sm font-semibold text-ink">Add new track</h3>

          <label className="block text-sm">
            <span className="font-medium text-ink">Audio file <span className="text-red-500">*</span></span>
            <p className="text-xs text-muted mb-1">MP3 or M4A recommended. Max ~50 MB.</p>
            <input
              type="file"
              accept="audio/*"
              className="mt-1 text-xs"
              onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              disabled={uploading}
            />
            {audioFile && (
              <p className="mt-1 text-xs text-muted">{audioFile.name} · {formatBytes(audioFile.size)}</p>
            )}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-ink">Title <span className="text-red-500">*</span></span>
              <input
                className="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Summer Build"
                disabled={uploading}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">Artist</span>
              <input
                className="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
                value={form.artist}
                onChange={(e) => setForm({ ...form, artist: e.target.value })}
                placeholder="e.g. John Smith"
                disabled={uploading}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">Mood <span className="text-red-500">*</span></span>
              <select
                className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm"
                value={form.mood}
                onChange={(e) => setForm({ ...form, mood: e.target.value })}
                disabled={uploading}
              >
                <option value="">Select mood…</option>
                {MOODS.map((m) => (
                  <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">Source / Library</span>
              <select
                className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                disabled={uploading}
              >
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">BPM</span>
              <input
                type="number"
                min="40" max="240"
                className="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
                value={form.bpm}
                onChange={(e) => setForm({ ...form, bpm: e.target.value })}
                placeholder="e.g. 120"
                disabled={uploading}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">Duration (seconds)</span>
              <input
                type="number"
                min="1"
                className="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
                value={form.duration_seconds}
                onChange={(e) => setForm({ ...form, duration_seconds: e.target.value })}
                placeholder="e.g. 180"
                disabled={uploading}
              />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={uploading}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {uploading ? uploadProgress || "Uploading…" : "Upload & save"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setAudioFile(null); }}
              className="text-sm text-muted hover:text-ink"
              disabled={uploading}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Track list */}
      <div className="mt-5">
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : tracks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline px-4 py-8 text-center">
            <p className="text-sm text-muted">No tracks yet. Add your first track above.</p>
            <p className="mt-1 text-xs text-muted">Tracks appear in the music selector when assembling videos.</p>
          </div>
        ) : (
          <div className="divide-y divide-hairline rounded-xl border border-hairline overflow-hidden">
            {tracks.map((track) => (
              <div
                key={track.id}
                className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors ${track.is_active ? "bg-surface" : "bg-page opacity-60"}`}
              >
                {/* Music note icon */}
                <span className="text-lg shrink-0">🎵</span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-medium ${track.is_active ? "text-ink" : "line-through text-muted"}`}>
                      {track.title}
                    </span>
                    {track.mood && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${moodBadgeClass(track.mood)}`}>
                        {track.mood}
                      </span>
                    )}
                    {!track.is_active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">hidden</span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    {[track.artist, track.source, track.bpm ? `${track.bpm} BPM` : null, formatDuration(track.duration_seconds)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    title={track.is_active ? "Hide from selector" : "Show in selector"}
                    onClick={() => handleToggleActive(track)}
                    className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                      track.is_active
                        ? "border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                        : "border-hairline text-muted hover:bg-slate-100"
                    }`}
                  >
                    {track.is_active ? "Active" : "Inactive"}
                  </button>
                  <button
                    type="button"
                    title="Delete track"
                    onClick={() => setConfirmDelete(track)}
                    className="text-xs px-2 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-card bg-surface p-6 shadow-xl space-y-4">
            <h3 className="text-base font-semibold text-ink">Delete track?</h3>
            <p className="text-sm text-muted">
              <strong>&ldquo;{confirmDelete.title}&rdquo;</strong> will be permanently removed from the music library and its audio file deleted. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Delete permanently
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-lg border border-hairline py-2 text-sm font-semibold text-ink hover:bg-page"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
