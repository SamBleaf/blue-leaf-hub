-- 198_consultant_comms.sql — Consultants→Won redesign · CV-3a (the consultant-comms spine)
-- Sam's locked decision: ALL client↔consultant communication runs through the Hub, logged and
-- threaded, as the single source of truth. Blue Leaf brokers every consultant: the client sits in
-- the portal, the consultants sit on email/Hub, and BL relays between them. This table is that
-- thread — one row per message, per consultant (identified by their roster role + optional CRM
-- contact), tagged by who authored it, how it travelled, and whether the client is allowed to see
-- it in the portal (the broker control). Later phases feed it: CV-3b provisions the pre-construction
-- portal, CV-3c surfaces client_visible messages to the client and auto-captures inbound replies.
-- Additive + idempotent. Apply manually in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.consultant_messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id               uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  consultant_role       text NOT NULL,                 -- roster role key: architect, engineer, ...
  consultant_contact_id uuid,                          -- crm_contacts.id (role may precede a named contact)
  participant           text NOT NULL DEFAULT 'blue_leaf'   -- who authored: client | blue_leaf | consultant
                          CHECK (participant IN ('client','blue_leaf','consultant')),
  channel               text NOT NULL DEFAULT 'note'        -- how it travelled: note | email | portal | phone
                          CHECK (channel IN ('note','email','portal','phone')),
  direction             text NOT NULL DEFAULT 'internal'    -- inbound | outbound | internal
                          CHECK (direction IN ('inbound','outbound','internal')),
  subject               text,
  body                  text NOT NULL,
  author_name           text,
  author_user_id        uuid,                          -- the BL staff member (when internal/outbound)
  client_visible        boolean NOT NULL DEFAULT false, -- broker control: does the client see it in the portal
  message_id            text,                          -- email Message-ID (for inbound matching in CV-3c)
  in_reply_to           text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consultant_messages_lead_idx      ON public.consultant_messages (lead_id);
CREATE INDEX IF NOT EXISTS consultant_messages_lead_role_idx ON public.consultant_messages (lead_id, consultant_role);
CREATE INDEX IF NOT EXISTS consultant_messages_visible_idx   ON public.consultant_messages (lead_id, client_visible);

-- RLS — mirror mig 196 (auth_users + RESTRICTIVE deny_clients). Ships staff-only; the portal read
-- path (CV-3c) uses the service-role key and filters client_visible itself, so a portal client's JWT
-- resolves to zero rows here. Passes scripts/rls-coverage-audit.sql.
ALTER TABLE public.consultant_messages ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='consultant_messages' AND policyname='auth_users') THEN
    CREATE POLICY "auth_users" ON public.consultant_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='consultant_messages' AND policyname='deny_clients') THEN
    CREATE POLICY deny_clients ON public.consultant_messages AS RESTRICTIVE FOR ALL TO authenticated
      USING (public.auth_is_staff()) WITH CHECK (public.auth_is_staff());
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
