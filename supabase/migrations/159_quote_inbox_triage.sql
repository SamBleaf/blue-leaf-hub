-- 159_quote_inbox_triage.sql
-- Quote Inbox triage: distinguish HOW an unmatched quote email was cleared, so the inbox can show
-- Pending / Matched / Dismissed tabs and hold a dismiss reason. Additive to migration 003's table.
--   resolution: NULL while pending; 'matched' (tied to an RFQ), 'dismissed' (not a quote), 'invoice'
--   (rerouted to Finance). dismiss_reason: free text when dismissed. resolved_by: staff email/id.

alter table public.unmatched_quote_emails
  add column if not exists resolution     text,
  add column if not exists dismiss_reason  text,
  add column if not exists resolved_by     text;

comment on column public.unmatched_quote_emails.resolution is
  'How the row was cleared: matched | dismissed | invoice. NULL while pending. Powers the Quote Inbox tabs.';

-- Index the resolved lane so the Matched/Dismissed tabs page quickly.
create index if not exists unmatched_quote_emails_resolution_idx
  on public.unmatched_quote_emails (resolution, resolved_at desc)
  where resolved_at is not null;
