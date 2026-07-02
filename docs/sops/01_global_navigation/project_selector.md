---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Use the Global Project Selector

**Module:** Global Navigation  
**SOP ID:** 01-02  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
All staff — particularly Supervisors and Project Managers working across multiple projects.

## 2. When to use it
When you need to quickly switch between projects without going back to the Operations list each time.

## 3. What this does
The project bar lets you select and switch between active projects from anywhere in the app. Once a project is selected, the selected context follows you across modules (Operations, Finance, Tendering) and shows contextual quick links relevant to the current section.

## 4. Before you start
- At least one project must exist in the system
- You must be signed in

## 5. Step-by-step process

### Selecting a project

1. Look for the **project bar** — a slim sticky strip that appears below the page header (below the mobile top bar on mobile, or below the main content header on desktop). It shows either the current project address or "Select project…"

[insert screenshot: Project bar showing "Select project…" with dropdown arrow]

2. Click (or tap) the **project address button** to open the project picker

3. **On desktop**: a dropdown appears beneath the button with a search field and list of active projects

[insert screenshot: Desktop project dropdown open with search field and project list]

4. **On mobile**: a bottom sheet slides up from the bottom of the screen with the same search field and project list

[insert screenshot: Mobile bottom sheet project picker]

5. Type part of the project address to filter the list
6. Click or tap the project you want — the picker closes and the project bar updates to show the selected project address

### Switching to a different project

1. Click or tap the project address shown in the project bar
2. Select a different project from the list — the page context updates immediately

### Clearing the project context

- **When quick links are visible (desktop):** click the × button on the far-right end of the project bar
- **Inside the picker dropdown/sheet:** click "Clear — show all projects" at the bottom of the list

Clearing the project context returns all project-specific views (e.g. Operations, Finance Job Dashboard) to their "all projects" state.

### Contextual quick links

On desktop, once a project is selected, quick links appear beside the project button depending on which section you're in:

| Section | Quick links shown |
|---------|------------------|
| Operations | Overview · Schedule · Diary · WHS · Financials (if linked job) |
| Tendering | Quotes · RFQ Engine · Board |
| Finance | Inbox · Approvals · Job Dashboard (if linked job) |

[insert screenshot: Project bar with contextual quick links visible]

## 6. What happens next
The current section (e.g. Schedule, Site Diary, WHS) shows data for the newly selected project. The selected project context persists as you navigate between modules — switching from Operations to Finance will pre-select the same project's Job Dashboard if the job is linked.

## 7. Common mistakes
- Accidentally switching projects when you meant to do something else — always check the project address shown in the project bar before making changes.
- Not finding your project in the list — it may be archived. Go to Operations and confirm the project is active.
- The project bar does not appear — this can happen if no projects exist in the system yet. Check Operations to add one.
- On mobile, the picker opens as a bottom sheet (not a dropdown); scroll the list or use the search field if you have many projects.

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Project not showing in the list | It may be archived. Go to Operations and check. |
| Project bar is not visible | The project bar only shows when at least one project exists in the system. |
| Quick links don't appear | Quick links are desktop-only and only show for Operations, Tendering, and Finance sections. |
| Selecting a project doesn't update the page | Try refreshing. If the issue persists, clear the project and reselect it. |

## 9. Related modules
- [View the operations dashboard](../05_operations/operations_view_dashboard.md) — SOP 05-01
- [Navigate the app](navigate_the_app.md) — SOP 01-01

## 10. Screenshot placeholders
[insert screenshot: Project bar showing "Select project…" placeholder state]
[insert screenshot: Desktop dropdown open — search field and project list]
[insert screenshot: Mobile bottom sheet picker open]
[insert screenshot: Project bar with selected project and contextual quick links (Operations context)]
[insert screenshot: Project bar with × clear button visible (no quick links state)]

## 11. Automation notes
None — this is a manual navigation action. The project context is stored in the browser's React state (ProjectContext) for the duration of the session and is not persisted across page reloads.

## 12. Edge cases and limits
- The project bar is hidden entirely when there are no active projects in the system.
- On mobile, the picker opens as a bottom sheet rather than a dropdown; the background is dimmed and scroll is locked while it is open.
- If a project has no linked job record, the "Financials" quick link in Operations and the "Job Dashboard" quick link in Finance do not appear.
- Context carries across modules in the same browser session; refreshing the page resets the selected project to none.
- Only active (non-archived) projects are shown in the list.
- The project list filters by address as you type; there is no filter by project type or date.

## 13. Owner of the process
Admin

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least 2 active projects exist
- [ ] Logged in as Admin or Staff

### Test cases

**TC-01 — Project picker shows all active projects**
1. Navigate to any page where the project bar is visible
2. Click the project button to open the picker
3. Expected result: list of all active projects appears, each identified by address
4. Expected: archived projects do NOT appear
- [ ] Pass  [ ] Fail

**TC-02 — Selecting a project updates the context**
1. Open the project picker and select a project
2. Expected result: project bar updates to show the selected project address
3. Navigate to Operations — expected: the selected project's detail page loads
4. Navigate to Finance — expected: Job Dashboard pre-selects the same project (if job is linked)
- [ ] Pass  [ ] Fail

**TC-03 — Search/filter works**
1. Open the project picker
2. Type part of a project address in the search field
3. Expected result: list filters in real time to matching projects only
4. Clear the search — expected: full list returns
- [ ] Pass  [ ] Fail

**TC-04 — Clear project context works**
1. Select a project
2. Re-open the picker and click "Clear — show all projects" (or use the × button on desktop)
3. Expected result: project bar returns to "Select project…" state
4. Expected: Operations and Finance views return to their all-projects list
- [ ] Pass  [ ] Fail

**TC-05 — Mobile bottom sheet opens and closes**
1. Open the Hub on a mobile device (or narrow desktop window to mobile width)
2. Tap the project button in the project bar
3. Expected result: a bottom sheet slides up from the bottom with a search field and project list
4. Tap a project — expected: sheet closes and project bar updates
5. Tap outside the sheet (on the backdrop) — expected: sheet closes without selecting a project
- [ ] Pass  [ ] Fail  [ ] Skip (mobile testing not available)

**Feature case — Contextual quick links (Operations)**
1. Select a project in the project bar
2. Navigate to Operations
3. Expected result (desktop): quick links Overview · Schedule · Diary · WHS appear beside the project button
4. Click each quick link — expected: navigates to the correct sub-section for the selected project
5. Navigate to Finance — expected: quick links change to Inbox · Approvals · Job Dashboard
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Project picker shows all active projects (none archived)
- [ ] Selection updates page context across modules
- [ ] Search/filter works in real time
- [ ] Clear function resets context correctly
- [ ] Mobile bottom sheet opens, closes, and selects correctly
- [ ] Contextual quick links appear and navigate correctly (desktop)
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
