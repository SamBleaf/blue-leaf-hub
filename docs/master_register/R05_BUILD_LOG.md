# R05 Build Log — Sales integrity and Master Register completion

Implements Tab 27's "R04 — Approved Business Direction" and the Sales blueprint. Branch `sales-register-r05`, cut from `origin/main` @ `759b8e7`. Nothing here is deployed.

Evidence levels: SOURCE (code read), AUTOMATED (named test ran), BROWSER (driven in a browser against the sandbox), DB (confirmed in the sandbox database), PRODUCTION (not available in this workflow).

---

## P1 — Sales integrity (2026-11-09)

**Outcome.** Through the Hub API, a lead can no longer reach a stage by asserting its own facts, jumping past a hard gate, or claiming a signed contract without the PDF. Migration 217 refuses the same writes when they come straight from a browser token; it is applied in the sandbox only, so that path stays open on production until the owner applies it. Moves are safe when two people act at once, and a Won hand-off that didn't finish can be finished afterwards.

**Commits.** `29bf551` (code and tests), `0c5cd4e` (docs), `fb4f9fd` (independent-review fixes and migration 217), and the docs commit carrying this update. See "Corrections after the independent review".

### What changed

| Area | Behaviour now |
|---|---|
| Hard gates (D2) | Read stored state only. Advisory warnings still use the merged view. |
| Forward jumps (D3) | Every hard gate crossed on the lead's pathway is checked. A jump is refused at the first unmet one, naming it. Architect Tender skips Concept and PTSA only, and keeps Discovery (D6). `win-finalize` is the exception: see below. |
| Back from Nurture or Lost | Treated as starting at the beginning of the pipeline. Before, `isForwardMove` was false for these, so Nurture → Won had no gate at all. |
| Won gate (D5) | Two rows: "Building contract signed" and "Signed contract PDF on file", so each explains itself. |
| Contract writer (D5) | `POST /api/sales/leads/:id/contract/mark-signed`, the only Hub route that writes the signed state. File, then evidence row, then status; earlier steps undone on failure. Never overwrites earlier evidence. Attaches a PDF to a lead already signed and keeps its date; if it never had a date, only a date staff give is recorded. |
| PDF check (D5) | The header must open the file (`%PDF-` and a version, white space only before it) and the last `%%EOF` must close it (padding only after it, within 1 KB). Checks shape, not signatures. |
| Direct database writes (mig 217) | Triggers refuse browser-token (anon/authenticated) changes to lead stage, `contract_status`, `contract_signed_date`, `ptsa_status`, `concept_agreement_status`, `lead_type`, `is_test`, and any add, change or removal of a `construction_contract` row. Hub API, SECURITY DEFINER functions, SQL editor and RfqEngine's `job_id` link are unaffected. |
| Evidence flag (D5) | `withContractEvidence` attaches `contract_evidence_present` in GET and PATCH and before gates. A failed read counts as no evidence. |
| Tender UI (D5) | The Signed pill is replaced by a PDF upload. Shows the file once on file. Amber prompt for a lead signed with no file, with a date box if no date is on record. The strip's **Contract signed** step can't be clicked and reads the contract state. |
| Blanket PATCH | Refuses `contract_status: signed`, `contract_signed_date`, `tender_substatus: contract_signed` and a deny-list of server-owned fields, now including `schedule_signed_off_at/by` and `delivery_model`. Unknown stages refused. `discovery_meeting_booked_at` stays writable. |
| Create | `POST /api/sales/leads` can't start a lead signed or accepted, and only test leads and the Architect Tender intake (at Tender) can start past Enquiry. |
| Un-sign | Director-only, logged with the date it cleared, clears the signed date, keeps the PDF. Can't be combined with a stage move. |
| Concurrency | `UPDATE ... WHERE id AND stage = current`. A lost race returns 409 `STAGE_CONFLICT` and writes nothing. |
| Activity log | `stage_change` is written after the update lands. A failed insert can't fail a completed move. |
| Won recovery | The hand-off runs on every entry to Won and is reported as `wonHandoff`. `ok` now means a project exists and has left pre-construction. New `POST …/won/retry-handoff` with a small link on the Won panel; it restores a missing project by re-firing trigger 096. An archived or lost job is never flipped: with a project it counts as handed over, without one the result says so (409 `JOB_CLOSED` on the retry). `convert-to-job` on a Won lead completes the hand-off. A Register promotion failure doesn't fail the hand-off (the Register retries on open); it is logged and reported as `registerPromoted: false`. |

### Scope decisions beyond the literal brief

These close a second door to the same state. Each is small and can be reverted on its own.

- `POST /api/tender/win-finalize` sets the linked lead to Won, so it now applies the Won gate to a lead-linked job, before it writes anything. It checks the Won requirements only, not every stage crossed, because a job's lead may never have been walked through Sales.
- The generic Documents upload refuses `construction_contract`, and that option is gone from its dropdown. Otherwise a non-PDF could become evidence. Historical rows of that type still count.
- Removing a signed contract PDF is logged.
- The pipeline card's **Move ▾** now shows why a move was refused. It used to fail silently.

### Roles (D7): what the code shows

- `requireAuth` rejects inactive accounts and clients.
- The SPA opens every `/sales` route to `admin` only (`RoleRoute`, `can.accessSales`). `roles.js` says Supervisors have no Sales access.
- The server already gates `/api/sales` and `/api/tender` to `admin` at the prefix (`server/dev-api.mjs`, block "A4"). This runs before any route.
- So only a Director can reach any of these writes today, which is narrower than D7's admin + supervisor. The prefix gate was not changed. Widening it would add access nobody asked for.
- The route-level checks D7 lists are in place as the upper limit if Sales is ever opened to Supervisors. They can't be exercised through the API while the prefix gate runs first, so they are verified at SOURCE plus unit tests of the role predicates.
- D5 says un-signing is admin-only and D7 lists it under admin + supervisor. Admin-only satisfies both.
- SOPs 02-16, 02-20, 02-22 and 02-23 said Supervisors run these stages. Each now carries a note of the real access.

### Schema and API impact

Migration **217** (`217_sales_direct_write_guard.sql`): two additive triggers, no table, column or data change, rollback block in the file. Applied to the sandbox only. The app works with or without it, so it can go on before or after the code. The next free number is 218. Evidence still uses `lead_documents` as allowed since mig 194.

New: `POST /api/sales/leads/:id/contract/mark-signed`, `POST /api/sales/leads/:id/won/retry-handoff`, `server/lib/leadContractEvidence.mjs`, `showsQualifyingScorecard` in `stageGates.js`.

Changed responses: lead GET and PATCH carry `contract_evidence_present`. PATCH also carries `wonHandoff` on entry to Won, and now returns 404 for a missing lead, 400 for a server-owned field or unknown stage, and 409 `STAGE_CONFLICT`. `win-finalize` can return 422 `GATE_BLOCKED`. `POST /api/sales/leads` returns 400 for a standard lead created past Enquiry.

`isForwardMove` is removed from `stageGates.js`; `stagesCrossed` replaces it.

### Tests

| Level | What | Result |
|---|---|---|
| AUTOMATED | `node scripts/tests/sandbox-sales-integrity.test.mjs` through the real API and sandbox Postgres | 154 passed, 0 failed |
| AUTOMATED | `node scripts/tests/sales-stage-gates.test.mjs` | 59 passed, 0 failed |
| AUTOMATED | `node scripts/tests/sales-tender-contract-render.test.mjs` (renders the contract panel and progress strip to a string) | 22 passed, 0 failed |
| AUTOMATED | `bash SP/run-tests.sh all`: 17 suites | 607 checks, 0 failing |
| DB | Sandbox assertions on rows, stored files and one-project-per-job, with injected triggers for the race and failure paths. Mig 217 through real PostgREST with employee and director tokens. | Within the 154 above |
| DB | Mig 217 re-applied and its rollback block run in a rolled-back transaction | Both ran; triggers still installed afterwards |
| SOURCE | Route-level supervisor paths, unreachable behind the prefix gate | Read only |
| SOURCE | Scorecard shown for an Architect Tender lead moved back: the predicate is unit-tested, its use in `LeadDetail.jsx` is one line and not rendered | Read only |
| BROWSER | Not driven in P1. The upload, un-sign, retry and strip clicks have been API-tested and the panels render-tested, but nobody has clicked them in a browser. Due in P7. | Not verified |
| PRODUCTION | Not available in this workflow | Not verified |

`npm run lint` and `npm run build` pass, and `node --check` passes on the changed server files. These say nothing about behaviour.

Existing tests changed deliberately: `register-e2e` (+1 check) and `register-handover-status` (+1 check) used to set `contract_status` directly and now go through the writer. No assertion was weakened.

### Caveats

- Migration 217 is sandbox-only until the owner applies it. Until then, any staff browser token can write these fields on production.
- Mig 217 covers the listed fields only. A staff browser token can still write other lead columns where RLS allows, including gate inputs (qualifying answers, a booked build conversation). A forged input still needs a Director to move the lead through the Hub API. Service-role server code and direct SQL are not restricted.
- The Won gate trusts a `construction_contract` row and doesn't re-check that its file exists. Since mig 217 only the Hub can add those rows; rows already in production are not re-examined.
- `POST /api/tender/win-finalize` checks the Won requirements only, not every stage crossed, because a job's lead may never have been through Sales.
- PDF validation reads the file's shape. It catches wrong and cut-off files, not a forged PDF.
- A job closed with no project needs restoring before the hand-off can finish, and the only way is `POST /api/tender/unarchive`: the SPA has no button. A lost job used to flip to won on first entry to Won and no longer does. Recorded as a decision.
- An Architect Tender lead moved back before Discovery now needs the Discovery facts to come forward.
- PTSA mark-signed keeps its existing base64-only check; only its role changed.
- `register-handover-status` and `recordBaseline` still read `contract_status` alone. A Won lead with no PDF is left as it is, per D5.

### Corrections after the independent review (2026-11-09)

The first version of this entry overstated several things. What it said, and what is true:

| First claim | Correction |
|---|---|
| "A lead can no longer reach a stage by asserting its own facts, jumping past a gate, or claiming a signed contract without the file" | True at the Hub API only. An employee JWT could write `stage`, the signed state and an evidence row straight to the database, and the Hub API then passed Won on a file that did not exist. POST create could also start a standard lead at a later stage. Both are now refused; the database guard is sandbox-only until mig 217 is applied. |
| "Sole writer" of the signed state | True of Hub routes only. Browser tokens are now refused by mig 217. Service-role server code and direct SQL can still write it. |
| "Forward jumps check every hard gate crossed" | Had two exceptions. Architect Tender skipped the Discovery gate, against D6: fixed. `win-finalize` checks the Won gate only: by design, and stated above. |
| "Catches wrong and truncated files" | A PDF cut off after an earlier `%%EOF` passed, and so did non-PDF files holding both markers. Fixed. Forged PDFs still can't be detected. |
| "The blanket PATCH refuses server-owned fields" | `schedule_signed_off_at/by` and `delivery_model` were still accepted. Fixed. |
| "Won has a retry surface" and "No P1 requirement is outstanding" | The retry couldn't restore a missing project when the job was already won, `wonHandoff.ok` could be true for a project that never left pre-construction, and re-running it un-archived an archived job. All fixed. |

Also fixed from the review: attaching a PDF stamped today as a signed date nobody gave, un-signing lost the old date, and the Tender strip had a one-tap "Contract signed" step with no PDF behind it.

### Next dependency

Owner: apply migration 217 with the rest of the R05 migrations; P7's release package lists it. P2 makes the advisory wording explicit (D4) and consolidates progression controls. P6 adds `plans_supplied` to `resolveEngagementPathway` and the applicability table in `stageGates.js`, which is seeded with `design_build` and `architect_tender`.

---

## P2 — Sales interface consolidation (2026-11-09)

**Outcome.** The lead page now shows one next action and has one way forward. The header on desktop and the sticky bar on a phone name the next task and jump to that control. They never move the lead. The only control on this page that moves a lead forward is at the bottom of the stage's work, and it says what is required and what is recommended. Each stage has one Client correspondence area, closed by default, that states only what was recorded. Nothing here is deployed.

**Commits.** `becccdb` (code and tests) and the docs commit carrying this entry.

### What changed

| Area | Behaviour now |
|---|---|
| Next action | `computeLeadNextAction` (`src/lib/leadNextAction.js`) gives one short task, a target and a mobile tab. Hard gates come before recommended ones. It reports ready only when the Move button would really be live. |
| Pointer | Scrolls to the element tagged `data-next-target`, opens anything collapsed, flashes a ring, and switches tab on a phone. Focus goes to the file picker or the single right button. A group of choices takes focus on its wrapper, so a stray Enter can't answer a question or change a status. |
| Stage-advance area | `LeadStageAdvance` at the bottom of the "Do this now" card, after correspondence. Removed: the header advance, the rail card, the Action-tab copy, Enquiry's "Proceed". The stage moves only from here, the pipeline card's Move ▾ and the corrective stepper. |
| Required vs recommended (D4) | Two labelled groups from `gateRows` in `stageGates.js`. Semantics unchanged: the button still waits for everything listed. The wording says so, and says a Director can skip recommended items with Move ▾ and the skip is logged. |
| Reference rail | 300px, was 360. Key details stays open. Temperature & risks, Trust, Blueprint, Notes, Documents and Nurture are closed sections. Temperature, a stuck reason and the risk count show on the closed row. |
| Blueprint | Makes its AI call when opened, not on every page load. |
| Score | Once: on the scorecard at Enquiry and Qualify, then on the Earlier stages row. Removed from the header and Key details. Warning text no longer repeats the number. |
| Correspondence | `LeadCorrespondence` holds each stage's emails: one button, or one list and one button when a stage has several. All sends go through `StageEmailButton`. Removed the separate senders in `QualifyActions`, `DiscoveryActions`, `ConceptStage`, `TenderStage` and the PTSA card. `StageEmailBox` is deleted and its templates moved here. Every stage now has the thread, including Concept onward, which had none. |
| Composer | `LeadMailbox` opens only from View correspondence, then New message or Reply. |
| Status line | From the correspondence log. Sent reads as accepted by our mail server, with a note that delivery can't be seen. A failed read says so instead of looking like an empty history. |
| Per-template record | A row is tied to its template by the Message-ID each family already writes, so an edited subject still counts. Falls back to the lead's sent stamp where the family has one. |
| Sending switched off | `GET /mailbox` now returns `sending`, one boolean per family. The page says when sending is off and the preview window can't send. The server's own 503 is unchanged. |
| Kept deliberately | Qualify's contextual "Move to Nurture" under 5 (QUA-06). Header Nurture and Mark Lost. The discovery designer rule and the attach option, which moved into the preview window. Tender's two email side effects, now `patchAfterStageEmail`. |
| Won | The bottom area is the hand-off. The rail card and its "Lead won" banner are gone. The pointer goes to the Ops Ready checklist until that is done, and the dashboard button stays secondary until then. The handover truth work is still P6. |

### What the code shows about D4

D4 describes the admin stepper as able to pass non-hard requirements. On a real lead the stepper only goes backward (`LeadStageStepper`, `canClick`). The route that passes them in the UI is Move ▾ on the pipeline card and the action queue, so that is what the wording names. The server logs the skip as "Gate bypass — missing: …" on the `stage_change` activity.

### Schema and API impact

No migration. `GET /api/sales/leads/:id/mailbox` gains `sending`. No send route, preview, approval or permission changed.

New: `src/lib/leadNextAction.js`, `src/lib/leadCorrespondence.js`, `LeadCorrespondence.jsx`, `LeadStageAdvance.jsx`, `gateRows` in `stageGates.js`. Deleted: `StageEmailBox.jsx`. Gate hints that pointed the wrong way after the move were reworded; no gate rule changed.

### Tests

| Level | What | Result |
|---|---|---|
| AUTOMATED | `node scripts/tests/sales-next-action.test.mjs`: every stage, every gate row, and that every target is a real tagged control | 75 passed, 0 failed |
| AUTOMATED | `node scripts/tests/sales-correspondence-status.test.mjs`: status wording, per-template record, stage email map against the real families | 39 passed, 0 failed |
| AUTOMATED | `node scripts/tests/sales-lead-detail-render.test.mjs`: panels rendered to a string, plus page-source "only one of each" checks | 52 passed, 0 failed |
| AUTOMATED | `node scripts/tests/sandbox-sales-correspondence.test.mjs` through the real API: flags reported, every template previews, every send refused 503 and records nothing, role and missing-recipient rejections. Refuses to run if any send switch is on. | 91 passed, 0 failed |
| AUTOMATED | `bash SP/run-tests.sh all`: 21 suites | 864 checks, 0 failing |
| DB | Within the sandbox suite: no correspondence row or sent stamp after a refused send; real rows read back through the API | Within the 91 |
| BROWSER | Headless Chromium against the sandbox SPA at 1440, 1024, 768 and 375: pointer landing, one Move button, order of the page, closed composer, score once, real clicks through Qualify to Discovery, no page overflow, every mobile tab, Blueprint on demand. Evidence: `~/blh-register-evidence/r05/p2/` (`walkthrough-result.txt`, screenshots). | 75 passed, 0 failed, 0 console errors |
| PRODUCTION | Not available in this workflow | Not verified |

`npm run lint` and `npm run build` pass, and `node --check` passes on the changed server file. These say nothing about behaviour.

No existing test assertion changed. A real send was never exercised, because sending is off in the sandbox and must stay off.

### Caveats

- The browser run is not P7's evidence. The script is in the session scratchpad, not the repo. P7 adds the sandbox Playwright config. It signed in with a session from the sandbox test account placed in browser storage, so the login form itself wasn't exercised.
- Blueprint was stubbed in the browser run, to count calls without reaching a model.
- The Hub records sent and received only. A failed send leaves no row, so it shows at the moment of trying and not afterwards. Delivery and bounces aren't tracked at all. Recorded as a decision.
- The Tender pointer follows the tender progress strip: estimate, then present, then contract. If staff don't move the strip, it stays on the estimate until a contract status is set. No gate depends on it.
- The desktop and mobile layouts are both mounted, as they were before, so the mailbox loads twice per page.
- `e2e/tests/workflows/sales-stage-gate-ladder.spec.js` and its helper look for a "Lead file" drawer and a "Next: {stage}" panel, which didn't exist before this phase either. It targets production, so it was not run or changed.
- Enquiry guidance moved into the bottom panel. Nurture and Mark Lost are now only at the top of the page.

### Next dependency

P6 extends `computeLeadNextAction` and `nextStage` for the plans-supplied pathway, and does the Won handover truth and the per-stage content gaps. P7 takes the formal browser evidence and should cover a real send on a test recipient only if the owner allows it.
