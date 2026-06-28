# UI Module Lock Matrix

**Status:** LIVE — Wave 01A seeded 2026-06-28 · Governed by
[../FULL_E2E_HARDENING_STRATEGY.md](../FULL_E2E_HARDENING_STRATEGY.md).

**Run ID:** `BLH-UIUX-01A-2026-06-28-1`

**Lock statuses:** **UI LOCKED** · **UI CONDITIONAL** · **UI NO-GO** · **UI NOT ASSESSED**

| # | Module | Route(s) | Lock status | Blocking issues | Bug IDs | Last reviewed |
|---|--------|----------|-------------|-----------------|---------|---------------|
| 1 | Sales (reference) | `/sales/*` | **UI LOCKED** | — | UI-SALES-001, UI-NAV-001 | 2026-06-28 |
| 2 | Tender / RFQ | `/tender-manager/*` | **UI CONDITIONAL** | — | UI-TENDER-001, UI-NAV-001, UI-VISUAL-001 | 2026-06-28 |
| 3 | Operations / Project Command Centre | `/operations/*` | **UI LOCKED** | — | UI-NAV-001 | 2026-06-28 |
| 4 | Schedule | `/operations/*/schedule` | **UI CONDITIONAL** | — | UI-SCHEDULE-001, UI-NAV-001 | 2026-06-28 |
| 5 | Procurement | `/operations/procurement` | **UI LOCKED** | — | — | 2026-06-28 |
| 6 | Finance | `/finance/*` | **UI CONDITIONAL** | — | UI-FINANCE-001–003, UI-NAV-001, UI-VISUAL-001 | 2026-06-28 |
| 7 | Workforce | `/workforce/*` | **UI CONDITIONAL** | — | UI-WORKFORCE-001, UI-NAV-001 | 2026-06-28 |
| 8 | Field / Worker App | `/field/*`, `/worker` | **UI NO-GO** (Field) / **UI LOCKED** (Worker) | Field WHS + Diary crash | UI-FIELD-001, UI-FIELD-002 | 2026-06-28 |
| 9 | WHS | `/operations/*/whs`, `/field/whs` | **UI CONDITIONAL** | Field path blocked | UI-FIELD-001 | 2026-06-28 |
| 10 | Client Portal | `/client-portal/*` | **UI CONDITIONAL** | — | UI-PORTAL-001, UI-PORTAL-002 | 2026-06-28 |
| 11 | CRM / Mailing List | `/sales/dashboard`, `/sales/contacts` | **UI NOT ASSESSED** | No screenshot coverage | UI-CRM-001 | 2026-06-28 |
| 12 | Marketing | `/marketing/*` | **MARKETING — PAUSED UNTIL MERGE** | — | — | — |

**Notes:**
- Sales is the reference — do not redesign unless regression found.
- Field module **UI NO-GO** blocks supervisor field WHS/diary journeys until UI-FIELD-* fixed.
- Marketing stays paused; post-merge per [../MARKETING_POST_MERGE_HARDENING_PLAN.md](../MARKETING_POST_MERGE_HARDENING_PLAN.md).
- Deploy gate: no staff-touched surface at **UI NO-GO** without Sam acceptance.
