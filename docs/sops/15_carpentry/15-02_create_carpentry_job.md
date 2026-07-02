---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Create a Carpentry Job

**Module:** Carpentry  
**SOP ID:** 15-02  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this

Admin, Supervisor

---

## 2. When to use it

When a Buildexact quote is accepted and you need to create a corresponding carpentry job in Blue Leaf Hub to begin tracking production, costs, and diary entries.

---

## 3. What this does

Creates a new carpentry job record with a unique reference number (CJB-001, CJB-002, etc.). The job stores client details, site address, project type (frame/fit-off/lockup/full package), quoted value, and planned dates. Default milestones are automatically seeded based on the project type selected. The worker task checklist is NOT auto-seeded — you apply it manually when ready (Diary tab → "Base checklist" button). If the job came from Buildexact, you can optionally import the client name, address, and quoted value automatically.

---

## 4. Before you start

- The Buildexact quote must have been accepted (this is the workflow trigger)
- You need the Buildexact Job ID if using the auto-import feature
- You need the builder company name and site address at minimum

---

## 5. Step-by-step process

1. Navigate to **Carpentry** in the sidebar
2. Click the **New Job** button (top-right of the page)
3. A modal will appear with two sections:
   - **Import from Buildexact (optional)** — at the top
   - **Job details form** — below

**Option A — Import from Buildexact:**

4. Enter the Buildexact Job ID in the "Import from Buildexact" field
5. Click **Fetch** (or press Enter)
6. The system will pre-fill: Client name, Address, Description, Quoted value
7. A green confirmation message appears: "✓ Data imported — fields below pre-filled. Review and confirm."
8. Review and adjust any pre-filled fields as needed

**Option B — Manual entry:**

4. Skip the Buildexact field and fill the form manually

**All paths:**

9. Fill in the required fields:
   - **Client (builder)** — the builder company name (required)
   - **Site address** — full street address (required)
10. Fill in optional fields:
    - Contact person, phone, email
    - Description / scope (brief notes)
    - **Project type** — Frame Only / Fit-Off Only / Frame + Fit-Off / Other
    - Storeys, Floor area (m²)
    - Quoted value (ex GST) and Budgeted cost (ex GST)
    - Planned start and planned completion dates
    - Notes
11. Click **Create Job**
12. You will be redirected to the new job's detail page

> 💡 **Tip:** Setting the project type correctly matters — it determines which default milestones are seeded. "Full Package" gets 14 milestones (Site measure through Practical completion). "Frame Only" gets 10. "Fit-Off Only" gets 7. "Lock-Up Only" gets 8.

[insert screenshot: New Job modal with Buildexact import field and form fields]

---

## 6. What happens next

- A unique reference number is generated (CJB-NNN, sequential — or the Buildexact job number if linked)
- Default milestones are automatically created on the Schedule tab based on project type
- The job appears in the Carpentry dashboard with "Active" status
- Worker tasks are NOT auto-added — go to the Diary tab and click "Base checklist" to seed the standard per-stage checklist when you are ready
- You can immediately start adding diary entries, costs, and updating milestone dates

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Buildexact fetch fails | Invalid Job ID or Buildexact not configured | Check the ID against Buildexact; if not configured, skip import and fill manually |
| Wrong project type selected | Misunderstanding of frame/fit-off scope | Confirm scope with site supervisor before creating |
| Quoted value not entered | Optional field skipped | Enter quoted value so the costs dashboard can calculate margins |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| "Buildexact is not configured" error | BUILDEXACT env vars not set | Fill form manually; ask admin to configure Buildexact in Settings |
| "Could not fetch from Buildexact" | Invalid Job ID or API error | Double-check the Job ID in Buildexact; try again or fill manually |
| "clientName and address are required" | Required fields left empty | Fill both Client and Address fields |

---

## 9. Related SOPs

- 15-01: Carpentry Overview and Navigation
- 15-03: Manage Job Milestones
- 15-04: Write a Carpentry Site Diary Entry

---

## 10. Screenshot placeholders

[insert screenshot: New Job modal — empty state with Buildexact import field at top]
[insert screenshot: New Job modal — after Buildexact fetch, showing green confirmation and pre-filled fields]
[insert screenshot: Job detail page immediately after creation — Schedule tab showing pre-seeded milestones, Diary tab showing empty task list with "Base checklist" button visible]

---

## 11. Automation notes

- Reference number: generated server-side via `alloc_carpentry_sequence()` Supabase RPC → `CJB-NNN` format (or the Buildexact job number if linked).
- Default milestones: inserted into `carpentry_job_milestones` immediately on job creation — no user action required.
- Worker task checklist: NOT auto-seeded. Must be applied manually via `POST /api/carpentry/jobs/:id/tasks/apply-template` (Diary tab → "Base checklist" button). This is idempotent — safe to run multiple times.
- No email or notification is sent on job creation.
- Status is set to `active` automatically.

---

## 12. Edge cases and limits

- If a Buildexact job number is entered but Buildexact is not configured, the system returns HTTP 503 — the form can still be completed manually.
- If the same Buildexact job ID is used to create two Hub jobs, both are created (no duplicate guard). Avoid this.
- The reference counter does not reset after a job is deleted — deleted CJB-001 means the next job is CJB-002.
- Quoted value and budgeted cost are optional at creation. The margin calculation shows "—" until both are set.
- Project type can be changed after creation via the Edit button, but existing milestones are not re-seeded — they must be managed manually.
- Worker tasks are created with zero tasks by default; the "Base checklist" button adds the standard per-stage set.

---

## 13. Owner of the process

Admin / Supervisor  
Next review date: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

**Test environment:** Local dev. Migration 065 applied.

### TC-01 — Manual job creation (minimum fields)

**Action:** POST to `/api/carpentry/jobs` with `{ clientName: "Test Builder Pty Ltd", address: "1 Test St, Adelaide SA 5000", projectType: "full_package" }` and valid Bearer token.  
**Expected:**
- HTTP 200
- `{ ok: true, job: { id: "...", reference: "CJB-001", clientName: "Test Builder Pty Ltd", address: "1 Test St, Adelaide SA 5000", status: "active", projectType: "full_package" } }`
- Reference is `CJB-NNN` format

**Pass criteria:** `ok: true`, job has `reference` starting with "CJB-", status is "active".

---

### TC-02 — Default milestones seeded on creation

**Action:** After TC-01 (`projectType: "full_package"`), GET `/api/carpentry/jobs/:id/milestones`.  
**Expected:** Response contains 14 milestones including "Site measure / Prestart", "Frame start", "Truss install", "Cladding start", "Fit-off start", "Defects", "Practical completion" — all `status: "pending"`.  
**Pass criteria:** `milestones.length === 14`, all `status === "pending"`.

---

### TC-03 — Frame-only project type milestones

**Action:** POST to `/api/carpentry/jobs` with `projectType: "frame"`.  
**Expected:** GET milestones returns 10 milestones: Site measure / Prestart → Frame start → Frame complete → Truss install → Lock-up / Wrap → Defects → Final inspection → Practical completion (plus Material ordered and Frame delivery).  
**Pass criteria:** `milestones.length === 10`.

---

### TC-04 — Required field validation

**Action:** POST to `/api/carpentry/jobs` with `{}` (empty body).  
**Expected:** HTTP 400, `{ ok: false, error: "clientName and address are required." }`.  
**Pass criteria:** 400 status, correct error message.

---

### TC-05 — Invalid project type

**Action:** POST to `/api/carpentry/jobs` with `{ clientName: "X", address: "Y", projectType: "invalid_type" }`.  
**Expected:** HTTP 400, error message containing "projectType must be one of".  
**Pass criteria:** 400 status, validation error.

---

### TC-06 — Buildexact fetch endpoint (configured)

**Action:** POST to `/api/carpentry/buildexact/fetch` with `{ buildexactJobId: "12345" }` and valid token.  
**Expected (if Buildexact configured):** `{ ok: true, prefill: { buildexactJobId: "12345", clientName: "...", address: "...", quotedValue: ... } }`.  
**Expected (if Buildexact not configured):** HTTP 503, `{ ok: false, error: "Buildexact is not configured..." }`.  
**Pass criteria:** Either valid prefill or clean 503 — no 500 errors or stack traces.

---

### TC-07 — Sequential reference numbers

**Action:** Create 3 jobs in sequence.  
**Expected:** References are CJB-001, CJB-002, CJB-003 (or continuing from existing sequence).  
**Pass criteria:** Each reference is unique and sequential.

---

### TC-08 — UI modal creates job and redirects

**Action:** In the browser, open the Carpentry dashboard. Click "New Job". Fill in Client and Address. Click "Create Job".  
**Expected:**
- Modal shows "Creating…" while saving
- On success, browser navigates to `/carpentry/:jobId`
- Job detail page shows correct client name and reference number

**Pass criteria:** No error shown, redirect occurs, job detail loads.

---

### TC-09 — Worker task checklist NOT auto-seeded on creation

**Action:** After TC-01 or TC-08, GET `/api/carpentry/jobs/:id/tasks` immediately after job creation.  
**Expected:** `{ ok: true, tasks: [] }` — empty array. No tasks pre-created.  
**Verification:** Navigate to the Diary tab in the browser — task list is empty; "Base checklist" button is visible.  
**Pass criteria:** Zero tasks on a freshly created job.
