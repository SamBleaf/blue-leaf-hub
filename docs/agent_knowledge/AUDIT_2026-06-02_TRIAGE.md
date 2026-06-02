# Triage — AUDIT_REPORT_2026-06-02.md

> **Triaged:** 2026-06-02 · read-only triage of the fresh full-lifecycle workflow audit
> (`AUDIT_REPORT_2026-06-02.md`). Cross-referenced against `git log` (HEAD `ba670c2`), the prior
> `AUDIT_REPORT_2026-05-30.md`, `WORKFLOW_TEST_REPORT_2026-05-31.md`, `AUDIT_FINDINGS_2026-05-31.md`,
> the Buildxact docs (`BUILDXACT_INTEGRATION_AUDIT.md`, `BUILDXACT_HUB_SYNC_PLAN.md`), migration set
> 001–075, and the in-progress `UNIVERSAL_DATA_MIGRATION_PLAN.md`. **No code modified.**

---

## 1. Severity rollup (as reported in AUDIT_REPORT_2026-06-02.md)

| Severity | Count | IDs |
|---|---|---|
| **Critical** | 1 | BUG-001 |
| **High** | 3 | BUG-002, BUG-003, BUG-004 |
| **Medium** | 6 | BUG-005, BUG-006, BUG-007, BUG-008, BUG-009, BUG-010 |
| **Low / UX** | 7 | BUG-011, BUG-012, BUG-013, BUG-014, BUG-015, BUG-016, BUG-017 |
| **Total** | **17** | |

**Triage adjustment:** of the 17, **16 are genuinely open** and **1 is mis-classified as a code/schema gap
(BUG-003)** — the column it claims is missing is in fact defined in migration 008; the live symptom is a
dev-DB / PostgREST schema-cache drift plus a real (separate) "no linking UI" feature gap. See §3 and §4.

---

## 2. Triaged open-bug list

Legend for **UDM overlap**: ✅ = a Universal Data Migration phase will rewrite this area (fix minimally or
defer); ➖ = independent of UDM (fix now, won't be re-touched).

### CRITICAL

**BUG-001 — Sales Pipeline direct URL → raw DB error** *(report §Bugs/CRITICAL)*
- **Module/file:** `src/App.jsx:141` (`path="/sales/:leadId"`).
- **Root cause (confirmed in code):** `/sales/:leadId` is the only param route under `/sales`; there is no
  explicit `/sales/pipeline`. Routes registered are `/sales`, `/sales/dashboard`, `/sales/contacts`,
  `/sales/reference-projects`, `/sales/:leadId`. Hitting `/sales/pipeline` matches `:leadId="pipeline"`,
  which is then queried as a lead UUID → Postgres `invalid input syntax for type uuid: "pipeline"` leaks raw.
- **Fix:** add an explicit `/sales/pipeline` route **before** the `:leadId` catch-all (or give the pipeline
  list its own non-colliding path); also wrap the lead fetch in a friendly not-found per CLAUDE.md
  (no raw Postgres strings to the browser). Same raw-error class as the known `/operations/<bad-id>` leak.
- **UDM overlap:** ➖ independent — pure routing. Fix now.

### HIGH

**BUG-002 — Operations "Financials" tab not routed → bounces to /home** *(report §Bugs/HIGH, Module Coverage)*
- **Module/file:** Operations hub tab + `/operations/:id/financials` (route absent in `src/App.jsx`).
- **Root cause:** the route is not registered; the tab has no working target. (Plausibly compounded by the
  known role-guard deep-link timing, but the primary cause is the missing route.)
- **Fix:** either implement `/operations/:id/financials` or wire the tab to `/finance/jobs/:id`
  (the Job Command Centre already serves job-level financials — C8 de-shadow shipped, commit `3d0edc3`).
- **UDM overlap:** ➖ independent — routing/nav. Fix now.

**BUG-003 — "buildexact_job_id missing from jobs" → all 40 BX jobs NOT LINKED** *(report §Bugs/HIGH, §Phase 2, §API Surface)*
- **Module/file:** Supabase `jobs`; `scripts/reconcile-buildxact.mjs` + `server/lib/buildexactReconcile.mjs:66`.
- **Root cause (CORRECTED — partly stale, partly real):**
  1. **The column is NOT missing from the schema.** `supabase/migrations/008_job_extract_correspondence_fee_pdf.sql:14-15`
     adds `ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS buildexact_job_id text;`. It is read all over the
     server (`buildexactReconcile.mjs`, `costIntelligenceEstimate.mjs`, `workforceRoutes.mjs`,
     `buildexactWebhook.mjs`, `scheduleRoutes.mjs`, etc.). The audit's `column ... does not exist` error is a
     **dev-DB migration drift / stale PostgREST schema cache** — the exact same class as the `site_reports`
     drift the prior reports flagged (and migration 074 self-heals). Mig 075 also adds `buildexact_link_source`
     usage (read in `operationsRoutes.mjs:21`) — confirm 075 + 008 are applied to the dev DB.
  2. **The real, genuinely-open part:** even with the column present, **no Hub job has `buildexact_job_id`
     populated** (there is no UI to link a Hub job to a BX job), and the **address fallback fails** because
     Hub address format ≠ Buildxact `worksLocationAddress`/`clientAddress` format. So reconcile correctly
     reports "NOT LINKED" for all 40. This is a **linking-feature gap, not a schema gap.**
- **Fix:** (a) verify/re-apply migrations 008 + 075 to the dev Supabase and `NOTIFY pgrst, 'reload schema'`;
  (b) build the job→BX linking path — a "Link to Buildxact job" picker (search BX jobs → attach `buildexact_job_id`)
  and/or improve address auto-match by routing both sides through `normaliseAddress()` (the reconcile module
  already uses `address_normalised` on the Hub side; BX side currently uses `worksLocationAddress` raw).
- **UDM overlap:** ✅ **strong** — Phase 1 (address as canonical identity) explicitly states *"reconcile pass
  still links every Buildxact job by address"* as an acceptance criterion, and `buildexactSync.mjs:35` already
  uses `normaliseAddress` for linking. The address-match half of this bug is **exactly what Phase 1 fixes** —
  don't hand-roll a parallel matcher. The explicit-link picker is additive and can ship independently.

**BUG-004 — Buildxact webhook event type always "unknown" → real-time sync dead** *(report §Phase 2 Webhook Events, §Bugs/HIGH)*
- **Module/file:** `server/lib/buildexactWebhook.mjs:46-56` (`extractEventType`), `:139,167`.
- **Root cause (confirmed in code):** `extractEventType` probes `event_type / EventType / type / Type / event / Event`,
  then `eventType.toLowerCase()` is matched against expected names. The 4 received events (17–23 May) carry an
  event-name field/value the handler doesn't recognise → falls to `"unknown"`, `processed:No`. The **real
  Buildxact event names + the field that carries them are not yet confirmed from the portal** (the integration
  audit §C and sync plan §Mechanism both flag "confirm event names + signature header/scheme" as outstanding).
- **Fix:** capture the real event payload shape from the live webhook log (the handler already logs all headers),
  confirm the event-name field + value set from the Buildxact portal docs, then extend the event-type
  mapping/switch. Also flip signature verification from process-through to strict once the header name is known.
- **UDM overlap:** ➖ mostly independent (Buildxact integration, not data-model) — but Buildxact writes should
  use `source='buildexact'` through the facts service per UDM §2.5 when mirrors update the spine.

### MEDIUM

**BUG-005 — Portal admin Client name/email don't save** *(report §Bugs/MEDIUM)*
- **Module/file:** `src/pages/PortalAdmin.jsx` (Overview tab) — controlled inputs missing `onChange`/persist.
- **Root cause:** controlled inputs with no `onChange` → React state never updates from typing; no save/blur
  persist. (Prior reports noted portal admin writes `projects` via the anon client — same area.)
- **Fix:** add `onChange` handlers + a Save (or onBlur autosave) that persists via the server layer (not anon).
- **UDM overlap:** ✅ Phase 2 moves client identity (`client_name/email/phone`) canonical onto the **job** spine
  and has the portal read it via `getJobProfile` (stop reading `projects.portal_client_*`). Fix the immediate UX
  (onChange + save) now, but **don't invest in new `projects`-table client columns** — Phase 2 retires that path.

**BUG-006 — "Enable test portal" button does nothing** *(report §Bugs/MEDIUM)*
- **Module/file:** `src/pages/PortalAdmin.jsx` (Overview tab) — Enable handler.
- **Root cause:** likely gated on client name/email (BUG-005) or a missing/failing API call (the known
  `patchProject` early-returns silently on Supabase error — see CLAUDE.md BUG-portal-2).
- **Fix:** fix BUG-005 first; verify the enable handler fires its API call and surfaces errors (toast).
- **UDM overlap:** ✅ same portal/Phase-2 area — keep the fix minimal.

**BUG-007 — "Draft claim →" CTA on the Underclaim alert is inert** *(report §Bugs/MEDIUM, §Automation)*
- **Module/file:** Finance Job Dashboard / Command Centre (`/finance/jobs/:id`) underclaim banner.
- **Root cause:** the button has no click handler (no scroll-to-section / open-claim-modal wired).
- **Fix:** wire it to scroll to Progress Claims and/or open a new-claim modal pre-filled with the underclaim amount.
- **UDM overlap:** ➖ independent — UI wiring within finance. (Finance route consolidation in UDM §5 is about the
  contract-value source, not this button.) Fix now.

**BUG-008 — Carpentry Budget Margin shows "—" despite quoted + budgeted present** *(report §Bugs/MEDIUM)*
- **Module/file:** `src/pages/CarpentryJobDetail.jsx` (margin display). Data confirmed: CJB-001 quoted $237,705 /
  budgeted $172,187 ⇒ ~27.6% expected.
- **Root cause:** margin not computed/rendered when both values present (display-only gap; the values exist).
- **Fix:** compute `(quoted - budgeted) / quoted` and render when both present.
- **UDM overlap:** ✅ **Phase 7 (carpentry de-island)** rolls carpentry financials onto the builder spine and
  registers the carpentry financial spine in the dictionary. A trivial display fix now is fine and low-risk, but
  the broader carpentry costing will be re-touched in Phase 7 — don't build heavy margin infra here.

**BUG-009 — Job created from lead gets `status:"tendering"` regardless of stage** *(report §Bugs/MEDIUM)*
- **Module/file:** `server/lib/jobsApiRoutes.mjs:79` — `status: "tendering"` hardcoded on every `POST /api/jobs`.
- **Root cause (confirmed in code):** the create handler always sets `status:"tendering"`; it does not consider
  the source lead's stage. A job created from an **Accepted** lead lands in the Tender Board as "TENDERING".
- **Fix:** derive status from lead stage (Accepted/post-tender → `accepted`/`won`); use `constants.js` enums,
  never hardcode the string (CLAUDE.md). Confirm the intended status taxonomy with the APB stage mapping.
- **UDM overlap:** ✅ Phase 2 introduces `POST /api/sales/leads/:id/convert-to-job` that stamps all lead facts
  (incl. stage-derived status) via the facts service. This conversion endpoint **replaces** the current path —
  fix the hardcoded status now (one line, prevents bad demo data this week) **knowing Phase 2 rewrites the route.**

**BUG-010 — Job-from-lead fallback address ("Name — Suburb") not matchable by Ops/Finance selectors** *(report §Bugs/MEDIUM, §Data Quality)*
- **Module/file:** lead→job conversion (frontend builds the fallback address) + project pickers.
- **Root cause:** when `site_address` is unset, the job address becomes "FirstName LastName — Suburb", which
  `address_normalised` / the project selectors don't recognise → job orphaned from Ops/Finance.
- **Fix:** require/warn for `site_address` before creating a job (preferred), or make selectors accept the
  fallback. Best handled inside the Phase-2 conversion endpoint with proper address normalisation.
- **UDM overlap:** ✅ **strong** — Phase 1 (address canonical) + Phase 2 (conversion endpoint). This is largely
  a symptom of converting without a real address; the canonical-address work fixes the matching. Add a
  **require-address guard** now as a cheap guardrail; defer the deeper fix to Phase 1/2.

### LOW / UX

**BUG-011 — Blueprint Insight qualifying score stale until manual refresh** *(report §Bugs/LOW, §Automation)*
- **File:** Lead detail → Blueprint Insight tab. **Fix:** auto-refresh insight after qualify-score change.
  **UDM overlap:** ➖.

**BUG-012 — Home Pipeline widget missing "Fee Proposal" + "Won" rows** *(report §Bugs/LOW)*
- **File:** `/home` pipeline widget. **Fix:** add the rows, or confirm Won→Active-Jobs is intentional.
  Note prior KPI alignment fix (`760f888`) deliberately excludes Won from *active pipeline* totals — verify this
  isn't a deliberate omission before "fixing". **UDM overlap:** ➖.

**BUG-013 — Quote Tracker "Packages 1" badge counts a Direct RFQ** *(report §Bugs/LOW)*
- **File:** `/tender-manager/rfq-packages` Packages tab count. **Fix:** count only true packages.
  **UDM overlap:** ➖.

**BUG-014 — Quote Tracker project-filter badge not removable** *(report §Bugs/LOW)*
- **File:** `/tender-manager/rfq-packages`. **Fix:** add an X/clear control. **UDM overlap:** ➖.

**BUG-015 — Webhook URL shows `127.0.0.1:8787` in Settings (prod)** *(report §Phase 2 Webhook URL, §Bugs/LOW)*
- **File:** Settings → Buildxact section. **Fix:** derive from `RAILWAY_PUBLIC_URL` / configurable `BASE_URL`.
  Pairs with BUG-004 (webhook viability). **UDM overlap:** ➖ (deploy/config).

**BUG-016 — Pre-construction fee placeholder styling shown when a value is saved** *(report §Bugs/LOW)*
- **File:** Lead → Winning Offer stage. **Fix:** distinguish saved-value vs placeholder styling. **UDM overlap:** ➖.

**BUG-017 — Fee Proposal wizard ~2s blank screen before render** *(report §Bugs/LOW)*
- **File:** `/tender-manager/fee-proposal/new`. **Fix:** add a loading skeleton during lazy-load.
  Note boot/lazy-load was tuned in `43471b8`/`43249b8` (server side); this is a client lazy-route skeleton.
  **UDM overlap:** ➖.

---

## 3. Already-fixed / stale (raised but resolved, or mis-stated)

| Item | Verdict | Evidence |
|---|---|---|
| **BUG-003 "column missing"** | **Partly STALE** — column exists in schema | `migrations/008_...sql:14-15` adds `jobs.buildexact_job_id text`; read across `buildexactReconcile.mjs`, `workforceRoutes.mjs`, `buildexactWebhook.mjs`, etc. The "does not exist" error = dev-DB drift / stale PostgREST cache (same class as `site_reports`, fixed by mig 074). The *linking-feature* half is real (see §2/§4). |
| Buildxact client correctness (paths/casing/auth) | **FIXED** | `549408f` "align v3 client to official OpenAPI spec (verified live)"; `BUILDXACT_INTEGRATION_AUDIT.md` STATUS = verified live against tenant `bbf3c49d…`. The audit's own Phase-2 API-surface table confirms all reads green. |
| Buildxact mirror table for reconciliation | **FIXED/SHIPPED** | mig `075_buildexact_job_sync.sql` + `9ec3e64` (reconcile CLI + sync plan) + `b7ff47c` (job→Hub sync engine). The audit treats sync as "architecturally complete" — correct; only linking/webhook gaps remain. |
| Server boot slow (pdfkit/googleapis) | **FIXED** | `43249b8` lazy-load → ~2s boot. (Relevant context for BUG-017, which is a *client* lazy-route, not boot.) |
| Blueprint chat auth / web-search beta header | **FIXED** | `1b01e0a` (attach auth on non-streaming) + `d5b9c4f` (web-search beta header). Audit lists Blueprint AI as WORKING. |
| CRM nav unreachable / role-guard deep-link / KPI math / Quote date / Site Diary | **FIXED** | `aeebdf7`, `388940a`, `760f888`, `9fa294c`, `aa48aaf`. Audit lists CRM, Contacts, Quote Tracker as WORKING — consistent. |
| RfqEngine duplicate-job dedup (raw ilike) | **FIXED** | `ec6dc5f` server PATCH `/api/jobs/:id` dedups via `address_normalised`. (Note: §Data-Quality still shows 4 legacy "21 Folkestone" rows — those are **pre-existing seed artefacts**, not new dups; prune them, but the code bug is fixed.) |
| Finance route shadowing (C8) | **FIXED** | `3d0edc3` de-shadow; Command Centre serves `/finance/jobs/:id` (lets BUG-002 simply redirect there). |
| WHS questionnaire fields + prefill from project_metrics | **FIXED** | `8860ea6`, `aff6ddc`. |
| Facts service Phase 0 activation | **SHIPPED (dormant→first consumer)** | `2801ae2` Phase 0 + WHS Module-0 proof. |
| −11,832% margin bug, C9 portal contract math, H7 double-time, H8 labour-in-trade-budget | **FIXED + live-verified** | `WORKFLOW_TEST_REPORT_2026-05-31.md` post-audit validation table. (None of these re-appear in the new audit — good.) |

**Net:** the new audit did **not** re-flag the major prior-fixed items — it's a clean second-generation pass.
The only correction needed is BUG-003's framing (schema vs cache vs feature-gap).

---

## 4. Buildxact reconciliation findings (highest value)

The audit ran `node scripts/reconcile-buildxact.mjs all` against the **live** tenant (40 real jobs).

- **NO numeric Hub↔Buildxact mismatch was logged** — but only because **0 of 40 jobs are LINKED**, so every
  Hub-side figure shows "—"/"n/a". There is therefore **no positive confirmation that Hub calcs agree with
  Buildxact** yet. This is a *coverage gap*, not a clean bill of health.
- **Two distinct linking gaps block reconciliation:**
  1. **No explicit link populated** — `jobs.buildexact_job_id` is null on every Hub job (no linking UI).
     `buildexactReconcile.mjs:66` tries the explicit link first.
  2. **Address fallback fails** — Hub `address_normalised` vs Buildxact `worksLocationAddress`/`clientAddress`
     format mismatch (`buildexactReconcile.mjs:71`). Many BX jobs even have `worksLocationAddress: null`.
- **Webhook reconciliation is dead** — 4 real events all `unknown`/`processed:No` (BUG-004), so no near-real-time
  mirror updates fire.
- **Once linking works, the reconcile tool is ready to surface real mismatches:** it compares contract, estimate,
  PO, claims, variations side-by-side and the Hub `contractEx` is computed as `original_contract_value +
  Σ signed variations` (`buildexactReconcile.mjs:90`) — the same formula UDM Phase 5 makes canonical. So the
  **first real reconcile pass (post-linking) is the single most valuable validation** before real data flows:
  it will either confirm Hub == BX within $1 (Phase 5 acceptance) or expose a sync-mapping / calc gap.

**Action:** treat "make reconcile link + run a clean pass" as the gating Buildxact milestone. It depends on
BUG-003 (apply migs 008/075 to dev + build linking) + UDM Phase 1 (address match).

---

## 5. Recommended priority order

Context: **real Buildxact data starts flowing within ~1 week**, and the Universal Data Migration is queued to
rewrite the address/conversion/finance/carpentry data paths. So: (a) ship the cheap UI/routing fixes that won't
be re-touched, (b) unblock Buildxact reconciliation (the highest-value validation), and (c) **avoid building
anything UDM Phase 1/2/5/7 will rewrite** — make those bugs cheap guardrails only.

**Tier 1 — fix now (independent of UDM, blocks demos / data integrity):**
1. **BUG-001** — `/sales/pipeline` route + friendly not-found (Critical, raw-error leak, 1 route line). ➖
2. **BUG-009** — stop hardcoding `status:"tendering"` on job create (one line; prevents bad Tender-Board data
   the moment real conversions happen). ➖→✅ (Phase 2 will rewrite the route; this is a stopgap.)
3. **BUG-002** — wire Operations "Financials" tab to `/finance/jobs/:id` (cheap; Command Centre already serves it). ➖
4. **BUG-007** — wire the "Draft claim →" CTA (finance UI, independent). ➖

**Tier 2 — unblock Buildxact reconciliation (highest value, time-boxed by the 1-week window):**
5. **BUG-003a** — verify/re-apply migrations 008 + 075 to the dev Supabase + reload PostgREST cache (env action,
   not code). Confirms the "column missing" symptom is gone.
6. **BUG-004** — confirm real Buildxact webhook event names from the portal + extend the event-type map; then run
   a webhook test. (Plus **BUG-015** webhook URL derivation, since they pair.)
7. **BUG-003b / linking** — build the job→BX link picker AND/OR fold the address auto-match into **UDM Phase 1**
   (don't hand-roll a parallel matcher). Then run a clean reconcile pass → first real Hub↔BX number check.

**Tier 3 — fix minimally now, defer depth to UDM:**
8. **BUG-005 / BUG-006** — add `onChange` + save + error toast on portal admin (immediate UX), but no new
   `projects` client columns — **UDM Phase 2** moves client identity to the job spine.
9. **BUG-010** — add a require-`site_address` guard on conversion now; defer the deeper match fix to **Phase 1/2**.
10. **BUG-008** — trivial carpentry margin display calc now; heavy costing waits for **Phase 7**.

**Tier 4 — UX polish, when time permits:**
11. BUG-011, BUG-012 (verify intent first), BUG-013, BUG-014, BUG-016, BUG-017.

---

*End of triage. No code changed. Source: `AUDIT_REPORT_2026-06-02.md` + cross-references cited inline.*
