# Blue Leaf Hub — Future Roadmap

> Last updated: 2026-05-21 · **STALE — reconciled 2026-07-19.** Current backlog of truth: `docs/UNRESOLVED_WORK_INVENTORY.md`.
> Derived from CLAUDE.md sprint backlog, MODULE_6_7_SPEC.md, BUILDEXACT_INTEGRATION_PROMPT.md, and known product gaps.

> **RECONCILE 2026-07-19:** Sprints 2 & 3 below are marked "Next/Planned" but **shipped long ago** (Baseline/EOT, typed deps + Dep Map — see CLAUDE.md Sprint Backlog ✅). This doc predates a year of work (Sales/CRM, Carpentry, Workforce Planner/Pipeline, Marketing, Portal v2, Geo, the earned-value + budget-spine builds). Treat the statuses below as historical; use the inventory doc for what's genuinely open.

---

## Committed Sprints (From CLAUDE.md Backlog)

### Sprint 2 — Schedule Intelligence
**Status**: Next
**Theme**: Make the schedule visible and accountable

- **Baseline ghost bars** — DB migration needed: add `baseline_start_date`, `baseline_end_date` to `schedule_tasks` (already in migration 025 — review if complete). Lock baseline snapshot at project start. Gantt renders semi-transparent overlay showing original planned bars vs current.
- **EOT (Extension of Time) tracking** — `schedule_eot` table (already in migration 025). "Delays" tab in Schedule Manager. Raise EOT: reason code + days claimed + approval. Approved EOT pushes schedule forward. Delays view shows history.

**Note**: Migration 025 appears to already add baseline columns and `schedule_eot` table. Verify if migration is applied before building UI.

---

### Sprint 3 — Dependencies Overhaul
**Status**: Planned
**Theme**: Proper construction scheduling logic

- Migrate `depends_on` (simple array) → `task_dependencies` JSONB (`[{taskId, type, lag}]`)
  - Types: FS (Finish-to-Start), SS (Start-to-Start), FF (Finish-to-Finish), SF (Start-to-Finish)
  - Lag days per dependency
- Updated `TaskDetailPanel` dependency editor: table UI with type + lag per link
- Dependency Map view (already partially built: `DependencyMap.jsx` using @xyflow/react)
- Canonical residential construction dependency template in AI schedule generation
- Remove legacy `depends_on` support after migration complete

---

### Sprint 4 — Operations Manager Overhaul
**Status**: Planned
**Theme**: The daily command view for managing multiple projects

- Rich project cards: schedule health badge, progress %, next milestone, active trade count
- Card/list toggle (pattern from Sales Pipeline — already implemented as pattern)
- Global Gantt improvements: trade filter, zoom levels, project colour legend
- Trade conflict detection across projects (already implemented — improve UX)
- Project overview tab on `OperationsProjectDetail.jsx` — currently minimal

---

### Sprint 5 — Client Portal (Deferred)
**Status**: Deferred
**Theme**: Give clients real-time confidence in their build

- Token-based shareable schedule link (public, no login — portal architecture already supports)
- Variation approval workflow with client sign-off in portal
- Site diary → client weekly update pipeline (automated digest)
- EOT notification to client when schedule changes

---

## Module 7 — Buildexact Deep Integration
**Source**: `BUILDEXACT_INTEGRATION_PROMPT.md`
**Status**: Partial

Four integration items:
1. **Pull estimate from Buildexact into Fee Proposal** — already partially built (parse XLSX/PDF). Goal: direct API pull by Buildexact job ID.
2. **Push quote amounts to Buildexact** — when a subcontractor quote is accepted, push the amount to the matching Buildexact cost category.
3. **Sync fee proposal status** — when fee proposal is accepted/rejected, update Buildexact job stage.
4. **SCHED/COST METRIC parsers** — parse Buildexact schedule and cost metric exports to enrich Hub schedule with Buildexact cost data.

---

## Planned Modules (Not Yet Started)

### Historical Intelligence
- Build from accumulated job data: costs by trade/phase, duration benchmarks, subcontractor performance
- Feed into pre-tender estimates and schedule templates
- AI generates insights from patterns across completed projects
- Tables partially exist: `cost_benchmarks`, `normalized_costs`, `cost_intelligence_insights`, `pretender_estimates`

### Workforce Intelligence
- Planned: staff scheduling, trade availability calendar, subcontractor performance scores
- SOP 10-01 placeholder exists
- No DB tables or routes yet

### Procurement Intelligence
- Track subcontractor lead times from historical procurement data
- Alert: "this trade has historically needed 6 weeks notice — order deadline is approaching"
- Data source: `schedule_tasks.procurement_lead_days` + completed project history

### Xero Integration
- `xero_credentials` table exists (migration 020)
- Settings UI has Xero connection placeholder
- No API routes or sync logic yet
- Goal: push approved invoices to Xero, pull payment status back

### Advanced Blueprint Capabilities
- Proactive alerts (notify before deadline, not just respond to questions)
- SOP auto-generation from completed workflows
- QC scoring on RFQ packages before send
- Pre-tender estimate validation against cost benchmarks

---

## SOP Documentation (82 Planned)
**Status**: 6 of 82 written (Draft)

All 82 SOPs are indexed in `docs/sops/SOP_INDEX.md`. Priority order:
1. High priority: authentication, navigation, lead creation, RFQ creation, schedule creation, invoice upload, invoice approval, induction setup
2. Medium priority: Blueprint coaching, qualifying score, addendum, SWMS, progress claims, variations
3. Low priority: archive/delete flows, reporting

Target: complete all High priority SOPs before client onboarding.

---

## Infrastructure Improvements

### Must Do
- Fix Vercel production rewrite (`YOUR-RAILWAY-HOST` placeholder) — ISSUE-001
- Tighten RLS policies — ISSUE-005
- Update AGENT_OVERVIEW.md schema documentation — ISSUE-002

### Should Do
- Move DOCX template to server-side storage — ISSUE-008
- Split module6Routes.mjs into smaller route files — ISSUE-007
- Add integration tests for critical paths — ISSUE-006
- Fix lint failures in Blueprint files — ISSUE-009

### Nice to Have
- Token expiry / revocation for Client Portal — ISSUE-014
- Email delivery tracking via click (not pixel) — ISSUE-019
- Formal link between `trade_categories` and `trade_master_library` — ISSUE-003
