---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
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
1. Go to **Settings** -> **Users**
2. The list shows all active staff members, their email, role, and status

### Change a user's role
1. Find the user in the list
2. Click **Edit** next to their name
3. Change the role from Admin to Staff or vice versa
4. Click **Save**
5. The change takes effect immediately — the user will see different menu items on their next page load

### Deactivate a user
1. Find the user in the list
2. Click **Deactivate** (or similar)
3. Confirm the deactivation
4. The user's account is suspended — they cannot log in and will see an error if they try
5. Their historical records (timesheets, diary entries, notes) remain in the system

## 6. What happens after
- Role changes take effect immediately
- Deactivated users are removed from active user lists across the app
- Deactivated accounts can be reactivated if needed (via Supabase Auth admin panel or app interface)

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Deactivating your own account | Accidentally selecting the wrong user | There should be a guard preventing you from deactivating yourself — but double-check the name before confirming |
| Not deactivating a departed employee promptly | Forgetting in the handover rush | Add account deactivation to your staff offboarding checklist |
| Downgrading the only Admin to Staff | Oversight | Ensure at least one other Admin exists before changing the last Admin's role |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Role change not reflected in the user's session | The user needs to log out and log back in for the new role to apply |
| Cannot deactivate a user — button greyed out | You may be trying to deactivate yourself, or the user is already deactivated |
| Need to reactivate a deactivated user | Use the Supabase Auth admin panel at supabase.com -> project -> Authentication -> Users -> re-enable the account |

## 9. Related SOPs
- [Invite a new staff member](settings_invite_user.md) — SOP 12-02

## 10. Automation notes
- User management is handled via Supabase Auth admin panel (supabase.com dashboard) or via the app UI if a user management UI is built
- Role stored in Supabase Auth user metadata (`user_metadata.role`) or a separate `user_roles` table
- Deactivation: Supabase Auth `admin.updateUserById` with `{ ban_duration: 'none' }` to disable, or delete the user
- DB effects: user_roles row updated with new role; deactivated user flagged in Auth

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] At least 2 active users exist (Admin + test Staff user)
- [ ] Test Staff user email noted

### Test cases

**TC-01 — Users list loads**
1. Settings -> Users
2. Expected: list of all active users with email, role, and status columns
3. Expected: your own account is visible
- [ ] Pass  [ ] Fail

**TC-02 — Change role from Staff to Admin**
1. Find the test Staff user -> Edit -> change role to Admin -> Save
2. Expected: success message
3. Expected: user's role shows as "Admin" in the list
4. Expected: when test user logs in, they see Settings menu items
- [ ] Pass  [ ] Fail

**TC-03 — Change role back to Staff**
1. Edit the same user -> change role back to Staff -> Save
2. Expected: role shows as "Staff"
3. Expected: Settings menus no longer accessible to that user
- [ ] Pass  [ ] Fail

**TC-04 — Deactivate a user**
1. Find the test Staff user -> Deactivate -> confirm
2. Expected: user no longer appears in active users list (or shows "Deactivated" status)
3. Expected: if test user attempts to log in, they receive an error
- [ ] Pass  [ ] Fail

**TC-05 — Historical records remain after deactivation**
1. After TC-04, check if any timesheets or diary entries created by the deactivated user still exist
2. Expected: historical records are intact — deactivation does not delete data
- [ ] Pass  [ ] Fail

**TC-06 — Cannot deactivate own account**
1. Attempt to deactivate your own logged-in account
2. Expected: error message or button disabled — system prevents self-deactivation
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Users list loads correctly
- [ ] Role changes take effect
- [ ] Deactivation prevents login
- [ ] Historical data preserved after deactivation
- [ ] Self-deactivation blocked
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
