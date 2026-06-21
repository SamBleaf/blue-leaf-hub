// Shared branded HTML email layout for Blue Leaf Hub client-facing emails.
//
// Email clients are not browsers: stick to tables + inline styles, no flexbox/grid,
// no external CSS. Keep it simple and robust. Brand tokens mirror the app:
//   primary #006C9B · ink #2B2B2B · muted #64748B · hairline #E2E8F0 · page #F4F7F8

const BRAND = {
  primary: "#006C9B",
  ink: "#2B2B2B",
  muted: "#64748B",
  hairline: "#E2E8F0",
  page: "#F4F7F8",
};

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// rows: array of [label, value] pairs. Returns an HTML table string.
export function detailTable(rows = []) {
  const trs = rows
    .filter(Boolean)
    .map(([label, value, opts = {}]) => {
      const strong = opts.strong ? "font-weight:700;" : "";
      return `<tr>
        <td style="padding:6px 0;color:${BRAND.muted};font-size:14px;vertical-align:top;width:45%">${esc(label)}</td>
        <td style="padding:6px 0;color:${BRAND.ink};font-size:14px;${strong}text-align:right">${esc(value)}</td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0">${trs}</table>`;
}

// Optional payment-details block. bank = { accountName, bsb, accountNumber }.
export function paymentBlock(bank) {
  if (!bank || (!bank.bsb && !bank.accountNumber)) return "";
  const rows = [
    bank.accountName ? ["Account name", bank.accountName] : null,
    bank.bsb ? ["BSB", bank.bsb] : null,
    bank.accountNumber ? ["Account number", bank.accountNumber] : null,
  ].filter(Boolean);
  return `<div style="background:${BRAND.page};border:1px solid ${BRAND.hairline};border-radius:8px;padding:14px 16px;margin:16px 0">
    <p style="margin:0 0 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${BRAND.primary}">Payment details</p>
    ${detailTable(rows)}
  </div>`;
}

/**
 * Wrap body content in the branded shell.
 * @param {{title:string, bodyHtml:string, pixelUrl?:string}} opts
 */
export function emailShell({ title, bodyHtml, pixelUrl }) {
  const pixel = pixelUrl
    ? `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="">`
    : "";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.page};color:${BRAND.ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.page};padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${BRAND.hairline};border-radius:12px;overflow:hidden">
        <tr><td style="background:${BRAND.primary};padding:18px 24px">
          <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.02em">Blue Leaf Building</span>
        </td></tr>
        <tr><td style="padding:24px">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid ${BRAND.hairline};background:#ffffff">
          <p style="margin:0;color:${BRAND.muted};font-size:12px;line-height:1.5">
            Blue Leaf Building · Payment enquiries: <a href="mailto:accounts@blueleafbuilding.com.au" style="color:${BRAND.primary}">accounts@blueleafbuilding.com.au</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${pixel}
</body></html>`;
}
