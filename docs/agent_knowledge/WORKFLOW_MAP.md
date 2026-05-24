# Blue Leaf Hub — Workflow Map

> Last updated: 2026-05-21
> Describes how real construction operations map to system workflows.

---

## Workflow 1: Lead to Tender

**Business context**: Client rings or emails enquiry. Blue Leaf qualifies them through the APB process before committing resources to tendering.

**System steps:**
1. **Create lead** → `/sales` → `SalesPipeline.jsx` → POST `/api/sales/leads`
   - Stage: `enquiry`
   - Captures: name, contact, project type, budget, location, source
2. **Qualify lead** → Lead detail tabs → qualifying scorecard
   - Stage moves: `qualify` → `discovery`
   - Blueprint coaching available on lead context
3. **Log meetings** → Conversations tab
   - Paste transcript → "Analyse with Blueprint" → Claude extracts suggestions
   - User approves/rejects suggestions → updates lead record
4. **Move to Fee Proposal stage** → `fee_proposal` stage
   - Creates fee proposal in Tender Manager
5. **Accept → Tender** → `accepted` → `tender` stages

**Key decisions:**
- APB scorecard score determines qualification proceed/nurture/disqualify
- Blueprint insight coaching is non-blocking — user decides what to action

---

## Workflow 2: RFQ and Tendering

**Business context**: Blue Leaf has won the right to tender. Needs to collect prices from subcontractors to build a competitive construction cost estimate.

**System steps:**
1. **Create/import job** → `/tender-manager/rfq-engine` → `RfqEngine.jsx`
   - Import from Buildexact or manual entry
   - Job address creates Dropbox folders automatically
2. **Upload blueprints/specs** → Dropbox `TENDER DOCS/` folder
3. **AI extracts RFQ scopes** → `POST /api/rfq/extract`
   - Claude reads uploaded documents, extracts trade scope items per trade
   - User reviews and edits extracted scopes
4. **Create RFQ Package** → `/tender-manager/rfq-packages` → `RfqPackageList.jsx`
   - Group trade scopes into packages
   - Add trade master library defaults
   - Select subcontractor recipients per trade
5. **Send RFQs** → `POST /api/rfq/send`
   - Gmail OAuth sends emails with scope + attachments
   - Dropbox saves copy of sent RFQ
6. **Quotes returned** → IMAP polling auto-matches, or manual upload
   - `unmatched_quote_emails` queue for failed auto-match
7. **Track quotes** → `RfqPackageDetail.jsx`
   - View per-trade quote status, amounts, due dates
   - Issue addenda if scope changes
8. **Compare and select** → Tender Board

---

## Workflow 3: Fee Proposal

**Business context**: Blue Leaf presents a fee proposal (their margin/management fee) to the client before the full tender is complete.

**System steps:**
1. **Start fee proposal** → `/tender-manager/fee-proposal/new` → `FeeProposalWizard.jsx`
2. **Import from Buildexact** → `POST /api/fee-proposal/parse-xlsx` or `parse-pdf`
   - Claude (or xlsx parser) extracts structured cost breakdown
3. **Edit structured fields** → Multi-step wizard
   - Allowances, inclusions, exclusions, contract terms
4. **Generate DOCX** → `POST /api/fee-proposal/generate-docx`
   - Fills docxtemplater template with proposal data
5. **Open in Google Docs** → DOCX uploaded to Drive → returns edit URL
   - User edits final layout/formatting in Google Docs
6. **Export PDF** → `POST /api/fee-proposal/export-pdf`
   - Drive converts to PDF → downloaded
7. **Send to client** → `POST /api/fee-proposal/send`
   - PDF uploaded to Dropbox `PRESALE DOCS/`
   - Email sent via Gmail with PDF attached
8. **Lead stage** → Moves to `fee_proposal` stage in Sales

---

## Workflow 4: Win and Project Creation

**Business context**: Tender complete, client accepts. Blue Leaf wins the job. Operations begins.

**System steps:**
1. **Mark tender as Won** → `TenderDetail.jsx` → win button → `POST /api/tender/:jobId/win`
   - Sets `jobs.won_at`, `jobs.outcome = 'won'`
   - Syncs Buildexact status
   - Sends outcome emails to losing subcontractors
2. **Project auto-created** → `projects` record inserted with `job_id` FK
   - `portal_token` generated (UUID)
   - Address synced from job
3. **Issue POs** → `TenderDetail.jsx` → issue PO → `POST /api/po/issue`
   - PO PDF generated (PDFKit)
   - Saved to Dropbox
   - Emailed to subcontractor
4. **Lead marked Won** → `leads.won_at` set (if lead exists)
5. **Project appears in Operations** → `/operations`

---

## Workflow 5: Schedule Management

**Business context**: Project won. Site supervisor needs a working schedule to manage trades, procurement, and milestones.

**System steps:**
1. **Open project** → `/operations/:projectId` → `OperationsProjectDetail.jsx`
2. **Generate schedule** → `ScheduleManager.jsx` → Generate button → `POST /api/schedule/generate`
   - Claude generates tasks from project description + template (37-task residential template)
   - Tasks created with phases, dependencies, procurement items
3. **Review and adjust** → 4 views:
   - **Gantt** — drag bars, resize, right-click context menu
   - **Sheet** — tabular edit, inline percent/status
   - **Calendar** — month calendar of tasks
   - **Delays** — EOT tracking, Extension of Time records
   - **Dep Map** — dependency network diagram (xyflow)
4. **Lock baseline** → Snapshots current dates to `baseline_start_date/end_date`
5. **Mark tasks complete** → Updates `percent_complete`, triggers ripple cascade preview
6. **Manage procurement** → Procurement tab — order-by dates, supplier, status
7. **Export Gantt PDF** → `POST /api/schedule/gantt-pdf`

**Ripple cascade**: When a task date changes, `previewRipple()` in `scheduleUtils.js` propagates shifts to all downstream tasks. `RippleWarningModal` shows affected tasks before applying.

---

## Workflow 6: WHS Compliance

**Business context**: Australian construction requires documented WHS compliance for all contractors on site.

**System steps:**
1. **Add contractor compliance** → `WhsManager.jsx` → subcontractor record → upload docs
   - Insurances, licences, SWMS stored
2. **Upload SWMS** → Per-project SWMS templates assigned
3. **Set up site induction** → QR code generated for project
4. **Visitor arrives on site** → Scans QR → `/induct/:projectId`
   - Public form (no app login)
   - Name, company, induction acknowledgment stored
5. **Log incident** → `WhsManager.jsx` → incident type → `POST /api/whs/incidents`
   - Severity, description, actions taken
6. **Resolve incident** → Update resolution notes, close

---

## Workflow 7: Finance — Invoice Processing

**Business context**: Subcontractor invoices arrive by email or upload. Need to be matched to job, approved, and filed.

**System steps:**
1. **Invoice arrives** → Email to IMAP inbox → auto-queued in Finance Manager
   - Or: manual upload via `/finance` → `FinanceManager.jsx`
2. **AI extraction** → `POST /api/finance/extract`
   - Claude reads invoice PDF/image
   - Extracts: supplier, amount, date, description, likely trade
3. **Review extraction** → `ApprovalQueue.jsx`
   - User confirms or corrects extracted fields
4. **Match to job** → Select job from dropdown
   - Trade category auto-suggested, user confirms
5. **Approve** → `POST /api/finance/approve`
   - Status → `approved`
   - Planned: Xero sync
6. **Job financials updated** → Visible in Job Command Centre

---

## Workflow 8: Progress Claims (WIPAA)

**Business context**: Blue Leaf bills clients on a progress schedule (WIPAA — Works In Progress At Agreement). Monthly claims based on construction stage completion.

**System steps:**
1. **Open Job Command Centre** → `/finance/jobs/:jobId`
2. **View progress claim schedule** → `ProgressClaims.jsx` component
3. **Create claim** → Select stages completed → claim amount calculated
4. **Review and send** → Invoice generated → sent to client
5. **Record payment** → `progress_claim_payments` updated
6. **Client portal** → Budget view shows claims made vs paid

---

## Workflow 9: Client Portal

**Business context**: Client wants to know what is happening on their build without calling Blue Leaf every day.

**System steps:**
1. **Enable portal for project** → `/portal-admin/:projectId` → `PortalAdmin.jsx`
   - Generate shareable link (portal_token)
   - Set client name, email
2. **Client accesses** → `https://hub.blueleafbuilding.com.au/portal/:token/*`
   - No login required — token is authentication
   - Views: Home, Timeline, Budget, Decisions, Conversations, Live Site, My Home, Journal
3. **Add weekly update** → `PortalAdmin.jsx` → `POST /api/portal/updates`
   - Title, summary, photos, video URL
4. **Client sees timeline** → Based on `schedule_tasks` milestones for that project
5. **Client requested decisions** → `portal_decisions` — select option, deadline set
6. **Variation shown to client** → `portal_claims` — accept/reject workflow
7. **Book site walk** → `site_walks` — request submitted
8. **Post-handover warranty** → `warranty_items`, `warranty_periods`

---

## Workflow 10: Blueprint AI

**Business context**: A construction operations consultant available at all times, inside the app.

**System steps:**
1. **Any screen** → Blueprint widget in AppShell (floating button, slide-in panel)
2. **Context** → `BlueprintContext` passes current page/entity to Blueprint
3. **Chat** → `POST /api/blueprint/chat` with messages + hub context
4. **Specialised modes:**
   - **QC check** → Before sending RFQ, Blueprint reviews scope for gaps
   - **Document review** → Upload doc → Blueprint reviews
   - **SOP generation** → Generate SOP for a workflow
   - **Troubleshooting** → Step through a problem
5. **Lead coaching** → Blueprint Insight tab on lead detail — coaches on APB stage actions
