# ROLE-MATRIX-DEPLOYMENT-GATE-01 (Gate 8)

**Date:** 2026-06-27 · **Owner:** Claude · **Type:** automated role × endpoint API authz sweep
**Runner:** `npm run test:role-matrix-gate` (`scripts/batch-a/run-role-matrix-gate.mjs` + `role-matrix-probes.json`)
**Question answered:** *"Does any role reach an API it shouldn't — i.e. the UI hides it but the API allows it?"*

---

## Verdict: **CONDITIONAL PASS** — 33/34 probes pass; 1 deployment finding (W18-locked)

Roles tested live: **admin, supervisor, employee, unauthenticated**. (Client role = staff-JWT-with-role=client is rejected 403 by `requireAuth` itself; client-portal-token isolation is covered by W18 UAT, not this gate.)

Method note: built from **live ground truth**, not code-reading — both the file-level route maps *and* the synthesis agent were partly wrong about where gates live (mappers missed in-register gating; synthesis hallucinated `dev-api.mjs` prefix gates that don't exist except `/api/carpentry`). The live probes are authoritative.

## Results by module
| Module | admin | supervisor | employee | unauth | Verdict |
|---|---|---|---|---|---|
| finance (`/api/finance/*`, `/api/cost-model`) | 200 | **403** | **403** | 401 | ✅ admin-only — no cost/margin leak |
| sales (`/api/sales/*`) | 200 | **403** | **403** | 401 | ✅ admin-only |
| tender — PO issue (`/api/po/issue`) | 400 (val) | **403** | **403** | 401 | ✅ admin-only (W11-PO-SEC-01) |
| tender — trade master (`/api/trade-master`) | 200 | 200 | 200 | 401 | ✅ staff-readable (intended) |
| operations (`/api/operations/*`) | 200 | 200 | 200 | 401 | ✅ staff-readable (intended) |
| schedule write (`PATCH /api/schedule/task/:id`) | (allow) | 404 (allow) | **403** | 401 | ✅ admin/supervisor only (W12-SEC-01) |
| workforce mgmt (`/api/workforce/planner-jobs`) | (allow) | 200 | **403** | 401 | ✅ admin/supervisor only |
| portal-admin overview (`/api/portal/admin/v2/:id/overview`) | 200 | 200 | **200 ⚠️** | 401 | ⚠️ **FINDING** — employee should be 403 |
| whs/induction (`/api/induction/:id/info`) | — | — | — | 404 (public) | ✅ public by design |

## The finding
**ROLE-MATRIX-01 (Medium, W18-locked):** `GET /api/portal/admin/v2/:id/overview` is gated `requireRole('admin','supervisor','employee')` (`portalV2AdminRoutes.mjs:23`) and returns **200 for an employee** — but the decided **PORTAL-CROSSROLE** policy (2026-06-27) is **admin=yes, supervisor=yes (if project-related), employee=NO**. So an employee can read a client's portal overview (project, milestones, selections, meetings, client users). No auth bypass (unauth correctly 401); it's an over-broad staff scope.
- **Severity:** Medium (internal over-read of client-facing data; not a cross-tenant/anonymous leak).
- **Fix (ready, ~1 line):** drop `'employee'` from the `requireRole(...)` on the portal admin v2 routes (or per-route on `/overview`). Test: extend `role-matrix-probes.json` so employee→overview expects `forbidden`.
- **Owner:** Sam decision (W18 owner-locked) → **PORTAL-CROSSROLE-FIX batch** pending approval. Not fixed in this gate.

## What this gate proves for deployment
- **Cost/margin/finance/sales are correctly admin-only** — the single most important "UI hides it but API allows it" risk is **clean**. Employees and supervisors cannot read costs, margins, sales pipeline, or issue POs via the API.
- **Schedule + workforce writes are role-gated** (admin/supervisor) — confirmed live (W12-SEC-01 holds).
- **Operations is intentionally staff-readable**; **unauth is locked out everywhere** (401).
- The **only** role-scope defect is the portal employee over-read (W18, policy-decided, ready fix).

## Reusable gate
`test:role-matrix-gate` is now a permanent deployment gate. Extend `role-matrix-probes.json` to add modules/roles (documents, marketing, settings, admin/users, client-portal-token isolation) for fuller coverage — current set is a representative high-value cross-section, not exhaustive.

---
**Next safe action:** Sam approves the PORTAL-CROSSROLE-FIX batch (drop `employee` from portal-admin requireRole) under the W18 fast-follow track.
**Code changed:** no. **Tests changed:** yes (new gate + probes). **Docs changed:** yes.
