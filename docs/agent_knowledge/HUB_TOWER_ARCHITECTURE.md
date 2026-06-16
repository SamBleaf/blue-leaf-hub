# HUB TOWER — Architecture Review

> **Status:** Architecture proposal (2026-06-17). Grounded in a file-by-file analysis of the current Blue Leaf Hub codebase (15 modules, ~94 migrations, 12 AI services, 26 existing health primitives).
> **Author:** Synthesised from a 5-agent codebase discovery pass.
> **Scope:** Introduces HUB TOWER as the executive intelligence / governance / orchestration plane above all agents and modules.

---

## 0. The reframe (read this first)

HUB TOWER is **not a new module and not another agent.** It is the *read, reason, and govern* plane that sits above everything.

The most important finding of this review: **the architecture is already 70% of the way to HUB TOWER without realising it.** Three of its four foundations already exist in code:

| HUB TOWER needs | Already in the codebase | Status |
|---|---|---|
| A canonical data spine to read from | `factsService.mjs` + `jobFactRegistry.mjs` (~110 facts, provenance, `getJobProfile`) | Built — **but never read by any dashboard** |
| Sensors (health/score signals) | **26 scoring/health/forecast primitives** (margin, WIPAA, schedule health, procurement status, supplier perf, NPS, qualify score, …) | Built — **but never aggregated into a single score** |
| An execute-vs-advise authority line | Every AI service is already classed draft-only / advise-only / monitor-only (e.g. `procurementAiService` "never sends, never orders, never commits") | Built — **and exactly the line HUB TOWER must hold** |
| The brain that joins them + monitors + escalates | — | **This is HUB TOWER. The missing 30%.** |

So HUB TOWER is the productionisation and unification of patterns the system already has but hasn't connected. That is *why* it's the right next move, and why it's achievable without a rebuild.

**Challenge to the existing design (the user asked for this):** the biggest structural weakness today is not a missing feature — it is **data-truth fragmentation** (contract value lives in 4 places; client identity in 4; floor area in 3) combined with a **facts service that was built but is not consumed** (`getJobProfile()` is only called from a test endpoint). HUB TOWER's first job is to force the facts service to become the single read spine. If we add HUB TOWER *on top of* fragmented data, it will confidently report wrong numbers. **Fixing the read spine is therefore a precondition, not a follow-up.**

---

## 1. HUB TOWER Responsibilities

### Core principle
- **Specialist Agents = Execute.** They own a domain and change operational state.
- **HUB TOWER = Observe → Analyse → Coordinate → Improve.** It reads everything, scores everything, recommends, and escalates — and writes only to its *own* intelligence tables.

### 1.1 What HUB TOWER OWNS
HUB TOWER owns the **intelligence layer**, not operational data. Concretely, it owns these (new) tables — and *only* these:

| Table | Purpose |
|---|---|
| `project_health` | Per-project health score + category breakdown, snapshotted over time |
| `business_health_snapshots` | Company-wide daily KPI + health snapshot |
| `tower_signals` | Every issue/risk/opportunity HUB TOWER detects (typed, severity, status) |
| `tower_recommendations` | Suggested actions awaiting human decision (never auto-applied) |
| `tower_escalations` | Items requiring human attention, with owner + SLA |
| `tower_patterns` | Recurring-issue findings (Section 7) → candidate system improvements |
| `job_summaries` | Materialised per-job KPI cache (contract/cost/margin/claims) — the read substrate |

It also owns the **observation cadence**: the nightly/real-time jobs that refresh these.

### 1.2 What HUB TOWER MONITORS (read-only sensors)
Everything, via the facts service and the 26 existing primitives:
- **Per project:** schedule health (`calculateDashboard`), margin/WIPAA (`financeCCRoutes`), procurement status (`procurementStatus`), budget-vs-actual (`normalized_costs`), WHS compliance (`whs_site_profiles.status`), documentation completeness (facts coverage), client signals (NPS, portal activity, variations).
- **Per agent/module:** throughput, stuck items, silent failures (e.g. Buildexact labour sync failing with no error — see §3), draft backlog (un-actioned AI drafts), fact-confirmation backlog.
- **Per pipeline stage:** leads aging, tenders without movement, RFQs unanswered, POs overdue, invoices unmatched, claims unpaid.
- **Company-wide:** pipeline value, forecast revenue/margin, capacity, cashflow, marketing performance, compliance posture.

### 1.3 What HUB TOWER CAN ACCESS
- **Read access to all canonical facts** via `getJobProfile(jobId)` and the company profile.
- **Read access to all module tables** (jobs, projects, schedule_tasks, normalized_costs, procurement_items, financial_documents, suppliers, whs_*, leads, crm_*, marketing_*).
- **Read access to the AI-call log** (`ai_call_log`) and to event/audit streams (`job_events`, `contact_events`).
- **Write access to its own 7 intelligence tables only.**

### 1.4 What HUB TOWER CANNOT ACCESS / CANNOT DO
- **No write to any operational record.** It never edits a budget, schedule, variation, claim, PO, invoice, timesheet, lead stage, fact value, or contract value.
- **No external send.** No emails, no client comms, no PO issuance, no Buildexact pushes.
- **No fact confirmation.** It can *flag* a low-confidence/missing fact and *recommend* confirmation, but a human (or the owning agent under human gate) confirms it.
- **No bypass of consequence tiers.** Anything in the Canonical Data Law's "consequential" tier (money, client-facing, compliance, safety, consent) stays human-confirmed.

### 1.5 What HUB TOWER CAN RECOMMEND
- "Job 21 Folkstone forecast margin fell below floor (28%→24%) — review WIPAA."
- "Frame trade booked on 3 projects in the same week — capacity conflict."
- "PO for steel must be ordered by Fri or it slips the slab pour."
- "Lead 'Tanner' opened 7 emails + viewed 2 case studies — follow up now."
- "Supplier X is 11 days late on average across the last 6 orders — consider backup Y."
- "This estimate's framing rate is 16% above your benchmark for double-storey — check before tendering."

### 1.6 What HUB TOWER CAN ACTION AUTONOMOUSLY
A deliberately tiny surface — all **non-consequential, internal, reversible, and informational**:
- Compute and store health scores / signals / snapshots.
- Open/raise an internal **flag, signal, or escalation** (a notification, not a state change).
- Re-rank a "Follow Up Now" / "Requires Action" list.
- Mark its own signals resolved when the underlying condition clears.
- Trigger an *internal* recompute (refresh a snapshot).

That's it. Everything that touches the business stays a recommendation.

### 1.7 What REQUIRES human approval (unchanged, and HUB TOWER must respect)
Issuing POs · approving variations · signing contracts · approving payments/invoices · changing budgets · changing schedules · issuing client communications · confirming consequential facts · sending any external message.

> **Design rule (the single most important one):** HUB TOWER's *only* verbs against the business are **flag, score, recommend, escalate.** If a proposed HUB TOWER feature requires any other verb, it belongs in a specialist agent behind a human gate — not in HUB TOWER.

---

## 2. Agent Responsibility Matrix

Today the "agents" are **AI services bound to modules**, not autonomous domain owners. The review found 12 services with a clean execute-vs-advise line already enforced. The recommendation is to **formalise each domain as an Agent with a standard contract** (read facts → produce drafts/flags → never cross-write), and let HUB TOWER observe them.

### 2.1 The standard Agent contract (proposed)
Every specialist agent must: (a) read inputs via the facts service / its own tables; (b) write only to *its own* domain tables; (c) emit `job_events` for anything material; (d) keep all consequential outputs as **drafts behind a human gate**; (e) expose a health/throughput signal HUB TOWER can read.

### 2.2 Matrix (grounded in real services)

| Agent (domain) | Backing service / routes | Purpose | Inputs | Outputs | Authority | Limitations | Depends on |
|---|---|---|---|---|---|---|---|
| **Sales/CRM** | `salesRoutes`, `crmRoutes`, Blueprint (`blueprintRoutes`) | Run the APB pipeline, qualify, nurture, attribute | Leads, transcripts, CRM contacts, attribution events | Stage moves, qualify score, suggestions, campaign sends | **Advise** (Blueprint suggestions via review panel); execute on lead CRUD | AI never auto-moves stages | Facts (lead→job), Marketing attribution |
| **Estimating / Cost Intelligence** | `costIntelligenceRoutes`, `costIntelligenceEstimate`, `rfqTradeIntelligence` | Benchmarks, pre-tender estimates, budget seeding | Buildxact estimates, `normalized_costs`, `project_metrics` | Benchmarks, pretender ranges, seeded budgets | **Execute** (seeds budgets); **Advise** (estimate ranges) | Never overwrites locked `original_budget` | Facts, Buildxact, Procurement |
| **RFQ / Tender** | `module4Routes`, `rfqPackageRoutes`, `rfqTradeRoutes` | Build RFQ packages, send to subs, track quotes, issue POs | Job, trade plan, subcontractors | RFQs, quotes, POs (draft→issued) | **Execute behind gate** (PO issuance = human send) | Must not send PO without human action | Estimating, Procurement, Facts |
| **Procurement** | `procurementRoutes`, `procurementService`, `procurementAiService`, `procurementLearningService` | Plan procurement, track long-lead, learn supplier perf | Schedule tasks, templates, estimate, delivery ledger | Procurement items, draft order emails, supplier perf metrics | **Draft-only** (AI never sends/orders); **Execute** (learning writes derived perf) | "Drafts only… never commits anything" | Scheduling, Estimating, Suppliers |
| **Scheduling** | `scheduleRoutes`, `scheduleClaudePlan` | Generate + maintain Gantt, dependencies, baseline, EOT | Project type, building facts, Buildxact categories | Tasks, dependencies, ripple previews | **Advise** (generated plan needs approval before insert) | Doesn't read `project_metrics` building facts today (gap) | Facts, Operations, Procurement |
| **Operations** | `operationsRoutes`, `siteDiaryRoutes` | Run delivery: projects, site diary, site tasks, conflicts | Projects, schedule, employees, compliance | Progress %, diary, conflict detection | **Execute** (progress/diary) | Trade-conflict detection is O(n²) (scale gap) | Scheduling, Workforce, WHS |
| **Workforce** | `workforceRoutes` | Timesheets, crew, worker PWA, payroll export, Buildxact labour | Employees, timesheets, site tasks | Approved timesheets, Work Orders, CSV | **Execute** (approval); **Execute behind gate** (Buildxact push) | Buildxact labour sync fails silently (gap §3) | Operations, Finance, Buildxact |
| **Carpentry** | `carpentryRoutes` | Track carpentry sub-jobs: budgets, milestones, burn-rate | Job, estimate XLSX, timesheets, invoices | Budgets, costs, performance snapshot | **Execute** (cost tracking) | Costs siloed; not rolled into project margin (gap) | Finance, Workforce, Facts |
| **Finance / Command Centre** | `financeRoutes`, `financeCCRoutes`, `projectInsights` | Invoices, claims, variations, WIPAA, margin, insights | Invoices, budgets, variations, timesheets | Approvals, claims, signed variations, margin KPIs, insights | **Execute behind gate** (approve/pay/sign = human); **Monitor** (insights) | Insights: code decides thresholds, Haiku only writes text | Facts, Procurement, Workforce, Portal |
| **WHS** | `whs/whsEngineRoutes` | Risk profile, SWMS, inductions, incidents | Site questionnaire, schedule | Applicable SWMS/permits, compliance status | **Execute** (derived risk profile) | Generated, never hand-entered | Operations |
| **Marketing** | `marketingRoutes`, `marketingIntelligenceRoutes`, `marketingAgent`, `videoIntelligence` | Content gen, campaigns, attribution, SEO/GBP, video | Topic + project context, media, GSC/GA4/GBP | Draft content, story sequences, attribution, keyword tracking | **Draft-only** (brand-voice hard blocks); **Execute** (snapshots/exports) | Never publishes/sends directly | Sales (attribution), Facts |
| **Knowledge Core (Facts)** | `factsService`, `factsRoutes` | Single source of truth for canonical facts + provenance | Fact writes from all agents | Canonical facts, history, events; `getJobProfile` | **Execute** (canonical lifecycle); consequential facts gated | Confirm Queue UI not built (gap §6) | All agents |
| **HUB TOWER** *(new)* | *(new service)* | Observe, score, recommend, escalate, improve | All facts + 26 primitives + events + AI log | Health scores, signals, recommendations, escalations, patterns | **Flag/score/recommend/escalate only** | No operational writes, no sends, no fact confirmation | Everything (read) |

### 2.3 Overlap / duplication / conflict / gaps (what the matrix exposes)
- **Overlap — cost intelligence vs procurement vs finance** all touch trade cost truth (`normalized_costs`, budgets, supplier perf). Today they read each other's tables directly. **Resolve via facts + `job_summaries`**, not point-to-point reads.
- **Duplication — contract value computed in 3 services** (module5 mirror column, financeCC `getCanonicalContractValue`, portal raw read). One generated fact should win; others read it.
- **Conflict — Scheduling vs Procurement own "dates"** (task start dates vs required-on-site dates). Procurement reads schedule on *manual regenerate only* → drift. Needs an event-driven link.
- **Gap — no agent owns "the project as a whole."** Each agent sees its slice; nobody scores the project. **That is exactly the HUB TOWER role.**
- **Gap — Carpentry is a parallel finance universe** (`carpentry_job_costs` not rolled into project margin). HUB TOWER's `job_summaries` should unify it.
- **Gap — silent failures have no owner** (Buildexact labour sync). HUB TOWER's job-health "integration" signal is the natural home.

---

## 3. Data Flow Review — Lead → Completion

Mapped through the real code. ✅ = works · ⚠️ = friction · ❌ = broken/missing.

```
Lead ──convert-to-job──▶ Job ──fee-proposal-accept──▶ Project ──generate──▶ Schedule
  │  facts stamp fwd ✅     │  creates projects row ✅    │                     │
  │                         │  contract value set ✅      │  doesn't read       │
  │                         │  BUT projects row only      │  building facts ❌  │
  │                         │  created HERE, not at win ❌│                     ▼
  │                                                        Schedule ──▶ Procurement (manual regen ⚠️)
  ▼                                                                         │
Marketing attribution ✅                                                    ▼
                                                          Procurement ──▶ Finance (no invoice↔item link ❌)
                                                                            │
                                                          Workforce ──▶ Buildexact labour (NULL ids, silent fail ❌)
                                                                            │
                                                          Finance ──▶ Portal (variations not shown to client ❌)
                                                                            │
                                                          Completion (no automated recognition ❌)
```

### 3.1 Duplicate data entry (re-keying facts that already exist)
1. **Qualify scores** typed into the lead form after Blueprint already extracted them.
2. **RFQ scope / floor area / site conditions** — re-typed in the RFQ form although the facts exist in `project_metrics`/`job_fact_history`. *Highest-value fix.*
3. **Carpentry job form** re-enters project type / floor area instead of reading facts.
4. **Invoice trade category** inferred fresh each time rather than linked to the procurement item it pays for.

### 3.2 Data-truth fragmentation (the core risk)
| Fact | Lives in | Should be |
|---|---|---|
| Contract value | `jobs.original_contract_value`, `projects.contract_value`, generated fact, portal read | **One generated fact**; all read it |
| Client identity | `leads`, `jobs.client_*`, `crm_contacts`, sometimes `carpentry_jobs` | Party spine + facts |
| Address | `jobs.address`, `projects.address` (copy) | Job fact; project reads |
| Floor area | `jobs`, `project_metrics`, `cost_intelligence` | One fact |
| Buildexact job/employee id | `projects`, `employees` (often NULL) | One fact, backfilled + validated |
| Trade category | `schedule_tasks.trade` (text), `trade_categories` (canonical), `rfqs.trade_category_id` (often NULL) | FK everywhere; stamp on RFQ |

### 3.3 Missing integrations
- **Schedule → Procurement**: no event when schedule changes; procurement dates silently stale.
- **Procurement → Finance**: invoice not linked back to the procurement item it pays (no buy-vs-actual reconciliation).
- **Finance → Portal**: `job_variations` not surfaced in the portal (client sees stale contract total).
- **Workforce → Buildexact**: labour posting fails silently on NULL ids — *no error logged, no badge.*
- **Carpentry → Project financials**: parallel cost universe, no unified margin.

### 3.4 Approval & information bottlenecks
- **`projects` row not auto-created at win** → Operations is blind until someone manually creates it. (Should fire on `jobs.status='won'`.)
- **No "project created / next step" confirmation** after convert-to-job.
- **Stage gates fail silently** (LeadDetail) — user doesn't see *which* field blocks advancement.
- **Procurement regenerate is hidden** — no "schedule changed, refresh plan" banner.
- **Silent Buildexact sync failures** — assume-success failure mode.

> **HUB TOWER's role here:** it does not fix these flows (the agents do) — but it is the layer that **detects and surfaces every one of them** as a typed signal: "Job won 3 days ago, no project/schedule created", "Schedule changed, procurement plan stale", "Labour sync failing on 4 jobs". The fixes are agent work; the *visibility* is HUB TOWER.

---

## 4. Project Health Framework

Build the single score **on top of the 26 existing primitives** — no new measurement, just aggregation. All primitives are keyed to `job_id` and (except `cost_benchmarks`) real-time computable.

### 4.1 Category sub-scores (0–100 each) and their real data sources

| Category | Weight | Computed from (existing primitives) | "Red" trigger examples |
|---|---|---|---|
| **Financial** | 30% | `working_margin_pct` / `forecast_margin_pct` vs `target/floor_margin_pct`; `budget_vs_actual_pct` (normalized_costs); WIPAA `pct_complete`; labour burn-rate status | Forecast margin < floor; budget overrun > 10% |
| **Schedule** | 25% | `calculateDashboard()` — completion % vs planned %, overdue count, critical-path float, baseline drift | Behind plan > 10%; critical task overdue |
| **Procurement** | 15% | `procurementStatus()` per item (green/amber/red); supplier `on_time_rate` | Any long-lead item past order-by date |
| **Compliance / Safety** | 12% | `whs_site_profiles.status`; `whs_documents.is_stale`; inductions vs active trades; open incidents | WHS profile incomplete; SWMS stale; un-inducted trade on site |
| **Documentation / Data** | 8% | Facts coverage (% of registry facts confirmed for this job); confirm-queue backlog; missing buildexact id | Consequential facts unconfirmed; contract value unverified |
| **Client** | 5% | NPS (`job_nps_scores`); portal activity; variation approval latency; days since last client update | NPS ≤ 6; unapproved variation aging |
| **Capacity / Delivery** | 5% | Trade-conflict exposure; crew allocation vs schedule demand | Trade double-booked across projects |

### 4.2 The single score
`project_health = Σ(category_score × weight)`, banded:
- **80–100 Healthy (green)** · **60–79 Watch (amber)** · **<60 At-risk (red)** · plus **hard-fail overrides** (any safety incident, margin below floor, or overdue compliance forces red regardless of weighted total).

### 4.3 Mechanics
- Stored in **`project_health`** with the category breakdown + a JSON of the contributing signals, **snapshotted nightly** (so trend-over-time and "score dropped 12 points this week" alerts work).
- Recomputed in real time on material events (invoice approved, variation signed, task completed, WHS profile saved) — these already emit or can emit `job_events`.
- Exposed at `GET /api/tower/projects/:id/health` and as a badge on every project card / command centre.
- **Explainable by construction:** the score always drills into the category, then the primitive, then the row — never a black box.

---

## 5. Business Health Framework

A company-wide daily snapshot (`business_health_snapshots`) rolled up from the same primitives + pipeline tables. The 9 categories the user listed, mapped to real sources:

| Panel | Source | Headline metric | Risk signal |
|---|---|---|---|
| **Lead pipeline** | `leads` by stage, qualify scores, speed-to-lead (`first_replied_at`) | Pipeline value, avg speed-to-lead | Speed > 1h (APB target); aging leads |
| **Tender pipeline** | jobs in tender, fee proposals, win rate | Tender value, conversion % | Tenders stalled, low win rate |
| **Revenue forecast** | Σ contract values (won + weighted pipeline) | 3-month rolling revenue | Forecast vs target gap |
| **Margin forecast** | Σ `forecast_margin_pct` across active jobs | Portfolio forecast margin | Jobs below floor; margin erosion trend |
| **Procurement status** | `procurement_items` at-risk across all jobs; supplier perf | At-risk long-lead count | Critical items overdue; failing supplier |
| **Operations capacity** | trade demand from schedules vs crew/sub availability | Utilisation %, trade conflicts | Over-allocation; conflict clusters |
| **WHS / compliance** | `whs_site_profiles.status`, incidents, inductions | Compliant-site % | Any incomplete profile / open incident |
| **Marketing performance** | attribution, `content_performance`, GSC/GBP snapshots | Enquiries this month, attributed value | Channel decline; ranking drop |
| **Cashflow** | claims issued vs paid, invoice aging, retainage (WIPAA) | Cash position trend | Unpaid claims > 30d; underclaim alert |

**Director view:** "Today's Tower" — top 5 escalations across the business, projects ranked by health (worst first), the 3 biggest risks by category, and "what changed since yesterday." One screen, 30-second read (the "Josh test").

---

## 6. Scale Review — 5 → 50 active projects

The discovery pass found that **HUB TOWER cannot be built on live aggregation** — the current portfolio dashboard already does 50× query storms and would take **15–20s at 50 projects.** HUB TOWER is read-heavy by definition, so it *must* sit on a materialised substrate that it refreshes on a cadence.

### 6.1 Architecture weaknesses (real, with files)
| Weakness | Location | Breaks at 50 | Fix |
|---|---|---|---|
| Portfolio fires 50× `/finance/jobs/:id/summary`, each 5+ scans | `JobDashboardSelector.jsx`, `financeCCRoutes.mjs:300` | 15–20s timeout | **`job_summaries` materialised view** (nightly + event refresh) |
| Global Gantt loads all ~2,000 tasks unpaginated | `operationsRoutes.mjs:70` | 10MB JSON, OOM | Pagination + server-side filter |
| Trade-conflict detection O(n²) in JS | `operationsRoutes.mjs:88` | 2M comparisons, 20s | SQL range-overlap / materialised conflict table |
| `getJobProfile()` never called in production | `factsRoutes.mjs` only | Facts spine unused; reads stay fragmented | Wire into Tower + KPI reads |
| Confirm Queue stubbed (no UI/endpoint) | `factsService.mjs` | Consequential facts stuck `extracted_flagged` | Build `/api/facts/pending` + queue UI |
| WIPAA cron is manual POST, no email/escalation | `dev-api.mjs:1535` | Reviews silently slip > 30d | Auto-cron + escalation (a Tower job) |

### 6.2 Missing indexes (add immediately — cheap, high impact)
```sql
CREATE INDEX job_fact_history_job_fact_key ON job_fact_history(job_id, fact_key);
CREATE INDEX normalized_costs_job_id      ON normalized_costs(job_id);
CREATE INDEX financial_documents_job_status ON financial_documents(job_id, status);
CREATE INDEX schedule_tasks_proj_del_start ON schedule_tasks(project_id, deleted_at, start_date);
CREATE INDEX progress_claims_job_id       ON progress_claims(job_id);
```

### 6.3 Automation HUB TOWER requires (and that scale demands anyway)
- **Nightly Tower batch:** refresh `job_summaries`, recompute `project_health` + `business_health_snapshots`, run pattern detection (§7), age all signals.
- **Event-driven micro-refresh:** on `job_events` (invoice approved, variation signed, task done, WHS saved) refresh just that job's summary + health.
- **Auto-cron** for WIPAA reviews, invoice aging, schedule baseline-drift, completed-project archive — *with* notifications + escalation.

### 6.4 Agent changes required at 50
- Agents must **emit `job_events`** for every material change (so Tower refreshes incrementally instead of re-scanning).
- Reads must go through **facts / `job_summaries`**, not cross-module table scans.
- Every list endpoint gets pagination; every dashboard reads a snapshot, not a live recompute.
- The Carpentry parallel-cost universe folds into `job_summaries` so margin is unified.

> **Verdict:** the system is *moderately* ready for 10×. The blockers are well-defined and finite (indexes + materialisation + pagination + wiring the facts spine). HUB TOWER and the 50-project hardening are **the same project** — the materialised read plane Tower needs is exactly what scale needs.

---

## 7. Continuous Improvement Framework

The model already exists in miniature: **`procurementLearningService`** learns supplier lead times from the actual delivery ledger (deterministic, derived, never hand-edited). HUB TOWER generalises that pattern across every domain.

### 7.1 The loop
```
job_events / outcomes  ──▶  Pattern detection (deterministic + periodic AI summarise)
        ▲                              │
        │                              ▼
   System change                tower_patterns  (recurring issue, frequency, $ impact, evidence)
   (agent/config)                      │
        ▲                              ▼
   Human approves  ◀──  tower_recommendations  ("change X to prevent Y")
```

### 7.2 What it watches for (and the real signal it uses)
| Recurring problem | Detected from | Example improvement it recommends |
|---|---|---|
| Cost overruns by trade | `normalized_costs` vs `cost_benchmarks` overrun frequency | "Raise framing allowance +8% for double-storey; you've overrun 5/6 times" |
| Schedule delays by phase | baseline drift in `schedule_tasks` | "Lock-up consistently slips 6 days — extend template duration" |
| Procurement failures | `supplier_lead_observations`, at-risk items | "Steel is late 4/6 — make backup supplier the default for steel" |
| RFQ issues | unanswered RFQs, NULL `trade_category_id` | "Tiler RFQs go unanswered — refresh the sub list" |
| Supplier issues | `suppliers.on_time_rate` trend | "Supplier X dropped to 55% on-time — review or replace" |
| Workflow failures | events that *should* follow but didn't (won→no project; schedule→stale procurement; timesheet→failed sync) | "Auto-create project on win"; "alert on stale procurement" |

### 7.3 Output discipline
Every finding is a **`tower_pattern`** with frequency + estimated $ impact + linked evidence, promoted to a **`tower_recommendation`** for a human. **No pattern auto-changes the system.** The deterministic-first rule holds: arithmetic and thresholds in code; AI (Haiku) only writes the human-readable narrative for findings the code already identified — exactly as `projectInsights` does today.

---

## 8. Recommended build sequence (so this is actionable, not just a vision)

1. **Spine first (precondition).** Add the §6.2 indexes; wire `getJobProfile()` into reads; ship `job_summaries` (materialised) + the event-emit discipline. *Without this, Tower reports wrong numbers slowly.*
2. **Sensors.** Standardise the 3 missing sub-scores (schedule/procurement/financial health) from existing primitives; build `project_health`.
3. **Tower core (read/flag).** `tower_signals` + the detection of the §3 bottlenecks; "Today's Tower" director view.
4. **Business health.** `business_health_snapshots` + the 9-panel dashboard.
5. **Escalation + cron.** Auto-cron with notifications/escalation (WIPAA, aging, drift).
6. **Continuous improvement.** `tower_patterns` + recommendation queue.
7. **Confirm Queue.** Build the fact-confirmation UI so the consequential-fact tier actually closes the loop.

Each phase is independently valuable and ships behind the existing human-approval guardrails.

---

## 9. Assumptions challenged (as requested)

- **"Add HUB TOWER on top of what's there."** → Only *after* the read spine is real. Tower on fragmented data is a confident liar. Fix facts-consumption first.
- **"Agents are autonomous."** → They're module-bound services today. Formalise the agent contract (read facts, write own tables, drafts-behind-gate) so Tower has clean things to observe.
- **"Health is per-module."** → No module owns the *project*. That ownership gap is the strongest argument for HUB TOWER.
- **"Scale is later."** → Scale-hardening and HUB TOWER are the same materialised-read-plane project; do them together.
- **"More automation = better."** → The win is *visibility + recommendation*, not more autonomous action. The execute-vs-advise line is the moat; HUB TOWER must never cross it.
