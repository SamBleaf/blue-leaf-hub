import { resolveTradeLabel, resolveTradeTemplates } from "./tradeTemplates";
import { getTradeRegistry } from "./rfqTradeRegistry.js";
import { bulletsFromTradeNote, emptyTradeNote } from "./rfqExtraction.js";

/** Energy / compliance overview — not trade scope bullets. */
const OVERVIEW_PATTERNS =
  /\b(nathers|hers\b|star\s*rating|energy\s*rating|bess|thermal\s*bridge|thermal\s*performance|glazing\s*spec|window\s*u-?value|u-value|solar\s*gain|climate\s*zone|bca\s*energy)\b/i;

function stripFurthermore(s) {
  return String(s).replace(/\bFurthermore\b[,;:]?\s*/gi, "").trim();
}
function stripEnsureThatPrefix(s) {
  return String(s).replace(/^Ensure that\s+/i, "").trim();
}

/** Project blurb or site context — not an actionable scope line. */
function isProjectOverviewBullet(t) {
  const s = String(t).trim();
  if (!s) return true;
  if (OVERVIEW_PATTERNS.test(s)) return true;
  const lower = s.toLowerCase();
  if (/\bdwellings?\b/.test(lower) && (/\d+\s*m[²2]/.test(lower) || /\b(on|at)\b[^.]{0,40}\bsite\b/i.test(lower))) return true;
  if (/^(two|dual|multiple|single)\s+dwellings?\b/i.test(s) && /site|lot|m[²2]|\/\s*\d+/i.test(s)) return true;
  if (/\b(site|lot)\s+(is|of|area)\b/i.test(lower) && /\d+\s*m[²2]/i.test(lower) && !/\b(excavat|concret|plumb|electr|roof|tile|lin)/i.test(lower)) return true;
  if (/\brl\s*[~≈]?\s*\d+[\d.]*\b/i.test(s)) return true;
  if (/\bexisting\s+ground\s+levels?\b/i.test(lower)) return true;
  if (/\bsite\s+falls?\b/i.test(lower) && !/\bexcavat|cut|fill|retaining\b/i.test(lower)) return true;
  if (/\bvisit\s+site\b|\bsite\s+visit\b|\bsite\s+inspect/i.test(lower)) return true;
  if (/\battached\s+for\s+information\b|\bfor\s+information\s+only\b/i.test(lower)) return true;
  if (/\ballowance\s+to\s+be\s+made\s+for\s+unspecified\b/i.test(lower)) return true;
  return false;
}

/**
 * Drop truncated / continuation fragments so half-sentences never ship — e.g.
 * "Install smoke alarms hardwired to", "Provide certification of compliance with",
 * or a continuation line like "tiles) not provided" / "and decking".
 */
function isFragmentBullet(t) {
  const s = String(t).trim();
  if (!s) return true;
  if (/^(and|or|tiles?\))\b/i.test(s)) return true;                       // continuation of a split line
  if (/^\)/.test(s)) return true;                                          // starts with a stray close-bracket
  if (/\b(to|with|per|and|or|for|of|the|a|an|including|as|at)\s*$/i.test(s)) return true; // dangling end
  if (/\(\s*$/.test(s)) return true;                                       // ends with an open bracket
  return false;
}

function uniqueBullets(lines, max) {
  const out = [];
  const seen = new Set();
  for (const line of lines) {
    let t = String(line).trim();
    if (!t) continue;
    t = stripFurthermore(t);
    t = stripEnsureThatPrefix(t);
    if (isProjectOverviewBullet(t)) continue;
    if (isFragmentBullet(t)) continue;
    if (!t) continue;
    const lower = t.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function greetingLine(contactName) {
  const n = contactName?.trim();
  if (!n || n.toLowerCase() === "there") return "Hi there,";
  return `Hi ${n},`;
}

function defaultSignatureFallback() {
  return ["Sam Morris", "Director – Blue Leaf Building"].join("\n");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Safe data-URL for <img src> (JPEG/PNG only; reject other schemes). */
function isSafeInlineImageDataUrl(url) {
  const u = String(url || "").trim().replace(/\s/g, "");
  const m = u.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!m?.[2]) return false;
  const b64 = m[2];
  if (b64.length > 4_500_000) return false;
  return /^[A-Za-z0-9+/=_-]*$/.test(b64);
}

/** Convert plain RFQ body to HTML; optional logo <img> before "Kind regards,". */
export function plainBodyToHtml(plainBody, logoDataUrl) {
  const logo = String(logoDataUrl || "").trim();
  const showLogo = logo && isSafeInlineImageDataUrl(logo);
  const text = plainBody.replace(/\r\n/g, "\n");

  const kgIdx = text.lastIndexOf("Kind regards,");
  let main = text;
  let sig = "";
  if (kgIdx >= 0) {
    main = text.slice(0, kgIdx).replace(/\s+$/, "");
    sig = text.slice(kgIdx);
  }

  function blockToHtml(block) {
    const lines = block.split("\n");
    const parts = [];
    let inUl = false;
    for (const line of lines) {
      if (line.startsWith("• ")) {
        if (!inUl) {
          parts.push('<ul style="margin:0.4em 0;padding-left:1.25em;">');
          inUl = true;
        }
        parts.push(`<li style="margin:0.2em 0;">${escapeHtml(line.slice(2))}</li>`);
      } else {
        if (inUl) {
          parts.push("</ul>");
          inUl = false;
        }
        if (line === "") parts.push("<br />");
        else parts.push(`<p style="margin:0.35em 0;">${escapeHtml(line)}</p>`);
      }
    }
    if (inUl) parts.push("</ul>");
    return parts.join("");
  }

  let inner = `${blockToHtml(main)}${blockToHtml(sig)}`;
  if (showLogo) {
    if (/<p[^>]*>\s*Kind regards,\s*<\/p>/i.test(inner)) {
      inner = inner.replace(
        /(<p[^>]*>)(\s*Kind regards,\s*)(<\/p>)/i,
        `<div style="margin:14px 0 10px;"><img src="${logo}" alt="" width="160" style="max-width:200px;height:auto;border:0;display:block;" /></div>$1$2$3`
      );
    } else if (inner.includes("Kind regards,")) {
      inner = inner.replace(
        /Kind regards,/i,
        `<div style="margin:14px 0 10px;"><img src="${logo}" alt="" width="160" style="max-width:200px;height:auto;border:0;display:block;" /></div>Kind regards,`
      );
    } else {
      inner += `<div style="margin:14px 0 10px;"><img src="${logo}" alt="" width="160" style="max-width:200px;height:auto;border:0;display:block;" /></div>`;
    }
  }
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.45;color:#111;">${inner}</div>`;
}

/** Clean, professional subject — "RFQ — Carpentry — 9 Charles St, Norwood SA". No date (it's in the body). */
function buildSubject({ label, addr }) {
  return { subject: `RFQ — ${label} — ${addr}`, variant: "clean" };
}

/**
 * Lean, document-led RFQ email.
 *
 * Philosophy: lead with the document set (the drawings ARE the scope), give a
 * HIGH-LEVEL package summary, ask the standard commercial questions, and never
 * enumerate/invent detailed scope. This avoids the two failure modes of the old
 * format (fragmented scope bullets + the whole project blurb dumped into every
 * trade's "assumptions").
 *
 * @param {object}   p
 * @param {string}   p.contactName
 * @param {string}   p.projectAddress
 * @param {string}   p.tradeId
 * @param {object}   p.tradeNote          extracted trade note (high-level scope + missing items)
 * @param {string}   p.dropboxLink
 * @param {string}   p.deadlineLabel
 * @param {string}   p.signatureFooter    user's stored signature (incl. confidentiality footer)
 * @param {string}   [p.logoDataUrl]
 * @param {Array}    [p.documents]        [{ category, name, pages }] — rendered as "Documents included" if present
 * @param {string|string[]} [p.projectOverview]  brief overview lines (NOT the verbose blurb)
 */
export function composeRfqEmail({
  contactName,
  projectAddress,
  tradeId,
  tradeNote,
  dropboxLink,
  deadlineLabel,
  signatureFooter,
  logoDataUrl,
  documents,
  projectOverview
}) {
  const label = resolveTradeLabel(tradeId);
  const note = tradeNote && typeof tradeNote === "object" ? tradeNote : emptyTradeNote();
  const tradeConfig = getTradeRegistry().byId[tradeId] || {};

  // High-level "generally includes" — a short package summary, not exhaustive scope.
  let scopeBullets = uniqueBullets(bulletsFromTradeNote(note), 8);
  if (scopeBullets.length === 0) {
    scopeBullets =
      resolveTradeTemplates(tradeId)?.scopeBullets?.filter(Boolean) ||
      tradeConfig.scope_bullets ||
      [`${label} package per the project documentation`];
  }
  scopeBullets = scopeBullets.slice(0, 6);

  const addr = projectAddress?.trim() || "[project address]";
  const docs = dropboxLink?.trim() || "[add Dropbox link]";
  const deadline = deadlineLabel?.trim() || "[deadline]";

  const docList = Array.isArray(documents) ? documents.filter((d) => d && d.name) : [];
  const overviewLines = Array.isArray(projectOverview)
    ? projectOverview.map((l) => String(l).trim()).filter(Boolean)
    : (typeof projectOverview === "string" && projectOverview.trim() ? [projectOverview.trim()] : []);
  const hasMissing = (note.missing_items || []).length > 0;

  const sig = (signatureFooter && signatureFooter.trim()) || defaultSignatureFallback();
  const sigLines = sig.split("\n");

  const parts = [];
  parts.push(greetingLine(contactName));
  parts.push("");
  parts.push(`We are seeking your quotation for the ${label} package at ${addr}.`);
  parts.push("");
  parts.push("The package generally includes but not limited to:");
  scopeBullets.forEach((b) => parts.push(`• ${b}`));
  parts.push("");
  parts.push("Please refer to the project documentation for the full extent of works.");
  parts.push("");
  parts.push(`Project documentation: ${docs}`);

  if (docList.length) {
    parts.push("");
    parts.push("Documents included:");
    const byCat = new Map();
    for (const d of docList) {
      const cat = String(d.category || "Documents").trim();
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(d);
    }
    for (const [cat, items] of byCat) {
      parts.push(cat);
      items.forEach((d) => {
        const n = Number(d.pages);
        const pg = n > 0 ? ` (${n} page${n === 1 ? "" : "s"})` : "";
        parts.push(`• ${String(d.name).trim()}${pg}`);
      });
    }
  }

  if (overviewLines.length) {
    parts.push("");
    parts.push("Project overview:");
    overviewLines.slice(0, 4).forEach((l) => parts.push(`• ${l}`));
  }

  parts.push("");
  parts.push("Please provide:");
  parts.push("• Lump sum price ex GST");
  parts.push("• Availability and estimated start");
  parts.push("• Estimated duration and lead time");
  parts.push("• List of exclusions and assumptions");
  if (hasMissing) {
    parts.push("• Where any selections or details are not yet confirmed, allow a provisional sum and note your assumption clearly");
  }

  parts.push("");
  parts.push(`Submission date: please return your quotation by ${deadline}.`);
  parts.push("");
  parts.push("Should you require any clarification or additional information, please contact us.");
  parts.push("");
  parts.push(...sigLines);

  const body = parts.join("\n").trim();
  const { subject, variant } = buildSubject({ label, addr });
  const logo = String(logoDataUrl || "").trim();
  const html = logo && isSafeInlineImageDataUrl(logo) ? plainBodyToHtml(body, logo) : undefined;
  return { subject, subjectVariant: variant, body, html };
}
