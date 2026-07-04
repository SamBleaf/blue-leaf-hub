// geocodeService.mjs — Mapbox geocoding with cache-first deduplication.
//
// Uses the Mapbox Geocoding v6 API:
//   GET https://api.mapbox.com/search/geocode/v6/forward
//
// Flow:
//   1. normaliseAddress(rawAddress) → stable query string
//   2. Check geocode_cache (by query_normalised) → return cached hit
//   3. On miss: call Mapbox v6 forward geocoding
//   4. Map response → { lat, lng, confidence, placeId, precision, source }
//   5. Write result to geocode_cache
//   6. Return result (or null on any error / no token / no result)
//
// Fail-soft contract: NEVER throws. Returns null on token-absent, API error,
// or no result. Logs a single warning line so the caller can detect the issue
// without crashing.
//
// IMPORTANT: Do NOT call this during server boot / module load. The function is
// invoked lazily so that a missing MAPBOX_TOKEN is a graceful null, not a crash.

import { config as dotenvConfig } from "dotenv";
import { normaliseAddress } from "./addressNormalise.mjs";
import { getServiceSupabase } from "./supabaseService.mjs";

// Dotenv override: if shell has MAPBOX_TOKEN='', dotenv.config() won't override it.
// Resolve the token lazily via the same pattern used in marketingAgent.mjs.
const { parsed: _env = {} } = dotenvConfig();

function _resolveToken() {
  return process.env.MAPBOX_TOKEN?.trim() || _env.MAPBOX_TOKEN?.trim() || null;
}

// ── Mapbox v6 accuracy → our confidence vocabulary ──────────────────────────
// Mapbox v6 properties.coordinates.accuracy values:
//   rooftop, parcel, point, interpolated, approximate
// We map to: rooftop | interpolated | locality | failed
function _mapAccuracy(accuracy, featureType) {
  if (!accuracy && !featureType) return "locality";
  // feature_type of 'address' with rooftop/parcel accuracy → rooftop
  if (accuracy === "rooftop" || accuracy === "parcel") return "rooftop";
  if (accuracy === "interpolated" || accuracy === "point") return "interpolated";
  // place/locality/neighborhood feature types → locality confidence
  if (featureType === "place" || featureType === "locality" || featureType === "neighborhood") {
    return "locality";
  }
  return "interpolated";
}

// ── Cache lookup ─────────────────────────────────────────────────────────────
async function _cacheGet(sb, queryNormalised) {
  try {
    const { data, error } = await sb
      .from("geocode_cache")
      .select("lat, lng, confidence, place_id, precision, source")
      .eq("query_normalised", queryNormalised)
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

// ── Cache write (fail-soft — a cache miss on write is not fatal) ─────────────
async function _cacheSet(sb, queryNormalised, result) {
  try {
    await sb.from("geocode_cache").upsert(
      {
        query_normalised: queryNormalised,
        lat:        result.lat,
        lng:        result.lng,
        confidence: result.confidence,
        place_id:   result.placeId ?? null,
        precision:  result.precision,
        source:     result.source,
      },
      { onConflict: "query_normalised" }
    );
  } catch {
    // non-fatal — cache write failure never blocks the caller
  }
}

// ── Build Mapbox v6 query URL ────────────────────────────────────────────────
// For precision="suburb": restrict types to locality,place (suburb-centroid).
// For precision="address": prefer address type (falls back to place if not found).
function _buildUrl(queryStr, precision, token) {
  const base = "https://api.mapbox.com/search/geocode/v6/forward";
  const params = new URLSearchParams({
    q:            queryStr,
    country:      "au",
    limit:        "1",
    access_token: token,
  });
  // Bias ambiguous matches toward Adelaide/SA (BLH's operating region) so a
  // "Stirling SA 5152" query resolves locally instead of to a same-named
  // street interstate. Soft bias (proximity), not a hard bbox exclusion.
  params.set("proximity", process.env.GEOCODE_PROXIMITY?.trim() || "138.60,-34.93");
  if (precision === "suburb") {
    params.set("types", "locality,place");
  } else {
    // address precision — prefer address type; Mapbox falls back gracefully
    params.set("types", "address");
  }
  return `${base}?${params.toString()}`;
}

// ── Core geocode function ────────────────────────────────────────────────────

/**
 * Geocode a raw Australian address string.
 *
 * @param {string} rawAddress
 * @param {{ precision?: "address" | "suburb" }} [options]
 * @returns {Promise<{lat:number, lng:number, confidence:string, placeId:string|null, precision:string, source:string}|null>}
 */
export async function geocode(rawAddress, { precision = "address" } = {}) {
  if (!rawAddress || typeof rawAddress !== "string") return null;

  // Step 1 — normalise
  const { normalised, suburb } = normaliseAddress(rawAddress);

  // Build the query string: for suburb precision use just the suburb (more stable);
  // for address precision use the full normalised address.
  const queryStr = precision === "suburb" && suburb ? suburb : (normalised || rawAddress.trim());
  if (!queryStr) return null;

  const sb = getServiceSupabase();

  // Step 2 — cache check (skip if no DB client)
  if (sb) {
    const cached = await _cacheGet(sb, queryStr);
    if (cached) {
      return {
        lat:        Number(cached.lat),
        lng:        Number(cached.lng),
        confidence: cached.confidence,
        placeId:    cached.place_id ?? null,
        precision:  cached.precision,
        source:     cached.source,
      };
    }
  }

  // Step 3 — token check
  const token = _resolveToken();
  if (!token) {
    console.warn("[geocodeService] MAPBOX_TOKEN not set — skipping geocode for:", queryStr);
    return null;
  }

  // Step 4 — Mapbox v6 API call
  let feature;
  try {
    const url = _buildUrl(queryStr, precision, token);
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[geocodeService] Mapbox API error ${res.status} for query: ${queryStr}`);
      return null;
    }
    const json = await res.json();
    const features = json?.features;
    if (!features || features.length === 0) {
      console.warn("[geocodeService] No results from Mapbox for query:", queryStr);
      return null;
    }
    feature = features[0];
  } catch (err) {
    console.warn("[geocodeService] Fetch error:", err?.message ?? err);
    return null;
  }

  // Step 5 — map response
  const props = feature?.properties;
  const coords = props?.coordinates;
  if (!coords?.latitude || !coords?.longitude) {
    console.warn("[geocodeService] Mapbox response missing coordinates for query:", queryStr);
    return null;
  }

  const confidence = _mapAccuracy(coords.accuracy, props?.feature_type);
  const result = {
    lat:        coords.latitude,
    lng:        coords.longitude,
    confidence,
    placeId:    props?.mapbox_id ?? null,
    precision,
    source:     "mapbox",
  };

  // Step 6 — write to cache (fail-soft)
  if (sb) {
    await _cacheSet(sb, queryStr, result);
  }

  return result;
}

// ── Optional helper: geocode + write geo_* columns to jobs or leads ──────────
// Left as a thin wrapper here for G0-B to call; the actual on-save hook and
// backfill logic lives in G0-B. This helper is intentionally minimal.

/**
 * Geocode an entity's address and write the geo_* columns back to the DB.
 * Designed to be called from the on-save hook (G0-B) or a backfill script.
 *
 * @param {"jobs"|"leads"} table
 * @param {string} id  — row UUID
 * @param {string} rawAddress
 * @param {"address"|"suburb"} [precision]
 * @returns {Promise<boolean>} true if geocoded + written, false otherwise
 */
export async function geocodeToFacts(table, id, rawAddress, precision = "address") {
  const result = await geocode(rawAddress, { precision });
  if (!result) return false;

  const sb = getServiceSupabase();
  if (!sb) return false;

  try {
    const { error } = await sb
      .from(table)
      .update({
        geo_lat:         result.lat,
        geo_lng:         result.lng,
        geo_confidence:  result.confidence,
        geo_source:      result.source,
        geo_geocoded_at: new Date().toISOString(),
        geo_place_id:    result.placeId ?? null,
        geo_precision:   result.precision,
      })
      .eq("id", id);
    if (error) {
      console.warn(`[geocodeService] DB write error for ${table}/${id}:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[geocodeService] geocodeToFacts error for ${table}/${id}:`, err?.message ?? err);
    return false;
  }
}
