-- ============================================================================
-- 093_employee_number.sql
-- Workforce: auto-assigned sequential employee number.
--   * Adds employees.employee_number (integer).
--   * Backfills existing employees in stable order (created_at, then name) → 1..N.
--   * New employees get the next number server-side (MAX+1) on create.
-- Idempotent + additive.
-- ============================================================================

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS employee_number integer;

-- Backfill any unnumbered employees in a stable order, continuing after the max.
DO $$
DECLARE base integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.employees WHERE employee_number IS NULL) THEN
    SELECT COALESCE(MAX(employee_number), 0) INTO base FROM public.employees;
    WITH ordered AS (
      SELECT id, base + row_number() OVER (ORDER BY created_at NULLS FIRST, name) AS rn
      FROM public.employees WHERE employee_number IS NULL
    )
    UPDATE public.employees e SET employee_number = o.rn FROM ordered o WHERE e.id = o.id;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_number_key
  ON public.employees (employee_number) WHERE employee_number IS NOT NULL;

COMMENT ON COLUMN public.employees.employee_number IS
  'Auto-assigned sequential employee number (next = MAX+1 on create). Distinct from the optional staff_code.';
