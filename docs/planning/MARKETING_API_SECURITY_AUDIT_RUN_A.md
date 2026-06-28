# Marketing API Security Audit — Run A

**Doc ID:** MARKETING-API-SECURITY-AUDIT-RUN-A
**Date:** 2026-06-28
**Author:** Claude (Run A implementation)
**Branch:** `marketing-run-a`
**Mode:** Confirmation audit — **no auth-middleware changes made** (per corrected handoff / SEC-1).

---

## 1. Summary

`/api/marketing/*` and `/api/intelligence/*` are **already admin-gated** by a blanket prefix
middleware in `server/dev-api.mjs`. Run A's security task is therefore a **confirmation audit**,
not a remediation: no per-route `requireRole` was bulk-added, and the auth middleware was not
edited. The two new Run A route modules inherit the existing gate automatically.

This matches the hardening program's finding (QA-001, CLOSED 2026-06-22, validated by
`npm run test:qa-sec-baseline`) that these prefixes are inside the "solid" admin gate.

---

## 2. Blanket admin gate (confirmed in code)

`server/dev-api.mjs` registers, before the route modules:

```js
for (const prefix of [
  "/api/finance", "/api/sales",
  "/api/marketing",         // marketingRoutes (+ command/campaign routes + publishes)
  "/api/intelligence",      // marketing intelligence (public attribution/enquiry are /api/public)
  "/api/cost-intelligence", "/api/cost-model", "/api/fee-proposal", "/api/tender", "/api/templates",
]) {
  app.use(prefix, requireAuth, requireRole("admin"));
}
```

Every request to `/api/marketing/*` and `/api/intelligence/*` must pass `requireAuth` **and**
`requireRole("admin")`. `requireAuth` additionally rejects the `client` role outright.

**UI parity:** `src/lib/roles.js` → `accessMarketing: (r) => r === "admin"`. API gate == UI gate. ✅

---

## 3. Coverage

| Surface | Guard | Status |
|---|---|---|
| `/api/marketing/*` (all existing routes in `marketingRoutes.mjs`) | blanket admin + per-route `requireAuth` | Admin-only ✅ |
| `/api/marketing/command-centre` (NEW, `marketingCommandRoutes.mjs`) | blanket admin + `requireAuth` | Admin-only ✅ |
| `/api/marketing/templates`, `/campaigns/from-template`, `/planner` (NEW, `marketingCampaignRoutes.mjs`) | blanket admin + `requireAuth` | Admin-only ✅ |
| Reserved stubs `/api/marketing/{automation,publish,paid,video/editor}` (NEW, 501) | blanket admin + `requireAuth` | Admin-only ✅ |
| `/api/intelligence/*` | blanket admin | Admin-only ✅ |
| `/api/intelligence/sync/*` | blanket admin (+ explicit admin) | Admin-only ✅ |
| `/api/marketing/music/*` | blanket admin (+ explicit `requireRole("admin")`) | Admin-only ✅ |

**New Run A routes:** registered via `registerMarketingCampaignRoutes(app)` and
`registerMarketingCommandRoutes(app)` immediately after `registerMarketingRoutes(app)` — all under
the `/api/marketing` prefix, so all inherit the blanket gate. No new public surface introduced.

---

## 4. Routes intentionally outside the gate (public by design — NOT changed)

| Route | Status | Notes |
|---|---|---|
| `POST /api/public/attribution` | Public (no auth) | Marketing attribution capture — public by design (QA-001 §3). Do **not** add staff auth. |
| `POST /api/public/enquiry` | Public (no auth) | Website enquiry — public by design; protection is honeypot + rate-limit (W01-SEC-003, hardening stream). |

These live under `/api/public`, not `/api/marketing`/`/api/intelligence`, so they are correctly
outside the admin gate. Run A made **no changes** to them — they are owned by the hardening stream.

---

## 5. Future marketing-role chokepoint

When/if Josh moves to a dedicated non-admin `marketing` role (Stage 2+, requires explicit Sam
approval — out of Run A scope):

- The **single chokepoint** is the blanket loop line in `dev-api.mjs`: change
  `requireRole("admin")` → `requireRole("admin", "marketing")` for `/api/marketing`
  (and decide `/api/intelligence` separately).
- `requireRole(...roles)` is variadic with **no hierarchy**, so the new role must be added explicitly.
- Per-route guards (e.g. music admin-only) would then become meaningful and should be re-reviewed.

No such change was made in Run A.

---

## 6. Verdict

| Question | Answer |
|---|---|
| Marketing API looser than UI? | **No** — both admin-only. |
| Code changes needed to secure Run A routes? | **No** — new routes inherit the blanket gate. |
| Per-route `requireRole` bulk-added? | **No** — would be redundant churn; not done. |
| `dev-api.mjs` auth middleware edited? | **No.** |
| Public attribution/enquiry touched? | **No** — public by design, hardening-owned. |
| Baseline test re-run? | Recommended: `npm run test:qa-sec-baseline` on staging (boots full API; not run in this worktree to avoid live integration side effects + shared-DB without migration 122). |

**Outcome:** API security posture for Run A is correct as-is; the audit confirms it and changes nothing.
