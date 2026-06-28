import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "../lib/supabaseClient.js";
import { useAuth } from "../lib/useAuth.js";
import { ROLES, ROLE_LABELS, getRoleBadgeStyle } from "../lib/roles.js";

async function getAuthToken() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token || null;
}

async function authedFetch(url, options = {}) {
  const token = await getAuthToken();
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
}

async function readApiJson(res, label) {
  const text = await res.text();
  const contentType = res.headers.get("content-type") || "";
  // #region agent log
  fetch("http://127.0.0.1:7509/ingest/d371ba5f-b4f3-43d9-8864-df0c21883529", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c97c4c" },
    body: JSON.stringify({
      sessionId: "c97c4c",
      hypothesisId: "A-B",
      location: "UserManagement.jsx:readApiJson",
      message: "API response shape",
      data: {
        label,
        status: res.status,
        contentType,
        bodyPrefix: text.slice(0, 80),
        looksHtml: /^\s*</.test(text)
      },
      timestamp: Date.now()
    })
  }).catch(() => {});
  // #endregion
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    if (contentType.includes("text/html") || /^\s*</.test(text)) {
      throw new Error(
        "API returned HTML instead of JSON — the API server may be out of date. Stop and restart with npm run dev."
      );
    }
    throw new Error("Server response was not valid JSON.");
  }
}

export default function UserManagement() {
  const { profile, role } = useAuth();
  const [tab, setTab] = useState("team");
  const [users, setUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editRole, setEditRole] = useState("employee");
  const [editActive, setEditActive] = useState(true);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("employee");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);

  const loadUsers = useCallback(async () => {
    const res = await authedFetch("/api/auth/users");
    const j = await readApiJson(res, "loadUsers");
    if (!res.ok) throw new Error(j.error || "Failed to load users");
    setUsers(j.users || []);
  }, []);

  const loadInvitations = useCallback(async () => {
    const res = await authedFetch("/api/auth/invitations");
    const j = await readApiJson(res, "loadInvitations");
    if (!res.ok) throw new Error(j.error || "Failed to load invitations");
    setInvitations(j.invitations || []);
  }, []);

  useEffect(() => {
    if (role !== "admin") {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([loadUsers(), loadInvitations()]);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, loadUsers, loadInvitations]);

  if (role !== "admin") {
    return (
      <div className="rounded-card border border-hairline bg-surface p-8 text-center">
        <p className="text-sm text-muted">You do not have permission to manage users.</p>
      </div>
    );
  }

  function startEdit(u) {
    setEditingId(u.id);
    setEditRole(u.role);
    setEditActive(u.is_active);
    setEditName(u.full_name || "");
  }

  async function deleteUser(u) {
    if (u.id === profile?.id) return;
    if (!window.confirm(`Permanently delete ${u.full_name || u.email}?\n\nTheir login is removed and any linked staff record is unlinked so it can be re-invited. This cannot be undone.`)) return;
    setError("");
    try {
      const res = await authedFetch(`/api/auth/users/${u.id}`, { method: "DELETE" });
      const j = await readApiJson(res, "deleteUser");
      if (!res.ok || !j.ok) throw new Error(j.error || "Delete failed");
      await loadUsers();
    } catch (e) {
      setError(e.message);
    }
  }

  async function saveEdit(userId) {
    setSaving(true);
    setError("");
    try {
      const res = await authedFetch(`/api/auth/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ fullName: editName.trim(), role: editRole, isActive: editActive })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Save failed");
      setEditingId(null);
      await loadUsers();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleInvite(e) {
    e.preventDefault();
    setInviting(true);
    setInviteResult(null);
    try {
      const res = await authedFetch("/api/auth/invite", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole })
      });
      const j = await readApiJson(res, "handleInvite");
      if (!res.ok) {
        setInviteResult({ ok: false, error: j.error });
        return;
      }
      setInviteResult({ ok: true, email: j.email, inviteUrl: j.inviteUrl });
      setInviteEmail("");
      await loadInvitations();
    } catch (err) {
      setInviteResult({ ok: false, error: err.message });
    } finally {
      setInviting(false);
    }
  }

  async function revokeInvitation(id) {
    const res = await authedFetch(`/api/auth/invitations/${id}`, { method: "DELETE" });
    const j = await readApiJson(res, "revokeInvitation");
    if (!res.ok) {
      setError(j.error || "Revoke failed");
      return;
    }
    setInvitations((list) => list.filter((i) => i.id !== id));
  }

  const adminCount = users.filter((u) => u.role === "admin" && u.is_active).length;

  return (
    <div className="space-y-6 pb-24">
      <header>
        <h1 className="text-2xl font-bold text-ink">User management</h1>
        <p className="text-sm text-muted">Invite team members and manage roles.</p>
      </header>

      <div className="flex gap-6 border-b border-hairline">
        {[
          { id: "team", label: "Team" },
          { id: "invitations", label: "Invitations" }
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`pb-2 text-sm font-semibold border-b-2 -mb-px transition ${
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {loading ? <p className="text-sm text-muted">Loading…</p> : null}

      {tab === "team" && !loading ? (
        <div className="rounded-card border border-hairline bg-surface overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-hairline bg-page text-xs font-semibold uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === profile?.id;
                const editing = editingId === u.id;
                if (editing) {
                  return (
                    <tr key={u.id} className="border-t border-hairline bg-page/50">
                      <td className="px-4 py-3" colSpan={5}>
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="flex-1 min-w-[140px]">
                            <span className="text-xs font-semibold text-muted">Full name</span>
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
                            />
                          </label>
                          <label>
                            <span className="text-xs font-semibold text-muted">Role</span>
                            <select
                              value={editRole}
                              disabled={isSelf}
                              onChange={(e) => setEditRole(e.target.value)}
                              className="mt-1 block rounded-lg border border-hairline px-3 py-2 text-sm disabled:opacity-50"
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex items-center gap-2 pb-2">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={editActive}
                              disabled={isSelf}
                              onClick={() => setEditActive((v) => !v)}
                              className={`relative h-7 w-11 shrink-0 rounded-full transition ${
                                editActive ? "bg-primary" : "bg-hairline"
                              } ${isSelf ? "opacity-50" : ""}`}
                            >
                              <span
                                className={`absolute top-1 h-5 w-5 rounded-full bg-surface shadow transition ${
                                  editActive ? "left-5" : "left-1"
                                }`}
                              />
                            </button>
                            <span className="text-xs text-muted">Active</span>
                          </label>
                          {editRole !== "admin" && adminCount <= 1 && u.role === "admin" ? (
                            <p className="w-full text-xs text-warning">Cannot remove the only admin.</p>
                          ) : null}
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => saveEdit(u.id)}
                            className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-lg border border-hairline px-3 py-2 text-sm text-muted"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={u.id} className="border-t border-hairline">
                    <td className="px-4 py-3 font-medium text-ink">
                      {u.full_name || "—"}
                      {isSelf ? <span className="ml-1 text-xs text-muted">(You)</span> : null}
                    </td>
                    <td className="px-4 py-3 text-muted">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getRoleBadgeStyle(u.role)}`}>
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className={`h-2 w-2 rounded-full ${u.is_active ? "bg-green-400" : "bg-slate-300"}`} />
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => startEdit(u)}
                          className="text-sm font-semibold text-primary hover:underline"
                        >
                          Edit
                        </button>
                        {!isSelf && !(u.role === "admin" && adminCount <= 1) && (
                          <button
                            type="button"
                            onClick={() => deleteUser(u)}
                            className="text-sm font-semibold text-danger hover:underline"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "invitations" && !loading ? (
        <>
          <div className="bg-surface rounded-card border border-hairline p-6 mb-6">
            <h3 className="text-sm font-semibold text-ink mb-4">Send invitation</h3>
            <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1">
                <span className="section-label">Email address</span>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </label>
              <label className="w-40">
                <span className="section-label">Role</span>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={inviting}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60 whitespace-nowrap"
              >
                {inviting ? "Sending…" : "Send invite"}
              </button>
            </form>
            {inviteResult ? (
              <div
                className={`mt-3 rounded-lg px-4 py-3 text-sm ${
                  inviteResult.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                }`}
              >
                {inviteResult.ok
                  ? `Invitation sent to ${inviteResult.email}. Link: ${inviteResult.inviteUrl}`
                  : inviteResult.error}
              </div>
            ) : null}
          </div>

          <div className="rounded-card border border-hairline bg-surface divide-y divide-hairline">
            {invitations.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">No pending invitations.</p>
            ) : (
              invitations.map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="text-sm font-medium text-ink">{inv.email}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getRoleBadgeStyle(inv.role)}`}>
                    {ROLE_LABELS[inv.role]}
                  </span>
                  <span className="text-xs text-muted">
                    Expires {new Date(inv.expires_at).toLocaleDateString("en-AU")}
                  </span>
                  <button
                    type="button"
                    onClick={() => revokeInvitation(inv.id)}
                    className="ml-auto text-sm font-semibold text-danger hover:underline"
                  >
                    Revoke
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
