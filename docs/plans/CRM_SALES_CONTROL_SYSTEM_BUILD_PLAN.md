# CRM / Sales Control System — Build Plan

> Deliverable: save to `~/Desktop/blue-leaf-hub.nosync/docs/plans/CRM_SALES_CONTROL_SYSTEM_BUILD_PLAN.md` on approval.
> Plan only — no product code changes, no live integrations, no emails, no deploy.

## Context

Blue Leaf Hub already has a working Sales Pipeline, CRM Contacts, and Marketing Intelligence
foundation, but they operate as **three loosely-linked systems**, not one lead-control system. The
business needs the CRM to do four things reliably: **(1) capture the lead, (2) qualify the fit,
(3) control the next step, (4) track what marketing worked.** Today: capture is split across paths
with inconsistent fields; "fit" is only an ordinal pipeline stage + a 0–8 qualify score (no explicit
quality/readiness); next-action is a passive free-text field, not a driven queue; and the
marketing→revenue loop is stubbed (`pipeline_value: null // until joined`). This plan turns the
existing foundation into a control system, with **all four pillars delivered as a thin end-to-end
slice** and **marketing attribution built to full closed-loop ROI**.

Decisions taken with Sam: **fit = two axes** (`fit_quality` × `readiness`; architect-led stays on
`lead_type`). **Posture: harden, don't rebuild** — additive columns, read-only views, and reuse of
existing components; no module is torn down and no history table is migrated. Attribution ROI is the
right long-term target but is **staged after** the control spine is stable, to avoid building ROI on
unstable CRM fields. **Build 1 = Batch 1A (CRM control spine) only**; trust rail + unified timeline
(1B) and closed-loop attribution/ROI (1C) follow as separate, later batches. AI fit-suggestions are
deferred — build 1 is **manual tags + rule-based due-date defaults, no AI mutation**.

---

## 1. Current achieved state (evidence)

**Leads (`016` + adds):** full contact/project/value/pipeline schema; APB 8-stage
`stage` enum (enquiry→…→won + nurture/lost); qualify_* (budget/timeframe/site/decision_maker, 0–2
each) → generated `qualify_score` (0–8); `next_action`,`next_action_date`,`last_activity_at`,
`stage_entered_at`; `lead_type` (standard|architect_tender, `024`); website fields `name`,
`project_description`, `first_replied_at` (`063`); winning-offer context `wo_*` (`048`); attribution
copies `first_touch_source/medium`, `last_touch_*`, `utm_campaign` (`062`); `lead_source` (free text);
`lead_source_cost` (`021`); `referred_by_contact_id`→crm_contacts; carry provenance to jobs via facts
(`078`).
**Capture paths:** manual (`SalesPipeline` AddLeadDrawer), website enquiry (`POST /api/public/enquiry`),
architect fast-track (jumps to `accepted`). No referral-intake or lead-magnet path.
**History tables (each single-purpose):** `lead_activities` (immutable event log + next_action),
`lead_notes` (internal/client-facing), `lead_conversations` (transcript + Claude `bp_suggestions`),
`lead_documents`.
**CRM (`061`):** `crm_contacts` (with `converted_lead_id`→leads, `relationship_score`, referral rollup),
`crm_interactions` (**has `lead_id` FK already**, type incl. `content_sent`), `mailing_lists`,
`mailing_list_members` (consent), `email_sends`, `email_send_recipients` (`resend_email_id`,
open/click/bounce), `email_unsubscribes`. Convert: `POST /api/crm/contacts/:id/convert`.
**Marketing (`062`):** `attribution_events` (session events, `lead_id` set post-enquiry),
`enquiry_attribution` (per-lead first/last touch + `assisted_content_item_ids`, `UNIQUE(lead_id)`),
aggregate snapshots (GSC/GA4/GBP/Meta) → `marketing_content_items` performance.

## 2. Gaps (what blocks "control")

- **Capture:** inconsistent field sets per path; no referral-intake or lead-magnet capture; website
  enquiry with no prior events writes `lead_source` but never `enquiry_attribution` → NULL first-touch.
- **Fit:** no quality/readiness classification; `qualify_score` weights equal, no recency/decay; stage
  ≠ temperature (a lead parked 6 months still reads "well qualified").
- **Next-action:** `next_action` is passive free text; no action *type*, no SLA/cadence, no driven
  queue, no auto-escalation. Overdue is computed ad hoc in the UI.
- **Trust rail:** attribution fields + touches exist but are **not surfaced** on Lead Detail; no
  objections/fears/priorities structure; emails-opened live on `email_send_recipients` (contact-keyed),
  never joined to the lead.
- **Attribution (closed loop broken):** conversion doesn't carry first/last touch or content touches to
  the job; won revenue never written back; `fee_proposals` has **no `lead_id`**; email campaigns
  (contact-keyed) never credited to leads; `enquiry_attribution` immutable → post-enquiry nurture
  touches invisible; assisted content not credited; dashboard `pipeline_value` hard-coded null.
- **Fragmentation:** a converted contact's history splits across `crm_interactions` (pre-convert, and
  post-convert only if `lead_id` is backfilled — it isn't) + `lead_activities` + `lead_notes`; **no
  single timeline**. `content_sent` is free text (no asset id). No phone dedup / merge.

## 3. Target data model (additive, non-destructive)

New/changed columns and tables (migrations `126+`; exact numbers assigned at build time):

**Leads — fit + control (Batch 1A):**
- `fit_quality` text enum: `strong|possible|nurture|poor|price_shopper` (nullable, **human-set only in
  build 1**).
- `readiness` text enum: `early_research|not_ready_yet|ready_for_consult` (nullable).
- `fit_set_by`, `fit_set_at` (provenance of the last human/AI fit change).
- `action_type` text enum for the queue: `response_due|no_reply_follow_up|plans_requested|
  plans_received|proposal_follow_up|nurture_check_in|lost_review|reactivation` (nullable — the
  *current* required action; complements existing `next_action`/`next_action_date`).
- `action_due_at` timestamptz (drives SLA); `snoozed_until` timestamptz (defer without losing the item).
- Keep `lead_type` for architect-led (no change).
- **Mandatory manual attribution (Batch 1A):** `lead_source_category` text enum
  (`website|referral|repeat|social|search|advertising|walk_in|other`) — every lead must have one.
  Plus light normalisation of the existing free-text `lead_source` (trim/lowercase/map to category).
  This alone answers "which marketing produces good leads?" when crossed with `fit_quality` — **before**
  any multi-touch machinery.

**Leads — trust signals (structured) — Batch 1A creates the table; rail UI is Batch 1B:**
- `lead_signals` jsonb OR a small `lead_signals` table (`lead_id`, `kind`
  ∈ objection|fear|priority, `label`, `detail`, `status` open|addressed, `created_at`). Recommend a
  **table** (aggregatable across the pipeline; free text stays in notes). Seeded from
  `wo_biggest_concern` / `wo_most_excited_about` on backfill.

**Attribution — closed loop (Batch 1C — deferred; not in first build):**
- `fee_proposals.lead_id` uuid→leads (currently missing) — the key join for proposal-level attribution.
  **Own schema+API batch with tests before any dashboard uses it**, because it touches fee-proposal,
  sales, tender and finance flows.
- `enquiry_attribution` additions: `won_value` numeric, `won_at` date, `stage_at_report` — revenue
  writeback; `allocation_model` text (`first|last|linear|position`) default `position`.
- `lead_touch_events` **append-only table** (unifies + makes touches mutable post-enquiry):
  `id, lead_id, occurred_at, channel (organic|paid|social|email|referral|direct|offline),
  source, medium, campaign, content_item_id, email_send_id, weight numeric, meta jsonb`. Populated by:
  attribution_events (on link), email opens/clicks (via contact→lead), logged offline touches. This is
  the spine for multi-touch allocation and replaces the immutable single-row limitation.

**Unified read model (no data moved) — `v_lead_timeline` is Batch 1B; `v_lead_attribution_roi` is Batch 1C:**
- DB **view** `v_lead_timeline` = UNION of `lead_activities`, `lead_notes`, `lead_conversations`,
  `crm_interactions` (by `lead_id` OR `contact.converted_lead_id`), and `email_send_recipients`
  events, projected to `(lead_id, occurred_at, kind, actor, summary, detail, ref_id)`. Read-only;
  originals untouched.
- DB **view** `v_lead_attribution_roi` = leads ⋈ enquiry_attribution ⋈ lead_touch_events ⋈ jobs
  (contract value) → per source/campaign/content: leads, fit mix, proposals, accepted, won, won_value,
  cost (`lead_source_cost`), ROI. Fixes the `pipeline_value: null` stub.

## 4. Target UI model

- **Sales Pipeline (`SalesPipeline.jsx`):** add **Fit** column (quality chip + readiness chip) and
  filters; a real **Action Queue** view grouped by the 8 `action_type` buckets, sorted by
  `action_due_at`, with overdue/ due-today/snoozed states; KPI cards driven by the queue.
- **Lead Detail (`LeadDetail.jsx`):**
  - Fit controls (two dropdowns) with AI-suggested values from `bp_suggestions` (accept/override).
  - **Trust-context rail** (right): first touch / last touch, pages visited, lead-magnet download,
    articles read, emails opened, brochure/project-examples sent (`content_sent` + `wo_reference_project_ids`),
    and an **objections / fears / priorities** list from `lead_signals` (add/resolve inline).
  - **Unified timeline** tab sourced from `v_lead_timeline` (one stream: activities + notes +
    conversations + CRM interactions + email opens).
- **CRM `ContactDrawer`:** show the same unified history (contact + its converted lead) so nothing is
  hidden post-convert; "content sent" gains an optional asset picker (content_item / reference_project).
- **Marketing:** a **source → fit → proposal → won ROI** table/dashboard from `v_lead_attribution_roi`.

## 5. Automation rules

- **Build 1 = manual + rule-based only. No AI mutation.** Fit_quality, readiness and action_type are
  set by hand; the only automation in 1A is **rule-based due-date defaults** (below).
- **Fit auto-nudge (Batch 1C+ / deferred — suggest, never silently overwrite):** ≥90 days no reply →
  suggest `readiness=not_ready_yet`; price-signal keywords → suggest `fit_quality=price_shopper`;
  qualify_score ≥6 + design_stage≥da_approved → suggest `readiness=ready_for_consult`.
- **Action queue derivation:** on stage/interaction change, set `action_type`+`action_due_at` by rule
  (e.g., new enquiry → `response_due` +1 business day; plans requested → `plans_requested`; proposal
  sent → `proposal_follow_up` +3 days; nurture → `nurture_check_in` cadence; lost → `lost_review`;
  dormant ≥N days → `reactivation`). Overdue surfaces in KPIs; `snoozed_until` hides until due.
- **Attribution:** on convert, stamp job facts `first_touch_*`, `content_touch_ids`; on win, write
  `won_value`/`won_at` back to `enquiry_attribution` + recompute `lead_touch_events.weight` under the
  chosen `allocation_model` (default position-based 40/20/40); on `crm_contacts.convert`, **backfill
  `crm_interactions.lead_id`** and thereafter link email opens/clicks to the lead.
- SLA breach + fit auto-nudges are **suggestions/alerts**, not auto-mutations of client-facing state.

## 6. Data clean-up (unified read model, non-destructive)

- **Do not migrate/merge data.** Add the two read-model **views** (§3) as the single source for
  timeline + ROI. Keep each write table single-purpose.
- **Backfill (idempotent, reversible):** set `crm_interactions.lead_id` for already-converted contacts
  (loop on convert + one-time script); seed `lead_signals` from `wo_biggest_concern`/`wo_most_excited_about`;
  create `enquiry_attribution` rows for leads that have `lead_source` but no attribution (mark
  `source=manual/offline`).
- **Dedup:** add phone-normalised lookup on contact/lead create (warn on match); a lightweight
  **merge-contacts** action is a **non-goal for build 1** (flag only).

## 7. Acceptance criteria

**Batch 1A (first build) — must all pass to ship:**
- Every lead-creation path **requires `lead_source_category`**; no lead can be created without one.
- `fit_quality` and `readiness` are settable by hand, render as chips in Pipeline + Detail, and are
  filterable.
- The **Action Queue** lists every lead needing action in the correct one of 8 buckets, ordered by
  `action_due_at`, with overdue + snooze working; due dates default by rule on stage change.
- A **source × fit_quality** report answers "which source produces good leads" (no ROI math yet).
- Additive only: no existing table altered destructively; existing sales/CRM flows unregressed.

**Later batches (1B/1C):**
- Every lead has an `enquiry_attribution` row (incl. manual/offline). No NULL-source leads.
- A lead can be classified `fit_quality`×`readiness`; both show as chips in Pipeline + Detail and are
  filterable; AI suggestions appear from a conversation and can be accepted/overridden.
- The Action Queue lists every lead needing action in the correct one of 8 buckets, ordered by due
  date, with overdue and snooze working.
- Lead Detail rail shows first/last touch, touch list, emails opened, content sent, and
  objections/fears/priorities; the unified timeline shows activities + notes + conversations + CRM
  interactions + email opens in one stream.
- `v_lead_attribution_roi` returns real numbers (leads→proposals→won→won_value→ROI) per source and
  content; the marketing dashboard `pipeline_value` is no longer null.
- No existing table's data is altered destructively; all originals still queryable.

## 8. Testing plan

- **Unit/logic:** fit auto-nudge rules; action_type derivation per stage transition; multi-touch weight
  allocation (first/last/linear/position sum to 1.0); attribution compute for the 3 capture scenarios
  (web+events, web-no-events, manual/CRM).
- **Data/views:** seed a synthetic lead journey (touch→enquiry→proposal→won) using the
  `__BLH TEST__` marker via `buildTestJobAddress()`; assert `v_lead_timeline` unions all sources and
  `v_lead_attribution_roi` reports the won value against the first/assisted content.
- **Backfill:** verify `crm_interactions.lead_id` backfill is idempotent and reversible; verify no row
  counts drop.
- **API/UI:** endpoint contracts return camelCase; Pipeline filters + Action Queue render; Lead Detail
  rail + timeline load; regression on existing sales/CRM SOP §14 scripts (W01/W02/CRM).
- Cleanup dry-run only (`npm run test:cleanup-artifacts`, never `--confirm`).

## 9. Implementation batches (Cursor-ready, safe order)

**► BATCH 1A — CRM control spine (THIS is the first build; ship + prove before anything else):**
1. **Schema** — migration: `leads.fit_quality`, `readiness`, `fit_set_by/at`, `action_type`,
   `action_due_at`, `snoozed_until`, `lead_source_category`; `lead_signals` table. Additive, idempotent,
   manual-apply. (No touch tables, no ROI views, no `fee_proposals` change.)
2. **API** — set fit_quality/readiness/action_type/snooze; action-queue GET (derive the 8 buckets from
   lead state); rule-based due-date defaults on stage/interaction change; `lead_source_category` required
   on every create path + light `lead_source` normalisation. No AI.
3. **Sales Pipeline UI** — fit chips (quality + readiness) + filters; a simple **Action Queue** view
   grouped by the 8 buckets, ordered by `action_due_at`, with overdue/snooze; reuse existing
   `SalesActionQueue` where possible.
4. **Lead Detail UI** — two manual fit dropdowns + source_category selector (reuse existing panels; add
   controls, don't rebuild the page).
5. **Tests + SOP touch-ups** — `__BLH TEST__` fixtures for fit/queue/source-required; update Sales/CRM
   SOP §14 for the new fields.
*1A explicitly excludes: ROI dashboard, email attribution, proposal writeback, AI suggestions,
`lead_touch_events`, `fee_proposals.lead_id`.*

**► BATCH 1B — trust rail + unified timeline (after 1A is stable):**
6. `v_lead_timeline` view (union, read-only) + endpoint; Lead Detail **trust rail** (first/last touch,
   touches, emails opened, content sent, objections/fears/priorities from `lead_signals`); same unified
   history surfaced on CRM `ContactDrawer`; backfill `crm_interactions.lead_id` on convert (+ one-time
   idempotent script); seed `lead_signals` from `wo_*`.

**► BATCH 1C — closed-loop attribution + ROI (staged last, largest):**
7. **Proposal-join sub-batch (guarded, own tests first):** add `fee_proposals.lead_id`; wire + verify in
   isolation across fee-proposal/sales/tender/finance **before** any dashboard consumes it.
8. `lead_touch_events` spine + `enquiry_attribution` revenue cols; carry-on-convert; won writeback;
   multi-touch allocation; email↔lead credit; `v_lead_attribution_roi`; kill `pipeline_value:null`.
9. Full §8 test suite + Marketing/CRM/Sales SOP updates (SOP_INDEX/CHANGELOG).

Each batch: lint + build green; commit per batch; **do not deploy** without Sam's review (shared
`portal-v2` branch also carries an autonomous hardening loop — stage only the batch's own files, never
`git add -A`).

## 10. Non-goals (first build = Batch 1A)

- **Everything in 1B and 1C** — trust rail, `v_lead_timeline`, closed-loop attribution, ROI dashboard,
  `lead_touch_events`, email→lead attribution, won-revenue writeback, and `fee_proposals.lead_id` are
  **all deferred** out of the first build. 1A ships the control spine only.
- **AI fit/readiness suggestions** — manual tags + rule-based due dates only in build 1.
- **Merge-contacts UI** and full phone/email de-dup resolution (warn only).
- **Predictive/ML lead scoring** — rules + AI-suggestions only, no model.
- **New public lead-magnet/referral web forms** — add the *fields/paths* and capture, not new
  marketing site pages.
- **Email deliverability / sending changes** — attribution reads existing `email_send_recipients`; no
  new sends.
- **Retroactive rewrite** of historic free-text `lead_source` — normalise going forward + a mapping
  table, don't destroy history.
- **Buildexact/finance write-backs** from attribution — ROI is read-only reporting when it lands (1C).
- **No module rebuild** — additive columns + reused components only; SalesPipeline/LeadDetail/CRM pages
  are extended in place, not replaced.

## Verification

**Batch 1A:** create a `__BLH TEST__` lead — confirm creation is blocked without `lead_source_category`;
set `fit_quality`+`readiness` and confirm chips + filters in Pipeline and Detail; confirm the lead lands
in the correct Action Queue bucket with a rule-defaulted due date and that snooze/overdue work; run the
source × fit report. `npm run lint` + `npm run build` pass; cleanup dry-run leaves data intact.

**Later (1C) full-journey:** create a `__BLH TEST__` lead
with touches → set fit → confirm it appears in the correct Action Queue bucket → convert → win →
assert `v_lead_attribution_roi` shows the won value attributed to source + content, and
`v_lead_timeline` shows the unified stream. Confirm `npm run lint` + `npm run build` pass; cleanup
dry-run leaves data intact.
