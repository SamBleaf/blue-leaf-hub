---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP 12-03: Manage User Roles and Access

**Module:** Admin Settings — Users  
**SOP ID:** 12-03  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Admin only. Only Admins can change user roles or deactivate accounts.

## 2. When to use it
- When a staff member's role changes (e.g. promoted from Staff to Admin)
- When a staff member leaves and their account needs to be deactivated
- To audit who currently has access to the system

## 3. What this does
Shows all staff accounts, their current roles, and their account status. You can change a user's role or deactivate them so they can no longer log in.

## 4. Before you start
- You are logged in as Admin
- You know which user needs to be changed and what the change is

## 5. Step-by-step process

### View all users
1. Go to **Settings** in the sidebar
2. Navigate to **Settings → Users**
3. The list shows all active staff members with their email, role, and status

### Change a user's role
1. Find the user in the list
2. Click **Edit** next to their name
3. Change the role from Admin to Staff or vice versa
4. Click **Save**
5. The change takes effect immediately — the user will see different menu items on their next page load

### Deactivate a user
1. Find the user in the list
2. Click **Deactivate** next to their name
3. Confirm the deactivation in the dialog
4. The user's account is suspended — they cannot log in and will see an error if they try
5. Their historical records (timesheets, diary entries, notes) remain in the system

## 6. What happens next
- Role changes take effect immediately for new sessions; the existing session updates on the user's next page load
- Deactivated users are removed from active user lists across the app
- Deactivated accounts can be reactivated via the Supabase Auth admin panel (supabase.com → project → Authentication → Users → re-enable)
- All historical data created by a deactivated user is preserved

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Deactivating your own account | Accidentally selecting the wrong user | There is a guard preventing self-deactivation — but always double-check the name before confirming |
| Not deactivating a departed employee promptly | Forgetting in the handover rush | Add account deactivation to your staff offboarding checklist |
| Downgrading the only Admin to Staff | Oversight | Ensure at least one other Admin exists before changing the last Admin's role |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| Role change not reflected in the user's session | Change is server-side; old role cached in browser | The user needs to log out and log back in for the new role to apply |
| Cannot deactivate a user — button greyed out | You may be trying to deactivate yourself, or the user is already deactivated | Check if this is your own account; check if the user status already shows "Deactivated" |
| Need to reactivate a deactivated user | No in-app reactivation UI | Use the Supabase Auth admin panel at supabase.com → project → Authentication → Users → re-enable the account |

## 9. Related modules
- [Invite a new staff member](settings_invite_user.md) — SOP 12-02

## 10. Screenshot placeholders
[insert screenshot: Settings → Users page showing the list of users with email, role, and status columns]
[insert screenshot: Edit user role dialog with the role dropdown open]
[insert screenshot: Deactivate user confirmation dialog]

## 11. Automation notes
- User management via Supabase Auth admin API: `admin.updateUserById` to change role metadata or ban/unban
- Role stored in Supabase Auth user metadata (`user_metadata.role`) or a separate `user_roles` table
- Deactivation: Supabase Auth `admin.updateUserById` with `{ ban_duration: 'none' }` to disable the account, or the equivalent ban flag
- DB effects: `user_roles` row updated with new role; deactivated user flagged in Supabase Auth
- No email notification is sent to the user when their role is changed or account is deactivated

## 12. Edge cases and limits
- You cannot deactivate your own account — a guard prevents self-deactivation
- There is no automatic check to prevent the last Admin being downgraded — this must be done manually with care
- Deactivated users still appear in historical data references (timesheets, diary entries, notes) — data is not deleted
- Role changes are not retroactive — they do not alter existing records created under the old role
- Reactivation must be done via the Supabase Auth admin panel (no in-app UI for reactivation)

## 13. Owner of the process
Admin  
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Log in as Admin
- [ ] At least 2 active users exist: the current Admin and a test Staff user
- [ ] Note the test Staff user's email address

### Test cases

**TC-01 — Users list loads**
1. Go to Settings → Users
2. Expected result: list of all active users with email, role, and status columns visible
3. Expected: your own account appears in the list
- [ ] Pass  [ ] Fail

**TC-02 — Change role from Staff to Admin**
1. Find the test Staff user → click Edit → change role to "Admin" → click Save
2. Expected result: success message appears
3. Expected: user's role shows as "Admin" in the list
4. Verification: when the test user logs in, they can access the Settings menu
- [ ] Pass  [ ] Fail

**TC-03 — Change role back to Staff**
1. Edit the same user → change role back to "Staff" → click Save
2. Expected result: role shows as "Staff" in the list
3. Verification: Settings menu is no longer accessible to that user after they log out and back in
- [ ] Pass  [ ] Fail

**TC-04 — Deactivate a user**
1. Find the test Staff user → click Deactivate → confirm in the dialog
2. Expected result: user no longer appears in the active users list (or shows "Deactivated" status)
3. Verification: attempt to log in as the deactivated user — expected: login fails with an error
- [ ] Pass  [ ] Fail

**TC-05 — Historical records remain after deactivation**
1. After TC-04, check whether any timesheets or diary entries created by the deactivated user still exist
2. Expected result: historical records are intact — deactivation does not delete data
- [ ] Pass  [ ] Fail

**TC-06 — Cannot deactivate own account**
1. As the logged-in Admin, attempt to click Deactivate on your own account row
2. Expected result: button is disabled or an error message appears — system prevents self-deactivation
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] Users list loads correctly with all columns
- [ ] Role changes take effect and are visible in the list
- [ ] Deactivated user cannot log in
- [ ] Historical data preserved after deactivation
- [ ] Self-deactivation blocked by the UI
- [ ] No console errors observed during testing
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
