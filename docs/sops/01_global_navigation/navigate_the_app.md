---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Navigate the App

**Module:** Global Navigation  
**SOP ID:** 01-01  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
All staff.

## 2. When to use it
Whenever you need to move between different sections of Blue Leaf Hub.

## 3. What this does
Explains the layout of the app and how to get to each section quickly.

## 4. Before you start
- You must be signed in (see SOP 00-01)

## 5. Step-by-step process

### On a desktop or laptop

The app has a **left-hand sidebar** that is always visible. Click any item to go to that section.

[insert screenshot: Full app with left sidebar visible and menu items labelled]

**Sidebar items and what they do:**

| Sidebar item | What it is |
|-----------|-----------|
| Home | Dashboard overview |
| Confirm Queue | Pending data confirmations requiring your review |
| Sales | Lead pipeline and client relationships |
| Tendering | RFQ engine, quote tracker, subcontractors, tender board, cost intelligence |
| Operations | Active projects, schedule, site diary, WHS, procurement |
| Workforce | Timesheets and team directory |
| Financials | Invoice inbox, approvals, job financials |
| Marketing | Content studio, campaigns, media vault, intelligence |
| Clients | Client portal admin |
| Carpentry | Carpentry job management |
| Users | Manage user accounts (Admin only) |
| Templates | Document templates (Admin only) |
| Field app | Mobile field app access (Admin only) |
| Settings | Company settings and integrations |

The sidebar can be **collapsed** to icon-only view by clicking the chevron (‹) at the top. Click it again to expand.

[insert screenshot: Left sidebar expanded and collapsed states]

### On a phone or tablet

On mobile, there are two ways to navigate:

**1. Bottom tab bar** — tap any department icon at the bottom of the screen to switch between main sections. The tabs scroll horizontally if needed.

[insert screenshot: Mobile bottom tab bar with department icons]

**2. Hamburger menu (≡)** — tap the ≡ icon at the top-left to open the full sidebar as a slide-in overlay. This gives access to all sections including Users, Templates, Field app, and Settings. Tap the × to close it, or tap outside the sidebar.

[insert screenshot: Mobile hamburger menu and slide-in sidebar overlay]

### Project bar

Below the mobile header (and below the desktop sidebar header), a **project bar** appears when projects exist. This shows the currently selected project and lets you switch projects. See SOP 01-02 for full details.

### Getting back to a previous page

- Click the **← Back** link or arrow at the top of any detail page to go back one level
- Click the **Home** icon in the sidebar to return to the main dashboard at any time

[insert screenshot: Back arrow on a detail page]

### Finding your current location

The **page title** at the top of each page tells you where you are. Some pages also show a "breadcrumb trail" (e.g. Operations → 10 Smith Street → Schedule) so you know the path you took.

## 6. What happens next
Once you've navigated to the right section, follow the relevant SOP for the task you're completing.

## 7. Common mistakes
- Looking for a section that isn't in your sidebar — some sections (Users, Templates, Field app) are only visible to Admins. Contact your admin if you think you're missing access.
- Using the browser's back button instead of the app's back arrow — this sometimes works but can cause pages to reload unexpectedly.
- On mobile, looking for a section only in the bottom tab bar — some sections (Clients, Users, Templates, Settings) are only reachable via the hamburger (≡) menu overlay.

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| A sidebar section is missing | Your role may not have access. Contact your admin. |
| The page is showing an error | Refresh the browser page (press F5). Sign out and sign back in if the error persists. |
| The sidebar is not visible on desktop | Your browser window may be too narrow. Widen it, or check whether the sidebar is collapsed — look for the chevron (›) icon on the left edge to expand it. |
| Mobile bottom tab bar is missing a section | Some sections (Clients, Users, Templates, Settings) only appear in the hamburger (≡) menu overlay, not the bottom tab bar. |

## 9. Related modules
- [Sign in to Blue Leaf Hub](../00_getting_started/login_sign_in.md) — SOP 00-01
- [Use the Global Project Selector](project_selector.md) — SOP 01-02
- [Manage user roles and access](../12_admin_settings/settings_manage_users.md) — SOP 12-03

## 10. Screenshot placeholders
[insert screenshot: Full desktop app view with sidebar expanded]
[insert screenshot: Left sidebar collapsed to icon-only view]
[insert screenshot: Sidebar with all items labelled (desktop)]
[insert screenshot: Mobile bottom tab bar with department icons]
[insert screenshot: Mobile hamburger (≡) menu and slide-in sidebar overlay]
[insert screenshot: Back arrow / breadcrumb trail on a project detail page]

## 11. Automation notes
None — navigation is manual.

## 12. Edge cases and limits
- The sidebar collapses to icon-only on desktop; hover tooltips show the section label when minimised.
- The Carpentry section is only visible to users whose role includes carpentry access.
- The Finance section badge (unmatched document count) only appears for users with Finance Director access; the badge polls every 60 seconds.
- The Confirm Queue badge shows pending fact-confirmation count and also polls every 60 seconds.
- The bottom tab bar on mobile excludes the Clients section; access Clients via the hamburger menu instead.

## 13. Owner of the process
Admin

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin (to see all sections)
- [ ] At least 1 project exists

### Test cases

**TC-01 — All top-level sections are accessible (Admin)**
1. Sign in as Admin
2. Check the sidebar for: Home, Confirm Queue, Sales, Tendering, Operations, Workforce, Financials, Marketing, Clients, Carpentry, Users, Templates, Field app, Settings
3. Expected result: all major sections are clickable and load without error
- [ ] Pass  [ ] Fail

**TC-02 — Staff role has restricted access**
1. Sign in as a Staff (non-admin) account
2. Check which sections are visible in the sidebar
3. Expected result: Users, Templates, and Field app links are NOT visible (admin-only)
- [ ] Pass  [ ] Fail

**TC-03 — Back navigation works**
1. Navigate to a detail page (e.g. click a lead in Sales)
2. Click the Back arrow or link
3. Expected result: returned to the list page (not the browser's previous page)
- [ ] Pass  [ ] Fail

**TC-04 — Mobile layout**
1. Open the Hub in a mobile browser or narrow the desktop window to mobile width
2. Expected result: left sidebar is replaced by a top hamburger (≡) button and a bottom tab bar
3. Tap the hamburger (≡) button — the sidebar slides in as an overlay from the left
4. Expected: all sections are accessible via the overlay; tapping outside or pressing × closes it
5. Expected: bottom tab bar shows main departments and scrolls horizontally
- [ ] Pass  [ ] Fail  [ ] Skip (mobile testing not available)

**TC-05 — Page titles are correct**
1. Navigate to several different sections
2. For each page: check the browser tab title and/or the on-page heading
3. Expected result: titles match the section you're in (not blank or showing a previous page's title)
- [ ] Pass  [ ] Fail

**Feature case — Sidebar collapse/expand (desktop)**
1. On desktop, click the collapse chevron (‹) at the top of the sidebar
2. Expected result: sidebar collapses to icon-only (64 px wide); labels are hidden; hover shows tooltip
3. Click the expand chevron (›) to restore
4. Expected result: sidebar returns to full width (256 px) with all labels visible
5. Reload the page — expected: collapse state persists (stored in localStorage)
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All sections load without errors
- [ ] Role-based navigation works (admin sees more than staff)
- [ ] Mobile overlay and bottom tab bar both function correctly
- [ ] Sidebar collapse/expand persists on reload
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
