# Audit reconciliation and source anchors

The audit is useful and materially changes the implementation plan. It is not safe to paste its recommendations directly into a build agent without these corrections.

## Confirmed against supplied code

- PlansSheet.jsx opens an external signed URL; there is no measurement-ready PDF surface there. `package.json` has server pdf-parse/pdfkit but no pdfjs-dist. New renderer work is real.
- `workforceRoutes.mjs`, plan block around2858–3024: private bucket, three job spines, version omitted from response, revision appended to title, supersession updates before inserting new row, deletion removes storage first. These are concrete integration anchors and lifecycle defects to handle in touched functionality.
- Worker auth is local to workforceRoutes around2371. It accepts worker token, or staff auth, and enforces read-only preview except a task-reorder exception. `is_leading_hand` already controls worker task editing and some cost capture. Reuse the capability pattern without copying the exception.
- vite.config.js has a4MiB precache cap and no runtime plan caching. public/manifest.json requests portrait. Actual installed-device orientation behaviour still requires testing.
- poPdfKit lazily imports pdfkit, has branded assets and a Lato env-path fallback to Helvetica. Reuse layout infrastructure but validate multi-profile pagination and actual glyph output.
- Off-branch issue SQL has row locking and expected-version guard. It contains no update/delete prevention trigger for its revision table and grants EXECUTE to service_role without an explicit PUBLIC revoke in this file. Surrounding live defaults/permissions were not queried.

## Corrections to recommendations

1. **Hub-only is not an agreed scope.** The user asked for the phone PWA and supplied its screens. Build common UI/service with two scoped adapters. Permission defaults remain explicit.
2. **Two-point single-axis calibration is insufficient for this brief.** Store horizontal+vertical references, verification and optional region. Never silently apply nonuniform scaling.
3. **Document identity already exists.** Immutable job_documents ID+bytes can anchor measurements even where version is always1. Structured revision is an improvement; the claim that no truthful provenance is possible without a counter is overstated.
4. **Do not reuse plan lifecycle unchanged.** Check cross-job supersession, atomic DB status transitions and deletion-before-storage removal. The current order can destroy evidence even if a new FK later rejects row deletion.
5. **Required / ordered / remaining is not free.** Summing all issued revisions double-counts amendments. Model effective placement and stable allocations. Draft exports are not orders. Length buckets are not interchangeable LM.
6. **Copy patterns, not unverified SQL.** A table called append-only is mutable until enforced. SECURITY DEFINER grants must explicitly close default access. The snapshot must correspond to transactionally consistent source revisions.
7. **Use one shared calculation implementation.** The audit proposes mirrored client/server files; that creates unnecessary drift. A browser-safe shared ESM module is preferable in this Vite+Node repo.
8. **Gestures are not credibly bounded to120lines.** Commit to tested behaviour, not a line-count estimate. Rendering and touch accuracy are separate risks. High zoom cannot mean unbounded full-page bitmap allocation.
9. **Do not fail all work for unavailable iPhone tests.** Proceed through local implementation, record hardware tests as pending and keep rollout gated. This is one build process with internal gates.
10. **Do not promise full offline, but do protect edits.** Local recovery is included. Downloaded offline plans, background sync and conflict-free collaborative editing are deferred.
11. **6m and9m differ.** Keep whole above handling threshold. Hard ceiling applies to finished pieces. Splits require real lap input, coverage validation and replacement of the original contribution.
12. **No global supplier/product assumptions.** .55BMT is the flashing default. Fielders catalogue specifications vary by product/region. Actual supplier details must come from existing records or user entry.
13. **Stock600mm is settled.** The older Bestimator300mm code is a reusable pattern, not an unresolved owner preference.
14. **Do not copy structural tables into this build.** Audit reports a suspect T48 value9005 and missing rafter/batten tables. Those cells were excluded from the archive, so this review cannot confirm a replacement value. Flag upstream for independent source checking; do not change9005 to900 by inference. Release-one takeoff does not perform structural sizing.
15. **Avoid duplicate procurement engines.** A small flashing schedule/export/placement ledger is sufficient now. Future adapters link to existing procurement where actual job FK compatibility exists. No fake jobs or silent cross-spine links.
16. **No claim of verified deployed schema.** Probe tables/columns/functions/privileges, not migration numbers alone. The supplier.address issue is a repository/schema discrepancy until live columns are checked. Fix misleading error handling in a touched path, not via guessed production SQL.

## Useful source map (paths relative to audit source/)

| Concern | Anchor |
|---|---|
| Plans storage/routes/scope | server/lib/workforceRoutes.mjs, plan block; migrations069,152,172 |
| Worker auth and capability | workforceRoutes.mjs workerAuth, workerVisibleJobs, workerMaySeeJob; src/pages/worker/WorkerTasks.jsx |
| Staff auth | server/lib/requireAuth.mjs; server/dev-api.mjs prefix middleware |
| Existing plan entry | src/components/JobPlansCard.jsx; src/components/worker/PlansSheet.jsx |
| Shell edge gesture | src/components/AppShell.jsx |
| Worker scope/manifest | src/components/worker/WorkerLayout.jsx; public/manifest.json; vite.config.js |
| API convention | server/lib/apiResponse.mjs; src/lib/apiFetch.js; src/lib/workerFetch.js |
| Procurement schema/route | migrations085/092; server/lib/procurementRoutes.mjs |
| PDF base | server/lib/poPdfKit.mjs; server/lib/whs/packPdfKit.mjs |
| Revision pattern only | _external/whs-branch/204_carpentry_whs_pack_revisions.sql |
| Test harness | src/ui-review; e2e/ui-review; scripts/test/internalJobE2E.test.mjs |
| Canonical facts/SOP | AGENTS.md; CLAUDE.md; docs/agent_knowledge/MASTER_DATA_DICTIONARY.md; docs/sops |

## External implementation references checked in this review

- PDF.js examples: https://mozilla.github.io/pdf.js/examples/index.html — viewport scale/rotation/origin transforms and separate HiDPI output scale.
- PostgreSQL CREATE FUNCTION: https://www.postgresql.org/docs/current/sql-createfunction.html — security-definer precautions and selective EXECUTE permission.
- PostgreSQL privileges: https://www.postgresql.org/docs/current/ddl-priv.html — functions have PUBLIC EXECUTE by default unless changed/revoked.

These explain the transform and RPC requirements; they are not evidence that this repository has implemented them. Product/manufacturer research from earlier planning remains background; verify exact catalogue seeds before marking them reviewed.
