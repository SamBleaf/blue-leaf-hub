---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Account Creation — Admin Bootstrap (First Account Only)

**Module:** Getting Started  
**SOP ID:** 00-02  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin only (Director or office manager performing the one-time Supabase bootstrap to create the very first admin account for a new Hub deployment). This SOP does NOT apply to adding regular staff — all staff after the first account must be added by invitation (see SOP 12-02).

## 2. When to use it
Only when deploying Blue Leaf Hub for the first time and a first admin account does not yet exist. The `/signup` route in the app shows "Invitation only" and does not provide a self-service sign-up form — the first account must be created directly via the Supabase dashboard or a bootstrap API call.

## 3. What this does
Creates the initial admin record in Supabase Auth and the `employees` table so the first admin can sign in and then invite all other staff via Settings → Users.

## 4. Before you start
- You need access to the Supabase project dashboard (project URL + service role key), or the bootstrap API secret
- You need the Hub web address (Vercel production URL or local dev URL)
- You need your work email address and a strong password (at least 8 characters)
- Have company details ready (name, ABN, address) — you will enter these in Settings immediately after

## 5. Step-by-step process

**Option A — Supabase Dashboard (recommended for production)**

1. Log in to [supabase.com](https://supabase.com) and open the Blue Leaf Hub project
2. Go to **Authentication → Users** and click **Invite user**
3. Enter your work email address and click **Invite**
4. Check your inbox for the Supabase invite email and follow the link to set your password
5. You can now sign in at the Hub URL with that email and password

[insert screenshot: Supabase Authentication → Users → Invite user dialog]

**Option B — Bootstrap API endpoint (dev / staging only)**

1. Open a terminal or REST client
2. Send a POST request to `/api/auth/bootstrap` with body: `{ "email": "...", "password": "...", "fullName": "...", "bootstrapSecret": "..." }`
3. The endpoint creates the Supabase Auth user and an `employees` row with Admin role
4. Sign in at the Hub URL with the email and password you supplied

[insert screenshot: Hub sign-in page after bootstrap — signed in as Admin]

**After creating your account:**

- Go to **Settings → Company details** and enter your business name, ABN, address, phone, and email
- Upload your company logo
- Then invite your staff using **Settings → Users** (see SOP 12-02)

## 6. What happens next
Your admin account is live. You can now set up the system and invite your team. All subsequent accounts are created via the invitation flow — never via direct sign-up.

## 7. Common mistakes
- Navigating to `/signup` expecting a sign-up form — the page shows "Invitation only" and has no form; use the Supabase dashboard instead
- Re-using this process for regular staff — always use Settings → Users → Invite for everyone after the first account
- Skipping company details setup — this affects how documents like RFQs and fee proposals look when sent to clients

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| `/signup` shows "Invitation only" | This is correct behaviour — the page is intentionally blocked. Use the Supabase dashboard instead. |
| Bootstrap endpoint returns 403 | The `bootstrapSecret` value is wrong or missing from server env vars. |
| "Email already in use" from Supabase | An account with that email already exists — try signing in instead. |
| Can't find the Admin role after first login | Check that the `employees` row was created with `role = 'admin'` in the Supabase `employees` table. |

## 9. Related modules
- [Sign in to Blue Leaf Hub](login_sign_in.md) — SOP 00-01
- [Accept a staff invitation](accept_invitation.md) — SOP 00-03
- [Invite a new staff member](../12_admin_settings/settings_invite_user.md) — SOP 12-02
- [Update company details and logo](../12_admin_settings/settings_company_details.md) — SOP 12-01

## 10. Screenshot placeholders
[insert screenshot: Supabase Authentication → Users panel showing Invite user button]
[insert screenshot: Hub sign-in page — first sign-in as Admin after bootstrap]
[insert screenshot: Settings → Company details page — fields to fill after first login]

## 11. Automation notes
- The `/signup` route is intentionally a dead-end "Invitation only" screen — it does not call any API
- The bootstrap endpoint (`POST /api/auth/bootstrap`) is guarded by `bootstrapSecret` and should only be accessible in dev/staging environments
- All other account creation goes through the invite endpoint (`POST /api/auth/invite`) which emails a one-time link

## 12. Edge cases and limits
- If the Hub URL is `/signup`, users will see an "Invitation only" message and a link to contact admin — no form is shown
- The bootstrap endpoint is intended for initial setup only; once a first admin exists, disable or restrict the secret
- There is no self-service password reset; admins manage access via Settings → Users

## 13. Owner of the process
Admin (Director)

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Hub is running (dev or staging)
- [ ] No existing admin account, or a clean test environment

### Test cases

**TC-01 — /signup route is blocked (happy path for invite-only enforcement)**
1. Navigate to `[hub-url]/signup`
2. Expected result: page shows "Invitation only" and "Blue Leaf Hub is a private workspace. Access is granted by invitation from an administrator."
3. Expected: no sign-up form is displayed
4. Expected: link to "Contact Sam to request access" and "Back to login" are present
- [ ] Pass  [ ] Fail

**TC-02 — Bootstrap endpoint creates first admin (dev only)**
1. Send POST to `/api/auth/bootstrap` with valid email, password (8+ chars), fullName, and correct bootstrapSecret
2. Expected result: `{ ok: true }` response
3. Sign in at `/login` with the supplied email and password
4. Expected: signed in and can see all sidebar sections (admin access)
- [ ] Pass  [ ] Fail  [ ] Skip (requires bootstrapSecret env var)

**TC-03 — Bootstrap endpoint rejects wrong secret**
1. Send POST to `/api/auth/bootstrap` with an incorrect `bootstrapSecret`
2. Expected result: 403 response with an error message
3. Expected: no account created
- [ ] Pass  [ ] Fail

**TC-04 — Company details accessible after first login**
1. After first admin login, click **Settings** in the sidebar
2. Expected result: Settings → Company section is accessible
3. Expected: company name, ABN, address fields are editable
- [ ] Pass  [ ] Fail

**TC-05 — Invite flow present for subsequent staff**
1. From Settings → Users, verify the **Invite user** button is present
2. Expected: clicking Invite opens the invite form (see SOP 12-02 for full test)
3. Expected: no "Create account" form exists in the app UI for regular staff
- [ ] Pass  [ ] Fail

**Feature case — /signup dead-end does not expose form or API call**
1. Open browser devtools (Network tab)
2. Navigate to `/signup`
3. Expected: no API calls are fired — the page is a static dead-end component
4. Expected: page title or heading includes "Invitation only"
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] `/signup` shows "Invitation only" with no form
- [ ] Bootstrap endpoint works with correct secret, rejects wrong secret
- [ ] Settings accessible after first login
- [ ] Invite flow is the only path for adding subsequent staff
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add entry to SOP_CHANGELOG.md
