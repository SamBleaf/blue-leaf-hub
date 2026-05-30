---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Carpentry Module — Overview and Navigation

**Module:** Carpentry  
**SOP ID:** 15-01  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this

Admin, Supervisor

---

## 2. When to use it

When you need to understand how the Carpentry section of Blue Leaf Hub is structured, what it tracks, and how to navigate between jobs.

---

## 3. What this does

The Carpentry module tracks supply-and-install carpentry jobs for small builders. It sits in its own sidebar section separate from the main construction business. Each job has a reference number (CJB-001, CJB-002, etc.), tracks the builder client, site address, quoted value, milestones, site diary, and costs. The module is designed for production tracking, cost vs budget monitoring, and historical performance benchmarking.

---

## 4. Before you start

- You must be logged in with Admin or Supervisor role
- The Carpentry section must be visible in the sidebar (it appears below the Clients section)
- The database migration `065_carpentry_module.sql` must have been applied

---

## 5. Step-by-step process

1. Log in to Blue Leaf Hub
2. Look at the sidebar — find the **Carpentry** section (icon: hammer/chisel tool)
3. Click **Carpentry** to open the Jobs list dashboard
4. The dashboard shows:
   - **Stats banner** at the top: Active Jobs count, Total Quoted Value, Average Budget Margin, Total Jobs
   - **Status filter bar**: Active / On Hold / Complete / Cancelled / All Jobs
   - **Jobs table**: Reference | Client | Address | Type | Status | Quoted | Margin | Start | End
5. Click any row in the table to open that job's detail page
6. The detail page has four tabs: **Overview**, **Schedule**, **Diary**, **Costs**

> 💡 **Tip:** The status filter defaults to "Active". Switch to "All Jobs" to see your complete job history.

[insert screenshot: Carpentry dashboard with stats banner and jobs table]

---

## 6. What happens next

From the dashboard you can create new jobs, filter by status, and navigate to any job's detail page. From the detail page you can edit job info, manage milestones, write diary entries, and track costs.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Carpentry section not visible | User role is Employee (not Admin or Supervisor) | Log in with Admin or Supervisor account |
| No jobs visible | Status filter left on "Active" but no active jobs exist | Switch filter to "All Jobs" |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| "Could not load carpentry jobs" error | Server not running or DB not configured | Check API server is running on port 8787 |
| Carpentry section missing from sidebar | DB migration not applied or user role is Employee | Apply migration 065, or confirm user role is Admin/Supervisor |

---

## 9. Related SOPs

- 15-02: Create a Carpentry Job
- 15-03: Manage Job Milestones
- 15-04: Write a Carpentry Site Diary Entry
- 15-05: Track Carpentry Job Costs

---

## 10. Approval and sign-off

Not required for this SOP.

---

## 11. Version history

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-05-30 | Claude | Initial draft |

---

## 12. Screenshots required

- [ ] Sidebar showing Carpentry nav item
- [ ] Carpentry dashboard with stats banner and jobs table
- [ ] Status filter bar

---

## 13. Notes for trainers

The Carpentry module is a separate subsidiary stream. It does not interact with the main Operations/Projects module. Jobs are created from accepted Buildexact quotes using the same master estimate template.

---

## 14. Troubleshoot Agent Test Script

**Test environment:** Local dev (npm run dev). DB must have migration 065 applied.

### TC-01 — Navigation renders correctly

**Action:** Log in as Admin. Click "Carpentry" in the sidebar.  
**Expected:**
- URL changes to `/carpentry`
- Page title "Carpentry Jobs" is visible
- Stats banner shows 4 stat cards
- Status filter bar shows: Active, On Hold, Complete, Cancelled, All Jobs
- Jobs table header row visible

**Pass criteria:** All elements present, no console errors.

---

### TC-02 — Empty state message

**Action:** With no active jobs in the database, navigate to `/carpentry` (status filter on "Active").  
**Expected:** Empty state message appears: `No active carpentry jobs. Click "New Job" to create one.`  
**Pass criteria:** Message displayed, no 500 errors.

---

### TC-03 — Status filter works

**Action:** Click each status filter button (Active, On Hold, Complete, All Jobs).  
**Expected:**
- Each click triggers a new API call with matching status param
- Table refreshes with correct results
- Active filter button shows primary background colour

**Pass criteria:** API calls to `/api/carpentry/jobs?status=<value>` logged in Network tab for each click.

---

### TC-04 — Auth required

**Action:** Open `/api/carpentry/jobs` directly in browser (no auth token).  
**Expected:** `{ ok: false, error: "Unauthorised" }` returned with HTTP 401.  
**Pass criteria:** 401 response, no data leak.

---

### TC-05 — API health check

**Action:** With the server running, hit `GET /api/carpentry/jobs` with a valid Bearer token.  
**Expected:** `{ ok: true, jobs: [] }` (or with jobs if data exists).  
**Pass criteria:** `ok: true` in response JSON. All job objects have camelCase keys (e.g. `clientName`, `quotedValue` — not `client_name`).

---

### TC-06 — All Jobs filter shows complete and cancelled

**Action:** Create one active and one complete job. Click "All Jobs" filter.  
**Expected:** Both jobs appear in the table regardless of status.  
**Pass criteria:** Table row count = 2.

---

### TC-07 — Stats banner aggregation

**Action:** With 2 active jobs (quotedValue: $80,000 and $120,000), check the stats banner.  
**Expected:**
- Active Jobs: 2
- Total Quoted Value: $200,000
- Total Jobs: 2 (or more if other jobs exist)

**Pass criteria:** Values correct within rounding.
