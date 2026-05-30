-- 063_leads_website_fields.sql
-- Fixes the public /api/public/enquiry endpoint.
--
-- Problems:
-- 1. leads.first_name was NOT NULL — blocks inserts from the website form which
--    sends a single `name` field, not split first/last.
-- 2. leads.name column didn't exist — the enquiry handler inserts it.
-- 3. leads.project_description column didn't exist — referenced throughout Hub code.
--
-- Fix: make first_name nullable, add name + project_description columns,
-- backfill name from existing first_name + last_name rows.

-- Drop the NOT NULL constraint on first_name so website-sourced leads can insert
-- without a split name. The Hub CRM can populate first_name/last_name manually later.
ALTER TABLE leads
  ALTER COLUMN first_name DROP NOT NULL;

-- Add the two missing columns the enquiry handler references.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS name                text,          -- full name from website form
  ADD COLUMN IF NOT EXISTS project_description text;          -- free-text project brief from website form

-- Backfill name from first_name + last_name for existing CRM-entered rows.
UPDATE leads
  SET name = TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
  WHERE name IS NULL AND (first_name IS NOT NULL OR last_name IS NOT NULL);
