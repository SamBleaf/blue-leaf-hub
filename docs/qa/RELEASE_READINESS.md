# Release Readiness (Rolling)

**Date:** 2026-06-27 (TEST-DISCOVERY-WAVE-01)  
**Owner:** Forward scout — evidence from [TEST_DISCOVERY_WAVE_01.md](./TEST_DISCOVERY_WAVE_01.md)

---

| Surface | Gate | Notes |
|---------|------|-------|
| **Global production** | **NO-GO** | Journey E2E gaps; W18 manual UAT not run |
| **Staff internal — Batch A–C P0** | **CONDITIONAL GO** | batch-a 32/32 (last green); P0 fixes shipped |
| **Sales / lead / fee proposal** | **CONDITIONAL GO** | PLAYWRIGHT-SALES-GATE-LADDER-01 green; **DISC-002 accepted closed** (finance accept lead-link parity) |
| **RFQ / tender email matching** | **CONDITIONAL GO** | JOURNEY-B + WIN-FINALIZE green; DISC-WIN-01 re-run gap |
| **Ops / procurement / schedule / WHS** | **CONDITIONAL GO** | W10–W14 baselines green |
| **W18 internal automated UAT** | **GO** | API/security suite |
| **W18 supervised client pilot** | **APPROVED WITH CONTROLS — WAITING FOR VIABLE REAL JOB** | Sam 2026-06-27 — candidate: first signed building contract; no invite until contract signed + job active + Sam final go-ahead |
| **W18 client pilot (evidence base)** | **CONDITIONAL PASS** | W18-UAT-EXEC-01 + W18-STAFF-BROWSER-PILOT-01 (9/10 browser) |
| **W18 production (unsupervised)** | **NO-GO** | Legacy POST hardening + SOP gaps |
| **Workforce / W17** | **Not assessed (scout)** | Claude-owned |

**Open High (actionable):** **0**. **P1 / decision-gated:** W02-DRIFT-006, W05-STRUCTURAL-001.

**Recent closures:** JOB-SPINE-01 · W11-PO-SEC-01 · W01-CONVERT-01 · W03-FEE-LINK-01 · **DISC-002-FINANCE-FEE-LINK-01** · DRIFT-004-DOC-01 · W18-VOID-GUARD-PROBE-01 · **PLAYWRIGHT-SALES-GATE-LADDER-01** · **BLH-E2E-CLAUDE-001**.

**E2E walkthrough (2026-06-27):** Conditional Pass — [E2E_FULL_WALKTHROUGH_BLH-E2E-20260627-1041.md](./E2E_FULL_WALKTHROUGH_BLH-E2E-20260627-1041.md). **BLH-E2E-001** deferred Claude fix (soft-deleted projects in active views).

**Implementation:** **Paused** — discovery wave; Sam approves next test/fix batch.

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-27 | **Gate 8 ROLE-MATRIX-DEPLOYMENT-GATE-01 — CONDITIONAL PASS** (33/34): finance/sales/cost admin-only, schedule/workforce writes role-gated, ops staff-read, unauth locked. 1 finding **ROLE-MATRIX-01** (employee can read portal-admin overview → PORTAL-CROSSROLE violation, W18-locked, ready fix). `test:role-matrix-gate`. |
| 2026-06-27 | DISC-WIN-01 + BLH-E2E-001 fixed/test-green; _tmp_burst.mjs mail-hazard removed |
| 2026-06-27 | W18 pilot **on hold** — approved with controls; delayed until signed contract active in Hub (candidate: first building contract) |
| 2026-06-27 | Sam — W18 supervised client pilot **APPROVED WITH CONTROLS** (SAM-W18-PILOT-01); PORTAL-CROSSROLE + P1-W18-04 pilot policy decided |
| 2026-06-27 | W18-UAT-EXEC-01 — CONDITIONAL PASS (API 122+ green) |
| 2026-06-27 | BLH-E2E-CLAUDE-001 — regression rotation fix closed |
| 2026-06-27 | PLAYWRIGHT-SALES-GATE-LADDER-01 — sales stage browser regression green |
| 2026-06-27 | E2E walkthrough ingested — Conditional Pass; BLH-E2E-001 deferred |
| 2026-06-27 | W18-VOID-GUARD-PROBE-01 — DISC-REG-01 closed (fixture drift) |
| 2026-06-27 | TEST-REGRESSION-SUITE-01 — meta-runner W06–W18 |
| 2026-06-27 | SAM-W06-001 decided — Engine primary |
| 2026-06-27 | TEST-WIN-FINALIZE-01 — win handoff chain green |
| 2026-06-27 | W11-PO-SEC-01 accepted closed |
