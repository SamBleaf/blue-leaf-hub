# Document engine — R01/R02 (Client Brief, Architect Brief, Selections Schedule)

Reuses the existing renderer `server/lib/docTemplates.renderDocxTemplate` (docxtemplater + angular-expressions).
No second document engine.

- `../../public/templates/blb-*-template.docx` — the brand v2 templates (placeholders + loops). Filled at runtime.
- `../../server/lib/documents/documentPayloads.mjs` — typed fixture → payload builders + pre-issue validation.
- `fixtures/*.json` — de-identified fictional test payloads (typical + long/edge).
- `render-r01.mjs` — fills templates via the existing renderer. `node scripts/documents/render-r01.mjs <outDir>`
- `author-templates.mjs` — DESIGN-TIME ONLY regeneration of the .docx templates. Requires `npm i -D docx`
  (docx-js is an authoring tool, NOT a runtime dependency). Not used by the Hub at runtime.

## Font runtime requirement (Tab 17)
Templates use **Lato**. The rendering runtime (LibreOffice on the server, and Google Docs export) MUST have
Lato installed or the PDF silently substitutes a serif (verified failure: LinuxLibertineG). After rendering a
PDF, verify with `pdffonts out.pdf` that only Lato (+ DejaVu for the ▪ glyph) appears — no serif substitution.

## R03 — matches the approved design mock-ups (register Tab 17)
Templates rebuilt to the mock-up design language: text wordmark + breadcrumb + blue rule, blue section
label, large sentence-case title + tagline, 2-col metadata grid, numbered section headings, "please read
first" callout, dark-navy table headers with blue group bands + blue IDs, 3-column intention band (client
brief). Colours sampled from the mock-up .docx: navy #142B39, blue #006C9B, ink #24343D, grey #62737D,
band #E9F0F3, surface #F3F6F6.

Open items (not yet built — need owner input):
- Client-facing docs show a PHOTO PLACEHOLDER. Supply an approved Blue Leaf project photograph to drop in
  (no stock imagery is faked).
- A separate CLIENT SELECTIONS PRESENTATION (editorial, material swatches + room cards) is a planned 4th
  template (mock-up 03); only the dense TECHNICAL register (mock-up 04) is built so far.
