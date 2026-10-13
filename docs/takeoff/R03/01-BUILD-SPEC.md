# Build specification R03

## 1. Scope and boundaries

Release one must deliver: existing job plan entry, primary-page selection, in-app PDF viewer, two-axis calibration, straight-run measurements and counted pieces, editable flashing profile, company standards and independent job copies, material rules, explicit split, recoverable autosave, a length schedule, supplier selection/delivery details and a frozen supplier PDF.

Include a minimal record of orders placed manually, tied to the exported snapshot, so exporting a draft never counts as ordering. No sending integration is required. Show required / ordered / remaining only from trustworthy records.

Later: production timber/cladding screens, installation-manual catalogues, structural sizing, roof-sheet takeoff, pricing, delivery tracking, partial receipts, nesting/cutting optimisation and procurement automation. Their contracts must fit now; their UI must not appear as working features before implemented. No 3D or tapered flashing designer.

Record an architecture decision superseding the old MASTER_PLAN allocation of all quantity work to Bestimator/Buildxact. The user's instruction authorises Hub measurement, material calculations and ordering preparation. It does not authorise rebuilding Bestimator or structural engineering automation.

## 2. Product and navigation

Preserve the existing look: Lato, primary #006c9b, page #F8F9FA, white cards, muted #64748b, ink #1A1A2E, light borders, roughly 12 px card radius. Reuse actual Tailwind tokens and existing logo assets.

Enter from the existing Plans card/sheet. Add a Takeoffs action alongside normal plan viewing. Do not add a new main module or replace Today/Tasks/Week. In the Hub, mount within the current job context. In the Worker PWA, remain under /worker so the installed app scope is respected. The same feature components accept a job context and API adapter; no duplicate mobile implementation.

### Windows and states

| Window | Essential content | Main action |
|---|---|---|
| Plans | Current plan sets, revision label, primary page, Not scaled / Ready / Needs review | Set up plans / Open takeoffs |
| Plan setup | Page thumbnails or compact page picker; choose primary floor plan; optional scale region | Scale this page |
| Calibration | Horizontal points and dimension, then vertical points and dimension, independent check | Save scale |
| Job takeoffs | Saved groups, material, piece count, unsynced/stale indicators | Add material |
| Choose material | Company standards, search, recent items, Draw new flashing, Add material preset | Use on this job |
| Material rules | Profile/material/colour plus measured allowance, rounding, handling threshold, order ceiling | Start takeoff |
| Measure | Full-screen plan, minimal top job/page bar, Run / Count / Pan, undo, live result | Add run / Finish count |
| Flashing profile | Full-screen grid, selected leg dimension or bend angle sheet, face side, end folds | Save profile |
| Length schedule | Qty × finished length, raw/allowance explanation on expansion, long-piece warnings | Review order |
| Split | Required coverage, pieces and lap, computed coverage, lengths/flags | Apply split |
| Review/export | Supplier, job, delivery, profile drawings and quantities, incomplete fields | Export supplier PDF |
| Order history | Frozen exports and explicit externally placed orders, dates and reference | Record order placed |

On phone, use one focused window and a bottom sheet, not stacked modal wizards. Drawing/calibration temporarily hide bottom module navigation and restore it on exit. Minimum primary touch target 44 CSS px. Keep dimensions readable without horizontal form scrolling. Desktop uses the same viewer with a right-hand property panel. Numeric entry is direct, with units always visible.

Every async screen needs loading, empty, retry, no-access and unsynced states. No silent failure or success toast before persistence. A stale plan must be visible beside its measurements and order preparation.

## 3. PDF and touch foundation

Introduce pinned `pdfjs-dist`, loaded only when opening takeoff. Bundle its matching worker locally; no CDN dependency. Use its viewport transforms for PDF rotation and crop-box origin rather than multiplying screen pixels by one guessed scale.

Persist geometry in unrotated PDF user-space coordinates together with page index and page metadata. Display page numbers as 1-based; API/storage index is 0-based. Record page view box, intrinsic rotation and PDF userUnit. Never store viewport pixels as measurement coordinates. DevicePixelRatio affects raster resolution only, not geometry or mm.

Use a raster PDF layer and a separate vector annotation layer. Keep a bounded backing canvas; do not allocate a full A1 page at 12× and device DPR. Pinch transforms the current bitmap immediately; render sharper content after the gesture settles. Cancel stale render tasks, release previous page resources, and bound retained page/thumbnail buffers. Start with one active full page. Visible-region rendering may be needed; prove it before introducing server raster infrastructure.

For the supported initial file envelope, fetch PDF bytes once per open, with progress, cancellation and a visible retry. Recommended initial envelope: 40 MiB files, up to 100 pages; these are provisional product limits to validate, not browser safety guarantees. A larger existing document must still have an external-view fallback and a clear explanation. Do not break existing uploads because the takeoff renderer has a lower limit. Reuse a refreshed authorised URL on a failed download; never persist signed URLs as document identifiers.

Gesture rules:
- Run/Count mode: short single-pointer tap places a point; movement above 8 CSS px becomes pan and places nothing. Two-pointer interaction is always viewport navigation and places nothing, including when one finger lifts first.
- Pan mode: all single-pointer movements navigate, never measure.
- Endpoint editing uses a draggable handle with an offset magnifier/crosshair so the finger does not hide the point. Keyboard nudges on desktop.
- Apply touch-action restrictions only to the viewport. Explicitly suppress the existing AppShell edge gesture while focused. Preserve normal browser zoom/accessibility elsewhere.
- Pointer cancel, lost capture, route exit and a second finger arriving must leave a valid state.
- Profile drawing and plan measurement share gesture helpers, not one overloaded state machine.

Prove this early inside ui-review, then reuse the proven component in the production feature. Do not build a throwaway viewer and rewrite it. Real-device testing may remain pending if no iPhone is available; continue other work, keep rollout disabled and report the exact missing evidence.

## 4. Calibration contract

The owner called this longitude/latitude; the UI calls it Horizontal and Vertical.

Calibration identity: immutable document ID + content identity + page index + optional region ID + calibration revision. A primary page is a job preference, not an automatic scale for other pages. A nullable region means full page. Region calibration can be created by drawing a rectangle and giving it a label. Overlapping regions require explicit active-region selection. Runs must remain inside the selected region; no automatic cross-region scaling.

Workflow:
1. Choose the primary floor-plan page. Rotate its display if needed.
2. Tap two points on a long horizontal dimension and enter its stated mm length.
3. Repeat on a vertical dimension.
4. Compute sx and sy from axis-projected distances in the page-aligned basis; lock the endpoint's secondary coordinate in each axis step. Save the basis orientation separately from display zoom/rotation.
5. Compare scales using abs(sx-sy)/mean(sx,sy). Show both known dimensions and discrepancy.
6. At <=0.5% discrepancy, permit ordinary calibration with one uniform scale equal to their mean, after independent verification. Above 0.5%, require retapping or explicit 'Drawing stretched: use separate X/Y scales'. Never silently stretch the drawing. Separate scales are for orthogonal stretch, not perspective/shear correction.
7. Check a third printed dimension. Record expected/observed mm and error. <=0.5% passes by default. Above that, retain setup as Needs review, allow visual inspection, and block new order-ready measured results until recalibrated. There is no claim that the drawing itself is dimensionally accurate.

For separate scales: transform the PDF delta into the calibration basis (dx,dy); length = hypot(dx*sx,dy*sy). Uniform mode uses hypot(dx,dy)*s. Use one pure shared implementation.

Validation: finite positive known lengths, endpoints separated by at least 20 CSS px at placement (UX guard), nonzero PDF separation, bounded scale and geometry, no NaN/infinity. The CSS separation guard is not stored measurement accuracy.

Never alter an existing calibration in place after measurements use it. A recalibration creates a revision; offer explicit recalculation of selected draft measurements with before/after results. Old exports remain frozen. A newly uploaded plan revision gets its own calibration; no automatic measurement translation or plan recognition.

## 5. Measurement and flashing calculations

All physical lengths are mm; quantities of pieces are positive integers. Preserve raw measurement precision, but avoid display rounding feeding a second calculation. Use decimal-safe arithmetic or explicit fixed precision for allowance/stock rounding; define numerical epsilon only for floating-point noise, not a 1 mm tolerance that can under-order.

### Straight runs

Each pair of start/finish points is one physical run. In connected mode the previous end becomes the next start, and each corner creates a new run. A separately drawn straight run always gets its own allowance. Do not merge runs merely because the lengths happen to match.

For measured flashing run:
`finishedLengthMm = ceil((rawLengthMm + 200) / 100) * 100`.

Examples: 4312 -> 4600; 4300 -> 4500; 5800 -> 6000; 5801 -> 6100.

Show 'Measured 4,312 + allowance 200 → order 4,600 mm'. Allowance and increment are material rule parameters seeded with these defaults. Changing rules previews affected draft results and does not change measurements or placed orders.

Manual entry and count:
- Enter the finished length first, then tap each occurrence or enter quantity.
- Count marks inherit that length; changing the active length affects new marks only unless the user explicitly selects old marks to change.
- Manual 4312 stays 4312. No +200 and no rounding.
- Increment restrictions from a supplier, if later configured, validate manual values; never silently round an entered finished length.
- Reject zero/negative/blank/nonfinite lengths and fractional quantities.

Handling: compare FINISHED length. Exactly6000 no flag;6001 flag and keep whole. Exactly9000 permitted with handling flag;9001 exceeds ordering ceiling and blocks order-ready export until split or an authorised material-rule change. Both thresholds have distinct field labels and audit history.

Group schedule lines only when profile geometry, end treatment, coated side, material/finish/BMT/colour and finished length match. Preserve underlying contribution IDs. Same girth does not mean same profile. Never aggregate different lengths into one 'LM' order line. Total LM is a summary of pieces, not a replacement for the schedule.

### Explicit split

Do not assume a universal lap. Ask for the lap or read a reviewed material preset. Preserve one original run allowance; never add +200 to every child.

Split accepts child finished lengths and a lap for each joint. Coverage = sum(child finished lengths) - sum(joint laps). Coverage must be >= the original required FINISHED length. It intentionally preserves the already-rounded allowance. Display overcoverage. Child rounding is upward according to the selected ordering rule; recalculate coverage afterwards. All pieces obey the ordering ceiling and show their own handling flags.

Example: original raw7000 -> finished7200. Two3700 pieces with lap200 give coverage7200. Two3600 with lap200 give7000 and must fail. No automatic 'best split'. Keep the source run, its original result, split version, children and lap choices. Applying a split replaces its active unsplit schedule contribution, never adds both. Undo restores the original. Editing source/rules invalidates the split until reviewed.

## 6. Flashing profile editor

Profile dimensions are finished cross-section face dimensions entered by the builder, distinct from longitudinal order length. Draw a 2D open polyline; choose a standard or draw freehand then enter exact values. Drawing gives the shape; typed dimensions/angles drive the authoritative geometry.

Canonical profile:
- Ordered segment IDs, positive lengths in mm, initial direction.
- Signed turn at each vertex, with UI exposing included angle and bend direction. Straight continuation is 180° included angle; 90° square fold produces a ±90° turn. Do not confuse roof pitch with included fold angle.
- Explicit start/end treatments: none, open return, closed hem/crush; width and direction. A closed hem is a treatment with a diagrammatic symbol, not a zero-length or overlapping invalid segment.
- Coated face LEFT or RIGHT relative to traversal, rendered as an offset highlight along the profile and an arrow/legend. No isolated ambiguous arrow.
- Geometry schema version and explicit units.

Changing a leg length retains other leg lengths and bend angles, moving downstream vertices. Editing an included angle retains leg lengths. Rotation changes drawing orientation only. A mirror action transforms geometry and coating together; a separate Flip coated face action changes physical coating choice. Reversing traversal must swap side consistently. Give these separate tests.

Tap a leg label to edit mm; tap a corner to edit included angle/bend direction. Support common angle snaps (0/45/90 direction) plus typed arbitrary valid angles. End hems are separately editable. Minimum 30 undo/redo commands in current editing session; numeric commit is one command. Invalid/self-crossing ordinary segments block order-ready export, with exceptions only for explicitly modelled hem symbols. Labels must not obscure the profile: leader lines and zoom-to-fit are preferable to unreadable overlaps.

Store the profile as dimensions plus topology; coordinates are derived. PDF must dimension every leg, required bend and end treatment. 'Girth' is an indicative developed total from the dimension convention, including returns once; no fabricated press-brake bend deduction or exact sheet blank claim. Supplier fabrication instructions take precedence for bend allowances. Count folds only if a precisely defined supplier convention is configured; a guessed fold count is not required for v1.

Reusable standards are versioned, editable company records. A job material receives an independent full copy. Job edits never write back to a standard. 'Save as standard' is explicit and capability-gated. Updating a standard offers an update to job copies, but does not mark independent job work wrong or silently change it.

## 7. Material system

Registry keys identify code-owned, versioned calculation methods. Each declares parameter fields, units, bounds, required measurement roles, supported output and validation. Materials store product/spec and rule data. Never eval user formulas or allow method source code in database fields.

One environment-neutral ES module package under `shared/takeoff/` is imported by client and server. Verify Vite and Node import compatibility early. Prefer this single implementation over mirrored geometry libraries. Keep DB/auth/browser code out of it. Existing repository is JavaScript; use .js/.mjs and JSDoc plus runtime validation, not a new TypeScript migration.

Production methods: `flashing_runs@1`, `finished_piece_count@1`. Profile is a material specification, not its own takeoff calculation.

Contract-only examples/tests for later implementation:
- `repeated_members@1`: explicit member projection vs already-true length; pitch in degrees; allowances; available stock lengths or increment/min/max; centres and distribution run; endpoint convention. Endpoints included: ceil(run/centres)+1. Place intermediate members at centres and final member at the actual endpoint; do not draw the final member beyond the run. Zero-length distribution is invalid. Count does not infer jamb/double studs, corners or structural adequacy.
- `sheet_wall@1`: wall length, height, effective cover, physical sheet height, direction and setout; simple blank wall ceil(length/cover), subject to height availability. If height exceeds available sheet height and no reviewed vertical-joint rule exists, return Needs rule, not an invented stacked-sheet arrangement. Openings/setout/offcuts are later production logic.
- `area_to_linear@1`: net defined area / effective cover; explicit waste, rounding and sale unit. Nominal width is not automatically effective cover.

Timber default 600 mm increments, overridden by an explicit sorted stock list where provided. If no stock fits, return unavailable; never clamp to longest stock or auto-splice structural timber. Angle conversion is trueLength = projection/cos(pitch); already-true length does not receive pitch again. Quantity computation is not member sizing.

Fielders/COLORBOND: seed .55 BMT only for flashings, not globally for roofing. Store supplier product/finish/colour code separately from name and illustrative swatch. Manufacturer/product compatibility and regional availability need sourced review before a catalogue is marked verified. Do not invent a universal list or prohibit custom entries. Each product preset can store source URL, document title/edition, page/section, checkedAt, reviewedBy and status. Missing current product verification leaves it a user-entered material, never a falsely verified catalogue.

## 8. Data model and invariants

These are logical contracts. The builder must register new facts and reconcile names with the current dictionary before writing migrations. Avoid redundant canonical job address fields; draft defaults read the appropriate job provider. Immutable export snapshots intentionally copy what the supplier saw.

| Entity | Required contract |
|---|---|
| Job context | Exactly one real FK: jobs, carpentry_jobs or charge_up_jobs. Project entry resolves to jobs; missing linkage returns409. No fake shadow job or global job-spine refactor. |
| Plan metadata | Extend job_documents additively with structured revisionLabel and content hash/page metadata as needed. Existing ID plus immutable bytes anchors a revision even if legacy version=1. Retain source row, original title and legacy uncertainty. |
| Takeoff workspace | Job owner, name, revision, primary document/page, state, timestamps and actor. Mutable child changes increment workspace revision transactionally. |
| Calibrations | Immutable version, document/page/region/basis, both point pairs/known lengths, sx/sy/mode, verification evidence. |
| Measurements | Workspace, stable ID, document/page/calibration, geometry kind and schema, label, raw value/provenance, revision/archive state. Manual lengths have explicit manual source and no fictional calibration. |
| Material presets | Stable library ID plus immutable preset revisions. Method key/version, spec, rules, ordering, source review, active flag. |
| Job materials | Full independent snapshot from preset or custom, job/workspace ID, revision, profile and rule data. |
| Contributions | Stable assignment linking measurement(s) to job material and role; count/finished-length overrides only where defined; optional split structure. Prevent duplicate contribution insertion by idempotency key. |
| Draft order | Job context, supplier link, selected contribution quantities, delivery overrides with provenance, revision, lifecycle. One supplier per order. |
| Export revision | Immutable full snapshot, content hash, calculation/profile schema versions, source revisions, actor/time and PDF asset identity. |
| Placement | Explicit record of an externally placed order against one export revision, supplier reference/date/actor, status and cancellation history. One active placement per logical order initially. |

Use FKs and a CHECK(num_nonnulls(job_id,carpentry_job_id,charge_up_job_id)=1) on NEW job-owned roots. Child job scope derives from its root and is checked server-side; supplied foreign IDs cannot link across jobs. Do not impose an untested constraint on all legacy job_documents rows as a side effect.

Prefer normalised contribution/order allocation rows with real FKs over measurement_ids uuid[] as the only relationship. Immutable snapshots also retain full source details so later archiving does not erase historical evidence.

Concurrency: each workspace mutation compares expectedRevision and updates root + children atomically. Server calculations use the same snapshot/revision as the saved result. Draft order changes have their own CAS. Final export validates source versions and freezes data atomically; avoid computing from sources before a transaction and assuming they stayed unchanged. Use idempotency keys for create/split/export/placement so a retry cannot duplicate pieces or orders.409 preserves local work and offers reload/compare; never automatically overwrites the other user's changes.

Foreign records used in snapshots must be validated/locked or captured under a transactionally consistent revision strategy. Service-role DB access is not authorisation.

## 9. Plan lifecycle changes that are required

Reuse the existing private bucket and plan endpoints, but extend safely:
- Preserve the uploaded document ID as identity. New upload creates new immutable object path; record hash. Structured revision is display metadata, not something inferred from a filename.
- Validate supersedesDocumentId belongs to the same authorised job and plan family; reject self/cycles/cross-job targets. Resolve conflicts if two uploads supersede the same current plan.
- Commit new row + supersession changes atomically after storage upload; on DB failure clean up only the newly uploaded unused object. Never supersede the old document first and leave the new insert failed.
- Return version/revision and status to authorised clients, retaining response compatibility.
- For any document referenced by takeoff/calibration/export, archive or reject destructive deletion BEFORE removing its object. Add appropriate restrictive FKs; test the storage path is never removed first. Referenced historical PDFs remain accessible to authorised reviewers.
- Mark active takeoffs on superseded documents Needs review. Old exported records keep their provenance. Re-measure/recalibrate on the new document explicitly. Viewing old results remains possible.

A structured version counter helps; it is not the only possible anchor. Do not invent historical revision labels for legacy plans or stamp every file in a multi-file set as the same scale.

## 10. Auth and transport

Two small auth adapters feed one takeoff service:
- Hub: requireAuth + admin/supervisor gate plus owner/resource checks using established job scope.
- Worker PWA: existing workerAuth/workerVisibleJobs/workerMaySeeJob and charge-up parent checks, plus active employee and server-evaluated takeoff capability. Provisional preparation capability follows existing leading-hand pattern. Never trust a UI flag or request body role.
- Worker preview is read-only for ALL takeoff mutations. Do not copy the existing task-reorder exception into takeoff.
- Ordinary worker and client tokens cannot write takeoffs. Reading a company's private standards or supplier account details is not automatically allowed merely because a worker can view a plan.
- Grant worker editor only necessary material specification/list data; omit cost/account/private supplier notes. Company standard changes and placed-order recording require staff capability.

Return capabilities explicitly to UI. Keep actor type/id (auth user vs employee) correct; an employee ID must not be stuffed into a FK to auth.users.

Suggested endpoints: staff `/api/takeoff/...` with explicit middleware, worker `/api/worker/takeoff/...` with worker adapter. Do not depend on `/api/carpentry` prefix alone for a shared cross-module feature. Register worker routes where existing worker auth helpers are available or extract a tested helper module without changing its semantics.

Use apiResponse helpers and camelCase. Staff components use apiFetch. Wrap workerFetch in a takeoff adapter returning the same {ok,data,error} shape; do not lose worker token/preview headers. Binary PDF fetching may use a dedicated service wrapper after authorisation, not ad-hoc component fetch logic.

New takeoff tables: RLS enabled, no direct anon/authenticated data access; service role through scoped API. Database RPCs should be invoker where sufficient. If SECURITY DEFINER is necessary: controlled search_path, revoke PUBLIC/anon/authenticated execute in the creation transaction, grant only service_role, and test permissions. A GRANT to service_role alone is not a revoke from PUBLIC. Immutable export tables need update/delete prevention, including service-role mutation through ordinary app paths; a label saying append-only is insufficient.

Validate method keys, schemas, finite numbers, ranges and ownership on server. Initial request caps: 500 measurements per workspace, 1000 points per geometry, 100 profile segments, 200 order lines; return plain actionable limit errors. These caps are configuration, not arbitrary silent truncation.

## 11. Saving and recovery

Autosave after a completed edit (roughly500ms debounce) with Saving / Saved / Not synced status. Committed server data is authoritative. Persist a local recovery snapshot in IndexedDB keyed by authenticated actor + job/workspace + base revision, after completed edits and on visibility change. Do not store tokens/signed URLs in that snapshot.

On restart, authenticate and check permission before presenting recovery. If base revision matches, offer Restore. If it differs, preserve both and offer a copy/compare; never auto-replay an offline queue over fresh server work. Clear actor recovery records on explicit logout and expire old drafts after7days. If local storage is unavailable/full, show Recovery unavailable and maintain in-memory edits.

This is recovery, not full offline sync. Plan files are not automatically cached persistently. Network loss disables server-only export/placement and retains visible edits. A service-worker update must not force-reload a dirty editor without recovery. No beforeunload-only solution on mobile.

## 12. Orders and PDF

Order-ready PDF must stand alone: company, job/reference, supplier, delivery/pickup and required date if provided, contact, profile ID, diagram, all dimension/angle/end details, coated-face legend, material/finish/BMT/colour, each finished-length×qty row, total LM, notes and handling flags. Dimensions in mm. Use company assets and a bundled licensed Unicode font, or test faithful equivalent symbols. No unrelated subcontract terms and no invented contractual return policy.

Draft preview can be exported with DRAFT watermark. Order-ready export requires valid profile, lengths, material identifiers, supplier and delivery/pickup details; measurements from superseded/unverified plans block readiness until reviewed. No price required. An export creates a frozen reviewable version but does not send/place an order. Use a distinct FO/reference sequence or the existing PO sequence only after checking shared namespace/transaction behaviour. Do not create a legacy purchase_orders record purely to get a number.

Render from the frozen snapshot. Include file checksum and renderer version in metadata. PDF generation/upload happens outside the DB transaction; use pending/ready/failed artifact state, idempotent retry and no downloadable 'ready' record before bytes are stored. Register the final asset through existing job_documents conventions with access limited to appropriate staff/crew, and no public bucket. Store generated orders in a suitable private object prefix; do not make them indistinguishable from source plans.

For placed orders, select the exact exported revision and record 'Placed externally' with date/reference. No email claim. v1 blocks editing/replacing a placed order: create an additional order for additional quantities, or record a cancellation explicitly then create a replacement. Retain all historical snapshots. Future amendment support must count the current effective revision per order, never sum every revision.

Required/ordered/remaining is per material specification and finished-length bucket. Allocate partial orders to stable contributions; account transactionally for competing drafts/placements. Example: require10×4600; place6 -> remaining4; exporting another PDF changes nothing. Cancelling placement reverses its effective commitment with history. Two orders cannot silently over-allocate the same requirement. Changed measurements/materials flag reconciliation; don't reinterpret previously ordered lengths under new rules. Show surplus separately if requirements fall below committed quantity.

## 13. Build locations and conventions

Proposed new locations (adjust only for real repo conventions; record changes):
- `shared/takeoff/`: units, geometry, calibration, profile, method registry, schemas and calculation functions.
- `src/components/takeoff/`: reusable viewer, calibration sheet, profile editor, rules, split and schedule.
- `src/pages/takeoff/`: staff entry wrapper; worker wrapper under existing worker routing.
- `src/lib/takeoffApi.js`: staff/worker adapters and recovery service as separate file.
- `server/lib/takeoff/`: access resolver, validation, repository/service, routes, snapshot and PDF modules.
- `src/ui-review/fixtures/takeoff.js`: realistic fixtures; relevant route entries.
- `scripts/tests/takeoff-*.test.mjs` and handler/security test locations matching current patterns.
- additive migration(s), dictionary registration, ADR, SOPs and release evidence.

Keep parent route/components thin. Reuse job details and suppliers, not the entire existing single-line PO workflow. No whole-project state library, renderer framework or TypeScript conversion is justified by this module.
