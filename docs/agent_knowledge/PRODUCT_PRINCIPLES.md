# Blue Leaf Hub — Product Principles

> Last updated: 2026-05-21
> These principles govern all product and engineering decisions.

---

## Core Principles

### 1. Project-First Workflow
Every action in Blue Leaf Hub relates to a project. Projects are the atomic unit of the business. Features that don't connect to a project must earn their place.

**In practice**: Navigation, context, and permissions should always orient around the active project. The `ProjectContext` global selection is the primary navigation paradigm in Operations, Finance, and Portal.

---

### 2. Extract Once, Reuse Everywhere
Data entered or extracted once should flow to every system that needs it. Manual re-entry is a defect.

**In practice**:
- Job address entered once → flows to project, portal, Dropbox path, Buildexact, client-facing docs
- RFQ scope extracted by AI once → reused in packages, POs, schedule, trade master library
- Invoice extracted by AI once → matched to job, trade category, budget, progress claim

**Violation examples to prevent**: Asking a user to enter a job address in both the job record and the project record. Asking a user to re-enter a contract value already in Buildexact.

---

### 3. Minimal Clicks
The number of user actions between intent and outcome should be minimised. Wizards and multi-step processes are acceptable only where complexity genuinely demands them.

**In practice**:
- One-click PO issuing from Tender Board
- AI generates schedule from description — no manual task entry required
- IMAP auto-matches quotes — no manual inbox checking required

---

### 4. Mobile-Aware for Site Workflows
Office workflows (tendering, finance, portal admin) can be desktop-only. Site workflows (site diary, WHS, inductions, progress marking) must work on mobile.

**In practice**:
- `AppShell.jsx` uses responsive sidebar (desktop) + bottom drawer (mobile)
- Site diary voice capture is a mobile-first feature
- Public induction form (`/induct/:projectId`) must be phone-friendly
- Gantt views are desktop-only — acceptable

---

### 5. AI Augments — Confirmation Is Consequence-Tiered
AI assists with extraction, generation, coaching, and QC. Whether its output auto-applies is governed by the **consequence of being wrong**, not a flat "never auto-apply" rule:
- 🔴 **Consequential facts** (safety/WHS, money, client-facing, compliance, consent) are **always human-confirmed** before they become canonical — even at high confidence.
- 🟢 **Internal facts** (estimating/benchmarking/marketing metadata) **auto-apply at ≥0.90 confidence** — always with provenance (`source · confidence · status`) stamped and a one-click override.

See `MASTER_DATA_DICTIONARY.md` §22 (the policy is LOCKED there).

**In practice**:
- RFQ extraction: AI extracts → user reviews → user sends (client-facing/money → confirmed)
- Schedule generation: AI generates → user reviews → user locks
- Invoice extraction: AI extracts → user confirms → user approves (money → confirmed)
- Transcript analysis: AI suggests → user approves/rejects each suggestion
- Internal benchmarking/marketing metadata: auto-applied at ≥0.90 with provenance stamped

---

### 6. No Orphaned Records
Every record in the system must have a valid parent or be clearly marked as unmatched. Orphaned data creates confusion and reporting errors.

**In practice**:
- RFQ packages must have `job_id` (NOT NULL, enforced by migration 039)
- Financial documents must be matched to a job before approval
- Projects must have a `job_id`
- Schedule tasks must have a `project_id`

**Unmatched states are valid** — `unmatched_quote_emails` queue, finance approval queue — but they must have a workflow to resolve them, not just accumulate.

---

### 7. Financial Data Must Be Trustworthy
Financial numbers drive business decisions. They must be accurate, sourced from one place, and never double-counted.

**In practice**:
- `jobs.contract_value` is currently **dual-sourced** (a known conflict): the migration-034 trigger stores it, but the live finance KPI routes recompute it from `original_contract_value` + signed variations and distrust the stored value. The target is a single **Generated** fact — see `MASTER_DATA_DICTIONARY.md` §17/§20/§29. Until reconciled, follow the finance routes' recompute; don't trust the stored value blindly.
- Budget is imported from Buildexact — not manually entered and subject to drift
- Invoice amounts come from AI extraction with human review — never entered without verification
- Progress claims compute from approved invoices + payment records — not estimates

---

### 8. RFQ Data Must Be Trustworthy
Subcontractor quote data is the basis for project cost estimates. Incorrect data here flows through to fee proposals, budgets, and financial forecasts.

**In practice**:
- Quote amounts are extracted by AI or manually entered — always confirmed before use
- IMAP auto-match must be confirmed before the quote is accepted
- `unmatched_quote_emails` queue ensures nothing is auto-applied without review

---

### 9. Client Portal Hides Internal Complexity
The client-facing portal must present a clean, confident, professional view of the project. Internal complexity (budget overruns, WHS incidents, subcontractor disputes) should not be visible unless deliberately shared.

**In practice**:
- Portal budget view shows selected claim milestones, not raw invoice data
- Portal timeline shows milestone-level tasks, not every schedule task
- Portal variations show client-facing description and price, not internal cost breakdown
- Portal messages are managed communications, not internal chat

---

### 10. Preserve All Module Integrations
Modules are connected. A change in one module must be assessed for impact on all others it integrates with.

**In practice**: Before any change, consult `MODULE_RELATIONSHIPS.md` and `DATA_FLOW_MAP.md`. Never change a table without checking all modules that read or write it.

---

### 11. The Canonical Data Law Is Binding
Facts belong to the project, not the module. The **Canonical Data Law** and the **Project Knowledge Core (Facts + Events + Documents)** are defined in `MASTER_DATA_DICTIONARY.md` and are **binding** — it is the field-level source of truth for data architecture; where any other doc differs, the dictionary wins.

**In practice**: Before adding a column, check the Fact Registry (dictionary §11). Read canonical facts via `getJobProfile(jobId)` — never copy a canonical fact into your module's table. Facts key to one of three spines (Party / Lead / Job). All fact writes stamp provenance.

---

## Engineering Principles

### Don't Improve Unrelated Areas
When fixing a bug or building a feature, stay within scope. Opportunistic improvements increase blast radius and introduce regressions.

### Stabilise Before Improving
Address KNOWN_ISSUES.md critical and high items before adding new features. Technical debt compounds.

### No Placeholder Fixes
A fix must actually fix the problem. `// TODO: fix later` in production code is not a fix. Either fix it now or log it in KNOWN_ISSUES.md.

### Test Affected Workflows
After any change, immediately test the primary workflow for the affected module. Document what was tested and what result was observed.

### Migrations Are One-Way
Never roll back a migration by reversing it. If a migration causes problems, write a new forward migration to fix it. Migration 040 is an example of this pattern — it repairs issues introduced in earlier migrations.

### Server vs Client Auth
- Frontend: anon key, RLS applies — correct for user-scoped reads
- Server: service role, bypasses RLS — correct for cross-user writes, admin operations, integrations
- Never use service role on the client
- Never use anon key on the server for writes

---

## APB Sales Process Alignment

Blue Leaf Building follows the **Association of Professional Builders** framework. The Sales Manager is built around this framework. Stages must not be changed without understanding APB principles.

**APB Stage sequence:**
`enquiry → qualify → discovery → winning_offer → fee_proposal → accepted → tender → won`

Plus holding states: `nurture` (long-term keep-warm), `lost`

**Each stage has specific APB actions and commitments.** Blueprint coaching is calibrated to APB. Do not add stages or rename stages without understanding their APB meaning.
