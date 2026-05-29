import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../lib/apiFetch.js";
import ContactDrawer from "./ContactDrawer.jsx";

function ActionBadge({ type }) {
  const icons = { call: "📞", email: "📧", meeting: "📅", dm: "💬" };
  return <span>{icons[type] || "·"}</span>;
}

function statusColor(dueDate) {
  if (!dueDate) return "white";
  const today = new Date().toISOString().split("T")[0];
  if (dueDate < today) return "red";
  if (dueDate === today) return "yellow";
  return "white";
}

function RelationshipBar({ score }) {
  const color = score >= 76 ? "bg-primary" : score >= 51 ? "bg-blue-400" : score >= 21 ? "bg-amber-400" : "bg-slate-300";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-page rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium text-ink w-6 text-right">{score}</span>
    </div>
  );
}

function fullName(c) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "—";
}

function typeLabel(t) {
  return { prospect: "Prospect", referrer: "Referrer", past_client: "Past Client", architect: "Architect", designer: "Designer", developer: "Developer", agent: "Agent", supplier: "Supplier", other: "Other" }[t] || t;
}

function daysAgo(dateStr) {
  if (!dateStr) return null;
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

export default function CrmDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedContact, setSelectedContact] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data: d } = await apiFetch("/api/crm/dashboard");
    if (ok) setData(d);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="py-16 text-center text-muted text-sm">Loading dashboard…</div>;
  }

  const { actionContacts = [], topRelationships = [], health = {}, speedToLeadHours } = data || {};

  const today = new Date().toISOString().split("T")[0];
  const overdue = actionContacts.filter(c => c.nextActionDueDate && c.nextActionDueDate < today);
  const dueToday = actionContacts.filter(c => c.nextActionDueDate === today);
  const thisWeek = actionContacts.filter(c => {
    const next7 = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    return c.nextActionDueDate > today && c.nextActionDueDate <= next7;
  });

  const allActions = [...overdue, ...dueToday, ...thisWeek];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">CRM</p>
          <h1 className="text-3xl font-semibold tracking-tight text-primary">Relationship Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Your action list — who to contact today.</p>
        </div>
        <button
          onClick={() => navigate("/sales/contacts")}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90"
        >
          + New Contact
        </button>
      </div>

      {/* Today's actions */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-ink">Today&apos;s Actions ({allActions.length})</h2>
          <button onClick={() => navigate("/sales/contacts?overdue=true")} className="text-xs text-primary hover:underline">
            See all contacts →
          </button>
        </div>

        {allActions.length === 0 ? (
          <p className="text-sm text-muted py-4">No actions due — all caught up.</p>
        ) : (
          <div className="divide-y divide-hairline">
            {allActions.map(c => {
              const color = statusColor(c.nextActionDueDate);
              return (
                <div key={c.id} className="flex items-center gap-3 py-2.5">
                  <span className={`text-lg flex-shrink-0 ${color === "red" ? "text-red-500" : color === "yellow" ? "text-amber-500" : "text-slate-400"}`}>
                    <ActionBadge type={c.nextActionType} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium text-sm ${color === "red" ? "text-red-700" : "text-ink"}`}>
                        {fullName(c)}
                      </span>
                      <span className="text-xs text-muted">{typeLabel(c.contactType)}</span>
                      {color === "red" && (
                        <span className="text-xs text-red-600 font-medium">
                          · {c.lastContactDate ? `${daysAgo(c.lastContactDate)} since contact` : "never contacted"}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedContact(c.id)}
                    className="text-xs text-primary border border-primary/30 rounded px-2 py-0.5 hover:bg-primary/5 flex-shrink-0"
                  >
                    Log →
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <div className={`text-2xl font-bold ${health.overdueActions > 0 ? "text-red-600" : "text-ink"}`}>
            {health.overdueActions}
          </div>
          <div className="text-xs text-muted mt-0.5">Overdue actions</div>
        </div>
        <div className="card text-center">
          <div className={`text-2xl font-bold ${health.noContactOver90 > 5 ? "text-amber-600" : "text-ink"}`}>
            {health.noContactOver90}
          </div>
          <div className="text-xs text-muted mt-0.5">No contact &gt;90d</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-primary">{health.newThisMonth}</div>
          <div className="text-xs text-muted mt-0.5">New this month</div>
        </div>
        <div className="card text-center">
          <div className={`text-2xl font-bold ${speedToLeadHours !== null && speedToLeadHours > 4 ? "text-amber-600" : "text-emerald-600"}`}>
            {speedToLeadHours !== null ? `${speedToLeadHours}h` : "—"}
          </div>
          <div className="text-xs text-muted mt-0.5">
            Avg speed to lead
            {speedToLeadHours !== null && speedToLeadHours > 4 && (
              <span className="ml-1 text-amber-600">⚠ APB target: &lt;1h</span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom: top relationships + pipeline health */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Top relationships */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-ink">Top Relationships</h2>
          </div>
          {topRelationships.length === 0 ? (
            <p className="text-sm text-muted">No contacts yet.</p>
          ) : (
            <div className="space-y-2">
              {topRelationships.slice(0, 8).map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedContact(c.id)}
                  className="w-full text-left hover:bg-page rounded-lg px-2 py-1.5 group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted w-4">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink group-hover:text-primary">{fullName(c)}</div>
                      <div className="text-xs text-muted">{typeLabel(c.contactType)}</div>
                    </div>
                    <div className="w-28 flex-shrink-0">
                      <RelationshipBar score={c.relationshipScore || 0} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pipeline health */}
        <div className="card">
          <h2 className="font-semibold text-ink mb-3">Pipeline Health</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted">Active prospects</span>
              <span className="font-semibold text-ink">{health.activeProspects}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted">Future pipeline</span>
              <span className="font-semibold text-ink">{health.futurePipeline}</span>
            </div>
            <div className="border-t border-hairline pt-3">
              <button
                onClick={() => navigate("/sales/contacts")}
                className="text-sm text-primary hover:underline"
              >
                View all contacts →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Contact drawer */}
      {selectedContact && (
        <ContactDrawer
          contactId={selectedContact}
          onClose={() => setSelectedContact(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
