# Batch B Review Pack

**Status:** 2026-06-25 — `/harden review` · Batch B mapping **complete** (W06–W09 accepted)  
**Purpose:** Turn completed Batch B mapping into an actionable review pack for Sam. **Candidates only — nothing implemented until explicit approval.**

**Related:** [workflows/06_RFQ_PACKAGE_SCOPE_EXTRACTION.md](./workflows/06_RFQ_PACKAGE_SCOPE_EXTRACTION.md), [workflows/07_RFQ_SEND_QUOTE_MATCHING.md](./workflows/07_RFQ_SEND_QUOTE_MATCHING.md), [workflows/08_QUOTE_COMPARISON_ACCEPT_QUOTE.md](./workflows/08_QUOTE_COMPARISON_ACCEPT_QUOTE.md), [workflows/09_TENDER_WIN_OPERATIONS_HANDOFF.md](./workflows/09_TENDER_WIN_OPERATIONS_HANDOFF.md), [BATCH_A_REVIEW_PACK.md](./BATCH_A_REVIEW_PACK.md), [30_DAY_HARDENING_TRACKER.md](./30_DAY_HARDENING_TRACKER.md), [WORKFLOW_TEST_MATRIX.md](./WORKFLOW_TEST_MATRIX.md), [BUG_REGISTER.md](./BUG_REGISTER.md), [SAM_DECISION_LOG.md](./SAM_DECISION_LOG.md)

---

## 1. Executive summary

Batch B covers the **RFQ-to-won-job** spine:

| Workflow | Plain English |
|----------|---------------|
| **W06** | Prepares RFQ packages and trade scopes. |
| **W07** | Sends RFQs and matches incoming quotes. |
| **W08** | Compares and accepts quotes. |
| **W09** | Turns a won tender into an operations project. |

**Core finding:** The Hub has **working pieces**, but the **RFQ package path**, **quote transaction path** (`rfqs`), and **tender win path** are **not fully aligned**.

Staff can send quotes, receive them, accept them, and mark a tender won — but data does not always flow consistently across Engine, Package Detail, Tender Detail, IMAP matcher, and win-finalize. Examples:

- Engine can send all emails then **fail to create** the package snapshot (W06-DRIFT-006).
- Email-only recipients have **no `rfqs` row** → no IMAP auto-match (W06-DRIFT-004 / W07-DRIFT-002).
- Tender accept updates `rfqs` but **not** linked `rfq_recipients` (W08-DRIFT-004).
- Win-finalize reads **`rfqs` only** — package-only accepts are invisible (W09-DRIFT-002).
- Resend **strips Message-ID** — thread matching falls back to weaker heuristics (W07-DRIFT-005).
- Batch PO after win passes **empty `projectId`** (W09-DRIFT-006).

**Hardening stance:** Map and test first. Smallest-safe P0 fixes only after Sam approves the P0 order below.

---

## 2. Current verified status

| Workflow | Map status | Test status | Fix status | Main risk | Ready for fixes? |
|----------|------------|-------------|------------|-----------|------------------|
| **W06** RFQ Package / Scope | **Accepted** | W06-API-07 **pass** (`--write`); UI retry smoke gap-documented | W06-DRIFT-006 **fixed** (P0-B1) | Package snapshot after engine send; dual paths | **Yes** — P0-B2 next |
| **W07** RFQ Send / Match | **Accepted** (SAM-W07-001–004 decided) | Partial — `test-imap-quote-match` 16 pass; W07-API-04/06/07 missing | Pre-tracker partial (threading, propagation) | Wrong-job match; Resend Message-ID; email-only gap | **Yes** — after P0-B3 tests |
| **W08** Quote Accept | **Accepted** (SAM-W08-001–003 decided) | Not started (W08-API planned) | None approved | `quoted_amount` vs `quote_amount`; accept sync gap | **Yes** — after P0-B2 tests |
| **W09** Tender Win / Handoff | **Accepted** | Not started (W09-API/E2E planned) | None approved | rfqs-only win; ops readiness gap; PO projectId | **Yes** — after P0-B4/B5 tests |

**Regression baseline (2026-06-25):** Batch A API/write + E2E green; W06 shape write 7✓.

---

## 3. Already fixed / verified

| Item | Status | Evidence |
|------|--------|----------|
| **W06-DRIFT-008** — Package UI camelCase shape fixed; W06-UI-02 passing | **Fixed** | `rfqPackageUtils.js`; `test:w06-shape:write` 7/0 |
| **BUILD-001** — RfqPackageDetail syntax blocker fixed | **Fixed** | `AddendumModal` `onChange` — build pass |
| **W05-TEST-001** — Tender Board E2E locator fixed | **Closed** | Test-only scope to Quotes ring |
| **Batch A + W06 verification suite green** | **Verified** | `test:batch-a` 14✓ · `test:batch-a:write` 22✓ · batch-a E2E 5✓/2 skip |

---

## 4. Open Batch B drifts

Grouped by workflow. P0/P1/P2 = recommended fix priority (**not approved**).

---

### W06 — RFQ Package / Scope Extraction

#### W06-DRIFT-001 — persistRfqs bypasses server job create path

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Symptom** | RfqEngine inserts job via browser Supabase when no extraction job id |
| **Root cause** | `persistRfqs()` client path vs POST `/api/jobs` server path |
| **Affected files** | `src/pages/RfqEngine.jsx`, `server/lib/jobsApiRoutes.mjs` |
| **Likely user impact** | Duplicate/inconsistent job rows; weak lead linkage |
| **Recommended action** | Route persistRfqs through POST `/api/jobs` |
| **Test ID** | W06-API-03 |
| **Priority** | **P1** |

#### W06-DRIFT-002 — Dual canonical paths (Engine vs Package Detail)

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Symptom** | Flow A creates package after send; Flow B edits existing package |
| **Root cause** | Two live RFQ workflows (SAM-W06-001 open) |
| **Affected files** | `RfqEngine.jsx`, `RfqPackageDetail.jsx`, `RfqPackageList.jsx` |
| **Likely user impact** | Staff use different paths; views diverge |
| **Recommended action** | Document both; do not merge during hardening |
| **Test ID** | W06-UI-01, W06-E2E-01 |
| **Priority** | **P2** |

#### W06-DRIFT-004 / W07-DRIFT-002 — Email-only recipients have no rfqs row / no IMAP match

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Symptom** | Ad-hoc email recipients in `rfq_recipients` only; inbound never auto-matches |
| **Root cause** | Package send creates `rfqs` only when `subcontractor_id` present; IMAP candidates from `rfqs` only |
| **Affected files** | `server/lib/rfqPackageRoutes.mjs`, `server/dev-api.mjs` |
| **Likely user impact** | Quotes land in unmatched queue or never match |
| **Recommended action** | Manual resolve only (SAM-W07-002 **decided**); document in training |
| **Test ID** | W06-API-08, RFQ-20 |
| **Priority** | **P1** |

#### W06-DRIFT-006 — Package snapshot can fail after emails sent

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Symptom** | All engine sends succeed but no `rfq_packages` row; success banner still shown |
| **Root cause** | `finalizeAllSentPackage()` POST package after send; failure calls `resetRfqSession()` |
| **Affected files** | `src/pages/RfqEngine.jsx`, `server/lib/rfqPackageRoutes.mjs` |
| **Likely user impact** | Staff believe RFQs packaged; Package Detail empty; board 0% |
| **Recommended action** | **P0-B1** — protect package create before/after send; fail loudly |
| **Test ID** | W06-API-07, RFQ-01 |
| **Priority** | **P0** |

---

### W07 — RFQ Send / Quote Matching

#### W07-DRIFT-004 — Resend sent mail not in mailbox Sent

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Symptom** | RFQs sent via Resend do not appear in Apple Mail / Gmail Sent |
| **Root cause** | `notifyMail.mjs` prefers Resend API |
| **Affected files** | `server/lib/notifyMail.mjs`, `server/lib/resendSend.mjs` |
| **Likely user impact** | Staff must use Hub `correspondence` to verify send |
| **Recommended action** | Document only — Hub SoT (SAM-W07-001 **decided**) |
| **Test ID** | W07-API-01 |
| **Priority** | **P2** |

#### W07-DRIFT-005 — Resend strips Message-ID

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Symptom** | Replies may not match `rfqs.sent_message_id` via thread headers |
| **Root cause** | Resend strips custom Message-ID; matcher uses fallbacks |
| **Affected files** | `server/lib/resendSend.mjs`, `server/lib/imapQuoteMatch.mjs` |
| **Likely user impact** | Valid quotes in unmatched queue |
| **Recommended action** | Document fallbacks (SAM-W07-004 **decided**); test before matcher change |
| **Test ID** | W07-API-04 |
| **Priority** | **P1** |

#### W07-DRIFT-006 — Ambiguous sender/address match

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Symptom** | Same sub email on multiple open RFQs → first candidate wins |
| **Root cause** | `matchBySenderSubcontractor` first-match ordering |
| **Affected files** | `server/lib/imapQuoteMatch.mjs` |
| **Likely user impact** | Quote on **wrong job/trade** |
| **Recommended action** | **P0-B3** — disambiguate or queue ambiguous matches |
| **Test ID** | W07-API-06, MATCH-09 |
| **Priority** | **P0** |

#### W07-DRIFT-007 — First IMAP poll skips backlog

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Symptom** | INBOX messages before first poll never auto-matched |
| **Root cause** | First poll sets cursor without processing backlog |
| **Affected files** | `server/dev-api.mjs` |
| **Likely user impact** | Historical quotes need manual resolve |
| **Recommended action** | Plan backlog import (SAM-W07-003 **decided**) |
| **Test ID** | W07-API-07 |
| **Priority** | **P1** |

#### W07-DRIFT-008 — Manual resolve does not import PDF/amount

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Symptom** | Resolve sets `received` without `quoted_amount` or PDF |
| **Root cause** | Resolve handler does not re-parse attachment |
| **Affected files** | `server/lib/jobsApiRoutes.mjs`, `server/dev-api.mjs` |
| **Likely user impact** | Weak accept/win path; Accept disabled on Tender Detail |
| **Recommended action** | Re-parse on resolve or require staff amount |
| **Test ID** | W08-API-02 |
| **Priority** | **P1** |

---

### W08 — Quote Comparison / Accept Quote

#### W08-DRIFT-001 — Accept requires quote_amount but IMAP writes quoted_amount

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Symptom** | Extracted amount visible; Accept disabled until staff copies amount |
| **Root cause** | `canToggle` checks `quote_amount > 0`; IMAP writes `quoted_amount` only |
| **Affected files** | `src/pages/TenderDetail.jsx`, `server/dev-api.mjs` |
| **Likely user impact** | Staff confusion; win with empty confirmed amount |
| **Recommended action** | **P0-B2** — warn on accept/win gap (SAM-W08-001 **decided**); no field semantics change without approval |
| **Test ID** | W08-API-02 |
| **Priority** | **P0** (document + warn within P0-B2) |

#### W08-DRIFT-004 — Tender accept does not sync package recipients

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Symptom** | Tender accept updates `rfqs` only; Package Detail may show `received` |
| **Root cause** | PATCH `/api/rfq/:id` has no propagation to `rfq_recipients` |
| **Affected files** | `server/lib/buildexactIntegrationRoutes.mjs` |
| **Likely user impact** | Stale package view; manual cross-check required |
| **Recommended action** | **P0-B2** — warn + manual cross-check (SAM-W08-003 **decided**) |
| **Test ID** | W08-API-04 |
| **Priority** | **P0** |

#### W08-DRIFT-006 — Win/cost intel skips empty quote_amount

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Symptom** | Accepted trade with only `quoted_amount` → no `cost_intelligence` row |
| **Root cause** | win-finalize skips null/`≤ 0` `quote_amount` |
| **Affected files** | `server/lib/module4Routes.mjs` |
| **Likely user impact** | Won job missing benchmark costs |
| **Recommended action** | **P0-B2** — surface gap before win; do not auto-use `quoted_amount` |
| **Test ID** | W09-API-02 |
| **Priority** | **P0** (within P0-B2 accept SoT safety) |

---

### W09 — Tender Win / Operations Handoff

#### W09-DRIFT-002 — Package-only accepted quotes invisible to win-finalize

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Symptom** | Package Detail accept not in win wizard or cost_intel |
| **Root cause** | Win reads `rfqs` only via `buildWinRowsFromRfqs` |
| **Affected files** | `src/pages/TenderDetail.jsx`, `server/lib/module4Routes.mjs` |
| **Likely user impact** | Operations missing committed trades |
| **Recommended action** | **P0-B2** — warn when package accepted but rfqs stale (SAM-W09-002 open) |
| **Test ID** | W09-API-05 |
| **Priority** | **P0** |

#### W09-DRIFT-004 — Lead not synced on tender win

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Symptom** | Job `won` but lead stays at `tender` |
| **Root cause** | win-finalize has no `leads` writes |
| **Affected files** | `server/lib/module4Routes.mjs` |
| **Likely user impact** | Sales pipeline wrong stage |
| **Recommended action** | Lead sync when `jobs.lead_id` set (SAM-W09-003 open) |
| **Test ID** | W09-API-04 |
| **Priority** | **P1** |

#### W09-DRIFT-006 — PO/procurement handoff incomplete (empty projectId)

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Symptom** | Batch PO passes empty `projectId`; po/issue returns 400 |
| **Root cause** | `issueBatchPos` reads non-existent `rfqs.project_id`; ignores win response `project.id` |
| **Affected files** | `src/pages/TenderDetail.jsx` |
| **Likely user impact** | Post-win PO banner fails silently for staff |
| **Recommended action** | **P0-B5** — pass `project.id` from win-finalize response |
| **Test ID** | W09-API-06 |
| **Priority** | **P0** |

#### W09-DRIFT-007 — Schedule/WHS/client portal readiness not seeded

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Symptom** | Win creates project only; no schedule, procurement, WHS, portal enable |
| **Root cause** | win-finalize does not write ops readiness tables/flags |
| **Affected files** | `server/lib/module4Routes.mjs`, Batch C modules |
| **Likely user impact** | Ops assumes job ready; manual setup required |
| **Recommended action** | **P0-B4** — post-win readiness checklist (read-only); no auto-seed |
| **Test ID** | W09-API-07, W09-E2E-01 |
| **Priority** | **P0** |

---

## 5. Recommended P0 fix order

**Strict order — do not implement until Sam approves each item and linked tests exist.**

### P0-B1 — Protect package creation before/after RFQ send

| Field | Value |
|-------|-------|
| **Why first** | Without a reliable package snapshot, W07–W09 have nothing consistent to match, display, or win against |
| **Workflow protected** | W06 → W07 → W08 → W09 |
| **Tests before code** | **W06-API-07** — package snapshot failure after send |
| **Screens/routes touched** | `RfqEngine.jsx` finalize path; `POST /api/rfq-packages` |
| **Do not change** | Engine wizard redesign; Package Detail merge; RFQ send logic; matcher |
| **Status** | **shipped** (2026-06-25) — W06-DRIFT-006 / DRIFT-006 fixed; `npm run test:w06-finalize:write` |

### P0-B2 — Make quote acceptance source-of-truth safe before win

| Field | Value |
|-------|-------|
| **Why second** | After packages exist and quotes match, accept state must be trustworthy before Mark Won |
| **Workflow protected** | W08 → W09 |
| **Tests before code** | **W08-API-03**, **W08-API-04**, **W09-API-05** — Phase 1 baseline (`npm run test:w08-accept:write`) |
| **Screens/routes touched** | TenderDetail win wizard (warn panel); `GET /api/tender/:jobId/accept-alignment`; `server/lib/rfqAcceptAlignment.mjs` |
| **Do not change** | Quote acceptance button logic; `quote_amount`/`quoted_amount` semantics; win-finalize; Package Detail accept UX; surface merge |
| **Status** | **shipped** (2026-06-25) — Phase 2 warn-only; `npm run test:w08-accept:write` (18 pass, 5 gap); Mark Won **not blocked** |

Covers: W08-DRIFT-001, W08-DRIFT-004, W08-DRIFT-006, W09-DRIFT-002, W09-DRIFT-010 (warn/document — not auto-fix accept rules).

### P0-B3 — Prevent wrong-job quote matching

| Field | Value |
|-------|-------|
| **Why third** | Data integrity — wrong quote on wrong job corrupts accept and win |
| **Workflow protected** | W07 → W08 → W09 |
| **Tests before code** | **W07-API-06** — ambiguous sender cannot wrong-match |
| **Screens/routes touched** | `server/lib/imapQuoteMatch.mjs`; unmatched queue surfacing |
| **Status** | **shipped** (2026-06-25) — Option A+B hybrid; `npm run test:w07-matcher` 24 pass |

Covers: W07-DRIFT-006 / DRIFT-010. Thread unchanged; ambiguous → `unmatched_quote_emails` via existing poll path.

**Planned files:** `imapQuoteMatch.mjs`, `rfqMatchTrace.mjs`, `test-imap-quote-match.mjs` — **not** mail transport, accept, win-finalize.

### P0-B4 — Warn on missing `quote_amount` before Mark Won

| Field | Value |
|-------|-------|
| **Status** | **shipped** (2026-06-25) — Option A+C hybrid; warn-only per SAM-W08-001 |

Covers: W08-DRIFT-001 (mitigated), W08-DRIFT-006 (mitigated), W09-DRIFT-003 (mitigated), W09-DRIFT-010 (mitigated).

**Shipped files:** `server/lib/rfqWinQuoteReadiness.mjs` · `GET /api/tender/:jobId/win-quote-readiness` · `TenderDetail.jsx` win wizard warning panel + per-row **Use extracted amount** · `scripts/batch-a/w08-win-quote-readiness.mjs` · `npm run test:w08-win-quote:write` (14 pass).

**Unchanged:** win-finalize validation · canToggle on RFQ cards · matcher · mail · PackageDetail · Tender Board.

### P0-B5 — Won-job operations readiness checklist (read-only)

| Field | Value |
|-------|-------|
| **Why fifth** | Win creates/enriches project but ops subsystems remain manual — staff need visible checklist, not automation |
| **Workflow protected** | W09 → Batch C handoff |
| **Tests before code** | **W09-API-07**, **W09-UI-05**, **W09-E2E-01**, **W09-API-04** (gap), **W09-API-06** (gap) |
| **Screens/routes touched** | **Primary:** `OperationsProjectDetail.jsx` banner (Option B). **Optional thin:** TenderDetail post-win link/summary (Option A minimal) |
| **Do not change** | win-finalize writes · auto procurement/schedule/WHS/portal · matcher · mail · accept logic · batch PO projectId fix (separate backlog) |

Covers: W09-DRIFT-001, W09-DRIFT-007. SAM-W09-001 (Option B — checklist banner; no auto-seed).

**Status (2026-06-25):** **shipped** — Option C+B; read-only checklist; no auto-seed.

**Shipped files:** `server/lib/opsReadiness.mjs` · `GET /api/projects/:projectId/ops-readiness` · `GET /api/jobs/:jobId/ops-readiness` · `OperationsProjectDetail.jsx` banner · TenderDetail post-win link · `scripts/batch-a/w09-ops-readiness.mjs` · `npm run test:w09-ops-readiness:write` (13 pass).

**Unchanged:** win-finalize writes · auto-seed · batch PO projectId fix · lead sync writes · matcher · mail · accept logic.

**Inspection summary (verified from code):**

| # | Question | Answer |
|---|----------|--------|
| 1 | After Mark Won | `executeWin` → win-finalize → wizard closes → `load()` → `winMessage` + optional batch PO banner |
| 2 | User lands | **Tender Detail** `/tender-manager/board/:jobId` — no auto-navigation |
| 3 | First ops screen | **`/operations/:projectId`** (`OperationsProjectDetail`) — manual navigation |
| 4 | Project row sufficient? | **Partial** — address, accepted_trades, client fields, contract value best-effort; schedule/proc/WHS/portal not seeded |
| 5 | Existing readiness UI? | **No** post-win checklist; Ops has reactive `insights` alerts only after data exists; batch PO banner is PO-only |
| 6 | Procurement auto? | **No** — manual `POST /api/procurement/jobs/:jobId/generate` |
| 7 | Batch PO / projectId? | `batch-po-check` works; **`issueBatchPos` still passes empty `projectId`** (W09-DRIFT-006) — checklist flags missing POs only |
| 8 | Schedule auto? | **No** — manual Schedule Manager; health shown only when tasks exist |
| 9 | WHS auto? | **No** — manual `/operations/:id/whs-setup` |
| 10 | Portal auto? | Client fields copied on win; **`portal_enabled` stays false** until manual enable |
| 11 | Lead sync? | **`jobs.lead_id` exists; win-finalize does not update `leads.stage`** (W09-DRIFT-004) |
| 12 | Smallest fix | Read-only `computeOpsReadiness` + Operations Project banner; no subsystem writes |

**Checklist items (14, all read-only):** project exists · job_id · client name · client email · address · contract value · accepted trades + cost_intel · lead won sync (if lead_id) · procurement items · POs for accepted trades · schedule tasks or start date · WHS profile · portal enabled · Dropbox path

### Backlog — Batch PO projectId fix (not P0-B5)

| Field | Value |
|-------|-------|
| **Drift** | W09-DRIFT-006 — `issueBatchPos` reads non-existent `rfqs.project_id` |
| **Fix** | Pass `fj.project.id` from win response (or resolve via `projects.job_id`) |
| **Test** | W09-API-06 |
| **Status** | **deferred** — separate from P0-B5 checklist scope |

---

## 6. Decisions needed from Sam

| Decision ID | Question | Options | Recommended hardening choice | Status | Blocks |
|-------------|----------|---------|------------------------------|--------|--------|
| **SAM-W06-001** | Canonical RFQ path? | A) Engine primary · B) Package primary · C) Merge | **A** — document both; Engine primary | **open** | P0-B1 scope |
| **SAM-W07-001** | Correspondence vs mailbox Sent? | A) Hub SoT · B) Gmail Sent · C) Resend+BCC | **A — Hub correspondence SoT** | **decided** | — |
| **SAM-W07-002** | Email-only matching? | A) Extend matcher · B) Stub sub · C) Manual only | **C — manual resolve only** | **decided** | — |
| **SAM-W07-003** | IMAP backlog policy? | A) Accept skip · B) One-time import · C) Cursor at 0 | **B — plan backlog import** | **decided** | W07-API-07 |
| **SAM-W07-004** | Resend Message-ID strategy? | A) Document fallbacks · B) Custom header · C) Gmail for RFQs | **A — document fallbacks only** | **decided** | P0-B3 scope |
| **SAM-W08-001** | Minimum accept before win? | A) quote_amount > 0 · B) quoted_amount OK · C) Block until package sync | **A — staff-confirmed quote_amount; cross-check package** | **decided** | P0-B2 |
| **SAM-W08-002** | Canonical accept surface? | A) Tender only · B) Package only · C) Both | **Tender Detail win path; Package workbench** | **decided** | — |
| **SAM-W08-003** | Tender accept → package sync? | A) Auto sync · B) Manual cross-check · C) Defer merge | **B — deferred; manual cross-check** | **decided** | P0-B2 |
| **SAM-W09-001** | Post-win readiness checklist? | A) Project only · B) Checklist banner · C) Auto-seed ops | **B — checklist banner; no auto-seed** | **open** | P0-B4 |
| **SAM-W09-002** | Package-only accepts at win? | A) Block win · B) Warn · C) Ignore | **B — warn prominently** | **decided** | P0-B2 **shipped** |
| **SAM-W09-003** | Lead sync on win? | A) Auto when lead_id · B) Manual · C) Win only | **A eventually; gap documented first** | **open** | P1 (not P0) |

---

## 7. Test plan before fixes

**Implement or expand before any Batch B P0 product code change:**

| Test ID | Purpose | P0 block |
|---------|---------|----------|
| **W06-API-07** | Package snapshot failure after send | P0-B1 |
| **W07-API-04** | Resend Message-ID mismatch behaviour | Document (supports P0-B3) |
| **W07-API-06** | Ambiguous sender cannot wrong-match | P0-B3 |
| **W08-API-02** | `quote_amount` / `quoted_amount` accept rule | P0-B2 |
| **W08-API-04** | Accept state rollup to package tables or documented gap | P0-B2 |
| **W09-API-02** | `cost_intelligence` seeded from accepted `quote_amount` | P0-B2 |
| **W09-API-05** | Accepted package quote in win handoff or documented gap | P0-B2 |
| **W09-API-07** | Operations readiness checklist | P0-B4 |
| **W09-E2E-01** | Tender Detail → Mark Won → Operations project visible | P0-B4 |
| **W09-API-06** | Batch PO / `projectId` readiness | P0-B5 |

**Existing scripts to extend:** `test-imap-quote-match.mjs`, `test-rfq-unmatched-resolve.mjs`, `run-w06-shape.mjs`, batch-a E2E folder.

---

## 8. Do-not-touch list

1. **No Tender Board redesign** (SAM-W05-006).
2. **No RFQ Engine / Package Detail merge** during hardening.
3. **No mail transport rewrite.**
4. **No broad matcher rewrite before tests.**
5. **No Buildxact write integration** beyond documented stub unless separately approved.
6. **No procurement / schedule / WHS / client portal automation** before W09 readiness decision (SAM-W09-001).
7. **No quote acceptance logic change** without explicit approval.
8. **No win-finalize change** without explicit approval per drift.
9. **No TenderDetail / PackageDetail redesign** — smallest-safe deltas only when approved.

---

## 9. Final recommendation

**Batch B is mapped and ready for a controlled P0 fix plan.**

- W06–W09 workflow docs complete and accepted.
- W07 + W08 Sam decisions **decided**; W09 checklist/package-warn/lead-sync **open**.
- Drift register: W06-DRIFT-001–008, W07-DRIFT-001–009, W08-DRIFT-001–008, W09-DRIFT-001–010.
- Batch A + W06 verification **green**.

**Do not start fixes until Sam approves the Batch B P0 order (P0-B1 → P0-B5).**

**Recommended next command after approval:**

```text
/harden fix P0-B1
```

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-25 | **P0-B5 plan** — ops readiness checklist (Option C+B); inspection verified; no code |
| 2026-06-25 | **P0-B4 closed** — quote_amount warn scope accepted |
| 2026-06-25 | `/harden review` — P0 order B4=checklist, B5=PO projectId |
| 2026-06-25 | Batch B review pack created — W06–W09 mapping complete |
