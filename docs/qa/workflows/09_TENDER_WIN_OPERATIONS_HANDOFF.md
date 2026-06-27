# Workflow 09 — Tender Win / Operations Handoff

**Status:** Mapped (2026-06-25) — documentation only; no product code changes  
**Gate:** W08 accepted 2026-06-25 (SAM-W08-001–003 decided) — Batch B mapping complete  
**Related:** [08_QUOTE_COMPARISON_ACCEPT_QUOTE.md](./08_QUOTE_COMPARISON_ACCEPT_QUOTE.md) (SAM-W08-001–003 decided), [05_TENDER_BOARD_LIFECYCLE.md](./05_TENDER_BOARD_LIFECYCLE.md), [RFQ_TENDER_WORKFLOW_SOURCE_OF_TRUTH.md](../RFQ_TENDER_WORKFLOW_SOURCE_OF_TRUTH.md), [WORKFLOW_TEST_MATRIX.md](../WORKFLOW_TEST_MATRIX.md), [BUG_REGISTER.md](../BUG_REGISTER.md), [SAM_DECISION_LOG.md](../SAM_DECISION_LOG.md)

**Starts after:** W08 — staff has reviewed quotes per **SAM-W08-001** (`rfqs.quote_amount > 0` on every accepted trade; manual package cross-check per **SAM-W08-003**) on **Tender Detail** (**SAM-W08-002** canonical win path)  
**Hands off to:** Batch C — W10 Procurement Planning, W12 Scheduling, W13 Site Operations, W14 WHS, W18 Client Portal

---

## Evidence standards (used in this document)

| Label | Meaning |
|-------|---------|
| **Verified from code** | Confirmed in repo file, route, table, or migration |
| **Verified from SOP/docs** | Stated in SOP or agent knowledge doc |
| **Inferred from behaviour** | Logical conclusion from code paths |
| **Unconfirmed / needs testing** | Plausible but not proven by read-only audit |
| **Open decision for Sam** | Business rule — [SAM_DECISION_LOG.md](../SAM_DECISION_LOG.md) |

---

## 1. Business intent

W09 is the **tender win → operations activation** bridge. When Blue Leaf is awarded a project, staff mark the tender **won**, the Hub creates or enriches the Operations **project** spine, seeds **cost intelligence** from accepted subcontractor quotes, carries **contract value** from the fee proposal, and optionally issues **purchase orders** and **outcome emails** to subcontractors.

**Verified from SOP/docs:** SOP 03-04 / agent knowledge — win is a director action on Tender Detail; Operations picks up from `/operations` project list.

**Critical constraint (hardening):** Win-finalize creates a **baseline project**, not a fully operations-ready job. Schedule, procurement plan, WHS profile, portal enablement, and lead pipeline sync are **manual or separate workflows** — see §16 and **W09-DRIFT-001**, **W09-DRIFT-007**.

**Not in W09 scope:** Quote accept rule changes (W08), Tender Board redesign (SAM-W05-006), Buildxact write sync (stub only), procurement engine auto-start.

---

## 2. Start trigger

| Trigger | Surface | Evidence |
|---------|---------|----------|
| Staff clicks **Mark as won** on Tender Detail | `/tender-manager/board/:jobId` | **Verified from code:** `TenderDetail.jsx:932–940` — only when `job.status === "tendering"` |
| Win wizard Step 1 — all trades decided | Win modal | **Verified from code:** `winStep1Valid()` requires `accepted` / `declined` / `not_required` per row |
| Staff completes Steps 2–3 and confirms | Win modal | Cost intel fields (Step 2) + email preview (Step 3) |
| `executeWin()` fires | Client | **Verified from code:** `POST /api/tender/win-finalize` then optional outcome-mails + batch PO check |

**No other UI path calls win-finalize** — Package Detail and Quote Tracker have no Mark Won button (**Verified from code:** grep `win-finalize` → `TenderDetail.jsx` + `module4Routes.mjs` only).

---

## 3. End / handoff

| End state | Table / artefact | Next workflow |
|-----------|------------------|---------------|
| Job won | `jobs.status = won`, `jobs.won_at` | Operations project list |
| Project active | `projects.status = active`, `projects.job_id` | W12 schedule, W10 procurement, W14 WHS |
| Accepted trades snapshot | `projects.accepted_trades` jsonb | PO issue, trade commitment |
| Per-trade benchmarks | `cost_intelligence` rows | W20 cost intelligence |
| Contract value (if derivable) | `jobs.original_contract_value`, `projects.contract_value` | W17 finance / portal |
| Outcome emails sent | `correspondence` outbound | Subcontractor comms |
| POs issued (optional, post-win) | `purchase_orders` | W11 commitments |

**Does not happen automatically:** `leads.stage = won`, schedule generation, procurement plan, WHS site profile, `portal_enabled`, lead `won_at` — **W09-DRIFT-004**, **W09-DRIFT-007**.

---

## 4. Main users

| User | Role | Evidence |
|------|------|----------|
| Sam / Josh | Directors — run win wizard, review cost intel | **Verified from SOP/docs** |
| Admin / supervisor | Navigate Operations after win | **Verified from code:** `/operations` requires auth |
| Subcontractors (external) | Receive win/decline emails, later POs | Outcome-mails + po/issue |
| Client | Portal access | Only after admin enables portal — not on win |

---

## 5. Blue Leaf business workflow

1. All subcontractor quotes reviewed and accepted/declined on **Tender Detail** (W08).
2. Director opens **Mark as won** — win wizard lists every `rfqs` row for the job.
3. Step 1: confirm outcome and **staff-confirmed quote amounts** per trade.
4. Step 2: enter building metrics for cost intelligence (floor area, storeys, etc.).
5. Step 3: preview outcome emails to accepted/declined subs.
6. Confirm — server runs **win-finalize** → project appears in Operations.
7. Optionally send outcome emails (separate API call).
8. Optionally issue batch POs from post-win banner.
9. **Manual ops checklist:** generate schedule, procurement plan, WHS setup, enable client portal, sync lead stage.

---

## 6. Hub workflow

```mermaid
flowchart TB
  subgraph w08 [From W08]
    ACC[rfqs accepted + quote_amount]
  end

  subgraph ui [Tender Detail]
    MW[Mark as won]
    WZ[Win wizard 3 steps]
    EW[executeWin]
  end

  subgraph api [Server win-finalize]
    RU[Patch rfqs status/amount]
    JW[jobs.status won + won_at]
    TRG[096 trigger minimal project]
    PR[Enrich projects row]
    CV[Fee proposal contract value]
    CI[cost_intelligence insert]
    SF[setFact building metrics]
    DBX[Dropbox quote copy]
    BX[Buildxact stub sync]
  end

  subgraph post [Post-win optional]
    OM[outcome-mails]
    BP[batch-po-check]
    PO[po/issue per trade]
  end

  subgraph ops [Operations — manual]
    OL[/operations projects list]
    SCH[Schedule generate]
    PROC[Procurement plan]
    WHS[WHS setup]
    PORT[Portal admin enable]
  end

  ACC --> MW --> WZ --> EW
  EW --> RU --> JW --> TRG --> PR
  PR --> CV --> CI --> SF
  RU --> DBX
  RU --> BX
  EW --> OM
  EW --> BP --> PO
  PR --> OL
  OL --> SCH
  OL --> PROC
  OL --> WHS
  OL --> PORT
```

**Plain English:** Win is **server-orchestrated** in `module4Routes.mjs`. The UI builds payloads from **`rfqs` only**. Operations readiness beyond the project row is **staff-driven**.

---

## W09 mapping answers (19 questions)

| # | Question | Answer | Evidence |
|---|----------|--------|----------|
| 1 | What happens when a tender is marked won? | win-finalize patches `rfqs`, sets `jobs.won`, 096 creates minimal `projects`, enrich + contract value + cost_intel + setFact + optional Dropbox copies + Buildxact stub | `module4Routes.mjs:232–515` |
| 2 | Which screen triggers win-finalize? | **TenderDetail only** — Mark as won → win wizard → `executeWin()` | `TenderDetail.jsx:604` |
| 3 | Which accepted quotes are included? | **`rfqs` rows** where win wizard sets `status === "accepted"` | `buildWinRowsFromRfqs`, `acceptedTrades` filter |
| 4 | rfqs only, rfq_recipients, or both? | **`rfqs` only** — win-finalize never queries `rfq_recipients` | W09-DRIFT-002 |
| 5 | Accepted, received, or wizard selections? | **Manual wizard selections** required per trade (`accepted`/`declined`/`not_required`); received rows default to accepted in wizard but staff must complete Step 1 | `winStep1Valid()` |
| 6 | Does win-finalize require `quote_amount > 0`? | **Business rule yes** (SAM-W08-001); **server no** — API accepts win without amount validation; cost_intel skips null/≤0 | §8.4.1; W09-DRIFT-010 |
| 7 | What if only `quoted_amount` exists? | RFQ can be marked accepted; **no cost_intel row**; PO may show $0 | W09-DRIFT-003 |
| 8 | Package accept not synced to rfqs? | **Invisible to win wizard** — no cost_intel, no PO check for that trade | W09-DRIFT-002 |
| 9 | What creates/updates `projects`? | Migration **096 trigger** on `jobs.status='won'` + idempotent enrich in win-finalize | `096_auto_project_on_win.sql` |
| 10 | What creates `cost_intelligence`? | win-finalize loop over `acceptedTrades` with `quote_amount > 0` | `module4Routes.mjs:467–478` |
| 11 | `jobs.status` / `won_at`? | Set to `won` + `now` in win-finalize | `module4Routes.mjs:301` |
| 12 | `leads.stage` / `won_at`? | **Not updated** | W09-DRIFT-004 |
| 13 | POs / batch PO readiness? | **Not auto-created**; post-win banner + manual `po/issue`; **empty projectId bug** | W09-DRIFT-006 |
| 14 | Procurement planning? | **Not auto** — manual `generateProcurementPlan` (W10) | W09-DRIFT-007 |
| 15 | Schedule readiness? | **Not auto** — no `schedule_tasks` on win | W09-DRIFT-007 |
| 16 | Client portal readiness? | Copies `portal_client_*` from job; **does not enable portal** | W09-DRIFT-007 |
| 17 | WHS / operations setup? | **Not auto** — WHS profile on first setup visit | W09-DRIFT-007 |
| 18 | Win / outcome emails? | win-finalize called with `emails: []`; **outcome-mails separate API** after win | W09-DRIFT-008 |
| 19 | Minimum safe won-job checklist? | 12-step staff checklist — §23 below; project auto, full ops manual | SAM-W09-001 open |

### Source-of-truth model (verified)

| Entity | Role at win | Included in win-finalize? |
|--------|-------------|---------------------------|
| **`jobs`** | Tender status, `won_at`/`lost_at`, job-level outcome | **Yes** — status + won_at + contract value carry |
| **`projects`** | Operations spine after win | **Yes** — 096 trigger + enrich |
| **`rfqs`** | Accepted trade quote source for win wizard | **Yes** — sole accept/amount source |
| **`rfq_recipients`** | Package recipient state | **No** — unless mirrored to `rfqs` |
| **`cost_intelligence`** | Accepted quote benchmark seed | **Yes** — when `quote_amount > 0` |
| **`purchase_orders`** | Post-win procurement layer | **No on win** — manual po/issue |
| **`leads`** | Sales pipeline | **No** — won state not synced |
| **Schedule / WHS / portal** | Ops readiness | **No** — manual Batch C workflows |

---

## 7. SOP interpretation

| SOP | W09 coverage | Evidence |
|-----|--------------|----------|
| 03-04 Tender win | Mark won wizard, project creation | **Verified from SOP/docs** — aligns with win-finalize |
| 05-01 Operations project setup | Schedule, diary, WHS | **Inferred:** not auto-triggered on win — gap **W09-DRIFT-007** |
| 11-01 Client portal | Portal enable + invite | **Verified from code:** win carries email/name only; no auto-enable |
| Sales pipeline won stage | Lead → won | **Verified from code:** not implemented — **W09-DRIFT-004** |

---

## 8. Code interpretation

### 8.1 — What exactly happens on win?

**Verified from code:** `POST /api/tender/win-finalize` (`module4Routes.mjs:232–515`) executes in order:

1. Load `jobs` row by `jobId`.
2. **Patch each `rfqs` row** from `rfqUpdates[]` (`status`, `quote_amount`).
3. For each newly accepted RFQ → call `syncAcceptedQuoteToBuildexact` (no-op stub).
4. Copy quote PDFs to Dropbox `INTERNAL/QUOTES/ACCEPTED|DECLINED` (if configured).
5. Set `jobs.status = 'won'`, `jobs.won_at = now`.
6. **096 trigger** fires → inserts minimal `projects` row if missing.
7. **Idempotent project enrich** — update existing or insert: `accepted_trades`, Dropbox paths, `tentative_start_date`, `portal_client_*` from job, `buildexact_link_source = pending`.
8. **Contract value carry** — if `original_contract_value` unset, derive from best `fee_proposals` row; write via `setFact` + mirror to `projects.contract_value`.
9. **Building facts** — `setFact` for floor/roof/wall/storeys/wet_areas from `costIntel` payload + job fallbacks.
10. **`cost_intelligence` insert** — one row per accepted trade with `quote_amount > 0`.
11. Send outcome emails **only if** `emails[]` in body (TenderDetail passes `[]` — uses separate call).

### 8.2 — Which screen triggers win-finalize?

| Screen | Triggers win-finalize? | Evidence |
|--------|------------------------|----------|
| **TenderDetail** | **Yes** — sole caller | `executeWin()` → `authFetch("/api/tender/win-finalize")` |
| TenderBoard | No | Board has no win action |
| RfqPackageDetail | No | Package accept ≠ win |
| RfqPackageList | No | — |
| Operations | No | Reads projects after win |

### 8.3 — Accepted quote source (rfqs vs rfq_recipients)

| Source | Read by win-finalize? | How included |
|--------|----------------------|--------------|
| **`rfqs`** | **Yes** | UI builds `winRows` from `job.rfqs`; server patches `rfqs` and reads `acceptedTrades` from request body |
| **`rfq_recipients`** | **No** | Never queried; package-only accepts invisible unless mirrored to `rfqs` (**W09-DRIFT-002**) |

**Verified from code:** `buildWinRowsFromRfqs(rfqs)` — `TenderDetail.jsx:406–420`; win-finalize has no `rfq_recipients` import or select.

### 8.4 — Accepted status vs received data

| Rule | Layer | Evidence |
|------|-------|----------|
| Win wizard requires explicit outcome | UI Step 1 | `winStep1Valid()` — not auto-win on `received` alone |
| Default for received rows | UI | `buildWinRowsFromRfqs` defaults `received`/`accepted` → wizard status `"accepted"` |
| Server applies statuses | API | `rfqUpdates` patches `rfqs.status` |
| **Cost intelligence amount** | API | Uses `acceptedTrades[].quote_amount` only; **skips** if null or ≤ 0 — **does not read `quoted_amount`** (**W09-DRIFT-003**) |

### 8.4.1 — Does win-finalize require `quote_amount > 0`?

| Layer | Requires `quote_amount > 0`? | Evidence |
|-------|------------------------------|----------|
| **Business rule (SAM-W08-001 — decided)** | **Yes** — every accepted trade must have staff-confirmed `rfqs.quote_amount > 0` before win | Sam decision; not server-enforced |
| **Win wizard UI** | **No hard block** — staff can confirm win with empty amount on an accepted row | **Verified from code:** `winStep1Valid()` checks status only, not amount |
| **win-finalize API** | **Partial** — accepts win with any `rfqUpdates`; does not validate amounts | **Verified from code:** `module4Routes.mjs:243–245` requires `jobId` + `rfqUpdates[]` only |
| **`cost_intelligence` insert** | **Yes** — skips trade when `quote_amount` null or ≤ 0 | **Verified from code:** `module4Routes.mjs:467–469` |
| **Batch PO check** | Uses `quote_amount \|\| 0` | **Verified from code:** `module4Routes.mjs:845` |

**Summary:** Sam's minimum safe rule requires `quote_amount > 0` on accepted trades (**SAM-W08-001**). The server **silently skips** cost_intel for trades without amount — it does **not** reject the win request. **`quoted_amount` alone never feeds cost_intel or PO totals.**

### 8.5 — Project creation / update

| Mechanism | When | What |
|-----------|------|------|
| **Migration 096 trigger** | `jobs.status` → `won` | Minimal insert: `job_id`, `address`, `status='active'` |
| **win-finalize enrich** | Same request, after trigger | Patch or insert full row: `accepted_trades`, portal client fields, Dropbox, dates, notes |

**Verified from code:** `096_auto_project_on_win.sql`; `module4Routes.mjs:304–355`.

**Verified from SOURCE_OF_TRUTH.md:** `projects.job_id` links winning tender; `projects.address` syncs from `jobs.address` (migration 036 trigger, one-way).

### 8.6 — Cost intelligence

**Verified from code:** Loop `acceptedTrades` → insert `cost_intelligence` when `quote_amount > 0` (`module4Routes.mjs:467–478`).

Each row includes building-fact columns duplicated from `costIntel` payload (`floor_area_m2`, `storeys`, etc.) plus `trade`, `project_type`, `source='tender'`.

**Also:** `setFact` writes canonical building facts to `project_metrics` / fact history (Phase 4 additive path).

### 8.7 — jobs.status / won_at

**Verified from code:** `jobs.update({ status: "won", won_at: now })` — `module4Routes.mjs:301`.

No other fields on `jobs` updated except contract value carry (§8.1 step 8).

### 8.8 — leads.stage / won_at

**Verified from code:** win-finalize and lose-finalize **do not touch `leads`** — **W09-DRIFT-004** (alias **W05-DRIFT-004**).

**Inferred:** Linked lead (`jobs.lead_id` / `leads.job_id`) may remain at `tender` stage after win.

### 8.9 — Purchase orders

| Step | Auto on win? | Evidence |
|------|--------------|----------|
| PO row creation | **No** | win-finalize does not insert `purchase_orders` |
| Batch PO banner | **Post-win UI** | `executeWin` → `GET /api/tender/batch-po-check/:jobId` |
| PO issue | **Manual confirm** | `issueBatchPos` → `POST /api/po/issue` per selected trade |

**batch-po-check** reads `rfqs` where `status = accepted` and no linked PO (`module4Routes.mjs:811–849`).

**W09-DRIFT-006:** `issueBatchPos` passes `projectId: rfqs.find(...)?.project_id` but **`rfqs` has no `project_id` column** — PO issue likely fails validation (`projectId required`) unless fixed to use win-finalize response `project.id` (**alias W05-DRIFT-005**).

### 8.10 — Procurement planning

**Verified from code:** `generateProcurementPlan` in `procurementService.mjs` — invoked via `POST` procurement routes and finance CC, **not** from win-finalize.

**Inferred:** New won job has **no** `procurement_items` until staff generates plan — **W09-DRIFT-007**.

### 8.11 — Schedule readiness

**Verified from code:** win-finalize does not insert `schedule_tasks`.

**Verified from code:** `GET /api/operations/projects` enriches projects with schedule stats from existing tasks — empty schedule until W12 generate.

### 8.12 — Client portal readiness

**Verified from code:** win-finalize copies `job.client_name` / `job.client_email` → `projects.portal_client_name` / `portal_client_email` when non-empty (`module4Routes.mjs:327–328`).

**Verified from code:** Does **not** set `portal_enabled`, `portal_v2_enabled`, or generate `portal_token`.

**Inferred:** Client cannot access portal until admin enables in Portal Admin — **W09-DRIFT-007**.

### 8.13 — WHS / operations setup

**Verified from code:** win-finalize does not create `whs_site_profiles`, `site_inductions`, or compliance rows.

**Verified from schema:** `whs_site_profiles.project_id` — created on first WHS setup visit (`064_whs_engine.sql`).

### 8.14 — quoted_amount-only accepted quotes

If staff accepts in wizard with empty `quote_amount` but IMAP populated `quoted_amount`:

- win-finalize **still sets** `rfqs.status = accepted` (from wizard).
- **No** `cost_intelligence` row inserted (**W09-DRIFT-003**, alias W08-DRIFT-006).
- Batch PO check uses `quote_amount || 0` — may show $0 PO (**Unconfirmed / needs testing**).

### 8.15 — Package accept not synced to rfqs

If quote accepted only on **Package Detail** (`rfq_recipients.status = accepted`) with no matching `rfqs` row or stale `rfqs` status:

- Win wizard **does not include** that recipient (**W09-DRIFT-002**).
- No cost_intelligence, no PO check entry for that trade.
- **Inferred:** Operations starts with incomplete trade commitment picture.

### 8.16 — Outcome emails split

**Verified from code:** `executeWin` calls win-finalize with `emails: []`, then separately `POST /api/tender/outcome-mails` if previews exist (`TenderDetail.jsx:604–628`).

**Risk:** Win succeeds but emails fail — job already won; partial comms state (**W09-DRIFT-008**, alias W05-DRIFT-006).

### 8.17 — Buildxact accepted quote sync (stub)

**Verified from code:** On accept in win-finalize loop, `syncAcceptedQuoteToBuildexact` is called but **always returns skipped** — Buildxact v3 API is read-only for estimate writes (`buildexactDeepIntegration.mjs:81–84`).

**W09-DRIFT-009 confirmed** — non-fatal, silent stub; no external accept sync.

### 8.18 — Mark Won allows incomplete accept checklist

**Verified from code:** `winStep1Valid()` checks per-trade **status** only — not `quote_amount > 0` (`TenderDetail.jsx:510–512`).

**Gap vs SAM-W08-001:** Staff can confirm win with accepted trades missing staff-confirmed amounts; server does not reject.

**W09-DRIFT-010 confirmed** — business rule stricter than UI/API enforcement.

---

## 9. Entry points

| ID | Entry | Action |
|----|-------|--------|
| E1 | Tender Detail — Mark as won | Open win wizard |
| E2 | Win wizard Step 1 | Set per-trade outcome + amounts |
| E3 | Win wizard Step 2 | Cost intelligence building metrics |
| E4 | Win wizard Step 3 | Email preview → executeWin |
| E5 | Post-win batch PO banner | Issue POs |
| E6 | Operations landing | View new project |

---

## 10. Exit points

| Exit | Condition | Next |
|------|-----------|------|
| Project visible in Operations | win-finalize ok | W12 schedule, W10 procurement |
| Cost intel seeded | accepted trades with `quote_amount > 0` | W20 benchmarks |
| POs issued | Manual batch PO | W11 commitments |
| Win incomplete ops-ready | Default case | Staff checklist §17 |

---

## 11. Screens

| Screen | Route | W09 role |
|--------|-------|----------|
| **TenderDetail** | `/tender-manager/board/:jobId` | **Primary** — win wizard, batch PO |
| **TenderBoard** | `/tender-manager/board` | Shows job as `won` after win; no win action |
| **Operations landing** | `/operations` | Lists enriched projects |
| **OperationsProjectDetail** | `/operations/:projectId` | Readiness alerts (procurement, WHS) — post-win manual |
| **PortalAdmin** | `/portal-admin` | Enable portal — not auto |
| **Procurement** | `/operations/procurement` | Manual plan generate |
| **ScheduleManager** | `/operations/:projectId/schedule` | Manual schedule generate |
| **WhsManager** | `/operations/:projectId/whs` | Manual WHS setup |

---

## 12. Routes

| Method | Route | Auth | Owner | W09 role |
|--------|-------|------|-------|----------|
| POST | `/api/tender/win-finalize` | `requireAuth` | module4Routes.mjs | **Core handoff** |
| POST | `/api/tender/outcome-mails` | `requireAuth` | module4Routes.mjs | Win/lose sub emails |
| GET | `/api/tender/batch-po-check/:jobId` | `requireAuth` | module4Routes.mjs | Post-win PO candidates |
| POST | `/api/po/issue` | `requireAuth` | module4Routes.mjs | Issue single PO |
| GET | `/api/operations/projects` | `requireAuth` | operationsRoutes.mjs | Ops project list |
| POST | `/api/procurement/.../generate` | `requireAuth` | procurementRoutes.mjs | **Not** win-triggered |

**Security:** win-finalize, lose-finalize, batch-po-check, po/issue all use `requireAuth` — **Verified from code**.

---

## 13. Database ownership

| Table | W09 writer | W09 fields / rows |
|-------|------------|-------------------|
| **`jobs`** | win-finalize | `status`, `won_at`; optional `original_contract_value`, `contract_value` |
| **`rfqs`** | win-finalize | `status`, `quote_amount` per `rfqUpdates` |
| **`projects`** | 096 trigger + win-finalize | Minimal then enriched row; `accepted_trades` jsonb |
| **`cost_intelligence`** | win-finalize | Per accepted trade with amount |
| **`project_metrics`** / facts | win-finalize via `setFact` | Building facts (provenance-stamped) |
| **`fee_proposals`** | read-only in win-finalize | Contract value source |
| **`purchase_orders`** | po/issue (post-win) | Not win-finalize |
| **`leads`** | **none** | **Gap W09-DRIFT-004** |
| **`rfq_recipients`** | **none** | **Gap W09-DRIFT-002** |
| **`schedule_tasks`** | **none** on win | W12 |
| **`procurement_items`** | **none** on win | W10 |
| **`whs_site_profiles`** | **none** on win | W14 |

**Source of truth (win handoff):**

| Fact | Canonical store | Set on win? |
|------|-----------------|-------------|
| Win timestamp | `jobs.won_at` | Yes |
| Operations spine | `projects` (via `job_id`) | Yes (096 + enrich) |
| Accepted trade snapshot | `projects.accepted_trades` | Yes |
| Per-trade quoted cost | `cost_intelligence.quote_amount` | Yes, if amount > 0 |
| Original contract value | `jobs.original_contract_value` | Yes, if fee proposal exists |
| Sub accept/decline state | `rfqs.status` | Yes |
| Package recipient accept | `rfq_recipients` | **No** — not read |

---

## 14. External integrations

| Integration | On win | Evidence |
|-------------|--------|----------|
| **Dropbox** | Quote PDF copy to ACCEPTED/DECLINED folders | `module4Routes.mjs:281–297` |
| **Buildxact** | `syncAcceptedQuoteToBuildexact` — **no-op stub** | `buildexactDeepIntegration.mjs:81–84` |
| **Buildxact PO** | On `po/issue` only, not win | `module4Routes.mjs:742+` |
| **Mail (Resend/Gmail/SMTP)** | outcome-mails + po/issue | Separate from win-finalize body |
| **Portal v2** | Client identity carry only | No notify on win |

---

## 15. Existing tests

| Test | Coverage | Status |
|------|----------|--------|
| P0-A5 / W05-API-08 | Board rfqs-only progress (pre-win context) | pass |
| W05-E2E-01 | Board smoke; full win → Operations **skipped** | partial |
| RFQ-16 | Win finalize | missing |
| `scripts/real_data_dryrun.mjs` | Uses won job + 096 trigger | ad hoc |
| `scripts/seed-e2e-suite.mjs` | Avoids premature `won` for seed | documented |

**No dedicated W09 API test skeleton yet** — planned in §21.

---

## 16. Drift risks

| ID | Risk | Severity | Evidence |
|----|------|----------|----------|
| **W09-DRIFT-001** | Win creates project but not full operations readiness | **High** | No schedule/procurement/WHS/portal auto — extends W05-DRIFT-009 |
| **W09-DRIFT-002** | Win handoff reads `rfqs` only; misses package-only accepts | **High** | No `rfq_recipients` in win path |
| **W09-DRIFT-003** | Cost intel skips `quoted_amount`-only accepts | **High** | Alias W08-DRIFT-006 |
| **W09-DRIFT-004** | Lead stage / won_at not synced | Medium | Alias W05-DRIFT-004 |
| **W09-DRIFT-005** | `cost_intelligence` partial if some accepted trades lack amount | Medium | Skip loop on null amount |
| **W09-DRIFT-006** | Batch PO passes empty `projectId` | Medium | Alias W05-DRIFT-005 |
| **W09-DRIFT-007** | Schedule / WHS / portal / procurement unmapped after win | **High** | No win-finalize writes |
| **W09-DRIFT-008** | Win emails split across win-finalize + outcome-mails | Low | Alias W05-DRIFT-006 |
| **W09-DRIFT-009** | Buildxact accepted quote sync is non-fatal stub | Medium | Alias W08-DRIFT-007 |
| **W09-DRIFT-010** | Mark Won allows incomplete SAM-W08-001 quote checklist | **High** | `winStep1Valid()` no amount gate |

---

## 17. Security / role risks

| Risk | Evidence | Mitigation |
|------|----------|------------|
| Unauthenticated win | win-finalize uses `requireAuth` | W09-SEC-01 test |
| Frontend direct `jobs.status = won` bypass | Possible via Supabase client if RLS allows | **Unconfirmed / needs testing** — 096 trigger would still create project |
| PO issue without mail config | Returns 503 | Documented in po/issue |
| Service role on win-finalize | Server bypasses RLS | Expected for orchestration |

---

## 18. Required handoff data

| Data | Required for safe ops start | Auto on win? |
|------|----------------------------|--------------|
| Real `jobs.address` | Yes (P0-A3) | Already on job |
| `projects` row | Yes | **Yes** (096) |
| Accepted trades with amounts | Yes for cost intel + POs | Partial — amounts manual |
| `original_contract_value` | Yes for finance/portal | Best-effort from fee proposal |
| `portal_client_email` | Yes for client comms | Copied if on job |
| Schedule tasks | Yes for site ops | **No** |
| Procurement items | Yes for ordering | **No** |
| WHS site profile | Yes for compliance | **No** |
| Lead pipeline sync | Yes for sales reporting | **No** |

---

## 19. Handoff failure risks

| Failure mode | Symptom | Current behaviour |
|--------------|---------|-------------------|
| win-finalize 502 after job flipped won | Job won, partial side effects | **Inferred:** 096 trigger still created project; rfq patches may be partial if fail mid-loop |
| Empty `quote_amount` on accepted | No cost_intel row | Silent skip — **W09-DRIFT-005** |
| Package-only quotes | Missing trades in wizard | Ops blind to those subs — **W09-DRIFT-002** |
| Batch PO with empty projectId | PO issue 400 | Banner shows but issue fails — **W09-DRIFT-006** |
| Outcome emails fail after win | Job won, subs not notified | Error shown; job state not rolled back — **W09-DRIFT-008** |
| Re-run win-finalize | Idempotent project enrich | **Verified from code** — safe re-run per comment |

---

## 20. Acceptance criteria

W09 mapping complete when:

1. Win-finalize sequence documented ✓
2. TenderDetail as sole win trigger documented ✓
3. rfqs-only accepted quote source confirmed ✓
4. Project 096 + enrich path confirmed ✓
5. cost_intelligence rules confirmed ✓
6. Lead / package / ops readiness gaps registered ✓
7. W09-DRIFT-001–010 registered ✓
8. W09 test plan added ✓
9. Minimum won-job checklist defined ✓

---

## 21. Required tests

**Planned only** — see [WORKFLOW_TEST_MATRIX.md](../WORKFLOW_TEST_MATRIX.md).

| ID | Scenario |
|----|----------|
| **W09-API-01** | win-finalize creates or updates `projects` row (096 trigger + enrich) |
| **W09-API-02** | win-finalize seeds `cost_intelligence` from accepted trades with `quote_amount > 0` |
| **W09-API-03** | win-finalize sets `jobs.status = won`, `jobs.won_at` |
| **W09-API-04** | win-finalize lead sync — confirm gap or implement (W09-DRIFT-004) |
| **W09-API-05** | Package-only accepted quote in win handoff — confirm gap (W09-DRIFT-002) |
| **W09-API-06** | Batch PO / po/issue readiness — confirm `projectId` gap (W09-DRIFT-006) |
| **W09-API-07** | Operations readiness checklist — document missing auto steps (W09-DRIFT-007) |
| **W09-API-08** | win-finalize rejects or warns when accepted trade has no `quote_amount` — confirm gap (W09-DRIFT-010) |
| **W09-UI-01** | TenderDetail win wizard shows accepted trades from `rfqs` correctly |
| **W09-E2E-01** | Tender Detail → Mark Won → Operations project visible |
| **W09-SEC-01** | win/lose/finalize routes require auth |

---

## 22. Open decisions for Sam

| ID | Topic | Recommendation |
|----|-------|----------------|
| **SAM-W09-001** | Minimum safe “won job” checklist before ops starts | **Project row + accepted rfqs with quote_amount + contract value + manual schedule/procurement/WHS/portal steps — surface as UI checklist post-win** (extends SAM-W05-005) |
| **SAM-W09-002** | Package-only accepted quotes at win time | **Block win wizard until rfqs mirror exists, OR warn prominently — do not silently omit** |
| **SAM-W09-003** | Auto-sync `leads.stage` on win | **Yes on win when `jobs.lead_id` set — defer implementation; document gap** (extends SAM-W05-004) |

---

## 23. Smallest safe fix plan

**No implementation until Batch B review and explicit approval per drift.**

### P1 (post Batch B review)

| Fix | Drift | Tests |
|-----|-------|-------|
| Pass `fj.project.id` to batch PO issue | W09-DRIFT-006 / W05-DRIFT-005 | W09-API-06 |
| Post-win readiness checklist banner (read-only) | W09-DRIFT-001 / W09-DRIFT-007 | W09-API-07, W09-UI-01 |
| Win wizard warn when package recipients accepted but rfqs stale | W09-DRIFT-002 | W09-API-05 |
| Win wizard warn/block when accepted trade lacks `quote_amount` | W09-DRIFT-010 | W09-API-08 |
| Lead stage sync on win-finalize | W09-DRIFT-004 | W09-API-04 |

### P2

| Fix | Drift |
|-----|-------|
| Block cost_intel skip — require quote_amount on accepted before win confirm | W09-DRIFT-003 / W09-DRIFT-005 |
| Single transactional outcome-mails or rollback flag | W09-DRIFT-008 |
| E2E win → Operations smoke | W09-E2E-01 |

### Deferred (explicit user constraint)

- Buildxact accept sync (stub remains)
- Auto procurement / schedule / WHS on win
- Package-first win path
- Tender Board / Package Detail changes

---

## Minimum safe “won job” checklist (staff)

Before treating a won tender as operations-ready:

| # | Check | Auto on win? |
|---|-------|--------------|
| 1 | Job status `won`, `won_at` set | Yes |
| 2 | `projects` row exists for `job_id` | Yes (096) |
| 3 | Every committed trade has `rfqs.status = accepted` with **`quote_amount > 0`** | Partial — wizard allows gaps |
| 4 | Package accepts mirrored to `rfqs` (if package path used) | **Manual verify** |
| 5 | `original_contract_value` / fee proposal aligned | Best-effort auto |
| 6 | Outcome emails sent to subs | Manual (separate API) |
| 7 | POs issued for accepted trades | Manual batch PO |
| 8 | Schedule generated | Manual (W12) |
| 9 | Procurement plan generated | Manual (W10) |
| 10 | WHS site profile created | Manual (W14) |
| 11 | Client portal enabled + invite sent | Manual (W18) |
| 12 | Lead pipeline shows `won` | **Not automatic** |

---

## Source-of-truth check

**Expected:** Win-finalize on Tender Detail is the canonical tender-win orchestrator; `projects` is the Operations spine; accepted `rfqs` with staff-confirmed `quote_amount` feed cost intelligence; full ops readiness requires manual follow-up.

**Confirmed:** `module4Routes.mjs` win-finalize, `096_auto_project_on_win.sql`, `TenderDetail.executeWin`, batch-po-check rfqs-only, no lead sync, Buildxact stub.

**Mismatch:** Package accepts not in win path; batch PO projectId bug; ops subsystems not auto-seeded; emails split across calls.

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-25 | W09 mapping answers + W09-DRIFT-009/010 + W09-API-08 |
| 2026-06-25 | W09 mapped — `/harden map W09`; Batch B mapping complete |
