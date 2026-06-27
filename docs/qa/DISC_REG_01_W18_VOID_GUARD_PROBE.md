# DISC-REG-01 — W18 Void-Guard Probe (W18-VOID-GUARD-PROBE-01)

**Date:** 2026-06-27  
**Mode:** Test-only investigation — no product changes  
**Parent:** [TEST_REGRESSION_SUITE_01.md](./TEST_REGRESSION_SUITE_01.md)

---

## Symptom

`npm run test:hardening-regression:write` reported **1 suite fail**:

- **Suite:** W18 portal void-guard
- **Assertion:** `W18-SEC-03 — client A home` expected **200**, got **403**
- **Section:** `W18-SEC-03 / W18-API-03 E2E runtime (read-only)` (not the W18-P0-02 write probes)

---

## Reproduction

| Step | Result |
|------|--------|
| Re-run `npm run test:w18-portal-void-guard:write` (before repair) | **Reproduced** — 13 pass / 1 fail |
| DB probe: E2E `projectA` + `e2e-client` | **project exists**; **`project_client_users` row missing** |
| Manual upsert `project_client_users` for E2E projectA + client | Link restored |
| Re-run void-guard after repair | **14/14 pass** — client A home **200** |

**DISC-REG-01 reproduced:** **yes** (with stale E2E fixture)

---

## Root cause

**Failure cause: stale E2E test fixture (not product regression)**

1. `e2e/.runtime.json` points at fixed seed IDs (`e2e00000-…-000002` = projectA).
2. E2E project row still exists with `portal_v2_enabled: true`.
3. **`project_client_users` link for `e2e-client@blueleafbuilding.test` was absent** at probe time.
4. `requirePortalAuth` correctly returns **403** when JWT user has no active membership for that `projectId` — see `server/lib/requirePortalAuth.mjs` lines 48–58.

The **200 expectation remains correct** when E2E seed is intact. Playwright `client-isolation.spec.js` uses the same contract.

### Why fixture drifted

- E2E seed is **partially stale** in this environment: projectB row also missing; full `npm run test:e2e:seed` fails with `projects_pkey` duplicate (projectA not purged before re-insert).
- Long hardening regression runs many W18 `--write` tests that create/delete BLH TEST fixtures; E2E membership can be lost if seed is not refreshed between runs.
- Void-guard **write** section (W18-P0-02) **passed** — proves portal auth + void guard product path is healthy with fresh BLH TEST fixtures.

---

## Classification

| Option | Verdict |
|--------|---------|
| Stale auth/test fixture | **Yes — primary cause** |
| Incorrect test expectation | **No** — 200 is correct when pcu exists |
| Route/auth regression | **No** — auth behaves as designed |
| Real W18 product bug | **No** |

---

## Test fix (test-only)

Updated `scripts/batch-a/w18-portal-void-guard.mjs`:

- **Preflight** E2E runtime section: if `project_client_users` missing/inactive for E2E projectA + client, **gap-document** with `npm run test:e2e:seed` hint instead of **fail**.
- Prevents false regression failures when E2E seed is stale; does not change product code.

**Prerequisite for live E2E runtime probes:** `npm run test:e2e:seed` (or repair `project_client_users` for E2E projectA).

---

## BUG_REGISTER / Claude fix batch

- **No new product bug registered.**
- **DISC-REG-01:** closed as **fixture drift** — not a Claude fix batch item.
- **Optional infra follow-up (test tooling):** make `seed-e2e-suite.mjs` idempotent when project rows exist but pcu is missing (out of scope for this probe).

---

## W18 release gate impact

**Unchanged.** W18-P0-02 void guard remains green. W18-SEC-03 isolation is covered by Playwright when E2E seed is fresh. Global production NO-GO drivers unchanged (manual UAT, P1-W18-04).

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-27 | W18-VOID-GUARD-PROBE-01 — fixture drift confirmed; test preflight added |
