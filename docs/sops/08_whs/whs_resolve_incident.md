---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: placeholders_only
owner: Admin
test_status: static_pass
---

# SOP 08-06: Resolve a WHS Incident

**Module:** Operations → WHS Manager → Reports  
**SOP ID:** 08-06  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Admin, Supervisor

## 2. When to use it
Once the hazard or incident has been dealt with and the corrective action is complete, mark the report resolved so the open-items list reflects only outstanding safety matters.

## 3. What this does
Changes a WHS report's status from `open` to `resolved` and stamps the resolution time. Resolved reports remain on record for audit but drop out of the "open" working list.

## 4. Before you start
- The incident or hazard has actually been made safe — don't resolve a report that's still outstanding
- The report exists and is currently `open`

## 5. Step-by-step process

1. Open the project in Operations, then open **WHS** → **Incidents** tab
2. Find the open report
3. Confirm the corrective action is complete
4. Click **Mark resolved**

The report status changes to `resolved` and the resolution time is recorded.

## 6. What happens next

- `site_reports.status` → `'resolved'`, `resolved_at` = now
- The report stays in the record for audit; it's no longer counted as open
- This is the only status change this endpoint allows — it specifically sets `resolved`

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Resolving prematurely | Wanting a clean list | Only resolve once the corrective action is genuinely complete |
| Treating resolve as delete | Confusion | Resolving keeps the record — nothing is deleted. WHS records must be retained. |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Invalid request." (400) | The endpoint only accepts `status: "resolved"` with a valid report id — any other status is rejected |
| Report still shows open after clicking | Reload the **Incidents** tab; confirm the PATCH returned `{ ok: true }` |
| Need to reopen a resolved report | This endpoint only sets `resolved` — reopening would require a separate action/admin change |

## 9. Related modules
- [Log a WHS incident or near miss](whs_log_incident.md) — SOP 08-05

## 10. Screenshot placeholders
[insert screenshot: open report with Mark resolved button]
[insert screenshot: resolved report state]

## 11. Automation notes
- API: `PATCH /api/whs/report/:id` (requires auth) with `{ status: "resolved" }`
- Validation: rejects with 400 "Invalid request." unless `id` is present AND `status === "resolved"`
- On success: `site_reports.status = 'resolved'`, `resolved_at = now()`; returns the updated report
- There is no delete endpoint for WHS reports — records are retained

## 12. Edge cases and limits
- Only `resolved` is a permitted status value via this endpoint — you cannot set arbitrary statuses
- Resolving is not reversible through this endpoint
- WHS reports are never deleted (compliance/audit retention)

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in
- [ ] An open WHS report (status `open`) on a test project

### Test cases

**TC-01 — Resolve a report (happy path)**
1. Open an `open` report and click Mark resolved
2. Expected: `{ ok: true, report: {...} }`
3. Expected DB: `site_reports.status = 'resolved'`, `resolved_at` set
- [ ] Pass  [ ] Fail

**TC-02 — Invalid status rejected**
1. PATCH the report with `status: "closed"` (anything other than "resolved")
2. Expected: HTTP 400 "Invalid request."
3. Expected DB: status unchanged
- [ ] Pass  [ ] Fail

**TC-03 — Missing id rejected**
1. Call the endpoint with no report id
2. Expected: HTTP 400 "Invalid request."
- [ ] Pass  [ ] Fail

**TC-04 — Resolved report drops off the open list**
1. After resolving, view the open reports
2. Expected: the resolved report is no longer counted as open (still retained in the full list)
- [ ] Pass  [ ] Fail

**TC-05 — Record retained (no delete)**
1. Confirm there is no delete action for the report
2. Expected: resolved report still exists in `site_reports`
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Resolve sets status + resolved_at
- [ ] Only "resolved" status accepted
- [ ] Missing id rejected
- [ ] Resolved report retained (not deleted)
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
