# Blue Leaf Hub — E2E Test Report

**Last run:** 2026-06-22  
**Environment:** Local (`localhost:5174` + `localhost:8787`)  
**Supabase:** Shared dev project (`.env`) — **not an isolated test DB**  
**Runner:** Playwright 1.x + legacy Node API scripts

---

## Summary

| Suite | Passed | Failed | Skipped | Total |
|-------|--------|--------|---------|-------|
| Playwright (`npm run test:e2e`) | **54** | **0** | 0 | 54 |
| Critical paths (`npm run test`) | **25** | **0** | 4 | 29 |
| Adversarial portal (`adversarial_e2e.mjs`) | **29** | **0** | 0 | 29 |
| **Combined automated** | **108** | **0** | 4 | 112 |

**Important:** Passing automated tests cover **~15% of the full workflow surface** defined in `E2E_TESTING_MASTER_PLAN.md`. Absence of a test = **not verified**, not passed.

---

## Tested areas (with evidence)

### Authentication & route protection ✅

| Test | Result |
|------|--------|
| Unauthenticated → `/sales`, `/finance`, `/client-portal` redirects to login | Pass |
| Admin login → `/sales` accessible | Pass |
| Client login → `/client-portal` | Pass |
| Client blocked from `/finance` | Pass |
| Employee → supervisor/operations route | Pass |
| Supervisor blocked from `/sales` | Pass |
| `GET /api/sales/leads` without token → 401 | Pass |

### Client Portal v2 — navigation ✅

| Page | Desktop | Mobile |
|------|---------|--------|
| Home | Pass | Pass |
| Actions | Pass | Pass |
| Journey | Pass | Pass |
| Selections | Pass | Pass |
| Documents | Pass | Pass |
| Messages | Pass | Pass |
| Seeded actions visible | Pass | Pass |
| No internal cost text in DOM | Pass | Pass |

### Client Portal v2 — API security ✅

| Test | Result |
|------|--------|
| Client A reads own `/home` | Pass |
| Client A blocked from project B (403) | Pass |
| `my-projects` returns only own project | Pass |
| Selections API hides `internal_notes`, supplier cost | Pass |
| Client JWT blocked from CRM, finance | Pass |
| Client blocked from portal admin v2 | Pass |
| PostgREST: client cannot read `jobs`, `crm_contacts`, `job_variations` | Pass (adversarial) |
| IDOR document download cross-project | Pass (adversarial) |
| Cross-project variation/claim writes | Pass (adversarial) |

### Admin workflow reads ✅ (shallow)

| Test | Result |
|------|--------|
| Sales pipeline page loads | Pass |
| Operations list loads | Pass |
| Finance manager loads | Pass |
| Workforce page loads | Pass |
| API: sales leads array | Pass |
| API: finance jobs | Pass |
| API: E2E seeded lead retrievable | Pass |
| Supervisor API blocked from finance jobs | Pass |

### API smoke ✅

| Endpoint | Result |
|----------|--------|
| `GET /api/health` | Pass |
| `GET /api/integrations/status` | Pass |
| Portal v2 auth boundaries (401) | Pass |
| `POST /api/cron/portal-sync` | Pass |

### Visual regression ✅ (baselines created 2026-06-22)

| Screenshot | Result |
|------------|--------|
| Login desktop | Baseline created |
| Client portal home mobile | Baseline created |

---

## Skipped / not run

| Test | Reason |
|------|--------|
| `POST /api/schedule/generate` (AI) | Requires `--ai` flag + Anthropic tokens |
| `POST /api/blueprint/chat` | Requires `--ai` |
| `POST + DELETE /api/sales/leads` | Requires `--write` flag |
| Portal admin summary (critical-paths) | Finance jobs response shape — no `project_id` in first row |

---

## Missing tests (not implemented — treat as NOT VERIFIED)

### P0 — deployment blockers if untested before go-live

- [ ] Lead create → qualify → convert to job (full UI)
- [ ] RFQ package create → send → quote received (IMAP/Dropbox)
- [ ] Fee proposal wizard → PDF/DOCX generation
- [ ] Schedule create → dependency edit → EOT raise
- [ ] Procurement: generate plan → draft PO → issue PO
- [ ] WHS engine: questionnaire → SWMS PDF export
- [ ] Finance: progress claim create → approve → invoice state
- [ ] Portal: client approves variation (writes + audit log)
- [ ] Portal: client selects splashback option
- [ ] User invite flow (`/accept-invite/:token`)
- [ ] Worker PWA magic-link timesheet submit
- [ ] Site induction public form `/induct/:projectId`
- [ ] Unauthenticated cron/dropbox/rfq route audit

### P1 — high priority

- [ ] Marketing: AI generate → approval gate → no accidental publish
- [ ] Document templates: generate with placeholders
- [ ] Carpentry module job lifecycle
- [ ] Confirm queue (facts service)
- [ ] Control tower findings
- [ ] Buildexact sync (staging credentials)
- [ ] Email outbound (Gmail/SMTP) in test env
- [ ] Tablet viewport full module sweep
- [ ] Empty-state UX (zero leads, zero projects)

### P2 — medium

- [ ] Cost intelligence benchmarks
- [ ] CRM mailing list send (Resend)
- [ ] Marketing intelligence sync (GSC/GA4)
- [ ] Reference projects CRUD
- [ ] Legacy token portal `/portal/:token`

---

## Failed tests

**None** in last run.

---

## Critical bugs found during QA setup

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| QA-001 | **High** | Multiple `dev-api.mjs` routes lack `requireAuth` (`/api/rfq/send`, `/api/cron/*`, Dropbox uploads, IMAP poll) | Open — not fixed in this sprint |
| QA-002 | **Medium** | `test_client_setup.mjs` documents port `5173` but Vite uses `5174` | Open |
| QA-003 | **Medium** | `seed-e2e-suite` must insert job as `tendering` before project — mig 096 auto-project trigger breaks naive seed | **Fixed** in seed script |
| QA-004 | **Low** | Playwright browsers need `PLAYWRIGHT_BROWSERS_PATH=0` on Apple Silicon | **Fixed** in npm scripts |
| QA-005 | **Info** | Critical-paths portal admin test skips when finance jobs lack `project_id` | Open |

---

## Security risks (adversarial review)

| Risk | Severity | Mitigation tested? |
|------|----------|-------------------|
| Client sees `cost_to_builder` / `internal_notes` | Critical | **Yes — passing** |
| Client cross-project IDOR | Critical | **Yes — passing** |
| Client JWT on staff APIs | Critical | **Yes — passing** |
| Unauthenticated cron invocation | High | **Not mitigated** — endpoint returns 200 |
| Direct PostgREST enumeration | High | Client blocked; staff not fully audited |
| Legacy unauthenticated RFQ/Dropbox routes | High | **Not tested** |

---

## UX issues observed (manual + E2E)

| Issue | Severity | Notes |
|-------|----------|-------|
| Mobile portal bottom nav uses abbreviated labels ("Select", "Docs") | Info | Tests updated to match — document for QA |
| Role picker on first admin login | Info | Tests dismiss via `blhub_role` localStorage |
| Finance jobs API may not expose `project_id` for portal admin smoke | Low | Affects test script only |

---

## Deployment blockers (from testing — not exhaustive)

1. **Unauthenticated write-capable API routes** — must audit before public deploy
2. **No CI gate** — regressions can ship undetected
3. **Major workflows untested in browser** — sales→won, RFQ, PO, WHS PDF, claims
4. **Shared Supabase dev DB** — E2E writes real data; use dedicated test project for CI
5. **No production smoke test** after Vercel/Railway deploy

---

## Recommended fixes (priority order)

1. Add `CRON_SECRET` / `requireAuth` to all cron and legacy inline routes in `dev-api.mjs`
2. Wire `npm run test:e2e` into GitHub Actions against a **dedicated Supabase test project**
3. Implement P0 workflow specs (sales convert, portal variation approve, procurement PO)
4. Fix `test_client_setup.mjs` port reference (`5174`)
5. Add `E2E_REQUIRE_TEST_PROJECT=true` to CI env
6. Map SOP Section 14 scripts to Playwright test cases per module

---

## Next test priorities

1. `e2e/tests/workflows/sales-lead-lifecycle.spec.js` — create lead, move stage, convert
2. `e2e/tests/workflows/portal-variation-approve.spec.js` — client action → audit log
3. `e2e/tests/security/unauthenticated-routes.spec.js` — assert 401 on all cron/send routes
4. `e2e/tests/workflows/procurement-po.spec.js` — admin only issue PO
5. `e2e/tests/workflows/whs-induction.spec.js` — public induction + WHS pack

---

## How to reproduce this report

```bash
node scripts/create-e2e-users.mjs
node scripts/seed-e2e-suite.mjs
PLAYWRIGHT_BROWSERS_PATH=0 npm run test:e2e
npm run test
node scripts/adversarial_e2e.mjs
```

Update this file after each full QA run. **Do not mark workflows as passed unless a test exists and ran green.**
