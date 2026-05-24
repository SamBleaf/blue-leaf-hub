import { authFetch } from "../lib/authFetch.js";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSupabase } from "../lib/supabaseClient.js";
import {
  generatePortalToken,
  enableTestPortal,
  seedTestData,
  getAdminSummary,
  savePortalUpdate,
  patchPortalUpdate,
  uploadPortalPhoto,
  upsertMilestone,
  saveDecision,
  saveClaim
} from "../lib/portalApi.js";

const CANONICAL_MILESTONES = [
  { key: "enquiry", label: "Enquiry received", sort: 1 },
  { key: "contract", label: "Contract signed", sort: 2 },
  { key: "permits", label: "Permits approved", sort: 3 },
  { key: "site_prep", label: "Site preparation", sort: 4 },
  { key: "slab", label: "Slab poured", sort: 5 },
  { key: "frame", label: "Frame complete", sort: 6 },
  { key: "lockup", label: "Lock-up", sort: 7 },
  { key: "roughin", label: "Rough-in", sort: 8 },
  { key: "insulation", label: "Insulation", sort: 9 },
  { key: "lining", label: "Wall lining", sort: 10 },
  { key: "painting", label: "Painting", sort: 11 },
  { key: "fitout", label: "Internal fit-out", sort: 12 },
  { key: "practical_completion", label: "Practical completion", sort: 13 },
  { key: "handover", label: "Handover", sort: 14 }
];

const TABS = ["overview", "updates", "milestones", "decisions", "claims", "settings"];

export default function PortalAdmin() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [summary, setSummary] = useState(null);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [newUpdateOpen, setNewUpdateOpen] = useState(false);
  const [updateForm, setUpdateForm] = useState({
    weekOf: new Date().toISOString().slice(0, 10),
    headline: "",
    body: "",
    authorName: "Sam",
    published: false,
    videoUrl: ""
  });

  const loadProjects = useCallback(async () => {
    const res = await authFetch("/api/operations/projects");
    const j = await res.json();
    if (j.ok) setProjects(j.projects || []);
  }, []);

  const loadSummary = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const s = await getAdminSummary(projectId);
      setSummary(s);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      loadProjects().finally(() => setLoading(false));
    } else {
      loadSummary();
    }
  }, [projectId, loadProjects, loadSummary]);

  const portalUrl =
    summary?.project?.portalToken &&
    `${typeof window !== "undefined" ? window.location.origin : ""}/portal/${summary.project.portalToken}`;

  const copyUrl = () => {
    if (!portalUrl) return;
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const patchProject = async (patch) => {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("projects").update(patch).eq("id", projectId);
    await loadSummary();
  };

  if (!projectId) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-ink mb-6">Client portal</h1>
        {loading ? (
          <p className="text-muted">Loading projects…</p>
        ) : (
          <div className="grid gap-3">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(`/portal-admin/${p.id}`)}
                className="text-left rounded-card border border-hairline bg-surface p-4 hover:border-primary"
              >
                <p className="font-semibold text-ink">{p.address}</p>
                <p className="text-xs text-muted mt-1">
                  {p.portal_enabled ? "Portal enabled" : "Portal not set up"}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (loading && !summary) {
    return <p className="p-6 text-muted">Loading…</p>;
  }

  const proj = summary?.project || {};

  return (
    <div className="p-6 max-w-4xl mx-auto pb-20">
      <button type="button" onClick={() => navigate("/portal-admin")} className="text-sm text-primary mb-4">
        ← All projects
      </button>
      <h1 className="text-2xl font-bold text-ink mb-1">{proj.address || "Project"}</h1>
      <p className="text-sm text-muted mb-6">Portal administration</p>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-hairline pb-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${
              tab === t ? "bg-primary text-white" : "text-muted hover:bg-page"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4 rounded-card border border-hairline bg-surface p-5">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={Boolean(proj.portalEnabled)}
              onChange={async (e) => {
                if (e.target.checked && !proj.portalToken) {
                  await generatePortalToken(projectId);
                } else {
                  await patchProject({ portal_enabled: e.target.checked });
                }
                await loadSummary();
              }}
            />
            <span className="text-sm font-medium">Portal enabled</span>
          </label>
          {portalUrl && (
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-xs bg-page px-2 py-1 rounded flex-1 break-all">{portalUrl}</code>
              <button type="button" onClick={copyUrl} className="text-sm text-primary font-semibold">
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {!proj.portalEnabled ? (
              <button
                type="button"
                disabled={testBusy}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={async () => {
                  setTestBusy(true);
                  setSeedMsg("");
                  try {
                    await enableTestPortal(projectId);
                    await loadSummary();
                  } finally {
                    setTestBusy(false);
                  }
                }}
              >
                Enable test portal
              </button>
            ) : null}
            {proj.portalEnabled ? (
              <button
                type="button"
                disabled={testBusy}
                className="rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-ink disabled:opacity-60"
                onClick={async () => {
                  setTestBusy(true);
                  setSeedMsg("");
                  try {
                    const r = await seedTestData(projectId);
                    await loadSummary();
                    setSeedMsg(r.skipped ? "Test data already present." : "Test data added.");
                    setTimeout(() => setSeedMsg(""), 4000);
                  } finally {
                    setTestBusy(false);
                  }
                }}
              >
                Seed test data
              </button>
            ) : null}
          </div>
          {seedMsg ? <p className="text-sm text-success">{seedMsg}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Client name
              <input
                className="mt-1 w-full border border-hairline rounded-lg px-3 py-2"
                defaultValue={proj.portalClientName || ""}
                onBlur={(e) => patchProject({ portal_client_name: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Client email
              <input
                type="email"
                className="mt-1 w-full border border-hairline rounded-lg px-3 py-2"
                defaultValue={proj.portalClientEmail || ""}
                onBlur={(e) => patchProject({ portal_client_email: e.target.value })}
              />
            </label>
          </div>
        </div>
      )}

      {tab === "updates" && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setNewUpdateOpen(!newUpdateOpen)}
            className="text-sm font-semibold text-primary"
          >
            + New update
          </button>
          {newUpdateOpen && (
            <div className="rounded-card border border-hairline bg-surface p-4 space-y-3">
              <input
                type="date"
                value={updateForm.weekOf}
                onChange={(e) => setUpdateForm((f) => ({ ...f, weekOf: e.target.value }))}
                className="border border-hairline rounded-lg px-3 py-2 text-sm w-full"
              />
              <input
                placeholder="Headline"
                value={updateForm.headline}
                onChange={(e) => setUpdateForm((f) => ({ ...f, headline: e.target.value }))}
                className="border border-hairline rounded-lg px-3 py-2 text-sm w-full"
              />
              <textarea
                placeholder="Body"
                rows={6}
                value={updateForm.body}
                onChange={(e) => setUpdateForm((f) => ({ ...f, body: e.target.value }))}
                className="border border-hairline rounded-lg px-3 py-2 text-sm w-full"
              />
              <label className="block text-sm">
                Video URL (optional)
                <input
                  type="url"
                  placeholder="https://..."
                  value={updateForm.videoUrl}
                  onChange={(e) => setUpdateForm((f) => ({ ...f, videoUrl: e.target.value }))}
                  className="mt-1 w-full border border-hairline rounded-lg px-3 py-2 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={updateForm.published}
                  onChange={(e) => setUpdateForm((f) => ({ ...f, published: e.target.checked }))}
                />
                Published
              </label>
              <button
                type="button"
                className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold"
                onClick={async () => {
                  await savePortalUpdate({ projectId, ...updateForm });
                  setNewUpdateOpen(false);
                  setUpdateForm({
                    weekOf: new Date().toISOString().slice(0, 10),
                    headline: "",
                    body: "",
                    authorName: "Sam",
                    published: false,
                    videoUrl: ""
                  });
                  await loadSummary();
                }}
              >
                Save
              </button>
            </div>
          )}
          {(summary?.updates || []).map((u) => (
            <div key={u.id} className="rounded-card border border-hairline bg-surface p-4 flex justify-between">
              <div>
                <p className="font-medium text-ink">{u.headline}</p>
                <p className="text-xs text-muted">{u.weekOf}</p>
              </div>
              <button
                type="button"
                className="text-xs text-primary"
                onClick={() => patchPortalUpdate(u.id, { published: !u.published }).then(loadSummary)}
              >
                {u.published ? "Unpublish" : "Publish"}
              </button>
            </div>
          ))}
          <div className="mt-6">
            <p className="text-sm font-semibold text-ink mb-2">Upload photo</p>
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                await uploadPortalPhoto(projectId, file);
                await loadSummary();
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap gap-2 mt-3">
              {(summary?.photos || []).map((ph) => (
                <img
                  key={ph.id}
                  src={`/api/portal/media/${ph.id}?token=${proj.portalToken}`}
                  alt=""
                  className="w-16 h-16 object-cover rounded-lg"
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "milestones" && (
        <div className="space-y-2">
          {CANONICAL_MILESTONES.map((cm) => {
            const existing = (summary?.milestones || []).find((m) => m.key === cm.key);
            return (
              <div
                key={cm.key}
                className="flex flex-wrap items-center gap-3 rounded-card border border-hairline bg-surface p-3"
              >
                <span className="text-sm font-medium text-ink flex-1">{cm.label}</span>
                <input
                  type="date"
                  className="text-xs border border-hairline rounded px-2 py-1"
                  defaultValue={existing?.eta?.slice(0, 10) || ""}
                  onBlur={(e) =>
                    upsertMilestone({
                      projectId,
                      key: cm.key,
                      label: cm.label,
                      sortOrder: cm.sort,
                      eta: e.target.value || null,
                      achievedAt: existing?.achievedAt || null
                    }).then(loadSummary)
                  }
                />
                <button
                  type="button"
                  className="text-xs bg-primary text-white px-2 py-1 rounded"
                  onClick={() =>
                    upsertMilestone({
                      projectId,
                      key: cm.key,
                      label: cm.label,
                      sortOrder: cm.sort,
                      achievedAt: new Date().toISOString().slice(0, 10),
                      eta: existing?.eta || null
                    }).then(loadSummary)
                  }
                >
                  Mark today
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === "decisions" && (
        <div className="space-y-3">
          <button
            type="button"
            className="text-sm font-semibold text-primary"
            onClick={async () => {
              await saveDecision({
                projectId,
                type: "variation",
                title: "New variation",
                description: "Describe the variation",
                costDelta: 0,
                scheduleDelta: 0
              });
              await loadSummary();
            }}
          >
            + Add sample variation
          </button>
          {(summary?.decisions || []).map((d) => (
            <p key={d.id} className="text-sm border-b border-hairline py-2">
              {d.title} — <span className="capitalize">{d.status}</span>
            </p>
          ))}
        </div>
      )}

      {tab === "claims" && (
        <div className="space-y-3">
          <button
            type="button"
            className="text-sm font-semibold text-primary"
            onClick={async () => {
              await saveClaim({
                projectId,
                stageName: "Progress claim",
                amount: 0,
                status: "upcoming"
              });
              await loadSummary();
            }}
          >
            + Add claim stage
          </button>
          {(summary?.claims || []).map((c) => (
            <p key={c.id} className="text-sm">
              {c.stageName}: ${c.amount} ({c.status})
            </p>
          ))}
        </div>
      )}

      {tab === "settings" && (
        <div className="rounded-card border border-hairline bg-surface p-5 space-y-3">
          <label className="text-sm block">
            Contract value
            <input
              type="number"
              className="mt-1 w-full border border-hairline rounded-lg px-3 py-2"
              defaultValue={proj.contractValue || ""}
              onBlur={(e) =>
                patchProject({ contract_value: e.target.value ? Number(e.target.value) : null })
              }
            />
          </label>
          <label className="text-sm block">
            Completion date (est.)
            <input
              type="date"
              className="mt-1 w-full border border-hairline rounded-lg px-3 py-2"
              defaultValue={proj.completionDateEst?.slice(0, 10) || ""}
              onBlur={(e) => patchProject({ completion_date_est: e.target.value || null })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
