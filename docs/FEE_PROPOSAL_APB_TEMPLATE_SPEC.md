# APB-Balanced Fee-Proposal DOCX Template — Merge-Field Spec

How to build the **APB version** Word template. Upload it in the wizard (Step 3 → "APB version
template") — it stores separately as `fee-proposal-template-apb.docx`; the original template is
untouched. The "Open APB version" / "Download APB version" buttons render *this* template via
`proposalToApbDocxData` (server/lib/feeProposalTransform.mjs).

## Syntax
- **docxtemplater**, single-brace `{FIELD}` (you can author `{{FIELD}}` — the server normalises it).
- Loops: `{#ARRAY} … {/ARRAY}`. Inside a loop, reference the row's keys directly.
- Multi-line fields (the body paragraphs) contain `\n` — line breaks render automatically
  (`linebreaks: true`). The `•` bullets in `WHY_BUILD_WITH_US` render as text.
- A missing field renders blank (won't error).
- **Generation is BLOCKED** if any `[ADD …]` / `[INSERT …]` token remains (currently `[ADD WEEKS]`
  in the schedule + the testimonial placeholder) — fill them or the APB doc won't generate.

## Single-value fields
| Field | Holds |
|---|---|
| `{NICHE_STATEMENT}` | Cover headline — "Adelaide's boutique builder — custom new builds & bespoke renovations" |
| `{QUOTE_NUMBER}` | "Quote 1196" (mirrors Buildxact) |
| `{PROJECT_ADDRESS}` | Job address |
| `{DATE}` | Proposal date |
| `{CLIENT_SALUTATION}` | "Dear …" name |
| `{OPENING_PARAGRAPH}` | Intro letter body (editable in wizard Cover tab) |
| `{TOTAL_INC_GST}` / `{TOTAL_COST_GST}` | Total inc GST (formatted) |
| `{WHY_BUILD_WITH_US}` | Why-build section (3 USPs, multi-line) |
| `{ONLINE_PM_BODY}` | Online project-management / staying-involved section |
| `{CONSTRUCTION_SCHEDULE_INTRO}` | Schedule narrative — auto-fills the week count from the SCHED items |
| `{TOTAL_WEEKS}` | Total relative weeks (e.g. 24), derived from the estimate's SCHED durations |
| `{VARIATIONS_CLAUSE}` | "Variations … cost + 25% margin." |
| `{APB_SUMMARY_BODY}` | Warm closing letter |
| `{NEXT_STEPS}` | The Next Step CTA |
| `{ARCH_REF}` `{ENG_REF}` `{SPEC_REF}` | Document references |
| `{SIGNATORIES}` | "Joshua Manning and Sam Morris" |

## Loops
```
Quote Summary:      {#SUMMARY_ROWS}{CATEGORY_NAME}  {CATEGORY_COST_GST}{/SUMMARY_ROWS}
Inclusions:         {#INCLUSION_SECTIONS}{SECTION_HEADING}
                      {#SECTION_ITEMS}• {ITEM_TEXT}{/SECTION_ITEMS}{/INCLUSION_SECTIONS}
Prime Cost & PS:    {#PC_SUMS}{PC_DESCRIPTION} — {PC_AMOUNT}{/PC_SUMS}      ("PC sum of $X")
Optional Upgrades:  {#OPTIONAL_ITEMS}{OPTION_DESCRIPTION}  {OPTION_PRICE}{/OPTIONAL_ITEMS}
Exclusions:         {#EXCLUSIONS}{EXCLUSION_TEXT}{/EXCLUSIONS}
Fee Schedule:       {#FEE_SCHEDULE}{STAGE_CLAIM}  {MILESTONE}  {PERCENTAGE}{/FEE_SCHEDULE}
Guarantees:         {#GUARANTEES}{GUARANTEE_HEADING}: {GUARANTEE_TEXT}{/GUARANTEES}
Testimonials:       {#TESTIMONIALS}"{TESTIMONIAL_TEXT}" — {TESTIMONIAL_AUTHOR}{/TESTIMONIALS}
Licences:           {#LICENCES}{LICENCE_TEXT}{/LICENCES}
Responsibilities:   {#RESPONSIBILITIES_OURS}{RESP_TEXT}{/RESPONSIBILITIES_OURS}
                    {#RESPONSIBILITIES_YOURS}{RESP_TEXT}{/RESPONSIBILITIES_YOURS}
Construction
  Schedule (relative): {#CONSTRUCTION_SCHEDULE}{PHASE_LABEL}  {PHASE_WEEKS}
                         {#TASKS}{TASK_NAME} — {TASK_WEEKS} (starts week {START_WEEK}){/TASKS}{/CONSTRUCTION_SCHEDULE}
```

The construction schedule is **auto-derived** from the estimate's `[task] SCHED` line items —
sequenced finish-to-start through the canonical phases (Site prep → Foundations → Frame → Lock-up →
Fit-out → External), no commencement date. `{TOTAL_WEEKS}` and the `{CONSTRUCTION_SCHEDULE_INTRO}`
week count fill automatically; if the estimate has no SCHED items, `[ADD WEEKS]` remains and blocks
generation.

## Recommended 13-section order (APB)
1. **Cover** — `{NICHE_STATEMENT}`, `{QUOTE_NUMBER}`, `{PROJECT_ADDRESS}`, `{DATE}`
2. **Introduction** — `{CLIENT_SALUTATION}`, `{OPENING_PARAGRAPH}`, 30-day validity line, signed by director
3. **Fixed Price & Scope** — `{TOTAL_INC_GST}` (price early, page 2–3), `{VARIATIONS_CLAUSE}`
4. **Why Build With Us** — `{WHY_BUILD_WITH_US}`
5. **Our Guarantees** — `{#GUARANTEES}`
6. **Online Project Management** — `{ONLINE_PM_BODY}`
7. **Inclusions** — `{#INCLUSION_SECTIONS}` (Builders Warranty pinned first)
8. **Prime Cost & Provisional Sums** — `{#PC_SUMS}`
9. **Optional Upgrades** — `{#OPTIONAL_ITEMS}`
10. **Construction Schedule** — `{CONSTRUCTION_SCHEDULE_INTRO}`
11. **Testimonials** — `{#TESTIMONIALS}`
12. **Licences & Associations** — `{#LICENCES}`
13. **Responsibilities / Exclusions / Quote Summary / Fee Schedule / Next Step / Summary** —
    `{#RESPONSIBILITIES_OURS}` `{#RESPONSIBILITIES_YOURS}` `{#EXCLUSIONS}` `{#SUMMARY_ROWS}`
    `{#FEE_SCHEDULE}` `{NEXT_STEPS}` `{APB_SUMMARY_BODY}`

## Design language (from the company profile — match it)
- Dusty-blue accent banners (~#B9CEDB) behind section intros; charcoal letter-spaced **serif**
  headings with a thin underline rule; sans-serif body; generous whitespace; centred section heads.
- Warm-timber lifestyle imagery on the cover + section dividers (APB QC wants 20+ pages w/ imagery).
- Footer on every page: boxed Blue Leaf logo · `www.blueleafbuilding.com.au` · `| 0X` page number.

## Remaining fill mechanism
- **Construction weeks** — now AUTO-DERIVED from the estimate's SCHED items (`buildRelativeSchedule`);
  `[ADD WEEKS]` only remains (and blocks) if an estimate has no SCHED items.
- **Testimonials** are constant across proposals → bake 3–5 named ones into `APB_CONTENT.TESTIMONIALS`
  (server). Send them through and they're a one-line change — then the APB version generates clean.
