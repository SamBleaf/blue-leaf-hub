import { useState, useEffect } from "react";
import { authFetch } from "../../lib/authFetch.js";

const FORMAT_OPTIONS = [
  { value: "9x16",  label: "9×16 Reels / Stories",  hint: "Vertical, 1080×1920" },
  { value: "1x1",   label: "1×1 Feed Square",         hint: "Square, 1080×1080" },
  { value: "16x9",  label: "16×9 Landscape",          hint: "Wide, 1920×1080" },
  { value: "4x5",   label: "4×5 Portrait Feed",        hint: "Portrait, 1080×1350" },
];

const COLOUR_PRESETS = [
  { value: "brand",   label: "Brand",   hint: "Clean, cooler tones" },
  { value: "warm",    label: "Warm",    hint: "Golden hour feel" },
  { value: "natural", label: "Natural", hint: "True-to-life" },
];

export default function FinalAssembly({ asset, onDone }) {
  const [format, setFormat] = useState("9x16");
  const [colourPreset, setColourPreset] = useState("brand");
  const [burnCaptions, setBurnCaptions] = useState(true);
  const [musicTrackId, setMusicTrackId] = useState("");
  const [musicVolume, setMusicVolume] = useState(0.6);
  const [musicTracks, setMusicTracks] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [exportId, setExportId] = useState(null);
  const [exportStatus, setExportStatus] = useState(null);
  const [error, setError] = useState("");
  const [pollCount, setPollCount] = useState(0);

  // Load music library
  useEffect(() => {
    authFetch("/api/marketing/music")
      .then((r) => r.json())
      .then((j) => setMusicTracks(j.tracks || j || []))
      .catch(() => {});
  }, []);

  // Poll export status
  useEffect(() => {
    if (!exportId || exportStatus === "ready" || exportStatus === "failed") return;
    const timer = setTimeout(async () => {
      try {
        const r = await authFetch(`/api/marketing/media/${asset.id}/status`);
        const j = await r.json();
        // Find this specific export
        const exp = j.exports?.find?.((e) => e.id === exportId);
        if (exp) {
          setExportStatus(exp.status);
        }
        setPollCount((n) => n + 1);
      } catch {
        setPollCount((n) => n + 1);
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [exportId, exportStatus, asset.id, pollCount]);

  async function startExport() {
    if (!musicTrackId) { setError("Select a music track before exporting."); return; }
    setExporting(true);
    setError("");
    setExportId(null);
    setExportStatus(null);
    try {
      // Step 1: Create an export record for this asset + format
      const r1 = await authFetch(`/api/marketing/media/${asset.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ export_format: format, colour_preset: colourPreset }),
      });
      const j1 = await r1.json();
      if (!r1.ok) throw new Error(j1.error || `Error ${r1.status}`);
      const newExportId = j1.export_id || j1.id;

      // Step 2: Trigger final assembly with music via /api/marketing/assemble
      const r2 = await authFetch("/api/marketing/assemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          export_id: newExportId,
          music_track_id: musicTrackId,
          music_volume: musicVolume,
          colour_preset: colourPreset,
          export_formats: [format],
        }),
      });
      const j2 = await r2.json();
      if (!r2.ok) throw new Error(j2.error || `Error ${r2.status}`);

      setExportId(newExportId);
      setExportStatus("processing");
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }

  const isProcessing = exportStatus === "processing";
  const isDone = exportStatus === "ready";
  const isFailed = exportStatus === "failed";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left — settings */}
      <div className="space-y-5">
        <div>
          <h2 className="text-base font-semibold text-ink mb-0.5">Final Assembly</h2>
          <p className="text-sm text-muted">{asset.original_filename || "Selected video"}</p>
        </div>

        {/* Format */}
        <div>
          <label className="block text-sm font-medium text-ink mb-2">Export Format</label>
          <div className="grid grid-cols-2 gap-2">
            {FORMAT_OPTIONS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFormat(f.value)}
                className={[
                  "px-3 py-2.5 rounded-lg border text-left text-sm transition-all",
                  format === f.value ? "border-primary bg-primary/5 text-primary font-medium" : "border-hairline bg-surface text-ink hover:border-primary/40",
                ].join(" ")}
              >
                <div className="font-medium">{f.label}</div>
                <div className="text-xs text-muted">{f.hint}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Colour preset */}
        <div>
          <label className="block text-sm font-medium text-ink mb-2">Colour Grade</label>
          <div className="flex gap-2">
            {COLOUR_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setColourPreset(p.value)}
                className={[
                  "flex-1 px-3 py-2 rounded-lg border text-sm transition-all",
                  colourPreset === p.value ? "border-primary bg-primary/5 text-primary font-medium" : "border-hairline bg-surface text-muted hover:border-primary/40",
                ].join(" ")}
              >
                <div className="font-medium">{p.label}</div>
                <div className="text-xs">{p.hint}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Music track */}
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">
            Music Track <span className="text-red-500">*</span>
          </label>
          {musicTracks.length === 0 ? (
            <div className="text-sm text-muted bg-slate-50 border border-hairline rounded-lg px-3 py-2.5">
              No tracks in music library yet. Ask an admin to add tracks via Settings.
            </div>
          ) : (
            <select
              value={musicTrackId}
              onChange={(e) => setMusicTrackId(e.target.value)}
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              <option value="">Select a track…</option>
              {musicTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}{t.artist ? ` — ${t.artist}` : ""}{t.mood ? ` (${t.mood.replace(/_/g, " ")})` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Music volume */}
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">
            Music Volume — {Math.round(musicVolume * 100)}%
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={musicVolume}
            onChange={(e) => setMusicVolume(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted mt-0.5">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Captions */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              checked={burnCaptions}
              onChange={(e) => setBurnCaptions(e.target.checked)}
              className="sr-only"
            />
            <div className={`w-10 h-6 rounded-full transition-colors ${burnCaptions ? "bg-primary" : "bg-slate-200"}`} />
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${burnCaptions ? "translate-x-5" : "translate-x-1"}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-ink">Burn captions</p>
            <p className="text-xs text-muted">Auto-transcribe audio and overlay subtitles</p>
          </div>
        </label>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}

        <button
          onClick={startExport}
          disabled={exporting || isProcessing}
          className="w-full bg-primary text-white rounded-lg px-4 py-3 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {exporting || isProcessing ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              {isProcessing ? "Processing in background…" : "Starting export…"}
            </span>
          ) : "Export Video"}
        </button>
      </div>

      {/* Right — status / preview */}
      <div>
        {!exportId && (
          <div className="flex items-center justify-center h-full text-center text-muted border-2 border-dashed border-hairline rounded-xl p-8 min-h-[300px]">
            <div>
              <div className="text-3xl mb-3">🎬</div>
              <p className="text-sm font-medium text-ink mb-1">Configure your export</p>
              <p className="text-xs">Choose format, colour grade, music and captions,<br />then hit Export</p>
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="flex items-center justify-center h-full text-center border-2 border-dashed border-amber-300 bg-amber-50 rounded-xl p-8 min-h-[300px]">
            <div>
              <svg className="animate-spin w-8 h-8 text-amber-500 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-sm font-medium text-ink mb-1">Processing video</p>
              <p className="text-xs text-muted">This runs in the background — you can leave this page.<br />The export will appear in the Media library when ready.</p>
            </div>
          </div>
        )}

        {isDone && (
          <div className="flex items-center justify-center h-full text-center border-2 border-emerald-300 bg-emerald-50 rounded-xl p-8 min-h-[300px]">
            <div>
              <div className="text-3xl mb-3">✅</div>
              <p className="text-sm font-medium text-ink mb-1">Export ready</p>
              <p className="text-xs text-muted mb-4">Your video has been processed and saved to the media library.</p>
              <button
                onClick={onDone}
                className="bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Back to Media Library
              </button>
            </div>
          </div>
        )}

        {isFailed && (
          <div className="flex items-center justify-center h-full text-center border-2 border-red-300 bg-red-50 rounded-xl p-8 min-h-[300px]">
            <div>
              <div className="text-3xl mb-3">❌</div>
              <p className="text-sm font-medium text-ink mb-1">Export failed</p>
              <p className="text-xs text-muted mb-4">Something went wrong during processing. Check that FFmpeg is available on the server.</p>
              <button
                onClick={() => { setExportId(null); setExportStatus(null); }}
                className="text-sm border border-hairline px-4 py-2 rounded-lg text-muted hover:text-ink transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
