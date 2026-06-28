# Full E2E Hardening Strategy

**Status:** 2026-06-28 · Governed by [COMPREHENSIVE_HARDENING_MASTER_PLAN.md](./COMPREHENSIVE_HARDENING_MASTER_PLAN.md).

The complete end-to-end test structure for the Hub. Reuses the existing harnesses
(`scripts/batch-a/run-w*.mjs`, `scripts/test-critical-paths.mjs`, `playwright.config.js`) and
the existing matrices. Coverage is tiered per the **Hybrid-by-risk** model: P0 journeys
re-verified from scratch; P1/P2 trusted-green + regression rotation.

---

## 1. Journeys (the spine)

Each journey lists its steps, the workflows it crosses, and the **existing** harness/spec that
covers it. "Gap" = no automated coverage yet → write a test-only runner/spec before any fix.

### J1 — Sales → Job Setup
`Lead → Qualification → Fee Proposal/PTSA → Tender → RFQ → Quote Accept → Job Setup`
- Workflows: W01 → W02 → W03 → W05 → W06 → W07 → W08 → W04.
- Harness: `test:w02-qualification`, `test:journey-b` / `test:journey-b-01` (RFQ money path),
  `test:w06-shape`/`test:w06-finalize`, `test:w08-accept`/`test:w08-win-quote`,
  `test:w04-w06-job-spine`; Playwright `sales-stage-gate-ladder.spec.js`,
  `e2e/tests/workflows/batch-a/w01-pipeline-display.spec.js`, `w03-ptsa-visibility.spec.js`,
  `w05-tender-board.spec.js`.
- **Tier:** P0 (re-verify from scratch).

### J2 — Tender Win → Finance
`Tender Win → Operations Handoff → Procurement → PO → Finance`
- Workflows: W09 → W10 → W11 → W16.
- Harness: `test:w05-win`/`test:win-finalize-01`, `test:w09-ops-readiness`,
  `test:w10-procurement-baseline`, `test:w11-batch-po`; Finance (W16) **unmapped** — map first.
- **Tier:** P0 for win/handoff (W09); P1 for procurement/PO; **map W16** before testing.

### J3 — Operations delivery
`Schedule → Site Diary → Media → Client Portal`
- Workflows: W12 → W13 → W18.
- Harness: `test:w12-schedule-auth`, `test:w13-site-diary-baseline`; portal `test:w18-portal-*`,
  `e2e/tests/portal/portal-v2-admin-overview.spec.js`, `e2e/tests/client-portal/navigation.spec.js`.
- **Tier:** P1 for schedule/diary; **P0 for W18 client-portal isolation**.

### J4 — WHS
`WHS → Induction → SWMS → Incident`
- Workflow: W14.
- Harness: `test:w14-whs-baseline`; public induction `/induct/:projectId`.
- **Tier:** P1.

### J5 — Workforce
`Workforce → Timesheet → Approval → Buildxact/Xero handoff (where applicable)`
- Workflows: W15 / W17 (Claude-owned).
- Harness: `test:w15-timesheet-auth`, `test:w16-allocation-baseline`, `test:w17-*` family.
- **Tier:** P1; **do not edit W17 docs without Sam.** Buildxact/Xero handoff is a **live
  integration** → sandbox/Sam only.

### J6 — CRM / Mailing List
`Contacts → Smart list → Bulk send (unsubscribe-suppressed)`
- Workflow: W22.
- Harness: `e2e/tests/security/crm-send-role.spec.js` (`test:w22-crm-security`).
- **Tier:** P1; **email send is live** → assert guards only, never actually send.

### J7 — Marketing Command Centre — **DEFERRED until `marketing-run-a` merges**
Covered entirely by [MARKETING_POST_MERGE_HARDENING_PLAN.md](./MARKETING_POST_MERGE_HARDENING_PLAN.md).
Recorded as `MARKETING — PAUSED UNTIL MERGE`.

### J8 — Client Portal full journey
`Invite (real active job only) → magic-link login → isolated job view → variation/EOT approval → question`
- Workflow: W18.
- Harness: `e2e/tests/security/client-isolation.spec.js`, `test:w18-portal-*`, UAT packs
  (`W18_CLIENT_PORTAL_UAT_*`).
- **Tier:** P0 isolation; **real-client invite is an approval gate** (waiting for a viable real job).

---

## 2. Role / security matrix (P0 — re-verify from scratch)

Reuse [ROLE_MATRIX_DEPLOYMENT_GATE_01.md](./ROLE_MATRIX_DEPLOYMENT_GATE_01.md) +
[HUB_QA_ROLE_PREVIEW_CONSOLE.md](./HUB_QA_ROLE_PREVIEW_CONSOLE.md) +
`e2e/tests/security/**` (`api-security` project) + `run-role-matrix-gate.mjs`.

| Surface | admin | supervisor | employee | worker | client | unauth |
|---|---|---|---|---|---|---|
| Finance / sales-admin / cost | RW | – | – | – | – | 401 |
| Schedule / workforce writes | RW | role-gated | – | own | – | 401 |
| Ops read | R | R | R | – | – | 401 |
| Marketing nav + writes | RW | – | – | – | – | 401 |
| Client portal (a client's job) | per-policy | if project-related | no (default) | – | own only | 401 |
| Public (`/api/public/enquiry`, attribution, `/induct/*`) | open by design | | | | | open |

Must pass: unauth → 401; non-admin write → 403; client isolation (Client A cannot see Client B);
portal cross-role per the decided policy (admin yes; supervisor if project-related; employee no).

---

## 3. UI evidence matrix (UI Review = visual hub)

Per module, capture/document across **viewports × states**:

| | desktop **1440×900** | tablet **834×1112** | mobile **390×844** |
|---|---|---|---|
| good / loaded | ✓ | ✓ | ✓ |
| empty | ✓ | ✓ | ✓ |
| blocked / needs-action | ✓ | ✓ | ✓ |
| overdue / risk | ✓ | ✓ | ✓ |
| loading (where practical) | ◐ | ◐ | ◐ |
| error (where practical) | ◐ | ◐ | ◐ |
| permission-denied / role-limited (where relevant) | ◐ | ◐ | ◐ |

Playwright projects: `chromium-desktop` (1440×900-class), `chromium-mobile` (Pixel 7),
`chromium-tablet` (iPad Pro 11). Run via `npm run test:ui-review` and project-scoped visual
specs. Evidence is indexed in [ui_review/UI_SCREEN_EVIDENCE_INDEX.md](./ui_review/UI_SCREEN_EVIDENCE_INDEX.md).
A module cannot be **visually locked** unless its screenshots pass or the missing coverage is
logged as a gap.

---

## 4. UI Module Lock Matrix (visual gate)

Tracked in [ui_review/UI_MODULE_LOCK_MATRIX.md](./ui_review/UI_MODULE_LOCK_MATRIX.md):

- **UI LOCKED** — meets Sales standard, screenshots pass, mobile usable, no deploy-blocking UI issues.
- **UI CONDITIONAL** — usable, non-blocking issues logged.
- **UI NO-GO** — confuses staff / hides risk / blocks workflow / shows wrong info / mobile impractical.
- **UI NOT ASSESSED** — default (all modules today).

**Acceptance rubric** (first viewport answers): *Where am I? · What matters now? · What is
blocked? · What needs action? · What happens next?* **Sales-standard scorecard:** clear module
home · action queue · KPI/status strip · board/actions/list where useful · command-centre detail
where useful · one obvious next action · status/phase/stage awareness · empty/loading/error
states · mobile cards/tabs (not squeezed tables) · sticky action only where it helps · no
undefined/null/test-data leaks · consistent Blue Leaf styling.

---

## 5. Regression suite rotation

- **After every fix:** affected `run-w*.mjs`/spec, then `run-hardening-regression.mjs`.
- **Rotation:** P1/P2 trusted-green workflows re-run on a rotating schedule per
  [TEST_REGRESSION_SUITE_01.md](./TEST_REGRESSION_SUITE_01.md) so trust doesn't decay.
- **Meta-runner:** `npm run test:hardening-regression` (W06–W18 aggregate).

---

## 6. Device coverage

| Device class | Playwright project | Used for |
|---|---|---|
| Desktop | `chromium-desktop` | journeys, gate ladders, admin/staff flows |
| Mobile | `chromium-mobile` (Pixel 7) | Worker PWA, client portal, mobile UI evidence |
| Tablet | `chromium-tablet` (iPad Pro 11) | supervisor on-site, tablet UI evidence |
| API/security | `api-security` | unauth/role, smoke `api-*` |

Snapshot baselines are OS-specific; mobile/tablet visual projects are skipped in CI (Linux ≠
macOS) per `playwright.config.js` — run them locally for evidence.

---

## 7. Sequence

1. **Wave 01A** — UI/UX discovery sweep (no-code) across the priority modules → lock matrix +
   evidence + BUG_REGISTER. (First wave.)
2. **P0 re-verify** — J1, W09, role/security, W18 isolation from scratch.
3. **Map-first** — W16, W19–W21, W23–W25 into the matrices, then test.
4. **P1/P2** — trust green + regression rotation.
5. **Marketing** — post-merge wave.
6. **Integration seams** — sandbox/live-fire (Sam-gated; shared-env boot-safety flags required).
7. **Deploy gate** — assert §15 of the master plan; Sam's GO.
