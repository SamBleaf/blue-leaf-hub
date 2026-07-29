-- 162_carpentry_whs.sql
-- Carpentry WHS Phase 1: extend the ONE shared SWMS library, and make the per-job SWMS link + the
-- worker sign-on record work for the carpentry_jobs spine (dual-FK, following migration 117's XOR
-- pattern). In-house model: SWMS authored once in swms_templates → auto-attached per job by
-- project_type → workers sign on (once per job, re-sign on version change). Additive + idempotent.

-- ── 1. Extend the shared SWMS library (additive) ──────────────────────────────────────────────
alter table public.swms_templates
  add column if not exists work_category text[] default '{}'::text[],  -- e.g. {first_fix_framing,cladding,roofing}; one SWMS can span stages
  add column if not exists hrcw_key text,        -- optional link to a whsRiskRules deriveOutputs SWMS key
  add column if not exists is_high_risk boolean not null default true,
  add column if not exists summary text,
  add column if not exists source text,          -- SafeWork SA / model Code reference the SWMS was drafted from
  add column if not exists review_status text not null default 'draft';
alter table public.swms_templates drop constraint if exists swms_templates_review_status_chk;
alter table public.swms_templates add constraint swms_templates_review_status_chk
  check (review_status in ('draft', 'reviewed'));
comment on column public.swms_templates.work_category is
  'Carpentry work stages this SWMS applies to (array); drives auto-attach from a job''s project_type. Empty = manual only. "general" = every carpentry job.';
comment on column public.swms_templates.review_status is
  'draft until a WHS professional signs it off; drafts render with a DRAFT — NOT FOR SITE USE banner.';

-- ── 2. project_swms → dual-FK (project OR carpentry_job), following migration 117 ──────────────
alter table public.project_swms
  add column if not exists carpentry_job_id uuid references public.carpentry_jobs(id) on delete cascade;
-- Relax the original NOT NULL so a carpentry-spine row is legal.
alter table public.project_swms alter column project_id drop not null;
-- Exactly one spine (mirrors workforce_allocations_job_spine_xor).
alter table public.project_swms drop constraint if exists project_swms_job_spine_xor;
alter table public.project_swms add constraint project_swms_job_spine_xor check (
  (project_id is not null and carpentry_job_id is null)
  or (project_id is null and carpentry_job_id is not null)
);
create index if not exists project_swms_project_idx   on public.project_swms (project_id)        where project_id is not null;
create index if not exists project_swms_carpentry_idx on public.project_swms (carpentry_job_id) where carpentry_job_id is not null;
-- Defensive: remove any pre-existing duplicate (project_id, swms_template_id) rows (mig 010 had no
-- unique constraint) so the unique index below can be created even on drifted data.
delete from public.project_swms a using public.project_swms b
  where a.ctid < b.ctid and a.project_id is not null
    and a.project_id = b.project_id and a.swms_template_id = b.swms_template_id;
-- Never attach the same SWMS twice to the same job.
create unique index if not exists project_swms_unique_project   on public.project_swms (project_id, swms_template_id)        where project_id is not null;
create unique index if not exists project_swms_unique_carpentry on public.project_swms (carpentry_job_id, swms_template_id) where carpentry_job_id is not null;

-- ── 3. whs_swms_signon — the worker acknowledgement record (the liability shield) ──────────────
create table if not exists public.whs_swms_signon (
  id uuid primary key default gen_random_uuid(),
  swms_template_id uuid not null references public.swms_templates(id),
  swms_version integer not null,
  project_id uuid references public.projects(id) on delete cascade,
  carpentry_job_id uuid references public.carpentry_jobs(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  signed_at timestamptz not null default now(),
  signature_data_url text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint whs_swms_signon_job_spine_xor check (
    (project_id is not null and carpentry_job_id is null)
    or (project_id is null and carpentry_job_id is not null)
  )
);
comment on table public.whs_swms_signon is
  'Per-worker SWMS acknowledgement: this employee signed this SWMS (this version) for this job. The defensible liability-shield record. New version → a new row (re-sign).';

-- One sign-on per worker, per SWMS version, per job. A new version → a new row (re-sign required).
create unique index if not exists whs_swms_signon_unique_carpentry
  on public.whs_swms_signon (swms_template_id, swms_version, employee_id, carpentry_job_id)
  where carpentry_job_id is not null;
create unique index if not exists whs_swms_signon_unique_project
  on public.whs_swms_signon (swms_template_id, swms_version, employee_id, project_id)
  where project_id is not null;
create index if not exists whs_swms_signon_carpentry_idx on public.whs_swms_signon (carpentry_job_id) where carpentry_job_id is not null;
create index if not exists whs_swms_signon_employee_idx  on public.whs_swms_signon (employee_id);

-- No browser access at all: signatures are sensitive, and every read/write goes through the server
-- (service role, which bypasses RLS). Enabling RLS with NO policy denies the anon/authenticated key.
alter table public.whs_swms_signon enable row level security;
drop policy if exists "whs_swms_signon_read" on public.whs_swms_signon;
