# UI Module Lock Matrix

**Status:** LIVE — updated Wave 01A follow-up 2026-06-28

**Run ID:** `BLH-UIUX-01A-2026-06-28-1` + follow-up `BLH-UIUX-01A-FOLLOWUP`

| # | Module | Route(s) | Lock status | Blocking issues | Bug IDs | Last reviewed |
|---|--------|----------|-------------|-----------------|---------|---------------|
| 1 | Sales (reference) | `/sales/*` | **UI LOCKED** | — | UI-SALES-001, UI-NAV-001 | 2026-06-28 |
| 2 | Tender / RFQ | `/tender-manager/*` | **UI CONDITIONAL** | — | UI-TENDER-001, UI-NAV-001, UI-VISUAL-001 | 2026-06-28 |
| 3 | Operations / Project Command Centre | `/operations/*` | **UI LOCKED** | — | UI-NAV-001 | 2026-06-28 |
| 4 | Schedule | `/operations/*/schedule` | **UI CONDITIONAL** | — | UI-SCHEDULE-001, UI-NAV-001 | 2026-06-28 |
| 5 | Procurement | `/operations/procurement` | **UI LOCKED** | — | — | 2026-06-28 |
| 6 | Finance | `/finance/*` | **UI CONDITIONAL** | — | UI-FINANCE-001–003, UI-NAV-001 | 2026-06-28 |
| 7 | Workforce | `/workforce/*` | **UI CONDITIONAL** | — | UI-WORKFORCE-001, UI-NAV-001 | 2026-06-28 |
| 8 | Field / Worker App | `/field/*`, `/worker` | **UI LOCKED** | — | UI-FIELD-001/002 closed (fixture) | 2026-06-28 follow-up |
| 9 | WHS | `/operations/*/whs`, `/field/whs` | **UI CONDITIONAL** | — | — | 2026-06-28 follow-up |
| 10 | Client Portal | `/client-portal/*` | **UI CONDITIONAL** | — | UI-PORTAL-001; UI-PORTAL-002 closed (fixture) | 2026-06-28 follow-up |
| 11 | CRM / Mailing List | `/sales/dashboard`, `/sales/contacts`, `/marketing/lists` | **UI CONDITIONAL** | — | UI-CRM-002 | 2026-06-28 follow-up |
| 12 | Marketing | `/marketing/*` | **MARKETING — PAUSED UNTIL MERGE** | — | — | — |

**Follow-up notes:** Field NO-GO lifted — crashes were UI Review fixture shape only. CRM assessed. No deploy-blocking UI bugs remain open from Wave 01A.
