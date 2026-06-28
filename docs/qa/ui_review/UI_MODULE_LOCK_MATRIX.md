# UI Module Lock Matrix

**Status:** LIVE — updated Wave 01B polish 2026-06-28

**Run ID:** `BLH-UIUX-01A-2026-06-28-1` + follow-up + **`BLH-UIUX-01B-2026-06-28-1`**

| # | Module | Route(s) | Lock status | Blocking issues | Bug IDs | Last reviewed |
|---|--------|----------|-------------|-----------------|---------|---------------|
| 1 | Sales (reference) | `/sales/*` | **UI LOCKED** | — | UI-SALES-001 closed (01B) | 2026-06-28 |
| 2 | Tender / RFQ | `/tender-manager/*` | **UI CONDITIONAL** | Accepted gap | UI-TENDER-001 (accepted) | 2026-06-28 |
| 3 | Operations / Project Command Centre | `/operations/*` | **UI LOCKED** | — | — | 2026-06-28 |
| 4 | Schedule | `/operations/*/schedule` | **UI LOCKED** | — | UI-SCHEDULE-001 closed (01B) | 2026-06-28 |
| 5 | Procurement | `/operations/procurement` | **UI LOCKED** | — | — | 2026-06-28 |
| 6 | Finance | `/finance/*` | **UI LOCKED** | — | UI-FINANCE-001–003 closed (01B) | 2026-06-28 |
| 7 | Workforce | `/workforce/*` | **UI LOCKED** | — | UI-WORKFORCE-001 closed (01B) | 2026-06-28 |
| 8 | Field / Worker App | `/field/*`, `/worker` | **UI LOCKED** | — | — | 2026-06-28 |
| 9 | WHS | `/operations/*/whs`, `/field/whs` | **UI CONDITIONAL** | — | — | 2026-06-28 |
| 10 | Client Portal | `/client-portal/*` | **UI LOCKED** | — | UI-PORTAL-001 closed (01B) | 2026-06-28 |
| 11 | CRM / Mailing List | `/sales/dashboard`, `/sales/contacts`, `/marketing/lists` | **UI LOCKED** | — | UI-CRM-002 closed (01B) | 2026-06-28 |
| 12 | Marketing | `/marketing/*` | **MARKETING — PAUSED UNTIL MERGE** | — | — | — |

**Global:** UI-NAV-001 closed (01B scrollable mobile nav). UI-VISUAL-001 partial — Finance + CRM migrated to StatusBadge; full rollout deferred.

**01B notes:** Presentational-only polish. No deploy-blocking UI bugs open from Wave 01A/01B.
