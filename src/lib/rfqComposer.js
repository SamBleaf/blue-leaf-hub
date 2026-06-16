import { resolveTradeLabel, resolveTradeTemplates } from "./tradeTemplates";
import { getTradeRegistry } from "./rfqTradeRegistry.js";
import { bulletsFromTradeNote, emptyTradeNote } from "./rfqExtraction.js";

const MAX_BODY_LINES = 40;

/** Energy / compliance overview — not trade scope bullets. */
const OVERVIEW_PATTERNS =
  /\b(nathers|hers\b|star\s*rating|energy\s*rating|bess|thermal\s*bridge|thermal\s*performance|glazing\s*spec|window\s*u-?value|u-value|solar\s*gain|climate\s*zone|bca\s*energy)\b/i;

/** Match standard citations (for optional last bullet only). */
const STANDARD_REF_PATTERNS = [
  /\bAS\/NZS\s*[\d]+(?:\.[\d]+)?\b/gi,
  /\bAS\s*[\d]+(?:\.[\d]+){0,2}\b/gi
];

function stripFurthermore(s) {
  return String(s)
    .replace(/\bFurthermore\b[,;:]?\s*/gi, "")
    .trim();
}

function stripEnsureThatPrefix(s) {
  return String(s).replace(/^Ensure that\s+/i, "").trim();
}

/** Project blurb or site context — not an actionable pricing line. */
function isProjectOverviewBullet(t) {
  const s = String(t).trim();
  if (!s) return true;
  if (OVERVIEW_PATTERNS.test(s)) return true;
  const lower = s.toLowerCase();
  // Dwelling count + site area blurbs
  if (/\bdwellings?\b/.test(lower) && (/\d+\s*m[²2]/.test(lower) || /\b(on|at)\b[^.]{0,40}\bsite\b/i.test(lower))) return true;
  if (/^(two|dual|multiple|single)\s+dwellings?\b/i.test(s) && /site|lot|m[²2]|\/\s*\d+/i.test(s)) return true;
  if (/\b(site|lot)\s+(is|of|area)\b/i.test(lower) && /\d+\s*m[²2]/i.test(lower) && !/\b(excavat|concret|plumb|electr|roof|tile|lin)/i.test(lower)) return true;
  // RL / reduced level data lines
  if (/\brl\s*[~≈]?\s*\d+[\d.]*\b/i.test(s)) return true;
  // Site conditions / existing levels that aren't pricing actions
  if (/\bexisting\s+ground\s+levels?\b/i.test(lower)) return true;
  if (/\bsite\s+falls?\b/i.test(lower) && !/\bexcavat|cut|fill|retaining\b/i.test(lower)) return true;
  // Administrative instructions
  if (/\bvisit\s+site\b|\bsite\s+visit\b|\bsite\s+inspect/i.test(lower)) return true;
  if (/\battached\s+for\s+information\b|\bfor\s+information\s+only\b/i.test(lower)) return true;
  if (/\ballowance\s+to\s+be\s+made\s+for\s+unspecified\b/i.test(lower)) return true;
  return false;
}

function extractStandardRefsFromText(text) {
  const src = String(text);
  const found = [];
  const seen = new Set();
  for (const re of STANDARD_REF_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const norm = m[0].replace(/\s+/g, " ").trim();
      const key = norm.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        found.push(norm);
      }
    }
  }
  return found.slice(0, 3);
}

function lastBulletLooksLikeCompliance(bullets) {
  const last = bullets[bullets.length - 1] || "";
  return /\b(AS\/NZS|AS\s*\d|comply\s+with\s+AS)/i.test(last);
}

/** Append one short compliance bullet if standards appear in extraction and not already last. */
function ensureStandardLastBullet(bullets, rawNoteText) {
  const refs = extractStandardRefsFromText(rawNoteText);
  if (!refs.length) return bullets;
  if (lastBulletLooksLikeCompliance(bullets)) return bullets;
  return [...bullets, `All works to comply with ${refs.join(" & ")}`];
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

/**
 * RFQ email — scope from trade_notes.scope_summary + specific_items (• lines).
 * AS standard as last scope bullet when applicable — no separate compliance block.
 */
function sectionLines(title, lines, max = 8) {
  const items = (lines || []).map((l) => String(l).trim()).filter(Boolean).slice(0, max);
  if (!items.length) return [];
  return [title, ...items.map((b) => `• ${b}`)];
}

/** Stable 32-bit hash → used to assign an A/B subject variant deterministically per recipient. */
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Two subject lines under test for subcontractor reply rates:
 *   A — trade-led statement (good for inbox scanning by trade)
 *   B — direct question ("Can you price …?") + first-name where known (higher open/reply intent)
 * Returns { subject, variant }. Pass variant "A" | "B" to force; "auto" (default) picks a
 * stable variant from a per-recipient seed so each subbie always gets the same one.
 */
function buildSubject({ variant, label, addr, deadline, contactName }) {
  const v =
    variant === "A" || variant === "B"
      ? variant
      : hashSeed(`${contactName || ""}|${addr}|${label}`) % 2 === 0
        ? "A"
        : "B";
  if (v === "B") {
    const first = contactName?.trim()?.split(/\s+/)[0];
    const lead = first && first.toLowerCase() !== "there" ? `${first}, can` : "Can";
    return { subject: `${lead} you price ${label} at ${addr}? (by ${deadline})`, variant: "B" };
  }
  return { subject: `${label} quote — ${addr} (price by ${deadline})`, variant: "A" };
}

export function composeRfqEmail({
  contactName,
  projectAddress,
  tradeId,
  tradeNote,
  dropboxLink,
  deadlineLabel,
  signatureFooter,
  logoDataUrl,
  subjectVariant = "auto"
}) {
  const label = resolveTradeLabel(tradeId);
  const note = tradeNote && typeof tradeNote === "object" ? tradeNote : emptyTradeNote();
  const tradeConfig = getTradeRegistry().byId[tradeId] || {};

  let scopeBullets = uniqueBullets(bulletsFromTradeNote(note), 10);
  if (scopeBullets.length === 0) {
    scopeBullets =
      resolveTradeTemplates(tradeId)?.scopeBullets?.filter(Boolean) ||
      tradeConfig.scope_bullets ||
      [`${label} package per tender drawings and specifications.`];
  }

  const standards = note.standards?.length
    ? note.standards.slice(0, 1)
    : ensureStandardLastBullet([], [note.scope_summary, ...(note.specific_items || [])].join("\n")).slice(-1);

  const addr = projectAddress?.trim() || "[project address]";
  const docs = dropboxLink?.trim() || "[add Dropbox link]";
  const deadline = deadlineLabel?.trim() || "[deadline]";
  const opener =
    tradeConfig.email_opener || `We are seeking your price for the ${label} package`;

  const sig = (signatureFooter && signatureFooter.trim()) || defaultSignatureFallback();
  const sigLines = sig.split("\n");

  function assemble(bulletCount) {
    const bullets = scopeBullets.slice(0, bulletCount);
    const parts = [];
    parts.push(greetingLine(contactName));
    parts.push("");
    parts.push(`${opener} at ${addr}, and I'd genuinely appreciate you taking a look.`);
    parts.push("");
    parts.push(
      `What I need: a lump sum price ex GST, back to me by ${deadline}. Just reply straight to this email — whatever format suits you is fine.`
    );
    parts.push("");
    parts.push(`Tender documents: ${docs}`);
    parts.push("");
    parts.push(...sectionLines("Scope of works", bullets, bulletCount));
    if (note.confirm_items?.length) {
      parts.push("");
      parts.push(...sectionLines("Please confirm inclusion of the following in your price", note.confirm_items, 4));
    }
    if (note.assumptions?.length) {
      parts.push("");
      parts.push(...sectionLines("Assumptions / site conditions", note.assumptions, 6));
    }
    if (standards.length) {
      parts.push("");
      parts.push(...sectionLines("General requirements", standards, 1));
    }
    if (note.tender_requirements?.length) {
      parts.push("");
      parts.push(...sectionLines("Tender requirements", note.tender_requirements, 4));
    }
    if (note.submission_requirements?.length) {
      parts.push("");
      parts.push(...sectionLines("Submission requirements", note.submission_requirements, 4));
    }
    if (note.missing_items?.length) {
      parts.push("");
      parts.push("⚠ Missing information (please confirm or allow in your price):");
      note.missing_items.slice(0, 5).forEach((m) => parts.push(`• ${m}`));
    }
    parts.push("");
    parts.push(
      `Even if this one isn't for you, a quick "not this time" really helps — I'll keep you top of the list for the next job that fits.`
    );
    parts.push("Any questions at all, just reply here or give me a call.");
    parts.push("");
    parts.push(...sigLines);
    return parts.join("\n");
  }

  let used = scopeBullets.length;
  let body = assemble(used);

  for (;;) {
    const lines = body.split("\n");
    if (lines.length <= MAX_BODY_LINES) break;
    if (used > 1) {
      used -= 1;
      body = assemble(used);
      continue;
    }
    break;
  }

  const { subject, variant } = buildSubject({
    variant: subjectVariant,
    label,
    addr,
    deadline,
    contactName
  });
  const logo = String(logoDataUrl || "").trim();
  const html =
    logo && isSafeInlineImageDataUrl(logo) ? plainBodyToHtml(body, logo) : undefined;
  return { subject, subjectVariant: variant, body, html };
}
