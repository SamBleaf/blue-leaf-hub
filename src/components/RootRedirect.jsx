import { useState } from "react";
import { Navigate } from "react-router-dom";
import BrandLoading from "./brand/BrandLoading.jsx";
import { useAuth } from "../lib/useAuth.js";
import { getDefaultRoute } from "../lib/roles.js";
import { supabaseConfigured } from "../lib/supabaseClient.js";
import { useRole } from "../lib/useRole.js";
import { getWorkerToken } from "../lib/workerFetch.js";

function RolePicker({ onPick }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-page px-6 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <div className="text-center">
        <h1 className="text-xl font-bold text-ink">How are you using Blue Leaf Hub today?</h1>
        <p className="mt-2 text-sm text-muted">Choose your view — you can switch any time.</p>
      </div>
      <div className="grid w-full max-w-sm gap-4">
        <button
          type="button"
          onClick={() => onPick("director")}
          className="rounded-xl border-2 border-primary bg-surface px-6 py-5 text-left transition hover:bg-primary/5 active:scale-[0.98]"
        >
          <p className="text-base font-bold text-primary">Director / Manager</p>
          <p className="mt-1 text-sm text-muted">Full access — sales pipeline, tendering, finance, and operations across all projects.</p>
        </button>
        <button
          type="button"
          onClick={() => onPick("supervisor")}
          className="rounded-xl border-2 border-accent bg-surface px-6 py-5 text-left transition hover:bg-accent/5 active:scale-[0.98]"
        >
          <p className="text-base font-bold text-accent">Site Supervisor</p>
          <p className="mt-1 text-sm text-muted">Field-first view — today&apos;s tasks, quick diary entries, and voice memos. Optimised for mobile.</p>
        </button>
      </div>
      </div>
    </div>
  );
}

export default function RootRedirect() {
  const { session, role: authRole, loading } = useAuth();
  const { role: viewRole, setRole } = useRole();
  const [picked, setPicked] = useState(false);

  if (!supabaseConfigured) return <Navigate to="/home" replace />;

  if (loading) {
    return <BrandLoading message="Loading…" />;
  }

  // Worker PWA boot: a field worker installs the app from their magic link (token
  // saved in localStorage) and has no Supabase account — open straight into the
  // worker view so the home-screen icon lands on their timesheet, not /login.
  if (!session && getWorkerToken()) return <Navigate to="/worker" replace />;

  if (!session) return <Navigate to="/login" replace />;

  // Clients always go to their portal
  if (authRole === "client") return <Navigate to="/my-portal" replace />;

  // Employees (site-only) always go to supervisor home — no choice needed
  if (authRole === "employee") return <Navigate to="/supervisor" replace />;

  // Admin / supervisor: show role picker on first visit if no view preference set
  if (!viewRole && !picked) {
    return (
      <RolePicker
        onPick={(r) => {
          setRole(r);
          setPicked(true);
        }}
      />
    );
  }

  if (viewRole === "supervisor") return <Navigate to="/supervisor" replace />;
  return <Navigate to={getDefaultRoute(authRole)} replace />;
}
