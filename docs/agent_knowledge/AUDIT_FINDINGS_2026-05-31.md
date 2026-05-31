# Blue Leaf Hub — Parallel Audit Findings (2026-05-31)

> Method: 6 read-only module-cluster audit agents + 1 integration auditor, in parallel, against the
> local code + actual `supabase/migrations` schema. Dominant defect class (as predicted): code
> reading/writing **columns that don't exist** and **unchecked Supabase errors that fail silently**.
> Fix model: Claude fixes sequentially (single writer), verified with `npm test` + the seed job.

## STATUS
**FIXED + shipped + verified (14):** C1, C2, C3, C4, C5, C7, H2, H3, H4, H9, H10, M (cost-intel), L (carpentry BOTH), L (recorded_by). Safe tags: `safe-2026-05-31`, `safe-audit-14fixed`.
**REMAINING:** C6, C8, C9, H1, H5, H6, H7, H8, H11, H12, H13, H14, H15 + selected M. (Migration-gated → user applies: C6, H11, H12.)

## CRITICAL — broken workflows

| # | Cluster | file:line | Bug | Fix | Status |
|---|---|---|---|---|---|
| C1 | Sales | `salesRoutes.mjs` (PROJECT_FIELDS ~38/65/506, prompt) + `LeadDetail.jsx:283` | Writes `leads.floor_area_m2` — column is `floor_area_estimate` → transcript-apply UPDATE rejected | rename to `floor_area_estimate` | ☐ |
| C2 | Sales | `salesRoutes.mjs:519` | `leads` update has no `{error}` check → C1 makes all transcript edits silently vanish (still returns ok) | check error, surface | ☐ |
| C3 | CRM | `crmRoutes.mjs:423-436` | convert-to-lead inserts `notes`+`created_by` into `leads` (no such columns) → conversion 500s | drop those fields | ☐ |
| C4 | Tender | `module4Routes.mjs:691-694,721-722` | batch-po-check selects `rfqs.total_amount` (is `quote_amount`) + `subcontractors.phone` (is `mobile`) → 500 | fix column names | ☐ |
| C5 | WHS | `whsRoutes.mjs:211,246,252,265,283` | table `whs_reports` doesn't exist (is `site_reports`) → incident reports 100% broken | `.from("site_reports")` ×5 | ☐ |
| C6 | Schedule | `scheduleGenerate.mjs:325,331,362` | writes `task_type` `build`/`approval`/`inspection` — CHECK only allows `standard/milestone/procurement` → AI schedule insert rejected | map to allowed values OR migration to widen CHECK | ☐ |
| C7 | Marketing Intel | `marketingIntelligenceRoutes.mjs:517,1210,1352,1499` | `callAI()` called with wrong arg shape → 3 MI endpoints 502 + dashboard AI summary dead | instantiate Anthropic client, pass correct args | ☐ |
| C8 | Finance | `dev-api.mjs:778-779` + `financeRoutes.mjs ~1187-1828` | `financeRoutes` shadows the richer `financeCCRoutes` (registered 2nd) → inferior claim-schedule/no-PDF-send versions win; CC layer is dead code | delete duplicated handlers from financeRoutes (keep CC) — **verify FE payload field names first** | ☐ |
| C9 | Portal↔Finance | `portalRoutes.mjs:968,970-990` | portal budget reads `projects.contract_value` (stale; not synced on variation) + sums `portal_decisions` instead of `job_variations` → client sees wrong money | read `jobs.contract_value` + `job_variations` via `projects.job_id` | ☐ |

## HIGH

| # | Cluster | file:line | Bug | Fix |
|---|---|---|---|---|
| H1 | Tender | `rfqPackageRoutes.mjs:421-432` | inserts `rfqs.subcontractor_id=null` (NOT NULL) for ad-hoc recipients + unchecked error → silent break | skip rfqs insert when null OR relax column; check error |
| H2 | Tender | `rfqPackageRoutes.mjs:498` | writes `rfqs.accepted_at` (no such column) | remove from patch |
| H3 | Tender | `rfqTradeRoutes.mjs` (all) | write routes missing `requireAuth` → unauthenticated writes | add `requireAuth` |
| H4 | Ops | `operationsRoutes.mjs:174,336` | `subcontractors.phone` (is `mobile`) → trades/respond 500 | `mobile` |
| H5 | WHS | `whsMergeFields.mjs:52-66` + `whsEngineRoutes.mjs:80-89` | reads non-existent `projects.name/suburb/state/postcode/supervisor/client_name/project_type/storeys` → blank WHS docs + dead prefill | source from `jobs`/`project_metrics`/`portal_client_name`/`address` |
| H6 | WHS | `inductionRoutes.mjs:43,107` | `project_swms` read but never inserted by the WHS engine → induction SWMS always empty | write `project_swms` from derived `applicable_swms` |
| H7 | Workforce | `workforceRoutes.mjs:36,42` | `computeCost` never applies double-time (>threshold paid at 1.5× not 2×) → labour understated | add double-time band |
| H8 | Finance/WF | `financeCCRoutes.mjs:402-457` + `workforceRoutes.mjs:103` | `task_category`→`trade_category_id` never mapped → labour absent from per-trade budget-vs-actual (margin distortion) | map task_category→trade_category, fold into actualsByTrade |
| H9 | Marketing Intel | `marketingIntelligenceRoutes.mjs:1612,623` | writes non-existent `performance_score` + `engagement_rate` on `marketing_content_items` | drop those fields |
| H10 | Marketing | `marketingRoutes.mjs:1302` | writes non-existent `marketing_media_assets.updated_at` → manual analysis 500 | drop `updated_at` |
| H11 | Marketing Intel | `marketingIntelligenceRoutes.mjs:707,728,866,900` | `onConflict` references expression index → GSC/GA4 upserts fail/dedupe silently | real UNIQUE on plain cols OR select-then-write |
| H12 | CRM | `crmRoutes.mjs:935` | `rpc("increment_send_stat")` — function not defined → delivered_count never increments | create function or direct update |
| H13 | CRM | `crmRoutes.mjs:617,804,933,954` | reads `mailing_list_members.email_address` (no column) + `resend_email_id` never set → webhooks never match | join `crm_contacts.email`; capture per-recipient ids |
| H14 | Integration | `jobsApiRoutes.mjs:17-56` + `LeadDetail.jsx:1070` | `jobs.lead_id` never set on conversion (POST doesn't accept it) → spine reverse-link null | accept + persist `lead_id` |
| H15 | Integration | `LeadDetail.jsx:1073-1079` | lead→job drops `estimated_value`/`floor_area_estimate`/`design_stage`/`qualify_*` (lossy) | carry them (esp. estimated_value → original_contract_value) |

## MEDIUM / LOW (selected)
- M: `costIntelligenceRoutes.mjs:91-104` selects `cost_intelligence.roof_area/wall_area` (is `_m2`) → silent null benchmarks.
- M: `financeCCRoutes.mjs:2117,2128` WIPAA reminder queries impossible `jobs.status` values + `from("auth.users")` (not queryable) → reminders never send.
- M: `financeRoutes.mjs:1174` `getAdminEmail` queries `profiles` (is `user_profiles`, no email) → admin notifications silently to nobody.
- M: `marketingRoutes.mjs:994-1019` two video pipelines race on one asset.
- M: portal admin writes `projects` via anon client (bypasses server layer).
- M: `RfqEngine.jsx:966` client-side dedup by raw `ilike` not `address_normalised` → duplicate jobs.
- L: `CarpentryJobDetail.jsx:155` stale `CARPENTRY_PROJECT_TYPES.BOTH` (undefined; harmless via NOT NULL default).
- L: `financeRoutes.mjs:1845` `recorded_by: req.user?.id` always null (is `req.caller`).
- L: several routes raw `res.json` snake_case / leak raw Postgres errors (standards).
- M: unchecked `{error}` on money writes (financeCCRoutes:1083 payment, :250 budget-history; financeRoutes:1115,1289,1800).

## Structural (bigger, deliberate)
- **Finance route shadowing** (C8) — collapse to one finance module.
- **Carpentry island** — `carpentry_jobs` has no `job_id`; duplicates canonical facts.
- **Portal duplicates finance/schedule** (claims/variations/milestones/contract_value) with no sync (C9 + H).
- **Facts service unused** — `getJobProfile`/`setFact` have zero callers (Phase 0 not yet wired — expected).
- **contract_value dual-write** (mig-034 trigger + JS recompute) — pick one Generated mechanism.

## Fix batches (order)
1. **Batch A — quick column-name / silent-failure fixes** (C1–C5, C7, H2, H4, H9, H10, M cost-intel, L recorded_by): one-line corrections, independent, high impact. ← start here.
2. **Batch B — schedule CHECK (C6)** + **rfq auth (H3)** + **rfq ad-hoc recipient (H1)**.
3. **Batch C — finance route de-shadowing (C8)** — careful, verify FE payloads.
4. **Batch D — portal↔finance truth (C9, H-claims)** + **WHS→project_swms (H6)** + **lead→job carry/lead_id (H14,H15)**.
5. **Batch E — CRM email pipeline (H12,H13)**, **workforce double-time (H7)**, **task→trade mapping (H8)**, **MI onConflict (H11)**.
