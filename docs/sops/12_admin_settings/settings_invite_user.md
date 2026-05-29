---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
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

1. Go to **Settings** → **Users**
2. Click **+ Invite User**
3. Enter the staff member's **email address**
4. Select their **role**: Admin or Staff
5. Click **Send Invitation**
6. The staff member receives an email with a magic link
7. They click the link, set a password, and can log in immediately

## 6. What happens after
- Supabase Auth sends the invitation email
- A user record is created in Supabase Auth (pending until they accept)
- Once they accept and set a password, they appear as active in the Users list
- Their role determines what they can see and do in the app

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Inviting with the wrong email | Typo | Double-check the email before sending — invitation emails cannot be recalled |
| Giving Admin role to all staff | Default assumption | Only give Admin role to people who need to change settings and invite users — most staff should be Staff role |
| Staff member not receiving the invitation | Email in spam | Ask them to check their spam/junk folder; resend if needed |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Invitation email not received | Check the email address is correct; ask staff to check spam; resend the invitation from the Users list |
| "User already exists" error | The email is already registered — check the Users list; if they need a password reset, use the Supabase Auth admin panel |
| Staff member's invitation link expired | Supabase invitation links expire after 24 hours — resend the invitation |
| Staff member cannot log in after accepting | Check their role is correctly set; contact Admin |

## 9. Related SOPs
- [Manage user roles and access](settings_manage_users.md) — SOP 12-03

## 10. Automation notes
- Supabase Auth: `sendInvite` to the user's email address — uses Supabase admin.createUser with invite flow
- The invitation email is sent by Supabase Auth (not the app's email server)
- Role is stored in Supabase Auth user metadata or a separate `user_roles` table
- DB effects: creates Supabase Auth user in pending state; user_roles row inserted with selected role

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] A test email address accessible for receiving the invitation (e.g. sam@blueleafbuilding.com.au)

### Test cases

**TC-01 — Invite a new Staff user (happy path)**
1. Settings -> Users -> + Invite User
2. Enter test email, select role "Staff", click Send Invitation
3. Expected: success message "Invitation sent"
4. Expected: invitation email arrives at the test address
- [ ] Pass  [ ] Fail

**TC-02 — Invitation link works**
1. Open the invitation email -> click the magic link
2. Expected: browser opens the app and prompts to set a password or auto-signs in
3. Expected: after accepting, the user appears as active in the Users list
- [ ] Pass  [ ] Fail

**TC-03 — Invite an Admin user**
1. Invite a second test user with role "Admin"
2. Expected: invitation sent
3. After acceptance: verify the user has Admin-level access (can see Settings)
- [ ] Pass  [ ] Fail

**TC-04 — Invalid email rejected**
1. Attempt to invite with email "not-an-email"
2. Expected: front-end validation error or HTTP 400 from Supabase
- [ ] Pass  [ ] Fail

**TC-05 — Duplicate email handled gracefully**
1. Attempt to invite an email that already exists in Supabase Auth
2. Expected: clear error message (not a raw Supabase error string)
- [ ] Pass  [ ] Fail

**TC-06 — Non-admin cannot access Invite User**
1. Log in as a Staff-role user
2. Navigate to Settings -> Users
3. Expected: Invite User button is hidden or disabled, OR the page is inaccessible
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Invitation email arrives at the correct address
- [ ] Magic link creates an active user account
- [ ] Role is correctly set on the new account
- [ ] Invalid email and duplicate email handled
- [ ] Non-admin cannot invite users
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
