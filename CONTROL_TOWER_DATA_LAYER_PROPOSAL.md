# Control Tower — Backend Data Layer Proposal

**Status:** PROPOSAL — for approval before implementation
**Date:** 2026-06-17
**Scope:** Read-only executive intelligence layer over Blue Leaf Hub
**Author:** Control Tower (codebase audit)

---

## 1. Executive summary

The Control Tower needs structured, read-only access to Blue Leaf Hub data so it can produce
health scores, procurement forecasts, commercial and compliance intelligence — without ever
mutating business data or taking consequential actions.

The good news from the audit: **the Hub already exposes most of the intelligence the Control
Tower needs through existing aggregate API endpoints**, and it already has a clean auth model
(`requireAuth` + `requireRole`), a strict response standard (`apiResponse.mjs`), and a service-role
Supabase client that is correctly kept server-side only.

The recommendation is therefore **not** to build a parallel database connection or expose new raw
table access. It is to add a thin, **read-only `registerControlTowerRoutes` module** that composes
existing data, plus two **new additive tables** — a findings log and an approval queue — that are
the Control Tower's *own* records and touch no existing module data.

This keeps the integration safe by construction: the Control Tower can read everything and write
only to its own two tables, and every suggested action becomes a queued, human-approved item.

---

## 2. Where Supabase is configured (audit finding)

| Layer | Module | Key used | RLS | Notes |
|---|---|---|---|---|
| **Server** | `server/lib/supabaseService.mjs` → `getServiceSupabase()` | `SUPABASE_SERVICE_ROLE_KEY` | **Bypassed** | Service role; only ever used server-side. Returns `null` if env missing — all callers guard. |
| **Frontend** | `src/lib/supabaseClient.js` → `getSupabase()` | `VITE_SUPABASE_ANON_KEY` | **Enforced** | Anon key, browser only. Auth session in local/sessionStorage. |
| **Auth middleware** | `server/lib/requireAuth.mjs` | Validates Supabase Bearer JWT, loads `user_profiles.role`, blocks inactive accounts | — | `requireRole("admin","supervisor",…)` gates sensitive routes. |

**Implication for the Control Tower:** it must run **server-side only**, using the existing
service-role client. The service-role key must never be exposed to the frontend (it currently isn't —
this rule must be preserved). The Control Tower API surface itself sits behind `requireAuth` +
`requireRole("admin")` (director-only).

---

## 3. What tables exist (condensed)

The Hub has ~90 migrations and a documented spine architecture (Party / Lead / Job). The tables
that matter for executive monitoring, grouped by the Control Tower's intelligence domains:

**Project / job spine**
- `jobs` — core record: `status`, `contract_value`, `won_at`, `client_name`, `address`, `lead_id`
- `projects` — 1:1 operations record: `status`, `accepted_trades`, `commencement_date`, portal config
- `project_metrics` — building facts + `overall_complexity_score`

**Scheduling**
- `schedule_tasks` — `phase`, `status`, `start_date`, `end_date`, `depends_on`, `is_hold_point`
- `schedule_baseline_eot` — baseline vs actual, `status` (on_track / eot_flagged)

**Procurement** (canonical source: migration 085/092)
- `procurement_items` — `order_by_date` (generated), `risk_status`, `status`, `cost_allowance` vs `approved_amount`
- `purchase_orders`, `trade_communication_log` (ghosting detection), `supervisor_tasks`, `suppliers`

**Commercial / finance**
- `financial_documents` — invoices: `amount_total`, `status`, `match_confidence`
- `progress_claims`, `job_variations`, `wipaa_reviews`, `fee_proposals`
- WIP/margin fields on `jobs` (`margin_percent_to_date`, `forecast_margin`)

**WHS / compliance**
- `whs_site_profiles` — derived `applicable_swms` / `applicable_permits` / `required_inspections`
- `site_reports` — incidents/hazards: `severity`, `status`
- `contractor_compliance` — insurance/licence expiry; `site_inductions`

**Sales / CRM / marketing**
- `leads` (+ `qualify_score`), `crm_contacts` (`relationship_score`), `cost_intelligence_insights`,
  `marketing_intelligence`, `campaign_metrics`

**Knowledge Core / provenance** (migration 069)
- `job_fact_history`, `job_events`, `job_documents` — append-only audit/provenance spine

**Existing health/insight signals already present** (reuse, don't rebuild):
`cost_intelligence_insights` (severity-tagged alerts), `job_nps_scores`, `operations/projects`
health colour, `operations/trade-conflicts`.

> Full table-by-table catalogue available on request — kept out of this doc for brevity.

---

## 4. What API routes exist — and which the Control Tower may use

### 4a. Read endpoints the Control Tower should consume (safe, aggregate)

| Domain | Endpoint | Gives the Control Tower |
|---|---|---|
| Operations | `GET /api/operations/projects` | Per-project schedule health, % complete, overdue count, next milestone, health colour |
| Operations | `GET /api/operations/trade-conflicts` | Cross-project trade clashes |
| Operations | `GET /api/operations/global-tasks` | All active tasks across projects |
| Procurement | `GET /api/procurement/command-centre` | Overdue / due-soon / blockers / awaiting-quote / delivery-risk buckets |
| Procurement | `GET /api/procurement/long-lead` | Long-lead criticals across jobs |
| Finance | `GET /api/finance/jobs/:jobId/command-centre` | Margin, claims, actuals, pending approvals, insights per job |
| Finance | `GET /api/finance/jobs/:jobId/wipaa/current` | Cost-to-date, forecast margin, % complete |
| Finance | `GET /api/finance/stats` | Invoice counts by status, total approved value |
| Sales | `GET /api/sales/scorecard` | Pipeline by stage, close rates, won last 12m |
| CRM | `GET /api/crm/dashboard` | Overdue actions, relationships, speed-to-lead |
| Admin | `GET /api/ai-costs/summary` | AI spend by module/model |

Where an aggregate endpoint doesn't exist for a domain the Control Tower needs (e.g. a
**WHS compliance roll-up** across projects, or a **portfolio-wide health index**), the new
read-only module composes it from base tables via the service-role client — still SELECT-only.

### 4b. Consequential writes the Control Tower must NEVER call directly

These are the actions that change money, programme, client relationships or compliance state.
Every one of them becomes an **approval-queue item**, never an automatic call:

1. `POST /api/sales/leads/:id/convert-to-job` — lead→job conversion
2. `POST /api/tender/win-finalize` / `lose-finalize` — sets contract value, stamps facts
3. `POST /api/po/issue` — issues + emails a purchase order
4. `POST /api/finance/documents/:id/approve` — approves an invoice
5. `PATCH /api/finance/jobs/:jobId/financials` (`financial_locked=true`) — triggers procurement plan
6. `POST /api/finance/jobs/:jobId/claims/:claimId/send` — emails a progress claim
7. `POST /api/fee-proposal/send` — emails a fee proposal
8. `POST /api/crm/sends/:sid/send` — sends a bulk email campaign
9. `POST /api/trade-communication/respond` — records trade response, triggers escalation
10. Timesheet approval — syncs labour to Buildexact

This list maps directly to the Control Tower charter ("may not approve contracts, issue POs,
approve expenditures/variations, send emails…").

---

## 5. Proposed architecture

```
                    ┌─────────────────────────────────────────────┐
                    │  Director (admin role, JWT)                  │
                    └───────────────┬─────────────────────────────┘
                                    │  requireAuth + requireRole("admin")
                    ┌───────────────▼─────────────────────────────┐
                    │  registerControlTowerRoutes (NEW, read-only) │
                    │  server/lib/controlTower/                    │
                    │   • briefService      → daily director brief │
                    │   • healthService     → project health scores│
                    │   • procurementForecast (4/8/12/26 wk)       │
                    │   • commercialIntel / whsIntel / supplierIntel│
                    │   • findingsLog (writes ct_findings)         │
                    │   • approvalQueue (writes ct_action_queue)   │
                    └───────┬───────────────────────────┬─────────┘
                            │ SELECT only               │ INSERT/UPDATE
                            │ (service role)            │ (own 2 tables only)
          ┌─────────────────▼──────────────┐   ┌────────▼─────────────────┐
          │ Existing tables + aggregate     │   │ ct_findings              │
          │ API endpoints (READ)            │   │ ct_action_queue          │
          │ jobs, projects, schedule_tasks, │   │ (NEW, additive)          │
          │ procurement_items, finance, WHS │   └──────────────────────────┘
          └─────────────────────────────────┘
```

**Three guarantees, enforced structurally:**

1. **No destructive writes** — the Control Tower's data client is a wrapper around the service-role
   client that only permits SELECT on existing tables, and INSERT/UPDATE on exactly two
   Control-Tower-owned tables. (See §6.)
2. **No automatic actions** — the Control Tower never calls a write endpoint from §4b. The most it
   can do is create a row in `ct_action_queue` with a recommended action. A human reviews and
   executes it through the normal Hub UI.
3. **Full audit** — every finding and recommendation is logged in `ct_findings`; every suggested
   action in `ct_action_queue` with status and who approved/rejected it.

---

## 6. Read-only enforcement (how "read-only first" is guaranteed in code)

A dedicated accessor, e.g. `server/lib/controlTower/ctData.mjs`:

```js
// Pseudocode — for review, not final
import { getServiceSupabase } from "../supabaseService.mjs";

const CT_WRITABLE = new Set(["ct_findings", "ct_action_queue"]);

export function ctRead(table) {
  // returns a query builder restricted to .select() — caller cannot mutate
  return getServiceSupabase().from(table).select;
}

export function ctWrite(table) {
  if (!CT_WRITABLE.has(table)) {
    throw new Error(`Control Tower may not write to ${table}`);
  }
  return getServiceSupabase().from(table);
}
```

Belt-and-braces options (recommend at least one, ideally both):
- **Application guard** (above) — the only write path is via `ctWrite`, whitelisted to 2 tables.
- **Database role** — provision a dedicated Postgres role `control_tower_ro` with `SELECT` on all
  business tables and `INSERT/UPDATE` only on the two CT tables, used via a separate connection
  string (`SUPABASE_CT_DB_URL`). This makes read-only a hard DB-level constraint, not just code.

Either way: **service-role key stays in server env vars only**, never shipped to the frontend
(consistent with current `vercel.json` / Railway split).

---

## 7. New tables (additive — touch nothing existing)

Proposed migration `095_control_tower.sql`:

**`ct_findings`** — the Control Tower's log of everything it observes
- `id`, `created_at`, `updated_at`, `domain` (procurement/schedule/financial/compliance/client/safety/system),
  `module` (affected module), `severity` (info/watch/warning/critical),
  `job_id` + `project_id` (nullable FKs — the affected project),
  `title`, **`symptom`, `root_cause`, `recommended_fix`, `approval_requirement`
  (none/supervisor/director), `confidence` (0–1)** — the six required analytical fields,
  `evidence` (jsonb — the source numbers), `score_impact` (int, nullable),
  `status` (open/acknowledged/resolved/expired), `data_hash` (unique per open finding — dedup),
  `expires_at`, `detected_by`

**`ct_action_queue`** — recommended actions awaiting human decision
- `id`, `created_at`, `finding_id` (FK), `job_id` (nullable), `recommended_action` (text),
  `action_type` (e.g. issue_po / chase_rfq / approve_invoice / raise_eot / send_reminder),
  `target_endpoint` (the §4b route a human *could* use — informational only),
  `payload_preview` (jsonb), `impact`, `effort`, `risk_reduction`,
  `status` (pending/approved/rejected/done), `decided_by`, `decided_at`, `decision_note`

Both are RLS-locked to authenticated admins (consistent with migration 044 pattern). Neither has
any trigger or FK that writes back into business tables.

---

## 8. Project Health Score (proposed model)

Per the charter: score 0–100 across **Procurement, Scheduling, Financial, Compliance,
Documentation, Client, Safety**. Proposed initial weighting (tunable):

| Category | Weight | Primary signals (read-only) |
|---|---|---|
| Safety | 20 | open critical/high `site_reports`, expired `contractor_compliance` |
| Compliance | 15 | missing/stale WHS docs, overdue inspections, induction gaps |
| Financial | 20 | `forecast_margin` vs target, overdue invoices, unapproved variations |
| Scheduling | 15 | overdue `schedule_tasks`, EOT-flagged baseline, critical-path slip |
| Procurement | 15 | `procurement_items.risk_status` (at_risk/critical/blocked), order-by breaches |
| Client | 10 | open `portal_decisions` overdue, unanswered portal messages, NPS |
| Documentation | 5 | stale/superseded `job_documents`, missing key docs |

Thresholds from charter: **<80 attention, <60 escalation, <40 immediate intervention.** Each score
always ships with the *why* (the contributing findings), never a bare number.

**Weights are configurable, not hard-coded.** The values above are the agreed Phase-1 defaults.
They will live in a single config (a `ct_settings` row or constants module) so a director can tune
them later without a code change. Every finding the engine emits carries the six required analytical
fields — **symptom, root cause, recommended fix, approval requirement, affected project/module, and
confidence level** — which are first-class columns on `ct_findings` (see §7).

---

## 9. Phased delivery plan

**Phase 0 — Foundation (this approval)**
Confirm scope, create `095_control_tower.sql` (two tables), add `ctData.mjs` read-only accessor,
register an empty `registerControlTowerRoutes` behind `requireAuth + requireRole("admin")`.

**Phase 1 — Read & score**
`GET /api/control-tower/projects/health` (portfolio + per-project scores with reasons),
`GET /api/control-tower/brief` (daily director brief composed from existing aggregate endpoints).
Pure reads; writes findings to `ct_findings` only.

**Phase 2 — Forecast & queue**
Procurement forecast (4/8/12/26 wk) from `procurement_items` + schedule; populate
`ct_action_queue` with recommendations (no execution). Director dashboard reads both CT tables.

**Phase 3 — Dashboard + scheduled brief**
Control Tower dashboard page (or a live artifact) summarising scores, critical findings, and the
approval queue. Optional scheduled daily brief.

Each phase is independently shippable and adds zero risk to existing modules.

**Future phases (approved in principle — design later)**
- **Lessons-learned engine** — capture recurring findings and outcomes across completed jobs into a queryable knowledge base, so the Control Tower learns from past mistakes and surfaces "we've seen this before" warnings on new projects.
- **Supplier intelligence engine** — longitudinal supplier/subcontractor performance: response rates, quote quality, lead-time reliability, ghosting, pricing trends; preferred vs high-risk vs replace.
- **Continuous improvement recommendations** — system/workflow analysis ranking automation and simplification opportunities by impact / effort / risk-reduction / time-saved, fed into `ct_action_queue`.

All three are read-only over business data and write only to the Control Tower's own tables; none introduce autonomous actions.

---

## 10. What I need from you to proceed

1. **Approve the approach** (read-only composition layer + 2 additive tables + approval queue).
2. **Read-only enforcement preference:** application guard only, or also a dedicated
   `control_tower_ro` Postgres role (recommended for hard DB-level safety)?
3. **Backend access for me to build against:** a `SUPABASE_SERVICE_ROLE_KEY` (and optional
   `SUPABASE_CT_DB_URL`) in a server env I can use, or should I build against the codebase and
   you deploy?
4. **Health-score weights** — accept the §8 defaults or adjust.

No code will be written until you approve. On approval I'll start with Phase 0.
