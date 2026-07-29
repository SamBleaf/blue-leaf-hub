// swmsRender.mjs — render a structured WHS control module (content_json) into the finished-document
// HTML. content_json is the source of truth (authored in Settings, plain-english); content_html is
// derived from it on every save so the worker field sheet + previews stay in sync. No raw HTML is
// ever hand-edited. Pure, no DB, no side effects.

const HOC = { 1: "Eliminate", 2: "Substitute", 3: "Isolate", 4: "Engineering", 5: "Administrative", 6: "PPE" };
const PPE_FLAG = { R: "mandatory", C: "conditional", S: "recommended", NA: "not applicable" };

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Render one module's content_json to finished-doc HTML. Accepts a partial object; skips empty parts. */
export function renderSwmsModuleHtml(content) {
  const c = content || {};
  const out = [];
  if (c.activity) out.push(`<h3>Activity</h3><p>${esc(c.activity)}</p>`);
  if (c.hazard) out.push(`<h3>Key hazards</h3><p>${esc(c.hazard)}</p>`);
  if (c.trigger) out.push(`<h3>When this applies</h3><p>${esc(c.trigger)}</p>`);

  const controls = Array.isArray(c.controlOptions) ? c.controlOptions : [];
  if (controls.length) {
    const rows = controls
      .map((x) => `<li><b>L${esc(x.level)} ${esc(HOC[x.level] || "")}:</b> ${esc(x.text)}</li>`)
      .join("");
    out.push(`<h3>Controls — select what is actually installed (hierarchy order)</h3><ol>${rows}</ol>`);
  }

  const ppe = Array.isArray(c.ppeRules) ? c.ppeRules : [];
  if (ppe.length) {
    const rows = ppe
      .map((p) => `<li>${esc(p.item)} — <b>${esc(PPE_FLAG[p.flag] || p.flag)}</b>${p.condition ? ` <span>(${esc(p.condition)})</span>` : ""}</li>`)
      .join("");
    out.push(`<h3>PPE</h3><ul>${rows}</ul>`);
  }

  if (c.monitorReview) out.push(`<h3>Monitor &amp; review</h3><p>${esc(c.monitorReview)}</p>`);

  const resp = [
    c.responsibleInstall ? `<b>Install / verify:</b> ${esc(c.responsibleInstall)}` : "",
    c.responsibleUse ? `<b>Use:</b> ${esc(c.responsibleUse)}` : "",
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");
  if (resp) out.push(`<h3>Responsible</h3><p>${resp}</p>`);

  const refs = Array.isArray(c.sourceRefs) ? c.sourceRefs.filter(Boolean) : [];
  if (refs.length) out.push(`<p><em>Sources: ${refs.map(esc).join(", ")}</em></p>`);
  if (c.note) out.push(`<p><em>Note: ${esc(c.note)}</em></p>`);

  return out.join("\n");
}
