# Workflow Ownership Matrix

**Status:** 2026-06-22  
**Purpose:** Per-workflow ownership of tables, screens, and routes. Declares source of truth before fixes.

---

## Workflow 01 — Lead / Enquiry / CRM Intake

Full detail: [workflows/01_LEAD_CRM_INTAKE.md](./workflows/01_LEAD_CRM_INTAKE.md)

### Table ownership

| Table | Owns | Does not own |
|-------|------|--------------|
| `leads` | Stage, qualification, site_address (pre-job), next action, job_id link | Job operational facts post-conversion |
| `lead_activities` | Timeline / audit (create, stage, activities) | Freeform editable notes |
| `lead_notes` | Editable notes | Timeline |
| `lead_conversations` | Transcripts + AI apply record | CRM-wide history |
| `crm_contacts` | Long-term contact, converted_lead_id | Per-lead stage |
| `crm_interactions` | Contact touchpoints | Lead timeline (today) |
| `jobs` | Canonical project after conversion | Pre-conversion qualification |

### Screen ownership

| Screen | Primary writes | Primary reads |
|--------|----------------|---------------|
| SalesPipeline | POST `/api/sales/leads`, PATCH stage (ungated) | GET `/api/sales/leads` |
| LeadDetail | PATCH lead, activities, conversations, convert | GET lead + activities |
| CrmContacts / ContactDrawer | CRM convert, interact | crm_contacts |
| SalesScorecard | — | GET `/api/sales/scorecard` |

### Route ownership

| Route | Owner file |
|-------|------------|
| `/api/sales/*` | `server/lib/salesRoutes.mjs` |
| `/api/crm/contacts/:id/convert` | `server/lib/crmRoutes.mjs` |
| `/api/public/enquiry` | `server/lib/marketingIntelligenceRoutes.mjs` |

---

## Workflow 02 — Lead Qualification / Discovery

Full detail: [workflows/02_LEAD_QUALIFICATION_DISCOVERY.md](./workflows/02_LEAD_QUALIFICATION_DISCOVERY.md)

### Table ownership

| Table | Owns (W02) |
|-------|------------|
| `leads` | Stage, qualify_* + qualify_score, discovery/winning-offer fields, nurture/lost columns, next_action |
| `lead_activities` | Stage changes, logged contact, conversation-apply summaries |
| `lead_conversations` | Transcripts, bp_suggestions, applied_suggestions |
| `lead_notes` | Editable notes (not timeline) |

### Screen ownership

| Screen | Primary writes | Primary reads |
|--------|----------------|---------------|
| LeadDetail | PATCH lead, activities, conversations, nurture/lost | GET lead + activities + conversations |
| SalesPipeline | PATCH stage (ungated) | GET leads |
| SalesScorecard | — | GET `/api/sales/scorecard` |

### Route ownership

| Route | Owner file |
|-------|------------|
| `PATCH /api/sales/leads/:id` | `salesRoutes.mjs` |
| `POST /api/sales/leads/:id/activities` | `salesRoutes.mjs` |
| `POST /api/sales/leads/:id/conversations*` | `salesRoutes.mjs` |
| `POST /api/blueprint/chat` | `blueprintRoutes.mjs` |
| `GET /api/sales/scorecard` | `salesRoutes.mjs` |

---

## Workflow 03 — Fee Proposal / PTSA

Full detail: [workflows/03_FEE_PROPOSAL_PTSA.md](./workflows/03_FEE_PROPOSAL_PTSA.md)

### Table ownership

| Table | Owns |
|-------|------|
| `leads` | PTSA status, services, scope, signed PDF path, preconstruction_fee, winning-offer fields |
| `fee_proposals` | Fee proposal content, status, output metadata, job link |
| `lead_documents` | Signed PTSA PDF row (`ptsa_signed`) |
| `buildexact_estimates` | Parsed estimate snapshot (Track A — Fee Proposal import) |
| `jobs` | Post-conversion only — not draft proposal SoT |

### Screen ownership

| Screen | Primary writes | Primary reads |
|--------|----------------|---------------|
| LeadDetail (PTSA) | API: PATCH lead, mark-signed, generate-docx | GET lead |
| FeeProposalWizard | Supabase `fee_proposals` + API parse/generate/send | fee_proposals, jobs, leads |
| FeeProposalList | — | Supabase fee_proposals |

### Route ownership

| Route | Owner file |
|-------|------------|
| `/api/sales/leads/:id/ptsa/*` | `salesRoutes.mjs` |
| `/api/fee-proposal/*` | `module5Routes.mjs` |
| `/api/fee-proposal/:id/accept` | `buildexactIntegrationRoutes.mjs` |
| `/api/finance/fee-proposals/:id/accept` | `financeRoutes.mjs` |
| `/api/settings/fee-proposal-template` | `module5Routes.mjs` |

---

## Workflow 04 — Estimate / Buildxact / Tender Job Setup

Full detail: [workflows/04_ESTIMATE_BUILDXACT_TENDER_SETUP.md](./workflows/04_ESTIMATE_BUILDXACT_TENDER_SETUP.md)

### Table ownership

| Table | Owns (W04) |
|-------|------------|
| `jobs` | Tender spine: address, client, status, `lead_id`, `buildexact_job_id`, RFQ extracted fields |
| `leads` | `job_id` link after conversion |
| `buildexact_estimates` | Imported/pulled estimate snapshots |
| `buildexact_job_sync` | Buildxact financial mirror |
| `projects` | Operations row; redundant BX link + provenance |

### Screen ownership

| Screen | Primary writes | Primary reads |
|--------|----------------|---------------|
| LeadDetail | convert-to-job | lead + job_id gate |
| RfqEngine | POST/PATCH jobs API; direct Supabase in persistRfqs | extraction, jobs |
| FeeProposalWizard | parse estimate API | jobs, buildexact_estimates |
| OperationsProjectDetail | manual buildexact link | project, jobs |
| TenderBoard | — | jobs + rfqs |

### Route ownership

| Route | Owner file |
|-------|------------|
| `POST /api/sales/leads/:id/convert-to-job` | salesRoutes.mjs |
| `POST/PATCH /api/jobs` | jobsApiRoutes.mjs |
| `POST /api/fee-proposal/parse-*` | module5Routes.mjs |
| `GET /api/buildexact/job/:id/estimate` | buildexactIntegrationRoutes.mjs |
| `POST /api/webhooks/buildexact` | buildexactWebhook.mjs |

---

## Workflow 05 — Tender Board / Tender Lifecycle

Full detail: [workflows/05_TENDER_BOARD_LIFECYCLE.md](./workflows/05_TENDER_BOARD_LIFECYCLE.md)

### Table ownership

| Table | Owns (W05) |
|-------|------------|
| `jobs` | Tender status, won_at/lost_at, address, client, lead_id link |
| `rfqs` | Per-trade quote lifecycle (board progress ring source) |
| `projects` | Operations project created/enriched on win |
| `correspondence` | Logged RFQ messages |
| `cost_intelligence` | Accepted trade quotes seeded on win |
| `purchase_orders` | Post-win batch PO issue |
| `leads` | **Read only** in prefill — not updated on win/lose (drift) |

### Screen ownership

| Screen | Primary writes | Primary reads |
|--------|----------------|---------------|
| TenderBoard | Supabase archive; API delete | Supabase jobs + rfqs |
| TenderDetail | win/lose APIs; PATCH rfq; Supabase correspondence/archive | Supabase jobs + rfqs + correspondence |

### Route ownership

| Route | Owner file |
|-------|------------|
| `POST /api/tender/win-finalize` | module4Routes.mjs |
| `POST /api/tender/lose-finalize` | module4Routes.mjs |
| `POST /api/tender/outcome-mails` | module4Routes.mjs |
| `POST /api/tender/job-delete` | jobsApiRoutes.mjs |
| `GET /api/tender/batch-po-check/:jobId` | module4Routes.mjs |
| `PATCH /api/rfq/:rfqId` | buildexactIntegrationRoutes.mjs |

---

## RFQ / Tender — cross-cutting reference (Batch B, not W02)

Full detail: [RFQ_TENDER_WORKFLOW_SOURCE_OF_TRUTH.md](./RFQ_TENDER_WORKFLOW_SOURCE_OF_TRUTH.md)

### Table ownership (summary)

| Table | Role |
|-------|------|
| `jobs` | Tender/project record |
| `rfq_packages` | Main RFQ workflow |
| `rfq_trade_scopes` | Per-trade scope |
| `rfq_recipients` | Invitations + response |
| `rfqs` | Email/quote transaction layer |
| `unmatched_quote_emails` | Inbound quote queue |

---


## Workflow 06 — RFQ Package / Scope Extraction

Full detail: [workflows/06_RFQ_PACKAGE_SCOPE_EXTRACTION.md](./workflows/06_RFQ_PACKAGE_SCOPE_EXTRACTION.md)

### Table ownership

| Table | Owns (W06) | Does not own |
|-------|------------|--------------|
| `rfq_packages` | Package metadata, `extraction_data`, trade intelligence, coverage | Email Message-IDs, per-trade quote amounts |
| `rfq_trade_scopes` | Scope bullets, exclusions, questions, trade status | Subcontractor email threading |
| `rfq_recipients` | Invitation state, `rfq_id` link, manual quote fields | Canonical job address |
| `rfqs` | Email transaction (`sent_message_id`, quote lifecycle) | Package structure / scope text |
| `jobs` | Address, client, `extracted_data`, Dropbox paths | Per-recipient send state |

### Screen ownership

| Screen | Primary writes | Primary reads |
|--------|----------------|---------------|
| RfqEngine | extract, persist job, `persistRfqs`, send, finalize package | prefill, trade registry |
| RfqPackageList | — | packages, direct rfqs, unmatched |
| RfqPackageDetail | scope PATCH, add scope, send-scope | package detail API |

### Route ownership

| Route | Owner file |
|-------|------------|
| `POST /api/rfq/extract` | `server/dev-api.mjs` |
| `GET /api/tender/prefill` | `server/lib/rfqPackageRoutes.mjs` |
| `/api/rfq-packages/*` | `server/lib/rfqPackageRoutes.mjs` |
| `POST /api/rfq/send` | `server/dev-api.mjs` |
| `POST/PATCH /api/jobs` | `server/lib/jobsApiRoutes.mjs` (extraction job sync) |

---

## Workflow 07 — RFQ Send / Quote Matching

Full detail: [workflows/07_RFQ_SEND_QUOTE_MATCHING.md](./workflows/07_RFQ_SEND_QUOTE_MATCHING.md)

### Table ownership

| Table | Owns (W07) | Does not own |
|-------|------------|--------------|
| `correspondence` | Outbound/inbound email audit (`logged_by` tags) | Scope bullets, package metadata |
| `rfqs` | `sent_message_id`, `resend_email_id`, quote lifecycle, amounts | Package recipient slots (unless linked) |
| `rfq_recipients` | Per-recipient send/receive state when package path used | IMAP candidate pool (email-only gap) |
| `unmatched_quote_emails` | Inbound safety queue | Full MIME/PDF storage |
| `rfq_events` | Resend engagement events | Quote matching |

### Screen ownership

| Screen | Primary writes | Primary reads |
|--------|----------------|---------------|
| RfqEngine | `POST /api/rfq/send` | transport status |
| RfqPackageDetail | `POST .../scopes/:tradeId/send` | recipient quote state |
| RfqPackageList | `POST /api/unmatched-quotes/resolve` | unmatched queue |

### Route ownership

| Route | Owner file |
|-------|------------|
| `POST /api/rfq/send` | `server/dev-api.mjs` |
| `POST .../scopes/:tradeId/send` | `server/lib/rfqPackageRoutes.mjs` |
| `pollImapForQuoteReplies` / `POST /api/imap/quote-poll` | `server/dev-api.mjs` |
| `GET /api/quote-tracker/unmatched` | `server/dev-api.mjs` |
| `POST /api/unmatched-quotes/resolve` | `server/lib/jobsApiRoutes.mjs` |
| `sendPlainMail` / transport | `server/lib/notifyMail.mjs` |
| Matcher | `server/lib/imapQuoteMatch.mjs` |
| Propagation | `server/lib/rfqQuotePropagation.mjs` |
| Resend engagement | `server/lib/rfqEngagement.mjs`, `server/lib/crmRoutes.mjs` |

---

## Workflow 08 — Quote Comparison / Accept Quote

Full detail: [workflows/08_QUOTE_COMPARISON_ACCEPT_QUOTE.md](./workflows/08_QUOTE_COMPARISON_ACCEPT_QUOTE.md)

### Table ownership

| Table | Owns (W08) | Does not own |
|-------|------------|--------------|
| `rfqs` | `quote_amount`, `quoted_amount`, accept/decline `status` | Package scope bullets |
| `rfq_recipients` | Per-recipient accept + `quote_amount` | Auto-extraction (`quoted_amount` on rfqs only) |
| `cost_intelligence` | Per-trade accepted amounts (on win-finalize) | Accept-time writes |
| `projects.accepted_trades` | Win snapshot jsonb | Pre-win accept state |

### Screen ownership

| Screen | Primary writes | Primary reads |
|--------|----------------|---------------|
| TenderDetail | Accept/decline via PATCH rfq; win wizard | `rfqs`, extracted vs confirmed amounts |
| RfqPackageDetail | Quote Update modal → PATCH recipient | Comparison table, recipient status |
| RfqPackageList (Direct) | Manual `quote_amount` on rfqs | No accept UI |

### Route ownership

| Route | Owner file |
|-------|------------|
| `PATCH /api/rfq/:rfqId` | buildexactIntegrationRoutes.mjs |
| `POST /api/rfq/:rfqId/reextract-amount` | dev-api.mjs |
| `PATCH .../recipients/:recipientId` | rfqPackageRoutes.mjs |
| `POST /api/tender/win-finalize` | module4Routes.mjs |

---

## Workflow 09 — Tender Win / Operations Handoff

Full detail: [workflows/09_TENDER_WIN_OPERATIONS_HANDOFF.md](./workflows/09_TENDER_WIN_OPERATIONS_HANDOFF.md)

### Table ownership

| Table | Owns (W09) | Does not own |
|-------|------------|--------------|
| `jobs` | `status`, `won_at`, contract value carry on win | Lead stage sync |
| `projects` | Operations spine; `accepted_trades` snapshot; portal client identity carry | Schedule tasks, portal enable flag |
| `rfqs` | Final accept/decline/not_required on win | Package-only accepts (unless mirrored) |
| `cost_intelligence` | Per-trade rows on win (`quote_amount > 0`) | Pre-win accept writes |
| `purchase_orders` | — (post-win via po/issue only) | Auto-create on win |
| `leads` | — | **Not updated on win** (drift) |
| `rfq_recipients` | — | **Not read on win** (drift) |
| `schedule_tasks` | — | Not created on win |
| `procurement_items` | — | Not created on win |
| `whs_site_profiles` | — | Not created on win |

### Screen ownership

| Screen | Primary writes | Primary reads |
|--------|----------------|---------------|
| TenderDetail | win-finalize; outcome-mails; batch PO | `rfqs` win wizard rows |
| Operations landing | — | `projects` via `/api/operations/projects` |
| OperationsProjectDetail | Manual schedule/procurement/WHS | Post-win readiness alerts |

### Route ownership

| Route | Owner file |
|-------|------------|
| `POST /api/tender/win-finalize` | module4Routes.mjs |
| `POST /api/tender/outcome-mails` | module4Routes.mjs |
| `GET /api/tender/batch-po-check/:jobId` | module4Routes.mjs |
| `POST /api/po/issue` | module4Routes.mjs |
| `GET /api/operations/projects` | operationsRoutes.mjs |

---

## Workflow 10 — Procurement Planning / Register

Full detail: [workflows/10_PROCUREMENT_PLANNING_REGISTER.md](./workflows/10_PROCUREMENT_PLANNING_REGISTER.md)

| Table | Owns (W10) |
|-------|------------|
| `procurement_items` | Register lifecycle |
| `procurement_templates` | Read (seed) |
| `suppliers` | CRUD |

| Route | Owner |
|-------|-------|
| `/api/procurement/*` | `procurementRoutes.mjs` |

---

## Workflow 11 — Purchase Orders / Supplier Commitments

Full detail: [workflows/11_PURCHASE_ORDERS_SUPPLIER_COMMITMENTS.md](./workflows/11_PURCHASE_ORDERS_SUPPLIER_COMMITMENTS.md)

| Table | Owns (W11) |
|-------|------------|
| `purchase_orders` | Sub PO via `/api/po/issue`; materials via procurement `issue-po` |

| Route | Owner |
|-------|-------|
| `POST /api/po/issue` | `module4Routes.mjs` |
| `GET /api/tender/batch-po-check/:jobId` | `module4Routes.mjs` |

---

## Workflow 12 — Scheduling / Critical Path / EOT

Full detail: [workflows/12_SCHEDULING_CRITICAL_PATH_EOT.md](./workflows/12_SCHEDULING_CRITICAL_PATH_EOT.md)

| Table | Owns (W12) |
|-------|------------|
| `schedule_tasks` | Task CRUD, deps, baseline |
| `schedule_eot` | EOT claims |
| `schedule_templates` | Template library |

| Route | Owner |
|-------|-------|
| `/api/schedule/*` | `scheduleRoutes.mjs` |
| `/api/operations/*` | `operationsRoutes.mjs` |

---

## Workflow 13 — Site Operations / Site Diary / Media

Full detail: [workflows/13_SITE_OPERATIONS_DIARY_MEDIA.md](./workflows/13_SITE_OPERATIONS_DIARY_MEDIA.md)

| Table | Owns (W13) |
|-------|------------|
| `site_diary` | Diary entries |
| `site_tasks` | Shared with W15 |

| Route | Owner |
|-------|-------|
| `/api/diary/*` | `siteDiaryRoutes.mjs` |
| `/api/projects/:id/site-tasks` | `workforceRoutes.mjs` |

---

## Workflow 14 — WHS / Inductions / SWMS / Incidents

Full detail: [workflows/14_WHS_INDUCTIONS_SWMS_INCIDENTS.md](./workflows/14_WHS_INDUCTIONS_SWMS_INCIDENTS.md)

| Table | Owns (W14) |
|-------|------------|
| `whs_site_profiles` | WHS profile |
| `site_inductions` | Induction records |
| `site_reports` | Incidents |
| `contractor_compliance` | Sub compliance |

| Route | Owner |
|-------|-------|
| `/api/whs/*` (legacy) | `whsRoutes.mjs` |
| `/api/whs/projects/*` (engine) | `whs/whsEngineRoutes.mjs` |
| `/api/induction/*` | `inductionRoutes.mjs` |

---

## Workflow 15 — Workforce / Timesheets / Buildxact Work Orders

Full detail: [workflows/15_WORKFORCE_TIMESHEETS_BUILDXACT_WORK_ORDERS.md](./workflows/15_WORKFORCE_TIMESHEETS_BUILDXACT_WORK_ORDERS.md)

| Table | Owns (W15) |
|-------|------------|
| `timesheets` / `timesheet_entries` | Workforce |
| `employees` | Team directory |
| `workforce_settings` | BX sync mode, cost codes |

| Route | Owner |
|-------|-------|
| `/api/workforce/*`, `/api/worker/*` | `workforceRoutes.mjs` |

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-25 | W10–W15 ownership blocks |
| 2026-06-25 | W08 ownership block |
| 2026-06-25 | W07 ownership block |
| 2026-06-24 | W05 ownership block |
| 2026-06-24 | W04 ownership block |
| 2026-06-24 | W03 ownership block; Track A estimate import label |
| 2026-06-22 | W01 + W02 ownership |
