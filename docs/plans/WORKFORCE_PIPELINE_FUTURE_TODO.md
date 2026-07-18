# Workforce Pipeline — Future TODO

Optional capability deferred out of the v1 build to keep it proportionate. **Do not partially build any item below** during v1 unless it becomes essential to the core architecture. The v1 architecture (pure service layers: `workingCalendar` → `stageAggregation` → `scheduleIntelligence` → `workforceCapacity` → route → UI) is designed to support these as clean additions.

Each item: **description · value · reason deferred · dependencies · suggested phase · v1 architecture supports it?**

## Forecast intelligence
- **Persisted forecast snapshots** — store each forecast run (currently computed on request + returned with `generatedAt`/`calcVersion`/assumptions). Value: trend + accuracy history. Deferred: adds a table + write path not needed for the decision tool. Deps: none. Phase 2. Supported: yes — the service already returns a snapshot-shaped object; add a persistence sink.
- **Forecast-version comparison** — diff two snapshots. Value: "why did the estimate move." Deps: snapshots. Phase 3. Supported: yes.
- **Full P50/P75/P90 calibration** — percentile completion ranges (v1 exposes confidence High/Med/Low/Insufficient + a single expected date). Value: risk bands. Deferred: needs larger N + calibration. Deps: more closed jobs. Phase 3. Supported: yes — response has a `p_range` slot reserved.
- **Weighted statistical blending** — blend multiple evidence sources with weights (v1 picks the top available with a simple recency override). Deps: history. Phase 3. Supported: yes.
- **Forecast-accuracy dashboard** — back-test replay at tender/25/50/75% + MAE/median/hit-rate. Value: trust + calibration. Deps: snapshots. Phase 3. Supported: yes.
- **Richer comparable-job selection** — weight comparables by scope similarity, storeys, area, recency. Phase 3. Supported: yes.
- **Interruption / delay-cause classification** — structured reason per gap (capacity / trade / material / weather / client / incomplete). v1 treats gaps as labelled observed allowances only. Deps: a delay-cause capture surface. Phase 3. Supported: yes.
- **Weather / material lead-time / inspection / preceding-trade dependency modelling** — richer gap drivers. Phase 3+. Supported: yes (gap model is pluggable).

## Scenario planning
- **Saved scenarios, side-by-side compare, apply-to-live, audit trail** — what-if without touching live. Value: high (the "can we take this on" question). Deferred: a full scenario surface is its own build. Deps: forecast service (done). Phase 2. Supported: yes — the forecast + capacity services are pure, so a scenario re-runs them with overridden inputs.
- **Drag employee assignment, stage-level scenario editing, tender-probability scenarios, start-date optimisation.** Phase 2–3. Supported: yes.

## Workforce intelligence
- **Skill/competency matching, qualified-worker + apprentice ratios, per-employee productivity, recommended crew composition, restricted-duty planning, automatic crew balancing, recruitment-demand forecasting, overtime optimisation.** v1 uses whole-crew averages + active-status/leave/RDO capacity. Deps: employee skill/productivity data (mostly absent). Phase 3+. Supported: yes — capacity + crew-size are injectable.

## Pipeline intelligence
- **Confirmed / likely / probability-weighted layers, max-potential exposure, tender win-probability, revenue / gross-margin / cash-flow overlays, automatic clash-resolution recommendations, recommended job sequencing, drag-and-drop live rescheduling.** v1 has confirmed/likely/tender **filters** but not probability weighting or financial overlays. Deps: pipeline probability + finance data. Phase 2–3. Supported: yes.

## Data & analytics
- **Legacy timesheet reconciliation interface + address-matching workflow** — v1 excludes-and-reports address-only/unmatched timesheets (visible, not silently completed). Value: reclaim historical N. Deps: a mapping table + UI. Phase 2. Supported: yes — aggregation already reports `excludedHours.byReason`.
- **Full job-stage-instance management** — one taxonomy stage occurring multiple times per job (separate framing areas, split stages, returns). v1's calc structure does not prevent instances but has no management UI. Phase 3. Supported: yes.
- **Manual delay-cause capture, forecast exports, performance benchmarking dashboard, long-term productivity trends, estimator calibration controls.** Phase 3+. Supported: yes.

## Construction internal-labour forecasting (design settled 2026-07-18)
Extend full builds from *context-only* to *forecast internal-labour demand* — so a construction job's own carpentry/site scope feeds the Pipeline's crew forecast, not just its actual allocations. **The core insight: Blue Leaf's internal crew is a carpentry crew, so a full build's internal-labour scope ≈ an embedded carpentry-style budget** — reuse the whole earned-value + scheduleIntelligence + capacity stack already built.

**Data reality (verified live 2026-07-18):** full builds live in `jobs` (not `projects`, which is empty). Estimate line detail is in `buildexact_estimates.categories` jsonb; `job_budgets` collapses each trade to one `trade_category_id` + `budget_amount` (no labour/material split — must use the jsonb). Master template = `trade_categories` (37, seeded) / `CATEGORY_MAPPING` in `buildexactParser.mjs`. **Buildxact carries NO structured internal/subcontractor/material field** (`Type`/`costCategory` empty on the live account) — so classification must be a Blue-Leaf policy over the 37 categories, not auto-detected.

**Resolved decisions (Sam):**
- Internal-labour set = **Carpentry + External Cladding + Site works** (site establishment/labouring, formwork/slab prep, site cleanup). NOT the install of supplied items (windows/stairs/joinery) by default.
- **It varies per job** → the template classification is a *default*, overridable per job at import (same confirm-drawer pattern as the carpentry mapping).
- **The estimate splits supply vs install** → the internal-labour value is readable directly from labour lines, like `carpentry_job_budgets` already does. *(Verify against a real full-build `categories` jsonb when building — the carpentry data has some combined "supply and installation" lines, so confirm the split is clean before relying on it.)*

**Build shape when picked up:** (1) an `internal_labour_policy` classification over the 37 master categories → internal(→one of the 8 workforce categories) / external / material, default-external for unknowns so crew demand is never overstated; (2) reuse `matchTaskCategory` + `classifyCostType` for the carpentry/cladding/site categories; (3) a per-job override/confirm surface; (4) feed the internal-labour categories' labour value through the existing `scheduleIntelligence` break-even/forecast + `workforceCapacity` so construction jobs contribute forecast crew-days. Phase 2. Supported: yes — the forecast/capacity services already accept any labour-value + crew inputs; only the classification + wiring are new. **Priority: after the carpentry-job focus.**

## UI enhancements
- **Custom virtualised timeline (if needed at scale), timeline drag-and-drop editing, saved views/filters, printable pipeline reports, executive summary dashboard, dedicated mobile planning interface, extra animation polish.** v1 timeline is responsive desktop/tablet, non-virtualised (fine at current job counts). Phase 2–3. Supported: yes.
