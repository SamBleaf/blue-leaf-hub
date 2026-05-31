# Blue Leaf Hub — Full Workflow Test Report (live log)

> Run started: 2026-05-31. Target: LOCAL dev (localhost:5173 / :8787), logged in as
> ai-test-director@blueleafbuilding.test. Driver: Claude in Chrome. Outbound guardrail:
> all recipients → test inbox `ai-test-director@blueleafbuilding.test` (.test TLD — cannot
> reach real people). No destructive actions. Findings appended live; final summary at end.

## Legend
PASS = worked + data verified · WARN = worked but issue · FAIL = broken · GAP = APB/SOP step with no home · BLOCKED = couldn't test (e.g. migration/env)

---

## Wave 0 — Smoke / environment
- PASS — Login session shared into the agent tab; `/home` renders. Top bar project selector,
  left nav (Sales, Tendering, Operations, Workforce, Financials, Marketing, Users, Settings),
  Blueprint AI panel present. Dashboard KPIs: Pipeline $4.4M / 7 active leads; Weighted $2.2M;
  Won(12mo) $1.4M / 1 job / 13% close. Active jobs: "12 Test Street, Glenelg SA 5045" ($862,000,
  30%) and "21 Folkestone Road, South Brighton SA" (Contract TBC). Seed data present.

---

## Findings log
<!-- appended live, newest at bottom -->

### Wave 1 — Sales / CRM / Marketing
- PASS — **Create lead** (SOP 02-01): New Lead form (first/last/email/phone/suburb/project type/est value/lead source) submitted; created "Daniel Foster" (Stirling, New Build, $1.2m, source Website). Pipeline KPI updated 8→9 leads and $5.9m→$7.1m (+$1.2m = the est value). Lead appears in Enquiry column. Data persisted.
- PASS — **Lead detail** (LeadDetail.jsx): all fields carried (name, test email, phone, New Build, Stirling, est $1,200,000). Sections render: Contact, Project (incl. "Site address — once known", floor area click-to-edit, design stage), Conversations (Add Transcript), Log Activity (type/note/next action/date), Activity Timeline ("Lead created — just now"), Notes, Documents (upload), Advance to Qualify, Nurture/Mark Lost. No console/render errors.
- NOTE — convert-to-job action not present at Enquiry stage (expected; appears later in pipeline). Deferred conversion check to a more-advanced lead.

### Finance Command Centre (validates C8, C9 KPI, −11,832% fix, underclaim automation)
- PASS — **Director Portfolio** (`/finance/jobs`): 2 active jobs, $874k total. 21 Folkestone $11,900 → 37% margin (sane — **the −11,832% bug is gone**); 12 Test Street $862k → 82.2%. Underclaim alert on 12 Test St (~$213k). Sort by Risk/$/A-Z. Totals: contract $874k, costs $161k, avg margin 59.6%.
- PASS — **Job Command Centre** (12 Test Street): `GET /api/finance/jobs/:id/command-centre` returns **200** → confirms the **C8 de-shadow is live** (the richer financeCCRoutes version serves it). Header "Contract $862,000 · incl. $12,000 signed variations" (contract = original + signed variations, correct). KPIs: Contract $862,000 / Claims Issued $0 / Claims Paid $0 / Actual Costs $153,500 / Working Margin 82.2% (green vs 40% target) / Forecast Margin 28.1% (red) — **no garbage values, forecast-data-quality guard working**. Underclaim automation: "Build 24.8% · Claimed 0.0% · ~$213,415 unclaimed" + Draft-claim CTA. WIPAA Review + Variations sections present.
- NOTE — 12 Test Street has **no budget seeded** ("Seed from Buildxact"), so per-trade Budget-vs-Actual (and the H8 labour fold-in) can't render live here without budget rows + approved timesheets. H8 verified in code by the finance audit agent; live render deferred (needs a seeded budget).
- PASS — **Variations** (C9 contract math): section shows "Signed $12,000 / Pending $0" + "#1 Upgrade kitchen benchtop (seed) — Signed ✓ — $12,000 ex / $13,200 inc GST". The header contract ($862k "incl $12,000 signed variations") agrees → contract = original + Σ signed variations holds end-to-end on the finance side. "+ New variation" present.
- PASS — **Progress Claims** + **Cashflow Forecast (3-mo)** sections render (claims "Issued $0 / Paid $0 / Default APB stages", "+ New claim"; cashflow accordion present).

### Wave 1 (cont.) — Sales pipeline progression
- PASS — **Stage advance** (SOP 02-02): "Move to Qualify" → `PATCH /api/sales/leads/:id` 200 → stage = Qualify; timeline logs "Moved from enquiry to qualify". (First click was a no-op due to automation timing during a re-render — settled-page clicks work; not a product defect.)
- PASS — **APB stage gating**: "Move to Discovery" is locked behind "✗ Qualifying score ≥ 5" with "Complete the requirements above to advance." Good — APB qualification gate enforced in the UI.
- **BLOCKED (environment) — ALL Claude AI features.** Reproduced `POST /api/blueprint/chat` from the authed page: Anthropic returns `400 invalid_request_error: "Your credit balance is too low to access the Anthropic API."` This is an **account-credit issue, not a code defect**. Consequence: every Claude-backed feature will 500 in this local run and is **BLOCKED**: Blueprint chat/Insight/QC, transcript analysis, AI schedule generation, marketing content generation, AI invoice extraction, cost-intelligence AI, MI question-scan/strategy/AI-summary. To test these, top up the Anthropic account (or set a funded `ANTHROPIC_API_KEY` in local `.env`) and re-run the AI steps. (The dashboard Blueprint greeting is a static seed message, not an API call.)
- **LOW (real code finding) — raw provider error + wrong status leak.** `blueprintRoutes.mjs:370-377` returns the raw Anthropic error string to the browser and uses 500 for a billing error (only `rate_limit` is special-cased). Per CLAUDE.md (no raw provider strings to client), detect credit/billing/auth errors → friendly message + a non-500 status (e.g. 503). Same pattern likely in other AI routes' catch blocks.

- PASS — **APB data-driven gating proven both ways**: Qualify→Discovery cleared once score ≥ 5; Discovery→Winning Offer correctly BLOCKS on "✗ Discovery notes filled / ✗ Design stage set / ✗ Desired start date set". Qualifying scorecard (Budget/Timeframe/Site/Decision-maker) updates the generated score live (0/8 → 6/8 → 8/8). Stage changes logged to activity timeline. Strong APB enforcement.
- NOTE — full 8-stage push + lead→job conversion (H14/H15) deferred: each later stage needs more data + the win path needs subs/estimates/RFQ. Conversion fix verified in code by the re-audit; live conversion to be done in a dedicated job-build pass. Pivoting to breadth-first module sweep to surface holes faster.

### Wave 3 (partial) — Operations & Schedule
- PASS — **Operations Overview**: loads clean (no console errors). Global Gantt across all projects ("2 projects · 39 tasks"), color-coded per project, Month zoom + Trade filter (Sprint-4 feature). Sub-nav Overview/Schedule/Site Diary/WHS.
- WARN/LOW — **raw DB error leak**: visiting `/operations/schedule` directly shows "invalid input syntax for type uuid: \"schedule\"" (router matched `/operations/:projectId` with projectId="schedule"). Bad/missing project id should show a friendly not-found, not a raw Postgres string (CLAUDE.md violation). Real nav uses `/operations/:id/schedule` so users won't normally hit it.
- PASS — **Schedule Manager** (12 Test Street): Gantt/Sheet/Delays/Dep Map views; Add task, Export PDF/CSV, BX Match, Save template, Critical path, 3-week lookahead, Filter trade. "Generate with AI / Load from template / Start blank".
- **PASS — C6 confirmed LIVE**: "Load from template" → Standard New Build (39 tasks) → `POST /api/schedule/:id/load-template` **200**, tasks inserted, Gantt renders. The task_type CHECK (migration 072) no longer rejects the batch insert. (Non-AI path, so testable despite the Anthropic credit block.)
- PASS — **Schedule automations**: "Schedule Alerts — 1 hold point in next 14 days (Contract execution 2026-05-31)" fired on load; baseline "Lock Baseline" banner present.

### Wave 3 (partial) — WHS
- PASS — **H5 prefill confirmed**: new WHS Setup shows "Some fields were pre-filled from project data" with Project type "new home" + Storeys "double" pre-populated from the job/project (the H5 source-from-jobs fix). Sections: Construction Method, Project Verification, Site Setup, Emergency Planning, Site Hazards.
- **PASS — H6 confirmed LIVE end-to-end**: answered "Work at heights over 2m = Yes" → `PUT /api/whs/projects/:id/profile` 200, risk engine derived `applicable_swms:["Working at Heights"]` → `syncProjectSwms` auto-created the stub template + `project_swms` link → public `GET /api/induction/:id/info` now returns 1 SWMS ("Working at Heights SWMS"). Before the fix this was always empty. (Confirms swms_templates/project_swms exist + writable in dev.)
- **FAIL / HIGH — WHS incident reports: "Could not find the table 'public.site_reports' in the schema cache".** The old WHS Manager (Operations → WHS → Contractors/Inductions/Incidents) errors on load. Since swms_templates/project_swms (same migration 010) DO work, this is specific to `site_reports` → the table is missing in the dev DB or PostgREST's schema cache is stale for it. ACTION (dev env): confirm `site_reports` exists in the dev Supabase and reload the PostgREST schema cache (NOTIFY pgrst, 'reload schema') / re-apply migration 010. Also a raw-error leak to the UI.

### Bugs / issues found so far (running tally)
1. **BLOCKED (env)** — All Claude AI features 500 ("Anthropic credit balance too low"). Top up credit to test AI (Blueprint, transcript, schedule-generate, content-gen, invoice-extract, MI question-scan/summary).
2. **HIGH** — WHS incident reports broken on dev: `site_reports` not in schema cache (missing table / stale cache).
3. **LOW** — Raw provider/DB errors leak to the UI in 2 spots: blueprint/chat returns the raw Anthropic string + 500 for a billing error; `/operations/<bad-id>` shows raw "invalid input syntax for type uuid". Both should be friendly messages (CLAUDE.md).

### Session checkpoint (1)
Environment + the highest-risk post-audit fixes validated LIVE: **C8** (command-centre served by financeCCRoutes, 200), the **−11,832% margin fix** (sane margins in portfolio + CC), the **underclaim automation**, and **C9 contract-math** (original + signed variations). Sales lead lifecycle (create + detail data-carry) PASS. Remaining fixes (H6/H7/H8 live render, H11/H12/H13, portal client view, schedule C6) + the full 106-SOP / 12-month multi-job simulation are a larger continuous effort — see checkpoint note to Sam.
