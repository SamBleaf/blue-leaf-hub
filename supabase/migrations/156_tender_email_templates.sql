-- 156_tender_email_templates.sql
-- User-saved email presets for the tender "Email recipients" blast.
-- The five built-in templates (Updated plans / Reminder / Received / Won / Lost) live in code;
-- these are the custom ones Sam saves and edits from the compose modal. Org-wide (single-tenant Hub).
-- Bodies may contain {{first_name}} / {{name}} / {{business}} merge tokens — substituted per recipient
-- server-side at send time (see rfqPackageRoutes.mjs notify-recipients).

create table if not exists tender_email_templates (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  body        text not null,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_tender_email_templates_updated
  on tender_email_templates (updated_at desc);

-- Server uses the service role (RLS bypassed); no browser access. Endpoints are requireAuth-gated.
alter table tender_email_templates enable row level security;
