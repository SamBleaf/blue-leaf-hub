---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP 12-02: Invite a New Staff Member

**Module:** Admin Settings — Users  
**SOP ID:** 12-02  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin only. Only Admins can invite new staff members to the system.

## 2. When to use it
When a new employee starts and needs access to Blue Leaf Hub — or when an existing staff member's email changes and they need a new account.

## 3. What this does
Sends an email invitation to the new staff member. They click the link in the email, set a password, and are signed into the app. You choose their role (Admin or Staff) before sending the invitation.

## 4. Before you start
- You are logged in as Admin
- You have the new staff member's work email address
- You know what role they need (Admin has full access; Staff has access to their modules but cannot change settings or invite other users)

## 5. Step-by-step process

1. Go to **Settings** in the sidebar
2. Navigate to **Settings → Users**
3. Click **+ Invite User**
4. Enter the staff member's **email address**
5. Select their **role**: Admin or Staff
6. Click **Send Invitation**
7. The staff member receives an email with a magic link
8. They click the link, set a password, and can log in immediately

> **Note:** Invitation links expire after 24 hours. If the staff member does not accept in time, resend the invitation from the Users list.

## 6. What happens next
- Supabase Auth sends the invitation email to the staff member
- A user record is created in Supabase Auth in pending state (until they accept)
- The invite endpoint also self-heals any orphaned login by linking the new auth user to an existing employee record if one exists with that email
- Once they accept and set a password, they appear as active in the Users list
- Their role determines what they can see and do in the app

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Inviting with the wrong email | Typo | Double-check the email before sending — invitation emails cannot be recalled |
| Giving Admin role to all staff | Default assumption | Only give Admin role to people who need to change settings and invite users — most staff should be Staff role |
| Staff member not receiving the invitation | Email in spam | Ask them to check their spam/junk folder; resend if needed |
| Using the Users page invite path | Two invite UIs exist | Always use Settings → Users → + Invite User (not the Users page path), which self-heals the employee link |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| Invitation email not received | Email address incorrect or in spam | Check the email address is correct; ask staff to check spam; resend the invitation from the Users list |
| "User already exists" error | The email is already registered in Supabase Auth | Check the Users list; if they need a password reset, use the Supabase Auth admin panel |
| Staff member's invitation link expired | Supabase invitation links expire after 24 hours | Resend the invitation from the Users list |
| Staff member cannot log in after accepting | Role not set correctly | Check their role is correctly set; contact Admin |
| Staff member's profile not linked to their employee record | Orphaned invite (via wrong invite path) | The invite endpoint self-heals this — if still broken, check the `employees` table for a row with matching email and ensure the Supabase auth user ID is linked |

## 9. Related modules
- [Manage user roles and access](settings_manage_users.md) — SOP 12-03

## 10. Screenshot placeholders
[insert screenshot: Settings → Users page showing the user list and the + Invite User button]
[insert screenshot: Invite User form with email and role fields filled in]
[insert screenshot: Success message "Invitation sent" after submitting the form]

## 11. Automation notes
- Invite endpoint: calls Supabase Auth `admin.createUser` with the invite flow — sends an invitation email via Supabase Auth (not the app's mail server)
- Self-heal behaviour: the invite endpoint checks for an existing `employees` row with the same email; if found, it links the new Supabase auth user ID to that employee record (fixing orphan)
- Role is stored in Supabase Auth user metadata (`user_metadata.role`) or a `user_roles` table
- DB effects: creates Supabase Auth user in pending state; `user_roles` row inserted with the selected role
- No Railway env var changes required — invite flow uses Supabase Auth's built-in email service

## 12. Edge cases and limits
- If the invited email already exists in Supabase Auth, the endpoint returns a clear "User already exists" error — it does not send a duplicate invitation
- Invitation links expire after 24 hours — resend if the staff member does not accept in time
- If the Supabase Auth email service is not configured for the project, the invitation email will not arrive — check Supabase project Email settings
- An Admin can invite another Admin — there is no cap on the number of Admin users
- Revoking an invitation (before acceptance) must be done via the Supabase Auth admin panel

## 13. Owner of the process
Admin  
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Log in as Admin
- [ ] Have a test email address accessible for receiving the invitation (e.g. a +alias of sam@blueleafbuilding.com.au)
- [ ] Confirm the test email does not already exist in Supabase Auth

### Test cases

**TC-01 — Invite a new Staff user (happy path)**
1. Settings → Users → + Invite User
2. Enter test email, select role "Staff", click Send Invitation
3. Expected result: success message "Invitation sent" appears
4. Expected: invitation email arrives at the test address within a few minutes
- [ ] Pass  [ ] Fail

**TC-02 — Invitation link activates the account**
1. Open the invitation email → click the magic link
2. Expected result: browser opens the Blue Leaf Hub app and prompts to set a password or auto-signs in
3. After accepting: the user appears as active in the Users list
4. Expected: the new user can navigate to a Staff-accessible module (e.g. Workforce)
- [ ] Pass  [ ] Fail

**TC-03 — Invite an Admin user**
1. Invite a second test user with role "Admin"
2. Expected: invitation sent
3. After acceptance: verify the user has Admin-level access (can see Settings menu)
- [ ] Pass  [ ] Fail

**TC-04 — Invalid email rejected**
1. Attempt to invite with email "not-an-email"
2. Expected result: front-end validation error or HTTP 400 — invitation is not sent
- [ ] Pass  [ ] Fail

**TC-05 — Duplicate email handled gracefully**
1. Attempt to invite an email that already exists in Supabase Auth
2. Expected result: clear error message "User already exists" (not a raw Supabase error string)
- [ ] Pass  [ ] Fail

**TC-06 — Non-admin cannot access Invite User**
1. Log out and log in as a Staff-role user
2. Navigate to Settings → Users
3. Expected result: Invite User button is hidden or disabled, OR the page is inaccessible to Staff role
- [ ] Pass  [ ] Fail

**TC-07 — Self-heal links new user to existing employee record**
1. Ensure an `employees` row exists with the test email address (but no linked Supabase auth user ID)
2. Send an invitation to that email address
3. After the user accepts, check the `employees` table row
4. Expected: the `auth_user_id` (or equivalent foreign key) on the employee row is now populated with the new Supabase user ID
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] Invitation email arrived at the correct address
- [ ] Magic link created an active user account with correct role
- [ ] Invalid email and duplicate email handled with plain English errors
- [ ] Non-admin cannot invite users
- [ ] No console errors observed during testing
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
