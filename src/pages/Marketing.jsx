import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ContentGenerator from "../components/marketing/ContentGenerator.jsx";
import ContentLibrary from "../components/marketing/ContentLibrary.jsx";
import CampaignManager from "../components/marketing/CampaignManager.jsx";
import MediaUpload from "../components/marketing/MediaUpload.jsx";

const TABS = [
  { id: "create",    label: "Create" },
  { id: "library",   label: "Library" },
  { id: "campaigns", label: "Campaigns" },
  { id: "media",     label: "Media" },
];

export default function Marketing() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const activeTab = tab || "create";
  const [seedAsset, setSeedAsset] = useState(null);

  function goTab(id) {
    navigate(id === "create" ? "/marketing" : `/marketing/${id}`);
  }

  function handleGeneratePost(asset) {
    setSeedAsset(asset);
    goTab("create");
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Page header */}
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Marketing Agent</p>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">Content Studio</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          AI-assisted external content for Blue Leaf Building — social, website, email and video.
        </p>
      </header>

      {/* Pill tab bar */}
      <div className="flex gap-1 rounded-lg bg-page p-1 w-fit">
        {TABS.map((t) => (
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
      {activeTab === "create"    && <ContentGenerator seedAsset={seedAsset} onSeedConsumed={() => setSeedAsset(null)} />}
      {activeTab === "library"   && <ContentLibrary />}
      {activeTab === "campaigns" && <CampaignManager />}
      {activeTab === "media"     && <MediaUpload onGeneratePost={handleGeneratePost} />}
    </div>
  );
}
