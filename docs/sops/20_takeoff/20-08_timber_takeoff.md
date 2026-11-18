---
sop_version: 2.1
last_reviewed: 2026-11-18
app_version: takeoff-r03 + HUB 031 (branch takeoff/wet-walls-cavity-doors, built 18 Nov 2026, not deployed)
screenshot_status: placeholders_only
owner: Admin / Director
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP: Timber Takeoff: Walls, Rafters, Joists, Studs, Plates, Noggins and Trim

**Module:** Takeoffs (timber, cladding, aluminium and flashing from plans)  
**SOP ID:** 20-08  
**Status:** Draft  
**Priority:** High

> **Feature status (2026-10-14):** Takeoffs ship **switched off** behind the server flag `TAKEOFF_ENABLED` (SOP 20-01). A read-only check on 2026-10-14 found migration 206's tables present in production (`docs/takeoff/evidence/live-206-verification-2026-10-14.txt`). Timber takeoff is part of the **TC-R04 build on branch `takeoff-r03`** and also needs **migration 207 (`supabase/migrations/207_takeoff_generic_methods.sql`), which is NOT applied in production** — it must not be applied until the Director approves the TC-R04 release. Nothing in this SOP has been tested against the live app; Section 14 runs in UI Review Mode (mocked data).

> **Wall junctions (18 November 2026):** built on branch `takeoff/wall-junctions`, local, NOT pushed or deployed. No migration. Where a traced wall ends on another wall's run, the continuous wall gets two extra studs (one against each face of the butting wall) and junction blocks between them; a corner gets a second stud on the wall that starts there (owner rules of 18 November). Section 5E and TC-27 describe it. Plan: `docs/takeoff/WALL_JUNCTIONS_PLAN.md`.

> **Walls (HUB 028, 25 October 2026):** built on branch `takeoff-r03` and NOT deployed yet. It waits for the Director's "deploy" and an iPhone check. It needs no migration. Sections 5D, 7, 8, 11, 12 and TC-15 to TC-18 describe it.

> **Walls openings, wet areas and lintels (HUB 031, 17 to 18 November 2026):** built on branch `takeoff/wet-walls-cavity-doors` and NOT deployed or pushed. It needs no migration and waits for the Director's "deploy" and an iPhone check. Per-wall 450 centres, the Cavity slider and Full height in **+ Door** and **+ Window**, framing worked out at every opening and lintels from the span tables. Sections 5D, 7, 8, 11 and 12 and TC-19 to TC-24 describe it. Where it conflicts with the older Walls words, this banner wins. Sam's answers of 17 November 2026 (`docs/takeoff/OWNER_ANSWERS_17NOV.md`) override the plans.

> **Read this first:** the timber takeoff counts and lengths timber **for ordering only**. Every section size is a **manual selection** — the app never checks spans, loads, bracing, lintels or any other structural question, and nothing it shows is a structural or engineering approval.

---

## 1. Who uses this

| Action | Admin (Director) — Hub | Supervisor — Hub | Leading hand — Worker app | View-only / Admin preview |
|---|---|---|---|---|
| Open the timber setup card, the plan and the walls | Yes | Yes | Yes | Read only |
| **Add walls**, **Add timber**, change the setup, draw member / distribution lines, tick changes, walls, counts, **Add lengths** | Yes | Yes | Yes | No |
| **Save as standard** / company timber products (SOP 20-12) | Yes | Yes | No | No |
| Order the timber (SOP 20-06) | Yes (record placed: Director only) | Yes (export only) | Yes (export only) | No |

---

## 2. When to use it

- You need the **wall framing** for a job. Use **Add walls**: you trace the walls once and get the studs, plates and noggins together (Section 5D). This is the normal way.
- You need to order **rafters, joists or battens** spaced at centres along a roof or floor (repeated members).
- You need **studs, plates or noggins** on their own for an exception (Section 5E). Walls covers normal wall framing.
- You need **trim or other members** measured along a line, counted, or typed in from a cut list.
- A schedule line for timber says "needs attention", "Pitch is required." or "cannot be cut from any compatible stock".

---

## 3. What this does

You add a timber material (section, grade, treatment), choose what it is for, and measure it on the plan or on walls. For repeated members you draw **one member line** (how long each rafter or joist is) and **a distribution run** (the line they are spaced along); the app puts a tick at every member position and counts them. For walls it places studs at centres, takes out the studs inside openings, and works out plates and noggins. Every piece is then ordered on the **company stock grid — 1200 mm, then every 300 mm (1500, 1800, 2100 …)** — one stock length per member, never joined. On Walls, a plate over 6.0 m is one 90 × 45 LVL length, and only a plate over 11.0 m is joined over a stud (Section 11). (Owner decision, 25 Oct 2026: all timber is bought in 300 mm steps; it was 600 mm steps before.) The schedule shows quantity × stock length per section/grade/treatment, with a cut list ("18 × 5,196.2 mm — one cut from each 5,400 mm length"). Sizes are always shown as **"manual selection (not structurally checked)"**.

**Walls** is one timber item for wall framing. You set the Wall height and trace the walls on the plan with **Line**. When you finish, it works out each wall's studs, bottom and top plates and noggins together, as one result. It puts studs at the stud centres, a stud at each wall end and two studs beside every window and door. It adds one noggin row up to 2,700 high and two rows above that. It is an ordering count only. It never counts kings, jacks, trimmers, lintels, bracing or tie-downs, and it never says a frame is structurally adequate.

---

## 4. Before you start

- The takeoff is open (SOP 20-01) and, for anything traced on the plan, the page is scaled and shows **Ready** (SOP 20-02).
- Know the **section** (e.g. 90 × 45), **grade** (e.g. MGP10) or species, and **treatment** (e.g. H2, H3 or "untreated") — take them from the drawings or engineer's schedule. The app does not choose them. For studs, noggins, plates and battens you pick the usual size from a list, but you still check it against the drawings.
- For rafters measured on the floor/roof plan: know the **roof pitch** from the drawings. A pitch is never read off the plan.
- For **Walls**: you need a scaled plan (page **Ready**). Know the **Wall height**, which is the stud cut length, and the **stud centres** (usually 600). Ideally the office has saved company timber products for studs, plates and noggins first (SOP 20-12), each with its grade, treatment and longest length. Then Walls is ready to order with no typing.
- For Studs, Plates or Noggins on their own: know the **stud cut length** (or frame height and the plate thicknesses), and for noggins the **number of noggin rows** from the framing detail.
- You have edit access (Section 1).
- The database has migration 207 (Section 0 feature status). Without it, saving a member line, distribution run or wall is refused (SOP 20-07 "Not saved").

---

## 5. Step-by-step process

### A. Add a timber material and set it up

1. On the takeoff overview, in the **Timber** part, tap **Add timber** (the second button, after **Add walls**). The **Timber** setup card opens ("Timber · this job only"). A material called **Timber** is created straight away — there is no Save button; every valid change saves automatically ("Changes save automatically to this job only."). **Undo** / **Redo** at the top undo changes made in this card.
2. **Name** — e.g. "Rafters 90 × 45".
3. **Purpose** — tap one: **Rafters**, **Joists**, **Studs**, **Plates**, **Noggins**, **Battens**, **Trim** or **Other member**. The purpose decides the measuring tools (Sections 5B, 5C, 5E and 5F). Walls is not one of them: for wall framing tap **Add walls** instead (Section 5D).
4. **Size and grade** (shown for Studs, Noggins, Plates and Battens, and for any purpose that has a company timber product saved for it). Tap the list and pick the size. It fills **Section depth**, **Section width** and, for studs, **Grade** in one go. You don't type them.
   - **Studs:** 90 × 35 MGP10, 90 × 45 MGP10, then the less common 120 × 35 MGP10 and 120 × 45 MGP10.
   - **Noggins:** 90 × 35. **Plates:** 90 × 45. **Battens:** 90 × 35, 70 × 35, 90 × 45, 70 × 45. These fill the size only. Type the grade yourself.
   - **Company products** (under its own heading in the list): your timber products saved for this purpose, each with its size, grade and treatment shown. Picking one fills its size, grade, treatment, species, supplier and supplier code exactly as saved. Two suppliers' products of the same size stay apart: the list shows the one you picked.
   - Picking one of the plain sizes after a company product clears that product's supplier code and species (for example "LVL"). Neither shows on the card, so a plain "90 × 35 MGP10" never goes on the order as LVL. The treatment and supplier stay, because you can see and change them.
   - **LVL:** on Studs the card says "LVL: pick your supplier's LVL from the company products. The app doesn't assume an LVL grade or treatment." Office staff save the supplier's LVL once with **New company product** (SOP 20-12). Then pick it here.
   - **Custom (enter below):** for an unusual size. It changes nothing. Type the size in the fields below.
   - One pick is one change: **Undo** takes it back. It saves straight away, and after you leave and come back the list shows the same choice.
5. **Section depth** and **Section width** (mm), **Grade (e.g. MGP10)**, **Treatment (e.g. H3)** stay on the card under the list, so you can always check or change them. A size from the list never sets a treatment: type it (for example H2, H3 or "untreated"), or pick a company product that has one. The card says "Size: **manual selection** … The app does not check structural adequacy." The list is for ordering only. It is not a structural size.
6. Repeated members (rafters, joists, battens) and studs: **Centres** (default 600 mm) and **Spacing** — **Fixed centres** or **Equal spacing** (equal bays no bigger than the centres).
7. Rafters / joists / battens — **Member length from**:
   - **Measure projection** (rafters only) — you measure the rafter **in plan**; enter the **Pitch** (°). The true length = plan length ÷ cos(pitch).
   - **Measure true length** (rafters) / **Measure length** (joists, battens) — you measure the real member length (e.g. on a section). Pitch is never applied again.
   - **Enter cut length** — type the **Cut length**; no member line is needed.
8. **Stock** (fixed): "1200 mm, then every 300 mm (1500, 1800, 2100 …) — same at every supplier." **Exception: MGP10 (Sam, 18 Nov 2026).** The shortest MGP10 length is 1200; it steps by 300 up to 3000 (1200, 1500 … 2700, 3000) and above 3 m it is only sold in 600 mm steps (3600, 4200, 4800, 5400, 6000 …), so a 3,300 cut buys 3,600 and a 2,700 cut stays 2,700. Pieces under 1,200 (noggins, cripples, short trimmers) are cut out of the longer lengths and share them, never bought as short pieces. The setup card says this rule when the grade is MGP10. LVL and other grades keep the 1200 then 300 mm steps.g. 6600 — the next grid length up is used instead; only grid lengths can be entered).
9. **More (offsets, allowance, ends, plies, supplier)** — **Start offset**, **End offset**, **End allowance (true length)** (0 unless you set one — no hidden allowance), **Plies**, **First member** / **Last member** (Included / Excluded), **Supplier**, **Size reference (schedule/drawing)** (records where the size came from, e.g. "S-101 engineer schedule"), **Availability**.
10. Read the bottom of the card: **Needs…** (what is still missing before it can be ordered — you can keep measuring), **On the order now (this job)** and the three statuses **Quantity / Installation / Procurement**. With nothing measured, Quantity reads **Not measured yet**.
11. Tap **Measure members**. Rafters / joists / battens / trim / other open the plan; studs / plates / noggins open the **Walls** screen.

> 💡 **Tip:** Changing the purpose to Joists or Battens switches the length source from "Measure projection" to a measured length — joists and battens on a plan are already their length, so no pitch is asked.

> 💡 **Tip:** Changing the purpose keeps the size you have. Plates are never copied from the studs: on Plates pick 90 × 45 (or Custom) and check the size shown.

[insert screenshot: Timber setup card — Purpose chips, section, grade, treatment, centres, Member length from, Pitch, Stock fieldset]

### B. Rafters, joists and battens — member line + distribution run

1. On the plan the tool switch shows **Member | Distribution | Select | Pan** (only **Distribution | Select | Pan** when the cut length is entered). Check **Material: <name>** at the top right.
2. **Member** — zoom in and tap both ends of **one** rafter, across the roof slope, in plan, including the overhang. The panel shows e.g. "Member line 4,500 mm measured in plan (projected) → 5,196.2 mm true at 30°". Only one member line per material: a new one replaces the old ("The new member line replaces the previous one (Undo brings it back).").
3. **Roof pitch** — shown in the Member panel for projected rafters. **Type** the new value to change it; do **not** blank it out (see Section 12).
4. **Distribution** — tap the start and end of the line the members are spaced along (e.g. along the wall plate — **not** the roof perimeter). Ticks appear at every member position with a label such as **18 rafters**. Before the member length is known the label says "(preview)".
5. How the count works: usable run = run − start offset − end offset; members at 0, centres, 2 × centres … plus one at the end; the last bay can be shorter, never longer. Example: 10,000 mm at 600 mm centres → **18 rafters** (final bay 400 mm).
6. How the length works: true length (projected ÷ cos pitch, or as measured) + end allowance → the next stock length on the grid. Example: 4,500 mm at 30° → 5,196.15 mm → **5,400 mm** stock.

[insert screenshot: plan with a member line and a distribution run showing ticks and "18 rafters"]

### C. Change one member (tick) or the whole run

1. Tap **Select**, then tap a tick. The panel shows e.g. "Rafter at 1,200 mm along the run — Needs 5,196.15 mm · 1 piece here".
2. **Remove rafter** — that position is left out (the tick greys out, the count drops). **Put it back** restores it.
3. **Duplicate** — adds a second piece at that position (e.g. a doubled rafter); **Remove a copy** takes it off. If the calculation can't include duplicates you will see "… saved here, but this version of the calculation doesn't count duplicates yet — the order doesn't include it." Do not rely on the duplicate in that case.
4. **Length for this rafter only** — type the length that member needs (e.g. a longer one at a hip). It shows "(length changed for this one)"; **Use the measured length** clears it. These changes stay tied to that position; if the run or spacing later changes and the position no longer exists, the run says "1 member change no longer matches a station … — review." Tap **Clear them** after checking.
5. **‹ Whole run — N rafters: spacing, ends, offsets** opens the run's own settings: **Start offset**, **End offset**, **Member at the start**, **Member at the end**, and **Equal bays on every run of this material** (a material rule — it re-spaces every distribution run of this timber).
6. If an offset is longer than the run you will see "No members counted — see why below." with the reason.

### D. Walls: trace once, studs, plates and noggins together

This is the normal way to take off wall framing (HUB 028). One **Walls** item gives one result with the studs, plates and noggins of every wall you trace on it.

1. On the takeoff overview, in the **Timber** part, tap **Add walls** (the first button). It is also first in **Measure with…** on the plan. A Walls item called **Walls** is made straight away ("Walls 2" for the next one), and the plan opens with **Line** chosen. No setup card comes first. If the takeoff has no plan yet, the Walls list opens instead. Add the walls there with **Wall by numbers**, or add a plan first (SOP 20-02): **Trace on plan** only shows once there is one.
2. The Line panel shows **Walls ›**, **Wall height**, **Stud centres** (600) and **Double top plate** (off). The tools are **Line | Select | Pan**: there is no Rectangle or Area for Walls.
3. **Wall height**: type the height and tap **Done** on the keypad. The Wall height is the **stud cut length** (for example 2700). The first time it is empty and says "No height yet. Type it first, or each wall will need one." On a later run it starts at this Walls item's own last height, so skip it if that is right. A cladding's height is never carried over.
4. **Stud centres** and **Double top plate** cover every wall of this Walls item. Leave them at 600 and off unless the job needs otherwise. Each change is one **Undo**. Changing the centres re-lays every wall already traced. Double top plate adds a second top plate the full length of every wall. It changes nothing else.
5. Tap the start of the run, then each corner. Double-tap the last point, or tap it and press **Finish**. To go right round a building, double-tap the start. While you trace, the Walls line and the settings hide, so **Finish** stays in view. All the walls save together with one Undo. The card says, for example, "Run 1 · 2 walls · 2,700".
6. **+ Door**: type **Height** (only the first door needs it), then tap both door edges on the wall. **+ Window**: type **Height** and **Sill height**, then tap both window edges. They are labelled D1, W1 and so on (SOP 20-09 Section C2). Tap **Trace more walls** when the openings are in.
7. Read the **Walls line** under the settings, for example "Walls: 21 studs at 2,700 · bottom plate 10.00 m · top plate 10.00 m · 13 noggins (1 row)".
   - With Double top plate on, the top plate reads "top plate 2 × 10.00 m".
   - Walls of different heights read "21 studs (13 at 2,700, 8 at 3,000)" and "(1–2 rows)".
   - A wall that can't be worked out adds nothing to the totals and is named: "… · Wall 1 not counted". The reason shows straight under the line, for example "Wall 1: enter the Wall height.".
8. **Details ›** opens the **Walls** card. A new Walls item starts with Blue Leaf's framing (Sam, 25 Oct 2026), so there is nothing to fix:
   - **Studs** 90 × 35 LVL Smart 10, H2;
   - **Plates** (bottom, top and second top) 90 × 45 MGP10, H2 (pine: LVL isn't used on the ground by default);
   - **Long plates (over 6.0 m)** 90 × 45 LVL Smart 10, H2, up to 11.0 m;
   - **Noggins** 90 × 35 MGP10, untreated.
   The wall page shows each part with its grade and treatment. A Walls item saved before these defaults still shows **Details: 3 to fix ›**. At the top it lists what each part still needs, naming the part, for example "Plates: enter the treatment (or "untreated").". Then its notes, for example "Lintels, jacks and trimmers at D1, W1 aren't counted.". Then **Name**, **Stud centres**, **Double top plate** and the Walls line.
9. The card's closed fold **Studs, plates, noggins** holds each part: **Studs**, **Plates**, **Long plates (over 6.0 m)** and **Noggins**. Each has the **Size and grade** list (Section 5A step 4), **Section**, **Grade**, **Treatment** and **Longest length**. Type the longest length in mm (6000, not 6). It is at least 1,200, the shortest timber length: a smaller number is refused there ("Enter 1,200 mm or more."). Open the fold only for an exception, for example 90 × 35 studs. A saved company product picked there fills that part only, its longest length too. Nothing is copied from one part to another. **Trace walls** at the top goes back to the plan.
10. **Review walls** (on the run card and the panel) opens the first wall. Each wall page leads with its own line, for example "Walls: 13 studs at 2,700 · bottom plate 6.00 m · top plate 6.00 m · 9 noggins (1 row)", then its own notes. The studs beside openings are drawn as full studs, and the studs inside an opening are greyed. **Next wall ›** goes wall to wall (SOP 20-09 Section C4).
11. **Done** on the plan goes back to the overview. The Walls row has **Setup** (the Walls card), **Walls** (the wall list) and **More** › **Remove**. It has no **Add lengths** and no **Save as standard**.
12. Extra members such as trimmers, lintels or jacks go on a **separate Timber item** (**Add timber**, purpose **Other member**, with **Add lengths**), because a Walls item takes traced walls only.

#### Wet-area walls at 450 (HUB 031)

Each wall has its own **Stud centres**. The Walls item's number is what a wall uses unless you change that wall.

1. Tap **Select** (with nothing selected).
2. Tap **Wet-area walls at 450**.
3. Tap each wet-area wall. It turns blue and its label says "450 ctrs". Tap it again to put it back to the item's centres.
4. Tap **Done**.
5. One wall only: **Select** the wall, then tap **450** under **Stud centres**.

> 💡 **Tip:** 450 changes the stud spacing only. Noggins and plate joins follow the studs. Blocking for vanities, grab rails and taps is not added: count it on a Timber item. The button isn't there when the Walls item is already at 450. A Studs, Plates or Noggins item ignores a wall's own centres and says so.

#### Windows and doors: framing worked out for you (HUB 031)

When a window or door is on a Walls wall, the app works out its framing. You tap nothing extra.

1. Open the Walls card (**Details ›**) and open **Roof and openings**. The office fills it in once: **Do these walls carry the roof?**, **Roof covering** (sheet or tile), **Roof width these walls carry**, **Rafter or truss spacing**, **Wind class**, and **Lintels from** (SmartLVL 13 or pine MGP10). A blank stays blank: the opening says "needs roof information". Nothing is guessed.
2. One wall can differ: **Select** the wall and tap **Yes** or **No** under **Carries the roof**.
3. Each opening then has a king and jacks each side, cripples above and below at that wall's centres, trimmers, and a lintel where the wall carries the roof. Tap the opening on its wall page: **Framing worked out: …** says what it counted.
4. Tap the **Lintel** row to add load information (the roof width that opening carries) or to type a size. A size you type is used as it is. **Use the table** puts it back.
5. A lintel that can't fit under the head says so: "a 240 deep lintel won't fit. Only 145 mm is free above the head."
6. A COMPLETE framing detail typed on an opening (Section 5F) replaces all of this for that opening. An unfinished one (for example only the "no extra members" tick, or no reference) is not used: the opening is framed automatically and a note says "W1 has an unfinished framing override that isn't used. Finish it or clear it.". On the opening, **Framed automatically** lists what was worked out and **Override framing** holds the manual editor (Finish / Clear on an unfinished one). Untick **Work out the framing at windows and doors** to turn it off for the whole item.

#### + Door and + Window: Cavity slider and Full height (HUB 031)

1. Tap **+ Door**. Tap **Cavity slider**, type the **Door width** once (920). The opening is always 2 × the door + 20 (1,860).
2. Tap the doorway end of the slider on the wall, then tap towards the pocket. The second tap only gives the direction, so it chooses the pocket side. If the opening runs 100 mm or less past the wall end it is slid back and the card says so. More than that, or running into another opening, is refused and the first tap is kept.
3. **Full height** (door or window): nothing to type. The opening runs to the top of the wall and stays there if the wall's height changes later. A window keeps its Sill.
4. Both chips start off every time you tap **+ Door** or **+ Window**. The next slider takes 2 taps and remembers the door width.
5. A door already drawn: **Select** the wall, **Open elevation**, tap the door, then tap **Cavity slider**. The door keeps its width and its place; the opening doubles (2 × door + 20) towards the pocket, on the side that has room (right if both do). **◀ Pocket left** and **Pocket right ▶** sit under the toggle and move only the pocket (the wall start is left). Changing **Door width** keeps the jamb edge (the edge away from the pocket) still. Turning Cavity slider off puts the plain door back where it stood. A pocket that would run past the wall or into another opening is allowed but shows an amber warning. **Full height** is on the same sheet.

[insert screenshot: Line panel on a Walls item: Wall height, Stud centres, Double top plate, the Walls line and Details: 3 to fix ›]
[insert screenshot: Walls card: needs, the lintels note, the Walls line and the closed Studs, plates, noggins fold]

### E. Studs, plates or noggins on their own (exceptions)

Use these only for an exception. Normal wall framing is **Add walls** (Section 5D). Don't put Studs, Plates or Noggins on walls that already have Walls: both are counted, and Walls shows "Wall 2 is also on Studs 1, so its framing may be counted twice.".

1. **Measure members** on a studs / plates / noggins material opens the **Walls** screen (same screen as cladding — SOP 20-09). Add a wall with **Wall by numbers** (name, shape, length, then height) or **Trace on plan** (Wall tool: tap each corner, double-tap the last point or **Finish**; each straight leg becomes its own wall).
2. Make sure the wall uses this timber: open it and check **Materials on this wall** shows **✓ Uses …** (tap **Use … here** if not). The wall rows no longer carry these buttons (HUB 022), and walls on other materials are folded under **Other walls**.
   - Timber keeps the **Wall** tool. Cladding traces with **Line** instead, which sets the height before you trace and keeps you on the plan (SOP 20-09 Section 5C).
3. **Studs** — in the setup card: **Stud cut length (or frame height)** and **That is: Stud cut / Frame height**. Frame height needs **Bottom plate(s) thickness** and **Top plate(s) thickness** (never assumed). Blank uses the wall height as the stud cut length. On the wall, the **Supports** view shows a line per stud (e.g. a 3,600 mm wall at 600 centres → 7 studs).
4. Openings (add them on the wall — SOP 20-09 Section 5C): studs strictly inside an opening are **removed** (greyed "Removed stud"). The **Supports** view counts the studs ("Studs 90 × 45: 5 studs at 2,400 mm."). **More**, at the bottom of the wall, says what they cover ("Studs 90 × 45: base studs only; opening framing incomplete.") and holds the wall's note "W1: base studs only; opening framing incomplete — needs its framing detail." (notes, statuses and the drawing's explanations are folded there, as on cladding walls: SOP 20-09 Section C4). Tapping a stud shows its cut length; there is no stepping through the studs, and **‹ Previous wall** / **Next wall ›** at the bottom go wall to wall. **Kings, jacks, trimmers, sills and lintels are never guessed** — add them as their own timber material or entered lengths (Section 5F) from the framing detail.
5. **Plates** — **Plates per wall: Bottom + top** or **Bottom + double top**; each wall gives one piece per layer at the wall length (e.g. 3,600 wall → 2 × 3,600). Plates can also be measured with **Run** or counted with **Count** on the plan.
6. **Noggins** — **Stud centres** and **Noggin rows** (from the framing detail — "never inferred"). Each clear bay (centres − stud width) is one noggin per row, ordered on the stock grid (600 centres, 45 wide → 555 mm cuts from 1,200 mm stock). Without rows you will see "Enter the number of noggin rows or select it from a reviewed framing detail…".

### F. Trim, other members, counts and typed-in lengths

1. **Trim / Other member** on the plan: tools **Run | Count | Select | Pan**.
2. **Run** — tap the start and each corner, double-tap the last point (or **Finish**). **A plan corner is a joint for timber**: every straight leg becomes its own piece ("2 straight pieces added — each corner is a joint, so every straight leg is its own piece. Undo removes them all."). An extra tap part-way along a straight leg is merged, not a new piece.
3. **Count** — type **Cut length of each piece** first, then tap each place. Each tap is one piece, ordered on the next stock length.
4. **Typed-in lengths** — on the overview tap **Add lengths** on the timber row, type the length and **Qty**, tap **Add**. For timber this is a **cut length**: it is put on the stock grid (2,350 → 2,400; 500 → 1,200; 1,200.1 → 1,500). Entered lengths are listed under the form with a **Remove** button each.

### G. Check the schedule

1. Overview → **Open schedule**. Each timber material is its own group: name, "Timber · 90 × 45 · MGP10 · H2", "Size: manual selection (not structurally checked)", the three statuses (**Quantity / Installation / Ordering**), notes and problems.
2. Rows read **quantity × what is bought**, e.g. "18 pieces · 90 × 45 MGP10 H2 — 5,400 mm length". Tap a row for the cut list ("Cuts: 18 × 5,196.2 mm — one cut from each 5,400 mm length"), where it came from ("Distribution run …", "Member line … · projected") and **Show on plan** / **Show on wall**.
3. **How this was worked out** lists every step (true length, usable run, members, stock).
4. "Note: The longest available stock isn't set for this product — confirm it before ordering." is advisory — set **Longest available length** in the setup card once the supplier confirms it.

---

## 5E. Wall junctions and corners (extra studs and blocks where one wall meets another)

You do nothing to get these. The takeoff already knows where each wall starts and finishes on the plan, so it works out where one wall ends against another. Sam's owner rules of 18 November 2026 apply.

1. **T-junction.** The end of one wall (the butting wall) lies on another wall's run (the continuous wall), not at that wall's own ends, and the two are not nearly parallel (under 20 degrees apart). The end may be up to one wall thickness (90 for a 90 x 45 stud) off the continuous wall's centreline, so tracing to the face of the wall on the plan still counts. Both walls must be on the same plan page and the same Walls item. Walls on one page drawn under different calibrations are compared in real millimetres; if those calibrations really disagree (a different scale) the takeoff skips that page and says so in a note.
2. **What the continuous wall gets.** Two junction studs with a 90 mm space between them (the butting wall's thickness), cut at the continuous wall's own Wall height. They are extra to the studs already counted. A junction stud within one stud width of a stud already counted is not added twice, and one inside a window or door, or past the wall's end, is not counted. Each case is named on the wall page.
3. **Junction blocks.** Plus 300 mm long 90 x 45 blocks, laminated in pairs, at 900 centres up the wall, fixed in the 90 mm space between the junction studs. Per junction: **2 x the wall height divided by 900, rounded up**: 6 blocks on a 2.4 or 2.7 m wall, 8 on a 3.0 m wall. They are ordered as one length per junction (6 x 0.3 = 1.8 m; 8 x 0.3 = 2.4 m) cut from stock lengths, the same way the supplier take-off lists them. A junction with no counted stud has no blocks.
4. **Where you see it.** The Walls line reads "21 studs at 2,700 + 2 junction studs + 6 junction blocks". The elevation draws the junction studs in teal ("Junction stud") and the blocks between them at their heights ("Junction block"). The supplier take-off and PDF print the junction studs and blocks under **JUNCT. BLK** (for example `1/1.8` for the blocks), apart from STUDS.
5. **Corner (an L).** Two walls whose ends meet at an angle of 20 degrees or more. Walls are traced as one continuous line, so the takeoff goes by direction: the wall that **starts** at the corner gets 2 studs (its normal start stud and a second stud for the internal-corner plasterboard fixing, 112.5 mm from its start on a 90 x 45 wall); the wall that **ends** there has its normal end stud only. 3 studs a corner in all. If two walls both start there, or both end there (drawn separately), the **longer** wall gets the 2 studs. The second stud is a full stud: it is counted in the Walls line and prints under **STUDS**; the elevation draws it teal ("Corner stud").
6. **Swap a corner.** On the wall page, under the Walls line, each corner is listed ("Corner with Wall 2: this wall takes the second corner stud (that wall starts at the corner)") with **Swap**, which hands the second stud to the other wall. Tap it again to undo.
7. **Joins that are not corners.** A wall traced in two collinear legs (under 20 degrees) is not a corner: no extra stud and it is not reported. If a wall meets the join of the two legs, the two legs count as one continuous wall: exactly 2 junction studs, the two leg-end studs at the join are dropped, and the blocks are counted once.
8. **Remove one.** Each junction is listed on the continuous wall's page ("Wall 2 butts in at 3,000: stud at 2,932.5; stud at 3,067.5. 6 blocks (3 pairs of 300 mm) go between the studs.") with **Remove**. It then reads "removed by hand" with **Count** to put it back; the junction studs and the blocks go together. Each junction has its own switch, so one wall end between two walls turns off only the one you pick. The switch for the whole item is the Walls setting `junctionStuds` (off = none).
9. **Notes.** If a butting wall is blocked (for example it has no height yet) the continuous wall still gets its junction studs, and a note says which wall isn't counted. Two walls that cross each other (X) are flagged in a note and not counted. Three or more wall ends at one point get a note and no corner stud.
10. **Moving a wall moves its junction.** Nothing is stored except your switches: every junction and corner is worked out again each time.
11. **Walls with no plan points** (typed lengths) have no position, so they never form junctions or corners.

## 6. What happens next

- Every change autosaves (SOP 20-07). The server recalculates every count and length from the drawn lines, walls and rules — it never trusts numbers sent from the phone.
- The schedule and **Review & export order** show the timber lines by unit (pieces); the supplier PDF lists the **stock lengths to supply**, and the separate **Site appendix (cutting & setout)** lists the timber cut list (SOP 20-06).
- Nothing is ordered, sent or emailed. Nobody is notified.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Drawing the distribution run around the roof perimeter | The perimeter looks like "the roof" | Draw the line the members are spaced **along** (e.g. the wall plate) |
| Measuring the rafter's true length on the plan and also entering a pitch | Mixing "projection" and "true length" | On a plan choose **Measure projection** + pitch; on a section choose **Measure true length** (no pitch) |
| Blanking the **Roof pitch** on the plan screen to "remove" it | Expecting blank = not entered | Type the correct pitch; blank on the plan screen saves 0° (Section 12) |
| Treating the stud count as the full framing package | The wall shows studs | Base studs only — add kings, jacks, trimmers and lintels from the framing detail |
| Typing a cut length in **Add lengths** and expecting that exact length to be ordered | The help text says "used exactly" | For timber the cut length goes up to the next stock length (Section 12) |
| Expecting the app to pick the section | It looks like a design tool | Section, grade and treatment come from the drawings / engineer |
| Picking a size from **Size and grade** and leaving the treatment blank | The list fills the size and grade only | Type the treatment, or pick a company product that has one |
| Typing an LVL grade on a stud | There is no LVL row in the list | Pick the supplier's LVL from the company products (ask the office to save it once) |
| Leaving **Noggin rows** blank | Assuming it follows cladding support spacing | Enter the rows from the framing detail |
| Typing the overall frame height as the **Wall height** on Walls | It looks like the height of the wall | On Walls the Wall height is the **stud cut length**. Double top plate adds a plate. It never changes the stud length |
| Tapping the first wall before typing the Wall height | The first Walls run starts with an empty Wall height | Type the Wall height first, then tap. A wall with no height is "not counted" until it has one |
| Expecting every noggin to be bought on its own length | Noggins items buy each noggin its own length | On Walls, noggins share lengths at 6,000 unless a saved noggin product says otherwise. Clear the noggins' longest length under Details and every noggin buys its own 1,200 |
| Looking for a noggin rows box on Walls | Studs and Noggins items ask for rows | Walls sets the rows itself: walls at 2,700 or under get one noggin row, walls over 2,700 get two |
| Tracing a wall from the other end and expecting the same studs | Set-out starts at the first point of each wall | Studs set out from where each wall was traced from: the start of the run, then each corner |
| Missing a nib or return | Short walls are easy to skip | Trace every nib and return, especially wet-area nibs |
| Tracing a shared wall twice | Two rooms share it | Don't trace a shared wall twice. Every wall you trace is counted |
| Changing the whole Walls item to 450 centres for the wet areas | The item's Stud centres covers every wall without its own | Use **Select** then **Wet-area walls at 450**, or **Select** the wall and tap **450** |
| Setting up a second Walls item for the wet areas (the old method) | It was the only way before 18 Nov 2026 | Use **Wet-area walls at 450** on the one Walls item. An older job with a Walls 2 still works, with the counted-twice note if a wall is on both |
| Typing 1,860 for a 920 cavity slider | The opening is wider than the door | Tap **Cavity slider** and type the door width, 920. The opening is worked out |
| Turning on Cavity slider for a door drawn at its whole opening (1,860) | The opening doubles, as it should: the door is what is drawn | Turn Cavity slider off, then type the real door width (920) before turning it on. Door width can also be changed while it is on |
| "Lintels, jacks and trimmers at D1 aren't counted until the detail is complete" with a Reviewed detail chip lit | A framing detail was started on the opening (only the source chip, nothing else) | Since 18 Nov an unfinished detail (a bare chip, or "no extra members" with no reference) no longer stops the automatic framing; the wall page says the override isn't used. Tap **Clear** if you do not want it, or **Finish** to complete it and replace the automatic framing |
| Opening a cladding wall from **Other walls** and tapping **Use here** on Walls | The wall is already traced for the cladding | Walls reads the wall's height as the stud length. A cladding height (e.g. 2,745) buys 3,000 studs and can add a second noggin row. The **Use here** banner says the height it would use. Trace the framing fresh at the stud length instead |
| Typing the longest length in metres (6 for 6 m) | Lengths elsewhere read in metres | Lengths are in mm: type 6000. Under 1,200 is refused at the field |
| Expecting the bottom plate to stop at each doorway | The plan shows the doorway | The bottom plate is ordered full length. Cut the doorway out of the bottom plate after standing the frame |
| Putting Studs, Plates or Noggins on walls that already have Walls | Older jobs used three items | Don't. Both are counted, and Walls shows a note if you do |
| Lintel "not sized" on every window | The roof isn't described yet | Open **Roof and openings** on the Walls card. Fill in covering, roof width, spacing and wind class. Or tap the lintel and type a size |
| Expecting a lintel the span tables can't size | The span is past the table, the wind class is N5 or C, or it's a lower storey | The opening says "needs an engineer or the supplier". Tap the lintel and type the size you were given |
| Expecting the sill height to be from the bottom plate | Heights on the elevation are from the floor | The app takes the bottom plate off (45) when it works out cripples and jacks. Type heights from the floor |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Enter the timber section (e.g. 90 × 45)." / "Enter the grade or species." / "Enter the treatment (or "untreated")." | Setup incomplete | Pick from **Size and grade** or fill those fields in the setup card |
| No **Size and grade** list on the card | Rafters, Joists, Trim and Other member have no built-in sizes, and no company timber product is saved for that purpose | Type the size in the fields, or ask the office to save a company product for that purpose |
| The list shows **Custom (enter below)** | The size or grade typed matches no row (for example 140 × 45, or MGP12 on a stud) | Nothing is wrong. Pick a row to change it, or leave it |
| A company product isn't in the list | It was saved for another purpose, or it was retired | Save it for this purpose, or use **Company products** above the card |
| "Pitch is required." (schedule, no rafter line) | Projected rafters with no pitch | Enter the pitch (setup card **Pitch** or plan **Roof pitch**) |
| "Measure one member (the member line) or enter the cut length." | No member line | Draw one with **Member**, or choose **Enter cut length** |
| "Draw the distribution run the members are spaced along." | No distribution run | Draw one with **Distribution** |
| "No members counted — see why below." | Offsets longer than the run, or both ends excluded on a tiny run | Fix the offsets in **‹ Whole run …** |
| "N member change(s) no longer match(es) a station … — review." | The run or spacing changed after you changed single members | Check, then **Clear them** and redo the changes |
| "… cannot be cut from any compatible stock (… Unavailable — no clamping or splice.) …" | A member is longer than **Longest available length** (or every grid length up to it is marked unavailable) | Change the detail, or set a supplier-confirmed longer length |
| "Only grid lengths (1200, 1500, 1800 …) can be marked unavailable — off-grid sizes are never added." | Typed an off-grid length (e.g. 6500) | Enter grid lengths only |
| "W1: base studs only; opening framing incomplete — needs its framing detail." | A wall with studs has an opening | Add the opening framing from the detail as its own timber / entered lengths |
| "Enter the number of noggin rows …" | Noggins without rows | Enter **Noggin rows** |
| "Frame A: enter the bottom and top plate thickness to turn the frame height into a stud length." | Frame height chosen without plate thicknesses | Enter both, or switch to **Stud cut** |
| Rafters suddenly ordered shorter (e.g. 4,500 instead of 5,400) | The plan **Roof pitch** was blanked (saved as 0°) | Re-type the pitch |
| Timber ordered before 25 Oct 2026 shows under **Placed, but no longer in the takeoff**, and the same pieces show as not ordered on a shorter length (e.g. 2,700 instead of 3,000) | Timber is bought in 300 mm steps since 25 Oct 2026 (it was 600 mm steps), so many stock lengths changed | Don't re-order. The placed lengths still cut the same pieces. On a draft order, tap **Update to what's needed now** if it shows, or **Remove line** and add the line again |
| Tick label says "(preview)" | Member length not known yet | Draw the member line, enter the pitch or the cut length |
| "Not saved: One or more values are not valid for this field." on a member/distribution/wall | Migration 207 missing on that database | Apply migration 207 to that (non-production) database; production waits for the Director |
| **Details: 3 to fix ›** on the Line panel, or "Walls: 3 parts need setup (studs, plates and noggins)." on a wall page | A Walls item saved before Blue Leaf's default framing (26 Oct 2026): its parts have no grade or treatment yet | Tap **Details**, open **Studs, plates, noggins** and pick or type the product for those parts. Or ask the office to save company products once (SOP 20-12) |
| "Lintels, jacks and trimmers at D1, W1 aren't counted." | **Work out the framing at windows and doors** is switched off on the Walls card (or the job is older and the box is unticked) | Tick it. Or type a framing detail on each opening |
| "W1: lintel not sized (the wind class isn't set)." | A roof answer is missing (it names which) | Fill it in under **Roof and openings**, or type the lintel size on the opening |
| "W1: a 240 deep lintel won't fit. Only 145 mm is free above the head." | The head is close to the top of the studs | Lower the window, or confirm the lintel sits in the top plate. The lintel is still counted |
| "Jambs are 2 each side (a king and one jack, the minimum). …" | No roof described, or a stud section the jamb table doesn't list | Describe the roof, or leave it: 2 each side is never fewer than a normal opening |
| "Wall 3 is set to 450 centres, but Studs uses its own centres (600) for every wall." | The wall is on a Studs item (older jobs) | Use a Walls item for a wall with its own centres |
| "A 1,860 opening doesn't fit on Wall 4 (1,500 long). Tap a longer wall." | The slider is wider than that wall | Tap a longer wall |
| "From there, the 1,860 opening runs 300 past the end of Wall 4." | The doorway end is too near the wall end | Tap towards the pocket from a point further in, or Undo this end |
| "A 1,860 opening runs into W1." | The slider would overlap another opening | Move W1 first, or place the slider elsewhere |
| "Wall 4 has no height yet. Select it and type its height, or turn off Full height." | Full height needs the wall's height | Select the wall and type its Wall height |
| The Walls line ends "· Wall 1 not counted" | That wall can't be worked out. The reason is straight under the line | Fix what it says (the rows below). The other walls still show their quantities |
| "Wall 1: enter the Wall height." | The wall was traced with no height | **Select** the wall and type its **Wall height** |
| "Wall 1 is sloped or traced as an outline. Walls only works out straight walls of one height." | A sloping, gable or outline wall is on Walls | Trace it with **Line** as straight walls of one height |
| "Wall 1: Openings W1 and W2 overlap along the wall — frame them as one opening or with explicit members." | Two openings overlap on one wall | Fix the openings on the wall's elevation |
| An order line "Plates 90 × 45 LVL", and the wall page says "Plates: 90 × 45 LVL (over 6.0 m)" | Plates over 6.0 m come as one 90 × 45 LVL length, up to 11.0 m | Expected. Longer plates are joined over a stud |
| "Wall 1: the bottom plate has no stud to join over from … to … mm." | A plate over 11.0 m with no stud centre to join it over. That wall adds nothing to the totals, so the line ends "· Wall 1 not counted" | Re-trace the wall, or trace it as two walls |
| "Plates: the longest length must be at least 1,200 mm." (or Studs, or Noggins), and the line reads "Walls: Wall 1 and Wall 2 not counted" | That part's longest length is under 1,200, the shortest timber length (for example 6, meaning 6 m, from an older entry or a saved product). No wall can be worked out | Tap **Details**, open **Studs, plates, noggins** and type that part's **Longest length** in mm (6000) |
| Nothing on the Walls item can be ordered, although only one wall has a problem | Any block on one wall holds the whole Walls order, studs and noggins included | Fix that wall. The other walls still show their quantities |
| "Studs: the longest length isn't set. Confirm it before ordering." | The studs part has no longest length (none was given) | Set the studs' **Longest length** under Details once the supplier confirms it. It doesn't hold up the order |
| "Noggins: each is cut from its own 1,200 length. Set the noggins' longest length under Details to share lengths across walls." | The noggins' longest length was cleared | Set it again under Details (6,000 by default) |
| "Wall 2 is also on Studs 1, so its framing may be counted twice." (or "… also on Walls 2 …") | That wall is on this Walls item and on an older Studs, Plates or Noggins item, or on another Walls item (for example a wet-area Walls 2) | Take the wall off one of them (**Materials on this wall**) |
| "Walls can't use a manual / polyline / count measurement — assign it to the right material." (the app shows one of the three words, and the item's own name, e.g. "Walls 2") | An entered length (manual), a Run (polyline) or a Count was put on a Walls item | Put extra members on a separate Timber item |
| "That calculation method is not available." on Walls | The phone still runs the app from before the update | Reload the app. The work is kept on the device (SOP 20-07) |

---

## 9. Related modules

- [20-01 Takeoffs overview, access & switching it on → who can use timber takeoff](20-01_takeoff_overview.md)
- [20-02 Set up plans and scale a page → a Ready scale before tracing members](20-02_set_up_and_scale_plans.md)
- [20-09 Cladding walls, openings and the generated elevation → the Line tool, + Window / + Door, the run card and Review walls that Walls uses; the Walls screen used for studs, plates, noggins](20-09_cladding_walls_and_elevation.md)
- [20-05 Length schedule and splitting → the schedule window](20-05_length_schedule_and_split.md)
- [20-06 Export a supplier order and record it as placed → ordering timber, site appendix cut list](20-06_export_and_record_orders.md)
- [20-07 Saving, recovery and conflicts → the save chip](20-07_saving_recovery_conflicts.md)
- [20-12 Company product catalogue → company timber products](20-12_company_product_catalogue.md)

---

## 10. Screenshot placeholders

[insert screenshot: overview Timber part with Add walls / Add timber, Cladding part with Add cladding / Add aluminium]
[insert screenshot: Line panel on a Walls item: Wall height, Stud centres, Double top plate, the Walls line]
[insert screenshot: Walls card: needs, notes, Walls line, Studs, plates, noggins fold opened]
[insert screenshot: a Walls wall page: its Walls line, notes and studs beside D1 drawn as full studs]
[insert screenshot: Timber setup card — Needs…, On the order now, three statuses]
[insert screenshot: plan — Member tool panel "Member line 4,500 mm measured in plan (projected) → 5,196.2 mm true at 30°"]
[insert screenshot: plan — distribution run with ticks "18 rafters"]
[insert screenshot: tick panel — Remove rafter, Duplicate, Length for this rafter only]
[insert screenshot: Whole run panel — offsets, Member at the start/end, Equal bays]
[insert screenshot: wall Supports view — studs, two removed inside W1]
[insert screenshot: schedule — Rafters group "18 pieces · 90 × 45 MGP10 H2 — 5,400 mm length" with cut list]

---

## 11. Automation notes

- **Add timber** upserts a `takeoff_job_materials` row at once: `spec` { family "timber", purpose "rafters", section {}, stock { kind "grid", minMm 1200, incrementMm 300 } }, `rules` { centresMm 600, lengthSource "projected" }, method `repeated_members@2` (studs → `wall_frame@1`, plates / noggins / trim / other → `linear_stock@1`). Each setup edit is a further upsert (autosave, SOP 20-07).
- **Member line:** `takeoff_measurements` `kind` 'member', two plan points, `geometry.inputs.mode` 'projected' | 'true'; contribution `role` 'member'. One per material — a new one archives the previous (`archived_at`).
- **Distribution run:** `kind` 'distribution', two points, inputs { startOffsetMm, endOffsetMm, includeStart, includeEnd, spacing, overrides[] }; contribution `role` 'distribution'. Tick changes are `overrides` entries { station, removed | lengthMm | duplicate } on that measurement.
- **Walls / openings:** `kind` 'wall' (`role` 'wall') and 'opening' (`parentId` = wall) — see SOP 20-09.
- **Runs / counts / typed lengths:** timber Run finishes as one `kind` 'polyline' per straight leg (`role` 'primary'); Count = `kind` 'count'; Add lengths = `kind` 'manual'.
- **Calculation** (`shared/takeoff/engine/timber.js`, `dispatch.js`, run in the browser for display and again on the server for every save/export): positions T1 (count = ceil(usable ÷ centres) + 1), length T2 (projected ÷ cos pitch), stock T3 = max(1200, ceil(L ÷ 300) × 300) within the longest available / unavailable list (300 mm steps since 25 Oct 2026, OWNER-2026-10-25); one stock piece per member; studs T4; plates / noggins T5. Sizing provenance is `manual` unless a **Size reference** is entered — never "verified".
- **Schedule / order lines:** generic purchase lines `unit` 'piece', `item.description` "90 × 45 MGP10 H2 — 5,400 mm length"; order lines carry `unit` + `item` (migration 207).
- No email, notification or file is created.

**Walls (HUB 028).** Plan: `docs/hub_review/WALLS_FRAMING_PLAN.md` (Sam's decisions of 25 October 2026, rounds 1 to 3). No migration.

- **Add walls** upserts one `takeoff_job_materials` row: name "Walls" ("Walls 2" …), method `wall_framing@1`, `spec` { v 1, family "timber", purpose "walls", plies 1, endAllowanceMm 0, spareRate 0, components { studs, plates, longPlates, noggins } }. Each part is { section { depthMm, widthMm }, grade, treatment, species, supplierName, productCode, stock { maxMm, unavailableMm } }. `rules` { centresMm 600, doubleTopPlate false }. "walls" is not one of the Purpose chips.
- Walls and openings are the HUB 022 records, unchanged: `kind` 'wall' with 2 points and `inputs` { kind "rect", heightMm, name, runId, seq } (the server adds widthMm, the traced length), and `kind` 'opening' with `parentId` and `inputs` { xMm, sillMm, widthMm, heightMm, label, type }. One `role` 'wall' contribution per wall.
- `wall_framing` reads walls only (`methodReads` = ["wall"]). The server refuses a Run, Count or entered length on a Walls item ("Walls can't use a manual / polyline / count measurement — assign it to the right material.", with the kind and the item's own name).
- Never stored: stud stations, studs beside openings, plate pieces, noggin rows and bays, stock lengths and the Walls line. `computeWorkspace` works them out again in the browser and on the server every time. Order lines carry `item.component` (studs, plates, longPlates, noggins).
- The rules, each with its source. [Sam] = Sam's answer (24 and 25 October 2026). [doc] = the review doc or an existing engine rule. [Default, needs Sam] = what the build does until Sam says otherwise.
  - **Studs.** [Sam] Studs at the Stud centres along each wall (0, c, 2c … plus the wall end: ceil(L ÷ c) + 1 before openings), and a stud at each wall end. Walls never uses offsets. [Default, needs Sam] Set-out starts at each wall's first traced point (the start of the run, then each corner); openings are measured from the same point. [Default, needs Sam] One Stud centres value per Walls item; Wall height is per wall.
  - **Corners.** [Sam] 2 studs at a corner, one from each wall (a closed run too). No third corner stud, and nothing at a T-junction (separate runs aren't linked).
  - **Openings.** [Sam, round 2; with the opening rules off, or a typed framing detail] 2 full-length studs each side of every opening (window, door, other), labelled "Wall 1 stud @ 932.5 (beside D1)", never "king". The first stud's face sits on the opening edge (centre at the edge ∓ w/2), the second against it (∓ 3w/2), w = the stud thickness along the wall (45). A side stud never sits outside the wall. [Default, needs Sam] Between two openings g apart there are floor(g ÷ 45) side studs, 1 to 4; openings closer than half a stud share one. [doc] Centre studs strictly inside an opening come out, and nothing is added under sills or above heads. [Default, needs Sam] A sill or head above the studs is clipped into the stud height with a note, never a block. [doc] Overlapping openings block that wall.
  - **Merge.** [Sam, round 2] Studs whose centres are closer than one stud thickness are one stud: an end stud beats a side stud, a side stud beats a centre stud, a first side stud beats a second. Touching studs are both kept.
  - **Stud length.** [Sam] Stud cut length = that wall's own Wall height. The item-wide stud height is never read, and Double top plate never changes the cut.
  - **Framing details.** [doc] An explicit framing detail on an opening still adds its own members, with the note "Check the studs beside D1 aren't counted twice.". [Sam, HUB 031] Without one, the opening rules work its framing out (see below). The old line returns only with the Walls card's **Work out the framing at windows and doors** off (with one note saying why), or when the Plates section has no width: "Lintels, jacks and trimmers at D1, W1 aren't counted."
  - **Shapes.** [Default, needs Sam] Straight walls of one height only. A sloped, gable or outline wall, or one with no height, gets one blocking line naming it. Rectangle and Area aren't offered for Walls.
  - **Plates.** [doc] One bottom and one top plate per wall. Double top plate adds a second top plate (layer `top-2`) the full length of every wall. [Sam, round 2] The bottom plate is bought the full wall length (no door gaps): the crew cuts the doorway out after standing the frame. [Sam, as read] Top plates run continuous over openings, one piece per wall per layer. [Default, needs Sam] Plate length = traced wall length, with no corner deduction.
  - **Long plates.** [Sam, round 3] A plate piece longer than the pine plates' longest length (6,000 by default; a saved plate product's own wins) is one 90 × 45 LVL length from the Long plates part, on its own "Plates 90 × 45 LVL" line and "Long plates cut list". [Default, needs Sam] LVL is bought in 300 mm steps from the first step over the pine plates' longest length (6,300 over the 6,000 default, 5,100 over a saved 4,800 plate product), with 11,000 allowed. [Sam, round 3] Only a plate over 11,000 is joined over a stud, at the furthest stud centre that keeps the piece within 11,000. [Default, needs Sam] Each piece after a join is LVL if over 6,000, else pine. If no stud centre fits, that wall is blocked, naming it, and it adds nothing to the totals ("· Wall 1 not counted").
  - **Longest lengths.** [doc] A part's longest length is at least 1,200, the timber grid's shortest. The Walls card refuses less at the field. One that came in under it (an older entry or a saved product) is a need naming the part ("Plates: the longest length must be at least 1,200 mm."), and no wall is worked out until it is fixed, so nothing reads as 0.00 m.
  - **Noggins.** [doc + Sam] A wall over 2,700 has 2 rows (owner rule "HUB 028: over 2,700 mm = 2 rows"); exactly 2,700 is not over. [Sam] 2,700 or under has 1 row ("HUB 028: 2,700 mm or under = 1 row"). [doc] One noggin per row in each clear bay between the counted studs; clear = gap − half of each bordering stud, using the stud's thickness (555 at 600 centres with 90 × 45 studs). [Sam] No noggins in a bay that overlaps any opening. [Default, needs Sam] Touching studs leave no bay: no noggin and no block. A short bay is counted, however short.
  - **Height changes.** [doc, HUB 022] Each wall uses its own Wall height. [Default, needs Sam] A straight wall split by a height change is two walls, so the join has 2 studs.
  - **Stock.** [Sam, round 2] All timber is bought on the 1,200 then 300 mm grid (LVL also allows 11,000, off the grid), the smallest length that fits. A piece is never clamped or made from two lengths: a Walls plate over 11,000 is first split over a stud (see Long plates). [doc] One length per stud. [Sam] One length per plate piece, no offcut sharing. [Sam] Noggins share lengths across every wall of the Walls item at 6,000 (a saved noggin product's own longest length wins); there is no sharing between two Walls items. [Default, needs Sam] A part with no longest length gets one note naming it ("Studs: the longest length isn't set. Confirm it before ordering."). [Default, needs Sam] Kerf 0, no spares.
  - **Products.** [Sam, decision 6, 25 Oct 2026] Studs 90 × 35 LVL Smart 10 H2 (so the stud thickness along the wall is 35). Plates 90 × 45 MGP10 H2. Noggins 90 × 35 MGP10 untreated. [Sam, round 3] Long plates 90 × 45 LVL Smart 10 H2, longest 11,000. [Default, needs Sam] Exactly one active company timber product for a part's purpose fills that part (`wallPartFill`: size, grade, treatment, species, supplier, code, longest length and "not stocked" lengths); with two or more, the built-in row stays and the products are one pick away. [doc, HUB 027] Nothing is copied between parts. [Default, needs Sam] Each part keeps its own order lines and cut list ("Studs cut list", "Plates cut list", "Long plates cut list", "Noggins cut list"), even for the same product.
  - **Two items on one wall.** [Default, needs Sam] A wall also on a Studs, Plates or Noggins item, or on another Walls item, gets one note on each Walls item that doesn't block. Both are still counted.
  - **Use here.** [Default, needs Sam] A Walls item takes a wall's own height as the stud length, so Use here of a cladding wall uses the cladded height. The **Use here** banner says so ("Its height, 2,745, would be the stud length."), and an empty Walls list doesn't point to **Other walls**.
  - **Blocks.** [doc] Any blocking problem goes on every line of the Walls item, studs and noggins included. The other walls still show their quantities.
  - **Never counted.** [doc] Tie-downs, bracing and blocking. Walls never says a frame is structurally adequate.
  - **Stud centres per wall (HUB 031).** [Sam, 17 Nov 2026] A wall's own `inputs.studCentresMm` (the app writes only 450; the server keeps 100 to 1,200) beats the item's Stud centres. Clearing it deletes the key. Plate joins and noggin bays follow the counted studs. [Sam] This replaces the old "Walls 2 at 450" method.
  - **Opening framing (HUB 031).** [Sam, 17 Nov 2026] Worked out by `engine/openingRules.js` for every opening with no framing detail of its own; a typed detail always wins. Heights are measured from the FLOOR: the stud cut sits on a bottom plate (the Plates part's thickness, 45), so levels from the stud base are the elevation's levels minus the plate. Cripples above and below are counted at the wall's own stud centres. The jamb count per side includes the king and the stud under the lintel: jacks = jambs − 1, and never fewer than 2 a side. [Default, needs Sam] Jacks are as long as the head; a lintel or head trimmer is as long as the opening plus the jack stack each side; trimmers are cut from the Plates part's product; the lintel is H2 (the Plates part's treatment). [Default, needs Sam] Trimmers stack by clear width: 1 up to 1,500, 2 up to 2,700, 3 over. Sam's PDFs are span tables only and don't carry the AS 1684 stacking clause, so these breakpoints are a stand-in. The item says so once. A wall that doesn't carry the roof gets head trimmers and no lintel; a window with a sill gets sill trimmers; a door gets none. Unknown "carries the roof" is treated as carrying (never fewer studs than a loadbearing wall) and asks for the lintel.
  - **Cavity slider data (18 Nov 2026).** `cavityLeafMm` (the door) and `cavityPocket` are the stored truth, written together with `xMm` and `widthMm` (the whole opening) in one save, so the door's place is always read back the same way: pocket right, door at `xMm`; pocket left, door at `xMm` + door + 20. Saved sliders already hold both and are never rewritten. An unfinished framing detail of any shape (takeoff-calc@9) no longer switches the automatic opening framing off; only a detail complete by the engine's own check (`framingDetailMissing` in timber.js) wins. Notes: `framing_override_unfinished` (per opening), `framing_auto_unavailable` (once per item).
  - **Cavity slider (HUB 031).** [Sam, 17 Nov 2026] The opening is 2 × the door + 20, stored as a door with `cavityLeafMm`, `cavityPocket` (the side the door slides into) and `widthMm` = the whole opening. Framing: king + jacks at the doorway end, 2 full studs at the pocket end, no stud or noggin in the pocket, a lintel over the whole opening and head trim (stacked by width). [Default, needs Sam] The pocket end bears the lintel on its full studs (no jack); the head trim's thickness isn't taken off the cripples above.
  - **Full height (HUB 031).** [Sam] `inputs.fullHeight` on the opening: its height is the wall's height minus the sill, worked out every time. The stored height is only a snapshot, rewritten in the same edit when the wall's height or the sill changes. The head is the underside of the top plate: no cripples above. In a wall that carries the roof a full-height opening needs an engineered beam (no table covers it): the opening says so and counts the rest.
  - **Lintels and jambs from tables (HUB 031).** [Sam] Suggested from cited span tables for the roof the office described (`engine/openingSelectors.js`, `standards/index.js`). Fail closed: a missing answer is "needs roof information"; a wind class outside the table (pine: N1, N2; SmartLVL 13 and Smart10: N1 to N4), a lower storey, a roof width over 7,500, a spacing over 1,200 or a span past the table is "engineer"; never a default or nearest size. The roof width and spacing round UP to the next column. Choice: x45 sections first, one member before a laminated pair, the shallowest, and the first that fits under the head. A lintel is never wider than the wall (2 × 63 isn't offered in a 90 wall). Where a table asks for more than the 35 mm minimum bearing and the jacks give less, a note says so. Tap the lintel to give that opening its own roof width, or type a size (used as typed, not checked). Jamb studs per side: the Smart10 jamb table for LVL Smart 10 studs (Sam's default), AS 1684.2 T11 for MGP10 studs; any other stud grade or section the table doesn't list says "not in table".
  - **Tables mapped (HUB 031).** Every table is in `shared/takeoff/standards/data/` with its source, edition and page, generated by `scripts/takeoff/standards/`. AS 1684.2 N1/N2 Supplement 4 (2006), MGP10: T17, T18 (lintels, pdf pages 22, 23), T47, T48 (lower-storey lintels, 50, 51), T11 (jamb studs, 14), T7 (studs, 11), T36 (lower-storey studs, 41), ported from Bestimator's verified tables; the four lintel tables were re-read from Sam's PDF by script (92 rows match). Smart10 LVL Stud Design Guide (Mar 2024): jamb studs (pdf p. 11, guide p. 9), common studs un-notched (pdf 7) and 20 mm notched (pdf 9), lintels (pdf 17, N1 to N4 block). SmartLVL 13 Design Guide (E1 2021): single span lintels, single/upper storey N1 to N4 (pdf 22, 23, guide pp. 19, 20), with the extra-bearing subscripts. Not mapped yet: C1 to C3 pages, lower-storey LVL lintels, concentrated-load tables, and SmartLVL 13's floor, rafter, beam and other member tables. Smart10 is for internal, fully protected walls (guide p. 3): outside walls need the supplier's say. These are Sam's licensed extracts and the manufacturers' guides: they are for the private Hub only and are never redistributed.

---

## 12. Edge cases and limits

- **HUB 031.** A wall on two Walls items keeps its own 450 on both. An old cached app (before the update) shows 600-centre numbers on screen while orders and exports use 450 (the server works them out). Existing Walls items have the opening rules ON, so an older job's Walls line changes (more studs, jacks, trimmers, cripples) the next time it is opened: untick **Work out the framing at windows and doors** to keep the old counts. Saved order lines are stale after this release (`CALCULATION_VERSION` takeoff-calc@5). One lower storey, N5, N6 and C wind classes, a roof width over 7,500 and a concentrated load are an engineer's or the supplier's: the opening says so. Sloped, gable and outline walls aren't framed by Walls.

- **Size and grade list (HUB 027, Sam's choices 21 Oct 2026):** studs 90 × 35, 90 × 45, 120 × 35 and 120 × 45, all MGP10; noggins 90 × 35; plates 90 × 45; battens 90 × 35, 70 × 35, 90 × 45 and 70 × 45. Rafters, joists, trim and other members have no built-in sizes.
- **Still to confirm with Sam:** a grade for noggins, plates and battens (none was stated, so those rows fill the size only); whether 120 × 35 and 120 × 45 studs are MGP10 (built as MGP10); which LVL products and treatments to save; a treatment for battens ("as applicable" was stated, so no row sets one).
- The list never sets a treatment and has no LVL row. An LVL grade and treatment only ever come from a saved company product.
- The choice itself is not saved. The list shows the row that matches the saved fields: a company product when the job holds exactly what it fills (size, grade, treatment, species, supplier and supplier code), else the plain size row. **Custom** shows when nothing matches. While the card is open the list keeps showing the row just picked, even if two rows hold the same values.
- A company product picked from the list fills its size, grade, treatment, species, supplier and supplier code only. It does not bring centres or other settings, and the job isn't linked to it for company updates. **Use on this job** under **Company products** (above the card) still copies the whole product.
- Picking a built-in size after a company product keeps the treatment and supplier shown on the card, but clears that product's supplier code and species (`spec.productCode`, `spec.species`: neither has a field on the Timber card, and both belonged to the product).
- Plates are never copied from the studs. The plate size stays on the card to check and change.

- **Known issue — Roof pitch on the plan screen:** blanking the **Roof pitch** field on the Member panel saves **0°** (the setup card's **Pitch** field correctly treats blank as "not entered"). Always type a value there. Reported to the owner 2026-10-14.
- **Known wording issue — Add lengths for timber:** the form's help says "Entered lengths are used exactly — no allowance or rounding." For timber the entered length is a **cut length** that is ordered on the next stock length (2,350 → 2,400). The schedule shows the stock length and the cut list shows the cut.
- Only one member line per repeated-member material; for rafters of different lengths use another material, change single ticks (**Length for this rafter only**), or enter hip/valley/jack lengths individually.
- Disconnected distribution runs each restart their own spacing; there is no automatic phase matching between runs.
- Studs items (not Walls): base studs only. Corners, T-junctions, brace panels and opening framing are explicit additions.
- Timber items other than Walls: stock is one piece per member — members are never joined to reach a length, and a member longer than the longest available length is **unavailable**, never clamped. On Walls a plate over 6.0 m is one 90 × 45 LVL length, and only a plate over 11.0 m is joined over a stud (Section 11, Long plates).
- The overview's "Length schedule … pcs" total adds every unit together (pieces, sheets, bars, LM). Read quantities in the schedule window, not that total.
- Plan lines need a Ready scale on the current plan revision; a re-scale or replaced plan flags them (SOP 20-02).
- **Walls (HUB 028):**
  - **Corners** get 2 studs, one from each wall. A closed run is the same where the last wall meets the first. **T-junctions** get no extra stud, because separate runs aren't linked.
  - **Openings** get 2 full studs each side. Where an opening edge falls on the stud grid, the grid stud and the first stud beside it are one stud (closer than 45 mm). Example: W1 from 1,200 to 3,000 on a 4,000 wall at 600 centres gives 8 studs: 0, 600, 1,132.5, 1,177.5, 3,022.5, 3,067.5, 3,600 and 4,000.
  - A **door at a wall end** keeps the wall's end stud at the door edge. The studs beside it go on the wall side only, never outside the wall.
  - A **height change** partway along a straight wall makes two walls, so the join has 2 studs (a 6,000 wall split at 3,000 has 12 studs, against 11).
  - **Short noggins** beside openings are counted as worked out, for example 287.5 mm between the stud at 600 and the outer (second) stud beside D1 at 932.5. Two touching studs beside an opening leave no bay, so no noggin goes there.
  - **No corner deduction:** each plate is the traced wall length, so the two plates at a corner overlap by a stud width. It over-orders slightly but never short.
  - **Mixed heights** on one Walls item read on one line, lowest first: "Walls: 21 studs (13 at 2,700, 8 at 3,000) · bottom plate 10.00 m · top plate 10.00 m · 17 noggins (1–2 rows)".
  - Stud centres and Double top plate cover the whole Walls item. A per-wall centres, a noggin row override, plies, kerf and spares are not on Walls.
  - Stud centres and Double top plate are stored on the item. A change marks every draft order line of that Walls item for review (one dependency key per item). The quantities are still right.
  - Walls counts every wall it is given. A shared wall traced twice is counted twice, and so is a wall on two Walls items, or on Walls and an older Studs item (those two with a note).
- Undo/redo on the plan covers the current visit to that screen (up to 100 steps); the setup card has its own Undo/Redo.

---

## 13. Owner of the process

Admin / Director  
Next review date: 2027-04-14

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] **UI Review Mode, your own server — never port 5180 (the owner's preview) and never production.** From the repo: `VITE_UI_REVIEW_MODE=true npx vite --port <PORT> --strictPort` (agents in parallel may use a no-HMR config with `--config <your vite.nohmr.config.mjs>`). Playwright needs `PLAYWRIGHT_BROWSERS_PATH=0` and `UI_REVIEW_PORT=<PORT>`. Stop your server when done.
- [ ] Phone viewport 390 × 844 with touch (375 × 812 for layout checks).
- [ ] Open `http://localhost:<PORT>/carpentry/cjb-1/takeoff?reviewRole=admin&takeoffSeed=mixed` (SYNTHETIC mixed job). It contains **Rafters 90 × 45** (rafters, 600 centres, projected, 30°) with a seeded **10,000 mm distribution run** (`m-dist`) and a **4,500 mm projected member line** (`m-mem`), and **Trimmers** (other member) with an entered **4 × 2,350 mm**.
- [ ] "Expected record" in UI Review Mode = the fake server's copy. In the page console: `await (await fetch("/api/takeoff/workspaces/ws-1")).json()` → `snapshot.materials / measurements / contributions`; `window.__takeoffReviewState()` → `{ revision, commits, measurements }`. A full page reload re-seeds the fake data.
- [ ] Plan positions: PDF point for (x mm, y mm) on page 1 = `{ x: 120 + x × 0.0283464567, y: 150 + y × 0.0283464567 }`; screen position = `document.querySelector("[data-takeoff-viewport]").takeoffViewport.toScreen(pt)` + the viewport's bounding rect; zoom with `.takeoffViewport.zoomOn(pt, factor)`. Taps land on whole pixels — zoom in before drawing and allow ±40 mm on drawn lengths.
- [ ] Optional live-stack run (local only, isolated test DB with migrations **206 and 207**, `TAKEOFF_ENABLED=true`, `BLH TEST` job) for the DB checks marked "Live DB".
- [ ] **Walls (TC-15 to TC-24):** open `http://localhost:<PORT>/carpentry/cjb-1/takeoff?reviewRole=admin&section=timber_cladding` (page 1 is scaled). `&takeoffSeed=walls` adds one Walls item with nothing traced (overview → **Measure** opens it); `&takeoffSeed=walls-products` saves one company product per Walls part. The worked example's run on page 1: A (2000, 3000) → B (8000, 3000) → C (8000, 7000), so Wall 1 is 6,000 and Wall 2 is 4,000. D1's edges are (3000, 3000) and (3820, 3000). W1's edges are (8000, 4200) and (8000, 6000). Zoom right in on each point before tapping it (`zoomOn(pt, 40)`), and wait about half a second between taps on the same spot of the screen, or two taps read as a double-tap.
- [ ] **Reload in UI Review Mode** = leave the takeoff and come back inside the app, because a browser reload re-seeds the fake data: in the console `history.pushState({}, "", "/carpentry/cjb-1?reviewRole=admin"); dispatchEvent(new PopStateEvent("popstate"))`, then the same with the takeoff URL. The real server's reload is covered by `scripts/tests/takeoff-api.test.mjs` ("HUB 028 step 6") and the real-stack journey WF (`e2e/ui-review/tc-journeys-sandbox.spec.js`).

### Test cases

**TC-01 — Happy path (seeded rafters → schedule)**
1. On the overview tap **Open schedule**.
2. Find the group **Rafters 90 × 45** and tap the row starting **18 pieces**.
3. Expected result: row "18 pieces · 90 × 45 MGP10 H2 — 5,400 mm length"; "Timber · 90 × 45 · MGP10 · H2"; "Size: manual selection (not structurally checked)"; chips **Quantity: Calculated**, **Installation: Not specified**, **Ordering: Ready to order**; "Quantities only — installation details are not verified by the app."; "Note: The longest available stock isn't set for this product — confirm it before ordering."; expanded row "Cuts: 18 × 5,196.2 mm — one cut from each 5,400 mm length", "Comes from" lists "Distribution run — Distribution run · 10,000 mm" and "Member line — Member line · 4,500 mm · projected"; **Show on plan** button.
4. Tap **How this was worked out**: includes "4,500 mm projected ÷ cos 30° = 5,196.15 mm true length" and "10,000 mm usable → 18 members at 600 mm centres, final bay 400 mm".
5. Expected record: material `mat-raf` `methodKey` "repeated_members", `rules` { centresMm 600, lengthSource "projected", pitchDeg 30 }; contributions `c-dist` role "distribution", `c-mem` role "member". Live DB: `takeoff_measurements` kinds 'distribution' and 'member'; `takeoff_contributions.role` 'distribution' / 'member'.
- [ ] Pass  [ ] Fail

**TC-02 — Empty / invalid required fields**
1. Overview → **Add timber**. Read **Needs…**.
2. Type `6500` in **Grid lengths this supplier doesn't stock (optional)** and press Enter; then `6600`.
3. Type `0` in **Centres** and press Enter.
4. Close the card. Open the mixed job's **Rafters 90 × 45** → **Setup**, clear **Pitch** (blank, Enter), then **Open schedule**.
5. Expected result: step 1 — Needs lists "Enter the timber section (e.g. 90 × 45).", "Enter the grade or species.", "Enter the treatment (or "untreated")." and Quantity shows **Not measured yet**; step 2 — "Only grid lengths (1200, 1500, 1800 …) can be marked unavailable — off-grid sizes are never added." for 6500, accepted for 6600; step 3 — "Enter a number greater than 0." and centres stay 600; step 4 — the Rafters group shows "Needs before ordering:" with "Pitch is required." and "Nothing to order yet — see what it needs above."
6. Expected record: step 2 → new timber material `spec.stock.unavailableMm` = [6600] only; step 4 → `mat-raf.rules.pitchDeg` absent/null (not 0).
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission (one member line; Add lengths twice)**
1. Overview → **Measure** → **Material: …** → **Rafters 90 × 45**. Tool **Member**: zoom in and tap two points 3,500 mm apart vertically (e.g. (6200, 3000) and (6200, 6500)).
2. Overview → on **Trimmers** tap **Add lengths**, type 2350 / Qty 4 → **Add** (same as the seeded entry).
3. Expected result: step 1 — "The new member line replaces the previous one (Undo brings it back)." and exactly **one** member line is drawn (never two); **Undo** brings the 4,500 line back. Step 2 — the list under the form shows **two** separate "4 × 2,350 mm" rows each with **Remove** (entered lengths are not merged or de-duplicated); the schedule shows "8 pieces · 90 × 45 MGP10 H2 — 2,400 mm length".
4. Expected record: step 1 → one live contribution with role "member" for `mat-raf`; step 2 → two `kind` "manual" measurements for `mat-trim`.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Open `/worker/takeoff/carpentry/cjb-1?takeoffSeed=mixed` (leading hand). Check the timber rows and the **Add timber** card.
2. Open `/worker/takeoff/carpentry/cjb-1?takeoffWorker=ordinary`.
3. Expected result: step 1 — **Add timber**, **Setup**, **Add lengths**, **Remove** are available; **Save as standard** is **not** shown on any row, and the setup card has no **New company product** button. Step 2 — "You don't have access to this." / "Takeoffs are for leading hands and office staff." and no takeoff content.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (autosave + recalculation)**
1. Note `window.__takeoffReviewState().revision` (R) and `.commits` (C).
2. Rafters 90 × 45 → **Setup** → change **Centres** to 450 (Enter). Wait for the chip **Saved**.
3. **Open schedule**.
4. Expected result: chip **Saving…** then **Saved**; revision = R + 1 and commits = C + 1; Rafters group now "24 pieces · 90 × 45 MGP10 H2 — 5,400 mm length" (10,000 mm at 450 → 23 bays + 1); "How this was worked out" says "24 members at 450 mm centres".
5. Expected record: `mat-raf.rules.centresMm` = 450. Live DB: `takeoff_job_materials.rules.centresMm` 450, `takeoff_workspaces.revision` + 1. No email/notification.
- [ ] Pass  [ ] Fail

**TC-06 — Tick changes: remove, duplicate, length override**
1. **Measure** → material **Rafters 90 × 45** → **Select** → tap the **3rd** tick on the seeded run (1,200 mm along).
2. Type `6000` in **Length for this rafter only** (Enter), then tap **Duplicate**.
3. Tap the **6th** tick → **Remove rafter**. Tap **‹ Whole run — …**.
4. Tap **Done** → **Open schedule** → Rafters group.
5. Expected result: step 1 panel "Rafter at 1,200 mm along the run" / "Needs 5,196.15 mm · 1 piece here"; step 2 "Needs 6,000 mm (length changed for this one) · 2 pieces here" and **Use the measured length** / **Remove a copy** appear; step 3 run label "18 rafters" (18 stations − 1 removed + 1 copy) and the panel "18 rafters at 600 mm centres"; step 4 rows "2 pieces · 90 × 45 MGP10 H2 — 6,000 mm length" and "16 pieces · 90 × 45 MGP10 H2 — 5,400 mm length", footer "18 pieces". (If the tick panel instead says the calculation "doesn't count duplicates yet", record it — the order must then show 1 × 6,000 + 16 × 5,400.)
6. Expected record: `m-dist.inputs.overrides` holds { station …1200, lengthMm 6000, duplicate 1 } and { station …3000, removed true }.
- [ ] Pass  [ ] Fail

**TC-07 — Stock grid 1200 + 300 and unavailable stock**
1. Overview → **Trimmers** → **Add lengths**: add 500 × 1, 1200 × 1, 1201 × 1 and 4200 × 1 (one at a time). **Open schedule** → Trimmers.
2. Back → Trimmers → **Setup** → in the **Stock** box set **Longest available length (optional)** = 4800 (Enter) → **Close**. On the overview **Add lengths** 4801 × 1. **Open schedule** → Trimmers.
3. Expected result: step 1 rows "2 pieces … — 1,200 mm length" (500 and 1,200), "1 piece … — 1,500 mm length" (1,201), "1 piece … — 4,200 mm length" (4,200 stays 4,200) plus the seeded "4 pieces … — 2,400 mm length"; step 2 the group shows **Ordering: Stock unavailable** with "Needs before ordering:" containing "cannot be cut from any compatible stock" and "Unavailable — no clamping or splice."; no 4,800 or 5,100 line is added for the 4,801 piece, and the "longest available stock isn't set" note is gone.
4. Expected record: manual measurements keep the entered lengths (1201 stays 1201 in the record — only the order line is on the grid); `mat-trim.spec.stock.maxMm` = 4800.
- [ ] Pass  [ ] Fail

**TC-08 — Length source: true length and entered cut length (pitch never applied twice)**
1. Rafters 90 × 45 → **Setup** → **Member length from: Measure true length**. **Open schedule**.
2. Back → **Setup** → **Enter cut length**, **Cut length** 4300. **Measure members**.
3. Expected result: step 1 "18 pieces … — 4,500 mm length" and the explanation "4,500 mm measured true length — already sloped, pitch not applied"; step 2 the plan tools are **Distribution | Select | Pan** (no Member) and the schedule shows "18 pieces … — 4,500 mm length" with "4,300 mm entered cut length — pitch not applied".
- [ ] Pass  [ ] Fail

**TC-09 — Studs on a wall with an opening (base studs only)**
1. Overview → **Add timber** → Purpose **Studs**, section 90 × 45, grade MGP10, treatment H2 → **Measure members**.
2. **Wall by numbers**: name "Frame A", length 3600 (Enter), **Wall height** 2400 (Enter).
3. **Add opening** → Offset from wall start 1000, Sill height 900, Width 1200, Height 1200.
4. Expected result: step 2 — the **Supports** view is selected and shows 7 stud lines; tap one → "Cut length 2,400 mm"; step 3 — 2 studs show "Removed stud" (inside the opening), 5 remain; the Supports view reads "Studs 90 × 45: 5 studs at 2,400 mm."; **More** at the bottom of the wall (closed until tapped) shows "Studs 90 × 45: base studs only; opening framing incomplete." and the note "W1: base studs only; opening framing incomplete — needs its framing detail." and Quantity is not "Calculated" (shows Incomplete) and Ordering is not "Ready"; at the bottom "1 of 1" with **Review order ›**.
5. Expected record: wall measurement `inputs` { kind "rect", widthMm 3600, heightMm 2400, name "Frame A" } with contribution role "wall"; opening with `parentId` = the wall.
- [ ] Pass  [ ] Fail

**TC-10 — Trim run: a corner is a joint**
1. **Measure** → material **Trimmers** (tool **Run** selected). Zoom in. Tap (1500, 2000), (2700, 2000), (4000, 2000), (4000, 3500) → **Finish**.
2. **Undo**, then **Redo**. Switch to **Select** and tap the first leg.
3. Switch to **Count**.
4. Expected result: step 1 — before finishing "This run makes 2 pieces."; after **Finish** "2 straight pieces added — each corner is a joint, so every straight leg is its own piece. Undo removes them all." and two straight lines labelled ≈2,500 and ≈1,500 (±40); step 2 — one Undo removes both and reopens the drawing (4 points); Select shows "A straight piece — a corner is a joint, so trace the next leg as its own run." with no "+" markers; step 3 — the field is **Cut length of each piece** (not "Finished length (no allowance added)").
5. Expected record: +2 measurements of `kind` "polyline", each 2 points, role "primary" for `mat-trim`.
- [ ] Pass  [ ] Fail

**TC-11 — Known issue check: blank Roof pitch on the plan**
1. **Measure** → material **Rafters 90 × 45** → **Member** tool → clear **Roof pitch** and press Enter.
2. Expected result (current build): the panel reads "… → 4,500 mm true at 0°" and the stored `mat-raf.rules.pitchDeg` is **0**. Record this as the known issue in Section 12 (the desired behaviour is "not entered", as in the setup card). Re-type 30 and confirm "→ 5,196.2 mm true at 30°".
- [ ] Pass  [ ] Fail

**TC-12 — Timber walls keep the Wall tool (HUB 022)**
1. Add a **Studs** material (as TC-09) → **Measure members** → **Trace on plan**.
2. Expected: the tools are **Wall | Select | Pan** (no **Line**); the panel says the height last used here (e.g. "Height 3,000 mm (last used here)").
3. Tap three points of an L-shaped wall run, then double-tap the last point. Expected: two walls ("Wall N", "Wall N+1"), each one straight leg; the first wall's elevation opens, as before.
4. **‹ Walls**: the two walls are listed on their own (timber walls have no run); open one → **Materials on this wall** shows **✓ Uses Studs …**.
5. Screen test: e2e/ui-review/tc-measure.spec.js "Wall tool (timber studs)".
- [ ] Pass  [ ] Fail

**TC-13 — Size and grade list (HUB 027)**
1. Overview → **Add timber**. Read the card on **Rafters**, then tap **Studs**.
2. Tap **Size and grade** and read the list. Pick **90 × 45 MGP10**.
3. Tap **Undo**, then **Redo**. Close the card, leave the takeoff, come back and open the material's **Setup**.
4. Tap **Noggins**, **Plates** and **Battens** in turn and read each list. Then **Plates** → pick **90 × 45**.
5. Tap **Studs**, type **Section depth** 140 and **Section width** 45. Then pick **90 × 35 MGP10** and then **Custom (enter below)**.
6. As office staff, save a company timber product (SOP 20-12) for **Battens**: 70 × 35, MGP10, treatment H3, supplier "Supplier A". Reopen the takeoff, **Add timber** → **Battens** → pick it from **Company products** in the list. Then change **Treatment** to H4.
7. Expected result: step 1 — no list on Rafters; step 2 — list "Choose a size…", 90 × 35 MGP10, 90 × 45 MGP10, 120 × 35 MGP10, 120 × 45 MGP10, Custom (enter below); the line "LVL: pick your supplier's LVL from the company products. The app doesn't assume an LVL grade or treatment."; after the pick **Section depth** 90, **Section width** 45, **Grade** MGP10, **Treatment** blank, Needs says "Enter the treatment"; step 3 — one Undo clears all three, Redo puts them back, after coming back the list still shows 90 × 45 MGP10; step 4 — noggins 90 × 35, plates 90 × 45, battens 90 × 35, 70 × 35, 90 × 45, 70 × 45 (each list ends with Custom (enter below); "Choose a size…" only shows while no size or grade is entered), and on Plates picking 90 × 45 keeps the grade MGP10 from before; step 5 — the list reads Custom for 140 × 45 and still after coming back; Custom after 90 × 35 MGP10 changes no value and saves nothing; step 6 — the option reads "<name> — 70 × 35 · MGP10 · H3", picking it fills **Treatment** H3, it is still H3 after coming back; after H4 the list shows 70 × 35 and the company product still says H3.
8. Expected record: step 2 → the material's `spec.section` { depthMm 90, widthMm 45 }, `spec.grade` "MGP10", no `spec.treatment`, `methodKey` "wall_frame", `spec.stock` still the 1200 + 300 grid; no new field is stored for the choice. Step 6 → `spec.treatment` "H3", `spec.supplierName` "Supplier A"; after H4 the company product (`GET /api/takeoff/presets`) keeps `spec.treatment` "H3" and revision 1. Live DB: `takeoff_job_materials.spec` holds section, grade and treatment as above.
9. Screen tests: e2e/ui-review/tc-catalogue.spec.js "HUB 027: …" (7 tests); node: scripts/tests/takeoff-tc-hub027.test.mjs.
- [ ] Pass  [ ] Fail

**TC-14 — Size and grade: two suppliers, and a plain size after an LVL product (HUB 027 review)**
1. As office staff, save two company timber products for **Battens**, both 70 × 35, MGP10, H3: "Yard A batten 70 × 35 H3" (supplier Yard A, code A-7035) and "Yard B batten 70 × 35 H3" (supplier Yard B, code B-7035). Save a third for **Studs**: "Supplier B LVL 90 × 45" (90 × 45, grade LVL13, treatment H2-S, species LVL, code LVL9045).
2. Reopen the takeoff. **Add timber** → **Battens** → pick **Yard B …** in **Size and grade**. Close, leave the takeoff, come back and open its **Setup**. Pick **Yard A …**, then the plain **70 × 35**. Leave and come back again.
3. **Add timber** → **Studs** → pick **Supplier B LVL 90 × 45**, then the plain **90 × 35 MGP10**. Leave and come back, then **Close** and read the overview row.
4. Expected result: step 2 — the list shows **Yard B …** after the pick and after coming back; then **Yard A …**; then **70 × 35**, still after coming back, with the fields 70 / 35 / MGP10 / H3. Step 3 — the list shows **90 × 35 MGP10** after the pick and after coming back; the row reads "90 × 35 · MGP10 · H2-S", never "LVL".
5. Expected record: step 2 → after Yard B `spec.supplierName` "Yard B", `spec.productCode` "B-7035"; after the plain 70 × 35 `spec.productCode` null. Step 3 → `spec.grade` "MGP10", `spec.treatment` "H2-S", `spec.species` null, `spec.productCode` null.
6. Screen tests: e2e/ui-review/tc-catalogue.spec.js "HUB 027: two suppliers' battens …" and "HUB 027: LVL comes only from a selected company product …"; node: scripts/tests/takeoff-tc-hub027.test.mjs ("review: …").
- [ ] Pass  [ ] Fail

**TC-15 — Walls (HUB 028): the 2,700 worked example, then a reload**
1. Open the Walls URL (pre-test setup, no seed). In the **Timber** part tap **Add walls**.
2. Expected: the plan opens with **Line** checked and the tools **Line | Select | Pan** (no Rectangle, Area or Wall). No Timber card shows first. The panel shows **Walls ›**, **Wall height** empty with "No height yet. Type it first, or each wall will need one.", **Stud centres** 600, **Double top plate** off and **Details ›** (Blue Leaf's default framing: nothing to fix).
3. Type `2700` in **Wall height** (Enter). Tap A and B, then double-tap C.
4. Expected: the card "Run 1 · 2 walls · 2,700" and the line "Walls: 19 studs at 2,700 · bottom plate 10.00 m · top plate 10.00 m · 17 noggins (1 row)". The Status fold under the panel reads **Status**.
5. Tap **+ Door**, type Height `2040` (Enter), tap D1's two edges, then **Trace more walls**. Tap **+ Window**, type Height `1200` and Sill height `900`, tap W1's two edges, then **Trace more walls**.
6. Expected: the line "Walls: 21 studs at 2,700 · bottom plate 10.00 m · top plate 10.00 m · 13 noggins (1 row)". It never says "to confirm".
7. Tap **Review walls**. Expected: Wall 1's page leads with "Walls: 13 studs at 2,700 · bottom plate 6.00 m · top plate 6.00 m · 9 noggins (1 row)" and "Lintels, jacks and trimmers at D1 aren't counted.". Its drawing has 13 full studs (the 4 beside D1 drawn like the rest) and 2 greyed inside D1. **Next wall ›**: "Walls: 8 studs at 2,700 · bottom plate 4.00 m · top plate 4.00 m · 4 noggins (1 row)".
8. Reload (pre-test setup), overview → Walls row → **Setup**. Expected: the Walls card shows no needs (Studs 90 × 35 LVL Smart 10 H2, Plates 90 × 45 MGP10 H2, Noggins 90 × 35 MGP10 untreated; an older item from the walls-needs seed still names each part's need, "Studs: enter the treatment (or "untreated")." …), the notes "Lintels, jacks and trimmers at D1, W1 aren't counted." and "Studs: the longest length isn't set. Confirm it before ordering.", the same Walls line, and the closed **Studs, plates, noggins** fold. **Trace walls** goes back to the plan with the same line and Wall height 2700.
9. Expected record: ONE material `methodKey` "wall_framing", `spec.purpose` "walls", `spec.components` with studs, plates, longPlates and noggins (plates and noggins `stock.maxMm` 6000, long plates 11000 grade "LVL"), `rules` { centresMm 600, doubleTopPlate false }; 2 walls (`role` "wall"), one `runId`, `seq` 1 and 2, `heightMm` 2700; openings D1 (type "door", xMm 1000, widthMm 820, heightMm 2040) and W1 (type "window", xMm 1200, widthMm 1800, sillMm 900). `computed.scheduleLines` for the item, as [part, quantity, length]: studs 21 × 2,700; plates 2 × 6,000 and 2 × 4,200; noggins 1 × 4,800 and 1 × 1,800 (the 13 noggins are 6,525 mm, shared at 6,000). Each part has its own cut list ("Studs cut list", "Plates cut list", "Noggins cut list"). No king, jack, trimmer or lintel line. Live DB: `takeoff_job_materials.method_key` 'wall_framing', `spec.components` as above.
10. Screen tests: e2e/ui-review/tc-hub028.spec.js "screen 1-6 …" and "screen 7 …"; node: scripts/tests/takeoff-tc-hub028.test.mjs; real server: scripts/tests/takeoff-api.test.mjs "HUB 028 step 6"; real stack: tc-journeys-sandbox.spec.js journey WF.
- [ ] Pass  [ ] Fail

**TC-16 — Walls at 3,000 with Double top plate (HUB 028)**
1. Open the Walls URL with `&takeoffSeed=walls` → **Measure**. Type `3000` in **Wall height**. Trace A → B → C and add D1 and W1 as in TC-15.
2. Expected: "Walls: 21 studs at 3,000 · bottom plate 10.00 m · top plate 10.00 m · 26 noggins (2 rows)".
3. Tick **Double top plate**.
4. Expected: "Walls: 21 studs at 3,000 · bottom plate 10.00 m · top plate 2 × 10.00 m · 26 noggins (2 rows)". Only the top plate changes. Wall 1's page: "Walls: 13 studs at 3,000 · bottom plate 6.00 m · top plate 2 × 6.00 m · 18 noggins (2 rows)".
5. Expected record: `rules.doubleTopPlate` true. Lines: studs 21 × 3,000; plates 3 × 6,000 and 3 × 4,200 (was 2 × 6,000 and 2 × 4,200 before step 3); noggins 4,800 + 4,500 + 3,900 (26 noggins, 13,050 mm), the same before and after step 3.
6. Untick **Double top plate**. Expected: back to step 2's line and 2 × 6,000 + 2 × 4,200 plates. The stud and noggin lines never changed.
7. Screen tests: e2e/ui-review/tc-hub028.spec.js "screen 1-6 …" (step 5); node: scripts/tests/takeoff-tc-hub028.test.mjs (the 3,000 example and the switch).
- [ ] Pass  [ ] Fail

**TC-17 — Walls: Stud centres 450, one Undo, and a reload (HUB 028)**
1. Open the Walls URL with `&takeoffSeed=walls` → **Measure**. Type `2700` in **Wall height** and trace A → B → C.
2. Expected: "Walls: 19 studs at 2,700 · bottom plate 10.00 m · top plate 10.00 m · 17 noggins (1 row)".
3. Type `450` in **Stud centres** (Enter). Expected: "Walls: 25 studs at 2,700 · bottom plate 10.00 m · top plate 10.00 m · 23 noggins (1 row)". Record: `rules.centresMm` 450.
4. Tap **Undo** once. Expected: Stud centres 600, the step 2 line again, and `rules.centresMm` 600.
5. Type `450` again (Enter), wait for **Saved**, then reload (pre-test setup) and tap **Measure**.
6. Expected: Stud centres 450, "25 studs" on the line, and Wall height starts at 2700 (this Walls item's own last height). The fake server still holds one Walls item with 2 walls.
7. Screen tests: e2e/ui-review/tc-hub028.spec.js "screen 1-6 …" (step 3) and "screen 10 …".
- [ ] Pass  [ ] Fail

**TC-18 — Walls: longest length, two Walls items on one wall, and Use here (HUB 028 final review)**
1. Open the Walls URL (pre-test setup). **Add walls**, type `2700` in **Wall height** and trace A → B → C. Tap **Details ›**, open **Studs, plates, noggins** and type `6` in the Noggins **Longest length** (Enter).
2. Expected: the field says "Enter 1,200 mm or more." and keeps 6000. The Walls line is unchanged ("Walls: 19 studs at 2,700 · … · 17 noggins (1 row)"). Type `6000` back if you changed anything.
3. Back on the overview tap **Add walls** again (it makes "Walls 2"), set **Stud centres** to `450`, then **Done**. Walls 2 row → **Walls**. Expected: "No walls use Walls 2 yet. Trace or add one." (no "Other walls" hint).
4. Open **Other walls**, open Wall 1 and tap **Use here**. The banner said "Walls 2 isn't on this wall yet. Its height, 2,700, would be the stud length." before the tap.
5. Expected: on Walls 2 the note "Wall 1 is also on Walls, so its framing may be counted twice."; on Walls (its card's notes) "Wall 1 is also on Walls 2, so its framing may be counted twice.". Neither blocks. Take Wall 1 off Walls 2 (**Materials on this wall**) and both notes go.
6. Expected (cut lists, Section 5G): the "Studs cut list" labels run along each wall in order: "Wall 1 stud @ 0", "@ 600", … "@ 6,000", never "@ 6,000" before "@ 600".
7. Screen tests: e2e/ui-review/tc-hub028.spec.js "final review: …" and "the fold: …"; node: scripts/tests/takeoff-tc-hub028.test.mjs "final review: …".
- [ ] Pass  [ ] Fail

**TC-19 — Walls (HUB 031): Wet-area walls at 450, bulk and one wall**
1. Open the Walls URL with `&takeoffSeed=walls` → **Measure**. Type `2400` in **Wall height** and trace three walls A → B → C → D (each 3,600 long). Expected: "Walls: 21 studs at 2,400 · …" with no "walls at 450".
2. Tap **Select**, then **Wet-area walls at 450**. Expected: a panel "Wet-area walls · Walls", "No walls at 450 yet.", a **Done** button.
3. Tap Wall 1 and Wall 2. Expected: both turn blue (`#0e7490`), their labels end "· 450 ctrs", the panel reads "2 walls at 450: Wall 1, Wall 2", and "Wall 2 now at 450. Undo puts it back.". Record: those two walls' `inputs.studCentresMm` 450; Wall 3 has none.
4. Expected: the Walls line ends "· 2 walls at 450" and has 9 studs on each of Walls 1 and 2 (7 at 600).
5. Tap Wall 2 again. Expected: "Wall 2 back to 600", it turns back, and its `studCentresMm` key is **gone** (not null, not 600).
6. Tap **Undo** once. Expected: Wall 2 is at 450 again. Tap **Done**, then **Select** Wall 3 and tap **450** under **Stud centres**. Expected: 2 taps, and **Undo** puts it back.
7. Reload (pre-test setup). Expected: the blue walls are still blue and the line still says walls at 450.
8. With the item's own **Stud centres** at 450 the **Wet-area walls at 450** button is not offered.
9. Node: scripts/tests/takeoff-tc-hub031.test.mjs "a wall's own 450 beats the item's 600", "toggling 450 on and off …".
- [ ] Pass  [ ] Fail

**TC-20 — Walls (HUB 031): a Studs item ignores a wall's own centres, and says so**
1. On a job with an older Studs item (frame method) and a wall that has its own 450, open the Studs wall page.
2. Expected: the non-blocking note "Wall 3 is set to 450 centres, but Studs uses its own centres (600) for every wall." and the studs are laid out at 600.
3. Node: scripts/tests/takeoff-tc-hub031.test.mjs "a Studs item (wall_frame) keeps its own centres …".
- [ ] Pass  [ ] Fail

**TC-21 — Cavity slider on the plan (HUB 031; existing-door behaviour reworked 18 Nov 2026)**
1. On a Walls item with a 3,600 wall (Wall height 2400), tap **+ Door** → **Cavity slider**. Expected: a **Door width** field and "Opening: 2 × door + 20." and the hint "Type the door width, then tap the doorway end of the slider.".
2. Type `920`. Expected: "Opening 1,860 (2 × 920 + 20)." and the hint "Tap the doorway end on the wall, then tap towards the pocket. It's always 1,860 long.".
3. Tap the wall at 600 from its start, then tap further along it. Expected: the card "D1 in Wall 1 · cavity slider · 1,860 opening". Record the opening: `xMm` 600, `widthMm` 1860, `cavityLeafMm` 920, `cavityPocket` "right", `heightMm` as typed.
4. Expected: the studs have none in the pocket and 2 full studs at the pocket end; "D1 jack × 1", "D1 head trimmer × 2" in the cut lists.
5. Place the next slider on another wall: **2 taps** and the door width is remembered. Tap towards the wall start instead: `cavityPocket` "left".
6. Edge: a slider 40 mm past the wall end is slid back and the card says "ran 40 past the end"; 300 past is refused with "From there, the 1,860 opening runs 300 past the end of Wall 1. Tap towards the other end, or Undo this end."; on a 1,500 wall: "A 1,860 opening doesn't fit on Wall 4 (1,500 long). Tap a longer wall."; into D1: "runs into D1".
7. Existing door: **Select** the wall → **Open elevation** → the door → **Cavity slider** → **◀ Left** or **Right ▶**. Expected: Door width stays what the door was (e.g. 820), the opening becomes 2 × door + 20 (1,660) with the door in the same place, **Pocket left / Pocket right** chips under the toggle, one **Undo** puts it back. Tap the other chip: the door does not move. A pocket past the wall end shows an amber warning, not a refusal.
8. Node: scripts/tests/takeoff-tc-hub031.test.mjs "placing a slider …", "an existing door → cavity slider …" and scripts/tests/takeoff-tc-cavity-door.test.mjs, "framing: a 1,860 slider at 600 …".
- [ ] Pass  [ ] Fail

**TC-22 — Full height (HUB 031)**
1. **+ Door** → **Full height** (nothing to type) → tap both ends on a 2,400 wall. Expected: "Height: the wall's height." in the panel, the opening has `fullHeight: true` and `heightMm` 2400.
2. **Select** the wall and change **Wall height** to 2700. Expected: the door's stored `heightMm` becomes 2700 in the same edit; one **Undo** puts both back.
3. **+ Window** → **Full height**: the sill is set to 0; type a sill for a window that runs from a sill to the top. Expected: height = wall height − sill.
4. A wall with no height: "Wall 4 has no height yet. Select it and type its height, or turn off Full height."
5. Expected: no cripples above a full-height opening, and in a wall that carries the roof, "a full-height opening … needs an engineered beam".
6. Node: scripts/tests/takeoff-tc-hub031.test.mjs "full height: …".
- [ ] Pass  [ ] Fail

**TC-23 — Opening framing and the lintel (HUB 031)**
1. On a Walls item with a 3,955 wall at 2,700 and a window W1 3,430 wide, 600 high, sill 2,000 at 450. Open the Walls card → **Roof and openings** and tick **Yes** under **Do these walls carry the roof?** only.
2. Expected (Review walls, the wall page): "W1: 1 king + 1 jack each side · lintel not sized (the wind class isn't set) · sill trimmer × 3.", the Walls line "… · 1 to size", the note "Jambs are 2 each side (a king and one jack, the minimum). …", and 6 below-sill cripples of 1,820 (2,000 from the floor − 45 plate − 3 sill trimmers of 45).
3. Set **Sheet**, **3000**, **600**, **N2**. Expected: "lintel 240 × 45 LVL13", "won't fit (145 free)", the note "a 240 deep lintel won't fit. Only 145 mm is free above the head. …", and "W1 lintel × 1 @ 3,500 mm" (3,430 + a 35 jack each side).
4. Tap the opening, then the **Lintel** row. Expected: the source "SmartLVL 13 Design Guide (E1 2021), L13-LINTEL, page 22 and 23 …", chips 1500 to 7500 for the roof width this opening carries, and **Depth / Thickness / Pieces** with **Use this size**.
5. A narrower window that fits (1,200 wide, sill 900, head 2,100 at Wall height 2,700): the lintel is counted and "W1 above-head @ 1,200" cripples are 2,700 − 2,055 − the lintel's depth.
6. Select the wall → **Carries the roof: No**. Expected: no lintel and no lintel note; "head trimmer × 3" instead.
7. Type a framing detail on an opening (Section 5F). Expected: the rules leave it alone and the old note "its framing detail adds its own members …" returns.
8. Node: scripts/tests/takeoff-tc-hub031.test.mjs "Sam's wall: levels are from the FLOOR …", "the jamb count includes the king …", "a window's levels …"; render: scripts/tests/takeoff-tc-hub031-render.test.mjs.
- [ ] Pass  [ ] Fail

**TC-24 — Lintels fail closed (HUB 031)**
1. Set the wind class to **N5**, or the roof width to something over 7,500 by tapping an opening's lintel (not offered: the chips stop at 7,500), or **Lintels from: Pine MGP10** with **N3**. Expected: "lintel not sized (a N3 isn't in the AS 1684.2 N1/N2 Supplement 4 tables (N1, N2 only): needs an engineer or the supplier)"; the studs, trimmers and cripples are still counted.
2. Clear **Roof covering** to **Not set**. Expected: "lintel not sized (the roof covering (sheet or tile) isn't set)". Never a default.
3. Type a lintel on the opening (190 × 45, 2 pieces). Expected: "lintel 2/190 × 45 (typed)", quantity 2 and the pieces counted; **Use the table** removes it.
4. Node: scripts/tests/takeoff-tc-hub031.test.mjs "fail closed: …", "the SmartLVL 13 guide's own worked example …", "the Smart10 guide's own worked example …"; PDF cross-check: `node scripts/takeoff/standards/verify-lintels-vs-pdf.mjs` (92 rows match).
- [ ] Pass  [ ] Fail

**TC-25 — Hoop iron on a wall, and short MGP10 pieces (HUB 033)**
1. Walls card > **Hoop iron**: the product (HOOP IRON PUNCHED 0.8X30MM 30MT (ROLL), as the supplier prints it) and the **Roll length** (30 m). Every wall gets 2 straps of 700 mm for every 1,200 mm of its length (0.7 m per 600 mm). In **Select**, tap a wall and **Hoop iron on this wall: Off** to leave it out; **On** puts it back (one Undo each).
2. Expected on a 9,000 wall: 16 straps, 11.2 m, which orders as 1 roll (30 m rolls, counted EA, printed under BRACING). Node: scripts/tests/takeoff-tc-hub033.test.mjs.
3. Short MGP10 pieces (noggins, cripples, short trimmers under 1.2 m) are cut from the same product's stud/plate lengths: first from what is left over on the lengths bought for the longer pieces, then shared between themselves. Studs and plates stay one length each. An MGP10 product with no longest length set uses 6,000 mm and the card still asks you to confirm it.
- [ ] Pass  [ ] Fail

**TC-26 — Add bracing: ply sheets and hoop iron cross braces (HUB 034)**
1. Select a Walls item, **Select** with nothing picked, tap **Add bracing**. **Ply sheet**: tap along a wall where each 1,200 mm sheet goes (the sheet is centred on your tap and kept inside the wall; a sheet that would overlap another is refused). Its length follows the wall height: the smallest stocked sheet that covers it, 2,745 or 3,050 (BRACE OS H2 6X1200X2745MM / 6X1200X3050MM, seeds flagged to confirm). A wall taller than 3,050 or with no height says so and is not counted: add those sheets by hand. **Hoop iron cross**: set the span (default 2,700) and tap where each goes.
2. Hoop iron per cross brace is two diagonals: each = square root of (span squared + wall height squared), so a 2,700 span on a 2,700 wall is 2 x 3.818 = 7.64 m; on 2,400 it is 7.23 m. Tensioners: 2 per cross (one per diagonal), "TENSIONER SET HEX HEAD (PCE)". Sam's rule of thumb (2.7 x 1.6 x 2 = 8.64 m) is higher than the geometry, so the geometry is what is ordered (no allowance for laps or fixing ends); AS 1684.2 Section 8 is the reference for strap (tension) bracing, but the bracing design (how many, where, what angle) stays with the bracing plan. A cross brace flatter than 30 or steeper than 60 degrees is flagged. The cross braces' hoop iron and the walls' own straps are added together and ordered as one rolls line.
3. The same on the wall's elevation: in the wall page **Bracing** card tap **Add ply sheet** or **Add cross brace**, then tap the elevation (stays on until **Done**). Marks show on the elevation (green panel = ply, purple X = cross brace). **Remove** is on each row (and in Select, tap a wall, **Bracing on this wall**); every add and remove is one Undo.
4. Temporary bracing and screws are **not** calculated: use **+ Add bracing** on the order and pick **TEMP BR** (PINE 90x35 MGP10 P/M, `10/4.8`) or **SB SCREW** (COACHSCREW 10X75 GALV (PK 10), `1 EA`). Node: scripts/tests/takeoff-tc-hub034.test.mjs.
- [ ] Pass  [ ] Fail

**TC-27 — Wall junctions and corners**
1. Walls item. Trace Wall 1 from (2000, 3000) to (8000, 3000), Wall 2 from (5000, 3000) to (5000, 7000) (so Wall 2 ends on the middle of Wall 1). Set Wall height 2,700 on both.
2. Expected: Wall 1's page lists "Wall 2 butts in at 3,000 ..." with two studs, 2,932.5 and 3,067.5, and "6 blocks (3 pairs of 300 mm)". The Walls line reads "... studs at 2,700 + 2 junction studs + 6 junction blocks". Wall 2 has none. The elevation shows two teal studs and three teal blocks between them. Change Wall 1's height to 3,000: 8 blocks.
3. Tap **Remove** on the junction: the junction studs and blocks drop and the row reads "removed by hand". Tap **Count**: they return. Undo does the same.
4. Drag Wall 2's end away from Wall 1 (or delete Wall 2): the junction goes.
5. Order: the supplier take-off shows JUNCT. BLK with the 2 junction studs and the blocks as one 1.8 m cut (`1/1.8`).
6. Corner: trace Wall 3 from (2000, 3000) to (2000, 7000), then Wall 4 from (2000, 7000) to (6000, 7000) (clicked through as one line, so Wall 3 ENDS where Wall 4 starts). Expected: Wall 4 has a "Corner stud" 112.5 from its start (teal), Wall 3 only its normal end stud, and the Walls line counts the extra stud under STUDS. Wall 3 also starts where Wall 1 starts (both start there): the longer wall, Wall 1, gets the second stud. Tap **Swap** on a corner: the other wall gets it; tap again: back.
7. Two collinear legs of one straight wall meeting end to end: no corner stud and no corner listed. A wall meeting the join: exactly 2 junction studs, no studs at the join.
Node: scripts/tests/takeoff-tc-junctions.test.mjs.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values (fake-server snapshot; live DB only on an isolated test database)
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
