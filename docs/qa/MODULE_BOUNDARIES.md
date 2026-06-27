# Module Boundaries

**Status:** 2026-06-22  
**Purpose:** Module → pages → route files → key tables. Used for hardening scope control (no cross-module drive-by edits).

---

## Sales Manager (`/sales`)

| Layer | Location |
|-------|----------|
| **Pages** | `SalesPipeline.jsx`, `LeadDetail.jsx`, `SalesManager.jsx` (tabs) |
| **Components** | `SalesScorecard.jsx`, `CrmDashboard.jsx`, `CrmContacts.jsx`, `ContactDrawer.jsx` |
| **Routes** | `server/lib/salesRoutes.mjs`, `server/lib/crmRoutes.mjs` (contacts/convert) |
| **Tables** | `leads`, `lead_activities`, `lead_notes`, `lead_conversations`, `lead_documents`, `crm_contacts`, `crm_interactions` |
| **Workflow doc** | [workflows/01_LEAD_CRM_INTAKE.md](./workflows/01_LEAD_CRM_INTAKE.md) |
| **Public intake** | `POST /api/public/enquiry` in `marketingIntelligenceRoutes.mjs` |

**Handoff to Tender:** `POST /api/sales/leads/:id/convert-to-job` → `jobs` → RFQ Engine / Tender Board

---

## Tender Manager (`/tender-manager`)

| Layer | Location |
|-------|----------|
| **Pages** | `RfqEngine.jsx`, `RfqPackageList.jsx`, `RfqPackageDetail.jsx`, `TenderBoard.jsx`, `TenderDetail.jsx` |
| **Routes** | `rfqPackageRoutes.mjs`, `module4Routes.mjs`, `dev-api.mjs` (rfq/send, imap) |
| **Tables** | `jobs`, `rfqs`, `rfq_packages`, `rfq_trade_scopes`, `rfq_recipients`, `unmatched_quote_emails` |
| **Workflow doc** | [RFQ_TENDER_WORKFLOW_SOURCE_OF_TRUTH.md](./RFQ_TENDER_WORKFLOW_SOURCE_OF_TRUTH.md) |

---

## Operations (`/operations`)

| Layer | Location |
|-------|----------|
| **Routes** | `module6Routes.mjs`, `operationsRoutes.mjs` |
| **Tables** | `projects`, `schedule_tasks`, `site_diary`, WHS tables |

---

## Finance (`/finance`)

| Layer | Location |
|-------|----------|
| **Routes** | `financeRoutes.mjs`, `financeCCRoutes.mjs` |
| **Tables** | `financial_documents`, progress claims, variations |

---

## Client Portal (`/portal`)

| Layer | Location |
|-------|----------|
| **Routes** | `portalV2Routes.mjs`, `portalV2AdminRoutes.mjs` |
| **Tables** | `projects`, portal v2 tables |

---

## Cross-cutting

| Concern | Location |
|---------|----------|
| Auth | `requireAuth.mjs`, `requirePortalAuth.mjs` |
| Constants | `src/lib/constants.js` (`LEAD_STAGES`, job statuses) |
| Facts / provenance | `factsService.mjs`, `jobFactRegistry.mjs` |

---

## Hardening rules (from roadmap)

- Touch only the module owning the workflow under fix
- No god-file splits until regression tests exist
- Extend `docs/qa/workflows/` before code changes

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-22 | Initial — Sales + Tender from W01/W02 |
