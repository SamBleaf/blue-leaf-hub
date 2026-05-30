# Blue Leaf Hub — Universal Data Architecture: Implementation Plan

> Created: 2026-05-30. The execution layer for `MASTER_DATA_DICTIONARY.md` (Parts 1–5).
> Turns the architecture into ordered, buildable phases with concrete schema/files/acceptance criteria.
> **Build only — no further design.** Each phase is independently shippable on test data (no real jobs yet).
> Governing rule: the Canonical Data Law (CLAUDE.md Standards). Modules paused during the foundation phases.

## Principles for the build
- **Additive first.** New tables/columns/services land before any module is migrated off old paths.
- **One module migrated at a time.** Each migration is a self-contained, verifiable change.
- **No fact copied.** Every consumer reads via `getJobProfile` / `getLeadProfile` / `getPartyProfile`.
- **Verify each phase** against its acceptance criteria before starting the next.

---

## Phase −1 — Prerequisite cleanup (mostly deletion/consolidation)
*Fixes the active bugs/landmines so the foundation isn't built on shifting ground (dictionary §18).*

| Task | Action | Acceptance |
|---|---|---|
| Finance route shadowing | Consolidate `financeRoutes` + `financeCCRoutes` + `jobFinanceRoutes` into ONE module; remove dead/duplicate endpoints; single WIPAA implementation | One registration in `dev-api.mjs`; no duplicate route paths; one WIPAA code path |
| `project_metrics` collision | Deprecate the `projects.project_metrics` jsonb column; converge Buildexact writer onto the `project_metrics` **table** | One store; jsonb column unused/dropped; Buildexact writes the table |
| `contract_value` dual-source | Decide: make it a **single Generated fact** (drop the mig-034 trigger, keep one recompute) | Stored value and computed value can't diverge; one source |
| WHS → `project_swms` | Make the WHS engine's `applicable_swms` derivation insert `project_swms` rows | Induction SWMS list is populated from the engine |
| Extraction null bug | Stop writing `slab_area_m2`/`roof_area_m2` from keys the prompt never emits, OR emit them | No silent-null columns |
| Doc-correction sweep | ✅ DONE (this session) | Dictionary is undisputed; phantom table gone; numbering correct |

---

## Phase 0 — Foundation: the Knowledge Core
*The thin spine that makes the Law enforceable (dictionary §14, §23–§33).*

**Migration (`069_knowledge_core.sql`):**
- Extend `project_metrics` with missing Project-Facts columns (frame_type, roof_structure_type, has_basement, has_structural_steel, has_demolition, building_age, foundation_type, wall/roof cladding, overlays, pool/lift/solar/battery/tank, site_coverage, building_height) + `fact_provenance jsonb`.
- Create `job_fact_history` (versioned fact changes), `job_events` (job_id business events), `contact_events` (party events + consent/unsubscribe), `job_documents` (document registry w/ direction, type, version, supersedes, template_key/version, audience_layer, is_stale).
- Config layer: `company_profile` (name, ABN, licence, address, phone, logo) + `integration_status`.

**Server:**
- `jobFactRegistry.mjs` — the registry (every fact: canonical_name, family, type [static/versioned/generated], creator, source_doc, consumers, tier, validation). Single naming authority.
- `factsService.mjs` — `setFact(spine, id, key, value, {source, confidence})` (enforces type rules; rejects writes to Generated facts; stamps provenance; writes history; emits event); `getJobProfile/getLeadProfile/getPartyProfile`.

**Client:** `<FactField>` Confirm/Override component (source · confidence · status; tiered).

**Acceptance:** writing a fact via the service stamps provenance + history + an event; `getJobProfile` returns facts with provenance; a direct write to a Generated fact is rejected; nothing else changes (read layer is additive).

---

## Phase 1 — Address as canonical identity
Wire the half-built mig-040 columns: proper normaliser (expand abbreviations, parse suburb/state/postcode, optional geocode), populate `address_suburb/postcode`, dedupe via `is_duplicate_of`. Make `address_normalised` the match key for quote/fee-proposal matching (replace fuzzy `ilike`).
**Acceptance:** address standardised on write; suburb/postcode populated; matching uses the normalised key; no new address copies.

## Phase 2 — Client + contact onto the spine
Add `jobs.client_email`/`client_phone`. Move lead→job conversion to the **API** (from `LeadDetail.jsx`) and stamp name/email/phone/suburb/project_type/architect/estimated_value onto the job via the facts service. Reconcile `projects.portal_client_email` / `carpentry_jobs` / `crm_contacts` to read the job; wire `crm_contacts.linked_job_id`.
**Acceptance:** client contact canonical on the job; portal/claims/variations read it; conversion carries all lead facts (non-lossy).

## Phase 3 — Fact Registry formalised + Dependency Matrix
Tier every fact (= MAX consequence across consumers, §33). 🔴 facts route to a **Confirm queue**; 🟢 auto-apply ≥0.90. Surface provenance everywhere via `<FactField>`.
**Acceptance:** every registered fact has a tier; 🔴 facts cannot become canonical without confirmation; 🟢 auto-apply with provenance.

## Phase 4 — Building Facts via the Project Intelligence Engine
The single building-facts extraction (distinct from RFQ scope extraction, §34): classify the document (arch/structural/spec/BAL/survey → `job_documents`), extract registry facts, tag each with `source=document_id` + confidence, write via the facts service, tiered confirmation. Migrate **WHS m0**, **Cost Intelligence**, and **Schedule** to read building facts via `getJobProfile` (stop re-asking/re-deriving).
**Acceptance:** uploading plans yields facts with provenance; 🔴 facts confirmed; WHS/cost/schedule consume them; no module stores its own copy; a revised drawing (new doc version) re-extracts and marks dependents stale.

## Phase 5 — Contract value / financial truth
Single Generated `contract_value` (`original_contract_value` + SUM signed variations) surfaced via `getJobProfile`. Value-carry: `estimated_value` → accepted proposal total (incl. PTSA fee) → `original_contract_value` at win. Generated financials (actual cost, labour, claimed/paid, margins, WIPAA, cashflow) computed with recompute-on-event; snapshots (WIPAA, closeout) remain as point-in-time event records.
**Acceptance:** one contract_value source; a won job has a contract value; margin reconciles; no stored Generated value can drift.

## Phase 6 — Trade taxonomy
`trade_categories` canonical. Add `trade_category_id` FK to `rfqs`, `subcontractors`, `purchase_orders`, `cost_intelligence`. Map workforce `task_category` and Buildexact category names to it.
**Acceptance:** one vocabulary; labour actuals land in per-trade `budget_vs_actual`; Buildexact mapping is FK-based, not fuzzy.

## Phase 7 — Carpentry integration (last)
Add `carpentry_jobs.job_id` FK; backfill links by normalised-address match. Register carpentry's parallel financial spine (`carpentry_job_budgets`, quoted_value, closeout). Rollups via `job_id`; guard against double labour attribution (job_id vs carpentry_job_id).
**Acceptance:** carpentry rolls up with the builder spine; no double-counting; carpentry consumes the same canonical facts.

---

## Cross-cutting (every phase)
- Events + Documents are written as modules migrate (not a late phase).
- SOPs updated as each module migrates onto the facts layer.
- After all phases: run the **Module Specialist Audit** (`MODULE_AUDIT_AGENT_PROMPT.md`).
