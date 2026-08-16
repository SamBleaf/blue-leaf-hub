<!-- Auto-generated 2026-08-16 by a 6-agent audit workflow (5 dimension finders + 1 synthesizer,
     93 touchpoints). Point-in-time snapshot of the Xero integration. -->

# Xero Integration — Full Audit (Blue Leaf Hub)

## 1. Executive summary

Xero is the Blue Leaf Hub's accounting integration, added as an **accounts-receivable (AR)** layer that lets the Hub create client invoices (starting with the Discovery-stage concept fee) directly in Xero while keeping a canonical mirror of each invoice in the Hub database. It was built in two deployed phases on branch `portal-v2`: **P0** = the OAuth connection layer (`xeroClient.mjs`, connection routes, Settings → Integrations → Xero pane) and **P1** = the invoice service + concept-fee create path (`xeroInvoices.mjs`, migration 182, `XeroInvoiceCard` in the lead Discovery view). The entire build is **fail-soft and flag-gated**: the connection layer is live-capable with just `XERO_CLIENT_ID`/`XERO_CLIENT_SECRET`, but all invoice **writes** are hard-gated behind `XERO_ENABLED` (unset in prod, so the write layer is dark). Alongside this new AR work sits a body of **pre-existing accounts-payable scaffolding** (the `xero_credentials` table, `xero_bill_id`/`xero_synced` doc status, `progress_claims.xero_invoice_id`, etc.) that the AR integration mostly does **not** use. **The live blocker:** no tenant is connected yet — the OAuth consent step fails with `invalid_scope`, because the Xero developer-portal app was created as a **Custom Connection** (machine-to-machine) rather than an **Auth Code "Web app"**, which is the only app type that supports the interactive consent + redirect flow this build uses.

## 2. Current status & blocker

**Overall state:** Connection layer BUILT-AND-LIVE (dark, no tenant connected). Write/invoice layer BUILT-BUT-GATED (`XERO_ENABLED` off + migration 182 unapplied). P2/P3/P4 PLANNED only. Never create-verified against a real Xero org.

**The blocker — `invalid_scope` at the Xero consent step:**

| Aspect | Detail |
|---|---|
| Symptom | `XeroPane` "Connect" hands off to Xero's authorize URL (`XeroPane.jsx:35-41`); Xero rejects the consent with `invalid_scope`. |
| **Cause (RESOLVED — two sequential issues)** | (1) The first app (`65FD30C5…`) was a **Custom Connection** (M2M, no consent flow) → fixed by creating an Auth Code **Web app**. (2) The Web app then still failed because our scope string used the **broad legacy `accounting.transactions`**, which Xero apps created on/after **2 Mar 2026** (granular-scopes rollout) no longer grant → fixed by switching to the granular **`accounting.invoices`** scope. Final scope set: `offline_access accounting.contacts accounting.settings accounting.invoices`. |
| Already fixed (not the cause) | Scope `%20`-encoding bug (commit `04f5b62`); `openid profile email` dropped from `DEFAULT_SCOPES` (`xeroClient.mjs:32-33`, commit `e812e3b`). |
| Secondary trap (fixed) | `.env.example` stale commented `XERO_SCOPES` with `openid profile email` — corrected so it can't re-introduce `invalid_scope`. |

**What unblocks it:**
1. Create the Xero app as an **Auth Code "Web app"** at developer.xero.com (not a Custom Connection). Use its Client ID + Secret.
2. Redirect URI = exactly `<APP_URL>/api/public/xero/callback` (the build deliberately moved the callback off `/api/finance/...` so the blanket admin guard doesn't 401 Xero's bearer-less redirect).
3. Leave `XERO_SCOPES` **unset** so the code default wins.
4. Set `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` (both blank in prod).
5. To go from connect-only to raising invoices: apply migration 182 and set `XERO_ENABLED=1` + `XERO_ACCOUNT_CODE_DESIGN`. Verify against the Xero **Demo Company** first.

## 3. Built & deployed

All P0/P1 code is **committed on `portal-v2`** (P0 `9337131`, P1 `a9cbec4`, plus hardening `04f5b62` / `656e2a1` / `e812e3b`).

### P0 — OAuth connection (LIVE, fail-soft, works with `XERO_ENABLED` off)

| File | Status | Role |
|---|---|---|
| `server/lib/xeroClient.mjs` | **BUILT-LIVE** | Connection core, raw-REST OAuth2 (NOT `xero-node`). `buildAuthorizeUrl` (scopes `%20`-encoded), `exchangeCodeForTokens`, DB-backed rotating-refresh-token store `getXeroAccessToken` (per-tenant single-flight mutex + compare-and-swap persist `WHERE refresh_token=$old`, `invalid_grant`→needsReconnect), signed HMAC state (10-min freshness), `xeroRequest` (Bearer + `xero-tenant-id` + 429 backoff, JSON or PDF), `disconnectXero`. Reads/writes `xero_credentials` (mig 020). |
| `server/lib/xeroRoutes.mjs` | **BUILT-LIVE** | `GET /api/finance/xero/status`, `/connect`, `POST /disconnect`, `GET /api/public/xero/callback` (public — validates state, exchanges code → `xero_credentials`, redirects `/settings/integrations?xero_connected=1#xero`). |
| `src/pages/settings/XeroPane.jsx` | **BUILT-LIVE** | Canonical connect UI. Configured/connected/tokenFresh/enabled states; shows "invoicing is OFF" when connected-but-gated. |
| `src/pages/settings/settingsNav.js` + `SettingsCategory.jsx` | **BUILT-LIVE** | Registers + renders the Xero pane under Integrations (admin-only). |
| `server/dev-api.mjs:59,1004` | **BUILT-LIVE** | Imports + `registerXeroRoutes(app)`. |
| `server/dev-api.mjs:976-988` | **BUILT-LIVE** | Blanket `/api/finance` admin guard; the callback sits under `/api/public` to stay outside it. |

### P1 — invoice service / concept-fee create (deployed; write path gated by `XERO_ENABLED`)

| File | Status | Role |
|---|---|---|
| `server/lib/xeroInvoices.mjs` | **BUILT-GATED** | AR service + build-once `INVOICE_TYPES` registry (only `concept_fee` shipped). `createXeroInvoice` POSTs an AUTHORISED ACCREC invoice ex-GST (`LineAmountTypes=Exclusive`, `TaxType OUTPUT`) with 3-layer anti-double-create. `ensureXeroContact` (email-exact cache), `syncXeroInvoice`, `hubStatusFromXero` (exported for P3), `listXeroInvoices`. Needs `XERO_ACCOUNT_CODE_DESIGN` or the row is marked `error`. No PDF/send/webhook yet. |
| `server/lib/xeroRoutes.mjs` (write routes) | **BUILT-GATED** | `GET /leads/:leadId/xero-invoices`; `POST /leads/:leadId/concept-fee/invoice` (only creator — gated by `XERO_ENABLED`, then requires `concept_agreement_status='accepted'` + positive `concept_fee`); `POST /xero-invoices/:id/sync`. |
| `src/components/sales/lead-detail/XeroInvoiceCard.jsx` | **BUILT-GATED** | Discovery "Concept fee invoice (Xero)" card. `canCreate` = accepted && fee>0 && connected && enabled && no existing invoice. Renders status badge, amounts, per-condition hints, a "Pay link" (dead until P2). |
| `src/pages/LeadDetail.jsx:34,2553` | **BUILT-GATED** | Mounts the card in the Discovery stage only. |
| `src/lib/constants.js:250-276` | **BUILT-LIVE** | `XERO_INVOICE_STATUSES` / `_LABELS` / `XERO_INVOICE_TYPES` (deploy-ahead vocab, no DB CHECK). |

## 4. Database objects

| Object | Migration | Applied? | Notes |
|---|---|---|---|
| `xero_invoices` (canonical AR table) | `182` | **UNAPPLIED** | Full invoice mirror + Xero identity/money fields + send-lock + filing pointers. `CHECK(lead_id OR job_id)`, `UNIQUE(source_type,source_id)`, partial `UNIQUE(xero_invoice_id)`. No status CHECK (deploy-ahead). Until applied, every P1 invoice call fails at the first DB write. |
| `xero_contacts` (contact cache) | `182` | **UNAPPLIED** | Blue Leaf client → Xero `ContactID`. `UNIQUE(tenant,contact)`, `lower(email)` index. |
| RLS on both (mig 182) | `182` | **UNAPPLIED** | Permissive `auth_users` **+** RESTRICTIVE `deny_clients` (`auth_is_staff()`) — re-added because migration 104's client-lockdown loop was one-time. |
| `xero_credentials` (OAuth token store) | `020` | **APPLIED** (live) | The one Xero table P0 actually uses. Currently empty (no successful connect yet). |

## 5. Pre-existing scaffolding (AP-oriented, mostly dead)

The new AR integration does **not** write these (except `xero_credentials`).

| Object / touchpoint | Location | Status | Notes |
|---|---|---|---|
| `xero_credentials` | `020` | APPLIED — now on the live path | Reused by P0. |
| `financial_documents.xero_bill_id` + `xero_synced_at` | `020:32,39-41` | APPLIED but **DEAD** | Columns for an unbuilt "push approved supplier bills to Xero". Never populated. |
| `'xero_synced'` doc status | `020`; read in `financeCCRoutes.mjs` (7 sites), `financeRoutes.mjs:1059`, `factsService.mjs:105`, `projectInsights.mjs`, UI chips | APPLIED; **read-only, never set** | ~11 rollups treat it as a committed cost, but no code path ever sets it → inert. |
| `progress_claims.xero_invoice_id` | `031:117` | APPLIED but **unused** | The P4 seam — will link a claim to its Xero AR invoice. |
| `progress_claim_payments.payment_method='xero_match'` | `031:130` | APPLIED but **unused** | The P3 seam — reconcile lands Xero-matched payments here. |
| `jobs.progress_billed` | `022:1,4` | APPLIED; manual-only | "Xero will feed this automatically" placeholder. |
| `carpentry_job_costs.source IN ('manual','xero')` | `065:84-85` | APPLIED; no writer | AP placeholder. |
| Retired `financeRoutes` status stub | `financeRoutes.mjs:1171-1173` | **RETIRED** | Old status stub removed in P0; comment points to `xeroRoutes.mjs`. |
| **Legacy `XeroSettings` UI** | `src/pages/FinanceManager.jsx:20-51,121` (routed at `/finance` → Settings) | **STALE-LIVE** | A SECOND "Phase 2 — coming soon" Xero pane with a disabled Connect button that competes with the real `XeroPane`, and calls `authFetch` directly (apiFetch-standard violation). **Cleanup candidate.** |

**Internal AR engine Xero will eventually feed (BUILT-LIVE, entirely internal today):** progress-claim + variation lifecycles in `financeCCRoutes.mjs` (create/send/pay/void; PDFs via pdfkit; Dropbox `INTERNAL/PROGRESS CLAIMS` + `INTERNAL/VARIATIONS`; portal mirror; SMTP) — **no Xero touch yet**. `progress_billed`/cashflow computed locally. `jobRecordsFiler` has an unused `INTERNAL/INVOICES` slot (the P2 filing target).

## 6. Planned (not built)

Roadmap: `~/.claude/plans/wiggly-herding-hinton.md`. **Verified absent in code:** no `/api/webhooks/xero`, no reconcile job.

- **P2 — Hub-send:** official PDF + pay link + portal expose + correspondence. Exists only as unused mig-182 columns (`send_source`, `sent_at`, `online_invoice_url`, `pdf_storage_path`, `job_document_id`, `portal_document_id`). Will add `fetchXeroInvoicePdf`/`getOnlineInvoiceUrl` + a send route with an atomic anti-double-send lock. **Fixes the dead pay-link.**
- **P3 — webhook + reconcile:** `/api/webhooks/xero` (RAW mount, HMAC verify, Intent-to-Receive) + nightly reconcile tick → `syncXeroInvoice`. `hubStatusFromXero` already export-ready.
- **P4 — other types + portal money view:** registry entries `design_package`/`progress_claim`/`job_variation`/`deposit`; fold Xero create into the existing claim/variation send; backfill `progress_claims.xero_invoice_id`; stamp `job_id` at `convertLeadToJob`. Data model already P4-ready.

**Config prerequisites for go-live:** Web-app type; redirect URI; apply migs 174–182; set `XERO_CLIENT_ID/SECRET/ENABLED=1/ACCOUNT_CODE_DESIGN`; verify on the Demo Company.

## 7. Env vars

Defined in `.env.example` (gitignored; prod values on Railway).

| Var | Phase | In code? | Owner action |
|---|---|---|---|
| `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` | P0 | Yes | **Set on Railway** (required to connect). |
| `XERO_REDIRECT_URI` | P0 | Yes | Blank = auto `<APP_URL>/api/public/xero/callback`; must equal the Xero app's. |
| `XERO_ENABLED` | P1 | Yes | Blank = OFF. **Set `=1`** to enable invoice creation. |
| `XERO_SCOPES` | P0 | Yes (override) | **Leave UNSET** — do NOT add `openid/profile/email`. |
| `XERO_ACCOUNT_CODE_DESIGN` | P1 | Yes | Set to a Demo Company income code, or the invoice row errors. |
| `XERO_TAX_TYPE` | P1 | Yes | Optional (`OUTPUT`). |
| `XERO_BRANDING_THEME_DESIGN` | P1 | Yes | Optional. |
| `XERO_WEBHOOK_SIGNING_KEY` / `XERO_RECONCILE_ENABLED` | P3 | No (doc only) | Set when P3 is built. |
| `XERO_ACCOUNT_CODE_CONSTRUCTION` | P4 | No (doc only) | Set when P4 is built. |

## 8. Gaps, risks & follow-ups

1. **LIVE-CONNECT BLOCKER** — Xero app is a Custom Connection, not an Auth Code Web app. Developer-portal fix, not code/env. (§2)
2. **Migration 182 unapplied** — even connected + `XERO_ENABLED=1`, every P1 invoice action fails until 182 is applied.
3. **Dead pay link** — `online_invoice_url` read by `XeroInvoiceCard` but never populated until P2.
4. **Misleading duplicate UI** — `FinanceManager.jsx` stale "Phase 2 — coming soon" Xero pane competes with the real `XeroPane` and violates the apiFetch standard. Remove or redirect. *(flagged as a separate task)*
5. **Vestigial AP status** — `'xero_synced'` filtered across ~11 sites but never set. Harmless but confusing.
6. **Not create-verified** — P1's `createXeroInvoice` has never run against a real Xero org. Verify on the Demo Company.
7. **Post-104 RLS audit** — other tables created after mig 104 (145/153/154…) may also miss `deny_clients`. *(flagged as a separate task)*
8. **Deliberate plan deviations** (both intentional): raw REST instead of `xero-node`; callback at `/api/public/xero/callback` instead of the plan's `/api/finance/...`.
