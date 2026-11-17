/**
 * DesignTeamCard — "Design team" on the Project step (REGISTER_SCREENS_SPEC.md S1, R5; owner decision 6).
 *
 * The architect, engineer, energy assessor and any other consultant, each kept in one place: the crm_contacts row linked
 * to this lead (and its job) through job_contact_roles, with the lead's consultant roster kept in step — written only by
 * POST /api/sales/leads/:id/design-team. Picking a person saves at once; the Documents step's recipient and the brief's
 * "Prepared for" read the same list (briefModel.designTeam / namedArchitect) once the context reloads.
 *
 * NameArchitectPanel is the "Name the architect" sheet on its own, also mounted by the Documents step's edit drawer.
 * Phone (390 pt): only the Architect row shows, plus "Engineer, energy assessor and others ›".
 */
import { useEffect, useRef, useState } from "react";
import { apiDelete, apiFetch, apiPost } from "../../../../lib/apiFetch.js";
import { designTeam } from "../../../../lib/briefModel.js";
import { DESIGN_TEAM_ROLES, OTHER_CONSULTANT_ROLES, contactLabel, teamRows } from "../../../../lib/projectStory.js";

const PANEL_TITLE = { architect: "Name the architect", designer: "Name the architect", engineer: "Name the engineer", energy: "Name the energy assessor" };
const input = "inp h-11 w-full px-3 text-[16px] sm:text-[15px]";
const plus = <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;

/**
 * Search people and firms, or "+ Add someone new"; picking saves straight away.
 *   role      the design-team role being named (architect, engineer, energy, land_surveyor, …)
 *   replaces  { roleId, contactId } of the person this one takes over from ("Change"); they come off the job
 *   onSaved   called with the updated design team (the context's consultants list) after a save
 */
export function NameArchitectPanel({ lead, context, onSaved, role = "architect", replaces = null, onCancel }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);       // null: not searched yet
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const seq = useRef(0);
  const onJob = new Set(designTeam(context).filter((c) => c.role === role || (role === "architect" && ["designer", "interior_designer"].includes(c.role))).map((c) => c.contactId).filter(Boolean));

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { seq.current++; setResults(null); setSearching(false); return undefined; }
    const n = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await apiFetch(`/api/sales/contacts/search?q=${encodeURIComponent(term)}`);
      if (n !== seq.current) return;                  // a later search has started
      setSearching(false);
      if (r.ok) setResults(r.data.contacts || []); else { setResults([]); setError(r.error); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function save(body) {
    setBusy(true); setError(null);
    const r = await apiPost(`/api/sales/leads/${lead.id}/design-team`, { role, ...(replaces ? { replaces } : {}), ...body });
    setBusy(false);
    if (!r.ok) { setError(r.error || "Not saved — try again."); return; }
    onSaved?.(r.data.consultants || []);
  }
  function startAdding() {
    setAdding(true);
    setForm((f) => ({ ...f, name: f.name || (/@|\d/.test(q) ? "" : q.trim()) }));
  }

  return (
    <div className="space-y-3" data-testid="name-architect-panel">
      <h3 className="text-base font-semibold text-ink">{PANEL_TITLE[role] || "Add a consultant"}</h3>
      {!adding && (
        <>
          <label className="block">
            <span className="sr-only">Search people and firms</span>
            <input type="search" value={q} autoFocus onChange={(e) => { setQ(e.target.value); setError(null); }} placeholder="Search people and firms"
              className={input} data-testid="design-team-search" />
          </label>
          <div className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline">
            {searching && <p className="px-3 py-3 text-[13px] text-muted">Searching…</p>}
            {!searching && results?.length === 0 && <p className="px-3 py-3 text-[13px] text-muted">No one found by that name.</p>}
            {!searching && (results || []).map((c) => {
              const here = onJob.has(c.id);
              return (
                <button key={c.id} type="button" disabled={busy || here} onClick={() => save({ contactId: c.id })}
                  className="focus-ring flex min-h-[56px] w-full items-center gap-2 px-3 text-left hover:bg-page disabled:cursor-default disabled:opacity-60">
                  <span className="min-w-0 flex-1 truncate text-[15px] text-ink">
                    {[c.name, c.company && c.company !== c.name ? c.company : null, c.typeLabel].filter(Boolean).join(" · ")}
                  </span>
                  {here && <span className="shrink-0 text-[12px] text-muted">On this job</span>}
                </button>
              );
            })}
            <button type="button" onClick={startAdding} disabled={busy}
              className="focus-ring flex min-h-[56px] w-full items-center gap-1.5 px-3 text-left text-[15px] font-bold text-primary hover:bg-page">
              {plus}Add someone new
            </button>
          </div>
        </>
      )}
      {adding && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) save({ name: form.name.trim(), company: form.company.trim(), email: form.email.trim(), phone: form.phone.trim() }); }}>
          {[["name", "Name", "text", "name"], ["company", "Firm", "text", "organization"], ["email", "Email", "email", "email"], ["phone", "Phone", "tel", "tel"]].map(([k, l, type, ac]) => (
            <label key={k} className="block">
              <span className="mb-1 block text-[13px] text-muted">{l}{k === "name" ? " (required)" : ""}</span>
              <input type={type} autoComplete={ac} value={form[k]} required={k === "name"} autoFocus={k === "name"}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} className={input} />
            </label>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <button type="submit" disabled={busy || !form.name.trim()} className="min-h-[44px] rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40">Save</button>
            <button type="button" onClick={() => setAdding(false)} className="min-h-[44px] px-3 text-sm text-muted hover:text-ink">Back to search</button>
          </div>
        </form>
      )}
      {busy && <p className="text-[13px] text-muted">Saving…</p>}
      {error && <p className="text-[13px] text-red-600" role="alert">{error}</p>}
      <p className="text-[12px] text-muted">Saved to the client&apos;s contacts — Sales shows the same.</p>
      {onCancel && <button type="button" onClick={onCancel} className="min-h-[44px] text-sm text-muted hover:text-ink">Cancel</button>}
    </div>
  );
}

/** A bottom sheet on a phone, a centred panel on a tablet or desktop. Escape or the backdrop closes it. */
function Sheet({ onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Design team">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-black/30" />
      <div className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-2xl sm:max-w-[480px] sm:rounded-card">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-hairline sm:hidden" aria-hidden="true" />
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-lg text-xl text-muted hover:bg-page hover:text-ink">×</button>
        {children}
      </div>
    </div>
  );
}

/** ⋯ on a named person: Change · Remove from this job. */
function RowMenu({ label, onChange, onRemove }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex-none">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Options for ${label}`} onClick={() => setOpen((o) => !o)}
        className="focus-ring flex h-11 w-11 items-center justify-center rounded-lg text-lg font-bold text-muted hover:bg-page hover:text-ink">⋯</button>
      {open && (
        <>
          <button type="button" aria-label="Close menu" tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 z-10 cursor-default" />
          <div role="menu" className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-hairline bg-surface shadow-lg">
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onChange(); }} className="block min-h-[44px] w-full px-3 text-left text-sm text-ink hover:bg-page">Change</button>
            {onRemove && <button type="button" role="menuitem" onClick={() => { setOpen(false); onRemove(); }} className="block min-h-[44px] w-full px-3 text-left text-sm text-red-600 hover:bg-page">Remove from this job</button>}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * children: optional lines under the rows (the Project step puts the muted "Noted earlier" design-coordination note here).
 */
export default function DesignTeamCard({ lead, context, reloadContext, readOnly = false, children }) {
  const [panel, setPanel] = useState(null);          // { role, replaces?, pickRole? }
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const rows = teamRows(context);

  async function remove(c) {
    const name = contactLabel(c) || "this person";
    if (!window.confirm(`Remove ${name} from this job? They stay in the client's contacts.`)) return;
    setBusy(true); setError(null);
    const role = c.rosterRole || c.role;
    const r = await apiDelete(`/api/sales/leads/${lead.id}/design-team/${c.roleId || "roster"}?contactId=${encodeURIComponent(c.contactId || "")}&role=${encodeURIComponent(role || "")}`);
    setBusy(false);
    if (!r.ok) { setError(r.error || "Not removed — try again."); return; }
    reloadContext?.();
  }
  const saved = () => { setPanel(null); setError(null); reloadContext?.(); };

  const row = ({ key, label, person, role, empty, gapStyle, hiddenOnPhone }) => (
    <div key={key} className={`${hiddenOnPhone && !showAll ? "hidden sm:flex" : "flex"} min-h-[56px] items-center gap-3 border-t border-hairline py-1.5`} data-testid={`design-team-${key}`}>
      <span className="w-[110px] flex-none text-[13px] text-muted sm:w-[150px]">{label}</span>
      {person ? (
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{contactLabel(person)}</span>
      ) : (
        <span className={`min-w-0 flex-1 text-sm ${gapStyle ? "font-bold text-amber-800" : "text-muted"}`}>Not named</span>
      )}
      {!readOnly && person && (
        <RowMenu label={contactLabel(person)} onChange={() => setPanel({ role: role === "architect" ? "architect" : person.role, replaces: { roleId: person.roleId || null, contactId: person.contactId || null } })}
          onRemove={person.roleId || person.contactId ? () => remove(person) : null} />
      )}
      {!readOnly && !person && empty}
    </div>
  );

  return (
    <section aria-labelledby="design-team-title" className="flex flex-col rounded-card border border-hairline bg-surface p-4" data-testid="design-team-card">
      <h2 id="design-team-title" className="mb-2 text-base font-semibold text-ink">Design team</h2>
      {row({
        key: "architect", label: "Architect", person: rows.architect, role: "architect", gapStyle: true,
        empty: (
          <button type="button" data-focus-key="architect" disabled={busy} onClick={() => setPanel({ role: "architect" })}
            className="focus-ring min-h-[44px] flex-none rounded-lg border border-primary bg-surface px-3.5 text-sm font-bold text-primary hover:bg-primary/5">Name the architect</button>
        ),
      })}
      {row({
        key: "engineer", label: "Engineer", person: rows.engineer, role: "engineer", hiddenOnPhone: true,
        empty: <button type="button" aria-label="Add an engineer" onClick={() => setPanel({ role: "engineer" })} className="focus-ring inline-flex min-h-[44px] flex-none items-center gap-1.5 px-2 text-sm font-bold text-primary">{plus}Add</button>,
      })}
      {row({
        key: "energy", label: "Energy assessor", person: rows.energy, role: "energy", hiddenOnPhone: true,
        empty: <button type="button" aria-label="Add an energy assessor" onClick={() => setPanel({ role: "energy" })} className="focus-ring inline-flex min-h-[44px] flex-none items-center gap-1.5 px-2 text-sm font-bold text-primary">{plus}Add</button>,
      })}
      {rows.others.map((c, i) => row({ key: `other-${c.roleId || c.contactId || i}`, label: DESIGN_TEAM_ROLES[c.role] || "Consultant", person: c, role: c.role, hiddenOnPhone: true }))}
      {!readOnly && (
        <div className={`${showAll ? "flex" : "hidden sm:flex"} min-h-[56px] items-center border-y border-hairline`}>
          <button type="button" onClick={() => setPanel({ role: null, pickRole: true })} className="focus-ring inline-flex min-h-[44px] items-center gap-1.5 text-sm font-bold text-primary">{plus}Another consultant</button>
        </div>
      )}
      {!showAll && (
        <button type="button" onClick={() => setShowAll(true)} className="focus-ring flex min-h-[44px] items-center gap-1 border-t border-hairline text-left text-sm font-bold text-primary sm:hidden">
          Engineer, energy assessor and others <span aria-hidden="true">›</span>
        </button>
      )}
      {error && <p className="mt-2 text-[13px] text-red-600" role="alert">{error}</p>}
      {children}
      <p className="mt-1.5 text-[12px] leading-[17px] text-muted">The architect&apos;s brief is addressed to the architect. Until one is named it says “The design team”.</p>

      {panel && (
        <Sheet onClose={() => setPanel(null)}>
          {panel.pickRole && !panel.role ? (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-ink">Add a consultant</h3>
              <p className="text-[13px] text-muted">What do they do?</p>
              <div className="flex flex-wrap gap-2">
                {OTHER_CONSULTANT_ROLES.map((r) => (
                  <button key={r} type="button" onClick={() => setPanel({ role: r })} className="focus-ring min-h-[44px] rounded-full border border-hairline px-3.5 text-sm text-ink hover:bg-page">{DESIGN_TEAM_ROLES[r]}</button>
                ))}
              </div>
            </div>
          ) : (
            <NameArchitectPanel lead={lead} context={context} role={panel.role} replaces={panel.replaces || null} onSaved={saved} />
          )}
        </Sheet>
      )}
    </section>
  );
}
