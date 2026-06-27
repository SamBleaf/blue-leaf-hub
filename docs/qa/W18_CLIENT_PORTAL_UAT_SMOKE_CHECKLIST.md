# W18 Client Portal — UAT Smoke Checklist (Pilot Project)

**Version:** 1.0  
**Date:** 2026-06-22  
**Owner:** Sam / ops lead  
**Related:** [W18_CLIENT_PORTAL_RELEASE_READINESS_REVIEW.md](./W18_CLIENT_PORTAL_RELEASE_READINESS_REVIEW.md) · [18_CLIENT_PORTAL_LIFECYCLE.md](./workflows/18_CLIENT_PORTAL_LIFECYCLE.md) · SOP 11-10 (client invite)

---

## 1. Purpose

Staff-runnable smoke script for **one supervised pilot project** before client-facing rollout.

Automated hardening is green for P0 and core onboarding (API-01, UI-01, SEC-04, API-04). This checklist verifies the **real office workflow**: admin enables portal v2, invites a test client, client uses Portal v2 safely, and known safety guards hold.

**Primary path:** Portal v2 JWT (`/client-portal/*`).  
**Secondary path:** Legacy share token (`/portal/:token`) — read-mostly only; no contractual approval.

| Gate | Status (2026-06-27) |
|------|------------------------|
| Internal UAT | **GO** |
| Client pilot UAT | **CONDITIONAL PASS** — [W18_UAT_EXEC_RESULT_20260627.md](./W18_UAT_EXEC_RESULT_20260627.md) |
| Production (unsupervised) | **NO-GO** — Sam sign-off on P1 items / SOPs required |

---

## 2. Preconditions

Before starting, confirm:

- [ ] Migrations **108** and **110** applied to the target DB (void/dispute/photo visibility).
- [ ] Hub API + frontend running (dev: `npm run dev`; prod: Vercel + Railway).
- [ ] Mail transport configured (invite email) or accept invite URL copied from admin response if mail fails.
- [ ] Tester has **Admin** login (invite + PortalV2Admin are admin-only).
- [ ] Second test client account available for isolation checks (or use E2E client B pattern).
- [ ] Finance module accessible to issue/sync a test variation and progress claim on the pilot job.
- [ ] Automated regressions green recently (optional sanity):

```bash
npm run test:w18-portal-void-guard:write
npm run test:w18-portal-photo-visibility:write
npm run test:w18-portal-finance-notify:write
npm run test:w18-portal-api01:write
npm run test:w18-portal-ui01
```

**Known automated coverage:** W18-P0 complete · W18-API-04 · W18-SEC-04 partial-pass · W18-API-01 · W18-UI-01.

---

## 3. Test project setup

Record before smoke:

| Field | Value |
|-------|-------|
| Pilot job address | `buildTestJobAddress()` / real pilot address — **do not use production client data without consent** |
| Job ID | |
| Project ID | |
| Portal v2 admin URL | `/portal-admin/{projectId}/v2` |
| Test client email | |
| Test client name | |
| Isolation client email (Client B) | |
| Legacy portal token (if generated) | |

**Setup options:**

1. **Real pilot project** — won job with `projects` row; preferred for client pilot UAT.
2. **Internal smoke only** — use E2E seed project (`__E2E_` prefix) for staff-only rehearsal; not for external client.

Mark photos/documents for visibility tests before client login (see §12–13).

---

## 4. Staff/admin setup steps

| # | Step | Pass | Notes |
|---|------|------|-------|
| A1 | Log in as **Admin** | ☐ | |
| A2 | Navigate to **Portal Admin** (`/portal-admin`) and select pilot project | ☐ | |
| A3 | Open **Client Portal v2 — Admin** (`/portal-admin/{projectId}/v2`) | ☐ | W18-UI-01 |
| A4 | Confirm page loads: heading, project address, no error banner | ☐ | |
| A5 | **Settings:** confirm **Portal v2 enabled (client login)** is checked; save if changed | ☐ | |
| A6 | Confirm build phase and team JSON save without error | ☐ | |
| A7 | **Client access:** confirm linked client list or “No client linked yet” | ☐ | |
| A8 | (Optional) Legacy **Portal Admin** (`/portal-admin/{projectId}`): generate share link only if testing legacy read path | ☐ | Admin-only; separate from v2 invite |

**Fail if:** non-admin can open v2 admin; settings save errors; v2 checkbox cannot be enabled.

---

## 5. Client account / invite steps

| # | Step | Pass | Notes |
|---|------|------|-------|
| I1 | In PortalV2Admin **Client access**, enter client name + email | ☐ | |
| I2 | Click **Invite client** | ☐ | Calls `POST /api/auth/invite` — W18-API-01 |
| I3 | Confirm success toast / no Forbidden error | ☐ | Supervisor cannot invite (403) |
| I4 | Client receives email OR copy invite URL from API/network tab | ☐ | |
| I5 | Client opens invite link → set password (min 8 chars) → submit | ☐ | |
| I6 | Admin refreshes v2 admin: client shows **primary · active** | ☐ | `project_client_users` row |
| I7 | (Repeat client) Invite existing client email to second project → linked without new email | ☐ | Optional multi-project |

**Fail if:** client accepts invite but admin overview still shows “No client linked”; client gets “No access to this project” on every screen.

---

## 6. Client login steps

| # | Step | Pass | Notes |
|---|------|------|-------|
| L1 | Client goes to `/client-portal` (or `/my-portal` → pick project) | ☐ | W18-UI-02 |
| L2 | Sign in with invited email + password | ☐ | |
| L3 | Shell loads: nav tabs visible (Home, Actions, Journey, …) | ☐ | |
| L4 | URL scoped to pilot project (no cross-project picker unless multi-project client) | ☐ | |
| L5 | Log out; missing/invalid session cannot load home (401) | ☐ | W18-SEC-04 |

---

## 7. Home tab smoke

| # | Check | Pass | Notes |
|---|-------|------|-------|
| H1 | Current build stage / milestone shown | ☐ | |
| H2 | Project address matches pilot | ☐ | |
| H3 | **Recent photos** show only staff-marked **client visible** photos | ☐ | W18-P0-03 / DRIFT-008 |
| H4 | No internal fields in page text (margin notes, cost_to_builder) | ☐ | |
| H5 | No “Failed to load” / “Something went wrong” | ☐ | |

---

## 8. Actions tab smoke

| # | Check | Pass | Notes |
|---|-------|------|-------|
| AC1 | Navigate to **Actions** / **My Actions** | ☐ | |
| AC2 | Pending **variation** appears after Finance sync (if issued) | ☐ | W18-API-04 |
| AC3 | Pending **progress claim** appears after Finance sync (if issued) | ☐ | |
| AC4 | Selection due items appear when seeded | ☐ | |
| AC5 | Action titles readable; no duplicate unsafe pending states | ☐ | |

**Staff prep:** Issue a test variation + claim from Finance Command Centre on the pilot job before this section if none exist.

---

## 9. Variation approval smoke

| # | Step | Pass | Notes |
|---|------|------|-------|
| V1 | Client opens pending variation action | ☐ | |
| V2 | Client approves variation (primary client role) | ☐ | Audit row created; finance shadow updated |
| V3 | Action moves to completed / no duplicate approve button | ☐ | |
| V4 | Staff notified or finance sign workflow continues as expected | ☐ | By design: client approve ≠ finance sign |

---

## 10. Claim / progress payment smoke

| # | Check | Pass | Notes |
|---|------|------|-------|
| C1 | Issued claim shows amount/status on Actions | ☐ | |
| C2 | After finance marks **paid**, client sees updated status / notification | ☐ | W18-API-04 |
| C3 | Partial payment: no premature “paid in full” client messaging | ☐ | W18-DRIFT-006 — document if blocked |
| C4 | Payment instructions visible where configured | ☐ | From v2 admin settings |

---

## 11. Finance void / dispute safety smoke

| # | Step | Pass | Notes |
|---|------|------|-------|
| S1 | Staff **voids** the test variation in Finance after client saw it | ☐ | |
| S2 | Client attempts approve again → **blocked** (409 or equivalent) | ☐ | W18-P0-02 |
| S3 | Client action shows void/withdrawn/completed — not re-openable | ☐ | |
| S4 | (Optional) Dispute claim → client action closed; no unsafe re-approve | ☐ | API-04 |

**Automated reference:** `npm run test:w18-portal-void-guard:write` (14/14).

---

## 12. Journey / photos visibility smoke

| # | Step | Pass | Notes |
|---|------|------|-------|
| J1 | Open **Journey** tab | ☐ | |
| J2 | Only **client_visible** photos appear in timeline | ☐ | W18-P0-03 |
| J3 | Staff hides a photo (`client_visible = false`) → disappears from Journey after refresh | ☐ | |
| J4 | Direct media URL for hidden photo → **404** (or not loadable) | ☐ | DRIFT-009 |
| J5 | Visible photo loads in Journey/home | ☐ | |

**Staff prep:** Tag at least one photo visible and one hidden in PortalV2Admin **Photos** section.

---

## 13. Documents visibility smoke

| # | Step | Pass | Notes |
|---|------|------|-------|
| D1 | Staff **shares** a document to portal (v2 admin Documents → Share) OR confirm finance-exposed PDF | ☐ | W18-DRIFT-001 if empty |
| D2 | Client **Documents** tab lists shared doc | ☐ | |
| D3 | Client can open/download shared doc | ☐ | |
| D4 | Non-shared / hidden doc **not listed** | ☐ | |
| D5 | Direct fetch of hidden doc id → **404** | ☐ | |

**Note:** Documents tab may be empty until staff manually exposes PDFs — not a fail if SOP documented and §D1 completed.

---

## 14. Selections visibility smoke

| # | Check | Pass | Notes |
|---|-------|------|-------|
| SE1 | Open **Selections** tab | ☐ | |
| SE2 | Allowlisted fields only (product names, prices inc GST shown to client) | ☐ | W18-API-03 |
| SE3 | **No** internal_notes, cost_to_builder, SECRET_* markers in UI | ☐ | |
| SE4 | Client can select/submit on awaiting selection (if test data present) | ☐ | Optional |

---

## 15. Notifications smoke

| # | Step | Pass | Notes |
|---|------|------|-------|
| N1 | After finance event (variation issued / claim paid), notification bell shows item | ☐ | W18-API-04 |
| N2 | Notification scoped to **this client only** (not another user on project) | ☐ | |
| N3 | Mark notification read → stays read on refresh | ☐ | |
| N4 | Cross-project: Client B does **not** see Client A notifications | ☐ | W18-SEC-03 |

---

## 16. Cross-client / project isolation smoke

| # | Step | Pass | Notes |
|---|------|------|-------|
| X1 | Log in as **Client B** (different project) | ☐ | |
| X2 | Client B **cannot** open Client A project URL (`/client-portal/...` or API home) → **403** | ☐ | |
| X3 | Client B `my-projects` lists only own project(s) | ☐ | |
| X4 | Client B blocked from `/api/portal/admin/v2/{projectA}/overview` | ☐ | |

**Automated reference:** `e2e/tests/security/client-isolation.spec.js` (8/8).

---

## 17. Legacy token / share-link smoke

| # | Step | Pass | Notes |
|---|------|------|-------|
| T1 | Admin generates legacy token on **Portal Admin** (legacy screen) if needed | ☐ | Admin-only |
| T2 | Open `/portal/{token}` — read-only preview loads **or** **404** on v2-only project | ☐ | v2 gate expected |
| T3 | Attempt **variation approve** on legacy token path → **403 / login required** | ☐ | W18-SEC-04 / DRIFT-007-D |
| T4 | Legacy token does **not** replace v2 JWT for contractual actions | ☐ | |
| T5 | (Informational) B/C POSTs on v2 project → 404 — conversations/sitewalk/warranty | ☐ | Non-v2 legacy only |

**Do not** treat legacy token as primary onboarding path for pilot clients.

---

## 18. Expected pass / fail criteria

### Pass (pilot UAT)

- All sections **A, I, L, H, AC, V, S, J, SE, N, X, T** critical rows checked with no **P0/P1** defects open.
- Client onboarding completes without “No access to this project”.
- Void/dispute/photo/document guards behave as expected.
- No cross-client data leak observed.

### Conditional pass

- **P2** defects only (copy, empty documents tab before staff share, partial-pay notify limitation documented).
- Sam accepts documented SOP gaps (DRIFT-001, DRIFT-005, P1-W18-04 legacy POST on non-v2 projects).

### Fail

- Client can approve voided variation.
- Hidden photo/doc/cost field visible to client.
- Client B accesses Client A project.
- Legacy token allows contractual approval.
- Invite flow leaves client stranded at 403 on all routes.

---

## 19. Defect logging template

Log defects in [BUG_REGISTER.md](./BUG_REGISTER.md) or copy rows below:

| ID | Screen | Role | Project | Steps | Expected | Actual | Severity | Screenshot/video link | Owner | Status |
|----|--------|------|---------|-------|----------|--------|----------|----------------------|-------|--------|
| UAT-W18-001 | | Admin / Client | | | | | P0 / P1 / P2 | | | Open |
| UAT-W18-002 | | | | | | | | | | |

**Severity guide:**

- **P0** — money, safety, client data leak, contractual integrity broken.
- **P1** — blocked workflow, wrong data shown, admin cannot onboard client.
- **P2** — cosmetic, copy, non-blocking empty state.

---

## 20. Go / no-go sign-off

| Field | Value |
|-------|-------|
| **Tested by** | Cursor (API/Playwright proxy) |
| **Date** | 2026-06-27 |
| **Project used** | `__E2E_21 Folkstone Rd` / `e2e00000-0000-4000-8000-000000000002` |
| **Client user used** | `e2e-client@blueleafbuilding.test` |
| **Result** | ☐ Pass · ☑ Conditional pass · ☐ Fail |
| **Notes** | Full result: [W18_UAT_EXEC_RESULT_20260627.md](./W18_UAT_EXEC_RESULT_20260627.md). Staff browser on real pilot still required. |
| **Sam sign-off** | ☐ Approved for supervised client pilot · ☐ Not approved |

**Production rollout (unsupervised clients):** remains **NO-GO** until Sam signs off P1 items (legacy POST deprecation SOP, documents exposure SOP, win→portal enablement).

---

## Quick reference — staff onboarding path

```
1. Admin → /portal-admin/{projectId}/v2
2. Enable Portal v2 → Save settings
3. Invite client (email + name)
4. Client accepts invite → sets password
5. Client → /client-portal → verify Home + Actions
6. Run void/visibility/isolation checks (§11–17)
7. Complete sign-off §20
```

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-27 | W18-UAT-EXEC-01 sign-off — CONDITIONAL PASS |
