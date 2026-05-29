---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Sign in to Blue Leaf Hub

**Module:** Getting Started  
**SOP ID:** 00-01  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
All staff — Directors, Project Managers, Supervisors, Admin/Accounts, Estimators, Employees.

## 2. When to use it
Every time you need to access Blue Leaf Hub to do your work.

## 3. What this does
Lets you log in to your Blue Leaf Hub account so you can see your projects, tasks, and information.

## 4. Before you start
- You need to have been invited by your admin (see SOP 00-03: Accept a staff invitation)
- You need your work email address and password
- You need an internet connection

## 5. Step-by-step process

1. Open your web browser (Chrome, Safari, or Edge work best)
2. Go to the Blue Leaf Hub web address provided by your admin
3. You will see the sign-in page
4. Type your **email address** in the email field
5. Type your **password** in the password field
6. Click the **Sign in** button
7. You will be taken to the Blue Leaf Hub home page

[insert screenshot: Sign in page with email and password fields]

**Forgot your password?**

1. On the sign-in page, click **Forgot password**
2. Type your email address
3. Click **Send reset email**
4. Check your email inbox for a reset link
5. Click the link in the email
6. Type a new password and confirm it
7. Click **Save** — you can now sign in with your new password

[insert screenshot: Forgot password link on sign-in page]

## 6. What happens next
After signing in, you will see the Blue Leaf Hub dashboard. From here you can go to any section of the app using the left-hand menu.

## 7. Common mistakes
- Using the wrong email address — use your work email, not a personal one
- Typing your password incorrectly — check Caps Lock is off
- Trying to sign in from a link that has expired — go directly to the web address instead

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Invalid email or password" message | Double-check your email and password. Use Forgot password if needed. |
| Forgot password email not arriving | Check your spam/junk folder. Wait 5 minutes and try again. |
| Page won't load | Check your internet connection. Try a different browser. |
| Your account is locked | Contact your admin — they can reset your access. |
| You see a blank page after signing in | Refresh the browser (press F5 or Ctrl+R). |

## 9. Related modules
- [Accept a staff invitation](accept_invitation.md) — SOP 00-03
- [Navigate the app](../01_global_navigation/navigate_the_app.md) — SOP 01-01

## 10. Screenshot placeholders
[insert screenshot: Sign in page with email and password fields highlighted]
[insert screenshot: Forgot password form]
[insert screenshot: Home page after successful sign in]

## 11. Automation notes
- The system keeps you logged in for a period of time — you won't need to sign in again if you're on the same device
- If you're inactive for too long, the system will ask you to sign in again for security

## 12. Owner of the process
Admin

## 13. Review date
2026-11-20

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A valid staff account exists (email + password known)
- [ ] The Hub is running (dev or production)

### Test cases

**TC-01 — Sign in (happy path)**
1. Navigate to the Hub login URL
2. Enter a valid email and password
3. Click Sign in
4. Expected result: redirect to the home/dashboard page
5. Expected: left sidebar or navigation is visible
- [ ] Pass  [ ] Fail

**TC-02 — Wrong password rejected**
1. Enter a valid email with an incorrect password
2. Click Sign in
3. Expected result: error message appears (e.g. "Invalid email or password")
4. Expected: user stays on the login page, not redirected
- [ ] Pass  [ ] Fail

**TC-03 — Empty fields rejected**
1. Leave email and password blank
2. Click Sign in
3. Expected result: validation prevents submission or shows error
4. Expected: no redirect
- [ ] Pass  [ ] Fail

**TC-04 — Forgot password flow**
1. Click "Forgot password" on the login page
2. Enter a valid email address
3. Submit the reset request
4. Expected result: confirmation message that reset email was sent
5. Expected: reset email arrives in inbox (check spam if not immediate)
- [ ] Pass  [ ] Fail  [ ] Skip (email delivery may be slow)

**TC-05 — Session persists on refresh**
1. Sign in successfully
2. Refresh the browser tab (F5)
3. Expected result: still signed in — not redirected back to login page
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Login works with valid credentials
- [ ] Invalid credentials show error (not blank page)
- [ ] Forgot password flow initiates
- [ ] Session persists across refresh
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add entry to SOP_CHANGELOG.md
