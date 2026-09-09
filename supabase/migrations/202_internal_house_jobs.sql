-- =============================================================================
-- Migration 202 — Josh's & Sam's house as two cost-only carpentry jobs +
--                  archive the "Personal work" internal category.
--
-- Plan: docs/workforce/BLB_INTERNAL_CARPENTRY_FINANCE_PLAN.md §0 (LOCKED).
--
-- Model A (decision 1): the two houses become first-class carpentry_jobs rows so
-- finance invoices + timesheet hours attach directly (a charge_up "site" can carry
-- neither). No Buildxact quote, no allowance/budget — actuals-only. project_type
-- 'other', status 'active'. Mirrors the mig-125 internal-jobs seed pattern.
--
-- These refs deliberately do NOT collide with the ChargeUp/Internal detail branch
-- (CarpentryJobDetail.jsx:2403-2404 matches only BL-CHARGEUP / BL-INTERNAL) — the
-- houses fall through to the standard tab layout now and get their own bespoke
-- glance branch in Phase 2.
--
-- Decision 5: "Personal work" (mig 200) is archived, non-destructively — history
-- stays on BL-INTERNAL, the category just leaves the live/planner axis. Costed
-- rows still render for archived categories.
--
-- Idempotent (ON CONFLICT (reference) DO NOTHING; archive UPDATE no-ops on re-run
-- and is guarded so it silently skips when internal_categories is absent, i.e.
-- mig 200 not yet applied in this env). Safe to re-run.
-- =============================================================================

-- 1. Seed the two house jobs (idempotent on the UNIQUE reference).
insert into public.carpentry_jobs (reference, client_name, address, project_type, status)
values
  ('BL-JOSH-HOUSE', 'Blue Leaf Building', 'Josh''s house — internal', 'other', 'active'),
  ('BL-SAM-HOUSE',  'Blue Leaf Building', 'Sam''s house — internal',  'other', 'active')
on conflict (reference) do nothing;

-- 2. Archive the "Personal work" internal category (non-destructive; history stays
--    on BL-INTERNAL). Guarded so it no-ops when the table doesn't exist yet.
do $$
begin
  if to_regclass('public.internal_categories') is not null then
    update public.internal_categories
       set status = 'archived'
     where slug = 'personal_work'
       and status <> 'archived';
  else
    raise warning 'mig 202: internal_categories absent (mig 200 not applied in this env); Personal work NOT archived.';
  end if;
end $$;

notify pgrst, 'reload schema';
