# UI/UX Discovery — Wave 01A Result

**Status:** COMPLETE · **Run ID:** `BLH-UIUX-01A-2026-06-28-1` · **Date:** 2026-06-28  
**Mode:** no-code discovery (audit + safe UI Review screenshots) · **Reference standard:** Sales  
**Branch:** `portal-v2` · **No product code changed.**

Governed by [../FULL_E2E_HARDENING_STRATEGY.md](../FULL_E2E_HARDENING_STRATEGY.md) +
[../COMPREHENSIVE_HARDENING_MASTER_PLAN.md](../COMPREHENSIVE_HARDENING_MASTER_PLAN.md).

---

## 1. Summary

| Metric | Value |
|---|---|
| Modules assessed | **11 / 11** (Marketing excluded — paused until merge) |
| Findings logged | **14** (blocking **2** / non-blocking **12**) |
| Lock outcomes | LOCKED **4** · CONDITIONAL **6** · NO-GO **1** · NOT ASSESSED **1** · PAUSED **1** |
| UI Review run | `npm run test:ui-review` — **156 / 162 pass** (6 fail: Field WHS + Field Diary × 3 viewports) |
| Evidence base | `docs/ui-review/export-2026-06-27/screenshots/` (refreshed 2026-06-28) |

**Method:** `npm run test:ui-review` (VITE_UI_REVIEW_MODE fixtures, no live API). Visual assessment
against first-viewport rubric + Sales-standard scorecard. Prior export notes in
`docs/ui-review/export-2026-06-27/reports/UI_REVIEW_REDESIGN_NOTES_SEED.md` incorporated.

---

## 2. Method (as run)

- Preflight: branch `portal-v2`, clean tree, `hardening:watch --dry-run` → Cursor / Wave 01A / no approval.
- Screenshots: Playwright UI Review — desktop 1440×900 · tablet 834×1112 · mobile 390×844.
- States: good/loaded captured for all routed screens; empty/blocked inferred from fixture data +
  visual review; error state confirmed on Field WHS/Diary (render crash).
- CRM: **no UI Review route** — code + fixture gap documented; not visually assessed.
- Marketing: **not assessed** — `MARKETING — PAUSED UNTIL MERGE`.

---

## 3. Per-module findings

### 1. Sales (reference) — `/sales`, `/sales?view=actions`, `/sales/lead-*`

- **Lock status:** **UI LOCKED** (reference standard; non-blocking clarity issues only)
- **First-viewport rubric:** Where ✓ · Matters ✓ · Blocked ✓ · Needs action ✓ · Next ✓
- **Sales-standard:** KPI strip ✓ · action queue ✓ · board/list ✓ · stage chips ✓ · mobile cards ✓ ·
  styling ✓ · no null leaks ✓
- **Mobile/tablet:** Pipeline stacks as stage-grouped cards; bottom module nav overflows (see UI-NAV-001).
- **Demo/live:** Review fixtures show 7 overdue leads; KPI “Needs action” reads 0 while “Overdue” reads 7
  (UI-SALES-001).
- **Findings:** UI-SALES-001 · UI-NAV-001
- **Evidence:** `export-2026-06-27/screenshots/{desktop,mobile}/sales-pipeline.png`,
  `sales-action-queue.png`, `lead-*.png`

### 2. Tender / RFQ — `/tender-manager/board`, packages, RFQ engine, subs, cost intel, fee proposals

- **Lock status:** **UI CONDITIONAL**
- **First-viewport rubric:** Where ✓ · Matters ✓ · Blocked ✓ · Needs action ✓ · Next ✓ (board);
  RFQ Engine wizard ✓/partial (stepper clear; no module-home KPI strip — accepted wizard pattern)
- **Sales-standard gaps:** Tender Board matches (KPI + action queue + board). RFQ Engine, Quote Tracker
  subsheets are workflow wizards — no command-centre home (UI-TENDER-001). Subcontractors / Cost
  Intelligence remain table-heavy on mobile.
- **Mobile/tablet:** Board cards usable; bottom nav + FAB overlap action cards on mobile.
- **Findings:** UI-TENDER-001 · UI-NAV-001 · UI-VISUAL-001
- **Evidence:** `tender-board.png`, `rfq-package-*.png`, `rfq-engine.png`, `subcontractors.png`

### 3. Operations / Project Command Centre — `/operations`, `/operations/proj-1`

- **Lock status:** **UI LOCKED**
- **First-viewport rubric:** Where ✓ · Matters ✓ · Blocked ✓ · Needs action ✓ · Next ✓
- **Sales-standard:** KPI strip ✓ · “Needs action now” queue ✓ · Board/Actions/List/Scorecard ✓ ·
  project cards by health ✓ · global Gantt ✓
- **Mobile/tablet:** Action queue + project cards stack well; embedded Gantt is dense but scrollable.
- **Findings:** UI-NAV-001 (shared AppShell)
- **Evidence:** `operations-list.png`, `operations-project.png`

### 4. Schedule — `/operations/proj-1/schedule`

- **Lock status:** **UI CONDITIONAL**
- **First-viewport rubric:** Where ✓ · Matters ✓ · Blocked ✓ · Needs action ✓ · Next ✓
- **Sales-standard gaps:** Mobile uses lookahead card lists (good); desktop Gantt full-featured.
  Secondary toolbar (Export PDF, BX Match, etc.) crowded on mobile.
- **Findings:** UI-SCHEDULE-001 · UI-NAV-001
- **Evidence:** `schedule-manager.png` (all viewports)

### 5. Procurement — `/operations/procurement`

- **Lock status:** **UI LOCKED**
- **First-viewport rubric:** Where ✓ · Matters ✓ · Blocked ✓ · Needs action ✓ · Next ✓
- **Sales-standard:** Command-centre KPI strip ✓ · categorized action queue ✓ · status badges ✓
- **Mobile/tablet:** Cards stack; no table squeeze on command-centre tab.
- **Findings:** none blocking
- **Evidence:** `procurement.png`

### 6. Finance — `/finance`, `/finance/jobs/:id`

- **Lock status:** **UI CONDITIONAL**
- **First-viewport rubric:** Where ✓ · Matters ✓ (inbox) · Blocked partial · Needs action ✓ · Next ✓
- **Sales-standard gaps:** Inbox has KPI strip + dropzone. Job command centre KPI tiles show `—` for
  claims/costs/margin (thin fixture + weak empty copy — UI-FINANCE-001). Progress Claims table squeezed
  on mobile (UI-FINANCE-002). Dual FABs overlap content (UI-FINANCE-003).
- **Demo/live:** Populated contract + $0 claims may mask “no claims yet” live state.
- **Findings:** UI-FINANCE-001 · UI-FINANCE-002 · UI-FINANCE-003 · UI-NAV-001 · UI-VISUAL-001
- **Evidence:** `finance-manager.png`, `finance-command-centre.png`

### 7. Workforce — `/workforce`

- **Lock status:** **UI CONDITIONAL**
- **First-viewport rubric:** Where ✓ · Matters ✓ · Blocked — · Needs action ✓ · Next ✓
- **Sales-standard gaps:** KPI strip ✓. Desktop = wide table; mobile Approvals uses cards ✓.
  “Crew 0 / App-linked 0/0” reads broken in review/demo (UI-WORKFORCE-001).
- **Findings:** UI-WORKFORCE-001 · UI-NAV-001
- **Evidence:** `workforce.png` (desktop + mobile)

### 8. Field / Worker App — `/field/*`, `/worker`

- **Field lock status:** **UI NO-GO** (WHS + Diary crash — deploy-blocking for supervisor field journeys)
- **Worker lock status:** **UI LOCKED**
- **Field first-viewport:** Error boundary only on `/field/whs`, `/field/diary` (all viewports).
- **Worker first-viewport:** Where ✓ · Matters ✓ · Needs action ✓ · Next ✓ — clean mobile PWA cards.
- **Findings:** UI-FIELD-001 · UI-FIELD-002
- **Evidence:** `field-whs.png`, `field-diary.png` (error), `worker-home.png`, `worker-tasks.png`

### 9. WHS — `/operations/proj-1/whs`, `/field/whs`

- **Lock status:** **UI CONDITIONAL** (ops path usable; field path NO-GO via Field module)
- **First-viewport rubric (ops):** Where ✓ · Matters ✓ · Blocked ✓ · Needs action ✓ · Next ✓
- **Sales-standard:** Expiry banner ✓ · ACTION REQUIRED per trade ✓ · tabs ✓
- **Findings:** UI-FIELD-001 (field surface); ops WHS no separate blocking UI issue
- **Evidence:** `operations-whs.png`

### 10. Client Portal — `/client-portal/*`

- **Lock status:** **UI CONDITIONAL** (light-touch — access/mobile clarity OK; copy inconsistencies)
- **First-viewport rubric:** Where ✓ · Matters ✓ · Blocked — · Needs action partial · Next ✓
- **Sales-standard:** Clean greeting + progress card ✓ · financial summary ✓ · mobile bottom nav ✓
- **Gaps:** Greeting cites benchtop approval; action card says “all up to date” (UI-PORTAL-002).
  “Latest update · —” stray dash (UI-PORTAL-001).
- **Findings:** UI-PORTAL-001 · UI-PORTAL-002
- **Evidence:** `portal-home.png`, `portal-actions.png`, `portal-journey.png` (mobile + desktop)

### 11. CRM / Mailing List — `/sales/dashboard`, `/sales/contacts`, mailing lists (Settings)

- **Lock status:** **UI NOT ASSESSED** (no UI Review route or CRM dashboard fixture)
- **Findings:** UI-CRM-001 (coverage gap)
- **Evidence:** **Gap** — no screenshots; code review only (`CrmDashboard.jsx` expects
  `/api/crm/dashboard`)

### 12. Marketing — `/marketing/*`

- **Lock status:** **MARKETING — PAUSED UNTIL MERGE**
- **Findings:** none (not assessed)

---

## 4. Proposed module-polish plan (for Sam approval → unlocks Wave 01B)

| Module | Blocking issues | Proposed presentational fixes (01B) | Est. risk |
|---|---|---|---|
| **Field** | UI-FIELD-001, UI-FIELD-002 | Fix requires behaviour/fixture — **not 01B**; route to Fix Agent | med |
| **Finance** | UI-FINANCE-001–003 | Empty-state copy for KPI tiles; mobile card layout for claims; consolidate FABs | low |
| **Sales** | UI-SALES-001 | Align “Needs action” KPI with overdue/filter semantics (presentational label/help) | low |
| **Client Portal** | UI-PORTAL-001–002 | Fix title dash; sync action-queue empty state with greeting next-step | low |
| **AppShell (global)** | UI-NAV-001 | Scrollable / “More” bottom nav on mobile | low |
| **Design system** | UI-VISUAL-001 | Shared status badge component | med |
| **Tender subsheets** | UI-TENDER-001 | Optional tender-home banner linking wizard tools (presentational only) | low |
| **Schedule mobile** | UI-SCHEDULE-001 | Collapse secondary toolbar into overflow menu on mobile | low |
| **Workforce** | UI-WORKFORCE-001 | Empty-state copy when crew count zero | low |
| **CRM** | UI-CRM-001 | Add UI Review routes + fixtures (test-only) then re-run 01A slice | low |

**Wave 01B does not start until Sam approves this plan.**

---

## 5. Handoff

| Artifact | Updated |
|---|---|
| BUG_REGISTER | yes — 14 × `UI-*` entries |
| UI_MODULE_LOCK_MATRIX | yes |
| UI_SCREEN_EVIDENCE_INDEX | yes |
| CURRENT_STATE + AUTONOMOUS_LOOP_STATUS | yes |
| NEXT_CLAUDE_REVIEW | yes |
| AGENT_HANDOFF_LOG | yes |

**Next agent:** Claude (finalize 01B plan for Sam — no Fix Agent needed for Field).

---

## 6. Wave 01A follow-up (2026-06-28)

| Item | Verdict |
|---|---|
| UI-FIELD-001/002 | **Fixture-only** — closed; Field **UI LOCKED** |
| UI-PORTAL-002 | **Fixture gap** — live API consistent; closed |
| UI-CRM-001 | **Closed** — CRM **UI CONDITIONAL** (UI-CRM-002 mobile table) |
| UI Review | **171/171 pass** |

---

## 6. Claude review (2026-06-28) — triage + ratified 01B plan

**Scope verdict:** PASS — Cursor changed docs only (no `src/**`/`server/**`/migrations). Evidence
is strong enough to plan Wave 01B. Full per-ID triage is in
[../BUG_REGISTER.md](../BUG_REGISTER.md) → "Claude Review — Wave 01A triage".

**Lanes:**
- **Diagnose first (no-code, runs now):** UI-FIELD-001, UI-FIELD-002 (fixture-vs-component),
  UI-PORTAL-002 (behaviour-feed-vs-copy).
- **Test-only (no approval):** UI-CRM-001 coverage; UI-WORKFORCE-001 fixture enrichment.
- **Wave 01B presentational (needs Sam's one approval):** UI-NAV-001, UI-FINANCE-001/002/003,
  UI-PORTAL-001, UI-SCHEDULE-001, UI-VISUAL-001 (sequence last), UI-WORKFORCE-001 (copy),
  UI-SALES-001 (or accepted-gap).
- **Accepted-gap decisions (Sam):** UI-TENDER-001; UI-SALES-001 (if semantics intended).

**Ratified Wave 01B plan (pending Sam approval — presentational-only, preserve all behaviour):**

| Order | Module | IDs | Presentational change | Risk |
|------|--------|-----|----------------------|------|
| 1 | AppShell (global) | UI-NAV-001 | scrollable / "More" mobile bottom nav | low |
| 2 | Finance | UI-FINANCE-001/002/003 | empty-state KPI copy · mobile claims cards · single FAB | low |
| 3 | Client Portal | UI-PORTAL-001 | fix em-dash title (UI-PORTAL-002 held for diagnosis) | low |
| 4 | Schedule | UI-SCHEDULE-001 | mobile toolbar overflow menu | low |
| 5 | Workforce | UI-WORKFORCE-001 | empty-state copy (fixture part is test-only) | low |
| 6 | Sales | UI-SALES-001 | KPI label/help alignment (or accepted-gap) | low |
| 7 | Design system | UI-VISUAL-001 | shared status-badge component | **med — last** |

**Field (UI-FIELD-001/002) and Portal feed (UI-PORTAL-002) are deliberately excluded from 01B**
— they are code/behaviour fixes pending diagnosis, not presentational polish.

**Next:** no-code follow-up `UI-UX-WAVE-01A-FOLLOWUP` (Field diagnosis + CRM coverage) runs now;
the table above is queued for Sam's approval before any 01B polish begins.
