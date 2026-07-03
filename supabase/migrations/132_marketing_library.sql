-- ============================================================
-- Migration 132 — Marketing Asset Library
-- ============================================================
-- Adds: marketing_library table (Dropbox-indexed asset library)
--
-- Dropbox is the SOURCE OF TRUTH for all assets. Every row in this
-- table is an index entry that links to a live Dropbox file via
-- dropbox_path + dropbox_shared_link. Supabase is a processing
-- mirror only (supabase_mirror_path is nullable).
--
-- APB 7 library categories (folder names under
-- /BLUE LEAF BUILDING/MARKETING/LIBRARY/):
--   01 COMPLETED PROJECTS
--   02 TEAM & CULTURE
--   03 BRAND GUIDELINES
--   04 CLIENT TESTIMONIALS
--   05 BEHIND THE SCENES
--   06 REELS & SHORTS
--   07 PAST CAMPAIGN ADS
--
-- NOTE: Apply manually in the Supabase SQL editor (Dashboard →
-- SQL Editor → New query → paste → Run). Do NOT run via CLI
-- against production without staging review.
--
-- ROLLBACK (non-destructive — no existing data is touched):
--   DROP TABLE IF EXISTS marketing_library;
--   DROP INDEX IF EXISTS idx_marketing_library_category;
--   DROP INDEX IF EXISTS idx_marketing_library_project_id;
--   DROP INDEX IF EXISTS idx_marketing_library_evergreen;
--   DROP INDEX IF EXISTS idx_marketing_library_tags;
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_library (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Classification ────────────────────────────────────────────────────────
  -- One of the 7 APB categories (free-text; server validates against LIBRARY_CATEGORIES).
  category             text        NOT NULL,
  -- photo | video | doc | reel | testimonial | ad | other
  asset_type           text,

  -- ── Project link (nullable — some assets are company-wide, not job-specific) ──
  project_id           uuid        NULL REFERENCES jobs(id) ON DELETE SET NULL,

  -- ── File identity ─────────────────────────────────────────────────────────
  title                text,
  original_filename    text,

  -- ── Dropbox (source of truth) ─────────────────────────────────────────────
  dropbox_path         text,          -- e.g. /BLUE LEAF BUILDING/MARKETING/LIBRARY/01 COMPLETED PROJECTS/2026-06-01-stirling-reno.jpg
  dropbox_shared_link  text,          -- public "anyone with the link" URL returned by ensurePublicSharedLink()

  -- ── Supabase mirror (optional — used for thumbnails / video processing) ──
  supabase_mirror_path text NULL,     -- path in the marketing-media bucket

  -- ── Content facets ────────────────────────────────────────────────────────
  pillar               text,          -- how_we_build | what_to_expect | the_work | community_craft
  stage                text,          -- awareness | consideration | decision (maps to client pipeline stage)
  channel              text,          -- instagram | facebook | website | email | reel | ad

  -- ── Tags & flags ─────────────────────────────────────────────────────────
  tags                 text[]      NOT NULL DEFAULT '{}',
  evergreen            boolean     NOT NULL DEFAULT false,
  notes                text,

  -- ── Audit ─────────────────────────────────────────────────────────────────
  created_by           uuid        NULL,   -- auth.users.id — nullable for system/batch imports
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary facet filter (most common WHERE clause)
CREATE INDEX IF NOT EXISTS idx_marketing_library_category
  ON marketing_library (category);

-- Job/project drill-down
CREATE INDEX IF NOT EXISTS idx_marketing_library_project_id
  ON marketing_library (project_id)
  WHERE project_id IS NOT NULL;

-- Evergreen filter (small bitmap — partial index keeps it fast)
CREATE INDEX IF NOT EXISTS idx_marketing_library_evergreen
  ON marketing_library (evergreen)
  WHERE evergreen = true;

-- Full-text tag search via GIN (supports @>, &&, etc.)
CREATE INDEX IF NOT EXISTS idx_marketing_library_tags
  ON marketing_library USING GIN (tags);

-- Compound for list endpoint (ordered by recency within a category)
CREATE INDEX IF NOT EXISTS idx_marketing_library_category_created
  ON marketing_library (category, created_at DESC);
