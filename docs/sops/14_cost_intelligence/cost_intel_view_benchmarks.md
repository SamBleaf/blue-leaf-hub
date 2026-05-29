---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
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
Estimators and directors who want to understand how their trade costs are trending over time and how individual jobs compare to benchmarks.

## 2. When to use it
- When reviewing whether a subcontractor's quote is competitive
- When preparing for a director's portfolio review — to understand cost trends
- After completing a job — to see how actual costs compared to the benchmark range
- When setting budget expectations for a new project type

## 3. What this does
Shows trade-by-trade cost benchmarks based on completed jobs in the system. For each trade you can see:
- The average $/m2 across all comparable jobs
- A bar chart comparing individual jobs
- Trend arrows showing whether costs are rising or falling
- A table of historical jobs with their actual costs for that trade

## 4. Before you start
- You are logged in
- Historical job cost data has been entered or synced into the system (from completed projects)

## 5. Step-by-step process

### View benchmarks
1. Go to **Cost Intelligence** -> **Benchmarks** tab
2. The page shows all active trades with their current benchmark figures
3. Each trade card shows:
   - Average $/m2
   - Number of jobs in the dataset
   - Trend arrow (up/down/flat)
4. Click any trade card to drill into that trade's detail

### View the job history table
1. Click a trade to open its detail view
2. The table shows all historical jobs for that trade with actual cost, m2, and $/m2
3. Sort the table by cost, date, or job type

### View the bar chart
1. In the trade detail view, click the **Chart** tab
2. A bar chart shows $/m2 for each job — the benchmark average is shown as a reference line
3. Outliers (very high or low) are visible at a glance

### Compare a specific job
1. In the job history table, click a job row
2. Expected: the job's trade costs are shown alongside the benchmark
3. API: `GET /api/intelligence/jobs/:id/comparison` — returns the job vs benchmark comparison data

## 6. What happens after
Benchmarks are read-only — viewing does not change any data. Insights from benchmarks should feed into pre-tender estimates and RFQ target pricing.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Treating the benchmark as a ceiling or floor | Assuming it is a limit | The benchmark is an average — actual quotes will vary based on site conditions, scope, and market timing |
| Comparing jobs of very different types | Default view shows all jobs | Use filters to compare like-for-like — new builds vs renovations have very different trade cost profiles |
| Ignoring the trend arrow | Focusing only on the number | If a trade's benchmark is trending up, factor that into your next estimate |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| No benchmarks shown | The system needs historical job data — benchmarks require at least 2-3 completed jobs to be meaningful |
| A trade shows "Insufficient data" | Not enough jobs for that trade type — use the pre-tender estimate (SOP 14-01) which has wider ranges |
| Bar chart not loading | Refresh the page; check your internet connection |
| Job comparison returns different figures than expected | The comparison adjusts for m2 differences — $/m2 is the comparison unit, not total cost |

## 9. Related SOPs
- [Run a pre-tender estimate](cost_intel_pretender_estimate.md) — SOP 14-01

## 10. Automation notes
- API: `GET /api/cost-intelligence/benchmarks` — returns all trade benchmarks with `{ trade, avgPerSqm, jobCount, trend, jobs: [] }`
- API: `GET /api/intelligence/jobs/:id/comparison` — returns a specific job's trade costs vs current benchmarks
- DB effects: read-only — queries `cost_intelligence` table and completed job data
- Trend calculation: compares last 3 months average $/m2 vs prior 3 months for each trade
- Bar chart data is computed from the `jobs` array in the benchmarks response

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in
- [ ] At least 3 completed jobs with cost data in the system across at least 2 different trades

### Test cases

**TC-01 — Benchmarks page loads with trade cards**
1. Cost Intelligence -> Benchmarks
2. Expected: trade cards render with trade name, avg $/m2, job count, and trend arrow
3. Expected API: `GET /api/cost-intelligence/benchmarks` returns array of benchmark objects
- [ ] Pass  [ ] Fail

**TC-02 — Each benchmark has required fields**
1. Inspect the API response from TC-01
2. Expected: each benchmark object has `trade`, `avgPerSqm` (number), `jobCount` (number), `trend` ('up'/'down'/'flat'), `jobs` (array)
- [ ] Pass  [ ] Fail

**TC-03 — Click a trade card to see job history**
1. Click any trade card with jobCount >= 2
2. Expected: job history table loads with one row per job
3. Expected: each row shows job identifier, floor area (m2), trade cost, and $/m2
- [ ] Pass  [ ] Fail

**TC-04 — Bar chart renders for a trade**
1. In the trade detail view, open the Chart tab
2. Expected: bar chart renders with one bar per job
3. Expected: benchmark average reference line visible on the chart
- [ ] Pass  [ ] Fail

**TC-05 — Job comparison endpoint returns data**
1. Call `GET /api/intelligence/jobs/:id/comparison` for a known completed job
2. Expected: returns `{ ok: true, job: { ... }, benchmarks: [{ trade, jobCost, benchmark, variance }] }`
3. Expected: variance shows how the job differed from benchmark (positive = above, negative = below)
- [ ] Pass  [ ] Fail

**TC-06 — Trade with no jobs shows "Insufficient data"**
1. If a trade exists with fewer than 2 jobs, open its detail view
2. Expected: "Insufficient data" message shown (or no benchmark figure displayed)
3. Expected: no error thrown
- [ ] Pass  [ ] Fail

**TC-07 — Benchmarks are read-only**
1. Check DB record counts before loading benchmarks
2. Load the benchmarks page
3. Expected: no new rows inserted in any table — page is purely a read
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Benchmarks page loads with all trades
- [ ] API response has correct structure
- [ ] Job history and chart render
- [ ] Job comparison endpoint works
- [ ] Insufficient data handled gracefully
- [ ] No DB writes from benchmark reads
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
