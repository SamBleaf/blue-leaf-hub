import { useAuth } from "../../lib/useAuth.js";
import Settings from "../Settings.jsx";
import { SETTINGS_NAV } from "./settingsNav.js";
import UserManagement from "../UserManagement.jsx";
import WorkforceTeam from "../WorkforceTeam.jsx";
import XeroPane from "./XeroPane.jsx";
import DocumentsTemplates from "../DocumentsTemplates.jsx";
import CompanyCostModel from "../../components/settings/CompanyCostModel.jsx";
import MusicLibrarySettings from "../../components/marketing/MusicLibrarySettings.jsx";
import FieldAppPane from "./FieldAppPane.jsx";
import AICostWidget from "../../components/settings/AICostWidget.jsx";
import DataCleanup from "../DataCleanup.jsx";
import ProfilePane from "./ProfilePane.jsx";
import EnquiryAckSettings from "../../components/settings/EnquiryAckSettings.jsx";
import SwmsLibrarySettings from "../../components/settings/SwmsLibrarySettings.jsx";

// Maps a "component" kind sub.id → the element it renders. Kept here (rather than
// in settingsNav.js) so the nav config stays plain data with no JSX/import weight.
const COMPONENT_MAP = {
  users: () => <UserManagement />,
  employees: () => <WorkforceTeam embedded />,
  xero: () => <XeroPane />,
  templates: () => <DocumentsTemplates />,
  "swms-library": () => <SwmsLibrarySettings />,
  "cost-model": () => <CompanyCostModel />,
  marketing: () => <MusicLibrarySettings />,
  "field-app": () => <FieldAppPane />,
  "ai-usage": () => <AICostWidget />,
  "data-cleanup": () => <DataCleanup />,
  profile: () => <ProfilePane />,
  "enquiry-ack": () => <EnquiryAckSettings />,
};

// Renders one Settings-hub category: all of its role-permitted sub-sections,
// stacked in nav order. Adjacent "section" kind subs (Settings.jsx panes) collapse
// into a SINGLE <Settings sections={[...]}/> instance so they share one data fetch
// instead of one per sub-section; "component" kind subs render standalone, each
// wrapped in its own scroll anchor.
export default function SettingsCategory({ cat }) {
  const { role } = useAuth();
  const category = SETTINGS_NAV.find((c) => c.cat === cat);
  if (!category) return null;

  const visibleSubs = category.subs.filter((sub) => !sub.roles || sub.roles.includes(role));

  if (visibleSubs.length === 0) {
    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-primary tracking-tight">{category.label}</h1>
        </header>
        <p className="text-sm text-muted">Nothing here for your role.</p>
      </div>
    );
  }

  // Group contiguous runs of the same kind, so consecutive "section" subs become one
  // Settings block (positioned where the first of that run appears) and each
  // "component" sub renders individually, in order.
  const blocks = [];
  for (const sub of visibleSubs) {
    const prev = blocks[blocks.length - 1];
    if (sub.kind === "section" && prev?.kind === "section") {
      prev.ids.push(sub.id);
    } else if (sub.kind === "section") {
      blocks.push({ kind: "section", ids: [sub.id] });
    } else {
      blocks.push({ kind: "component", id: sub.id });
    }
  }

  return (
    <div className="space-y-10">
      {blocks.map((block) =>
        block.kind === "section" ? (
          <Settings key={block.ids.join("+")} sections={block.ids} />
        ) : (
          <div key={block.id} id={block.id} className="scroll-mt-24">
            {COMPONENT_MAP[block.id]?.()}
          </div>
        )
      )}
    </div>
  );
}
