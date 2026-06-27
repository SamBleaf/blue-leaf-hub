import { Routes, Route, Navigate } from "react-router-dom";
import Marketing from "../../pages/Marketing.jsx";
import MarketingCommandCentre from "./MarketingCommandCentre.jsx";
import ContentCreatorShell from "./ContentCreatorShell.jsx";
import LegacyStudio from "./LegacyStudio.jsx";
import WeeklyPlanner from "./WeeklyPlanner.jsx";

// Marketing internal router (Run A). Mounted at /marketing/* in App.jsx (admin-gated).
// Supports the two-segment /marketing/studio/legacy route that the old /marketing/:tab
// pattern could not match, while keeping the legacy tab pages working for one sprint.
export default function MarketingRouter() {
  return (
    <Routes>
      <Route index element={<MarketingCommandCentre />} />
      <Route path="planner" element={<WeeklyPlanner />} />
      <Route path="studio" element={<ContentCreatorShell />} />
      <Route path="studio/legacy" element={<LegacyStudio />} />
      {/* Legacy redirect: old Create tab → new Studio */}
      <Route path="create" element={<Navigate to="/marketing/studio" replace />} />
      {/* Legacy tab pages (Library / Campaigns / Media / Lists / Intelligence / Music) — 1 sprint */}
      <Route path=":tab" element={<Marketing />} />
    </Routes>
  );
}
