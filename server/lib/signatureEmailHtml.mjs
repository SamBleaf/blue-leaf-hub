/** Build optional HTML wrapper for plain-text emails (footer + optional data-URI logo). */

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
