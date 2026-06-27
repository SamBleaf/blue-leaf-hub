# Hardening Update Test Log — 2026-06-25

Verification run for ChatGPT review zip (`blue-leaf-hub-hardening-update-2026-06-25.zip`).

**Run date:** 2026-06-25  
**Branch state:** Uncommitted Batch B hardening (P0-B1 through P0-B3)

---

## Summary

| Command | Result | Passed | Failed | Skipped | Gap-documented |
|---------|--------|--------|--------|---------|----------------|
| `npm run build` | **pass** (re-run) | — | — | — | chunk size warning only |
| `npm run test:w06-finalize:write` | **pass** | 9 | 0 | 0 | 1 |
| `npm run test:w06-shape:write` | **pass** | 7 | 0 | 0 | 2 |
| `npm run test:w08-accept:write` | **pass** | 18 | 0 | 0 | 5 |
| `npm run test:w07-matcher` | **pass** | 24 | 0 | 0 | 0 |
| `npm run test:batch-a` | **pass** | 14 | 0 | 13 | 10 |
| `npm run test:batch-a:write` | **pass** | 22 | 0 | 0 | 6 |
| `npm run test:e2e -- e2e/tests/workflows/batch-a` | **pass** (re-run) | 5 | 0 | 2 | — |

---

## Command details

### `npm run build`

- **Result:** pass (re-run outside sandbox after initial PWA/service-worker flake)
- **Notes:** Vite build + PWA generateSW succeeded. Non-blocking chunk size warning (>500 kB main bundle).
- **First attempt:** fail — workbox/terser early exit in sandboxed environment.

### `npm run test:w06-finalize:write`

- **Result:** pass
- **Summary:** 9 passed, 0 failed, 1 gap-documented
- **Gap:** W06-API-07 UI recovery smoke (RfqEngine retry banner — manual, not in script)

### `npm run test:w06-shape:write`

- **Result:** pass
- **Summary:** 7 passed, 0 failed, 2 gap-documented
- **Gaps:** W06-UI-02 legacy snake_case baseline; empty trade intel on fixture job

### `npm run test:w08-accept:write`

- **Result:** pass
- **Summary:** 18 passed, 0 failed, 5 gap-documented
- **Gaps:** W08-API-04 scope/package rollup (W08-DRIFT-005); W09-UI-05 manual win wizard smoke; matcher/mail transport unchanged baseline

### `npm run test:w07-matcher`

- **Result:** pass
- **Summary:** 24 passed, 0 failed, 0 gaps (`--strict`)
- **Covers:** W07-API-06, MATCH-09/11/20/20-thread, regressions MATCH-03/04

### `npm run test:batch-a`

- **Result:** pass
- **Summary:** 14 passed, 0 failed, 13 skipped (require `--write`), 10 gap-documented

### `npm run test:batch-a:write`

- **Result:** pass
- **Summary:** 22 passed, 0 failed, 6 gap-documented
- **Gaps:** W01-SEC-003 rate limit; W02 stage/lost stamping; W03 PTSA handoff; W05-DRIFT-003 package-only board progress

### `npm run test:e2e -- e2e/tests/workflows/batch-a`

- **Result:** pass (re-run after `npx playwright install chromium`)
- **Summary:** 5 passed, 2 skipped, 0 failed
- **Skipped:** W03-UI-03 PTSA visibility (gap documented); W05-E2E-01 full win → Operations path
- **First attempt:** fail — Playwright browser binary missing in sandbox (`chrome-headless-shell` not installed)

---

## Known non-blocking gaps (Batch B)

- W06-API-07 UI retry smoke — manual
- W08-DRIFT-004 / W09-DRIFT-002 — mitigated by P0-B2 warn-only; bidirectional sync not fixed
- W08-DRIFT-005 — accept does not roll up scope/package
- W09-UI-05 — Mark Won alignment panel manual smoke
- W07-DRIFT-002 — email-only recipients still unmatched by IMAP
- W07-DRIFT-007 — first IMAP poll backlog skip
- W07-DRIFT-008 — manual resolve no PDF/amount import
- W05-DRIFT-003 — Tender Board rfqs-only progress (package-only invisible)

---

## npm scripts added for hardening

| Script | Command |
|--------|---------|
| `test:w06-finalize:write` | `node scripts/batch-a/run-w06-finalize.mjs --write` |
| `test:w06-shape:write` | `node scripts/batch-a/run-w06-shape.mjs --write` |
| `test:w08-accept:write` | `node scripts/batch-a/run-w08-accept-alignment.mjs --write` |
| `test:w07-matcher` | `node scripts/test-imap-quote-match.mjs --strict` |
