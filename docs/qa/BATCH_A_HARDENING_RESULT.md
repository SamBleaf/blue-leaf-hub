# Batch A Hardening Result

**Status:** Complete — P0 fixes shipped and regression verified (2026-06-25)  
**Scope:** Workflows W01–W05 (Sales → Tender Setup)  
**Mode:** Map → test skeletons → smallest-safe P0 fixes → regression run

**Related:** [BATCH_A_REVIEW_PACK.md](./BATCH_A_REVIEW_PACK.md), [BATCH_A_SALES_TO_TENDER_SUMMARY.md](./BATCH_A_SALES_TO_TENDER_SUMMARY.md), [30_DAY_HARDENING_TRACKER.md](./30_DAY_HARDENING_TRACKER.md), [WORKFLOW_TEST_MATRIX.md](./WORKFLOW_TEST_MATRIX.md), [BUG_REGISTER.md](./BUG_REGISTER.md)

---

## 1. Executive summary

Batch A hardening mapped five workflows (W01–W05), approved six P0 fixes (P0-A1–A6), implemented them in three blocks, and verified behaviour with API and E2E regression tests.

**Outcome:** The highest-risk **W04→W05 handoff** gaps (Address pending, lead linkage, job-delete with RFQ data) are patched. **W01 website enquiry** path now shows names on the pipeline and writes a creation activity. **Tender Board rfqs-only** limitation is documented and baselined — no board redesign.

**No workflow is “stable enough” for unfixed production reliance.** W02–W03 P1 items, W05 structural model, and all of Batch B (W06–W09) remain open.

---

## 2. Scope delivered

| Lane | Deliverable | Status |
|------|-------------|--------|
| **Mapping** | W01–W05 workflow docs (23 sections each) | ✅ Complete |
| **Review** | [BATCH_A_REVIEW_PACK.md](./BATCH_A_REVIEW_PACK.md) | ✅ Accepted |
| **Tests** | `scripts/batch-a/` + `e2e/tests/workflows/batch-a/` | ✅ Skeletons + regression |
| **P0 fixes** | P0-A1 through P0-A6 | ✅ All shipped |
| **Batch B** | W06–W09 mapping / fixes | ❌ Not started (by design) |

**Explicitly out of scope:**
- Tender Board redesign · `tender_phase` schema · Quote Tracker merge
- Batch B implementation · RFQ matcher changes
- P1/P2 fixes unless separately approved
- Server-enforced stage gates (SAM-W02-002: advisory during hardening)

---

## 3. P0 fixes — blocks and product changes

Implemented in approved order: **A5 → A6 → A3 → A4 → A1 → A2**.

### Block 1 — Low-risk containment (W05)

| ID | Fix | Product code? | Drift |
|----|-----|---------------|-------|
| **P0-A5** | Document/test TenderBoard **rfqs-only** progress | **No** — test/doc only | W05-DRIFT-003 documented |
| **P0-A6** | Block `POST /api/tender/job-delete` when `rfq_packages` or `rfqs` linked | **Yes** — 409 `TENDER_HAS_RFQ_DATA` | W05-DRIFT-008 **fixed** |

**Files:** `server/lib/jobsApiRoutes.mjs`, `scripts/batch-a/w05-tender-board.mjs`

### Block 2 — W04 handoff safety

| ID | Fix | Product code? | Drift |
|----|-----|---------------|-------|
| **P0-A3** | Block RFQ/tender handoff when job address is `"Address pending"` | **Yes** — 409 `JOB_ADDRESS_PENDING` | W04-DRIFT-005 **fixed** |
| **P0-A4** | RFQ extraction jobs preserve `lead_id` / `leads.job_id` | **Yes** | W04-DRIFT-007 **fixed** |

**Files:** `server/lib/jobGuards.mjs` (new), `server/lib/rfqPackageRoutes.mjs`, `server/dev-api.mjs`, `server/lib/jobsApiRoutes.mjs`, `src/pages/RfqEngine.jsx`, `scripts/batch-a/w04-job-setup.mjs`

### Block 3 — W01 cleanup

| ID | Fix | Product code? | Drift |
|----|-----|---------------|-------|
| **P0-A1** | `displayLeadName()` for website `name`-only leads | **Yes** | W01-DRIFT-002 **fixed** |
| **P0-A2** | Unified `"Lead created"` on manual, website enquiry, CRM convert | **Yes** | W01-DRIFT-001 **fixed** |

**Files:** `src/lib/leadUtils.js` (new), `src/pages/SalesPipeline.jsx`, `src/pages/LeadDetail.jsx`, `server/lib/leadActivities.mjs` (new), `server/lib/salesRoutes.mjs`, `server/lib/marketingIntelligenceRoutes.mjs`, `server/lib/crmRoutes.mjs`, `scripts/batch-a/w01-leads.mjs`

---

## 4. Website enquiry acceptance chain

End-to-end story verified in regression (2026-06-25):

```text
Website enquiry (POST /api/public/enquiry)
  → lead visible in pipeline (displayLeadName)
  → activity timeline exists ("Lead created")
  → qualification workflow can append stage_change / logged activities (W02 — same as manual leads)
```

| Step | Test ID | Result |
|------|---------|--------|
| Activity on create | W01-API-02 | ✅ pass (`--write`) |
| Name on pipeline | W01-E2E-02 | ✅ pass (E2E) |
| CRM convert activity | W01-API-03 | ✅ pass (`--write`) |
| Manual create activity | W01-API-01 | ✅ pass (`--write`) |

**W02 qualification audit trail** (won/lost stamps, gate enforcement, transcript provenance) remains **P1 / open** — not part of Batch A P0.

---

## 5. Regression run (2026-06-25)

**Prerequisites:** API on `:8787`, Supabase env vars, test user (`node scripts/create-test-user.mjs` once).

| Command | Passed | Failed | Skipped | Gap-documented |
|---------|--------|--------|---------|----------------|
| `npm run test:batch-a` | 14 | 0 | 13 | 10 |
| `npm run test:batch-a:write` | 22 | 0 | 0 | 6 |
| `npm run test:e2e -- e2e/tests/workflows/batch-a` | 4 | **1** | 2 | — |

### P0-related passes (`--write`)

- W01-API-01/02/03 · W04-API-05 · W04-API-01/06 · W03-API-05 · W05-API-05 · P0-A5 baselines

### Expected gap-documented (not failures)

- W01-SEC-03 — no public enquiry rate limit (SAM-W01-003 open)
- W02-API-03/04 — stage gate bypass; no `lost_at` stamp
- W03-API-07 — PTSA signed without address handoff warning
- P0-A5 — package-only job → 0% on board (W05-DRIFT-003 by design)

### Test debt

| ID | Issue | Impact |
|----|-------|--------|
| **W05-TEST-001** | E2E package-only `0%` subtest — Playwright strict-mode locator matches 32 elements | **Test harness only** — product behaviour confirmed via API/write baselines |

**E2E note:** If API already runs on `:8787`, Playwright may log `EADDRINUSE` when starting `npm run dev`. Use existing server or `E2E_SKIP_WEBSERVER=true`.

---

## 6. Drift register — Batch A P0 impact

### Fixed (P0)

| ID | Fix |
|----|-----|
| W01-DRIFT-001 | Unified `lead_activities` on all create paths |
| W01-DRIFT-002 | Pipeline display name for website leads |
| W04-DRIFT-005 | Address pending blocked before RFQ handoff |
| W04-DRIFT-007 | Lead linkage at RFQ extraction job create |
| W05-DRIFT-008 | job-delete blocked when RFQ packages/quotes exist |

### Documented, no product change (P0-A5)

| ID | Behaviour proven |
|----|------------------|
| W05-DRIFT-003 | Board progress ring uses nested `rfqs` only; package-only jobs show **0%** |

### Still open (representative — not P0)

| ID | Workflow | Issue |
|----|----------|-------|
| W01-DRIFT-003 / W02-DRIFT-006 | W01/W02 | Stage gates UI-only |
| W02-DRIFT-001 | W02 | No `won_at` / `lost_at` on stage move |
| W03-DRIFT-002 | W03 | PTSA signed without job when no address |
| W05-DRIFT-004 | W05 | Win/lose does not sync leads pipeline |
| W05-DRIFT-009 | W05 | Won tender ops handoff unproven |
| W05-STRUCTURAL-001 | W05 | Board phase model too blunt (SAM-W05-006 decided — no redesign now) |

Full list: [BUG_REGISTER.md](./BUG_REGISTER.md)

---

## 7. Sam decisions applied

| ID | Decision | Applied in Batch A |
|----|----------|-------------------|
| SAM-W02-002 | Advisory gates + diagnostic logging; no hard-block yet | No server gate patch |
| SAM-W03-001 | PTSA signed OK; block tender handoff without address/job | P0-A3 blocks RFQ; PTSA UI warning still P1 |
| SAM-W04-001 | Block Address pending before RFQ/tender handoff | **P0-A3** |
| SAM-W05-003 | Archive preferred; hard delete draft/test only | **P0-A6** |
| SAM-W05-006 | Future `tender_phase`; no board redesign during hardening | P0-A5 doc/test only |

**Implemented but not yet logged as `decided` in SAM_DECISION_LOG:** SAM-W01-001 (unified activities), SAM-W01-002 (display helper).

---

## 8. Source-of-truth check

| Workflow | Expected | After Batch A P0 |
|----------|----------|------------------|
| **W01** | `leads` + `lead_activities` on all create paths; display `name` | ✅ Confirmed — regression pass |
| **W04** | Real address + `lead_id` before RFQ handoff | ✅ Confirmed — 409 guard + linkage |
| **W05** | Board = `jobs` + `rfqs`; delete protects RFQ data | ✅ Confirmed — baseline + 409 guard |
| **W02–W03** | Qualification / fee proposal audit | ⚠️ Mapped only — P1 open |
| **Batch B RFQ** | Package + send + match SoT | ❌ Not mapped in Batch A |

Detail: [WORKFLOW_OWNERSHIP_MATRIX.md](./WORKFLOW_OWNERSHIP_MATRIX.md), [SOURCE_OF_TRUTH.md](../agent_knowledge/SOURCE_OF_TRUTH.md)

---

## 9. Stop gate — Batch B

Batch A **§10 stop gate** satisfied (2026-06-25):

- [x] P0-A1–A6 implemented
- [x] Mandatory Sam decisions decided (§7 of review pack)
- [x] Test skeletons exist; regression run logged
- [x] W04→W05 handoff verified (P0-A3 + P0-A4)
- [x] W05-STRUCTURAL-001 acknowledged (SAM-W05-006)

**Approved next step:** Batch B **mapping only** — W06 mapped 2026-06-25; **stop after W06** until reviewed. Then W07 → W08 → W09 per priority below.  
**Not approved:** Batch B fixes, Tender Board redesign, `tender_phase`, P1/P2 unless separately approved.

### Batch B mapping priority (refined 2026-06-25)

1. **W06** — confirm API/UI package shape (camelCase visibility risk W06-DRIFT-001)
2. **No matcher fixes** until W06 package visibility proven in tests
3. **W07** — confirm transport + Message-ID + reply matching (partial fixes W07-DRIFT-001/003 need runtime verification)
4. **W08** — quote acceptance grounded in W07 receive/match state
5. **W09** — win handoff depends on accepted quotes

Pre-confirmed parking lot: [BUG_REGISTER.md](./BUG_REGISTER.md) § Batch B parking lot · [BATCH_A_REVIEW_PACK.md](./BATCH_A_REVIEW_PACK.md) §11

---

## 10. What Batch A did not fix

- Tender Board aggregation of `rfq_packages` (SAM-W05-001 open)
- Lead pipeline sync on win/lose (SAM-W05-004 / W05-DRIFT-004)
- persistRfqs direct Supabase job insert (W04-DRIFT-001)
- Fee proposal wizard direct Supabase writes (W03-DRIFT-003)
- Public enquiry spam/rate-limit (W01-SEC-003 / SAM-W01-003)
- Full W02 qualification audit (outcome stamps, server gates)
- Any Batch B RFQ email matching / Resend Sent folder issues (W07 parking lot)

---

## 11. Recommended next actions

| Priority | Action | Owner lane |
|----------|--------|------------|
| 1 | Review W06 map; confirm W06-DRIFT-001/002 in tests before any fixes | Batch B mapping |
| 2 | `/harden map W07` — only after W06 accepted | Batch B mapping |
| 3 | Fix W05-TEST-001 E2E locator (test-only) | Lane 2 |
| 4 | Mark SAM-W01-001 / SAM-W01-002 **decided** in decision log | Docs |
| 5 | `/harden review` → draft [RELEASE_READINESS.md](./RELEASE_READINESS.md) | Lane 4 |

---

## 12. Document index

| Doc | Role |
|-----|------|
| [workflows/01–05](./workflows/) | Full workflow maps |
| [BATCH_A_REVIEW_PACK.md](./BATCH_A_REVIEW_PACK.md) | Pre-fix review + P0 candidates |
| [BATCH_A_SALES_TO_TENDER_SUMMARY.md](./BATCH_A_SALES_TO_TENDER_SUMMARY.md) | Mapping-only summary (pre-P0) |
| **This doc** | Post-P0 hardening result |
| [WORKFLOW_TEST_MATRIX.md](./WORKFLOW_TEST_MATRIX.md) | Test ID status |
| [BUG_REGISTER.md](./BUG_REGISTER.md) | Drift + fix status |
| [30_DAY_HARDENING_TRACKER.md](./30_DAY_HARDENING_TRACKER.md) | Sprint control |

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-25 | Batch B parking lot refined; mapping priority W06→W07→W08→W09 |
| 2026-06-25 | Initial Batch A hardening result — P0 complete, regression logged, Batch B mapping cleared |
