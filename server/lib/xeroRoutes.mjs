/**
 * xeroRoutes.mjs — Xero connection endpoints (P0 of the AR / client-invoice integration).
 *
 *   GET  /api/finance/xero/status      (admin)  — configured? connected? tenant + token freshness
 *   GET  /api/finance/xero/connect     (admin)  — returns the Xero authorize URL to open
 *   POST /api/finance/xero/disconnect  (admin)  — forget the stored tokens
 *   GET  /api/public/xero/callback     (public) — Xero redirects here; exchange the code + store
 *
 * /api/finance/* is already gated admin-only by the blanket guard in dev-api.mjs (:986),
 * so status/connect/disconnect need no per-route auth. The callback lives under /api/public
 * because Xero redirects to it with NO bearer token — it can't sit behind the finance guard.
 *
 * Everything is fail-soft: with XERO_* unset, status reports configured:false and nothing
 * throws. Registered by dev-api.mjs after the finance registrations.
 */
import { ok, err } from "./apiResponse.mjs";
import { appBaseUrl } from "./appUrl.mjs";
import {
  xeroConfigured, signState, verifyState, buildAuthorizeUrl,
  exchangeCodeForTokens, getConnectedTenant, disconnectXero, xeroRedirectUri,
} from "./xeroClient.mjs";

const xeroEnabled = () => process.env.XERO_ENABLED === "1" || process.env.XERO_ENABLED === "true";

export function registerXeroRoutes(app) {
  // Connection status — drives the Settings → Xero pane.
  app.get("/api/finance/xero/status", async (_req, res) => {
    if (!xeroConfigured()) {
      return ok(res, { configured: false, enabled: xeroEnabled(), connected: false, redirectUri: xeroRedirectUri() });
    }
    let tenant = null;
    try { tenant = await getConnectedTenant(); } catch { tenant = null; }
    const expMs = tenant?.expires_at ? new Date(tenant.expires_at).getTime() : 0;
    return ok(res, {
      configured: true,
      enabled: xeroEnabled(),
      connected: !!tenant,
      tenant: tenant?.tenant_name || null,
      tenantId: tenant?.tenant_id || null,
      tokenExpiresAt: tenant?.expires_at || null,
      // Access tokens live 30 min; a stale one just triggers a silent refresh on next call.
      tokenFresh: expMs ? Date.now() < expMs - 60_000 : false,
      redirectUri: xeroRedirectUri(),
    });
  });

  // Build the authorize URL (the frontend opens it — apiFetch can't follow a cross-origin redirect).
  app.get("/api/finance/xero/connect", (_req, res) => {
    if (!xeroConfigured()) return err(res, 400, "Xero is not configured — set XERO_CLIENT_ID and XERO_CLIENT_SECRET.");
    try {
      return ok(res, { url: buildAuthorizeUrl(signState()) });
    } catch (e) {
      return err(res, 500, e?.message || "Could not build the Xero authorize URL.");
    }
  });

  app.post("/api/finance/xero/disconnect", async (_req, res) => {
    try { await disconnectXero(); return ok(res); }
    catch (e) { return err(res, 500, e?.message || "Could not disconnect Xero."); }
  });

  // PUBLIC — Xero redirects here after the user approves (no bearer token). Validate the
  // signed state, exchange the code, then bounce back into the Settings pane with a flag.
  app.get("/api/public/xero/callback", async (req, res) => {
    const base = appBaseUrl();
    // Xero is a sub-pane of the Integrations settings category, addressed by #xero hash.
    const fail = (reason) => res.redirect(`${base}/settings/integrations?xero_error=${encodeURIComponent(reason)}#xero`);
    try {
      const { code, state, error: oauthErr } = req.query;
      if (oauthErr) return fail(String(oauthErr));
      if (!code || !verifyState(state)) return fail("invalid_state");
      await exchangeCodeForTokens(String(code));
      return res.redirect(`${base}/settings/integrations?xero_connected=1#xero`);
    } catch (e) {
      return fail(e?.message || "connect_failed");
    }
  });
}
