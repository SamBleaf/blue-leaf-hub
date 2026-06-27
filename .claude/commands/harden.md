# /harden — Blue Leaf Hub hardening mode

Primary operating command for the 30-day Blue Leaf Hub hardening sprint.

**Purpose:** Make `/harden` the first point of contact for all agents working on reliability, testing, workflow mapping, bug fixing, source-of-truth cleanup, and regression hardening.

**Do not implement product features from this command.**

---

## Mission

Harden Blue Leaf Hub by mapping real business workflows, declaring source-of-truth ownership, converting drift into tests, applying smallest-safe fixes, and updating release readiness.

This command exists to stop agents from wandering, refactoring, or adding new modules.

---

## Hard rules

When `/harden` is used:

1. No new product modules.
2. No UI redesigns.
3. No broad refactors.
4. No route/table/field renames.
5. No god-file splits unless the workflow is already protected by regression tests.
6. No code changes until the relevant workflow map exists.
7. No bug fix without a regression test plan.
8. No bug closed without BUG_REGISTER update.
9. No source-of-truth change without updating workflow docs.
10. No guessing. If uncertain, document as `Unconfirmed / needs testing`.

---

## Required reading order

Before doing any hardening task, read:

```
CLAUDE.md
docs/agent_knowledge/SOURCE_OF_TRUTH.md
docs/agent_knowledge/MASTER_DATA_DICTIONARY.md
docs/agent_knowledge/DATA_FLOW_MAP.md
docs/agent_knowledge/MODULE_RELATIONSHIPS.md
docs/agent_knowledge/WORKFLOW_TEST_PLAN.md
docs/qa/30_DAY_HARDENING_TRACKER.md
docs/qa/WORKFLOW_MAP_MASTER.md
docs/qa/WORKFLOW_OWNERSHIP_MATRIX.md
docs/qa/WORKFLOW_TEST_MATRIX.md
docs/qa/BUG_REGISTER.md
docs/qa/SAM_DECISION_LOG.md
docs/qa/RELEASE_READINESS.md
docs/qa/ADVERSARIAL_AUDIT_2026-06-23.md
docs/qa/E2E_TESTING_MASTER_PLAN.md
```

If a file does not exist yet, create it **only** if it is part of the hardening plan (e.g. `RELEASE_READINESS.md`, missing workflow files). Do not create product code or speculative docs.

---

## Command modes

Interpret the user's `/harden` request as one of these modes.

### `/harden status`

Report:

```
Current 30-day sprint status
Current batch
Current workflow
Mapped workflows
Tests planned
Tests written
Fixes approved
Fixes done
Open Sam decisions
Highest-risk drift items
Next safe action
```

Update:

```
docs/qa/30_DAY_HARDENING_TRACKER.md
```

Do not change product code.

---

### `/harden map WXX`

Map one workflow.

Steps:

```
1. Read relevant SOPs
2. Read agent knowledge/build notes
3. Read QA docs
4. Read frontend pages/components
5. Read backend routes/services
6. Read migrations/schema
7. Read existing tests
8. Write or update workflow file
9. Update master docs
10. Stop and summarise
```

Output file:

```
docs/qa/workflows/XX_WORKFLOW_NAME.md
```

Use the **23-section Batch A workflow format:**

```
1. Business intent
2. Start trigger
3. End/handoff
4. Main users
5. Blue Leaf workflow
6. Hub workflow
7. SOP interpretation
8. Code interpretation
9. Entry points
10. Exit points
11. Screens
12. Routes
13. Database ownership
14. External integrations
15. Existing tests
16. Drift risks
17. Security/role risks
18. Required handoff data
19. Handoff failure risks
20. Acceptance criteria
21. Required tests
22. Open decisions
23. Smallest safe fix plan
```

Include evidence labels throughout:

```
Verified from code
Verified from SOP/docs
Inferred from behaviour
Unconfirmed / needs testing
Open decision for Sam
```

Also update when mapping:

```
docs/qa/WORKFLOW_MAP_MASTER.md
docs/qa/WORKFLOW_OWNERSHIP_MATRIX.md
docs/qa/WORKFLOW_TEST_MATRIX.md
docs/qa/BUG_REGISTER.md
docs/qa/SAM_DECISION_LOG.md
docs/qa/30_DAY_HARDENING_TRACKER.md
```

**No code changes.** Stop after one workflow and summarise before continuing to the next unless user explicitly says continue.

---

### `/harden test WXX`

Convert mapped workflow risks into tests.

Steps:

```
1. Read workflow file
2. Read BUG_REGISTER entries for that workflow
3. Read WORKFLOW_TEST_MATRIX
4. Identify missing tests
5. Add planned tests to matrix
6. If approved, create test skeletons only
```

Allowed test types:

```
unit
api
e2e
visual
security
role
regression
integration
```

Do not fix product code unless user explicitly approves a bug fix.

---

### `/harden fix BUG-ID`

Fix one registered bug or drift item only.

Steps:

```
1. Read BUG_REGISTER entry
2. Read mapped workflow
3. Identify exact files involved
4. Confirm source-of-truth decision
5. Confirm existing/planned regression test
6. Propose smallest-safe fix
7. Wait for approval unless user explicitly says proceed
8. Apply fix
9. Run relevant tests
10. Update BUG_REGISTER
11. Update WORKFLOW_TEST_MATRIX
12. Update 30_DAY_HARDENING_TRACKER
```

Do not fix adjacent bugs.

Do not refactor.

Do not rename anything.

---

### `/harden rfq`

Use the RFQ/Tendering hardening plan.

Required reading:

```
docs/qa/RFQ_TENDER_WORKFLOW_SOURCE_OF_TRUTH.md
docs/qa/TENDER_EMAIL_TEST_PLAN.md
docs/qa/workflows/06_RFQ_PACKAGE_SCOPE_EXTRACTION.md
docs/qa/workflows/07_RFQ_SEND_QUOTE_MATCHING.md
docs/qa/workflows/08_QUOTE_COMPARISON_ACCEPTANCE.md
docs/qa/workflows/05_TENDER_BOARD_LIFECYCLE.md
docs/qa/workflows/09_TENDER_WIN_PROJECT_HANDOFF.md
```

If workflow files 05–09 do not exist yet, map them first (`/harden map W05` etc.) before applying fixes.

Priority order:

```
1. Confirm package send creates sent_message_id
2. Confirm inbound quote matching baseline tests
3. Confirm unmatched quote queue behaviour
4. Confirm rfqs → rfq_recipients rollup
5. Confirm TenderBoard and RfqPackageDetail do not drift
```

Do not change matcher logic before tests/tracing exist.

Reference existing tests:

```
scripts/test-imap-quote-match.mjs
scripts/test-rfq-unmatched-resolve.mjs
e2e/tests/smoke/api-rfq-unmatched.spec.js
```

---

### `/harden review`

Review progress and produce:

```
Mapped workflows
Stable workflows
Unstable workflows
Open decisions
P0 fixes waiting
Tests missing
Security risks
Release readiness score
Next 3 safe actions
```

Update:

```
docs/qa/RELEASE_READINESS.md
docs/qa/30_DAY_HARDENING_TRACKER.md
```

If `RELEASE_READINESS.md` does not exist, create it as part of this mode.

---

## 30-day hardening lanes

Track all work against four lanes:

```
Lane 1 — Workflow Mapping
Lane 2 — Test Planning
Lane 3 — Smallest-Safe Fixes
Lane 4 — Release Readiness
```

Do not let hardening become endless documentation.

Every mapped workflow must eventually produce:

```
Source-of-truth declaration
Drift risks
Required tests
Bug/register entries
Open Sam decisions
Smallest-safe fix plan
```

Every approved fix must produce:

```
Regression test
Bug register update
Tracker update
Release readiness update
```

## 30-day execution rhythm

Unless Sam changes direction:

```
Days 1–5:   Batch A mapping W01–W05 — no product code
Days 6–8:   Batch A review; approve P0 fixes; W01–W05 test skeletons
Days 9–14:  Batch B mapping W06–W07; RFQ email matching baseline tests
Days 15–20: RFQ/tender P0 fixes (sent_message_id, rollup, unmatched resolve, Board/package drift)
Days 21–25: Procurement handoff, schedule readiness, finance/portal smoke tests
Days 26–30: Regression run, security route sweep, release readiness report, bug register cleanup
```

Control doc: `docs/qa/30_DAY_HARDENING_TRACKER.md`

---

## Current sprint batches

Use this order:

```
Batch A — Sales to Tender Setup
  W01 Lead / Enquiry / CRM Intake
  W02 Lead Qualification / Discovery / Client Fit
  W03 Fee Proposal / PTSA
  W04 Estimate / Buildxact / Tender Job Setup
  W05 Tender Board / Tender Lifecycle

Batch B — RFQ to Won Job
  W06 RFQ Package / Scope Extraction
  W07 RFQ Send / Quote Receive / Email Matching
  W08 Quote Comparison / Accept Quote
  W09 Tender Win / Operations Handoff

Batch C — Operations
  W10 Procurement Planning
  W11 Purchase Orders / Commitments
  W12 Scheduling / Critical Path / EOT
  W13 Site Operations / Diary / Media
  W14 WHS / Inductions / SWMS / Incidents
  W15 Workforce / Timesheets / Work Orders

Batch D — Money and Client Facing
  W16 Finance / Invoice Processing
  W17 Job Command Centre / Variations / Claims
  W18 Client Portal / Client Actions / Communications

Batch E — Supporting Systems
  W19 Subcontractor / Supplier Directory
  W20 Cost Intelligence / Benchmarks
  W21 Carpentry Division
  W22 CRM Relationships / Mailing List
  W23 Marketing Agent / Media / Content
  W24 Marketing Intelligence / Attribution / SEO
  W25 Admin / Settings / Integrations / Users
```

Cross-cutting RFQ reference (not a workflow number): `docs/qa/RFQ_TENDER_WORKFLOW_SOURCE_OF_TRUTH.md`

After Batch A workflows W01–W05 are mapped, create: `docs/qa/BATCH_A_SALES_TO_TENDER_SUMMARY.md`

---

## Bug and decision conventions

```
W0N-DRIFT-###  — workflow-specific drift (Batch A sales/tender)
DRIFT-###        — RFQ/tender cross-cutting (no W prefix)
SAM-W0N-###      — business decisions pending Sam approval
QA-###           — security/adversarial audit items
```

---

## Output style

Every `/harden` response must end with:

```
Source-of-truth check:          ← mandatory from W04 map stop summaries onward
Expected: <from plan / SOURCE_OF_TRUTH.md>
Confirmed: <files/routes/tables verified>
Mismatch: <if any, else none>

Next safe action:
<one specific action>

Blocked by:
<none or list>

Code changed:
yes/no

Tests changed:
yes/no

Docs changed:
yes/no
```

---

## Safety stop

If the request would cause broad refactor, unclear source-of-truth change, schema rename, module redesign, or untested bug fix, **stop and ask for direction**.

Default action when uncertain:

```
Document finding.
Register drift.
Add test plan.
Stop.
```
