---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
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
Takes key project characteristics and returns a trade-by-trade cost estimate with ranges and confidence scores. The estimate is based on historical job data and trade benchmarks stored in the system. It gives a low/mid/high range for each trade, not a fixed price.

## 4. Before you start
- You are logged in
- You know the basic project parameters: floor area (m2), build type (new build/renovation/extension), storeys, site slope, key features

## 5. Step-by-step process

1. Go to **Cost Intelligence** -> **Pre-Tender** tab
2. Fill in the project characteristics form:
   - **Floor area** (m2) — approximate is fine at this stage
   - **Build type** — New build / Renovation / Extension / Addition
   - **Number of storeys** — 1, 2, or 3+
   - **Site slope** — Flat / Mild / Steep (affects earthworks and slab cost)
   - **Key features** — check all that apply: Alfresco, Pool, Double Garage, Stone Benchtops, Ducted Air, etc.
   - **Suburb / postcode** — affects some trade pricing
3. Click **Run Estimate**
4. The system returns a cost breakdown by trade, each with:
   - Low / Mid / High range
   - Confidence score (based on how many similar jobs are in the dataset)
   - Notes if a trade has limited data

## 6. What happens after
- The estimate is displayed on screen — it is not automatically saved
- You can screenshot or note the figures to include in a fee proposal or client conversation
- The estimate does not become a quote or contract — it is a planning tool only

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Using the pre-tender estimate as a fixed quote | Mistaking a range for a price | Always communicate the estimate as a range with caveats — it is a planning tool, not a commitment |
| Entering the wrong floor area | Estimating from memory | Use the approved plans or site area from the enquiry brief — floor area is the biggest driver of cost |
| Ignoring low confidence scores | Looking only at the numbers | Low confidence means limited data — treat that trade's range as less reliable and verify with an RFQ |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| No estimate returned | Check all required fields are filled — floor area and build type are mandatory |
| All trades show "Low confidence" | The system has limited historical data matching the project characteristics — the ranges are still valid but wider |
| Estimate seems too high or too low | Double-check floor area and build type; compare against benchmarks (SOP 14-02) |
| Estimate takes a long time | The system is processing historical data — wait up to 30 seconds before refreshing |

## 9. Related SOPs
- [View cost benchmarks by trade](cost_intel_view_benchmarks.md) — SOP 14-02
- [Qualifying score](../02_sales/02-04_qualifying_score.md) — SOP 02-04

## 10. Automation notes
- API: `POST /api/intelligence/pretender` — body: `{ floorArea, buildType, storeys, slope, features: [], suburb? }`
- Returns: `{ ok: true, trades: [{ trade, low, mid, high, confidence, notes }] }`
- Confidence score: 0-1 based on number of matching historical jobs in `cost_intelligence` table
- DB effects: read-only — queries historical job data for benchmarks; no writes
- Also available at: `POST /api/intelligence/pretender` from `marketingIntelligenceRoutes` or `costIntelligenceRoutes`

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in
- [ ] At least some historical job cost data exists in the system (for meaningful benchmarks)

### Test cases

**TC-01 — Run a pre-tender estimate (happy path)**
1. Cost Intelligence -> Pre-Tender
2. Enter: floor area 250, build type "New build", 2 storeys, flat slope, features: Alfresco, Double Garage
3. Click Run Estimate
4. Expected: trade-by-trade breakdown shown with low/mid/high ranges
5. Expected API: `POST /api/intelligence/pretender` returns `{ ok: true, trades: [...] }`
- [ ] Pass  [ ] Fail

**TC-02 — Each trade has low/mid/high and confidence score**
1. After TC-01, inspect the returned trades array
2. Expected: each trade object has `trade` (name), `low` (number), `mid` (number), `high` (number), `confidence` (0-1)
3. Expected: no trade has null for low/mid/high
- [ ] Pass  [ ] Fail

**TC-03 — Missing floor area rejected**
1. Call `POST /api/intelligence/pretender` with no `floorArea`
2. Expected: HTTP 400 with plain English error
- [ ] Pass  [ ] Fail

**TC-04 — Missing build type rejected**
1. Call with no `buildType`
2. Expected: HTTP 400 with plain English error
- [ ] Pass  [ ] Fail

**TC-05 — Steep slope affects earthworks estimate**
1. Run estimate with flat slope -> note earthworks low/mid/high
2. Run same estimate with steep slope -> compare earthworks figures
3. Expected: steep slope produces higher earthworks cost range than flat
- [ ] Pass  [ ] Fail

**TC-06 — Features affect relevant trades**
1. Run estimate with no Pool feature -> note Pool/Landscaping figures (or absence)
2. Run same estimate with Pool selected
3. Expected: Pool feature adds or increases the Pool trade estimate
- [ ] Pass  [ ] Fail

**TC-07 — Estimate is read-only (no DB writes)**
1. Check DB record counts in `cost_intelligence` and related tables before running estimate
2. Run the estimate
3. Expected: no new rows inserted — estimate is a read-only calculation
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Estimate returns complete trade breakdown
- [ ] All fields (low/mid/high/confidence) present on each trade
- [ ] Missing required fields rejected
- [ ] Slope and features affect appropriate trade costs
- [ ] No DB writes from estimate calculation
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
