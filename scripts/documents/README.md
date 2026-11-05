# Document engine — Client Brief, Architect Brief, Client Selections Presentation, Technical Register

Reuses the existing renderer `server/lib/docTemplates.renderDocxTemplate` (docxtemplater + angular-expressions,
text-only — no image/style module). No second document engine.

- `../../public/templates/blb-*-template.docx` — the four brand templates (placeholders + loops). Filled at runtime.
  The approved logo is embedded in each template at authoring time (static brand identity, not merge data).
- `../../server/lib/documents/documentPayloads.mjs` — typed fixture → payload builders + pre-issue validation.
- `fixtures/*.json` — de-identified fictional test payloads: `short-powderroom` (short), `reno-extension`
  (medium), `long-newbuild` (long) — exercises the short/medium/long pagination paths.
- `render-r01.mjs` — fills templates via the existing renderer. `node scripts/documents/render-r01.mjs <outDir>`
- `../tests/documents-r01.test.mjs` — 13 no-DB acceptance tests. `node scripts/tests/documents-r01.test.mjs`
- `author-templates.mjs` — DESIGN-TIME ONLY regeneration of the .docx templates. Requires `npm i -D docx`
  (docx-js is an authoring tool, NOT a runtime dependency). Not used by the Hub at runtime.

## Font runtime requirement (Tab 17)
Templates use **Lato**. The rendering runtime (LibreOffice on the server, and Google Docs export) MUST have
Lato installed or the PDF silently substitutes a serif (verified failure: LinuxLibertineG). After rendering a
PDF, verify with `pdffonts out.pdf` that only Lato (+ DejaVu for the ▪ glyph) appears — no serif substitution.

## Design language (matches the approved mock-up kit 00–04)
Embedded approved logo + breadcrumb + blue rule, blue section label, large sentence-case title + tagline,
2-col metadata grid, numbered section headings, "please read first" callout, dark-navy table headers with
blue group bands + blue IDs, 3-column intention band (client brief). Colours sampled from the mock-up .docx:
navy #142B39, blue #006C9B, ink #24343D, grey #62737D, band #E9F0F3, surface #F3F6F6.

## R04 — Tab 17 (second-pass) layout & pagination
1. **Architect brief** — short/medium briefs are a deliberate single page; a long brief moves the complete
   Design register to its own page (`ARCH_BREAK`) and fills it with the referenced-documents list (never a
   split table or a sliver). Threshold: actions + requirements + register rows ≥ 13.
2. **Client brief** — no photo placeholder; a composed closing (Blue Leaf process band + working assumptions
   + status callout). A full brief (one carrying `processSteps`) breaks before the questions so page 1 ends
   on the design narrative and page 2 reads as one block; a short brief stays a single page.
3. **Technical Selection Register** — now **A4 landscape** with sized columns and word statuses.
4. **Client Selections Presentation** — editorial client-facing doc (mock-up 03): palette tiles (data-driven,
   optional), per-area selection cards, and a "what still needs a decision" list — built from the SAME
   selections as the technical register. The engine is text-only, so swatches are typographic tiles, not
   data-driven colour blocks (no fabricated colours).
5. **Real logo** embedded in every header.

Test short/medium/long via the three fixtures; `pdffonts out.pdf` must show only Lato (+ DejaVu for ▪).

Open items (need owner input):
- Client-facing docs compose on content, with no photo. An approved Blue Leaf project photograph can be
  dropped in later (no stock imagery is faked); a per-page photo needs the docxtemplater image module.
- Multi-page landscape register: LibreOffice does not repeat the column header on page 2 (Google Docs export
  may differ) — a rendering detail to confirm on the real runtime, not a template defect.
