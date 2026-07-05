/**
 * OpsJobsMap — Ops Job Map (G3-C). Shown at the top of the Operations dashboard
 * (the "no job/project selected" landing state), above the project list.
 *
 * Fetches GET /api/operations/jobs-map, which returns two layers:
 *   • jobsMap      — active builder PROJECTS at their linked job's coords.
 *                    Circle markers, coloured by schedule health (green/amber/red)
 *                    — the same overdue-derived signal as OpsProjectCard/healthMeta.
 *   • carpentryMap — live CARPENTRY jobs (active/on_hold/defects) at their own
 *                    geocoded coords (mig 138). Most are standalone subcontract work
 *                    for an external builder, so they never appear via the project
 *                    join. Rendered as SQUARE markers in a single flat brand colour —
 *                    carpentry has no schedule-health signal (it uses milestones, not
 *                    schedule_tasks), so shape marks the type and colour is neutral.
 *
 * Click a builder pin → that project; click a carpentry pin → that carpentry job.
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

// Carpentry layer — Blue Leaf primary (teal). Sits outside the green/amber/red
// health palette on purpose: carpentry pins carry no schedule-health meaning.
const CARPENTRY_COLOR = "#006c9b";

export default function OpsJobsMap() {
  const nav = useNavigate();
  const [jobsMap, setJobsMap] = useState([]);
  const [carpentryMap, setCarpentryMap] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { ok, data, error: e } = await apiFetch("/api/operations/jobs-map");
      if (cancelled) return;
      if (ok) {
        setJobsMap(data.jobsMap || []);
        setCarpentryMap(data.carpentryMap || []);
      } else {
        setError(e || "Failed to load job map");
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Builder projects — circles, coloured by schedule health.
  const builderPoints = jobsMap.map((p) => ({
    id: p.id,
    lat: p.geoLat,
    lng: p.geoLng,
    label: p.address,
    color: HEALTH_COLOR[p.health] || HEALTH_COLOR.green,
    shape: "circle",
    meta: p,
  }));

  // Carpentry jobs — squares, flat brand colour. Prefix the marker id so the click
  // handler can route to the carpentry job (a different UUID space + route).
  const carpentryPoints = carpentryMap.map((c) => ({
    id: `carp:${c.id}`,
    lat: c.geoLat,
    lng: c.geoLng,
    label: c.reference ? `${c.reference} · ${c.address}` : c.address,
    color: CARPENTRY_COLOR,
    shape: "square",
    meta: c,
  }));

  const points = [...builderPoints, ...carpentryPoints];

  const handlePointClick = (id) => {
    if (typeof id === "string" && id.startsWith("carp:")) {
      nav(`/carpentry/${id.slice(5)}`);
    } else {
      nav(`/operations/${id}`);
    }
  };

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">Active sites — map</h3>
          <p className="text-xs text-muted">Geocoded active builds and carpentry jobs.</p>
        </div>
        {points.length > 0 && (
          <div className="hidden flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted sm:flex">
            {builderPoints.length > 0 && Object.entries(HEALTH_LABEL).map(([key, label]) => (
              <span key={key} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border border-white shadow-sm" style={{ backgroundColor: HEALTH_COLOR[key] }} />
                {label}
              </span>
            ))}
            {carpentryPoints.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[2px] border border-white shadow-sm" style={{ backgroundColor: CARPENTRY_COLOR }} />
                Carpentry
              </span>
            )}
          </div>
        )}
      </div>

      {error && <p className="mb-2 text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="py-6 text-center text-sm text-muted">Loading map…</p>
      ) : points.length === 0 ? (
        <EmptyState
          compact
          title="No active sites to map yet"
          hint="Active builds and carpentry jobs with a geocoded site appear here as pins. (Tender-stage jobs live on the Sales map.)"
        />
      ) : (
        <HubMap points={points} onPointClick={handlePointClick} height="360px" />
      )}
    </div>
  );
}
