-- 118_workforce_planner_job_colors.sql
-- W17-P4b/P4c: per-job Planner settings (advisory / UI only) — display colour + whether
-- the job is shown on the Planner board. Isolated table (NOT columns on projects/
-- carpentry_jobs): these are UI preferences, not canonical job facts (Canonical Data Law).
-- Deny-all RLS: only the service role (API, admin/supervisor-gated) reads/writes.

create table if not exists workforce_planner_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  carpentry_job_id uuid references carpentry_jobs(id) on delete cascade,
  color text,                                   -- nullable: a job may be on the board with its auto colour
  on_board boolean not null default false,      -- W17-P4c: opt-in board membership
  created_by uuid,
  updated_at timestamptz not null default now(),
  constraint wpj_one_job check (
    (project_id is not null and carpentry_job_id is null) or
    (project_id is null and carpentry_job_id is not null)
  )
);

create unique index if not exists wpj_project_uniq
  on workforce_planner_jobs(project_id) where project_id is not null;
create unique index if not exists wpj_carpentry_uniq
  on workforce_planner_jobs(carpentry_job_id) where carpentry_job_id is not null;

alter table workforce_planner_jobs enable row level security;
-- No policies → deny-all to anon/auth; service-role API bypasses RLS.
