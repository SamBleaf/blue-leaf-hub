/** Build optional HTML wrapper with inline logo + footer (matches RFQ-style emails). */

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

/**
 * @param {string} bodyText — main message (plain)
 * @param {{ footerText?: string, logoDataUrl?: string }} sig
 */
export function wrapPlainTextEmailHtml(bodyText, sig = {}) {
  const footer = String(sig.footerText || "").trim();
  const logo = String(sig.logoDataUrl || "").trim();
  const showLogo = logo && isSafeInlineImageDataUrl(logo);
  const main = escapeHtml(String(bodyText || "")).replace(/\r\n/g, "\n").replace(/\n/g, "<br />");
  const foot = footer ? escapeHtml(footer).replace(/\n/g, "<br />") : "";
  const logoBlock = showLogo
    ? `<div style="margin:14px 0 10px;"><img src="${logo}" alt="" width="160" style="max-width:200px;height:auto;border:0;display:block;" /></div>`
    : "";
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.45;color:#111;">${main}${logoBlock}${foot ? `<div style="margin-top:12px;">${foot}</div>` : ""}</div>`;
}
