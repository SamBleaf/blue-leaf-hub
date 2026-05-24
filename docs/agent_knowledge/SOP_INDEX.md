# Blue Leaf Hub — Agent SOP Index

> Last updated: 2026-05-21
> This is the agent-facing SOP index. For the user-facing SOP index, see /docs/sops/SOP_INDEX.md

---

## Purpose

This index maps business workflows to system implementation so agents can understand the "why" behind every feature, not just the "what".

---

## SOP Coverage Status

| Module | SOPs Planned | SOPs Written | Status |
|--------|-------------|--------------|--------|
| Getting Started (00) | 3 | 3 | Draft |
| Navigation (01) | 2 | 2 | Draft |
| Sales (02) | 7 | 1 | Draft (1/7) |
| Tendering (03) | 4 | 0 | Not started |
| RFQ Engine (04) | 9 | 0 | Not started |
| Operations (05) | 6 | 0 | Not started |
| Scheduling (06) | 8 | 0 | Not started |
| Site Diary (07) | 3 | 0 | Not started |
| WHS (08) | 6 | 0 | Not started |
| Finance (09) | 10 | 0 | Not started |
| Workforce (10) | 1 | 0 | Not started |
| Client Portal (11) | 9 | 0 | Not started |
| Admin Settings (12) | 6 | 0 | Not started |
| Subcontractors (13) | 3 | 0 | Not started |
| Cost Intelligence (14) | 2 | 0 | Not started |
| **Total** | **82** | **6** | **7% complete** |

---

## System Behaviour Behind Each Key SOP

### SOP 02-01: Create a New Lead
**Route**: `/sales` → + New Lead button
**API**: `POST /api/sales/leads`
**DB**: `leads` (stage defaults to `enquiry`)
**Behaviour**: Lead created with minimal required fields. `lead_activities` record auto-created on save.

### SOP 04-01: Create a New RFQ Package
**Route**: `/tender-manager/rfq-packages` → + New Package
**API**: `POST /api/rfq-packages`
**DB**: `rfq_packages` (job_id REQUIRED — NOT NULL since migration 039)
**Behaviour**: Package created linked to a job. Trade scopes added from trade master library + custom additions.

### SOP 04-04: Send RFQs to Subcontractors
**Route**: RFQ Package Detail → Send button
**API**: `POST /api/rfq/send`
**DB**: `rfq_recipients` (status updated), `rfqs` (sent_at set)
**Behaviour**: Gmail OAuth sends personalised emails per recipient. Dropbox saves copy. IMAP polling begins watching for replies.

### SOP 06-01: Create a Project Schedule
**Route**: `/operations/:projectId/schedule` → Generate Schedule
**API**: `POST /api/schedule/generate`
**DB**: `schedule_tasks` (37-task residential template as starting point)
**Behaviour**: Claude generates tasks from project description. All tasks created with soft-delete version (deleted_at IS NULL). Ripple cascade available on date changes.

### SOP 09-01: Upload an Invoice
**Route**: `/finance` → Upload Invoice or auto-arrival via IMAP
**API**: `POST /api/finance/documents` or auto via IMAP
**DB**: `financial_documents` (status: pending)
**Behaviour**: PDF/image saved. Claude AI extracts supplier, amount, date, trade. Queued in approval queue.

### SOP 09-08: Create a Progress Claim
**Route**: `/finance/jobs/:jobId` → Progress Claims tab
**API**: `POST /api/jobs/:jobId/finance/claims`
**DB**: `progress_claims`, `progress_claim_payments`
**Behaviour**: Claim created against the WIPAA schedule. % claimed calculated. Invoice generated.

### SOP 11-01: Enable Client Portal
**Route**: `/portal-admin/:projectId`
**API**: `POST /api/portal/projects/:projectId/enable`
**DB**: `projects` (portal_token set, is_portal_enabled = true)
**Behaviour**: Unique token generated. Shareable URL: `/portal/:token`. Client name/email stored. No client login required — token IS the credential.

---

## Blueprint System Prompts (Internal Reference)

Blueprint AI behaves differently depending on mode:

| Mode | Trigger | Prompt file | Claude model |
|------|---------|-------------|-------------|
| Chat | Widget chat | `src/blueprint/agent/systemPrompt.js` | claude-sonnet-4-6 |
| Transcript analysis | Lead > Conversations | Inline in `salesRoutes.mjs` | claude-opus-4-5 |
| Blueprint Insight | Lead > Blueprint Insight tab | Via `/api/blueprint/chat` + lead context | claude-sonnet-4-6 |
| RFQ QC | Before RFQ send | `blueprintQc.js` | claude-sonnet-4-6 |
| Document review | Widget > Review | Via `/api/blueprint/review-document` | claude-sonnet-4-6 |
| SOP generation | Widget > SOP | Via `/api/blueprint/generate-sop` | claude-sonnet-4-6 |

**Critical API convention**: Blueprint chat endpoint returns `{ reply: "..." }`. Frontend must read `j.reply`, NOT `j.response` or `j.message`.
