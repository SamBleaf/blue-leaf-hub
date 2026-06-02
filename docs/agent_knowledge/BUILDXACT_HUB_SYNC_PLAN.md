# Buildxact ⇄ Blue Leaf Hub — Integration & Sync Strategy

> **Created 2026-06-02.** Client is live-verified (see `BUILDXACT_INTEGRATION_AUDIT.md`). This doc is
> the plan for how the two systems operate together. Status: **proposed — awaiting build go-ahead.**

## Operating model (Sam's intent)
- **Phase 1 (now → "until the Hub is flawless"):** Buildxact is the **financial system of record**.
  Staff do estimating, POs, progress claims, variations *in Buildxact*. The Hub **mirrors** that data
  (pull) so every other module (schedule, CRM, marketing, dashboards) can use it, and so the numbers
  are **visible in two places for reconciliation/troubleshooting**.
- **Phase 2 (when confident):** selective **two-way** — the Hub can originate certain records and push
  them to Buildxact, with one clear owner per entity to prevent double-entry/conflicts.
- **Always:** a **reconciliation view** — Buildxact value vs Hub value, side-by-side, per job, with a
  mismatch flag. This is the "see it in 2 data sources" troubleshooting tool.

## The API constraint actually *enforces* the right phasing
Live testing showed what Buildxact v3 lets us WRITE vs only READ — and it lines up with the plan:

| Buildxact entity | API supports | ⇒ Phase 1 | ⇒ Phase 2 |
|---|---|---|---|
| **Estimates + items** | **READ only** (no write/accept/status) | Pull → mirror + budget seed | stays read-only (estimating lives in BX) |
| **Variations** | **READ only** | Pull → mirror | (no BX write API — stays in BX) |
| **Progress claims / invoices** | **READ only** | Pull → mirror | (no BX write API — stays in BX) |
| **Purchase Orders** | **READ + CREATE/COMPLETE/DELETE** | Pull → mirror | Hub can originate + push ✅ (proven: PO #1895) |
| **Jobs** | **READ + CREATE/COPY** | Pull → mirror | Hub can create job + push |
| **Leads** | **READ + CREATE/UPDATE** | Pull → mirror | two-way |
| **Customers / Contacts** | **READ + CREATE/UPDATE/DELETE** | Pull → mirror | two-way |
| **Catalogues (incl. Recipe)** | **READ** (+ manage) | Pull on demand (variation pricing) | — |
| **Documents / Schedules / Notes** | READ (+ upload docs/notes) | optional pull | optional push (docs, notes) |

> So the financial work you want to keep in Buildxact (estimates, claims, variations) is **exactly**
> what the API can't write anyway — Hub pulls it for reconciliation. The things the API *can* write
> (POs, jobs, leads, customers) are the natural Phase-2 two-way candidates.

## Data model for reconciliation (key design choice)
Because the goal is to **compare two sources**, Buildxact-pulled values are stored **distinctly** from
Hub-native values (not overwritten into one number):
- Mirror tables / columns prefixed `buildexact_*` (we already have `buildexact_estimates`,
  `jobs.buildexact_job_id`, `purchase_orders.buildexact_po_id`). Extend with mirrored PO/claim/variation
  snapshots carrying `buildexact_*_id`, `synced_at`, `source='buildexact'`, and the raw totals.
- A **reconciliation view** joins Hub-native ↔ Buildxact-mirror per job and flags deltas
  (contract, estimate total, PO total, claimed-to-date, variation total). ✅ match / ⚠ differs.

## Mechanism
1. **On-demand pull** — a "Sync from Buildxact" button per job (and a portfolio-wide sync): resolve
   `buildexact_job_id` → pull job + estimate(+items) + POs + invoices/claims + variations → upsert
   mirror rows. Uses the now-correct client (`getJobById`, `getEstimatesByJob`/`getEstimateItems`,
   `getPurchaseOrders`, `getJobInvoices`, `getJobVariations`).
2. **Scheduled pull** — nightly sync of active jobs (cron, like the existing batch endpoints).
3. **Webhooks (near-real-time)** — Buildxact supports webhooks (Estimate Accepted, Lead Created/Updated,
   etc.). We have a handler stub (`buildexactWebhook.mjs`); confirm the event list + signature header in
   the portal, then update mirrors on push instead of waiting for the poll.
4. **Phase-2 push** — start with PO origination from the Hub (lowest-risk, already proven), each push
   recorded with the returned `purchaseOrderId`.

## Recipe catalogues (approved feature)
Expose `getCatalogues` / `getCatalogueItems` / `searchCatalogueItems` in the Hub as a **Recipe / Price-Book
picker**, used in variation pricing (and pre-tender estimating). Live tenant has a `Recipe` catalogue
("FITOUT SUPPLY"). Replaces/augments the estimate-derived recipe pricing in the Variations flow.

## Proposed build order
1. **Sync + reconciliation engine** (core of the ask): per-job pull of job/estimate/PO/claim/variation
   into mirror tables + the side-by-side reconciliation panel. (New migration for mirror tables.)
2. **Recipe catalogue picker** for variation pricing.
3. **Webhooks** for near-real-time mirror updates.
4. **Phase-2 push**: PO origination from Hub → Buildxact.

## Open questions for Sam
- **Job linking:** how is `jobs.buildexact_job_id` populated today — manually, or do we add a "link to
  Buildxact job" picker (search BX jobs → attach)? (Sync needs every Hub job mapped to a BX jobId.)
- **Reconciliation scope first:** start with the headline numbers (contract / estimate total / POs /
  claimed / variations), then drill into line items?
- **Cron host:** same place we'll run the other nightly batches (cron-job.org → Railway)?
