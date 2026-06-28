# SOP Module Audit — Wave 01 Result

**Run ID:** `BLH-SOP-AUDIT-W01-2026-06-29`  
**Agent:** Cursor · **Wave:** `SOP-MODULE-AUDIT-WAVE-01`  
**Method:** [SOP_TO_MODULE_AUDIT_PLAN.md](./SOP_TO_MODULE_AUDIT_PLAN.md) · **Scope:** folders `02`–`11` (71 SOPs) · **No product code**

## Executive summary

| Metric | Count |
|--------|------:|
| SOPs audited | **71** |
| §14 complete (TC-01..05 + feature TC) | **26** |
| §14 partial (missing TC-05 or feature case) | **20** |
| §14 missing / wrong section number | **25** |
| SOP-DRIFT (app right, doc stale) | **~45** substantive + template gaps |
| App bugs logged (Fix Agent) | **5** |
| TRAINING-GAP | **4** |
| ACCEPTED-GAP candidates (Sam) | **2** |
| SOP text fixes applied this wave | **8 files** |

**Verdict:** Deploy gate “SOP drift fixed or accepted” is **not met** for the lead→handover journey. Highest-risk drift: **Sales Lead Detail redesign**, **RFQ Engine vs Quote Tracker split**, **Portal v1/v2 dual stack**. Template gap (§14) is widespread — logged as module-level SOP-DRIFT, not individually duplicated.

---

## Per-module matrix

| Folder | SOPs | Coverage | §14 OK | Drift (substantive) | SOP fixes (wave) | App bugs |
|--------|-----:|----------|-------:|--------------------:|-----------------:|---------:|
| 02_sales | 7 | partial | 2/7 | Lead command-centre vs tab SOPs (6) | — | 1 (02-07) |
| 03_tendering | 4 | partial | 3/4 | Tender Board view chips (03-03) | — | 0 |
| 04_rfq_engine | 9 | partial | 1/9 | Engine wizard vs Quote Tracker (9) | **04-01** | 0 |
| 05_operations | 6 | good | 4/6 | Global Gantt + trade conflicts entry | **05-05, 05-06** | 1 (05-05 click) |
| 06_scheduling | 8 | good | 6/8 | Dashboard not rendered; button labels | — | 0 |
| 07_site_diary | 3 | partial | 0/3 | API/UX mismatch; edit missing | — | 1 (07-03) |
| 08_whs | 6 | good | 2/6 | Tab names; missing whs-setup SOP | **08-02, log, resolve** | 0 |
| 09_finance | 12 | good | 5/12 | Roles, tab naming; Job View routing | — | 1 (09-xx) |
| 10_workforce | 3 | partial | 0/3 | Magic-link auth; undocumented tabs | **10-01** | 0 |
| 11_client_portal | 13 | partial | 4/13 | Legacy v1 vs v2 matrix; v2 doc stale | — | 2 (11-12) |

---

## Drift by class

### SOP-DRIFT (fix SOP text — backlog)

| Priority | Area | Summary |
|----------|------|---------|
| P0 | **02_sales** | SOPs 02-02–02-07 describe tabbed Lead Detail; app uses Pass 3A command-centre + mobile tabs + BlueprintAgent FAB |
| P0 | **04_rfq_engine** | 04-02–04-09 entry paths point at RFQ Engine; post-send work is **Quote Tracker** (`/tender-manager/rfq-packages/:id`) |
| P1 | **03_tendering** | 03-03 status filter tabs → Board/Actions/List/Scorecard chips |
| P1 | **11_client_portal** | 11-01–11-09 target v1 token portal; v2 (`/client-portal`, PortalV2Admin) needs legacy/v2 matrix in every legacy SOP |
| P2 | **07_site_diary** | 07-01 API field names; 07-02 mic UX; 07-03 promises edit/filter app lacks |
| P2 | **09_finance** | Upload UX copy; admin-only roles; Job Dashboard vs Job View naming |
| P3 | **§14 template** | 25 SOPs missing Section 14; 20 partial — see BUG_REGISTER `SOP-DRIFT-SEC14-*` |

### bug (Fix Agent — do not fix in audit wave)

| ID | Summary |
|----|---------|
| SOP-BUG-02-07 | Saved conversation click opens new-transcript panel; no read-only history view |
| SOP-BUG-05-05 | Global Gantt task click → project schedule navigation not implemented |
| SOP-BUG-07-03 | Site diary date filter + edit/save not implemented |
| SOP-BUG-09-07 | Finance Manager “Job View” tab routing collision — `JobFinancials` unreachable |
| SOP-BUG-11-12 | No v1→v2 admin link; supervisor blocked from `PortalV2Admin` route |

### TRAINING-GAP

| ID | Summary |
|----|---------|
| SOP-TRAIN-03-01 | Fee proposal route works but not in Tender sidebar — document entry paths |
| SOP-TRAIN-06-07 | Gantt drag/resize accurate on desktop; mobile uses lookahead — add caveat |
| SOP-TRAIN-11-01 | Portal enable uses checkbox + copy link, not “Generate portal link” button |
| SOP-TRAIN-11-10 | Staff must know `/portal-admin/:projectId/v2` URL — no in-app link |

### ACCEPTED-GAP candidates (Sam only)

| ID | Summary |
|----|---------|
| SOP-GAP-PORTAL-STACK | Coexistence of v1 token portal (`/portal/:token`) and v2 login portal (`/client-portal`) — which SOP set is canonical for new jobs? |
| SOP-GAP-WHS-SETUP | `/operations/:projectId/whs-setup` (WhsEngine) has no SOP — accept as admin-only edge or write SOP 08-07? |

---

## SOP text fixes applied (2026-06-29)

| File | Change |
|------|--------|
| `04-01_rfq_overview.md` | RFQ Engine vs Quote Tracker route table |
| `05-05_operations_global_gantt.md` | Collapsible dashboard panel; read-only; no task-click jump |
| `05-06_operations_trade_conflicts.md` | OpsConflictBanner workflow |
| `08-02`, `08-05`, `08-06` | WHS tab labels: Contractors / Incidents |
| `10-01_workforce_overview.md` | Magic-link worker auth; Snapshot/Planner/Team tabs |

---

## Section 14 gaps (aggregate)

Full §14 compliance requires TC-01 through TC-05 plus ≥1 feature-specific case per `SOP_MAINTENANCE.md`. Modules with **zero** fully compliant SOPs in scope: **07_site_diary**, **10_workforce**. Modules with **>50%** gap: **02_sales**, **04_rfq_engine**, **11_client_portal** (legacy set).

**Recommended next wave:** `SOP-MODULE-AUDIT-WAVE-02` — (a) Sales Lead Detail SOP rewrite batch, (b) RFQ 04-02–04-09 nav fixes, (c) §14 backfill for 07 + 10, (d) Portal legacy/v2 matrix doc.

---

## Verification

- Read-only code review against `src/App.jsx`, key pages, ownership matrix
- No `npm run test` (no Section 14 execution — audit only)
- No product code changed

## Next agent

**Claude** — review findings, prioritize Wave 02 SOP rewrite vs Fix Agent bugs, present ACCEPTED-GAP candidates to Sam.

---

## Claude review verdict (2026-06-29)

**Scope: PASS** — `b6b9e4c` docs-only; tree clean. **Numbers verified** from the diff (71 audited;
§14 26/20/25; 5 app bugs; 2 accepted-gap). **Correction:** **7** SOP text files were fixed, not 8;
canonical app-bug ID for the finance issue is **SOP-BUG-09-JOBVIEW**.

**App bugs (5):** all **Medium/Low**, **none deploy-blocking** → Fix Agent batch is **Sam-gated but
deferrable** (SOP-BUG-05-05 likely an accepted descope). **No fixes approved.**

**Deploy blockers:** **0 code**; **SOP/training YES** — `SOP-DRIFT-SEC14-11` (High, portal),
`SOP-DRIFT-SEC14-07` (Medium, site diary), `SOP-GAP-PORTAL-STACK` (training) + P0 Sales/RFQ drift.
The portal SOP rewrite is **blocked on Sam's PORTAL-STACK decision**.

**Section 14:** 26/71 complete · 20 partial · 25 missing. Zero-compliant modules: 07_site_diary,
10_workforce. Backfill = Wave 02 (no-code).

**Decision:** **HALT at Sam gate** (`SAM_APPROVAL_REQUIRED.md`): (1) decide PORTAL-STACK +
WHS-SETUP; (2) greenlight no-code `SOP-DOCS-WAVE-02` (recommended immediate); (3) Fix Agent for the
5 app bugs (recommend **defer** — non-blocking). Wave 02 packet **staged** in `NEXT_CURSOR_TASK.md`.
