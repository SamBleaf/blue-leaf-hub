# HUB 031: "Loads above" in the Walls takeoff (plan only, no code)

**Status:** PLAN. Written 18 Nov 2026 on branch `takeoff/loads-above-plan` at `9f35e32` (same as `origin/main`). Nothing built. Answer section 10 (each question has a default) and the build can start.
**Owner:** Sam. **Owner rule:** the takeoff must be simple onsite. Fewest taps, plain English, advanced detail hidden, phone and iPad first, 44 px targets. Anything Sam didn't ask for goes under Later (section 11).
**Related branches (not opened by this plan, check before building):** `takeoff/lintel-position` (lintel in roof frame / floor frame, `8f25858`, worktree `blh-takeoff-lintel.nosync`) and `takeoff/floor-framing` (floor framing P1, `8dd8172`, worktree `blh-floor-plan.nosync`).

---

## SAM'S DECISIONS (18 Nov 2026): these OVERRIDE everything below

Sam answered the questions on 18 Nov. P1 is built on branch `takeoff/lintel-position` and is much smaller than the plan below. Where this section and the rest disagree, this section wins. Dropped from the plan: `tablesConfirmed`, per-wall overrides, per-opening floor width, "Floor only", typed stud sizes, the engineer-list print-out.

1. **One chip row** per Walls item, **Above these walls**: **Roof** (the default for existing items and preselected on new ones; today's sizing) · **Floor + roof** · **Engineer**. Stored `rules.loadsAbove` in `roof | floorRoof | engineer`; absent = roof. Also on the plan's Line panel beside Stud centres and Double top plate.
2. **Floor + roof** (the 2nd storey of Sam's 3-storey job; he accepts the 2-storey tables there): one extra chip row, **Floor width above** (1,800 / 3,600 / 4,800, 3,600 preselected, stored `rules.floorWidthMm`). Each table rounds UP to its own axis, never down; above a table's last column it does not answer. Lintels come from AS 1684.2 N1/N2 Supp 4 MGP10 lower-storey tables T47 (sheet) / T48 (tile). If no MGP10 size spans, it falls back to the SmartLVL 13 lower-storey table `L13-LINTEL-LOWER` (guide p. 23 sheet / p. 24 tile; extracted in e503778) and the card says "MGP10 doesn't span — LVL13". The source line ends "(2-storey tables)". The item's **Lintels from** chip is not used for Floor + roof (pine first, then LVL 13).
3. **Engineer** (the bottom storey): every lintel is typed. Tap the Lintel row, type "290x45" (or "2/240x45" for two pieces), pick MGP10 (default) or LVL13; labelled "per engineer"; the quantity stays incomplete until typed; never guessed. Two taps plus typing.
4. **MGP10 first, then LVL** is Sam's general practice, so on a **Roof** item with Lintels from = Pine MGP10, if no MGP10 size spans (or the wind class is outside the pine tables), the lintel falls back to the SmartLVL 13 single/upper-storey table with the same note. This is a behaviour change (see the SOP changelog and `CALCULATION_VERSION` takeoff-calc@10).
5. **Wind.** N1 and N2 supported (Sam's jobs are N1/N2 now). N3: the MGP10 lower-storey tables are skipped and the SmartLVL 13 lower-storey table is used; N4 and beyond: type the size; the card says why. (A Roof item's existing N3/N4 behaviour is unchanged.)
6. **Out of scope, unchanged:** point loads (girder truss, strut, beam on a lintel). Jamb studs for Floor + roof and Engineer stay at the minimum of 2 each side with a note (lower-storey jamb tables are not ported).
7. A 3-storey house is three Walls items (bottom: Engineer, middle: Floor + roof, top: Roof).

Code map: `shared/takeoff/standards/index.js` (`selectLintel`, `LOADS_ABOVE`, `parseLintelText`), `engine/openingSelectors.js` and `engine/openingRules.js` (typed size labelled per engineer), `src/components/takeoff/FamilySetup.jsx` (`LoadsAboveRows`), `MeasureScreen.jsx` (Line panel), `WallsScreen.jsx` (Lintel box quick entry), `server/lib/takeoff/takeoffService.mjs` (whitelist), tests `scripts/tests/takeoff-tc-loads-above.test.mjs`, SOP 20-08 step 2a and TC-29.

---

## 0. What Sam asked (18 Nov 2026)

> The wall frames I'm working on are under floor joists. We only have a roof setting for the loads above, not a floor setting. It's a 3-storey house, so there is a lot of load above. That affects which walls are load bearing, and the lintel sizes.

## 1. The honest headline

1. **No published table covers a three-storey house.** AS 1684 (N1/N2 extract), SmartLVL13 and Smart10 all stop at "lower storey of a two-storey house": one floor plus roof. (I did not read the AS 1684.2 scope clause; that PDF has no text layer. This is unverified from memory, so the plan treats "engineer" as the answer rather than relying on it.)
2. **For Sam's job:** ground storey = two floors + roof: **engineer, always; the Hub never sizes it** (this includes its studs, see 3.4). Middle storey = one floor + roof and top storey = roof only: the tables' loads match, **but the tables are written for a house of at most two storeys, so a 3-storey house is outside their stated scope (unverified, see point 1).** Until Sam's engineer confirms the tables may be used for the upper two storeys, treat all three storeys as engineer. The Hub records that confirmation as one tap ("Engineer has confirmed table use for this job", stored `rules.tablesConfirmed`); without it, Floor + roof and Roof only on a job marked 3-storey stay "engineer".
3. **The Hub has no floor input at all.** Walls know only the roof (`rules.carriesRoof`, `roofMass`, `rlwMm`, `rafterSpacingMm`, `windClass`, `lintelProduct`). `rules.storey` is read by the selector but nothing in the UI sets it, so every lintel and jamb is sized as single/upper storey. A wall under joists is currently sized as if only the roof sat on it, which is **wrong on the unsafe side** for any wall that really carries a floor.
4. **Part of the data is already in the repo, unused.** AS 1684 N1/N2 Supp 4 T47 (sheet roof) and T48 (tile roof) are the lower-storey lintel tables (MGP10, N1/N2 only), with a floor load width axis. T36 (lower-storey studs) is ported too. `standards/index.js` `storeyGate()` sends anything other than `single_upper` to "engineer", so they are switched off. SmartLVL13 (Sam's default lintel) lower-storey tables are **not extracted**.

## 2. Coverage matrix (what a table can and cannot answer)

"Hub?" = mapped and live today. Table numbers are the guide's own. Source: table audit of the SmartLVL13 E1 2021 guide (68 pp), Smart10 2024 guide (24 pp), and the ported AS 1684 data.

| Case above the wall / lintel | SmartLVL13 lintel | Smart10 (jamb, stud) | AS 1684 MGP10 | Hub today | Plan |
|---|---|---|---|---|---|
| **Roof only** (single storey, top storey) | pp.19-20 N1-N4, pp.21-22 C1-C3 | p.17 N1-N4 (internal fully protected walls) | T17 sheet, T18 tile, N1/N2 | **Yes**: N1-N4 as `L13-LINTEL`, `S10-LINTEL`; MGP10 N1/N2 as T17/T18. C1-C3 refused. | Unchanged. |
| **Floor + roof** (lower storey of two; the middle storey of three) | p.23 N1-N4 and C1: roof width 1500/3000/4500/6000, floor width 1200/2400/3600 | p.18 lintel and p.15 lower-storey studs | **T47 sheet, T48 tile**: roof 1500/4500/7500 by floor 1800/3600/4800, N1/N2 | **No.** T47/T48/T36 data ported but gated off. SmartLVL13 and Smart10 not extracted. | P1: switch on T47/T48 for MGP10 N1/N2. P2: extract SmartLVL13 p.23 and Smart10 p.18. |
| **Floor only** (floor above, no roof on this wall) | not a published lintel case | studs under floor load only (p.15) | not a lintel case | No | P1: engineer typed size (Q2 may allow the safe-side mapping). |
| **Concentrated load** (girder truss, strut, beam landing on the lintel) | no lintel table (hanging/strutting/counter beams size roof members) | p.16 sizes the STUD under a point load only | none | No | Always engineer. Not in scope (later: a flag). |
| **Two floors above** (ground storey of a 3-storey) | none (the "double storey wall" bearer table is a bearer, not a lintel) | none | none | Refused (engineer) | **Engineer, always. Never guess.** |
| **Jamb studs, lower storey** | n/a | p.15 studs; jamb table not extracted | T40-42 look like the lower-storey jamb tables (from headings only, unverified), not ported | Refused | P1: engineer / typed jamb count. P2: extract. |
| **N3/N4 and C1-C3 versions** of T17/T18/T47/T48 | C1-C3 not mapped | not mapped | licensed PDFs on disk (N3, N4, C1 checked), not extracted | wind gate sends to engineer | P2 (extraction). |

Assumption flags to check before trusting a lower-storey table (the guide notes quote 40 kg/m2 upper floor, 30 kg/m2 ground floor, 1.5 kPa live, 37 kg/m2 wall; I did not find a floor-mass note on the lintel tables themselves). A heavy floor (tiles, slab, spa) is outside the tables: engineer.

## 3. The design in plain words

### 3.1 One question on the Walls item: "What is above these walls?"

Chips (item level, set once for the whole Walls item, the way "roof width" chips work today):

| Chip | Plain-words hint | Meaning |
|---|---|---|
| **Roof only** | Top storey, or a single-storey house | Today's behaviour. Default for anything already saved. |
| **Floor + roof** | One floor above, then the roof | Lower storey of two, or the middle storey of three. |
| **Floor only** | A floor above and no roof on these walls | No table covers this (see 5.3). |
| **Engineer** | Two or more floors above, or anything unusual | Typed engineer sizes only. |

3-storey guidance, shown under the chips (one line, only when "Engineer" is chosen or the house is tall): "Top floor walls: Roof only. Middle floor walls: Floor + roof. Ground floor walls carry two floors and the roof: Engineer."

Walls of one item usually share one storey, so one answer covers the item. The first time a Walls item is created the chip is **asked, not defaulted** ("What is above these walls?"); only items saved before this release keep Roof only silently, and show a small "Roof only: confirm" hint until someone taps a chip. A 3-storey house therefore uses **three Walls items** (ground, middle, top), each with its own chip. Walls don't need a "storey" concept beyond this.

**Per-wall override**, the same way wet-area centres work (a Select tool): in Select, one wall's panel gets **Loads above (this wall only)** with the four chips; matching the item's answer deletes the override (same rule as `setWallCarries`). Used for the odd wall, for example a ground-floor wall under a roof-only extension.

### 3.2 Extra inputs, asked only when needed

| Chosen | Asked next | Chips |
|---|---|---|
| Roof only | roof width, roof type, spacing | as today |
| Floor + roof | **floor width carried**, plus roof width, roof type, spacing | floor width chips come from the mapped table: 1800/3600/4800 for T47/T48; 1200/2400/3600 once SmartLVL13 p.23 is mapped. Round **up**, never down (same rule as roof width). Floor width is read from each table's own definition; the SmartLVL13 and AS 1684 axes differ, so a value is never carried across products. |
| Floor only | floor width carried | as above |
| Engineer | nothing | no inputs: the sizes are typed |

Plain-words help for floor width: "Half the joist span above this wall, on each side the joists run onto it, plus any overhang." **One floor width per item is only a default.** Walls in one item differ a lot (a wall at a joist end vs mid-span, or near a stair void), so the default must be the **largest** floor width in the item; per-wall and per-opening values are set by the office, never auto-reduced. Per-opening override of floor width is the same pattern as `loadRlwMm` (a chip inside the lintel box), stored as `loadFlwMm`.

### 3.3 Lintel sizing by case

1. **Roof only:** `selectLintel` today, unchanged.
2. **Floor + roof, product MGP10, wind N1/N2:** T47 (sheet) or T48 (tile). Row picked by roof width up, floor width up, the same ranking and fit rules as T17/T18. Basis cites the table, e.g. "AS 1684.2 Supp 4 T47 sheet roof, roof width 4500, floor width 3600".
3. **Floor + roof on a job marked 3-storey without `tablesConfirmed`:** engineer (see 1.2), for every product.
3b. **Floor + roof, product SmartLVL13 (the default) or Smart10:** not mapped in P1, so the status is **engineer**: reason "lower storey: SmartLVL13 floor-load tables aren't mapped yet; type the engineer's size or use MGP10". (Selecting MGP10 as the lintel product is a one-tap way to size from T47/T48 meanwhile; the card must say which product it used.)
4. **Floor only, Engineer, N3+ wind, C wind, width over the table, any case with no mapped table:** status `engineer`. The opening shows **"per engineer: type the size"** and the quantity stays **incomplete** until a size is typed. **Never guessed, never defaulted to a smaller case.** A typed size is already used as typed (`rule.lintel.status "typed"`, "typed by the office").
5. A typed size on an engineer-case opening is labelled **"per engineer"** and records "from the engineer, not checked against a table". Today's footer says a typed size isn't checked against a span table; keep that, add the label so a quote never shows an engineer's size as a table result.

### 3.4 Load-bearing per wall

- Today: wall `inputs.loadBearing` (true / false / absent) overrides the item's `carriesRoof`. `loadBearing === false` means no jamb table, no lintel, head framed with trimmers; a load-bearing full-height opening is "engineer".
- New default: **any loads-above answer other than "nothing" makes the item's walls load bearing by default.** `carriesRoof: true` is read as "Roof only" so old items keep their meaning; `carriesRoof: false` stays "these walls carry nothing above" and becomes a fifth, rarely used option shown only under "Not set / carries nothing" (the existing yes/no/not set control stays, labelled "Do these walls carry anything above?", so no old data is orphaned).
- **A wall parallel to the joists above** can be marked non-load-bearing with the existing per-wall **No** button, which gives the nominal lintel/none per the existing rules. Plain-words hint on the Select panel for a Floor + roof wall: "Runs the same way as the joists above? It usually carries no floor. Tap No if the engineer agrees." The Hub **does not decide this** from geometry in P1 (a parallel wall can still carry a wall above it, a floor beam or a point load); the office taps it. In a Floor + roof or Engineer item, tapping No asks one confirm ("Nothing above bears on this wall?") because it removes the lintel.
- A load-bearing wall in an **Engineer** item: lintels and jambs all "engineer", plates and noggins still calculate for quantity, but **stud size and centres are not table-sized**: the quantity uses the typed engineer stud size, or shows "stud size per engineer" and stays incomplete. The lower-storey stud table (T36) is also two-storey only, so it is not applied to a ground storey of three. The card says "load-bearing walls here are sized by the engineer".

### 3.5 How it ties to "lintel in floor frame" (branch `takeoff/lintel-position`)

- A lintel in the floor frame sits inside the floor joist depth and carries the floor above (and the roof if any). Today that branch short-circuits a load-bearing wall with `floorFrame` to "engineer (floor load)".
- After this plan: `floorFrame` + **Floor + roof** (MGP10, N1/N2) sizes from T47/T48 like any lower-storey opening; `floorFrame` + **Roof only** is contradictory (a lintel in the floor frame must be carrying a floor), so it shows "set Loads above to include the floor" and stays unsized; `floorFrame` + **Engineer** or no mapped table stays engineer. The two settings remain separate inputs (position says where it sits, loads above says what it carries).
- Sequencing: build Loads above **after** `takeoff/lintel-position` merges, so there is one place that maps position to outcome. If lintel-position is not yet merged, P1 ships without touching `floorFrame` and its engineer short-circuit continues to apply.

### 3.6 Later: derive from the floor framing (P3)

The floor framing takeoff (branch `takeoff/floor-framing`, not opened for this plan) knows joist direction, span and bearers. P3 would offer "Joists above run onto this wall (floor width 3600)" as a pre-filled, **overridable** suggestion on the per-wall panel, and suggest "parallel to joists above" for load bearing. Suggestion only, never silent: the office confirms with one tap. Not designed in detail until floor framing P1 settles its data model.

## 4. Fewest taps onsite

- Existing items cost zero extra taps: they stay "Roof only", exactly as sized today.
- Single-storey or top-floor job: nothing new is asked.
- Floor + roof: **two taps**: the chip, then a floor width chip (plus a one-off engineer-confirmation tap on a 3-storey job). Roof width, roof type and spacing are already set on the card.
- Engineer: **one tap**, then type each size where the wall has a lintel.
- Per-wall override: select wall, one chip, same as the wet-area flow.
- Only the questions the case needs are shown; the rest stays collapsed under "Roof and openings".
- Defaults: Roof only (today's), floor width **not defaulted** (unset shows "needs floor width", like "needs roof"), wind and product as today.

## 5. Phasing

### P1: the smallest useful release

1. "Loads above" chips on the Walls item card, and per-wall override in Select.
2. **Engineer path** (two or more floors, floor only, anything no table covers): typed sizes, "per engineer" label, quantity incomplete until typed. This alone fixes the unsafe silent case for Sam's 3-storey job.
3. **Floor + roof via T47/T48 for MGP10, N1/N2.** Jambs for lower storey: engineer / typed (T40-42 not ported). SmartLVL13 and Smart10 floor + roof = engineer, with the MGP10 one-tap alternative stated.
4. Load-bearing default from Loads above; existing per-wall Yes/No unchanged.
5. 3-storey guidance text. Tests (section 8).

### P2: map the missing tables

Extract SmartLVL13 lower-storey lintels (guide p.23, N1-N4 and C1) and Smart10 p.18 with the existing `extract-lvl-guides.py` (row and cell counts asserted); port the lower-storey jamb tables; extract N3/N4 versions of T17/T18/T47/T48 from the licensed PDFs on disk. Each new table lands with an assertion test against the printed values and the Hub's "fail closed" outcome until it passes. Make the SmartLVL13 floor-width chips (1200/2400/3600) appear when its table is mapped.

### P3: derive from the floor frame

As 3.6. Also optional later: a "point load lands here" flag on an opening that forces engineer.

## 6. Data model

All additions are **optional**; absent keeps today's behaviour, so no migration and old saves are unaffected.

| Where | Key | Values | Notes |
|---|---|---|---|
| Walls item `rules` | `loadsAbove` | `"roof" \| "floorRoof" \| "floor" \| "engineer"` | absent = derive from `carriesRoof` (true -> roof) |
| Walls item `rules` | `flwMm` | number (mm) | floor width carried; rounded **up** to the table column |
| Wall measurement `inputs` | `loadsAbove` | same four values | absent follows the item; matching the item deletes the key |
| Wall measurement `inputs` | `loadBearing` | unchanged | still the wall's own yes/no |
| Opening `inputs` | `loadFlwMm` | number (mm) | like `loadRlwMm`, set from a chip inside the lintel box |
| Opening `inputs.lintel` | `perEngineer` | `true` | set when a typed size answers an engineer case; label only |
| Engine `ctx` | `loadsAbove`, `flwMm` | | built in `openingSelectors.js` from item rules, wall inputs and opening inputs |
| Engine `rule.lintel` | `case`, `engineerReason` | | what the card and report show |

Engine entry points: `openingSelectors.js` (the single bridge: it builds `roof` today with `storey: rules.storey === "lower" ? "lower" : "single_upper"`) gains `loadsAbove` and `flwMm`; `standards/index.js` `storeyGate()` is replaced by a **case gate** (roof: ok; floorRoof: table lookup if mapped else engineer; floor / engineer: engineer); `selectLintel` and `selectJambs` get a lower-storey branch for T47/T48; `openingRules.js` and `dispatch.js:514` pick up the per-wall value the same way `loadBearing` is picked up now. `rules.storey` is retired in favour of `loadsAbove`.

## 7. Server whitelist (silent drop is the risk)

File: `server/lib/takeoff/takeoffService.mjs`.

- **Item `rules`:** `cleanGenericRules` accepts new scalar keys on its own (identifier keys, bool / number / string up to 120). `loadsAbove` and `flwMm` store with no change. Add a check that `loadsAbove` is one of the four values (a bad value is refused, not stored).
- **Wall `inputs`:** add `loadsAbove` to `cleanInputs` (wall kind): one of the four values or absent. **Any key not added here is silently dropped**, which is the same trap `loadBearing` and `studCentresMm` hit.
- **Opening `inputs`:** add `loadFlwMm` (MM, min 100, max 20000, like `loadRlwMm`) to the opening whitelist.
- **`cleanLintel`:** allow `perEngineer: true`.
- Client and server ship together (the existing owner rule), so no capability gate.

## 8. Tests

Files: `scripts/tests/takeoff-calc.test.mjs` (engine) and `takeoff-api.test.mjs` (whitelist), the same pattern as the HUB 031 opening tests.

1. Roof only: every existing lintel and jamb result is **byte-identical** (regression guard for today's saved jobs).
2. Floor + roof MGP10 N1/N2: pick equals the printed T47 / T48 cell for each of the nine roof by floor columns; floor width rounds **up** (1900 -> 3600); over 4800 -> engineer; roof over 7500 -> engineer; floor width unset -> "needs floor width".
3. Floor + roof with SmartLVL13 or Smart10 (P1) -> engineer, never a roof-only size.
4. Floor only, Engineer, N3+/C wind -> engineer, **quantity incomplete** until a typed size exists; typed size stored with `perEngineer` and shown as "per engineer".
5. Load bearing: item default from Loads above; per-wall override both directions; `loadBearing:false` still gives trimmers and no lintel; full-height + load-bearing -> engineer.
6. A 3-storey job without `tablesConfirmed` sizes nothing from tables; with it, Floor + roof sizes from T47/T48. Item floor width default is the largest; a per-wall value never lowers it automatically. The case gate fails closed: any unknown `loadsAbove` value -> engineer, never roof-only.
7. Server: whitelist keeps `loadsAbove`, `loadFlwMm`, `perEngineer`; refuses a bad `loadsAbove`; a wall input with an unknown key is dropped (proves the whitelist test would catch a missed key).
8. With lintel-position merged: `floorFrame` + Floor + roof -> T47/T48; `floorFrame` + Roof only -> "set Loads above".
9. UI (`takeoff-r04`-style gestures test): chip set, per-wall override tap, 44 px targets, only the needed questions are visible.

## 9. Risks

1. **Under-sizing today.** Until this ships, a lintel under a floor is sized as roof-only. Interim for Sam's job: type each lower-storey lintel from the engineer (the typed-lintel box works now).
2. **Table assumptions** (floor mass, wall height, live load) must match the real build. Heavy floors or slab are outside the tables: engineer. The card shows the table's basis string so the supplier can check it.
3. **Tables are not load-path analysis.** They size a lintel *once the wall is known to be load bearing*. Deciding which walls are load bearing, stacked walls above, and concentrated loads need the plans or the engineer. The Hub only records the office's answer.
4. **N1/N2 only** (MGP10 lower storey). Wind N3+ and C classes keep going to engineer until P2 extraction.
5. **Misreading the chips:** "Floor + roof" on a wall that really has two floors above would be sized too small. Mitigation: the 3-storey hint line, and the first-use hint "Count the floors above this wall."
6. **Merge order** with `takeoff/lintel-position` and `takeoff/floor-framing` touching `openingRules.js`, `dispatch.js`, `WallsScreen.jsx`.
7. **Licensed data:** AS 1684 supplement PDFs are licensed; extraction stays internal and cited, as the existing standards do.

## 10. Questions for Sam (each with a recommendation)

1. **Ground-floor walls of the 3-storey house: confirm they are always "Engineer" (typed sizes from your engineer) in the Hub.** Recommend **yes**: nothing published covers two floors above, and guessing is the dangerous failure.
2. **Floor only** (a floor above, no roof on that wall): leave it as Engineer, or allow "sized as Floor + the smallest roof (safe side)"? Recommend **Engineer in P1**; the safe-side mapping is a judgement, not a table result, so only add it if your engineer is happy.
2b. **Has your engineer confirmed the AS 1684 / supplier tables may be used for the middle and top storeys of this 3-storey house (they are written for two storeys)?** Recommend **ask before using any table result**; until then everything is typed.
3. **Floor + roof lintels while only MGP10 N1/N2 is mapped:** is a one-tap switch to MGP10 (pine) for those lintels acceptable until the SmartLVL13 tables are extracted (P2), or would you rather everything below the top storey stays Engineer until then? Recommend **allow MGP10 with the product named on the card**; if your lower-storey lintels are normally LVL, then **Engineer until P2**.
4. **Walls parallel to the joists above:** keep it a manual "No" tap (recommended) rather than guessing from geometry until P3.
5. **Jambs under floors:** OK that lower-storey jamb counts are typed or Engineer in P1 (tables not ported yet)? Recommend **yes**; P2 ports them.
6. **Three Walls items for a 3-storey house** (ground / middle / top), each with its own Loads above chip: is that how you are drawing it? If you draw all storeys in one item, we need the per-wall override on every wall, which is more taps. Recommend **three items**.
7. **Wind class on this job:** N1/N2 (tables apply) or higher? Recommend telling us now; N3+ keeps everything below the top storey on Engineer until P2.
8. **Engineer's report:** do you want a print-out listing every "per engineer" opening for your engineer? Recommend **yes**, but under Later.

## 11. Later (not now)

- Derive floor width and joist direction from the floor framing takeoff (P3).
- Point-load flag on an opening (girder truss, strut, beam landing).
- Cyclonic (C1-C3) tables.
- Engineer-list print-out of all "per engineer" openings.
- Lower-storey stud table (T36) mapped to wall stud sizing and a "studs under floor load" suggestion.
