# ScopeIntelligence Adapter — Boundary Spec

> **Status:** v0.1 (2026-06). Adapter shell built; engine internals are the current Hub pipeline.
> **Purpose:** Define the stable seam between Blue Leaf Hub and the scope-extraction engine so the engine can be a swap-in (in-process today → external service later) with **zero changes to Hub callers**.
> **Companion:** the design brief for the future engine is `SCOPE_INTELLIGENCE_ENGINE_AGENT_PROMPT.md`. This doc is the *contract* that brief designs to.
> **Code:** `server/lib/scopeIntelligence/index.mjs` (`HubScopeIntelligence`, `getScopeIntelligence`), `server/lib/scopeIntelligence/expectedScopeFloor.mjs`.

---

## 1. Why an adapter

The Hub's scope extractor today is a single Claude prompt (`extractionMasterPrompt` in `server/dev-api.mjs`) plus a deterministic merge/clean pipeline (`rfqScopePipeline.mjs` + `rfqTradeIntelligence.mjs`). Sam intends to grow this into a **standalone, self-improving estimating/takeoff engine** that multiple builders feed. To make that future swap free, all scope extraction now goes through one interface, `ScopeIntelligence`. The Hub is its first client.

**The rule:** Hub code never calls the prompt/pipeline directly for scope; it calls `getScopeIntelligence().extractScope(...)` and reports ground truth via `.submitOutcome(...)`. Swapping the implementation (Hub → external HTTP client) is a one-line change in the factory.

---

## 2. The interface

```ts
interface ScopeIntelligence {
  extractScope(request: ExtractScopeRequest): Promise<ExtractScopeResult>;
  submitOutcome(outcome: OutcomeSignal): Promise<OutcomeReceipt>;
}
```

> **v0.1 implements `extractScope` + `submitOutcome`.** The full design target (see
> `SCOPE_INTELLIGENCE_ENGINE_AGENT_PROMPT.md` §13) extends this interface to the autonomous-estimating
> method set — `extractBuildingFacts`, `extractQuantityCandidates`, `generateTradePackages`,
> `mapToRecipes`, `submitCorrection`, `getAccuracyMetrics`, `getLearningSummary` — each carrying the
> same provenance envelope (`source`, `confidence`, `provenance`, `status`, `reviewRequired`,
> `consumingModuleHints`). The engine is the intelligence layer of a future estimating/QS platform;
> the RFQ Engine is its first plugin consumer, not its owner.

### 2.1 `extractScope` — request

```jsonc
{
  "tenantId": "blue-leaf",          // who owns this run (multi-tenant governance, §5)
  "jobRef": "<job uuid>",           // opaque to the engine; Hub's jobs.id
  "projectType": "new_build",       // new_build | renovation | extension | knockdown_rebuild | ...
  "buildingFacts": {                // OPTIONAL hints if already known (storeys, BAL, slope...)
    "storeys": 2, "balRating": "BAL-12.5", "siteSlope": "moderate"
  },
  "documents": [                    // tender docs; engine reads these
    { "documentId": "<job_documents.id>", "kind": "architectural" },
    { "documentId": "<job_documents.id>", "kind": "structural" }
  ],
  "options": { "locale": "AU-SA", "minConfidenceToAutoApply": 0.9 },

  // Transitional escape hatch (current Hub only): if the caller has ALREADY run the AI
  // (the streaming /api/rfq/extract route owns the Anthropic call), it may pass the raw
  // extraction JSON here to get the canonical shape without re-calling the model.
  "rawExtraction": { "trade_notes": { }, "project_context": { }, "coverage_gaps": [] }
}
```

**Constraint baked in:** no cost/estimate input. The AI/document path stands alone (RFQ runs before any Buildxact estimate exists).

### 2.2 `extractScope` — result

```jsonc
{
  "runId": "uuid",                  // identifies this extraction for later submitOutcome()
  "tenantId": "blue-leaf",
  "jobRef": "<job uuid>",
  "projectType": "new_build",
  "trades": [
    {
      "tradeKey": "concrete_footings",   // CANONICAL 36-key vocabulary (§4)
      "label": "Concrete & Footings",
      "scopeLines": [
        { "text": "Supply and place N32 concrete to footings per S-series.",
          "confidence": 0.7,
          "sourceDocumentId": null,       // will point to job_documents.id when the engine tracks page provenance
          "status": "extracted_flagged" } // Knowledge-Core status: flagged = needs human confirm
      ],
      "exclusions": [],
      "questions": [],
      "source": "extracted+floor",        // extracted | floor | extracted+floor
      "confidence": 0.7,
      "floorStatus": "satisfied"          // satisfied | expected_missing | n/a
    },
    {
      "tradeKey": "termite_protection",
      "label": "Termite Protection",
      "scopeLines": [],
      "exclusions": [],
      "questions": ["Expected for project type \"extension\" but not found in the tender documents — confirm whether this trade is in scope."],
      "source": "floor",
      "confidence": null,
      "floorStatus": "expected_missing"   // floor safety net fired — never silently absent
    }
  ],
  "projectContext": { },
  "coverageGaps": [ ],
  "floorReport": { "expected": ["..."], "satisfied": ["..."], "missing": ["..."] },
  "accuracyPriors": null               // per-trade precision/recall once the engine learns
}
```

### 2.3 `submitOutcome` — feed ground truth back (the accuracy cascade)

One method, four signal types, arriving at four different times:

```jsonc
{ "tenantId": "blue-leaf", "runId": "uuid", "signal": "human_review",
  "corrections": [
    { "tradeKey": "tiling", "action": "added" },
    { "tradeKey": "pool_works", "action": "removed", "reason": "hallucinated" },
    { "tradeKey": "joinery", "action": "scope_line_fixed", "from": "...", "to": "..." }
  ] }

{ "signal": "final_rfq_set",      "finalTradeKeys":   ["concrete_footings","carpentry", "..."] }
{ "signal": "buildxact_estimate", "estimateTradeKeys":["concrete_footings","carpentry", "..."] }
{ "signal": "po_invoice",         "actualTradeKeys":  ["concrete_footings","carpentry", "..."] }
```

Returns:

```jsonc
{ "accepted": true, "learned": { "priorsUpdated": false, "lexiconUpdated": false, "metricsUpdated": false } }
```

> **Current behaviour:** the Hub implementation **records the call and returns a receipt** — it does not yet mutate any model (no learning tables exist yet; they are Output G of the design brief). This lets call sites be wired now so learning begins the day the real engine is swapped in. `submitOutcome` is safe to call repeatedly.

---

## 3. Floor (completeness guarantee)

`expectedScopeFloor.mjs` enforces the minimum trade set per project type (Sam-seeded):

| Project type | Floor trades |
|---|---|
| `new_build`, `renovation`, `knockdown_rebuild` | excavation, concrete_footings, roof_plumber, electrical_data, plumbing, internal_linings, painting |
| `extension` / `addition` | the above **+ termite_protection, windows_skylights** |

Any floor trade the extractor doesn't find is returned with `floorStatus: "expected_missing"` and a confirm/deny question — **never dropped**. Unknown project types enforce no floor (fail open). The future engine is expected to *propose* learned additions to this floor from the accuracy cascade; this module is the deterministic seed.

---

## 4. Shared vocabulary

All `tradeKey` values are the canonical 36 trades defined in `server/lib/tradeMasterLibrary.mjs` (`RFQ_TRADE_ORDER`) and mirrored in `src/lib/rfqExtraction.js`. Any external engine maps its internal taxonomy to/from these keys at the boundary. This taxonomy is the contract between extractor, merge layer, Buildxact category mapping, and the external engine.

---

## 5. Multi-tenant data governance (forward-looking)

When the engine serves multiple builders:
- **Poolable (improves the shared model):** trade taxonomy, drawing symbol/abbreviation lexicon, extraction patterns, de-identified scope-line phrasings, per-trade precision/recall structure.
- **Tenant-private (never pooled):** pricing/rates, client identities, addresses, project specifics, the documents themselves.
- `tenantId` scopes every run and outcome. Pooled contributions must be de-identified at write time and a tenant must be able to opt out of contributing.

This split is a design requirement for the engine's data model (Output G/H of the brief), surfaced here so the contract carries `tenantId` from day one.

---

## 6. Integration points in the Hub

| Concern | Where | Adapter touch |
|---|---|---|
| AI extraction (streaming) | `extractionMasterPrompt` + `POST /api/rfq/extract` in `dev-api.mjs` | Route keeps the streaming Anthropic call; after it has the final JSON it can call `getScopeIntelligence({ runAiExtraction }).extractScope(...)` **or** pass `rawExtraction` to normalise to canonical shape. |
| Deterministic merge/clean | `rfqScopePipeline.mjs`, `rfqTradeIntelligence.mjs` | Wrapped by `HubScopeIntelligence` — not called directly for scope going forward. |
| Floor | `scopeIntelligence/expectedScopeFloor.mjs` | New capability (did not exist). |
| Persistence | `rfq_packages` / `rfq_trade_scopes` | Unchanged; map `trades[]` → `rfq_trade_scopes` rows. |
| Provenance / events | `factsService.mjs` (`setFact`, `emitEvent`) | Scope-derived building facts and confirmations flow through the Knowledge Core; scope lines are `extracted_flagged` (consequential) by default. |
| Ground-truth feedback | new call sites | Call `submitOutcome` on: review save (`human_review`), RFQ send (`final_rfq_set`), estimate sync (`buildxact_estimate`), PO/invoice approval (`po_invoice`). |

---

## 7. Swapping in the external engine

1. Implement `ExternalScopeIntelligence` (HTTP client to the standalone service) satisfying the same interface.
2. In `getScopeIntelligence()`, branch on an env var (e.g. `SCOPE_INTELLIGENCE_URL`): present → return the external client; absent → return `HubScopeIntelligence`.
3. No Hub caller changes. Shadow-run both, compare `trades[]`/`floorReport`, then cut over (rollout plan = Output O of the brief).

---

## 8. Known limitations of v0.1 (honest list)

- **Confidence is a placeholder** (`0.7` for extracted trades, `null` for floor-missing). The current pipeline has no real per-line confidence; the redesigned engine assigns it.
- **No page/symbol provenance** — `sourceDocumentId` is `null` until the engine tracks which sheet/legend a line came from.
- **`submitOutcome` does not learn yet** — it records and returns a receipt (no learning tables exist).
- **`rfqTradeExtractionRules.mjs` is still legacy-keyed** — scope-line→trade attribution for the canonical 36 is weak; redesigning this keying is part of the engine work, not this adapter.
- The adapter does not yet own the streaming Anthropic call (the route does); `runAiExtraction` injection / `rawExtraction` is the transitional bridge.
