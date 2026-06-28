# UI Screen Evidence Index

**Status:** LIVE — Wave 01A · **Run ID:** `BLH-UIUX-01A-2026-06-28-1` · Governed by
[../FULL_E2E_HARDENING_STRATEGY.md](../FULL_E2E_HARDENING_STRATEGY.md).

**Evidence root:** `docs/ui-review/export-2026-06-27/screenshots/<viewport>/<route-name>.png`  
**Result JSON:** `docs/ui-review/export-2026-06-27/raw/results/<viewport>__<route-name>.json`  
**Capture command:** `npm run test:ui-review` — **171/171 pass** (2026-06-28 follow-up + **01B refresh**)

**Post-01B evidence:** `docs/ui-review/screenshots/<viewport>/` — refreshed 2026-06-28 after Wave 01B polish.

**Viewports:** desktop `1440×900` · tablet `834×1112` · mobile `390×844`

**Command gap:** Wave convention `e2e/screenshots/BLH-UIUX-01A-<date>/` not created — UI Review
export folder is the canonical store. Playwright browsers must be installed (`npx playwright install chromium`).

---

## Sales (reference)

| Screen / Route | Viewport | State | Screenshot path | Pass / Gap |
|----------------|----------|-------|-----------------|------------|
| `/sales` | desktop | good | `…/desktop/sales-pipeline.png` | Pass |
| `/sales` | mobile | good | `…/mobile/sales-pipeline.png` | Pass |
| `/sales?view=actions` | desktop | needs-action | `…/desktop/sales-action-queue.png` | Pass |
| `/sales/lead-1` … `lead-8` | desktop | stage variants | `…/desktop/lead-*.png` | Pass |
| `/sales/lead-*` | mobile | good | `…/mobile/lead-*.png` | Pass |
| `/sales/lead-*` | tablet | good | `…/tablet/lead-*.png` | Pass |

## Tender / RFQ

| Screen / Route | Viewport | State | Screenshot path | Pass / Gap |
|----------------|----------|-------|-----------------|------------|
| `/tender-manager/board` | desktop | good | `…/desktop/tender-board.png` | Pass |
| `/tender-manager/board` | mobile | good | `…/mobile/tender-board.png` | Pass |
| `/tender-manager/rfq-packages` | desktop | good | `…/desktop/rfq-package-list.png` | Pass |
| `/tender-manager/rfq-packages/pkg-1` | desktop | good | `…/desktop/rfq-package-detail.png` | Pass |
| `/tender-manager/rfq-engine` | desktop | empty/wizard | `…/desktop/rfq-engine.png` | Pass |
| `/tender-manager/subcontractors` | desktop | good | `…/desktop/subcontractors.png` | Pass |
| `/tender-manager/cost-intelligence` | desktop | good | `…/desktop/cost-intelligence.png` | Pass |
| `/tender-manager/fee-proposal` | desktop | good | `…/desktop/fee-proposals.png` | Pass |
| Tender subsheets | mobile | good | `…/mobile/tender-*.png` etc. | Pass (table squeeze likely) |

## Operations / Schedule / Procurement

| Screen / Route | Viewport | State | Screenshot path | Pass / Gap |
|----------------|----------|-------|-----------------|------------|
| `/operations` | desktop | good | `…/desktop/operations-list.png` | Pass |
| `/operations` | mobile | good | `…/mobile/operations-list.png` | Pass |
| `/operations` | tablet | good | `…/tablet/operations-list.png` | Pass |
| `/operations/proj-1` | desktop | good | `…/desktop/operations-project.png` | Pass |
| `/operations/proj-1/schedule` | desktop | good/overdue | `…/desktop/schedule-manager.png` | Pass |
| `/operations/proj-1/schedule` | mobile | overdue/lookahead | `…/mobile/schedule-manager.png` | Pass |
| `/operations/proj-1/diary` | desktop | good | `…/desktop/operations-diary.png` | Pass |
| `/operations/proj-1/whs` | desktop | needs-action | `…/desktop/operations-whs.png` | Pass |
| `/operations/procurement` | desktop | blocked/risk | `…/desktop/procurement.png` | Pass |
| `/operations/procurement` | mobile | good | `…/mobile/procurement.png` | Pass |

## Finance

| Screen / Route | Viewport | State | Screenshot path | Pass / Gap |
|----------------|----------|-------|-----------------|------------|
| `/finance` | desktop | good | `…/desktop/finance-manager.png` | Pass |
| `/finance` | mobile | good | `…/mobile/finance-manager.png` | Pass |
| `/finance/jobs/job-1001` | desktop | thin KPIs | `…/desktop/finance-command-centre.png` | Pass (01B empty copy) |
| `/finance/jobs/job-1001` | mobile | claims cards | `…/mobile/finance-command-centre.png` | Pass (01B mobile cards) |

## Workforce

| Screen / Route | Viewport | State | Screenshot path | Pass / Gap |
|----------------|----------|-------|-----------------|------------|
| `/workforce` | desktop | pending approval | `…/desktop/workforce.png` | Pass |
| `/workforce` | mobile | pending approval | `…/mobile/workforce.png` | Pass |
| `/workforce` | tablet | pending approval | `…/tablet/workforce.png` | Pass |

## Field / Worker

| Screen / Route | Viewport | State | Screenshot path | Pass / Gap |
|----------------|----------|-------|-----------------|------------|
| `/field/home` | mobile | good | `…/mobile/field-home.png` | Pass |
| `/field/jobs` | mobile | good | `…/mobile/field-jobs.png` | Pass |
| `/field/tasks` | mobile | good | `…/mobile/field-tasks.png` | Pass |
| `/field/whs` | desktop/tablet/mobile | good | `…/*/field-whs.png` | **Pass** (fixture fix) |
| `/field/diary` | desktop/tablet/mobile | good | `…/*/field-diary.png` | **Pass** (fixture fix) |
| `/worker` | mobile | good | `…/mobile/worker-home.png` | Pass |
| `/worker/timesheet/log` | mobile | good | `…/mobile/worker-log-hours.png` | Pass |
| `/worker/tasks` | mobile | good | `…/mobile/worker-tasks.png` | Pass |
| `/worker/week` | mobile | good | `…/mobile/worker-week.png` | Pass |

## Client Portal

| Screen / Route | Viewport | State | Screenshot path | Pass / Gap |
|----------------|----------|-------|-----------------|------------|
| `/client-portal` | desktop | good | `…/desktop/portal-home.png` | Pass |
| `/client-portal` | mobile | good | `…/mobile/portal-home.png` | Pass |
| `/client-portal/actions` | mobile | good | `…/mobile/portal-actions.png` | Pass |
| `/client-portal/journey` | mobile | good | `…/mobile/portal-journey.png` | Pass |
| `/client-portal/selections` | mobile | good | `…/mobile/portal-selections.png` | Pass |
| `/client-portal/documents` | mobile | good | `…/mobile/portal-documents.png` | Pass |
| `/client-portal/messages` | mobile | good | `…/mobile/portal-messages.png` | Pass |

## CRM / Mailing List

| Screen / Route | Viewport | State | Screenshot path | Pass / Gap |
|----------------|----------|-------|-----------------|------------|
| `/sales/dashboard` | desktop | good | `…/desktop/crm-dashboard.png` | Pass |
| `/sales/dashboard` | mobile | good | `…/mobile/crm-dashboard.png` | Pass |
| `/sales/contacts` | desktop | good | `…/desktop/crm-contacts.png` | Pass |
| `/sales/contacts` | mobile | table squeeze | `…/mobile/crm-contacts.png` | Pass (UI-CRM-002) |
| `/marketing/lists` | desktop | good | `…/desktop/crm-mailing-lists.png` | Pass |
| `/marketing/lists` | mobile | good | `…/mobile/crm-mailing-lists.png` | Pass |

## Marketing

| Screen / Route | Viewport | State | Screenshot path | Pass / Gap |
|----------------|----------|-------|-----------------|------------|
| `/marketing` | — | — | **PAUSED UNTIL MERGE** | n/a |

---

**Redesign mock-ups** (reference only, not production): `ops-redesign-mockup-*`, `h3-redesign-mockup-*`,
`sales-redesign-mockup-*` — captured in same export folder for Claude 01B planning.
