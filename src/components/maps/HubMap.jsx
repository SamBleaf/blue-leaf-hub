/**
 * HubMap — shared Mapbox GL map for the Hub (G3-A).
 *
 * One reusable map used by any module that needs to plot geocoded points
 * (jobs, leads, subcontractors, etc). Do NOT duplicate map setup per module —
 * extend this component instead.
 *
 * Props:
 *   points        — [{ id, lat, lng, label, color, shape?: "circle"|"square", meta? }]
 *                   (required; [] renders an empty map. shape defaults to "circle";
 *                   "square" is used to distinguish a second layer, e.g. carpentry
 *                   sites vs builder projects on the Ops map.)
 *   onPointClick  — (id) => void — called when a marker or its popup is clicked
 *   center        — [lng, lat] — initial centre. Default = Adelaide.
 *   fitToPoints   — boolean (default true) — fit bounds to all points once loaded
 *   zoom          — initial zoom when there are no points to fit to (default 11)
 *   height        — CSS height of the map container (default "420px")
 *   emptyHint     — optional override for the fail-soft placeholder hint text
 *
 * Fail-soft: if `import.meta.env.VITE_MAPBOX_TOKEN` is missing, renders a tidy
 * placeholder instead of crashing or calling out to Mapbox. Sam adds the token
 * to Vercel separately — this component must build and run without it. Hooks
 * still run unconditionally (Rules of Hooks) — they just no-op when there's no
 * token; the placeholder branch only affects the returned JSX.
 *
 * mapbox-gl is dynamically imported on mount (not a static top-level import) so
 * Rollup splits it into its own lazy chunk — it's a large lib only two routes
 * use, and a static import would have bloated the eagerly-loaded main bundle
 * past the PWA workbox precache limit.
 *
 * Cleans up the map instance (and all markers) on unmount.
 */
import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

// Adelaide — sensible default centre for a Hub with only SA-area jobs/leads today.
const DEFAULT_CENTER = [138.6, -34.93];
const DEFAULT_ZOOM = 11;

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

export default function HubMap({
  points = [],
  onPointClick,
  center = DEFAULT_CENTER,
  fitToPoints = true,
  zoom = DEFAULT_ZOOM,
  height = "420px",
  emptyHint,
  className = "",
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapboxglRef = useRef(null);
  const markersRef = useRef([]);
  const [loaded, setLoaded] = useState(false);

  // ── Load mapbox-gl + create the map once on mount ──────────────────────────
  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current || mapRef.current) return;

    let cancelled = false;

    import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      mapboxglRef.current = mapboxgl;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/light-v11",
        center,
        zoom,
      });
      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      map.on("load", () => setLoaded(true));
      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // Intentionally run once — center/zoom are only the *initial* view; changing
    // props after mount should not re-create the map instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render markers whenever points change (or the map finishes loading) ───
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxglRef.current;
    if (!MAPBOX_TOKEN || !map || !mapboxgl || !loaded) return;

    // Clear previous markers before re-drawing.
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    const valid = points.filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng));

    for (const p of valid) {
      const el = document.createElement("div");
      el.style.width = "16px";
      el.style.height = "16px";
      // Square markers distinguish a second layer (e.g. carpentry vs builder jobs);
      // circle is the default. Slight rounding on the square keeps it from looking harsh.
      el.style.borderRadius = p.shape === "square" ? "3px" : "50%";
      el.style.border = "2px solid #FFFFFF";
      el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.35)";
      el.style.backgroundColor = p.color || "#006c9b";
      el.style.cursor = onPointClick ? "pointer" : "default";

      const popup = new mapboxgl.Popup({ offset: 12, closeButton: false }).setText(p.label || "");

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([p.lng, p.lat])
        .setPopup(popup)
        .addTo(map);

      el.addEventListener("mouseenter", () => marker.togglePopup());
      el.addEventListener("mouseleave", () => marker.togglePopup());
      el.addEventListener("click", () => {
        if (onPointClick) onPointClick(p.id);
      });

      markersRef.current.push(marker);
    }

    // Fit bounds to the plotted points.
    if (fitToPoints && valid.length > 0) {
      if (valid.length === 1) {
        map.easeTo({ center: [valid[0].lng, valid[0].lat], zoom: Math.max(map.getZoom(), 13) });
      } else {
        const bounds = new mapboxgl.LngLatBounds();
        for (const p of valid) bounds.extend([p.lng, p.lat]);
        map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
      }
    }
  }, [points, loaded, onPointClick, fitToPoints]);

  // ── Fail-soft: no token, no map. Render a calm placeholder instead of crashing. ──
  if (!MAPBOX_TOKEN) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 rounded-card border border-dashed border-hairline bg-page text-center ${className}`}
        style={{ height }}
      >
        <p className="text-sm font-semibold text-ink">Map unavailable</p>
        <p className="max-w-xs text-xs text-muted">
          {emptyHint || "Set VITE_MAPBOX_TOKEN to enable the map."}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden rounded-card border border-hairline ${className}`}
      style={{ height }}
    />
  );
}
