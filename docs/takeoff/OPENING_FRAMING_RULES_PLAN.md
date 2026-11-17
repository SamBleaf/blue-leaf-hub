# Opening framing rules for the Walls screen: plan (no build)

Date: 17 Nov 2026. Author: planner. Status: PLAN ONLY. Nothing here is built, committed or run.
Repo: /Users/samuelmorris/Desktop/blh-takeoff-walls.nosync (HEAD 56a8bc5 at time of sweep).

Rules this plan serves: the takeoff must be simple onsite (fewest taps, plain English) AND accurate; do not rebuild what exists; never guess silently.

Related plan: WET_WALLS_AND_CAVITY_DOORS_PLAN.md was **not on disk** when this was written. This plan therefore carries the two earlier features itself (section 4.6 and 5.4) and defines the field names. If that plan is written later, this plan wins on field names and data model (it is the superset and the engine seam is shared); that plan wins on any screen wording it has already agreed with Sam. Reconcile before building either.

Copyright note: AS 1684 tables are Standards Australia material. This plan names table numbers, inputs and where Sam's extracts live. It contains no table values. Table numbers are per Bestimator's transcription of the 2006 Supplement 4 (N1/N2, MGP10); the 2021 edition renumbered some tables, so every number below is "as in Bestimator's data files".

---

## 1. What already exists

| # | Asset | Path | Covers | Reuse decision |
|---|---|---|---|---|
| 1 | Lintel span tables T17 (sheet, single/upper), T18 (tile, single/upper), T47 (sheet, lower), T48 (tile, lower). MGP10, N1/N2, verified cell by cell, cited with page | Bestimator.nosync/scope agent ai/src/standards/data/lintels-mgp10.ts | Timber lintel size from clear span, roof mass, roof load width (RLW), rafter spacing | **Reuse as-is (port data)**. Do not re-transcribe |
| 2 | Jamb stud table T11 (max opening width by roof mass x RLW, config x jamb height). Single/upper storey only | .../src/standards/data/jamb-studs-mgp10.ts + select-jamb.ts | Number of jamb studs per side by opening width, wall height, RLW | **Reuse as-is (port data)** |
| 3 | Wall stud tables T7 / T36 | .../data/studs-mgp10.ts + select-stud.ts | Is the common stud adequate | Not needed for openings. Defer |
| 4 | Selector core, fail-closed scope gate, outcome contract (ACCEPTED / REVIEW_REQUIRED / ENGINEER_REQUIRED) | .../src/standards/select.ts, select-gated.ts, applicability.ts, contracts.ts | Generic cited lookup, wind class N1/N2 gate, beyond-table goes to engineer | **Reuse as-is (port code, ~300 lines JS)** |
| 5 | selectLintelEngineered | .../src/quantities/framing/lintel-select.ts | End to end lintel pick incl. RLW from roof spans | **Reuse the logic**. Note Bestimator itself does not call it from its opening assembly (only tests do) |
| 6 | sizing.ts jambCountForOpening, sizeLintel | .../src/quantities/framing/sizing.ts | Load-context pattern | Port the pattern. In Bestimator the jamb check is advisory only; in the Hub it will drive the count |
| 7 | Load context and RLW helper (RLW = half the sum of adjacent roof spans + overhang; C-class hard stop; seed 3000 flagged) | .../src/quantities/loads/ | Inputs model | Port the shape. **Drop the 3000 seed**: Hub shows "needs roof info" instead |
| 8 | wall-top-plate.ts (point load over a stud = single plate; out of coincidence = double plate) | .../src/quantities/framing/wall-top-plate.ts | Nearest thing to a concentrated-load response | Port (35 lines). Hub already defaults to a double top plate, so low value alone |
| 9 | wall-openings.ts openingFraming (lintel, head/sill trimmer, cripples, packers) | .../src/quantities/framing/wall-openings.ts | The assembly as geometry | **Reference only**. Coupled to Bestimator's plan-point model; head/sill trimmer and packer rules do not reconcile to V2E (about 3x over-count); head trimmer sits directly under the lintel; 150 mm cripple allowance is a seed; negative-length packer defect (BESTIMATOR_FULL_REPOSITORY_REVIEW P0.2). Do not copy as truth |
| 10 | Rule register and definitions | Bestimator docs/design/member-knowledge-base.md, framing-engineering-backbone.md, TAKEOFF_RECIPE_MAP.md | Roles, equations, anti-overfit rules, calibration gaps | Reference. Status lines about typed tables in the knowledge base are stale; src/standards/README.md is current |
| 11 | Sam's own AS 1684.2 extracts, one PDF per grade, folders for N1N2 / N3 / N4 / Cyclonic (two identical copies; about 90 PDFs each) | ~/Documents/AS 1684 Span Tables/ (copy: ~/Documents/Carpentry:Building/AS 1684 Span Tables). MGP10 N1/N2 file: Non-cyclonic/N1N2/MGP10.PDF | Source for any new table (lower-storey jambs, concentrated-load tables, other grades, N3/N4) | Source of truth. Not opened by this plan (dataless). Use one copy |
| 12 | SmartLVL13 design guide PDFs (Downloads; 6 identical copies) | ~/Downloads/SmartLVL13-Design-Guide-E1-2021.pdf | LVL lintel/beam tables beyond the timber table | Source for the LVL phase. Manufacturer copyright |
| 13 | TAFE SA notes on using AS 1684 span tables | ~/Documents/TafeSA/Timber Frame Designs/resourses/AS1684_Using_Span_Tables.pdf | Plain-English lookup method | Reference for wording/question order. Not opened |
| 14 | Real takeoffs (ground truth) | Drive: 80 A FISHER ST TAKE OFF; TAKEOFF TEMPLATE; 4 Caire Street Wall Frame Takeoff F01 | Template lists jamb studs, head/sill trimmers, lintels, packers, window linings. Fisher shows Sam's actual choices (LVL E10 jambs, few trimmers, lintels 190x45 to 300x45 LVL13). Caire is the "before" picture: lintels TBC, trimmers absent | Fisher = calibration fixture (n=1). Template = target line list. Caire = regression "before" |
| 15 | Third-party schedule: Adept Timber Design wall sheets (2021 edition): studs to openings graded by lintel width; 450 centres to wet areas | Drive, Adept Stonyfell / Joslin PDFs | Cross-check for jamb counts and the 450 wet-area rule | Sanity check only. Do not redistribute |
| 16 | Hub counting engine: openingFraming, explicitMember, framedStations, computeStudWall, `extras` | shared/takeoff/engine/timber.js (about 583-940) | Counts members from an `opening.detail` object: belowSill/aboveHead cripples at the wall's stud stations, plus explicit members with length rules | **Reuse unchanged**: the rule layer emits a normal `detail`. No engine rewrite |
| 17 | runWallFraming (Walls item) | shared/takeoff/engine/dispatch.js:358-518 (openings mapped ~420-425) | Wires walls and openings; builds the "isn't counted" note | The plug-in point |
| 18 | Walls spec defaults | shared/takeoff/engine/families.js (600 centres, WALL_STUDS_EACH_SIDE=2, part defaults, timber grid) | Item-level inputs | Extend with item-level load inputs |
| 19 | Manual FramingDetail editor | src/components/takeoff/WallsScreen.jsx:889-1025 (mounted ~2134) | Per-opening manual members | **Keep as the override**. Manual always wins |
| 20 | Server whitelist for openings and detail | server/lib/takeoff/takeoffService.mjs:243-246, 290-310 | What may be stored | Must be extended (section 5.2) |
| 21 | Job facts: storeys, roof_structure_type, roof_type | server/lib/jobFactRegistry.mjs:56-67 | Possible pre-fill for roof inputs | Not wired into takeoff today; optional pre-fill, never silent |
| 22 | Hub span-table stub resolveSizing (explicitly null) and ADR-001 exclusion of span tables | timber.js:283-300; docs/takeoff/ADR-001-hub-takeoff.md:30 | The "never size structurally" stance | ADR-001 needs a short amendment (section 6) |

### Answer to Sam: what from your earlier work can be used

- **Use as-is (port, don't redo):** the lintel tables T17/T18/T47/T48; the jamb table T11; the selector and fail-closed scope-gate code; the load-context idea (wind class, roof mass, RLW). These are your verified work: transcribed by script from your own PDF, checked cell by cell, with tests.
- **Needs porting (small):** the Bestimator code is TypeScript and the Hub is JavaScript. Mechanical, about 300 lines of code plus the data files. The bigger job is the inputs: the Hub has nowhere to hold roof type, roof load width, wind class or "does this wall carry the roof". That is new Hub UI, not table work.
- **Exists but not trustworthy yet:** the Bestimator opening assembly (head/sill trimmer and packer rules do not match your real takeoffs; Fisher shows only a handful of trimmers across the whole house). We take the member list and the guards, not the rules.
- **Genuinely missing everywhere:** (a) concentrated-load tables (stud pack, lintel under a point load: the extractor misaligns on them, so they were never typed); (b) lower-storey jamb table; (c) LVL lintel tables (your real lintels are often LVL13, which the timber table cannot size); (d) N3/N4 and other grades; (e) a rule for a user-placed point load; (f) any real validation beyond one house (Fisher). Concentrated load, LVL and lower storey are therefore later phases, and until then the Hub says "needs engineer or supplier size" rather than inventing a number.

No separate rule engine, spreadsheet or repo exists outside Bestimator and the Hub. The "other projects" are Bestimator (and its doc copies in the Hub audit folders).

---

## 2. Why the screenshot wall shows no window framing today

The Walls screen only counts opening framing (jacks, sill, head, lintel) when someone has filled in a "framing detail" form for that opening. Sam's rule from the last release was "never fill in lintel or jack sizes with stock defaults", so with nothing entered the engine counts only the plain studs, plates and noggins and adds a small note, "Lintels, jacks and trimmers at W1 aren't counted", which is easy to miss. The five studs are the two end studs plus two beside each end of the window, with the six studs that would have stood in the window removed. The engine can already place short studs under and above a window at the wall's centres, but only after that form is filled in. So nothing is broken; there is simply no rule that fills the form in automatically, and no roof or load information to base one on.

---

## 3. Recommended approach

**Pick: "map the span tables", but hidden behind a schedule.** Port the two verified tables (lintel and jamb) as a small versioned data module with a selector, and show the result to the user as a plain "lintel and jambs by opening width" answer for the roof the user told us about. No hand-built Blue Leaf table of numbers.

Why not a new Blue Leaf standard schedule keyed by width:
- Accuracy: a hand schedule is a second copy of numbers that must be checked against the standard. The checked data already exists. Pre-computing a schedule from it adds nothing the selector cannot do live, and a new unverified table is exactly the risk Sam flagged on the previous release.
- Clicks: identical. The user answers a handful of roof questions once either way; width comes from the opening they already drew.
- A schedule is still useful as a **sign-off artefact**: generate a one-page printout of "opening width -> lintel size, jambs per side" for each common roof (sheet/tile, a few RLW steps) from the data, so Sam can eyeball and sign it (section 6). That gives him the simplicity of a schedule without maintaining one.

**Material gate (added by completeness review).** The tables are for sawn MGP10 members. The Hub's own families.js comments record Sam's usual spec as studs 90x35 LVL Smart 10 H2, noggins 90x35 MGP10, plates 90x45 MGP10 (or LVL). Jamb studs and lintels in the table are therefore only valid when the item's stud and jamb stock is MGP10 sawn timber of a section the table has. If the item says LVL (or any grade/section not in the table), the outcome is "Not covered by timber table: enter jamb count and lintel (supplier span tables)", never a lookup. So the card (4.1) must carry stud material/section, read from the item's existing part spec where it is already entered (0 taps), and the selector input includes grade and breadth (35 vs 45) as well as roof inputs. This may make the table path rarely apply on Sam's own jobs; that is why Phase 1 (geometry with section to enter) is the main value and Phase 4 (LVL tables) matters more than the order suggests (owner question 3).

Behaviour rules that keep it accurate:
1. Lintel size and jamb count come only from a cited table row for the inputs the user gave. The member shows its source ("AS 1684.2 N1/N2 Supp 4 (2006), T17, MGP10").
2. Outside the table (wider span, heavier roof, wind class not N1/N2, lower storey not yet typed): the outcome is "Beyond timber table. Enter lintel size (LVL or engineered)". The cut length and bearing are still computed; only the section is asked for. Never a guessed size.
3. Missing input: "Needs roof info" on the opening; nothing sized.
4. Manual detail on an opening overrides everything.
5. The material is MGP10 timber. Where Sam actually orders LVL (E10 jambs, LVL13 lintels), the count/size rule is still valid as a minimum check; the bought product stays his choice (item default or typed). See owner question 3.

---

## 4. Minimal-click UX

Principle: ask once, at the level that is true for many walls; placing an opening adds zero extra taps in the common case.

### 4.1 Asked once per Walls item ("Roof and loads" card, collapsed under item setup)
Four chips, about 4 taps total, reused by every wall in the item:
1. **Do these walls carry the roof?** Yes / No. (Item-level; per-wall exceptions via select tools, 4.5.) One tap.
2. **Roof covering:** Sheet / Tile. One tap.
3. **Roof width this wall carries (RLW):** chips from the table's own columns, plus "Not sure" (leaves openings as "needs roof info"). One tap. Helper text: "about half the roof span, plus the eaves".
4. **Rafter/truss spacing:** chips taken from the table's own columns (confirm the exact set from the data file when porting; do not assume). One tap.
Also on the card, pre-filled from the job only if known and shown as pre-filled, never hidden: storeys (single/upper vs lower) and wind class (N1/N2 supported; others show "needs engineer"). If the job record has them, 0 taps; otherwise 2 more.

Reality check on who answers: RLW is a design number an onsite carpenter often does not know. Offer an alternative input "Roof span across the house (m) and eaves (mm)" that computes RLW (half span + eave), still one entry, and allow RLW per wall as an override because one item-level figure is wrong for gable-end versus side walls. Rule: the item figure is the largest the walls carry (conservative); a smaller per-wall figure is a deliberate entry. If most items sit at "Not sure", sizing never lights up; the geometry phase still delivers value.

Stud material/section (see the material gate in section 3) is read from the item's part spec, not asked again. Wall "carries roof" must not default silently; where the wall record already says external/internal, suggest (not apply) external = Yes and show it as a pre-filled chip.

No roof info entered = the card shows "Needs roof info" and the Walls line says so (4.4). Items for internal non-loadbearing walls set "No" and need nothing else (no lintel needed; see 5.1).

### 4.2 When you place a window or door (no extra taps)
Framing appears automatically on the wall elevation and in the wall line:
- **Kings and jacks** beside the opening. Today's 2 studs each side are re-expressed as 1 king (full height) + jacks; jacks per side = the table count for loadbearing walls, minimum 1 (so counts never fall below today's).
- **Lintel** (loadbearing): size from the table, shown as "190 x 45 MGP10 from T17" style, with cut length (opening + bearing).
- **Head trimmer** (non-loadbearing wall, or where no lintel) and **sill trimmer** (windows with a sill).
- **Cripples under the sill and above the head at the wall's own centres** (600 or 450, whatever that wall uses). Stub shorter than a minimum length is not cut (lintel or trimmer covers it).
- **Warnings in plain English**, e.g. "Lintel is 190 deep but only 100 mm is free above the head. Lower the window or confirm a lintel in the top plate."
- Each member row has a "from rule" tag; tapping the opening's existing sheet gets "Edit framing" which opens today's manual form pre-filled with the rule's members (one tap to take over).

### 4.3 Cavity slider and full height (in + Doors / + Windows)
- **Cavity slider** button (1 tap): the width field becomes "Door size" (default 920); the opening is stored as 2 x door + 20 = 1,860 (920 -> 1,860 as Sam specified). The lintel and jambs are sized on 1,860. Shows "Opening 1,860". The pocket sits inside that width, so no extra wall length; but the cavity unit (kit) usually brings its own track, head and pocket jambs. Unknown whether Sam counts framing members for the pocket separately from the kit (owner question 6); until answered, show jambs/lintel as normal and add a line "Cavity unit supplied separately: check kit jambs" rather than guess. Head height for a slider is the door height plus kit clearance; the schedule value is used, not a default.
- **Full height** toggle (1 tap): opening height = wall height and sill 0; follows later wall-height edits. In a loadbearing wall this triggers "Full-height opening in a loadbearing wall needs an engineered beam: enter size" (no table covers it). In a non-loadbearing wall: no head, lintel or cripples above; plate runs over.

### 4.4 When an input is missing
Per opening a chip: "Needs roof info" / "Needs wall: carries roof?" / "Beyond table: enter lintel" / "Lintel won't fit". The Walls line becomes e.g. "Walls: 5 studs at 2,700 mm ... Lintels: 1 of 1 not sized (needs roof info)". Quantity status stays "incomplete" until each lintel is sized or entered. Never a silent default.

### 4.5 Select tools: wet areas and carries-roof (the earlier request)
In the wall select tools add two bulk actions on the selected walls:
- **Wet area: 450 centres** (sets `wall.centresMm = 450`, shows a "wet" tag). Taps: select the walls (already needed) + 1 + confirm = 2 beyond selection.
- **Carries roof / Doesn't carry** (sets `wall.loadBearing`), same cost. This is the per-wall override to the item default.
Rule inheritance: wall value wins over item value; item over job. Cripples and noggins above/below openings use the wall's centres.

### 4.6 Concentrated load point (later phase)
A "Load point" tool in the wall's + menu: tap on the wall at the position (or enter distance from start), choose what it is (girder truss / beam / post above), optional reaction. Taps: about 3. Output: a stud pack at that point (count must be chosen, "Needs engineer/supplier reaction" if unknown: no default), top plate confirmed double (reuse top-plate coincidence), and if the point falls over an opening: the lintel goes to "Beyond table: enter lintel" because the concentrated-load lintel tables are not typed. The marker draws on the elevation. Sizing is not attempted until the tables are transcribed from Sam's extracts (phase 5).

---

## 5. Engine and data changes (Hub)

### 5.1 Rule semantics (summary table, no standard values)
| Case | Kings / jacks | Head | Lintel | Sill | Cripples | 
|---|---|---|---|---|---|
| Window, loadbearing | 1 king + jacks per T11 (min 1; verify first whether T11's count already includes the adjacent full-height stud, see section 6 item 6) | via lintel | T17/18 (single/upper); lower storey: T47/48 later | sill trimmer (pending owner question 3) | below sill; above head if gap >= minimum after lintel depth | 
| Window, non-loadbearing | 1 king + 1 jack | head trimmer | none | sill trimmer | as above |
| Door, loadbearing | as window | via lintel | table | none | above head only |
| Door, non-loadbearing | 1 king + 1 jack | head trimmer | none | none | above head only |
| Cavity slider | rough opening = 2 x leaf + 20, treated as a door on that width | same | same, on rough opening | none | above head |
| Full height, non-loadbearing | 2 per side (jamb fixing), no head | none | none | none | none |
| Full height, loadbearing | n/a | none | **blocked: engineered beam, enter size** | none | none |

Roles: king = full-height stud beside the jack; jack = under the lintel/head, length = head level; cripple, trimmer, lintel as today's role names. The rule layer must not add kings on top of today's side studs: when rules are active it sets the side-stud count to 1 king per side (engine already merges a side stud closer than a stud thickness to a wall end) and emits jacks as members. Net full-height stud count unchanged where the table says 1 jack.

### 5.2 Files and fields
New (pure, no I/O):
- `shared/takeoff/standards/as1684/lintels.json` and `jambs.json`: typed tables ported from Bestimator data (generated by script from the Bestimator `.ts`, with a recorded hash of the source file and a parity test). Header records edition (AS 1684.2 N1/N2 Supp 4, 2006), grade MGP10, table numbers, pages, source PDF path, extraction date. Hub repo is private; Sam to approve shipping a typed copy (question 1).
- `shared/takeoff/standards/as1684/select.js`: selectLintel, selectJambs with the fail-closed gate (wind N1/N2 only; storey; roof mass; span and RLW within table), returns `{outcome, section, depthMm, plies, tableRef, reasons}`.
- `shared/takeoff/engine/openingRules.js`: `expandOpeningDetail({opening, wall, itemCtx}) -> {detail | null, status, provenance, warnings}`. Emits the existing `detail` shape: `source:'reviewed-detail'` with `ref` = table row; `belowSill/aboveHead {required, deductionMm}`; `members[]` with role and length basis (headLevel, sillLevel, openingWidth + addMm). Lintel/head trimmer may carry a different section, so extend the server cleaner to persist the engine's existing `identity/stock` fields for rule-sourced members (today only `sameAsStud:true` persists; section 5.5 of sweep).
Changed:
- `dispatch.js` `runWallFraming` (~420-425): per opening, `detail` present = manual (unchanged); else call `expandOpeningDetail` when item context exists; else behave as today (plus a more specific note).
- `families.js`: item fields `carriesRoof`, `roofMass`, `rlwMm`, `rafterSpacingMm`, `storeys`, `windClass` (all nullable; null means "needs input"). Wall: `centresMm` (override), `loadBearing` (override). Opening: `style:'cavity'`, `leafMm`, `fullHeight`.
- `takeoffService.mjs` whitelists (opening ~243-246, wall ~225-232, item inputs): add the fields above; extend `cleanOpeningDetail` for rule provenance and member section.
- `tools.js` wallFramingTotals/wallFramingText: add lintel and trimmer counts to the Walls line (today detail members are not in the line).
- `WallsScreen.jsx` / `FamilySetup.jsx`: Roof and loads card; chips on openings; cavity/full-height controls in + Doors/+ Windows; select-tool actions; elevation drawing of jacks, lintel, sill (WallElevation has none).
Back-compat: existing walls/openings with manual `detail` are untouched. Existing items with no roof inputs behave exactly as today (counts unchanged) with a clearer note, so no saved takeoff silently changes. Rule output only appears once the user answers the card. Wall-level `centresMm` null = item value (today).

### 5.3 Worked example: Sam's wall (3,955 x 2,700, W1 3,430 x 600, sill 2,000, from start 450)
Conventions: today's Walls convention (stud cut = wall height, plates not deducted, levels from stud base); 600 centres; 35 mm stud/trimmer thickness (default 90x35); opening occupies 450-3,880; head = 2,000 + 600 = 2,600. Counting arithmetic is by hand, to be confirmed by one unit run in phase 1.
- Today: 5 studs (ends at 0 and 3,955 + two each side; the right-hand side studs merge into the end stud, 75 mm away). Six grid studs (600, 1,200, 1,800, 2,400, 3,000, 3,600) are removed.
- Rule layer (wall carries roof, inputs given): 
  - Full-height studs, 2,700: end 0, left king, end 3,955 (doubles as the right king, because the opening ends 75 mm from the wall end) = 3.
  - Jacks: n per side from T11 for opening width 3,430, jamb height 2,700 and the job's roof (n unknown until roof inputs are given; minimum 1). Length 2,600 each. With n = 1: 2 jacks.
  - Lintel: cut = 3,430 + 2 x bearing (bearing per the standard; confirm against Sam's extract). Size decided by T17 (sheet) or T18 (tile) for span 3,430 at the job's RLW/spacing; **very likely beyond the timber table at normal roof widths, so the screen would say "Beyond table: enter lintel (LVL/engineered)"**.
  - Head trimmer: none (lintel carries the head).
  - Sill trimmer: 1 x 3,430 (between jacks).
  - Cripples below the sill: 6 x 1,965 (2,000 minus 35 sill trimmer) at the grid stations inside the opening (600 ... 3,600). Caveat: this holds only if the 2,000 sill is measured from stud base; if from finished floor, subtract the bottom plate (about 45) and the figure changes (Q5). Also, today's "5 studs" is 3 full-height ends/kings plus side studs after the merge; the plan's 3 + 2 jacks equals 5 only when n = 1.
  - Cripples above the head: none (only 100 mm free).
  - **Warning: "Head is 100 mm below the wall top; no lintel of this span will fit. Lower the window, or confirm the lintel sits in the top plate."** This alone is a finding Sam can act on before buying timber.
  - Wall line becomes: studs, jacks, sill trimmer, cripples, plates, noggins, lintel "not sized: beyond table".
- 920 cavity slider (rough opening 1,860), illustration only: assume head 2,100 and a table lintel depth LD; position-independent counts except cripple stations. Kings 2 x 2,700 (unless merging with a wall end); jacks n/side x 2,100; lintel 1,860 + bearing, sized at span 1,860 by the table (or "needs roof info"); no sill; above-head cripples at the centres, length 2,700 - 2,100 - LD (none if below the minimum stub); no head trimmer (lintel); noggins skip the opening as today.
- Full-height 820 door, non-loadbearing wall: 2 x 2,700 each side (4), no head, lintel, cripples; top plate runs over. Loadbearing wall: blocked, "Full-height opening in a loadbearing wall needs an engineered beam: enter size".

---

## 6. Accuracy plan and release blockers

Verification:
1. **Data parity**: script generates the Hub JSON from Bestimator's typed tables; a test fails if the hash or any cell differs. Spot-check a handful of cells against Sam's PDF extract (MGP10 N1N2) by eye, recorded in the PR.
2. **Ported unit tests**: lintel-select (accept, engineer beyond table, bigger RLW gives bigger size, fail-closed on missing wind class, tile table), select-jamb (all rows), top-plate coincidence.
3. **Engine tests**: rule layer produces an identical detail object to a hand-entered one for the same members; manual detail wins; no kings double-counted; counts never fall below today's for the owner wall; negative or sub-minimum stubs never emitted (the Bestimator packer defect as a regression test).
4. **Real-job calibration**: use the 80A Fisher takeoff (jamb studs 16 at 3.6 m; trimmers 6 at 3.0 m; lintels 190x45, 240x45, 300x45 LVL13) with its opening schedule from the Bestimator corpus; compare rule output and list differences for Sam. Expect trimmers to over-count (rule: sill trimmer only where cripples exist; head trimmer only in non-loadbearing walls) and LVL to be "enter". Only n=1: report, do not tune the rules to fit. Second house wanted (question 5).
5. **Sam signs a one-page generated schedule** (width -> lintel, jambs per side) for sheet and tile at the common RLW steps. Record "signed, date, edition" in the data header.
6. **Jamb-count meaning (must check before Phase 2):** open T11 in Sam's extract and confirm what its stated count covers (jack studs only, or including the adjacent full-height stud) and the stud sizes/grades it applies to. The kings-plus-jacks model in 5.1 assumes jacks only. If the count includes the full-height stud, jacks = count minus 1 and "today's 2 per side is the floor" must be re-read. Wrong either way over- or under-counts every opening.
7. **Edge cases to test:** two openings close enough to share a jamb or king (count once); opening within a stud width of a wall end, corner or T-junction (existing merge rule, plus junction studs); opening wider than the jamb table's limit (engineer); noggin rows: confirm the engine continues noggins between cripples above the head and below the sill (and nothing floats in the opening itself); sill/head heights measured from floor versus stud base (see Q5: a plate-thickness difference changes cripple lengths); opening heights above wall height or sill above head rejected.
8. Edition: tables are 2006 Supp 4; Adept sheets cite 2021. The Hub shows the edition on every rule-sourced member. Sam to decide acceptable for quoting (question 4).

Release blockers (do not ship if any is true):
- A lintel size shown without a table row/provenance, or from a default roof input.
- Any silent default for roof mass, RLW, spacing, wind class or loadbearing.
- Wind class other than N1/N2, or lower storey, producing a size instead of "needs engineer/enter".
- Manual detail overridden by a rule.
- A previously saved wall changing counts without the user answering the card.
- Concentrated-load or full-height loadbearing cases producing a size.
- Data parity test failing, or Sam's schedule sign-off missing.
- ADR-001 not amended (it excludes span tables; amend to "cited tables, fail-closed, edition recorded").

---

## 7. Phased build (smallest first)

| Phase | What | Needs tables? | Notes |
|---|---|---|---|
| 0 | Wording: replace "aren't counted" with a visible chip and Walls-line text "W1 needs head, sill, jacks, lintel". Plus the earlier features that need no rules: **wet walls 450 bulk** (`wall.centresMm`, whitelist, resolveWall override, select-tool action), **cavity slider** (width = 2 x leaf + 20) and **full height** toggle (stored fields, geometry only) | No | Small, immediately useful, low risk |
| 1 | Rule expander for geometry only: kings, jacks, sill trimmer, head trimmer (non-loadbearing), cripples under/above at the wall's centres, lintel **cut length with section to enter**, "doesn't fit" warnings, wall-level loadBearing, elevation drawing, Walls line totals. Manual still wins | No | Delivers most of what Sam saw missing, with no engineering claims. Includes Fisher comparison run |
| 2 | Port tables + selector; "Roof and loads" card; lintel size and jamb count from T17/18 and T11 (single/upper, N1/N2, MGP10) with provenance and fail-closed states | Yes (existing data) | Sign-off schedule, ADR amendment, SOP |
| 3 | Concentrated-load point marker: top plate check, stud pack count entered, lintel-under-load goes to "enter" | No new | Reuses wall-top-plate |
| 4 | Lower storey (T47/T48 already typed; T40-42 jambs to transcribe), N3/N4, other grades, LVL13 lintel tables, notched/internal studs as needed | Extract from Sam's PDFs / SmartLVL guide | Each added table gets the same parity + sign-off |
| 5 | Concentrated-load tables (stud pack, lintel under point load): tuned extractor, then selector | Yes (new) | Only if Sam wants sizing rather than "engineer/supplier" |

Tests per phase: as section 6, added incrementally; each phase adds its cases to the existing scripts/tests/takeoff-tc-*.test.mjs set (not run in this planning step). Visual check on iPhone: tap counts as in section 4.

SOP updates (20-08_timber_takeoff.md): Walls section lines ~156 and ~300-310 (opening rules, "never guessed" wording, centres and double top plate), the walls journey ~437-496 (add Roof and loads card, cavity slider, full height, wet walls, load point), a new subsection "What a rule-sourced member means and how to override". Also add to docs/takeoff a short ADR-002 for the rule layer and the table provenance.

---

## 8. Owner questions (kept to five; each has a default)

1. **Ship a typed copy of the lintel and jamb tables inside the (private) Hub?** They are your licensed extracts. Default: yes, with a header recording edition, source and your sign-off; otherwise the Hub would reference the Bestimator file, which is awkward to deploy.
2. **Kings and jacks:** default 1 king (full height) plus table jacks per side (minimum 1) for loadbearing; 1 king + 1 jack for non-loadbearing. Today's 2 per side is the floor. OK?
3. **Lintels you actually order are often LVL.** Default: where the timber table cannot size it, the screen asks for the lintel section (typed once per opening) and still counts length and bearing, until LVL tables are added in phase 4. Also, trimmers (the plan's rule table and 4.2 currently emit a sill trimmer on every window and a head trimmer on non-loadbearing walls; Bestimator over-counts these about 3x against V2E, and Fisher shows few): which is right on your jobs? Default until you answer: emit them, tagged "rule, unconfirmed", and show the count difference in the Fisher comparison. Also note your studs are normally 90x35 LVL, which the timber table does not cover (see the material gate in section 3): do you want the table path at all before LVL tables exist?
6. **Cavity sliders and full height:** does your framing count include extra pocket jambs/head for a cavity slider, or does the cavity kit supply them? And for full-height non-loadbearing openings, is 2 studs per side right (this plan assumes it, it is not from a table)? Default: kit-supplied, 2 per side, both flagged for confirmation.
4. **Table edition:** the verified tables are 2006 Supp 4; your engineers (Adept) quote the 2021 edition. Default: use 2006 and label it on every member, re-extract 2021 later if you want. Acceptable for quoting?
5. **Wall height convention:** the Walls screen cuts studs at wall height with plates not deducted (your earlier ruling), so head and cripple lengths here are measured the same way. Default: keep it and state it on the schedule. And do you have a second house with a real takeoff and opening schedule for calibration besides 80A Fisher? Default: report on Fisher only.
