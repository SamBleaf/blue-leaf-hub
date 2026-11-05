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
