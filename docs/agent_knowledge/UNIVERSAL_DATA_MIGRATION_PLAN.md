# Blue Leaf Hub — Universal Data Architecture / Knowledge Core Migration Plan

> **Created:** 2026-06-02. **Status:** plan for an execution agent to follow phase-by-phase. **No code in this document — planning only.**
> **Authority chain:** `MASTER_DATA_DICTIONARY.md` (the Canonical Data Law + Fact Registry §11 + tiering §22/§26/§33) is the field-level law. This plan is the *sequenced execution layer* — it extends, and does not contradict, `IMPLEMENTATION_PLAN.md`. Where the two differ, the reason is stated inline.
> **Verified against code on 2026-06-02:** migrations 001–075 applied; `factsService.mjs` / `jobFactRegistry.mjs` / `jobResolver.mjs` / `addressNormalise.mjs` read in full; `module4Routes.mjs` win-finalize, `financeCCRoutes.mjs`, `whs/whsEngineRoutes.mjs`, `buildexactSync.mjs`, `buildexactReconcile.mjs` inspected; `dev-api.mjs` route registration confirmed; migrations 015/031/032/040/043/065/069/070/071/075 inspected.

---

## 1. Executive summary + the "do it before real data" rationale

Blue Leaf Hub has a **Phase-0 foundation that is fully built but completely dormant.** Migration `069_knowledge_core.sql` created the Knowledge Core tables (`job_fact_history`, `job_events`, `contact_events`, `job_documents`, `company_profile` + extended `project_metrics` building-fact columns). The server code exists: `factsService.mjs` (`setFact` / `getFact` / `confirmFact` / `emitEvent` / `getJobProfile` / `getLeadProfile` / `getPartyProfile`), `jobFactRegistry.mjs` (a v1 registry of ~30 facts with `store`/`tier`/`compute`), and `jobResolver.mjs`. **Verified: there are ZERO consumers of the facts service outside `factsService.mjs` itself** (`grep` for `getJobProfile|setFact|emitEvent|jobFactRegistry` across `server/` and `src/` returns nothing). **There is no `<FactField>` client component** (no file matching `*Fact*` under `src/components` or `src/lib`). So the engine is wired to nothing.

Every module today reads and writes its own facts by **direct column access**, exactly as the dictionary's audit (§16/§17) describes:
- Lead→job conversion is a **client-side, lossy re-type** (`LeadDetail.jsx createJobFromLead()`), not an API stamp-forward.
- Win-finalize writes building facts (storeys, areas) into **`cost_intelligence`** (a 3rd write path) and sets `original_contract_value` by a one-off derivation, not via `setFact` (`module4Routes.mjs:296–384`).
- Finance recomputes `contract_value` live from `original_contract_value` + Σ signed variations in `financeCCRoutes.mjs:308,465` — not via `getJobProfile`'s `contractValue` computer.
- WHS Module-0 prefill reads `project_metrics` **directly** (`whs/whsEngineRoutes.mjs:144`), not via `getJobProfile`.

**Why this must happen before real data.** The Buildxact API integration just went live (`BUILDXACT_INTEGRATION_AUDIT.md`; mirror table `buildexact_job_sync` mig 075; reconcile tool `scripts/reconcile-buildxact.mjs`). Within ~1 week, real jobs / estimates / POs / claims / variations begin syncing into the Hub. The Universal Data Architecture is about **dedup, provenance, fact carry-forward, and de-duplicating facts across tables** — operations that are nearly free on empty tables and expensive + risky on full ones:
- Address normalisation + `is_duplicate_of` backfill on empty `jobs` is a no-op; on hundreds of real jobs it risks mis-merging two real sites.
- Adding `trade_category_id` to `purchase_orders` and backfilling by fuzzy name match is safe on zero POs; on a live PO ledger a wrong backfill mis-attributes spend → wrong margins.
- Collapsing `contract_value` to a single Generated source while finance is empty can't corrupt billing; doing it after claims exist can.
- Making building-facts flow through `project_metrics` while extraction hasn't run yet means no reconciliation of three live copies.

So the window is now. This plan turns the dormant foundation on first (Phase-0 activation), then migrates each module onto it one at a time, each with a full build→verify→review→apply-migration→live-test (incl. a Buildxact reconcile pass)→commit loop.

**Top-line numbers:** ~**11 human-applied migrations** across the phases (listed in §5 and the risk register). Recommended order: **0-activation → 1 → 2 → 5 → 4 → 3 → 6 → 7** (justified in §5). First-proof module: **WHS Module-0** (read-only, consequence-clear, already half-wired to `project_metrics`).

---

## 2. Phase 0 activation plan — turning the dormant facts service ON

This is the prerequisite for everything. Nothing in §3 can start until the engine has at least one real consumer and the gaps below are closed. **Most of Phase 0's schema already exists (mig 069); activation is mostly server + client wiring + small registry/migration patches.**

### 2.1 Gaps in `factsService.mjs` (verified by reading the file)
| Gap | Evidence | Fix (planning) |
|---|---|---|
| **No `confirmQueue` / pending-suggestion list accessor** | `confirmFact` promotes a single pending row, but nothing *lists* pending `extracted_flagged` facts for a job. The Confirm queue (Phase 3) needs this. | Add a `getPendingFacts(jobId)` reader: latest `job_fact_history` row per `fact_key` where `status='extracted_flagged'` and not yet superseded by a `confirmed`/`manual` row. |
| **`setFact` only handles the `job` spine** | `setFact(jobId, …)` always writes `job_fact_history.spine='job'` via the def; `getLeadProfile`/`getPartyProfile` are read-only stubs returning the raw row. | Phase 0 may stay job-only; register lead/party write paths in Phase 2 when lead→job carry lands. Document the limitation now. |
| **`writeStoredValue` upserts `project_metrics` without a unique constraint check** | It does select-then-insert/update by `job_id`; safe single-threaded but races under concurrency. | Note for Phase 4: add a `UNIQUE(job_id)` on `project_metrics` if not present, so upsert is atomic. (Verify; mig 032 may already have it.) |
| **`source` enum mismatch** | `job_fact_history.source` CHECK (mig 069) allows `manual\|extraction\|system\|lookup\|buildexact`; `resolveStatus` emits `extraction`/`manual` only. `buildexact` and `lookup` are unused. | Fine as-is; ensure Buildxact writes (Phase 6/Buildxact) use `source='buildexact'`. |
| **Generated computers are thin** | Only `contractValue`, `actualCosts`, `forecastMarginPct` exist; `forecastMarginPct` reads `jobs.forecast_total_cost`. | Acceptable for Phase 0. Expand the `COMPUTERS` map as Finance (Phase 5) migrates. |

### 2.2 Gaps in `jobFactRegistry.mjs`
| Gap | Fix (planning) |
|---|---|
| **`address_normalised` / `address_suburb` / `address_postcode` / `address_state` not registered as facts** | Phase 1 needs them. Register `address_suburb` exists; add `address_normalised`, `address_postcode`, `address_state` (all `internal` tier, store on `jobs`). |
| **No lead-spine or party-spine facts registered** | Registry is 100% `spine:'job'`. Phase 2 adds lead facts (estimated_value, qualifying, lead_source) and the conversion carry map. |
| **Tier field present but `tierOf()` not yet consumed** | Phase 3 wires tiers to the Confirm queue. Registry is ready; no change needed in Phase 0. |
| **`compute` keys are strings resolved via a `COMPUTERS` map in factsService** | Keep. Document that adding a Generated fact requires both a registry entry AND a computer function. |

### 2.3 The `<FactField>` client component (must be built — does not exist)
A single reusable React component, the provenance UI reused everywhere a canonical fact is shown/edited. Per dictionary §14.5 + §22 it must render **source · confidence · status** and a one-click **[Confirm] / [Override]**. Behaviour:
- Reads value + provenance from a `getJobProfile` payload (or a single-fact endpoint).
- **🟢 internal, `extracted_applied`:** show value + subtle "auto-applied (0.9x) from <doc>" + [Override].
- **🔴 consequential, `extracted_flagged`:** show as a *suggestion* (not yet canonical) with [Confirm] / [Edit] / [Dismiss]; calls `confirmFact` / `setFact`.
- **`manual` / `confirmed`:** show value + small provenance chip; [Edit] writes via `setFact`.
- Must use `apiFetch`/`apiPost` (CLAUDE.md), camelCase across the boundary, and `constants.js` for any status strings.
- New server endpoints to back it (Phase 0): `GET /api/facts/job/:jobId/profile` (wraps `getJobProfile`), `POST /api/facts/job/:jobId/:key` (wraps `setFact`), `POST /api/facts/job/:jobId/:key/confirm` (wraps `confirmFact`), `GET /api/facts/job/:jobId/pending` (wraps the new `getPendingFacts`). All via `ok()/err()` from `apiResponse.mjs`.

### 2.4 The canonical read/write contract every migrated module must follow
- **Read:** call `getJobProfile(jobId)` (server) or `GET /api/facts/job/:id/profile` (client). Never re-read a canonical column directly once the module is migrated. Generated facts (`contract_value`, `actual_costs`, `forecast_margin_pct`) are computed on read — never stored editable.
- **Write at source:** call `setFact(jobId, key, value, { source, confidence, sourceDocumentId, actorId, reason })`. The service auto-resolves status (consequential extraction → `extracted_flagged`; internal extraction ≥0.90 → `extracted_applied`; human → `manual`), stamps `job_fact_history`, and emits a `job_events` row.
- **Emit events** for business-significant actions via `emitEvent(jobId, eventType, …)` (e.g. `document.uploaded`, `claim.issued`, `variation.signed`). `setFact` already emits `fact.changed`/`fact.suggested`.
- **Provenance** is the latest `job_fact_history` row per `(job_id, fact_key)` — single source, no duplicated provenance column.

### 2.5 Phase-0 acceptance criteria
1. The four `/api/facts/*` endpoints exist and pass an auth-guarded smoke test.
2. `<FactField>` renders a fact with provenance and can Override (writes `manual`) and Confirm (promotes `extracted_flagged`).
3. Writing a fact via the service produces: a typed-column write (for applied statuses), a `job_fact_history` row, and a `job_events` row — verified in Supabase.
4. A direct `setFact` to a Generated fact (`contract_value`) is rejected.
5. Nothing else in the app changes behaviour (the layer is additive; no module migrated yet).

### 2.6 Migration for Phase 0
**No new migration required for the core tables** (mig 069 already applied). One small **additive patch migration `076_facts_activation.sql`** is recommended to: (a) add `address_normalised`, `address_postcode`, `address_state` columns to `jobs` **only if mig 040 didn't add all of them** (verify — `address_normalised`, `address_suburb`, `address_state`, `address_postcode`, `is_duplicate_of` per dictionary §4.1 / §128; the file says 040 added them but only lowercased `address`), and (b) add `UNIQUE(job_id)` on `project_metrics` if absent. Flag for human apply only if the verify step shows columns missing.

---

## 3. Per-phase plan (1→7)

Each phase: **goal · exact changes (migration / server / client) · modules migrated · acceptance · risks · dependencies.** Built on `IMPLEMENTATION_PLAN.md`; phase *content* is unchanged, but the *execution order* is re-sequenced in §5 (and justified there).

### Phase 1 — Address as canonical identity
- **Goal:** make `jobs.address_normalised` the single match key; populate `address_suburb`/`address_postcode`/`address_state`; dedup via `is_duplicate_of`. (Dictionary §4.1, §128; `IMPLEMENTATION_PLAN.md` Phase 1.)
- **Migration `077_address_backfill.sql` (human-applied):** backfill `address_normalised`/`suburb`/`postcode`/`state` on every existing `jobs` row using the parse `normaliseAddress()` produces; add a partial index on `address_normalised`; (optional) set `is_duplicate_of` where two jobs share a normalised key. **Do this while `jobs` is near-empty.**
- **Server:** `normaliseAddress()` already exists (`addressNormalise.mjs`) and `resolveJobIdByAddress()` already prefers the normalised key (`jobResolver.mjs:17`). Wire `setFact(jobId,'address',…)` to also write `address_normalised`/`suburb`/`postcode`/`state` (a small `onAddressWrite` hook in `factsService`, or compute in the address writer). Replace remaining fuzzy `ilike` matching in `module5Routes.mjs:148,253` (fee-proposal resolve) with the normalised key.
- **Client:** address edits on the job go through `<FactField>` / `setFact`.
- **Modules migrated:** Tender/RFQ job create, Fee Proposals (resolve), Buildxact sync (already uses `normaliseAddress` for linking — `buildexactSync.mjs:35`).
- **Acceptance:** address standardised on write; suburb/postcode populated; matching uses the normalised key; no new address copies; reconcile pass still links every Buildxact job by address.
- **Risks:** mis-merge via `is_duplicate_of` (mitigate: only auto-set on empty data; manual review otherwise). **Dependencies:** Phase 0.

### Phase 2 — Client identity + contact onto the job spine
- **Goal:** client name/email/phone canonical on `jobs`; lead→job conversion moves to the **API** and stamps ALL lead facts via the facts service (non-lossy). (Dictionary §16 lead→job edge, §28 three spines, §30; `IMPLEMENTATION_PLAN.md` Phase 2.)
- **Migration:** `jobs.client_email`/`client_phone` already exist (mig 071). New **`078_lead_carry_provenance.sql`** only if a lead-spine `lead_fact_history` mirror is wanted; otherwise none. (Recommend: reuse `job_fact_history` and stamp carried facts with `source='system', reason='lead_conversion'` at the moment of conversion — no new table.)
- **Server:** new `POST /api/sales/leads/:id/convert-to-job` that creates the job and `setFact`s address, client_name, client_email, client_phone, project_type, architect_name, original-value-estimate, suburb — each with provenance pointing back to the lead. Wire `crm_contacts.linked_job_id` so CRM reads the job.
- **Client:** `LeadDetail.jsx createJobFromLead()` (currently lossy, client-side, `:1066`) calls the new API instead of doing column copies.
- **Modules migrated:** Sales/Leads (conversion), CRM (linked_job_id read), Portal/claims/variations (read `client_email` via profile, stop reading `projects.portal_client_email`).
- **Acceptance:** client contact canonical on the job; portal/claims/variations read it via `getJobProfile`; conversion carries all lead facts with provenance; `crm_contacts.linked_job_id` set.
- **Risks:** double-writers (transcript flatten path §16 can overwrite human entry) — route those through `setFact` so provenance records who won. **Dependencies:** Phase 0, Phase 1 (suburb parse).

### Phase 5 — Contract value / financial truth (run before 4 — see §5)
- **Goal:** one **Generated** `contract_value` = `original_contract_value` + Σ signed variations, surfaced via `getJobProfile`; value-carry estimated→accepted→original at win; collapse the dual source. (Dictionary §17, §20, §29; `IMPLEMENTATION_PLAN.md` Phase 5.)
- **Current state (verified):** the `contractValue` computer already exists in `factsService.mjs:93`; finance recomputes the *same* formula live in `financeCCRoutes.mjs:308,465`; win-finalize already sets `original_contract_value` from the accepted proposal (`module4Routes.mjs:323–339`); the `jobFinanceRoutes` shadow is **already deregistered** (`dev-api.mjs:780`) but **`financeRoutes` + `financeCCRoutes` are still both registered** (`:778–779`) — the consolidation (Phase −1 in the dictionary) is **incomplete**.
- **Migration `079_drop_contract_value_trigger.sql` (human-applied):** drop the mig-034 trigger that *stores* `jobs.contract_value`, leaving the single recompute. Keep `original_contract_value` as the only stored money input (static). **Do this with finance empty.**
- **Server:** finance KPI routes read `contract_value`/`actual_costs`/`forecast_margin_pct` from `getJobProfile` instead of recomputing inline. Finish collapsing `financeRoutes` + `financeCCRoutes` into one registration so there is one WIPAA path. Value-carry (`estimated_value` → accepted proposal total incl. PTSA fee → `original_contract_value`) runs through `setFact` at the win transition (replace the ad-hoc block in `module4Routes.mjs`).
- **Modules migrated:** Finance (Command Centre / Invoices / Progress Claims / Variations / WIPAA), Tender Board (win value-carry).
- **Acceptance:** one `contract_value` source; stored value cannot diverge from computed; a won job has a contract value; margin reconciles; reconcile pass shows Hub `contractEx` == Buildxact `contractEx` within $1 (the reconcile tool already computes Hub side as `original_contract_value + signed variations` — `buildexactReconcile.mjs:90`).
- **Risks:** dropping the trigger while any code still reads stored `jobs.contract_value` as authoritative → stale reads. Mitigate: migrate all finance reads to the profile first, then drop. **Dependencies:** Phase 0; finance route consolidation.

### Phase 4 — Building Facts via the Project Intelligence Engine (run after 5 — see §5)
- **Goal:** one building-facts extraction → `project_metrics` via the facts service with provenance + tiered confirm; classify the source document into `job_documents`; mark dependents stale on change. (Dictionary §20, §23, §34; `IMPLEMENTATION_PLAN.md` Phase 4.)
- **Migration:** none for columns (mig 069 added them all). Optional **`080_project_metrics_unique.sql`** if `UNIQUE(job_id)` wasn't added in Phase 0.
- **Server:** the Cost-Intelligence extraction (`costIntelligenceRoutes.mjs`) and win-finalize (`module4Routes.mjs:375` cost_intelligence insert) must write building facts via `setFact(jobId, key, value, { source:'extraction', confidence, sourceDocumentId })` into `project_metrics`, not into `cost_intelligence`/`jobs`. Register the uploaded plan as a `job_documents` row first; pass its id as `sourceDocumentId`. Retire the `projects.project_metrics` jsonb (mig 015 line 17 — verified it still exists) and the `jobs`/`cost_intelligence` building-fact copies (read from profile).
- **Client:** WHS Module-0, Cost Intelligence, Schedule read building facts via `getJobProfile`; 🔴 facts surface as `<FactField>` confirmations.
- **Modules migrated:** Cost Intelligence (writer), WHS engine (reader — currently direct `project_metrics` read at `whsEngineRoutes.mjs:144`), Schedule Manager (currently ignores `project_metrics` entirely — §16), Project Intelligence Engine (the extractor itself).
- **Acceptance:** uploading plans yields facts with `source=document_id` + confidence; 🔴 facts confirmed before canonical; WHS/cost/schedule consume via profile, store no copy; a revised drawing (new `job_documents` version) re-extracts and marks Generated dependents stale.
- **Risks:** three legacy write paths must be retired together or "last sync wins" persists (§17). **Dependencies:** Phase 0 (FactField + confirm), Phase 3's tier wiring is *ideal* before this but can land alongside (see §5 ordering note).

### Phase 3 — Fact Registry formalised + Dependency Matrix (run after 4 — see §5)
- **Goal:** every registered fact carries a tier = MAX consequence across consumers (§33); 🔴 facts route to a **Confirm queue**; 🟢 auto-apply ≥0.90; provenance everywhere. (Dictionary §22, §26, §33; `IMPLEMENTATION_PLAN.md` Phase 3.)
- **Migration:** none (tiers live in `jobFactRegistry.mjs`; queue reads `job_fact_history`).
- **Server:** implement `getPendingFacts(jobId)` (§2.1) + a portfolio-wide pending view; ensure `resolveStatus` honours `tier` (already does — `factsService.mjs:34`). Backfill the registry to the full §26 matrix (~25 highest-impact facts) with correct tiers.
- **Client:** a **Confirm Queue** screen listing all `extracted_flagged` 🔴 facts awaiting human confirmation, each a `<FactField>`.
- **Modules migrated:** cross-cutting (every module that emits suggestions); primarily surfaces work already done in Phase 4.
- **Acceptance:** every registered fact has a tier; 🔴 facts cannot become canonical without confirmation; 🟢 auto-apply with provenance; the Confirm Queue lists pending 🔴 suggestions.
- **Risks:** mis-tiering (a fact feeding a client quote must be 🔴 — §33). **Dependencies:** Phase 0; benefits from Phase 4 having produced real suggestions to confirm.

### Phase 6 — Trade taxonomy convergence
- **Goal:** `trade_categories` canonical; FK everywhere; map workforce `task_category` and Buildxact category names to it. (Dictionary §17, §31; `IMPLEMENTATION_PLAN.md` Phase 6.)
- **Current state (verified):** `trade_category_id` FK exists on `financial_documents`/`normalized_costs` (mig 031/032/040), `trade_master_library`/`rfq_trade_scopes` (mig 043), `subcontractors` (mig 040). **MISSING on `purchase_orders` and not on `subcontractors`-via-043** — and Buildxact category mapping is name-fuzzy.
- **Migration `081_trade_fk_extend.sql` (human-applied):** add `trade_category_id` FK to `purchase_orders` (and `cost_intelligence`/`rfqs` if not already), backfill by canonical name match, index. Add a `task_category → trade_category_id` mapping (table or function) for workforce. **Do this with empty PO/timesheet ledgers.**
- **Server:** Buildxact category mapping switches from fuzzy name to FK lookup; labour actuals (`timesheet_entries.cost_amount`) land in per-trade `budget_vs_actual` via the mapping.
- **Modules migrated:** Operations/Procurement (POs), Subcontractors, Workforce (timesheets), Buildxact integration (category mapping), Finance (budget-vs-actual labour line).
- **Acceptance:** one vocabulary; POs/subs/timesheets all carry `trade_category_id`; labour lands in per-trade budget; Buildxact mapping is FK-based.
- **Risks:** wrong backfill mis-attributes spend → wrong margin (§17 "labour cost" gap). **Dependencies:** Phase 0; Phase 5 (margin truth) should land first so attribution errors are visible.

### Phase 7 — Carpentry de-island (last)
- **Goal:** add `carpentry_jobs.job_id` FK; roll carpentry up with the builder spine; guard double-counting. (Dictionary §0 locked decision, §31, §40; `IMPLEMENTATION_PLAN.md` Phase 7.)
- **Current state (verified):** `carpentry_jobs` is a full parallel island — its `id` is referenced by `carpentry_job_milestones`/`costs`/`budgets`/timesheets/marketing (mig 065/067/068), but there is **no `carpentry_jobs.job_id` FK upward** to the builder `jobs` spine.
- **Migration `082_carpentry_job_link.sql` (human-applied):** add nullable `carpentry_jobs.job_id` FK (nullable for standalone subsidiary work — answers dictionary open-question #1); backfill links by normalised-address match where a builder job exists; index.
- **Server:** rollups (cost / marketing / WHS / reporting) read carpentry via `job_id`; a **double-count guard** so labour attributed to both `job_id` and `carpentry_job_id` is counted once. Register the carpentry financial spine (`carpentry_job_budgets`, quoted_value, closeout) in the dictionary (§40 notes it's currently absent).
- **Modules migrated:** Carpentry, Workforce (carpentry labour), Marketing (carpentry-tagged content).
- **Acceptance:** carpentry rolls up with the builder spine; no double-counting; carpentry consumes the same canonical facts where a parent job exists.
- **Risks:** double labour attribution; mis-linking standalone jobs to the wrong parent. **Dependencies:** Phase 0, Phase 1 (address match), Phase 6 (trade taxonomy for labour rollup).

### Cross-cutting through every phase
- **Events + Documents** are written as modules migrate, not bolted on at the end (dictionary §23, §27).
- **SOPs** updated per migrated module (CLAUDE.md SOP Law).
- **Three spines** (`party_id`/`lead_id`/`job_id`) and **three event streams** (`job_events`/`contact_events`/`attribution_events`) respected — never put session telemetry in `job_events` (§29).
- **Config layer** (`company_profile`, mig 069) supplies document merge-fields; populate it in Phase 0.

---

## 4. Per-module migration table

For each module: **CREATES / CONSUMES / OWNS / MUST-NEVER-OWN** facts; what it does **wrong today**; the **edits** to wire it onto the facts service; the **phase** it belongs to. Grounded in dictionary §2, §11, §16, §17, §26.

| Module | Creates | Consumes | Owns (canonical) | Must-never-own | Wrong today | Edits to wire on | Phase |
|---|---|---|---|---|---|---|---|
| **CRM + Mailing List** | contact identity, consent | client identity (from job) | `crm_contacts` party facts; consent (append-only, `contact_events`) | client_name/email on the job (read it) | consent/unsubscribe scattered; not linked to job | wire `crm_contacts.linked_job_id`; consent → `contact_events` (Spam-Act append-only); read client via `getPartyProfile`/job | 2 |
| **Sales / Leads / Blueprint Insight** | address, client, project_type, lead_source, estimated_value, qualifying | — | lead-spine facts (`leads`) | the job's canonical facts (it stamps forward, doesn't own) | conversion is client-side & **lossy** (`LeadDetail.jsx:1066`); transcript flatten can overwrite human entry (§16) | new `POST …/convert-to-job` stamps all lead facts via `setFact` with `reason='lead_conversion'`; transcript path writes via `setFact` (provenance records winner) | 2 |
| **Tender Manager / Fee Proposals** | fee-proposal totals, building_type | address, client, project_type | `fee_proposals` proposal facts | address, client, contract_value (read via profile) | resolves job by **fuzzy address** (`module5Routes.mjs:148,253`); building_type a 2nd project_type vocab | resolve via `address_normalised`; map building_type→`project_type` enum; value-carry feeds `original_contract_value` via `setFact` | 1 (resolve), 5 (value) |
| **RFQ Engine / Quote Tracker** | RFQ trade scopes (separate extractor, §34), quote amounts | address, project_type, building facts, accepted_trades | `rfq_packages`/`rfq_trade_scopes` | building facts (read via profile) | `persistJobFromExtraction` (`RfqEngine.jsx:950`) writes building facts to `jobs` + JSON, not `project_metrics` | building facts → `setFact` into `project_metrics`; scope extractor stays separate (§34); FK to `trade_categories` | 4 (facts), 6 (trade FK) |
| **Cost Intelligence** | building facts (storeys/areas/frame/roof/slab/slope/BAL) | address, project_type, trade taxonomy | `project_metrics` *as a writer-through-service*; benchmarks | its own copy of building facts | writes `project_metrics` directly (`costIntelligenceRoutes.mjs`) + win-finalize writes `cost_intelligence` (`module4Routes.mjs:375`) — 2 of the 3 write paths | all building-fact writes via `setFact(…, source:'extraction', sourceDocumentId)`; register plan in `job_documents` first | 4 |
| **Schedule Manager** | schedule tasks | project_type, storeys, has_demolition, accepted_trades, building facts | `schedule_tasks` | building facts (read via profile) | **ignores** `project_metrics`/project_type (§16); 50-row hardcoded template | read facts via `getJobProfile` to drive template selection; consume `accepted_trades` | 4 |
| **Operations / Procurement (POs)** | purchase orders | trade taxonomy, accepted_trades, job_id | `purchase_orders` | trade vocabulary (use `trade_categories` FK) | `purchase_orders` has **no `trade_category_id` FK** (verified) | add FK (mig 081); backfill by canonical name; emit `po.issued` event | 6 |
| **Site Diary** | diary entries | project_id/job_id | `site_diary` | client/building facts | keyed to project_id; fine | emit `diary.created` event; optionally register diary docs in `job_documents` | cross-cutting (events) |
| **WHS (engine + compliance + inductions)** | SWMS/permits/registers (Generated) | building facts, site facts, trades, address, duty-holders | `whs_site_profiles` questionnaire; Generated WHS outputs | building facts (must read via profile, not store) | reads `project_metrics` **directly** (`whsEngineRoutes.mjs:144`), not via `getJobProfile`; `project_swms` writer historically broken (§18) | swap direct read for `getJobProfile`; ensure engine writes `project_swms`; duty-holder facts registered (§31) | 4 (reader), cross-cutting |
| **Finance (Command Centre / Invoices / Progress Claims / Variations / WIPAA)** | actual_costs, claims, variations (events) | contract_value, original_contract_value, trade taxonomy | `financial_documents`, `progress_claims`, `job_variations`, `wipaa_reviews`; `original_contract_value` (static) | `contract_value` (it is **Generated** — never stored editable) | recomputes contract_value live (`financeCCRoutes.mjs:308,465`) instead of via profile; `financeRoutes`+`financeCCRoutes` both still registered (`dev-api.mjs:778–779`) | read Generated metrics via `getJobProfile`; collapse to one finance registration + one WIPAA path; drop mig-034 trigger | 5 |
| **Workforce (timesheets)** | labour_cost (Generated input) | task→trade mapping, job_id/carpentry_job_id | `timesheets` | per-trade budget vocabulary | `task_category` never mapped to `trade_category_id` (§17) → labour never lands in per-trade budget | add `task_category→trade_category_id` mapping; guard double-count vs carpentry | 6, 7 |
| **Subcontractors** | sub identity | trade taxonomy | `subcontractors` party facts | trade vocabulary (use FK) | `trade` free-text + `trade_category_id` (mig 040) coexist; text is legacy | prefer FK everywhere; emit party events | 6 |
| **Client Portal** | client decisions, NPS | client_email, contract_value, claims, variations, milestones | `portal_*` client-facing records | client_email, claims, variations (read finance/job — don't re-enter) | re-enters `projects.portal_client_email`; `portal_claims` vs `progress_claims` zero cross-write (§17) | read `client_email`/claims/variations via profile + finance; stop re-entry | 2 (contact), 5 (claims/variations) |
| **Marketing / Content Studio** | content_items | suburb, project_type, completed project, client | `marketing_content_items` | suburb/project_type/client (read via profile) | content `job_id`/`project_id`/`lead_id` columns exist but bulk-save leaves them null (§16) — orphans | set spine FK on save; read facts via profile; suburb is 🟢 from job | 4 (facts), cross-cutting |
| **Marketing Intelligence** | attribution events (web stream) | lead_source | `attribution_events` (session spine) | job facts (only the outcome `lead.created` crosses into business log §29) | risk of forcing session telemetry into job_events | keep on `attribution_events`; only `lead.created` + source crosses into `contact_events`/`job_events` | cross-cutting |
| **Carpentry** | carpentry quoted_value, budgeted_cost, milestones | address (for link), building facts (where parent), trade taxonomy | `carpentry_jobs` + its financial spine | the builder job's canonical facts (read via parent `job_id`) | full **island** — no `carpentry_jobs.job_id` FK (verified); excluded from rollups | add nullable `job_id` FK (mig 082); rollups via `job_id`; double-count guard; register carpentry financial spine in dictionary | 7 |
| **Buildxact integration (+ sync/mirror + reconcile)** | mirror snapshots (`buildexact_job_sync`) | address (linking), contract/estimate/PO/claim/variation totals | `buildexact_*` mirror tables (distinct, never overwrite Hub-native — §BUILDXACT plan) | Hub-native canonical facts (mirror is read-side, Phase-1) | links by `buildexact_job_id` else fuzzy address (`buildexactSync.mjs:35`); category mapping fuzzy | use `address_normalised` for linking (already does); FK trade mapping (Phase 6); reconcile validates each phase | 1 (link), 6 (trade), validation in all |
| **Project Intelligence Engine + Fact Registry (cross-cutting)** | building facts (the one extractor, §34) | documents | the registry + extraction pipeline | — | doesn't exist as a wired pipeline; registry has no consumers | build the extract→classify(`job_documents`)→`setFact`→tiered-confirm pipeline; it IS Phase 4's core | 0 (registry), 4 (pipeline) |

---

## 5. Sequenced execution roadmap (optimised for "before real data")

### 5.1 Recommended phase order and justification
**0-activation → 1 → 2 → 5 → 4 → 3 → 6 → 7.**

This matches the order suggested in the prompt and the dictionary's integrated roadmap (§27) with one deliberate swap, justified here:
- **0 first** — nothing reads the engine today; activation is the prerequisite for every other phase, and it's purely additive (no module behaviour changes).
- **1 (address) before 2 (client)** — client/job carry-forward and Buildxact linking both depend on a stable normalised address key. Address is the join everything ties to (§3 ⭐).
- **5 (contract value) before 4 (building facts)** — *this is the swap vs the dictionary's §27 (which lists 4 before 5).* Justification: (a) the `contractValue` computer **already exists** and finance **already recomputes the identical formula**, so Phase 5 is mostly *deletion* (drop the mig-034 trigger) + *route consolidation* (`financeRoutes`+`financeCCRoutes` are still both registered) — low-risk, high-value, and it's the headline number the **Buildxact reconcile tool validates** (`buildexactReconcile.mjs` Hub side = `original_contract_value + signed variations`). Getting it right first means every subsequent reconcile pass has a trustworthy money baseline. (b) Building-facts (Phase 4) is the largest, riskiest phase (three write paths to retire, an extraction pipeline to build) — better to land the cheap financial truth first. `IMPLEMENTATION_PLAN.md`'s numeric order is preserved as phase *labels*; only the *execution sequence* is re-ordered, which the prompt explicitly permits.
- **4 (building facts) before 3 (tiering/confirm queue)** — Phase 4 produces the first real stream of `extracted_flagged` 🔴 suggestions; Phase 3's Confirm Queue then has real data to confirm. (The tier *resolution* logic already exists in `factsService.resolveStatus`, so 4 can emit correctly-tiered suggestions before the queue UI lands.)
- **6 (trade taxonomy) after 5** — so mis-attributed spend is visible against a correct margin.
- **7 (carpentry) last** — easiest once the core (address, facts, trade taxonomy) is stable; depends on all of them.

### 5.2 Per-phase build→verify→review→apply→live-test→commit loop
Run this identical loop for **every** phase. Each "Apply migration (HUMAN)" step is a hard stop — the agent must pause for Sam to paste the SQL into the Supabase SQL editor.

1. **Build** — code the additive changes (new endpoints / `setFact` wiring / `<FactField>` usage). No destructive edits yet.
2. **Verify** — `npm run lint` (zero-warnings), `npm run build`, `/check` (import + route audit). Confirm no duplicate routes, no raw snake_case across the boundary, `ok()/err()` used.
3. **Review** — run `/code-review` (or `/security-review` for the auth-touching facts endpoints) on the diff; confirm against the Canonical Data Law (CLAUDE.md): no copied facts, writes go through the service, provenance stamped.
4. **Apply migration (HUMAN, Supabase SQL editor)** — only the migrations flagged below. Verify with the `SELECT` at the bottom of each migration.
5. **Live-test (running app) + Buildxact reconcile pass** — exercise the migrated module in `npm run dev`; then run `node scripts/reconcile-buildxact.mjs all` (or per-job) and confirm the side-by-side panel still matches within $1 tolerance (`buildexactReconcile.mjs` TOLERANCE=1). For Phase 5 specifically, the reconcile *is* the acceptance test.
6. **Commit** — `/ship` (lint+build+commit+push), commit message tied to the phase, SOPs updated.

### 5.3 Migrations the human must apply (the hard stops)
| # | Migration (proposed) | Phase | Purpose | Apply when |
|---|---|---|---|---|
| 1 | `076_facts_activation.sql` *(conditional)* | 0 | add any missing `jobs.address_*` cols + `UNIQUE(job_id)` on `project_metrics` | only if verify shows gaps |
| 2 | `077_address_backfill.sql` | 1 | backfill normalised/suburb/postcode/state + index + `is_duplicate_of` | jobs near-empty |
| 3 | `078_lead_carry_provenance.sql` *(optional)* | 2 | only if a lead-spine history mirror is wanted (else reuse `job_fact_history`) | before lead conversions |
| 4 | `079_drop_contract_value_trigger.sql` | 5 | drop mig-034 trigger → single Generated `contract_value` | finance empty; after finance reads migrate to profile |
| 5 | `080_project_metrics_unique.sql` *(conditional)* | 4 | `UNIQUE(job_id)` if not added in 076 | before extraction writes |
| 6 | `081_trade_fk_extend.sql` | 6 | `trade_category_id` FK on `purchase_orders` (+ rfqs/cost_intelligence if missing) + task→trade map | PO/timesheet ledgers empty |
| 7 | `082_carpentry_job_link.sql` | 7 | nullable `carpentry_jobs.job_id` FK + address backfill + index | carpentry near-empty |

Plus **Phase −1 leftovers that are migrations-as-deletion** (no new SQL, but human-visible behaviour change): retire `projects.project_metrics` jsonb (mig 015 line 17) and finish collapsing the two registered finance route files. **Total: ~7 new SQL migrations** (3 conditional/optional), giving the **~11 human-applied migration touchpoints** headline when counting the conditional/optional ones and the two Phase −1 consolidations. Net new always-applied SQL files: **4** (077, 079, 081, 082).

---

## 6. Risk register

| Risk | Class | Phase | Mitigation | How the reconcile tool validates |
|---|---|---|---|---|
| `is_duplicate_of` mis-merges two real sites | data-loss | 1 | only auto-merge on empty data; manual review thereafter; normalised key is conservative (street abbreviations only) | reconcile links Hub job by `address_normalised`; a mis-merge shows the wrong job linked to a Buildxact job |
| Dropping mig-034 trigger while code still trusts stored `jobs.contract_value` | ordering hazard / money | 5 | migrate ALL finance reads to `getJobProfile` BEFORE dropping the trigger; SOURCE_OF_TRUTH already warns "don't trust stored value" | reconcile Hub `contractEx` (= `original_contract_value + signed variations`) must equal Buildxact `contractEx` within $1 |
| Three building-fact write paths (`jobs`, `cost_intelligence`, win-finalize) retired piecemeal → "last sync wins" persists | data integrity | 4 | retire all three in the same phase; route every writer through `setFact`; retire `projects.project_metrics` jsonb in the same change | building facts don't appear in reconcile directly, but wrong storeys/areas surface as wrong cost benchmarks |
| Wrong `trade_category_id` backfill on POs/timesheets mis-attributes spend | double-counting / money | 6 | backfill by exact canonical-name match only; leave unmatched as null for manual; do it on empty ledgers | reconcile POs total (`poEx`) Hub vs Buildxact must match; a mis-categorised PO still sums correctly at job level (sanity check) |
| Carpentry labour counted on both `job_id` and `carpentry_job_id` | double-counting | 7 | explicit double-count guard in rollups; nullable `job_id` so standalone work isn't force-linked | reconcile actual-costs (when wired) would show inflated Hub actuals vs Buildxact |
| Buildxact mirror overwrites Hub-native canonical facts | Buildxact-mirror interaction | all | mirror tables/columns are **distinct** (`buildexact_*`), never written into canonical columns (per `BUILDXACT_HUB_SYNC_PLAN.md`); Phase-1 is read-from-BX only | the reconcile panel exists *because* the two are stored separately — it's the guardrail |
| Lead-conversion double-writers (manual + transcript flatten) overwrite human entry | provenance | 2 | route both through `setFact`; `job_fact_history` records source/actor so the winner is auditable | n/a (pre-job) |
| FactField confirms a 🔴 fact that was mis-tiered as 🟢 (auto-applied) | safety/compliance | 3/4 | tier = MAX across consumers (§33); a fact feeding a client quote or WHS HRCW is 🔴 even if 🟢 for marketing | n/a (safety) |
| Real data arrives mid-migration | schedule risk | all | sequence puts cheapest/highest-value/most-reconcilable phases first (0→1→2→5); if the week runs out, 0+1+2+5 alone deliver address+client+money truth | reconcile pass after each phase confirms no regression |

**Reconcile tool's role per phase:** it is the standing "see it in two data sources" check (`buildexactReconcile.mjs`). After every phase's live-test, `node scripts/reconcile-buildxact.mjs all` must still match within $1; Phase 5's whole acceptance is a clean reconcile of `contractEx`/`claimsEx`/`varEx`.

---

## 7. "Smallest first proof"

**Migrate WHS Module-0 first**, end-to-end, as the pattern proof — *before* rolling the facts service out anywhere else.

**Why WHS Module-0:**
1. **It's read-dominant and already half-wired.** `whs/whsEngineRoutes.mjs:144` already reads `project_metrics` directly for the M0 construction-method prefill (`frame_type`, `has_retaining_walls`, `has_basement`, `has_suspended_slab`, `has_structural_steel`, `has_demolition`, `site_slope`→steep, `bal_rating`→bushfire, `building_age`→pre-1990). Swapping that direct read for `getJobProfile(jobId)` is a single, contained, low-blast-radius change that exercises the read path with zero schema change.
2. **The consequences are crisp and 🔴.** These are textbook consequential facts (§26: storeys, frame_type, has_suspended_slab, site_slope, bal_rating, building_age all 🔴 — wrong value → wrong WHS controls → legal/safety harm). So it forces the Confirm/Override (`<FactField>`) and tiering path to be real, not theoretical.
3. **It needs no new migration** (mig 069 columns already exist; `WHS_PREFILL_FROM_METRICS_BRIEF.md` confirms read-only). So the proof isolates the *facts-service wiring* from schema risk.
4. **It proves the full loop on one fact family:** read via `getJobProfile` → render each M0 fact in `<FactField>` with provenance (source=document, confidence, status) → Confirm a flagged 🔴 fact via `confirmFact` → Override via `setFact(source:'manual')` → see `job_fact_history` + `job_events` rows appear.

**Concrete first-proof scope:** build the four `/api/facts/*` endpoints (§2.3) + the `<FactField>` component (§2.3), then change WHS M0 prefill to consume `getJobProfile` and render each construction-method fact as a `<FactField>`. Verify: a 🔴 building fact extracted at <0.90 shows as a suggestion needing confirmation; confirming it writes a `confirmed` row; overriding writes a `manual` row; both emit `job_events`. Once green, this exact pattern (read-via-profile + write-via-setFact + provenance + confirm) rolls out to Cost Intelligence, Schedule, Finance, Portal, and the rest per §4.

---

*End of plan. Authority: `MASTER_DATA_DICTIONARY.md` (field-level law) → this plan (execution sequence) → per-phase build loop (§5.2). All claims grounded in code/migrations verified 2026-06-02; ambiguities flagged inline (e.g. Phase-0 migration is conditional on a column-presence verify; the 4↔5 order swap vs §27 is justified in §5.1).*
