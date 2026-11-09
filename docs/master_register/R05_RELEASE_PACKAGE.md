# R05 release package: consolidated Sales Pipeline and Master Register build

**Prepared:** 2026-11-10. **Branch:** `sales-register-r05`, cut from `main` at `759b8e7`. **Status:** built and tested on the isolated local sandbox only. Not pushed, not merged, not deployed. No production migration has been applied by this work.

Each claim below names its evidence level: **SOURCE** (read the code), **AUTOMATED** (a named test passed), **BROWSER** (driven in a real browser against the sandbox), **DB** (confirmed in the sandbox database), **PRODUCTION** (not available to this work: nothing here is production-verified).

## 1. Migrations

Apply in this order, in the Supabase SQL editor, after running `R05_PRODUCTION_PREFLIGHT.sql` and taking a backup. Each file is additive and has its rollback at the top or bottom of the file.

| Order | File | What it does | Depends on | State |
|---|---|---|---|---|
| Before | 212 to 216 | Register foundation | Earlier | Owner-reported applied. Not independently verified. The preflight checks them |
| 1 | `217_sales_direct_write_guard.sql` | Refuses browser-token writes to stage and contract state | 194 | Sandbox only |
| 2 | `218_register_tender_notes.sql` | Lets Tender Notes be issued | 213 | Sandbox only |
| 3 | `219_plans_supplied_pathway.sql` | Plans-supplied fact, and extends the 217 guard | 217 | Sandbox only |

The code is safe to deploy before these. With 218 absent, preview works and issuing Tender Notes returns a plain message naming the migration. With 219 absent, every lead reads as design and build and the plans-supplied button returns a plain message. 217 changes nothing the app relies on. After applying 219, run `NOTIFY pgrst, 'reload schema';`.

## 2. Controlled pilot checklist

1. [ ] Run `R05_PRODUCTION_PREFLIGHT.sql` and confirm 212 to 216 show present.
2. [ ] Back up production. Confirm the backup exists.
3. [ ] Apply 217, 218, 219 in order, then reload the schema.
4. [ ] Merge to `main` and deploy. Leave `REGISTER_ENABLED` unset.
5. [ ] Set `REGISTER_PILOT_LEADS` to the pilot lead id only, and restart the API.
6. [ ] Tell staff about the behaviour changes in section 5.
7. [ ] On the pilot lead, on desktop and on a phone: walk Whole House, Site & Existing and one room, tap Confirm room defaults, and reload to confirm it resumes.
8. [ ] Preview all four documents. Check Tender Notes against the real drawings with the estimator.
9. [ ] Issue one internal Tender Notes, then a second, and confirm P01 still opens.
10. [ ] Do not issue a client document or invite a client until the wording in section 4 is confirmed.
11. [ ] On a test lead: try Won with no signed PDF and confirm it is refused.
12. [ ] Rollback if needed: unset `REGISTER_PILOT_LEADS` and restart the API. The Register switches off for that lead, and Sales integrity stays on.

## 3. Future Tender integration boundary (documented, not built)

Nothing here sends an RFQ, allocates a trade, drafts an addendum or adds a tender table. Buildxact stays the authority for rates and cost. The Register stays the authority for client decisions.

What a future read-only adapter can rely on: `lead_id`, `job_id` and `project_id`; a stable item id (`source_register_item_id` on project rows); `promptKey` and `answer.sourceQuestionIds`; `answer.areaIds`; `answer.linkedItemIds`; `disposition` for contract inclusion, kept separate from `answer.delivery` for who performs it; `pricingStatus` and `pricingRef`; `technicalStatus`; and the issued Tender Notes revision with its `content_sha256`. Before an adapter is written, the `rfqs` versus packages and recipients duplication has to be resolved, so a third workflow isn't added (Tab 27 Gate 7).

## 4. Remaining business decisions

| # | Decision | Current behaviour until decided |
|---|---|---|
| 1 | Build-only or construction-management job with **no** plans recorded: which stages apply? | Unchanged: full design process |
| 2 | Promote any advisory requirement to a hard block? | Normal button waits for them. The director's Move menu passes them, logged |
| 3 | Blue Leaf Standard / Upgraded / Premium wording, colour tones, frame colours, finishes and review suggestions | Proposed, marked Draft wording on screen and in Tender Notes |
| 4 | Tab 27 Q4: supply and install responsibility model | Recorded only, implies nothing |
| 5 | Is one-tap Confirm room defaults what staff want? (Tab 27 open question) | Built. The pilot should test it |
| 6 | `land_status` versus `qualify_site`. One feeds a score that is a hard gate | Independent, both kept |
| 7 | Should supervisors get Sales access? | Admin only at the route prefix, as today |
| 8 | Legal contract generation and e-signing (DEC-CT), PTSA wording (PTS-02) | Not built, needs legal review |

## 5. Behaviour changes staff will notice

- A contract can only be marked signed by uploading the signed PDF. A lead showing signed with no PDF needs one attached before Won.
- A consultant document at Received no longer counts as ready. The normal Move to Tender button waits for Reviewed and In the set.
- Rooms list what they inherit, with one confirm, instead of asking again.
- Client Brief scope lines now carry a small item reference.
- A site fact recorded with an older Included status no longer prints as work.

## 6. Outstanding defects and risks

| Item | Level | Note |
|---|---|---|
| The PR #4 gate bypass is still live on `main` until this branch is merged | SOURCE | One request can set `stage: won` with `contract_status: signed`. Fixed here, not on `main` |
| P4c, P4d, P5, P6 and P7 had no independent review | n/a | Built directly in the session at the owner's request. P1 to P4b each had one. Run a review before merging |
| Nothing is production-verified | PRODUCTION | Fonts (Lato), storage and real data can only be confirmed there |
| Two people editing the pricing guide | AUTOMATED | The merge logic is tested. The live two-tab path wasn't re-driven after the fix |
| W-013, W-014 rows saved before this keep their old technical status | SOURCE | Not rewritten, by design |
| Partial audit items not built | SOURCE | PTS-01 numbering, CON-01 step sequencing, TEN-03 and TEN-05 contract pack states, DIS-03, QUA-02 and QUA-05, release metrics |
| General joinery standard isn't read by a room prompt | SOURCE | Recorded on Whole House only |

## 7. Test evidence

Commands, from the repo root, sandbox running. None touch production.

```bash
bash <scratchpad>/run-tests.sh all
```
```bash
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test --config scripts/dev/register-sandbox/playwright.sandbox.config.mjs
```

Screenshots: `~/blh-register-evidence/r05/` (p4b, p4cd, p5, p6, p7). Per-phase detail: `R05_BUILD_LOG.md`.

*The older notes in `R04_RELEASE_PACKAGE.md` and `RELEASE_BLOCKER_REVIEW.md` are kept as history.*

## 8. Exact files changed from `759b8e7`

A = added, M = modified, D = deleted. This list stops at the commit before this section was added.

```
M	docs/agent_knowledge/MASTER_DATA_DICTIONARY.md
M	docs/master_register/R03_TECHNICAL_GUIDE.md
M	docs/master_register/R04_RELEASE_PACKAGE.md
A	docs/master_register/R05_BUILD_LOG.md
A	docs/master_register/R05_PRODUCTION_PREFLIGHT.sql
A	docs/master_register/R05_RELEASE_PACKAGE.md
A	docs/master_register/question-library/TAB21_ANSWER_MAP.md
A	docs/master_register/question-library/tab21-answer-map-v1.0.json
A	docs/master_register/question-library/tab21-option-ids-v1.0.lock.json
M	docs/sops/02_sales/02-02_move_lead_through_stages.md
M	docs/sops/02_sales/02-04_qualifying_score.md
M	docs/sops/02_sales/02-05_blueprint_insight.md
M	docs/sops/02_sales/02-09_trust_rail_and_timeline.md
M	docs/sops/02_sales/02-10_enquiry_call_script.md
M	docs/sops/02_sales/02-11_qualify_email_and_booking.md
M	docs/sops/02_sales/02-12_lead_mailbox.md
M	docs/sops/02_sales/02-15_discovery_email.md
M	docs/sops/02_sales/02-16_concept_agreement.md
M	docs/sops/02_sales/02-18_pipeline_meeting_scheduling.md
M	docs/sops/02_sales/02-19_concept_stage.md
M	docs/sops/02_sales/02-20_ptsa_plans_stage.md
M	docs/sops/02_sales/02-21_consultants_stage.md
M	docs/sops/02_sales/02-22_tender_stage.md
M	docs/sops/02_sales/02-23_won_ops_handoff.md
M	docs/sops/02_sales/02-24_consultants_stage_roster_deliverables.md
M	docs/sops/02_sales/sales_create_new_lead.md
M	docs/sops/21_master_register/21-01_capture_project_brief.md
M	docs/sops/21_master_register/21-02_register_review_approvals_portal.md
M	docs/sops/21_master_register/21-03_issue_briefs_and_schedule.md
M	docs/sops/21_master_register/21-04_tender_baseline_handover.md
M	docs/sops/SOP_CHANGELOG.md
M	package.json
A	public/templates/blb-tender-notes-template.docx
A	scripts/dev/register-sandbox/playwright.sandbox.config.mjs
A	scripts/documents/build-tender-notes-template.mjs
A	scripts/register/build-answer-map-doc.mjs
M	scripts/register/build-question-library.mjs
M	scripts/tests/documents-r01.test.mjs
A	scripts/tests/lib/registerStructuredFixture.mjs
A	scripts/tests/register-documents-structured.test.mjs
M	scripts/tests/register-e2e.test.mjs
M	scripts/tests/register-handover-status.test.mjs
A	scripts/tests/register-progressive-choice.test.mjs
A	scripts/tests/register-progressive-render.test.mjs
A	scripts/tests/register-progressive-rooms.test.mjs
A	scripts/tests/register-progressive-wholehouse.test.mjs
A	scripts/tests/register-structured-mapping.test.mjs
A	scripts/tests/register-structured-model.test.mjs
A	scripts/tests/register-structured-store.test.mjs
A	scripts/tests/sales-correspondence-status.test.mjs
A	scripts/tests/sales-lead-detail-render.test.mjs
A	scripts/tests/sales-next-action.test.mjs
A	scripts/tests/sales-stage-gates.test.mjs
A	scripts/tests/sales-tender-contract-render.test.mjs
A	scripts/tests/sandbox-r05-scenarios.test.mjs
A	scripts/tests/sandbox-register-documents.test.mjs
A	scripts/tests/sandbox-register-guided.test.mjs
A	scripts/tests/sandbox-register-rooms.test.mjs
A	scripts/tests/sandbox-register-structured.test.mjs
A	scripts/tests/sandbox-register-wholehouse.test.mjs
A	scripts/tests/sandbox-sales-correspondence.test.mjs
A	scripts/tests/sandbox-sales-email-window.test.mjs
A	scripts/tests/sandbox-sales-integrity.test.mjs
A	scripts/tests/sandbox-sales-pathway.test.mjs
A	scripts/tests/walkthrough/r05-walkthrough.spec.mjs
M	server/lib/docTemplates.mjs
M	server/lib/documents/documentPayloads.mjs
M	server/lib/jobFactRegistry.mjs
A	server/lib/leadContractEvidence.mjs
M	server/lib/module4Routes.mjs
M	server/lib/registerDocuments.mjs
M	server/lib/registerHandover.mjs
M	server/lib/registerStore.mjs
M	server/lib/salesRoutes.mjs
M	src/components/sales/lead-detail/ConceptStage.jsx
M	src/components/sales/lead-detail/ConsultantComms.jsx
M	src/components/sales/lead-detail/ConsultantsStage.jsx
M	src/components/sales/lead-detail/DiscoveryActions.jsx
A	src/components/sales/lead-detail/EngagementPathwayCard.jsx
M	src/components/sales/lead-detail/EnquiryCallScript.jsx
M	src/components/sales/lead-detail/LeadCommandCentreLayout.jsx
A	src/components/sales/lead-detail/LeadCorrespondence.jsx
M	src/components/sales/lead-detail/LeadDetailHeader.jsx
M	src/components/sales/lead-detail/LeadMailbox.jsx
M	src/components/sales/lead-detail/LeadManagementStrip.jsx
A	src/components/sales/lead-detail/LeadStageAdvance.jsx
M	src/components/sales/lead-detail/LeadStageSection.jsx
M	src/components/sales/lead-detail/LeadSummaryPanel.jsx
M	src/components/sales/lead-detail/MeetingScheduler.jsx
M	src/components/sales/lead-detail/QualifyActions.jsx
A	src/components/sales/lead-detail/StageDrawings.jsx
D	src/components/sales/lead-detail/StageEmailBox.jsx
M	src/components/sales/lead-detail/StageEmailButton.jsx
M	src/components/sales/lead-detail/TenderStage.jsx
M	src/components/sales/lead-detail/WonStage.jsx
M	src/components/sales/lead-detail/XeroInvoiceCard.jsx
A	src/components/sales/lead-detail/register/BaselineGuide.jsx
M	src/components/sales/lead-detail/register/ContextStep.jsx
M	src/components/sales/lead-detail/register/DocumentsStep.jsx
M	src/components/sales/lead-detail/register/HandoverPanel.jsx
A	src/components/sales/lead-detail/register/OutstandingSummary.jsx
A	src/components/sales/lead-detail/register/ProgressiveChoiceCard.jsx
M	src/components/sales/lead-detail/register/PromptRow.jsx
M	src/components/sales/lead-detail/register/RegisterTable.jsx
M	src/components/sales/lead-detail/register/RegisterWorkshop.jsx
A	src/components/sales/lead-detail/register/RoomDefaultsPanel.jsx
M	src/components/sales/lead-detail/register/RoomsStep.jsx
M	src/components/sales/lead-detail/register/SectionStep.jsx
M	src/components/sales/lead-detail/register/TenderPanel.jsx
M	src/components/sales/lead-detail/register/ui.jsx
M	src/components/sales/lead-detail/register/useRegister.js
M	src/lib/constants.js
A	src/lib/leadCorrespondence.js
A	src/lib/leadNextAction.js
M	src/lib/register.js
A	src/lib/registerAnswer.js
A	src/lib/registerChoice.js
A	src/lib/registerGuidance.js
M	src/lib/registerQuestions.js
M	src/lib/stageGates.js
M	src/pages/LeadDetail.jsx
M	src/pages/SalesPipeline.jsx
A	supabase/migrations/217_sales_direct_write_guard.sql
A	supabase/migrations/218_register_tender_notes.sql
A	supabase/migrations/219_plans_supplied_pathway.sql
```
