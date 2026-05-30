# Blue Leaf Hub — Module Relationships

> Field-level canonical authority is `MASTER_DATA_DICTIONARY.md`. This doc is the entity/lifecycle/module view; where they differ, the dictionary wins.

> Last updated: 2026-05-21

---

## Module Dependency Map

```
SALES MANAGER
  │  creates Lead record
  │  qualifies via APB scorecard
  │  Blueprint coaching on lead context
  │  transcript analysis → suggested actions
  ▼
TENDER MANAGER (RFQ Engine)
  │  Lead links to Job via lead_id FK (migration 035)
  │  Job created from Buildexact import or manual entry
  │  AI extracts scope from blueprints/PDFs
  ▼
RFQ PACKAGES
  │  Trade scopes grouped into packages
  │  Sent to subcontractors via email
  │  Quotes tracked on return
  ▼
FEE PROPOSAL
  │  Buildexact XLSX/PDF parsed → structured proposal
  │  DOCX generated from template
  │  PDF exported, uploaded to Dropbox, emailed to client
  ▼
TENDER BOARD
  │  Win/Loss decision
  │  Win → creates Project record
  │  PO issued to preferred subcontractors
  │  Buildexact job status synced
  ▼
OPERATIONS MANAGER
  │  Project created from winning tender (Job)
  │  Job address syncs to Project via trigger
  │  Buildexact Job ID linked
  ▼
SCHEDULE MANAGER
  │  AI generates schedule from project description
  │  Tasks organised by phase, with dependencies
  │  Gantt / Sheet / Calendar / Delays / Dep Map views
  │  Baseline locked; EOT tracked
  │  Schedule tasks link to Buildexact cost categories
  ▼
WHS MANAGER
  │  Subcontractor compliance documents per project
  │  SWMS uploaded and tracked
  │  Site inductions (public QR form)
  │  Incidents logged and resolved
  ▼
SITE DIARY
  │  Daily entries: weather, trades, progress notes
  │  Voice capture → AI structures entry
  │  Linked to project
  ▼
FINANCE MANAGER
  │  Invoice inbox: email/PDF auto-extracted
  │  Matched to job + trade category
  │  Approval workflow
  ▼
JOB COMMAND CENTRE
  │  Per-job budget vs committed vs invoiced
  │  Progress claims (WIPAA)
  │  Variations (change orders)
  │  Margin tracking, forecast
  ▼
CLIENT PORTAL
  │  Token-based shareable URL (no app login)
  │  Weekly updates, progress photos
  │  Milestones, decisions, allowances
  │  Messages, site walk bookings
  │  Warranty items post-handover
  ▼
BLUEPRINT AI (cross-cutting)
  │  Available on every screen via AppShell widget
  │  Knows current page context (BlueprintContext)
  │  RFQ QC before sending
  │  SOP generation
  │  Document review
  │  Coaching conversations
```

---

## Module Detail

### Sales Manager
- **Tables**: `leads`, `lead_activities`, `lead_documents`, `lead_notes`, `lead_conversations` (qualifying scores live as `qualify_*` columns on `leads` (migration 016), not a separate table)
- **Depends on**: Nothing (entry point of system)
- **Feeds into**: Tender Manager (via `lead_id` on `jobs`)
- **AI**: Transcript analysis (claude-opus-4-5), Blueprint coaching (claude-sonnet-4-6)
- **Key logic**: APB 8-stage pipeline enforcement, qualifying scorecard weighted scoring
- **Integration**: None (self-contained)

### Tender Manager / RFQ Engine
- **Tables**: `jobs`, `rfqs`, `subcontractors`, `custom_trades`, `unmatched_quote_emails`, `buildexact_estimates`, `job_knowledge`
- **Depends on**: Sales (optional lead link), Buildexact (job import), Dropbox (document storage)
- **Feeds into**: RFQ Packages, Fee Proposals, Tender Board
- **AI**: RFQ scope extraction (Claude), subcontractor lookup
- **Integration**: Buildexact (job sync), Dropbox (folder creation, document upload), IMAP (quote matching), Gmail/SMTP (RFQ emails)

### RFQ Packages
- **Tables**: `rfq_packages`, `rfq_trade_scopes`, `rfq_recipients`, `rfq_addenda`, `trade_master_library`
- **Depends on**: Jobs (job_id required — migration 039 enforces NOT NULL), Subcontractors, Trade Master Library
- **Feeds into**: Quote tracking, Tender Board (quote comparison)
- **AI**: AI enrichment of scope items from trade master library
- **Note**: Replaces old Quote Tracker (route now redirects)

### Fee Proposals
- **Tables**: `fee_proposals`
- **Depends on**: Jobs (linked via job address or Buildexact ID), Buildexact (XLSX/PDF parse), Google Drive (DOCX editing), Dropbox (PDF storage)
- **Feeds into**: Client (emailed PDF), Tender Board (status sync)
- **AI**: None directly (structured data entry)
- **Integration**: Buildexact (parse), Google Drive (DOCX → Google Doc → PDF), Dropbox (store), Gmail (send)

### Tender Board
- **Tables**: `jobs` (win/loss fields), `purchase_orders`, `correspondence`
- **Depends on**: Jobs (all tender data), RFQ Packages (quote amounts)
- **Feeds into**: Operations (creates Project on win), Subcontractors (PO issued)
- **AI**: None
- **Integration**: Buildexact (status sync on win/loss)

### Cost Intelligence
- **Tables**: `cost_intelligence`, `project_metrics`, `normalized_costs`, `cost_benchmarks`, `cost_intelligence_insights`, `pretender_estimates`
- **Depends on**: Historical job data, Trade Master Library
- **Feeds into**: Fee Proposals (estimated costs), Schedule (cost benchmarks)
- **AI**: Cost estimation engine (Claude), insight generation

### Operations Manager (Project List)
- **Tables**: `projects` (with schedule summary computed)
- **Depends on**: Jobs (created from winning tender), Schedule Tasks (for health metrics)
- **Feeds into**: Schedule Manager, WHS Manager, Site Diary
- **Key logic**: Projects are only shown here after a tender is marked Won; global Gantt aggregates all active projects; trade conflict detection across projects

### Schedule Manager
- **Tables**: `schedule_tasks`, `task_dependencies`, `schedule_templates`, `schedule_eot`
- **Depends on**: Projects, Trade Master Library (trade_master_id FK), Buildexact (cost sync)
- **Feeds into**: Client Portal (timeline), Finance (procurement alerts), Operations Dashboard
- **AI**: AI schedule generation from project description + template (Claude)
- **Key library**: `scheduleUtils.js` — all schedule logic, ripple cascade, critical path, colour coding
- **Views**: Dashboard, Gantt, Sheet, Calendar, Delays, Dep Map

### WHS Manager
- **Tables**: `contractor_compliance`, `site_inductions`, `swms_templates`, `project_swms`, `site_reports`
- **Depends on**: Projects, Subcontractors
- **Feeds into**: Operations Dashboard (compliance alerts), Site Diary
- **AI**: Blueprint can review compliance documents

### Site Diary
- **Tables**: `site_diary`
- **Depends on**: Projects
- **Feeds into**: Client Portal (weekly updates), Finance (progress evidence)
- **AI**: Voice capture → Claude structures the diary entry

### Finance Manager
- **Tables**: `financial_documents`, `financial_approvals`
- **Depends on**: Jobs (invoice matching), Trade Categories (categorisation), Email (IMAP/Gmail receipt)
- **Feeds into**: Job Command Centre
- **AI**: Invoice extraction (Claude reads PDF/image, extracts amount/supplier/trade)
- **Integration**: IMAP (receive invoices by email), planned Xero sync

### Job Command Centre
- **Tables**: `job_budgets`, `job_budget_history`, `progress_claims`, `progress_claim_payments`, `job_variations`, `wipaa_reviews`, `financial_documents`, `trade_categories`
- **Depends on**: Jobs, Financial Documents, Schedule Tasks, Buildexact (budget import)
- **Feeds into**: Client Portal (budget view, variation approvals)
- **AI**: Margin risk analysis (Blueprint)
- **Key logic**: Budget vs committed vs invoiced per trade category; WIPAA progress claim schedule; variation tracking with contract value update (trigger on `jobs`)

### Client Portal
- **Tables**: `projects_clients`, `portal_updates`, `project_photos`, `portal_milestones`, `portal_decisions`, `portal_claims`, `portal_allowances`, `site_walks`, `warranty_items`, `portal_messages`, `home_finishes`, `warranty_periods`
- **Depends on**: Projects (portal_token), Schedule Tasks (timeline), Job Command Centre (budget/variations)
- **Feeds into**: Client (external, no app login required)
- **Key logic**: Token-based access — `/portal/:token/*` is completely public, no Supabase auth required

### Blueprint AI
- **Tables**: None (uses hub context passed in request)
- **Depends on**: Every module (reads BlueprintContext from current page)
- **Feeds into**: Every module (coaching, suggestions, QC, SOPs)
- **Routes**: `/api/blueprint/chat`, `/api/blueprint/learn`, `/api/blueprint/review-document`, `/api/blueprint/generate-sop`, `/api/blueprint/troubleshoot`

---

## Cross-Module Data Links

| From | To | Link | Mechanism |
|------|----|------|-----------|
| Lead | Job | `jobs.lead_id` | Manual/triggered (migration 035) |
| Job | Project | `projects.job_id` | Created on win in module4Routes |
| Job | Project address | `projects.address` | Sync trigger (migration 036) |
| Job | Variations → Contract value | `jobs.contract_value` | Trigger on `job_variations` (migration 034) |
| Project | Schedule Tasks | `schedule_tasks.project_id` | Foreign key |
| Project | Client Portal | `projects.portal_token` | Generated UUID |
| Job | Financial Documents | `financial_documents.job_id` | Matched by AI or manually |
| Job | RFQ Package | `rfq_packages.job_id` | NOT NULL FK (migration 039) |
| Schedule Task | Trade Master | `schedule_tasks.trade_master_id` | FK (migration 038) |
| Subcontractor | Trade Category | `subcontractors.trade_category_id` | FK (migration 040) |

---

## Orphan Risks

1. **Jobs without lead_id** — most jobs created before migration 035; `lead_id` is nullable, backfill attempted
2. **RFQ packages without job_id** — migration 039 enforces NOT NULL; orphans backfilled by address match or blocked
3. **Projects without jobs** — should not exist; `job_id` on projects is FK but watch for manual inserts
4. **Financial documents without job_id** — unmatched invoices in approval queue awaiting manual match
5. **Schedule tasks with deleted_at** — soft delete (migration 037); excluded from normal queries via partial index
