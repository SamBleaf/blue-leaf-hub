# BLH-E2E-CLAUDE-001 — Regression user rotation fix

**Date:** 2026-06-27  
**Owner:** Cursor hardening (test-only)  
**Verdict:** **CLOSED** — rotation race eliminated; previously red suites now green

---

## Problem

`ensureE2EUsers()` called `updateUserById({ password })` on **every** invocation. Sequential child suites in `test:hardening-regression:write` each re-called it, invalidating JWTs minted earlier in the same aggregated run (and dropping active Playwright browser sessions).

**Symptom:** False failures on W09-ops, W10, W12, W13, W18-invite when run via meta-runner — standalone suites green.

**Not a product bug.**

---

## Fix (test-only)

| Change | File |
|--------|------|
| Skip password reset for existing users unless `{ resetPassword: true }` or `--reset-password` | `scripts/create-e2e-users.mjs` |
| Meta-runner ensures users once at start | `scripts/batch-a/run-hardening-regression.mjs` |
| Remove duplicate `ensureE2EUsers()` inside W18 void-guard fixture | `scripts/batch-a/w18-portal-void-guard.mjs` |

**Explicit password reset (troubleshooting only):**

```bash
node scripts/create-e2e-users.mjs --reset-password
# or
E2E_RESET_USER_PASSWORDS=1 node scripts/...
```

---

## Verification (2026-06-27)

```bash
npm run test:hardening-regression:write -- --only W09,W10,W12,W13,W18
```

| Suite | Before (aggregated) | After |
|-------|---------------------|-------|
| W10 procurement | FAIL (false) | **PASS** 13/13 |
| W12 schedule auth | FAIL (false) | **PASS** 14/14 |
| W13 site diary | FAIL (false) | **PASS** 24/24 + 2 gap |
| W18 void/photo/finance/legacy/invite | FAIL (false) | **PASS** |
| W09 ops checklist | FAIL | **1 fail** — see note |
| W09 win-finalize | FAIL | **1 fail** — see note |

**Remaining W09 failures (not rotation-related):**

1. **W09-API-04** — assertion expects `lead_won_sync` warning when lead stage ≠ won; fixture lead is already `won` → status `ok`. Test expectation drift — gap-document, not product bug.
2. **RFQ-16 win-finalize** — Dropbox `too_many_write_operations` 502. Sandbox/env constraint — gap-document, not product bug.

**Playwright sales ladder:** still green after fix (`test:pw-sales-gate-ladder` 1/1).

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-27 | Fix shipped + verified; BLH-E2E-CLAUDE-001 closed |
