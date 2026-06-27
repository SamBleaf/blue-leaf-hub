# ChatGPT Review Summary — Batch C Hardening Update

**Date:** 2026-06-25  
**Package:** `blue-leaf-hub-hardening-update-batch-c-corrected-2026-06-25.zip`  
**Scope:** Batch B complete + Batch C mapping + P0-C1 + W11 PO hardening + P0-C2 + Batch C corrections

---

## 1. Current status

- **Batch A:** Green — P0-A1–A6 shipped; regression API + write + E2E pass.
- **Batch B:** Complete — P0-B1–B5 shipped (package finalize, accept alignment, matcher, win-quote readiness, ops readiness).
- **Batch C mapping:** W10–W15 mapped (`docs/qa/workflows/10_*` … `15_*`); `BATCH_C_REVIEW_PACK.md` current.
- **Test artifact cleanup:** Policy + two-tier dry-run utility; **approved prefix `BLH TEST`** for new write tests; legacy prefixes detection-only.
- **P0-C1:** **Closed** — batch PO `projectId` fix (W11-DRIFT-001 / W09-DRIFT-006).
- **W11 PO refinement:** **Closed** — PDF scope/quote reference, quote email attach (W11-DRIFT-007/008), brand wordmark header (logo-black.png).
- **P0-C2:** **Closed** — schedule write role gate (W12-DRIFT-002); technical review accepted.
- **P0-C3:** **Not started** — workforce approve permission (W15).
- **P0-C4:** **Not started** — procurement generate baseline/tests (W10).
- **P0-C5:** **Not started** — WHS profile + induction smoke (W14).

---

## 2. Completed since last review zip

### Test artifact cleanup policy

- **Files changed:**
  - `docs/qa/TEST_ARTIFACT_CLEANUP_POLICY.md`
  - `scripts/cleanup-test-artifacts.mjs`
  - `scripts/lib/testArtifactPrefixes.mjs`
  - `docs/qa/test-artifact-cleanup-log.md`
  - `package.json` — `test:cleanup-artifacts`
- **Dry-run command:** `npm run test:cleanup-artifacts`
- **Dry-run result (latest):** safe canonical + legacy review-only tiers; see `test-artifact-cleanup-log.md`
- **Approved prefix:** **`BLH TEST`** via `buildTestJobAddress()` — do **not** use `__BATCH_A__`, `BATCHA`, `__E2E__`, `DEBUG`, etc. for new tests
- **Legacy prefixes:** `BATCHA`, `BATCH A`, `DEBUG2`, timestamp+`TEST STREET`, etc. — detection/review/cleanup only; require legacy delete flags
- **Any deletion performed:** **No** (dry-run only)
- **Manual cleanup still required:** Optional — safe canonical: `--confirm`; legacy: `--include-legacy-test-names --confirm-legacy "DELETE LEGACY TEST FOLDERS"`

### P0-C1 — Batch PO projectId + full PO issue

- **Product files changed:**
  - `src/pages/TenderDetail.jsx` — `resolveBatchPoProjectId()` from `projects.job_id`
  - `server/lib/poProjectResolve.mjs` (new)
  - `server/lib/module4Routes.mjs` — `/api/po/issue` projectId resolve + rfq idempotency
  - `server/lib/opsReadiness.mjs` — removed broken batch PO path wording
- **Tests changed:**
  - `scripts/batch-a/w11-batch-po.mjs`, `run-w11-batch-po.mjs`
  - `npm run test:w11-batch-po:write`
- **Docs changed:** BUG_REGISTER (W11-DRIFT-001, W09-DRIFT-006), WORKFLOW_TEST_MATRIX, BATCH_C_REVIEW_PACK, 30_DAY_HARDENING_TRACKER
- **Verification:** W11-API-01–04, W09-API-06 pass (`test:w11-batch-po:write`)
- **Remaining gaps:** TenderDetail batch PO UI smoke (W11-UI-01 manual); batch PO path still omits `loadCompanySettings()` company block (ABN empty unless Operations PO path)

### P0-C1 correction — PO PDF 502 (W11-DRIFT-006)

- **Product files changed:** `server/lib/poPdfKit.mjs` — `Helvetica-Oblique` instead of invalid `.italic()`
- **Verification:** W11-API-03 requires HTTP 200 + full PO row (no 502)

### W11 PO PDF / quote attachment / brand refinement

- **Product files changed:**
  - `server/lib/poPdfKit.mjs` — scope conditions, quote reference block, wordmark header (`public/brand/logo-black.png`), leaf watermark (`icon-blue.png`), fixed title y=142
  - `server/lib/poQuoteAttachment.mjs` (new) — resolves quote from `rfqs.quote_pdf_path` / URLs
  - `server/lib/module4Routes.mjs` — PO email attachments + `po_email_attachment_count` + quote flags (issue logic unchanged)
- **Tests changed:** `scripts/batch-a/w11-batch-po.mjs` — W11-API-05/06/07, BLH TEST markers, local sample PDF
- **Docs changed:** W11-DRIFT-007/008 closed in BUG_REGISTER, WORKFLOW_TEST_MATRIX
- **Verification:** `test:w11-batch-po:write` — 14 pass, 1 gap (manual watermark/readability)
- **Remaining gaps:** W11-UI-01 manual smoke; W11-API-06 full attach proof depends on RFQ with downloadable quote in env; combined PO+quote PDF deferred
- **Sample PDF path:** `scripts/output/w11-po-sample.pdf` (**excluded from zip** — local synthetic BLH TEST fixture only; open locally for visual review)
- **Brand correction status:** **Complete** — wordmark header; no leaf-only icon in header

### P0-C2 — Schedule write role gate

- **Product files changed:** `server/lib/scheduleRoutes.mjs` — `requireScheduleWrite = [requireAuth, requireRole("admin", "supervisor")]`
- **Routes protected (16 write endpoints):**
  - POST `/api/schedule/generate`
  - POST/PUT/DELETE `/api/schedule/templates` (+ `:id`)
  - POST `/api/schedule/:projectId/task`, `load-template`, `save-as-template`, `buildexact-match`
  - PATCH/DELETE `/api/schedule/task/:id`
  - POST/DELETE `/api/schedule/:projectId/baseline` (+ lock)
  - POST/PATCH `/api/schedule/:projectId/eot` (+ `:eotId/apply`)
  - POST `/api/schedule/save-analysis-pdf` (external Dropbox filing — Batch C correction)
- **Auxiliary routes (unchanged gate unless noted):**
  - POST `/api/schedule/analyse` — AI read; `requireAuth` only
  - POST `/api/schedule/export-gantt-pdf` — download only; `requireAuth` only
  - POST `/api/schedule/task-advice` — AI read; `requireAuth` only
- **Roles allowed:** `admin`, `supervisor`
- **Roles blocked:** `employee` (403; no DB mutation on denied writes)
- **Tests changed:**
  - `scripts/batch-a/w12-schedule-auth.mjs`, `run-w12-schedule-auth.mjs`
  - `npm run test:w12-schedule-auth:write`
- **Docs changed:** W12-DRIFT-002 closed, WORKFLOW_TEST_MATRIX, BATCH_C_REVIEW_PACK, 30_DAY_HARDENING_TRACKER
- **Verification:** 12 pass — W12-SEC-01/02, W12-API-01/02
- **Remaining gaps:** W12-DRIFT-004 typed dependency cascade; critical path; EOT behaviour beyond access control; schedule generate/baseline/EOT dedicated API tests beyond auth

### Batch C review corrections (post-zip)

- **Cleanup legacy matchers:** Two-tier classification (safe canonical vs legacy review-only); `npm run test:cleanup-matchers`
- **Schedule `save-analysis-pdf` gate:** `POST /api/schedule/save-analysis-pdf` now uses `requireScheduleWrite` (external Dropbox filing)
- **Route classification documented:** `analyse` / `task-advice` = AI read-only; `export-gantt-pdf` = download only; `save-analysis-pdf` = supervisor/admin write
- **W11-DRIFT-009 logged:** PO row + email idempotency follow-up (open, not fixed)
- **Zip packaging rule:** Future review zips must include `public/brand/logo-black.png` + `icon-blue.png`

### Doc prefix correction (post-review)

- **Approved for new write tests:** **`BLH TEST`** only (`buildTestJobAddress()`)
- **Legacy only (do not create new):** `__BATCH_A__`, `BATCHA`, `BATCH A`, `__E2E__`, `DEBUG`, `DEBUG2`, `__DRYRUN`, `__DEMO`
- **Corrected zip:** `blue-leaf-hub-hardening-update-batch-c-corrected-2026-06-25.zip` includes `public/brand/`

---

## 3. Regression results

| Command | Result | Summary |
|---------|--------|---------|
| `npm run test:w12-schedule-auth:write` | pass | 12 pass, 0 fail |
| `npm run test:w11-batch-po:write` | pass | 14 pass, 0 fail, 1 gap |
| `npm run build` | pass | Vite + PWA OK; chunk size warning |
| `npm run test:cleanup-artifacts` | pass | Dry-run: 1 candidate, 0 deleted |
| `npm run test:w09-ops-readiness:write` | pass | 13 pass, 2 gap |
| `npm run test:w08-win-quote:write` | pass | 14 pass, 1 gap |
| `npm run test:w07-matcher` | pass | 24 pass, 0 fail |
| `npm run test:w08-accept:write` | pass | 18 pass, 5 gap |
| `npm run test:w06-finalize:write` | pass | 9 pass, 1 gap |
| `npm run test:w06-shape:write` | pass | 7 pass, 2 gap |
| `npm run test:batch-a` | pass | 14 pass, 13 skip, 10 gap |
| `npm run test:batch-a:write` | pass | 22 pass, 6 gap |
| `npm run test:e2e -- e2e/tests/workflows/batch-a` | pass | 5 pass, 2 skip |

Full detail: `docs/qa/HARDENING_UPDATE_TEST_LOG_BATCH_C_2026-06-25.md`

---

## 4. Still open / not fixed

- **P0-C3 / P0-C4 / P0-C5:** Not started.
- **W11:** Batch PO UI smoke; company/ABN on TenderDetail batch path; manual PDF review; optional quote attach env fixture.
- **W12:** W12-DRIFT-004 cascade; critical path; EOT lifecycle tests beyond role gate.
- **W11-DRIFT-003:** `/api/po/issue` admin-only role gate (parking).
- **W11-DRIFT-009:** PO email failure / idempotency (open follow-up).
- **Cleanup:** 1 safe canonical + 5 legacy Dropbox folders (dry-run); legacy delete needs explicit flags.
- **Portal / workforce / procurement / WHS:** Out of Batch C P0 scope; uncommitted portal changes exist in working tree but not part of this P0 pass.

---

## 5. Intentional non-changes

Confirmed **not** changed in Batch C P0 scope:

- No auto-seed procurement / schedule / WHS / portal / timesheets on win
- No schedule redesign, dependency cascade fix, critical-path redesign
- No EOT behaviour redesign beyond write-route role gate
- No procurement engine redesign
- No purchase order numbering / issue semantics redesign (only PDF + projectId + quote attach)
- No Buildxact integration redesign
- No quote acceptance / win-finalize / matcher / mail transport changes
- No new modules
- No destructive test artifact cleanup (`--confirm` not run)

---

## 6. Next recommended action

1. **ChatGPT full review** of this zip + summary.
2. **Optional:** Sam manual review of `scripts/output/w11-po-sample.pdf` (local only).
3. **Optional:** Approve `npm run test:cleanup-artifacts -- --confirm` to remove 1 BLH TEST W11 folder.
4. **Then:** P0-C3 planning only if approved — do not implement until directed.

---

## Key product files (Batch C P0)

```
server/lib/poProjectResolve.mjs
server/lib/poQuoteAttachment.mjs
server/lib/poPdfKit.mjs
server/lib/module4Routes.mjs (po/issue sections)
server/lib/scheduleRoutes.mjs
server/lib/opsReadiness.mjs
src/pages/TenderDetail.jsx (batch PO projectId)
scripts/batch-a/w11-batch-po.mjs
scripts/batch-a/w12-schedule-auth.mjs
scripts/cleanup-test-artifacts.mjs
scripts/lib/testArtifactPrefixes.mjs
public/brand/logo-black.png
public/brand/icon-blue.png
```

## Key QA docs

```
docs/qa/BATCH_C_REVIEW_PACK.md
docs/qa/BUG_REGISTER.md
docs/qa/WORKFLOW_TEST_MATRIX.md
docs/qa/30_DAY_HARDENING_TRACKER.md
docs/qa/TEST_ARTIFACT_CLEANUP_POLICY.md
docs/qa/test-artifact-cleanup-log.md
docs/qa/HARDENING_UPDATE_TEST_LOG_BATCH_C_2026-06-25.md
docs/qa/workflows/10_* … 15_*
```
