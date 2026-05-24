import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../lib/authFetch.js";

const PROJECT_TYPES = [
  { value: "new_build", label: "New Build" },
  { value: "extension", label: "Extension" },
  { value: "renovation", label: "Renovation" },
  { value: "knockdown_rebuild", label: "Knockdown Rebuild" },
];

const OUR_ROLES = [
  { value: "supervised", label: "Supervised" },
  { value: "project_managed", label: "Project Managed" },
  { value: "site_managed", label: "Site Managed" },
  { value: "owner_builder_pm", label: "Owner Builder PM" },
];

const KEY_FEATURE_OPTIONS = [
  "steep_site", "raked_ceilings", "double_storey", "pool",
  "large_format", "heritage", "extension", "knockdown",
];

const ROLE_PILL = {
  supervised: "bg-blue-100 text-blue-700",
  project_managed: "bg-green-100 text-green-700",
  site_managed: "bg-violet-100 text-violet-700",
  owner_builder_pm: "bg-amber-100 text-amber-800",
};

function fmtCurrency(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency", currency: "AUD", maximumFractionDigits: 0,
  }).format(n);
}

function emptyForm() {
  return {
    project_label: "",
    suburb: "",
    project_type: "new_build",
    approx_value: "",
    year_completed: "",
    storeys: "",
    floor_area_m2: "",
    our_role: "supervised",
    attribution_note: "",
    key_features: [],
    testimonial_text: "",
    testimonial_name: "",
    display_photo_url: "",
    is_active: true,
    sort_order: 0,
  };
}

export default function ReferenceProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await authFetch("/api/sales/reference-projects");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to load");
      setProjects(j.projects || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setPanelOpen(true);
  }

  function openEdit(p) {
    setEditing(p);
    setForm({
      project_label: p.project_label || "",
      suburb: p.suburb || "",
      project_type: p.project_type || "new_build",
      approx_value: p.approx_value != null ? String(p.approx_value) : "",
      year_completed: p.year_completed != null ? String(p.year_completed) : "",
      storeys: p.storeys != null ? String(p.storeys) : "",
      floor_area_m2: p.floor_area_m2 != null ? String(p.floor_area_m2) : "",
      our_role: p.our_role || "supervised",
      attribution_note: p.attribution_note || "",
      key_features: Array.isArray(p.key_features) ? p.key_features : [],
      testimonial_text: p.testimonial_text || "",
      testimonial_name: p.testimonial_name || "",
      display_photo_url: p.display_photo_url || "",
      is_active: p.is_active !== false,
      sort_order: p.sort_order ?? 0,
    });
    setPanelOpen(true);
  }

  function toggleFeature(f) {
    setForm((prev) => ({
      ...prev,
      key_features: prev.key_features.includes(f)
        ? prev.key_features.filter((x) => x !== f)
        : [...prev.key_features, f],
    }));
  }

  async function save(e) {
    e.preventDefault();
    if (!form.project_label.trim()) return;
    setSaving(true);
    setError("");
    const payload = {
      project_label: form.project_label.trim(),
      suburb: form.suburb.trim() || null,
      project_type: form.project_type || null,
      approx_value: form.approx_value ? Number(form.approx_value) : null,
      year_completed: form.year_completed ? parseInt(form.year_completed, 10) : null,
      storeys: form.storeys ? parseInt(form.storeys, 10) : null,
      floor_area_m2: form.floor_area_m2 ? Number(form.floor_area_m2) : null,
      our_role: form.our_role,
      attribution_note: form.attribution_note.trim() || null,
      key_features: form.key_features,
      testimonial_text: form.testimonial_text.trim() || null,
      testimonial_name: form.testimonial_name.trim() || null,
      display_photo_url: form.display_photo_url.trim() || null,
      is_active: form.is_active,
      sort_order: Number(form.sort_order) || 0,
    };
    try {
      const url = editing
        ? `/api/sales/reference-projects/${editing.id}`
        : "/api/sales/reference-projects";
      const r = await authFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Save failed");
      setPanelOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(p) {
    if (!window.confirm(`Remove "${p.project_label}" from the library?`)) return;
    try {
      const r = await authFetch(`/api/sales/reference-projects/${p.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Delete failed");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex gap-6 relative">
      <div className={`flex-1 min-w-0 space-y-6 transition-all ${panelOpen ? "lg:mr-[22rem]" : ""}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Sales</p>
            <h1 className="text-2xl font-bold text-ink">Reference Projects</h1>
            <p className="text-sm text-muted mt-1">
              Past builds for Winning Offer presentations — supervised and managed projects.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-primary text-white text-sm font-semibold px-4 py-2.5 hover:bg-primary/90 transition-colors shrink-0"
          >
            Add project
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-card border border-hairline bg-surface h-40 animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-card border border-dashed border-hairline bg-page py-16 text-center text-sm text-muted">
            No reference projects yet — add your first supervised build.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <div key={p.id} className="rounded-card border border-hairline bg-surface p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-bold text-ink leading-tight">{p.project_label}</h2>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${ROLE_PILL[p.our_role] || ROLE_PILL.supervised}`}>
                    {OUR_ROLES.find((r) => r.value === p.our_role)?.label || p.our_role}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {[p.suburb, PROJECT_TYPES.find((t) => t.value === p.project_type)?.label, p.year_completed]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {p.approx_value != null && (
                  <p className="text-sm font-semibold text-ink">{fmtCurrency(p.approx_value)}</p>
                )}
                {p.attribution_note && (
                  <p className="text-xs text-muted line-clamp-1">{p.attribution_note}</p>
                )}
                {Array.isArray(p.key_features) && p.key_features.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {p.key_features.map((f) => (
                      <span key={f} className="text-[10px] bg-page border border-hairline rounded px-1.5 py-0.5 text-muted">
                        {f.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                )}
                {p.testimonial_text && (
                  <p className="text-xs text-ink italic line-clamp-2">&ldquo;{p.testimonial_text}&rdquo;</p>
                )}
                <div className="flex gap-2 mt-auto pt-2 border-t border-hairline">
                  <button type="button" onClick={() => openEdit(p)} className="text-xs font-semibold text-primary hover:underline">
                    Edit
                  </button>
                  <button type="button" onClick={() => remove(p)} className="text-xs font-semibold text-red-600 hover:underline">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {panelOpen && (
        <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-sm border-l border-hairline bg-surface shadow-xl overflow-y-auto">
          <form onSubmit={save} className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink">{editing ? "Edit project" : "Add project"}</h2>
              <button type="button" onClick={() => setPanelOpen(false)} className="text-muted hover:text-ink text-sm">
                Close
              </button>
            </div>

            <Field label="Project label *" value={form.project_label} onChange={(v) => setForm((f) => ({ ...f, project_label: v }))} />
            <Field label="Suburb" value={form.suburb} onChange={(v) => setForm((f) => ({ ...f, suburb: v }))} />
            <div>
              <label className="block text-xs text-muted mb-1">Project type</label>
              <select
                value={form.project_type}
                onChange={(e) => setForm((f) => ({ ...f, project_type: e.target.value }))}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm bg-page text-ink"
              >
                {PROJECT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <Field label="Approx value ($)" value={form.approx_value} type="number" onChange={(v) => setForm((f) => ({ ...f, approx_value: v }))} />
            <Field label="Year completed" value={form.year_completed} type="number" onChange={(v) => setForm((f) => ({ ...f, year_completed: v }))} />
            <Field label="Storeys" value={form.storeys} type="number" onChange={(v) => setForm((f) => ({ ...f, storeys: v }))} />
            <Field label="Floor area (m²)" value={form.floor_area_m2} type="number" onChange={(v) => setForm((f) => ({ ...f, floor_area_m2: v }))} />
            <div>
              <label className="block text-xs text-muted mb-1">Our role</label>
              <select
                value={form.our_role}
                onChange={(e) => setForm((f) => ({ ...f, our_role: e.target.value }))}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm bg-page text-ink"
              >
                {OUR_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Attribution note</label>
              <textarea
                rows={2}
                value={form.attribution_note}
                onChange={(e) => setForm((f) => ({ ...f, attribution_note: e.target.value }))}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm bg-page text-ink resize-none"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">Key features</label>
              <div className="flex flex-wrap gap-1.5">
                {KEY_FEATURE_OPTIONS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFeature(f)}
                    className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                      form.key_features.includes(f)
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-hairline text-muted hover:border-primary/40"
                    }`}
                  >
                    {f.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Testimonial</label>
              <textarea
                rows={3}
                value={form.testimonial_text}
                onChange={(e) => setForm((f) => ({ ...f, testimonial_text: e.target.value }))}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm bg-page text-ink resize-none"
              />
            </div>
            <Field label="Testimonial name" value={form.testimonial_name} onChange={(v) => setForm((f) => ({ ...f, testimonial_name: v }))} />
            <Field label="Display photo URL" value={form.display_photo_url} onChange={(v) => setForm((f) => ({ ...f, display_photo_url: v }))} />
            <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="accent-primary"
              />
              Active (shown in library)
            </label>
            <Field label="Sort order" value={String(form.sort_order)} type="number" onChange={(v) => setForm((f) => ({ ...f, sort_order: v }))} />

            <button
              type="submit"
              disabled={saving || !form.project_label.trim()}
              className="w-full rounded-lg bg-primary text-white text-sm font-semibold py-2.5 disabled:opacity-50"
            >
              {saving ? "Saving…" : editing ? "Save changes" : "Create project"}
            </button>
          </form>
        </aside>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label className="block text-xs text-muted mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-hairline rounded-lg px-3 py-2 text-sm bg-page text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}
