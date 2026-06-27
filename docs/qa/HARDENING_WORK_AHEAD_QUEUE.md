# Hardening Work-Ahead Queue

**Date:** 2026-06-27  
**Role:** Forward scout — **TEST-DISCOVERY-WAVE-01** (audit-first; implementation paused)  
**Active implementation owner:** **Paused** — Sam approves next batch via [TEST_DISCOVERY_WAVE_01.md](./TEST_DISCOVERY_WAVE_01.md)

**Coordination:** Before editing shared QA docs, check `git status --short` and `git diff --name-only`. Product tree has active uncommitted edits — **do not modify** files Troubleshoot Agent is changing.

---

## 1. Work-ahead summary

| Item | Value |
|------|-------|
| **Active phase** | **TEST-DISCOVERY-WAVE-01** — test-first; no auto fix batches |
| **Open Critical** | **0** |
| **Open High (actionable)** | **0** |
| **P1 / decision-gated** | W02-DRIFT-006, W05-STRUCTURAL-001 |

### Next 3 recommended batches (test-first — do not implement without Sam)

| Rank | Batch | Type | Owner |
|------|-------|------|-------|
| 1 | ~~**TEST-JOURNEY-B-01**~~ | **done** | 22 pass / 0 fail / 3 gap |
| 2 | ~~**TEST-WIN-FINALIZE-01**~~ | **done** | 32 pass / 0 fail / 5 gap |
| 3 | ~~**SAM-W06-001-DECIDE**~~ | **done** | Option A — Engine primary |
| 4 | ~~**TEST-REGRESSION-SUITE-01**~~ | **done** | Meta-runner W06–W18 |
| 5 | ~~**PLAYWRIGHT-SALES-GATE-LADDER-01**~~ | **done** | 1/1 Playwright green; Batch A browser ladder |
| 6 | ~~**BLH-E2E-CLAUDE-001**~~ | **done** | Regression rotation race fixed; W10/W12/W13/W18 green in aggregator |
| 7 | **W18-SUPERVISED-CLIENT-PILOT-01** | **approved — on hold** | WAITING FOR VIABLE REAL JOB — [W18_SUPERVISED_CLIENT_PILOT_EXECUTION_PACK.md](./W18_SUPERVISED_CLIENT_PILOT_EXECUTION_PACK.md) |

### Release posture (rolling)

| Surface | Gate |
|---------|------|
| **Global production** | **NO-GO** |
| **Staff internal (Batch A–C P0 scope)** | **CONDITIONAL GO** |
| **RFQ/tender matching** | **CONDITIONAL GO** | JOURNEY-B + WIN-FINALIZE green; SAM-W06-001 decided |
| **Ops / procurement / schedule / WHS** | **CONDITIONAL GO** (P0-C closed; gaps documented) |
| **W18 internal automated UAT** | **GO** |
| **W18 supervised client pilot** | **APPROVED WITH CONTROLS — ON HOLD** | Wait for signed contract + active Hub job + Sam final go-ahead |
| **W18 production (unsupervised)** | **NO-GO** | Legacy POST hardening + SOP gaps |
| **Workforce / W17** | **Untouched by this scout pass** — Claude-owned; do not edit W17 docs |

---

## 2. Work-ahead queue (historical + current)

| Rank | Batch | Status | Notes |
|------|-------|--------|-------|
| — | JOB-SPINE-01 | **CLOSED** | W04/W06 job spine |
| — | W11-PO-SEC-01 | **CLOSED** | W11-SEC-02 pass |
| — | DRIFT-004-DOC-01 | **CLOSED** | Accepted manual-resolve gap |
| — | W01-CONVERT-01 | **CLOSED** | W01-API-08 pass |
| — | W03-FEE-LINK-01 | **CLOSED** | W03-API-05b pass |
| — | OUTCOME-STAMP-01 | **shipped** | Pending Sam acceptance |
| — | PTSA-WARNING-01 | **shipped** | Pending Sam acceptance |
| **1** | **TEST-JOURNEY-B-01** | **done (test-only)** | 22 pass / 0 fail / 3 gap — `test:journey-b-01:write` |
| **2** | ~~**SAM-W06-001-DECIDE**~~ | **done** | Option A — Engine primary; Package review/control |
| **3** | **TEST-REGRESSION-SUITE-01** | **done (test-only)** | `test:hardening-regression:write` |
| **4** | **PLAYWRIGHT-SALES-GATE-LADDER-01** | **done (test-only)** | `test:pw-sales-gate-ladder` — 1/1 pass |
| **5** | **BLH-E2E-CLAUDE-001** | **done (test-only)** | Stable E2E passwords; aggregator W10/W12/W13/W18 green |
| — | DISC-002-FINANCE-FEE-LINK-01 | **CLOSED** | Sam accepted closed 2026-06-27; W03-API-05c green |
| — | W18-STAFF-BROWSER-PILOT-01 | **accepted CONDITIONAL PASS** | Sam 2026-06-27 |
| — | W18-SUPERVISED-CLIENT-PILOT-01 | **approved — on hold** | WAITING FOR VIABLE REAL JOB — candidate: first signed building contract |
| — | W18-UAT-EXEC-01 | **CONDITIONAL PASS** | API preflight — [W18_UAT_EXEC_RESULT_20260627.md](./W18_UAT_EXEC_RESULT_20260627.md) |
| — | P1-JOBS-API-001 | **deferred** | JOB-SPINE-01 caveat |

**Explicitly not next:** W02 hard-block (SAM-W02-002 advisory); W17; W18 client invite / demo substitute pilot; W18 product fixes without named Sam batch.

### Recommended hardening while W18 pilot on hold

| Rank | Batch | Status | Notes |
|------|-------|--------|-------|
| 1 | **DISC-WIN-01** | shipped — awaiting Sam closure | Win-finalize `cost_intelligence` idempotency |
| 2 | **BLH-E2E-001** | shipped — awaiting Sam closure | Ops Gantt `_DELETED` filter |
| 3 | **BLH-E2E-CLAUDE-001** | **done** | Regression rotation race — stable E2E passwords |
| 4 | **SANDBOX-01** | approved — planning | Non-prod mail / Dropbox / Buildxact for RFQ / PO / win-finalize live-fire |

**W18-SUPERVISED-CLIENT-PILOT-01:** **APPROVED — WAITING FOR VIABLE REAL JOB** — do not execute until signed contract + active Hub job + Sam final go-ahead.

---

## 3. Test gaps (ranked — from TEST-DISCOVERY-WAVE-01)

| Workflow | Bug / gap | Missing test | Suggested test ID | Type | Write before fix? | Priority |
|----------|-----------|--------------|-------------------|------|-------------------|----------|
| W07 | RFQ send + threading | Outbound send not in batch-a | W07-API-01/02 | api | **Yes** | P0 |
| W05/W09 | Win/lose-finalize | No automated API tests | W05-API-01/02 | api | **Yes** | P0 |
| W03 | W03-DRIFT-003 wizard | Parse/send/DOCX untested | W03-API-01–04 | api | **Yes** | P1 |
| W06 | ~~SAM-W06-001~~ | Dual path E2E | W06-E2E-01, W06-UI-01 | e2e | **Yes** | P1 — Engine-primary operating model documented |
| W03 | W03-DRIFT-002 PTSA | Banner E2E | W03-UI-02 | e2e | gap-documented | P1 |
| W02 | W02-DRIFT-006 | Gate bypass logging | W02-API-03b | api | **Yes** | P1 |
| W08 | Accept + cost path | PATCH accept undertested | W08-API-03/04 | api | **Yes** | P1 |
| W18 | W18-UAT-01 | Manual pilot | W18-UAT-01 | manual | N/A | P0 (pilot gate) |

---

## 4. Sam questions (decision queue)

| Decision ID | Question | Why it matters | Recommended default | Risk if deferred |
|-------------|----------|----------------|---------------------|------------------|
| **P1-W18-04** | Legacy token POST on non-v2 projects — disable, JWT, or SOP? | W18 **production NO-GO** | **C** SOP + monitor legacy-only; **A** for unsupervised prod | Residual anonymous POST surface |
| **SAM-W01-004** | Mirror CRM interactions to lead timeline? | W01-DRIFT-006 CRM disconnect | **C** — link only, no duplicate rows | Disconnected CRM/lead views |
| **SAM-W06-001** | Engine vs Package canonical RFQ path | ~~W06-DRIFT-002~~ training drift | **Decided A** — Engine primary; Package review/control | SOP alignment post-hardening |
| **SAM-W05-001** | Board aggregate rfqs vs packages | W05-DRIFT-003 invisible package progress | Document first; **B** eventually | Board under-reports |
| **SAM-W03-004** | Canonical PTSA signed date field | Reporting split | **A** — `ptsa_signed_at` | Split date fields |
| **SAM-W11-002** | Admin on `/api/po/issue`? | PO security | **A — yes** | Non-admin PO issue |
| **SAM-W07-002** | Email-only IMAP match | DRIFT-004 | **Decided C** — **close in register** | Silent drift if not doc-closed |

**Stale / cleanup:** SAM decision log Batch B parking row still references old **W06-DRIFT-001 = camelCase** — superseded by W06-PARK-001 / W06-DRIFT-008 fixed. Narrow fix queued in doc drift §5.

---

## 5. Roadmap drift

| Issue | Status |
|-------|--------|
| Tracker / register High count | **Fixed 2026-06-27** — 0 actionable High; 3 P1/decision-gated |
| `RELEASE_READINESS.md` | **Updated** TEST-DISCOVERY-WAVE-01 |
| Duplicate `W06-DRIFT-002` ID | **Fixed 2026-06-27** — finalize failure = W06-DRIFT-006 only |
| OUTCOME-STAMP-01 / PTSA-WARNING-01 | Shipped — pending Sam acceptance closure |
| W18 manual UAT | **Parked** — W18-UAT-01 not executed |
| Implementation pace | **Paused** — discovery-first |

---

## 6. Recommended prompt for next batch (W18 on hold)

Copy after **Sam approval**:

```
/harden fix DISC-WIN-01
or
/harden fix BLH-E2E-001
or
Plan SANDBOX-01 — non-prod mail/Dropbox/Buildxact for live-fire journey
```

**Do not run until Sam confirms viable job:**

```
/harden uat W18-SUPERVISED-CLIENT-PILOT-01
```

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-27 | W18-SUPERVISED-CLIENT-PILOT-01 **on hold** — approved with controls; wait for signed contract + active Hub job |
| 2026-06-27 | Sam approval — DISC-002 accepted closed (batch-a 37/0); W18-UAT-EXEC-01 approved to proceed |
| 2026-06-27 | Claude 2nd-pass adds fix batches: A=DISC-002 (HIGH, finance accept lead-link), B=DISC-WIN-01 (win-finalize cost_intelligence idempotency), C=BLH-E2E-001 (Ops Gantt _DELETED filter); + Cursor test batch BLH-E2E-CLAUDE-001 (regression rotation race). See `E2E_CLAUDE_SECOND_PASS_BLH-E2E-CLAUDE-20260627-1139.md` |
| 2026-06-27 | Initial work-ahead queue — post JOB-SPINE-01 + OUTCOME-STAMP-01 |
