-- Migration 040: Repair 033/038 dependency, seed trade_master_library, add email delivery tracking.
-- Safe to run even if 033 partially succeeded (CREATE TABLE IF NOT EXISTS throughout).
-- Fixes: trade_master_library missing seed, percentage_claimed overflow, email open tracking.

-- ── 1. Ensure trade_master_library exists (repair if 033 only partially ran) ────────────────────

CREATE TABLE IF NOT EXISTS trade_master_library (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id              TEXT NOT NULL UNIQUE,
  trade_name            TEXT NOT NULL,
  trade_category        TEXT NOT NULL DEFAULT 'general',
  subcategory           TEXT DEFAULT '',
  buildxact_category    TEXT DEFAULT '',
  buildxact_trade_key   TEXT DEFAULT '',
  -- Array of scope items: [{item, included, confirm, note}]
  -- Used as baseline by RFQ Engine — AI enriches, not replaces.
  default_rfq_template  JSONB DEFAULT '[]'::jsonb,
  default_attachments   JSONB DEFAULT '[]'::jsonb,
  default_trade_notes   TEXT DEFAULT '',
  is_active             BOOLEAN DEFAULT true,
  quote_required        BOOLEAN DEFAULT true,
  contractor_tags       JSONB DEFAULT '[]'::jsonb,
  priority              INTEGER DEFAULT 50,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trade_master_library_active_idx
  ON trade_master_library (is_active, quote_required);

CREATE INDEX IF NOT EXISTS trade_master_library_bx_key_idx
  ON trade_master_library (buildxact_trade_key)
  WHERE buildxact_trade_key IS NOT NULL AND buildxact_trade_key <> '';

-- ── 2. Add columns to rfq_trade_scopes if not already done by 033 ───────────────────────────────

ALTER TABLE rfq_trade_scopes
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS trade_master_id UUID REFERENCES trade_master_library(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_enrichment JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS estimate_line_refs JSONB DEFAULT '[]'::jsonb;

ALTER TABLE rfq_packages
  ADD COLUMN IF NOT EXISTS estimate_baseline JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS missing_trade_analysis JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS trade_coverage JSONB DEFAULT '{}'::jsonb;

-- ── 3. Add schedule_tasks.trade_master_id if not done by 038 ─────────────────────────────────────

ALTER TABLE schedule_tasks
  ADD COLUMN IF NOT EXISTS trade_master_id UUID REFERENCES trade_master_library(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_tasks_trade_master
  ON schedule_tasks (trade_master_id)
  WHERE trade_master_id IS NOT NULL;

-- ── 4. Fix percentage_claimed overflow: numeric(5,2) → numeric(8,2) ──────────────────────────────
-- numeric(5,2) max = 999.99 → overflows when claim amount >> contract value (e.g. during testing)

ALTER TABLE progress_claims
  ALTER COLUMN percentage_claimed TYPE NUMERIC(8,2);

-- ── 5. Add subcontractors.trade_category_id FK ───────────────────────────────────────────────────
-- Bridges the free-text subcontractors.trade field to canonical trade_categories.

ALTER TABLE subcontractors
  ADD COLUMN IF NOT EXISTS trade_category_id UUID REFERENCES trade_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subcontractors_trade_category
  ON subcontractors (trade_category_id)
  WHERE trade_category_id IS NOT NULL;

-- Best-effort backfill: map common free-text trade values to canonical trade_categories
UPDATE subcontractors s
SET trade_category_id = tc.id
FROM trade_categories tc
WHERE s.trade_category_id IS NULL
  AND (
    (LOWER(s.trade) LIKE '%concrete%' AND tc.name = 'Concrete & Footings') OR
    (LOWER(s.trade) LIKE '%footings%' AND tc.name = 'Concrete & Footings') OR
    (LOWER(s.trade) LIKE '%excavat%' AND tc.name = 'Demolition / Civil') OR
    (LOWER(s.trade) LIKE '%demolit%' AND tc.name = 'Demolition / Civil') OR
    (LOWER(s.trade) LIKE '%civil%' AND tc.name = 'Demolition / Civil') OR
    (LOWER(s.trade) LIKE '%carpent%' AND tc.name = 'Carpentry') OR
    (LOWER(s.trade) LIKE '%fram%' AND tc.name = 'Carpentry') OR
    (LOWER(s.trade) LIKE '%electr%' AND tc.name = 'Electrical & Data') OR
    (LOWER(s.trade) LIKE '%plumb%' AND tc.name = 'Plumbing') OR
    (LOWER(s.trade) LIKE '%roof%' AND tc.name = 'Roof Plumber') OR
    (LOWER(s.trade) LIKE '%tiling%' AND tc.name = 'Tiler') OR
    (LOWER(s.trade) LIKE '%tiler%' AND tc.name = 'Tiler') OR
    (LOWER(s.trade) LIKE '%paint%' AND tc.name = 'Painting') OR
    (LOWER(s.trade) LIKE '%joiner%' AND tc.name = 'Joinery') OR
    (LOWER(s.trade) LIKE '%cabinet%' AND tc.name = 'Joinery') OR
    (LOWER(s.trade) LIKE '%joinery%' AND tc.name = 'Joinery') OR
    (LOWER(s.trade) LIKE '%mason%' AND tc.name = 'Masonry') OR
    (LOWER(s.trade) LIKE '%brick%' AND tc.name = 'Masonry') OR
    (LOWER(s.trade) LIKE '%plaster%' AND tc.name = 'Plastering & Rendering') OR
    (LOWER(s.trade) LIKE '%render%' AND tc.name = 'Plastering & Rendering') OR
    (LOWER(s.trade) LIKE '%lining%' AND tc.name = 'Internal Linings') OR
    (LOWER(s.trade) LIKE '%plasterboard%' AND tc.name = 'Internal Linings') OR
    (LOWER(s.trade) LIKE '%insulat%' AND tc.name = 'Insulation') OR
    (LOWER(s.trade) LIKE '%floor%' AND tc.name = 'Flooring') OR
    (LOWER(s.trade) LIKE '%window%' AND tc.name = 'Windows / Skylights') OR
    (LOWER(s.trade) LIKE '%glazing%' AND tc.name = 'Glazing') OR
    (LOWER(s.trade) LIKE '%stair%' AND tc.name = 'Stairs') OR
    (LOWER(s.trade) LIKE '%scaffold%' AND tc.name = 'Hire Items') OR
    (LOWER(s.trade) LIKE '%landscap%' AND tc.name = 'Landscaping') OR
    (LOWER(s.trade) LIKE '%pav%' AND tc.name = 'Paving') OR
    (LOWER(s.trade) LIKE '%fenc%' AND tc.name = 'Fencing') OR
    (LOWER(s.trade) LIKE '%pool%' AND tc.name = 'Pool Works') OR
    (LOWER(s.trade) LIKE '%solar%' AND tc.name = 'Solar & Batteries') OR
    (LOWER(s.trade) LIKE '%heat%' AND tc.name = 'Heating & Cooling') OR
    (LOWER(s.trade) LIKE '%aircon%' AND tc.name = 'Heating & Cooling') OR
    (LOWER(s.trade) LIKE '%cool%' AND tc.name = 'Heating & Cooling') OR
    (LOWER(s.trade) LIKE '%hvac%' AND tc.name = 'Heating & Cooling') OR
    (LOWER(s.trade) LIKE '%garage%' AND tc.name = 'Garage Door') OR
    (LOWER(s.trade) LIKE '%steel%' AND tc.name = 'Structural Steel') OR
    (LOWER(s.trade) LIKE '%termite%' AND tc.name = 'Termite Protection') OR
    (LOWER(s.trade) LIKE '%clean%' AND tc.name = 'Site Cleaner')
  );

-- ── 6. Email delivery tracking table ─────────────────────────────────────────────────────────────
-- Enables Xero-style "email opened / viewed in portal" status on variations and claims.

CREATE TABLE IF NOT EXISTS email_delivery_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id      TEXT NOT NULL UNIQUE,          -- short random token embedded in pixel URL
  resource_type    TEXT NOT NULL                   -- 'variation' | 'claim' | 'rfq' | 'fee_proposal'
    CHECK (resource_type IN ('variation','claim','rfq','fee_proposal')),
  resource_id      UUID NOT NULL,
  job_id           UUID REFERENCES jobs(id) ON DELETE CASCADE,
  recipient_email  TEXT,
  subject          TEXT,
  sent_at          TIMESTAMPTZ,
  sent_by          UUID REFERENCES auth.users(id),
  -- Open tracking (pixel)
  first_opened_at  TIMESTAMPTZ,
  open_count       INTEGER DEFAULT 0,
  last_opened_ip   TEXT,
  last_opened_ua   TEXT,
  -- Portal view tracking (when client visits portal page)
  first_viewed_at  TIMESTAMPTZ,
  portal_view_count INTEGER DEFAULT 0,
  -- Outcome
  actioned_at      TIMESTAMPTZ,                   -- when client signed / paid / responded
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_events_resource  ON email_delivery_events(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_email_events_job        ON email_delivery_events(job_id);
CREATE INDEX IF NOT EXISTS idx_email_events_tracking   ON email_delivery_events(tracking_id);

ALTER TABLE email_delivery_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users" ON email_delivery_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 7. Job deduplication support ─────────────────────────────────────────────────────────────────
-- Normalised address stored separately to prevent duplicate job records on minor address edits.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS address_normalised TEXT,  -- lowercase, expanded abbreviations, trimmed
  ADD COLUMN IF NOT EXISTS address_suburb TEXT,
  ADD COLUMN IF NOT EXISTS address_state TEXT DEFAULT 'SA',
  ADD COLUMN IF NOT EXISTS address_postcode TEXT,
  ADD COLUMN IF NOT EXISTS is_duplicate_of UUID REFERENCES jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_address_normalised
  ON jobs (address_normalised)
  WHERE address_normalised IS NOT NULL;

-- Backfill normalised address for existing jobs (lowercase, strip trailing state/postcode)
UPDATE jobs
SET address_normalised = LOWER(TRIM(address))
WHERE address IS NOT NULL AND address_normalised IS NULL;

-- ── 8. Seed trade_master_library with all 37 Buildxact categories ────────────────────────────────
-- default_rfq_template: scope items the trade should confirm/include.
-- These form the BASELINE for RFQ emails — AI enriches from project documents, not replaces.
-- Format: [{item, confirm, note}] — confirm=true means it needs explicit written confirmation.

INSERT INTO trade_master_library (trade_id, trade_name, trade_category, buildxact_category, priority, default_rfq_template, default_trade_notes) VALUES

('preliminaries', 'Preliminaries', 'overhead', 'Preliminaries', 10, '[
  {"item":"Site establishment and setup","confirm":false},
  {"item":"Temporary fencing and hoardings","confirm":false},
  {"item":"Temporary amenities (toilets)","confirm":false},
  {"item":"Traffic control and signage","confirm":true,"note":"Confirm if traffic control is required given site access — include cost if yes"},
  {"item":"Builders all risk insurance","confirm":false},
  {"item":"Site induction administration","confirm":false},
  {"item":"Building permit levies (if applicable)","confirm":true}
]', 'Overhead trade covering site setup costs. Confirm any council-specific requirements.'),

('hire_items', 'Hire Items', 'plant', 'Hire Items', 20, '[
  {"item":"Scaffolding supply and erection","confirm":true,"note":"Confirm scaffold type required — full perimeter or lift-only. Include all lifts."},
  {"item":"Scaffold dismantling and removal","confirm":false},
  {"item":"Crane or concrete pump hire (if required)","confirm":true,"note":"Confirm if pump required for slab pour and any upper-floor concrete"},
  {"item":"Formwork hire (if applicable)","confirm":true},
  {"item":"Temporary power connection","confirm":false}
]', 'Confirm scaffold configuration matches architectural drawings. Include all lifts in quote.'),

('site_establishment', 'Site Establishment', 'overhead', 'Site Establishment', 15, '[
  {"item":"Site compound and storage","confirm":false},
  {"item":"Site signage and safety boards","confirm":false},
  {"item":"Driveway crossover protection","confirm":true,"note":"Confirm temporary crossover required and council requirements"},
  {"item":"Tree protection (if required by council)","confirm":true},
  {"item":"Site survey and set-out","confirm":true,"note":"Confirm whether set-out is included or by separate surveyor"}
]', ''),

('demolition_civil', 'Demolition / Civil', 'trade', 'Demolition / Civil', 30, '[
  {"item":"Demolition of existing structures","confirm":true,"note":"Confirm scope of demolition — full structure or partial. Include salvage items if applicable."},
  {"item":"Asbestos identification and removal (if applicable)","confirm":true,"note":"Asbestos survey must be completed before demolition. Confirm who supplies report."},
  {"item":"Earthworks and site cut to design levels","confirm":false},
  {"item":"Rock excavation (if encountered)","confirm":true,"note":"CRITICAL: Confirm if rock excavation is included or provisional sum. Geotech report should indicate risk."},
  {"item":"Topsoil strip and cart away","confirm":false},
  {"item":"Import fill and compaction (if required)","confirm":true},
  {"item":"Retaining walls (civil/structural) — specify height and run","confirm":true,"note":"Review drawings for all retaining requirements, including side boundaries"},
  {"item":"Stormwater diversion during construction","confirm":false}
]', 'Review geotechnical report before pricing. Rock and unexpected ground conditions are the most common budget overruns.'),

('concrete_footings', 'Concrete & Footings', 'trade', 'Concrete & Footings', 40, '[
  {"item":"Concrete supply (specify MPa)","confirm":true,"note":"Confirm concrete strength required per engineering. Typically 25–32MPa residential."},
  {"item":"Formwork supply and erection","confirm":false},
  {"item":"Steel reinforcing bar fixing","confirm":true,"note":"Confirm whether bar fixing is supply-and-fix or supply only. Separate from mesh."},
  {"item":"Steel reinforcing mesh supply and lay","confirm":false},
  {"item":"Strip footings to engineering","confirm":false},
  {"item":"Ground slab (specify thickness and finish)","confirm":true,"note":"Confirm slab thickness, finish (broom/power float), and any polished concrete areas"},
  {"item":"Suspended slab (if applicable) — area and structural system","confirm":true},
  {"item":"Off-form concrete retaining walls","confirm":true,"note":"CRITICAL: Review drawings for all off-form retaining. These are commonly overlooked. Confirm height, run, and footing detail."},
  {"item":"Concrete driveways and paths (if in scope)","confirm":true,"note":"Confirm if concrete external works are included or separate to landscaping/paving"},
  {"item":"Thickened edges and step downs","confirm":false},
  {"item":"Post holes and pad footings","confirm":true},
  {"item":"Waterproofing to wet area sub-floors (if applicable)","confirm":true}
]', 'Most common overrun trade. Rock, retaining walls, and suspended slabs are key risk items. Require engineering drawings.'),

('termite_protection', 'Termite Protection', 'trade', 'Termite Protection', 45, '[
  {"item":"Pre-construction chemical soil treatment","confirm":true,"note":"Confirm treatment area — under slab and around perimeter. Must meet AS3660."},
  {"item":"Physical termite barrier (where applicable)","confirm":true},
  {"item":"Inspection pipes (number and locations per engineering)","confirm":false},
  {"item":"Compliance certificate on completion","confirm":false},
  {"item":"Annual inspection allowance (if owner requested)","confirm":true}
]', 'Must comply with AS3660. Confirm treatment method with builder before pricing.'),

('structural_steel', 'Structural Steel', 'trade', 'Structural Steel', 50, '[
  {"item":"Steel supply (specify sections and grades)","confirm":true,"note":"Quote to structural engineering drawings. Provide steel schedule with quote."},
  {"item":"Fabrication (cut, weld, drill)","confirm":false},
  {"item":"Delivery and crane assist (if required)","confirm":true},
  {"item":"Erection and installation","confirm":false},
  {"item":"Connections and fixings to engineering","confirm":true,"note":"Confirm bolted vs welded connections and whether connection design is included"},
  {"item":"Priming and coating (specify paint system)","confirm":true,"note":"Confirm primer coat only or full paint system. If exposed steel, confirm finish specification."},
  {"item":"Lintels and beam pockets","confirm":false}
]', 'Require structural engineering drawings and steel schedule. Confirm connection design responsibility.'),

('carpentry', 'Carpentry', 'trade', 'Carpentry', 60, '[
  {"item":"Wall frame supply and erection","confirm":false},
  {"item":"Roof frame supply and erection (or truss installation)","confirm":true,"note":"Confirm whether trusses are prefab (supply by others) or stick-framed. Include crane assist if required."},
  {"item":"Engineered timber (LVL/GLT) supply and installation","confirm":true,"note":"Review structural drawings for all LVL beams and posts. These are commonly missed."},
  {"item":"Bracing and tie-down hardware","confirm":false},
  {"item":"Structural fixings to engineering spec","confirm":false},
  {"item":"Verandah and alfresco framing","confirm":true,"note":"Confirm alfresco and verandah frames are included — often excluded from standard frame quote"},
  {"item":"Fascia and bargeboard supply and fix","confirm":true},
  {"item":"Decking structure (if applicable)","confirm":true,"note":"Confirm if decking structure included or by landscaper"},
  {"item":"Structural sub-floor framing (if suspended floor)","confirm":true}
]', 'Require structural drawings and truss layout. Clarify LVL and engineered timber scope upfront.'),

('windows_skylights', 'Windows / Skylights', 'trade', 'Windows / Skylights', 70, '[
  {"item":"Window supply (specify system, glazing, finish)","confirm":true,"note":"Confirm aluminium system, glazing spec (double/triple/laminated), and colour. Thermal performance rating if required."},
  {"item":"Window installation","confirm":false},
  {"item":"Fly screens (all operable windows)","confirm":true,"note":"Confirm screens included. Many suppliers quote windows only."},
  {"item":"Sliding door supply and installation","confirm":false},
  {"item":"Stacking or bifold doors — confirm track and sill detail","confirm":true},
  {"item":"Skylights (type, size, fixed or operable)","confirm":true,"note":"Confirm skylight specification matches drawings. Operable skylights require flashing detail."},
  {"item":"Window flashing and integration with cladding","confirm":true,"note":"Confirm flashing responsibility — typically window supplier, but confirm with cladding contractor"},
  {"item":"Acoustic or bushfire glazing (if required by BAL rating)","confirm":true}
]', 'Confirm BAL rating requirements upfront — may require rated glazing. Confirm screen inclusion.'),

('external_cladding', 'External Cladding', 'trade', 'External Cladding', 80, '[
  {"item":"Cladding supply (specify product and colour)","confirm":true,"note":"Confirm product specification from drawings or spec. Ensure BAL rating compliance if applicable."},
  {"item":"Cladding installation","confirm":false},
  {"item":"Timber or steel battens (if required)","confirm":true},
  {"item":"Sarking or vapour barrier","confirm":true,"note":"Confirm sarking specification — some systems require specific products"},
  {"item":"Corner trims, reveals, and flashings","confirm":false},
  {"item":"Control joints (specify locations)","confirm":true},
  {"item":"Sealing and caulking","confirm":false}
]', 'Ensure product is BAL-rated if site is in bushfire zone. Confirm all flashings and junction details.'),

('roof_plumber', 'Roof Plumber', 'trade', 'Roof Plumber', 90, '[
  {"item":"Roof cladding supply and installation (specify product and colour)","confirm":true,"note":"Confirm roofing material, profile, colour, and manufacturer from drawings"},
  {"item":"Fascia and gutter supply and installation","confirm":false},
  {"item":"Downpipes (number and locations)","confirm":false},
  {"item":"Valley flashings and ridge capping","confirm":false},
  {"item":"Penetration flashings (skylights, flues, vents)","confirm":true,"note":"Confirm all penetrations — coordinate with plumber and electrician for vent locations"},
  {"item":"Box gutters (if applicable)","confirm":true,"note":"Box gutters require specific design detail and are higher maintenance. Confirm spec and overflow provision."},
  {"item":"Rainwater tank connection (if applicable)","confirm":true},
  {"item":"Solar panel penetration flashing (if solar in scope)","confirm":true},
  {"item":"Insulation installation under roof cladding","confirm":true,"note":"Confirm if foil or board insulation under roofing is in scope"}
]', 'Confirm all roof penetrations and flashings. Box gutters require engineering detail.'),

('masonry', 'Masonry', 'trade', 'Masonry', 100, '[
  {"item":"Brick supply (specify product, colour, and coursing)","confirm":true,"note":"Confirm brick selection, bond pattern, and mortar colour from spec or schedule"},
  {"item":"Brick laying","confirm":false},
  {"item":"Lintels over openings","confirm":true,"note":"Confirm lintel supply — typically by masonry contractor. Check all openings including garage."},
  {"item":"Wall ties and cavity battens","confirm":false},
  {"item":"Feature brickwork or soldier courses","confirm":true,"note":"Review drawings for any feature brickwork, corbelling, or special bond patterns — add time"},
  {"item":"Brick cleaning on completion","confirm":false},
  {"item":"Expansion joints (locations per engineer)","confirm":false}
]', 'Confirm brick selection and mortar colour before ordering. Feature work adds significant cost.'),

('electrical_data', 'Electrical & Data', 'trade', 'Electrical & Data', 110, '[
  {"item":"Rough-in wiring (power, lighting, circuits)","confirm":false},
  {"item":"Main switchboard supply and install","confirm":true,"note":"Confirm switchboard size and future allowance for solar/battery/EV charger"},
  {"item":"Data cabling (Cat6 to all rooms)","confirm":true,"note":"Confirm data outlet locations and whether patch panel is included"},
  {"item":"NBN connection and pit (if required)","confirm":true},
  {"item":"External power (outdoor areas, alfresco, garage)","confirm":true,"note":"Confirm all external power points and external lighting circuits"},
  {"item":"Exhaust fans to all wet areas","confirm":false},
  {"item":"EV charger conduit or point (if specified)","confirm":true},
  {"item":"Security system conduit (if pre-wire only)","confirm":true,"note":"Confirm whether security wiring is in scope or by separate security contractor"},
  {"item":"Underground conduit (if applicable)","confirm":true,"note":"Confirm underground cable runs to garages, outbuildings, pools"},
  {"item":"Temporary power during construction","confirm":false},
  {"item":"Electrical inspection and certificate","confirm":false}
]', 'Confirm switchboard future capacity for solar/battery. Confirm all external and underground conduit runs upfront.'),

('lighting_automation', 'Lighting & Automation', 'trade', 'Lighting & Automation', 115, '[
  {"item":"Light fittings supply and installation (per schedule)","confirm":true,"note":"Confirm light schedule — supplied by owner/builder or by electrician. Confirm install only vs supply and install."},
  {"item":"Smart switch system (specify brand and protocol)","confirm":true,"note":"Confirm home automation system if specified. Lutron, Clipsal C-Bus, or standard smart switches"},
  {"item":"Automated blind wiring (if applicable)","confirm":true},
  {"item":"Dimmer circuits and zones","confirm":true},
  {"item":"Outdoor and landscape lighting","confirm":true,"note":"Confirm scope boundary with landscaper for garden lighting"}
]', 'Confirm lighting schedule and automation system before pricing. Often specified late — allow for variation.'),

('plumbing', 'Plumbing', 'trade', 'Plumbing', 120, '[
  {"item":"Rough-in plumbing (water supply, drainage)","confirm":false},
  {"item":"Hot water system supply and installation","confirm":true,"note":"Confirm hot water system type — gas continuous flow, heat pump, or solar. Include connection only if owner-supplied."},
  {"item":"Gas rough-in and meter (if gas specified)","confirm":true,"note":"Confirm all gas appliances and confirm gas meter size with distributor"},
  {"item":"Bathroom, laundry, and kitchen rough-in","confirm":false},
  {"item":"Stormwater drainage and pits","confirm":true,"note":"Confirm stormwater connection point and whether pits are included or by civil"},
  {"item":"Sewer connection","confirm":true,"note":"Confirm sewer connection distance and whether road opening is required"},
  {"item":"Water meter and main connection","confirm":true},
  {"item":"External taps (hose cocks, garden irrigation stub-offs)","confirm":true,"note":"Confirm number and location of external taps and any irrigation stub-offs"},
  {"item":"Pool plumbing (if applicable)","confirm":true,"note":"Confirm if pool plumbing is in scope or by pool contractor"},
  {"item":"Heated towel rails (if specified)","confirm":true}
]', 'Confirm sewer and water connection distances — these vary widely by site. Gas appliances must be confirmed early.'),

('sanitary_ware', 'Sanitary Ware', 'trade', 'Sanitary Ware', 125, '[
  {"item":"Toilet suite supply and installation","confirm":true,"note":"Confirm supply responsibility — owner-supplied, builder-supplied, or by this contractor"},
  {"item":"Basin supply and installation","confirm":true},
  {"item":"Bath supply and installation (if specified)","confirm":true,"note":"Confirm bath specification — freestanding baths require specific waste and overflow"},
  {"item":"Shower screen or frameless screen supply and install","confirm":true,"note":"Confirm screen type and whether supply/install is by glazier or plumber"},
  {"item":"Tapware supply and installation (per schedule)","confirm":true,"note":"Confirm tapware schedule — specify brand and model"},
  {"item":"Laundry tub supply and installation","confirm":true},
  {"item":"Washing machine and dishwasher connections","confirm":false}
]', 'Confirm supply responsibility for all fixtures against owner-supplied schedule.'),

('stairs', 'Stairs', 'trade', 'Stairs', 130, '[
  {"item":"Stair structure (stringer, carriage) supply and installation","confirm":false},
  {"item":"Stair treads (specify material — timber, concrete, steel)","confirm":true,"note":"Confirm tread material and finish. Timber treads require separate flooring finish."},
  {"item":"Handrail supply and installation","confirm":false},
  {"item":"Balustrade supply and installation (specify type)","confirm":true,"note":"Confirm balustrade specification — glass, timber, steel. Glass balustrade by glazier or stair contractor?"},
  {"item":"NCC compliance check (rise and going dimensions)","confirm":false},
  {"item":"Newel posts and base details","confirm":false}
]', 'Confirm balustrade responsibility — often disputed between stair and glazing contractors.'),

('insulation', 'Insulation', 'trade', 'Insulation', 140, '[
  {"item":"Ceiling batt insulation (specify R-value)","confirm":true,"note":"Confirm R-value required per energy rating. Typically R4.0–R6.0 in SA."},
  {"item":"Wall batt insulation (specify R-value)","confirm":true,"note":"Confirm wall insulation type and R-value. External walls and internal where required."},
  {"item":"Underfloor insulation (if suspended floor)","confirm":true},
  {"item":"Bulk insulation to roof (if skillion or cathedral ceiling)","confirm":true,"note":"Confirm insulation method for raked ceilings — typically continuous board or spray foam"},
  {"item":"Acoustic insulation (bathrooms, media room)","confirm":true,"note":"Confirm acoustic insulation locations from drawings or spec"}
]', 'Confirm R-values per energy compliance report. Raked ceilings require different insulation approach.'),

('internal_linings', 'Internal Linings', 'trade', 'Internal Linings', 150, '[
  {"item":"Plasterboard supply (specify thickness and board type)","confirm":true,"note":"Confirm standard 10mm, 13mm, or fire-rated board requirements. Wet area board to wet areas."},
  {"item":"Plasterboard fix to walls and ceilings","confirm":false},
  {"item":"Set (joints, screws, cornices)","confirm":false},
  {"item":"Cornice supply and installation (specify profile)","confirm":true,"note":"Confirm cornice profile and whether bulkheads are included in scope"},
  {"item":"Bulkheads (joinery bulkheads, shower bulkheads)","confirm":true,"note":"Review drawings for all bulkhead locations. Often added late and costly."},
  {"item":"Ceiling heights — confirm any stepped or raked ceilings","confirm":true,"note":"Raked and stepped ceilings require additional boarding time. Confirm from drawings."},
  {"item":"Shadow line reveals (if specified)","confirm":true},
  {"item":"Access panels (manhole, plumbing access)","confirm":false}
]', 'Bulkheads and ceiling height changes are the most common variation triggers. Review drawings carefully.'),

('tiler', 'Tiler', 'trade', 'Tiler', 160, '[
  {"item":"Waterproofing to all wet areas (specify product)","confirm":true,"note":"Confirm waterproofing product and that it meets AS3740. Must be inspected before tiling."},
  {"item":"Floor tiles supply and lay (specify area)","confirm":true,"note":"Confirm if tiles are owner/builder-supplied or by tiler. Confirm tile size and layout pattern."},
  {"item":"Wall tiles supply and lay (specify area and height)","confirm":true,"note":"Confirm wall tile height in each room — full height or partial. Niche locations."},
  {"item":"Grout and adhesive (specify colour)","confirm":false},
  {"item":"Tile trim and edge profiles (confirm type)","confirm":true,"note":"Confirm whether tile trims are aluminium, chrome, or alternative. Owner selection may vary."},
  {"item":"Wet area shower niches (included in scope)","confirm":true,"note":"Confirm niche locations and tiling responsibility — often by tiler but sometimes missed"},
  {"item":"Alfresco or external tile (non-slip specification)","confirm":true,"note":"Confirm non-slip rating required for external tiles AS/NZS 4586"},
  {"item":"Tile to stairs (if specified)","confirm":true}
]', 'Waterproofing inspection must occur before tiling. Confirm tile supply responsibility and niche scope.'),

('joinery', 'Joinery', 'trade', 'Joinery', 170, '[
  {"item":"Kitchen cabinetry supply and install (per drawing or schedule)","confirm":true,"note":"Confirm cabinetry specification — profile, material, colour, hardware. Provide drawings."},
  {"item":"Bathroom and ensuite vanities (all bathrooms)","confirm":false},
  {"item":"Laundry cabinetry","confirm":true,"note":"Confirm laundry joinery scope — sometimes excluded from main joinery quote"},
  {"item":"Walk-in robe and built-in wardrobe cabinetry","confirm":true,"note":"Confirm wardrobe specification — melamine, painted, or custom"},
  {"item":"Overhead cabinetry and bulkhead integration","confirm":true},
  {"item":"Stone bench tops — supply and install (specify material)","confirm":true,"note":"Confirm stone specification, thickness, and edge profile. Stone supply is often excluded from joinery and priced separately."},
  {"item":"Splashback (stone, tile, glass)","confirm":true,"note":"Confirm splashback material and responsibility — sometimes by tiler or glazier"},
  {"item":"Cabinet hardware (handles, hinges, drawer runners)","confirm":true,"note":"Confirm handle specification — included or owner-supply"},
  {"item":"Soft-close hinges and drawer runners","confirm":false}
]', 'Stone benchtops are frequently excluded from joinery quotes. Confirm stone scope explicitly. Provide detailed drawings.'),

('painting', 'Painting', 'trade', 'Painting', 180, '[
  {"item":"Interior painting — walls and ceilings (specify coats)","confirm":true,"note":"Confirm number of coats — standard is 1 undercoat + 2 topcoat on new build"},
  {"item":"Interior doors and frames painting","confirm":true,"note":"Confirm if doors are primed by joiner or priming by painter"},
  {"item":"Skirting and architrave painting","confirm":false},
  {"item":"Exterior painting — all external surfaces","confirm":true,"note":"Confirm exterior paint system — confirm surface prep for texture coat or render"},
  {"item":"Feature wall colours (maximum included in standard rate)","confirm":true,"note":"Confirm allowance for feature wall colours. Additional colours may incur cost."},
  {"item":"Wet area ceiling paint (mould resistant)","confirm":false},
  {"item":"Garage floor coating (if specified)","confirm":true},
  {"item":"Deck or timber sealing (if applicable)","confirm":true,"note":"Confirm if timber deck sealing is in scope with painting or separate"},
  {"item":"Colour schedule provided by builder","confirm":false}
]', 'Require colour schedule before pricing. Confirm exterior paint system to match render/cladding.'),

('garage_door', 'Garage Door', 'trade', 'Garage Door', 185, '[
  {"item":"Garage door supply (specify type, size, colour, material)","confirm":true,"note":"Confirm door specification — panel lift, roller, sectional. Confirm colour from schedule."},
  {"item":"Garage door installation","confirm":false},
  {"item":"Motor supply and installation","confirm":true,"note":"Confirm motor brand and whether battery backup is included"},
  {"item":"Remote controls (specify number)","confirm":false},
  {"item":"Smart home integration (if specified)","confirm":true},
  {"item":"Electrical connection (by electrician or garage door contractor)","confirm":true,"note":"Confirm who provides power point to garage door motor — coordinate with electrician"}
]', 'Confirm motor and remote spec. Coordinate electrical supply point with electrician.'),

('plastering_rendering', 'Plastering & Rendering', 'trade', 'Plastering & Rendering', 190, '[
  {"item":"External cement render (specify texture and area)","confirm":true,"note":"Confirm render product, texture, and area from drawings. Confirm control joint locations."},
  {"item":"Internal plaster (if applicable — over brick or block)","confirm":true},
  {"item":"Bagging (if specified instead of render)","confirm":true},
  {"item":"Render to feature walls or columns","confirm":true,"note":"Review drawings for any decorative render elements"},
  {"item":"Sealing coat (confirm if included)","confirm":true,"note":"Confirm whether sealing coat is included or by painter"},
  {"item":"Control joints (locations and provision)","confirm":false}
]', 'Confirm control joint locations before rendering begins. Sealing coat responsibility must be clear.'),

('flooring', 'Flooring', 'trade', 'Flooring', 200, '[
  {"item":"Hybrid/LVP flooring supply and installation (specify product and area)","confirm":true,"note":"Confirm flooring product, colour, and area. Confirm if underlay is included."},
  {"item":"Carpet supply and installation (specify product and area)","confirm":true,"note":"Confirm carpet grade, colour, and area. Confirm underlay specification."},
  {"item":"Underlay supply and installation","confirm":true},
  {"item":"Timber flooring (engineered or solid — specify)","confirm":true,"note":"Confirm timber species, grade, and finish. Confirm subfloor preparation required."},
  {"item":"Floor preparation and levelling","confirm":true,"note":"Confirm subfloor condition and whether self-levelling compound is required — add if needed"},
  {"item":"Transitions and threshold strips","confirm":false},
  {"item":"Floor to stair nose (if timber stairs)","confirm":true}
]', 'Confirm subfloor preparation and levelling. Moisture testing required before floating floor install.'),

('window_furnishings', 'Window Furnishings', 'trade', 'Window Furnishings', 205, '[
  {"item":"Roller blinds supply and installation (per schedule)","confirm":true,"note":"Confirm blind specification — blockout, light filter, or sheer. Confirm all windows included."},
  {"item":"Curtains and tracks (if specified)","confirm":true},
  {"item":"External awnings or outdoor blinds","confirm":true,"note":"Confirm external blind specification and structural fixings"},
  {"item":"Plantation shutters (if specified)","confirm":true},
  {"item":"Automated blind wiring coordination with electrician","confirm":true,"note":"Confirm motorised blind wiring is coordinated with electrical contractor upfront"}
]', 'Confirm blind specification and automation requirement before pricing.'),

('appliances', 'Appliances', 'other', 'Appliances', 210, '[
  {"item":"Oven supply (specify brand and model)","confirm":true,"note":"Confirm appliance schedule — builder-supplied or owner-supplied"},
  {"item":"Cooktop supply (gas/induction — specify)","confirm":true},
  {"item":"Rangehood supply and installation","confirm":true,"note":"Confirm rangehood type — recirculating or ducted. If ducted, confirm duct path with plumber/builder."},
  {"item":"Dishwasher supply","confirm":true},
  {"item":"Refrigerator provision (plumbing stub-off if required)","confirm":true},
  {"item":"Clothes dryer provision (vent to outside if required)","confirm":true},
  {"item":"Installation of all appliances","confirm":true,"note":"Confirm whether installation is included or owner-responsible"}
]', 'Confirm full appliance schedule and supply responsibility. Duct path for rangehood must be coordinated.'),

('door_hardware', 'Door Hardware', 'other', 'Door Hardware', 215, '[
  {"item":"Entry door lockset supply and installation (specify grade)","confirm":true,"note":"Confirm entry hardware grade and brand from schedule"},
  {"item":"Internal door handles supply and installation (per schedule)","confirm":true,"note":"Confirm handle style and finish across all rooms"},
  {"item":"Bathroom and toilet privacy sets","confirm":false},
  {"item":"Sliding door hardware","confirm":true},
  {"item":"Deadbolts and security hardware","confirm":true,"note":"Confirm security hardware specification for all external doors"},
  {"item":"Door closers (if specified)","confirm":true},
  {"item":"Keying alike (specify number of master keys)","confirm":false}
]', 'Confirm handle schedule and keying requirements before ordering.'),

('fixtures_fittings', 'Fixtures & Fittings', 'other', 'Fixtures & Fittings', 220, '[
  {"item":"Mirrors supply and installation (all bathrooms)","confirm":true,"note":"Confirm mirror size and fixing method. Frameless mirrors require specific backing."},
  {"item":"Towel rails and rings supply and installation","confirm":false},
  {"item":"Toilet paper holders supply and installation","confirm":false},
  {"item":"Robe hooks supply and installation","confirm":false},
  {"item":"Shower shelving (chrome or tile-in)","confirm":true},
  {"item":"Kitchen accessories (bin, drawer inserts — if specified)","confirm":true,"note":"Confirm kitchen accessories from joinery schedule"},
  {"item":"Clothesline supply and installation","confirm":true}
]', 'Confirm full fixtures schedule. Supply may be by owner or builder.'),

('glazing', 'Glazing', 'trade', 'Glazing', 230, '[
  {"item":"Frameless shower screens supply and installation","confirm":true,"note":"Confirm shower screen type — pivot, sliding, or fixed panel. Confirm hinge and handle spec."},
  {"item":"Pool fence (glass) supply and installation","confirm":true,"note":"Confirm pool fence specification — frameless or semi-frameless. AS1926.1 compliance required."},
  {"item":"Glass balustrade (internal stair or deck)","confirm":true,"note":"Confirm balustrade specification and whether supply is by stair contractor or glazier"},
  {"item":"Splashback glass supply and installation","confirm":true,"note":"Confirm splashback glass size, colour, and whether painted glass is specified"},
  {"item":"Structural glazing (if applicable)","confirm":true},
  {"item":"Frosted or obscure glass panels","confirm":true}
]', 'Confirm pool fence compliance. Coordinate balustrade supply with stair contractor.'),

('solar_batteries', 'Solar & Batteries', 'trade', 'Solar & Batteries', 240, '[
  {"item":"Solar panel supply and installation (specify kW system)","confirm":true,"note":"Confirm system size, panel brand, and roof orientation/pitch suitability"},
  {"item":"Inverter supply and installation","confirm":false},
  {"item":"Battery storage system (if specified — specify kWh)","confirm":true,"note":"Confirm battery brand and capacity. SA rebate eligibility if applicable."},
  {"item":"Roof penetration flashings (coordinate with roof plumber)","confirm":true},
  {"item":"Electrical switchboard upgrade (if required)","confirm":true,"note":"Confirm if existing switchboard upgrade is required to accommodate solar"},
  {"item":"Grid connection application","confirm":false},
  {"item":"Monitoring system installation","confirm":false}
]', 'Confirm switchboard capacity before design. Coordinate roof penetrations with roof plumber.'),

('heating_cooling', 'Heating & Cooling', 'trade', 'Heating & Cooling', 250, '[
  {"item":"Ducted reverse-cycle air conditioning (supply and install)","confirm":true,"note":"Confirm system size (kW), number of zones, and outlet locations from drawings"},
  {"item":"Split system units (if specified — number and location)","confirm":true},
  {"item":"Ductwork supply and installation","confirm":false},
  {"item":"External condensing unit location","confirm":true,"note":"Confirm condenser location — must allow adequate clearance and not conflict with landscaping"},
  {"item":"Gas ducted heating (if specified)","confirm":true},
  {"item":"Thermostat and zone controller supply","confirm":false},
  {"item":"Hydronic heating (if specified)","confirm":true,"note":"Hydronic heating requires coordination with plumber for manifold and pipework"},
  {"item":"Smart home system integration","confirm":true}
]', 'Confirm system specification and zone layout before pricing. Condenser location must be agreed.'),

('landscaping', 'Landscaping', 'trade', 'Landscaping', 260, '[
  {"item":"Garden design (if included or by landscape architect)","confirm":true,"note":"Confirm whether landscape design is provided or included in quote"},
  {"item":"Topsoil supply and spread","confirm":false},
  {"item":"Plants supply and installation (per schedule)","confirm":true,"note":"Confirm plant schedule — if not provided, allow provisional sum"},
  {"item":"Lawn supply and lay (turf or hydroseed)","confirm":true,"note":"Confirm lawn species and area"},
  {"item":"Garden edging and borders","confirm":false},
  {"item":"Reticulation/irrigation system","confirm":true,"note":"Confirm irrigation system specification and controller type"},
  {"item":"Mulching to garden beds","confirm":false},
  {"item":"Tree planting (if large trees specified)","confirm":true,"note":"Confirm tree sizes and whether crane is required for planting"}
]', 'Require landscape plan before pricing. Confirm irrigation specification and lawn species.'),

('paving', 'Paving', 'trade', 'Paving', 270, '[
  {"item":"Driveway paving supply and lay (specify material and area)","confirm":true,"note":"Confirm paving material — concrete, exposed aggregate, brick, or stone. Confirm area."},
  {"item":"Pathway paving supply and lay","confirm":false},
  {"item":"Alfresco paving supply and lay","confirm":true,"note":"Confirm alfresco paving material and whether it matches or differs from driveway"},
  {"item":"Subbase preparation and compaction","confirm":false},
  {"item":"Kerb and edge restraints","confirm":false},
  {"item":"Sealing (if applicable)","confirm":true,"note":"Confirm if sealing is included or separate — particularly for exposed aggregate"},
  {"item":"Pool surrounds (if applicable)","confirm":true,"note":"Confirm non-slip finish requirement around pool AS/NZS 4586"}
]', 'Confirm material specification and sealing requirement. Non-slip specification required around pools.'),

('fencing', 'Fencing', 'trade', 'Fencing', 280, '[
  {"item":"Boundary fencing supply and installation (specify type and run)","confirm":true,"note":"Confirm fencing type — Colorbond, timber, or masonry. Confirm boundary lengths from site plan."},
  {"item":"Front fence or feature fence (if specified)","confirm":true,"note":"Confirm front fence specification — often requires council approval for height"},
  {"item":"Gates supply and installation (specify number and type)","confirm":true,"note":"Confirm gate dimensions, material, and latching/locking hardware"},
  {"item":"Pool fence (non-glass) supply and installation","confirm":true,"note":"Confirm pool fence compliance AS1926.1 — self-closing and self-latching gates required"},
  {"item":"Retaining fence integration (if fence on top of retaining wall)","confirm":true},
  {"item":"Repair or make-good to neighbouring fences","confirm":true,"note":"Confirm if existing fence reinstatement is required after construction"}
]', 'Confirm pool fence compliance. Check council height restrictions for front fence.'),

('pool_works', 'Pool Works', 'trade', 'Pool Works', 290, '[
  {"item":"Pool excavation","confirm":true,"note":"Confirm rock excavation risk from geotech report — major cost variable"},
  {"item":"Pool shell construction (specify type — concrete, fibreglass, vinyl)","confirm":true},
  {"item":"Pool coping supply and installation","confirm":true,"note":"Confirm coping material and detail — coordinate with paving contractor"},
  {"item":"Pool tiling or interior finish","confirm":true,"note":"Confirm pool interior finish — pebblecrete, glass tiles, or paint"},
  {"item":"Pool equipment (pump, filter, chlorinator)","confirm":false},
  {"item":"Pool heating (solar, heat pump, or gas)","confirm":true},
  {"item":"Pool fencing (coordinate with fencing contractor)","confirm":true},
  {"item":"Pool plumbing and electrical (coordinate with plumber and electrician)","confirm":true,"note":"Confirm scope boundary — pool contractor typically handles equipment plumbing, main contractor provides stub-offs"}
]', 'Rock excavation is the highest cost risk. Geotech report essential before pricing. Coordinate scope boundaries with plumber and electrician.'),

('site_cleaner', 'Site Cleaner', 'trade', 'Site Cleaner', 300, '[
  {"item":"Ongoing construction cleaning (specify frequency)","confirm":true,"note":"Confirm cleaning frequency during construction — weekly or as directed"},
  {"item":"Skip bin supply and removal","confirm":true,"note":"Confirm number of skip bins included and trade waste responsibility"},
  {"item":"Final builder''s clean","confirm":false},
  {"item":"Window cleaning (internal and external)","confirm":true,"note":"Confirm window cleaning is included in final clean — sometimes excluded"},
  {"item":"Removal of all builder''s rubbish from site","confirm":false}
]', 'Confirm window cleaning inclusion. Confirm trade waste skip arrangements with each trade.')

ON CONFLICT (trade_id) DO UPDATE SET
  trade_name           = EXCLUDED.trade_name,
  default_rfq_template = EXCLUDED.default_rfq_template,
  default_trade_notes  = EXCLUDED.default_trade_notes,
  updated_at           = NOW();

-- ── 9. Backfill trade_master_id on schedule_tasks (after seed) ───────────────────────────────────

UPDATE schedule_tasks st
SET trade_master_id = tml.id
FROM trade_master_library tml
WHERE LOWER(REPLACE(COALESCE(st.trade, ''), ' ', '_')) = LOWER(tml.trade_id)
  AND st.trade_master_id IS NULL
  AND st.trade IS NOT NULL;

-- ── 10. RLS for email_delivery_events already set above ──────────────────────────────────────────

COMMENT ON TABLE email_delivery_events IS
  'Tracks email open events (pixel) and portal view events per variation/claim/rfq.
   Enables Xero-style delivery status: Sent → Opened → Viewed in portal → Actioned.
   tracking_id is a short random token embedded in the tracking pixel URL.';

COMMENT ON TABLE trade_master_library IS
  'Canonical trade reference library with per-trade default RFQ scope templates.
   Used by RFQ Engine as baseline scope — AI extracts project-specific additions only.
   All 37 Buildxact master template trades seeded. Linked to trade_categories via trade_name.';
