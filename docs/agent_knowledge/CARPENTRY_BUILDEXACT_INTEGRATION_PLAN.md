# Carpentry × Buildexact — Data, Push/Pull & Analysis Plan

> **Status:** PLANNING. Created 2026-06-14. Grounded in the **live Buildexact API** (probed read-only) + the actual carpentry module.
> **One-line:** Buildexact is the **system of record for $ (estimate, POs, Work Orders, invoices, claims, variations)**; the Hub is the **operational + labour layer**. Pull money *from* Buildexact, push labour *to* it, and analyse on top — never duplicate.

---

## 1. Buildexact data surface — what's actually pullable (verified live)

| Buildexact resource | Endpoint (verified) | Holds | Use? |
|---|---|---|---|
| **Job** | `getJobById` | number (J1171), client, address, **contractTotal/Tax, estimateEx, markup, actualTotal, paymentTotal (claims), variationTotal, poCount/poEx** | ✅ headline financial position |
| **Estimate** | `/estimates?$filter=jobId eq` | net_total (sell ex GST), estimate_total, markup | ✅ contract/quote value |
| **Estimate items** | `/estimates/{id}/items` | 100+ lines: description, **parent rows = categories**, costItemType, unitCost, isParent/parentId | ✅ **budget categories** (already seeded) |
| **Purchase Orders** | `/jobs/{id}/purchaseorders` | every order: number, date, **orderTotalExTax, orderStatus, isCompleted, receivedDate**, contactId (supplier), orderType (Purchase/Work) | ✅ **material + labour ACTUALS** |
| **PO/WO line items** | `/jobs/purchaseorders/{id}/items` | per line: description, **parentTask = category**, qty, unitCost, totalCost, **isReceived**, costItemType, notes | ✅ **actual cost per category** |
| **Create Work Order** | `POST /jobs/purchaseorders/create` | orderType 'Work', Labour lines | ✅ **labour push (built)** |
| **Contacts** | `/contacts` (GET/POST) | suppliers + people, contactType | ✅ supplier list / "(HUB)" contacts (built) |
| **Invoices** | `getJobInvoices` | supplier invoices on the job | 🟡 cash actuals / paid status |
| **Claims / variations** | on the job object | paymentTotal, variationTotal | 🟡 progress + scope changes |
| `/costcategories`, `/timesheets`, `/employees` | exist but **empty** | — (account uses Deputy/estimate categories instead) | ❌ not usable |

**Bottom line:** the **POs + Work Orders (+ their line items)** are the gold — they are Buildexact's actual cost ledger, already tagged to categories (`parentTask`) and marked received/completed. The Hub doesn't read them yet.

---

## 2. The principle — who owns what (so we don't double-count)

| Owns | Buildexact | Blue Leaf Hub |
|---|---|---|
| **Money / actuals** | ✅ estimate, POs, Work Orders, invoices, claims, variations | ✖ (mirror only) |
| **Labour hours** | ✖ (receives Work Orders) | ✅ timesheets, approvals |
| **Operations** | ✖ | ✅ milestones, tasks, site diary, photos |

→ **Pull** financial actuals **from** Buildexact. **Push** labour **to** Buildexact (Work Orders, built). Everything operational stays Hub-only.

---

## 3. Material cost capture — the biggest real-world gap (Sam, 2026-06-14)

**The problem:** material invoices get saved to Dropbox as you pay them, but aren't entered into Buildexact until end-of-job, all at once — so cost-to-date is blind mid-job and the two systems drift. **Fix: reuse the Finance invoice pipeline for carpentry.**

The Hub already runs this for construction: `accounts@blueleafbuilding.com.au` IMAP → AI extraction (supplier / amount / trade) → job match → approval (`financial_documents`). Extend it to carpentry:
1. **Allocate to a carpentry job** — an extracted invoice can be matched/assigned to a `carpentry_job_id` (today only construction jobs), with a cost category.
2. **Approve in the carpentry job** — same approve step; the invoice becomes a material actual on the job (the Dropbox PDF is the source doc).
3. **Push to Buildexact as a Purchase Order** — on approval, create a BX Purchase Order (orderType `Purchase`, costItemType `Material`, `parentTask` = the supply category), supplier = a BX contact, amount = the invoice total.

**This is the material twin of the labour push — same mechanism, both tag to categories so the numbers line up automatically:**

| | Source (Hub) | Buildexact object | Line type | Category (`parentTask`) |
|---|---|---|---|---|
| **Labour** | approved timesheet | **Work Order** (`Work`) | Labour | labour category |
| **Material** | approved invoice (accounts@ inbox) | **Purchase Order** (`Purchase`) | Material | supply category |

So invoices flow in **as you pay** → allocate + approve → land in Buildexact against the right cost line. No more end-of-job manual entry; Buildexact actuals and the Hub stay in sync continuously.

> **Mixed categories** like *"AAC and foam supply and installation"* receive BOTH a material PO (the AAC invoice) **and** labour Work Orders (install hours), tagged to the same category. So the labour/material classifier only drives the **budget-split display** — the **actuals self-sort by `parentTask`** regardless. (Still worth fixing the classifier so the budget line reads sensibly: "install" in the name → labour-ish.)

## 3b. Work Order status fix (immediate)
The labour push currently creates Work Orders as **"Unsent"** (e.g. order #1900), but Deputy's imports land as **"Completed"** (they're done/approved). Approved Hub labour = done work → the push should mark the Work Order **Completed** (and the material PO **received**) so they count as actuals immediately, matching Deputy. *(Mechanism to confirm with one test: a create-time status field, or a follow-up "complete order" call — neither is in the client yet.)*

## 4. Carpentry section-by-section — push / pull map

| Carpentry section (Hub) | Pull from Buildexact | Push to Buildexact | Hub-only |
|---|---|---|---|
| **Overview / Financials** | contract value, estimate, **actualTotal**, markup, claims, variations → live margin | — | quoted margin override, notes |
| **Budget vs Actual** (`/budget`) | budgets ← estimate categories (✅ done); **actuals ← PO/WO line items by `parentTask`** (NEW — replaces manual) | — | — |
| **Costs / material** | **actuals ← Purchase Orders** (P1, incl. legacy BX-entered) | **approved invoices → Purchase Orders** (P2, via the accounts@ pipeline) | ad-hoc/non-BX costs only |
| **Labour** (timesheets) | (optional) read back Work Orders for reconciliation | ✅ **Work Order per approved timesheet** (built) | hours, approvals |
| **Milestones / Schedule** | (BX job has no real schedule API) | — | ✅ Hub-managed |
| **Tasks / Site Diary / Photos** | — | — | ✅ Hub-only |
| **Closeout / Performance** | final actualTotal + PO/WO totals → true final cost & margin | — | labour hours, $/m² |
| **Job creation** | ✅ estimate categories auto-seed (done); job number → ref (done) | (optional) create the BX job if started in Hub | — |

**The one missing pull that changes everything: read the job's POs + Work Order line items and roll them up by `parentTask` → real, live cost-to-date per category** — instead of manual cost entry + Hub-only timesheet rollup.

---

## 5. Analysis layers — ALL confirmed (Sam: yes to all)

> **Guiding principle (Sam): maximise cross-module data sharing.** Finance ↔ Carpentry ↔ Buildexact ↔ Cost Intelligence ↔ Procurement — the more each module feeds the others, the smarter every system gets. Build all six layers; design each to also emit data the others consume (e.g. real actuals → Cost Intelligence benchmarks; supplier data → Procurement).

1. **Live Budget vs Actual vs Committed, per category** — budget (estimate) vs actual (received POs/WOs) vs committed (sent-but-unreceived orders). The single most useful view; today it's manual/partial.
2. **Live margin** — quoted value − actual cost-to-date, updating as POs/Work Orders land. Replaces the static quotedMargin.
3. **Labour productivity** — hours logged (Hub) vs budgeted labour $ per category (estimate); $/m² by category; flags categories burning faster than budget.
4. **Cost-to-complete forecast** — for each category: actual + remaining-budget, and a blended forecast; surfaces overruns early.
5. **Cross-job benchmarking** → feeds the Hub **Cost Intelligence** engine: $/m² and labour-hours per category across carpentry jobs (real Buildexact actuals are far better training data than estimates).
6. **Supplier performance** — from PO data: on-time (receivedDate vs requiredByDate), spend by supplier, order accuracy. Ties into the Procurement plan (BQ-10).

**Not worth building (noise):** mirroring every BX field, a BX schedule clone, anything `/timesheets`/`/employees`-based (empty on this account).

---

## 6. Categorisation refinement — the AAC issue (Sam, 2026-06-14)

The seeder classifies labour vs material with `/supply/i.test(name) → material`. That mis-files **"AAC and foam supply and installation"** as material, but it **includes labour** (supply + install combined).

**Better rule:**
- Name contains **"install"** (or "supply and install", "supply & fix", "& install") → **labour** (it has a labour component).
- Pure **"… supply"** with no install → **material**.
- Optionally a **`mixed`** cost_type for combined supply+install lines, so the budget can show both — but simplest first step: treat "… supply and installation" as **labour** so its hours have a home.

> Caveat: a combined "supply and installation" category's budget $ includes materials, so labour-vs-budget for it will read low (labour is only part of it). Flag these as "combined" in the budget view. Long-term, Buildexact splitting supply vs install into separate categories is cleaner — but the rule above stops the misclassification now.

---

## 7. Recommended build sequence

- **P0 — Quick fixes (now).** Work Order status → **Completed** (matching Deputy); AAC/"install" classifier; clean up the test order #1900.
- **P1 — Pull actuals (foundation).** Read `/jobs/{id}/purchaseorders` + `/purchaseorders/{id}/items`, roll up `totalCost` by `parentTask` (received vs committed). Surface in the Budget tab as **live Budget vs Actual vs Committed** per category. Read-only against Buildexact = safe.
- **P2 — Material invoice capture (the biggest gap).** Extend the Finance `accounts@` invoice pipeline to **allocate + approve invoices against carpentry jobs**, then **push approved invoices to Buildexact as Purchase Orders** (the material twin of the labour push). Invoices captured as you pay, not at end-of-job.
- **P3 — Analytics.** Live margin · labour productivity (hours vs budget per category, $/m²) · cost-to-complete forecast.
- **P4 — Cross-module.** Real actuals → **Cost Intelligence** benchmarks (category $/m², labour rates); PO/supplier data → **Procurement (BQ-10)** supplier performance.

Each phase ships independently. Everything is read-only against Buildexact except the two write paths — the labour Work Order push (built) and the material Purchase Order push (P2) — both human-approved before they fire.

---

## 8. Cross-module impact — this is a PATTERN, not just carpentry

The carpentry build is the **pilot** of one Buildexact pattern: *pull $ actuals (POs/WOs) tagged by category · push approved labour/material · reconcile to keep one number across both systems.* ~27 server files already touch Buildexact, so the same pattern reshapes the rest of the platform. Build the carpentry pull/push as **shared, job-type-agnostic services** so these reuse them:

| Module | Today | With the Buildexact pattern |
|---|---|---|
| **Finance Command Centre** (construction) | budget-vs-actual from `financial_documents` (approved invoices) only | + pull BX **POs/WOs as actuals** + **committed cost** (sent POs) = the BQ-10 committed layer that's currently *deferred*. The same invoice→PO and labour→WO pushes apply to construction jobs, not just carpentry. |
| **Cost Intelligence** (Module 2) | benchmarks from estimates + quotes | **real BX actuals** ($/m² + labour rates by category) become the benchmark source — far better training data than estimates |
| **Procurement (BQ-10)** | planned committed-cost + supplier perf | **BX POs ARE the committed/actual ledger**; supplier on-time/spend comes straight from PO data. The procurement plan's committed layer = this BX PO pull. |
| **RFQ engine** (Module 4) | RFQ → PO, syncs to BX on quote acceptance (partial) | RFQ-accepted POs push to BX via the **same write path** as the material push |
| **Facts / contract value** | contract value = Generated fact (original + signed variations) | reconcile vs BX `contractTotal` / `variationTotal`; the reconcile tool already flags drift (within $1) |
| **Variations & Progress Claims** | `job_variations`, `progress_claims` (Hub) | BX holds `variationTotal` + claims/outgoing invoices → sync/reconcile so it's **one number** (the Portal reads it) |
| **Client Portal** | shows contract, variations, claims | reflects BX-sourced truth once reconciled |
| **Estimating OS / Bestimator** | learns from Hub outcomes | **BX actuals (POs, invoices, real costs) are the single best training signal** for the learning loop — warns Cost Intelligence of drift, flags Procurement risk |
| **Schedule** | BX estimate → schedule generation | unchanged; procurement lead-times tie to BX POs |

**Build implication:** the carpentry helpers — `pullActualsByCategory(bxJobId)`, `pushWorkOrder(...)`, `pushPurchaseOrder(...)` — should live as **shared Buildexact-actuals services** (not carpentry-only), and the **`buildexact_job_sync` mirror (mig 075) is the natural home for the pulled-actuals snapshot**, consumed by Finance, Cost Intelligence, and Procurement alike. Build once in carpentry, reuse everywhere.
