import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AuthBrandScreen from "../components/brand/AuthBrandScreen.jsx";
import BrandLoading from "../components/brand/BrandLoading.jsx";
import { ROLE_LABELS, getRoleBadgeStyle } from "../lib/roles.js";

export default function AcceptInvite() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(null);
  const [invalid, setInvalid] = useState(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/auth/invite/${token}`);
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setInvalid({ message: j.error || "Invitation not valid" });
          return;
        }
        setInvite(j);
        setFullName(j.fullName || "");
      } catch {
        if (!cancelled) setInvalid({ message: "Could not validate invitation." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    if (fullName.trim().length < 2) {
      setErrorMsg("Please enter your full name.");
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
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, fullName: fullName.trim() })
      });
      const j = await res.json();
      if (!res.ok) {
        setErrorMsg(j.error || "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <BrandLoading message="Validating invitation…" />;
  }

  if (invalid) {
    return (
      <AuthBrandScreen>
        <div className="w-full bg-surface rounded-card border border-hairline p-8 text-center shadow-md">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-lg font-semibold text-ink mb-2">Invitation not valid</h1>
          <p className="text-sm text-muted">{invalid.message}</p>
          <Link to="/login" className="mt-6 inline-block text-sm font-semibold text-primary underline">
            Back to login
          </Link>
        </div>
      </AuthBrandScreen>
    );
  }

  if (success) {
    return (
      <AuthBrandScreen>
        <div className="w-full bg-surface rounded-card border border-hairline p-8 text-center shadow-md">
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-lg font-semibold text-ink mb-2">Account created</h1>
          <p className="text-sm text-muted mb-6">Welcome to Blue Leaf Hub. You can now sign in.</p>
          <Link
            to="/login"
            className="inline-block w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white text-center"
          >
            Sign in
          </Link>
        </div>
      </AuthBrandScreen>
    );
  }

  return (
    <AuthBrandScreen>
        <p className="mb-6 text-center text-sm text-muted">Set up your account</p>
        <div className="w-full bg-surface rounded-card border border-hairline px-6 py-8 shadow-md">
          <div className="mb-6 flex items-center gap-3 rounded-xl bg-page p-4 border border-hairline">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-0.5">
                Invitation for
              </div>
              <div className="text-sm font-semibold text-ink">{invite?.email}</div>
            </div>
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${getRoleBadgeStyle(invite?.role)}`}
            >
              {ROLE_LABELS[invite?.role] || invite?.role}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="section-label">Full name</span>
              <input
                type="text"
                required
                minLength={2}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>

            <label className="block">
              <span className="section-label">Password</span>
              <div className="relative mt-1">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
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
              <span className="section-label">
                Confirm password
              </span>
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>

            {errorMsg && <p className="text-sm font-medium text-danger">{errorMsg}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-60"
            >
              {submitting && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              )}
              Create account
            </button>
          </form>
        </div>
    </AuthBrandScreen>
  );
}
