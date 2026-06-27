# PLAYWRIGHT-SALES-GATE-LADDER-01 — Sales stage-gate browser regression

**Date:** 2026-06-27  
**Owner:** Cursor hardening (test-only)  
**Verdict:** **PASS** (1/1 Playwright spec green)  
**Canonical run:** `BLH-PW-SALES-GATE-20260627-1201`

---

## Purpose

Repeatable Playwright regression for the manually verified sales stage-gate ladder from [E2E_FULL_WALKTHROUGH_BLH-E2E-20260627-1041.md](./E2E_FULL_WALKTHROUGH_BLH-E2E-20260627-1041.md):

**Enquiry → Qualify → Discovery → Winning Offer → Fee Proposal → Accepted**

Plus W01 convert/`site_address` gate (API + UI, no live Dropbox convert).

---

## Command

```bash
# Requires API on :8787 and Vite on :5174 (or set E2E_BASE_URL)
E2E_SKIP_WEBSERVER=1 npm run test:pw-sales-gate-ladder
```

---

## Spec & helpers

| Artifact | Path |
|----------|------|
| Spec | `e2e/tests/workflows/sales-stage-gate-ladder.spec.js` |
| Helpers | `e2e/helpers/salesGateLadder.mjs` |
| Auth hardening | `e2e/helpers/auth.mjs` — `waitForAppSession()` after UI login |
| Screenshots | `e2e/screenshots/{RUN_ID}/01–12-*.png` |

---

## Coverage map

| Step | Verified | Evidence |
|------|----------|----------|
| Admin UI login | Yes | `loginViaUI` + director role |
| Create lead from Sales Pipeline | Yes | POST `/api/sales/leads` captured; Amelia Hartley run-tagged email |
| Lead on pipeline | Yes | Screenshot `02-lead-on-pipeline` |
| LeadDetail core fields | Yes | Email + phone in Lead file drawer |
| Enquiry → Qualify | Yes | Sticky Next panel |
| Qualify → Discovery gate (score ≥ 5) | Yes | Move disabled until scorecard ≥ 5; advisory only (W02-DRIFT-006) |
| Discovery fields | Yes | Notes, key requirements, design stage, desired start — API poll |
| Discovery → Winning Offer | Yes | Gate checklist green |
| Pre-construction fee | Yes | Winning Offer inline field |
| Winning Offer → Fee Proposal | Yes | Sticky Next panel |
| PTSA scope warning | Yes | "Scope not set"; Mark PTSA disabled (PTSA-WARNING-01) |
| Convert blocked without `site_address` | Yes | API 400 on `POST .../convert-to-job` |
| Site address unblocks Create Job | Yes | UI button enabled at Accepted; **not clicked** (no Dropbox) |
| Outcome stamps clean | Yes | `won_at` / `lost_at` / `job_id` null through ladder |
| Run-tagged cleanup | Yes | `cleanupRunLeads()` beforeAll/afterAll |

---

## UI patterns documented (for future specs)

1. **Lead route:** `/sales/:leadId` (not `/sales/leads/:id`).
2. **Sticky Next panel hidden** at `fee_proposal` and `accepted` — use focus-panel `Move to {Stage}` instead.
3. **Duplicate blocks:** Qualifying scorecard, PTSA, and discovery appear in both "Do this now" and "Lead file → Stage work" — scope locators to Lead file for edits when possible.
4. **InlineField:** click label row button → fill → Enter to commit (date and text).
5. **E2E seed:** global setup may warn on duplicate `projects_pkey` — non-fatal; spec creates own lead data.

---

## Run result (2026-06-27)

| Check | Result |
|-------|--------|
| Playwright | **1 passed** (~22s) |
| `npm run build` | **pass** |
| `npm run test:cleanup-artifacts` | **dry-run pass** (no `--confirm`) |
| Product code changed | **no** |
| W17 / W18 product touched | **no** |

---

## Related closures (accepted — do not reopen)

| ID | Notes |
|----|-------|
| W18-VOID-GUARD-PROBE-01 | DISC-REG-01 — stale E2E fixture; not product bug |
| W01-CONVERT-01 | Address gate |
| OUTCOME-STAMP-01 | Terminal stamps |
| PTSA-WARNING-01 | Scope / Mark PTSA disabled |
| W03-FEE-LINK-01 | fee_proposal_id stamp (API; not exercised in this browser spec) |

---

## Deferred (not in scope)

| ID | Notes |
|----|-------|
| BLH-E2E-001 | Soft-deleted projects in Ops Gantt / portal admin — Claude fix candidate |
| W18 manual UAT | W18-UAT-EXEC-01 still pending |
| External side-effects | RFQ send, live convert, Buildxact, Dropbox — gap-documented |

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-27 | Initial pass — PLAYWRIGHT-SALES-GATE-LADDER-01 green |
