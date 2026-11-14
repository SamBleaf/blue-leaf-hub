# Blue Leaf controlled document suite

**Branch:** `doc-suite-r01`. **Status:** checkpoint 1 (Client Project Brief) built and rendered, awaiting independent design review. Nothing here is approved for client issue until Blue Leaf signs it off.

The pipeline is unchanged and stays the only one: Master Register → structured fixture (`server/lib/registerDocuments.mjs`) → payload (`server/lib/documents/documentPayloads.mjs`) → DOCX template (`public/templates/`, filled by `server/lib/docTemplates.mjs`) → LibreOffice PDF (`server/lib/docxToPdf.mjs`) → controlled issue record (`lead_documents`, migration 213). No second engine, no second store.

---

## 1. Six-document inventory

Approved sources establish **four** Register documents: D-031 (Tab 01) approved three, and Tab 27 B12 added the internal Tender Scope & Pricing Notes. The owner's brief of 15 November 2026 names a six-document family with the Estimator Handover as the sixth. **Documents 04 and 05 cannot be established from approved sources** and are recorded as open below, with the candidates the sources mention. Nothing has been invented to fill them.

| # | Document (code) | Reader | Purpose and stage | Source data | Required sections | Layout | Approval and issue | Status |
|---|---|---|---|---|---|---|---|---|
| 01 | **Client Project Brief** (CPB) | Homeowner | Records what we heard and the proposed direction, after the concept presentation (Tab 11:21, Tab 18:101) | Sales facts (client, site, description, client vision); Register scope, boundaries, preferences, facts, risks, decisions; engagement pathway | The project; scope of works and boundaries; design direction and preferences; assumptions and items to confirm; decisions; next steps (PTSA only when it applies) | Client presentation, A4 portrait, 2–5 pages | Issue record only, no signature (D-035). Preview first; pre-issue checks block missing drawing basis, recipient, unevidenced approvals, $ figures, placeholders | **Redesigned (cpb-2.0), checkpoint 1** |
| 02 | **Architect Design Brief** (ADB) | Architect / designer | Actionable instructions and current client decisions, from Consultants (Tab 11:28, Tab 18:102) | Register requirements, preferences, design register, references | Purpose and basis; confirmed requirements; indicative preferences; schedule by element; coordination requests; outstanding decisions; references (Tab 11:30) | Technical, A4 portrait, no marketing | As above | Established; old design. Next after CPB review |
| 03 | **Selections & Finishes Schedule** (SFS) | Client, architect, trades | Selections by room or category, re-issued as they develop (Tab 11:35, Tab 18:103) | Register client selections | Item ID · category/room · product · finish/size · qty (if verified) · status · responsibility (Tab 11:37). No prices | Two layouts of one document: technical register (A4 landscape) and client presentation | As above | Established; old design. Headings don't repeat on page 2 (cause found, see §3) |
| 04 | **Not established** | — | Candidate A: Consultant / supplier coordination request pack, a filtered version of the Architect Brief (Tab 15:44, Tab 22 D5 "NOT new module in V1"). Today: draft-only packs, no issue path | — | — | — | — | **Owner decision** |
| 05 | **Not established** | — | Candidates: B, consultant action / issue register (Tab 11 T5, folded into the ADB); C, pricing and allowances schedule (Tab 05 D, Tab 11 T4, superseded: prices belong to Buildxact); E, the client selections presentation as its own document (contradicts Tab 18:103, one output family) | — | — | — | — | **Owner decision** |
| 06 | **Estimator Handover** (EHO; today "Tender Scope & Pricing Notes", TSN) | Internal: Blue Leaf estimator | Translates the Register into a complete pricing-preparation brief for Buildxact (Tab 27 B12, :306) | Register work, boundaries, systems, facts, risks, assumptions, references | Drawing basis; work packages; inclusions, exclusions, by others; existing conditions and demolition; materials and systems; Blue Leaf assumed baseline (labelled); investigations, decisions, RFQ clarifications; item IDs. No quantities, no amounts | Internal, structured, A4 | Internal only: never on the portal or in a supplier pack (Tab 27:307) | Established as TSN; rename and redesign after CPB review |

**Owned elsewhere, not rebuilt:** PTSA / pre-construction services agreement (fee proposal stage, `salesRoutes` PTSA generator), fee proposal (Module 5), concept agreement (lead accept flow), fixed-price construction proposal (future, Module 5), building contract (external, stored as evidence). The contract baseline (B01) is a JSON snapshot, not a rendered document.

## 2. Document identification

```
BLB-[TYPE]-[PROJECT REF]-[REVISION]        e.g. BLB-CPB-0417-R01
```

Six things are kept apart (`server/lib/documents/documentIdentity.mjs`):

| What | Format | Where it comes from | Example |
|---|---|---|---|
| Document type | 3-letter code | `DOC_CODES` | CPB, ADB, SFS (both layouts), TSN (EHO pending) |
| Project reference | The project's own number | `fixture.meta.ref`. **No project number exists in the Hub yet**; live documents use the lead reference they always had (`BL` + 6 characters) until one is allocated. Never derived from an address | 0417 (fixture), BL3F9A2C (live today) |
| Draft or issued | Words, never a revision | Draft: "Draft — not issued", no revision shown. Issued: revision and date | Draft — not issued / R01 · Issued 15 November 2026 |
| Issue revision | R + two digits | The registry's integer `version` for the document type. **New issues only**: rows already issued keep their stored `P01`, `P02`, filename and storage path | R01, R02 |
| Drawing / source revision | As recorded | Register `planRev`, received documents' own revision | Concept Set C-02, 28 October 2026 |
| Register item reference | Question + 3 characters | `refCode` (never XXX or TBD) | K005-3F9 |

New issues: `revision_label` = `R0n`; filename `… — R0n.pdf`; storage path `…/{date}-{type}-R0n-{rand}.pdf`. The `version` sequence continues per type, so a type at P02 issues R03 next (no schema change, version index and RPC guard untouched).

**Decisions needed:** the project number (format, starting value, when it is allocated: at lead creation, first issue or PTSA; it must be registered as a fact and stamped lead → job); whether the estimator document is renamed EHO ("handover" already means the Sales → Operations handover); R continuing the sequence (recommended) or restarting at R01 (needs a new column).

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
- Short tables (decisions, steps) are kept whole: the whole table moves rather than leaving one row behind.
- Headings and the paragraph introducing a table keep with what follows. No forced page breaks.
- Optional sections are wrapped in a condition and disappear when empty; section numbers count only what prints.
- A reference binds to the last word with non-breaking spaces and a non-breaking hyphen, so it never splits or sits alone.

**By reader.** Client documents: presentation, explanation, generous spacing, statuses in plain words, references kept quiet. Architect and consultant documents: drawing references, decisions, owners and revisions up front, denser tables. Internal estimator documents: completeness and navigation by system and trade, stable references, gaps and assumptions labelled. Same tokens; different page structures.

## 4. Document 01: Client Project Brief (template cpb-2.0)

Reader: the homeowner, usually after the concept presentation. Template `public/templates/blb-client-brief-template.docx` (authored by `scripts/documents/author-cpb.mjs`); payload `buildClientBriefPayload`; fixture `clientBriefFixture`.

| Section | Shown when | Content and rules |
|---|---|---|
| Title block, metadata, status callout | Always | Prepared for, site, project type and delivery, drawing basis, document number, status, prepared by, issued to (or date for a draft). The required wording, "not a construction specification, a fixed-price quotation or a contract", is on page 1 (Tab 11:25) |
| 01 The project | Any of: Sales description, priorities, client vision | Sales words verbatim; nothing generated in their place. Priorities: the P-005 options chosen (up to three), plus the client's own note. The design-direction paragraph is the client vision recorded in Sales |
| 02 Scope of works | Any work or boundary | Included work only: a fact, risk, requirement or check is never work. Boundaries in their own lists: existing to remain, not in the current scope, by others, items you plan to supply, still to be decided, to be checked during design (with who confirms) |
| 03 Design direction | Any recorded preference or requirement | One table, grouped for a reader (exterior; windows and doors; interior finishes; joinery and kitchen; bathrooms and laundry; outdoor; requirements and goals). Status in words: Preferred, Proposed, Client-approved (only with evidence), Requirement, For consultant review. A room item is grouped by its room |
| 04 Assumptions | Always | Site and household facts, plus three fixed working assumptions naming the drawing basis |
| 05 Decisions | At least one | 3–7 rows. A row needs a real action: an action record or an open next action. A recorded preference is never a decision. Architect, consultant and trade tasks aren't listed as the client's. No owner is invented ("To be agreed") |
| 06 Next steps | Always | By engagement pathway: design and build before the PTSA (separate-agreement explanation and steps), PTSA in place, plans supplied (no PTSA, no concept), architect tender (no PTSA), won (no steps) |
| About this document | Always | Issue-record note, no signature; a draft says it isn't issued |

Never in a CPB: prices, allowances, estimate or margin wording, pricing tiers, staff notes, review suggestions, unverified product codes, invented approvals or owners.

## 5. Checkpoint log

| Checkpoint | Document | Template | Evidence | Review |
|---|---|---|---|---|
| 1 · 15 Nov 2026 | Client Project Brief | cpb-2.0 | 3 fictional projects × 5 renders through the real pipeline (`scripts/documents/render-register-specimens.mjs`); `documents-cpb` 50 checks | Sent for independent review. **Not approved** |

### Known limitations at checkpoint 1

- **Railway has no Lato.** `nixpacks.toml` installs LibreOffice without the font, so production PDFs would silently substitute. Fix before any production issue (bundle the Lato TTFs and register them with fontconfig, or add the font package), then add a font check that blocks issue on substitution.
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
