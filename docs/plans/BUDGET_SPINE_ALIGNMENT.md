# Budget ↔ Schedule ↔ PWA ↔ Timesheet — connectivity audit + alignment plan

**Date:** 2026-07-19 · **Trigger:** Sam — "the data is not aligned … the budget categories and subcategories is the source of truth for the schedule, values, allowed days, and timesheet subcategories."
**Grounded in live data for J1120** (Denberger Built, `413d9151…`, 6 budget categories, 73 line items).

## The core finding: there is no single "sub-task" identity

The same sub-task ("Cladding installation") is represented **four different ways** with **three different grains**:

| Module | Identity it uses | Label it shows | Value | Days / duration | Actual it books |
|---|---|---|---|---|---|
| **Budget** | `canonical_key` group (3 line-item rows) | dictionary → "Cladding installation" | Σ sell = **$16,661** | — | per-leaf `budget_line_item_id`, but margin ignores it |
| **Schedule** (subsection) | `canonical_key` group | ~~first line-item description~~ → **now dictionary** (fixed 2026-07-19) | $16,661 | `ceil(sell/rate)`, "indicative", **not persisted** | — |
| **PWA** (log target) | **one arbitrary** `budget_line_item_id` (the $825 of $16,661 rows, by sort_order) | dictionary → "Cladding installation" | — | — | `budget_line_item_id` (0 entries use it) |
| **Timesheet / Margin** | **`workforce_task_category`** (8-key: "cladding") | category name | $33,670 (whole category) | stage duration | `labourByTask[8-key]` (coarse) |

## The breaks (why "it won't work as intended")

1. **No single identity.** A sub-task is a `canonical_key` group of N budget rows, but the PWA collapses it to ONE arbitrary leaf, and margin discards `canonical_key` and books at the 8-key category. So a full day of cladding install is credited to one $825 line; the $6,960 + $8,874 rows can never receive actuals.
2. **Timesheets are 100% coarse in practice.** 0 of 94 approved entries DB-wide tag a `budget_line_item` — all labour rolls up only at the 8-key `task_category`. The fine attribution exists in code but is dead in the data → **per-sub-task actuals never accrue.**
3. **Margin ignores the fine grain by design** (`labourByTask[workforce_task_category]`), so even if workers tagged sub-tasks, the headline margin wouldn't use them.
4. **Schedule ↔ budget is joined only by `slug(category_name)`** — not `canonical_key`, not the workforce taxonomy. Rename a category → key drifts → unlocked stage rows are dropped + reseeded, silently losing hand-set dates.
5. **Material sub-tasks are half-mapped.** The dictionary only splits framing supply, so 2 whole supply categories (Cladding Supply $41,991, Second Fix Supply $17,828) and 33 of 73 line items have `canonical_key = null` — no sub-task identity at all.
6. **`site_tasks` (the field task list) is a separate spine** — no `budget_line_item_id`/`canonical_key`; ticking a site task does not attribute labour.

## The unifying model (proposal)

Make **`(task_category, canonical_key)` = the sub-task** the single first-class identity everywhere, budget-driven:

- **Sub-task** = a `canonical_key` group within a labour budget category. Value = Σ leaf `sell_ex_gst`. Label = dictionary. (Budget already groups this way; schedule now labels this way.)
- **PWA**: worker logs hours against the **sub-task** (category → sub-task), and we store **`canonical_key`** on `timesheet_entries` (migration), not one arbitrary leaf id.
- **Margin + schedule + budget** all roll up and display by `(task_category, canonical_key)` with the same dictionary label → per-sub-task earned value + %done become real.
- **Allowed days**: sub-task duration = its Σ sell ÷ team day-rate; the stage = the sum of its sub-tasks (reconciled to the budget's Days @ margin).
- **Coverage**: extend the dictionary/mapping so every labour + material category can split into sub-tasks (kills the 33 unmapped leaves), and (optionally) fold `site_tasks` onto the same spine.

## Decision — depth (Sam)

- **A. Alignment only** — labels + reconcile the displays. Cheap; but timesheets stay coarse so per-sub-task actuals never accrue. (Label step already shipped.)
- **B. Sub-task spine** — add `canonical_key` to `timesheet_entries` (migration), PWA logs at sub-task grain, margin + schedule roll up per sub-task. Budget becomes the true end-to-end source of truth. *(Recommended core of the ask.)*
- **C. B + full coverage** — also fix material sub-task mapping, persist schedule sub-task durations (lockable), and fold `site_tasks` onto the spine.

Sub-decision to confirm at build time: whether picking a sub-task in the PWA is **required** (so actuals always attribute) or stays optional with a category fallback.

---

## DECISION (Sam, 2026-07-19): **Full (spine + coverage)** · PWA sub-task **required**

### Execution roadmap

**Phase 0 — label alignment** ✅ shipped `3d25d40` (schedule subsection labels = dictionary = budget/PWA).

**Phase 1 — sub-task spine + timesheet attribution** (migration 147)
- Migration: `timesheet_entries.canonical_key text` + index. The sub-task attribution key = `(task_category, canonical_key)`.
- Worker PWA (`WorkerLogHours`): after the category, the sub-task picker is **required** for carpentry when the job's category has confirmed sub-tasks; store `canonical_key` on the entry (keep `budget_line_item_id` for the leaf drill-down).
- `POST /api/worker/timesheets`: accept + validate + store `canonical_key` (belongs-to the category's confirmed sub-tasks; required when they exist). `GET /timesheets/:date` echoes it.
- `GET /budget`: roll up labour actuals by `(task_category, canonical_key)` → real per-sub-task actual, attached to each `SubtaskSections` group (currently the group shows $0). Pure `subtaskRollup` helper + tests.

**Phase 2 — earned value at sub-task grain** ✅ (this session)
- Budget drill-down (`SubtaskSections`) is now a real per-sub-task earned-value view: each sub-task shows **sell vs actual (from mig-147 timesheets) vs variance** (red when over), + hours; a footer surfaces the category's **untagged actual** (`line.untaggedActual` = category actual − Σ sub-task actuals) so legacy/coarse hours are visible. Category-level margin already includes all logged hours (labourByTask), so no double-count.
- **Deferred to a hardening pass:** reconciling the schedule↔budget join off the fragile `slug(category_name)` → `workforce_task_category` primary. It touches the auto-heal drift logic that previously lost hand-set dates — not worth risking mid-stream; folded into Phase 3 / a dedicated hardening pass.

**Phase 3 — coverage**
- Extend the sub-task dictionary/mapping so **every** labour + material category can split (kills the ~$60k / 33 unmapped leaves): generalise `materialGroup()` beyond framing supply; allow a manual sub-task on any category.
- Persist + lock schedule **sub-task** durations (a sub-task can be scheduled/locked, not just re-derived each GET).
- Fold `site_tasks` onto the same `(task_category, canonical_key)` spine so ticking a field task maps to a budget sub-task.

Each phase: pure-helper unit tests + live read-only verification on J1120 + adversarial review + SOP/dictionary update + ship. Migrations applied manually by Sam.

