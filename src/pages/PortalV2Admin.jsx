import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiFetch, apiPost, apiPatch } from "../lib/apiFetch.js";

const BUILD_PHASES = [
  { v: "pre_construction", label: "Pre-Construction" },
  { v: "on_site", label: "On Site" },
  { v: "practical_completion", label: "Practical Completion" },
];
const CONFIDENCE = ["on_track", "watch", "delayed"];
const DOC_FOLDERS = ["contract", "approved_plans", "engineering", "specifications", "selections", "variations", "progress_claims", "meeting_minutes", "compliance", "whs", "warranty_handover", "manuals", "certificates"];

function Section({ title, children, desc }) {
  return (
    <section className="rounded-card border border-hairline bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {desc ? <p className="mt-0.5 text-xs text-muted">{desc}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm focus-ring";

export default function PortalV2Admin() {
  const { projectId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const { ok, data, error } = await apiFetch(`/api/portal/admin/v2/${projectId}/overview`);
    setLoading(false);
    if (!ok) { setError(error); return; }
    setData(data); setError(null);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  if (loading) return <div className="p-6 text-sm text-muted">Loading portal admin…</div>;
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  const project = data?.project || {};

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Client Portal v2 — Admin</h1>
          <p className="text-sm text-muted">{project.address || projectId}</p>
        </div>
        <Link to="/portal-admin" className="text-xs font-semibold text-primary hover:underline">← Portal admin</Link>
      </div>

      {toast ? <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{toast}</div> : null}

      <SettingsSection project={project} projectId={projectId} onSaved={(m) => { flash(m); load(); }} />
      <InviteSection projectId={projectId} clients={data?.clients || []} onDone={(m) => { flash(m); load(); }} />
      <UpdateSection projectId={projectId} onDone={flash} />
      <UpdatesListSection projectId={projectId} onDone={flash} />
      <MilestonesSection projectId={projectId} milestones={data?.milestones || []} onDone={(m) => { flash(m); load(); }} />
      <SelectionsSection projectId={projectId} selections={data?.selections || []} onDone={(m) => { flash(m); load(); }} />
      <MeetingsSection projectId={projectId} meetings={data?.meetings || []} onDone={(m) => { flash(m); load(); }} />
      <DocumentsSection projectId={projectId} onDone={flash} />
      <RegisterContractSection projectId={projectId} onDone={flash} />
      <PhotosSection projectId={projectId} milestones={data?.milestones || []} onDone={flash} />
      <AwaitingSignSection projectId={projectId} />
      <ClientsSection projectId={projectId} clients={data?.clients || []} onDone={(m) => { flash(m); load(); }} />
    </div>
  );
}

function UpdatesListSection({ projectId, onDone }) {
  const [updates, setUpdates] = useState([]);
  const [busy, setBusy] = useState(null);
  const load = useCallback(async () => {
    const { ok, data } = await apiFetch(`/api/portal/admin/v2/${projectId}/updates`);
    if (ok) setUpdates(data?.updates || []);
  }, [projectId]);
  useEffect(() => { load(); }, [load]);
  const drafts = updates.filter((u) => !u.published);
  if (!drafts.length) return null;
  async function publish(u) {
    setBusy(u.id);
    const { ok, error } = await apiPatch(`/api/portal/admin/v2/${projectId}/updates/${u.id}`, { publish: true });
    setBusy(null);
    if (ok) { onDone("Update published to the Journey."); load(); } else onDone(error || "Failed");
  }
  return (
    <Section title="Draft updates" desc="Auto-drafted from the site diary — review and publish to the Project Journey.">
      <div className="space-y-2">
        {drafts.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-2 rounded-lg border border-hairline p-2 text-xs">
            <span className="min-w-0 flex-1 truncate">{u.headline}{u.weekOf ? ` · ${u.weekOf}` : ""}</span>
            <button disabled={busy === u.id} onClick={() => publish(u)} className="rounded bg-primary px-2 py-0.5 font-semibold text-white disabled:opacity-50">Publish</button>
          </div>
        ))}
      </div>
    </Section>
  );
}

function RegisterContractSection({ projectId, onDone }) {
  const [path, setPath] = useState("");
  const [title, setTitle] = useState("Building Contract");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [category, setCategory] = useState("contract");
  async function register() {
    if (!path.trim()) return;
    setBusy(true);
    const { ok, error } = await apiPost(`/api/portal/admin/v2/${projectId}/register-document`, { storagePath: path.trim(), documentType: category, title });
    setBusy(false);
    if (ok) { setPath(""); onDone("Document registered — expose it in Documents to share."); } else onDone(error || "Failed");
  }
  async function upload() {
    if (!file) return;
    setBusy(true);
    const fileBase64 = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(file); });
    const { ok, error } = await apiPost(`/api/portal/admin/v2/${projectId}/upload-document`, { fileBase64, fileName: file.name, category, title, exposeNow: true });
    setBusy(false);
    if (ok) { setFile(null); onDone("Document uploaded and shared with the client."); } else onDone(error || "Upload failed");
  }
  return (
    <Section title="Add a document" desc="Upload a file (e.g. the signed contract) — it's filed, registered, and shown in the client's Documents tab. Or register an existing Dropbox file.">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={`${inputCls} flex-1`} />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-hairline px-2 py-2 text-sm">
            {["contract", "plans", "engineering", "permit", "selections", "certificate"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-xs" />
          <button disabled={busy || !file} onClick={upload} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Uploading…" : "Upload + share"}</button>
        </div>
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Or register an existing Dropbox file</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="Dropbox path…" className={`${inputCls} flex-1`} />
            <button disabled={busy || !path.trim()} onClick={register} className="rounded-lg border border-hairline px-3 py-2 text-sm font-semibold disabled:opacity-50">Register</button>
          </div>
        </details>
      </div>
    </Section>
  );
}

function PhotosSection({ projectId, milestones, onDone }) {
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(null);
  const [up, setUp] = useState({ file: null, caption: "", milestoneKey: "", clientVisible: true, uploading: false });
  const load = useCallback(async () => {
    const { ok, data } = await apiFetch(`/api/portal/admin/v2/${projectId}/photos`);
    if (ok) setPhotos(data?.photos || []);
  }, [projectId]);
  useEffect(() => { load(); }, [load]);
  async function tag(p, patch) {
    setBusy(p.id);
    const { ok, error } = await apiPatch(`/api/portal/admin/v2/${projectId}/photos/${p.id}`, patch);
    setBusy(null);
    if (ok) { onDone("Photo updated."); load(); } else onDone(error || "Failed");
  }
  async function upload() {
    if (!up.file) return;
    setUp((s) => ({ ...s, uploading: true }));
    const imageBase64 = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(up.file);
    });
    const { ok, error } = await apiPost(`/api/portal/admin/v2/${projectId}/photos`, {
      imageBase64, fileName: up.file.name, caption: up.caption, milestoneKey: up.milestoneKey, clientVisible: up.clientVisible,
    });
    setUp({ file: null, caption: "", milestoneKey: "", clientVisible: true, uploading: false });
    if (ok) { onDone("Photo uploaded."); load(); } else onDone(error || "Upload failed");
  }
  return (
    <Section title="Photos" desc="Upload progress photos, tag them to a stage, and mark them client-visible to show on the Project Journey.">
      <div className="mb-3 space-y-2 rounded-lg border border-dashed border-hairline p-3">
        <input type="file" accept="image/*" onChange={(e) => setUp((s) => ({ ...s, file: e.target.files?.[0] || null }))} className="block w-full text-xs" />
        <input value={up.caption} onChange={(e) => setUp((s) => ({ ...s, caption: e.target.value }))} placeholder="Caption (optional)" className={inputCls} />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select value={up.milestoneKey} onChange={(e) => setUp((s) => ({ ...s, milestoneKey: e.target.value }))} className="rounded border border-hairline px-2 py-1">
            <option value="">— stage —</option>
            {milestones.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <label className="flex items-center gap-1"><input type="checkbox" checked={up.clientVisible} onChange={(e) => setUp((s) => ({ ...s, clientVisible: e.target.checked }))} /> Show client</label>
          <button disabled={!up.file || up.uploading} onClick={upload} className="rounded-lg bg-primary px-4 py-1.5 font-semibold text-white disabled:opacity-50">{up.uploading ? "Uploading…" : "Upload photo"}</button>
        </div>
      </div>
      {photos.length === 0 ? <p className="text-xs text-muted">No photos for this project yet.</p> : (
        <div className="space-y-2">
          {photos.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline p-2 text-xs">
              <span className="min-w-0 flex-1 truncate">{p.caption || "(untitled)"}{p.takenAt ? ` · ${String(p.takenAt).slice(0, 10)}` : ""}</span>
              <select defaultValue={p.milestoneKey || ""} onChange={(e) => tag(p, { milestoneKey: e.target.value })} className="rounded border border-hairline px-1 py-0.5">
                <option value="">— stage —</option>
                {milestones.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
              <button disabled={busy === p.id} onClick={() => tag(p, { clientVisible: true })} className="rounded bg-primary px-2 py-0.5 font-semibold text-white disabled:opacity-50">Show client</button>
              <button disabled={busy === p.id} onClick={() => tag(p, { clientVisible: false })} className="rounded border border-hairline px-2 py-0.5 disabled:opacity-50">Hide</button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function AwaitingSignSection({ projectId }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let active = true;
    (async () => {
      const { ok, data } = await apiFetch(`/api/portal/admin/v2/${projectId}/awaiting-sign`);
      if (active && ok) setItems(data?.awaitingSign || []);
    })();
    return () => { active = false; };
  }, [projectId]);
  if (!items.length) return null;
  return (
    <Section title="Client-approved — awaiting your signature" desc="The client approved these in the portal. Sign them in Finance to update the contract value.">
      <div className="space-y-1">
        {items.map((v) => (
          <div key={v.decisionId} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
            <span>Variation #{v.variationNumber} — {v.title}</span>
            <span className="font-semibold">{v.amountIncGst != null ? `$${Number(v.amountIncGst).toLocaleString()} inc GST` : ""}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ClientsSection({ projectId, clients, onDone }) {
  const [busy, setBusy] = useState(null);
  if (!clients.length) return null;
  async function setActive(c, isActive) {
    const userId = c.userId || c.user_id;
    if (!userId) return;
    setBusy(userId);
    const { ok, error } = await apiPatch(`/api/portal/admin/v2/${projectId}/client-users/${userId}/active`, { isActive });
    setBusy(null);
    if (ok) onDone(isActive ? "Client access restored." : "Client access revoked."); else onDone(error || "Failed");
  }
  return (
    <Section title="Client access" desc="Revoke or restore a client's portal access (takes effect immediately).">
      <div className="space-y-1">
        {clients.map((c) => {
          const userId = c.userId || c.user_id;
          const revoked = c.isActive === false || c.is_active === false;
          return (
            <div key={userId} className="flex items-center justify-between rounded-lg border border-hairline px-3 py-2 text-xs">
              <span>{c.fullName || c.full_name || c.email}{c.role ? ` · ${c.role}` : ""}{revoked ? " · revoked" : ""}</span>
              {revoked
                ? <button disabled={busy === userId} onClick={() => setActive(c, true)} className="rounded bg-primary px-2 py-0.5 font-semibold text-white disabled:opacity-50">Restore</button>
                : <button disabled={busy === userId} onClick={() => setActive(c, false)} className="rounded border border-red-300 px-2 py-0.5 text-red-600 disabled:opacity-50">Revoke</button>}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function DocumentsSection({ projectId, onDone }) {
  const [docs, setDocs] = useState([]);
  const [folderById, setFolderById] = useState({});
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    const { ok, data } = await apiFetch(`/api/portal/admin/v2/${projectId}/available-documents`);
    if (ok) setDocs(data?.documents || []);
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  async function expose(d) {
    const folder = folderById[d.id] || "approved_plans";
    setBusy(d.id);
    await apiPost(`/api/portal/admin/v2/${projectId}/expose-document`, { jobDocumentId: d.id, folder, title: d.title });
    setBusy(null);
    setDocs((list) => list.filter((x) => x.id !== d.id));
    onDone("Document shared with the client.");
  }

  return (
    <Section title="Documents" desc="Share existing project documents with the client. Only current versions appear.">
      {docs.length === 0 ? (
        <p className="text-xs text-muted">No new documents to share — all current documents are already shared, or none exist yet.</p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-page px-3 py-2 text-sm">
              <span className="min-w-0 truncate font-medium text-ink">{d.title || d.documentType}</span>
              <span className="flex items-center gap-2">
                <select
                  value={folderById[d.id] || "approved_plans"}
                  onChange={(e) => setFolderById((s) => ({ ...s, [d.id]: e.target.value }))}
                  className={inputCls}
                  style={{ width: "auto" }}
                >
                  {DOC_FOLDERS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <button
                  type="button"
                  disabled={busy === d.id}
                  onClick={() => expose(d)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busy === d.id ? "Sharing…" : "Share"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function SettingsSection({ project, projectId, onSaved }) {
  const [v2, setV2] = useState(!!project.portalV2Enabled);
  const [phase, setPhase] = useState(project.buildPhase || "pre_construction");
  const [team, setTeam] = useState(JSON.stringify(project.teamMembers || [], null, 2));
  const [pay, setPay] = useState(project.paymentInstructions || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function save() {
    setBusy(true); setErr(null);
    let teamMembers;
    try { teamMembers = JSON.parse(team || "[]"); } catch { setBusy(false); setErr("Team members must be valid JSON."); return; }
    const { ok, error } = await apiPatch(`/api/portal/admin/v2/${projectId}/settings`, { portalV2Enabled: v2, buildPhase: phase, teamMembers, paymentInstructions: pay });
    setBusy(false);
    if (!ok) { setErr(error); return; }
    onSaved("Settings saved.");
  }

  return (
    <Section title="Settings" desc="Enable login-based v2, set the build phase, and the team directory.">
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v2} onChange={(e) => setV2(e.target.checked)} />
          <span className="text-ink">Portal v2 enabled (client login)</span>
        </label>
        <Field label="Build phase">
          <select value={phase} onChange={(e) => setPhase(e.target.value)} className={inputCls}>
            {BUILD_PHASES.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Team members (JSON: name, role, contactPreference)">
          <textarea value={team} onChange={(e) => setTeam(e.target.value)} rows={4} className={`${inputCls} font-mono text-xs`} />
        </Field>
        <Field label="Payment instructions (shown to the client on progress claims)">
          <textarea
            value={pay}
            onChange={(e) => setPay(e.target.value)}
            rows={4}
            placeholder={"Account name: Blue Leaf Building Pty Ltd\nBSB: 000 000\nAccount: 0000 0000\nReference: [job address]"}
            className={inputCls}
          />
        </Field>
        {err ? <p className="text-xs text-red-600">{err}</p> : null}
        <button disabled={busy} onClick={save} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? "Saving…" : "Save settings"}
        </button>
      </div>
    </Section>
  );
}

function InviteSection({ projectId, clients, onDone }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function invite() {
    if (!email.trim()) return;
    setBusy(true); setErr(null);
    const { ok, error } = await apiPost("/api/auth/invite", { email: email.trim(), fullName: name.trim() || undefined, role: "client", projectId });
    setBusy(false);
    if (!ok) { setErr(error); return; }
    setEmail(""); setName("");
    onDone("Invitation sent.");
  }

  return (
    <Section title="Client access" desc="Invite the client to create a login. They'll get a branded email with a set-password link.">
      {clients.length ? (
        <ul className="mb-3 space-y-1 text-xs text-muted">
          {clients.map((c) => (
            <li key={c.id}>● {c.role} · {c.inviteAcceptedAt ? "active" : "invited"} {c.isActive ? "" : "(inactive)"}</li>
          ))}
        </ul>
      ) : <p className="mb-3 text-xs text-muted">No client linked yet.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" className={inputCls} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@email.com" type="email" className={inputCls} />
      </div>
      {err ? <p className="mt-2 text-xs text-red-600">{err}</p> : null}
      <button disabled={busy} onClick={invite} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
        {busy ? "Sending…" : "Invite client"}
      </button>
    </Section>
  );
}

function UpdateSection({ projectId, onDone }) {
  const [f, setF] = useState({ headline: "", body: "", builderReasoning: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function publish() {
    if (!f.headline.trim()) return;
    setBusy(true); setErr(null);
    const { ok, error } = await apiPost(`/api/portal/admin/v2/${projectId}/updates`, { ...f, publish: true });
    setBusy(false);
    if (!ok) { setErr(error); return; }
    setF({ headline: "", body: "", builderReasoning: "" });
    onDone("Update published.");
  }

  return (
    <Section title="Weekly update" desc="Publishes to Project Journey. 'Why we did it this way' is the how-we-build note.">
      <div className="space-y-2">
        <input value={f.headline} onChange={set("headline")} placeholder="Headline" className={inputCls} />
        <textarea value={f.body} onChange={set("body")} placeholder="This week…" rows={3} className={inputCls} />
        <textarea value={f.builderReasoning} onChange={set("builderReasoning")} placeholder="Why we did it this way (optional)" rows={2} className={inputCls} />
        {err ? <p className="text-xs text-red-600">{err}</p> : null}
        <button disabled={busy} onClick={publish} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? "Publishing…" : "Publish update"}
        </button>
      </div>
    </Section>
  );
}

function MilestonesSection({ projectId, milestones, onDone }) {
  const [add, setAdd] = useState({ key: "", label: "", confidence: "", confidenceNote: "", stagePreview: "" });
  const set = (k) => (e) => setAdd((s) => ({ ...s, [k]: e.target.value }));
  const [busy, setBusy] = useState(false);

  async function setConfidence(m, confidence) {
    await apiPatch(`/api/portal/admin/v2/${projectId}/milestones/${m.id}`, { confidence });
    onDone("Milestone updated.");
  }
  async function makeCurrent(m) {
    await apiPatch(`/api/portal/admin/v2/${projectId}/milestones/${m.id}`, { isCurrent: true });
    onDone("Current stage updated.");
  }
  async function create() {
    if (!add.key || !add.label) return;
    setBusy(true);
    await apiPost(`/api/portal/admin/v2/${projectId}/milestones`, { ...add, sortOrder: milestones.length });
    setBusy(false);
    setAdd({ key: "", label: "", confidence: "", confidenceNote: "", stagePreview: "" });
    onDone("Milestone added.");
  }

  return (
    <Section title="Milestones (Project Journey)">
      <ul className="space-y-2">
        {milestones.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-page px-3 py-2 text-sm">
            <span className="font-medium text-ink">
              {m.label} {m.isCurrent ? <span className="ml-1 rounded bg-primary/10 px-1.5 text-[10px] text-primary">current</span> : null}
            </span>
            <span className="flex items-center gap-1">
              {CONFIDENCE.map((c) => (
                <button key={c} onClick={() => setConfidence(m, c)} className={`rounded px-1.5 py-0.5 text-[10px] ${m.confidence === c ? "bg-ink text-white" : "border border-hairline text-muted"}`}>{c}</button>
              ))}
              {!m.isCurrent ? <button onClick={() => makeCurrent(m)} className="ml-1 text-[10px] text-primary hover:underline">set current</button> : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input value={add.key} onChange={set("key")} placeholder="key (e.g. frame)" className={inputCls} />
        <input value={add.label} onChange={set("label")} placeholder="Label (e.g. Frame & Roof)" className={inputCls} />
        <input value={add.stagePreview} onChange={set("stagePreview")} placeholder="Stage preview (what's coming)" className={`${inputCls} sm:col-span-2`} />
      </div>
      <button disabled={busy} onClick={create} className="mt-2 rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-ink hover:bg-page disabled:opacity-50">+ Add milestone</button>
    </Section>
  );
}

function SelectionsSection({ projectId, selections, onDone }) {
  const [f, setF] = useState({ category: "", itemName: "", allowanceAmount: "", dueDate: "", optA: "", priceA: "", optB: "", priceB: "" });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!f.category || !f.itemName) return;
    setBusy(true);
    const options = [];
    if (f.optA) options.push({ label: "Option A", productName: f.optA, priceIncGst: f.priceA ? Number(f.priceA) : null, isRecommended: true });
    if (f.optB) options.push({ label: "Option B", productName: f.optB, priceIncGst: f.priceB ? Number(f.priceB) : null });
    await apiPost(`/api/portal/admin/v2/${projectId}/selections`, {
      category: f.category, itemName: f.itemName,
      allowanceAmount: f.allowanceAmount ? Number(f.allowanceAmount) : null,
      dueDate: f.dueDate || null, options,
    });
    setBusy(false);
    setF({ category: "", itemName: "", allowanceAmount: "", dueDate: "", optA: "", priceA: "", optB: "", priceB: "" });
    onDone("Selection added.");
  }

  return (
    <Section title="Selections">
      <ul className="mb-3 space-y-1 text-xs text-muted">
        {selections.map((s) => <li key={s.id}>● {s.itemName} — {s.status}{s.dueDate ? ` · due ${s.dueDate}` : ""}</li>)}
      </ul>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={f.category} onChange={set("category")} placeholder="Category (Kitchen)" className={inputCls} />
        <input value={f.itemName} onChange={set("itemName")} placeholder="Item (Splashback Tile)" className={inputCls} />
        <input value={f.allowanceAmount} onChange={set("allowanceAmount")} placeholder="Allowance $ inc GST" className={inputCls} />
        <input value={f.dueDate} onChange={set("dueDate")} type="date" className={inputCls} />
        <input value={f.optA} onChange={set("optA")} placeholder="Option A product" className={inputCls} />
        <input value={f.priceA} onChange={set("priceA")} placeholder="Option A $ inc GST" className={inputCls} />
        <input value={f.optB} onChange={set("optB")} placeholder="Option B product" className={inputCls} />
        <input value={f.priceB} onChange={set("priceB")} placeholder="Option B $ inc GST" className={inputCls} />
      </div>
      <button disabled={busy} onClick={create} className="mt-2 rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-ink hover:bg-page disabled:opacity-50">+ Add selection</button>
    </Section>
  );
}

function MeetingsSection({ projectId, meetings, onDone }) {
  const [f, setF] = useState({ title: "Site Meeting", scheduledAt: "", agenda: "" });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    await apiPost(`/api/portal/admin/v2/${projectId}/meetings`, { ...f, requestConfirmation: true });
    setBusy(false);
    setF({ title: "Site Meeting", scheduledAt: "", agenda: "" });
    onDone("Meeting added.");
  }

  return (
    <Section title="Meetings">
      <ul className="mb-3 space-y-1 text-xs text-muted">
        {meetings.map((m) => <li key={m.id}>● {m.title} — {m.status}{m.scheduledAt ? ` · ${new Date(m.scheduledAt).toLocaleString("en-AU")}` : ""}</li>)}
      </ul>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={f.title} onChange={set("title")} placeholder="Title" className={inputCls} />
        <input value={f.scheduledAt} onChange={set("scheduledAt")} type="datetime-local" className={inputCls} />
        <input value={f.agenda} onChange={set("agenda")} placeholder="Agenda" className={`${inputCls} sm:col-span-2`} />
      </div>
      <button disabled={busy} onClick={create} className="mt-2 rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-ink hover:bg-page disabled:opacity-50">+ Add meeting</button>
    </Section>
  );
}
