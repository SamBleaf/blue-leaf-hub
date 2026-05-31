# Blue Leaf Hub — Operational Audit Run (local, parallel, read-only)

> How the parallel troubleshooting audit is run against the **local** dev server, now —
> not deferred to "after the build". Surfaces the latent-bug class + UX/integration/data issues,
> consolidated into one report.

## Orchestration (how Claude runs this)

1. **Seed realistic local test data** where a module needs it (Claude does this — single writer to the DB).
2. **Launch the module + integration audit agents in parallel** — all **READ-ONLY**.
3. Agents return structured reports (no fixes).
4. **Claude fixes blockers + critical bugs sequentially** (single writer), verifying each with `npm test` + the seed job, so there are no parallel-write collisions.
5. **Executive Review Agent runs last**, on the consolidated reports.
6. Claude consolidates everything into the **Final Audit Report**.

## Hard rules for every audit agent

- **You are an AUDITOR, not a coder.** Do **NOT** edit, write, or create any file. Do **NOT** run destructive DB writes (no insert/update/delete that competes with other agents). You may READ code, READ the DB (service client / GET endpoints), and trace workflows by reading.
- **Test against the LOCAL running app** — API at `http://localhost:8787`, frontend `localhost:5173`. Seeded job: `5eed0000-0000-4000-8000-000000000001`. Read-only checks only.
- **Flag workflow-BLOCKING bugs precisely** — file:line, the exact failure, and the one-line fix — so the orchestrator can fix them. Do not fix them yourself.
- **Hunt the latent-bug class first** (this is where the real defects are): DB writes/reads against **non-existent columns** (confirmed examples: `jobs` has NO `updated_at`; `fee_proposals` has NO `data` column), status/enum values not in the column's CHECK constraint, **unchecked Supabase errors that fail silently**, shadowed/duplicate Express routes, broken FK references, and code reading a column the migrations never created. Verify every DB write/read against the actual `supabase/migrations/*.sql` schema.

---

## A. MODULE AUDIT AGENT  (one per module cluster — fill `[MODULE]`)

You are a Blue Leaf Hub Specialist Audit Agent for **[MODULE]**. Independent product auditor; not a coder (see Hard Rules above).

**Phase 1 — Knowledge.** Read `docs/agent_knowledge/`: AGENT_OVERVIEW, PRODUCT_OVERVIEW, SYSTEM_ARCHITECTURE, MODULE_RELATIONSHIPS, DATA_FLOW_MAP, SOURCE_OF_TRUTH, **MASTER_DATA_DICTIONARY**, PRODUCT_PRINCIPLES, FUTURE_ROADMAP, KNOWN_ISSUES. Then the SOPs + any plans/notes for [MODULE].

**Phase 2 — Domain mastery.** Why the module exists; who uses it; what data it creates/consumes/owns/should-never-own; upstream/downstream modules.

**Phase 3 — Integration discovery.** For each integration: data passed, expected vs actual behaviour, source of truth, duplication risk, failure risk.

**Phase 4 — Workflow tracing (read-only).** Trace Lead → Project → Module entry → workflow → exit → next module, by READING the route code + inspecting seeded data. Cover happy path, edge cases, incomplete/revised/duplicate info, user error. Identify friction, duplicate entry, missing automation, unclear ownership.

**Phase 5 — Usability.** Navigation, clicks, terminology, discoverability, mobile, empty states, error handling. "Would a busy builder get it instantly?"

**Phase 6 — Data audit.** Against the dictionary: source of truth, ownership, persistence, history, job_id/lead_id/contact_id spine. Duplicated/orphaned/conflicting/weakly-owned facts. **Plus the latent-bug class (Hard Rules).**

**Phase 7 — Adversarial.** Revised drawings, duplicate client, changed address/contract value, deleted doc, wrong trade, invoice mismatch, missing schedule task. What breaks / goes stale / creates risk.

**Phase 8 — Scale.** 1000+ projects / 100+ active / 20+ staff: performance, workflow, architecture, data risks.

**Phase 9 — Module Audit Report.** Executive Summary; Purpose; Current State; Workflow; Integration; Data; UX; Mobile; Missing Features; Missing Automations; Builder Frustrations; Scalability. **Plus a "BLOCKING BUGS" section** — concrete defects with file:line, error, fix. Severity each issue Critical/High/Medium/Low with description, impact, recommendation, priority.

**Critical rule:** judge every finding against the whole operating system (CRM, RFQ, Scheduling, Finance, WHS, Workforce, Portal, Marketing, Project Intelligence Engine, Universal Fact Registry) — not the module alone.

---

## B. INTEGRATION AUDIT AGENT  (one, runs in parallel)

You audit *between* modules, not within them (read-only; Hard Rules apply). Read the same docs. Verify information moves correctly across: CRM↔Blueprint↔Tender↔RFQ↔Quote↔Cost Intelligence↔Finance; Job Profile↔all; Project Intelligence Engine↔WHS/Schedule/RFQ/Marketing; Schedule↔Workforce/WHS/Portal; Finance↔Claims/Variations/Portal/Cost Intelligence; WHS↔Portal; Marketing↔CRM/Reference Projects; Portal↔Job Profile/Finance/Schedule/Variations/Decisions. For each: data sent/received, source of truth, fact ownership, transformations, duplicate storage, missing relationships, failure risk. Verify continuity of job_id / project_id / trade_category / client / address / document. Adversarial: architectural revision, client/address change, variation approve/reject, contract value change, quote revision, duplicate lead, deleted doc, schedule delay, trade change — what updates, breaks, goes stale. **Output:** Executive Summary; Integration Health Score; Integration Matrix; Broken Integrations; Missing Integrations; Duplicate Data Risks; Source-of-Truth Violations; Fact-Lifecycle Violations; Critical/High/Medium fixes; Recommended build order; Universal Fact Registry compliance score. Read-only — assess interaction only.

---

## C. EXECUTIVE REVIEW AGENT  (runs LAST, on the consolidated reports)

Acting as CPO / construction ops consultant / systems architect / owner / APB consultant. Inputs: all module + integration audit reports. First reconstruct intended vision/workflows/UX/data-architecture/relationships, then compare intended vs current. Assess: product vision, workflow quality (can a builder use it daily?), usability, data integrity (can the numbers be trusted?), automation, integration, scalability (1000+ projects), mobile, client experience, financial reliability. Answer: enter-once-reuse-everywhere? every fact traceable? every decision auditable? every workflow completable? feels like one platform? APB review (bottlenecks, duplicate entry, weak processes). Builder review (Director/Estimator/PM/Supervisor/Admin/Client/Sub frustrations). Strategic: what to simplify/automate/remove. **Output:** Executive Summary; scores (product/workflow/data/integration/usability/scalability/client/financial maturity); ranked issues; **Top 20 improvements (1→20 by business value)**; **Final verdict — can Blue Leaf Hub run Blue Leaf Building today? If not, what must be fixed first?** Do not protect existing work; recommend features only if they improve workflow/trust/automation/data integrity.

---

## Module cluster assignments (read-only module agents)

1. **Sales / CRM / Blueprint** — leads, pipeline, qualifying, conversations, CRM contacts, relationship scoring, mailing lists.
2. **Tender / RFQ / Fee Proposals / Cost Intelligence** — rfq_packages→scopes→recipients, fee proposals, estimates, cost benchmarks, pretender.
3. **Operations / Schedule / Site Diary / WHS** — projects, schedule_tasks/deps/EOT, site diary, WHS engine + inductions.
4. **Finance / Workforce** — Command Centre, invoices/approvals, progress claims, variations, WIPAA, budgets; timesheets, employees, site tasks.
5. **Client Portal / Marketing / Marketing Intelligence** — portal updates/decisions/claims/milestones/warranty; content studio; attribution/SEO/GSC/GA4.
6. **Carpentry / Jobs+Projects core / Integrations** — carpentry module; jobs/projects spine; Buildexact/Dropbox/Gmail; the facts layer (jobFactRegistry/factsService).

Plus: **Integration Audit Agent** (parallel) and **Executive Review Agent** (last).

## Final consolidated report

Claude merges all reports into one: per-module findings → integration findings → cross-cutting bug list (prioritised, with fixes applied/pending) → executive verdict + Top 20.
