# Floor supports and the engineering package: plan

Date: 22 Nov 2026. Status: plan, awaiting Sam's go. No code yet.
Inputs: Sam's floor frame notes (22 Nov, Blythewood level 2 screenshot), the engineering brief Sam pasted, and the earlier
plan `docs/takeoff/FRAMING_LAYOUT_DOCS_FEASIBILITY.md` (branch `takeoff/layout-docs-plan`). The reference job in the brief is
not named here.

## 1. Where the takeoff stands (traced against the code)

One workflow, followed from the drawing element to the order line: **a window in a lower wall**.

| Step | What happens today | Kept, bridged by the user, or lost |
|---|---|---|
| Wall traced on the plan | A wall record on one plan page, its own calibration, centreline-framed (`dispatch.js`, `junctions.js`) | Kept |
| Opening drawn on the wall | Opening record, parented to the wall | Kept |
| What the wall carries | **"Above these walls" on the Walls item** (Roof / Floor + roof / Engineer) plus a per-wall "Carries the roof" switch | **Bridged by the user**: the Hub does not know where the floor trusses actually bear |
| Lintel size | Opening rules size the lintel from the MGP10 / SmartLVL 13 tables for that load case (`openingRules.js`, `standards/`) | Kept, but the load case is the user's answer, not the actual reaction |
| Floor trusses above | Floor frame item on the level-2 page: trusses span **outline edge to outline edge**; beams only on outline edges and stair voids (`floor/geometry.js`) | **Lost**: the floor does not know the walls below, so a truss reaction never reaches the wall or its lintel |
| Order line | Lintel, studs, plates on the order with `sourceRefs` back to the wall and opening | Kept |

The same break shows up in the screenshot: the walls below are a different page, the floor cannot see them, so it can't put supports,
spans or beams where the structure really is. The engineering brief's "follow the load" test fails at exactly this link.

What already holds: one shared engine recomputes **everything** from the saved facts on every change (`computeWorkspace`), so a
change to one fact already reaches every result that is computed from it. What's missing is the facts that join the levels.

## 2. Decision: how the structure is represented

**A derived structure graph, built inside the shared engine on every calculation, from the takeoff's own records.** No new
database tables in the first phases; the only new saved facts are the ones a person decides (which walls bear, where a beam goes,
how the pages line up, a supplier's issued reactions).

- **Elements**: walls (by level), openings, floor truss runs, beams, posts, stair voids, later roof supports.
- **Links**: "bears on" (truss run → wall / beam / post), each with its position along the receiving element.
- **Load records** on a link: value, units, direction, load case, and **where it came from**: *read* (from an issued
  supplier sheet), *calculated* (by the Hub, with the rule and table), *assumed* (estimator assumption, a named constant marked
  "confirm"), or *awaiting*. Missing capacity or an unknown support never counts as zero or as a pass.
- **Checks** (one question about one element, as in the brief): applies to, relied on, decided, status
  (checked / failed / outside scope / awaiting). They extend the engine's existing `problems` and `explain` lines rather than
  replacing them, so the current UI keeps working.

Why derived rather than stored: the Hub already recomputes the whole job in milliseconds, and a derived graph cannot go stale.
"What changed since the last issue" then becomes a diff of two snapshots, which also covers the brief's revision tests.

Where the calculations live: **in the Hub's `shared/takeoff/standards`**, next to the span tables that are already live. The
earlier plan put bracing in Bestimator; the Hub has since taken the table work in-house, so this keeps one engine. Bestimator's
bracing and uplift work is used as reference material, not as a dependency.

## 3. First build: the floor frame knows its supports (phases 1 and 2)

### Phase 1: line up the levels and show the walls below (about 3 days)

1. **Line up two pages once per job.** On the floor frame page, *Line up with the floor below*: tap the same two grid points
   (e.g. grid C/2 and G/5) on the ground floor page and on this page. Saved as a page-to-page transform. Grid bubbles are on
   every set Sam has shown, so this is two taps per page. Vector snap makes the taps exact.
2. **Underlay**: the lower Walls item's walls drawn faint on the floor page.
3. **Load-bearing walls, proposed by the Hub, confirmed with one tap each.** Proposed: every external wall, plus internal walls
   running across the trusses (more than 45° to them) at least 1.2 m long and not over a void. Sam taps a wall to untick or
   tick it. Saved on the wall as `bearsFloor` (true / false), which also replaces the "Above these walls" guess for that wall:
   a wall that bears the floor is "Floor + roof", one that doesn't is "Roof" (the item setting stays as the fallback).

### Phase 2: supports, spans, beams and the Select tool (about 5 to 6 days)

1. **Supports**: every truss line is cut by the support lines under it: outline edges with a wall or beam, confirmed
   load-bearing walls, and internal beams. The spans between supports are worked out per truss.
2. **Longest trusses first (Sam: maximise truss lengths).** A truss runs **continuous over internal supports** and is only
   broken at a void, at a beam it hangs off, or where it would exceed the longest length the supplier will make (a named
   constant, Sam to confirm). A break always lands on a support. The truss schedule then shows, per mark, the length and **its
   supports with positions** (the supplier needs this to design it; it is the same shape as the issued truss sheets, e.g. three
   bearings at a beam, an internal wall and a steel support).
3. **Span check**: a clear span between supports over the guide's indicative limit for the depth is flagged ("needs a support or
   a deeper truss"), never silently passed.
4. **Internal beams**: drawn with the Line tool on the floor page. **Beam ends snap to the load-bearing points below**:
   wall lines, wall ends and corners from the underlay, and posts. A beam end over an opening in the wall below is refused with
   the reason, or allowed with a flag that the lintel there takes a point load.
5. **Beam sizes**: Auto from the SmartLVL 13 floor bearer table already used for stair beams, with the floor load width taken
   from the truss spans either side; a size picked by hand wins. Outside the table → Engineer, no size counted.
6. **Point loads passed down**: each beam end, and each truss bearing on a lower wall, becomes a load record on that wall at
   its position. Over an opening it goes to that opening's lintel and jambs, which are re-sized for it or marked "Engineer".
   This is the first real cross-storey link.
7. **Select tool on the floor frame**: tap a beam to select it; drag its ends (they re-snap to bearings) or the whole beam;
   delete it; tap a truss run to see its supports and spans. Same Select and handles as Walls, one undo per change.

Onsite simplicity: nothing new to tap on site. The line-up and the load-bearing ticks are office steps, done once.

## 4. The engineering package: sequence after phase 2

Each phase prints something useful and orders correctly before the next starts. Calculated structural results are marked
"indicative, pending sign-off" until a named person signs them; the Hub will not issue a pack for construction with an unsigned
structural result.

| Phase | What | Why here |
|---|---|---|
| 3 | **Supplier truss sheets**: file the floor (and later roof) truss details per job; read marks, bearings and reactions (assisted, confirmed by a person); match each bearing to a Hub support. Flags: a bearing with no matching support, a support the design doesn't use, a moved support (the brief's "move FT7's middle bearing" test). Reactions are kept per load case, never added across cases, and never applied on top of the area load they came from | Replaces the Hub's estimated loads with issued ones where they exist |
| 4 | **Wind class**: one job fact from a short AS4055 wizard (region, terrain, shielding, topography), with source and a change log, printed on every sheet | Every later check reads it |
| 5 | **Bracing**: demand per storey and direction (AS1684 section 8), eligible wall segments from the traced walls and openings, the user places panels (or accepts a suggestion), capacity and distribution checks, end restraint. Panels already placed with Add bracing become brace marks with a type | Brace marks exist today without kN |
| 6 | **Tie-downs per interface**: roof to wall, upper wall to floor, floor to lower wall, to the slab; uplift load width from the truss sheets (or the roof module later); connector per location, counted by instance into the order | Needs 3 and 4 |
| 7 | **Layout pack and issue control**: lower wall, floor, upper wall sheets with marks; bracing report; tie-down schedule; title block with project, level, revision, issue status; **"changed since last issue"** (affected sheets, members and order lines, additions and surplus) | Presentation on top of 1 to 6 |
| later | Roof truss layouts and loose roof members; cladding set-out sheets per elevation (the cladding takeoff already counts sheets, battens and flashings) | |

Purchasing rules stay where they are: installed quantities are worked out first, and pack sizes and stock lengths apply at the
order step only, so changing a pack size never changes a design result (already true for nails, clouts, plates and noggins).

## 5. Questions for Sam (only what changes the build)

1. **Longest floor truss** you'd order (transport and fabrication)? The Blythewood order has 15.17 m.
2. **Clear span** you're happy with for a 400 deep truss before you want a support, or should the Hub use the Pryda guide's
   indicative figure?
3. **Ground floor first**: is the ground floor Walls item always traced before the floor frame, on its own page? (Phase 1 needs
   the walls below to exist.)
4. **Line-up**: OK to tap two matching grid points on each page once per job?

## 6. Done since this plan was asked for

- **Hebel panel count** (Blythewood ~25 high): the control joints across the trusses were evenly spaced, so every stretch between
  joints ended in a cut panel whose offcut was too short to reuse. Joints now go on the whole-panel grid (every 5,400), even spacing
  is kept only where it lays fewer panels, and each row's first panel is tried at every truss multiple. An 11.7 x 15.14 m test
  floor at 450 went from 186 to 175 panels packed. Commit `2f985ce`, local.
