---
sop_version: 1.0
last_reviewed: 2026-08-16
app_version: main
screenshot_status: placeholders_only
owner: Finance (Admin / Director)
test_status: untested
---

# SOP: Connect Xero (accounts-receivable / client invoices)

**Module:** Finance
**SOP ID:** 09-13
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Admin (Director). One-time setup, then rarely (only to reconnect).

## 2. When to use it
Once, to link the Blue Leaf Xero organisation so the Hub can raise **client invoices** (concept fees, design packages, progress claims, variations) as real Xero invoices. Also used to **reconnect** if Xero ever asks (a refresh token can expire after 60 days of no use).

## 3. What this does
Runs Xero's secure sign-in (OAuth) and stores the connection so the Hub can, in later phases, create AUTHORISED invoices in Xero, fetch the official branded PDF + pay link, and track paid/unpaid status. **This phase (P0) only establishes the connection** — the "Create invoice" buttons arrive in the next phases. Xero stays the accounting source of truth; the Hub records why/when an invoice is raised and sends the branded email.

> The connection is per-organisation. The tokens live in the `xero_credentials` table, never in the browser. Xero rotates the refresh token on every use — the Hub persists the new one automatically, so you should almost never need to reconnect.

## 4. Before you start
- A Xero app exists at developer.xero.com (Auth Code grant) with **redirect URI** `https://blueleafhub.com.au/api/public/xero/callback` and scopes `openid profile email offline_access accounting.transactions accounting.contacts accounting.settings`.
- Server env set: `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` (Railway + local). Optional: `XERO_REDIRECT_URI` (defaults to the URL above).
- You can sign in to the **Xero organisation** you want to connect. For first-time testing, connect the **Xero Demo Company**, not the live org.

## 5. Step-by-step process
1. Go to **Settings → Integrations → Xero**.
2. If it says **Not configured**, the server env isn't set yet — the pane shows the exact redirect URI to register. Fix the env, then reload.
3. Click **Connect Xero**. You're sent to Xero's sign-in page.
4. Sign in, choose the organisation (Demo Company for testing), and **Allow access**.
5. Xero returns you to the Hub. The pane now shows **Connected — [organisation name]** with a healthy token.
6. To switch orgs later, click **Reconnect**. To unlink, click **Disconnect**.

[insert screenshot: Xero pane — Connect button]
[insert screenshot: Xero pane — Connected state]

## 6. What happens next
Nothing is billed yet. Once connected, the later phases light up: a **Create invoice in Xero** action on accepted concept fees, then Hub-sends of the official PDF, then automatic paid/unpaid sync. Invoicing stays OFF until `XERO_ENABLED=1` is set on the server.

## 7. Common mistakes

| Mistake | Why | Avoid |
|---|---|---|
| Connecting the live org during testing | Real invoices could be raised later | Connect the Demo Company first. |
| Redirect URI mismatch | Xero rejects the sign-in | The Xero app's redirect URI must match the one in the pane **exactly**. |
| Expecting invoices immediately | P0 is connection only | The create/send buttons arrive in later phases. |

## 8. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| "Not configured" | `XERO_CLIENT_ID`/`SECRET` unset | Set them on the server and reload. |
| "invalid_state" after sign-in | The sign-in took >10 min or the link was reused | Click **Connect Xero** again and complete it promptly. |
| "unauthorized_client" / redirect error | Redirect URI mismatch | Make the Xero app's redirect URI equal the pane's exactly. |
| Shows "Not connected" after allowing | Xero returned no organisation, or the DB write failed | Retry; check the org is active in Xero. |
| Later: "reconnect Xero" | Refresh token expired (60-day inactivity) | Click **Reconnect**. |

## 9. Related modules
- [Create a progress claim](finance_create_progress_claim.md) · [Create and send a variation](finance_create_variation.md) · [Concept agreement](../02_sales/02-16_concept_agreement.md)

## 10. Screenshot placeholders
[insert screenshot: Not configured — redirect URI shown] [insert screenshot: Connected — tenant + token health]

## 11. Automation notes
- **Connect** → `GET /api/finance/xero/connect` (admin) builds a Xero authorize URL with a **self-signed `state`** (HMAC over a nonce+timestamp using the client secret; valid 10 min) and returns it; the browser navigates there.
- **Callback** → `GET /api/public/xero/callback` (**public** — Xero sends no bearer token; it can't sit behind the `/api/finance` admin guard) validates `state`, exchanges the code for tokens, calls `GET /connections` to discover the org(s), and upserts one `xero_credentials` row per tenant. Redirects back to `/settings/integrations#xero` with `?xero_connected=1` or `?xero_error=`.
- **Status** → `GET /api/finance/xero/status` (admin) reports `configured` / `connected` / `tenant` / token freshness / the redirect URI.
- **Disconnect** → `POST /api/finance/xero/disconnect` (admin) deletes the stored tokens (Xero-side revocation is manual in Xero).
- **Token rotation** → `getXeroAccessToken` refreshes the 30-min access token and persists Xero's **rotated refresh token atomically** (compare-and-swap on the old token + an in-process per-tenant lock), so a restart or a second worker never loses it. On `invalid_grant` it surfaces "reconnect required" rather than looping.
- Everything is **fail-soft**: with `XERO_*` unset, status returns `configured:false` and no other Xero code runs.

## 12. Edge cases and limits
- Only one organisation is operated at a time; connecting a second org just adds a row and the most-recently-refreshed one is used.
- The connection is org-wide, not per-user — any admin sees the same connected state.
- The refresh token rotates on every use; never copy tokens out of the DB by hand.

## 13. Owner of the process
Finance (Admin / Director). Next review: 2027-02-16

---

## 14. Troubleshoot Agent Test Script

> Requires `XERO_CLIENT_ID`/`XERO_CLIENT_SECRET` set and a Xero app whose redirect URI matches. Use the **Xero Demo Company**. Admin token.

### Test cases
**TC-01 — Not configured** With `XERO_CLIENT_ID` unset, open Settings → Integrations → Xero → shows **Not configured** with the redirect URI; no console/network error. [ ] Pass [ ] Fail
**TC-02 — Status shape** `GET /api/finance/xero/status` (admin) → `{ ok:true, configured, enabled, connected, redirectUri }`; `redirectUri` ends `/api/public/xero/callback`. [ ] Pass [ ] Fail
**TC-03 — Connect round-trip** Click **Connect Xero** → Xero sign-in → allow (Demo Company) → returns to the pane showing **Connected — Demo Company**; a `xero_credentials` row exists with a non-null refresh token + a future `expires_at`. [ ] Pass [ ] Fail
**TC-04 — Wrong role** A non-admin token calling `GET /api/finance/xero/connect` → 403 (blanket `/api/finance` admin guard). [ ] Pass [ ] Fail
**TC-05 — Bad state** Hit `/api/public/xero/callback?code=x&state=tampered` → redirects to `…#xero` with `xero_error=invalid_state`; no tokens written. [ ] Pass [ ] Fail
**TC-06 — Rotation persists** With a connected org, set the row's `expires_at` to the past, then trigger any Xero call (or wait for a status that forces a refresh) → the stored `refresh_token` changes to a new value, the old one is gone, and no error surfaces. [ ] Pass [ ] Fail
**TC-07 — Disconnect** Click **Disconnect** → confirm → pane shows **Not connected**; `xero_credentials` is empty. [ ] Pass [ ] Fail

### Post-test checklist
- [ ] All passed · [ ] No console/network errors · [ ] `xero_credentials` correct · [ ] Update test_status · [ ] Changelog entry
