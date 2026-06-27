# Hardening Test Coverage — Forward Scout Audit

**Date:** 2026-06-27  
**Mode:** Audit-first · test-discovery · **implementation paused**  
**Role:** Cursor forward scout (docs/tests only — no product fixes)  
**Parent wave:** [TEST_DISCOVERY_WAVE_01.md](./TEST_DISCOVERY_WAVE_01.md)  
**Coordination:** Troubleshoot Agent paused on normal implementation batches until Sam approves next batch.

---

## 1. Missing tests by workflow

**Evidence:** [WORKFLOW_TEST_MATRIX.md](./WORKFLOW_TEST_MATRIX.md) · batch-a runner (`run-batch-a.mjs` = W01–W05 only) · standalone scripts in `scripts/batch-a/` and `scripts/test-*.mjs`.

| Workflow | Pass / partial | Missing / gap | Top priority gaps | Suggested test IDs |
|----------|----------------|---------------|-------------------|-------------------|
| **W01** Lead / CRM | API-01–03, 08; E2E-02 | 10+ rows | Public validation (SEC-01/02); stage activity (API-04/05); E2E create | W01-SEC-01/02, W01-API-04/05 |
| **W02** Qualification | API-04; API-03 gap-doc | 8 rows | Gate logging baseline before any hard-block | W02-API-03b |
| **W03** Fee / PTSA | API-05/05b/07; UI-02 gap-doc | 7 rows | Parse, send, DOCX, wizard Supabase path | W03-API-01–04, W03-UI-01 |
| **W04** Job setup | API-01/02/05/06; UI-02 | 5 rows | BX estimate pull; parse XLSX job resolve | W04-API-03/04 |
| **W05** Tender Board | P0-A5/A6; UI-02; E2E partial | 8 rows | **win/lose-finalize**; board UI load | **W05-API-01/02**, W05-UI-01 |
| **W06** RFQ package | API-03/07; UI-02; shape pass | 6 rows | PDF extract; Engine send E2E chain | W06-API-01, W06-E2E-01 |
| **W07** Send / match | Matcher 16 pass; resolve partial | 5 rows | **Engine outbound send**; thread propagation E2E | **W07-API-01**, RFQ-04 |
| **W08** Accept quote | Alignment pass; win-quote pass | 4 rows | **PATCH accept on TenderDetail**; accept rollup | **W08-API-01**, W08-API-04 |
| **W09** Win handoff | Readiness + alignment strong | 3 rows | **win-finalize side effects** (project, cost_intel) | **W09-API-01**, W09-E2E-01 |
| **W10** Procurement | 6/6 baseline pass | 2 planned | Schedule linkage on generate | W10-API-02 (planned) |
| **W11** PO | 15 pass + 1 partial | 0 critical | PDF watermark manual only (accepted) | W11-UI-01 manual |
| **W12** Schedule | Auth 4/4 pass | EOT planned | EOT lifecycle write | W12-API-03 |
| **W13** Site diary | 8/8 baseline pass | 0 P0 | photo_paths drift documented | — |
| **W14** WHS | 7/7 baseline pass | 0 P0 | — | — |
| **W15** Timesheets | Auth 19 pass; BX partial | E2E planned | Worker PWA smoke | W15-E2E-01 |
| **W16** Allocation | 14 pass | — | Finance path not scout scope | — |
| **W17** Workforce | Claude-owned | P2–P8 planned | **Scout: do not edit** | Claude |
| **W18** Portal | Automated suite green | Manual UAT | Pilot smoke not executed | **W18-UAT-01** |

**Cross-cutting RFQ rows still missing:** RFQ-01, RFQ-02, RFQ-03, **RFQ-04** (engine send), RFQ-14, **RFQ-15** (accept), **RFQ-16** (win-finalize), RFQ-17, RFQ-22; MATCH-14–19.

**Coverage shape:** Batch A (W01–W05) is in `npm run test:batch-a:write`. W06–W18 run via **separate npm scripts** — unified meta-runner: **`npm run test:hardening-regression:write`** (TEST-REGRESSION-SUITE-01).

---

## 2. Untested high-risk handoffs

Ranked by business impact × test gap.

| Rank | Handoff | Steps tested | Gap | Failure mode | Test to write first |
|------|---------|--------------|-----|--------------|---------------------|
| 1 | **RFQ send → inbound match → accept** | Matcher ✓; package send partial | Engine send; PATCH accept; chain | Orphan rfqs; wrong quote on board | **TEST-JOURNEY-B-01** (W07-API-01 + W08-API-01) |
| 2 | **Accept → win-finalize → project + cost_intel** | Alignment warnings ✓ | win-finalize POST untested | Ops blind; cost_intel empty | **TEST-WIN-FINALIZE-01** (W05-API-01, W09-API-01) |
| 3 | **Fee proposal accept → tender dual-track** | W03-API-05b ✓ | Finance accept route parity unconfirmed | `fee_proposal_id` missing on alt path | W03-API-05c |
| 4 | **PTSA signed → job / tender handoff** | W03-API-05/07 ✓ | UI banner E2E; wizard direct Supabase | Staff proceeds without address | W03-UI-02 E2E (gap-doc OK for now) |
| 5 | **Lead convert → RFQ package create** | W01-API-08, W04-API-05 ✓ | Full journey script | Address-pending slip-through | JOURNEY-A-01 |
| 6 | **Win → procurement generate** | W10-API-06 (intentional no auto) ✓ | Staff manual step untested E2E | Empty procurement register | W09-E2E-01 extend |
| 7 | **Site diary / photos → client portal** | W13 + W18 automated ✓ | Manual pilot UAT | Client sees wrong photos | W18-UAT-01 |
| 8 | **Timesheet approve → Buildxact actuals** | W15 auth ✓ | BX sync when unconfigured | Silent skip | W15-API-03 env-gated |
| 9 | **PO issue → supplier commitment** | W11 full path ✓ | End-to-end with finance actuals | — | Lower priority |

---

## 3. Recent closure regression risks

| Batch | Test strength | Missing negative case | Side-effect watch | Verdict |
|-------|---------------|----------------------|-------------------|---------|
| **JOB-SPINE-01** | Strong (dedicated 6/6) | Client Dropbox PATCH | P1-JOBS-API-001 | **Accept** — watch P1 |
| **OUTCOME-STAMP-01** | Good (W02-API-04) | PATCH without lost_reason | Stale API false fail | **Accept** — Sam closure pending |
| **W11-PO-SEC-01** | Strong (W11-SEC-02) | Supervisor role | None known | **Accept** |
| **DRIFT-004-DOC-01** | Doc + gap baseline | — | Manual-resolve only forever | **Accept** |
| **PTSA-WARNING-01** | API strong; UI gap-doc | Double mark-signed; E2E banner | Tender block UX | **Watch** — Sam closure pending |
| **W01-CONVERT-01** | Strong (W01-API-08) | Suburb-only lead | None known | **Accept** |
| **W03-FEE-LINK-01** | Good (W03-API-05b) | Finance `/accept` route | Dual accept paths | **Accept** — watch W03-API-05c |

**Operational regression:** Route changes require API restart on 8787 before batch-a — false failures if stale (DISC-001).

---

## 4. New bug candidates

Register only on Sam approval — discovery notes below.

| Proposed ID | Workflow | Sev | Symptom | Evidence | Recommended test | Action |
|-------------|----------|-----|---------|----------|------------------|--------|
| **DISC-001** | Cross | Med | Stale API → false test failures | W11/W03 rerun history | Pre-flight health in runners | defer |
| **DISC-002** | W03 | Med | Finance accept may not stamp `fee_proposal_id` | Dual accept routes in code | W03-API-05c | defer — test first |
| ~~DISC-004~~ | W05/W09 | Med | win-finalize untested | TEST-WIN-FINALIZE-01 | — | **tested 2026-06-27** |
| **DISC-WIN-01** | W05/W09 | Med | win-finalize re-run duplicates `cost_intelligence` | `w05-win-finalize.mjs` idempotency test | upsert or skip-if-exists | **defer** — fix batch candidate for Claude |
| ~~**DISC-005**~~ | Cross | Low | No unified regression command for W06–W18 | TEST-REGRESSION-SUITE-01 | `test:hardening-regression:write` | **closed 2026-06-27** |
| ~~**DISC-REG-01**~~ | W18 | Med | Regression suite: client A home 403 in void-guard | W18-VOID-GUARD-PROBE-01 | E2E preflight in void-guard test | **closed 2026-06-27 — stale E2E fixture, not product bug** |
| ~~**BLH-E2E-CLAUDE-001**~~ | Cross | Med | Regression aggregator rotation race | BLH_E2E_CLAUDE_001 doc | stable E2E passwords | **closed 2026-06-27** |
| ~~DISC-003~~ | W06 | Low | Duplicate W06-DRIFT-002 ID | BUG_REGISTER | doc | **closed** 2026-06-27 |

---

## 5. Recommended next 3 batches

**Do not implement without Sam approval.**

### Batch 1 — ~~TEST-JOURNEY-B-01~~ **done (2026-06-27)**

| Field | Value |
|-------|-------|
| **Result** | **22 pass / 0 fail / 3 gap** — `npm run test:journey-b-01:write` |
| **Scripts** | `w07-send-baseline.mjs`, `journey-b-rfq-money-path.mjs`, `run-test-journey-b-01.mjs` |
| **Gaps documented** | Live IMAP poll; stale_package alignment after tender-only accept; W08-DRIFT-005 rollup |

### Batch 2 — ~~TEST-WIN-FINALIZE-01~~ **done (2026-06-27)**

| Field | Value |
|-------|-------|
| **Result** | **32 pass / 0 fail / 5 gap** — `npm run test:win-finalize-01:write` |
| **Scripts** | `w05-win-finalize.mjs`, `journey-win-finalize.mjs`, `run-test-win-finalize-01.mjs` |
| **Gaps** | W09-DRIFT-004 lead sync; W09-DRIFT-007 ops not auto; DISC-WIN-01 CI re-run duplicate |

### Batch 3 — ~~SAM-W06-001-DECIDE~~ **done (2026-06-27)**

| Field | Value |
|-------|-------|
| **Result** | Option A — Engine primary; Package Detail review/control only |
| **Docs** | SAM_DECISION_LOG, W06 workflow §22, BUG_REGISTER W06-DRIFT-002 reclassified |

### Batch 4 — ~~TEST-REGRESSION-SUITE-01~~ **done (2026-06-27)**

| Field | Value |
|-------|-------|
| **Result** | Meta-runner `scripts/batch-a/run-hardening-regression.mjs` |
| **Command** | `npm run test:hardening-regression:write` (+ optional `:write:chains`) |
| **Excluded** | W17; W18 Playwright UI (gap-documented) |

**Sam acceptance queue (not batches):** OUTCOME-STAMP-01 · PTSA-WARNING-01 closure.

---

## 6. Release readiness update

| Surface | Gate | Change since last scout pass |
|---------|------|------------------------------|
| **Global production** | **NO-GO** | Unchanged — journey E2E + W18 UAT |
| **Staff internal Batch A–C P0** | **CONDITIONAL GO** | batch-a 32/32 confirmed |
| **Sales / lead / fee proposal** | **CONDITIONAL GO** | W01/W03 fixes closed; wizard undertested |
| **RFQ / tender** | **CONDITIONAL GO** | JOURNEY-B + WIN-FINALIZE green; win re-run CI gap |
| **Ops / procurement / schedule / WHS** | **CONDITIONAL GO** | W10–W14 baselines green |
| **W18 internal automated** | **GO** | Unchanged |
| **W18 client pilot** | **CONDITIONAL GO** | W18-UAT-01 still not run |
| **W18 production** | **NO-GO** | P1-W18-04 + SOP |
| **Workforce / W17** | **Not assessed** | Claude-owned |

**Open High (actionable):** **0**. **P1 / decision-gated:** W02-DRIFT-006, W05-STRUCTURAL-001.

---

## 7. Doc drift found (this pass)

| Location | Issue | Fix |
|----------|-------|-----|
| `WORKFLOW_TEST_MATRIX` W03-API-06 | Row still **missing** — covered by W03-API-05b | **Fixed** → points to 05b |
| `WORKFLOW_TEST_MATRIX` RFQ-20 | Still says "DRIFT-004 open" | **Fixed** → accepted gap |
| `HARDENING_WORK_AHEAD_QUEUE` §1 | RFQ row said "DRIFT-004 doc closure pending" | **Fixed** — closed |
| `30-day_hardening_roadmap_*.plan.md` | RFQ phases 2–5 still **pending** in frontmatter | **Note only** — plan file stale vs qa/ reality; do not auto-edit plan |
| `BUG_FIXING_MISSION_PLAN` §1 | May still cite old High counts in body | Verify on next read — summary block updated |
| Batch regression | ~~No single `npm run test:all-hardening`~~ | **Fixed** — `test:hardening-regression:write` |

---

## Troubleshoot Agent coordination note

```
Implementation: PAUSED
Allowed: test skeletons, gap-documented baselines, QA doc updates
Not allowed: product fixes, W17, W18 product, schema, commits, deploys
Next approved work: W18-UAT-EXEC-01 or Sam-approved fix batch pending Sam review of TEST-REGRESSION-SUITE-01
```

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-27 | **BLH-E2E-CLAUDE-001 closed** — regression rotation fix; see BLH_E2E_CLAUDE_001_REGRESSION_ROTATION_FIX.md |
| 2026-06-27 | TEST-REGRESSION-SUITE-01 meta-runner; SAM-W06-001 decided |
