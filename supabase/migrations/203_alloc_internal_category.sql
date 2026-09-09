-- =============================================================================
-- Migration 203 — Planner: a "Blue Leaf Internal → Logistics" shift carries the
--                  internal cost category (Model C, full Charge-Up parity).
--
-- Plan: docs/workforce/BLB_INTERNAL_CARPENTRY_FINANCE_PLAN.md §0 Phase 3 (LOCKED).
--
-- 1. Add an optional workforce_allocations.internal_category_id so an allocation to
--    the BL-INTERNAL cost job records WHICH worked category (Logistics) the person is
--    on — the exact sibling of charge_up_job_id (mig 146). Nullable + ON DELETE SET NULL
--    so non-internal allocations are unaffected and archiving a category never orphans a
--    shift. Kept OUTSIDE any project/carpentry XOR check (same as charge_up_job_id).
--
-- 2. Fix the mig-143 atomic move RPC so a displaced (swapped) shift is re-inserted
--    carrying BOTH charge_up_job_id AND internal_category_id. Today
--    workforce_allocation_move drops charge_up_job_id on the re-insert (mig 143:67-71) —
--    swapping a charge-up (or, once this lands, an internal) shift onto an occupied cell
--    would lose its sub-tag. CREATE OR REPLACE = idempotent.
--
--    (workforce_allocation_assign is left unchanged: the Express layer stamps both
--    sub-tags with a guarded post-assign UPDATE, so its insert never needs the columns —
--    keeping that RPC's signature stable means the atomic-assign path still binds and
--    works before this migration is applied.)
--
-- Idempotent (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION). Safe to re-run.
-- =============================================================================

ALTER TABLE workforce_allocations
  ADD COLUMN IF NOT EXISTS internal_category_id uuid
    REFERENCES internal_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workforce_alloc_internal_category
  ON workforce_allocations(internal_category_id);

-- ── mig-143 RPC fix: carry BOTH sub-tags on the swap re-insert ───────────────────────
-- Move an allocation to (to_employee, to_date). If occupied, SWAP atomically. The displaced
-- shift's OLD cell is re-inserted with the target's job AND its charge_up_job_id +
-- internal_category_id (previously dropped → the confirmed mig-143 sub-tag-loss bug).
create or replace function workforce_allocation_move(
  p_id           uuid,
  p_to_employee  uuid,
  p_to_date      date
) returns setof workforce_allocations
language plpgsql
as $$
declare
  v_src workforce_allocations;
  v_tgt workforce_allocations;
begin
  select * into v_src from workforce_allocations where id = p_id for update;
  if not found then
    raise exception 'allocation_not_found' using errcode = 'P0002';
  end if;

  -- No-op move.
  if v_src.employee_id = p_to_employee and v_src.allocation_date = p_to_date then
    return query select * from workforce_allocations where id = p_id;
    return;
  end if;

  select * into v_tgt from workforce_allocations
   where employee_id = p_to_employee and allocation_date = p_to_date
   for update;

  if found then
    -- SWAP. Free the target slot first, move src into it, then re-insert src's old cell with
    -- target's job (carrying BOTH sub-tags) — no point violates UNIQUE(employee_id, allocation_date).
    delete from workforce_allocations where id = v_tgt.id;
    update workforce_allocations
       set employee_id = p_to_employee, allocation_date = p_to_date, updated_at = now()
     where id = p_id;
    insert into workforce_allocations
      (employee_id, allocation_date, project_id, carpentry_job_id,
       charge_up_job_id, internal_category_id, notes, created_by, updated_at)
    values
      (v_src.employee_id, v_src.allocation_date, v_tgt.project_id, v_tgt.carpentry_job_id,
       v_tgt.charge_up_job_id, v_tgt.internal_category_id, v_tgt.notes, v_tgt.created_by, now());
    return query
      select * from workforce_allocations
       where (employee_id = p_to_employee   and allocation_date = p_to_date)
          or (employee_id = v_src.employee_id and allocation_date = v_src.allocation_date);
  else
    -- Plain move into an empty cell.
    update workforce_allocations
       set employee_id = p_to_employee, allocation_date = p_to_date, updated_at = now()
     where id = p_id;
    return query select * from workforce_allocations where id = p_id;
  end if;
end;
$$;

-- Ask PostgREST to reload its schema cache so the new column + FK embed are available.
NOTIFY pgrst, 'reload schema';
