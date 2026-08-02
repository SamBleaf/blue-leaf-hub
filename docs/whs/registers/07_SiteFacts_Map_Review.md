# Site-Facts Resolution Map — Review Dump

Generated against the LIVE DB (`swms_templates`) — this is ground truth. DRAFT, reviewer-gated.

## 1. Full resolution map (SF answer → module → the COMPLETE control text it ticks)

### sf01Scaffold = `green`  —  Perimeter scaffold on site? → *Yes — green tag + handover cert*
- **H-01** L3: Perimeter scaffold erected to AS/NZS 1576 by a licensed scaffolder, handover certificate received and scaffold tag green before any person accesses the floor level. Deck within 300 mm of the structure or infill fitted.
- **H-02** L3: Perimeter scaffold with green tag in place before upper-storey frames are stood. Frames stood from the scaffold deck, not from the floor edge.
- **H-03** L3: Perimeter scaffold with green tag, decked to a level that allows work on the top plate from the scaffold deck rather than off the plate.
- **H-04** L3: Perimeter scaffold with green tag, deck set at the correct height relative to the eave for fascia and batten work.
- **H-05** L3: Perimeter scaffold with green tag, decked at working height with the deck within 300 mm of the wall face or infill fitted. Scaffold is the working platform — not ladders.
- **T-13** L4: Handover certificate received and scaffold tag inspected before first use. No access to an untagged, red-tagged or incomplete scaffold.
- **T-13** L4: Deck complete, guardrails and toeboards in place, gap between deck and structure within tolerance or infilled, safe access provided.

### sf02Guardrail = `yes`  —  Perimeter guardrail / edge protection installed? → *Yes*
- **H-01** L4: Guardrail system to the full open perimeter — top rail 900–1100 mm, mid rail, toeboard — installed before framing at that edge commences.
- **H-02** L4: Guardrail to the full open perimeter of the working level before frames are handled at that edge.
- **H-04** L4: Perimeter guardrail / edge protection to the roof perimeter installed before battening commences at that edge — not progressively as the work reaches it.

### sf03Openings = `covers`  —  How are openings and voids protected? → *Fixed load-rated covers*
- **H-06** L4: Load-rated cover, mechanically fixed (not merely laid over), sized to overlap the opening, marked HOLE — DO NOT REMOVE.
- **H-01** L4: All stair voids, lift shafts and penetrations covered with a fixed, load-rated cover, mechanically secured and marked HOLE — DO NOT REMOVE, or guardrailed. Installed at the moment the void is created.
- **H-03** L4: All stair voids and openings within the working area covered or guardrailed before truss work starts.

### sf03Openings = `guardrail`  —  How are openings and voids protected? → *Guardrail*
- **H-06** L4: Guardrail to full perimeter of the opening — top rail, mid rail, toeboard.

### sf03Openings = `decking`  —  How are openings and voids protected? → *Temporary decking*
- **H-06** L4: Opening infilled with temporary structural decking.

### sf04Mesh = `yes`  —  Safety mesh or catch platform below the working level? → *Yes*
- **H-01** L4: Catch platform / perimeter containment scaffold installed below the working level.
- **H-04** L4: Safety mesh or catch platform installed beneath the roof frame to arrest a fall through the batten zone.

### sf05Exclusion = `yes`  —  1.5 m edge exclusion demarcated? → *Yes — physically demarcated*
- **H-01** L5: 1.5 m exclusion from any unprotected edge, physically demarcated with barrier mesh or star-picket-and-tape — not verbal. Applies only where a fall prevention device cannot be installed.
- **H-02** L5: 1.5 m exclusion from unprotected edges, physically demarcated.
- **H-03** L4: Guardrail or edge protection to the external perimeter where work within 1.5 m of the external wall is unavoidable.
- **H-04** L5: Workers do not stand on or work closer than 1.5 m to the external top plate unless perimeter fall prevention is installed.

### sf07FallSystem = `restraint`  —  Fall system beyond scaffold / guardrail? → *Travel restraint*
- **H-01** L6: Travel-restraint system: full-body harness with fixed-length lanyard adjusted so the worker physically cannot reach the edge, anchored to a rated anchor installed by a competent person. Restraint only.
- **H-02** L6: Travel restraint as per H-01, anchored to a rated anchor — never to an unbraced frame.
- **H-03** L6: Travel restraint anchored to a rated anchor installed by a competent person — not to trusses.
- **H-04** L6: Travel restraint to a rated anchor — permitted only once trusses are fully braced and the anchor is installed by a competent person.

### sf07FallSystem = `arrest`  —  Fall system beyond scaffold / guardrail? → *Fall arrest*
- **H-01** L6: Fall-arrest system — permitted only where Part 3 records a completed ground-clearance calculation confirming arrest before impact, an equipped rescue arrangement, and a nominated trained rescuer on site. Not permitted at plate heights where clearance is insufficient.

### sf07FallSystem = `ewp`  —  Fall system beyond scaffold / guardrail? → *EWP*
- **H-05** L4: EWP with operator holding the appropriate high risk work licence where the licence threshold applies; harness worn inside a boom-type EWP.
- **H-04** L1: Fascia and barge fixed from an EWP or from the scaffold deck; no person on the roof frame.

### sf10Dust = `extraction`  —  Dust control available for cutting? → *H-class on-tool extraction*
- **T-01** L4: On-tool dust extraction with an H-class vacuum, correctly fitted and emptied per manufacturer instructions.
- **T-02** L4: On-tool dust extraction fitted to saws, routers and sanders, connected to an appropriate class vacuum.

### sf10Dust = `wet`  —  Dust control available for cutting? → *Wet suppression*
- **T-01** L4: Wet suppression / water-fed cutting with slurry managed and not allowed to dry and re-aerosolise.

### sf11CutStation = `ground`  —  Cutting station? → *Ground level, outdoors, downwind*
- **T-01** L3: Designated outdoor cutting station, downwind, away from the crew and site boundary; no cutting inside the building envelope.
- **T-02** L3: Cutting station located outdoors and downwind; second-fix machining done in a ventilated area, not an enclosed room.
- **H-05** L2: Sheets cut to size at ground level in a designated cutting station; no cutting at height.

### sf12Overhead = `confirmed`  —  Overhead electrical services on the frontage? → *Present — clearances confirmed with network operator*
- **H-07** L4: Overhead electrical services identified and no-go clearances confirmed with the network operator before any lift. Where clearances cannot be maintained, the lift does not proceed until services are de-energised, insulated or relocated.
- **H-11** L3: Overhead lines insulated/tiger-tailed by the network operator; no-go clearance distances confirmed with the network operator and physically marked on site.

### sf12Overhead = `deenergised`  —  Overhead electrical services on the frontage? → *Present — de-energised or relocated*
- **H-11** L1: Supply de-energised, isolated, locked and tagged, and proved dead by a licensed electrician before work commences.
- **H-11** L1: Overhead service relocated or undergrounded by the network operator prior to works.

### sf14Access = `scaffold`  —  Site access and egress to each work level? → *Scaffold stairs*
- **T-10** L4: Defined, maintained access and egress route to every work level; scaffold stairs or a secured ladder access, not climbing the frame.

### sf14Access = `ladder`  —  Site access and egress to each work level? → *Secured ladder access*
- **T-10** L4: Defined, maintained access and egress route to every work level; scaffold stairs or a secured ladder access, not climbing the frame.

### STOPWORK_TARGETS  —  fired when answers.stopWind OR answers.stopHeat is set
- **H-02** L5: Stop-work wind limit stated in Part 3 (recommended default: cease standing frames above [X] km/h measured or forecast). Frames left standing overnight must be fully braced.
- **H-03** L5: Stop-work wind limit stated in Part 3.
- **H-04** L5: Stop-work limits for wind and rain stated in Part 3. No roof frame work on wet or frosted members.
- **H-05** L5: Stop-work wind limit for sheet handling stated in Part 3.
- **H-07** L5: Stop-work wind limit per the crane operator's stated limit, recorded in Part 3.

## 2. Prefix validation (startsWith count / contains count per target)

`sw` = controls whose text STARTS WITH the prefix (must be 1). `ct` = controls that CONTAIN it (near-collision flag if >1).

- sf01Scaffold.green → H-01 `Perimeter scaffold erected to AS/NZS 1576` — sw=1 ct=1
- sf01Scaffold.green → H-02 `Perimeter scaffold with green tag in place` — sw=1 ct=1
- sf01Scaffold.green → H-03 `Perimeter scaffold with green tag, decked to` — sw=1 ct=1
- sf01Scaffold.green → H-04 `Perimeter scaffold with green tag, deck set ` — sw=1 ct=1
- sf01Scaffold.green → H-05 `Perimeter scaffold with green tag, decked at` — sw=1 ct=1
- sf01Scaffold.green → T-13 `Handover certificate received and scaffold t` — sw=1 ct=1
- sf01Scaffold.green → T-13 `Deck complete, guardrails and toeboards in p` — sw=1 ct=1
- sf02Guardrail.yes → H-01 `Guardrail system to the full open perimeter` — sw=1 ct=1
- sf02Guardrail.yes → H-02 `Guardrail to the full open perimeter` — sw=1 ct=1
- sf02Guardrail.yes → H-04 `Perimeter guardrail / edge protection to the` — sw=1 ct=1
- sf03Openings.covers → H-06 `Load-rated cover, mechanically fixed` — sw=1 ct=1
- sf03Openings.covers → H-01 `All stair voids, lift shafts and penetration` — sw=1 ct=1
- sf03Openings.covers → H-03 `All stair voids and openings within the work` — sw=1 ct=1
- sf03Openings.guardrail → H-06 `Guardrail to full perimeter of the opening` — sw=1 ct=1
- sf03Openings.decking → H-06 `Opening infilled with temporary structural d` — sw=1 ct=1
- sf04Mesh.yes → H-01 `Catch platform / perimeter containment scaff` — sw=1 ct=1
- sf04Mesh.yes → H-04 `Safety mesh or catch platform installed bene` — sw=1 ct=1
- sf05Exclusion.yes → H-01 `1.5 m exclusion from any unprotected edge` — sw=1 ct=1
- sf05Exclusion.yes → H-02 `1.5 m exclusion from unprotected edges` — sw=1 ct=1
- sf05Exclusion.yes → H-03 `Guardrail or edge protection to the external` — sw=1 ct=1
- sf05Exclusion.yes → H-04 `Workers do not stand on or work closer than ` — sw=1 ct=1
- sf07FallSystem.restraint → H-01 `Travel-restraint system: full-body harness` — sw=1 ct=1
- sf07FallSystem.restraint → H-02 `Travel restraint as per H-01` — sw=1 ct=1
- sf07FallSystem.restraint → H-03 `Travel restraint anchored to a rated anchor` — sw=1 ct=1
- sf07FallSystem.restraint → H-04 `Travel restraint to a rated anchor` — sw=1 ct=1
- sf07FallSystem.arrest → H-01 `Fall-arrest system` — sw=1 ct=1
- sf07FallSystem.ewp → H-05 `EWP with operator holding the appropriate hi` — sw=1 ct=1
- sf07FallSystem.ewp → H-04 `Fascia and barge fixed from an EWP` — sw=1 ct=1
- sf10Dust.extraction → T-01 `On-tool dust extraction with an H-class vacu` — sw=1 ct=1
- sf10Dust.extraction → T-02 `On-tool dust extraction fitted to saws` — sw=1 ct=1
- sf10Dust.wet → T-01 `Wet suppression / water-fed cutting` — sw=1 ct=1
- sf11CutStation.ground → T-01 `Designated outdoor cutting station, downwind` — sw=1 ct=1
- sf11CutStation.ground → T-02 `Cutting station located outdoors and downwin` — sw=1 ct=1
- sf11CutStation.ground → H-05 `Sheets cut to size at ground level in a desi` — sw=1 ct=1
- sf12Overhead.confirmed → H-07 `Overhead electrical services identified and ` — sw=1 ct=1
- sf12Overhead.confirmed → H-11 `Overhead lines insulated/tiger-tailed by the` — sw=1 ct=1
- sf12Overhead.deenergised → H-11 `Supply de-energised, isolated, locked and ta` — sw=1 ct=1
- sf12Overhead.deenergised → H-11 `Overhead service relocated or undergrounded` — sw=1 ct=1
- sf14Access.scaffold → T-10 `Defined, maintained access and egress route ` — sw=1 ct=1
- sf14Access.ladder → T-10 `Defined, maintained access and egress route ` — sw=1 ct=1
- stopwork → H-02 `Stop-work wind limit stated in Part 3` — sw=1 ct=1
- stopwork → H-03 `Stop-work wind limit stated in Part 3` — sw=1 ct=1
- stopwork → H-04 `Stop-work limits for wind and rain stated in` — sw=1 ct=1
- stopwork → H-05 `Stop-work wind limit for sheet handling stat` — sw=1 ct=1
- stopwork → H-07 `Stop-work wind limit per the crane operator'` — sw=1 ct=1

## 3. Register control texts as they sit in the DB (SF-referenced modules)

> These are POST-cleanup (commit bfb621a stripped literal `**` markdown, removed editorial asides like the T-12 “nil entry” note, fixed the T-04 “where practical” wording, and normalised T-14 PPE flags). If that differs from your original wording, the map is built against the cleaned text below.

### H-01 — Fall from height — floor framing, upper-floor joists and flooring
- L1: Frame and sheet the floor cassette at ground level and crane the completed module into position. No person works at the open edge.
- L2: Sheet the deck progressively from a fully decked area outward, so the worker is never positioned beyond a continuous working surface. Sequence recorded in Part 3.
- L3: Perimeter scaffold erected to AS/NZS 1576 by a licensed scaffolder, handover certificate received and scaffold tag green before any person accesses the floor level. Deck within 300 mm of the structure or infill fitted.
- L4: Guardrail system to the full open perimeter — top rail 900–1100 mm, mid rail, toeboard — installed before framing at that edge commences.
- L4: All stair voids, lift shafts and penetrations covered with a fixed, load-rated cover, mechanically secured and marked HOLE — DO NOT REMOVE, or guardrailed. Installed at the moment the void is created.
- L4: Catch platform / perimeter containment scaffold installed below the working level.
- L5: 1.5 m exclusion from any unprotected edge, physically demarcated with barrier mesh or star-picket-and-tape — not verbal. Applies only where a fall prevention device cannot be installed.
- L5: Documented pre-start check of edge protection, void covers and scaffold tag each morning and after any alteration.
- L6: Travel-restraint system: full-body harness with fixed-length lanyard adjusted so the worker physically cannot reach the edge, anchored to a rated anchor installed by a competent person. Restraint only.
- L6: Fall-arrest system — permitted only where Part 3 records a completed ground-clearance calculation confirming arrest before impact, an equipped rescue arrangement, and a nominated trained rescuer on site. Not permitted at plate heights where clearance is insufficient.

### H-02 — Fall from height — wall frame erection and bracing
- L1: Frames assembled and stood at ground level only; no upper-storey frame work in this scope.
- L3: Perimeter scaffold with green tag in place before upper-storey frames are stood. Frames stood from the scaffold deck, not from the floor edge.
- L4: Guardrail to the full open perimeter of the working level before frames are handled at that edge.
- L4: Temporary bracing installed to manufacturer/AS 1684 requirements as each frame is stood — frames are never released until braced. Bracing remains until permanent bracing and tie-down are complete.
- L5: Erection sequence agreed at pre-start; no frame stood without the nominated number of hands present.
- L5: Stop-work wind limit stated in Part 3 (recommended default: cease standing frames above [X] km/h measured or forecast). Frames left standing overnight must be fully braced.
- L5: 1.5 m exclusion from unprotected edges, physically demarcated.
- L6: Travel restraint as per H-01, anchored to a rated anchor — never to an unbraced frame.

### H-03 — Fall from height — prefabricated roof truss erection
- L3: Perimeter scaffold with green tag, decked to a level that allows work on the top plate from the scaffold deck rather than off the plate.
- L4: No person stands on or works from an external wall top plate at any time. Erection carried out from internal wall top plates or from planks supported on internal walls, with no person working closer than 1.5 m to any external or gable-end wall.
- L4: Planks/platforms adequately supported and secured across their full span; laminated, aluminium or steel planks used strictly per the manufacturer's instructions.
- L4: All stair voids and openings within the working area covered or guardrailed before truss work starts.
- L4: Guardrail or edge protection to the external perimeter where work within 1.5 m of the external wall is unavoidable.
- L4: Trusses braced strictly to the truss manufacturer's erection and bracing instructions (obtained per job and attached to the pack). Temporary bracing installed progressively; no truss released until braced.
- L5: Trusses loaded onto the delivery vehicle in erection order so the next truss is accessible from the top of the stack, minimising handling at height.
- L5: Ceiling joists and bottom chords visually checked for defects before anyone stands on them.
- L5: Anchoring to unbraced trusses is prohibited. Trusses will not take fall-arrest loads until permanently braced.
- L5: Stop-work wind limit stated in Part 3.
- L6: Travel restraint anchored to a rated anchor installed by a competent person — not to trusses.

### H-04 — Fall from height — roof battens, roof frame, fascia and barge
- L1: Fascia and barge fixed from an EWP or from the scaffold deck; no person on the roof frame.
- L3: Perimeter scaffold with green tag, deck set at the correct height relative to the eave for fascia and batten work.
- L4: Perimeter guardrail / edge protection to the roof perimeter installed before battening commences at that edge — not progressively as the work reaches it.
- L4: Safety mesh or catch platform installed beneath the roof frame to arrest a fall through the batten zone.
- L4: Battens installed working from the completed area outward, so the worker is always standing on secured battens.
- L5: Workers do not stand on or work closer than 1.5 m to the external top plate unless perimeter fall prevention is installed.
- L5: Batten fixing sequence and permitted walking route stated at pre-start. Only restrained (fixed) members are walked on.
- L5: Stop-work limits for wind and rain stated in Part 3. No roof frame work on wet or frosted members.
- L6: Travel restraint to a rated anchor — permitted only once trusses are fully braced and the anchor is installed by a competent person.

### H-05 — Fall from height — cladding and external sheeting
- L2: Sheets cut to size at ground level in a designated cutting station; no cutting at height.
- L3: Perimeter scaffold with green tag, decked at working height with the deck within 300 mm of the wall face or infill fitted. Scaffold is the working platform — not ladders.
- L4: EWP with operator holding the appropriate high risk work licence where the licence threshold applies; harness worn inside a boom-type EWP.
- L4: Exclusion zone beneath the work face, physically demarcated, to control dropped sheets and trims. Toeboards or mesh to the scaffold.
- L5: Sheets raised mechanically or by team lift to the deck; no single-person handling of full sheets at height.
- L5: Stop-work wind limit for sheet handling stated in Part 3.

### H-06 — Fall into voids, stair openings, penetrations and excavations at the work level
- L1: Opening not formed until the surrounding work is complete and protection is ready to install in the same operation.
- L4: Load-rated cover, mechanically fixed (not merely laid over), sized to overlap the opening, marked HOLE — DO NOT REMOVE.
- L4: Guardrail to full perimeter of the opening — top rail, mid rail, toeboard.
- L4: Opening infilled with temporary structural decking.
- L5: Covers and guardrails installed at the moment the opening is created, by the person who created it. Permanent instruction, not a per-job decision.
- L5: Removal of any cover requires supervisor authorisation, an immediate replacement control, and reinstatement before the area is left unattended.
- L5: Documented pre-start walk of all openings on site.

### H-07 — Powered mobile plant on site — crane, telehandler, EWP, truck-mounted crane
- L1: Materials placed by plant before the crew enters the area; no persons in the zone during lifting.
- L3: Exclusion zone the full radius of the load plus a stated margin, physically demarcated with barrier mesh/bunting, dimension recorded in Part 3. No person under a suspended load at any time.
- L3: Site secured against unauthorised persons and public for the duration of the lift; footpath and street frontage managed (see H-12).
- L4: Lift plan obtained from the crane operator and reviewed before the lift. Ground conditions and outrigger bearing assessed.
- L4: Overhead electrical services identified and no-go clearances confirmed with the network operator before any lift. Where clearances cannot be maintained, the lift does not proceed until services are de-energised, insulated or relocated.
- L5: Operator holds the applicable high risk work licence class; dogging/rigging carried out by a licensed dogger or rigger. Licence numbers recorded in Part 3.
- L5: Single nominated spotter with agreed hand signals; one person directing the lift.
- L5: Stop-work wind limit per the crane operator's stated limit, recorded in Part 3.
- L5: Reversing and traffic movements on site directed by a spotter; delivery route agreed at pre-start.

### H-11 — Work on or near energised electrical installations and services
- L1: Supply de-energised, isolated, locked and tagged, and proved dead by a licensed electrician before work commences.
- L1: Overhead service relocated or undergrounded by the network operator prior to works.
- L3: Overhead lines insulated/tiger-tailed by the network operator; no-go clearance distances confirmed with the network operator and physically marked on site.
- L4: Underground services located by DBYD enquiry plus on-site electronic location and, where required, hand-dug potholing before any penetration.
- L4: Cable detection scan of walls and floors before drilling or nailing into existing structure.
- L5: Dedicated spotter for any plant, ladder or long material movement within the approach zone.
- L5: Height of load and boom controlled; no material carried vertically near lines.
- L5: Blue Leaf crew perform no electrical work. Licensed electrician only.

### H-12 — Work on, in or adjacent to a road, footpath or traffic corridor in use
- L1: All deliveries and lifts staged fully within the site boundary.
- L3: Council permit obtained for footpath/road occupation; approved traffic management plan implemented; pedestrian detour with continuous barriers.
- L4: Physical barriers between the public and the work zone — not tape alone.
- L5: Traffic controller present for vehicle entry/exit where the TMP requires it.
- L5: Deliveries scheduled outside school drop-off and peak pedestrian periods.

### T-01 — Crystalline silica — cutting and drilling fibre cement, AAC, masonry, tile
- L1: Components ordered pre-cut to size by the supplier; no site processing.
- L2: Score-and-snap or shears used instead of powered cutting. Dust-reducing blades specified.
- L2: Non-silica alternative product specified at design stage.
- L3: Designated outdoor cutting station, downwind, away from the crew and site boundary; no cutting inside the building envelope.
- L4: On-tool dust extraction with an H-class vacuum, correctly fitted and emptied per manufacturer instructions.
- L4: Wet suppression / water-fed cutting with slurry managed and not allowed to dry and re-aerosolise.
- L5: Dry sweeping and compressed-air blow-down of silica dust prohibited. H-class vacuum or wet methods only.
- L5: Exposure duration limited; other workers excluded from the cutting station.
- L5: SDS obtained for every silica-containing product and held with the pack.
- L6: P2 (or higher) respirator, fit-tested, worn by the operator and anyone within the cutting zone. Clean-shaven for tight-fitting RPE.

### T-02 — Timber and MDF dust
- L1: Components pre-machined off site.
- L3: Cutting station located outdoors and downwind; second-fix machining done in a ventilated area, not an enclosed room.
- L4: On-tool dust extraction fitted to saws, routers and sanders, connected to an appropriate class vacuum.
- L5: Clean-up by vacuum, not dry sweeping or blow-down.
- L5: SDS obtained for MDF and engineered products (formaldehyde).
- L6: P2 respirator when machining MDF or producing visible dust.

### T-06 — Hazardous manual tasks
- L1: Materials delivered and placed by plant directly at the point of use; no manual carry.
- L2: Smaller sheet sizes or lighter product specified; frames broken into shorter sections.
- L4: Mechanical aids used — telehandler, panel lifter, sheet trolley, beam dolly, gin wheel. Nominated aid for this job recorded in Part 3.
- L4: Material stored at waist height on stands; no repeated lifting from ground level.
- L5: Team lift with a stated crew number and a nominated caller for defined loads. Loads and crew numbers listed in Part 3.
- L5: Task rotation and rest breaks for sustained overhead or repetitive work.
- L5: Workers trained in the specific handling techniques for the loads on this job.

### T-09 — Deliveries, unloading and material storage
- L3: Designated laydown area clear of access ways, edges and the crane swing zone; exclusion zone during unloading.
- L4: Truss and frame stacks on level bearers, restrained against toppling, height limited to a stated maximum.
- L4: Sheet material stored flat or in a rack — not leaned against a wall or frame.
- L5: Delivery scheduled so trusses are loaded in erection order (supports H-03).
- L5: Straps released only from a position clear of the load's fall path.
- L5: Access ways and egress routes kept clear at all times.

### T-10 — Housekeeping, access and egress
- L3: Designated waste bin and off-cut stockpile clear of the work area and access routes.
- L4: Defined, maintained access and egress route to every work level; scaffold stairs or a secured ladder access, not climbing the frame.
- L5: Work area cleared of off-cuts, straps, packaging and trailing leads progressively — not only at end of day.
- L5: Protruding nails removed or bent over immediately.
- L5: End-of-day clean-down and site secured against unauthorised entry.

### T-13 — Scaffold interface — using scaffold erected by others
- L4: Handover certificate received and scaffold tag inspected before first use. No access to an untagged, red-tagged or incomplete scaffold.
- L4: Deck complete, guardrails and toeboards in place, gap between deck and structure within tolerance or infilled, safe access provided.
- L5: Blue Leaf crew do not alter, move, remove or add to any scaffold component. Any change requested through the supervisor to the licensed scaffolder. Removing a guardrail to pass material is prohibited.
- L5: Scaffold visually checked at each pre-start and re-inspected after any impact, alteration or severe weather; tag currency confirmed.
- L5: Loading limits observed; materials not stockpiled on the deck beyond the rated duty.


## 4. Map-audit findings (adversarial workflow — 6 confirmed over-ticks/misses) — NOT YET FIXED

All in the two hardest mappings. These are why 4b is UNCOMMITTED pending your call.

1. **[HIGH over-tick] SF-06 wind targets fire on a HEAT-only entry.** Trigger is `stopWind || stopHeat`, but H-02/H-03/H-05 are *wind*-specific controls. Enter heat only → ticks four "wind limit stated" controls that were never stated. **Fix:** gate wind targets on `stopWind`, heat on `stopHeat`.
2. **[HIGH missing] SF-06 heat never ticks the heat control (T-11 L5).** Entering a heat threshold ticks wind controls but not the actual heat/adverse-weather control. **Fix:** add T-11 to the heat branch.
3. **[MED over-tick] H-04 L5 asserts wind AND rain** but the trigger never checks the rain/frost input. **Fix:** only tick when both wind + rain/frost captured.
4. **[HIGH over-tick] H-07 L5 is the CRANE OPERATOR's stated limit**, not the generic site wind figure. **Fix:** drive from the crane lift-plan input, not the site wind field.
5. **[HIGH over-tick] SF-12 `deenergised` ticks BOTH H-11 L1 controls** (isolated-and-proved-dead AND relocated/undergrounded) — mutually exclusive states; one is always false. **Fix:** split the option into "de-energised/isolated" vs "relocated/undergrounded".
6. **[HIGH over-tick] SF-12 `confirmed` ticks the tiger-tailed/insulated control (H-11 L3)** — a *physical* control a confirmed clearance distance does NOT prove is installed. **Fix:** resolve "confirmed" only to the clearance-confirmation control (H-07 L4), not the insulation control.

**My read:** these confirm the layer must NOT silently auto-tick — see §5. The clean mappings (SF-01/02/03/04/05/07/10/11, ~35 of 45 targets) survived; the 6 are all in SF-06 + SF-12.

## 5. Decision to settle — auto-tick vs confirm

What I built (uncommitted): an explicit **"Apply site facts → tick controls"** button. It does NOT tick as you answer; you press it, it ticks the resolved controls, they appear in sections 3/4 and the preview, and you can untick any. DRAFT-gated + reviewer sign-off before issue.

| Option | Behaviour | Risk |
|---|---|---|
| A · Silent auto-tick on answer | answer SF → controls tick immediately | highest — over-ticks land invisibly |
| **B · Apply-button pre-fill (built)** | press Apply → ticks, visible + editable | medium — supervisor sees every tick, can remove |
| C · Suggest-only | Apply *highlights* the controls; supervisor still ticks each | lowest — no assertion the supervisor didn't make |

**Given the 6 over-ticks, my recommendation is C** for the flagged mappings (or B only after the 6 fixes land + reviewer confirms). A control auto-ticked = a control the supervisor is asserting is in place. On the highest-consequence modules (electrical, crane) that assertion must be a deliberate act, not a side-effect. **Your call — this settles before 4c (standing/site-variable) builds on it.**

## 6. How the four dropped SFs wire to existing Part 3 fields — honest status

- **SF-06 (stop-work wind/heat/wet)** → the existing section-5 fields `answers.stopWind` / `answers.stopHeat` / `answers.noWetWork`. WIRED to STOPWORK_TARGETS (but with the 3 defects above).
- **SF-08 (powered mobile plant)** → the existing section-5 checkboxes `answers.craneOnSite` / `answers.plantOnSite`. These drive the **PPE overrides only** (crane→hard hat, plant→hi-vis in resolvePpe). They do **NOT** yet select H-07/H-12 or tick their controls — spec §2 says SF-08 should trigger those. **GAP.**
- **SF-09 (exclusion zone for lifting)** → **NOT captured or resolved yet.** No field, no target. **GAP.**
- **SF-13 (mechanical aid)** → **NOT captured or resolved yet.** **GAP.**

So of the 14 spec SFs: 10 captured as SF questions (SF-01/02/03/04/05/07/10/11/12/14) + SF-06 via the stop-work fields = ~45 of the ~51 targets. SF-08 partial (PPE only), SF-09 + SF-13 not done. Full parity with the spec's "14 → 51" needs those three, tracked for 4b-2.

## 7. File index

- `server/lib/whs/carpentrySiteFacts.mjs` — **the map** (SF_QUESTIONS, SF_RESOLVE, STOPWORK_TARGETS, resolveSiteFacts) — server
- `src/lib/carpentrySiteFacts.js` — client mirror (identical)
- `server/lib/whs/carpentryScope.mjs` + `src/lib/carpentryScope.js` — the J-questions (4a)
- `src/components/carpentry/WhsPackTab.jsx` — the builder (sections 1 scope / 2 site-facts / 3 HRCW / 4 task / 5 site; applyScope + applySiteFacts)
- `server/lib/whs/carpentryWhsPackRoutes.mjs` — endpoints + gates G-1..G-9
- `server/lib/whs/packCompose.mjs` — pack composer (renderJobScope, renderTagBlock, renderSiteCard, moduleBlock, resolvePpe)
- `server/lib/whs/packPdfKit.mjs` — the printed PDF
- `docs/whs/registers/whs_content.json` — **the register (control texts) — GROUND TRUTH**
- `docs/whs/registers/04_Questionnaire_Spec.md` §2 — the intent; `06_Unified_Build_Plan.md` — the plan
- `scripts/tests/carpentry-sitefacts-parity.test.mjs` — parity + resolution test (27/27); `carpentry-scope-parity.test.mjs` (20/20)


---

## §4 CORRECTION — the FULL adversarial audit returned **13** findings (the earlier §4 list of 6 was a partial read before the critic finished)

**1. [HIGH] mis-map — sf05Exclusion H-03**
- CONFIRMED against register. SF-05 Yes = 1.5 m edge exclusion physically demarcated (the setback approach, per H-01 L5 'only where a fall prevention device cannot be installed'). The H-01/H-02/H-04 targets correctly hit each module's exclusion/setback control, but the H-03 target (prefix 'Guardrail or edge protection to the external perimeter where work within 1.5 m') resolves to H-03 L4 #4 — the GUARDRAIL/edge-protection control, the semantic opposite. A supervisor who chose exclusion (i.e. NOT to install edge protection) auto-asserts that guardrail/edge protection IS installed to the external perimeter, on a fall-from-height truss module. H-03 genuinely has the exclusion analog as a separate L4 ('No person stands on or works from an external wall top plate… no person working closer than 1.5 m to any external or gable-end wall'), verified present in the register.
- FIX: Repoint the H-03 entry at prefix 'No person stands on or works from an external wall top plate' (H-03 L4 setback control), matching the H-01/H-02/H-04 exclusion pattern and the §2 intent SF-05 → H-03 L4.

**2. [HIGH] over-tick — sf07FallSystem H-04**
- CONFIRMED. The ewp branch correctly ticks H-05 L4 (EWP platform) but also ticks H-04 L1 (prefix 'Fascia and barge fixed from an EWP' → '…or from the scaffold deck; no person on the roof frame'). Spec §2 lists SF-07's H-04 contribution as L6 (travel restraint, already covered by the restraint branch), NOT L1. H-04 L1 is a top-of-hierarchy ELIMINATION control and a §8 mutual-exclusion trigger — ticking it greys out H-04 L4 (mesh/catch platform) and H-04 L5 (batten walking route). A site-wide 'EWP' fall-system answer (which may be for cladding/H-05) does not prove all H-04 roof-frame fascia/barge is done from an EWP with no person on the frame. Auto-asserts an elimination claim and suppresses two other fall protections.
- FIX: Remove the H-04 L1 tick from the ewp branch; EWP-as-fall-system establishes only H-05 L4. Any H-04 L1 elimination should be a deliberate per-module choice with its §8 grey-outs.

**3. [HIGH] over-tick — SF-06 / STOPWORK_TARGETS H-02 / H-03 / H-05**
- CONFIRMED. Trigger is an OR (answers.stopWind || answers.stopHeat) but H-02 L5, H-03 L5 ('Stop-work wind limit stated in Part 3') and H-05 L5 ('Stop-work wind limit for sheet handling stated in Part 3') are wind-specific. A heat-only entry (wind field blank) auto-ticks three 'wind limit stated in Part 3' controls that were never stated — the dangerous direction. Only downstream gate G-4 (blank Part-3 field) would catch it; the SF layer itself is wrong.
- FIX: Gate the wind-limit targets on answers.stopWind specifically; gate the heat control on answers.stopHeat. Never tick wind controls from a heat-only entry.

**4. [HIGH] missing — SF-06 / STOPWORK_TARGETS T-11**
- CONFIRMED. Trigger fires on stopHeat alone, but STOPWORK_TARGETS has no T-11 entry. T-11 L5 ('Stated stop-work limits recorded in Part 3 — heat threshold, wind speed… rain/frost limit…') is the actual heat/adverse-weather stop-work control and is exactly what entering a heat threshold establishes. Spec §2 SF-06 lists T-11 L5 and §3 lists 'T-11 | via SF-06'. Net: a heat value ticks four unrelated wind controls but never ticks the heat control it actually establishes.
- FIX: Add { code: 'T-11', p: 'Stated stop-work limits recorded in Part 3' } to STOPWORK_TARGETS (and gate it on stopHeat).

**5. [HIGH] over-tick — SF-06 / STOPWORK_TARGETS H-07**
- CONFIRMED. H-07 L5 is 'Stop-work wind limit per the crane operator's stated limit, recorded in Part 3.' The generic site stopWind field is a pack-level wind figure, not evidence the crane operator's specific stated limit was obtained and recorded — and a heat-only entry ticks it with no wind figure at all. §3 lists H-07 as 'via SF-08, SF-09, SF-12', not SF-06, confirming this control should be driven by the crane lift-plan input, not the site wind field. Auto-asserts a lift-specific engineering-of-work control the fact does not prove.
- FIX: Do not resolve H-07's stop-work control from the generic site wind field; drive it from the H-07/crane lift-plan input (operator's stated limit).

**6. [HIGH] over-tick — sf12Overhead H-11**
- CONFIRMED. Answer 'deenergised' = 'Present — de-energised OR relocated' (one combined option) maps to BOTH H-11 L1 controls: 'Supply de-energised, isolated, locked and tagged…' AND 'Overhead service relocated or undergrounded by the network operator.' Verified in register as two distinct L1 options and, per §8, mutually-exclusive alternatives — a service is either present-but-isolated or physically removed. At most one is true; ticking both makes one a false assertion on the highest-consequence (energised electrical) module. The answer also does not establish the L1 detail 'proved dead by a licensed electrician.'
- FIX: Split the SF-12 option into 'de-energised/isolated' vs 'relocated/undergrounded' so each ticks only its own H-11 L1 control; never tick both from one answer.

**7. [HIGH] over-tick — sf12Overhead H-11**
- CONFIRMED. Answer 'confirmed' = 'Present — clearances confirmed with network operator' maps to H-11 L3: 'Overhead lines INSULATED/TIGER-TAILED by the network operator; no-go clearance distances confirmed… and physically marked on site.' The answer establishes only the clearance-confirmation clause; tiger-tailing/insulation is a distinct PHYSICAL protective control the operator may or may not have installed. Auto-ticking L3 asserts an insulation control never verified, on the single highest-consequence question in the pack. (The other 'confirmed' target, H-07 L4 'clearances confirmed with the network operator', is a clean match — verified fine.)
- FIX: Resolve 'confirmed' to H-07 L4 (clearances) and to an H-11 control asserting clearance-confirmation only; do not tick the tiger-tailed/insulated L3 unless a separate input confirms insulation was installed.

**8. [MEDIUM] over-tick — sf04Mesh H-01**
- CONFIRMED. SF-04 conflates two devices ('Safety mesh OR catch platform'). H-04 L4 legitimately accepts either ('Safety mesh or catch platform installed beneath the roof frame'), but H-01 L4 is specifically 'Catch platform / perimeter containment scaffold installed below the working level' — mesh does not satisfy it. A supervisor answering Yes because roof-frame SAFETY MESH (a fall-through-roof control) is present would auto-tick a floor-framing catch platform/containment scaffold that need not exist. Verified: the two register texts differ exactly as described.
- FIX: Split SF-04 into mesh / catch-platform answers and gate the H-01 target on the catch-platform answer, or drop the H-01 target from sf04Mesh.yes and resolve H-01's catch-platform control from a dedicated fact.

**9. [MEDIUM] missing — sf03Openings H-01 / H-03**
- CONFIRMED. The guardrail branch resolves only H-06 L4. But H-01 L4 reads '…covered with a fixed, load-rated cover… or guardrailed' and H-03 L4 reads '…covered or guardrailed before truss work starts' — both genuinely satisfied by guardrailing openings (verified in register). Yet the map ticks H-01 L4 and H-03 L4 only under the covers answer, so a job protecting openings by guardrail leaves floor-void (H-01) and truss-void (H-03) protection unrecorded, though §2 lists both as resolved by SF-03. (The decking branch correctly omits them — neither text accepts decking.)
- FIX: Add the H-01 ('All stair voids, lift shafts and penetrations covered') and H-03 ('All stair voids and openings within the working area covered') targets to the sf03Openings.guardrail branch.

**10. [MEDIUM] over-tick — SF-06 / STOPWORK_TARGETS H-04**
- CONFIRMED. H-04 L5 asserts 'Stop-work limits for wind AND RAIN stated in Part 3. No roof frame work on wet or frosted members.' The trigger checks only stopWind/stopHeat and never SF-06's separate rain/frost input, so a wind-only entry ticks a control asserting a rain limit is stated, and a heat-only entry ticks it asserting both wind and rain — neither verified.
- FIX: Tick H-04's stop-work control only when both the wind limit and the rain/frost input are present, or narrow the register text to what SF-06 actually captures.

**11. [MEDIUM] over-tick — sf10Dust T-01 / T-02**
- CONFIRMED. SF-10 asks whether dust control is 'available for cutting' (equipment EXISTS), but the three targeted controls assert active deployment/maintenance: T-01 L4 'On-tool dust extraction with an H-class vacuum, CORRECTLY FITTED AND EMPTIED per manufacturer instructions'; T-01 L4 'Wet suppression… WITH SLURRY MANAGED and not allowed to dry and re-aerosolise'; T-02 L4 'On-tool dust extraction FITTED TO saws, routers and sanders, connected to an appropriate class vacuum'. A vac on the truck does not prove it is fitted to every tool, emptied correctly, or slurry managed. Lands on the crystalline-silica module (highest consequence). Unlike sibling facts that ask 'installed?/on site?', SF-10 uniquely asks 'available?', so the gap is specific to this SF.
- FIX: Reword SF-10 to assert deployment ('FITTED AND IN USE for this job's cutting' / 'IN USE with slurry managed'), or demote these L4 engineering ticks to a supervisor-confirm rather than an auto-tick.

**12. [LOW] over-tick — sf11CutStation T-02**
- CONFIRMED. sf11CutStation=ground resolves T-02 L3 via 'Cutting station located outdoors and downwind', but the full T-02 L3 control is compound: '…outdoors and downwind; SECOND-FIX MACHINING DONE IN A VENTILATED AREA, NOT AN ENCLOSED ROOM.' Second-fix machining (architraves, skirting, trims) is a distinct interior activity typically done inside the building, not at the outdoor ground-level station the answer describes. The answer establishes only the first clause; ticking T-02 L3 also asserts an interior-ventilation control the supervisor never confirmed. (Primarily a compound-register-text defect.)
- FIX: Split the T-02 L3 entry so the outdoor-cutting-station clause (established by SF-11) is separate from the second-fix-machining-ventilation clause (a standing/manual control), then point the prefix only at the outdoor-station clause.

**13. [LOW] over-tick — sf01Scaffold H-03 / H-04 / H-05**
- ADDED BY COMPLETENESS PASS (lower confidence). green ('green tag + handover cert') ticks H-03 L3, H-04 L3 and H-05 L3, each of which asserts a TRADE-SPECIFIC deck height: H-03 L3 'decked to a level that allows work on the top plate', H-04 L3 'deck set at the correct height relative to the eave for fascia and batten work', H-05 L3 'decked at working height… within 300 mm of the wall face'. A green tag proves a compliant, handed-over perimeter scaffold is installed but does not by itself prove the deck was set/re-set to each trade's working height. Flagged for reviewer judgement rather than as a clear defect — a green-tagged perimeter scaffold is generally the working platform and this is the spec's intended shared-fact behaviour (§2 SF-01 → all five L3s). Distinct from the other over-ticks in that the higher-order control (the scaffold) IS proven; only deck-height suitability per trade is unproven.
- FIX: Accept as-is if the reviewer judges a green-tagged perimeter scaffold sufficient evidence of trade-appropriate deck height; otherwise add a per-module deck-height confirm for H-03/H-04/H-05 L3.


**Clean survivors:** sf02Guardrail, sf05Exclusion (H-01/H-02/H-04 only), sf07 restraint/arrest, sf14Access, and the sf01Scaffold core — the majority. The 13 cluster in SF-06 (stop-work OR-trigger), SF-12 (electrical), and a handful of edge cases (SF-03/04/05-H03/07-EWP/10/11). These are all in the map DATA (carpentrySiteFacts.mjs), not the engine — the engine + tests are sound.
