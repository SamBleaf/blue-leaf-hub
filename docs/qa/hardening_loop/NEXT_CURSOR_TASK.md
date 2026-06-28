# NEXT CURSOR TASK — ACTIVE

**Task ID:** `UI-UX-POLISH-WAVE-01B` · **Mode:** presentational-only UI polish (product code)
**Date staged:** 2026-06-28 · **Released:** 2026-06-29 · **Issued by:** Claude Code (Hardening Controller)

> ✅ **APPROVED & RELEASED (Sam, 2026-06-29).** Preconditions met: 01B approved (items 1–7 + badge
> last); **BLOCKER 0 cleared** (schedule edits committed in `d7dbd3e` → clean tree);
> [CURRENT_STATE.md](./CURRENT_STATE.md) = `next_agent: cursor`, `product_code_changes_allowed: true`,
> `approval_required: false`. `hardening:watch --dry-run` → READY. **Cursor may run from this packet.**
>
> **Sam scope (2026-06-29):** items 1–7 approved; **UI-TENDER-001 accepted as a gap** (dropped from
> 01B); **UI-SALES-001 = the cheap label-clarity fix** (keep, it's presentational); shared badge
> (UI-VISUAL-001) **last, own sub-batch** after 1–7 pass screenshots. **No behaviour/API/auth/schema/
> calc/mutation/RFQ/PO/Buildxact/Xero/Dropbox/Gmail/Resend/WHS/workforce-logic/client-portal-access/
> schedule-logic changes** (do not touch the just-landed commit-on-blur logic). Marketing paused.

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
| 7 | Sales | UI-SALES-001 | KPI label/help alignment (cheap clarity fix — **keep**, per Sam) |
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
