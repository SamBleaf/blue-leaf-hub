# NEXT CLAUDE REVIEW

**Status:** ACTIVE — Cursor completed `UI-UX-POLISH-WAVE-01B` (2026-06-28)

## Cursor delivery summary

| Item | Verdict requested |
|------|-------------------|
| **Scope guard** | Confirm all changes presentational-only (no behaviour/API/auth/schema/schedule-logic) |
| **Items 1–7** | UI-NAV-001 · UI-FINANCE-001/002/003 · UI-PORTAL-001 · UI-CRM-002 · UI-SCHEDULE-001 · UI-WORKFORCE-001 · UI-SALES-001 → **closed** |
| **Item 8 (badge)** | Partial StatusBadge migration (Finance claims + CRM contacts); confirm acceptable partial close |
| **UI-TENDER-001** | Remains accepted gap |
| **UI-VISUAL-001** | Partial — other modules still inline badges |

## Tests

- `npm run lint` ✅
- `npm run build` ✅
- `npm run test:ui-review` **171/171** ✅

## Evidence

- [UI_UX_POLISH_WAVE_01B_RESULT.md](../ui_review/UI_UX_POLISH_WAVE_01B_RESULT.md)
- Screenshots: `docs/ui-review/screenshots/` (mobile: `finance-command-centre`, `schedule-manager`, `crm-contacts`, `sales-pipeline`, `portal-home`, `workforce`)

## Product files touched

`AppShell.jsx` · `JobCommandCentre.jsx` · `ProgressClaims.jsx` · `ClientHome.jsx` · `CrmContacts.jsx` · `ScheduleToolbar.jsx` · `WorkforceKpiStrip.jsx` · `SalesPipeline.jsx` · `statusBadge.js`

## Claude tasks

1. Spot-check diffs for scope violations (especially Finance KPI helper — display only).
2. Update lock matrix final states if evidence confirms LOCKED.
3. Decide next wave: full StatusBadge rollout (01C?) vs module hardening vs SOP audit.
4. Write next agent packet (`NEXT_CURSOR_TASK.md` or Fix-Agent lane if behaviour bugs found).

**Approval required before next product-code wave:** Yes (standard gate — presentational 01B was pre-approved).
