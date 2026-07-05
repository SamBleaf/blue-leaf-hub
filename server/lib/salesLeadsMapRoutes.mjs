// salesLeadsMapRoutes.mjs — Sales Intelligence Map (G3-B2 viz layer).
//
// GET /api/sales/leads-map
//   Returns geocoded leads only (leads.geo_lat/geo_lng — migration 134). Suburb-only
//   leads (not yet qualified) have no precise pin and are excluded — the map plots
//   real coordinates, never invented ones.
//
// Returns { ok:true, leadsMap:[...] } — camelCase, apiResponse law.
//
// Admin-gated to match the sibling /api/marketing/area-performance endpoint — this
// route exposes individual lead coordinates (near rooftop precision once qualified),
// a more sensitive surface than the coarse suburb rollups shown elsewhere.

import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import { ok, err, rowsToCamel, translateDbError } from "./apiResponse.mjs";
import { displayLeadName } from "../../src/lib/leadUtils.js";

export function registerSalesLeadsMapRoutes(app) {
  app.get("/api/sales/leads-map", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured");

    try {
      const { data: leads, error } = await sb
        .from("leads")
        .select("id, name, first_name, last_name, suburb, stage, fit_quality, lead_source_category, geo_lat, geo_lng, geo_confidence")
        .eq("archived", false)
        .not("geo_lat", "is", null)
        .not("geo_lng", "is", null);
      if (error) return err(res, 500, translateDbError(error));

      const leadsMap = rowsToCamel(leads || [])
        .filter((l) => Number.isFinite(Number(l.geoLat)) && Number.isFinite(Number(l.geoLng)))
        .map((l) => ({
          id: l.id,
          name: displayLeadName(l),
          suburb: l.suburb,
          stage: l.stage,
          fitQuality: l.fitQuality,
          leadSourceCategory: l.leadSourceCategory,
          geoLat: Number(l.geoLat),
          geoLng: Number(l.geoLng),
          geoConfidence: l.geoConfidence,
        }));

      return ok(res, { leadsMap });
    } catch (e) {
      return err(res, 500, translateDbError(e));
    }
  });
}
