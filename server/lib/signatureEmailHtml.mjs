/** Build optional HTML wrapper with inline logo + footer (matches RFQ-style emails). */
import fs from "node:fs";
import path from "node:path";

// The full Blue Leaf Building logo (same asset the PO PDFs use), read once from disk + cached.
let _emailLogoBuf; // undefined = not tried; Buffer = loaded; null = unavailable
function loadEmailLogoBuffer() {
  if (_emailLogoBuf !== undefined) return _emailLogoBuf;
  try { _emailLogoBuf = fs.readFileSync(path.resolve("public/brand/logo-black.png")); }
  catch { _emailLogoBuf = null; }
  return _emailLogoBuf;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isSafeInlineImageDataUrl(url) {
  const u = String(url || "").trim().replace(/\s/g, "");
  const m = u.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!m?.[2]) return false;
  if (m[2].length > 4_500_000) return false;
  return /^[A-Za-z0-9+/=_-]*$/.test(m[2]);
}

export const EMAIL_LOGO_CID = "blb-logo";

/**
 * The company logo for sales emails, as a CID-embedded inline attachment. Data-URIs get stripped by
 * Apple Mail/Gmail and hosted images depend on the client loading remote content — a CID attachment
 * travels WITH the email and renders in every client (we send via SMTP/nodemailer, which supports it).
 * Returns { imgHtml, attachment }; imgHtml is "" and attachment null if the logo file is unavailable.
 */
export function emailLogoInline() {
  const buf = loadEmailLogoBuffer();
  if (!buf) return { imgHtml: "", attachment: null };
  // Cap the size with a PIXEL max-width — Apple Mail ignores width:Npx but honours max-width, so a
  // % max-width blew the (3320px-wide) logo up to full width. 200px keeps it a tidy signature logo.
  return {
    imgHtml: `<div style="margin:14px 0 4px;"><img src="cid:${EMAIL_LOGO_CID}" alt="Blue Leaf Building" width="200" style="width:200px;max-width:200px;height:auto;border:0;display:block;" /></div>`,
    attachment: { filename: "blue-leaf-building.png", content: buf, cid: EMAIL_LOGO_CID, mimeType: "image/png" },
  };
}

/**
 * @param {string} bodyText — main message (plain)
 * @param {{ footerText?: string, logoDataUrl?: string, hiddenPreheader?: string }} sig
 *   hiddenPreheader — text emitted in a visually-hidden div (e.g. the RFQ Ref token) so it never
 *   shows to the reader but stays in the HTML source for reply-quote matching.
 */
export function wrapPlainTextEmailHtml(bodyText, sig = {}) {
  const footer = String(sig.footerText || "").trim();
  const logo = String(sig.logoDataUrl || "").trim();
  const hidden = String(sig.hiddenPreheader || "").trim();
  const showLogo = logo && isSafeInlineImageDataUrl(logo);
  const main = escapeHtml(String(bodyText || "")).replace(/\r\n/g, "\n").replace(/\n/g, "<br />");
  const foot = footer ? escapeHtml(footer).replace(/\n/g, "<br />") : "";
  const logoBlock = showLogo
    ? `<div style="margin:14px 0 10px;"><img src="${logo}" alt="" width="160" style="max-width:200px;height:auto;border:0;display:block;" /></div>`
    : "";
  // Emitted LAST (not as a leading preheader) so email clients never lift it as the inbox preview
  // snippet — it stays invisible in the opened email but present in the source for reply-quote matching.
  const hiddenBlock = hidden
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:0;line-height:0;color:transparent;mso-hide:all;">${escapeHtml(hidden)}</div>`
    : "";
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.45;color:#111;">${main}${logoBlock}${foot ? `<div style="margin-top:12px;">${foot}</div>` : ""}${hiddenBlock}</div>`;
}
