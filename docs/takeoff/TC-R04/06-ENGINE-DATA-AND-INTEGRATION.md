# Implementation contract

## Existing code findings

The supplied R03 source already has code-owned method contracts in shared/takeoff/methods.js: repeated_members@1, sheet_wall@1 and area_to_linear@1. They are contract-only, not production workflows.

shared/takeoff/schedule.js still normalises flashing rules for every contribution and emits length-only pieces. materialProblems requires flashing-style BMT/colour. Merely enabling the future methods would be incorrect.

sheet_wall@1 only checks excess height and, when a joint flag exists, still returns a single width-based count. It is not a multi-course sheet-layout engine. Replace with new versioned methods; don't silently redefine historical versions.

Existing entry points to adapt: TakeoffApp, MaterialPicker/MaterialSheet, MeasureScreen, ScheduleScreen, OrdersScreen, PdfViewport/usePlanDocument, useTakeoffWorkspace, server takeoffService and PDF renderer, plus both worker/admin auth adapters. Paths refer to supplied R03 and must be reconciled with current R04 changes.

## Architecture

Shared pure code:
measurement geometry → method calculation → installed demand → assembly components → stock allocation → purchase lines → order snapshot.

Same calculation module on server/client; server recalculates from authoritative inputs. Do not trust posted totals. No eval, arbitrary SQL formulas or LLM in the calculation path.

Proposed new methods:
- repeated_members@2
- wall_frame@1
- linear_stock@1
- sheet_layout@2
- course_layout@1
- panel_grid@1
- aac_panel_layout@1
- area_to_linear@2
- support_grid@1
- accessory_routes@1

Registry declares input roles, units/bounds, allowed product families, output demand types and validation predicates. Multiple measurements can feed one method; one wall can feed many assembly components.

## Logical model (map to current tables, avoid duplicate workspace engines)

ProductDefinition:
id, tenantId or curated namespace, family, manufacturer, name, SKU, variant, spec, physicalDimensions, effectiveCover, finish/endConditions, permittedOrientations, version, fieldSources, reviewState.

OrderingPolicy:
supplierRef, supplierSku, unit ea/lm/m2/box/bag/roll/pack, stockLengths/sheetSizes, increment, min/max, minimumOrder, packSize, fullPackRequired, kerf/endTrim, breakage/sparePolicy, joint/reusePolicy, availabilityState/date. Published pack size does not imply fullPackRequired=true.

InstallationAssembly:
id/version, productVariantIds, orientation, substrate, applicableConditions, layers, requiredDetails, joint/opening rules, accessoryRecipes, ruleRowRefs. Quantity validation is separate from structural/environmental suitability.

RuleRow:
id/version, guideRef/edition/page/table/row/notes, conditions, values with units, reviewer/reviewedAt, verificationState, blockedReason, supersededBy. All selected values/notes form one tuple.

JobTakeoffItem:
id, jobId, productSnapshot, assemblySnapshot, orderingSnapshot, methodKey/version, namedInputRefs, jobOverrides + reason/provenance, status. Company updates never mutate it silently.

Measurement:
id, jobId, documentVersionId/page/region/calibrationId, kind, normalised PDF points, scalar inputs, sourceMode measured/entered/imported, revision. Roles include distribution, member, wallBoundary, opening, surface, trimPath, manualCount.

WallSurface:
id, linkedPlanRunId/elevationMeasurementId, local polygon, openingIds, heightSource, datum, claddingZones, corners/sharedBoundaryIds, floorLevel, revision. Never add plan and elevation representations as duplicate surfaces.

Demand:
id stable by source+role+layout cell, itemId, componentRole, materialIdentity, shape/length/dimensions, quantity/unit, sourceRefs, dependencyHash, provenance calculated/manual, validation.

StockAllocation:
id, demandIds and quantities, stockProductRef, stockDimensions, placements/cuts, kerf/endTrim, offcut remainder, joint/endCondition record, policyVersion, dependencyHash. Preserve explicit links when pooling purchases.

PurchaseLine:
canonical procurement identity + stock SKU/dimensions + unit, quantity, allocations, spareQuantity, packRoundingQuantity, supplier, readiness. A pooled board can serve several demands; allocations must conserve coverage, not pretend every stock unit belongs to exactly one raw measurement.

FrozenOrder:
schemaVersion, calculationVersion, actor/job, selected product/assembly/rule versions, source digest, immutable lines/allocations, supplier/job/delivery details, PDF hash. Keep export, externally placed, received/cancelled states separate according to existing workflow.

## Three independent statuses

Quantity: incomplete / estimate / calculated / reviewed.
Installation: unspecified / source-pending / supported-by-selected-rule / project-detail-supplied / out-of-scope.
Procurement: draft / missing-product / unavailable-stock / stale / ready.

A manually sized timber order may be procurement-ready with manual design provenance; never label it engineered. A manufacturer table cannot resolve an unknown site condition. An order for explicitly selected cladding-only scope can be ready while batten design is by others; the whole assembly remains incomplete.

Custom ordering assumptions can be acknowledged; a hard dimensional impossibility cannot. For a departure from a manufacturer limit require a separately identified project design/detail, not a generic “ignore warning” checkbox.

## Identity and invalidation

Procurement identity includes manufacturer/SKU/species/grade/treatment/section/profile/finish/thickness, stock dimensions/unit and necessary factory-end/special order conditions. Orientation belongs in identity where it changes what is purchased. Usage notes remain allocations when physically interchangeable stock can legitimately pool.

Calculation hash includes geometry, calibrations, openings, datum, source revisions, method/version, product/assembly/rule/order snapshots and manual adjustments. Any dependency change invalidates affected allocations/draft order lines, even if totals remain numerically equal. Preserve frozen orders and already placed quantities; offer a visible difference order/reconciliation, never rewrite history.

Edits to catalogue make a new version. User chooses update on active job, sees diff and quantity impact. Source document changes flag candidate presets for review; don't mutate old jobs or block historical PDF access.

## API and persistence

Extend existing workspace load/save with schemaVersion and discriminated unions. Keep optimistic concurrency/revision checks and tenant/job authorisation at every referenced entity. Validate dimensions, polygon topology, array sizes, role compatibility, stock lists and rule IDs server-side. Reject unknown method/version, cross-job source references and impossible units.

Suggested existing-service extensions (names adapt to current routing):
- list/create/revise product and assembly presets;
- create/update wall/opening and item;
- preview/recalculate (same pure functions);
- propose stock allocation and accept explicit overrides;
- mark reviewed with source revision;
- create frozen export from current validated selection.

No remote arbitrary source URL fetch in ordinary calculation. Store metadata and approved document attachments through existing storage mechanisms. Rule review requires complete document/version, not search snippets.

Migrations additive; preserve existing flashing payloads and old exports with version-specific readers. Introduce generic demand/purchase shapes without deleting flashing fields until compatibility is proven. Both authentication routes use the same service.

## Precision and limits

Use exact integer mm for entered dimensions and a documented internal geometric precision (e.g. 0.001 mm) for transformations. Avoid UI display rounding affecting stock thresholds. Tolerance only compensates numerical noise, not real 0.1 mm overlength. Area uses transformed geometry; asymmetric X/Y scale affects both axes.

Proposed limits: preserve current 500 authored measurements initially; derived cells/members do not consume that count. 5,000 generated elements per wall and 50,000 per job are proposed safeguards, not measured performance claims. Reject excess with split-wall guidance; never silently truncate. Benchmark on a real phone before final limits.

Test PDF rendering, layout/calculation and state recovery independently. Catalogue/rule inputs are data, not executable expressions.

## Source-row review procedure

Candidate → checked transcription → independently compared against full table/notes → active under explicit conditions.
Persist field-level evidence. Derived application formulas have separate method tests. Product dimensions can be active for quantity while fastening rows remain pending. Do not use a single “verified product” boolean to approve unrelated installation rules.

Record publicly sourced catalogue facts without bundling entire third-party manuals. Keep source links and controlled document references. Span-table datasets remain a separate reviewed/licensed provider; this pack supplies no protected table cells.

