-- =============================================================================
-- Migration 200 — Internal cost category sub-layer under BL-INTERNAL.
--
-- Mirror of charge_up_jobs (mig 145) re-purposed COST-ONLY: no margin_pct, no
-- charge_out_hourly, no invoice. Workers pick an internal category the way they pick
-- a Charge Up site. Six seeded categories split by cost source:
--   • timesheet (worked)  → ATEC / trade school, Logistics, Personal work
--   • leave   (derived)   → Annual leave (annual), Sick leave (sick), RDO (rdo)
-- The leave categories are DERIVED at report time from the leave/RDO spine — they are
-- never worker-logged, and timesheet_entries.internal_category_id is only ever set for
-- cost_source='timesheet' categories (enforced server-side).
--
-- Idempotent (CREATE ... IF NOT EXISTS, ON CONFLICT DO NOTHING) — safe to re-run.
-- =============================================================================

-- Self-contained updated_at fn (CREATE OR REPLACE = idempotent; no dependency on the
-- mig-145 set_updated_at() name).
create or replace function public.internal_categories_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create table if not exists public.internal_categories (
  id                uuid primary key default gen_random_uuid(),
  carpentry_job_id  uuid not null references public.carpentry_jobs(id) on delete cascade,
  category_label    text not null,
  slug              text not null,
  cost_source       text not null default 'timesheet'
                       check (cost_source in ('timesheet','leave')),
  leave_type        text check (leave_type in ('annual','sick','rdo','unpaid')), -- aligned w/ mig 201
  notes             text,
  status            text not null default 'active'
                       check (status in ('active','archived')),
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists internal_categories_job_slug_uidx
  on public.internal_categories (carpentry_job_id, slug);
create index if not exists internal_categories_parent_idx
  on public.internal_categories (carpentry_job_id);
create index if not exists internal_categories_status_idx
  on public.internal_categories (status);

alter table public.internal_categories enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where tablename='internal_categories' and policyname='auth_users') then
    create policy auth_users on public.internal_categories
      for all to authenticated using (true) with check (true);
  end if;
end $$;

drop trigger if exists trg_internal_categories_updated_at on public.internal_categories;
create trigger trg_internal_categories_updated_at
  before update on public.internal_categories
  for each row execute function public.internal_categories_touch_updated_at();

-- Per-entry tag (exact sibling of timesheet_entries.charge_up_job_id, mig 145).
-- Nullable + ON DELETE SET NULL so untagged / archived-category hours roll to the parent.
alter table public.timesheet_entries
  add column if not exists internal_category_id uuid
    references public.internal_categories(id) on delete set null;
create index if not exists timesheet_entries_internal_category_idx
  on public.timesheet_entries (internal_category_id)
  where internal_category_id is not null;

-- Assert BL-INTERNAL parent exists before seeding (no silent no-op).
do $$
declare parent_count int;
begin
  select count(*) into parent_count from public.carpentry_jobs where reference='BL-INTERNAL';
  if parent_count = 0 then
    raise warning 'mig 200: no BL-INTERNAL carpentry_jobs row found (mig 125 not seeded in this env); internal categories NOT seeded.';
  end if;
end $$;

-- Seed the six categories (idempotent on slug).
insert into public.internal_categories
  (carpentry_job_id, category_label, slug, cost_source, leave_type, sort_order)
select j.id, v.label, v.slug, v.cost_source, v.leave_type, v.sort_order
from public.carpentry_jobs j
cross join (values
  ('ATEC / trade school','atec','timesheet',null,10),
  ('Logistics','logistics','timesheet',null,20),
  ('Personal work','personal_work','timesheet',null,30),
  ('Annual leave','annual_leave','leave','annual',40),
  ('Sick leave','sick_leave','leave','sick',50),
  ('RDO','rdo','leave','rdo',60)
) as v(label,slug,cost_source,leave_type,sort_order)
where j.reference = 'BL-INTERNAL'
on conflict (carpentry_job_id, slug) do nothing;

notify pgrst, 'reload schema';
