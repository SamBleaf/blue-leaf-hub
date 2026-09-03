<!-- Cross-module schedule-continuity investigation, 2026-08-30, verified vs commit 4ed2564. Architecture/planning — code-grounded. -->


# Continuity Brief: Estimate → Schedule → Proposal → Won → Carpentry → DNF

**Scope:** the chain Sam wants end-to-end — Buildxact estimate → build schedule → fixed-price proposal showing an accurate duration → Won handover → Operations project + carpentry auto-extraction + carpentry stage calendar → PlanSA DNF building-notification stages on that calendar (CW-3).

**Bottom line up front:** the chain is real at the two ends (estimate import works; carpentry stage calendar works) but **broken or manual through the entire middle**. There is no single schedule object that flows estimate → proposal → Ops → carpentry. The proposal timeline that exists today is derived from a **manually-typed estimator convention** ("SCHED" lines), not from costings/scope, and lives **only in the APB template**. Nothing about carpentry or scheduling fires at Won. The DNF→carpentry-calendar hook (CW-3) **does not exist in any form** — neither the data source nor a schema slot to hold it.

---

## (a) End-to-end continuity map (object by object)

Legend: **EXISTS** = wired in production · **MANUAL** = works but a human must trigger/upload/retype · **MISSING** = no code path.

| # | Hop | Object → object | Status | Evidence |
|---|-----|-----------------|--------|----------|
| 1 | Estimate in | Buildxact XLSX/PDF (or v3 API) → `buildexact_estimates` (categories, schedule_hints, cost_metrics) | **MANUAL** | `module5Routes.mjs:93,233` parse endpoints; `buildexactParser.mjs`; job-linked by address `resolveJobIdByAddress`. v3 pull `buildexactDeepIntegration.mjs pullBuildexactEstimate` |
| 2 | Estimate → costing | estimate categories → `job_budgets` / `normalized_costs` (by `trade_category_id`) | **EXISTS** | `costIntelligenceEstimate.mjs syncEstimateToCostIntelligence:240`, `seedJobBudgetsFromEstimateData:322` |
| 3 | Estimate scope → Ops schedule | `buildexact_estimates.categories` → `schedule_tasks` task list | **MISSING** | `scheduleCategories.mjs resolveScheduleCategoryBlocks:147` prefers `fee_proposals.categories` (never written in prod) → v3 `/jobs/{id}/estimate` (nonexistent, returns `[]`) → hardcoded 26-name default. The real estimate `categories` is **never read** for the task list |
| 4 | Estimate → task durations | "SCHED" line-items → `schedule_hints` → override task `duration_days` | **MANUAL + fragile** | `buildexactParser.mjs parseSchedItems:821`; `scheduleGenerate.mjs findScheduleHint:282` fuzzy-matches (≥0.45 word overlap). No SCHED lines = zero estimate influence; fallback = Claude guess → `PHASE_DURATION_DEFAULTS:402` (10d) |
| 5 | Cost/quantity → duration | any derivation of weeks from $ or quantity or floor area | **MISSING** | No such model anywhere. Durations never come from cost magnitude, line quantities, or m² |
| 6 | Estimate → proposal timeline | estimate SCHED lines → proposal "Week 1..N" tokens | **PARTIAL (APB only)** | `feeProposalTransform.mjs buildRelativeSchedule:430` + `SCHEDULE_BUFFER_PCT 0.25`. Called **only** in `proposalToApbDocxData:383`. The "original" `proposalToDocxData:288` returns **no** schedule tokens (verified — stops at `FEE_SCHEDULE` payment %) |
| 7 | Proposal → Won | accepted proposal → `jobs.status='won'` | **EXISTS** (2 paths) | Rich: `module4Routes.mjs win-finalize:237`. Light: `salesRoutes.mjs finalizeWonJob:464` via stage PATCH `:1297` |
| 8 | Won → project | `jobs.status='won'` → minimal `projects` row | **EXISTS (auto)** | DB trigger `096_auto_project_on_win.sql:64` inserts only `(job_id, address, status='active')`; 1:1 via `projects_job_id_uq` |
| 9 | Won → project enrichment | accepted_trades, contract_value, portal identity, cost_intelligence, tentative_start_date | **EXISTS (tender path only)** | `module4Routes.mjs:316-331,253-265`. The **pipeline path** `finalizeWonJob` only stamps contract value → bare stub |
| 10 | Won → Ops schedule | win → `schedule_tasks` (a dated program) | **MISSING** | No win path writes `schedule_tasks`. Only `projects.tentative_start_date` crosses (and only if typed into the modal). Ops must later manually `POST /api/schedule/generate` (`scheduleRoutes.mjs:440`, sole caller `ScheduleManager.jsx:408`) |
| 11 | Won → carpentry job | win → `carpentry_jobs` row | **MISSING** | Zero carpentry references in `module4Routes.mjs` / `salesRoutes.mjs` (grep confirmed). `carpentry_jobs` created **only** manually via `CarpentryDashboard.jsx` → `carpentryRoutes.mjs POST /jobs:239` |
| 12 | Builder estimate → carpentry budget | carpentry lines in `job_budgets` → `carpentry_job_budgets` | **MISSING** | The only carpentry extraction (`/estimate/parse-xlsx:688` → `/budget/seed:1453`) consumes the **carpentry subsidiary's own separate** Buildxact XLSX, uploaded by hand — never the builder build estimate |
| 13 | job ↔ carpentry link | `carpentry_jobs.job_id` → `jobs.id` | **MANUAL (offline)** | `082_carpentry_job_link.sql` nullable; populated only by `scripts/backfill-carpentry-job-link.mjs` (address match). Carries no budget/schedule data |
| 14 | Carpentry budget → stage calendar | `carpentry_job_budgets` labour subsections → `carpentry_job_stage_schedule` blocks | **EXISTS (lazy auto-seed)** | `carpentryStageScheduleService.mjs stagesFromBudget:72`, `seedStageSchedule:153`; GET auto-seeds/auto-heals. Duration is **value-based** `costModelStageDays:60` (labour_sell ÷ teamChargeUpPerDay × crew) |
| 15 | Commencement anchor | contract/handover → `carpentry_jobs.start_date` | **MANUAL** | Must be typed into the Schedule tab per job (`CarpentryJobDetail.jsx ScheduleTab ~512`). Nothing flows from proposal/handover |
| 16 | DNF → carpentry calendar (CW-3) | PlanSA Decision Notification Form mandatory building-notification stages → `carpentry_job_stage_schedule` | **MISSING (both ends)** | Grep for `DNF / decision notification / building notification / notification stage` → nothing. Only PlanSA code is the **consent spine** (`196_job_consents.sql`, `ConsentSpine.jsx`) = track-and-prompt reference numbers, not calendar stages. And `carpentry_job_stage_schedule.status` CHECK is `planned/in_progress/complete` only — **no hold-point / inspection / notification stage type exists** to hold them |

---

## (b) The seams / gaps (most load-bearing first)

**S1 — There is no single schedule object. Durations are derived in two disconnected places, and neither is costed.**
The proposal timeline (`buildRelativeSchedule`, `feeProposalTransform.mjs:430`) and the Ops Gantt (`scheduleGenerate.mjs`) each re-derive independently from the same SCHED lines, and the SCHED lines are a **manually-typed estimator convention** (`parseSchedItems`, `buildexactParser.mjs:821`). No cost/quantity→duration model exists anywhere (gap #5 above). So "accurate build duration from costings + scope" is **not** what happens: it's either estimator-typed or fabricated defaults. This is the root seam — everything downstream inherits it.

**S2 — The estimate's real scope never reaches the Ops schedule.**
`resolveScheduleCategoryBlocks` (`scheduleCategories.mjs:147`) prefers `fee_proposals.categories`, a column **no production route writes** (only seed scripts do). It then tries a v3 endpoint the codebase itself documents as nonexistent (`buildexactDeepIntegration.mjs:17`), then falls to a hardcoded 26-name list. The genuinely-populated `buildexact_estimates.categories` is never consulted for the task list. A SCHED hint can override a duration but cannot **create** the matching task, so hints silently no-op when the default list has no fuzzy match.

**S3 — Nothing scheduling- or carpentry-related fires at Won.**
The mig 096 trigger creates only `(job_id, address, status)` (verified). `win-finalize` enriches the project but writes **no** `schedule_tasks` and has **zero** carpentry references (both verified). The `ops_ready_checklist` items "Start pushed to Scheduler" / "Selections transferred" (`constants.js:212`, `WonStage.jsx`) are bare operator checkboxes that move no data. `opsReadiness.mjs:24` only *reads* — it never generates.

**S4 — Two win paths of unequal richness.**
Tender win (`win-finalize`) fully enriches; a plain pipeline stage-move (`finalizeWonJob:464`) leaves a bare trigger stub — no accepted_trades, no cost_intelligence, no portal identity, no start date. Downstream automation can't assume a well-formed project.

**S5 — Carpentry is a fully disconnected island with two client identities.**
`carpentry_jobs.client_name` is the **builder company** (external-subsidiary model); an in-house build's carpentry is work for the **homeowner**. The schema/UX assumes external carpentry. Folding in-house carpentry into project finance also trips a **live-but-dormant double-count guard** (`labourAttribution.mjs excludeDoubleCounted` — written, not wired into any rollup).

**S6 — The proposal schedule is APB-only, ephemeral, and dateless.**
Only `proposalToApbDocxData` has it; the "original" template Sam perfected has none (verified). It's recomputed at every render, never persisted to `fee_proposals`, and has no commencement date, so it never becomes calendar dates. `buildRelativeSchedule` returns `null` with no SCHED lines → the APB `[ADD WEEKS]` silently empties.

**S7 — Dependency-model divergence in the Ops scheduler.**
Client `previewRipple`/`computeCriticalPath` (`scheduleUtils.js`) read typed `task_dependencies` (SS/FF/lag); server `cascadeScheduleForward` (`scheduleRoutes.mjs`) reads only legacy `depends_on` as FS+1 — and the AI generator populates `task_dependencies` while leaving `depends_on` empty. So on AI schedules the **server cascade effectively doesn't fire**. (Load-bearing unknown — verify against prod DB.)

**S8 — CW-3 has no home in the schema.**
`carpentry_job_stage_schedule` has no hold-point/inspection/notification stage type (status CHECK verified). The Ops `schedule_tasks` table *does* (`is_hold_point`, `task_type IN ('inspection','approval',…)`, migs 010/072) — the carpentry calendar does not. So even if DNF stages existed, there's nowhere to put them.

---

## (c) Feasibility of the headline feature — an accurate build timeline **in** the fee proposal

**Is a generated schedule available at proposal time? Partly — but not the one you'd expect.**

- The **Operations program** (`schedule_tasks`) is generated **post-Won** (`scheduleRoutes.mjs:440`), so at Tender/proposal time it usually **does not exist**. It cannot be the proposal's source.
- What *is* available at proposal time is the estimate itself. `buildRelativeSchedule` already turns estimate SCHED lines into a relative Week 1..N program with the 25% buffer — proving the mechanics work.

**So the timeline is technically available, but today it is not "real" in the sense Sam means:**
1. It only appears if the estimator manually inserted SCHED lines in Buildxact (easily missed → silent empty).
2. Durations are **not** derived from costings/scope — no cost→duration model exists (S1). Whatever weeks appear are estimator-typed or fabricated defaults.
3. It's relative (no commencement date → no calendar dates).
4. It's APB-only; the original template has no schedule tokens.

**What has to connect for it to be real (not fabricated):**

The good news — **the proven, non-fabricated pattern already exists in the codebase**: the carpentry stage calendar derives each stage's duration as `labour_sell ÷ teamChargeUpPerDay × (headcount/crew)` (`costModelStageDays`, `carpentryStageScheduleService.mjs:60`), the same cost math as the Pipeline break-even. That is exactly a cost→duration model. To make the proposal timeline real, reuse that engine at the estimate/proposal layer:

1. **A deterministic cost/quantity→working-days derivation per category**, from the estimate's labour value + a productivity/charge-up assumption, tagged by the existing `CATEGORY_MAPPING` phase (`buildexactParser.mjs`). SCHED lines become an explicit override *on top*, not the sole source.
2. **Persist it once** on `buildexact_estimates.schedule_hints` as the canonical estimate schedule, and have **both** the proposal transform and the Ops generator read that one source (kills the two-place re-derivation, S1).
3. **A wizard Schedule tab** (there is none today) so a human previews/adjusts/signs off the buffer and the weeks before the client sees them — the timeline must never be silently auto-fabricated.
4. **Tokens in the original template** (`CONSTRUCTION_SCHEDULE`, `TOTAL_WEEKS`) — mechanical, mirror APB lines 383-397.

**Verdict:** feasible and not far off — the rendering machinery (buildRelativeSchedule) and a proven cost→duration engine (costModelStageDays) both already exist. The real work is (a) building the costed model at the estimate layer instead of relying on SCHED lines, and (b) a human sign-off surface. Neither is exotic.

---

## (d) Phased build plan (each phase independently shippable)

**Phase 0 — Verify prod state (blocker check, hours).**
Confirm applied: mig **144/148** (memory notes 144 "awaits Sam applying" — the whole carpentry calendar is gated on it), **025/026/037/038/072** (Ops scheduler), **195/196** (won handoff + consent spine). Confirm the S7 unknown: do live AI-generated schedules leave `depends_on` empty (server cascade dead)? *Mechanical, but load-bearing — nothing below is safe to assume until checked.*

**Phase 1 — Schedule into the original proposal + a human sign-off surface (mostly mechanical).**
- Call `buildRelativeSchedule(p.categories, p.schedule_buffer_pct)` inside `proposalToDocxData`; add `CONSTRUCTION_SCHEDULE`/`_INTRO`/`TOTAL_WEEKS` to its return and to the original DOCX template; document in `FeeProposalTemplateGuide.jsx`.
- Add an explicit **"no timeline available"** state when SCHED lines are absent (guard the silent empty, S6).
- **Add a wizard Schedule tab** (preview, buffer edit, per-phase week override). *This is the one non-mechanical piece and it is mandatory — it's where a human verifies durations before the client sees them.*
- *Hard vs mechanical:* tokens are mechanical; the tab is small but load-bearing for honesty. **Ship without the tab and you're shipping fabricated durations to clients — don't.**

**Phase 2 — A real cost→duration model (the substance behind "accurate").**
- Add a per-category working-days derivation reusing `getCostModel`/`costModelStageDays` (the carpentry engine) applied to estimate labour value + `CATEGORY_MAPPING` phase. SCHED lines stay as an explicit override.
- Persist as the canonical estimate schedule on `buildexact_estimates.schedule_hints`; make Phase-1's transform read that.
- *Hard part:* the productivity/charge-up assumption per phase is a **Sam decision** (see Q1), not a code problem. Once set, deterministic.

**Phase 3 — Estimate scope → Ops schedule continuity (fix S2 + S1).**
- Extend `resolveScheduleCategoryBlocks` to read `buildexact_estimates.categories` **first**, before the dead `fee_proposals.categories` and dead v3 path.
- Bind durations to the Phase-2 canonical schedule (deterministic, not fuzzy).
- Collapse the dependency divergence (S7): migrate to typed `task_dependencies` server-side, **or** mirror `depends_on` at insert so the server cascade fires on AI schedules.
- *Result:* one estimate drives both the proposal timeline and the Ops Gantt.

**Phase 4 — Schedule seeding at Won (fix S3 + S4).**
- On the win transition, auto-generate a **draft** `schedule_tasks` program from the accepted estimate's canonical schedule + `projects.tentative_start_date` (make a target start **required** at win). Reuse `buildScheduleRowsForInsert` (`scheduleGenerate.mjs:137`). Operations inherits a draft, not a blank slate.
- Unify `finalizeWonJob` to perform the same enrichment as `win-finalize`.
- *Mechanical-to-moderate;* the draft must be operator-refinable, never auto-committed.

**Phase 5 — Carpentry auto-extraction at Won (the biggest build; genuinely hard).**
- **New bridge (does not exist):** on Won, create a `carpentry_jobs` row linked via `job_id`, `client_name` = homeowner, with an **in-house vs external flag** (S5).
- Source scope from the **builder** estimate (map `job_budgets` carpentry/framing/fix-out lines, or tee carpentry-classified estimate leaves into `carpentry_budget_line_items`), reusing `classifyCostType`/`matchTaskCategory`/`mapLineItem`.
- Refactor `/budget/seed` (`carpentryRoutes.mjs:1453-1556`) into a shared service so manual and auto paths share one code path; keep line-items `status='suggested'` (human confirm — Canonical Data Law).
- Auto-layout the stage calendar via `seedStageSchedule` from the project start date.
- **Resolve the labour money model first** — wire `labourAttribution.excludeDoubleCounted` before folding carpentry into project finance, or keep it a standalone sub-view. *Hard: two client identities + double-count + a finance-ownership decision (Q5).*

**Phase 6 — DNF → carpentry stage calendar (CW-3).**
- **Schema:** add a stage type/flag to `carpentry_job_stage_schedule` (mirror Ops `is_hold_point` + `task_type='inspection'`) so a notification stage can live on the calendar without being a labour subsection (its `stage_key` needs a distinct namespace given the UNIQUE constraint).
- **Data source:** the SA building-notification stages (commencement, footings, pre-slab pour, frame, wet-area waterproofing, completion) come from the certifier's Building Consent / DNF. **PlanSA has no API** (verified — the whole consent spine is track-and-prompt), so this is a **curated statutory template + operator confirmation**, echoing `ConsentSpine.jsx`, not an integration.
- Drop them as **pinned (locked) zero-duration hold-point blocks** with `depends_on` the relevant stage (e.g. frame-notification FS→frame), so ripple keeps them attached as dates move.
- *Hard-ish but mostly data-modeling + a curated template — no external API to fight. This is why it was safely deferred.*

**Where durations must stay human-verified (never fabricated):**
- The **client-facing proposal timeline** — always through the Phase-1 Schedule tab; the 25% buffer is an under-promise policy Sam owns.
- The **cost→duration productivity assumptions** (charge-up/day, crew) — surface them, let a human adjust per job.
- **Carpentry line-item→sub-task mapping** — stays `status='suggested'` until confirmed.
- **DNF notification stages** — statutory; operator/certifier-confirmed, never auto-invented.

---

## (e) Open questions for Sam (decisions only he can make)

1. **Duration source of truth.** Should the client-facing build duration come from a **costed model** (labour $ ÷ charge-up/day, reusing the carpentry engine), from **estimator-typed SCHED lines**, or from a **template**? And is **25%** the right under-promise buffer — global, or per-proposal?
2. **Who signs off the client-facing timeline** before it's sent? (This determines whether the Phase-1 Schedule tab is a hard gate — recommended.)
3. **Original vs APB.** Add the schedule to the **original** template you perfected, or keep it APB-only?
4. **One schedule spine or two.** Should the proposal timeline and the Ops `schedule_tasks` program be literally the **same** derived source? And should the Ops schedule be **auto-seeded at Won** (a draft you refine) or stay a manual generate?
5. **Carpentry money model.** When an in-house build's carpentry is auto-extracted, does it report margin **into** the project's `job_budgets` (folded — needs the double-count guard) or stay a **standalone P&L sub-view**? Add an in-house-vs-external flag on `carpentry_jobs`?
6. **Canonical win path.** Should a plain pipeline stage-move to "won" do the full enrichment, or should winning be **forced through the tender flow**?
7. **Contract value edge case.** When there are **0 or >1** accepted proposals, force a chosen proposal at win (today it's left null with a console warning)?
8. **DNF stages.** Is there a fixed SA statutory notification-stage template you want baked in (commencement / footing / pre-slab / frame / wet-area / completion)? Are they operator-entered from the certifier's Building Consent, or is there a document to parse? Who marks them done — the leading hand?
9. **Commencement date origin.** Where does the *real* commencement come from — the contract, the handover modal, or the scheduler? It's the single anchor the proposal calendar dates, the Ops schedule, and the carpentry stage calendar all need, and today it has **no upstream source** in any of the three.