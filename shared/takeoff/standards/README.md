# shared/takeoff/standards

The cited span tables the Walls opening rules read (HUB 031, Sam 17 Nov 2026). Suggests a **lintel size** and a **jamb
count per side**. Nothing else. Private: Sam's licensed extracts and the manufacturers' guides are never redistributed.

| File | What | Source, edition, pages (PDF page) |
|---|---|---|
| `data/as1684-mgp10-n1n2.js` | T17, T18 lintels (sheet, tile); T47, T48 lower-storey lintels; T11 jamb studs; T7 studs; T36 lower-storey studs | AS 1684.2 N1/N2 Supplement 4 (2006), MGP10. Pages 22, 23, 50, 51, 14, 11, 41. Ported from Bestimator's verified tables (hash of each source file inside). Lintels re-read from `~/Documents/AS 1684 Span Tables/Non-cyclonic/N1N2/MGP10.PDF` by `scripts/takeoff/standards/verify-lintels-vs-pdf.mjs`: all 92 rows match |
| `data/smart10-2024.js` | S10-JAMB (jamb studs), S10-STUD-UN and S10-STUD-N20 (common studs), S10-LINTEL | Smart10 LVL Stud Design Guide, Mar 2024, N1 to N4. PDF pages 11 (guide 9), 7 (5), 9 (7), 17 (15). Internal, fully protected walls only (guide p. 3) |
| `data/smartlvl13-e1-2021.js` | L13-LINTEL, single span lintels in single/upper storey walls, N1 to N4, with the extra-bearing subscripts | SmartLVL 13 Design Guide, E1 2021. PDF pages 22, 23 (guide 19, 20) |

Generated, never hand-edited: `scripts/takeoff/standards/port-bestimator-mgp10.mjs` and `extract-lvl-guides.py` (read from the
PDFs' text layer, row and cell counts asserted). After extraction the PDF pages were read against the rendered pages
(Smart10 p. 9, SmartLVL 13 p. 19, including the subscript bearings).

**Not mapped yet**: AS 1684 N3/N4, C1 to C3 pages of both guides, lower-storey LVL lintels, concentrated-load tables, SmartLVL 13's
floor, rafter, beam, strutting, hanging and carport tables, Smart10's lower-storey and concentrated-load stud pages.

**Fail closed** (`index.js`): missing roof answer, wind class, storey, roof width over 7,500, spacing over 1,200 or a span past the table
never gives a size. Roof width and spacing round UP to the next column. The edition is shown on every size.
