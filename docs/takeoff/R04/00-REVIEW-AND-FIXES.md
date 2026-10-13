# Blue Leaf Takeoff R03 — independent review and R04 changes

Reviewed 14 October 2026 (Adelaide). Source package reports final commit e86d91e21e33dce933ec659b56fd330858d9f2b4.

## Verdict

Retain the shared foundation. Revise the flashing interaction before calling it ready for site use, and fix the export-material mismatch before real ordering. Passing existing tests does not establish that the product meets the owner's usability brief.

This is an independent review and a concrete handoff for the building agent, not a patched application. No source implementation, database, deployment or live order was changed.

## Checks performed independently here

- Installed the supplied lockfile dependencies with scripts disabled, then ran the existing takeoff suites.
- 149 tests passed: calculation60; geometry36; gestures10; profile/editor model38; PDF5.
- Lint passed. Production Vite/PWA build passed, with chunk-size and existing bundling warnings. Main output roughly3.11MB, TakeoffApp167KB, pdf501KB. This is build evidence, not phone performance evidence.
- Database, handler and premigration suites SKIPPED: local PostgreSQL unavailable. The test runner exits0 despite these skips; don't report211 independently verified tests.
- Playwright browser download failed with invalid/truncated archive responses. No fresh interactive browser or physical-phone test was performed here.
- Inspected supplied phone workflow screenshot, relevant profile/material/recovery/service/export/calculation code, selected migration and plan-route changes.
- Executed four additional diagnostic cases against production functions. See reproduce.mjs and reproduction-results.txt. These assert CURRENT unwanted behaviour to prove findings; convert them into desired-behaviour regression tests for the fix.

The builder's bundled logs and screenshots remain useful evidence but have not all been independently repeated. This is a focused review, not an exhaustive security certification.

## Findings

### F01 — P1: an existing order can export the wrong material after a grouped material changes

Evidence: server/lib/takeoff/takeoffService.mjs, buildExportSnapshot, around576–592.

Reproduction:
1. Two job materials m1 and m2 are identical Monument flashings, each requiring one4600mm length.
2. They share one schedule bucket. Save an order line referring to that Monument bucket and jobMaterialId=m1.
3. Change only m1 to Surfmist. m2 still supplies the old Monument bucket.
4. Export the original line against the latest workspace revision.

Observed: buildExportSnapshot returns no readiness problems. The supplier group uses m1's NEW Surfmist specification, while the line's bucketKey still denotes Monument. Printed colour and allocation identity disagree. This is independently reproduced.

Fix: validate that the draft line, its referenced material and the current schedule bucket describe the same full specification. If not, flag the line stale and require a visible refresh/reselection. Do not silently relink to another material. Select one validated specification snapshot and derive PDF text, grouping, flags and allocations from it. Add guards for colour, profile, coating, BMT and perforation changes. Keep existing frozen exports unchanged. Increment the relevant calculation/spec schema version without reinterpreting historical keys.

### F02 — P1: drawing work is not covered by the claimed recovery

Evidence: ProfileEditor.jsx has local hist/sketch state; only onSave publishes the profile. TakeoffApp.jsx around157–173 connects onSave to material persistence (a new profile goes first into another in-memory rules screen). useTakeoffWorkspace persists only changes passed to ws.edit.

Impact: an edited profile or an entirely new flashing can disappear on refresh/PWA reload before Save/Save material, even though the package broadly describes recovery after each edit. Not just the last few milliseconds of browser storage: the entire active drawing session is outside that recovery path.

Fix alongside instant editing: persist actor/job-scoped editor drafts, including unfinished point lists, selected material, typed field drafts and history needed for undo. Keep incomplete drafts out of order-ready calculations. Connect valid existing-profile edits to workspace autosave; preserve a stable editor mount key so background revision updates do not reset focus/history. Recover a new flashing even before its colour/details are complete.

Acceptance: draw three legs and add a crush, kill/reload before leaving the editor, reopen same authorised job and restore the same drawing. Repeat for an existing profile and while offline. Never claim Saved until server acknowledgement, and distinguish local-only recovery.

### F03 — P1 product gap: drawing controls and Apply forms obstruct the main task

Evidence: ProfileEditor.jsx LegEditor/CornerEditor/EndEditor require form submission; DimensionChips plus shape toolbox duplicate canvas controls. New drawing first needs Done drawing, then edits, then Save; adding a job flashing needs a further Save material. End treatment toggles update only local form state until Apply.

Owner explicitly wants fewer buttons, auto-applied edits, undo, and easy crush folds. Implement 01-INTERACTION-REVISION.md. This supersedes R03 UI confirmation behaviour; preserve explicit confirmation only where the action actually publishes/places an order or changes a company standard.

### F04 — P2: unpainted materials require an invented colour

Evidence: shared/takeoff/schedule.js materialProblems unconditionally requires s.colour; independently reproduced for ZINCALUME with blank colour.

Fix: material/finish capability determines whether colour is required. Unpainted options display Natural / not applicable, save a structured no-colour state, and export without a fake colour or painted-face claim. A selected fabrication reference side may remain, but must not be called coated/painted face where inapplicable. Preserve existing legacy 'N/A' entries through an explicit compatibility mapping.

### F05 — P2: split staleness checks rounded output, not actual source changes

Evidence: shared/takeoff/schedule.js computeContribution compares only result.quantity and sourceFinishedMm. Test suite checks a source change that alters finished length, leaving the same-rounding case untested.

Reproduced: measured6980→6990, both finished7200, split2×3700 with200 lap stays stale=false.

Fix: persist source measurement/calibration revision and the relevant rule revision/hash at split creation. Changes invalidate the split even if rounded finished length stays the same. Re-review is explicit; don't alter frozen exports. Add a rule-change case that leaves finished length unchanged.

### F06 — required extension: perforation must be part of the data and order, not merely a dropdown label

Evidence: catalogue.js has only four finish suggestions. cleanSpec in takeoffService.mjs allows only product/productCode/finish/bmt/colour/colourCode/supplierName/notes. materialSpecKey does not encode perforation. takeoffPdf prints a limited list of fields. Diagnostic confirms that adding a structured perforation object alone still creates the same grouping key as solid metal.

Fix every layer together: validated material spec, preset copying, recovery, grouping identity, snapshot, PDF and source review. Include solid/perforated, material/finish, BMT, and for perforated product either a supplier product code or defined pattern/diameter/pitch plus perforated extent. Don't merge holes of different sizes, solid and perforated, or different perforation zones. Don't infer ventilation/bushfire compliance from 'perforated'.

### F07 — P2 scope gap: manual/count long pieces have no explicit Split action

The package declares this as deviation D5, but it is not required by 'finished length'. That phrase means no extra allowance; it does not prevent splitting. Owner previously said keep a long piece whole and flag it with a split action.

Fix: provide Split for measured, manual and counted contributions. For manual/count use original FINISHED length directly, with no+200. For quantity>1, let user choose number of originals to split; scale child quantities correctly and retain unsplit remainder. Show whole originals and child pieces without double-counting.

### F08 — P2 usability gap: precision aid omitted

Package K5 acknowledges no placement loupe. R03 asked for an offset magnifier/crosshair. Drawing endpoints and calibration points must remain visible under a finger. Include it in the same interaction revision, especially if the0.5% scale check otherwise forces repeated failed taps.

## What is worth keeping

Shared calculation modules, genuine PDF renderer, two auth adapters, explicit finished-length rules, material copies, immutable export pattern, local SQL test harness and the distinction between export and externally placed order are substantial foundations. Existing tests cover many happy paths and boundaries. The plan-delete path now restricts document types and deletes/archives DB state before removing bytes, improving the audited baseline.

No reason to restart the build. Make a focused R04 correction pass, add the missing adversarial tests, then run the genuine phone gate.

## Release decision

Do not enable for real supplier ordering until F01 and the material identity/export changes pass. Do not describe recovery or Flash.It-like ease of use as complete until F02/F03 pass actual phone journeys. Re-run the database and handler suites in the builder's isolated environment; physical installed-iPhone evidence remains outstanding.
