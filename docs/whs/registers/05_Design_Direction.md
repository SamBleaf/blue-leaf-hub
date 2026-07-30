# Design Comparison & Direction — Original SWMS vs Site WHS Pack

**For:** the agent building the Blue Leaf Hub pack generator
**Version:** 0.1 DRAFT · **Date:** 30/07/2026
**Scope:** visual and information design only. Compliance content is covered in `00_Critique_Memo.md`, `02_Approved_Control_Module_Register.md` and `04_Questionnaire_Spec.md` — don't re-litigate it here.

---

## 0. Read this first — you are designing three things, not one

The original document collapsed three jobs into one paper artefact. The new build has done the first well, the second poorly, and hasn't attempted the third.

| Surface | Reader | Where | How long | Job |
|---|---|---|---|---|
| **A · The builder** | Site supervisor | Office, desk, laptop | 5 minutes, once per job | Capture what's actually on this site |
| **B · The site pack** | Carpenters, apprentices, visiting trades | On site. 6:45am, cold, gloves, either a phone in a nail bag or a printout on the shed wall | 30 seconds at pre-start, then referenced | Make the controls that are in place unmissable |
| **C · The evidence record** | WHS reviewer, SafeWork SA inspector, insurer, potentially a coroner | Desk, two years later | As long as it takes | Prove the controls were chosen, communicated, monitored and revised |

**These have different design requirements and must not share a layout.** The current build renders one long web form and one plain PDF, and asks both to serve all three readers. That's the root design problem — everything below follows from it.

Surface B is the one that saves someone. It is currently the weakest.

---

## 1. Side-by-side design comparison

| Dimension | Original SWMS (2022, 14pp) | New pack (2026) | Verdict |
|---|---|---|---|
| **Format** | A4 portrait PDF/Word, print-native | Web form + plain generated PDF | New wins on data, loses on artefact |
| **Brand presence** | Blue Leaf logo on every page, black header bands, `Page N of 14` | Logo in the Hub sidebar only. **Generated PDF has no logo, no page numbers, no footer** | **Old wins outright** |
| **Unit of organisation** | Job step, grouped under work stage (`WALL FRAMING` → Plan & prepare → Construct → Erect → Cleanup) | Hazard module (`H-03`) | **Old wins.** A carpenter thinks "we're standing trusses this morning", not "H-03" |
| **Scannability** | Colour-filled risk cells — red/orange/yellow/green. You could flick to a page and see the red rows | Undifferentiated grey text. Nothing draws the eye | **Old wins.** Biggest visual regression |
| **Hierarchy of control** | Numeric column `HoC Applied 1-6` — undecodable without flipping to p.3 | Explicit `L4 Engineering:` label inline on every control | **New wins outright** |
| **When does this apply?** | Nothing | Trigger line in grey under every module title | **New wins outright** |
| **Selection state** | Unmarked 18-cell menu grid. Nothing ticked, ever | Real checkboxes, "Tick the controls actually installed on this site" | **New wins outright** |
| **PPE** | Icon strip, 11 pictograms, **no labels** — glanceable but ambiguous | Text list with stated conditions | Split. New is correct, old was faster to read. **Do both** |
| **Grouping device** | Vertically merged Job Step cells — visually tied one task to several hazards | Card per module | Old was denser, new is cleaner. New wins for mobile |
| **Emergency info** | Dedicated page 12, boxed | Six fields at the bottom of a long scroll | **Old wins.** This must be findable in one action |
| **Signatures** | 18-row table, print-native, plus supervisor declaration block | Prose: *"Workers sign this pack version in the field app"* | **Old wins as an artefact.** New needs the record surfaced |
| **Document control** | Footer table: version, owner, authorisation, last reviewed, next review | Cover line: `Pack version 1 · generated 2026-07-30` | **Old wins.** No review date anywhere in the new one |
| **Review rounds** | 5-column table on the document | Nothing | **Old wins** |
| **Risk rating** | Initial + residual, colour coded, with a legend and an escalation rule | Removed | Open decision — see §11 |
| **Draft state** | None | `DRAFT` chip per module + banner on the pack | **New wins outright** |
| **Structured data underneath** | None. A Word file | Modules, controls, levels, triggers, tick state | **New wins outright** |
| **Mobile** | Unusable — 7-column table | Works, but it's a 200-item form, not a reference document | Neither is designed for site |
| **Print** | Designed for it | Not considered | **Old wins** |
| **Site-specific visual content** | None | None | **Neither.** See §7.6 |

**Summary:** the new build is a better *system* and a worse *document*. It won every argument about data structure and lost every argument about being read on a building site.

---

## 2. Carry forward from the original — and why

These are not nostalgia. Each one solves a real problem the new build has reintroduced.

1. **Logo and page furniture on every page.** A pack found loose in a site shed must identify itself. Logo, job address, version, `Page N of M`. Non-negotiable for the printed artefact.
2. **Work-stage grouping above hazard modules.** Keep the module as the data unit; present it under the work stage. `ROOF — trusses and battens` reads; `H-03, H-04` doesn't.
3. **Colour-coded severity, done accessibly.** Bring back visual weight for the high-consequence items — but never colour alone (see §5.3).
4. **A dedicated emergency page.** Boxed, high contrast, same position every time.
5. **A real signature block** on the printed artefact, even when the app captures sign-on.
6. **The document control footer.** Version, owner, reviewer, authorisation, **next review date** — visible on the page, not buried in metadata.
7. **The review-rounds table.** Cheap, and it makes revision history visible on the artefact.
8. **PPE icons** — reinstated *with* labels. Icon + word beats either alone.

## 3. Keep from the new build

1. Explicit `L1`–`L6` labels on every control. Best single design improvement in the whole project.
2. Trigger line under every module title.
3. Tick state as a first-class visual.
4. `DRAFT` state, visible and enforced, chip-level and pack-level.
5. Part 1 / Part 2 divider.
6. Card-per-module for mobile.
7. Monitor & review, and the install/verify vs use split, printed per module.

## 4. What neither has

1. **A one-page site summary.** The thing that will actually be read. See §7.2.
2. **Any site-specific visual** — a marked-up site plan or a photo of the actual edge protection is worth ten pages of text and is the fastest route out of "generic SWMS".
3. **A glanceable indication of whether a module is protected by engineering or is leaning on PPE.** This is the single most important safety judgement in the document and it is currently invisible in both. See §6.1.
4. **Anything designed to be read at arm's length in daylight.**

---

## 5. Design direction

### 5.1 Thesis

The original looked like a compliance form. The new one looks like a settings page. Neither looks like a jobsite instrument.

The pack should borrow from the artefacts carpenters already trust and read without being asked: **the scaffold tag, the plan title block, the storey rod.** Green tag means go. A title block tells you what drawing you're holding, which revision, and who signed it. Those conventions are already fluent on site — use them instead of inventing a visual language.

Practical consequence: status is a **tag**, metadata is a **title block**, and dimensions are set apart from prose because on this document every number is a control.

### 5.2 Type

Three roles. Deliberately not a serif display on cream — this is a site document, not an editorial page.

| Role | Face | Why |
|---|---|---|
| **Headings / stage titles** | Condensed industrial grotesque — `Archivo Narrow`, `Barlow Condensed` or `Roboto Condensed` | Reads like plan title blocks and site signage. Condensed lets a long task name hold one line on a phone |
| **Body / control text** | `Inter` or `Source Sans 3` | Tall x-height, legible at 9pt print and small on screen, wide weight range |
| **Data — dimensions, limits, licence numbers, tag dates, versions** | `IBM Plex Mono` or `JetBrains Mono` | **The real choice here.** Every number in this document is load-bearing: `2 m`, `1.5 m`, `1:4`, `900–1100 mm`, `wind __ km/h`, `85 dB(A)`, `P2`. Setting dimensions in mono makes a measurement visually distinct from prose, scannable in a list, and much harder to misread or transcribe wrong |

Type scale, print (A4) — screen scales at 1.15×:

```
Stage title      18/22  condensed, 600, letterspaced +0.02em, uppercase
Module title     13/17  condensed, 600
Trigger line     10/14  body, 400, italic, --ink-60
Control text     10/14  body, 400
Level label       9/14  condensed, 700, uppercase, letterspaced +0.06em
Dimension        inherit, mono, 500, --ink
Meta / footer      8/11  mono, 400, --ink-60
Site Card lead   14/19  body, 500
```

Minimum body size on the printed pack is **10pt**. The original ran 8–9pt in places; that fails at arm's length in a site shed.

### 5.3 Colour

```
--ink          #10151C   near-black, print-safe
--ink-60       #5A646E   secondary text, triggers, meta
--navy         #1B3A5C   Blue Leaf primary — stage bands, headings
--navy-tint    #EAF0F6   band fills, zebra rows
--paper        #FFFFFF
--rule         #C9D1D8   hairlines, 0.5pt print
--tag-green    #1F7A3D   in place · approved · go
--tag-amber    #C77700   draft · conditional · attention
--tag-red      #B3261E   stop-work · blocked · PPE-only
```

**Hard rule: colour never carries meaning on its own.** Site packs get photocopied, printed greyscale, read on a cracked screen in glare, and read by colour-blind people. Every state carries **three** signals: colour, a word, and a shape.

| State | Colour | Word | Shape |
|---|---|---|---|
| Control in place | `--tag-green` | `IN PLACE` | filled square ■ |
| Not selected | `--ink-60` | `NOT USED` | open square □ |
| Draft | `--tag-amber` | `DRAFT` | diagonal-hatched chip |
| Blocked / stop-work | `--tag-red` | `STOP` | octagon |
| PPE-only exposure | `--tag-red` | `PPE ONLY — JUSTIFY` | hierarchy bar filled at L6 only |

---

## 6. Signature elements

Spend the design budget in two places. Everything else stays quiet.

### 6.1 The hierarchy bar — the one thing to build

A six-segment bar beside every module, filled from the left to the **highest level of control actually selected**.

```
H-03  Roof truss erection
      ███ ███ ███ ███ ░░░ ░░░      L1 L2 L3 L4 · engineering
      ^ eliminated through engineering — good

H-14  High-risk silica processing
      ░░░ ░░░ ░░░ ░░░ ███ ███      L5 L6 only · ADMIN + PPE ONLY
      ^ red. this module is leaning on paperwork and a mask
```

Why this matters more than anything else in the document: the most important safety judgement in a SWMS is *how high up the hierarchy the protection sits*, and right now that requires reading eleven lines of text per module to work out. The bar makes it a glance. A supervisor scanning the pack sees instantly which modules are carrying real engineering controls and which are being held up by PPE.

- Segments filled for every selected level; the **highest** selected level sets the bar colour.
- L1–L4 selected → `--tag-green`. L5 highest → `--tag-amber`. L6 highest → `--tag-red` plus the label `PPE ONLY — JUSTIFY`.
- Renders identically in print at 24 × 6 mm, in the builder as a live indicator that updates as boxes are ticked, and greyscale-safe because it's fill position, not hue.
- In the builder it doubles as the validation cue for gate **G-2** in `04_Questionnaire_Spec.md`: red bar → justification required.

This is derived directly from the hierarchy of control — the regulatory spine of the whole document. It encodes something true rather than decorating.

### 6.2 The tag block

The pack's front-page identity, styled as a scaffold tag. Same shape and position every time, so it's recognised before it's read.

```
┌──────────────────────────────────────┐
│  ▛▚ SITE WHS PACK          ■ DRAFT   │
│                                       │
│  25 Mariner Ave, [SUBURB] SA [POST]  │
│  J1195 · first fix + roofing          │
│                                       │
│  VERSION      v1                      │
│  ISSUED       30 Jul 2026             │
│  REVIEWER     — pending —             │
│  REVIEW DUE   — not set —             │
│                                       │
│  ■ NOT FOR SITE USE                   │
└──────────────────────────────────────┘
```

Green header band when reviewer-approved and in date. Amber when draft. Red when past review due. `REVIEW DUE` is a mandatory field in the block — the original document's worst failure was being four years out of review with nothing on the page saying so.

---

## 7. Page architecture — the site pack (Surface B)

Fixed order. Same every job, so people learn where things live.

### 7.1 Cover — tag block only
Tag block, Blue Leaf mark, nothing else. One glance answers: which job, which version, is it live.

### 7.2 Page 1 — THE SITE CARD ★ build this first

**The highest-value artefact in the whole project, and neither document has it.** One page. Also renders as a single phone screen and as a laminated A4 for the shed wall. This is what actually gets read at pre-start.

```
┌─ TODAY ON THIS SITE ─────────────────────────────┐
│                                                   │
│  WHAT WILL KILL YOU HERE                          │
│  1 Fall from the upper floor edge — 3.2 m         │
│    ■ Scaffold, green tag 28 Jul · guardrail all   │
│      open edges                                   │
│  2 Fall through the stair void                    │
│    ■ Fixed load-rated cover, marked. Do not lift  │
│  3 Truss landing — crane overhead                 │
│    ■ Exclusion zone 8 m · hard hat + hi-vis       │
│                                                   │
│  STOP WORK IF                                     │
│  Wind over    32 km/h        Heat over   38 °C    │
│  Roof or joists wet or frosted — no access        │
│                                                   │
│  IF SOMETHING HAPPENS                             │
│  Hospital   Flinders Medical Centre, Bedford Park │
│  First aid  J. Manning · kit in site shed         │
│  Muster     Front verge, clear of driveway        │
│  Rescue     no fall-arrest in use on this job     │
│  Call       Sam 0434 046 399                      │
│                                                   │
│  Stop the work if a control isn't there. No one   │
│  will be disadvantaged for stopping the work.     │
└───────────────────────────────────────────────────┘
```

Rules: maximum **three** kill risks, derived from the highest-consequence selected modules. Every number in mono. Stop-work limits pulled straight from the `SF-06` fields. Fits one A4 at 12pt minimum. No module IDs — a carpenter never needs to see `H-01`.

### 7.3 Part 1 — the SWMS, grouped by work stage

Navy stage band, then module cards beneath it:

```
════════════════════════════════════════════════
 FLOOR & WALL FRAMING
════════════════════════════════════════════════

  Fall from height — floor framing and flooring
  ███ ███ ███ ███ ░░░ ░░░   L1–L4 · engineering
  Applies when: any fall more than 2 m           H-01

  IN PLACE ON THIS SITE
  ■ L3  Perimeter scaffold, AS/NZS 1576, green tag
        28 Jul, handover cert on file
  ■ L4  Guardrail to all open perimeter — top rail
        900–1100 mm, mid rail, toeboard
  ■ L4  Stair void: fixed load-rated cover, marked
        HOLE — DO NOT REMOVE

  NOT USED ON THIS SITE
  □ L1  Floor cassette craned in complete
  □ L6  Travel restraint · □ L6  Fall arrest

  WHO      Installs & checks  J. Manning
           Uses               all crew
  CHECKED  Pre-start, daily. Any cover removed needs
           supervisor OK and goes straight back.
────────────────────────────────────────────────
```

- **Task name is the heading. Module ID is metadata, right-aligned, mono, `--ink-60`.**
- `IN PLACE` first and prominent. `NOT USED` present but quiet — it's evidence of a considered decision, and it belongs to Surface C. Collapsed by default on mobile.
- Print `NOT USED` compactly on one or two lines. It must exist, it must not compete.

### 7.4 Part 2 — task controls, visually subordinate

Same card grammar, lighter weight, no stage bands, tighter leading. Standing controls (see `04_Questionnaire_Spec.md` §3) in a single-column list headed **HOW WE ALWAYS WORK** — no tick boxes, because they're not per-job decisions.

### 7.5 Emergency page — fixed position, high contrast
Full-page version of the Site Card's emergency block. Boxed, 14pt minimum, phone numbers in mono. Same page position in every pack.

### 7.6 Site-specific evidence — the fastest fix for "generic"
Two or three photos or a marked-up site plan, captioned, with the module they evidence. A photo of the actual green-tagged scaffold with the tag date legible does more to prove a site-specific SWMS than any amount of text. Add a camera field to the builder and print them.

### 7.7 Consultation, sign-on, version history
Print the record — names, dates, version signed — even when the field app captures it. Include the record ID. Keep the original's 18-row signature table for the printed copy.

### 7.8 Footer, every page
`Blue Leaf Building · 25 Mariner Ave · v1 · 30 Jul 2026 · Page N of M`
Do **not** print "uncontrolled when printed". The site copy is the controlled copy.

---

## 8. Builder UI (Surface A)

1. **Progressive disclosure.** Show the module card collapsed with its hierarchy bar. Expand to select. Controls hidden until the module is in scope. Currently everything is expanded at once, which is why it reads as ~196 decisions.
2. **The hierarchy bar is live** and updates as boxes are ticked. It's the feedback loop that teaches the supervisor what a good selection looks like.
3. **Grouped site facts before module detail** — the `SF-01`…`SF-14` block from `04_Questionnaire_Spec.md`. One screen, ~14 answers, then modules mostly pre-resolved.
4. **Blocking validation is inline, at the field, in the interface's voice.** Not a summary at the end. `G-1`: *"H-03 is in scope but no controls are ticked. Tick what's on site, or take the module out of scope."*
5. **Progress by section**, not a percentage — `Scope ✓ · Site facts ✓ · Controls 3 of 6 · Details`.
6. **Buttons say what happens.** `Generate pack`, `Send for review`, `Approve and issue`. Not `Submit`. Whatever the button says, the resulting state says the same word.

---

## 9. Anti-patterns — explicitly do not

1. **Icon-only PPE.** The original's 11 unlabelled pictograms were unreadable. Icon **and** label, always.
2. **Unmarked menu grids.** The original's 18-cell HRCW table with nothing ticked identified nothing. Never print an option grid without selection state.
3. **Legend on one page, coded data on another.** If a colour or a level code appears on page 6, its key appears on page 6.
4. **`DRAFT` as a diagonal watermark across body text.** Unreadable. Use the band and the chip.
5. **Module ID as the primary heading.** `H-03` is a database key. The task name is the heading.
6. **A generated PDF with no logo, page numbers or footer.** Current output has none of these.
7. **Colour as the only carrier of meaning.** Fails photocopy, greyscale, glare and colour blindness.
8. **Landscape multi-column tables.** The original's 7-column table is unreadable on a phone. Stack it.
9. **Editorial notes rendered as control text.** *"the 'nil' entry on the superseded SWMS is not acceptable"* is a note to Sam, not an instruction to a carpenter. Register cleanup is listed in `04_Questionnaire_Spec.md` §9.
10. **Literal `**asterisks**` in output.** Strip markdown at the register; carry emphasis as a field.
11. **One layout for all three surfaces.** The whole point of §0.

---

## 10. Acceptance tests

Design isn't done until it passes these. They're testable and they're the real spec.

| Test | Method | Pass |
|---|---|---|
| **5-second** | Hand the pack to a carpenter. *"What's protecting you from falling today?"* | Answered from the Site Card, no page turns |
| **Glove** | Complete a module in the builder wearing work gloves on a phone | All tap targets ≥ 44 px, no mis-taps |
| **Greyscale** | Photocopy the pack in black and white | Every state still readable. Hierarchy bars still legible |
| **Arm's length** | Read the Site Card on a phone at 500 mm in direct daylight | Legible without zooming |
| **Shed wall** | Laminate the Site Card, pin it, stand back 1 m | Kill risks and stop-work limits readable |
| **Cold open** | Give the pack to someone who's never seen it. *"Where's the muster point?"* | Found in one action |
| **PPE-only** | Build a pack where a module has only L6 ticked | Red hierarchy bar, `PPE ONLY — JUSTIFY`, blocked until justified |
| **Inspector** | *"Show me you considered asbestos on this job"* | Explicit not-applicable record, findable |
| **Two-year** | Open a pack from a closed job | Version, reviewer, review date, consultation and sign-on all present |

---

## 11. Open decisions for Sam

| # | Decision | Note |
|---|---|---|
| D-1 | **Reinstate risk ratings?** | The original had initial + residual with colour and an escalation rule. Removing them lost the "High requires a separate hazard assessment" gate. The hierarchy bar (§6.1) arguably communicates more, more honestly. **Recommendation: don't reinstate the 5×5 matrix; keep the hierarchy bar plus a single consequence flag on kill risks.** Reviewer's call |
| D-2 | Work-stage grouping — fixed stages, or derived from the `J-1` answers? | Derived is less to maintain |
| D-3 | Is the Site Card a separate print artefact or page 1 of the pack? | Recommend both — page 1 and a standalone laminate |
| D-4 | Site photos — required or optional? | Recommend required for any job with scaffold or fall arrest |
| D-5 | Print `NOT USED` controls in full, or a compact single line? | Compact for site copy, full for the archived evidence copy |

---

## 12. Build order

1. **Site Card** (§7.2). Highest value, smallest surface, and it's the thing that gets read.
2. **Hierarchy bar** (§6.1). One component, transforms both the builder and the pack.
3. **Print/PDF furniture** — logo, footer, page numbers, tag block (§6.2, §7.8).
4. **Task-name-first card grammar** with module ID demoted (§7.3).
5. **Progressive disclosure in the builder** (§8.1–8.2).
6. **Emergency page** at a fixed position (§7.5).
7. **Colour + shape + word state system** (§5.3).
8. Site photos (§7.6), then consultation and sign-on printing (§7.7).

---

*Design spec, DRAFT. The classification of any control as "standing" versus "site-variable" is a safety judgement and needs the competent WHS reviewer's sign-off — not a design decision.*
