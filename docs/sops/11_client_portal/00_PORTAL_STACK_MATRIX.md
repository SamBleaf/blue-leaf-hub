---
sop_version: 1.0
last_reviewed: 2026-07-02
owner: Admin
---

# Portal Stack Matrix — v2 (Canonical) vs v1 (Legacy)

**Decision SAM-SOP-001:** Portal v2 is canonical for all new jobs.  
The legacy v1 token portal remains functional as a fallback only. Do not enable v1 for any new project.

---

## Which stack to use

| Situation | Use this stack |
|-----------|---------------|
| New project — any job started after portal v2 was deployed | **v2 (canonical)** |
| Existing project already live on v1 where the client has the link | v1 (legacy/fallback) — do not disrupt the client mid-build |
| Existing project about to be onboarded — client not yet active | **v2 (canonical)** — migrate before inviting |
| Client needs a password-protected, scoped account | **v2 (canonical)** |
| Temporary share link needed, no account, no login | v1 (legacy) — short-term only |

---

## Stack comparison

| Dimension | v2 — Canonical | v1 — Legacy/fallback |
|-----------|---------------|----------------------|
| Status | **Canonical — use for all new jobs** | Legacy — fallback only, do not enable for new jobs |
| Auth model | Logged-in client account (email + password, Supabase auth) | Token URL — no login, no account |
| Client URL | `/client-portal` (login page) → resolves to their project | `/portal/:token` (shareable link) |
| Admin UI | `PortalV2Admin` component | `PortalAdmin` component |
| Admin API namespace | `POST /api/portal/admin/v2/:projectId/*` | `POST /api/portal/admin/*` (no v2 prefix) |
| Client API namespace | `GET /api/portal/app/:projectId/*` (JWT-gated) | `GET /api/portal/:token/*` (token-gated) |
| Client invite | SOP 11-10 — Admin sends email invite; client sets password | SOP 11-01 — Admin generates link; Admin sends link manually |
| Actions / approvals | SOP 11-11 — My Actions tab: variation approve/decline, meeting confirm/decline, payment-notify, selection | SOP 11-05 — Decisions tab: approve/reject; SOP 11-06 — Variations |
| Admin console | SOP 11-12 — enable v2, build phase, team, milestones, selections, meetings, weekly update | SOPs 11-03, 11-04, 11-07, 11-08 — separate SOPs per feature |
| Journey / timeline | SOP 11-13 — Journey tab (milestones + updates + docs) | SOP 11-08 — Milestones tab; SOP 11-03 — Updates tab |
| Documents | SOP 11-13 — Documents tab (client-visible files, signed URLs) | Not a standalone v1 feature (files shared via Budget/Decisions) |
| Messaging | v2 Messages tab (`/api/portal/app/:projectId/messages`) | SOP 11-07 — Conversations tab (`/api/portal/:token/conversations`) |
| Photos | SOP 11-13 — photos in Journey (known gap: v2 media endpoint mismatch) | SOP 11-04 — Photos tab |
| Client guide | SOPs 11-10..11-13 | SOP 11-09 — `portal_client_guide.md` |
| Audit trail | `portal_audit_logs` — all contractual client writes | No audit log |
| Security | Account-scoped — client can only see their own project; all writes require JWT | Token-scoped — anyone with the link can view |
| Migration required | Migration 103 (`project_client_users` table) must be applied before inviting | No migration dependency |

---

## SOP cross-reference

### v2 SOPs (canonical — use these for all new jobs)

| SOP ID | File | What it covers |
|--------|------|----------------|
| 11-10 | `11-10_v2_client_login_and_invite.md` | Invite the client; client sets password and logs in at `/client-portal` |
| 11-11 | `11-11_v2_my_actions_approvals.md` | Client responds to variations, meetings, payments, selections on My Actions |
| 11-12 | `11-12_v2_admin_console.md` | Admin enables v2, sets build phase, team, milestones, selections, meetings, weekly update |
| 11-13 | `11-13_v2_project_journey_and_documents.md` | Client reads Journey timeline and downloads documents |

### v1 SOPs (legacy — fallback only)

| SOP ID | File | What it covers | v2 equivalent |
|--------|------|----------------|---------------|
| 11-01 | `portal_enable_for_client.md` | Generate token link and enable v1 portal | SOP 11-12 (enable v2 + invite via SOP 11-10) |
| 11-02 | `portal_view_as_client.md` | Admin preview of the v1 portal | Open `/client-portal` as the client account |
| 11-03 | `portal_add_weekly_update.md` | Publish a weekly update via v1 admin | SOP 11-12 (Updates section) |
| 11-04 | `portal_upload_photos.md` | Upload photos to the v1 portal | SOP 11-12 / SOP 11-13 (photos in Journey) |
| 11-05 | `portal_add_decision.md` | Create a decision item in v1 portal | SOP 11-12 (Selections / Meetings) + SOP 11-11 |
| 11-06 | `portal_variation.md` | Add a variation via v1 portal decisions | SOP 11-11 (variation approve/decline on My Actions) |
| 11-07 | `portal_send_message.md` | Send a message via v1 portal messaging | v2 Messages tab (same admin/client flow, different endpoints) |
| 11-08 | `portal_update_milestones.md` | Manage milestones in v1 portal | SOP 11-12 (Milestones section) |
| 11-09 | `portal_client_guide.md` | Client-facing guide for v1 token portal | SOPs 11-10..11-13 (v2 client workflows) |

---

## Key notes

- **Migration 103** (`project_client_users` table) must be applied to Supabase before any v2 client invite can work. Confirm this before enabling v2 on any project.
- **Never enable both stacks for the same project simultaneously.** If a client is active on v1, leave them there until the build completes (or until a deliberate migration is planned with the client).
- **Do not rotate a v1 token** for a project where you intend to migrate to v2 — rotating the token invalidates the client's existing link and gives them nowhere to go.
- If a client reports problems on a v1 portal, refer to the v1 SOPs in the table above. Do not direct them to the v2 login page.
