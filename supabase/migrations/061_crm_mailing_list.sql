-- Migration 061: CRM + Mailing List (MODULE 3)
-- CRM contacts, interaction history, mailing lists, email sends, attribution.
-- Australian Spam Act 2003 compliance enforced via schema constraints.

-- ─── CRM contacts ────────────────────────────────────────────────────────────

CREATE TABLE crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text,
  email text,
  phone text,
  contact_type text NOT NULL DEFAULT 'prospect'
    CHECK (contact_type IN ('prospect','referrer','past_client','architect','designer','developer','agent','supplier','other')),
  lead_source text,
  referred_by_contact_id uuid REFERENCES crm_contacts(id),
  project_type text,
  budget_range text CHECK (budget_range IN ('under_500k','500k_1m','1m_1.5m','1.5m_2m','over_2m')),
  suburb text,
  state text DEFAULT 'SA',
  interest_timeline text CHECK (interest_timeline IN ('now','6_months','1_year','2_years','just_researching')),

  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','active','future','client','past_client','lost')),

  next_action_type text CHECK (next_action_type IN ('call','email','meeting','dm','none','waiting')),
  next_action_due_date date,
  next_action_notes text,

  last_contact_date date,

  relationship_score integer DEFAULT 0 CHECK (relationship_score BETWEEN 0 AND 100),
  relationship_score_updated_at timestamptz,

  referral_count integer DEFAULT 0,
  referral_job_value numeric(12,2) DEFAULT 0,
  converted_lead_id uuid REFERENCES leads(id),
  converted_at timestamptz,
  linked_job_id uuid REFERENCES jobs(id),
  notes text,
  is_archived boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ─── CRM interactions ────────────────────────────────────────────────────────

CREATE TABLE crm_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id),
  interaction_type text NOT NULL
    CHECK (interaction_type IN ('call','email','sms','dm','meeting','site_visit','note','follow_up','content_sent','email_campaign')),
  direction text CHECK (direction IN ('inbound','outbound')),
  summary text NOT NULL,
  detail text,
  next_follow_up_date date,
  next_follow_up_notes text,
  email_send_id uuid,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- ─── Mailing lists ────────────────────────────────────────────────────────────

CREATE TABLE mailing_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  list_type text NOT NULL DEFAULT 'manual'
    CHECK (list_type IN ('manual','smart')),
  smart_filter jsonb,
  default_from_name text DEFAULT 'Blue Leaf Building',
  default_from_email text DEFAULT 'marketing@blueleafbuilding.com.au',
  total_members integer DEFAULT 0,
  active_members integer DEFAULT 0,
  is_archived boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ─── Mailing list members (Spam Act compliance) ───────────────────────────────

CREATE TABLE mailing_list_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES mailing_lists(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  consent_source text NOT NULL
    CHECK (consent_source IN ('website_form','in_person','phone','referral','past_client','event','manually_added')),
  consent_at timestamptz NOT NULL DEFAULT now(),
  consent_notes text,
  unsubscribed_at timestamptz,
  unsubscribe_reason text,
  unsubscribed_via text CHECK (unsubscribed_via IN ('link','manual','bounce','complaint')),
  emails_received integer DEFAULT 0,
  emails_opened integer DEFAULT 0,
  emails_clicked integer DEFAULT 0,
  last_email_at timestamptz,
  last_opened_at timestamptz,
  added_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(list_id, contact_id)
);

-- ─── Email sends ──────────────────────────────────────────────────────────────

CREATE TABLE email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  mailing_list_id uuid REFERENCES mailing_lists(id) ON DELETE SET NULL,
  subject text NOT NULL,
  preview_text text,
  from_name text NOT NULL DEFAULT 'Blue Leaf Building',
  from_email text NOT NULL DEFAULT 'marketing@blueleafbuilding.com.au',
  html_body text,
  content_item_id uuid REFERENCES marketing_content_items(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','sending','sent','failed','cancelled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  total_recipients integer DEFAULT 0,
  delivered_count integer DEFAULT 0,
  opened_count integer DEFAULT 0,
  clicked_count integer DEFAULT 0,
  bounced_count integer DEFAULT 0,
  complained_count integer DEFAULT 0,
  unsubscribed_count integer DEFAULT 0,
  resend_batch_id text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ─── Email send recipients ────────────────────────────────────────────────────

CREATE TABLE email_send_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_send_id uuid NOT NULL REFERENCES email_sends(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
  email_address text NOT NULL,
  resend_email_id text,
  status text DEFAULT 'pending'
    CHECK (status IN ('pending','delivered','opened','clicked','bounced','complained','unsubscribed')),
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounce_reason text,
  created_at timestamptz DEFAULT now()
);

-- ─── Email unsubscribes (Spam Act audit trail) ────────────────────────────────

CREATE TABLE email_unsubscribes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
  email_address text NOT NULL,
  list_id uuid REFERENCES mailing_lists(id) ON DELETE SET NULL,
  email_send_id uuid REFERENCES email_sends(id) ON DELETE SET NULL,
  unsubscribed_via text NOT NULL CHECK (unsubscribed_via IN ('link','manual','bounce','complaint')),
  resend_event_id text,
  unsubscribed_at timestamptz DEFAULT now()
);

-- ─── Alter existing tables ────────────────────────────────────────────────────

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS referred_by_contact_id uuid REFERENCES crm_contacts(id),
  ADD COLUMN IF NOT EXISTS first_replied_at timestamptz;

ALTER TABLE marketing_campaigns
  ADD COLUMN IF NOT EXISTS mailing_list_id uuid REFERENCES mailing_lists(id),
  ADD COLUMN IF NOT EXISTS send_status text DEFAULT 'not_an_email'
    CHECK (send_status IN ('not_an_email','draft','scheduled','sending','sent','failed')),
  ADD COLUMN IF NOT EXISTS scheduled_send_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_subject text,
  ADD COLUMN IF NOT EXISTS email_preview_text text,
  ADD COLUMN IF NOT EXISTS email_from_name text DEFAULT 'Blue Leaf Building';

ALTER TABLE crm_interactions
  ADD CONSTRAINT fk_crm_interactions_email_send
  FOREIGN KEY (email_send_id) REFERENCES email_sends(id) ON DELETE SET NULL;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE crm_contacts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_interactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mailing_lists         ENABLE ROW LEVEL SECURITY;
ALTER TABLE mailing_list_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sends           ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_send_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_unsubscribes    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users" ON crm_contacts          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON crm_interactions      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON mailing_lists         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON mailing_list_members  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON email_sends           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON email_send_recipients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON email_unsubscribes    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX idx_crm_contacts_status      ON crm_contacts(status);
CREATE INDEX idx_crm_contacts_type        ON crm_contacts(contact_type);
CREATE INDEX idx_crm_contacts_next_action ON crm_contacts(next_action_due_date) WHERE next_action_due_date IS NOT NULL;
CREATE INDEX idx_crm_contacts_score       ON crm_contacts(relationship_score DESC);
CREATE INDEX idx_crm_contacts_email       ON crm_contacts(email);
CREATE INDEX idx_crm_interactions_contact ON crm_interactions(contact_id);
CREATE INDEX idx_crm_interactions_lead    ON crm_interactions(lead_id);
CREATE INDEX idx_list_members_list        ON mailing_list_members(list_id);
CREATE INDEX idx_list_members_contact     ON mailing_list_members(contact_id);
CREATE INDEX idx_list_members_unsub       ON mailing_list_members(unsubscribed_at) WHERE unsubscribed_at IS NULL;
CREATE INDEX idx_email_sends_status       ON email_sends(status);
CREATE INDEX idx_email_recipients_send    ON email_send_recipients(email_send_id);
CREATE INDEX idx_email_recipients_contact ON email_send_recipients(contact_id);
CREATE INDEX idx_email_unsubs_email       ON email_unsubscribes(email_address);

-- ─── Seed default smart lists ─────────────────────────────────────────────────

INSERT INTO mailing_lists (name, description, list_type, smart_filter) VALUES
  ('Active Prospects',       'People currently in active conversation — new and active status contacts', 'smart', '{"status": ["new","active"]}'),
  ('Future Pipeline',        'Interested but timing not right — keep touching every 30 days', 'smart', '{"status": ["future"]}'),
  ('Referrers & Partners',   'Architects, designers, agents and referrers — touch every 4–6 weeks', 'smart', '{"contact_type": ["referrer","architect","designer","agent"]}'),
  ('Past Clients',           'Completed builds — raving fans program, 3-month and 12-month check-ins', 'smart', '{"status": ["past_client"]}'),
  ('Full Active Database',   'All opted-in active contacts — use only for infrequent high-value sends', 'smart', '{"is_archived": false}'),
  ('New This Month',         'Contacts added this calendar month — highest-attention window', 'smart', '{"created_this_month": true}');
