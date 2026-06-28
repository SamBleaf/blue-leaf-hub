# UI Screen Evidence Index

**Status:** TEMPLATE / live index — *Wave 01A fills the rows.* · Governed by
[../FULL_E2E_HARDENING_STRATEGY.md](../FULL_E2E_HARDENING_STRATEGY.md).

UI Review is the visual hub. Per module, capture/document **viewports × states**. A module
can't be marked visually locked unless its screenshots pass or the missing coverage is logged as
a gap (`Gap` row + a `UI-VISUAL-REGRESSION` / `UI-MOBILE` finding where relevant).

**Viewports:** desktop `1440×900` · tablet `834×1112` · mobile `390×844`
**States:** good/loaded · empty · blocked/needs-action · overdue/risk · loading · error ·
permission-denied/role-limited
**Screenshot path convention:** `e2e/screenshots/BLH-UIUX-01A-<date>/<module>-<viewport>-<state>.png`

| Module | Screen / Route | Viewport | State | Screenshot path | Pass / Gap |
|--------|----------------|----------|-------|-----------------|------------|
| Sales | `/sales` | desktop 1440×900 | good | _tbd_ | _tbd_ |
| Sales | `/sales` | mobile 390×844 | good | _tbd_ | _tbd_ |
| Tender/RFQ | `/tender-manager` | desktop 1440×900 | good | _tbd_ | _tbd_ |
| Operations | `/operations` | desktop 1440×900 | good | _tbd_ | _tbd_ |
| Operations | `/operations` | tablet 834×1112 | good | _tbd_ | _tbd_ |
| Schedule | `/operations` (Gantt) | desktop 1440×900 | good | _tbd_ | _tbd_ |
| Procurement | `/operations` (procurement) | desktop 1440×900 | empty | _tbd_ | _tbd_ |
| Finance | `/finance` | desktop 1440×900 | good | _tbd_ | _tbd_ |
| Workforce | `/workforce` | desktop 1440×900 | good | _tbd_ | _tbd_ |
| Field/Worker | `/worker` | mobile 390×844 | good | _tbd_ | _tbd_ |
| WHS | `/operations` (WHS) | desktop 1440×900 | good | _tbd_ | _tbd_ |
| Client Portal | portal home | mobile 390×844 | good | _tbd_ | _tbd_ |
| CRM | `/sales` (CRM) | desktop 1440×900 | empty | _tbd_ | _tbd_ |
| Marketing | `/marketing` | — | — | **PAUSED UNTIL MERGE** | n/a |

> Add rows until every priority module has, at minimum, desktop + mobile `good` + `empty`
> states, and any state where a finding was raised. Loading/error/permission rows are added
> where fixtures exist or can be safely created.
