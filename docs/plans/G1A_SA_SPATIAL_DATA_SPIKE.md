# G1A — SA Spatial Data Spike: Site Intelligence

**Date:** 2026-07-04  
**Goal:** Determine which South Australian government spatial datasets can be queried by a coordinate (lat/lng) to enrich a building site, for the Hub's "Site Intelligence" feature.  
**Study area:** Adelaide / Adelaide Hills, SA.

---

## Summary Table

| # | Dataset | Available? | Service / Endpoint | Point-queryable? | Auth / Cost | Key Field(s) | Caveat |
|---|---------|------------|-------------------|-----------------|-------------|--------------|--------|
| 1 | **LGA / Council boundary** | Yes | ArcGIS FeatureServer — `https://location.sa.gov.au/server6/rest/services/GrowthManagementPublic/GrowthManagementData/FeatureServer/8/query` | **Yes** — polygon layer; `spatialRel=esriSpatialRelIntersects` | Free / open, no key | `lga` (full name e.g. "ADELAIDE HILLS COUNCIL"), `abbname` | WKID 8059 (GDA2020); must project lat/lng from WGS84 before querying or use `inSR=4326` param |
| 1b | LGA (alternate, same geometry) | Yes | `https://location.sa.gov.au/server6/rest/services/GrowthManagementPublic/CodeAmendments_BaseLayers_plansadb/FeatureServer/0/query` | **Yes** | Free / open | `lga`, `abbname` | Same data as above, different host service |
| 2 | **Bushfire overlay (P&D Code)** | Uncertain — consultation version confirmed; current live layer unverified | MapServer (currently serves consultation layers): `https://dpti.geohub.sa.gov.au/server/rest/services/Hosted/Bushfire_Consult_v07_WFL1/FeatureServer/4/query` | **Yes** — polygon, supports spatial query | Free / open | `name`, `value`, `description` (risk class: High / Medium / General / Urban Interface) | **IMPORTANT:** The layer confirmed queryable is the *draft consultation* overlay (Code Amendment consultation 2023–24). The live current P&D Code bushfire layer is believed to be in `ePlanningPublic/CurrentPDC_wmas/MapServer` (dpti.geohub.sa.gov.au or location.sa.gov.au) but the exact layer ID was not confirmable — the ePlanningPublic server returned 500 errors during this spike. **Needs live test in G1-B.** Old Bushfire Protection Areas dataset (data.sa.gov.au) is superseded by PDI Act 2016 overlays. |
| 3 | **Land parcel / cadastre** (lot area, boundaries) | Partial | SA cadastral data held by Land Services SA. No free queryable REST endpoint found. Bulk data download only (min. $250 ex GST per Land Services SA pricing). ABS does not cover lot-level parcels. | **No** (not as a free point-query API) | **Paid** — Land Services SA charges minimum $250 ex GST for cadastral bulk data; no per-query API | Lot number, plan number, parcel area | Free workaround: SAPPA web UI shows parcel info visually but has no public API. Landchecker.com.au is a commercial option. Needs G1-B investigation into whether SAPPA exposes an undocumented layer or the Property Location Browser has a REST back-end. |
| 4 | **Planning & Design Code — Zone** | Yes (download), Uncertain (live REST) | Download: GeoJSON/SHP from `https://data.sa.gov.au/data/dataset/planning-and-design-code-zones` (CC-BY). Live REST layer: `CodeAmendments_BaseLayers_plansadb/FeatureServer/2/query` exists and returns zone data, but the `CurrentZones` MapServer in ePlanningPublic returned 404. | **Yes** via FeatureServer/2, or **import GeoJSON as a tile layer** | Free / open (Creative Commons) | `name` field (60+ zone types — Suburban Neighbourhood, Rural Zone, Hills Face Zone, etc.) | The CodeAmendments_BaseLayers service is the Code Amendment editing service — it appears to hold current zones but isn't the canonical live production PDC zone layer. The authoritative live layer is `ePlanningPublic/CurrentZones` but this returned errors. **Needs live test in G1-B.** GeoJSON bulk download is a reliable fallback (updated fortnightly). |
| 4b | **P&D Code — Overlays (all types)** | Yes (download), Uncertain (live REST) | Download: `https://data.sa.gov.au/data/dataset/planning-and-design-code-overlays` (GeoJSON, SHP, KML — CC-BY, updated fortnightly). All overlays in one file; query `name` field. | Download only — no confirmed live REST endpoint for point query | Free / open | `name` field (filter to get bushfire / heritage / flood / character area overlay names) | Use `definition query` on `name` field to extract specific overlay type. Live REST overlay layer may exist in ePlanningPublic/CurrentOverlays but wasn't reachable during this spike. |
| 5 | **Heritage / Character overlays** | Partial — layer IDs confirmed, server intermittent | `ePlanningPublic/CurrentPDC_wmas/MapServer/24` — State Heritage Place; `MapServer/75` — Character Preservation District | **Uncertain** — layer IDs confirmed via Google-indexed metadata; server returned 500 errors during spike | Free / open (if server accessible) | Layer 24: heritage register places. Layer 75: character preservation districts. | ePlanningPublic server was down/returning errors at time of spike. Also accessible as a named overlay in the bulk GeoJSON download from data.sa.gov.au. National Heritage List also available: `https://gis.environment.gov.au/gispubmap/rest/services/ogc_services/National_Heritage_List/FeatureServer` (confirmed public). |
| 6 | **Flood overlay (P&D Code)** | Yes — confirmed queryable | `https://location.sa.gov.au/server6/rest/services/ePlanningPublic/ConsultFlooding/MapServer/0/query` (consultation layer confirmed live). Also: separate flooding layers on dpti.geohub.sa.gov.au/server/rest/services/Hosted/ (Flooding_PC1b_WFL1, Flooding_v15_WFL1). | **Yes** — polygon, WKID 3857, supports `esriSpatialRelIntersects` | Free / open | `name`, `value`, `description` — flood hazard area classification | ConsultFlooding confirmed live but is a consultation/draft layer. The live current flood overlay is in ePlanningPublic/CurrentPDC (server currently intermittent). Flood data is noted as council-specific/patchy in some literature. |
| 7a | **Slope / Elevation — Mapbox Tilequery** | Yes | `https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/{lon},{lat}.json?access_token={TOKEN}` | **Yes** — point query, returns GeoJSON FeatureCollection | Existing Mapbox token usable. Free tier: **100,000 req/month**. Rate limit: 600 req/min. | `ele` (metres, contour layer, 10m increments) | 10m vertical resolution — enough to flag "flat vs steep" for a builder's purposes. Slope estimate: sample ~5–9 points in a grid around the site, compute rise/run. Not a DEM raster — it returns contour features so sparse data in flat areas. For Adelaide Hills this should work well given relief. |
| 7b | **Elevation — Geoscience Australia ELVIS** | Uncertain | `https://services.ga.gov.au/` — GA web services portal. ELVIS is a download/clipping tool, not a point-query API. | **No** (download only) | Free | 1m / 5m LiDAR DEM tiles available for SA | ELVIS is not suited to a per-property API call. Mapbox Tilequery is the better choice for MVP. For premium precision (e.g. a 1m LiDAR grid) a separate tiled DEM approach would be needed. |

---

## Endpoint Quick Reference

### Confirmed working (ArcGIS REST point query pattern)

All ArcGIS `/query` endpoints accept:
```
?geometry={lng},{lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&f=json
```

| Dataset | Endpoint |
|---------|----------|
| LGA (Council) | `https://location.sa.gov.au/server6/rest/services/GrowthManagementPublic/GrowthManagementData/FeatureServer/8/query` |
| P&D Code Zones (CodeAmendments service) | `https://location.sa.gov.au/server6/rest/services/GrowthManagementPublic/CodeAmendments_BaseLayers_plansadb/FeatureServer/2/query` |
| Flooding (consultation layer — live) | `https://location.sa.gov.au/server6/rest/services/ePlanningPublic/ConsultFlooding/MapServer/0/query` |
| Bushfire (consultation overlay — live) | `https://dpti.geohub.sa.gov.au/server/rest/services/Hosted/Bushfire_Consult_v07_WFL1/FeatureServer/4/query` |
| State Heritage Place (layer ID confirmed, server intermittent) | `https://location.sa.gov.au/server6/rest/services/ePlanningPublic/CurrentPDC_wmas/MapServer/24/query` |
| Character Preservation District (layer ID confirmed, server intermittent) | `https://location.sa.gov.au/server6/rest/services/ePlanningPublic/CurrentPDC_wmas/MapServer/75/query` |

### Elevation via Mapbox

```
GET https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/{lon},{lat}.json?access_token={TOKEN}
```
Returns GeoJSON FeatureCollection; filter for `layer = "contour"` and read `properties.ele` (metres).

### Bulk download fallbacks (not live REST, but authoritative data)

| Dataset | URL |
|---------|-----|
| P&D Code Overlays (all types incl. bushfire, heritage, flood) | `https://data.sa.gov.au/data/dataset/planning-and-design-code-overlays` — GeoJSON/SHP CC-BY, fortnightly refresh |
| P&D Code Zones | `https://data.sa.gov.au/data/dataset/planning-and-design-code-zones` — GeoJSON/SHP CC-BY |
| Bushfire Protection Areas (old Act — **superseded** post-PDI Act 2016) | `https://data.sa.gov.au/data/dataset/bushfire-protection-areas` |

---

## Reliability Observations

- **location.sa.gov.au/server6 (ePlanningPublic folder):** Returned `"Could not access any server machines"` (HTTP 500) consistently during this spike. This is the authoritative current PDC server — its instability is a real risk for a production feature. Plan for retry logic + fallback to bulk GeoJSON download.
- **GrowthManagementPublic services:** Stable and responding. The LGA + CodeAmendments layers here are the most reliably queryable.
- **dpti.geohub.sa.gov.au:** Partially accessible. The Hosted/Bushfire_Consult layer responded; the PlanSA folder showed minimal services.
- **cfs.geohub.sa.gov.au BMAP services:** These are assets-at-risk layers (buildings, infrastructure classified by bushfire risk), not the hazard zone polygons. Not the right layer for BAL assessment.
- **SA cadastral data (Land Services SA):** Explicitly not open data. Minimum fee $250 ex GST per licence. No free per-query REST API exists for SA parcel geometry or lot area.

---

## Cadastre / Parcel — Free Alternatives to Investigate (G1-B)

SA cadastral data is paywalled but several options may provide *sufficient* data for MVP:

1. **Geoscape G-NAF** — free geocoded addresses but does not include lot area.
2. **SAPPA undocumented API** — SAPPA (sappa.plan.sa.gov.au) renders parcel polygons and attributes in-browser. The network requests may reveal an undocumented REST back-end. Worth inspecting in browser devtools in G1-B.
3. **Landchecker.com.au / Data Army** — commercial property data aggregators covering SA. Unknown pricing for API access.
4. **Geoscape Buildings API** — Geoscape (formerly PSMA) has a Buildings API that returns lot attributes. Requires subscription but designed for developer use. Investigate pricing.

---

## MVP Recommendation

### Include in Site Intelligence MVP (3–4 datasets)

| Priority | Dataset | Why MVP? | Implementation |
|----------|---------|----------|----------------|
| **P1** | **LGA / Council** | Instantly useful — tells builder and client which council governs the site, links to council DA portal, identifies which council-specific overlays apply | `GrowthManagementData/FeatureServer/8/query` — confirmed stable, point-queryable. |
| **P1** | **Bushfire overlay (P&D Code)** | Highest cost impact for a builder — BAL rating, AS 3959 construction requirements. Adelaide Hills is predominantly high-risk. Clients ask about this constantly. | Use consultation overlay at `Hosted/Bushfire_Consult_v07_WFL1/FeatureServer/4` as interim; in G1-B resolve the live current PDC overlay URL. Alternatively, host the fortnightly GeoJSON from data.sa.gov.au as an internal tile layer. |
| **P2** | **P&D Code Zone** | Planning zone determines what you can build, minimum allotment sizes, setbacks. Essential for assessing feasibility. | Either `CodeAmendments_BaseLayers_plansadb/FeatureServer/2/query` (needs verification of currency) or import GeoJSON bulk download. In G1-B test whether the ePlanningPublic/CurrentZones MapServer is stable. |
| **P2** | **Elevation / slope (Mapbox Tilequery)** | Flat vs sloping site materially affects slab type, retaining walls, civil costs. Already have Mapbox token. | `mapbox-terrain-v2/tilequery/{lon},{lat}` — confirmed free tier (100k req/month), 10m precision. Sample 9 points in a 100m grid → approximate slope %. Simple to implement. |

### Defer from MVP

| Dataset | Reason to defer |
|---------|----------------|
| **Cadastre / parcel area** | Not freely queryable. Paywalled at Land Services SA ($250+ min). Investigate SAPPA undocumented API or Geoscape Buildings API in G1-B before committing. |
| **Heritage / Character overlays** | Layer IDs confirmed but the ePlanningPublic server was unreliable during this spike. Defer until server stability is confirmed in G1-B, or use the bulk overlay GeoJSON download as a fallback. |
| **Flood overlay** | Consultation-layer endpoint confirmed live but the current PDC flood overlay is on the unstable ePlanningPublic server. Flood data is also noted as patchy/council-specific. Defer to G1-B. |

### Needs paid/commercial API?

**Cadastre only.** All other MVP datasets are free and open (CC-BY or no-auth ArcGIS public services). If parcel area is required for MVP, a commercial option (Geoscape, Landchecker) should be evaluated in G1-B. The cost is likely justified given how often builders need lot size for preliminary feasibility.

---

## G1-B Checklist (live verification tasks)

- [ ] Test LGA query with a real Adelaide Hills coordinate: `?geometry=138.7,-35.1&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=lga,abbname&f=json` against `GrowthManagementData/FeatureServer/8/query`
- [ ] Resolve current (not consultation) P&D Code bushfire overlay URL — check `ePlanningPublic/CurrentPDC_wmas/MapServer` layer list when server is healthy
- [ ] Confirm `CodeAmendments_BaseLayers_plansadb/FeatureServer/2` zones are current production data, not draft amendment data
- [ ] Inspect SAPPA network requests in browser devtools — look for an undocumented parcel/cadastre REST call
- [ ] Evaluate Geoscape Buildings API pricing for lot area
- [ ] Confirm Mapbox Tilequery `ele` response for Adelaide Hills test coordinate
- [ ] Check if ePlanningPublic server instability is scheduled maintenance or a chronic issue (try on different day/time)

---

*Spike conducted: 2026-07-04. Sources: location.sa.gov.au ArcGIS REST services, dpti.geohub.sa.gov.au, cfs.geohub.sa.gov.au, data.sa.gov.au, plan.sa.gov.au, landservices.com.au, docs.mapbox.com.*
