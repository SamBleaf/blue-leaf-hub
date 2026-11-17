# Register and architect's brief: build contract and log

17 November 2026. The owner agreed all six decisions on the screens canvas ("agree with all 6 recommendations - go ahead and build").
- Spec: `docs/documents/REGISTER_SCREENS_SPEC.md`. Where this file and the spec differ, the spec's "Corrections found while drawing" win, then this file.
- Branch: `register-brief-r01`, cut from `doc-suite-r01` and merged with `origin/main` (3647c39).
- **Release gate:** this branch can't ship before the Lato-on-Railway check, like the rest of the document suite.

## Owner decisions (17 Nov 2026)

1. **Budget.** The client's budget band prints only when "Confirmed with the client" is ticked; otherwise the brief says "To be confirmed by Blue Leaf".
   - Bands, ex GST: Under $400k · $400k–$600k · $600k–$800k · $800k–$1m · $1m–$1.5m · Over $1.5m.
   - This is the one line allowed to hold dollars (`BUDGET_BAND_RX`).
2. **Story gaps.** A missing vision or must-haves only warns; it never blocks issue.
3. **Minor rooms.** "Nothing special: standard room" counts as a room brief. It writes "Standard <room type>; no special requirements."
4. **"Altered"** is a work word. It reads as disposition `alter`.
5. **Selections that affect the drawings:** door height, ceilings, cladding and main walls, roof and gutters, windows and sliders, fireplace and TV wall, wet-area set-out, laundry and kitchen joinery layout, driveway, fencing, retaining and pool. This is the `DRAWING_IMPACT` list.
6. **Architect.** The architect's name is kept in one place: the design-team contact on the lead and job.

## Done

**Phase B and the server side of A3** (`b16adcf`).
- `src/lib/briefModel.js`
- `src/lib/registerQuality.js`
- adb-2.0 template and payload
- Release blockers with targets
- The `actionRole` and `actionDue` fields
- The "Altered" scope
- The issue fingerprint
- The real-job fixture
- Tests

**Screens: checkpoint** (`a776786`). Built by three builders and the lead:
- The project
- Rooms and the room screen
- Needs action and the Actions list
- Documents and the edit drawer
- The new frame

**Fix round 1** (`3953d8c`).
- Four browser checkers drove the real job in the loopback sandbox at phone, tablet, Hub column and Expand widths.
- Three code reviewers read it, one each for the spec, data integrity, and copy and accessibility.
- Triage confirmed 61 findings (3 blockers, 14 major, 32 minor, 12 polish), all fixed by six fixers.
- Re-checked in the browser: Documents 20/20; screens 29/33. The rest went to round 2.

**Fix round 2** (8 regressions plus the 4 left over).
- Fixes:
  - The register's "on screen" flag is no longer stuck, so the body flags turn on.
  - Typing an approved record's words back restores the approval.
  - Floors carry over when a screen doesn't send them.
  - The meta revision after a save.
  - Re-check never wipes stored values, and says when it skipped.
  - Delete-all and Undo keep the original ids.
  - Open work never prints as settled.
  - The design-team reuse rules.
  - A practice name becomes a company-only contact.
  - Phone layout and target sizes.
- Re-checked in the browser: 22/22.
- Round 3 fixes what round 2 introduced (2 medium, 6 low), plus the CRM view so firm-only contacts show their firm's name.

**SOPs** (CLAUDE.md law).
- 21-01 v2.0 (22 test cases)
- 21-02 v2.0 (12)
- 21-03 v2.0 (20)
- 21-05 v1.0, new (16)
- SOP_INDEX and SOP_CHANGELOG updated
- Every step and test case checked against the code

## Decisions taken by the lead (17 Nov 2026; for the owner to confirm or overrule)

- **D1** The brief's cover lines (Site, Client, Project) stay read-only in the edit drawer, with "Change in Sales ›". They are canonical Sales facts with geocoding side effects.
- **D2** A choice row's ⋯ menu follows S3: Not decided yet · Not needed here · Note for the office · Product details… · Remove answer. By others, Excluded, Deferred and Existing to remain move into Product details and the Register table.
- **D3** Blue Leaf's own follow-ups are our list and don't print in the architect's brief. The client's brief still lists them under "Decisions to make" (its design is locked), and the ⚑ footnote says exactly that.
- **D4** One combined note prints: "(agreed with the client; for consultant review)".
- **Lead header.** While a capture tab is open, the lead header and the project bar scroll away at every width. Otherwise they would collide with the register's own sticky bars.

## Still open (owner)

- **Page count.** The architect's brief on the real job runs to 3 pages, with 05 alone on page 3. Getting it to 2 needs tighter spacing in the shared document design system, which affects every document. Owner sign-off needed.
- **`jobs.architect_name`.** It is still writable from the fee-proposal wizard and the job PATCH (decision 6 says one place). Make the wizard field read-only, or route it through the design-team contact?
- **Chip size on a tablet.** Chips are 44 px on a tablet; the drawing shows 40 px.
- **House-strip wording.** The strip summary's wording differs from the artboard ("Floor: timber, engineered" against "engineered timber").
- **Spec copy.** REGISTER_SCREENS_SPEC.md S4 footnotes still say "Decisions we need from you" and "Our list only — doesn't print". The code says "Decisions to make", and the Blue Leaf footnote names the client brief.

## Known issues to clear before release (round 4 review, 17 Nov)

1. **Medium.** Deleting a record while the save that creates it is still in flight brings it back, and it stays stored (`useRegister.js` ~:288; the record isn't in the base yet, so no delete is queued).
2. **Medium.** Naming the same person, with the same firm and phone, in a second consultant discipline creates a duplicate CRM contact (`projectStory.js` ~:546, where the roster check applies to every consultant row). It fails safe: a duplicate, never a merge.
3. **Low.** Undo after the version refresh can write this screen's older copy over another screen's edit without a conflict (`useRegister.js` ~:396; `registerMerge` planUndelete).
4. **Low.** In project mode, baselined selections count as movable, so a renumber can rewrite a baselined row's sort_order (`registerStore.mjs` ~:292; the scope table already checks baselined_at).
5. **Low.** A record put back by Undo and then restored from the device draft after a reload goes to the end (`registerMerge.js` ~:123; `placeBack` is cleared on load).

Also worth a ticket: a record moved between client_selections and room_scope_items gets sort_order 0 and jumps to the top.

## Release notes

- Ship step 1 of "Altered" (`fix/room-scope-keep-unknown`, `ee55a1d`, off main) a few days before this branch.
- The document-suite release gate (Lato on Railway) still applies.
- Migrations: none for C1–C5. Round 3 adds one additive view migration (v_crm_people shows a firm-only contact's company), written and not applied.
- **Deploy effects:**
  - The issue fingerprint now includes room fields and facts, so a preview taken before deploy is refused once at issue.
  - A gateway 5xx save now retries every 5 s.
- **Stale sandbox suites.** The sandbox e2e suites (`scripts/tests/sandbox-register-*`, register-e2e) target the pre-rebuild screens and need rewriting before they're run again.
- **Tests.** `npm run test:register-rebuild` runs the new suites.

## Shared modules (use these; don't re-derive rules in components)

**`src/lib/briefModel.js`**
- `openPoints(reg, context, { scope: "next_issue" | "all" })` returns `[{ ids, item, subject, label, place: { key, label, kind }, who: { key, label }, due, by, ask, text, held, nextIssue, inOut }]`, grouped in print order (`WHO_ORDER`, `WHO_GROUP_LABEL`).
- `roomRow(reg, context, room)` returns `{ text, brief, placeholder, work, ids, held }`. This is the "How this room reads" line.
- `architectBriefModel(reg, context, { recipientName })` and `architectBriefLines(model, cover)` give the exact printed lines, each with `ids` and `source: { kind, key }`.
- Helpers:
  - `whoOf`, `dueLabel`
  - `disagreeingScope(reg, room)`: the earlier-answer banner
  - `scopeAgrees`
  - `roomBriefRecord(reg, room)`, `hasRoomBrief`
  - `isUnfinished`, `heldBackReason`, `HELD_BACK_WORDS`
  - `labelOf`, `placeOf`, `chipWords`, `recordWords`, `drawingImpactOf`
  - `BUDGET_BANDS`, `budgetWords`, `floorLabel`, `namedArchitect`, `designTeam`

**`src/lib/registerQuality.js`**
- `contentChecks(docType, reg, context, model, { keepIds })` returns `[{ key, text, targets: [{ kind, id?, key? }], action? }]`.
- `releaseBlockers(docType, reg, { recipientName, drawingBasis })`: the pure release blockers the server also uses.
- `restrictedGuidance` (in `registerQuality.js`).
- In `briefModel.js`: `openPoints(…, { merge })`, `briefSectionTitles(model)`, `offeredChipWords`, `budgetInverted`.
- In `registerMerge.js`: `approvalStep`, `approvalRestore`, `planUndelete`, `metaAfterSave`.
- In `useRegister.js`: `undeleteItem` in the store; `useShown`, `watchShown`.
- In `src/lib/overlayFlag.js`: `useBodyFlag`, `useEscapeLayer`.
- In `useRoomUi.js`: `useDialogFocus`.
- `src/lib/sectionLayout.js`: the Throughout and Site layout.
- `roomsNeedingBrief(reg)`, `roomBriefBlocker(reg)`, `upperFloorHint(reg)`.

**`src/lib/register.js` lists:**
- `ROOM_SCOPES` (labels: New · Renovated · Altered · No change · Not in this job), `ROOM_WORK_WORDS`, `ROOM_SCOPES_WITH_WORK`, `ROOM_SCOPE_DISPOSITION`
- `ACTION_ROLES`, `ACTION_DUE`, `normaliseActionDue`
- `HIDDEN_ROOM_SCOPE_PROMPTS`, `ROOM_BRIEF_PROMPT` (R-004), `ROOM_MUST_HAVES` (by room type), `ROOM_BRIEF_PROMPTS`
- `HIDDEN_SITE_PROMPTS` (W-007), `ROOM_USED_BY`, `DRAWING_IMPACT`, `HIDDEN_OPTION_IDS` (K-005 engineered stone: never a chip)

**Item fields.** `responsibility` is the one "who". `actionRole` applies only when responsibility is `consultant`. `actionDue` is `next_issue`, `next_meeting`, a `YYYY-MM-DD` date, or empty. `nextAction` and `resolved` are unchanged.

**The room brief** is the room's R-004 record. Create it with `upsertItem(seed, partial)`, where the seed is `{ roomId, promptKey: "R-004", itemKind: "requirement", category: "layout", section: "room" }`. Its fields:
- `description`: the sentence
- `answer.connectsTo`: room ids or `"outside"`
- `answer.usedBy`: `ROOM_USED_BY` keys
- `quantity` and `unit: "m²"`: the rough size

Always keep `answer.v: 1`.

## Store API (from `useRegister`, passed down by `RegisterWorkshop`)

- `reg` (`{ meta, items }`)
- `updateItem(id, partial)`
- `addItem(item) → item`
- `upsertItem(seed, partial)`
- `deleteItem(id)`
- `replaceItems(fn)`, for bulk changes (a floor move, a delete-all)
- `mutateMeta(partial)`: rooms live in `meta.rooms`
- `saveStateOf(id)`
- `flush()`, `flushAll()`

Also passed down:
- `patchLead(partial)`: `PATCH /api/sales/leads/:id`, then the context reloads
- `reloadContext()`
- `actor` (`profile`)
- `onPortalItem`

## Components and who owns them

| File | Owner | Covers |
|---|---|---|
| `ProjectStep.jsx` (new), `StoryFields.jsx` (new), `DesignTeamCard.jsx` (new) + server design-team endpoint, lead PATCH validation, facts PUT, context roster merge, LeadDetail stage list | builder P | S1, C3, C6 |
| `RoomsList.jsx` (new), `RoomScreen.jsx` (new), `RoomBriefCard.jsx` (new), `ChoiceRow.jsx` (new), `HouseStrip.jsx` (new) | builder R | S2, S3, S3p, C1, C2, C4 |
| `NeedsAction.jsx` (new), `ActionsPanel.jsx` (new), the ⚑ added to `PromptRow.jsx`, "Not finished" label in `RegisterTable.jsx` | builder A | S4, C5 |
| `DocumentsStep.jsx`, `EditDrawer.jsx` (new), `RegisterWorkshop.jsx` (tabs, frame, Actions pill, wiring) | lead | S5, A2, A3, integration |

### Interfaces each builder exports

**`StoryFields.jsx`**
- `export default function StoryFields({ context, patchLead, readOnly, fields })`: the client's story and budget fields, saving through `patchLead`. `fields` optionally limits which fields show, from `["vision", "must_haves", "concern", "priorities", "budget", "confirmed", "paying", "start", "excited"]`.
- Also exports `BUDGET_FIELD_KEYS`.

**`DesignTeamCard.jsx`**
- `export default function DesignTeamCard({ lead, context, reloadContext, readOnly })`
- `export function NameArchitectPanel({ lead, context, onSaved, role = "architect" })`: search people and firms, or "+ Add someone new". Saves through `POST /api/sales/leads/:id/design-team`.

**`ProjectStep.jsx`**
- `export default function ProjectStep({ reg, context, lead, stage, actor, patchLead, reloadContext, setDeliveryModel, mutateMeta, upsertItem, updateItem, deleteItem, addItem, saveState, focusKey })`

**`RoomBriefCard.jsx`**
- `export default function RoomBriefCard({ reg, room, context, upsertItem, updateItem, deleteItem, mutateMeta, readOnly, compact })`: Work control, earlier-answer banner, floor chips, "What must this room do?", the quick chip, Connects to, must-haves, who uses it and rough size, and "How this room reads".
- Also exports `WorkControl({ room, onChange, readOnly })`, `EarlierAnswerBanner({ reg, room, mutateMeta, deleteItem, readOnly })` and `FloorChips({ reg, room, mutateMeta, readOnly })`.

**`RoomsList.jsx`**
- `export default function RoomsList({ reg, context, mutateMeta, replaceItems, openRoom, readOnly, startTickMode })`

**`RoomScreen.jsx`**
- `export default function RoomScreen({ reg, context, stage, roomId, actor, upsertItem, updateItem, deleteItem, addItem, replaceItems, mutateMeta, saveState, onPortalItem, flush, onBack, onOpenRoom })`

**`NeedsAction.jsx`**
- `export function NeedsActionFlag({ reg, context, item, seed, updateItem, upsertItem, readOnly })`: the ⚑ (44 px) and, once set, its pill. It opens the sheet. `seed` creates the record when there isn't one yet.
- `export function NeedsActionSheet(...)` is the sheet itself.

**`ActionsPanel.jsx`**
- `export default function ActionsPanel({ reg, context, updateItem, upsertItem, addItem, onOpenRecord, onClose, initialFilter })`

## Rules for every builder

- **Plain English on screen.** No question codes (K-001) and no system words. Copy comes from the spec and the canvas artboards (`…/scratchpad/adbreview/canvas/project/*.dc.html`).
- **Design and touch targets.** Use the Tailwind tokens (`primary`, `accent`, `warning`, `ink`, `muted`, `hairline`, `page`, `rounded-card`). Targets are at least 44 px. Phone inputs are 16 px, so iOS doesn't zoom.
- **No hidden data.** A hidden question that has a record still shows (as the banner, or under "Other things recorded here").
- **Per-viewer conveniences** go in `localStorage`, wrapped in try/catch.
- **Lint.** `npx eslint <your files>` must pass with zero warnings.
- **Don't touch:** files another builder owns; `RegisterWorkshop.jsx`; `.env`.
- **Don't run:** git commits, dev servers, or e2e/playwright/batch-a suites (they target production).
- **Node tests** for pure helpers go in `scripts/tests/`.

## Round 5 (18 Nov): owner answers built, known issues cleared

- **Group by room.** `openPoints` adds `roomText`; `architectBriefModel` sends a point on a printing room into that room's row (`roomRow(..., { roomPoints })`, `row.open`), printed "Open: [what] Who: [who], by [when].". 03 keeps whole-house and site points only. Single-room drawing-impact selections already print in the room's row (a record on the room, or a house default that reaches exactly one room). Real job: 03 has 7 points, 36 lines; the laundry's row carries its open point. Needs action's ⚑ footnote names the room's row for a room record.
- **Architect name changed elsewhere.** `server/lib/architectNameSync.mjs` flags a typed name that differs from the design team's architect. The job PATCH (RFQ Engine) no longer writes `jobs.architect_name` in that case and returns `architectNameFlag`; the Fee Proposal wizard asks `POST /api/jobs/:id/architect-name-check` on Save. `src/lib/architectNameAsk.js` asks "Change it everywhere?"; yes = the design-team save with `replaces`. No = nothing changes. This closes the open `jobs.architect_name` question.
- **Known issues.** K1 delete during the creating save (`useRegister` `sendingNew`/`lateDeleted`); K2 same person, firm and phone in a second discipline (`sameNamedOnJob`); K3 Undo merges a newer server copy (`planUndelete` `base`); K4 baselined selections not movable (`selectionRowMovable`); K5 a draft-restored record keeps its place (`registerDraftOf` `after`, `planRegisterRestore` `addedIds`). Ticket still open: a record moved between client_selections and room_scope_items gets sort_order 0.
- Tests: `npm run test:register-rebuild` (adds `register-architect-name`). SOPs: 21-01, 21-03 (TC-20, TC-21).

## Still to do

1. Clear the known issues above (one small round), then a last browser pass.
2. The owner reviews the screens on the real job (the sandbox walkthrough screenshots) and answers the "Still open" questions.
3. Push the branch only with the owner's OK. Release after the Lato gate and step 1 of "Altered".
4. Later (documented, not in this release):
   - The client brief, the tender notes and the baseline print each room's scope from `room.scope`.
   - Rewrite the sandbox e2e suites for the new screens.

## Owner answers, 17 Nov (late)

- **D1–D4:** agreed.
- **Page count:** 3 pages is fine.
- **To build: group by room.** All the info for a room goes in its row in 04: its open points, with Who and By, and its single-room selections. 03 keeps only whole-house and site points.
- **Architect name changed elsewhere:** flag it and ask "Change it everywhere?".
- **Chips:** 44 px on a tablet is fine.
- **Then:** clear the 5 known issues.
