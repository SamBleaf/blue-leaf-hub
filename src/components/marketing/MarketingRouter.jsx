import { Routes, Route, Navigate } from "react-router-dom";
import Marketing from "../../pages/Marketing.jsx";
import MarketingCommandCentre from "./MarketingCommandCentre.jsx";
import ContentCreator from "./ContentCreator.jsx";
import LegacyStudio from "./LegacyStudio.jsx";
import WeeklyPlanner from "./WeeklyPlanner.jsx";
import ApprovalQueue from "./ApprovalQueue.jsx";
import MarketingCalendar from "./MarketingCalendar.jsx";
import MediaVault from "./MediaVault.jsx";
import EvergreenLibrary from "./EvergreenLibrary.jsx";
import MarketingDashboard from "./MarketingDashboard.jsx";
import MarketingAttribution from "./MarketingAttribution.jsx";
import MarketingLibrary from "./MarketingLibrary.jsx";
import MarketingInbox from "./MarketingInbox.jsx";

// Marketing internal router (Run A + Batch 3). Mounted at /marketing/* in App.jsx (admin-gated).
// Supports the two-segment /marketing/studio/legacy route that the old /marketing/:tab
// pattern could not match, while keeping the legacy tab pages working for one sprint.
export default function MarketingRouter() {
  return (
    <Routes>
      <Route index element={<MarketingCommandCentre />} />
      <Route path="planner" element={<WeeklyPlanner />} />
      <Route path="approval" element={<ApprovalQueue />} />
      <Route path="calendar" element={<MarketingCalendar />} />
      <Route path="vault" element={<MediaVault />} />
      <Route path="inbox" element={<MarketingInbox />} />
      <Route path="library" element={<MarketingLibrary />} />
      <Route path="evergreen" element={<EvergreenLibrary />} />
      <Route path="intelligence" element={<MarketingDashboard />} />
      <Route path="attribution" element={<MarketingAttribution />} />
      <Route path="studio" element={<ContentCreator />} />
      <Route path="studio/legacy" element={<LegacyStudio />} />
      {/* Legacy redirect: old Create tab → new Studio */}
      <Route path="create" element={<Navigate to="/marketing/studio" replace />} />
      {/* Legacy tab pages (Library / Campaigns / Media / Lists / Music) — 1 sprint */}
      <Route path=":tab" element={<Marketing />} />
    </Routes>
  );
}
