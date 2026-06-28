import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../lib/apiFetch.js";
import { DEMO_ASSET } from "./creatorData.js";
import { DemoBanner, ErrorNote } from "./MarketingStateBanner.jsx";

// Media Vault (Batch 2) — browse + filter marketing media. Client-side filters over the
// existing media list; demo fallback when the vault is unreachable. No live Supabase required.

const DEMO_ASSETS = [
  DEMO_ASSET,
  { id: "demo-2", demo: true, media_type: "photo", stage_detected: "frame", analysis_status: "complete", project_id: "demo", capture_date: "2026-06-10", original_filename: "frame-up.jpg", analysis: { summary: "Timber frame up at the frame stage." } },
  { id: "demo-3", demo: true, media_type: "drone_video", stage_detected: "site_slab", analysis_status: "pending", project_id: "demo", capture_date: "2026-05-20", original_filename: "slab-flyover.mp4", analysis: { summary: "Drone flyover of the slab pour." } },
];

export default function MediaVault() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);
  const [error, setError] = useState(null);
  const [stage, setStage] = useState("");
  const [type, setType] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [project, setProject] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { ok, data, error: e } = await apiFetch("/api/marketing/media?limit=200");
    const list = data?.assets || data?.media || data?.items || [];
    if (ok) {
      // Live response (even if empty) → show real data / a true empty state, never demo.
      setAssets(list);
      setUsingDemo(false);
    } else {
      // API unreachable → demo so the vault is still reviewable; clearly labelled, nothing saved.
      setAssets(DEMO_ASSETS);
      setUsingDemo(true);
      setError(e || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stages = useMemo(() => [...new Set(assets.map((a) => a.stage_detected).filter(Boolean))], [assets]);
  const types = useMemo(() => [...new Set(assets.map((a) => a.media_type).filter(Boolean))], [assets]);
  const projects = useMemo(() => [...new Set(assets.map((a) => a.project_id).filter(Boolean))], [assets]);

  const filtered = assets.filter(
    (a) =>
      (!stage || a.stage_detected === stage) &&
      (!type || a.media_type === type) &&
      (!analysis || a.analysis_status === analysis) &&
      (!project || a.project_id === project)
  );

  const Select = ({ value, onChange, options, label }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-hairline bg-surface px-2 py-1.5 text-xs text-ink focus:border-primary focus:outline-none">
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );

  return (
    <div className="space-y-5 pb-24">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Marketing</p>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">Media Vault</h1>
        <p className="mt-1 text-sm text-muted">Browse and filter project media, then open a photo in the Content Studio to create a post from it.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Select value={stage} onChange={setStage} options={stages} label="All stages" />
        <Select value={type} onChange={setType} options={types} label="All types" />
        <Select value={analysis} onChange={setAnalysis} options={["complete", "processing", "pending", "error"]} label="Any analysis" />
        <Select value={project} onChange={setProject} options={projects} label="All projects" />
      </div>
      <p className="text-[11px] text-muted">
        Stage = the build phase detected in the shot · Analysis = whether AI has described the photo yet (analysed photos give the Studio better angles).
      </p>

      {usingDemo && <DemoBanner />}
      <ErrorNote error={error} />

      {loading ? (
        <div className="rounded-card border border-hairline bg-surface p-6 text-sm text-muted">Loading media…</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((a) => (
            <div key={a.id} className="overflow-hidden rounded-card border border-hairline bg-surface">
              <div className="flex h-28 items-center justify-center bg-page">
                {a.preview_url ? <img src={a.preview_url} alt="" className="h-full w-full object-cover" /> : <span className="text-xs text-muted">{a.demo ? "Demo" : "No preview"}</span>}
              </div>
              <div className="p-2">
                <p className="truncate text-xs font-medium text-ink">{a.original_filename || a.analysis?.summary || "Untitled"}</p>
                <p className="text-[11px] text-muted">{a.stage_detected || a.media_type || "media"}{a.analysis_status ? ` · ${a.analysis_status}` : ""}</p>
                {!a.demo && (
                  <Link to={`/marketing/studio?asset_id=${a.id}`} className="mt-1 inline-block text-[11px] font-semibold text-primary underline">
                    Create from this →
                  </Link>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full text-sm text-muted">
              {assets.length === 0
                ? "No media yet. Upload site photos from the Media tab, then they’ll appear here to create from."
                : "No media matches these filters — clear a filter to see more."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
