# Defaults and remaining decisions

The agent should implement with these defaults without stopping for minor choices.

| Decision | Default for this build |
|---|---|
| Units | mm dimensions; m² and LM summaries |
| Timber size | Manual selection with explicit provenance |
| Timber stock | 1200 mm minimum, upward 600 mm increments for all suppliers; product maximum/availability restricts the grid |
| Timber end allowance | 0 until set in job/company preset |
| Repeated-member endpoints | Both centreline ends included; offsets visible |
| Cladding takeoff | Wall run + entered height; elevation tracing available |
| Sheet reuse | Off by default; conservative occupied-cell consumption |
| Board reuse | Conservative until an explicit compatible cut allocation is selected |
| Waste | 0 until company/user chooses; add-spare shortcut; never claim 0 means no real waste |
| Installation conditions | Unknown initially; no inferred wind class from Adelaide address |
| Structural check | Separate from quantity/procurement; optional |
| Pack rounding | Only if supplier requires full packs |
| AAC | Walsc prioritised; separate brand/system, conservative panels, reviewed manual supports until exact guide row active |
| Scope accessories | Visible Include/By others/Exclude status, not silent omission |
| Company preset change | New version; explicit job update with impact preview |
| Flashing labels | Keep Add flashing within flashing; add timber/cladding in shared entry |
| Known product values | Seed from09/catalogue, with supplier availability independently confirmed |

## Owner confirmations received 14 October 2026

1. AAC: Walsc. Foam cladding: Rendex. These are separate material families and assemblies; don't apply AAC rules to foam. Exact Walsc system/thickness remains a product selection, not inferred from brand alone.
2. Timber cladding: initial effective-cover choices 70/90/120/140 mm, editable per supplier/product. No further overlap deduction when effective cover is entered.
3. Timber: all suppliers use 1200 mm minimum then 600 mm increments. Maximum and unavailable sizes are product settings. The stock rule does not apply to aluminium or manufactured cladding boards.

See12 for Rendex scope and revised acceptance checks. These three owner questions are resolved; do not ask them again.

## Required source/data follow-through

- Acquire readable current AAC design/install guides before activating their automatic support/fixing rows.
- Verify all selected Hardie/timber fastening rows including notes against full manuals; current pack contains scoped findings and selector contract, not exhaustive tables.
- Reconcile Fine Texture's published cover against the intended exact SKU if supplier paperwork differs; never silently replace it with smooth-profile cover.
- Axon September2026 guide lists additional variants beyond the current public product table; preserve provenance and confirm availability separately.
- Existing span data cannot be assumed available, current or validated. It is optional and must not hold up quantity tools.

## Release boundaries

Implemented and useful is achievable with manual structural sizes and reviewed project-specific installation parameters. Fully automatic installation advice across every manufacturer/wind/substrate combination is a separate catalogue verification effort.

Do not advertise unsupported combinations as automatic. The app must say what it calculated, what was entered and which source rule it applied.

