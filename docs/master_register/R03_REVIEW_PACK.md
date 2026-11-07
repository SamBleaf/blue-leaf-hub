# Master Register R03 — independent review pack

**Purpose:** everything an independent reviewer (ChatGPT) needs to audit the Master Register before a staff pilot. Nothing here is deployed. No production database change. No client communication.

- **Repo:** `github.com/SamBleaf/blue-leaf-hub` (private)
- **Branch:** `master-register-r02` (draft PR against `main`; merge-base is `origin/main`, a clean diff)
- **Latest commit at hand-off:** `61cf36d` (see `git log origin/main..master-register-r02`)
- **Depth docs:** `docs/master_register/R03_TECHNICAL_GUIDE.md` (source-of-truth by stage, API, guards, runbook) · `docs/master_register/RELEASE_BLOCKER_REVIEW.md` (schema checks + migration/security pack) · `docs/sops/21_master_register/` (staff SOPs 21-01..21-04) · Google Doc tab "24 | R03 Build Report".

## What changed since the last report (R03 Checkpoints C–E + review prep)

Two review-prep commits sit on top of Checkpoint E:

- `2a8de48` **promotion robustness fix** (found by this review): the evidence/technical-evidence guards in `register_apply` pass-1 ran in *every* mode, so one lead item that was `client_approved` without evidence (or `verified` without a reference) made promotion return `{ok:false}` and write nothing — and `promoteRegisterToProject` ignored that result and reported success with `register_meta` left NULL, so the register would **silently never promote** and re-no-op on every open (the exact "stuck snapshot" failure the feature exists to prevent). Fix: those two guards are now `edit`-mode only (promotion copies the already-captured item forward and surfaces it as a flagged item; an unevidenced approval is still blocked at document *issue*, where evidence matters); and the JS now records `register.promotion_failed` and returns `ok:false` on any `{ok:false}`. Tests: `register-migration-213` 74/74 (adds the regression), full register suite 167/167, e2e 69/69.
- `61cf36d` **review-prep UX** (office register workspace, simpler filters, clearer pre-issue) — see the UX section below.

## Change map

**Frontend — `src/components/sales/lead-detail/register/`**
- `RegisterWorkshop.jsx` — the shell: stage-aware steps (Project · Whole house · Site & existing · Rooms · Register · Documents · Tender · Handover), the mode badge, the context line, and the new full-width workspace (expand/exit, sticky context strip). Mounts the step components.
- `ContextStep.jsx` / `SectionStep.jsx` / `RoomsStep.jsx` — capture (project facts read-only, whole-house/site prompts, room-by-room walkthrough with inheritance + exceptions).
- `RegisterTable.jsx` — office view: filters (default + Advanced), inline edit, outstanding accents, bulk portal issue, technical-coordination adder.
- `PromptRow.jsx` — one prompt/item: decision chips, evidence mini-form, portal actions, "More" detail.
- `DocumentsStep.jsx` — Draft/Preview/Issue, pre-issue summary, immutable history, coordination packs, received-document reconciliation.
- `TenderPanel.jsx` / `HandoverPanel.jsx` — tender summary (no prices), contract baseline, Ops handover.
- `useRegister.js` — the client store: load, three-way merge, autosave/flush, conflict resolution, portal, disabled (feature-switch) state.
- `LegacyScheduleRows.jsx` — the pre-register Finishes / F&F lists shown only when the feature switch is off.
- `src/lib/register.js` (model, vocab, prompt relevance) · `src/lib/registerQuestions.js` (generated Tab 21 library, `tab21-v1.0`).

**Backend — `server/lib/`**
- `registerRoutes.mjs` — all `/api/register/leads/:leadId/*` routes (staff-only via `requireAuth`; feature-switch middleware).
- `registerStore.mjs` — the one writer: `resolveTarget`, `loadRegister` (+ auto-promote), `saveRegister` (lead/project/needs_promotion), `callApply`, `promoteRegisterToProject`, `portalAction`, `registerEnabledFor`.
- `registerContext.mjs` — read-only Sales/project context + `setDeliveryModel` (fact).
- `registerDocuments.mjs` — preview/issue, pre-issue checks, coordination packs, received-document sources.
- `registerHandover.mjs` — tender summary, contract baseline.
- `registerPromotion.mjs` — shim re-exporting `promoteRegisterToProject` (single implementation).
- `salesRoutes.mjs` — three gated promotion call sites, the `delivery_model` carry at `convertLeadToJob`, the PATCH `REGISTER_PROMOTED` guard, the `ISSUED_IMMUTABLE` delete guard.
- `requireAuth.mjs` — staff gate (rejects `role='client'`).
- `docxToPdf.mjs` + `documents/documentPayloads.mjs` + `docTemplates.mjs` — the shared document engine (LibreOffice).

**Register persistence (the heart)** — `register_apply(p_project_id, p_lead_id, p_ops, p_actor, p_mode)` in `supabase/migrations/213_master_register_r03.sql`: two passes (lock+validate → apply), optimistic per-row versions, all-or-nothing. `register_issue_document(...)` for immutable doc revisions. Both `SECURITY INVOKER`, `service_role` only.

**Migrations:** `212` (promotion stores), `213` (R03 columns, functions, triggers, RLS), `214` (internal_categories client-access fix — a separate security change). All **prepared, not applied**.

**Security boundaries:** `requireAuth` 403s clients from every staff route; RESTRICTIVE `deny_clients` on `room_scope_items` (and the whole surface via mig 104); register RPCs `service_role` only; clients see only `client_selections` rows staff issued (`client_visible=true`).

## Code paths that deserve independent attention

An adversarial read of these six paths was run during prep. Findings distilled for the reviewer (full detail in the technical guide):

1. **Lead → project promotion.** The silent-failure defect above is **fixed** — verify the fix: promotion now succeeds despite an unevidenced approval and records `register.promotion_failed` + returns `ok:false` on any real conflict. Still worth confirming: the JS certainty/disposition vocabularies are a subset of the NOT-VALID CHECK constraints (213 §A) so no promote INSERT can raise and roll back; and that no promotion trigger path bypasses `registerEnabledFor`.
2. **Post-promotion editing.** Verdict: solid. Confirm migration **212 is applied before 213** (register_apply's `ON CONFLICT` targets 212's unique indexes; wrong order fails at the first edit, not at migration time). Note `leadScratchpadLocked` fails open on any query error — defence-in-depth on a legacy PATCH path the register UI never uses.
3. **Portal visibility.** Confirm promotion never flips visibility (`client_visible=false` on insert; promotion emits no `sel_issue`) and that scope/requirement/action rows never reach `client_selections`. Potential hardening (pre-existing portal code, low severity): the client's selection-choice UPDATE in `portalV2Routes.mjs` is not transactionally re-gated on `client_visible`, so a staff *withdraw* racing a client choice could write to a now-hidden row (it stays hidden afterward).
4. **Approvals / re-approval.** The `reapproval_required` and `post_contract_locked` guards apply to `client_selections` only — **by design**: a `client_approved` requirement lives in `room_scope_items`, is internal-only (never a contract-facing client choice), and is not locked. Reviewer should confirm that's acceptable. Also: the server checks approval evidence for `at`+`by` (who/when); `how`/method is client-enforced only; `evidence.by` can be a `"Blue Leaf"` placeholder with a NULL `approved_by_user_id`; and the post-contract lock covers product fields/quantity/disposition but not `room_area`/`responsibility`.
5. **Document issue revisions.** The immutability trigger freezes content (storage path, sha256, snapshot, version, dates, recipient) but leaves `issued_by`/`audience`/`supersedes_document_id` mutable — an audit-lineage gap, not a content gap. Minor: on an issue retry the already-uploaded PDF/DOCX are not cleaned up (unreachable storage orphans); the DOCX upload error is unchecked (the authoritative PDF is fine). The money/placeholder guards scan the data fixture + post-render output — confirm the four `.docx` templates bake in no literal `$` figures.
6. **RLS / client isolation.** No defect in the fix itself. **The whole invariant hinges on migration 104 (`auth_is_staff()`) being applied on prod** — see the release-blocker pack. On a 104-ready database every register table carries a RESTRICTIVE `deny_clients` (verified on the sandbox, including `projects`, whose permissive `auth.uid() IS NOT NULL` policy is neutralised by it). If 104 is absent, 213 silently skips its `room_scope_items` policy (NOTICE only) and client JWTs could read internal rows directly. Also confirm no service-role portal endpoint does `select('*')` on `job_events` (internal columns are embedded in its metadata).

## How to reproduce / review interactively

- **Tests:** `npm run test:register` (167 unit/DB) and, with the sandbox up, `npm run test:register-e2e` (69 through the real API). `npm run lint` / `npm run build`.
- **Live sandbox** (safe, isolated, loopback-only — no production access): `scripts/dev/register-sandbox/README.md`. Demo lead "Jordan & Sam Lee" exercises the full lifecycle; the e2e writes issued PDFs to `$REGISTER_E2E_OUT`.
- **The diff:** `git diff origin/main..master-register-r02` (also carries the doc-engine-r01 commits, which the register's document generation reuses — the `blb-*-template.docx` templates).
