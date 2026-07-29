-- 165_whs_module_registers.sql
-- Phase A of the carpentry WHS redesign: ingest the WHS consultant/agent's authoritative content as a
-- structured module + source spine. Extends swms_templates into full "control modules" (hierarchy-
-- ordered selectable control options + PPE rules + trigger + HRCW flag), and adds the WHS Source
-- Register + conflict log. Content is seeded separately (scripts/whs/seedWhsRegisters.mjs) and is ALL
-- DRAFT — nothing is usable on site until a competent WHS reviewer marks it reviewed. See
-- docs/whs/registers/ for the authoritative source documents.

-- ── 1. swms_templates → control modules ───────────────────────────────────────────────────────
alter table public.swms_templates
  add column if not exists module_code text,          -- H-01 … H-14, T-01 … T-14
  add column if not exists is_hrcw     text,          -- 'yes' | 'no' | 'boundary'  (yes/boundary → Part 1)
  add column if not exists part        smallint,       -- 1 = HRCW SWMS, 2 = task-control module
  add column if not exists activity    text,
  add column if not exists hazard      text,
  add column if not exists trigger     text,           -- objective condition that makes the module apply
  -- Structured, plain-english content (source of truth). content_html is rendered FROM this on save.
  --   { activity, hazard, controlOptions:[{level(1-6), text}], ppeRules:[{item, flag(R|C|S|NA), condition}],
  --     monitorReview, responsibleInstall, responsibleUse, sourceRefs:[text], note }
  add column if not exists content_json jsonb;

-- A carpentry module is identified by its code; one active copy per code.
create unique index if not exists swms_templates_module_code_idx
  on public.swms_templates (module_code) where module_code is not null;

comment on column public.swms_templates.content_json is
  'Structured control-module content (activity/hazard/hierarchy-ordered controlOptions/ppeRules/etc). content_html is derived from it. Authored by the WHS agent, DRAFT until a competent reviewer approves.';

-- ── 2. WHS Source Register (tiered, currency-checked) ─────────────────────────────────────────
create table if not exists public.whs_sources (
  id                   text primary key,               -- S-01 … S-44
  tier                 smallint,                        -- 1 legislation … 7 AI-derived
  title                text not null,
  issuing_authority    text,
  jurisdiction         text,
  publication_date     text,
  effective_date       text,
  version              text,
  status               text default 'current',          -- current | superseded | unverified
  activities_covered   text,
  hazards_covered      text,
  extracted_controls   text,
  notes                text,
  review_status        text default 'draft',             -- draft | reviewed
  approver             text,
  last_legal_review_date text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ── 3. WHS source conflict log (e.g. the 3m → >2m fall-threshold drift) ────────────────────────
create table if not exists public.whs_source_conflicts (
  id          text primary key,                          -- CF-01 …
  conflict    text not null,
  sources     text,
  dates       text,
  resolution  text,
  action      text,
  status      text default 'open',                       -- open | resolved
  created_at  timestamptz not null default now()
);

-- Server-only (service role); no browser policy. Consistent with migration 161/162.
alter table public.whs_sources           enable row level security;
alter table public.whs_source_conflicts  enable row level security;
