import { useState, useEffect } from "react";
import { apiFetch, apiPost } from "../../lib/apiFetch.js";

// CampaignTemplatePicker (Run A / Batch 2) — lists the seeded campaign templates and
// instantiates one via POST /api/marketing/campaigns/from-template. Calls onCreated(result)
// so the planner can refresh after a campaign + its slots are generated.
export default function CampaignTemplatePicker({ onCreated }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creatingKey, setCreatingKey] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { ok, data, error: e } = await apiFetch("/api/marketing/templates");
      if (cancelled) return;
      if (ok) setTemplates(data?.templates || []);
      else setError(e || "Couldn't load campaign templates.");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function applyTemplate(t) {
    setCreatingKey(t.templateKey);
    setError(null);
    const { ok, data, error: e } = await apiPost("/api/marketing/campaigns/from-template", {
      templateKey: t.templateKey,
      createWeeklyPlan: true,
    });
    setCreatingKey(null);
    if (ok) onCreated?.(data);
    else setError(e || "Couldn't create the campaign from this template.");
  }

  if (loading) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-6 text-sm text-muted">
        Loading templates…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm text-ink">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {templates.map((t) => (
          <div key={t.templateKey} className="flex flex-col rounded-card border border-hairline bg-surface p-4">
            <h3 className="text-sm font-semibold text-primary">{t.name}</h3>
            <p className="mt-1 text-xs text-muted">{t.description}</p>

            {Array.isArray(t.defaultChannels) && t.defaultChannels.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {t.defaultChannels.map((c) => (
                  <span key={c} className="rounded-full bg-page px-2 py-0.5 text-[11px] font-medium text-muted">
                    {c}
                  </span>
                ))}
              </div>
            )}

            {Array.isArray(t.sampleTopics) && t.sampleTopics.length > 0 && (
              <p className="mt-2 text-[11px] text-muted">
                <span className="font-semibold">Typical:</span> {t.sampleTopics.slice(0, 2).join(" · ")}
              </p>
            )}

            <button
              type="button"
              onClick={() => applyTemplate(t)}
              disabled={creatingKey === t.templateKey}
              className="mt-3 self-start rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
            >
              {creatingKey === t.templateKey ? "Creating…" : "Use this template"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
