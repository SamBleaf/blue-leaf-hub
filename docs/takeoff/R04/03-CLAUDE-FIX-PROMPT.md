# Revised R04 building-agent prompt — complete the product brief

Continue the existing Blue Leaf Hub Takeoff build using this revised R04 pack. Implement and verify the corrections in one sustained pass. Do not stop at another plan or require approval between routine edits.

Read 00-REVIEW-AND-FIXES, 01-INTERACTION-REVISION, 02-FIELDERS-DROPDOWNS, 04-BRIEF-GAPS-AND-REQUIRED-OUTCOME and 05-END-TO-END-ACCEPTANCE, plus the existing R03 contract and current repository instructions. Latest owner direction and this amendment supersede conflicting R03 drawing confirmations/deviations. Preserve unaffected requirements and newer/uncommitted work.

## Product verdict to resolve

The technical foundation is worth keeping, but the product has not met the finished brief: a general builder must be able to open a job plan, draw/reuse a flashing easily on a phone, take off lengths and reliably produce an order. Existing unit-test passes do not establish that outcome.

Close the B01–B14 gaps in 04 and prove A01–A09 in 05. Distinguish implementation gaps, unverified behaviour and future scope. Do not restart the app or implement later timber/cladding/structural sizing/full procurement in this correction.

## Required implementation

1. Fix F01 first: draft line, schedule bucket, material specification, PDF and allocation must agree. Material/source changes make affected draft lines visibly stale; require explicit reconciliation. Guard colour/profile/BMT/coating/perforation. Keep historical exports immutable.
2. Simplify drawing around the canvas. Add flashing replaces Add material in this workflow. Endpoint → Crush fold applies immediately, width is directly editable and flip is one action. Move occasional transforms to More; avoid duplicate dimension controls.
3. Routine drawing/detail edits auto-apply valid changes. No Apply, required Enter or intermediate Save. One logical edit equals one Undo. Cancel stale debounces and preserve focus, keyboard, viewport and history across acknowledgements.
4. Fix F02 with that lifecycle: recover unfinished new sketches and invalid field drafts, not just saved materials. Existing valid changes reach workspace persistence. Stable editor identity; accurate Saved/local-only states; existing conflict/auth protection.
5. Complete material dropdowns and the entire data path described in 02: solid/perforated, material/finish, BMT, applicable colour and adequate perforation specification. Unpainted needs no fake colour. Validation, identity, presets/copies, recovery, snapshots and PDF must agree. Keep 0.55 BMT as company default without inventing Fielders availability.
6. Preserve measured +200 mm total then upward 100 mm rounding. Manual/count inputs are finished lengths. Extend explicit split to manual/count, handle partial quantities, overlap and source provenance, and invalidate splits even when changed input rounds to the same result. Keep long pieces whole and flagged until user splits; 6 m is handling threshold, 9 m configured ceiling.
7. Add precision loupe/crosshair and verify existing job-plan entry, main-page choice, two-axis scale, per-page/revision state, plan replacement and reload. Fix missing existing carpentry integration needed for A04. Preserve a shared seam for future operations plans.
8. Confirm standard-to-job-copy isolation and readable supplier PDFs. No fake job/supplier/delivery data; preserve export vs placement distinction.

Use reproduce.mjs to understand independently reproduced failures; it currently asserts bad behaviour. Add desired-behaviour regressions instead of treating successful diagnostic execution as correctness.

## Verification and scope

Follow the concrete interaction choices in 01. Finish all unblocked work; report missing access/hardware as NOT VERIFIED rather than repeatedly stopping.

Run relevant unit suites, isolated SQL/handler/premigration tests, UI workflows, lint and production build. Add regression coverage for confirmed defects and instant-edit/undo races. Run complete A09 and reconcile expected six pieces / 22,600 mm against schedule and PDF. Test counts are evidence, not acceptance.

Use actual installed-iPhone evidence for site-ready claims; emulated screenshots do not prove touch usability. If phone hardware is unavailable, finish implementation and other checks and explicitly leave that gate pending.

No production migration/deployment, real supplier messages or real order placement is authorised. Do not expand into later material estimators or procurement modules.

## Return one review package

Provide code/diff and commit, migration instructions, actual logs with skips identified, completed B/A matrix with evidence paths, screenshots/touch recording where available, synthetic solid/perforated supplier PDFs and remaining limitations.

State separately: implementation complete/outstanding; automated/database/browser verification; real-phone and owner product acceptance. Do not call it finished, site-ready or meeting the brief while a blocking correctness/usability gate remains failed or unverified.

