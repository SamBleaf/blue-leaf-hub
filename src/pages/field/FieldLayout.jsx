import { Outlet } from "react-router-dom";
import { useAuth } from "../../lib/useAuth.js";
import { can } from "../../lib/roles.js";
import BaseLayout from "../../components/layouts/BaseLayout.jsx";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" };
const ICONS = {
  home:  <svg viewBox="0 0 24 24" width={22} height={22} {...stroke}><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>,
  jobs:  <svg viewBox="0 0 24 24" width={22} height={22} {...stroke}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>,
  tasks: <svg viewBox="0 0 24 24" width={22} height={22} {...stroke}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>,
  whs:   <svg viewBox="0 0 24 24" width={22} height={22} {...stroke}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  diary: <svg viewBox="0 0 24 24" width={22} height={22} {...stroke}><path d="M4 4h12a2 2 0 012 2v14H6a2 2 0 01-2-2z" /><path d="M8 4v16M12 9h4M12 13h4" /></svg>,
};

/**
 * The mobile-first field app shell. Replaces the dense AppShell for field roles.
 * Nav is computed from the DB role via can.* — supervisors get Jobs; employees don't.
 * Admins land here only via the "preview field app" path (a banner makes that clear).
 */
export default function FieldLayout() {
  const { role, signOut, profile, user } = useAuth();
  const isSupervisor = role === "supervisor";
  const isAdmin = role === "admin";

  const nav = [
    { to: "/field", end: true, label: "Home", short: "Home", icon: ICONS.home },
    ...(can.accessCarpentry(role) ? [{ to: "/field/jobs", label: "Jobs", short: "Jobs", icon: ICONS.jobs }] : []),
    { to: "/field/tasks", label: "Tasks", short: "Tasks", icon: ICONS.tasks },
    ...(can.accessWHS(role) ? [{ to: "/field/whs", label: "Safety", short: "Safety", icon: ICONS.whs }] : []),
    { to: "/field/diary", label: "Diary", short: "Diary", icon: ICONS.diary },
  ];

  // Blue for supervisors, green for employees, purple when an admin is previewing.
  const chromeColor = isAdmin ? "#7c3aed" : isSupervisor ? "#1E40AF" : "#059669";
  const banner = isAdmin ? (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs px-4 py-2 text-center">
      Director preview of the field app — this is what supervisors see.
    </div>
  ) : null;

  return (
    <BaseLayout
      navItems={nav}
      chromeColor={chromeColor}
      headerTitle="Blue Leaf — Field"
      headerSub={profile?.email || user?.email}
      onSignOut={() => void signOut()}
      banner={banner}
    >
      <Outlet />
    </BaseLayout>
  );
}
