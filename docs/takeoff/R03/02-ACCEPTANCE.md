# Acceptance and execution gates

These are internal build gates, not requests for Sam to approve every slice. The lead agent owns progressing through them, fixing failures and collecting evidence. Mark each PASS / FAIL / BLOCKED / NOT RUN. Never equate a fixture screenshot with production integration.

## Sequence

1. Verify real checkout, current instructions, working tree and audit drift. Inventory schema without making production changes. Record capability defaults from START-HERE.
2. Build the shared coordinate/gesture viewer in ui-review with a synthetic known-dimension PDF and a permitted representative real plan. Establish stable geometry and bounded rendering before dependent UI.
3. Add schema, scoped service/auth adapters, concurrency and recovery. Use isolated test DB if available. Keep production feature flag off until schema and access checks pass.
4. Add two-axis calibration and measured/count capture; then profile, standards, rules, schedule and split.
5. Add frozen exports and externally placed-order records. No automatic sending.
6. Validate later material contracts through executable tests; write SOPs and release evidence; provide one consolidated handover.

If real-device or deployment credentials are missing, complete all local work, list the remaining rollout tests and keep rollout off. Do not stop all implementation at a test requiring unavailable hardware.

## Mathematical tests

`calculation-cases.json` is an independent set of expected outcomes. Write executable tests against the production functions, not a separate copied implementation. Add invalid-input and boundary cases.

- Screen→PDF→screen round trip across PDF rotations0/90/180/270, crop-box offsets, nondefault userUnit, DPR1/2/3 and zoom1/4/12. Numerical round trip within1e-6 page units; pointer placement within2 CSS px in UI testing.
- Calibrations sx=20, sy=20 yield uniform scale20. With dx300,dy400 length10000. Axis mismatch greater0.5% cannot silently save as normal. Separate scales20/25 with delta300/400 yield hypot(6000,10000).
- Third dimension check above0.5% leaves calibration Needs review. No scale leak between pages/regions. Crossing the selected region is rejected or explicitly split, not guessed.
- Allowance once per straight run; never per end, never per split child, never in manual finished length.
- Positive finite values only, no fractional piece counts, no boundary errors caused by mm/m conversions.
- Profile length/angle edits preserve other specified dimensions; end treatment included once. Coated side survives save/reload, rotate, mirror and reverse. Two different shapes of equal girth never merge.
- Rafter contract: 4100 projection at22.5° -> true length approximately4437.808 -> stock4800 with600 increment. Already true4100 ->4200. Distribution6000 at600 centres ->11;6100 ->12; positions end at6100, not6600.
- Simple wall-sheet contract: wall6100mm / cover1200mm ->6 sheets when selected sheet height covers wall. Height above maximum without joint rule -> Needs rule. No automatic opening-area deduction.
- Area-to-linear: 27m² /0.09m effective cover ->300lm before waste. Nominal width does not stand in for cover.

## Workflow/security/data tests

| ID | Scenario | Required result |
|---|---|---|
| A01 | Open existing carpentry plan | Correct job/document, primary-page choice, original view fallback |
| A02 | Operations project plans | Reused job-document layer; missing linked job returns actionable409 |
| A03 | Charge-up site | Correct parent/job scope; IDs from another site rejected |
| A04 | Worker roles | Leading-hand editor works on authorised job; ordinary worker/client denied writes |
| A05 | Preview mode | Every takeoff write denied, including export/placement |
| A06 | Resource tampering | Foreign document/calibration/material/order IDs rejected on read and write |
| A07 | SQL permissions | Direct anon/auth table access denied; unauthorised RPC execute denied |
| A08 | Two writers | Same expected revision: exactly one save succeeds; other409 retains local edits |
| A09 | Retry | Same idempotency key gives same result, no duplicate count/run/export/placement |
| A10 | Reusable profile | Changing job copy leaves standard and other jobs unchanged |
| A11 | Rule edit | Before/after draft calculation shown; old export hash and PDF unchanged |
| A12 | Supersession failure | Failed new-row insert leaves old plan current; no orphan active revision |
| A13 | Cross-job supersession | Rejected before storage/DB mutation of target |
| A14 | Delete measured plan | Referenced object not removed; archive/restrict before storage deletion |
| A15 | Changed plan | Old measurements retained and marked review; new plan needs scale |
| A16 | Split | Correct coverage; replaces original contribution; undo restores once |
| A17 | Count length change | New marks use new length; previous marks retain theirs |
| A18 | Short network loss | Visible unsynced state; edits recover; no false Saved |
| A19 | Reload recovery | Actor-scoped restore; base-revision conflict does not overwrite server |
| A20 | Storage quota failure | User sees recovery failure; in-memory work retained |
| A21 | Export vs order | Export does not increase ordered quantity; record-placement does |
| A22 | Partial allocation | Required10, placed6, remaining4; retry unchanged; competing over-allocation rejected |
| A23 | Cancel/additional order | Current commitment counted once; historic exports retained |
| A24 | Server authority | Tampered client totals/profile outputs not trusted; server recalculates |
| A25 | Missing migration | Feature reports unavailable, no partial/silent success or raw DB messages |
| A26 | Frozen PDF | Snapshot suppliers/company/profile/rules persist even after live edits |
| A27 | Artifact failure | Failed render/upload is retryable, no ready link or order placed claim |
| A28 | PDF pagination | 1-profile and40-line multi-profile orders render all rows, labels and symbols without collisions |

## Phone usability and performance

Test390×844 portrait,844×390 landscape, a smaller360px width, and desktop. Review safe areas, keyboard opening, selected geometry visibility, accessible controls and error focus. Verify Hub and Worker shells separately.

Real-device release gate: an installed iPhone PWA can pan/pinch/measure for20minutes without a reload, growing canvas allocation, unexpected sidebar opening or accidental points. Use one representative>=10-page A1 set; record device, iOS, file size/page count and network. Do not check a private plan into git unless authorised; use a sanitised fixture for automated tests.

Targets (measure and report, not guarantees): after bytes are available, first page interactive within2seconds and cached page switch within800ms on the chosen baseline phone; gesture navigation at least30fps; quality rerender after gesture settles. Do not rerasterise every pinch frame. Track memory/resource counts; cap canvases and cancellations even if Safari does not expose reliable resident memory.

Prove no dependency on expired signed URLs for bytes already downloaded; simulate expiry/failing range requests instead of blocking the agent for65minutes. A reopen obtains a fresh authorisation/URL. For streamed documents, explicitly test renewal; do not claim this branch works from the in-memory case.

Inspect actual production output and service-worker precache. Required shell assets must remain cached; do not assume dynamic import alone prevents oversized chunks or that exceeding4MiB is always silent. UI-review fixtures must not ship as production data. No external PDF worker URL.

## Repository gates and deliverables

- Run lint and production build; baseline unrelated failures separately from introduced failures.
- Add an explicit takeoff test npm script and wire it into an appropriate CI job on the feature branch/PR. Existing general test scripts may hit live services; inspect before running.
- Unit/calculation tests, real handler tests with mock DB, and isolated transactional DB tests where available. Mocks alone cannot prove SQL atomicity, FK deletion behaviour, RLS or RPC privileges.
- UI-review and Playwright journeys for both shells. Add security regression tests for new routes.
- No real supplier email, PO push, private-file publication or write tests against live customer jobs.
- Required SOPs follow the repo's full14section template, Section14 includes TC01–05 plus feature cases; update SOP index/changelog and preserve honest test status.
- Final evidence: changed files, migrations/prerequisites, test commands/results, screenshots, sample supplier PDF, unresolved operational tests, enable/rollback instructions and known limitations.
- One rollback plan disables entry/feature flags while retaining plans, takeoffs and export history. Do not recommend dropping tables that now hold job evidence.
