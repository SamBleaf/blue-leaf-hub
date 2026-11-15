# Blue Leaf controlled document suite

**Branch:** `doc-suite-r01`. **Status:** checkpoint 3 (Client Project Brief, template cpb-2.2), a short polish after the second independent review (targeted changes, CPB2-01 to CPB2-09); awaiting the third. Nothing here is approved for client issue until Blue Leaf signs it off.

The pipeline is unchanged and stays the only one: Master Register → structured fixture (`server/lib/registerDocuments.mjs`) → payload (`server/lib/documents/documentPayloads.mjs`) → DOCX template (`public/templates/`, filled by `server/lib/docTemplates.mjs`) → LibreOffice PDF (`server/lib/docxToPdf.mjs`) → controlled issue record (`lead_documents`, migration 213). No second engine, no second store.

---

## 1. Six-document inventory

Approved sources establish **four** Register documents: D-031 (Tab 01) approved three, and Tab 27 B12 added the internal Tender Scope & Pricing Notes. The owner's brief of 15 November 2026 names a six-document family with the Estimator Handover as the sixth. **Documents 04 and 05 cannot be established from approved sources** and are recorded as open below, with the candidates the sources mention. Nothing has been invented to fill them.

| # | Document (code) | Reader | Purpose and stage | Source data | Required sections | Layout | Approval and issue | Status |
|---|---|---|---|---|---|---|---|---|
| 01 | **Client Project Brief** (CPB) | Homeowner | Records what we heard and the proposed direction, after the concept presentation (Tab 11:21, Tab 18:101) | Sales facts (client, site, description, client vision); Register scope, boundaries, preferences, facts, risks, decisions; engagement pathway | The project; scope of works and boundaries; design direction and preferences; assumptions and items to confirm; decisions; next steps (PTSA only when it applies) | Client presentation, A4 portrait, 2–5 pages | Issue record only, no signature (D-035). Preview first; pre-issue checks block missing drawing basis, recipient, unevidenced approvals, $ figures, placeholders | **Redesigned (cpb-2.0), checkpoint 1** |
| 02 | **Architect Design Brief** (ADB) | Architect / designer | Actionable instructions and current client decisions, from Consultants (Tab 11:28, Tab 18:102) | Register requirements, preferences, design register, references | Purpose and basis; confirmed requirements; indicative preferences; schedule by element; coordination requests; outstanding decisions; references (Tab 11:30) | Technical, A4 portrait, no marketing | As above | Established; old design. Next after CPB review |
| 03 | **Selections & Finishes Schedule** (SFS) | Client, architect, trades | Selections by room or category, re-issued as they develop (Tab 11:35, Tab 18:103) | Register client selections | Item ID · category/room · product · finish/size · qty (if verified) · status · responsibility (Tab 11:37). No prices | Two layouts of one document: technical register (A4 landscape) and client presentation | As above | Established; old design. Headings don't repeat on page 2 (cause found, see §3) |
| 04 | **Tender handover** (code to be set) | To be specified | Owner, 15 Nov 2026: "a tender handover doc which is only worthwhile after concept stage is completed". Reader, contents and its boundary with 06 (the in-house estimator's pricing brief) to be specified at its checkpoint. Working assumption, to confirm: the package that hands the developed scope from the Register into the tendering process (trade packages and RFQ clarifications), built from the same records as 06, never a second scope store | Register, after Concept | To be specified | To be specified | To be specified | **Owner-identified; not yet specified** |
| 05 | **Not established** | — | Candidates: A, consultant / supplier coordination request pack, a filtered version of the Architect Brief (Tab 15:44, Tab 22 D5 "NOT new module in V1"; today draft-only packs); B, consultant action / issue register (Tab 11 T5, folded into the ADB); C, pricing and allowances schedule (Tab 05 D, Tab 11 T4, superseded: prices belong to Buildxact); E, the client selections presentation as its own document (contradicts Tab 18:103, one output family) | — | — | — | — | **Owner decision** |
| 06 | **Tender Scope & Pricing Notes** (TSN), the in-house estimator's brief | Internal: Blue Leaf estimator | Translates the Register into a complete pricing-preparation brief for Buildxact (Tab 27 B12, :306) | Register work, boundaries, systems, facts, risks, assumptions, references | Drawing basis; work packages; inclusions, exclusions, by others; existing conditions and demolition; materials and systems; Blue Leaf assumed baseline (labelled); investigations, decisions, RFQ clarifications; item IDs. No quantities, no amounts | Internal, structured, A4 | Internal only: never on the portal or in a supplier pack (Tab 27:307) | Established as TSN; rename and redesign after CPB review |

**Owned elsewhere, not rebuilt:** PTSA / pre-construction services agreement (fee proposal stage, `salesRoutes` PTSA generator), fee proposal (Module 5), concept agreement (lead accept flow), fixed-price construction proposal (future, Module 5), building contract (external, stored as evidence). The contract baseline (B01) is a JSON snapshot, not a rendered document.

## 2. Document identification

```
BLB-[TYPE]-[PROJECT REF]-[REVISION]        e.g. BLB-CPB-0417-R01
```

Six things are kept apart (`server/lib/documents/documentIdentity.mjs`):

| What | Format | Where it comes from | Example |
|---|---|---|---|
| Document type | 3-letter code | `DOC_CODES` | CPB, ADB, SFS (both layouts), TSN; the tender handover's code is set when it is specified |
| Project reference | The project's own number | `fixture.meta.ref`. **No project number exists in the Hub yet**; live documents use the lead reference they always had (`BL` + 6 characters) until one is allocated. Never derived from an address | 0417 (fixture), BL3F9A2C (live today) |
| Draft or issued | Words, never a revision | Draft: "Draft — not issued", no revision shown. Issued: revision and date | Draft — not issued / R01 · Issued 15 November 2026 |
| Issue revision | R + two digits | The registry's integer `version` for the document type. **New issues only**: rows already issued keep their stored `P01`, `P02`, filename and storage path | R01, R02 |
| Drawing / source revision | As recorded | Register `planRev`, received documents' own revision | Concept Set C-02, 28 October 2026 |
| Register item reference | Question + 3 characters | `refCode` (never XXX or TBD) | K005-3F9 |

New issues: `revision_label` = `R0n`; filename `… — R0n.pdf`; storage path `…/{date}-{type}-R0n-{rand}.pdf`. The `version` sequence continues per type, so a type at P02 issues R03 next (no schema change, version index and RPC guard untouched).

**Decided 15 Nov 2026 (owner):** the estimator is in-house, so the name isn't important: the existing name and code stay (Tender Scope & Pricing Notes, TSN), which also avoids a third "handover". **Still open:** the project number, which the owner wants linked to Buildxact. Mapped in `PROJECT_NUMBER_DECISION.md`: the Hub needs the number at Concept, Buildxact's first number (the quote) appears at Tender, so the recommendation is a Hub project number with the Buildxact quote and job numbers linked to it, awaiting the owner's answers. R continuing the sequence (recommended) or restarting at R01 (needs a new column).

## 3. Design standard

Authored with `scripts/documents/design-system.mjs`; one module, every template.

**Page.** A4 portrait, margins 26 mm top (the header sits inside it), 21 mm bottom, 19 mm sides; header and footer 10 mm from the edge. Content width 172 mm.

**Type.** Lato only (Regular, Bold, Italic). Nothing below 8 pt.

| Role | Size | Style |
|---|---|---|
| Title | 26 pt | Bold, charcoal |
| Subtitle | 11 pt | Grey |
| Section kicker ("01 / THE PROJECT") | 8 pt | Bold caps, blue, letter-spaced, blue rule under |
| Heading 1 (section title) | 16 pt | Bold, Word style Heading 1 |
| Heading 2 | 11 pt | Bold, Word style Heading 2 |
| Body | 10 pt | 1.1 line spacing |
| Table text | 9.5 pt; table heads 8 pt bold caps blue | |
| Labels, header, footer | 8 pt | Grey or blue caps |

**Colour.** Blue `#006C9B` (logo leaf and frame), charcoal `#23313A`, grey `#61717A`, panel `#F1F5F6`, status tint `#E6F0F5`, rules `#D3DCE0`. No saturated fills, no full-width colour bands. Status is always written in words.

**Logo.** The original primary logo (`public/brand/logo-black.png`, 3320 × 1512, vector `logo-black.svg`), never redrawn or cropped, 30 mm wide, in the header of every page.

**Header and footer.** Real Word header and footer parts. Header: logo left; document type (caps) and project address right; hairline under. Footer: identity and status left, "Page X of Y" right (separate field runs, see `fix-footer-page-fields.mjs`); hairline over.

**Components.** Metadata grid on a panel; status callout (tint, blue edge); numbered section heads; priority cards on a three-column grid; labelled lists with quiet references; data tables (blue-ruled header row that repeats, hairline rows that never split); step table.

**Rules that make it render reliably.**
- No two tables touch. LibreOffice merges adjacent tables on import, after which the header row is no longer the first row and stops repeating. This is why the existing Selections Schedule loses its headings on page 2.
- A header row is the first row of its table, marked `tblHeader`.
- Tables are bounded, not kept whole: up to three rows stay together; a longer table keeps its header with the first two rows and its last two rows together, and may break between any others (header repeated). Never a single row alone on a page.
- A closing block that must never stand alone (the PTSA note, "About this document") is the last rows of the final table, because LibreOffice keeps table rows together but not a table with the paragraph after it.
- Register references are kept in the record, not printed in client sentences; the decisions table keeps them as a column.
- Headings and the paragraph introducing a table keep with what follows. No forced page breaks.
- Optional sections are wrapped in a condition and disappear when empty; section numbers count only what prints.
- A reference binds to the last word with non-breaking spaces and a non-breaking hyphen, so it never splits or sits alone.

**By reader.** Client documents: presentation, explanation, generous spacing, statuses in plain words, references kept quiet. Architect and consultant documents: drawing references, decisions, owners and revisions up front, denser tables. Internal estimator documents: completeness and navigation by system and trade, stable references, gaps and assumptions labelled. Same tokens; different page structures.

## 4. Document 01: Client Project Brief (template cpb-2.2)

Reader: the homeowner, usually after the concept presentation. Template `public/templates/blb-client-brief-template.docx` (authored by `scripts/documents/author-cpb.mjs`); payload `buildClientBriefPayload`; fixture `clientBriefFixture`.

| Section | Shown when | Content and rules |
|---|---|---|
| Title block, metadata, status callout | Always | Prepared for, site, project type and delivery, drawing basis, document number, status, prepared by, issued to (or date for a draft). The required wording, "not a construction specification, a fixed-price quotation or a contract", is on page 1 (Tab 11:25) |
| 01 The project | Any of: Sales description, priorities, client vision | Sales words verbatim; nothing generated in their place. Priorities: the P-005 options chosen (up to three), plus the client's own note. The design-direction paragraph is the client vision recorded in Sales |
| 02 Scope of works | Any work or boundary | Included work only: a fact, risk, requirement or check is never work. Every list in the section is a titled table: "What we propose to build" under its Heading 2, each boundary list under its label and note. The title is a repeating header row and each item a Word list paragraph in its own row, so a list that runs onto the next page opens it with its title again; a list keeps its first two and last two items together (CPB2-01, review CPB3-L1). **Room grouping (CPB2-02):** a record is grouped only when it answers a whole-room scope prompt (R-002, R-003, K-001, B-001, L-001, V-001, D-001; an element prompt keeps its own line) and, apart from its room's name and words that add nothing ("as shown on the concept plans"), its typed words and its card answer together say at most one kind of work, and that kind agrees with its disposition: "new" on a New record; "renovate", "refurbish" or "alter" on an Alter record (no work word: New, or "Alterations to"). Anything else keeps its own typed line: a renovation recorded as New, a qualifier ("alternative", "plan A"), a question mark, a hyphenated word, a room whose name starts with a work word ("New kitchen", "Existing kitchen"). Each kind is its own group, so Renovated, Refurbished and Alterations to are never merged under one word. Groups follow the room list; a group of four or more rooms takes a short label ("New living areas: kitchen, scullery, living room, dining room and family room"), a smaller one is just its rooms ("New bathroom, ensuite and laundry"). Three or more numbered rooms in a run read "bedrooms 2 to 4"; with the Hub's own naming ("Bedroom", "Bedroom 2", "Bedroom 3") the unnumbered room counts as 1, "bedrooms 1 to 3". A room name starting with an ordinary room word is lowercased mid-sentence ("Guest WC" → "guest WC"); any other (a person's name, "Mia's bedroom") prints as typed; a name that is only an adjective reads as a room ("Living" → "living room"). Every record stays in the register; the grouped line keeps all their references. The drawings are named once, in the scope introduction, which also says what happens next by pathway (design and build: refined as the design develops; build only: confirmed before pricing; plans supplied: confirmed against the plans and consultant documents; architect tender: against the architect's documents). Boundaries: existing to remain, not in the current scope, by others, items you plan to supply, still to be decided, still to be checked (with who confirms) |
| 03 Design direction | Any recorded preference or requirement | Grouped for a reader (exterior; windows and doors; interior finishes; joinery and kitchen; bathrooms and laundry; outdoor; requirements and goals) under a band; the room is named once per run. Each group is its own table whose band is a repeating header row, so a group that runs onto the next page opens it with its band again (CPB2-06); the column header prints once, above the first group. Each group is bounded (the band travels with its first two rows, the last two rows stay together), so neither end of a group is a single row on a page. The status key is the last row of the last group, so it travels with its last two rows (review CPB3-L4). Status in words: Preferred, Proposed, Client-approved (only with evidence), Requirement, For consultant review. A room item is grouped by its room |
| 04 Assumptions | Always | Site and household facts, plus three working assumptions naming the drawing basis, each list a titled table like section 02. Site access is plain sentences that keep each recorded qualifier ("Site access is steep, with narrow or restricted areas."; an "or" is never upgraded to an "and"), and a constraint is said as something to plan for, never as a feature of the site ("Crane or plant access will need to be planned for.") (CPB2-05, review CPB3-H03). A fact the client is unsure about, or still to resolve, reads "still to be confirmed (noted so far: …)" (review CPB3-C03). Other facts read "Question: answer." The consultant line names structural, energy, drainage and approval requirements only on a new home, a knockdown rebuild or an extension, or where a site or structural check is recorded; otherwise "Any required technical checks and approvals will be confirmed before construction." (CPB2-07). "Dimensions and details are still to be developed" on design and build, "confirmed" on every other pathway. The drawing basis is the recorded drawing set, printed as recorded, never inferred from the stage (CPB2-04) |
| 05 Decisions | At least one | 3–7 rows. A row needs a real action: an action record or an open next action. A recorded preference is never a decision. Architect, consultant and trade tasks aren't listed as the client's. No owner is invented ("To be agreed") |
| 06 Next steps | Always | By the brief's pathway: design and build before the PTSA (steps plus one concise PTSA clarification), PTSA in place, **build only** (a build-only delivery model with no plans: "This project is proceeding on a build-only pathway. We'll confirm the work, measurements and any drawings or approvals needed before finalising the price."; confirm the scope, pricing, contract, construction; no concept, no PTSA; never a claim that design work isn't needed, CPB2-03), plans supplied ("this project is proceeding on a plans-supplied pathway"; no PTSA, no concept), architect tender (no PTSA), won (no steps). On a small job (no disciplines named in section 04), the steps name none either (review CPB3-C08) |
| About this document | Always | Issue-record note, no signature; a draft says it isn't issued |

Never in a CPB: prices, allowances, estimate or margin wording, pricing tiers, staff notes, review suggestions, unverified product codes, invented approvals or owners, or a prohibited product.

**Pre-issue checks added at checkpoint 2** (refined after the code review):

- **Prohibited products** (`src/lib/restrictedProducts.js`). Engineered stone has been prohibited in Australia since 1 July 2024. The check is deliberately conservative. Two independent red-team rounds showed that reading negation in free text lets real choices through ("Not laminate, engineered stone", "Final pick was engineered stone", "Engineered stone, changed to Calacatta").
  - **Blocks a client-facing document:** a live selection (not Retain, Remove, Excluded, N/A or By others) whose printed fields name engineered stone, or whose card option is engineered stone. The printed fields are description, product, manufacturer, model, colour, supplier, source and chosen option labels. Negation doesn't count. A selection names only what will be supplied ("Porcelain benchtop, 20 mm"), so "Porcelain instead of engineered stone" on a selection is reworded. Existing or removed stone goes on a record marked Retain or Remove. The register's history keeps the original wording.
  - **What counts:** "engineered stone" also matches shorthand and misspellings (eng. stone, E-stone, engineerd), agglomerate stone, and engineered or reconstituted quartz. "Quartz" alone is ambiguous, so it counts only as a bench material: next to a bench word ("quartz island bench"), or alone on a bench record (benchtop, splashback, vanity top, laundry bench) when the same field names no compliant material. It never counts in the colour field, as a look, finish or sink, or in a brand name (Quantum Quartz).
  - **Warns only:**
    - the same words in a requirement ("no engineered stone")
    - the client's own note
    - existing or removed stone
    - the estimator's notes
    - a mention in the document's own text
    - brands that also sell compliant ranges (Caesarstone, Silestone, Essastone and others)

    Warnings name the record and its room.

  Cement-based "reconstituted" or "manufactured" stone, natural and sintered stone, porcelain, quartzite and engineered timber aren't flagged, nor are bluestone and limestone. The client's choice is never rewritten. The pricing guide's kitchen tiers no longer name engineered stone (`blue-leaf-baseline-v1.2`). The question bank (`registerQuestions.js`, generated) still offers the K-005 option; the check stops it reaching a client document, and removing it is a question-library change for Blue Leaf.
- **Fonts** (`fontVerdict`, read from the fonts embedded in the rendered PDF):
  - No Lato at all means the server lacks the font, and the preview and the issue are refused.
  - Lato plus a fallback font means some characters (a symbol, another script) printed in another font, and staff get a warning naming it.
  - `DOCUMENT_FONT_CHECK=warn` turns the refusal into a warning while Lato is being installed.
  - Before rendering, characters Lato can't print are named as a warning. The ranges were checked against Lato's own character set: other scripts (Hebrew to Tibetan, Hangul, CJK), technical symbols, dingbats, misc symbols and arrows, and emoji. Arrows, ™, ≤, bullets, curly quotes, dashes, °, m², ×, ½ and accented names print and don't warn.

## 5. Checkpoint log

| Checkpoint | Document | Template | Evidence | Review |
|---|---|---|---|---|
| 1 · 15 Nov 2026 | Client Project Brief | cpb-2.0 | 3 fictional projects × 5 renders through the real pipeline (`scripts/documents/render-register-specimens.mjs`); `documents-cpb` 50 checks | Reviewed: **changes required** (CPB-01 to CPB-15) |
| 2 · 15 Nov 2026 | Client Project Brief | cpb-2.1 | Same projects with stable item ids and compliant materials; two independent code reviews of the checkpoint. The first raised 12 findings, all fixed (stone check tiered by supply, negation and brands; font check split into error and warning; preference bands glued to their first rows; facts keep element and zone; won keeps its stage label; JSON fixtures carry locations). In the second, each finding was re-checked by a skeptic and 7 more were confirmed, all fixed (group endings glued; symbol ranges matched to Lato; a vacuous test made real; a shared "Yes ·" answer said once; negation fixes). A red-team round on the stone check then found 20 more wording cases in both directions. The check was made conservative: on a selection any wording that names engineered stone blocks; shorthand, misspellings and quartz as a bench material are caught; colour, look, sink, brand and the client's note don't block. `documents-cpb` 98 checks, with negative controls for the pagination rules; `sandbox-cpb-issue` (a real issue R01 → R02 on the isolated sandbox) 16 checks | Reviewed: **targeted changes recommended** (CPB2-01 to CPB2-09); no redesign |
| 3 · 15 Nov 2026 | Client Project Brief | cpb-2.2 | Short polish. Scope title repeats on the next page (CPB2-01); room-by-room scope said once per group of rooms (CPB2-02); build-only wording (CPB2-03); R02 specimen issued against a recorded supplied plan set, its decisions and wording brought up to date, and the sandbox R01 → R02 changes the drawing basis (CPB2-04); site access as sentences (CPB2-05); each preference group repeats its band on the next page (CPB2-06); consultant line by evidence (CPB2-07). Decision references (CPB2-09) unchanged pending Blue Leaf's choice. An independent review of the checkpoint (three reviewers, each checked by a skeptic) confirmed 10 of 23 findings, all fixed: grouping kept the disposition's verb over the typed word (a renovation printed as "New"; "Alter" as "Renovated"), filler matching was too loose, names were lowercased; site access read a constraint as a feature, and an unsure answer as settled; the boundary and assumption lists could still continue with no heading; the R02 still spoke of concept drawings; a sandbox check couldn't fail on the old template. Also taken: the status key moved under the last group (restores Kestrel p2), real Word bullets in every list, small-job next steps, stronger tests. A second round re-tested every fix (all held) and confirmed 4 more, all fixed: a card's own word ("Refurbished") ignored when filler was typed; "New New kitchen" for a room named with a work word; an unsure fact's raw branch labels; "bedroom, bedrooms 2 to 4" with the Hub's room naming. Grouping is now limited to whole-room scope prompts, and list spacing matches the paragraph lists it replaced. `documents-cpb` 120 checks, the page-opening checks verified to fail on earlier PDFs; `sandbox-cpb-issue` 18 checks | Sent for the third review. **Not approved** |

### Known limitations

- **Railway has no Lato: release gate.**
  - `nixpacks.toml` installs LibreOffice (from Nix) without the font, and the repo bundles none.
  - Once this branch is merged, every register document preview and issue on Railway is **refused** until Lato is installed, or `DOCUMENT_FONT_CHECK=warn` is set, which lets substituted PDFs through with a warning.
  - Options:
    - (a) Bundle the OFL-licensed Lato TTFs in the repo and point LibreOffice's fontconfig at them.
    - (b) Add Lato to the Nix or apt packages.
  - Either one needs a staging deploy and one preview to confirm the font check passes. This Mac has Lato installed and doesn't use fontconfig, so it can't prove either.
  - Not changed: it alters the production build.
- **Continued groups name the category, not the room.** A preference group continued on a new page repeats its band; if the break falls inside one room's run, the first continued row's Where cell is blank (the room is named once per run, and LibreOffice can't tell a template where a page breaks).
- **Page balance.** Bounded tables and keep-together rules move a block whole rather than split it badly, so a page can end short before a section and closing pages aren't padded. Text isn't shrunk to force a page count.
- **Decision references** (P009-UAZ) are stable and traceable but mean nothing to a homeowner. Blue Leaf's choice (CPB2-09): keep them, or print "Decision 01" with the code kept internally.
- **Build only and the pipeline.** The brief now reads a build-only client's path correctly, but which Sales stages apply to build-only leads is still owner decision #1 in the R05 release package.
- **No project number.** Live documents print `BLB-CPB-BL3F9A2C-R01` until one is allocated (§2).
- **Priorities are labels only.** The specimen's "Connect / Simplify / Perform" themes and their sentences have no Register source; adding them is a question-library change.
- **Design direction** is the client vision captured in Sales. There is no separate narrative field.
- **Other documents** (ADB, SFS, TSN) keep their old design; only their printed identity changed to the new convention.
- **Text-only engine.** No data-driven images or photographs.
- **Draft PDFs** carry no watermark; drafts are marked in the kicker, the status panel, the metadata and the footer.

## 6. Commands

```bash
node scripts/documents/author-cpb.mjs                                  # re-author the CPB template (needs: npm i --no-save docx@9)
node scripts/documents/render-register-specimens.mjs /tmp/specimens    # render the fictional projects (needs LibreOffice, poppler)
node scripts/tests/documents-cpb.test.mjs                              # CPB rules, structure and a real render
node scripts/tests/documents-r01.test.mjs                              # all five templates
```
