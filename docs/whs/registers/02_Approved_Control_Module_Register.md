# Approved Control Module Register — Blue Leaf Building (Carpentry, SA)

**Register version:** 0.1 DRAFT
**Compiled:** 29/07/2026
**Status:** Every module below is **DRAFT**. No module may be issued to site until approved by a competent WHS reviewer.

---

## How to read a module

| Element | Rule |
|---|---|
| `is_HRCW` | `yes` → module belongs in **Part 1** (the SWMS). `no` → **Part 2** (task-control modules). Never mix. |
| `trigger` | The objective condition that makes this module apply. If the trigger isn't met, the module is not in the pack. |
| `control_options[]` | Ordered **eliminate → substitute → isolate → engineering → administrative → PPE**. Each line is a complete, correctly worded control. The supervisor ticks **only what is actually installed or in use on this site, on this day**. |
| Selection rule | At least one control from the **highest reasonably practicable level** must be selected. Selecting only administrative or PPE options requires a written justification in Part 3. |
| `ppe_rules[]` | Flags: **R** = required by this activity · **C** = conditionally required (condition stated) · **S** = recommended · **N/A** |
| `monitor_review` | Mandatory field — satisfies reg 299(2)(d). |
| `responsible` | Split: **INSTALL/VERIFY** (named supervisor) vs **USE** (worker). Never blanket "Worker". |

**Banned wording.** No control in this register may contain: *if practicable · where practicable · where possible · when possible · as required · appropriate PPE · as you get to area · where suitable.* If a control cannot be stated definitively, it is not a control.

---

# PART 1 — HRCW MODULES

---

### H-01 · Fall from height — floor framing, upper-floor joists and flooring

| Field | Value |
|---|---|
| activity | Installing bearers, joists, blocking and structural flooring to a suspended or upper floor |
| hazard | Fall from perimeter or open edge; fall through unsheeted joist zone; fall into stair void or service penetration |
| is_HRCW | **yes** — reg 291, risk of a fall more than 2 m |
| trigger | Any floor framing where a person could fall **more than 2 m** to the level below or to ground |

**control_options[]** (tick only what is installed)

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 1 Eliminate | Frame and sheet the floor cassette at ground level and crane the completed module into position. No person works at the open edge. |
| ☐ | 2 Substitute | Sheet the deck **progressively from a fully decked area outward**, so the worker is never positioned beyond a continuous working surface. Sequence recorded in Part 3. |
| ☐ | 3 Isolate | Perimeter scaffold erected to AS/NZS 1576 by a licensed scaffolder, handover certificate received and scaffold tag green **before** any person accesses the floor level. Deck within 300 mm of the structure or infill fitted. |
| ☐ | 4 Engineering | Guardrail system to the full open perimeter — top rail 900–1100 mm, mid rail, toeboard — installed **before** framing at that edge commences. |
| ☐ | 4 Engineering | All stair voids, lift shafts and penetrations covered with a fixed, load-rated cover, mechanically secured and marked **HOLE — DO NOT REMOVE**, or guardrailed. Installed at the moment the void is created. |
| ☐ | 4 Engineering | Catch platform / perimeter containment scaffold installed below the working level. |
| ☐ | 5 Administrative | **1.5 m exclusion from any unprotected edge**, physically demarcated with barrier mesh or star-picket-and-tape — not verbal. Applies only where a fall prevention device cannot be installed. |
| ☐ | 5 Administrative | Documented pre-start check of edge protection, void covers and scaffold tag each morning and after any alteration. |
| ☐ | 6 PPE | Travel-restraint system: full-body harness with **fixed-length lanyard adjusted so the worker physically cannot reach the edge**, anchored to a rated anchor installed by a competent person. Restraint only. |
| ☐ | 6 PPE | Fall-arrest system — **permitted only where Part 3 records a completed ground-clearance calculation confirming arrest before impact, an equipped rescue arrangement, and a nominated trained rescuer on site.** Not permitted at plate heights where clearance is insufficient. |

**ppe_rules[]** — safety boots **R** · eye protection **R** · hi-vis **C** *(mandatory when powered mobile plant is on site)* · hard hat **C** *(mandatory when a crane is on site or work occurs below others)* · harness **C** *(only if a restraint or arrest option above is selected)* · gloves **S** · hearing protection **C** *(mandatory when using nail guns or saws)*

**monitor_review:** Supervisor verifies edge protection and void covers at pre-start and records it in Part 3. Any removal of a void cover or guardrail requires supervisor authorisation and immediate reinstatement. Module reviewed on any change of method, any near miss, or any incident.
**responsible:** INSTALL/VERIFY — *[Site Supervisor name]* · USE — all carpentry crew
**source_refs:** S-02 (reg 291, 299), S-03, S-04, S-11, S-18, S-24, S-26, S-32, S-33, S-34, S-35
**review_status:** DRAFT · **approver:** *[PENDING]*

---

### H-02 · Fall from height — wall frame erection and bracing

| Field | Value |
|---|---|
| activity | Standing, plumbing, bracing and fixing wall frames; upper-storey wall frames |
| hazard | Fall from open edge while standing frames; frame collapse onto workers; fall while working off a platform |
| is_HRCW | **yes** — reg 291, fall more than 2 m (upper-storey frames); collapse risk |
| trigger | Erecting wall frames at any level where a fall **more than 2 m** is possible, or where an unbraced frame could collapse |

**control_options[]**

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 1 Eliminate | Frames assembled and stood at ground level only; no upper-storey frame work in this scope. |
| ☐ | 3 Isolate | Perimeter scaffold with green tag in place before upper-storey frames are stood. Frames stood from the scaffold deck, not from the floor edge. |
| ☐ | 4 Engineering | Guardrail to the full open perimeter of the working level before frames are handled at that edge. |
| ☐ | 4 Engineering | Temporary bracing installed to manufacturer/AS 1684 requirements **as each frame is stood** — frames are never released until braced. Bracing remains until permanent bracing and tie-down are complete. |
| ☐ | 5 Administrative | Erection sequence agreed at pre-start; no frame stood without the nominated number of hands present. |
| ☐ | 5 Administrative | Stop-work wind limit stated in Part 3 (recommended default: cease standing frames above **[X] km/h** measured or forecast). Frames left standing overnight must be fully braced. |
| ☐ | 5 Administrative | 1.5 m exclusion from unprotected edges, physically demarcated. |
| ☐ | 6 PPE | Travel restraint as per H-01, anchored to a rated anchor — **never to an unbraced frame**. |

**ppe_rules[]** — safety boots **R** · eye protection **R** · gloves **R** *(timber handling)* · hard hat **C** *(crane on site)* · hi-vis **C** *(mobile plant on site)* · hearing protection **C** *(nail gun use)*

**monitor_review:** Supervisor confirms bracing before crew leave any frame. Wind checked at pre-start and at any noticeable change. Reviewed on any frame movement or near miss.
**responsible:** INSTALL/VERIFY — *[Site Supervisor]* · USE — crew
**source_refs:** S-02, S-03, S-04, S-11, S-24, S-31, S-34
**review_status:** DRAFT · **approver:** *[PENDING]*

---

### H-03 · Fall from height — prefabricated roof truss erection

| Field | Value |
|---|---|
| activity | Landing, spreading, standing, plumbing, bracing and fixing prefabricated timber roof trusses |
| hazard | Fall from top plate or between trusses; fall into stair void; truss dominoing/collapse; struck by truss during landing |
| is_HRCW | **yes** — reg 291, fall more than 2 m; plus powered mobile plant if craned |
| trigger | Any truss erection where a fall **more than 2 m** is possible |

**control_options[]**

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 3 Isolate | Perimeter scaffold with green tag, decked to a level that allows work on the top plate from the scaffold deck rather than off the plate. |
| ☐ | 4 Engineering | **No person stands on or works from an external wall top plate at any time.** Erection carried out from internal wall top plates or from planks supported on internal walls, with **no person working closer than 1.5 m to any external or gable-end wall**. |
| ☐ | 4 Engineering | Planks/platforms adequately supported and secured across their full span; laminated, aluminium or steel planks used strictly per the manufacturer's instructions. |
| ☐ | 4 Engineering | All stair voids and openings within the working area covered or guardrailed **before** truss work starts. |
| ☐ | 4 Engineering | Guardrail or edge protection to the external perimeter where work within 1.5 m of the external wall is unavoidable. |
| ☐ | 4 Engineering | Trusses braced strictly to the **truss manufacturer's erection and bracing instructions** (obtained per job and attached to the pack). Temporary bracing installed progressively; no truss released until braced. |
| ☐ | 5 Administrative | Trusses loaded onto the delivery vehicle in erection order so the next truss is accessible from the top of the stack, minimising handling at height. |
| ☐ | 5 Administrative | Ceiling joists and bottom chords visually checked for defects before anyone stands on them. |
| ☐ | 5 Administrative | **Anchoring to unbraced trusses is prohibited.** Trusses will not take fall-arrest loads until permanently braced. |
| ☐ | 5 Administrative | Stop-work wind limit stated in Part 3. |
| ☐ | 6 PPE | Travel restraint anchored to a rated anchor installed by a competent person — **not to trusses**. |

**ppe_rules[]** — safety boots **R** · eye protection **R** · gloves **R** · hard hat **R** *(overhead load handling)* · hi-vis **C** *(mobile plant/crane on site)* · harness **C** *(only if restraint option selected)* · hearing protection **C**

**monitor_review:** Supervisor verifies plank support, void covers, bracing progress and the 1.5 m rule at each pre-start and after each truss run. Reviewed on any change to truss design, spacing, or crane arrangement.
**responsible:** INSTALL/VERIFY — *[Site Supervisor]* · USE — crew
**source_refs:** S-02, S-03, S-04, S-11, S-15, S-24, S-31, S-41
**review_status:** DRAFT · **approver:** *[PENDING]*
**note:** S-15 (SafeWork SA) is unequivocal on the top-plate prohibition and the 1.5 m rule. The superseded SWMS's *"if practicable harnesses are to be used"* is directly inconsistent with it.

---

### H-04 · Fall from height — roof battens, roof frame, fascia and barge

| Field | Value |
|---|---|
| activity | Fixing roof battens/purlins to trusses; working on the roof frame; fascia, barge and gutter board |
| hazard | Fall from perimeter; fall **through** the incomplete roof frame between battens; fall while working at the eave |
| is_HRCW | **yes** — reg 291, fall more than 2 m |
| trigger | Any batten, roof frame or fascia work where a fall **more than 2 m** is possible |

**control_options[]**

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 1 Eliminate | Fascia and barge fixed from an EWP or from the scaffold deck; no person on the roof frame. |
| ☐ | 3 Isolate | Perimeter scaffold with green tag, deck set at the correct height relative to the eave for fascia and batten work. |
| ☐ | 4 Engineering | Perimeter guardrail / edge protection to the roof perimeter installed **before** battening commences at that edge — not progressively as the work reaches it. |
| ☐ | 4 Engineering | Safety mesh or catch platform installed beneath the roof frame to arrest a fall through the batten zone. |
| ☐ | 4 Engineering | Battens installed working **from the completed area outward**, so the worker is always standing on secured battens. |
| ☐ | 5 Administrative | Workers do not stand on or work closer than **1.5 m to the external top plate** unless perimeter fall prevention is installed. |
| ☐ | 5 Administrative | Batten fixing sequence and permitted walking route stated at pre-start. Only restrained (fixed) members are walked on. |
| ☐ | 5 Administrative | Stop-work limits for wind and rain stated in Part 3. No roof frame work on wet or frosted members. |
| ☐ | 6 PPE | Travel restraint to a rated anchor — permitted only once trusses are fully braced and the anchor is installed by a competent person. |

**ppe_rules[]** — safety boots with slip-resistant sole **R** · eye protection **R** · hi-vis **C** · hard hat **C** · harness **C** · sun protection **R** *(see T-11)*

**monitor_review:** Supervisor verifies edge protection and mesh before battening starts and after any weather event. Reviewed on change of roof pitch, batten spacing or roofing material.
**responsible:** INSTALL/VERIFY — *[Site Supervisor]* · USE — crew
**source_refs:** S-02, S-03, S-04, S-11, S-16, S-17, S-24
**review_status:** DRAFT · **approver:** *[PENDING]*

---

### H-05 · Fall from height — cladding and external sheeting

| Field | Value |
|---|---|
| activity | Fixing external cladding, sheeting, sarking, wrap and trims above ground level |
| hazard | Fall from scaffold or EWP; fall from ladder; dropped sheet striking persons below |
| is_HRCW | **yes** — reg 291, fall more than 2 m |
| trigger | Cladding work at any point where a fall **more than 2 m** is possible |
| interacts with | **T-01 (silica)** — most cladding is a crystalline silica substance. Both modules apply. |

**control_options[]**

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 2 Substitute | Sheets cut to size at ground level in a designated cutting station; no cutting at height. |
| ☐ | 3 Isolate | Perimeter scaffold with green tag, decked at working height with the deck within 300 mm of the wall face or infill fitted. Scaffold is the working platform — **not ladders**. |
| ☐ | 4 Engineering | EWP with operator holding the appropriate high risk work licence where the licence threshold applies; harness worn inside a boom-type EWP. |
| ☐ | 4 Engineering | Exclusion zone beneath the work face, physically demarcated, to control dropped sheets and trims. Toeboards or mesh to the scaffold. |
| ☐ | 5 Administrative | Sheets raised mechanically or by team lift to the deck; no single-person handling of full sheets at height. |
| ☐ | 5 Administrative | Stop-work wind limit for sheet handling stated in Part 3. |

**ppe_rules[]** — safety boots **R** · eye protection **R** · gloves **R** · P2 respirator **C** *(mandatory whenever cutting or drilling cladding — see T-01)* · hi-vis **C** · hard hat **C** *(mandatory for anyone below the work face)* · hearing protection **C**

**monitor_review:** Supervisor checks scaffold tag and exclusion zone at pre-start. Reviewed on change of cladding product or fixing method.
**responsible:** INSTALL/VERIFY — *[Site Supervisor]* · USE — crew
**source_refs:** S-02, S-03, S-04, S-05, S-11, S-18, S-19
**review_status:** DRAFT · **approver:** *[PENDING]*

---

### H-06 · Fall into voids, stair openings, penetrations and excavations at the work level

| Field | Value |
|---|---|
| activity | All work adjacent to stair voids, service penetrations, lift shafts, open trenches and pier holes |
| hazard | Fall into or through an opening |
| is_HRCW | **yes** — reg 291, fall more than 2 m (and trench >1.5 m where applicable) |
| trigger | Any opening in a working surface through which a person could fall, at any stage of the job |

**control_options[]**

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 1 Eliminate | Opening not formed until the surrounding work is complete and protection is ready to install in the same operation. |
| ☐ | 4 Engineering | Load-rated cover, mechanically fixed (not merely laid over), sized to overlap the opening, marked **HOLE — DO NOT REMOVE**. |
| ☐ | 4 Engineering | Guardrail to full perimeter of the opening — top rail, mid rail, toeboard. |
| ☐ | 4 Engineering | Opening infilled with temporary structural decking. |
| ☐ | 5 Administrative | Covers and guardrails installed **at the moment the opening is created**, by the person who created it. Permanent instruction, not a per-job decision. |
| ☐ | 5 Administrative | Removal of any cover requires supervisor authorisation, an immediate replacement control, and reinstatement before the area is left unattended. |
| ☐ | 5 Administrative | Documented pre-start walk of all openings on site. |

**ppe_rules[]** — safety boots **R** · hi-vis **C** · hard hat **C**

**monitor_review:** Daily pre-start opening walk recorded in Part 3. Any unprotected opening found is an immediate stop-work for that area.
**responsible:** INSTALL/VERIFY — *[Site Supervisor]* + the worker who creates the opening · USE — all persons on site
**source_refs:** S-02, S-03, S-04, S-11, S-15, S-24
**review_status:** DRAFT · **approver:** *[PENDING]*

---

### H-07 · Powered mobile plant on site — crane, telehandler, EWP, truck-mounted crane

| Field | Value |
|---|---|
| activity | Craning frames, trusses, beams and materials; telehandler and EWP operation; delivery vehicle movements |
| hazard | Struck by load or plant; crush; load drop; overturn; contact with overhead services |
| is_HRCW | **yes** — reg 291, work in an area where there is any movement of powered mobile plant |
| trigger | Any powered mobile plant operating in the work area — **including plant brought by others**, e.g. a truss delivery truck with a crane |

**control_options[]**

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 1 Eliminate | Materials placed by plant before the crew enters the area; no persons in the zone during lifting. |
| ☐ | 3 Isolate | **Exclusion zone the full radius of the load plus a stated margin**, physically demarcated with barrier mesh/bunting, dimension recorded in Part 3. No person under a suspended load at any time. |
| ☐ | 3 Isolate | Site secured against unauthorised persons and public for the duration of the lift; footpath and street frontage managed (see H-12). |
| ☐ | 4 Engineering | Lift plan obtained from the crane operator and reviewed before the lift. Ground conditions and outrigger bearing assessed. |
| ☐ | 4 Engineering | **Overhead electrical services identified and no-go clearances confirmed with the network operator before any lift.** Where clearances cannot be maintained, the lift does not proceed until services are de-energised, insulated or relocated. |
| ☐ | 5 Administrative | Operator holds the applicable high risk work licence class; dogging/rigging carried out by a licensed dogger or rigger. Licence numbers recorded in Part 3. |
| ☐ | 5 Administrative | Single nominated spotter with agreed hand signals; one person directing the lift. |
| ☐ | 5 Administrative | Stop-work wind limit per the crane operator's stated limit, recorded in Part 3. |
| ☐ | 5 Administrative | Reversing and traffic movements on site directed by a spotter; delivery route agreed at pre-start. |

**ppe_rules[]** — hard hat **R** *(mandatory whenever a crane is on site)* · hi-vis **R** *(mandatory whenever powered mobile plant is on site)* · safety boots **R** · gloves **R** · eye protection **R**

**monitor_review:** Exclusion zone verified immediately before each lift. Licences sighted at first attendance and recorded. Reviewed on change of plant, load or site layout.
**responsible:** INSTALL/VERIFY — *[Site Supervisor]* + plant operator · USE — all persons on site
**source_refs:** S-02, S-09, S-11, S-25, S-42
**review_status:** DRAFT · **approver:** *[PENDING]*
**gap flag:** The superseded SWMS listed a crane in the body but not in Plant & Equipment, and stated no exclusion zone dimension, no lift plan and no powerline check.

---

### H-08 · Structural alteration or repair requiring temporary support to prevent collapse

| Field | Value |
|---|---|
| activity | Propping and needling during renovation/extension — removing or altering load-bearing walls, inserting beams, opening up structure |
| hazard | Partial or total structural collapse; prop failure; overloading; struck by falling material |
| is_HRCW | **yes** — reg 291, structural alterations or repairs requiring temporary support to prevent collapse |
| trigger | Any work where temporary support is required to prevent collapse of an existing structure |

**control_options[]**

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 1 Eliminate | Sequence redesigned by the structural engineer so no temporary support is required. |
| ☐ | 4 Engineering | **Propping designed and documented by a structural engineer for this specific structure**, including prop capacity, spacing, load path to a suitable bearing, and removal sequence. Design attached to the pack. |
| ☐ | 4 Engineering | Engineered proprietary propping system erected strictly per the manufacturer's method and layout. No site-fabricated props. |
| ☐ | 4 Engineering | Load path verified to a competent bearing surface; sole plates and head plates as specified; props plumb and pinned. |
| ☐ | 4 Engineering | Exclusion zone below and around the supported structure for the duration of the works. |
| ☐ | 5 Administrative | Competent person inspects and signs off the propping **before** any load-bearing element is removed, and again before props are struck. |
| ☐ | 5 Administrative | Movement monitoring — visual check and recorded observation at each pre-start while props are in place; stated trigger for evacuation (any observed movement, cracking or prop deflection). |
| ☐ | 5 Administrative | Removal sequence documented and followed in reverse of installation. |

**ppe_rules[]** — hard hat **R** · safety boots **R** · eye protection **R** · gloves **R** · P2 respirator **C** *(mandatory if masonry cutting/drilling — see T-01)* · hi-vis **C**

**monitor_review:** Competent-person sign-off recorded in Part 3 before removal and before striking. Daily movement check recorded.
**responsible:** INSTALL/VERIFY — *[Site Supervisor]* + engineer/competent person · USE — crew
**source_refs:** S-02 (reg 291), S-11, S-25, S-31
**review_status:** DRAFT · **approver:** *[PENDING]*
**note:** The superseded SWMS's "PROPPING FRAMES" section addressed **formwork/loading platforms**, not temporary structural support. These are different HRCW concepts and must not share a module.

---

### H-09 · Demolition of a load-bearing element

| Field | Value |
|---|---|
| activity | Removing a load-bearing wall, beam, column or other element related to structural integrity |
| hazard | Uncontrolled collapse; struck by falling material; services within the element |
| is_HRCW | **yes** — reg 291, demolition of a load-bearing element or one otherwise related to structural integrity |
| trigger | Any removal of an element that carries load or contributes to structural integrity |

**control_options[]**

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 4 Engineering | Temporary support installed and signed off per **H-08 before any removal begins**. |
| ☐ | 4 Engineering | Services within or adjacent to the element identified, isolated and proved dead before removal (see H-11). |
| ☐ | 3 Isolate | Exclusion zone established; unauthorised persons and occupants excluded. Adjoining occupied areas sealed. |
| ☐ | 5 Administrative | Removal sequence documented — top-down, in controlled sections, no undermining. |
| ☐ | 5 Administrative | Asbestos status confirmed per **H-10 before any disturbance**. |
| ☐ | 5 Administrative | Material lowered, not dropped; debris removal route and skip position agreed. |

**ppe_rules[]** — hard hat **R** · safety boots **R** · eye protection **R** · gloves **R** · P2 respirator **R** *(demolition dust)* · hearing protection **C**

**monitor_review:** Support sign-off and service isolation confirmed before each removal stage. Reviewed on any unexpected structural finding.
**responsible:** INSTALL/VERIFY — *[Site Supervisor]* · USE — crew
**source_refs:** S-02, S-08, S-11, S-25
**review_status:** DRAFT · **approver:** *[PENDING]*

---

### H-10 · Disturbance of asbestos

| Field | Value |
|---|---|
| activity | Any renovation, demolition, drilling, cutting or removal in a structure that may contain asbestos |
| hazard | Release of and exposure to airborne asbestos fibre |
| is_HRCW | **yes** — reg 291, work that involves or is likely to involve the disturbance of asbestos |
| trigger | **Any work on a structure built before 2004**, or where asbestos-containing material is identified or suspected |

**control_options[]**

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 1 Eliminate | Asbestos register obtained and reviewed; work scope adjusted so no ACM is disturbed. |
| ☐ | 1 Eliminate | Licensed asbestos removalist engaged to remove ACM **before** carpentry commences; clearance certificate obtained and attached. |
| ☐ | 5 Administrative | Where a structure predates 2004 and no register exists, a competent person inspects and, where required, samples before work starts. **Unidentified material is treated as asbestos until proven otherwise.** |
| ☐ | 5 Administrative | **STOP-WORK RULE:** any suspected ACM encountered unexpectedly → stop immediately, leave the material undisturbed, isolate the area, notify the supervisor and principal contractor. Work does not resume until cleared in writing. |
| ☐ | 5 Administrative | Blue Leaf carpentry crew do **not** remove asbestos. No exceptions. |

**ppe_rules[]** — governed by the licensed removalist's control plan; Blue Leaf crew are excluded from the area during removal · P2 minimum **R** on re-entry only after clearance

**monitor_review:** Register/clearance sighted before mobilisation and recorded in Part 3. Reviewed on any unexpected material find.
**responsible:** INSTALL/VERIFY — *[Site Supervisor]* · USE — all crew
**source_refs:** S-02, S-08, S-11, S-23
**review_status:** DRAFT · **approver:** *[PENDING]*

---

### H-11 · Work on or near energised electrical installations and services

| Field | Value |
|---|---|
| activity | Framing, fixing, drilling or lifting near overhead lines, consumer mains, in-wall wiring, or buried services |
| hazard | Electrocution; arc flash; service strike |
| is_HRCW | **yes** — reg 291, work carried out on or near energised electrical installations or services |
| trigger | Overhead lines within reach of plant, ladders or long materials; live wiring in the work zone; underground services in the work path |

**control_options[]**

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 1 Eliminate | Supply de-energised, isolated, locked and tagged, and proved dead by a licensed electrician before work commences. |
| ☐ | 1 Eliminate | Overhead service relocated or undergrounded by the network operator prior to works. |
| ☐ | 3 Isolate | Overhead lines insulated/tiger-tailed by the network operator; **no-go clearance distances confirmed with the network operator and physically marked on site**. |
| ☐ | 4 Engineering | Underground services located by DBYD enquiry plus on-site electronic location and, where required, hand-dug potholing before any penetration. |
| ☐ | 4 Engineering | Cable detection scan of walls and floors before drilling or nailing into existing structure. |
| ☐ | 5 Administrative | Dedicated spotter for any plant, ladder or long material movement within the approach zone. |
| ☐ | 5 Administrative | Height of load and boom controlled; no material carried vertically near lines. |
| ☐ | 5 Administrative | Blue Leaf crew perform **no electrical work**. Licensed electrician only. |

**ppe_rules[]** — safety boots **R** · eye protection **R** · hard hat **C** · gloves **R** *(non-conductive where working near live services)* · hi-vis **C**

**monitor_review:** Isolation/clearance confirmed before each shift where the trigger is live. Reviewed on any change of plant position or work zone.
**responsible:** INSTALL/VERIFY — *[Site Supervisor]* · USE — crew
**source_refs:** S-02, S-09, S-11, S-42
**review_status:** DRAFT · **approver:** *[PENDING]*
**gap flag:** The superseded SWMS controlled *tool* electrical safety only (test/tag + RCD). The reg 291 category — work near energised services — was listed in the unticked menu and controlled nowhere.

---

### H-12 · Work on, in or adjacent to a road, footpath or traffic corridor in use

| Field | Value |
|---|---|
| activity | Deliveries, craning, material handling and set-out on a street frontage or over a public footpath |
| hazard | Struck by vehicle; public struck by materials or plant; pedestrian conflict |
| is_HRCW | **yes** — reg 291, work carried out on, in or adjacent to a road or other traffic corridor in use |
| trigger | Any part of the work, plant or exclusion zone extends onto or over a road, footpath or shared corridor |

**control_options[]**

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 1 Eliminate | All deliveries and lifts staged fully within the site boundary. |
| ☐ | 3 Isolate | Council permit obtained for footpath/road occupation; approved traffic management plan implemented; pedestrian detour with continuous barriers. |
| ☐ | 4 Engineering | Physical barriers between the public and the work zone — not tape alone. |
| ☐ | 5 Administrative | Traffic controller present for vehicle entry/exit where the TMP requires it. |
| ☐ | 5 Administrative | Deliveries scheduled outside school drop-off and peak pedestrian periods. |

**ppe_rules[]** — hi-vis **R** · hard hat **C** · safety boots **R**

**monitor_review:** Permit and TMP validity checked before each delivery day. Reviewed on change of site access.
**responsible:** INSTALL/VERIFY — *[Site Supervisor]* / principal contractor · USE — crew
**source_refs:** S-02, S-11, S-25
**review_status:** DRAFT · **approver:** *[PENDING]*

---

### H-13 · Trench or shaft with excavated depth greater than 1.5 m

| Field | Value |
|---|---|
| activity | Work in or near an excavation — pier holes, service trenches, footings |
| hazard | Ground collapse; engulfment; fall into excavation |
| is_HRCW | **yes** — reg 291, work in or near a shaft or trench with an excavated depth greater than 1.5 m |
| trigger | Excavation deeper than 1.5 m in the work area. **Trigger-only for standard carpentry — normally N/A.** |

**control_options[]**

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 1 Eliminate | Carpentry scheduled after excavations are backfilled or permanently protected. |
| ☐ | 3 Isolate | Excavation guardrailed or covered; no carpentry work within the zone of influence of the excavation face. |
| ☐ | 4 Engineering | Benching, battering or shoring designed by a competent person where entry is required. |
| ☐ | 5 Administrative | Blue Leaf carpentry crew do not enter excavations deeper than 1.5 m. Excavation work is out of scope. |

**ppe_rules[]** — hard hat **R** · hi-vis **R** · safety boots **R**

**monitor_review:** Excavation status confirmed at pre-start where present.
**responsible:** INSTALL/VERIFY — *[Site Supervisor]* · USE — crew
**source_refs:** S-02, S-11
**review_status:** DRAFT · **approver:** *[PENDING]*

---

### H-14 · High-risk processing of a crystalline silica substance *(boundary module)*

| Field | Value |
|---|---|
| activity | Cutting, grinding, drilling, sanding or trimming any material containing ≥1% crystalline silica, where the processing is assessed as **high risk** |
| hazard | Respirable crystalline silica → silicosis, lung cancer, chronic kidney disease, autoimmune conditions |
| is_HRCW | **boundary — see decision note** |
| trigger | Written risk assessment determines the processing is high risk, **or** the assessment cannot determine it (in which case it is treated as high risk until determined otherwise) |

**Decision note for the WHS reviewer (conflict CF-02):** where high-risk CSS processing is also HRCW, a separate silica risk control plan is not required **provided** a SWMS is prepared before processing starts and that SWMS satisfies the SRCP content requirements. Two lawful paths:

- **Path A (recommended)** — standalone **Silica Risk Control Plan** attached to the pack. Keeps Part 1 focused on fall and collapse risk. Consistent with SafeWork SA's warning against diluting the SWMS.
- **Path B** — fold SRCP content into Part 1. Fewer documents, but Part 1 grows and the SRCP content requirements must be satisfied in full.

**control_options[]** — see **T-01** for the hierarchy. Additional duties where processing is high risk:

| ☐ | Control |
|---|---|
| ☐ | Written risk assessment completed and retained, assessing the specific processing, the form and proportion of crystalline silica, frequency and duration of exposure, whether airborne RCS is likely to exceed half the workplace exposure standard, and any prior monitoring results. **The assessment must disregard PPE and administrative controls when determining whether processing is high risk.** |
| ☐ | Silica risk control plan (Path A) or SRCP-compliant SWMS content (Path B) in place before processing starts. |
| ☐ | Silica training completed by every worker involved, from an approved course. Training records retained. |
| ☐ | Air monitoring for RCS conducted; exceedances of the workplace exposure standard reported to the regulator. |
| ☐ | Health monitoring provided for all workers carrying out high-risk processing. |

**ppe_rules[]** — P2 respirator minimum, fit-tested **R** · eye protection **R** · safety boots **R** · gloves **S** · hearing protection **S**

**monitor_review:** Assessment reviewed on any change of material, tool, or work location. Health and air monitoring per the plan.
**responsible:** INSTALL/VERIFY — *[Site Supervisor]* + WHS reviewer · USE — crew
**source_refs:** S-05, S-19, S-29, S-40, S-23
**review_status:** DRAFT — **PATH DECISION REQUIRED** · **approver:** *[PENDING]*

---

# PART 2 — TASK-CONTROL MODULES (non-HRCW)

> These are kept **visually and structurally separate** from Part 1. They are not diluted into the SWMS.

---

### T-01 · Crystalline silica — cutting and drilling fibre cement, AAC, masonry, tile

**is_HRCW:** no *(escalates to H-14 if assessed high risk)* · **trigger:** any cutting, grinding, drilling, sanding or trimming of a material containing ≥1% crystalline silica — fibre cement sheet and cladding, AAC, cement products, bricks, pavers, mortar, tiles

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 1 Eliminate | Components ordered pre-cut to size by the supplier; no site processing. |
| ☐ | 2 Substitute | Score-and-snap or shears used instead of powered cutting. Dust-reducing blades specified. |
| ☐ | 2 Substitute | Non-silica alternative product specified at design stage. |
| ☐ | 3 Isolate | Designated outdoor cutting station, downwind, away from the crew and site boundary; no cutting inside the building envelope. |
| ☐ | 4 Engineering | **On-tool dust extraction with an H-class vacuum**, correctly fitted and emptied per manufacturer instructions. |
| ☐ | 4 Engineering | Wet suppression / water-fed cutting with slurry managed and not allowed to dry and re-aerosolise. |
| ☐ | 5 Administrative | Dry sweeping and compressed-air blow-down of silica dust **prohibited**. H-class vacuum or wet methods only. |
| ☐ | 5 Administrative | Exposure duration limited; other workers excluded from the cutting station. |
| ☐ | 5 Administrative | SDS obtained for every silica-containing product and held with the pack. |
| ☐ | 6 PPE | P2 (or higher) respirator, **fit-tested**, worn by the operator and anyone within the cutting zone. Clean-shaven for tight-fitting RPE. |

**ppe_rules[]** — P2 respirator **R** · eye protection **R** · safety boots **R** · hearing protection **S** · gloves **S**
**monitor_review:** Extraction/vacuum function checked before each use. Written CSS risk assessment reviewed on any change of product or tool.
**responsible:** INSTALL/VERIFY — *[Site Supervisor]* · USE — operator
**source_refs:** S-05, S-10, S-19, S-29, S-40 · **review_status:** DRAFT

---

### T-02 · Timber and MDF dust

**is_HRCW:** no · **trigger:** any sawing, routing, sanding or machining of timber, MDF, particleboard or LVL

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 1 Eliminate | Components pre-machined off site. |
| ☐ | 3 Isolate | Cutting station located outdoors and downwind; second-fix machining done in a ventilated area, not an enclosed room. |
| ☐ | 4 Engineering | On-tool dust extraction fitted to saws, routers and sanders, connected to an appropriate class vacuum. |
| ☐ | 5 Administrative | Clean-up by vacuum, not dry sweeping or blow-down. |
| ☐ | 5 Administrative | SDS obtained for MDF and engineered products (formaldehyde). |
| ☐ | 6 PPE | P2 respirator when machining MDF or producing visible dust. |

**ppe_rules[]** — eye protection **R** · P2 respirator **C** *(mandatory for MDF machining and any visible dust)* · hearing protection **R** · safety boots **R** · gloves **S**
**monitor_review:** Extraction checked at pre-start. **source_refs:** S-10, S-40 · **review_status:** DRAFT

---

### T-03 · Nail guns and powder-actuated tools

**is_HRCW:** no · **trigger:** any use of pneumatic, gas or powder-actuated fixing tools

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 2 Substitute | Sequential-trip (single-shot) trigger fitted in place of contact-trip for all framing work. |
| ☐ | 4 Engineering | Compressor pressure set to the manufacturer's stated pressure for the tool and fastener; regulator checked at pre-start. |
| ☐ | 4 Engineering | Tool inspected before use — safety contact tip functional, no bypassed or taped-off guards. A tool with a defeated safety is removed from service and tagged. |
| ☐ | 5 Administrative | Only workers who have received documented instruction on that specific tool may use it. |
| ☐ | 5 Administrative | Firing line control — never fire toward another person; no hand within the fastener path; check what is behind the member before firing. |
| ☐ | 5 Administrative | Other trades warned before firing commences in a shared area; area cleared of unauthorised persons. |
| ☐ | 5 Administrative | Tool disconnected from air/gas before clearing a jam, changing fasteners or leaving it unattended. |
| ☐ | 6 PPE | Eye and hearing protection worn by the operator and anyone in the immediate area. |

**ppe_rules[]** — eye protection **R** · hearing protection **R** · safety boots **R** · gloves **S** · hard hat **C**
**monitor_review:** Pre-start tool check recorded. Any defeated safety is a reportable event. **source_refs:** S-22 · **review_status:** DRAFT

---

### T-04 · Circular saws, drop saws and portable power tools

**is_HRCW:** no · **trigger:** any use of portable powered cutting tools

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 2 Substitute | Battery tools used in place of leads where practical, removing trailing-lead and electrical risk. |
| ☐ | 4 Engineering | Guards fitted, functional and never wedged, tied back or removed. Retracting guard checked to close freely at pre-start. |
| ☐ | 4 Engineering | Riving knife fitted where the tool is designed for one. |
| ☐ | 4 Engineering | Correct blade for the material, undamaged, correctly seated with the retaining washer torqued. |
| ☐ | 5 Administrative | Tool isolated (unplugged or battery removed) before blade change or adjustment. |
| ☐ | 5 Administrative | **No freehand cutting.** All material clamped or securely supported on stands before cutting. |
| ☐ | 5 Administrative | Only trained and competent workers operate the tool. |
| ☐ | 6 PPE | Eye and hearing protection; no loose clothing, no gloves in rotating-blade tasks where entanglement is a risk. |

**ppe_rules[]** — eye protection **R** · hearing protection **R** · safety boots **R** · P2 respirator **C** *(silica or MDF — see T-01/T-02)* · gloves **N/A** *(prohibited at rotating blades)*
**monitor_review:** Pre-start tool inspection recorded. **source_refs:** S-22 · **review_status:** DRAFT

---

### T-05 · Site electrical safety — leads, RCDs and test and tag

**is_HRCW:** no · **trigger:** any use of 240 V tools or extension leads on site

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 2 Substitute | Battery tools used in preference to 240 V leads. |
| ☐ | 4 Engineering | All 240 V supply through an RCD; RCD push-button tested at each site set-up and result recorded. |
| ☐ | 4 Engineering | Leads and tools inspected, tested and tagged to AS/NZS 3760 at the interval required by AS/NZS 3012 for construction sites. Untagged or out-of-date equipment is quarantined. |
| ☐ | 4 Engineering | Leads run off the ground on hooks or stands, clear of traffic, water and sharp edges; no leads across access ways or through doorways without protection. |
| ☐ | 5 Administrative | Damaged leads or tools tagged **OUT OF SERVICE** and removed from site — not repaired on site by unlicensed persons. |

**ppe_rules[]** — safety boots **R** · eye protection **R**
**monitor_review:** RCD test at site set-up and monthly; tag currency checked at pre-start. **source_refs:** S-37, S-38 · **review_status:** DRAFT

---

### T-06 · Hazardous manual tasks

**is_HRCW:** no · **trigger:** handling frames, trusses, beams, sheets, or any repeated/sustained/awkward handling

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 1 Eliminate | Materials delivered and placed by plant directly at the point of use; no manual carry. |
| ☐ | 2 Substitute | Smaller sheet sizes or lighter product specified; frames broken into shorter sections. |
| ☐ | 4 Engineering | Mechanical aids used — telehandler, panel lifter, sheet trolley, beam dolly, gin wheel. **Nominated aid for this job recorded in Part 3.** |
| ☐ | 4 Engineering | Material stored at waist height on stands; no repeated lifting from ground level. |
| ☐ | 5 Administrative | Team lift with a stated crew number and a nominated caller for defined loads. Loads and crew numbers listed in Part 3, not left to judgement. |
| ☐ | 5 Administrative | Task rotation and rest breaks for sustained overhead or repetitive work. |
| ☐ | 5 Administrative | Workers trained in the specific handling techniques for the loads on this job. |

**ppe_rules[]** — gloves **R** · safety boots **R** · eye protection **R** · hi-vis **C**
**monitor_review:** Supervisor observes handling method at pre-start and after any complaint of discomfort. Any reported discomfort triggers module review.
**source_refs:** S-07, S-21, S-27 · **review_status:** DRAFT
**note:** replaces the superseded wording *"Team lifts and mechanical lifting devices to be used where possible."*

---

### T-07 · Hazardous noise

**is_HRCW:** no · **trigger:** any use of saws, nail guns, compressors or plant, or working alongside noisy trades

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 2 Substitute | Lower-noise tools and compressors specified at purchase/hire. |
| ☐ | 3 Isolate | Compressor and generator sited away from the work area; cutting station separated from the crew. |
| ☐ | 4 Engineering | Tools maintained — blunt blades and worn bearings raise noise output. |
| ☐ | 5 Administrative | Noisy tasks scheduled to limit the number of workers exposed and the duration of exposure. |
| ☐ | 6 PPE | Hearing protection selected for the correct attenuation class for the measured or estimated noise level, per AS/NZS 1270. |
| ☐ | 6 PPE | **Where hearing protection is relied on as a control, audiometric testing is provided to affected workers.** |

**ppe_rules[]** — hearing protection **R** *(class selected per AS/NZS 1270)* · eye protection **R**
**monitor_review:** Exposure reviewed on change of tool or work area. Audiometric testing status tracked centrally.
**source_refs:** S-06, S-28, S-39 · **review_status:** DRAFT
**gap flag:** superseded SWMS controlled noise with PPE only and made no reference to audiometric testing.

---

### T-08 · Ladders and step platforms

**is_HRCW:** no *(escalates to Part 1 if fall risk exceeds 2 m)* · **trigger:** any ladder or step platform use

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 1 Eliminate | Work carried out from the ground with extension poles or by re-sequencing. |
| ☐ | 2 Substitute | **Mobile scaffold, platform ladder or EWP used in place of a leaning ladder.** Ladders are for access, not as a work platform. |
| ☐ | 4 Engineering | Industrial-rated ladder (minimum 120 kg), inspected before use; defective ladders tagged **DO NOT USE** and removed from site. |
| ☐ | 4 Engineering | Ladder set at **1:4**, on firm level ground, extending at least 1 m above the landing, top and bottom secured. |
| ☐ | 5 Administrative | Three points of contact maintained at all times. *(A harness is **not** a point of contact.)* |
| ☐ | 5 Administrative | No tools carried in hands while climbing; tool belt or hoist line used. |
| ☐ | 5 Administrative | No overreaching — belt buckle stays within the stiles. |
| ☐ | 5 Administrative | Second person foots the ladder where it cannot be tied off. |
| ☐ | 5 Administrative | **No power tool use from a leaning ladder.** |

**ppe_rules[]** — safety boots **R** · hi-vis **C** · hard hat **C**
**monitor_review:** Ladder condition checked at pre-start. **source_refs:** S-36, S-24, S-26 · **review_status:** DRAFT

---

### T-09 · Deliveries, unloading and material storage

**is_HRCW:** no *(escalates to H-07 where powered mobile plant is involved)* · **trigger:** any material delivery to site

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 3 Isolate | Designated laydown area clear of access ways, edges and the crane swing zone; exclusion zone during unloading. |
| ☐ | 4 Engineering | Truss and frame stacks on level bearers, restrained against toppling, height limited to a stated maximum. |
| ☐ | 4 Engineering | Sheet material stored flat or in a rack — not leaned against a wall or frame. |
| ☐ | 5 Administrative | Delivery scheduled so trusses are loaded in erection order (supports H-03). |
| ☐ | 5 Administrative | Straps released only from a position clear of the load's fall path. |
| ☐ | 5 Administrative | Access ways and egress routes kept clear at all times. |

**ppe_rules[]** — hi-vis **R** · safety boots **R** · gloves **R** · hard hat **C**
**monitor_review:** Laydown condition checked at each delivery. **source_refs:** S-09, S-15, S-20 · **review_status:** DRAFT

---

### T-10 · Housekeeping, access and egress

**is_HRCW:** no · **trigger:** every day, every job

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 3 Isolate | Designated waste bin and off-cut stockpile clear of the work area and access routes. |
| ☐ | 4 Engineering | Defined, maintained access and egress route to every work level; scaffold stairs or a secured ladder access, not climbing the frame. |
| ☐ | 5 Administrative | Work area cleared of off-cuts, straps, packaging and trailing leads progressively — not only at end of day. |
| ☐ | 5 Administrative | Protruding nails removed or bent over immediately. |
| ☐ | 5 Administrative | End-of-day clean-down and site secured against unauthorised entry. |

**ppe_rules[]** — safety boots **R** · gloves **R** · eye protection **R**
**monitor_review:** End-of-day walk recorded. **source_refs:** S-20 · **review_status:** DRAFT

---

### T-11 · UV, heat and adverse weather

**is_HRCW:** no · **trigger:** outdoor work; forecast temperature or wind exceeding stated limits

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 1 Eliminate | Work rescheduled out of extreme heat or high wind. |
| ☐ | 3 Isolate | Shade structure over fixed work positions; shaded break area provided. |
| ☐ | 5 Administrative | **Stated stop-work limits recorded in Part 3** — heat threshold, wind speed for work at height and for lifting, rain/frost limit for roof and joist work. Not "when weather is suitable". |
| ☐ | 5 Administrative | Work rescheduled to earlier start in hot weather; heavy tasks moved to the cooler part of the day. |
| ☐ | 5 Administrative | Scheduled rest breaks; cool drinking water available at the work area, not only at the vehicle. |
| ☐ | 5 Administrative | Heat-illness recognition briefed; buddy check during extreme heat. |
| ☐ | 6 PPE | Wide-brim hat or hard-hat brim attachment, rated sunglasses, SPF 50+ sunscreen applied 20 minutes before exposure and reapplied 2-hourly, long sleeves. |

**ppe_rules[]** — sun protection **R** *(outdoor work)* · rated sunglasses **R** · long sleeves **R**
**monitor_review:** Forecast checked at pre-start; conditions re-checked at any noticeable change. **source_refs:** S-01 (s19) · **review_status:** DRAFT

---

### T-12 · Hazardous chemicals — adhesives, sealants, foams, primers, treated timber

**is_HRCW:** no · **trigger:** any use of construction chemicals or handling of preservative-treated timber

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 2 Substitute | Low-VOC / water-based product specified in place of solvent-based. |
| ☐ | 3 Isolate | Application in ventilated areas; enclosed spaces mechanically ventilated during and after application. |
| ☐ | 5 Administrative | **SDS obtained for every chemical on site and held with the pack** — the "nil" entry on the superseded SWMS is not acceptable. Chemical register maintained. |
| ☐ | 5 Administrative | Products stored in labelled original containers, out of sun, away from ignition sources. |
| ☐ | 5 Administrative | Treated timber (LOSP/CCA/H3+) — no burning of off-cuts, no sanding without extraction, wash hands before eating. |
| ☐ | 6 PPE | PPE selected per the SDS for each product, not generically. |

**ppe_rules[]** — gloves **R** *(chemical-resistant type per SDS)* · eye protection **R** · respirator **C** *(per SDS)* · long sleeves **S**
**monitor_review:** Register reconciled to products on site monthly. **source_refs:** S-10 · **review_status:** DRAFT

---

### T-13 · Scaffold interface — using scaffold erected by others

**is_HRCW:** no *(the fall risk it controls is HRCW — this module governs the interface)* · **trigger:** any use of scaffold on site

| ☐ | Lvl | Control |
|---|---|---|
| ☐ | 4 Engineering | **Handover certificate received and scaffold tag inspected before first use.** No access to an untagged, red-tagged or incomplete scaffold. |
| ☐ | 4 Engineering | Deck complete, guardrails and toeboards in place, gap between deck and structure within tolerance or infilled, safe access provided. |
| ☐ | 5 Administrative | **Blue Leaf crew do not alter, move, remove or add to any scaffold component.** Any change requested through the supervisor to the licensed scaffolder. Removing a guardrail to pass material is prohibited. |
| ☐ | 5 Administrative | Scaffold visually checked at each pre-start and re-inspected after any impact, alteration or severe weather; tag currency confirmed. |
| ☐ | 5 Administrative | Loading limits observed; materials not stockpiled on the deck beyond the rated duty. |

**ppe_rules[]** — safety boots **R** · hi-vis **C** · hard hat **C**
**monitor_review:** Tag date and condition recorded at pre-start. Red tag = immediate stop for that area.
**source_refs:** S-18, S-34, S-35 · **review_status:** DRAFT
**gap flag:** scaffold appears nowhere in the superseded SWMS.

---

### T-14 · Site-wide PPE baseline and conditional matrix

**is_HRCW:** no · **trigger:** every job

| Item | Status | Condition |
|---|---|---|
| Safety boots (lace-up, steel/composite cap) | **R** | All persons, all times, on site |
| Eye protection | **R** | All cutting, fixing, nailing, demolition, overhead work |
| Hi-vis upper body | **C → R** | **Mandatory whenever powered mobile plant or heavy machinery is on site** |
| Hard hat | **C → R** | **Mandatory whenever a crane is on site**, when working below others, and during demolition |
| Hearing protection (AS/NZS 1270 class per exposure) | **C → R** | Mandatory for saws, nail guns, compressors, and when working near noisy trades |
| P2 respirator, fit-tested | **C → R** | **Mandatory for all silica processing (T-01)** and MDF machining (T-02); per SDS for chemicals (T-12) |
| Gloves | **R / N/A** | Required for timber, sheet and chemical handling. **Not to be worn at rotating blades.** |
| Sun protection (hat, rated sunglasses, SPF 50+, long sleeves) | **R** | All outdoor work |
| Full-body harness + lanyard | **C** | Only where a restraint or arrest option has been **selected** in H-01 to H-05, with anchor and rescue arrangements recorded |
| Knee pads | **S** | Sustained kneeling — flooring, second fix |

**Rule:** PPE is the **last** control, never the first. Any module where PPE is the only selected control requires written justification in Part 3 and reviewer approval.
**monitor_review:** PPE condition checked at pre-start; RPE fit-test currency tracked centrally.
**source_refs:** S-02, S-11, S-39, S-40 · **review_status:** DRAFT

---

## Module index

| Module | Part | is_HRCW | Present in superseded SWMS? |
|---|---|---|---|
| H-01 Floor framing falls | 1 | yes | **No — missing** |
| H-02 Wall frame erection falls | 1 | yes | Partial (no scaffold, conditional wording) |
| H-03 Truss erection falls | 1 | yes | Partial (3 m threshold, PPE-only, no 1.5 m rule) |
| H-04 Battens / roof frame / fascia falls | 1 | yes | **No — missing** |
| H-05 Cladding falls | 1 | yes | **No — missing** |
| H-06 Voids and openings | 1 | yes | Free text on p.14 only |
| H-07 Powered mobile plant | 1 | yes | Partial (no lift plan, no exclusion dimension, no powerline check) |
| H-08 Temporary structural support | 1 | yes | **Conflated with formwork propping** |
| H-09 Load-bearing demolition | 1 | yes | **No — menu item only** |
| H-10 Asbestos | 1 | yes | **No — menu item only** |
| H-11 Energised electrical services | 1 | yes | **No — tool safety only** |
| H-12 Road / traffic corridor | 1 | yes | **No — menu item only** |
| H-13 Trench >1.5 m | 1 | yes | **No — menu item only** |
| H-14 High-risk CSS processing | boundary | boundary | **No — entirely absent** |
| T-01 Silica processing | 2 | no | **No — entirely absent** |
| T-02 Timber / MDF dust | 2 | no | Partial ("filtered face mask") |
| T-03 Nail guns | 2 | no | Yes — retained and strengthened |
| T-04 Circular saw / power tools | 2 | no | Yes — retained and strengthened |
| T-05 Site electrical | 2 | no | Yes — retained, correct standards |
| T-06 Manual tasks | 2 | no | Partial (conditional wording) |
| T-07 Noise | 2 | no | Partial (PPE only, no audiometry) |
| T-08 Ladders | 2 | no | Yes — retained, corrected |
| T-09 Deliveries and storage | 2 | no | **No — missing** |
| T-10 Housekeeping / access | 2 | no | Yes — retained |
| T-11 UV, heat, weather | 2 | no | Partial (no stated limits) |
| T-12 Hazardous chemicals | 2 | no | **No — "SDS: nil"** |
| T-13 Scaffold interface | 2 | no | **No — entirely absent** |
| T-14 PPE matrix | 2 | no | Icons only, no conditions |

---

*All modules DRAFT. No module may be issued to site until approved by a competent WHS reviewer.*
