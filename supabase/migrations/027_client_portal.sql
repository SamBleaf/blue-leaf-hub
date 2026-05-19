-- Client portal: token-based public access for project clients

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS portal_token        text UNIQUE,
  ADD COLUMN IF NOT EXISTS portal_enabled      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_client_name  text,
  ADD COLUMN IF NOT EXISTS portal_client_email text,
  ADD COLUMN IF NOT EXISTS contract_value      numeric(12,2),
  ADD COLUMN IF NOT EXISTS completion_date_est date;

CREATE TABLE IF NOT EXISTS portal_updates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  week_of      date NOT NULL,
  headline     text NOT NULL,
  body         text NOT NULL,
  author_name  text NOT NULL DEFAULT 'Sam',
  published    boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  update_id     uuid REFERENCES portal_updates(id) ON DELETE SET NULL,
  milestone_key text,
  caption       text,
  storage_path  text NOT NULL,
  public_url    text NOT NULL,
  taken_at      date,
  is_hero       boolean DEFAULT false,
  sort_order    integer DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal_milestones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key             text NOT NULL,
  label           text NOT NULL,
  description     text,
  what_comes_next text,
  achieved_at     date,
  eta             date,
  hero_photo_id   uuid REFERENCES project_photos(id) ON DELETE SET NULL,
  sort_order      integer DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(project_id, key)
);

CREATE TABLE IF NOT EXISTS portal_decisions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type             text NOT NULL CHECK (type IN ('selection','variation')),
  title            text NOT NULL,
  description      text,
  due_date         date,
  urgency          text DEFAULT 'normal' CHECK (urgency IN ('normal','urgent','overdue')),
  status           text DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','declined','info_requested')),
  cost_delta       numeric(10,2),
  schedule_delta   integer,
  options          jsonb DEFAULT '[]'::jsonb,
  chosen_option_id text,
  client_note      text,
  responded_at     timestamptz,
  created_at       timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal_claims (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_name  text NOT NULL,
  amount      numeric(12,2) NOT NULL,
  status      text DEFAULT 'upcoming'
              CHECK (status IN ('paid','invoiced','upcoming')),
  due_approx  text,
  paid_at     date,
  sort_order  integer DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal_allowances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category       text NOT NULL,
  allowance      numeric(10,2) NOT NULL,
  selected_total numeric(10,2),
  sort_order     integer DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_walks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  available_date date NOT NULL,
  booked         boolean DEFAULT false,
  client_name    text,
  confirmed      boolean DEFAULT false,
  notes          text,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warranty_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  area         text NOT NULL,
  description  text NOT NULL,
  urgency      text DEFAULT 'can_wait'
               CHECK (urgency IN ('can_wait','this_week','urgent')),
  photo_urls   jsonb DEFAULT '[]'::jsonb,
  status       text DEFAULT 'submitted'
               CHECK (status IN ('submitted','acknowledged','scheduled','resolved')),
  trade_booked date,
  resolved_at  date,
  client_note  text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sender       text NOT NULL CHECK (sender IN ('client','builder')),
  sender_name  text NOT NULL,
  body         text NOT NULL,
  read_at      timestamptz,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS home_finishes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  room         text NOT NULL,
  item         text NOT NULL,
  value        text,
  supplier     text,
  product_code text,
  sort_order   integer DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warranty_periods (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label        text NOT NULL,
  years        integer NOT NULL,
  start_date   date,
  expires_date date,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_updates_project
  ON portal_updates(project_id, week_of DESC);
CREATE INDEX IF NOT EXISTS idx_project_photos_project
  ON project_photos(project_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_decisions_project
  ON portal_decisions(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_milestones_project
  ON portal_milestones(project_id, sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_portal_messages_project
  ON portal_messages(project_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_warranty_items_project
  ON warranty_items(project_id, created_at DESC);

-- RLS: deny direct anon access; all portal data via Express service role
ALTER TABLE portal_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_walks ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranty_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_finishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranty_periods ENABLE ROW LEVEL SECURITY;
