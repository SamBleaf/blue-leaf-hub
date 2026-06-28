---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: placeholders_only
owner: Supervisor
test_status: static_pass
---

# SOP 08-05: Log a WHS Incident or Near Miss

**Module:** Operations → WHS Manager → Reports  
**SOP ID:** 08-05  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Supervisor, Employee (Admin can also log)

## 2. When to use it
As soon as practical after any safety event on site — an injury, a near miss, a hazard, or a property/equipment incident. Logging promptly creates the record and starts the corrective-action trail.

## 3. What this does
Records a WHS report against the project: the type, severity, what happened, the corrective action, who reported it, and any photos. The report opens in `open` status until it is resolved (SOP 08-06).

## 4. Before you start
- The project exists
- You know what happened and (ideally) have photos
- Decide the report type (incident / near miss / hazard) and severity

## 5. Step-by-step process

1. Open the project in Operations, then open **WHS** → **Incidents** tab (Report incident)
2. Click **New report**
3. Fill in:
   - **Report type** (required) — e.g. incident, near miss, hazard
   - **Title** (required) — a short summary
   - **Severity** — e.g. low / medium / high
   - **Description** — what happened, where, who was involved
   - **Corrective action** — what was done or is needed
   - **Reported by** — your name
   - **Photos** — attach site photos if available
4. Click **Submit report**

The report is saved with status `open` and photos are filed to Dropbox.

## 6. What happens next

- Photos are uploaded to the project's Dropbox `WHS/INCIDENTS` folder
- A `site_reports` row is inserted with `status = 'open'`, `reported_at` = now, and the photo paths
- The report appears in the Reports list, newest first, until resolved (SOP 08-06)

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Delaying the log | "I'll do it later" | Log promptly — memory fades and the record needs to be timely |
| Vague title | Rushed | Use a specific title so the report is findable later |
| No corrective action | Focused on the event | Record what was done to make it safe — that's the point of the report |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "reportType and title required." (400) | Both the type and a title are mandatory |
| "Project not found." (404) | The project ID is wrong — open the report from the correct project |
| Photos didn't attach | Dropbox may be unavailable — the report still saves; re-add photos later if needed |

## 9. Related modules
- [Resolve a WHS incident](whs_resolve_incident.md) — SOP 08-06

## 10. Screenshot placeholders
[insert screenshot: new WHS report form]
[insert screenshot: report saved in the list with "open" status]

## 11. Automation notes
- API: `POST /api/whs/:projectId/reports` (requires auth) with `{ reportType, title, severity?, description?, correctiveAction?, reportedBy?, photosBase64?[] }`
- Required: `reportType`, `title` (400 otherwise); project must exist (404 otherwise)
- Photos uploaded to Dropbox `…/WHS/INCIDENTS/[date]-[title]-photo-N-[name]`
- Inserts `site_reports` with `status = 'open'`, `reported_at`, `photo_paths[]`
- List: `GET /api/whs/:projectId/reports` ordered by `reported_at` desc

## 12. Edge cases and limits
- Photos are optional; the report saves without them
- `photosBase64` is an array of `{ name, data }` items
- Each report opens as `open` and stays until explicitly resolved

## 13. Owner of the process
Supervisor (logs); Admin (oversees)  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in
- [ ] A valid project
- [ ] A sample photo for the photo test

### Test cases

**TC-01 — Log a report (happy path)**
1. Submit a report: type "near_miss", title "Trip hazard near scaffold", severity "medium", with a description and corrective action
2. Expected: `{ ok: true }` with the inserted report
3. Expected DB: `site_reports` row with `status = 'open'`, `reported_at` set
- [ ] Pass  [ ] Fail

**TC-02 — Missing required field**
1. Submit with no title
2. Expected: HTTP 400 "reportType and title required."
3. Expected DB: no report created
- [ ] Pass  [ ] Fail

**TC-03 — Unknown project**
1. Submit to a non-existent projectId
2. Expected: HTTP 404 "Project not found."
- [ ] Pass  [ ] Fail

**TC-04 — Photos uploaded (automation)**
1. Submit a report with one photo in `photosBase64`
2. Expected: the photo is filed to Dropbox WHS/INCIDENTS
3. Expected DB: `photo_paths` contains the uploaded path
- [ ] Pass  [ ] Fail

**TC-05 — Report appears in list**
1. After logging, open WHS → **Incidents**
2. Expected: the new report appears at the top (newest first) with `open` status
3. Expected: `GET /api/whs/:projectId/reports` includes it
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Report logs with status open
- [ ] Required fields enforced
- [ ] Unknown project 404s
- [ ] Photos filed to Dropbox
- [ ] Report visible in list
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
