---
sop_version: 1.0
last_reviewed: 2026-05-30
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
The project selector lets you jump directly to any active project from anywhere in the app.

## 4. Before you start
- At least one project must exist in the system
- You must be signed in

## 5. Step-by-step process

1. Look for the **project name or address** shown in the top bar of the app
2. Click on it to open the project selector dropdown

[insert screenshot: Top bar showing current project name with dropdown arrow]

3. A list of active projects will appear
4. Type part of the address to search/filter the list
5. Click the project you want to switch to

[insert screenshot: Project selector dropdown open with search field and project list]

6. The app will update to show information for the selected project

## 6. What happens next
The current section (e.g. Schedule, Site Diary, WHS) will reload and show data for the newly selected project.

## 7. Common mistakes
- Accidentally switching projects when you meant to do something else — always check the project name shown in the top bar before making changes
- Not finding your project in the list — it may be archived. Check the Operations list to confirm it's active.

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Project not showing in the list | It may be archived. Go to Operations and check. |
| Selector is not visible | Some pages don't show the selector. Go to Operations first, then open the project. |

## 9. Related modules
- [View the operations dashboard](../05_operations/operations_view_dashboard.md) — SOP 05-01
- [Navigate the app](navigate_the_app.md) — SOP 01-01

## 10. Screenshot placeholders
[insert screenshot: Top bar with project selector visible]
[insert screenshot: Project dropdown open showing project list]

## 11. Automation notes
None — this is a manual navigation action.

## 12. Owner of the process
Admin

## 13. Review date
2026-11-20

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least 2 active projects exist
- [ ] Logged in as Admin or Staff

### Test cases

**TC-01 — Project selector shows all active projects**
1. Navigate to Operations (or any page with the project selector visible)
2. Click the project selector dropdown
3. Expected result: list of all active projects appears
4. Expected: project names and addresses are readable
- [ ] Pass  [ ] Fail

**TC-02 — Selecting a project updates the context**
1. Open the project selector
2. Select a project
3. Expected result: the page updates to show that project's data (schedule, diary, etc.)
4. Expected: the selected project name appears in the selector or page header
- [ ] Pass  [ ] Fail

**TC-03 — Selected project persists across module navigation**
1. Select a project in Operations
2. Navigate to Finance → Job Dashboard
3. Expected result: the same project is pre-selected (context carries across modules)
- [ ] Pass  [ ] Fail

**TC-04 — No project selected shows empty state**
1. If no project is selected, navigate to a project-specific section
2. Expected result: empty state message or prompt to select a project
3. Expected: does not show data from a random project
- [ ] Pass  [ ] Fail

**TC-05 — Archived project not visible in selector**
1. Archive a project (or use an already-archived project)
2. Open the project selector
3. Expected result: archived project does NOT appear in the active list
4. Expected: the project is accessible via an "Archived" filter if needed
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Project selector shows all active projects
- [ ] Selection updates page context
- [ ] Context persists across module navigation
- [ ] Archived projects excluded from active selector
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
