# NEXT CURSOR TASK (STAGED — DO NOT RUN UNTIL UNLOCKED)

**Task ID:** `UI-UX-POLISH-WAVE-01B` · **Mode:** presentational-only UI polish (product code)
**Date staged:** 2026-06-28 · **Issued by:** Claude Code (Hardening Controller)

> ⛔ **GATED.** This task is **staged, not active.** Do not start until **all** of:
> 1. Sam approves Decision 1 in [SAM_APPROVAL_REQUIRED.md](./SAM_APPROVAL_REQUIRED.md),
> 2. BLOCKER 0 is cleared (the unrelated `scheduleRoutes.mjs` + `ScheduleSheet.jsx` edits are
>    committed/stashed → clean tree), and
> 3. [CURRENT_STATE.md](./CURRENT_STATE.md) shows `next_agent: cursor`,
>    `product_code_changes_allowed: true`, `approval_required: false`.
> Until then `next_agent: sam` and `hardening:watch --dry-run` will report run-blocked (exit 2).

## Objective
Apply **presentational-only** polish to the Sales standard for the approved modules. **Preserve
every behaviour:** endpoints, response shapes, server routes, auth/role logic, calculations,
mutation behaviour, prod data flow, integrations, schema/migrations.

## Scope (approved plan — confirm Sam's final selection before starting)
| Order | Module | IDs | Presentational change |
|------|--------|-----|----------------------|
| 1 | AppShell | UI-NAV-001 | scrollable / "More" mobile bottom nav |
| 2 | Finance | UI-FINANCE-001/002/003 | empty-state KPI copy · mobile claims cards · single FAB |
| 3 | Client Portal | UI-PORTAL-001 | fix em-dash title |
| 4 | CRM | UI-CRM-002 | mobile card layout for contacts |
| 5 | Schedule | UI-SCHEDULE-001 | mobile toolbar overflow menu |
| 6 | Workforce | UI-WORKFORCE-001 | empty-state copy |
| 7 | Sales | UI-SALES-001 | KPI label/help alignment (skip if Sam accepts as gap) |
| 8 | Design system | UI-VISUAL-001 | shared status-badge component — **SEPARATE sub-batch, LAST**, with screenshot diffs |

## Hard rules
- **Presentational only.** If a fix needs behaviour/API/schema/auth/calc/mutation/integration →
  **STOP and log to BUG_REGISTER** (becomes Fix-Agent work under separate Sam approval).
- **Do not redesign Sales** — it is the reference; only the UI-SALES-001 label/help tweak.
- **Marketing stays paused.** Do not touch `/marketing/*`.
- Run `npm run lint` + `npm run build` + `npm run test:ui-review` after each module; capture
  before/after screenshots into the evidence index.
- Item 8 (shared badge) is its own commit, last, after 1–7 are green.

## Allowed files
- Presentational `src/**` components/styles for the approved modules · `src/ui-review/**`
  (fixtures/harness) · `e2e/**` · `docs/qa/**`.

## Forbidden
- `server/**`, `supabase/migrations/**`, route/table renames, broad refactor, any behaviour change.
- The unrelated schedule files from BLOCKER 0 (do not touch).

## Expected outputs
- Module-by-module polish result doc · updated [../ui_review/UI_MODULE_LOCK_MATRIX.md](../ui_review/UI_MODULE_LOCK_MATRIX.md)
  (CONDITIONAL → LOCKED as items close) · updated evidence index · BUG_REGISTER status updates ·
  `lint`/`build`/`test:ui-review` green.
- Update loop state (`next_agent: claude`), append [AGENT_HANDOFF_LOG.md](./AGENT_HANDOFF_LOG.md),
  write [NEXT_CLAUDE_REVIEW.md](./NEXT_CLAUDE_REVIEW.md).

## Commit rule
Presentational only: `feat(ui): 01B polish — <modules>` (badge sub-batch as its own commit).
**No `server/**`/migrations; no behaviour change.**

## Final report format
`task done · modules polished · IDs closed · lint/build/test:ui-review result · any stop+log
items · next agent (claude) · next task file · approval required (y/n)`.
