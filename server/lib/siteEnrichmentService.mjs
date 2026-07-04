// siteEnrichmentService.mjs — Site Intelligence enrichment (G1-B).
//
// Enriches a job or lead from its coordinate with 4 free data layers:
//   1. LGA / Council       — ArcGIS REST point-intersect (location.sa.gov.au)
//   2. Bushfire overlay    — ArcGIS REST point-intersect (dpti.geohub.sa.gov.au)
//   3. P&D Code zone       — ArcGIS REST point-intersect (location.sa.gov.au)
//   4. Slope band          — Mapbox Tilequery on mapbox-terrain-v2 (ele field;
//                            samples a grid of points around the site)
//
// Fail-soft contract:
//   - NEVER throws to the caller. Returns { ok:false, reason } on hard failure.
//   - Each layer is independently wrapped in try/catch — one layer failing
//     does NOT block the others.
//   - Missing MAPBOX_TOKEN means slope is null; the other 3 layers still run.
//   - Missing DB client → { ok:false, reason:'no_db' }.
//
// Advisory signals only — data is labelled for human review, never treated as
// authoritative planning/compliance determinations.

import { config as dotenvConfig } from "dotenv";
import { getServiceSupabase } from "./supabaseService.mjs";
import { geocodeToFacts } from "./geocodeService.mjs";

// Dotenv override (same pattern as geocodeService.mjs / marketingAgent.mjs).
const { parsed: _env = {} } = dotenvConfig();

function _resolveMapboxToken() {
  return process.env.MAPBOX_TOKEN?.trim() || _env.MAPBOX_TOKEN?.trim() || null;
}

// ── Endpoint constants (from G1A_SA_SPATIAL_DATA_SPIKE.md) ───────────────────
// These are the exact URLs documented in the spike; easy to update after live test.

/** LGA / Council boundary — GrowthManagementData FeatureServer layer 8. */
const ENDPOINT_LGA =
  "https://location.sa.gov.au/server6/rest/services/GrowthManagementPublic/GrowthManagementData/FeatureServer/8/query";

/**
 * Bushfire overlay — consultation layer (confirmed live in spike; resolve the
 * live current PDC layer URL after the first live test per G1-B checklist).
 * dpti.geohub.sa.gov.au Hosted/Bushfire_Consult_v07_WFL1 FeatureServer layer 4.
 */
const ENDPOINT_BUSHFIRE =
  "https://dpti.geohub.sa.gov.au/server/rest/services/Hosted/Bushfire_Consult_v07_WFL1/FeatureServer/4/query";

/**
 * P&D Code zone — CodeAmendments_BaseLayers_plansadb FeatureServer layer 2.
 * Confirmed queryable in spike; verify currency of data after live test.
 */
const ENDPOINT_ZONE =
  "https://location.sa.gov.au/server6/rest/services/GrowthManagementPublic/CodeAmendments_BaseLayers_plansadb/FeatureServer/2/query";

/** Mapbox Tilequery — mapbox-terrain-v2 for elevation (ele field, contour layer). */
const MAPBOX_TILEQUERY_BASE = "https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery";

// ── Grid sampling for slope estimation ───────────────────────────────────────
// Sample a 3×3 grid of points ~50 m apart (≈0.00045° lat, ≈0.00055° lng at 35°S).
// Rise/run over the grid gives an approximate slope in degrees.
const _GRID_OFFSETS = [-0.00045, 0, 0.00045]; // degrees ≈ 50 m at Adelaide lat

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Build an ArcGIS REST `/query` URL for a point-intersect against a polygon layer.
 * inSR=4326 tells the server to accept WGS84 lat/lng directly.
 *
 * @param {string} endpoint  — base FeatureServer or MapServer /query URL
 * @param {number} lat
 * @param {number} lng
 * @returns {string}
 */
export function arcgisPointQueryUrl(endpoint, lat, lng) {
  const params = new URLSearchParams({
    geometry:      `${lng},${lat}`,
    geometryType:  "esriGeometryPoint",
    inSR:          "4326",
    spatialRel:    "esriSpatialRelIntersects",
    outFields:     "*",
    returnGeometry: "false",
    f:             "json",
  });
  return `${endpoint}?${params.toString()}`;
}

/**
 * Perform an ArcGIS point-intersect query and return the first matching feature's
 * attributes, or null if no features / error.
 * Fail-soft: never throws.
 *
 * @param {string} endpoint
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<Record<string,unknown>|null>}
 */
export async function arcgisPointQuery(endpoint, lat, lng) {
  const url = arcgisPointQueryUrl(endpoint, lat, lng);
  // The SA gov ArcGIS servers are intermittently slow/5xx (see G1-A spike), so
  // retry once on timeout/network/5xx with a longer timeout before giving up.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        if (res.status >= 500 && attempt < 2) continue;
        console.warn(`[siteEnrichment] ArcGIS ${res.status} for ${endpoint}`);
        return null;
      }
      const json = await res.json();
      // ArcGIS may return an `error` property even on HTTP 200.
      if (json?.error) {
        console.warn(`[siteEnrichment] ArcGIS error from ${endpoint}:`, json.error);
        return null;
      }
      const features = json?.features;
      if (!Array.isArray(features) || features.length === 0) return null;
      return features[0]?.attributes ?? null;
    } catch (e) {
      if (attempt < 2) continue; // timeout/network — one retry, then fail-soft
      console.warn(`[siteEnrichment] arcgisPointQuery fetch error (${endpoint}):`, e?.message ?? e);
      return null;
    }
  }
  return null;
}

/**
 * Fetch elevation (metres) for a single lat/lng via Mapbox Tilequery.
 * Filters FeatureCollection features for layer=="contour" and reads ele.
 * Returns null if no token or any error.
 * Fail-soft: never throws.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<number|null>}
 */
export async function mapboxElevation(lat, lng) {
  const token = _resolveMapboxToken();
  if (!token) return null;
  try {
    const url = `${MAPBOX_TILEQUERY_BASE}/${lng},${lat}.json?access_token=${token}&layers=contour&limit=5`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.warn(`[siteEnrichment] Mapbox Tilequery ${res.status} for (${lat},${lng})`);
      return null;
    }
    const json = await res.json();
    const features = json?.features;
    if (!Array.isArray(features) || features.length === 0) return null;
    // Pick the contour feature with the highest ele (nearest to the surface).
    let maxEle = null;
    for (const f of features) {
      if (f?.properties?.layer !== "contour") continue;
      const ele = f?.properties?.ele;
      if (typeof ele === "number" && (maxEle === null || ele > maxEle)) {
        maxEle = ele;
      }
    }
    return maxEle;
  } catch (e) {
    console.warn(`[siteEnrichment] mapboxElevation fetch error:`, e?.message ?? e);
    return null;
  }
}

/**
 * Estimate slope in degrees by sampling a 3×3 grid around the site.
 * Returns null if < 2 elevations were successfully retrieved (can't compute slope).
 * Fail-soft: never throws.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<number|null>} slope in degrees
 */
async function _estimateSlope(lat, lng) {
  const elevations = [];
  for (const dLat of _GRID_OFFSETS) {
    for (const dLng of _GRID_OFFSETS) {
      const ele = await mapboxElevation(lat + dLat, lng + dLng);
      if (ele !== null) elevations.push(ele);
    }
  }
  if (elevations.length < 2) return null;
  const minEle = Math.min(...elevations);
  const maxEle = Math.max(...elevations);
  // Grid spans ~100 m (two offsets × 50 m) diagonally.
  // Use the diagonal distance for the grid: sqrt((100)^2 + (100)^2) ≈ 141 m.
  const risem = maxEle - minEle;
  const runm  = 141;
  const slopeDeg = (Math.atan(risem / runm) * 180) / Math.PI;
  return Math.round(slopeDeg * 10) / 10; // one decimal place
}

/**
 * Convert slope in degrees to a slope band label.
 *
 * Bands (builder-relevant):
 *   flat     : < 2°   — essentially level; standard slab
 *   gentle   : 2–8°   — modest cut/fill
 *   moderate : 8–20°  — retaining likely; split-level possible
 *   steep    : ≥ 20°  — significant civil/retaining works
 *
 * @param {number|null} deg
 * @returns {"flat"|"gentle"|"moderate"|"steep"|null}
 */
export function slopeToBand(deg) {
  if (deg === null || deg === undefined || typeof deg !== "number") return null;
  if (deg < 2)  return "flat";
  if (deg < 8)  return "gentle";
  if (deg < 20) return "moderate";
  return "steep";
}

/**
 * Derive a site complexity signal from the layer results.
 *
 *   high   — bushfire-prone OR steep slope
 *   medium — moderate slope OR a notable planning zone (non-suburban)
 *   low    — otherwise
 *
 * @param {{ bushfireProne:boolean|null, slopeBand:string|null, zone:string|null }} p
 * @returns {"low"|"medium"|"high"}
 */
export function deriveComplexity({ bushfireProne, slopeBand, zone }) {
  if (bushfireProne === true || slopeBand === "steep") return "high";
  if (slopeBand === "moderate") return "medium";
  // Zones that typically imply stricter planning / more design constraints.
  const notableZones = [
    "hills face",
    "rural",
    "primary production",
    "conservation",
    "coastal",
    "township",
  ];
  if (zone && notableZones.some((z) => zone.toLowerCase().includes(z))) return "medium";
  return "low";
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Enrich a job or lead row with site intelligence from 4 free data layers.
 *
 * Steps:
 *   1. Load the row.
 *   2. Ensure coordinates: if geo_lat is null, call geocodeToFacts first.
 *   3. Query each layer independently (fail-soft — one layer failing ≠ total failure).
 *   4. Derive site_slope_band from slope degrees.
 *   5. Derive site_complexity rollup.
 *   6. Write site_* columns + site_intel jsonb + site_enriched_at.
 *   7. Return summary object.
 *
 * @param {"jobs"|"leads"} table
 * @param {string} id  — row UUID
 * @returns {Promise<{ok:boolean,reason?:string,council?:string,bushfireProne?:boolean,zone?:string,slopeBand?:string,complexity?:string}>}
 */
export async function enrichSite(table, id) {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, reason: "no_db" };

  // ── 1. Load the row ───────────────────────────────────────────────────────
  let row;
  try {
    const fields = table === "leads"
      ? "id, geo_lat, geo_lng, site_address, suburb"
      : "id, geo_lat, geo_lng, address";
    const { data, error } = await sb.from(table).select(fields).eq("id", id).single();
    if (error || !data) {
      console.warn(`[siteEnrichment] Row not found ${table}/${id}:`, error?.message);
      return { ok: false, reason: "row_not_found" };
    }
    row = data;
  } catch (e) {
    console.warn(`[siteEnrichment] Load error ${table}/${id}:`, e?.message ?? e);
    return { ok: false, reason: "load_error" };
  }

  // ── 2. Ensure coordinates ─────────────────────────────────────────────────
  if (!row.geo_lat || !row.geo_lng) {
    // Attempt geocoding — fires the address through geocodeService.
    const rawAddress = table === "leads"
      ? String(row.site_address || row.suburb || "").trim()
      : String(row.address || "").trim();
    if (rawAddress) {
      await geocodeToFacts(table, id, rawAddress, "address").catch(() => {});
      // Re-load to pick up freshly written coords.
      try {
        const { data: refreshed } = await sb
          .from(table)
          .select("geo_lat, geo_lng")
          .eq("id", id)
          .single();
        if (refreshed?.geo_lat) {
          row.geo_lat = refreshed.geo_lat;
          row.geo_lng = refreshed.geo_lng;
        }
      } catch { /* non-fatal */ }
    }
  }

  if (!row.geo_lat || !row.geo_lng) {
    return { ok: false, reason: "no_coords" };
  }

  const lat = Number(row.geo_lat);
  const lng = Number(row.geo_lng);

  // ── 3. Query each layer independently ────────────────────────────────────
  const rawLayers = {};

  // Layer 1 — LGA / Council
  let council = null;
  try {
    const attrs = await arcgisPointQuery(ENDPOINT_LGA, lat, lng);
    rawLayers.lga = attrs;
    if (attrs) {
      // Prefer `lga` field; fall back to `abbname`.
      council = attrs.lga ?? attrs.abbname ?? null;
      if (typeof council === "string") council = council.trim() || null;
    }
  } catch (e) {
    console.warn("[siteEnrichment] LGA layer error:", e?.message ?? e);
    rawLayers.lga = null;
  }

  // Layer 2 — Bushfire overlay
  let bushfireProne = null;
  let bushfireDetail = null;
  try {
    const attrs = await arcgisPointQuery(ENDPOINT_BUSHFIRE, lat, lng);
    rawLayers.bushfire = attrs;
    if (attrs) {
      // Any matching feature = the site is in a bushfire overlay polygon.
      bushfireProne = true;
      // Capture the risk class / name for detail.
      bushfireDetail = attrs.name ?? attrs.value ?? attrs.description ?? null;
      if (typeof bushfireDetail === "string") bushfireDetail = bushfireDetail.trim() || null;
    } else {
      // IMPORTANT: the current ENDPOINT_BUSHFIRE is an UNVERIFIED consultation layer
      // (partial coverage — confirmed in G1-B live test: it misses known bushfire-prone
      // areas like Stirling). So "no feature" is INCONCLUSIVE, not a safe "not prone".
      // Leave as null (unknown) to avoid a dangerous false-negative on a safety/cost flag.
      // Set to `false` only once a verified statewide bushfire layer is wired.
      bushfireProne = null;
      bushfireDetail = "layer unverified — treat as unknown";
    }
  } catch (e) {
    console.warn("[siteEnrichment] Bushfire layer error:", e?.message ?? e);
    rawLayers.bushfire = null;
  }

  // Layer 3 — P&D Code zone
  let zone = null;
  try {
    const attrs = await arcgisPointQuery(ENDPOINT_ZONE, lat, lng);
    rawLayers.zone = attrs;
    if (attrs) {
      zone = attrs.name ?? attrs.zone_code ?? null;
      if (typeof zone === "string") zone = zone.trim() || null;
    }
  } catch (e) {
    console.warn("[siteEnrichment] Zone layer error:", e?.message ?? e);
    rawLayers.zone = null;
  }

  // Layer 4 — Slope (Mapbox Tilequery grid)
  let slopeDeg = null;
  let slopeBand = null;
  try {
    slopeDeg = await _estimateSlope(lat, lng);
    slopeBand = slopeToBand(slopeDeg);
    rawLayers.slope = { slopeDeg, slopeBand };
  } catch (e) {
    console.warn("[siteEnrichment] Slope layer error:", e?.message ?? e);
    rawLayers.slope = null;
  }

  // ── 4. Derive complexity ──────────────────────────────────────────────────
  const complexity = deriveComplexity({ bushfireProne, slopeBand, zone });

  // ── 5. Write columns ──────────────────────────────────────────────────────
  const updates = {
    site_council:        council,
    site_bushfire_prone: bushfireProne,
    site_bushfire_detail: bushfireDetail,
    site_zone:           zone,
    site_slope_deg:      slopeDeg,
    site_slope_band:     slopeBand,
    site_complexity:     complexity,
    site_enriched_at:    new Date().toISOString(),
    site_intel:          rawLayers,
  };

  try {
    const { error: writeErr } = await sb.from(table).update(updates).eq("id", id);
    if (writeErr) {
      console.warn(`[siteEnrichment] DB write error ${table}/${id}:`, writeErr.message);
      // Still return partial results even if the write failed.
      return { ok: false, reason: "write_error", council, bushfireProne, zone, slopeBand, complexity };
    }
  } catch (e) {
    console.warn(`[siteEnrichment] DB write exception ${table}/${id}:`, e?.message ?? e);
    return { ok: false, reason: "write_exception", council, bushfireProne, zone, slopeBand, complexity };
  }

  return { ok: true, council, bushfireProne, zone, slopeBand, complexity };
}
