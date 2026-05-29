---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 11-02: View the Portal as the Client (Admin Preview)

**Module:** Client Portal — Admin  
**SOP ID:** 11-02  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Admin staff who want to check what the client sees before sharing the portal link, or to verify that content looks correct after making updates.

## 2. When to use it
- Before sending the portal link to a client for the first time
- After adding a weekly update, photos, or decisions — to confirm they display correctly
- When a client reports something looks wrong — to reproduce the issue from their perspective

## 3. What this does
Opens the client-facing portal using the project's token, exactly as the client would see it. You see the same pages, layout, and data as the client — no admin controls are shown. This is the same URL as the client link; there is no separate "admin preview mode."

## 4. Before you start
- The portal has been enabled for the project (SOP 11-01 — a token exists)
- You are logged in as Admin

## 5. Step-by-step process

1. Go to **Portal Admin** and open the project
2. Click **Preview as Client** (or copy the portal URL from the project settings)
3. The client portal opens — you will see the client's home page
4. Use the tab navigation to browse: Home, Timeline, Decisions, Budget, Messages
5. Verify that all content — updates, photos, milestones, decisions — appears as intended
6. Close the preview tab when done

## 6. What happens after
No data is changed by viewing the portal. Previewing is read-only.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Thinking the preview is different from what the client sees | Expecting a special admin overlay | There is no difference — what you see in preview is exactly what the client sees |
| Sending the portal link before previewing | Skipping the check | Always preview before sending to make sure the content is complete and correct |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Preview link returns 404 | The portal may not be enabled yet — complete SOP 11-01 first |
| Content added by admin is not showing in preview | Refresh the preview tab; if still missing check that the content was saved successfully |
| Preview shows a different project's data | Check that the token in the URL matches the correct project |

## 9. Related SOPs
- [Enable the client portal for a project](portal_enable_for_client.md) — SOP 11-01
- [Add a weekly update](portal_add_weekly_update.md) — SOP 11-03
- [Client guide — using your portal](portal_client_guide.md) — SOP 11-09

## 10. Automation notes
- Token-based access: `GET /api/portal/:token/home` — returns client home data
- `GET /api/portal/:token/timeline` — build timeline and milestones
- `GET /api/portal/:token/decisions` — client decisions/selections
- `GET /api/portal/:token/budget` — budget overview
- `GET /api/portal/:token/conversations` — message history
- The preview URL is the client portal URL: `https://[domain]/portal/[token]`
- No separate admin preview endpoint — the token is the access mechanism

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A project with a portal token exists
- [ ] At least one update and one milestone have been added to the portal

### Test cases

**TC-01 — Portal home loads via token (no auth)**
1. Open `GET /api/portal/:token/home` in browser or Postman with no auth header
2. Expected: HTTP 200 with project summary, recent update, milestone progress
- [ ] Pass  [ ] Fail

**TC-02 — Timeline loads correctly**
1. Open `GET /api/portal/:token/timeline`
2. Expected: returns milestones array with name, target date, and completed status
- [ ] Pass  [ ] Fail

**TC-03 — Decisions endpoint loads**
1. Open `GET /api/portal/:token/decisions`
2. Expected: returns decisions array (may be empty if none added yet)
- [ ] Pass  [ ] Fail

**TC-04 — Budget endpoint loads**
1. Open `GET /api/portal/:token/budget`
2. Expected: returns budget summary object with contract value and claim totals
- [ ] Pass  [ ] Fail

**TC-05 — Invalid token returns 404**
1. Call `GET /api/portal/invalid-token-xyz/home`
2. Expected: HTTP 404 with plain English error
- [ ] Pass  [ ] Fail

**TC-06 — Client portal UI renders all tabs**
1. Open the portal URL in a browser
2. Navigate through Home, Timeline, Decisions, Budget, Messages tabs
3. Expected: each tab loads without errors
4. Expected: no admin controls visible (no edit/delete/upload buttons)
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All token-based API endpoints return correct data without auth
- [ ] Invalid token handled gracefully with 404
- [ ] Client UI renders all tabs correctly with no admin controls showing
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
