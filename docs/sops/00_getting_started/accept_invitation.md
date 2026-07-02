---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Accept a Staff Invitation

**Module:** Getting Started  
**SOP ID:** 00-03  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
All new staff members who have been invited to join Blue Leaf Hub by their admin.

## 2. When to use it
When you receive an invitation email from Blue Leaf Hub asking you to set up your account.

## 3. What this does
Creates your personal Blue Leaf Hub account using the invitation sent by your admin. Your role and access level are set by your admin before you accept.

## 4. Before you start
- You must have received an invitation email from Blue Leaf Hub (check your inbox and spam folder)
- The invitation link expires — use it within 48 hours of receiving it
- You will need to choose a password for your account

## 5. Step-by-step process

1. Open your email inbox
2. Find the email from Blue Leaf Hub with the subject **"You've been invited to Blue Leaf Hub"**
3. Click the invitation link in the email (it looks like a button labelled **Accept invitation** or similar)

[insert screenshot: Invitation email with invitation link highlighted]

4. A web page will open in your browser showing "Set up your account"
5. Your email address is shown at the top of the form — it is pre-filled and cannot be changed
6. Your assigned role (e.g. Admin, Staff) is shown as a badge next to your email
7. Check or edit the **Full name** field — it may be pre-filled with what your admin entered
8. Type a **password** of your choice — it must be at least 8 characters
9. Type the same password again in the **Confirm password** field
10. Click **Create account**

[insert screenshot: Account setup page showing email (read-only), role badge, full name field, and password fields]

11. You will see a confirmation screen saying "Account created — Welcome to Blue Leaf Hub"
12. Click **Sign in** to go to the login page and sign in with your email and password
13. Your role (e.g. Supervisor, Admin, Staff) will already be set — you will only see the sections relevant to your role

## 6. What happens next
You are now in the system. Your admin will have already set your role and access level. After clicking **Sign in** on the confirmation screen, you will land on the Hub home page and see only the sections your role allows. Contact your admin if you cannot see sections you expect to have access to.

## 7. Common mistakes
- Letting the invitation link expire — if this happens, ask your admin to resend the invitation (links are one-time use and expire after 48 hours)
- Leaving the **Full name** field blank or too short — the form requires at least 2 characters
- Using a weak password — the system requires at least 8 characters
- Closing the browser before clicking "Create account" — you will need to use the email link again (the link can only be used once)
- Trying to sign in immediately after clicking the email link before completing the form

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Invitation not valid" on the setup page | The link has expired or has already been used. Contact your admin and ask them to resend. |
| "Please enter your full name" error | The Full name field must have at least 2 characters. |
| "Password must be at least 8 characters" | Choose a longer password. |
| "Passwords do not match" | Re-type both password fields carefully. |
| Invitation email not received | Check your spam/junk folder. Ask your admin to resend. |
| Account created but can't see any projects | Your role may need adjustment — contact your admin. |

## 9. Related modules
- [Sign in to Blue Leaf Hub](login_sign_in.md) — SOP 00-01
- [Invite a new staff member](../12_admin_settings/settings_invite_user.md) — SOP 12-02 (admin only)

## 10. Screenshot placeholders
[insert screenshot: Invitation email from Blue Leaf Hub]
[insert screenshot: Accept invitation button in email]
[insert screenshot: Account setup page with password and confirm password fields]
[insert screenshot: Home page after account created]

## 11. Automation notes
- When your admin sends an invitation, the system automatically emails you a secure one-time link via the Hub mail transport (Resend)
- The link URL format is `[hub-url]/accept-invite/[token]` — the token is a UUID stored in the `staff_invites` table
- The link can only be used once and expires after 48 hours
- Your role is assigned by your admin before you accept — you do not choose it yourself
- After you click **Create account**, the system creates your Supabase Auth user, updates the `employees` table, and marks the invite as accepted

## 12. Edge cases and limits
- The invitation link is one-time use — once accepted (or expired), clicking it again shows "Invitation not valid"
- If your admin sent a new invitation after an earlier one, only the latest token is valid; previous tokens for the same employee are superseded
- If you already have a login (e.g. you were previously an admin in another role), the system will link your existing login to the new staff record rather than creating a duplicate — you keep your current password
- Portal client invites follow a different flow and land on the Client Portal, not the staff Hub

## 13. Owner of the process
Admin

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Admin has sent an invitation to a test email address (see SOP 12-02)
- [ ] The invitation email has been received and the link has not been used or expired

### Test cases

**TC-01 — Accept invitation (happy path)**
1. Open the invitation email
2. Click the invitation link
3. Expected result: browser opens to the "Set up your account" page at `/accept-invite/[token]`
4. Expected: email is shown read-only, role badge is visible, Full name field is present
5. Enter full name (if not pre-filled), enter password (8+ characters), confirm password
6. Click **Create account**
7. Expected result: confirmation screen "Account created — Welcome to Blue Leaf Hub"
8. Click **Sign in**, sign in with the invited email and new password
9. Expected: signed in and on the Hub home page
- [ ] Pass  [ ] Fail

**TC-02 — Cannot sign in before accepting invitation**
1. Before clicking the invitation link, attempt to sign in at `/login` with the invited email and any password
2. Expected result: "Invalid email or password" — account does not yet exist
- [ ] Pass  [ ] Fail

**TC-03 — Correct role assigned after accepting**
1. Accept an invitation sent with "Staff" role
2. After signing in, check which sidebar sections are visible
3. Expected result: limited access — no Settings gear, no Finance Director views
4. Compare with Admin account to confirm difference in visible modules
- [ ] Pass  [ ] Fail

**TC-04 — Expired or used invitation handled gracefully**
1. Use a previously-accepted invitation link (or wait for one to expire)
2. Navigate to the link URL
3. Expected result: page shows "Invitation not valid" with the error message
4. Expected: a "Back to login" link is shown — no form is displayed
- [ ] Pass  [ ] Fail  [ ] Skip (requires a spent/expired token)

**TC-05 — Full name field is required**
1. On the accept-invite setup page, clear the Full name field
2. Click **Create account**
3. Expected result: inline error "Please enter your full name." — form does not submit
- [ ] Pass  [ ] Fail

**Feature case — Password show/hide toggle works**
1. On the accept-invite page, type a password in the Password field
2. Click the **Show** button beside the password field
3. Expected result: password characters are now visible (input type switches to text)
4. Click **Hide** — expected: password is masked again
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Invitation link opens the correct setup page with email pre-filled and role badge visible
- [ ] Full name field is required and validated
- [ ] Account is created and user can sign in after accepting
- [ ] Correct role is applied and limits access appropriately
- [ ] Expired/used links show "Invitation not valid" gracefully
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add entry to SOP_CHANGELOG.md
