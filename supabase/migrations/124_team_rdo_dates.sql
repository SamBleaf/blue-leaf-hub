-- 124: Team-wide RDO dates (whole-crew rostered days off) — the PRIMARY RDO model for Blue Leaf.
-- All field workers usually take the same RDO (planned a year ahead, commonly the last Friday of
-- each month). Additive + advisory/display-only, exactly like migration 119: these do NOT block
-- allocations, do NOT create/alter timesheets, and do NOT sync to Buildexact. Employee-specific
-- RDOs (119: workforce_employee_rdo_dates / workforce_rdo_patterns) remain as later exceptions.

create table if not exists workforce_team_rdo_dates (
  id          uuid primary key default gen_random_uuid(),
  rdo_date    date not null,
  region      text not null default 'SA',
  note        text,
  created_by  uuid,
  created_at  timestamptz not null default now()
);

-- One team RDO per date per region (lets generate-yearly upsert idempotently).
create unique index if not exists wtrd_date_region_uniq on workforce_team_rdo_dates(rdo_date, region);

alter table workforce_team_rdo_dates enable row level security;
-- Service role (server API) bypasses RLS; access is gated to admin/supervisor at the route layer.

notify pgrst, 'reload schema';
