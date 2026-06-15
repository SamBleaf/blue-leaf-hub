-- ============================================================================
-- 091_procurement_template_seed.sql
-- Procurement Intelligence (BQ-10) — master template seed (runbook Part 4).
--
-- The "miss-nothing backbone": ~62 items across the build sequence. Generation
-- filters per-item by applies_to_build_types; the Buildxact estimate then refines
-- quantities/allowances.
--
-- Lead times are a DRAFT (Lead(wk) × 7). Long-lead (is_long_lead) and lead_time
-- columns are Sam-confirmable in Settings → Procurement once live (runbook Part 4
-- asks Sam to ✅/✏️ the LL flags + replace draft lead times with supplier reality).
--
-- Idempotent: seeds only when the template table is empty (re-runnable, no dupes).
-- Build types: new_build | knockdown_rebuild | extension | renovation. NULL = all.
-- supply_type: builder_supplied | subbie_supplied | client_supplied | pc_item.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.procurement_templates) THEN
    INSERT INTO public.procurement_templates
      (trade_category_id, item_name, default_unit, supply_type, default_lead_time_days,
       order_sequence, phase, selection_required, match_existing, is_long_lead, applies_to_build_types)
    SELECT tc.id, v.item_name, v.unit, v.supply, v.lead, v.seq, v.phase, v.sel, v.match, v.ll, v.builds
    FROM (VALUES
      -- ── Site establishment & early works ──
      ('Site Establishment','Temp fencing / hoarding','job','builder_supplied',0,1,'site_prep',false,false,false,NULL::text[]),
      ('Site Establishment','Site toilet / shed','job','builder_supplied',0,2,'site_prep',false,false,false,NULL::text[]),
      ('Site Establishment','Waste bins / skips','job','builder_supplied',0,3,'site_prep',false,false,false,NULL::text[]),
      ('Site Establishment','Temp power & water','job','subbie_supplied',7,4,'site_prep',false,false,false,NULL::text[]),
      ('Demolition / Civil','Demolition','job','subbie_supplied',7,5,'site_prep',false,false,false,'{knockdown_rebuild,renovation}'::text[]),
      ('Demolition / Civil','Strip-out (internal)','job','subbie_supplied',7,6,'site_prep',false,true,false,'{renovation,knockdown_rebuild}'::text[]),
      ('Demolition / Civil','Earthworks / excavation','job','subbie_supplied',7,7,'site_prep',false,false,false,'{new_build,knockdown_rebuild,extension}'::text[]),
      ('Demolition / Civil','Rock removal (allowance)','job','subbie_supplied',7,8,'site_prep',false,false,false,'{new_build,knockdown_rebuild,extension}'::text[]),
      -- ── Substructure ──
      ('Concrete & Footings','Ready-mix concrete','m3','builder_supplied',7,9,'substructure',false,false,false,'{new_build,knockdown_rebuild,extension}'::text[]),
      ('Concrete & Footings','Reo mesh & bar / starter bars','job','builder_supplied',7,10,'substructure',false,false,false,'{new_build,knockdown_rebuild,extension}'::text[]),
      ('Concrete & Footings','Waffle pods / formwork','job','builder_supplied',7,11,'substructure',false,false,false,'{new_build,knockdown_rebuild,extension}'::text[]),
      ('Concrete & Footings','Vapour barrier / sand fill','job','builder_supplied',7,12,'substructure',false,false,false,'{new_build,knockdown_rebuild,extension}'::text[]),
      ('Concrete & Footings','Piering / piling (allowance)','job','subbie_supplied',14,13,'substructure',false,false,false,'{new_build,knockdown_rebuild,extension}'::text[]),
      ('Termite Protection','Termite barrier system','job','subbie_supplied',7,14,'substructure',false,false,false,'{new_build,extension}'::text[]),
      -- ── Structure & frame ──
      ('Structural Steel','Beams / posts / lintels (fabricated)','job','builder_supplied',28,15,'frame',false,true,true,'{new_build,knockdown_rebuild,extension}'::text[]),
      ('Carpentry','Wall frames & roof trusses (fab to plan)','job','builder_supplied',28,16,'frame',false,false,true,'{new_build,knockdown_rebuild,extension}'::text[]),
      ('Carpentry','Framing timber / LVL / bearers','job','builder_supplied',7,17,'frame',false,false,false,NULL::text[]),
      ('Carpentry','Structural ply / bracing','job','builder_supplied',7,18,'frame',false,false,false,NULL::text[]),
      ('Carpentry','Fixing timber & fixings / hardware','job','builder_supplied',7,19,'frame',false,false,false,NULL::text[]),
      ('Stairs','Staircase (made to measure)','ea','subbie_supplied',35,20,'frame',true,false,true,NULL::text[]),
      -- ── Lock-up (roof, windows, external) ──
      ('Windows / Skylights','Windows & external glazed doors (made to order)','job','builder_supplied',42,21,'lock_up',true,true,true,NULL::text[]),
      ('Windows / Skylights','Skylights','ea','builder_supplied',35,22,'lock_up',true,false,true,NULL::text[]),
      ('Roof Plumber','Roof sheeting / tiles','job','builder_supplied',21,23,'lock_up',true,true,true,NULL::text[]),
      ('Roof Plumber','Gutters / fascia / downpipes / flashings','job','subbie_supplied',14,24,'lock_up',true,false,false,NULL::text[]),
      ('External Cladding','Cladding (FC / weatherboard / composite)','job','builder_supplied',21,25,'lock_up',true,true,false,NULL::text[]),
      ('External Cladding','Sarking / wrap / battens','job','builder_supplied',7,26,'lock_up',false,false,false,NULL::text[]),
      ('Masonry','Face bricks / blocks','job','builder_supplied',28,27,'lock_up',true,true,true,NULL::text[]),
      ('Masonry','Mortar / ties / lintels','job','builder_supplied',7,28,'lock_up',false,false,false,NULL::text[]),
      ('Garage Door','Garage door & motor (made to order)','ea','builder_supplied',35,29,'lock_up',true,false,true,NULL::text[]),
      -- ── Services rough-in ──
      ('Plumbing','Pipework / drainage / gas rough-in','job','subbie_supplied',7,30,'services',false,false,false,NULL::text[]),
      ('Plumbing','Hot water unit','ea','builder_supplied',14,31,'services',true,false,false,NULL::text[]),
      ('Electrical & Data','Switchboard / meter box / cabling rough-in','job','subbie_supplied',7,32,'services',false,false,false,NULL::text[]),
      ('Electrical & Data','GPOs / switches / smoke alarms','job','subbie_supplied',14,33,'services',true,false,false,NULL::text[]),
      ('Lighting & Automation','Light fittings','job','pc_item',28,34,'services',true,false,true,NULL::text[]),
      ('Lighting & Automation','Automation / smart system / fans','job','builder_supplied',21,35,'services',true,false,false,NULL::text[]),
      ('Heating & Cooling','HVAC / split / ducted system','job','subbie_supplied',28,36,'services',true,false,true,NULL::text[]),
      ('Solar & Batteries','Panels / inverter / battery','job','subbie_supplied',28,37,'services',true,false,true,NULL::text[]),
      -- ── Internal linings & fit-out ──
      ('Insulation','Wall / ceiling / acoustic batts','job','subbie_supplied',7,38,'fitout',false,false,false,NULL::text[]),
      ('Internal Linings','Plasterboard / villaboard / cornice','job','builder_supplied',7,39,'fitout',false,false,false,NULL::text[]),
      ('Plastering & Rendering','Render / texture coat','job','subbie_supplied',7,40,'fitout',true,true,false,NULL::text[]),
      ('Joinery','Kitchen cabinetry (made to order)','job','builder_supplied',42,41,'fitout',true,false,true,NULL::text[]),
      ('Joinery','Vanities / wardrobes / laundry','job','builder_supplied',35,42,'fitout',true,false,true,NULL::text[]),
      ('Joinery','Stone benchtops (templated)','job','subbie_supplied',28,43,'fitout',true,false,true,NULL::text[]),
      ('Joinery','Cabinet hardware / handles','job','builder_supplied',14,44,'fitout',true,false,false,NULL::text[]),
      ('Tiler','Floor & wall tiles','job','builder_supplied',28,45,'fitout',true,true,true,NULL::text[]),
      ('Tiler','Waterproofing / adhesive / grout / trims','job','builder_supplied',7,46,'fitout',false,false,false,NULL::text[]),
      ('Sanitary Ware','Toilets / basins / baths','job','builder_supplied',21,47,'fitout',true,false,false,NULL::text[]),
      ('Sanitary Ware','Tapware / mixers (often imported)','job','builder_supplied',35,48,'fitout',true,false,true,NULL::text[]),
      ('Sanitary Ware','Shower screens / mirrors','job','subbie_supplied',21,49,'fitout',true,false,false,NULL::text[]),
      ('Glazing','Splashbacks / balustrade glass (made to measure)','job','subbie_supplied',28,50,'fitout',true,false,true,NULL::text[]),
      ('Flooring','Timber / laminate / vinyl / carpet','job','builder_supplied',28,51,'fitout',true,true,true,NULL::text[]),
      ('Flooring','Underlay / leveller / trims','job','builder_supplied',7,52,'fitout',false,false,false,NULL::text[]),
      ('Door Hardware','Internal door handles / locks / hinges','job','builder_supplied',14,53,'fitout',true,false,false,NULL::text[]),
      ('Painting','Paint & prep materials','job','builder_supplied',7,54,'finishes',true,false,false,NULL::text[]),
      -- ── Finishes, PC items & external ──
      ('Appliances','Oven / cooktop / rangehood / dishwasher','job','pc_item',28,55,'finishes',true,false,true,NULL::text[]),
      ('Fixtures & Fittings','Towel rails / accessories / mirrors','job','builder_supplied',14,56,'finishes',true,false,false,NULL::text[]),
      ('Window Furnishings','Blinds / curtains / shutters (made to measure)','job','builder_supplied',28,57,'finishes',true,false,true,NULL::text[]),
      ('Paving','Pavers / base / edging','job','builder_supplied',14,58,'external',true,false,false,NULL::text[]),
      ('Landscaping','Plants / turf / irrigation / soil','job','subbie_supplied',7,59,'external',true,false,false,NULL::text[]),
      ('Fencing','Fence materials / gates','job','builder_supplied',14,60,'external',true,false,false,NULL::text[]),
      ('Pool Works','Pool shell / system','job','subbie_supplied',42,61,'external',true,false,true,NULL::text[]),
      ('Site Cleaner','Builders clean (final)','job','subbie_supplied',0,62,'finishes',false,false,false,NULL::text[])
    ) AS v(trade_name, item_name, unit, supply, lead, seq, phase, sel, match, ll, builds)
    LEFT JOIN public.trade_categories tc ON lower(tc.name) = lower(v.trade_name);
  END IF;
END $$;
