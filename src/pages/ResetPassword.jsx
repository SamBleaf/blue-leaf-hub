import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient.js";
import AuthBrandScreen from "../components/brand/AuthBrandScreen.jsx";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [done, setDone] = useState(false);
  const [hasSession, setHasSession] = useState(null); // null = checking

  // Supabase emits an AUTH event when the recovery link is consumed.
  // detectSessionInUrl: true (set in supabaseClient.js) handles the hash automatically.
  useEffect(() => {
    if (!supabaseConfigured) {
      setHasSession(false);
      return;
    }
    const sb = getSupabase();
    if (!sb) {
      setHasSession(false);
      return;
    }

    // Check if there is already a recovery session active (link already consumed this tab).
    // Supabase sets the session via the hash; if we have a session at all on this page,
    // treat it as valid for password update (the user arrived via the emailed link).
    sb.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data?.session));
    });

    // Also listen for the PASSWORD_RECOVERY event that fires when Supabase processes the
    // #access_token hash on page load.
    const { data: listener } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setHasSession(true);
      }
    });

    return () => listener?.subscription?.unsubscribe();
  }, []);

  async function submit(e) {
    e.preventDefault();
    setErrorMsg("");

    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error("Could not initialise client.");
      const { error } = await sb.auth.updateUser({ password });
      if (error) {
        setErrorMsg(error.message || "Failed to update password. The link may have expired.");
        return;
      }
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 2500);
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthBrandScreen>
      <div className="w-full max-w-[400px] rounded-card border border-hairline bg-surface px-6 py-8 shadow-md">
        <h2 className="text-lg font-semibold text-ink">Set new password</h2>
        <p className="mt-1 text-xs text-muted">Choose a new password for your account.</p>

        {hasSession === null && (
          <p className="mt-6 text-sm text-muted">Verifying reset link…</p>
        )}

        {hasSession === false && (
          <div className="mt-6">
            <p className="text-sm text-danger">
              This reset link has expired or is invalid.
            </p>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="mt-4 text-sm font-semibold text-primary hover:underline"
            >
              Request a new reset link
            </button>
          </div>
        )}

        {hasSession === true && !done && (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="section-label">New password</span>
              <div className="relative mt-1">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
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

            <label className="block">
              <span className="section-label">Confirm password</span>
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>

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
              Update password
            </button>
          </form>
        )}

        {done && (
          <p
            role="status"
            className="mt-6 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-center text-sm text-ink"
          >
            Password updated. Redirecting to sign in…
          </p>
        )}
      </div>
    </AuthBrandScreen>
  );
}
