/**
 * registerDocuments.mjs — Master Register R03 · controlled documents (Tab 22 §A D1–D3, D-031/D-035/DOC-001).
 *
 * ONE pipeline, existing engine: live register + Sales context → doc-engine FIXTURE (the contract of
 * server/lib/documents/documentPayloads.mjs) → payload → docTemplates.renderDocxTemplate (the canonical
 * renderer) → LibreOffice PDF (docxToPdf.mjs). No second engine, no hand-assembled documents.
 *
 *   D1 client_brief         Preliminary Client Project Brief — issue record only, no signature (D-035)
 *   D2 architect_brief      Architect Design Brief — client intent kept distinct from technical solutions
 *   D3 selections_schedule  Selections & Finishes Schedule — technical register layout, or the client
 *                           presentation layout, from the SAME selection rows
 *
 * Issue = immutable: the PDF (+ controlled DOCX export) is stored under a unique path (never overwritten),
 * the issue row is written by register_issue_document (supersedes the previous revision in one transaction),
 * and the exact fixture + template hash + register versions are kept as the source snapshot. The register
 * stays the editable authority; the issued PDF is the authority for WHAT WAS ISSUED (DOC-001).
 * Nothing is emailed or sent from here — staff send the issued file themselves.
 */
import fs from "fs";
import { createHash, randomBytes } from "crypto";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import PizZip from "pizzip";
import { renderDocxTemplate } from "./docTemplates.mjs";
import { convertDocxToPdfBuffer } from "./docxToPdf.mjs";
import { DOC_DEFS, validateFixture } from "./documents/documentPayloads.mjs";
import { loadRegister } from "./registerStore.mjs";
import { loadRegisterContext } from "./registerContext.mjs";
import {
  roomLabel, refCode, outstandingReasons, isClientSelection, resolvePromptId, questionById, docGroupFor, categoryLabel,
  dispositionLabel, responsibilityLabel, supplyLabel, PROJECT_TYPE_LABELS, DELIVERY_MODELS, INCLUDED_DISPOSITIONS,
  QUESTION_LIBRARY_VERSION,
} from "../../src/lib/register.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "../../public/templates");
const BUCKET = "lead-documents";
const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const REGISTER_DOC_TYPES = {
  client_brief: { label: "Preliminary Client Project Brief", def: "client_brief", audience: "client" },
  architect_brief: { label: "Architect Design Brief", def: "architect_brief", audience: "architect" },
  selections_schedule: { label: "Selections & Finishes Schedule", def: "selections_schedule", audience: "client", altLayout: "client_presentation" },
};
const DOC_TYPE_KEYS = new Set(Object.keys(REGISTER_DOC_TYPES));
export const COORD_DISCIPLINES = { architect: "Architect", routleys: "Routleys (plumbing fixtures)", tli: "TLI (lighting & electrical)", windows: "Window supplier", engineer: "Engineer", energy: "Energy assessor", joiner: "Joiner" };

const STAGE_LABEL = { enquiry: "Enquiry", qualify: "Qualify", discovery: "Discovery", winning_offer: "Concept presentation", fee_proposal: "PTSA / plans", consultants: "Design coordination", tender: "Tender", won: "Contract" };
const SCHEDULE_GROUPS = new Set(["External", "Internal Finishes", "Joinery", "Wet Areas", "Services & Fixtures", "External Works"]);
const ENVELOPE_CATS = new Set(["roof", "cladding", "windows", "insulation", "structure", "existing", "demolition", "site", "external", "stairs"]);
const isoDate = (d = new Date()) => new Date(d).toISOString().slice(0, 10);
const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const sentence = (s) => { const t = clean(s); return t && !/[.!?]$/.test(t) ? `${t}.` : t; };

export class DocumentError extends Error {
  constructor(status, message, code, extra = {}) { super(message); this.status = status; this.code = code; Object.assign(this, extra); }
}

// ── fixture builders (live data → the doc-engine fixture contract) ───────────────────────────────

function itemShort(item) { return questionById(resolvePromptId(item.promptKey))?.short || categoryLabel(item.category); }
function orderItems(register, items) {
  const rank = new Map((register.meta.rooms || []).map((r, i) => [r.id, i]));
  return items.slice().sort((a, b) => (a.roomId ? rank.get(a.roomId) ?? 999 : -1) - (b.roomId ? rank.get(b.roomId) ?? 999 : -1));
}
/** A selection may only read "Client-approved" with evidence (or an approval recorded on the portal board). */
function approvalIsEvidenced(item) { return !!(item.evidence?.at && item.evidence?.by) || !!item.sync?.approvedOnBoard; }

function selectionStatus(item) {
  if (item.disposition === "retain") return "Existing to Remain";
  if (item.certainty === "client_approved") return approvalIsEvidenced(item) ? "Client-approved" : "Proposed";
  return { proposed: "Proposed", preference: "Preferred" }[item.certainty] || "TBC";
}

export function selectionRows(register, { coord } = {}) {
  let items = register.items.filter(isClientSelection);
  if (coord) items = items.filter((i) => questionById(resolvePromptId(i.promptKey))?.coord === coord || (coord === "routleys" && /routleys/i.test(i.supplier || "")) || (coord === "tli" && /\btli\b/i.test(i.supplier || "")));
  return orderItems(register, items).map((i) => {
    const group = docGroupFor(i.category);
    return {
      itemId: refCode(i),
      group: SCHEDULE_GROUPS.has(group) ? group : "Internal Finishes",
      category: `${roomLabel(register, i)} — ${itemShort(i)}`,
      product: clean([i.manufacturer, i.product || i.description, i.model].filter(Boolean).join(" ")) || "TBC",
      finish: clean(i.colour) || "TBC",
      qty: i.quantity != null ? clean(`${i.quantity} ${i.unit || ""}`) : "—",            // never a fake zero
      status: selectionStatus(i),
      responsibility: clean([i.supplyBy && supplyLabel(i.supplyBy), i.supplier, i.source, i.technicalStatus === "needs_verification" ? "Tech: to verify" : null].filter(Boolean).join(" · ")) || "TBC",   // never invent an owner
    };
  });
}

function baseFixture({ lead, context, register, revision, status, issuedDate, issuer }) {
  const typeLabel = PROJECT_TYPE_LABELS[context.projectType] || "Residential project";
  const architect = (context.consultants || []).find((c) => ["architect", "designer", "interior_designer"].includes(c.role));
  return {
    meta: { ref: `BL${String(lead.id).replace(/-/g, "").slice(0, 6).toUpperCase()}`, revision, status, issuedDate: status === "Issued" ? issuedDate : undefined, preparedDate: issuedDate },
    project: {
      clientName: context.identity.clientName,
      siteAddress: [context.identity.siteAddress, context.identity.suburb].filter(Boolean).filter((v, i, a) => i === 0 || !a[0].includes(v)).join(", "),
      drawingBasis: register.meta.planRev || "",
      projectDescription: clean(`${typeLabel}${context.identity.suburb ? ` · ${context.identity.suburb}` : ""}`),
      architect: architect?.name || "Architect / designer",
      preparedBy: issuer || "Blue Leaf Building",
      sectionLabel: `${STAGE_LABEL[lead.stage] || "Project brief"}  ·  ${typeLabel}`,
    },
  };
}

function clientBriefFixture(input) {
  const { context, register } = input;
  const fx = baseFixture(input);
  const items = orderItems(register, register.items);
  const area = (i) => roomLabel(register, i);
  const pItem = items.find((i) => !i.roomId && resolvePromptId(i.promptKey) === "P-005");
  const priorities = (pItem?.description || "").split(/\s*;\s*/)[0].split(/\s*,\s*/).filter(Boolean).slice(0, 3);
  const priorityNote = (pItem?.description || "").split(/\s*;\s*/).slice(1).join("; ");
  const reqs = items.filter((i) => i.itemKind === "requirement" && !i.roomId && i.description && resolvePromptId(i.promptKey) !== "P-005");
  const intentions = priorities.length
    ? priorities.map((p, idx) => ({ label: p, text: idx === 0 ? priorityNote : "" }))
    : reqs.slice(0, 3).map((r) => ({ label: itemShort(r), text: clean(r.description) }));
  const occupancy = { occupied: "The home is expected to stay occupied during the works.", partly: "Part of the home is expected to stay occupied during the works.", vacant: "The home is expected to be vacant during the works." }[register.meta.occupancy] || "";
  const summary = [
    sentence(context.goals.description || context.goals.vision || `${fx.project.projectDescription} for ${fx.project.clientName}`),
    clean([context.deliveryModel ? `Delivery model: ${DELIVERY_MODELS[context.deliveryModel]}.` : "", occupancy].join(" ")),
  ].filter(Boolean);
  // DOC1b (R04): "Included" is scope of WORKS only. Retained fabric ("existing to remain") is a scope
  // BOUNDARY, so it belongs under "Not in the current scope", not conflated with demolition under Included.
  const scopeIn = items.filter((i) => i.itemKind === "scope" && INCLUDED_DISPOSITIONS.has(i.disposition) && (i.description || i.disposition !== "undecided"))
    .map((i) => `${area(i)}: ${clean(i.description) || dispositionLabel(i.disposition)}${i.disposition === "remove" ? " (remove)" : i.disposition === "make_good" ? " (make good)" : ""}`);
  const scopeOut = items.filter((i) => ["excluded", "by_others", "deferred", "retain"].includes(i.disposition))
    .map((i) => `${area(i)}: ${clean(i.description) || itemShort(i)} — ${i.disposition === "retain" ? "existing to remain" : dispositionLabel(i.disposition)}`);
  const groups = new Map();
  for (const i of items.filter((x) => isClientSelection(x) && ["preference", "proposed", "client_approved"].includes(x.certainty) && (x.description || x.product))) {
    const g = docGroupFor(i.category) === "General" ? "Internal Finishes" : docGroupFor(i.category);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(`${area(i)} — ${itemShort(i)}: ${clean(i.description || i.product)} (${selectionStatus(i).toLowerCase()})`);
  }
  const perf = items.filter((i) => i.itemKind === "requirement" && i.description && resolvePromptId(i.promptKey) !== "P-005").map((i) => `${area(i)}: ${clean(i.description)}`);
  if (perf.length) groups.set("Performance & comfort", perf.slice(0, 8));
  const open = items.filter((i) => outstandingReasons(i).some((r) => r === "decision" || r === "action") && i.itemKind !== "requirement")
    .filter((i) => !["architect", "consultant", "trade"].includes(i.responsibility))
    // DOC1a (R04): a selection already captured as a design DIRECTION (preference / proposed / approved)
    // is NOT a required client action — it belongs in §02 "Design direction", not §03 "Key questions" —
    // UNLESS it carries an explicit, unresolved next action (e.g. the genuine "confirm the appliance" ask).
    .filter((i) => {
      const hasDirection = isClientSelection(i) && ["preference", "proposed", "client_approved"].includes(i.certainty) && (i.description || i.product);
      const openAction = !!(i.nextAction && i.nextAction.trim()) && !i.resolved;
      return !hasDirection || openAction;
    })
    .sort((a, b) => (a.responsibility === "client" ? -1 : 0) - (b.responsibility === "client" ? -1 : 0)).slice(0, 7);
  const risks = items.filter((i) => i.technicalStatus === "needs_verification" && (["site", "existing", "demolition", "structure"].includes(i.category) || i.section === "site"))
    .map((i) => `${area(i)}: ${clean(i.description) || itemShort(i)} — to be confirmed by ${responsibilityLabel(i.responsibility || "consultant").toLowerCase()}`).slice(0, 8);
  fx.clientBrief = {
    summaryParas: summary,
    intentions,
    scopeIn, scopeOut,
    preferenceGroups: [...groups.entries()].map(([name, list]) => ({ name, items: list })),
    questions: open.map((i) => ({ id: refCode(i), action: clean(i.nextAction || i.description || itemShort(i)), owner: responsibilityLabel(i.responsibility || "blue_leaf"), status: "OPEN" })),
    nextStepsParas: ["The next step is the Pre-construction Services Agreement (PTSA). Design development, consultant coordination and detailed selections follow, and each decision above is recorded against the same project brief."],
    processSteps: [
      { num: "01", label: "Concept", note: "Brief & concept design" },
      { num: "02", label: "PTSA & plans", note: "Pre-construction services" },
      { num: "03", label: "Coordination", note: "Consultants & selections" },
      { num: "04", label: "Tender", note: "Scope & pricing confirmed" },
      { num: "05", label: "Contract", note: "Build & handover" },
    ],
    assumptions: risks,
  };
  return fx;
}

function architectBriefFixture(input) {
  const { context, register } = input;
  const fx = baseFixture(input);
  const items = orderItems(register, register.items);
  const area = (i) => roomLabel(register, i);
  const roomSheet = (i) => (register.meta.rooms || []).find((r) => r.id === i.roomId)?.sheet || "";
  const archStatus = (i) => (i.technicalStatus === "needs_verification" ? "To verify" : i.certainty === "client_approved" && approvalIsEvidenced(i) ? "Client-approved" : "Proposed");
  const actions = items.filter((i) => !i.resolved && (i.itemKind === "action" || (i.nextAction && i.nextAction.trim())) && ["architect", "consultant", "", undefined, null].includes(i.responsibility))
    .slice(0, 14).map((i) => ({ id: refCode(i), action: clean(i.nextAction || i.description || itemShort(i)), owner: responsibilityLabel(i.responsibility || "architect"), status: "OPEN" }));
  const register_ = items.filter((i) => (i.itemKind === "scope" && !["na", "undecided"].includes(i.disposition)) || i.itemKind === "requirement" || i.technicalStatus === "needs_verification")
    .filter((i) => i.description || i.itemKind === "scope")
    .map((i) => ({
      itemId: refCode(i), location: area(i),
      requirement: clean(`${i.itemKind === "scope" ? `${dispositionLabel(i.disposition)}: ` : i.itemKind === "requirement" ? "Requirement: " : ""}${i.description || itemShort(i)}`),
      status: archStatus(i), action: clean(i.nextAction), dwgRef: clean(i.source || roomSheet(i) || register.meta.planRev), group: ENVELOPE_CATS.has(i.category) ? "Envelope & structure" : "Internal & services",
    }));
  fx.architectBrief = {
    actionsIntro: "The following are the decisions most likely to delay the next coordinated drawing issue. Reference IDs match the design register below and the project register.",
    actions,
    confirmedReqs: items.filter((i) => i.itemKind === "requirement" && i.certainty === "client_approved" && approvalIsEvidenced(i) && i.description).map((i) => `${area(i)}: ${clean(i.description)}`),
    clientPrefs: items.filter((i) => isClientSelection(i) && ["preference", "proposed"].includes(i.certainty) && (i.description || i.product)).slice(0, 10).map((i) => `${area(i)} ${itemShort(i).toLowerCase()}: ${clean(i.description || i.product)}`),
    scheduleItems: register_,
    references: [register.meta.planRev ? `Current drawing basis: ${register.meta.planRev}` : null,
      ...(context.drawings || []).slice(0, 10).map((d) => clean(`${d.filename}${d.revision ? ` — ${d.revision}` : ""}${d.issuer ? ` (${d.issuer})` : ""}`))].filter(Boolean),
  };
  return fx;
}

function selectionsFixture(input, opts = {}) {
  const fx = baseFixture(input);
  fx.selections = selectionRows(input.register, opts);
  fx.clientPresentation = {};
  return fx;
}

export function buildRegisterFixture(docType, input, opts = {}) {
  if (docType === "client_brief") return clientBriefFixture(input);
  if (docType === "architect_brief") return architectBriefFixture(input);
  if (docType === "selections_schedule") return selectionsFixture(input, opts);
  throw new DocumentError(400, "Unknown document type.", "BAD_DOC");
}

// ── pre-issue checks (Tab 14 release blockers) ───────────────────────────────────────────────────

const MONEY_RX = /\$\s?\d/;
export function registerDocChecks(docType, fx, { register, recipientName, mode }) {
  const errors = [], warnings = [];
  if (!clean(fx.project.drawingBasis)) (mode === "issue" ? errors : warnings).push("Record the current drawing set / revision (Project step) before issuing.");
  if (mode === "issue" && !clean(recipientName)) errors.push("Enter who the document is being issued to.");
  const falseApprovals = register.items.filter((i) => i.certainty === "client_approved" && !approvalIsEvidenced(i));
  if (falseApprovals.length) (mode === "issue" ? errors : warnings).push(`${falseApprovals.length} item(s) are marked client-approved without evidence — record the approval or step them back.`);
  const unverified = register.items.filter((i) => i.technicalStatus === "verified" && !i.technicalEvidence?.ref);
  if (unverified.length) (mode === "issue" ? errors : warnings).push(`${unverified.length} item(s) are marked verified without a technical reference.`);
  const strings = JSON.stringify(fx);
  if (MONEY_RX.test(strings)) errors.push("The document would contain a dollar figure — register documents never show prices or allowances.");
  if (docType === "selections_schedule" && !fx.selections.length) errors.push("There are no client selections to schedule yet.");
  if (docType === "client_brief" && !fx.clientBrief.scopeIn.length && !fx.clientBrief.preferenceGroups.length) warnings.push("The brief has no recorded scope or preferences yet.");
  const v = validateFixture(fx, { mode: mode === "issue" ? "issue" : "draft" });
  if (mode === "issue") errors.push(...v.errors); else warnings.push(...v.warnings);
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

/** Scan the RENDERED document for leaked placeholders / empty values (belt and braces after render). */
function renderedTextIssues(docxBuffer) {
  try {
    const zip = new PizZip(docxBuffer);
    const xml = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n)).map((n) => zip.files[n].asText()).join(" ");
    const text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const bad = [];
    if (/\{[#/]?[A-Z_]{2,}\}/.test(text)) bad.push("unfilled template tag");
    if (/\bundefined\b|\bNaN\b|\[object Object\]|\[Client\]/.test(text)) bad.push("empty or invalid value");
    return bad;
  } catch { return ["the document could not be read back"]; }
}

// ── render ───────────────────────────────────────────────────────────────────────────────────────

function templateFor(defKey) {
  const def = DOC_DEFS[defKey];
  const file = join(TEMPLATE_DIR, def.templateFile);
  const bytes = fs.readFileSync(file);
  return { def, bytes, file: def.templateFile, hash: createHash("sha256").update(bytes).digest("hex").slice(0, 16) };
}

export async function renderRegisterDocument(docType, fx, { layout } = {}) {
  const spec = REGISTER_DOC_TYPES[docType];
  const defKey = layout === "client" && spec.altLayout ? spec.altLayout : spec.def;
  const t = templateFor(defKey);
  const payload = t.def.build(fx);
  const docx = renderDocxTemplate(t.bytes, payload);
  const leaks = renderedTextIssues(docx);
  const pdf = await convertDocxToPdfBuffer(docx);
  return { docx, pdf, template: { key: defKey, file: t.file, hash: t.hash }, leaks };
}

// ── load inputs ──────────────────────────────────────────────────────────────────────────────────

async function loadInputs(sb, leadId, actor) {
  const { data: lead } = await sb.from("leads").select("id, name, stage, job_id, project_type").eq("id", leadId).maybeSingle();
  if (!lead) throw new DocumentError(404, "Lead not found", "NOT_FOUND");
  const loaded = await loadRegister(sb, leadId, { actor });
  const context = await loadRegisterContext(sb, leadId);
  return { lead, loaded, register: loaded.register, context };
}

async function nextVersion(sb, leadId, docType) {
  const { data, error } = await sb.from("lead_documents").select("version").eq("lead_id", leadId).eq("document_type", docType)
    .not("issued_at", "is", null).order("version", { ascending: false }).limit(1);
  if (error) {
    if (error.code === "42703") throw new DocumentError(503, "Apply migration 213 first (document issue registry).", "SCHEMA");
    throw new DocumentError(400, "Could not read the issue history.", "HISTORY");
  }
  return (data?.[0]?.version || 0) + 1;
}

// A stable fingerprint of the register content a document is rendered from: item id → version (updatedAt as
// the fallback for an unversioned row). Round-tripped from preview to issue so that if the brief changed
// between the two, the issue is refused and no stale controlled document is recorded (Tab 27 R04 review §1).
export function registerItemVersions(register) {
  return Object.fromEntries((register?.items || []).map((i) => [i.id, i.sync?.version ?? i.updatedAt ?? null]));
}
function versionsDiffer(expected, current) {
  if (!expected || typeof expected !== "object") return false;        // no expectation sent → guard is inert
  const ek = Object.keys(expected), ck = Object.keys(current);
  if (ek.length !== ck.length) return true;
  for (const k of ek) if (String(expected[k]) !== String(current[k])) return true;   // changed or vanished item
  for (const k of ck) if (!(k in expected)) return true;                             // a new item appeared
  return false;
}

// ── public API ───────────────────────────────────────────────────────────────────────────────────

/** Render a DRAFT (not stored). Returns the PDF, the pre-issue check result, and the content fingerprint. */
export async function previewDocument(sb, leadId, docType, { layout, recipientName, actor } = {}) {
  if (!DOC_TYPE_KEYS.has(docType)) throw new DocumentError(400, "Unknown document type.", "BAD_DOC");
  const { lead, register, context } = await loadInputs(sb, leadId, actor);
  let revision = 1;
  try { revision = await nextVersion(sb, leadId, docType); } catch { /* preview works pre-213 */ }
  const input = { lead, context, register, revision, issuedDate: isoDate(), issuer: actor?.name };
  const fx = buildRegisterFixture(docType, { ...input, status: "Draft" });
  // Show exactly what WOULD block an issue (checked on the issued form of the same document).
  const checks = registerDocChecks(docType, buildRegisterFixture(docType, { ...input, status: "Issued" }), { register, recipientName, mode: "issue" });
  const out = await renderRegisterDocument(docType, fx, { layout });
  if (out.leaks.length) checks.errors.push(`Rendering problem: ${out.leaks.join(", ")}.`);
  return { pdf: out.pdf, checks, revision, itemVersions: registerItemVersions(register) };
}

/**
 * Issue an immutable revision. Blocks on any pre-issue error (nothing stored). Retries once if someone
 * else issued the same document at the same moment (the PDF carries its revision number).
 */
export async function issueDocument(sb, leadId, docType, { recipientName, recipientEmail, layout, actor, expectedVersions } = {}) {
  if (!DOC_TYPE_KEYS.has(docType)) throw new DocumentError(400, "Unknown document type.", "BAD_DOC");
  for (let attempt = 0; attempt < 2; attempt++) {
    const { lead, loaded, register, context } = await loadInputs(sb, leadId, actor);
    // R04 review §1: refuse to issue a controlled document from data that changed since it was previewed.
    // `expectedVersions` is the fingerprint the preview returned (round-tripped by the client). If the
    // register moved on — a concurrent edit, or the client's own edits never persisted — nothing is issued.
    if (versionsDiffer(expectedVersions, registerItemVersions(register))) {
      throw new DocumentError(409, "The brief changed since you previewed it — nothing was issued. Re-open the preview to see the current version, then issue again.", "ISSUE_STALE");
    }
    const revision = await nextVersion(sb, leadId, docType);
    const issuedDate = isoDate();
    const fx = buildRegisterFixture(docType, { lead, context, register, revision, status: "Issued", issuedDate, issuer: actor?.name });
    const checks = registerDocChecks(docType, fx, { register, recipientName, mode: "issue" });
    if (checks.errors.length) throw new DocumentError(422, "This document can't be issued yet.", "PREFLIGHT", { checks });
    const out = await renderRegisterDocument(docType, fx, { layout });
    if (out.leaks.length) throw new DocumentError(422, "This document can't be issued yet.", "PREFLIGHT", { checks: { errors: [`Rendering problem: ${out.leaks.join(", ")}.`], warnings: [] } });

    const sha = createHash("sha256").update(out.pdf).digest("hex");
    const stamp = `${issuedDate}-${docType.replace(/_/g, "-")}-P${String(revision).padStart(2, "0")}-${randomBytes(3).toString("hex")}`;
    const pdfPath = `leads/${leadId}/register/${docType}/${stamp}.pdf`;
    const docxPath = `leads/${leadId}/register/${docType}/${stamp}.docx`;
    // A thrown rejection (network/timeout under undici) is normalised to the same {error} shape the
    // supabase-js client returns, so the cleanup/error-handling below runs on a throw too, not just on a
    // returned error — "nothing was issued" stays true whether the backend returns or throws.
    let up1;
    try { up1 = await sb.storage.from(BUCKET).upload(pdfPath, out.pdf, { contentType: PDF_MIME, upsert: false }); }
    catch (e) { up1 = { error: { message: e?.message || "PDF upload threw", thrown: true } }; }
    if (up1.error) throw new DocumentError(502, "Could not store the issued PDF.", "STORAGE");
    // Tab 25 issue 5: both files must store, or neither — a half-stored issue (PDF without its DOCX
    // export) would 502 on the controlled-export download. Check the DOCX upload and roll back the PDF.
    let up2;
    try { up2 = await sb.storage.from(BUCKET).upload(docxPath, out.docx, { contentType: DOCX_MIME, upsert: false }); }
    catch (e) { up2 = { error: { message: e?.message || "DOCX upload threw", thrown: true } }; }
    if (up2.error) {
      await sb.storage.from(BUCKET).remove([pdfPath]).catch(() => {});
      throw new DocumentError(502, "Could not store the issued document (DOCX export).", "STORAGE");
    }

    const label = REGISTER_DOC_TYPES[docType].label;
    const filename = `${label} — ${fx.project.clientName} — P${String(revision).padStart(2, "0")}.pdf`.replace(/[\\/]/g, "-");
    const versions = registerItemVersions(register);
    let data, error;
    try { ({ data, error } = await sb.rpc("register_issue_document", {
      p_lead_id: leadId, p_document_type: docType, p_expected_version: revision,
      p_row: {
        filename, file_size: out.pdf.length, mime_type: PDF_MIME, storage_path: pdfPath, uploaded_by: actor?.email || actor?.name || "register",
        content_sha256: sha, revision_label: `P${String(revision).padStart(2, "0")}`, template_key: out.template.key,
        template_version: `${out.template.file}@${out.template.hash}`,
        source_snapshot: { fixture: fx, registerMode: loaded.mode, registerMetaRev: register.meta.rev ?? null, itemVersions: versions,
          libraryVersion: QUESTION_LIBRARY_VERSION, exportDocxPath: docxPath, layout: layout || "technical" },
        issued_by: actor?.id || null, issued_by_name: actor?.name || null, recipient_name: clean(recipientName), recipient_email: clean(recipientEmail) || null,
        audience: REGISTER_DOC_TYPES[docType].audience, job_id: lead.job_id || null, project_id: loaded.projectId || null,
      },
    })); } catch (e) { data = null; error = { message: e?.message || "register_issue_document threw", thrown: true }; }
    if (error) {
      // The DB record was not written — remove the orphaned storage objects so "nothing was issued" is
      // literally true (no unreferenced PDF/DOCX left behind). Tab 25 issue 5.
      await sb.storage.from(BUCKET).remove([pdfPath, docxPath]).catch(() => {});
      if (error.code === "42883" || error.code === "PGRST202") throw new DocumentError(503, "Apply migration 213 first (document issue registry).", "SCHEMA");
      throw new DocumentError(400, "Could not record the issue — nothing was issued.", "ISSUE", { detail: error.message });
    }
    if (data?.ok === false) {
      // No revision was recorded — drop this attempt's orphan uploads. A version conflict re-renders at
      // the next number on the retry; any other refusal surfaces cleanly.
      await sb.storage.from(BUCKET).remove([pdfPath, docxPath]).catch(() => {});
      if (data.reason === "version_conflict") continue;                           // someone issued at the same time — re-render
      throw new DocumentError(409, "Could not record the issue — nothing was issued.", "ISSUE", { detail: data.reason });
    }
    if (lead.job_id) {
      try {
        await sb.from("job_events").insert({ job_id: lead.job_id, event_type: "register.document.issued", source: "register", actor_id: actor?.id || null,
          entity_type: "document", entity_id: data.document.id, metadata: { lead_id: leadId, document_type: docType, version: revision, recipient: clean(recipientName), sha256: sha } });
      } catch { /* history is best-effort here; the issue row itself is the record */ }
    }
    return { document: data.document, supersededId: data.superseded_id || null, checks };
  }
  throw new DocumentError(409, "Another issue of this document happened at the same moment — please try again.", "VERSION");
}

const LIST_COLS = "id, filename, document_type, created_at, mime_type, file_size, version, status, revision_label, issued_at, issued_by_name, recipient_name, recipient_email, content_sha256, template_version, supersedes_document_id, discipline, issuer, doc_number, received_at, review_status, review_notes, outstanding_question, register_item_ids";

export async function listDocuments(sb, leadId) {
  const { data, error } = await sb.from("lead_documents").select(LIST_COLS).eq("lead_id", leadId)
    .in("document_type", [...DOC_TYPE_KEYS, "register_baseline", "consultant_document", "supplier_document"])
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42703") return { issued: [], sources: [], schemaReady: false };
    throw new DocumentError(400, "Could not list documents.", "LIST");
  }
  return {
    issued: (data || []).filter((d) => d.issued_at),
    sources: (data || []).filter((d) => ["consultant_document", "supplier_document"].includes(d.document_type)),
    schemaReady: true,
  };
}

export async function documentUrl(sb, leadId, docId, { export: exportDocx } = {}) {
  const { data: doc } = await sb.from("lead_documents").select("id, lead_id, storage_path, source_snapshot").eq("id", docId).eq("lead_id", leadId).maybeSingle();
  if (!doc) throw new DocumentError(404, "Document not found", "NOT_FOUND");
  const path = exportDocx ? doc.source_snapshot?.exportDocxPath : doc.storage_path;
  if (!path) throw new DocumentError(404, "No editable export for this document.", "NOT_FOUND");
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) throw new DocumentError(502, "Could not open the stored file.", "STORAGE");
  return data.signedUrl;
}

/** Draft coordination request for a consultant / supplier (filtered schedule) — not an issued record. */
export async function supplierPack(sb, leadId, discipline, { actor } = {}) {
  if (!COORD_DISCIPLINES[discipline]) throw new DocumentError(400, "Unknown discipline.", "BAD_DISCIPLINE");
  const { lead, register, context } = await loadInputs(sb, leadId, actor);
  const fx = buildRegisterFixture("selections_schedule", { lead, context, register, revision: 1, status: "Draft", issuedDate: isoDate(), issuer: actor?.name }, { coord: discipline });
  fx.project.sectionLabel = `Coordination request  ·  ${COORD_DISCIPLINES[discipline]}`;
  if (!fx.selections.length) throw new DocumentError(422, `No register items are tagged for ${COORD_DISCIPLINES[discipline]} yet.`, "EMPTY");
  const out = await renderRegisterDocument("selections_schedule", fx, {});
  return { pdf: out.pdf, count: fx.selections.length };
}

// ── received consultant / supplier documents (manual review + reconciliation, D-003) ─────────────

export async function addSourceDocument(sb, leadId, body, { actor } = {}) {
  const { filename, data, mimeType, documentType = "consultant_document", discipline, issuer, docNumber, revisionLabel, receivedAt, outstandingQuestion, itemIds } = body || {};
  if (!clean(filename) || !data) throw new DocumentError(400, "A file is required.", "BAD_FILE");
  if (!["consultant_document", "supplier_document"].includes(documentType)) throw new DocumentError(400, "Unknown document type.", "BAD_DOC");
  const buffer = Buffer.from(data, "base64");
  const safe = clean(filename).toLowerCase().replace(/\s+/g, "-").replace(/[^\w.-]/g, "");
  const path = `leads/${leadId}/register/sources/${isoDate()}-${randomBytes(3).toString("hex")}-${safe}`;
  const up = await sb.storage.from(BUCKET).upload(path, buffer, { contentType: mimeType || "application/octet-stream", upsert: false });
  if (up.error) throw new DocumentError(502, "Could not store the document.", "STORAGE");
  const { data: lead } = await sb.from("leads").select("job_id").eq("id", leadId).maybeSingle();
  const { data: row, error } = await sb.from("lead_documents").insert({
    lead_id: leadId, filename: clean(filename), file_size: buffer.length, mime_type: mimeType || null, storage_path: path,
    document_type: documentType, uploaded_by: actor?.email || actor?.name || "register",
    discipline: discipline || null, issuer: clean(issuer) || null, doc_number: clean(docNumber) || null, revision_label: clean(revisionLabel) || null,
    received_at: receivedAt || isoDate(), review_status: "received", outstanding_question: clean(outstandingQuestion) || null,
    register_item_ids: Array.isArray(itemIds) ? itemIds.map(String) : [], job_id: lead?.job_id || null,
  }).select(LIST_COLS).single();
  if (error) {
    await sb.storage.from(BUCKET).remove([path]);
    if (error.code === "42703" || error.code === "23514") throw new DocumentError(503, "Apply migration 213 first (coordination documents).", "SCHEMA");
    throw new DocumentError(400, "Could not record the document.", "SOURCE");
  }
  return row;
}

export async function updateSourceDocument(sb, leadId, docId, body) {
  const patch = {};
  if (body.reviewStatus !== undefined) {
    if (!["received", "under_review", "reconciled", "superseded"].includes(body.reviewStatus)) throw new DocumentError(400, "Unknown review status.", "BAD_STATUS");
    patch.review_status = body.reviewStatus;
  }
  if (body.reviewNotes !== undefined) patch.review_notes = clean(body.reviewNotes) || null;
  if (body.outstandingQuestion !== undefined) patch.outstanding_question = clean(body.outstandingQuestion) || null;
  if (body.itemIds !== undefined) patch.register_item_ids = Array.isArray(body.itemIds) ? body.itemIds.map(String) : [];
  if (body.discipline !== undefined) patch.discipline = body.discipline || null;
  if (!Object.keys(patch).length) throw new DocumentError(400, "Nothing to update.", "EMPTY");
  const { data, error } = await sb.from("lead_documents").update(patch).eq("id", docId).eq("lead_id", leadId)
    .in("document_type", ["consultant_document", "supplier_document"]).select(LIST_COLS).maybeSingle();
  if (error) throw new DocumentError(400, "Could not update the document.", "SOURCE");
  if (!data) throw new DocumentError(404, "Document not found", "NOT_FOUND");
  return data;
}
