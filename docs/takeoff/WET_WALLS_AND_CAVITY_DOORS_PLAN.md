# HUB 031: wet-area walls at 450, cavity sliders and full-height openings (build plan)

**Status:** BUILT 18 Nov 2026 on this branch (local commits, not pushed), steps 1 to 3 of the build, as changed by `OWNER_ANSWERS_17NOV.md` (per-wall centres through the Select tools, pocket side picked while drawing, no capabilities gate: client and server ship together). Original status: plan only. Written 17 Nov 2026 on branch `takeoff/wet-walls-cavity-doors` at `56a8bc5` (same as `origin/main`).
**Owner:** Sam. The build starts once Sam answers the 3 questions in section 10. Each question has a default, so a one-line "yes to the defaults" is enough.
**Owner rule:** the takeoff must be simple to use onsite. That means the fewest taps, plain English, advanced detail hidden, phone and iPad first, and 44 px targets. TC-R04 was judged overbuilt, so anything Sam didn't ask for goes under **Later** (section 11).

---

## 0. What Sam asked (17 Nov 2026, verbatim)

> "take off tool - walls - im adding walls into a space - ive marked all of them out and added in doors and windows - all has worked really well - but now i want to go through using the select tools and change the wet area walls to 450 center - we need to plan - and build a tool that will make this super easy to do once the walls are already in - also there are some pocket cavit sliding doors - but the door tools doesnt really allow for the framing layout required - a pocket door is double the width of the door opening + 20ish mm so a 920 door becomes a 1860 opening - when doing doors there should be a cavity slider button and a full height toggle that will automatic set the opening to the wall height whilst in + doors or + windows"

**This release does three things:**

1. **Wet-area walls at 450.** In Select there is one new button, **Wet-area walls at 450**. Tap it, then tap each wet wall: it turns blue and its studs go to 450 centres. Tap a wall again to put it back. One wall can also be changed by itself: Select it, then tap **450**.
2. **Cavity slider.** In + Door, tap **Cavity slider**, type the door width once (920), then tap one end of the opening and tap towards the other end. The opening is always 2 × door + 20 = **1,860**, framed with no studs or noggins in the pocket.
3. **Full height.** In + Door and + Window, tap **Full height** and nothing needs typing. The opening runs to the top of the wall and stays there if the wall height changes later.

Doors already drawn can be turned into cavity sliders or full-height openings on the wall's elevation.

---

## 1. Judging the two designs

Each criterion is scored 1–5, and simplicity counts double.

| Criterion | Weight | Design 1 "Onsite-speed" | Design 2 "Framing accuracy first" |
|---|---|---|---|
| Simplicity onsite and taps | ×2 | **4** (8). Tap-to-toggle mode, two chips, no pocket questions on new sliders. It loses a point for plan-selecting doors and the screen-relative pocket arrows. | **3** (6). More ideas on screen: pocket side, Flip pocket, an editable pocket allowance, "Other…" centres, a dashed pocket and amber warnings. |
| Framing correctness | ×1 | **4**. Framing is right. Cladding and wall areas also lose the pocket (not framing, but wrong). | **5**. The leaf and the framing span are kept apart, so cladding loses only the door. |
| Data safety and back-compat | ×1 | **4**. Absent fields change nothing, and old clients still frame a slider right. There is no deploy gate. | **4**. It has a capabilities gate and keeps snapshots fresh, but an old cached client frames the pocket as solid wall until it updates. |
| Fits the existing code | ×1 | **5**. No change to the framing adapters; every consumer reads `widthMm` as it does today. | **3**. Span adapters in 3 places, plus pocket-aware drawing, placement, drag and `keepOpeningsInPlace`, plus a rebase change. |
| Testability | ×1 | **4** | **4** |
| **Total (out of 30)** | | **25** | **22** |

**The merged plan uses Design 1 as its base and adds Design 2's safety pieces:**

- **From Design 1:**
  - per-wall `studCentresMm`, and the tap-to-toggle wet mode;
  - a cavity slider is saved as ONE door whose `widthMm` is the full framing opening, with `cavityLeafMm` marking it, so there is no framing-code change;
  - the opening width comes from the typed door width, never from the taps;
  - the pocket ◀ / ▶ choice on the elevation, and reading an existing door wider than 1,200 as the whole opening;
  - the wet colour and the "450 ctrs" label, the double-tap guard, and no toggles on outline walls.
- **From Design 2:**
  - the capabilities feature gate;
  - full-height heights rewritten in the SAME edit as a wall-height change;
  - `fullHeight` worked out in the timber engine for any stud method, so a legacy Studs item never blocks;
  - a plain note when a legacy Studs item ignores a wall's 450;
  - an overlap is refused at placement with the first tap kept, and the opening is never shifted silently;
  - the wet-wall tool starts from **Select**, in Sam's words;
  - the "studs only, no blocking" warning and the set-out note in the SOP;
  - `CALCULATION_VERSION` goes to `@5`.
- **Dropped or moved to Later:**
  - picking doors and windows on the plan (Design 1 B4);
  - storing a pocket side, Flip pocket, a per-opening pocket allowance, the dashed pocket drawing and leaf-only cladding deduction (Design 2);
  - typed "Other…" centres;
  - the two-device input merge;
  - a Wet walls button in the Line panel. Sam said "select tools", and one place keeps the screen calm.

---

## 2. Decisions (with defaults)

| # | Decision | Default and why |
|---|---|---|
| D1 | Where 450 is stored | On the wall: `inputs.studCentresMm`. It sits beside the per-wall `heightMm` that already works this way. The item's **Stud centres** becomes the default for every wall without its own value. **This reverses Sam's 25 Oct decision 4** (one Stud centres per Walls item, wet walls on a "Walls 2" item). His 17 Nov request asks for exactly this; question Q1 confirms it. |
| D2 | Values the UI can set | Only **450** (`WET_WALL_CENTRES_MM`). The server accepts 100–1,200 so a later "Other…" needs no server change. |
| D3 | 450 means studs only | Stud spacing changes, and plate joins and noggin bays follow the studs automatically. No blocking, villaboard, extra noggin rows or wet-area tag. Being at 450 never means "wet" anywhere else. |
| D4 | How a cavity slider is stored | `type: "door"` (unchanged) + `cavityLeafMm: 920` (the door) + `widthMm: 1860` (the full framing opening = 2 × door + 20). Every consumer reads `widthMm` as today, so framing, plan, elevation, drag, overlap checks and old clients all see the real framing opening. |
| D5 | The +20 | One constant, `CAVITY_SLIDER_EXTRA_MM = 20` ("20ish", Sam). Not editable per door. Question Q2 confirms it. |
| D6 | Pocket framing | Today's opening rules applied to the whole 1,860: no stud strictly inside, **2 full studs each side** (the pocket end too), no noggins in any bay that overlaps it, plates full length. Question Q3 confirms the pocket end. |
| D7 | Not counted on a slider | The head or lintel over the 1,860, jacks, trimmers and the cavity kit. This is the same as every opening on Walls today, and the existing note "Lintels, jacks and trimmers at D2 aren't counted." covers it. |
| D8 | Cladding on a slider wall | It loses the whole 1,860, pocket included. Sliders are almost always in internal walls with no cladding. A card note warns when the wall does carry cladding. Leaf-only deduction is Later. |
| D9 | Full height | `inputs.fullHeight: true`. The engine always works out height = wall height − sill on a straight wall that has a height. `heightMm` is still stored as a snapshot and is rewritten in the same edit whenever the wall height or the sill changes. |
| D10 | Toggle memory | **Cavity slider** and **Full height** start OFF each time + Door or + Window is pressed, and stay on while you keep placing. **Door width** is remembered from the last cavity slider on this takeoff. A normal door is never turned into a slider by surprise. |
| D11 | Placing a new slider | The first tap fixes one end and the second tap only sets the direction. If the far end runs past the wall end by **100 mm or less** (finger error), the opening is slid back to finish at the wall end and the card says so. More than that is refused, and the first tap is kept. Running into another opening is refused, and the first tap is kept. |
| D12 | An existing door wider than 1,200 | Turning on Cavity slider reads it as the whole opening already. Door width = (width − 20) ÷ 2, rounded to 10. 1,200 is the cut-off (`CAVITY_LEAF_WIDE_MM`). |
| D13 | Method version | `wall_framing@1` stays. When the new fields are absent, the engine's output is identical, and a bump would make every draft order line stale. `CALCULATION_VERSION` goes `takeoff-calc@4` → `@5`; it is stamped only on exports. |
| D14 | Deploy gate | The workspace's `capabilities.features = { wallCentres: true, cavitySlider: true, fullHeight: true }`. The client shows each new control only when the server says it keeps that field, so a client that ships before the server can never drop Sam's 450s silently. |
| D15 | Legacy Studs item (`wall_frame@1`) | It ignores `studCentresMm` and gives a plain note instead. It DOES honour `fullHeight`, and a slider is already a normal wide opening for it. |

---

## 3. Screens, copy and taps

All new buttons and chips are at least 44 px high. Chips are toggle buttons with `aria-pressed`. Plan taps use the existing hit tests (`nearestWall`, the same one + Door uses), so there is no new snapping. The tool row for Walls stays **Line | Select | Pan**, so `takeoff-tc-hub028.test.mjs:1267` stays green.

### A. Wet-area walls at 450 (walls already drawn)

#### A1. The bulk tool (main path)

**Where:** the plan in Measure, with a Walls item as the active material, using the **Select** tool with nothing selected.

**When the button shows.** All of these must be true:
- the material is a Walls item and you can edit it;
- the server says `features.wallCentres`;
- the item's Stud centres isn't already 450;
- the item has at least one traced wall on this page.

**The Select sheet with nothing selected** (today it says "Tap a run, line, wall or count mark to select it."). Under that line, add:

- `[ Wet-area walls at 450 ]` (`data-wet-start`, secondary button)

**Tap it, and the sheet becomes the wet-walls panel** (`data-wet-panel`):

- Bold line: **Wet-area walls · Walls**. Use the item's own name, e.g. "Walls 2".
- Text: "Tap each wet-area wall. It turns blue and its studs go to 450 centres. Tap it again to put it back to 600."
  - "600" is the item's own Stud centres.
- Count line (`data-wet-count`):
  - "No walls at 450 yet."
  - or "3 walls at 450: Wall 5, Wall 6, Wall 7".
  - After 6 names, it reads "… and 4 more".
  - The count covers every page of this item.
- Last-change card (`data-wet-last`): "Wall 7 now at 450" or "Wall 6 back to 600", with an `[ Undo ]` button (the same as ↶).
- Button: `[ Done ]` (primary).

**Tapping a wall in the mode:**

1. Only shown, straight walls of THIS Walls item can be hit. A cladding wall traced on the same line is never caught.
2. Hit: the wall toggles. Adding sets `studCentresMm: 450`. Putting it back DELETES the key. Each tap is one Undo.
3. The plan redraws straight away. The Walls line in the sheet header updates too, e.g. "… · 3 walls at 450".
4. A second tap on the same wall within `BURST_MS` (the existing double-tap window) is ignored, so a double-tap doesn't cancel itself.
5. Miss messages reuse the existing wording:
   - "No Walls wall here. Tap on a wall you traced."
   - "That wall is hidden on this plan. Tap Show all to change it."
6. **Done**, or tapping any tool, leaves the mode. Changing page also leaves it. The blue walls stay blue.

**Taps:**

| Starting from | Taps |
|---|---|
| Select, nothing selected | **N + 2** (Wet-area walls at 450, one tap per wall, Done) |
| Line | **N + 3** (one more, for Select) |
| A typical house (bathroom 4 + ensuite 3 + laundry 3 = 10 walls) | 12–13 |
| Today's "Walls 2" SOP | about 6–10 taps per wall, and Undo is lost on the material switch |

#### A2. One wall at a time

**Select → tap the wall.** The existing wall sheet (`data-selected-wall`) gets one row under Wall height (`data-wall-centres`):

- "Stud centres  `[ 600 ]` `[ 450 ]`", with the help text "This wall only."
  - The left chip shows the Walls item's own centres. Picking it deletes the key.
  - The row shows only when all of these are true:
    - the wall is on a Walls item;
    - the wall is straight (rect);
    - you can edit it;
    - the server has the `wallCentres` feature;
    - the item is not at 450, or the wall already has its own value.
- **Taps: 2** (tap the wall, tap 450).

#### A3. Wall page (elevation), for the Review walls route

- On a Walls item's wall page, the same chip pair sits beside the wall's Walls framing line.
- `wallFramingNotes` adds the line **"Studs at 450 centres on this wall (Walls: 600)."**
- The studs on the elevation are already drawn where the engine puts them, so there is no new drawing.

#### A4. What shows on the plan

These show only while the active material is a Walls item, so cladding takeoffs stay quiet:

- A wet wall draws in the new token `COLORS.wetWall = "#0e7490"` (cyan-700, 5.4:1 on white) in place of `COLORS.wall`.
- Its label reads "Wall 7 · 2,400 · **450 ctrs**". Colour is never the only cue.

#### A5. The Walls line

`wallFramingText` adds "**· 3 walls at 450**" only when some wall has its own centres. With none, the text is exactly as today. Example: "Walls: 14 studs at 2,400 · bottom plate … · top plate … · 14 noggins (1 row) · 1 wall at 450".

The per-wall line on a wall page (`wallFramingTotals(result, wallId)`) never gets this suffix; the note in A3 says it instead.

---

### B. + Door / + Window: Cavity slider and Full height

The panel is the existing one (`data-opening-panel`, MeasureScreen.jsx:1556-1600). It is reached from the Line panel, the run card and the Rectangle/Area panels, as today.

#### B1. New chip row (straight walls only)

The chip row (`data-opening-flags`) sits under the title, above the size fields:

| + Door | + Window |
|---|---|
| `[ Cavity slider ]` `[ Full height ]` | `[ Full height ]` |

- **Cavity slider** shows only when all of these are true:
  - the active material is a timber walls item (`familyOf(material) === "timber"`: Walls or a legacy Studs/Plates/Noggins item);
  - the server has `features.cavitySlider`.
- **Full height** shows for every wall material when the server has `features.fullHeight`.
- **Outline walls (Rectangle/Area):** no chips at all. The two corners already set the size, as the "Nothing to type" hint says today.
- Both chips start OFF when + Door or + Window is pressed (D10). They stay as set while you keep placing.

#### B2. The size fields under each setting

**Plain door (both chips off):**
- Exactly as today: Height, then tap both ends.

**Full height on:**
- The Height field is replaced by the text "Height: the wall's height." (`data-opening-fullheight`).
- The "Type the door height first." check is skipped.

**Full height on a window:**
- The Sill field stays and is set to **0** when Full height is turned on. Type a sill for a window that runs from a sill up to the top of the wall.
- Hint: "It runs from the sill to the top of the wall."

**Cavity slider on:**
- A **Door width** field appears (`data-opening-leaf`, 300–1,500), with the help text "The door itself, e.g. 920".
- Under it: "Opening 1,860 (2 × 920 + 20)." (`data-opening-cavity-width`).
  - With no width yet it reads "Opening: 2 × door + 20."
- **Height** stays, unless Full height is also on.
- "A door sits on the floor." stays.

#### B3. Hints (`data-opening-hint`)

| State | Hint |
|---|---|
| Cavity slider, no door width | "Type the door width, then tap one end of the opening." (amber) |
| Cavity slider, ready | "Tap one end of the opening on the wall, then tap towards the other end. It's always 1,860 long." |
| Cavity slider, first end tapped | "Now tap towards the other end." |
| Full height, door or window | The existing "Tap one end of the door on a wall, then the other end." |

#### B4. Checks at the FIRST tap (nothing is kept when refused)

| Check | Message |
|---|---|
| Cavity slider with no door width | "Type the door width first." |
| Cavity slider longer than the wall | "A 1,860 opening doesn't fit on Wall 4 (1,500 long). Tap a longer wall." |
| Full height, wall has no height | "Wall 4 has no height yet. Select it and type its height, or turn off Full height." |
| Full height, wall is rake or gable | "Wall 4 isn't one height all along. Turn off Full height and type the height." |
| Full height window, sill at or above the top | "The sill is at or above the top of Wall 4. Check the sill." |

#### B5. Second tap on a cavity slider

The new pure helper `fixedWidthOpening` does this work (section 5.6).

**How the opening is placed:**
- The second tap is projected onto the first tap's wall, and only its direction is used.
- The width is always `cavityOpeningWidth(door width)`, so tap rounding can't turn 920 into 1,840 or 1,880.
- The existing "Tap the other end further away…" check (under 20 px) still applies.

**What can happen:**

| Result | What Sam sees |
|---|---|
| Saved | The card reads "**D2 in Wall 4 · cavity slider · 1,860 opening (920 door)**". With Full height it also reads "· full height". |
| Saved after a nudge of 100 mm or less | Card note: "D2 ran 40 past the end of Wall 4, so it's moved back to finish at the end. Undo, or move it on the elevation." |
| Refused, more than 100 past the end (first end kept) | "From there, the 1,860 opening runs 300 past the end of Wall 4. Tap towards the other end, or Undo this end." |
| Refused, runs into another opening (first end kept) | "From there, the 1,860 opening runs into W1. Tap towards the other end, or Undo this end." |
| Saved, the wall also carries a cladding-family item | Extra card note: "Wall 4 also has Cladding: it loses the whole 1,860, pocket included. Check it on the elevation." |

**What is saved** (example):

```json
{ "xMm": 600, "sillMm": 0, "widthMm": 1860, "heightMm": 2040, "label": "D2", "type": "door", "cavityLeafMm": 920 }
```

#### B6. Full-height door or window (two end taps, as today)

- The card reads "**D3 in Wall 3 · 820 wide · full height**".
- What is saved (example): `{ …, "heightMm": 2400, "fullHeight": true }`, where `heightMm` = wall height − sill at save time.

#### B7. Taps

| Job | First time | Each next one in the same session |
|---|---|---|
| New cavity slider | **5** + typing 920 once (+ Door, Cavity slider, Door width field, tap one end, tap towards the other) | **2** |
| Full-height door | **4** (+ Door, Full height, two end taps) | **2** |
| Full-height window (sill already 0) | **4** | **2** |
| Full-height cavity slider | **6** + typing once | **2** |
| Typing the 1,860 | never | never |

---

### C. Doors already drawn (Sam's job right now)

This happens on the wall's elevation, in the opening sheet (`OpeningForm`, WallsScreen.jsx:813-841). There are no plan changes for existing doors.

**Route:** Select → tap the wall → **Open elevation** → tap D2.

The opening sheet gets a chip row under **Type** (`data-opening-flags`):
- `[ Full height ]` shows when the wall is straight and has a Wall height.
- `[ Cavity slider ]` shows when Type = Door and the wall is on a timber walls item.

**Full height:**
- **On:** the Height field becomes the read-only "Height: to the top of the wall (2,400)", and `heightMm` is written as H − sill.
  - Sill stays editable. Changing it rewrites the height in the same edit.
  - Dragging the opening on the elevation rewrites the height in the same edit too.
- **Off:** the current height stays as a normal typed height.
- **On a wall that is no longer one height:** the chip is disabled with "Full height only works on a wall of one height. Using 2,040."

**Cavity slider on a door 1,200 wide or less:**
- A row appears: "Which side does the door slide into?" `[ ◀ Left ]` `[ Right ▶ ]`. Left is the wall start, as on the elevation.
- Nothing is saved until a side is tapped. Then it saves in one edit, which is one Undo:
  - **Right ▶:** the offset stays and the width becomes 2 × w + 20.
  - **◀ Left:** the offset becomes offset − (w + 20) and the width becomes 2 × w + 20, so the shut edge stays put.
- A side that would run off the wall or into another opening is greyed out and reads "No room" (or "Hits W1").

**Cavity slider on a door over 1,200:**
- It saves straight away, with no side to choose: `cavityLeafMm = round10((w − 20) / 2)`.
- Text: "D2 is 1,860 wide, so it's taken as the whole opening: a 920 door and its pocket. Change Door width if that's wrong."

**While it is a slider:**
- The **Width** field is replaced by a **Door width** field.
- Below that is the read-only line "Opening 1,860 (2 × 920 + 20)."
- Changing Door width keeps the left edge and rewrites the width. If the new width doesn't fit, it is refused: "A 1,960 opening runs past the end of this wall. Move it first."
- Info line: "No studs or noggins in the pocket. The head over it and the cavity kit aren't counted."

**Cavity slider off:** `cavityLeafMm` is deleted and the width stays. Text: "D2 is now a plain 1,860 opening. Undo to go back."

**Type changed from Door to Window or Other:** `cavityLeafMm` is dropped in the same edit.

**Read-only view:** "D2 · door · cavity slider (920 door) · 1,860 × 2,040 mm · sill 0 · from start 600".

**Taps:**

| Change | Taps |
|---|---|
| Existing door → cavity slider | **6**: tap the wall, Open elevation, tap D2, Cavity slider, ◀ or ▶, Done. **5** for a door already over 1,200. **+1** if you start outside Select. |
| Existing door → full height | **5** |

---

### D. Phone and iPad

- **Phone portrait:** the bottom sheet stays capped at 42vh (MeasureScreen.jsx:1489).
  - The wet panel is 4–5 short lines, so the plan stays big.
  - The door panel gains one chip row.
  - There must be no sideways scroll at 375 px.
- **iPad landscape:** the 360 px right panel (`min(360px, 42vw)`) shows everything without scrolling. iPad portrait uses the bottom sheet.
- **Gestures are unchanged in every mode.**
  - Two fingers pan and zoom.
  - A one-finger drag pans.
  - A 500 ms hold opens the magnifier.
  - This is why there is no box or lasso select.

---

## 4. Data

There is **no migration**. Opening and wall inputs have no DB check (mig 207:22,46). Every new field lives in the existing `geometry.inputs` jsonb. Material rules are unchanged, so `tc-hub028.spec.js:398` (the exact rules object) and the 60-key cap don't come into it.

### 4.1 Fields

| Record | Field | Type and bounds | Default when absent | Who writes it |
|---|---|---|---|---|
| wall `inputs` | `studCentresMm` | number, 100–1,200 mm. The UI writes only 450. | The Walls item's `rules.centresMm` (600). This is every wall today. | Wet mode, the Select chip and the wall-page chip. Clearing DELETES the key and never writes `null` or 600. |
| opening `inputs` | `fullHeight` | `true` only. Anything else is dropped. | Off | The + Door / + Window chip and the elevation chip |
| opening `inputs` | `cavityLeafMm` | number, 300–1,500 mm. Kept only when `type === "door"`. | Not a slider | The + Door chip and the elevation chip |
| opening `inputs` | `widthMm` (existing) | unchanged. On a slider it is the full framing opening. | n/a | Written as `cavityOpeningWidth(cavityLeafMm)` in the same edit as the leaf |
| opening `inputs` | `heightMm` (existing) | unchanged and still required. On a full-height opening it is a snapshot of H − sill. | n/a | Rewritten in the same edit as any change to the wall height or the opening's sill |

### 4.2 Shared constants (`shared/takeoff/engine/families.js`, exported from `shared/takeoff/index.js`)

```js
/** Sam, 17 Nov 2026: wet-area walls at 450 centres (HUB 031). The only per-wall value the app writes. */
export const WET_WALL_CENTRES_MM = 450;
/** Sam, 17 Nov 2026: "a pocket door is double the width of the door opening + 20ish mm" [confirm 20]. */
export const CAVITY_SLIDER_EXTRA_MM = 20;
/** An existing door wider than this is read as a whole slider opening when Cavity slider is turned on [Default]. */
export const CAVITY_LEAF_WIDE_MM = 1200;
export const cavityOpeningWidth = (leafMm) => 2 * leafMm + CAVITY_SLIDER_EXTRA_MM;
export const cavityLeafFromOpening = (widthMm) => Math.round((widthMm - CAVITY_SLIDER_EXTRA_MM) / 2 / 10) * 10;
```

The UI, the engine and the tests read these. No number is typed twice.

### 4.3 Server (`server/lib/takeoff/takeoffService.mjs` `cleanInputs`, lines 222-247)

```js
// wall branch, inside `out` (after floor / runId):
...(i.studCentresMm != null && i.studCentresMm !== "" ? { studCentresMm: MM(i.studCentresMm, "Stud centres", { min: 100, max: 1200 }) } : {}),
// opening branch (type computed first):
...(i.fullHeight === true ? { fullHeight: true } : {}),
...(type === "door" && i.cavityLeafMm != null && i.cavityLeafMm !== "" ? { cavityLeafMm: MM(i.cavityLeafMm, "Door width", { min: 300, max: 1500 }) } : {}),
```

- Refusal wording comes from `MM`: "Stud centres must be between 100 and 1,200 mm." and "Door width must be between 300 and 1,500 mm."
- There is no cross-check between `widthMm` and `cavityLeafMm`, so an old client that edits Width still saves. `widthMm` is always the framing truth.
- Export `cleanInputs` (as `export { cleanInputs as cleanMeasurementInputs }`) for the pure tests.
- **Capabilities:** in `takeoffAccess.mjs` add `export const TAKEOFF_INPUT_FEATURES = Object.freeze({ wallCentres: true, cavitySlider: true, fullHeight: true })`. In `takeoffRoutes.mjs`:63 and :80, spread `features: TAKEOFF_INPUT_FEATURES` into both `caps`.

### 4.4 UI Review mock (`src/ui-review/fixtures/takeoff.js`)

- `WALL_INPUT_KEYS` (:341) adds `"studCentresMm"`. The mock drops it when it is `null` or `""`.
- `serverOpeningInputs` (:355) keeps `fullHeight` only when it is `=== true`, and `cavityLeafMm` only when `type === "door"`.
- `caps()` (:330, :334) adds `features: { wallCentres: true, cavitySlider: true, fullHeight: true }`.
- A review knob `takeoffFeatures=off` removes `features`, to test the gate.
- **New seed** `takeoffSeed=walls-wet`:
  - one Walls item at 600, with 6 straight walls on page 1 in one Line run (Wall 1–6, 2,400 high, lengths 3,600 / 2,400 / 2,700 / 1,500 / 3,000 / 3,600);
  - D1 = 920 × 2,040 at 600 on Wall 1, and D2 = 1,860 × 2,040 at 300 on Wall 6;
  - one Cladding item whose own wall is traced exactly on top of Wall 5.

### 4.5 Client memory (`lastOpeningSizes`, tools.js:566-577)

- Returns `{ window: { heightMm, sillMm }, door: { heightMm, leafMm } }`.
- Height and sill come from the last window or door **without** `fullHeight`, so a full-height door never becomes the next plain door's height.
- `leafMm` comes from the last door with `cavityLeafMm`, or is `null`.
- The chips are session state only: `openFlags = { cavity: false, fullHeight: false }`, reset in `startOpening`. No localStorage is used.

### 4.6 Back-compat and deploy order

- **Existing jobs:** with the fields absent, engine output is byte-identical (test E3). Existing draft order lines are not marked stale.
- **Toggling 450 on and then off** gives byte-identical inputs and the original `dependencyKey` (test E4).
- **Older cached clients** keep the new keys when they edit, because `setWallHeight` copies `...m.inputs` (MeasureScreen.jsx:963-965) and `updateWall` copies `...latest.inputs` (WallsScreen.jsx:1340-1344).
  - They just don't show the blue walls or the chips.
  - A slider still frames correctly on them, because `widthMm` is the full opening.
  - Their on-screen Walls line shows 600-centre numbers until they update. The server's `computeWorkspace` (orders and exports) uses 450.
- **The offline recovery queue** (`editorDrafts.js`, `useTakeoffWorkspace.js`) carries change-sets whole and picks no input keys. Checked on 56a8bc5.
- **Ship it in ONE push:** server whitelist + capabilities + mock + client. The capabilities gate covers any Vercel/Railway or PWA skew.
- **A push to main reaches crews at once** (TAKEOFF_ENABLED has no per-feature flag), so it needs Sam's word.

---

## 5. Engine rules and worked examples

### 5.1 `resolveWall` (shared/takeoff/engine/dispatch.js:132-167)

**Wall:** add `studCentresMm: Number(inp.studCentresMm) > 0 ? Number(inp.studCentresMm) : null`.

**Each opening:**
- Add `fullHeight: x.fullHeight === true` and `cavityLeafMm: Number(x.cavityLeafMm) > 0 ? Number(x.cavityLeafMm) : null`.
- **Full-height rule.** If all of these hold, then `heightMm = H − sill` and `y1 = H`:
  - `x.fullHeight === true`;
  - `kind === "rect"`;
  - `H = Number(inp.heightMm) > 0`;
  - `sill < H`.
- Otherwise the stored `heightMm` stands.

The rule is resolved once, so cladding, wall areas, battens and framing all see the same head. A full-height door already gets no head batten (followers.js:271-284).

### 5.2 `wallOpenings` (shared/takeoff/engine/timber.js:611-648)

**Rule:** after `headMm` is worked out, add:

```js
if (o.fullHeight === true && sillMm < studLengthMm - EPS_MM) headMm = studLengthMm;   // HUB 031: top plate is its head
```

- Both stud adapters pass `...(o.fullHeight ? { fullHeight: true } : {})` in their opening objects: Walls at dispatch.js:424, and legacy `wall_frame` at :291.
- So a full-height opening on a Studs item in frame-height mode, or with its own `studHeightMm`, never blocks with "sill and head must sit within the stud height".
- It is never clipped, so there is no `opening_clipped` note.

### 5.3 `runWallFraming` (dispatch.js:388-502), per-wall centres

- **Centres per wall.** Per wall: `const wc = Number(w.wall.studCentresMm) > 0 ? Number(w.wall.studCentresMm) : centresMm;`. Pass `centresMm: wc` to that wall's `computeStudWall`.
- **Layout.** Record `centresMm: wc` and `centresFrom: wc === centresMm && !(w.wall.studCentresMm > 0) ? "item" : "wall"` in the layout (:490).
- **Explain line** when `centresFrom === "wall"`: `${tag}: studs at 450 centres (this wall).`
- **Nothing else changes:**
  - Plates join over the counted studs (:437-443), so they follow 450.
  - Noggin stations and bays follow the counted studs.
  - Noggin lengths are still shared across the whole item (one allocator call per material).
  - Rows stay by height (1 row up to 2,700, 2 rows over).
  - Set-out is unchanged: each wall runs from its own first traced point, with a stud at each end.
- **Legacy Studs** (`wall_frame@1`, :278-312) does not read `studCentresMm`.
  - When a wall on it has the field, it adds the non-blocking note code `wall_centres_ignored`: "Wall 3 is set to 450 centres, but Studs uses its own centres (600) for every wall."
  - Add the code to `NOTE_CODES` in `shared/takeoff/fixes.js:72`; the guard test enforces this.

### 5.4 Cavity slider

**There is no framing-code change.** The opening is the full 2 × leaf + 20, so the existing engine already:
- removes every grid stud strictly inside it (timber.js:846-851);
- puts 2 side studs each side, the first stud's face on the opening edge and the second against it;
- puts no noggins in any bay that overlaps it (timber.js:1144-1196);
- runs the plates full length.

An overlap with another opening still blocks that wall (timber.js:640-646). It is refused at placement (B5) and on the elevation (C), so it is never a silent hold.

### 5.5 Totals text (src/components/takeoff/measure/tools.js:411-473)

- `wallFramingTotals(result, wallId)` adds `ownCentres: { 450: 3 }`, counting layouts with `centresFrom === "wall"`. It does this only when `wallId == null`.
- `wallFramingText` appends ` · 1 wall at 450` / ` · 3 walls at 450` (or ` · 3 walls at 450, 1 at 300`) when `ownCentres` has entries. Otherwise the string is byte-identical to today.
- `wallFramingNotes(result, wallId, spec, itemName)` adds "Studs at 450 centres on this wall (Walls: 600)." for that wall's layout.

### 5.6 Placement helpers (client, pure)

**`fixedWidthOpening`** in `src/components/takeoff/measure/geometry.js`:

```js
fixedWidthOpening({ wallLenMm, firstMm, secondMm, widthMm, others = [], nudgeMaxMm = 100 })
// -> { ok: true, xMm, widthMm, movedMm: 0|n, movedTo: null|"start"|"end" }
// -> { ok: false, reason: "too_long" }                     // widthMm > wallLenMm
// -> { ok: false, reason: "past_end", overMm, end: "start"|"end" }
// -> { ok: false, reason: "overlap", label }               // others = [{ x0, x1, label }] on this wall
```

- **Anchor:** `round10(firstMm)`.
- **Direction:** the sign of `secondMm − firstMm`.
- **Nudge:** an overrun of 100 mm or less is shifted to sit against that wall end.
- **Output:** all values rounded to 10 mm, like `planOpening`.
- **Stations:** the station comes from the same projection `nearestWall` uses. The second tap is projected onto the first tap's wall with no reach limit, because only its direction is used.

**Other helpers** in `tools.js`:
- `toggleWetWall(inputs)`: adds 450, or deletes the key.
- `wetWallsOf(measurements, contributions, materialId)`: names and count.
- `fullHeightInputs(openingInputs, wallInputs)`: the H − sill snapshot.
- `fullHeightFollowers(openings, wallInputs)`: returns `[{ before, next }]` for that wall's full-height openings.
  - Used by `setWallHeight` (MeasureScreen.jsx:963) and `updateWall` (WallsScreen.jsx:1340). Any other client path that writes a wall's `heightMm` must also use it: grep for it at build time.
  - The wall and its openings go in ONE `record()`, so one Undo.
- `cavityConvert(inputs, side, wallLenMm, others)`: the ◀ / ▶ and over-1,200 rules in C.

### 5.7 Worked examples

These were run on 56a8bc5 through the real `computeWorkspace`, with Sam's default Walls parts:
- studs 90 × 35 LVL Smart 10 H2 (35 thick along the wall);
- plates 90 × 45 MGP10 H2;
- noggins 90 × 35 MGP10 untreated.

The Wall height is the stud cut (2,400), the item is at 600 centres, and there is 1 noggin row (2,400 ≤ 2,700). Positions are stud centres from the wall's start. Today's engine was fed the `widthMm` / `heightMm` this plan would save; the new fields change nothing about the numbers below except where stated.

**Example 1: a 920 cavity slider in a 3,600 × 2,400 wall (90 mm wall, 600 centres)**

**Placement:**
- First tap at 600 from the wall start. The second tap is towards the far end.
- Opening = 2 × 920 + 20 = **1,860**, running from 600 to 2,460.
- Saved: `{ xMm: 600, widthMm: 1860, cavityLeafMm: 920, sillMm: 0, heightMm: 2040, type: "door", label: "D1" }`.

**What is counted:**

| Part | What is counted |
|---|---|
| Studs | **7 × 2,400**, at 0, 547.5, 582.5 \| 2,477.5, 2,512.5, 3,000, 3,600. The side studs: 582.5 (face on 600), 547.5 behind it, 2,477.5 (face on 2,460), 2,512.5 behind it. Grid studs at **1,200, 1,800 and 2,400 are removed** (pocket and doorway). |
| Plates | Bottom plate 3,600 + top plate 3,600, full length with no gap at the door |
| Noggins | 1 row, **3 pieces**: 512.5 (0 → 547.5), 452.5 (2,512.5 → 3,000), 565 (3,000 → 3,600). None across the 1,860. |
| Not counted | The head or lintel over the 1,860, jacks, trimmers and the cavity kit. The note reads "Lintels, jacks and trimmers at D1 aren't counted." |
| Walls line | "Walls: 7 studs at 2,400 · bottom plate 3.60 m · top plate 3.60 m · 3 noggins (1 row)" |

**Compared with other versions of the same wall:**

| Version | Studs | Noggins |
|---|---|---|
| A plain 920 door at the same spot | 9 (0, 547.5, 582.5, 1,537.5, 1,572.5, 1,800, 2,400, 3,000, 3,600; only 1,200 removed) | 5 |
| The slider (above) | 7: two fewer, because the pocket is empty | 3: two fewer |
| The slider, full height | 7, identical framing: Walls never frames above a head | 3 |
| The slider on a wet wall at 450 | 9 (0, 450, 547.5, 582.5, 2,477.5, 2,512.5, 2,700, 3,150, 3,600; 900, 1,350, 1,800, 2,250 removed) | 5 (415, 62.5, 152.5, 415, 415) |

The 62.5 noggin is today's short-bay behaviour, unchanged.

**Example 2: a full-height 820 door in a 3,000 × 2,400 wall**

**Saved:** `{ xMm: 1000, sillMm: 0, widthMm: 820, heightMm: 2400, fullHeight: true, type: "door", label: "D1" }`. The engine works out head = 2,400 = the top of the studs (the underside of the top plate).

**What is counted:**

| Part | What is counted |
|---|---|
| Studs | **8 × 2,400**, at 0, 600, 947.5, 982.5, 1,837.5, 1,872.5, 2,400, 3,000. Grid studs at 1,200 and 1,800 are removed. |
| Plates | 2 × 3,000 |
| Noggins | 4 (565, 312.5, 492.5, 565) |

**What full height changes:** the stud, plate and noggin numbers are the same as an 820 × 2,040 door, because Walls never frames above a head. Full height changes:
- the opening follows the wall: raise Wall 1 to 2,700 and the door resolves to 2,700, with no "opening_clipped" note;
- cladding and wall areas take off 820 × 2,400;
- there is no head batten;
- a framing detail never asks "above the head".

**Example 3: a wet wall changed from 600 to 450 centres (Wall height 2,400, no openings)**

| Wall length | Studs at 600 | Studs at 450 | Noggins at 600 | Noggins at 450 |
|---|---|---|---|---|
| 2,400 | **5** (0, 600, 1,200, 1,800, 2,400) | **7** (0, 450, 900, 1,350, 1,800, 2,250, 2,400) | 4 × 565 | 5 × 415 + 1 × 115 |
| 2,700 | 6 | 7 | 4 × 565 + 1 × 265 | 6 × 415 |
| 3,600 | **7** | **9** | 6 × 565 | 8 × 415 |

- **Rule (no openings):** studs = ⌈L ÷ c⌉ + 1.
- **Noggin piece:** centre spacing − 35 (the stud thickness).
- The short last bay falls at the wall's far end, depending on which way it was traced. This is unchanged.

---

## 6. Files to change

| File | Change |
|---|---|
| `shared/takeoff/engine/families.js` | The constants in 4.2 |
| `shared/takeoff/index.js` | Export the constants. `CALCULATION_VERSION = "takeoff-calc@5"` with the comment "@5: per-wall stud centres, full-height openings, cavity sliders (HUB 031)". |
| `shared/takeoff/engine/dispatch.js` | `resolveWall` (5.1); `runWallFraming` per-wall centres, `centresFrom` and the explain line (5.3); pass `fullHeight` in both stud adapters (:291, :424); the legacy Studs `wall_centres_ignored` note |
| `shared/takeoff/engine/timber.js` | `wallOpenings` full-height head (5.2) |
| `shared/takeoff/fixes.js` | `NOTE_CODES` += `"wall_centres_ignored"` |
| `server/lib/takeoff/takeoffService.mjs` | The `cleanInputs` whitelist (4.3); export it for the tests |
| `server/lib/takeoff/takeoffAccess.mjs`, `takeoffRoutes.mjs` | `TAKEOFF_INPUT_FEATURES` and `capabilities.features` |
| `src/ui-review/fixtures/takeoff.js` | Keys, the `features` caps and the `takeoffFeatures=off` knob, the `walls-wet` seed (4.4) |
| `src/components/takeoff/measure/tools.js` | `COLORS.wetWall`; `lastOpeningSizes` (4.5); `wallFramingTotals` / `wallFramingText` / `wallFramingNotes` (5.5); the helpers in 5.6 |
| `src/components/takeoff/measure/geometry.js` | `fixedWidthOpening`, and an unbounded projection onto one wall |
| `src/components/takeoff/MeasureScreen.jsx` | Wet mode (state `wetMode`, dispatched in `onTap` before `mode === "select"`, exits on tool or page change); the Select sheet button (:1789); the wall-sheet chip row (:1873-1894); `setWallHeight` + `fullHeightFollowers`; the opening chips, fields, hints and `openingTap` cavity / full-height branches and card text (:651-730, :1556-1600); wet colour and label on the plan (:1281-1285) |
| `src/components/takeoff/WallsScreen.jsx` | `OpeningForm` chips, Door width, ◀ / ▶, read-only rows (C); `updateWall` + `fullHeightFollowers`; the snapshot on sill edit and on drag commit; the wall-page chip pair and note (A3) |
| `src/components/takeoff/WallElevation.jsx` | No change expected (it draws `inputs` x / sill / width / height). Verify only. |
| Tests | See section 7 |
| Docs | See section 8 |

---

## 7. Tests

The baseline on 56a8bc5 is already green: hub028 86/0, hub022-openings 15/0, hub022 14/0, tc-timber 64/0, tc-review 10/0.

### 7.1 Pure node tests

New file: `scripts/tests/takeoff-tc-hub031.test.mjs`. `takeoff-run-all.mjs` picks up every `takeoff-tc-*` file on its own.

**Step 0, before any engine edit:** write `scripts/tests/fixtures/hub031-baseline.json` from today's `computeWorkspace` output. It covers:
- the hub028 EXAMPLE at 2,700 and 3,000;
- the mixed run;
- a Studs item;
- a cladding wall with D1 and W1.

Commit it.

**E1 to E16:**

- **E1 Per-wall 450.**
  - A 3,600 × 2,400 wall with `studCentresMm: 450` gives 9 studs at the positions in 5.7 and 8 × 415 noggins.
  - Absent gives 7 studs and 6 × 565.
  - A 2,400 wall gives 5 → 7, and a 2,700 wall 6 → 7.
  - `layout.centresMm` = 450, `centresFrom` = "wall", method `wall_framing@1`.
  - The count is the same traced in either direction.
- **E2 Mixed item.**
  - Wall A at 450 and wall B absent: B's layout is deep-equal to B alone.
  - There is still one noggins allocator line for the item.
  - Changing the item from 600 to 400 leaves A at 450.
- **E3 Regression.** Every baseline fixture is deep-equal to `hub031-baseline.json`: layouts, demands, schedule lines, problems and `dependencyKey`.
- **E4 dependencyKey.**
  - Toggling 450 on changes the key.
  - Deleting the key restores the original key exactly.
  - `fullHeight` and `cavityLeafMm` each change the key.
- **E5 Cavity slider, worked example 1.**
  - Studs [0, 547.5, 582.5, 2,477.5, 2,512.5, 3,000, 3,600]; removed [1,200, 1,800, 2,400].
  - Noggins [512.5, 452.5, 565]; plates 2 × 3,600.
  - The note `opening_framing_not_counted`, and the label D1.
  - Mirrored (opening at 1,140 → 3,000): 7 studs.
  - At 450: the 9 studs and 5 noggins in 5.7.
- **E6 Full height.**
  - Worked example 2, exactly.
  - Wall raised to 2,700: resolved `heightMm` 2,700 and no `opening_clipped`.
  - A non-flag 2,700 door on a 2,550 wall keeps today's clip note.
  - A window with sill 900 on a 2,700 wall resolves to 1,800.
  - A gable wall uses the stored height.
  - A Studs item in frame-height mode: head = stud length, not blocked.
  - A cladding wall area takes off 820 × 2,400.
  - No head batten.
- **E7 Legacy Studs.** It ignores `studCentresMm` (studs unchanged) and gives the `wall_centres_ignored` note with the exact text.
- **E8 `fixedWidthOpening`.** Covers:
  - forward and backward;
  - a 40 mm nudge at the end, and one at the start;
  - past the end by 300;
  - `too_long` (1,860 on 1,500);
  - an overlap with W1;
  - rounding to 10.
- **E9 `cavityConvert`.**
  - Right keeps x; Left gives x − 940 for a 920 door.
  - No room on either side.
  - An opening of 1,860 or more is read as a 920 door.
  - Off keeps the width; a type change drops the leaf.
  - `cavityOpeningWidth(920)` = 1,860 and `(820)` = 1,660.
- **E10 Totals text.**
  - "… · 1 wall at 450" and "… · 3 walls at 450".
  - With none mixed, the exact current string.
  - Per-wall totals have no suffix.
  - The `wallFramingNotes` line text.
- **E11 `lastOpeningSizes`.**
  - The new shape: update the exact assertion at `takeoff-tc-hub022-openings.test.mjs:159-172` (door gains `leafMm`).
  - Full-height openings are skipped for heights.
  - `leafMm` comes from the last slider.
  - The `openingRecord` shape check at :174-178 stays green.
- **E12 `fullHeightFollowers`.**
  - A wall going from 2,400 to 2,700 rewrites D1 (sill 0) to 2,700 and W1 (sill 300) to 2,400.
  - Plain openings are untouched.
  - The output is one op.
- **E13 Server `cleanMeasurementInputs`.**
  - 450 is kept.
  - 50 and 5,000 are refused with "Stud centres must be between 100 and 1,200 mm.".
  - Absent, `""` and `null` all give the key absent.
  - `fullHeight: "true"` is dropped.
  - `cavityLeafMm` is kept on a door and dropped on a window or other; 200 is refused with "Door width must be between 300 and 1,500 mm.".
  - An unknown key is still dropped.
- **E14 `toggleWetWall`.** On and then off gives deep-equal inputs, with no `studCentresMm` key.
- **E15** `CALCULATION_VERSION` is `@5`: update `takeoff-tc-hub028.test.mjs:470`.
- **E16** `NOTE_CODES` guard passes with `wall_centres_ignored`.

### 7.2 DB-backed (must RUN; a SKIP fails the run)

In `scripts/tests/takeoff-api.test.mjs`, on the real routes and the local Postgres `~/.blh-takeoff-pg:55432`. No hosted URLs.

- A wall saved with `studCentresMm: 450` reloads with it. Saved again without it, it reloads absent (not `null`).
- A door with `fullHeight` + `cavityLeafMm` round-trips. A window with `cavityLeafMm` drops it.
- 50 is refused with a 400 and the plain message.
- `capabilities.features` is on the workspace GET.
- :1117 and :1142 (unknown keys dropped) stay green.
- Two takeoff-api tests are already flaky on random ids (HUB_REVIEW_LOG.md:83-85). Re-run them; don't hide them.

Then run the full `npm run test:takeoff`: all 40 suites, plus the new one, with no skips.

### 7.3 UI review (mock, never production)

**Setup:**
- Use your own vite with a no-HMR config in the scratchpad: `VITE_UI_REVIEW_MODE=true npx vite --config <scratch>/vite.nohmr.config.js --port 5197 --strictPort`.
- Run `UI_REVIEW_PORT=5197 PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test --config=playwright.ui-review.config.js e2e/ui-review/tc-hub031.spec.js`.
- **Never use 5180** (Sam's preview, and `reuseExistingServer` would test another checkout).
- **Never use the main `playwright.config.js`.**
- "Reload" means pushState in the app.

**Viewports:** 390×844 touch; 375×667 (no sideways scroll, every new target ≥ 44 px); WebKit iPhone 13; iPad 1024×768 and 768×1024.

**New spec `e2e/ui-review/tc-hub031.spec.js`, seed `walls-wet`:**

- **W1.**
  1. Select → **Wet-area walls at 450** → tap Walls 1, 2, 3.
  2. Expect: the 3 walls are `#0e7490`; the labels end "· 450 ctrs"; the count reads "3 walls at 450: Wall 1, Wall 2, Wall 3"; the Walls line ends "· 3 walls at 450".
  3. Tap ↶ once. Expect 2.
  4. Tap Done, then reload. Expect still 2. The saved inputs have `studCentresMm: 450`.
- **W2.** Tap a blue wall: "Wall 2 back to 600". The key is gone from the saved inputs.
- **W3.** Select Wall 4 → chip 450. One Undo puts it back.
- **W4.** In wet mode, a tap on Wall 5 (with the cladding wall on top) toggles only the Walls wall. The cladding wall's inputs are unchanged.
- **W5.**
  - With the item's Stud centres at 450: no button and no chip.
  - With `takeoffFeatures=off`: no wet button, no chip and no opening chips.
- **W6.** A double-tap on one wall within the burst window changes it once.
- **D1.**
  1. + Door → Cavity slider → Door width 920 → tap at 600 on Wall 1… (use the plan-point formula from SOP 20-08 §14) → tap towards the end.
  2. Expect `data-width-mm=1860` and the card "D… · cavity slider · 1,860 opening (920 door)".
  3. The next slider takes 2 taps.
- **D2.**
  - Near a wall end (40 over): nudged, with the note.
  - 300 over: refused, with the first end kept.
  - On Wall 4 (1,500): refused at the first tap.
  - Into D1: refused with "runs into D1".
- **D3.**
  1. Full height door on Wall 3 (2,400): `heightMm` 2,400.
  2. Select Wall 3 and set its height to 2,700. The door's saved `heightMm` becomes 2,700 in the same edit.
  3. One ↶ restores both.
- **D4.** + Window Full height: sill 0, and height = the wall's.
- **D5.** Elevation: tap D1 (920) → Cavity slider → Right ▶ gives 1,860 with the offset unchanged. ↶ goes back. ◀ Left gives offset − 940.
- **D6.** Elevation D2 (1,860) → Cavity slider: saved at once with Door width 920 and the text shown. Width is read-only while it is a slider.
- **D7.** Outline walls (Rectangle): no chips.
- **D8.** Plan Select on a wall with a door still selects the wall. `tc-measure.spec.js:889` stays green.

**Re-run** the existing `tc-hub028`, `tc-measure` and `tc-walls` specs. These overwrite the tracked evidence PNGs in `docs/takeoff/evidence/ui/`: revert them with `git checkout -- docs/takeoff/evidence/ui`, or commit them on purpose.

### 7.4 Real-stack sandbox

- Run `takeoff:sandbox` **isolated**: set your own `TAKEOFF_SANDBOX_DB`, `TAKEOFF_SANDBOX_HOME` and ports. **Never `--reset` `blh_takeoff_sandbox`.**
- Then run a `tc-journeys-sandbox` journey via `playwright.tc-evidence.config.js` (desktop Chromium + WebKit iPhone 13):
  - one wet-wall toggle, one cavity slider and one full-height door, saved and reloaded;
  - check the stud count and the 1,860 against 5.7.

### 7.5 Gates before any push

- `npm run test:takeoff` all green, with the DB suites actually run.
- `npm run lint` 0.
- `npm run build`.
- The ui-review screens green.
- The sandbox journey green.

The real iPhone and iPad check stays an owner step.

---

## 8. SOP and doc updates (written with the code, CLAUDE.md SOP law)

### `docs/sops/20_takeoff/20-08_timber_takeoff.md`

- **§5D Walls (:143):** replace the "Walls 2 at 450" tip with these numbered steps:
  1. Tap **Select**.
  2. Tap **Wet-area walls at 450**.
  3. Tap each wet-area wall. It turns blue and reads "450 ctrs".
  4. Tap a blue wall again to put it back.
  5. Tap **Done**.
  - Add the one-wall route: "Select the wall → Stud centres **450**."
  - Add: "450 changes stud spacing only. Blocking for vanities, grab rails and taps isn't added: count it on a Timber item."
- **§5D + Door:** add the **Cavity slider** steps (type the door width once, tap one end of the opening, tap towards the other end) and the **Full height** steps.
- **§7 common mistakes (:204-205):** replace both "Walls 2" rows with:
  - "Tapped the wrong wall: tap it again, or ↶."
  - "Wet-area walls button missing: the item is already at 450, it's a Studs item, or nothing is traced on this page."
  - "Each wall sets out from its own start; the short bay lands at the far end."
- **§8 troubleshooting (:248):** add rows for:
  - the Walls line not saying "· N walls at 450" (the walls are on another item, or hidden);
  - "Studs uses its own centres";
  - "runs past the end of Wall N";
  - "runs into W1";
  - "isn't one height all along".
- **§11 framing rules (~:302):** add these rules:
  - a cavity slider = a framing opening of 2 × door + 20, with no studs or noggins in it and 2 full studs at each edge;
  - the head or lintel and the kit aren't counted;
  - full height = the head at the underside of the top plate, with nothing above it;
  - a wall's own centres beat the item's.
- **§12 edge cases:** a wall on two Walls items keeps its 450 on both. An old cached app shows 600 numbers until it updates.
- **§14:**
  - Rewrite **TC-17** as per-wall 450 + Undo + reload.
  - Keep **TC-18** for older two-item jobs (counted-twice note), not as the wet-area method.
  - Add **TC-19** wet-area bulk mode (W1/W2/W6).
  - Add **TC-20** single-wall chip + cladding wall not caught (W3/W4).
  - Add **TC-21** cavity slider framing on the Walls line (worked example 1).
  - Add **TC-22** full-height door follows the wall height (worked example 2, D3).
  - Add **TC-23** legacy Studs note.
  - Keep TC-01..TC-05.
- **Status banner:** add one line for HUB 031 (built on branch, not deployed, iPhone check pending).

### `docs/sops/20_takeoff/20-09_cladding_walls_and_elevation.md`

- **§C2 (:101-113):** the Cavity slider and Full height steps, and the "no chips on outline walls" line.
- **§E (:164-170):** an existing door → cavity slider (◀ / ▶, the over-1,200 rule, Door width, Width read-only), and an existing opening → full height.
- **§7/§8:** "the cladding loses the whole slider opening, pocket included" (known limit, Later fix).
- **§11 developer note (:350):** change "no new fields" to "`fullHeight` and `cavityLeafMm` on opening inputs, `studCentresMm` on wall inputs; a slider's `widthMm` is the full framing opening".
- **§14:** add **TC-25** full-height window (sill 0, sill typed), **TC-26** slider placed / nudged / refused, **TC-27** existing door converted on the elevation, **TC-28** chips hidden on outlines and when the server lacks the feature.

### `docs/sops/20_takeoff/20-03_measure_runs_and_count.md`

- **§E Select (:100-105):** "Select is one item at a time, except **Wet-area walls at 450**, which toggles walls one tap each."
- **§14:** add **TC-14**.

### Plans, the log and the indexes

- **`docs/hub_review/WALLS_FRAMING_PLAN.md`** (:81-82, :196, :260, :534-535): add "REVERSED by Sam 17 Nov 2026 (HUB 031): the Walls item's Stud centres is the default; any wall can be set to 450 by itself."
- **`docs/hub_review/HUB_REVIEW_LOG.md`:** a HUB 031 row with "iPhone check" pending.
- **`docs/sops/SOP_INDEX.md`:** the three SOPs stay `test_status: untested`, with the updated date.
- **`docs/sops/SOP_CHANGELOG.md`:** an entry dated 2026-11-17 (plan), then the build date.

---

## 9. Risks (and what covers them)

1. **Owner decision.** This reverses decision 4. Q1 confirms it before any code.
2. **Silent drop on deploy skew.** The capabilities gate (D14) covers it, plus the mock parity test, the real-route DB test that must RUN, and one push.
3. **Cladding loses the pocket (D8).** This is rare (sliders are in internal walls). A card note covers it, and the fix is Later.
4. **Old cached clients** show 600 numbers while orders use 450, until they refresh. A slider still frames right on them.
5. **A door drawn at its full opening, then turned into a slider, doubled.** The over-1,200 rule (D12), the prefilled Door width and the "Opening 1,860 (2 × 920 + 20)" line cover it.
6. **Wrong pocket side on conversion.** The elevation's ◀ / ▶ match the drawing, and there is one Undo.
7. **A wall shortened later, so a slider no longer fits.** The existing block holds that wall with today's message ("must lie within the wall"). This is deliberate: it is never clipped silently.
8. **Two devices editing one wall.** Inputs are replaced whole (changeset.js:124), so one device's 450 can be lost to another's height edit. This is existing behaviour; the fix is Later.
9. **Undo is lost if Measure unmounts.** This is existing behaviour. Wet mode finishes inside one screen.
10. **Performance.** Each wet tap recomputes the view, like placing an opening. This hasn't been measured on a 400-plus measurement job: check on the sandbox with 200 walls.
11. **Test noise.** Port 5180, evidence PNGs, and iCloud dataless files on ~/Desktop: drive Playwright through Bash.
12. **No real-device check has ever been run.** It stays Sam's step.

---

## 10. Questions for Sam (3; each has a default)

1. **Per-wall 450 replaces the "Walls 2 at 450" method** (this reverses your 25 Oct decision 4). *Default: yes.* Older jobs with a Walls 2 keep working unchanged.
2. **Pocket allowance is exactly +20 mm** (so a 920 door = 1,860 opening), one value for every slider. *Default: 20.*
3. **The pocket end gets 2 full studs, like every other opening edge.** *Default: yes.*

Everything else uses the defaults in section 2, unless Sam says otherwise:
- the head and lintel and the kit not counted;
- the 1,200 cut-off;
- the 100 mm nudge;
- chips starting OFF.

---

## 11. Later (not in this release)

- Cladding and linings taking off only the door, not the pocket. This needs a stored pocket side.
- Picking doors and windows straight on the plan in Select, and "D2 ›" links from the wall sheet to the opening.
- Typed per-wall centres other than 450 ("Other…").
- A wet-area wall tag driving linings, villaboard, blocking or extra noggin rows.
- Counting the cavity kit as an order line. Counting a lintel over the slider, which needs Sam's section and bearing (AS1684, not guessed).
- The cavity slider's rough-opening height allowance (door + track), and double or bi-parting sliders.
- Merging wall inputs key by key on a two-device conflict (`rebaseRecord`).
- "450" badges in the Walls list, and "cavity slider (920 door)" in the Schedule.
- Box or lasso multi-select.
- Tidying the stale SOP status banners (20-01:17, 20-09:17, SOP_INDEX:193).

---

## 12. Build order (one branch, one push on Sam's word)

1. Write `hub031-baseline.json` from today's engine and commit it (test E3's reference).
2. Constants + engine (5.1–5.3) + `NOTE_CODES`. Then run E1–E7, E15, E16 and the existing suites.
3. Server whitelist + capabilities + mock keys and seed. Then run E13 and the DB suites (they must run).
4. Pure client helpers (5.5, 5.6) + E8–E12, E14.
5. MeasureScreen (wet mode, Select chips, opening chips and placement).
6. WallsScreen (opening sheet, wall page, the height and sill snapshot).
7. Playwright ui-review at every viewport + the isolated sandbox journey. Revert the evidence PNGs.
8. SOPs, plan, log, index and changelog.
9. Gates (7.5). Then a done + next-steps note to Sam. **No push to main until Sam says so.**
