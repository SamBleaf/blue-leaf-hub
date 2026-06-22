# Blue Leaf Hub — Scope of Works (2026‑06‑23)

**Purpose:** a single record of everything built across this body of work — traced back to your original live‑test dot points and the planning sessions that grew out of them — plus the per‑module deployability status and the in‑UI walkthrough plan we'll run until the Hub is deployable for the business.

**Source plans/notes folded in:**
- `~/.claude/plans/wiggly-herding-hinton.md` — Access + Supervisor field app + Templates registry + Carpentry overhaul (the main plan this body of work executed).
- `~/.claude/plans/resilient-bouncing-hummingbird.md` — Workforce + Worker‑PWA deployability remediation (parallel agent).
- `~/.claude/plans/parallel-questing-pony.md` + `MASTER_PLAN.md` — the broader Hub roadmap.
- `docs/portal_audit/*` — Client Portal v2 audits + fix plan.
- `docs/qa/*` — the Cursor E2E QA sprint (master plan, report, deployment‑readiness checklist, CI setup).
- `docs/templates/TEMPLATE_MASTER_AUDIT.md` — template audit (now superseded by the live registry).

---

## 1. Original live‑test dot points → status

| # | Your original ask | Status | Where |
|---|---|---|---|
| 1 | Finance **invoice PDF** wouldn't view | ✅ Done | In‑app PDF viewer (Option C) + IDOR guard |
| 2 | **Mobile Operations** scroll/layout | ✅ Done | Blueprint widget responsive + ops mobile pass |
| 3 | **Blueprint widget** broken on mobile | ✅ Done | Responsive fix |
| 4 | **Blue "+" FAB** created the wrong thing → "Site Task" | ✅ Done | FAB relabel + role gate |
| 5 | **Site tasks / voice / worker view** ("No tasks") | ✅ Done | Worker‑view job picker + authz fix; Whisper voice→tasks |
| 6 | **QC checklist** | ✅ Done (advisory) | Site‑task checklist + reminders; carpentry per‑stage base checklist; **supervisor/QC tasks (D3)** |
| 7 | **Josh access — URGENT** ("set up account" did nothing) | ✅ Done | Shared `appBaseUrl()` + invite‑link fix |
| 8 | **Timesheet snapshot** | ✅ Done | Completion snapshot |
| 9 | **RDOs** | ✅ Done (display‑only) | RDO display |
| — | Procurement "nothing works end‑to‑end" | ✅ Done | PO issue flow + draft guards + surfaced write errors |
| — | "supervisor mode is rubbish" + "can't find/edit templates" | ✅ Addressed | Became Workstreams A (field app) + B (registry) below |
| — | Carpentry import (Buildexact/XLSX) wrong | ✅ Done | Workstream D below |

---

## 2. Workstreams delivered (this body of work)

### A — Access levels + Supervisor **Field App**
- **A2/A3** Supervisor is now a genuine field role: no Sales/Tender/Finance/Marketing/cost in nav or by route; Admin relabelled "Director".
- **A4** Director‑only **API gates** (`/api/finance|sales|marketing|intelligence|cost‑intelligence|cost‑model|fee‑proposal|tender`) + the adversarial/QA **security cluster** (`/api/rfq/send`, `/api/subcontractor/lookup`, `/api/imap/quote‑poll`, `/api/cron/cost‑insights`, and an **`/api/carpentry` admin+supervisor gate**).
- **Cost‑stripped carpentry** for supervisors (build days/scope/tasks; no $).
- **A5 Field App** at **`/field`** (opt‑in, zero disruption): mobile‑first shell (`BaseLayout`) + **Home / Jobs / Tasks / WHS / Diary (with voice)**, role‑filtered via `can.*`. *Pending: phase 3 routing flip (your call), phase 4 read‑only admin preview.*

### B — Documents & Templates **registry**
- New **`document_templates`** table (mig 112), code catalogue (`templateCatalog.mjs`), `/api/templates` API, the **Documents & Templates** admin page (`/documents-templates`), per‑module Dropbox folders + master seeding, in‑Hub editing of email/markdown masters. *Pending: B7 read‑through generation + Dropbox webhook + template‑break health lint (needs one‑time webhook setup).*

### C — Template build set
- Audit refreshed to the refined reality + pointed at the live registry. *Pending: the 17‑item build — most are `planned` and blocked on your **content/legal** (small‑works contract, SOPA notice, onboarding/handover packs, warranty) or are large standalone features (WHS generate UI, insurance register, mandatory‑inspections register).*

### D — Carpentry module **overhaul** (complete)
- **D1** budget no longer auto‑seeds the flat line‑item list from the Buildexact API (+ markup‑inclusive sell from the Estimate‑Items XLSX; client contact).
- **D2** milestone **auto‑layout** from a commencement + frame‑delivery date, with crew‑size‑scaled build durations + procurement lead‑times (mig 116). 
- **D3** **supervisor/QC tasks** vs worker tasks (mig 115).
- **D4** worker‑task category = the job's labour budget streams (mig 114 + fix).
- **D5** **per‑category material actuals** (mig 113) — full budget vs actual.
- **D6** Actual Start derived from the first approved timesheet.

### Parallel (other agents, on `main`)
- **Workforce + Worker PWA** deployability: `/worker` PWA route + **RLS lockdown (mig 111)**, token‑in‑header, cost‑strip, error/offline states, iOS install token survival.
- **Client Portal v2** ecosystem cohesion + audits (portal_audit/*).
- **E2E QA sprint** (Playwright + adversarial) — see deployment‑readiness checklist.

---

## 3. Per‑module deployability status (going into the walkthrough)

| Module | Built/changed | Walkthrough status |
|---|---|---|
| Auth & roles | Supervisor scoping, route + API gates | ✅ **verified** — supervisor nav scoped (Home/Confirm/Settings only); `/finance` + `/sales` redirect to `/home`; supervisor token → `/api/finance` + `/api/sales` **403**, `/api/operations` allowed; `/carpentry` reachable |
| Field App `/field` | New (A5) | ✅ **verified + critical fix** — all 5 pages were **dead on load** (`supabaseConfigured` boolean called as a function → hung spinner); fixed all 4 files (commit `7de7f67`, pushed). Admin preview banner + nav render; supervisor view **cost‑stripped** (no `$`). *Pending: employee role pass; A5 phase‑3 routing (supervisor still lands `/home`, not `/field`).* |
| Carpentry | D1–D6 (import, budget, schedule, tasks, actuals) | ✅ **verified** — D1 budget = 6 real categories (not the 100‑line‑item bug); D2 auto‑layout panel (commencement + frame‑delivery + 16 milestones); D5 material budget‑vs‑actual + Variance; D4 task category = labour streams; D3 worker/supervisor toggle; burn‑rate **live** (7 staff · 21 days @ margin → cost model synced) |
| Documents & Templates | New registry (B) | ✅ **verified** — 40 templates across all 9 module groups, 19 "not built", module/status filters, "Set up Dropbox folders" present |
| Operations / Schedule / Site Diary / WHS | existing + site‑task/voice fixes | ◐ **smoke‑clean** (loads, no errors) — deep workflow test pending |
| Workforce / Worker PWA | hardened (parallel) | ◐ **smoke‑clean** — deep test (timesheet→actuals, PWA token) pending |
| Finance | invoice viewer + API gate | ◐ **smoke‑clean** — invoice‑viewer deep test pending; ⚠ dev DB has `__DRYRUN_*`/`__E2E_*` job pollution to clean |
| Sales / Tender / Procurement / Marketing | gated admin‑only; procurement PO fix | ◐ **smoke‑clean** (all render: Sales Pipeline, Cost Intelligence, Subcontractors, Content Studio) — deep test pending |
| Client Portal v2 | isolation verified (QA) | ✅ strongest area (QA) |

### Walkthrough log — session 1 (2026‑06‑23)
- **Env:** preview Vite on **:5180** proxying to the existing API (:8787) — non‑destructive (didn't disturb the running dev server). E2E users seeded (`e2e-admin/supervisor/employee/client` @ `…blueleafbuilding.test`).
- **Found + fixed (critical):** the entire Field App (A5) was non‑functional — `supabaseConfigured` is an exported **boolean const**, but FieldHome/Diary/Tasks/WHS all invoked it as `supabaseConfigured()`, throwing on mount; with no `try/catch` the load promise rejected and the spinner never cleared. Fixed across all 4 files + added `try/catch/finally` robustness to FieldHome. Shipped `7de7f67`.
- **Security confirmed solid:** supervisor cannot reach finance/sales by nav, URL, or API; field view is cost‑stripped.
- **Data cleanup owed (end of walkthrough):** `__E2E_*` (mine) via `E2E_CLEANUP=true`; `__DRYRUN_*` + `__DEMO_DELETED` artifacts (from QA/earlier sessions — confirm with Sam before removing).

---

## 4. Migrations to apply (manual, in order)
Applied earlier: 109, 111, 112, 113. **New + pending: 114** (site_tasks labour categories) · **115** (site_tasks task_audience) · **116** (carpentry crew overrides).

---

## 5. Deployment gaps (from the QA checklist, updated)
- **C4 unauth write routes** — the confirmed ones are now **fixed** (rfq/send, subcontractor‑lookup, imap‑poll, cron‑cost‑insights, carpentry). Residual: audit any remaining inline Dropbox/legacy routes.
- **C5 lead→job→project** + **C10 portal variation/selection sign‑off** — **untested in the UI** (this walkthrough covers them).
- **C8 CI gate** + **C9 dedicated test DB** — infra (owned by the QA stream).

---

## 6. In‑UI walkthrough plan (what we run until deployable)
For each module, with **realistic seed data** (prefixed so it's removable) and **cleanup as we go**:
1. **Set up** — start the dev server, seed E2E users + a realistic Brighton job/project, log in per role.
2. **Walk the workflow** in the browser — navigate, create, edit, verify the screen + the data, screenshot proof.
3. **Verify access** — each role sees only what it should; gated routes 403.
4. **Clean up** — remove the seed rows for that scenario before the next.

**Module order:** Auth/roles → Field App → Carpentry (import→budget→schedule→tasks→actuals) → Documents & Templates → Operations/Schedule/Diary/WHS → Workforce/Worker PWA → Finance → Sales/Tender/Procurement → Client Portal. Findings are fixed inline and re‑verified; this doc's §3 table is ticked off as each module passes.
