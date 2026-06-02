# Scope Intelligence Engine — Agent Planning & Build Brief

> **This is Phase 1 of an Autonomous Estimating & Quantity-Surveying Platform — not "a better RFQ prompt."** Read §1–§3 before anything else; they reframe the entire mission.
> **What you produce:** a complete design (Outputs A–R, §16). **Planning/design only — no production code unless a follow-up explicitly says so.** Diagrams, schemas, interface contracts, pseudocode, DDL, and clear recommendations are in scope.
> **Audience:** Sam Morris (founder, Blue Leaf Building) + the engineering agent who builds it later.
> **Grounding:** the "current Hub reality" sections are ground truth from the live Blue Leaf Hub codebase (2026-06). Treat them as constraints.

---

## 0. Working discipline & build governance (READ FIRST — applies to every session you work on this)

### 0.0 Where the build lives (and who builds it)
- **Build/working directory:** `/Users/samuelmorris/Desktop/Bestimator/scope agent ai` — this is the **standalone engine repo (project codename "Bestimator")**. All engine code, the data model, the adapters, and the build-governance artefacts (§0.1–§0.4) live here. It is currently empty — you are starting it from scratch.
- **This is a SEPARATE repository from Blue Leaf Hub.** The Hub lives at `/Users/samuelmorris/Desktop/blue-leaf-hub` and is referenced **only for integration context** (file paths, the canonical 36-trade taxonomy, the Knowledge Core, the v0.1 adapter shell in `server/lib/scopeIntelligence/`). Do **not** build the engine inside the Hub repo — the whole point (§11) is a portable subsystem that plugs into the Hub (and later other softwares) via adapters. The Hub consumes Bestimator; it does not contain it.
- **Cursor assists the build.** The hands-on engineering happens in **Cursor**, working within the Bestimator directory above. Keep the repo Cursor-friendly: clear folder structure, small focused files, descriptive module headers, and the governance docs (§0.1–0.4) at the repo root so Cursor (and any agent) reads them first.

### 0.1–0.4 Continuous record-keeping

You are not producing a one-shot document. You are stewarding a long, multi-phase build. From the first task onward you must **continuously maintain a written record** (inside the Bestimator repo) so any future agent (or Sam, or Cursor) can pick up cold:

1. **MASTER_PLAN** — a living, ordered plan of every phase, sub-task, and decision. Every new task you identify gets *added to the master plan* the moment you think of it (status: planned / in-progress / done / blocked). Never hold work only in your head.
2. **BUILD_LOG** — an append-only, dated log summarising in detail what was built/changed each session: files touched, why, decisions made, what was verified, what's left. Update it at the end of every working session and after every meaningful change.
3. **CLAUDE.md (engine-local)** — the engine's own operating manual: architecture overview, the interface contract, the data model, naming conventions, the deterministic-vs-AI split, how to run/verify, and the canonical taxonomies. Keep it current as the source of truth a fresh agent reads first. (Mirror the spirit of the Hub's root `CLAUDE.md`.)
4. **Neat, navigable code & files** — organised folder structure, consistent naming, small focused modules, clear module headers explaining purpose, no dumping grounds. Optimise for a stranger navigating the repo. Document the layout in the engine CLAUDE.md.

**Rule:** a phase is not "done" until the MASTER_PLAN, BUILD_LOG, and CLAUDE.md reflect it. Treat documentation as part of the build, not an afterthought. (This mirrors Blue Leaf Hub's existing "SOP Law" and master-plan discipline — see the Hub root `CLAUDE.md` and `docs/agent_knowledge/`.)

Your **Output Q** (§16) is the concrete spec for these three artefacts and the file/folder conventions.

---

## 1. TL;DR of the mission

Blue Leaf Building (high-end residential builder, Adelaide SA) runs an internal platform, **Blue Leaf Hub**. One module — the **RFQ Engine** — reads tender documents (architectural + structural + engineering PDFs) very early in a tender and extracts a **scope of works broken down by trade**, so the builder can send the right RFQ packages to the right subcontractors.

You are designing the subsystem that powers this — but the subsystem is **far bigger than RFQ**. It is a **reusable construction-document intelligence engine** that happens to power RFQ extraction *first*, and is designed from day one to grow into a full autonomous estimating and quantity-surveying platform that can plug into many host softwares.

The engine must:
1. extract a complete, trade-segmented scope from tender documents (AI/document-only — no cost data needed),
2. think in **building elements → trades → scope** (not just trade → scope), so quantity surveying can hang off it later,
3. guarantee a **minimum expected scope** per project type (never silently drop always-present trades),
4. **learn** from every correction and from downstream ground truth across *every* system it plugs into,
5. **measure its own accuracy** over time, and
6. be a **standalone, pluggable intelligence subsystem** — the engine owns intelligence; host softwares own workflow.

---

## 2. STRATEGIC CONTEXT (this changes how you must architect everything)

**The Scope Intelligence Engine is not being built solely to improve RFQ generation. It is the foundational intelligence layer of a future Autonomous Estimating and Quantity-Surveying Platform.**

Long-term vision (the intelligence pipeline):

```
Tender Documents
  ↓ Scope Intelligence      — what work is in this building?
  ↓ Building Intelligence    — what is the building? (storeys, areas, counts, systems)
  ↓ Element Intelligence     — what building elements exist? (the QS spine — §6)
  ↓ Trade Intelligence       — which trades touch each element?
  ↓ Quantity Intelligence    — measured quantities with confidence
  ↓ Recipe Intelligence      — quantities → estimating recipes / line items
  ↓ Cost Intelligence        — validate against historical actuals; risk-rate
  ↓ Estimate Generation      — full draft cost plan + procurement schedule + programme
```

The RFQ Engine is simply the **first consumer** of this intelligence. Future consumers include: estimating, quantity surveying, recipe autofill, scheduling, procurement, WHS, financial forecasting, subcontractor package generation, variation analysis, project benchmarking, historical cost intelligence.

**Therefore: every design decision must be made with future estimating and QS requirements in mind. Do not optimise only for RFQ generation.** Design the engine as if it will eventually become the core intelligence layer of a standalone estimating platform capable of operating independently of Blue Leaf Hub.

> **The single sentence to internalise:** *Design every data structure as if it will eventually support a full autonomous estimating and quantity-surveying platform. The RFQ Engine is merely the first application of the intelligence being extracted.*

---

## 3. AUTONOMOUS ESTIMATING ROADMAP (design Phase 1 so none of these later phases need a data-model redesign)

| Phase | Name | Goal | Output |
|---|---|---|---|
| **1** | **Scope Intelligence** *(this build)* | Understand what the building contains | Trades, scope lines, building facts, project characteristics, element candidates |
| 2 | Building Intelligence | Understand the building itself | Storeys, floor/wall/roof/window areas, door & room counts, bathrooms/bedrooms, retaining walls, decks, pools, structural systems |
| 3 | Quantity Intelligence | Extract measured quantities from plans | Wall area, roof area, concrete volume, cladding area, insulation area, floor finishes, joinery counts — each with confidence + source reference |
| 4 | Recipe Intelligence | Map quantities to estimating recipes | Buildxact/WunderBuild-style line items (e.g. 90×45 wall framing, Colorbond roofing, Hebel systems, weatherboard cladding, internal linings) |
| 5 | Cost Intelligence | Validate estimates with historical project data | Budget recommendations, risk ratings, expected overruns, historical comparisons |
| 6 | Estimate Generation | Generate complete draft estimates | Cost plan, trade breakdown, procurement schedule, RFQ packages, preliminary programme |

The Phase-1 data model (Output A/J) must accommodate all of the above as **additive layers**, not rewrites.

---

## 4. Who Blue Leaf is, and the long game

- **Business:** architecturally-designed custom new homes, high-end renovations, extensions. Low volume, high value (\$1M–\$2M+). Adelaide + Adelaide Hills.
- **Where this sits:** the RFQ Engine runs at the **very start** of a tender, when drawings + structural/engineering docs land, *before* anything is priced. (Critical — see §8 constraint 1.)
- **The pain:** a needed trade with no RFQ → no price → eaten cost or late scramble. A not-needed trade with an RFQ → wasted subbie goodwill. **Scope completeness + correct trade attribution is the whole game.**
- **Long game:** Sam wants this engine to become a **standalone estimating/QS product** other builders pay for. So it is built as a portable intelligence subsystem with its own data governance — *not* a hard-wired Hub feature.

---

## 5. The current reality in Blue Leaf Hub (ground truth — align to it; flag anything you'd change)

### 5.1 Extraction entry point
- **Prompt:** `extractionMasterPrompt` constant in `server/dev-api.mjs` (~line 584) — one large instruction returning JSON with `trade_notes` (keyed by trade), `project_context`, `key_project_notes`, `coverage_gaps`.
- **Route:** `POST /api/rfq/extract` in `server/dev-api.mjs` (~line 968) — streams **NDJSON**, attaches tender PDFs as document blocks, Anthropic Claude, `max_tokens` ~16000, `temperature` 0.2.

### 5.2 Deterministic merge/clean layer (server-side)
- `server/lib/rfqScopePipeline.mjs` — `processExtraction()` → `processTradeNote()` (dedupe, move site-context to assumptions, single standards block), `validateRfqReadiness()`.
- `server/lib/rfqTradeIntelligence.mjs` — `tradesFromAiExtraction()`, `mergeTradePlan()` (AI + optional estimate + library; **estimate is additive/optional, never required**), `buildRfqTradeIntelligence()`, coverage/missing analysis.
- `server/lib/rfqTradeExtractionRules.mjs` — per-trade keyword rules. **⚠️ Still keyed to a stale legacy 11-trade vocabulary → the canonical 36 fall through to generic bullets. Redesigning this keying is in your remit.**

### 5.3 Canonical trade taxonomy (the shared vocabulary)
One canonical list of **36 trades**, mirrored in `src/lib/rfqExtraction.js` (`RFQ_TRADE_ORDER` + `LEGACY_KEY_MAP`) and `server/lib/tradeMasterLibrary.mjs`:

```
site_establishment, excavation, demolition, termite_protection,
concrete_footings, structural_steel, carpentry, external_cladding,
windows_skylights, roof_plumber, masonry, glazing,
electrical_data, lighting_automation, plumbing, sanitary_ware,
heating_cooling, solar_batteries, insulation, internal_linings,
plastering_rendering, painting, stairs, joinery,
tiling, flooring, window_furnishings, garage_door,
appliances, door_hardware, fixtures_fittings, landscaping,
paving, fencing, pool_works, site_cleaner
```

Any engine speaks these keys (with a documented mapping to/from its own internal taxonomy).

### 5.4 The "Knowledge Core" facts/events layer (the moat — align to this)
- `server/lib/factsService.mjs` — `setFact`/`getFact`/`confirmFact`/`getPendingFacts`/`emitEvent`/`getJobProfile`. Stamps **provenance** (`source`, `confidence`, `status`) into `job_fact_history`; emits `job_events`.
- `server/lib/jobFactRegistry.mjs` — fact registry (tier, store, computer for Generated facts).
- **Confirmation is consequence-tiered:** wrong-value-causes-harm/lost-income/dispute/compliance → must be human-confirmed regardless of confidence; internal facts auto-apply ≥0.90. Provenance always stamped.
- `src/components/FactField.jsx` — reusable provenance UI (value + source·confidence·status + Confirm/Override/Edit); a Confirm Queue surfaces flagged suggestions.
- `job_documents` (mig 069) — uploaded tender docs registered here; extraction references the `job_documents` id as `sourceDocumentId`.

This Facts + Events + Documents chain is exactly what competitors lack (§7) — it is the platform's moat. The engine's outputs flow through it.

### 5.5 Persistence + stack
- Scope persisted in `rfq_packages` + `rfq_trade_scopes` (+ `rfq_recipients`).
- Node/Express (`.mjs`), React+Vite SPA, Supabase Postgres (RLS; server service role), Anthropic Claude. CLAUDE.md law: `ok()/err()`, `apiFetch`/`apiPost`, **camelCase across the boundary**, `constants.js` enums, amounts ex-GST, migrations hand-applied.

### 5.6 What already exists on the HUB side (the seam to plug into — not the engine itself)
A v0.1 **Hub-side adapter seam** already exists in the Blue Leaf Hub repo (`/Users/samuelmorris/Desktop/blue-leaf-hub`). This is the place the Hub *calls* the engine — it is **not** the Bestimator engine (which you build separately in `/Users/samuelmorris/Desktop/Bestimator/scope agent ai`, §0.0):
- `server/lib/scopeIntelligence/index.mjs` — the `ScopeIntelligence` interface, `HubScopeIntelligence` (a stop-gap that wraps today's prompt+pipeline), and `getScopeIntelligence()` factory (the swap-point: when Bestimator is ready, swap `HubScopeIntelligence` for an `ExternalScopeIntelligence` HTTP client with zero caller changes).
- `server/lib/scopeIntelligence/expectedScopeFloor.mjs` — the completeness floor (§10).
- `docs/agent_knowledge/SCOPE_INTELLIGENCE_ADAPTER_SPEC.md` — the boundary contract.
Treat these as the integration target your engine must satisfy. The Bestimator engine *replaces* the intelligence inside `HubScopeIntelligence`; it does not live in the Hub repo. Keep the contract consistent with the spec doc.

---

## 6. The big architectural idea — Building Element → Trades → Scope (the QS spine)

Today the engine thinks **Trade → Scope**. Quantity surveying does not work that way. **QS works from building elements; Buildxact works largely from trades.** To be future-proof for quantities and estimating, insert an **Element Intelligence Layer** between scope and quantities:

```
Building Element
   ↓ (contributing trades)
Trades
   ↓
Scope lines
   ↓ (later: quantities hang off the element)
Quantity candidates
```

Example — instead of just "Electrical", think:

```
Building Element: Bathroom
  Contributing trades: plumbing, sanitary_ware, waterproofing(→tiling/internal_linings),
                       electrical_data, lighting_automation, tiling, joinery, painting, glazing
  Quantities (later): wall tile area, floor tile area, waterproofing area, fixture count, ...
```

**Why it matters:** elements are how a quantity surveyor measures and how an estimate is structured; trades are how RFQs and Buildxact categorise. The engine must hold **both** and the mapping between them. Design the data model so a scope line can attach to an element *and* roll up to a trade, and so quantities will later attach to elements. (Output B specifies the Element model + element→trade contribution map.)

---

## 7. Competitive read — Wundermator/WunderBuild (what to learn, what to beat)

Sam reviewed **Wundermator** (an AI estimate generator that exports an XLSX straight into WunderBuild). Their pipeline appears to be:

```
Document Intelligence  →  Building Classification  →  Rule-Based Estimating  →  Spreadsheet Generator
(read plans)             (build type / finish /        (quantities × rates ×       (XLSX → WunderBuild import)
                          site steepness)               multipliers)
```

**Their tier-multiplier model** (useful reference for our Phase 5/6 Cost & Estimate layers):
- **Build Type (1–5):** New Build / Knockdown Rebuild / Extension / Reno-Light / Reno-Major — multipliers per cost category (materials, suppliers, sub-cons, labour). Renos look cheap on materials but punish labour hardest.
- **Finish Level (1–5):** Investor → Luxury — luxury hits materials/suppliers hard, labour barely.
- **Site Steepness (1–5):** Flat → Cliffside — hits labour heavily, sub-cons lightly, materials not at all.
- **Locked labour rates** ($80/$95/$130 per hr); tiers scale *hours*, not rates. All three factors compound multiplicatively.

**What Wundermator appears to lack — and where our moat is:** no historical learning, no RFQ integration, no procurement integration, no WHS integration, no project-actuals feedback loop. They go `Plans → Estimate`. We are building `Plans → Scope Intelligence → Universal Facts → Trade Intelligence → RFQ → Scheduling → WHS → Procurement → Historical Intelligence → Estimating`. The Knowledge Core + Universal Fact Registry + the multi-software learning loop is the durable advantage.

**Design implications:**
- Adopt a **classification stage** (build type / finish / site difficulty) early — it conditions the floor, the priors, and later the multipliers. (Note: we *derive* these from documents/facts where possible rather than only asking the user.)
- Keep the **rule engine deterministic** for quantities × rates × multipliers; reserve AI for reading/classifying/inferring.
- Our multipliers must eventually be **calibrated from our own historical actuals** (Cost Intelligence), not hard-coded — that's the feedback loop they don't have.

---

## 8. Hard constraints (design *for* these)

1. **RFQ runs EARLY — no Buildxact estimate exists yet.** Inputs at extraction time = tender documents only. **The AI/document-only path stands entirely alone.** The estimate, when it later exists, is additive enrichment + a learning signal — never a dependency.
2. **Completeness floor.** Always-present trades for a project type must appear — as scope or as an explicit "expected but not found — confirm?" flag. Never silently omit. (§10.)
3. **Self-improvement is mandatory.** Learn from corrections + downstream ground truth from *every* plugged-in system (§9, §13 LearningAdapter).
4. **Measurable accuracy.** Define the metric(s); compute at each cascade layer; expose via `getAccuracyMetrics()`/`getLearningSummary()`. "Feels better" is not acceptable.
5. **Learn the language of drawings.** Accumulate a lexicon of symbols/abbreviations/legend conventions (FFL, RL, NGL, slab marks, hatch patterns, window/door schedules) and their scope/element implications, across many document sets.
6. **Pluggable / multi-software by design.** The engine owns intelligence; hosts own workflow. Stable API; multiple adapters (§11–§13).
7. **Multi-tenant governance.** Private tenant memory vs shared anonymised learning vs tenant preferences (§12) — baked into the data model from day one.
8. **Knowledge-Core-aligned.** Outputs flow through facts/events/provenance/tiered-confirmation; scope lines that drive money/compliance are 🔴 (human-confirm), internal hints 🟢. No parallel dumping ground.
9. **Future-proof data model.** Phases 2–6 (§3) must be additive, not rewrites.

---

## 9. The accuracy cascade (the heart of self-improvement)

Ground truth about "what this job really needed" arrives in increasing-fidelity layers over weeks — now generalised across *all* host systems via the LearningAdapter:

| # | Signal | When | Fidelity | Teaches |
|---|---|---|---|---|
| 1 | Expected-scope floor / learned priors | instant | low but certain | always-present trades (a floor, not a ceiling) |
| 2 | **Human review corrections** | minutes | high (intent) | missed/hallucinated trades, wrong-trade lines, misread symbols — richest signal |
| 3 | Final RFQ set sent | hours–days | high (committed) | the trades the builder actually quoted |
| 4 | Accepted quotes / Buildxact (or WunderBuild) estimate categories | days–weeks | high (priced) | confirmed trade set, now with structure |
| 5 | POs + invoices + actual costs | weeks–months | highest (money) | the trades that truly existed |
| + | Schedule outcomes, WHS corrections | varies | medium–high | sequence/risk reality from other host systems |

For each: define capture, reconciliation vs the original run, what it mutates (priors / symbol lexicon / per-trade thresholds / few-shot exemplars / element-trade map), and how it feeds the accuracy metric (precision/recall/F1 of trade set vs each layer; scope-line-level score for corrections).

---

## 10. Expected-scope floor (Sam-seeded; engine should learn to extend it)

| Project type | Floor trades (canonical keys) |
|---|---|
| `new_build`, `renovation`, `knockdown_rebuild` | excavation, concrete_footings, roof_plumber, electrical_data, plumbing, internal_linings, painting |
| `extension` / `addition` | the above **+ termite_protection, windows_skylights** |

A floor trade not found → returned as `expected_missing` (confirm/deny), never dropped. Unknown project types enforce no floor (fail open). The engine should *propose* learned additions to the floor as evidence accumulates (e.g. "92% of two-storey new builds also needed `structural_steel` — promote?"). Design question (Output D): is the floor keyed by project_type only, or also conditioned on building facts (storeys, basement, BAL, slope) and the Wundermator-style build-type/finish/steepness classification?

(Already implemented as the deterministic seed in `expectedScopeFloor.mjs`.)

---

## 11. PLUGIN + MULTI-SOFTWARE ARCHITECTURE

**The Scope Intelligence Engine is a standalone intelligence subsystem with plugin adapters. Blue Leaf Hub's RFQ Engine is the first plugin *consumer*, not the owner.**

```
              Scope Intelligence Engine  (owns intelligence)
                          ↓ Adapter layer
   ┌──────────────┬──────────────┬──────────────┬────────────┬────────────┐
   │ Blue Leaf RFQ│  Estimating  │ Quantity Srv │  WHS        │ Scheduling │  … other builder software
   └──────────────┴──────────────┴──────────────┴────────────┴────────────┘
              (each host owns its own workflow & UI)
```

**Core rule — the engine provides intelligence, the host owns workflow.**

The engine provides: extracted scope · expected trades · missing scopes · building facts · **element candidates** · quantity candidates · confidence scoring · source references · correction learning · symbol/legend memory · accuracy metrics.

The host decides: how the user reviews · how RFQs are sent · how estimates are formatted · how schedules are created · how documents are stored · permissions · UI.

**Required adapters (specify each fully in Output F):**
1. **BlueLeafRfqAdapter** → RFQ trade packages, trade-specific scopes, recipient-selection inputs, missing-trade warnings, RFQ readiness score.
2. **EstimatingAdapter** → estimating categories, recipe candidates, quantity candidates, allowance flags, review queue.
3. **QuantitySurveyingAdapter** → measured quantities, confidence scores, source references, review-required flags.
4. **WhsAdapter** → high-risk construction work flags, site risks, required SWMS, induction prefill fields.
5. **ScheduleAdapter** → suggested task list, trade sequence, procurement lead-time hints, dependency candidates.
6. **LearningAdapter** → *inputs:* user corrections, final RFQ set, accepted quotes, estimate categories, POs, invoices, actual costs, schedule outcomes, WHS corrections. *outputs:* updated priors, updated extraction rules, updated symbol library, updated accuracy metrics.

---

## 12. MULTI-SOFTWARE LEARNING (governed)

The engine learns from multiple software environments, but learning is governed into three buckets:

1. **Private tenant memory — never shared.** Client names, project addresses, pricing, subcontractor names, project-specific documents, job-specific corrections, internal margins.
2. **Shared anonymised learning — pooled only if the tenant allows.** Architectural symbol patterns, scope-inference patterns, trade-presence patterns, document-classification improvements, common drawing-note interpretations, generic quantity-extraction improvements.
3. **Tenant-specific preferences — reusable only within that tenant.** Preferred trade categories, preferred recipe structure, preferred wording, RFQ style, estimating method, confidence thresholds.

`tenantId` scopes every run/outcome. Pooled contributions are de-identified at write time; tenants opt in/out. (Output K specifies the table/column split + de-id rule.)

---

## 13. CORE INTERFACE (stable API — never hard-code the engine to Blue Leaf Hub)

Design the full contract (Output G). Methods:

```
extractScope()             // trades + scope (the v0.1 method that exists)
extractBuildingFacts()     // Phase 2 — storeys, areas, counts, systems
extractQuantityCandidates()// Phase 3 — measured quantities w/ confidence + source
generateTradePackages()    // RFQ/sub-package shaping from scope
mapToRecipes()             // Phase 4 — quantities → recipe/line-item candidates
submitCorrection()         // human edits (the richest learning signal)
submitOutcome()            // downstream ground truth (RFQ set / estimate / POs / actuals / schedule / WHS)
getAccuracyMetrics()       // per-trade / per-element precision-recall-F1, trend
getLearningSummary()       // what the engine has learned, and from where
```

**Every response envelope must carry:** `source`, `confidence`, `provenance`, `status`, `reviewRequired`, and `consumingModuleHints` (which host modules each output is relevant to, e.g. `["rfq","estimating","whs"]`). All keys = canonical taxonomy; camelCase across the boundary. (The v0.1 `extractScope`/`submitOutcome` schemas live in `SCOPE_INTELLIGENCE_ADAPTER_SPEC.md`; extend that contract to the full method set.)

---

## 14. Blue Leaf Hub — first implementation (plugin inside the RFQ flow, separable later)

For the first build, run the engine as a plugin *inside* the RFQ Engine extraction flow, but designed so it can later be lifted into its own service with no RFQ-Engine rewrite:

```
Tender documents uploaded
  ↓
Scope Intelligence Engine runs (extractScope; later extractBuildingFacts/QuantityCandidates)
  ↓
BlueLeafRfqAdapter converts output
  ↓
RFQ Engine displays: extracted trades · expected trades · missing trades · trade-specific scope ·
                     confidence · source evidence · review-required
  ↓
User confirms / edits / removes / adds
  ↓
Corrections → engine via LearningAdapter.submitCorrection()
  ↓
RFQ packages created
  ↓
Final RFQ set → engine via LearningAdapter.submitOutcome()  (signal: final_rfq_set)
```

**Design principle (state it back):** do not design this as "RFQ extraction logic." Design it as a **reusable construction-document intelligence subsystem that happens to power RFQ extraction first** — multifunctional, portable, measurable, self-improving.

---

## 15. Your reasoning process — work Parts 1–16, then emit Outputs A–R

Be concrete and opinionated; state assumptions. Each Part names its Output(s).

- **Part 1 — Mission, strategic context & constraints restatement.** Prove you've internalised §0, §2, §3, §6, §8 (alignment check; no output).
- **Part 2 — Platform-wide data model spine.** → **Output A** (the universal extraction data model that supports all 6 roadmap phases additively: runs, documents, building facts, **elements**, trades, scope lines, quantity candidates, recipe candidates — provenance + tier + tenant on everything).
- **Part 3 — Element Intelligence Layer.** → **Output B** (Building Element model: element types, element→contributing-trade map, how scope lines attach to elements and roll up to trades, how Phase-3 quantities will attach to elements).
- **Part 4 — Taxonomy & symbol lexicon.** → **Output C** (adopt the canonical 36-trade taxonomy + an element taxonomy + the symbol/abbreviation/legend lexicon record design: what a "symbol observation" is, how meaning is attached, how it's reused and pooled).
- **Part 5 — Expected-scope floor.** → **Output D** (floor matrix; conditioning variables incl. the build-type/finish/steepness classification; enforcement as scope vs flagged-missing; learned-addition proposal/approval mechanism).
- **Part 6 — Extraction architecture.** → **Output E** (end-to-end pipeline with the deterministic-vs-AI split at each stage: doc ingest & `job_documents` registration → page/sheet classification → schedule/legend parsing → building-fact + element detection → trade derivation → floor reconciliation → confidence → provenance/tiering → human review → outcome capture; show where a Wundermator-style classification + rule stage fits).
- **Part 7 — Plugin & multi-software architecture.** → **Output F** (the 6 adapters fully specified — inputs/outputs each; the engine-owns-intelligence / host-owns-workflow boundary; how a new host plugs in).
- **Part 8 — Core interface contract.** → **Output G** (full request/response schemas for all 9 methods (§13); the shared response envelope carrying source/confidence/provenance/status/reviewRequired/consumingModuleHints; canonical keys; camelCase).
- **Part 9 — Self-improving loop.** → **Output H** (correction/feedback loop across all plugged systems: what each of the cascade signals (§9) mutates — priors, lexicon, thresholds, few-shots, element-trade map). → **Output I** (accuracy measurement methodology: exact metrics computable per cascade layer; storage; how surfaced via getAccuracyMetrics/getLearningSummary).
- **Part 10 — Memory & data model details + governance.** → **Output J** (Postgres DDL, additive + RLS-aware: extraction runs, elements, trades, scope lines, quantity candidates, recipe candidates, corrections, learned priors, symbol lexicon, accuracy metrics over time). → **Output K** (multi-tenant governance split (§12): which tables/columns are private / pooled / preference; the de-identification rule; opt-in/out).
- **Part 11 — Model & compute strategy.** → **Output L** (model per step; deterministic-vs-AI division; prompt-caching for the big system prompt + growing lexicon/few-shots; targeted low-confidence re-prompting; rough cost per extraction + scaling; where a deterministic rule engine replaces AI).
- **Part 12 — Roadmap to quantities/recipes/cost/estimate.** → **Output M** (detailed Phase 2–6 design: Building Intelligence, Quantity Intelligence, Recipe Intelligence, Cost Intelligence — incl. a tier-multiplier model like Wundermator's but **calibrated from our historical actuals** — and Estimate Generation; what unlocks each phase). → **Output N** (recipe-autofill design: scope+quantities → Buildxact/WunderBuild-style line items; the round-trip/export shape; what the engine must learn to do it).
- **Part 13 — Human review UX (host-owned, engine-assisted).** → **Output O** (the review experience that *produces* the correction signal; aligns with the Hub's `FactField` + Confirm Queue; how add/remove/fix-wrong-trade/dismiss-hallucination each log as training signal; engine supplies review hints, host owns the UI; keep it fast — busy builder).
- **Part 14 — Blue Leaf Hub integration & rollout.** → **Output P** (precise integration points/files: `extractionMasterPrompt` + `/api/rfq/extract`, `rfqTradeIntelligence.mjs`, `rfqScopePipeline.mjs`, `rfqTradeExtractionRules.mjs`, `rfq_packages`/`rfq_trade_scopes`, `factsService`/`emitEvent`, `FactField`, the existing `scopeIntelligence/` adapter shell; where BlueLeafRfqAdapter sits; shadow-run-vs-current-prompt → compare → cut over; backfill learning from historical extractions).
- **Part 15 — Build governance artefacts.** → **Output Q** (concrete spec + templates for MASTER_PLAN, BUILD_LOG, engine-local CLAUDE.md from §0; the engine's file/folder layout and naming conventions; the per-session update cadence).
- **Part 16 — Risks & open decisions.** → **Output R** (risk register: hallucinated trades driving wrong RFQs; floor over-reach sending unnecessary RFQs; learning on bad corrections; tenant data leakage; model drift; cost blow-up; element-model over-engineering; estimating-accuracy liability à la "what it isn't" — plus an explicit **"decisions Sam must make"** list).

---

## 16. Definition of done for your deliverable

- All Outputs **A–R** present and clearly headed (this supersedes the earlier A–P list).
- Everything reframed as **Phase 1 of the autonomous estimating platform** (§2/§3), not an RFQ feature.
- The **Element → Trades → Scope** spine is in the data model (§6).
- Multi-software **plugin architecture + 6 adapters** specified; engine owns intelligence, host owns workflow (§11).
- **Multi-tenant governance** (private / pooled / preference) baked into the data model (§12).
- Full **9-method interface** with the shared provenance envelope (§13).
- All canonical 36-trade keys (§5.3); data model additive + RLS-aware; deterministic-vs-AI split explicit.
- Honours every §8 constraint (AI-only path stands alone; floor enforced; self-improving; measurable; pluggable; governed; Knowledge-Core-aligned; future-proof).
- **Build-governance artefacts** (MASTER_PLAN / BUILD_LOG / CLAUDE.md) specified (Output Q) — and you commit to maintaining them every session (§0).
- Clear **recommendations** + a **"decisions Sam must make"** list (Output R).

**Out of scope this pass:** production code, UI build, applying migrations. Design/specify only. Tight and technical — Sam reads fast and dislikes filler.

---

## 17. Glossary

- **RFQ** — Request for Quote; a scoped package to a subcontractor trade.
- **Trade / trade key** — one of the canonical 36 (§5.3).
- **Building element** — a physical part of the building (bathroom, roof, slab, external wall…) that multiple trades contribute to; the QS spine (§6).
- **Scope line** — a single line of work attributed to a trade (and, going forward, an element).
- **Quantity candidate** — a measured quantity proposed from drawings, with confidence + source (Phase 3).
- **Recipe** — an estimating line-item template (Buildxact/WunderBuild style) that quantities map onto (Phase 4).
- **Floor** — minimum expected trade set per project type (§10).
- **Accuracy cascade** — the ground-truth signals arriving over time across all host systems (§9).
- **Adapter** — a plugin connecting the engine to one host software (§11); the engine is host-agnostic.
- **Knowledge Core** — the Hub's facts + events + documents provenance layer (§5.4); the platform's moat.
- **Fact / provenance / tier** — a canonical attribute; its source+confidence+status; its consequence level (🔴 confirm vs 🟢 auto).
- **Tenant** — one host/builder the engine serves; scopes private vs pooled learning (§12).
- **Wundermator/WunderBuild** — competitor estimate generator + its host; reference for the classification + tier-multiplier model and for what our feedback-loop moat beats (§7).
