# NEXT CURSOR TASK

**Task ID:** `UI-UX-USABILITY-WAVE-01A` · **Mode:** no-code discovery · **Date issued:** 2026-06-28
**Issued by:** Claude Code (Hardening Controller) · **Governed by:**
[../COMPREHENSIVE_HARDENING_MASTER_PLAN.md](../COMPREHENSIVE_HARDENING_MASTER_PLAN.md),
[../FULL_E2E_HARDENING_STRATEGY.md](../FULL_E2E_HARDENING_STRATEGY.md),
[../AUTONOMOUS_HARDENING_AGENT_PLAYBOOK.md](../AUTONOMOUS_HARDENING_AGENT_PLAYBOOK.md) (UI/UX Agent, Mode 01A).

## Objective
Run the **UI/UX usability + visual discovery sweep** across the Hub. Assess each module against
the **Sales reference standard** and the first-viewport rubric, capture visual evidence across
desktop/tablet/mobile, classify each module's UI lock status, and **log every finding to
BUG_REGISTER**. **Do not fix anything.**

## Wave 01A scope confirmations (Sam, 2026-06-28)
- **Sales** is the reference standard — **do not redesign unless a regression is found** (#9).
- **Client Portal = light-touch verification only** (#10): confirm it renders and is usable;
  only open findings if the audit surfaces a **real** issue in one of — deployability,
  **access/client isolation**, **mobile usability**, **document/selections clarity**, or a
  **client-action** (variation/EOT/question) problem. Do **not** do a full cosmetic pass on the
  portal.
- **Marketing** — record only `MARKETING — PAUSED UNTIL MERGE` (#11); do not assess.
- This stays **no-code discovery** (#6/#7): no product code, layout, route, API, auth, mutation,
  calc, **schema**, or integration changes.

## Preflight
- `git branch --show-current` → must be `portal-v2`.
- `git status --short` → clean (or only this loop's docs). Stop if unrelated dirty files.

## Module priority order
1. **Sales** (reference check only — **do not redesign unless a regression is found**)
2. Tender / RFQ
3. Operations / Project Command Centre
4. Schedule
5. Procurement
6. Finance
7. Workforce
8. Field / Worker App
9. WHS
10. **Client Portal — light-touch verification only** (see scope note; findings only on a real issue)
11. CRM / Mailing List
12. **Marketing — DO NOT ASSESS. Record `MARKETING — PAUSED UNTIL MERGE`.**

## For each module
- Capture screenshots: desktop **1440×900**, tablet **834×1112**, mobile **390×844**; states
  good/loaded · empty · blocked/needs-action · overdue/risk · (loading/error/permission where practical).
- Score the **first-viewport rubric**: Where am I? · What matters now? · What is blocked? · What
  needs action? · What happens next?
- Score the **Sales-standard scorecard** (clear home · action queue · KPI strip · one obvious
  next action · status/phase awareness · empty/loading/error states · mobile cards/tabs not
  squeezed tables · no undefined/null/test-data leaks · consistent Blue Leaf styling).
- Flag demo/live masking risk (demo data hiding a live-empty state).
- Assign a lock status: UI LOCKED / CONDITIONAL / NO-GO (default NOT ASSESSED until reviewed).

## Allowed files
- `docs/qa/ui_review/**` (the 3 result/matrix/index docs)
- `docs/qa/BUG_REGISTER.md`
- `docs/qa/hardening_loop/**` (state + log + next-review packet)
- `e2e/ui-review/**` and `e2e/tests/visual/**` fixtures **only if** a safe, additive screenshot
  fixture is needed (test-only).

## Forbidden
- **No product code:** `src/**`, `server/**`, `supabase/migrations/**`.
- No layout/handler/API/route/auth/calc/mutation changes; no integrations; no email/RFQ/PO; no deploy.
- **No fixes** — log to BUG_REGISTER instead.
- Do not assess or touch Marketing beyond recording the paused status.

## Tests to run (read-only / capture-only)
- `npm run test:ui-review`
- Visual capture via Playwright `chromium-mobile` / `chromium-tablet` projects (local; not CI).
- These **capture screenshots only** — no app mutation, no live integration.

## Bug logging format (per finding)
`UI-<MODULE>-###` · `Type:` one of {UI-USABILITY, UI-MOBILE, UI-EMPTY-STATE, UI-LOADING-STATE,
UI-ERROR-STATE, UI-DEMO-LIVE, UI-NAVIGATION, UI-WORKFLOW-CLARITY, UI-ACTION-CLARITY,
UI-ACCESSIBILITY, UI-VISUAL-REGRESSION} · severity · module/owner · route/screen · role ·
viewport · expected vs actual · screenshot/evidence path · suggested visual/regression test ·
`blocks-deployability (y/n)`.

## Stop conditions
- Any finding that would need a behaviour/API/auth/calc/schema/integration change → **log it,
  don't fix.**
- Any [forbidden task class](../HARDENING_WATCH_ORCHESTRATOR_SPEC.md#5-forbidden-autonomous-task-classes)
  → stop + write `SAM_APPROVAL_REQUIRED.md`.
- Dirty tree with unrelated work; missing QA docs.

## Expected output docs
- [../ui_review/UI_UX_DISCOVERY_WAVE_01_RESULT.md](../ui_review/UI_UX_DISCOVERY_WAVE_01_RESULT.md) (filled)
- [../ui_review/UI_MODULE_LOCK_MATRIX.md](../ui_review/UI_MODULE_LOCK_MATRIX.md) (statuses set)
- [../ui_review/UI_SCREEN_EVIDENCE_INDEX.md](../ui_review/UI_SCREEN_EVIDENCE_INDEX.md) (rows + paths)
- [../BUG_REGISTER.md](../BUG_REGISTER.md) (findings)
- Update [CURRENT_STATE.md](./CURRENT_STATE.md) + [AUTONOMOUS_LOOP_STATUS.md](./AUTONOMOUS_LOOP_STATUS.md)
  (set `next_agent: claude`), append [AGENT_HANDOFF_LOG.md](./AGENT_HANDOFF_LOG.md), and write
  [NEXT_CLAUDE_REVIEW.md](./NEXT_CLAUDE_REVIEW.md).

## Commit rule
Docs + test-only fixtures only: `docs(qa): UI/UX discovery wave 01A — <modules covered>`.
**No product code in this commit.**

## Final report format
`task done · files changed · tests/screenshots run · blockers · next agent (claude) ·
next task file (NEXT_CLAUDE_REVIEW.md) · approval required (y/n)`.

## After this task
Claude assembles the **module-polish plan** from the findings and presents it to Sam. **Wave 01B
(presentational polish) does not start until Sam approves that plan.**
