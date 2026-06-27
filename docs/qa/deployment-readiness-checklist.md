# Blue Leaf Hub — Deployment Readiness Checklist

**Assessment date:** 2026-06-22  
**Assessor:** E2E QA sprint (automated + architectural review)  
**Overall verdict:** **Not ready for production client onboarding** — suitable for **controlled internal/staff beta** with known gaps

---

## How to use this checklist

- ✅ = verified by automated test or explicit audit this sprint  
- ⚠️ = partial coverage or known gap  
- ❌ = not verified / open blocker  
- Items marked ❌ are **not** implied passes

---

## Critical blocker

Must be resolved before real clients use the system.

| # | Item | Status | Notes |
|---|------|--------|-------|
| C1 | Client data isolation (portal v2) | ✅ | 29 adversarial + 8 Playwright API tests passing |
| C2 | Client cannot access staff APIs with same JWT | ✅ | `requireAuth` rejects `role=client` |
| C3 | No internal cost/margin leakage to client API | ✅ | Leak scan passing |
| C4 | Authentication on all write API routes | ❌ | Cron, RFQ send, Dropbox routes unauthenticated |
| C5 | Lead → job → project data integrity | ⚠️ | DB trigger (mig 096) exists; E2E UI flow not tested |
| C6 | Production secrets not in repo | ✅ | `.env` gitignored (manual verify) |
| C7 | RLS policies on sensitive tables | ⚠️ | Client RLS tested; full staff matrix not audited |
| C8 | CI test gate before deploy | ❌ | No GitHub Actions workflow |
| C9 | Dedicated test/staging Supabase project | ❌ | E2E runs against shared dev DB |
| C10 | Client portal variation/selection sign-off E2E | ❌ | Not implemented |

**Critical blockers open:** 4 of 10 fully unresolved (C4, C8, C9, C10)

---

## High priority

Required before wider staff rollout and first paying client projects.

| # | Item | Status | Notes |
|---|------|--------|-------|
| H1 | Admin login + core module page loads | ✅ | Playwright |
| H2 | Sales pipeline CRUD | ⚠️ | API read ✅; write needs `--write` |
| H3 | RFQ send + quote capture | ❌ | Requires email/Dropbox integration test |
| H4 | Schedule manager (Gantt, deps, EOT) | ❌ | Not E2E tested |
| H5 | Procurement PO issue flow | ❌ | Not E2E tested |
| H6 | Finance Command Centre / progress claims | ⚠️ | Seed data exists; UI not tested |
| H7 | WHS pack generation + site induction | ❌ | Not E2E tested |
| H8 | Workforce timesheet approval | ❌ | Not E2E tested |
| H9 | Supervisor role boundaries (no finance/sales) | ✅ | Route + API partial |
| H10 | Employee role boundaries | ⚠️ | Redirect tested; module sweep missing |
| H11 | Document template generation | ❌ | Migration 112; no E2E |
| H12 | Portal admin v2 (staff configure client view) | ❌ | Not E2E tested |
| H13 | Error handling — API returns `{ ok: false }` | ⚠️ | Convention documented; not systematically tested |
| H14 | Mobile client portal UX | ✅ | Nav + visual baseline |
| H15 | `APP_URL` correct for invite emails | ⚠️ | Critical-paths checks env; production value not verified here |

---

## Medium priority

Important for operational confidence; can follow initial beta.

| # | Item | Status | Notes |
|---|------|--------|-------|
| M1 | Fee proposal wizard (DOCX/PDF) | ❌ | |
| M2 | Marketing content approval workflow | ❌ | |
| M3 | Buildexact sync safety | ❌ | Staging credentials needed |
| M4 | IMAP quote matching | ⚠️ | Status endpoint only |
| M5 | Carpentry module | ❌ | |
| M6 | Cost intelligence / benchmarks | ❌ | |
| M7 | CRM + mailing lists | ❌ | |
| M8 | Control tower / facts queue | ❌ | |
| M9 | Worker PWA end-to-end | ❌ | |
| M10 | Legacy token portal `/portal/:token` | ❌ | |
| M11 | Field app `/field` | ❌ | |
| M12 | Tablet layout regression | ⚠️ | Project configured; minimal tests |
| M13 | Empty-state UX all modules | ❌ | |
| M14 | Duplicate prevention (RFQ, PO, project names) | ❌ | |
| M15 | Migration verify script in deploy pipeline | ⚠️ | `verify_migrations.mjs` exists; not in CI |

---

## Nice to have

Polish and long-term maintainability.

| # | Item | Status |
|---|------|--------|
| N1 | Visual regression all major pages | ⚠️ Login + portal mobile only |
| N2 | Performance / load testing | ❌ |
| N3 | Accessibility (WCAG) audit | ❌ |
| N4 | SOP Section 14 wired to Playwright | ❌ |
| N5 | Marketing intelligence external sync tests | ❌ |
| N6 | Video pipeline / media processing | ❌ |
| N7 | AI endpoint cost budgeting in CI | ❌ |
| N8 | Dropbox Smart Sync sequential read regression | ❌ |

---

## Ready for production

These areas have meaningful automated coverage **and** align with current architecture.

| Area | Evidence |
|------|----------|
| API server boots + health check | `GET /api/health` |
| Integration status endpoint | `GET /api/integrations/status` |
| Supabase auth sign-in (all 4 staff/client roles) | E2E users + Playwright login tests |
| Client portal v2 read surface + navigation | 54 Playwright tests |
| Client portal security model | adversarial_e2e.mjs (29 pass) |
| Portal v2 auth middleware boundaries | critical-paths + Playwright |
| Basic admin module reachability | Page load tests |
| ESLint zero-warnings policy | `npm run lint` (not run this sprint) |
| Production build | `npm run build` (not run this sprint) |

---

## Environment required for full QA

| Variable / service | Required for | Present in dev? |
|--------------------|--------------|-------------------|
| `VITE_SUPABASE_URL` + anon key | All E2E | Yes (assumed) |
| `SUPABASE_SERVICE_ROLE_KEY` | Seed + adversarial | Yes |
| `ANTHROPIC_API_KEY` | AI workflow tests | Optional |
| `DROPBOX_*` | Document/RFQ tests | Optional |
| `GMAIL_*` or `SMTP_*` | Email send tests | Optional |
| `BUILDEXACT_*` | Sync tests | Optional |
| `IMAP_*` | Quote poll tests | Optional |
| `APP_URL` | Invite link tests | Check production |
| Dedicated `E2E_SUPABASE_PROJECT_REF` | Safe CI | **Recommended — not enforced** |

---

## Sign-off recommendation

| Audience | Recommendation |
|----------|----------------|
| **Internal directors (admin)** | Acceptable for daily use with awareness of untested finance/RFQ edge cases |
| **Supervisors / field staff** | Acceptable for operations/diary/WHS with manual verification first |
| **Paying clients (portal v2)** | **Not yet** — complete C10 (variation/selection E2E) + C4 (API auth audit) |
| **Subcontractors / suppliers** | Email flows not E2E verified |
| **Production deploy (Vercel + Railway)** | Add CI + cron secret + staging smoke before go-live |

---

## Next actions (ordered)

1. **Ship cron/API auth hardening** — single biggest security gap  
2. **Add GitHub Actions** running `npm run test:e2e` + `npm run test`  
3. **Provision isolated Supabase test project** for CI  
4. **Implement portal variation approval E2E** — client contractual path  
5. **Run `/check`** (lint + build) and add to CI  
6. **Schedule manual UAT** for RFQ → PO → claim with real director  

---

*Update this checklist when blockers close. A checked box requires evidence in `e2e-test-report.md` or a linked test file.*
