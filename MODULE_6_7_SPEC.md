# Blue Leaf Hub — Module 6 & 7 Build Spec
## Operations Manager + Buildexact Deep Integration

This document is the Cursor build prompt for Modules 6 and 7. Add this to the
existing project after Module 5 (Fee Proposal). All existing patterns apply:
React + Vite frontend, Express server on port 8787, Supabase PostgreSQL,
Tailwind CSS with `#006c9b` primary blue, Dropbox for file storage.

---

## THE COMPLETE PIPELINE — HOW ALL MODULES CONNECT

This is the end-to-end flow a job takes through the entire app. Understanding
this is important before building anything in Module 6 or 7.

```
CLIENT INQUIRY
    ↓
FEE PROPOSAL (Module 5) ← THIS IS THE ENTRY POINT
  · Sam creates a fee proposal for the client
  · Sets out pre-construction services and fee
  · Sent as PDF to client for approval
  · When accepted: job is created in "tendering" status
    ↓
RFQ ENGINE (Module 1)
  · PDFs uploaded and extracted by Claude
  · Trade packages composed
  · RFQs sent to subcontractors
    ↓
TENDER BOARD + QUOTE TRACKER (Modules 2–3)
  · Quotes tracked as they come in
  · IMAP auto-matches email replies to correct jobs
    ↓
WIN / LOSE DECISION (Module 4)
  · Win: accepted quotes → Purchase Orders issued → job moves to Operations
  · Lose: declined emails sent to subs → job archived
    ↓
OPERATIONS (Module 6)
  · Schedule, WHS, Site Diary, Dashboard
  · Buildexact estimate synced and mapped to phases (Module 7)
```

**Fee Proposal comes BEFORE tendering — it is not part of the Tender Manager.**
The fee proposal is a pre-construction commercial document. The tender is a
construction-cost exercise that happens after the client has committed.

### What needs to change to connect Fee Proposal → Tendering

Currently these two modules are independent. The fix is small:

1. Add a `status` field to `fee_proposals` table:
   `pending | sent | accepted | declined`

2. Add an "Accept" button in the Fee Proposal List page.
   On accept: call a new endpoint `POST /api/fee-proposal/accept` which:
   - Marks fee_proposal.status = 'accepted'
   - If no job exists for this fee_proposal.job_id: creates one with
     address, client_name, architect_name etc. pre-filled from the proposal
   - Sets job.status = 'tendering'
   - Returns the job_id so the UI can navigate to the Tender Board

3. In the Tender Board, show a "Source" chip on each job card:
   "Fee Proposal #FP-2024-003" so Sam knows how it got there.

This makes the pipeline explicit without rebuilding anything — just adding
the handoff step between two already-working modules.

---

## CONTEXT: What's Already Built

The app currently has:
- **Module 1–3**: RFQ Engine → Tender Board → Quote Tracker
- **Module 4**: Win/Lose finalisation, Purchase Order issuance
- **Module 5**: Fee Proposal (DOCX + PDF generation)
- **Operations base**: `projects` table exists, `OperationsList` and
  `OperationsProjectDetail` pages exist (basic — shows POs and Buildexact link)

Module 6 expands the Operations area into a full site management system.
Module 7 deepens the existing Buildexact connection into budget + schedule data.

---

## DATABASE: New Tables Required

Run these migrations in Supabase before building.

```sql
-- Build schedule tasks (the Gantt rows)
CREATE TABLE schedule_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  trade text NOT NULL,
  phase text NOT NULL,            -- site_prep | substructure | frame | rough_in | lock_up | fitout | completion
  name text NOT NULL,
  start_date date,
  end_date date,
  duration_days integer,
  depends_on uuid[],              -- array of task IDs that must finish first
  can_overlap_with uuid[],        -- array of task IDs that can run concurrently
  status text DEFAULT 'planned',  -- planned | in_progress | complete | delayed | blocked
  assigned_subcontractor_id uuid REFERENCES subcontractors(id),
  notes text,
  is_hold_point boolean DEFAULT false,   -- inspection hold — cannot proceed until signed off
  procurement_lead_days integer,         -- if non-null, materials must be ordered this many days before start
  order_by_date date,                    -- computed: start_date minus procurement_lead_days
  ai_flag text,                          -- AI-generated warning or efficiency note
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- WHS: contractor compliance records
CREATE TABLE contractor_compliance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id uuid REFERENCES subcontractors(id) ON DELETE CASCADE,
  document_type text NOT NULL,    -- public_liability | workers_comp | licence | swms | other
  document_name text,
  issue_date date,
  expiry_date date,
  policy_number text,
  insurer text,
  dropbox_path text,
  status text DEFAULT 'current',  -- current | expiring_soon | expired | missing
  reminder_sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- WHS: site induction records
CREATE TABLE site_inductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  subcontractor_id uuid REFERENCES subcontractors(id),
  name text,                      -- person's name (may differ from company contact)
  company text,
  inducted_at timestamptz DEFAULT now(),
  induction_method text DEFAULT 'qr_code',
  emergency_contact_name text,
  emergency_contact_phone text,
  site_rules_acknowledged boolean DEFAULT false,
  swms_acknowledged boolean DEFAULT false,
  signature_data_url text,        -- base64 SVG or PNG of drawn signature
  induction_pdf_path text,        -- Dropbox path to generated PDF
  ip_address text
);

-- WHS: SWMS library
CREATE TABLE swms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade text NOT NULL,
  title text NOT NULL,
  version integer DEFAULT 1,
  content_json jsonb,             -- structured hazard/control table
  pdf_path text,                  -- Dropbox path to PDF version
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- WHS: SWMS assigned to a project + acknowledgement
CREATE TABLE project_swms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  swms_template_id uuid REFERENCES swms_templates(id),
  trade text,
  acknowledged_by uuid REFERENCES site_inductions(id),
  acknowledged_at timestamptz,
  dropbox_path text
);

-- WHS: incident and hazard reports
CREATE TABLE site_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  report_type text NOT NULL,      -- incident | near_miss | hazard | defect | non_conformance
  severity text,                  -- low | medium | high | critical
  title text NOT NULL,
  description text,
  corrective_action text,
  reported_by text,
  reported_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  photo_paths text[],             -- array of Dropbox paths
  dropbox_pdf_path text,
  status text DEFAULT 'open'      -- open | in_progress | resolved
);

-- Site diary entries
CREATE TABLE site_diary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  weather text,
  trades_onsite text[],           -- array of trade names present
  work_completed text,
  issues text,
  instructions_given text,
  visitors text,
  raw_voice_transcript text,      -- unedited transcript before AI structuring
  structured_by_ai boolean DEFAULT false,
  supervisor text,
  photos text[],                  -- array of Dropbox paths
  dropbox_pdf_path text,
  created_at timestamptz DEFAULT now()
);

-- Buildexact estimate categories synced from their API
CREATE TABLE buildexact_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  buildexact_job_id text NOT NULL,
  category_name text NOT NULL,    -- raw name from Buildexact API
  budgeted_amount numeric(12,2),
  synced_at timestamptz DEFAULT now()
);

-- How each Buildexact category maps to trades and phases
-- One category row can have multiple allocation rows (one per trade/phase combo)
CREATE TABLE cost_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  buildexact_category_id uuid REFERENCES buildexact_categories(id) ON DELETE CASCADE,
  category_name text NOT NULL,    -- denormalised for queries without join
  trade text NOT NULL,
  phase text NOT NULL,
  split_pct numeric(5,2) NOT NULL, -- % of the category budget going to this trade/phase
  budgeted_amount numeric(12,2),   -- computed: category budget × split_pct / 100
  committed_amount numeric(12,2) DEFAULT 0,  -- from accepted RFQ quotes
  invoiced_amount numeric(12,2) DEFAULT 0,
  schedule_task_id uuid REFERENCES schedule_tasks(id),
  procurement_lead_days integer,
  notes text
);

-- Default mapping templates (reused across all projects, Sam sets once)
CREATE TABLE category_mapping_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buildexact_category_pattern text NOT NULL,  -- keyword to match against category name
  trade text NOT NULL,
  phase text NOT NULL,
  default_split_pct numeric(5,2) NOT NULL,
  procurement_lead_days integer,
  notes text
);
```

---

## MODULE 6A — SCHEDULE MANAGER

### What It Does

A Gantt chart that generates a realistic build programme from a template,
lets Sam edit it, and gives AI analysis on demand. No third-party Gantt
library — render it in SVG or canvas so we have full control.

### Page: `/operations/:projectId/schedule`

**Left panel — task list (30% width):**
- Each row is a schedule task. Columns: Phase, Trade, Task name, Start, End,
  Duration, Status, Hold point indicator, Procurement alert.
- Grouped by phase with collapsible headers.
- Click a row to open a slide-over panel to edit that task.
- Colour-coded status: planned (grey), in_progress (blue), complete (green),
  delayed (amber), blocked (red).

**Right panel — Gantt bars (70% width):**
- Horizontal timeline. Top axis: week numbers and dates.
- Each task is a horizontal bar spanning its start_date to end_date.
- Phase rows have a background colour band.
- Dependency arrows: where task B depends on task A, draw a connecting arrow
  from the right edge of A to the left edge of B.
- Hold points: render as a diamond symbol, not a bar.
- Procurement deadlines: show a small flag icon N days before the task starts.
- Click and drag bar edges to adjust dates (updates duration_days and end_date).
- Zoom controls: show 3 months / 6 months / full project.

**Generate Schedule button:**
- Opens a modal asking for the project start date and any known constraints
  (e.g. "slab inspection booked for 15 March", "windows ordered, 14 weeks lead").
- Calls `/api/schedule/generate` which uses the pre-built phase template to
  create a full set of tasks for that project.
- The generated tasks reflect Australian residential build sequencing
  (see sequencing rules below).

**AI Analyse button:**
- Calls `/api/schedule/analyse` with the full task list.
- Claude reads the schedule and writes a plain-English report:
  - Critical path summary (which tasks determine the end date)
  - Any sequencing problems (e.g. flooring scheduled before plastering complete)
  - Procurement deadlines at risk (windows, cabinetry, steel)
  - Concurrent trade conflicts (trades that shouldn't overlap are overlapping)
  - Suggested optimisations
- Rendered in a slide-over panel. Export button saves it as a PDF to Dropbox.

### Australian Residential Sequencing Rules

Build these as hard constraints in the `/api/schedule/generate` logic:

**Phase order (a phase cannot start until the previous one has a signed
hold point):**
1. Site Prep
2. Substructure (footings, slab)
3. Frame
4. Rough-in (plumbing, electrical, A/C — done simultaneously in same phase)
5. Lock-up (roof, windows, external doors, external cladding)
6. Fitout (linings, plaster, joinery, tiling, painting, flooring, fit-offs)
7. Completion (final clean, landscaping, driveway, handover)

**Hard dependencies (B cannot start until A is complete):**
- Slab cannot start until footings complete + council inspection passed
- Frame cannot start until slab cure period complete (minimum 7 days)
- Rough-in cannot start until frame complete + frame inspection passed
- Lock-up cannot start until rough-in sign-off
- Plasterboard cannot start until rough-in complete
- Cornice/skirts cannot start until plasterboard complete
- Painting (first coat) cannot start until cornice + skirts complete
- Tiling cannot start until plasterboard complete (can overlap with painting)
- Flooring cannot start until painting second coat complete
- Cabinetry install cannot start until flooring complete
- Electrical fit-off cannot start until painting complete
- Plumbing fit-off cannot start until tiling complete

**Concurrent trade pairs (these CAN run at the same time):**
- Plumbing rough-in + electrical rough-in + A/C rough-in (all rough-in phase)
- Tiling + painting first coat (different rooms, same phase)
- Landscaping + external works can start at lock-up while fitout continues inside

**Standard durations (days, adjust per project size):**
- Site Prep: 5
- Footings: 3
- Slab: 3 (plus 7 days cure — show as a milestone, not a work task)
- Frame: 10
- Roof: 5
- Rough-in (all trades): 15 (concurrent)
- Windows + external doors: 3 (but order 14 weeks prior)
- External cladding: 7
- Plasterboard: 8
- Plaster (wet areas + setting): 5
- Painting first coat: 4
- Tiling: 7
- Cabinetry + joinery: 5
- Painting final coat: 4
- Flooring: 4
- Electrical fit-off: 3
- Plumbing fit-off: 3
- A/C fit-off: 2
- Final clean: 2
- Landscaping: 5

**Procurement lead times (flag this many days before task start):**
- Windows + glazing: 98 days (14 weeks)
- External doors + frames: 56 days (8 weeks)
- Cabinetry + joinery: 56 days (8 weeks)
- Steel (if structural): 35 days (5 weeks)
- Tiles (if special order): 28 days (4 weeks)
- Bricks / cladding: 21 days (3 weeks)
- Timber frame (prefab): 28 days (4 weeks)

### API Routes

`POST /api/schedule/generate`
- Body: `{ projectId, startDate, constraints[] }`
- Creates schedule_tasks rows from the template + sequencing rules
- Returns the full task list

`GET /api/schedule/:projectId`
- Returns all schedule_tasks for that project, ordered by start_date

`PATCH /api/schedule/task/:id`
- Body: partial task fields
- Updates a single task, then recomputes all downstream task dates if
  start_date or duration_days changed (waterfall recalculation)

`POST /api/schedule/analyse`
- Body: `{ projectId }`
- Fetches the task list + cost allocations and sends to Claude
- Returns AI analysis text

---

## MODULE 6B — WHS MANAGER

### What It Does

Keeps Blue Leaf legally protected with minimum admin overhead. Designed for
residential construction — not corporate bureaucracy.

### Page: `/operations/:projectId/whs`

Three tabs: **Contractors**, **Site Access**, **Incidents**

**Contractors tab:**
- List of all subcontractors working on this project (from purchase_orders).
- For each: compliance status badge (All Good / Expiring Soon / Issues).
- Click to expand: insurance and licence cards, each showing document type,
  expiry date, status, and an Upload button.
- Upload triggers PUT to Supabase Storage then saves path to
  contractor_compliance table.
- "Add document" button for adding new compliance records.
- Expiry date turns amber at 30 days, red at 0.

**Site Access tab:**
- QR Code section: displays the QR code for this project's induction URL.
  The URL is `/induct/:projectId` — a public page, no login required.
  Print or download the QR code as a PNG.
- Induction log: list of all site_inductions for this project, with name,
  company, date, and a link to the induction PDF in Dropbox.

**Incidents tab:**
- List of all site_reports for this project.
- "Report Incident" button — opens a form: type, severity, description,
  corrective action, photo upload.
- On save: generate a timestamped PDF and save to Dropbox at
  `[project folder]/WHS/INCIDENTS/`.

### Public Induction Page: `/induct/:projectId`

This page is public — no login. A subcontractor scans the site QR code
and lands here on their phone. Keep it clean, mobile-first, fast.

**Step 1 — Who are you?**
Name, company, trade (dropdown), mobile number, emergency contact name,
emergency contact phone.

**Step 2 — Site rules (6 key rules, rendered as checklist):**
- PPE required at all times (hard hat, hi-vis, steel-capped boots)
- No alcohol or drugs on site
- Report all hazards and near-misses immediately
- Respect neighbouring properties
- Keep site tidy at end of each day
- Follow all directions from the site supervisor
User must tick each one individually.

**Step 3 — SWMS acknowledgement:**
- Show the list of SWMS templates assigned to this project for the
  person's trade (looked up by trade from Step 1).
- Display each as a card with a "View" link (opens the PDF in a new tab).
- User must tick "I have read and understood this SWMS" for each one.

**Step 4 — Signature:**
- Simple canvas-based signature pad (finger on phone).
- "Sign & Submit" button.

On submit:
- Save site_inductions row
- Generate a PDF (using pdfkit, same pattern as PO generation):
  - Site name, date, person's details, checklist acknowledgements, signature
- Save PDF to Dropbox at `[project folder]/WHS/INDUCTIONS/`
- Show a thank-you screen: "You're signed in. Stay safe out there."

### Contractor Compliance Expiry Reminders

Add a daily cron (same pattern as rfqReminders.mjs) that:
- Queries contractor_compliance where expiry_date is within 30 days
  and reminder_sent_at is null or > 14 days ago
- Sends an email to Admin@blueleafbuilding.com.au listing expiring documents
- Sends an email to the subcontractor asking them to upload a renewal

Route: `POST /api/whs/compliance-check` (manual trigger + cron)

---

## MODULE 6C — SITE DIARY

### What It Does

The supervisor (on site, on their phone) speaks their daily diary entry.
The app transcribes it, Claude structures it into a proper diary entry,
one tap saves it as a PDF to Dropbox. No typing required on site.

### Page: `/operations/:projectId/diary`

**New entry flow:**
1. Tap "Record Entry" — shows a big mic button.
2. Uses Web Speech API (`window.SpeechRecognition`): no API cost, works
   in Chrome on Android and iOS Safari (with fallback notice if unsupported).
3. Supervisor speaks naturally: "Today we had the framers, the plumber and
   the sparky on site. We completed the first fix plumbing to bathrooms 1
   and 2 and all rough-in electrical to the ground floor. Weather was clear
   and hot, about 32 degrees. No incidents. I gave instructions to the framer
   to hold on the upper level until the engineer does the frame inspection
   tomorrow morning."
4. Transcript appears in a text box as they speak.
5. Tap "Structure with AI" — calls `/api/diary/structure` which sends the
   transcript to Claude and gets back a structured entry (JSON with the fields
   below).
6. Structured entry populates the form fields for review and editing.
7. Tap "Save Entry" — saves to site_diary table and generates PDF.

**Diary entry fields:**
- Date (defaults to today)
- Weather (text)
- Trades on site (multi-select chips from the project's accepted_trades list)
- Work completed (text area)
- Issues and delays (text area)
- Instructions given (text area)
- Visitors (text, optional)
- Supervisor name (defaults from settings)

**Past entries:**
- Scrollable list of all diary entries for this project, newest first.
- Each shows date, weather, trades on site, one-line summary of work completed.
- Click to expand the full entry.
- "Download PDF" link opens the Dropbox PDF in a new tab.

### API Routes

`POST /api/diary/structure`
- Body: `{ transcript, projectId }`
- Sends transcript to Claude with a prompt to extract and structure:
  date, weather, trades on site, work completed, issues, instructions, visitors
- Returns structured JSON matching the site_diary fields

`POST /api/diary/save`
- Body: `{ projectId, entry }` where entry is the diary fields
- Saves to site_diary table
- Generates a PDF using pdfkit with Blue Leaf letterhead
- Saves PDF to Dropbox at `[project folder]/SITE DIARY/YYYY-MM-DD.pdf`
- Returns `{ ok: true, dropbox_path }`

`GET /api/diary/:projectId`
- Returns all diary entries for the project, newest first

---

## MODULE 6D — SITE DASHBOARD

### What It Does

The morning screen. What's happening today, what's next, what needs attention.
Designed to be glanced at from the cab of a ute.

### Page: `/operations/:projectId` (replaces the current basic project detail page)

This page becomes the main dashboard. The existing PO list and Buildexact link
move to a "Financials" tab so the dashboard is uncluttered.

**Tabs: Dashboard | Schedule | WHS | Diary | Financials**

**Dashboard tab content (4 summary cards):**

Card 1 — Today
- Today's date
- Phase currently in progress
- Trades expected on site today (from schedule tasks with today's date in range)
- Any hold points due today or tomorrow

Card 2 — Upcoming procurement deadlines
- Any materials with order_by_date within the next 14 days
- Sorted by urgency. Red if overdue, amber if < 7 days.

Card 3 — WHS alerts
- Subcontractors with expired or expiring-soon insurance/licences
- Any open incidents

Card 4 — Schedule health
- Overall % complete (tasks with status = complete / total tasks)
- Days ahead or behind the original end date
- AI flag count (number of tasks with an ai_flag set)

**Below the cards:** last 3 diary entries (date, trades, one-line summary).

---

## MODULE 7 — BUILDEXACT DEEP INTEGRATION

### What It Does

Pulls the cost estimate from Buildexact, maps each category to trades and
phases, and shows budget vs committed vs invoiced per phase throughout the
build. Sam sets up the mapping once; every future project reuses it.

### How the Buildexact API Works

- Base URL: `https://api-v3.buildxact.com`
- Auth: API key + email login to get a bearer token (already implemented in
  `buildexactClient.mjs`)
- Estimate endpoint: `GET /api/v3/Jobs/{id}/EstimateItems` — returns all
  line items for a job's estimate
- Each item has: `ItemCode`, `Description`, `CategoryName`, `NetAmount`

### Setup Flow (one time per project)

When a project is first linked to Buildexact:
1. Fetch the estimate from Buildexact
2. Group line items by `CategoryName` (sum the NetAmount per category)
3. Save as buildexact_categories rows
4. Auto-apply the category_mapping_templates (keyword matching against
   category name) to propose cost_allocations
5. Show the mapping editor (see below) for Sam to review and confirm

### Mapping Editor Page: `/operations/:projectId/budget`

**Left side — Category list:**
Each Buildexact category is a row showing: category name, total budget amount,
and the allocations currently mapped to it (trade + phase + %).

Example row:
```
Electrical                    $42,500
  → Electrical Rough-in    Rough-in    40%    $17,000
  → Electrical Fit-off     Fitout      55%    $23,375
  → Solar                  Lock-up      5%     $2,125
```

**Edit mode:**
Click a category to edit its allocations. For each allocation row:
- Trade (dropdown from the project's accepted_trades)
- Phase (dropdown: site_prep / substructure / frame / rough_in / lock_up /
  fitout / completion)
- Split % (number input — all splits for a category must sum to 100)
- Procurement lead days (optional — links to schedule task)

**Save mappings button** — saves all cost_allocations and updates the schedule
tasks with budget amounts.

**Right side — Phase budget summary:**
A summary table showing each phase with:
- Total budgeted (sum of all cost_allocations for that phase)
- Committed (sum of accepted RFQ quote amounts linked to that phase)
- Variance (budgeted minus committed)
- Invoiced (future — for when invoices are logged)

**Re-sync button** — pulls fresh estimate data from Buildexact and updates
budgeted amounts. Mapping is preserved; only the dollar amounts update.

### Budget Awareness in the Schedule

Once mappings are set:
- Each schedule task shows its budgeted amount and committed amount
  in the Gantt task detail panel
- The AI Schedule Analysis includes budget context:
  "Frame phase: $68,000 budgeted. Framing quote accepted: $71,500.
  $3,500 over budget — review before programme commences."

### Estimate vs Quote Variance Alerts

When an RFQ quote is accepted (in `/api/tender/win-finalize`):
- Update the relevant cost_allocation.committed_amount
- If committed_amount > budgeted_amount by more than 5%, create a
  site_reports row of type `non_conformance` with severity `medium` and
  description "Quote exceeds estimate: [trade] [amount over]"
- Show a toast notification in the UI

### API Routes

`POST /api/buildexact/sync-estimate/:projectId`
- Fetches estimate items from Buildexact API for this project's
  buildexact_job_id
- Groups by category, saves to buildexact_categories
- Auto-applies category_mapping_templates to propose cost_allocations
- Returns `{ categories, allocations, warnings }`

`GET /api/budget/:projectId`
- Returns all cost_allocations for this project, grouped by phase,
  with budgeted / committed / invoiced totals

`POST /api/budget/save-mappings`
- Body: `{ projectId, allocations[] }`
- Saves or updates cost_allocations rows
- Updates corresponding schedule_task budget amounts

---

## BUILDEXACT CATEGORY → TRADE → PHASE MAPPING TABLE

**These use exact category names from your real Buildexact estimates.**
Matching is case-insensitive exact string match against `CategoryDescription`.
Seed these rows into `category_mapping_templates` before first use.

The `split_pct` values for multi-phase categories (Carpentry, Plumbing etc.)
are derived from the actual line items in your estimate files — e.g. Carpentry
is 84% first-fix frame + 16% second-fix fitout based on real dollar breakdown.

---

### SITE PREP

| Exact Category Name | Trade | Phase | Split % | Lead Days | Notes |
|---|---|---|---|---|---|
| Preliminaries | Site Setup | site_prep | 35% | — | Insurance, permits, admin |
| Preliminaries | Site Setup | substructure | 15% | — | |
| Preliminaries | Site Setup | frame | 15% | — | |
| Preliminaries | Site Setup | rough_in | 10% | — | |
| Preliminaries | Site Setup | lock_up | 10% | — | |
| Preliminaries | Site Setup | fitout | 10% | — | |
| Preliminaries | Site Setup | completion | 5% | — | |
| Administration | Administration | site_prep | 40% | — | Fees, drawings, approvals |
| Administration | Administration | frame | 20% | — | |
| Administration | Administration | lock_up | 20% | — | |
| Administration | Administration | completion | 20% | — | |
| Site Establishment | Site Setup | site_prep | 100% | — | Temp fence, toilet, signage |
| Service connections | Service Connections | site_prep | 100% | — | Water, power, sewer to site |
| Demolition/ civil | Demolition | site_prep | 100% | — | |
| Hire Items | Hire Equipment | frame | 30% | — | Crane, scaffold, bins |
| Hire Items | Hire Equipment | rough_in | 20% | — | |
| Hire Items | Hire Equipment | lock_up | 30% | — | |
| Hire Items | Hire Equipment | fitout | 20% | — | |

---

### SUBSTRUCTURE

| Exact Category Name | Trade | Phase | Split % | Lead Days | Notes |
|---|---|---|---|---|---|
| Concrete & Footings | Concreting | substructure | 100% | — | Footings + slab |
| Termite Protection | Termite Protection | substructure | 100% | — | Pre-slab chemical treatment |

---

### FRAME

| Exact Category Name | Trade | Phase | Split % | Lead Days | Notes |
|---|---|---|---|---|---|
| Carpentry | Carpentry | frame | 84% | — | First-fix framing (labour + supply) |
| Carpentry | Carpentry | fitout | 16% | — | Second-fix carpentry |
| First Fix Framing | Carpentry | frame | 100% | — | Some jobs split this out |
| First Fix Supply | Carpentry | frame | 100% | — | Material-only line |
| Second Fix | Carpentry | fitout | 100% | — | |
| Second fix supply | Carpentry | fitout | 100% | — | |
| Structural Steel | Structural Steel | frame | 100% | 35 | Beams, columns, lintels |
| Partition wall supply and installation | Carpentry | fitout | 100% | — | Non-structural internal walls |

---

### ROUGH-IN

| Exact Category Name | Trade | Phase | Split % | Lead Days | Notes |
|---|---|---|---|---|---|
| Plumbing | Plumbing | substructure | 25% | — | Under-slab drains + in-slab rough |
| Plumbing | Plumbing | rough_in | 45% | — | Wall rough-in, HWS, cold + hot |
| Plumbing | Plumbing | fitout | 30% | — | Fit-off tapware, fixtures |
| Electrical & data | Electrical | rough_in | 45% | — | Cable, conduit, rough-in |
| Electrical & data | Electrical | lock_up | 5% | — | Main switchboard at lock-up |
| Electrical & data | Electrical | fitout | 50% | — | Fit-off GPOs, switches, lights |
| Heating & Cooling | Air Conditioning | rough_in | 50% | — | Ductwork + heads rough-in |
| Heating & Cooling | Air Conditioning | fitout | 50% | — | Grilles, controller, commissioning |
| Solar & batteries | Solar | lock_up | 20% | — | Roof rails + panels |
| Solar & batteries | Solar | fitout | 80% | — | Inverter, battery, commissioning |
| Lighting & Automation | Electrical | rough_in | 40% | — | Smart wiring, conduit |
| Lighting & Automation | Electrical | fitout | 60% | — | Fixtures, controllers, programming |
| Insulation | Insulation | rough_in | 100% | — | After frame inspection, before lining |

---

### LOCK-UP

| Exact Category Name | Trade | Phase | Split % | Lead Days | Notes |
|---|---|---|---|---|---|
| Roof Plumber | Metal Roofing | lock_up | 100% | — | |
| Roof Plumbing | Metal Roofing | lock_up | 100% | — | (alternate name same trade) |
| Windows/skylights | Windows & Glazing | lock_up | 100% | 98 | 14 weeks — order at frame start |
| Glazing | Windows & Glazing | lock_up | 100% | 98 | Frameless glass, splashbacks |
| Garage Door | External Doors | lock_up | 100% | 42 | 6 weeks lead |
| External Cladding | External Cladding | lock_up | 100% | 21 | James Hardie, Scyon etc |
| Cladding Supply | External Cladding | lock_up | 100% | 21 | Supply-only line |
| Cladding and Soffit Lining | External Cladding | lock_up | 100% | 21 | Eave lining included |
| Masonary | Brickwork & Masonry | lock_up | 100% | 21 | (Buildexact typo — both spellings exist) |
| Masonry | Brickwork & Masonry | lock_up | 100% | 21 | |
| Plastering & rendering | Plasterer | lock_up | 30% | — | External render scratch coat |
| Plastering & rendering | Plasterer | fitout | 70% | — | Internal plaster + render finish |

---

### FITOUT

| Exact Category Name | Trade | Phase | Split % | Lead Days | Notes |
|---|---|---|---|---|---|
| Internal linings | Internal Linings | fitout | 100% | — | Plasterboard supply + fix |
| Painting | Painting | fitout | 100% | — | First + second coat |
| Tiler | Tiling | fitout | 100% | — | Walls + floors |
| Flooring | Flooring | fitout | 100% | 28 | Timber, vinyl, carpet |
| Joinery | Joinery | fitout | 100% | 56 | Kitchen, robes, vanities — order at rough-in |
| Stairs | Stairs | fitout | 100% | 28 | Stair manufacture lead time |
| Sanitary Ware | Plumbing | fitout | 100% | — | Toilets, basins (fits at plumbing fit-off) |
| Appliances | Appliances | fitout | 100% | 42 | Oven, rangehood, dishwasher |
| Fixtures & Fittings | Fixtures & Fittings | fitout | 100% | — | Towel rails, hooks, accessories |
| Door Hardware | Carpentry | fitout | 100% | — | Handles, locks, hinges |

---

### COMPLETION

| Exact Category Name | Trade | Phase | Split % | Lead Days | Notes |
|---|---|---|---|---|---|
| Landscaping | Landscaping | lock_up | 20% | — | Rough cut + levels at lock-up |
| Landscaping | Landscaping | completion | 80% | — | Turf, plants, irrigation |
| Outdoor works | External Works | completion | 100% | — | Paths, pergola, alfresco |
| Outdoor works supply | External Works | completion | 100% | — | Material-only line |
| Fencing | Fencing | completion | 100% | — | |
| Paving | Driveways & Paths | completion | 100% | — | Exposed agg, pavers, asphalt |
| Pool Works | Pool | completion | 100% | — | |
| Site Cleaner | Site Clean | completion | 100% | — | Final builder's clean |
| Window Furnishings | Window Furnishings | completion | 100% | — | Blinds, curtains — last thing in |

---

## IMPLEMENTATION NOTES

### File structure to create:

**Server:**
```
server/lib/module6Routes.mjs      — schedule, WHS, diary API routes
server/lib/module7Routes.mjs      — budget sync, mapping routes
server/lib/schedulePdfKit.mjs     — PDF generation for diary + induction
server/lib/inductionRoutes.mjs    — public induction endpoint (no auth)
```

**Client:**
```
src/pages/OperationsProjectDetail.jsx  — replace with tabbed dashboard
src/pages/ScheduleManager.jsx          — Gantt chart page
src/pages/WhsManager.jsx               — WHS tabs page
src/pages/SiteDiary.jsx                — diary list + record page
src/pages/BudgetManager.jsx            — category mapping + phase totals
src/pages/SiteInduction.jsx            — public induction page (no nav shell)
src/lib/ganttRenderer.js               — SVG/canvas Gantt rendering logic
```

### Register in dev-api.mjs:
```javascript
import { registerModule6Routes } from "./lib/module6Routes.mjs";
import { registerModule7Routes } from "./lib/module7Routes.mjs";
import { registerInductionRoutes } from "./lib/inductionRoutes.mjs";
// ...
registerModule6Routes(app);
registerModule7Routes(app);
registerInductionRoutes(app);
```

### Register in App.jsx:
```jsx
<Route path="/operations/:projectId" element={<OperationsProjectDetail />} />
<Route path="/operations/:projectId/schedule" element={<ScheduleManager />} />
<Route path="/operations/:projectId/whs" element={<WhsManager />} />
<Route path="/operations/:projectId/diary" element={<SiteDiary />} />
<Route path="/operations/:projectId/budget" element={<BudgetManager />} />
<Route path="/induct/:projectId" element={<SiteInduction />} />
```

### Induction page is public — no supabase auth required. It uses the
service role key on the server side to save the induction record.
The frontend page calls `/api/induction/:projectId/submit`.

### PDF generation pattern (same as PO PDFs):
- Import pdfkit
- Build buffer server-side
- Upload to Dropbox via existing `uploadPoPdfToJobFolder` pattern
- Return base64 to client for optional inline view

### Voice transcription notes:
- Use `window.webkitSpeechRecognition || window.SpeechRecognition`
- Set `continuous = true, interimResults = true` for live transcript
- On mobile Chrome (Android), this works without any API key
- iOS Safari supports it from iOS 14.5+ — show a fallback text input
  with a note if the API is unavailable
- The raw transcript goes to Claude for structuring — no need for a
  paid transcription service

---

## BUILD ORDER

Build in this sequence — each step produces a working feature:

1. Database migrations (all tables above)
2. Seed category_mapping_templates with the mapping table above
3. Module 7 Buildexact sync endpoint + mapping editor (BudgetManager page)
4. Module 6A Schedule Manager — generate + Gantt render + AI analysis
5. Module 6B WHS — compliance tracking + induction page
6. Module 6C Site Diary — voice record + AI structure + PDF save
7. Module 6D Dashboard — replace OperationsProjectDetail with tabbed layout
