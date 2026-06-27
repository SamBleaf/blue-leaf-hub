# Workflow Test Matrix

**Status:** W01 mapped (2026-06-22); RFQ Phases 2–5 complete  
**Legend:** `pass` | `fail` | `missing` | `blocked` | `gap-documented`

---

## Workflow 01 — Lead / CRM Intake (P0)

Doc: [workflows/01_LEAD_CRM_INTAKE.md](./workflows/01_LEAD_CRM_INTAKE.md)

| ID | Workflow step | Screen | Route / API | Test file | Status | Notes |
|----|---------------|--------|-------------|-----------|--------|-------|
| W01-API-01 | Manual lead create | SalesPipeline | `POST /api/sales/leads` | `scripts/batch-a/w01-leads.mjs` | **passes** | P0-A2 unified activities |
| W01-API-02 | Website enquiry | — | `POST /api/public/enquiry` | same | **passes** | P0-A2 unified activities |
| W01-API-03 | CRM contact convert | CrmContacts | `POST /api/crm/contacts/:id/convert` | `scripts/batch-a/w01-leads.mjs` | **passes** | P0-A2 unified activities |
| W01-API-04 | Stage update | Pipeline / LeadDetail | `PATCH /api/sales/leads/:id` | — | missing | `stage_change` activity |
| W01-API-05 | Log activity | LeadDetail | `POST .../activities` | — | missing | |
| W01-API-06 | Qualifying score | LeadDetail | PATCH qualify fields | — | missing | 0–8 generated |
| W01-API-07 | Transcript apply | LeadDetail | `POST .../conversations` | — | missing | `name` not in LEAD_FIELDS |
| W01-API-08 | Convert to job | LeadDetail | `POST .../convert-to-job` | `scripts/batch-a/w01-leads.mjs` | **passes** (`--write`) | Requires `site_address`; 400 without, 200 with |
| W01-E2E-01 | Create lead UI | SalesPipeline | — | — | **superseded** | Covered by PLAYWRIGHT-SALES-GATE-LADDER-01 |
| W01-E2E-04 | Stage ladder + address gate (browser) | LeadDetail | PATCH stage + convert API | `e2e/tests/workflows/sales-stage-gate-ladder.spec.js` | **passes** | PLAYWRIGHT-SALES-GATE-LADDER-01; 2026-06-27 |
| W01-E2E-02 | Pipeline display name | SalesPipeline | — | `e2e/tests/workflows/batch-a/w01-pipeline-display.spec.js` | **passes** | P0-A1 `displayLeadName()` |
| W01-E2E-03 | Stage gate bypass | SalesPipeline | PATCH stage | — | gap-documented | W01-DRIFT-003 |
| W01-SMOKE-01 | Sales leads list auth | — | `GET /api/sales/leads` | api-health, admin-readonly | pass | |
| W01-SMOKE-02 | E2E seed lead exists | LeadDetail | GET lead | admin-readonly | pass | Direct DB seed |
| W01-SEC-01 | Public enquiry validation | — | `POST /api/public/enquiry` | — | missing | 400 without name/email |
| W01-SEC-02 | Public body field whitelist | — | `POST /api/public/enquiry` | — | missing | stage/job_id not accepted |
| W01-SEC-03 | Public enquiry spam/rate-limit/honeypot | — | `POST /api/public/enquiry` | `w01-leads.mjs` | gap-documented | W01-SEC-003; SAM-W01-003 |

---

## Workflow 02 — Lead Qualification / Discovery (P0)

Doc: [workflows/02_LEAD_QUALIFICATION_DISCOVERY.md](./workflows/02_LEAD_QUALIFICATION_DISCOVERY.md)

| ID | Workflow step | Screen | Route / API | Test file | Status | Notes |
|----|---------------|--------|-------------|-----------|--------|-------|
| W02-API-01 | PATCH qualify fields | LeadDetail | `PATCH /api/sales/leads/:id` | — | missing | COALESCE 0 behaviour |
| W02-API-02 | Stage change activity | LeadDetail / Pipeline | PATCH stage | — | missing | `lead_activities` stage_change |
| W02-API-03 | Stage gate bypass | SalesPipeline | PATCH stage | `scripts/batch-a/w02-qualification.mjs` | gap-documented | W02-DRIFT-006; SAM-W02-002 decided |
| W02-API-04 | Mark lost/won stamping | LeadDetail | PATCH `stage: lost/won` | `scripts/batch-a/w02-qualification.mjs` | **pass** (`test:w02-qualification:write`) | OUTCOME-STAMP-01; W02-DRIFT-001 fixed |
| W02-API-05 | Nurture follow-up | LeadDetail | PATCH nurture fields | — | missing | |
| W02-API-06 | Conversation no overwrite | LeadDetail | POST conversations | — | missing | unselected fields unchanged |
| W02-API-07 | Applied suggestions audit | LeadDetail | POST conversations | — | missing | activity row; no field provenance |
| W02-UI-01 | Gate checklist visible | LeadDetail | — | `e2e/tests/workflows/sales-stage-gate-ladder.spec.js` | **partial pass** | Discovery/Winning Offer gates; pipeline bypass still gap (W02-DRIFT-006) |
| W02-UI-02 | Pipeline ungated move | SalesPipeline | moveStage | — | gap-documented | W02-DRIFT-006 |
| W02-SEC-01 | Non-admin PATCH blocked | — | PATCH lead | — | missing | UI admin-only; API unconfirmed |

---

## Workflow 03 — Fee Proposal / PTSA (P1)

Doc: [workflows/03_FEE_PROPOSAL_PTSA.md](./workflows/03_FEE_PROPOSAL_PTSA.md)

| ID | Workflow step | Screen | Route / API | Test file | Status | Notes |
|----|---------------|--------|-------------|-----------|--------|-------|
| W03-API-01 | Parse estimate XLSX/PDF | FeeProposalWizard | `POST /api/fee-proposal/parse-*` | — | missing | |
| W03-API-02 | Generate fee proposal DOCX | FeeProposalWizard | `POST /api/fee-proposal/generate-docx` | — | missing | original + APB |
| W03-API-03 | Send fee proposal | FeeProposalWizard | `POST /api/fee-proposal/send` | — | missing | status + Dropbox path |
| W03-API-04 | Generate PTSA DOCX | LeadDetail | `POST .../ptsa/generate-docx` | — | missing | |
| W03-API-05 | Mark PTSA signed | LeadDetail | `POST .../ptsa/mark-signed` | `scripts/batch-a/w03-fee-proposal.mjs` | **pass** | `--write`; 2026-06-25 regression |
| W03-API-06 | Accept fee proposal | FeeProposalWizard | `POST /api/fee-proposal/:id/accept` | `scripts/batch-a/w03-fee-proposal.mjs` | **passes** (via W03-API-05b) | W03-FEE-LINK-01 |
| W03-API-05b | Fee proposal accept stamps lead fee_proposal_id | FeeProposalWizard | `POST /api/fee-proposal/:id/accept` | `scripts/batch-a/w03-fee-proposal.mjs` | **passes** (`--write`) | W03-FEE-LINK-01 |
| W03-API-07 | PTSA signed no site_address | LeadDetail | mark-signed | `scripts/batch-a/w03-fee-proposal.mjs` | **passes** (`--write`) | PTSA-WARNING-01 — `siteAddressWarning:true` |
| W03-UI-01 | Wizard create/display | FeeProposalWizard | Supabase + API | — | gap-documented | W03-DRIFT-003 |
| W03-UI-02 | PTSA handoff visibility | LeadDetail | — | `scripts/batch-a/w03-fee-proposal.mjs` | **gap-documented** | API W03-API-07 pass; E2E banner deferred (PTSA-WARNING-01) |
| W03-UI-03 | PTSA block visibility at fee_proposal stage | LeadDetail | showPreTender | `e2e/.../w03-ptsa-visibility.spec.js` | gap-documented | W03-DRIFT-009; fixme |
| W03-UI-04 | PTSA scope warning at fee_proposal | LeadDetail | — | `e2e/tests/workflows/sales-stage-gate-ladder.spec.js` | **passes** | Scope not set + Mark PTSA disabled; 2026-06-27 |
| W03-SEC-01 | Non-admin proposal/PTSA | — | fee-proposal + ptsa routes | — | missing | |

---

## Workflow 04 — Estimate / Buildxact / Tender Job Setup (P1)

Doc: [workflows/04_ESTIMATE_BUILDXACT_TENDER_SETUP.md](./workflows/04_ESTIMATE_BUILDXACT_TENDER_SETUP.md)

| ID | Workflow step | Screen | Route / API | Test file | Status | Notes |
|----|---------------|--------|-------------|-----------|--------|-------|
| W04-API-01 | convert-to-job | LeadDetail | `POST .../convert-to-job` | `scripts/batch-a/w04-job-setup.mjs` | **pass** | P0-A4 test path; `--write` |
| W04-API-02 | POST jobs dedup / persistRfqs spine | RfqEngine | `POST /api/jobs` | `scripts/batch-a/w04-w06-job-spine.mjs` | **pass** (`test:w04-w06-job-spine:write`) | JOB-SPINE-01; W04-DRIFT-001 fixed |
| W04-API-03 | Parse XLSX → estimate row | FeeProposalWizard | `POST /api/fee-proposal/parse-xlsx` | — | missing | job_id resolve |
| W04-API-04 | BX API estimate pull | FeeProposalWizard | `GET /api/buildexact/job/:id/estimate` | — | missing | |
| W04-API-05 | Address pending RFQ gate | RfqEngine | package create | `w04-job-setup.mjs` | **pass** | P0-A3; 409 JOB_ADDRESS_PENDING |
| W04-UI-01 | Tender CTA creates job | LeadDetail | convert + navigate | — | missing | |
| W04-UI-02 | Lead context preserved at extraction | RfqEngine | prefill + persistJobFromExtraction | RfqEngine.jsx | **pass** | P0-A4 |
| W04-API-06 | Extraction links lead_id both ways | RfqEngine | POST/PATCH jobs + lead | `w04-job-setup.mjs` | **pass** | P0-A4 |
| W04-SEC-01 | Non-admin job/estimate | — | jobs + buildexact routes | — | missing | |

---

## Workflow 05 — Tender Board / Tender Lifecycle (P1)

Doc: [workflows/05_TENDER_BOARD_LIFECYCLE.md](./workflows/05_TENDER_BOARD_LIFECYCLE.md)

| ID | Workflow step | Screen | Route / API | Test file | Status | Notes |
|----|---------------|--------|-------------|-----------|--------|-------|
| W05-UI-01 | Board load + tabs + search | TenderBoard | Supabase jobs | — | missing | |
| W05-UI-02 | RFQ progress ring | TenderBoard | nested rfqs | `w05-tender-board.mjs` + E2E | **verified** | API/write + E2E pass (W05-TEST-001 closed) |
| W05-UI-03 | Win wizard → project | TenderDetail | win-finalize | — | missing | |
| W05-API-01 | Win finalize side effects | TenderDetail | `POST /api/tender/win-finalize` | `scripts/batch-a/w05-win-finalize.mjs` | **passes** (`test:w05-win:write`) | TEST-WIN-FINALIZE-01 |
| W05-API-02 | Lose finalize | TenderDetail | `POST /api/tender/lose-finalize` | `scripts/batch-a/w05-win-finalize.mjs` | **passes** (`test:w05-win:write`) | TEST-WIN-FINALIZE-01 |
| W05-API-03 | Job delete explicit + FK behaviour | TenderBoard | `POST /api/tender/job-delete` | — | missing | not full cascade — W05-DRIFT-008 |
| W05-API-04 | Batch PO check | TenderDetail | `GET .../batch-po-check/:id` | — | missing | W05-DRIFT-005 |
| W05-API-05 | job-delete with rfqs/rfq_packages/correspondence | TenderBoard | job-delete | `w05-tender-board.mjs` | **pass** | P0-A6; 409 when packages/rfqs linked |
| W05-API-06 | Archive path audited or gap documented | TenderBoard | Supabase status update | — | missing | W05-DRIFT-002; SAM-W05-002 |
| W05-API-07 | Won/lost lead stage sync or gap | TenderDetail | win/lose-finalize | `w05-win-finalize.mjs` | **gap-documented** | W05-DRIFT-004; SAM-W05-004 deferred |
| W05-API-08 | Package-only progress on board | TenderBoard | rfqs vs rfq_packages | `w05-tender-board.mjs` | **baseline complete** | P0-A5; `--write` for DB fixtures |
| W05-E2E-01 | Board → Detail → win → Operations smoke | TenderBoard | full path | `e2e/.../w05-tender-board.spec.js` | **partial** | board smoke pass; win path skipped |
| W05-SEC-01 | Non-admin tender mutations | — | win/lose/delete + RLS | — | missing | |

---


## Workflow 06 — RFQ Package / Scope Extraction (P0)

Doc: [workflows/06_RFQ_PACKAGE_SCOPE_EXTRACTION.md](./workflows/06_RFQ_PACKAGE_SCOPE_EXTRACTION.md)

| ID | Workflow step | Screen | Route / API | Test file | Status | Notes |
|----|---------------|--------|-------------|-----------|--------|-------|
| W06-API-01 | PDF scope extraction | RfqEngine | `POST /api/rfq/extract` | — | missing | One PDF; NDJSON stream |
| W06-API-02 | Create RFQ package | RfqEngine / API | `POST /api/rfq-packages` | `w04-job-setup.mjs` (409 only) | partial | P0-A3 guard tested |
| W06-API-03 | persistRfqs server job path | RfqEngine | POST `/api/jobs` | `scripts/batch-a/w04-w06-job-spine.mjs` | **pass** (`test:w04-w06-job-spine:write`) | JOB-SPINE-01; W06-DRIFT-001 fixed |
| W06-API-04 | Tender prefill | RfqEngine | `GET /api/tender/prefill` | — | missing | |
| W06-API-05 | Engine send threading | RfqEngine | `POST /api/rfq/send` | RFQ-04 row | partial | W06-DRIFT-005 |
| W06-API-06 | Package send threading | RfqPackageDetail | `POST .../scopes/:tradeId/send` | RFQ-05 | pass | DRIFT-001 fixed |
| W06-API-07 | Engine finalize package | RfqEngine | finalize → POST package | `scripts/batch-a/w06-package-finalize.mjs` | **passes** (`--write`) | P0-B1 — W06-DRIFT-006 fixed |
| W06-API-08 | Email-only recipient | RfqPackageDetail | send-scope | — | gap-documented | W06-DRIFT-004 |
| W06-UI-01 | Engine wizard steps | RfqEngine | — | — | missing | |
| W06-UI-02 | Package scope/coverage render | RfqPackageDetail | GET package | `scripts/batch-a/w06-package-shape.mjs` | **passes** (`--write`) | W06-DRIFT-008 fixed via `rfqPackageUtils.js` |
| W06-UI-03 | Quote Tracker tabs | RfqPackageList | list + direct + unmatched | — | missing | |
| W06-E2E-01 | Extract → package smoke | RfqEngine | full Flow A | — | missing | Needs ANTHROPIC_KEY |
| W06-SEC-01 | RFQ package routes auth | — | `/api/rfq-packages/*` | api-security | pass | CRIT-001 fixed |

---

## Workflow 07 — RFQ Send / Quote Matching (Batch B)

| ID | Workflow step | Screen | Route / API | Test file | Status | Notes |
|----|---------------|--------|-------------|-----------|--------|-------|
| W07-API-01 | Engine send stores threading + correspondence | RfqEngine | `POST /api/rfq/send` | `scripts/batch-a/w07-send-baseline.mjs` | **passes/partial** (`test:w07-send:write`) | TEST-JOURNEY-B-01; gap if mail off |
| W07-API-02 | Package send: `sent_message_id`, `rfq_id` link, correspondence | RfqPackageDetail | `POST .../send` | RFQ-05 | partial | W07-DRIFT-001 |
| W07-API-03 | Inbound match propagates package tables | — | IMAP + propagation | test-rfq-unmatched-resolve | partial | needs IMAP fixture |
| W07-API-04 | Resend reply match without thread header | — | fallback matcher | — | missing | W07-DRIFT-005 |
| W07-API-05 | Email-only → unmatched | RfqPackageDetail | send-scope | — | gap-documented | W07-DRIFT-002 |
| W07-API-06 | Multi-RFQ same sender no wrong match | — | matcher | `scripts/test-imap-quote-match.mjs` | **passes** (`test:w07-matcher`) | P0-B3 — ambiguous_sender → null |
| W07-API-07 | First IMAP poll cursor init | — | pollImapForQuoteReplies | — | missing | W07-DRIFT-007 |
| W07-API-08 | Manual resolve audit + propagation | RfqPackageList | resolve POST | test-rfq-unmatched-resolve | partial | no amount assert W07-DRIFT-008 |
| W07-SEC-01 | Unmatched + resolve auth | — | quote-tracker + resolve | api-rfq-unmatched.spec.js | partial | list yes; mail/inbox gap |

---

## Workflow 08 — Quote Comparison / Accept Quote (Batch B)

| ID | Workflow step | Screen | Route / API | Test file | Status | Notes |
|----|---------------|--------|-------------|-----------|--------|-------|
| W08-API-01 | Accept updates rfqs | TenderDetail | `PATCH /api/rfq/:id` | `w08-accept-alignment.mjs`, `journey-b-rfq-money-path.mjs` | **passes** (`test:journey-b:write`) | TEST-JOURNEY-B-01 |
| W08-API-02 | Accept with quoted_amount only | TenderDetail | tap-to-use + PATCH | — | gap-documented | W08-DRIFT-001 |
| W08-API-03 | Package accept mirrors rfqs | RfqPackageDetail | PATCH recipient | `scripts/batch-a/w08-accept-alignment.mjs` | **passes** (`--write`) | P0-B2 Phase 1 — linked sync confirmed; Tender→package gap baseline |
| W08-API-04 | Accept scope/package rollup | — | — | `scripts/batch-a/w08-accept-alignment.mjs` | **gap-documented** (`--write`) | W08-DRIFT-005 — no accept rollup |
| W08-API-05 | Win-finalize + cost_intelligence | TenderDetail | win-finalize | — | missing | W08-DRIFT-006 |
| W08-UI-01 | Extracted vs confirmed amount | TenderDetail | UI | — | missing | W08-DRIFT-001 |
| W08-UI-02 | Package received vs accepted | RfqPackageDetail | UI | — | missing | W08-DRIFT-003 |
| W08-SEC-01 | Accept routes auth | — | PATCH rfq + recipient | — | partial | reextract unauth |

---

## Workflow 09 — Tender Win / Operations Handoff (Batch B)

Doc: [workflows/09_TENDER_WIN_OPERATIONS_HANDOFF.md](./workflows/09_TENDER_WIN_OPERATIONS_HANDOFF.md)

| ID | Workflow step | Screen | Route / API | Test file | Status | Notes |
|----|---------------|--------|-------------|-----------|--------|-------|
| W09-API-01 | win-finalize creates/updates projects | TenderDetail | `POST /api/tender/win-finalize` | `w05-win-finalize.mjs`, `journey-win-finalize.mjs` | **passes** (`test:win-finalize-01:write`) | TEST-WIN-FINALIZE-01 |
| W09-API-02 | cost_intelligence from accepted quotes | TenderDetail | win-finalize | — | missing | W09-DRIFT-003/005 |
| W09-API-03 | jobs.status / won_at on win | TenderDetail | win-finalize | — | missing | |
| W09-API-04 | Lead sync on win | TenderDetail | ops-readiness | `scripts/batch-a/w09-ops-readiness.mjs` | **passes** (`--write`) | P0-B5 — warning only; W09-DRIFT-004 mitigated |
| W09-API-05 | Package accept in win handoff | TenderDetail | `GET /api/tender/:jobId/accept-alignment` | `scripts/batch-a/w08-accept-alignment.mjs` | **passes** (`--write`) | P0-B2 Phase 2 — alignment endpoint + win wizard warn (W09-DRIFT-002 mitigated) |
| W09-API-05A | package_only_accept warning | — | accept-alignment | `scripts/batch-a/w08-accept-alignment.mjs` | **passes** (`--write`) | P0-B2 Phase 2 |
| W09-API-05B | stale_rfq warning | — | accept-alignment | `scripts/batch-a/w08-accept-alignment.mjs` | **passes** (`--write`) | P0-B2 Phase 2 |
| W09-API-05C | amount_mismatch warning | — | accept-alignment | `scripts/batch-a/w08-accept-alignment.mjs` | **passes** (`--write`) | P0-B2 Phase 2 |
| W09-API-05D | stale_package warning | — | accept-alignment | `scripts/batch-a/w08-accept-alignment.mjs` | **passes** (`--write`) | P0-B2 Phase 2 |
| W09-API-05E | clean aligned accept — no warnings | — | accept-alignment | `scripts/batch-a/w08-accept-alignment.mjs` | **passes** (`--write`) | P0-B2 Phase 2 |
| W09-UI-05 | Win wizard alignment warning panel | TenderDetail | Mark Won step 1 | — | **gap-documented** | P0-B2 shipped — API covered; UI manual smoke |
| W09-API-06 | Batch PO / projectId readiness | TenderDetail / Operations | batch-po-check + ops-readiness | `scripts/batch-a/w09-ops-readiness.mjs`, `scripts/batch-a/w11-batch-po.mjs` | **passes** (`--write`) | P0-C1 — batch PO path fixed; checklist still flags unissued POs |
| W09-API-07 | Ops readiness checklist API | Operations | `GET /api/projects/:id/ops-readiness` | `scripts/batch-a/w09-ops-readiness.mjs` | **passes** (`--write`) | P0-B5 — 14 read-only items |
| W09-API-07A | Fresh won job — core ok, ops items missing | — | ops-readiness | `scripts/batch-a/w09-ops-readiness.mjs` | **passes** (`--write`) | P0-B5 |
| W09-API-07B | Readiness GET is read-only (no side effects) | — | ops-readiness | `scripts/batch-a/w09-ops-readiness.mjs` | **passes** (`--write`) | P0-B5 |
| W09-UI-05 | Operations project readiness banner | OperationsProjectDetail | project load | manual smoke | **gap-documented** | P0-B5 shipped — API covered |
| W09-UI-05A | TenderDetail post-win ops link (optional) | TenderDetail | post-win | planned | **planned** | P0-B5 minimal Option A |
| W09-API-08 | Win wizard warns on accepted RFQ missing quote_amount | TenderDetail | win wizard step 1 + `GET .../win-quote-readiness` | `scripts/batch-a/w08-win-quote-readiness.mjs` | **passes** (`--write`) | P0-B4 — warn-only; W09-DRIFT-010 mitigated |
| W09-API-08A | accepted + quote_amount > 0 — no warning | — | win-quote-readiness | `scripts/batch-a/w08-win-quote-readiness.mjs` | **passes** (`--write`) | P0-B4 |
| W09-API-08B | accepted + quote_amount null/0 — warning returned | — | win-quote-readiness | `scripts/batch-a/w08-win-quote-readiness.mjs` | **passes** (`--write`) | P0-B4 |
| W09-API-08C | quoted_amount present does not auto-fill quote_amount | — | win-quote-readiness | `scripts/batch-a/w08-win-quote-readiness.mjs` | **passes** (`--write`) | P0-B4 — staff confirm only |
| W08-API-02 | quote_amount / quoted_amount accept rule | TenderDetail | PATCH rfq + canToggle | `scripts/batch-a/w08-win-quote-readiness.mjs` | **passes** (`--write`) | P0-B4 — UI gate mirror |
| W08-API-05 | Accepted quote feeds win-finalize / cost_intel | TenderDetail | win-finalize | `scripts/batch-a/w08-win-quote-readiness.mjs` | **passes** (`--write`) | P0-B4 — W08-DRIFT-006 mitigated |
| W09-API-02 | cost_intelligence from quote_amount | TenderDetail | win-finalize | `scripts/batch-a/w08-win-quote-readiness.mjs` | **passes** (`--write`) | P0-B4 — skip when null documented |
| W09-UI-08 | Win wizard quote amount warning panel | TenderDetail | Mark Won step 1 | manual smoke | **gap-documented** | P0-B4 shipped — API covered |
| W09-UI-01 | Win wizard accepted trades | TenderDetail | win modal | — | missing | rfqs-only rows |
| W09-E2E-01 | Mark Won → Operations project + readiness checklist | TenderDetail → Operations | full path + ops-readiness | `e2e/tests/workflows/batch-a` (extend) | **planned** | P0-B5 |
| W09-SEC-01 | win/lose/finalize auth | — | tender routes | — | missing | requireAuth baseline |

---

## Batch C — Operations (W10–W15)

| ID | Workflow step | Screen | Route / API | Test file | Status | Notes |
|----|---------------|--------|-------------|-----------|--------|-------|
| W10-API-01 | Procurement generate creates items | Procurement | `POST .../generate` | `scripts/batch-a/w10-procurement-baseline.mjs` | **passes** (`--write`) | P0-C4 manual baseline |
| W10-API-02 | Generate retry idempotent | Procurement | `POST .../generate` ×2 | `scripts/batch-a/w10-procurement-baseline.mjs` | **passes** (`--write`) | P0-C4 |
| W10-API-03 | Employee cannot generate | Procurement | `POST .../generate` | `scripts/batch-a/w10-procurement-baseline.mjs` | **passes** (`--write`) | P0-C4 403 |
| W10-API-04 | Admin/supervisor can generate | Procurement | job + project generate | `scripts/batch-a/w10-procurement-baseline.mjs` | **passes** (`--write`) | P0-C4 |
| W10-API-05 | Weak source returns warnings | Procurement | generate summary.warnings | `scripts/batch-a/w10-procurement-baseline.mjs` | **passes** (`--write`) | P0-C4 |
| W10-API-06 | Win does not auto-generate | Procurement | win-finalize | `scripts/batch-a/w10-procurement-baseline.mjs` | **passes** (`--write`) | W10-DRIFT-001 intentional |
| W10-API-02 | Schedule linkage on generate | Procurement | generate | — | planned | |
| W10-SEC-01 | Role gates generate vs issue-po | — | procurement routes | — | planned | |
| W11-API-01 | batch-po-check lists accepted RFQs needing PO | TenderDetail | `GET /api/tender/batch-po-check/:jobId` | `scripts/batch-a/w11-batch-po.mjs` | **passes** (`--write`) | P0-C1 |
| W11-API-02 | projectId resolved from projects.job_id | poProjectResolve | helper + `/api/po/issue` | `scripts/batch-a/w11-batch-po.mjs` | **passes** (`--write`) | P0-C1 |
| W11-API-03 | Batch PO full issue (PDF + PO row) | TenderDetail / po/issue | issueBatchPos + jobId fallback | `scripts/batch-a/w11-batch-po.mjs` | **passes** (`--write`) | W11-DRIFT-001 + W11-DRIFT-006 fixed |
| W11-API-04 | Duplicate rfq_id idempotency | po/issue | POST with existing rfq_id | `scripts/batch-a/w11-batch-po.mjs` | **passes** (`--write`) | P0-C1 |
| W11-API-05 | PO email includes generated PO PDF | po/issue | mail attachments | `scripts/batch-a/w11-batch-po.mjs` | **passes** (`--write`) | `po_email_attachment_count >= 1` |
| W11-API-06 | Submitted quote PDF attached when available | po/issue | rfqs.quote_pdf_path / shared URL | `scripts/batch-a/w11-batch-po.mjs` | **passes** (`--write`) | `resolveRfqQuotePdfForPo` + PO email 2nd attachment when download succeeds |
| W11-API-07 | Missing quote does not block PO issue | po/issue | resolveRfqQuotePdfForPo warning path | `scripts/batch-a/w11-batch-po.mjs` | **passes** (`--write`) | Warning + `quote_attachment_included: false` |
| W11-UI-01 | PO PDF watermark readability | poPdfKit | local sample PDF | `scripts/batch-a/w11-batch-po.mjs` | **partial** (`--write`) | Auto-generates `scripts/output/w11-po-sample.pdf`; manual open for watermark check |
| W11-SEC-01 | po/issue role gate (alias W11-SEC-02) | — | po/issue | `scripts/batch-a/w11-batch-po.mjs` | **passes** (`--write`) | W11-PO-SEC-01 — employee 403 |
| W11-SEC-02 | Employee blocked from POST /api/po/issue | — | po/issue | `scripts/batch-a/w11-batch-po.mjs` | **passes** (`--write`) | W11-PO-SEC-01 — SAM-W11-002 A |
| W12-API-01 | Authorised schedule task write (create/update/delete) | ScheduleManager | POST/PATCH/DELETE schedule task routes | `scripts/batch-a/w12-schedule-auth.mjs` | **passes** (`--write`) | P0-C2 admin/supervisor |
| W12-API-02 | Schedule read/list for employee | ScheduleManager | `GET /api/schedule/:projectId` | `scripts/batch-a/w12-schedule-auth.mjs` | **passes** (`--write`) | P0-C2 read unchanged |
| W12-API-03 | EOT lifecycle | DelaysTab | eot routes | — | planned | write routes gated P0-C2 |
| W12-SEC-01 | Employee cannot write schedule | — | schedule write CRUD + save-analysis-pdf | `scripts/batch-a/w12-schedule-auth.mjs` | **passes** (`--write`) | P0-C2 — 403 + no mutation |
| W12-SEC-02 | Supervisor/admin can write schedule | — | schedule write CRUD + save-analysis-pdf | `scripts/batch-a/w12-schedule-auth.mjs` | **passes** (`--write`) | P0-C2 |
| W13-API-01 | Diary save creates row | SiteDiary | `POST /api/diary/save` | `scripts/batch-a/w13-site-diary-baseline.mjs` | **passes** (`--write`) | P0-D1 |
| W13-API-02 | Diary project/date linkage | SiteDiary | save + GET list | `scripts/batch-a/w13-site-diary-baseline.mjs` | **passes** (`--write`) | P0-D1 |
| W13-API-03 | Worker photo + task complete | Worker PWA | `/api/worker/photos`, task complete | `scripts/batch-a/w13-site-diary-baseline.mjs` | **passes** (`--write`) | P0-D1 |
| W13-SEC-01 | Employee site-task gate | workforceRoutes | site-tasks CRUD | `scripts/batch-a/w13-site-diary-baseline.mjs` | **passes** (`--write`) | P0-D1 — employee diary 200 by design |
| W13-SEC-02 | No public/client diary API | — | `/api/diary/*` | `scripts/batch-a/w13-site-diary-baseline.mjs` | **passes** (`--write`) | P0-D1 |
| W13-STORAGE-01 | Storage side effects | jobRecordsFiler, site-media | save PDF + photo path | `scripts/batch-a/w13-site-diary-baseline.mjs` | **passes** (`--write`) | P0-D1 |
| W13-DRIFT-01 | photo_paths unused | — | `site_diary.photo_paths` | `scripts/batch-a/w13-site-diary-baseline.mjs` | **passes** (`--write`) | P0-D1 |
| W14-API-01 | WHS profile save | WhsEngine | `PUT .../profile` | `scripts/batch-a/w14-whs-baseline.mjs` | **passes** (`--write`) | P0-C5 |
| W14-API-02 | Generate management plan | WhsEngine | `POST .../generate/project_whs_management_plan` | `scripts/batch-a/w14-whs-baseline.mjs` | **passes** (`--write`) | P0-C5 |
| W14-API-03 | Public induction submit | SiteInduction | `POST /api/induction/.../submit` | `scripts/batch-a/w14-whs-baseline.mjs` | **passes** (`--write`) | P0-C5 — cross-project isolation |
| W14-SEC-01 | Induction public (no auth) | SiteInduction | `GET/POST /api/induction/*` | `scripts/batch-a/w14-whs-baseline.mjs` | **passes** (`--write`) | P0-C5 — invalid UUID 404, no leak |
| W14-SEC-02 | Admin/supervisor WHS profile write | WhsEngine | `PUT .../profile` | `scripts/batch-a/w14-whs-baseline.mjs` | **passes** (`--write`) | P0-C5 |
| W14-SEC-03 | Employee cannot alter WHS profile | WhsEngine | `PUT .../profile`, `POST .../generate/*` | `scripts/batch-a/w14-whs-baseline.mjs` | **passes** (`--write`) | P0-C5 — requireRole gate |
| W14-API-05 | Win does not auto-create WHS profile | win-finalize | — | `scripts/batch-a/w14-whs-baseline.mjs` | **passes** (`--write`) | W14-DRIFT-001 intentional |
| W15-SEC-01 | Employee cannot approve timesheets | Workforce | approve, mass-approve, reject | `scripts/batch-a/w15-timesheet-auth.mjs` | **passes** (`--write`) | P0-C3 — 403 |
| W15-SEC-02 | Supervisor cannot approve (Option B) | Workforce | approve, mass-approve | `scripts/batch-a/w15-timesheet-auth.mjs` | **passes** (`--write`) | SAM-W15-001 B |
| W15-SEC-03 | Admin can approve timesheets | Workforce | approve, mass-approve | `scripts/batch-a/w15-timesheet-auth.mjs` | **passes** (`--write`) | P0-C3 |
| W15-SEC-04 | Supervisor can reject timesheets | Workforce | reject | `scripts/batch-a/w15-timesheet-auth.mjs` | **passes** (`--write`) | P0-C3 |
| W15-API-01 | Duplicate approve idempotent / safe | Workforce | approve | `scripts/batch-a/w15-timesheet-auth.mjs` | **passes** (`--write`) | DB + WO id stable |
| W15-API-02 | Status transitions (approve/reject) | Workforce | approve, reject | `scripts/batch-a/w15-timesheet-auth.mjs` | **passes** (`--write`) | P0-C3 |
| W15-API-03 | Buildxact WO path not duplicated | Workforce | approve + sync | `scripts/batch-a/w15-timesheet-auth.mjs` | **pass/partial** (`--write`) | Gap if BX unconfigured |
| W15-API-04 | Read/list for intended roles | Workforce | GET timesheets/pending | `scripts/batch-a/w15-timesheet-auth.mjs` | **passes** (`--write`) | Employee read P1 follow-up |
| W15-E2E-01 | Worker PWA log smoke | Worker PWA | full path | — | planned | Deputy cutover |

## W16 — Workforce allocation baseline (W16-A1)

| ID | Test | Module | Routes | Script | Status | Notes |
|----|------|--------|--------|--------|--------|-------|
| W16-API-01 | Admin create allocation | Workforce | POST allocations | `w16-allocation-baseline.mjs` | **passes** (`--write`) | Requires mig 117 |
| W16-API-02 | Supervisor create allocation | Workforce | POST allocations | same | **passes** (`--write`) | |
| W16-SEC-01 | Employee cannot create allocation | Workforce | POST allocations | same | **passes** (`--write`) | 403 |
| W16-SEC-02 | Worker reads own allocation only | Worker | GET allocations/today, week | same | **passes** (`--write`) | |
| W16-API-03 | Project allocation link | Workforce | POST allocations | same | **passes** (`--write`) | |
| W16-API-04 | Carpentry allocation link | Workforce | POST allocations | same | **passes** (`--write`) | |
| W16-API-05 | Duplicate employee/date → 409 | Workforce | POST allocations | same | **passes** (`--write`) | DUPLICATE_ALLOCATION |
| W16-REG-01 | Worker timesheet without allocation | Worker | POST timesheets | same | **passes** (`--write`) | |
| W16-REG-02 | W15 approval suite still passes | Workforce | approve | `w15-timesheet-auth.mjs` | **passes** | 19/19 post W16-A1 |
| W16-REG-03 | BX sync path unchanged | Workforce | sync fn guard | same | **passes** | Static guard |

## W17 — Workforce Team tab (W17-P1)

| ID | Test | Module | Routes / files | Script | Status | Notes |
|----|------|--------|----------------|--------|--------|-------|
| W17-REQ-TEAM-01 | Team tab in Workforce | Workforce UI | `Workforce.jsx` TABS + embedded | `w17-team-tab-baseline.mjs` | **passes** | Static + render |
| W17-REQ-TEAM-02 | /workforce/team redirect | Routing | `App.jsx` → `?tab=Team` | same | **passes** | Option A redirect |
| W17-REQ-TEAM-03 | Employee list loads | Workforce | GET `/api/workforce/employees` | same | **passes** (`--write`) | |
| W17-REQ-TEAM-04 | Worker-link admin-only | Workforce | POST worker-link | same | **passes** (`--write`) | Route unchanged |
| W17-REG-01 | Approvals tab preserved | Workforce UI | `Workforce.jsx` | same | **passes** | Static |
| W17-REG-02 | Snapshot tab preserved | Workforce UI | same | same | **passes** | Static |
| W17-REG-03 | Mass Fill tab preserved | Workforce UI | same | same | **passes** | Static |
| W17-REG-04 | History tab preserved | Workforce UI | same | same | **passes** | Static |
| W17-REG-05 | W15 auth regression | Workforce | approve | `w15-timesheet-auth.mjs` | **passes** | 19/19 post P1 |
| W17-REG-06 | W16 allocation regression | Workforce | allocations | `w16-allocation-baseline.mjs` | **passes** | 14/14 post P1 |
| W17-REG-07 | BX sync static guard | Workforce | sync fn | same | **passes** | Static |

## W17 — Workforce remaining phases (P2–P8 planned)

| ID | Phase | Test | Script (planned) | Status |
|----|-------|------|------------------|--------|
| W17-REQ-TS-01 | P2 | Snapshot previous week by employee/day | `w17-snapshot-baseline.mjs` | planned |
| W17-REQ-TS-02 | P2 | Missing days visible | same | planned |
| W17-REQ-TS-03 | P2 | submitted/approved/rejected distinct | same | planned |
| W17-REQ-TS-04 | P2 | Hours per day visible | same | planned |
| W17-REQ-TASK-01 | P3 | Building job tasks | `w17-worker-tasks-baseline.mjs` | planned |
| W17-REQ-TASK-02 | P3 | Carpentry job tasks | same | planned |
| W17-REQ-TASK-03 | P3 | Category filter | same | planned |
| W17-REQ-TASK-04 | P3 | Carpentry task from admin appears in worker view | same | planned |
| W17-REQ-TASK-05 | P3 | Worker blocked from supervisor QC | same | planned |
| W17-REQ-TASK-06 | P3 | Leading hand sees supervisor tasks | same | planned |
| W17-REQ-PLAN-01 | P4 | Planner tab renders | `w17-planner-baseline.mjs` | planned |
| W17-REQ-PLAN-02 | P4 | Admin creates allocation | same | planned |
| W17-REQ-PLAN-03 | P4 | Supervisor creates allocation | same | planned |
| W17-REQ-PLAN-04 | P4 | Duplicate conflict visible | same | planned |
| W17-REQ-RDO-01 | P5 | RDO excludes missing signal | `w17-rdo-baseline.mjs` | planned |
| W17-REQ-RDO-02 | P5 | Public holiday in Snapshot | same | planned |
| W17-REQ-VOICE-01 | P6 | Transcript drafts only | `w17-voice-tasks-baseline.mjs` | planned |
| W17-REQ-VOICE-02 | P6 | Save to building job | same | planned |
| W17-REQ-VOICE-03 | P6 | Save to carpentry job | same | planned |
| W17-REQ-QC-01 | P7 | Leading hand QC checklist | `w17-qc-baseline.mjs` | planned |
| W17-REQ-QC-02 | P7 | Worker blocked from restricted QC | same | planned |
| W17-REQ-QC-03 | P7 | QC photo/note on inspection | same | planned |
| W17-REQ-LAUNCH-01 | P8 | Worker app launch smoke | `w17-launch-readiness.mjs` | planned |
| W17-REQ-LAUNCH-02 | P8 | Office weekly review smoke | same | planned |
| W17-REQ-LAUNCH-03 | P8 | Buildxact sync regression | W15 + W16 | planned |

**Control doc:** [W17_WORKFORCE_REMAINING_PHASE_PLANS.md](./W17_WORKFORCE_REMAINING_PHASE_PLANS.md)


---

## RFQ / Tendering (P0)

| ID | Workflow step | Screen | Route / API | Test file | Status | Notes |
|----|---------------|--------|-------------|-----------|--------|-------|
| RFQ-01 | Create RFQ package (engine path) | RfqEngine | `POST /api/rfq-packages` | — | missing | After engine send finalize |
| RFQ-02 | Create trade scope | RfqPackageDetail | `POST .../scopes` | — | missing | |
| RFQ-03 | Select recipients | RfqPackageDetail | UI + send body | — | missing | |
| RFQ-04 | Send RFQ (engine path) | RfqEngine | `POST /api/rfq/send` | `scripts/batch-a/w07-send-baseline.mjs` | **passes/partial** (`test:w07-send:write`) | Sets `sent_message_id`; gap if mail off |
| RFQ-05 | Send RFQ (package path) | RfqPackageDetail | `POST .../scopes/:tradeId/send` | test-imap-match | pass | DRIFT-001 fixed |
| RFQ-06 | Outbound correspondence logged | — | `correspondence` outbound | — | pass | package send path |
| RFQ-07 | IMAP poll matches by thread | — | `POST /api/imap/quote-poll` | `scripts/test-imap-quote-match.mjs` | pass | 16 pass, 2 gaps |
| RFQ-08 | Inbound updates `rfqs` | TenderDetail | IMAP handler | test-imap-quote-match #1–2 | pass | |
| RFQ-09 | Inbound updates `rfq_recipients` | RfqPackageDetail | propagation helper | test-rfq-unmatched-resolve.mjs | pass | DRIFT-002 fixed |
| RFQ-10 | Inbound updates scope/package rollup | RfqPackageDetail | propagation helper | test-rfq-unmatched-resolve.mjs | pass | DRIFT-002 fixed |
| RFQ-11 | Unmatched → queue | RfqPackageList tab | `unmatched_quote_emails` | test-rfq-unmatched-resolve.mjs | pass | |
| RFQ-12 | Unmatched list API | RfqPackageList | `GET /api/quote-tracker/unmatched` | api-rfq-unmatched.spec.js | pass | DRIFT-012 fixed |
| RFQ-13 | Manual resolve | RfqPackageList | `POST /api/unmatched-quotes/resolve` | test-rfq-unmatched-resolve.mjs | pass | DRIFT-003 fixed |
| RFQ-14 | TenderBoard quote ring | TenderBoard | Supabase `jobs.rfqs` | — | missing | |
| RFQ-15 | Accept quote | TenderDetail | `PATCH /api/rfq/:id` | — | missing | Needs `quote_amount` |
| RFQ-16 | Win finalize | TenderDetail | `POST /api/tender/win-finalize` | `scripts/batch-a/w05-win-finalize.mjs` | **passes** (`test:w05-win:write`) | TEST-WIN-FINALIZE-01 |
| RFQ-17 | Accepted → procurement | Procurement | procurement routes | — | missing | Week 2 |
| RFQ-18 | Cross-screen consistency | Board + Package | propagation helper | test-rfq-unmatched-resolve.mjs | pass | manual resolve path |
| RFQ-19 | Package additional send threading | RfqPackageDetail | send-scope | rfqPackageRoutes.mjs | pass | DRIFT-001 fixed |
| RFQ-20 | Email-only recipient inbound | — | — | — | **gap-documented (accepted)** | DRIFT-004 closed — SAM-W07-002 manual-resolve only |
| RFQ-21 | IMAP match trace logging | — | `RFQ_MATCH_DEBUG=true` | rfqMatchTrace.mjs | pass | |
| RFQ-22 | Poll idempotent | — | quote-poll | TENDER_EMAIL #14–15 | missing | |

---

## RFQ Matcher unit scenarios (maps to TENDER_EMAIL_TEST_PLAN)

| ID | Scenario | Test file | Status |
|----|----------|-----------|--------|
| MATCH-01 | In-Reply-To exact | `scripts/test-imap-quote-match.mjs` | pass |
| MATCH-02 | References chain | same | pass |
| MATCH-03 | Subject + address | same | pass |
| MATCH-04 | Sender = sub email | same | pass |
| MATCH-05 | Admin/account email | same | pass |
| MATCH-06 | Forwarded quote | same | pass |
| MATCH-07 | PDF no RFQ ID | same | pass |
| MATCH-08 | Revised quote | same | pass |
| MATCH-09 | Multi-RFQ same supplier weak subject | same | **pass** (P0-B3) |
| MATCH-10 | Multi-supplier same trade | same | pass |
| MATCH-11 | Similar address collision | same | **pass** (P0-B3) — null unless unique |
| MATCH-12 | No match → null | same | pass |
| MATCH-13 | Manual resolve integration | test-rfq-unmatched-resolve.mjs | pass |
| MATCH-14 | Duplicate message_id | same | missing |
| MATCH-15 | Poll re-run idempotent | same | missing |
| MATCH-16 | Failed parse | same | missing |
| MATCH-17 | Extraction fails | same | missing |
| MATCH-18 | Different thread | same | missing |
| MATCH-19 | Paul/Sam variants | same | missing |
| MATCH-20 | Address collision without thread | same | **pass** (P0-B3) |
| MATCH-20-thread | Thread wins address collision | same | **pass** (P0-B3) |

---

## Security (P0 — from adversarial audit)

Doc: [QA_001_SECURITY_ROUTE_BASELINE_PLAN.md](./QA_001_SECURITY_ROUTE_BASELINE_PLAN.md)

| ID | Workflow | Test file | Status |
|----|----------|-----------|--------|
| SEC-01 / QA-SEC-01 | Tier-0 private routes reject unauthenticated | `e2e/tests/security/unauthenticated-routes.spec.js` | **pass** (2026-06-22 fix) |
| SEC-02 / QA-SEC-02 | Public-by-design routes validate safely | same | **pass** |
| SEC-03 / QA-SEC-03 | Side-effect routes reject unauthenticated | same | **pass** (2026-06-22 fix) |
| SEC-04 / QA-SEC-04 | Admin-only rejects employee/unauth | same + api-rfq-unmatched.spec.js | **pass** |
| QA-SEC-05 | Portal admin auth | same | **pass** — unauth 401; employee/supervisor 403; admin allowed |

---

## W18 — Client Portal lifecycle (mapped 2026-06-22)

**Control doc:** [18_CLIENT_PORTAL_LIFECYCLE.md](./workflows/18_CLIENT_PORTAL_LIFECYCLE.md)

| ID | Description | Type | Test file | Status |
|----|-------------|------|-----------|--------|
| W18-SEC-01 | Unauthenticated portal admin routes blocked | security | `e2e/tests/security/unauthenticated-routes.spec.js` (QA-SEC-05) | **pass** |
| W18-SEC-02 | Employee cannot mint portal token (admin-only policy) | security | `e2e/tests/security/unauthenticated-routes.spec.js` | **pass** |
| W18-SEC-03 | Portal JWT only accesses own project | security | `e2e/tests/security/client-isolation.spec.js` | **pass** |
| W18-SEC-04 | Invalid/expired portal JWT rejected | api | `scripts/batch-a/w18-portal-sec04-legacy-jwt.mjs` | **accepted partial-pass** (`test:w18-portal-sec04:write` 35/35) |
| W18-API-01 | Admin generate-token + client invite → linked | api | `scripts/batch-a/w18-portal-api01-invite.mjs` | **pass** (`test:w18-portal-api01:write` 30/30) |
| W18-API-02 | Portal home/actions load scoped project data | api/e2e | `w18-portal-api01-invite.mjs` + navigation E2E | **partial-pass** |
| W18-API-03 | Documents/selections field allowlist (no cost leak) | api | `client-isolation.spec.js` leakScan | **pass** |
| W18-API-04 | Notification created safely on finance event | integration | `scripts/batch-a/w18-portal-finance-notify.mjs` | **pass** (`test:w18-portal-finance-notify:write` 34/34) |
| W18-MIG-01 | Migrations 108/110 CHECK verification | api/sql | CHECK probe 2026-06-22 | **pass** — verified applied, skip DDL |
| W18-P0-02 | Void variation cannot be approved after Finance void | security/regression | `scripts/batch-a/w18-portal-void-guard.mjs` | **pass** (`test:w18-portal-void-guard:write` 14/14 when E2E seed fresh; gaps if `project_client_users` stale) |
| W18-P0-03 | Journey/home/media photos filtered by `client_visible` | security/regression | `scripts/batch-a/w18-portal-photo-visibility.mjs` | **pass** (`test:w18-portal-photo-visibility:write` 15/15) |
| W18-DRIFT-008 | Home `recentPhotos` client_visible filter | regression | `w18-portal-photo-visibility.mjs` | **pass** (fixed 2026-06-22) |
| W18-DRIFT-009 | Media route client_visible 404 gate | security/regression | `w18-portal-photo-visibility.mjs` | **pass** (fixed 2026-06-22) |
| W18-UI-01 | PortalV2Admin shows correct project/client state | e2e | `e2e/tests/portal/portal-v2-admin-overview.spec.js` | **closed / pass** (`test:w18-portal-ui01` 11/11) |
| W18-UAT-01 | Client portal manual UAT smoke (pilot project) | manual | `docs/qa/W18_CLIENT_PORTAL_UAT_SMOKE_CHECKLIST.md` | **planned** |
| W18-UI-02 | Client portal shell loads correct project | e2e | `e2e/tests/client-portal/navigation.spec.js` | **pass** |

**Legacy aliases:** PORTAL-01 → W18-UI-02 · PORTAL-02 → W18-SEC-03

---


## Batch A regression run (2026-06-25)

| Command | Passed | Failed | Skipped | Gap-documented |
|---------|--------|--------|---------|----------------|
| `npm run test:batch-a` | 14 | 0 | 13 | 10 |
| `npm run test:batch-a:write` | 22 | 0 | 0 | 6 |
| `npm run test:e2e -- e2e/tests/workflows/batch-a` | 4 | 1 | 2 | — |

**Website enquiry acceptance chain verified:** W01-API-02 (activity) + W01-E2E-02 (pipeline name).

**E2E failure:** W05-UI-02 package-only subtest — Playwright strict-mode locator (W05-TEST-001); not a product regression.

---

## Summary counts (2026-06-22)

| Module | pass | gap-documented | missing |
|--------|------|----------------|---------|
| W01 Lead/CRM P0 | 5 | 2 | 7 |
| W02 Qualification P0 | 0 | 3 | 7 |
| W03 Fee Proposal P1 | 0 | 2 | 8 |
| RFQ/Tender P0 | 12 | 1 | 9 |
| Matcher unit | 13 | 1 | 6 |
| Security P0 | 1 | 0 | 3 |
| Portal | 2+ | 0 | many |

**Target (day 30):** Each P0 workflow ≥80% `pass` or `blocked-with-reason`.

---

## Work-ahead test queue (2026-06-27)

From [HARDENING_WORK_AHEAD_QUEUE.md](./HARDENING_WORK_AHEAD_QUEUE.md). **Planned** — write before Troubleshoot fix batches:

| Test ID | Workflow | Type | Blocks |
|---------|----------|------|--------|
| ~~W11-SEC-02~~ | W11 | security/api | **shipped** — W11-PO-SEC-01 2026-06-27 |
| W03-UI-02 | W03 | e2e/api | PTSA-WARNING-01 |
| ~~W03-API-05b~~ | W03 | api | **shipped** — W03-FEE-LINK-01 2026-06-27 |
| ~~W01-API-08~~ | W01 | api | **shipped** — W01-CONVERT-01 2026-06-27 |
| W06-API-08 | W06/W07 | api | DRIFT-004-DOC-01 acceptance |

---

From [CROSS_WORKFLOW_AUDIT_ACCELERATION_PACK.md](./CROSS_WORKFLOW_AUDIT_ACCELERATION_PACK.md). **Write before fix** for Batch JOB-SPINE-01:

| Test ID | Workflow | Type | Blocks fix |
|---------|----------|------|------------|
| W04-API-02 | W04 | api/regression | W04-DRIFT-001 |
| W06-API-03 | W06 | api/regression | W06-DRIFT-001 |
| W01-API-08 | W01 | api | W01-DRIFT-005 |
| W02-API-04 | W02 | api | W02-DRIFT-001 |
| W03-UI-02 | W03 | e2e/api | W03-DRIFT-002 |
| W06-API-08 / RFQ-20 | W06/W07 | api | DRIFT-004 doc acceptance |

**Note:** Summary counts table below (2026-06-22) is **stale** — batch-a:write and Batch B/C baselines pass many rows still marked `missing`. Refresh deferred to next matrix maintenance pass.

---

## Meta-runner — TEST-REGRESSION-SUITE-01

| ID | Scope | Command | W17 | W18 Playwright |
|----|-------|---------|-----|----------------|
| REGRESSION-01 | W06–W16 + W18 API baselines | `npm run test:hardening-regression:write` | **excluded** | gap-documented |
| REGRESSION-02 | + JOURNEY-B + WIN-FINALIZE chains | `npm run test:hardening-regression:write:chains` | **excluded** | gap-documented |

See [TEST_REGRESSION_SUITE_01.md](./TEST_REGRESSION_SUITE_01.md).

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-27 | Claude 2nd-pass E2E reconciliation: W12-SEC-01 **refuted** (employee→403 live + standalone 14/14); OUTCOME-STAMP-01 positive+idempotent verified; aggregated `hardening-regression:write` reds (W09/W10/W12/W13/W18-invite) = **harness rotation race (BLH-E2E-CLAUDE-001)**, green standalone. See `E2E_CLAUDE_SECOND_PASS_BLH-E2E-CLAUDE-20260627-1139.md` |
| 2026-06-27 | **PLAYWRIGHT-SALES-GATE-LADDER-01** — W01-E2E-04, W02-UI-01 partial, W03-UI-04 pass; see PLAYWRIGHT_SALES_GATE_LADDER_01.md |
| 2026-06-27 | W17-P5b→P8 — P5b Snapshot RDO overlay; P6 voice-to-tasks (W17-REQ-VOICE-01..05; `test:w17-voice-tasks:write`); P7 leading-hand QC (W17-REQ-QC-01..05; `test:w17-qc:write`); **P8 deputy-replacement gate** `test:w17-workforce-gate:write` runs W15+W16+W17 P1–P7 in one pass — **137 pass / 0 fail / 0 gap** (migrations 118+119 applied; persistence verified live) |
| 2026-06-27 | W17-P5 RDO + public-holiday display — W17-REQ-RDO-01 (SA computus seed) · -02 validation · -03 recurring pattern expand · -05 advisory no-timesheet · -06 authz · -07 non-working-days graceful + range guard · -08 wiring + protected sync intact; `test:w17-rdo-holiday:write` **11/11 + 2 gaps** (seed + expand gap-document until migration 119 applied) |
| 2026-06-27 | W17-P4b/c Planner drag-drop + colour + board curation — W17-REQ-PLAN-DnD-01 (dnd/legend/colour/fill/board wiring) · -02 assign · -03 move · -04 swap · -05 fill/deduct · -06 remove · -07 planner-jobs colour · -09 dup 409 · -10 authz · -11 board membership; `test:w17-planner-dnd:write` **19/19 + 2 gaps** (colour + board persist gap-document until migration 118 applied) |
| 2026-06-27 | TEST-REGRESSION-SUITE-01 — meta-runner REGRESSION-01/02; SAM-W06-001 decided |
| 2026-06-27 | TEST-WIN-FINALIZE-01 — W05-API-01/02, W09-API-01, RFQ-16, JOURNEY-WIN chain |
| 2026-06-27 | TEST-DISCOVERY-WAVE-01 — gap queue + W03-UI-02 status; see TEST_DISCOVERY_WAVE_01.md |
| 2026-06-27 | **OUTCOME-STAMP-01** — W02-API-04 pass; W02-DRIFT-001 closed |
| 2026-06-27 | JOB-SPINE-01 **accepted closed**; P1-JOBS-API-001 registered; next batch OUTCOME-STAMP-01 queued |
| 2026-06-27 | **JOB-SPINE-01** — W04-API-02 + W06-API-03 pass (`test:w04-w06-job-spine:write`); W04/W06-DRIFT-001 closed |
| 2026-06-26 | Cross-workflow audit — test priority queue for JOB-SPINE-01; stale summary note |
| 2026-06-26 | W17-P4 Planner UI minimum — W17-REQ-PLAN-01 (tab/grid/nav + week load) · -02 (create) · -03 (edit-by-replace + delete) · -04 (duplicate 409) · -05 (no timesheet side effect) · -06 (advisory-only: no timesheet/approve/sync/Buildxact + protected routes intact); `test:w17-planner-baseline:write` **12/12** |
| 2026-06-26 | W17-P3 preview panel (Option B, inline) — W17-REQ-PREVIEW-01 (route task set) / -02 (read-only UI) / -03 (Team panel) + PREVIEW-AUTHZ + PREVIEW-JOBS; `test:w17-worker-tasks:write` **22/22** |
| 2026-06-26 | W17-P3 preview UI (Option B) — W17-REQ-PREVIEW-UI (Team panel) + W17-REQ-PREVIEW-03 (worker visible-jobs) added; `test:w17-worker-tasks:write` **21/21**; W15 19/19 + W16 14/14 |
| 2026-06-26 | W17-P3 Worker tasks/category/preview — W17-REQ-TASK-01..06 + W17-REQ-PREVIEW-01..02 + W17-REG pass (`test:w17-worker-tasks:write` 19/19); W15 19/19 + W16 14/14 green |
| 2026-06-26 | W17-P2 Snapshot — W17-REQ-TS-01..06 + W17-REG-01..05 pass (`test:w17-snapshot-review:write` 17/17); W15 19/19 + W16 14/14 green |
| 2026-06-22 | Batch D W18 release readiness review — [W18_CLIENT_PORTAL_RELEASE_READINESS_REVIEW.md](../W18_CLIENT_PORTAL_RELEASE_READINESS_REVIEW.md) |
| 2026-06-22 | W18-API-04 pass — finance notify regression 34/34 |
| 2026-06-22 | W18-DRIFT-008/009 fixed — home + media client_visible; photo test 15/15 |
| 2026-06-22 | W18-P0-03 pass — Journey `client_visible` filter; home/media gaps W18-DRIFT-008/009 |
| 2026-06-22 | W18-P0-02 pass — `test:w18-portal-void-guard:write` 14/14 |
| 2026-06-22 | W18-P0-01 verified closed — migrations 108/110 applied |
| 2026-06-22 | W18-P0-01 readiness plan — migrations 108/110 gate doc |
| 2026-06-22 | W18-P0-04 / GAP-10 closed — W18-SEC-02 pass in matrix |
| 2026-06-22 | W18 test plan — W18-SEC-01–UI-02 in matrix |
| 2026-06-25 | W09 test plan complete — W09-API-01–08, UI/E2E/SEC |
| 2026-06-25 | W05-UI-02 verified; W05-TEST-001 closed |
| 2026-06-25 | Regression run logged; W03-API-05 pass; W05-UI-02 E2E partial (W05-TEST-001) |
| 2026-06-24 | Block 2 P0-A3/A4 pass in matrix |
| 2026-06-24 | Block 1 complete — P0-A6 W05-API-05 pass |
| 2026-06-24 | P0-A5 baseline (W05-UI-02, W05-API-08); Batch B parking W07-DRIFT-004/005 |
| 2026-06-24 | Batch A §6 skeletons linked (scripts/batch-a + e2e/workflows/batch-a) |
| 2026-06-22 | W01 Lead/CRM intake matrix added |
| 2026-06-22 | RFQ/tender + matcher matrix |
