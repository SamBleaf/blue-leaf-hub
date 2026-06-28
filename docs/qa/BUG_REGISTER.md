# Bug Register

**Status:** W01 mapped + RFQ phases 2–5 (2026-06-22)  
**Template:** Each entry needs reproduction steps, severity, owner module, regression test ID when fixed.

**Naming:** `W01-DRIFT-*` = Workflow 01 Lead/CRM. `DRIFT-*` (no prefix) = RFQ/Tender. `UI-<MODULE>-###` = Wave 01A UI/UX discovery (2026-06-28).

---

## Open — UI/UX Discovery Wave 01A (2026-06-28)

> Source: [ui_review/UI_UX_DISCOVERY_WAVE_01_RESULT.md](./ui_review/UI_UX_DISCOVERY_WAVE_01_RESULT.md) · Run `BLH-UIUX-01A-2026-06-28-1` · **No code changed in 01A.**

### UI-FIELD-001 — Field WHS screen crashes (ErrorBoundary)

| Field | Value |
|-------|-------|
| **Type** | UI-ERROR-STATE |
| **Severity** | ~~High~~ → **Low** (reclassified 2026-06-28 follow-up) |
| **Module** | Field / WHS |
| **Route / screen** | `/field/whs` |
| **Role** | supervisor |
| **Viewport** | all three |
| **Root cause (follow-up)** | **Fixture-only.** `FieldWHS.jsx` correctly expects Supabase `.select()` to return an **array** (`data \|\| []` then `.map`). UI Review `/rest/v1/projects` returned a **single object** (for Operations `.single()`), so `data` was truthy but not array → `projects.map is not a function`. Live PostgREST always returns arrays for list queries. |
| **Fix applied (test-only)** | `src/ui-review/fixtures/operations.js` — return array unless `Accept: application/vnd.pgrst.object+json` (`.single()`). |
| **Evidence** | `…/desktop/field-whs.png` (pass after fix); `npm run test:ui-review` 171/171 pass |
| **Suggested test** | `npm run test:ui-review` — `field-whs` all viewports |
| **blocks-deployability** | **no** (was review-harness only) |
| **Status** | **closed — fixture-only (2026-06-28 follow-up)** |

### UI-FIELD-002 — Field Diary screen crashes (ErrorBoundary)

| Field | Value |
|-------|-------|
| **Type** | UI-ERROR-STATE |
| **Severity** | ~~High~~ → **Low** (reclassified 2026-06-28 follow-up) |
| **Module** | Field |
| **Route / screen** | `/field/diary` |
| **Role** | supervisor |
| **Viewport** | all three |
| **Root cause (follow-up)** | **Same fixture-only issue as UI-FIELD-001.** `FieldDiary.jsx:37` — `projects.find(...)` on non-array from `/rest/v1/projects` object response. Component assumption matches live Supabase behaviour. |
| **Fix applied (test-only)** | Same `/rest/v1/projects` handler fix in `operations.js`. |
| **Evidence** | `…/mobile/field-diary.png` (pass after fix) |
| **blocks-deployability** | **no** |
| **Status** | **closed — fixture-only (2026-06-28 follow-up)** |

### UI-NAV-001 — Mobile bottom module nav overflows viewport

| Field | Value |
|-------|-------|
| **Type** | UI-MOBILE |
| **Severity** | Medium |
| **Module** | Global / AppShell |
| **Route / screen** | All staff modules (e.g. `/finance/jobs/job-1001`, `/sales`, `/workforce`) |
| **Role** | admin |
| **Viewport** | mobile 390×844 |
| **Reproduction** | Open any module with AppShell bottom nav on 390 px width |
| **Expected** | All module shortcuts reachable without clipping |
| **Actual** | 7 items (Sales · Tender · Ops · Workforce · Finance · Marketing · Carp) overflow; “Carp” clipped |
| **Evidence** | `…/mobile/finance-command-centre.png`, `…/mobile/sales-pipeline.png` |
| **Suggested test** | Visual: `npm run test:ui-review` mobile captures; assert nav scroll or “More” menu |
| **blocks-deployability** | no |
| **Status** | open — 01B candidate |

### UI-SALES-001 — “Needs action” KPI contradicts overdue count

| Field | Value |
|-------|-------|
| **Type** | UI-WORKFLOW-CLARITY |
| **Severity** | Low |
| **Module** | Sales |
| **Route / screen** | `/sales` pipeline home |
| **Role** | admin |
| **Viewport** | desktop + mobile |
| **Reproduction** | UI Review `/sales` — KPI strip shows Needs action **0**, Overdue **7**, filter “Overdue (8)” |
| **Expected** | KPI labels align with filter counts or explain difference |
| **Actual** | Staff may ignore “Needs action” tile; overdue/leads all show red dots |
| **Evidence** | `…/desktop/sales-pipeline.png` |
| **Suggested test** | Visual regression on KPI strip after copy/logic alignment |
| **blocks-deployability** | no |
| **Status** | open — 01B or accepted-gap |

### UI-FINANCE-001 — Job command centre KPI tiles show em-dash instead of empty-state copy

| Field | Value |
|-------|-------|
| **Type** | UI-EMPTY-STATE |
| **Severity** | Medium |
| **Module** | Finance |
| **Route / screen** | `/finance/jobs/:id` command centre |
| **Role** | admin |
| **Viewport** | desktop + mobile |
| **Reproduction** | UI Review `/finance/jobs/job-1001` — CLAIMS ISSUED/PAID, ACTUAL COSTS, WORKING MARGIN = `—` |
| **Follow-up note** | Fixture used wrong KPI keys (`billed_to_date` vs `claims_issued`). Enriched in `finance.js` — KPIs now render. Remaining gap: live jobs with zero claims still need friendly empty copy (01B). |
| **Evidence** | `…/desktop/finance-command-centre.png` (post-fix) |
| **blocks-deployability** | no |
| **Status** | open — **01B empty-state copy** |

### UI-FINANCE-002 — Progress Claims table squeezed on mobile

| Field | Value |
|-------|-------|
| **Type** | UI-MOBILE |
| **Severity** | Medium |
| **Module** | Finance |
| **Route / screen** | `/finance/jobs/:id` — Progress Claims |
| **Role** | admin |
| **Viewport** | mobile 390×844 |
| **Reproduction** | Scroll to Progress Claims on finance command centre mobile |
| **Expected** | Card-per-claim or horizontal scroll with readable dates |
| **Actual** | 6-column table; headers wrap (“EX GST”/“INC GST”); dates wrap to 3 lines |
| **Evidence** | `…/mobile/finance-command-centre.png` |
| **Suggested test** | Visual mobile finance-command-centre |
| **blocks-deployability** | no |
| **Status** | open — 01B candidate |

### UI-FINANCE-003 — Dual floating action buttons overlap content on mobile

| Field | Value |
|-------|-------|
| **Type** | UI-USABILITY |
| **Severity** | Low |
| **Module** | Finance (global FAB pattern) |
| **Route / screen** | `/finance/jobs/:id` |
| **Role** | admin |
| **Viewport** | mobile |
| **Reproduction** | Open finance command centre mobile; scroll WIPAA / claims sections |
| **Expected** | Single clear primary FAB or docked actions |
| **Actual** | Green “layers” FAB (bottom-left) + blue “+” FAB (bottom-right) obscure accordion content |
| **Evidence** | `…/mobile/finance-command-centre.png` |
| **Suggested test** | Visual regression mobile finance-command-centre |
| **blocks-deployability** | no |
| **Status** | open — 01B candidate |

### UI-PORTAL-001 — “Latest update” title shows stray em-dash

| Field | Value |
|-------|-------|
| **Type** | UI-VISUAL-REGRESSION |
| **Severity** | Low |
| **Module** | Client Portal |
| **Route / screen** | `/client-portal` home |
| **Role** | client |
| **Viewport** | desktop + mobile |
| **Reproduction** | UI Review portal home — “Latest update · —” heading |
| **Expected** | Date or “No updates yet” |
| **Actual** | Literal `—` after bullet |
| **Evidence** | `…/desktop/portal-home.png`, `…/mobile/portal-home.png` |
| **Suggested test** | UI Review portal-home |
| **blocks-deployability** | no |
| **Status** | open — 01B candidate |

### UI-PORTAL-002 — Greeting next-step contradicts “all up to date” action card

| Field | Value |
|-------|-------|
| **Type** | UI-ACTION-CLARITY |
| **Severity** | Low (downgraded after follow-up diagnosis) |
| **Module** | Client Portal |
| **Route / screen** | `/client-portal` home |
| **Role** | client |
| **Root cause (follow-up)** | **Review-mode fixture gap, not live behaviour bug.** `ClientHome.jsx:109` reads `home.actionCount`; greeting reads `home.nextAction.title` (`ClientHome.jsx:19`). Live API builds **both** from `client_actions` in one handler ([portalV2Routes.mjs:258–272](../../server/lib/portalV2Routes.mjs)) — they stay in sync. UI Review fixture set `nextAction` but omitted `actionCount` → false “all up to date”. |
| **Verdict** | **Fixture-only for review evidence.** Live mismatch would require investigating `client_actions` data, not presentational polish. Optional fixture add: `actionCount: 2` to match session `outstanding_actions`. |
| **01B?** | UI-PORTAL-001 (`Latest update · —` missing `weekOf`) is **copy/01B**; this item is **not 01B** unless reproduced on live data. |
| **Evidence** | `…/mobile/portal-home.png` |
| **blocks-deployability** | no |
| **Status** | **closed — fixture gap documented (2026-06-28 follow-up)** |

### UI-WORKFORCE-001 — Crew / app-linked KPIs show zero in populated demo

| Field | Value |
|-------|-------|
| **Type** | UI-DEMO-LIVE |
| **Severity** | Low |
| **Module** | Workforce |
| **Route / screen** | `/workforce` Approvals |
| **Role** | admin |
| **Viewport** | desktop + mobile |
| **Reproduction** | UI Review workforce — 3 pending timesheets but Crew **0**, App-linked **0/0** |
| **Expected** | KPIs reflect fixture crew or show “—” with explanation |
| **Actual** | Reads as misconfigured workforce |
| **Evidence** | `…/desktop/workforce.png` |
| **Suggested test** | Enrich workforce fixture + visual |
| **blocks-deployability** | no |
| **Status** | open — fixture + 01B copy |

### UI-TENDER-001 — RFQ Engine / subsheets lack tender command-centre home pattern

| Field | Value |
|-------|-------|
| **Type** | ACCEPTED-GAP |
| **Severity** | Low |
| **Module** | Tender / RFQ |
| **Route / screen** | `/tender-manager/rfq-engine`, quote tracker, etc. |
| **Role** | admin |
| **Viewport** | desktop |
| **Reproduction** | Compare Tender Board (KPI + queue) vs RFQ Engine (4-step wizard) |
| **Expected** | Sam may accept wizard as distinct tool surface |
| **Actual** | No module-home KPI strip on engine; staff must know sidebar entry |
| **Evidence** | `…/desktop/rfq-engine.png` vs `tender-board.png` |
| **Suggested test** | — |
| **blocks-deployability** | no |
| **Status** | **ACCEPTED-GAP — Sam 2026-06-29.** RFQ wizard may remain a distinct tool surface without a full module-home KPI strip. Not deploy-blocking; out of 01B scope. |

### UI-SCHEDULE-001 — Schedule mobile secondary toolbar overcrowded

| Field | Value |
|-------|-------|
| **Type** | UI-MOBILE |
| **Severity** | Low |
| **Module** | Schedule |
| **Route / screen** | `/operations/:id/schedule` |
| **Role** | admin |
| **Viewport** | mobile |
| **Reproduction** | Open schedule mobile — note Export PDF, Export CSV, BX Match, Save template row |
| **Expected** | Overflow “⋯” menu on narrow viewports |
| **Actual** | Many small targets; lookahead cards good but toolbar dense |
| **Evidence** | `…/mobile/schedule-manager.png` |
| **Suggested test** | Visual mobile schedule-manager |
| **blocks-deployability** | no |
| **Status** | open — 01B candidate |

### UI-VISUAL-001 — Inconsistent status badge styling across modules

| Field | Value |
|-------|-------|
| **Type** | UI-VISUAL-REGRESSION |
| **Severity** | Low |
| **Module** | Global |
| **Route / screen** | Portal “On track”, Finance “Paid/Issued”, Tender “Tendering/Won”, Sales stage chips |
| **Role** | various |
| **Viewport** | desktop |
| **Reproduction** | Compare badges across module screenshots |
| **Expected** | Shared badge component + status→colour token map |
| **Actual** | Mixed shapes, casing, colours |
| **Evidence** | Multiple screenshots in export; seed item 5 in `UI_REVIEW_REDESIGN_NOTES_SEED.md` |
| **Suggested test** | Design-system visual suite |
| **blocks-deployability** | no |
| **Status** | open — 01B / design-system |

### UI-CRM-001 — No UI Review coverage for CRM / Relationships screens

| Field | Value |
|-------|-------|
| **Type** | UI-VISUAL-REGRESSION |
| **Severity** | Medium |
| **Module** | CRM / Mailing List |
| **Route / screen** | `/sales/dashboard`, `/sales/contacts`, `/marketing/lists` |
| **Resolution (follow-up)** | Added `src/ui-review/fixtures/crm.js` + routes in `e2e/ui-review/routes.mjs`. `npm run test:ui-review` **171/171 pass**; desktop + mobile screenshots captured. |
| **Evidence** | `…/desktop/crm-dashboard.png`, `…/mobile/crm-contacts.png`, `…/mobile/crm-mailing-lists.png` |
| **blocks-deployability** | no |
| **Status** | **closed (2026-06-28 follow-up)** |

### UI-CRM-002 — CRM contacts table squeezed on mobile

| Field | Value |
|-------|-------|
| **Type** | UI-MOBILE |
| **Severity** | Low |
| **Module** | CRM |
| **Route / screen** | `/sales/contacts` |
| **Viewport** | mobile 390×844 |
| **Reproduction** | UI Review mobile contacts — 3-column table (Name/Type/Status) without card collapse |
| **Expected** | Card-per-contact or scroll hint on mobile |
| **Evidence** | `…/mobile/crm-contacts.png` |
| **blocks-deployability** | no |
| **Status** | open — 01B candidate |

---

## Claude Review — Wave 01A triage (2026-06-28)

Scope verified: **Cursor changed docs only — no `src/**`/`server/**`/migrations**. Evidence
(156/162 UI Review + screenshots) is strong enough to plan Wave 01B. The 14 findings are routed
into four lanes. **Two items are blocked on root-cause diagnosis before they can be classified as
deploy-blocking code fixes vs free test-only fixes** — that diagnosis is no-code and runs next.

| ID | Sev | Lane | Next action |
|----|-----|------|-------------|
| UI-FIELD-001 | High | **Diagnose first** | Root-cause `projects.map is not a function`: UI-Review **fixture** (wrong data shape) vs **component** bug. Fixture → fix fixture (test-only) + re-run + downgrade. Component → confirmed High deploy-blocker → **Fix Agent under Sam approval**. |
| UI-FIELD-002 | High | **Diagnose first** | Same for `projects.find is not a function` (`/field/diary`). |
| UI-PORTAL-002 | Med | **Diagnose first** | Is the pending selection meant to surface in the portal action queue (**behaviour/data-feed** → Fix Agent under Sam) or just a copy mismatch (→ 01B)? Hold from 01B until known. |
| UI-CRM-001 | Med | **Test-only (no approval)** | Add CRM UI-Review routes + fixtures via existing mechanism; if it needs a product-code change to render, **stop + log**. Re-run; capture; re-assess lock. |
| UI-WORKFORCE-001 | Low | **Test-only + 01B** | Enrich workforce fixture (test-only) to disambiguate empty vs thin data; empty-state copy is 01B. |
| UI-NAV-001 | Med | **01B presentational** | Scrollable / "More" bottom nav on mobile. |
| UI-FINANCE-001 | Med | **01B presentational** | Empty-state copy for `—` KPI tiles (confirm thin-data via fixture, not a load bug). |
| UI-FINANCE-002 | Med | **01B presentational** | Mobile card/scroll layout for Progress Claims. |
| UI-FINANCE-003 | Low | **01B presentational** | Consolidate dual FABs. |
| UI-PORTAL-001 | Low | **01B presentational** | Fix stray em-dash title. |
| UI-SCHEDULE-001 | Low | **01B presentational** | Mobile toolbar overflow menu. |
| UI-VISUAL-001 | Low | **01B (sequence last)** | Shared status-badge component — higher blast radius; do after lower-risk modules. |
| UI-SALES-001 | Low | **01B copy OR ACCEPTED-GAP** | Align "Needs action" KPI with overdue/filter semantics, **or** Sam accepts the semantics as intended. |
| UI-TENDER-001 | Low | **ACCEPTED-GAP candidate (Sam)** | Sam: accept the RFQ wizard as a distinct tool surface, or add a presentational tender-home wayfinding banner (01B). |

**SOP drift / training gaps this wave:** none (UI-only wave).

**Severity check:** no Criticals. The two High items (UI-FIELD-001/002) are **provisional** —
their deploy-blocking status is confirmed only if diagnosis shows a component bug. No High is
"accepted" yet.

**Approval gates raised:** (1) **Wave 01B presentational polish** (one approval unlocks the
approved modules — see `hardening_loop/SAM_APPROVAL_REQUIRED.md`); (2) any **Field/Portal code
fix** if diagnosis confirms a component/behaviour bug; (3) **ACCEPTED-GAP** decisions on
UI-TENDER-001 / UI-SALES-001. The no-code follow-up (`UI-UX-WAVE-01A-FOLLOWUP`) needs **no**
approval and runs first.

### Follow-up resolution (2026-06-28, Claude review of `UI-UX-WAVE-01A-FOLLOWUP`)

The three "diagnose-first" items above are resolved — **none is a product-code bug.** Claude
independently re-verified (UI Review 171/171; live-code citation re-checked first-hand).

| ID | Verdict | Status now |
|----|---------|-----------|
| **UI-FIELD-001 / -002** | **Fixture-only.** UI-Review mock `/rest/v1/projects` returned an object; `FieldWHS`/`FieldDiary` correctly expect arrays (matches live Supabase). Fix was in `src/ui-review/fixtures/operations.js` (test-only). | **closed** — Field → **UI LOCKED**; NO-GO lifted. Not a Fix-Agent item. |
| **UI-PORTAL-002** | **Fixture gap, not behaviour.** Live API *does* surface the pending action — **verified** `server/lib/portalV2Routes.mjs` L258–266 (queries `client_actions` for `actionCount`/`nextAction`) → L331–332 (returns them). Review fixture didn't reflect it. | **closed** — not Fix-Agent. UI-PORTAL-001 (em-dash title) stays **01B**. |
| **UI-CRM-001** | Coverage added (3 routes + fixtures, test-only). | **closed** — CRM → **UI CONDITIONAL**; new **UI-CRM-002** (mobile contacts table) → **01B** candidate. |

**Net: 0 deploy-blocking UI bugs open.** Remaining open are all **01B presentational** (UI-NAV-001
· UI-FINANCE-001/002/003 · UI-PORTAL-001 · UI-CRM-002 · UI-SCHEDULE-001 · UI-WORKFORCE-001 ·
UI-VISUAL-001) or **accepted-gap candidates** (UI-TENDER-001; UI-SALES-001).

**Control check (recorded):** `src/ui-review/**` confirmed **review-only** (gated by
`VITE_UI_REVIEW_MODE`, tree-shaken from production; no prod import of its fixtures) → **Option 1:
allowed test-only path** (master plan §4). Cursor's follow-up commit `4ae2b34` touched only
`src/ui-review/fixtures/**` + `e2e/ui-review/` + docs — **no production code.** Not a scope breach.

---

## Open — Workflow 01 Lead / CRM Intake

> W01-DRIFT-001 and W01-DRIFT-002 are **fixed** — see [Fixed — Workflow 01](#fixed--workflow-01-lead--crm-intake) below.

### W01-DRIFT-003 — Stage gates UI-only (intake / pipeline level)

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Sales |
| **Symptom** | Intake/pipeline-level stage movement can bypass gates — kanban and API accept any stage without server validation |
| **Root cause** | `GATE_REQUIREMENTS` only in LeadDetail; PATCH has no validation |
| **Related** | **W02-DRIFT-006** — qualification-specific consequences (e.g. discovery/tender before readiness). **Do not fix separately** — one shared gate-bypass fix should address both |
| **Test** | W01-E2E-03, W01-API-04 |
| **Decision** | SAM-W02-002 (advisory + diagnostic logging during hardening; no hard-block yet) |
| **Status** | open |

### W01-DRIFT-004 — SOP vs code qualifying score language (superseded)

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Module** | Docs / Sales |
| **Symptom** | SOP 02-04 says “percentage”; UI shows `/8`; scorecard uses stage probability not qualify score |
| **Ownership** | Qualification score drift is owned by **W02-DRIFT-002**, **W02-DRIFT-003**, and **W02-DRIFT-008**. W01 only captures fields that later feed qualification |
| **Test** | W01-API-06 (intake fields only); score language → W02 tests |
| **Status** | **superseded by W02 qualification drift items** — do not delete; historical cross-reference only |

### W01-DRIFT-005 — Convert-to-job undertested; site_address UX gap

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | Sales → Tender handoff |
| **Symptom** | Manual create has suburb not site_address; convert fails at API; UI gate checked `job_id` not address |
| **Root cause** | [salesRoutes.mjs:240](../../server/lib/salesRoutes.mjs), [LeadDetail.jsx:75](../../src/pages/LeadDetail.jsx) |
| **Fix (2026-06-27)** | **W01-CONVERT-01** — W01-API-08; tender gate requires `site_address`; Create Job / RFQ buttons disabled without address |
| **Test** | W01-API-08 — 400 without address; 200 with address |
| **Status** | **closed — accepted 2026-06-27 (W01-CONVERT-01)** |

### W01-DRIFT-006 — Four parallel interaction stores

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Sales + CRM |
| **Symptom** | CRM interactions not on lead timeline; notes don't create activities |
| **Test** | W01-API-05 |
| **Status** | open |

### W01-DRIFT-007 — AI transcript writes lead fields without provenance

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Sales / AI |
| **Symptom** | Applied suggestions PATCH leads directly; `name` not applyable |
| **Files** | [salesRoutes.mjs:873–900](../../server/lib/salesRoutes.mjs) |
| **Test** | W01-API-07 |
| **Status** | open |

### W01-DRIFT-008 — `LEAD_STAGES` constant unused

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Sales |
| **Symptom** | Stage strings hardcoded in 4+ places; no DB CHECK on `leads.stage` |
| **Files** | [constants.js](../../src/lib/constants.js), SalesPipeline, LeadDetail, salesRoutes |
| **Test** | — |
| **Status** | open |

### W01-SEC-003 — Public enquiry lacks confirmed spam/rate-limit protection

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Marketing / Public enquiry |
| **Symptom** | Public enquiry endpoint is intentionally unauthenticated and validates name/email, but no route-level rate limit, honeypot, CAPTCHA, or bot protection has been confirmed |
| **Root cause** | `POST /api/public/enquiry` accepts public submissions; code validates required fields and destructures allowed fields but does not show anti-spam guard in route handler |
| **Note** | Unauthenticated public enquiry is **by design** — only missing protection is the risk |
| **Test** | W01-SEC-03 |
| **Decision** | SAM-W01-003 |
| **Verified (2026-06-27)** | Protections **present in code** — honeypot `website` field ([marketingIntelligenceRoutes.mjs](../../server/lib/marketingIntelligenceRoutes.mjs) L274-288), per-IP rate limit 5/10min → 429 (L56-73, L289-291), field whitelist on `/api/public/enquiry` + `/api/public/attribution`. Evidence: [MARKETING_ADJACENT_VERIFY_RESULT.md](./MARKETING_ADJACENT_VERIFY_RESULT.md). |
| **Status** | **protections present — pending regression test** (downgraded Medium→Low; not closed — needs `W01-SEC-03` test; no CAPTCHA, optional) |

---

## Open — Batch E adversarial-audit verifications (2026-06-27)

> Source: [ADVERSARIAL_AUDIT_2026-06-23.md](./ADVERSARIAL_AUDIT_2026-06-23.md) candidates, verified **read-only** by the hardening agent (Explore fan-out + main-loop code spot-check). Full method + evidence: [MARKETING_ADJACENT_VERIFY_RESULT.md](./MARKETING_ADJACENT_VERIFY_RESULT.md). **No code changed.** W22–W24 (Batch E) are not yet mapped → fixes are map-gated; **W22-SEC-001 is a Sam-gated elevation.**

### W22-SEC-001 — CRM bulk send ignores global unsubscribe + role-bypass + non-idempotent stats

| Field | Value |
|-------|-------|
| **Severity** | **High** — consent/compliance + security exposure (**Critical-candidate — elevated; do not fix without Sam**) |
| **Module** | CRM / Mailing List (W22) |
| **Symptom** | (a) Smart-list sends pull `crm_contacts` with **no `email_unsubscribes`/global `unsubscribed_at` check**; manual lists filter per-list only; link-unsubscribe is per-list → a globally opted-out contact can still be emailed (**AU Spam Act 2003**). (b) `POST /api/crm/sends`, `…/:sid/send`, `/lists/:id/import` are **`requireAuth` only** → any employee can fire bulk customer email / mass-import contacts. (c) `increment_send_stat` non-idempotent → webhook-retry double-counts stats. |
| **Evidence (verified from code)** | [crmRoutes.mjs](../../server/lib/crmRoutes.mjs) L1045, L1063-1083, L1106-1119, L1256-1279; [migration 073](../../supabase/migrations/073_increment_send_stat.sql); [dev-api.mjs:879-901](../../server/dev-api.mjs) (comment claims CRM sensitive routes are admin-gated — **inaccurate**) |
| **Exploitability** | Gated on `RESEND_API_KEY` configured + CRM bulk email in active use (latent if not yet live); consent gap is real the moment it is used |
| **Smallest-safe fix** | Enforce global suppression on **every** send path; link-unsub writes global suppression (or check at send); inline `requireRole("admin")` on send/import (**keep `/api/crm/unsubscribe` public — do NOT extend the prefix loop**); idempotent stat increment |
| **Test** | `e2e/tests/security/crm-send-role.spec.js` (`npm run test:w22-crm-security`, api-security project) — employee/supervisor→403, admin passes the gate, on all 3 routes. Planned follow-on: suppression-exclusion + webhook-retry no-double-count (W22-SEC-002/003). |
| **Fix (2026-06-28, Sam-approved batch)** | [crmRoutes.mjs](../../server/lib/crmRoutes.mjs) — inline `requireRole("admin")` on `/api/crm/sends`, `/sends/:sid/send`, `/lists/:id/import`; global `email_unsubscribes` suppression applied to **every** send path (smart + manual); webhook `email.bounced` now inserts `email_unsubscribes` (so hard bounces enter global suppression); idempotent stat increments (delivered/opened/clicked/bounced guarded on first transition). **No schema / migration.** Map: [W22](./workflows/22_CRM_RELATIONSHIPS_MAILING_LIST.md). |
| **Status** | **fix shipped (code + regression test written) — pending staging `test:w22-crm-security` + `build`/`batch-a` green before closure** (per /harden: no closure without a test run) |

### W23-DRIFT-001 — Marketing media pipeline: ffmpeg on storage path; streamed upload not persisted; consent gap

| Field | Value |
|-------|-------|
| **Severity** | Medium — functional breakage in the **parked Marketing Run A** surface (verifier flagged Critical/money; downgraded — no data loss/security/tender-block) |
| **Module** | Marketing / Media (W23) — PARKED |
| **Symptom** | `reexportAsset`/`assembleExport` feed a Supabase **storage key** to ffmpeg with no download → export fails at runtime; `POST /api/marketing/media/upload-video` leaves `storage_path: null` (streamed upload never persisted) → later export can't find the file; `consent_for_marketing` enforced only on `/assemble`, not on generate/stream/preload/export. |
| **Evidence (verified from code)** | [marketingMedia.mjs](../../server/lib/marketingMedia.mjs) L259-276, L637-647, L672-687; [marketingRoutes.mjs](../../server/lib/marketingRoutes.mjs) L862-944, L1454-1462; [videoIntelligence.mjs](../../server/lib/videoIntelligence.mjs) L561-617 |
| **Smallest-safe fix** | Download-before-ffmpeg in reexport/assemble; persist streamed uploads to storage + write `storage_path`; consent check at all processing entry points |
| **Test** | W23-DRIFT-001 |
| **Status** | **confirmed — open (map W23 first; parked surface)** |

### W24-DRIFT-001 — Marketing Intelligence: stale model id + silent failure + Meta token-in-URL

| Field | Value |
|-------|-------|
| **Severity** | Medium — admin-gated; functional (silent) + security-hygiene (verifier flagged High/Critical; downgraded — admin-gated, server↔Meta, logs-only blast radius) |
| **Module** | Marketing Intelligence (W24) |
| **Symptom** | Dashboard AI summary uses malformed/retired model id `claude-haiku-20240307` and `} catch { /* non-fatal */ }` swallows the error → `ai_summary: null` silently; Meta access token passed in URL query string (`…/insights?…&access_token=…`) → leaks to proxy/CDN/access logs. |
| **Evidence (verified from code)** | [marketingIntelligenceRoutes.mjs](../../server/lib/marketingIntelligenceRoutes.mjs) L577 (model), L583 (silent catch), L603 (route is `requireRole("admin")`), L632 (token-in-URL) |
| **Smallest-safe fix** | Use a current model id / `CLAUDE_MODEL` env; log the caught error; move Meta token to `Authorization: Bearer` header |
| **Test** | W24-DRIFT-001 |
| **Status** | **confirmed — open (map W24 first)** |

---

## Severity

| Level | Meaning |
|-------|---------|
| **Critical** | Data loss, wrong-job match, security exposure, blocked tender workflow |
| **High** | Quote status wrong on a screen staff rely on; supplier email missed |
| **Medium** | Inconsistent UI, audit gap, redundant writes |
| **Low** | Cosmetic, docs drift, nice-to-have |

---

## Fixed — Workflow 01 Lead / CRM Intake

### W01-DRIFT-001 — Unequal creation audit trail

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | Sales / CRM / Marketing |
| **Symptom** | Website and CRM leads had no `lead_activities` “Lead created” row |
| **Fix** | `insertLeadCreatedActivity()` in [leadActivities.mjs](../../server/lib/leadActivities.mjs) — manual, public enquiry, CRM convert (P0-A2, 2026-06-24) |
| **Test** | W01-API-01, W01-API-02, W01-API-03 — **pass** (`npm run test:batch-a:write` 2026-06-25) |
| **Status** | **fixed** |

### W01-DRIFT-002 — Pipeline ignores `leads.name`

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | Sales UI |
| **Symptom** | Website leads showed blank names on pipeline cards |
| **Fix** | `displayLeadName()` in [leadUtils.js](../../src/lib/leadUtils.js) — SalesPipeline + LeadDetail (P0-A1, 2026-06-24) |
| **Test** | W01-E2E-02 — **pass** (`npm run test:e2e -- e2e/tests/workflows/batch-a` 2026-06-25) |
| **Status** | **fixed** |

---

## Open — Workflow 02 Qualification / Discovery

Doc: [workflows/02_LEAD_QUALIFICATION_DISCOVERY.md](./workflows/02_LEAD_QUALIFICATION_DISCOVERY.md)

### W02-DRIFT-001 — Outcome dates/reason not stamped on stage move

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | Sales |
| **Symptom** | `won_at`, `lost_at`, `lost_reason` never set when stage → won/lost |
| **Root cause** | PATCH handler updates stage + activity only ([salesRoutes.mjs:556–564](../../server/lib/salesRoutes.mjs)); Mark Lost UI patches stage only ([LeadDetail.jsx:1231](../../src/pages/LeadDetail.jsx)) |
| **Test** | W02-API-04 |
| **Decision** | — |
| **Status** | **fixed** (2026-06-27) — OUTCOME-STAMP-01: PATCH stamps `won_at`/`lost_at` on terminal stage move; `lost_reason` from request body only; `test:w02-qualification:write` |

### W02-DRIFT-002 — SOP qualifying score as percentage vs UI /8

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Module** | Docs / Sales |
| **Symptom** | SOP 02-04 says percentage; UI shows `/8` |
| **Test** | W02-API-01 |
| **Decision** | SAM-W02-001 |
| **Status** | open |

### W02-DRIFT-003 — qualify_score COALESCE(null,0) treats missing as zero

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Sales / DB |
| **Symptom** | Partial qualification reads as low numeric score |
| **Root cause** | Generated column in [016_sales_manager.sql:22–25](../../supabase/migrations/016_sales_manager.sql) |
| **Test** | W02-API-01 |
| **Status** | open |

### W02-DRIFT-004 — Transcript apply without field-level provenance

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Sales / AI |
| **Symptom** | AI-applied fields lack per-field audit; `name`/`site_address` not applyable |
| **Root cause** | [salesRoutes.mjs:873–899](../../server/lib/salesRoutes.mjs) |
| **Test** | W02-API-06, W02-API-07 |
| **Decision** | SAM-W02-004 |
| **Status** | open |

### W02-DRIFT-005 — LEAD_STAGES constant unused in sales module

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Sales |
| **Symptom** | Stage strings duplicated in LeadDetail, SalesPipeline, SalesScorecard, salesRoutes |
| **Root cause** | [constants.js](../../src/lib/constants.js) not imported |
| **Status** | open — extends W01-DRIFT-008 |

### W02-DRIFT-006 — Stage gate bypass — qualification-specific consequence

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | Sales |
| **Symptom** | Qualification-specific consequence of pipeline/API gate bypass — e.g. discovery or tender before qualification readiness (score, job_id, preconstruction_fee) |
| **Root cause** | `GATE_REQUIREMENTS` LeadDetail only; [SalesPipeline.jsx:602–608](../../src/pages/SalesPipeline.jsx); PATCH ungated |
| **Related** | **W01-DRIFT-003** — intake/pipeline-level bypass (shared root cause). **Do not fix separately** — one shared gate-bypass fix should address both |
| **Test** | W02-API-03, W02-UI-02 |
| **Decision** | **SAM-W02-002 — B (advisory + diagnostic logging during hardening):** do not hard-block stage movement yet; log/flag bypasses; add tests around current bypass; enforce server-side only if Sam decides later |
| **Status** | **P1 — accepted advisory gap (W02-API-03 gap-documented)** |

### W02-DRIFT-007 — Nurture/lost as stages vs outcomes

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Sales / reporting |
| **Symptom** | Same `stage` column for pipeline progress and terminal outcomes |
| **Decision** | SAM-W02-003 |
| **Status** | open — document during hardening |

### W02-DRIFT-008 — Scorecard weighted pipeline ≠ qualify score

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Module** | Sales / docs |
| **Symptom** | SOP 02-04 conflates scorecard KPIs with qualify score |
| **Root cause** | `STAGE_PROB × estimated_value` ([salesRoutes.mjs:397–400](../../server/lib/salesRoutes.mjs)) |
| **Status** | open — docs |

### W02-DRIFT-009 — Architect tender skips qualification UI

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Module** | Sales |
| **Symptom** | `architect_tender` hides qualify block; starts at `accepted` |
| **Status** | open — document as intentional variant |

---

## Open — Workflow 03 Fee Proposal / PTSA

Doc: [workflows/03_FEE_PROPOSAL_PTSA.md](./workflows/03_FEE_PROPOSAL_PTSA.md)

### W03-DRIFT-001 — `ptsa_scope_notes` dead column

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Module** | Sales / schema |
| **Symptom** | Migration 045 column unused; app uses `ptsa_project_scope` (048) |
| **Files** | [045_ptsa_fields.sql:8](../../supabase/migrations/045_ptsa_fields.sql), [LeadDetail.jsx:1703](../../src/pages/LeadDetail.jsx) |
| **Test** | — |
| **Status** | open |

### W03-DRIFT-002 — PTSA signed without job when `site_address` missing

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | Sales → W04 handoff |
| **Symptom** | mark-signed persists signed state; `convertLeadToJob` skipped non-fatally |
| **Root cause** | [salesRoutes.mjs](../../server/lib/salesRoutes.mjs) — `convertLeadToJob` non-fatal skip |
| **Fix (2026-06-27)** | **PTSA-WARNING-01** — SAM-W03-001 Option B: `provisioning.siteAddressWarning = true` when `jobId === null`; LeadDetail shows orange banner + blocks "Move to Tender" button until site address added |
| **Test** | W03-API-07 — signs lead without address; asserts `provisioning.siteAddressWarning === true` (was gap, now passing) |
| **Status** | **fixed — pending Sam acceptance closure** |

### W03-DRIFT-003 — FeeProposalWizard direct Supabase writes

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Tender / fee proposal |
| **Symptom** | Bypasses `apiFetch`, server validation, audit consistency |
| **Root cause** | [FeeProposalWizard.jsx:494–508](../../src/pages/FeeProposalWizard.jsx) |
| **Test** | W03-UI-01 |
| **Decision** | SAM-W03-002 |
| **Status** | open — consistency risk, not auto-bug |

### W03-DRIFT-004 — Split proposal template sources

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Tender |
| **Symptom** | localStorage + Supabase + bundled public DOCX + embedded PTSA |
| **Files** | module5Routes.mjs, FeeProposalWizard.jsx, salesRoutes.mjs PTSA_TEMPLATE_B64 |
| **Decision** | SAM-W03-003 |
| **Status** | open |

### W03-DRIFT-005 — PTSA template hardcoded vs editable fee templates

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Sales |
| **Symptom** | PTSA uses base64 constant; fee proposal has settings upload |
| **Files** | [salesRoutes.mjs:213](../../server/lib/salesRoutes.mjs) |
| **Status** | open |

### W03-DRIFT-006 — Duplicate signed-date fields

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Sales |
| **Symptom** | `pretender_signed_date` editable always; `ptsa_signed_at` set but not shown |
| **Files** | [024](../../supabase/migrations/024_leads_lead_type.sql), [101](../../supabase/migrations/101_ptsa_signed_dropbox.sql), LeadDetail.jsx |
| **Decision** | SAM-W03-004 |
| **Status** | open |

### W03-DRIFT-007 — Generated proposal may not match current lead fields

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Tender |
| **Symptom** | DOCX snapshot at generate time; lead may change after |
| **Test** | — |
| **Status** | open — unconfirmed |

### W03-DRIFT-008 — Accepted/signed status unclear for W04 handoff

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Symptom** | `fee_proposal_id` never written on accept; W04/tender handoff could not resolve accepted commercial path |
| **Files** | [buildexactIntegrationRoutes.mjs](../../server/lib/buildexactIntegrationRoutes.mjs), LeadDetail.jsx |
| **Fix (2026-06-27)** | `POST /api/fee-proposal/:id/accept` stamps `leads.fee_proposal_id` via job→lead link |
| **Test** | W03-API-05b |
| **Status** | **closed — accepted 2026-06-27 (W03-FEE-LINK-01)** |

### W03-DRIFT-009 — PTSA block hidden at `fee_proposal` stage

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Sales / Lead Detail |
| **Symptom** | `showPreTender` excludes `fee_proposal` stage; PTSA block not rendered while stage still has PTSA/proposal handoff work |
| **Root cause** | [LeadDetail.jsx:1212](../../src/pages/LeadDetail.jsx) |
| **Test** | W03-UI-03 |
| **Status** | open |

---

## Open — Workflow 04 Estimate / Buildxact / Tender Job Setup

Doc: [workflows/04_ESTIMATE_BUILDXACT_TENDER_SETUP.md](./workflows/04_ESTIMATE_BUILDXACT_TENDER_SETUP.md)

### W04-DRIFT-001 — persistRfqs direct Supabase job insert

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | RFQ Engine → jobs spine |
| **Symptom** | Job created via browser Supabase insert when no extraction job id; bypasses POST `/api/jobs` |
| **Root cause** | [RfqEngine.jsx:1678](../../src/pages/RfqEngine.jsx) |
| **Test** | W04-API-02 |
| **Status** | **CLOSED — accepted 2026-06-27** (JOB-SPINE-01). Create → `apiPost("/api/jobs")` + `apiPatch`. Dropbox link stamp remains targeted client update — see **P1-JOBS-API-001** (do not expand pattern). `test:w04-w06-job-spine:write` 6/6. |

### W04-DRIFT-002 — Fact provenance gap on job create paths

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Sales / jobs API |
| **Symptom** | `setFact` only in `convertLeadToJob`; POST `/api/jobs` and persistRfqs skip provenance |
| **Root cause** | [salesRoutes.mjs:295–316](../../server/lib/salesRoutes.mjs), [jobsApiRoutes.mjs:71–85](../../server/lib/jobsApiRoutes.mjs) |
| **Test** | W04-API-01 |
| **Status** | open |

### W04-DRIFT-003 — Address dedup asymmetry

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Jobs API / RFQ |
| **Symptom** | Placeholder skips dedup; paths normalise/dedup differently |
| **Files** | jobsApiRoutes.mjs, RfqEngine.jsx, salesRoutes.mjs |
| **Test** | W04-API-02 |
| **Status** | open |

### W04-DRIFT-004 — buildexact_job_id not set at lead conversion

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Module** | Sales → Buildxact link |
| **Symptom** | convertLeadToJob never sets `buildexact_job_id`; link is later manual/webhook |
| **Test** | — |
| **Status** | open — quality gate |

### W04-DRIFT-005 — Address pending allowed in RFQ workflow

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | RFQ Engine → W05 handoff |
| **Symptom** | Extraction could create `"Address pending"` job; RFQ package/send proceeded |
| **Fix (P0-A3)** | `assertJobReadyForRfqHandoff()` in [jobGuards.mjs](../../server/lib/jobGuards.mjs) — **409** `JOB_ADDRESS_PENDING` on `POST /api/rfq-packages`, package send, `/api/rfq/send` |
| **Decision** | SAM-W04-001 (decided) |
| **Test** | W04-API-05 — `scripts/batch-a/w04-job-setup.mjs` |
| **Status** | **fixed** (2026-06-24) |

### W04-DRIFT-006 — Dual buildexact_job_id jobs vs projects

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Buildxact integration |
| **Symptom** | Webhook/manual may write projects only; consumers read jobs first |
| **Files** | buildexactWebhook.mjs, OperationsProjectDetail.jsx, SOURCE_OF_TRUTH.md |
| **Test** | W04-API-04 |
| **Status** | open — unconfirmed propagation |

### W04-DRIFT-007 — RFQ extraction-created job may not link back to lead until later RFQ persistence

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | RFQ Engine → W04/W05 handoff |
| **Symptom** | `persistJobFromExtraction` created jobs without `lead_id`; lead link deferred to `persistRfqs` |
| **Fix (P0-A4)** | [RfqEngine.jsx](../../src/pages/RfqEngine.jsx) passes `lead_id` + client identity at extraction job create; `stampLeadJobLink()`; [jobsApiRoutes.mjs](../../server/lib/jobsApiRoutes.mjs) stamps `leads.job_id` on POST `/api/jobs` |
| **Test** | W04-API-06 — `scripts/batch-a/w04-job-setup.mjs` |
| **Status** | **fixed** (2026-06-24) — persistRfqs direct insert path unchanged (already had lead_id) |

---

## Open — Workflow 05 Tender Board / Tender Lifecycle

Doc: [workflows/05_TENDER_BOARD_LIFECYCLE.md](./workflows/05_TENDER_BOARD_LIFECYCLE.md)

### W05-DRIFT-001 — Board/Detail direct Supabase reads and writes

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Tender Manager UI |
| **Symptom** | TenderBoard and TenderDetail load/update via Supabase client, not apiFetch |
| **Files** | [TenderBoard.jsx](../../src/pages/TenderBoard.jsx), [TenderDetail.jsx](../../src/pages/TenderDetail.jsx) |
| **Test** | W05-SEC-01 |
| **Status** | open |

### W05-DRIFT-002 — Archive tender has no server API

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Module** | Tender Board |
| **Symptom** | Archive sets `jobs.status = archived` via frontend Supabase only |
| **Files** | TenderBoard.jsx, TenderDetail.jsx |
| **Test** | — |
| **Status** | open |

### W05-DRIFT-003 — Board aggregates rfqs only, not rfq_packages

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | Tender Board |
| **Symptom** | Progress ring uses nested `rfqs`; package-path tenders show 0% quote progress |
| **Evidence** | [TenderBoard.jsx](../../src/pages/TenderBoard.jsx) loads `jobs` + nested `rfqs` only; `quotesRingPct(rfqs)` ignores `rfq_packages` / `rfq_recipients` |
| **Decision** | SAM-W05-001 (open); SAM-W05-006 (decided — no redesign during hardening) |
| **Test** | W05-UI-02, W05-API-08 — `scripts/batch-a/w05-tender-board.mjs`, `e2e/tests/workflows/batch-a/w05-tender-board.spec.js` |
| **Status** | **documented** — P0-A5 baseline complete 2026-06-24; **no product fix applied** |
| **P0-A5 proof** | Job with `rfqs` rows → non-zero %; job with `rfq_packages`/scopes/recipients only → 0% on board |
| **Regression 2026-06-25** | API `--write`: pass · E2E rfqs 50% subtest: pass · E2E package-only 0% subtest: pass (W05-TEST-001 closed 2026-06-25) |


### W05-TEST-001 — E2E package-only board locator strict-mode failure

| Field | Value |
|-------|-------|
| **Severity** | Low (test harness) |
| **Module** | E2E / Tender Board |
| **Symptom** | `w05-tender-board.spec.js` package-only subtest fails: `card.getByText("0%")` matches 32 elements (strict mode) |
| **Root cause** | Locator too broad — many board cards show `0%`; filter `div` matches nested progress rings across page |
| **Product impact** | **None** — API/write baseline confirms W05-DRIFT-003 behaviour; rfqs-job E2E subtest passes |
| **Fix** | Scope assertion to job card `.rounded-card` + Quotes ring span (test-only) — `w05-tender-board.spec.js:138–147` |
| **Test** | W05-UI-02 E2E package-only subtest |
| **Status** | **closed** — fixed 2026-06-25; batch-a E2E 5✓/2 skip |

### W05-DRIFT-004 — Win/lose does not sync leads pipeline

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Sales ↔ Tender handoff |
| **Symptom** | win-finalize / lose-finalize update jobs only; no leads.stage or lead outcome stamps |
| **Files** | [module4Routes.mjs:301–302](../../server/lib/module4Routes.mjs), [module4Routes.mjs:528–529](../../server/lib/module4Routes.mjs) |
| **Test** | W05-API-02 |
| **Status** | open |

### W05-DRIFT-005 — Batch PO passes empty projectId

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Tender Detail / PO |
| **Symptom** | `issueBatchPos` reads `rfq.project_id` but rfqs table has no project_id column |
| **Root cause** | [TenderDetail.jsx:739](../../src/pages/TenderDetail.jsx), [001_blue_leaf_schema.sql:37](../../supabase/migrations/001_blue_leaf_schema.sql) |
| **Test** | W05-API-04 |
| **Status** | open — unconfirmed if po/issue resolves via jobId |

### W05-DRIFT-006 — Win emails split across two API calls

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Module** | Tender Detail |
| **Symptom** | win-finalize called with `emails: []`; outcome-mails sent separately |
| **Files** | [TenderDetail.jsx:604–628](../../src/pages/TenderDetail.jsx) |
| **Test** | W05-API-01 |
| **Status** | open — document pattern |

### W05-DRIFT-007 — DRIFT-014 may affect TenderDetail accept

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Tender / RFQ cross-cutting |
| **Symptom** | PATCH /api/rfq expects quote_amount; inbound may use different field names |
| **Related** | DRIFT-014 |
| **Test** | — |
| **Status** | open — unconfirmed on detail UI |

### W05-DRIFT-008 — job-delete blocked when rfq_packages or rfqs linked

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | Tender Board / job delete |
| **Symptom** | Hard delete allowed despite linked RFQ package/quote data; FK conflict risk |
| **Root cause** | [jobsApiRoutes.mjs:181–200](../../server/lib/jobsApiRoutes.mjs) did not pre-check `rfq_packages` / `rfqs` |
| **Fix (P0-A6)** | Return **409** `TENDER_HAS_RFQ_DATA` — "Archive it instead of deleting." per SAM-W05-003 |
| **Test** | W05-API-05 — `scripts/batch-a/w05-tender-board.mjs` (`runW05P0A6`) |
| **Decision** | SAM-W05-003 (decided) |
| **Status** | **fixed** (2026-06-24) — block only; archive API audit trail deferred |

### W05-DRIFT-009 — Won tender ops handoff not fully proven

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Tender → Operations handoff |
| **Symptom** | win-finalize creates/enriches project + cost_intelligence; procurement/schedule/portal/WHS readiness unmapped (W09+) |
| **Test** | W05-E2E-01 |
| **Decision** | SAM-W05-005 |
| **Status** | **documented** — W09 mapped 2026-06-25; see W09-DRIFT-001/007 |

### W05-STRUCTURAL-001 — Tender Board workflow model may be too blunt for real tender operations

| Field | Value |
|-------|-------|
| **Severity** | High — workflow design risk |
| **Module** | W05 Tender Board / lifecycle model |
| **Symptom** | Board is jobs + rfqs cockpit; real tender has more phases than jobs.status represents; package progress not on board |
| **Evidence** | [TenderBoard.jsx](../../src/pages/TenderBoard.jsx); rfq_packages path; W05-DRIFT-003/004/008/009 |
| **Expected future model** | Board = pipeline/risk view; Detail = control room; Package Detail = workbench; Win = ops checklist |
| **Hardening stance** | Map/test current behaviour; do not add workflow logic to wrong surface until SAM-W05-006 decided |
| **Decision** | SAM-W05-006 |
| **Status** | **P1 — design parked (SAM-W05-006: no Tender Board redesign during hardening)** |

---


## Open — Workflow 06 RFQ Package / Scope Extraction

> Cross-cutting RFQ drifts (DRIFT-004–008) remain in § RFQ / Tender drift below. W06 IDs are workflow-scoped for Batch B mapping.

### W06-DRIFT-001 — persistRfqs bypasses server job create path

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | RfqEngine |
| **Symptom** | Job insert via browser Supabase when no extraction job id — skips dedup/normalisation |
| **Related** | W04-DRIFT-001 |
| **Test** | W06-API-03, W04-API-02 |
| **Status** | **CLOSED — accepted 2026-06-27** (JOB-SPINE-01; alias W04-DRIFT-001). Do not reopen. |

### W06-DRIFT-002 — Dual canonical paths (Engine vs Package Detail)

| Field | Value |
|-------|-------|
| **Severity** | High → **reclassified doc/training** (2026-06-27) |
| **Module** | RFQ / Tender |
| **Symptom** | Flow A creates package after send; Flow B edits existing package; SOP/training unclear |
| **Decision** | **SAM-W06-001 decided Option A** — Engine primary; Package Detail review/control only; no unification during hardening |
| **Test** | W06-UI-01, W06-E2E-01; operating model in W06 workflow §22 |
| **Status** | **accepted operating model — doc-only** (not a product bug; SOP alignment deferred post-hardening) |

### W06-DRIFT-003 — SOP / UI naming mismatch (Engine vs Packages)

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Docs / RFQ |
| **Symptom** | SOP 04-xx labels Package UI as "Engine"; wizard path undocumented |
| **Test** | — |
| **Status** | open |

### W06-DRIFT-004 — Email-only recipients have no rfqs row

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | RFQ packages |
| **Related** | DRIFT-004 |
| **Fix** | **SAM-W07-002 Option C** — manual-resolve only; see DRIFT-004 for full rationale. |
| **Test** | W06-API-08 validates manual-resolve path. |
| **Status** | **CLOSED as accepted gap 2026-06-27** — alias of DRIFT-004; SAM-W07-002 decided; DRIFT-004-DOC-01 |

### W06-DRIFT-005 — Dual outbound send paths

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | RFQ |
| **Related** | DRIFT-005 |
| **Test** | W06-API-05, W06-API-06 |
| **Status** | open — threading fixed; paths not unified |

### W06-DRIFT-006 — Package snapshot fails after engine sends

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | RfqEngine |
| **Related** | DRIFT-006 |
| **Symptom** | All sends succeed; POST `/api/rfq-packages` fails; session reset + success banner hid failure |
| **Fix** | P0-B1 (2026-06-25): keep session on finalize fail; warning banner + Retry package creation (no resend) |
| **Files** | [`RfqEngine.jsx`](../../src/pages/RfqEngine.jsx) `finalizeAllSentPackage`, `retryPackageSnapshot` |
| **Test** | W06-API-07 (`npm run test:w06-finalize:write`) |
| **Status** | **fixed** (2026-06-25) |

### W06-DRIFT-007 — Dual coverage calculators

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Module** | RFQ packages |
| **Related** | DRIFT-007 |
| **Test** | W06-UI-02 |
| **Status** | open |

### W06-DRIFT-008 — API camelCase vs UI snake_case on nested keys

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | RFQ Package UI |
| **Symptom** | Package List / Detail showed empty scopes, coverage, address when API returned camelCase |
| **Related** | DRIFT-008, BUG-007 (parking lot alias — was mis-tagged W06-DRIFT-001) |
| **Fix** | `src/lib/rfqPackageUtils.js` + read-path updates in `RfqPackageList.jsx`, `RfqPackageDetail.jsx` |
| **Test** | W06-UI-02 — **pass** (`npm run test:w06-shape:write` 2026-06-25) |
| **Status** | **fixed** |

---

## Open — RFQ / Tender drift

### DRIFT-001 — Package send lacks `sent_message_id`

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Module** | Tender / RFQ packages |
| **Symptom** | Supplier replies to package additional sends not matched by email thread |
| **Root cause** | `POST /api/rfq-packages/:id/scopes/:tradeId/send` uses `sendPlainMail` without `Message-ID`; `rfqs` insert omits `sent_message_id` |
| **Files** | [`server/lib/rfqPackageRoutes.mjs:666–698`](../../server/lib/rfqPackageRoutes.mjs) |
| **Contrast** | Legacy [`dev-api.mjs` `/api/rfq/send`](../../server/dev-api.mjs) uses `generateOutboundMessageId()` |
| **Fix** | Mirror legacy send threading on package path |
| **Test** | MATCH-01, MATCH-02, RFQ-05, RFQ-19 |
| **Status** | **fixed** (2026-06-22) — package send sets `sent_message_id` + outbound correspondence |

---

### DRIFT-002 — IMAP match does not propagate to package tables

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | Tender / IMAP |
| **Symptom** | Quote shows received on Tender Board; Package Detail recipient still `sent` |
| **Root cause** | `processIncomingQuoteMessage` updated `rfqs` only |
| **Fix** | `applyInboundQuoteToWorkflow` in [`server/lib/rfqQuotePropagation.mjs`](../../server/lib/rfqQuotePropagation.mjs) |
| **Test** | `scripts/test-rfq-unmatched-resolve.mjs`, `e2e/tests/smoke/api-rfq-unmatched.spec.js` |
| **Status** | **fixed** (2026-06-22) |

---

### DRIFT-003 — Manual unmatched resolve does not propagate to package tables

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | Tender / unmatched |
| **Fix** | Same `applyInboundQuoteToWorkflow` helper + soft-resolve |
| **Test** | `scripts/test-rfq-unmatched-resolve.mjs`, `e2e/tests/smoke/api-rfq-unmatched.spec.js` |
| **Status** | **fixed** (2026-06-22) |

---

### DRIFT-004 — Email-only recipients invisible to IMAP matcher

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | Tender / RFQ packages |
| **Symptom** | Ad-hoc email invites never auto-match inbound quotes |
| **Root cause** | `rfqs.subcontractor_id NOT NULL`; package send skips `rfqs` insert; `fetchOpenRfqCandidates` queries `rfqs` only |
| **Files** | [`rfqPackageRoutes.mjs:681–684`](../../server/lib/rfqPackageRoutes.mjs), [`dev-api.mjs` fetchOpenRfqCandidates](../../server/dev-api.mjs) |
| **Fix** | **SAM-W07-002 decided Option C** — manual-resolve only during hardening; do not extend IMAP matcher to `rfq_recipients`. Staff use Hub Correspondence tab to manually match inbound quotes from email-only recipients. |
| **Test** | W06-API-08 proves manual-resolve path works. Auto-match extension deferred post-hardening. |
| **Status** | **CLOSED as accepted gap 2026-06-27** — SAM-W07-002 = Option C (manual-resolve only); DRIFT-004-DOC-01 |

---

### DRIFT-005 — Dual outbound send paths with inconsistent metadata

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Tender |
| **Symptom** | Match reliability depends on which UI staff used to send |
| **Root cause** | RfqEngine → `/api/rfq/send`; Package → `send-scope` |
| **Fix** | DRIFT-001 + long-term unify send helper (post-hardening) |
| **Test** | RFQ-04 vs RFQ-05 |
| **Status** | open |

---

### DRIFT-006 — Package snapshot can fail after emails sent

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | RfqEngine |
| **Symptom** | RFQs in Direct tab; no package in Packages tab |
| **Root cause** | `finalizeAllSentPackage` POST can fail after all sends succeed |
| **Files** | [`src/pages/RfqEngine.jsx`](../../src/pages/RfqEngine.jsx) |
| **Fix** | P0-B1: recoverable failure state + retry (no email resend) — see W06-DRIFT-006 |
| **Test** | W06-API-07 |
| **Status** | **fixed** (2026-06-25) |

---

### DRIFT-007 — Dual coverage calculators

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Module** | RFQ packages |
| **Symptom** | Coverage % jumps differently after additional send vs opening package |
| **Root cause** | `recomputePackageCoverage` (count/32) vs `reconcilePackageTradeCoverage` (intel) |
| **Files** | [`rfqPackageRoutes.mjs:969–981`](../../server/lib/rfqPackageRoutes.mjs), [`rfqTradeIntelligence.mjs`](../../server/lib/rfqTradeIntelligence.mjs) |
| **Fix** | Use reconcile everywhere; remove dead `computeCoverageScore` |
| **Test** | — |
| **Status** | open — defer post-P0 |

---

### DRIFT-008 — API camelCase vs frontend snake_case on package nested keys

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | RFQ packages UI |
| **Symptom** | Package status summary may show empty scopes |
| **Root cause** | Server `rowToCamel`; UI read `pkg.rfq_trade_scopes` |
| **Fix** | **Superseded by W06-DRIFT-008** — `src/lib/rfqPackageUtils.js` + `RfqPackageList.jsx` + `RfqPackageDetail.jsx` |
| **Test** | W06-UI-02 pass (`npm run test:w06-shape:write` 2026-06-25) |
| **Status** | **fixed** — superseded by W06-DRIFT-008; do not duplicate |

---

### DRIFT-009 — Unmatched resolve deletes row; audit columns unused

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Fix** | Resolve now sets `resolved_at`, `matched_rfq_id`, `matched_job_id` |
| **Test** | U7 in `scripts/test-rfq-unmatched-resolve.mjs` |
| **Status** | **fixed** (2026-06-22) |

---

### DRIFT-010 — Ambiguous sender / address matching

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Module** | IMAP matcher |
| **Symptom** | Quote attached to wrong job when same sub on multiple tenders or similar addresses |
| **Root cause** | `matchBySenderSubcontractor` returns first match; subject_address has no job disambiguation |
| **Files** | [`imapQuoteMatch.mjs:88–127`](../../server/lib/imapQuoteMatch.mjs) |
| **Fix** | **P0-B3 shipped:** Option A+B hybrid — unique subject/address only; sender multi-candidate guard; tie → unmatched |
| **Test** | W07-API-06, MATCH-09/11/20 (`npm run test:w07-matcher`) |
| **Status** | **fixed** (2026-06-25) — ambiguous sender/address returns null → `unmatched_quote_emails` |

---

### DRIFT-011 — First IMAP poll skips inbox backlog

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | IMAP poll |
| **Symptom** | Existing inbox quotes not processed on first deploy |
| **Root cause** | Poll initializes cursor to current UID without processing |
| **Files** | [`dev-api.mjs` pollImapForQuoteReplies](../../server/dev-api.mjs) |
| **Fix** | Document ops procedure; optional backfill flag |
| **Test** | — |
| **Status** | open — document |

---

### DRIFT-012 — Unmatched list endpoint unauthenticated

| Field | Value |
|-------|-------|
| **Severity** | High (security) |
| **Fix** | `requireAuth` + `requireRole("admin")` on GET |
| **Test** | U2b in `scripts/test-rfq-unmatched-resolve.mjs`, Playwright api-rfq-unmatched |
| **Status** | **fixed** (2026-06-22) |

---

### DRIFT-013 — Manual resolve does not import PDF or amount

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Unmatched resolve |
| **Symptom** | Staff must re-enter quote amount after manual match |
| **Root cause** | Resolve only sets `status: received`; no IMAP re-fetch |
| **Files** | [`jobsApiRoutes.mjs:226–242`](../../server/lib/jobsApiRoutes.mjs) |
| **Fix** | Re-parse stored preview or link to original message if available |
| **Test** | MATCH-13 |
| **Status** | open — defer if manual amount entry acceptable |

---

### DRIFT-014 — Accept button requires `quote_amount` not `quoted_amount`

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | TenderDetail UI |
| **Symptom** | IMAP-extracted amount visible but Accept disabled |
| **Root cause** | `canToggle` checks `quote_amount > 0`; IMAP sets `quoted_amount` |
| **Files** | [`TenderDetail.jsx`](../../src/pages/TenderDetail.jsx) |
| **Fix** | Accept when either field > 0; or copy on display |
| **Test** | RFQ-15 / W08-API-02 |
| **Status** | open — **alias W08-DRIFT-001** |

---

## Open — Security (from adversarial audit)

### QA-001-GAP-10 — Portal admin generate-token employee role bypass (CLOSED)

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Parent** | QA-001 (Tier-0 **closed**) |
| **Reference** | [QA_001_SECURITY_ROUTE_BASELINE_PLAN.md](./QA_001_SECURITY_ROUTE_BASELINE_PLAN.md) · [18_CLIENT_PORTAL_LIFECYCLE.md](./workflows/18_CLIENT_PORTAL_LIFECYCLE.md) |
| **Route** | `POST /api/portal/admin/generate-token` |
| **Fix** | `requireRole("admin")` on generate-token handler — `portalRoutes.mjs` |
| **Test** | W18-SEC-02 · QA-SEC-05 — `npm run test:qa-sec-baseline` |
| **Status** | **CLOSED 2026-06-22** — W18-P0-04 shipped; employee + supervisor → 403; admin allowed |

---

## Closed — Security

### QA-001 — Tier-0 unauthenticated routes (CLOSED)

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Reference** | [ADVERSARIAL_AUDIT_2026-06-23.md](./ADVERSARIAL_AUDIT_2026-06-23.md) · [QA_001_SECURITY_ROUTE_BASELINE_PLAN.md](./QA_001_SECURITY_ROUTE_BASELINE_PLAN.md) |
| **Routes fixed** | cron (CRON_SECRET or admin), mail/inbox, dropbox/* (4), reextract-amount, csv-template-sheet, blueprint AI (4 routes) |
| **Test** | `npm run test:qa-sec-baseline` — **21/21 pass** (2026-06-22, post API restart) |
| **Status** | **CLOSED — Tier-0 accepted 2026-06-22** |
| **Proven gaps closed** | QA-001-GAP-01–08 |
| **Deferred (not Tier-0)** | ~~QA-001-GAP-10~~ **closed** — W18-P0-04 (2026-06-22) |

---

## Batch B parking lot (pre-confirmed — do not implement)

Code-backed findings registered ahead of W06–W09 **fixes**. Mapping gate: Batch A hardening result complete ([BATCH_A_HARDENING_RESULT.md](./BATCH_A_HARDENING_RESULT.md) §9). **No Batch B implementation.** W06–W08 workflow maps exist; W09 not mapped.

**Verification legend:** `confirmed` = matches current repo · `partially fixed` = baseline drift addressed in code but gaps remain · `needs runtime test` = code path exists; behaviour not proven in prod

### W06-PARK-001 — API camelCase vs frontend snake_case on package nested keys (alias W06-DRIFT-008)

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Module** | W06 RFQ Package UI |
| **Symptom** | Package List / Package Detail may show empty scopes, coverage, or metadata when DB rows exist |
| **Evidence (confirmed)** | [`apiResponse.mjs`](../../server/lib/apiResponse.mjs) `rowToCamel()` recurses nested keys · [`rfqPackageRoutes.mjs`](../../server/lib/rfqPackageRoutes.mjs) returns `rowsToCamel()` / `rowToCamel()` on `/api/rfq-packages` · [`RfqPackageList.jsx`](../../src/pages/RfqPackageList.jsx) reads `pkg.rfq_trade_scopes`, `pkg.project_address`, `pkg.tender_deadline`, `pkg.coverage_score` · [`RfqPackageDetail.jsx`](../../src/pages/RfqPackageDetail.jsx) reads `pkg.rfq_trade_scopes`, `scope.rfq_recipients`, `pkg.suggested_trades`, `pkg.trade_coverage`, `pkg.missing_trade_analysis` |
| **Map alias** | Same as mapped [W06-DRIFT-008](./workflows/06_RFQ_PACKAGE_SCOPE_EXTRACTION.md) |
| **Test** | W06-UI-02 |
| **Status** | parking — **confirmed** |

### W06-DRIFT-006 — Package creation after outbound emails (Engine finalize failure mode)

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Module** | W06 RFQ Engine |
| **Symptom** | All engine sends succeed but no `rfq_packages` row — staff left with Direct RFQs / correspondence only |
| **Evidence (confirmed)** | Pre-fix: `finalizeAllSentPackage()` called `resetRfqSession()` + success banner on POST failure |
| **Fix** | P0-B1 (2026-06-25): warning + Retry package creation; session preserved |
| **Map alias** | Same as mapped W06-DRIFT-006 in workflow map |
| **Test** | W06-API-07 |
| **Status** | **fixed** (2026-06-25) — **duplicate register entry removed 2026-06-27** (was mis-ID'd as W06-DRIFT-002) |

### W07-DRIFT-001 — Package send `sent_message_id` (baseline vs current repo)

| Field | Value |
|-------|-------|
| **Severity** | **High** (when unfixed) |
| **Module** | W07 RFQ Send |
| **Symptom** | IMAP matcher cannot thread-match package-path replies |
| **Baseline claim** | Package send called `sendPlainMail()` without generating/storing `sent_message_id` |
| **Current repo (partially fixed)** | [`rfqPackageRoutes.mjs`](../../server/lib/rfqPackageRoutes.mjs) `POST .../scopes/:tradeId/send` calls `generateOutboundMessageId()`, passes `Message-ID` header, stores `rfqs.sent_message_id` **when `subcontractor_id` exists** (rfqs row created) |
| **Remaining gap** | Resend transport strips custom Message-ID ([W07-DRIFT-005](#w07-drift-005--resend-strips-custom-message-id-weakening-reply-thread-matching)); email-only recipients skip rfqs row ([W07-DRIFT-002](#w07-drift-002--email-only-package-recipients-are-not-imap-matchable)) |
| **Cross-ref** | Pre-tracker DRIFT-001 |
| **Test** | W06-API-06 / RFQ-05 pass; W07-API-04 needed for Resend path |
| **Status** | parking — **partially fixed** |

### W07-DRIFT-002 — Email-only package recipients are not IMAP-matchable

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Module** | W07 RFQ Send / IMAP matcher |
| **Symptom** | Ad-hoc email-only recipients tracked in `rfq_recipients` only; inbound quotes never auto-match |
| **Evidence (confirmed)** | Package send creates `rfqs` row only when `subcontractor_id` present ([`rfqPackageRoutes.mjs`](../../server/lib/rfqPackageRoutes.mjs) ~696–700) · IMAP poll candidates fetched from `rfqs` only ([`dev-api.mjs`](../../server/dev-api.mjs) `fetchOpenRfqCandidates`) |
| **Map alias** | W06-DRIFT-004 / DRIFT-004 |
| **Test** | W06-API-08, RFQ-20 |
| **Status** | parking — **confirmed** |

### W07-DRIFT-003 — Inbound quote propagation to package tables

| Field | Value |
|-------|-------|
| **Severity** | **High** (when unfixed) |
| **Module** | W07 RFQ Send / Quote Matching |
| **Symptom** | Quote received on `rfqs` but Package Detail still shows pending |
| **Baseline claim** | `processIncomingQuoteMessage()` updated `rfqs` + correspondence only |
| **Current repo (partially fixed)** | [`dev-api.mjs`](../../server/dev-api.mjs) calls [`applyInboundQuoteToWorkflow()`](../../server/lib/rfqQuotePropagation.mjs) after rfqs update · helper updates linked `rfq_recipients`, `rfq_trade_scopes`, reconciles `rfq_packages` **when `rfq_recipients.rfq_id` link exists** |
| **Remaining gap** | Email-only / unlinked recipients — no propagation path |
| **Cross-ref** | Pre-tracker DRIFT-002 |
| **Test** | W07-API-03 cross-screen regression |
| **Status** | parking — **partially fixed** |

### W07-DRIFT-004 — RFQs sent via Resend do not appear in Apple Mail / mailbox Sent folder

| Field | Value |
|-------|-------|
| **Severity** | Medium — operational traceability |
| **Module** | W07 RFQ Send / Quote Matching |
| **Symptom** | Staff cannot confirm RFQ send via Apple Mail / Gmail Sent folder |
| **Evidence** | [`notifyMail.mjs`](../../server/lib/notifyMail.mjs) prefers Resend → Gmail OAuth → SMTP; [`resendSend.mjs`](../../server/lib/resendSend.mjs) sends via Resend HTTPS API; when `RESEND_API_KEY` set, outbound RFQs bypass mailbox account |
| **Impact** | Hub `correspondence` log is the reliable outbound audit trail unless app also appends sent copies to mailbox |
| **Future options** | A) Hub correspondence SoT · B) Gmail/SMTP send for mailbox visibility · C) Resend + BCC/archive/IMAP-append |
| **Hardening rec** | **A** — keep Resend-first; document clearly that Sent mailbox will not show RFQs |
| **Decision** | SAM-W07-001 (open) |
| **Status** | parking |

### W07-DRIFT-005 — Resend strips custom Message-ID, weakening reply-thread matching

| Field | Value |
|-------|-------|
| **Severity** | High — quote matching reliability |
| **Module** | W07 RFQ Send / IMAP matcher |
| **Symptom** | Replies may not match `rfqs.sent_message_id` via In-Reply-To / References |
| **Evidence** | Legacy `/api/rfq/send` stores `generateOutboundMessageId()` in `rfqs.sent_message_id`; [`resendSend.mjs`](../../server/lib/resendSend.mjs) strips Message-ID header; IMAP matcher prioritises thread headers against `sent_message_id` |
| **Impact** | Valid quotes may land in `unmatched_quote_emails` or match via weaker subject/address/sender fallback |
| **Required test** | W07-API-04 — Resend-sent RFQ reply matched when provider Message-ID differs from stored id |
| **Future fixes** | Store provider Message-ID · custom `X-BlueLeaf-RFQ-ID` header · stronger fallback · Gmail/SMTP when thread match matters |
| **Hardening rec** | Do not redesign transport; document, test, confirm Resend custom header preservation |
| **Status** | parking — **confirmed** |

### W07-DRIFT-006 — Ambiguous sender/address matching can attach quote to wrong RFQ/job

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Module** | W07 IMAP matcher |
| **Symptom** | Same subcontractor email on multiple open RFQs → first candidate wins |
| **Evidence (confirmed)** | [`imapQuoteMatch.mjs`](../../server/lib/imapQuoteMatch.mjs) `matchBySenderSubcontractor` — first match in `created_at DESC` order · MATCH-09 gap |
| **Test** | W07-API-06, MATCH-09/11/20 (`npm run test:w07-matcher`) |
| **Status** | **fixed** (2026-06-25) — `resolveInboundRfqMatchWithMeta` ambiguity guards |

### W07-DRIFT-007 — First IMAP poll may skip existing inbox backlog

| Field | Value |
|-------|-------|
| **Severity** | **Medium** |
| **Module** | W07 IMAP poll |
| **Symptom** | INBOX messages present before first poll never auto-matched |
| **Evidence (confirmed)** | [`dev-api.mjs`](../../server/dev-api.mjs) `pollImapForQuoteReplies` — `lastUid == null` → set cursor, `checked: 0` |
| **Test** | W07-API-07 · **Decision:** SAM-W07-003 |
| **Status** | parking — **confirmed** |

### W07-DRIFT-008 — Manual unmatched resolve may not import PDF/amount

| Field | Value |
|-------|-------|
| **Severity** | **Medium** |
| **Module** | W07 manual resolve |
| **Symptom** | Package received but no `quote_amount` after manual match |
| **Evidence (confirmed)** | [`jobsApiRoutes.mjs`](../../server/lib/jobsApiRoutes.mjs) resolve uses `body_preview` only; no PDF/amount extraction |
| **Test** | W07-API-08 |
| **Status** | parking — **confirmed** |

### W07-DRIFT-009 — Matcher/idempotency behaviour needs baseline test

| Field | Value |
|-------|-------|
| **Severity** | **Medium** |
| **Module** | W07 IMAP matcher |
| **Symptom** | Duplicate message_id + poll re-run not in CI baseline |
| **Evidence (confirmed)** | [`test-imap-quote-match.mjs`](../../scripts/test-imap-quote-match.mjs) MATCH-14/15 missing |
| **Test** | MATCH-14, MATCH-15, W07-API-04 |
| **Status** | parking — **confirmed** |

### W07 source-of-truth (mapped)

See [workflows/07_RFQ_SEND_QUOTE_MATCHING.md](./workflows/07_RFQ_SEND_QUOTE_MATCHING.md) §13. Runtime (2026-06-25): **`mail.transport: resend`**.

| Artifact | Role |
|----------|------|
| `correspondence` table | App outbound/inbound audit trail (SoT during hardening) |
| `rfqs.sent_message_id` | Intended thread match id (weakened when Resend active) |
| `rfqs.resend_email_id` | Resend engagement/webhook id — not mailbox sent record |
| Mailbox Sent folder | **Not guaranteed** when Resend is active |

### W07 mapping pre-checks — **complete (2026-06-25)**

| Check | Result |
|-------|--------|
| Active mail transport | **Resend** (`GET /api/integrations/status`) |
| Outbound RFQs in mailbox Sent | **No** when Resend active (W07-DRIFT-004) |
| `sent_message_id` vs reply headers | **Mismatch** when Resend strips Message-ID (W07-DRIFT-005) |
| Resend custom headers | Message-ID stripped; other headers pass through |
| W07-DRIFT-001/003 | Partially fixed — gaps documented in W07 map |

### W08-DRIFT-001 — Accept button requires `quote_amount` not `quoted_amount`

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Module** | W08 Quote Accept / TenderDetail |
| **Symptom** | IMAP-extracted amount visible but Accept disabled until staff copies |
| **Evidence (confirmed)** | [`TenderDetail.jsx`](../../src/pages/TenderDetail.jsx) `canToggle`; IMAP writes `quoted_amount` only |
| **Map alias** | DRIFT-014 |
| **Test** | W08-API-02 |
| **Planned fix** | P0-B4 shipped — win wizard warn + Use extracted amount; RFQ card tap-to-use unchanged |
| **Status** | **mitigated** — Accept UI gate unchanged; win wizard warns (P0-B4) |

### W08-DRIFT-002 — Received quote amount may not become accepted amount

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W08 Quote Accept |
| **Evidence (confirmed)** | Re-extract/IMAP → `quoted_amount`; win-finalize → `quote_amount` |
| **Test** | W08-API-02 |
| **Status** | parking — **confirmed** |

### W08-DRIFT-003 — TenderDetail and PackageDetail use different accept rules

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W08 Quote Accept UI |
| **Evidence (confirmed)** | Package modal no amount guard; Tender `canToggle` |
| **Test** | W08-UI-02 |
| **Status** | parking — **confirmed** |

### W08-DRIFT-004 — Accepted state may not sync between rfqs and rfq_recipients

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Module** | W08 Quote Accept |
| **Evidence (confirmed)** | `PATCH /api/rfq/:id` no package propagation |
| **Test** | W08-API-03 (`npm run test:w08-accept:write`); W09-API-05 alignment endpoint |
| **Status** | parking — **confirmed**; **mitigated** by P0-B2 Phase 2 warn-only (`GET /api/tender/:jobId/accept-alignment` + TenderDetail win wizard); bidirectional sync still deferred (SAM-W08-003) |

### W08-DRIFT-005 — Accepted quote may not roll up to scope/package

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W08 Quote Accept |
| **Evidence (confirmed)** | Package PATCH scope update only on `received` |
| **Test** | W08-API-04 (`npm run test:w08-accept:write`) |
| **Status** | parking — **confirmed**; Phase 1 gap-documented (no accept rollup) |

### W08-DRIFT-006 — Accepted quote may not reliably feed win-finalize / cost intelligence

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Module** | W08 → W09 handoff |
| **Evidence (confirmed)** | win-finalize skips null `quote_amount` in cost_intelligence loop |
| **Test** | W08-API-05, W09-API-02 |
| **Planned fix** | P0-B4 shipped — warn before win when accepted lacks quote_amount; no win-finalize change |
| **Status** | **mitigated** — win wizard warn-only (P0-B4); cost_intel skip behaviour unchanged |

### W08-DRIFT-007 — Buildxact accepted quote sync is non-fatal stub

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W08 Buildxact |
| **Evidence (confirmed)** | `syncAcceptedQuoteToBuildexact` always returns skipped |
| **Test** | W08-API-05 (document) |
| **Status** | parking — **confirmed** |

### W08-DRIFT-008 — Manual unmatched resolve without amount/PDF creates weak accept path

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W08 / W07 overlap |
| **Map alias** | W07-DRIFT-008 |
| **Test** | W08-API-02 |
| **Status** | parking — **confirmed** |

### W08 source-of-truth (mapped)

See [workflows/08_QUOTE_COMPARISON_ACCEPT_QUOTE.md](./workflows/08_QUOTE_COMPARISON_ACCEPT_QUOTE.md) §13.

| Rule | SoT during hardening |
|------|---------------------|
| Staff-confirmed amount | `rfqs.quote_amount` (Tender accept + win) |
| Auto-extracted amount | `rfqs.quoted_amount` (suggestion only) |
| Package per-recipient | `rfq_recipients.quote_amount` + `status` |
| Cost intelligence | Written on **win-finalize**, not on accept |

### W09-DRIFT-001 — Win-finalize creates project but not full operations readiness

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Module** | W09 Tender Win / Operations |
| **Symptom** | Project row exists after win; schedule, procurement, WHS, portal enable not auto-created |
| **Evidence (confirmed)** | `module4Routes.mjs` win-finalize; no schedule/procurement/WHS writes |
| **Map alias** | W05-DRIFT-009 |
| **Test** | W09-API-07, W09-E2E-01 |
| **Decision** | SAM-W09-001 |
| **Planned fix** | P0-B5 shipped — read-only ops readiness checklist (Option C+B) |
| **Status** | **mitigated** — checklist surfaces gap; auto-seed deferred |

### W09-DRIFT-002 — Win handoff reads accepted rfqs only; misses package recipients

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Module** | W09 / W08 overlap |
| **Symptom** | Package-only accepts not in win wizard or win-finalize payload |
| **Evidence (confirmed)** | `buildWinRowsFromRfqs`; win-finalize no `rfq_recipients` query |
| **Test** | W09-API-05A–05E (`npm run test:w08-accept:write`); W09-UI-05 manual smoke |
| **Decision** | SAM-W09-002 (**decided** — warn prominently) |
| **Status** | parking — **confirmed**; **mitigated** by P0-B2 Phase 2 warn-only (win path still rfqs-only; staff warned before Mark Won) |

### W09-DRIFT-003 — Accepted quotes with only quoted_amount skip cost_intelligence

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Module** | W09 cost intelligence |
| **Symptom** | win-finalize skips insert when `quote_amount` null/≤0; does not fall back to `quoted_amount` |
| **Evidence (confirmed)** | `module4Routes.mjs:467–469` |
| **Map alias** | W08-DRIFT-006 |
| **Test** | W09-API-02, W09-API-08 |
| **Planned fix** | P0-B4 shipped — warn before win; no silent quoted_amount fallback |
| **Status** | **mitigated** — win wizard warn-only (P0-B4) |

### W09-DRIFT-004 — leads.stage / won_at not synced from tender win

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | Sales ↔ Tender handoff |
| **Symptom** | win-finalize updates jobs only; linked lead unchanged |
| **Evidence (confirmed)** | No `leads` writes in win-finalize |
| **Map alias** | W05-DRIFT-004 |
| **Test** | W09-API-04 (`npm run test:w09-ops-readiness:write`) |
| **Decision** | SAM-W09-003 |
| **Planned fix** | P0-B5 shipped — checklist warns; no lead write on win |
| **Status** | **mitigated** — read-only warning |

### W09-DRIFT-005 — cost_intelligence may be partial from accepted_trades

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W09 cost intelligence |
| **Symptom** | Some accepted trades in wizard produce no cost_intel row if amount missing |
| **Evidence (confirmed)** | Per-trade skip in win-finalize loop |
| **Test** | W09-API-02 |
| **Status** | parking — **confirmed** |

### W09-DRIFT-006 — Batch PO passes empty projectId

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W09 PO handoff |
| **Symptom** | `issueBatchPos` reads `rfq.project_id` (column does not exist); win-finalize returns `project.id` unused |
| **Evidence (confirmed)** | [TenderDetail.jsx:739](../../src/pages/TenderDetail.jsx); po/issue requires projectId |
| **Map alias** | W05-DRIFT-005 |
| **Test** | W09-API-06 (`npm run test:w09-ops-readiness:write`) |
| **Status** | **fixed** — P0-C1 (2026-06-25): TenderDetail + `/api/po/issue` job spine resolve, rfq_id idempotency, full PO issue incl. PDF (W11-DRIFT-006) |

### W09-DRIFT-007 — Schedule / WHS / portal / procurement not seeded on win

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Module** | W09 → Batch C handoff |
| **Symptom** | Operations subsystems require manual setup after win |
| **Evidence (confirmed)** | No win-finalize writes to schedule_tasks, procurement_items, whs_site_profiles, portal_enabled |
| **Test** | W09-API-07 |
| **Planned fix** | P0-B5 shipped — surface missing schedule/procurement/WHS/portal as checklist items |
| **Status** | **mitigated** — checklist surfaces gap |

### W09-DRIFT-008 — Win outcome emails split across two API calls

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Module** | W09 Tender Detail |
| **Symptom** | win-finalize called with `emails: []`; outcome-mails separate — win can succeed without emails |
| **Evidence (confirmed)** | [TenderDetail.jsx:604–628](../../src/pages/TenderDetail.jsx) |
| **Map alias** | W05-DRIFT-006 |
| **Test** | W09-API-01 (document pattern) |
| **Status** | parking — **confirmed** |

### W09-DRIFT-009 — Buildxact accepted quote sync is non-fatal stub

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W09 / Buildxact |
| **Symptom** | `syncAcceptedQuoteToBuildexact` always returns `{ skipped: true }` — no external accept sync |
| **Evidence (confirmed)** | [buildexactDeepIntegration.mjs:81–84](../../server/lib/buildexactDeepIntegration.mjs); called from win-finalize on accept |
| **Map alias** | W08-DRIFT-007 |
| **Test** | W09-API-01 (document) |
| **Status** | parking — **confirmed** |

### W09-DRIFT-010 — Mark Won allows incomplete accepted quote checklist

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Module** | W09 Tender Detail / W08 rule gap |
| **Symptom** | `winStep1Valid()` checks status only — staff can win with accepted trades missing `quote_amount > 0` despite SAM-W08-001 |
| **Evidence (confirmed)** | [TenderDetail.jsx:510–512](../../src/pages/TenderDetail.jsx); win-finalize does not validate amounts |
| **Test** | W09-API-08 |
| **Decision** | SAM-W08-001 (decided business rule; warn-first in P0-B4, block deferred) |
| **Planned fix** | P0-B4 shipped — win wizard warn-only when accepted row lacks quote_amount > 0 |
| **Status** | **mitigated** — Mark Won not blocked; warn + Use extracted amount in wizard |

### W09 source-of-truth (mapped)

See [workflows/09_TENDER_WIN_OPERATIONS_HANDOFF.md](./workflows/09_TENDER_WIN_OPERATIONS_HANDOFF.md) §13.

| Rule | SoT during hardening |
|------|---------------------|
| Win orchestrator | `POST /api/tender/win-finalize` (TenderDetail only) |
| Operations spine | `projects` via 096 trigger + win enrich |
| Accepted trades at win | `rfqs` rows in win wizard payload |
| Per-trade cost benchmark | `cost_intelligence` on win (`quote_amount > 0`) |
| Full ops readiness | **Manual** — schedule, procurement, WHS, portal |

### Batch B status (2026-06-25)

**W06–W09 mapped.** Batch B P0 **complete** (P0-B1–B5). Batch C: [BATCH_C_REVIEW_PACK.md](./BATCH_C_REVIEW_PACK.md).

---

## Batch C — Operations (W10–W15) parking

### W10-DRIFT-001 — No procurement register on win

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | W10 / W09 handoff |
| **Symptom** | `procurement_items` not created on win-finalize |
| **Evidence (confirmed)** | No call in win-finalize; manual generate only |
| **Map alias** | W09-DRIFT-007 |
| **Test** | W10-API-01, W09-API-07 |
| **Status** | **confirmed intentional** — W10-API-06; manual `POST .../generate` only; P0-B5 checklist surfaces gap |

### W10-DRIFT-002 — Dual procurement SSoT (register vs schedule task fields)

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W10 / W12 |
| **Symptom** | Legacy `schedule_tasks.procurement_*` vs `procurement_items` |
| **Evidence (confirmed)** | Migration 085 deprecation; ProcurementPanel still editable |
| **Test** | W10-API-02 |
| **Status** | parking |

### W11-DRIFT-001 — Batch PO passes empty projectId

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W11 PO handoff |
| **Symptom** | `issueBatchPos` reads nonexistent `rfqs.project_id` |
| **Evidence (confirmed)** | TenderDetail.jsx:752 |
| **Map alias** | W09-DRIFT-006 |
| **Test** | W11-API-03 |
| **Status** | **fixed** — P0-C1 correction (2026-06-25); alias W09-DRIFT-006 closed; full PO issue verified |

### W11-DRIFT-006 — PO PDF `.italic()` chain 502

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W11 PO PDF |
| **Symptom** | `/api/po/issue` 502 after projectId resolve — `doc.font(...).fillColor(...).italic is not a function` |
| **Evidence (confirmed)** | [poPdfKit.mjs:150](../../server/lib/poPdfKit.mjs) — PDFKit has no `.italic()`; use `Helvetica-Oblique` |
| **Test** | W11-API-03 (`npm run test:w11-batch-po:write`) |
| **Status** | **fixed** — P0-C1 correction (2026-06-25); PDF `.italic()` chain |

### W11-DRIFT-007 — PO PDF watermark obscures page 1 readability

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Module** | W11 PO PDF |
| **Symptom** | Large Blue Leaf logo watermark competed with Purchase Order title and body text on page 1 |
| **Evidence (confirmed)** | [poPdfKit.mjs](../../server/lib/poPdfKit.mjs) — watermark opacity/scale/position |
| **Test** | W11-UI-01 (local sample + manual smoke) |
| **Status** | **fixed** — faint lower-left watermark (4% opacity, 120px); header logo 48px (2026-06-25) |

### W11-DRIFT-008 — Submitted quote PDF not attached to PO email

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W11 PO email |
| **Symptom** | Issued PO email had generated PO PDF only — no submitted supplier quote despite RFQ quote fields |
| **Evidence (confirmed)** | [module4Routes.mjs](../../server/lib/module4Routes.mjs); [poQuoteAttachment.mjs](../../server/lib/poQuoteAttachment.mjs) — resolves `rfqs.quote_pdf_path` / `quote_pdf_url` / `dropbox_pdf_url` |
| **Test** | W11-API-05/06/07 (`npm run test:w11-batch-po:write`) |
| **Status** | **fixed** — PO email attaches quote PDF when Dropbox download succeeds; non-blocking warning when unavailable (2026-06-25) |

### W11-DRIFT-009 — PO row may persist when email send fails; idempotency suppresses resend

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W11 PO issue / email |
| **Symptom** | `POST /api/po/issue` may insert a PO row, then fail on email send; retry with same `rfq_id` hits idempotency and may not resend |
| **Evidence (confirmed)** | [module4Routes.mjs](../../server/lib/module4Routes.mjs) — insert before send; rfq_id idempotency on retry |
| **Test** | W11-API follow-up (not yet written) |
| **Status** | **open / follow-up** — do not fix in Batch C correction pass |
| **Recommended later behaviour** | Insert PO as draft/pending_email; or send before marking issued; or idempotent retry resends when prior row has no `po_sent_at` |

### W11-DRIFT-003 — `/api/po/issue` no role gate

| Field | Value |
|-------|-------|
| **Severity** | High (security) |
| **Module** | W11 |
| **Symptom** | `requireAuth` only — employee can issue POs |
| **Evidence (confirmed)** | [module4Routes.mjs](../../server/lib/module4Routes.mjs) — was `requireAuth` only |
| **Fix (2026-06-27)** | **W11-PO-SEC-01** — `requireRole("admin")` on `POST /api/po/issue` only (SAM-W11-002 Option A) |
| **Test** | W11-SEC-02 — employee token → 403; admin path unchanged (W11-API-03/04) |
| **Status** | **closed — accepted 2026-06-27 (W11-PO-SEC-01)** |
| **Caveat** | W11-UI-01 manual PDF watermark gap remains documented only — do not reopen W11-PO-SEC-01 |

### W12-DRIFT-002 — Schedule API missing role gate on writes

| Field | Value |
|-------|-------|
| **Severity** | High (security) |
| **Module** | W12 |
| **Symptom** | Employee could POST/PATCH/DELETE schedule tasks via API |
| **Evidence (confirmed)** | [scheduleRoutes.mjs](../../server/lib/scheduleRoutes.mjs) — was `requireAuth` only |
| **Test** | W12-SEC-01/02, W12-API-01/02 (`npm run test:w12-schedule-auth:write`) |
| **Status** | **fixed** — P0-C2 (2026-06-25); `requireRole("admin", "supervisor")` on schedule write routes; Batch C correction adds same gate to `POST /api/schedule/save-analysis-pdf` (external Dropbox filing) |

### W12-DRIFT-004 — Server cascade ignores typed dependencies

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W12 |
| **Symptom** | `cascadeScheduleForward` uses `depends_on` FS-only |
| **Evidence (confirmed)** | scheduleRoutes.mjs |
| **Test** | W12-API-04 |
| **Status** | parking |

### W13-DRIFT-001 — site_diary.photo_paths unused

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W13 |
| **Symptom** | `photo_paths[]` column never populated by UI/API |
| **Evidence (confirmed)** | `siteDiaryRoutes.mjs` insert omits photo_paths |
| **Test** | W13-DRIFT-01 — `test:w13-site-diary-baseline:write` |
| **Status** | **confirmed** — document only; no wire-up in P0-D1 |

### W13-DRIFT-003 — Three media silos (site-media, Dropbox, marketing-media)

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W13 / W23 |
| **Symptom** | No cross-link worker photos → portal → marketing |
| **Evidence (confirmed)** | Separate buckets and tables |
| **Test** | W13-DRIFT-01 / W13-STORAGE-01 |
| **Status** | **confirmed intentional** — SAM-W13-002 No merge during hardening |

### W13-SEC-004 — site_diary permissive RLS (direct Supabase read)

| Field | Value |
|-------|-------|
| **Severity** | High (security — future) |
| **Module** | W13 |
| **Symptom** | mig 044 `authenticated_all_site_diary` may allow portal client JWT direct read |
| **Evidence (inconclusive in test env)** | W13 baseline gap-documented — client direct select returned 0 rows (empty or untested) |
| **Test** | W13-SEC-04 probe in `w13-site-diary-baseline.mjs` |
| **Status** | **open** — RLS lockdown migration deferred; staff API blocks client role |

### W13-SEC-005 — Employee can call /api/diary/structure (AI cost)

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W13 |
| **Symptom** | `POST /api/diary/structure` is requireAuth only |
| **Evidence (confirmed)** | siteDiaryRoutes.mjs |
| **Test** | — |
| **Status** | parking — optional requireRole in future pass |

### W14-DRIFT-001 — No WHS profile on win

| Field | Value |
|-------|-------|
| **Severity** | Medium (process) |
| **Module** | W14 / W09 handoff |
| **Symptom** | `whs_site_profiles` not created on win-finalize |
| **Evidence (confirmed)** | No call in win-finalize; manual WHS setup only |
| **Test** | W14-API-05 — `test:w14-whs-baseline:write` |
| **Status** | **confirmed intentional** — SAM-W14-001 No; P0-B5 checklist surfaces gap |

### W14-DRIFT-002 — WHS engine template coverage 1/N

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W14 |
| **Symptom** | Only `project_whs_management_plan` wired |
| **Evidence (confirmed)** | whsEngineRoutes.mjs TEMPLATES |
| **Test** | W14-API-02 |
| **Status** | parking |

### W14-SEC-003 — Employee could PUT WHS profile / generate docs

| Field | Value |
|-------|-------|
| **Severity** | High (security) |
| **Module** | W14 |
| **Symptom** | Engine profile PUT and generate routes used `requireAuth` only — any authenticated user could mutate `whs_site_profiles` |
| **Evidence (confirmed)** | Reproduced before fix: employee PUT returned 200 |
| **Fix** | `requireRole("admin", "supervisor")` on `PUT /api/whs/projects/:projectId/profile` and `POST .../generate/:templateKey` in `whsEngineRoutes.mjs` |
| **Files** | `server/lib/whs/whsEngineRoutes.mjs` |
| **Test** | W14-SEC-03 — `npm run test:w14-whs-baseline:write` (15 pass) |
| **Status** | **fixed** 2026-06-26 — P0-C5 SEC gap closure |

### W14-DRIFT-007 — Public induction link uses raw project UUID

| Field | Value |
|-------|-------|
| **Severity** | Medium (security — future) |
| **Module** | W14 |
| **Symptom** | `/induct/:projectId` and public API use raw UUID; valid UUID reveals project address; no list endpoint but UUID probe possible |
| **Evidence (confirmed)** | W14-SEC-01 tests — 404 for invalid UUID, no cross-leak; valid UUID returns address by design |
| **Test** | W14-SEC-01 |
| **Status** | **documented** — tokenised induction link recommended before high-scale/public rollout; not in P0-C5 scope |

### W15-DRIFT-001 — Supervisor approve UI/API mismatch

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W15 |
| **Symptom** | UI showed approve to supervisors; API admin-only |
| **Evidence (confirmed)** | workforceRoutes.mjs requireRole admin on approve; Workforce.jsx ungated |
| **Fix** | Option B (SAM-W15-001): `can.approveTimesheets` admin-only in UI; API unchanged |
| **Files** | `src/pages/Workforce.jsx`, `src/lib/roles.js` |
| **Test** | W15-SEC-01–04, W15-API-01–04 — `npm run test:w15-timesheet-auth:write` |
| **Status** | **fixed** 2026-06-25 — P0-C3 closed |

### W15-DECISION-FUTURE — Supervisor approval deferred

| Field | Value |
|-------|-------|
| **Severity** | Low (future) |
| **Module** | W15 |
| **Symptom** | Supervisors cannot approve; may need crew/project assignment scope first |
| **Evidence** | SAM-W15-001 Option B; approval triggers Buildxact WO |
| **Test** | — |
| **Status** | open — revisit after supervisor/project or crew assignment exists |

### W15-DRIFT-003 — Deputy replacement not E2E-verified

| Field | Value |
|-------|-------|
| **Severity** | High (operational) |
| **Module** | W15 |
| **Symptom** | WORKFORCE_DEPLOYMENT_TEST NO-GO 2026-06-16 |
| **Evidence (confirmed)** | docs/WORKFORCE_DEPLOYMENT_TEST_2026-06-16.md |
| **Test** | W15-E2E-01 |
| **Status** | parking |

---

## Batch D — Client Portal (W18) parking

**Map:** [18_CLIENT_PORTAL_LIFECYCLE.md](./workflows/18_CLIENT_PORTAL_LIFECYCLE.md) · Audit: [PORTAL_ECOSYSTEM_COHESION_AUDIT.md](../portal_audit/PORTAL_ECOSYSTEM_COHESION_AUDIT.md)

### W18-DRIFT-001 — Documents tab hollow (manual expose only)

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W18 |
| **Symptom** | Client Documents tab empty unless admin manually exposes PDFs |
| **Evidence (confirmed)** | Portal audit Lane 3; finance PDF → `job_documents` not auto-synced to `portal_documents` |
| **Test** | W18-API-03 |
| **Status** | parking — P1-W18-01 |

### W18-P0-02 — Void variation approval guard (CLOSED)

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | W18 |
| **Test** | `npm run test:w18-portal-void-guard:write` — 14/14 |
| **Result** | `syncVariationVoided` → `withdrawn`; client `POST .../variations/:id/respond` → **409**; decision stays withdrawn; no audit/notification leak |
| **Status** | **CLOSED 2026-06-22** — no product fix required |

### W18-P0-03 — Journey photo `client_visible` enforcement (CLOSED)

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Module** | W18 |
| **Test** | `npm run test:w18-portal-photo-visibility:write` — 15/15 |
| **Result** | Journey/home/media all enforce `client_visible`; DRIFT-008/009 fixed |
| **Status** | **CLOSED 2026-06-22** |

### W18-API-04 — Finance-event portal notifications (CLOSED)

| Field | Value |
|-------|-------|
| **Module** | W18 / Finance → Portal |
| **Test** | `npm run test:w18-portal-finance-notify:write` — 34/34 |
| **Result** | variation_issued, progress_claim_issued, variation_approved (finance sign), claim_paid scoped correctly; dedup on re-sync; non-v2 no-op |
| **Status** | **CLOSED 2026-06-22** — no product fix required |

---

### W18-DRIFT-002 — Migrations 108/110 manual-apply (CLOSED — verified applied)

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Module** | W18 |
| **Symptom** | Pre-apply CHECK constraints cause silent portal sync failures; void/dispute/photo flags unsafe |
| **Evidence (confirmed)** | Migration headers; CHECK behavioral probes 2026-06-22 |
| **Test** | W18-MIG-01 |
| **Status** | **verified applied + closed 2026-06-22** — columns + CHECK probes pass; **skip apply** |

### W18-DRIFT-003 — Site diary draft → portal publish dead-end

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W13 → W18 |
| **Symptom** | `portal_updates` draft from diary save not surfaced in admin publish flow |
| **Evidence (confirmed)** | Portal audit Lane 9 |
| **Test** | W18-API-02 |
| **Status** | parking — P1-W18-02 |

### W18-DRIFT-004 — v2 admin API vs UI role mismatch

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W18 |
| **Symptom** | `portalV2AdminRoutes` allows employee; `PortalV2Admin` UI admin-only |
| **Evidence (confirmed)** | App.jsx RoleRoute vs portalV2AdminRoutes requireRole |
| **Test** | W18-UI-01 — **pass** 11/11 E2E |
| **Status** | parking — UI admin-only vs API employee/supervisor (documented, not blocking UAT) |

### W18-DRIFT-005 — Portal not auto-enabled on win

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Module** | W09 → W18 |
| **Symptom** | Win-finalize does not set `portal_enabled` / invite client |
| **Evidence (confirmed)** | Alias W09-DRIFT-007 |
| **Test** | W18-API-01 — manual invite path **pass**; auto-on-win still open |
| **Status** | parking — P1-W18-05 (win does not auto-enable; ops must invite manually) |

### W18-DRIFT-006 — Partial claim re-notify blocked after first notify

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W18 / Finance |
| **Symptom** | Client cannot re-notify payment on partial claim updates |
| **Evidence (confirmed)** | Portal audit Lane 2 |
| **Test** | W18-API-04 |
| **Status** | parking — needs mig 108 |

### W18-DRIFT-007 — Legacy token POST endpoints without JWT

| Field | Value |
|-------|-------|
| **Severity** | Medium (security) |
| **Module** | W18 legacy |
| **Symptom** | **D-class:** decision respond **403 requiresLogin** (hard-disabled). **B/C on v2 projects:** conversations/sitewalk/warranty **404** via `resolveProject` v2 gate. **B/C on non-v2 legacy only:** still reachable — P1-W18-04 deprecation/SOP |
| **Evidence (confirmed)** | `portalRoutes.mjs` ~36–49 v2 gate; ~1224–1236 decision 403; `test:w18-portal-sec04:write` 35/35 |
| **Test** | W18-SEC-04 — **partial-pass** |
| **Status** | **partially closed 2026-06-22** — no P0 leak; non-v2 legacy B/C remains P1 (Sam decision) |

### W18-DRIFT-008 — Home `recentPhotos` lacks `client_visible` filter (CLOSED)

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Module** | W18 |
| **Fix** | Added `.eq("client_visible", true)` to home `recentPhotos` query in `portalV2Routes.mjs` |
| **Test** | `test:w18-portal-photo-visibility:write` — hidden absent, visible present |
| **Status** | **CLOSED 2026-06-22** |

### W18-DRIFT-009 — Media route lacks `client_visible` gate (CLOSED)

| Field | Value |
|-------|-------|
| **Severity** | Medium (security) |
| **Module** | W18 |
| **Fix** | Media route selects `client_visible`; returns **404** when not true (matches documents pattern) |
| **Test** | `test:w18-portal-photo-visibility:write` — hidden 404; visible passes gate (500 storage fetch in test env) |
| **Status** | **CLOSED 2026-06-22** |

---

### W15-DRIFT-001 — Supervisor approve UI/API mismatch

| Field | Value |
|-------|-------|
| **Status** | **closed** 2026-06-25 — Option B: UI approve/bulk-approve admin-only; API unchanged; `test:w15-timesheet-auth:write` |

### W05-TEST-001 — E2E package-only board locator strict-mode failure

| Field | Value |
|-------|-------|
| **Status** | **closed** 2026-06-25 — test-only locator fix in `w05-tender-board.spec.js` |

---

## Entry template (for new bugs)

```markdown
### BUG-XXX — Short title

| Field | Value |
|-------|-------|
| **Severity** | Critical / High / Medium / Low |
| **Module** | |
| **Symptom** | |
| **Reproduction** | 1. … 2. … |
| **Root cause** | |
| **Files** | |
| **Fix** | |
| **Test** | |
| **Status** | open / fixed / wontfix |
```

---

## P1 parking lot — future cleanup (not in current sprint)

| ID | Module | Symptom | Recommended fix | Status |
|----|--------|---------|-----------------|--------|
| **P1-JOBS-API-001** | Jobs API / RfqEngine | Dropbox link fields (`dropbox_shared_link`, `dropbox_link`, `dropbox_internal_path`) still browser-patched in `persistRfqs` because `JOB_PATCHABLE_FIELDS` excludes them | Allow safe Dropbox link patching through `PATCH /api/jobs` (allowlist + auth only); remove targeted client update | **open — P1 only** |

**Origin:** JOB-SPINE-01 accepted caveat (2026-06-27). Targeted Supabase update for Dropbox fields is **acceptable for JOB-SPINE-01** — it does not create jobs. **Do not expand** this browser-patch pattern elsewhere.

---

## Cross-workflow audit index (2026-06-26)

From [CROSS_WORKFLOW_AUDIT_ACCELERATION_PACK.md](./CROSS_WORKFLOW_AUDIT_ACCELERATION_PACK.md):

| Metric | Count |
|--------|-------|
| Open **Critical** | **0** |
| Open **High** (actionable) | **0** |
| P1 / decision-gated | W02-DRIFT-006, W05-STRUCTURAL-001 |
| W01-CONVERT-01 | **CLOSED — accepted 2026-06-27** |
| W03-FEE-LINK-01 | **CLOSED — accepted 2026-06-27** |
| OUTCOME-STAMP-01 | **shipped — pending Sam acceptance** |
| PTSA-WARNING-01 | **shipped — pending Sam acceptance** |
| W11-PO-SEC-01 | **CLOSED — accepted 2026-06-27** — W11-DRIFT-003 |
| DRIFT-004-DOC-01 | **CLOSED as accepted gap 2026-06-27** — DRIFT-004 + W06-DRIFT-004 (SAM-W07-002 = manual-resolve only) |
| Work-ahead | [HARDENING_WORK_AHEAD_QUEUE.md](./HARDENING_WORK_AHEAD_QUEUE.md) |
| JOB-SPINE-01 | **CLOSED — accepted 2026-06-27** — W04-DRIFT-001 + W06-DRIFT-001 |
| P1 follow-up | **P1-JOBS-API-001** — Dropbox fields via server PATCH (do not expand browser patch) |

---

## Deferred — E2E walkthrough (2026-06-27)

> Source: [E2E_FULL_WALKTHROUGH_BLH-E2E-20260627-1041.md](./E2E_FULL_WALKTHROUGH_BLH-E2E-20260627-1041.md). **Not Cursor implementation** — Claude fix batch candidate pending Sam approval.

### BLH-E2E-001 — Soft-deleted projects visible in active Operations / portal admin reads

| Field | Value |
|-------|-------|
| **Severity** | Low–Medium |
| **Module** | Operations / Portal admin |
| **Symptom** | Projects tagged `__DEMO_DELETED` / `__DRYRUN_…_DELETED` still appear in the **active** Operations global Gantt legend and remain readable via `GET /api/portal/admin/v2/:id/overview` |
| **Expected** | Active views filter archived / `_DELETED` / soft-deleted projects |
| **Repro** | E2E walkthrough BLH-E2E-20260627-1041 — Operations Gantt + portal admin overview |
| **Fix owner** | Claude Bug Killer (small, isolated filter) |
| **Cursor status** | **deferred — not implemented** |
| **Test** | Add regression when fixed — Ops Gantt + portal admin list |
| **Status** | **open — deferred Claude batch** |

### DISC-REG-01 / W18-VOID-GUARD-PROBE-01 — **closed (not a product bug)**

| Field | Value |
|-------|-------|
| **Severity** | N/A — test fixture |
| **Root cause** | Stale E2E seed — missing `project_client_users` for E2E project A |
| **Resolution** | `w18-portal-void-guard.mjs` E2E preflight gaps stale seed instead of false-fail |
| **Doc** | [DISC_REG_01_W18_VOID_GUARD_PROBE.md](./DISC_REG_01_W18_VOID_GUARD_PROBE.md) |
| **Status** | **closed — accepted 2026-06-27** |

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-27 | W17-P5 — **note (not a bug)**: RDO/public-holiday cells are **display-only** (greyed + badged). They deliberately do **not** block allocations and have no timesheet/Xero/Buildxact effect. The Snapshot still counts an RDO/holiday day as "missing" until the deferred P5b overlay greys it there too — tracked, not a defect. Recurring-RDO expansion uses week-index alignment (verified: fortnightly Friday from 26 Jun → 26 Jun, 10 Jul) |
| 2026-06-27 | W17-P4c — **UX fix**: moving a shift reloaded the grid and jumped the page to the top. Cause: post-mutation `loadAllocations()` toggled the `loading` flag (unmounted the grid → scroll reset). Fixed via silent reconcile (no loading flash) + optimistic local updates (instant move/assign/remove); all error paths revert via a silent re-fetch; swap keeps its explicit partial-failure guards |
| 2026-06-27 | **PLAYWRIGHT-SALES-GATE-LADDER-01** — browser sales ladder regression green; no product bug |
| 2026-06-27 | **BLH-E2E-001** — deferred Claude fix (soft-deleted projects in active views) |
| 2026-06-27 | **DISC-REG-01 / W18-VOID-GUARD-PROBE-01 closed** — E2E fixture drift; not product bug |
| 2026-06-27 | **W01-CONVERT-01** — W01-DRIFT-005 fixed; W01-API-08; LeadDetail site_address UX gate; batch-a 30/30 |
| 2026-06-27 | **DRIFT-004-DOC-01** — DRIFT-004 + W06-DRIFT-004 closed as accepted gap; SAM-W07-002 Option C (manual-resolve only); High count 8→5 |
| 2026-06-27 | **Claude second-pass E2E (BLH-E2E-CLAUDE-20260627-1139)** — candidates below; full report `E2E_CLAUDE_SECOND_PASS_BLH-E2E-CLAUDE-20260627-1139.md` |

## Claude Second-Pass Candidates — pending Sam registration approval (BLH-E2E-CLAUDE-20260627-1139)

> Confirmed by independent code/DB/API/regression verification (2 analysis workflows, 19 subagents + live browser + probes). Not auto-registered/closed — awaiting Sam approval of the fix batches.

| ID | Severity | Workflow | Summary | Evidence | Owner |
|----|----------|----------|---------|----------|-------|
| DISC-002 (GAP-W03-FINANCE-ACCEPT-PARITY) | **HIGH/P1** | Finance/W03 | Finance fee-proposal accept (`financeRoutes.mjs:1390-1437`) never stamps `leads.fee_proposal_id`; `buildexactIntegrationRoutes.mjs:167` is the **sole** writer → finance-accepted proposals break W04/tender handoff | grep sole-writer; finance route sets only contract_value | ✅ **FIXED 2026-06-27 (DISC-002-FINANCE-FEE-LINK-01)** — shared `feeProposalLink.stampLeadFeeProposalLink()` wired into both accept routes; test `W03-API-05c` green (stamp + contract-value no-regression); sales parity (W03-API-05b) intact; batch-a 37/0. ✅ **ACCEPTED CLOSED 2026-06-27 (Sam).** |
| DISC-WIN-01 | Medium/P1 | W09 win-finalize | `cost_intelligence` bare `.insert()` loop (`module4Routes.mjs:481-493`), no re-run guard while peer writes idempotent → re-run duplicates rows; skews ops-readiness + cost analytics | code; key=(job_id,trade); 0 rows now (latent) | ✅ **FIXED 2026-06-27** — delete-by-job_id before re-seed (idempotent + reflects current amounts); test flipped gap→fail-lock: `✓ DISC-WIN-01 win-finalize re-run did not duplicate cost_intelligence rows`. Awaiting Sam closure. |
| BLH-E2E-001 | Low-Med | Ops/Portal | `_DELETED` (renamed, no `deleted_at` col) projects leak into active Ops Gantt/global-tasks (`operationsRoutes.mjs:20/75` — deleted_at filter is on schedule_tasks only) | code; **22** DB rows; Gantt visual | ✅ **FIXED 2026-06-27** — `.not("address","ilike","%_DELETED")` on both Ops reads; new `test:ops-active-filter` **3/3**. Awaiting Sam closure. |
| BLH-E2E-CLAUDE-001 | Medium (test-infra) | Test harness | ~~`hardening-regression:write` aggregator false-fails~~ | Fixed 2026-06-27 — stable passwords | **closed** |
| PORTAL-CROSSROLE / ROLE-MATRIX-01 | Medium | W18 | Portal-admin read scope — **Sam decided 2026-06-27:** admin yes; supervisor yes if project-related; **employee NO**; client own portal only; no-auth no. **Gate 8 (ROLE-MATRIX-DEPLOYMENT-GATE-01) confirmed LIVE: `GET /api/portal/admin/v2/:id/overview` returns 200 for employee** — code (`portalV2AdminRoutes.mjs:23` `requireRole('admin','supervisor','employee')`) violates the decided policy. | `test:role-matrix-gate` (employee→overview) | **ready fix-batch PORTAL-CROSSROLE-FIX** — drop `'employee'` from the requireRole; W18-locked → pending Sam approval |

## W18 UAT defects (W18-UAT-EXEC-01 — 2026-06-27)

| ID | Severity | Summary | Evidence | Blocks pilot? | Owner | Status |
|----|----------|---------|----------|---------------|-------|--------|
| UAT-W18-ENV-01 | P2 | W18 `--write` regressions wipe `project_client_users` / `__E2E_` project B missing → Playwright client nav shows “No project linked yet” despite API-green invite on dynamic fixtures | W18-UAT-EXEC-01 run; pcu count 0 after write suites; my-projects `[]` | No — use real pilot + fresh invite | Cursor test-only | Open |
| UAT-W18-BROWSER-001 | P2 | Journey UI omits visible photo caption when photos use stub storage paths (no Dropbox bytes); API P0-03 green | W18-STAFF-BROWSER-PILOT-01; test 04 partial | No — verify real photo upload on pilot | SOP / manual on pilot | Open |

**Reconciled this pass (no new ID):** W12-SEC-01 **REFUTED as open** (already gated — `requireScheduleWrite`=admin/supervisor; employee→403 live + standalone 14/14; the bug-register "open HIGH" entry is **stale**); OUTCOME-STAMP-01 **fully verified** (positive stamp + idempotent + lost_reason body-only); OBS-1 **confirmed harness artifact** (clean 401); OBS-3 **downgraded** (trivial Blueprint cache, not "resolved"); W04-DRIFT-005 **already implemented** (409 JOB_ADDRESS_PENDING wired).
| 2026-06-27 | **W11-PO-SEC-01 accepted closed** — W11-DRIFT-003; SAM-W11-002 closed |
| 2026-06-27 | **OUTCOME-STAMP-01** — W02-DRIFT-001 fixed; W02-API-04 pass (`test:w02-qualification:write`) |
| 2026-06-27 | **JOB-SPINE-01 accepted closed** — Sam sign-off; P1-JOBS-API-001 registered (Dropbox PATCH allowlist — future only) |
| 2026-06-27 | **JOB-SPINE-01 closed** — W04-DRIFT-001 + W06-DRIFT-001; persistRfqs → POST `/api/jobs`; W06-PARK-001 renamed (was stale W06-DRIFT-001 camelCase alias) |
| 2026-06-26 | Cross-workflow audit index — 0 Critical / 11 High open; JOB-SPINE-01 batch proposed |
| 2026-06-26 | W17-P4 — **known limitation logged** (not a regression): the W16 `PUT /api/workforce/allocations/:id` cannot switch a cell project↔carpentry because it merges the unset spine side from the current row via `??`. The Planner UI works around it by **edit-by-replace** (DELETE + POST on the same employee/date); the PUT route was left untouched. Revisit only if a true in-place PUT swap is needed |
| 2026-06-26 | W17-P3 — **D3 leak fixed**: `GET /api/worker/tasks` now filters `task_audience` server-side, so normal workers no longer see supervisor/QC tasks (leading hands still do); QC-task completion gated to leading hands. Matches the adversarial-audit D3 finding |
| 2026-06-26 | W17-P2 — `completion-snapshot` per-day value changed string→`{state,status,hours}` (read-only; `SnapshotTab` backwards-compatible). API-shape contract note; no bug introduced, `done`/`missing` counts unchanged |
| 2026-06-26 | **W17 remaining phase plans** — P2–P8 detailed; P1 closed; no new bugs |
| 2026-06-26 | **W17-P1 closed** — Team tab in Workforce; `/workforce/team` redirect; `test:w17-team-tab-baseline:write` 13/13; no new bugs; protected paths untouched |
| 2026-06-26 | **W16-A1 closed** — allocation backend verified 14/14 write + W15 19/19; protected paths untouched |
| 2026-06-22 | **W16-A1 backend** — allocation/crew routes + mig 117; no timesheet/BX changes; tests in `w16-allocation-baseline.mjs` |
| 2026-06-26 | **P0-D1 closed** — W13 baseline tests; W13-DRIFT-001/SEC-004/SEC-005 registered; no product changes |
| 2026-06-26 | **P0-C5 SEC gap closure** — W14-SEC-03 fixed (requireRole on profile PUT + generate); W14-SEC-01/02/03 + W14-API-03 cross-project tests; W14-DRIFT-007 documented |
| 2026-06-25 | **P0-C5 closed** — W14 profile + induction baseline; W14-DRIFT-001 intentional |
| 2026-06-25 | **P0-C4 closed** — W10 baseline tests; generate summary+warnings; W10-DRIFT-001 intentional |
| 2026-06-25 | **P0-C3 closed** — W15-DRIFT-001 Option B; W15-DECISION-FUTURE logged |
| 2026-06-25 | BATCH_B_REVIEW_PACK.md — P0-B1–B5 candidates |
| 2026-06-25 | W09 mapped — W09-DRIFT-001–010 registered; Batch B complete |
| 2026-06-25 | W05-TEST-001 closed |
| 2026-06-25 | W08 mapped — W08-DRIFT-001–008 registered; DRIFT-014 aliased |
| 2026-06-25 | W07 accepted — SAM-W07-001–004 decided |
| 2026-06-25 | W06-DRIFT-008 fixed (rfqPackageUtils + W06-UI-02 pass) |
| 2026-06-25 | Batch B parking lot refined — W06/W07 pre-confirmed findings code-verified |
| 2026-06-25 | W06-DRIFT-001–008 registered (Batch B map) |
| 2026-06-25 | Batch A regression: batch-a 14/0, batch-a:write 22/0, E2E 4 pass / 1 fail (W05-TEST-001); W01 chain verified |
| 2026-06-24 | W04-DRIFT-005/007 fixed (P0-A3/A4); Block 2 complete |
| 2026-06-24 | W05-DRIFT-008 fixed (P0-A6); W05-DRIFT-003 documented (P0-A5); Batch B parking W07-DRIFT-004/005 |
| 2026-06-22 | Batch D W18 release readiness review published |
| 2026-06-22 | W18-P0-01 readiness — migrations 108/110 plan; env DB column probes likely applied |
| 2026-06-22 | W18-P0-04 / QA-001-GAP-10 closed — generate-token admin-only |
| 2026-06-22 | W18 mapped — W18-DRIFT-001–007 registered; QA-001 Tier-0 closed; GAP-10 split to open |
| 2026-06-22 | Phase 1 — DRIFT-001–014 + QA-001 pre-registered |
