---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 04-01: RFQ Engine — Overview

**Module:** Tender Manager → RFQ Engine  
**SOP ID:** 04-01  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin (tender coordinators)

## 2. When to use it
When preparing to request quotes from subcontractors for a project that is moving toward tender. The RFQ Engine manages the full quotation process from scope extraction through to accepted quotes.

## 3. What this does
The RFQ Engine manages the request-for-quote process:

1. **Create a package** — one RFQ package per tender (covers all trades for that project)
2. **Extract scope** — AI reads your tender documents and extracts trade-specific scope of works
3. **Assign trade packages** — one scope per trade (concrete, frame, electrical, etc.)
4. **Send emails** — one email per trade to selected subcontractors
5. **Receive quotes** — record quotes as they come in
6. **Compare** — see all quotes for a trade side by side
7. **Accept** — mark the winning quote; record cost against the job
8. **Addendum** — send scope changes to already-notified subcontractors

## 4. Key concepts

**RFQ Package:** The top-level record for a tender. One package per project tender. Contains the project address, deadline, and all trade scopes.

**Trade Scope:** One scope of works per trade within a package. Each scope has bullet-point items, exclusions, questions for the subie, and a list of recipients (subcontractors to invite).

**Recipient:** A subcontractor record attached to a trade scope. One recipient per subcontractor per trade. Status: `sent`, `opened`, `quoted`, `accepted`, `declined`.

**Coverage score:** The percentage of Buildexact estimate line items that are covered by accepted or quoted trades. 100% = all trades accounted for.

## 5. How to open the RFQ Engine

The RFQ workflow uses **two surfaces**:

| Surface | Nav label | Route | Use for |
|---------|-----------|-------|---------|
| **RFQ Engine** | Tender Manager → **RFQ Engine** | `/tender-manager/rfq-engine` | New tender: upload docs → AI scope extract → assign trades → **send** emails (4-step wizard) |
| **Quote Tracker** | Tender Manager → **Quote Tracker** | `/tender-manager/rfq-packages` | After send: receive quotes, compare, accept, addendum |

**To start a new tender RFQ:**
1. Navigate to **Tender Manager** → **RFQ Engine**
2. Follow the wizard (upload → extract → trades → send)
3. When emails are sent, the package appears in **Quote Tracker** for follow-up (SOP 04-06 onward)

**To work an existing package:**
1. Navigate to **Tender Manager** → **Quote Tracker**
2. Click the package to open `/tender-manager/rfq-packages/:packageId`

## 6. Related SOPs
- [Create an RFQ package](04-02_create_rfq_package.md) — SOP 04-02
- [Extract scope with AI](04-03_scope_extraction.md) — SOP 04-03
- [Manage trade packages](04-04_trade_packages.md) — SOP 04-04
- [Send RFQ emails](04-05_send_rfq.md) — SOP 04-05
- [Receive quotes](04-06_receive_quotes.md) — SOP 04-06
- [Compare quotes](04-07_quote_comparison.md) — SOP 04-07
- [Accept a quote](04-08_accept_quote.md) — SOP 04-08
- [Create an addendum](04-09_addendum.md) — SOP 04-09

## 7. Automation notes
- All packages: `GET /api/rfq-packages` — returns list with trade scopes and recipient counts
- Package detail: `GET /api/rfq-packages/:id`
- Coverage score computed via `reconcilePackageTradeCoverage()` after any status change

## 8. Owner of the process
Admin  
Next review: 2026-11-29

---

## 9. Troubleshoot Agent Test Script

### Test cases

**TC-01 — RFQ Engine page loads**
1. Navigate to Tender Manager → RFQ Engine
2. Expected: package list loads without error
3. Expected: existing packages shown with trade count and status
- [ ] Pass  [ ] Fail

**TC-02 — Package list shows correct fields**
1. Open RFQ Engine with at least 1 existing package
2. Expected: each package shows project address, trade count, tender deadline, status
3. Expected: no undefined/null values visible in the list
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] RFQ Engine loads
- [ ] Package list renders correctly
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
