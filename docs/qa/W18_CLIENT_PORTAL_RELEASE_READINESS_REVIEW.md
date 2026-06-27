# W18 Client Portal — Batch D Release Readiness Review

**Date:** 2026-06-22  
**Reviewer:** Cursor (Hub hardening)  
**Scope:** Client Portal v2 + legacy token overlap — documentation/review only; no product changes  
**Related:** [18_CLIENT_PORTAL_LIFECYCLE.md](./workflows/18_CLIENT_PORTAL_LIFECYCLE.md) · [WORKFLOW_TEST_MATRIX.md](./WORKFLOW_TEST_MATRIX.md) · [BUG_REGISTER.md](./BUG_REGISTER.md)

---

## 1. Executive summary

W18 **P0 hardening is complete**. Migrations 108/110 are verified applied; void/dispute/photo/notification regressions pass; admin token minting is role-gated; cross-project JWT isolation is green.

**Portal v2 is the primary client path** (`/client-portal/*` + `/api/portal/app/:projectId/*`). Legacy token routes remain for read-only sharing and a shrinking set of anonymous POSTs (messages, sitewalk, warranty — not contractual approvals).

| Audience | Recommendation | Rationale |
|----------|----------------|-----------|
| **Internal UAT** | **GO** | P0 closed; automated regression green; manual smoke checklist below |
| **Client UAT** | **CONDITIONAL GO** | Invite/onboarding proven (API-01); documents SOP + legacy non-v2 POST still need Sam sign-off |
| **Production client-facing** | **NO-GO** until P1 items triaged | Legacy token writes, hollow documents tab, win→portal enablement manual |

**Release readiness score (subjective):** Internal UAT **78/100** · Client UAT **62/100** · Production **48/100**

---

## 2. Closed W18 items

| ID | Item | Evidence |
|----|------|----------|
| W18-P0-01 | Migrations 108/110 verified applied | [W18_P0_01_PORTAL_MIGRATIONS_108_110_READINESS.md](./W18_P0_01_PORTAL_MIGRATIONS_108_110_READINESS.md) |
| W18-P0-02 | Void variation cannot be approved post-void | `test:w18-portal-void-guard:write` 14/14 |
| W18-P0-03 | Journey/home/media `client_visible` | `test:w18-portal-photo-visibility:write` 15/15 |
| W18-P0-04 / QA-001-GAP-10 | Generate-token admin-only | `test:qa-sec-baseline` 23/23 |
| W18-API-04 | Finance-event notifications/actions | `test:w18-portal-finance-notify:write` 34/34 |
| W18-DRIFT-002 | Migrations 108/110 | Closed with P0-01 |
| W18-DRIFT-008 | Home `recentPhotos` filter | Fixed + regression |
| W18-DRIFT-009 | Media route `client_visible` gate | Fixed + regression |
| W18-MIG-01 | CHECK behavioral probes | 2026-06-22 env DB |
| W18-SEC-01 | Unauthenticated admin blocked | QA-SEC baseline |
| W18-SEC-02 | Non-admin cannot mint token | QA-SEC baseline |
| W18-SEC-03 | Cross-project JWT blocked | client-isolation + batch-a probes |
| W18-API-03 | Selections/documents field allowlist | client-isolation leakScan |
| W18-UI-02 | Client shell loads project | E2E navigation |
| W18-SEC-04 | Invalid/malformed JWT → 401; wrong project → 403 | **accepted partial-pass** — `test:w18-portal-sec04:write` 35/35 + 1 gap (expired JWT) |
| W18-API-01 | Admin invite + accept → project_client_users + v2 access | **closed / pass** — `test:w18-portal-api01:write` 30/30 |
| W18-UI-01 | PortalV2Admin overview E2E | **closed / pass** — `test:w18-portal-ui01` 11/11 |

---

## 3. Open W18 items

| ID | Severity | Summary | Test status |
|----|----------|---------|-------------|
| W18-DRIFT-001 | P1 | Documents tab hollow (manual expose) | parking |
| W18-DRIFT-003 | P1 | Diary draft → publish dead-end | parking |
| W18-DRIFT-004 | P1 | v2 admin API vs UI role mismatch | parking |
| W18-DRIFT-005 | P1 | Portal not auto-enabled on win | parking |
| W18-DRIFT-006 | P1 | Partial claim re-notify blocked | parking (documented in API-04) |
| W18-DRIFT-007 | P1 | Legacy token POST without JWT | **partially closed** — D-class 403; B/C blocked on v2 projects (404); non-v2 legacy only (P1-W18-04) |

---

## 4. Remaining P0 risks

**None registered.** All P0-W18-01 through P0-W18-04 are closed.

Residual **high-impact** items are reclassified as **P1** pending Sam decision (legacy token POST audit, documents exposure SOP).

---

## 5. Remaining P1 risks

1. **Legacy anonymous POSTs (non-v2 projects only)** — on v2-enabled projects `resolveProject()` returns null → legacy token POSTs **404**. Contractual decision respond **403** (hard-disabled). Remaining B/C POSTs (conversations/sitewalk/warranty) only reachable on **non-v2** legacy projects — Sam decision on deprecation (P1-W18-04).
2. **Documents tab empty by default** — finance PDFs not auto-synced to `portal_documents` (W18-DRIFT-001).
3. **Portal enablement manual** — win does not auto-enable portal (W18-DRIFT-005); ops must enable + invite.
4. **Admin role drift** — v2 admin API allows employee/supervisor; UI is admin-only (W18-DRIFT-004).
5. **Partial payment client notify** — `client_payment_notified_at` blocks re-tap (W18-DRIFT-006); may be intentional.
6. **Remaining cohesion gaps** — documents SOP (DRIFT-001), non-v2 legacy POST (P1-W18-04), win→auto-enable (DRIFT-005).

---

## 6. Security status

| Control | Status | Evidence |
|---------|--------|----------|
| Tier-0 unauthenticated routes | **Closed** | QA-001 |
| Admin token mint | **Admin-only** | W18-P0-04 |
| JWT project scoping | **Pass** | `requirePortalAuth.mjs` + W18-SEC-03 |
| Contractual writes | **JWT + primary/secondary** | `requirePortalWrite` |
| Cross-project access | **403** | client-isolation + batch-a |
| Legacy token variation approve | **403 disabled** | `portalRoutes.mjs` ~1224–1236 |
| Legacy token other POSTs | **P1 (non-v2 only)** | B/C blocked on v2 (404); SEC-04 audit |
| Invalid/malformed JWT | **Pass** | W18-SEC-04 — missing/invalid/malformed → 401 |
| Expired JWT | **Partial** (gap-documented) | Same handler as invalid; true expiry not synthesized |

---

## 7. Client data visibility status

| Surface | Filter | Status |
|---------|--------|--------|
| Journey photos | `client_visible = true` | **Pass** |
| Home recentPhotos | `client_visible = true` | **Pass** (DRIFT-008 fixed) |
| Media `/media/:photoId` | `client_visible` → 404 | **Pass** (DRIFT-009 fixed) |
| Documents list/download | `client_visible = true` | **Pass** (code) |
| Meetings | `client_visible = true` | **Pass** (code) |
| Selections | allowlist (no internal_notes/cost) | **Pass** (W18-API-03) |
| Financial snapshot | inc-GST client fields only | **Verified from code** |
| Notifications | `target_user_id` scoped | **Pass** (API-04 + code ~1103) |

**No known client data visibility leaks** in v2 JWT paths after P0-03/008/009 fixes.

---

## 8. Portal token/JWT status

| Model | Primary? | Auth | Writes |
|-------|----------|------|--------|
| **Portal v2 JWT** | **Yes** | Supabase session + `project_client_users` | Contractual actions gated |
| **Legacy URL token** | Secondary (share links) | `projects.portal_token` | Read-mostly; limited POST (P1 audit) |
| **Staff admin JWT** | Staff only | Hub login + role | generate-token admin-only |

**Recommendation:** Treat v2 JWT as sole path for variations/claims/signatures. Legacy token useful for read-only preview until deprecated.

---

## 9. Finance / variation / claim status

| Event | Shadow sync | Client action | Notification | Guard |
|-------|-------------|---------------|--------------|-------|
| Variation sent | ✓ | pending | variation_issued | API-04 |
| Client approve | audit only | approved | — (by design) | P0-02 void guard |
| Finance sign | ✓ | — | variation_approved | API-04 |
| Variation void | withdrawn | completed | — | P0-02 |
| Claim issued | ✓ | pending | progress_claim_issued | API-04 |
| Claim paid | ✓ | completed | claim_paid | API-04 |
| Partial pay | status sync | — | no premature notify | API-04 |
| Dispute | disputed | completed | — (action-only) | API-04 |
| Claim void | void | completed | — | API-04 |

**Variation/claim actions safe after void/dispute/paid** — verified by P0-02 + API-04 regressions.

---

## 10. Notification / action status

- `portalIntegration.mjs` + `portalNotify.mjs` create scoped rows on v2 projects only.
- Dedup via `dedup_day` unique index — idempotent re-sync verified (API-04).
- Per-user notification scoping on GET — verified (API-04).
- Cross-project notifications/actions — **403** (API-04).

---

## 11. Photo / document visibility status

- **Photos:** Journey, home, media all enforce `client_visible` (migration 110 + DRIFT-008/009 fix).
- **Documents:** API filters `client_visible`; tab often empty until staff exposes PDFs (DRIFT-001 — ops/SOP not code blocker for UAT if manual workflow documented).

---

## 12. Legacy portal vs Portal V2 overlap

| Area | Legacy (`/portal/:token`) | V2 (`/client-portal`) |
|------|---------------------------|------------------------|
| Client UI | `PortalApp.jsx` routes | `ClientPortalLayout.jsx` + pages under `src/pages/clientportal/` |
| API | `portalRoutes.mjs` | `portalV2Routes.mjs` (registered first in `dev-api.mjs`) |
| Admin | `PortalAdmin.jsx` | `PortalV2Admin.jsx` |
| Finance sync | Same `portalIntegration.mjs` | Same |
| Primary path | **No** — fallback share | **Yes** |

**Legacy still needed?** Yes for existing share links and read-only preview; contractual flows must use v2 (token variation respond already 403).

---

## 13. Manual smoke checklist (internal UAT)

**Staff-runnable checklist:** [W18_CLIENT_PORTAL_UAT_SMOKE_CHECKLIST.md](./W18_CLIENT_PORTAL_UAT_SMOKE_CHECKLIST.md) (20 sections — admin setup, invite, client tabs, safety, sign-off).

Quick summary (see full doc for pass/fail criteria):

- [ ] Admin → PortalV2Admin → enable v2 → invite client
- [ ] Client login → shell loads (W18-UI-02)
- [ ] Home / Actions / Journey / Documents / Selections / Notifications
- [ ] Variation approve + void guard (W18-P0-02)
- [ ] Photo/document visibility (W18-P0-03)
- [ ] Cross-client isolation (W18-SEC-03)
- [ ] Legacy token — no contractual approve (W18-SEC-04)

---

## 14. Automated test coverage summary

| Command | Result | Covers |
|---------|--------|--------|
| `npm run test:qa-sec-baseline` | **23/23 pass** | W18-SEC-01/02, Tier-0 |
| `npm run test:w18-portal-void-guard:write` | **14/14 pass** | W18-P0-02, partial SEC-03 |
| `npm run test:w18-portal-photo-visibility:write` | **15/15 pass** | W18-P0-03, DRIFT-008/009 |
| `npm run test:w18-portal-finance-notify:write` | **34/34 pass** | W18-API-04, API-02 partial, SEC-03 |
| `npm run test:w18-portal-sec04:write` | **35/35 pass** (+ 1 gap) | W18-SEC-04, W18-DRIFT-007 |
| `npm run test:w18-portal-api01:write` | **30/30 pass** | W18-API-01, W18-API-02 partial, SEC-03/04 regression |
| `npm run test:w18-portal-ui01` | **11/11 pass** | W18-UI-01, SEC-02 role gate |
| `e2e/tests/security/client-isolation.spec.js` | **8/8 pass** (prior run) | W18-SEC-03, API-03 |
| `e2e/tests/client-portal/navigation.spec.js` | **pass** | W18-UI-02 |
| `npm run build` | **pass** | Frontend compiles |
| `npm run test:cleanup-artifacts` | **dry-run only** | No deletions |

**Gaps:** None for core onboarding UI/API. W18-SEC-04 **accepted partial-pass** (expired JWT gap only).

---

## 15. Recommended next W18 item

**Client UAT manual smoke** — execute [W18_CLIENT_PORTAL_UAT_SMOKE_CHECKLIST.md](./W18_CLIENT_PORTAL_UAT_SMOKE_CHECKLIST.md) on one pilot project.

---

## 16. Go / no-go recommendation

| Gate | Verdict |
|------|---------|
| Internal UAT | **GO** |
| Client UAT (pilot clients, Sam-supervised) | **CONDITIONAL GO** — run [UAT smoke checklist](./W18_CLIENT_PORTAL_UAT_SMOKE_CHECKLIST.md) |
| Production rollout (unsupervised clients) | **NO-GO** — Sam decision on non-v2 legacy POST (P1-W18-04) + documents SOP |

---

## 17. W18-SEC-04 audit result (2026-06-22)

**Verdict:** **partial-pass** — no P0 security gap found.

| Target | Result |
|--------|--------|
| Missing/invalid/malformed JWT on 5 v2 routes | **401** — pass |
| Valid JWT wrong project | **403** — pass |
| Expired JWT | **gap-documented** — same `getUser` rejection path as invalid |
| Legacy decision respond (D) | **403 requiresLogin** — pass; DB unchanged |
| Legacy B/C POST on v2 project | **404** — `resolveProject` v2 gate — pass |
| Invalid legacy token | **404** — pass |

**Legacy POST classification:** conversations **B**, sitewalk **C**, warranty **C**, decision respond **D (blocked)**. B/C only relevant on non-v2 legacy projects.

---

## 18. W18-API-01 audit result (2026-06-22)

**Verdict:** **pass** — invite/onboarding linkage works; no product fix required.

| Question | Answer |
|----------|--------|
| Who enables portal? | Admin via `PATCH /api/portal/admin/v2/:id/settings`; accept-invite also sets `portal_enabled` + `portal_v2_enabled` |
| Who generates legacy token? | **Admin only** — `POST /api/portal/admin/generate-token` |
| Who invites client? | **Admin only** — `POST /api/auth/invite` |
| Non-admin blocked? | Employee **403** on invite + generate-token — verified |
| project_client_users created? | **Yes** — accept-invite upsert + existing-client link path |
| my-projects after invite? | **200** — invited project listed |
| home after invite? | **200** — correct project |
| Notifications scoped? | **Yes** — `target_user_id` + `channel=in_app` |
| Cross-client blocked? | Client B **403** on foreign project — verified |
| Legacy vs JWT? | `portal_token` separate; legacy read **404** on v2 project; JWT is primary |

---

## 19. W18-UI-01 audit result (2026-06-22)

**Verdict:** **pass** — admin UI safe for internal/client UAT onboarding.

| Question | Answer |
|----------|--------|
| Route reachable? | **Yes** — `/portal-admin/:projectId/v2` (admin-only `RoleRoute`) |
| Overview loads? | **Yes** — 11/11 E2E |
| Project/status visible? | **Yes** — address, v2 checkbox, build phase |
| Portal v2 enabled visible? | **Yes** — checkbox checked on seeded project |
| Settings role-gated? | **Yes** — supervisor/employee redirected; API v2 settings still broader (DRIFT-004 parking) |
| Invite admin-only? | **Yes** — route admin-only; invite calls `/api/auth/invite` |
| Linked clients visible? | **Yes** — primary/active + Revoke/Restore |
| UI aligns with API-01? | **Yes** — invite POST verified via network intercept |
| Legacy contractual ambiguity? | **No** on v2 admin — no token-approve affordance; legacy token regen remains on `PortalAdmin` only |
| Enough for pilot UAT? | **Yes** — staff path: v2 admin → enable → invite; §13 checklist for client-side |

**Note:** `generate-token` UI is on legacy `PortalAdmin`, not `PortalV2Admin`. V2 onboarding uses invite flow (proven API-01).

---

## 20. Exact next prompt

```
Execute docs/qa/W18_CLIENT_PORTAL_UAT_SMOKE_CHECKLIST.md on one pilot project.
```

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-22 | W18 UAT smoke checklist published — supervised pilot ready |
| 2026-06-22 | W18-UI-01 closed — PortalV2Admin E2E 11/11 |
| 2026-06-22 | W18-API-01 closed — invite/onboarding linkage 30/30 |
| 2026-06-22 | W18-SEC-04 accepted partial-pass — no P0 gap |
| 2026-06-22 | Release review accepted — internal UAT GO; client UAT conditional |
| 2026-06-22 | Initial Batch D W18 release readiness review after API-04 close |
