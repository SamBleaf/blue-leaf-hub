---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: placeholders_only
owner: Admin
test_status: static_pass
---

# SOP 11-01: Enable the Client Portal for a Project

**Module:** Portal Admin  
**SOP ID:** 11-01  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin

## 2. When to use it
When a project is ready to share with the client — typically once the build starts. Enabling the portal creates a private, no-login link the client uses to follow progress, make decisions, and message you.

## 3. What this does
Generates a unique secret token for the project and turns the portal on. The token forms a shareable URL (`/portal/[token]`) that the client opens — no account or password needed. Only people with the link can view the portal.

## 4. Before you start
- The project exists
- You are an Admin
- You have the client's name and (for sharing) a way to send them the link

## 5. Step-by-step process

1. Go to **Portal Admin**
2. Open the project you want to share
3. Click **Generate portal link** (or **Enable portal**)
4. The system creates a unique token and turns the portal on
5. Copy the portal URL (`/portal/[token]`)
6. Share the link with the client (email or text)

> 💡 The link itself is the access control — anyone with it can view the portal, so share it only with the client.

## 6. What happens next

- A random secret token is written to `projects.portal_token` and `projects.portal_enabled` is set to `true`
- The portal URL is `/portal/[token]`
- The client opens the link and sees their project home (SOP 11-02)
- You can seed sample content to preview the experience before sharing

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Sharing the link too widely | Treating it like a normal URL | The link is the key — only send it to the client |
| Enabling before there's content | Empty portal | Add a welcome update and milestones first (SOP 11-03, 11-08), or seed test data to preview |
| Regenerating the token unnecessarily | Confusion | Regenerating invalidates the old link — only do it if the link was leaked |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "projectId required" (400) | The project wasn't selected — open a project first |
| Client says link doesn't work | Confirm `portal_enabled` is true and you shared the full `/portal/[token]` URL |
| Need to revoke access | Regenerate the token (old link stops working) or disable the portal |

## 9. Related modules
- [View the portal as the client](portal_view_as_client.md) — SOP 11-02
- [Add a weekly update](portal_add_weekly_update.md) — SOP 11-03

## 10. Screenshot placeholders
[insert screenshot: Portal Admin generate link button]
[insert screenshot: generated portal URL]

## 11. Automation notes
- API: `POST /api/portal/admin/generate-token` with `{ projectId }` → `{ token, portalUrl: "/portal/[token]" }`
- Sets `projects.portal_token` (random `crypto.randomBytes(24).base64url`) and `projects.portal_enabled = true`
- Test enable: `POST /api/portal/admin/enable-test/:projectId` → reuses existing token or creates one, enables portal, returns `{ ok, portalToken, portalEnabled }`
- Seed sample content: `POST /api/portal/admin/seed-test-data` with `{ projectId }` → inserts sample milestones, an update, a decision, and a claim if none exist
- Requires `projectId` (400 otherwise); project must exist for enable-test (404 otherwise)

## 12. Edge cases and limits
- Regenerating a token replaces the old one — the previous link stops working
- The portal route is public (token-based) — there is no login
- `enable-test` is idempotent: it reuses the existing token rather than rotating it

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] A project that does not yet have the portal enabled

### Test cases

**TC-01 — Generate token (happy path)**
1. Generate a portal link for the project
2. Expected: response `{ token, portalUrl }` with a non-empty token
3. Expected DB: `projects.portal_token` set, `portal_enabled = true`
- [ ] Pass  [ ] Fail

**TC-02 — projectId required**
1. Call generate-token with no projectId
2. Expected: HTTP 400 "projectId required"
- [ ] Pass  [ ] Fail

**TC-03 — Enable-test reuses existing token**
1. Call enable-test on a project that already has a token
2. Expected: the same token returned (not rotated), `portalEnabled = true`
- [ ] Pass  [ ] Fail

**TC-04 — Enable-test unknown project**
1. Call enable-test for a non-existent projectId
2. Expected: HTTP 404 "Project not found"
- [ ] Pass  [ ] Fail

**TC-05 — Portal resolves by token (automation)**
1. After enabling, open `GET /api/portal/[token]`
2. Expected: returns project basics (`projectId`, `clientName`, `address`, `portalEnabled: true`)
- [ ] Pass  [ ] Fail

**TC-06 — Seed sample data**
1. Call seed-test-data for the project
2. Expected: `{ ok: true, added: true }` and sample milestone/update/decision/claim rows created (only if none existed)
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Token generates and enables the portal
- [ ] projectId required
- [ ] enable-test reuses token
- [ ] Portal resolves by token
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
