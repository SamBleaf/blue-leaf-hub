---
sop_version: 2.0
last_reviewed: 2026-06-20
app_version: 1.1 — auto-fill + dual-output
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP 03-01: Create a Fee Proposal

**Module:** Tender Manager → Fee Proposals
**SOP ID:** 03-01
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Admin, Supervisor (tender coordinators)

## 2. When to use it
When a project has a Buildxact estimate ready and you need to produce a client-facing fee proposal. The wizard imports the estimate, auto-fills the scope/price/schedule, lets you review and edit, then generates a branded Blue Leaf proposal — in either the **original** layout or the new **APB-Balanced** layout (both run until the APB one is signed off).

## 3. What this does
Turns a Buildxact estimate into a branded fee proposal, auto-filling as much as possible:
- **Prime Cost & Provisional Sums** from the estimate's **Allowance** flag (PC/PS).
- **Quote Summary** with $0 categories dropped and names normalised.
- **Inclusions** built from the estimate categories (Builders Warranty pinned on top), blended with the job's **RFQ scope** when a job is linked.
- **Floor area** from the `[floor area m2] COST METRIC` line.
- **Quote number** mirrors the Buildxact number.
- **Construction schedule** — a relative week-by-week timeline auto-derived from the estimate's `[task] SCHED` line items (no commencement date needed).
- **APB-Balanced version** adds value sections (why-build, guarantees, online PM, testimonials, licences, responsibilities) from a separate template.

## 4. Before you start
- A Buildxact **Estimate Items** export (`*-estimateitems.XLSX`) for the project — this is the **preferred** export: it carries the PC/PS Allowance flag and exact per-line inc-GST. (A "Categories & Items" report or a PDF also parse, but without PC/PS.) Export **one fresh file per proposal** at final pricing.
- A DOCX template uploaded in the wizard (Step 3): the **original** template ships by default; upload the **APB** template separately to use the APB version.
- For the APB construction schedule, the estimate should contain `[task] SCHED` lines (durations per trade) — these also drive Operations scheduling.
- For Google Docs editing: Google Drive integration configured.

## 5. Step-by-step process

1. Go to **Tender Manager → Fee Proposals** → **New fee proposal**.
2. **Import the estimate:** upload the Buildxact **estimateitems XLSX** (preferred), the report XLSX/PDF, or pull from Buildxact if the job is linked.
3. Wait for the parse — categories, totals, PC/PS, floor area, inclusions and quote number auto-fill.
4. **Link the job** (Cover tab → "Link job") if not auto-matched. The estimateitems export has no address, so linking is what pulls in the client/address **and the RFQ scope** that blends into the inclusions.
5. **Review the tabs:** Cover (address/client/floor area/quote №), Inclusions (warranty pinned + categories), PC sums, Optional, Exclusions, Summary, Fee schedule. Edit anything that needs polish — the auto-fill is a draft.
6. **Save** the draft.
7. **Generate:** in Step 3, click **Download DOCX** / **Open in Google Docs** for the original, or **Download APB version** / **Open APB version** for the APB-Balanced layout.
8. Finalise wording in Google Docs, then send (SOP 03-02).

## 6. What happens next
- The estimate is saved to `buildexact_estimates` (`source_hash` dedupes re-uploads; `cost_metrics` + `schedule_hints` captured).
- The wizard pre-fills from the server-enriched parse: `pc_sums` (Allowance only), `summary_rows` ($0 dropped), `inclusion_sections` (warranty + categories), `cost_metrics.floor_area_m2`, mirrored quote number.
- When a job is linked, `POST /api/fee-proposal/inclusions` blends `rfq_trade_scopes.scope_bullets` per category into the inclusions.
- The APB version derives `{TOTAL_WEEKS}` + a week-by-week `{#CONSTRUCTION_SCHEDULE}` from the SCHED items and auto-fills the schedule narrative.
- No email is sent here — sending is SOP 03-02.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Uploading the "Categories & Items" report instead of Estimate Items | Wrong Buildxact export | Use the **Estimate Items** export — only it carries the PC/PS Allowance flag |
| Stale estimate snapshot | Exported at a different time than final pricing | Export one fresh estimateitems file per proposal at final pricing |
| PC/PS section empty | PC/PS not flagged in Buildxact, or a report-format upload | Flag PC/PS in Buildxact's Allowance column; use the estimateitems export |
| APB version won't generate | An `[ADD …]` placeholder remains (e.g. no testimonials, no SCHED items) | Fill the flagged placeholders — the error lists them |
| Inclusions don't match the job | Job not linked | Link the job so the RFQ scope blends in |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "No template available" | Upload a DOCX template in Step 3 (original) |
| "No APB template uploaded yet" | Upload the APB template in Step 3 → APB version |
| "APB version has unfilled placeholders — fill these first: …" | Fill the listed `[ADD …]` items (testimonials, etc.) and regenerate |
| PC/PS empty | Use the estimateitems export and flag PC/PS in Buildxact |
| Schedule shows `[ADD WEEKS]` | The estimate has no `SCHED` items — add them in Buildxact or fill manually |
| "Could not save the proposal — the quote number may already be in use" | A proposal already uses that Buildxact number; the system falls back to an internal sequence — just retry |

## 9. Related modules
- [Send a fee proposal to a client](tendering_fee_proposal_send.md) — SOP 03-02
- [Use the tender board](tendering_tender_board.md) — SOP 03-03
- APB template merge-field spec: `docs/FEE_PROPOSAL_APB_TEMPLATE_SPEC.md`; starter template: `docs/fee-proposal-apb-template-starter.docx`

## 10. Screenshot placeholders
[insert screenshot: wizard import step]
[insert screenshot: inclusions tab with warranty pinned]
[insert screenshot: Step 3 — original vs APB generate buttons]

## 11. Automation notes
- Parse: `POST /api/fee-proposal/parse-xlsx` `{ dataBase64, filename }` → `{ ok, parsed, job_id, estimate_id }`; `parsed` is enriched with `pc_sums`, `summary_rows`, `inclusion_sections`, `cost_metrics` (fresh + cached paths).
- Inclusions blend: `POST /api/fee-proposal/inclusions` `{ jobId, categories }` → `{ inclusion_sections }` (warranty + import categories + RFQ scope).
- Generate: `POST /api/fee-proposal/generate-docx` / `upload-to-drive` accept `style: 'original' | 'apb'`; APB uses the separately-stored `fee-proposal-template-apb.docx` and `proposalToApbDocxData` (incl. the relative schedule). Generation is blocked if any `[ADD …]` placeholder remains.
- Template upload: `POST /api/settings/fee-proposal-template` `{ dataBase64, style? }`.
- Transform: `server/lib/feeProposalTransform.mjs` — `extractPcSumsFromParse` (Allowance only), `buildSummaryRowsFromParse` ($0 drop), `buildInclusionSectionsFromParse` + `mergeRfqScopeIntoInclusions`, `buildRelativeSchedule`, `proposalToApbDocxData`, `findApbPlaceholders`.
- Parser: `server/lib/buildexactParser.mjs` — `parseXLSX` auto-detects estimateitems vs report; `parseSchedItems`, `parseCostMetrics`.

## 12. Edge cases and limits
- estimateitems export = full features (PC/PS, exact inc-GST, schedule). Report/PDF = no PC/PS (auto-detected, parses the rest).
- Quote number mirrors the Buildxact number; a collision on the UNIQUE column falls back to the internal sequence with a friendly message (no raw DB error).
- A line with $0 ex-markup cost but a positive inc-markup total is kept (supplier-direct lines aren't dropped).
- APB generation hard-blocks on any `[ADD …]`/`[INSERT …]` token (currently named testimonials when none are set, and `[ADD WEEKS]` when the estimate has no SCHED items).
- `applyBlendedInclusions` confirms before overwriting manual inclusion edits on a job re-link.

## 13. Owner of the process
Admin
Next review: 2026-12-20

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A Buildxact **estimateitems** XLSX export available (with PC/PS Allowance flags + `[task] SCHED` lines)
- [ ] Original DOCX template present; APB template uploaded for the APB tests
- [ ] Logged in as Admin

### Test cases

**TC-01 — Parse estimateitems (happy path)**
1. Upload an estimateitems XLSX in the wizard.
2. Expected: parse completes; `parsed.source_format === 'estimateitems'`; categories + totals populate.
3. Expected DB: `buildexact_estimates` row with `source='xlsx'`, `source_hash` set.
- [ ] Pass  [ ] Fail

**TC-02 — Empty upload rejected**
1. Trigger parse with no file.
2. Expected: HTTP 400 `{ ok:false, error:"dataBase64 required." }`; no estimate row.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate file returns cached parse (still enriched)**
1. Upload the same file twice.
2. Expected: second response `cached:true`, still returns `parsed` with `pc_sums`/`summary_rows`/`inclusion_sections`.
- [ ] Pass  [ ] Fail

**TC-04 — PC/PS from Allowance flag only**
1. Parse an estimate with items flagged PC/PS in the Allowance column.
2. Expected: `parsed.pc_sums` contains exactly those flagged items, formatted "PC sum of $X" (inc GST), descriptions cleaned (no markers/typos).
3. Expected: a report-format upload yields empty `pc_sums`.
- [ ] Pass  [ ] Fail

**TC-05 — $0 categories dropped + names normalised**
1. Parse an estimate with one or more $0 categories and a typo'd name (e.g. "Masonary").
2. Expected: `summary_rows` omits the $0 categories and shows "Masonry".
- [ ] Pass  [ ] Fail

**TC-06 — Inclusions: warranty pinned + import-driven + RFQ blend**
1. Parse, then link a job that has an RFQ package.
2. Expected: `inclusion_sections[0]` is "Builders Warranty"; following sections are the import categories with cleaned bullets; RFQ `scope_bullets` blended in (deduped).
3. Expected: bullets contain no `$` amounts and no `COST METRIC`/`SCHED` rows.
- [ ] Pass  [ ] Fail

**TC-07 — Floor area + quote number mirror**
1. Parse an estimate with a `[floor area m2] COST METRIC` and filename `Q1196-…`.
2. Expected: `floor_area_m2` auto-filled; quote number shows "Quote 1196".
- [ ] Pass  [ ] Fail

**TC-08 — Relative construction schedule**
1. Parse an estimate containing `[task] SCHED` lines.
2. Expected (APB data): `TOTAL_WEEKS` > 0; `CONSTRUCTION_SCHEDULE` has phases in order (Site prep → … → External) with per-task `START_WEEK`/`TASK_WEEKS`; the schedule intro has the week count filled (no `[ADD WEEKS]`).
- [ ] Pass  [ ] Fail

**TC-09 — Generate original DOCX without template**
1. No original template present; click Download DOCX.
2. Expected: HTTP 400 "No template available — upload a DOCX template in Settings first."
- [ ] Pass  [ ] Fail

**TC-10 — Generate APB blocked on placeholders**
1. Clear testimonials (so an `[Add …]`-style placeholder remains) and click Download APB version.
2. Expected: HTTP 400 "APB version has unfilled placeholders — fill these first: …".
3. With example/real testimonials set + SCHED items present: APB generates with no unfilled `{tags}`.
- [ ] Pass  [ ] Fail

**TC-11 — Dual-version isolation**
1. Generate the original; then generate the APB.
2. Expected: original uses `fee-proposal-template.docx` + `proposalToDocxData`; APB uses `fee-proposal-template-apb.docx` + `proposalToApbDocxData`. The original output is unchanged by the APB work.
- [ ] Pass  [ ] Fail

**TC-12 — Quote-number collision recovery**
1. Create two new proposals from the same estimate (same Buildxact number).
2. Expected: both save; the second falls back to an internal sequence number; no raw Postgres error surfaces.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] estimateitems parse + enrichment works
- [ ] PC/PS Allowance-only; $0 dropped; names normalised
- [ ] Inclusions warranty-pinned + RFQ-blended; no $/meta leakage
- [ ] Floor area + quote mirror
- [ ] Relative schedule derived; weeks auto-filled
- [ ] Original + APB generate independently; APB placeholder guard works
- [ ] Quote-collision recovers gracefully
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
