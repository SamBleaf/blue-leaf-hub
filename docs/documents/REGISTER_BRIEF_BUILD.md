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
- `contentChecks(docType, reg, context, model)` returns `[{ key, text, targets: [{ kind, id?, key? }], action? }]`.
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

## Still to do (lead)

1. Documents step (S5): the red and amber boxes with Fix buttons, the "What will print" list, "Not in this brief", the edit drawer, the stale overlay, and the issue bar.
2. `RegisterWorkshop` integration:
   - tabs: The project · Rooms · Throughout · Site & existing · Documents | Register · Tender
   - the Actions pill
   - hide the stage bar on a phone while a room is open
   - retire "Show detailed prompts"
3. Sandbox verification of the real job on desktop, tablet and phone, then screenshots.
4. SOPs: rewrite 21-0x for Project, Rooms, Actions and Documents, each with Section 14, plus the index and changelog.
5. Later (documented, not in this release): the client brief, tender notes and baseline print room scope from `room.scope`.
