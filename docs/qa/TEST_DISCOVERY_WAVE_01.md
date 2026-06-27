# TEST-DISCOVERY-WAVE-01 — Hardening discovery & test-coverage audit

**Date:** 2026-06-27  
**Mode:** Audit-first · test-discovery · **implementation paused** unless Critical or Sam-approved fix batch  
**Owner:** Forward scout (Cursor)  
**Related:** [WORKFLOW_TEST_MATRIX.md](./WORKFLOW_TEST_MATRIX.md) · [BUG_REGISTER.md](./BUG_REGISTER.md) · [30_DAY_HARDENING_TRACKER.md](./30_DAY_HARDENING_TRACKER.md)

---

## 1. Discovery summary

### Current state

| Area | Status |
|------|--------|
| **Workflow mapping** | W01–W15 + W18 mapped; W16/W17 partial (W17 Claude-owned) |
| **Batch A–C P0 fixes** | Multiple batches shipped; batch-a write suite **32 pass** (last green run 2026-06-27) |
| **Open Critical** | **0** |
| **Open High (actionable bugs)** | **0** after reclassification (see §5) |
| **Open High (reclassified)** | **3** → P1 / decision-gated (W02-DRIFT-006, W05-STRUCTURAL-001, W06-DRIFT-002) |
| **Sam decisions blocking** | **SAM-W06-001** (canonical RFQ path) — recommended default A, not formally `decided` |
| **Implementation pace** | **Paused** — discovery before next fix batch |

### Accepted closures (confirmed / updated this wave)

| Batch | Doc status after wave |
|-------|----------------------|
| JOB-SPINE-01 | **Closed — accepted** |
| W11-PO-SEC-01 | **Closed — accepted** |
| DRIFT-004-DOC-01 | **Closed — accepted gap** |
| W01-CONVERT-01 | **Closed — accepted** |
| W03-FEE-LINK-01 | **Closed — accepted** |
| OUTCOME-STAMP-01 | **Shipped — pending Sam acceptance closure** (W02-API-04 green) |
| PTSA-WARNING-01 | **Shipped — pending Sam acceptance closure** (W03-API-07 green) |

### Biggest untested areas

1. **W03 fee proposal send/parse/generate** — only accept + PTSA paths have write tests; wizard Supabase writes untested (W03-DRIFT-003).
2. **W05 win/lose-finalize** — no automated API tests; board UI untested.
3. **W07 RFQ send + correspondence threading** — matcher tested; outbound send not in batch-a.
4. **W08 TenderDetail accept + win-finalize cost path** — alignment endpoint tested; PATCH accept and win side effects missing.
5. **End-to-end journeys A–G** — no single script chains Lead → RFQ → Win → Ops readiness.
6. **W16 Finance / W17 Command Centre** — not in scout scope; W17 has separate baselines (Claude-owned).
7. **W18 manual UAT** — automated suite green; pilot path **not executed**.

### Biggest regression risks

1. **Stale API server** — route changes require restart; caused false failures on W11/W03 batches.
2. **Dual RFQ paths (Engine vs Package)** — SAM-W06-001 open; training/SOP drift risk.
3. **Stage gate advisory (SAM-W02-002)** — API bypass documented but not logged server-side.
4. **FeeProposalWizard direct Supabase** — bypasses server validation (W03-DRIFT-003).
5. **P1-JOBS-API-001** — JOB-SPINE-01 caveat: client Dropbox PATCH not on server allowlist.
6. **Duplicate bug ID** — ~~`W06-DRIFT-002` used twice~~ **resolved 2026-06-27** — finalize failure = W06-DRIFT-006 only; canonical path retains W06-DRIFT-002.

### Highest-risk workflows (test coverage vs business impact)

| Rank | Workflow | Why |
|------|----------|-----|
| 1 | **W07 Send / match** | Money + subcontractor commitments; partial matcher coverage |
| 2 | **W05 / W09 Win handoff** | Ops blind spots; win-finalize undertested |
| 3 | **W03 Fee proposal full path** | Dual track PTSA + proposal; wizard untested |
| 4 | **W06 Engine finalize** | P0-B1 fixed; E2E extract→send→package still missing |
| 5 | **W18 Client portal** | Prod NO-GO; manual UAT parked |

### Implementation should remain paused?

**Yes** — until Sam reviews this wave and approves the next 1–3 test-first or fix batches. Exception: **Critical** only.

---

## 2. Test coverage table (W01–W18)

| Workflow | Current coverage | Missing / weak | Suggested test IDs | Type | Priority | Write before fix? |
|----------|------------------|----------------|-------------------|------|----------|-------------------|
| **W01** | API-01–03, 08 pass; SEC-03 gap | Stage activity, public validation, E2E create | W01-API-04/05, W01-SEC-01/02 | api | P2 | yes |
| **W02** | API-04 pass; API-03 gap (advisory bypass) | Server gate logging, pipeline UI gate | W02-API-03b (logging baseline) | api/regression | P1 | yes before any hard-block |
| **W03** | API-05/05b/07 pass | Parse, send, DOCX, UI PTSA visibility | W03-API-01–04, W03-UI-02/03 | api/e2e | P1 | yes |
| **W04** | API-05/06, job-spine pass | BX pull, tender CTA E2E | W04-API-03/04, W04-UI-01 | api | P1 | yes |
| **W05** | P0-A5/A6 pass | win/lose-finalize, board UI, archive | W05-API-01/02, W05-UI-01 | api/e2e | P1 | yes |
| **W06** | shape, finalize, package UI pass | Extract E2E, Engine wizard steps | W06-E2E-01, W06-UI-01 | e2e/api | P0 | yes |
| **W07** | matcher strict pass; API-05 gap | Outbound send + correspondence, IMAP cursor | W07-API-01, W07-API-07 | api/integration | P0 | yes |
| **W08** | accept-alignment pass | PATCH accept, win cost_intel | W08-API-01/05 | api | P1 | yes |
| **W09** | ops-readiness, alignment pass | win-finalize project/cost side effects | W09-API-01/02/03 | api | P1 | yes |
| **W10** | procurement baseline pass | schedule linkage on generate | W10-API-02 (dup row) | api | P2 | yes |
| **W11** | batch-po + SEC pass | UI watermark manual | W11-UI-01 manual | visual | P3 | no |
| **W12** | schedule auth pass | EOT lifecycle | W12-API-03 | api | P2 | yes |
| **W13** | site diary baseline pass | Client-visible photo path | W13-E2E-01 (with W18) | e2e | P2 | yes |
| **W14** | WHS baseline pass | — | — | — | P3 | — |
| **W15** | timesheet auth pass | Worker PWA E2E | W15-E2E-01 | e2e | P2 | yes (W17 owner) |
| **W16** | allocation baseline (Claude) | Finance invoice path | W16-FIN-* | api | P2 | scout defer |
| **W17** | multiple baselines (Claude) | — | — | — | — | **do not touch** |
| **W18** | portal API/security pass | **Manual UAT** | W18-UAT-01 | manual | P0 | N/A |

### Ranked test gap queue (top 15)

| Rank | Test ID | Workflow | Why |
|------|---------|----------|-----|
| 1 | **W18-UAT-01** | W18 | Pilot gate — manual only |
| 2 | **W07-API-01** | W07 | Outbound RFQ send + correspondence SoT |
| 3 | **W05-API-01** | W05/W09 | win-finalize side effects |
| 4 | **W06-E2E-01** | W06/W07 | Extract → send → package chain |
| 5 | **W08-API-01** | W08 | PATCH accept → rfqs |
| 6 | **W03-API-01–03** | W03 | Fee proposal wizard server path |
| 7 | **W02-API-03b** | W02 | Gate bypass diagnostic logging baseline |
| 8 | **W05-API-02** | W05 | lose-finalize |
| 9 | **JOURNEY-A-01** | W01–W04 | Lead → PTSA → convert → fee link chain test |
| 10 | **JOURNEY-B-01** | W06–W08 | Package send → match → accept |
| 11 | **W09-API-02** | W09 | cost_intelligence on win |
| 12 | **W07-API-07** | W07 | IMAP first-poll cursor |
| 13 | **W01-SEC-01** | W01 | Public enquiry validation |
| 14 | **W03-UI-02** | W03 | PTSA banner E2E (API covered; UI assertion) |
| 15 | **P1-JOBS-API-01-T** | W04/W06 | Server PATCH allowlist regression |

---

## 3. Regression review — recent closures

| Batch | Status | Test strength | Missing negative cases | Possible side effects | Verdict |
|-------|--------|---------------|------------------------|----------------------|---------|
| **JOB-SPINE-01** | Accepted | Strong (6/6 dedicated) | Dropbox PATCH still client-side | P1-JOBS-API-001 | **Accept** — watch P1 |
| **OUTCOME-STAMP-01** | Shipped | Good (W02-API-04) | No PATCH without body fields test | Stale server false fail | **Accept** — Sam closure pending |
| **W11-PO-SEC-01** | Accepted | Strong (W11-SEC-02 + admin path) | Supervisor role not tested | None known | **Accept** |
| **DRIFT-004-DOC-01** | Accepted gap | Doc + W06-API-08 gap | — | Manual-resolve only | **Accept** |
| **PTSA-WARNING-01** | Shipped | API strong; UI gap | W03-UI-02 E2E missing | Tender block interaction | **Watch** — Sam closure pending |
| **W01-CONVERT-01** | Accepted | Strong (W01-API-08) | Suburb-only lead path | None known | **Accept** |
| **W03-FEE-LINK-01** | Accepted | Good (W03-API-05b) | No finance `/accept` route parity | finance accept path untested | **Accept** — watch dual accept routes |

**Stale docs found:** RELEASE_READINESS still cited "8 open High"; HARDENING_WORK_AHEAD_QUEUE listed shipped batches as "next"; BUG_REGISTER summary lines for W01/W03/OUTCOME mixed pending/closed. **Corrected in this wave.**

---

## 4. Workflow walk-through (journeys A–G)

### A. Lead → qualification → fee proposal → PTSA → job/tender

| Step | Tested? | Gap / failure point |
|------|---------|---------------------|
| Lead create | W01-API-01/02 ✓ | Public spam (SEC-03 gap) |
| Qualify / stage move | W02-API-04 ✓ | Gate bypass advisory (W02-API-03 gap) |
| Fee proposal accept | W03-API-05b ✓ | Wizard save/send untested |
| PTSA sign | W03-API-05/07 ✓ | UI banner E2E (W03-UI-02) |
| Convert / address gate | W01-API-08 ✓ | — |
| **Chain test** | **Missing** | **JOURNEY-A-01** |

### B. Estimate → RFQ package → send → quote return → accept

| Step | Tested? | Gap |
|------|---------|-----|
| Job spine | JOB-SPINE ✓ | — |
| Package shape/finalize | W06 ✓ | E2E chain missing |
| Send | **Missing** | W07-API-01 |
| IMAP match | test:w07-matcher ✓ | Backlog import (ops) |
| Accept | alignment ✓ | W08-API-01 PATCH |

### C. Tender Board → win → ops readiness

| Step | Tested? | Gap |
|------|---------|-----|
| Board progress | P0-A5 ✓ | Package-only invisible (documented) |
| Win-finalize | **Missing** | W05-API-01 |
| Ops readiness | W09 ✓ | cost_intel untested |

### D. Site diary → client portal visibility

| Step | Tested? | Gap |
|------|---------|-----|
| Diary save | W13 ✓ | photo_paths drift documented |
| Portal photo filter | W18 automated ✓ | Manual UAT parked |

### E. PO issue → commitment → actuals

| Step | Tested? | Gap |
|------|---------|-----|
| PO issue admin | W11 ✓ | Employee 403 ✓ |
| Procurement register | W10 ✓ | Schedule link planned |
| Buildxact actuals | Partial | W15-API-03 gap if BX off |

### F. Worker timesheet → approval → Buildxact

| Step | Tested? | Gap |
|------|---------|-----|
| Auth gates | W15 ✓ | W17 Claude-owned |
| PWA E2E | **Missing** | W15-E2E-01 |

### G. W18 client portal manual UAT

| Step | Tested? | Gap |
|------|---------|-----|
| Automated API/security | ✓ | — |
| Manual pilot | **Not run** | W18-UAT-01 |

---

## 5. Bug register quality control

| Finding | Action |
|---------|--------|
| **W03-FEE-LINK-01** fixed but tracker said pending | → **Closed accepted** |
| **W01-CONVERT-01** accepted; register summary stale | → **Closed accepted** |
| **OUTCOME-STAMP / PTSA-WARNING** shipped, not Sam-closed | → **Pending acceptance** (do not force-close) |
| **Duplicate ID W06-DRIFT-002** | **Resolved 2026-06-27** — finalize failure = W06-DRIFT-006 only |
| **W02/W05/W06 "High"** | Reclassify per Sam decisions — not open actionable bugs (see below) |
| **W03-UI-02 matrix row** | Still "missing" — API covered; update to gap-documented/E2E deferred |
| **RELEASE_READINESS** | Stale High count — updated |

### Reclassified High items (not open actionable bugs)

| ID | New classification | Basis |
|----|-------------------|-------|
| **W02-DRIFT-006** | **P1 — accepted advisory gap** | SAM-W02-002 decided B; W02-API-03 gap-documents bypass |
| **W05-STRUCTURAL-001** | **P1 — design parked** | SAM-W05-006: no board redesign during hardening |
| **W06-DRIFT-002** (path) | **Blocked — Sam decision** | SAM-W06-001 open; recommend A (Engine primary) |

### New bug candidates (defer — register on approval)

| Proposed ID | Workflow | Severity | Symptom | Evidence | Test | Action |
|-------------|----------|----------|---------|----------|------|--------|
| DISC-001 | Cross | Med | Stale API causes false test failures | W11/W03 rerun history | Pre-test health check | defer |
| DISC-002 | W03 | Med | Finance accept route may not stamp fee_proposal_id | buildexact vs finance routes | W03-API-05c | defer |
| DISC-003 | W06 | Low | Duplicate W06-DRIFT-002 register ID | BUG_REGISTER grep | doc fix | **done 2026-06-27** |

---

## 6. Adversarial test ideas (by workflow)

| Workflow | Break-it tests |
|----------|----------------|
| W01 | Public enquiry without email; convert without address; duplicate CRM convert |
| W02 | PATCH stage enquiry→won; PATCH without auth |
| W03 | Accept fee proposal without job; mark-signed twice; PTSA without filename |
| W04 | RFQ package on address-pending job (409 baseline exists) |
| W05 | win-finalize with zero quote_amount; delete job with packages |
| W06 | Finalize after partial send failure; retry idempotency |
| W07 | Duplicate Message-ID; wrong sender; email-only recipient manual path |
| W08 | Accept with quoted_amount only; double accept |
| W09 | Win with package-only accepts; win without project |
| W11 | Employee PO issue (403 ✓); duplicate rfq_id (✓) |
| W12 | Employee schedule write (403 ✓) |
| W15 | Supervisor approve (403 ✓); double approve |
| W18 | Legacy JWT; void guard; cross-client photo leak |

---

## 7. Release readiness (evidence-based)

| Surface | Gate | Notes |
|---------|------|-------|
| **Global production** | **NO-GO** | Manual UAT gaps; journey E2E missing; Sam decisions open |
| **Staff internal — sales/tender (W01–W05)** | **CONDITIONAL GO** | P0 fixes + batch-a green; gate bypass advisory |
| **RFQ / tender (W06–W08)** | **CONDITIONAL GO** | Matcher + alignment green; send/win undertested |
| **Ops / procurement / schedule / WHS (W10–W14)** | **CONDITIONAL GO** | P0-C baselines green |
| **Sales / lead / fee proposal** | **CONDITIONAL GO** | Recent W01/W03 fixes; wizard path weak |
| **W18 internal automated** | **GO** | API/security suite |
| **W18 client pilot** | **CONDITIONAL GO** | W18-UAT-01 not executed |
| **W18 production** | **NO-GO** | P1-W18-04 + SOP |
| **Workforce / W17** | **Not assessed (scout)** | Claude-owned |

---

## 8. Recommended next 3 batches (do not implement)

### Batch 1 — **TEST-JOURNEY-B-01** (test-only)

| Field | Value |
|-------|-------|
| **Why** | Highest business risk: RFQ send → match → accept untested as chain |
| **Bugs** | W07 gaps, W08-API-01, DRIFT cross-cutting |
| **Tests first** | W07-API-01 skeleton, JOURNEY-B-01 chain, extend w06-finalize |
| **Files** | `scripts/batch-a/w07-send-baseline.mjs` (new), existing w06/w08 |
| **Risk** | Low (test-only) |
| **Sam decision** | No |

### Batch 2 — **TEST-WIN-FINALIZE-01** (test-only)

| Field | Value |
|-------|-------|
| **Why** | Win handoff drives ops/finance/portal |
| **Bugs** | W05-DRIFT-004/009, W09-DRIFT-003 |
| **Tests first** | W05-API-01/02, W09-API-02 |
| **Files** | `scripts/batch-a/w05-win-finalize.mjs` (new) |
| **Risk** | Low |
| **Sam decision** | No |

### Batch 3 — **SAM-W06-001-DECIDE** (doc + test plan)

| Field | Value |
|-------|-------|
| **Why** | Unblocks RFQ training/SOP and future path-merge fixes |
| **Bugs** | W06-DRIFT-002 (canonical path) |
| **Tests first** | Document Engine-primary SOP; W06-E2E-01 plan |
| **Files** | SAM_DECISION_LOG, W06 workflow §22 |
| **Risk** | None (doc) |
| **Sam decision** | **Yes** — confirm Option A (Engine primary) |

---

## 9. Sam decision required

**SAM-W06-001 — Canonical RFQ path during hardening**

| Option | Description |
|--------|-------------|
| **A (recommended)** | **Engine primary** — creation/send path; Package Detail = review/control |
| **B** | Package Detail primary workbench |
| **C** | Keep both documented; no unification during hardening |

**Risk if undecided:** Training/SOP drift, duplicated RFQ state, package/send bugs.

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-27 | Wave complete — batch-a 32/32 green; register/queue/readiness updated |
| 2026-06-27 | TEST-DISCOVERY-WAVE-01 initial audit — implementation paused |
