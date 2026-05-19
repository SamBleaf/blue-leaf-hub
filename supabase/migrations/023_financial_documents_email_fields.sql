-- Email inbox poller: track the email each document came from
ALTER TABLE financial_documents ADD COLUMN IF NOT EXISTS email_message_id  text;         -- RFC Message-ID for deduplication
ALTER TABLE financial_documents ADD COLUMN IF NOT EXISTS email_from         text;         -- sender address
ALTER TABLE financial_documents ADD COLUMN IF NOT EXISTS email_subject      text;         -- email subject line
ALTER TABLE financial_documents ADD COLUMN IF NOT EXISTS email_received_at  timestamptz;  -- when the email arrived

CREATE UNIQUE INDEX IF NOT EXISTS financial_documents_email_message_id_filename_idx
  ON financial_documents (email_message_id, original_filename)
  WHERE email_message_id IS NOT NULL;
