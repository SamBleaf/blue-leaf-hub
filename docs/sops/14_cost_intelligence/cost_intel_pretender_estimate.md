---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP 14-01: Run a Pre-Tender Estimate

**Module:** Cost Intelligence — Pre-Tender  
**SOP ID:** 14-01  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Estimators and directors who need a quick cost sanity check before committing to a full tender, or when a client asks "how much will this cost?" early in the sales process.

## 2. When to use it
- When a new enquiry comes in and you want to check if the client's budget is realistic
- Before preparing a fee proposal — to establish a ballpark range for the build
- During qualifying score assessment (SOP 02-04) — to compare client's stated budget against typical costs
- Before issuing RFQs — to sense-check against market benchmarks

## 3. What this does
Takes key project characteristics (floor area, project type, slope, storeys, wet areas, raked ceilings, suspended slab) and returns a trade-by-trade cost estimate with low/average/high dollar ranges, a $/m² rate, a confidence score, and a total range. The estimate is based on historical benchmark data computed from completed jobs in the system. Results are automatically saved to the database for later review.

## 4. Before you start
- You are logged in
- You know the basic project parameters: floor area (m²), build type, storeys, site slope, wet area count
- Benchmarks have been computed from at least 3 completed projects (use **Recompute benchmarks** in the Benchmarks tab first if unsure)

## 5. Step-by-step process

1. Go to **Cost Intelligence** in the sidebar (under Tender Manager)
2. Click the **Pre-Tender** tab
3. The Company labour rate card appears at the top — review your team's real loaded rates if useful for labour pricing
4. Fill in the Pre-Tender Estimator form:
   - **Floor area (m²)** — required; internal habitable floor area only, not including garage or alfresco
   - **Project type** — select one: New build / Renovation / Extension / Knockdown rebuild (or leave blank for any)
   - **Site slope** — select one: Flat / Gentle / Moderate / Steep / Very steep (or leave blank for any)
   - **Storeys** — enter 1, 2, or 3+ (optional)
   - **Wet areas** — count of bathrooms + ensuites + laundries (optional)
   - **Raked ceilings** — tick if any raked, sloped, or cathedral ceilings in the design
   - **Suspended slab** — tick if the design includes a suspended (elevated) concrete slab
5. Click **Generate estimate**
6. Wait for the trade-by-trade results to appear — the system searches for matching benchmark groups

The results table shows each trade with:
- **Low / Avg / High** — dollar range based on 25th/50th/75th percentile rates
- **$/m²** — the average rate per square metre of floor area
- **Confidence** — percentage bar based on how many comparable projects are in the dataset
- **Match** — whether the benchmark matched exactly, partially, or from global averages

A total range (low to high) is shown in the results header. If overall confidence is below 50%, a warning is shown.

> **Tip:** Click **Export CSV** on the results card to download the estimate for inclusion in a fee proposal or client brief.

[insert screenshot: Pre-Tender tab with form fields visible, before generating]
[insert screenshot: results table with trade breakdown and total range]

## 6. What happens next
- The estimate is saved automatically to the `pretender_estimates` table with the input parameters and results
- No quote or contract is created — this is a planning tool only
- Use the figures to brief a client on a realistic budget range, or as a sense-check before starting a full Buildxact estimate
- If a job is selected at time of estimate, the record is linked to that job for future reference

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Using the pre-tender estimate as a fixed quote | Mistaking a range for a price | Always communicate the estimate as a range with caveats — it is a planning tool, not a commitment |
| Entering the wrong floor area | Estimating from memory or including garage | Use the approved plans; exclude garage and alfresco from floor area — these are not part of habitable floor area |
| Getting zero results or very low confidence | Not enough benchmarks in the system | Run **Recompute benchmarks** from the Benchmarks tab first; estimates require at least 3 completed projects per trade |
| Ignoring low confidence scores | Looking only at the numbers | Low confidence means limited data — treat that trade's range as less reliable and verify with an RFQ |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| No trades appear in the results | Benchmarks have not been computed yet — go to Benchmarks tab and click **⟳ Recompute benchmarks** |
| All trades show low confidence | Limited historical data — the ranges are still valid but treat them as indicative; collect more project data |
| Estimate seems too high or too low | Check floor area is habitable area only (not including garage/alfresco); compare against completed jobs in the Benchmarks tab |
| "Estimating…" button spins for a long time | Network issue or server error — check the browser console; if it times out, try again |
| Floor area validation error | Floor area is the only required field — ensure it is a positive number |

## 9. Related modules
- [View cost benchmarks by trade](cost_intel_view_benchmarks.md) — SOP 14-02
- [Qualifying score](../02_sales/02-04_qualifying_score.md) — SOP 02-04

## 10. Screenshot placeholders
[insert screenshot: Cost Intelligence → Pre-Tender tab, Labour Rate card visible at top]
[insert screenshot: Pre-Tender Estimator form fully filled before clicking Generate]
[insert screenshot: Results table showing trade breakdown, total range, and Export CSV button]

## 11. Automation notes
- API endpoint: `POST /api/cost-intelligence/pretender/estimate`
- Request body: `{ floor_area_m2, project_type?, storeys?, site_slope?, has_raked_ceilings?, has_suspended_slab?, wet_areas?, job_id? }`
- Only `floor_area_m2` is required; all other fields are optional filters for benchmark matching
- Response: `{ ok: true, id, estimate_ranges: [{ trade_category_id, name, low, high, avg, rate_per_m2, confidence, sample_count, match_type }], suggested_total_low, suggested_total_high, confidence_pct, trade_count }`
- Benchmark source: `cost_benchmarks` table (populated by **Recompute benchmarks** — requires `sample_count >= 3`)
- Matching priority: exact (project_type + site_slope + storey_range) → partial → global (all nulls)
- DB write: the estimate and its results are saved to the `pretender_estimates` table on every successful run
- Labour rate data sourced from `/api/cost-model` (Settings → Company Cost Model)

## 12. Edge cases and limits
- Floor area is the only required field; omitting project_type/slope/storeys means the system uses global benchmarks
- If no benchmarks exist with at least 3 samples, the results table is empty — recompute benchmarks first
- Confidence score is capped at 100% and calculated as `min(100, sample_count × 10)` per trade
- Overall confidence is capped at 95% regardless of data volume
- The estimate is always saved — re-running with identical inputs creates a new `pretender_estimates` row each time
- Raked ceilings and suspended slab are collected for future filter use but do not currently change benchmark matching

## 13. Owner of the process
Admin  
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Logged in as Admin or Estimator role
- [ ] At least 3 completed jobs with normalized cost data exist (so benchmarks can be computed)
- [ ] Run `POST /api/cost-intelligence/benchmarks/recompute` first if `cost_benchmarks` table is empty

### Test cases

**TC-01 — Happy path (standard use)**
1. Navigate to Cost Intelligence → Pre-Tender tab
2. Enter: Floor area = 250, Project type = new_build, Site slope = flat, Storeys = 2, Wet areas = 3
3. Leave raked ceilings and suspended slab unchecked
4. Click **Generate estimate**
5. Expected UI: trade-by-trade results table appears with at least one row
6. Expected: header shows total range (e.g. "$X – $Y") and confidence %
7. Expected API: `POST /api/cost-intelligence/pretender/estimate` returns `{ ok: true, estimate_ranges: [...], suggested_total_low, suggested_total_high, confidence_pct, trade_count }`
8. Expected DB: a new row exists in `pretender_estimates` with `floor_area_m2 = 250`, `project_type = 'new_build'`
- [ ] Pass  [ ] Fail

**TC-02 — Each estimate range has required fields**
1. After TC-01, inspect the `estimate_ranges` array in the API response
2. Expected: each object has `name` (string), `low` (integer), `avg` (integer), `high` (integer), `rate_per_m2` (number), `confidence` (0–100), `sample_count` (integer), `match_type` ('exact' | 'partial' | 'global')
3. Expected: `low <= avg <= high` for every row
- [ ] Pass  [ ] Fail

**TC-03 — Missing floor area is rejected client-side**
1. Navigate to Pre-Tender tab
2. Leave Floor area blank
3. Click **Generate estimate**
4. Expected: error message "Floor area is required" appears in the UI (no API call made)
5. Expected: no new row added to `pretender_estimates`
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role / unauthenticated**
1. Log out and attempt to call `POST /api/cost-intelligence/pretender/estimate` directly with `floor_area_m2: 200`
2. Expected: HTTP 401 response (the `/api/cost-intelligence` prefix is protected by `requireAuth`)
- [ ] Pass  [ ] Fail

**TC-05 — Estimate saved automatically (DB write)**
1. Note current row count in `pretender_estimates`
2. Run TC-01 (happy path)
3. Expected: `pretender_estimates` row count increases by 1
4. Expected: saved row contains `estimate_ranges` (JSONB), `suggested_total_low`, `suggested_total_high`, `confidence_pct`
- [ ] Pass  [ ] Fail

**TC-06 — Slope filter affects estimate results**
1. Run estimate with floor_area_m2 = 250, site_slope = flat → note `suggested_total_low` and `suggested_total_high`
2. Run same estimate with site_slope = steep (all other fields identical)
3. Expected: if slope-specific benchmarks exist, results may differ; if no slope-specific benchmarks, both return global benchmarks (match_type = 'global')
4. Expected: no error or empty result either way
- [ ] Pass  [ ] Fail

**TC-07 — Export CSV downloads a file**
1. Run TC-01 to get results on screen
2. Click **Export CSV** button
3. Expected: browser downloads a CSV file named `pre-tender-estimate-YYYY-MM-DD.csv`
4. Expected: CSV contains a header row (Trade, Low, Avg, High, $/m², Confidence, Samples, Match) and at least one data row
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Estimate returns complete trade breakdown with all required fields
- [ ] Floor area validation prevents empty submission
- [ ] Estimate is saved to `pretender_estimates` table on every successful run
- [ ] Unauthenticated access returns 401
- [ ] CSV export produces a valid, downloadable file
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
