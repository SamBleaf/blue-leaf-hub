---
sop_version: 1.1
last_reviewed: 2026-07-02
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
3. You will see the sign-in page with the heading **Sign in**
4. Type your **email address** in the email field
5. Type your **password** in the password field
6. (Optional) Toggle **Remember me** on if you want to stay signed in on this device — it is on by default
7. Click the **Sign in** button
8. You will be taken to the Blue Leaf Hub home page

[insert screenshot: Sign in page with email and password fields]

**Forgotten your password?**

Blue Leaf Hub does not have a self-service password reset link on the login page. If you cannot sign in, contact your admin — they can reset your access from the Users settings page.

[insert screenshot: Sign in page — "Access is by invitation only. Contact admin" note]

## 6. What happens next
After signing in, you will see the Blue Leaf Hub dashboard. From here you can go to any section of the app using the left-hand menu.

## 7. Common mistakes
- Using the wrong email address — use your work email, not a personal one
- Typing your password incorrectly — check Caps Lock is off
- Expecting a "Forgot password" link — there is none on the login page; contact your admin instead
- Trying to sign in before your invitation has been accepted — you must complete the accept-invite flow first (see SOP 00-03)

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Invalid email or password" message | Double-check your email and password. Contact your admin to reset access if needed. |
| Page won't load | Check your internet connection. Try a different browser. |
| Your account is locked or inactive | Contact your admin — they can re-activate your account from the Users settings page. |
| You see a blank page after signing in | Refresh the browser (press F5 or Ctrl+R). |
| You are signed out unexpectedly | If **Remember me** was off, the session ends when the browser closes. Sign in again and enable Remember me. |

## 9. Related modules
- [Accept a staff invitation](accept_invitation.md) — SOP 00-03
- [Navigate the app](../01_global_navigation/navigate_the_app.md) — SOP 01-01

## 10. Screenshot placeholders
[insert screenshot: Sign in page with email and password fields highlighted]
[insert screenshot: Forgot password form]
[insert screenshot: Home page after successful sign in]

## 11. Automation notes
- With **Remember me** on (the default), Supabase stores the session in `localStorage` — you remain signed in across browser restarts on the same device
- With **Remember me** off, the session lives only in `sessionStorage` — it ends when the browser tab or window closes
- If you are inactive for too long, Supabase will expire the token and redirect you to the login page

## 12. Edge cases and limits
- There is no self-service "Forgot password" link on the login page — password resets must be done by an admin
- Supabase auth tokens expire after a period of inactivity; the app redirects to `/login` automatically when this happens
- Direct navigation to a protected route (e.g. `/sales`) while signed out redirects to `/login` via `ProtectedRoute`
- The "Access is by invitation only" note on the login page is intentional — self-signup at `/signup` is blocked and shows an "Invitation only" screen

## 13. Owner of the process
Admin

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A valid staff account exists (email + password known)
- [ ] The Hub is running (dev or production)

### Test cases

**TC-01 — Sign in (happy path)**
1. Navigate to the Hub login URL
2. Enter a valid email and password
3. Click **Sign in**
4. Expected result: redirect to the home/dashboard page
5. Expected: left sidebar or navigation is visible
- [ ] Pass  [ ] Fail

**TC-02 — Wrong password rejected**
1. Enter a valid email with an incorrect password
2. Click **Sign in**
3. Expected result: error message "Invalid email or password" appears inline
4. Expected: user stays on the login page, not redirected
- [ ] Pass  [ ] Fail

**TC-03 — Empty fields rejected**
1. Leave email and/or password blank
2. Click **Sign in**
3. Expected result: browser native required-field validation fires (fields marked required)
4. Expected: no redirect, no network request
- [ ] Pass  [ ] Fail

**TC-04 — Remember me toggle — session storage behaviour**
1. Sign in with **Remember me** OFF (toggle to the left)
2. Note you are signed in on the home page
3. Close the browser tab and open a fresh tab to the Hub URL
4. Expected result: you are redirected to the login page (session not persisted)
5. Repeat with **Remember me** ON — expected: you are still signed in after closing and re-opening
- [ ] Pass  [ ] Fail

**TC-05 — Session persists on refresh (Remember me ON)**
1. Sign in successfully with Remember me enabled (default)
2. Refresh the browser tab (F5 or Ctrl+R)
3. Expected result: still signed in — not redirected back to login page
- [ ] Pass  [ ] Fail

**Feature case — No self-service password reset**
1. On the login page, look for a "Forgot password" link
2. Expected: no such link exists — the page shows "Access is by invitation only. Contact admin"
3. Navigate to `/signup`
4. Expected: "Invitation only" screen — no signup form
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Login works with valid credentials
- [ ] Invalid credentials show error (not blank page)
- [ ] Remember me toggles session vs local storage correctly
- [ ] Session persists across refresh when Remember me is on
- [ ] No self-service password reset or signup form is accessible
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add entry to SOP_CHANGELOG.md
