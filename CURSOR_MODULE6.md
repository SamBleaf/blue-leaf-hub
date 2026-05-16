# Blue Leaf Hub — Cursor Prompt: Module 6 (Operations Manager)

Paste this entire document into a new Cursor conversation. Build everything
described here. Do not skip any section. Do not add features not described.

---

## PROJECT CONTEXT

Stack: React 18 + Vite + React Router v6, Express server (port 8787),
Supabase PostgreSQL, Tailwind CSS, pdfkit (server PDFs), Dropbox API.

**All existing patterns you must follow:**
- Tailwind tokens: `primary` (#006c9b), `accent` (#2E6B4F), `warning` (#D4A24C),
  `surface`, `page`, `ink`, `muted`, `danger`, `hairline`. Font: Lato.
- Rounded: `rounded-card` (12px) for cards, `rounded-lg` (8px) for buttons/inputs.
- Server routes live in `server/lib/` as named route files, registered in
  `server/dev-api.mjs` via `registerXxxRoutes(app)`.
- Client pages in `src/pages/`, utility libs in `src/lib/`.
- Supabase client: `getSupabase()` from `../lib/supabaseClient`. Server uses
  `getServiceSupabase()` from `./supabaseService.mjs`.
- PDF generation: pdfkit, same pattern as `server/lib/poPdfKit.mjs`. Build
  buffer server-side, upload to Dropbox, return base64 to client.
- All server files use `.mjs` (ES modules). All client files use `.jsx`/`.js`.
- No TypeScript. No test files. No comments unless logic is non-obvious.

**What already exists (do not rebuild):**
- `src/pages/OperationsProjectDetail.jsx` — current project detail page.
  Module 6D will replace this with a tabbed dashboard. Keep all existing
  functionality (PO issue, Buildexact link, tentative start date) in a
  "Financials" tab.
- `server/lib/module4Routes.mjs` — win-finalize, lose-finalize, PO issue.
- `server/lib/poPdfKit.mjs` — PDF generation pattern to copy for new PDFs.
- `server/lib/dropboxClient.mjs` — Dropbox upload functions. Use
  `uploadPoPdfToJobFolder` as the pattern for all new Dropbox uploads.

---

## PART 1 — WORKFLOW + NAVIGATION CHANGES

### New app workflow
```
RFQ Engine → Tender Manager → (Fee Proposal inside job) → Win → Operations
```

Fee Proposal is no longer a top-level nav item. It lives as a tab inside
each active job in the Tender Manager (TenderDetail.jsx).

### Changes to make in existing files

**`src/components/AppShell.jsx`:**

Remove `{ to: "/tender-manager/fee-proposal", label: "Fee Proposal" }` from
`TENDER_MODULES`.

Add these to `OPS_MODULES`:
```js
{ to: "/operations", label: "Projects", end: true },
{ to: "/operations/schedule", label: "Schedule" },       // not yet — placeholder
{ to: "/operations/whs", label: "WHS" },                  // not yet — placeholder
{ to: "/operations/diary", label: "Site Diary" }           // not yet — placeholder
```
Actually — ops nav links are per-project, not global. Keep `OPS_MODULES` as
just `[{ to: "/operations", label: "Projects", end: true }]` for now.
The per-project tabs (Schedule, WHS, Diary, Financials) are inside the project
detail page itself, not in the sidebar.

**`src/pages/Home.jsx`:**

Update the `operations_manager` section:
- Change `comingSoon: true` → `comingSoon: false`
- Change `href: null` → `href: "/operations"`
- Update description: `"Schedule, WHS compliance, site diary, and project
  management for active builds."`
- Add modules list: `["Projects", "Schedule", "WHS", "Site Diary"]`

**`src/pages/TenderDetail.jsx`:**

Add a "Fee Proposal" tab to the existing job detail view. When this tab is
active, show an embedded view of the fee proposals linked to this job (query
`fee_proposals` where `job_id = job.id`). Show a "New fee proposal" button
that navigates to `/tender-manager/fee-proposal/new?jobId={job.id}` so the
wizard pre-fills from this job.

If a fee proposal exists, show its status badge and an Edit link.

**`src/pages/FeeProposalWizard.jsx`:**

Read `jobId` from the URL query param (`useSearchParams`) when creating a new
proposal, and pre-fill the job data just like it already does from the job
lookup in `hydrateFromJob()`.

After saving, if there is a `jobId` query param, show a "Back to job" link
that navigates to `/tender-manager/board/{jobId}` instead of the generic list.

**`src/App.jsx`:**

Keep the fee proposal routes exactly as they are — they're still needed, just
accessed from within the job context now rather than the top nav.

---

## PART 2 — DATABASE MIGRATIONS

Run all of these in Supabase SQL editor before building any frontend.

```sql
-- Schedule tasks (Gantt rows)
CREATE TABLE IF NOT EXISTS schedule_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  trade text NOT NULL,
  phase text NOT NULL CHECK (phase IN (
    'site_prep','substructure','frame','rough_in','lock_up','fitout','completion'
  )),
  start_date date,
  end_date date,
  duration_days integer NOT NULL DEFAULT 1,
  depends_on uuid[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'planned' CHECK (status IN (
    'planned','in_progress','complete','delayed','blocked'
  )),
  is_hold_point boolean NOT NULL DEFAULT false,
  procurement_lead_days integer,
  order_by_date date,
  ai_flag text,
  notes text,
  assigned_subcontractor_id uuid REFERENCES subcontractors(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- WHS contractor compliance documents
CREATE TABLE IF NOT EXISTS contractor_compliance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id uuid REFERENCES subcontractors(id) ON DELETE CASCADE NOT NULL,
  document_type text NOT NULL CHECK (document_type IN (
    'public_liability','workers_comp','licence','swms','other'
  )),
  document_name text,
  issue_date date,
  expiry_date date,
  policy_number text,
  insurer text,
  dropbox_path text,
  status text NOT NULL DEFAULT 'current' CHECK (status IN (
    'current','expiring_soon','expired','missing'
  )),
  reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- WHS site inductions (one row per person per project visit)
CREATE TABLE IF NOT EXISTS site_inductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  subcontractor_id uuid REFERENCES subcontractors(id),
  person_name text NOT NULL,
  company text,
  trade text,
  mobile text,
  emergency_contact_name text,
  emergency_contact_phone text,
  site_rules_acknowledged boolean NOT NULL DEFAULT false,
  swms_acknowledged boolean NOT NULL DEFAULT false,
  signature_data_url text,
  induction_pdf_path text,
  inducted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text
);

-- SWMS templates library
CREATE TABLE IF NOT EXISTS swms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade text NOT NULL,
  title text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  content_html text,
  pdf_path text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- SWMS assigned to a project
CREATE TABLE IF NOT EXISTS project_swms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  swms_template_id uuid REFERENCES swms_templates(id) NOT NULL,
  trade text
);

-- WHS incident and hazard reports
CREATE TABLE IF NOT EXISTS site_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  report_type text NOT NULL CHECK (report_type IN (
    'incident','near_miss','hazard','defect','non_conformance'
  )),
  severity text CHECK (severity IN ('low','medium','high','critical')),
  title text NOT NULL,
  description text,
  corrective_action text,
  reported_by text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open','in_progress','resolved'
  )),
  photo_paths text[] DEFAULT '{}',
  dropbox_pdf_path text,
  reported_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- Site diary entries
CREATE TABLE IF NOT EXISTS site_diary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  weather text,
  trades_onsite text[] DEFAULT '{}',
  work_completed text,
  issues text,
  instructions_given text,
  visitors text,
  raw_voice_transcript text,
  structured_by_ai boolean NOT NULL DEFAULT false,
  supervisor text,
  photo_paths text[] DEFAULT '{}',
  dropbox_pdf_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

---

## PART 3 — SERVER ROUTES

Create `server/lib/module6Routes.mjs`. Register it in `server/dev-api.mjs`:

```js
import { registerModule6Routes } from "./lib/module6Routes.mjs";
// after the other registerXxx calls:
registerModule6Routes(app);
```

Also create `server/lib/inductionRoutes.mjs` for the public induction page.
Register it the same way:
```js
import { registerInductionRoutes } from "./lib/inductionRoutes.mjs";
registerInductionRoutes(app);
```

### Routes inside module6Routes.mjs

**Schedule:**

`POST /api/schedule/generate`
Body: `{ projectId, startDate, overrides: {} }`
- Loads the project's `accepted_trades` to know which trades are in scope
- Generates schedule_tasks rows using the phase template and sequencing rules
  defined in Part 4 of this prompt
- Returns `{ ok: true, tasks: [] }`

`GET /api/schedule/:projectId`
- Returns all schedule_tasks for this project, ordered by start_date

`PATCH /api/schedule/task/:id`
Body: partial task fields (status, start_date, end_date, duration_days, notes)
- Saves the update
- If start_date or duration_days changed: recalculate end_date and push all
  downstream tasks forward (tasks where this task's id is in depends_on)
- Returns `{ ok: true, updated: [] }` with the full list of changed task ids

`POST /api/schedule/analyse`
Body: `{ projectId }`
- Fetches all tasks with status != 'complete'
- Sends to Claude (use MODEL from env) with this prompt:
  "You are a residential construction scheduler. Analyse this build programme
  for Blue Leaf Building (Adelaide) and identify: (1) critical path — which
  tasks determine the end date, (2) sequencing problems, (3) procurement
  deadlines at risk within the next 4 weeks, (4) any trades scheduled
  concurrently that will conflict. Write in plain English for a builder,
  not a project manager. Be specific about task names and dates.
  Schedule: {json}"
- Returns `{ ok: true, analysis: "..." }`

**WHS:**

`GET /api/whs/:projectId/compliance`
- Joins projects → purchase_orders → subcontractors → contractor_compliance
- Returns all subcontractors on this project with their compliance documents
- Each sub has: `{ subcontractor_id, name, email, documents: [] }`
- Documents include computed `status`: 'current' | 'expiring_soon' | 'expired'
  (expiring_soon = expiry_date within 30 days)

`POST /api/whs/compliance`
Body: `{ subcontractorId, documentType, documentName, expiryDate, issueDate,
         policyNumber, insurer, fileBase64, fileName }`
- Saves file to Dropbox at `INTERNAL/WHS/COMPLIANCE/{subName}/`
- Saves contractor_compliance row
- Returns `{ ok: true, document }`

`GET /api/whs/:projectId/inductions`
- Returns all site_inductions for this project, newest first

`POST /api/whs/:projectId/reports`
Body: `{ reportType, severity, title, description, correctiveAction,
         reportedBy, photosBase64: [{ name, data }] }`
- Saves photo files to Dropbox at `[project folder]/WHS/INCIDENTS/`
- Generates a timestamped incident PDF (pdfkit, letterhead, all fields)
  and saves to same folder
- Saves site_reports row
- Returns `{ ok: true, report }`

`GET /api/whs/:projectId/reports`
- Returns all site_reports for this project

`POST /api/whs/swms`
Body: `{ trade, title, contentHtml }`
- Saves a new SWMS template
- Returns `{ ok: true, template }`

`GET /api/whs/swms`
Query: `?trade=electrical` (optional filter)
- Returns all active SWMS templates

**Site Diary:**

`POST /api/diary/structure`
Body: `{ transcript, projectAddress }`
- Sends transcript to Claude with this prompt:
  "Extract and structure this site diary transcript for {address}.
  Return JSON with these exact keys:
  { weather, trades_onsite: [], work_completed, issues, instructions_given,
    visitors }
  trades_onsite should be an array of trade name strings.
  Be concise and factual. Australian English."
- Returns `{ ok: true, structured: { ... } }`

`POST /api/diary/save`
Body: `{ projectId, entry: { entry_date, weather, trades_onsite, work_completed,
          issues, instructions_given, visitors, supervisor, raw_voice_transcript,
          structured_by_ai } }`
- Saves site_diary row
- Generates a PDF diary entry (pdfkit):
  - Header: Blue Leaf Building logo area, "SITE DIARY", project address, date
  - Table: each field as a labelled row
  - Footer: Supervisor name, generated timestamp
- Uploads PDF to Dropbox at `[project folder]/SITE DIARY/YYYY-MM-DD.pdf`
  (use `sharedJobRootPath` from dropboxClient.mjs)
- Updates the site_diary row with dropbox_pdf_path
- Returns `{ ok: true, entry, dropbox_pdf_path }`

`GET /api/diary/:projectId`
- Returns all diary entries, newest first

### Routes inside inductionRoutes.mjs

`GET /api/induction/:projectId/info`
- Returns project address + the list of active SWMS for the project
  (joins project_swms + swms_templates)
- No auth required — this is called by the public induction page

`POST /api/induction/:projectId/submit`
Body: `{ personName, company, trade, mobile, emergencyContactName,
         emergencyContactPhone, siteRulesAcknowledged, swmsAcknowledged,
         signatureDataUrl, ipAddress }`
- Validates all required fields
- Generates induction PDF (pdfkit):
  - Header: Blue Leaf Building, "SITE INDUCTION RECORD", project address
  - Section: Person details (name, company, trade, mobile, emergency contact)
  - Section: "Site rules acknowledged" with date/time
  - Section: "SWMS acknowledged" listing each SWMS by trade
  - Section: Signature image (render the base64 signature on the PDF)
  - Footer: Inducted at timestamp
- Uploads PDF to Dropbox at `[project folder]/WHS/INDUCTIONS/{name}-{date}.pdf`
- Saves site_inductions row
- Returns `{ ok: true }`

---

## PART 4 — SCHEDULE GENERATION LOGIC

Implement this inside the `/api/schedule/generate` handler.

### The 7 phases in order
```
site_prep → substructure → frame → rough_in → lock_up → fitout → completion
```

### Default task templates
Each entry: { name, trade, phase, duration_days, is_hold_point, procurement_lead_days }

```
SITE PREP:
  Site establishment & fencing     site_prep   3    false  0
  Demolition (if applicable)        site_prep   5    false  0
  Excavation & earthworks           site_prep   4    false  0
  Service connections               site_prep   2    false  0

SUBSTRUCTURE:
  Termite protection (pre-slab)     substructure  1  false  0
  Footings & beams                  substructure  4  false  0
  * Hold point: Footing inspection  substructure  0  true   0
  In-slab plumbing rough-in         substructure  2  false  0
  Slab pour                         substructure  2  false  0
  * Hold point: Slab inspection     substructure  0  true   0
  Slab cure (7 days)                substructure  7  false  0

FRAME:
  Structural steel                  frame  5   false  35
  Wall & roof frame                 frame  10  false  0
  * Hold point: Frame inspection    frame  0   true   0
  Roof trusses                      frame  3   false  14

ROUGH-IN:
  Plumbing rough-in                 rough_in  5  false  0
  Electrical rough-in               rough_in  5  false  0
  A/C rough-in                      rough_in  4  false  0
  Insulation                        rough_in  2  false  0
  * Hold point: Rough-in inspection rough_in  0  true   0
  → [Order windows now - 14 week lead]  rough_in  0  false  98
  → [Order joinery now - 8 week lead]   rough_in  0  false  56

LOCK-UP:
  Roof plumbing & metal roofing     lock_up  6   false  0
  External cladding & brickwork     lock_up  10  false  21
  Windows & glazing                 lock_up  4   false  98
  External doors & garage door      lock_up  2   false  42
  Fascia, gutters & downpipes       lock_up  3   false  0
  External render (scratch coat)    lock_up  3   false  0
  * Hold point: Lock-up inspection  lock_up  0   true   0

FITOUT:
  Plasterboard supply & fix         fitout  8   false  0
  Internal plaster & cornice        fitout  5   false  0
  Painting — first coat             fitout  4   false  0
  Tiling                            fitout  7   false  0
  Joinery & cabinetry install       fitout  5   false  56
  Painting — final coat             fitout  4   false  0
  Flooring                          fitout  4   false  28
  Stairs                            fitout  3   false  28
  Electrical fit-off                fitout  3   false  0
  Plumbing fit-off                  fitout  3   false  0
  A/C fit-off & commissioning       fitout  2   false  0
  Shower screens & mirrors          fitout  2   false  21
  Door hardware & second fix        fitout  2   false  0
  Appliances                        fitout  1   false  42
  * Hold point: PCI inspection      fitout  0   true   0

COMPLETION:
  Final clean                       completion  2  false  0
  Landscaping                       completion  5  false  0
  Driveway & paving                 completion  3  false  0
  Defect rectification              completion  3  false  0
  * Hold point: Practical completion completion  0  true   0
```

### Sequencing rules (depends_on)
When generating, set `depends_on` using task names:
- "Footings & beams" depends on "Site establishment & fencing"
- "Hold point: Footing inspection" depends on "Footings & beams"
- "In-slab plumbing rough-in" depends on "Hold point: Footing inspection"
- "Slab pour" depends on "In-slab plumbing rough-in"
- "Hold point: Slab inspection" depends on "Slab pour"
- "Slab cure (7 days)" depends on "Hold point: Slab inspection"
- "Wall & roof frame" depends on "Slab cure (7 days)"
- "Hold point: Frame inspection" depends on "Wall & roof frame", "Structural steel", "Roof trusses"
- All rough-in tasks depend on "Hold point: Frame inspection"
- "Hold point: Rough-in inspection" depends on all rough-in tasks
- "Roof plumbing & metal roofing" depends on "Hold point: Frame inspection"
- "Windows & glazing" depends on "Roof plumbing & metal roofing"
- "External cladding & brickwork" depends on "Hold point: Frame inspection"
- "Fascia, gutters & downpipes" depends on "Roof plumbing & metal roofing"
- "Hold point: Lock-up inspection" depends on "Windows & glazing", "External doors & garage door", "Fascia, gutters & downpipes"
- "Plasterboard supply & fix" depends on "Hold point: Rough-in inspection"
- "Internal plaster & cornice" depends on "Plasterboard supply & fix"
- "Painting — first coat" depends on "Internal plaster & cornice"
- "Tiling" depends on "Plasterboard supply & fix"
- "Joinery & cabinetry install" depends on "Painting — first coat", "Tiling"
- "Painting — final coat" depends on "Joinery & cabinetry install"
- "Flooring" depends on "Painting — final coat"
- "Electrical fit-off" depends on "Painting — final coat"
- "Plumbing fit-off" depends on "Tiling"
- All completion tasks depend on "Hold point: PCI inspection"

### Computing dates from the start date
Walk through tasks in depends_on order. For each task:
- start_date = max(end_date of all tasks in depends_on) + 1 day
- If no depends_on: start_date = the project startDate passed in the request
- end_date = start_date + duration_days - 1
- Hold points (duration 0): start_date = end_date = day after depends_on tasks finish
- order_by_date = start_date minus procurement_lead_days (null if lead_days = 0)

### Only include tasks for trades in the project
The project has `accepted_trades[]` — a list of trade names. Only generate
tasks where the task's trade is present in accepted_trades (case-insensitive
fuzzy match). Always include site_prep and substructure tasks regardless.
Always include hold points regardless.

---

## PART 5 — FRONTEND PAGES

### App.jsx — add these new routes
```jsx
<Route path="/operations/:projectId" element={<OperationsProjectDetail />} />
<Route path="/operations/:projectId/schedule" element={<ScheduleManager />} />
<Route path="/operations/:projectId/whs" element={<WhsManager />} />
<Route path="/operations/:projectId/diary" element={<SiteDiary />} />
<Route path="/induct/:projectId" element={<SiteInduction />} />
```

The `/induct/:projectId` route must be **outside** the `<AppShell>` wrapper —
it's a public page with no navigation chrome.

### 6D — OperationsProjectDetail.jsx (REPLACE existing content)

Keep the same file path. The page becomes a tabbed dashboard.

**Tab bar** (horizontal, below the project header):
`Dashboard | Schedule | WHS | Diary | Financials`

Active tab is stored in URL query param `?tab=dashboard` (default: dashboard).
Use `useSearchParams` so deep links work.

**Header** (shown on all tabs):
- Project address (h1)
- "Won [date]" in muted text
- Row of action buttons: Dropbox link (if set), "Back to projects" link

**Dashboard tab:**
Four summary cards in a 2×2 grid:

*Card 1 — Today*
- Today's date formatted nicely
- Current phase label (find the first phase with any task not yet complete)
- Trades on site today: query schedule_tasks where today falls between
  start_date and end_date, show as chips
- Next hold point: the next task where is_hold_point = true and status != complete

*Card 2 — Procurement deadlines*
- Query schedule_tasks where order_by_date is not null and status != complete,
  order by order_by_date asc, show next 5
- Each row: task name, trade, order by date, days until order date
- Red if order_by_date < today, amber if < 7 days, green otherwise

*Card 3 — WHS alerts*
- Count of contractor_compliance rows where status = 'expired' (red) or
  'expiring_soon' (amber)
- Count of open site_reports
- Link to WHS tab

*Card 4 — Schedule health*
- Total tasks, complete tasks, % complete
- Projected end date (end_date of the last incomplete task)
- Tasks with ai_flag set (count)

Below the cards: last 3 diary entries as compact rows
(date, weather, trades on site comma-separated, first 100 chars of work_completed)
with a "View all" link to the Diary tab.

**Schedule tab:**
Link to `/operations/:projectId/schedule` (full page)

**WHS tab:**
Link to `/operations/:projectId/whs` (full page)

**Diary tab:**
Link to `/operations/:projectId/diary` (full page)

**Financials tab:**
Move the existing OperationsProjectDetail content here:
- Accepted trades + PO issue button
- Buildexact link section
- Tentative start date

---

### 6A — ScheduleManager.jsx

Route: `/operations/:projectId/schedule`

**Page layout:**
- Header: project address, back link to `/operations/:projectId`
- Action buttons: "Generate schedule" | "AI Analyse" | "Export CSV"

**If no tasks exist yet:**
Show an empty state with a "Generate schedule" button that opens a modal:
- Start date input (date picker, required)
- Checkbox list of task templates to exclude (e.g. "Exclude demolition")
- Submit button → POST /api/schedule/generate

**If tasks exist — Gantt view:**

Left panel (35% width, scrollable):
- Group by phase. Each phase is a collapsible section with a coloured header:
  - site_prep: slate
  - substructure: stone
  - frame: amber
  - rough_in: blue
  - lock_up: green
  - fitout: purple
  - completion: teal
- Each task row: status icon | task name | trade chip | date range | duration
- Hold points render as a diamond ◆ row, not a bar
- Click a row → opens an edit slide-over panel (see below)

Right panel (65% width, SVG Gantt):
- Build this in `src/lib/ganttRenderer.js` as a pure function that takes
  tasks and a date range and returns SVG markup as a string, then render
  with `dangerouslySetInnerHTML` in a scrollable container.
- Timeline header: week numbers + month labels
- Each task = a horizontal rectangle. Colour by phase (same colours as left panel).
  Hold points = diamond shape.
- Status fill: planned=50% opacity, in_progress=100%, complete=striped,
  delayed=amber, blocked=red
- Procurement flag: a small ▶ icon at the order_by_date position
- Hover tooltip: task name, trade, start–end dates, assigned sub (if any)
- Click a bar → same edit slide-over as left panel

**Task edit slide-over:**
Opens from the right side of the screen (fixed panel, 400px wide on desktop,
full-width on mobile)
Fields:
- Status dropdown (planned / in_progress / complete / delayed / blocked)
- Start date (date input)
- Duration days (number input)
- End date (computed, read-only display)
- Notes (textarea)
- Assigned subcontractor (searchable select from subcontractors table)
- Hold point toggle (checkbox)
- AI flag (read-only if set, clear button)
Save → PATCH /api/schedule/task/:id → refreshes task list

**AI Analysis panel:**
Triggered by "AI Analyse" button. Shows a loading spinner then the analysis
text in a slide-over panel. Rendered as plain text with newline preservation.
"Save to Dropbox" button → POST to generate PDF of analysis, save to
`[project folder]/SCHEDULE/AI-ANALYSIS-{date}.pdf`

**Export CSV:**
Client-side: build a CSV from the current task list and trigger a download.
Columns: Phase, Trade, Task, Start, End, Duration, Status, Hold Point, Notes

---

### 6B — WhsManager.jsx

Route: `/operations/:projectId/whs`

**Three tabs: Contractors | Inductions | Incidents**

**Contractors tab:**

Fetch via GET /api/whs/:projectId/compliance.
For each subcontractor on this project, show a card:
- Sub name + trade badge
- Compliance status: "All Good" (green), "Action Required" (amber/red)
- Expandable documents section:
  Each document: type label | document name | expiry date | status chip | Download link
  Status chip: 'current' = green, 'expiring_soon' = amber, 'expired' = red, 'missing' = red dashed
- "Add document" button → opens add-document modal

Add-document modal:
- Document type select (Public Liability / Workers Comp / Licence / SWMS / Other)
- Document name (text)
- Issue date, expiry date (date inputs)
- Policy number, insurer (text, optional)
- File upload (PDF or image)
- Save → POST /api/whs/compliance

At the top of this tab: a banner showing expiring/expired counts with a warning icon.

**Inductions tab:**

- QR code display: use the `qrcode` package (add it as a dependency) to
  generate a QR code image for the URL
  `{window.location.origin}/induct/{projectId}`
  Show it as a large image with a "Download QR code" button (triggers PNG download)
  and a "Copy link" button.
- Induction log: table of all site_inductions for this project:
  Name | Company | Trade | Date/time | Signature | PDF
  "Signature ✓" if signature_data_url is set.
  PDF link opens Dropbox path in new tab if set.

**Incidents tab:**

- List of all site_reports. Each row: type badge | severity chip | title |
  reported date | status
- Expand row to see description, corrective action, photos
- "Report incident" button → opens report modal
  Fields: Report type select, severity select, title, description,
  corrective action (textarea), reported by, photo upload (multiple)
  Save → POST /api/whs/:projectId/reports
- "Resolved" button on each open report → PATCH report status to 'resolved'

---

### 6C — SiteDiary.jsx

Route: `/operations/:projectId/diary`

**Page layout:**
Header: project address, "Site Diary", back link
Two columns on desktop (50/50), stacked on mobile:

**Left — New entry:**

Step 1: Record
- Large mic button. On click: start Web Speech API recording.
  ```js
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  ```
  If SR is not available: show a textarea labelled "Type your entry manually".
  If SR is available: show a pulsing red dot while recording, live transcript
  text appearing in a read-only textarea below the mic button.
  Stop button ends recording.

Step 2: Structure
- "Structure with AI" button. Disabled until there is transcript text.
  On click → POST /api/diary/structure
  Shows loading spinner. On success: populates the entry fields.

Step 3: Review entry fields
These are editable after AI fills them:
- Date (date input, default today)
- Weather (text input)
- Trades on site (multi-select chips from project's accepted_trades list —
  load from project data, allow freetext addition)
- Work completed (textarea)
- Issues (textarea, optional)
- Instructions given (textarea, optional)
- Visitors (text input, optional)
- Supervisor (text input, defaults to "Sam Morris" from settings)

"Save entry" button → POST /api/diary/save
On success: show "Saved. PDF filed to Dropbox." toast, clear the form.

**Right — Past entries:**

Scrollable list, newest first. For each entry:
- Date (bold), weather (muted)
- Trade chips
- Work completed (truncated at 120 chars, "read more" to expand)
- Dropbox PDF link (if set)

---

### 6E — SiteInduction.jsx (PUBLIC PAGE)

Route: `/induct/:projectId`
No AppShell wrapper. Full-page clean layout. Mobile-first.
This page is public — no Supabase client auth required.

**Step indicator** at the top: 1 → 2 → 3 → 4

**Step 1 — Your details:**
- First + last name (text)
- Company (text)
- Trade (select: Carpenter | Electrician | Plumber | HVAC | Tiler | Painter |
  Plasterer | Concreter | Roofer | Labourer | Other)
- Mobile number (tel input)
- Emergency contact name (text)
- Emergency contact phone (tel input)
Next button (validates all fields)

**Step 2 — Site rules:**
Project address shown at top.
Six rules, each as a card with a checkbox the user must tick individually:
1. Wear full PPE at all times — hard hat, hi-vis vest, steel-capped boots
2. No alcohol, drugs, or impairment on site at any time
3. Report all hazards, near-misses, and incidents immediately to the supervisor
4. No mobile phone use while operating plant or machinery
5. Respect neighbouring properties — no noise before 7am or after 6pm
6. Follow all directions from the site supervisor

"All rules acknowledged" summary chip appears when all 6 are ticked.
Next button only enables when all 6 are ticked.

**Step 3 — SWMS:**
Fetch GET /api/induction/:projectId/info to get SWMS for this person's trade.
If no SWMS are assigned for this trade: show "No specific SWMS required for
your trade on this project. Proceed to signature."
If SWMS exist: each shown as a card with:
- SWMS title
- "View SWMS (PDF)" link (opens dropbox path in new tab)
- Checkbox: "I have read and understood this Safe Work Method Statement"
Next button enables when all SWMS are acknowledged (or none required).

**Step 4 — Signature:**
Label: "Sign below to confirm your induction"
Canvas element (300×150px) for signature drawing.
- Touch/mouse events to draw on the canvas
- "Clear" button resets canvas
"Sign & Submit" button (disabled until signature has been drawn):
- Converts canvas to base64 PNG (canvas.toDataURL())
- POST /api/induction/:projectId/submit with all collected data
- Loading state while submitting
- On success: replace entire page with a thank-you screen:
  "You're signed in. Stay safe out there."
  Large green checkmark. Project address. Date/time.

---

## PART 6 — ADDITIONAL PACKAGES NEEDED

Add to package.json dependencies:
```
"qrcode": "^1.5.3"
```

Run `npm install qrcode` after updating package.json.

Use it in WhsManager.jsx:
```js
import QRCode from "qrcode";
// Generate data URL:
const url = await QRCode.toDataURL(`${window.location.origin}/induct/${projectId}`, {
  width: 300,
  margin: 2
});
```

---

## PART 7 — DROPBOX PATHS FOR NEW FEATURES

Use the existing `sharedJobRootPath(address)` from `server/lib/dropboxClient.mjs`
to build all paths:

```
Induction PDFs:    {sharedJobRootPath}/WHS/INDUCTIONS/{name}-{YYYY-MM-DD}.pdf
Incident PDFs:     {sharedJobRootPath}/WHS/INCIDENTS/{YYYY-MM-DD}-{title}.pdf
Diary PDFs:        {sharedJobRootPath}/SITE DIARY/{YYYY-MM-DD}.pdf
Schedule analysis: {sharedJobRootPath}/SCHEDULE/AI-ANALYSIS-{YYYY-MM-DD}.pdf
```

For compliance documents (per-sub, not per-project):
```
{DROPBOX_PRIVATE_INTERNAL_BASE}/CONTRACTORS/{subName}/{documentType}-{YYYY-MM-DD}.pdf
```
`DROPBOX_PRIVATE_INTERNAL_BASE` is already defined in `server/lib/dropboxClient.mjs`.

---

## BUILD ORDER

Follow this exact sequence. Each step should be working before starting the next.

1. **Run all SQL migrations** from Part 2 in Supabase.

2. **Navigation & Home changes** (AppShell.jsx, Home.jsx, TenderDetail.jsx,
   FeeProposalWizard.jsx) — no backend needed, deploy and verify visually.

3. **module6Routes.mjs** — diary and WHS endpoints first (simpler, no Gantt logic).
   Test each endpoint with curl before moving on.

4. **inductionRoutes.mjs** — public induction submit + PDF generation.

5. **OperationsProjectDetail.jsx** — replace with tabbed dashboard. Dashboard tab
   can show loading states for data not yet fetched. Financials tab moves existing
   PO/Buildexact content.

6. **SiteDiary.jsx** — voice recording, AI structuring, save.

7. **WhsManager.jsx** — compliance tab first (read-only list), then add-document,
   then inductions tab with QR code, then incidents.

8. **SiteInduction.jsx** — public induction page. Test on mobile.

9. **Schedule generation endpoint** `/api/schedule/generate` — implement
   sequencing logic from Part 4.

10. **ScheduleManager.jsx** — left panel task list first, then SVG Gantt,
    then edit slide-over, then AI analysis.

---

## IMPORTANT CONSTRAINTS

- Mobile-first for SiteInduction.jsx and SiteDiary.jsx. These are used on site
  on phones. Large touch targets, simple layouts, no tiny text.
- SiteInduction.jsx has NO navigation shell, NO login, NO Supabase client auth.
  It only calls the server API.
- The Gantt SVG renderer must handle up to 60 tasks without performance issues.
  Keep it simple: no animations, no drag (just click to edit).
- Never use `window.alert()`. Use inline error messages with the existing
  `text-danger` style.
- All loading states must show a spinner or "Loading…" text. Never show blank
  content while fetching.
- Dropbox upload failures must NOT break the main save flow. Catch Dropbox
  errors separately and log them; still save the database row.
