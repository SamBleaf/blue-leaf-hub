# QA-001 — Security Route Baseline Plan

**Date:** 2026-06-22  
**Owner:** Cursor (Hub hardening)  
**Scope:** Non-Workforce route auth classification + SEC-01–04 baseline tests  
**Status:** Baseline complete · **Tier-0 guards shipped 2026-06-22**

**Related:** [BUG_REGISTER.md](./BUG_REGISTER.md) § QA-001 · [ADVERSARIAL_AUDIT_2026-06-23.md](./ADVERSARIAL_AUDIT_2026-06-23.md) · [WORKFLOW_TEST_MATRIX.md](./WORKFLOW_TEST_MATRIX.md) § Security P0

---

## Tier-0 fixes applied (2026-06-22)

| Route | Guard |
|-------|--------|
| `GET /api/mail/inbox` | `requireAuth` + `requireRole("admin")` |
| `POST /api/dropbox/*` (4 routes) | `requireAuth` + `requireRole("admin","supervisor")` |
| `POST /api/cron/rfq-reminders` | `requireCronSecretOrAdmin` |
| `POST /api/cron/lead-time-notifications` | `requireCronSecretOrAdmin` |
| `POST /api/cron/wipaa-review-tasks` | `requireCronSecretOrAdmin` |
| `POST /api/rfq/:id/reextract-amount` | `requireAuth` + `requireRole("admin")` |
| `POST /api/subcontractors/csv-template-sheet` | `requireAuth` + `requireRole("admin")` |
| `POST /api/blueprint/{learn,review-document,generate-sop,troubleshoot}` | `requireAuth` + `requireRole("admin")` |
| `POST /api/portal/admin/generate-token` | `requireAuth` + `requireRole("admin")` — **W18-P0-04 / GAP-10 (2026-06-22)** |

**Deferred:** ~~QA-001-GAP-10~~ **closed** — see Tier-0 table above.

---

## 1. Executive summary

Blue Leaf Hub has a **solid admin prefix-gate loop** in [`server/dev-api.mjs`](../../server/dev-api.mjs) (lines 879–895) covering `/api/finance`, `/api/sales`, `/api/tender`, `/api/templates`, etc. The dominant residual risk is **routes registered outside that loop with no inline `requireAuth`** — especially in `dev-api.mjs` itself (Dropbox, mail, cron, reextract) and selected Blueprint AI endpoints.

This pass **classifies routes**, documents public-by-design surfaces, adds **baseline E2E API tests**, and **shipped Tier-0 route guards** in `dev-api.mjs` + `blueprintRoutes.mjs` (2026-06-22).

**Workforce W17 stream:** Claude Code owns Workforce files. This plan **does not modify** `workforceRoutes.mjs`, Worker PWA, or Buildxact sync paths. Workforce role gaps (timesheet enumeration, worker task audience) are **out of scope** for QA-001; see W15/W17 hardening docs.

**Already fixed since adversarial audit (verified from code):**
- `GET /api/quote-tracker/unmatched` — now `requireAuth` + `requireRole("admin")` (`dev-api.mjs` ~1895)
- Schedule writes — `requireScheduleWrite` = admin+supervisor (`scheduleRoutes.mjs` ~434, P0-C2 closed)

---

## 2. Route inventory method

1. Read [`server/dev-api.mjs`](../../server/dev-api.mjs) inline `app.get/post` registrations.
2. Read `app.use` prefix gates (admin loop, carpentry, portal admin).
3. Grep `app.(get|post|put|patch|delete)` in route modules listed in §12.
4. Cross-check [ADVERSARIAL_AUDIT_2026-06-23.md](./ADVERSARIAL_AUDIT_2026-06-23.md) Tier-0 table.
5. Label each route with evidence: **Verified from code** | **Inferred** | **Unconfirmed / needs testing**.

Baseline tests hit a **Tier-0 sample** only (not exhaustive route enumeration).

---

## 3. Public-by-design routes

| Route | Method | Purpose | Validation / risk notes |
|-------|--------|---------|-------------------------|
| `/api/health` | GET | Liveness | No secrets — **Verified from code** |
| `/api/health/ffmpeg` | GET | FFmpeg probe | 503 if missing — low risk |
| `/api/integrations/status` | GET | Configured/not badges | No secrets — flags only |
| `/api/public/enquiry` | POST | Website lead capture | Requires `name`+`email` → 400; **no rate limit** (W01-SEC-003) |
| `/api/public/attribution` | POST | Marketing attribution | **Unconfirmed** field whitelist |
| `/api/induction/:projectId/info` | GET | Site induction form | UUID probe → 404; address visible by design (W14-DRIFT-007) |
| `/api/induction/:projectId/submit` | POST | Induction submission | Public submit — rate-limit gap **Unconfirmed** |
| `/api/track/email/:trackingId` | GET | Email open pixel | 1×1 GIF + async DB update — intentional |
| `/api/webhooks/buildexact` | POST | Buildxact webhook | Signature verification in handler — **Unconfirmed** |
| `/api/webhooks/resend` | POST | Resend delivery webhook | Raw body for signature — **Unconfirmed** |
| `/api/auth/invite/:token` | GET | Invite preview | Token-gated |
| `/api/auth/accept-invite` | POST | Accept invite | Token + password |
| `/api/auth/bootstrap-admin` | POST | One-time bootstrap | `bootstrapSecret` env gate |
| Portal v1/v2 client routes | various | Client JWT / magic link | See §6 — `requirePortalAuth` |

**Do not “fix” these to require staff auth.** Harden separately: validation, rate limits, honeypot (SAM-W01-003).

---

## 4. Routes requiring staff auth (`requireAuth` minimum)

Routes that must reject unauthenticated callers (401). Many also need role gates (§5).

| Route | Module | Current guard | Gap? |
|-------|--------|---------------|------|
| `/api/rfq/extract` | dev-api | `requireAuth` | OK |
| `/api/rfq/send` | dev-api | `requireAuth` | Role: any staff can send (employee bypass — **Tier 1**) |
| `/api/rfq/remind-one` | dev-api | `requireAuth` | Role bypass |
| `/api/imap/quote-poll` | dev-api | `requireAuth` + admin | OK |
| `/api/subcontractors/:id/mx-check` | dev-api | `requireAuth` | OK |
| `/api/po/issue` | module4Routes | `requireAuth` only | **Employee bypass** — W11-SEC-01 planned |
| `/api/unmatched-quotes/resolve` | jobsApiRoutes | `requireAuth` | OK (admin UI) |
| `/api/blueprint/chat` | blueprintRoutes | `requireAuth` | OK |
| `/api/portal/admin/*` (legacy) | portalRoutes | `requireAuth` prefix | **No requireRole** — employee can mutate |
| Most `/api/operations/*`, `/api/diary/*` | various | `requireAuth` + inline roles | Per-route — W13/W12 baselines cover key paths |

---

## 5. Routes requiring admin / supervisor auth

| Route | Expected role | Current guard | Gap? |
|-------|---------------|---------------|------|
| `/api/quote-tracker/unmatched` | admin | `requireAuth` + `requireRole("admin")` | **Fixed** |
| `/api/mail/inbox` | admin | **none** | **CRITICAL — QA-001 C3** |
| `/api/dropbox/*` (4 POST) | admin/supervisor | **none** | **CRITICAL — QA-001 C4** |
| `/api/subcontractors/csv-template-sheet` | admin | **none** | **HIGH — side effect** |
| `/api/rfq/:id/reextract-amount` | admin | **none** | **CRITICAL — QA-001 C6** |
| `/api/blueprint/learn`, `review-document`, `generate-sop`, `troubleshoot` | admin | **none** | **HIGH — AI cost + mutate** |
| `/api/cron/*` | cron secret or admin | Partial — see §9 | **CRITICAL** on unguarded crons |
| `/api/templates/*` | admin | Prefix gate on `/api/templates` | OK |
| WHS profile PUT/generate | admin/supervisor | `requireRole` (P0-C5) | OK |
| Schedule writes | admin/supervisor | `requireScheduleWrite` (P0-C2) | OK |

---

## 6. Routes requiring portal auth

| Surface | Auth mechanism | Notes |
|---------|----------------|-------|
| `/api/portal/my-projects`, `/api/portal/app/*` | Supabase client JWT | v2 registered before legacy catch-all |
| `/api/portal/:token/*` (legacy) | Portal token in path | Public entry by token — not staff auth |
| `/api/portal/admin/*` | Staff `requireAuth` | Legacy: **any staff role**; v2 admin subpaths add `requireRole(admin,supervisor,employee)` |
| `/api/portal/admin/v2/*` | Staff + role list | Narrower than legacy admin |

**Portal baseline (QA-SEC-05):** Unauthenticated `POST /api/portal/admin/generate-token` → **401**. Employee/supervisor → **403**. Admin → allowed (not 401/403). **Fixed 2026-06-22** (W18-P0-04).

---

## 7. Routes requiring worker auth

| Surface | Auth | Notes |
|---------|------|-------|
| `/api/worker/*` | `x-worker-token` | **Out of scope** — Claude W17; do not modify in QA-001 |

---

## 8. Unknown / gap routes (priority queue)

| ID | Route | Risk | Evidence |
|----|-------|------|----------|
| QA-001-GAP-01 | `GET /api/mail/inbox` | Read company IMAP | No middleware — **Verified from code** |
| QA-001-GAP-02 | `POST /api/dropbox/*` | Write company Dropbox | No middleware — **Verified from code** |
| QA-001-GAP-03 | `POST /api/cron/rfq-reminders` | Send subcontractor emails | No secret — **Verified from code** |
| QA-001-GAP-04 | `POST /api/cron/lead-time-notifications` | DB notifications | No secret — **Verified from code** |
| QA-001-GAP-05 | `POST /api/rfq/:id/reextract-amount` | Mutate RFQ + Claude + Dropbox | No middleware — **Verified from code** |
| QA-001-GAP-06 | `POST /api/subcontractors/csv-template-sheet` | Create Google Sheet | No middleware — **Verified from code** |
| QA-001-GAP-07 | `POST /api/blueprint/{learn,review-document,generate-sop,troubleshoot}` | AI cost | No middleware — **Verified from code** |
| QA-001-GAP-08 | `POST /api/cron/wipaa-review-tasks` | DB read / job list | No secret — **Verified from code** |
| QA-001-GAP-09 | `POST /api/po/issue` | Financial commitment | `requireAuth` only — employee bypass |
| QA-001-GAP-10 | `POST /api/portal/admin/generate-token` | Mint client portal token | **fixed** — `requireRole("admin")` (2026-06-22) |
| QA-001-GAP-11 | `/api/crm/*` bulk send | Mass email | `requireAuth` only — **Inferred from audit** |

**Conditional guard:** `POST /api/cron/portal-sync` and `POST /api/cron/cost-insights` check `CRON_SECRET` **when env set**; open when unset — **Verified from code**.

---

## 9. High-risk side-effect routes

| Route | Side effect | Unauth reachable? |
|-------|-------------|-------------------|
| Dropbox ensure/upload/save | File write | **Yes** |
| cron/rfq-reminders | Outbound email | **Yes** |
| cron/lead-time-notifications | Notifications | **Yes** |
| cron/cost-insights | Paid Claude batch | **If CRON_SECRET unset** |
| reextract-amount | RFQ update + AI | **Yes** |
| csv-template-sheet | Google Drive create | **Yes** |
| blueprint AI (4 routes) | Claude API | **Yes** |
| imap/quote-poll | IMAP + DB match | **No** (admin) |
| rfq/send | Email + Dropbox | **No** (auth) |

---

## 10. Test plan SEC-01–04 (+ QA-SEC-05)

| Test ID | Description | File | Target |
|---------|-------------|------|--------|
| **SEC-01** / **QA-SEC-01** | Tier-0 private routes reject unauthenticated | `e2e/tests/security/unauthenticated-routes.spec.js` | 401 or 403 |
| **SEC-02** / **QA-SEC-02** | Public-by-design validate or safe | same | 400 on bad enquiry; health 200 |
| **SEC-03** / **QA-SEC-03** | Side-effect routes reject unauthenticated | same | 401/403 on dropbox/cron/reextract/csv/blueprint |
| **SEC-04** / **QA-SEC-04** | Admin-only rejects employee/unauth | same | unmatched 401/403; mail 401; employee on admin routes |
| **QA-SEC-05** | Portal admin prefix | same | unauth 401; document employee bypass separately |

**Run:**
```bash
npm run test:qa-sec-baseline
# or
npm run test:e2e -- e2e/tests/security/unauthenticated-routes.spec.js --project=api-security
```

**Expected baseline outcome:** Tests assert **secure target**. Failures = proven gaps → fix PR (separate approval).

**First run (2026-06-22, API on :8787):** **11 pass / 9 fail** — failures confirm Tier-0 gaps:

| Test | Actual status | Gap ID |
|------|---------------|--------|
| mail/inbox unauth | **200** | QA-001-GAP-01 |
| dropbox ensure/upload unauth | **200** | QA-001-GAP-02 |
| cron rfq-reminders | **200** | QA-001-GAP-03 |
| cron lead-time-notifications | **200** | QA-001-GAP-04 |
| reextract-amount unauth | **404** (handler reached) | QA-001-GAP-05 |
| csv-template-sheet unauth | **200** | QA-001-GAP-06 |
| blueprint/learn unauth | **400** (handler reached) | QA-001-GAP-07 |
| employee mail/inbox | **200** | QA-001-GAP-01 + role |

**Passing:** quote-tracker/unmatched 401, imap-poll 401, rfq/extract 401, public enquiry 400, health 200, induction 404, tracking pixel 200, employee unmatched 403, portal admin unauth 401.

**Post-fix run (2026-06-22):** `npm run test:qa-sec-baseline` — **21/21 pass** (API restart required).

**Workforce regression:** Do **not** run W15/W16/W17 suites as part of QA-001.

---

## 11. Smallest-safe fix plan (after baseline review — not this pass)

Apply in **one focused PR**, one route group at a time, with regression tests green:

| Priority | Fix | Pattern |
|----------|-----|---------|
| P0 | `GET /api/mail/inbox` | `requireAuth, requireRole("admin")` |
| P0 | `POST /api/dropbox/*` | `requireAuth, requireRole("admin", "supervisor")` |
| P0 | `POST /api/cron/rfq-reminders`, `lead-time-notifications`, `wipaa-review-tasks` | `CRON_SECRET` header check (mirror portal-sync) |
| P0 | `POST /api/rfq/:id/reextract-amount` | `requireAuth, requireRole("admin")` |
| P1 | `POST /api/subcontractors/csv-template-sheet` | `requireAuth, requireRole("admin")` |
| P1 | Blueprint AI 4 routes | `requireAuth, requireRole("admin")` |
| P1 | `POST /api/po/issue` | `requireRole("admin", "supervisor")` — align W11-SEC-01 |
| P2 | Legacy `/api/portal/admin/*` | `requireRole("admin", "supervisor")` on mutating routes |
| P2 | `/api/crm/*` send paths | `requireRole("admin")` on bulk send |

**Do not** add auth to public enquiry, induction, tracking pixel, or webhooks without separate design.

---

## 12. Files inspected

| File | Purpose |
|------|---------|
| `server/dev-api.mjs` | Inline routes, prefix gates, cron/dropbox/mail |
| `server/lib/authRoutes.mjs` | Bootstrap, invites |
| `server/lib/inductionRoutes.mjs` | Public induction |
| `server/lib/marketingIntelligenceRoutes.mjs` | Public enquiry |
| `server/lib/blueprintRoutes.mjs` | Blueprint AI auth mix |
| `server/lib/portalRoutes.mjs` | Portal admin prefix |
| `server/lib/portalV2AdminRoutes.mjs` | v2 admin roles |
| `server/lib/templateRegistryRoutes.mjs` | Templates (prefix-gated) |
| `server/lib/jobsApiRoutes.mjs` | unmatched resolve |
| `server/lib/module4Routes.mjs` | po/issue |
| `server/lib/scheduleRoutes.mjs` | P0-C2 write gate |
| `server/lib/rfqPackageRoutes.mjs` | Package CRUD (auth) |
| `server/lib/crmRoutes.mjs` | CRM + resend webhook |
| `e2e/tests/smoke/api-rfq-unmatched.spec.js` | Existing SEC-02 partial |
| `docs/qa/ADVERSARIAL_AUDIT_2026-06-23.md` | Tier-0 source |

**Not modified (read-only or skipped):** `workforceRoutes.mjs`, `buildexactClient.mjs`, `buildexactDeepIntegration.mjs`, Worker PWA pages.

---

## 13. Routes not touched

This pass **does not modify** any product route handlers. Workforce, Buildxact sync, worker timesheet, and approval paths are explicitly excluded.

---

## 14. Regression plan

After any fix PR:

1. `npm run test:qa-sec-baseline` — all QA-SEC tests green
2. `npm run test:e2e -- e2e/tests/smoke/api-rfq-unmatched.spec.js` — SEC-02 regression
3. `npm run test:batch-a` — Batch A read-only
4. `npm run build`
5. `npm run test:cleanup-artifacts` — dry-run only

Do **not** run W15/W16/W17 write suites unless Workforce regression explicitly requested.

---

## 15. Exact next implementation prompt

```
/harden fix QA-001

Implement smallest-safe Tier-0 auth guards only:
1. mail/inbox → requireAuth + requireRole("admin")
2. dropbox/* POST → requireAuth + requireRole("admin","supervisor")
3. cron/rfq-reminders + cron/lead-time-notifications + cron/wipaa-review-tasks → CRON_SECRET guard
4. rfq/:id/reextract-amount → requireAuth + requireRole("admin")
5. subcontractors/csv-template-sheet → requireAuth + requireRole("admin")
6. blueprint learn/review-document/generate-sop/troubleshoot → requireAuth + requireRole("admin")

Do not touch Workforce routes.
Re-run npm run test:qa-sec-baseline until green.
Update BUG_REGISTER QA-001 status to fixed (partial) per route group.
```

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-22 | Initial QA-001 baseline plan + E2E test skeleton |
