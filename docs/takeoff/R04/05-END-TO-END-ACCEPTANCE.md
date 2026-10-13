# R04 — product acceptance, not just test count

Run on an isolated test job with a synthetic plan of known dimensions and synthetic supplier details. Do not issue a real supplier order. Record commit, build, browser/device, test inputs and actual outputs. Supplied prior evidence cannot substitute for rerunning affected workflows.

## A01 — everyday phone drawing

From the existing job, choose Add flashing. Create three legs, correct dimensions to 100 / 150 / 75 mm, set corners to 90°, select a face, add a 10 mm crush at the terminal end and flip it.

Expected:
- Endpoint → Crush fold takes two taps and immediately updates canvas.
- Dimensions/angles/face/fold changes need no Apply, required Enter or intermediate Save.
- Normal unselected view has at most five general actions and no duplicate dimension list.
- Keyboard, finger and sheets do not obstruct the point being edited; loupe/crosshair assists precision.
- Undo reverses one logical edit, not every typed digit. Viewport/focus stays stable.
- Details/Lengths are navigation; returning preserves work.
- Desktop retains equivalent functionality with keyboard access.

Evidence: genuine phone touch recording plus screenshot of final profile and dimensions. A simulated mobile viewport is additional evidence only.

## A02 — autosave, undo and interrupted work

New unsaved flashing: draw three points, add fold, type a partial invalid field, leave/reload. Repeat on existing job-copy profile, and after going offline.
- Restore unfinished geometry and draft input in the same authorised job/user scope.
- Invalid drafts do not become zero, NaN or order-ready geometry.
- Enter 150 replacing 100; Undo once restores 100 in both field and canvas.
- Undo during pending debounce cannot be overwritten by that callback.
- Change selected segment before debounce; no update lands on another segment.
- Server acknowledgement does not remount editor, close keyboard or reset history.
- Local-only recovery is labelled accordingly; Saved means server acknowledgement.
- Genuine concurrent edits surface conflict instead of silently overwriting.
- Logging out/changing job does not expose another user's draft.

Check ordinary reload recovery and installed-PWA interruption. Report any storage/OS limitations rather than promising lossless recovery under every possible device failure.

## A03 — standard to job copy

Save a company standard through the explicit standard action. Add copies to test jobs A and B. Resize A and change its colour/fold/perforation.
- Standard and B remain unchanged.
- A survives reload with exact geometry and attributes.
- Choosing the standard again creates a fresh copy.
- Previous exported orders remain unchanged.
- Preserve current permission rules for publishing/editing company standards.

## A04 — plan entry, calibration and revisions

Open plans from an existing carpentry job. Following upload, expose Scale plans; select the main floor-plan page. Set two horizontal reference points and known distance, then two vertical points and known distance. Verify a third independent known distance.

- State is bound to the actual PDF document revision/page; another page cannot silently inherit an incompatible scale.
- Zoom/pan/display rotation do not alter physical measurements or shift marks.
- Use long reference distances with visible endpoints and a precision loupe.
- Existing scale discrepancy checks remain; no silent averaging of materially conflicting axes.
- Reopen same job: correct main plan, marks and calibration restored.
- Replacing plans does not carry old annotations/scale onto new content without explicit review.
- Changed calibration invalidates dependent takeoff/split state and affected draft orders as appropriate.
- Loading, unavailable PDF, expired-access/retry and permission states are understandable.
- Never broaden access to unrelated job documents.
Operations reuses the shared integration seam when its plan upload is later built; do not invent that module as part of this correction.

## A05 — quantities and arithmetic

Use millimetres internally or another exact, explicitly tested representation.

| Entry | Expected result |
|---|---|
| Measured 4,321 mm straight run | 4,600 mm: ceil((4,321 + 200)/100) × 100 |
| Measured 4,400 mm | 4,600 mm, no extra 100 mm at exact boundary |
| Two separate measured 4,321 mm runs | Two 4,600 mm pieces; allowance applied once to each run |
| Manual finished 4,321 mm, quantity 2 | Two 4,321 mm finished pieces; no measured +200 mm or measured rounding silently applied |
| Count three occurrences, finished length 4,600 mm each | Three 4,600 mm pieces |
| Same profile but different lengths | Separate length rows with correct quantities |
| Same dimensions but different colour/BMT/face/perforation | Do not merge unless full manufacturing identity is demonstrably equivalent |

If an actual supplier restricts a manually entered finished length, show a clear validation/suggested order length; never silently treat it as a tight measurement.

## A06 — handling flags and explicit splits

Measured 6,980 mm → 7,200 mm finished:
- Remains one piece with an over-6 m handling flag and Split action.
- Explicit two-piece split with 200 mm overlap can use 3,700 + 3,700 mm: 7,400 minus 200 = 7,200 effective coverage.
- Lap is visible and deliberate, not an unexplained extra allowance or an invented manufacturer requirement.
- Change source to 6,990 mm: finished still 7,200 but split becomes stale until reviewed.
- Repeat changing source calibration or relevant rule revision while rounded result remains unchanged.

Manual 7,200 mm, quantity 3:
- Split one original into two 3,700 mm pieces with the same explicit 200 mm lap.
- Output: two unsplit 7,200 mm pieces and two 3,700 mm pieces. No original/child double counting; no measured +200.
- Can undo/remove split and restore three originals.

Exactly 6,000 mm is not over the handling threshold. A 9,100 mm piece cannot be released as order-ready under the configured 9,000 mm ceiling; retain it visibly for correction/splitting. Test equality boundaries. Do not silently split any piece.

## A07 — materials end to end

Create solid painted, solid unpainted, and perforated flashing examples.
- Select construction, material/finish, BMT and applicable colour.
- Unpainted requires no invented colour; face terminology remains appropriate.
- Perforation is either an unambiguous supplier product code or specified hole pattern/size/pitch and extent; selected legs/solid margins are retained where relevant.
- Same geometry solid/perforated never shares an incorrect order bucket.
- Changing colour, thickness, finish or hole pattern updates fabrication identity and invalidates affected draft selections.
- Save/reload, standard copying, recovery, schedule, order review and PDF all preserve these fields.
- Owner's 0.55 BMT default is not represented as universal Fielders stock confirmation.
- Use 02 for sourced option scope. Preserve historical/custom values without presenting unsupported combinations as confirmed availability.
- Confirm whether the PDF needs a supplemental perforation annotation to make the order unambiguous; do not just print “perforated”.

## A08 — stale order and immutable export

Run the supplied F01 diagnostic scenario with two initially identical Monument materials. Change one to Surfmist after creating the draft order.
- Old draft line becomes visibly stale and cannot produce an order-ready PDF or placement allocation.
- Reconcile explicitly; chosen colour, current bucket, quantity and PDF all agree.
- Repeat for profile, BMT, coating/finish and perforation.
- Also change source lengths/quantities after draft selection and verify current-source consistency.
- An already frozen export stays byte/hash stable and retains its historical specification.
- Refresh/reselection does not silently remove other order lines or duplicate placed quantities.
The bundled reproduce.mjs proves former bad behaviour; replace its bad-behaviour assertions with desired-behaviour regression tests in the app suite.

## A09 — complete plan-to-order exercise

Use one synthetic job and supplier:
1. Open/calibrate the main plan (A04).
2. Create the flashing in A01 and choose material.
3. Add two 4,321 mm measured runs and one 6,980 mm run.
4. Keep the long piece flagged, then explicitly split it as A06.
5. Add two manual finished 3,000 mm pieces.
6. Close/reload, check restored profile/marks/lengths.
7. Review order and create a draft PDF only.

Expected schedule for that single specification:
- 2 × 4,600 mm
- 2 × 3,700 mm (from the explicit 7,200 mm split with 200 mm lap)
- 2 × 3,000 mm
- Six pieces, total ordered length 22,600 mm.
The original 7,200 mm piece is not additionally counted. Repeat with a second colour to prove grouping isolation.

Verify PDF visually: leg dimensions, angles, crush width/direction, applicable face indication, material/finish/BMT/colour, perforation details where used, piece lengths/quantities, actual job/company/supplier/delivery fields, notes and no clipping. Missing order details are surfaced, not fabricated. A plain linear-metre total is insufficient.

Run the core journey on desktop and actual installed iPhone PWA. Builder can report implementation/code gates complete if hardware is unavailable, but site-ready product acceptance remains NOT VERIFIED pending actual phone evidence and owner trial.

## Final return

Return an updated source/review ZIP, B01–B14 and A01–A09 results, evidence paths, actual test logs, synthetic solid/perforated PDFs, commit/diff, migrations and known limits. Clearly separate automated, browser-emulated and physical-device evidence.

Release gates: no F01-style identity mismatch; no reproducible drawing-loss path covered by A02; accurate quantities/PDF; isolated database/API tests pass; phone journey verified. No live migration, deployment or supplier order is authorised by this pack.

