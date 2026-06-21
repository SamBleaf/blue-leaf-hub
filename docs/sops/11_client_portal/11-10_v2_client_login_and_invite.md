---
sop_version: 1.0
last_reviewed: 2026-06-21
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP 11-10: Client Login & Invite (Portal v2.0)

**Module:** Client Portal v2.0  
**SOP ID:** 11-10  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin (sends the invite). The client (sets a password and logs in). Supervisors can open the v2 admin console, but only an **Admin** can actually send the client invite — see Section 8.

## 2. When to use it
When you are ready to give a client real, logged-in access to their project in the new portal (v2.0). Unlike the legacy share-link, v2.0 gives the client a private account with a password, scoped to **only their project**. Use this once the project's portal v2 has been enabled (SOP 11-12) and you have the client's email address.

## 3. What this does
Sends the client an email invitation. The client clicks the link, sets a password, and logs in. From then on they sign in at the portal login page with their email and password and land on their own project — and only their own project. They never see other clients' jobs or any internal Hub data.

## 4. Before you start
- Portal v2 is enabled for the project (SOP 11-12 — `projects.portal_v2_enabled = true`)
- You have the client's **email address** and **name**
- **Migration 103 has been applied to the database.** The `project_client_users` table must exist or the client will set a password, log in, and hit "No access to this project" on every screen with no error visible to staff. If unsure, confirm with whoever manages the Supabase migrations before inviting.
- **You are logged in as Admin.** A Supervisor can open the console but the invite call is admin-only (see Section 8).

## 5. Step-by-step process

### Sending the invite (Admin)
1. Go to **Portal Admin** → select the project → open the **v2 admin console** (PortalV2Admin)
2. Scroll to the **Invite Client** section
3. Enter the client's **Email** (required) and **Name**
4. Click **Send invite**
5. The client receives an email with a secure link

### Client side — accept and log in
6. The client opens the email and clicks the invite link
7. They are taken to a page to **set a password**
8. They set the password and submit — an account is created and linked to the project
9. They are taken to the portal login at `/client-portal`, sign in with their email + new password
10. They land on **their project home** and see the 6-tab portal (Home, My Actions, Journey, Selections, Documents, Messages)

> 💡 **Tip:** Send a quick heads-up message or call before the invite email lands so the client knows it is genuine and not phishing. The email comes from your sending address — tell them to expect it.

[insert screenshot: v2 admin console Invite Client section with email + name fields]

## 6. What happens next
- An invitation row is created and an invite email is sent to the client
- When the client sets a password, a Supabase auth user is created and a `project_client_users` row links that user to this project with `role = 'primary'`
- `projects.portal_client_email` and `portal_client_name` are set on the project
- On login, the portal resolves the client to their project and serves only that project's data
- Staff can confirm the client appears in the **Clients** list of the v2 admin **Overview** with role and active status

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Inviting before migration 103 is applied | The table the invite writes to does not exist; the failure is only `console.warn`-ed | Confirm the migration is live before inviting — otherwise the client logs in to a dead portal |
| Inviting before portal v2 is enabled | The client logs in but sees an unconfigured project | Enable portal v2 first (SOP 11-12), then invite |
| Typing the wrong email | Invite goes to the wrong inbox / login never resolves | Double-check the email; resolution is by email, so a typo means the client cannot reach their project |
| A Supervisor tries to send the invite | The invite endpoint is admin-only and returns a silent 403 | Have an Admin send the invite |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| Nothing happens / "Forbidden" when a Supervisor clicks Send invite | `POST /api/auth/invite` requires `caller.role === "admin"`; the console is open to supervisors but the invite is not | Send the invite from an Admin account |
| Client logs in but every screen says "No access to this project" | `project_client_users` row missing — usually migration 103 not applied | Apply migration 103, then re-invite the client |
| Client logs in but sees "No active project portal is linked" | `resolveClientProjectId` could not match their auth email to a project | Confirm `projects.portal_client_email` matches the email they logged in with; re-send the invite with the correct email |
| Client lands on the wrong project | Their email was set as `portal_client_email` on more than one project | Ensure each client email maps to a single project; clear the stale `portal_client_email` on the other project |
| Invite email never arrives | Mail transport failure (best-effort send) | Check the sending mailbox; re-send the invite |

## 9. Related modules
- [Admin Console — enable v2, team, milestones, updates](11-12_v2_admin_console.md) — SOP 11-12 (enable v2 before inviting)
- [My Actions & Approvals](11-11_v2_my_actions_approvals.md) — SOP 11-11 (what the client does once logged in)
- [Project Journey & Documents](11-13_v2_project_journey_and_documents.md) — SOP 11-13
- [Enable the legacy client portal](portal_enable_for_client.md) — SOP 11-01 (the older token-based link, different mechanism)

## 10. Screenshot placeholders
[insert screenshot: v2 admin console Invite Client form before sending]
[insert screenshot: client set-password screen from the invite link]
[insert screenshot: client portal home after first login showing only their project]

## 11. Automation notes
- API (invite): `POST /api/auth/invite` — body includes `{ email, name, role: "client", projectId }` — **requires `caller.role === "admin"`** (supervisors get 403)
- API (accept): the accept-invite branch in `authRoutes.mjs` creates the Supabase auth user and **upserts a `project_client_users` row** with `role = 'primary'`, and sets `projects.portal_client_email` / `portal_client_name`
- API (resolve on login): `resolveClientProjectId` (frontend `clientPortalApi.js`) queries `projects` via the anon client by `portal_client_email == auth email` and returns `{ projectId }`
- API (session bootstrap): `GET /api/portal/app/:projectId/session` (guarded by `requirePortalAuth` JWT path) returns `{ role, buildPhase, name, portalV2Enabled, ... }`
- Auth gate: `requirePortalAuth` (`requirePortalAuth.mjs`) checks the membership row in `project_client_users` for the requested `projectId`; no row → 403 "No access to this project"
- Record created in: `project_client_users` (membership), Supabase `auth.users` (the account); fields set on `projects`: `portal_client_email`, `portal_client_name`
- Notification: invite email sent to the client (best-effort)

## 12. Edge cases and limits
- If `email` or `projectId` is blank, the invite cannot be created — both are required
- Re-inviting the same client: the membership upsert is idempotent on the project+user pair; a second invite does not create a duplicate membership
- If migration 103 is not applied, the membership upsert is wrapped in try/catch and only `console.warn`s — the invite "succeeds" but the portal is non-functional for that client
- Roles other than `primary` (e.g. `architect`, `accountant`) exist in the schema CHECK but the invite flow always writes `role = 'primary'` — there is no UI to create secondary roles
- Multi-project clients: there is no project switcher; `resolveClientProjectId` silently picks the first v2-enabled project, else the most recent
- Disabling portal v2 later does **not** sign the client out or revoke their `project_client_users` row

## 13. Owner of the process
Admin  
Next review date: 2026-12-21

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Migration 103 is applied (the `project_client_users` table exists)
- [ ] Logged in as **Admin**
- [ ] A project exists with portal v2 enabled (`projects.portal_v2_enabled = true`)
- [ ] A test client email address you control (to receive the invite and set a password)

### Test cases

**TC-01 — Happy path (standard use)**
1. As Admin, open the v2 admin console for the project → Invite Client section
2. Enter the test client email and name, click **Send invite**
3. Expected result: a success state in the console; the Clients list in **Overview** will show the client once they accept
4. Open the invite email, set a password, then log in at `/client-portal`
5. Expected result: the client lands on the portal home and sees only this project
6. Expected DB record: a `project_client_users` row exists with `project_id = <this project>`, the new user's id, and `role = 'primary'`; `projects.portal_client_email` and `portal_client_name` are set
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. In the Invite Client form, leave **Email** blank
2. Click **Send invite**
3. Expected result: the invite is rejected with a validation message; email is required
4. Expected DB: no new `project_client_users` row, no invitation created
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission**
1. Complete TC-01 so the client is already a member
2. Send the invite again to the same email for the same project
3. Expected result: the membership upsert is idempotent — **no duplicate** `project_client_users` row is created for the same project+user (document the exact behaviour observed, e.g. a fresh invite email but a single membership row)
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Log out and log in as a **Supervisor**
2. Open the v2 admin console, fill the Invite Client form, click **Send invite**
3. Expected result: the request fails (silent 403 / "Forbidden") because `POST /api/auth/invite` requires `caller.role === "admin"`; no invite is sent and no membership row is created
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification**
1. Complete the happy path (TC-01)
2. Check: an invite email arrived in the test inbox
3. Check: a `project_client_users` row exists with `role = 'primary'` for the new user and this project
4. Check: `projects.portal_client_email` equals the invited email and `portal_client_name` is set
5. Check: `GET /api/portal/app/:projectId/session` (as the logged-in client) returns `200` with `role`, `buildPhase`, and `name`
- [ ] Pass  [ ] Fail

**TC-06 — Project scoping (feature-specific: client sees ONLY their project)**
1. Ensure a second project (Project B) exists that the test client is **not** a member of
2. As the logged-in client, request `GET /api/portal/app/<Project B id>/session`
3. Expected result: HTTP **403** "No access to this project" (the `project_client_users` membership check fails for Project B)
4. Confirm the client's own project still returns `200`
5. Expected: no data from Project B is ever returned to the client
- [ ] Pass  [ ] Fail

**TC-07 — Migration-not-applied failure mode (feature-specific)**
1. (Only if a scratch/staging DB without migration 103 is available) Invite a client where `project_client_users` does not exist
2. Have the client set a password and log in
3. Expected result: the client reaches the portal shell but every `/api/portal/app/:projectId/*` route returns **403** "No access to this project"
4. Document that the invite "succeeded" silently (only a server `console.warn`) — this confirms the known fragility and the need to verify migration 103 before inviting
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values (`project_client_users` row, `role = 'primary'`, `portal_client_email`/`portal_client_name` set)
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
