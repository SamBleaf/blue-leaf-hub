---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
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
Shows all jobs as tender cards, grouped by status, with an RFQ progress indicator (how many quotes are received vs sent). From here you open a tender's detail, archive it, or start a new tender.

## 4. Before you start
- Supabase must be configured (the board reads jobs directly)
- Jobs exist in the system

## 5. Step-by-step process

1. Go to **Tender Manager → Tender Board**
2. Use the status tabs to filter: **All / Tendering / Won / Lost / Archived**
3. Use the search box to find a tender by project address
4. Each card shows:
   - Project address and status badge
   - RFQ progress — received/accepted quotes vs total sent
   - Key dates (created, won, lost)
5. Click a card to open the tender detail (`/tender-manager/board/:jobId`)
6. To start a new tender, click **New tender** (takes you to the RFQ Engine)

### Toggling archived tenders
- Tick **Show archived** to include archived tenders in the list (hidden by default)

## 6. What happens next

- The board reads `jobs` (with joined `rfqs`) live from Supabase
- No data is changed by viewing — the board is read-only except for the archive/delete actions (see SOP 03-04)
- Clicking a card navigates to the tender detail page

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Can't find a tender | It's archived | Tick "Show archived" to reveal archived tenders |
| Confusing won/lost | Status not updated | Keep the job status current as tenders progress |
| Expecting RFQ detail here | Wrong screen | The board shows RFQ progress counts; open the RFQ Engine for full quote management |

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
- The board reads `jobs` directly via the Supabase client (frontend), selecting `id, address, status, created_at, won_at, lost_at, dropbox links` and joined `rfqs ( id, status, sent_at, received_at, reminder_sent_at )`
- RFQ progress = count of `rfqs` with status in (`received`, `accepted`) vs total
- Status tabs filter on `jobs.status`: `tendering`, `won`, `lost`, `archived`
- "New tender" links to `/tender-manager/rfq-engine`
- Card click navigates to `/tender-manager/board/:jobId`

## 12. Edge cases and limits
- Archived tenders are filtered out unless "Show archived" is on
- Search matches on project address
- The board is a read view — mutations happen via archive (frontend Supabase update) or delete (API, SOP 03-04)

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Supabase configured
- [ ] At least 3 jobs with different statuses (e.g. one `tendering`, one `won`, one `archived`)
- [ ] At least one job with RFQs sent

### Test cases

**TC-01 — Board loads (happy path)**
1. Navigate to Tender Manager → Tender Board
2. Expected: tender cards render, grouped/filtered by the active tab
3. Expected: no console errors
- [ ] Pass  [ ] Fail

**TC-02 — Status tab filtering**
1. Click the **Won** tab
2. Expected: only jobs with `status = 'won'` shown
3. Repeat for Tendering and Lost
- [ ] Pass  [ ] Fail

**TC-03 — Search by address**
1. Type a known project address fragment in the search box
2. Expected: list filters to matching tenders
- [ ] Pass  [ ] Fail

**TC-04 — Archived hidden by default**
1. With "Show archived" unticked, confirm archived jobs are not listed
2. Tick "Show archived"
3. Expected: archived jobs now appear
- [ ] Pass  [ ] Fail

**TC-05 — RFQ progress indicator**
1. Open a tender that has RFQs sent and some received
2. Expected: the card shows received/accepted count vs total sent (e.g. "2 of 5 quotes in")
- [ ] Pass  [ ] Fail

**TC-06 — Open tender detail**
1. Click a tender card
2. Expected: navigates to `/tender-manager/board/:jobId` (tender detail)
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Board loads without error
- [ ] Tabs filter correctly
- [ ] Search works
- [ ] Archived toggle works
- [ ] RFQ progress accurate
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
