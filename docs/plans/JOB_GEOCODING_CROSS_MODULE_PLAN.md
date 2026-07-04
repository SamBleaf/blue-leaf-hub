# Job Geocoding / Maps — Future Planning Thread

> **STATUS: PARKED — do not build yet.** Future thread. Provider chosen = **Mapbox**. Needs `MAPBOX_TOKEN` when built.

## Governing principle (Sam, 2026-07-04)
**Maps only where they support a DECISION.** Not "pins on a map for everything." The useful map is a decision tool, not a gimmick.
- **Shared spatial data across the system** — one coordinate per job/lead, read by whichever module needs it. Do NOT duplicate location or force a map UI into every module. Some insights live in different modules (workforce, scheduling, CRM) but the underlying spatial data is shared.
- **Tiered / lazy geocoding (cost control):** early CRM enquiries → **suburb/postcode level only**. **Full (rooftop) geocode only once a lead is qualified, at fee-proposal, won, or converted to a job.** Never full-geocode poor-fit/early leads by default.

**Good use:** lead quality by suburb · source quality by area · active jobs by phase/risk · job clustering · travel/load awareness · marketing-area insight.
**Poor use:** client-portal map gimmicks · mapping every contact · geofencing before timesheets are mature · route optimisation too early · expensive geocoding of poor-fit/early leads.

---

## When the time comes — build two lean feature briefs

### 1. Sales Intelligence Map
- **Decision it supports:** which areas produce *good* leads (not just more), where to target content, which areas waste time, which sources work *by suburb*, where won jobs cluster.
- **Minimum useful version:** suburb/postcode **bubbles** sized by enquiry volume + coloured dots for qualified / nurture / poor-fit / won. Filter by source + fit + time.
- **Data needed:** lead suburb/postcode, `lead_source_category`, `fit_quality`, `readiness`, `stage`, budget band, owner, created_at; job location for won.
- **Suburb/postcode-only:** enquiry density, poor-fit/nurture dots, early-lead layers.
- **Needs full geocode:** precise pins only once qualified / fee-proposal / won / job.
- **Layers:** soft heat/density (enquiry volume) · coloured dots (qualified/nurture/poor-fit/won) · suburb bubbles pre-geocode · precise pins post-qualify.
- **Filters:** source (website/Google/Instagram/referral/architect/direct) · project type · fit · readiness · stage · budget band · time range · owner.
- **Deferred:** individual-contact mapping, real-time, anything not tied to the questions above.

**How it interprets multi-source data (the depth):** the map does NOT plot raw events — it **rolls up outcomes per area, weighted by quality**. Geography (suburb→postcode→point) is the join key; the measure is outcome quality, not volume. Two grains:
- **Precise layer (the core, works today):** per-lead `suburb` + `lead_source_category` + `fit_quality` + `stage` + won/value + cost — already in `v_lead_attribution_roi` (mig 130) + leads/jobs. Aggregated by suburb → win-rate, cost-per-won, fit-mix, source-performance BY AREA.
- **Coarse layer (context overlay):** GA4/GSC/GBP/Meta snapshots (mig 062) join at **channel level**, not suburb (analytics geo is city/region at best) — shown as awareness/traffic context, never faked to suburb precision.
- **Aggregation layer:** a per-area rollup view/endpoint (suburb × time × source → enquiries, quality ratio, win-rate, cost-per-qualified/won, value, source mix, avg fit) with **small-sample handling** (min counts + windows so 1 job ≠ 100%). The map reads the rollup; user picks the metric (volume/quality/win-rate/cost-per-won/ROI) → colours areas.
- **Interpretation layer (optional AI):** summarise the rollup into plain findings + actions ("Stirling: high win-rate+value, referral-led → expand content"; "Suburb X: high volume, low fit, IG-driven → deprioritise").
- **Dependencies:** outcome layer works now; channel overlay needs GA4/GSC/GBP/Meta actually connected; true cost/ROI needs **ad-spend ingested** (not captured yet — small separate piece). Cost metrics are approximate until spend feeds in.

### 2. Operations Job Map (companion to the schedule/Gantt — NOT a replacement)
- **Decision it supports:** where work is concentrated, is the schedule geographically sensible, are we creating wasted travel, can nearby jobs share deliveries/trade visits/inspections/supervisor checks, do clusters affect crew allocation.
- **Minimum useful version:** active jobs as pins coloured by **phase** + a **schedule-health/at-risk** flag; visible clustering.
- **Data needed:** job location (full geocode — these are real sites), phase, schedule health, supervisor/crew owner, next milestone, delayed/at-risk flag; later: delivery load, weather.
- **Suburb/postcode-only:** n/a — active jobs justify full geocode.
- **Needs full geocode:** active + upcoming jobs.
- **Layers:** active / upcoming / completed jobs · phase · schedule health · crew owner · next milestone · delayed/at-risk · delivery-heavy · weather (later).
- **Deferred:** route optimisation, delivery auto-scheduling, weather overlays — later once the base map earns its keep.

---

## Deeper utilisation (thinking pass 2) — the coordinate as a decision input, not just a dot
The two maps are outputs. The higher-leverage, quieter wins use the coordinate as an **input to a decision or an automation** — frequently with NO map rendered. Four classes, each tied to a decision (per the governing principle):

### A. Spatial enrichment — coordinate → free government datasets (highest builder-specific value)
On geocode, look up and attach: **council/LGA, zoning, bushfire (BAL) overlay, flood overlay, heritage/character area, slope/elevation, lot size (cadastre)**.
- **Decision it drives:** early feasibility + go/no-go + realistic budget BEFORE the meeting. BAL/flood/slope/retaining are major cost drivers a builder wants flagged at enquiry, not at tender.
- Feeds: **Sales qualifying** (fit + a "site complexity" signal), **Estimating/cost intelligence** (auto cost-driver flags), **APB fit scoring**.
- Mostly needs full geocode (parcel-level) → so run it at the **qualified/fee-proposal** threshold, not on every enquiry. Data sources: state cadastre/planning WMS, national bushfire/flood layers (largely free/public).

### B. Cost & logistics factors — distance/drive-time → dollars
Coordinate → **travel allowances, delivery freight, concrete truck travel + pump premium, crane/spoil/skip logistics, subbie proximity**.
- **Decision it drives:** more accurate estimates + procurement choices + fair workforce allocation, instead of guessing "add a bit for travel."
- Feeds: **Estimating** (location cost factors), **Procurement** (prefer/sort trades already working nearby — they price better and show up), **Workforce** (auto travel allowance/km, award-compliant).

### C. Cluster-aware operations — proximity → batching (real weekly $/time savings)
Nearby active jobs → batch **supervisor site loops, trade runs, inspections, and share deliveries/skips/mobilisation**.
- **Decision it drives:** "these 3 sites are 10 min apart — do them same day / share the concrete pour / one skip run." Detects travel-heavy weeks the schedule can't see.
- Feeds: **Scheduling** (a spatial lens on the Gantt), **Workforce** (allocation by total travel). Companion to the schedule, never a replacement.

### D. Targeting & proof — win/ROI by area, and social proof
- **Win-rate and cost-per-won-job by suburb** (not just lead volume) → where to actually spend marketing and where to say no. Channel-ROI *by area*.
- **Drive-time isochrones** from office/depot (30/45/60 min) define "our patch" by ROADS, not a radius circle — a data-driven service area.
- **"Recent builds near you"** — auto-surface nearby completed projects on a lead/fee-proposal (credibility, conversion). This is a *good* client-facing use (decision: trust/close) vs the poor "portal map gimmick."
- Feeds: **Marketing** spend, **BD** (architect/referral network by area), **Sales** conversion.

### Bonus: geocoding as data hygiene
A successful geocode also **validates + normalises** the address (real place?), and can **derive suburb/LGA/postcode** from a messy free-text address, and **dedupe** leads/jobs at the same site by proximity. Quiet but useful.

### Standouts to consider first (deeper than the two maps)
1. **Site enrichment at qualify** (A) — arguably the biggest builder-specific lever; changes budget + go/no-go. **← chosen to brief.**
2. **Cluster-aware ops batching** (C) — tangible weekly savings.
_(Drive-time service area — DROPPED per Sam, 2026-07-04.)_
None of these *require* a map to deliver value — they're signals/automations. Maps come where a human needs to *see* the pattern (the two briefs).

## Foundation (only when a brief above is greenlit)
Address → **Mapbox** geocode → `geo_lat/lng` as a **derived fact** on the job/lead (recompute on address change; manual-pin on fail), stored via the existing facts service (`jobFactRegistry.mjs` already holds `address`/suburb/postcode as canonical facts). Tiered: suburb/postcode aggregation needs no per-record geocode; full pins geocode lazily at the qualify/won threshold. One shared `<HubMap>` (Mapbox GL). `MAPBOX_TOKEN` required; fails soft without it.

## Broader potential (secondary — revisit only after the two maps prove value)
Field geofenced check-in (defer until timesheets mature) · Workforce nearest-crew/travel-allowance · Procurement subbie locality · Finance cost-context · Portal site map. Keep these as ideas, not scope.

---

# Feature Brief — Site Intelligence (Enrichment at qualify)
- **Decision it supports:** early feasibility, go/no-go, realistic budget and fit — by surfacing site cost-drivers (bushfire, flood, slope, heritage, council, lot size) from the address BEFORE the discovery meeting or estimate.
- **Trigger / tiering:** runs on the **qualify** transition (and again at fee-proposal / won / job as data firms up) — **NOT on every enquiry**. Early enquiries stay suburb-level. This is where "full geocode" is spent.
- **Minimum useful version:** on qualify → geocode the site (Mapbox) → attach **council/LGA, bushfire-prone (yes/no), slope band, lot size (if available)** + a derived **"Site complexity"** flag, shown on Lead Detail. Even bushfire + slope + council alone is high value.
- **Data needed:** site address (have it) → coords (Mapbox) → point-in-polygon against SA planning/cadastre layers + slope from a DEM.
- **Suburb/postcode-only:** none — enrichment needs the parcel coordinate (hence gated to qualify+).
- **Needs full geocode:** yes (rooftop/parcel).
- **Sources:** Mapbox = geocoding ONLY (not overlays). Overlays from **SA gov spatial services** (SAPPA / Location SA / data.sa.gov.au WMS/WFS: LGA, bushfire-prone, heritage/character, zoning) + **national DEM** (Geoscience Australia ELVIS/SRTM) for slope; lot size from cadastre. Commercial property API as fallback if free layers are too fiddly. **Exact endpoints + which layers are reliably queryable must be confirmed in a short spike (G1-A) before committing the UI.**
- **Where it shows:** a "Site intelligence" panel on Lead Detail (Overview/Qualifying); flags feed `fit_quality` context + estimating cost-driver hints; stored as canonical facts (new `site` family in `jobFactRegistry`, stamped forward at conversion).
- **Guardrails:** flags are **advisory signals for a human** ("bushfire-prone — confirm BAL"), never authoritative compliance/BAL determinations. Consequence-tiered → presented as "investigate", human-confirmed.
- **Deferred:** zoning-code interpretation, flood-depth modelling, soil/geotech (paid data), automated BAL rating, contour/retaining quantification.

---

# ENTIRE BUILD — phased plan (for sign-off)
> Each batch: **Sonnet builds → Claude reviews the diff + runs light E2E → commit**. Live geocoding/enrichment gated on Sam adding **`MAPBOX_TOKEN`** (and endpoints confirmed in G1-A). No deploy without Sam.

### Phase 0 — Foundation (geo facts + service)
- **G0-A** — `jobFactRegistry` gains `location` (+ later `site`) fact family; migration adds `geo_lat/lng/confidence/source/geocoded_at/place_id` to `jobs` + `leads` (mirror on subcontractors later); `geocodeService.mjs` (Mapbox geocode of `normaliseAddress` output, fail-soft, cache/dedupe by normalised address). `MAPBOX_TOKEN` gate.
- **G0-B** — geocode-on-save hook (address create/update on jobs + leads) + tiered **backfill** endpoint (full-geocode qualified+ leads/jobs; suburb-centroid for the rest). Verify a known SA address → correct coords.

### Phase 1 — Site Intelligence (the brief)
- **G1-A (spike)** — confirm which SA gov layers are queryable point-in-polygon (LGA, bushfire-prone, heritage, zoning) + a DEM slope lookup; document endpoints. Small, throwaway-ish; decides G1-B scope.
- **G1-B** — `siteEnrichmentService.mjs` (coords → the confirmed layers + slope → `site` facts) + "Site complexity" derivation; trigger on **qualify** transition + backfill existing qualified/won.
- **G1-C** — Lead Detail **"Site intelligence" panel** + feed the flags into `fit_quality` context + estimating cost-driver hints.

### Phase 2 — Marketing EXIF job-hint (original ask)
- **G2-A** — inbox `sort` reads photo **EXIF GPS** → nearest job by coords (within radius) → auto-suggests `project_id` at triage. Small; foundation makes it trivial.

### Phase 3 — Maps (the two briefs; only after the signals prove value)
- **G3-A** — shared `<HubMap>` (Mapbox GL JS; adds `mapbox-gl` dep) + a smoke page.
- **G3-B — Sales Intelligence Map** (decomposed):
  - **G3-B1 (aggregation)** — per-area rollup view/endpoint over `v_lead_attribution_roi` + `leads.suburb` + jobs: suburb × time × source → volume, quality ratio, win-rate, cost-per-qualified/won, value, source mix, avg fit; small-sample handling. *(This is the intelligence; works without maps.)*
  - **G3-B2 (viz)** — the map reads the rollup: suburb bubbles + coloured dots (qualified/nurture/poor-fit/won) + metric selector (volume/quality/win-rate/cost-per-won/ROI) + filters (source/project-type/fit/readiness/stage/budget/time/owner) + coverage/confidence flag.
  - **G3-B3 (optional AI insight)** — summarise the rollup into plain findings + recommended actions per area.
  - *Separate optional pieces:* channel overlay (GA4/GSC/GBP/Meta — needs integrations connected) · **ad-spend ingestion** (for true cost/ROI — not captured yet).
- **G3-C** — **Ops Job Map**: active jobs by phase + schedule-health/at-risk + clustering; companion to the Gantt.

### Notes
- Cost: geocoding ~free (Mapbox tier); SA gov layers free; effort concentrated in G0 + G1-A spike. Each later batch is small.
- Sequence rationale: G0 unblocks everything; G1 is the highest-leverage signal; G2 finishes the original ask cheaply; G3 maps last (see-the-pattern, once data exists).
- Sign-off can trim/re-order phases (e.g. do G2 right after G0 if you want the inbox hint sooner).
