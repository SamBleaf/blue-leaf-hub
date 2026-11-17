# Owner answers, 17 Nov 2026 (Sam). These override the plan defaults.

## Build now

1. **Wet-area 450.** Stud centres are set per wall (inputs.studCentresMm), through the select tools. This replaces the "Walls 2" rule.
2. **Cavity slider.** The opening is 2 × leaf + 20 mm.
   - The pocket side is chosen while drawing, by the pointer or a click left or right of the opening.
   - We frame the jamb studs, the lintel and the head trim.
   - The pocket end gets 2 full studs.
3. **Full height** toggle in + Doors and + Windows, stored as a flag. Opening height = wall height.
4. **Automatic framing** when a window or door is placed:
   - Kings, jacks, and CRIPPLE studs above and below at the wall's centres. These must be COUNTED and ordered.
   - Sill and head trimmers.
   - Heights are measured from FLOOR level.
   - The jamb count includes both the king and the stud under the lintel.
   - Wide openings can need stacked trimmers (AS1684). Manual detail wins.
5. **Lintels.**
   - Suggested from the span tables.
   - Tap the lintel to add load information.
   - Flag a lintel that doesn't fit.
   - A typed size is fine for now.
6. **Map the LVL tables and build them in.** Sources:
   - `~/Downloads/Smart10-LVL-Design-Guide-2024.pdf`: all studs.
   - `~/Downloads/SmartLVL13-Design-Guide-E1-2021.pdf`: lintels and members.
   - The MGP10 tables from Bestimator (`src/standards/data`).
7. **Roof card:** the office fills it in.

## Later

- Concentrated-load marker
- Lower storey
- N3 / N4
