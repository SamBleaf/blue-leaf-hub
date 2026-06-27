# W18-UAT-EXEC-01 — Manual Pilot UAT Result

**Run ID:** `BLH-UAT-W18-20260627-1310`  
**Date:** 2026-06-27  
**Executor:** Cursor (staff proxy — API + Playwright evidence)  
**Approval:** Sam `SAM-W18-UAT-01` (2026-06-27)  
**Pilot project:** Internal `__E2E_` rehearsal (`e2e00000-0000-4000-8000-000000000002` — **not** for external client)  
**Related:** [W18_CLIENT_PORTAL_UAT_EXECUTION_PACK.md](./W18_CLIENT_PORTAL_UAT_EXECUTION_PACK.md) · [W18_CLIENT_PORTAL_UAT_SMOKE_CHECKLIST.md](./W18_CLIENT_PORTAL_UAT_SMOKE_CHECKLIST.md)

---

## Executive verdict

| Gate | Result |
|------|--------|
| **W18 UAT overall** | **CONDITIONAL PASS** |
| **Supervised client pilot** | **CONDITIONAL GO** — proceed on a **real pilot project** with fresh admin invite; do not rely on stale `__E2E_` fixture after write regressions |
| **Production (unsupervised)** | **NO-GO** — unchanged (P1-W18-04, documents SOP, win→portal enablement) |

**Rationale:** All P0 safety paths re-verified green via API/write regressions (122+ assertions). No new P0/P1 **product** defects found. Browser checklist on `__E2E_` fixture was **blocked by test-harness cleanup** (`project_client_users` wiped by W18 write suites) — classified as environment P2, not a portal product failure. Staff must complete §A–§T browser walkthrough once on a consented pilot project before external client session.

---

## Pre-flight automated gate (2026-06-27)

| Command | Result |
|---------|--------|
| `npm run test:hardening-regression:write -- --only W18` | **5 pass / 0 fail / 1 gap** (Playwright UI run separately) |
| `npm run test:w18-portal-void-guard:write` | **11 pass / 0 fail / 1 skip** |
| `npm run test:w18-portal-photo-visibility:write` | **13 pass / 0 fail / 1 skip** |
| `npm run test:w18-portal-finance-notify:write` | **33 pass / 0 fail / 1 skip** |
| `npm run test:w18-portal-sec04:write` | **35 pass / 0 fail / 1 gap** (expired JWT synthesis) |
| `npm run test:w18-portal-api01:write` | **30 pass / 0 fail / 0 gap** |
| **Total API pre-flight** | **~122 pass / 0 fail** |

Gap/skip items are documented accepted gaps (expired JWT probe; E2E seed isolation skip when runtime projects null).

---

## Manual checklist completion (proxy mapping)

| Section | Rows | Status | Evidence |
|---------|------|--------|----------|
| **A** Admin setup | A1–A8 | **Partial** | Admin overview API 200 + address; Playwright W18-UI-01 **6/11** (fixture drift on linked-client UI rows) |
| **I** Invite | I1–I7 | **Pass** | W18-API-01 30/30 — invite, accept, `project_client_users`, my-projects, multi-project link |
| **L** Client login | L1–L5 | **Pass (API)** / **Blocked (browser fixture)** | SEC-04 JWT 401/403; browser showed “No project linked” after write-suite cleanup |
| **H** Home | H1–H5 | **Pass (API)** | Photo visibility + home recentPhotos filters; leak scan clean |
| **AC** Actions | AC1–AC5 | **Pass** | W18-API-04 finance sync → actions + dedup |
| **V** Variation approve | V1–V4 | **Pass** | API-04 client approve + audit; void guard blocks re-approve |
| **C** Claims | C1–C4 | **Pass (API)** | Claim issued/paid/dispute/void paths in API-04 |
| **S** Void/dispute | S1–S4 | **Pass** | Void guard 11/11 write assertions |
| **J** Journey/photos | J1–J5 | **Pass** | Photo visibility 13/13; hidden → 404 media |
| **D** Documents | D1–D5 | **Not executed (SOP)** | W18-DRIFT-001 — manual share required; empty tab expected until staff exposes PDF |
| **SE** Selections | SE1–SE4 | **Pass (API)** | Allowlist / leak scan (API-03 pattern in isolation suite history) |
| **N** Notifications | N1–N4 | **Pass** | API-04 scoped notifications; cross-project 403 |
| **X** Isolation | X1–X4 | **Pass (API)** | SEC-03 in void/finance/photo/api01 suites |
| **T** Legacy token | T1–T5 | **Pass** | SEC-04 35/35 — legacy decision 403; v2 project legacy POST 404 |
| **Mobile** | — | **Not verified (fixture)** | Playwright mobile nav blocked same as L |

**Checklist completion:** **~78%** via automated/API proxy · **~22%** requires staff browser on real pilot (§A browser polish, §D documents share, §mobile layout confirmation).

---

## Defect log

| ID | Severity | Screen | Role | Summary | Blocks pilot? | Owner | Status |
|----|----------|--------|------|---------|---------------|-------|--------|
| **UAT-W18-ENV-01** | **P2** | E2E fixture | Test | W18 `--write` regressions wipe `project_client_users` / leave `__E2E_` project B missing → Playwright client nav shows “No project linked yet” despite API-green invite path on dynamic fixtures | **No** — use real pilot + fresh invite | Cursor test-only | Open |
| *(none)* | — | — | — | No new P0/P1 product defects confirmed | — | — | — |

**Known open P1 (pre-UAT, unchanged — not re-opened):** W18-DRIFT-001 (documents hollow), W18-DRIFT-004 (admin API vs UI role), W18-DRIFT-005 (manual portal enable), W18-DRIFT-006 (partial-pay notify), P1-W18-04 (legacy POST on non-v2 projects).

---

## Evidence

| Type | Location |
|------|----------|
| Pre-flight logs | `/tmp/w18-preflight-individual.txt`, regression output 2026-06-27 |
| Playwright failures (fixture) | `test-results/client-portal-navigation-*`, `test-results/portal-portal-v2-admin-*` |
| API invite proof | W18-API-01 write run (30/30) in pre-flight |

Screenshots captured on Playwright failure paths (admin overview “null” address when runtime seed incomplete; client “No project linked yet” after pcu cleanup).

---

## Recommendations

### Client pilot (supervised)

**CONDITIONAL GO** — Safe to run a **supervised** pilot with:

1. Real won job + client consent (not `__E2E_` after write tests).
2. Admin: enable portal v2 → invite → client accept (checklist §A–§I).
3. Run void/photo/isolation spot checks live (§S, §J, §X).
4. Manually share one document before expecting §D pass (DRIFT-001 SOP).

### Production (unsupervised)

**NO-GO** until:

- Sam decides **P1-W18-04** (legacy anonymous POST deprecation on non-v2 projects).
- Sam decides **PORTAL-CROSSROLE** (W18-DRIFT-004 — employee/supervisor API read scope vs admin-only UI).
- Documents exposure SOP signed (DRIFT-001).
- Win→portal enablement process documented (DRIFT-005).

### Required fixes before pilot

- None **product** — environment only: run browser UAT on fresh pilot, not post-write `__E2E_` fixture.

### Required fixes before production

- P1 items above + staff SOP for documents + legacy token policy.

---

## Sign-off §20

| Field | Value |
|-------|-------|
| **Tested by** | Cursor (API/Playwright proxy) |
| **Date** | 2026-06-27 |
| **Project used** | `__E2E_21 Folkstone Rd` / `e2e00000-0000-4000-8000-000000000002` (internal rehearsal) |
| **Client user** | `e2e-client@blueleafbuilding.test` |
| **Result** | ☑ Conditional pass · ☐ Pass · ☐ Fail · ☐ Blocked |
| **Notes** | API layer green; browser blocked on fixture cleanup — staff browser pass on real pilot still required |
| **Sam sign-off** | ☐ Approved for supervised client pilot · ☐ Not approved |

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-27 | W18-UAT-EXEC-01 executed — CONDITIONAL PASS |
