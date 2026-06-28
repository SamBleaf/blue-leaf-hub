import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ContentLibrary from "../components/marketing/ContentLibrary.jsx";
import CampaignManager from "../components/marketing/CampaignManager.jsx";
import MediaUpload from "../components/marketing/MediaUpload.jsx";
import MusicLibrarySettings from "../components/marketing/MusicLibrarySettings.jsx";
import MarketingIntelligence from "../components/marketing/MarketingIntelligence.jsx";
import MailingLists from "../components/crm/MailingLists.jsx";
import { useAuth } from "../lib/useAuth.js";

// Legacy tab container (Run A). The primary entry points are now Command Centre (/marketing),
// Weekly Planner (/marketing/planner) and Content Studio (/marketing/studio). Content creation
// lives in Studio / Legacy Studio; this component hosts the remaining classic tabs.
const TABS = [
  { id: "library",       label: "Library" },
  { id: "campaigns",     label: "Campaigns" },
  { id: "media",         label: "Media" },
  { id: "lists",         label: "Lists" },
  { id: "intelligence",  label: "Intelligence", adminOnly: true },
  { id: "music",         label: "Music Library", adminOnly: true },
];

export default function Marketing() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const activeTab = tab || "library";

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  useEffect(() => {
    if ((tab === "music" || tab === "intelligence") && !isAdmin) {
      navigate("/marketing/library", { replace: true });
    }
  }, [tab, isAdmin, navigate]);

  function goTab(id) {
    navigate(`/marketing/${id}`);
  }

  // Media "Generate post from this photo" → route to Legacy Studio with the asset id.
  // Query-param seeding replaces the old in-page seedAsset state so it survives the route move
  // (and Run B's media-first Creator inherits the same ?asset_id= mechanism).
  function handleGeneratePost(asset) {
    if (!asset?.id) return;
    navigate(`/marketing/studio/legacy?asset_id=${asset.id}`);
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Page header */}
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Marketing</p>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">Content &amp; Campaigns</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Library, campaigns, media and lists. To create content, use{" "}
          <button
            type="button"
            onClick={() => navigate("/marketing/studio")}
            className="font-semibold text-primary underline"
          >
            Content Studio
          </button>
          .
        </p>
      </header>

      {/* Pill tab bar */}
      <div className="flex gap-1 rounded-lg bg-page p-1 w-fit flex-wrap">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => goTab(t.id)}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${
              activeTab === t.id
                ? "bg-primary text-white"
                : "text-muted hover:bg-surface hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "library"      && <ContentLibrary />}
      {activeTab === "campaigns"    && <CampaignManager onGoCreate={() => navigate("/marketing/studio")} />}
      {activeTab === "media"        && <MediaUpload onGeneratePost={handleGeneratePost} />}
      {activeTab === "lists"        && <MailingLists />}
      {activeTab === "intelligence" && isAdmin && <MarketingIntelligence />}
      {activeTab === "music"        && isAdmin && <MusicLibrarySettings />}
    </div>
  );
}
