-- Lead type (standard | architect_tender), architect details, and pre-tender agreement fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_type               text    DEFAULT 'standard';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS architect_name           text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pretender_deposit_amount numeric(10,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pretender_signed_date    date;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pretender_notes          text;
