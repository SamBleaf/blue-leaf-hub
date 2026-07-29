-- 166_carpentry_whs_packs.sql
-- Phase B: the per-job site WHS pack. A pack composes the applicable control modules (from the Phase-A
-- register) into ONE 3-part document per carpentry job — Part 1 (HRCW SWMS, selected controls only),
-- Part 2 (task-control modules), Part 3 (site implementation record). The supervisor selects the
-- controls ACTUALLY used (never free text); a competent reviewer approves; the crew signs the version.

create table if not exists public.carpentry_whs_packs (
  id                uuid primary key default gen_random_uuid(),
  carpentry_job_id  uuid not null references public.carpentry_jobs(id) on delete cascade,
  version           integer not null default 1,
  review_status     text not null default 'draft',   -- draft | reviewed | issued
  -- Which modules apply to THIS job (from the questionnaire; pre-ticked from project_type).
  selected_hrcw     text[] default '{}',              -- e.g. {H-02,H-03,H-04,H-05}
  selected_task     text[] default '{}',              -- e.g. {T-01,T-03,T-04,T-14}
  -- Which control OPTIONS the supervisor ticked, per module: { "H-02": [1,3], ... } (indexes into the
  -- module's controlOptions). Only ticked lines appear in the composed pack — never the full option list.
  selected_controls jsonb  default '{}'::jsonb,
  -- Site-specific answers: HRCW "where on job", site conditions, parties/PC, plant & licences, permits,
  -- fall-system declaration, emergency/rescue, operating limits, responsible persons (Part 1.2–1.9 + Part 3).
  answers           jsonb  default '{}'::jsonb,
  -- Resolved PPE for the site (base + per-module + conditional: crane→hard hat, plant→hi-vis).
  ppe               jsonb  default '{}'::jsonb,
  -- Consultation-in-preparation + toolbox record (distinct from the crew sign-on).
  consultation      jsonb  default '{}'::jsonb,
  created_by        uuid,
  approved_by       uuid,
  approved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists carpentry_whs_packs_job_idx on public.carpentry_whs_packs (carpentry_job_id);
-- One current pack row per job (a revision bumps `version` in place; history is the sign-on + version col).
create unique index if not exists carpentry_whs_packs_job_unique on public.carpentry_whs_packs (carpentry_job_id);

-- Server-only (service role); no browser policy. Consistent with migrations 161/162/165.
alter table public.carpentry_whs_packs enable row level security;
