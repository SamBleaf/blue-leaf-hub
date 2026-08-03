-- 169_whs_control_templates.sql
-- The "Blue Leaf standard controls" house template (WHS pack builder, §1→§2 model correction).
--
-- The template is a saved set of CONFIRMED control picks per module. On a new job it pre-fills those
-- controls as SUGGESTIONS (not ticks) for the modules the questionnaire scoped in. A suggestion asserts
-- nothing — only the supervisor's on-site tap confirms a control is in place. So this table stores the
-- library-of-standard-choices, never an assertion about any site.
--
-- One row per scope (currently just 'carpentry'). Server-only (service role); no browser writes.

create table if not exists whs_control_templates (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null default 'carpentry',
  name        text not null default 'Blue Leaf standard controls',
  controls    jsonb not null default '{}'::jsonb,   -- { module_code: [control text, ...] }  (CONFIRMED standard picks)
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (scope)
);

comment on table whs_control_templates is
  'House "Blue Leaf standard controls" per scope. controls = {module_code:[control text]} — a library of standard control CHOICES, pre-filled on new jobs as SUGGESTIONS (never ticks). Not a site assertion.';

alter table whs_control_templates enable row level security;
-- No browser policy: all reads/writes go through the server (service role bypasses RLS), matching
-- carpentry_whs_packs. The browser never touches this table directly.
