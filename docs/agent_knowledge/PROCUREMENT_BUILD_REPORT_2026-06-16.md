# Procurement Intelligence (BQ-10) — Full Build + Test Report

> **Date:** 2026-06-16
> **Scope:** Built the Procurement Intelligence module to the **complete A–T plan** (`PROCUREMENT_INTELLIGENCE_PLAN.md`), then tested it repeatedly with multi-agent Opus 4.8 review (two rounds, 13 agent passes) + a live dedicated-test-job exercise on production Supabase.
> **Branch:** `carpentry-material-invoice-capture`.

---

## 1. Verdict

The module is **feature-complete against the A–T plan and production-ready pending ONE required action: apply migration 092 to the live Supabase DB.** P1 (register, command centre, selections, generation, schedule + finance integration) was already live; this session added P2/P3 (supplier entity + performance, lead-time learning, missing-item detection, quote-vs-allowance, backup suggestions, draft-PO, AI drafts, and the Calendar/Board/Supplier/Long-Lead views) and applied 6 security/correctness fixes found by a 7-agent assessment.

Everything the plan's §S says **NOT** to build (auto-ordering, full supplier portal, stock management, AI-only commitments) was deliberately left out. Every supplier commitment and client message remains a human action — the Hub only drafts, recommends, and warns.

---

## 2. What is built (A–T coverage)

| Plan area | Status | Where |
|---|---|---|
| §D `suppliers` (material vendors + performance) | ✅ | migration 085 + 092; suppliers CRUD; Suppliers tab |
| §D `procurement_templates` (one master, build-type filtered) | ✅ | 085 + 091 (62 items) |
| §D `procurement_items` register (source of truth) | ✅ | 085; `order_by_date` GENERATED |
| §E status model + risk model | ✅ | constants + `recomputeItemRisk` |
| §F/G Command Centre · Register · Selection Blocker | ✅ | Procurement.jsx |
| §F/G Calendar · Board · Supplier · Long-Lead views | ✅ | ProcurementExtras.jsx |
| §H schedule-driven order-by + ripple | ✅ | cascadeScheduleForward → register |
| §I supplier integration + performance | ✅ | suppliers + `supplier_lead_observations` |
| §J finance committed cost → FCC | ✅ | computeCommittedCost → FCC Committed KPI |
| §K selection integration (portal_decisions) | ✅ | selection blockers + AI reminder |
| §L AI opportunities (draft-only) | ✅ | procurementAiService (email, reminder, reply summary, digest, schedule-impact) |
| §L missing-item detection | ✅ | detectMissingItems (peer-job) + Register banner |
| §L quote-vs-allowance + backup suggestions | ✅ | learning service + endpoints |
| §M generate-at-lock · recalc-on-move · draft-PO | ✅ | lock hook · ripple · draft-PO |
| §M lead-time learning (actual vs expected) | ✅ | captureLeadObservation + refreshSupplierPerformance |
| §N edge cases (subbie/client excluded from orders, no-estimate mode, overdue-at-gen) | ✅ | supply_type guard, template-first, risk |
| §O empty states | ✅ | all tabs |
| §P permissions (admin/supervisor; cost = admin) | ✅ | role gates + cost-field gate |
| §S do-NOT-build (auto-order, portal, stock, AI commit) | ✅ excluded | by design |

---

## 3. Verification evidence

- **Live dedicated-test-job exercise (production Supabase): 10/10 passed**, clean teardown (0 residual). Proved: generation (52 items for a renovation, build-type filter excludes trusses/ready-mix, includes strip-out), GENERATED `order_by_date` = 2026-08-12, committed = approved-only = 12000 (allowance-only item excluded), idempotent regenerate preserving a human edit, missing-item detection, risk recompute.
- **Risk math unit test: 13/13** against the §1.2 spec.
- **Migrations 085 + 091 + 092 applied on a scratch Postgres**: generated column, 1:1 idempotent backfill, RLS, 62-row template seed, supplier perf columns, lifecycle columns, lead-observations ledger — all green + re-runnable.
- **Build exit 0, lint 0 warnings** after all changes.
- **Two multi-agent Opus 4.8 review rounds** (7 lenses → 111 findings; then 6 lenses adversarial verification of the new code + fixes).

---

## 4. Round 1 — 7-agent assessment: fixes applied

The first assessment (integration, learning, adversarial, usability, data/security, performance, completeness) returned 111 findings (21 high, 29 medium, 61 low). The **P0/P1** items were fixed this session:

| Fix | Severity | What changed |
|---|---|---|
| Role-gate all procurement read endpoints (admin/supervisor) | P0 | were `requireAuth`-only → employees could read costs |
| `committed_cost` gated in FCC payload + register | P0 | non-admins no longer receive committed cost |
| Cost-field edit gate on item PATCH (admin only) | P0 | supervisors manage the register but can't change cost |
| Stop schedule cascade writing FROZEN `procurement_order_by` | P1 | removed the live second source of truth for order-by |
| Committed cost = `approved ?? quoted` (no allowance fallback) | P1 | stops overstating committed cost into FCC margin |
| Register inline-edit error feedback | P1 | PATCH errors surfaced, not swallowed |
| Log dropped Buildexact estimate lines | P2 | silent drops now logged |
| Command-centre composite (partial) index | P2 | `idx_proc_items_active_orderby` in 092 |

Most P1/P2 **build** items the assessment listed (wire learning, wire AI, real draft-PO, the four views) were *already completed* in this session's build — the assessment ran against the P1 code.

---

## 5. Round 2 — adversarial verification of the new code (7 agents)

A second Opus 4.8 pass (fixes-verification, learning-correctness, AI-safety, routes-new, UI-new, completeness-final + synthesis) adversarially re-read the **write/insert paths** rather than comment blocks — and caught two things the first pass and 5 of 6 round-2 lenses missed:

| Round-2 finding | Severity | Resolution |
|---|---|---|
| A **second** writer of frozen `schedule_tasks.procurement_order_by` exists in the *legacy schedule procurement-task* endpoints (8 sites incl. scheduleRoutes ~1087) — not the procurement module | critical (architectural) | **Reconciled, not ripped out.** The procurement module never reads that field (it reads the register's GENERATED `order_by_date`), so there's no functional divergence in the module. Ripping one write would half-break the legacy schedule procurement-task feature + its `v_procurement_dashboard` view. Softened 085's comments FROZEN→DEPRECATED to be honest; **tracked the legacy→register migration as action #2 below.** |
| POST `/api/procurement/items` didn't gate cost fields by role (PATCH did) — a supervisor could create an item with cost pre-filled | high | **FIXED** — same admin-only cost-strip now on the create path. |
| `refreshSupplierPerformance` returned snake_case past the API boundary | medium | **FIXED** — `rowToCamel` on the perf endpoint. |
| `po_number` could collide in the same millisecond | low | **FIXED** — added a random suffix. |
| Unused `isAdmin` prop on `SuppliersTab` | low | **FIXED** — removed. |
| AI service is draft-only; all routes role-gated; committed cost computed-not-stored; learning math correct | — | **Confirmed** by the learning/AI/routes lenses. |

The other 5 applied fixes (role gates, committed gating, cost PATCH gate, cascade fix, committed=approved-only, inline-edit errors) were **re-confirmed correct**.

**Round-2 verdict (verbatim):** *"Not yet production-ready as-is, but close — gated on two small code fixes plus the migration. The module is functionally complete across P1/P2/P3 and honours the architectural Laws (AI strictly DRAFT-ONLY, committed cost computed-not-stored, Canonical Data Law respected, role gates and ex-GST correct, plan §S prohibitions all observed)."* — **Both code fixes are now applied; only migration 092 remains.**

Also fixed this session beyond the two rounds: an approved **portal selection decision now auto-clears** the linked procurement selection blocker (plan §K) — `portalRoutes` respond handler.

---

## 6. ACTION LIST — to be fully functional

### Required (the ONE thing left to be fully live)
1. **Apply migration `092_procurement_intelligence_p2p3.sql` to the live Supabase DB.** Until then the supplier-performance columns, item lifecycle timestamps, and the lead-time learning ledger don't exist — so supplier performance, lead-time learning, and capture-on-delivery are dormant (they fail safe / no-op). 085 + 091 are already applied; 092 is the only outstanding migration.

### Recommended (P2 — architectural cleanup + scale)
2. **Migrate the legacy schedule procurement-task endpoints to the register.** `scheduleRoutes` still has an older "procurement task" CRUD feature that reads/writes `schedule_tasks.procurement_*` (8 write sites) and the `v_procurement_dashboard` view. Point those at `procurement_items`, then a cleanup migration can **drop** the deprecated `schedule_tasks.procurement_*` columns. (No functional divergence today — the procurement module already uses the register — but this removes the parallel legacy system.)
3. Batch the hot DB paths for 1000+ items: `/command-centre` (single query + bounded), `refreshJobRisk` (batch updates), `generateProcurementPlan` (avoid per-line `resolveTradeCategoryId` round-trips). _Current scale (a handful of jobs) is fine; this is for growth._
4. Optimistic-lock on item PATCH (409 on stale `updated_at`) for concurrent-edit safety; guard against two `generateProcurementPlan` runs racing on one job.
5. Add an automated regression test for the procurement fixes (the live test-job script can be promoted into `scripts/`).

### Optional (P3 — polish)
6. Replace remaining `window.prompt/confirm/alert` (Add item, Regenerate confirm, draft-PO note) with inline forms.
7. Mobile-responsive Register table + `aria-label`s.
8. Document the RLS posture (`auth_users FOR ALL` is safe because the API enforces role gates) or tighten to job-membership RLS.

### Data prerequisites (so the intelligence has something to learn from)
9. Add your real **suppliers** (Suppliers tab) and mark preferred ones.
10. Sam to confirm the master template's **long-lead flags + real lead times** (runbook Part 4) — currently sensible drafts.

### ✅ Resolved this session (no action needed)
- All round-1 P0/P1 fixes (role gates, cost gates, committed-cost gating + approved-only, cascade frozen-field, inline-edit errors).
- Round-2 P0s: POST `/items` cost gate; legacy frozen-field reconciled (085 comments → DEPRECATED + tracked above).
- camelCase on supplier-performance; `po_number` collision hardening; unused prop.
- **Portal selection sync** — an approved `portal_decisions` row now auto-confirms the linked procurement item's selection (clears the blocker).

---

## 7. Files

**New:** `supabase/migrations/092_procurement_intelligence_p2p3.sql`, `server/lib/procurementLearningService.mjs`, `server/lib/procurementAiService.mjs`, `src/components/procurement/ProcurementExtras.jsx`, SOPs `16-07`–`16-10`.
**Modified:** `server/lib/procurementRoutes.mjs`, `procurementService.mjs`, `scheduleRoutes.mjs`, `financeCCRoutes.mjs`, `src/pages/Procurement.jsx`, `docs/sops/SOP_INDEX.md`, `SOP_CHANGELOG.md`.
**(P1, prior commit):** migrations `085`/`091`, `procurementService.mjs`, `procurementRoutes.mjs`, `Procurement.jsx`, lock hook, schedule ripple, SOPs `16-01`–`16-06`.
