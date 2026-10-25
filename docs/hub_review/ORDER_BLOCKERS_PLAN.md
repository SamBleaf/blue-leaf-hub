# HUB 029 and HUB 030: plan

Planning only, 25 October 2026. This page merges two plans, "eliminate first" and "one-tap fix". Where they disagreed, I checked the code and noted the result. A critic review was then checked against the code, and every finding that held is folded in (see the last section).

**Line numbers.** Lines are cited at HEAD eb2edf5 (HUB 028 step 3). In the tree today these files match HEAD:
- everything under `shared/` and `server/`
- `FamilySetup.jsx`, `WallsScreen.jsx`, `OrdersScreen.jsx`, `ScheduleScreen.jsx` and `RescaleReview.jsx`

HUB 028 step 4 is editing `TakeoffApp.jsx`, `MeasureScreen.jsx` and `src/ui-review/fixtures/takeoff.js` right now. Citations to those files are HEAD and will move.

**Recorded job.** Its numbers come from running the shared engine on the read-only export. This page holds no names, addresses or phone numbers from it.

## Sam's decisions (25 October 2026) — these override the defaults and questions below

1. **A wall with no height holds the whole cladding** (Q1: "Hold the whole cladding"). Build step 6 (held walls) is NOT
   built. The fix is the one-tap row, e.g. "Wall 3: enter the Wall height ›".
2. **Support battens with nothing entered use 600 centres and count no batten fixings** (Q2: yes), shown as
   "600 centres (Blue Leaf default)" and "fixings not counted", both changeable. Installation still reads "Not checked by
   the app".
3. **Job 413d9151's converted Axon was a mis-tap, fixed after deploy** (Q3). The build changes no live job data. Sam
   restores it himself after the deploy in 3 taps; the re-pick must bring back his job-only joint rows
   (`restoreOwnCarried`). The closing summary must give him those 3 taps.
4. **Pine battens are pooled for the WHOLE JOB across every cladding** (Q4: "Whole job", not the recommended per
   cladding). Battens join the job-wide follower pool the way tape and H-flashing are bought (one batten demand set,
   bought once for the job, offcuts shared across every cladding's walls). Batten centres, positions and per-wall
   stations are unchanged; only the buying is pooled. A batten line's blockers come from every cladding that feeds it,
   as tape and H-flashing do today. On the recorded job this gives about 4 batten lines instead of 12.
5. **Scope cut (orchestrator, from live data):** a read-only check on 25 October found NO placed or exported order line
   with the Hardie Cavity Batten (only 2 lines, both on unsent drafts; 0 placements). So the "Battens already ordered as
   Hardie" reconcile row, `formerBatten` and `rules.battensCoveredBy` are NOT built. Draft Hardie lines are handled by
   Update all like any other stale line.

**Decision 6 (25 October 2026, Sam, in chat) — Walls default products, so a new Walls item has NO product needs:**
Sam: "studs are 90x35 LVL smart 10 h2, noggings 90x35 mgp10 untreated, top and bottom plate 90x45 mgp10 H2, or 90x45 LVL 10
smart H2 for long plates or all plates but i dont love the way they absorbs moisture on the ground"; plates and noggins
grade MGP10.
- Studs: 90 × 35 LVL "Smart 10", H2 (stud thickness along the wall is now 35, so side-stud placement, the merge distance and
  noggin clear lengths follow from 35; HUB 028 test figures that rely on the default stud product change legitimately;
  list each one).
- Plates (bottom, top, second top): 90 × 45 MGP10, H2 (pine; Sam doesn't want LVL on the ground by default).
- Long plates (over the pine plates' 6.0 m): 90 × 45 LVL "Smart 10", H2, up to 11.0 m (as before).
- Noggins: 90 × 35 MGP10, "Untreated" (a real treatment value that satisfies the need, printed as "untreated").
Represent "LVL Smart 10" so order lines read naturally, e.g. "Studs 90 × 35 LVL Smart 10 H2". A saved company product for
a part still wins over these. Keep HUB 027's Timber presets unchanged. Update SOP 20-08's Walls defaults and the HUB 028
worked-example notes in step 6.
**Where it goes:** the first build step that starts after this note is written implements it (families.js
wallFramingDefaults + tests), unless an earlier step already did.

## What Sam asked

**Message 1** (25 October, with a screenshot of the live Cladding panel):

> "reviewing the current version - as shown in the screen shot there are blockers everwhere - we need to firstly eleimate blockers where possible, if thats not possible we need to make each blocker or label something you can click so you can get past the blocker - remember minimal clicks is the goal, the process needs to ensure that when you do the takeoff process on the plans at the end of the process that order is pratically orderable."

The screenshot shows Cladding, Axon 400 smooth, this job only. Under "On the order now (this job)", six lines each say "not orderable yet":
- 37 sheets 404419 (incl. 4 spare)
- 2 sheets 404418
- 8 sheets 404417
- 149 Hardie Cavity Batten 405307
- 20 H-flashing 305613
- 6 rolls of foam tape 304560

The tiles read QUANTITY Incomplete (red), INSTALLATION Source-pending (amber) and PROCUREMENT Draft (amber). "From the calculation" lists three items:
- "Wall 3: enter the wall length and heights."
- The axon-vertical "does not state its product variants, orientation" note.
- The "No reviewed installation row is active for axon-vertical" note.

**Message 2** (25 October, with a screenshot of Orders):

> "also another thing we need to change - we NEVER use the hardies cavity batten - we always use 90 x 35 pine for battens"

That screenshot shows three chips: Quantity Calculated, Installation Source pending, Ordering Ready to order. The lines are 14 sheets, 43 Hardie Cavity Batten, 6 H-flashing and 2 rolls of tape. "Still needed but not on this order" lists "Support battens", with nothing to order yet ("Choose the batten / rail product.").

**Sam's follow-up answers.** Battens are 90 × 35 H3 pine, longest 6.0 m, bought in 300 mm steps (all timber is on the 300 mm grid since HUB 028 round 2), with offcuts shared across walls.

**HUB 029 "Clear order blockers, or make each one a one-tap fix" (P0 proposed).**
- Required:
  - Audit every blocker and status label.
  - Remove any that shouldn't stop an order (e.g. installation-source notes).
  - Resolve the rest automatically where a safe default exists.
  - Make every remaining blocker one tap to its exact fix (wall, field or product), in plain words.
  - One incomplete wall must not hide quantities, or block the complete walls' order, without naming that wall and offering its fix in one tap.
  - A normal takeoff on the plans ends at Review order with an order that can be placed.
- Acceptance:
  - The recorded job's Axon order is made orderable from the panel in the fewest taps.
  - Wall 3 opens directly at its missing length and heights.
  - No "not orderable yet" without a tap to the reason and fix.
  - Installation-source notes no longer block or read as faults.
  - A fresh plan takeoff through Review order ends placeable, with no dead-end labels.

**HUB 030 "Use 90 × 35 pine for every batten" (P1 proposed).**
- Required:
  - Automatic cladding battens and the Support battens item default to 90 × 35 H3 pine, 300 mm steps up to 6.0 m, offcuts shared across walls.
  - Batten centres and positions are unchanged.
  - Hardie Cavity Batten is never the default.
  - Support battens never waits for a product.
- Acceptance:
  - The recorded job shows pine battens and no Hardie Cavity Batten line.
  - A new cladding takeoff gives pine battens with no setup.
  - Support battens shows a quantity.

## What blocks an order today

Whether a line can be ordered depends on one thing: is its problems list empty?

The engine:
- copies every blocking problem of a material, plus any raw plan code, onto every one of that material's lines (`shared/takeoff/engine/dispatch.js:1016-1025`)
- gives the job-wide tape and H-flashing lines the blockers of every cladding that feeds them (`dispatch.js:1130-1131`)
- files non-blocking problems as line notes (`dispatch.js:1027`). Notes never stop an order.

The supplier export refuses:
- any order line whose schedule line has a problem (`server/lib/takeoff/takeoffService.mjs:1083`)
- any stale line (`:1078`)
- missing order details (`:1058-1068`)

It checks only the lines that are on the order (`takeoffService.mjs:1071`). A measured material with no line on the order is never checked. Today that is mostly hidden, because New order pre-fills blocked lines too (`OrdersScreen.jsx:162`), so the export is refused until they are fixed or removed.

The three statuses gate nothing. The server only copies them into the snapshot (`takeoffService.mjs:1095`), and `computed.orderReady` (`shared/takeoff/schedule.js:320`) is read nowhere.

| # | Blocker or label (message) | Where | Scope | Today's way out | Verdict |
|---|---|---|---|---|---|
| B1 | "Wall 3: enter the wall length and heights." (cladding, batten or accessory wall with a missing length or height) | `dispatch.js:514`, cause `resolveWall` `:108-109`; no refs | Every line of the material, plus pooled tape and H-flashing of every Axon | Panel "Walls", then the wall row "Heights needed" (`WallsScreen.jsx:1454`), then the height autofocuses (`:1576`). The message is plain text. Orders "fix ›" opens the material card, not the wall (`TakeoffApp.jsx:537-538` HEAD). | One-tap fix |
| B2 | Wall shape problems: height not a number, gable apex, outline crosses itself or has no area | `wall.js:259-294`, relabelled with no refs at `dispatch.js:516` | Every line of the material | Wall fields or retrace. The wall banner has no action (`WallsScreen.jsx:1928-1942`). | One-tap fix |
| B3 | Opening problems: invalid, outside the wall, duplicate, traced polygon | `wall.js:312-343`, `supports.js:233-238` | Every line of the material | Opening form on the wall page | One-tap fix |
| B4 | Raw plan codes on traced walls: calibration_missing, calibration_not_ready, calibration_superseded, outside_region, plan_superseded | `dispatch.js:76-82`, on lines at `:1025`; wall wording `WallsScreen.jsx:76-84` | Every line of the material | Rescale or retrace. The panel says "not orderable yet" with no reason, because these codes never reach `result.problems`. The rescale review lists runs and polylines only (`schedule.js:443`, `RescaleReview.jsx:14`), never walls. The wall page says "retrace the wall to change it" (`WallsScreen.jsx:1202`). | One-tap fix (walls join the rescale review) |
| B5 | Installation notes: assembly_coverage_unstated, installation_rule_missing, plus selectors missing, rule ambiguous, fixing row missing | `cladding.js:44` (`blocking:false`), `:168`, `:171`, `:176` | Never blocks | Nothing can clear them. Seed `axon-vertical` has no rows (`products/seed.js:861`). One copy per wall, so 18 per line on the recorded Axon. | Remove (as faults) |
| B6 | INSTALLATION tile "Source-pending" (amber), Orders chip "Installation: Source pending" | `FamilySetup.jsx:206-228`, `ScheduleScreen.jsx:50-51` | Label only | None | Remove (neutral wording) |
| B7 | Assembly mismatch codes (method, family, product, orientation) | `cladding.js:148-161`, blocking by default | Every line of the material | "Clear this assembly" (`FamilySetup.jsx:1289`), hidden behind Edit | Keep blocking, one-tap clear |
| B8 | sheet_too_tall, one per wall | `cladding.js:694` | Every line of the material | The Blue Leaf default joint row (HUB 014) already prevents it. The wall page has a one-tap joint (`WallsScreen.jsx:1929-1936`). | Auto-resolve |
| B9 | joint_rows_invalid, sheet_unplaced | `cladding.js:302`, `:516` | Every line of the material | "Edit joint row" on the wall page (`WallsScreen.jsx:1937`). sheet_unplaced has no action. | One-tap fix |
| B10 | Cladding product needs: product, width and thickness, cover, stock lengths (and their product_missing duplicates) | `families.js:389-394`, `cladding.js:78-88` | Every line of the material | Product picker on the same card, not linked | One-tap fix |
| B11 | Other cladding fields: orientation, allowance, datum, panel joint gap, AAC adhesive joint, board joints, timber-cladding increment, foam coating | `cladding.js:627-655`, `:784-1062`, `:1162-1317`; `families.js:392-393` | Every line of the material | Card fields, some behind Edit | One-tap fix |
| B12 | Support battens: "Choose the batten / rail product.", section, stock lengths | `families.js:382-384` | No lines at all | Product picker or "Timber or other batten" (`FamilySetup.jsx:1982-1993`). Orders shows it as plain text (`OrdersScreen.jsx:384`, `:650-651`). | Auto-resolve (pine) |
| B13 | support-spacing-unresolved, once per wall | `supports.js:681` | Whole Support battens item | "Maximum support spacing" (`FamilySetup.jsx:1999-2000`, "never defaulted") | Auto-resolve if Sam agrees (Q2), else one tap |
| B14 | fixings-not-quantified, scope-reason-missing | `supports.js:462`, `:484`, `:830` | Whole Support battens item | Support fixings card | Auto-resolve if Sam agrees (Q2) |
| B15 | stock-policy-missing (a batten with one `lengthMm` and no list) | `supports.js:761`; policy only for a list at `dispatch.js:541` | Whole Support battens item | Re-enter as a list | Auto-resolve |
| B16 | Automatic battens hard-wired to Hardie Cavity Batten 70 × 19 × 3,000 | `followers.js:45-66` | Every Axon, Linea, Stria and timber cladding | No setting | Auto-resolve (HUB 030) |
| B17 | Timber identity: section, grade, treatment | `families.js:374-376` | Whole timber item | Size and grade on the card, not linked | One-tap fix |
| B18 | Timber measuring needs: member_missing, distribution_missing, distribution_overlap, plates_missing, noggin rows, pitch, override_stale | `dispatch.js:133`, `:190`, `:211`, `:231`; `timber.js:571`, `:1185` | Whole timber item | Card or Measure | One-tap fix |
| B19 | HUB 028 Walls part needs ("Studs: enter the treatment" …) | `families.js:364-372` (each carries `part`) | Whole Walls item | Walls card fold | One-tap fix |
| B20 | HUB 028 Walls wall blocks: wall_incomplete, wall_not_straight, plate with no stud to join over | `dispatch.js:342-347` (refs already set) | Whole Walls item, by design (`WALLS_FRAMING_PLAN.md:619`) | Wall page | One-tap fix |
| B21 | Red QUANTITY "Incomplete" from a lintel gap that doesn't block | `dispatch.js:431`, `:983`, `:1047` | Label only | None | Remove (neutral wording) |
| B22 | Accessory needs: recipe_missing and group codes | `dispatch.js:550`, `accessories.js` | Whole accessory item | Group cards | One-tap fix |
| B23 | Aluminium profile, stock and kerf | `families.js:378-379`, `dispatch.js:486` | Whole aluminium item | Card fields | One-tap fix |
| B24 | unavailable_stock, offcut_too_long | `dispatch.js:714`, `:721`, `:785` | Whole item | Longest length or offcut fields | One-tap fix |
| B25 | measurement_unused, invalid_input, method_unavailable, job piece limit | `dispatch.js:967-968`, `:954`, `:553`, `:960-961` | Item or job | Names no field or wall | One-tap fix |
| B26 | Empty item under "Still needed", e.g. "Timber, nothing to order yet (Enter the timber section…)" | `OrdersScreen.jsx:378-385` | Doesn't block export | Plain text | Downgrade to one muted, non-blocking row |
| B27 | "Confirm or re-enter: …" and "it just can't go on an order yet" | `FamilySetup.jsx:822-823`, `:761` | Label only. The engine never reads `rules.carried`. | Check these: Use or Discard | Remove (false claim) |
| B28 | Material chips turn a cladding with walls into Support battens or Accessories in one tap | `FamilySetup.jsx:1162`, `:2029-2035`, `:2041` | Creates dead ends (it did on the recorded job) | Undo, only while the panel is open | Remove (on a cladding with walls) |
| B29 | Dead-end labels: "· not orderable yet", "No quantity yet, see why below", tiles, "needs attention" with no reason, the overview banner, "Needs before ordering" | `FamilySetup.jsx:954`, `:957`; `OrdersScreen.jsx:83-88`, `:626-627`; `TakeoffApp.jsx:917` HEAD; `ScheduleScreen.jsx:538-543`; `WallsScreen.jsx:777-783` | Labels | None | One-tap fix (each names its reason) |
| B30 | Stale draft lines (line_stale_missing, inputs, quantity, material); Timber and cladding drafts never refresh; New order pre-fills blocked lines | `schedule.js:337-349`; `takeoffService.mjs:1078`, `:1002`; `OrdersScreen.jsx:162` | Whole supplier export | Update or Remove per line, "Remove all" (`OrdersScreen.jsx:544-558`) | Auto-resolve (new draft) plus one tap (Update all) |
| B31 | Required-by date or As soon as possible; site contact phone | `takeoffService.mjs:1064-1065`; the creator auto-fill gives no phone when the staff record has none (`:800-810`, `:827-830`) | Whole supplier export | Form fields, then "Save order details", then Export | One-tap fix (chips) |
| B32 | Supplier, address, branch, company phone or email, plan replaced, surplus, accessory supplier conflict, quantity under 1 | `takeoffService.mjs:1058-1091` | Whole supplier export | Form fields; Settings › Company; overview Mark reviewed | One-tap fix |
| B33 | The reason repeats as a plain bullet: the client filter expects "{name} " but the server writes "{name}: " | `OrdersScreen.jsx:671` vs `takeoffService.mjs:1083` | Display | None | Fix with the one-tap card |
| B34 | Job reads "Ready" with whole walls unbattened: `orderReady` ignores blocked items with no lines | `schedule.js:320` | Label only | None | Fix (count measured items) |
| B35 | Flashing blockers | `TakeoffApp.jsx:520-549` HEAD | Per flashing | Already one tap (HUB 010) | Keep |
| B36 | Gap: a measured material that is blocked and has no line on the order exports with no warning | `takeoffService.mjs:1071-1083` (checks order lines only) | Whole supplier export | One plain bullet under "Still needed" (`OrdersScreen.jsx:378-385`) | Add a one-tap acknowledgement (part 4) |
| B37 | Gap: every new order, either section, defaults to the flashing supplier hint | `catalogue.js:13` ("Fielders"), `takeoffRoutes.mjs:216-217`, `OrdersScreen.jsx:157`, `takeoffService.mjs:1011-1013` | Timber and cladding orders | Change the supplier by hand | Fix (per-section supplier, part 3) |
| B38 | Gap: a traced wall on no material is never mentioned at ordering | None | Can leave a wall off silently | Find it on Walls | Muted, non-blocking row (part 3) |

## The recorded job

### What blocks it now

**1. The screenshot, rebuilt.** The screenshot is reproduced exactly when the first Axon item is put back as it was:
- its 10 walls: Walls 1 and 3–11
- its own carried rules: cavity, joint rows at 2,990 / 5 mm / "02", N2, timber frame, ND nails, on-stud

That gives 37 / 2 / 8 sheets, 149 battens, 20 H-flashing and 6 rolls. The tiles read Incomplete / Source-pending / Draft.

**2. Only one blocker is real.** Wall 3 is a rectangle traced 420 mm long, with Wall height empty. It was traced before the Line tool had a Wall height. The message asks for "length and heights", but only the height is missing (`dispatch.js:514`, `:108-109`).

**3. One wall holds everything.**
- That one problem goes on all six lines.
- It also goes on the pooled H-flashing and tape of the second Axon item (Walls 12–13). That item's own panel still reads Procurement Ready, because `dispatch.js:1051` ignores pooled lines.
- Each first-Axon line also carries 18 installation notes. None of them block.

**4. The item was then converted.** At 01:30 UTC on 25 October, the first Axon item became an empty "Support battens" item. The evidence:
- its `rules.carried` say "from Axon 400 smooth"
- its name and spec are exactly what `chooseFamily` writes (`FamilySetup.jsx:2029-2035`, `freshSpec` `:1170`)
- its update time equals the job's last save

So today Walls 1 and 3–11 have no cladding at all.

**5. Wall 2 is on nothing.** Wall 2 is a traced rectangle on the same page, 1,462 mm long, with no Wall height. Its only contribution was to this first Axon item, and it was taken off on 20 October. It is on no material now, and nothing at ordering mentions it.

**6. Orders shows only the second Axon.** That is 14 sheets, 43 battens, 6 H-flashing and 2 rolls, all orderable. It matches the Orders screenshot.

**7. What else holds the converted item.** The Support battens item now has:
- the three product needs (`families.js:382-384`)
- Wall 3
- support-spacing-unresolved on 9 walls (`supports.js:681`)

**8. The draft order.** The Timber and cladding draft FO-001004 holds 8 lines. Six are the old first-Axon lines, now line_stale_missing, with only "Remove line" offered. The draft has no required-by date or As soon as possible, and no contact phone. The server would refuse it on `takeoffService.mjs:1064-1065` as well. Its contact name came from the creator auto-fill, but that staff record has no phone (`takeoffService.mjs:827-830`). Its supplier differs from the flashing orders' supplier.

**9. The empty Timber item.** The Timber (rafters) item has nothing measured and no section. It is listed under "Still needed" but doesn't block the export.

**10. The danger.** If the second Axon is ordered as things stand, the order is about 46 sheets and 150 battens short, and Wall 2 is missing as well. The only hint is one plain-text bullet. The export passes, because the converted item has no line on the order (B36).

### Today's fewest taps to a placeable order

About **17 taps and 2 typed values**:
1. Open Support battens.
2. Tap the Fibre cement chip.
3. Pick Axon 400 smooth.
4. Walls.
5. Wall 3.
6. Type the height, then Done.
7. Orders.
8. Timber and cladding.
9–14. Five "Update to what's needed now" and one "Remove line".
15. As soon as possible.
16. Type the phone.
17. Save order details.
18. Export supplier PDF.

Step 3 also drops Sam's job-only joint rows, so the sheets change from the screenshot's 37 / 2 / 8 to 43 × 3,000 and 3 × 2,450 (`companyDefaults.js:98-100`).

### What Sam sees after HUB 029 and HUB 030

This uses the defaults in Questions for Sam.

**Before he turns the first Axon back:**
- **Second Axon (Walls 12–13):**
  - 14 sheets 404419 (2 spare).
  - 26 pieces of 90 × 35 H3 pine in 4 lines: 14 × 6,000, 1 × 5,700, 1 × 5,100, 10 × 3,600.
  - 6 H-flashing and 2 rolls.
  - Ready to order, with one muted line: "Installation isn't checked by the app."
  - No Hardie Cavity Batten line.
- **Support battens (Walls 1, 3–11):**
  - "Blue Leaf default: 90 × 35 H3 pine".
  - With Q2 yes, 85 uprights: 74 × 3,600, 4 × 3,900, 7 × 4,200, spares included.
  - One row: "Wall 3: enter the Wall height ›".
- **Orders:**
  - FO-001004 shows "Update all 8 lines to what's needed now" and the delivery chips.
  - "Still needed" names Wall 3 as a button.
  - Export needs one more tap: "Order without Support battens (Walls 1, 3–11): Wall 3 has no Wall height". A short order can't go out unnoticed.
  - One muted row: "Wall 2 (page 7) is on no material ›". It never blocks.
  - One muted row: "Timber (rafters): nothing measured · Measure › · Remove". It never blocks.

**Taps from the live state to a placeable order: 9 taps and 1 typed value.**
1. Open Support battens.
2. Tap the Fibre cement chip. A batten item with walls still shows the cladding chips.
3. Pick Axon 400 smooth. The Blue Leaf defaults apply, and this item's own joint rows (5 mm at 2,990, "02") come back with them.
4. Tap "not orderable yet: Wall 3 has no Wall height ›". Wall 3 opens with Wall height focused. Type 3600.
5. Tap Done. It returns to the panel, and every line is now orderable.
6. Tap "Ready to order · Review order ›". FO-001004 opens.
7. Tap "Update all 8 lines to what's needed now".
8. Tap "Use delivery from FO-001003". It fills As soon as possible, the site contact and the phone, and saves at once.
9. Tap Export supplier PDF.

FO-001004 already has its supplier, so no supplier tap is needed. Nothing measured is held, so no "Order without" tap is needed either.

**Joint rows.** Re-picking the product named in the carried values restores those values ahead of the company default (part 2, "Own values come back"). Without that, `applyCompanyDefault` drops them (`shared/takeoff/companyDefaults.js:98-100`) and the sheets become 43 × 3,000 and 3 × 2,450. Battens, H-flashing and tape come out the same either way (probe on the pine code).

**The order then holds:**
- Sheets: 51 × 3,000 (37 + 14), 2 × 2,750 and 8 × 2,450. That is the screenshot's 37 / 2 / 8 plus the second Axon's 14.
- 134 pine battens in 12 lines:
  - First Axon, 108: 20 × 6,000, 1 × 5,700, 1 × 5,400, 1 × 4,800, 1 × 4,500, 5 × 4,200, 2 × 3,900, 77 × 3,600.
  - Second Axon, 26.
- 20 H-flashing and 6 rolls of tape.

Batten centres and positions are the same as today.

**Other starting points.**
- From the screenshot state (no chip tap): 6 taps and 1 value (steps 4–9).
- A new job's first Timber and cladding order, traced with a Wall height: Review order, "Use <supplier> (your last cladding order)", As soon as possible, "Use my phone (from my last order)", Export supplier PDF. That is 5 taps and no typing.
  - It is 4 taps when the job already has another order with a phone ("Use delivery from FO-…" fills the date and phone).
  - It is 3 taps when that earlier order is a Timber and cladding order too (the supplier comes from it).
  - It is one tap fewer when the person's staff record has a phone (the creator auto-fill, `takeoffService.mjs:827-830`).

## Changes

### 1. Remove

- **Installation notes as faults (B5, B6).** See part 5.
- **The false "Incomplete" (B21).** With no blocking problem, the Quantity tile reads "Calculated · lintels not counted" in neutral. The engine value stays.
- **Empty items (B26).** An item with nothing measured leaves the fix lists and the readiness count. It is not dropped from view. Review order shows one muted, non-blocking row: "Timber (rafters): nothing measured · Measure › · Remove". Remove has Undo. The row never counts as a fix. Its overview row says "Nothing measured yet". An item that has measurements but no lines stays as a fix row.
- **The carried-flag claim (B27).** "Confirm or re-enter" leaves `setupNeeds`. The amber Check these card keeps Use and Discard but says nothing about ordering.
- **Material chips on a cladding with walls (B28).** The Material row shows only Fibre cement, AAC, Rendex foam and Timber cladding. Support battens and Accessories stay available on a new item, and a batten or accessory item still shows every chip, so it can be turned back. `TakeoffApp` passes `hasWalls` into `CladdingSetup`.
- **Status tiles on the panel.** They fold under "Details". In their place is one status line: "Ready to order · Review order ›", or "1 thing to fix before ordering" with its rows.
- **Ready over a blocked line.** The panel's own Procurement shows "Not ready" when any line it lists has a problem, pooled lines included. This is the rule Orders already uses (`ScheduleScreen.jsx:62-66`).
- **Same-name items.** When two items share a name, fix rows and the pooled note name each item's walls.

### 2. Auto-resolve

- **Support battens product (B12).** The 90 × 35 H3 pine default (part 6).
- **Support battens spacing and fixings (B13, B14).** Only if Sam says yes to Q2. With no spacing set, the item uses `maxSpacingMm` 600. With no fixing rule, the default is "not counted" with the reason "Batten fixings to the studs aren't counted (as the automatic battens)". The card shows "600 centres (Blue Leaf default)" and both can be changed. `supports.js` is unchanged, and installation status is untouched. If Sam says no, B13 becomes a fix row with [600] [450] [Other] chips.
- **Single-length battens (B15).** Dispatch passes a single `lengthMm` as a one-length list (`dispatch.js:541`).
- **sheet_too_tall (B8).** New Axon items already get the HUB 014 default joint row. Elsewhere, the fix row carries the wall page's "Use a 10 mm joint with an H-flashing" as an inline apply with Undo. One tap clears every wall.
- **Assembly re-pick on change.** This already happens when the product or orientation changes (`FamilySetup.jsx:525-529`, used at `:2065` and `:2073`). Only old data or a hand-picked assembly can mismatch, and that gets B7's one-tap clear.
- **Installation selectors.** These are already filled by the Blue Leaf defaults (`companyDefaults.js:21-26`, `:94-97`). Nothing to build.
- **Own values come back on re-pick.** When a product is picked (`FamilySetup.jsx:2061-2069`), a new pure helper `restoreOwnCarried(material, product)` in `shared/takeoff/companyDefaults.js` runs before `applyCompanyDefault`.
  - It puts back each carried value whose source is the product just picked. `carry()` (`FamilySetup.jsx:668-702`) starts recording `fromProductId` next to `from`. Older flags, like the recorded job's, have only the label, so they match when `from` equals the picked product's label.
  - Because `rules.jointRows` is then set, the company default leaves it alone (`companyDefaults.js:98`).
  - A different product never gets them, so the cross-product guard in `carry()` is unchanged.
  - The card shows one muted line, "This job's joint rows are back (5 mm at 2,990, 02) · Undo".
- **New Timber and cladding draft.** At Review order with no unsent draft, `openWorkingOrder` creates one, pre-filled with the orderable lines. Blocked lines are left off, with their reason. Today it returns early for this section (`takeoffService.mjs:1002`). New order stops pre-filling blocked lines (`OrdersScreen.jsx:162`). This is safe only together with the left-off guard in part 4.

### 3. One-tap fixes

**The model.**
- **Engine.** The engine only adds facts: refs carrying `measurementId` (and `openingId`) on wall and opening problems, `missing` field names, and a `field` key on every `need()` in `familyProblems` (`families.js:367-394`).
- **`fixesFor`.** A new pure module, `shared/takeoff/fixes.js`, provides `fixesFor(computed, snapshot, { section, materialId })`. It turns material problems and line problems into rows of the form `{ key, materialId, materialName, walls, text, short, target }`.
  - Raw codes on a line are mapped back through `contributionIds` to their measurement, and worded with `PROBLEM_TEXT` (`schedule.js:31-36`).
  - Rows are deduped by target.
  - Non-blocking installation notes, `nothing_measured` and `opening_clipped` never become rows.
- **Router.** `openFix(fix)` in `TakeoffApp` opens the target. A `fixReturn` state brings Done or Close back to where the tap came from (the panel, Walls or Orders), building on the existing `setupFrom` and `orderFocus` (`TakeoffApp.jsx:182`, `:242` HEAD).
- **Rows.** A new `FixList.jsx` shows the rows. Each is one button at least 44 px tall and at most 2 lines at 390 px, with a bold subject, a plain action and a ›. Up to 4 rows show, then "Show N more".

**Targets.**

| Blockers | Row text (example) | Tap opens |
|---|---|---|
| B1, B2 | "Wall 3: enter the Wall height ›" | That wall, with the missing field focused. Width and the gable or rake fields get the same autofocus as height (`WallsScreen.jsx:1185`, `:1576`). |
| B2 (outline crosses itself or has no area) | "Wall 4: retrace the outline ›" | Measure on that page, with the wall highlighted (the `setHighlightIds` pattern, `TakeoffApp.jsx:526-533` HEAD) |
| B3 | "Wall 2: W1 is outside the wall ›" | The wall with that opening's form selected |
| B4 calibration_superseded | "Page 7 was re-scaled: use the new scale for Wall 3 ›" | The rescale review with Wall 3 ticked, showing its length before and after. `rescaleCandidates` (`schedule.js:438-458`) also takes traced walls (kind `wall` with points and a calibration), and `RescaleReview.jsx:17-20` already re-stamps `calibrationId`. The wall page's re-scaled message gets the same button. |
| B4 other codes | "Plan not scaled ›" / "Wall 3 is outside the scaled area: retrace ›" / "Plan replaced: mark reviewed" | Scale this page, Measure with the wall highlighted, or an inline apply |
| B7 | "Assembly doesn't match this product" | Inline "Clear this assembly" |
| B9 | "Wall 5: joint row needs its position ›" | The wall's joint row sheet, or Stock lengths |
| B10, B11, B17, B23, B24 | "Axon 400 smooth: choose the product ›" | The card, scrolled to the `[data-fix-field]` wrapper, opening Edit or the fold when the field is hidden |
| B13 (if Q2 is no) | "Support battens: enter the maximum spacing" | Inline [600] [450] [Other] |
| B18 | "Rafters: draw the distribution run ›" | Measure with that tool, or the Pitch field |
| B19 | "Studs: enter the treatment ›" | The Walls card fold at that part's Size and grade |
| B20 | "Wall 4 is sloped ›" | The wall page, or inline "Take Wall 4 off Walls" with Undo |
| B22 | "Trims: choose the product ›" | That accessory group's card |
| B25 | "A run is on the wrong material" | Inline "Remove it from <material>" with Undo. Others open the card. |
| B29 | Each label shows its first reason as a link | That reason's target. The overview banner becomes "2 things to fix before ordering ›", which opens Review order. |
| B31 | "Required by: [As soon as possible] [Pick a date]" / "Contact phone: [Use delivery from FO-001003] [Use my phone] [Type it]" | The chip saves at once, with no "Save order details" |
| B32, B37 | "Supplier: [Use <supplier> (your last cladding order)] [Choose ›]" / "Add Blue Leaf's phone or email ›" | The chip saves at once; Choose opens the field; Settings › Company (`src/pages/Settings.jsx:291`). Surplus gets "Set to N", a conflict gets "Remove from this order". |
| B30 | "Update all 8 lines to what's needed now" | Inline. It saves and lists what moved. |
| B36 | "Order without Support battens (Walls 1, 3–11): Wall 3 has no Wall height" | A one-tap acknowledgement, next to the reason's own fix (part 4) |

**Where the rows appear.**
- **Cladding panel.** Under "On the order now".
- **Walls.** The wall banners (`WallsScreen.jsx:1928-1942`) and the StatusSummary (`:777-783`).
- **Schedule.** "Needs before ordering" (`ScheduleScreen.jsx:538-543`).
- **Orders.** One "Before you can order" card, just above Export supplier PDF.
  - It holds the section's takeoff fixes, Update all, the delivery chips, the supplier, the company link and any "Order without" acknowledgement.
  - It replaces the "Not ready to order yet" bullets (`OrdersScreen.jsx:668-672`) and fixes the B33 prefix bug.
  - Orders "fix ›" for generic lines uses the row's target instead of always opening the card (`TakeoffApp.jsx:537-538` HEAD).
  - Flashing routes are unchanged.
- **Review order notes (never block, never count as fixes).** Under the card, in muted text:
  - items with nothing measured (part 1)
  - traced walls on no material: "Wall 2 (page 7) is on no material ›", which opens the wall so it can be added to a material or deleted

**The delivery chip.** "Use delivery from FO-001003" offers the newest order on this takeoff that has a phone. It copies the method, address, As soon as possible or a future date (never a past one), the site contact and the phone. It is never applied without the tap, which keeps the R04b R13 rule ("never invented, always asked for", `takeoffService.mjs:1062`).

**The phone on a first order.** When no order on this takeoff has a phone, "Use my phone" offers the phone from the newest takeoff order the same person created, on any job. It comes from `takeoff_orders` only, so no new fact column is added. It is offered, never applied without the tap. The creator auto-fill (`takeoffService.mjs:827-830`) is unchanged.

**The supplier.** The flashing hint (`catalogue.js:13`) stays for Flashings only.
- The new Timber and cladding draft, and New order in that section, take the supplier of the newest Timber and cladding order on this job.
- With none, the supplier is left empty, and the card offers "Use <supplier> (your last cladding order)" from the newest Timber and cladding order on any job, plus "Choose ›".
- `takeoffRoutes.mjs:216-217` returns a `defaultSupplierId` per section, and `OrdersScreen.jsx:157` and `takeoffService.mjs:1011-1013` use the one for their section.

**Update all.**
- It runs `refreshDraftLines` (`shared/takeoff/orderDraft.js:46`) with a new `genericNeeds()` placed next to `flashingNeeds` (`:18`). It saves with `refresh: true`, so each item is re-stamped (`takeoffService.mjs:952-955`).
- A draft saved before this, with no basis, counts as untouched and is brought fully up to date once. That is the same rule flashing drafts follow (`orderDraft.js:42`).
- Lines changed by hand keep their number.
- HUB 028's part matching is kept (`schedule.js:338-340`).
- Batten buckets held by the Hardie reconcile row (part 6) are left out.
- It is a tap, not automatic, because generic lines are updated explicitly (`schedule.js:344-346`, TC-R04 06:83).

### 4. Incomplete walls

**Default (Q1).** A wall with a missing length, height or shape still holds the whole cladding. HUB 028 Walls works the same way (`WALLS_FRAMING_PLAN.md:619`). The reason: the sheets, battens and H-flashing are cut across walls, so leaving one wall off changes the others. Quantities for the complete walls stay visible, as they are today.

**What changes.**
- **Wording.** `resolveWall` (`dispatch.js:93-112`) returns which fields are missing. The message names only those fields, in the wall page's own labels:
  - "Wall 3: enter the Wall height."
  - "…trace or enter the Wall length."
  - "…enter the Height at start and end."
  - "…enter the Eaves height, Apex height and Apex position."
  This matches HUB 028's wording (`dispatch.js:346-347`).
- **Data.** The problem gains `scope: "wall"` and `refs: [{ measurementId, missing }]`, so the fix opens the right wall even when two walls share a name. Shape problems at `:516` get the same refs.
- **Lines.** Every blocked line reads "not orderable yet: Wall 3 has no Wall height ›".
- **Pooled tape and H-flashing.** These keep the block, because their quantity is short by that wall's share. Their row names the source item and its walls, e.g. "Wall 3 on Axon 400 smooth (Walls 1, 3–11): enter the Wall height ›".
- **Still needed.** "Still needed" and the Review order card name the wall, with the same tap.
- **No zeros.** A wall is never counted as zero.

**Nothing left off unnoticed (B36).** This applies in both Q1 modes, and is what makes leaving blocked lines off the draft safe.
- `buildExportSnapshot` (`takeoffService.mjs:1053`) also looks at every generic material in the order's section that has measurements.
- A material counts as left off when it is blocked (blocking material problems, or every line has a problem), has no line on this order, and has nothing placed or exported for it.
- Each left-off material adds the problem "Order without <material> (<walls>): <first reason>". An item with nothing measured never does.
- A new `acknowledgeLeftOff: true` on the export clears it, on the same pattern as `acknowledgeSurplus` (`takeoffExport.mjs:72-74`).
- The snapshot always records `notIncluded: [{ materialId, materialName, walls, reason }]`. The site appendix prints "Not on this order: Support battens (Walls 1, 3–11), Wall 3 has no Wall height". The supplier PDF is unchanged.
- In the card, the acknowledgement sits next to that reason's own fix, so the fix is the obvious first choice.

**If Sam answers Q1 the other way (step 6 only).**
- The line collector (`dispatch.js:1016-1025`) skips `scope: "wall"` problems.
- `result.held` and `computed.heldWalls` name the wall.
- Pooled lines stop inheriting it.
- Held walls join `notIncluded`, so the site appendix prints "Not on this order: Wall 3 (Axon 400 smooth), height not entered". They need no acknowledgement, because Sam chose to let them go.
- The rows and taps stay the same.
- HUB 028 Walls keeps its item-wide rule either way.

### 5. Installation notes

This is display only. The engine statuses, codes and guards stay exactly as they are (`cladding.js:137-235`). They are test-pinned in `takeoff-tc-cladding.test.mjs:618-636`, `takeoff-tc-hub014.test.mjs:125-140` and `takeoff-tc-supports.test.mjs:228-230`.

- **Filter.** `isInstallationNote(p)` (`p.axis === "installation" && p.blocking === false`) lives in `fixes.js`. It keeps these notes out of every fix list and out of "From the calculation" (`FamilySetup.jsx:972-995`).
- **One line instead.** They are replaced by one muted, closed line: "Installation isn't checked by the app." The words reuse `ScheduleScreen.jsx:537`.
- **Dedupe.** Line notes are deduped by message on a material's own lines (`dispatch.js:1027`), as pooled lines already are (`:1133`). `result.problems` keeps every copy. The Schedule "Note:" list dedupes by code (`ScheduleScreen.jsx:544-545`).
- **Tile and chip.** "Source-pending" reads "Not checked by the app" in the neutral slate tone, on both the tile (`FamilySetup.jsx:206-211`) and the Schedule chip (`ScheduleScreen.jsx:51`). It is never green and never says verified.
- **Orders.** The Installation chip leaves the Orders group header.
- **Fallback text.** The SetupStatus note drops its "Installation stays source-pending…" text (`FamilySetup.jsx:1005`).
- **Mismatch codes.** The assembly mismatch codes keep blocking (B7).
- **No fake reviews.** There is no UI for `rules.projectDetail` or `installationOutOfScope`, and no one-tap "reviewed". Either would fake a verified state (`cladding.js:142-144`).
- **Supplier PDF.** The PDF line "Installation: source-pending (axon-vertical)" (`families.js:428`, printed by `takeoffPdf.mjs:424`) is unchanged.

### 6. Pine battens (HUB 030)

**One owner definition.** `OWNER_BATTEN` goes in `shared/takeoff/engine/families.js`, next to `TIMBER_GRID` (`:25`):
- name "90 × 35 H3 pine batten", width 90, thickness 35, no maker, no SKU, no grade
- lengths 1,200 to 6,000 in 300 mm steps, built from `TIMBER_GRID` (17 lengths)
- source "OWNER-2026-10-25"

**Automatic battens** (`shared/takeoff/engine/followers.js`):
- **Product.** `BATTEN`, `BATTEN_IDENTITY` and `FOLLOWER_TEXT.battens` (`:55-66`) come from `OWNER_BATTEN`. The identity is `{ family: "batten", follower: "battens", name, widthMm: 90, thicknessMm: 35 }`. `BATTEN_PRODUCT_ID` and `BATTEN_REC` (`:45`, `:50-54`) go.
- **Offcuts.** `BATTEN_POLICY` (`:63`) becomes a list of the 17 lengths with `sharePieces: true`, so offcuts are shared across every wall of the cladding, as today.
- **Joins.** `maxBatten` (`:197`) becomes 6,000, so runs join only past 6,000.
- **Positions.** A new constant `BATTEN_SETOUT_FACE_MM = 70` replaces `BATTEN.widthMm` in the merge rule (`:223`), the lies-on rule (`:313`) and the join face (`:324`). Centres (`:39-41`) are not touched. On the restored recorded job, the total batten length and the station set are unchanged (518 m both ways). Only the Wall 4 gable rake is cut into fewer pieces.
- **Version.** `FOLLOWERS_VERSION` stays 1 (`:38`). The plans disagreed here. The code shows a bump would also make every tape and H-flashing line stale, because `followerKey` covers all followers (`dispatch.js:992`). Batten lines change bucket anyway, so their order lines show for review regardless.
- **Other claddings.** Linea, Stria and timber cladding battens become pine too, because they share `BATTEN`.

**Battens already ordered as Hardie.** The batten identity is part of the bucket key (`followers.js:59-60`, `:333-334`; `dispatch.js:786`), and `orderStatus` matches placed lines by bucket key alone (`schedule.js:386-398`). So after HUB 030, a placed or exported Hardie batten line would show as surplus, and the full pine quantity as still needed. That invites a double order.
- **Check first.** Before deploy, with Sam's OK, run a read-only count of placed or exported order lines carrying the Hardie batten identity (405307) across all jobs. The recorded job's 4 orders are all drafts, but the export has no export or placement records.
- **Guard.** `orderStatus` tags an unmatched commitment whose identity is the old automatic batten as `formerBatten`, with its material.
- **One row.** Orders and Schedule show it once per material: "Battens for Axon 400 smooth are already on FO-… as Hardie Cavity Batten (N pieces). [They cover it] [Order pine too]".
  - Until a choice is made, that material's pine batten buckets are left out of New order, the new draft and Update all. They still show under "Still needed", and don't trigger "Order without".
  - "They cover it" stores `rules.battensCoveredBy = { orderRefs, at }` on the material. Its pine batten lines then read "Covered by FO-…" and are never pre-filled. Undo is offered.
  - "Order pine too" clears the hold.
- The row appears only when such a line exists, so it costs nothing on jobs without one.

**Support battens:**
- **Empty product.** In `normaliseFamilySpec` (`families.js:259`), the batten branch fills an empty product (no id, name, size or lengths) with `OWNER_BATTEN`, marked defaulted. A half-typed custom batten (`custom-batten`) is never overwritten. `freshSpec("batten")` (`FamilySetup.jsx:1170`) starts new items with it.
- **Card.** It reads "Blue Leaf default: 90 × 35 H3 pine, 1.2–6.0 m in 300 mm steps · Change". The picker and "Timber or other batten" sit behind Change.
- **Way back.** Behind Change, the first option is "Use Blue Leaf default (90 × 35 H3 pine)". It sets `OWNER_BATTEN` again. Without it there is no way back, because the picker lists catalogue products only (`FamilySetup.jsx:458-470`) and neither `pick` nor `goCustom` (`:1976-1977`) ever leaves the product empty.
- **Offcuts.** `support_grid` (`dispatch.js:541`) passes the owner list with `sharePieces: true`. Other products keep `false`.
- **Spacing and fixings.** These follow Q2.
- **Hardie still pickable.** The Hardie Cavity Batten stays in the catalogue (`products/seed.js:434`) for a deliberate pick, and is never the default.

**Text.** `FamilySetup.jsx:869` and `WallsScreen.jsx:632` read `FOLLOWER_TEXT` instead of naming Hardie.

**Source register.** Add an OWNER-2026-10-25 entry to `docs/takeoff/TC-R04/09-SOURCE-REGISTER.md`, next to the timber grid entry. It records an ordering choice with no installation claim. The repo's Axon source names only Hardie 70 × 19 and 70 × 35 timber (`05-BATTENS-AND-ASSEMBLIES.md:14`), so installation status stays as it is.

## Build steps

**0. Gate.**
- Start only after HUB 028 steps 4–6 are committed and `test:takeoff` passes. They edit `TakeoffApp.jsx`, `MeasureScreen.jsx`, `FamilySetup.jsx`, `WallsScreen.jsx`, the fixtures and SOP 20-08.
- Rebase `takeoff-r03` and re-check every line number above.
- Re-run the planning probes on the new HEAD to confirm the screenshot numbers.
- Get Sam's answers. Until then, the build uses the defaults below.

**1. Engine blocker data.**
- Files: `shared/takeoff/engine/dispatch.js`, `shared/takeoff/engine/families.js`, `shared/takeoff/schedule.js`, new `scripts/tests/takeoff-tc-hub029.test.mjs` (part A).
- Changes:
  - `resolveWall` returns the missing fields.
  - The wall_incomplete wording, `scope` and refs (`:514`), plus refs on shape problems (`:516`).
  - A `field` key on each `need()`.
  - Note dedupe on own lines (`:1027`).
  - `orderReady` is false when a measured item has blockers and no lines (`schedule.js:320`).
  - `rescaleCandidates` also lists traced walls, with the wall length before and after (`schedule.js:443`).
- Then run `node scripts/tests/takeoff-run-all.mjs`. `takeoff-tc-hub028.test.mjs` must pass unchanged. Run lint.

**2. Fix rows.**
- Files: new `shared/takeoff/fixes.js`, `shared/takeoff/index.js`, `takeoff-tc-hub029.test.mjs` (part B).
- Changes: `fixesFor`, `isInstallationNote`, the code-to-target table and dedupe.
- Add a guard test: every blocking code the engine raises maps to a target.

**3. HUB 030 engine.**
- Files: `families.js`, `followers.js`, `dispatch.js` (`:541`), `schedule.js` (`formerBatten` in `orderStatus`), new `scripts/tests/takeoff-tc-hub030.test.mjs`.
- Changes: `OWNER_BATTEN`, the followers switch with the 70 mm set-out constant, the normaliser fill, the `support_grid` policy and single length, and the former-batten tag. The Q2 defaults go in only after Sam answers.
- Update the Hardie expectations and list each one in the commit:
  - `takeoff-tc-autobattens.test.mjs:87`, `:216`, `:409-410` and its counts
  - `takeoff-tc-integration.test.mjs:84` ("14 piece @3000"), `:173` (totals piece 18 + 14) and `:279-284` (batten spare 2 of 14)
  - `takeoff-api.test.mjs`
  - `takeoff-tc-hub022-openings`, `takeoff-tc-supports` and `takeoff-tc-supports-adv`

**4. Panel, Walls and Schedule.**
- Files: new `src/components/takeoff/FixList.jsx`, `TakeoffApp.jsx`, `FamilySetup.jsx`, `WallsScreen.jsx`, `ScheduleScreen.jsx`, `RescaleReview.jsx`, `shared/takeoff/companyDefaults.js` (`restoreOwnCarried`), `src/ui-review/fixtures/takeoff.js`, new `e2e/ui-review/tc-hub029.spec.js` (panel steps).
- Changes:
  - The `openFix` router and return-to-origin.
  - `QuantityPreview` reasons.
  - `FixList` in place of the blocker part of `EngineProblems`.
  - The status line with "Review order ›" and a Details fold.
  - The neutral installation line and tile.
  - The carried-flag claim removed.
  - The chips hidden on a cladding with walls.
  - `focusField` on the card and the wall page.
  - The pine wording, the default product line and "Use Blue Leaf default".
  - `carry()` records `fromProductId`, and `pick` calls `restoreOwnCarried` before the company default.
  - Traced walls in the rescale review, and its button on the wall page.
- Add the mock seeds `cladding-wall3` (synthetic: nine 3,600 rect walls, one 420 mm wall with no height, one 3,600 / 4,200 gable, two Axon items, one traced wall on no material) and `support-battens-empty`.
- Update `tc-walls.spec.js:270-271` (17 pieces with the 3,059 rake joined over an upright; a 6,000 maximum removes that join). Rewrite the `tc-catalogue.spec.js:400-419` Support battens test ("never defaulted") to cover the pine default and the Q2 answer. Re-run `_adv/phone/wk/wk-walls.spec.js`: its J5 "Cavity battens" item is a deliberate Hardie pick (`src/ui-review/fixtures/takeoff.js:145` HEAD), so it should not change.
- Then run lint and build.

**5. Orders.**
- Files: `OrdersScreen.jsx`, `shared/takeoff/orderDraft.js`, `server/lib/takeoff/takeoffService.mjs`, `takeoffRoutes.mjs`, `takeoffExport.mjs`, `takeoffPdf.mjs` (site appendix line), the mock, `tc-hub029.spec.js` (Orders steps), `takeoff-api.test.mjs`.
- Changes:
  - The "Before you can order" card and the Review order notes.
  - The delivery chips that save at once, "Use delivery from FO-…" and "Use my phone".
  - The per-section supplier and "Use <supplier> (your last cladding order)".
  - Update all and `genericNeeds`.
  - `openWorkingOrder` creates a pre-filled Timber and cladding draft (`:1002`).
  - New order skips blocked lines.
  - The left-off guard: `buildExportSnapshot` adds "Order without …", `acknowledgeLeftOff` clears it, and `notIncluded` goes in the snapshot and the site appendix.
  - The Hardie reconcile row and `rules.battensCoveredBy`.
  - The prefix bug fix.
  - The Installation chip off Orders.
- Apart from the left-off guard, the server refuses exactly what it refuses today.
- Update `tc-journeys-sandbox.spec.js:697` ("32 pieces") and `:703` ("Hardie Cavity Batten 70 × 19, code 405307").

**6. Held walls (only if Sam answers Q1 "let it go").**
- Files: `dispatch.js` (collector), `schedule.js` (`heldWalls`), `takeoffService.mjs` (held walls into `notIncluded`, no acknowledgement), and tests.

**7. Close.**
- Write SOPs 20-05, 20-06, 20-08, 20-09 and 20-12, each with Section 14 test cases.
- Add the SOP_INDEX rows (untested), the SOP_CHANGELOG rows, the HUB_REVIEW_LOG rows and the 09 source register entry.
- Run one real-stack journey in the local sandbox.
- Before deploy, with Sam's OK, run the read-only Hardie batten count (part 6).
- Finish with a short "done + next steps" summary that includes Sam's 3-tap restore.
- No deploy without Sam's "deploy".

## Tests

**Node, `takeoff-tc-hub029.test.mjs`.** It uses the real `computeWorkspace` on synthetic walls shaped like the recorded job.
1. A rect wall with no height gives "Wall 3: enter the Wall height." with `refs[0].measurementId` and `missing: ["heightMm"]`. An untraced wall with no length gives `widthMm`. Rake and gable walls list exactly their fields, matching `missingHeights` (`WallsScreen.jsx:191-197`).
2. Every line of that cladding carries it. So do the pooled tape and H-flashing of a second Axon. `fixesFor` returns exactly one row for it, with a wall target.
3. Installation notes are `isInstallationNote` and are never rows. Each line carries one copy. `status.installation` is still `"source-pending"`.
4. At Wall height 3,600 every line clears and `orderReady` is true. A measured item with no lines makes `orderReady` false. An item with nothing measured doesn't.
5. The assembly mismatch still blocks, and gives an apply target that clears the assembly.
6. Guard: every blocking code maps to a target. Two walls with the same name get different targets.
7. `orderDraft`:
   - untouched generic lines follow a quantity or dependency change when Update all runs
   - lines that are gone are removed
   - blocked lines stay off with the reason "blocked"
   - a hand-edited line keeps its number
   - a Walls stud line never matches a plate line
8. Left-off guard: a measured cladding that is blocked and off the order makes `buildExportSnapshot` return "Order without …". With `acknowledgeLeftOff` it passes, and `snapshot.notIncluded` names the material, walls and reason. An item with nothing measured adds nothing. A blocked line on the order is still refused (`takeoffService.mjs:1083`).
9. `rescaleCandidates` lists a traced wall on a re-scaled page with its length before and after. Applying the new calibration clears calibration_superseded.
10. `restoreOwnCarried`: re-picking the product named in `carried.jointRows.from` (label only, or `fromProductId`) restores the joint rows, and `applyCompanyDefault` then keeps them. A different product gets the company default and the flag stays.
11. Regression: `takeoff-tc-integration` J2 ("wall without heights") still has 0 lines and a wall_incomplete problem. `takeoff-tc-hub028.test.mjs` passes unchanged.

**Node, `takeoff-tc-hub030.test.mjs`.**
1. `BATTEN` is 90 × 35 H3 pine, with 17 lengths from 1,200 to 6,000 and offcuts shared. No line on a new Axon, Linea, Stria or timber cladding contains "Hardie Cavity Batten" or 405307.
2. Batten stations and total metres match a frozen v1 expectation on the test's own walls. A 7,000 horizontal joins over an upright. A 5,900 one doesn't.
3. Tape and H-flashing lines keep their dependency keys, because `FOLLOWERS_VERSION` stays 1.
4. An empty Support battens item has no product need and isn't missing-product. A single-length batten raises no stock-policy-missing. The Q2 cases are added once Sam answers. Hardie, picked on purpose, still orders as Hardie.
5. A placed Hardie batten line on an Axon gives one `formerBatten` reconcile entry for that material. Its pine buckets are left out of the needs and pre-fill. With `battensCoveredBy` set they read covered. With the hold cleared they are needed in full.

**Mocked screens, `e2e/ui-review/tc-hub029.spec.js`.** It runs at 390 × 844 in WebKit, on seed `cladding-wall3`.
- No "not orderable yet" without a button.
- Tapping it opens Wall 3 with the `[data-field=heightMm]` input focused. Type 3600, tap Done, and the panel's lines are orderable.
- "Review order ›" shows the Before you can order card. The As soon as possible, "Use delivery from", "Use my phone" and supplier chips save with no Save button. Export supplier PDF is enabled.
- With Wall 3 still empty and its cladding off the order, Export needs the "Order without" tap.
- The traced wall on no material and an empty item show as muted rows and never disable Export.
- The installation tile is neither amber nor green, and no installation sentence sits among the fixes.
- On a cladding with walls, the Material row has no Support battens or Accessories.
- On `support-battens-empty`, Change, a Hardie pick, then "Use Blue Leaf default" gives the pine batten back.
- The test counts the taps and asserts them.
- Update the wording and counts in `tc-autobattens.spec.js`, `tc-schedule.spec.js`, `tc-walls.spec.js`, `tc-catalogue.spec.js` and `tc-journeys-sandbox.spec.js`.

**Real stack.**
- `takeoff-api.test.mjs`, test database only:
  - `openWorkingOrder` for Timber and cladding creates a pre-filled draft, with the supplier of the job's newest Timber and cladding order, or none.
  - Update all re-stamps lines.
  - Export is still refused for a line with problems (`takeoffService.mjs:1083`), and for a left-off material without `acknowledgeLeftOff`.
- One journey in the local sandbox (extending `tc-journeys-sandbox.spec.js`): Add cladding, pick Axon, trace a 3-wall run with a Wall height, Finish, Review order, the supplier chip, As soon as possible, the phone chip, Export supplier PDF enabled. There must be no dead-end label on the way.

**The recorded job, as a local probe.** The probe lives outside the repo and reads the export, so no business data enters the repo or a fixture. It asserts:
1. The rebuilt pre-switch state still reproduces the screenshot.
2. After HUB 029 there is exactly one fix row, Wall 3 with `missing: ["heightMm"]`, and no installation row.
3. Wall 3 at 3,600 clears every line.
4. After HUB 030 there are 12 pine lines (134 pieces) and no 405307. Sheets, H-flashing and tape are unchanged.
5. In the live state with Q2 yes, Support battens shows 85 pine pieces held only by Wall 3, and exporting FO-001004 without the restore needs "Order without Support battens".
6. The 3-tap restore gives 37 × 3,000, 2 × 2,750 and 8 × 2,450 for the first Axon, with its own joint rows.
7. Wall 2 shows as one muted "on no material" row.

## SOP updates

- **20-09 Cladding walls and elevation (2.0 → 2.1).**
  - Every "Hardie Cavity Batten 70 × 19 … 3,000" becomes "90 × 35 H3 pine batten, 1.2–6.0 m in 300 mm steps, offcuts shared across the cladding's walls, joined only past 6.0 m".
  - Installation reads "Not checked by the app". It is never verified and never blocks.
  - Every "not orderable yet" is a button. "Wall N: enter the Wall height" opens that wall.
  - A re-scaled page offers "Use the new scale for Wall N".
  - Support battens start as 90 × 35 H3 pine, with "Use Blue Leaf default" behind Change.
  - On a cladding with walls, the Material row offers cladding types only. Re-picking a product brings back that job's own values.
  - Section 14 test cases: the Wall 3 fix in 2 taps, pine lines with no 405307, the chips hidden, the joint rows restored on re-pick.
- **20-06 Export and record orders (2.6 → 2.7).**
  - Batten line text.
  - The Before you can order card.
  - Delivery, phone and supplier chips that save at once.
  - "Use delivery from FO-…".
  - Update all.
  - Review order creates a pre-filled Timber and cladding draft.
  - "Order without …" when a measured item is held, and the site appendix's "Not on this order" line.
  - "Still needed" names blocked walls. Empty items and walls on no material show as muted notes.
  - The Hardie reconcile row ("They cover it" or "Order pine too").
  - Section 14 test cases: a new job's first order to an exported order in 5 taps, and a held cladding needing the "Order without" tap.
- **20-05 Length schedule (2.1 → 2.2).** Batten examples, the neutral Installation chip, "Needs before ordering" as buttons, and the Hardie reconcile row.
- **20-08 Timber takeoff (after HUB 028's version, +0.1).** One line: "Details: n to fix" and each blocker open the exact part field.
- **20-12 Company product catalogue (1.4 → 1.5).** Hardie Cavity Batten is no longer the default. The pine batten is the default for automatic battens and Support battens.
- **Indexes and logs.**
  - SOP_CHANGELOG: one HUB 029 row and one HUB 030 row (no migration).
  - SOP_INDEX: the new versions, `test_status: untested`.
  - HUB_REVIEW_LOG: HUB 029 and HUB 030 rows.
  - 09-SOURCE-REGISTER: the OWNER-2026-10-25 pine entry.

## Questions for Sam

1. **When one wall has no height (like Wall 3), should it hold the whole cladding order until you enter it? Or should the complete walls be orderable now, with that wall left off and named on the order?**
   - Default: keep holding the whole cladding, with "Wall 3: enter the Wall height ›" as a 2-tap fix. HUB 028 Walls works the same way, and the cut plans span walls. If you order without it, Export asks once ("Order without …") and the site appendix names it. Answering "let it go" turns on build step 6.
2. **Support battens with nothing entered: use 600 centres and count no batten fixings, the same as the automatic battens?**
   - Default: yes, shown as "600 centres (Blue Leaf default)" and "fixings not counted". Both can be changed, and installation still reads "Not checked by the app".
3. **On the recorded job, at 01:30 on 25 October, the Axon on Walls 1 and 3–11 became an empty Support battens item through the Material chip. Was that a mis-tap?**
   - Default: yes. The build hides those chips on a cladding with walls, and changes no job data.
   - You turn it back in 3 taps: open Support battens, then Fibre cement, then Axon 400 smooth.
   - It comes back with your job-only 5 mm "02" joint rows, so the sheets are the screenshot's 37 / 2 / 8.
   - Also: Wall 2 (1.46 m, page 7, no height) was taken off this Axon on 20 October and is on no material now. Should it be on the order? Default: leave it as it is, shown as a muted "on no material" row.
4. **Cut the pine battens once for the whole job across every cladding, the way the tape and H-flashing are?**
   - Default: no, keep them per cladding as today. On this job that is 12 batten lines either way for 134 pieces, or 4 lines if pooled.

## Out of scope

- **Installation sourcing.** No changes to seed assemblies, `productVariantIds` or orientation on `axon-vertical`, reviewed rows, a project-detail or out-of-scope UI, or any green or "verified" installation state.
- **Engine guards.** The assembly mismatch guards and the source-pending logic (`cladding.js:137-235`) are not weakened.
- **Supplier PDF.** The text "Installation: source-pending (axon-vertical)" stays as it is, because Sam didn't ask. The only new printed text is the site appendix's "Not on this order" line.
- **Per-part blocks and staleness.** Blocks per part, and per-wall or per-part dependency keys, are out. One key per material stays, as HUB 028 says (`WALLS_FRAMING_PLAN.md:662`, `:674`).
- **Auto-filling site facts.** No wall height, cladding product or timber grade is filled without a tap. There is no "same as other walls" height chip. Supplier and phone chips copy from earlier orders only on a tap.
- **Self-updating drafts.** Timber and cladding drafts don't update themselves silently. Update all is one tap.
- **New Line rule.** No new Finish prompt on the Line tool. It already carries a Wall height (`MeasureScreen.jsx:18`, `:135-146` HEAD), and HUB 028 step 4 is editing it.
- **Batten rules beyond the stated change:**
  - no change to centres, set-out, H-flashing, foam tape or pooling (unless Q4)
  - no company-product override for the automatic batten
  - no horizontals or opening battens for Support battens
  - no counted batten fixings
  - no change to timber roof battens
- **Rescaling.** Runs and polylines rescale as today. Traced walls only join the same review.
- **Flashing.** Flashing order logic is already one tap (HUB 010).
- **Live data.** No editing of the live job, and no clean-up of FO-001001 to FO-001004. The only live access is the read-only Hardie batten count before deploy, with Sam's OK.
- **Migrations and deploys.** No migrations, and no deploy without Sam's "deploy".

## Risks

- **HUB 028 overlap.** HUB 028 is still being built in this tree, and the HEAD already moved during planning. Starting before steps 4–6 land means conflicts in `TakeoffApp.jsx`, `FamilySetup.jsx`, `WallsScreen.jsx` and the fixtures.
- **The recorded job stays wrong until Sam turns it back.** With HUB 030 on, the converted item would get pine battens for 10 walls with no sheets. They stay held by Wall 3 until that is fixed. Ordering the second Axon first now needs the "Order without Support battens" tap, but a deliberate tap still leaves the order about 46 sheets short. Acceptance uses the rebuilt pre-switch state, never the live database.
- **Every batten line on every job goes stale.** HUB 030 changes every saved batten line, unsent and exported drafts included (the bucket identity changes). Each draft needs one Update all tap. Placed and exported Hardie lines no longer match their bucket. The reconcile row stops a double order, but only once someone chooses "They cover it" or "Order pine too".
- **More batten lines.** 300 mm stock means 12 batten lines on this job instead of 2, for fewer pieces (134 instead of 191).
- **Defaults against the safety rule.** The Q2 defaults override a TC-R04 safety rule (`supports.js:681`; "never defaulted", `FamilySetup.jsx:2000`). They must be labelled as Blue Leaf ordering defaults and must not touch installation.
- **Two batten paths interact.** A Support battens item on a wall switches off the automatic battens there (`dispatch.js:600-607`). With pine as the default on both, someone may add one by habit and lose the automatic layout on that wall.
- **Normaliser and mock must move together.** The normaliser fills empty batten products, so round-trip tests and the mock (`src/ui-review/fixtures/takeoff.js`) must change in the same commit. Otherwise mocked screens pass while real ones fail.
- **The 70 mm set-out face.** The batten is 90 wide, but the set-out face stays 70 so positions don't move. If Sam later wants 90, merges near joints and openings move, and the positions check must be re-run.
- **Copied details can be wrong.** The delivery chip can bring a stale site contact. "Use my phone" and "Use <supplier>" can bring another job's choice. Each chip names where it copies from, and the delivery chip never copies a past date.
- **Restoring carried values by label.** Older carried flags hold only a product label. Two products with the same label could match. New flags record `fromProductId`, and restores show an Undo.
- **Matching line problems back to their source.** Lines carry problem text, not objects. `fixesFor` must match by code and refs through `materialResults` and contributions, never by message alone, and must handle two items with the same name.
- **Server and client must agree.** Every downgrade lives in `shared/takeoff`, so the server refuses exactly what the panel shows. A hide done only in the UI would still be refused at export.
- **iPhone focus.** WebKit may not raise the keyboard on a programmatic focus after a render. The field is still scrolled into view and highlighted. Check it in `tc-hub029` on WebKit and on Sam's phone, because the tap count could be one higher.
- **Checks the export can't show.** The export has no suppliers, company settings, plan documents, export records or placements. The supplier, company-contact and plan-replaced checks for FO-001004, and whether any Hardie batten line was exported or placed, can't be confirmed in advance.

## Critic findings not applied

None. Every finding held and is applied above. Two details were corrected while checking:
- Wall 2's only contribution was to the first Axon item (the one later converted), taken off on 20 October. It was not on the Axon archived on 17 October. The finding still holds: Wall 2 is on no material and has no height.
- calibration_superseded is raised at `dispatch.js:79`. Line `:82` is plan_superseded.
