/**
 * OpsJobsMap — Ops Job Map (G3-C). Shown at the top of the Operations dashboard
 * (the "no job/project selected" landing state), above the project list.
 *
 * Fetches GET /api/operations/jobs-map — active projects plotted at their linked
 * job's geocoded coordinates. Colour = schedule health (green/amber/red) — the
 * same overdue-derived signal already used by OpsProjectCard/healthMeta, since
 * there is no reliable per-project "construction phase" column to key a phase
 * colour off. Click a pin → navigate to that project.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../lib/apiFetch.js";
import HubMap from "../maps/HubMap.jsx";
import EmptyState from "../ui/EmptyState.jsx";

const HEALTH_COLOR = {
  green: "#16A34A", // matches healthMeta "on track" (bg-green-400 family)
  amber: "#D4A24C", // matches the Hub "warning" token
  red:   "#DC2626", // matches healthMeta "behind" (bg-red-500 family)
};

const HEALTH_LABEL = { green: "On track", amber: "Attention", red: "Behind" };

export default function OpsJobsMap() {
  const nav = useNavigate();
  const [jobsMap, setJobsMap] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { ok, data, error: e } = await apiFetch("/api/operations/jobs-map");
      if (cancelled) return;
      if (ok) setJobsMap(data.jobsMap || []);
      else setError(e || "Failed to load job map");
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const points = jobsMap.map((p) => ({
    id: p.id,
    lat: p.geoLat,
    lng: p.geoLng,
    label: p.address,
    color: HEALTH_COLOR[p.health] || HEALTH_COLOR.green,
    meta: p,
  }));

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">Active jobs — map</h3>
          <p className="text-xs text-muted">Geocoded active builds, coloured by schedule health.</p>
        </div>
        {points.length > 0 && (
          <div className="hidden items-center gap-3 text-xs text-muted sm:flex">
            {Object.entries(HEALTH_LABEL).map(([key, label]) => (
              <span key={key} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border border-white shadow-sm" style={{ backgroundColor: HEALTH_COLOR[key] }} />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {error && <p className="mb-2 text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="py-6 text-center text-sm text-muted">Loading map…</p>
      ) : points.length === 0 ? (
        <EmptyState
          compact
          title="No active projects to map yet"
          hint="Active projects with a geocoded site appear here as pins. (Tender-stage jobs live on the Sales map.)"
        />
      ) : (
        <HubMap points={points} onPointClick={(id) => nav(`/operations/${id}`)} height="360px" />
      )}
    </div>
  );
}
