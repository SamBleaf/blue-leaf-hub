# Blue Leaf Building — WHS Readiness Report: Can the Hub Replace Hazard Co?

*Prepared 28 July 2026 · Scope: run all WHS inside the Blue Leaf Hub, one shared codebase serving both the Operations (projects) and Carpentry modules · Grounded in a four-part code audit + SA legal research, spot-verified against the live repo at `~/Desktop/blue-leaf-hub.nosync` and reviewed by two adversarial passes (a SafeWork-SA/WHS-lawyer lens and a completeness lens).*

> **This is informational, not legal advice.** It reflects the WHS Act 2012 (SA), WHS Regulations 2012 (SA) and SafeWork SA guidance as at 28 July 2026, including the confirmed 1 July 2026 lowering of the high-risk-construction-work (HRCW) fall threshold to **>2 m**. Before you rely on it to drop a compliance product, a WHS professional and/or SafeWork SA must confirm the legal-minimum mapping and review the Hub's generated documents. Several load-bearing items below (SDS register, White Card capture, notifiable-incident handling, template legal currency) are **not code-verifiable** — they rest on the SA legal mapping, which itself needs professional sign-off.

---

## 1. Executive summary — read this first

**Verdict: Do not cancel Hazard Co. Run both in parallel.** And be clear about *why*, because the draft framed the wrong decision.

This is **not** "is the Hub feature-complete." It is: *will the decision to stand down a working third-party assurance system, and self-certify on a half-built replacement, survive (a) an incident investigation, (b) an insurer's indemnity review, and (c) a head contractor's contract/prequalification audit?* On that framing the honest answer today is **no**, for reasons that sit **above** any feature list:

- **Personal criminal liability (WHS Act s27).** Sam and any other officer have a personal, non-delegable duty of due diligence. Voluntarily replacing a functioning compliance system with a self-built tool that is a fraction ready, carries placeholder legal content ("clause TBC"), hardcodes worker acknowledgements, and has had no professional review is the textbook fact pattern for a due-diligence failure. After any serious incident, *the decision to cancel* becomes the first exhibit — against the officer personally, not just the company.
- **Insurance and contract survival.** Public-liability / contract-works policies carry "reasonable precautions" and "comply with statutory obligations" conditions; a system that produces records *inconsistently* is a live indemnity-denial argument. Separately, head-contractor contracts (BLH's core trade is carpentry-as-subcontractor) routinely *require* a documented WHS system, current SWMS and inductions — and many principals mandate a recognised prequalification platform (Hazard Co, Rapid Global, Avetta, LinkSafe) as a **condition of site access**. If any of BLH's builder-clients do, the Hub cannot replace Hazard Co regardless of feature parity.

Against that, the **build status** is: a genuinely strong *architectural* spine on the operational side, but readiness-to-cancel that is **low and gated** — capped by its weakest legal blocker, not averaged. Multiple legal-minimum items have **no home in the Hub at all** (hazardous-chemicals/SDS register; silica & asbestos air/health monitoring and long-dated retention; White Card / worker-credential capture; notifiable-incident handling; toolbox/consultation records; daily sign-on). The one part the draft called "strong" — inductions — currently **records acknowledgements the worker never actually gave** (hardcoded `true`) against SWMS PDFs that often **can't be opened**, in tables **any logged-in user can edit or delete with no audit trail**. That layer does not yet produce records an inspector or court would rely on.

**Honest readiness to safely cancel: ~20% (gated).** The underlying architecture is further along than that in places — but a compliance-cancel decision is capped by its weakest legal item, and several are at zero. The good news the draft got right: the hardest *architecture* (enter-once profile, pure rule engine, merge/render, spine-agnostic helpers, a proven dual-FK pattern to copy) is already built, so most of the remaining work is **wiring and hardening, not invention**.

---

## 2. The three gates that sit above the build

These must be cleared **regardless of how far the Hub gets**, and mostly **before** relying on it. They are not software tasks.

**Gate 1 — Officer due-diligence sign-off (s27).** No cancellation until an officer can state, *in writing*, the competent basis on which the replacement is adequate: who the competent WHS person is, what they reviewed, and what verification the officer relied on. "We built our own" is not a defence; "a competent WHS professional certified our system meets the SA legal minimum, and we verify it in use" is.

**Gate 2 — Insurance + contract clearance.** In writing, before cancelling: (a) broker/insurer confirm that dropping Hazard Co and self-certifying does **not** affect PL / contract-works indemnity; (b) BLH's head-contractor contracts are checked for a clause requiring a WHS management system / SWMS / inductions on demand; (c) **check whether any builder-client mandates Hazard Co or an equivalent prequalification platform for site access** — this can be a hard commercial blocker independent of the regulator.

**Gate 3 — A permanent owner for legal currency.** Cancelling Hazard Co is not deleting a product; it is **insourcing a permanent function**. Hazard Co maintains its templates as the law changes (the 1 July 2026 >2 m change is a live example). An in-house Hub with placeholder clauses and no legal-update owner will silently drift out of compliance with each amendment. Name the owner (internal capacity or a retained consultant) and the review cadence *before* you depend on it. The current `"clause TBC"` content is direct evidence BLH is not yet resourced for this.

Until all three gates are cleared, the readiness score below is moot — the decision fails at the gate, not the feature list.

---

## 3. What the Hub's WHS actually does today

The module is **two systems that share a name.** Being precise about which is which changes the picture completely.

### 3A. Site-level operational layer — built end-to-end, but the records are currently weak-to-void

Wired through, technically:

- **Public QR inductions** — `SiteInduction.jsx` (route `/induct/:projectId`, no auth) → `inductionRoutes.mjs` builds a signed PDF (`buildInductionPdfBuffer`), files to Dropbox (`WHS/INDUCTIONS`), inserts a `site_inductions` row.
- **Incident / near-miss / hazard reporting** — `WhsManager.jsx` → `whsRoutes.mjs` POST `/reports`, photos to Dropbox, incident PDF (`buildIncidentReportPdfBuffer`), inserts `site_reports` (5 types), open→resolved workflow.
- **Subcontractor compliance** — Contractors tab lists subs with a PO on the project, each doc shows a live status (`complianceStatusFromExpiry`, 30-day window), uploads to Dropbox + `contractor_compliance`.

**But the evidentiary integrity of this layer is broken today, and that is a P0 finding, not polish:**

- **Acknowledgements are fabricated, not captured.** `siteRulesAcknowledged` and `swmsAcknowledged` are hardwired `true` in `SiteInduction.jsx:163-164`. Every induction record the Hub has produced asserts the worker acknowledged the site rules and the SWMS *whether or not they did*. The moment an inspector learns the flag is a constant, **every** induction record loses evidentiary value and BLH is exposed to an allegation of creating misleading WHS records. This actively manufactures liability on the one layer the draft called "strong."
- **Any user can silently alter or delete any WHS record.** `whs_site_profiles` and `whs_documents` carry `FOR ALL TO authenticated USING (true) WITH CHECK (true)` RLS (`064_whs_engine.sql`) — no role scoping, no append-only, no audit trail. "Immutability" is convention, not enforcement.
- **Inductions reference SWMS that can't be opened** (`pdf_path=null` on stub `swms_templates`), and are **not version-locked** — you cannot prove *which* version of the rules or SWMS a given worker saw.
- **No worker/employee link.** `site_inductions` (mig 010) has no `employee_id`/`worker_id`/`user_id` column — no per-worker induction history, no "is this worker inducted here" gate, and no natural home for White Card capture.

A record that asserts acknowledgements that never happened, references documents that can't be opened, and can be edited after the fact by anyone is not a record that survives scrutiny. **This layer's *architecture* is ~60% there; its *legal readiness* is ~40%.**

### 3B. WHS document / risk engine — a real spine, Phase-1 only, and one live hazard

The hard architectural work is done and reusable — and it is *not* stubbed:

- Questionnaire → risk → derived outputs is real: `WHS_QUESTIONNAIRE` (11 modules) → `deriveOutputs()` (genuine 20-rule pure engine, `whsRiskRules.mjs`) → versioned `whs_site_profiles`, flags non-approved docs stale on save.
- Level-1 prefill works (`getJobProfile`), auto-builds the induction QR URL.
- Merge + render is complete: `buildMergeContext()` (~70 fields), `renderTemplate()`, `syncProjectSwms()` bridges derived SWMS into the induction SWMS list.

**Everything past Phase 1 is unbuilt or diverged:**

| Claimed / expected | Reality in code |
|---|---|
| ~23 generatable templates | **1** wired (`project_whs_management_plan`). `POST /generate/:templateKey` returns *"Unknown template"* for the rest. |
| Locked, immutable PDF output | **Markdown only.** No PDF, no lock. RLS `authenticated ALL`. |
| Draft→review→approve→locked→sign-on | **No endpoint ever sets `approved`.** The stale-guard therefore protects nothing. |
| SWMS worker sign-on / register rows | **Explicitly deferred** in `whsRenderer.mjs` — tables render `[to be completed: …]`. |
| "Module 0 pre-selects Module 5 HRCW" | UI copy the code doesn't honour — only asbestos (`m0_pre_1990`) feeds a rule; demolition/structural-steel/suspended-slab/steep-site do not auto-set m5. **Most misleading gap on a safety module.** |
| Outputs land in shared `job_documents` | Diverged: a parallel `whs_documents` table; `job_documents` never written by the engine. |
| Incident / expiry notifications | **Zero.** `whsRoutes.mjs` has no notify/mail calls. `contractor_compliance.reminder_sent_at` is **dead** for WHS (only RFQ code writes it). |
| Legal grounding | Placeholder — `codeRefs` literally `"clause TBC"`; templates marked draft. |

**The one live template is itself a hazard, today.** `project_whs_management_plan` generates *now*, but on placeholder clauses. A WHS management plan issued with incorrect/placeholder clauses is arguably **worse than none** — it creates false assurance and can itself evidence a failure to properly assess risk. **Stop issuing it to a real site until it is legally reviewed** — this is a stop-now item, not a backlog item.

**Engine functional/legal readiness: ~10–15%** (architecture ~38%). It cannot emit a single legally-usable document today.

**Field app: the biggest true stub.** `FieldWHS.jsx` is 42 lines — a site-picker that deep-links to the desktop `WhsManager`; its own footer admits in-app WHS generation "is coming." No field-native incident logging, no on-site SWMS view, no toolbox sign-on, and **no offline** — which is a hard requirement for remote SA sites that lose signal, and where the existing PWA already has reusable on-device patterns.

---

## 4. The carpentry integration gap — and the shared-code fix

### Why carpentry sites are uncovered today (~3% — effectively zero)

The engine is **exclusively project-scoped at every layer**, and carpentry lives on a different spine:

- **Schema** — `whs_site_profiles.project_id` and `whs_documents.project_id` are `NOT NULL REFERENCES projects(id)` (`064_whs_engine.sql`); `site_reports`, `site_inductions`, `project_swms` are all `project_id NOT NULL`. **A carpentry job physically cannot store a WHS row.**
- **Routes** — every endpoint is `/api/whs/projects/:projectId/*`, every query `.eq('project_id', …)`.
- **UI** — all under `/operations/:projectId/…`. `CarpentryJobDetail.jsx` tabs are `[overview, schedule, diary, costs, budget]` — no WHS. `carpentryRoutes.mjs` (2,295 lines) has **zero** whs/swms/induction references. Carpentry's only "safety" surface is a `site_tasks.category='safety'` **tag** — not a WHS record.

This is the trade BLH does **most**, frequently as the subcontracted carpenter doing >2 m fall work, propping and load-bearing demolition — where BLH must prepare its **own** SWMS. Cancelling without fixing this leaves that work with no SWMS, no induction, no incident register, no compliance view.

### The fix — one engine, keyed to *project OR carpentry_job* (dual-FK)

The engine layer is already spine-agnostic and reusable as-is: `deriveOutputs()`, `WHS_QUESTIONNAIRE`, `buildMergeContext()`/`renderTemplate()`, `swms_templates` (trade-keyed, no project FK), `buildIncidentReportPdfBuffer` (takes an address string), `complianceStatusFromExpiry`, the Dropbox helpers. **No engine rewrite is needed** — the work is at the schema key, the route resolver, and the UI mount.

**Recommended: dual-FK (Option A), copying a pattern the repo already ships** — `workforce_allocations_job_spine_xor` (`117_workforce_allocations.sql`):

```sql
CHECK ( (project_id IS NOT NULL AND carpentry_job_id IS NULL)
     OR (project_id IS NULL AND carpentry_job_id IS NOT NULL) )
```

Precedent is repeated: `site_tasks` (mig 068), `timesheets.carpentry_job_id` (mig 065).

**Concrete work:** (1) migration adds `carpentry_job_id` + XOR check to `whs_site_profiles`/`whs_documents`/`site_reports`/`site_inductions`/`project_swms`, replaces the inline `UNIQUE(project_id)` with two partial unique indexes; (2) one spine-aware resolver (`resolveSpine`) parameterises the `.eq()` calls; (3) WHS tab on `CarpentryJobDetail.jsx` + badge on `CarpentryDashboard.jsx` (reuse `WhsManager`/`WhsEngine` with a spine prop), teach `FieldWHS.jsx` to list carpentry jobs, add `/induct/carpentry/:carpentryJobId`; (4) extend the `opsReadiness.mjs` (~L203) check to the carpentry spine.

**Two deeper gaps a schema key won't close:**

- **Contractor compliance for carpentry.** Carpentry jobs have **no `purchase_orders`** and no `subcontractor_id` — carpentry subs are free-text `carpentry_job_costs (cost_type='subcontract')`. The compliance view is assembled *through* `purchase_orders.project_id`, so it's unbuildable for carpentry after the key is added. **This is a live s19/s46 hole today** (see §5): when BLH engages those subbies it is a PCBU with duties to their workers and no mechanism to verify their competency, insurance, White Cards or SWMS — and it worsens the instant Hazard Co (which *does* collect contractor docs) is gone. Needs a real carpentry-sub credential store linked to `subcontractors`.
- **Risk-engine prefill degrades.** Module-0 construction facts come from `project_metrics` + `getJobProfile(project.job_id)`; carpentry jobs are off the Job/facts spine, so those inputs return blank and auto-derivation of SWMS/HRCW silently weakens. Mitigate by capturing those facts directly in the carpentry questionnaire (already Confirm/Override `FactField`s) or from `carpentry_jobs` geocode facts.

---

## 5. Legal minimum in SA — mapped to Hub coverage

Obligation → does the Hub cover it → the gap. **P0** = legal blocker for cancelling; **P1** = strongly recommended / evidentiary strength; **P2** = genuine nice-to-have. Reg numbers are indicative — confirm exact SA cites on review.

| SA obligation (WHS Act/Reg 2012 SA) | Applies to BLH | Hub today | Gap | Tier |
|---|---|---|---|---|
| **Officer due-diligence** (Act s27) | Always (personal, criminal) | None — no officer-facing "is our house in order" evidence view | Non-delegable; must be evidenced before cancel. See Gate 1 | **P0** |
| **Primary duty of care** (manage risk SFAIRP, hierarchy) | Always | Partial — questionnaire + 20-rule engine, projects only | Carpentry uncovered | **P0 (carpentry)** |
| **Consult, cooperate & coordinate** with other duty holders (Act s46) + **consult workers** (s47–49) | Always; s46 central to carpentry-as-sub | **None** — no consultation capture, no artefact for receiving the head contractor's site rules/SWMS | A SWMS must be *prepared in consultation with the workers doing the work* — a questionnaire-derived SWMS no crew discussed is **non-compliant however it's generated**. Multi-PCBU coordination has no home | **P0** |
| **White Card** for every worker/self-employed carpenter | Always | **None** | No worker-credential capture anywhere; no worker↔induction link | **P0** |
| **Site-specific SWMS before each HRCW** (falls >2 m from 1 Jul 2026, propping, load-bearing demolition, etc.) | Core trade — unavoidable | Partial — engine *derives* the SWMS set; only 1 (non-SWMS) template generatable; 10 SWMS not wired; sign-on deferred; stub SWMS have no PDF | Wire the carpentry-relevant SWMS + attachable/generated **PDF** + real, consulted, worker-signed sign-on | **P0** |
| **Verify subcontractor competency/insurance/SWMS** you engage (Act s19) | Whenever BLH engages carpentry subs | **None** for carpentry (free-text cost rows) | Live hole today; worsens on cancel | **P0** |
| **Notify SafeWork SA of notifiable incidents immediately (Act s38) + preserve the scene (s39)** | Always | Partial — incident logged + PDF | **No notification, no notifiable determination, no scene-preservation prompt.** Strict-liability offences. Software can't judge notifiability at 2am — a competent human must (see §9) | **P0** |
| **Hazardous chemicals register + SDS**, accessible to workers | In practice yes (adhesives, sealants, fuels, treated timber) | **None** | No register, no SDS store | **P0** |
| **Silica (RCS) + asbestos: air monitoring, health monitoring, and record retention (up to 30 yrs)** | Yes — fibre-cement/masonry cutting (RCS); pre-1990/pre-2004 renovation (asbestos) | **None** — silica/RCS and asbestos exist only as questionnaire *inputs* | No air/health-monitoring store, no 30-yr retention, **no asbestos register** (Reg ~425) / management plan / clearance. Regulator's post-2024 silica focus makes this glaring | **P0** |
| **Record integrity + retention/legal-hold** (SWMS until work done, 2 yrs if notifiable; notifiable-incident records 5 yrs; health monitoring 30 yrs) | Always | Partial — files to Dropbox, `authenticated ALL` RLS, no quarantine | Records can be edited/deleted by anyone, no audit trail, no legal-hold. The Hub cannot currently *guarantee* retention or tamper-evidence | **P0** |
| **First aid + emergency plan** (incl. **fall-arrest / suspension-trauma rescue plan**, Reg ~43) | Every workplace; rescue plan whenever harnesses used | Partial — captured in questionnaire (m2/m3), feeds only the one un-generatable template | Must be an **accessible site artefact**, not a buried questionnaire answer. Rescue-in-minutes is mandatory when fall-arrest is a control — this is *not* an edge case | **P0/P1** |
| **Written WHS Management Plan** — when PC on a construction project **≥ A$450,000** (SA-specific; SA differs from the $250k model figure) | Conditional — BLH's larger own builds | **Yes (nearest 1:1)** — engine generates it, but on `"clause TBC"` and markdown-only | Needs legal review + PDF/lock; stop issuing until reviewed | **P1** (build) / **P0** (stop issuing current) |
| **Hazardous manual tasks** risk management (Reg ~60) | Carpentry high-exposure (packs, sheets, postures) | **None** | No manual-task risk assessment / safe-work-procedure surface | **P1** |
| **Noise** management (Reg ~56–58) + **audiometric health monitoring** | Nail guns, saws, compressors routinely >85 dB(A) | **None** | No noise assessment or audiometric-monitoring store | **P1** |
| **Site induction / hazard communication** | Always (formal induction not mandatory on residential) | **Yes** end-to-end — but see §3A record-integrity defects | Fix fabricated acks + version-lock + openable SWMS before relying | **P0 (fix)** |
| **Notifiable-incident record retention (5 yrs)** | After any notifiable incident | Partial — `site_reports` persists | No retention/quarantine/notifiable flag | **P1** |
| **PPE provided + maintained** | When PPE is a control | Partial — `MANDATORY_PPE` in merge context | No tracking; informational only | **P2** |
| **Plant/equipment + high-risk-work licences + electrical (test-and-tag of leads/RCDs)** | When licensed-class plant / leads used on site | **None** | No plant/vehicle pre-start, no licence capture, no test-and-tag register | **P2** |
| **PC site signage** (name, 24h contact, office) | Conditional (≥$450k, PC) | None | No signage artefact | **P2** |
| **SA environmental: extreme heat + UV/SunSmart** | Outdoor trade, SA summers 40 °C+ | None | No heat/UV control artefact (SafeWork SA has explicit heat guidance) | **P2** |
| **Young workers / apprentices** heightened supervision; **labour-hire** dual-PCBU duties | Carpentry runs on apprentices | None | No supervision/labour-hire seam | **P2** |

---

## 6. What to simplify — build the thin legal spine, not the 23-template suite

The engine is architected for a 23-template, 11-module suite. A small SA residential builder/carpenter does not need most of it, and over-scoping is why the engine is stuck at one live template.

- **Wire the ~5–8 SWMS that carry legal weight, not all 23 templates.** For BLH's trade: **working at heights (>2 m)**, **roof work** (distinct from frame — fragile/brittle roof, penetrations, anchor points), **temporary bracing / truss erection** (frame-collapse and truss-dominoing during erection is a distinct fatality mode), **temporary propping / load-bearing demolition**, **power-tool RCS/silica cutting** (dominant carpentry source is **fibre-cement sheet**, plus **hardwood dust as a listed carcinogen** — RPE/extraction + health monitoring attach), **nail guns / powder-actuated tools** (the most common serious penetrating carpentry injury; also needs competency records), **manual handling**, and **electrical / test-and-tag + overhead-powerline strike**. Permits (hot work, excavation) and most of the 7 registers are edge cases — build on demand.
- **The "content corpus is ready to wire" claim is overstated.** `docs/whs/template-pack/swms/` has heights, roof, scaffold, excavation, demolition, silica, mobile plant, crane, hot works, structural carpentry — but is **missing SWMS for nail guns, temporary bracing/truss erection, manual handling, electrical/test-and-tag, confined space (subfloor/roof void), and a dedicated asbestos removal/handling procedure.** Wiring the existing 10 does **not** cover several of the exact hazards that define the trade. Decide build-or-buy per gap.
- **Cut derived lists with no output.** `required_toolbox_talks`, `site_board_warnings`, `training_requirements` are computed and surfaced nowhere. Either wire them to a real toolbox/consultation record or stop computing them — dead derived state on a safety module is worse than absent.
- **Fix the misleading `m0 → m5` claim** (only asbestos wired) rather than adding modules. Small change, real safety-integrity gain.
- **SDS register and plant pre-starts should be dead-simple** — a list + attached SDS files (small table + Dropbox store) and a short checklist form, not new engines.
- **Retire one of the two `/api/whs/*` families over time** (`whsRoutes.mjs` raw `res.json`/502 vs `whsEngineRoutes.mjs` `ok()`/`err()`). Standardise; don't keep building both.

**Principle:** BLH needs *proof it did the required things* — White Cards on file, the right SWMS consulted and signed, incidents notified, an SDS register, health monitoring where triggered, toolbox talks recorded, records that can't be quietly altered — not a maximal document generator.

---

## 7. Minimum work before it is safe to cancel — the corrected, gated list

**Do not cancel until every P0 is live and independently verified on a real project site AND a real carpentry site.** Re-prioritised from the draft to reflect severity and the two critiques.

**P0 — legal blockers (and the pre-build gates)**

0. **Clear the three gates (§2) first, in writing:** officer due-diligence sign-off; insurer/broker indemnity confirmation + contract/prequalification check; a named owner for ongoing legal currency. *These gate the decision above the build.*
1. **Kill the hardcoded acknowledgements now** (`SiteInduction.jsx:163-164`) and stop issuing inductions that assert fabricated sign-offs. Capture real per-worker acknowledgement + White Card. Take advice on whether historical records need a corrective note. *Fastest, highest-severity fix; do before the next induction is issued.*
2. **Stop issuing the one live template** (`project_whs_management_plan`) until it is legally reviewed and its `"clause TBC"` content replaced. *A wrong plan is worse than none.*
3. **Enforce record integrity + retention** — replace `authenticated ALL` RLS with role-scoped, append-only/locked WHS records, an audit trail, PDF export on approval, and a retention/legal-hold mechanism (SWMS, 5-yr incident, 30-yr health monitoring). *Without this the Hub can't produce records that stand up, so building more records first is wasted.*
4. **Carpentry WHS coverage** via the dual-FK refactor (§4): migration + spine-parameterised routes + WHS tab + carpentry induction QR.
5. **Wire the carpentry/heights SWMS set** with **real, consulted, worker-signed sign-on** and **openable PDFs** (register the ~5–8 relevant SWMS; implement the deferred repeating-row sign-on; SWMS must be *prepared in consultation with the crew*, s47).
6. **Subcontractor verification for free-text carpentry subs** — competency, insurance, White Card, SWMS on file, linked to `subcontractors` (Act s19/s46). *Live hole today.*
7. **White Card / worker-credential capture** + a **working** insurance-expiry reminder (the `reminder_sent_at` column is dead for WHS — wire an actual job).
8. **Hazardous-chemicals/SDS register + silica & asbestos air/health-monitoring stores, 30-yr retention, and an asbestos register.** *The draft's SDS item is right but half the size it needs to be.*
9. **Notifiable-incident handling as a human-backed process, not just a form** — notify-immediately + preserve-scene guidance, 5-yr records, and a **named competent person / retained consultant** who makes the call at 2am. *This is where Hazard Co's helpline mattered most.*
10. **First aid + emergency plan as accessible site artefacts**, including a **fall-arrest / suspension-trauma rescue plan** wherever harnesses are used. *Re-tiered from the draft's P2 — these are mandatory.*
11. **Multi-PCBU coordination artefact** — capture the head contractor's site rules/SWMS received, and share BLH's own SWMS upward (Act s46). *Central to carpentry-as-sub.*

**P1 — strongly recommended (parity / evidentiary strength)**

12. Daily site sign-in / **toolbox-talk consultation register** (surface the toolbox content the engine already derives).
13. **SWMS version-change re-acknowledgement** — when a SWMS is revised, previously-inducted workers must re-sign; the engine already flags docs stale on save, so the hook exists.
14. **Hazard/incident → corrective-action task close-out** (owner + due date), reusing `site_tasks.category='safety'` — "close the loop."
15. Field-native WHS in `FieldWHS.jsx` (42-line shell today): on-device incident logging, SWMS view, toolbox sign-on, and **offline capture** (reuse the existing PWA offline layer).
16. **BLH's own company-level compliance view** (PL, workers-comp / ReturnToWorkSA registration, company licences) — today the model is entirely sub-facing.
17. Link `site_inductions` to the internal **employee record** and to the **subcontractor register** (both missing today) for a per-worker credential/induction matrix.
18. Honour `m0 → m5` pre-select; replace `"clause TBC"` codeRefs with confirmed SA reg clauses.
19. **Independent WHS-professional legal review** of every generated template before reliance.
20. Manual-handling and noise risk assessments (Reg 60 / 56–58); audiometric monitoring where triggered.

**P2 — genuine nice-to-haves (not legal blockers)**

21. Vehicle/plant pre-start checklists; electrical test-and-tag register; site inspection log; standalone critical-risk-assessment form.
22. **Who's-on-site view derived from the existing PWA clock-in / `timesheets.carpentry_job_id`** (reuse, not net-new); induction-gating from the same data.
23. Subcontractor **self-service upload** via the existing portal-v2; compliance **gate at RFQ/PO issue** (block expired-insurance subs at engagement, not just show red).
24. Heat/UV SunSmart control artefact; young-worker/apprentice supervision; labour-hire seam.
25. Automated tests for the WHS engine (repo has none).

**Not replicable in software — a business decision:** Hazard Co's **24/7 human WHS advisory line + staffed incident support**. Software builds a form; it does not tell a panicking supervisor at 2am "don't touch anything, this is notifiable, here's the number." Keep a WHS consultant on retainer after cancelling — this is the single item most worth weighing before you drop the subscription, and it is the same "named competent person" that P0 #9 requires.

---

## 8. Extract from Hazard Co before cancelling

Bulk self-export is limited (Hazard Co emails PDFs per report; Procore sync is one path). **Request a full account data export in writing before the subscription lapses, confirm in writing exactly how long records stay accessible after cancellation, and demand a machine-readable (CSV/API) export — not just PDFs — so history can be *imported*, not merely archived.** Verify every export includes **signatures, timestamps, photo attachments and metadata** (a bare PDF may not stand as a legal record), and handle it as personal information under the Australian Privacy Principles (worker licences/medicals).

Pull, at minimum:

- [ ] All completed/signed **SWMS PDFs** for every job — plus the **worker↔SWMS-version acknowledgement audit trail** (who signed which version, when).
- [ ] Every **site-specific safety plan / WHSMP** per project.
- [ ] **Induction history + daily scan-on/scan-off attendance** for every project.
- [ ] **Incident, accident and near-miss reports** — *highest value*; needed for open claims and regulator/insurer requests.
- [ ] **Corrective-action / hazard close-out records** (not just the incident report).
- [ ] **Toolbox meeting records** incl. photo attendance.
- [ ] **Completed risk assessments** and **site review / inspection records**.
- [ ] **Vehicle and plant checklists**.
- [ ] **Hazardous substances register + all SDS**, plus any **health/air-monitoring records** (retain silica/asbestos health monitoring for the *full statutory period — up to 30 years*, not merely "confirm how long accessible").
- [ ] **Collected contractor documents** — worker licences/tickets/competencies, **White Cards**, insurance certificates.
- [ ] **Any regulator correspondence** (improvement/prohibition notices, inspector-visit records) and **insurer / principal-contractor audit reports** held in Hazard Co.
- [ ] **Master template library** to rebuild in the Hub, and Hazard Co's **SWMS-to-activity mapping logic** — useful to validate/extend `whsRiskRules.mjs`.

Retain all of it, tamper-evident, with **no gap on live jobs mid-project** — it is BLH's compliance history and cannot be regenerated.

---

## 9. The decision frame — the inputs that actually drive go/no-go

Beyond features, these decide it and are worth pinning down before any cancellation:

- **Cost-benefit.** Hazard Co's annual cost vs. estimated build hours + timeline + a named owner for the eleven P0 items. This is the core input to "should we cancel" and needs a number, not a feeling.
- **Prequalification lock-in (possible hard blocker).** Whether any BLH builder-client mandates Hazard Co / Rapid Global / Avetta / LinkSafe for site access. If yes, feature parity is irrelevant.
- **Perpetual legal-currency maintenance.** Cancelling insources template/rule maintenance forever (the >2 m change is a live example). Own it explicitly, or the Hub drifts out of compliance.
- **The human advisory line.** Not reproducible in software — retain a consultant (see §7).
- **RTW SA / workers-comp seam.** Incident → claim → injury management (RTW Act 2014 SA) sits adjacent to the WHS product; name where it lives even if out of scope.

---

## 10. Readiness verdict

**Readiness to safely cancel Hazard Co across Operations and Carpentry: ~20%, and the number is *gated*, not blended.** A compliance-cancel decision is capped by its weakest legal blocker — and several sit at zero (SDS register 0%, White Card capture 0%, health monitoring 0%, notifiable-incident handling 0%, carpentry coverage ~3%), while the one layer that *is* built (inductions) currently produces records that wouldn't survive scrutiny (fabricated acks, editable tables, unopenable SWMS). Blending 64/38/3 into "40%" oversells it; the honest figure is nearer the *minimum*.

The architecture is genuinely stronger than that headline — enter-once profile, pure rule engine, merge/render, spine-agnostic helpers, and a proven dual-FK pattern to copy are all in place, so most P0 work is **wiring and hardening**. But it is **not optional** wiring: it is the difference between a compliance record and a manufactured liability on the trade BLH does most.

**Recommendation: do not cancel. Run the Hub and Hazard Co in parallel** while you (1) clear the three gates (§2) in writing, and (2) complete the eleven P0 items — with acknowledgement-fabrication and record-integrity fixed *first*, and the one live template pulled from real sites until reviewed. When those are live and **verified on both a project site and a carpentry site**, a WHS professional has reviewed the generated templates, and you've confirmed no builder-client mandates a prequalification platform, then cancel — and separately retain a WHS consultant to cover the human advisory line and make the 2am notifiability call.

The one-liner for the owner: *cancelling today would leave BLH self-certifying on unreviewed templates, with fabricated acknowledgements and editable records, no silica/asbestos health regime, unverified subbies, no consultation trail, and no answer to "who makes the notifiable-incident call" — precisely the profile that turns one bad day on site into a personal prosecution under s27 and a denied insurance claim.*

> **Caveat (repeat):** This report is informational and code/law-grounded as at 28 July 2026, **not legal advice.** The SA-specific figures used here — the **A$450,000** WHS-management-plan/principal-contractor threshold and the **1 July 2026 >2 m** HRCW fall threshold — were confirmed against SafeWork SA and *differ from the harmonised-state model figures*, so verify they still hold at the time you act. Before dropping a compliance product, have a WHS professional and/or SafeWork SA confirm the legal-minimum mapping and review the Hub's generated SWMS/WHSMP templates; the in-repo template grounding is currently placeholder (`"clause TBC"`) and not yet fit to rely on.

---

**Key files for the build:** `supabase/migrations/064_whs_engine.sql` (project-only FKs + `authenticated ALL` RLS — the record-integrity P0), `supabase/migrations/010_module6_operations.sql` (`site_inductions`, no worker link), `supabase/migrations/117_workforce_allocations.sql` (XOR pattern to copy), `server/lib/whs/whsEngineRoutes.mjs` (`TEMPLATES` map — one wired; `syncProjectSwms`), `server/lib/whs/whsRiskRules.mjs` (`deriveOutputs`, reuse as-is; wire `m0→m5`), `server/lib/whs/whsMergeFields.mjs` + `whsRenderer.mjs` (repeating sign-on rows deferred), `server/lib/whsRoutes.mjs` (no notify), `server/lib/inductionRoutes.mjs`, `src/pages/SiteInduction.jsx:163-164` (hardcoded acks — fix first), `src/pages/WhsManager.jsx`, `src/pages/WhsEngine.jsx`, `src/pages/field/FieldWHS.jsx` (42-line stub, no offline), `src/pages/CarpentryJobDetail.jsx` + `CarpentryDashboard.jsx` (no WHS), `server/lib/carpentryRoutes.mjs` (no WHS refs), `server/lib/opsReadiness.mjs` (~L203), `docs/whs/template-pack/` (corpus — missing nail-gun/bracing/manual-handling/electrical/confined-space/asbestos SWMS), `docs/whs/template-pack/critique/99_legal_usability_critique.md` (existing legal-usability critique — reconcile against it before wiring templates).

**Still needs checking (not code-verifiable):** (1) does any builder-client contractually mandate Hazard Co / a prequal platform for site access; (2) Hazard Co annual cost vs. build effort/timeline/owner; (3) who owns ongoing template legal currency; (4) build-or-buy per missing SWMS; (5) whether the Hazard Co export includes signatures/timestamps/photos + machine-readable format; (6) retention window after cancellation, in writing; (7) re-confirm the $450k and >2 m SA figures at time of action; (8) confirm which health-monitoring duties (silica/noise/lead) apply to BLH's workforce now; (9) reconcile against `critique/99_legal_usability_critique.md`.