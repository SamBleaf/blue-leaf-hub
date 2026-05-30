---
sop_version: 1.0
last_reviewed: 2026-05-30
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

Creates a new carpentry job record with a unique reference number (CJB-001, CJB-002, etc.). The job stores client details, site address, project type (frame/fit-off/lockup/full package), quoted value, and planned dates. Default milestones are automatically seeded based on the project type selected. If the job came from Buildexact, you can optionally import the client name, address, and quoted value automatically.

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

> 💡 **Tip:** Setting the project type correctly matters — it determines which default milestones are seeded. "Frame + Fit-Off" gets 7 milestones (Frame Start through Final Inspection). "Frame Only" gets 4. "Fit-Off Only" gets 4.

[insert screenshot: New Job modal with Buildexact import field and form fields]

---

## 6. What happens next

- A unique reference number is generated (CJB-NNN, sequential)
- Default milestones are automatically created on the Schedule tab based on project type
- The job appears in the Carpentry dashboard with "Active" status
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

## 10. Approval and sign-off

Not required.

---

## 11. Version history

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-05-30 | Claude | Initial draft |

---

## 12. Screenshots required

- [ ] New Job modal — empty state
- [ ] New Job modal — after Buildexact import (green confirmation message)
- [ ] Job detail page immediately after creation (milestones pre-seeded)

---

## 13. Notes for trainers

The job reference number is generated server-side using a sequential database counter. It cannot be changed once created. If a test job is created and deleted, the reference counter does NOT reset — the next job will skip the deleted number (e.g. CJB-001 created, deleted, next is CJB-002).

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
