---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Create a New Account (Admin Setup)

**Module:** Getting Started  
**SOP ID:** 00-02  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin (Director or office manager setting up Blue Leaf Hub for the first time, or creating the first admin account).

## 2. When to use it
Only when setting up Blue Leaf Hub for the first time. After the first account is created, all other staff should be added by invitation (see SOP 12-02: Invite a new staff member). Do not use this for day-to-day account creation.

## 3. What this does
Creates the first Blue Leaf Hub account for your company. This account will have full Admin access.

## 4. Before you start
- You need the Blue Leaf Hub web address
- You need your work email address
- You need company details handy (name, ABN) for the settings step that follows

## 5. Step-by-step process

1. Open your web browser and go to the Blue Leaf Hub web address
2. Click **Sign up** or **Create account** on the sign-in page
3. Fill in your **full name**
4. Fill in your **work email address**
5. Choose a **password** — at least 8 characters, mix of letters and numbers
6. Re-enter the password in the **Confirm password** field
7. Click **Create account**

[insert screenshot: Sign up page with name, email, and password fields]

8. You will be signed in and taken to the home page
9. After signing up, go to **Settings** (bottom of left-hand menu) and fill in your company details

[insert screenshot: Home page after account created, with Settings link visible]

**After creating your account:**

- Go to Settings → Company details and enter your business name, ABN, address, phone, and email
- Upload your company logo
- Then invite your staff using Settings → Users (see SOP 12-02)

## 6. What happens next
Your account is live. You can now set up the system and invite your team.

## 7. Common mistakes
- Creating multiple "first accounts" — only the very first account needs to be created this way. All other staff must be invited.
- Skipping company details setup — this affects how documents like RFQs and fee proposals look when sent to clients.

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Email already in use" | Someone already has an account with that email. Try signing in instead. |
| "Password too weak" | Use at least 8 characters with numbers and letters. |
| Can't see the sign up option | Contact your Blue Leaf Hub administrator — self-signup may be disabled. |

## 9. Related modules
- [Sign in to Blue Leaf Hub](login_sign_in.md) — SOP 00-01
- [Invite a new staff member](../12_admin_settings/settings_invite_user.md) — SOP 12-02
- [Update company details and logo](../12_admin_settings/settings_company_details.md) — SOP 12-01

## 10. Screenshot placeholders
[insert screenshot: Sign up page with all fields visible]
[insert screenshot: Home page shown after account creation]

## 11. Automation notes
None — this is a manual one-time process.

## 12. Owner of the process
Admin (Director)

## 13. Review date
2026-11-20

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] No existing account with the test email (or use a unique test email each run)
- [ ] Self-signup is enabled on the Supabase project
- [ ] Hub is running

### Test cases

**TC-01 — Create first account (happy path)**
1. Navigate to the Hub login URL
2. Click Sign up / Create account
3. Fill in: full name, work email (unique test address), password (8+ chars)
4. Click Create account
5. Expected result: redirected to home page, signed in
6. Expected: admin access granted (can see all sidebar sections)
- [ ] Pass  [ ] Fail

**TC-02 — Duplicate email rejected**
1. Attempt to sign up with an email address that already has an account
2. Expected result: error message "Email already in use" or equivalent
3. Expected: not redirected, stays on sign-up page
- [ ] Pass  [ ] Fail

**TC-03 — Weak password rejected**
1. Attempt to sign up with a password shorter than 8 characters (e.g. "abc")
2. Expected result: validation error shown — password requirements displayed
3. Expected: form does not submit
- [ ] Pass  [ ] Fail

**TC-04 — Company details accessible after signup**
1. After creating account, click Settings in the sidebar
2. Expected result: Settings → Company section is accessible
3. Expected: company name, ABN, address fields are editable
- [ ] Pass  [ ] Fail

**TC-05 — Invite flow is different from signup**
1. Confirm that only the first account uses self-signup
2. From Settings → Users, verify the Invite user button is present
3. Expected: Invite user sends email (not creates account directly) — see SOP 12-02
- [ ] Pass  [ ] Fail  [ ] Skip (tested in SOP 12-02)

### Post-test checklist
- [ ] Self-signup creates account and lands on home page
- [ ] Duplicate email shows error
- [ ] Weak password shows error
- [ ] Settings accessible after signup
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
