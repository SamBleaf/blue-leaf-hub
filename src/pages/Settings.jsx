import { authFetch } from "../lib/authFetch.js";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/useAuth.js";
import { Link } from "react-router-dom";
import RfqSettingsModal from "../components/RfqSettingsModal.jsx";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";
import { loadNotificationPrefs, saveNotificationPrefs } from "../lib/notificationPrefs.js";
import { loadCompanySettings, persistCompanyLogoDataUrl, saveCompanySettings } from "../lib/companySettings.js";
import AICostWidget from "../components/settings/AICostWidget.jsx";
import CompanyCostModel from "../components/settings/CompanyCostModel.jsx";
import RolePreviewConsole from "../components/settings/RolePreviewConsole.jsx";
const BE_UI_STORAGE = "blhub_buildexact_ui_v1";

async function syncUserSetting(key, value) {
  const sb = getSupabase();
  if (!sb) return;
  const payload = { key, value: typeof value === "string" ? value : JSON.stringify(value), updated_at: new Date().toISOString() };
  await sb.from("user_settings").upsert(payload, { onConflict: "key" });
}

export default function Settings({ section, sections } = {}) {
  const active = sections || (section != null ? [section] : null);
  const show = (k) => !active || active.includes(k);
  const [sigOpen, setSigOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [prefs, setPrefs] = useState(() => loadNotificationPrefs());
  const [syncNote, setSyncNote] = useState("");
  const [co, setCo] = useState(() => loadCompanySettings());

  const handleCompanyLogo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg)$/i.test(file.type)) {
      alert("Please upload a PNG or JPEG image.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result;
      if (typeof base64 === "string") {
        persistCompanyLogoDataUrl(base64);
        setCo((c) => ({ ...c, logoDataUrl: base64 }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  const [beStatus, setBeStatus] = useState(null);
  const [whEvents, setWhEvents] = useState([]);
  const [poSeq, setPoSeq] = useState(null);
  const [beEmail, setBeEmail] = useState("");
  const [beApiKey, setBeApiKey] = useState("");
  const [beTestMsg, setBeTestMsg] = useState("");

  const refreshStatus = useCallback(async () => {
    try {
      const res = await authFetch("/api/integrations/status");
      const j = await res.json().catch(() => null);
      setStatus(j);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BE_UI_STORAGE);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (typeof o?.email === "string") setBeEmail(o.email);
      if (typeof o?.apiKey === "string") setBeApiKey(o.apiKey);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshBuildexact = useCallback(async () => {
    try {
      const [sRes, wRes] = await Promise.all([
        authFetch("/api/buildexact/status"),
        authFetch("/api/buildexact/webhook-events")
      ]);
      const s = await sRes.json().catch(() => null);
      const w = await wRes.json().catch(() => null);
      setBeStatus(s);
      setWhEvents(w?.items || []);
    } catch {
      setBeStatus(null);
      setWhEvents([]);
    }
  }, []);

  useEffect(() => {
    refreshBuildexact();
  }, [refreshBuildexact]);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const sb = getSupabase();
    sb.from("sequences").select("current_value").eq("id", "po_number").maybeSingle().then(({ data }) => {
      if (data?.current_value != null) setPoSeq(data.current_value);
    });
  }, []);

  const savePrefs = (patch) => {
    const next = saveNotificationPrefs(patch);
    setPrefs(next);
    if (supabaseConfigured) {
      syncUserSetting("notifications", next).then(
        () => setSyncNote("Saved to Supabase."),
        () => setSyncNote("Saved on this device (Supabase sync failed).")
      );
    } else {
      setSyncNote("Saved on this device.");
    }
  };

  return (
    <div className="space-y-10">
      {!active ? (
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Global</p>
          <h1 className="text-3xl font-semibold text-primary tracking-tight">Settings</h1>
          <p className="max-w-2xl text-sm text-muted">
            Email signature, mail & Dropbox connection status, and notification defaults. OAuth tokens stay in{" "}
            <code className="rounded bg-page px-1 py-0.5 text-xs">.env</code> on the machine running the API — use the auth
            scripts from a terminal.
          </p>
          <Link
            to="/tender-manager/rfq-engine"
            className="inline-block text-sm font-semibold text-accent underline-offset-2 hover:underline"
          >
            ← Back to RFQ Engine
          </Link>
        </header>
      ) : null}

      {/* Legacy full-page only — these have their own routed panes (/settings/ai-usage and
          /settings/cost-model render <AICostWidget/> and <CompanyCostModel/> directly), so they
          must NOT also appear on the Company (general) pane. */}
      {!active ? <AICostWidget /> : null}

      {!active ? <CompanyCostModel /> : null}

      {!active ? (
        <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-primary">Data Cleanup</h2>
          <p className="mt-1 text-sm text-muted">
            Remove test-marked records (BLH TEST / __BATCH_A__ / __E2E / __DRYRUN / __DEMO…) left over from building.
            Admin only; deletes test data only.
          </p>
          <Link
            to="/settings/data-cleanup"
            className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            Open Data Cleanup →
          </Link>
        </section>
      ) : null}

      {show("email-signature") ? (
        <section id="email-signature" className="scroll-mt-24 rounded-card border border-hairline bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-primary">Email signature</h2>
          <p className="mt-1 text-sm text-muted">Your personal signature, used on emails you send (RFQ, reminders, the recipient blast). Each account sets its own; admins can also set a team default.</p>
          <button
            type="button"
            onClick={() => setSigOpen(true)}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
          >
            Edit signature
          </button>
        </section>
      ) : null}

      {show("mail") ? (
        <section id="mail" className="scroll-mt-24 rounded-card border border-hairline bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-primary">Gmail (API)</h2>
          <p className="mt-2 text-sm text-muted">
            Status from the dev API. Sending prefers Gmail when <code className="text-xs">GMAIL_REFRESH_TOKEN</code> is set,
            otherwise SMTP.
          </p>
          <div className="mt-4 rounded-lg border border-hairline bg-page px-4 py-3 text-sm">
            {status ? (
              <ul className="space-y-1 text-ink">
                <li>
                  <span className="font-semibold">Configured:</span> {status.gmail?.configured ? "Yes" : "No"}
                </li>
                {status.gmail?.sender ? (
                  <li>
                    <span className="font-semibold">Sender:</span> {status.gmail.sender}
                  </li>
                ) : null}
                <li>
                  <span className="font-semibold">SMTP fallback:</span> {status.smtp?.configured ? "Yes" : "No"}
                </li>
              </ul>
            ) : (
              <p className="text-muted">Could not reach /api/integrations/status — is the API running?</p>
            )}
          </div>
          <p className="mt-4 text-xs text-muted">
            <strong>Connect:</strong> add <code className="text-xs">GMAIL_CLIENT_ID</code> and{" "}
            <code className="text-xs">GMAIL_CLIENT_SECRET</code> to <code className="text-xs">.env</code>, then run{" "}
            <code className="text-xs">npm run auth:gmail</code>, paste the refresh token into{" "}
            <code className="text-xs">GMAIL_REFRESH_TOKEN</code>, set <code className="text-xs">GMAIL_SENDER_EMAIL</code>, restart{" "}
            <code className="text-xs">npm run dev</code>.
          </p>
          <p className="mt-2 text-xs text-muted">
            <strong>Google Cloud Console:</strong> enable Gmail API, create OAuth client, add redirect URI matching{" "}
            <code className="text-xs">GMAIL_REDIRECT_URI</code> (default <code className="text-xs">http://localhost:8787/auth/gmail/callback</code>
            ).
          </p>
        </section>
      ) : null}

      {show("dropbox") ? (
        <section id="dropbox" className="scroll-mt-24 rounded-card border border-hairline bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-primary">Dropbox</h2>
          <p className="mt-2 text-sm text-muted">Used to create job folders and (later) upload quotes.</p>
          <div className="mt-4 rounded-lg border border-hairline bg-page px-4 py-3 text-sm">
            {status ? (
              <p className="text-ink">
                <span className="font-semibold">Configured:</span> {status.dropbox?.configured ? "Yes" : "No"}
              </p>
            ) : null}
          </div>
          <p className="mt-4 text-xs text-muted">
            <strong>Connect:</strong> create a Dropbox app with the scopes in <code className="text-xs">scripts/dropbox-auth.mjs</code>, add{" "}
            <code className="text-xs">DROPBOX_APP_KEY</code> / <code className="text-xs">DROPBOX_APP_SECRET</code>, run{" "}
            <code className="text-xs">npm run auth:dropbox</code>, then add <code className="text-xs">DROPBOX_REFRESH_TOKEN</code> and restart the API.
          </p>
          <p className="mt-2 text-xs text-muted">
            <strong>Folder layout:</strong> shared tender files live under{" "}
            <code className="text-xs">BLUE LEAF BUILDING/PROJECTS/BLUE LEAF BUILDING/[JOB]/</code>; private RFQs, quotes, and presale
            docs under <code className="text-xs">BLUE LEAF BUILDING/INTERNAL/[JOB]/</code>. RFQ emails only include a link to the shared
            folder.
          </p>
          <p className="mt-2 text-xs text-muted">
            <strong>Private INTERNAL privacy:</strong> set <code className="text-xs">DROPBOX_INTERNAL_VIEWER_EMAILS</code> in{" "}
            <code className="text-xs">.env</code> to comma-separated Dropbox login emails. After the private job folder is created, the
            API shares that path with those viewers and attempts <code className="text-xs">no_inherit</code> on Dropbox Business team
            folders. The OAuth account always retains access.
          </p>
        </section>
      ) : null}

      {show("notifications") ? (
        <section id="notifications" className="scroll-mt-24 rounded-card border border-hairline bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-primary">Notifications</h2>
          <p className="mt-1 text-sm text-muted">Stored in localStorage; synced to Supabase table user_settings when configured.</p>
          <div className="mt-4 space-y-4">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={prefs.reminderAuto}
                onChange={(e) => savePrefs({ reminderAuto: e.target.checked })}
                className="h-4 w-4 rounded border-hairline"
              />
              Send reminder emails automatically (server must set REMINDER_CRON_ENABLED=true)
            </label>
            <label className="block text-sm">
              <span className="font-semibold text-ink">Reminder timing (days before deadline)</span>
              <select
                className="mt-1 w-full max-w-xs rounded-lg border border-hairline bg-page px-3 py-2"
                value={String(prefs.reminderDaysBefore)}
                onChange={(e) => savePrefs({ reminderDaysBefore: Number(e.target.value) })}
              >
                <option value="1">1 day</option>
                <option value="2">2 days</option>
                <option value="3">3 days</option>
              </select>
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={prefs.emailOnQuoteReceived}
                onChange={(e) => savePrefs({ emailOnQuoteReceived: e.target.checked })}
                className="h-4 w-4 rounded border-hairline"
              />
              Email me when a quote is received (planned — requires inbox automation)
            </label>
          </div>
          {syncNote ? <p className="mt-3 text-xs text-muted">{syncNote}</p> : null}
        </section>
      ) : null}

      {show("company") ? (
      <section id="company" className="scroll-mt-24 rounded-card border border-hairline bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary">Company details</h2>
        <p className="mt-1 text-sm text-muted">Used on Purchase Order PDFs. Stored in this browser.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-semibold text-ink">Company name</span>
            <input
              className="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
              value={co.companyName}
              onChange={(e) => setCo({ ...co, companyName: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-ink">ABN</span>
            <input
              className="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
              value={co.abn}
              onChange={(e) => setCo({ ...co, abn: e.target.value })}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-semibold text-ink">Address</span>
            <input
              className="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
              value={co.address}
              onChange={(e) => setCo({ ...co, address: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-ink">Phone</span>
            <input
              className="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
              value={co.phone}
              onChange={(e) => setCo({ ...co, phone: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-ink">Email</span>
            <input
              className="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
              value={co.email}
              onChange={(e) => setCo({ ...co, email: e.target.value })}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-semibold text-ink">Website</span>
            <input
              className="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
              value={co.website}
              onChange={(e) => setCo({ ...co, website: e.target.value })}
            />
          </label>
          <div className="block text-sm sm:col-span-2">
            <span className="font-semibold text-ink">Company logo for PDFs</span>
            <p className="mt-0.5 text-xs text-muted">PNG or JPEG — stored on this device for purchase order headers.</p>
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="mt-2 text-xs"
              onChange={handleCompanyLogo}
            />
            {co.logoDataUrl ? (
              <img
                src={co.logoDataUrl}
                alt="Company logo preview"
                className="mt-2 max-w-[120px] rounded border border-hairline"
              />
            ) : null}
            {co.logoDataUrl ? (
              <button
                type="button"
                className="mt-2 block text-xs font-semibold text-danger"
                onClick={() => {
                  persistCompanyLogoDataUrl("");
                  setCo((c) => ({ ...c, logoDataUrl: "" }));
                }}
              >
                Remove logo
              </button>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
          onClick={() => {
            saveCompanySettings(co);
            setSyncNote("Company details saved on this device.");
          }}
        >
          Save company details
        </button>
      </section>
      ) : null}

      {show("buildexact") ? (
      <section id="buildexact" className="scroll-mt-24 rounded-card border border-hairline bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary">Buildexact</h2>
        <p className="mt-1 text-sm text-muted">
          API v3 uses your Buildxact login email and API key (same value in <code className="text-xs">Ocp-Apim-Subscription-Key</code> and login
          body). Store secrets in <code className="text-xs">.env</code> on the machine running the API. Fields below are saved in this browser for
          quick testing; the server also accepts them in the test request body.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="font-semibold text-ink">Username (email)</span>
            <input
              type="email"
              autoComplete="username"
              className="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
              value={beEmail}
              onChange={(e) => setBeEmail(e.target.value)}
              placeholder="sam@example.com"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-semibold text-ink">API key</span>
            <input
              type="password"
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-hairline px-3 py-2 font-mono text-sm"
              value={beApiKey}
              onChange={(e) => setBeApiKey(e.target.value)}
              placeholder="From Buildxact / Azure APIM"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-hairline bg-page px-3 py-2 text-xs font-semibold text-ink"
            onClick={() => {
              try {
                localStorage.setItem(BE_UI_STORAGE, JSON.stringify({ email: beEmail.trim(), apiKey: beApiKey.trim() }));
                setSyncNote("Buildexact email & key saved in this browser only.");
              } catch {
                setSyncNote("Could not save to localStorage.");
              }
            }}
          >
            Save locally
          </button>
        </div>
        <div className="mt-4 rounded-lg border border-hairline bg-page px-4 py-3 text-sm">
          <p className="font-semibold text-ink">Token status (API process memory)</p>
          {beStatus?.token ? (
            <ul className="mt-2 space-y-1 text-xs text-muted">
              <li>
                <span className="font-semibold text-ink">Configured:</span> {beStatus.configured ? "Yes" : "No"}
              </li>
              <li>
                <span className="font-semibold text-ink">Credential source:</span> {beStatus.token.credentialSource}
              </li>
              <li>
                <span className="font-semibold text-ink">Access token cached:</span> {beStatus.token.hasCachedToken ? "Yes" : "No"}
              </li>
              <li>
                <span className="font-semibold text-ink">Token valid (not near expiry):</span>{" "}
                {beStatus.token.tokenValid ? (
                  <span className="text-accent">Yes</span>
                ) : (
                  <span className="text-warning">No</span>
                )}
              </li>
              <li>
                <span className="font-semibold text-ink">Expires (UTC):</span> {beStatus.token.expiresAt || "—"}
              </li>
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted">Could not load status — is the API running?</p>
          )}
          {beStatus?.webhookUrl ? (
            <div className="mt-4 border-t border-hairline pt-3">
              <span className="font-semibold text-ink">Webhook URL (register in Buildexact after deploy):</span>
              <div className="mt-1 flex flex-wrap items-center gap-2 break-all rounded bg-surface px-2 py-2 font-mono text-[11px]">
                {beStatus.webhookUrl}
              </div>
              <button
                type="button"
                className="mt-2 rounded border border-hairline px-3 py-1 text-xs font-semibold"
                onClick={() => navigator.clipboard.writeText(beStatus.webhookUrl)}
              >
                Copy URL
              </button>
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted">
          Leave email and API key empty and click Test to authenticate using <code className="text-xs">.env</code> only (clears any prior session override on the API).
        </p>
        <button
          type="button"
          className="mt-4 rounded-lg border border-accent bg-accent/10 px-3 py-2 text-xs font-semibold text-accent"
          onClick={async () => {
            setBeTestMsg("Testing…");
            try {
              const email = beEmail.trim();
              const apiKey = beApiKey.trim();
              const body =
                email && apiKey ? { email, apiKey } : {};
              const res = await authFetch("/api/buildexact/test-connection", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
              });
              const j = await res.json().catch(() => ({}));
              if (!res.ok || !j.ok) {
                setBeTestMsg(j.error || `Failed (${res.status})`);
              } else {
                setBeTestMsg("Login succeeded — token cached on the API.");
                await refreshBuildexact();
              }
            } catch (e) {
              setBeTestMsg(e?.message || String(e));
            }
          }}
        >
          Test connection (login)
        </button>
        {beTestMsg ? <p className="mt-2 text-xs text-muted">{beTestMsg}</p> : null}
        <h3 className="mt-6 text-sm font-bold text-muted">Recent webhook events (last 10)</h3>
        {whEvents.length === 0 ? (
          <p className="mt-2 text-xs text-muted">None logged yet — or API has no Supabase service role for reads.</p>
        ) : (
          <div className="mt-2 overflow-x-auto text-xs">
            <table className="min-w-full border border-hairline">
              <thead className="bg-page">
                <tr>
                  <th className="px-2 py-1 text-left">Type</th>
                  <th className="px-2 py-1 text-left">Received</th>
                  <th className="px-2 py-1 text-left">Matched</th>
                  <th className="px-2 py-1 text-left">Processed</th>
                </tr>
              </thead>
              <tbody>
                {whEvents.map((ev) => (
                  <tr key={ev.id} className="border-t border-hairline">
                    <td className="px-2 py-1">{ev.event_type}</td>
                    <td className="px-2 py-1">{ev.received_at ? new Date(ev.received_at).toLocaleString("en-AU") : "—"}</td>
                    <td className="px-2 py-1 font-mono">{ev.matched_project_id || "—"}</td>
                    <td className="px-2 py-1">{ev.processed ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : null}

      {show("purchase-orders") ? (
      <section id="purchase-orders" className="scroll-mt-24 rounded-card border border-hairline bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary">Purchase orders</h2>
        <p className="mt-1 text-sm text-muted">Prefix and default terms for PDF page 2.</p>
        <label className="mt-3 block text-sm">
          <span className="font-semibold text-ink">PO prefix</span>
          <input
            className="mt-1 w-32 rounded-lg border border-hairline px-3 py-2 text-sm"
            value={co.poPrefix}
            onChange={(e) => setCo({ ...co, poPrefix: e.target.value.toUpperCase() })}
          />
        </label>
        <p className="mt-3 text-sm text-muted">
          Current sequence (read-only): <strong>{poSeq ?? "—"}</strong> (increments when a PO is issued)
        </p>
        <label className="mt-4 block text-sm">
          <span className="font-semibold text-ink">Default terms &amp; conditions (page 2)</span>
          <textarea
            className="mt-1 min-h-[200px] w-full rounded-lg border border-hairline px-3 py-2 font-mono text-xs"
            value={co.defaultPoTerms}
            onChange={(e) => setCo({ ...co, defaultPoTerms: e.target.value })}
          />
        </label>
        <button
          type="button"
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
          onClick={() => {
            saveCompanySettings(co);
            setSyncNote("PO settings saved on this device.");
          }}
        >
          Save PO settings
        </button>
      </section>
      ) : null}

      {show("email-signature") && sigOpen ? (
        <RfqSettingsModal
          onClose={() => setSigOpen(false)}
          onApplied={() => {
            setSyncNote("Signature saved on this device.");
          }}
        />
      ) : null}

      {/* Google (Drive + Marketing Intelligence) */}
      {show("google") ? (
        <div id="google" className="scroll-mt-24">
          <GoogleIntegrationSection status={status} />
        </div>
      ) : null}

      {/* Meta (Instagram + Facebook Insights) */}
      {show("meta") ? (
        <div id="meta" className="scroll-mt-24">
          <MetaIntegrationSection status={status} />
        </div>
      ) : null}

      {/* Resend (mailing list + CRM email) */}
      {show("resend") ? (
        <div id="resend" className="scroll-mt-24">
          <ResendIntegrationSection status={status} />
        </div>
      ) : null}

      {show("workforce-rules") ? (
        <div id="workforce-rules" className="scroll-mt-24">
          <WorkforceSettingsSection onSaved={() => setSyncNote("Workforce settings saved.")} />
        </div>
      ) : null}

      {show("role-preview") ? (
        <div id="role-preview" className="scroll-mt-24">
          <RolePreviewConsole />
        </div>
      ) : null}
    </div>
  );
}

// ── Google Integration ────────────────────────────────────────────────────────

function StatusBadge({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${ok ? "text-accent" : "text-warning"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-accent" : "bg-warning"}`} />
      {ok ? `${label} connected` : `${label} not configured`}
    </span>
  );
}

function GoogleIntegrationSection({ status }) {
  const g = status?.google;
  return (
    <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-primary">Google</h2>
      <p className="mt-1 text-sm text-muted">
        One OAuth credential set (<code className="text-xs">GOOGLE_DRIVE_*</code>) powers Google Drive, Search Console, GA4, and Google Business Profile.
        All keys are set in Railway environment variables — not editable in the browser.
      </p>

      {/* OAuth base status */}
      <div className="mt-4 rounded-lg border border-hairline bg-page px-4 py-3 space-y-2">
        <p className="text-xs font-semibold text-ink mb-2">OAuth credential status</p>
        <StatusBadge ok={g?.oauthConfigured} label="Google OAuth (GOOGLE_DRIVE_CLIENT_ID / SECRET / REFRESH_TOKEN)" />
      </div>

      {/* Per-service status */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-hairline bg-page px-4 py-3">
          <p className="text-xs font-semibold text-ink mb-2">Google Drive</p>
          <StatusBadge ok={g?.drive} label="Drive" />
          <p className="mt-2 text-xs text-muted">Used for fee proposal DOCX export to Google Docs. Requires base OAuth above.</p>
        </div>
        <div className="rounded-lg border border-hairline bg-page px-4 py-3">
          <p className="text-xs font-semibold text-ink mb-2">Search Console</p>
          <StatusBadge ok={g?.gsc} label="GSC" />
          {g?.siteUrl && <p className="mt-1 text-xs text-muted font-mono truncate">{g.siteUrl}</p>}
          <p className="mt-2 text-xs text-muted">
            Add <code className="text-xs">GOOGLE_SEARCH_CONSOLE_SITE_URL</code> to Railway (e.g. <code className="text-xs">https://www.blueleafbuilding.com.au/</code>).
          </p>
        </div>
        <div className="rounded-lg border border-hairline bg-page px-4 py-3">
          <p className="text-xs font-semibold text-ink mb-2">Google Analytics 4</p>
          <StatusBadge ok={g?.ga4} label="GA4" />
          {g?.ga4PropertyId && <p className="mt-1 text-xs text-muted font-mono">{g.ga4PropertyId}</p>}
          <p className="mt-2 text-xs text-muted">
            Add <code className="text-xs">GA4_PROPERTY_ID</code> to Railway — numeric property ID from your GA4 account (e.g. <code className="text-xs">123456789</code>).
          </p>
        </div>
        <div className="rounded-lg border border-hairline bg-page px-4 py-3">
          <p className="text-xs font-semibold text-ink mb-2">Google Business Profile</p>
          <StatusBadge ok={g?.gbp} label="GBP" />
          {g?.gbpLocationId && <p className="mt-1 text-xs text-muted font-mono">{g.gbpLocationId}</p>}
          <p className="mt-2 text-xs text-muted">
            Add <code className="text-xs">GBP_LOCATION_ID</code> to Railway — format must include prefix: <code className="text-xs">locations/XXXXXXX</code>.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 space-y-1">
        <p className="font-semibold">Adding Marketing Intelligence scopes to your existing Google OAuth</p>
        <p>Your existing Google Cloud OAuth app (used for Drive) needs these additional scopes added:</p>
        <ul className="list-disc list-inside mt-1 space-y-0.5">
          <li><code>https://www.googleapis.com/auth/webmasters.readonly</code> — Search Console</li>
          <li><code>https://www.googleapis.com/auth/analytics.readonly</code> — GA4</li>
          <li><code>https://www.googleapis.com/auth/business.manage</code> — Google Business Profile</li>
        </ul>
        <p className="mt-1">After adding scopes: re-run <code>npm run auth:drive</code> to generate a new refresh token with the additional permissions, then update <code>GOOGLE_DRIVE_REFRESH_TOKEN</code> in Railway.</p>
      </div>
    </section>
  );
}

// ── Meta Integration ──────────────────────────────────────────────────────────

function MetaIntegrationSection({ status }) {
  const m = status?.meta;
  return (
    <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-primary">Meta (Instagram + Facebook)</h2>
      <p className="mt-1 text-sm text-muted">
        Pulls post performance data (reach, engagement, saves) from Instagram and Facebook to populate the Marketing Intelligence dashboard.
        All tokens are set in Railway — not editable in the browser.
      </p>

      <div className="mt-4 rounded-lg border border-hairline bg-page px-4 py-3 space-y-2">
        <StatusBadge ok={m?.configured} label="META_ACCESS_TOKEN" />
        {m?.igUserId && (
          <p className="text-xs text-muted">Instagram User ID: <span className="font-mono">{m.igUserId}</span></p>
        )}
        {m?.pageId && (
          <p className="text-xs text-muted">Facebook Page ID: <span className="font-mono">{m.pageId}</span></p>
        )}
      </div>

      <div className="mt-4 space-y-2 text-xs text-muted">
        <p><strong className="text-ink">Connect:</strong></p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Go to Meta Business Suite → Settings → Users → System Users</li>
          <li>Create a System User with Admin role</li>
          <li>Generate a long-lived access token with scopes: <code>instagram_basic</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>instagram_manage_insights</code></li>
          <li>Add to Railway: <code>META_ACCESS_TOKEN</code> (the long-lived token)</li>
          <li>Add to Railway: <code>META_IG_USER_ID</code> — find in Instagram → Settings → Account → Professional Account</li>
          <li>Add to Railway: <code>META_PAGE_ID</code> — find in Facebook Page → About (numeric ID)</li>
        </ol>
        <p className="mt-2 text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Long-lived tokens expire after 60 days. Set a calendar reminder to renew before expiry — expired token will cause Sync Social to fail silently.
        </p>
      </div>
    </section>
  );
}

// ── Resend Integration ────────────────────────────────────────────────────────

function ResendIntegrationSection({ status }) {
  const r = status?.resend;
  return (
    <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-primary">Resend (mailing list email)</h2>
      <p className="mt-1 text-sm text-muted">
        Powers mailing list campaigns from the CRM module. Required for sending marketing emails to contacts at scale.
        Gmail handles individual transactional emails (variations, claims, portal invites) — Resend handles bulk sends.
      </p>

      <div className="mt-4 rounded-lg border border-hairline bg-page px-4 py-3">
        <StatusBadge ok={r?.configured} label="RESEND_API_KEY" />
      </div>

      <div className="mt-4 space-y-2 text-xs text-muted">
        <p><strong className="text-ink">Connect:</strong></p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Sign up at <strong>resend.com</strong> (free tier: 100 emails/day, 3,000/month)</li>
          <li>Go to API Keys → Create API Key → Full access</li>
          <li>Add to Railway: <code>RESEND_API_KEY</code></li>
          <li>Verify your sending domain: Resend → Domains → Add → enter <code>blueleafbuilding.com.au</code></li>
          <li>Add the DNS TXT and CNAME records that Resend provides to your domain registrar</li>
          <li>Wait for verification (usually 10–30 minutes) — you cannot send until the domain is verified</li>
        </ol>
        <p className="mt-2 text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Australian Spam Act compliance requirement: every marketing email must include an unsubscribe link. The Hub appends this automatically — do not send marketing emails from any other tool that bypasses this.
        </p>
      </div>
    </section>
  );
}

// ── Workforce Settings (director/admin only) ──────────────────────────────────

function WorkforceSettingsSection({ onSaved }) {
  const { role } = useAuth();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!["admin", "supervisor"].includes(role)) return;
    authFetch("/api/workforce/settings").then(r => r.json()).then(j => { if (j.ok) setSettings(j.settings); }).catch(() => {});
  }, [role]);

  if (!["admin", "supervisor"].includes(role)) return null;
  if (!settings) return null;

  function setField(k, v) { setSettings(s => ({ ...s, [k]: v })); }

  const COST_CODE_FIELDS = [
    ["cost_code_first_fix_framing",  "First fix / framing"],
    ["cost_code_cladding",           "Cladding"],
    ["cost_code_second_fix",         "Second fix"],
    ["cost_code_outdoor_works",      "Outdoor works"],
    ["cost_code_formwork_slab_prep", "Formwork / slab prep"],
    ["cost_code_site_labouring",     "Site labouring"],
    ["cost_code_site_cleanup",       "Site cleanup"],
    ["cost_code_supervision",        "Supervision"],
    ["cost_code_other",              "Other"],
  ];

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  async function save() {
    setSaving(true);
    try {
      await authFetch("/api/workforce/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      onSaved?.();
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  return (
    <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-primary mb-4">Workforce</h2>

      <h3 className="section-label mb-3">Working Hours</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-4">
        <label className="text-xs text-muted flex flex-col gap-1">
          Standard day (hrs)
          <input type="number" step="0.5" min="1" max="24" value={settings.standard_hours ?? 8} onChange={e => setField("standard_hours", Number(e.target.value))} className="border border-hairline rounded px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-muted flex flex-col gap-1">
          Break (min, unpaid)
          <input type="number" step="5" min="0" max="120" value={settings.standard_break_minutes ?? 30} onChange={e => setField("standard_break_minutes", Number(e.target.value))} className="border border-hairline rounded px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-muted flex flex-col gap-1">
          Start time
          <input type="time" value={settings.standard_start_time ?? "07:00"} onChange={e => setField("standard_start_time", e.target.value)} className="border border-hairline rounded px-2 py-1.5 text-sm" />
        </label>
      </div>
      <div className="mb-4">
        <p className="text-xs text-muted mb-1">Working days</p>
        <div className="flex gap-2 flex-wrap">
          {DAYS.map(d => {
            const active = (settings.working_days || []).includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  const days = settings.working_days || [];
                  setField("working_days", active ? days.filter(x => x !== d) : [...days, d]);
                }}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition ${active ? "bg-primary text-white border-primary" : "border-hairline text-muted"}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      <h3 className="section-label mb-3">Overtime Rules</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
        <label className="text-xs text-muted flex flex-col gap-1">
          Overtime after (hrs)
          <input type="number" step="0.5" value={settings.overtime_threshold ?? 8} onChange={e => setField("overtime_threshold", Number(e.target.value))} className="border border-hairline rounded px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-muted flex flex-col gap-1">
          Double time after (hrs)
          <input type="number" step="0.5" value={settings.double_time_threshold ?? 10} onChange={e => setField("double_time_threshold", Number(e.target.value))} className="border border-hairline rounded px-2 py-1.5 text-sm" />
        </label>
      </div>

      <h3 className="section-label mb-3">Buildexact Cost Code Mapping</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 mb-5">
        {COST_CODE_FIELDS.map(([key, label]) => (
          <label key={key} className="text-xs text-muted flex flex-col gap-1">
            {label}
            <input type="text" value={settings[key] ?? ""} onChange={e => setField(key, e.target.value)} className="border border-hairline rounded px-2 py-1.5 text-sm font-mono" />
          </label>
        ))}
      </div>

      <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {saving ? "Saving…" : "Save workforce settings"}
      </button>
    </section>
  );
}
