# How register data lands in the documents: a fitness-for-purpose review

16 November 2026. The owner reviewed the live Architect Design Brief for a real job and asked three things:
- Is the problem how the register stores the data, or how the documents present it?
- Would an architect (or a client) find this useful?
- How fit for purpose is what we've built?

The job is an extension in Seacliff Park, document reference BLA67068. Client details are left out here.

**What I looked at**
- The live preview (production runs the older brief template).
- The register behind it: 72 records, read-only, through the Hub's own API.
- The same data rendered through the reworked brief (adb-1.0) on the local `doc-suite-r01` branch. That template hasn't been deployed.

## 1. The short answer

**Would an architect use it?** Not as it stands. For this job the live brief prints 33 table rows plus a run-together paragraph of 10 preferences, across two or more pages. Roughly six of those lines tell an architect something they can act on. The things an architect needs first aren't in it:
- what's being built;
- the site and planning constraints;
- budget and programme;
- what must change in the next drawing issue, and who decides each open point.

A client reading their brief would have the same experience.

**Is it storage or presentation?** Both, in about that order:
- **Presentation is the bigger part, and the quicker to fix.** The documents print one row per register record. They put the kind of record in front of each answer ("New:", "Requirement:"), but often drop *what the answer is about*. For example, "Requirement: Upgraded" was meant to be "Quality priorities: Upgraded".
- **Storage has gaps that no layout can fix:**
  - The register has nowhere to record a room's brief: what the room must do, how big it is, what it connects to.
  - The goal fields are empty for this job.
  - The scope of each room is stored in up to three places, and here they disagree with each other.

**How fit for purpose is it?** The machinery is sound and worth keeping:
- controlled issue, revisions, snapshots and checksums;
- one register feeding every document;
- the pre-issue checks (the engineered-stone check correctly blocks this job's kitchen benchtop);
- the design system.

What's wrong is the **content model**. The register is built as a selections and finishes checklist, and the documents print that checklist. A design brief needs a different shape: the project's story, the rooms, the constraints, and the open decisions with owners.

**Why we didn't see it sooner.** Every document was tuned against specimen projects we wrote ourselves, and that data was rich and tidy. This is the first real job put through the documents. Real meeting data is thin, fragmented and sometimes contradictory, and the documents print it as it is.

## 2. What the register holds for this job

| Measure | Count |
|---|---|
| Records | 72: 31 selections, 24 scope, 16 requirements, 1 action |
| House-wide defaults (paint and floor zones, cabinetry finish, doors, cladding, roof, bathroom and laundry fittings) | 22. Most of it is finishes, not architect information |
| Rooms set up | 16, all marked "Ground" (the job has an upper level: the cladding record says "Upper level", and there's a stair) |
| Rooms with nothing recorded | **9 of 16**: Dining, Bathroom 2, Ensuite, Bedrooms 2–4, WC, WC 2, Lounge |
| Records that are empty | 6 |
| Records that say two words or fewer | 23 of the 66 with content ("Retain", "Upgraded", "New", "Alter", "Pantry", "Bath", "stairs -") |
| Records with a next action | **0**. This is why the brief's "Priority coordination actions" table prints with headings and no rows |
| Records with an owner | 6 |
| Project goals (vision, key requirements, concerns, description) | all blank |
| Budget | blank |
| Consultants named | none (the brief is addressed to "Architect") |
| Drawings on file | none, though the drawing basis is "DA rev 3" |
| Site facts held | council, planning zone, **bushfire-prone**, site complexity "high", part-occupied during works, target start April 2027. **None of these print in the architect's brief** |

**Rooms whose scope disagrees with itself**

The room card, the room's own scope question and the generic "what's happening here" question all record the same thing, so they can contradict each other:

| Room | Room card | Room question | Generic question |
|---|---|---|---|
| Kitchen | renovated | "New kitchen" | "Renovate" |
| Pantry | renovated | "New kitchen" (the kitchen question, asked of a pantry) | "Renovate" |
| Laundry | renovated | "New" | "Alter" |
| Bathroom | new | "New" | "New" (the same thing twice) |

**Fields used for the wrong thing**
- The roof specification is marked "by others".
- "870mm wide doors" sits in the colour field.
- Electrical is marked "Already complete" and client-approved.
- The rangehood is recorded twice: once as a requirement and once as a client action.
- Bathroom fixtures are recorded twice: as house defaults and again in the bathroom.

## 3. Where it goes wrong: capture, selection, presentation

### Capture: what the register asks and stores
1. **No room brief.** The questions record finish choices (laminate, square set, concealed cistern). Nothing captures "what must this room do": size, who uses it, what it connects to, what's kept. That is most of what an architect designs from.
2. **Room scope in three places.** The room card, the room-type question (K-001, L-001, B-001, V-001) and the generic R-003 all hold it. Duplication turns into contradiction.
3. **The project's story isn't captured.** The vision, must-haves, concerns and budget fields exist but are empty. Nothing makes them part of the meeting, and nothing checks them before a brief can be issued.
4. **Free text stands in for structure.**
   - Fragments like "stairs - " and "floor to ceiling curtain - ".
   - Several facts in one field: "Wall-hung - supplied by samious with mirror" holds a product, who supplies it and an accessory.
   - Typos print as typed.
5. **No levels and no actions.** Every room is "Ground". There's no quick way to say "the architect needs to show X by the next issue", so the action list is empty.

### Selection: which records each document takes
- The architect's brief takes everything that is work, a requirement or still to verify. That includes all 22 finish defaults, which belong in the selections schedule.
- It leaves out what the architect needs and the Hub already holds: site constraints, occupancy, delivery model, programme, priorities.

### Presentation: how a record becomes a line
- One row per record, so a room becomes three to six rows that each say very little.
- Rows show the kind of record instead of the subject ("New: New", "Alter: Alter", "Requirement: Bath").
- Reference codes such as "W015-MF6" lead every row. The reader can't use them; they only matter for finding the record.
- Columns are printed even when nothing fills them. "Required response" is blank on every row, and "DWG" says "DA rev 3" on every row.
- The preferences are run together into one paragraph.
- Contradictions print as they are, with no flag.

### The reworked brief (adb-1.0, local) on the same data
It's better organised than the live template:
- every line names its room and topic ("Kitchen: Storage: Full-height, Walk-in, Drawers");
- rooms with the same work are grouped;
- what applies throughout the house is said once.

But it runs to **4 pages**, and the core problems carry straight through:

| Problem | What it prints |
|---|---|
| Contradictory scope | "New kitchen and living room", then "Renovated kitchen and pantry", then "Pantry: New kitchen" |
| Fragments | "Retain", "floor to ceiling curtain -", "Quality priorities: Upgraded", "How the room must work: stairs -" |
| Finishes dominate | paint and floor zones take more than two pages |
| Site and project facts | still missing |
| A note printed as a decision | "Curved micro cement feature rangehood." |
| The 9 empty rooms | not mentioned at all |

**The rework doesn't fix this on its own.**

## 4. What an architect needs, and what good looks like

At this stage (Consultants, drawings at DA rev 3), the architect needs five things:
1. the project in five lines;
2. the constraints;
3. what to change or show in the next issue, with owners;
4. a room-by-room brief;
5. only the selections that change the drawings.

Here is the same job's data rewritten that way. Gaps are marked ⚠ rather than hidden.

> **Design brief: extension, Seacliff Park · drawing basis DA rev 3 · for: ⚠ architect not named**
>
> **The project**
> - Extension and renovation. Part of the home stays occupied during the works. Construction management. Cash-funded. Target start April 2027.
> - ⚠ Budget not recorded.
> - The clients' priorities: natural light and space; living that flows from indoors to outdoors.
> - Site: City of Marion, Hills Neighbourhood zone, **bushfire-prone** (BAL to be assessed), complexity high. Standard driveway access.
>
> **Needed for the next drawing issue** (⚠ no owners or dates recorded)
> 1. Windows: double-glazed aluminium (Jolong). Frame colour recorded as "white" in the notes and "light" on the card. Confirm, and check against the BAL.
> 2. Show the new stair (Living) and the upper-level layout. ⚠ Every room is recorded as ground floor.
> 3. Insulation and weather-tightness: "hd2.5" wall batts and "6.0" ceiling batts, as recorded (client-approved). Energy assessor to confirm.
> 4. Reuse the existing air conditioning with linear ceiling grilles. Needs a mechanical check (owner not set).
> 5. Gas fireplace in Living, client-supplied: flue and clearances.
> 6. Roof: Surfmist at 27° on the existing; low-pitch Surfmist sheet on the new. Recorded as "by others": confirm.
> 7. Retaining and pool: in or out of scope?
> 8. Kitchen benchtop: engineered stone is prohibited. Agree an alternative.
>
> **Rooms**
>
> | Room | Work | What it must do or contain |
> |---|---|---|
> | Entry | Alter | ⚠ nothing recorded |
> | Living | New | Gas fireplace; indoor–outdoor continuity; stacker doors; TV wall joinery; new stair |
> | Kitchen | ⚠ new or renovated? | Island; induction cooking; curved micro-cement feature rangehood; full-height storage and drawers |
> | Pantry (scullery) | Renovated | Walk-in, with appliance garage and full-height storage |
> | Laundry | ⚠ new or altered? | Cabinetry, bench, splashback, trough |
> | Bathroom | New | Freestanding bath; walk-in hobless shower with niche; wall-hung vanity (client-supplied) with mirror; concealed cistern; full-height tiling |
> | Bedrooms 1–2 | Renovated | Sliding robe doors (noted once, "in bedrooms") |
> | Dining, Lounge, Bedrooms 3–4, WC, WC 2 | New | ⚠ nothing recorded |
> | Bathroom 2, Ensuite | Renovated | ⚠ nothing recorded |
>
> **Selections that affect the drawings:**
> - 2340 mm doors (check ceiling heights)
> - square-set ceilings
> - Linea weatherboard to the upper level
> - rendered AAC to the main walls
> - half-round gutters
> - exposed-aggregate driveway
> - steel fencing
> - full-height bathroom tiling
> - concealed cistern (wall depth)
>
> Paint, floor finishes and cabinetry finishes are in the selections schedule, not here.

That is about a page and a half, against two or more pages live and four for adb-1.0. An architect can act on every line, and the ⚠ marks tell Blue Leaf what to ask at the next meeting.

## 5. Recommendations

**A. Quick wins.** These are small, help straight away, and don't depend on the redesign.
1. ✅ **Download the draft PDF.** Built on `doc-suite-r01` and checked in the local sandbox. Safari shows the PDF with no toolbar, so there was no way to save it. The preview now has **Download draft PDF** and **Open in new tab**. Issued revisions already open as a PDF or DOCX.
2. **Click a line to fix it.** Beside the preview, list every printed line with its room and topic. Clicking one opens that record in an edit drawer, then you preview again. No more hunting through the register. (The register's table view can already search by reference code, but nothing in the documents step leads you there.)
3. **Content warnings before issue**, kept apart from the legal and safety blockers:
   - "9 rooms have nothing recorded";
   - "Kitchen: New kitchen vs Renovate, choose one";
   - "4 lines are fragments";
   - "no architect named";
   - "no actions for the design team".

**B. Rebuild the content model.** The design system and controls stay.

Each document is built from a **brief model** that answers its reader's questions, instead of from rows. For the architect's brief:
- the project;
- constraints;
- the next-issue list;
- one row per room;
- the selections that change the drawings;
- nothing else.

The client brief gets the same treatment in client language. Line rules:
- every line names its subject;
- no reference codes in the reading text (a reference column, or an appendix);
- a column prints only if it has something in it;
- fragments and contradictions never print: they come back to staff as warnings.

**C. Fix the capture.** This is the part that makes the documents worth reading.
1. **One place for room scope:** the room card. The room-type and generic scope questions become details, or go.
2. **A short brief for each room**, required for new and renovated rooms before the architect's brief can issue: what it must do, who uses it, what it connects to, any size or must-have.
3. **The project's story at Discovery:** vision, must-haves, concerns and budget band, checked before the first issue.
4. **Levels on rooms.**
5. **"Needs action from…"** on any record (owner and by-when), which fills the next-issue list.
6. Name the architect in the Consultants step.

**D. Change how we test.** Add an anonymised copy of this job as a "real data" specimen. Every document is checked against it as well as the tidy specimens, and judged by whether its reader could act on it, not only whether it renders cleanly.

## 6. Decisions for the owner

1. **What the architect's brief is for at this stage:** the brief to design from, plus what must change in the next drawing issue, with finishes left to the selections schedule. Agree?
2. **Quick wins A2–A3 next**, then the brief model for the architect's brief and the client brief (B), with capture changes C1–C5 alongside. Agree the order?
3. **Production timing:** the draft download is a small change. Ship it to production on its own now (it needs your OK to push), or with the document-suite merge?
4. **Capture changes C1–C5:** they change how the meeting runs in the register. Do you want to see the screens before they're built?
