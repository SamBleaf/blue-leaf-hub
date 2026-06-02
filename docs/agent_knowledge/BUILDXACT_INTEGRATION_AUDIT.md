# Buildxact Integration Audit — Bookmark & Plan (2026-06-02)

> **Why this doc exists:** Buildxact developer-portal subscription is now **APPROVED**, which
> unblocks Module 4. Before we wire anything live we must verify *every* call we make matches
> Buildxact's official API spec (operation IDs, paths, field casing). This doc is the bookmark
> for that work + the complete inventory of what we call today.
>
> Official reference (given by Sam): **https://developer.buildxact.com/apis**
> (The portal is a JS-rendered SPA — WebFetch only sees the nav shell. Real specs are on the
> sub-pages: Getting Started / Authorization / Estimate Data / Webhooks, plus per-operation pages.)

---

## STATUS — IMPLEMENTED (2026-06-02), verified by boot + lint + critical-paths (20/0/4)

Worked from the official OpenAPI 3 specs (`accounts/metadata/leads/jobs/catalogues/clients/contacts/estimates`,
all server `https://api-v3.buildxact.com/<service>`, auth `Ocp-Apim-Subscription-Key`, **camelCase** bodies).

**Server boot fix (prerequisite):** `pdfkit` (~13s cold) and `googleapis` (~10s+ cold) were imported
statically and blocked startup. Made both **lazy-loaded** (`feeProposalPdfKit`/`poPdfKit`/`module6PdfKit`
+ removed a dead pdfkit import in `financeRoutes`; `gmailSend`/`googleDriveClient` load `googleapis` on
first use, with `*Configured()` now checking env vars only). Boot went from stalling → **~2s**.

**`buildexactClient.mjs` rewritten to match the spec:**
- `getJobs` — filter now on `clientName` (JobDto has no `Name`).
- `getJobById` — `GET /jobs/{id}` doesn't exist → resolves via `GET /jobs?$filter=jobId eq {id}`.
- `getPurchaseOrders` — `…/purchaseorders` (was `purchase_orders`).
- `createPurchaseOrder(options)` — `POST /jobs/purchaseorders/create` + `PurchaseOrderCreateOptionsDto`
  (jobId in body, `items[]`); `module4Routes` PO caller updated to the new shape.
- **Removed (no such endpoint):** `getJobEstimateItems`, `getJobEstimates`, `updateEstimateItem`,
  `acceptEstimate`, `updateEstimateStatus`, `syncQuotesToJob`.
- **Added (correct, per spec):** `getJobItems`, `getJobVariations`, `getJobInvoices`, `createJob`,
  `getEstimatesByJob`, `getEstimateItems`, customers (`getCustomers`/`createCustomer`/contacts),
  contacts (`getContacts`/`createContact`), leads (`getLeads`/`createLead`/`updateLead`),
  catalogues (`getCatalogues`/`getCatalogueItems`/`searchCatalogueItems`), `listDocuments`,
  `getSchedule`, plus `beList`/`beFirst` OData helpers.

**`pullBuildexactEstimate` (9 consumers) repointed:** resolves the job's estimate
(`GET /estimates?$filter=jobId eq {id}`, prefers `isAccepted` else newest) → `GET /estimates/{id}/items`
→ keeps leaf lines (skips `isParent` headers), stamps `categoryName` from `costCategory` → existing
normaliser. The 3 sync-*back* functions (accepted-quote / fee-proposal sent+accepted) are **no-ops**
(`skipped: unsupported_by_api`) — Buildxact v3 has no estimate-write endpoints. Test Connection
(`POST /api/buildexact/test-connection`) already does login → `getJobs("")`, now via the corrected path.

### ✅ VERIFIED LIVE (2026-06-02 — real Blue Leaf Building tenant `bbf3c49d…`)
Ran login + reads against `api-v3.buildxact.com` with the production subscription key:
1. **Auth** — `POST /accounts/auth/login` → 200, accessToken (NOT idToken — idToken → 401). ✅
2. **OData casing + GUID quoting** — `$filter=jobId eq <unquoted-guid>` (camelCase) **works**; `getJobById`
   matched the row. `getEstimatesByJob` works (estimate had `isAccepted:true`). ✅
3. **Envelope** — list responses are **bare arrays** (`beList` handles both forms). ✅
4. **Fields** — confirmed **camelCase** (`jobId`, `clientName`, `estimateId`, `customerId`, `contactId`…). ✅
5. **All API products reachable** — accounts/jobs/estimates/clients/contacts/leads/catalogues all 200
   (40 real jobs; catalogues include a `Recipe` type — good for variation pricing). ✅
6. **Estimate hierarchy — FIXED via live data:** `costCategory` is **empty on live items**; categories
   come from the **parent/child hierarchy** (`isParent` header rows; leaves carry `parentId`).
   `pullBuildexactEstimate` now derives the category from the parent header → real categories come
   through (Deck Materials, Garage Materials, First Fix Framing, …). ✅
7. **Address fallback** — many jobs have `worksLocationAddress: null` and use `clientAddress`; the
   estimate route already falls back. ✅

**Still NOT exercised (a WRITE — needs explicit go):** `createPurchaseOrder` (`POST /jobs/purchaseorders/create`).
Creating a PO writes real data into Buildxact, so confirm before test-issuing one; a supplier `contactId`
may be needed for a fully-usable order.

### NOT YET WIRED INTO FEATURES (methods exist + correct; build against the live key)
Leads sync, Customer/Contact sync, Catalogue-backed variation pricing, Document upload. Each should be
wired + live-tested one at a time once Test Connection passes.

**Required env:** `BUILDEXACT_USERNAME`, `BUILDEXACT_API_KEY`, `BUILDEXACT_SUBSCRIPTION_KEY` (Azure APIM
primary key from the developer portal), optional `BUILDEXACT_API_URL` (default `https://api-v3.buildxact.com`).

---

## A. WHERE WE LEFT OFF (stabilisation — paused, near-closed)

Everything committed + pushed to `origin/main` (HEAD `8fea1dc`). Working tree clean (only untracked
`scripts/seed-test-job.mjs`, a local test helper). Outstanding, all **Sam-side**:

1. **Redeploy Vercel** → ships the Blueprint auth fix (`1b01e0a`) + RFQ dedup (`ec6dc5f`) to the live
   frontend. Until then prod Blueprint still says "Unauthorised". ⚠ The committed `vercel.json` still
   has the placeholder Railway host — the live project ignores it (routing set in the Vercel
   dashboard), so a normal redeploy is safe; just don't "reset to repo defaults".
2. **Apply migration `074`** to the **dev** Supabase (`khehclrwppjvrogyxmdb`) for WHS incidents in dev
   (prod already has it). Idempotent.
3. **Parked:** Resend domain DNS for `blueleafbuilding.com.au` (DKIM/SPF/MX → DNS person). Branded
   campaigns hit the new friendly "domain not verified" error until then; `resend.dev` test sends work.

---

## B. CURRENT BUILDXACT SURFACE (what we call today)

All in `server/lib/buildexactClient.mjs` unless noted.

**Config**
- Base URL: `BUILDEXACT_API_URL` (default `https://api-v3.buildxact.com`) — i.e. **API v3**.
- Subscription header on **every** request: `Ocp-Apim-Subscription-Key: <BUILDEXACT_SUBSCRIPTION_KEY>`
  (falls back to `BUILDEXACT_API_KEY` if the dedicated sub-key isn't set). Plus
  `Content-Type: application/json`, `Accept: application/json`.
- Data calls additionally send `Authorization: Bearer <accessToken>`.

**Auth flow**
| Fn | Method | Path | Body |
|---|---|---|---|
| `buildexactLogin` | POST | `/accounts/auth/login` | `{ email, apiKey }` |
| `buildexactRefresh` | POST | `/accounts/auth/refresh-token` | `{ email, apiKey, refreshToken }` |

Token cached in-memory until ~60s before expiry; refresh, else re-login.

**Data calls** (via `beFetch`)
| Fn | Method | Path | Verify against spec |
|---|---|---|---|
| `getJobs(term)` | GET | `/jobs?$filter=contains(Name,'…')` | OData filter syntax + field name `Name` |
| `getJobById(id)` | GET | `/jobs/:id` | path shape |
| `getJobEstimateItems` | GET | `/jobs/:id/estimateitems` | ⚠ exact path (`estimateitems` vs `estimate-items` vs `estimates/:id/items`) |
| `getJobEstimates` | GET | `/jobs/:id/estimates` | does this exist / is it the right list call? |
| `updateEstimateItem` | PATCH | `/jobs/:id/estimateitems/:itemId` | ⚠ **field casing** (PascalCase `UnitCost` vs `unit_cost`) + PATCH vs PUT |
| `acceptEstimate` | POST | `/jobs/:id/estimates/:estimateId/accept` | does an `/accept` action exist? |
| `updateEstimateStatus` | PATCH | `/jobs/:id/estimates/:estimateId` | body `{ status }` shape |
| `createPurchaseOrder` | POST | `/jobs/:id/purchase_orders` | ⚠ `purchase_orders` vs `purchaseorders` vs `purchase-orders` + PO body schema |
| `getPurchaseOrders` | GET | `/jobs/:id/purchase_orders` | same path question |
| `syncQuotesToJob` | POST | `/jobs/:id/costs/sync` | ⚠ **suspected dead/non-existent** — never called; leave guarded or remove |

**Consumers**
- `buildexactDeepIntegration.mjs::pullBuildexactEstimate()` → tries `getJobEstimateItems`, falls back to
  `getJobEstimates`. Normalises into categories+line items (feeds budget seeding + variation recipes).
- `buildexactParser.mjs` → category mapping (37 trade categories) from estimate items.
- `buildexactIntegrationRoutes.mjs` → `/api/buildexact/job/:id/estimate`, `/api/rfq/:id`,
  `/api/fee-proposal/:id/accept`.
- `buildexactWebhook.mjs::handleBuildexactWebhook()` → inbound webhooks; **signature header name is
  still unknown** (we log all candidates: `Buildexact-Signature`, `X-Buildexact-Signature`,
  `X-Hub-Signature-256`, `X-Signature`, `Signature`) and currently process-through when the secret is
  set but no recognised header arrives. Needs the real header name + signing scheme from the portal.

---

## C. KNOWN-RISK ITEMS (carried from the master plan, Module 4)

| Item | Verdict to confirm |
|---|---|
| `GET /jobs/:id/estimateitems` | Low risk — verify exact path in portal |
| `PATCH /jobs/:id/estimateitems/:id` | Medium — field casing likely PascalCase (`UnitCost`) |
| `POST /jobs/:id/purchase_orders` | Medium — verify separator (`_` vs none vs `-`) + body schema |
| `POST /jobs/:id/labourentries` (timesheet sync) | ⚠ No public docs seen — confirm it exists before relying on it. **Not currently implemented** in client. |
| `syncQuotesToJob` (`/costs/sync`) | ⚠ Dead code — probably doesn't exist. Remove or keep guarded. |
| Webhooks (Estimate Accepted, Lead Created/Updated) | Confirm event names + the **signature header + scheme** |

---

## D. WHAT WE NEED TO FINISH THE AUDIT (when we return)

The portal is JS-rendered, so to map our calls 1:1 against the official operation IDs we need **one** of:
1. The **OpenAPI / Swagger JSON** URL for the v3 API (best — lets us diff every path/method/field), or
2. Sam pastes each relevant operation page (Jobs, Estimates, Estimate Items/Data, Purchase Orders,
   Authorization, Webhooks) from the authenticated portal, or
3. Authenticated access to the portal reference pages.

Then: with the live `BUILDEXACT_SUBSCRIPTION_KEY` in Railway, run **Settings → Test Connection** and a
real `GET /jobs` against a sandbox/real account to confirm auth + the first live call end-to-end.

---

## E. AUDIT → FIX PLAN (sequence for the return)

1. Confirm **auth** path/body/headers (`/accounts/auth/login` + refresh) against Authorization page.
2. Confirm **base URL** (`api-v3.buildxact.com`) + the subscription-key header name.
3. Diff each data path in §B against the spec; fix path strings + verbs in `buildexactClient.mjs`.
4. Fix **field casing** on write calls (estimate item PATCH, PO POST) to match the spec's schema.
5. Decide `syncQuotesToJob`/`labourentries`: remove or implement per real endpoints.
6. Lock down the **webhook** signature header + verification scheme; flip from process-through to
   strict verify.
7. Live smoke: Test Connection → `GET /jobs` → `pullBuildexactEstimate` on a real job → budget seed.
8. SOPs: update `docs/sops/12_admin_settings` (Buildxact connection) Section 14 test script.

> No code changes have been made for Buildxact in this session — this is the read-only bookmark only.
