-- =============================================================================
-- Migration 201 — Type + hour the per-employee leave spine.
--
-- Lets the derived-leave cost block (report time) group each non-working day by
-- category (annual / sick / rdo / unpaid) and honour half-days. Additive + idempotent.
--
-- NOTE: workforce_team_rdo_dates (mig 124) intentionally gets NO column — team RDO is
-- 'rdo' by definition and full-day by definition; costing fans it out over active
-- employees at read time. Only the per-employee spine + the day-off request row are typed.
--
-- HOURS read-time contract: a NULL `hours` means "use the employee's standard day"
-- (per-employee standard hours, fallback 7.6). The value is NOT defaulted in-DB so the
-- distinction between "explicit half-day" and "unset → std day" survives; the derived
-- cost block resolves `hours := row.hours ?? standardHours(employee)`.
-- =============================================================================

alter table public.workforce_day_off_requests
  add column if not exists leave_type text
    check (leave_type in ('annual','sick','rdo','unpaid'));

alter table public.workforce_employee_rdo_dates
  add column if not exists leave_type text
    check (leave_type in ('annual','sick','rdo','unpaid'));
alter table public.workforce_employee_rdo_dates
  add column if not exists hours numeric;  -- null => cost uses per-employee standard day

-- Backfill: existing untyped per-employee rows become 'rdo'. The annual-vs-sick split is
-- therefore forward-only (accrues from typed capture onward); RDO history is complete.
update public.workforce_employee_rdo_dates
  set leave_type = 'rdo'
  where leave_type is null;

notify pgrst, 'reload schema';
