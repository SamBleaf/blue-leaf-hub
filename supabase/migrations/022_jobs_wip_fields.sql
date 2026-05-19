-- WIPAA fields on jobs: manual entry now, Xero will feed these later
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS contract_value      numeric(12,2);  -- total contract price with client
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS estimated_total_cost numeric(12,2); -- total budgeted cost to complete
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS progress_billed     numeric(12,2);  -- progress claims invoiced to client (manual until Xero)
