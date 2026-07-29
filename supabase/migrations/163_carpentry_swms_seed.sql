-- 163_carpentry_swms_seed.sql
-- Seed the carpentry SWMS library (shared swms_templates). DRAFT content drafted from SafeWork SA +
-- Safe Work Australia model Codes of Practice + AS standards — NOT legal advice; every SWMS is
-- review_status='draft' and MUST be reviewed by a WHS professional before a site relies on it.
-- Idempotent: each SWMS inserts only if a Carpentry SWMS of that title does not already exist.
-- Apply AFTER migration 162.

-- 1. Working at Heights (>2 m)
insert into public.swms_templates (trade, title, version, work_category, is_high_risk, summary, source, review_status, is_active, content_html)
select 'Carpentry', 'Working at Heights (>2 m)', 1,
  ARRAY['first_fix_framing','cladding','roofing']::text[], true,
  'Fall prevention for any work more than 2 m above a lower level (edges, voids, platforms, ladders).',
  'SafeWork SA HRCW; Model CoP: Managing the Risk of Falls at Workplaces; WHS Reg 2012 (SA)', 'draft', true,
  '<h3>Activity</h3><p>Any carpentry task performed more than 2 m above a lower level — frame top plates, upper-floor edges, cladding at height, roof access, working over voids or stairwells. In SA a SWMS is required for falls of more than 2 m (from 1 July 2026).</p>'
  '<h3>Key hazards</h3><ul><li>Fall from an edge, platform, ladder or opening</li><li>Fall through a void, penetration or fragile surface</li><li>Objects falling onto people below</li><li>Unstable or incomplete work platforms</li></ul>'
  '<h3>Controls (in order — highest first)</h3><ol><li><b>Eliminate:</b> do the work at ground level where possible (pre-assemble frames/trusses on the ground).</li><li><b>Engineering:</b> guardrails / edge protection, a properly erected scaffold or working platform, an EWP, void and penetration covers fixed and labelled, catch platforms.</li><li><b>Administrative:</b> exclusion zone below, this SWMS signed on by every worker, competent workers only, stop work in high wind or wet conditions, secure ladders (3 points of contact, tie off).</li><li><b>PPE (last resort):</b> a fall-arrest harness on a rated anchor — only where higher controls are not practicable, and only with a documented rescue plan (suspension trauma is minutes-critical).</li></ol>'
  '<h3>PPE</h3><p>Hi-vis, safety boots, hard hat where there is overhead risk; harness + lanyard where fall-arrest is the control.</p>'
  '<h3>Residual risk</h3><p>Medium with controls applied. Do not proceed if edge protection or a compliant platform cannot be provided.</p>'
where not exists (select 1 from public.swms_templates where trade='Carpentry' and title='Working at Heights (>2 m)');

-- 2. Roof Work
insert into public.swms_templates (trade, title, version, work_category, is_high_risk, summary, source, review_status, is_active, content_html)
select 'Carpentry', 'Roof Work', 1,
  ARRAY['roofing']::text[], true,
  'Work on or accessing a roof — falls from edge, falls through fragile/brittle roofing, skylights.',
  'SafeWork SA HRCW; Model CoP: Managing the Risk of Falls; AS/NZS 4994 (temporary edge protection)', 'draft', true,
  '<h3>Activity</h3><p>Setting out, fixing or accessing roof structure, battens, sarking or sheeting; work near roof edges, penetrations and skylights.</p>'
  '<h3>Key hazards</h3><ul><li>Fall from the roof edge</li><li>Fall through fragile/brittle sheeting or an unguarded skylight/penetration</li><li>Falling tools or materials</li><li>Heat/UV; contact with powerlines near the roofline</li></ul>'
  '<h3>Controls (in order)</h3><ol><li>Perimeter edge protection (guardrail) or a roof safety mesh installed before roof work begins.</li><li>Cover, guard and clearly flag all skylights, penetrations and fragile areas; never step on fragile material.</li><li>Roof anchor + harness with a rescue plan only where edge protection is not reasonably practicable.</li><li>Secure ladder or scaffold access; exclusion zone below; no roof work in wet or windy conditions.</li></ol>'
  '<h3>PPE</h3><p>Non-slip boots, harness/lanyard where used, hard hat, sun protection.</p>'
  '<h3>Residual risk</h3><p>Medium–high without edge protection — do not access the roof until fall protection is in place.</p>'
where not exists (select 1 from public.swms_templates where trade='Carpentry' and title='Roof Work');

-- 3. Frame Erection / Temporary Bracing / Truss Handling
insert into public.swms_templates (trade, title, version, work_category, is_high_risk, summary, source, review_status, is_active, content_html)
select 'Carpentry', 'Frame Erection, Temporary Bracing & Truss Handling', 1,
  ARRAY['first_fix_framing']::text[], true,
  'Erecting wall frames and roof trusses safely — preventing frame collapse and truss instability.',
  'AS 1684 Residential Timber-Framed Construction; AS 4440 (truss installation); Model CoP: Construction Work', 'draft', true,
  '<h3>Activity</h3><p>Standing wall frames, installing and bracing roof trusses/girders, fixing top plates and temporary bracing.</p>'
  '<h3>Key hazards</h3><ul><li>Wall frame or truss collapse before permanent bracing</li><li>Truss instability / "domino" collapse during erection</li><li>Manual handling of frames and trusses</li><li>Working at height on top plates</li></ul>'
  '<h3>Controls (in order)</h3><ol><li>Erect and brace strictly to the manufacturer/AS 1684 / AS 4440 sequence; install temporary bracing before releasing any load.</li><li>Brace the first (girder) truss securely before installing the next; maintain continuous temporary bracing.</li><li>Never climb or load an unbraced frame or truss.</li><li>Use mechanical lifting for heavy/long trusses; keep an exclusion zone under any lift; a competent leading hand supervises the sequence.</li></ol>'
  '<h3>PPE</h3><p>Gloves, boots, hi-vis, hard hat.</p>'
  '<h3>Residual risk</h3><p>Medium with sequence and bracing controls; collapse risk is high if bracing is skipped.</p>'
where not exists (select 1 from public.swms_templates where trade='Carpentry' and title='Frame Erection, Temporary Bracing & Truss Handling');

-- 4. Temporary Propping / Load-bearing Demolition
insert into public.swms_templates (trade, title, version, work_category, is_high_risk, summary, source, review_status, is_active, content_html)
select 'Carpentry', 'Temporary Propping & Load-bearing Demolition', 1,
  ARRAY['demolition','first_fix_framing']::text[], true,
  'Removing or altering load-bearing structure with temporary support — collapse and services risk.',
  'SafeWork SA HRCW (structural alterations/demolition); Model CoP: Demolition Work; asbestos regs', 'draft', true,
  '<h3>Activity</h3><p>Removing or altering load-bearing walls, beams or roof structure during renovations, with temporary propping/needling.</p>'
  '<h3>Key hazards</h3><ul><li>Uncontrolled collapse of structure, roof or wall when a load-bearing element is removed</li><li>Falling debris</li><li>Hidden services and asbestos (pre-1990/pre-2004 buildings), live electrical</li></ul>'
  '<h3>Controls (in order)</h3><ol><li>An engineer or competent person confirms the propping/needling design and load path BEFORE any load-bearing member is disturbed.</li><li>Install temporary props/needles rated for the load; do not overload.</li><li>Check for asbestos and services first — if asbestos is present, stop and engage a licensed removalist (separate SWMS); isolate electrical.</li><li>Sequence top-down; maintain an exclusion zone; STOP and reassess if the structure behaves unexpectedly.</li></ol>'
  '<h3>PPE</h3><p>Hard hat, boots, gloves, eye protection, P2 respirator where cutting/dust.</p>'
  '<h3>Residual risk</h3><p>High if propping is not engineer-confirmed — this task must not proceed on assumption.</p>'
where not exists (select 1 from public.swms_templates where trade='Carpentry' and title='Temporary Propping & Load-bearing Demolition');

-- 5. Power Tools — Silica (fibre-cement) & Timber Dust
insert into public.swms_templates (trade, title, version, work_category, is_high_risk, summary, source, review_status, is_active, content_html)
select 'Carpentry', 'Power Tools — Silica (Fibre-Cement) & Timber Dust', 1,
  ARRAY['cladding','first_fix_framing','second_fix']::text[], true,
  'Cutting/grinding fibre-cement (respirable crystalline silica) and timber/MDF dust (carcinogenic).',
  'SafeWork SA silica requirements; Model CoP: Managing Risks of RCS; Hazardous Chemicals; AS/NZS 1715/1716 (RPE)', 'draft', true,
  '<h3>Activity</h3><p>Cutting, grinding or drilling fibre-cement sheet, timber, MDF or similar with power tools.</p>'
  '<h3>Key hazards</h3><ul><li>Respirable crystalline silica (RCS) from dry-cutting fibre-cement — irreversible lung disease</li><li>Hardwood/MDF dust (a listed carcinogen)</li><li>Noise; flying debris; cuts</li></ul>'
  '<h3>Controls (in order)</h3><ol><li><b>Eliminate dry cutting:</b> use score-and-snap, a guillotine, or wet-cutting / on-tool H-class dust extraction (SafeWork SA silica requirements).</li><li>Work outdoors or in a well-ventilated area, positioned so dust blows away from people.</li><li>P2 respirator as a minimum (fit-tested where exposure is high); health monitoring where an RCS exposure standard may be exceeded.</li><li>Clean up with an H-class vacuum — never dry-sweep or use compressed air; keep tool guards fitted.</li></ol>'
  '<h3>PPE</h3><p>P2 respirator, eye protection, hearing protection, gloves.</p>'
  '<h3>Residual risk</h3><p>Low–medium when dust is controlled at source; high with dry, uncontrolled cutting.</p>'
where not exists (select 1 from public.swms_templates where trade='Carpentry' and title='Power Tools — Silica (Fibre-Cement) & Timber Dust');

-- 6. Nail Guns / Powder-actuated Tools
insert into public.swms_templates (trade, title, version, work_category, is_high_risk, summary, source, review_status, is_active, content_html)
select 'Carpentry', 'Nail Guns & Powder-actuated Tools', 1,
  ARRAY['first_fix_framing','cladding','second_fix']::text[], true,
  'Preventing penetrating injuries from nail guns and powder-actuated fastening tools.',
  'Model CoP: Construction Work; SafeWork Australia nail gun guidance; manufacturer instructions', 'draft', true,
  '<h3>Activity</h3><p>Fixing framing, cladding, flooring and trim with pneumatic/battery nail guns or powder-actuated tools.</p>'
  '<h3>Key hazards</h3><ul><li>Penetrating injury to self or others from unintended discharge or ricochet</li><li>Recoil / double-fire</li><li>Noise</li></ul>'
  '<h3>Controls (in order)</h3><ol><li>Use sequential-trip trigger tools where practicable; do not bump-fire near other people.</li><li>Never point the tool at yourself or others; keep your free hand clear of the firing line.</li><li>Disconnect air / remove the battery before clearing a jam, adjusting, or setting the tool down.</li><li>Competent, instructed operators only; powder-actuated tools require a trained/licensed operator.</li></ol>'
  '<h3>PPE</h3><p>Eye protection (mandatory), hearing protection, gloves.</p>'
  '<h3>Residual risk</h3><p>Low with sequential triggers and safe handling; serious if pointed or bump-fired near others.</p>'
where not exists (select 1 from public.swms_templates where trade='Carpentry' and title='Nail Guns & Powder-actuated Tools');

-- 7. Manual Handling
insert into public.swms_templates (trade, title, version, work_category, is_high_risk, summary, source, review_status, is_active, content_html)
select 'Carpentry', 'Manual Handling', 1,
  ARRAY['general']::text[], false,
  'Preventing musculoskeletal injury from lifting sheets, timber packs and awkward/repetitive work.',
  'Model CoP: Hazardous Manual Tasks; SafeWork SA manual handling guidance', 'draft', true,
  '<h3>Activity</h3><p>Lifting, carrying and positioning timber, sheet materials, frames and packs across the job.</p>'
  '<h3>Key hazards</h3><ul><li>Back and musculoskeletal injury from heavy, awkward or repetitive lifting</li><li>Sustained or awkward postures</li></ul>'
  '<h3>Controls (in order)</h3><ol><li>Use mechanical aids — trolleys, panel lifts, a crane/hiab — for heavy or awkward loads.</li><li>Team-lift and break loads down; store materials at working height to avoid bending.</li><li>Good technique (close to body, legs not back); rotate tasks to limit repetition; keep access clear.</li></ol>'
  '<h3>PPE</h3><p>Gloves, boots.</p>'
  '<h3>Residual risk</h3><p>Low–medium with aids and technique.</p>'
where not exists (select 1 from public.swms_templates where trade='Carpentry' and title='Manual Handling');

-- 8. Electrical Leads / Test-and-Tag & Overhead Powerlines
insert into public.swms_templates (trade, title, version, work_category, is_high_risk, summary, source, review_status, is_active, content_html)
select 'Carpentry', 'Electrical Leads, Test-and-Tag & Overhead Powerlines', 1,
  ARRAY['general']::text[], false,
  'Preventing electric shock from portable tools/leads and contact with overhead powerlines.',
  'AS/NZS 3760 (in-service testing); SafeWork SA overhead powerline guidance; WHS Reg 2012 (SA)', 'draft', true,
  '<h3>Activity</h3><p>Using portable power tools and extension leads on site; working near overhead powerlines.</p>'
  '<h3>Key hazards</h3><ul><li>Electric shock from a damaged lead or tool</li><li>Contact with overhead powerlines (frames, ladders, materials, EWPs)</li><li>Wet conditions increasing shock risk</li></ul>'
  '<h3>Controls (in order)</h3><ol><li>All leads and portable tools tested-and-tagged (AS/NZS 3760) and protected by an RCD; inspect leads before each use and remove damaged equipment from service.</li><li>Keep leads off wet ground (use lead stands); do not use in wet conditions.</li><li>Identify overhead powerlines, maintain the SafeWork SA no-go clearance, and use a spotter when working near them.</li><li>Only a licensed electrician works on fixed wiring; isolate before any such work.</li></ol>'
  '<h3>PPE</h3><p>Boots, gloves.</p>'
  '<h3>Residual risk</h3><p>Low with tested equipment, RCDs and powerline clearance; contact with a powerline is potentially fatal.</p>'
where not exists (select 1 from public.swms_templates where trade='Carpentry' and title='Electrical Leads, Test-and-Tag & Overhead Powerlines');
