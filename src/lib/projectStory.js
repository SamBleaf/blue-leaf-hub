/**
 * projectStory.js — the rules behind the register's "The project" step (docs/documents/REGISTER_SCREENS_SPEC.md S1).
 *
 *   budget     band chips (one tap writes both figures, ex GST), the exact range, "Confirmed with the client"
 *   timing     target start as month + year (stored as YYYY-MM-01)
 *   priorities ticking the Top priorities chips from words noted earlier
 *   gaps       what the architect's brief is still missing, from the same content checks the Documents step uses
 *   site       the public-mapping rows, in plain words (a missing bushfire value is "Not confirmed", never "No")
 *   team       the design team: job_contact_roles and the lead's consultant_roster merged into one list
 *   lead PATCH the server-side check of the story and budget columns (and the budget pair when one figure is sent)
 *   contacts   "+ Add someone new": an email links a contact only when the names match; a second save reuses the person
 *
 * Read by the browser (ProjectStep, StoryFields, DesignTeamCard) and by the server (registerContext.mjs, salesRoutes.mjs).
 * Pure: no React, no network. The story lives on the lead only (Canonical Data Law): nothing here stores a copy.
 */
import { BUDGET_BANDS, clean, designTeam, namedArchitect } from "./briefModel.js";
import { contentChecks } from "./registerQuality.js";
import { LEAD_FINANCE_STATUS_LABELS, CONSULTANT_DELIVERABLES } from "./constants.js";

const has = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
const amount = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) || Number(v) <= 0 ? null : Number(v));
const capFirst = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/** The lead columns each story field writes (snake_case, as PATCH /api/sales/leads/:id takes them). */
export const STORY_COLUMNS = {
  vision: "wo_client_vision",
  must_haves: "key_requirements",
  concern: "wo_biggest_concern",
  excited: "wo_most_excited_about",
  confirmed: "wo_budget_confirmed",
  paying: "finance_status",
  start: "desired_start_date",
};

/** StoryFields' fields, in screen order ("priorities" is drawn by the caller). The "Budget and timing" group is BUDGET_FIELD_KEYS. */
export const BUDGET_FIELD_KEYS = ["budget", "confirmed", "paying", "start"];
export const STORY_FIELD_KEYS = ["vision", "must_haves", "concern", "priorities", ...BUDGET_FIELD_KEYS, "excited"];
/** On a phone these sit behind "More about the client (4) ▸" (spec S1 phone rules). */
export const PHONE_MORE_KEYS = ["concern", "priorities", "confirmed", "paying", "excited"];

/** The event a register screen sends to open the lead's own details in Sales (LeadDetail listens). detail: "details" | "files". */
export const SHOW_IN_SALES = "lead:show-in-sales";

// ── Budget ─────────────────────────────────────────────────────────────────────────────────────────

/** The band a stored range is exactly, or null. Zero counts as no figure, as in budgetWords. */
export function bandOf(min, max) {
  const lo = amount(min), hi = amount(max);
  if (lo == null && hi == null) return null;
  return BUDGET_BANDS.find((b) => (b.min ?? null) === lo && (b.max ?? null) === hi) || null;
}

export const moneyText = (n) => (amount(n) == null ? "" : `$${Math.round(Number(n)).toLocaleString("en-AU")}`);

/** "Exact: $850,000 – $950,000", "Exact: from $850,000", "Exact: up to $950,000". */
export function exactLabel(min, max) {
  const lo = moneyText(min), hi = moneyText(max);
  if (lo && hi) return `Exact: ${lo} – ${hi}`;
  if (lo) return `Exact: from ${lo}`;
  if (hi) return `Exact: up to ${hi}`;
  return "";
}

/** What the budget chips show for a stored range: nothing, one band, or a selected "Exact: …" chip. */
export function budgetChoice(min, max) {
  if (amount(min) == null && amount(max) == null) return { kind: "none", key: null, label: "" };
  const band = bandOf(min, max);
  return band ? { kind: "band", key: band.key, label: band.label } : { kind: "exact", key: "exact", label: exactLabel(min, max) };
}

/** One tap on a band chip writes both figures; a second tap on the chosen band clears both. */
export function bandPatch(bandKey, min, max) {
  const band = BUDGET_BANDS.find((b) => b.key === bandKey);
  if (!band) return null;
  if (bandOf(min, max)?.key === band.key) return { construction_budget_min: null, construction_budget_max: null };
  return { construction_budget_min: band.min ?? null, construction_budget_max: band.max ?? null };
}

/** "850,000", "$850k", "1.2m" → a whole number of dollars. Blank is no figure. */
export function parseMoney(text) {
  const t = String(text ?? "").trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!t) return { value: null };
  const m = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(t);
  if (!m) return { error: "Type an amount, like 850,000 or 850k." };
  const n = Number(m[1]) * (m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1);
  return { value: n > 0 ? Math.round(n) : null };
}

/** The From and To boxes → the two lead columns, or a plain-English error. Either may be blank. */
export function exactPatch(fromText, toText) {
  const a = parseMoney(fromText), b = parseMoney(toText);
  if (a.error || b.error) return { error: a.error || b.error };
  if (a.value != null && b.value != null && a.value > b.value) return { error: "The From amount is more than the To amount." };
  return { patch: { construction_budget_min: a.value, construction_budget_max: b.value } };
}

// wo_budget_confirmed is free text in Sales. Only a plain yes counts ("Yes", "Yes - approved finance", "Confirmed with the
// client"): anything else ("Pending bank approval", "Awaiting finance", "Maybe") reads as not confirmed, so the band never
// prints on a hopeful note (owner decision 1). The words are never rewritten: they show under the toggle.
const CONFIRMED_RX = /^(yes|y|true|confirmed)\b/i;
const PLAIN_YES_RX = /^(yes|y|true|confirmed|confirmed with the client)\.?$/i;
/** The word the toggle writes. Sales shows it as "Budget confirmed: Yes". */
export const BUDGET_CONFIRMED_TEXT = "Yes";
/** Does the stored text mean the client confirmed the budget? Only boolean true or text that starts with a plain yes. */
export function budgetConfirmedOn(text) {
  if (typeof text === "boolean") return text;
  const t = clean(text);
  return !!t && CONFIRMED_RX.test(t);
}
/** Words typed in Sales beyond a plain yes, shown under the toggle so nothing is hidden ("" for none). */
export function confirmedNoteOf(text) {
  const t = typeof text === "string" ? clean(text) : "";
  return t && !PLAIN_YES_RX.test(t) ? t : "";
}

// ── Timing ─────────────────────────────────────────────────────────────────────────────────────────

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "2027-04-01" → { year: 2027, month: 4 }. */
export function startParts(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(String(iso || ""));
  return m ? { year: Number(m[1]), month: Number(m[2]) } : { year: null, month: null };
}
/** Month 1–12 and a year → "YYYY-MM-01", or null until both are chosen. */
export function startValue(month, year) {
  const mo = Number(month), y = Number(year);
  return Number.isInteger(mo) && mo >= 1 && mo <= 12 && Number.isInteger(y) && y >= 2000 && y <= 2100 ? `${y}-${String(mo).padStart(2, "0")}-01` : null;
}
/** The years offered: this year and the next four, plus a stored year outside that range. */
export function startYears(now = new Date(), stored = null) {
  const y0 = now.getFullYear();
  const years = [0, 1, 2, 3, 4].map((k) => y0 + k);
  if (Number.isInteger(stored) && !years.includes(stored)) years.push(stored);
  return years.sort((a, b) => a - b);
}

// ── Top priorities ─────────────────────────────────────────────────────────────────────────────────

const norm = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/**
 * "Use these": the chips the earlier words name, and the words left over.
 *   add   option ids to tick (never more than the question allows; already-ticked ones aren't repeated)
 *   rest  the earlier words with every ticked one taken out, otherwise exactly as typed
 * Only commas, semicolons and new lines separate the words: "Indoor/outdoor flow and room for the grandkids" is one
 * phrase, never split on "/" or "and" and rejoined with commas. A phrase that matches no chip, or doesn't fit, stays.
 */
export function prioritiesFromNote(text, options = [], selectedIds = [], max = 3) {
  const pieces = String(text || "").split(/([,;\n])/);                     // [phrase, sep, phrase, sep, …]
  const chosen = new Set(selectedIds);
  const add = [], kept = [];
  for (let k = 0; k < pieces.length; k += 2) {
    const phrase = pieces[k], sep = pieces[k + 1] || "";
    if (!clean(phrase)) continue;                                            // an empty piece carries no words
    const o = options.find((x) => norm(x.label) === norm(phrase) || norm(x.id) === norm(phrase));
    if (o && chosen.has(o.id)) continue;                                     // already ticked: the words go
    if (o && !add.includes(o.id) && chosen.size + add.length < max) { add.push(o.id); continue; }
    if (o && add.includes(o.id)) continue;
    kept.push({ phrase, sep });
  }
  // The kept phrases as typed, each followed by the separator that followed it (none after the last).
  const rest = kept.map((p, i) => (i < kept.length - 1 ? p.phrase + (p.sep || ",") : p.phrase)).join("").trim();
  return { add, rest };
}

// ── Gaps for the architect's brief ─────────────────────────────────────────────────────────────────

export const GAP_WORDS = { vision: "the client's vision", must_haves: "must-haves", budget: "budget", architect: "the architect's name", planRev: "the drawing set" };
/**
 * What the architect's brief is still missing, in the order the strip reads. The story and architect gaps come from the
 * same content checks as the Documents step (registerQuality.contentChecks), so the two never disagree; the drawing set is
 * the release blocker the Drawings card fixes.
 */
export function projectGaps(register, context) {
  if (!context) return [];
  const keys = new Set(contentChecks("architect_brief", register, context).map((c) => c.key));
  const g = context.goals || {}, b = context.budget || {};
  const out = [];
  if (keys.has("story")) {
    if (!clean(g.vision)) out.push("vision");
    if (!clean(g.keyRequirements)) out.push("must_haves");
    if (!(amount(b.min) || amount(b.max))) out.push("budget");
  }
  if (keys.has("architect")) out.push("architect");
  if (!clean(register?.meta?.planRev)) out.push("planRev");
  return out.map((key) => ({ key, label: GAP_WORDS[key] }));
}

// ── Site and planning ──────────────────────────────────────────────────────────────────────────────

const titleCase = (t) => clean(t).toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Of|And|The)\b/g, (w, _x, k) => (k ? w.toLowerCase() : w));
const words = (t) => capFirst(clean(t).replace(/_/g, " ").toLowerCase());
/**
 * The read-only rows of "Site and planning". Values come from public mapping: display only, never edited here.
 * Each row: { key, label, text, muted?, chip? }.
 */
export function siteRows(site = {}, accessWords = "") {
  const s = site || {};
  const detail = clean(s.bushfireDetail);
  const bushfire = s.bushfire === true
    ? { key: "bushfire", label: "Bushfire", chip: "In a mapped bushfire area", text: "BAL to be assessed", detail: detail && !/unverified|unknown/i.test(detail) ? detail : "" }
    : s.bushfire === false ? { key: "bushfire", label: "Bushfire", text: "Not in a mapped bushfire area" }
      : { key: "bushfire", label: "Bushfire", text: "Not confirmed", muted: true };
  const row = (key, label, value) => (clean(value) ? { key, label, text: value } : { key, label, text: "Not known", muted: true });
  return [
    row("council", "Council", clean(s.council) ? titleCase(s.council) : ""),
    row("zone", "Planning zone", clean(s.zone)),
    bushfire,
    row("slope", "Slope", clean(s.slopeBand) ? words(s.slopeBand) : ""),
    row("complexity", "Site complexity", clean(s.complexity) ? words(s.complexity) : ""),
    clean(accessWords) ? { key: "access", label: "Access", text: clean(accessWords), link: true } : { key: "access", label: "Access", text: "Not recorded", muted: true },
  ];
}
/** The phone's one-line summary: "City of Marion · Hills Neighbourhood · Bushfire area · High complexity". */
export function siteSummary(site = {}) {
  const s = site || {};
  if (!clean(s.council) && !clean(s.zone) && !clean(s.complexity) && s.bushfire == null) return "Nothing from public mapping yet";
  return [clean(s.council) ? titleCase(s.council) : "", clean(s.zone),
    s.bushfire === true ? "Bushfire area" : s.bushfire == null ? "Bushfire not confirmed" : "",
    clean(s.complexity) ? `${words(s.complexity)} complexity` : ""].filter(Boolean).join(" · ") || "Nothing from public mapping yet";
}

// ── The design team ────────────────────────────────────────────────────────────────────────────────

/** Roles the design-team card names, with their on-screen words. */
export const DESIGN_TEAM_ROLES = {
  architect: "Architect", designer: "Designer", interior_designer: "Interior designer", engineer: "Engineer", energy: "Energy assessor",
  land_surveyor: "Land surveyor", soil_geotech: "Soil and geotech", lighting: "Lighting", sanitary: "Sanitary and tapware",
  consultant: "Consultant", other: "Other consultant",
};
/** The roles "+ Another consultant" offers (the architect, engineer and energy assessor have their own rows). */
export const OTHER_CONSULTANT_ROLES = ["land_surveyor", "soil_geotech", "interior_designer", "lighting", "sanitary", "other"];
// job_contact_roles.role allows only these (mig 184); every other discipline is stored as "consultant", and the specific
// discipline is kept in the consultant_roster entry.
const DB_ROLES = new Set(["architect", "designer", "interior_designer", "engineer", "other"]);
const ROSTER_ROLE = { designer: "architect", consultant: "other" };   // CONSULTANT_ROLES has no "designer" or "consultant"
const GROUP = { architect: "design", designer: "design", interior_designer: "interior", engineer: "engineer" };
const groupOf = (role) => GROUP[role] || "consultant";
const SPECIFIC = new Set(["energy", "land_surveyor", "soil_geotech", "lighting", "sanitary"]);
const CONTACT_TYPE = { architect: "architect", designer: "designer", interior_designer: "interior_designer", engineer: "engineer" };
const dbRoleOf = (role) => (DB_ROLES.has(role) || role === "consultant" ? role : "consultant");

/**
 * Do two role names (a job_contact_roles role, a roster role or a card role) name the same discipline? The architect and
 * designer are one discipline; a stored "consultant" stands for any discipline stored as it (energy, land surveyor, …),
 * but two specific disciplines (energy, land surveyor) are never the same.
 */
export function sameDiscipline(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const g = groupOf(a);
  if (g !== groupOf(b)) return false;
  if (g !== "consultant") return true;
  return (a === "consultant" && dbRoleOf(b) === "consultant") || (b === "consultant" && dbRoleOf(a) === "consultant");
}

/** A design-team role → { dbRole, rosterRole, contactType }, or null for a role the card doesn't take. */
export function storageRolesFor(role) {
  if (!has(DESIGN_TEAM_ROLES, role)) return null;
  return { dbRole: dbRoleOf(role), rosterRole: ROSTER_ROLE[role] || role, contactType: CONTACT_TYPE[role] || "other" };
}

const personName = (c) => clean([c?.first_name, c?.last_name].filter(Boolean).join(" "));
const pick = (...vals) => { for (const v of vals) { const s = clean(v); if (s) return s; } return ""; };
const rosterContactId = (e) => e?.contactId || e?.contact_id || null;
const isOn = (status) => !["inactive", "completed"].includes(status);

/**
 * One design-team list from the job_contact_roles rows (with their crm_contacts) and the lead's consultant_roster.
 *   - A roster entry for a person who already has a role row in the same discipline adds only its specific discipline
 *     (an energy assessor stored as "consultant" reads as "energy").
 *   - A second discipline for the same person under one shared "consultant" row (a land surveyor who also does the soil
 *     report) becomes its own entry, with that row's id and the person's details.
 *   - Duplicates (a lead row and a job row for the same person and role) are kept once, the active one winning.
 *   - Inactive and completed entries stay in the list with their status: designTeam() leaves them out of everything shown.
 *   - A roster slot with nobody named in it is not a person, so it isn't listed.
 *   roleRows:     [{ id, role, status, contact_id, contact: { first_name, last_name, company, email, phone } }]
 *   roster:       [{ role, contactId, status?, name?, company? }]
 *   contactsById: { [id]: { first_name, last_name, company, email, phone } } for roster contacts with no role row
 * Returns [{ role, dbRole, roleId, contactId, rosterRole, status, name, company, email, phone, source }].
 */
export function mergeConsultants(roleRows = [], roster = [], contactsById = {}) {
  const out = [];
  for (const r of Array.isArray(roleRows) ? roleRows : []) {
    if (!r || ["referrer", "agent"].includes(r.role)) continue;
    const c = r.contact || {};
    const entry = { role: r.role, dbRole: r.role, roleId: r.id || null, contactId: r.contact_id || null, rosterRole: null, status: r.status || null,
      name: pick(personName(c), c.company), company: clean(c.company) || null, email: clean(c.email) || null, phone: clean(c.phone) || null, source: "role" };
    const dup = out.find((e) => e.contactId && e.contactId === entry.contactId && e.dbRole === entry.dbRole);
    if (dup) { if (!isOn(dup.status) && isOn(entry.status)) Object.assign(dup, entry); continue; }
    out.push(entry);
  }
  for (const e of Array.isArray(roster) ? roster : []) {
    if (!e) continue;
    const cid = rosterContactId(e) || null;
    const rosterRole = e.role || e.type || "other";
    if (cid && out.some((x) => x.contactId === cid && x.rosterRole === rosterRole)) continue;   // the same discipline twice
    const match = cid ? out.find((x) => x.source === "role" && x.contactId === cid && !x.rosterRole && sameDiscipline(x.dbRole, rosterRole)) : null;
    if (match) {
      match.rosterRole = rosterRole;
      if (["consultant", "other"].includes(match.role) && SPECIFIC.has(rosterRole)) match.role = rosterRole;
      continue;
    }
    const shared = cid ? out.find((x) => x.source === "role" && x.contactId === cid && sameDiscipline(x.dbRole, rosterRole)) : null;
    const known = shared || (cid ? out.find((x) => x.contactId === cid) : null);
    const c = (cid && contactsById[cid]) || null;
    const name = pick(personName(c), c?.company, known?.name, e.name, e.company, e.contact_name);
    if (!name) continue;                                                     // an empty slot: nobody named yet
    out.push({ role: rosterRole, dbRole: shared?.dbRole || null, roleId: shared?.roleId || null, contactId: cid, rosterRole,
      status: shared ? shared.status : e.status || null, name,
      company: pick(c?.company, known?.company, e.company) || null, email: pick(c?.email, known?.email, e.email) || null,
      phone: pick(c?.phone, known?.phone, e.phone) || null, source: "roster" });
  }
  return out;
}

const progressed = (e) => (Array.isArray(e.deliverables) ? e.deliverables : []).some((d) => d?.status && d.status !== "pending")
  || !!e.briefIssuedAt || !!e.returnedAt || !!clean(e.notes);
const seedDeliverables = (role) => (CONSULTANT_DELIVERABLES[role] || []).map((d) => ({ key: d.key, status: "pending" }));
const withoutStatus = ({ status: _s, removedAt: _r, contact_id: _c, previousContactId: _p, ...rest }) => rest;

/**
 * Take a person off the roster for one discipline (every discipline when rosterRole is null). An entry with work
 * recorded against it (a deliverable moved on, a brief issued, a note) keeps its place and its documents, with nobody
 * named in it (contactId ""), as the Consultants stage shows an unnamed slot; the person's id is kept as
 * previousContactId. An untouched entry is removed.
 */
export function rosterRemove(roster, { contactId, rosterRole = null }, now = new Date().toISOString()) {
  return (Array.isArray(roster) ? roster : []).flatMap((e) => {
    if (!e || !contactId || rosterContactId(e) !== contactId || (rosterRole && !sameDiscipline(e.role, rosterRole))) return [e];
    return progressed(e) ? [{ ...withoutStatus(e), contactId: "", previousContactId: contactId, removedAt: now }] : [];
  });
}

/**
 * Put a person on the roster for one discipline: bring them back if they are there, take the place of the person they
 * replace (keeping that discipline's documents), fill an empty slot for the discipline, or add a new entry with the
 * discipline's expected documents.
 */
export function rosterAdd(roster, { contactId, rosterRole, replacesContactId = null }, now = new Date().toISOString()) {
  const list = (Array.isArray(roster) ? roster : []).filter(Boolean).map((e) => ({ ...e }));
  const same = (e) => sameDiscipline(e.role, rosterRole);
  const at = list.findIndex((e) => rosterContactId(e) === contactId && same(e));
  if (at >= 0) {
    const e = withoutStatus(list[at]);
    list[at] = { ...e, contactId, ...(!SPECIFIC.has(e.role) && SPECIFIC.has(rosterRole) ? { role: rosterRole } : {}) };
    return replacesContactId && replacesContactId !== contactId ? rosterRemove(list, { contactId: replacesContactId, rosterRole }, now) : list;
  }
  const old = replacesContactId ? list.findIndex((e) => rosterContactId(e) === replacesContactId && same(e)) : -1;
  if (old >= 0) { list[old] = { ...withoutStatus(list[old]), contactId }; return list; }
  const slot = list.findIndex((e) => !rosterContactId(e) && e.role === rosterRole);
  if (slot >= 0) { list[slot] = { ...withoutStatus(list[slot]), contactId }; return list; }
  return [...list, { role: rosterRole, contactId, briefIssuedAt: null, returnedAt: null, notes: "", deliverables: seedDeliverables(rosterRole) }];
}

/**
 * Is a person's job_contact_roles row (role dbRole) still needed by the roster? One "consultant" row can carry several
 * disciplines for the same person, so taking one discipline away mustn't end the row the others rely on.
 */
export function rosterNeedsRole(roster, contactId, dbRole) {
  return !!contactId && (Array.isArray(roster) ? roster : []).some((e) => e && rosterContactId(e) === contactId && isOn(e.status) && sameDiscipline(dbRole, e.role));
}

/** "Jane Smith" → { first_name: "Jane", last_name: "Smith" }. */
export function splitName(name) {
  const parts = clean(name).split(" ").filter(Boolean);
  return { first_name: parts[0] || "", last_name: parts.slice(1).join(" ") || null };
}

/** "<Name> — <Firm>", or just the one that is known. */
export function contactLabel(c) {
  const name = clean(c?.name), firm = clean(c?.company);
  return name && firm && firm !== name ? `${name} — ${firm}` : name || firm;
}

/** The card's rows: the architect, engineer and energy assessor have their own; everyone else follows. */
export function teamRows(context) {
  const team = designTeam(context);
  const architect = namedArchitect(context);
  const engineer = team.find((c) => c.role === "engineer") || null;
  const energy = team.find((c) => c.role === "energy") || null;
  return { architect, engineer, energy, others: team.filter((c) => c !== architect && c !== engineer && c !== energy) };
}

/** crm_contacts.contact_type in plain words, for the search rows ("Name · Firm · role"). */
export const CONTACT_TYPE_WORDS = {
  architect: "Architect", designer: "Designer", interior_designer: "Interior designer", engineer: "Engineer", supplier: "Supplier",
  developer: "Developer", agent: "Agent", referrer: "Referrer", prospect: "Client", past_client: "Past client", other: "Other",
};

/** A search box's words, safe to put in a PostgREST filter (no commas, brackets, quotes or wildcards). At most 4. */
export function searchWords(q) {
  return clean(String(q || "").replace(/[%_,()*\\"'`:;|]/g, " ")).split(" ").filter(Boolean).slice(0, 4);
}
/** Does a crm_contacts row hold every word somewhere in its name, firm or email? */
export function contactMatches(row, words) {
  const hay = clean([row?.first_name, row?.last_name, row?.company, row?.email].filter(Boolean).join(" ")).toLowerCase();
  return words.every((w) => hay.includes(w.toLowerCase()));
}

// ── The lead PATCH (server side) ───────────────────────────────────────────────────────────────────

const TEXT_COLUMNS = ["wo_client_vision", "key_requirements", "wo_biggest_concern", "wo_most_excited_about", "wo_budget_confirmed"];
/**
 * Check and tidy the story and budget columns of a lead PATCH body. Returns { updates } or { error } (plain English).
 * Blank text, a blank "Paying by" and a blank start date are stored as nothing. Amounts are numbers, ex GST.
 */
export function normaliseStoryPatch(body = {}) {
  const out = { ...body };
  if (has(out, "finance_status")) {
    const v = out.finance_status === "" ? null : out.finance_status;
    if (v !== null && !has(LEAD_FINANCE_STATUS_LABELS, v)) {
      return { error: `“Paying by” must be one of: ${Object.values(LEAD_FINANCE_STATUS_LABELS).join(", ")}. Nothing was saved.` };
    }
    out.finance_status = v;
  }
  for (const k of ["construction_budget_min", "construction_budget_max"]) {
    if (!has(out, k)) continue;
    let v = out[k] === "" ? null : out[k];
    if (typeof v === "string" && /^\s*\d+(\.\d+)?\s*$/.test(v)) v = Number(v);              // "800000" from an older form
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) return { error: "The budget must be an amount in dollars, ex GST. Nothing was saved." };
    out[k] = v;
  }
  const lo = out.construction_budget_min, hi = out.construction_budget_max;
  if (typeof lo === "number" && typeof hi === "number" && lo > 0 && hi > 0 && lo > hi) return { error: "The budget's lower figure is more than its upper figure. Nothing was saved." };
  if (has(out, "desired_start_date")) {
    const v = out.desired_start_date;
    if (v == null || v === "") out.desired_start_date = null;
    else if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(v))) return { error: "The target start must be a date. Nothing was saved." };
  }
  for (const k of TEXT_COLUMNS) if (has(out, k) && typeof out[k] === "string" && !out[k].trim()) out[k] = null;
  return { updates: out };
}

/**
 * The budget pair when a PATCH carries only one of the two figures (Sales saves Budget min and Budget max separately):
 * the figure sent against the one stored. Returns a plain-English error, or null when the pair is fine. Run after
 * normaliseStoryPatch (the figures are numbers or null by then). A figure cleared, or no figure stored, is never checked.
 */
export function budgetPairError(updates = {}, stored = {}) {
  const sentMin = has(updates, "construction_budget_min"), sentMax = has(updates, "construction_budget_max");
  if (sentMin === sentMax) return null;                                       // both (normaliseStoryPatch checks them) or neither
  const lo = amount(sentMin ? updates.construction_budget_min : stored?.construction_budget_min);
  const hi = amount(sentMax ? updates.construction_budget_max : stored?.construction_budget_max);
  if (lo == null || hi == null || lo <= hi) return null;
  return sentMin
    ? `The budget's lower figure is more than its upper figure (${moneyText(hi)}). Change the upper figure first. Nothing was saved.`
    : `The budget's upper figure is less than its lower figure (${moneyText(lo)}). Change the lower figure first. Nothing was saved.`;
}

// ── New design-team contacts (server side) ─────────────────────────────────────────────────────────

/** A person's name for comparing: lower case, punctuation and extra spaces gone ("O'Neil,  Ava" → "o neil ava"). */
export const nameKey = (s) => norm(s);
/** The name a crm_contacts row goes by: first + last, else the firm. */
export const contactNameOf = (row) => pick(personName(row), row?.company);

/**
 * A contact that is a practice, not a person: no first or last name, or a "name" that is only its firm split in two
 * (first "Studio", last "X Architects", firm "Studio X Architects", as earlier tenders saved a practice).
 */
export const firmShaped = (row) => !personName(row) || nameKey(personName(row)) === nameKey(row?.company);

/**
 * "+ Add someone new" with an email that a contact already has. The email is matched exactly (any case, archived
 * contacts left out by the caller); it links that contact only when the names match too, so a shared office address
 * (info@studio.com) never links the wrong person or drops the typed name.
 * A practice named with no person (firmOnly) links only a contact that is itself a practice (firmShaped): a person at
 * that firm who shares the office email is not the practice, so nothing is linked ({}) and the caller adds the practice
 * (or links the CRM's one, firmOnlyMatch). Someone at another firm with that email is still a conflict.
 *   rows  crm_contacts rows that may share the email (the caller's query may over-match: the email is re-checked here)
 * Returns { contact } to reuse, { conflict } for someone else with that email, or {} when nobody (to link) has it.
 */
export function emailMatch(rows, { name, email, firmOnly = false }) {
  const want = clean(email).toLowerCase();
  if (!want) return {};
  const same = (Array.isArray(rows) ? rows : []).filter((r) => r && !r.is_archived && clean(r.email).toLowerCase() === want);
  if (!same.length) return {};
  const key = nameKey(name);
  const named = (r) => !!key && (nameKey(personName(r)) === key || nameKey(r.company) === key);
  if (firmOnly) {
    const practice = same.find((r) => named(r) && firmShaped(r));
    if (practice) return { contact: practice };
    return same.some(named) ? {} : { conflict: same[0] };
  }
  const hit = same.find(named);
  return hit ? { contact: hit } : { conflict: same[0] };
}

/** A phone number for comparing: digits only, an Australian +61 written as the leading 0 ("+61 412 345 678" → "0412345678"). */
export const phoneKey = (s) => {
  const d = String(s == null ? "" : s).replace(/\D+/g, "");
  return d.startsWith("61") && d.length === 11 ? `0${d.slice(2)}` : d;
};

/**
 * A typed email and phone agree with a stored contact: each one typed is blank on the contact or the same (email any
 * case, phone by its digits). A firm-only contact is linked only when they agree, so a typed detail is never dropped.
 */
export function detailsAgree(contact, { email, phone } = {}) {
  const mail = clean(email).toLowerCase(), tel = phoneKey(phone);
  const theirMail = clean(contact?.email).toLowerCase(), theirTel = phoneKey(contact?.phone);
  return (!mail || !theirMail || mail === theirMail) && (!tel || !theirTel || tel === theirTel);
}

/**
 * The typed details a linked contact has no value for: { email?, phone? } to write onto it (never one it already has).
 */
export function detailsToFill(contact, { email, phone } = {}) {
  const fill = {};
  if (clean(email) && !clean(contact?.email)) fill.email = clean(email);
  if (clean(phone) && !clean(contact?.phone)) fill.phone = clean(phone);
  return fill;
}

/**
 * "+ Add someone new" with no email: the person already on this lead or job (a second Save, a double tap, or a retry
 * after a save whose answer was lost), so the save reuses them instead of adding a duplicate contact and role. The same
 * name is not enough: the role row must be in the same discipline (sameDiscipline: an engineer "Tom" is never the
 * architect "Tom"), and the person must share something that tells them apart: the same firm (not blank), the same
 * phone or the same email. A name-only entry (no firm, phone or email typed) reuses a same-discipline contact with the
 * same full name only when that contact has no firm, phone or email either: the earlier save of the same entry.
 * Otherwise a new contact is made. A firm-only contact (no first or last name) goes by its firm: the name or firm typed
 * must be that firm, and a typed phone or email must agree with it (detailsAgree).
 * A role row stored as "consultant" holds several disciplines (energy, land surveyor, soil and geotech, lighting,
 * sanitary), so its discipline is the roster's: it is reused only when the lead's roster has that contact in the
 * discipline being named (a name-only energy assessor "Sam Lee" is never the land surveyor "Sam Lee"). No roster entry
 * for the contact → not reused (a new contact, never a merge of two people).
 *   roleRows  [{ status, role, contact: { id, first_name, last_name, company, phone, email, is_archived? } }] for this
 *             lead and its job
 *   role      the design-team role being named (DESIGN_TEAM_ROLES)
 *   roster    the lead's consultant_roster: [{ role, contactId }]
 * Returns the contact, or null.
 */
export function sameNamedOnJob(roleRows, { name, company, phone, email, role } = {}, roster = []) {
  const key = nameKey(name), firm = nameKey(company), tel = phoneKey(phone), mail = clean(email).toLowerCase();
  if (!key || !role) return null;
  const nameOnly = !firm && !tel && !mail;
  const want = storageRolesFor(role)?.rosterRole || role;
  const entries = (Array.isArray(roster) ? roster : []).filter(Boolean);
  // The roster names the contact in this discipline (a roster entry's own "consultant" says no discipline, so it is not one).
  const rosterSays = (contactId) => entries.some((e) => rosterContactId(e) === contactId && (e.role || e.type) !== "consultant"
    && sameDiscipline(e.role || e.type || "other", want));
  for (const r of Array.isArray(roleRows) ? roleRows : []) {
    const c = r?.contact;
    if (!c?.id || c.is_archived || !isOn(r.status) || !sameDiscipline(r.role, role)) continue;
    if (r.role === "consultant" && !rosterSays(c.id)) continue;
    const person = personName(c), theirFirm = nameKey(c.company);
    if (!person) {
      // A firm-only contact: the name typed is the firm, any firm typed is the same one, a phone or email typed agrees.
      if (theirFirm && theirFirm === key && (!firm || firm === theirFirm) && detailsAgree(c, { email, phone })) return c;
      continue;
    }
    if (nameKey(person) !== key) continue;
    const sameFirm = !!firm && firm === theirFirm;
    const samePhone = !!tel && tel === phoneKey(c.phone);
    const sameMail = !!mail && mail === clean(c.email).toLowerCase();
    const bothNameOnly = nameOnly && !theirFirm && !phoneKey(c.phone) && !clean(c.email);
    if (sameFirm || samePhone || sameMail || bothNameOnly) return c;
  }
  return null;
}

/**
 * A practice named with no person ("Studio X Architects" as both the name and the firm, or a firm with no name): the
 * firm's words, else "" (a person is being named). Such a contact is kept firm-only: no first or last name.
 */
export function firmOnlyName({ name, company } = {}) {
  const firm = clean(company), who = clean(name);
  if (!firm) return "";
  return !who || nameKey(who) === nameKey(firm) ? firm : "";
}

/**
 * The CRM contact a firm-only save links to before adding one: a contact that isn't archived or lost, with no person's
 * name, whose firm is the same words (any case, extra spaces ignored), and whose email and phone agree with any typed
 * (detailsAgree: blank on it, or the same). A practice with another email or phone is not linked: a new firm-only
 * contact is added, so the typed details are never dropped. A contact whose "name" is only its firm split in two (first
 * "Studio", last "X Architects", firm "Studio X Architects", as earlier tenders saved a practice) counts as firm-only too,
 * after a true firm-only one. Then an "active" one, then one of the same contact type, then the oldest.
 *   rows  crm_contacts rows that may have that firm (the caller's query may over-match: the firm is re-checked here)
 * Returns the row, or null. The caller fills the typed details it has no value for (detailsToFill).
 */
export function firmOnlyMatch(rows, { company, contactType, email, phone } = {}) {
  const want = clean(company).toLowerCase();
  if (!want) return null;
  const hits = (Array.isArray(rows) ? rows : []).filter((r) => r && r.id && !r.is_archived && r.status !== "lost"
    && clean(r.company).toLowerCase() === want && firmShaped(r) && detailsAgree(r, { email, phone }));
  if (!hits.length) return null;
  const rank = (r) => (personName(r) ? 4 : 0) + (r.status === "active" ? 0 : 2) + (contactType && r.contact_type === contactType ? 0 : 1);
  return [...hits].sort((a, b) => rank(a) - rank(b) || String(a.created_at || "").localeCompare(String(b.created_at || "")))[0];
}

/** "Ava Arch, Arch Studio": the person someone else's email belongs to, in plain words. */
export function conflictWords(row) {
  const name = contactNameOf(row), firm = clean(row?.company);
  return [name, firm && firm !== name ? firm : ""].filter(Boolean).join(", ") || "another contact";
}
