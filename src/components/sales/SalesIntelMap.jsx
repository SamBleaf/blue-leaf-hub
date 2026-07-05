/**
 * SalesIntelMap — Sales Intelligence Map (G3-B2 viz layer). Collapsible panel near
 * the top of the Sales pipeline — default collapsed so the pipeline board stays
 * primary; opens to a modest-height map on demand.
 *
 * Fetches GET /api/sales/leads-map — geocoded leads only, coloured by fit_quality
 * (strong=green … poor/price_shopper=red, unknown=grey). Optional filter by fit
 * or source. Click a dot → open the lead (/sales/:id).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../lib/apiFetch.js";
import HubMap from "../maps/HubMap.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import { LEAD_FIT_QUALITY_LABELS } from "../../lib/constants.js";

const OPEN_KEY = "blhub_sales_intel_map_open";

// Same semantic tiers as FIT_QUALITY_VARIANT (SalesBits.jsx) — strong=success,
// possible=info, nurture=neutral, poor/price_shopper=danger — expressed as hex
// since Mapbox markers are native DOM/canvas elements outside Tailwind's reach.
const FIT_COLOR = {
  strong:        "#16A34A", // success (green)
  possible:      "#0284C7", // info (sky)
  nurture:       "#94A3B8", // neutral (slate)
  poor:          "#DC2626", // danger (red)
  price_shopper: "#DC2626", // danger (red)
};
const UNKNOWN_COLOR = "#94A3B8"; // grey — no fit_quality set yet

export default function SalesIntelMap() {
  const nav = useNavigate();
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(OPEN_KEY) === "true"; } catch { return false; }
  });
  const [leadsMap, setLeadsMap] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState("");
  const [fitFilter, setFitFilter] = useState("");

  useEffect(() => {
    if (!open || loadedOnce) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { ok, data, error: e } = await apiFetch("/api/sales/leads-map");
      if (cancelled) return;
      if (ok) setLeadsMap(data.leadsMap || []);
      else setError(e || "Failed to load leads map");
      setLoading(false);
      setLoadedOnce(true);
    })();
    return () => { cancelled = true; };
  }, [open, loadedOnce]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem(OPEN_KEY, String(next)); } catch { /* noop */ }
      return next;
    });
  }

  const fitOptions = useMemo(() => {
    const present = new Set(leadsMap.map((l) => l.fitQuality).filter(Boolean));
    return [...present];
  }, [leadsMap]);

  const filtered = fitFilter ? leadsMap.filter((l) => l.fitQuality === fitFilter) : leadsMap;

  const points = filtered.map((l) => ({
    id: l.id,
    lat: l.geoLat,
    lng: l.geoLng,
    label: `${l.name}${l.suburb ? " — " + l.suburb : ""}`,
    color: FIT_COLOR[l.fitQuality] || UNKNOWN_COLOR,
    meta: l,
  }));

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-surface">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-ink transition-colors hover:bg-page focus-ring"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-muted">Sales Intelligence — Map</span>
          {loadedOnce && (
            <span className="rounded-full border border-hairline bg-page px-2 py-0.5 text-xs font-normal text-muted">
              {leadsMap.length} geocoded lead{leadsMap.length !== 1 ? "s" : ""}
            </span>
          )}
        </span>
        <span className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-hairline px-4 pb-4 pt-3">
          {error && <p className="text-sm text-danger">{error}</p>}

          {loading ? (
            <p className="py-6 text-center text-sm text-muted">Loading map…</p>
          ) : leadsMap.length === 0 ? (
            <EmptyState
              compact
              title="No geocoded leads yet"
              hint="Leads are geocoded once qualified — run the geo backfill (Settings → Admin) to plot them here."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-muted">Fit:</span>
                <button
                  type="button"
                  onClick={() => setFitFilter("")}
                  className={`rounded-full px-2.5 py-1 font-semibold transition ${!fitFilter ? "bg-primary text-white" : "border border-hairline text-ink hover:bg-page"}`}
                >
                  All
                </button>
                {fitOptions.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFitFilter(f)}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold transition ${fitFilter === f ? "bg-primary text-white" : "border border-hairline text-ink hover:bg-page"}`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: FIT_COLOR[f] || UNKNOWN_COLOR }} />
                    {LEAD_FIT_QUALITY_LABELS[f] || f}
                  </button>
                ))}
              </div>

              <HubMap points={points} onPointClick={(id) => nav(`/sales/${id}`)} height="320px" />
            </>
          )}
        </div>
      )}
    </div>
  );
}
