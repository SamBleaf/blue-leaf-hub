/**
 * CrmPeople.jsx — Unified CRM spreadsheet view.
 *
 * Fetches GET /api/crm/people (with ?view, ?search, ?limit, ?offset).
 * Sortable/filterable table using the same SortableTableHead + sheetSort pattern
 * as Subcontractors.jsx.
 *
 * Row click: kind==='lead' → navigate to Lead Detail (/sales/:id)
 *            kind==='contact' → open Contact Drawer
 *
 * Promote to Pipeline: for lead rows at stage==='enquiry', a button calls
 * PATCH /api/sales/leads/:id with { stage: LEAD_STAGES.QUALIFY }.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, apiPatch } from "../../lib/apiFetch.js";
import { LEAD_STAGES, LEAD_FIT_QUALITY_LABELS, LEAD_READINESS_LABELS } from "../../lib/constants.js";
import ContactDrawer from "./ContactDrawer.jsx";

// ─── Saved-view chips ─────────────────────────────────────────────────────────

const VIEWS = [
  { id: "",                    label: "All" },
  { id: "new_enquiries",       label: "New enquiries" },
  { id: "ready_for_review",    label: "Ready for review" },
  { id: "today",               label: "Today's actions" },
  { id: "nurture",             label: "Nurture" },
  { id: "architects_referrers",label: "Architects / referrers" },
  { id: "past_clients",        label: "Past clients" },
];

// ─── SortableTableHead (same pattern as Subcontractors.jsx) ──────────────────

const tableHeadCell = {
  textAlign: "left",
  padding: "9px 10px",
  borderBottom: "1px solid #e2e8f0",
  background: "#f8fafc",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};

function SortableTableHead({ label, sortKey, activeSort, onSort }) {
  const active = activeSort?.key === sortKey;
  const icon = active ? (activeSort.direction === "asc" ? "▲" : "▼") : "↕";
  return (
    <th style={tableHeadCell}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Sort by ${label}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: "none",
          background: "transparent",
          color: active ? "#006c9b" : "#64748b",
          cursor: "pointer",
          padding: 0,
          font: "inherit",
          textTransform: "inherit",
          letterSpacing: "inherit",
        }}
      >
        <span>{label}</span>
        <span aria-hidden="true" style={{ fontSize: 10, lineHeight: 1 }}>{icon}</span>
      </button>
    </th>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("T")[0].split("-");
  return `${day}/${m}/${y.slice(2)}`;
}

function formatMoney(n) {
  if (n == null || n === "" || isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Number(n));
}

function dueDateClass(d) {
  if (!d) return "text-muted";
  const today = new Date().toISOString().split("T")[0];
  const ds = d.split("T")[0];
  if (ds < today) return "text-red-600 font-semibold";
  if (ds === today) return "text-amber-600 font-semibold";
  return "text-muted";
}

function KindBadge({ kind }) {
  if (kind === "lead") {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
        Lead
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
      Contact
    </span>
  );
}

/** Small advisory badge for fit_quality — display only, never auto-set. */
const FIT_COLORS = {
  strong:        "bg-emerald-50 text-emerald-700",
  possible:      "bg-blue-50 text-blue-700",
  nurture:       "bg-amber-50 text-amber-700",
  poor:          "bg-red-50 text-red-700",
  price_shopper: "bg-orange-50 text-orange-700",
};

function FitBadge({ value }) {
  if (!value) return <span className="text-muted text-xs">—</span>;
  const label = LEAD_FIT_QUALITY_LABELS[value] || value;
  const cls = FIT_COLORS[value] || "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function sheetSortValue(person, key) {
  switch (key) {
    case "name":        return (person.name || "").toLowerCase();
    case "type":        return person.type || "";
    case "source":      return person.source || "";
    case "suburb":      return person.suburb || "";
    case "projectType": return person.projectType || "";
    case "budget":      return person.budget == null || person.budget === "" ? -Infinity : Number(person.budget);
    case "fit":         return person.fit || "";
    case "readiness":   return person.readiness || "";
    case "nextStep":    return person.nextStep || "";
    case "dueDate":     return person.dueDate || "";
    case "owner":       return person.owner || "";
    case "status":      return person.status || "";
    case "lastContact": return person.lastContact || "";
    default:            return "";
  }
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg">
      {message}
    </div>
  );
}

// ─── Promote button ───────────────────────────────────────────────────────────

function PromoteButton({ personId, onPromoted }) {
  const [busy, setBusy] = useState(false);

  async function handlePromote(e) {
    e.stopPropagation(); // don't open the row
    setBusy(true);
    const { ok, error } = await apiPatch(`/api/sales/leads/${personId}`, {
      stage: LEAD_STAGES.QUALIFY,
    });
    setBusy(false);
    if (ok) {
      onPromoted(personId);
    } else {
      // surface error briefly via alert (no dedicated toast in scope for errors)
      alert(error || "Failed to promote lead");
    }
  }

  return (
    <button
      type="button"
      onClick={handlePromote}
      disabled={busy}
      title="Promote this lead to the Sales Pipeline"
      className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/5 px-2 py-0.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50 transition"
    >
      {busy ? "…" : "→ Pipeline"}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CrmPeople() {
  const navigate = useNavigate();

  const [people, setPeople] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [sheetSort, setSheetSort] = useState({ key: "name", direction: "asc" });

  // Contact drawer — for kind==='contact' rows
  const [drawerContactId, setDrawerContactId] = useState(null);

  // Toast on promote
  const [toast, setToast] = useState(null);

  // Debounce search
  const debounceRef = useRef(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (view) params.set("view", view);
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("limit", "150");
    params.set("offset", "0");

    const { ok, data } = await apiFetch(`/api/crm/people?${params.toString()}`);
    if (ok) {
      setPeople(data.people || []);
      setTotal(data.total ?? (data.people?.length ?? 0));
    }
    setLoading(false);
  }, [view, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  function toggleSheetSort(key) {
    setSheetSort(prev =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  }

  const sorted = [...people].sort((a, b) => {
    const av = sheetSortValue(a, sheetSort.key);
    const bv = sheetSortValue(b, sheetSort.key);
    const dir = sheetSort.direction === "asc" ? 1 : -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  function handleRowClick(person) {
    if (person.kind === "lead") {
      navigate(`/sales/${person.personId}`);
    } else {
      setDrawerContactId(person.personId);
    }
  }

  function handlePromoted(personId) {
    // Remove from list (it's now in the pipeline) and show toast
    setPeople(prev => prev.filter(p => p.personId !== personId));
    setTotal(prev => Math.max(0, prev - 1));
    setToast("Lead promoted to Pipeline");
  }

  const COLS = [
    { key: "name",        label: "Name" },
    { key: "type",        label: "Type" },
    { key: "source",      label: "Source" },
    { key: "suburb",      label: "Suburb" },
    { key: "projectType", label: "Project type" },
    { key: "budget",      label: "Budget" },
    { key: "fit",         label: "Fit" },
    { key: "readiness",   label: "Readiness" },
    { key: "nextStep",    label: "Next step" },
    { key: "dueDate",     label: "Due date" },
    { key: "owner",       label: "Owner" },
    { key: "status",      label: "Status" },
  ];

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-3">
        <input
          type="search"
          placeholder="Search people…"
          className="input flex-1 max-w-sm"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {total > 0 && (
          <span className="text-xs text-muted">
            {people.length === total ? `${total} people` : `${people.length} of ${total}`}
          </span>
        )}
      </div>

      {/* Saved-view chips */}
      <div className="flex gap-1.5 flex-wrap">
        {VIEWS.map(v => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
              view === v.id
                ? "bg-primary text-white"
                : "bg-page text-muted hover:bg-hairline"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="py-16 text-center text-muted text-sm">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="py-16 text-center text-muted text-sm">
            No people found
            {(search || view) ? " — try clearing the search or view filter." : "."}
          </div>
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="md:hidden divide-y divide-hairline">
              {sorted.map(person => (
                <button
                  key={`${person.kind}-${person.personId}`}
                  type="button"
                  onClick={() => handleRowClick(person)}
                  className="w-full text-left px-4 py-3 hover:bg-page transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-ink truncate">{person.name || "—"}</div>
                      <div className="text-xs text-muted mt-0.5">{person.type || "—"} · {person.suburb || "—"}</div>
                    </div>
                    <KindBadge kind={person.kind} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                    {person.status && <span>{person.status}</span>}
                    {person.nextStep && <span>Next: {person.nextStep}</span>}
                    {person.dueDate && (
                      <span className={dueDateClass(person.dueDate)}>Due {formatDate(person.dueDate)}</span>
                    )}
                  </div>
                  {person.kind === "lead" && person.status === LEAD_STAGES.ENQUIRY && (
                    <div className="mt-2" onClick={e => e.stopPropagation()}>
                      <PromoteButton personId={person.personId} onPromoted={handlePromoted} />
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {COLS.map(col => (
                      <SortableTableHead
                        key={col.key}
                        label={col.label}
                        sortKey={col.key}
                        activeSort={sheetSort}
                        onSort={toggleSheetSort}
                      />
                    ))}
                    {/* Non-sortable action column */}
                    <th style={tableHeadCell} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {sorted.map(person => (
                    <tr
                      key={`${person.kind}-${person.personId}`}
                      onClick={() => handleRowClick(person)}
                      className="hover:bg-page cursor-pointer transition-colors"
                    >
                      {/* Name + kind badge */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="min-w-0">
                            <div className="font-medium text-ink">{person.name || "—"}</div>
                          </div>
                          <KindBadge kind={person.kind} />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted">{person.type || "—"}</td>
                      <td className="px-3 py-2.5 text-muted">{person.source || "—"}</td>
                      <td className="px-3 py-2.5 text-muted">{person.suburb || "—"}</td>
                      <td className="px-3 py-2.5 text-muted">{person.projectType || "—"}</td>
                      <td className="px-3 py-2.5 text-muted">{formatMoney(person.budget)}</td>
                      <td className="px-3 py-2.5">
                        <FitBadge value={person.fit} />
                      </td>
                      <td className="px-3 py-2.5 text-muted text-xs">
                        {person.readiness ? (LEAD_READINESS_LABELS[person.readiness] || person.readiness) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-ink max-w-[180px]">
                        <div className="truncate">{person.nextStep || "—"}</div>
                      </td>
                      <td className={`px-3 py-2.5 text-xs ${dueDateClass(person.dueDate)}`}>
                        {formatDate(person.dueDate)}
                      </td>
                      <td className="px-3 py-2.5 text-muted text-xs">{person.owner || "—"}</td>
                      <td className="px-3 py-2.5 text-muted text-xs">{person.status || "—"}</td>
                      {/* Promote action — only for enquiry-stage leads */}
                      <td
                        className="px-3 py-2.5 text-right whitespace-nowrap"
                        onClick={e => e.stopPropagation()}
                      >
                        {person.kind === "lead" && person.status === LEAD_STAGES.ENQUIRY && (
                          <PromoteButton personId={person.personId} onPromoted={handlePromoted} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {total > sorted.length && (
              <div className="px-4 py-2.5 border-t border-hairline text-xs text-muted">
                Showing {sorted.length} of {total} — refine your search to narrow results
              </div>
            )}
          </>
        )}
      </div>

      {/* Contact drawer */}
      {drawerContactId && (
        <ContactDrawer
          contactId={drawerContactId}
          onClose={() => setDrawerContactId(null)}
          onSaved={() => { setDrawerContactId(null); load(); }}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
