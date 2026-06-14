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

## 3. Carpentry section-by-section — push / pull map

| Carpentry section (Hub) | Pull from Buildexact | Push to Buildexact | Hub-only |
|---|---|---|---|
| **Overview / Financials** | contract value, estimate, **actualTotal**, markup, claims, variations → live margin | — | quoted margin override, notes |
| **Budget vs Actual** (`/budget`) | budgets ← estimate categories (✅ done); **actuals ← PO/WO line items by `parentTask`** (NEW — replaces manual) | — | — |
| **Costs** (`carpentry_job_costs`, manual today) | **material actuals ← Purchase Orders** (auto, with received status) | — | ad-hoc/non-BX costs only |
| **Labour** (timesheets) | (optional) read back Work Orders for reconciliation | ✅ **Work Order per approved timesheet** (built) | hours, approvals |
| **Milestones / Schedule** | (BX job has no real schedule API) | — | ✅ Hub-managed |
| **Tasks / Site Diary / Photos** | — | — | ✅ Hub-only |
| **Closeout / Performance** | final actualTotal + PO/WO totals → true final cost & margin | — | labour hours, $/m² |
| **Job creation** | ✅ estimate categories auto-seed (done); job number → ref (done) | (optional) create the BX job if started in Hub | — |

**The one missing pull that changes everything: read the job's POs + Work Order line items and roll them up by `parentTask` → real, live cost-to-date per category** — instead of manual cost entry + Hub-only timesheet rollup.

---

## 4. Analysis layers worth building (on the pulled data)

1. **Live Budget vs Actual vs Committed, per category** — budget (estimate) vs actual (received POs/WOs) vs committed (sent-but-unreceived orders). The single most useful view; today it's manual/partial.
2. **Live margin** — quoted value − actual cost-to-date, updating as POs/Work Orders land. Replaces the static quotedMargin.
3. **Labour productivity** — hours logged (Hub) vs budgeted labour $ per category (estimate); $/m² by category; flags categories burning faster than budget.
4. **Cost-to-complete forecast** — for each category: actual + remaining-budget, and a blended forecast; surfaces overruns early.
5. **Cross-job benchmarking** → feeds the Hub **Cost Intelligence** engine: $/m² and labour-hours per category across carpentry jobs (real Buildexact actuals are far better training data than estimates).
6. **Supplier performance** — from PO data: on-time (receivedDate vs requiredByDate), spend by supplier, order accuracy. Ties into the Procurement plan (BQ-10).

**Not worth building (noise):** mirroring every BX field, a BX schedule clone, anything `/timesheets`/`/employees`-based (empty on this account).

---

## 5. Categorisation refinement — the AAC issue (Sam, 2026-06-14)

The seeder classifies labour vs material with `/supply/i.test(name) → material`. That mis-files **"AAC and foam supply and installation"** as material, but it **includes labour** (supply + install combined).

**Better rule:**
- Name contains **"install"** (or "supply and install", "supply & fix", "& install") → **labour** (it has a labour component).
- Pure **"… supply"** with no install → **material**.
- Optionally a **`mixed`** cost_type for combined supply+install lines, so the budget can show both — but simplest first step: treat "… supply and installation" as **labour** so its hours have a home.

> Caveat: a combined "supply and installation" category's budget $ includes materials, so labour-vs-budget for it will read low (labour is only part of it). Flag these as "combined" in the budget view. Long-term, Buildexact splitting supply vs install into separate categories is cleaner — but the rule above stops the misclassification now.

---

## 6. Recommended build sequence

- **P1 — Pull actuals.** Read `/jobs/{id}/purchaseorders` + `/purchaseorders/{id}/items`, roll up `totalCost` by `parentTask` (+ received vs committed). Surface in the Budget tab as real cost-to-date per category. Fix the AAC/labour classifier. *(This is the high-value core.)*
- **P2 — Live margin + labour productivity.** Overview shows live actual margin; budget tab shows hours-vs-budget per category.
- **P3 — Benchmarking + supplier performance.** Push category $/m² + labour rates to Cost Intelligence; supplier on-time/spend from PO data (ties to Procurement BQ-10).

Each phase is independently shippable and read-only against Buildexact (safe), except the already-built labour Work Order push.
