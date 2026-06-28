# UI/UX Polish Wave 01B — Result

**Run ID:** `BLH-UIUX-01B-2026-06-28-1`  
**Agent:** Cursor · **Wave:** `UI-UX-POLISH-WAVE-01B`  
**Scope:** Presentational-only (Sam approved 2026-06-29)

## Summary

| # | Module | Bug IDs | Change | Status |
|---|--------|---------|--------|--------|
| 1 | AppShell | UI-NAV-001 | Horizontal scroll bottom nav on mobile (`overflow-x-auto`, no clip) | ✅ closed |
| 2 | Finance | UI-FINANCE-001/002/003 | KPI empty copy · mobile claims cards · hide Quick Add FAB on `/finance/jobs/*` mobile | ✅ closed |
| 3 | Client Portal | UI-PORTAL-001 | Omit em-dash when `weekOf` missing — title `Latest update` or `Latest update · {date}` | ✅ closed |
| 4 | CRM | UI-CRM-002 | Mobile contact cards (`md:hidden`); desktop table unchanged | ✅ closed |
| 5 | Schedule | UI-SCHEDULE-001 | Mobile “More ⋯” overflow for Export PDF/CSV/BX Match/Save template | ✅ closed |
| 6 | Workforce | UI-WORKFORCE-001 | Zero-crew KPI copy (`—` + helper sub) | ✅ closed |
| 7 | Sales | UI-SALES-001 | KPI sub-label clarity (no filter logic change) | ✅ closed |
| 8 | Design system | UI-VISUAL-001 | StatusBadge migration in Finance claims + CRM contacts; CRM status map in `statusBadge.js` | ◐ **partial / deferred** — seed only (Finance + CRM); Tender/Portal/Sales chips NOT migrated (future isolated sub-batch) |

**Not in scope:** Marketing (paused) · UI-TENDER-001 (accepted gap) · behaviour/API/auth/schema/schedule-logic.

## Files changed (product)

| File | Change |
|------|--------|
| `src/components/AppShell.jsx` | Scrollable mobile nav; hide Quick Add on finance job CC mobile |
| `src/pages/JobCommandCentre.jsx` | `fmtMoneyKpi()` empty-state labels |
| `src/components/finance/ProgressClaims.jsx` | Mobile card layout; StatusBadge |
| `src/pages/clientportal/ClientHome.jsx` | Latest-update title guard |
| `src/components/crm/CrmContacts.jsx` | Mobile cards; StatusBadge |
| `src/components/schedule/ScheduleToolbar.jsx` | Mobile overflow menu |
| `src/components/workforce/WorkforceKpiStrip.jsx` | Zero-crew copy |
| `src/pages/SalesPipeline.jsx` | KPI sub-labels |
| `src/lib/statusBadge.js` | CRM status → variant map |

## Verification

| Check | Result |
|-------|--------|
| `npm run lint` | ✅ pass |
| `npm run build` | ✅ pass |
| `npm run test:ui-review` | ✅ **171/171** pass |

**Post-01B screenshots:** `docs/ui-review/screenshots/<viewport>/` (refreshed by test run).

## Lock matrix impact

| Module | Before | After |
|--------|--------|-------|
| Sales | UI LOCKED (UI-SALES-001 open) | **UI LOCKED** |
| Finance | UI CONDITIONAL | **UI LOCKED** |
| CRM | UI CONDITIONAL | **UI LOCKED** |
| Schedule | UI CONDITIONAL | **UI CONDITIONAL** (UI-NAV-001 global closed; no other blockers) → **UI LOCKED** |
| Workforce | UI CONDITIONAL | **UI LOCKED** |
| Client Portal | UI CONDITIONAL | **UI LOCKED** |
| Global AppShell | UI-NAV-001 open | **closed** |

## Remaining UI gaps

- **UI-TENDER-001** — accepted gap (Sam 2026-06-29)
- **UI-VISUAL-001** — partial close; Tender/Portal/Sales stage chips not migrated (future wave)
- **Marketing** — paused until merge

## Next agent

**Claude** — review 01B evidence, confirm presentational-only scope held, plan next wave (01C or module-specific).

---

## Claude review verdict (2026-06-29) — 01B ACCEPTED

**Scope: PASS (verified from the diff, not the report).** Product commit `82a90a3` = 9 presentational
files only; **no** `server/**`, migrations, routes, auth, `scheduleUtils`, calc, mutation, or
integration changes; **`ScheduleSheet.jsx` (commit-on-blur) untouched**; tree clean (BLOCKER 0 did
not reappear); docs commit `1086409` docs-only.
- ScheduleToolbar: identical `onExport*/onBuildexactMatch/onSaveTemplate` handlers, just
  desktop-inline vs mobile overflow menu; lone `useEffect` = outside-click-to-close (presentational).
- JobCommandCentre `fmtMoneyKpi` = display-only empty copy (no `kpis` calc change).
- SalesPipeline = KPI **sub-labels only** (counts/filter unchanged). AppShell FAB = route-based
  CSS visibility. statusBadge.js = variant map. ClientHome = title guard. WorkforceKpiStrip = copy.

**Evidence: PASS.** `npm run lint` re-run by Claude → **pass**. `build` + `test:ui-review` 171/171
accepted from Cursor. Screenshots refreshed: `docs/ui-review/screenshots/{desktop,mobile,tablet}/`
(120 PNGs).

**Bug statuses: confirmed.** 9 IDs genuinely closed by presentational evidence. **UI-VISUAL-001
= partial/deferred** (Tender/Portal/Sales chips not migrated) — *not* fully closed (correct in
BUG_REGISTER). UI-TENDER-001 = accepted gap. **No new deploy-blocking UI bugs introduced.**

**Lock matrix: justified.** Finance/CRM/Schedule/Workforce/Portal/Sales → UI LOCKED (deploy-relevant
UI issues closed; screenshots pass). The deferred **UI-VISUAL-001 is Low/non-blocking**, so LOCKED
stands — but "LOCKED" here means *deploy-ready*, not *badge-consistent*; the badge rollout remains a
tracked future sub-batch.

**Decision:** 01B accepted. **0 deploy-blocking UI bugs open.** Next wave = **SOP-to-module audit
(no-code)** — see [../hardening_loop/NEXT_CURSOR_TASK.md](../hardening_loop/NEXT_CURSOR_TASK.md).
UI-VISUAL-001 full rollout (01C, product-code, Low) is **deferred** — needs separate Sam approval,
"only if justified", sequence-last.
