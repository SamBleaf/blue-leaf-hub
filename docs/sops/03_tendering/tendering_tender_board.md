---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.1 — view modes + KPI strip
screenshot_status: placeholders_only
owner: Admin
test_status: static_pass
---

# SOP 03-03: Use the Tender Board

**Module:** Tender Manager → Tender Board  
**SOP ID:** 03-03  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Supervisor (tender coordinators)

## 2. When to use it
To see every tender (job) at a glance — which are out to tender, won, lost, or archived — and to track RFQ progress on each.

## 3. What this does
Shows all jobs as tender cards grouped by stage (Tendering / Won / Lost / Archived), with a KPI strip (active, missing quotes, chases due, ready to award) and an Action Queue highlighting what needs attention. Supports four views — Board, Actions, List, Scorecard — so coordinators can triage by urgency or scan totals at a glance. From any view you can open a tender detail, archive a tender, or start a new tender.

## 4. Before you start
- Supabase must be configured (the board reads jobs directly)
- Jobs exist in the system

## 5. Step-by-step process

1. Go to **Tender Manager → Tender Board**
2. Use the **view toggle** to pick how you want to see tenders:
   - **Board** — grouped stage cards + Action Queue side-by-side (desktop); Action Queue then cards (mobile)
   - **Actions** — Action Queue only: chases due → outstanding quotes → ready to award
   - **List** — dense table showing address, stage, coverage %, missing count, chase count
   - **Scorecard** — count tiles per stage (Out to tender / Won / Lost / Archived)
3. Use the **search box** to filter by project address across all views
4. Tick **Show archived** to include archived tenders (hidden by default)
5. Each tender card shows:
   - Project address and stage badge
   - RFQ coverage % and counts (missing, chases due)
   - Quick-action menu (⋯) — Archive, Delete
6. Click a card (or an address in list view) to open the tender detail (`/tender-manager/board/:jobId`)
7. To start a new tender, click **New tender** (navigates to `/tender-manager/rfq-engine`)

### KPI strip
The strip above the view toggle shows live counts for: **Active** (tendering), **Missing** quotes, **Chases due** (sent ≥7 days with no response), **Ready to award** (all quotes in), **Won** jobs.

### Action Queue
Automatically populated from tendering jobs: chases first (red) → outstanding quotes (amber) → ready to award (green). Clicking an action navigates to that tender's detail.

## 6. What happens next

- The board reads `jobs` (with joined `rfqs`) live from Supabase — no data is changed by viewing
- Archive and delete actions are available from each card's action menu (see SOP 03-04)
- Clicking a card navigates to the tender detail page

### Adding a trade or subcontractor after the RFQ engine (on the tender detail "Trades" section)
Once the RFQ engine's steps are done you don't have to reopen the whole wizard to add work:
- **+ Add trade** (Trades header) — add a trade that was **missed** in the RFQ engine. The trade picker lists only trades not already on the job; choose one, pick a subcontractor (the picker shows that trade's subs first), edit the auto-filled email, and **Send RFQ**. The trade appears on the board once sent.
- **+ Add subcontractor** (Trades header) — send an RFQ to **another sub for a trade the job already has**. Pick the trade, then a sub (that trade's subs are listed first, all others below), and send.
- **+ sub** (on each trade card) — the same as Add subcontractor but with that card's trade pre-selected — the quickest way to add one more quoter to a specific trade.
- All three send through the same path and are protected by the double-send guard: if that subcontractor already has a **sent** RFQ for that trade, it is blocked so nobody is emailed twice.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Can't find a tender | It's archived | Tick "Show archived" to reveal archived tenders |
| Confusing won/lost | Status not updated | Keep the job status current as tenders progress |
| Expecting RFQ detail here | Wrong screen | The board shows RFQ coverage counts; open the RFQ Engine for full quote management |
| Action Queue is empty | No tendering jobs with outstanding RFQs | The Action Queue only surfaces tendering jobs — won/lost jobs don't appear there |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Configure Supabase to load tenders" | Supabase env vars are missing — the board cannot read jobs |
| RFQ progress shows 0 | No RFQs sent yet for that job — use the RFQ Engine to send |
| Tender missing from All tab | It may be archived — toggle Show archived |

## 9. Related modules
- [Create and send an RFQ](../04_rfq_engine/04-02_create_rfq_package.md) — RFQ Engine
- [Archive or delete a tender](tendering_archive_tender.md) — SOP 03-04

## 10. Screenshot placeholders
[insert screenshot: tender board with status tabs]
[insert screenshot: a tender card showing RFQ progress]

## 11. Automation notes
- The board reads `jobs` directly via the Supabase client (frontend), selecting `id, address, status, created_at, won_at, lost_at, dropbox_shared_link, dropbox_link` and joined `rfqs ( id, status, sent_at, received_at, reminder_sent_at )`
- RFQ coverage = count of `rfqs` with `status` in (`received`, `accepted`) / total; `rfqStats()` in `src/lib/tenderDashboard.js`
- Chase threshold: `sent_at` ≥ 7 days ago with no `received_at`
- `groupByStage()` groups jobs into STAGES: `tendering` → `won` → `lost` → `archived`; empty stages are hidden
- `computeTenderKpis()` and `buildTenderActionQueue()` derive the KPI strip and Action Queue from the same job+rfqs data — no extra API calls
- Archive: `POST /api/tender/archive { jobId }` (audited via `job_events`); Unarchive: `POST /api/tender/unarchive { jobId }`
- Delete: `POST /api/tender/job-delete { jobId }`
- "New tender" links to `/tender-manager/rfq-engine`
- Card click navigates to `/tender-manager/board/:jobId`

## 12. Edge cases and limits
- Archived tenders are filtered out unless "Show archived" is on
- Search matches on project address (case-insensitive substring)
- Empty stages are hidden from Board and Scorecard views (only stages with jobs appear)
- Action Queue only surfaces tendering jobs — won/lost/archived do not generate actions
- The board is a read view; mutations (archive, delete) go through the server API (SOP 03-04)

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Supabase configured
- [ ] At least 3 jobs with different statuses (e.g. one `tendering`, one `won`, one `archived`)
- [ ] At least one tendering job with RFQs: some sent >7 days ago (chase), some received

### Test cases

**TC-01 — Board loads (happy path)**
1. Navigate to Tender Manager → Tender Board
2. Expected: tender cards render, grouped by stage (Out to tender / Won / Lost / Archived), KPI strip visible
3. Expected: no console errors
- [ ] Pass  [ ] Fail

**TC-02 — View modes switch correctly**
1. Click **Actions** — expected: only the Action Queue is shown
2. Click **List** — expected: dense table with Address / Stage / Coverage / Missing / Chase columns
3. Click **Scorecard** — expected: count tiles per stage
4. Click **Board** — expected: returns to default card + action queue layout
- [ ] Pass  [ ] Fail

**TC-03 — Search by address**
1. Type a known project address fragment in the search box
2. Expected: list filters to matching tenders across all stages
- [ ] Pass  [ ] Fail

**TC-04 — Archived hidden by default**
1. With "Show archived" unticked, confirm archived jobs are not listed
2. Tick "Show archived"
3. Expected: archived jobs now appear in the Archived stage group
- [ ] Pass  [ ] Fail

**TC-05 — RFQ coverage and Action Queue**
1. With a tendering job that has RFQs sent >7 days ago (no response), open the board
2. Expected: KPI strip "Chases due" count > 0
3. Expected: Action Queue has a red "Chase due" entry for that job
4. Expected: Action Queue is empty for won/lost/archived jobs
- [ ] Pass  [ ] Fail

**TC-06 — Open tender detail**
1. Click a tender card (or address link in List view)
2. Expected: navigates to `/tender-manager/board/:jobId` (tender detail)
- [ ] Pass  [ ] Fail

**TC-07 — Stage grouping hides empty stages**
1. Ensure there are no jobs with `status = 'lost'`
2. Expected: no "Lost" group appears in Board or Scorecard view
- [ ] Pass  [ ] Fail

**TC-08 — Add a missed trade after the RFQ engine**
1. Open a tendering job's tender detail → **Trades** → **+ Add trade**.
2. Expected: the Trade dropdown lists only trades NOT already on the job. Pick one → the Subcontractor dropdown shows that trade's subs first. Pick a sub → email auto-fills → **Send RFQ**.
3. Expected: the new trade+sub appears as a card on the board after sending.
- [ ] Pass  [ ] Fail

**TC-09 — Add another subcontractor to an existing trade + double-send guard**
1. On a trade card, click **+ sub** (or Trades header → **+ Add subcontractor**).
2. Expected: the trade is pre-selected (for **+ sub**); the sub picker lists that trade's subs first. Pick a new sub → **Send RFQ** → a second card appears for that trade.
3. Try to add the SAME sub to the SAME trade again → Expected: it's blocked (already-sent guard), nobody is emailed twice.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Board loads without error
- [ ] Four view modes toggle correctly
- [ ] Stage grouping correct; empty stages hidden
- [ ] Search works across all views
- [ ] Archived toggle works
- [ ] KPI strip and Action Queue accurate
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
