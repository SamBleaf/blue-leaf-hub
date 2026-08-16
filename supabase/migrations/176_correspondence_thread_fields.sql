-- 176_correspondence_thread_fields.sql — Sales OS Slice 1: email threading for the lead mailbox
-- To thread a lead's inbound replies to the right outbound message and show a Mail-app-style
-- conversation, correspondence needs the RFC headers. message_id already exists (migration 008);
-- this adds in_reply_to (links a reply to the message it answers) and the from/to addresses so the
-- mailbox can render who-said-what without re-parsing the raw email. Additive-only.

ALTER TABLE public.correspondence
  ADD COLUMN IF NOT EXISTS in_reply_to text,
  ADD COLUMN IF NOT EXISTS email_from  text,
  ADD COLUMN IF NOT EXISTS email_to    text;

-- Inbound matching walks In-Reply-To -> a prior row's message_id; index message_id for that lookup.
CREATE INDEX IF NOT EXISTS correspondence_message_id_idx
  ON public.correspondence (message_id)
  WHERE message_id IS NOT NULL;

-- DOWN (manual):
--   DROP INDEX IF EXISTS correspondence_message_id_idx;
--   ALTER TABLE public.correspondence
--     DROP COLUMN IF EXISTS in_reply_to, DROP COLUMN IF EXISTS email_from, DROP COLUMN IF EXISTS email_to;
