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

### Comparing quotes by trade (tender detail)
The Trades section groups every recipient under a **trade header** that shows the comparison at a glance — e.g. *"Joinery · 2/3 quoted · lowest $12,390.94 — Allan Carter"*. Cards within a trade are ordered quotes-first, then cheapest current quote up top, so the leading price is always at the top of the group.

### Verifying and correcting a quote (feeds Cost Intelligence)
Every quote a subcontractor emails is kept as a **submission** — if a sub sends a revised price, the old one is never overwritten; both appear on the card under **"N quotes on record"**. Each row can be checked and confirmed:
- **Amount** — auto-extracted from the PDF where possible. If the figure is wrong or blank, type the correct **ex-GST** amount in the box before verifying.
- **Verify** — confirms the amount and marks the quote **✓ Verified**. Only a *verified, current* quote (not a superseded older version) feeds the Cost Intelligence benchmarks, so verifying is what makes a price trustworthy for future estimating.
- **Reject** — marks an extraction **✗ Rejected** (e.g. the PDF wasn't a real quote). Rejected quotes never feed benchmarks. Use **Restore** to undo.
- **Un-verify** — takes a quote back out of the benchmark set without deleting it.
- **make primary** — when one email carried several PDFs, pick which file *is* the quote (the others stay attached as exclusions/schedules).

Verifying does **not** award the job — it only confirms the number.

### Awarding a quote
**Accept** (on the card) awards that subcontractor by pointing the RFQ at their **current** quote — the award is recorded as an enforceable pointer (`accepted_submission_id`), and the awarded price is copied onto the RFQ so the PO and win-finalise steps use the right figure. When a sub sent more than one quote (versions), each row in the "quotes on record" panel has its own **Accept this quote** so you can award a *specific* version; the awarded row turns green with a **✓ Awarded** badge. **Un-accept** removes the award. Awarding one sub does not auto-decline the trade's other quoters — decline them yourself if needed.

### Fixing a mistake on a row (⋯ menu)
Each recipient row has a **⋯** menu for corrections when a quote lands in the wrong place:
- **Change trade** — move the sub (and their quotes) to the correct trade.
- **Change subcontractor** — re-point the RFQ and its quotes to a *different* sub (fixes a quote filed against the wrong company). The picker lists subs who do that trade first, then a searchable list of everyone else.
- **Label / split scopes** — when one sub sent two quotes for two different things (e.g. cabinetry **and** stone benchtops), give each its own scope label so both sit side by side and neither is treated as superseding the other.
- **Remove recipient** — delete a junk/test row (blocked while it's awarded — un-accept first).

### Emailing the trade recipients (personalised blast)
The **Email recipients** button opens a compose window to message subcontractors on the job (updated plans, a chase, a thank-you, an award/decline) — each email goes as a reply on that sub's original RFQ thread.
- **Quick-select chips** (Awaiting / Quoted / Awarded / All) tick a whole group at once; you can still tick individuals.
- **Templates** — five built-in presets written in Blue Leaf's voice (Updated plans / Reminder / Received / You've won it / Not this time). Click one to fill the message; the job address, plans link and deadline drop in automatically.
- **Personalisation** — the greeting uses **`{{first_name}}`**, which is replaced with each subcontractor's contact first name when the email sends (falls back to "there" if we don't have a name). One message, but every sub gets an email that reads like it was written to them. You can also use `{{name}}` (full contact name) and `{{business}}` (company name).
- **Signature** — your saved email signature (name, title, mobile, website, logo) is added automatically below the sign-off, so you don't paste it into every message. Edit it under **Settings → email signature**.
- **Save preset** — save the current message as your own reusable template (**＋ Save preset**), then reuse, rename/update, or delete it from the template row. *(Saved presets require migration 156 to be applied; before that the built-in templates still work and Save just reports it needs the migration.)*

### Quote Inbox (unmatched quotes)
Most subcontractor quote emails match to their RFQ automatically. When one can't be matched (a reply from an unexpected address, a forwarded quote), it lands in **Tendering → Quote Inbox** (a red count on the nav shows how many are waiting). Open it, click **Match to job** on an email, pick the **job** then the **RFQ / trade**, and **Match** — the quote is filed against that RFQ *and* recorded in the quote record so it shows on the tender detail and feeds Cost Intelligence like any other quote. (The same list also still appears under the Quote Tracker's "Unmatched" tab.)

**The Quote Inbox only shows real subcontractor quotes.** The office mailbox also receives things that are *not* quotes — client-portal notifications ("Client approved a variation — …", sent from admin@) and internal test emails (marked `BLH TEST` / `__DRYRUN` / `__DEMO`). A classifier filters these out at the source so they never reach the inbox, so the count reflects quotes that genuinely need a decision. If you ever see junk here, it usually means a new notification wording slipped past the filter — flag it so the pattern can be added. (One-off historic clean-up of already-captured junk: run `node scripts/cleanup-quote-inbox.mjs` for a dry-run list, then `--apply` to clear them — they're marked resolved, not deleted, so nothing is lost.)

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
- **Quote Inbox junk guard:** the inbound-quote IMAP poller (`processIncomingQuoteMessage` in `server/dev-api.mjs`) runs `classifyInboundQuoteEmail` (`server/lib/quoteInboxClassify.mjs`) on every email with **no RFQ match**. It skips writing to `unmatched_quote_emails` (and the backing `correspondence` row) when the email is a `test_artifact` (BLH TEST / `__DRYRUN` / `__DEMO` markers), a `portal_notification` (subject starts "Client approved/declined/… a variation", "New portal message …" etc.), or `self_sent` (from `@blueleafbuilding.com.au`). It's the direct sibling of `financeRoutes.classifyInboxDoc` (finance's invoice-vs-quote gate) and is conservative — it only skips on a clear junk signal, so an unusual-but-genuine quote still falls through and is captured. Unit test: `scripts/tests/quote-inbox-classify.test.mjs`. Historic backfill: `scripts/cleanup-quote-inbox.mjs` (dry-run default, `--apply` sets `resolved_at`).

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

**TC-10 — Trade comparison header + verify a quote (feeds Cost Intelligence)**
1. Open a tender detail for a job with received quotes. Expected: each trade shows a **grouping header** with `X/Y quoted` and the lowest current price + sub name; cards are ordered cheapest-current-quote first.
2. On a card with a quote, find the **"N quotes on record"** panel. If a quote's amount is blank or wrong, type the correct **ex-GST** figure, then click **Verify**. Expected: the row shows **✓ Verified** and the amount is fixed.
3. Click **Un-verify** → Expected: the ✓ badge clears (the quote leaves the benchmark set) without deleting the quote. Click **Reject** on an extraction → **✗ Rejected**; **Restore** returns it to review.
4. On a submission that carried more than one PDF, click **make primary** on a file → Expected: that file becomes the primary quote; the others stay attached.
5. Expected: verifying does NOT change the job status or award it — Accept remains the only award action.
- [ ] Pass  [ ] Fail

**TC-11 — Award a quote (accepted-submission pointer + price mirror)**
1. On a card with a quote, click **Accept**. Expected: the card's status badge shows **Accepted**, and the awarded quote row turns green with **✓ Awarded**.
2. Re-open the card / reload. Expected: the awarded state persists (it's stored as the RFQ's accepted-submission pointer, not just a label).
3. Where a sub sent two quotes, click **Accept this quote** on the *older* version. Expected: the award moves to that row; only one row is Awarded at a time.
4. Click **Un-accept**. Expected: the award clears and the badge returns to Received.
5. Award a quote, then proceed to issue the PO / finalise the win. Expected: the PO uses the **awarded quote's amount** (the award copies it onto the RFQ), not $0.
- [ ] Pass  [ ] Fail

**TC-12 — Quote Inbox: match an unmatched quote (populates the quote record)**
1. Open **Tendering → Quote Inbox**. Expected: it lists inbound quotes that couldn't be auto-matched; the nav shows a red count matching the list length.
2. Click **Match to job** on one → pick a **job** → pick an **RFQ / trade** → **Match**. Expected: the row disappears and the nav count drops by one.
3. Open that job's tender detail. Expected: the matched quote now appears in the "quotes on record" panel for that RFQ (i.e. the manual match created a submission, not just a legacy status change) and can be verified/awarded like any other.
4. Board consolidation: on the Tender Board, a job with awarded quotes shows "N awarded · $X" on its card and in the List **Awarded** column; the KPI strip's **Committed** tile sums awarded amounts across active tenders.
- [ ] Pass  [ ] Fail

**TC-13 — Quote Inbox junk guard: notifications and test emails never appear**
1. Run the classifier unit test: `node scripts/tests/quote-inbox-classify.test.mjs`. Expected: `quote-inbox-classify: 15 passed, 0 failed` (exit 0).
2. Confirm the guard's three skip categories and the keep-default in the test output logic: a `test_artifact` (subject containing `BLH TEST` / `__DRYRUN` / `__DEMO`), a `portal_notification` (subject "Client approved a variation — …"), and a `self_sent` email (from `@blueleafbuilding.com.au`) all classify as junk; a genuine RFQ reply from an external subcontractor domain classifies as `quote`.
3. Dry-run the historic clean-up: `node scripts/cleanup-quote-inbox.mjs`. Expected: it prints the unresolved rows grouped by junk category with a per-row reason and writes **nothing** (dry run). Sanity-check the candidate list looks like junk before `--apply`.
4. (Optional, with IMAP live) After a poll cycle, a client-portal variation-approval email sent to the office mailbox does **not** create a new Quote Inbox row; the server log shows `[imap-unmatched] skipped portal_notification …`.
- [ ] Pass  [ ] Fail

**TC-14 — Email recipients: personalisation + signature**
1. On a tender with sent RFQs, open **Email recipients**. Click the **Updated plans** template — the message greets with `Hi {{first_name}},` and fills the address/plans link.
2. Tick two subs whose contact first names differ, then send. Expected: each subcontractor's copy greets them by their own first name (a sub with no contact on file gets "Hi there,"), and each email carries the saved signature block (name/title/mobile/website/logo) below the "Cheers, Sam" sign-off. Verify by test-sending to a mailbox you control (`info@blueleafbuilding.com.au`).
3. Confirm each send is a **reply on that sub's original RFQ thread** (subject "Re: …") and is logged in correspondence.
- [ ] Pass  [ ] Fail

**TC-15 — Save / edit / delete a custom email preset** *(requires migration 156)*
1. In the Email recipients window, edit the message, click **＋ Save preset**, name it, **Save**. Expected: a new pill appears in the template row and the endpoint returns `{ ok: true, template: {...} }`.
2. Click the saved pill (loads it), tweak the text, click **＋ Save preset → Update**. Expected: the preset's body updates (PATCH `/api/tender/email-templates/:id`).
3. Click the pill's **×**. Expected: the preset is removed (DELETE). Reopen the window — it stays gone.
4. Pre-migration behaviour: with migration 156 not yet applied, the template row shows only the built-in templates and **Save** reports it needs migration 156 — no crash.
- [ ] Pass  [ ] Fail

**TC-16 — Change subcontractor (⋯ menu)**
1. On a recipient row, open **⋯ → Change subcontractor**. Expected: a picker opens with subs who do that trade listed first (tagged "matches trade"), plus a search box for the rest; the current sub is not listed.
2. Pick a different sub. Expected: the RFQ (and any quotes on it) now show under the new subcontractor; PATCH `/api/tender/rfqs/:id { subcontractorId }` returns `{ ok: true }`.
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
