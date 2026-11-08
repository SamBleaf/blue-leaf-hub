# Master Project Register R03: technical guide, release runbook and acceptance evidence

**Branch:** `master-register-r02` (R02 Increments 1–2 → R03 Checkpoints A–E) · **Date:** 2026-11-07
**Status:** built and tested end-to-end on a local sandbox. **Not deployed. No migration applied to production.**
**Staff SOPs:** `docs/sops/21_master_register/` (21-01 to 21-04). **Earlier map:** `TOUCHPOINT_MAP.md`.

---

## 1. What it is (one paragraph)

One project register inside the existing Sales lead stages (no new stage, page or department). Staff capture the brief room by room, and every answer becomes one record: **scope**, **requirement**, **selection** or **action**. The same records drive the office register, the client portal (only what staff issue), three documents (client brief, architect brief, selections schedule), the tender summary, the contract baseline and the Operations handover. There is no copy of the data to keep in sync and no sync button.

## 2. Source of truth, by stage

| When | Where the register lives | Who writes | Notes |
|---|---|---|---|
| Lead, no project yet | `leads.selections_schedule` (jsonb, mig 188), rows `{kind:"meta"}` + `{kind:"item"}` | `PUT /api/register/leads/:id` (lead mode) | Per-item merge with a version check on `leads.updated_at` (3 retries). Legacy `{area,item,notes}` rows are adopted. |
| First time a `projects` row exists for the lead's job | Promotion (once, atomic) | `register_apply(mode='promote')` | Triggered by pre-construction portal setup, Won finalisation, or the first register open. Failure writes nothing and logs `register.promotion_failed`. |
| Project exists | **Choices** → `client_selections` (staged `client_visible=false`); **scope / requirements / actions / settled-out selections** → `room_scope_items` (internal, `deny_clients` RLS); rooms + project setup → `projects.register_meta` | `PUT /api/register/leads/:id` (project mode) → one `register_apply` call per save | Optimistic versions per row (`updated_at`, bumped by every writer incl. the portal). Conflicts return `{conflicts}` and write nothing. |
| After promotion | Lead scratchpad = read-only history | `PATCH /api/sales/leads/:id` refuses `selections_schedule` (409 `REGISTER_PROMOTED`) | Stops a stale screen writing a second copy. |
| Delivery model | Pre-job `leads.delivery_model`; post-job facts service (`delivery_model`, consequential) | `PUT /api/register/leads/:id/facts` | Stamped forward at `convertLeadToJob`. |

Never written by the register: `client_notes`, `cost_impact`, `allowance_amount`, due dates, attachments, `linked_variation_id`, or any price.

## 3. Data model (migrations 212 + 213)

- **212** (`212_master_register_promotion.sql`): `room_scope_items` (project-keyed, internal), `client_selections.client_visible` (default true for existing rows), `source_ref`, `selection_certainty`; portal reads filter `client_visible` (with fallback if the column is missing).
- **213** (`213_master_register_r03.sql`): register columns on `client_selections` (certainty, disposition, technical_status/evidence, pricing_status/ref, approval_evidence, responsibility, supply_by, finish, manufacturer, quantity numeric (blank = not measured), quantity_unit, source_ref/doc, next_action, source_room_id, register_detail); `room_scope_items.item_kind` (scope/selection/requirement/action) and readiness columns; `projects.register_meta`; `leads/jobs.delivery_model`; `lead_documents` issue + received-document columns with an immutability trigger and "one current issue per type" index; `register_apply` and `register_issue_document` (SECURITY INVOKER, `service_role` only); `register_touch_updated_at` triggers; `deny_clients` on `room_scope_items`.
- **214** (`214_internal_categories_deny_clients.sql`): unrelated security fix found during the RLS sweep (see §8).

### Guards enforced in the database (`register_apply`)

| Reason | Rule |
|---|---|
| `stale` / `missing` / `exists` / `meta_stale` | Optimistic concurrency — someone else changed it; nothing written |
| `issued_locked` | An item live in the portal can't be deleted or re-classified |
| `approved_locked` | A client-approved item can't be withdrawn |
| `post_contract_locked` | Approved under a signed contract (or ordered / installed) — change through a variation |
| `evidence_required` | Client-approved needs who / when / how |
| `technical_evidence_required` | Verified needs a drawing / consultant reference |
| `reapproval_required` | Approved product fields changed without fresh evidence (the UI steps the item back to Proposed instead) |
| `not_in_review` | Approve / return only when a client choice is waiting |

## 4. API (all staff-only via `requireAuth`, which rejects portal clients; all behind the feature switch)

Base `/api/register/leads/:leadId`: `GET`, `PUT`, `GET /context`, `PUT /facts`, `POST /promote`, `POST /portal/:action` (issue / withdraw / return), `GET /history`, `GET /documents`, `POST /documents/:docType/preview`, `POST /documents/:docType/issue`, `GET /documents/:docId/url`, `GET /packs/:discipline`, `POST /sources`, `PATCH /sources/:docId`, `GET /tender`, `GET|POST /baseline`.
The job/project is always resolved server-side from the lead, so a browser can't aim a write at another project.

## 5. Question library (Tab 21 → versioned config)

- Source: `docs/master_register/question-library/tab21-question-library-v1.0.txt` + `tab21-parsed-v1.0.json` (147 questions, families P W R K B L V D H O E M).
- Build: `npm run register:questions` (runs `scripts/register/build-question-library.mjs`) → `src/lib/registerQuestions.js` (`QUESTION_LIBRARY_VERSION = "tab21-v1.0"`). The META table in the build script holds the routing (section, room types, topic, kind → item kind, stage detail, defaults/inheritance, quick chips). **No column per question**: answers are register items keyed by `promptKey`.
- Relevance: `promptsFor(section, {roomType, roomScope, projectType, deliveryModel, renovationOverlay, stage, showDetail})` in `src/lib/register.js`. Old R02 prompt keys map through `resolvePromptId`.
- To change wording: edit the Tab 21 source, re-run the build, bump the version, run `npm run test:register` (the verbatim-wording test will flag drift).

## 6. Documents

`server/lib/registerDocuments.mjs` builds fixtures from register rows and renders through the existing doc engine (`docTemplates.renderDocxTemplate` + `public/templates/blb-*-template.docx`), then LibreOffice (`server/lib/docxToPdf.mjs`). Pre-issue checks: drawing basis, recipient, unevidenced approvals, unverified items, **any `$` figure**, empty schedule, template placeholders. Issue = PDF + DOCX uploaded to a new path (never overwritten), SHA-256, `register_issue_document` (advisory lock; version conflict retried once). Previous revision → `superseded`. Nothing is emailed. Coordination packs (Architect, Routleys, TLI, windows, engineer, energy, joiner) are drafts filtered by supplier / category.

## 7. Tender, baseline, handover

`server/lib/registerHandover.mjs`: `tenderSummary` (included / excluded / by others / unresolved / specified / needs pricing / risks; cost references are fee-proposal category and PC/PS **labels only**); `recordBaseline` requires `contract_status='signed'` and a project record, stores an immutable `register_baseline` JSON (B01, B02…), ticks `ops_ready_checklist.selections_transfer`, logs `register.baseline.recorded`. Won still needs the signed contract **and** the explicit staff action in Sales.

## 8. Security model

- Portal clients: `requireAuth` returns 403 for `role='client'`; RLS `deny_clients` on `room_scope_items` (verified: a client JWT reads zero rows); register RPCs are `service_role` only.
- Clients only ever see `client_selections` rows staff issued (`client_visible=true`).
- **RLS sweep finding (fixed in 214, not applied):** `internal_categories` (mig 200) allowed any authenticated user, including a portal client, to read **and update** all rows (`auth_users` policy `USING (true)`, no `deny_clients`). Sandbox proof: client select 6 / update 6 before; 0 / 0 after; staff unchanged; idempotent; rollback restores. Every other RLS table in the repo schema already denies clients. Run the PRE-CHECK query in 214 on production first, because production can drift from the repo.

## 9. Feature switch and pilot

`registerEnabledFor(leadId)` in `server/lib/registerStore.mjs`:
- `REGISTER_ENABLED=true`: on for every lead. `REGISTER_PILOT_LEADS=<uuid>,<uuid>`: on for those leads only. **Default: off.**
- Off: every `/api/register` route returns 404 `REGISTER_DISABLED` (before auth); the card is hidden; the Concept and Consultants stages show the pre-register **Finishes schedule** / **Provisional F&F schedule** lists as before (now saved in order and debounced, and they never touch register-format rows); automatic promotion at pre-construction / Won is skipped.
- So the **code can ship before migrations 212/213** with zero behaviour change, and a pilot is a config change on Railway.

## 10. Testing

Never run the repo's `e2e/`, `test-critical-paths`, batch-a or Playwright suites for this work: they target production.

| Command | What | Result 2026-11-07 |
|---|---|---|
| `npm run test:register` | R02 model 15 · R03 model + library 31 · feature switch 7 · promotion/store 22 · mig 212 (disposable PG) 18 · mig 213 (disposable PG) 70 | **163 / 163** |
| `npm run test:register-e2e` | 69 checks through the **real Hub API** on the loopback sandbox, Scenarios A/B/C, all 25 acceptance scenarios | **69 / 69** |
| `npm run lint` / `npm run build` | zero-warning lint, production build | pass / pass |

**Sandbox** (`scripts/dev/register-sandbox/`, README there): Postgres 17 + PostgREST + a Node gateway (auth/storage) + the Hub API under `sandbox-exec` (outbound network denied) + Vite. Keys live in `~/.blh-register-sandbox/`; the API runs from `~/.blh-register-sandbox/hub-cwd` so it can never read the repo `.env`. The sandbox env sets `REGISTER_ENABLED=true`. Because macOS blocks app-launched processes from reading Desktop, the servers run from a home-directory copy (`~/blh-register-run`, synced with `rsync --exclude .env`).

### Acceptance matrix (R03 §12, evidence = `register-e2e.test.mjs` tags)

| # | Scenario | Result |
|---|---|---|
| 1 | Context pre-filled from Sales, nothing re-entered; delivery model a Sales fact, stamped to the job | ✅ 4/4 |
| 2 | Concept work stays in the existing `winning_offer` stage — no new stage | ✅ |
| 3 | 13-room walkthrough saved; save & resume with stable ids and room pointer; small-reno relevance (33 prompts, no clutter) | ✅ 3/3 |
| 4 | Room rename / reorder keeps ids and links | ✅ |
| 5 | Whole-house default listed once + room exception; new build standards + carpet upgrade | ✅ 3/3 |
| 6 | Renovation alter vs make good; short brief issues cleanly | ✅ |
| 7 | Requirements never become product selections | ✅ |
| 8 | Detailed work saved while PTSA unsigned — no payment gate | ✅ |
| 9 | Job + pre-construction project created once; promotion exactly once; Won doesn't re-promote | ✅ 5/5 |
| 10 | Canonical write-through after promotion; no second writable copy; stale scratchpad write refused | ✅ 5/5 |
| 11 | No client portal task created by promotion | ✅ |
| 12 | Promoted selections staged; staff issue makes them visible | ✅ 2/2 |
| 13 | Client choice waits for review; staff approval with evidence | ✅ 2/2 |
| 14 | Client-approved glazing still shows technical verification outstanding | ✅ |
| 15 | Client brief renders from stored values; no $ / placeholders | ✅ 2/2 |
| 16 | Architect brief with drawing basis + consultant actions | ✅ |
| 17 | Selections schedule = client choices only; presentation layout from the same rows | ✅ 2/2 |
| 18 | Issue P01 with recipient + checksum; blocked without recipient; P02 supersedes P01 (original retrievable); issued doc can't be deleted | ✅ 4/4 |
| 19 | Stale screens rejected (409); supplier document stored + reconciled; Routleys / TLI packs | ✅ 7/7 |
| 20 | Tender view from the same records; cost reference linked, no price copied | ✅ 2/2 |
| 21 | Won graduates the same project; post-contract lock; baseline B01 + Ops-Ready tick; release with no extra invitation | ✅ 5/5 |
| 22 | Portal shows only issued selections; client choice via existing portal route; portal regressions | ✅ 5/5 |
| 23 | Client JWT reads zero internal rows; client blocked from staff API; cross-lead isolation | ✅ 3/3 |
| 24 | Regression: sales, lead detail, documents, scorecard, carpentry, finance | ✅ 6/6 |
| 25 | Every item in exactly one canonical store — none duplicated or lost | ✅ |

UI walkthrough (real app, sandbox): context card, whole house, rooms, office register, documents preview + issue P01, switch-off fallback. Screenshots and the e2e PDFs: `~/blh-register-evidence/` (outside the repo; sandbox data only).

## 11. Production release runbook (do not run without explicit Blue Leaf approval)

**Step 0 — read-only pre-check on production** (SQL editor, changes nothing):
```sql
SELECT to_regclass('public.client_selections') IS NOT NULL AS has_103,
       to_regprocedure('public.auth_is_staff()') IS NOT NULL AS has_104,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='selections_schedule') AS has_188,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='is_preconstruction') AS has_199,
       to_regclass('public.internal_categories') IS NOT NULL AS has_200,
       to_regclass('public.room_scope_items') IS NOT NULL AS has_212,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='register_meta') AS has_213;
```
Plus the PRE-CHECK block in `214_internal_categories_deny_clients.sql`. All of `has_103`, `has_104`, `has_188`, `has_199` must be true before 212/213.

**Step 1 — ship code with the switch off** (no env change): behaviour identical to today. Verify a Concept lead shows the old Finishes schedule and `/api/register/...` returns 404 `REGISTER_DISABLED`.

**Step 2 — 214 (security, independent of the register):** apply, run its VERIFICATION, then `NOTIFY pgrst, 'reload schema';`. Rollback: `DROP POLICY IF EXISTS deny_clients ON public.internal_categories;`.

**Step 3 — 212 then 213** (staging / branch database first): apply in order; run the VERIFICATION block at the foot of each (213: every row should read true); `NOTIFY pgrst, 'reload schema';`. Rollback blocks at the foot of each file (both are run and checked by `register-migration-212/213.test.mjs`); roll back 213 before 212.

**Step 4 — pilot:** set `REGISTER_PILOT_LEADS=<one or two new leads>` on Railway, restart. No client invitations or emails are created by any register action; portal visibility only by explicit staff issue.

**Step 5 — widen:** `REGISTER_ENABLED=true` after the pilot sign-off.

## 12. Troubleshooting (support)

| Symptom | Cause | Action |
|---|---|---|
| Card missing; old list shows | Switch off for the lead | Add the lead id to `REGISTER_PILOT_LEADS` |
| "Document issuing needs migration 213" | 213 not applied | Apply 213 (approval required) |
| PGRST204 "column … not in schema cache" after a migration | PostgREST cache | `NOTIFY pgrst, 'reload schema';` |
| `register.promotion_failed` in job events | Promotion error (e.g. schema missing) | Fix the cause; the next register open retries; nothing half-written |
| 409 with `conflicts` | Concurrent edit or a guard | Message names the reason (§3); the UI reloads that item |
| Issue blocked | Pre-issue check | The response lists the checks; fix in the register |
| PDF render fails | LibreOffice missing on the API host | Install LibreOffice (`soffice`) or set its path; preview shows the error |

## 13. Production release assessment

**Completed and tested (sandbox):** everything in §10's matrix; feature switch + legacy fallback; migrations 212/213 up, verification and rollback (automated tests); 214 up, idempotent re-apply and rollback (sandbox); RLS client denial; immutable issue history; no-price guard; no automatic client communication.

**Awaiting live schema verification:** whether migrations 103, 104, 188, 199 are on production (memory: 103 "awaits paste", 104 is the load-bearing portal-security unknown); whether `internal_categories` on production has the same open policy (the 214 PRE-CHECK answers it); LibreOffice availability on the Railway API host (already needed by fee-proposal PDFs).

**Requires Blue Leaf approval:** applying 214, 212, 213 to production; deploying the branch; choosing pilot leads; visual sign-off of the document designs (doc-engine R04 is still awaiting Sam's sign-off); any portal release to a real client.

**Deferred (by design or next increment):** photos / swatches in documents (text-only engine); embedded plan viewer (link only); sending coordination packs / documents by email (records only); Xero or pricing-engine links beyond labels; phone-width walkthrough of the office register (desktop verified; the table scrolls sideways in the narrow lead column); register-level reporting across projects.

**Known defects:** none open in the register. Fixed during R03: actor lookup permission error, issued-doc delete order, wrapped reference codes, invented "Blue Leaf" supply default, stage key shown raw, default "Undecided" highlighted, requirement chips, wide office table, legacy list save race and overflow. Observed outside scope: the lead page fires `POST /meetings/sync` several times per load (pre-existing).
