# UI Module Lock Matrix

**Status:** TEMPLATE / live tracker — *Wave 01A seeds the statuses.* · Governed by
[../FULL_E2E_HARDENING_STRATEGY.md](../FULL_E2E_HARDENING_STRATEGY.md).

**Lock statuses:** **UI LOCKED** (meets Sales standard, screenshots pass, mobile usable, no
deploy-blocking UI issues) · **UI CONDITIONAL** (usable, non-blocking issues logged) ·
**UI NO-GO** (confuses staff / hides risk / blocks workflow / wrong info / mobile impractical) ·
**UI NOT ASSESSED** (default).

A module can only become **UI LOCKED** when its screenshots pass (or missing coverage is logged
as a gap) and it has no `blocks-deployability` findings open.

| # | Module | Route(s) | Lock status | Blocking issues | Bug IDs | Last reviewed |
|---|--------|----------|-------------|-----------------|---------|---------------|
| 1 | Sales (reference) | `/sales/*` | UI NOT ASSESSED | — | — | — |
| 2 | Tender / RFQ | `/tender-manager/*` | UI NOT ASSESSED | — | — | — |
| 3 | Operations / Project Command Centre | `/operations/*` | UI NOT ASSESSED | — | — | — |
| 4 | Schedule | `/operations/*` (schedule tabs) | UI NOT ASSESSED | — | — | — |
| 5 | Procurement | `/operations/*` (procurement) | UI NOT ASSESSED | — | — | — |
| 6 | Finance | `/finance/*` | UI NOT ASSESSED | — | — | — |
| 7 | Workforce | `/workforce/*` | UI NOT ASSESSED | — | — | — |
| 8 | Field / Worker App | `/worker` | UI NOT ASSESSED | — | — | — |
| 9 | WHS | `/operations/*`, `/induct/:projectId` | UI NOT ASSESSED | — | — | — |
| 10 | Client Portal | portal routes | UI NOT ASSESSED | — | — | — |
| 11 | CRM / Mailing List | `/sales/*` (CRM) | UI NOT ASSESSED | — | — | — |
| 12 | Marketing | `/marketing/*` | **MARKETING — PAUSED UNTIL MERGE** | — | — | — |

**Notes:**
- Sales is the reference check only — **do not redesign** unless a regression is found.
- Marketing stays `PAUSED UNTIL MERGE`; on `marketing-run-a` merge it becomes `UI NOT ASSESSED`
  and is driven by [../MARKETING_POST_MERGE_HARDENING_PLAN.md](../MARKETING_POST_MERGE_HARDENING_PLAN.md).
- The deploy gate requires no module at **UI NO-GO** on a staff-touched journey surface (or the
  issue accepted by Sam).
