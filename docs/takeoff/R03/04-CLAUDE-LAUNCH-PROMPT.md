# Single launch prompt for Claude Code

Use the strongest coding model available in your Claude Code account for the lead. This prompt does not depend on a specific model name or a particular agent-team feature.

---

Implement Blue Leaf Hub Takeoff R03 in the actual current Hub repository. Read the attached R03 handoff in its stated order and the supplied Takeoff Audit. Treat R03 as the product contract where it corrects the audit. User-approved decisions outrank older repository planning assumptions; follow repository coding/SOP/security conventions.

Your goal is a complete, reviewable first release: the shared takeoff base and full flashing workflow, in Hub and Worker PWA, with reusable standards, plan calibration, measured/count lengths, explicit splits, durable saving/recovery, supplier PDF and a minimal record of externally placed orders. Full timber/cladding and structural sizing are later scope, but their calculation contracts/tests must fit the foundation now. Do not stop at a prototype, a schema, or another plan.

Work autonomously through the internal gates in 02-ACCEPTANCE. Do not ask for approval at every slice. Use the explicitly proposed defaults in 00-START-HERE unless I provide corrections. Record routine implementation decisions and carry on. Only ask when a genuinely unavailable business decision or access requirement prevents further work; complete everything unblocked first and batch remaining questions.

Preflight:
- Verify the real checkout. Audit baseline was ~/Desktop/blue-leaf-hub.nosync, portal-v2 at022202a; do not use the stale sibling or reset later changes.
- Read AGENTS.md, CLAUDE.md, relevant nested instructions, the data dictionary and SOP requirements fully.
- Preserve all existing work. Create an isolated feature branch/worktree where appropriate. Do not apply stashes or merge unrelated WHS/workforce branches.
- Compare relevant current files to the audited baseline. Validate live schema read-only if credentials permit, without exposing secrets; otherwise produce exact schema probes and keep live state UNVERIFIED.

Architecture:
- One shared browser-safe calculation module and one service layer, with separate staff/worker auth adapters. Do not duplicate phone/desktop implementation or clone all of workforceRoutes.
- Geometry and calibration are independent of material rules, and material calculations are independent of ordered quantities.
- Existing job_document IDs and immutable plan bytes anchor provenance. Preserve referenced plans. Fix supersession/deletion lifecycle in the touched path.
- Both calibration axes, reviewed mismatch handling, per-page/region scope and explicit revision review are mandatory.
- Preserve the existing navigation/branding. Phone viewer and profile editor are focused workspaces with real touch gestures and undo, not a shrunken desktop form.
- Follow all exact flashing rules and split coverage semantics in the spec. Use the supplied numerical cases as independent expected results.
- Implement optimistic concurrency, idempotency, actor-scoped recovery, immutable exports and explicit order-placement semantics. Do not claim an export sent an order.
- No guessed manufacturing specifications, span-table cells, lap values or automatic structural sizing.

Execution:
1. Prove shared PDF transform/gesture/render behaviour early in ui-review. Reuse the component in production. Continue local work if physical-iPhone evidence is unavailable, but do not mark that release gate passed.
2. Build and test persistence/auth/calibration, then profile/material/schedule/split, then export/placement. Verify the genuine end-to-end paths, not just fixtures.
3. Reuse current helpers and assets, keep dependencies justified, pin the PDF renderer/worker and inspect production/PWA build output.
4. Write SOPs during implementation. Add repeatable test commands and appropriate CI coverage. Use isolated test data/DB; existing general scripts can write live data and must be inspected first.
5. Run an adversarial review of coordinates, auth, job scoping, source deletion, concurrent export, duplicate placement, profile face orientation and partial quantities. Fix findings within scope.

You may organise bounded subagents if your environment supports them: viewer/interaction; shared maths/profile rules; persistence/auth/export; independent QA. First settle interfaces centrally. Assign non-overlapping file ownership. You remain responsible for integration, testing and final correctness. If subagents are unavailable, execute the same sequence yourself. Do not let parallel agents edit the same route/schema/contracts concurrently.

Authorised here: code, tests, local build, isolated development migrations and reviewable artifacts. Do not deploy, apply production migrations, send supplier messages, place real orders, push external purchasing records, publish customer plans, force-push or merge into production without separate authorisation. This is not a reason to stop the local build early.

Finish with one consolidated handover:
- What works and where to open it.
- Changed files, exact migrations and prerequisites, flag/enable steps and rollback.
- Test matrix with actual PASS/FAIL/BLOCKED/NOT RUN, commands and evidence.
- Phone/desktop screenshots and example generated supplier PDF.
- Any remaining live-schema or real-device checks, with precise instructions.
- Any scope deviation, known issue and owner decision still needed.

Maintain a brief BUILD_PROGRESS.md so interrupted/context-compacted runs resume without redoing decisions. Do not promise '99% certainty'; demonstrate compliance with the acceptance cases. Continue until the intended reviewable release is complete or a concrete external blocker remains after all other work is done.
