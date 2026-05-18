-- Finance Manager: document capture, matching, approval, Xero sync

CREATE TABLE financial_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,

  -- Source
  source text NOT NULL DEFAULT 'upload',        -- upload | email | photo
  original_filename text,
  dropbox_path text,                             -- current Dropbox location

  -- Claude-extracted fields
  supplier_name text,
  supplier_abn text,
  invoice_number text,
  invoice_date date,
  due_date date,
  amount_ex_gst numeric(12,2),
  gst_amount numeric(12,2),
  amount_total numeric(12,2),
  payment_terms text,
  extracted_address text,
  extracted_job_ref text,
  extracted_po_number text,
  description text,
  raw_extracted text,

  -- Matching result
  match_method text,          -- exact_job_ref | exact_po | exact_address | fuzzy_address | fuzzy_supplier | ai | manual
  match_confidence numeric(5,2),

  -- Status pipeline: unmatched → matched → pending_approval → approved → filed → xero_synced
  status text NOT NULL DEFAULT 'unmatched',

  -- Duplicate detection
  is_duplicate boolean DEFAULT false,
  duplicate_of uuid REFERENCES financial_documents(id),

  -- Xero
  xero_bill_id text,
  xero_synced_at timestamptz,

  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE financial_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES financial_documents(id) ON DELETE CASCADE NOT NULL,
  action text NOT NULL,   -- approved | rejected | rematched | auto_approved | filed
  actor_id uuid REFERENCES auth.users(id),
  comment text,
  previous_job_id uuid,
  new_job_id uuid,
  created_at timestamptz DEFAULT now()
);

-- Xero OAuth tokens (one row per connected tenant)
CREATE TABLE xero_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text UNIQUE NOT NULL,
  tenant_name text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_findocs_job ON financial_documents(job_id);
CREATE INDEX idx_findocs_status ON financial_documents(status);
CREATE INDEX idx_findocs_supplier ON financial_documents(supplier_name);
CREATE INDEX idx_findocs_invoice ON financial_documents(invoice_number, supplier_name);
CREATE INDEX idx_finapprove_doc ON financial_approvals(document_id);

ALTER TABLE financial_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE xero_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users" ON financial_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON financial_approvals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users" ON xero_credentials FOR ALL TO authenticated USING (true) WITH CHECK (true);
