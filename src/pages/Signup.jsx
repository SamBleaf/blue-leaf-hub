import { useState } from "react";
import { Link } from "react-router-dom";
import { configureSupabaseAuthStorage, getSupabase, supabaseConfigured } from "../lib/supabaseClient.js";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [sentTo, setSentTo] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErrorMsg("");
    if (!supabaseConfigured) {
      setErrorMsg("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
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
      configureSupabaseAuthStorage("local");
      const sb = getSupabase();
      if (!sb) throw new Error("Could not initialise client.");
      const redirect = `${window.location.origin}/login`;
      const { error } = await sb.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirect,
        },
      });
      if (error) {
        setErrorMsg(error.message || "Sign up failed");
        return;
      }
      setSentTo(email.trim());
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div className="flex min-h-screen flex-col bg-page px-4 py-10 font-sans">
        <div className="mx-auto mt-16 w-full max-w-md rounded-card border border-hairline bg-surface px-6 py-8 text-center shadow-md">
          <h1 className="text-lg font-semibold text-ink">Check your inbox</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            We&apos;ve sent a verification link to <span className="font-semibold text-ink">{sentTo}</span>. Click the
            link to activate your account, then come back to log in.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-block text-sm font-semibold text-primary underline"
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-page px-4 py-10 font-sans">
      <div className="mx-auto flex w-full max-w-md flex-col items-center">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Blue Leaf Hub</h1>
          <p className="mt-1 text-sm text-muted">Request workspace access</p>
        </div>

        <div className="w-full rounded-card border border-hairline bg-surface px-6 py-8 shadow-md">
          <h2 className="text-lg font-semibold text-ink">Create account</h2>
          <p className="mt-1 text-xs text-muted">
            Minimum 8 characters · Match confirm password · You must verify via email before signing in.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Email</span>
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
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Password</span>
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
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Confirm password</span>
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
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-60 focus-visible:focus-ring"
            >
              {busy ? (
                <span
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  aria-hidden
                />
              ) : null}
              Sign up
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-primary underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
