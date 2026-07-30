// packCompose.mjs — compose a carpentry job's selected control modules into ONE 3-part site WHS pack,
// in Blue Leaf house style. Part 1 = HRCW SWMS (SELECTED controls only), Part 2 = task-control modules,
// Part 3 = site implementation record + sign-on. Pure render; the supervisor's selections + Part-3
// answers come from the carpentry_whs_packs record. DRAFT watermark unless every included module is
// reviewed. No conditional wording is invented here — only the controls the supervisor actually ticked.

import { renderBarHtml } from "./hierarchyBar.mjs";

const HOC = { 1: "Eliminate", 2: "Substitute", 3: "Isolate", 4: "Engineering", 5: "Administrative", 6: "PPE" };
const PPE_FLAG = { R: "mandatory", C: "conditional", S: "recommended", NA: "n/a" };
const RANK = { R: 3, C: 2, S: 1, NA: 0 };
// Defensive: strip stray markdown emphasis, and normalise a PPE flag to a single known value. A compound
// flag ("C → R", "R / N/A") or an unknown token resolves to the MORE protective value — never a silent
// "n/a" (the bug that hid P2-respirator on the earlier sample). The register is already clean; this stops
// any future bad data from leaking into a liability document.
const stripMd = (s) => String(s ?? "").replace(/\*\*/g, "").replace(/\*\(/g, "(").replace(/\)\*/g, ")").replace(/\s{2,}/g, " ").trim();
function normFlag(raw) {
  const norm = (String(raw ?? "").toUpperCase().match(/N\/?A|R|C|S/g) || []).map((t) => (t.startsWith("N") ? "NA" : t));
  return norm.length ? norm.sort((a, b) => RANK[b] - RANK[a])[0] : "C";
}
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const txt = (s) => esc(stripMd(s));
const bar = (t) => `<div style="background:#111;color:#fff;font-weight:700;font-size:12px;letter-spacing:.04em;padding:6px 10px;margin:18px 0 8px">${esc(t)}</div>`;

function moduleBlock(m, pickedKeys, part, justification = "") {
  const c = m.content_json || {};
  const controls = Array.isArray(c.controlOptions) ? c.controlOptions : [];
  // selected_controls stores each ticked control's TEXT (stable identity) — never a positional index —
  // so reordering/editing the register can't silently remap a tick to a different control. A tick whose
  // text no longer exists simply drops (fails safe → "no controls selected").
  const keys = Array.isArray(pickedKeys) ? pickedKeys : [];
  const picked = controls.filter((x) => keys.includes(x.text));
  const ppe = Array.isArray(c.ppeRules) ? c.ppeRules : [];
  const ctrlRows = controls.length === 0
    ? `<li style="color:#444">Controls for this item are the site PPE matrix (Part 3) + general site rules.</li>`
    : picked.length
      ? picked.map((x) => `<li><b>L${esc(x.level)} ${esc(HOC[x.level] || "")}:</b> ${txt(x.text)}</li>`).join("")
      : `<li style="color:#b00"><b>No controls selected — this ${part === 1 ? "HRCW" : "task"} cannot proceed until the supervisor selects the controls actually in place.</b></li>`;
  const ppeRow = ppe.length
    ? `<div style="font-size:12px;margin-top:4px"><b>PPE:</b> ${ppe.map((p) => `${txt(p.item)} (${esc(PPE_FLAG[normFlag(p.flag)])}${p.condition ? " — " + txt(p.condition) : ""})`).join("; ")}</div>`
    : "";
  const levels = picked.map((x) => x.level);
  const justRow = justification ? `<div style="font-size:11px;color:#7a1616;margin-top:2px"><b>Why this is acceptable:</b> ${txt(justification)}</div>` : "";
  return `
  <div style="border:1px solid #ccc;border-radius:6px;padding:10px;margin-bottom:10px">
    <div style="font-weight:700;color:#006c9b">${esc(m.module_code || "")} · ${esc(m.title || "")}</div>
    <div style="margin:3px 0 2px">${renderBarHtml(levels)}</div>
    ${justRow}
    ${c.activity ? `<div style="font-size:12px"><b>Activity:</b> ${txt(c.activity)}</div>` : ""}
    ${c.hazard ? `<div style="font-size:12px"><b>Hazards:</b> ${txt(c.hazard)}</div>` : ""}
    <div style="font-size:12px;margin-top:4px"><b>Controls in place (hierarchy order):</b></div>
    <ol style="font-size:12px;margin:2px 0 0 16px">${ctrlRows}</ol>
    ${ppeRow}
    ${c.monitorReview ? `<div style="font-size:11px;color:#444;margin-top:4px"><b>Monitor &amp; review:</b> ${txt(c.monitorReview)}</div>` : ""}
    ${(c.responsibleInstall || c.responsibleUse) ? `<div style="font-size:11px;color:#444"><b>Responsible:</b> ${c.responsibleInstall ? "install/verify " + txt(c.responsibleInstall) : ""}${c.responsibleUse ? " · use " + txt(c.responsibleUse) : ""}</div>` : ""}
  </div>`;
}

// Resolve the site-wide PPE matrix from every selected module's ppeRules + site conditions.
// R (required) wins; a C item is "conditional (…)" unless a site condition makes it mandatory.
function resolvePpe(modules, answers = {}) {
  const items = {};
  for (const m of modules) {
    for (const p of (m.content_json?.ppeRules || [])) {
      const flag = normFlag(p.flag);
      const cur = items[p.item];
      if (!cur || RANK[flag] > RANK[cur.flag]) items[p.item] = { flag, condition: stripMd(p.condition || "") };
    }
  }
  const out = {};
  for (const [item, v] of Object.entries(items)) {
    let label = v.flag === "R" ? "mandatory" : v.flag === "C" ? `conditional${v.condition ? " — " + v.condition : ""}` : v.flag === "S" ? "recommended" : "n/a";
    if (/hard ?hat/i.test(item) && answers.craneOnSite) label = "mandatory (crane on site)";
    if (/hi.?vis/i.test(item) && answers.plantOnSite) label = "mandatory (plant on site)";
    out[item] = label;
  }
  // The site-condition toggles must ADD the item if no module contributed it, otherwise the "Crane on
  // site → hard hat mandatory" promise the UI makes would silently do nothing.
  if (answers.craneOnSite && !Object.keys(out).some((k) => /hard ?hat/i.test(k))) out["Hard hat"] = "mandatory (crane on site)";
  if (answers.plantOnSite && !Object.keys(out).some((k) => /hi.?vis/i.test(k))) out["Hi-vis vest"] = "mandatory (plant on site)";
  return out;
}

const kv = (rows) => `<table style="width:100%;border-collapse:collapse;font-size:12px">${rows.map(([k, v]) => `<tr><td style="border:1px solid #ccc;padding:4px;background:#f4f6f8;font-weight:600;width:38%">${esc(k)}</td><td style="border:1px solid #ccc;padding:4px">${v == null || v === "" ? "—" : esc(v)}</td></tr>`).join("")}</table>`;

function fmtDate(d) {
  if (!d) return "— not set —";
  const dt = new Date(d);
  return isNaN(dt) ? String(d) : dt.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

// The tag block (Design §6.2) — the pack's scaffold-tag identity: same shape + position every time.
// Header colour AND word carry the state (never colour alone): green issued+in-date / amber draft /
// red review-overdue. REVIEW DUE is always shown — a pack with no review date is how a SWMS goes stale.
function renderTagBlock({ siteAddress, job = {}, pack = {}, company = {}, draft, pastDue }) {
  const bg = pastDue ? "#B3261E" : draft ? "#C77700" : "#1F7A3D";
  const word = pastDue ? "REVIEW OVERDUE — NOT FOR SITE USE" : draft ? "DRAFT — NOT FOR SITE USE" : "ISSUED — IN DATE";
  return `
  <div style="border:2px solid #10151C;border-radius:6px;margin-bottom:14px;overflow:hidden">
    <div style="background:${bg};color:#fff;font-weight:800;font-size:14px;letter-spacing:.04em;padding:8px 12px;display:flex;justify-content:space-between">
      <span>SITE WHS PACK</span><span>${esc(company.name || "Blue Leaf Building")}</span>
    </div>
    <div style="padding:10px 12px;font-size:12px">
      <div style="font-weight:700;font-size:14px">${esc(siteAddress || job.address || "[site address]")}</div>
      <div style="color:#5A646E;margin-bottom:6px">${esc(job.reference || "")} · ${esc(job.projectType || "")}</div>
      ${kv([
        ["Version", `v${pack.version || 1}`],
        ["Issued", pack.approved_at ? fmtDate(pack.approved_at) : "—"],
        ["Reviewer (competent person)", pack.reviewed_by || "— pending —"],
        ["Reviewer sign-off", pack.reviewed_at ? fmtDate(pack.reviewed_at) : "—"],
        ["Review due", fmtDate(pack.review_due_at)],
      ])}
      <div style="margin-top:6px;font-weight:800;color:${bg}">${esc(word)}</div>
    </div>
  </div>`;
}

// The site-specific conditions block (Questionnaire §6) — the short list that makes a pack site-specific
// rather than a template with an address on it. 6 Y/N rows; a "Yes" carries a one-line detail.
export const SITE_CONDITIONS = [
  ["overheadServices", "Overhead services on the frontage"],
  ["undergroundServices", "Underground services in the work path"],
  ["tightBoundary", "Adjoining structures / tight boundary"],
  ["occupiedDwelling", "Occupied dwelling or neighbours affected"],
  ["tradesAboveBelow", "Other trades working above or below"],
  ["unusualAccess", "Anything unusual about access, slope or ground"],
];
function renderSiteConditions(a = {}) {
  const c = a.conditions || {};
  const rows = SITE_CONDITIONS.map(([k, label]) => {
    const v = c[k] || {};
    const yes = !!v.y;
    return `<tr><td style="border:1px solid #ccc;padding:4px;width:52%">${esc(label)}</td><td style="border:1px solid #ccc;padding:4px;font-weight:700;width:12%;color:${yes ? "#7a1616" : "#5A646E"}">${yes ? "YES" : "No"}</td><td style="border:1px solid #ccc;padding:4px">${yes ? (txt(v.detail) || "—") : "—"}</td></tr>`;
  }).join("");
  return `<div style="font-weight:700;margin:12px 0 4px">Site-specific conditions</div><table style="width:100%;border-collapse:collapse;font-size:12px">${rows}</table>`;
}

// The Site Card (Design §7.2) — the one page that actually gets read at pre-start. Max 3 kill risks
// (the top selected HRCW modules), the stop-work limits, and the emergency block. No module IDs — a
// carpenter never needs to see "H-01". Renders as the lead block of the pack + (Phase 3) a standalone.
export function renderSiteCard({ hrcw = [], sel = {}, a = {}, company = {}, draft = true }) {
  const kill = hrcw.slice(0, 3).map((m) => {
    const inPlace = (sel[m.module_code] || []).slice(0, 2).map(txt).join(" · ");
    return `<li style="margin:0 0 5px"><b>${txt(m.title || m.module_code)}</b>${inPlace
      ? `<div style="font-size:11px;color:#1F7A3D">■ In place: ${inPlace}</div>`
      : `<div style="font-size:11px;color:#B3261E;font-weight:700">■ No controls recorded — do not start</div>`}</li>`;
  }).join("");
  const more = hrcw.length > 3 ? `<div style="font-size:11px;color:#5A646E">+ ${hrcw.length - 3} more high-risk item(s) in Part 1</div>` : "";

  const stopBits = [];
  if (a.stopWind) stopBits.push(`Wind over <b>${esc(a.stopWind)} km/h</b>`);
  if (a.stopHeat) stopBits.push(`Heat over <b>${esc(a.stopHeat)} °C</b>`);
  if (a.noWetWork) stopBits.push("No roof / joist work when wet or frosted");
  const stop = stopBits.length ? stopBits.join(" &nbsp;·&nbsp; ") : `<span style="color:#5A646E">Stop-work limits not set — capture them in site facts.</span>`;

  const emerg = kv([
    ["Hospital", a.hospital],
    ["First aid", a.firstAider],
    ["Muster point", a.musterPoint],
    ["Rescue", a.fallArrestInUse ? (a.rescuer || "[rescuer not set]") : "No fall-arrest in use on this job"],
    ["Call", company.phone],
  ]);

  return `
  <div style="border:2px solid #10151C;border-radius:6px;margin-bottom:14px">
    <div style="background:#1B3A5C;color:#fff;font-weight:800;font-size:15px;letter-spacing:.04em;padding:8px 12px">TODAY ON THIS SITE${draft ? ` &nbsp;<span style="color:#ffd6a0;font-size:12px">— DRAFT, NOT FOR SITE USE</span>` : ""}</div>
    <div style="padding:12px">
      <div style="font-weight:800;font-size:12px;color:#B3261E;letter-spacing:.05em;margin-bottom:3px">WHAT WILL KILL YOU HERE</div>
      ${kill ? `<ol style="margin:0 0 4px 16px;padding:0">${kill}</ol>${more}` : `<div style="font-size:12px;color:#5A646E">No HRCW selected for this job yet.</div>`}
      <div style="font-weight:800;font-size:12px;letter-spacing:.05em;margin:10px 0 3px">STOP WORK IF</div>
      <div style="font-size:12px">${stop}</div>
      <div style="font-weight:800;font-size:12px;letter-spacing:.05em;margin:10px 0 3px">IF SOMETHING HAPPENS</div>
      ${emerg}
      <div style="font-size:11px;font-style:italic;color:#10151C;margin-top:8px">Stop the work if a control isn't there. No one will be disadvantaged for stopping the work.</div>
    </div>
  </div>`;
}

/**
 * @param {object} p  { job, company, pack, modules }  modules = swms_templates rows (content_json) for the
 *   selected codes. pack = carpentry_whs_packs record. Returns the composed pack HTML string.
 */
export function composeWhsPack({ job = {}, company = {}, pack = {}, modules = [] }) {
  const byCode = Object.fromEntries(modules.map((m) => [m.module_code, m]));
  const a = pack.answers || {};
  const sel = pack.selected_controls || {};
  const hrcw = (pack.selected_hrcw || []).map((code) => byCode[code]).filter(Boolean);
  const task = (pack.selected_task || []).map((code) => byCode[code]).filter(Boolean);
  // A selected code with no matching template row (deleted/renamed in the register) must NOT silently
  // vanish from a liability document — force DRAFT and shout about it.
  const missing = [...(pack.selected_hrcw || []), ...(pack.selected_task || [])].filter((code) => !byCode[code]);
  const allReviewed = [...hrcw, ...task].every((m) => m.review_status === "reviewed");
  const draft = pack.review_status !== "issued" || !allReviewed || missing.length > 0;
  const siteAddress = [a.addressStreet, a.addressSuburb, a.addressPostcode].filter(Boolean).join(", ") || job.address;
  const pastDue = pack.review_status === "issued" && pack.review_due_at && new Date(pack.review_due_at) < new Date();

  const draftBanner = draft
    ? `<div style="background:#fff3cd;border:1px solid #ffe08a;color:#5a4500;padding:8px 10px;font-weight:700;margin-bottom:10px">⚠️ DRAFT — NOT FOR SITE USE. Not all modules are reviewed / the pack is not approved. Do not rely on this on site.</div>`
    : "";
  const missingBanner = missing.length
    ? `<div style="background:#fde8e8;border:1px solid #f5b5b5;color:#7a1616;padding:8px 10px;font-weight:700;margin-bottom:10px">⚠️ MISSING MODULE(S): ${missing.map(esc).join(", ")} — selected for this job but no longer in the register. Fix the pack selection before issuing.</div>`
    : "";

  const ppe = resolvePpe([...hrcw, ...task], a);
  const ppeMatrix = Object.keys(ppe).length
    ? `<table style="width:100%;border-collapse:collapse;font-size:12px"><tr style="background:#111;color:#fff"><td style="padding:4px">PPE item</td><td style="padding:4px">Requirement</td></tr>${Object.entries(ppe).map(([item, v]) => `<tr><td style="border:1px solid #ccc;padding:4px">${esc(item)}</td><td style="border:1px solid #ccc;padding:4px">${esc(v)}</td></tr>`).join("")}</table>`
    : `<div style="font-size:12px;color:#777">PPE not yet resolved.</div>`;

  return `
  <div style="font-family:Lato,Arial,sans-serif;color:#111;max-width:820px">
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #006c9b;padding-bottom:6px">
      <div style="font-size:18px;font-weight:800;color:#006c9b">BLUE LEAF BUILDING</div>
      <div style="font-size:13px;text-align:right"><b>Site WHS Pack</b><br>v${esc(pack.version || 1)} · ${esc(pack.review_status || "draft")}</div>
    </div>
    ${draftBanner}
    ${missingBanner}

    ${renderTagBlock({ siteAddress, job, pack, company, draft, pastDue })}

    ${renderSiteCard({ hrcw, sel, a, company, draft })}

    ${bar("PART 1 — COMBINED HRCW SAFE WORK METHOD STATEMENT")}
    ${kv([
      ["Company", company.name || "Blue Leaf Building"],
      ["ABN", company.abn],
      ["Site address", siteAddress],
      ["Job / reference", `${job.reference || ""} — ${job.projectType || ""}`],
      ["Principal contractor", a.principalContractor || (a.isPrincipalContractor ? "Blue Leaf Building (PC)" : "")],
      ["PC's WHS management plan (ref)", a.pcPlanRef],
      ["Other PCBUs on site + coordination (Act s46)", a.otherPcbus],
      ["Site supervisor (installs/verifies controls)", a.supervisor],
      ["Prepared", a.datePrepared],
    ])}

    <div style="font-weight:700;margin:12px 0 4px">HRCW identified for this job</div>
    ${hrcw.length ? hrcw.map((m) => moduleBlock(m, sel[m.module_code], 1, (a.justifications || {})[m.module_code])).join("") : `<div style="font-size:12px;color:#777">No HRCW selected — confirm the questionnaire.</div>`}

    <div style="font-weight:700;margin:12px 0 4px">Compliance &amp; stop-work (WHS Reg 300)</div>
    <div style="font-size:12px;border:1px solid #ccc;padding:8px;background:#fafafa">This work is carried out in accordance with this SWMS. If any person becomes aware the work is not being carried out in accordance with it, or a control is not adequately controlling the risk, <b>the HRCW stops immediately</b> and does not resume until the work complies or the SWMS is revised. Any worker may stop the work; no worker will be disadvantaged for doing so.</div>

    ${bar("▓ DIVIDER — END OF SWMS ▓  PART 2 — TASK-CONTROL MODULES (NOT HRCW)")}
    ${task.length ? task.map((m) => moduleBlock(m, sel[m.module_code], 2, (a.justifications || {})[m.module_code])).join("") : `<div style="font-size:12px;color:#777">No task modules selected.</div>`}

    ${bar("PART 3 — SITE IMPLEMENTATION RECORD")}
    <div style="font-weight:700;margin:8px 0 4px">Site PPE</div>
    ${ppeMatrix}
    <div style="font-weight:700;margin:12px 0 4px">Emergency</div>
    ${kv([
      ["Nearest hospital / medical", a.hospital],
      ["First aider on site", a.firstAider],
      ["First-aid qualification expiry", a.firstAiderExpiry],
      ["First-aid kit location", a.firstAidKit],
      ["Fire extinguisher location", a.fireExtinguisher],
      ["Muster point", a.musterPoint],
    ])}
    ${a.fallArrestInUse ? `
    <div style="font-weight:700;margin:12px 0 4px;color:#7a1616">Fall-arrest rescue plan (arrest in use on this job)</div>
    ${kv([
      ["Ground-clearance calculation (calc vs available)", a.groundClearance],
      ["Anchor type + rating", a.anchorType],
      ["Installed / verified by (competent person)", a.anchorInstaller],
      ["Harness / lanyard inspection date", a.harnessInspection],
      ["Rescue method", a.rescueMethod],
      ["Nominated rescuer on site", a.rescuer],
      ["Rescue equipment + location", a.rescueEquipment],
    ])}` : ""}
    ${renderSiteConditions(a)}
    <div style="font-weight:700;margin:12px 0 4px">Consultation (prepared with the workers — Act ss47–49)</div>
    ${kv([
      ["Toolbox discussion", (pack.consultation && pack.consultation.summary) || a.consultationSummary],
      ["Workers consulted", a.consultationNames],
      ["Date / method", a.consultationDate],
    ])}
    <div style="font-weight:700;margin:12px 0 4px">Document control</div>
    ${kv([
      ["Version", `v${pack.version || 1}`],
      ["Reviewer (competent person)", pack.reviewed_by],
      ["Reviewer sign-off date", pack.reviewed_at ? fmtDate(pack.reviewed_at) : ""],
      ["Scheduled review due", fmtDate(pack.review_due_at)],
    ])}
    <div style="font-weight:700;margin:12px 0 4px">Sign-on</div>
    <div style="font-size:11px;color:#444">Workers sign this pack version in the field app, confirming it was discussed and understood. A material change bumps the version and requires re-consultation + re-signature.</div>
    <div style="font-size:11px;color:#777;margin-top:10px">Pack version ${esc(pack.version || 1)} · generated ${fmtDate(new Date())} · Blue Leaf Building${draft ? ". DRAFT until a competent WHS reviewer approves." : ""}</div>
  </div>`;
}
