# R04 results — brief outcomes B01–B14, acceptance journeys A01–A09, findings F01–F08

**Commit:** `takeoff-r03` @ the commit named in the package's `git/COMMITS.txt`. It is pushed to `main` and deployed with the feature flag **off**.

**What ran:**
- Node suites: unit tests plus real-Postgres SQL and route tests.
- Browser tests on a **mocked** backend.
- Browser journeys on the **real local stack** (local server + local Postgres 17 + real PDF), in desktop Chromium and in **WebKit with iPhone 13 emulation**.

**What did not run:**
- No physical iPhone.
- No installed PWA.
- No owner trial.
- No production migration.

**Status vocabulary** (as R04 04/05 asks):
- **PASS**: executed evidence shows the requirement is met.
- **FAIL**
- **NOT VERIFIED**: implemented, but the evidence the brief demands (e.g. a real phone) is missing.

NOT VERIFIED is not PASS. **The feature is not called site-ready:** the real-phone gate and the owner trial are outstanding.

## Status summary (separate, as the R04 prompt requires)

| | Status |
|---|---|
| Implementation (F01–F08, B01–B14, plus all 3 blockers and 16 majors from the adversarial review) | **Complete** (deferred minors listed below) |
| Automated tests (node: unit + real-Postgres SQL + real routes) | **PASS**: 251 tests across 9 suites, 0 skipped |
| Browser, mocked backend | **PASS**: 26 tests |
| Browser, real local stack (A09) | **PASS**: desktop Chromium and WebKit iPhone 13 emulation |
| Production database (migration 206) | **NOT VERIFIED**: Sam pastes 206; a read-only probe then confirms |
| Real installed-iPhone PWA (A01 recording, A02 interruption, A04/A09 on device) | **NOT VERIFIED** |
| Owner product acceptance | **NOT VERIFIED** |

## Brief outcomes B01–B14

| ID | Outcome | Status | Evidence |
|---|---|---|---|
| B01 | Fast phone drawing, comparable in ease to Flash.it | **NOT VERIFIED** on a real phone. Implementation complete. | Canvas editor: tap to draw, tap a size, two-tap crush fold, nothing to Apply. UI "R04 A01/A02 …" ×3. A09 capture on WebKit/iPhone emulation (screens 04–09 + `workflow.webm`). |
| B02 | Easy crush folds | **PASS** (automated) / real phone NOT VERIFIED | Endpoint → Crush fold in two taps, width typed live, Flip fold. UI test plus both A09 captures. PDF prints "crush fold (closed hem) 10 mm, folds …" and counts the width once in the girth (`takeoff-pdf`). |
| B03 | Direct dimension, angle and face edits with undo | **PASS** (automated) / real phone NOT VERIFIED | Live edits; 2→20→200 undoes to 150 in one step; invalid text never applies; field-only undo (R19); Redo under More. UI "R04 A01/A02 existing profile", "R04b R5/R19/R20". |
| B04 | Standards reused and resized per job | **PASS** | API "A10 …"; API "R04 A03: a perforated company standard copies into two jobs …"; conflict rebase keeps a colleague's change (r04 "R14 …"). |
| B05 | Save work reliably on a phone | **PASS** (automated) / installed-PWA interruption NOT VERIFIED | Per-actor device drafts: unfinished points, invalid field drafts, history. UI "R04 A02 unfinished drawing …". Refused saves show Not saved and are kept and retryable ("R04b R5/…"). A18–A20 recovery. Never "Saved" before the server holds the shape (R20). |
| B06 | Existing job plans: main page and two-axis scale | **PASS** (local stack) / production and phone NOT VERIFIED | A09 captures (setup → horizontal → vertical → independent check → Ready). "Scale plans" appears after upload. Loupe ("R04 F08 …"). Pre-206 plans are anchored on first open (API "R04 real plans …"). Live probe: 11 current plans, 8 of 8 sampled open (`evidence/live-plans-probe.txt`). |
| B07 | Measured +200, then round up to 100 | **PASS** | r04 "A05 measured 4,321 → 4,600; 4,400 → 4,600 …". A09 captures. |
| B08 | Manual / count = finished length, split allowed | **PASS** | r04 "A05 manual 4,321 × 2 stays 4,321 …", "F07 manual 7,200 × 3 …", "F07 count split …". API "R04 F07/F05 …". |
| B09 | 6 m flag kept whole; 9 m ceiling; split invalidation | **PASS** | r04 "A06 …", "F05 …" (source, re-scale and rule changes), "R1 …", "R11 …". API "R04b R9 …". |
| B10 | Material, finish, thickness, colour, perforation | **PASS** | r04 "F04/F06/02 dropdowns/R12/R27/R29/R31". API "R04 F06/F04 …". PDF "R04 A07 …". Seeded real-API PDF with perforated and unpainted flashings. |
| B11 | Accurate supplier order form | **PASS** (automated) / owner trial NOT VERIFIED | F01 line identity (r04 F01 ×7, API "R04 F01 …"); R2 reconcile; R7/R8 double-order guard; R13 required details; A09 PDF read back and verified (`supplier-order.txt`). |
| B12 | Fits the Hub on desktop and PWA | **PASS** (desktop + emulation) / real phone NOT VERIFIED | Desktop Chromium A09; WebKit iPhone 13 emulation A09; landscape and 360 px layout tests. Landscape side panel and keyboard handling (R23/R24) are implemented but not checked on a device. |
| B13 | Shared base for timber and cladding | **PASS** (contract tests) | `methods.js` contract tests in `takeoff-calc`: rafter, wall sheet, area-to-linear. Generic method, spec and measurement identity. |
| B14 | Future procurement seams; no invented data | **PASS** | Supplier, delivery and contact details are asked for, never fabricated (R13). Export ≠ placement (A21). Only the existing supplier records are used. |

## Acceptance journeys A01–A09

| ID | Journey | Status | Evidence |
|---|---|---|---|
| A01 | Everyday phone drawing (100/150/75, 90°, face, 10 mm crush + flip, ≤5 actions, no Apply) | **NOT VERIFIED** (needs a genuine touch recording). Automated parts PASS. | UI tests assert ≤5 actions and no Apply/Save. A09 capture drew 100/150/75 with a flipped crush on Chromium and WebKit emulation (`evidence/workflow/*/`). |
| A02 | Autosave, undo, interrupted work | **PASS** (automated) / installed-PWA interruption NOT VERIFIED | Reload restores an unfinished drawing and invalid drafts; undo coalescing; debounce plus selection change; refused save; no remount on save (stable key); conflict (A08 HTTP, R14); logout clears editor drafts (actor-scoped store). |
| A03 | Standard → job copy | **PASS** | API "A10", "R04 A03"; frozen exports unchanged ("A11/A26"). |
| A04 | Plan entry, calibration, revisions | **PASS** (local stack) / phone + production NOT VERIFIED | A09 captures; API "A15", "review #9", "review #15", "R04 real plans"; loupe test; revision binding via document hash. |
| A05 | Quantities and arithmetic | **PASS** | r04 "A05 …" ×2; A09 schedule check (`evidence/workflow/*/schedule.json`). |
| A06 | Handling flags and explicit splits | **PASS** | r04 "A06 …", "F05 …", "F07 …"; sandbox split in A09. |
| A07 | Materials end to end (solid, unpainted, perforated) | **PASS** | PDF "R04 A07 …" (`evidence/supplier-pdf-samples/sample-supplier-order-solid-unpainted-perforated.pdf`); seeded real-API PDF `evidence/seeded-example/FO-001001-export-2.pdf`. |
| A08 | Stale order and immutable export | **PASS** | r04 F01 ×7 (colour, profile, BMT, finish, perforation, face, quantity, missing); API "R04 F01 …" (re-save keeps the stale line, export refused, draft prints the bucket's colour); UI "R04 A08 …" (banner, export disabled, explicit update); "A11/A26" frozen. |
| A09 | Complete plan → order: 6 pieces / 22,600 mm, plus second colour isolation | **PASS** on the real local stack (Chromium + WebKit emulation) / installed iPhone NOT VERIFIED | `e2e/ui-review/takeoff-capture.spec.js` asserts the schedule (2×4,600 + 2×3,700 + 2×3,000 = 22,600; Surfmist 1×4,600 separate) and reads back the exported supplier PDF ("6 pieces · 22.600 LM", "Order total: 7 pieces · 27.200 LM", legs, crush, colours). |

## Reviewer findings F01–F08

| | Fix | Regression tests |
|---|---|---|
| F01 | The line keeps its chosen material. A change makes it stale (update or remove explicitly; the update keeps every piece, R2). The PDF prints the bucket's own spec. Order-ready refused. | r04 F01 ×7 + R2; API R04 F01; UI R04 A08 |
| F02 | Device drafts per actor, job and flashing; valid edits autosave; stable editor key | UI R04 A02 ×2, R04b |
| F03 | Canvas editor; More for rare transforms; no Apply / Enter / intermediate Save | UI R04 A01 ×2 |
| F04 | Unpainted needs no colour; legacy "N/A" mapped; placeholders rejected on painted finishes | r04 F04, R31 |
| F05 | Source signature (raw, calibration id, rules, quantity), stamped by the server; review re-stamps | r04 F05, R11; API R04 F07/F05, R04b R9 |
| F06 | Spec v2 through validation, identity (legs by position), snapshot and PDF | r04 F06, R27, R29; PDF R04 A07; API R04 F06/F04 |
| F07 | Split for manual / count, including partial quantity; never loses pieces | r04 F07 ×2, R1 |
| F08 | Press-and-hold (500 ms) loupe with crosshair; lift places the point | UI R04 F08; gesture suite |

## Adversarial review (2026-10-14) → R04b

Four attackers and a skeptic produced 62 findings: 3 blockers, 16 majors and 30 minors confirmed, 11 rejected or duplicate. Every blocker and major is fixed and has a regression test. Plan: `FIX-PLAN-R04b.md`.

Deferred minors, known and documented:
- **R44:** leading hands can raise rule ceilings.
- **R45:** one raw offline message.
- **R48:** spec v1 bucket keys orphan R03 placements. There is no production data yet.
- **R49:** a standards link is lost if edited offline before the first save.
- **R50:** an idempotency key reused with different content.
- **R61:** keyboard-only leg add on desktop.
- **R62:** installed iPhone not tested.

## Deploying for phone testing

1. **Done:** `takeoff-r03` fast-forwarded onto `main` and deployed. The feature flag is off, so staff see no change.
2. **Sam:** paste `supabase/migrations/206_takeoff_foundation.sql` into the Supabase SQL editor (production). Then run `NOTIFY pgrst, 'reload schema';`.
3. **Sam:** in Railway, set `TAKEOFF_ENABLED=true` on the API service. It redeploys itself.
4. Run `node scripts/takeoff/probe-live-schema.mjs` (read-only). The 206 rows should read PRESENT.
5. On an iPhone: open the Worker PWA from a `/worker?token=…` link, then **Add to Home Screen**. Open a job → Plans → **Takeoffs — measure & order flashings**. Run A01, A02, A04 and A09 on a real plan. **Export drafts only; don't send to Fielders yet.**
6. **Rollback:** unset `TAKEOFF_ENABLED`. All data is kept; never drop the takeoff tables.
