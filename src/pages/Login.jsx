import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/useAuth.js";
import {
  configureSupabaseAuthStorage,
  getSupabase,
  supabaseConfigured,
} from "../lib/supabaseClient.js";
import AuthBrandScreen from "../components/brand/AuthBrandScreen.jsx";
import BrandLoading from "../components/brand/BrandLoading.jsx";

/** Supabase redirects after confirm with `#access_token=…&type=signup` (etc.) — surface success then clean URL */
function migrateAuthHashToQuery() {
  if (typeof window === "undefined") return false;
  const h = window.location.hash.slice(1);
  if (!h) return false;
  const qs = new URLSearchParams(h);
  if (!qs.get("access_token")) return false;

  window.history.replaceState(null, "", `${window.location.pathname}?verified=1`);
  return true;
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showVerified, setShowVerified] = useState(() => searchParams.get("verified") === "1");
  const [resetSent, setResetSent] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");

  useEffect(() => {
    const migrated = migrateAuthHashToQuery();
    if (migrated) {
      setShowVerified(true);
      setSearchParams({ verified: "1" }, { replace: true });
      return;
    }
    if (searchParams.get("verified") === "1") setShowVerified(true);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!supabaseConfigured || authLoading || !session) return;
    navigate("/", { replace: true });
  }, [session, authLoading, navigate]);

  async function sendReset(e) {
    e.preventDefault();
    setResetError("");
    if (!supabaseConfigured) {
      setResetError("Supabase is not configured.");
      return;
    }
    const trimmed = email.trim();
    if (!trimmed) {
      setResetError("Enter your email address above first.");
      return;
    }
    setResetBusy(true);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error("Could not initialise client.");
      await sb.auth.resetPasswordForEmail(trimmed, {
        redirectTo: window.location.origin + "/reset-password",
      });
      setResetSent(true);
    } catch {
      setResetError("Something went wrong. Please try again.");
    } finally {
      setResetBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setErrorMsg("");
    if (!supabaseConfigured) {
      setErrorMsg("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
    setBusy(true);
    try {
      configureSupabaseAuthStorage(rememberMe ? "local" : "session");
      const sb = getSupabase();
      if (!sb) throw new Error("Could not initialise client.");
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setErrorMsg("Invalid email or password");
        return;
      }
      navigate("/", { replace: true });
    } finally {
      setBusy(false);
    }
  }

  const showSkeleton = supabaseConfigured && authLoading && !session;

  if (showSkeleton) {
    return <BrandLoading message="Loading session…" />;
  }

  return (
    <AuthBrandScreen>
        {showVerified ? (
          <div
            role="status"
            className="mb-4 w-full rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-center text-sm text-ink"
          >
            Email verified — you can now log in.
          </div>
        ) : null}

        <div className="w-full max-w-[400px] rounded-card border border-hairline bg-surface px-6 py-8 shadow-md">
          <h2 className="text-lg font-semibold text-ink">Sign in</h2>
          <p className="mt-1 text-xs text-muted">Use your workspace credentials.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="section-label">Email</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>

            <label className="block">
              <span className="section-label">Password</span>
              <div className="relative mt-1">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-hairline bg-page px-3 py-2 pr-12 text-sm text-ink shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-primary hover:underline"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <div className="flex items-center justify-between gap-3">
              <span id="remember-label" className="text-sm text-ink">
                Remember me
              </span>
              <button
                type="button"
                role="switch"
                aria-labelledby="remember-label"
                aria-checked={rememberMe}
                onClick={() => setRememberMe((v) => !v)}
                className={`relative h-7 w-11 shrink-0 rounded-full transition ${
                  rememberMe ? "bg-primary" : "bg-hairline"
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-surface shadow transition ${
                    rememberMe ? "left-5" : "left-1"
                  }`}
                />
              </button>
            </div>

            {errorMsg ? <p className="text-sm font-medium text-danger">{errorMsg}</p> : null}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-60 focus-visible:focus-ring"
            >
              {busy ? (
                <span
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  aria-hidden
                />
              ) : null}
              Sign in
            </button>
          </form>

          {resetSent ? (
            <p
              role="status"
              className="mt-4 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-center text-sm text-ink"
            >
              If that email exists, a reset link has been sent.
            </p>
          ) : (
            <div className="mt-4 text-center">
              {resetError ? (
                <p className="mb-1 text-xs font-medium text-danger">{resetError}</p>
              ) : null}
              <button
                type="button"
                disabled={resetBusy}
                onClick={sendReset}
                className="text-sm text-primary hover:underline disabled:opacity-60"
              >
                {resetBusy ? "Sending…" : "Forgot password?"}
              </button>
            </div>
          )}

          <p className="mt-6 text-center text-sm text-muted">
            Access is by invitation only.{" "}
            <a href="mailto:sam@blueleafbuilding.com.au" className="font-semibold text-primary underline">
              Contact admin
            </a>
          </p>
        </div>
    </AuthBrandScreen>
  );
}
