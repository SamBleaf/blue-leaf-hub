---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP 14-02: View Cost Benchmarks by Trade

**Module:** Cost Intelligence — Benchmarks  
**SOP ID:** 14-02  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Estimators and directors who want to understand how their trade costs are trending over time and how individual jobs compare to historical benchmarks.

## 2. When to use it
- When reviewing whether a subcontractor's quote is competitive
- When preparing for a director's portfolio review — to understand cost trends
- After completing a job — to see how actual costs compared to benchmark rates
- When setting budget expectations for a new project type
- Before running a pre-tender estimate — to confirm benchmark data exists (at least 3 completed projects)

## 3. What this does
The Cost Intelligence Benchmarks tab shows trade-by-trade average $/m² rates and job history from all cost data in the system. For each trade you can see the low, average, and high $/m² rates across historical jobs and a trend direction. The Intelligence tab (also in Cost Intelligence) provides a deeper per-job comparison showing current project rates against benchmark percentile ranges (p25–p75) with a risk level. Benchmarks are computed from the `normalized_costs` and `project_metrics` tables using the **Recompute benchmarks** action.

## 4. Before you start
- You are logged in
- Historical job cost data has been entered or synced into the system (from completed projects via Buildxact sync or manual entry)
- At least 3 completed jobs with cost data are in the system for benchmarks to be meaningful

## 5. Step-by-step process

### View trade benchmarks ($/m² summary)
1. Go to **Cost Intelligence** in the sidebar
2. The **Benchmarks** tab is open by default
3. The **Average $/m² by trade** table shows all trades with recorded cost data:
   - **Trade** — trade name
   - **Quotes** — number of quote rows for that trade
   - **Low / Avg / High** — dollar per m² range across all jobs
   - **Trend** — direction computed from chronological rate data
4. Click any row to expand the job breakdown for that trade (see Job history section below)

### View the bar chart
1. If trades have recorded $/m² rates, a **Avg $/m² (effective)** bar chart appears below the table
2. The chart shows each trade's average effective rate as a horizontal bar (colour-coded by trade)
3. Hover over a bar to see the formatted dollar amount

### View job history
1. Scroll down to the **Job history** section
2. The table shows one row per job with: date, address, type, floor m², trade count, total cost, $/m²
3. Click any job row (▶) to expand the trade breakdown for that job, showing each trade's quote amount, source, effective $/m² rate, and any quantity context (roof m², wet areas, etc.)

### View a specific job's benchmark comparison (Intelligence tab)
1. Click the **Intelligence** tab
2. Select a job from the dropdown
3. The **Project Metrics** card shows the job's recorded characteristics (floor area, slope, complexity, etc.)
4. The **Normalised Cost Rates** table shows budget vs actual vs variation for each trade
5. The **Historical Comparison** table shows the job's $/m² rates vs benchmark average and p25–p75 range, with a risk level (low / medium / high) for each trade
6. The **Similar Projects** section shows up to 5 projects with a weighted similarity score across 7 dimensions

### Recompute benchmarks
1. In any tab of Cost Intelligence, click the **⟳ Recompute benchmarks** button (top-right area)
2. The system recalculates benchmark groups from all normalized cost data
3. A confirmation message shows how many benchmark groups were updated
4. Benchmarks require at least 3 data points per group to be published

[insert screenshot: Benchmarks tab showing Average $/m² table and bar chart]
[insert screenshot: Job history table with an expanded row showing trade breakdown]
[insert screenshot: Intelligence tab showing Historical Comparison table with risk badges]

## 6. What happens next
All views are read-only — loading benchmarks or comparing a job does not change any data. Insights from benchmarks should feed into:
- Pre-tender estimates (SOP 14-01) — the Pre-Tender tab draws on the same benchmark data
- RFQ target pricing — use benchmark $/m² to set target prices on RFQ packages
- Director reviews — export the $/m² table or job history to CSV for reporting

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Treating the benchmark as a ceiling or floor | Assuming it is a limit | The benchmark is an average — actual quotes vary based on site conditions, scope, and market timing |
| Comparing jobs of very different types | Default view shows all jobs | The Intelligence tab's Historical Comparison automatically filters to the best matching benchmark group (exact → partial → global) |
| Ignoring the risk badge in Historical Comparison | Focusing only on the number | A "high" risk badge means the current trade rate is more than 18% above the p75 benchmark — flag this before contract |
| Running Pre-Tender before computing benchmarks | Benchmark table looks empty | Click **⟳ Recompute benchmarks** after at least 3 completed jobs have cost data synced |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| No trades shown in the $/m² table | No cost data has been entered — add manual rows or sync from Buildxact (see Benchmarks tab, Job estimate section) |
| Historical Comparison shows "No benchmark data yet" | Benchmarks have not been computed or fewer than 3 projects have data — click **⟳ Recompute benchmarks** |
| Bar chart not visible | The chart only appears when at least one trade has a recorded $/m² rate — check that quote amounts and floor area are entered for at least one job |
| Intelligence tab shows no Normalised Cost Rates | The selected job has no budget rows synced — use **Sync estimate → budgets** to pull from Buildxact |
| Recompute benchmarks shows 0 groups updated | Not enough data — requires ≥ 3 normalized_cost rows per trade/project-type/slope/storey combination |

## 9. Related modules
- [Run a pre-tender estimate](cost_intel_pretender_estimate.md) — SOP 14-01

## 10. Screenshot placeholders
[insert screenshot: Benchmarks tab default view — Average $/m² by trade table + bar chart]
[insert screenshot: Job history table with expanded row showing per-trade detail]
[insert screenshot: Intelligence tab — Historical Comparison table with risk badges (low/medium/high)]
[insert screenshot: Intelligence tab — Similar Projects section showing similarity scores]

## 11. Automation notes
- **Benchmark summary** (Benchmarks tab): data is read directly from the `cost_intelligence` table via the Supabase anon client (`sb.from("cost_intelligence").select("*, jobs(...)")`); no server endpoint is called for the main benchmarks view
- **Benchmark recompute**: `POST /api/cost-intelligence/benchmarks/recompute` — reads `normalized_costs` + `project_metrics`, groups by `(trade_category_id, project_type, site_slope, storey_range)`, skips groups with `< 3` samples, upserts into `cost_benchmarks`; returns `{ ok: true, groups_computed, benchmarks_upserted }`
- **Benchmarks query** (used by Pre-Tender tab): `GET /api/cost-intelligence/benchmarks` with optional filters `?trade_category_id=&project_type=&site_slope=&storey_range=`; returns `{ ok: true, benchmarks: [] }` where each item has percentile fields (`rate_per_m2_floor_avg`, `rate_per_m2_floor_p25`, `rate_per_m2_floor_p75`, `sample_count`, etc.)
- **Normalised costs for a job**: `GET /api/cost-intelligence/jobs/:jobId/normalized-costs` — returns `{ ok: true, rows: [...], metrics }` merged across all trade categories
- **Historical comparison for a job**: `GET /api/cost-intelligence/jobs/:jobId/comparison` — returns `{ ok: true, comparison: [{ trade_name, current_rate, benchmark, risk_level, delta_vs_avg_pct, match_type }], metrics }`
- **Similar projects**: `GET /api/cost-intelligence/jobs/:jobId/similar` — returns `{ ok: true, similar: [{ job_id, address, similarity_score, ... }] }` (top 5, weighted 7-dimension scoring)
- All DB effects are read-only except **Recompute benchmarks** which writes to `cost_benchmarks`

## 12. Edge cases and limits
- Benchmark groups require a minimum of 3 data points (`sample_count >= 3`) — groups with fewer samples are excluded from all benchmark uses
- Historical comparison uses a priority-matching cascade: exact (project_type + site_slope + storey_range) → partial matches → global (all nulls)
- Risk levels: low = rate ≤ p75; medium = rate between p75 and p75 × 1.18; high = rate > p75 × 1.18
- Job history table is limited to 500 most recent `cost_intelligence` rows; jobs list is capped at 200
- The bar chart and $/m² table are computed client-side from the `cost_intelligence` rows — they update immediately on page load without a separate API call
- Exporting CSV downloads the raw `cost_intelligence` table rows, not the benchmark summary

## 13. Owner of the process
Admin  
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Logged in as Admin or Estimator role
- [ ] At least 3 completed jobs with cost data in the system (for recompute to produce results)
- [ ] Supabase configured and accessible (anon key set)

### Test cases

**TC-01 — Benchmarks tab loads with trade data**
1. Navigate to Cost Intelligence (default: Benchmarks tab)
2. Expected: the **Average $/m² by trade** table is visible
3. Expected: at least one trade row appears with Quotes count, Low/Avg/High $/m² values
4. Expected: no error banner is shown
5. Expected DB read: `cost_intelligence` table queried via Supabase anon client — confirm in Network tab
- [ ] Pass  [ ] Fail

**TC-02 — Recompute benchmarks produces benchmark groups**
1. Click **⟳ Recompute benchmarks** (top-right of the page)
2. Wait for the confirmation alert
3. Expected: alert says "Done — N benchmark groups updated." (N > 0 if enough data exists)
4. Expected API: `POST /api/cost-intelligence/benchmarks/recompute` returns `{ ok: true, groups_computed, benchmarks_upserted }`
5. Expected DB: `cost_benchmarks` table has new/updated rows with `sample_count >= 3`
- [ ] Pass  [ ] Fail

**TC-03 — Job history expands to show trade breakdown**
1. Scroll to the Job history section in the Benchmarks tab
2. Expected: at least one job row is visible with date, address, floor m², trades count, total, and $/m²
3. Click the ▶ expander on any row
4. Expected: trade breakdown appears showing trade name, source, quote amount, effective $/m² rate
- [ ] Pass  [ ] Fail

**TC-04 — Intelligence tab loads comparison for a job**
1. Click the **Intelligence** tab
2. Select a job with known cost data from the dropdown
3. Expected: Project Metrics card appears (may show "—" for fields not yet entered)
4. Expected: Normalised Cost Rates table appears with at least one trade row
5. Expected API: `GET /api/cost-intelligence/jobs/:jobId/normalized-costs` returns `{ ok: true, rows, metrics }`
- [ ] Pass  [ ] Fail

**TC-05 — Historical Comparison shows risk badges**
1. In the Intelligence tab, with a job selected (after TC-02 recompute has run)
2. Expected: Historical Comparison section appears (if benchmark data matches this job's project type)
3. Expected: at least one row shows a risk badge (low/medium/high) and a delta % value
4. Expected API: `GET /api/cost-intelligence/jobs/:jobId/comparison` returns `{ ok: true, comparison: [...], metrics }`
5. Expected: risk_level for each trade is one of: 'low', 'medium', 'high', or null (no benchmark)
- [ ] Pass  [ ] Fail

**TC-06 — All benchmark reads are read-only (no DB writes)**
1. Record row counts in `cost_intelligence`, `normalized_costs`, `project_metrics` before loading
2. Load the Benchmarks tab, expand a job row, then load the Intelligence tab for a job
3. Expected: row counts in those tables are unchanged — no inserts or updates triggered
4. Note: **Recompute benchmarks** is the only write action; avoid clicking it in this test
- [ ] Pass  [ ] Fail

**TC-07 — Unauthenticated access to API endpoints returns 401**
1. Log out and call `GET /api/cost-intelligence/benchmarks` directly (no auth token)
2. Expected: HTTP 401 response from `requireAuth` middleware
3. Repeat for `GET /api/cost-intelligence/jobs/any-id/comparison`
4. Expected: HTTP 401 response
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Benchmarks tab loads with trade data from cost_intelligence table
- [ ] Recompute benchmarks writes to cost_benchmarks and confirms via alert
- [ ] Job history expands to trade-level detail
- [ ] Intelligence tab loads normalized costs and historical comparison
- [ ] Risk badges appear with correct levels (low/medium/high)
- [ ] No DB writes from read-only views
- [ ] Unauthenticated API calls return 401
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
