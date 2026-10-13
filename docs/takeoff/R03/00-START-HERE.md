# Blue Leaf Hub — Takeoff build handoff R03

13 October 2026. Planning deliverable, not an implementation or a production-readiness certificate.

## What to build

One shared takeoff foundation, with a complete phone-first flashing workflow in the first release. Build it in the current Hub repository. Reuse existing job plans, branding, role conventions and suppliers. Later material methods use the same measurement and ordering contracts.

Read in order:
1. `01-BUILD-SPEC.md` — scope, defaults, UI, data and calculation contracts.
2. `02-ACCEPTANCE.md` and `calculation-cases.json` — observable pass conditions.
3. `03-AUDIT-RECONCILIATION.md` — corrections to the audit and evidence boundaries.
4. `04-CLAUDE-LAUNCH-PROMPT.md` — the one launch prompt.
5. The original audit alongside this pack, especially its source manifest and repo map.

The audit identifies `~/Desktop/blue-leaf-hub.nosync`, branch `portal-v2`, commit `022202a47175846b3c4fc28db1a6350a8f2febe0`. Verify current HEAD and working tree; this is a baseline, not permission to reset newer work. The older `blue-leaf-hub` directory is reported stale. Do not build from the exported archive in place of the real checkout.

## Already settled by the owner

- Flashings: draw and edit on a phone, dimensions/angles/end folds/coated face, saved company standards copied into jobs, lengths × quantities and supplier PDF.
- Fielders as default supplier; standard COLORBOND colours; 0.55 BMT flashing default.
- Measured straight run: add 200 mm total, round upward to 100 mm. Each corner ends a run.
- Manual and counted lengths are finished order lengths; do not add that allowance again.
- Above 6 m: keep whole, flag handling, offer Split. 6 m is not a stock increment or hard limit.
- User's 9 m ordering ceiling is separately configurable.
- Main plan selection and horizontal plus vertical two-point calibration.
- Material-specific methods and editable ordering parameters; additional materials must be addable using existing methods.
- Timber default stock increment 600 mm, with member length/pitch separate from count at centres.
- Future procurement integration, including job/company/delivery/supplier details.
- First build establishes the shared base and flashing workflow. Full timber/cladding production workflows follow.

## Proposed defaults to avoid repeated questions

These are design choices proposed here, not earlier owner approvals. They are isolated so changing them does not unravel the build.

1. Both Hub and Worker PWA use the same takeoff components. Hub admins/supervisors can prepare takeoffs. Existing PWA leading hands can prepare takeoffs for authorised jobs. Ordinary workers keep plan viewing only. Company-standard editing and recording an order as placed remain staff actions, with order placement restricted to admin initially.
2. Online saving with local recovery of unsaved edits. No first-release promise of downloading plan sets for fully offline work. An already-open plan may remain usable during a short dropout; all unsynced edits are labelled honestly.
3. Export/share a reviewed PDF; no automatic supplier sending, pricing engine, Buildxact PO push, or full procurement synchronisation in release one.
4. Normal and landscape layouts are supported; remove the portrait-only manifest preference and verify actual installed-device behaviour.
5. Span-based structural sizing is outside release one. Keep manual sizes and provenance; do not ship unverified table data.

The launch prompt uses these defaults if the owner gives no corrections. Do not silently substitute Hub-only access or remove recovery just to shorten the build.

## Evidence boundary

The uploaded audit reports five investigations. This review read the main findings and checked selected source anchors: plan routes/upload/delete/auth, worker auth and leading-hand capability, dependency/build config, plan UI, the PDF builder, and the off-branch issue SQL. It did not run the app, query a live database, independently verify span-table cells, or measure iPhone performance. The archive's reports are evidence leads, not passing test results.

The pack deliberately includes no source clone or uploaded customer/media files. Keep the original audit zip alongside it. Earlier UI mockups are visual references only; these written contracts resolve any conflicting behaviour.
