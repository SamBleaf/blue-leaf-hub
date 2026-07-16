-- 143 — Atomic Planner allocation move/swap/assign.
-- The planner's client-side move/swap did del→del→create→create as separate HTTP round-trips,
-- which (a) could half-fail and lose an allocation, and (b) raced the UNIQUE(employee_id, allocation_date)
-- constraint, producing "chip vanishes / duplicates". These two functions do the whole operation in a
-- single transaction (a plpgsql function body is atomic), so a swap never half-applies and never collides.
-- Called by the service role from the Express layer; endpoints fall back to ordered JS ops if absent.

-- Replace-or-insert the allocation for (employee, date) in one transaction. Returns the resulting row.
create or replace function workforce_allocation_assign(
  p_employee    uuid,
  p_date        date,
  p_project     uuid,
  p_carpentry   uuid,
  p_notes       text,
  p_created_by  uuid
) returns setof workforce_allocations
language plpgsql
as $$
begin
  delete from workforce_allocations
   where employee_id = p_employee and allocation_date = p_date;

  return query
  insert into workforce_allocations
    (employee_id, allocation_date, project_id, carpentry_job_id, notes, created_by, updated_at)
  values
    (p_employee, p_date, p_project, p_carpentry, p_notes, p_created_by, now())
  returning *;
end;
$$;

-- Move an allocation to (to_employee, to_date). If that cell is occupied, SWAP the two jobs
-- atomically (no unique-constraint collision, no lost row). Returns every affected row.
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
    -- target's job — no point in the sequence violates UNIQUE(employee_id, allocation_date).
    delete from workforce_allocations where id = v_tgt.id;
    update workforce_allocations
       set employee_id = p_to_employee, allocation_date = p_to_date, updated_at = now()
     where id = p_id;
    insert into workforce_allocations
      (employee_id, allocation_date, project_id, carpentry_job_id, notes, created_by, updated_at)
    values
      (v_src.employee_id, v_src.allocation_date, v_tgt.project_id, v_tgt.carpentry_job_id,
       v_tgt.notes, v_tgt.created_by, now());
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
