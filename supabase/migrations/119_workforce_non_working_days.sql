-- 119_workforce_non_working_days.sql
-- W17-P5: RDO + public-holiday DISPLAY model (advisory / UI only).
-- HARD RULE: display only — no accrual, no Xero, no Buildxact, no timesheet impact.
-- Deny-all RLS; service-role API (admin/supervisor) only.

create table if not exists workforce_public_holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null,
  name text not null,
  region text not null default 'SA',
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists wph_date_region_uniq on workforce_public_holidays(holiday_date, region);

create table if not exists workforce_employee_rdo_dates (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  rdo_date date not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists werd_emp_date_uniq on workforce_employee_rdo_dates(employee_id, rdo_date);

create table if not exists workforce_rdo_patterns (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  interval_weeks int not null default 2 check (interval_weeks between 1 and 8),
  weekday int not null check (weekday between 0 and 6),   -- 0=Sun .. 6=Sat (JS getDay)
  anchor_date date not null,                              -- a date on which this RDO falls
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists wrp_emp_idx on workforce_rdo_patterns(employee_id);

alter table workforce_public_holidays enable row level security;
alter table workforce_employee_rdo_dates enable row level security;
alter table workforce_rdo_patterns enable row level security;
-- No policies → deny-all to anon/auth; service-role API bypasses RLS.
