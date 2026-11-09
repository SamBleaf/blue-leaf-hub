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

**Commits.** `becccdb` (code and tests) and `0fa3beb` (docs). Review fixes: `4a286bd` (code and tests) and the docs commit carrying this update.

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
| Correspondence | `LeadCorrespondence` holds each stage's emails: one button, or one list and one button when a stage has several. Stage emails and meeting booking emails go through `StageEmailButton`. Free-form messages (`LeadMailbox`), consultant threads (`ConsultantComms`) and Xero invoices (`XeroInvoiceCard`) send on their own. Removed the separate senders in `QualifyActions`, `DiscoveryActions`, `ConceptStage`, `TenderStage` and the PTSA card. `StageEmailBox` is deleted and its templates moved here. Every stage now has the thread, including Concept onward, which had none. |
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
| DB | Within the sandbox suite: no correspondence row or sent stamp after a refused send; rows the test inserted by hand, with made-up Message-IDs, read back through the API. No row from a real send path was exercised. | Within the 91 |
| BROWSER | Headless Chromium against the sandbox SPA. Most checks ran at 1440: pointer landing, one Move button, order of the page, closed composer, score once, real clicks through Qualify to Discovery, Blueprint on demand. 1024 and 768 had two checks each. 375 ran on a Qualify and a Discovery lead only: no page overflow and the mobile tabs. Evidence: `~/blh-register-evidence/r05/p2/` (`walkthrough-result.txt`, screenshots). | 75 passed, 0 failed, 0 console errors |
| PRODUCTION | Not available in this workflow | Not verified |

`npm run lint` and `npm run build` pass, and `node --check` passes on the changed server file. These say nothing about behaviour.

No existing test assertion changed. A real send was never exercised, because sending is off in the sandbox and must stay off.

### Caveats

- The browser run is not P7's evidence. The script is in the session scratchpad, not the repo. P7 adds the sandbox Playwright config. It signed in with a session from the sandbox test account placed in browser storage, so the login form itself wasn't exercised.
- Blueprint was stubbed in the browser run, to count calls without reaching a model.
- The Hub records sent and received only. A failed send leaves no row, so it shows at the moment of trying, inside the review window, and not afterwards. Delivery and bounces aren't tracked at all. Recorded as a decision.
- The Tender pointer follows the tender progress strip: estimate, then present, then follow up, then contract. If staff don't move the strip, it stays where it is until a contract status is set. No gate depends on it.
- The desktop and mobile layouts are both mounted, as they were before, so the mailbox loads twice per page.
- `e2e/tests/workflows/sales-stage-gate-ladder.spec.js` and its helper look for a "Lead file" drawer and a "Next: {stage}" panel, which didn't exist before this phase either. It targets production, so it was not run or changed.
- Enquiry guidance moved into the bottom panel. Nurture and Mark Lost are now only at the top of the page.

### Corrections after the independent review (2026-11-10)

The first version of this entry overstated several things. What it said, and what is true:

| First claim | Correction |
|---|---|
| "No P2 requirement is outstanding" and "each stage has one Client correspondence area" | Not true when written. The meeting cards' **Email booking link** was a separate preview and send window on Discovery, Concept (twice), PTSA, Consultants and Tender. Fixed below. Consultant emails and Xero invoices stay where they are: a consultant thread isn't client mail, and an invoice belongs to its card. |
| "All sends go through `StageEmailButton`" | False. The table row above is reworded. The guard test only matched five endpoints; it now covers `invite-email` too. |
| "A failed send shows at the moment of trying" | False. The error was rendered on the page behind the open review window, at desktop and phone width. Fixed below. |
| "Status wording states only what is recorded" | True of the correspondence area only. The meeting card said "Booking email sent.", consultant threads said "Email sent + logged." and the invoice card said "Invoice emailed to the client." All three are fixed or gone. |
| BROWSER row read as every check at every width | `walkthrough-result.txt` shows two checks each at 1024 and 768, and the 375 pass covered Qualify and Discovery leads only. Row reworded. The reviewer's own probe found no overflow at 375 on the other stages. That is the reviewer's evidence, not this phase's. |
| DB row: "real rows read back" | Those rows were inserted by the test with made-up Message-IDs. Row reworded. |

Fixed from the review:

| Finding | Fix |
|---|---|
| The pointer said "Present the proposal" after it was recorded as presented | At Proposal presented it says "Follow up on the proposal" and lands on Client correspondence with that email chosen. SOP 02-22 names this as the step after presenting. With tender sending off, staff follow up another way and click Client reviewing, so the pointer is still correct but needs that click. |
| Booking email was a second send surface that ignored the switch | Each meeting's booking email is now a template in `leadCorrespondence.js` on the existing `invite-email` route, following the mailbox switch. `MeetingScheduler`'s window is deleted. Its button is now **Go to the booking email**, which jumps there with that email chosen. This is one more click than before, in exchange for one review window and a status line that updates after sending. No server change. |
| A failed send couldn't be read | The error shows inside the window with `role="alert"`. The window and edits stay. On close it stays beside the button. |
| Same fault in the invoice window (not in the review) | `XeroInvoiceCard` has the same fix. Source-level test only: Xero isn't configured in the sandbox, so this path has not been driven in a browser. |
| Enquiry pointer skipped the call on web leads | Only a Site or Decision maker answer counts, because the website form never asks those. |
| Pointer focus | Lands on the Review button, so Enter opens the preview. Opening a preview sends nothing. |

No migration, no server change, no gate rule changed.

Tests after the fixes:

| Level | What | Result |
|---|---|---|
| AUTOMATED | `node scripts/tests/sales-next-action.test.mjs` | 81 passed, 0 failed |
| AUTOMATED | `node scripts/tests/sales-correspondence-status.test.mjs` | 56 passed, 0 failed |
| AUTOMATED | `node scripts/tests/sales-lead-detail-render.test.mjs` | 61 passed, 0 failed |
| AUTOMATED | `node scripts/tests/sandbox-sales-correspondence.test.mjs`, now including every booking email through the real route: preview works, send refused 503, nothing recorded | 121 passed, 0 failed |
| BROWSER | `node scripts/tests/sandbox-sales-email-window.test.mjs`, new, headless Chromium at 1440 and 375, previews real, every send answered in the browser: failed send readable and edits kept, retry, close, booking email from the meeting card, sending off honoured, Tender pointer landing. Removing the fix made it fail. Screenshots: `~/blh-register-evidence/r05/p2-fix/`. | 47 passed, 0 failed |
| AUTOMATED | `bash SP/run-tests.sh all` after `restart-api`: 22 suites | 973 checks, 0 failing |
| PRODUCTION | Not available in this workflow | Not verified |

`npm run lint` and `npm run build` pass. These say nothing about behaviour.

Existing assertions changed on purpose, none weakened to get green:
- `sales-next-action`: "once answers exist" used a budget answer, which no longer counts as a call. It now uses a site answer, with new checks that budget or timeframe alone stay on the call.
- `sales-correspondence-status`: "no key is offered twice" is now two checks, because the same meeting's booking email is rightly offered at two stages: a stage email appears at one stage only, and no stage offers an email twice.
- `sales-lead-detail-render`: the Tender list has 6 emails, not 5, and the button's prop is `sendPath`.
- `sandbox-sales-correspondence`: builds each URL from `templateSendPath`.

A real send has still never been exercised. Sending stays off in the sandbox, and browser sends are answered by the test.

### Next dependency

P6 extends `computeLeadNextAction` and `nextStage` for the plans-supplied pathway, and does the Won handover truth and the per-stage content gaps. P7 takes the formal browser evidence and should cover a real send on a test recipient only if the owner allows it.

---

## P3 — Register structured data foundation (2026-11-10)

**Outcome.** A register item can now hold a typed answer, and that answer survives the lead scratchpad, promotion, and project load and save. The client portal never receives it: a client sees only a title built from the chosen labels. Document builders don't read it yet, so documents are unchanged until P5. Old free-text records read and edit as before. No screen writes an answer yet, so nothing changes for staff. Nothing here is deployed.

**Commits.** `6e4dd5c` (model, mappers, tests), `4bacd18` (answer map), `f9be425` (docs), `3931a78` and `2015603` (first review fixes and docs), then the second-review commits listed under "Corrections after the second independent review".

### What changed

| Area | Now |
|---|---|
| Answer map (Gate 0.2) | All 147 Tab 21 questions classified, count checked by test. 8 fact/prefill, 14 single-select, 3 multi-select, 25 progressive branch, 22 repeatable scope, 25 requirement, 13 action/risk, 37 technical-only. 70 essential, 37 more detail, 40 office-only. JSON plus a generated table. |
| Answer model (Gate 1.1) | `item.answer`, schema v1, in `src/lib/registerAnswer.js`. Field list in `R03_TECHNICAL_GUIDE.md` §3. |
| Mappers (Gate 1.3) | Carried by `makeItem`, `readRegister`, `writeRegister`, `selRowToItem`, `rsiRowToItem`, `detailOf` and so both row writers, `ITEM_FIELDS`, promotion, canonical load and save, `applyDefaultToRooms`, the room exception copy, and the staff tender and baseline rows. |
| Store classification | A part-finished or unresolved selection stays in `client_selections`. Excluded, N/A or a non-choice nature goes to `room_scope_items`, same id, answer intact, and comes back the same. |
| Locks | A real answer change on a locked row is refused before writing: `post_contract_locked`, `reapproval_required`, `baseline_locked`. Real means what was chosen and the words shown for it, which element and zone it covers and the words shown for those, the state, the areas and the record's nature. The check reads the row the save will write, and a change that names no row can't replace a stored item. Before this, `register_detail` wasn't compared, so an answer could have changed under an approval. |
| Client boundary | `clientSafeAnswer` is an allow-list. A structured selection's portal name comes from its labels. That name is all the portal receives. |
| Zone defaults | `defaultItemsFor`, and `defaultItemFor(reg, id, {zoneKey})`. Existing callers still get one default. |
| Room confirmation | `room.defaultConfirmations`, with `confirmRoomDefaults` and `roomDefaultStatus`. Library only until P4d. |

### Decisions within the brief

- **No migration.** Both stores already have `register_detail`. The one thing that looked like it needed SQL, the lock check, is safe in the service because `register_apply` still refuses a row whose version moves after the check.
- **Contract inclusion is derived from the disposition**, not stored. `CLAUDE.md` forbids storing a generated fact, and a second field could disagree. Trade delivery is separate, in `answer.delivery`.
- **Responsible party is the existing `responsibility`**, not a second owner field.
- **Room confirmation sits on the room, not on items.** One action writes the room list, touches no client-visible row, and can't set an approval because it never sees an item.
- **Merged cards keep their source ids.** W-004, W-006 and W-008 are one path in presentation only.

### Schema and API impact

No migration. The next free number stays 218. `PUT` and `GET /api/register/leads/:id` carry `answer` on items and `defaultConfirmations` on rooms. `sync.baselined` is added on scope items. A `PUT` can return 409 `CONFLICT` for a locked answer change, the existing shape. Tender and baseline rows gain `answer`, staff-only. `npm run register:answer-map` is new.

### Tests

| Level | What | Result |
|---|---|---|
| AUTOMATED | `node scripts/tests/register-structured-mapping.test.mjs`: coverage, wording, Tab 27 decisions, 13 damaged maps refused, fixture paths exist in the map | 48 passed, 0 failed |
| AUTOMATED | `node scripts/tests/register-structured-model.test.mjs`: canonical form, legacy, axes, assumptions, client view, change detection, defaults, room confirmation | 93 passed, 0 failed |
| AUTOMATED | `node scripts/tests/register-structured-store.test.mjs`: every mapper with jsonb key reordering, promotion, save, locks, older screens. In-memory stand-in for `register_apply`. | 51 passed, 0 failed |
| AUTOMATED, DB | `node scripts/tests/sandbox-register-structured.test.mjs`: real API, PostgREST, RLS and `register_apply`. Lead, promotion, canonical save, 409s, locked approvals, baseline, portal board, client token reads, client choice, three document previews, one issued snapshot, legacy records. | 77 passed, 0 failed |
| AUTOMATED | `bash SP/run-tests.sh all` after `restart-api`: 26 suites | 1242 checks, 0 failing |
| AUTOMATED | Each of seven protections removed in turn (`detailOf`, row reader, lock guard, client allow-list, store check, `makeItem`, older-screen carry). The unit suites failed each time. Files restored. Ad hoc, not committed. | Failed as expected |
| SOURCE | Portal reads use allow-lists (`CLIENT_SELECTION_FIELDS`, `PROJECT_SELECT`). `LegacyScheduleRows` keeps every row that has a `kind`. | Read only |
| BROWSER | Not driven. No screen changed. | Not verified |
| PRODUCTION | Not available in this workflow | Not verified |

`npm run lint`, `npm run build` and `node --check` on changed server files pass. These say nothing about behaviour. No existing test assertion changed.

### Caveats

- Every structured answer tested was built by a test. No staff screen has produced one.
- The lock rules for answers live in `saveProject`. It is the only caller of `register_apply` for edits today. A new direct caller would skip them.
- `outstandingReasons` is unchanged, so a recorded fact on a scope item still counts as an open decision and would be listed in the Client Brief's questions. No screen can create one before P4a, which recomputes it.
- Document builders are unchanged. A structured selection with no typed text shows TBC in the schedule. P5 must read answers through `clientSafeAnswer`.
- The map is a proposal. Child options beyond the source wording are marked `proposed` or sit under a Tab 27 source, for Blue Leaf to confirm in P4.
- Tab 27 Q4 (who supplies versus who installs) is still open, so W-023, M-003, "Owner supplied" on R-009 and "By client" on W-022, R-014, V-005 and O-001 record only who supplies. An item answered "By client" stays undecided on contract inclusion until Q4 is settled.
- P4a must copy an option's label once, when it is chosen, and never refresh a stored label from the config. Repeatable elements need a stable `element.id`. Other text goes in `selected[].label` on an open option.
- Gate 1.4's central baseline config is P4b, per the brief. P3 provides the assumption field and `applyPricingAssumption` only.
- Project mode needs migration 213. Without it the register stays on the lead, as before.
- **Tab 27 Gate 0.2's CHECK is not done.** It asks for the mapping to be reviewed against the original client-meeting conversations, with no hidden scope lost. Those conversations aren't available in this workflow. The wording check here is a machine compare against the question library, which can't show that nothing from a real meeting was missed. Blue Leaf needs to do this while confirming the proposed options in P4.
- The answer locks are enforced in the Hub API only. A staff browser token can still update `client_selections` and `room_scope_items` directly through PostgREST. That predates this phase and the reviewer's probe confirmed it again.
- Portal issue, withdraw and return still take the item id from the request for the history entry. The SQL guards run on the row either way, so this can only mislabel a history line, and it needs a hand-built staff request.
- A free-text edit to an approved requirement still keeps the approval, as it always has. Only a typed answer change needs re-approval.

### Corrections after the independent review (2026-11-10)

The first version of this entry overstated several things. What it said, and what is true:

| First claim | Correction |
|---|---|
| "A real answer change on a locked row is refused" (same claim in `R03_TECHNICAL_GUIDE.md`) | Not true when written. An ordinary save could change what an Other answer said, which physical element an item covered, or its nature, on approved and baselined rows. Any answer change also got through with a re-spelled version or an item id that didn't own the row. All fixed below. |
| Locks cover "approved, ordered or baselined" rows | Read as every approved item. Client-approved rows in `room_scope_items` weren't guarded. Fixed for typed answers. |
| "survives ... portal projection, document input" | Overstated. The portal never receives the answer, only a title derived from labels. No document builder reads it, and the document tests only prove internal text stays out. A structured selection with no typed text still shows TBC. Outcome reworded. |
| Nothing listed as not done | Gate 0.2's CHECK has no evidence behind it. Added to Caveats. |

Fixed from the review:

| Finding | Fix |
|---|---|
| "Real change" was too narrow (blocker) | `materialOf` now also compares the words of an Other answer, `element.id`, a label that has no configured key behind it, and `nature`. Rewording a configured label stays non-material (superseded by the second review below: every word shown now counts). The 409s, the on-screen step-back and the room default fingerprint all read this one function. |
| Where Other text lives | In `selected[].label` on an open option (`OPEN_OPTION_IDS`: `other`, `other_zone`). No new field. A test fails if a new catch-all is added to the map without being declared open. |
| The lock checked a different row from the one written (major) | `saveProject` finds the stored row by `sync.rowId`, the row `register_apply` writes. A row it didn't load is refused as `missing`. An item id that doesn't own the row is refused with the new reason `item_mismatch`, on saves and deletes, so history can't be filed under the wrong item. |
| The lock depended on how the version was spelled (major) | The check now runs however the version is written. Only a strict ISO stamp for a different millisecond skips it, and `register_apply` refuses that as stale, so an honest stale screen still gets the three-way merge. |
| Approved requirements kept their approval (minor) | A client-approved row in `room_scope_items` now needs fresh evidence or a step back to Proposed when its answer really changes. The rule is one tested function, `editOutrunsApproval`, used by the screen. |

No migration. `PUT` can now return 409 `CONFLICT` with reason `item_mismatch`, and `missing` can come from the service as well as from `register_apply`.

Tests after the fixes:

| Level | What | Result |
|---|---|---|
| AUTOMATED | `node scripts/tests/register-structured-mapping.test.mjs`, adds open-option coverage | 50 passed, 0 failed |
| AUTOMATED | `node scripts/tests/register-structured-model.test.mjs`, adds Other text, element and zone identity, nature, room fingerprint, step-back | 123 passed, 0 failed |
| AUTOMATED | `node scripts/tests/register-structured-store.test.mjs`, adds re-spelled and unreadable versions, foreign ids, row id spelling, deletes, approved requirements, real staleness. In-memory stand-in for `register_apply`. | 77 passed, 0 failed |
| AUTOMATED, DB | `node scripts/tests/sandbox-register-structured.test.mjs`, adds each refusal through the real API, PostgREST and `register_apply`, with typed descriptions so the answer lock is what refuses. No history event filed under a forged id. | 102 passed, 0 failed |
| DB | The reviewer's probes `p3-review.mjs` and `p3-review2.mjs` run before and after the fix. Before: nine requests accepted with HTTP 200, and a confirmed room stayed confirmed after its default changed. After: all nine refused with 409, stored data unchanged, the room reads `changed`, controls unchanged. Saved in `SP/p3fix/`. | Refused as intended |
| AUTOMATED | `bash SP/run-tests.sh all` after `restart-api`: 26 suites | 1325 checks, 0 failing |
| AUTOMATED | Each of 18 protections removed in turn, files then restored byte for byte. Ad hoc script, not committed. | 18 of 18 failed a unit test, as intended |
| BROWSER | Not driven. No screen writes an answer yet. | Not verified |
| PRODUCTION | Not available in this workflow | Not verified |

`npm run lint` and `node --check` on `registerStore.mjs` pass. The production build was run as `vite build --mode production` with `vite.sandbox.config.mjs`, from the sandbox working directory and into the scratchpad, because `npm run build` would load the repo `.env`, which the brief forbids. It passes. None of these say anything about behaviour.

One existing assertion changed on purpose: the `register-structured-model` check that matched the old step-back condition in `useRegister.js` now confirms the hook calls `editOutrunsApproval`, and that function has its own behaviour tests. Nothing was weakened.

### Corrections after the second independent review (2026-11-10)

The second review ran new probes through the real sandbox API. Each claim below was checked before anything changed (output in `SP/p3fix2/pre-p1.txt` and `pre-p3.txt`). Commits: `a7a644e` (model, store, tests), `f4d655f` (answer map), and the docs commit carrying this update.

| Claim in this entry, the guide or the first fix report | What was true |
|---|---|
| "Rewording a configured label still doesn't count" | Wrong twice over. The rule protected nothing, because stored labels are only written when someone chooses an option, so a config rewording never reaches them. It also wasn't even: on an ordered selection with no typed text a reword was already refused, because `item_name` is built from the label. |
| "A real answer change on a locked row is refused", and "real means ... which element and zone it covers" | Not true for the words. Ordered and baselined rows accepted changed option words, a swapped `optionId`, changed zone words and a renamed element with HTTP 200, and the stored client view changed. "Front driveway" could become "Rear driveway" on a baselined row with an ordinary rename. |
| "Client-approved requirements now need fresh evidence or a step back" | Not in every case. A delete plus a re-insert with no `sync` in one request changed an approved requirement or selection and kept the approval. |
| "The lock now checks the row that actually gets written" | Only for changes carrying `sync.rowId`. A change with no `sync` skipped the guard and still wrote a replacement row. |
| The answer is lossless through the mappers | `makeItem` dropped a second Other answer on the same path, before any mapper ran, and could keep a flagged copy over the live entry. |
| W-023, M-003 and R-009 are the items affected by Tab 27 Q4 | W-022, R-014, V-005 and O-001 mapped "By client" straight to `by_others`, which `contractInclusionOf` reads as outside the contract. That pre-decided the open question. |

Fixed:

| Finding | Fix |
|---|---|
| The lock compared different fields from the ones people read (major) | `materialOf` now compares the option path plus the words shown for it (the same rule `clientSafeAnswer` uses), and the id, key and label of the element and zone. `normSelected` makes `optionId` the last step of the path, so a separate id can't change what is shown. |
| A second Other answer was lost (major) | On an open option the words are part of the de-duplication key. A bare "Other" and a blank label still count as one. For the same choice, a live entry replaces a flagged copy and keeps its place. |
| A save naming no row could replace a stored item (minor) | `saveProject` refuses a change with no `sync.rowId` whose id is already on the project, reason `exists`. `register_apply` already says `exists` in every case but the cross-store delete and re-insert. New items and real moves between stores are unaffected. |
| The room default fingerprint missed who supplies (minor) | `supplyBy` and `responsibility` are now part of it. No confirmation has been stored by a screen yet, so nothing needs re-confirming. |
| The map pre-decided Tab 27 Q4 (minor) | "By client" on those four now records who supplies only, as R-009 does, with a note on each. The map validator refuses a client-supply option that also sets a disposition. Added to `decisions_needed`. |

No migration. `PUT` can now return 409 `CONFLICT` with reason `exists` from the service as well as from `register_apply`.

Existing assertions changed on purpose, all made stricter or moved to the new rule: in `register-structured-model`, "a label wording change isn't", "a configured option that merely starts with 'other' keeps its label out of it", "renaming an element under its stable id isn't", "a keyed zone can be reworded" and "renaming the element under its id leaves the room confirmed"; in `register-structured-store` and `sandbox-register-structured`, "renaming the element under its id is still allowed". Each now asserts the opposite, because each described the gap the review found. The fixture gains two items with two Other answers each, one per store.

Tests after these fixes:

| Level | What | Result |
|---|---|---|
| AUTOMATED | `node scripts/tests/register-structured-mapping.test.mjs`, adds Tab 27 Q4 checks and one more damaged map refused | 56 passed, 0 failed |
| AUTOMATED | `node scripts/tests/register-structured-model.test.mjs`, adds path-decides-id, two Others, live over flagged, words shown as a change, fingerprint who-supplies | 142 passed, 0 failed |
| AUTOMATED | `node scripts/tests/register-structured-store.test.mjs`, adds words on ordered, baselined and approved rows, no-row saves in both directions, two Others through promotion. In-memory stand-in for `register_apply`. | 94 passed, 0 failed |
| AUTOMATED, DB | `node scripts/tests/sandbox-register-structured.test.mjs` after `restart-api`, adds each of those through the real API, PostgREST and `register_apply`, and reads the stored rows back | 117 passed, 0 failed |
| DB | The reviewer's probes `probes/r2/p1.mjs` and `p3.mjs` before and after. Before: the option, zone and element word changes on ordered and baselined rows, a swapped `optionId`, the approved reword and both cross-store swaps returned 200 and changed the stored data. After: each returns 409 with the stored data unchanged, except the swapped `optionId`, which still returns 200 but stores what the path names, so the client view doesn't move. Saved in `SP/p3fix2/`. | As intended |
| AUTOMATED | `bash SP/run-tests.sh all` after `restart-api`: 26 suites | 1382 checks, 0 failing |
| AUTOMATED | Each of 12 new protections removed in turn, files restored and confirmed by checksum. Ad hoc script, not committed (`SP/p3fix2/mutate.txt`). | 12 of 12 failed a unit test, as intended |
| BROWSER | Not driven. No screen writes an answer yet. | Not verified |
| PRODUCTION | Not available in this workflow | Not verified |

`npm run lint`, `node --check` on `registerStore.mjs` and `build-answer-map-doc.mjs --check` pass. The production build was run as `NODE_ENV=production vite build --mode production` with `vite.sandbox.config.mjs` from the sandbox working directory into the scratchpad, for the same reason as above. These say nothing about behaviour.

### Next dependency

P4a generates the choice trees from `tab21-answer-map-v1.0.json`, writes `item.answer` through `ProgressiveChoiceCard`, and recomputes `outstandingReasons` from `state` and `nature`. P4b adds the baseline config and calls `applyPricingAssumption`. P4d uses `confirmRoomDefaults` and `roomDefaultStatus`. P5 reads answers through `clientSafeAnswer` for every client-facing output.

---

## P4a — Question configuration and guided controls (2026-11-10)

**Outcome.** Staff answer configured questions by tapping, inside the existing rows. Every one of the 147 questions has an explicit handling. Site access, occupation, roof and cladding, flooring, doors, vanity and driveway choices need no typing. Changing an earlier answer never loses a later one. Outstanding is worked out from what the record says. A choice is a preference and cannot become an approval. Nothing here is deployed.

**Commits.** `912ce39` (config), `e3691d6` (logic and outstanding), `3643fb7` (card and screens), `ae6acc4` (phone width and more browser checks), and the docs commit carrying this entry.

### What changed

| Area | Now |
|---|---|
| Config | `ANSWER_CONFIG` generated from the answer map. Handling per question: 92 card, 9 typed record with owner, 35 office note, 2 Project step, 1 folded, 8 prefilled. Levels, option states and More detail flags added to the map. Generator throws if a question can't be answered meaningfully. |
| Option ids | Locked in `tab21-option-ids-v1.0.lock.json`. A test fails if one goes. Labels tested for length and for approval, certificate and price claims. |
| Card | `ProgressiveChoiceCard` inside `PromptRow`: option buttons with `aria-pressed` and a tick, follow-ups from the choice, Not decided, reason and owner, N/A, By others and Excluded on choices, optional staff note, + More detail, saved state. No new page or wizard. |
| Upstream changes | A dependent answer moves across if the new branch has the same option, else stays flagged, listed for Use again or Remove, and counts as outstanding. Typed words and answers with product details against them are kept too. Stale entries don't reach a client view. |
| + option | Gone. `appendOption` removed. P-005 priorities are ids, no longer a comma string. |
| Legacy | Older typed text stays under Written earlier, never parsed. An older work status the card doesn't show stays readable with a Clear. Custom items keep the typed row. An answer from a newer schema isn't edited. |
| Repeats | `RepeatRows`: + Add another on any question with a `repeat` config, each its own item with its own element id or zone. |
| Disposition | Questions with `dispositionUse: none` never write it. Office table shows Not scope on facts, risks, requirements and technical items. Office fields hide scope status, quantity and pricing on them. |
| Outstanding | See `R03_TECHNICAL_GUIDE.md` §5. |
| Office fields | Client status (with approval evidence), technical verification, product, pricing and the rest, unchanged in substance. Renamed from More on guided rows, so it isn't confused with + More detail. |

### Decisions within the brief

- **Answers added where the map had none:** W-006, W-023, K-013, M-003, H-003, H-006, R-013 and M-002. All marked `proposed` for Blue Leaf to confirm. M-002 (who engages consultants) is now a fact with no work disposition. M-004's options became actions so Excluded sets the disposition.
- **Certainty.** A choice moves `not_considered` to `preference` and nothing further. Without this, a selection made in a meeting would read as Not discussed.
- **Recorded `supplyBy` isn't an open decision.** The question "who supplies?" has been answered. `contractInclusionOf` still says `undecided`, so Tab 27 Q4 isn't pre-decided.
- **Not decided keeps what was chosen so far** (B02: a conversation may stop at any level). N/A does not: it flags what was chosen.
- **Group answers are labelled with their heading** ("Door height · 2340"), and tree answers with their path. A leaf alone ("Corrugated", "Laminate") doesn't say enough in a document.
- **`lastStep` persisted on a lead with no rooms.** It wasn't, so Continue reopened at Project.
- **Client Brief priorities read the answer.** The card replaced the only writer of that text.
- The rest of the document builders stay for P5.

### Schema and API impact

No migration. The next free number stays 218. No route changed. `npm run test:register-progressive` is new.

### Tests

| Level | What | Result |
|---|---|---|
| AUTOMATED | `node scripts/tests/register-progressive-choice.test.mjs`: config coverage by family, id lock, labels, every tap rule, every option path chosen and reloaded, outstanding | 166 passed, 0 failed |
| AUTOMATED | `node scripts/tests/register-progressive-render.test.mjs`: renders PromptRow for each question that can show, plus legacy, locked and repeat states | 46 passed, 0 failed |
| BROWSER, DB | `node scripts/tests/sandbox-register-guided.test.mjs`: headless Chromium, real SPA, API, PostgREST, Postgres. 1440 and 375 with touch. Taps, keyboard (Enter, Space, Tab, focus held), branch change, reload, Use again, external works, walls and floors repeating, Not decided, approval and step-back, Other and note typed key by key, priorities into the Client Brief PDF, office table, legacy text, vanity in a room, project-mode record, a real 409 merged. Evidence: `~/blh-register-evidence/r05/p4a/` | 67 passed, 0 failed, 0 page errors |
| AUTOMATED | `bash SP/run-tests.sh all` after `restart-api`: 29 suites | 1661 checks, 0 failing |
| AUTOMATED | Each of 21 protections removed in turn, files restored and confirmed by checksum. Ad hoc, not committed (`SP/p4a/mutate.txt`). First pass 19 of 21 caught. A test was added for each of the two missed, then all 21 failed a unit test, as intended | 21 of 21 |
| PRODUCTION | Not available in this workflow | Not verified |

`npm run lint` and `node --check` on `registerDocuments.mjs` pass. The production build was run as `NODE_ENV=production vite build --mode production` with `vite.sandbox.config.mjs`, from the sandbox working directory into the scratchpad, because `npm run build` would load the repo `.env`. It passes. None of these say anything about behaviour.

No existing test assertion changed.

### Caveats

- Blue Leaf hasn't confirmed the option lists. Everything marked `proposed` is a guess at sensible choices. So are the More detail flags. The Tab 27 Gate 0.2 CHECK against real client-meeting conversations is still open.
- Typed answers don't reach the Selections Schedule or most of the Client and Architect Briefs until P5. An item answered only on the card shows nothing there. Only priorities do.
- W-018 shows all its groups on one card, which is tall. W-014's gutters are in the config but not on the card. Zones repeat but don't yet feed rooms. W-004, W-006 and W-008 are still separate cards, each with its own config. The R-005 / W-017 inherited default still picks the first. These are P4b, P4c and P4d.
- `+ Add another` is generic. It doesn't stop two rows having the same zone or element.
- A hand-inserted scratchpad row with no `updatedAt` loops on 409, because `makeItem` gives it a new timestamp on every read. Found by a test seeding such a row; no screen writes one. Not fixed.
- At 375, the card is about 275 of the 375 pixels wide. The outer padding belongs to the lead page.
- The sandbox never exercised a locked item in a browser. The locked state is render-tested, and locks were tested through the API in P3.
- The browser run signs in with a session placed in browser storage, so the login form isn't exercised.
- The answer locks are enforced by the Hub API only, as P3 recorded.

### Corrections after the independent review (2026-11-10)

The first version of this entry overstated several things. What it said, and what is true:

| First claim | Correction |
|---|---|
| Works by keyboard and touch; "Enter, Space, Tab with focus held" | Tested on W-007 only, which isn't a repeat row. On every fresh repeat row the first key or tap rebuilt the row: focus dropped to the page and typing stopped after one character. Fixed, and now tested on W-011, W-010, W-003 and W-004. |
| "None are lost"; changing an earlier answer moves dependents across or keeps them flagged | Answering a repeat row in a later room destroyed the earlier room's record. W-005 restated an inspection status against a different hazard, with no flag. Both fixed. |
| No code path on the card can approve, verify or price | True of the fields written. But the card's N/A removed an outstanding verification with no evidence, leaving `technicalStatus` at `needs_verification`, and the report listed no such risk. Fixed. |
| Nothing left in the P4a section | Gate 2's keyboard CHECK wasn't met on repeat rows, and Tab 21's P-005 "plus note" had no writer. On any new record the note could not reach the Client Brief. Both fixed. |
| BROWSER: "Other and note typed key by key" | True only of rows that already existed. The first typed record row used `.fill()`, a single input event, which hid the truncation. Now key by key. |
| The `RepeatRows` comment: "answering it keeps focus where it was" | False as written. Now true, and the comment describes what the code does. |
| 9 typed records with owner | M-006 had no owner on the card: the control was gated on `action`. All 9 have one now. |
| "No existing test assertion changed" | True of the first pass. This pass changes two, on purpose, below. |

Confirmed by the review and still true: the generators are current, no migration, no push, the owner-untracked paths are untouched, no sideways scroll at 375.

**Commits.** `eb31f9b` (the rules behind the card), `4ea1e2b` (repeat rows on screen), a one-assertion test commit, and the docs commit carrying this section.

**What changed.**

| Finding | Severity | Fix |
|---|---|---|
| A repeat row in one room overwrote another room's record (17 room questions) | Blocker | `RoomsStep` keys rows by room and question, so nothing crosses rooms, including an approval half-entered on a single row. A used id is never offered again. `upsertItem` won't write through an id held by another room or question (`seedMatchesItem`): it starts a new record instead. |
| First input on a blank repeat row rebuilt it (12 typed cards, all 36 repeat cards for focus) | Major | Blank and saved rows are one keyed list. |
| A removed repeat row came back, and could lose an answer | Major | Same fix. Also, a sent id that neither the server nor the screen holds any more no longer repeats an empty save forever. That loop could also be reached by removing a room within the autosave window. |
| W-005 restated a status against another hazard | Major | `childrenBoundToParent` in the answer map, generated into the config. Only W-005 has it. W-014, K-004, B-004, B-006, D-004 and H-004 still carry a real attribute across. |
| Card N/A hid outstanding verification | Major | N/A closes the decision only. An item needing verification stays outstanding, the same as the office path and the base commit. Action-kind items never reported verification, and still don't. |
| P-005 note had no writer | Major | `answer.clientNote`: a named field, chosen over the description-after-`;` form so a leading `;` doesn't appear as the item's title, in the office table or as its goals line. It sits in `clientSafeAnswer`, counts as part of what the answer says (a change steps an approval back and is refused on a locked row), and is only stored when written, so existing answers keep their shape. An older record's words after `;` are still read. The card labels it as read by the client. |
| Use again could pass a limit | Minor | Refused, and not offered at the limit. Remove stays. |
| Not decided dead after W-007 Unsure | Minor | Taking it off also takes off the option that parks the question. |
| M-006 had no owner on the card | Minor | Shown for `handling: record`. Done stays on actions only. |

**Schema and API.** No migration. No route changed. `answer.clientNote` is one more key inside the existing `item.answer`. The option-id lock is unchanged: the answer map gained two flags, no ids.

**Tests changed on purpose.** Both encoded a defect, and the rule now says the opposite:

- `register-progressive-choice` "N/A drops a default verification too" is now "N/A is not evidence".
- `register-progressive-choice` "the Not decided pill leaves its state alone while the option stands" is now "taking Not decided back takes the Unsure option with it".

The browser suite's `.fill()` on W-011 is now key-by-key typing, and its W-010 first tap is now Enter with a focus check. Both are stronger. No assertion was weakened.

| Level | What | Result |
|---|---|---|
| AUTOMATED | `node scripts/tests/register-progressive-choice.test.mjs`: W-005 across all 90 category and status combinations, N/A and verification, limit, Not decided, client note including the approval step-back, seed check | 199 passed, 0 failed |
| AUTOMATED | `node scripts/tests/register-progressive-render.test.mjs`: owner on all 9 records, M-006 without Done, client note labelled and shown only on P-005 | 52 passed, 0 failed |
| BROWSER, DB | `node scripts/tests/sandbox-register-guided.test.mjs`, headless Chromium, real SPA, API, PostgREST, Postgres, 1440 and 375 with touch. Added: key-by-key typing and focus on fresh repeat rows, Enter focus on an element row, + Note and + More detail kept through the first input, × on the only row and on a second row, the PUT bodies, no repeating saves, reload, R-010 typed across two rooms, K-008 tapped through Save & next room, a panel not crossing rooms, removing a room with an unsaved edit, the client note and staff note in the Client Brief PDF. Evidence: `~/blh-register-evidence/r05/p4a/` | 99 passed, 0 failed, 0 page errors |
| AUTOMATED | `bash SP/run-tests.sh all` after `restart-api`, on the final code: 29 suites | 1732 checks, 0 failing |
| AUTOMATED | Each logic defect put back in turn against the unit suites, files restored and confirmed by checksum. Ad hoc, not committed (`SP/p4afix/mutate_unit.py`) | 13 of 13 caught |
| BROWSER | Each screen defect put back in turn against the browser suite, files restored and confirmed by checksum. Ad hoc (`SP/p4afix/mutate_browser.py`). Two lists; a used id offered again; rooms not keyed with the guard off; a single row not keyed by room; the empty-save loop; the Client Brief ignoring the note | 6 of 6 caught |
| PRODUCTION | Not available in this workflow | Not verified |

The reviewer's own probes (`SP/probes/p4a/unit1.mjs`, `browser1.mjs`, `browser4.mjs`) reproduced every finding before the fix.

`npm run lint` and `node --check server/lib/registerDocuments.mjs` pass. The production build was run the same way as above, from the sandbox working directory into the scratchpad, and passes. None of these say anything about behaviour.

**Caveats added.**

- An N/A item whose flag came only from the question's default also stays in the outstanding list until staff set Technical verification to Not required. It is listed in `decisions_needed`. No rule was invented.
- The note appears against the first priority, as it did before P4a. A note with no priorities chosen doesn't print.
- The fallback in `upsertItem` starts a new record if an id is held by another room or question. No screen can reach it now. It is a safety net, and only its check (`seedMatchesItem`) is tested. The hook itself isn't exercised down that path.
- A locked item still hasn't been driven in a browser. The render test covers it.

### Next dependency

P4b adds the baseline config, gutters as a linked item, zone-driven defaults and performance suggestions, on `toggleOption`, `chooseZone` and `RepeatRows`. P4c merges W-004, W-006 and W-008 presentation and uses `areaIds` and `sourceQuestionIds`, which the card doesn't write yet. P4d uses `confirmRoomDefaults` and the inherited summary. P5 reads answers through `clientSafeAnswer`.

### Second independent review (2026-11-10)

Four majors and three minors, all reproduced by the reviewer in the sandbox. All are fixed. None was wrong, though the suggested Needs pricing fix needed a guard: copied as written it would have priced recorded site facts (W-001, W-007, M-001, M-002 and M-006 are `itemKind: scope`).

**What the earlier entries said, and what is true.**

| Earlier claim | Correction |
|---|---|
| Technical guide: on `element` questions "the chosen option or action is the disposition". `registerChoice.js`: a tap can't reset an old record | On six supply-only questions (K-008, K-013, W-023, B-014, L-006, M-003) and the supply-only options of W-022, R-009, V-005 and M-004, no option has a disposition, and the first tap reset a recorded Included to Undecided. Fixed, and both now describe what the code does. |
| Decisions: "Recorded `supplyBy` isn't an open decision", and the report's "a recorded By client answers who supplies" | The code exempted every `supplyBy`. Blue Leaf and Trade answers were then in no Tender list at all. The exemption was also a rule nobody had decided while Tab 27 Q4 is open, which the brief forbids. Removed. |
| Caveats: until P5, a card-only answer "shows nothing" in the briefs, "only priorities do" | Incomplete. It left out the staff Tender view, where card-only items dropped off Needs pricing and the panel said every item had a reviewed price source. P5 doesn't cover that panel. Fixed here. Also inexact for the Client Brief: a card-only Included item prints there as a bare status line (`registerDocuments.mjs`). P5 still has to fix that. |
| SOP 21-01 step 3: "Nothing disappears by itself" | Not true of words typed on an Other zone or element. It is now. |

**Commits.** `988c540` (rules and config), `0248aac` (the card, the Tender view, per-item save label), and the docs commit carrying this section.

**What changed.**

| Finding | Severity | Fix |
|---|---|---|
| A who-supplies tap overwrote a recorded status | Major | `itemPatch` changes the disposition only when the option chosen carries one, or the option left set the one still on the item. Same test as `supplyBy` already used. N/A still writes and clears `na`. The card shows a status its pressed option doesn't say as Earlier work status, with Clear. |
| Any `supplyBy` closed the open decision | Major | Removed. A scope item still `undecided` stays `decision` whatever supply answer it holds, as at the base commit. It is listed in `decisions_needed`. No rule invented. |
| Needs pricing dropped card answers | Major | `hasPricingContent`: typed words, or a scope or choice answer. A fact (`contractInclusionOf` is `not_scope`) and N/A never count. The empty text now reads "No in-scope item is waiting for a price source." |
| Deferred, Existing to remain, finish and product invisible after reload | Major | `settleOptions` takes `current` and always offers the pill on the record, so it shows and a second tap undoes it. + More detail stays shut. Finish and product have their own line. A locked card can't show pills, so it writes the status out, with no Clear. |
| H-001 No stair lit a second N/A | Minor | `no_stair` now carries `state: not_applicable`, as R-003's N/A does, so there is no separate pill. Option ids unchanged. The map check refuses an option that means N/A without that state. An older N/A on a question with its own N/A option now stays readable. |
| Words on an Other zone or element lost on replace | Minor | Kept flagged in `answer.selected`, under a `_zone` or `_element` path that no option has. Listed under Check these with Remove and no Use again, and the item counts as outstanding. W-013 has an `other` zone and an `other` option, which is why the path isn't the bare id. |
| Every touched card showed the register-wide save state | Minor | `saveStateOf(id)` in `useRegister`: refused or changed elsewhere for that item until it is edited again, otherwise waiting if it has unsaved edits, otherwise saved. The header badge is unchanged. |

**Schema and API.** No migration. No route changed. `GET /tender` returns the same shape and lists more items under `needsPricing` and `unresolved`. The option-id lock is unchanged: one state flag added to the map.

**Tests changed on purpose.** One. `register-progressive-choice` "By client is an answer to who supplies, not an open question" encoded the rule the reviewer showed was invented. It is now "who supplies doesn't close the scope decision while Tab 27 Q4 is open", for all four supply answers. No other assertion changed.

| Level | What | Result |
|---|---|---|
| AUTOMATED | `node scripts/tests/register-progressive-choice.test.mjs`: all 29 no-status options against a recorded status, moving between suppliers, N/A and undo, leaving an answer that set the status, a status changed by hand, the settle pill on the record, words on Other zones and elements, H-001 and the map check, supply answers and the open decision | 240 passed, 0 failed |
| AUTOMATED | `node scripts/tests/register-progressive-render.test.mjs`: Deferred and Existing to remain lit with More detail shut, a status the option doesn't say, finish and product line, H-001 with no second N/A, a locked card's status, words kept under Check these | 65 passed, 0 failed |
| BROWSER, DB | `node scripts/tests/sandbox-register-guided.test.mjs`, headless Chromium, real SPA, API, PostgREST, Postgres. Added: one tap on Client keeps Included through a read-back; Deferred and a finish after a real reload and the undo; H-001; every Tender list for each of the four supply answers, card answers, a site fact and N/A through the real API, and the Tender step on screen; a refused save on an issued selection labelling only its own card. Evidence: `~/blh-register-evidence/r05/p4a/` | 128 passed, 0 failed, 0 page errors |
| AUTOMATED | `bash SP/run-tests.sh all` after `restart-api`, on the final code: 29 suites (log `SP/p4afix/final-tests-r2.txt`) | 1815 checks, 0 failing |
| AUTOMATED | Each logic and card defect put back in turn against the unit suites, files restored and confirmed by checksum. Ad hoc, not committed (`SP/p4afix/mutate2.py unit`) | 15 of 15 caught |
| BROWSER, DB | The same for the Needs pricing filter, the save label and the fact guard against the browser suite. Ad hoc (`SP/p4afix/mutate2.py browser`) | 2 runs, 3 defects, all caught |
| PRODUCTION | Not available in this workflow | Not verified |

`npm run lint`, `node --check` on `registerHandover.mjs` and `build-answer-map-doc.mjs`, and both generator `--check` runs pass. The production build was run the same way as above, from the sandbox working directory into the scratchpad, and passes. None of these say anything about behaviour.

**Caveats added.**

- An item answered only with who supplies stays on the outstanding list and under Unresolved until someone sets Scope / disposition in Office fields, and the card has no control for that. It is the base behaviour, and it will read longer than staff expect on appliance-heavy rooms. A client- or others-supplied item appears under both By others and Unresolved.
- Until P5, the Selections Schedule and most of the briefs don't print card-only answers, and a card-only Included item prints in the Client Brief as a bare status line. Nothing should be issued from card answers before P5. The staff Tender view does read them now.
- Words kept from an Other zone or element can be removed but not brought back with a tap. To use them again, tap Other and retype.

---

## P4b — Whole House (2026-11-10)

**Outcome.** Whole House now captures the standards a home is built on, mostly by tapping. Several wall and roof systems can sit side by side, each with its own zone and status, and gutters are their own record under the roof. Floors, paint, kitchen, wet-area and laundry standards have one row per zone, so the zone takes no tap, and rooms read the default for their type. Performance goals list staff-only suggestions marked Review required, none stored and none a product. A staff-only pricing guide gives the estimator a labelled assumption where nothing is chosen, and can't touch a choice. Document builders don't read these answers until P5. Nothing here is deployed.

**Commits.** `7a355a6` (config, logic and answer map), `27cc11c` (screens, API and tests), and the docs commit carrying this entry.

### What changed

| Area | Now |
|---|---|
| Walls (W-013) | Unchanged in shape. Several rows, each with its zone. Metal cladding added. |
| Roof (W-014) | Zones added: main, alfresco or verandah, garage, other. Each profile takes a colour tone. A pitched main roof and a low-pitch alfresco are two records. |
| Gutters | `cfg.linked` was in the config but not on the card. Now a separate selection under each saved roof, one per roof, `answer.element.key` `gutters`, `answer.linkedItemIds` the roof, `isDefault` false. A gutter whose roof is deleted stays on the page. |
| Windows (W-015) | Frame colour added. Opening style behind + More detail. No label claims compliance. |
| Envelope (W-016) | Goals only are stored. `performanceSuggestions(answer)` derives a staff-only list, marked Review required. It names the checks to confirm and says a Passive House target is an intent. Nothing is copied to another card. Technical status stays Needs verification until someone records evidence. |
| Floors (W-017) | One row per zone, no zone tap. Each family can take a finish. Rooms read their zone: bedrooms and robes the bedroom floor, laundries the wet-area floor, garages nothing, others the main floor. |
| Doors (W-018) | One record. Height, jamb and hardware first; the rest behind + More detail. Fire, acoustic and height exceptions on R-007. |
| Paint and ceilings (W-019) | One row per surface. Palette, ceiling types and feature areas show only on the surfaces they apply to. No generic sheen chip: a finish level exists only under a surface, behind + More detail. Each surface states its usual finish. Shown, never recorded. |
| Shared standards (B03) | K-004, K-005, K-006, B-003, B-004, B-008, B-009, L-003 are set once on Whole House, by zone, under their existing ids. No new question id: `QUESTIONS` stays at 147. Kitchen, Bathroom and Laundry are laid out; + Scullery, + General joinery, + Ensuite, + Powder / WC and + Mudroom are a tap away. |
| Room defaults | `roomDefaultFor`. A scullery reads its own standard, then the kitchen's. An ensuite its own, then the bathroom's. A default with nothing chosen can't be inherited. An exception records no zone, and stays on screen if a closer default appears later. L-004 reads the W-017 wet-area zone. |
| Inclusions (W-022, W-023) | By others added, Other element added, owner on the card. |
| Pricing guide (B05) | End of Whole House, after the client's direction. Project guide, plus an independent tier per category. Stored in `meta.baseline`. The screen can only write meta. A labelled line appears on an unanswered row, as a chip in the Register, and in Tender. |
| Baseline config | `src/lib/registerGuidance.js`, versioned, no admin screen. Wording is copied when a tier is chosen. Marked Draft on screen until Blue Leaf confirms it. |

### Decisions within the brief

- **Standards reuse the K, B and L ids** rather than adding questions, as Gate 3.2 asks where practical. The option trees then match the room card, so a room exception needs no translation.
- **The tier lives in register meta, not on items.** Stamping items would mean creating records for things nobody discussed, some in `client_selections`, and two copies that could disagree. `assumptionFor` runs P3's `applyPricingAssumption` and `activeAssumption` over the stored assumption without saving the result.
- **The project guide moves nothing by itself** (B05). One explicit button copies it to categories with no tier and something still to price.
- **Waterproofing, insulation and the performance goals are not in the guide** (B04).
- **Roof zones were missing.** `repeat.by` said zone, but W-014 had no zones to tell two roofs apart.
- **W-018 no longer repeats.** It had `repeat.by: element` with no elements, so + Add another made an identical card. The groups are its separate defaults.
- **`roomDefaultFor` no longer falls back to any default.** The old `defaultItemFor` first-match gave a bedroom the main floor.

### Schema and API impact

No migration. The next free number stays 218. `meta.baseline` is new inside the existing lead meta row and `projects.register_meta`. `GET /tender` adds `assumptions[]`. No route added. Option ids only added: the lock grew, nothing was removed or renamed. The answer map gains `standard`, `roomZones`, `repeat.eachZone`, `repeat.owner`, `onlyZones`, `needsZone`, `usual`, `usualGroup`, `childHeading` and `reviewSuggestions`, each validated.

### Tests

| Level | What | Result |
|---|---|---|
| AUTOMATED | `node scripts/tests/register-progressive-wholehouse.test.mjs`: systems and gutters, doors, surfaces, standards, every room type's default, what the guide holds, what it can never do, what estimators read, performance suggestions | 143 passed, 0 failed |
| AUTOMATED | `node scripts/tests/register-progressive-render.test.mjs`, adds zone rows, the once-only question text, gutters, the labelled assumption, a standard inside a room | 75 passed, 0 failed |
| AUTOMATED | `node scripts/tests/register-progressive-choice.test.mjs` | 241 passed, 0 failed |
| AUTOMATED | `node scripts/tests/register-structured-mapping.test.mjs`, adds nine damaged maps refused | 65 passed, 0 failed |
| BROWSER, DB | `node scripts/tests/sandbox-register-wholehouse.test.mjs`, headless Chromium, real SPA, API, PostgREST, Postgres, 1440 and 375 with touch. Mixed AAC and feature cladding, flat and pitched roofs, linked gutters, main and bedroom floors, kitchen and scullery, bathroom and ensuite, an exception surviving a later closer default, paint by surface, performance suggestions, the pricing guide, Tender, reload, three document previews, promotion, a project-mode save, a client token. Evidence: `~/blh-register-evidence/r05/p4b/` | 126 passed, 0 failed, 0 page errors |
| BROWSER, DB | `node scripts/tests/sandbox-register-guided.test.mjs`, updated for the zone rows | 128 passed, 0 failed |
| AUTOMATED | `bash SP/run-tests.sh all` after `restart-api`, on the final code: 31 suites (log `SP/p4b/final-tests-3.txt`) | 2104 checks, 0 failing |
| AUTOMATED | The same command one run earlier (`SP/p4b/final-tests-2.txt`), on application code that differs only by the gutter row's + Add another: every suite passed except `documents-r01`, T10, 12 of 13. That failure is explained under Caveats and is not from this phase | 1 suite failing |
| AUTOMATED | Each of 25 logic, config and label defects put back in turn against the unit suites, files restored and confirmed by checksum. Ad hoc, not committed (`SP/p4b/mutate.py`) | 25 of 25 caught |
| BROWSER, DB | The same for four server and room-screen defects against the browser suite (`SP/p4b/mutate_browser.py`, `mutate_browser2.py`). The first pass missed one: an exception disappearing when a closer default appears, because the test changed an existing default instead. A test was added and it was then caught | 4 of 4 |
| PRODUCTION | Not available in this workflow | Not verified |

`npm run lint`, `node --check` on `registerStore.mjs`, `registerHandover.mjs` and both generators, and both generator `--check` runs pass. The production build was run as `NODE_ENV=production vite build --mode production` with `vite.sandbox.config.mjs`, from the sandbox working directory into the scratchpad, because `npm run build` would load the repo `.env`. It passes. None of these say anything about behaviour.

**Tests changed on purpose.**

- `register-structured-mapping` and `register-progressive-choice`, "paint has no generic sheen": each said no option may contain the word sheen. A finish level per surface is now required by MR-UX-01G, so each now says every sheen option sits in the one group that needs a surface, and it can't be offered with no surface even with More detail open. Stricter on what MR-UX-01G actually forbids.
- `register-progressive-choice`, the id-lock helper, now reads standard zones and linked options as well.
- `sandbox-register-guided`: floors and paint no longer have a zone to tap or + Add another, so those steps tap the row for the zone. The legacy-text row is found by its Written earlier box. The phone test's two paint taps are now on two surfaces, so its last assertion expects two records.

No assertion was weakened.

### Caveats

- Blue Leaf hasn't confirmed the tier wording, the usual finishes, the colour tones, frame colours, flooring finishes, opening styles or the review suggestions. All are proposed. The Tab 27 Gate 0.2 CHECK against real meetings stays open.
- Until P5, card answers, gutters and whole-house standards don't print properly in the Selections Schedule or the briefs. Nothing should be issued from them yet. Previews render, and none contains the tier wording or a suggestion.
- No catalogue exists for the dependent manufacturer and colour dropdown in MR-UX-01B. Colour tone is a tap. Product and finish remain typed under + More detail.
- General joinery is recorded as a K-004 standard, but no room prompt reads it yet.
- The W-017 wet-area default is read by laundries only. B-009 asks about tile extent, a different question, so bathrooms don't show it.
- R-006 reads the walls default, then the ceiling's. The compact inherited summary across surfaces is P4d.
- Inherited defaults still show row by row. Confirm room defaults is P4d.
- A tier on a category the client has fully chosen is held but unused. It applies again if a row is later left unanswered.
- The assumption line shows on Whole House rows, the Register and Tender. Room cards don't show it yet.
- The client-token check on `projects.register_meta` is sandbox RLS only. On production it depends on the same `deny_clients` policy as the rest of the portal hardening.
- **`documents-r01` T10 is intermittent and predates this phase.** It failed once in a full run here and once in three reruns of that suite alone, then passed 24 of 24. T10 renders the same document twice and compares bytes. `generate()` in `docTemplates.mjs` stamps each zip entry with the time, at two-second resolution, so the bytes differ when the two renders straddle a boundary. Confirmed by moving only the clock two seconds between renders: 18 bytes differ, same length, every entry's content identical. No file T10 imports changed in this phase, so it was not fixed here and the assertion was left alone. P5 should fix it, because that phase owns issue and immutable history: nothing that compares rendered DOCX bytes should rely on them being reproducible until it is.
- The browser run signs in with a session placed in browser storage, so the login form isn't exercised.

### Next dependency

P4c merges W-004, W-006 and W-008 presentation and uses `areaIds`. P4d uses `roomDefaultFor`, `confirmRoomDefaults` and the inherited summary. P5 prints answers through `clientSafeAnswer`, adds gutters and standards, decides whether a surface's usual finish prints, and reads `baselineAssumptions` and `performanceSuggestions` for Tender Notes only.
